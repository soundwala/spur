import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { ScannedItem, Scope } from './types.js';
import { resolveDir } from './resolve.js';
import { realVersion, relSourcePath } from './fallback.js';
import { selfItem } from './self.js';
import { upsertEntries, pruneMissing } from './db.js';

export interface ScanOptions {
  /** Override for tests; defaults to the real home directory. */
  home?: string;
  /** Extra project roots to scan in addition to those discovered from ~/.claude.json. */
  projectRoots?: string[];
  /** Set false to skip reading project roots from ~/.claude.json. */
  discoverProjects?: boolean;
}

export interface ScanResult {
  scanned: number;
  removed: number;
  items: ScannedItem[];
}

/** Walk every known install location, upsert what's found, prune what's gone. */
export async function scan(db: DatabaseSync, opts: ScanOptions = {}): Promise<ScanResult> {
  const home = opts.home ?? homedir();
  const items: ScannedItem[] = [];

  items.push(...scanMarketplacePlugins(home));
  items.push(...(await scanSkillsDir(join(home, '.claude', 'skills'), 'user', null)));

  const roots = new Set(opts.projectRoots ?? []);
  if (opts.discoverProjects !== false) {
    for (const root of discoverProjectRoots(home)) roots.add(root);
  }
  for (const root of roots) {
    items.push(...(await scanSkillsDir(join(root, '.claude', 'skills'), 'project', root)));
    items.push(...scanCliManifest(root));
  }
  items.push(...scanCliManifest(home));

  const self = selfItem();
  if (self) items.push(self);

  // Two scanners can emit the same path (e.g. a project root that is also a
  // manifest location); last write wins is fine, but dedupe keeps counts honest.
  const byPath = new Map(items.map((it) => [it.install_path, it]));
  const deduped = [...byPath.values()];

  upsertEntries(db, deduped);
  const removed = pruneMissing(db, deduped.map((it) => it.install_path));
  return { scanned: deduped.length, removed, items: deduped };
}

/**
 * Marketplace installs are the richest source: installed_plugins.json records
 * scope, installPath, version and gitCommitSha per install (verified shape,
 * July 2026: plugins is keyed by "name@marketplace", each value an ARRAY).
 */
function scanMarketplacePlugins(home: string): ScannedItem[] {
  const pluginsFile = join(home, '.claude', 'plugins', 'installed_plugins.json');
  const marketplacesFile = join(home, '.claude', 'plugins', 'known_marketplaces.json');
  const manifest = readJson<{ plugins?: Record<string, unknown> }>(pluginsFile);
  if (!manifest?.plugins) return [];
  const marketplaces = readJson<Record<string, MarketplaceRecord>>(marketplacesFile) ?? {};

  const items: ScannedItem[] = [];
  for (const [key, records] of Object.entries(manifest.plugins)) {
    const [name, marketplaceName] = splitPluginKey(key);
    const installs = Array.isArray(records) ? records : [records];
    for (const rec of installs as PluginInstallRecord[]) {
      if (!rec?.installPath) continue;
      const marketplace = marketplaceName ? marketplaces[marketplaceName] : undefined;
      const source = resolvePluginSource(name, marketplace);
      items.push({
        name,
        type: 'plugin',
        install_method: 'marketplace',
        scope: rec.scope === 'project' ? 'project' : 'user',
        install_path: rec.installPath,
        project_path: null,
        source_url: source.url,
        source_ref: null,
        source_path: source.path,
        installed_commit: rec.gitCommitSha ?? null,
        // records without a sha often carry the literal version "unknown";
        // the installed copy's own plugin.json is the next-best witness
        installed_version: realVersion(rec.version) ?? installedPluginJsonVersion(rec.installPath),
        manifest_updated_at: rec.lastUpdated ?? null,
      });
    }
  }
  return items;
}

interface PluginInstallRecord {
  scope?: string;
  installPath?: string;
  version?: string;
  gitCommitSha?: string;
  lastUpdated?: string;
}

interface MarketplaceRecord {
  source?: { source?: string; repo?: string; url?: string };
  installLocation?: string;
}

function splitPluginKey(key: string): [string, string | null] {
  const at = key.lastIndexOf('@');
  return at > 0 ? [key.slice(0, at), key.slice(at + 1)] : [key, null];
}

/**
 * The plugin's true source repo: the marketplace's own marketplace.json may
 * point at an external repo per plugin; a relative source means the plugin
 * lives inside the marketplace repo itself (path returned so freshness can be
 * checked against commits touching just that subtree). Falls back to the
 * marketplace repo.
 */
