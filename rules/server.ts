// HTTP front of the rules service. Reached only by the backend on the internal network (never published).
//   node --experimental-strip-types rules/server.ts
// PORT (default 8090); RULES_KEY: when set, every request must carry it in the X-Rules-Key header.

import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { RuleError } from '../frontend/src/lib/eld/engine.ts';
import { VERSION } from '../frontend/src/lib/eld/version.ts';
import { BadRequest, checkMap, command, create, join, NeedLog } from './service.ts';

const PORT = Number(process.env.PORT ?? 8090);
const KEY = process.env.RULES_KEY ?? '';
const MAX_BODY = 12 * 1024 * 1024;

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text), 'Cache-Control': 'no-store' });
  res.end(text);
}

function read(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new BadRequest('The request is too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new BadRequest('The request is not JSON'));
      }
    });
    req.on('error', reject);
  });
}

function allowed(req: IncomingMessage): boolean {
  if (!KEY) return true;
  const got = Buffer.from(String(req.headers['x-rules-key'] ?? ''));
  const want = Buffer.from(KEY);
  return got.length === want.length && timingSafeEqual(got, want);
}

// '/map': a map from the admin's map creator, checked and returned as it is to be stored.
const ROUTES: Record<string, (body: never) => unknown> = { '/create': create, '/join': join, '/command': command, '/map': checkMap };

const server = createServer((req, res) => {
  void (async () => {
    try {
      const path = (req.url ?? '').split('?')[0]!;
      if (req.method === 'GET' && path === '/health') return send(res, 200, { status: 'UP', engine: VERSION });
      const route = ROUTES[path];
      if (req.method !== 'POST' || !route) return send(res, 404, { code: 'NOT_FOUND', message: 'Unknown path' });
      if (!allowed(req)) return send(res, 401, { code: 'UNAUTHORIZED', message: 'Missing or wrong key' });
      send(res, 200, route((await read(req)) as never));
    } catch (err) {
      if (err instanceof RuleError) send(res, 422, { code: err.code, message: err.message });
      else if (err instanceof NeedLog) send(res, 409, { code: 'NEED_LOG', message: 'Send the whole log' });
      else if (err instanceof BadRequest) send(res, 400, { code: 'BAD_REQUEST', message: err.message });
      else {
        console.error(err);
        send(res, 500, { code: 'INTERNAL', message: 'The rules service failed' });
      }
    }
  })();
});

server.listen(PORT, () => console.log(`Rules service (engine ${VERSION}) on port ${PORT}`));
for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, () => server.close(() => process.exit(0)));
