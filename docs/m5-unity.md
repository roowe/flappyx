# M5：Unity C# 版

验收日期：2026-10-03。Unity 版已完成可玩闭环、编辑器 Play Mode 验收及 macOS 发布构建。直接复用 M6 建立的纯 C# 内核，当前 easyV1 配置和 fixtures 保持不变。

## 入口与实现

```sh
just unity          # 构建并运行独立游戏
just editor-unity   # 打开 Main 场景，点击 Play
just check-unity    # 跨语言对照和编辑器 Play Mode 验收
just export-unity   # 构建并验收 u3d/build/FlappyX.app
```

工程位于 `u3d/game/`，运行说明见 [README](../u3d/README.md)。本机使用 Unity **6000.5.6f1**、Bun **1.4.0**，发布目标为 macOS Universal、Mono / .NET Standard 2.1。实际硬件为 Apple M4 Pro，使用 Metal。

三个共享 C# 源文件在启动和构建前逐字节同步到 `Assets/Shared/`；配置、回放、精灵元数据和九张 PNG 同步到 `Assets/Resources/Content/`。这些派生副本被 Git 忽略，修改入口仍是 `shared/`。JSON 边界使用 Unity 官方 Newtonsoft JSON 包，输入使用 Input System，界面使用 uGUI。

`BuildProject.Prepare` 设置 Point 采样、无 mipmap、无压缩、中心锚点、完整矩形网格，并关闭透明边缘改色。Main 场景引用统一 Sprite 材质；35 个 SpriteRenderer 在运行时建立并持续复用，七组水管不会随重开累积。

正交相机使用 1024×768 逻辑画布，显示层转换 `worldY = 768 - logicalY`，倾角取反。世界空间 Canvas 与玩法使用同一相机，额外相机填充留边。水管身体根据开口边界拉伸，地面和天空使用中心位置平铺。

飞行首帧覆盖 flightTicks 1–3；`roundPixels` 开关只改显示位置，240.5 可切换为 241，模型保持 240.5。数值计算继续使用 double，30 Hz 固定时钟最多补五个 tick。

## 原生验收

| 检查 | 结果与证据 |
| --- | --- |
| TS / C# 内核 | **677 个完整快照及事件精确一致**，257 个 fixture 字段通过，30/60/120 FPS 结果相同；包括碰撞、计分、偏移、随机、回收、暂停、补 tick 和重开。[记录](./baselines/unity/core-check.json) |
| 编辑器 Play Mode | Unity 实际编译共享源码并运行 Main 场景，tick 0–210 共 **211 个快照及鸟帧**与 TS 一致。[记录](./baselines/unity/editor-check.json)；另从 GUI 编辑器通过 Command-P 进入 Play，实际看到准备画面。[入口记录](./baselines/unity/editor-gui.json) |
| 发布应用 | 实际 `.app` 再执行同一组原生场景检查，211 个快照及鸟帧通过。[记录](./baselines/unity/export-check.json) |
| 输入与 UI 边界 | Input System 虚拟键盘、鼠标和触摸事件进入生产输入适配；主键/主触摸、重复按键、次键/次触摸、合并输入及视口外输入通过。测试配置显式接收批处理下的注入事件，普通游戏保留正常焦点规则。见编辑器与发布检查。 |
| 生命周期与存档 | 暂停冻结逻辑并清空待消费输入，继续清空时钟；预置 7 分，回放前后文件字节相同，返回游戏恢复 7。非法存档版本显示警告，读取不改文件。见原生检查。 |
| 渲染与对象复用 | 七组水管头身、开口和地面边界，四处背景/地面接缝通过；十次重开后仍为七管、35 个 SpriteRenderer、九张玩法纹理。见原生检查。 |

当前回放为 **158 得分、184 撞上管、191 落地、最终 1 分**。所有场景快照均由实际内核逐 tick 执行，未用闭式公式代替引擎结果。

## 实际窗口操作

以下检查使用发布应用的可见窗口和 CUA 原生输入，存档始终隔离于玩家目录。

| 操作 | 结果与证据 |
| --- | --- |
| 真实空格飞行 | 按约 800 ms 间隔发送九次空格，普通随机局得到 **2 分**，落地后最高分写为 2。[记录](./baselines/unity/desktop-play.json) |
| 正常关闭并重启 | 关闭窗口后重启应用，读取最高分 2。[记录](./baselines/unity/process-restart.json) |
| 真实失焦与恢复 | 最小化时停在 tick 106；通过系统 Window 菜单激活后重新获得焦点，仍暂停在同一 tick；点击继续后恢复 ready，没有误触起飞。[记录](./baselines/unity/desktop-lifecycle.json) |
| 回放与按钮 | 实际点击回放、暂停和继续，自动播放到 tick 210；回放显示 1，隔离玩家存档仍为 2，返回普通游戏恢复玩家纪录。[记录](./baselines/unity/desktop-replay.json) |
| 竖向按钮命中 | 390×844 下点击开始完成一局，点击重新开始回到 ready，flightTicks 为 0、最高分仍为 2。[记录](./baselines/unity/desktop-buttons.json) |
| 连续缩放 | 从 1024×768 拖动到 1280×720，再到 390×844；逻辑 y 和画布不变。横向相机视口为 x=160、960×720；竖向为 y=275.75、390×292.5。[横向记录](./baselines/unity/window-1280x720.json)、[竖向记录](./baselines/unity/window-390x844.json) |

窗口验收中，辅助功能的 Raise 只恢复可见状态，Unity 仍报告失焦、鼠标设备停用；通过 Window 菜单激活窗口后才获得焦点。这与普通暂停按钮的前台点击分别核对，未把仅恢复可见当作完成前台恢复。

发布应用通过真实 Metal 渲染生成四张 PNG，已查看飞行和结算画面，鸟、水管方向及地面拼接正常。截图与场景数据见 [captures](./baselines/unity/captures/)：

| 准备 | 飞行 | 撞管 | 落地 |
| --- | --- | --- | --- |
| [tick 0](./baselines/unity/captures/tick-0.png) | [tick 134](./baselines/unity/captures/tick-134.png) | [tick 184](./baselines/unity/captures/tick-184.png) | [tick 191](./baselines/unity/captures/tick-191.png) |

## 构建与限制

构建通过 Unity [BuildPipeline.BuildPlayer](https://docs.unity.com/en-us/engine/6000.0/script-reference/unityeditor/buildpipeline/buildplayer)，检查 BuildReport 成功后，再检查可执行文件、严格签名和发布场景结果。结果文件先写失败标记，防止读取上次检查的成功报告。重复构建时旧应用移入系统回收站。

产物约 **106 MB**，可执行文件包含 **x86_64、arm64**；通过 `codesign --verify --deep --strict`。[构建记录](./baselines/unity/export-build.json)。实机仅验证 ARM64，未验证 Intel 硬件、移动端触摸硬件或 WebGL 导出，未做 Apple 公证。

共享配置 SHA-256：`06e77fe3bdaff75b34f20d41d4efc5ae8502e4b3f77154357fab60744e52312d`。六个引擎的独立实现阶段已完成，统一验收表和统一启动整理仍留在 M7。
