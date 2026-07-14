#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { openDb, defaultDbPath } from './db.js';
import { scan } from './scan.js';
import { check } from './check.js';
import { getStatus } from './status.js';
import { gitAvailable } from './git.js';

const HELP = `spur — Skill & Plugin Update Radar

Usage:
  spur              scan + check + print status report (JSON)
  spur scan         rescan install locations, print status (no upstream calls)
  spur check        check known entries against upstream, print status
  spur status       print the last stored status without scanning or checking

Options:
  --db <path>       index location (default: ~/.spur/index.db, or $SPUR_HOME)
  --no-enrich       skip GitHub compare-API enrichment (behind_count)
  --compact         single-line JSON output
  -h, --help        show this help
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      db: { type: 'string' },
      'no-enrich': { type: 'boolean', default: false },
      compact: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }

  const command = positionals[0] ?? 'all';
  const dbPath = values.db ?? defaultDbPath();
  const db = openDb(dbPath);

  try {
    if (command === 'scan' || command === 'all') {
      await scan(db);
    }
    if (command === 'check' || command === 'all') {
      if (!(await gitAvailable())) {
        process.stderr.write('warning: git not found on PATH — git-backed entries will report errors\n');
      }
      await check(db, { enrich: !values['no-enrich'] });
    }
    if (!['scan', 'check', 'status', 'all'].includes(command)) {
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
