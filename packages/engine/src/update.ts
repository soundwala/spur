import { execFile } from 'node:child_process';
import type { DatabaseSync } from 'node:sqlite';
import type { Entry, InstallMethod } from './types.js';
import { allEntries, updateCheckResult } from './db.js';

export type UpdateOutcome = 'updated' | 'skipped' | 'failed';

export interface UpdateResult {
  id: string;
  name: string;
  install_method: InstallMethod;
  outcome: UpdateOutcome;
  message: string;
  restart_required: boolean;
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
  opts: { ids?: string[]; all?: boolean },
  run: CommandRunner = realRunner,
): Promise<UpdateResult[]> {
  const targets = selectTargets(allEntries(db), opts);
  const results: UpdateResult[] = [];
  for (const entry of targets) {
    const result = await updateOne(entry, run);
    results.push(result);
    if (result.outcome === 'updated') {
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

async function updateOne(e: Entry, run: CommandRunner): Promise<UpdateResult> {
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
    default:
      return { ...base, outcome: 'skipped', message: `${e.install_method} entries are not auto-updatable`, restart_required: false };
  }
}
