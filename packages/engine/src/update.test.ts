import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, upsertEntries, allEntries } from './db.js';
import { update, selectTargets, type CommandRunner } from './update.js';
import type { Entry, ScannedItem } from './types.js';

function tempDb() {
  return openDb(join(mkdtempSync(join(tmpdir(), 'spur-upd-')), 'index.db'));
}
const ok: CommandRunner = async () => ({ ok: true, stdout: 'done', stderr: '' });
const fail: CommandRunner = async () => ({ ok: false, stdout: '', stderr: 'boom' });

const mkt = (o: Partial<ScannedItem> = {}): ScannedItem => ({
  name: 'superpowers', type: 'plugin', install_method: 'marketplace', scope: 'user',
  install_path: '/c/superpowers', marketplace: 'official', installed_commit: 'aaa', ...o,
});

function seedStale(db: ReturnType<typeof tempDb>, it: ScannedItem) {
  upsertEntries(db, [it]);
  const e = allEntries(db)[0]!;
  db.prepare("UPDATE entries SET status='stale' WHERE id=?").run(e.id);
  return e;
}

test('selectTargets: all picks only stale rows', () => {
  const entries = [{ id: '1', status: 'stale' }, { id: '2', status: 'fresh' }] as Entry[];
  assert.deepEqual(selectTargets(entries, { all: true }).map((e) => e.id), ['1']);
});

test('selectTargets: ids picks the named rows regardless of status', () => {
  const entries = [{ id: '1', status: 'fresh' }, { id: '2', status: 'stale' }] as Entry[];
  assert.deepEqual(selectTargets(entries, { ids: ['1'] }).map((e) => e.id), ['1']);
});

test('marketplace update runs claude plugin update and needs restart', async () => {
  const db = tempDb();
  seedStale(db, mkt());
  const calls: string[][] = [];
  const run: CommandRunner = async (cmd, args) => { calls.push([cmd, ...args]); return { ok: true, stdout: '', stderr: '' }; };
  const [r] = await update(db, { all: true }, run);
  assert.equal(r?.outcome, 'updated');
  assert.equal(r?.restart_required, true);
  assert.deepEqual(calls[0], ['claude', 'plugin', 'marketplace', 'update', 'official']);
  assert.deepEqual(calls[1], ['claude', 'plugin', 'update', 'superpowers@official', '--scope', 'user']);
  assert.equal(allEntries(db)[0]?.status, 'unchecked'); // queued for recheck
});

test('git checkout updates via ff-only pull', async () => {
  const db = tempDb();
  seedStale(db, { name: 'x', type: 'skill', install_method: 'git', scope: 'user', install_path: '/repo/x', installed_commit: 'aaa' });
  const calls: string[][] = [];
  const run: CommandRunner = async (cmd, args) => { calls.push([cmd, ...args]); return { ok: true, stdout: 'Already up to date.', stderr: '' }; };
  const [r] = await update(db, { all: true }, run);
  assert.equal(r?.outcome, 'updated');
  assert.equal(r?.restart_required, false);
  assert.deepEqual(calls[0], ['git', '-C', '/repo/x', 'pull', '--ff-only']);
});

test('self npm entry is advisory, not executed', async () => {
  const db = tempDb();
  const e = seedStale(db, { name: '@soundwala/spur', type: 'plugin', install_method: 'npm', scope: 'user', install_path: '/pkg', is_self: true, installed_version: '0.1.0' });
  const [r] = await update(db, { ids: [e.id] }, fail);
  assert.equal(r?.outcome, 'skipped');
  assert.match(r!.message, /npm i -g|npx/);
});

test('unknown-method entry is skipped even when targeted by id', async () => {
  const db = tempDb();
  const e = seedStale(db, { name: 'copy', type: 'skill', install_method: 'unknown', scope: 'user', install_path: '/x/copy' });
  const [r] = await update(db, { ids: [e.id] }, ok);
  assert.equal(r?.outcome, 'skipped');
});

test('an error-status git entry is skipped even when targeted by id', async () => {
  const db = tempDb();
  const e = seedStale(db, { name: 'y', type: 'skill', install_method: 'git', scope: 'user', install_path: '/repo/y', installed_commit: 'aaa' });
  db.prepare("UPDATE entries SET status='error' WHERE id=?").run(e.id);
  const calls: string[][] = [];
  const run: CommandRunner = async (cmd, args) => { calls.push([cmd, ...args]); return { ok: true, stdout: '', stderr: '' }; };
  const [r] = await update(db, { ids: [e.id] }, run);
  assert.equal(r?.outcome, 'skipped');
  assert.equal(calls.length, 0); // no command ever run
});

test('a failing command yields failed without throwing', async () => {
  const db = tempDb();
  seedStale(db, mkt());
  const [r] = await update(db, { all: true }, fail);
  assert.equal(r?.outcome, 'failed');
  assert.match(r!.message, /boom/);
});
