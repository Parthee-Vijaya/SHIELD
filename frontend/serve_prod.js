#!/usr/bin/env node
/**
 * SHIELD production-frontend server.
 *
 * Why this exists: the `serve` package is static-only — it can't proxy
 * /api/* to the backend, so a production build of the React app loses
 * its dev-time proxy and fetches return index.html (which fails JSON
 * parsing). This tiny Express server fixes that:
 *
 * 1. Proxies /api/*, /metrics, /health, /readyz to the FastAPI backend
 *    (default localhost:8001) so the React app can fetch with relative URLs
 * 2. Serves the static bundle from FRONTEND_BUILD_DIR (default frontend/build/)
 * 3. Falls back to index.html for unknown routes (SPA routing)
 *
 * Bound to 0.0.0.0 by default so Tailscale-clients on iPhone can reach it.
 *
 * Env vars:
 *   FRONTEND_PORT  default 8090
 *   FRONTEND_HOST  default 0.0.0.0
 *   API_BACKEND    default http://localhost:8001
 *   FRONTEND_BUILD_DIR  stable published build outside synced folders in production
 */

const express = require('express');
const fs = require('node:fs');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const PORT = parseInt(process.env.FRONTEND_PORT || '8090', 10);
const HOST = process.env.FRONTEND_HOST || '0.0.0.0';
const BACKEND = process.env.API_BACKEND || 'http://localhost:8001';
const BUILD_DIR = path.resolve(process.env.FRONTEND_BUILD_DIR || path.join(__dirname, 'build'));

// Refuse to start with an unpublished release instead of returning ENOENT to users.
try {
  if (!fs.statSync(path.join(BUILD_DIR, 'index.html')).isFile()) throw new Error('missing index');
  fs.accessSync(path.join(BUILD_DIR, 'index.html'), fs.constants.R_OK);
} catch {
  console.error('[shield-frontend] No readable index.html in the configured build directory. Publish a complete frontend build before starting.');
  process.exit(1);
}

const app = express();

// Trust X-Forwarded-* headers if running behind another proxy (Tailscale Funnel etc.)
app.set('trust proxy', 1);

// Proxy backend routes BEFORE static — fetches must hit FastAPI, not the
// static asset server. The 'changeOrigin' option rewrites the Host header so
// the backend doesn't get confused.
const apiProxy = createProxyMiddleware({
  target: BACKEND,
  changeOrigin: true,
  ws: true,            // upgrade WebSocket / SSE streams
  xfwd: true,          // forward X-Forwarded-* headers
  logLevel: process.env.PROXY_LOG_LEVEL || 'warn',
  onError(err, _req, res) {
    console.error(`[proxy] backend error: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({
      error: 'Backend not reachable',
      detail: err.message,
      backend: BACKEND,
    }));
  },
});

['/api', '/health', '/readyz', '/metrics'].forEach((mount) => {
  app.use(mount, apiProxy);
});

const REVALIDATE_CACHE = 'no-cache';
const NO_STORE_CACHE = 'no-cache, no-store, must-revalidate';

// Only CRA's content-hashed files are safe to keep across releases.
app.use(express.static(BUILD_DIR, {
  index: false,
  setHeaders(res, filePath) {
    const relativePath = path.relative(BUILD_DIR, filePath).split(path.sep).join('/');
    if (relativePath === 'sw.js' || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', NO_STORE_CACHE);
    } else if (/^static\/(?:js|css|media)\/.+\.[a-f0-9]{8,}(?:\.chunk)?\.[a-z0-9]+$/i.test(relativePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', REVALIDATE_CACHE);
    }
  },
}));

// Missing chunks must never become HTML responses or be cached as JavaScript.
app.use('/static', (_req, res) => {
  res.setHeader('Cache-Control', NO_STORE_CACHE);
  res.status(404).type('text/plain').send('Filen findes ikke. Genindlæs siden for at hente den aktuelle version.');
});

// SPA fallback — application routes render the React app
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', NO_STORE_CACHE);
  res.sendFile(path.join(BUILD_DIR, 'index.html'), (error) => {
    if (!error) return;
    if (res.headersSent) return res.end();
    res.status(503).type('html').send('<!doctype html><html lang="da"><meta charset="utf-8"><title>SHIELD opdateres</title><h1>SHIELD er midlertidigt utilgængelig</h1><p>Genindlæs siden om et øjeblik.</p></html>');
  });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`[shield-frontend] serving ${BUILD_DIR}`);
  console.log(`[shield-frontend] listening on http://${HOST}:${server.address().port}`);
  console.log(`[shield-frontend] proxying /api, /health, /readyz, /metrics → ${BACKEND}`);
});

// Graceful shutdown so SIGTERM from stop_tyr.sh finishes pending requests
function shutdown(signal) {
  console.log(`[shield-frontend] received ${signal}, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
