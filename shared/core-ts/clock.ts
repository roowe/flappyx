import { config, type GameplayConfig } from './config';

export class FixedClock {
  accumulatedTicks = 0;
  paused = false;
  constructor(private readonly simulation: GameplayConfig['simulation'] = config.simulation) {}

  pause() { this.paused = true; }
  resume() { this.paused = false; this.accumulatedTicks = 0; }
  reset() { this.accumulatedTicks = 0; }

  frame(milliseconds: number, step: () => void) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error('Frame delta must be finite and nonnegative');
    if (this.paused) return 0;
    this.accumulatedTicks += milliseconds * this.simulation.tickRate / 1000;
    // RAF deltas such as 1000/120 can land just below an integral tick in float64.
    const whole = Math.floor(this.accumulatedTicks + 1e-9);
    const processed = Math.min(whole, this.simulation.maxCatchUpTicks);
    this.accumulatedTicks = Math.max(0, this.accumulatedTicks - whole);
    for (let i = 0; i < processed; i++) step();
    return processed;
  }
}
