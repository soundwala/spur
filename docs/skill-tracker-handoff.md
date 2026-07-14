# Skill Tracker — Project Handoff Document for Claude Code

**Author of idea:** Shanks
**Date:** 13 July 2026
**Status:** Concept validated via research, architecture agreed, ready to scaffold
**Purpose of this doc:** Complete context transfer to Claude Code. Contains: how the idea originated, all research findings, all decisions made and agreed upon, open questions, and starter architecture. Nothing here is implemented yet unless marked otherwise.

---

## 1. How this started (origin conversation, condensed but complete)

### 1.1 The trigger question
Shanks uses several third-party skills in Claude Code — **superpowers, ui-ux pro max, impeccable** — all installed via CLI. He asked: *"Will these auto-update if the repo owner pushes updates? How does updating work?"*

### 1.2 The answer that revealed the gap
**No — updates are pull-based, not push-based, in every install path.** Nothing watches source repos in the background. Breakdown by install method:

1. **Marketplace/plugin system** (`/plugin marketplace add owner/repo` → `/plugin install skill@marketplace`):
   - Marketplace catalog is a cached copy of the repo's `.claude-plugin/marketplace.json`. Goes stale the moment the owner pushes.
   - Manual update required: `/plugin marketplace update <name>` then `/plugin update <plugin>` then `/reload-plugins`. Or uninstall/reinstall if update misbehaves.
   - No cron-like auto-update in Claude Code natively.
2. **Manual git clone or copy into `~/.claude/skills/` or `.claude/skills/`:**
   - Static snapshot. Zero connection to source unless user sets one up. Needs `git pull` or re-copy.
3. **Third-party installer CLIs** (e.g. `npx agent-skills-cli add owner/repo`):
   - Some write a manifest supporting `--auto-update` and have their own `update` command — but this depends entirely on that third-party tool, not Claude Code.

### 1.3 The product idea (Shanks)
*"Can I make a tool which understands what skills and plugins are used in which projects, and whether the source repos have been updated by the owner since install? People install globally or per-project. There are many methods devs use to organise folders that I'm unaware of."*

### 1.4 Target audience (Shanks, explicitly)
Two personas — the product must serve BOTH:
- **Native devs / hardcoders:** terminal-comfortable, want a glanceable dashboard.
- **"Vibe coders":** rarely touch a terminal, use Claude Code via the Claude app. For them, chat IS the interface. Zero terminal, zero separate dashboard required.

Shanks concluded: *"A user interface should make it a good convenience to see and act upon."*

---

## 2. Research findings — existing landscape (as of July 2026)

**Bottom line: the full problem is unsolved. Pieces exist. Nothing does end-to-end detection across mixed install methods with a UI for non-terminal users.**

### 2.1 The gap is officially acknowledged
- **anthropics/claude-code GitHub Issue #31462** — "Plugin update detection and upgrade workflow." Confirms: marketplace-installed plugins have no upstream-update detection and no native `claude plugin upgrade`. Users are patching with home-rolled shell scripts that diff `~/.claude/plugins/installed_plugins.json` (which stores `gitCommitSha` and marketplace source) against upstream commits. Maintainer sentiment in the issue: this belongs in the CLI itself. **Risk note: Anthropic may eventually ship native update detection — our differentiation must be the cross-method scanning + per-project mapping + dual UI, not just "update checker."**

### 2.2 Existing partial solutions (each solves a slice — potential add-on targets, none competes end-to-end)
| Project / product | What it does | What it does NOT do (our gap) |
|---|---|---|
| **claude-skill-evo** (atompilot) | Detects staleness of *generated* skills vs. your codebase; self-evolving skills | Doesn't check against upstream source repos; doesn't handle third-party installs |
| **glebis/claude-skills audit skill** | On-demand audit: skill health/staleness, project activity pulse, CLAUDE.md drift; prints report | Personal-workflow tool; no upstream commit diffing across install methods; no GUI |
| **"Plugin Health Check"** (mcpmarket) | Structural integrity, hook validation, stale sessions, frontmatter lint | Diagnostics only — not upstream freshness |
| **"Claude Plugin Updater"** (mcpmarket, Claude Toolshed ecosystem) | Checks for new versions on session start, manual force-update, health dashboard | Scoped to its own ecosystem's plugins, not universal cross-method |
| **SkillCheck** (getskillcheck.com) | Validates skill quality/schema/security against the Agent Skills standard; local-only | Quality validation, not freshness vs. source |
| **agent-skills-cli** | Installer with `--auto-update` manifest (`.claude-skills.json`) | Only tracks what IT installed; ignores everything else |
| **ccpi** (jeremylongshore) | Package-manager-style CLI: `ccpi update` pulls latest | Only for its own marketplace's plugins |

