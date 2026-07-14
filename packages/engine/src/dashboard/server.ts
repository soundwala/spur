import { createServer, type Server } from 'node:http';
import { openDb, defaultDbPath } from '../db.js';
import { getStatus } from '../status.js';
import { scan } from '../scan.js';
import { check } from '../check.js';
import { update } from '../update.js';
import { renderPage } from './page.js';
import { openBrowser } from './open.js';

const PORT = Number(process.env.SPUR_PORT ?? 4680);

async function readJson(req: import('node:http').IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

export function startDashboard(opts: { port?: number; open?: boolean } = {}): Server {
  const port = opts.port ?? PORT;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const db = openDb();
    try {
      if (url.pathname === '/api/status') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(getStatus(db, defaultDbPath())));
      } else if (url.pathname === '/api/rescan' && req.method === 'POST') {
        await scan(db);
        await check(db);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(getStatus(db, defaultDbPath())));
      } else if (url.pathname === '/api/update' && req.method === 'POST') {
        const body = await readJson(req);
        const results = await update(db, { ids: Array.isArray(body.ids) ? body.ids : [] });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(results));
      } else if (url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(renderPage(getStatus(db, defaultDbPath()).entries));
      } else {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
      }
    } finally {
      db.close();
    }
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}`;
    process.stdout.write(`SPUR dashboard: ${url}\n`);
    if (opts.open) openBrowser(url);
  });
  return server;
}
