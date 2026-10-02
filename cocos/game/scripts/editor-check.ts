import { chromium } from 'playwright-core';
import { strict as assert } from 'node:assert';
import { configHash, output } from './browser-helpers';
import { mkdir } from 'node:fs/promises';
import { project, sceneId } from './paths';

const browser = await chromium.connectOverCDP(process.env.EDITOR_CDP_URL ?? 'http://127.0.0.1:9238');
try {
  const page = browser.contexts()[0].pages().find(p => p.url().includes('windows/main.html'));
  if (!page) throw new Error('未找到 Creator 编辑器主窗口。');
  const evidence = await page.evaluate(async ({ project, sceneId }) => {
    const editor = (window as any).Editor;
    if (editor.Project.path !== project) throw new Error('调试端口连接到了其他工程。');
    await editor.Message.request('scene', 'open-scene', sceneId);
    return { project: editor.Project.path, version: editor.App.version,
      assetDBReady: await editor.Message.request('asset-db', 'query-ready'),
      scene: await editor.Message.request('scene', 'query-node-tree'),
      script: await editor.Message.request('asset-db', 'query-asset-info', 'db://assets/scripts/FlappyBird.ts'),
      sceneAsset: await editor.Message.request('asset-db', 'query-asset-info', sceneId),
      resolution: await editor.Message.request('project', 'query-design-resolution'),
      previewPort: await editor.Message.request('server', 'query-port') };
  }, { project, sceneId });
  assert.equal(evidence.version, '3.8.8'); assert.equal(evidence.assetDBReady, true);
  assert.equal(evidence.script.uuid, 'e9fc4f1c-f510-4708-812f-fab9c92c0684');
  assert.equal(evidence.sceneAsset.url, 'db://assets/scenes/Boot.scene');
  assert.ok(JSON.stringify(evidence.scene).includes('Canvas'));
  assert.deepEqual(evidence.resolution, { width: 1024, height: 768, fitWidth: true, fitHeight: true });
  await mkdir(output, { recursive: true });
  await Bun.write(`${output}/editor-check.json`, JSON.stringify({ schemaVersion: 1,
    recordedAtUnixMilliseconds: Date.now(), configSha256: await configHash(), ...evidence }, null, 2) + '\n');
  await page.screenshot({ path: `${output}/editor.png` });
  console.log('Creator 编辑器：工程、场景、组件导入和预览设置通过。');
} finally { await browser.close(); }