### 2.3 Technical facts discovered (building blocks — all inspectable locally)
- `~/.claude/plugins/installed_plugins.json` — tracks marketplace plugins with `gitCommitSha`, source, version, installPath, lastUpdated.
- `~/.claude/plugins/known_marketplaces.json` — marketplace registry with source type/URL.
- Plugins are **copied to a cache** on install (paths outside plugin dir break) — so installed copies genuinely diverge from source.
- Claude Code uses the plugin's **version as the cache key** for update availability.
- Known CLI quirk: `claude plugin install` doesn't auto-refresh a local marketplace clone before resolving names → misleading "not found" errors.
- Install scopes: **user scope** (`~/.claude/skills/`, all projects) and **project scope** (`.claude/skills/` in repo, shareable via version control).
- Manual installs are usually git checkouts → `git fetch --dry-run`, `git ls-remote`, or GitHub API can diff against upstream.
- For private repos: background auth via `GITHUB_TOKEN` / `GITLAB_TOKEN` / `BITBUCKET_TOKEN` env vars.

---

## 3. Product decisions (all explicitly agreed by Shanks)

### D1 — One engine, two surfaces ✅ AGREED
Scanning/resolution/staleness logic is identical regardless of who's asking; only presentation changes.
- **Surface A (vibe coder): Claude Code plugin/skill.** Conversational: "are any of my skills out of date?" → Claude reads the engine's index, answers in prose, offers to fix. Chat is the UI.
- **Surface B (hardcoder): local dashboard.** Sortable table (skill, project(s) using it, install method, current vs. latest commit, status badge), rescan button, optional scheduled background checks + native notifications.

### D2 — Build both surfaces together from day one ✅ CHOSEN by Shanks
Not sequential. Feasible because both are thin renderers over one data layer. Build order within that: engine's `scan()` + `getStatus()` first (print sane JSON to console), then both consumers become mechanical.

### D3 — Everything local ✅ CONFIRMED, with one carve-out
- Filesystem scanning, index storage, dashboard rendering, chat output: **all on user's machine. Nothing about the user or their setup is sent anywhere. No accounts, no backend to operate, nothing for Shanks to host or handle.**
- **Sole exception (unavoidable):** checking whether an upstream repo has new commits requires an outbound call (GitHub API or `git ls-remote`). You cannot know GitHub changed without asking GitHub.

### D4 — Self-awareness / dogfooding ✅ AGREED ("super solution, add that")
Shanks spotted the irony himself: this tool has the same blind spot about ITSELF — users who install it won't get updates when Shanks pushes to the repo.
**Fix (must be built in from day one, not bolted on):** the tool registers **its own repo as an entry in its own index**. Every scan also checks itself against upstream, and it can nag in chat: *"I'm 3 commits behind — want me to update myself?"* It dogfoods its own mechanism.

### D5 — Single-install packaging ✅ AGREED
Ship as ONE Claude Code plugin. On install, a postinstall hook spins up the dashboard as a background local server (`localhost:PORT`). The chat skill can say "open your dashboard" with a clickable link. One `/plugin install` → both surfaces exist. Fits the vibe-coder constraint: no separate app to discover, no second install step.

### D6 — MVP scope cut ✅ AGREED
Do NOT try to solve "totally unlabeled copy-pasted skill with zero git history" in v1 — that's the genuinely hard, maybe-unsolvable-cleanly case. **Detect it, mark it `unknown source`, move on.** The 80% case (marketplace plugins with `gitCommitSha` in manifest + git-cloned skills) covers most real installs and is straightforward.

### D7 — Language: Node/TypeScript (recommended, not hard-locked)
Rationale: the plugin ecosystem is npm-native (marketplaces, npx installers, JSON manifests); one language covers engine + plugin wrapper + dashboard server/UI. Override if a strong Python preference emerges.

---

## 4. Starter architecture (proposed in conversation — starting point, refine freely)

