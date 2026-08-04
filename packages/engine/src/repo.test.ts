import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTag, compareVersions, discoverSkills, hashDir, copyDirOver, realRepoOps, latestTag, listShippedFiles, hashManifest, copyFiles } from './repo.js';

test('parseTag extracts semver from v-prefixed and bare tags', () => {
  assert.deepEqual(parseTag('v2.11.0'), { tag: 'v2.11.0', version: '2.11.0' });
  assert.deepEqual(parseTag('2.10.1'), { tag: '2.10.1', version: '2.10.1' });
  assert.equal(parseTag('nightly'), null);
});

test('compareVersions orders semver numerically', () => {
  assert.ok(compareVersions('2.11.0', '2.9.0') > 0);
  assert.ok(compareVersions('2.10.0', '2.10.1') < 0);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
});

test('discoverSkills finds skills under .claude/skills with their subpaths', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spur-repo-'));
  const skill = join(dir, '.claude', 'skills', 'ui-ux-pro-max');
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, 'SKILL.md'), '---\nname: ui-ux-pro-max\n---\nbody\n');
  const found = discoverSkills(dir);
  assert.equal(found['ui-ux-pro-max'], '.claude/skills/ui-ux-pro-max');
});

test('hashDir is stable and changes with content', () => {
  const a = mkdtempSync(join(tmpdir(), 'spur-h-'));
  writeFileSync(join(a, 'SKILL.md'), 'one');
  const h1 = hashDir(a);
  writeFileSync(join(a, 'SKILL.md'), 'two');
  const h2 = hashDir(a);
  assert.ok(h1 && h2 && h1 !== h2);
});

test('copyDirOver overwrites destination files', () => {
  const src = mkdtempSync(join(tmpdir(), 'spur-cs-'));
  const dst = mkdtempSync(join(tmpdir(), 'spur-cd-'));
  writeFileSync(join(src, 'SKILL.md'), 'new');
  writeFileSync(join(dst, 'SKILL.md'), 'old');
  copyDirOver(src, dst);
  assert.equal(readFileSync(join(dst, 'SKILL.md'), 'utf8'), 'new');
});

test('realRepoOps.tags + checkout against a local git fixture', async () => {
  const origin = mkdtempSync(join(tmpdir(), 'spur-origin-'));
  const run = (args: string[]) => execFileSync('git', args, { cwd: origin, stdio: 'ignore' });
  run(['init', '-q']);
  run(['config', 'user.email', 't@t']);
  run(['config', 'user.name', 't']);
  mkdirSync(join(origin, '.claude', 'skills', 'design'), { recursive: true });
  writeFileSync(join(origin, '.claude', 'skills', 'design', 'SKILL.md'), '---\nname: design\n---\nv1\n');
  run(['add', '-A']); run(['commit', '-qm', 'v1']); run(['tag', 'v1.0.0']);
  writeFileSync(join(origin, '.claude', 'skills', 'design', 'SKILL.md'), '---\nname: design\n---\nv2\n');
  run(['add', '-A']); run(['commit', '-qm', 'v2']); run(['tag', 'v2.0.0']);

  const latest = await latestTag(realRepoOps, origin);
  assert.equal(latest?.version, '2.0.0');
  const co = await realRepoOps.checkout(origin, 'v1.0.0');
  assert.ok(co && existsSync(join(co!.dir, '.claude', 'skills', 'design', 'SKILL.md')));
  assert.match(readFileSync(join(co!.dir, '.claude/skills/design/SKILL.md'), 'utf8'), /v1/);
  await co!.cleanup();
});

test('listShippedFiles excludes runtime droppings, sorted posix paths', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spur-ls-'));
  mkdirSync(join(dir, 'scripts', '__pycache__'), { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), 'x');
  writeFileSync(join(dir, 'scripts', 'a.py'), 'x');
  writeFileSync(join(dir, 'scripts', 'a.pyc'), 'x');
  writeFileSync(join(dir, 'scripts', '__pycache__', 'a.cpython-312.pyc'), 'x');
  writeFileSync(join(dir, '.DS_Store'), 'x');
  assert.deepEqual(listShippedFiles(dir), ['SKILL.md', 'scripts/a.py']);
  assert.deepEqual(listShippedFiles(join(dir, 'nope')), []);
});

