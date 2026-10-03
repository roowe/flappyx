# FlappyX：同一个 Flappy Bird，六种引擎实现

FlappyX 用 Phaser、Three.js、Babylon.js、Cocos Creator、Godot 和 Unity 实现同一套 Flappy Bird，比较各引擎的代码组织、场景与 UI、输入处理和发布流程。

六个版本共用素材、`easyV1` 玩法参数和回放用例：逻辑画布为 1024 × 768，玩法以 30 Hz 固定步长运行。重力、碰撞、计分和水管回收由共享内核计算，各引擎负责把模型显示出来并接收玩家输入。

## 工程与 API 文档入口

下面的版本是本仓库使用的版本。`api.md` 记录项目实际调用的 API、对应源码和职责，完整运行说明放在各工程 README 中。

| 实现 | 版本 / 业务语言 | 本项目已验证的运行形态 | 运行说明 | API 文档 |
| --- | --- | --- | --- | --- |
| Phaser | 4.2.1 / TypeScript | 浏览器开发与生产构建 | [phaser/README.md](./phaser/README.md) | [phaser/api.md](./phaser/api.md) |
| Three.js | 0.186.0 / TypeScript | 浏览器开发与生产构建 | [threejs/README.md](./threejs/README.md) | [threejs/api.md](./threejs/api.md) |
| Babylon.js | 9.29.0 / TypeScript | 浏览器开发与生产构建 | [babylonjs/README.md](./babylonjs/README.md) | [babylonjs/api.md](./babylonjs/api.md) |
| Cocos Creator | 3.8.8 / TypeScript | 编辑器浏览器预览、Web Desktop Release | [cocos/README.md](./cocos/README.md) | [cocos/api.md](./cocos/api.md) |
| Godot .NET | 4.7.2 / C# | macOS 开发运行与应用导出 | [godot/README.md](./godot/README.md) | [godot/api.md](./godot/api.md) |
| Unity | 6000.5.6f1 / C# | 编辑器 Play Mode、macOS 应用、Web 构建 | [u3d/README.md](./u3d/README.md) | [u3d/api.md](./u3d/api.md) |

这张表只记录当前工程的验收范围。引擎支持其他平台，不代表本项目已在那些平台验证。

## 快速运行

所有命令从仓库根目录执行，统一入口见 [justfile](./justfile)。JavaScript / TypeScript 工具使用 Bun；素材处理工具使用 uv。Cocos、Godot 和 Unity 还需要对应版本的编辑器与构建环境，安装路径和依赖见各工程 README。

先体验网页版本，可以从 Phaser 开始：

```sh
bun install --cwd phaser --frozen-lockfile
just phaser
```

