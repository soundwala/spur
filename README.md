# SPUR — Skill & Plugin Update Radar

Knows which Claude Code skills and plugins you have installed, where (user scope, per project, marketplace cache), and whether their source repos have moved since you installed them. Everything runs locally; the only outbound traffic is asking git hosts / registries whether upstream changed.

**One engine, two surfaces:**

- **Chat** — a Claude Code plugin skill: ask *"are any of my skills out of date?"* and get an answer in prose.
- **Dashboard** — a local web UI with a sortable table of every install and its freshness.

SPUR also tracks **itself** as an entry in its own index — it will tell you when SPUR is out of date.

## Packages

| Package | What it is |
|---|---|
| [`packages/engine`](packages/engine) | The shared brain (npm: `@soundwala/spur`, bin: `spur`). Scans, resolves sources, checks upstream, stores a sqlite index. No UI. |
| [`packages/claude-plugin`](packages/claude-plugin) | Thin Claude Code plugin exposing the engine as a chat skill. |
| [`packages/dashboard`](packages/dashboard) | Thin local web server rendering the same index. |

## Quick start (dev)

```sh
npm install
npm run build
node packages/engine/dist/cli.js        # scan + check + print status JSON
```

## Status detection

1. Marketplace plugins → `gitCommitSha` from `~/.claude/plugins/installed_plugins.json` vs upstream HEAD.
2. Git checkouts → local HEAD vs `git ls-remote` upstream.
3. Installer-CLI manifests → recorded source/version.
4. SPUR itself → installed version vs npm registry.
5. Anything else → honest `unknown_source` badge (v1 does not guess).

Full design context: [docs/skill-tracker-handoff.md](docs/skill-tracker-handoff.md).
