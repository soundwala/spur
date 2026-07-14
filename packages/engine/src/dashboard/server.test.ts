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
