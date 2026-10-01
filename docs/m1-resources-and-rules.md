# M1：资源、环境与玩法数据

日期：2026-10-01（东八区）。本阶段已完成资源转换和数据基线，下一阶段为 Phaser 实现。参数仍允许在 M2 试玩后调整；调整时同步修改配置与 fixtures。

## 1. 本机环境

| 项目 | 实测版本与位置 | 确认方式 |
| --- | --- | --- |
| Bun | 1.4.0，`/Users/luoliwei/.bun/bin/bun` | `bun --version` |
| uv | 0.10.12，`/opt/homebrew/bin/uv` | `uv --version` |
| 工具 Python / Pillow | Python 3.12.14 / Pillow 12.3.0 | 独立工具项目 `tools/`，虚拟环境为 `tools/.venv`；Pillow 版本固定在 `tools/pyproject.toml` 与 `tools/uv.lock` |
| Phaser | 4.2.1 | 读取 CrossGameEngine 的 `phaser/node_modules/phaser/package.json`，与工程声明一致 |
| Three.js | 0.186.0 | 读取 CrossGameEngine 的 `threejs/node_modules/three/package.json`，与工程声明一致 |
| Cocos Creator | 3.8.8，`/Applications/Cocos/Creator/3.8.8/CocosCreator.app` | bundle 版本及 arm64/x86_64 可执行文件均存在 |
| Godot .NET | `4.7.2.stable.mono.official.ed1daf0bf`，`/Applications/Godot_mono.app` | `Godot --headless --version` 正常退出 |
| Unity | 6000.5.6f1，`/Applications/Unity/Hub/Editor/6000.5.6f1/Unity.app` | bundle 版本和 arm64 可执行文件；同版本目录含 MacStandaloneSupport 与 WebGLSupport |
| C# SDK | 系统 .NET 10.0.401；Unity 随附 .NET 8.0.318 | 两个 `dotnet --list-sdks` 均正常退出 |

Godot 的 `~/Library/Application Support/Godot/export_templates/` 当前为空。M6 实现时补齐与 .NET 4.7.2 匹配的桌面导出模板，再验收导出。M1 没有启动 Cocos/Unity 工程或执行游戏构建；版本与路径核实不等同于构建验收。

Phaser、Three.js 的依赖目前存在于参考工程，FlappyX 工程依赖在 M2/M3 独立建立并锁定，不直接修改或借用参考工程的 `node_modules`。

## 2. 资源交付

- `shared/assets/source/`：六个原始文件及 `provenance.json`，记录源仓库、提交、原路径、大小和 SHA-256。
- `shared/assets/runtime/`：九张独立 RGBA 精灵和 `sprites.json`，供引擎导入。
- `shared/assets/birds-atlas.png`：完整 RGBA 图集，用于核对转换，不作为游戏加载资源。
- [精灵预览](../shared/assets/preview.png)与[布局预览](../shared/assets/layout-preview.png)：核对方向、透明度、背景拼接和显示尺寸。布局图是素材组合预览，游戏画面在后续引擎阶段验收。
- `tools/prepare_assets.py`：可重复执行的转换工具，只读取冻结的源快照；校验哈希后生成派生资源。

源快照来自 `/Users/luoliwei/github/ejoy2d` 的提交 `8cd0ac791b13128c1e51ffa29358ed8eda40c894`。复制时工作区干净；图集首次引入提交为 `5cf5d914e14968d121db1f4aa2923c332ed40b17`。原示例与仓库 MIT 声明已保留。已检查的素材文件及本地文档未提供独立的美术来源或授权说明，`provenance.json` 因此将美术授权标为 `unverified`，按原计划在对外发布前确认。

### 转换规则

原 PPM 是预乘 Alpha 的 RGB，PGM 是 Alpha。源渲染使用 `ONE / ONE_MINUS_SRC_ALPHA`；检查到的 8132 个半透明像素都满足 RGB 分量不大于 Alpha，Alpha 为零的像素 RGB 也均为零。输出 PNG 使用普通 straight Alpha，逐通道按 `round(channel × 255 / alpha)` 还原颜色，Alpha 保持原值；完全透明像素 RGB 置零。

`birds.lua` 只按字面量表解析，不执行 Lua 代码。转换依据 `screen` 和 `src` 的四个顶点对应关系恢复方向，不猜测名称中的 up/down，也不只裁剪源包围盒。下方水管头与身体均逆时针旋转 90°，输出后无需引擎再次旋转贴图。

