import { resolve, sep } from 'node:path';

const root = resolve(import.meta.dir, '../build/web');
if (!await Bun.file(resolve(root, 'index.html')).exists()) throw new Error('先运行 just build-unity-web');
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(Bun.env.PORT ?? 4175),
  async fetch(request) {
    let pathname: string;
    try { pathname = decodeURIComponent(new URL(request.url).pathname); }
    catch { return new Response('Invalid URL', { status: 400 }); }
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(root + sep)) return new Response('Forbidden', { status: 403 });
    const file = Bun.file(path);
    if (!await file.exists()) return new Response('Not found', { status: 404 });
    return new Response(file, { headers: { 'Cache-Control': 'no-cache' } });
  }
});
console.log(`Unity Web preview: ${server.url}`);
