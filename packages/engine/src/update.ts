import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import type { Entry, InstallMethod } from './types.js';
import { allEntries, updateCheckResult, setPristine } from './db.js';
import type { RepoOps } from './repo.js';
import { realRepoOps, listShippedFiles, hashManifest, copyFiles } from './repo.js';
import { skillDirVersion } from './fallback.js';
import { createBackup } from './backup.js';
import { setAdoptedVersion } from './sources.js';

export type UpdateOutcome = 'updated' | 'skipped' | 'failed';

export interface UpdateResult {
  id: string;
  name: string;
  install_method: InstallMethod;
  outcome: UpdateOutcome;
  message: string;
  restart_required: boolean;
  /** github-skill only: what was applied, so update() can persist pristine + version. */
  applied?: { version: string | null; pristine_hash: string; pristine_manifest: string[] };
}

export type CommandRunner = (
  cmd: string,
  args: string[],
  opts?: { cwd?: string; timeoutMs?: number },
) => Promise<{ ok: boolean; stdout: string; stderr: string }>;

export const realRunner: CommandRunner = (cmd, args, opts) =>
  new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { timeout: opts?.timeoutMs ?? 120_000, cwd: opts?.cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
      (err, stdout, stderr) => resolve({ ok: !err, stdout: stdout ?? '', stderr: stderr ?? '' }),
    );
  });

/** ids selects those exact rows; all selects every stale row; neither selects nothing. */
export function selectTargets(entries: Entry[], opts: { ids?: string[]; all?: boolean }): Entry[] {
  if (opts.ids?.length) {
    const wanted = new Set(opts.ids);
    return entries.filter((e) => wanted.has(e.id));
  }
  if (opts.all) return entries.filter((e) => e.status === 'stale');
  return [];
}

export async function update(
  db: DatabaseSync,
  opts: { ids?: string[]; all?: boolean; force?: boolean },
  run: CommandRunner = realRunner,
  repoOps: RepoOps = realRepoOps,
): Promise<UpdateResult[]> {
  const targets = selectTargets(allEntries(db), opts);
  const results: UpdateResult[] = [];
  for (const entry of targets) {
    let result: UpdateResult;
    try {
      result = await updateOne(entry, run, repoOps, { force: opts.force });
    } catch (err) {
      result = {
        id: entry.id,
        name: entry.name,
        install_method: entry.install_method,
        outcome: 'failed',
        message: err instanceof Error ? err.message : String(err),
        restart_required: false,
      };
    }
    results.push(result);
    if (result.outcome === 'updated') {
      if (result.applied) {
        setPristine(db, entry.id, result.applied.pristine_hash, result.applied.pristine_manifest);
        db.prepare('UPDATE entries SET installed_version = ? WHERE id = ?').run(result.applied.version, entry.id);
      }
      // The installed sha/version only changes after a restart, so don't fake fresh —
      // just queue a recheck.
      updateCheckResult(db, entry.id, {
        latest_commit: null,
        latest_version: null,
        behind_count: null,
        status: 'unchecked',
        last_check_error: null,
        last_checked_at: new Date().toISOString(),
      });
    }
  }
  return results;
}

export async function updateOne(
  e: Entry,
  run: CommandRunner,
  repoOps: RepoOps = realRepoOps,
  opts: { force?: boolean } = {},
): Promise<UpdateResult> {
  const base = { id: e.id, name: e.name, install_method: e.install_method };
  if (e.status === 'error' || e.status === 'unknown_source') {
    return { ...base, outcome: 'skipped', message: `not updated: status is ${e.status}`, restart_required: false };
  }
  switch (e.install_method) {
    case 'marketplace': {
      if (!e.marketplace) {
        return { ...base, outcome: 'skipped', message: 'no marketplace name recorded', restart_required: false };
      }
      const mp = await run('claude', ['plugin', 'marketplace', 'update', e.marketplace]);
      const up = await run('claude', ['plugin', 'update', `${e.name}@${e.marketplace}`, '--scope', e.scope]);
      return up.ok
        ? { ...base, outcome: 'updated', message: `updated from ${e.marketplace}`, restart_required: true }
        : { ...base, outcome: 'failed', message: (up.stderr || mp.stderr || 'claude plugin update failed').trim(), restart_required: false };
    }
    case 'git': {
      const r = await run('git', ['-C', e.install_path, 'pull', '--ff-only']);
      return r.ok
        ? { ...base, outcome: 'updated', message: r.stdout.trim() || 'pulled', restart_required: false }
        : { ...base, outcome: 'failed', message: r.stderr.trim() || 'git pull failed', restart_required: false };
    }
    case 'npm':
      return {
        ...base,
        outcome: 'skipped',
        message: e.is_self
          ? 'run `npm i -g @soundwala/spur@latest` (or use npx — always latest)'
          : 'npm entries update manually',
        restart_required: false,
      };
    case 'github-skill': {
      if (!e.source_url || !e.source_path) {
        return { ...base, outcome: 'skipped', message: 'no source recorded', restart_required: false };
      }
      if ((e.status === 'modified' || e.status === 'unverified') && !opts.force) {
        const why = e.status === 'modified' ? 'local changes' : 'cannot verify local copy is unmodified';
        return {
          ...base, outcome: 'skipped', restart_required: false,
          message: `${why} — skipped; rerun with --force to overwrite (a backup will be made)`,
        };
      }
      try {
        const tags = await repoOps.tags(e.source_url);
        const best = tags[0] ?? null;
        const co = await repoOps.checkout(e.source_url, best?.tag ?? 'HEAD');
        if (!co) return { ...base, outcome: 'failed', message: 'could not fetch source repo', restart_required: false };
        try {
          const subtree = join(co.dir, e.source_path);
          const files = listShippedFiles(subtree);
          if (files.length === 0) {
            return { ...base, outcome: 'failed', message: `upstream ships no files at ${e.source_path}`, restart_required: false };
          }
          // Backup BEFORE any write; createBackup throws → caught below, nothing written.
          let backupNote = '';
          if (e.status === 'modified' || e.status === 'unverified') {
            backupNote = ` (backup: ${createBackup(e, `forced update over ${e.status}`).id})`;
          }
          copyFiles(subtree, e.install_path, files);
          // Prune files upstream used to ship but no longer does — provably upstream-owned.
          if (e.pristine_manifest) {
            for (const old of JSON.parse(e.pristine_manifest) as string[]) {
              if (!files.includes(old)) rmSync(join(e.install_path, old), { force: true });
            }
          }
          const version = skillDirVersion(subtree) ?? best?.version ?? null;
          if (version) setAdoptedVersion(e.name, e.project_path, version);
          return {
            ...base, outcome: 'updated', restart_required: false,
            message: `updated to ${version ?? 'latest'}${backupNote}`,
            applied: { version, pristine_hash: hashManifest(e.install_path, files), pristine_manifest: files },
          };
        } finally {
          await co.cleanup();
        }
      } catch (err) {
        return { ...base, outcome: 'failed', message: err instanceof Error ? err.message : String(err), restart_required: false };
      }
    }

    default:
      return { ...base, outcome: 'skipped', message: `${e.install_method} entries are not auto-updatable`, restart_required: false };
  }
}
