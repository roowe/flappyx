# 本项目使用的 Cocos Creator API

本目录使用 **Cocos Creator 3.8.8**，版本见 [game/package.json](./game/package.json)。本文按当前源码整理直接使用的引擎类、方法、属性、事件和配置项，并说明场景关联与三个脚本的分工。

Cocos 负责场景生命周期、节点、图片、文字和按钮。玩法由 [共享内核](../shared/core-ts/index.ts) 中的 `Game`、`FixedClock` 实现。启动和构建前，[sync-shared.ts](./game/scripts/sync-shared.ts) 将共享源码、配置与素材同步到 Creator 的 `assets` 目录；修改玩法时应修改共享源。

## 1. 脚本分工与场景关联

| 脚本 | 类型与责任 |
| --- | --- |
| [FlappyBird.ts](./game/assets/scripts/FlappyBird.ts) | 继承 `Component`，挂在 Boot 场景的 Canvas 节点上，负责初始化、输入、时钟、暂停、存档和回放。 |
| [FlightRenderer.ts](./game/assets/scripts/FlightRenderer.ts) | 普通 TypeScript 类，由 `FlappyBird` 创建，负责天空、地面、水管和小鸟的节点与画面更新。 |
| [FlightUI.ts](./game/assets/scripts/FlightUI.ts) | 普通 TypeScript 类，由 `FlappyBird` 创建，负责分数、提示、面板与按钮；按钮动作通过回调交给 `FlappyBird`。 |

[Boot.scene](./game/assets/scenes/Boot.scene) 保存 Canvas、Camera 和组件关联。Canvas 上已有 `UITransform`、`Canvas`、`Widget` 和 `FlappyBird` 组件；Camera 子节点上已有 `Camera` 组件。场景通过 [FlappyBird.ts.meta](./game/assets/scripts/FlappyBird.ts.meta) 中的 UUID 关联脚本，序列化文件里的自定义组件 `__type__` 使用该 UUID 的压缩形式。

运行时，`FlappyBird.boot()` 再创建游戏节点：

```text
Boot
└── Canvas（挂载 FlappyBird 组件）
    ├── Camera                         ← 场景文件中已有
    └── LogicalStage + Mask            ← 运行时创建
        ├── FlightSprites             ← FlightRenderer 创建
        │   └── 天空、水管、地面、小鸟
        └── FlightUI                  ← FlightUI 创建
            └── 文字、面板、按钮
```

`FlightRenderer` 和 `FlightUI` 不继承 `Component`，无需挂载为场景组件。编辑器中打开 Boot 场景并选中 Canvas，可以看到 `FlappyBird`；游戏画面节点在运行后才出现。

## 2. 组件与生命周期

位置：[FlappyBird.ts](./game/assets/scripts/FlappyBird.ts)。引擎 API 从 `cc` 导入，调试标记从 `cc/env` 导入。

| API / 回调 | 本项目的用法 |
| --- | --- |
| `_decorator.ccclass('FlappyBird')` | 通过 `@ccclass('FlappyBird')` 注册组件类。 |
| `Component` | `FlappyBird` 继承的组件基类。 |
| `this.node` | 获取组件所在的 Canvas 节点，作为运行时游戏节点的父节点。 |
| `onLoad()` | 引擎加载组件时调用，项目在这里启动异步 `boot()`。 |
| `update()` | 引擎逐帧调用；资源就绪后推进共享时钟，再更新游戏对象和 UI。 |
| `onDestroy()` | 组件销毁时解除浏览器、引擎事件监听，并移除项目暴露的全局诊断接口。 |
| `DEBUG` | 仅在 DEBUG 预览且 URL 包含 `?test=1` 时启用手动测试控制。 |

`boot()`、`draw()`、`queueFlap()` 是项目自己定义的方法。`update()` 使用浏览器 `performance.now()` 计算相邻调用的毫秒差，交给共享 `FixedClock`；当前逻辑频率是每秒 30 tick。

## 3. 视口、节点与坐标

位置：[FlappyBird.ts](./game/assets/scripts/FlappyBird.ts) 的 `boot()`、[FlightRenderer.ts](./game/assets/scripts/FlightRenderer.ts) 的 `image()` / `place()`，以及 [FlightUI.ts](./game/assets/scripts/FlightUI.ts) 的 `stageNode()`。

