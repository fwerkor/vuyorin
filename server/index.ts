import 'dotenv/config';
import { createServer, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleAuth } from './auth.js';
import { attachMultiplayer } from './world.js';

const port = Number(process.env.PORT || 3000);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const types: Record<string, string> = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.ico':'image/x-icon', '.wasm':'application/wasm', '.woff2':'font/woff2' };
function fail(res: ServerResponse, code: number) { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(code === 404 ? 'Not found' : 'Internal error'); }
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  try {
    const url = new URL(req.url || '/', process.env.PUBLIC_BASE_URL || 'http://localhost:3000');
    if (url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, service: 'vuyorin', version: '0.1.0' })); return;
    }
    if (await handleAuth(req, res, url)) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') { fail(res, 404); return; }
    let requested: string;
    try { requested = decodeURIComponent(url.pathname); } catch { fail(res, 404); return; }
    if (requested.includes('\0') || requested.includes('\\') || requested.split('/').includes('..')) { fail(res, 404); return; }
    const filepath = path.resolve(root, '.' + (requested === '/' ? '/index.html' : requested));
    if (filepath !== root && !filepath.startsWith(root + path.sep)) { fail(res, 404); return; }
    let filePath = filepath;
    try { if (!(await stat(filePath)).isFile()) throw new Error('not file'); }
    catch { if (requested.startsWith('/assets/') || requested.startsWith('/world/')) { fail(res, 404); return; } filePath = path.join(root, 'index.html'); }
    const content = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': (types[path.extname(filePath)] || 'application/octet-stream') + (['.html','.js','.css','.json'].includes(path.extname(filePath)) ? '; charset=utf-8' : ''),
      'Cache-Control': (filePath.includes('/assets/') || (filePath.includes('/world/v1/') && filePath.endsWith('.bin'))) ? 'public, max-age=31536000, immutable' : 'no-store' });
    if (req.method === 'HEAD') res.end(); else res.end(content);
  } catch (error) { console.error('HTTP error:', error); fail(res, 500); }
});
const wss = attachMultiplayer(server);
server.listen(port, '0.0.0.0', () => console.log(`VUYORIN listening on :${port}`));

let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  // HTTP server.close() alone cannot end upgraded WebSocket connections.
  for (const client of wss.clients) client.close(1001, 'Server restarting');
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => {
    for (const client of wss.clients) client.terminate();
    server.closeAllConnections();
    process.exit(0);
  }, 2500).unref();
};
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
