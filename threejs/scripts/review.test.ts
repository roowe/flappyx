import { afterAll, beforeAll, expect, test } from 'bun:test';
import { chromium, type Browser } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import type { GameplayConfig } from '../../shared/core-ts';
import type {} from '../src/game';

let browser: Browser;
const devURL = process.env.FLAPPYX_URL ?? 'http://127.0.0.1:5176';
const productionURL = process.env.FLAPPYX_PRODUCTION_URL ?? 'http://127.0.0.1:5177';
const configURL = `/@fs${fileURLToPath(new URL('../../shared/core-ts/config.ts', import.meta.url))}`;

beforeAll(async () => {
  browser = await chromium.connectOverCDP(process.env.CHROME_CDP_URL ?? 'http://127.0.0.1:9224');
});
afterAll(async () => { await browser.close(); });

test('loading failures identify the texture, page node or WebGL stage', async () => {
  for (const kind of ['texture', 'node', 'webgl'] as const) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      if (kind === 'texture') {
        await page.route('**/sky.png*', route => route.request().resourceType() === 'image'
          ? route.fulfill({ status: 404, contentType: 'text/plain', body: 'missing texture' }) : route.continue());
      } else if (kind === 'node') {
        await page.route(`${devURL}/?test=1`, async route => {
          const response = await route.fetch();
          await route.fulfill({ response, body: (await response.text()).replace('<div id="game"></div>', '') });
        });
      } else {
        await context.addInitScript(() => {
          const original = HTMLCanvasElement.prototype.getContext;
          Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
            value(this: HTMLCanvasElement, id: string, options?: unknown) {
              return id === 'webgl2' ? null : Reflect.apply(original, this, [id, options]);
            },
          });
        });
      }
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${devURL}/?test=1`);
      await page.locator('#load-error').waitFor({ state: 'visible', timeout: 5000 });
      const message = await page.locator('#load-error').innerText();
      expect(message).toContain({ texture: 'sky.png', node: '#game', webgl: 'WebGL2 初始化失败' }[kind]);
      if (kind !== 'webgl') expect(message).not.toContain('WebGL2');
      expect(await page.locator('#action').isDisabled()).toBe(true);
      await page.waitForFunction(() => !('flappyxTest' in window));
      expect(errors.length).toBeGreaterThan(0);
    } finally { await context.close(); }
  }
}, 15000);

test('roundPixels changes display coordinates without changing the model', async () => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(`${devURL}/?test=1`);
    await page.waitForFunction(() => window.flappyxTest !== undefined);
    await page.evaluate(() => window.flappyxTest!.reset({ initial: { state: 'playing', y: 240.5 }, pipes: [] }));
    const before = await page.evaluate(() => window.flappyxTest!.snapshot());
    expect(before.render.birdY).toBe(240.5);
    expect(before.render.roundPixels).toBe(false);
    await page.evaluate(async url => {
      const module: { config: GameplayConfig } = await import(url);
      module.config.render.roundPixels = true;
      window.flappyxTest!.frame(0);
    }, configURL);
    const rounded = await page.evaluate(() => window.flappyxTest!.snapshot());
    expect(rounded.render.birdY).toBe(241);
    expect(rounded.render.roundPixels).toBe(true);
    expect(rounded.render.birdWorldY).toBe(527);
    expect({ ...rounded, render: before.render }).toEqual(before);
    await page.evaluate(async url => {
      const module: { config: GameplayConfig } = await import(url);
      module.config.render.roundPixels = false;
      window.flappyxTest!.frame(0);
    }, configURL);
    expect(await page.evaluate(() => window.flappyxTest!.snapshot())).toEqual(before);
  } finally { await context.close(); }
}, 15000);

test('favicon resolves to PNG in development and production', async () => {
  for (const baseURL of [devURL, productionURL]) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(`${baseURL}/?test=1`);
      await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('#action')!.disabled);
      const icon = await page.evaluate(async () => {
        const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')!;
        const response = await fetch(link.href);
        return { status: response.status, type: response.headers.get('content-type'),
          signature: Array.from(new Uint8Array(await response.arrayBuffer()).slice(0, 8)) };
      });
      expect(icon.status).toBe(200);
      expect(icon.type).toContain('image/png');
      expect(icon.signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    } finally { await context.close(); }
  }
}, 15000);
