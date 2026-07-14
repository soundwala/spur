export type EntryType = 'skill' | 'plugin';

export type InstallMethod = 'marketplace' | 'git' | 'cli-manifest' | 'npm' | 'github-skill' | 'unknown';

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
  /** In-repo subpath when the plugin lives inside its marketplace repo (e.g. plugins/frontend-design). */
  source_path: string | null;
  /** Marketplace name for marketplace installs (the "@marketplace" half of the manifest key). */
  marketplace: string | null;
  installed_commit: string | null;
  installed_version: string | null;
  latest_commit: string | null;
  latest_version: string | null;
  behind_count: number | null;
  status: EntryStatus;
  last_check_error: string | null;
  is_self: boolean;
  content_hash: string | null;
  /** lastUpdated from installed_plugins.json — anchor for the commit-activity fallback. */
  manifest_updated_at: string | null;
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
  source_path?: string | null;
  marketplace?: string | null;
  installed_commit?: string | null;
  installed_version?: string | null;
  is_self?: boolean;
  content_hash?: string | null;
  manifest_updated_at?: string | null;
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

/** Provenance for GitHub-installed skills: one repo → the skills it ships. */
export interface SkillSource {
  repo: string;
  ref: string | null;                 // null = default branch / latest tag
  version_source: 'tag';              // latest semver tag is the version signal
  skills: Record<string, string>;     // skill name -> subpath within the repo
  adopted_version: string | null;     // recorded baseline; null = decide by content
}

export interface SourceStore {
  sources: SkillSource[];
  local: string[];                    // skill names the user marked as having no upstream
}
