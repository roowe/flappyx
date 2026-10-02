import { resolve, sep } from 'node:path';
import { project } from './paths';

const root = resolve(project, 'build/web-desktop');
if (!await Bun.file(resolve(root, 'index.html')).exists()) throw new Error('请先运行 bun run build。');
const server = Bun.serve({
  hostname: '127.0.0.1', port: Number(process.env.PORT ?? 5178),
  async fetch(request) {
    const url = new URL(request.url);
    const path = resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    if (!path.startsWith(root + sep)) return new Response('Forbidden', { status: 403 });
    const file = Bun.file(path);
    return await file.exists() ? new Response(file, { headers: { 'Cache-Control': 'no-store' } })
      : new Response('Not found', { status: 404 });
  },
});
console.log(`Cocos Web：${server.url}`);
