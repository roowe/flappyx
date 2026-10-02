import Phaser from 'phaser';
import { config, FixedClock, Game, type GameEvent, type GameOptions } from '../../shared/core-ts';
import metadata from '../../shared/assets/runtime/sprites.json';
import baseline from '../../shared/fixtures/replay-baseline.json';
import { BestScoreStore, bestScoreKey } from './storage';
import { ui } from './ui';

type Image = Phaser.GameObjects.Image;
type SpriteMetadata = typeof metadata.sprites[number];
const urls = import.meta.glob<string>('../../shared/assets/runtime/*.png', { eager: true, query: '?url', import: 'default' });
const sprites = new Map(metadata.sprites.map(sprite => [sprite.id, sprite]));
const query = new URLSearchParams(location.search);
const replayMode = query.get('replay') === 'baseline';
const manualMode = import.meta.env.DEV && query.get('test') === '1';
const requestedTick = Number(query.get('tick') ?? baseline.totalTicks);
if (replayMode && (!Number.isInteger(requestedTick) || requestedTick < 0 || requestedTick > baseline.totalTicks)) {
  throw new Error(`Replay tick must be between 0 and ${baseline.totalTicks}`);
}

export class FlightScene extends Phaser.Scene {
  model!: Game;
  readonly clock = new FixedClock();
  private store!: BestScoreStore;
  private bird!: Image;
  private sky: Image[] = [];
  private land: Image[] = [];
  private pipeImages: Image[][] = [];
  private pendingFlap = false;
  private lastTime: number | null = null;
  private lastUI = '';
  private loadFailed = false;
  private replayFlaps = new Set(baseline.flapTicks);

  constructor() { super('flight'); }

