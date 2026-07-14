import type { Entry, EntryStatus, InstallMethod } from '../types.js';

const METHOD_CHIP: Record<string, string> = {
  marketplace: 'chip-blue',
  npm: 'chip-purple',
  git: 'chip-teal',
  'github-skill': 'chip-green',
  'cli-manifest': 'chip-gray',
  unknown: 'chip-gray',
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
function short(v: string | null): string {
  return v ? (/^[0-9a-f]{7,40}$/.test(v) ? v.slice(0, 7) : v) : '—';
}
function columns(e: Entry): { installed: string; latest: string } {
  // Prefer a version delta when both sides carry a version; else commit shas.
  const useVersion = Boolean(e.installed_version && e.latest_version);
  const col = (commit: string | null, version: string | null) =>
    useVersion ? version! : short(commit) !== '—' ? short(commit) : (version ?? '—');
  return { installed: col(e.installed_commit, e.installed_version), latest: col(e.latest_commit, e.latest_version) };
}

export interface GroupedRow {
  name: string;
  install_method: InstallMethod;
  zone: 'behind' | 'fresh' | 'untraceable' | 'local';
  status: EntryStatus;
  locations: string[];
  ids: string[];
  installed: string;
  latest: string;
  behind_count: number | null;
  updatable: boolean;
}

const STATUS_RANK: Record<string, number> = { stale: 0, error: 1, unchecked: 2, unknown_source: 3, fresh: 4 };

function rollUp(copies: Entry[]): EntryStatus {
  return copies.map((c) => c.status).sort((a, b) => (STATUS_RANK[a] ?? 9) - (STATUS_RANK[b] ?? 9))[0]!;
}

function zoneOf(status: EntryStatus, name: string, local: Set<string>): GroupedRow['zone'] {
  if (status === 'unknown_source') return local.has(name) ? 'local' : 'untraceable';
  if (status === 'stale') return 'behind';
  return 'fresh';
}

/** Collapse same (name, install_method) copies into one display row. Display-only. */
export function groupEntries(entries: Entry[], local: Set<string>): GroupedRow[] {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = `${e.name}\0${e.install_method}`;
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }
  const rows: GroupedRow[] = [];
  for (const copies of groups.values()) {
    const e = copies[0]!;
    const status = rollUp(copies);
    const { installed, latest } = columns(e);
    rows.push({
      name: e.name,
      install_method: e.install_method,
      zone: zoneOf(status, e.name, local),
      status,
      locations: copies.map((c) => c.project_path ?? c.scope),
      ids: copies.map((c) => c.id),
      installed,
      latest,
      behind_count: e.behind_count,
      updatable:
        status === 'stale' &&
        (e.install_method === 'marketplace' || e.install_method === 'git' || e.install_method === 'github-skill'),
    });
  }
  return rows;
}

function badge(g: GroupedRow): string {
  if (g.status === 'stale') return `badge-danger">stale${g.behind_count ? ` · ${g.behind_count}` : ''}`;
  if (g.status === 'fresh') return 'badge-success">fresh';
  if (g.status === 'unknown_source') return g.zone === 'local' ? 'badge-muted">local' : 'badge-muted">untraceable';
  return `badge-muted">${esc(g.status)}`;
}

function row(g: GroupedRow, withActions: boolean): string {
  const chip = METHOD_CHIP[g.install_method] ?? 'chip-gray';
  const box = g.updatable
    ? `<input type="checkbox" class="row" data-ids="${esc(g.ids.join(','))}" aria-label="Select ${esc(g.name)}">`
    : '';
  const where = g.locations.length > 1 ? `${g.locations.length} copies` : esc(g.locations[0] ?? '');
  const actions = withActions
    ? `<button class="mini" onclick="setSource('${esc(g.name)}')">Set source…</button>
       <button class="mini" onclick="markLocal('${esc(g.name)}')">Mark local</button>`
    : '';
  return `<tr>
    <td>${box}</td>
    <td><span class="chip ${chip}"></span><span class="nm">${esc(g.name)}<em>${esc(g.install_method)}</em></span></td>
    <td class="muted">${where}</td>
    <td class="mono muted">${esc(g.installed)} → ${esc(g.latest)}</td>
    <td><span class="badge ${badge(g)}</span></td>
    <td class="act">${actions}</td>
  </tr>`;
}

