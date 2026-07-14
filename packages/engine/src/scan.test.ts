import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from './db.js';
import { scan } from './scan.js';

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

  const skill = items.find((i) => i.name === 'my-skill');
  assert.ok(skill, 'loose skill found');
  assert.equal(skill?.install_method, 'unknown'); // not a git checkout → honest unknown (D6)

  const self = items.find((i) => i.is_self);
  assert.ok(self, 'self-entry registered (D4)');
  assert.equal(self?.install_method, 'npm');
});
