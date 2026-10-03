# 本项目使用的 Babylon.js API

本目录使用 **Babylon.js 9.29.0**，依赖为 `@babylonjs/core`，版本见 [package.json](./package.json)。本文按当前源码整理直接使用的类、方法、属性和配置项。

Babylon.js 负责创建引擎、场景和正交相机，以及加载贴图、显示游戏对象。玩法由 [共享内核](../shared/core-ts/index.ts) 中的 `Game`、`FixedClock` 实现，界面文字和按钮使用 HTML DOM。Babylon.js 的调用集中在 [src/renderer.ts](./src/renderer.ts) 的 `FlightRenderer` 中。

## 1. 创建引擎与场景

位置：[src/renderer.ts](./src/renderer.ts) 的构造函数和 `FlightRenderer.create()`。

| API / 配置项 | 本项目的用法 |
| --- | --- |
| `new Engine(canvas, antialias, options)` | 在项目创建的 canvas 上初始化 WebGL 引擎。第二个参数传 `false`，关闭抗锯齿。 |
| `alpha: false` | 让画布背景不透明；游戏图片自身仍可使用透明材质。 |
| `premultipliedAlpha: false` | 将 WebGL 上下文的预乘 Alpha 选项设为 `false`。 |
| `preserveDrawingBuffer: true` | 保留绘图缓冲内容。 |
| `engine.enableOfflineSupport = false` | 关闭 Babylon.js 的离线缓存支持。 |
| `engine.setSize(width, height, true)` | 强制将 canvas 的绘图尺寸设为共享配置的尺寸，当前为 `1024 × 768`。 |
| `new Scene(engine)` | 创建场景，关联当前引擎。 |
| `Color4.FromHexString(hex)` | 将颜色字符串转换为带 Alpha 的颜色对象；项目在背景色后追加 `ff`，表示完全不透明。 |
| `scene.clearColor` | 设置场景清屏颜色。 |
| `scene.imageProcessingConfiguration.isEnabled = false` | 关闭场景的图像处理配置。 |
| `scene.whenReadyAsync()` | 在贴图加载和材质分配完成后，等待场景就绪，再返回渲染器。 |

canvas 通过浏览器的 `document.createElement('canvas')` 创建，并用 DOM `append()` 挂载到 `#game` 容器。其 CSS 宽高设为 `100%`；这些操作不属于 Babylon.js API。

## 2. 正交相机与坐标

位置：[src/renderer.ts](./src/renderer.ts) 的构造函数和 `place()`。

| API / 属性 | 本项目的用法 |
| --- | --- |
| `new Vector3(x, y, z)` | 创建相机位置和观察目标所需的三维向量。 |
| `new FreeCamera(name, position, scene)` | 创建名为 `FlightCamera` 的相机，位置是 `(512, 384, -10)`。 |
| `camera.setTarget(new Vector3(512, 384, 0))` | 让相机朝向游戏画面的中心。 |
| `camera.mode = Camera.ORTHOGRAPHIC_CAMERA` | 将相机切换为正交投影。 |
| `camera.orthoLeft`、`camera.orthoRight` | 设置正交投影的左右边界，当前为 `-512`、`512`。 |
| `camera.orthoTop`、`camera.orthoBottom` | 设置正交投影的上下边界，当前为 `384`、`-384`。 |
| `camera.minZ`、`camera.maxZ` | 设置近、远裁剪距离，当前为 `0.1`、`100`。 |

这些正交边界配合相机中心，覆盖逻辑范围 `1024 × 768`。共享玩法模型以左上角为原点、Y 轴向下；当前场景的 Y 轴向上，因此 `place()` 做一次换算：

```ts
image.position.set(displayX, config.canvas.height - displayY, 0);
```

`displayX`、`displayY` 是否取整由项目自己的 `config.render.roundPixels` 控制。相机保持固定，代码没有调用 `attachControl()` 来绑定相机移动操作。

## 3. 贴图加载与设置

位置：[src/renderer.ts](./src/renderer.ts) 的 `load()`。

项目用 `new Texture()` 加载每张 PNG，再将加载成功、失败回调包装成 Promise。构造参数按以下顺序传入：

| 参数 | 当前值 / 用途 |
| --- | --- |
| `url` | Vite 提供的 PNG 资源 URL。 |
| `sceneOrEngine` | 传入 `this.scene`，将贴图关联到场景。 |
| `noMipmap` | `true`，不生成 mipmap。 |
| `invertY` | `true`，加载时翻转贴图的 Y 方向。 |
| `samplingMode` | `Texture.NEAREST_SAMPLINGMODE`，使用最近邻采样。 |
| `onLoad` | 完成当前贴图的 Promise。 |
| `onError` | 拒绝当前 Promise，并包含失败文件名和错误信息。 |