function resolvePluginSource(
  pluginName: string,
  marketplace?: MarketplaceRecord,
): { url: string | null; path: string | null } {
  const mpUrl = marketplaceRepoUrl(marketplace);
  const catalogPath = marketplace?.installLocation
    ? join(marketplace.installLocation, '.claude-plugin', 'marketplace.json')
    : null;
  const catalog = catalogPath ? readJson<{ plugins?: Array<{ name?: string; source?: unknown }> }>(catalogPath) : null;
  const src = catalog?.plugins?.find((p) => p.name === pluginName)?.source;
  if (typeof src === 'string') {
    if (src.startsWith('.')) return { url: mpUrl, path: relSourcePath(src) };
    if (/^[\w.-]+\/[\w.-]+$/.test(src)) return { url: `https://github.com/${src}`, path: null };
    return { url: mpUrl, path: null };
  }
  if (src && typeof src === 'object') {
    const s = src as { source?: string; repo?: string; url?: string };
    if (s.source === 'github' && s.repo) return { url: `https://github.com/${s.repo}`, path: null };
    if (s.url) return { url: s.url, path: null };
  }
  return { url: mpUrl, path: null };
}

function installedPluginJsonVersion(installPath: string): string | null {
  const pkg = readJson<{ version?: string }>(join(installPath, '.claude-plugin', 'plugin.json'));
  return realVersion(pkg?.version);
}

function marketplaceRepoUrl(marketplace?: MarketplaceRecord): string | null {
  const src = marketplace?.source;
  if (!src) return null;
  if (src.source === 'github' && src.repo) return `https://github.com/${src.repo}`;
  return src.url ?? null;
}

/** Any subdirectory holding a SKILL.md counts as an installed skill. */
async function scanSkillsDir(dir: string, scope: Scope, projectPath: string | null): Promise<ScannedItem[]> {
  if (!existsSync(dir)) return [];
  const items: ScannedItem[] = [];
  for (const name of readdirSync(dir)) {
    const skillDir = join(dir, name);
    const skillMd = join(skillDir, 'SKILL.md');
    try {
      if (!statSync(skillDir).isDirectory() || !existsSync(skillMd)) continue;
    } catch {
      continue;
    }
    const raw = readFileSync(skillMd, 'utf8');
    const resolved = await resolveDir(skillDir);
    items.push({
      name: frontmatterName(raw) ?? name,
      type: 'skill',
      scope,
      install_path: skillDir,
      project_path: projectPath,
      content_hash: createHash('sha256').update(raw).digest('hex').slice(0, 16),
      ...resolved,
    });
  }
  return items;
}

/** agent-skills-cli style manifest; shape varies, so parse defensively. */
function scanCliManifest(root: string): ScannedItem[] {
  const manifestPath = join(root, '.claude-skills.json');
  const manifest = readJson<{ skills?: unknown[] } | unknown[]>(manifestPath);
  if (!manifest) return [];
  const list = Array.isArray(manifest) ? manifest : manifest.skills;
  if (!Array.isArray(list)) return [];
  const items: ScannedItem[] = [];
  for (const raw of list) {
    const s = raw as { name?: string; repo?: string; source?: string; path?: string; version?: string; commit?: string };
    const installPath = s.path ? join(root, s.path) : null;
    if (!s.name || !installPath) continue;
    const repo = s.repo ?? s.source;
    items.push({
      name: s.name,
      type: 'skill',
      install_method: 'cli-manifest',
      scope: 'project',
      install_path: installPath,
      project_path: root,
      source_url: repo ? (repo.includes('://') ? repo : `https://github.com/${repo}`) : null,
      installed_version: s.version ?? null,
      installed_commit: s.commit ?? null,
    });
  }
  return items;
}

/**
 * Project discovery (open question #2, best-effort v1): ~/.claude.json keeps a
 * `projects` map keyed by every root Claude Code was launched from. Only roots
 * that still exist and actually contain project-scope installs are returned.
 */
export function discoverProjectRoots(home: string): string[] {
  const config = readJson<{ projects?: Record<string, unknown> }>(join(home, '.claude.json'));
  if (!config?.projects) return [];
  return Object.keys(config.projects).filter(
    (root) => existsSync(join(root, '.claude', 'skills')) || existsSync(join(root, '.claude-skills.json')),
  );
}

function frontmatterName(skillMd: string): string | null {
  const fm = skillMd.match(/^---\s*\n([\s\S]*?)\n---/);
  const name = fm?.[1]?.match(/^name:\s*(.+)\s*$/m)?.[1];
  return name?.trim() || null;
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}