  preload() {
    for (const sprite of metadata.sprites) this.load.image(sprite.id, urls[`../../shared/assets/runtime/${sprite.file}`]);
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      this.loadFailed = true;
      ui.loadError.hidden = false;
      ui.loadError.textContent = `图片加载失败：${file.key}。请刷新页面重试。`;
    });
  }

  create() {
    if (this.loadFailed) { this.scene.stop(); return; }
    // Access to localStorage itself can raise SecurityError in restricted browser contexts.
    this.store = new BestScoreStore({ getItem: key => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value) }, bestScoreKey);
    this.model = new Game(config, replayMode ? {
      initial: { seed: baseline.seed, bestScore: baseline.initialBestScore }, pipeGapCenters: baseline.pipeGapCenters,
    } : { initial: { bestScore: this.store.read() } });
    this.sky = this.tiles(config.sky.spriteId);
    this.pipeImages = Array.from({ length: config.pipes.activeCount }, () => [
      this.image(config.pipes.upperBodySpriteId, 1), this.image(config.pipes.upperHeadSpriteId),
      this.image(config.pipes.lowerBodySpriteId, 1), this.image(config.pipes.lowerHeadSpriteId),
    ]);
    this.land = this.tiles(config.ground.spriteId);
    this.bird = this.image('bird.frame1');
    this.game.canvas.addEventListener('pointerdown', this.pointerDown);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('blur', this.pause);
    document.addEventListener('visibilitychange', this.visibility);
    ui.pause.addEventListener('click', this.pause);
    ui.action.addEventListener('click', this.action);
    const cleanup = () => {
      this.game.canvas.removeEventListener('pointerdown', this.pointerDown);
      window.removeEventListener('keydown', this.keyDown);
      window.removeEventListener('blur', this.pause);
      document.removeEventListener('visibilitychange', this.visibility);
      ui.pause.removeEventListener('click', this.pause);
      ui.action.removeEventListener('click', this.action);
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
      this.events.off(Phaser.Scenes.Events.DESTROY, cleanup);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    if (replayMode && query.has('tick')) {
      while (this.model.tick < requestedTick) this.step(this.replayFlaps.has(this.model.tick + 1));
      this.clock.pause();
    }
    if (manualMode) this.exposeTestControls();
    this.renderModel();
  }

  private image(id: string, height?: number) {
    const sprite = sprites.get(id)!;
    const h = height ?? sprite.displaySize.height;
    if (h === null) throw new Error(`Dynamic body requires a height: ${id}`);
    return this.add.image(0, 0, id).setOrigin(sprite.pivot.x, sprite.pivot.y)
      .setDisplaySize(sprite.displaySize.width, h);
  }

  private tiles(id: string) {
    const width = sprites.get(id)!.displaySize.width;
    return Array.from({ length: Math.ceil(config.canvas.width / width) + 1 }, () => this.image(id));
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
    this.clock.pause();
    this.pendingFlap = false;
    this.lastTime = null;
    this.renderModel();
  };
  private readonly action = () => {
    if (this.clock.paused && !(replayMode && query.has('tick'))) {
      this.clock.resume();
      this.pendingFlap = false;
      this.lastTime = null;
    } else if (replayMode) { location.href = location.pathname; return; }
    else if (this.model.state === 'gameOver') {
      if (this.model.restart()) { this.clock.reset(); this.pendingFlap = false; }
    } else this.queueFlap();
    // Keyboard focus on a start button must not trap subsequent Space flaps.
    ui.action.blur();
    this.renderModel();
  };

  private step(flap: boolean) {
    this.consume(this.model.step(flap));
  }
  private consume(events: GameEvent[]) {
    for (const event of events) if (event.type === 'gameOver' && !replayMode) {
      this.model.bestScore = this.store.write(event.bestScore);
    }
  }

  update(time: number) {
    const elapsed = this.lastTime === null ? 0 : time - this.lastTime;
    this.lastTime = time;
    if (!manualMode) this.clock.frame(elapsed, () => {
      if (replayMode && this.model.tick >= requestedTick) return;
      const flap = replayMode ? this.replayFlaps.has(this.model.tick + 1) : this.pendingFlap;
      this.pendingFlap = false;
      this.step(flap);
    });
    this.renderModel();
  }

  private drawTiles(images: Image[], sprite: SpriteMetadata, bottom: number, scroll: number) {
    const { width, height } = sprite.displaySize;
    const left = -(this.model.flightTicks * scroll % width);
    for (const [i, image] of images.entries()) image.setPosition(left + (i + sprite.pivot.x) * width,
      bottom - height! + height! * sprite.pivot.y);
  }

  renderModel() {
    const c = config;
    this.drawTiles(this.sky, sprites.get(c.sky.spriteId)!, c.ground.topY, c.sky.scrollPerTick);
    this.drawTiles(this.land, sprites.get(c.ground.spriteId)!, c.canvas.height, c.ground.scrollPerTick);
    for (const pipe of this.model.pipes) {
      const [upperBody, upperHead, lowerBody, lowerHead] = this.pipeImages[pipe.id];
      const top = pipe.gapCenterY - c.pipes.gapHeight / 2;
      const bottom = pipe.gapCenterY + c.pipes.gapHeight / 2;
      upperBody.setPosition(pipe.x, (top - c.pipes.headHeight) / 2)
        .setDisplaySize(c.pipes.width, top - c.pipes.headHeight);
      upperHead.setPosition(pipe.x, top - c.pipes.headHeight / 2);
      lowerHead.setPosition(pipe.x, bottom + c.pipes.headHeight / 2);
      lowerBody.setPosition(pipe.x, (bottom + c.pipes.headHeight + c.ground.topY) / 2)
        .setDisplaySize(c.pipes.width, c.ground.topY - bottom - c.pipes.headHeight);
    }
    const animation = metadata.animations['bird.flap'];
    // ready 从 tick 0 开始，首次飞行从 1 开始；两者的首帧都持续三个 tick。
    const frame = this.model.state === 'ready' ? this.model.tick : Math.max(0, this.model.flightTicks - 1);
    this.bird.setTexture(animation.frames[Math.floor(frame / animation.ticksPerFrame) % animation.frames.length]);
    this.bird.setDisplaySize(c.bird.displayWidth, c.bird.displayHeight).setPosition(c.bird.x, this.model.y);
    const tilt = c.render.birdTilt;
    const angle = this.model.state === 'ready' ? tilt.readyDegrees
      : Math.max(tilt.minDegrees, Math.min(tilt.maxDegrees, this.model.velocityY * tilt.velocityMultiplier));
    this.bird.setAngle(angle);
    this.drawUI();
  }

  private drawUI() {
    const m = this.model;
    const key = `${m.state}:${m.score}:${m.bestScore}:${m.canRestart}:${this.clock.paused}:${this.store.status}:${replayMode && m.tick}`;
    if (key === this.lastUI) return;
    this.lastUI = key;
    ui.score.textContent = String(m.score);
    ui.best.textContent = String(m.bestScore);
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
        accumulatedTicks: this.clock.accumulatedTicks, objectCount: this.children.length,
        render: { birdFrame: this.bird.texture.key, birdY: this.bird.y,
          roundPixels: this.game.config.roundPixels, cameraRoundPixels: this.cameras.main.roundPixels,
          birdScaleMode: this.bird.texture.source[0].scaleMode } }),
      frame: (milliseconds: number) => {
        const ticks = this.clock.frame(milliseconds, () => { const flap = this.pendingFlap; this.pendingFlap = false; this.step(flap); });
        this.renderModel(); return ticks;
      },
      advance: (ticks: number, flaps: number[] = []) => {
        const inputs = new Set(flaps);
        for (let i = 0; i < ticks; i++) this.step(inputs.has(this.model.tick + 1));
        this.renderModel();
      },
      reset: (options: GameOptions = {}) => {
        this.model = new Game(config, { ...options, initial: { bestScore: this.store.read(), ...options.initial } });
        this.clock.resume(); this.pendingFlap = false; this.lastTime = null; this.renderModel();
      },
    };
  }
}

declare global {
  interface Window {
    flappyxTest?: {
      snapshot: () => ReturnType<Game['snapshot']> & { paused: boolean; accumulatedTicks: number; objectCount: number;
        render: { birdFrame: string; birdY: number; roundPixels: boolean; cameraRoundPixels: boolean; birdScaleMode: number } };
      frame: (milliseconds: number) => number;
      advance: (ticks: number, flaps?: number[]) => void;
      reset: (options?: GameOptions) => void;
    };
  }
}
