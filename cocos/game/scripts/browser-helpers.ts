import { chromium, type Page } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { project } from './paths';
import { strict as assert } from 'node:assert';
import type {} from '../assets/scripts/FlappyBird';

export const bestScoreKey = 'flappyx:cocos:best';
export const output = resolve(project, '../../docs/baselines/cocos');
export const configHash = async () => new Bun.CryptoHasher('sha256')
  .update(await Bun.file(resolve(project, '../../shared/config/gameplay.json')).arrayBuffer()).digest('hex');
export async function browserSession(baseURL: string, height: number) {
  await mkdir(output, { recursive: true });
  const browser = await chromium.connectOverCDP(process.env.CHROME_CDP_URL ?? 'http://127.0.0.1:9224');
  const context = await browser.newContext({ viewport: { width: 1024, height }, deviceScaleFactor: 1, hasTouch: true });
  await context.addInitScript(({ origin, key }) => {
    if (location.origin === origin && localStorage.getItem(key) === null) {
      localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, bestScore: 7 }));
    }
  }, { origin: new URL(baseURL).origin, key: bestScoreKey });
  const page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  return { browser, context, page, errors };
}
export async function ready(page: Page, url: string, manual = false) {
  await page.goto(url);
  await page.waitForFunction(() => window.flappyx !== undefined);
  if (manual) await page.waitForFunction(() => window.flappyxTest !== undefined);
  const fps = page.locator('#btn-show-fps.checked');
  if (await fps.count()) await fps.click();
  await page.locator('canvas').focus();
}
export const snapshot = (page: Page) => page.evaluate(() => window.flappyx!.snapshot());
export async function surface(page: Page) {
  const result = await page.locator('canvas').evaluate(canvas => {
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('需要实际 Canvas。');
    const rect = canvas.getBoundingClientRect();
    return { pixelWidth: canvas.width, pixelHeight: canvas.height, cssWidth: rect.width, cssHeight: rect.height,
      x: rect.x, y: rect.y, windowWidth: innerWidth, windowHeight: innerHeight };
  });
  assert.ok(Math.abs(result.cssWidth / result.pixelWidth - result.cssHeight / result.pixelHeight) < .001,
    'Canvas 的 CSS 与像素尺寸比例不同，画面会被拉伸。');
  assert.ok(result.x >= -1 && result.y >= -1 && result.x + result.cssWidth <= result.windowWidth + 1
    && result.y + result.cssHeight <= result.windowHeight + 1, 'Canvas 超出浏览器窗口。');
  return result;
}
export async function clickButton(page: Page, name: 'action' | 'pause') {
  const p = await page.evaluate(name => {
    const s = window.flappyx!.snapshot(), world = name === 'action' ? s.ui.actionWorld : s.ui.pauseWorld;
    const canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas')!, bounds = canvas.getBoundingClientRect();
    return { x: bounds.x + (s.viewport.rect.x + world.x * s.viewport.scaleX) * bounds.width / canvas.width,
      y: bounds.y + (canvas.height - s.viewport.rect.y - world.y * s.viewport.scaleY) * bounds.height / canvas.height };
  }, name);
  await page.mouse.click(p.x, p.y);
}
