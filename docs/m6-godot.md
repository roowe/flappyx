# M6：Godot C# 版

验收日期：2026-10-03。Godot C# 版已完成本机可玩闭环、跨语言对照和 macOS 发布导出。按用户要求，本阶段先于 Unity 实施；纯 C# 内核已独立出来，供后续 Unity 复用。

## 运行与工程边界

在仓库根目录执行：

```sh
just godot          # 构建、导入并运行
just editor-godot   # 打开编辑器，F5 运行项目
just check-godot    # TS/C# 对照与真实 Godot 场景检查
just export-godot   # 生成并验收 godot/build/FlappyX.app
```

详细操作和存档位置见 [Godot README](../godot/README.md)。本机环境为 Godot **4.7.2 .NET**、.NET SDK **10.0.401**、Bun **1.4.0**、Apple M4 Pro。渲染使用 GL Compatibility。

| 路径 | 职责 |
| --- | --- |
| `shared/core-csharp/` | C# 9 / .NET Standard 2.1；double 数值、状态机、事件、uint32 随机数及固定时钟，无引擎或 JSON 依赖 |
| `shared/contract-csharp/` | .NET 10 JSON 契约检查、fixture 执行和对照数据导出 |
| `godot/game/` | .NET 10 场景工程；Node2D、35 个 Sprite2D、Control UI、输入与本地存储 |
| `godot/tools/` | 共享文件同步、构建与导出、TS/C# 和原生场景结果比较 |

构建前同步九张 PNG、精灵元数据、玩法配置及回放，共 12 个文件；共享源是唯一编辑入口。Godot 通过项目引用编译 C# 内核，JSON 适配以源文件链接复用。配置缺少所需字段、规则顺序不支持或几何参数无效时，加载直接报错。

当前配置仍为 `easyV1`，SHA-256 为 `06e77fe3bdaff75b34f20d41d4efc5ae8502e4b3f77154357fab60744e52312d`。基准回放为 210 tick：158 得分、184 撞上管、191 落地到 y=514，最终 1 分。M2–M4 的旧 150 tick 记录属于历史基线。

## 场景与输入契约

逻辑坐标直接沿用左上原点、y 向下，精灵按中心定位；水管身体根据开口边界拉伸，天空和地面各保留三块循环图。最近邻采样、无 mipmap，关闭导入时的预乘及透明边缘改色。飞行首张鸟帧按 `flightTicks - 1` 计算，覆盖第 1–3 tick。

`roundPixels` 只控制显示中心，不改变 double 逻辑位置。验收同时锁定逻辑 y=240.5，以及开关关闭时显示 240.5、开启时显示 241。

空格、鼠标主键及主触摸输入合并为每 tick 一次 flap；忽略自动重复、次键、次触摸和留边区域。引擎的触摸/鼠标相互合成关闭，Control 按钮阻断玩法输入。重开只回到 ready；失焦暂停，恢复窗口后必须明确继续。固定时钟最多补五个 tick，暂停或恢复清空积累时间。

普通游戏最高分保存到 `~/Library/Application Support/FlappyX/Godot/best.json`，结算时保留较大值。非法存档读取时显示警告，以 0 分启动，读取过程保留原文件；原生检查覆盖不支持的存档版本。回放独立显示“回放最高”，不读写玩家存档；返回游戏后恢复玩家纪录。所有自动检查都指定隔离目录，已有玩家存档不会被清空。

## 验收结果

| 检查 | 结果与证据 |
| --- | --- |
| 纯 C# 与 TS | **677 个完整快照及事件精确一致**，257 个 fixture 字段通过；涵盖轨迹、碰撞优先级、计分、偏移、回收、随机、暂停及补 tick；30/60/120 FPS 结果相同。[记录](./baselines/godot/core-check.json) |
| 开发原生场景 | tick 0–210 共 **211 个完整快照及鸟帧**与 TS 一致；检查全部七组水管头身/开口/地面接缝、四处平铺接缝、九张纹理和 35 个 Sprite。[记录](./baselines/godot/native-check.json) |
| 原生输入和状态 | 使用 Godot `Input.ParseInputEvent` 注入主键、次键、触摸、空格及重复输入；暂停清空、恢复、五 tick 上限、十次重开和对象数量通过。预置最高分 7，回放前后存档字节相同、返回普通游戏恢复 7。见原生场景记录。 |
| 开发窗口实际操作 | CUA 发送真实空格操作，普通随机局得到 **2 分**。[操作记录](./baselines/godot/desktop-play.json)；正常关闭并重启进程后仍读取 2 分。[重启记录](./baselines/godot/process-restart.json) |
| 窗口生命周期 | 真实最小化后暂停；恢复窗口仍停在 tick 7200，点继续后恢复。[记录](./baselines/godot/desktop-lifecycle.json) |
| 窗口缩放 | 1024×768 为 1:1；1280×720 比例 0.9375、左右留边各 160；390×844 保持逻辑范围、上下留边。[横向](./baselines/godot/window-1280x720.json)、[竖向](./baselines/godot/window-390x844.json) |
| 发布应用 | 实际 `.app` 再运行同一组原生检查，211 个快照与 TS 一致。[记录](./baselines/godot/export-check.json)；发布窗口真实空格操作得到 **2 分**并写入隔离存档。[操作记录](./baselines/godot/export-desktop-play.json) |
| 编辑器与构建 | C# 编译零警告、零错误；Godot headless 编辑器资源导入完成，GUI 编辑器已启动。开发游戏通过 CLI 独立窗口验证；没有把编辑器内嵌运行作为已验收项。 |

最终发布应用的 GUI 截图及对应场景数据位于 [captures](./baselines/godot/captures/)。已抽查 tick 134 与 184，鸟、水管方向、开口及地面拼接正常；不要求不同渲染器的半透明边缘逐像素相等。

| 准备 | 飞行 | 撞管 | 落地 |
| --- | --- | --- | --- |
| [tick 0](./baselines/godot/captures/tick-0.png) | [tick 134](./baselines/godot/captures/tick-134.png) | [tick 184](./baselines/godot/captures/tick-184.png) | [tick 191](./baselines/godot/captures/tick-191.png) |

## 导出与复现条件

本机已安装官方 4.7.2 .NET 模板中的 `macos.zip`，来源、校验和见 [模板记录](./baselines/godot/template-source.json)。其他机器需先安装同版本模板，见[官方版本下载](https://godotengine.org/download/archive/4.7.2-stable/)和[macOS 导出说明](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_for_macos.html)。

工程提交 `.sln` 及 Debug / ExportDebug / ExportRelease 配置，保证 Godot 的 C# 导出构建能定位项目；导出包含 Content JSON，ARM 纹理导入启用 ETC2/ASTC。发布应用包含 ARM64、x86_64 及对应 .NET 运行时，约 335 MB。

签名预设选择系统 `/usr/bin/codesign`、身份 `-`，使用 ad-hoc 签名。导出入口检查退出码和 Godot `ERROR:` 日志，再执行 `codesign --verify --deep --strict`，最后启动发布应用进行隔离验收。仅退出码 0 不足以判定 Godot C# 导出成功。重复导出时旧应用先移入系统回收站。[构建记录](./baselines/godot/export-build.json)

实际硬件验收为 ARM64；Intel、移动触摸硬件及 Apple 公证未在本阶段验证。触摸结论限于 Godot 输入事件路径。390×844 下物理视口被 Godot 取为 390×292，理想高度为 292.5，因此纵横比例存在不足 1 像素的舍入差；逻辑画布、碰撞与回放保持不变。
