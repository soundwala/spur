export type EntryType = 'skill' | 'plugin';

export type InstallMethod = 'marketplace' | 'git' | 'cli-manifest' | 'npm' | 'unknown';

export type Scope = 'user' | 'project';

/**
 * unknown_source = permanently uncheckable (no source recorded anywhere);
 * error = a source exists but the last check failed (transient).
 */
export type EntryStatus = 'fresh' | 'stale' | 'unknown_source' | 'error' | 'unchecked';

/** One row per installed copy, keyed by absolute install path. */
export interface Entry {
  id: string;
  name: string;
  type: EntryType;
  install_method: InstallMethod;
  scope: Scope;
  install_path: string;
  project_path: string | null;
  source_url: string | null;
  source_ref: string | null;
  installed_commit: string | null;
  installed_version: string | null;
  latest_commit: string | null;
  latest_version: string | null;
  behind_count: number | null;
  status: EntryStatus;
  last_check_error: string | null;
  is_self: boolean;
  content_hash: string | null;
  first_seen_at: string | null;
  last_scanned_at: string | null;
  last_checked_at: string | null;
}

/** What scanners emit; the db layer fills in id, status and bookkeeping timestamps. */
export interface ScannedItem {
  name: string;
  type: EntryType;
  install_method: InstallMethod;
  scope: Scope;
  install_path: string;
  project_path?: string | null;
  source_url?: string | null;
  source_ref?: string | null;
  installed_commit?: string | null;
  installed_version?: string | null;
  is_self?: boolean;
  content_hash?: string | null;
}

export interface StatusSummary {
  total: number;
  fresh: number;
  stale: number;
  unknown_source: number;
  error: number;
  unchecked: number;
}

export interface StatusReport {
  generated_at: string;
  db_path: string;
  summary: StatusSummary;
  entries: Entry[];
}