function section(rows: GroupedRow[], withActions = false): string {
  return rows.map((g) => row(g, withActions)).join('');
}

export function renderPage(entries: Entry[], opts: { local?: string[] } = {}): string {
  const local = new Set(opts.local ?? []);
  const rows = groupEntries(entries, local);
  const behind = rows.filter((g) => g.zone === 'behind');
  const fresh = rows.filter((g) => g.zone === 'fresh');
  const untraceable = rows.filter((g) => g.zone === 'untraceable');
  const localRows = rows.filter((g) => g.zone === 'local');
  const trackedCount = rows.filter((g) => g.install_method === 'github-skill').length;

  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SPUR — Skill & Plugin Update Radar</title>
<style>
  :root { color-scheme: light dark; --bg:#fff; --fg:#111; --mut:#6b7280; --line:#e5e7eb; --card:#f6f6f4; --danger:#dc2626; --dbg:#fdeaea; --ok:#16a34a; --okbg:#e8f6ee; --accent:#185FA5; }
  @media (prefers-color-scheme: dark){ :root{ --bg:#1a1a19; --fg:#eee; --mut:#9a9a95; --line:#333; --card:#242422; --dbg:#3a1f1f; --okbg:#12301f; } }
  body{ font:14px/1.6 system-ui,sans-serif; color:var(--fg); background:var(--bg); margin:0; padding:2rem; }
  .wrap{ max-width:960px; margin:0 auto; }
  h1{ font-size:20px; font-weight:500; margin:0; display:flex; align-items:center; gap:10px; }
  .tiles{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:1.25rem 0; }
  .tile{ border-radius:12px; padding:12px 14px; background:var(--card); }
  .tile.d{ background:var(--dbg); } .tile .n{ font-size:26px; font-weight:500; }
  table{ width:100%; border-collapse:collapse; border:.5px solid var(--line); border-radius:12px; overflow:hidden; }
  th,td{ text-align:left; padding:11px 12px; border-top:.5px solid var(--line); }
  thead th{ background:var(--card); border-top:0; }
  .nm{ display:inline-flex; flex-direction:column; } .nm em{ color:var(--mut); font-style:normal; font-size:12px; }
  .chip{ width:10px; height:10px; border-radius:3px; display:inline-block; margin-right:8px; vertical-align:1px; }
  .chip-blue{ background:#378ADD; } .chip-purple{ background:#7F77DD; } .chip-teal{ background:#1D9E75; } .chip-green{ background:#3F9E4D; } .chip-gray{ background:#888780; }
  .mono{ font-family:ui-monospace,monospace; } .muted{ color:var(--mut); }
  .badge{ padding:3px 10px; border-radius:999px; font-size:12px; font-weight:500; }
  .badge-danger{ background:var(--dbg); color:var(--danger); } .badge-success{ background:var(--okbg); color:var(--ok); } .badge-muted{ background:var(--card); color:var(--mut); }
  .act{ white-space:nowrap; text-align:right; }
  .mini{ font:inherit; font-size:12px; padding:4px 8px; border-radius:6px; border:.5px solid var(--line); background:var(--bg); color:var(--fg); cursor:pointer; }
  details{ margin-top:1rem; border:.5px solid var(--line); border-radius:12px; overflow:hidden; }
  summary{ padding:11px 14px; cursor:pointer; background:var(--card); font-weight:500; }
  h2{ font-size:13px; font-weight:600; color:var(--mut); text-transform:uppercase; letter-spacing:.04em; margin:1.5rem 0 .5rem; }
  .bar{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:1.25rem; padding:12px 14px; border:.5px solid var(--line); border-radius:12px; background:var(--card); }
  button{ font:inherit; padding:8px 14px; border-radius:8px; border:.5px solid var(--line); background:var(--bg); color:var(--fg); cursor:pointer; }
  button.primary{ background:var(--accent); border-color:var(--accent); color:#fff; }
  button:disabled{ opacity:.5; cursor:default; }
</style>
<div class="wrap">
  <div style="display:flex;justify-content:space-between;align-items:center;">
    <h1>🛰️ SPUR</h1>
    <button onclick="rescan(this)">Rescan</button>
  </div>
  <div class="tiles">
    <div class="tile d"><div class="muted">Behind</div><div class="n" style="color:var(--danger)">${behind.length}</div></div>
    <div class="tile"><div class="muted">Fresh</div><div class="n" style="color:var(--ok)">${fresh.length}</div></div>
    <div class="tile"><div class="muted">Tracked skills</div><div class="n">${trackedCount}</div></div>
    <div class="tile"><div class="muted">Local</div><div class="n">${localRows.length}</div></div>
  </div>

  <h2>Behind</h2>
  <table><thead><tr><th style="width:34px"><input type="checkbox" id="all" aria-label="Select all"></th><th>Name</th><th>Where</th><th>Installed → latest</th><th>Status</th><th></th></tr></thead>
    <tbody>${behind.length ? section(behind) : '<tr><td colspan="6" class="muted">Nothing behind. 🎉</td></tr>'}</tbody>
  </table>

  <h2>Up to date</h2>
  <table><thead><tr><th></th><th>Name</th><th>Where</th><th>Installed → latest</th><th>Status</th><th></th></tr></thead>
    <tbody>${fresh.length ? section(fresh) : '<tr><td colspan="6" class="muted">—</td></tr>'}</tbody>
  </table>

  <details>
    <summary>Untraceable (${untraceable.length}) — source-less skills; set a GitHub source to track them</summary>
    <table><tbody>${untraceable.length ? section(untraceable, true) : '<tr><td class="muted">None 🎉</td></tr>'}</tbody></table>
  </details>

  <details>
    <summary>Local (${localRows.length}) — skills you marked as having no upstream</summary>
    <table><tbody>${localRows.length ? section(localRows) : '<tr><td class="muted">None</td></tr>'}</tbody></table>
  </details>

  <div class="bar">
    <span class="muted"><span id="count">0</span> selected</span>
    <span style="display:flex;gap:8px;">
      <button id="sel" disabled onclick="run(selected())">Update selected</button>
      <button class="primary" onclick="run(allBehind())">Update all behind</button>
    </span>
  </div>
  <div class="done" id="done" style="display:none;margin-top:1rem;padding:12px 14px;border-radius:12px;background:var(--okbg);color:var(--ok)"></div>
</div>
<script>
  const boxes = () => [...document.querySelectorAll('.row')];
  const idsOf = b => b.dataset.ids.split(',');
  const selected = () => boxes().filter(b => b.checked).flatMap(idsOf);
  const allBehind = () => boxes().flatMap(idsOf);
  function sync(){ const n = boxes().filter(b=>b.checked).length; document.getElementById('count').textContent = n; const s=document.getElementById('sel'); s.disabled=!n; s.textContent = n?('Update selected ('+n+')'):'Update selected'; }
  const all = document.getElementById('all');
  if (all) all.onchange = e => { boxes().forEach(b => b.checked = e.target.checked); sync(); };
  boxes().forEach(b => b.onchange = sync);
  async function run(ids){
    if(!ids.length) return;
    const r = await fetch('/api/update',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ids})});
    const res = await r.json();
    const updated = res.filter(x=>x.outcome==='updated').length;
    const failed = res.filter(x=>x.outcome==='failed').length;
    const skipped = res.filter(x=>x.outcome==='skipped').length;
    const restart = res.some(x=>x.restart_required);
    const d = document.getElementById('done');
    d.style.display='block';
    let msg = 'Updated '+updated; if(failed) msg += ' · '+failed+' failed'; if(skipped) msg += ' · '+skipped+' skipped';
    msg += updated ? (restart ? ' · restart Claude Code to apply, then Rescan.' : ' · Rescan to confirm.') : '.';
    d.textContent = msg;
  }
  async function setSource(name){
    const repo = window.prompt('GitHub repo URL that provides "'+name+'":');
    if(!repo) return;
    const r = await fetch('/api/adopt',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({repo})});
    const res = await r.json();
    if(res && res.tracked) window.alert('Now tracking '+res.tracked.length+' skill(s) from this repo.');
    location.reload();
  }
  async function markLocal(name){
    await fetch('/api/mark-local',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});
    location.reload();
  }
  async function rescan(btn){ btn.disabled=true; btn.textContent='Scanning…'; await fetch('/api/rescan',{method:'POST'}); location.reload(); }
  sync();
</script>`;
}
