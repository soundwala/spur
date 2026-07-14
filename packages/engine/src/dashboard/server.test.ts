import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
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
