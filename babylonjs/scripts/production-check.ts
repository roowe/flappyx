import { chromium } from 'playwright-core';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { bestScoreKey } from '../src/storage';
import { Game, config } from '../../shared/core-ts';
import baseline from '../../shared/fixtures/replay-baseline.json';
import type {} from '../src/game';

const browser = await chromium.connectOverCDP(process.env.CHROME_CDP_URL ?? 'http://127.0.0.1:9225');
const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`${message.text()} (${message.location().url})`);
});
const baseURL = process.env.FLAPPYX_URL ?? 'http://127.0.0.1:5180';
const existingBestScore = 7;
await context.addInitScript(({ origin, key, bestScore }) => {
  if (location.origin === origin && localStorage.getItem(key) === null) {
    localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, bestScore }));
  }
}, { origin: new URL(baseURL).origin, key: bestScoreKey, bestScore: existingBestScore });
let phase = 'start/death/restart';

try {
  await page.goto(`${baseURL}/?test=1`);
  await page.waitForFunction(() => window.flappyx !== undefined);
  assert.equal(await page.evaluate(() => 'flappyxTest' in window), false);
  const surface = await page.locator('canvas').evaluate(canvas => {
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Expected game canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('Expected Babylon.js WebGL2 context');
    return { width: canvas.width, height: canvas.height, antialias: gl.getContextAttributes()!.antialias };
  });
  assert.deepEqual(surface, { width: 1024, height: 768, antialias: false });
  assert.equal(await page.locator('#best').textContent(), String(existingBestScore));
  await page.locator('#action').click();
  await page.waitForFunction(() => document.getElementById('heading')!.textContent === '0 分');
  await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('#action')!.disabled);
  await page.locator('#action').click();
  assert.equal(await page.locator('#heading').textContent(), '向前飞吧');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.flappyx!.snapshot().state === 'playing');
  await page.waitForFunction(() => window.flappyx!.snapshot().state === 'gameOver');
  await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('#action')!.disabled);
  await page.locator('#action').click();

  phase = 'actual window focus';
  // Focus changes come from the browser, not dispatched synthetic events.
  // Playwright otherwise forces every page to report focused/visible, including background tabs.
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: false });
  await page.bringToFront();
  if (await page.locator('#heading').textContent() === '游戏已暂停') await page.locator('#action').click();
  const other = await context.newPage();
  const otherSession = await context.newCDPSession(other);
  await otherSession.send('Emulation.setFocusEmulationEnabled', { enabled: false });
  await other.goto('about:blank');
  await other.bringToFront();
  await page.waitForFunction(() => !document.hasFocus(), undefined, { polling: 100, timeout: 5000 });
  await page.bringToFront();
  await page.waitForFunction(() => document.hasFocus(), undefined, { polling: 100, timeout: 5000 });
  await page.waitForFunction(() => document.getElementById('heading')!.textContent === '游戏已暂停');
  const pausedImage = await page.locator('canvas').screenshot();
  await page.waitForTimeout(250);
  assert.deepEqual(await page.locator('canvas').screenshot(), pausedImage);
  await page.locator('#action').click();
  assert.equal(await page.locator('#heading').textContent(), '向前飞吧');
  await other.close();

  phase = 'automatic replay';
  const beforeReplay = await page.evaluate(key => localStorage.getItem(key), bestScoreKey);
  await page.goto(`${baseURL}/?replay=baseline`);
  await page.waitForFunction(() => !document.getElementById('panel')!.hidden
    && document.getElementById('eyebrow')!.textContent === '基准回放完成', undefined, { timeout: 10000 });
  assert.equal(await page.locator('#heading').textContent(), '1 分');
  assert.equal(await page.locator('#best').textContent(), '1');
  assert.equal(await page.locator('#best-label').textContent(), '回放最高');
  const automatic = await page.evaluate(() => window.flappyx!.snapshot());
  const expected = new Game(config, { initial: { seed: baseline.seed, bestScore: baseline.initialBestScore }, pipeGapCenters: baseline.pipeGapCenters });
  for (let tick = 1; tick <= baseline.totalTicks; tick++) expected.step(baseline.flapTicks.includes(tick));
  for (const [key, value] of Object.entries(expected.snapshot())) assert.deepEqual(automatic[key as keyof typeof automatic], value);
  const afterReplay = await page.evaluate(key => localStorage.getItem(key), bestScoreKey);
  assert.equal(afterReplay, beforeReplay);
  await page.locator('#action').click();
  await page.waitForFunction(() => window.flappyx?.snapshot().state === 'ready');
  assert.equal(await page.locator('#best').textContent(), String(existingBestScore));
  assert.equal(await page.locator('#best-label').textContent(), '最高');
  const sizes = [];
  for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const bounds = await page.locator('canvas').evaluate(canvas => {
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Expected game canvas');
      const r = canvas.getBoundingClientRect();
      return { width: canvas.width, height: canvas.height, x: r.x, y: r.y, cssWidth: r.width, cssHeight: r.height };
    });
    assert.equal(bounds.width, 1024); assert.equal(bounds.height, 768);
    assert.ok(Math.abs(bounds.cssWidth / bounds.cssHeight - 4 / 3) < .001);
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.cssWidth <= viewport.width + 1
      && bounds.y + bounds.cssHeight <= viewport.height + 1);
    sizes.push({ viewport, ...bounds });
  }
  assert.deepEqual(errors, []);
  const path = fileURLToPath(new URL('../../docs/baselines/babylonjs/production-check.json', import.meta.url));
  await Bun.write(path, `${JSON.stringify({ schemaVersion: 1, recordedAtUnixMilliseconds: Date.now(),
    browserVersion: browser.version(), configSha256: new Bun.CryptoHasher('sha256')
      .update(await Bun.file(new URL('../../shared/config/gameplay.json', import.meta.url)).arrayBuffer()).digest('hex'),
    engine: 'babylonjs', surface, automatic, sizes, checks: ['production-assets/WebGL2', 'no-test-controls', 'RAF-button/space/start/death/restart',
      'actual-window-focus/pause/no-auto-resume', 'paused-render-stable', 'RAF-baseline-replay', 'replay-label/model-best',
      'replay-preserves-existing-best', 'three-release-window-sizes'], storage: { existingBestScore, beforeReplay, afterReplay }, errors }, null, 2)}\n`);
  console.log(`Production browser checks passed; evidence: ${path}`);
} catch (error) {
  console.error(`Production check failed at ${phase}:`, await page.locator('#panel').innerText());
  throw error;
} finally {
  await context.close();
  await browser.close();
}
