# @soundwala/spur

**SPUR — Skill & Plugin Update Radar.** The engine (and `spur` CLI) that knows which Claude Code skills and plugins you have installed, where, and whether their source repos have moved since you installed them. Local-only; the only outbound traffic is asking git hosts / registries whether upstream changed.

## Install

```sh
npm install -g @soundwala/spur
```

## CLI

```sh
spur           # scan + check + print a status report (JSON)
spur scan      # rescan install locations (no upstream calls)
spur check     # check known entries against upstream
spur status    # print the last stored status, no scan/check
```

Options: `--db <path>` (default `~/.spur/index.db`), `--no-enrich` (skip GitHub compare-API behind-counts), `--compact`.

## Programmatic

```ts
import { openDb, defaultDbPath, scan, check, getStatus } from '@soundwala/spur';

const db = openDb();
await scan(db);
await check(db);
const report = getStatus(db, defaultDbPath()); // { summary, entries }
```

## How it detects staleness

1. Marketplace plugins → `gitCommitSha` vs upstream HEAD (`git ls-remote`); if a record has no sha, fall back to catalog-version compare, then commit-activity in the plugin's subtree.
2. Git checkouts → local HEAD vs upstream.
3. Installer-CLI manifests → recorded source/version.
4. SPUR itself → installed version vs the npm registry.
5. Anything else → an honest `unknown_source` badge.

Requires Node ≥ 22.5 (uses the built-in `node:sqlite`). MIT licensed.
