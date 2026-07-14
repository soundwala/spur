import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTag, compareVersions, discoverSkills, hashDir, copyDirOver, realRepoOps, latestTag } from './repo.js';

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
