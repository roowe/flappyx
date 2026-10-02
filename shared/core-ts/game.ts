import { config, type GameplayConfig } from './config';

// 碰撞后先进入 dying 并落地，再进入 gameOver；直接撞地会跳过 dying。
export type GameState = 'ready' | 'playing' | 'dying' | 'gameOver';
export type DeathReason = 'ground' | 'ceiling' | 'upperPipe' | 'lowerPipe';
// 内核只返回本 tick 的事件，由各引擎负责音效、界面和存档等副作用。
export type GameEvent =
  | { type: 'started' | 'flapped' }
  | { type: 'scored'; pipeId: number; score: number }
  | { type: 'died'; reason: DeathReason }
  | { type: 'gameOver'; score: number; bestScore: number }
  | { type: 'recycled'; pipeId: number };

/** 一组上下水管；回收时复用对象和 id，更新位置、缺口高度及计分标记。 */
export interface Pipe {
  id: number;
  /** 水管的水平中心，单位为逻辑画布像素。 */
  x: number;
  /** 上下水管之间缺口的垂直中心。 */
  gapCenterY: number;
  /** 本次经过是否已计分；回收后重置，确保每次经过只计一分。 */
  passed: boolean;
}

/** 可覆盖的开局状态，便于回放和测试直接构造碰撞、计分等场景。 */
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
  /** 按创建、回收顺序消费的固定缺口高度；提供后不再随机生成。 */
  pipeGapCenters?: readonly number[];
  /** 完整替换初始水管列表（空数组也有效）；调用方需按 x 从小到大排列。 */
  pipes?: readonly { x: number; gapCenterY: number; passed?: boolean }[];
}

/** 由当前随机状态生成下一个状态；相同种子可重现相同的水管序列。 */
export function xorshift32(value: number) {
  // 零会一直生成零，因此拒绝零种子及 uint32 范围外的值。
  if (!Number.isInteger(value) || value <= 0 || value > 0xffffffff) throw new Error('Seed must be a nonzero uint32');
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  // JavaScript 位运算产生有符号整数；转回无符号值后再用于取模。
  return value >>> 0;
}

/** 用鸟的轴对齐碰撞盒检测一组水管；鸟的视觉旋转不参与判定，贴边算碰撞。 */
export function pipeCollision(c: GameplayConfig, y: number, x: number, gap: number,
  offset = { x: c.bird.hitbox.offsetX, y: c.bird.hitbox.offsetY }): 'upperPipe' | 'lowerPipe' | null {
  const { bird, pipes } = c;
  // 先排除水平方向不接触的水管，再判断鸟是否越过缺口的上下边缘。
  if (Math.abs(x - bird.x - offset.x) > (pipes.width + bird.hitbox.width) / 2) return null;
  if (y + offset.y - bird.hitbox.height / 2 <= gap - pipes.gapHeight / 2) return 'upperPipe';
  if (y + offset.y + bird.hitbox.height / 2 >= gap + pipes.gapHeight / 2) return 'lowerPipe';
  return null;
}

/** 返回本组水管应增加的分数（0 或 1）；右边缘必须严格越过鸟碰撞盒的左边缘。 */
export function scoreDelta(c: GameplayConfig, state: GameState, pipeX: number, passed: boolean,
  collided: boolean, offsetX = c.bird.hitbox.offsetX) {
  const left = c.bird.x + offsetX - c.bird.hitbox.width / 2;
  return Number(state === 'playing' && !passed && !collided && pipeX + c.pipes.width / 2 < left);
}

/**
 * 三套引擎共用的游戏逻辑，不依赖渲染帧率、系统时间或引擎物理系统。
 * 调用方按固定 tick 传入拍翅输入；相同配置、初始条件和输入序列产生相同状态。
 */
