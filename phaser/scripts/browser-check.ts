import { chromium, type Page } from 'playwright-core';
import { strict as assert } from 'node:assert';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import baseline from '../../shared/fixtures/replay-baseline.json';
import { bestScoreKey } from '../src/storage';
import type {} from '../src/scene';

// Connect to an explicitly started browser; no disposable profile is silently deleted.
const browser = await chromium.connectOverCDP(process.env.CHROME_CDP_URL ?? 'http://127.0.0.1:9223');
const baseURL = process.env.FLAPPYX_URL ?? 'http://127.0.0.1:5174';
const output = fileURLToPath(new URL('../../docs/baselines/phaser/', import.meta.url));
await mkdir(output, { recursive: true });
const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 });
const existingBestScore = 7;
await context.addInitScript(({ origin, key, bestScore }) => {
  if (location.origin === origin && localStorage.getItem(key) === null) {
    localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, bestScore }));
  }
}, { origin: new URL(baseURL).origin, key: bestScoreKey, bestScore: existingBestScore });
const errors: string[] = [];
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(`${message.text()} (${message.location().url})`);
});

async function ready(target: Page, path = '/?test=1') {
  await target.goto(`${baseURL}${path}`);
  await target.waitForFunction(() => window.flappyxTest !== undefined);
}
const snapshot = () => page.evaluate(() => window.flappyxTest!.snapshot());
const frame = (ms = 1000 / 30) => page.evaluate(ms => window.flappyxTest!.frame(ms), ms);