| API / 属性 | 本项目的用法 |
| --- | --- |
| `view.resizeWithBrowserSize(true)` | 启用浏览器窗口尺寸变化监听。 |
| `view.setDesignResolutionSize(width, height, policy)` | 设置 `1024 × 768` 的设计分辨率。 |
| `ResolutionPolicy.SHOW_ALL` | 等比显示完整逻辑画面，宽高比不一致时留边。 |
| `new Node(name)` | 创建游戏对象、UI 和分组节点。 |
| `node.layer = Layers.Enum.UI_2D` | 将运行时节点设为 2D UI 层。 |
| `parent.addChild(node)` | 将节点加入父节点。 |
| `node.addComponent(Type)` | 给节点添加 `UITransform`、`Sprite`、`Mask`、`Label`、`Graphics` 或 `Button`。 |
| `node.setPosition(x, y, z?)` | 设置节点的本地位置；游戏图片传入 `z = 0`。 |
| `UITransform.setAnchorPoint(0.5, 0.5)` | 将游戏图片锚点设为中心。 |
| `UITransform.setContentSize(width, height)` | 设置图片、文字、按钮和容器的尺寸。 |
| `node.angle` | 设置绕 Z 轴的旋转，单位是度，用于小鸟倾角。 |
| `node.active` | 控制面板和暂停按钮节点是否启用。 |
| `Mask`、`Mask.Type.GRAPHICS_RECT` | 在 LogicalStage 上建立矩形遮罩，限制游戏内容的显示范围。 |

共享模型以左上角为原点，Y 轴向下；当前 Cocos 游戏容器以中心为原点，Y 轴向上。图片定位时转换为：

```ts
image.node.setPosition(
  px - config.canvas.width / 2,
  config.canvas.height / 2 - py,
  0,
);
```

`px`、`py` 是否取整由项目的 `config.render.roundPixels` 控制。UI 使用同样的坐标换算辅助函数 `stageNode()`；该函数属于项目代码。

## 4. 图片加载与精灵设置

位置：[FlightRenderer.ts](./game/assets/scripts/FlightRenderer.ts) 的 `create()` 和 `image()`。

| API / 属性 | 本项目的用法 |
| --- | --- |
| `resources.load(path, SpriteFrame, callback)` | 从 `assets/resources` 加载图片的 SpriteFrame 子资源，例如 `bird-01.png` 使用路径 `images/bird-01/spriteFrame`；文件名取自素材元数据。 |
| `SpriteFrame` | 指定加载的资源类型；项目将回调包装为 Promise，等所有图片加载完成后创建游戏对象。 |
| `frame.texture` | 获取 SpriteFrame 使用的纹理。 |
| `texture.setFilters(minFilter, magFilter)` | 将缩小、放大过滤都设为 `Texture2D.Filter.NEAREST`，使用最近邻采样。 |
| `texture.setMipFilter(Texture2D.Filter.NONE)` | 禁用 mipmap 过滤。 |
| `dynamicAtlasManager.enabled = false` | 关闭运行时动态合图。 |
| `frame.packable = false` | 将这些 SpriteFrame 标记为不参与动态合图。 |
| `Sprite` | 天空、地面、水管和小鸟使用的图片组件。 |
| `sprite.sizeMode = Sprite.SizeMode.CUSTOM` | 采用项目设置的显示尺寸。 |
| `sprite.trim = false` | 按未裁切的图片尺寸显示精灵。 |
| `sprite.spriteFrame` | 初次赋予图片，并在小鸟动画中切换已有帧。 |

素材 ID、文件名、显示尺寸和动画帧来自 [sprites.json](../shared/assets/runtime/sprites.json)。图片在初始化时加载，后续更新复用已有节点和 SpriteFrame。

## 5. 游戏画面的组合方式

位置：[FlightRenderer.ts](./game/assets/scripts/FlightRenderer.ts) 的 `tiles()`、`tile()` 和 `draw()`。

- **天空、地面滚动**：创建多张 Sprite 平铺，按 `model.flightTicks` 计算偏移，再调用 `node.setPosition()`。
- **水管**：每组包含上管身、上管头、下管身、下管头四个 Sprite。`setPosition()` 定位，`UITransform.setContentSize()` 将管身拉伸到开口与边界之间。
- **小鸟动画**：根据帧列表和每帧 tick 数选择 SpriteFrame，赋给 `sprite.spriteFrame`。
- **小鸟飞行**：位置取自模型的 `y`，倾角取自竖直速度，并用 `node.angle = -angle` 适配坐标方向。

