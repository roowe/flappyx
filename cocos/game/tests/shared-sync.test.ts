import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { Game as Original, config as originalConfig } from '../../../shared/core-ts';
import baseline from '../../../shared/fixtures/replay-baseline.json';
import metadata from '../../../shared/assets/runtime/sprites.json';
import { Game as Copied, config as copiedConfig } from '../assets/scripts/shared/core-ts';
import copiedBaseline from '../assets/scripts/shared/fixtures/replay-baseline';
import copiedMetadata from '../assets/scripts/shared/config/sprites';

test('Creator 派生源码及 JSON 与共享源一致，逐 tick 运行同一份内核', async () => {
  expect(copiedConfig).toEqual(originalConfig);
  expect(copiedBaseline).toEqual(baseline);
  expect(copiedMetadata).toEqual(metadata);
  const options = { initial: { seed: baseline.seed, bestScore: baseline.initialBestScore }, pipeGapCenters: baseline.pipeGapCenters };
  const original = new Original(originalConfig, options), copied = new Copied(copiedConfig, options);
  for (let tick = 0; tick <= baseline.totalTicks; tick++) {
    expect(copied.snapshot()).toEqual(original.snapshot());
    if (tick < baseline.totalTicks) {
      const flap = baseline.flapTicks.includes(tick + 1);
      original.step(flap); copied.step(flap);
    }
  }
  const project = resolve(import.meta.dir, '..'), repository = resolve(project, '../..');
  const report = await Bun.file(resolve(project, 'temp/shared-sync.json')).json();
  expect(report.files).toHaveLength(17);
  for (const entry of report.files) {
    const digest = async (path: string) => new Bun.CryptoHasher('sha256').update(await Bun.file(path).arrayBuffer()).digest('hex');
    expect(await digest(resolve(repository, entry.source))).toBe(entry.sourceSha256);
    expect(await digest(resolve(project, entry.target))).toBe(entry.targetSha256);
    if (entry.source.endsWith('.png') || /\/(game|clock|index|storage)\.ts$/.test(entry.source)) {
      expect(entry.targetSha256).toBe(entry.sourceSha256);
    }
  }
});
