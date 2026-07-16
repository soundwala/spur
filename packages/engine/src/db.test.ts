import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, upsertEntries, pruneMissing, allEntries, updateCheckResult, entryId, setPristine } from './db.js';
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

test('marketplace name round-trips through upsert', () => {
  const db = tempDb();
  upsertEntries(db, [item({ install_method: 'marketplace', marketplace: 'official' })]);
  assert.equal(allEntries(db)[0]?.marketplace, 'official');
});

test('setPristine round-trips and survives a rescan upsert', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'spur-pr-')), 'i.db'));
  const item = { name: 's', type: 'skill', install_method: 'github-skill', scope: 'user', install_path: '/x/s' } as const;
  upsertEntries(db, [item as any]);
  const e = allEntries(db)[0]!;
  setPristine(db, e.id, 'abc123', ['SKILL.md', 'data/a.csv']);
  upsertEntries(db, [item as any]); // rescan same item
  const after = allEntries(db)[0]!;
  assert.equal(after.pristine_hash, 'abc123');
  assert.deepEqual(JSON.parse(after.pristine_manifest!), ['SKILL.md', 'data/a.csv']);
  setPristine(db, e.id, null, null);
  assert.equal(allEntries(db)[0]!.pristine_hash, null);
});
