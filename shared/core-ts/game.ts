import { config, type GameplayConfig } from './config';

export type GameState = 'ready' | 'playing' | 'dying' | 'gameOver';
export type DeathReason = 'ground' | 'ceiling' | 'upperPipe' | 'lowerPipe';
export type GameEvent =
  | { type: 'started' | 'flapped' }
  | { type: 'scored'; pipeId: number; score: number }
  | { type: 'died'; reason: DeathReason }
  | { type: 'gameOver'; score: number; bestScore: number }
  | { type: 'recycled'; pipeId: number };

export interface Pipe {
  id: number;
  x: number;
  gapCenterY: number;
  passed: boolean;
}

export interface InitialState {
  state?: GameState;
  tick?: number;
  y?: number;
  velocityY?: number;
  score?: number;
  bestScore?: number;
  deathTick?: number;
  firstPipeX?: number;
  pipesPassed?: boolean;
  seed?: number;
}

export interface GameOptions {
  initial?: InitialState;
  pipeGapCenters?: readonly number[];
  pipes?: readonly { x: number; gapCenterY: number; passed?: boolean }[];
}

export function xorshift32(value: number) {
  if (!Number.isInteger(value) || value <= 0 || value > 0xffffffff) throw new Error('Seed must be a nonzero uint32');
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return value >>> 0;
}

export function pipeCollision(c: GameplayConfig, y: number, x: number, gap: number,
  offset = { x: c.bird.hitbox.offsetX, y: c.bird.hitbox.offsetY }): 'upperPipe' | 'lowerPipe' | null {
  const { bird, pipes } = c;
  if (Math.abs(x - bird.x - offset.x) > (pipes.width + bird.hitbox.width) / 2) return null;
  if (y + offset.y - bird.hitbox.height / 2 <= gap - pipes.gapHeight / 2) return 'upperPipe';
  if (y + offset.y + bird.hitbox.height / 2 >= gap + pipes.gapHeight / 2) return 'lowerPipe';
  return null;
}

export function scoreDelta(c: GameplayConfig, state: GameState, pipeX: number, passed: boolean,
  collided: boolean, offsetX = c.bird.hitbox.offsetX) {
  const left = c.bird.x + offsetX - c.bird.hitbox.width / 2;
  return Number(state === 'playing' && !passed && !collided && pipeX + c.pipes.width / 2 < left);
}

export class Game {
  tick: number;
  state: GameState;
  y: number;
  velocityY: number;
  score: number;
  bestScore: number;
  deathTick: number | null;
  deathReason: DeathReason | null = null;
  gameOverTick: number | null = null;
  flightTicks = 0;
  consumedGapCenters = 0;
  pipes: Pipe[];
  private randomState: number;
  private readonly seed: number;

  constructor(readonly settings: GameplayConfig = config, private readonly options: GameOptions = {}) {
    const initial = options.initial ?? {};
    this.tick = initial.tick ?? 0;
    this.state = initial.state ?? 'ready';
    this.y = initial.y ?? settings.bird.initialY;
    this.velocityY = initial.velocityY ?? 0;
    this.score = initial.score ?? 0;
    this.bestScore = initial.bestScore ?? 0;
    this.deathTick = initial.deathTick ?? null;
    this.seed = initial.seed ?? settings.random.defaultSeed;
    xorshift32(this.seed);
    this.randomState = this.seed;
    const p = settings.pipes;
    this.pipes = options.pipes !== undefined
      ? options.pipes.map((pipe, id) => ({ ...pipe, id, passed: pipe.passed ?? false }))
      : Array.from({ length: p.activeCount }, (_, id) => ({
        id, x: (initial.firstPipeX ?? p.firstCenterX) + id * (p.width + p.spacing),
        gapCenterY: this.nextGap(), passed: initial.pipesPassed ?? false,
      }));
  }

  private nextGap() {
    const p = this.settings.pipes;
    let value: number;
    if (this.options.pipeGapCenters !== undefined) {
      value = this.options.pipeGapCenters[this.consumedGapCenters];
      if (!Number.isInteger(value) || value < p.gapCenterMin || value > p.gapCenterMax) {
        throw new Error('Explicit pipe heights exhausted or outside the configured range');
      }
    } else {
      this.randomState = xorshift32(this.randomState);
      value = p.gapCenterMin + this.randomState % (p.gapCenterMax - p.gapCenterMin + 1);
    }
    this.consumedGapCenters++;
    return value;
  }

