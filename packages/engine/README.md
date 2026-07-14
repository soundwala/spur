# @soundwala/spur

**SPUR — Skill & Plugin Update Radar.** The engine (and `spur` CLI) that knows which Claude Code skills and plugins you have installed, where, and whether their source repos have moved since you installed them — and can update the stale ones. Local-only; the only outbound traffic is asking git hosts / registries whether upstream changed.

## Install

```sh
npm install -g @soundwala/spur
```

## CLI

```sh
spur              # scan + check + print a status report (JSON)
spur scan         # rescan install locations (no upstream calls)
spur check        # check known entries against upstream
spur status       # print the last stored status, no scan/check
spur update [ids] # update stale entries (all stale with --all, or by id)
spur dashboard    # start the local dashboard and open it in your browser
```

Options: `--db <path>` (default `~/.spur/index.db`), `--no-enrich` (skip GitHub compare-API behind-counts), `--all` (update every stale entry), `--compact`.

`spur update` runs the real fix per install method — `claude plugin update` for marketplace plugins, `git pull --ff-only` for checkouts — and leaves untraceable copies alone. Marketplace updates need a Claude Code restart to take effect.

## Programmatic

```ts
import { openDb, defaultDbPath, scan, check, getStatus, update, startDashboard } from '@soundwala/spur';

const db = openDb();
await scan(db);
await check(db);
const report = getStatus(db, defaultDbPath()); // { summary, entries }

await update(db, { all: true }); // fix every stale entry; returns UpdateResult[]
startDashboard({ open: true });  // serve the review-and-fix UI on http://localhost:4680
```

## How it detects staleness

1. Marketplace plugins → installed version vs the marketplace's published version (what `claude plugin update` acts on); if there's no version to compare, fall back to `gitCommitSha` vs upstream HEAD (`git ls-remote`), then commit-activity in the plugin's subtree.
2. Git checkouts → local HEAD vs upstream.
3. Installer-CLI manifests → recorded source/version.
4. SPUR itself → installed version vs the npm registry.
5. Anything else → an honest `unknown_source` badge.

Requires Node ≥ 22.5 (uses the built-in `node:sqlite`). MIT licensed.
