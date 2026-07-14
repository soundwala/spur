import type { Entry } from '../types.js';

const METHOD_CHIP: Record<string, string> = {
  marketplace: 'chip-blue',
  npm: 'chip-purple',
  git: 'chip-teal',
  'cli-manifest': 'chip-gray',
  unknown: 'chip-gray',
};

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
function short(v: string | null): string {
  return v ? (/^[0-9a-f]{7,40}$/.test(v) ? v.slice(0, 7) : v) : '—';
}
function updatable(e: Entry): boolean {
  return e.status === 'stale' && (e.install_method === 'marketplace' || e.install_method === 'git');
}

export function renderPage(entries: Entry[]): string {
  const counts = {
    stale: entries.filter((e) => e.status === 'stale').length,
    fresh: entries.filter((e) => e.status === 'fresh').length,
    unknown: entries.filter((e) => e.status === 'unknown_source').length,
  };
  const rows = entries
    .map((e) => {
      const chip = METHOD_CHIP[e.install_method] ?? 'chip-gray';
      const box = updatable(e) ? `<input type="checkbox" class="row" data-id="${esc(e.id)}" aria-label="Select ${esc(e.name)}">` : '';
      const badge =
        e.status === 'stale' ? `badge-danger">stale${e.behind_count ? ` · ${e.behind_count}` : ''}`
        : e.status === 'fresh' ? 'badge-success">fresh'
        : e.status === 'unknown_source' ? 'badge-muted">untraceable'
        : `badge-muted">${esc(e.status)}`;
      // Prefer a version delta (e.g. 13.5.5 → 13.11.0) whenever both sides carry
      // a version — that's the signal marketplace/npm updates actually move.
      // Fall back to commit shas for git checkouts and catalog-less marketplaces.
      const useVersion = Boolean(e.installed_version && e.latest_version);
      const col = (commit: string | null, version: string | null) =>
        useVersion ? version! : short(commit) !== '—' ? short(commit) : (version ?? '—');
      const installed = col(e.installed_commit, e.installed_version);
      const latest = col(e.latest_commit, e.latest_version);
      return `<tr>
        <td>${box}</td>
        <td><span class="chip ${chip}"></span><span class="nm">${esc(e.name)}${e.is_self ? ' · itself' : ''}<em>${esc(e.install_method)}</em></span></td>
        <td class="muted">${esc(e.project_path ?? e.scope)}</td>
        <td class="mono muted">${esc(installed)} → ${esc(latest)}</td>
        <td><span class="badge ${badge}</span></td>
      </tr>`;
    })
    .join('');

  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SPUR — Skill & Plugin Update Radar</title>
<style>
  :root { color-scheme: light dark; --bg:#fff; --fg:#111; --mut:#6b7280; --line:#e5e7eb; --card:#f6f6f4; --danger:#dc2626; --dbg:#fdeaea; --ok:#16a34a; --okbg:#e8f6ee; --accent:#185FA5; }
  @media (prefers-color-scheme: dark){ :root{ --bg:#1a1a19; --fg:#eee; --mut:#9a9a95; --line:#333; --card:#242422; --dbg:#3a1f1f; --okbg:#12301f; } }
  body{ font:14px/1.6 system-ui,sans-serif; color:var(--fg); background:var(--bg); margin:0; padding:2rem; }
  .wrap{ max-width:900px; margin:0 auto; }
  h1{ font-size:20px; font-weight:500; margin:0; display:flex; align-items:center; gap:10px; }
  .tiles{ display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin:1.25rem 0; }
  .tile{ border-radius:12px; padding:12px 14px; background:var(--card); }
  .tile.d{ background:var(--dbg); } .tile .n{ font-size:26px; font-weight:500; }
  table{ width:100%; border-collapse:collapse; border:.5px solid var(--line); border-radius:12px; overflow:hidden; }
  th,td{ text-align:left; padding:11px 12px; border-top:.5px solid var(--line); }
  thead th{ background:var(--card); border-top:0; }
  .nm{ display:inline-flex; flex-direction:column; } .nm em{ color:var(--mut); font-style:normal; font-size:12px; }
  .chip{ width:10px; height:10px; border-radius:3px; display:inline-block; margin-right:8px; vertical-align:1px; }
  .chip-blue{ background:#378ADD; } .chip-purple{ background:#7F77DD; } .chip-teal{ background:#1D9E75; } .chip-gray{ background:#888780; }
  .mono{ font-family:ui-monospace,monospace; } .muted{ color:var(--mut); }
  .badge{ padding:3px 10px; border-radius:999px; font-size:12px; font-weight:500; }
  .badge-danger{ background:var(--dbg); color:var(--danger); } .badge-success{ background:var(--okbg); color:var(--ok); } .badge-muted{ background:var(--card); color:var(--mut); }
  .bar{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:1.25rem; padding:12px 14px; border:.5px solid var(--line); border-radius:12px; background:var(--card); }
  button{ font:inherit; padding:8px 14px; border-radius:8px; border:.5px solid var(--line); background:var(--bg); color:var(--fg); cursor:pointer; }
  button.primary{ background:var(--accent); border-color:var(--accent); color:#fff; }
  button:disabled{ opacity:.5; cursor:default; }
  .done{ display:none; margin-top:1rem; padding:12px 14px; border-radius:12px; background:var(--okbg); color:var(--ok); }
</style>
<div class="wrap">
  <div style="display:flex;justify-content:space-between;align-items:center;">
    <h1>🛰️ SPUR</h1>
    <button onclick="rescan(this)">Rescan</button>
  </div>
  <div class="tiles">
    <div class="tile d"><div class="muted">Behind</div><div class="n" style="color:var(--danger)">${counts.stale}</div></div>
    <div class="tile"><div class="muted">Fresh</div><div class="n" style="color:var(--ok)">${counts.fresh}</div></div>
    <div class="tile"><div class="muted">Untraceable</div><div class="n">${counts.unknown}</div></div>
  </div>
  <table>
    <thead><tr><th style="width:34px"><input type="checkbox" id="all" aria-label="Select all"></th><th>Name</th><th>Where</th><th>Installed → latest</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="bar">
    <span class="muted"><span id="count">0</span> selected</span>
    <span style="display:flex;gap:8px;">
      <button id="sel" disabled onclick="run(selected())">Update selected</button>
      <button class="primary" onclick="run(allStale())">Update all stale</button>
    </span>
  </div>
  <div class="done" id="done"></div>
</div>
<script>
  const boxes = () => [...document.querySelectorAll('.row')];
  const selected = () => boxes().filter(b => b.checked).map(b => b.dataset.id);
  const allStale = () => boxes().map(b => b.dataset.id);
  function sync(){ const n = selected().length; document.getElementById('count').textContent = n; const s=document.getElementById('sel'); s.disabled=!n; s.textContent = n?('Update selected ('+n+')'):'Update selected'; }
  document.getElementById('all').onchange = e => { boxes().forEach(b => b.checked = e.target.checked); sync(); };
  boxes().forEach(b => b.onchange = sync);
  async function run(ids){
    if(!ids.length) return;
    const r = await fetch('/api/update',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ids})});
    const res = await r.json();
    const updated = res.filter(x=>x.outcome==='updated').length;
    const failed = res.filter(x=>x.outcome==='failed').length;
    const skipped = res.filter(x=>x.outcome==='skipped').length;
    const d = document.getElementById('done');
    d.style.display='block';
    let msg = 'Updated '+updated;
    if(failed) msg += ' · '+failed+' failed';
    if(skipped) msg += ' · '+skipped+' skipped';
    msg += updated ? ' · restart Claude Code to apply, then Rescan.' : '.';
    d.textContent = msg;
  }
  async function rescan(btn){ btn.disabled=true; btn.textContent='Scanning…'; await fetch('/api/rescan',{method:'POST'}); location.reload(); }
  sync();
</script>`;
}
