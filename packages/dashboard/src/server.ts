import { createServer } from 'node:http';
import { openDb, defaultDbPath, getStatus, scan, check, type Entry } from '@soundwala/spur';

const PORT = Number(process.env.SPUR_PORT ?? 4680);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const db = openDb();
  try {
    if (url.pathname === '/api/status') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(getStatus(db, defaultDbPath())));
      return;
    }
    if (url.pathname === '/api/rescan' && req.method === 'POST') {
      await scan(db);
      await check(db);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(getStatus(db, defaultDbPath())));
      return;
    }
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(page(getStatus(db, defaultDbPath()).entries));
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  } finally {
    db.close();
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`SPUR dashboard: http://localhost:${PORT}`);
});

const BADGE: Record<string, string> = {
  fresh: '#16a34a',
  stale: '#dc2626',
  unknown_source: '#6b7280',
  error: '#d97706',
  unchecked: '#2563eb',
};

function page(entries: Entry[]): string {
  const rows = entries
    .map(
      (e) => `<tr>
        <td>${esc(e.name)}${e.is_self ? ' <em>(SPUR itself)</em>' : ''}</td>
        <td>${esc(e.type)}</td>
        <td>${esc(e.install_method)}</td>
        <td>${esc(e.project_path ?? e.scope)}</td>
        <td><code>${esc(short(e.installed_commit) ?? e.installed_version ?? '—')}</code></td>
        <td><code>${esc(short(e.latest_commit) ?? e.latest_version ?? '—')}</code></td>
        <td><span class="badge" style="background:${BADGE[e.status] ?? '#6b7280'}">${esc(e.status)}</span>${
          e.behind_count ? ` ${e.behind_count} behind` : ''
        }</td>
      </tr>`,
    )
    .join('\n');
  return `<!doctype html>
<meta charset="utf-8">
<title>SPUR — Skill &amp; Plugin Update Radar</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 2rem; color: #111; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: .4rem .6rem; border-bottom: 1px solid #e5e7eb; }
  .badge { color: #fff; border-radius: 999px; padding: .1rem .55rem; font-size: 12px; }
  button { padding: .4rem .9rem; margin-bottom: 1rem; cursor: pointer; }
</style>
<h1>SPUR</h1>
<button onclick="rescan(this)">Rescan</button>
<table>
  <thead><tr><th>Name</th><th>Type</th><th>Method</th><th>Where</th><th>Installed</th><th>Latest</th><th>Status</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<script>
async function rescan(btn) {
  btn.disabled = true; btn.textContent = 'Scanning…';
  await fetch('/api/rescan', { method: 'POST' });
  location.reload();
}
</script>`;
}

function short(sha: string | null): string | null {
  return sha ? sha.slice(0, 8) : null;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
