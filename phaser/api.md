# 本项目使用的 Phaser API

本目录使用 **Phaser 4.2.1**，版本见 [package.json](./package.json)。本文按当前源码整理直接使用的 Phaser 类、方法、事件和配置项；仅用于验收的接口单独列出。

Phaser 负责创建画布、加载图片、驱动场景更新和显示游戏对象。玩法由 [共享内核](../shared/core-ts/index.ts) 中的 `Game`、`FixedClock` 实现，界面文字和按钮使用 HTML DOM。

## 1. 创建游戏与渲染配置

位置：[src/main.ts](./src/main.ts)。

| API / 配置项 | 本项目的用法 |
| --- | --- |
| `new Phaser.Game(config)` | 创建游戏实例，并注册 `FlightScene` 场景。这里的 `Phaser.Game` 是引擎实例，与共享内核中的玩法模型 `Game` 不同。 |
| `Phaser.AUTO` | 作为 `type`，让 Phaser 自动选择渲染器。 |
| `parent: 'game'` | 将画布挂载到页面的 `#game` 容器。 |
| `width`、`height` | 从共享配置读取逻辑画布尺寸，当前为 `1024 × 768`。 |
| `backgroundColor` | 从 `config.render.clearColor` 读取画布背景色。 |
| `scale.mode: Phaser.Scale.FIT` | 保持宽高比，让画布适配容器。 |
| `scale.autoCenter: Phaser.Scale.CENTER_BOTH` | 让画布在容器内水平、垂直居中。 |
| `render.pixelArt: false` | 避免启用像素画预设时，Phaser 同时强制开启坐标取整。 |
| `render.antialias: false` | 使用最近邻纹理采样，保持图片缩放后的像素边缘。 |
| `render.antialiasGL: false` | 关闭创建 WebGL 上下文时的抗锯齿选项。 |
| `render.roundPixels` | 使用共享配置中的值，当前为 `false`，允许以小数坐标绘制图片。 |
| `audio.noAudio: true` | 禁用音频。 |
| `scene: [FlightScene]` | 注册游戏使用的场景类。 |
| `game.destroy(true)` | Vite 热更新销毁旧模块时销毁游戏，并移除画布。`true` 表示移除 DOM 中的 canvas。 |

这里刻意组合了 `pixelArt: false` 与 `antialias: false`：Phaser 4.2.1 的 `pixelArt: true` 会把 `roundPixels` 强制设为 `true`，而项目需要同时保留最近邻采样和小数坐标。

## 2. 场景与生命周期

位置：[src/scene.ts](./src/scene.ts) 中的 `FlightScene`。

| API / 回调 | 本项目的用法 |
| --- | --- |
| `Phaser.Scene` | `FlightScene` 继承的场景基类。 |
| `super('flight')` | 调用场景构造函数，将场景 key 设为 `flight`。 |
| `preload()` | Phaser 调用的资源预加载回调，在这里登记所有游戏 PNG。 |
| `create()` | Phaser 调用的场景创建回调，在这里创建玩法模型、图片对象并绑定输入和清理事件。 |
| `update(time)` | Phaser 的逐帧更新回调。项目计算相邻 `time` 的毫秒差，交给共享 `FixedClock` 推进逻辑，再刷新画面。 |
| `this.scene.stop()` | 图片加载失败时停止当前场景，阻止游戏继续初始化。 |
| `this.events.once(event, cleanup)` | 为场景停止、销毁分别注册一次性清理回调。 |
| `Phaser.Scenes.Events.SHUTDOWN` | 场景关闭事件；触发后清理浏览器输入和按钮监听器。 |
| `Phaser.Scenes.Events.DESTROY` | 场景销毁事件；同样用于触发清理。 |
| `this.events.off(event, cleanup)` | 清理完成后解除两个场景事件的监听，避免另一个事件再次调用同一清理函数。 |

`update(time)` 的 `time` 是 Phaser 主循环提供的时间值，不是玩法 tick。共享时钟按当前配置以每秒 30 tick 推进逻辑；项目没有使用 Phaser 的定时器来驱动物理或计分。

## 3. 图片加载

位置：[src/scene.ts](./src/scene.ts) 的 `preload()`。

| API / 类型 | 本项目的用法 |
| --- | --- |
| `this.load.image(key, url)` | 将共享素材登记为图片纹理。`key` 来自素材元数据中的 `sprite.id`，URL 由 Vite 的 `import.meta.glob()` 提供。 |
| `this.load.on('loaderror', callback)` | 监听加载失败，设置失败标记并显示错误提示；随后在 `create()` 中停止场景。 |
| `Phaser.Loader.File` | 加载失败回调参数的 TypeScript 类型。 |
| `file.key` | 读取失败资源的 key，显示具体是哪张图片加载失败。 |

图片和尺寸、锚点信息来自 [shared/assets/runtime/sprites.json](../shared/assets/runtime/sprites.json)。素材逐张加载；`import.meta.glob()` 属于 Vite API。

## 4. 图片对象与画面更新

位置：[src/scene.ts](./src/scene.ts) 的 `image()`、`tiles()`、`drawTiles()` 和 `renderModel()`。

