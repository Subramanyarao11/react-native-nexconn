/**
 * Live test of the example token server against the real Nexconn Server API.
 * Opt-in: skipped unless credentials are present in the environment.
 * Never prints tokens or the App Secret (only lengths/status).
 *
 *   NEXCONN_APP_KEY=... NEXCONN_APP_SECRET=... \
 *   NEXCONN_API_BASE=https://api.sg-light-api.com \
 *   NEXCONN_TEST_USERS=alice,bob \
 *   node .yarn/releases/yarn-4.18.1.cjs test:live
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const required = ['NEXCONN_APP_KEY', 'NEXCONN_APP_SECRET'];
const missing = required.filter((k) => !process.env[k]);
const skip = missing.length > 0 ? `set ${missing.join(', ')} to run live tests` : false;

const users = (process.env.NEXCONN_TEST_USERS ?? 'rnlivealice,rnlivebob')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);
const passwords = Object.fromEntries(users.map((u) => [u, randomBytes(9).toString('base64url')]));

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function startServer() {
  const port = await freePort();
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('../../examples/token-server/server.mjs', import.meta.url))],
    {
      env: {
        ...process.env,
        PORT: String(port),
        DEMO_USERS: users.map((u) => `${u}:${passwords[u]}`).join(','),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${base}/health`);
      if (r.ok) return { base, child, stderr: () => stderr };
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw new Error(`token server did not start: ${stderr}`);
}

const post = (url, body, headers = {}) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

test('token server issues real Nexconn tokens only to signed-in users', { skip, timeout: 60_000 }, async (t) => {
  const server = await startServer();
  t.after(() => server.child.kill());

  // Unauthenticated and wrong-password requests are refused.
  assert.equal((await post(`${server.base}/nexconn/token`)).status, 401);
  assert.equal((await post(`${server.base}/login`, { userId: users[0], password: 'wrong' })).status, 401);

  const tokens = new Set();
  for (const userId of users) {
    const login = await post(`${server.base}/login`, { userId, password: passwords[userId] });
    assert.equal(login.status, 200);
    const { sessionToken } = await login.json();

    const res = await post(`${server.base}/nexconn/token`, undefined, {
      Authorization: `Bearer ${sessionToken}`,
    });
    const body = await res.json();
    assert.equal(res.status, 200, `issue failed for ${userId}: ${body.message ?? ''} ${server.stderr()}`);
    assert.equal(body.userId, userId, 'token must be bound to the signed-in user');
    assert.equal(typeof body.accessToken, 'string');
    assert.ok(body.accessToken.length > 20 && body.accessToken.length <= 256);
    assert.equal(JSON.stringify(body).includes(process.env.NEXCONN_APP_SECRET), false);
    tokens.add(body.accessToken);
    t.diagnostic(`${userId}: token issued (${body.accessToken.length} chars)`);

    await post(`${server.base}/logout`, undefined, { Authorization: `Bearer ${sessionToken}` });
    const after = await post(`${server.base}/nexconn/token`, undefined, {
      Authorization: `Bearer ${sessionToken}`,
    });
    assert.equal(after.status, 401, 'session must be invalid after logout');
  }
  assert.equal(tokens.size, users.length, 'each user gets a distinct token');
});
