import test from 'node:test';
import assert from 'node:assert/strict';
import type { Entry } from '../types.js';
import { renderPage, groupEntries } from './page.js';

function entry(over: Partial<Entry> = {}): Entry {
  return {
    id: 'x',
    name: 'claude-mem',
    type: 'plugin',
    install_method: 'marketplace',
    scope: 'user',
    install_path: '/tmp/x',
    project_path: null,
    source_url: 'https://github.com/thedotmack/claude-mem',
    source_ref: null,
    source_path: null,
    marketplace: 'thedotmack',
    installed_commit: 'ec863370000000000000000000000000000000aa',
    installed_version: '13.5.5',
    latest_commit: 'f5633c10000000000000000000000000000000bb',
    latest_version: '13.11.0',
    behind_count: null,
    status: 'stale',
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

test('version-decided rows show a version delta, not commit shas', () => {
  const html = renderPage([entry()]);
  assert.match(html, /13\.5\.5 → 13\.11\.0/);
  assert.doesNotMatch(html, /ec86337 → f5633c1/); // the shas must not be shown
});

test('rows without an upstream version fall back to commit shas', () => {
  // catalog-less marketplace (e.g. netlify-skills): latest_version is null.
  const html = renderPage([entry({ latest_version: null })]);
  assert.match(html, /ec86337 → f5633c1/);
});

test('git checkouts with no versions still render commit shas', () => {
  const html = renderPage([
    entry({ install_method: 'git', installed_version: null, latest_version: null }),
  ]);
  assert.match(html, /ec86337 → f5633c1/);
});

test('groupEntries collapses same-named copies into one row with all ids', () => {
  const rows = groupEntries(
    [
      entry({ id: 'a', project_path: '/p/one', status: 'unknown_source', install_method: 'unknown', installed_version: null, latest_version: null }),
      entry({ id: 'b', project_path: '/p/two', status: 'unknown_source', install_method: 'unknown', installed_version: null, latest_version: null }),
    ],
    new Set(),
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0]!.ids.sort(), ['a', 'b']);
  assert.equal(rows[0]!.locations.length, 2);
  assert.equal(rows[0]!.zone, 'untraceable');
});

test('groupEntries marks a name as local when it is in the local set', () => {
  const rows = groupEntries(
    [entry({ status: 'unknown_source', install_method: 'unknown', name: 'mine', installed_version: null, latest_version: null })],
    new Set(['mine']),
  );
  assert.equal(rows[0]!.zone, 'local');
});

test('github-skill stale rows are updatable and land in the behind zone', () => {
  const rows = groupEntries(
    [entry({ install_method: 'github-skill', status: 'stale', name: 'ui-ux-pro-max', installed_version: '2.10.1', latest_version: '2.11.0' })],
    new Set(),
  );
  assert.equal(rows[0]!.zone, 'behind');
  assert.equal(rows[0]!.updatable, true);
});

test('untraceable rows render Set source and Mark local actions; local rows are collapsed', () => {
  const html = renderPage(
    [
      entry({ name: 'ui-ux-pro-max', status: 'unknown_source', install_method: 'unknown', installed_version: null, latest_version: null }),
      entry({ name: 'my-authored', status: 'unknown_source', install_method: 'unknown', installed_version: null, latest_version: null }),
    ],
    { local: ['my-authored'] },
  );
  assert.match(html, /setSource\('ui-ux-pro-max'\)/);
  assert.match(html, /markLocal\('ui-ux-pro-max'\)/);
  assert.match(html, /Local \(1\)/);
  assert.match(html, /Untraceable \(1\)/);
});

test('modified rows: behind zone, amber badge, no checkbox', () => {
  const rows = groupEntries(
    [entry({ install_method: 'github-skill', status: 'modified' as any, name: 'x', installed_version: null, latest_version: '2.12.0' })],
    new Set(),
  );
  assert.equal(rows[0]!.zone, 'behind');
  assert.equal(rows[0]!.updatable, false);
  const html = renderPage([entry({ install_method: 'github-skill', status: 'modified' as any, installed_version: null, latest_version: null })]);
  assert.match(html, /badge-warn">modified/);
  assert.doesNotMatch(html, /badge-danger">modified/);
});

test('ignored rows leave Behind for the Ignored section', () => {
  const e = entry({ install_method: 'github-skill', status: 'stale', name: 'muted-skill', installed_version: '1.0.0', latest_version: '1.1.0' });
  (e as any).ignored = true;
  const rows = groupEntries([e], new Set());
  assert.equal(rows[0]!.zone, 'ignored');
  assert.equal(rows[0]!.updatable, false);
  const html = renderPage([e]);
  assert.match(html, /Ignored \(1\)/);
});
