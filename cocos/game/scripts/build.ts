import { mkdir } from 'node:fs/promises';
import { closeSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { executable, project } from './paths';

await mkdir(join(project, 'build/logs'), { recursive: true });
const logPath = join(project, 'build/logs/web-desktop.log');
const log = openSync(logPath, 'w');
const child = Bun.spawn([executable, '--project', project, '--build',
  `configPath=${join(project, 'build-web.json')}`], { stdout: log, stderr: log });
const code = await child.exited;
closeSync(log);
// Creator documents 36 as build success. Verify the entry file as well as the exit code.
if (code !== 36 || !await Bun.file(join(project, 'build/web-desktop/index.html')).exists()) {
  throw new Error(`Creator Web 构建失败（${code}），日志：${logPath}`);
}
console.log(`Creator Web 构建成功：${join(project, 'build/web-desktop')}，日志：${logPath}`);