按当前配置，游戏画面包含天空 3 个、地面 3 个、水管 28 个、小鸟 1 个，共 35 个 Sprite。创建顺序为天空、水管、地面、小鸟；UI 随后创建在另一组节点中。重新开始时继续复用这些游戏对象。

## 6. 文字、面板与按钮

位置：[FlightUI.ts](./game/assets/scripts/FlightUI.ts) 的 `label()`、`box()`、`button()` 和 `draw()`。

| API / 属性 | 本项目的用法 |
| --- | --- |
| `new Color(r, g, b)` | 创建文字、面板和按钮使用的颜色。 |
| `Label` | 显示分数、最高分、标题、操作提示和存档状态。初始化失败时，`FlappyBird` 也用 Label 显示错误信息。 |
| `label.string` | 设置或更新文字内容。 |
| `label.fontSize`、`label.lineHeight` | 设置字号和行高。 |
| `label.color` | 设置文字颜色。 |
| `Label.HorizontalAlign.CENTER`、`Label.VerticalAlign.CENTER` | 赋给 `horizontalAlign`、`verticalAlign`，让文字水平、垂直居中。 |
| `Graphics` | 绘制面板和按钮的背景。 |
| `graphics.fillColor` | 设置填充颜色。 |
| `graphics.roundRect(x, y, width, height, radius)` | 创建以节点中心为参考的圆角矩形路径。 |
| `graphics.fill()` | 填充已创建的路径。 |
| `Button` | 为开始、继续、重开和暂停入口提供按钮交互。 |
| `button.transition = Button.Transition.NONE` | 将按钮的内置过渡方式设为 NONE。 |
| `button.interactable` | 控制按钮能否操作，例如死亡保护期内禁用重开。 |
| `node.on(Button.EventType.CLICK, action)` | 注册按钮点击回调，调用 `FlappyBird` 传入的动作。 |

`FlightUI.draw()` 读取模型和暂停、回放状态，更新文字、面板显隐与按钮可用性。例如暂停时显示“继续游戏”，结算时根据 `model.canRestart` 显示“稍候…”或“重新开始”。

## 7. 输入、暂停与存档

位置：[FlappyBird.ts](./game/assets/scripts/FlappyBird.ts) 和 [FlightUI.ts](./game/assets/scripts/FlightUI.ts) 的 `button()`。

| API / 事件 | 本项目的用法 |
| --- | --- |
| `node.on(event, callback, target)` | 在 LogicalStage 上注册触摸开始、结束和取消回调，`target` 传入 `FlappyBird` 实例。 |
| `Node.EventType.TOUCH_START` | 排队一次拍翅输入。 |
| `Node.EventType.TOUCH_END`、`TOUCH_CANCEL` | 结束当前触摸，释放记录的触摸 ID。 |
| `EventTouch.getID()` | 识别触摸；当前有一根手指活动时忽略其他触摸开始。 |
| `event.propagationStopped = true` | UI 按钮在触摸开始时阻止事件继续冒泡，避免点击按钮同时触发拍翅。 |
| `game.canvas` | 获取引擎画布，用浏览器事件过滤非主鼠标键并禁止右键菜单。 |
| `game.on(CocosGame.EVENT_HIDE, pause)` | 引擎进入后台时暂停共享时钟。 |
| `game.off(CocosGame.EVENT_HIDE, pause)` | 组件销毁时解除该引擎事件监听。 |
| `sys.localStorage.getItem(key)`、`setItem(key, value)` | 为共享 `BestScoreStore` 提供存储读写，当前键为 `flappyx:cocos:best`。 |

`CocosGame` 是从 `cc` 导入的引擎 `Game` 类的别名；玩法模型 `Game` 来自共享内核。

空格键通过 `window.addEventListener('keydown', ..., true)` 在捕获阶段处理，忽略重复按键和表单输入。鼠标非主键在 canvas 捕获阶段过滤，正常鼠标输入随后通过 Cocos 的触摸事件进入游戏。窗口 `blur` 和页面 `visibilitychange` 也会触发暂停。

`addEventListener()`、`removeEventListener()`、`KeyboardEvent`、`MouseEvent`、`document.hidden`、`URLSearchParams` 和 `location` 都属于浏览器 API。暂停、恢复、输入合并与回放由项目代码实现。

## 8. 快照与验收属性

位置：三个脚本的 `snapshot()`，以及 [FlappyBird.ts](./game/assets/scripts/FlappyBird.ts) 的 `exposeTestControls()`。

