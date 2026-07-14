import { readdirSync, existsSync, statSync, readFileSync, mkdirSync, rmSync, cpSync, mkdtempSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { gitLsRemoteTags, gitCloneShallow } from './git.js';

export interface TagInfo {
  tag: string;
  version: string;
}

export interface RepoCheckout {
  dir: string;
  cleanup(): Promise<void>;
}

export interface RepoOps {
  tags(repo: string): Promise<TagInfo[]>;                          // newest first
  checkout(repo: string, ref: string): Promise<RepoCheckout | null>;
}

/** "v2.11.0" / "2.11.0" -> TagInfo; anything without an x.y.z core -> null. */
export function parseTag(raw: string): TagInfo | null {
  const m = raw.match(/^v?(\d+\.\d+\.\d+)$/);
  return m ? { tag: raw, version: m[1]! } : null;
}

/** >0 if a is newer, <0 if older, 0 if equal (numeric x.y.z). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

export const realRepoOps: RepoOps = {
  async tags(repo: string): Promise<TagInfo[]> {
    const parsed = (await gitLsRemoteTags(repo))
      .map(parseTag)
      .filter((t): t is TagInfo => t !== null);
    return parsed.sort((a, b) => compareVersions(b.version, a.version));
  },
  async checkout(repo: string, ref: string): Promise<RepoCheckout | null> {
    const dir = mkdtempSync(join(tmpdir(), 'spur-co-'));
    const ok = await gitCloneShallow(repo, ref, join(dir, 'repo'));
    if (!ok) {
      rmSync(dir, { recursive: true, force: true });
      return null;
    }
    return {
      dir: join(dir, 'repo'),
      cleanup: async () => rmSync(dir, { recursive: true, force: true }),
    };
  },
};

export async function latestTag(ops: RepoOps, repo: string): Promise<TagInfo | null> {
  return (await ops.tags(repo))[0] ?? null;
}

/** Map every skill under <dir>/.claude/skills/* to its posix subpath in the repo. */
export function discoverSkills(dir: string): Record<string, string> {
  const base = join(dir, '.claude', 'skills');
  if (!existsSync(base)) return {};
  const out: Record<string, string> = {};
  for (const name of readdirSync(base)) {
    const skillDir = join(base, name);
    try {
      if (!statSync(skillDir).isDirectory() || !existsSync(join(skillDir, 'SKILL.md'))) continue;
    } catch {
      continue;
    }
    out[frontmatterName(join(skillDir, 'SKILL.md')) ?? name] = ['.claude', 'skills', name].join('/');
  }
  return out;
}

function frontmatterName(skillMd: string): string | null {
  try {
    const raw = readFileSync(skillMd, 'utf8');
    const fm = raw.match(/^---\s*\n([\s\S]*?)\n---/);
    return fm?.[1]?.match(/^name:\s*(.+)\s*$/m)?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

/** Content hash of every file under dir (sorted rel path + bytes). Excludes .git. */
export function hashDir(dir: string): string | null {
  if (!existsSync(dir)) return null;
  const hash = createHash('sha256');
  for (const rel of walk(dir).sort()) {
    hash.update(rel);
    hash.update('\0');
    hash.update(readFileSync(join(dir, rel)));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

function walk(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === '.git') continue;
    const abs = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(abs).isDirectory()) out.push(...walk(abs, rel));
    else out.push(rel.split(sep).join('/'));
  }
  return out;
}

/** Copy every file from srcDir into destDir, overwriting. Creates destDir. */
export function copyDirOver(srcDir: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  cpSync(srcDir, destDir, { recursive: true, force: true });
}
