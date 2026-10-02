# M3 Three.js 版

完成日期：2026-10-02（东八区）。玩法继续使用冻结的 `phaser-v1`，未修改共享配置、物理参数或 fixtures。

Three.js 版已完成准备、起飞、过管计分、死亡、结算、重开、最高分、缩放和暂停恢复。两个真实浏览器适配层从 tick 0 到 150 的全部模型快照字段与鸟动画帧一致。启动方式见 [Three.js README](../threejs/README.md)：`just threejs` 打开 <http://127.0.0.1:5176/>，`just preview-threejs` 在 5177 端口预览生产构建。

## 实现与共享边界

本机实际使用 Three.js 0.186.0、Bun 1.4.0、TypeScript 5.9.3、Vite 7.3.1 和 macOS Chrome 154.0.8037.93，依赖固定在 `threejs/bun.lock`。工程独立安装，不复制或修改 CrossGameEngine。

| 模块 | 责任 |
| --- | --- |
| [shared/core-ts](../shared/core-ts/index.ts) | 两版共用的 Game、FixedClock、随机、水管队列、碰撞、计分及事件；继续只依赖 ES2022 |
| [shared/web-ts](../shared/web-ts/storage.ts) | 浏览器 DOM 节点、样式与存档格式；存档键由引擎适配层传入 |
| [FlightGame](../threejs/src/game.ts) | RAF 调度、输入合并、暂停/显式恢复、UI、回放和存档事件 |
| [FlightRenderer](../threejs/src/renderer.ts) | 正交投影、PNG 材质、中心锚点、坐标转换、层级及 GPU 资源复用 |

为避免两套浏览器样式与存档格式分别演进，原 Phaser 的 UI 节点、样式和存档实现提取到 `shared/web-ts/`。Phaser 的入口、存档键和玩法保持一致；M2 测试、开发与生产浏览器回归检查均通过。DOM 模块没有进入纯数值内核，后续 Cocos 可继续直接使用 `shared/core-ts/`。

## 正交投影与显示规则

相机范围固定为 left=0、right=1024、top=768、bottom=0，相机 z=10，平面 z=0。逻辑 x 不变，渲染 y=`768 - logicalY`；鸟的视觉旋转为逻辑倾角的负值，以对应屏幕上顺时针的正角度。相机和 Canvas 内部分辨率不随窗口尺寸变化，CSS 保持 4:3 等比留边。

九张 PNG 直接由共享目录进入 Vite 构建。贴图采用 `NearestFilter`，关闭 mipmap、保留 straight alpha，并标记 `SRGBColorSpace`；材质使用不受灯光影响的 MeshBasicMaterial，关闭 tone mapping。所有平面使用透明材质、关闭深度读写，显式按天空→水管→地面→鸟排序。

只创建一份单位 PlaneGeometry、九份材质及 35 个平面对象。水管身体高度按开口边界计算，头部保持 75×50；天空与地面各铺三块。更新、回收、换帧和重开都修改已有对象。鸟帧为 1→2→3→2，ready 的首帧覆盖 tick 0–2，飞行首帧覆盖 flightTicks 1–3。

Three.js 读取共享的 `render.roundPixels`：基准为 false，显示保留小数坐标、不插值；设为 true 时，先在逻辑坐标系对显示中心 x/y 做 `Math.round`，再转换到相机坐标。逻辑位置、碰撞和计分不变，回归检查验证 y=240.5 的模型在开启时显示为 241，关闭后恢复 240.5。

贴图加载失败会给出具体文件名，页面节点校验给出节点 ID，只有 WebGL 创建失败才提示 WebGL2 初始化。原始异常通过 `cause` 保留并继续抛出。页头图标由共享浏览器模块使用 Vite 的 PNG URL 导入，开发使用可访问的资源地址，生产使用打包 URL；检查响应类型和 PNG 签名。原 HTML 相对地址在开发端曾返回状态 200 的 HTML，生产端已被 Vite 正确改写。

## 验收结果

`just check-m3` 通过五项 Bun 测试、606 个断言、适配层类型检查、无 DOM 内核类型检查和生产构建。新增的一项存档测试验证 Three.js 纪录可由新适配器读取，并与 Phaser 使用不同键。M1 资源重现及五项 Python 测试继续通过；`just check-m2` 保持五项测试、605 个断言通过。

