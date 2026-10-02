# M2 Phaser 基准版

完成日期：2026-10-02（东八区）  
基准：`phaser-v1`；`gameplay.json.baselineStatus = frozenPhaserV1`。

Phaser 版已完成准备、起飞、过管计分、死亡下落、结算、重开、最高分、窗口缩放和暂停恢复。M1 的全部运动与碰撞数值保持不变，冻结为后续四个引擎的第一版基准。此处冻结的是可重复运行的实现基线；以后调整手感时，需同步共享配置、fixtures 和已接入引擎。

## 启动与实现边界

按 [Phaser README](../phaser/README.md) 安装独立工程。仓库根目录运行 `just phaser`，打开 <http://127.0.0.1:5174/>；`just check-m2` 执行真实 TS 内核测试、类型检查和生产构建，`just preview-phaser` 在 5175 端口预览构建。

本次实际环境为 Bun 1.4.0、TypeScript 5.9.3、Vite 7.3.1、Phaser 4.2.1、macOS Chrome 154.0.8037.93，版本由 `phaser/bun.lock` 固定。运行依赖和构建产物均位于 `phaser/`，Python 工具仍单独位于 `tools/`。

| 模块 | 责任 |
| --- | --- |
| [shared/core-ts](../shared/core-ts/index.ts) | 纯数值状态机、碰撞、计分、随机生成、七组队列、死亡与重开；无 Phaser、DOM 或 Bun 运行时依赖 |
| [FixedClock](../shared/core-ts/clock.ts) | 30 Hz 固定逻辑步长、最多补五个 tick、丢弃过量整 tick 并保留小数、暂停与清空积累 |
| [FlightScene](../phaser/src/scene.ts) | 加载共享 PNG、中心锚点布局、固定渲染对象、统一输入、实际 RAF 时间差、生命周期与 UI |
| [BestScoreStore](../shared/web-ts/storage.ts) | 浏览器 localStorage 的共享存档字段、读取校验与保存结果提示；由 Phaser 指定独立存档键 |

独立内核的 tsconfig 只包含 ES2022，类型检查不引入 DOM 或引擎类型。Phaser 直接引用共享配置、精灵元数据和 PNG；Vite 将资源纳入产物，无引擎目录里的手工资源副本。构建不清空 `dist/`，同名产物覆盖写入。

M3 接入时，浏览器 DOM 节点、样式和存档实现提取到 `shared/web-ts/`，供两个 Web 版本共用；Phaser 的存档键、入口及基准行为保持一致，开发与生产浏览器回归检查均通过。

## 冻结的运动与显示

逻辑画布为 1024×768，鸟 x=350，初始 y=464，显示 85×60，碰撞盒 64×44。首次 flap 同时进入 playing 并把速度覆盖为 -13.5；每 tick 先位移再加重力 1.5。水管/地面每 tick 向左 8，天空向左 2；开口高 200，水管宽 75，中心间距 265。

地面、顶部、上管、下管按此顺序判碰撞，死亡先于计分。撞管/顶部当帧速度清零，下一 tick 才执行死亡重力 15；撞地面当帧进入 gameOver，夹到 y=514。计分使用碰撞盒左边缘 318，水管右边缘严格小于该线才加分。七组水管右边缘严格小于 0 后复用，保留对象 ID，消费一个新高度；普通局使用配置的非零固定种子，重开恢复同一种子，便于重复练习与对照。

身体高度直接由开口和边界求得，上方为 `gapTop - headHeight`，下方为 `544 - gapBottom - headHeight`；水管头保持 75×50。天空、地面按自身显示宽度连续铺三块，所有精灵位置使用中心锚点。鸟动画为 1→2→3→2，每帧三 tick；ready 首帧覆盖 tick 0–2，起飞首帧覆盖 flightTicks 1–3，之后每三 tick 换帧，死亡后冻结。飞行/死亡时视觉倾角为 `clamp(velocityY × 3, -20, 65)` 度，ready 为 0 度。倾角参数已写入 `render.birdTilt`，不参与碰撞。

显示坐标保留逻辑小数，`render.roundPixels = false`；例如 tick 134 的鸟中心仍为 y=240.5。Phaser 的 `pixelArt` 会强制取整，因此关闭该快捷选项，并用 `antialias = false`、`antialiasGL = false` 保持最近邻采样。验收读取实际游戏与相机的取整设置及鸟纹理过滤模式。后续引擎也应保留小数坐标；各渲染器的栅格化细节仍可能有像素差异。

每帧显示最近完成的逻辑状态，不额外插值。失焦后逻辑和动画冻结，回前台仍暂停；点击继续清空积累与待消费 flap。恢复和重开按钮不同时起飞。图片完成加载前开始按钮禁用，鼠标与触摸只接收 Pointer Events，空格忽略自动重复，多个输入合并成下一 tick 的一次 flap。

## TS 契约验证

[contract.test.ts](../shared/core-ts/contract.test.ts) 通过真实 TS 内核执行 M1 数据。M2 验收时五项 Bun 测试、605 个断言全部通过，涵盖全部快照、状态/速度/分数、计分和死亡事件、偏移边界、碰撞优先级、随机向量、七组回收、重开保护、暂停和补 tick。M1 的资源重现与素材检查继续保留。

| tick | 状态 | y | velocityY | score | firstPipeX |
| --- | --- | --- | --- | --- | --- |
| 102 | playing | 311 | 12 | 0 | 408 |
| 118 | playing | 275 | 10.5 | 1 | 280 |
| 134 | dying，上管碰撞 | 240.5 | 0 | 1 | 152 |
| 141 | gameOver | 514 | 0 | 1 | 152 |
| 150 | gameOver | 514 | 0 | 1 | 152 |

