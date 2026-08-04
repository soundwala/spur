import test from 'node:test';
import assert from 'node:assert/strict';
import { realVersion, relSourcePath, catalogVersionFor, versionOutcome, frontmatterVersion, skillDirVersion } from './fallback.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('realVersion filters the manifest "unknown" sentinel and blanks', () => {
  assert.equal(realVersion('1.2.3'), '1.2.3');
  assert.equal(realVersion('unknown'), null);
  assert.equal(realVersion(''), null);
  assert.equal(realVersion(null), null);
  assert.equal(realVersion(undefined), null);
});

test('relSourcePath extracts in-repo path from a relative catalog source', () => {
  assert.equal(relSourcePath('./plugins/frontend-design'), 'plugins/frontend-design');
  assert.equal(relSourcePath('./x'), 'x');
  assert.equal(relSourcePath('owner/repo'), null); // external repo, not a path
  assert.equal(relSourcePath({ source: 'github', repo: 'o/r' }), null);
  assert.equal(relSourcePath(undefined), null);
});

test('catalogVersionFor finds a plugin version in a marketplace catalog', () => {
  const catalog = { plugins: [{ name: 'a', version: '2.0.0' }, { name: 'b' }] };
  assert.equal(catalogVersionFor(catalog, 'a'), '2.0.0');
  assert.equal(catalogVersionFor(catalog, 'b'), null); // entry exists, no version
  assert.equal(catalogVersionFor(catalog, 'missing'), null);
  assert.equal(catalogVersionFor(null, 'a'), null);
});

test('versionOutcome compares installed vs upstream versions', () => {
  assert.equal(versionOutcome('1.0.0', '1.0.0'), 'fresh');
  assert.equal(versionOutcome('1.0.0', '1.1.0'), 'stale');
  assert.equal(versionOutcome(null, '1.0.0'), null); // can't decide
  assert.equal(versionOutcome('1.0.0', null), null);
});

test('frontmatterVersion reads version from frontmatter only', () => {
  assert.equal(frontmatterVersion('---\nname: x\nversion: 3.9.1\n---\nbody'), '3.9.1');
  assert.equal(frontmatterVersion('---\nname: x\n---\nversion: 9.9.9'), null); // body doesn't count
  assert.equal(frontmatterVersion('---\nname: x\nversion: unknown\n---\n'), null); // sentinel filtered
  assert.equal(frontmatterVersion('no frontmatter'), null);
});

test('skillDirVersion reads SKILL.md in a dir', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spur-fm-'));
  writeFileSync(join(dir, 'SKILL.md'), '---\nname: imp\nversion: 3.9.1\n---\n');
  assert.equal(skillDirVersion(dir), '3.9.1');
  assert.equal(skillDirVersion(join(dir, 'nope')), null);
});
