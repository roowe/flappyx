# 本项目使用的 Three.js API

本目录使用 **Three.js 0.186.0**，版本见 [package.json](./package.json)。本文按当前源码整理直接使用的类、方法、属性和配置项。

Three.js 负责加载贴图、创建场景与正交相机、显示游戏对象。玩法由 [共享内核](../shared/core-ts/index.ts) 中的 `Game`、`FixedClock` 实现，界面文字和按钮使用 HTML DOM。Three.js 的调用集中在 [src/renderer.ts](./src/renderer.ts) 的 `FlightRenderer` 中。

## 1. 创建渲染器与画布

位置：[src/renderer.ts](./src/renderer.ts) 的构造函数和 `draw()`。

| API / 配置项 | 本项目的用法 |
| --- | --- |
| `new WebGLRenderer(options)` | 创建 WebGL2 渲染器；初始化失败时显示对应的错误提示。 |
| `antialias: false` | 关闭创建渲染上下文时的抗锯齿选项。 |
| `alpha: false` | 让画布背景不透明；游戏图片自身仍可使用透明材质。 |
| `renderer.setPixelRatio(1)` | 将渲染像素比固定为 1。 |
| `renderer.setSize(width, height, false)` | 按共享配置设置画布尺寸，当前为 `1024 × 768`；第三个参数为 `false`，不由此方法设置 CSS 尺寸。 |
| `renderer.domElement` | 获取 canvas，挂载到 `#game` 容器，并作为输入事件的目标。项目另外用 CSS 将其宽高设为 `100%`。 |
| `renderer.outputColorSpace = SRGBColorSpace` | 将输出颜色空间设为 sRGB。 |
| `renderer.toneMapping = NoToneMapping` | 关闭色调映射。 |
| `renderer.initTexture(texture)` | 在创建游戏对象前，初始化所有已加载贴图的 GPU 资源。 |
| `renderer.render(scene, camera)` | 使用当前相机绘制场景；每次 `FlightRenderer.draw()` 最后调用。 |

