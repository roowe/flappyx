# Unity C# Flappy Bird

Unity **6000.5.6f1**，工程位于 `game/`。复用 `shared/core-csharp` 的 C# 9 / .NET Standard 2.1 内核；使用 Built-in 渲染、正交相机、SpriteRenderer、uGUI 和 Input System。

## 启动

在仓库根目录执行：

```sh
just unity          # 构建并运行独立 macOS 游戏
just editor-unity   # 同步、导入并打开 Main 场景，点击 Play 运行
just check-unity    # TS/C# 对照及 Unity 编辑器 Play Mode 场景验收
just export-unity   # 构建并验收 u3d/build/FlappyX.app
```

入口使用 Bun，本机编辑器默认路径为 `/Applications/Unity/Hub/Editor/6000.5.6f1/Unity.app/Contents/MacOS/Unity`，可通过 `UNITY_BIN` 指定其他安装位置。需要 Unity 的有效本机许可证与 Mac Build Support。构建命令需要独占该工程；如果它已在编辑器打开，先保存并关闭该工程窗口。

首次导入使用官方包 Input System 1.20.0、Newtonsoft JSON 3.2.2、uGUI 2.5.0。`just assets-unity` 仅同步三个共享 C# 文件、九张 PNG 和三个 JSON；直接从 Unity Hub 打开前应先同步。构建/编辑器入口还会设置 PNG 导入、Player 设置及 Main 场景。生成的共享副本和 Library、Logs、构建缓存不进入版本控制。

`Assets/Editor/BuildProject.cs` 使用 Unity BuildPipeline 构建 macOS Universal、Mono 后端。再次导出时，旧应用先移入系统回收站；发布入口检查签名并实际启动应用执行隔离验收。

## 操作

- 空格、鼠标主键、主触摸拍翅，同一 tick 多次输入合并；按住空格不会连发。
- UI 按钮阻断玩法输入，窗口留边不触发拍翅。重开只回到准备界面。
- 窗口失焦暂停，回到前台后点击“继续”；Escape 或右上角按钮也可暂停。
- “基准回放”播放当前 easyV1 的 210 tick 用例，界面显示“回放最高”；点“返回游戏”恢复玩家纪录。

普通最高分使用 Unity 独立目录 `Application.persistentDataPath/best.json`，macOS 通常为 `~/Library/Application Support/FlappyX/FlappyX Unity/best.json`。只在普通游戏结算时保存，并保留较大值；回放不读写玩家存档。无效存档会显示警告，读取过程保留原文件。

## 共享与渲染

纯 C# 内核与 Godot 使用同一份源码，数值为 double；JSON 与 Unity API 位于适配层。逻辑仍为左上原点，渲染时转成 `worldY = 768 - logicalY`，倾角符号反转。水管身体按开口上下边界拉伸，背景和地面按中心定位循环平铺。

九张纹理采用 Point 采样、无 mipmap、无压缩、关闭透明边缘改色。35 个 SpriteRenderer 持续复用；飞行首帧为 flightTicks 1–3。`render.roundPixels` 仅作用于显示坐标。

世界空间 Canvas 与游戏使用同一台正交相机。相机视口按 1024×768 等比适配，额外相机绘制留边；缩放不改变玩法范围。

## 验收与截图

`just check-unity` 先执行共享 C#/TS 验收，再在 Unity Play Mode 内运行场景用例。Input System 测试使用虚拟设备注入，批处理下显式接收事件；真实窗口操作另行记录。预置 7 分的隔离存档位于 `u3d/.checks/editor/`，发布检查使用 `u3d/.checks/export/`。

发布应用支持显式诊断参数：

```sh
"u3d/build/FlappyX.app/Contents/MacOS/FlappyX Unity" --qa-dir=/绝对路径/隔离目录 --capture
"u3d/build/FlappyX.app/Contents/MacOS/FlappyX Unity" --qa-dir=/绝对路径/隔离目录 --watch
```

`--capture` 保存 tick 0、134、184、191 的 PNG 与场景数据后退出；`--watch` 写入实时 `live.json`，便于核对真实键鼠、窗口及进程重启。

已完成 macOS ARM64 实机验收；应用同时包含 x86_64，但未在 Intel 硬件上运行。触摸测试限于 Input System 事件注入，未验证移动设备。构建约 106 MB，使用本机 ad-hoc 签名，未做 Apple 公证。完整结果见 [M5 验收记录](../docs/m5-unity.md)。
