# 本项目使用的 Unity API

本目录使用 **Unity 6000.5.6f1**，版本见 [ProjectVersion.txt](./game/ProjectSettings/ProjectVersion.txt)。本文按当前源码整理实际使用的 Unity 运行时、编辑器、构建和验收 API。

Unity 负责场景生命周期、输入、相机、精灵和 UI。重力、拍翅、碰撞、计分与固定步长由 [共享 C# 内核](../shared/core-csharp/) 中的 `Game`、`FixedClock` 实现。工具脚本将共享源码、图片和 JSON 同步到 Unity 工程；修改玩法时应修改共享源。

当前使用的官方包见 [manifest.json](./game/Packages/manifest.json)：Input System 1.20.0、uGUI 2.5.0、Newtonsoft JSON 3.2.2，以及用于编辑器集成的 Visual Studio Editor 2.0.28。Newtonsoft.Json 的序列化接口属于该 JSON 库，下面会与 Unity API 区分。

## 1. 场景入口与脚本分工

| 文件 | 类型与责任 |
| --- | --- |
| [Main.unity](./game/Assets/Scenes/Main.unity) | 主场景，保存 `Flappy Bird` 根对象、`FlappyGame` 组件及精灵材质引用。 |
| [FlappyGame.cs](./game/Assets/Scripts/FlappyGame.cs) | 继承 `MonoBehaviour`，负责初始化、主循环、输入、暂停、存档、回放及视口适配。 |
| [SpriteView.cs](./game/Assets/Scripts/SpriteView.cs) | 普通 C# 类，创建并更新天空、地面、水管和小鸟的 `SpriteRenderer`。 |
| [GameUi.cs](./game/Assets/Scripts/GameUi.cs) | 普通 C# 类，创建 uGUI 文字、面板、按钮和 UI 输入系统，按钮动作交给 `FlappyGame`。 |
| [Content.cs](./game/Assets/Scripts/Content.cs) | 静态类，从 `Resources` 读取 JSON，使用 Newtonsoft.Json 解析、验证和输出数据。 |
| [BestScoreStore.cs](./game/Assets/Scripts/BestScoreStore.cs) | 普通 C# 类，使用 .NET 文件 API 与 JSON 库保存最高分。 |
| [QaRunner.cs](./game/Assets/Scripts/QaRunner.cs) | 静态验收辅助类，模拟输入、检查回放与存档、截图并退出验收进程。 |
| [BuildProject.cs](./game/Assets/Editor/BuildProject.cs) | 编辑器静态类，准备纹理与场景、设置 Player、进入 Play Mode、构建 macOS 和 Web。 |

场景中的 `MonoBehaviour.m_Script` 引用 [FlappyGame.cs.meta](./game/Assets/Scripts/FlappyGame.cs.meta) 的 GUID；公开字段 `SpriteMaterial` 保存材质引用。编辑器中打开 `Main` 场景并选中 **Flappy Bird**，就能看到这个组件。

`Awake()` 执行后，运行时层级大致如下；省略了 UI 内部的文字与按钮子对象：

```text
Flappy Bird（Transform + FlappyGame）
├── Letterbox                  ← 只清屏的 Camera
├── Game camera                ← 绘制游戏的正交 Camera
├── Input UI                   ← EventSystem + InputSystemUIInputModule
├── Interface                  ← 世界空间 Canvas + GraphicRaycaster
├── Sky0–Sky2                  ← 3 个 SpriteRenderer
├── Land0–Land2                ← 3 个 SpriteRenderer
├── Pipe0Part0 … Pipe6Part3    ← 28 个 SpriteRenderer
└── Bird                       ← 小鸟 SpriteRenderer
```

`SpriteView` 和 `GameUi` 无需挂到场景上。相机、精灵和 UI 都由代码在运行时创建，所以未运行时的场景只显示入口对象。

## 2. 生命周期与主循环

位置：[FlappyGame.cs](./game/Assets/Scripts/FlappyGame.cs)。

| API / 回调 | 本项目的用法 |
| --- | --- |
| `MonoBehaviour` | 入口组件的基类，由 Unity 调用生命周期方法。 |
| `Awake()` | 读取配置，创建相机、UI、存档、共享模型与精灵，设置初始视口。 |
| `Start()` | 根据诊断参数启动验收或截图协程。 |
| `LateUpdate()` | 每帧适配视口，收集输入，推进共享时钟，再刷新精灵和 UI。手动验收模式跳过自动推进。 |
| `Time.realtimeSinceStartupAsDouble` | 读取双精度实时计时值；相邻读数的秒差乘以 1000 后交给 `FixedClock.Frame()`。 |
| `Application.runInBackground = true` | 设置后台运行行为；玩法是否暂停仍由共享时钟控制。 |
| `Application.targetFrameRate = 60` | 请求渲染帧率为 60，不改变共享模型的 30 Hz 逻辑频率。 |
| `OnApplicationFocus(bool focus)` | 收到失焦回调时暂停玩法。 |
| `OnApplicationPause(bool pause)` | 收到应用暂停回调时暂停玩法。 |
| `StartCoroutine(IEnumerator)` | 启动 `QaRunner.Run()` 或 `QaRunner.Capture()`。 |

普通游戏由 `LateUpdate()` 驱动共享固定时钟，没有使用 `FixedUpdate()`、`Rigidbody2D` 或 Unity 物理碰撞回调计算玩法。`Pause()`、`Resume()`、`AdvanceTick()`、`Render()` 等都是项目自定义方法。

项目在计算帧间隔时用 `Math.Max(0, now - _lastFrame)` 处理曾在 Web 中观测到的计时回退。暂停会清除待处理拍翅；恢复会清除累计时间并重设计时起点。这里的 `Math` 和时间差计算属于项目代码。

## 3. 对象、相机与视口

位置：[FlappyGame.cs](./game/Assets/Scripts/FlappyGame.cs) 的 `Awake()`、`FitViewport()`，以及 [SpriteView.cs](./game/Assets/Scripts/SpriteView.cs)。

| API / 属性 | 本项目的用法 |
| --- | --- |
| `new GameObject(name)`、`new GameObject(name, componentTypes...)` | 创建有名字的游戏对象，必要时同时添加组件。 |
| `GameObject.AddComponent<T>()`、`GetComponent<T>()` | 添加或取得 `Camera`、`SpriteRenderer`、Canvas、UI 等组件。 |
| `Transform.SetParent(parent, false)` | 将运行时对象挂到根对象或 UI 容器下，采用局部变换关系。 |
| `Camera.orthographic = true` | 使用正交投影绘制 2D 游戏。 |
| `Camera.orthographicSize` | 设为逻辑画布高度的一半，使可见高度对应 768 个世界单位。 |
| `Camera.transform.position` | 游戏相机位于 `(512, 384, -10)`，精灵位于 `z = 0`。 |
| `Camera.nearClipPlane`、`farClipPlane` | 设置相机可见深度范围，当前为 0.1 到 30。 |
| `Camera.clearFlags`、`backgroundColor` | 游戏相机用共享配置的背景色清屏；留边相机使用深色背景。 |
| `Camera.depth = -10`、`cullingMask = 0` | 留边相机先绘制背景，并且不绘制场景对象。 |
| `Camera.allowHDR = false`、`allowMSAA = false` | 设置当前游戏相机的渲染选项。 |
| `Screen.width`、`Screen.height` | 获取当前输出宽高，计算画面等比适配尺寸。 |
| `Camera.rect`、`new Rect(...)` | 用归一化视口把游戏居中，剩余区域显示留边。 |
| `Camera.aspect` | 显式保持逻辑宽高比 `1024 / 768`。 |
| `Camera.pixelRect.Contains(position)` | 检查输入是否落在游戏相机的像素视口内，忽略留边。 |
| `ColorUtility.TryParseHtmlString()` | 将共享配置中的颜色字符串转换为 Unity `Color`。 |
| `Color32`、`Vector2`、`Vector3` | 表示颜色、UI 尺寸、输入坐标与对象变换。 |

共享逻辑使用左上原点、Y 轴向下；Unity 场景中的 Y 轴向上。因此显示位置转换为：

```csharp
worldY = config.Canvas.Height - logicalY;
```

窗口缩放通过相机视口实现，模型的逻辑坐标和碰撞范围保持原值。

## 4. 资源加载与精灵更新

位置：[Content.cs](./game/Assets/Scripts/Content.cs)、[SpriteView.cs](./game/Assets/Scripts/SpriteView.cs)。

| API / 属性 | 本项目的用法 |
| --- | --- |
| `Resources.Load<TextAsset>("Content/" + name)` | 从 `Assets/Resources/Content` 读取玩法、素材元数据与回放 JSON；资源名不带扩展名。 |
| `TextAsset.text` | 取得 JSON 文本，再交给 Newtonsoft.Json。 |
| `Resources.Load<Sprite>(path)` | 读取导入好的 Sprite，保存在素材 ID 对应的字典中。 |
| `SpriteRenderer` | 显示天空、地面、水管或小鸟的一张图片。 |
| `SpriteRenderer.sprite` | 分配已有 Sprite；小鸟动画通过此属性换帧。 |
| `SpriteRenderer.sharedMaterial` | 使用场景入口传入的共享精灵材质。 |
| `SpriteRenderer.sortingOrder` | 天空为 0、水管为 1、地面为 2、小鸟为 3。 |
| `Sprite.rect.width`、`height` | 获取精灵原始像素尺寸，用于计算目标显示尺寸的缩放比例。 |
| `Transform.position` | 写入中心位置，并执行逻辑 Y 到世界 Y 的转换。 |
| `Transform.localScale` | 根据目标宽高与精灵原始宽高的比值设置缩放。 |
| `Transform.rotation`、`Quaternion.Euler(0, 0, angle)` | 设置小鸟倾角；由于 Y 轴方向相反，写入的角度取模型显示角度的负值。 |

导入设置采用 `spritePixelsPerUnit = 1`，使一单位对应一个图片像素。显示大小由项目计算：

```csharp
sprite.transform.localScale = new Vector3(
    (float)(asset.Width / asset.Sprite.rect.width),
    (float)(h / asset.Sprite.rect.height),
    1);
```

`Place()`、素材 ID 映射和 `roundPixels` 处理都属于 `SpriteView` 的项目逻辑。共享模型使用 `double`；写入 Unity 的向量和角度时转换为 `float`。

## 5. 游戏画面的组合方式

位置：[SpriteView.cs](./game/Assets/Scripts/SpriteView.cs) 的构造函数、`Place()` 和 `Render()`。

- **天空、地面滚动**：各创建三个 SpriteRenderer，根据 `FlightTicks` 与滚动参数计算平铺位置，更新 `transform.position`。
- **水管**：每组包含上管身、上管头、下管头、下管身四个 SpriteRenderer。位置确定中心，`localScale` 把管身拉伸到开口边界所需的高度。
- **小鸟动画**：从元数据读取帧列表和每帧 tick 数，选择已加载的 Sprite，赋给 `SpriteRenderer.sprite`。当前没有使用 Animator 播放小鸟动画。
- **小鸟飞行**：位置读取模型高度，倾角读取竖直速度并按配置限幅，然后通过 `Quaternion.Euler()` 写入旋转。碰撞仍由共享模型计算。

当前共创建 **35 个 SpriteRenderer**：天空 3 个、地面 3 个、水管 28 个、小鸟 1 个。重新开始时复用这些对象。准备状态的动画读取 `Tick`，飞行后的动画读取 `max(0, FlightTicks - 1)`，使飞行第 1–3 tick 使用首帧。

## 6. uGUI 文字、面板与按钮

位置：[GameUi.cs](./game/Assets/Scripts/GameUi.cs)。UI 类型主要来自 `UnityEngine.UI`。

| API / 属性 | 本项目的用法 |
| --- | --- |
| `Canvas`、`RenderMode.WorldSpace` | 在世界空间创建 UI 画布，与游戏画面使用同一台正交相机。 |
| `Canvas.worldCamera`、`sortingOrder = 100` | 设置 UI 事件相机与显示顺序。 |
| `RectTransform.sizeDelta`、`position` | 根画布大小设为 1024 × 768，中心为 `(512, 384, -1)`。 |
| `RectTransform.anchorMin`、`anchorMax`、`pivot` | 子控件均采用左上锚点和轴心 `(0, 1)`。 |
| `RectTransform.anchoredPosition` | 将逻辑 UI 坐标 `(x, y)` 转成 `(x, -y)`。 |
| `Text`、`text`、`font`、`fontSize`、`color` | 创建分数、最高分、标题、说明和存档警告文字。 |
| `Text.alignment = TextAnchor.MiddleCenter` | 使文字在布局框内居中。 |
| `Text.raycastTarget = false` | 展示文字不参与 UI 点击命中。 |
| `Text.verticalOverflow = VerticalWrapMode.Overflow` | 分数字段允许纵向溢出，避免 Web 中文字体行高导致数字不显示。 |
| `Font.CreateDynamicFontFromOSFont()` | 编辑器及桌面版从 PingFang SC、Heiti SC、Arial 中选择系统字体。 |
| `Resources.Load<Font>("Fonts/FlappyUI")` | Web Player 使用随包字体；该分支由 `UNITY_WEBGL && !UNITY_EDITOR` 控制。 |
| `Image.color` | 绘制按钮和面板底色；保留默认的射线命中能力。 |
| `Button.targetGraphic` | 将按钮的底色 Image 作为状态显示对象。 |
| `Button.navigation`、`Navigation.Mode.None` | 关闭按钮导航，避免导航选中影响游戏输入。 |
| `Button.onClick.AddListener()` | 连接开始、暂停、继续、重开、回放和返回操作。 |
| `Button.interactable` | 按暂停状态和死亡保护期控制主按钮是否可用。 |
| `GameObject.SetActive()` | 控制准备/结算面板、暂停面板和回放按钮的显隐。 |
| `GetComponentInChildren<Text>()` | 更新主按钮上的“开始飞行”“重新开始”等文字。 |

`Box()`、`Label()`、`Button()` 和 `Panel()` 是构造函数内的项目辅助函数。`GameUi.Render()` 根据共享模型更新控件，`GameUi.Warn()` 通过 `Debug.LogWarning()` 和界面文字报告存档问题。

## 7. Input System 与 UI 命中

位置：[FlappyGame.cs](./game/Assets/Scripts/FlappyGame.cs) 的 `CollectInput()`、`PointerFlap()`，以及 [GameUi.cs](./game/Assets/Scripts/GameUi.cs) 的初始化。

| API / 属性 | 本项目的用法 |
| --- | --- |
| `Keyboard.current` | 获取当前键盘；没有该设备时跳过对应输入。 |
| `spaceKey.wasPressedThisFrame` | 收集本帧空格按下，排队一次拍翅。 |
| `escapeKey.wasPressedThisFrame` | 本帧按下 Escape 时暂停。 |
| `Touchscreen.current.primaryTouch` | 读取主触摸的按压状态与位置。 |
| `press.wasPressedThisFrame`、`press.isPressed` | 区分新触摸和持续触摸；主触摸活跃时跳过鼠标拍翅检查。 |
| `Mouse.current.leftButton.wasPressedThisFrame` | 收集鼠标主键按下。 |
| `position.ReadValue()` | 读取鼠标或触摸的屏幕坐标。 |
| `EventSystem` | 为 uGUI 建立事件分发系统。 |
| `InputSystemUIInputModule`、`AssignDefaultActions()` | 将 Input System 的默认 UI 动作接到 EventSystem。 |
| `GraphicRaycaster` | 让 Canvas 下可命中的 Graphic 参与 UI 射线检查。 |
| `new PointerEventData(EventSystem.current)` | 构造携带指针位置的 UI 命中查询数据。 |
| `EventSystem.current.RaycastAll(data, hits)`、`RaycastResult` | 判断指针是否命中按钮或面板；有 UI 命中时不触发拍翅。 |

指针输入先检查相机视口，再检查 UI 命中。`QueueFlap()` 把同一逻辑 tick 前的多次拍翅合并为一个布尔值，下一 tick 消费后清除；这部分属于共享玩法接入逻辑。

## 8. 存档与运行诊断

位置：[FlappyGame.cs](./game/Assets/Scripts/FlappyGame.cs)、[BestScoreStore.cs](./game/Assets/Scripts/BestScoreStore.cs) 和 [Content.cs](./game/Assets/Scripts/Content.cs)。

| API / 属性 | 本项目的用法 |
| --- | --- |
| `Application.persistentDataPath` | 提供普通游戏的持久化目录，项目在其下保存 `best.json`。 |
| `Application.unityVersion` | 将运行中的引擎版本写入诊断结果。 |
| `Application.isFocused` | 记录当前应用是否有焦点。 |
| `InputDevice.enabled`、`leftButton.isPressed` | 记录鼠标设备是否启用、主键是否按下。 |
| `EventSystem.current.currentInputModule` | 记录实际使用的 UI 输入模块。 |
| `Camera.pixelRect`、`Screen.width`、`Screen.height` | 记录游戏视口和输出尺寸。 |
| `Sprite.texture.filterMode`、`FilterMode.Point` | 检查精灵纹理是否采用最近邻采样。 |
| `Debug.LogWarning()` | 输出存档读取或写入警告。 |

文件的实际读写使用 `System.IO.File`、`Directory`、`Path`；序列化使用 `JsonConvert`、`JsonSerializerSettings`、`JObject`、`JToken` 和 `JsonProperty`。这些是 .NET 或 Newtonsoft.Json API。命令行解析使用 `Environment.GetCommandLineArgs()`，也属于 .NET。

最高分仅在普通游戏结算时写入，保留已有值与本次分数中的较大值。回放读取自己的初始最高分，不读写玩家纪录；诊断模式通过 `--qa-dir` 指定独立存档位置。

## 9. 编辑器资源导入与场景准备

位置：[BuildProject.cs](./game/Assets/Editor/BuildProject.cs) 的 `Prepare()`。以下 API 在 Unity 编辑器中执行。

| API / 属性 | 本项目的用法 |
| --- | --- |
| `AssetDatabase.FindAssets()`、`GUIDToAssetPath()` | 在 `Assets/Resources/Content` 中查找纹理并取得资源路径。 |
| `AssetImporter.GetAtPath()`、`TextureImporter` | 获取纹理导入器，设置 Sprite 导入参数。 |
| `textureType = TextureImporterType.Sprite`、`spriteImportMode = SpriteImportMode.Single` | 将每张 PNG 导入为一个 Sprite。 |
| `spritePixelsPerUnit = 1`、`filterMode = FilterMode.Point` | 一单位对应一个像素，纹理使用最近邻采样。 |
| `mipmapEnabled = false`、`textureCompression = Uncompressed` | 关闭 mipmap 与纹理压缩。 |
| `wrapMode = TextureWrapMode.Clamp`、`npotScale = None` | 设置边界采样与非二次幂图片的导入尺寸策略。 |
| `alphaIsTransparency = false` | 关闭透明边缘颜色处理。 |
| `TextureImporterSettings`、`ReadTextureSettings()`、`SetTextureSettings()` | 将精灵网格设为 `SpriteMeshType.FullRect`，轴心设为 `(0.5, 0.5)`。 |
| `TextureImporter.SaveAndReimport()` | 应用设置并重新导入纹理。 |
| `AssetDatabase.LoadAssetAtPath<Material>()` | 读取已有精灵材质。 |
| `Shader.Find("Sprites/Default")`、`new Material(shader)`、`AssetDatabase.CreateAsset()` | 材质缺失时创建并保存默认 Sprite 材质。 |
| `EditorSceneManager.NewScene()`、`NewSceneSetup.EmptyScene`、`NewSceneMode.Single` | 主场景缺失时创建空场景，并添加 `FlappyGame` 入口。 |
| `EditorSceneManager.SaveScene()`、`OpenScene()` | 保存首次创建的场景，并打开 Main 场景。 |
| `EditorBuildSettings.scenes`、`EditorBuildSettingsScene` | 将 Main 场景设为启用的构建场景。 |
| `AssetDatabase.SaveAssets()` | 保存资源修改。 |
| `SerializedObject`、`FindProperty()`、`ApplyModifiedPropertiesWithoutUndo()` | 修改 Player 设置里的序列化字段 `activeInputHandler = 1`，选择 Input System；该字段名是当前实现直接访问的编辑器设置。 |

`Prepare()` 会更新导入和 Player 设置，但仅在场景文件不存在时新建场景。运行时加载的是这些资源的导入结果。

## 10. Player 设置、构建与命令行

位置：[BuildProject.cs](./game/Assets/Editor/BuildProject.cs) 和 [tools/project.ts](./tools/project.ts)。

| API / 属性 | 本项目的用法 |
| --- | --- |
| `PlayerSettings.companyName`、`productName`、`SetApplicationIdentifier()` | 设置产品信息与桌面应用标识。 |
| `defaultScreenWidth`、`defaultScreenHeight`、`fullScreenMode`、`resizableWindow` | 设置 1024 × 768 初始窗口，使用可调整大小的窗口模式。 |
| `PlayerSettings.runInBackground`、`colorSpace = ColorSpace.Gamma` | 设置后台运行与颜色空间。 |
| `SetScriptingBackend()`、`NamedBuildTarget` | Standalone 使用 `Mono2x`，WebGL 使用 `IL2CPP`。 |
| `SetApiCompatibilityLevel(..., ApiCompatibilityLevel.NET_Standard)` | 为对应构建目标选择 .NET Standard API 兼容级别。 |
| `SetUseDefaultGraphicsAPIs()`、`SetGraphicsAPIs()` | macOS 目标显式使用 `GraphicsDeviceType.Metal`。 |
| `SetArchitecture(NamedBuildTarget.Standalone, 2)` | macOS 构建使用当前设置中的 Universal 架构值。 |
| `QualitySettings.antiAliasing = 0`、`vSyncCount = 0` | 设置当前画质档的抗锯齿与垂直同步选项。 |
| `BuildPipeline.BuildPlayer()`、`BuildPlayerOptions` | 指定 Main 场景、输出路径、目标平台和 `BuildOptions.None`，构建 macOS 或 Web。 |
| `BuildTarget.StandaloneOSX`、`BuildTarget.WebGL` | 项目实际使用的两个构建目标。 |
| `BuildReport.summary.result`、`BuildResult.Succeeded` | 检查构建是否成功；失败时由项目抛出异常。 |
| `BuildReport.summary.totalSize` | 记录构建报告中的产物大小。 |
| `EditorApplication.EnterPlaymode()` | `Check()` 准备工程后进入 Play Mode，运行场景验收。 |

Web 构建额外设置：

| API / 配置 | 本项目的用法 |
| --- | --- |
| `PlayerSettings.SetManagedStrippingLevel(..., ManagedStrippingLevel.Minimal)` | 为 Web 设置托管代码裁剪级别。 |
| `PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Gzip` | 设置输出压缩格式。 |
| `PlayerSettings.WebGL.decompressionFallback = true` | 启用 JavaScript 解压回退。 |
| `PlayerSettings.WebGL.threadsSupport = false` | 使用单线程 Web 构建。 |
| `PlayerSettings.WebGL.template = "PROJECT:FlappyX"` | 选择复制进工程的自定义 Web 模板。 |
| `link.xml` 的 `<assembly fullname="Assembly-CSharp" preserve="all" />` | 保留项目程序集成员，供 Newtonsoft.Json 反射解析与输出。来源为 [web/link.xml](./web/link.xml)。 |

工具脚本调用的 Unity 命令行参数：

| 参数 | 本项目的用法 |
| --- | --- |
| `-projectPath <path>` | 指定桌面工程或 Web 构建副本。 |
| `-batchmode -nographics` | 执行无图形界面的准备、构建或场景逻辑检查。 |
| `-executeMethod BuildProject.<method>` | 调用项目定义的编辑器静态方法 `Prepare`、`Build`、`BuildWeb` 或 `Check`。 |
| `-logFile <path>` | 将编辑器或 Player 日志写入指定文件。 |
| `-quit` | 准备或构建完成后退出；Play Mode 验收不传此参数，由验收代码退出。 |
| `-buildTarget WebGL` | Web 构建进程选择 WebGL 目标。 |
| `-openfile <scene>` | 打开编辑器时指定 Main 场景。 |

`--web-output`、`--qa`、`--qa-dir`、`--capture`、`--watch` 是项目自己解析的参数。Bun 的进程启动、文件同步、独立 Web 工程副本与签名校验属于构建工具，不是 Unity API。

## 11. Web 模板与持久化

位置：[web/template/index.html](./web/template/index.html)。构建工具将模板复制到 Web 副本的 `Assets/WebGLTemplates/FlappyX/`。

| Unity Web 接口 / 配置 | 本项目的用法 |
| --- | --- |
| `createUnityInstance(canvas, config, onProgress)` | Unity loader 加载后，在目标 canvas 中创建 Player，并更新加载进度。 |
| `dataUrl`、`frameworkUrl`、`codeUrl` | 指向构建的数据、JavaScript 框架和 Wasm 文件。 |
| `streamingAssetsUrl` | 设置 StreamingAssets 的访问路径。 |
| `companyName`、`productName`、`productVersion` | 接收构建时替换的产品信息。 |
| `autoSyncPersistentDataPath: true` | 自动把 Web 虚拟文件系统中的持久化目录同步到 IndexedDB，使 `best.json` 能在刷新后读取。 |
| `devicePixelRatio` | 模板传入浏览器像素比与 2 中的较小值。 |
| `showBanner(message, type)` | 用项目加载界面显示错误，其他信息写到浏览器控制台。 |
| `{{{ LOADER_FILENAME }}}`、`DATA_FILENAME`、`FRAMEWORK_FILENAME`、`CODE_FILENAME` 等 | Unity 构建模板宏，生成页面时替换为实际文件名。 |

加载进度条、DOM 元素创建、`canvas.focus()`、`pointerdown` 监听和 CSS 属于浏览器代码。游戏内的文字和按钮仍由 Unity uGUI 显示。

Web 字体由构建工具复制到 `Assets/Resources/Fonts/FlappyUI.otf`，字体加载 API 见第 6 节。完整构建、预览与部署说明见 [README.md](./README.md)。

## 12. 输入注入、截图与验收 API

位置：[QaRunner.cs](./game/Assets/Scripts/QaRunner.cs)。这些接口用于显式诊断模式，不参与普通玩法。

| API / 类型 | 验收用途 |
| --- | --- |
| `InputSystem.settings.updateMode`、`ProcessEventsManually` | 验收时手动推进输入事件处理。 |
| `InputSystem.settings.backgroundBehavior`、`IgnoreFocus` | 让批处理验收不依赖窗口焦点。 |
| `editorInputBehaviorInPlayMode`、`AllDeviceInputAlwaysGoesToGameView` | 编辑器验收中把设备输入送到 Game View 路径。 |
| `InputSystem.AddDevice<Keyboard>()`、`AddDevice<Mouse>()`、`AddDevice<Touchscreen>()` | 创建验收专用的虚拟输入设备。 |
| `InputSystem.QueueStateEvent()` | 排队键盘、鼠标和触摸状态事件。 |
| `KeyboardState`、`MouseState.WithButton()`、`TouchState` | 构造按键、主/次鼠标键和触摸开始事件。 |
| `InputSystem.Update()` | 处理已排队的事件，随后调用项目的 `CollectInput()`。 |
| `InputSystem.RemoveDevice()` | 移除验收创建的虚拟设备。 |
| `Camera.WorldToScreenPoint()` | 将游戏世界中的测试位置转换为屏幕输入坐标。 |
| `Button.onClick.Invoke()` | 直接验证继续和重开回调；这一项不等于模拟真实鼠标点击。 |
| `GetComponentsInChildren<SpriteRenderer>()` | 检查多次重开后仍为 35 个游戏精灵。 |
| `new WaitForEndOfFrame()` | 截图协程等待本帧绘制完成。 |
| `ScreenCapture.CaptureScreenshotAsTexture()` | 将屏幕画面读取为 Texture2D。 |
| `Texture2D.EncodeToPNG()` | 编码截图，再由 .NET 文件 API 写入 PNG。 |
| `UnityEngine.Object.Destroy(image)` | 释放临时截图纹理对象；这是运行时对象释放。 |
| `Debug.Log()`、`Debug.LogException()` | 输出验收成功信息或异常。 |
| `EditorApplication.Exit(code)`、`Application.Quit(code)` | 分别在编辑器和独立 Player 中按验收结果退出。 |

`Diagnostics()`、`ManualMode`、`Content.Write()`、回放快照与断言属于项目代码。自动验收验证 Input System 事件路径；真实键鼠操作、手机触摸和具体发布环境的验证范围见 [README.md](./README.md) 与 [Unity 验收记录](../docs/m5-unity.md)。

## 13. Unity 与共享代码的职责

| 功能 | 当前实现 |
| --- | --- |
| 场景生命周期、逐帧回调、相机与窗口适配 | Unity 的 MonoBehaviour、Camera 和 Screen。 |
| 重力、拍翅、碰撞、计分、水管回收、游戏状态 | [共享 `Game`](../shared/core-csharp/Game.cs)。 |
| 30 Hz 固定步长、补 tick、暂停和恢复 | [共享 `FixedClock`](../shared/core-csharp/FixedClock.cs)。 |
| 图片加载、位置、拉伸、倾角与换帧 | `SpriteView` 使用 Resources、SpriteRenderer 和 Transform。 |
| 分数、菜单、面板与按钮 | `GameUi` 使用 Canvas 和 uGUI。 |
| 键盘、鼠标、触摸与 UI 命中 | Input System、EventSystem 和 GraphicRaycaster。 |
| 配置、存档与诊断 JSON | `Content`、`BestScoreStore` 使用 Newtonsoft.Json；文件读写使用 .NET。 |
| 发布与场景验收入口 | Unity 编辑器 API、Input System 测试接口及项目 Bun 脚本。 |

维护本文时，以游戏脚本、主场景、编辑器构建脚本和 Web 模板的实际调用为准；新增或移除 Unity API 时同步更新对应条目。