try {
  await ready(page);
  assert.equal((await snapshot()).state, 'ready');
  assert.equal((await snapshot()).bestScore, existingBestScore);
  await page.locator('#stage').screenshot({ path: `${output}/ready.png` });
  const animationFrames = { ready: [] as string[], flying: [] as string[] };
  const expectedFrames = ['bird.frame1', 'bird.frame1', 'bird.frame1', 'bird.frame2', 'bird.frame2', 'bird.frame2'];
  for (let tick = 0; tick < 6; tick++) {
    const actual = await snapshot();
    animationFrames.ready.push(actual.render.birdFrame);
    assert.equal(actual.render.birdFrame, expectedFrames[tick]);
    if (tick < 5) await page.evaluate(() => window.flappyxTest!.advance(1));
  }
  await page.evaluate(() => window.flappyxTest!.reset());
  for (let tick = 1; tick <= 6; tick++) {
    await page.evaluate(() => window.flappyxTest!.advance(1, [1]));
    const actual = await snapshot();
    animationFrames.flying.push(actual.render.birdFrame);
    assert.equal(actual.render.birdFrame, expectedFrames[tick - 1]);
    assert.equal(actual.render.birdY, actual.y);
    assert.equal(actual.render.roundPixels, false);
    assert.equal(actual.render.cameraRoundPixels, false);
    assert.equal(actual.render.birdScaleMode, 1); // Phaser NEAREST
  }
  await page.evaluate(() => window.flappyxTest!.reset());
  await page.keyboard.down('Space');
  await frame();
  assert.equal((await snapshot()).y, 450.5);
  await page.keyboard.down('Space'); // key repeat is ignored even across ticks
  await frame();
  assert.equal((await snapshot()).y, 438.5);
  await page.keyboard.up('Space');
  await page.locator('canvas').click({ position: { x: 850, y: 450 } });
  await frame();
  assert.equal((await snapshot()).velocityY, -12);

  // A queued flap must be cleared by pause, and focus alone must not resume.
  await page.keyboard.press('Space');
  await page.locator('#pause').click();
  const paused = await snapshot();
  assert.equal(paused.paused, true);
  assert.equal(await frame(1000), 0);
  assert.deepEqual(await snapshot(), paused);
  await page.evaluate(() => window.dispatchEvent(new FocusEvent('focus')));
  assert.equal((await snapshot()).paused, true);
  await page.locator('#action').click();
  assert.equal((await snapshot()).accumulatedTicks, 0);
  await frame();
  assert.equal((await snapshot()).y, paused.y + paused.velocityY);
  assert.ok((await snapshot()).accumulatedTicks < 1e-9);
  await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')));
  assert.equal((await snapshot()).paused, true);
  await page.locator('#action').click();

  await page.evaluate(() => window.flappyxTest!.reset({ initial: { state: 'playing', y: 300 }, pipes: [] }));
  assert.equal(await frame(340), 5);
  assert.equal((await snapshot()).tick, 5);
  assert.ok(Math.abs((await snapshot()).accumulatedTicks - .2) < 1e-9);

  // Execute the reviewed scoring/death replay through the actual Scene and storage adapter.
  await page.evaluate(gaps => window.flappyxTest!.reset({ pipeGapCenters: gaps }), baseline.pipeGapCenters);
  await page.evaluate(flaps => window.flappyxTest!.advance(118, flaps), baseline.flapTicks);
  assert.equal((await snapshot()).score, 1);
  assert.equal((await snapshot()).y, 275);
  await page.evaluate(flaps => window.flappyxTest!.advance(32, flaps), baseline.flapTicks);
  const finished = await snapshot();
  assert.equal(finished.state, 'gameOver');
  assert.equal(finished.deathTick, 134);
  assert.equal(finished.gameOverTick, 141);
  assert.equal(finished.bestScore, existingBestScore);
  await page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')));
  assert.equal((await snapshot()).paused, true);
  assert.equal(await page.locator('#action').textContent(), '继续游戏');
  await page.locator('#action').click();
  assert.equal((await snapshot()).state, 'gameOver');
  assert.equal(await page.locator('#action').textContent(), '重新开始');
  await page.reload();
  await page.waitForFunction(() => window.flappyxTest !== undefined);
  assert.equal((await snapshot()).bestScore, existingBestScore);
  assert.equal(await page.locator('#best').textContent(), String(existingBestScore));
  const reopened = await context.newPage();
  await ready(reopened);
  assert.equal(await reopened.locator('#best').textContent(), String(existingBestScore));
  await reopened.close();
  await page.bringToFront();
  if ((await snapshot()).paused) await page.locator('#action').click();

  // The restart button must reset without creating a flap or new render objects.
  const objectCount = (await snapshot()).objectCount;
  for (let i = 0; i < 10; i++) {
    await page.locator('#action').click();
    await frame();
    assert.equal((await snapshot()).state, 'playing');
    await page.evaluate(() => window.flappyxTest!.advance(22));
    assert.equal((await snapshot()).state, 'gameOver');
    assert.equal(await page.locator('#action').isDisabled(), true);
    await page.evaluate(() => window.flappyxTest!.advance(15));
    await page.locator('#action').click();
    const restarted = await snapshot();
    assert.equal(restarted.state, 'ready');
    assert.equal(restarted.tick, 0);
    assert.equal(restarted.velocityY, 0);
    assert.equal(restarted.score, 0);
    assert.equal(restarted.bestScore, existingBestScore);
    assert.equal(restarted.pipeCount, 7);
    assert.equal(restarted.objectCount, objectCount);
  }

  const scales = [];
  for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(() => {
      const stage = document.getElementById('stage')!.getBoundingClientRect();
      const canvas = document.querySelector('canvas')!.getBoundingClientRect();
      return Math.abs(stage.width - canvas.width) < 1 && Math.abs(stage.height - canvas.height) < 1;
    });
    const size = await page.locator('canvas').evaluate(canvas => {
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Expected game canvas');
      const rect = canvas.getBoundingClientRect();
      return { width: canvas.width, height: canvas.height,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
    });
    assert.equal(size.width, 1024); assert.equal(size.height, 768);
    assert.ok(Math.abs(size.rect.width / size.rect.height - 4 / 3) < .001);
    assert.equal((await snapshot()).y, 464);
    scales.push({ viewport, ...size });
    if (viewport.width !== 1024) await page.screenshot({ path: `${output}/${viewport.width === 1280 ? 'wide' : 'portrait'}.png` });
  }

  const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const touch = await touchContext.newPage();
  await ready(touch);
  const canvas = await touch.locator('canvas').boundingBox();
  assert.ok(canvas);
  await touch.touchscreen.tap(canvas.x + canvas.width * .85, canvas.y + canvas.height * .65);
  await touch.evaluate(() => window.flappyxTest!.frame(1000 / 30));
  const touchSnapshot = await touch.evaluate(() => window.flappyxTest!.snapshot());
  assert.equal(touchSnapshot.y, 450.5);
  await touch.evaluate(() => window.flappyxTest!.frame(1000 / 30));
  assert.equal((await touch.evaluate(() => window.flappyxTest!.snapshot())).y, 438.5);
  await touchContext.close();

  await page.setViewportSize({ width: 1024, height: 768 });
  const replaySnapshots = [];
  for (const tick of [118, 134, 141]) {
    await ready(page, `/?replay=baseline&tick=${tick}&test=1`);
    const actual = await snapshot();
    const expected = baseline.snapshots.find(s => s.tick === tick)!;
    for (const [key, value] of Object.entries(expected)) assert.equal(actual[key as keyof typeof actual], value);
    replaySnapshots.push(actual);
    assert.equal(actual.render.birdY, expected.birdY);
    assert.equal(actual.render.roundPixels, false);
    assert.equal(await page.locator('#best-label').textContent(), '回放最高');
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).bestScore, bestScoreKey), existingBestScore);
    await page.locator('canvas').screenshot({ path: `${output}/tick-${tick}.png` });
  }
  assert.deepEqual(errors, []);
  const result = { schemaVersion: 1, baseline: 'phaser-v1', recordedAtUnixMilliseconds: Date.now(),
    browserVersion: browser.version(), configSha256: new Bun.CryptoHasher('sha256').update(await Bun.file(new URL('../../shared/config/gameplay.json', import.meta.url)).arrayBuffer()).digest('hex'),
    checks: ['three-ticks-per-animation-frame', 'fractional-render-coordinates/nearest', 'keyboard/repeat', 'pointer', 'touch/synthetic-mouse', 'pause/focus/explicit-resume', 'catch-up-cap',
      'score/death', 'game-over-blur/explicit-resume-before-restart', 'best-score-reload/reopen-page',
      'ten-restarts/no-render-growth', 'three-viewport-sizes', 'reviewed-replay-screenshots'],
    existingBestScore, animationFrames, objectCount, scales, replaySnapshots, errors };
  await Bun.write(`${output}/browser-check.json`, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Browser checks passed; evidence: ${output}`);
} finally {
  await context.close();
  await browser.close();
}
