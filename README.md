<h1 align="center">🛰️ SPUR</h1>
<p align="center"><strong>Skill &amp; Plugin Update Radar for Claude Code</strong><br>
<em>Knows what you've installed, where it lives, and whether it's fallen behind.</em></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@soundwala/spur"><img alt="npm" src="https://img.shields.io/npm/v/@soundwala/spur?color=cb3837&label=%40soundwala%2Fspur"></a>
  <img alt="node" src="https://img.shields.io/badge/node-%E2%89%A522.5-339933">
  <img alt="status" src="https://img.shields.io/badge/status-early%20access-orange">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue">
</p>

> 🚧 **Early access.** SPUR is live on npm but still under active testing — expect rough edges and the occasional breaking change while it finds its feet. Kick the tires, and tell me what you find.

---

Ever installed a Claude Code skill months ago and later thought — *wait, is this even the latest version anymore?*

Same. That's the whole reason SPUR exists.

Here's the catch nobody mentions: updates in Claude Code are **pull-based**. Nothing is quietly watching the repos you installed from. Your `superpowers`, your gsap skills, that plugin you cloned during a late-night session — all slowly drifting behind upstream, with no single place to see which ones. **SPUR is that place.** It sweeps every way a skill or plugin can land on your machine, maps each copy to the projects using it, and checks it against its real source.

And yes — it watches **itself** too. SPUR puts its own install in its own index, so it'll nag you when SPUR is the thing that's out of date. Same blind spot, same cure.

Oh, and it's all local. The only thing that ever leaves your machine is a quiet *"hey, has this repo changed?"* to a git host or registry. No accounts, no server, nothing about your setup phoning home.

## Two ways to use it

Same brain underneath — pick whichever fits how you work:

- 💬 **Just ask.** With the Claude Code plugin, say *"are any of my skills out of date?"* and get a straight answer in plain English, plus an offer to fix it. No terminal needed — chat is the whole interface.
- 📊 **Or glance at it.** A local dashboard lays every install out in a sortable table: what it is, which projects use it, installed vs. latest, and a freshness badge — with checkboxes to update the stale ones (or "Update all behind" in one click). Copies of the same skill collapse into one row, source-less skills tuck into a collapsed section with a **Set source…** action to adopt them (or **Mark local** to hush the ones that are yours), and one button rescans.

## Get started

```sh
npm install -g @soundwala/spur
```

You'll need **Node ≥ 22.5** — SPUR leans on the built-in `node:sqlite`, so there's nothing to compile and no native deps to fight.

Then just run it:

```sh
spur           # scan everything, check upstream, show the report
spur scan      # just rescan what's installed (no network)
spur check     # just re-check against upstream
spur status    # show the last report, instantly
spur dashboard # start the local dashboard and open it in your browser

spur adopt <repo-url>            # teach SPUR where a hand-installed skill came from
spur add <repo-url> --skill <n>  # install a skill straight from a GitHub repo (or --all)
```

Copied a skill out of a GitHub repo by hand? It lands as `unknown_source` because the copy carries no trace of where it came from. Point SPUR at the repo once with `spur adopt` (it matches every copy across your projects in one go, even a whole monorepo of skills) and from then on SPUR checks it against the repo's latest release tag — and can update it for you, something Claude Code can't do for a source-less skill. `spur add` installs from a repo and records that provenance up front.

Here's the kind of thing it hands back — worst offenders first, one row per installed copy:

```jsonc
{
  "summary": { "total": 107, "fresh": 3, "stale": 4, "unknown_source": 100, "error": 0 },
  "entries": [
    { "name": "claude-mem", "install_method": "marketplace", "status": "stale", "installed_version": "13.5.5", "latest_version": "13.11.0" },
    { "name": "superpowers", "install_method": "marketplace", "status": "fresh", "installed_version": "6.1.1", "latest_version": "6.1.1" },
    { "name": "@soundwala/spur", "is_self": true, "install_method": "npm", "status": "fresh" }
  ]
}
```

*(Flags: `--db <path>`, `--no-enrich` to skip the commit-counting, `--compact` for one-line JSON.)*

## How it actually knows

SPUR is deliberately cheap first, thorough only where it counts:

| What you installed | How SPUR checks it |
|---|---|
| 🏪 **Marketplace plugin** | Compares the installed version against the marketplace's published version — the signal Claude Code actually updates on. No version to compare? Falls back to the recorded commit, then to "did anything change in this plugin's folder?" |
| 🌿 **Git checkout** | Your local `HEAD` vs. what the remote has now. |
| 🧩 **Adopted GitHub skill** | Once you've run `spur adopt`, its installed version vs. the repo's latest release tag — or, if there's no version recorded, whether your copy's files still match that tag. |
| 📦 **Installer-CLI skill** | The source and version the installer wrote down. |
| 🛰️ **SPUR itself** | Installed version vs. the npm registry. |
| ❓ **A mystery copy-paste** | Marked `unknown_source` and left alone — SPUR won't make up a status it can't prove. |

The heavy lifting is `git ls-remote` — no rate limits, works with any git host, and private repos just ride your existing credentials. The GitHub API only gets pinged to turn a bare "out of date" into a satisfying "**187 commits behind**", and only for things already flagged stale. Got a lot to check or private repos? Drop a `GITHUB_TOKEN` in your environment.

## What's under the hood

An npm workspaces monorepo — one engine, one thin surface on top:

| Package | What it does |
|---|---|
| [`packages/engine`](packages/engine) | The brain. Scans, resolves sources, checks upstream, stores the sqlite index — and now also serves the local dashboard. Ships as [`@soundwala/spur`](https://www.npmjs.com/package/@soundwala/spur). |
| [`packages/claude-plugin`](packages/claude-plugin) | Wires the engine into Claude Code as a chat skill. |

Want to hack on it?

```sh
git clone https://github.com/soundwala/spur.git && cd spur
npm install && npm run build
npm test                                 # the engine's unit tests
node packages/engine/dist/cli.js         # scan + check + print
```

## A few things I care about

- **Local first, always.** The scan, the index, the dashboard, the chat — all on your machine. The one exception is the freshness check itself, because there's no way to know GitHub moved without asking it.
- **One row per copy.** The same skill in two projects can sit at two different commits, so SPUR tracks each one on its own instead of averaging them into a status that's quietly wrong.
- **Honest about the unknowable.** A copy-pasted skill with no history and no manifest gets an honest shrug — `unknown_source` — never a made-up "you're up to date".

## Where it's headed

Fixing already works — the dashboard and `/spur-update` update stale installs for you. Still on the list:

- Auto-starting the dashboard on install, so one `/plugin install` stands up **both** surfaces with nothing else to run.
- Quiet background checks at session start, with real notifications.
- Teaching it to recognize those `unknown_source` copies by matching them to known public skill repos.

---

<p align="center">MIT © Shanks (<a href="https://github.com/soundwala">soundwala</a>) · built in the open</p>
