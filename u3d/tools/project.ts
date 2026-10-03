import { resolve } from 'node:path';
import { cp, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dir, '../..');
const project = resolve(root, 'u3d/game');
const unity = Bun.env.UNITY_BIN ?? '/Applications/Unity/Hub/Editor/6000.5.6f1/Unity.app/Contents/MacOS/Unity';
const application = resolve(root, 'u3d/build/FlappyX.app');
const executable = resolve(application, 'Contents/MacOS/FlappyX Unity');
const checks = resolve(root, 'u3d/.checks');
const logs = resolve(project, 'Logs');
const baselines = resolve(root, 'docs/baselines/unity');
const webProject = resolve(root, 'u3d/.web-project');
const webOutput = resolve(root, 'u3d/build/web');

async function run(args: string[], timeout = 600_000) {
  const process = Bun.spawn(args, { cwd: root, stdout: 'inherit', stderr: 'inherit' });
  const timer = timeout ? setTimeout(() => process.kill(), timeout) : undefined;
  const code = await process.exited;
  if (timer) clearTimeout(timer);
  assert.equal(code, 0, `${args[0]} failed or timed out`);
}
async function copy(source: string, destination: string) {
  const bytes = Buffer.from(await Bun.file(source).arrayBuffer());
  if (await Bun.file(destination).exists() && bytes.equals(Buffer.from(await Bun.file(destination).arrayBuffer()))) return;
  await Bun.write(destination, bytes);
}
async function prepare() {
  const content = resolve(project, 'Assets/Resources/Content');
  const core = resolve(project, 'Assets/Shared');
  for (const path of [content, core, checks, logs, baselines]) await mkdir(path, { recursive: true });
  const sprites = await Bun.file(resolve(root, 'shared/assets/runtime/sprites.json')).json();
  for (const file of ['sprites.json', ...sprites.sprites.map((s: {file: string}) => s.file)])
    await copy(resolve(root, 'shared/assets/runtime', file), resolve(content, file));
  await copy(resolve(root, 'shared/config/gameplay.json'), resolve(content, 'gameplay.json'));
  await copy(resolve(root, 'shared/fixtures/replay-baseline.json'), resolve(content, 'replay-baseline.json'));
  const sources = (await readdir(resolve(root, 'shared/core-csharp'))).filter(file => file.endsWith('.cs'));
  for (const file of sources)
    await copy(resolve(root, 'shared/core-csharp', file), resolve(core, file));
  console.log(`Unity synchronized ${sources.length} shared C# sources, 9 PNG and 3 JSON files`);
}
async function editorCommand(method: string, quit = true, extra: string[] = [], projectPath = project) {
  const log = resolve(logs, method.toLowerCase() + '.log');
  try {
    await run([unity, '-batchmode', '-nographics', '-projectPath', projectPath, '-executeMethod', `BuildProject.${method}`,
      '-logFile', log, ...(quit ? ['-quit'] : []), ...extra], method === 'BuildWeb' ? 1_800_000 : 600_000);
  } catch (error) {
    if (await Bun.file(log).exists()) console.error((await Bun.file(log).text()).slice(-18000));
    throw error;
  }
  const text = await Bun.file(log).text();
  assert.ok(!/error CS\d+/.test(text), `Compilation failed; see ${log}`);
  console.log(`Unity ${method} complete; ${log}`);
}
async function verify(name: string) {
  await run(['bun', resolve(root, 'godot/tools/verify-native.ts'), resolve(checks, name, 'native-check.json'), resolve(baselines, `${name}-check.json`)]);
}
async function initializeReport(name: string) {
  const directory = resolve(checks, name);
  await mkdir(directory, { recursive: true });
  await Bun.write(resolve(directory, 'native-check.json'), JSON.stringify({ success: false, error: 'Check did not finish' }));
  return directory;
}
async function build() {
  await mkdir(resolve(root, 'u3d/build'), { recursive: true });
  if (existsSync(application)) await run(['/usr/bin/trash', application]);
  await editorCommand('Build');
  assert.ok(existsSync(executable), 'Player executable must exist');
  await run(['/usr/bin/codesign', '--verify', '--deep', '--strict', application]);
}
async function buildWeb() {
  // 单独保留 Web 的 Library 缓存；不会切换正在打开的桌面工程的构建平台。
  await mkdir(webProject, { recursive: true });
  for (const name of ['Assets', 'Packages', 'ProjectSettings']) {
    const destination = resolve(webProject, name);
    if (existsSync(destination)) await run(['/usr/bin/trash', destination]);
    await cp(resolve(project, name), destination, { recursive: true });
  }
  await mkdir(resolve(webProject, 'Assets/Resources/Fonts'), { recursive: true });
  await cp(resolve(root, 'u3d/web/FlappyUI.otf'), resolve(webProject, 'Assets/Resources/Fonts/FlappyUI.otf'));
  await cp(resolve(root, 'u3d/web/link.xml'), resolve(webProject, 'Assets/link.xml'));
  await cp(resolve(root, 'u3d/web/template'), resolve(webProject, 'Assets/WebGLTemplates/FlappyX'), { recursive: true });
  if (existsSync(webOutput)) await run(['/usr/bin/trash', webOutput]);
  await editorCommand('BuildWeb', true, ['-buildTarget', 'WebGL', '--web-output=' + webOutput], webProject);
  assert.ok(existsSync(resolve(webOutput, 'index.html')), 'Web index.html must exist');
  await cp(resolve(root, 'u3d/web/fonts/OFL.txt'), resolve(webOutput, 'FONT-LICENSE.txt'));
  console.log(`Web build ready: ${webOutput}`);
}
await prepare();
switch (Bun.argv[2] ?? 'play') {
  case 'prepare': break;
  case 'editor':
    await editorCommand('Prepare');
    await run([unity, '-projectPath', project, '-openfile', resolve(project, 'Assets/Scenes/Main.unity')], 0);
    break;
  case 'check': {
    await run(['bun', resolve(root, 'godot/tools/verify-core.ts'), 'u3d']);
    const directory = await initializeReport('editor');
    await editorCommand('Check', false, ['--qa', '--qa-dir=' + directory]);
    await verify('editor');
    break;
  }
  case 'export': {
    await build();
    const directory = await initializeReport('export');
    await run([executable, '-batchmode', '-nographics', '-logFile', resolve(logs, 'player-qa.log'), '--qa', '--qa-dir=' + directory]);
    await verify('export');
    break;
  }
  case 'play':
    await build();
    await run([executable], 0);
    break;
  case 'web': await buildWeb(); break;
  default: throw new Error('Expected prepare, editor, check, export, play or web');
}
