import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Entry } from './types.js';
import type { RepoOps } from './repo.js';
import { checkEntry } from './check.js';

/** A marketplace plugin entry with the fields the check tiers read. */
function marketplaceEntry(over: Partial<Entry> = {}): Entry {
  return {
    id: 'x',
    name: 'superpowers',
    type: 'plugin',
    install_method: 'marketplace',
    scope: 'user',
    install_path: '/tmp/x',
    project_path: null,
    source_url: 'https://github.com/obra/superpowers.git',
    source_ref: null,
    source_path: null,
    marketplace: 'official',
    installed_commit: '6fd4507659784c351abbd2bc264c7162cfd386dc',
    installed_version: '6.1.1',
    latest_commit: null,
    latest_version: null,
    behind_count: null,
    status: 'unchecked',
    last_check_error: null,
    is_self: false,
    content_hash: null,
    pristine_hash: null,
    pristine_manifest: null,
    manifest_updated_at: null,
    first_seen_at: null,
    last_scanned_at: null,
    last_checked_at: null,
    ...over,
  };
}

const lsRemoteTo = (sha: string) => async () => sha;
const catalogWith = (name: string, version: string | undefined) => async () => ({
  plugins: version === undefined ? [{ name }] : [{ name, version }],
});
const noCatalog = async () => null;

test('marketplace plugin is fresh when installed VERSION matches upstream, even if the branch tip moved past the installed commit', async () => {
  // The exact real-world bug: installed commit (6fd4507) trails branch HEAD
  // (d884ae0) by many commits, but the published version is still 6.1.1 — which
  // is what `claude plugin update` acts on, so SPUR must not call it stale.
  const out = await checkEntry(
    marketplaceEntry(),
    lsRemoteTo('d884ae04edebef577e82ff7c4e143debd0bbec99'),
    catalogWith('superpowers', '6.1.1'),
    false,
    undefined,
  );
  assert.equal(out.status, 'fresh');
  assert.equal(out.behind_count, 0);
});

test('marketplace plugin is stale when a newer VERSION is published', async () => {
  const out = await checkEntry(
    marketplaceEntry(),
    lsRemoteTo('d884ae04edebef577e82ff7c4e143debd0bbec99'),
    catalogWith('superpowers', '6.2.0'),
    false,
    undefined,
  );
  assert.equal(out.status, 'stale');
});

test('marketplace plugin falls back to commit-vs-HEAD when versions are not comparable', async () => {
  // No upstream version in the catalog → version tier is inconclusive, so the
  // sha tier decides. Installed commit equals HEAD here → fresh.
  const out = await checkEntry(
    marketplaceEntry({ installed_commit: 'abc123' }),
    lsRemoteTo('abc123'),
    catalogWith('superpowers', undefined),
    false,
    undefined,
  );
  assert.equal(out.status, 'fresh');
});

test('git (non-marketplace) entries still decide staleness by commit', async () => {
  const out = await checkEntry(
    marketplaceEntry({ install_method: 'git', installed_commit: 'aaa', installed_version: '6.1.1' }),
    lsRemoteTo('bbb'),
    catalogWith('superpowers', '6.1.1'), // version matches, but must be ignored for git
    false,
    undefined,
  );
  assert.equal(out.status, 'stale');
});

function fakeRepo(version: string, subpathContent: string): RepoOps {
  const root = mkdtempSync(join(tmpdir(), 'spur-fake-'));
  const sub = join(root, '.claude', 'skills', 'ui-ux-pro-max');
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, 'SKILL.md'), subpathContent);
  return {
    tags: async () => [{ tag: `v${version}`, version }],
    checkout: async () => ({ dir: root, cleanup: async () => {} }),
  };
}

function ghEntry(over: Partial<Entry> = {}): Entry {
  return marketplaceEntry({
    install_method: 'github-skill',
    name: 'ui-ux-pro-max',
    source_url: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill',
    source_path: '.claude/skills/ui-ux-pro-max',
    installed_commit: null,
    ...over,
  });
}

test('github-skill: recorded version behind latest tag -> stale', async () => {
  const ops = fakeRepo('2.11.0', 'anything');
  const out = await checkEntry(ghEntry({ installed_version: '2.10.1' }), lsRemoteTo('x'), noCatalog, false, undefined, ops);
  assert.equal(out.status, 'stale');
  assert.equal(out.latest_version, '2.11.0');
});

test('github-skill: no recorded version, content matches latest -> fresh', async () => {
  const install = mkdtempSync(join(tmpdir(), 'spur-inst-'));
  writeFileSync(join(install, 'SKILL.md'), 'SAME');
  const ops = fakeRepo('2.11.0', 'SAME');
  const out = await checkEntry(
    ghEntry({ installed_version: null, install_path: install }),
    lsRemoteTo('x'), noCatalog, false, undefined, ops,
  );
  assert.equal(out.status, 'fresh');
});

test('github-skill: no recorded version, content differs -> stale', async () => {
  const install = mkdtempSync(join(tmpdir(), 'spur-inst2-'));
  writeFileSync(join(install, 'SKILL.md'), 'OLD');
  const ops = fakeRepo('2.11.0', 'NEW');
  const out = await checkEntry(
    ghEntry({ installed_version: null, install_path: install }),
    lsRemoteTo('x'), noCatalog, false, undefined, ops,
  );
  assert.equal(out.status, 'stale');
});
