import { strict as assert } from 'node:assert';
import baseline from '../../../shared/fixtures/replay-baseline.json';
import { Game, config } from '../../../shared/core-ts';
import { bestScoreKey, browserSession, clickButton, configHash, output, ready, snapshot, surface } from './browser-helpers';

const baseURL = process.env.FLAPPYX_URL ?? 'http://127.0.0.1:5178';
const { browser, context, page, errors } = await browserSession(baseURL, 768);
let phase = 'release lifecycle';
try {
  await ready(page, `${baseURL}/?test=1`);
  assert.equal(await page.evaluate(() => 'flappyxTest' in window), false);
  assert.equal((await snapshot(page)).bestScore, 7);
  await clickButton(page, 'action');
  await page.waitForFunction(() => window.flappyx!.snapshot().state === 'gameOver');
  await page.waitForFunction(() => window.flappyx!.snapshot().ui.actionEnabled);
  await clickButton(page, 'action');
  assert.equal((await snapshot(page)).state, 'ready');
  // The native button focused GameCanvas. Space must still reach our capture listener.
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.flappyx!.snapshot().state === 'playing');
  await page.waitForFunction(() => window.flappyx!.snapshot().state === 'gameOver');
  await page.waitForFunction(() => window.flappyx!.snapshot().ui.actionEnabled);
  await clickButton(page, 'action');

  phase = 'actual window focus';
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: false });
  await page.bringToFront();
  if ((await snapshot(page)).paused) await clickButton(page, 'action');
  const other = await context.newPage(), otherSession = await context.newCDPSession(other);
  await otherSession.send('Emulation.setFocusEmulationEnabled', { enabled: false });
  await other.goto('about:blank'); await other.bringToFront();
  await page.waitForFunction(() => !document.hasFocus(), undefined, { polling: 100, timeout: 5000 });
  await page.bringToFront();
  await page.waitForFunction(() => document.hasFocus(), undefined, { polling: 100, timeout: 5000 });
  assert.equal((await snapshot(page)).paused, true);
  const image = await page.locator('canvas').screenshot();
  await page.waitForTimeout(250); assert.deepEqual(await page.locator('canvas').screenshot(), image);
  await clickButton(page, 'action'); assert.equal((await snapshot(page)).paused, false);
  await other.close();

  phase = 'automatic fixture replay';
  const beforeReplay = await page.evaluate(key => localStorage.getItem(key), bestScoreKey);
  await ready(page, `${baseURL}/?replay=baseline`);
  await page.waitForFunction(() => window.flappyx!.snapshot().tick === 150, undefined, { timeout: 10000 });
  const automatic = await snapshot(page);
  const expected = new Game(config, { initial: { seed: baseline.seed, bestScore: 0 }, pipeGapCenters: baseline.pipeGapCenters });
  for (let tick = 1; tick <= 150; tick++) expected.step(baseline.flapTicks.includes(tick));
  for (const [key, value] of Object.entries(expected.snapshot())) assert.deepEqual(automatic[key as keyof typeof automatic], value);
  assert.equal(automatic.ui.best, '回放最高 1'); assert.equal(automatic.ui.action, '返回游戏');
  const afterReplay = await page.evaluate(key => localStorage.getItem(key), bestScoreKey);
  assert.equal(afterReplay, beforeReplay);
  await clickButton(page, 'action'); await page.waitForFunction(() => window.flappyx?.snapshot().state === 'ready');
  assert.equal((await snapshot(page)).bestScore, 7);

  phase = 'release fixed frames and scaling';
  const snapshots = [];
  for (const tick of [118, 134, 141]) {
    await ready(page, `${baseURL}/?replay=baseline&tick=${tick}`);
    const s = await snapshot(page); assert.equal(s.tick, tick); assert.equal(s.paused, true);
    assert.equal(s.objectCount, 35); assert.equal(s.render.birdY, s.y);
    snapshots.push(s);
    await page.locator('canvas').screenshot({ path: `${output}/release-tick-${tick}.png` });
  }
  const sizes = [];
  for (const size of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size); await page.waitForTimeout(150);
    const s = await snapshot(page);
    assert.ok(Math.abs(s.viewport.rect.width / s.viewport.rect.height - 4 / 3) < 1e-9);
    assert.equal(s.render.birdY, 514); assert.equal(s.y, 514);
    sizes.push({ window: size, viewport: s.viewport, surface: await surface(page) });
    await page.screenshot({ path: `${output}/release-${size.width === 390 ? 'portrait' : 'wide'}.png` });
  }
  assert.deepEqual(errors, []);
  await Bun.write(`${output}/production-check.json`, JSON.stringify({ schemaVersion: 1,
    recordedAtUnixMilliseconds: Date.now(), engine: 'cocos', creatorVersion: '3.8.8', browserVersion: browser.version(),
    configSha256: await configHash(), url: baseURL, automatic, snapshots, sizes,
    checks: ['release/no-mutation-controls', 'actual-update/start/death/restart', 'actual-window-focus/explicit-resume',
      'paused-render-stable', 'automatic-fixture-replay', 'fixed-release-screenshots', 'letterbox-scaling', 'replay-keeps-existing-best'],
    storage: { beforeReplay, afterReplay }, errors }, null, 2) + '\n');
  console.log('Creator Release 浏览器验收通过。');
} catch (error) { console.error(`失败阶段：${phase}`, await page.evaluate(() => window.flappyx?.snapshot())); throw error; }
finally { await context.close(); await browser.close(); }
