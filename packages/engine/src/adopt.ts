import { join } from 'node:path';
import { homedir } from 'node:os';
import type { DatabaseSync } from 'node:sqlite';
import type { SkillSource } from './types.js';
import { allEntries } from './db.js';
import { upsertSource } from './sources.js';
import {
  realRepoOps, latestTag, discoverSkills, hashDir, copyDirOver, type RepoOps, type TagInfo,
} from './repo.js';

export interface AdoptResult {
  repo: string;
  tracked: string[];
  adopted_version: string | null;
}

const MAX_TAG_WALK = 10;

export async function adopt(
  db: DatabaseSync,
  repo: string,
  opts: { project?: string } = {},
  repoOps: RepoOps = realRepoOps,
): Promise<AdoptResult> {
  const tags = await repoOps.tags(repo);
  const latest = tags[0];
  if (!latest) throw new Error('source repo has no semver version tags');

  const co = await repoOps.checkout(repo, latest.tag);
  if (!co) throw new Error('could not fetch source repo');
  try {
    const repoSkills = discoverSkills(co.dir); // name -> subpath

    // Match not-yet-tracked loose skills by name. Match on install_method
    // ('unknown') rather than status, so adoption works whether or not a check
    // has run yet (a fresh scan leaves loose skills 'unchecked', not
    // 'unknown_source').
    const untraceable = allEntries(db).filter((e) => e.install_method === 'unknown' && repoSkills[e.name]);
    const tracked = [...new Set(untraceable.map((e) => e.name))];
    if (tracked.length === 0) {
      return { repo, tracked: [], adopted_version: null };
    }

    const skills: Record<string, string> = {};
    for (const name of tracked) skills[name] = repoSkills[name]!;

    // Baseline: compare one representative install against the latest tag, then
    // walk back a bounded number of tags to name an older version.
    const sample = untraceable[0]!;
    const installedHash = hashDir(sample.install_path);
    let adopted_version: string | null = null;
    if (installedHash) {
      if (installedHash === hashDir(join(co.dir, skills[sample.name]!))) {
        adopted_version = latest.version;
      } else {
        adopted_version = await nameVersionByContent(repoOps, repo, tags, skills[sample.name]!, installedHash);
      }
    }

    const source: SkillSource = { repo, ref: null, version_source: 'tag', skills, adopted_version };
    upsertSource(source, { project: opts.project });
    return { repo, tracked, adopted_version };
  } finally {
    await co.cleanup();
  }
}

/** Walk recent tags (newest→oldest, bounded) and return the first whose subpath matches the installed hash. */
async function nameVersionByContent(
  repoOps: RepoOps,
  repo: string,
  tags: TagInfo[],
  subpath: string,
  installedHash: string,
): Promise<string | null> {
  for (const t of tags.slice(0, MAX_TAG_WALK)) {
    const co = await repoOps.checkout(repo, t.tag);
    if (!co) continue;
    try {
      if (hashDir(join(co.dir, subpath)) === installedHash) return t.version;
    } finally {
      await co.cleanup();
    }
  }
  return null;
}

export interface InstallResult {
  repo: string;
  installed: string[];
  version: string;
}

export async function install(
  repo: string,
  opts: { skills?: string[]; all?: boolean; scope: 'user' | 'project'; projectPath?: string; home?: string },
  repoOps: RepoOps = realRepoOps,
): Promise<InstallResult> {
  const latest = await latestTag(repoOps, repo);
  if (!latest) throw new Error('source repo has no semver version tags');
  const co = await repoOps.checkout(repo, latest.tag);
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
    for (const name of chosen) {
      const subpath = repoSkills[name];
      if (!subpath) throw new Error(`repo does not provide a skill named "${name}"`);
      copyDirOver(join(co.dir, subpath), join(base, name));
      skills[name] = subpath;
      installed.push(name);
    }

    const source: SkillSource = { repo, ref: null, version_source: 'tag', skills, adopted_version: latest.version };
    upsertSource(source, { project: opts.scope === 'project' ? opts.projectPath : undefined });
    return { repo, installed, version: latest.version };
  } finally {
    await co.cleanup();
  }
}