加载完成后设置以下属性：

| API / 属性 | 本项目的用法 |
| --- | --- |
| `texture.name = id` | 用素材 ID 命名贴图，供快照识别小鸟当前帧。 |
| `texture.hasAlpha = true` | 标记贴图包含 Alpha 通道。 |
| `texture.gammaSpace = false` | 将贴图的 gamma 空间标记设为 `false`，快照中也会记录该值。 |
| `texture.wrapU = Texture.CLAMP_ADDRESSMODE` | 将 U 方向的寻址方式设为边缘钳制。 |
| `texture.wrapV = Texture.CLAMP_ADDRESSMODE` | 将 V 方向的寻址方式设为边缘钳制。 |

素材 ID、文件名、尺寸和动画帧来自 [sprites.json](../shared/assets/runtime/sprites.json)。`import.meta.glob()` 属于 Vite API，`Promise.all()` 属于 JavaScript API。

## 4. 材质与透明叠放

位置：[src/renderer.ts](./src/renderer.ts) 的 `load()` 和构造函数。

| API / 属性 | 本项目的用法 |
| --- | --- |
| `new StandardMaterial(id, scene)` | 为每张贴图创建一个材质，并用素材 ID 命名。 |
| `material.diffuseTexture = texture` | 将 PNG 设置为材质的漫反射贴图。 |
| `material.useAlphaFromDiffuseTexture = true` | 使用这张贴图的 Alpha 通道。 |
| `material.disableLighting = true` | 让材质不受场景灯光影响。 |
| `Color3.White()` | 创建白色 RGB 颜色，用于材质的自发光颜色。 |
| `material.emissiveColor` | 设为白色，与关闭灯光的设置一起显示图片。 |
| `material.transparencyMode = Material.MATERIAL_ALPHABLEND` | 使用 Alpha 混合模式。 |
| `material.disableDepthWrite = true` | 关闭材质对深度缓冲的写入。 |
| `material.depthFunction = Engine.ALWAYS` | 将深度比较设为始终通过，让显式绘制顺序决定叠放。 |
| `material.backFaceCulling = false` | 关闭背面剔除。 |
| `scene.setRenderingOrder(groupId, opaqueSort, alphaTestSort, transparentSort)` | 为渲染组 `0` 设置透明对象的排序函数。 |
| `subMesh.getMesh()` | 在透明排序回调中取得所属网格，比较其 `alphaIndex`。 |

当前排序回调：

```ts
this.scene.setRenderingOrder(
  0,
  undefined,
  undefined,
  (a, b) => a.getMesh().alphaIndex - b.getMesh().alphaIndex,
);
```

所有游戏图片都使用 Alpha 混合材质，并按背景、水管、地面、小鸟的顺序分配 `alphaIndex`。

## 5. 网格创建与画面更新

位置：[src/renderer.ts](./src/renderer.ts) 的 `image()`、`tiles()`、`place()` 和 `draw()`。

| API / 属性 | 本项目的用法 |
| --- | --- |
| `Mesh` | 游戏图片对象的类型；天空、地面、水管和小鸟均使用平面网格。 |
| `CreatePlane(id, { size: 1 }, scene)` | 创建第一个单位平面，并加入场景。 |
| `mesh.clone(id, null, true)` | 克隆第一个平面创建后续图片，共享其几何。`null` 表示不指定父节点，`true` 表示不克隆子节点。 |
| `scene.meshes` | 获取场景网格列表，用于选择克隆源、分配顺序和匹配材质。 |
| `mesh.name` | 读取素材 ID；贴图加载完成后，给同名网格分配对应材质。 |
| `mesh.material` | 创建网格时先设为 `null`，加载完成后赋予材质；小鸟动画也通过该属性切换材质。 |
| `mesh.alphaIndex` | 按创建顺序编号，供透明排序回调使用。 |
| `mesh.isPickable = false` | 将网格设为不可拾取；输入统一在 canvas 上处理。 |
| `mesh.alwaysSelectAsActiveMesh = true` | 始终将网格选为活动网格，跳过视锥剔除判断。 |
| `mesh.position.set(x, y, z)` | 同步图片位置，设置的是对象的 `Vector3` 位置属性。 |
| `mesh.scaling.set(width, height, 1)` | 将单位平面缩放到所需显示宽高。 |
| `mesh.rotation.z` | 设置绕 Z 轴的旋转，单位是弧度。 |

这些 API 在画面中的组合方式：

- **天空、地面滚动**：创建多张平面网格平铺，根据逻辑 tick 计算偏移，再通过 `position.set()` 更新位置。
- **水管**：每组包含上管身、上管头、下管身、下管头四个网格。`position.set()` 确定位置，`scaling.set()` 将管身拉伸到需要的高度。
- **小鸟动画**：根据帧列表和每帧 tick 数选出材质，赋给 `bird.material`。
- **小鸟飞行**：`position.set()` 同步模型高度，`rotation.z = -angle * Math.PI / 180` 将模型中的角度转换为当前坐标系下的弧度。

