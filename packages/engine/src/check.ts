import type { DatabaseSync } from 'node:sqlite';
import type { Entry, EntryStatus } from './types.js';
import { allEntries, updateCheckResult } from './db.js';
import { lsRemote } from './git.js';

export interface CheckOptions {
  /** Lifts the GitHub API budget from 60/hr to 5000/hr; also used for private repos. */
  githubToken?: string;
  /** Set false to skip the GitHub compare-API enrichment tier (behind_count). */
  enrich?: boolean;
  concurrency?: number;
}

export interface CheckResult {
  checked: number;
  stale: number;
  errors: number;
}

/**
 * Tiered hybrid check:
 *   1. Detection (always): `git ls-remote` — unlimited, host-agnostic, private
 *      repos work through the user's existing git credentials.
 *   2. Enrichment (stale github.com rows only): compare API for behind_count.
 *   3. npm registry for SPUR's own self-entry.
 */
export async function check(db: DatabaseSync, opts: CheckOptions = {}): Promise<CheckResult> {
  const entries = allEntries(db);
  const token = opts.githubToken ?? process.env.GITHUB_TOKEN;
  // ls-remote results are shared across entries pointing at the same repo+ref.
  const remoteCache = new Map<string, Promise<string | null>>();
  const cachedLsRemote = (url: string, ref: string) => {
    const key = `${url}#${ref}`;
    let hit = remoteCache.get(key);
    if (!hit) {
      hit = lsRemote(url, ref);
      remoteCache.set(key, hit);
    }
    return hit;
  };

  const result: CheckResult = { checked: 0, stale: 0, errors: 0 };
  await pool(entries, opts.concurrency ?? 8, async (entry) => {
    const outcome = await checkEntry(entry, cachedLsRemote, opts.enrich !== false, token);
    updateCheckResult(db, entry.id, outcome);
    result.checked++;
    if (outcome.status === 'stale') result.stale++;
    if (outcome.status === 'error') result.errors++;
  });
  return result;
}

type CheckOutcome = Pick<
  Entry,
  'latest_commit' | 'latest_version' | 'behind_count' | 'status' | 'last_check_error' | 'last_checked_at'
>;

async function checkEntry(
  entry: Entry,
  cachedLsRemote: (url: string, ref: string) => Promise<string | null>,
  enrich: boolean,
  token: string | undefined,
): Promise<CheckOutcome> {
  const base: CheckOutcome = {
    latest_commit: entry.latest_commit,
    latest_version: entry.latest_version,
    behind_count: entry.behind_count,
    status: entry.status,
    last_check_error: null,
    last_checked_at: new Date().toISOString(),
  };

  if (entry.install_method === 'unknown' || !entry.source_url) {
    return { ...base, status: 'unknown_source' };
  }

  if (entry.install_method === 'npm') {
    return checkNpm(entry, base);
  }

  try {
    const latest = await cachedLsRemote(entry.source_url, entry.source_ref ?? 'HEAD');
    if (!latest) return fail(base, 'ls-remote: could not resolve upstream ref');
    if (!entry.installed_commit) return fail(base, 'no installed commit recorded to compare against');

    let status: EntryStatus = latest === entry.installed_commit ? 'fresh' : 'stale';
    let behind = status === 'fresh' ? 0 : null;
    if (status === 'stale' && enrich) {
      behind = await githubBehindCount(entry.source_url, entry.installed_commit, latest, token);
    }
    return { ...base, latest_commit: latest, behind_count: behind, status };
  } catch (err) {
    return fail(base, message(err));
  }
}

async function checkNpm(entry: Entry, base: CheckOutcome): Promise<CheckOutcome> {
  try {
    const res = await fetch(entry.source_url!, { headers: { accept: 'application/json' } });
    if (!res.ok) return fail(base, `npm registry: HTTP ${res.status}${res.status === 404 ? ' (not published yet?)' : ''}`);
    const data = (await res.json()) as { 'dist-tags'?: { latest?: string } };
    const latest = data['dist-tags']?.latest ?? null;
    if (!latest) return fail(base, 'npm registry: no latest dist-tag');
    const status: EntryStatus = entry.installed_version === latest ? 'fresh' : 'stale';
    return { ...base, latest_version: latest, status, behind_count: status === 'fresh' ? 0 : null };
  } catch (err) {
    return fail(base, `npm registry: ${message(err)}`);
  }
}

/** Enrichment tier: only ever called for rows that just turned stale. */
async function githubBehindCount(
  sourceUrl: string,
  installed: string,
  latest: string,
  token: string | undefined,
): Promise<number | null> {
  const repo = sourceUrl.match(/github\.com\/([^/]+\/[^/#?]+)/)?.[1]?.replace(/\.git$/, '');
  if (!repo) return null;
  try {
    const headers: Record<string, string> = {
      accept: 'application/vnd.github+json',
      'user-agent': 'spur (https://github.com/soundwala/spur)',
    };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(
      `https://api.github.com/repos/${repo}/compare/${installed}...${latest}`,
      { headers },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { ahead_by?: number };
    return typeof data.ahead_by === 'number' ? data.ahead_by : null;
  } catch {
    return null; // enrichment is best-effort; detection already decided the status
  }
}

function fail(base: CheckOutcome, error: string): CheckOutcome {
  return { ...base, status: 'error', last_check_error: error };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(size, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      await fn(item);
    }
  });
  await Promise.all(workers);
}
