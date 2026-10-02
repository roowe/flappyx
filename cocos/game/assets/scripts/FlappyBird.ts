import { _decorator, Component, EventTouch, Game as CocosGame, Label, Mask, Node, ResolutionPolicy,
  UITransform, game, sys, view } from 'cc';
import { DEBUG } from 'cc/env';
import { config, FixedClock, Game, type GameOptions } from './shared/core-ts';
import baseline from './shared/fixtures/replay-baseline';
import { BestScoreStore } from './shared/web-ts/storage';
import { FlightRenderer } from './FlightRenderer';
import { FlightUI, stageNode } from './FlightUI';

const { ccclass } = _decorator;
const bestScoreKey = 'flappyx:cocos:best';

@ccclass('FlappyBird')
export class FlappyBird extends Component {
  private model!: Game;
  private renderer!: FlightRenderer;
  private ui!: FlightUI;
  private stage!: Node;
  private readonly clock = new FixedClock();
  private readonly store = new BestScoreStore({ getItem: key => sys.localStorage.getItem(key),
    setItem: (key, value) => sys.localStorage.setItem(key, value) }, bestScoreKey);
  private readonly replayFlaps = new Set(baseline.flapTicks);
  private pendingFlap = false;
  private lastTime: number | null = null;
  private touchId: number | null = null;
  private replayMode = false;
  private fixedReplay = false;
  private manualMode = false;
  private replayEnd = baseline.totalTicks;
  private loaded = false;

