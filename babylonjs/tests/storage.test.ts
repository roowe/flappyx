import { expect, test } from 'bun:test';
import { BestScoreStore, bestScoreKey } from '../src/storage';
import { bestScoreKey as phaserKey } from '../../phaser/src/storage';

test('Babylon.js best score survives a new adapter and remains separate from Phaser', () => {
  const entries = new Map<string, string>();
  const storage = { getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); } };
  new BestScoreStore(storage, phaserKey).write(5);
  const first = new BestScoreStore(storage, bestScoreKey);
  expect(first.read()).toBe(0);
  const stalePage = new BestScoreStore(storage, bestScoreKey);
  expect(stalePage.read()).toBe(0);
  first.write(7);
  expect(stalePage.write(2)).toBe(7);
  expect(new BestScoreStore(storage, bestScoreKey).read()).toBe(7);
  expect(new BestScoreStore(storage, phaserKey).read()).toBe(5);
  expect(JSON.parse(entries.get(bestScoreKey)!)).toEqual({ schemaVersion: 1, bestScore: 7 });
});
