---
description: Check installed Claude Code skills and plugins for updates and open the SPUR dashboard to review and fix them.
---

Run SPUR and open the dashboard so the user can review and fix stale installs.

1. Run `npx -y @soundwala/spur@latest` (or `spur` if it is on PATH) and read the JSON. Do NOT print raw JSON.
2. Give a one-line summary: how many are stale, fresh, and untraceable — e.g. "4 plugins are behind, 3 are fresh. Opening your dashboard…".
3. Start the dashboard in the background: run `npx -y @soundwala/spur@latest dashboard` (or `spur dashboard`) and share the link http://localhost:4680 as a clickable URL.
4. Tell the user they can tick the ones they want and click Update, or "Update all stale", and that they'll need to restart Claude Code afterward for updates to apply.
