---
description: Update out-of-date Claude Code skills and plugins from the terminal, without opening the dashboard.
---

Help the user update stale installs conversationally.

1. Run `npx -y @soundwala/spur@latest` (or `spur`) and read the JSON report.
2. List the stale entries in plain prose: name, where it lives, and how far behind. Skip fresh and untraceable ones.
3. Ask which to update — a specific name, several, or "all". Wait for the answer. Do not update anything before the user chooses.
4. Run the update:
   - all → `spur update --all` (or `npx -y @soundwala/spur@latest update --all`)
   - specific → find each chosen entry's `id` in the report and run `spur update <id> <id> …`
5. Read the returned results array and report each outcome (updated / skipped / failed) with its message. If any `restart_required` is true, tell the user to restart Claude Code to apply.
