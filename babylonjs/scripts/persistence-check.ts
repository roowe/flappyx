import { chromium } from 'playwright-core';
import { strict as assert } from 'node:assert';
import { bestScoreKey } from '../src/storage';
import { fileURLToPath } from 'node:url';
import { type Page } from 'playwright-core';
import type {} from '../src/game';
const output = fileURLToPath(new URL('../../docs/baselines/babylonjs/', import.meta.url));
const configHash = async () => new Bun.CryptoHasher('sha256').update(await Bun.file(new URL('../../shared/config/gameplay.json', import.meta.url)).arrayBuffer()).digest('hex');
const snapshot = (page: Page) => page.evaluate(() => window.flappyx!.snapshot());
async function ready(page: Page, url: string) { await page.goto(url); await page.waitForFunction(() => window.flappyx !== undefined); }
import { mkdir } from 'node:fs/promises';

// Uses only the explicitly started test browser's persistent default context.
// Run earn, close the browser normally, restart the same profile, then run check.
const phase = process.argv[2];
if (phase !== 'earn' && phase !== 'check') throw new Error('用法：bun scripts/persistence-check.ts earn|check');
const browser = await chromium.connectOverCDP(process.env.CHROME_CDP_URL ?? 'http://127.0.0.1:9225');
const context = browser.contexts()[0], page = await context.newPage();
const baseURL = process.env.FLAPPYX_URL ?? 'http://127.0.0.1:5180';
const path = `${output}/persistence-check.json`;
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await ready(page, baseURL); await page.bringToFront();
  assert.equal(await page.evaluate(() => 'flappyxTest' in window), false);
  if (phase === 'earn') {
    const initialRaw = await page.evaluate(key => localStorage.getItem(key), bestScoreKey);
    assert.ok(initialRaw === null || initialRaw === '{"schemaVersion":1,"bestScore":0}',
      '请使用最高分为零的专用测试浏览器 profile，避免改动已有纪录。');
    await page.evaluate(() => {
      let sentAt = -1;
      const flap = () => {
        const s = window.flappyx!.snapshot();
        if (s.state === 'gameOver') return;
        // Normal play uses random openings, so steer toward the next opening rather than replaying fixture heights.
        const next = s.pipePassed.findIndex(passed => !passed);
        const target = s.pipeGapCenters[next] + 32;
        if (s.score === 0 && s.tick !== sentAt && s.velocityY >= 0 && s.y > target) {
          sentAt = s.tick; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
        }
        requestAnimationFrame(flap);
      };
      flap();
    });
    await page.waitForFunction(() => window.flappyx!.snapshot().state === 'gameOver', undefined, { timeout: 10000 });
    const final = await snapshot(page); assert.equal(final.score, 1); assert.equal(final.bestScore, 1);
    const raw = await page.evaluate(key => localStorage.getItem(key), bestScoreKey);
    assert.equal(raw, '{"schemaVersion":1,"bestScore":1}'); assert.deepEqual(errors, []);
    await mkdir(output, { recursive: true });
    await Bun.write(path, JSON.stringify({ schemaVersion: 1, recordedAtUnixMilliseconds: Date.now(),
      browserVersion: browser.version(), configSha256: await configHash(), url: baseURL,
      beforeRestart: { initialRaw, snapshot: final, raw }, errors }, null, 2) + '\n');
    console.log('Release 实际飞行已得 1 分并保存。现在正常退出测试浏览器，重开同一 profile 后运行 check。');
  } else {
    const report = await Bun.file(path).json(), current = await snapshot(page);
    const raw = await page.evaluate(key => localStorage.getItem(key), bestScoreKey);
    assert.equal(current.bestScore, 1); assert.equal(raw, report.beforeRestart.raw); assert.deepEqual(errors, []);
    report.afterProcessRestart = { checkedAtUnixMilliseconds: Date.now(), bestScore: current.bestScore, raw };
    await Bun.write(path, JSON.stringify(report, null, 2) + '\n');
    console.log('浏览器进程正常退出再启动后，最高分仍为 1。');
  }
} finally { await page.close(); await browser.close(); }