M3 review 的 [review.test.ts](../threejs/scripts/review.test.ts) 先复现错误提示、忽略取整开关和开发图标返回 HTML，再在修复后通过三项实际浏览器测试、24 个断言，覆盖三类加载失败、开关往返和两种构建环境的图标。

[browser-check.json](./baselines/threejs/browser-check.json) 记录实际 Scene 结果、与 Phaser 配对的关键快照及配置 SHA-256；[production-check.json](./baselines/threejs/production-check.json) 记录实际 WebGL2 画布、真实 RAF 和窗口焦点检查。两份脚本使用隔离 context，预置 7 分，保留玩家日常存档。

| 检查 | 结果 |
| --- | --- |
| 逐 tick 对照 Phaser | tick 0–150 全部 20 个模型字段、鸟帧和显示 y 一致，包含七组水管顺序与通过标记 |
| 回放关键事件 | tick 118 得分；134 上管碰撞、y=240.5、速度归零；141 落地、y=514；最终一分 |
| 输入与节奏 | 空格自动重复被忽略，鼠标和模拟触摸各产生一次 flap；首张鸟帧持续三 tick |
| 暂停和补 tick | 待消费输入清空，恢复不拍翅；340 ms 只补五 tick、保留 0.2 tick |
| 实际窗口失焦 | 真实失焦进入暂停，回前台仍需继续；暂停画面在 250 ms 后相同 |
| 结算失焦 | 先显示继续，恢复后仍在 gameOver，再显示重新开始 |
| 十次重开 | 本局状态清零，七组水管、35 个平面、1 份几何、9 张 GPU 纹理保持有界 |
| 缩放 | 1024×768、1280×720、390×844 均保持 4:3，Canvas 内部仍为 1024×768，逻辑位置不变 |
| 已有纪录 | 得一分、刷新、关闭游戏页再打开、重开后保留 7 分 |
| 回放存档隔离 | 回放最高为 1，前后玩家存档字符串完全一致；返回普通游戏恢复 7 分 |
| 生产构建 | 九图加载完整，实际 WebGL2 上下文关闭抗锯齿；真实 RAF 起飞→死亡→重开、自动回放通过；无开发接口或控制台错误 |

[persistence-check.json](./baselines/threejs/persistence-check.json) 记录独立 Chrome 的普通存储：从零分开局得一分，正常退出整个 Chrome 进程，以同一资料目录重启后恢复最高分 1，存档字符串不变。键为 `flappyx:threejs:best`，字段为 `schemaVersion` 和 `bestScore`；开发与生产 origin 各自保存。

## 截图对照与复现

六张截图已检查方向、透明边缘、管道接缝、背景平铺、层级和 UI：

- [ready.png](./baselines/threejs/ready.png)：准备画面。
- [tick-118.png](./baselines/threejs/tick-118.png)、[tick-134.png](./baselines/threejs/tick-134.png)、[tick-141.png](./baselines/threejs/tick-141.png)：同局面回放。
- [wide.png](./baselines/threejs/wide.png)、[portrait.png](./baselines/threejs/portrait.png)：宽屏与竖向窗口留边。

`just compare-web-frames` 使用现有 uv/Pillow 工具，比较两版截图的 `(0,146)–(1024,704)` 区域，排除 HUD 和页脚，保留鸟、管道、天空及地面。[像素差异报告](./baselines/threejs/screenshot-comparison.json) 同时记录配置与输入截图哈希。

| tick | 不同像素 | 平均通道差（0–255） | 最大通道差（0–255） |
| --- | --- | --- | --- |
| 118 | 516 | 0.00446 | 169 |
| 134 | 571 | 0.01432 | 171 |
| 141 | 573 | 0.01580 | 194 |

不同像素占区域约 0.09%–0.10%，少量边缘像素仍有显著色差；平均通道差不能代替最大通道差。两版保留各自的采样与颜色处理，不要求栅格化结果逐字节相同，玩法与显示坐标由逐 tick 快照验证。

浏览器检查命令见 README；需要同时运行 Phaser 开发服务器、Three.js 开发服务器和 Three.js 生产预览，再串行验收。浏览器测试资料最后移入系统回收站。

本次验证为桌面 Chrome 与模拟触摸，尚未实测手机、Safari 或 Firefox。资源包没有音效，保持 M1 范围；Cocos、Unity、Godot 的适配与实机验收继续在后续阶段进行。

渲染接入参考：[OrthographicCamera](https://threejs.org/docs/pages/OrthographicCamera.html)、[Texture](https://threejs.org/docs/pages/Texture.html)、[WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)。
