import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from './db.js';
import { scan } from './scan.js';
import { upsertSource } from './sources.js';

function fixtureHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'spur-home-'));
  const plugins = join(home, '.claude', 'plugins');
  mkdirSync(plugins, { recursive: true });
  writeFileSync(
    join(plugins, 'installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        'superpowers@official': [
          {
            scope: 'user',
            installPath: join(home, '.claude/plugins/cache/official/superpowers/6.1.1'),
            version: '6.1.1',
            gitCommitSha: '6fd4507659784c351abbd2bc264c7162cfd386dc',
          },
        ],
      },
    }),
  );
  writeFileSync(
    join(plugins, 'known_marketplaces.json'),
    JSON.stringify({
      official: {
        source: { source: 'github', repo: 'anthropics/claude-plugins-official' },
        installLocation: join(home, '.claude/plugins/marketplaces/official'),
      },
    }),
  );
  const skill = join(home, '.claude', 'skills', 'my-skill');
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, 'SKILL.md'), '---\nname: my-skill\ndescription: test\n---\nbody\n');
  return home;
}

test('scan finds marketplace plugins, loose skills, and registers self', async () => {
  const home = fixtureHome();
  const db = openDb(join(home, 'index.db'));
  const { items } = await scan(db, { home, discoverProjects: false });

  const plugin = items.find((i) => i.name === 'superpowers');
  assert.ok(plugin, 'marketplace plugin found');
  assert.equal(plugin?.install_method, 'marketplace');
  assert.equal(plugin?.installed_commit, '6fd4507659784c351abbd2bc264c7162cfd386dc');
  assert.equal(plugin?.source_url, 'https://github.com/anthropics/claude-plugins-official');
  assert.equal(plugin?.marketplace, 'official');

  const skill = items.find((i) => i.name === 'my-skill');
  assert.ok(skill, 'loose skill found');
  assert.equal(skill?.install_method, 'unknown'); // not a git checkout → honest unknown (D6)

  const self = items.find((i) => i.is_self);
  assert.ok(self, 'self-entry registered (D4)');
  assert.equal(self?.install_method, 'npm');
});

test('scan re-labels a loose skill as github-skill when a source matches', async () => {
  const home = mkdtempSync(join(tmpdir(), 'spur-home-'));
  process.env.SPUR_HOME = mkdtempSync(join(tmpdir(), 'spur-store-'));
  const skill = join(home, '.claude', 'skills', 'ui-ux-pro-max');
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, 'SKILL.md'), '---\nname: ui-ux-pro-max\ndescription: d\n---\nbody\n');
  upsertSource({
    repo: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill',
    ref: null,
    version_source: 'tag',
    skills: { 'ui-ux-pro-max': '.claude/skills/ui-ux-pro-max' },
    adopted_version: '2.11.0',
  });

  const db = openDb(join(home, 'index.db'));
  const { items } = await scan(db, { home, discoverProjects: false });
  const skillItem = items.find((i) => i.name === 'ui-ux-pro-max');
  assert.equal(skillItem?.install_method, 'github-skill');
  assert.equal(skillItem?.source_url, 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill');
  assert.equal(skillItem?.source_path, '.claude/skills/ui-ux-pro-max');
  assert.equal(skillItem?.installed_version, '2.11.0');
});

test('scan reads frontmatter version into installed_version', async () => {
  const home = mkdtempSync(join(tmpdir(), 'spur-home-'));
  process.env.SPUR_HOME = mkdtempSync(join(tmpdir(), 'spur-store-'));
  const skill = join(home, '.claude', 'skills', 'impeccable');
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, 'SKILL.md'), '---\nname: impeccable\nversion: 3.9.1\n---\nbody\n');
  const db = openDb(join(home, 'index.db'));
  const { items } = await scan(db, { home, discoverProjects: false });
  assert.equal(items.find((i) => i.name === 'impeccable')?.installed_version, '3.9.1');
});

test('scan frontmatter version wins over source adopted_version', async () => {
  const home = mkdtempSync(join(tmpdir(), 'spur-home-'));
  process.env.SPUR_HOME = mkdtempSync(join(tmpdir(), 'spur-store-'));
  const skill = join(home, '.claude', 'skills', 'conflict-skill');
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, 'SKILL.md'), '---\nname: conflict-skill\nversion: 9.9.9\n---\nbody\n');
  upsertSource({
    repo: 'https://github.com/test/conflict-skill',
    ref: null,
    version_source: 'tag',
    skills: { 'conflict-skill': '.claude/skills/conflict-skill' },
    adopted_version: '2.11.0',
  });

  const db = openDb(join(home, 'index.db'));
  const { items } = await scan(db, { home, discoverProjects: false });
  const skillItem = items.find((i) => i.name === 'conflict-skill');
  assert.equal(skillItem?.install_method, 'github-skill');
  assert.equal(skillItem?.installed_version, '9.9.9');
});
