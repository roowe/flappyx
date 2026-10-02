import { expect, test } from 'bun:test';
import { BestScoreStore, bestScoreKey } from '../src/storage';

test('best score survives a new storage adapter with the shared schema', () => {
  const entries = new Map<string, string>();
  const storage = { getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); } };
  const first = new BestScoreStore(storage, bestScoreKey);
  expect(first.read()).toBe(0);
  const stalePage = new BestScoreStore(storage, bestScoreKey);
  expect(stalePage.read()).toBe(0);
  first.write(7);
  expect(stalePage.write(2)).toBe(7);
  expect(new BestScoreStore(storage, bestScoreKey).read()).toBe(7);
  expect(JSON.parse(entries.get(bestScoreKey)!)).toEqual({ schemaVersion: 1, bestScore: 7 });
});
