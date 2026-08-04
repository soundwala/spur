import type { DatabaseSync } from 'node:sqlite';
import type { Entry, StatusReport, StatusSummary } from './types.js';
import { allEntries } from './db.js';
import { ignoreValueFor } from './sources.js';

const STATUS_ORDER: Record<string, number> = {
  stale: 0,
  modified: 1,
  unverified: 2,
  error: 3,
  unchecked: 4,
  unknown_source: 5,
  fresh: 6,
};

/** The one read API both surfaces render. Stale entries sort first. */
export function getStatus(db: DatabaseSync, dbPath: string): StatusReport {
  const entries = allEntries(db)
    .map((e) => {
      const ig = e.install_method === 'github-skill' ? ignoreValueFor(e.name, e.project_path) : null;
      return ig === 'repo' || (ig !== null && ig === e.latest_version) ? { ...e, ignored: true } : e;
    })
    .sort(
      (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || a.name.localeCompare(b.name),
    );
  return {
    generated_at: new Date().toISOString(),
    db_path: dbPath,
    summary: summarize(entries),
    entries,
  };
}

function summarize(entries: Entry[]): StatusSummary {
  const summary: StatusSummary = {
    total: entries.length, fresh: 0, stale: 0, modified: 0, unverified: 0,
    unknown_source: 0, error: 0, unchecked: 0,
  };
  for (const e of entries) {
    if (e.status in summary) summary[e.status as keyof Omit<StatusSummary, 'total'>]++;
  }
  return summary;
}
