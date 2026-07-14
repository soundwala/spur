import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import type { Entry, ScannedItem } from './types.js';

const DDL = `
CREATE TABLE IF NOT EXISTS entries (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  type              TEXT NOT NULL,
  install_method    TEXT NOT NULL,
  scope             TEXT NOT NULL,
  install_path      TEXT NOT NULL UNIQUE,
  project_path      TEXT,
  source_url        TEXT,
  source_ref        TEXT,
  source_path       TEXT,
  marketplace       TEXT,
  installed_commit  TEXT,
  installed_version TEXT,
  latest_commit     TEXT,
  latest_version    TEXT,
  behind_count      INTEGER,
  status            TEXT NOT NULL DEFAULT 'unchecked',
  last_check_error  TEXT,
  is_self           INTEGER NOT NULL DEFAULT 0,
  content_hash      TEXT,
  manifest_updated_at TEXT,
  first_seen_at     TEXT,
  last_scanned_at   TEXT,
  last_checked_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
CREATE INDEX IF NOT EXISTS idx_entries_source ON entries(source_url);
`;

export function spurHome(): string {
  return process.env.SPUR_HOME ?? join(homedir(), '.spur');
}

export function defaultDbPath(): string {
  return join(spurHome(), 'index.db');
}

export function openDb(path: string = defaultDbPath()): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(DDL);
  migrate(db);
  return db;
}

/** Adds columns introduced after a db was created; CREATE TABLE IF NOT EXISTS won't. */
function migrate(db: DatabaseSync): void {
  const existing = new Set(
    (db.prepare('PRAGMA table_info(entries)').all() as Array<{ name: string }>).map((c) => c.name),
  );
  for (const [column, type] of [
    ['source_path', 'TEXT'],
    ['manifest_updated_at', 'TEXT'],
    ['marketplace', 'TEXT'],
  ] as const) {
    if (!existing.has(column)) db.exec(`ALTER TABLE entries ADD COLUMN ${column} ${type}`);
  }
}

export function entryId(installPath: string): string {
  return createHash('sha256').update(installPath).digest('hex').slice(0, 16);
}

/**
 * Upsert scanned items. Identity/bookkeeping fields are refreshed on every scan;
 * status is reset to 'unchecked' only when the installed commit/version changed
 * (otherwise the last check result stays valid).
 */
export function upsertEntries(db: DatabaseSync, items: ScannedItem[]): void {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO entries (
      id, name, type, install_method, scope, install_path, project_path,
      source_url, source_ref, source_path, marketplace, installed_commit, installed_version,
      is_self, content_hash, manifest_updated_at, first_seen_at, last_scanned_at, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unchecked')
    ON CONFLICT(install_path) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      install_method = excluded.install_method,
      scope = excluded.scope,
      project_path = excluded.project_path,
      source_url = excluded.source_url,
      source_ref = excluded.source_ref,
      source_path = excluded.source_path,
      marketplace = excluded.marketplace,
      installed_commit = excluded.installed_commit,
      installed_version = excluded.installed_version,
      is_self = excluded.is_self,
      content_hash = excluded.content_hash,
      manifest_updated_at = excluded.manifest_updated_at,
      last_scanned_at = excluded.last_scanned_at,
      status = CASE
        WHEN entries.installed_commit IS NOT excluded.installed_commit
          OR entries.installed_version IS NOT excluded.installed_version
          OR entries.manifest_updated_at IS NOT excluded.manifest_updated_at
        THEN 'unchecked'
        ELSE entries.status
      END
  `);
  for (const it of items) {
    stmt.run(
      entryId(it.install_path),
      it.name,
      it.type,
      it.install_method,
      it.scope,
      it.install_path,
      it.project_path ?? null,
      it.source_url ?? null,
      it.source_ref ?? null,
      it.source_path ?? null,
      it.marketplace ?? null,
      it.installed_commit ?? null,
      it.installed_version ?? null,
      it.is_self ? 1 : 0,
      it.content_hash ?? null,
      it.manifest_updated_at ?? null,
      now,
      now,
    );
  }
}

/** Remove rows whose install path was not seen in the scan that just ran. */
export function pruneMissing(db: DatabaseSync, seenPaths: string[]): number {
  const existing = db.prepare('SELECT install_path FROM entries').all() as Array<{ install_path: string }>;
  const seen = new Set(seenPaths);
  const del = db.prepare('DELETE FROM entries WHERE install_path = ?');
  let removed = 0;
  for (const row of existing) {
    if (!seen.has(row.install_path)) {
      del.run(row.install_path);
      removed++;
    }
  }
  return removed;
}

export function allEntries(db: DatabaseSync): Entry[] {
  const rows = db.prepare('SELECT * FROM entries ORDER BY name, install_path').all() as Array<Record<string, unknown>>;
  return rows.map(rowToEntry);
}

export function updateCheckResult(
  db: DatabaseSync,
  id: string,
  fields: Pick<Entry, 'latest_commit' | 'latest_version' | 'behind_count' | 'status' | 'last_check_error' | 'last_checked_at'>,
): void {
  db.prepare(`
    UPDATE entries SET
      latest_commit = ?, latest_version = ?, behind_count = ?,
      status = ?, last_check_error = ?, last_checked_at = ?
    WHERE id = ?
  `).run(
    fields.latest_commit,
    fields.latest_version,
    fields.behind_count,
    fields.status,
    fields.last_check_error,
    fields.last_checked_at,
    id,
  );
}

function rowToEntry(row: Record<string, unknown>): Entry {
  return { ...row, is_self: row.is_self === 1 } as unknown as Entry;
}
