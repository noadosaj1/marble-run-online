import { createReadStream, existsSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
};

/** Minimal static file server for the built client (optional single-host deploy). */
export function createStaticHandler(root: string) {
  const base = resolve(root);
  const enabled = existsSync(join(base, 'index.html'));
  return {
    enabled,
    handle(req: IncomingMessage, res: ServerResponse): void {
      const url = new URL(req.url ?? '/', 'http://localhost');
      let file = normalize(join(base, decodeURIComponent(url.pathname)));
      if (!file.startsWith(base)) {
        res.writeHead(403).end();
        return;
      }
      if (!existsSync(file) || statSync(file).isDirectory()) file = join(base, 'index.html'); // SPA fallback
      const ext = extname(file);
      res.writeHead(200, {
        'Content-Type': TYPES[ext] ?? 'application/octet-stream',
        'Cache-Control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      createReadStream(file).pipe(res);
    },
  };
}
