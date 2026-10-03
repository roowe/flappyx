import { Color, Mesh, MeshBasicMaterial, NearestFilter, NoToneMapping, OrthographicCamera,
  PlaneGeometry, Scene, SRGBColorSpace, TextureLoader, WebGLRenderer } from 'three';
import { config, type Game } from '../../shared/core-ts';
import metadata from '../../shared/assets/runtime/sprites.json';

type Image = Mesh<PlaneGeometry, MeshBasicMaterial>;
type SpriteMetadata = typeof metadata.sprites[number];
const urls = import.meta.glob<string>('../../shared/assets/runtime/*.png', { eager: true, query: '?url', import: 'default' });
const sprites = new Map(metadata.sprites.map(sprite => [sprite.id, sprite]));

export class FlightRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new OrthographicCamera(0, config.canvas.width, config.canvas.height, 0, .1, 100);
  private readonly geometry = new PlaneGeometry(1, 1);
  private readonly sky: Image[];
  private readonly land: Image[];
  private readonly pipes: Image[][];
  private readonly bird: Image;

  static async create(container: HTMLElement) {
    const loader = new TextureLoader();
    const materials = new Map(await Promise.all(metadata.sprites.map(async sprite => {
      const texture = await loader.loadAsync(urls[`../../shared/assets/runtime/${sprite.file}`]).catch(cause => {
        throw new Error(`贴图加载失败：${sprite.file}。请检查资源地址或刷新页面。`, { cause });
      });
      texture.name = sprite.id;
      texture.colorSpace = SRGBColorSpace;
      texture.magFilter = NearestFilter;
      texture.minFilter = NearestFilter;
      texture.generateMipmaps = false;
      texture.premultiplyAlpha = false;
      return [sprite.id, new MeshBasicMaterial({ map: texture, transparent: true,
        depthTest: false, depthWrite: false, toneMapped: false })] as const;
    })));
    return new FlightRenderer(container, materials);
  }

  private constructor(container: HTMLElement, private readonly materials: Map<string, MeshBasicMaterial>) {
    try { this.renderer = new WebGLRenderer({ antialias: false, alpha: false }); }
    catch (cause) { throw new Error('WebGL2 初始化失败，请检查浏览器支持与图形设置。', { cause }); }
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(config.canvas.width, config.canvas.height, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.scene.background = new Color(config.render.clearColor);
    this.camera.position.z = 10;
    container.append(this.renderer.domElement);
    // 预先上传全部精灵贴图，换帧和重开都只复用现有 GPU 资源。
    for (const material of materials.values()) this.renderer.initTexture(material.map!);
    this.sky = this.tiles(config.sky.spriteId);
    this.pipes = Array.from({ length: config.pipes.activeCount }, () => [
      this.image(config.pipes.upperBodySpriteId), this.image(config.pipes.upperHeadSpriteId),
      this.image(config.pipes.lowerBodySpriteId), this.image(config.pipes.lowerHeadSpriteId),
    ]);
    this.land = this.tiles(config.ground.spriteId);
    this.bird = this.image('bird.frame1');
  }

  get canvas() { return this.renderer.domElement; }

  private image(id: string) {
    const mesh = new Mesh(this.geometry, this.materials.get(id)!);
    mesh.name = id;
    // 全部使用透明材质，显式按背景→水管→地面→鸟绘制，不依赖透明物体距离排序。
    mesh.renderOrder = this.scene.children.length;
    this.scene.add(mesh);
    return mesh;
  }

  private tiles(id: string) {
    const width = sprites.get(id)!.displaySize.width;
    return Array.from({ length: Math.ceil(config.canvas.width / width) + 1 }, () => this.image(id));
  }

  private place(image: Image, x: number, y: number, width: number, height: number) {
    const displayX = config.render.roundPixels ? Math.round(x) : x;
    const displayY = config.render.roundPixels ? Math.round(y) : y;
    image.position.set(displayX, config.canvas.height - displayY, 0);
    image.scale.set(width, height, 1);
  }

  private drawTiles(model: Game, images: Image[], sprite: SpriteMetadata, bottom: number, scroll: number) {
    const { width, height } = sprite.displaySize;
    const left = -(model.flightTicks * scroll % width);
    for (const [i, image] of images.entries()) this.place(image, left + (i + sprite.pivot.x) * width,
      bottom - height! + height! * sprite.pivot.y, width, height!);
  }

  draw(model: Game) {
    const c = config;
    this.drawTiles(model, this.sky, sprites.get(c.sky.spriteId)!, c.ground.topY, c.sky.scrollPerTick);
    this.drawTiles(model, this.land, sprites.get(c.ground.spriteId)!, c.canvas.height, c.ground.scrollPerTick);
    for (const pipe of model.pipes) {
      const [upperBody, upperHead, lowerBody, lowerHead] = this.pipes[pipe.id];
      const top = pipe.gapCenterY - c.pipes.gapHeight / 2;
      const bottom = pipe.gapCenterY + c.pipes.gapHeight / 2;
      this.place(upperBody, pipe.x, (top - c.pipes.headHeight) / 2, c.pipes.width, top - c.pipes.headHeight);
      this.place(upperHead, pipe.x, top - c.pipes.headHeight / 2, c.pipes.width, c.pipes.headHeight);
      this.place(lowerHead, pipe.x, bottom + c.pipes.headHeight / 2, c.pipes.width, c.pipes.headHeight);
      this.place(lowerBody, pipe.x, (bottom + c.pipes.headHeight + c.ground.topY) / 2,
        c.pipes.width, c.ground.topY - bottom - c.pipes.headHeight);
    }
    const animation = metadata.animations['bird.flap'];
    const phase = model.state === 'ready' ? model.tick : Math.max(0, model.flightTicks - 1);
    const id = animation.frames[Math.floor(phase / animation.ticksPerFrame) % animation.frames.length];
    this.bird.material = this.materials.get(id)!;
    this.place(this.bird, c.bird.x, model.y, c.bird.displayWidth, c.bird.displayHeight);
    const tilt = c.render.birdTilt;
    const angle = model.state === 'ready' ? tilt.readyDegrees
      : Math.max(tilt.minDegrees, Math.min(tilt.maxDegrees, model.velocityY * tilt.velocityMultiplier));
    this.bird.rotation.z = -angle * Math.PI / 180;
    this.renderer.render(this.scene, this.camera);
  }

  snapshot() {
    const texture = this.bird.material.map!;
    return { birdFrame: texture.name, birdX: this.bird.position.x, birdY: config.canvas.height - this.bird.position.y,
      roundPixels: config.render.roundPixels,
      birdWorldY: this.bird.position.y, birdAngleDegrees: -this.bird.rotation.z * 180 / Math.PI,
      camera: { type: this.camera.type, left: this.camera.left, right: this.camera.right,
        top: this.camera.top, bottom: this.camera.bottom },
      texture: { minFilter: texture.minFilter, magFilter: texture.magFilter, generateMipmaps: texture.generateMipmaps,
        colorSpace: texture.colorSpace, flipY: texture.flipY, premultiplyAlpha: texture.premultiplyAlpha },
      objectCount: this.scene.children.length, memory: { ...this.renderer.info.memory },
      drawCalls: this.renderer.info.render.calls };
  }

  dispose() {
    for (const material of this.materials.values()) { material.map!.dispose(); material.dispose(); }
    this.geometry.dispose();
    this.renderer.dispose();
    this.canvas.parentElement!.replaceChildren();
  }
}
