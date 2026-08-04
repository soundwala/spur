# Changelog

All notable changes to `@soundwala/spur` are documented here. This project
follows [semantic versioning](https://semver.org/); `0.x` releases may change
behavior between minor versions while the tool is in early access.

## 0.3.1

First public release. (Versions 0.1.0–0.3.0 were pre-public development and are
not part of this repository's history.)

### Detection
- Scans every install path — marketplace plugins, git checkouts, installer-CLI
  manifests, adopted GitHub skills, and SPUR itself — and reports which are
  behind their source, one row per installed copy.
- Marketplace freshness is judged by published **version** (what `claude plugin
  update` acts on), not branch tip — no more false "N commits behind".
- Adopted GitHub skills: version from `SKILL.md` frontmatter first, then release
  tags, then a content hash; never throws on tag-less or oddly-tagged repos.

### Safety
- Four honest states: `fresh`, `stale`, `modified` (you edited it), `unverified`
  (no baseline to prove it's untouched).
- Updates **refuse to overwrite** a modified/unverified copy by default; `--force`
  takes a backup **before** writing, and `spur restore` brings it back.
- Sparse checkout fetches only the skill subtree, so large source repos don't
  time out.

### Managing
- `spur adopt <repo>` teaches SPUR where a hand-installed skill came from (one
  adopt can cover a whole monorepo of skills across projects).
- `spur add <repo>` installs a skill from a repo with provenance recorded.
- `spur ignore <name>` mutes a version (resurfaces on the next release) or the
  whole repo; `spur unignore` clears it.
- Local dashboard groups copies of a skill, zones them Behind / Fresh / Tracked /
  Local / Ignored, and offers Set-source / Mark-local actions.

Local-first: the only thing that leaves your machine is a freshness check to a
git host or registry. No accounts, no telemetry.
