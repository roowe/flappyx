# FlappyX · Three.js

当前统一使用 `easyV1`：更宽的水管开口、更慢的滚动与下落，以及更高的开局位置。参数见 [共享配置](../shared/config/gameplay.json)。

Three.js 0.186.0 的正交相机版本，直接复用 `shared/core-ts/` 的玩法内核、共享 PNG 和配置。基准与浏览器证据见 [M3 记录](../docs/m3-threejs.md)。

从仓库根目录安装和启动：

```sh
bun install --cwd threejs --frozen-lockfile
just threejs
```

打开 <http://127.0.0.1:5176/>。空格、鼠标主键、轻触画面或开始按钮起飞。失焦或进入后台时暂停，点击「继续游戏」恢复；重开返回准备状态，再次输入才起飞。最高分使用该 origin 下的 `flappyx:threejs:best`，与 Phaser 的键独立。

检查和生产预览：

```sh
just check-m3
just preview-threejs
```

生产预览为 <http://127.0.0.1:5177/>，与开发端口的存档独立。生产构建不清空 `dist/`，只覆盖同名输出；产物不提交。浏览器需要支持 WebGL2。

`/?replay=baseline` 自动运行 210 tick；`/?replay=baseline&tick=184` 在指定 tick 定格，允许 0–210。HUD 的「回放最高」来自 fixture 的模型，初始为 0、结算后为 1；回放不读写玩家纪录，点击「返回游戏」恢复玩家最高分。开发模式的 `/?test=1` 暴露手动 tick 验收接口，生产不包含该接口。

自动验收用 `playwright-core` 连接独立的可见 Chrome。macOS 在单独终端启动：

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9224 \
  --user-data-dir=/private/tmp/flappyx-threejs-browser-check \
  --no-first-run --no-default-browser-check
```

分别保持 `just phaser`、`just threejs` 和 `just preview-threejs` 运行，再串行执行：

```sh
CHROME_CDP_URL=http://127.0.0.1:9224 bun run --cwd threejs check:browser
CHROME_CDP_URL=http://127.0.0.1:9224 bun run --cwd threejs check:production
CHROME_CDP_URL=http://127.0.0.1:9224 bun run --cwd threejs check:review
```

开发检查同时连接 Phaser 的 5174 端口，从 tick 0 到 210 对照两个真实适配层。`FLAPPYX_URL` 与 `PHASER_URL` 可以覆盖检查地址。检查使用隔离 context，预置 7 分以验证已有纪录，不清理日常游戏页存档。生产检查需要可见 Chrome 来验证真实失焦，两个脚本不能同时运行。

`check:review` 在隔离 context 中模拟贴图 404、缺少游戏容器和 WebGL 初始化失败，验证提示对应实际原因；还验证取整开关不改变逻辑状态，以及开发/生产图标响应的 PNG 内容。`FLAPPYX_PRODUCTION_URL` 可覆盖该检查的生产地址。

截图与 JSON 写入 `docs/baselines/threejs/`。画面对照使用 158、184、191 tick 的截图，玩法以逻辑快照为准。进程重启存档证据是本次实际验收的记录，不由上述隔离 context 检查生成。

脚本只关闭自己的验收页，不删除 Chrome 资料。正常退出独立 Chrome 后，macOS 清理使用 `/usr/bin/trash /private/tmp/flappyx-threejs-browser-check`。
