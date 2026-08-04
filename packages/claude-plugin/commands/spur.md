---
description: Check installed Claude Code skills and plugins for updates and open the SPUR dashboard to review and fix them.
---

Run SPUR and open the dashboard so the user can review and fix stale installs.

1. Run `npx -y @soundwala/spur@latest` (or `spur` if on PATH) and read the JSON. Do NOT print raw JSON.
2. One-line summary of the `summary` counts: behind, fresh, tracked GitHub skills, untraceable, and — if any — modified/unverified. E.g. "3 behind, 26 fresh, 7 tracked; 2 you've edited (modified). Opening your dashboard…".
3. Start the dashboard in the background: `npx -y @soundwala/spur@latest dashboard` (or `spur dashboard`); share http://localhost:4680 as a clickable link.
4. Explain the actions available: tick stale rows and Update (restart Claude Code after, for marketplace plugins); **Set source…** on an untraceable skill to adopt its GitHub repo; **Mark local** to hush your own skills.
5. If any entries are **modified** (the user edited a tracked skill) or **unverified** (SPUR can't confirm the copy is untouched), say so plainly: these are skipped by bulk update and are NOT overwritten. To take upstream anyway, use `spur update <id> --force` (a backup is saved first; `spur restore` brings it back).
