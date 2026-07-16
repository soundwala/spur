import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SkillSource } from './types.js';
import {
  loadStore, resolveSource, isLocal, markLocal, upsertSource, setAdoptedVersion,
} from './sources.js';
import { setIgnore, clearIgnore, ignoreValueFor } from './sources.js';

function freshHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'spur-src-'));
  process.env.SPUR_HOME = home;
  return home;
}

const src = (over: Partial<SkillSource> = {}): SkillSource => ({
  repo: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill',
  ref: null,
  version_source: 'tag',
  skills: { 'ui-ux-pro-max': '.claude/skills/ui-ux-pro-max' },
  adopted_version: '2.11.0',
  ...over,
});

test('upsertSource then resolveSource finds a skill by name (global)', () => {
  freshHome();
  upsertSource(src());
  const hit = resolveSource('ui-ux-pro-max', null);
  assert.equal(hit?.source.repo, 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill');
  assert.equal(hit?.subpath, '.claude/skills/ui-ux-pro-max');
  assert.equal(resolveSource('nope', null), null);
});

test('upsertSource merges skills into the same repo record', () => {
  freshHome();
  upsertSource(src());
  upsertSource(src({ skills: { design: '.claude/skills/design' } }));
  const store = loadStore();
  assert.equal(store.sources.length, 1);
  assert.deepEqual(Object.keys(store.sources[0]!.skills).sort(), ['design', 'ui-ux-pro-max']);
});

test('a project .spur.json wins over the global store', () => {
  freshHome();
  upsertSource(src({ repo: 'https://github.com/global/repo' }));
  const project = mkdtempSync(join(tmpdir(), 'spur-proj-'));
  writeFileSync(
    join(project, '.spur.json'),
    JSON.stringify({ sources: [src({ repo: 'https://github.com/project/repo' })], local: [] }),
  );
  assert.equal(resolveSource('ui-ux-pro-max', project)?.source.repo, 'https://github.com/project/repo');
  assert.equal(resolveSource('ui-ux-pro-max', null)?.source.repo, 'https://github.com/global/repo');
});

test('markLocal / isLocal round-trip', () => {
  freshHome();
  assert.equal(isLocal('my-skill', null), false);
  markLocal('my-skill');
  assert.equal(isLocal('my-skill', null), true);
});

test('setAdoptedVersion updates the recorded baseline', () => {
  freshHome();
  upsertSource(src({ adopted_version: '2.10.1' }));
  setAdoptedVersion('ui-ux-pro-max', null, '2.11.0');
  assert.equal(loadStore().sources[0]!.adopted_version, '2.11.0');
});

test('setIgnore/clearIgnore by skill name or repo url', () => {
  freshHome();
  upsertSource(src());
  assert.equal(setIgnore('ui-ux-pro-max', '2.12.0'), true);       // by skill name
  assert.equal(ignoreValueFor('ui-ux-pro-max', null), '2.12.0');
  assert.equal(setIgnore('https://github.com/nextlevelbuilder/ui-ux-pro-max-skill', 'repo'), true); // by repo
  assert.equal(ignoreValueFor('ui-ux-pro-max', null), 'repo');
  assert.equal(clearIgnore('ui-ux-pro-max'), true);
  assert.equal(ignoreValueFor('ui-ux-pro-max', null), null);
  assert.equal(setIgnore('no-such-thing', 'repo'), false);
});
