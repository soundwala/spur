import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from './db.js';
import { scan } from './scan.js';
import type { RepoOps } from './repo.js';
import { loadStore } from './sources.js';
import { adopt, install } from './adopt.js';
import { allEntries } from './db.js';

/** Fake repo: skills at v2.11.0 with controllable subpath content. */
function fakeOps(content: Record<string, string>): { ops: RepoOps; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'spur-fake-repo-'));
  for (const [name, body] of Object.entries(content)) {
    const sub = join(dir, '.claude', 'skills', name);
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(sub, 'SKILL.md'), body);
  }
  return {
    dir,
    ops: {
      tags: async () => [{ tag: 'v2.11.0', version: '2.11.0' }],
      checkout: async () => ({ dir, cleanup: async () => {} }),
    },
  };
}

test('adopt matches untraceable installs by name and writes a source', async () => {
  const home = mkdtempSync(join(tmpdir(), 'spur-home-'));
  process.env.SPUR_HOME = mkdtempSync(join(tmpdir(), 'spur-store-'));
  const skill = join(home, '.claude', 'skills', 'ui-ux-pro-max');
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, 'SKILL.md'), 'SAME');
  const db = openDb(join(home, 'index.db'));
  await scan(db, { home, discoverProjects: false });

  const { ops } = fakeOps({ 'ui-ux-pro-max': 'SAME' });
  const res = await adopt(db, 'https://github.com/x/ui-ux-pro-max-skill', {}, ops);

  assert.deepEqual(res.tracked, ['ui-ux-pro-max']);
  assert.equal(res.adopted_version, '2.11.0'); // installed content == latest → named latest
  const store = loadStore();
  assert.equal(store.sources[0]!.skills['ui-ux-pro-max'], '.claude/skills/ui-ux-pro-max');
});

test('install writes files into scope skills dir and records installed version', async () => {
  const home = mkdtempSync(join(tmpdir(), 'spur-home-'));
  process.env.SPUR_HOME = mkdtempSync(join(tmpdir(), 'spur-store-'));
  const { ops } = fakeOps({ design: 'NEWBODY' });
  const res = await install('https://github.com/x/y', { skills: ['design'], scope: 'user', home }, ops);
  assert.equal(res.version, '2.11.0');
  const dest = join(home, '.claude', 'skills', 'design', 'SKILL.md');
  assert.ok(existsSync(dest));
  assert.equal(readFileSync(dest, 'utf8'), 'NEWBODY');
  assert.equal(loadStore().sources[0]!.adopted_version, '2.11.0');
});

test('adopt works on a tagless repo via frontmatter and sets per-copy pristine', async () => {
  const home = mkdtempSync(join(tmpdir(), 'spur-home-'));
  process.env.SPUR_HOME = mkdtempSync(join(tmpdir(), 'spur-store-'));
  const skill = join(home, '.claude', 'skills', 'impeccable');
  mkdirSync(skill, { recursive: true });
  const body = '---\nname: impeccable\nversion: 3.9.1\n---\nbody';
  writeFileSync(join(skill, 'SKILL.md'), body);
  const db = openDb(join(home, 'index.db'));
  await scan(db, { home, discoverProjects: false });

  // tagless fake repo shipping identical content
  const dir = mkdtempSync(join(tmpdir(), 'spur-tagless-'));
  const sub = join(dir, '.claude', 'skills', 'impeccable');
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, 'SKILL.md'), body);
  const ops: RepoOps = { tags: async () => [], checkout: async () => ({ dir, cleanup: async () => {} }) };

  const res = await adopt(db, 'https://github.com/pbakaus/impeccable', {}, ops);
  assert.deepEqual(res.tracked, ['impeccable']);
  assert.equal(res.adopted_version, '3.9.1'); // from frontmatter, no tags needed
  const e = allEntries(db).find((x) => x.name === 'impeccable')!;
  assert.ok(e.pristine_hash, 'pristine established on content match');
  assert.deepEqual(JSON.parse(e.pristine_manifest!), ['SKILL.md']);
});

test('re-adopting an already-tracked repo reports the existing record (P3)', async () => {
  const home = mkdtempSync(join(tmpdir(), 'spur-home-'));
  process.env.SPUR_HOME = mkdtempSync(join(tmpdir(), 'spur-store-'));
  const skill = join(home, '.claude', 'skills', 'ui-ux-pro-max');
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, 'SKILL.md'), 'SAME');
  const db = openDb(join(home, 'index.db'));
  await scan(db, { home, discoverProjects: false });

  const dir = mkdtempSync(join(tmpdir(), 'spur-rr-'));
  const sub = join(dir, '.claude', 'skills', 'ui-ux-pro-max');
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, 'SKILL.md'), 'SAME');
  const ops: RepoOps = {
    tags: async () => [{ tag: 'v2.11.0', version: '2.11.0' }],
    checkout: async () => ({ dir, cleanup: async () => {} }),
  };

  await adopt(db, 'https://github.com/x/repo', {}, ops);
  await scan(db, { home, discoverProjects: false }); // re-label happens
  const again = await adopt(db, 'https://github.com/x/repo', {}, ops);
  assert.equal(again.already_tracked, true);
  assert.deepEqual(again.tracked, ['ui-ux-pro-max']);
  assert.equal(again.adopted_version, '2.11.0');
});