  onLoad() { void this.boot(); }
  private async boot() {
    view.resizeWithBrowserSize(true);
    view.setDesignResolutionSize(config.canvas.width, config.canvas.height, ResolutionPolicy.SHOW_ALL);
    this.stage = stageNode(this.node, 'LogicalStage', 512, 384, 1024, 768);
    this.stage.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    try {
      const query = new URLSearchParams(location.search);
      this.replayMode = query.get('replay') === 'baseline';
      this.fixedReplay = this.replayMode && query.has('tick');
      this.manualMode = DEBUG && query.get('test') === '1';
      if (this.replayMode) {
        this.replayEnd = Number(query.get('tick') ?? baseline.totalTicks);
        if (!Number.isInteger(this.replayEnd) || this.replayEnd < 0 || this.replayEnd > baseline.totalTicks) {
          throw new Error(`回放 tick 必须在 0–${baseline.totalTicks} 之间。`);
        }
      }
      this.model = new Game(config, this.replayMode ? {
        initial: { seed: baseline.seed, bestScore: baseline.initialBestScore }, pipeGapCenters: baseline.pipeGapCenters,
      } : { initial: { bestScore: this.store.read() } });
      this.renderer = await FlightRenderer.create(this.stage);
      this.ui = new FlightUI(this.stage, this.action, this.pause);
      this.stage.on(Node.EventType.TOUCH_START, this.touchStart, this);
      this.stage.on(Node.EventType.TOUCH_END, this.touchEnd, this);
      this.stage.on(Node.EventType.TOUCH_CANCEL, this.touchEnd, this);
      // Creator consumes canvas keyboard events during bubbling. Capture retains repeat filtering.
      window.addEventListener('keydown', this.keyDown, true);
      // Creator simulates touches for every mouse button; the gameplay contract accepts only primary clicks.
      game.canvas!.addEventListener('mousedown', this.mouseButton, true);
      game.canvas!.addEventListener('mouseup', this.mouseButton, true);
      game.canvas!.addEventListener('contextmenu', this.contextMenu);
      window.addEventListener('blur', this.pause);
      document.addEventListener('visibilitychange', this.visibility);
      game.on(CocosGame.EVENT_HIDE, this.pause);
      if (this.fixedReplay) {
        while (this.model.tick < this.replayEnd) this.step(this.replayFlaps.has(this.model.tick + 1));
        this.clock.pause();
      }
      this.loaded = true; this.draw();
      // Read-only diagnostics are available in release for cross-engine fixture comparison.
      window.flappyx = { snapshot: () => this.snapshot() };
      if (this.manualMode) this.exposeTestControls();
    } catch (error) {
      const text = this.stage.addComponent(Label);
      text.string = error instanceof Error ? error.message : '游戏初始化失败，请刷新重试。';
      text.fontSize = 24; text.lineHeight = 36;
      throw error;
    }
  }
  private readonly keyDown = (event: KeyboardEvent) => {
    if (event.code !== 'Space' || event.repeat
      || (event.target instanceof Element && event.target.closest('button, input, textarea, a'))) return;
    event.preventDefault(); this.queueFlap();
  };
  private readonly mouseButton = (event: MouseEvent) => {
    if (event.button !== 0) { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  private readonly contextMenu = (event: Event) => event.preventDefault();
  private touchStart(event: EventTouch) {
    if (this.touchId !== null) return;
    this.touchId = event.getID(); this.queueFlap();
  }
  private touchEnd(event: EventTouch) { if (event.getID() === this.touchId) this.touchId = null; }
  private queueFlap() {
    if (!this.replayMode && !this.clock.paused && (this.model.state === 'ready' || this.model.state === 'playing')) this.pendingFlap = true;
  }
  private readonly visibility = () => { if (document.hidden) this.pause(); };
  private readonly pause = () => {
    this.clock.pause(); this.pendingFlap = false; this.touchId = null; this.lastTime = null;
    if (this.loaded) this.draw();
  };
  private readonly action = () => {
    if (this.clock.paused && !this.fixedReplay) {
      this.clock.resume(); this.pendingFlap = false; this.touchId = null; this.lastTime = null;
    } else if (this.replayMode) { location.href = location.pathname; return; }
    else if (this.model.state === 'gameOver') {
      if (this.model.restart()) { this.clock.reset(); this.pendingFlap = false; }
    } else this.queueFlap();
    this.draw();
  };
  private step(flap: boolean) {
    for (const event of this.model.step(flap)) {
      if (event.type === 'gameOver' && !this.replayMode) this.model.bestScore = this.store.write(event.bestScore);
    }
  }
  update() {
    if (!this.loaded) return;
    // Use the real monotonic delta; Creator's dt may be clamped after a slow frame.
    const now = performance.now(), elapsed = this.lastTime === null ? 0 : now - this.lastTime;
    this.lastTime = now;
    if (!this.manualMode) this.clock.frame(elapsed, () => {
      if (this.replayMode && this.model.tick >= this.replayEnd) return;
      const flap = this.replayMode ? this.replayFlaps.has(this.model.tick + 1) : this.pendingFlap;
      this.pendingFlap = false; this.step(flap);
    });
    this.draw();
  }
  private draw() {
    this.renderer.draw(this.model);
    this.ui.draw(this.model, this.clock.paused, this.replayMode, this.fixedReplay, this.replayEnd, this.store.status);
  }
  private snapshot() {
    const size = this.node.getComponent(UITransform)!.contentSize;
    return { ...this.model.snapshot(), paused: this.clock.paused, accumulatedTicks: this.clock.accumulatedTicks,
      objectCount: this.renderer.root.children.length, render: this.renderer.snapshot(), ui: this.ui.snapshot(),
      viewport: { width: size.width, height: size.height, scaleX: view.getScaleX(), scaleY: view.getScaleY(),
        rect: { x: view.getViewportRect().x, y: view.getViewportRect().y,
          width: view.getViewportRect().width, height: view.getViewportRect().height } } };
  }
  private exposeTestControls() {
    window.flappyxTest = {
      snapshot: () => this.snapshot(),
      frame: (ms: number) => {
        const n = this.clock.frame(ms, () => { const flap = this.pendingFlap; this.pendingFlap = false; this.step(flap); });
        this.draw(); return n;
      },
      advance: (ticks: number, flaps: number[] = []) => {
        const inputs = new Set(flaps);
        for (let i = 0; i < ticks; i++) this.step(inputs.has(this.model.tick + 1));
        this.draw();
      },
      reset: (options: GameOptions = {}) => {
        this.model = new Game(config, { ...options, initial: { bestScore: this.store.read(), ...options.initial } });
        this.clock.resume(); this.pendingFlap = false; this.touchId = null; this.lastTime = null; this.draw();
      },
    };
  }
  onDestroy() {
    game.canvas!.removeEventListener('mousedown', this.mouseButton, true);
    game.canvas!.removeEventListener('mouseup', this.mouseButton, true);
    game.canvas!.removeEventListener('contextmenu', this.contextMenu);
    window.removeEventListener('keydown', this.keyDown, true); window.removeEventListener('blur', this.pause);
    document.removeEventListener('visibilitychange', this.visibility); game.off(CocosGame.EVENT_HIDE, this.pause);
    delete window.flappyx; delete window.flappyxTest;
  }
}

declare global {
  interface Window {
    flappyx?: { snapshot: () => ReturnType<FlappyBird['snapshot']> };
    flappyxTest?: { snapshot: () => ReturnType<FlappyBird['snapshot']>;
      frame: (milliseconds: number) => number; advance: (ticks: number, flaps?: number[]) => void;
      reset: (options?: GameOptions) => void };
  }
}