打开 [Phaser 本地开发页](http://127.0.0.1:5174/)。空格、鼠标主键或轻触游戏画面拍翅；失焦会暂停，返回后点击“继续游戏”。

其他实现的常用入口：

| 实现 | 启动命令 | 打开位置 |
| --- | --- | --- |
| Three.js | `just threejs` | [本地开发页](http://127.0.0.1:5176/)；首次先执行 `bun install --cwd threejs --frozen-lockfile` |
| Babylon.js | `just babylonjs` | [本地开发页](http://127.0.0.1:5179/)；首次先执行 `bun install --cwd babylonjs --frozen-lockfile --ignore-scripts` |
| Cocos Creator | `just cocos` | 打开 `cocos/game`，双击 `assets/scenes/Boot.scene`，选择浏览器预览；首次先执行 `bun install --cwd cocos/game --frozen-lockfile --ignore-scripts` |
| Godot | `just godot` / `just editor-godot` | 前者运行游戏，后者打开编辑器，入口场景为 `godot/game/Main.tscn` |
| Unity | `just unity` / `just editor-unity` | 前者构建并运行 macOS 游戏，后者打开编辑器，入口场景为 `u3d/game/Assets/Scenes/Main.unity` |

Unity 网页版：

```sh
just build-unity-web
just preview-unity-web
```

打开 [Unity 本地预览页](http://127.0.0.1:4175/)。产物在 `u3d/build/web/`，通过 HTTP 服务访问。Web 构建使用独立工程副本，可以保留当前 Unity 编辑器窗口；桌面构建与检查需要独占原工程。具体约束见 [Unity 运行说明](./u3d/README.md)。

## 共享代码与引擎边界

| 目录 / 文件 | 职责 |
| --- | --- |
| [shared/config/gameplay.json](./shared/config/gameplay.json) | 玩法参数、碰撞规则、逻辑时钟、暂停和存档契约。调难度从这里改。 |
| [shared/assets](./shared/assets/) | 共享图片与精灵元数据。 |
| [shared/core-ts](./shared/core-ts/) | Phaser、Three.js、Babylon.js、Cocos 使用的 TypeScript 玩法内核。 |
| [shared/core-csharp](./shared/core-csharp/) | Godot、Unity 使用的纯 C# 内核，与 TS 内核做逐 tick 对照。 |
| [shared/web-ts](./shared/web-ts/) | Phaser、Three.js、Babylon.js 共用的 HTML UI、样式与存档代码；Cocos 复用其中的存档逻辑。 |
| [shared/contract-csharp](./shared/contract-csharp/) | C# 配置解析与跨语言验收入口。 |
| [shared/fixtures](./shared/fixtures/) | 固定输入、回放与预期结果。 |
| [docs](./docs/) | 实施计划、资源说明及各引擎验收记录。 |

Cocos、Godot、Unity 的启动工具会把共享源码或资源同步到各自工程。修改共享源后重新同步，避免直接修改生成的副本。

## 引擎适合什么场景

以下是面向选型的判断，按发布目标、编辑器工作流和需要自行组装的功能比较。平台能力依据官方资料于 **2026-10-04** 核对；“建议”是结合这些能力与本仓库实现得出的取舍。

| 引擎 | 我更推荐的场景 | 选择理由与主要取舍 |
| --- | --- | --- |
| **Phaser** | 网页 2D 小游戏、活动互动页、教学游戏、前端团队维护的轻量游戏 | 官方定位就是面向浏览器的 2D 游戏框架，使用 JS / TS。对当前 Flappy Bird，场景、图片加载和更新回调能直接承担所需工作。原生发布需要额外工具，完整 3D 游戏应另选方案。[官方定位](https://docs.phaser.io/phaser/getting-started/what-is-phaser) |
| **Three.js** | 网站里的 3D 展示、产品交互、数据可视化、定制视觉效果 | 它提供通用 JavaScript 3D 库，适合围绕网页产品自行组织交互。这里用正交相机和平面贴图完成 2D 画面，UI、输入和玩法由项目代码提供；当目标是一整套游戏时，也要自行规划这些系统。[官方项目说明](https://github.com/mrdoob/three.js#readme) |
| **Babylon.js** | 浏览器 3D 游戏、产品配置器、交互式三维场景，需要较多现成功能的 Web 3D 项目 | 官方提供场景、动画、音频、GUI、物理集成和检查工具。需要这些功能时，可以减少自行组合的工作；同时也要接受并学习其系统组织方式。当前 Flappy Bird 只用了其中较小一部分，发挥不出完整优势。[官方功能清单](https://www.babylonjs.com/specifications/) |
| **Cocos Creator** | 以 TypeScript 开发的 2D 游戏、微信/抖音等小游戏、希望使用场景编辑器并面向多个平台的项目 | 官方发布流程覆盖 Web、小游戏及原生平台。对熟悉 TS、想继续做游戏内容的人，节点、组件和编辑器能形成连贯的工作流。代价是增加资源导入、场景关联与各平台适配；本仓库目前只验收了 Web 路线。[官方发布平台](https://docs.cocos.com/creator/3.8/manual/en/editor/publish/) |
| **Godot** | 独立 2D 游戏、桌面游戏、小团队项目，以及希望控制引擎源码的开发 | 专门的 2D 工作流、节点/场景和 UI 系统适合组织游戏内容，MIT 许可也便于自行修改引擎。需要按脚本语言核对发布能力：本仓库用 C#，当前 Godot 4 C# 项目仍不能导出 Web。[官方功能](https://godotengine.org/features/)、[Web 导出限制](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html) |
| **Unity** | 使用 C# 持续开发桌面/移动游戏，需要场景、动画、关卡和多平台构建协作的项目 | Unity 提供 2D 内容制作工具，也有 Web 构建流程。本仓库已经用同一套 C# 玩法跑通 macOS 与浏览器。对单一小网页游戏，编辑器、资源导入和构建流程会带来更多工程工作；项目扩大或已有 Unity 内容时，这些投入更容易复用。[官方 2D 工具](https://unity.com/features/2d)、[Web 发布流程](https://docs.unity3d.com/6000.0/Documentation/Manual/webgl-gettingstarted.html) |

### 针对这个项目，我会怎么选

- **继续做当前这种网页 2D 游戏：优先 Phaser。** 当前玩法规模小，又已使用 TS，共享网页 UI 和浏览器开发工具都能继续使用。
- **想从这个样例继续学游戏制作、做关卡和小游戏：优先 Cocos。** 保留 TS 技术栈，下一步可以更多使用场景、Prefab 和动画编辑器，减少纯代码拼装画面的工作。
- **转向网页 3D：按功能密度选 Three.js 或 Babylon.js。** 网页产品中的定制三维展示，我倾向 Three.js；需要 GUI、物理、音频等较完整游戏功能，我倾向 Babylon.js。
- **转向桌面/移动游戏：把 Godot 和 Unity 放到前面。** 独立 2D、重视开源控制权时，我倾向 Godot；C# 复用并且 Web 是必需交付目标时，当前 Unity 更合适。

对于“哪个更有潜力”，更有用的判断是：接下来会做哪类内容。网页视觉、小游戏分发、独立桌面游戏和多平台 C# 游戏，对引擎的要求不同；本仓库这个小样例只能展示它们的基础接入方式。

### 如何理解当前实现的差异

Phaser、Three.js、Babylon.js 的按钮和文字使用 HTML DOM；Cocos 使用引擎 UI 组件，Godot 使用 Control 节点，Unity 使用 uGUI。坐标转换、焦点、按钮事件、缩放和存档也需要各自适配，这些差异能从每份 `api.md` 里看到。

Cocos、Godot、Unity 当前都由入口脚本在运行时创建大部分画面和 UI。因此，这份代码还没有充分展示它们在可视化场景、动画和关卡制作上的价值。迁移时增加的一部分代码，来自“多个引擎必须遵守同一套输入、暂停和回放契约”这个比较目标；不能把适配代码量直接当作日常游戏开发的难度。

六个版本的固定步长与玩法参数一致，也有回放对照。实际操作时觉得某个版本更容易玩，还可能与输入进入逻辑 tick 的时机、窗口焦点、画面缩放和显示节奏有关。现有验收没有测量端到端输入延迟，不能据此认定某个引擎天生更灵敏。

## 检查与验收记录

下列命令是各实现已有的检查入口；它们覆盖的范围不同，详细内容以对应记录为准。

| 实现 | 检查命令 | 验收记录 |
| --- | --- | --- |
| 资源与规则 | `just check-m1` | [资源与玩法契约](./docs/m1-resources-and-rules.md) |
| Phaser | `just check-m2` | [Phaser 基准](./docs/m2-phaser-baseline.md) |
| Three.js | `just check-m3` | [Three.js 对照](./docs/m3-threejs.md) |
| Babylon.js | `just check-babylonjs` | [Babylon.js 对照](./docs/m4b-babylonjs.md) |
| Cocos | `just check-m4` | [Cocos 预览与发布](./docs/m4-cocos.md) |
| Godot | `just check-godot` | [Godot 原生与导出](./docs/m6-godot.md) |
| Unity | `just check-unity` | [Unity 编辑器与原生导出](./docs/m5-unity.md)；Web 验收另见 [Unity README](./u3d/README.md) |

浏览器交互验收需要另外启动开发/预览服务器和专用浏览器，按各工程 README 执行。现有测试主要验证逻辑、输入流程、画面布局和存档；手机实机与外部托管的验证范围请查看各工程记录。

维护文档时，启动或发布方式改变就更新对应工程 README；引擎调用改变就更新对应 `api.md`；新增实现或调整选型结论时再更新本页。
