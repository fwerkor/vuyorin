import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import WebSocket from 'ws';

async function unusedPort(): Promise<number> {
  const tcp = createServer();
  await new Promise<void>(resolve => tcp.listen(0, '127.0.0.1', resolve));
  const address = tcp.address();
  if (typeof address !== 'object' || !address) throw new Error('port allocation failed');
  const port = address.port;
  await new Promise<void>(resolve => tcp.close(() => resolve()));
  return port;
}

test('HTTP auth endpoints and anonymous WebSocket rejection', { timeout: 20_000 }, async t => {
  const port = await unusedPort();
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), PUBLIC_BASE_URL: 'https://vuyorin.fwerkor.com', OIDC_CLIENT_ID: 'vuyorin-web' },
    stdio: 'ignore'
  });
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(base + '/api/health', { signal: AbortSignal.timeout(500) });
      if (response.ok) { ready = true; break; }
    } catch { /* Starting server. */ }
    await delay(75);
  }
  assert.ok(ready, 'server should become ready');
  assert.deepEqual((await (await fetch(base + '/api/health')).json()).ok, true);
  const me = await fetch(base + '/api/me');
  assert.equal(me.status, 401);
  assert.equal((await me.json()).authenticated, false);

  const login = await fetch(base + '/auth/login', { redirect: 'manual' });
  assert.equal(login.status, 302);
  const authorization = new URL(login.headers.get('location')!);
  assert.equal(authorization.origin, 'https://account.fwerkor.com');
  assert.equal(authorization.searchParams.get('client_id'), 'vuyorin-web');
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorization.searchParams.get('redirect_uri'), 'https://vuyorin.fwerkor.com/auth/callback');
  assert.match(login.headers.get('set-cookie') || '', /Secure/);

  const callback = await fetch(base + '/auth/callback?code=fake&state=fake');
  assert.equal(callback.status, 400);

  const rejected = await new Promise<number>((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: 'https://vuyorin.fwerkor.com' });
    socket.on('unexpected-response', (_request, response) => {
      response.resume();
      resolve(response.statusCode || 0);
    });
    socket.on('error', reject);
  });
  assert.equal(rejected, 403);
});
