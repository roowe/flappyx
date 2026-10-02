import { chromium, type Page } from 'playwright-core';
import { strict as assert } from 'node:assert';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import baseline from '../../shared/fixtures/replay-baseline.json';
import cases from '../../shared/fixtures/gameplay-cases.json';
import { config } from '../../shared/core-ts';
import { bestScoreKey } from '../src/storage';
import type {} from '../src/game';

// Connect to an explicitly started browser; no disposable profile is silently deleted.
const browser = await chromium.connectOverCDP(process.env.CHROME_CDP_URL ?? 'http://127.0.0.1:9225');
const baseURL = process.env.FLAPPYX_URL ?? 'http://127.0.0.1:5179';
const phaserURL = process.env.PHASER_URL ?? 'http://127.0.0.1:5174';
const output = fileURLToPath(new URL('../../docs/baselines/babylonjs/', import.meta.url));
await mkdir(output, { recursive: true });
const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 });
const existingBestScore = 7;
const replayTicks = [baseline.expected.scoreTicks[0], baseline.expected.deathTick, baseline.expected.gameOverTick];
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
    assert.equal(actual.render.texture.samplingMode, 1); // Babylon.js NearestFilter
    assert.equal(actual.render.texture.invertY, true);
    assert.equal(actual.render.texture.noMipmap, true);
  }
  await page.evaluate(() => window.flappyxTest!.reset());
  await page.locator('canvas').click({ position: { x: 850, y: 450 }, button: 'right' });
  await frame();
  assert.equal((await snapshot()).state, 'ready');
  await page.evaluate(() => window.flappyxTest!.reset());
  await page.keyboard.down('Space');
  await frame();
  assert.equal((await snapshot()).y, config.bird.initialY + config.bird.flapVelocityPerTick);
  await page.keyboard.down('Space'); // key repeat is ignored even across ticks
  await frame();
  assert.equal((await snapshot()).y, config.bird.initialY + 2 * config.bird.flapVelocityPerTick + config.bird.gravityPerTickSquared);
  await page.keyboard.up('Space');
  await page.keyboard.press('Space');
  await page.locator('canvas').click({ position: { x: 850, y: 450 } });
  const beforeMergedInput = await snapshot();
  await frame();
  assert.equal((await snapshot()).velocityY, config.bird.flapVelocityPerTick + config.bird.gravityPerTickSquared);
  assert.equal((await snapshot()).y, beforeMergedInput.y + config.bird.flapVelocityPerTick);

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

  // 在两个真实适配层逐 tick 对照，fixture 的关键快照另在下方独立核对。
  await ready(page, '/?replay=baseline&tick=0&test=1');
  const phaser = await context.newPage();
  await phaser.goto(`${phaserURL}/?replay=baseline&tick=0&test=1`);
  await phaser.waitForFunction(() => window.flappyxTest !== undefined);
  const pairedReplay = [];
  for (let tick = 0; tick <= baseline.totalTicks; tick++) {
    if (tick > 0) for (const target of [page, phaser]) {
      await target.evaluate(flaps => window.flappyxTest!.advance(1, flaps), baseline.flapTicks);
    }
    const actual = await snapshot();
    const peer = await phaser.evaluate(() => window.flappyxTest!.snapshot());
    for (const key of ['tick', 'state', 'y', 'birdY', 'velocityY', 'score', 'bestScore', 'firstPipeX', 'pipeCount',
      'flightTicks', 'deathTick', 'gameOverTick', 'deathReason', 'restartAllowedTick', 'pipeIds', 'pipeXs',
      'pipeGapCenters', 'pipePassed', 'pipesPassed', 'consumedGapCenters'] as const) {
      assert.deepEqual(actual[key], peer[key], `Babylon.js/Phaser ${key} at tick ${tick}`);
    }
    assert.equal(actual.render.birdFrame, peer.render.birdFrame);
    assert.equal(actual.render.birdY, peer.render.birdY);
    assert.deepEqual(actual.render.birdSize, { width: 85, height: 60 });
    // Babylon also creates one default material; it must remain bounded alongside the nine sprite materials.
    assert.deepEqual(actual.render.memory, { geometries: 1, textures: 9, materials: 10 });
    for (const [upperBody, upperHead, lowerBody, lowerHead] of actual.render.pipes) {
      assert.equal(upperBody.y - upperBody.height / 2, 0);
      assert.equal(upperBody.y + upperBody.height / 2, upperHead.y - upperHead.height / 2);
      assert.equal(lowerHead.y + lowerHead.height / 2, lowerBody.y - lowerBody.height / 2);
      assert.equal(lowerBody.y + lowerBody.height / 2, config.ground.topY);
    }
    const expected = baseline.snapshots.find(s => s.tick === tick);
    if (expected) pairedReplay.push({ tick, babylonjs: actual, phaser: peer });
  }
  await phaser.close();
  await page.bringToFront();
  await ready(page);

  // Execute the reviewed scoring/death replay through the actual Scene and storage adapter.
  await page.evaluate(gaps => window.flappyxTest!.reset({ pipeGapCenters: gaps }), baseline.pipeGapCenters);
  await page.evaluate(({ tick, flaps }) => window.flappyxTest!.advance(tick, flaps),
    { tick: replayTicks[0], flaps: baseline.flapTicks });
  assert.equal((await snapshot()).score, 1);
  assert.equal((await snapshot()).y, baseline.snapshots.find(s => s.tick === replayTicks[0])!.birdY);
  await page.evaluate(({ ticks, flaps }) => window.flappyxTest!.advance(ticks, flaps),
    { ticks: baseline.totalTicks - replayTicks[0], flaps: baseline.flapTicks });
  const finished = await snapshot();
  assert.equal(finished.state, 'gameOver');
  assert.equal(finished.deathTick, baseline.expected.deathTick);
  assert.equal(finished.gameOverTick, baseline.expected.gameOverTick);
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
  const renderMemory = (await snapshot()).render.memory;
  for (let i = 0; i < 10; i++) {
    await page.locator('#action').click();
    await frame();
    assert.equal((await snapshot()).state, 'playing');
    await page.evaluate(ticks => window.flappyxTest!.advance(ticks), cases.trajectory.expected.deathTick - 1);
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
    assert.deepEqual(restarted.render.memory, renderMemory);
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
    assert.equal((await snapshot()).y, config.bird.initialY);
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
  assert.equal(touchSnapshot.y, config.bird.initialY + config.bird.flapVelocityPerTick);
  await touch.evaluate(() => window.flappyxTest!.frame(1000 / 30));
  assert.equal((await touch.evaluate(() => window.flappyxTest!.snapshot())).y, config.bird.initialY + 2 * config.bird.flapVelocityPerTick + config.bird.gravityPerTickSquared);
  await touchContext.close();

  await page.setViewportSize({ width: 1024, height: 768 });
  const replaySnapshots = [];
  for (const tick of replayTicks) {
    await ready(page, `/?replay=baseline&tick=${tick}&test=1`);
    const actual = await snapshot();
    const expected = baseline.snapshots.find(s => s.tick === tick)!;
    for (const [key, value] of Object.entries(expected)) assert.equal(actual[key as keyof typeof actual], value);
    replaySnapshots.push(actual);
    assert.equal(actual.render.birdY, expected.birdY);
    assert.equal(actual.render.birdWorldY, 768 - expected.birdY);
    assert.deepEqual(actual.render.camera, { mode: 1, left: -512, right: 512, top: 384, bottom: -384 });
    assert.equal(await page.locator('#best-label').textContent(), '回放最高');
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).bestScore, bestScoreKey), existingBestScore);
    await page.locator('canvas').screenshot({ path: `${output}/tick-${tick}.png` });
  }
  assert.deepEqual(errors, []);
  const result = { schemaVersion: 1, baseline: config.baselineStatus, recordedAtUnixMilliseconds: Date.now(),
    browserVersion: browser.version(), configSha256: new Bun.CryptoHasher('sha256').update(await Bun.file(new URL('../../shared/config/gameplay.json', import.meta.url)).arrayBuffer()).digest('hex'),
    checks: [`paired-Phaser-${baseline.totalTicks}-tick-replay`, 'orthographic-coordinate-conversion', 'three-ticks-per-animation-frame',
      'fractional-render-coordinates/nearest', 'pipe-seams', 'keyboard/repeat', 'primary-pointer/merged-input', 'touch/synthetic-mouse', 'pause/focus/explicit-resume', 'catch-up-cap',
      'score/death', 'game-over-blur/explicit-resume-before-restart', 'best-score-reload/reopen-page',
      'ten-restarts/no-render-or-GPU-growth', 'three-viewport-sizes', 'reviewed-replay-screenshots'],
    engine: 'babylonjs', existingBestScore, animationFrames, objectCount, renderMemory, pairedReplay, scales, replaySnapshots, errors };
  await Bun.write(`${output}/browser-check.json`, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Browser checks passed; evidence: ${output}`);
} finally {
  await context.close();
  await browser.close();
}
