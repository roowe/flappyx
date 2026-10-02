import { config, FixedClock, Game, type GameOptions } from '../../shared/core-ts';
import baseline from '../../shared/fixtures/replay-baseline.json';
import { element, ui } from '../../shared/web-ts/ui';
import { BestScoreStore, bestScoreKey } from './storage';
import { FlightRenderer } from './renderer';

const query = new URLSearchParams(location.search);
const replayMode = query.get('replay') === 'baseline';
const manualMode = import.meta.env.DEV && query.get('test') === '1';
const requestedTick = Number(query.get('tick') ?? baseline.totalTicks);
if (replayMode && (!Number.isInteger(requestedTick) || requestedTick < 0 || requestedTick > baseline.totalTicks)) {
  throw new Error(`Replay tick must be between 0 and ${baseline.totalTicks}`);
}

export class FlightGame {
  private model: Game;
  private readonly clock = new FixedClock();
  private readonly store = new BestScoreStore({ getItem: key => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value) }, bestScoreKey);
  private readonly replayFlaps = new Set(baseline.flapTicks);
  private pendingFlap = false;
  private lastTime: number | null = null;
  private raf = 0;
  private lastUI = '';

  static async create() {
    return new FlightGame(await FlightRenderer.create(element('game', HTMLElement)));
  }

  private constructor(private readonly view: FlightRenderer) {
    this.model = new Game(config, replayMode ? {
      initial: { seed: baseline.seed, bestScore: baseline.initialBestScore }, pipeGapCenters: baseline.pipeGapCenters,
    } : { initial: { bestScore: this.store.read() } });
    view.canvas.addEventListener('pointerdown', this.pointerDown);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('blur', this.pause);
    document.addEventListener('visibilitychange', this.visibility);
    ui.pause.addEventListener('click', this.pause);
    ui.action.addEventListener('click', this.action);
    if (replayMode && query.has('tick')) {
      while (this.model.tick < requestedTick) this.step(this.replayFlaps.has(this.model.tick + 1));
      this.clock.pause();
    }
    this.draw();
    if (manualMode) this.exposeTestControls();
    this.raf = requestAnimationFrame(this.update);
  }

  private readonly pointerDown = (event: PointerEvent) => {
    if (event.isPrimary && event.button === 0) this.queueFlap();
  };
  private readonly keyDown = (event: KeyboardEvent) => {
    if (event.code !== 'Space' || event.repeat
      || (event.target instanceof Element && event.target.closest('button, input, textarea, a'))) return;
    event.preventDefault();
    this.queueFlap();
  };
  private queueFlap() {
    if (!replayMode && !this.clock.paused && (this.model.state === 'ready' || this.model.state === 'playing')) this.pendingFlap = true;
  }
  private readonly visibility = () => { if (document.hidden) this.pause(); };
  private readonly pause = () => {
    this.clock.pause(); this.pendingFlap = false; this.lastTime = null; this.draw();
  };
  private readonly action = () => {
    if (this.clock.paused && !(replayMode && query.has('tick'))) {
      this.clock.resume(); this.pendingFlap = false; this.lastTime = null;
    } else if (replayMode) { location.href = location.pathname; return; }
    else if (this.model.state === 'gameOver') {
      if (this.model.restart()) { this.clock.reset(); this.pendingFlap = false; }
    } else this.queueFlap();
    ui.action.blur(); this.draw();
  };

  private step(flap: boolean) {
    for (const event of this.model.step(flap)) {
      if (event.type === 'gameOver' && !replayMode) this.store.write(event.bestScore);
    }
  }

  private readonly update = (time: number) => {
    const elapsed = this.lastTime === null ? 0 : time - this.lastTime;
    this.lastTime = time;
    if (!manualMode) this.clock.frame(elapsed, () => {
      if (replayMode && this.model.tick >= requestedTick) return;
      const flap = replayMode ? this.replayFlaps.has(this.model.tick + 1) : this.pendingFlap;
      this.pendingFlap = false; this.step(flap);
    });
    this.draw();
    this.raf = requestAnimationFrame(this.update);
  };

  private draw() {
    this.view.draw(this.model);
    const m = this.model;
    const key = `${m.state}:${m.score}:${m.bestScore}:${m.canRestart}:${this.clock.paused}:${this.store.status}:${replayMode && m.tick}`;
    if (key === this.lastUI) return;
    this.lastUI = key;
    ui.score.textContent = String(m.score); ui.best.textContent = String(m.bestScore);
    ui.bestLabel.textContent = replayMode ? '回放最高' : '最高';
    ui.storageStatus.textContent = this.store.status;
    ui.pause.disabled = this.clock.paused || (replayMode && query.has('tick'));
    ui.action.disabled = false;
    ui.panel.hidden = m.state === 'playing' || m.state === 'dying';
    if (this.clock.paused && !(replayMode && query.has('tick'))) {
      ui.panel.hidden = false; ui.eyebrow.textContent = '稍作休息'; ui.heading.textContent = '游戏已暂停';
      ui.message.textContent = '准备好了，再继续向前飞。'; ui.action.textContent = '继续游戏';
      ui.hint.textContent = '恢复后不会自动拍翅膀';
    } else if (replayMode) {
      ui.edition.textContent = `基准回放 · tick ${m.tick}`;
      ui.panel.hidden = m.tick < requestedTick || query.has('tick');
      ui.eyebrow.textContent = '基准回放完成'; ui.heading.textContent = `${m.score} 分`;
      ui.message.textContent = '同一套输入与水管，供各引擎对照。'; ui.action.textContent = '返回游戏';
      ui.hint.textContent = '回放不写入最高分';
    } else if (m.state === 'gameOver') {
      ui.eyebrow.textContent = '本局结束'; ui.heading.textContent = `${m.score} 分`;
      ui.message.textContent = `最高纪录 ${m.bestScore} 分，再试一次吧。`;
      ui.action.textContent = m.canRestart ? '重新开始' : '稍候…'; ui.action.disabled = !m.canRestart;
      ui.hint.textContent = '重新开始后，点击或空格起飞';
    } else if (m.state === 'ready') {
      ui.eyebrow.textContent = '准备好了吗？'; ui.heading.textContent = '向前飞吧';
      ui.message.textContent = '穿过水管，每次拍翅都更接近新纪录。'; ui.action.textContent = '开始飞行';
      ui.hint.textContent = '空格 / 点击画面 / 轻触起飞';
    }
  }

  private exposeTestControls() {
    window.flappyxTest = {
      snapshot: () => ({ ...this.model.snapshot(), paused: this.clock.paused,
        accumulatedTicks: this.clock.accumulatedTicks, objectCount: this.view.scene.children.length,
        render: this.view.snapshot() }),
      frame: (milliseconds: number) => {
        const ticks = this.clock.frame(milliseconds, () => { const flap = this.pendingFlap; this.pendingFlap = false; this.step(flap); });
        this.draw(); return ticks;
      },
      advance: (ticks: number, flaps: number[] = []) => {
        const inputs = new Set(flaps);
        for (let i = 0; i < ticks; i++) this.step(inputs.has(this.model.tick + 1));
        this.draw();
      },
      reset: (options: GameOptions = {}) => {
        this.model = new Game(config, { ...options, initial: { bestScore: this.store.read(), ...options.initial } });
        this.clock.resume(); this.pendingFlap = false; this.lastTime = null; this.draw();
      },
    };
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.view.canvas.removeEventListener('pointerdown', this.pointerDown);
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('blur', this.pause);
    document.removeEventListener('visibilitychange', this.visibility);
    ui.pause.removeEventListener('click', this.pause);
    ui.action.removeEventListener('click', this.action);
    this.view.dispose();
  }
}

declare global {
  interface Window {
    flappyxTest?: {
      snapshot: () => ReturnType<Game['snapshot']> & { paused: boolean; accumulatedTicks: number; objectCount: number;
        render: ReturnType<FlightRenderer['snapshot']> };
      frame: (milliseconds: number) => number;
      advance: (ticks: number, flaps?: number[]) => void;
      reset: (options?: GameOptions) => void;
    };
  }
}
