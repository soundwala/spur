import { join } from 'node:path';
import { homedir } from 'node:os';
import type { DatabaseSync } from 'node:sqlite';
import type { SkillSource, Entry } from './types.js';
import { allEntries, setPristine } from './db.js';
import { upsertSource, loadStore } from './sources.js';
import { skillDirVersion } from './fallback.js';
import {
  realRepoOps, discoverSkills, listShippedFiles, hashManifest, copyDirOver, type RepoOps,
} from './repo.js';

export interface AdoptResult {
  repo: string;
  tracked: string[];
  adopted_version: string | null;
  already_tracked?: boolean;
}

const MAX_TAG_WALK = 10;

export async function adopt(
  db: DatabaseSync,
  repo: string,
  opts: { project?: string } = {},
  repoOps: RepoOps = realRepoOps,
): Promise<AdoptResult> {
  const tags = await repoOps.tags(repo);       // [] is fine — fall back to HEAD
  const best = tags[0] ?? null;
  const co = await repoOps.checkout(repo, best?.tag ?? 'HEAD');
  if (!co) throw new Error('could not fetch source repo');
  try {
    const repoSkills = discoverSkills(co.dir);
    const candidates = allEntries(db).filter((e) => e.install_method === 'unknown' && repoSkills[e.name]);
    const tracked = [...new Set(candidates.map((e) => e.name))];

    if (tracked.length === 0) {
      const existing = loadStore().sources.find((s) => s.repo === repo);
      if (existing) {
        return { repo, tracked: Object.keys(existing.skills), adopted_version: existing.adopted_version, already_tracked: true };
      }
      return { repo, tracked: [], adopted_version: null };
    }

    const skills: Record<string, string> = {};
    for (const name of tracked) skills[name] = repoSkills[name]!;

    // Per-copy: a content match against this ref names the version AND establishes pristine.
    let adopted_version: string | null = null;
    const unmatched: Entry[] = [];
    for (const e of candidates) {
      const subtree = join(co.dir, skills[e.name]!);
      const files = listShippedFiles(subtree);
      if (files.length > 0 && hashManifest(subtree, files) === hashManifest(e.install_path, files)) {
        setPristine(db, e.id, hashManifest(e.install_path, files), files);
        adopted_version ??= skillDirVersion(subtree) ?? best?.version ?? null;
      } else {
        unmatched.push(e);
      }
    }

    // Bounded walk over older tags to identify (and pristine) copies that didn't match the latest.
    for (const t of tags.slice(1, MAX_TAG_WALK)) {
      if (unmatched.length === 0) break;
      const older = await repoOps.checkout(repo, t.tag);
      if (!older) continue;
      try {
        for (let i = unmatched.length - 1; i >= 0; i--) {
          const e = unmatched[i]!;
          const subtree = join(older.dir, skills[e.name]!);
          const files = listShippedFiles(subtree);
          if (files.length > 0 && hashManifest(subtree, files) === hashManifest(e.install_path, files)) {
            setPristine(db, e.id, hashManifest(e.install_path, files), files);
            adopted_version ??= t.version;
            unmatched.splice(i, 1);
          }
        }
      } finally {
        await older.cleanup();
      }
    }

    upsertSource({ repo, ref: null, version_source: 'tag', skills, adopted_version }, { project: opts.project });
    return { repo, tracked, adopted_version };
  } finally {
    await co.cleanup();
  }
}

export interface InstallResult {
  repo: string;
  installed: string[];
  version: string;
  pristine: Array<{ install_path: string; hash: string; manifest: string[] }>;
}

export async function install(
  repo: string,
  opts: { skills?: string[]; all?: boolean; scope: 'user' | 'project'; projectPath?: string; home?: string },
  repoOps: RepoOps = realRepoOps,
): Promise<InstallResult> {
  const tags = await repoOps.tags(repo);
  const best = tags[0] ?? null;
  const co = await repoOps.checkout(repo, best?.tag ?? 'HEAD');
  if (!co) throw new Error('could not fetch source repo');
  try {
    const repoSkills = discoverSkills(co.dir);
    const chosen = opts.all ? Object.keys(repoSkills) : (opts.skills ?? []);
    if (chosen.length === 0) throw new Error('specify --skill <name>… or --all');

    const base = opts.scope === 'project'
      ? join(opts.projectPath ?? process.cwd(), '.claude', 'skills')
      : join(opts.home ?? homedir(), '.claude', 'skills');

    const skills: Record<string, string> = {};
    const installed: string[] = [];
    const pristine: InstallResult['pristine'] = [];
    for (const name of chosen) {
      const subpath = repoSkills[name];
      if (!subpath) throw new Error(`repo does not provide a skill named "${name}"`);
      const files = listShippedFiles(join(co.dir, subpath));
      const dest = join(base, name);
      copyDirOver(join(co.dir, subpath), dest);
      skills[name] = subpath;
      installed.push(name);
      pristine.push({ install_path: dest, hash: hashManifest(dest, files), manifest: files });
    }

    const version = skillDirVersion(join(co.dir, repoSkills[chosen[0]!] ?? '')) ?? best?.version ?? 'unknown';

    const source: SkillSource = { repo, ref: null, version_source: 'tag', skills, adopted_version: version };
    upsertSource(source, { project: opts.scope === 'project' ? opts.projectPath : undefined });
    return { repo, installed, version, pristine };
  } finally {
    await co.cleanup();
  }
}