```
skill-tracker/
├── packages/
│   ├── engine/                 # the shared brain — no UI at all
│   │   ├── scan.ts             # walks known install paths + heuristic SKILL.md discovery
│   │   ├── resolve.ts          # git remote/HEAD, marketplace manifest, or "unknown source"
│   │   ├── check.ts            # GitHub API / git ls-remote, diffs commits
│   │   └── index.db            # sqlite — one row per skill/plugin, shared by both surfaces
│   ├── claude-plugin/          # thin wrapper: exposes engine as a Claude Code skill
│   │   └── skills/status/SKILL.md
│   └── dashboard/              # thin wrapper: local web server + UI reading index.db
│       └── server.ts
└── .claude-plugin/marketplace.json   # so /plugin install ships both at once
```

**Engine API (stable, boring, minimal):** `scan()`, `getStatus()`, `update(id)`. Both surfaces are renderers of this.

**Scan targets (minimum set — expect more in the wild, per Shanks's note that folder conventions vary widely):**
- `~/.claude/plugins/installed_plugins.json` + `known_marketplaces.json` (marketplace installs, richest metadata)
- `~/.claude/plugins/cache/` (installed plugin copies)
- `~/.claude/skills/` (user-scope manual skills)
- `<each project>/.claude/skills/` (project-scope — requires knowing/discovering project roots)
- Heuristic: any directory containing `SKILL.md` with YAML frontmatter
- `.claude-skills.json` manifests (agent-skills-cli installs)
- **Self:** the tool's own install, registered per D4

**Per-entry detection logic:**
1. Marketplace plugin? → read `gitCommitSha` + source from `installed_plugins.json`, compare with upstream HEAD (GitHub API / `git ls-remote`).
2. Git checkout? → `git remote get-url origin` + local HEAD vs. `git ls-remote` upstream HEAD.
3. Installer-CLI manifest present? → use its recorded source/version.
4. None of the above? → `unknown source` badge (per D6). Do not block on it.

**Index row (draft fields — schema discussion was offered but not yet done, see §5):** id, name, type (skill/plugin), install_method, scope (user/project), project_paths[], source_url, installed_commit/version, latest_commit/version, last_checked, status (fresh/stale/unknown/self), is_self (bool).

---

## 5. Open questions / not yet decided (CC should raise these at the right moment)
1. **Index schema finalization** — draft fields above were proposed; a deeper schema session was offered and deferred ("what fields each row needs to make staleness detection reliable across all install methods").
2. **Project discovery strategy** — how to find all project roots containing `.claude/skills/` without scanning the entire disk (candidates: track dirs where Claude Code was launched, a user-maintained watchlist, `~/.claude` project history if available).
3. **GitHub API rate limits** — unauthenticated is 60 req/hr; decide between `git ls-remote` (no rate limit, needs git) vs. API (needs optional token for heavy users / private repos via GITHUB_TOKEN etc.).
4. **Dashboard tech** — local web server was agreed; framework/stack not chosen.
5. **Background checking cadence** — session-start check vs. daemon vs. manual-only for v1.
6. **Update ACTIONS vs. detection-only** — detection is the core; how far v1 goes into one-click "fix it" (running `/plugin update`, `git pull` on the user's behalf) is not fully scoped. Chat surface implies at least offering to fix.
7. **Name** — "skill-tracker" is a placeholder.
8. **Positioning vs. Anthropic** — if native update detection ships (issue #31462), lean harder on cross-method scanning, per-project mapping, unknown-source detection, and the dual-surface UX.
9. **Add-on strategy** — the partial solutions in §2.2 could become integrations/add-ons over this app rather than competitors (Shanks explicitly wants this framing preserved).

---

## 6. What exists right now
- **This document.** No code has been written. The architecture in §4 is a conversation-level proposal, not scaffolding.
- Shanks's environment: works on Srround (Next.js/React/tRPC/Tailwind/shadcn stack familiarity), manages long Claude Code sessions, comfortable with monorepos.

## 7. Suggested first moves for Claude Code
1. Confirm the open questions in §5 that block scaffolding (mainly #1 schema and #3 upstream-check method).
2. Scaffold the monorepo per §4.
3. Build `engine/scan.ts` + `getStatus()` to console-JSON first (per D2's build order).
4. Register self-entry (D4) in the very first index version — it's a founding feature, not an enhancement.
5. Then parallelize the two surfaces.
