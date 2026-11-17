#!/usr/bin/env node
/**
 * Minimal authenticated token server for the example apps.
 *
 * - Users sign in with credentials configured in DEMO_USERS.
 * - Only a signed-in user can obtain a Nexconn access token, and only for
 *   their own user id (no arbitrary userId from the request is accepted).
 * - The Nexconn App Secret is read from the environment and never returned,
 *   logged or sent to the client.
 *
 * This is a development example, not a production auth service: sessions are
 * in memory and DEMO_USERS holds plain-text demo passwords.
 *
 * Environment:
 *   NEXCONN_APP_KEY      App Key from the Nexconn console (required)
 *   NEXCONN_APP_SECRET   App Secret (required, server-side only)
 *   NEXCONN_API_BASE     e.g. https://api.sg-light-api.com (default SG)
 *   DEMO_USERS           "alice:alicepass,bob:bobpass" (required)
 *   PORT                 default 8787
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const APP_KEY = process.env.NEXCONN_APP_KEY;
const APP_SECRET = process.env.NEXCONN_APP_SECRET;
const API_BASE = (process.env.NEXCONN_API_BASE ?? 'https://api.sg-light-api.com').replace(/\/$/, '');
const PORT = Number(process.env.PORT ?? 8787);
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

if (!APP_KEY || !APP_SECRET || !process.env.DEMO_USERS) {
  console.error('Set NEXCONN_APP_KEY, NEXCONN_APP_SECRET and DEMO_USERS before starting.');
  process.exit(1);
}

/** userId -> password */
const users = new Map(
  process.env.DEMO_USERS.split(',')
    .map((pair) => pair.trim().split(':'))
    .filter(([id, pass]) => /^[A-Za-z0-9]{1,64}$/.test(id ?? '') && pass)
);

/** sessionToken -> { userId, expiresAt } */
const sessions = new Map();

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function sign() {
  const nonce = randomBytes(8).toString('hex').slice(0, 16);
  const timestamp = String(Date.now());
  const signature = createHash('sha1').update(APP_SECRET + nonce + timestamp).digest('hex');
  return { 'App-Key': APP_KEY, 'Nonce': nonce, 'Timestamp': timestamp, 'Signature': signature };
}

async function issueAccessToken(userId) {
  const response = await fetch(`${API_BASE}/v4/auth/access-token/issue`, {
    method: 'POST',
    headers: { ...sign(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, name: userId }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.code !== 0 || typeof body.result?.accessToken !== 'string') {
    const error = new Error(`Nexconn token issue failed (HTTP ${response.status}, code ${body.code})`);
    error.status = 502;
    throw error;
  }
  return body.result.accessToken;
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16 * 1024) throw Object.assign(new Error('Body too large'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function sessionFor(req) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return undefined;
  }
  return session;
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/login') {
      const { userId, password } = await readJson(req);
      const expected = users.get(userId);
      if (!expected || !safeEqual(expected, password ?? '')) {
        return send(res, 401, { error: 'invalid_credentials' });
      }
      const sessionToken = randomBytes(24).toString('base64url');
      sessions.set(sessionToken, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
      return send(res, 200, { sessionToken, userId });
    }
    if (req.method === 'POST' && req.url === '/nexconn/token') {
      const session = sessionFor(req);
      if (!session) return send(res, 401, { error: 'unauthenticated' });
      // The token is always issued for the authenticated user only.
      const accessToken = await issueAccessToken(session.userId);
      return send(res, 200, { userId: session.userId, accessToken });
    }
    if (req.method === 'POST' && req.url === '/logout') {
      const header = req.headers.authorization ?? '';
      sessions.delete(header.startsWith('Bearer ') ? header.slice(7) : '');
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET' && req.url === '/health') {
      return send(res, 200, { ok: true, users: users.size });
    }
    return send(res, 404, { error: 'not_found' });
  } catch (error) {
    // Never echo secrets or upstream bodies to the client.
    console.error('[token-server]', error.message);
    return send(res, error.status ?? 500, { error: 'server_error', message: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`[token-server] listening on :${PORT} for ${users.size} demo users (${API_BASE})`);
});
