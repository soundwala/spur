import type { DatabaseSync } from 'node:sqlite';
import type { Entry, StatusReport, StatusSummary } from './types.js';
import { allEntries } from './db.js';

const STATUS_ORDER: Record<string, number> = {
  stale: 0,
  error: 1,
  unchecked: 2,
  unknown_source: 3,
  fresh: 4,
};

/** The one read API both surfaces render. Stale entries sort first. */
export function getStatus(db: DatabaseSync, dbPath: string): StatusReport {
  const entries = allEntries(db).sort(
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
  const summary: StatusSummary = { total: entries.length, fresh: 0, stale: 0, unknown_source: 0, error: 0, unchecked: 0 };
  for (const e of entries) {
    if (e.status in summary) summary[e.status as keyof Omit<StatusSummary, 'total'>]++;
  }
  return summary;
}
