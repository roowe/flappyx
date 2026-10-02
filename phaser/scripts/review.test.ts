import { afterAll, beforeAll, expect, test } from 'bun:test';
import { chromium, type Browser } from 'playwright-core';

let browser: Browser;
const devURL = process.env.FLAPPYX_URL ?? 'http://127.0.0.1:5174';

beforeAll(async () => {
  browser = await chromium.connectOverCDP(process.env.CHROME_CDP_URL ?? 'http://127.0.0.1:9224');
});
afterAll(async () => { await browser?.close(); });

test('a missing texture leaves the game stopped and its controls disabled', async () => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/sky.png*', route => route.request().resourceType() === 'xhr'
      ? route.fulfill({ status: 404, contentType: 'text/plain', body: 'missing texture' }) : route.continue());
    await page.goto(`${devURL}/?test=1`);
    await page.locator('#load-error').waitFor({ state: 'visible' });
    // Wait until Phaser has finished loading every image and attempted scene creation.
    await page.waitForLoadState('networkidle');
    expect(await page.locator('#load-error').innerText()).toContain('background.sky');
    expect(await page.locator('#action').isDisabled()).toBe(true);
    expect(await page.locator('#pause').isDisabled()).toBe(true);
    expect(await page.evaluate(() => 'flappyxTest' in window)).toBe(false);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
}, 15000);

test('destroying the game releases browser listeners', async () => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.route('**/src/main.ts*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `${await response.text()}\nexport { game };` });
    });
    await page.goto(`${devURL}/?test=1`);
    await page.waitForFunction(() => 'flappyxTest' in window);
    await page.evaluate(async () => {
      const url = document.querySelector<HTMLScriptElement>('script[src*="/src/main.ts"]')!.src;
      const { game } = await import(url);
      game.destroy(true);
      // Destruction runs on the next frame, which background Chrome windows can throttle.
      game.step(performance.now(), 0);
    });
    await page.locator('canvas').waitFor({ state: 'detached' });
    const errors = await page.evaluate(() => {
      const errors: string[] = [];
      window.addEventListener('error', event => errors.push(event.message));
      window.dispatchEvent(new Event('blur'));
      document.getElementById('action')!.click();
      return errors;
    });
    expect(errors).toEqual([]);
  } finally { await context.close(); }
}, 15000);
