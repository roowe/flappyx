import { Layers, Node, Sprite, SpriteFrame, Texture2D, UITransform, resources, dynamicAtlasManager } from 'cc';
import { config, type Game } from './shared/core-ts';
import metadata from './shared/config/sprites';

const sprites = new Map(metadata.sprites.map(sprite => [sprite.id, sprite]));
type Image = { node: Node; transform: UITransform; sprite: Sprite };

export class FlightRenderer {
  readonly root: Node;
  private readonly sky: Image[];
  private readonly land: Image[];
  private readonly pipes: Image[][];
  private readonly bird: Image;
  private birdFrame = 'bird.frame1';

  static async create(parent: Node) {
    dynamicAtlasManager.enabled = false;
    const frames = new Map(await Promise.all(metadata.sprites.map(sprite => new Promise<[string, SpriteFrame]>((resolve, reject) => {
      const path = `images/${sprite.file.replace('.png', '')}/spriteFrame`;
      resources.load(path, SpriteFrame, (error, frame) => {
        if (error) { reject(new Error(`贴图加载失败：${sprite.file}。${error.message}`)); return; }
        frame.texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
        frame.texture.setMipFilter(Texture2D.Filter.NONE);
        frame.packable = false;
        resolve([sprite.id, frame]);
      });
    }))));
    return new FlightRenderer(parent, frames);
  }

  private constructor(parent: Node, private readonly frames: Map<string, SpriteFrame>) {
    this.root = new Node('FlightSprites'); this.root.layer = Layers.Enum.UI_2D; parent.addChild(this.root);
    this.sky = this.tiles(config.sky.spriteId);
    this.pipes = Array.from({ length: config.pipes.activeCount }, () => [
      this.image(config.pipes.upperBodySpriteId), this.image(config.pipes.upperHeadSpriteId),
      this.image(config.pipes.lowerBodySpriteId), this.image(config.pipes.lowerHeadSpriteId),
    ]);
    this.land = this.tiles(config.ground.spriteId);
    this.bird = this.image('bird.frame1');
  }
  private image(id: string): Image {
    const node = new Node(id); node.layer = Layers.Enum.UI_2D; this.root.addChild(node);
    const transform = node.addComponent(UITransform); transform.setAnchorPoint(.5, .5);
    const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = false; sprite.spriteFrame = this.frames.get(id)!;
    return { node, transform, sprite };
  }
  private tiles(id: string) {
    const width = sprites.get(id)!.displaySize.width;
    return Array.from({ length: Math.ceil(config.canvas.width / width) + 1 }, () => this.image(id));
  }
  private place(image: Image, x: number, y: number, width: number, height: number) {
    const px = config.render.roundPixels ? Math.round(x) : x;
    const py = config.render.roundPixels ? Math.round(y) : y;
    image.node.setPosition(px - config.canvas.width / 2, config.canvas.height / 2 - py, 0);
    image.transform.setContentSize(width, height);
  }
  private tile(model: Game, images: Image[], id: string, bottom: number, scroll: number) {
    const { displaySize: { width, height }, pivot } = sprites.get(id)!;
    const left = -(model.flightTicks * scroll % width);
    for (const [i, image] of images.entries()) this.place(image, left + (i + pivot.x) * width,
      bottom - height! + height! * pivot.y, width, height!);
  }
  draw(model: Game) {
    const c = config;
    this.tile(model, this.sky, c.sky.spriteId, c.ground.topY, c.sky.scrollPerTick);
    this.tile(model, this.land, c.ground.spriteId, c.canvas.height, c.ground.scrollPerTick);
    for (const pipe of model.pipes) {
      const [upperBody, upperHead, lowerBody, lowerHead] = this.pipes[pipe.id];
      const top = pipe.gapCenterY - c.pipes.gapHeight / 2, bottom = pipe.gapCenterY + c.pipes.gapHeight / 2;
      this.place(upperBody, pipe.x, (top - c.pipes.headHeight) / 2, c.pipes.width, top - c.pipes.headHeight);
      this.place(upperHead, pipe.x, top - c.pipes.headHeight / 2, c.pipes.width, c.pipes.headHeight);
      this.place(lowerHead, pipe.x, bottom + c.pipes.headHeight / 2, c.pipes.width, c.pipes.headHeight);
      this.place(lowerBody, pipe.x, (bottom + c.pipes.headHeight + c.ground.topY) / 2,
        c.pipes.width, c.ground.topY - bottom - c.pipes.headHeight);
    }
    const animation = metadata.animations['bird.flap'];
    const phase = model.state === 'ready' ? model.tick : Math.max(0, model.flightTicks - 1);
    this.birdFrame = animation.frames[Math.floor(phase / animation.ticksPerFrame) % animation.frames.length];
    this.bird.sprite.spriteFrame = this.frames.get(this.birdFrame)!;
    this.place(this.bird, c.bird.x, model.y, c.bird.displayWidth, c.bird.displayHeight);
    const tilt = c.render.birdTilt;
    this.bird.node.angle = -(model.state === 'ready' ? tilt.readyDegrees
      : Math.max(tilt.minDegrees, Math.min(tilt.maxDegrees, model.velocityY * tilt.velocityMultiplier)));
  }
  snapshot() {
    const texture = this.bird.sprite.spriteFrame!.texture;
    const sampler = texture.getSamplerInfo();
    return { birdFrame: this.birdFrame, birdX: this.bird.node.position.x + config.canvas.width / 2,
      birdY: config.canvas.height / 2 - this.bird.node.position.y, birdLocalY: this.bird.node.position.y,
      birdAngleDegrees: -this.bird.node.angle, roundPixels: config.render.roundPixels,
      objectCount: this.root.children.length, texture: { minFilter: sampler.minFilter,
        magFilter: sampler.magFilter, mipFilter: sampler.mipFilter },
      birdSize: { width: this.bird.transform.width, height: this.bird.transform.height },
      pipes: this.pipes.map(group => group.map(image => ({ x: image.node.position.x + config.canvas.width / 2,
        y: config.canvas.height / 2 - image.node.position.y, width: image.transform.width, height: image.transform.height }))) };
  }
}
