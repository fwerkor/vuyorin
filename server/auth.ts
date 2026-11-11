import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { IncomingMessage, ServerResponse } from 'node:http';

const issuer = (process.env.OIDC_ISSUER || 'https://account.fwerkor.com').replace(/\/$/, '');
const baseURL = (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const clientId = process.env.OIDC_CLIENT_ID || 'vuyorin-web';
const callback = baseURL + '/auth/callback';
const secure = baseURL.startsWith('https://');
const SESSION_MS = 12 * 60 * 60 * 1000;
const pending = new Map<string, { verifier: string; nonce: string; tx: string; until: number }>();
const sessions = new Map<string, { user: User; until: number }>();
export interface User { id: string; name: string }
const rand = (bytes = 32): string => randomBytes(bytes).toString('base64url');
const sha256 = (text: string): string => createHash('sha256').update(text).digest('base64url');
const cookies = (req: IncomingMessage): Record<string, string> =>
  Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(v => v.length === 2));
function setCookie(res: ServerResponse, key: string, value: string, maxAge: number) {
  const cookie = `${key}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(Array.isArray(prev) ? prev : prev ? [String(prev)] : []), cookie]);
}
function redirect(res: ServerResponse, to: string) {
  res.writeHead(302, { Location: to, 'Cache-Control': 'no-store' });
  res.end();
}
function json(res: ServerResponse, status: number, data: object) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
export function userFromRequest(req: IncomingMessage): User | null {
  const id = cookies(req).vuyorin_session;
  if (!id) return null;
  const session = sessions.get(id);
  if (!session || session.until < Date.now()) { if (session) sessions.delete(id); return null; }
  return session.user;
}
export async function handleAuth(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (url.pathname === '/api/me') {
    const user = userFromRequest(req);
    json(res, user ? 200 : 401, user ? { authenticated: true, user } : { authenticated: false });
    return true;
  }
  if (url.pathname === '/auth/login') {
    if (userFromRequest(req)) { redirect(res, '/'); return true; }
    const verifier = rand(48), state = rand(), nonce = rand(), tx = rand();
    pending.set(state, { verifier, nonce, tx, until: Date.now() + 10 * 60_000 });
    setCookie(res, 'vuyorin_tx', tx, 600);
    const params = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: callback,
      scope: 'openid profile email', state, nonce, code_challenge: sha256(verifier), code_challenge_method: 'S256' });
    redirect(res, `${issuer}/oauth/authorize?${params.toString()}`);
    return true;
  }
  if (url.pathname === '/auth/callback') {
    const state = url.searchParams.get('state') || '';
    const code = url.searchParams.get('code') || '';
    const p = pending.get(state);
    pending.delete(state);
    setCookie(res, 'vuyorin_tx', '', 0);
    if (!p || !code || p.until < Date.now() || p.tx !== cookies(req).vuyorin_tx) {
      json(res, 400, { error: 'invalid_or_expired_oauth_transaction' }); return true;
    }
    try {
      const response = await fetch(`${issuer}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId,
          redirect_uri: callback, code, code_verifier: p.verifier }), signal: AbortSignal.timeout(12_000)
      });
      if (!response.ok) throw new Error(`token exchange HTTP ${response.status}`);
      const token = await response.json() as { id_token?: string };
      if (!token.id_token) throw new Error('missing id_token');
      const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
      const { payload } = await jwtVerify(token.id_token, jwks, { issuer, audience: clientId, algorithms: ['RS256'] });
      if (payload.nonce !== p.nonce || typeof payload.sub !== 'string') throw new Error('bad nonce/sub');
      const user: User = { id: payload.sub, name: String(payload.name || payload.preferred_username || '旅人').slice(0, 40) };
      const sid = rand();
      sessions.set(sid, { user, until: Date.now() + SESSION_MS });
      setCookie(res, 'vuyorin_session', sid, SESSION_MS / 1000);
      redirect(res, '/');
    } catch (error) {
      console.error('OIDC callback rejected:', error instanceof Error ? error.message : error);
      json(res, 401, { error: 'identity_verification_failed' });
    }
    return true;
  }
  if (url.pathname === '/auth/logout' && req.method === 'POST') {
    const sid = cookies(req).vuyorin_session;
    if (sid) sessions.delete(sid);
    setCookie(res, 'vuyorin_session', '', 0);
    json(res, 200, { ok: true });
    return true;
  }
  return false;
}
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of sessions) if (value.until < now) sessions.delete(key);
  for (const [key, value] of pending) if (value.until < now) pending.delete(key);
}, 60_000).unref();
