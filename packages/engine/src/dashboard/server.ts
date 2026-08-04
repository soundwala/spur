import { createServer, type Server } from 'node:http';
import { openDb, defaultDbPath } from '../db.js';
import { getStatus } from '../status.js';
import { scan } from '../scan.js';
import { check } from '../check.js';
import { update } from '../update.js';
import { adopt } from '../adopt.js';
import { markLocal, loadStore } from '../sources.js';
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
    const host = (req.headers.host ?? '').split(':')[0];
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]' && host !== '::1') {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('forbidden: non-local host');
      return;
    }
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const db = openDb();
    try {
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
          let body: { ids?: unknown };
          try {
            body = await readJson(req);
          } catch {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end('{"error":"invalid json body"}');
            return;
          }
          const results = await update(db, { ids: Array.isArray(body.ids) ? body.ids : [] });
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(results));
        } else if (url.pathname === '/api/mark-local' && req.method === 'POST') {
          let body: { name?: unknown };
          try { body = await readJson(req); } catch { res.writeHead(400); res.end('{"error":"invalid json body"}'); return; }
          if (typeof body.name !== 'string' || !body.name) { res.writeHead(400); res.end('{"error":"name required"}'); return; }
          markLocal(body.name);
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(getStatus(db, defaultDbPath())));
        } else if (url.pathname === '/api/adopt' && req.method === 'POST') {
          let body: { repo?: unknown; project?: unknown };
          try { body = await readJson(req); } catch { res.writeHead(400); res.end('{"error":"invalid json body"}'); return; }
          if (typeof body.repo !== 'string' || !body.repo) { res.writeHead(400); res.end('{"error":"repo required"}'); return; }
          try {
            const result = await adopt(db, body.repo, { project: typeof body.project === 'string' ? body.project : undefined });
            await scan(db); // re-label the newly-adopted skills as github-skill before checking
            await check(db);
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (err) {
            res.writeHead(502, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          }
        } else if (url.pathname === '/') {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end(renderPage(getStatus(db, defaultDbPath()).entries, { local: loadStore().local }));
        } else {
          res.writeHead(404, { 'content-type': 'text/plain' });
          res.end('not found');
        }
      } catch {
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'text/plain' });
          res.end('internal error');
        }
      }
    } finally {
      db.close();
    }
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}`;
    if (opts.open) {
      process.stdout.write(`SPUR dashboard: ${url}\n`);
      openBrowser(url);
    }
  });
  return server;
}
