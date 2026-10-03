# Godot C# Flappy Bird

Godot 4.7.2 .NET，独立桌面工程位于 `game/`。共享内核使用 C# 9 / .NET Standard 2.1；Godot 场景和 JSON 适配使用 .NET 10。

## 启动

在仓库根目录执行：

```sh
just godot          # 构建并运行游戏
just editor-godot   # 构建、导入并打开编辑器；F5 运行项目
just check-godot    # TS/C# 对照、编译、原生场景与渲染契约检查
just export-godot   # 发布并验收 godot/build/FlappyX.app
```

本机使用 `/Applications/Godot_mono.app/Contents/MacOS/Godot`、.NET SDK 10.0.401 和 Bun 1.4.0。编辑器安装位置不同时，通过 `GODOT_BIN` 指定可执行文件。首次运行需要还原 .NET 包；无独立 npm 依赖。

直接从编辑器打开 `game/project.godot` 前，先执行 `just assets-godot`。启动入口会同步九张 PNG、精灵元数据、玩法配置和回放，并生成指向本机 Godot SDK 包的 `NuGet.Config`。这些副本与 `.godot/`、包缓存、构建输出均不进入版本控制。

桌面导出需要安装 **4.7.2 .NET 导出模板**，可通过 Godot 的“编辑器 → 管理导出模板”安装[官方模板](https://godotengine.org/download/archive/4.7.2-stable/)。本机已安装其中的 `macos.zip`，无需重复下载。再次导出时，旧 `FlappyX.app` 会先移入系统回收站。

导出预设使用本机 `/usr/bin/codesign` 做 ad-hoc 签名，随后检查签名并直接运行应用内的隔离验收。产物包含 ARM64、x86_64 和各自的 .NET 运行时，当前实机验证平台为 Apple Silicon；这是本机使用的构建，未做 Apple 公证。

## 操作与存档

- 空格、鼠标主键或主触摸拍翅；键盘自动重复被忽略，同 tick 多次输入合并。
- 碰撞后落地结算，保护期结束后点“重新开始”。重开只回到准备状态。
- 失焦或最小化时暂停，回到窗口后点“继续”。Escape 或右上角按钮也可暂停。
- “基准回放”自动播放当前 `easyV1` 的 210 tick 用例；“回放最高”属于该次回放，点“返回游戏”恢复玩家纪录。

玩家最高分保存在 Godot 独立目录 `~/Library/Application Support/FlappyX/Godot/best.json`，只在普通游戏结算时写入，并保留较大值。回放不读写玩家存档。

## 共享边界

`shared/core-csharp` 只负责 double 数值逻辑、状态、事件、随机序列和固定时钟，无 Godot API 或 JSON 依赖；后续 Unity 可引用其源码或程序集。`shared/contract-csharp` 负责 JSON 边界和对照数据导出。

`Scripts/FlappyGame.cs` 负责输入、主循环和原生 Control UI；`SpriteView.cs` 使用 Sprite2D 和中心锚点绘制 35 个精灵。水管身体按开口边界拉伸，所有精灵最近邻采样、无 mipmap；导入关闭预乘和透明边界改色。逻辑坐标直接使用左上原点，渲染读取 `roundPixels`，不修改内核位置。

窗口使用 `canvas_items` / `keep`，逻辑区域固定为 1024×768。原生留边区域必须落在整数像素上，因此 390×844 窗口内的画面为 390×292，理想高度 292.5 的差额不足 1 像素；输入会忽略留边区域。

## 验收入口

`just check-godot` 先比较 TS/C# 的完整快照和事件，再启动实际 Godot 场景。Godot 检查使用 `Input.ParseInputEvent` 验证输入分发，覆盖回放、暂停、补 tick、十次重开、存档隔离、鸟帧、取整与接缝。它使用 `godot/.checks/native/best.json`，不会清空玩家纪录。

GUI 截图和观察模式可单独运行：

```sh
/Applications/Godot_mono.app/Contents/MacOS/Godot --path godot/game -- --qa-dir=/绝对路径/隔离目录 --capture
/Applications/Godot_mono.app/Contents/MacOS/Godot --path godot/game -- --qa-dir=/绝对路径/隔离目录 --watch
```

`--capture` 保存 tick 0、134、184、191 的 PNG 和场景数据后退出；`--watch` 只把状态写到隔离目录的 `live.json`，便于核对真实桌面操作。完整记录见 [M6 验收](../docs/m6-godot.md)。