原 `screen` 单位为 1/16 像素，矩阵单位为 1/1024。鸟动画矩阵缩放为 2.5，天空和地面为 2；水管分片顶点已经包含 2.5 倍尺寸，不再乘一次。运行精灵锚点统一为中心 `(0.5, 0.5)`，传给引擎的位置表示锚点位置；原始局部顶点范围保存在元数据里便于追溯。

| 逻辑 ID | PNG 像素尺寸 | 默认显示尺寸 |
| --- | --- | --- |
| `bird.frame1` / `frame2` / `frame3` | 34×24 | 85×60 |
| `background.sky` | 276×105 | 552×210 |
| `background.land` | 336×112 | 672×224 |
| `pipe.upper.head` / `pipe.lower.head` | 30×20 | 75×50 |
| `pipe.upper.body` / `pipe.lower.body` | 30×100 | 宽 75，高度按边界延伸 |

鸟的动画帧为 1→2→3→2，每帧 3 tick；第四张重复帧不另生成文件。水管头保持 75×50。身体的 `sizing.mode` 为 `stretchBetweenBoundaries`，`displaySize.height` 为 `null`，必须用边界求高度；250 仅作为 `referenceSize.height` 保留，不能用于运行时绘制。上方身体范围是 `[0, gapTop-50]`，下方身体范围是 `[gapBottom+50, 544]`，中心 y 为两端均值。天空底边与地面顶边对齐，横向重复平铺；纯色填充天空以上的区域。

由左上角求锚点位置使用 `position = topLeft + displaySize × pivot`。第一块地面的左上角 `(0, 544)` 对应中心 `(336, 656)`；第一块天空左上角 `(0, 334)` 对应中心 `(276, 439)`。后续图块的中心 x 每次加自身显示宽度。布局预览也先使用这些中心坐标，再转成 Pillow 的左上角坐标粘贴；引擎无需模仿 Pillow 的定位方式。[resource-layout.json](../shared/fixtures/resource-layout.json)锁定背景与水管的高度和定位示例。

引擎只导入 `runtime/` 中的九张图片，按 `sprites.json` 的显示尺寸和中心锚点布置；统一 nearest 采样、无 mipmap、straight Alpha。引擎的贴图上传/材质按其常规透明处理，避免对已经还原的 RGB 再执行一次还原。

## 3. 玩法配置契约

唯一配置源为 [gameplay.json](../shared/config/gameplay.json)。单位是逻辑像素与固定 tick；一个 tick 为 1/30 秒，不把每帧数值直接用于可变渲染帧。

固定顺序：消费动作 → 移动背景/水管 → 更新鸟的位置 → 更新速度 → 碰撞 → 存活时计分 → 存活时回收水管 → 输出事件。每 tick 只接受一次 flap，flap 把速度设为 -13.5；位置加当前速度后再加重力 1.5。碰撞按 `rules.collisionPriority` 的地面、顶部、上管、下管顺序判定。

- 画布 1024×768，地面顶边 y=544，鸟默认中心 `(350, 464)`，落地中心 y=514。
- 水管宽 75、开口高 200、间净距 190，中心间距 265；第一组中心 x=1224，初始队列 7 组。
- 开口中心为整数，合法范围 `[180, 384]`；由半开口、头高度、上下边距及地面位置推导。
- 水管碰撞检测使用鸟中心处的 64×44 AABB，不随视觉旋转；接触边界算碰撞。地面和顶部使用鸟未旋转的 85×60 显示边界，避免缩小的管道碰撞盒让鸟沉入地面。
- 水管右边缘**严格小于**鸟碰撞盒左边缘时加一分。边缘相等不计分；本 tick 有任何碰撞时不计分，已经 `passed` 的水管不重复计分。
- 同 tick 既碰地面又碰管时，地面优先，直接进入 `gameOver`，中心位置夹到 y=514、速度归零，不经过 `dying`。碰管或顶部进入 `dying`，当 tick 将速度设为 0，不额外执行一次死亡下落；后续 tick 用重力 15 下落，背景与水管冻结。进入 `dying` 后落地仍保留最初的死亡原因。
- 重开保护从碰撞 tick 起算 15 tick，当前 tick ≥ `deathTick + 15` 且已在 `gameOver` 才能接受重开。重开进入 `ready`、本局 tick 归零、清空本局状态，保留最高分，不顺带起飞。
- 暂停时不推进逻辑 tick；恢复需玩家明确操作，并清空积累时间。卡顿最多补跑 5 tick，丢弃剩余完整 tick 的积累时间，保留不足一个 tick 的小数部分。
- 正常随机使用 xorshift32：按 uint32 依次执行 `x ^= x << 13`、`x ^= x >>> 17`、`x ^= x << 5`，每步保持 32 位。拒绝零种子；默认种子 123456789，开口使用 `min + uint32 % (max-min+1)`。

