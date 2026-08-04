import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { request } from 'node:http';
import { startDashboard } from './server.js';

test('a malformed update body returns 400 and the server stays up', async () => {
  process.env.SPUR_HOME = mkdtempSync(join(tmpdir(), 'spur-dash-'));
  const server = startDashboard({ port: 0, open: false });
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  try {
    const bad = await fetch(`http://127.0.0.1:${port}/api/update`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    assert.equal(bad.status, 400);
    // If the bad request had crashed the process this second call could not succeed:
    const ok = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(ok.status, 200);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('mark-local moves a skill into the Local zone on next render', async () => {
  process.env.SPUR_HOME = mkdtempSync(join(tmpdir(), 'spur-dash-'));
  const server = startDashboard({ port: 0, open: false });
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/mark-local`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'my-skill' }),
    });
    assert.equal(r.status, 200);
    const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    assert.match(html, /Local \(/);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('adopt with a missing repo body returns 400 and the server stays up', async () => {
  process.env.SPUR_HOME = mkdtempSync(join(tmpdir(), 'spur-dash2-'));
  const server = startDashboard({ port: 0, open: false });
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  try {
    const bad = await fetch(`http://127.0.0.1:${port}/api/adopt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(bad.status, 400);
    assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('a request with a non-local Host header is rejected 403', async () => {
  process.env.SPUR_HOME = mkdtempSync(join(tmpdir(), 'spur-dash-host-'));
  const server = startDashboard({ port: 0, open: false });
  await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  try {
    // Test evil Host header (Node.js fetch doesn't support custom Host, so use http.request)
    const evilStatus = await new Promise<number>((resolve) => {
      const req = request(`http://127.0.0.1:${port}/api/status`, {
        headers: { Host: 'evil.example.com' }
      }, (res) => {
        resolve(res.statusCode ?? 500);
        res.on('data', () => {});
      });
      req.on('error', () => resolve(500));
      req.end();
    });
    assert.equal(evilStatus, 403);

    // Test default Host (127.0.0.1:<port> is used automatically)
    const ok = await fetch(`http://127.0.0.1:${port}/api/status`);
    assert.equal(ok.status, 200);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
