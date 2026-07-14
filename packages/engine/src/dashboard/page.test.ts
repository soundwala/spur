import test from 'node:test';
import assert from 'node:assert/strict';
import type { Entry } from '../types.js';
import { renderPage } from './page.js';

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
