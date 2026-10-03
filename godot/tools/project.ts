import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
const root = resolve(import.meta.dir, '../..');
const project = resolve(root, 'godot/game');
const godot = Bun.env.GODOT_BIN ?? '/Applications/Godot_mono.app/Contents/MacOS/Godot';
const env = { ...Bun.env, DOTNET_CLI_HOME: resolve(root, 'godot/.dotnet'), NUGET_PACKAGES: resolve(root, 'godot/.packages'),
  DOTNET_NOLOGO: '1', DOTNET_CLI_TELEMETRY_OPTOUT: '1' };
async function run(args: string[]) {
  const p = Bun.spawn(args, { cwd: root, env, stdout: 'inherit', stderr: 'pipe' });
  const [code, errors] = await Promise.all([p.exited, new Response(p.stderr).text()]);
  if (errors) await Bun.write(Bun.stderr, errors);
  if (code !== 0) throw new Error(`${args[0]} exited ${code}`);
  // Godot 的部分 C# 导出错误仍返回 0，必须同时检查错误日志。
  if (/^ERROR:/m.test(errors)) throw new Error(`${args[0]} reported an engine error`);
}
async function prepare() {
  const content = resolve(project, 'Content');
  await mkdir(content, { recursive: true });
  await mkdir(resolve(root, 'godot/.checks'), { recursive: true });
  const sprites = await Bun.file(resolve(root, 'shared/assets/runtime/sprites.json')).json();
  async function copy(source: string, destination: string) {
    const bytes = Buffer.from(await Bun.file(source).arrayBuffer());
    if (await Bun.file(destination).exists() && bytes.equals(Buffer.from(await Bun.file(destination).arrayBuffer()))) return;
    await Bun.write(destination, bytes);
  }
  for (const file of ['sprites.json', ...sprites.sprites.map((s: {file: string}) => s.file)])
    await copy(resolve(root, 'shared/assets/runtime', file), resolve(content, file));
  for (const [src, file] of [['config', 'gameplay.json'], ['fixtures', 'replay-baseline.json']])
    await copy(resolve(root, 'shared', src, file), resolve(content, file));
  for (const sprite of sprites.sprites) {
    const source = `res://Content/${sprite.file}`;
    const target = `res://.godot/imported/${sprite.file}-${createHash('md5').update(source).digest('hex')}.ctex`;
    const path = resolve(content, sprite.file + '.import');
    if (await Bun.file(path).exists()) {
      const original = await Bun.file(path).text();
      const updated = original.replace('process/fix_alpha_border=true', 'process/fix_alpha_border=false');
      if (original !== updated) await Bun.write(path, updated);
    } else {
      await Bun.write(path, `[remap]\nimporter="texture"\ntype="CompressedTexture2D"\npath="${target}"\n\n[deps]\nsource_file="${source}"\ndest_files=["${target}"]\n\n[params]\ncompress/mode=0\nmipmaps/generate=false\nprocess/fix_alpha_border=false\nprocess/premult_alpha=false\n`);
    }
  }
  // Godot SDK 随 .NET 编辑器提供。生成的路径只属于本机，不进入版本控制。
  const packages = resolve(godot, '../../Resources/GodotSharp/Tools/nupkgs');
  await Bun.write(resolve(root, 'godot/NuGet.Config'), `<?xml version="1.0" encoding="utf-8"?>\n<configuration><packageSources><clear/><add key="GodotLocal" value="${packages}"/><add key="nuget.org" value="https://api.nuget.org/v3/index.json"/></packageSources><config><add key="globalPackagesFolder" value="${env.NUGET_PACKAGES}"/></config></configuration>\n`);
  console.log('Godot content: 9 PNG + sprite metadata + config + replay synchronized');
}
async function build() {
  await run(['dotnet', 'build', resolve(project, 'FlappyX.Godot.csproj')]);
  await run([godot, '--headless', '--path', project, '--editor', '--import']);
}
async function checkNative(executable: string, name: string, projectArgs: string[] = []) {
  const directory = resolve(root, 'godot/.checks', name);
  await mkdir(directory, { recursive: true });
  const report = resolve(directory, 'native-check.json');
  await Bun.write(report, JSON.stringify({ success: false, error: 'Native check did not finish' }));
  await run([executable, '--headless', ...projectArgs, '--quit-after', '600', '--', '--qa-dir=' + directory, '--qa']);
  await run(['bun', resolve(import.meta.dir, 'verify-native.ts'), report,
    resolve(root, `docs/baselines/godot/${name}-check.json`)]);
}
await prepare();
switch (Bun.argv[2] ?? 'play') {
  case 'prepare': break;
  case 'build': await build(); break;
  case 'editor': await build(); await run([godot, '--path', project, '--editor']); break;
  case 'play': await build(); await run([godot, '--path', project]); break;
  case 'check': {
    await run(['bun', resolve(import.meta.dir, 'verify-core.ts')]);
    await build();
    await checkNative(godot, 'native', ['--path', project]);
    break;
  }
  case 'export': {
    await build(); await mkdir(resolve(root, 'godot/build'), { recursive: true });
    const application = resolve(root, 'godot/build/FlappyX.app');
    if (existsSync(application)) await run(['/usr/bin/trash', application]);
    await run([godot, '--headless', '--path', project, '--export-release', 'macOS', application]);
    await run(['codesign', '--verify', '--deep', '--strict', application]);
    await checkNative(resolve(application, 'Contents/MacOS/FlappyX · Godot C#'), 'export');
    break;
  }
  default: throw new Error('Expected prepare, build, editor, play, check or export');
}
