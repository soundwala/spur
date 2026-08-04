---
description: Update out-of-date Claude Code skills and plugins from the terminal, without opening the dashboard.
---

Help the user update stale installs conversationally.

1. Run `npx -y @soundwala/spur@latest` (or `spur`) and read the JSON report.
2. List the stale entries in plain prose: name, where it lives, and installed → latest. Skip fresh, untraceable, and ignored ones. Call out any **modified**/**unverified** entries separately — they won't be touched without `--force`.
3. Ask which to update — a name, several, or "all". Wait for the answer. Update nothing before the user chooses.
4. Run the update:
   - all → `spur update --all` (or `npx -y @soundwala/spur@latest update --all`)
   - specific → find each entry's `id` in the report and run `spur update <id> <id> …`
   - a modified/unverified copy the user explicitly wants replaced → `spur update <id> --force` (backs up first; `spur restore` lists/undoes backups)
5. Report each outcome (updated / skipped / failed) with its message. If any `restart_required` is true (marketplace plugins), tell the user to restart Claude Code.
6. Mention the escape hatches: `spur ignore <name> [version]` to mute an update (a version, or `--repo` for the whole repo), and `spur restore` to roll back a forced update.