| API / 类型 | 本项目的用法 |
| --- | --- |
| `Phaser.GameObjects.Image` | 天空、地面、水管和小鸟都使用该类型；代码用 `type Image = Phaser.GameObjects.Image` 简写。 |
| `this.add.image(x, y, textureKey)` | 创建图片并加入场景。项目先在 `(0, 0)` 创建，再按模型状态定位。 |
| `image.setOrigin(x, y)` | 根据素材元数据设置归一化锚点，决定定位和旋转的参考点。 |
| `image.setDisplaySize(width, height)` | 设置显示尺寸，用于统一素材大小、拉伸水管管身，以及在小鸟换图后设置显示大小。 |
| `image.setPosition(x, y)` | 更新天空、地面、水管和小鸟的位置。 |
| `image.setTexture(key)` | 按玩法 tick 切换小鸟贴图，形成拍翅动画。 |
| `image.setAngle(degrees)` | 根据小鸟竖直速度设置倾角；参数单位是度。 |

创建图片时的实际调用链：

```ts
return this.add
  .image(0, 0, id)
  .setOrigin(sprite.pivot.x, sprite.pivot.y)
  .setDisplaySize(sprite.displaySize.width, h);
```

这些 API 在画面中的组合方式：

- **天空、地面滚动**：创建多张 `Image` 平铺，每帧按逻辑 tick 计算偏移，再调用 `setPosition()`。
- **水管**：每组使用上管身、上管头、下管身、下管头四张图片。管身用 `setDisplaySize()` 拉伸到开口上下两侧所需的高度。
- **小鸟动画**：根据元数据中的帧列表和每帧 tick 数选取纹理，通过 `setTexture()` 换图。
- **小鸟飞行**：`setPosition()` 同步模型高度，`setAngle()` 根据速度计算俯仰角。碰撞计算仍由共享模型完成。

图片在 `create()` 中一次性创建，之后复用已有对象；每次更新只改变位置、尺寸、纹理或角度。背景、水管、地面、小鸟按创建顺序叠放，代码没有调用 `setDepth()`。

## 5. 画布与浏览器输入

位置：[src/scene.ts](./src/scene.ts) 的 `create()` 及其清理回调。

项目通过 Phaser 的 `this.game.canvas` 获取画布，然后调用浏览器的 `addEventListener('pointerdown', ...)` 接收鼠标或触摸输入。清理时，对同一画布调用 `removeEventListener()`。

`this.game` 和 `game.canvas` 是 Phaser 提供的对象与属性；`addEventListener()`、`removeEventListener()`、`PointerEvent`、`KeyboardEvent` 都是浏览器 API。空格键、窗口失焦、页面可见性和按钮点击也通过浏览器事件处理。

## 6. 仅用于验收的 Phaser 接口

开发模式的 `/?test=1` 通过 `exposeTestControls()` 暴露状态快照。下面的 Phaser 属性用于检查渲染和对象复用，见 [src/scene.ts](./src/scene.ts) 和 [scripts/browser-check.ts](./scripts/browser-check.ts)。

| 属性 | 验收用途 |
| --- | --- |
| `this.children.length` | 读取场景显示列表中的对象数量，检查重新开始后是否仍复用对象。 |
| `this.bird.texture.key` | 检查小鸟当前显示的纹理帧。 |
| `this.bird.y` | 检查渲染对象的纵坐标。 |
| `this.game.config.roundPixels` | 检查游戏配置是否保留小数坐标。 |
| `this.cameras.main.roundPixels` | 检查主摄像机是否关闭坐标取整。 |
| `this.bird.texture.source[0].scaleMode` | 检查纹理采样模式；验收脚本断言值为 `1`，对应最近邻采样。 |

[scripts/review.test.ts](./scripts/review.test.ts) 还直接调用了两个游戏实例方法：

| API | 验收用途 |
| --- | --- |
| `game.destroy(true)` | 销毁游戏并移除画布，验证浏览器事件监听器得到清理。 |
| `game.step(performance.now(), 0)` | 在请求销毁后手动推进一次引擎帧，使延迟到下一帧的销毁立即执行，避免后台浏览器降频影响验收。正常游戏由 Phaser 自动驱动，无需手动调用。 |

## 7. 玩法功能由谁实现

以下功能容易与 Phaser 内置能力混淆，对应实现如下：

| 功能 | 当前实现 |
| --- | --- |
| 重力、拍翅速度、碰撞、计分、水管回收、游戏状态 | [共享 `Game` 模型](../shared/core-ts/game.ts)，没有使用 Arcade Physics 或 Matter Physics。 |
| 固定步长、暂停、恢复 | [共享 `FixedClock`](../shared/core-ts/clock.ts)，没有调用 `this.scene.pause()` / `resume()`。 |
| 小鸟动画 | 按 tick 计算帧索引，再调用 `Image.setTexture()`，没有使用 `Sprite.play()` 或 `this.anims`。 |
| 背景平铺与滚动 | 多张 `Image` 加位置更新，没有使用 `TileSprite`。 |
| 输入 | 浏览器 DOM 事件，没有使用 `this.input` 或 Phaser 键盘插件。 |
| 分数文字、菜单、暂停和重新开始按钮 | [共享 HTML UI](../shared/web-ts/ui.ts)，没有使用 Phaser `Text` 或游戏对象交互 API。 |
| 最高分存储 | [共享 `BestScoreStore`](../shared/web-ts/storage.ts) 与浏览器 `localStorage`。 |

维护本文时，以 [src/main.ts](./src/main.ts)、[src/scene.ts](./src/scene.ts) 和 [scripts/review.test.ts](./scripts/review.test.ts) 的直接调用为准；增加或移除 Phaser API 时同步更新对应条目。