| API / 属性 | 验收用途 |
| --- | --- |
| `node.children.length` | 统计 FlightSprites 下的游戏图片节点，检查重开后是否仍复用对象。 |
| `node.position.x`、`position.y`、`node.angle` | 记录小鸟、水管的位置和小鸟倾角，并换算回共享坐标系。 |
| `node.worldPosition.x`、`worldPosition.y` | 读取按钮世界坐标，供浏览器检查脚本换算实际点击位置。 |
| `UITransform.width`、`height` | 检查小鸟和水管各部分的显示尺寸。 |
| `node.getComponent(UITransform).contentSize` | 读取 Canvas 节点尺寸。源码使用非空断言，因为场景已配置该组件。 |
| `texture.getSamplerInfo()` | 读取 `minFilter`、`magFilter`、`mipFilter`，验证纹理采样设置。 |
| `view.getScaleX()`、`view.getScaleY()` | 检查视图缩放比例。 |
| `view.getViewportRect()` | 读取视口的 `x`、`y`、`width`、`height`，检查等比适配与留边。 |
| `Label.string`、`Node.active`、`Button.interactable` | 检查界面文案、面板显示状态与按钮可用性。 |

项目自定义的 `window.flappyx.snapshot()` 在预览和发布页提供只读快照。`window.flappyxTest` 仅在 DEBUG 预览加 `?test=1` 时提供，包含手动推进帧、推进 tick 和重置模型的接口。这些名称不属于 Cocos API。

[browser-check.ts](./game/scripts/browser-check.ts)、[production-check.ts](./game/scripts/production-check.ts) 和 [persistence-check.ts](./game/scripts/persistence-check.ts) 使用这些接口验证输入、回放、缩放、对象复用和存档。

## 9. Web 启动与编辑器验收

Web 发布模板见 [index.js.ejs](./game/build-templates/web-desktop/index.js.ejs)。

| API | 本项目的用法 |
| --- | --- |
| `engine.game.onPostBaseInitDelegate.add(callback)` | 在引擎基础初始化后执行项目的屏幕设置。 |
| `engine.settings.overrideSettings('screen', 'exactFitScreen', true)` | 让发布页按浏览器窗口尺寸适配。 |

模板通过 `System.import('cc')` 加载引擎模块，再调用生成的 `Application.init(engine)` 和 `Application.start()`。`System.import()` 属于模块加载器，`Application` 来自 Creator 生成的启动文件。

编辑器验收见 [editor-check.ts](./game/scripts/editor-check.ts)。这些接口在 Creator 编辑器窗口中调用：

| API / 消息 | 验收用途 |
| --- | --- |
| `Editor.Project.path`、`Editor.App.version` | 确认当前工程路径和 Creator 版本。 |
| `Editor.Message.request('scene', 'open-scene', sceneId)` | 打开 Boot 场景。 |
| `Editor.Message.request('scene', 'query-node-tree')` | 查询场景节点树，确认包含 Canvas。 |
| `Editor.Message.request('asset-db', 'query-ready')` | 确认资源数据库就绪。 |
| `Editor.Message.request('asset-db', 'query-asset-info', urlOrUuid)` | 查询脚本和场景资源，核对 URL 与 UUID。 |
| `Editor.Message.request('project', 'query-design-resolution')` | 核对设计分辨率与适配选项。 |
| `Editor.Message.request('server', 'query-port')` | 获取编辑器预览服务端口。 |

## 10. 玩法功能由谁实现

| 功能 | 当前实现 |
| --- | --- |
| 组件生命周期与逐帧调用 | Cocos 驱动 `FlappyBird`。 |
| 重力、拍翅、碰撞、计分、水管回收、游戏状态 | [共享 `Game`](../shared/core-ts/game.ts)。 |
| 固定步长、补帧上限、暂停和恢复 | [共享 `FixedClock`](../shared/core-ts/clock.ts)，由 `FlappyBird` 调用。 |
| 游戏对象显示与小鸟换帧 | `FlightRenderer` 使用 Cocos Sprite 和节点属性更新画面。 |
| 分数、菜单和按钮 | `FlightUI` 使用 Cocos Label、Graphics、Button。 |
| 最高分格式与读写规则 | [共享 `BestScoreStore`](../shared/web-ts/storage.ts)，底层接入 `sys.localStorage`。 |
| 回放输入、URL 参数与测试控制 | `FlappyBird` 和项目验收脚本。 |

维护本文时，以三个游戏脚本、Boot 场景、Web 启动模板和编辑器验收脚本的实际调用为准；增加或移除 Cocos API 时同步更新对应条目。
