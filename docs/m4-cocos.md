# M4 Cocos Creator 版

完成日期：2026-10-02（东八区）。独立 Creator 3.8.8 工程位于 `cocos/game/`，沿用冻结的 `phaser-v1`，共享配置和 fixtures 未改。

Cocos 已完成准备、起飞、过管计分、死亡、结算、重开、最高分、暂停恢复与等比缩放。编辑器打开 Boot 场景后，实际浏览器预览从 tick 0 到 150 对照共享内核全部字段；Web Desktop Release 则通过真实更新循环和自动回放验收。启动与复现命令见 [Cocos README](../cocos/README.md)。

## 共享源与工程入口

本机使用 Creator 3.8.8、Bun 1.4.0、TypeScript 5.9.3、Playwright Core 1.62.1 和 macOS Chrome 154.0.8037.93。依赖固定在 `cocos/game/bun.lock`，CrossGameEngine 与 ejoy2d 仍为只读参考。

| 文件 | 责任 |
| --- | --- |
| [sync-shared.ts](../cocos/game/scripts/sync-shared.ts) | 启动、构建前同步共享源码、JSON 和九张 PNG，生成稳定 UUID 的导入元数据，逐文件校验 SHA-256 |
| [Boot.scene](../cocos/game/assets/scenes/Boot.scene) | Canvas、正交 UI 相机与 FlappyBird 组件入口 |
| [FlappyBird.ts](../cocos/game/assets/scripts/FlappyBird.ts) | 输入合并、固定时钟、暂停、存档与回放 |
| [FlightRenderer.ts](../cocos/game/assets/scripts/FlightRenderer.ts) | 原生 Sprite、坐标转换、拼接和显示规则 |
| [FlightUI.ts](../cocos/game/assets/scripts/FlightUI.ts) | 原生 Label、Graphics、Button，显示准备、暂停与结算 |
| [发布模板](../cocos/game/build-templates/web-desktop/index.ejs) | 让 Creator 读取浏览器窗口尺寸，CSS 保持画布与像素比例一致 |

Creator 的资源数据库从工程 `assets` 导入脚本。同步器把共享源复制到 `assets/scripts/shared`，游戏、时钟、导出入口和存档实现均保持字节相同。`config.ts` 只将 JSON import 地址改为生成的 TS 模块；三个 JSON 模块用原始内容生成 `export default`，保持数据不变。派生文件不进入版本管理，元数据和 Boot 场景由本工程维护。

每次同步核对 17 个文件，并在 `temp/shared-sync.json` 写入源与目标哈希。测试另行运行共享源及导入副本的 Game，比较 151 个完整快照，同时核对配置、精灵元数据、fixture 和所有文件哈希。`just check-m4` 通过五项测试、804 个断言、无 DOM 内核与 Creator 类型检查，以及退出码 36 的 Release 构建；[官方命令行文档](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-in-command-line.html)规定 36 表示构建成功，构建脚本还确认发布入口存在。

## 场景适配

逻辑范围保持 1024×768。Canvas 子节点以中心为原点，因此 Sprite 的本地位置为 `(logicalX - 512, 384 - logicalY)`，视觉倾角取负值，碰撞仍由共享内核判断。`render.roundPixels` 仅控制显示中心是否取整，默认 false，tick 134 的鸟保留 y=240.5。鸟显示尺寸为 85×60，ready 首帧覆盖 tick 0–2，飞行首帧覆盖 flightTicks 1–3。

九图使用完整未裁切 SpriteFrame、中心锚点、最近邻放大/缩小和无 mipmap；关闭动态合图，保持源资源方向与透明边缘。绘制顺序为天空→水管→地面→鸟→UI。天空与地面各三块，七组水管各四块，加一只鸟共 35 个 Sprite。换帧、移动、回收和重开复用现有节点；水管身体用开口边界计算高度，顶部接到 y=0，底部接到地面 y=544。

场景使用 SHOW_ALL，并用 1024×768 的矩形 Mask 限制平铺图块的显示范围。发布入口在引擎基础初始化后将 `screen.exactFitScreen` 设为 true，启用浏览器尺寸变化监听；Creator 3.8 读取 settings，旧 HTML 属性本身不能控制它。缩放检查同时核对逻辑视口 4:3、等比尺度，以及 Canvas 的 CSS/像素比例，避免只读到正确逻辑视口却把图像拉伸。宽屏与竖屏截图均作了目视检查。