test('hashManifest: extra files ignored, edits and deletions detected', () => {
  const a = mkdtempSync(join(tmpdir(), 'spur-hm-'));
  writeFileSync(join(a, 'SKILL.md'), 'body');
  const manifest = ['SKILL.md'];
  const clean = hashManifest(a, manifest);
  writeFileSync(join(a, 'notes.txt'), 'mine');              // user-added → ignored
  assert.equal(hashManifest(a, manifest), clean);
  writeFileSync(join(a, 'SKILL.md'), 'edited');             // edit → detected
  assert.notEqual(hashManifest(a, manifest), clean);
  rmSync(join(a, 'SKILL.md'));                              // deletion → detected
  assert.notEqual(hashManifest(a, manifest), clean);
});

test('copyFiles copies exactly the manifest, creating subdirs', () => {
  const src = mkdtempSync(join(tmpdir(), 'spur-cf-'));
  const dst = mkdtempSync(join(tmpdir(), 'spur-cfd-'));
  mkdirSync(join(src, 'data'), { recursive: true });
  writeFileSync(join(src, 'SKILL.md'), 'new');
  writeFileSync(join(src, 'data', 'x.csv'), 'rows');
  writeFileSync(join(src, 'ignore-me.txt'), 'no');
  writeFileSync(join(dst, 'mine.txt'), 'keep');
  copyFiles(src, dst, ['SKILL.md', 'data/x.csv']);
  assert.equal(readFileSync(join(dst, 'SKILL.md'), 'utf8'), 'new');
  assert.equal(readFileSync(join(dst, 'data', 'x.csv'), 'utf8'), 'rows');
  assert.equal(readFileSync(join(dst, 'mine.txt'), 'utf8'), 'keep'); // untouched
  assert.equal(existsSync(join(dst, 'ignore-me.txt')), false);
});

test('checkout of HEAD works (repos with no usable tags)', async () => {
  const origin = mkdtempSync(join(tmpdir(), 'spur-head-'));
  const run = (args: string[]) => execFileSync('git', args, { cwd: origin, stdio: 'ignore' });
  run(['init', '-q']); run(['config', 'user.email', 't@t']); run(['config', 'user.name', 't']);
  writeFileSync(join(origin, 'f.txt'), 'x');
  run(['add', '-A']); run(['commit', '-qm', 'c']);
  const co = await realRepoOps.checkout(origin, 'HEAD');
  assert.ok(co && existsSync(join(co!.dir, 'f.txt')));
  await co!.cleanup();
});

test('sparse checkout fetches only the named subtree, not the whole repo', async () => {
  const origin = mkdtempSync(join(tmpdir(), 'spur-sparse-'));
  const run = (args: string[]) => execFileSync('git', args, { cwd: origin, stdio: 'ignore' });
  run(['init', '-q']); run(['config', 'user.email', 't@t']); run(['config', 'user.name', 't']);
  // a big-ish file at the repo root that we must NOT fetch, plus a small skill subtree
  writeFileSync(join(origin, 'HEAVY.bin'), 'x'.repeat(200_000));
  mkdirSync(join(origin, '.claude', 'skills', 'imp'), { recursive: true });
  writeFileSync(join(origin, '.claude', 'skills', 'imp', 'SKILL.md'), '---\nname: imp\n---\nbody\n');
  run(['add', '-A']); run(['commit', '-qm', 'c']);

  const co = await realRepoOps.checkout(origin, 'HEAD', ['.claude/skills/imp']);
  assert.ok(co, 'sparse checkout succeeded');
  assert.ok(existsSync(join(co!.dir, '.claude', 'skills', 'imp', 'SKILL.md')), 'skill subtree present');
  assert.equal(existsSync(join(co!.dir, 'HEAVY.bin')), false, 'root heavy file excluded by sparse checkout');
  await co!.cleanup();
});

test('checkout without sparsePaths still fetches the whole repo (back-compat)', async () => {
  const origin = mkdtempSync(join(tmpdir(), 'spur-full-'));
  const run = (args: string[]) => execFileSync('git', args, { cwd: origin, stdio: 'ignore' });
  run(['init', '-q']); run(['config', 'user.email', 't@t']); run(['config', 'user.name', 't']);
  writeFileSync(join(origin, 'root.txt'), 'here');
  run(['add', '-A']); run(['commit', '-qm', 'c']);
  const co = await realRepoOps.checkout(origin, 'HEAD');
  assert.ok(co && existsSync(join(co!.dir, 'root.txt')));
  await co!.cleanup();
});