  private collision(): DeathReason | null {
    const c = this.settings;
    if (this.y + c.bird.displayHeight / 2 >= c.ground.topY) return 'ground';
    if (this.y - c.bird.displayHeight / 2 <= 0) return 'ceiling';
    const hits = this.pipes.map(p => pipeCollision(c, this.y, p.x, p.gapCenterY));
    if (hits.includes('upperPipe')) return 'upperPipe';
    if (hits.includes('lowerPipe')) return 'lowerPipe';
    return null;
  }

  private land(events: GameEvent[]) {
    this.y = this.settings.ground.topY - this.settings.bird.displayHeight / 2;
    this.velocityY = 0;
    this.state = 'gameOver';
    this.gameOverTick = this.tick;
    this.bestScore = Math.max(this.bestScore, this.score);
    events.push({ type: 'gameOver', score: this.score, bestScore: this.bestScore });
  }

  step(flap = false): GameEvent[] {
    const events: GameEvent[] = [];
    this.tick++;
    if (flap && (this.state === 'ready' || this.state === 'playing')) {
      if (this.state === 'ready') events.push({ type: 'started' });
      this.state = 'playing';
      this.velocityY = this.settings.bird.flapVelocityPerTick;
      events.push({ type: 'flapped' });
    }
    if (this.state === 'playing') {
      const { bird, pipes, death } = this.settings;
      this.flightTicks++;
      for (const pipe of this.pipes) pipe.x -= pipes.scrollPerTick;
      this.y += this.velocityY;
      this.velocityY += bird.gravityPerTickSquared;
      const reason = this.collision();
      if (reason !== null) {
        this.deathTick = this.tick;
        this.deathReason = reason;
        this.velocityY = death.entryVelocityPerTick;
        events.push({ type: 'died', reason });
        if (reason === 'ground') this.land(events);
        else this.state = 'dying';
        return events;
      }
      for (const pipe of this.pipes) {
        if (scoreDelta(this.settings, this.state, pipe.x, pipe.passed, false)) {
          pipe.passed = true;
          this.score++;
          events.push({ type: 'scored', pipeId: pipe.id, score: this.score });
        }
      }
      while (this.pipes.length > 0 && this.pipes[0].x + pipes.width / 2 < 0) {
        const pipe = this.pipes.shift()!;
        const lastX = this.pipes.at(-1)?.x ?? pipe.x;
        pipe.x = lastX + pipes.width + pipes.spacing;
        pipe.gapCenterY = this.nextGap();
        pipe.passed = false;
        this.pipes.push(pipe);
        events.push({ type: 'recycled', pipeId: pipe.id });
      }
    } else if (this.state === 'dying') {
      this.y += this.velocityY;
      this.velocityY += this.settings.death.gravityPerTickSquared;
      if (this.y + this.settings.bird.displayHeight / 2 >= this.settings.ground.topY) this.land(events);
    }
    return events;
  }

  get canRestart() {
    return this.state === 'gameOver' && this.deathTick !== null
      && this.tick >= this.deathTick + this.settings.death.restartGuardTicks;
  }

  restart() {
    if (!this.canRestart) return false;
    const next = new Game(this.settings, {
      initial: { bestScore: this.bestScore, seed: this.seed }, pipeGapCenters: this.options.pipeGapCenters,
    });
    Object.assign(this, next);
    return true;
  }

  snapshot() {
    return {
      tick: this.tick, state: this.state, y: this.y, birdY: this.y, velocityY: this.velocityY,
      score: this.score, bestScore: this.bestScore, deathTick: this.deathTick,
      deathReason: this.deathReason, gameOverTick: this.gameOverTick,
      restartAllowedTick: this.deathTick === null ? null : this.deathTick + this.settings.death.restartGuardTicks,
      firstPipeX: this.pipes[0]?.x ?? null, pipeCount: this.pipes.length,
      pipeIds: this.pipes.map(p => p.id), pipeXs: this.pipes.map(p => p.x),
      pipeGapCenters: this.pipes.map(p => p.gapCenterY), pipePassed: this.pipes.map(p => p.passed),
      pipesPassed: this.pipes.some(p => p.passed), consumedGapCenters: this.consumedGapCenters,
      flightTicks: this.flightTicks,
    };
  }
}
