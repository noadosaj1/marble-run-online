import { createServer } from 'node:http';
import { config } from './config';
import { createSocketServer } from './networking/socketServer';
import { createStaticHandler } from './staticServer';

const statics = createStaticHandler('dist');

const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  if (config.serveClient && statics.enabled && (req.method === 'GET' || req.method === 'HEAD')) {
    statics.handle(req, res);
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' }).end('Marble Race game server is running.');
});

const { io, rooms } = createSocketServer(http);

http.listen(config.port, () => {
  console.log(`🎱 Marble Race server listening on :${config.port}`);
  if (config.serveClient && statics.enabled) console.log('   serving built client from ./dist');
});

function shutdown(): void {
  console.log('Shutting down…');
  rooms.stop();
  void io.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