export class Game {
  /** 每次 step 都递增，包括待机和结束状态，用于回放及重开保护计时。 */
  tick: number;
  state: GameState;
  /** 鸟的显示中心 Y 坐标；正方向向下。 */
  y: number;
  /** 当前竖直速度，单位为逻辑像素/tick；负值表示上升。 */
  velocityY: number;
  score: number;
  bestScore: number;
  deathTick: number | null;
  deathReason: DeathReason | null = null;
  gameOverTick: number | null = null;
  /** 仅统计 playing 分支执行次数，供背景滚动等表现使用。 */
  flightTicks = 0;
  /** 固定高度序列的读取位置，也用于验证随机水管的消费次数。 */
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
    // 此处只验证种子，不消费随机状态；随机生成水管时才推进序列。
    xorshift32(this.seed);
    this.randomState = this.seed;
    const p = settings.pipes;
    // spacing 是两组水管边缘之间的净距，因此中心间距还需加上管宽。
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
      // 回放数据耗尽或越界时直接报错，避免退回随机高度后掩盖数据错误。
      value = this.options.pipeGapCenters[this.consumedGapCenters];
      if (!Number.isInteger(value) || value < p.gapCenterMin || value > p.gapCenterMax) {
        throw new Error('Explicit pipe heights exhausted or outside the configured range');
      }
    } else {
      this.randomState = xorshift32(this.randomState);
      // 加 1 使最大高度也可取到；该取模规则是跨引擎回放的一部分。
      value = p.gapCenterMin + this.randomState % (p.gapCenterMax - p.gapCenterMin + 1);
    }
    this.consumedGapCenters++;
    return value;
  }

  private collision(): DeathReason | null {
    const c = this.settings;
    // 地面和顶边按显示尺寸判断，水管按碰撞盒判断；两者都忽略旋转。
    if (this.y + c.bird.displayHeight / 2 >= c.ground.topY) return 'ground';
    if (this.y - c.bird.displayHeight / 2 <= 0) return 'ceiling';
    // 全部水管检查完再选原因，保证优先级为地面、顶边、上管、下管，与数组顺序无关。
    const hits = this.pipes.map(p => pipeCollision(c, this.y, p.x, p.gapCenterY));
    if (hits.includes('upperPipe')) return 'upperPipe';
    if (hits.includes('lowerPipe')) return 'lowerPipe';
    return null;
  }

  /** 落地时才结算本局；将鸟贴齐地面，消除最后一步下落造成的穿透。 */
  private land(events: GameEvent[]) {
    this.y = this.settings.ground.topY - this.settings.bird.displayHeight / 2;
    this.velocityY = 0;
    this.state = 'gameOver';
    this.gameOverTick = this.tick;
    this.bestScore = Math.max(this.bestScore, this.score);
    events.push({ type: 'gameOver', score: this.score, bestScore: this.bestScore });
  }

  /** 推进一个固定 tick；调用方将本 tick 的拍翅输入汇总为布尔值，最多执行一次。 */
  step(flap = false): GameEvent[] {
    const events: GameEvent[] = [];
    this.tick++;
    // 首次输入既开始游戏，也立即拍翅；拍翅覆盖当前速度，不叠加冲量。
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
      // 先按旧速度移动，再加重力；交换顺序会改变轨迹及碰撞发生的 tick。
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
        // 碰撞优先于计分和回收，致死 tick 不再处理后续水管事件。
        return events;
      }
      for (const pipe of this.pipes) {
        if (scoreDelta(this.settings, this.state, pipe.x, pipe.passed, false)) {
          pipe.passed = true;
          this.score++;
          events.push({ type: 'scored', pipeId: pipe.id, score: this.score });
        }
      }
      // 水管右边缘完全离屏后移到队尾；保留 id，换高度并重新允许计分。
      // 使用循环以处理同一 tick 多组水管离屏的情况。
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
      // 死亡下落使用独立重力；水管停止移动，拍翅输入不再生效。
      this.y += this.velocityY;
      this.velocityY += this.settings.death.gravityPerTickSquared;
      if (this.y + this.settings.bird.displayHeight / 2 >= this.settings.ground.topY) this.land(events);
    }
    return events;
  }

  // 保护时间从碰撞 tick 开始算，同时要求已经落地，防止致死输入误触重开。
  get canRestart() {
    return this.state === 'gameOver' && this.deathTick !== null
      && this.tick >= this.deathTick + this.settings.death.restartGuardTicks;
  }

  /** 重建待机状态，保留最高分和原始种子；重开本身不会拍翅。 */
  restart() {
    if (!this.canRestart) return false;
    // 固定高度序列从头消费；测试用的其他初始状态和自定义水管列表不沿用。
    const next = new Game(this.settings, {
      initial: { bestScore: this.bestScore, seed: this.seed }, pipeGapCenters: this.options.pipeGapCenters,
    });
    Object.assign(this, next);
    return true;
  }

  /** 导出用于回放和跨引擎对照的状态；水管数组均重新生成，不暴露内部数组。 */
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
