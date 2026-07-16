import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackup, listBackups, restoreBackup } from './backup.js';

function setup() {
  process.env.SPUR_HOME = mkdtempSync(join(tmpdir(), 'spur-bk-'));
  const install = join(mkdtempSync(join(tmpdir(), 'spur-proj-')), 'ui-ux-pro-max');
  mkdirSync(join(install, 'data'), { recursive: true });
  writeFileSync(join(install, 'SKILL.md'), 'MY EDITS');
  writeFileSync(join(install, 'data', 'c.csv'), 'my,rows');
  return install;
}
const entry = (install: string) => ({
  name: 'ui-ux-pro-max', install_path: install, project_path: '/p/Ulladum',
  source_url: 'https://github.com/x/y', installed_version: '2.11.0',
});

test('backup captures hierarchy and metadata; restore round-trips', () => {
  const install = setup();
  const info = createBackup(entry(install), 'forced update over modified');
  assert.match(info.id, /__Ulladum__ui-ux-pro-max$/);
  assert.equal(listBackups()[0]?.id, info.id);
  // damage then restore
  writeFileSync(join(install, 'SKILL.md'), 'CLOBBERED');
  rmSync(join(install, 'data', 'c.csv'));
  const { restored_to } = restoreBackup(info.id);
  assert.equal(restored_to, install);
  assert.equal(readFileSync(join(install, 'SKILL.md'), 'utf8'), 'MY EDITS');
  assert.equal(readFileSync(join(install, 'data', 'c.csv'), 'utf8'), 'my,rows');
});

test('restore to a missing original path requires --to', () => {
  const install = setup();
  const info = createBackup(entry(install), 'test');
  rmSync(join(install, '..'), { recursive: true, force: true }); // parent gone
  assert.throws(() => restoreBackup(info.id), /--to/);
  const alt = mkdtempSync(join(tmpdir(), 'spur-alt-'));
  const { restored_to } = restoreBackup(info.id, { to: join(alt, 'ui-ux-pro-max') });
  assert.equal(readFileSync(join(restored_to, 'SKILL.md'), 'utf8'), 'MY EDITS');
});
