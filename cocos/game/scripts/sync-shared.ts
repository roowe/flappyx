import { mkdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { bootstrapId, creator, project, sceneId } from './paths';

const repository = resolve(project, '../..');
const records: { source: string; target: string; sourceSha256: string; targetSha256: string }[] = [];
const hash = (bytes: Uint8Array) => new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
const uuid = (path: string) => {
  const h = new Bun.CryptoHasher('sha256').update(`flappyx/cocos/${path}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};
async function write(path: string, text: string | Uint8Array) {
  await mkdir(dirname(path), { recursive: true });
  const current = Bun.file(path);
  const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  if (!await current.exists() || hash(new Uint8Array(await current.arrayBuffer())) !== hash(bytes)) await Bun.write(path, bytes);
}
async function meta(path: string, importer: string, id = uuid(relative(project, path))) {
  const version = { typescript: '4.0.24', scene: '1.1.50', directory: '1.2.0' }[importer];
  await write(`${path}.meta`, JSON.stringify({ ver: version, importer, imported: true, uuid: id,
    files: importer === 'scene' ? ['.json'] : [], subMetas: {}, userData: {} }, null, 2) + '\n');
}
async function copy(source: string, target: string, transform?: (text: string) => string) {
  const sourcePath = resolve(repository, source), targetPath = resolve(project, target);
  const original = new Uint8Array(await Bun.file(sourcePath).arrayBuffer());
  const bytes = transform ? new TextEncoder().encode(transform(new TextDecoder().decode(original))) : original;
  await write(targetPath, bytes);
  const actual = new Uint8Array(await Bun.file(targetPath).arrayBuffer());
  if (hash(actual) !== hash(bytes)) throw new Error(`同步失败：${target}`);
  records.push({ source, target, sourceSha256: hash(original), targetSha256: hash(actual) });
  return targetPath;
}
// Only the JSON module import changes; all gameplay statements remain byte-identical.
for (const name of ['config', 'game', 'clock', 'index']) {
  const path = await copy(`shared/core-ts/${name}.ts`, `assets/scripts/shared/core-ts/${name}.ts`,
    name === 'config' ? text => text.replace("'../config/gameplay.json'", "'../config/gameplay'") : undefined);
  await meta(path, 'typescript');
}
for (const [source, target] of [
  ['shared/config/gameplay.json', 'config/gameplay'],
  ['shared/assets/runtime/sprites.json', 'config/sprites'],
  ['shared/fixtures/replay-baseline.json', 'fixtures/replay-baseline'],
]) {
  const path = await copy(source, `assets/scripts/shared/${target}.ts`, text =>
    `// Generated from ${source}; edit the shared source, then run bun run prepare.\nexport default ${text.trim()};\n`);
  await meta(path, 'typescript');
}
await meta(await copy('shared/web-ts/storage.ts', 'assets/scripts/shared/web-ts/storage.ts'), 'typescript');

const manifest = await Bun.file(resolve(repository, 'shared/assets/runtime/sprites.json')).json();
for (const sprite of manifest.sprites) {
  const path = await copy(`shared/assets/runtime/${sprite.file}`, `assets/resources/images/${sprite.file}`);
  const id = uuid(relative(project, path)), name = sprite.file.replace('.png', '');
  const base = { imported: true, files: ['.json'], subMetas: {} };
  await write(`${path}.meta`, JSON.stringify({ ver: '1.0.27', importer: 'image', imported: true, uuid: id,
    files: ['.json', '.png'], subMetas: {
      '6c48a': { ...base, importer: 'texture', ver: '1.0.22', uuid: `${id}@6c48a`, id: '6c48a',
        name: 'texture', displayName: name, userData: { wrapModeS: 'clamp-to-edge', wrapModeT: 'clamp-to-edge',
          minfilter: 'nearest', magfilter: 'nearest', mipfilter: 'none', anisotropy: 0, isUuid: true,
          imageUuidOrDatabaseUri: id, visible: false } },
      'f9941': { ...base, importer: 'sprite-frame', ver: '1.0.12', uuid: `${id}@f9941`, id: 'f9941',
        name: 'spriteFrame', displayName: name, userData: { trimType: 'none', trimThreshold: 1, rotated: false,
          offsetX: 0, offsetY: 0, trimX: 0, trimY: 0, width: sprite.pixelSize.width, height: sprite.pixelSize.height,
          rawWidth: sprite.pixelSize.width, rawHeight: sprite.pixelSize.height, borderTop: 0, borderBottom: 0,
          borderLeft: 0, borderRight: 0, packable: false, pixelsToUnit: 100, pivotX: sprite.pivot.x,
          pivotY: sprite.pivot.y, meshType: 0, isUuid: true, imageUuidOrDatabaseUri: `${id}@6c48a`, atlasUuid: '' } },
    }, userData: { type: 'sprite-frame', fixAlphaTransparencyArtifacts: false, hasAlpha: true,
      redirect: `${id}@f9941` } }, null, 2) + '\n');
}
for (const folder of ['assets/scenes', 'assets/scripts', 'assets/scripts/shared',
  'assets/scripts/shared/core-ts', 'assets/scripts/shared/config', 'assets/scripts/shared/fixtures',
  'assets/scripts/shared/web-ts', 'assets/resources', 'assets/resources/images']) await meta(resolve(project, folder), 'directory');
await meta(resolve(project, 'assets/scripts/FlappyBird.ts'), 'typescript', bootstrapId);
await meta(resolve(project, 'assets/scripts/FlightRenderer.ts'), 'typescript');
await meta(resolve(project, 'assets/scripts/FlightUI.ts'), 'typescript');

const scenePath = resolve(project, 'assets/scenes/Boot.scene');
if (!await Bun.file(scenePath).exists()) {
  const scene = await Bun.file(resolve(creator,
    'Contents/Resources/resources/3d/engine/editor/assets/default_file_content/scene/scene-2d.scene')).json();
  scene[0]._name = 'Boot'; scene[1]._name = 'Boot'; scene[1]._id = sceneId;
  const hex = bootstrapId.replaceAll('-', ''), alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let compressed = hex.slice(0, 5);
  for (let i = 5; i < hex.length; i += 3) {
    const n = parseInt(hex.slice(i, i + 3), 16); compressed += alphabet[n >> 6] + alphabet[n & 63];
  }
  scene[2]._components.push({ __id__: scene.length });
  scene.push({ __type__: compressed, _name: '', _objFlags: 0, node: { __id__: 2 },
    _enabled: true, __prefab: null, _id: 'flappyx-bootstrap' });
  scene[4]._color = { __type__: 'cc.Color', r: 81, g: 192, b: 201, a: 255 };
  scene[5]._contentSize = { __type__: 'cc.Size', width: 1024, height: 768 };
  scene[2]._lpos = { __type__: 'cc.Vec3', x: 512, y: 384, z: 0 };
  await write(scenePath, JSON.stringify(scene, null, 2) + '\n');
}
await meta(scenePath, 'scene', sceneId);
await write(resolve(project, 'build-web.json'), JSON.stringify({ name: 'Flappyx', platform: 'web-desktop',
  buildPath: 'project://build', outputName: 'web-desktop', debug: false, startScene: sceneId,
  scenes: [{ url: 'db://assets/scenes/Boot.scene', uuid: sceneId }], sourceMaps: false, md5Cache: false,
  polyfills: { asyncFunctions: true }, packages: { 'web-desktop': {
    resolution: { designWidth: 1024, designHeight: 768 }, useWebGPU: false } } }, null, 2) + '\n');
await write(resolve(project, 'temp/shared-sync.json'), JSON.stringify({ schemaVersion: 1, files: records }, null, 2) + '\n');
console.log(`共享源码、配置和资源已同步并校验：${records.length} 个文件。`);