同一输入分别按 30/60/120 FPS 渲染时间推进，150 tick 结果相同。计分 tick 为 118，死亡为 134，结算为 141，最早重开为 149；137 的 flap 被忽略。回收 fixture 确认第八个高度只在首次回收时消费。

## 浏览器闭环验证

[browser-check.json](./baselines/phaser/browser-check.json) 记录实际 Scene 的结果与配置 SHA-256；[production-check.json](./baselines/phaser/production-check.json) 记录生产构建的真实 RAF 循环与窗口焦点检查。两项检查串行执行，浏览器的默认焦点模拟只在生命周期验收阶段关闭。脚本各自创建隔离 context，不依赖日常游戏页的存档；本次 review 后的检查预置 7 分纪录，并验证原存档完整保留。

| 检查 | 结果 |
| --- | --- |
| 动画首帧与显示坐标 | ready tick 0–2、飞行 tick 1–3 均使用第 1 帧；鸟显示 y 等于逻辑 y，游戏和相机不取整，纹理为 NEAREST |
| 空格、跨 tick 自动重复、鼠标主键、触摸与合成鼠标 | 一次有效输入只产生一次 flap；触摸后下一 tick 继续积分 |
| 暂停、重新获得焦点、继续按钮 | 暂停不推进；获得焦点不恢复；继续不误触 flap，积累清零 |
| 生产版本真实窗口失焦 | 真实 focus 事件进入暂停，回到窗口后仍需继续；250 ms 后画面像素不变 |
| 结算页失焦 | 显示「继续游戏」；明确恢复后仍处于 gameOver，再显示「重新开始」 |
| 340 ms 卡顿 | 只补五个 tick，保留 0.2 tick，不快进十个 tick |
| 过管、碰撞与落地 | 实际 Scene 的 118/134/141 快照与 fixture 一致 |
| 连续十次重开 | 每次回 ready、tick=0、速度/本局分数清零；七组水管、35 个渲染对象始终有界 |
| 已有最高分 | 预置 7 分，得一分后刷新、关闭游戏页再打开及十次重开均保留 7 分 |
| 生产打包 | 九张图完整，真实起飞→死亡→重开和自动回放通过；生产不暴露开发验收接口 |
| 回放存档隔离 | 「回放最高」显示模型的 1 分；回放前后玩家存档字符串一致，返回普通游戏恢复 7 分 |

[persistence-check.json](./baselines/phaser/persistence-check.json) 保留 M2 首次验收时实际浏览器进程重启的证据；保存数据为 `{"schemaVersion":1,"bestScore":1}`，键为 `flappyx:phaser:best`。本次 review 未修改存档格式或保存逻辑。存档按 origin 隔离，5174 和 5175 不共享最高分。存储不可用或格式错误时显示具体提示，并保留本次会话最高分。

| 窗口 | Canvas 内部分辨率 | 实际显示矩形 |
| --- | --- | --- |
| 1024×768 | 1024×768 | (0, 0)，1024×768 |
| 1280×720 | 1024×768 | (160, 0)，960×720 |
| 390×844 | 1024×768 | (0, 275.75)，390×292.5 |

三种窗口均保持 4:3，鸟逻辑坐标不变。窄窗口面板采用简短文案，鸟和开始按钮可见；竖向窗口仍是横屏游戏的等比显示。

## 基准截图与复现

截图采用最近邻显示，已经逐张检查鸟帧、straight Alpha 透明边缘、水管方向、身体延伸、背景拼接与层级。

- [ready.png](./baselines/phaser/ready.png)：准备界面。
- [tick-118.png](./baselines/phaser/tick-118.png)：首次得分后的画面。
- [tick-134.png](./baselines/phaser/tick-134.png)：上管碰撞当 tick。
- [tick-141.png](./baselines/phaser/tick-141.png)：落地。
- [wide.png](./baselines/phaser/wide.png)、[portrait.png](./baselines/phaser/portrait.png)：窗口留边与 UI。

`/?replay=baseline` 自动运行 150 tick；`/?replay=baseline&tick=118` 直接运行到指定 tick 后定格，允许 0–150。定格截图为完整逻辑画布区域，包括 HUD。「回放最高」来自 fixture 的 `initialBestScore = 0`，结算后变为 1；回放不读取或写入玩家纪录，返回普通游戏才显示玩家最高分。图像比较应优先对照共享玩法区域，HUD 排版和系统字体可在不同引擎有差异。

运行 [README 的浏览器检查命令](../phaser/README.md) 可重新生成截图与 JSON。验收脚本连接已启动的独立 Chrome，不创建自动删除的临时浏览器资料；临时资料清理走系统回收站。

本次实机环境为桌面 Chrome。触摸使用真实浏览器事件模拟，尚未验收手机设备、Safari 或 Firefox；这些不作为五引擎桌面首版的已完成项。资源包没有音效，保持 M1 的范围。Three.js、Cocos、Unity、Godot 仍需执行各自适配与实机验收，C# 还需独立执行同一组 fixtures。

接入参考：[Phaser Scale Manager](https://docs.phaser.io/phaser/concepts/scale-manager)、[Phaser 4 Pixel Art Guide](https://github.com/phaserjs/phaser/blob/master/docs/Phaser%204%20Pixel%20Art%20Guide/Phaser%204%20Pixel%20Art%20Guide.md)。