网格在构造函数中创建。重新开始时复用这些网格，通过模型的新状态更新画面。

## 6. 手动绘制与资源释放

位置：[src/renderer.ts](./src/renderer.ts) 的 `draw()`、`dispose()`，以及 [src/game.ts](./src/game.ts) 的主循环。

| API | 本项目的用法 |
| --- | --- |
| `engine.beginFrame()` | 开始一帧的引擎处理。 |
| `scene.render()` | 使用场景的活动相机绘制画面。 |
| `engine.endFrame()` | 结束本帧的引擎处理。 |
| `scene.dispose()` | 销毁场景并释放其网格、材质、贴图等资源。 |
| `engine.dispose()` | 销毁引擎并释放相关资源。 |

项目用浏览器 `requestAnimationFrame()` 驱动主循环，没有调用 Babylon.js 的 `engine.runRenderLoop()`。每次 `draw()` 更新对象后，按顺序调用 `beginFrame()`、`scene.render()`、`endFrame()`。

[src/main.ts](./src/main.ts) 在 Vite 热更新销毁模块时调用 `game.dispose()`。`FlightGame` 先取消动画帧、解除浏览器事件监听、移除项目暴露的全局接口，再释放场景和引擎，最后通过 DOM 的 `canvas.remove()` 移除画布。贴图加载或场景就绪过程失败时，`FlightRenderer.create()` 也会调用清理方法。

## 7. 快照与验收属性

位置：[src/renderer.ts](./src/renderer.ts) 的 `snapshot()`。

| 属性 | 验收用途 |
| --- | --- |
| `bird.material.diffuseTexture.name` | 识别小鸟当前动画帧；代码先将材质和贴图转换为对应类型。 |
| `mesh.position.x`、`mesh.position.y` | 检查小鸟和水管的显示坐标，以及 Y 轴换算。 |
| `mesh.scaling.x`、`mesh.scaling.y` | 检查小鸟尺寸和水管各部分的宽高。 |
| `bird.rotation.z` | 换算回角度，记录小鸟倾角。 |
| `camera.mode` | 检查正交相机模式。 |
| `camera.orthoLeft`、`orthoRight`、`orthoTop`、`orthoBottom` | 检查相机范围。 |
| `texture.samplingMode` | 检查最近邻采样设置。 |
| `texture.noMipmap`、`invertY`、`gammaSpace` | 检查贴图配置。 |
| `scene.meshes.length` | 记录场景对象数量。 |
| `scene.geometries.length`、`scene.textures.length`、`scene.materials.length` | 记录场景资源数量；快照字段名为 `memory`，但数值是数量，不是显存字节数。 |

[src/game.ts](./src/game.ts) 通过 `window.flappyx.snapshot()` 暴露只读状态，开发和生产模式均可使用。可修改状态的 `window.flappyxTest` 仅在开发模式 `/?test=1` 下提供。这两个全局对象是项目自定义接口。

[scripts/browser-check.ts](./scripts/browser-check.ts) 使用快照检查动画、坐标、贴图设置、水管接缝和重开后的资源数量；[scripts/production-check.ts](./scripts/production-check.ts) 与 [scripts/persistence-check.ts](./scripts/persistence-check.ts) 使用只读接口检查生产行为和存档。

## 8. Babylon.js 与项目代码的职责

| 功能 | 当前实现 |
| --- | --- |
| 游戏主循环 | [FlightGame.update()](./src/game.ts) 使用浏览器 `requestAnimationFrame()` 驱动，再手动绘制场景。 |
| 重力、拍翅速度、碰撞、计分、水管回收和游戏状态 | [共享 `Game` 模型](../shared/core-ts/game.ts)，没有使用 Babylon.js 的物理引擎。 |
| 固定步长、暂停、恢复 | [共享 `FixedClock`](../shared/core-ts/clock.ts)。 |
| 小鸟动画 | 根据逻辑 tick 切换已有材质，没有使用 Babylon.js 的 `Animation` 或 `SpriteManager`。 |
| 鼠标、触摸、空格键、按钮和窗口失焦 | 浏览器 DOM 事件。 |
| 分数、提示和菜单 | [共享 HTML UI](../shared/web-ts/ui.ts)，没有使用 Babylon.js GUI。 |
| 最高分存储 | [共享 `BestScoreStore`](../shared/web-ts/storage.ts) 与浏览器 `localStorage`。 |

维护本文时，以 [src/renderer.ts](./src/renderer.ts) 的直接调用为准；增加或移除 Babylon.js API 时同步更新对应条目。
