---
name: spur
description: Check whether installed Claude Code skills and plugins are out of date compared to their source repos. Use when the user asks "are my skills up to date?", "check for skill/plugin updates", "what skills do I have installed and where?", "is <skill> stale?", or anything about skill/plugin freshness, versions, or update status.
---

# SPUR — Skill & Plugin Update Radar

SPUR maintains a local index of every installed skill/plugin (marketplace installs, git checkouts, manual copies) and compares each against its upstream source. Everything is local; the only network traffic is asking git hosts/registries whether upstream moved.

## How to answer

1. Run the engine and capture its JSON report:

   ```sh
   npx -y @soundwala/spur
   ```

   (If `spur` is already on PATH, plain `spur` works too. `spur status` skips network checks and reads the last stored result.)

2. Interpret the JSON for the user in plain prose — do NOT dump raw JSON:
   - `summary` has counts: total, fresh, stale, unknown_source, error, unchecked.
   - `entries` is sorted worst-first. For each **stale** entry mention: `name`, `install_method`, where it lives (`scope` + `project_path`), and `behind_count` when present ("3 commits behind"). When `behind_count` is null just say "out of date".
   - `unknown_source` entries were manually copied with no traceable origin — say SPUR can see them but cannot check them (that's expected, not an error).
   - `error` entries have the reason in `last_check_error`.
   - An entry with `is_self: true` is SPUR itself — if it is stale, tell the user SPUR has an update available for itself.

3. If the user wants to fix stale items, offer the right action per `install_method`:
   - `marketplace` → `/plugin marketplace update <marketplace>` then `/plugin update <plugin>` then `/reload-plugins`.
   - `git` → `git -C <install_path> pull`.
   - `npm` (SPUR itself) → `npm i -g @soundwala/spur@latest`.
   Ask before running anything that mutates the user's installs.
