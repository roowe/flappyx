import { strict as assert } from 'node:assert';
import { Game, config } from '../../../shared/core-ts';
import baseline from '../../../shared/fixtures/replay-baseline.json';
import { bestScoreKey, browserSession, clickButton, configHash, output, ready, snapshot, surface } from './browser-helpers';

const baseURL = process.env.FLAPPYX_URL ?? 'http://127.0.0.1:7456';
const { browser, context, page, errors } = await browserSession(baseURL, 768);
const frame = (ms = 1000 / 30) => page.evaluate(ms => window.flappyxTest!.frame(ms), ms);
let phase = 'input';
try {
  await ready(page, `${baseURL}/?test=1`, true);
  if (await page.locator('#view-select').getAttribute('value') !== 'WebpageFullScreen') {
    await page.locator('#view-select').click();
    await page.locator('#view-select li[data-device="WebpageFullScreen"]').click();
    await ready(page, `${baseURL}/?test=1`, true);
  }
  assert.equal((await snapshot(page)).bestScore, 7);
  await page.locator('canvas').screenshot({ path: `${output}/ready.png` });
  await page.mouse.click(860, 470, { button: 'right' }); await frame();
  assert.equal((await snapshot(page)).state, 'ready');
  await page.evaluate(() => window.flappyxTest!.reset());
  await page.keyboard.down('Space'); await frame();
  assert.equal((await snapshot(page)).y, 450.5);
  await page.keyboard.down('Space'); await frame();
  assert.equal((await snapshot(page)).y, 438.5);
  await page.keyboard.up('Space');
  await page.mouse.click(860, 470); await page.keyboard.press('Space'); await frame();
  assert.equal((await snapshot(page)).velocityY, -12);
  await page.touchscreen.tap(860, 470); await frame();
  assert.equal((await snapshot(page)).velocityY, -12);

  phase = 'pause';
  await page.keyboard.press('Space'); await clickButton(page, 'pause');
  const paused = await snapshot(page); assert.equal(paused.paused, true);
  assert.equal(await frame(1000), 0); assert.deepEqual(await snapshot(page), paused);
  await page.evaluate(() => window.dispatchEvent(new FocusEvent('focus')));
  assert.equal((await snapshot(page)).paused, true);
  await clickButton(page, 'action'); await frame();
  assert.equal((await snapshot(page)).y, paused.y + paused.velocityY);
  assert.ok((await snapshot(page)).accumulatedTicks < 1e-9);
  await page.evaluate(() => window.flappyxTest!.reset({ initial: { state: 'playing', y: 300 }, pipes: [] }));
  assert.equal(await frame(340), 5);
  assert.ok(Math.abs((await snapshot(page)).accumulatedTicks - .2) < 1e-9);

  phase = '151 paired snapshots';
  const options = { initial: { bestScore: 0, seed: baseline.seed }, pipeGapCenters: baseline.pipeGapCenters };
  await page.evaluate(options => window.flappyxTest!.reset(options), options);
  const expected = new Game(config, options), snapshots = [];
  const frames: string[] = [], sequence = ['bird.frame1', 'bird.frame2', 'bird.frame3', 'bird.frame2'];
  for (let tick = 0; tick <= baseline.totalTicks; tick++) {
    const actual = await snapshot(page);
    // Storage contains 7; normal settlement keeps it. The gameplay fields still match the fixture.
    if (tick >= baseline.expected.gameOverTick) expected.bestScore = 7;
    for (const [key, value] of Object.entries(expected.snapshot())) assert.deepEqual(actual[key as keyof typeof actual], value, `${tick}: ${key}`);
    assert.equal(actual.render.birdY, actual.y);
    assert.equal(actual.render.birdX, 350);
    assert.deepEqual(actual.render.texture, { minFilter: 1, magFilter: 1, mipFilter: 0 });
    assert.deepEqual(actual.render.birdSize, { width: 85, height: 60 });
    assert.equal(actual.objectCount, 35);
    const phase = expected.state === 'ready' ? expected.tick : Math.max(0, expected.flightTicks - 1);
    assert.equal(actual.render.birdFrame, sequence[Math.floor(phase / 3) % 4]);
    if (tick <= 6) frames.push(actual.render.birdFrame);
    for (const pipe of expected.pipes) {
      const [upperBody, upperHead, lowerBody, lowerHead] = actual.render.pipes[pipe.id];
      assert.equal(upperBody.y + upperBody.height / 2, upperHead.y - upperHead.height / 2);
      assert.equal(lowerHead.y + lowerHead.height / 2, lowerBody.y - lowerBody.height / 2);
      assert.equal(lowerBody.y + lowerBody.height / 2, 544);
    }
    if ([118, 134, 141].includes(tick)) snapshots.push(actual);
    if (tick < baseline.totalTicks) {
      expected.step(baseline.flapTicks.includes(tick + 1));
      await page.evaluate(flaps => window.flappyxTest!.advance(1, flaps), baseline.flapTicks);
    }
  }
  phase = 'ten restarts';
  for (let round = 0; round < 10; round++) {
    await page.evaluate(options => window.flappyxTest!.reset(options), options);
    await page.evaluate(flaps => window.flappyxTest!.advance(150, flaps), baseline.flapTicks);
    await clickButton(page, 'action');
    const s = await snapshot(page); assert.equal(s.state, 'ready'); assert.equal(s.tick, 0);
    assert.equal(s.pipeCount, 7); assert.equal(s.objectCount, 35); assert.equal(s.bestScore, 7);
  }
  phase = 'read-only replay and scale';
  const before = await page.evaluate(key => localStorage.getItem(key), bestScoreKey);
  for (const tick of [118, 134, 141]) {
    await ready(page, `${baseURL}/?replay=baseline&tick=${tick}`);
    const s = await snapshot(page); assert.equal(s.tick, tick); assert.equal(s.bestScore, tick < 141 ? 0 : 1);
    assert.equal(s.ui.best, `回放最高 ${s.bestScore}`);
    await page.locator('canvas').screenshot({ path: `${output}/tick-${tick}.png` });
  }
  const sizes = [];
  // Creator 的设备预览固定当前容器尺寸；网页全屏按新窗口尺寸重新加载。
  // 正式发布页的连续 resize 另由 production-check 验证。
  for (const size of [{ width: 1024, height: 768 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await ready(page, `${baseURL}/?replay=baseline&tick=141`);
    const s = await snapshot(page);
    assert.equal(s.y, 514); assert.equal(s.render.birdY, 514);
    assert.ok(Math.abs(s.viewport.rect.width / s.viewport.rect.height - 4 / 3) < 1e-9);
    assert.ok(Math.abs(s.viewport.scaleX - s.viewport.scaleY) < 1e-9);
    sizes.push({ window: size, viewport: s.viewport, surface: await surface(page) });
    if (size.width !== 1024) await page.screenshot({ path: `${output}/${size.width === 390 ? 'portrait' : 'wide'}.png` });
  }
  const after = await page.evaluate(key => localStorage.getItem(key), bestScoreKey); assert.equal(after, before);
  assert.deepEqual(errors, []);
  await Bun.write(`${output}/browser-check.json`, JSON.stringify({ schemaVersion: 1,
    recordedAtUnixMilliseconds: Date.now(), engine: 'cocos', creatorVersion: '3.8.8', browserVersion: browser.version(),
    configSha256: await configHash(), url: baseURL, pairedTicks: 151, frames, snapshots, sizes,
    previewSizing: 'WebpageFullScreen; reload after changing the browser viewport',
    checks: ['native-input/primary-only/touch/merge/repeat', 'native-buttons', 'pause/explicit-resume/clear-input', 'catch-up-cap',
      'all-model-fields', 'bird-animation/position/size/sampler', 'pipe-seams', 'ten-restarts/bounded-sprites',
      'fixed-replay/read-only', 'three-preview-window-sizes/reload'], storage: { before, after }, errors }, null, 2) + '\n');
  console.log('Creator 编辑器浏览器预览验收通过，151 tick 对照一致。');
} catch (error) { console.error(`失败阶段：${phase}`, await snapshot(page)); throw error; }
finally { await context.close(); await browser.close(); }