fixture 提供显式水管高度时，不再抽随机数；按生成顺序消费，输入不足立即报错。初始化只消费七个高度，中心为 `1224 + i × 265`，第八个高度暂不生成。水管右边缘严格小于 0 时，才在存活 tick 的碰撞、计分之后复用到最后一组中心 +265，重置 `passed` 并消费下一个高度；右边缘等于 0 时保留。

每局回放的 tick=0 是初始状态，输入在指定 tick 开始时消费，快照在该 tick 完整结束后取值。死亡/结算后仍可推进回放 tick 以验证输入保护，运动保持上述冻结规则。fixture 不包含窗口事件时间戳。

## 4. 验收数据

[gameplay-cases.json](../shared/fixtures/gameplay-cases.json)提供起飞/落地轨迹、碰撞边界与偏移、计分去重与死亡优先、重开保护、七组队列回收和 uint32 随机向量。`stepCases` 可注入受控状态，锁定一帧同时跨越下管与地面的判定、顶部死亡和起飞速度覆盖；`recycle` 验证队列长度、顺序、第八个高度的消费和 `passed` 重置。`collisionQueries` 与 `scoreQueries` 是纯查询输入；`restart` 是可注入初始状态的用例。后续内核测试按契约执行，不能只验证 JSON 可读。

[lifecycle-cases.json](../shared/fixtures/lifecycle-cases.json)验证暂停不推进、重新获得焦点仍暂停、显式恢复清空积累时间，以及最多补五个 tick 并保留小数积累。

[replay-baseline.json](../shared/fixtures/replay-baseline.json)提供 150 tick 的固定输入和八个水管高度，预期：第 118 tick 得 1 分，第 134 tick 碰上方水管，第 141 tick 落地结算，最早第 149 tick 可重开；第 137 tick 的 flap 被忽略。30/60/120 FPS 使用同一组逻辑输入。

这些预期由固定步长公式和矩形边界推导并经 review 核对。M1 现在执行 `tools/contract_reference.py` 的逐 tick 参考模型，读取全部快照与预期事件字段，并通过时间积累器分别运行 30/60/120 FPS。修改规则而未更新参考模型会直接报错。该检查不能证明未来内核正确；M2–M6 仍须分别执行真实 TS/C# 内核及引擎回放，比较状态、速度、死亡原因、分数和快照，位置/速度容许误差 0.001。内核以共享契约为准；原 Lua 示例的更新顺序、死亡帧积分和首次点击行为仅供参考。

## 5. 重现与验证

在项目根目录运行：

```sh
uv sync --project tools --locked
just assets
just check-m1
```

Python 的项目配置、锁文件、虚拟环境和脚本集中在 `tools/`，可以在该目录独立使用 `uv`。根目录的 `justfile` 通过 `uv run --project tools` 调用脚本，继续保留统一入口。

项目入口直接调用 `uv`，运行机器不需要 RTK。`just assets` 重建标准 PNG、元数据和两张预览；`just check-m1` 校验源哈希、Alpha、资源定位、配置引用及所有玩法 fixtures。重现检查在内存中重新转换后逐字节比较 13 个输出，不创建临时目录或生成文件。

本次 `just check-m1` 及五项测试全部通过。测试包含三项资源转换检查，以及 review 回归检查：先确认旧校验器无法检出十处字段修改，再验证新校验器能拒绝这些修改及新增的回收、暂停、补 tick 数据变更；另检查验证过程不创建目录或写入输出文件。之前四个校验临时目录经核对后已移入系统回收站。Bun 的独立 uint32 计算与随机向量一致。已查看精灵预览和布局预览；五引擎实际导入、运行与构建验收在各自实施阶段完成。
