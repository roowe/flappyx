# M4b Babylon.js 版

完成日期：2026-10-02（东八区）。工程位于 `babylonjs/`，使用 Babylon.js 9.29.0、Vite 7.3.1、TypeScript 5.9.3 与 Bun 1.4.0。用户在原五引擎计划中新增 Babylon，已有阶段编号保留，新增计划 id 9。启动命令见 [README](../babylonjs/README.md)。

Babylon 直接导入当前 `easyV1` 的纯 TS 内核、FixedClock、JSON 配置和 210 tick fixture，没有复制或修改玩法参数。准备、起飞、过管计分、死亡、结算、重开、暂停和最高分组成完整闭环；HTML 与样式复用 `shared/web-ts`，存档实现共用，键为 `flappyx:babylonjs:best`。

## 渲染与适配

[renderer.ts](../babylonjs/src/renderer.ts) 使用固定正交相机，中心 `(512, 384, -10)`，投影边界为左右 ±512、上下 ±384。逻辑坐标转换为 `(x, 768-y)`，倾角取负，碰撞仍由共享内核处理。Canvas 像素为 1024×768，DOM 舞台等比缩放并留边，不因窗口变化修改运动参数。

天空、水管、地面与鸟按固定顺序绘制。35 个平面共享一份几何；九张 straight-alpha PNG 使用最近邻采样、无 mipmap、关闭光照和图像处理，直接保留素材颜色。材质按 alpha 混合，不写深度，避免透明物体排序改变层次。九份精灵材质之外，Babylon 会创建一份默认材质；十次重开后仍为一份几何、九张纹理、十份材质。

水管头保持 75×50，身体高度由开口上下沿与 y=0/544 求得，接缝逐 tick 核对。鸟保持 85×60，动画准备首帧为 tick 0–2，飞行首帧为 flightTicks 1–3。`render.roundPixels` 在逻辑坐标系决定显示中心是否取整，物理状态不受影响。

[game.ts](../babylonjs/src/game.ts) 按 RAF 的时间差调度共享时钟，每 tick 最多消费一次 flap，最多补五 tick。主键、主触摸和空格有效，键盘重复忽略；暂停清空排队输入，恢复清空积累时间，回前台仍需明确继续。原生 DOM 按钮不会穿透到 Canvas。场景等待贴图和 shader 就绪后才启用界面，加载期间不推进玩法。入口使用普通异步启动函数；发布 shader chunk 会导入入口中的引擎符号，顶层 await 会形成循环等待。资源错误包含具体文件名，WebGL 初始化错误单独提示。

基准回放从最高分 0 开局，只显示「回放最高」，不读取或写入玩家纪录。Release 提供只读快照供检查；修改状态的接口只在开发版 `?test=1` 中启用。

## 验收证据

`just check-babylonjs` 通过六项测试、610 个断言、严格类型检查、独立无 DOM 内核检查和生产构建。构建主 JS 约 1.06 MB（gzip 约 256 KB），Vite 的 700 KB chunk 提示仍存在；当前用于本地可玩和引擎对照。

| 检查 | 结果与证据 |
| --- | --- |
| 同 tick 对照 | [browser-check.json](./baselines/babylonjs/browser-check.json)：tick 0–210 共 211 个完整模型快照与实际 Phaser Scene 相同，鸟帧和显示位置一致 |
| 关键事件 | tick 158 得分，184 上管碰撞且 y=224、v=0，191 落地且 y=514，210 最终一分 |
| 输入和节奏 | 主键/触摸/空格、忽略非主键及键盘重复、同 tick 输入合并；340 ms 只补五 tick并保留 0.2 tick |
| 场景契约 | 正交坐标、85×60 鸟、最近邻、无 mipmap、每帧三 tick、水管头身接缝及地面边界通过 |
| 重开和存档 | 十次重开仍有七组管、35 个平面；已有最高分 7 保留，刷新与新页面读取相同纪录 |
| Release | [production-check.json](./baselines/babylonjs/production-check.json)：实际 RAF 开始/死亡/重开、完整自动回放、真实窗口失焦与显式恢复、无状态修改接口或控制台错误 |
| 回放隔离 | 已有存档预置 7，回放 UI 最高变为 1；前后存档字符串相同，返回游戏恢复 7 |
| 进程重启 | [persistence-check.json](./baselines/babylonjs/persistence-check.json)：普通随机局通过实际输入得一分，正常关闭并重启专用 Chrome 后仍读取一分 |
| 缩放 | 开发及 Release 覆盖 1024×768、1280×720、390×844，Canvas 等比缩放、留边且不超出窗口，逻辑位置不变 |

关键截图为 [tick 158](./baselines/babylonjs/tick-158.png)、[tick 184](./baselines/babylonjs/tick-184.png)、[tick 191](./baselines/babylonjs/tick-191.png)，另有准备、宽屏及竖屏截图。已目视检查鸟和水管方向、透明边缘、地面拼接及与 Phaser 的相同局面；渲染器允许边缘采样差异，玩法以快照为准。

实际环境为 macOS Chrome 154.0.8037.93、WebGL2；触摸由 Chrome 的真实触摸模拟检查，尚未验收手机实机、Safari、Firefox 或 WebGPU。共享资源包仍没有音效。本次没有修改既有引擎和当前共享契约。

Babylon 的投影参考官方[相机文档](https://doc.babylonjs.com/features/featuresDeepDive/cameras/camera_introduction/)，依赖来自官方[npm 发行包](https://www.npmjs.com/package/@babylonjs/core)。实际 API 及结果以锁定版本和上述本机验收为准。
