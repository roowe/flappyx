import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Material } from '@babylonjs/core/Materials/material';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { config, type Game } from '../../shared/core-ts';
import metadata from '../../shared/assets/runtime/sprites.json';

const urls = import.meta.glob<string>('../../shared/assets/runtime/*.png', { eager: true, query: '?url', import: 'default' });
const sprites = new Map(metadata.sprites.map(sprite => [sprite.id, sprite]));
type SpriteMetadata = typeof metadata.sprites[number];

export class FlightRenderer {
  readonly canvas = document.createElement('canvas');
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: FreeCamera;
  private readonly materials = new Map<string, StandardMaterial>();
  private readonly sky: Mesh[];
  private readonly land: Mesh[];
  private readonly pipes: Mesh[][];
  private readonly bird: Mesh;

  static async create(container: HTMLElement) {
    const view = new FlightRenderer(container);
    try {
      await Promise.all(metadata.sprites.map(sprite => view.load(sprite.id, sprite.file)));
      await view.scene.whenReadyAsync();
      return view;
    } catch (error) { view.dispose(); throw error; }
  }

  private constructor(container: HTMLElement) {
    this.canvas.style.width = '100%'; this.canvas.style.height = '100%';
    container.append(this.canvas);
    try { this.engine = new Engine(this.canvas, false, { alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: true }); }
    catch (cause) { this.canvas.remove(); throw new Error('WebGL 初始化失败，请检查浏览器支持与图形设置。', { cause }); }
    this.engine.enableOfflineSupport = false;
    this.engine.setSize(config.canvas.width, config.canvas.height, true);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = Color4.FromHexString(`${config.render.clearColor}ff`);
    this.scene.imageProcessingConfiguration.isEnabled = false;
    this.camera = new FreeCamera('FlightCamera', new Vector3(512, 384, -10), this.scene);
    this.camera.setTarget(new Vector3(512, 384, 0));
    this.camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    this.camera.orthoLeft = -512; this.camera.orthoRight = 512;
    this.camera.orthoTop = 384; this.camera.orthoBottom = -384;
    this.camera.minZ = .1; this.camera.maxZ = 100;
    // All sprites blend in insertion order; opaque depth and distance sorting must not reorder the layers.
    this.scene.setRenderingOrder(0, undefined, undefined, (a, b) => a.getMesh().alphaIndex - b.getMesh().alphaIndex);
    this.sky = this.tiles(config.sky.spriteId);
    this.pipes = Array.from({ length: config.pipes.activeCount }, () => [
      this.image(config.pipes.upperBodySpriteId), this.image(config.pipes.upperHeadSpriteId),
      this.image(config.pipes.lowerBodySpriteId), this.image(config.pipes.lowerHeadSpriteId),
    ]);
    this.land = this.tiles(config.ground.spriteId);
    this.bird = this.image('bird.frame1');
  }

  private async load(id: string, file: string) {
    const texture = await new Promise<Texture>((resolve, reject) => {
      const loaded = new Texture(urls[`../../shared/assets/runtime/${file}`], this.scene,
        true, true, Texture.NEAREST_SAMPLINGMODE, () => resolve(loaded),
        (message, cause) => reject(new Error(`贴图加载失败：${file}。${message}`, { cause })));
    });
    texture.name = id; texture.hasAlpha = true; texture.gammaSpace = false;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE; texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    const material = new StandardMaterial(id, this.scene);
    material.diffuseTexture = texture; material.useAlphaFromDiffuseTexture = true;
    material.disableLighting = true; material.emissiveColor = Color3.White();
    material.transparencyMode = Material.MATERIAL_ALPHABLEND;
    material.disableDepthWrite = true; material.depthFunction = Engine.ALWAYS;
    material.backFaceCulling = false;
    this.materials.set(id, material);
    for (const mesh of this.scene.meshes) if (mesh.name === id) mesh.material = material;
  }

  private image(id: string) {
    // Clones share the first plane's geometry; restarting only repositions these meshes.
    const mesh = this.scene.meshes.length === 0 ? CreatePlane(id, { size: 1 }, this.scene)
      : (this.scene.meshes[0] as Mesh).clone(id, null, true)!;
    mesh.material = null; mesh.alphaIndex = this.scene.meshes.length - 1;
    mesh.isPickable = false; mesh.alwaysSelectAsActiveMesh = true;
    return mesh;
  }

  private tiles(id: string) {
    const width = sprites.get(id)!.displaySize.width;
    return Array.from({ length: Math.ceil(config.canvas.width / width) + 1 }, () => this.image(id));
  }
  private place(image: Mesh, x: number, y: number, width: number, height: number) {
    const displayX = config.render.roundPixels ? Math.round(x) : x;
    const displayY = config.render.roundPixels ? Math.round(y) : y;
    image.position.set(displayX, config.canvas.height - displayY, 0);
    image.scaling.set(width, height, 1);
  }
  private drawTiles(model: Game, images: Mesh[], sprite: SpriteMetadata, bottom: number, scroll: number) {
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
      const top = pipe.gapCenterY - c.pipes.gapHeight / 2, bottom = pipe.gapCenterY + c.pipes.gapHeight / 2;
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
    this.engine.beginFrame(); this.scene.render(); this.engine.endFrame();
  }
  snapshot() {
    const texture = (this.bird.material as StandardMaterial).diffuseTexture as Texture;
    return { birdFrame: texture.name, birdX: this.bird.position.x, birdY: config.canvas.height - this.bird.position.y,
      roundPixels: config.render.roundPixels, birdWorldY: this.bird.position.y,
      birdAngleDegrees: -this.bird.rotation.z * 180 / Math.PI,
      birdSize: { width: this.bird.scaling.x, height: this.bird.scaling.y },
      camera: { mode: this.camera.mode, left: this.camera.orthoLeft, right: this.camera.orthoRight,
        top: this.camera.orthoTop, bottom: this.camera.orthoBottom },
      texture: { samplingMode: texture.samplingMode, noMipmap: texture.noMipmap, invertY: texture.invertY, gammaSpace: texture.gammaSpace },
      objectCount: this.scene.meshes.length, memory: { geometries: this.scene.geometries.length,
        textures: this.scene.textures.length, materials: this.scene.materials.length },
      pipes: this.pipes.map(group => group.map(mesh => ({ x: mesh.position.x, y: config.canvas.height - mesh.position.y,
        width: mesh.scaling.x, height: mesh.scaling.y }))) };
  }
  dispose() { this.scene.dispose(); this.engine.dispose(); this.canvas.remove(); }
}
