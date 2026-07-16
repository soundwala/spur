import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, upsertEntries, allEntries } from './db.js';
import { update, updateOne, selectTargets, type CommandRunner } from './update.js';
import type { RepoOps } from './repo.js';
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

test('a throwing runner yields failed and does not abort the batch', async () => {
  const db = tempDb();
  upsertEntries(db, [mkt({ name: 'a', install_path: '/c/a' }), mkt({ name: 'b', install_path: '/c/b' })]);
  db.prepare("UPDATE entries SET status='stale'").run();
  let n = 0;
  const run: CommandRunner = async () => { n++; if (n === 1) throw new Error('kaboom'); return { ok: true, stdout: '', stderr: '' }; };
  const res = await update(db, { all: true }, run);
  assert.equal(res.length, 2);
  assert.equal(res.filter((r) => r.outcome === 'failed').length, 1);
  assert.ok(res.find((r) => r.outcome === 'failed')?.message.includes('kaboom'));
});

test('github-skill update re-fetches the subpath and overwrites files', async () => {
  process.env.SPUR_HOME = mkdtempSync(join(tmpdir(), 'spur-store-'));
  const install = mkdtempSync(join(tmpdir(), 'spur-inst-'));
  writeFileSync(join(install, 'SKILL.md'), 'OLD');

  const repoDir = mkdtempSync(join(tmpdir(), 'spur-up-'));
  const sub = join(repoDir, '.claude', 'skills', 'ui-ux-pro-max');
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, 'SKILL.md'), 'NEW');
  const repoOps: RepoOps = {
    tags: async () => [{ tag: 'v2.11.0', version: '2.11.0' }],
    checkout: async () => ({ dir: repoDir, cleanup: async () => {} }),
  };

  const entry = {
    id: 'x', name: 'ui-ux-pro-max', install_method: 'github-skill', scope: 'user',
    status: 'stale', install_path: install, source_url: 'https://github.com/x/y',
    source_path: '.claude/skills/ui-ux-pro-max', project_path: null,
  } as unknown as Entry;

  const result = await updateOne(entry, async () => ({ ok: true, stdout: '', stderr: '' }), repoOps);
  assert.equal(result.outcome, 'updated');
  assert.equal(result.restart_required, false);
  assert.equal(readFileSync(join(install, 'SKILL.md'), 'utf8'), 'NEW');
});

function ghFixture() {
  process.env.SPUR_HOME = mkdtempSync(join(tmpdir(), 'spur-store-'));
  const install = mkdtempSync(join(tmpdir(), 'spur-inst-'));
  writeFileSync(join(install, 'SKILL.md'), 'MY EDITS');
  const repoDir = mkdtempSync(join(tmpdir(), 'spur-up-'));
  const sub = join(repoDir, '.claude', 'skills', 'ui-ux-pro-max');
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, 'SKILL.md'), 'NEW');
  const repoOps: RepoOps = {
    tags: async () => [{ tag: 'v2.12.0', version: '2.12.0' }],
    checkout: async () => ({ dir: repoDir, cleanup: async () => {} }),
  };
  const entry = (status: string) => ({
    id: 'x', name: 'ui-ux-pro-max', install_method: 'github-skill', scope: 'user',
    status, install_path: install, source_url: 'https://github.com/x/y',
    source_path: '.claude/skills/ui-ux-pro-max', project_path: null,
    installed_version: '2.11.0', pristine_manifest: JSON.stringify(['SKILL.md']),
  }) as unknown as Entry;
  return { install, entry, repoOps };
}
const okRun: CommandRunner = async () => ({ ok: true, stdout: '', stderr: '' });

test('modified is refused without --force; files untouched', async () => {
  const { install, entry, repoOps } = ghFixture();
  const r = await updateOne(entry('modified'), okRun, repoOps);
  assert.equal(r.outcome, 'skipped');
  assert.match(r.message, /--force/);
  assert.equal(readFileSync(join(install, 'SKILL.md'), 'utf8'), 'MY EDITS');
});

test('--force backs up BEFORE overwriting and reports the backup id', async () => {
  const { install, entry, repoOps } = ghFixture();
  const r = await updateOne(entry('modified'), okRun, repoOps, { force: true });
  assert.equal(r.outcome, 'updated');
  assert.equal(readFileSync(join(install, 'SKILL.md'), 'utf8'), 'NEW');
  const { listBackups } = await import('./backup.js');
  const backup = listBackups()[0]!;
  assert.match(r.message, new RegExp(backup.id));
  const { readFileSync: rf } = await import('node:fs');
  const { join: j } = await import('node:path');
  const { spurHome } = await import('./db.js');
  assert.equal(rf(j(spurHome(), 'backups', backup.id, 'files', 'SKILL.md'), 'utf8'), 'MY EDITS');
  assert.ok(r.applied?.pristine_hash);
});

test('backup failure aborts the update; files untouched', async () => {
  const { install, entry, repoOps } = ghFixture();
  writeFileSync(join(process.env.SPUR_HOME!, 'backups'), 'not a dir'); // mkdir under a FILE will throw
  const r = await updateOne(entry('modified'), okRun, repoOps, { force: true });
  assert.equal(r.outcome, 'failed');
  assert.equal(readFileSync(join(install, 'SKILL.md'), 'utf8'), 'MY EDITS');
});

test('stale update: no backup, prunes upstream-deleted files, keeps user files', async () => {
  const { install, entry, repoOps } = ghFixture();
  writeFileSync(join(install, 'old-upstream.txt'), 'shipped once'); // in old manifest below
  writeFileSync(join(install, 'notes.mine'), 'user file');
  const e = { ...(entry('stale') as any), pristine_manifest: JSON.stringify(['SKILL.md', 'old-upstream.txt']) };
  const r = await updateOne(e, okRun, repoOps);
  assert.equal(r.outcome, 'updated');
  assert.equal(existsSync(join(install, 'old-upstream.txt')), false); // pruned (upstream-owned)
  assert.equal(readFileSync(join(install, 'notes.mine'), 'utf8'), 'user file'); // untouched
  const { listBackups } = await import('./backup.js');
  assert.equal(listBackups().length, 0); // nothing to lose → no backup
});

test('unchecked is refused without --force and backed up under --force', async () => {
  const { install, entry, repoOps } = ghFixture();

  const refused = await updateOne(entry('unchecked'), okRun, repoOps);
  assert.equal(refused.outcome, 'skipped');
  assert.match(refused.message, /--force/);
  assert.equal(readFileSync(join(install, 'SKILL.md'), 'utf8'), 'MY EDITS');

  const r = await updateOne(entry('unchecked'), okRun, repoOps, { force: true });
  assert.equal(r.outcome, 'updated');
  assert.equal(readFileSync(join(install, 'SKILL.md'), 'utf8'), 'NEW');
  const { listBackups } = await import('./backup.js');
  assert.equal(listBackups().length, 1);
  const backup = listBackups()[0]!;
  const { readFileSync: rf } = await import('node:fs');
  const { join: j } = await import('node:path');
  const { spurHome } = await import('./db.js');
  assert.equal(rf(j(spurHome(), 'backups', backup.id, 'files', 'SKILL.md'), 'utf8'), 'MY EDITS');
});
