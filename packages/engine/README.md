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
spur update [ids] # update stale entries (all stale with --all, or by id; --force to overwrite modified/unverified copies)
spur dashboard    # start the local dashboard and open it in your browser
spur adopt <repo> # record a GitHub repo as the source for matching installed skills
spur add <repo>   # install skill(s) from a GitHub repo (--skill <name>… or --all)
spur restore [id] # restore a skill from its most recent pre-update backup
spur ignore <name> [version]   # mute a version (or --repo for the whole repo)
spur unignore <name> # clear a previously set ignore
spur --version   # print the installed version
```

Options: `--db <path>` (default `~/.spur/index.db`), `--no-enrich` (skip GitHub compare-API behind-counts), `--all` (update every stale entry, or install every skill a repo ships), `--skill <name>` (repeatable, for `add`), `--scope user|project`, `--project <path>` (write provenance to `<path>/.spur.json`), `--compact`.

`spur update` runs the real fix per install method — `claude plugin update` for marketplace plugins, `git pull --ff-only` for checkouts, and for adopted GitHub skills SPUR re-fetches the skill's subtree at the repo's latest release tag and overwrites the files in place (no restart needed). It leaves untraceable copies alone. Marketplace updates need a Claude Code restart to take effect. Copies you've edited are never overwritten by default — `--force` re-fetches after saving a backup under `~/.spur/backups/` (`spur restore` brings it back). Ignored repos/versions are skipped by bulk updates.

`spur adopt <repo>` matches the skills a repo ships against your source-less installs by name and records the mapping (globally, or in `<path>/.spur.json` with `--project`), so a single adopt can cover a whole monorepo of skills copied across several projects.

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
3. Adopted GitHub skills → SKILL.md frontmatter version vs upstream's (tags as fallback); with a pristine baseline, edited copies report *modified* and unidentifiable copies *unverified* instead of stale.
4. Installer-CLI manifests → recorded source/version.
5. SPUR itself → installed version vs the npm registry.
6. Anything else → an honest `unknown_source` badge.

Requires Node ≥ 22.5 (uses the built-in `node:sqlite`). MIT licensed.
