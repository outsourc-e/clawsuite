/**
 * ClawSuite Production Server
 * Wraps the TanStack Start SSR build (dist/server/server.js) in a Node.js HTTP server.
 * Serves static assets from dist/client/ and proxies API/SSR through the server build.
 *
 * Usage: node electron/prod-server.cjs [--port 3003]
 * Env: PORT=3003, GATEWAY_URL=http://127.0.0.1:18789
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || process.argv.find((_, i, a) => a[i - 1] === '--port') || '3003', 10);
const DIST_CLIENT = path.join(__dirname, '..', 'dist', 'client');
// Prefer the self-contained bundle (no node_modules needed), fall back to unbundled
const BUNDLED_SERVER = path.join(__dirname, 'server-bundle.mjs');
const UNBUNDLED_SERVER = path.join(__dirname, '..', 'dist', 'server', 'server.js');
const DIST_SERVER = fs.existsSync(BUNDLED_SERVER) ? BUNDLED_SERVER : UNBUNDLED_SERVER;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
};

async function main() {
  // Dynamic import the ESM server build
  const serverModule = await import(`file://${DIST_SERVER}`);
  const serverBuild = serverModule.default;

  const server = http.createServer(async (req, res) => {
    const url = req.url || '/';
    const pathname = url.split('?')[0];

    // Try serving static files from dist/client first
    if (pathname !== '/' && !pathname.startsWith('/api/')) {
      const filePath = path.join(DIST_CLIENT, pathname);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        const content = fs.readFileSync(filePath);
        res.writeHead(200, {
          'Content-Type': mime,
          'Cache-Control': pathname.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
        });
        res.end(content);
        return;
      }
    }

    // SSR: pass to TanStack Start server build
    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }

      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers.host || `127.0.0.1:${PORT}`;
      const fullUrl = `${protocol}://${host}${url}`;

      const webRequest = new Request(fullUrl, {
        method: req.method,
        headers,
        body: req.method !== 'GET' && req.method !== 'HEAD'
          ? await new Promise((resolve) => {
              const chunks = [];
              req.on('data', (c) => chunks.push(c));
              req.on('end', () => resolve(Buffer.concat(chunks)));
            })
          : undefined,
        duplex: 'half',
      });

      const webResponse = await serverBuild.fetch(webRequest);

      // Write status + headers
      const resHeaders = {};
      webResponse.headers.forEach((value, key) => {
        resHeaders[key] = value;
      });
      res.writeHead(webResponse.status, webResponse.statusText || '', resHeaders);

      // Stream body
      if (webResponse.body) {
        const reader = webResponse.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        };
        await pump();
      } else {
        res.end();
      }
    } catch (err) {
      console.error('[prod-server] SSR error:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[ClawSuite] Production server listening on http://127.0.0.1:${PORT}`);
    // Signal to parent process (Electron) that we're ready
    if (process.send) process.send({ type: 'ready', port: PORT });
  });
}

main().catch((err) => {
  console.error('[prod-server] Fatal:', err);
  process.exit(1);
});
