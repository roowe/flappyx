import { config } from '../core-ts';

export class BestScoreStore {
  status = '';
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'>, private readonly key: string) {}

  read() {
    let raw: string | null;
    try { raw = this.storage.getItem(this.key); }
    catch (error) {
      if (!(error instanceof DOMException)) throw error;
      this.status = '本地存储不可用，最高分仅保留在本次游戏。';
      return 0;
    }
    if (raw === null) return 0;
    let data: unknown;
    try { data = JSON.parse(raw); }
    catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      this.status = '最高分记录损坏，新纪录将在结算时保存。';
      return 0;
    }
    if (typeof data !== 'object' || data === null || !('schemaVersion' in data)
      || data.schemaVersion !== config.storage.schemaVersion || !('bestScore' in data)
      || typeof data.bestScore !== 'number' || !Number.isSafeInteger(data.bestScore) || data.bestScore < 0) {
      this.status = '最高分记录格式不兼容，新纪录将在结算时保存。';
      return 0;
    }
    return data.bestScore;
  }

  write(bestScore: number) {
    // Another tab may have saved a higher score since this round started.
    bestScore = Math.max(bestScore, this.read());
    try {
      this.storage.setItem(this.key, JSON.stringify({ schemaVersion: config.storage.schemaVersion, bestScore }));
      this.status = '';
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
      this.status = '最高分未能保存到本地，已保留在本次游戏。';
    }
    return bestScore;
  }
}
