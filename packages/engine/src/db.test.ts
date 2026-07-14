import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, upsertEntries, pruneMissing, allEntries, updateCheckResult, entryId } from './db.js';
import type { ScannedItem } from './types.js';

function tempDb() {
  return openDb(join(mkdtempSync(join(tmpdir(), 'spur-test-')), 'index.db'));
}

const item = (over: Partial<ScannedItem> = {}): ScannedItem => ({
  name: 'demo',
  type: 'skill',
  install_method: 'git',
  scope: 'user',
  install_path: '/fake/skills/demo',
  source_url: 'https://github.com/owner/demo',
  installed_commit: 'aaa',
  ...over,
});

test('new entries start unchecked', () => {
  const db = tempDb();
  upsertEntries(db, [item()]);
  const [e] = allEntries(db);
  assert.equal(e?.status, 'unchecked');
  assert.equal(e?.id, entryId('/fake/skills/demo'));
});

test('rescan preserves check result when installed commit unchanged', () => {
  const db = tempDb();
  upsertEntries(db, [item()]);
  const [e] = allEntries(db);
  updateCheckResult(db, e!.id, {
    latest_commit: 'aaa',
    latest_version: null,
    behind_count: 0,
    status: 'fresh',
    last_check_error: null,
    last_checked_at: new Date().toISOString(),
  });
  upsertEntries(db, [item()]);
  assert.equal(allEntries(db)[0]?.status, 'fresh');
});

test('rescan resets status when installed commit changed', () => {
  const db = tempDb();
  upsertEntries(db, [item()]);
  const [e] = allEntries(db);
  updateCheckResult(db, e!.id, {
    latest_commit: 'bbb',
    latest_version: null,
    behind_count: 2,
    status: 'stale',
    last_check_error: null,
    last_checked_at: new Date().toISOString(),
  });
  upsertEntries(db, [item({ installed_commit: 'bbb' })]);
  assert.equal(allEntries(db)[0]?.status, 'unchecked');
});

test('prune removes entries no longer on disk', () => {
  const db = tempDb();
  upsertEntries(db, [item(), item({ install_path: '/fake/skills/other', name: 'other' })]);
  const removed = pruneMissing(db, ['/fake/skills/demo']);
  assert.equal(removed, 1);
  assert.equal(allEntries(db).length, 1);
  assert.equal(allEntries(db)[0]?.name, 'demo');
});