Creator 的浏览器设备预览保留加载时的容器尺寸。本次预览选择「网页全屏」，改变窗口大小后重新加载，再检查新尺寸；独立 Release 页则在同一页面连续调整窗口，无需重新加载。预览时直接缩小现有窗口可能裁切旧容器，应刷新预览。

输入最多每 tick 消费一次 flap。Creator 会把鼠标各键合成为触摸，因此适配层在 Canvas 捕获阶段过滤非主键，并关闭画布右键菜单。触摸只接受当前第一根手指，键盘忽略重复和页面表单输入；Canvas 键盘事件会被 Creator 在冒泡阶段消费，适配层改用窗口捕获监听。原生 Button 的 CLICK 事件负责开始、继续与重开，触摸不会穿透到拍翅操作。

更新使用 `performance.now()` 的真实时间差，交给共享 FixedClock；最多补五 tick，暂停和恢复清掉输入与累积时间。失焦、页面隐藏或 Creator EVENT_HIDE 都暂停；回到前台仍需手动继续，结算页失焦也遵守同一条规则。

最高分复用共享存档实现，键为 `flappyx:cocos:best`，数据仍为 `schemaVersion`、`bestScore`。普通结算写盘；基准回放从 bestScore=0 开局，只显示「回放最高」，不读写玩家纪录。Release 提供只读快照供引擎对照；修改状态的接口仅在 DEBUG 预览 `?test=1` 中提供。

## 实际验收证据

[editor-check.json](./baselines/cocos/editor-check.json)与[编辑器截图](./baselines/cocos/editor.png)核实实际 Creator 版本、工程路径、资源数据库就绪、Boot 场景、脚本 UUID 和 1024×768 设计分辨率。游戏通过 Creator 自带服务器进行[官方浏览器预览](https://docs.cocos.com/creator/3.8/manual/zh/editor/preview/)，本机端口为 7456；这次未验收原生模拟器或嵌入式编辑器预览。

| 验收 | 结果与证据 |
| --- | --- |
| 全轨迹 | [browser-check.json](./baselines/cocos/browser-check.json)：tick 0–150 的全部模型字段与共享内核一致，包括七管 ID/顺序/通过标记 |
| 关键事件 | 118 得分；134 上管碰撞，y=240.5、v=0；141 落地，y=514；150 最终一分 |
| 渲染契约 | 每 tick 核对鸟帧、显示位置、85×60 尺寸和真实 sampler；逐管核对头身接缝及地面边界 |
| 输入与节奏 | 主键/空格有效，非主键及自动重复忽略，多来源同 tick 合并；340 ms 只补五 tick、保留 0.2 tick |
| 暂停 | 清掉排队输入；恢复不拍翅；Release 真实切换窗口后仍暂停，250 ms 后画面相同 |
| 重开 | 十局后仍为七组水管、35 个 Sprite，返回 ready/tick=0，已有最高分 7 保留 |
| Release | [production-check.json](./baselines/cocos/production-check.json)：原生按钮闭环、Canvas 聚焦后的真实空格、实际自动回放、无修改接口与控制台错误 |
| 存档隔离 | 隔离 context 预置 7，回放界面最高变为 1，前后玩家存档字符串相同，返回普通游戏恢复 7 |
| 进程重启 | [persistence-check.json](./baselines/cocos/persistence-check.json)：Release 普通随机局通过实际更新和输入得一分，正常关闭独立 Chrome 并重启同一 profile 后仍读取一分 |
| 缩放 | 1024×768、1280×720、390×844 窗口下模型位置不变，4:3 显示留边，Canvas 不拉伸、不越界；编辑器网页全屏预览在各尺寸重载，Release 连续 resize |

`ready.png`、`tick-118.png`、`tick-134.png`、`tick-141.png` 为编辑器预览画布；`release-tick-118.png`、`release-tick-134.png`、`release-tick-141.png` 为独立发布页。同局面的鸟、水管、背景与地面已与 Phaser/Three.js 图像抽查对照，渲染器可以有边缘采样差异，玩法以快照为准。

缩放截图为[Release 宽屏](./baselines/cocos/release-wide.png)、[Release 竖屏](./baselines/cocos/release-portrait.png)、[预览宽屏](./baselines/cocos/wide.png)、[预览竖屏](./baselines/cocos/portrait.png)。测试使用专用 Chrome profile；结束后正常退出并移入系统回收站。

本次范围是 macOS Creator 和桌面 Chrome，未在手机、Safari、Firefox 或 Cocos 原生平台运行。素材包继续没有音效；Unity、Godot 与最终五引擎汇总仍待后续阶段。
