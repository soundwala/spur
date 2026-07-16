#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { openDb, defaultDbPath } from './db.js';
import { scan } from './scan.js';
import { check } from './check.js';
import { getStatus } from './status.js';
import { update } from './update.js';
import { startDashboard } from './dashboard/server.js';
import { gitAvailable } from './git.js';

const HELP = `spur — Skill & Plugin Update Radar

Usage:
  spur              scan + check + print status report (JSON)
  spur scan         rescan install locations, print status (no upstream calls)
  spur check        check known entries against upstream, print status
  spur status       print the last stored status without scanning or checking
  spur update [ids…]  update entries (all stale with --all, or by id)
  spur dashboard      start the local dashboard and open it in your browser
  spur adopt <repo-url>            record a GitHub repo as the source for matching installed skills
  spur add <repo-url> --skill <n>  install skill(s) from a GitHub repo (or --all)
  spur restore [id]    list backups, or restore one (made by forced updates)

Options:
  --db <path>       index location (default: ~/.spur/index.db, or $SPUR_HOME)
  --no-enrich       skip GitHub compare-API enrichment (behind_count)
  --compact         single-line JSON output
  --skill <name>    (add) skill to install; repeatable
  --all             (add) install every skill the repo provides
  --scope <s>       (add) user | project (default: user)
  --project <path>  write provenance to <path>/.spur.json instead of the global store
  --to <path>       (restore) restore to a different location
  --force           (update) overwrite modified/unverified copies (backs up first); only applies when targeting ids explicitly, not with --all
  -h, --help        show this help
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      db: { type: 'string' },
      'no-enrich': { type: 'boolean', default: false },
      compact: { type: 'boolean', default: false },
      all: { type: 'boolean', default: false },
      skill: { type: 'string', multiple: true },
      scope: { type: 'string' },
      project: { type: 'string' },
      to: { type: 'string' },
      force: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }

  const command = positionals[0] ?? 'all';
  if (command === 'dashboard') {
    startDashboard({ open: true });
    return; // server keeps the event loop alive
  }
  if (command === 'restore') {
    const { listBackups, restoreBackup } = await import('./backup.js');
    const id = positionals[1];
    if (!id) {
      process.stdout.write(JSON.stringify(listBackups(), null, values.compact ? 0 : 2) + '\n');
      return;
    }
    const res = restoreBackup(id, { to: values.to });
    process.stdout.write(JSON.stringify(res, null, values.compact ? 0 : 2) + '\n');
    return;
  }
  const dbPath = values.db ?? defaultDbPath();
  const db = openDb(dbPath);

  try {
    if (command === 'adopt') {
      const repo = positionals[1];
      if (!repo) { process.stderr.write('usage: spur adopt <repo-url>\n'); process.exitCode = 2; return; }
      await scan(db);
      const { adopt } = await import('./adopt.js');
      const res = await adopt(db, repo, { project: values.project });
      await scan(db); // re-label the newly-adopted skills as github-skill before checking
      await check(db, { enrich: !values['no-enrich'] });
      process.stdout.write(JSON.stringify(res, null, values.compact ? 0 : 2) + '\n');
      return;
    }
    if (command === 'add') {
      const repo = positionals[1];
      if (!repo) { process.stderr.write('usage: spur add <repo-url> --skill <name>… | --all\n'); process.exitCode = 2; return; }
      const { install } = await import('./adopt.js');
      const scope = values.scope === 'project' ? 'project' : 'user';
      const res = await install(repo, {
        skills: values.skill as string[] | undefined,
        all: values.all,
        scope,
        projectPath: values.project,
      });
      await scan(db);
      await check(db, { enrich: !values['no-enrich'] });
      process.stdout.write(JSON.stringify(res, null, values.compact ? 0 : 2) + '\n');
      return;
    }
    if (command === 'scan' || command === 'all') {
      await scan(db);
    }
    if (command === 'check' || command === 'all') {
      if (!(await gitAvailable())) {
        process.stderr.write('warning: git not found on PATH — git-backed entries will report errors\n');
      }
      await check(db, { enrich: !values['no-enrich'] });
    }
    if (command === 'update') {
      const ids = positionals.slice(1);
      const results = await update(db, { ids: ids.length ? ids : undefined, all: values.all, force: values.force });
      process.stdout.write(JSON.stringify(results, null, values.compact ? 0 : 2) + '\n');
      return;
    }
    if (!['scan', 'check', 'status', 'update', 'adopt', 'add', 'restore', 'all'].includes(command)) {
      process.stderr.write(`unknown command: ${command}\n\n${HELP}`);
      process.exitCode = 2;
      return;
    }
    const report = getStatus(db, dbPath);
    process.stdout.write(JSON.stringify(report, null, values.compact ? 0 : 2) + '\n');
  } finally {
    db.close();
  }
}

main().catch((err) => {
  process.stderr.write(`spur: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
