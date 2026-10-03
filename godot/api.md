# 本项目使用的 Godot API

本目录使用 **Godot 4.7.2 .NET**，项目引用 `Godot.NET.Sdk/4.7.2`，目标框架为 `net10.0`，见 [FlappyX.Godot.csproj](./game/FlappyX.Godot.csproj)。本文按当前源码整理实际使用的 Godot C# API、项目设置和验收接口。

Godot 负责场景生命周期、输入分发、精灵和原生 UI。玩法由 [共享 C# 内核](../shared/core-csharp/Game.cs) 中的 `Game`、`FixedClock` 实现。共享图片、配置和回放数据通过 [tools/project.ts](./tools/project.ts) 同步到 `game/Content/`；修改玩法和素材信息时应修改共享源。

## 1. 场景入口与脚本分工

| 文件 | 类型与责任 |
| --- | --- |
| [Main.tscn](./game/Main.tscn) | 主场景，包含一个绑定 `FlappyGame.cs` 的 Node2D 根节点。 |
| [FlappyGame.cs](./game/Scripts/FlappyGame.cs) | 继承 `Node2D`，负责初始化、输入、时钟、暂停、存档、回放，以及创建和更新 UI。 |
| [SpriteView.cs](./game/Scripts/SpriteView.cs) | 普通 C# 类，负责天空、地面、水管和小鸟的 Sprite2D 节点。 |
| [BestScoreStore.cs](./game/Scripts/BestScoreStore.cs) | 普通 C# 类，使用 .NET 文件与 JSON API 保存最高分。 |
| [QaRunner.cs](./game/Scripts/QaRunner.cs) | 静态验收辅助类，负责模拟输入、检查回放、截图和输出诊断数据。 |

主场景通过外部脚本资源绑定入口：

```ini
[ext_resource type="Script" path="res://Scripts/FlappyGame.cs" id="1"]

[node name="FlappyGame" type="Node2D"]
texture_filter = 1
script = ExtResource("1")
```

`FlappyGame._Ready()` 在运行时建立后续节点。下面的节点类型用于说明分组；Sprite 的名称由代码明确设置，UI 节点没有逐一指定名称。

```text
FlappyGame（Node2D，绑定 FlappyGame.cs）
├── ColorRect                   ← 游戏区域底色
├── CanvasLayer（Layer = 10）
│   └── Control
│       └── Label、Button、Panel 等 UI
├── Sky0–Sky2                   ← 3 个天空 Sprite2D
├── Land0–Land2                 ← 3 个地面 Sprite2D
├── Pipe0Part0 … Pipe6Part3     ← 28 个水管 Sprite2D
└── Bird                        ← 小鸟 Sprite2D
```

`SpriteView`、`BestScoreStore` 和 `QaRunner` 不作为脚本绑定到场景节点。编辑器里主场景只有入口节点，游戏图片和 UI 在运行后才出现。

## 2. 生命周期与主循环

位置：[FlappyGame.cs](./game/Scripts/FlappyGame.cs)。引擎类型来自 `Godot` 命名空间。

| API / 回调 | 本项目的用法 |
| --- | --- |
| `Node2D` | 游戏根节点的基类，提供节点树、2D 显示和生命周期能力。 |
| `_Ready()` | 根节点就绪时读取配置、建立 UI、读取最高分、创建模型和精灵。 |
| `_Process(double delta)` | 每个处理帧调用；将秒单位的 `delta` 乘以 1000 后交给共享时钟，再更新画面。 |
| `_UnhandledInput(InputEvent input)` | 接收尚未被前面的输入处理阶段消费的事件，映射为拍翅或暂停。 |
| `_Notification(int what)` | 接收应用或窗口失焦通知，暂停游戏。 |
| `NotificationApplicationFocusOut`、`NotificationWMWindowFocusOut` | 项目处理的两种失焦通知。 |
| `OS.GetCmdlineUserArgs()` | 读取命令行 `--` 后的项目参数，识别 `--qa-dir`、`--qa`、`--capture` 和 `--watch`。 |
| `CallDeferred(MethodName.RunQa)` 等 | 延迟调用对应验收方法，让 `_Ready()` 先完成初始化；方法名称由 Godot C# 代码生成器提供。 |

`Render()`、`AdvanceTick()`、`Pause()`、`Resume()` 和 `Restart()` 都是项目自己定义的方法。暂停通过共享 `FixedClock.Pause()` 冻结玩法，UI 仍可接收“继续”按钮操作。普通模式由 `_Process()` 驱动，手动验收模式由 `QaRunner` 推进模型。

## 3. 项目设置与窗口

位置：[project.godot](./game/project.godot)。以下是当前工程实际设置的项目属性。

| 配置项 | 本项目的用法 |
| --- | --- |
| `application/run/main_scene` | 指向 `res://Main.tscn`，作为运行入口。 |
| `application/config/name`、`application/config/version` | 设置游戏名称和项目版本。 |
| `application/config/use_custom_user_dir` | 启用自定义用户数据目录。 |
| `application/config/custom_user_dir_name` | 设为 `FlappyX/Godot`，隔离本版本的存档。 |
| `display/window/size/viewport_width`、`display/window/size/viewport_height` | 将逻辑视口设为 `1024 × 768`。 |
| `display/window/size/window_width_override`、`display/window/size/window_height_override` | 将初始窗口设为 `1024 × 768`。 |
| `display/window/size/min_width`、`display/window/size/min_height` | 将最小窗口设为 `320 × 240`。 |
| `display/window/stretch/mode = "canvas_items"` | 让 2D 内容随窗口适配。 |
| `input_devices/pointing/emulate_mouse_from_touch = false` | 关闭由触摸合成鼠标事件，避免同一触摸重复进入玩法输入。 |
| `rendering/renderer/rendering_method = "gl_compatibility"` | 使用 Compatibility 渲染后端；`.mobile` 对应设置也使用该值。 |
| `rendering/textures/canvas_textures/default_texture_filter = 0` | 将视口默认纹理过滤设为最近邻；每个 Sprite2D 还显式设置最近邻。 |
| `rendering/textures/vram_compression/import_etc2_astc` | 设为 `true`，启用对应平台纹理格式的导入选项。 |
| `rendering/environment/defaults/default_clear_color` | 设置窗口清屏底色；逻辑游戏区域另用 ColorRect 显示共享配置中的背景色。 |
| `dotnet/project/assembly_name` | 将 C# 程序集名设为 `FlappyX.Godot`。 |

逻辑坐标以左上角为原点、Y 轴向下，与当前 Godot 2D 画面一致。精灵位置直接使用模型坐标，窗口缩放不改变模型里的位置和碰撞范围。

## 4. 资源加载与精灵

位置：[SpriteView.cs](./game/Scripts/SpriteView.cs) 的构造函数和 `Place()`，以及 [FlappyGame.cs](./game/Scripts/FlappyGame.cs) 的配置与回放读取。

| API / 属性 | 本项目的用法 |
| --- | --- |
| `Godot.FileAccess.GetFileAsString(path)` | 读取 `res://Content/` 下的玩法配置、精灵元数据和回放 JSON 文本。源码用 `FileAccess` 别名明确指向 Godot 类型。 |
| `GD.Load<Texture2D>(path)` | 从项目资源路径加载每张图片，例如 `res://Content/bird-01.png`。 |
| `Texture2D` | 保存加载后的纹理，用素材 ID 在字典中索引。 |
| `new Sprite2D()` | 创建天空、地面、水管和小鸟的图片节点。 |
| `Node.Name` | 将精灵命名为 `Sky0`、`Pipe0Part0`、`Bird` 等，供场景识别和诊断。 |
| `Node.AddChild(node)` | 将精灵或 UI 节点加入父节点。 |
| `Sprite2D.Centered = true` | 使用图片中心作为定位和旋转参考点。 |
| `CanvasItem.ZIndex` | 指定绘制顺序：天空 0、水管 1、地面 2、小鸟 3；游戏底色为 -1。 |
| `CanvasItem.TextureFilter = CanvasItem.TextureFilterEnum.Nearest` | 对精灵显式启用最近邻采样。 |
| `Sprite2D.Texture` | 分配纹理；小鸟动画通过此属性切换已有图片。 |
| `Node2D.Position`、`new Vector2(x, y)` | 更新精灵的显示位置。模型使用 double，写入 Vector2 时转换为 float。 |
| `Node2D.Scale` | 根据目标显示尺寸与纹理像素尺寸的比值设置缩放。 |
| `Texture2D.GetWidth()`、`GetHeight()` | 读取纹理原始尺寸，用于计算缩放与诊断实际显示尺寸。 |
| `Node2D.RotationDegrees` | 以度为单位设置小鸟倾角。 |

实际尺寸计算：

```csharp
sprite.Scale = new Vector2(
    (float)(asset.Width / asset.Texture.GetWidth()),
    (float)(displayHeight / asset.Texture.GetHeight()));
```

[tools/project.ts](./tools/project.ts) 首次生成纹理 `.import` 文件时设置 `compress/mode=0`、`mipmaps/generate=false`、`process/fix_alpha_border=false` 和 `process/premult_alpha=false`。这些是资源导入配置；运行时由 `GD.Load<Texture2D>()` 获取导入后的纹理。

## 5. 游戏画面的组合方式

位置：[SpriteView.cs](./game/Scripts/SpriteView.cs) 的 `Render()`。

- **天空、地面滚动**：各创建三个 Sprite2D，根据 `model.FlightTicks` 计算平铺偏移，再更新 `Position`。
- **水管**：每组由上管身、上管头、下管身、下管头四个 Sprite2D 组成。`Position` 决定中心位置，`Scale` 将管身拉伸到开口上下所需的高度。
- **小鸟动画**：从元数据读取帧列表与每帧 tick 数，按逻辑 tick 选择已有纹理，赋给 `Texture`。
- **小鸟飞行**：`Position` 同步模型高度，`RotationDegrees` 根据竖直速度计算倾角。当前坐标方向一致，无需对角度取负。

当前一共创建 35 个游戏精灵，重新开始时继续复用。`roundPixels` 由项目代码在写入显示位置前处理，只影响显示；重力、碰撞和分数都由共享模型计算。

## 6. 原生 UI、主题与按钮

位置：[FlappyGame.cs](./game/Scripts/FlappyGame.cs) 的 `BuildUi()` 和 `Render()`。

| API / 属性 | 本项目的用法 |
| --- | --- |
| `new Color(string)`、`new Color(r, g, b, a)` | 从颜色字符串或分量构造 UI 颜色。 |
| `ColorRect.Color` | 设置逻辑游戏区域的底色。 |
| `CanvasLayer.Layer = 10` | 将分数、面板和按钮放到独立的上层画布。 |
| `Control.Position`、`Control.Size` | 设置文字、按钮和面板的局部位置与尺寸。 |
| `Control.MouseFilter = Control.MouseFilterEnum.Ignore` | 让纯展示文字、底色和 UI 根容器不拦截鼠标事件。 |
| `Control.MouseFilter = Control.MouseFilterEnum.Stop` | 让面板区域阻断鼠标事件，避免操作面板时触发场景拍翅。 |
| `SystemFont.FontNames` | 按项目给定的字体列表选择系统字体：PingFang SC、Heiti SC、Arial。 |
| `Theme.DefaultFont`、`DefaultFontSize` | 设置 UI 默认字体和字号。 |
| `Control.Theme` | 将主题应用到 UI 根容器，供子控件使用。 |
| `Theme.SetColor(name, type, color)` | 设置 Label 文字以及 Button 各状态的文字颜色。 |
| `Theme.SetStylebox(name, type, style)` | 为 Button 的 normal、hover、pressed、disabled、focus 状态配置样式。 |
| `StyleBoxFlat.BgColor` | 设置按钮或面板背景颜色。 |
| `StyleBoxFlat.CornerRadiusTopLeft`、`CornerRadiusTopRight`、`CornerRadiusBottomLeft`、`CornerRadiusBottomRight` | 设置四个圆角半径。 |
| `StyleBoxFlat.ShadowColor`、`ShadowSize` | 设置面板阴影的颜色与大小。 |
| `Label.Text` | 更新分数、最高分、标题、操作说明和存档提示。 |
| `Label.HorizontalAlignment`、`VerticalAlignment` | 均设为对应枚举的 `Center`，让文字居中。 |
| `Control.AddThemeFontSizeOverride("font_size", size)` | 为指定 Label 覆盖字号。 |
| `Panel.AddThemeStyleboxOverride("panel", style)` | 为面板设置圆角、背景和阴影样式。 |
| `Button.Text`、`Button.Disabled` | 更新按钮文案与可用性，例如死亡保护期内禁用重开。 |
| `Control.FocusMode = Control.FocusModeEnum.None` | 让按钮不取得键盘焦点，游戏继续用空格处理拍翅。 |
| `Button.Pressed += action` | 通过 C# 事件订阅按钮的 Pressed 信号，连接开始、暂停、继续、重开和回放操作。 |
| `CanvasItem.Visible` | 控制准备/结算面板、暂停面板、回放和返回按钮的显示。 |

`BuildUi()` 中的 `LabelAt()`、`ButtonAt()`、`Card()` 是项目定义的辅助函数。`Render()` 读取模型状态后修改控件属性，实际画面由 Godot 绘制。

## 7. 输入、视口与存档

位置：[FlappyGame.cs](./game/Scripts/FlappyGame.cs) 的 `_UnhandledInput()` 和 `_Ready()`。

| API / 属性 | 本项目的用法 |
| --- | --- |
| `InputEventKey.Pressed`、`Echo` | 只接受按下且非自动重复的键盘事件。 |
| `InputEventKey.PhysicalKeycode`、`Key.Space`、`Key.Escape` | 根据物理键位识别空格拍翅与 Escape 暂停。 |
| `InputEventMouseButton.Pressed`、`ButtonIndex`、`MouseButton.Left` | 只接受鼠标主键按下。 |
| `InputEventMouseButton.Position` | 获取鼠标事件坐标，检查是否位于逻辑视口内。 |
| `InputEventScreenTouch.Pressed`、`Index`、`Position` | 接受索引为 0 的触摸按下，并检查触摸位置。 |
| `GetViewportRect()`、`Rect2.HasPoint(position)` | 忽略逻辑视口外的指针输入。 |
| `GetViewport().SetInputAsHandled()` | 将已处理的拍翅或暂停事件标记为已消费。 |
| `ProjectSettings.GlobalizePath("user://best.json")` | 将 Godot 用户数据路径转换为本机绝对路径，交给存档类。 |
| `GD.PushWarning(message)` | 将存档读写失败信息送到引擎警告输出，同时在 UI 显示。 |

普通玩家最高分使用工程自定义的 `user://` 目录；验收通过 `--qa-dir` 指定独立存档位置。实际读写由 [BestScoreStore.cs](./game/Scripts/BestScoreStore.cs) 的 `System.IO.File`、`Directory`、`Path` 和 `System.Text.Json` 完成，这些属于 .NET API。

`QueueFlap()` 将多次输入合并为一个布尔值，下一次逻辑 tick 消费后清除。暂停和恢复也会清除待处理输入。回放使用固定输入和水管序列，不读取或写入玩家最高分。

## 8. 快照、截图与验收 API

位置：[FlappyGame.cs](./game/Scripts/FlappyGame.cs)、[SpriteView.cs](./game/Scripts/SpriteView.cs) 的 `Diagnostics()`，以及 [QaRunner.cs](./game/Scripts/QaRunner.cs)。

| API / 属性 | 验收用途 |
| --- | --- |
| `GetWindow().Size.X`、`Size.Y` | 记录实际窗口尺寸。 |
| `GetViewportRect().Size` | 记录逻辑视口尺寸。 |
| `GetViewport().GetFinalTransform()` | 读取视口最终变换，通过 `X.X`、`Y.Y` 与 `Origin.X/Y` 记录尺度和偏移。 |
| `Sprite2D.Name`、`Position`、`Scale`、`TextureFilter`、`RotationDegrees` | 检查精灵坐标、实际显示尺寸、最近邻采样和小鸟倾角。 |
| `Input.ParseInputEvent(event)` | 构造键盘、鼠标、触摸事件，送入 Godot 的输入分发路径。 |
| `button.EmitSignal(BaseButton.SignalName.Pressed)` | 主动发出按钮信号，验证恢复和重开回调。 |
| `GetTree()` | 获取 SceneTree，用于等待处理帧、建立计时器和结束验收进程。 |
| `ToSignal(tree, SceneTree.SignalName.ProcessFrame)` | 异步等待处理帧信号。 |
| `ToSignal(RenderingServer.Singleton, RenderingServer.SignalName.FramePostDraw)` | 截图前等待本帧完成绘制。 |
| `GetViewport().GetTexture().GetImage()` | 从当前视口纹理读取截图图像。 |
| `Image.SavePng(path)`、`Error.Ok` | 保存 PNG，并检查返回结果是否成功。 |
| `Engine.GetVersionInfo()["string"].AsString()` | 获取引擎版本字符串，写入验收记录。 |
| `GD.Print(message)`、`GD.PushError(message)` | 输出验收成功信息或失败原因。 |
| `SceneTree.Quit()`、`Quit(1)` | 以成功或失败退出码结束验收。 |
| `GodotObject.IsInstanceValid(app)`、`app.IsInsideTree()` | 观察模式中确认根节点仍有效且位于场景树内。 |
| `SceneTree.CreateTimer(0.1)`、`SceneTreeTimer.SignalName.Timeout` | 观察模式每次等待 0.1 秒，再输出下一份诊断数据。 |

`Diagnostics()`、`ManualMode`、`AdvanceTick()` 等名称属于项目代码。验收只在明确传入 `--qa`、`--capture` 或 `--watch` 时执行；其中按钮信号检查验证回调逻辑，输入事件检查验证引擎分发路径。

## 9. 导入与导出入口

位置：[tools/project.ts](./tools/project.ts) 和 [export_presets.cfg](./game/export_presets.cfg)。这些是工具脚本调用的 Godot 命令行接口。

| 参数 / 配置 | 本项目的用法 |
| --- | --- |
| `--path <project>` | 指定 `godot/game` 工程。 |
| `--editor` | 打开编辑器；资源导入时也与其他参数组合使用。 |
| `--headless --editor --import` | 在无窗口模式完成资源导入。 |
| `--headless --export-release macOS <path>` | 使用 macOS 预设导出 Release 应用。 |
| `--quit-after 600` | 给无窗口验收设置退出帧数上限。 |
| `--` | 分隔引擎参数与项目自定义参数。 |
| `export_filter="all_resources"`、`include_filter="Content/*.json"` | 导出资源，并包含玩法、素材元数据和回放 JSON。 |
| `binary_format/architecture="universal"` | macOS 产物包含 ARM64 和 x86_64 架构。 |
| `dotnet/include_scripts_content=false` | 不将 C# 源码内容作为脚本资源包含在产物中。 |

`dotnet build` 属于 .NET 工具链；`Bun.spawn()`、文件同步和哈希校验属于开发脚本。完整启动、验收和导出命令见 [README.md](./README.md)。

## 10. Godot 与共享代码的职责

| 功能 | 当前实现 |
| --- | --- |
| 场景生命周期、逐帧回调、输入分发 | Godot 的 Node2D 与场景树。 |
| 重力、拍翅、碰撞、计分、水管回收、游戏状态 | [共享 `Game`](../shared/core-csharp/Game.cs)。 |
| 固定步长、补帧上限、暂停和恢复 | [共享 `FixedClock`](../shared/core-csharp/FixedClock.cs)。 |
| 图片加载、位置、缩放、倾角和换帧 | `SpriteView` 使用 Godot Texture2D 与 Sprite2D。 |
| 分数、菜单、按钮与主题 | `FlappyGame.BuildUi()` 使用 Godot Control 系列节点。 |
| 配置和回放解析 | [ConfigJson](../shared/contract-csharp/ConfigJson.cs) 与 .NET JSON API。 |
| 最高分保存 | Godot 解析用户目录，`BestScoreStore` 使用 .NET 文件 API 读写。 |
| 基准回放与引擎间一致性检查 | 项目回放数据、`QaRunner` 和 Bun 验收脚本。 |

维护本文时，以游戏脚本、主场景、项目设置和工具脚本的实际调用为准；增加或移除 Godot API 时同步更新对应条目。
