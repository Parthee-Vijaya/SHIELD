#!/usr/bin/env node
/**
 * Tyr production-frontend server.
 *
 * Why this exists: the `serve` package is static-only — it can't proxy
 * /api/* to the backend, so a production build of the React app loses
 * its dev-time proxy and fetches return index.html (which fails JSON
 * parsing). This tiny Express server fixes that:
 *
 * 1. Proxies /api/*, /metrics, /health, /readyz to the FastAPI backend
 *    (default localhost:8001) so the React app can fetch with relative URLs
 * 2. Serves the static bundle from frontend/build/
 * 3. Falls back to index.html for unknown routes (SPA routing)
 *
 * Bound to 0.0.0.0 by default so Tailscale-clients on iPhone can reach it.
 *
 * Env vars:
 *   FRONTEND_PORT  default 8090
 *   FRONTEND_HOST  default 0.0.0.0
 *   API_BACKEND    default http://localhost:8001
 */

const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const PORT = parseInt(process.env.FRONTEND_PORT || '8090', 10);
const HOST = process.env.FRONTEND_HOST || '0.0.0.0';
const BACKEND = process.env.API_BACKEND || 'http://localhost:8001';
const BUILD_DIR = path.resolve(__dirname, 'build');

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

// Static assets — long-cache hashed assets, no-cache index.html
app.use(express.static(BUILD_DIR, {
  index: false,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (/\.(js|css|woff2?|svg|png|jpg|jpeg|gif|ico)$/.test(filePath)) {
      // CRA hashes asset filenames so they're safe to cache for a long time
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

// SPA fallback — anything not handled above renders the React app
app.get('*', (_req, res) => {
  res.sendFile(path.join(BUILD_DIR, 'index.html'));
});

const server = app.listen(PORT, HOST, () => {
  console.log(`[tyr-frontend] serving ${BUILD_DIR}`);
  console.log(`[tyr-frontend] listening on http://${HOST}:${PORT}`);
  console.log(`[tyr-frontend] proxying /api, /health, /readyz, /metrics → ${BACKEND}`);
});

// Graceful shutdown so SIGTERM from stop_tyr.sh finishes pending requests
function shutdown(signal) {
  console.log(`[tyr-frontend] received ${signal}, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