通用接口说明见 [WebGLRenderer 官方文档](https://threejs.org/docs/pages/WebGLRenderer.html)。

## 2. 场景、相机与坐标

位置：[src/renderer.ts](./src/renderer.ts) 的字段初始化、构造函数、`image()` 和 `place()`。

| API / 属性 | 本项目的用法 |
| --- | --- |
| `new Scene()` | 创建场景，保存天空、水管、地面和小鸟的网格对象。 |
| `new Color(config.render.clearColor)` | 将共享配置中的颜色字符串转换为 Three.js 颜色对象。 |
| `scene.background` | 设置场景背景色。 |
| `new OrthographicCamera(left, right, top, bottom, near, far)` | 创建正交相机。当前参数为 `(0, 1024, 768, 0, 0.1, 100)`，让游戏画面使用固定的逻辑尺寸。 |
| `camera.position.z = 10` | 将相机放在 Z 轴的 10 处，观察位于 `z = 0` 的游戏图片。 |
| `scene.add(mesh)` | 将新创建的图片网格加入场景。 |
| `scene.children.length` | 读取场景对象数量，同时作为新对象的绘制顺序编号。 |

共享玩法模型以左上角为原点，Y 轴向下；当前 Three.js 场景的 Y 轴向上。`place()` 用下面的换算同步坐标：

```ts
image.position.set(displayX, config.canvas.height - displayY, 0);
```

`displayX`、`displayY` 是否取整由项目自己的 `config.render.roundPixels` 控制。该配置和 `Math.round()` 都不是 Three.js API。

## 3. 贴图加载与设置

位置：[src/renderer.ts](./src/renderer.ts) 的 `FlightRenderer.create()`。

| API / 属性 | 本项目的用法 |
| --- | --- |
| `new TextureLoader()` | 创建 PNG 贴图加载器。 |
| `loader.loadAsync(url)` | 异步加载一张贴图，项目用 `Promise.all()` 等待所有素材完成。 |
| `texture.name = sprite.id` | 用素材 ID 命名贴图，供验收快照识别小鸟当前帧。 |
| `texture.colorSpace = SRGBColorSpace` | 将图片颜色数据标记为 sRGB。 |
| `texture.magFilter = NearestFilter` | 图片放大时使用最近邻采样。 |
| `texture.minFilter = NearestFilter` | 图片缩小时使用最近邻采样。 |
| `texture.generateMipmaps = false` | 关闭自动生成 mipmap。 |
| `texture.premultiplyAlpha = false` | 保持素材的非预乘 Alpha 设置。 |

素材 ID、文件名和尺寸来自 [sprites.json](../shared/assets/runtime/sprites.json)。PNG URL 由 Vite 的 `import.meta.glob()` 提供；加载失败后的中文错误信息由项目代码生成。

贴图属性的通用说明见 [Texture 官方文档](https://threejs.org/docs/pages/Texture.html)。

## 4. 材质、网格与变换

位置：[src/renderer.ts](./src/renderer.ts) 的 `create()`、`image()`、`place()` 和 `draw()`。

| API / 配置项 | 本项目的用法 |
| --- | --- |
| `new PlaneGeometry(1, 1)` | 创建一个单位平面，所有图片网格共用这份几何。 |
| `new MeshBasicMaterial(options)` | 为每张贴图创建不依赖场景灯光的基础材质。 |
| `map: texture` / `material.map` | 将加载的 PNG 作为材质的颜色贴图；快照和资源清理时也会读取该属性。 |
| `transparent: true` | 按图片的 Alpha 通道显示透明区域。 |
| `depthTest: false` | 关闭材质的深度测试。 |
| `depthWrite: false` | 关闭材质对深度缓冲的写入。 |
| `toneMapped: false` | 让材质不参与色调映射。 |
| `new Mesh(geometry, material)` | 用平面和材质创建图片对象。代码以 `Mesh<PlaneGeometry, MeshBasicMaterial>` 作为 `Image` 类型别名。 |
| `mesh.name = id` | 用素材 ID 命名网格。 |
| `mesh.renderOrder` | 显式指定背景、水管、地面、小鸟的绘制顺序。 |
| `mesh.position.set(x, y, z)` | 更新图片位置，设置的是对象的 `Vector3` 位置属性。 |
| `mesh.scale.set(width, height, 1)` | 将单位平面缩放到需要的显示宽高。 |
| `mesh.material = material` | 小鸟换帧时切换到预先创建的材质。 |
| `mesh.rotation.z` | 设置绕 Z 轴的旋转，单位是弧度。 |

创建图片时的实际调用：

```ts
const mesh = new Mesh(this.geometry, this.materials.get(id)!);
mesh.name = id;
mesh.renderOrder = this.scene.children.length;
this.scene.add(mesh);
```

这些 API 在画面中的组合方式：

- **天空、地面滚动**：创建多张平面网格平铺，按逻辑 tick 计算偏移，再用 `position.set()` 更新位置。
- **水管**：每组使用上管身、上管头、下管身、下管头四个网格。`position.set()` 确定位置，`scale.set()` 将管身拉伸到开口上下两侧所需的高度。
- **小鸟动画**：根据素材帧列表和每帧 tick 数选取材质，赋给 `bird.material`。
- **小鸟飞行**：`position.set()` 同步模型高度，`rotation.z` 同步倾角。代码使用 `-angle * Math.PI / 180`，将模型中的角度转换为当前坐标系下的弧度。

## 5. 验收中读取的属性

位置：[src/renderer.ts](./src/renderer.ts) 的 `snapshot()`，由 [src/game.ts](./src/game.ts) 的开发模式测试接口调用。

| 属性 | 验收用途 |
| --- | --- |
| `bird.material.map.name` | 识别小鸟当前使用的动画帧。 |
| `bird.position.x`、`bird.position.y` | 检查显示坐标及模型坐标与场景坐标的换算。 |
| `bird.rotation.z` | 换算回角度，检查小鸟倾斜方向。 |
| `camera.type` | 检查相机类型。 |
| `camera.left`、`right`、`top`、`bottom` | 检查正交相机的逻辑范围。 |
| `texture.minFilter`、`magFilter` | 检查最近邻采样设置。 |
| `texture.generateMipmaps`、`colorSpace`、`premultiplyAlpha` | 检查贴图配置。 |
| `texture.flipY` | 记录贴图的纵向翻转设置。项目没有主动修改此属性，沿用默认值。 |
| `scene.children.length` | 检查重新开始前后的场景对象数量。 |
| `renderer.info.memory` | 记录 `geometries`、`textures` 资源数量；这些是计数，不是显存字节数。 |
| `renderer.info.render.calls` | 记录最近一次渲染的绘制调用次数。 |

[scripts/browser-check.ts](./scripts/browser-check.ts) 使用这些快照检查贴图设置、坐标换算，以及连续重新开始后对象数量和资源数量是否保持一致。

## 6. 资源释放

位置：[src/renderer.ts](./src/renderer.ts) 的 `dispose()`。

| API | 本项目的用法 |
| --- | --- |
| `material.map.dispose()` | 逐一释放游戏贴图的 GPU 资源。 |
| `material.dispose()` | 逐一释放已创建的材质资源。 |
| `geometry.dispose()` | 释放所有网格共用的平面几何资源。 |
| `renderer.dispose()` | 释放渲染器持有的相关资源。 |

[src/main.ts](./src/main.ts) 在 Vite 热更新销毁模块时调用 `game.dispose()`。`FlightGame` 先取消浏览器动画帧并解除事件监听，再调用 `FlightRenderer.dispose()`；最后通过 DOM 的 `replaceChildren()` 移除画布。

## 7. Three.js 与项目代码的职责

| 功能 | 当前实现 |
| --- | --- |
| 游戏主循环 | [FlightGame.update()](./src/game.ts) 使用浏览器 `requestAnimationFrame()` 驱动，再调用 `renderer.render()`。没有使用 Three.js 的 `setAnimationLoop()`。 |
| 重力、拍翅速度、碰撞、计分、水管回收和游戏状态 | [共享 `Game` 模型](../shared/core-ts/game.ts)。 |
| 固定步长、暂停、恢复 | [共享 `FixedClock`](../shared/core-ts/clock.ts)。 |
| 小鸟动画 | 根据逻辑 tick 切换已有材质，没有使用 `AnimationMixer`。 |
| 鼠标、触摸、空格键和按钮输入 | 浏览器 DOM 事件，没有使用 Three.js 的 `Raycaster` 或控制器。 |
| 分数、提示和菜单 | [共享 HTML UI](../shared/web-ts/ui.ts)。 |
| 最高分存储 | [共享 `BestScoreStore`](../shared/web-ts/storage.ts) 与浏览器 `localStorage`。 |

维护本文时，以 [src/renderer.ts](./src/renderer.ts) 的直接调用为准；增加或移除 Three.js API 时同步更新对应条目。
