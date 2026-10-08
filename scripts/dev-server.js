'use strict';
/**
 * Dependency-free local dev server for HEAVY STORE TOP UP.
 *
 * Serves the static site from `public/` AND routes `/api/*` to the real Vercel
 * serverless handlers in `api/` — with the same path mapping Vercel uses:
 *
 *   /api/games          -> api/games/index.js
 *   /api/games/3        -> api/games/[id].js        (req.query.id = "3")
 *   /api/orders/create  -> api/orders/create.js
 *
 * This lets you run the whole stack locally with just `npm run serve`
 * (no Vercel CLI / login required). For production parity you can still use
 * `npm run dev` (vercel dev).
 *
 * Usage: node scripts/dev-server.js [port]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadEnv } = require('./_env');
loadEnv();

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const API_DIR = path.join(ROOT, 'api');
const PORT = Number(process.argv[2] || process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/** Map an /api/* pathname to a handler file + dynamic params. */
function resolveApi(pathname) {
  const parts = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  if (!parts.length) return null;
  const params = {};

  // Exact file: api/<...parts>.js
  let file = path.join(API_DIR, ...parts) + '.js';
  if (fs.existsSync(file)) return { file, params };

  // Directory index: api/<...parts>/index.js
  file = path.join(API_DIR, ...parts, 'index.js');
  if (fs.existsSync(file)) return { file, params };

  // Dynamic segment: api/<...dir>/[id].js  (last segment becomes :id)
  if (parts.length >= 2) {
    const dir = path.join(API_DIR, ...parts.slice(0, -1));
    const dyn = path.join(dir, '[id].js');
    if (fs.existsSync(dyn)) {
      params.id = parts[parts.length - 1];
      return { file: dyn, params };
    }
  }
  return null;
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve(null);
      try { resolve(JSON.parse(raw)); } catch (_) { resolve(raw); }
    });
    req.on('error', () => resolve(null));
  });
}

function serveStatic(req, res, pathname) {
  let rel = pathname;
  if (rel === '/' || rel === '') rel = '/index.html';
  // Pretty URLs: /admin -> /admin/index.html, /foo -> /foo.html
  let filePath = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { success: false, error: 'Forbidden' });

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  } else if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) {
    filePath += '.html';
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return sendJson(res, 404, { success: false, error: 'Not found' });
  }

  const ext = path.extname(filePath).toLowerCase();
  res.statusCode = 200;
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    const resolved = resolveApi(pathname);
    if (!resolved) return sendJson(res, 404, { success: false, error: 'API route not found' });

    const query = {};
    url.searchParams.forEach((v, k) => { query[k] = v; });
    Object.assign(query, resolved.params);

    let handlerFn;
    try {
      handlerFn = require(resolved.file);
    } catch (err) {
      console.error('[dev-server] failed to load handler', resolved.file, err);
      return sendJson(res, 500, { success: false, error: 'Handler load error' });
    }

    req.query = query;
    req.body = await readBody(req);

    try {
      await handlerFn(req, res);
    } catch (err) {
      console.error('[dev-server] handler error:', err && err.stack ? err.stack : err);
      if (!res.writableEnded) sendJson(res, 500, { success: false, error: 'Internal server error' });
    }
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`HEAVY STORE TOP UP dev server running on http://localhost:${PORT}`);
  console.log(`  static: ${PUBLIC_DIR}`);
  console.log(`  api   : ${API_DIR}`);
});
