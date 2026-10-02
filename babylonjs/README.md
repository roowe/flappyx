# Babylon.js Flappy Bird

独立 Bun + Vite 工程，Babylon.js 9.29.0 用正交相机和平面贴图绘制。玩法直接复用 `shared/core-ts`，资源、DOM UI 和存档格式也从共享目录导入。当前契约为 `easyV1`，详见 [Babylon 验收记录](../docs/m4b-babylonjs.md)。

在仓库根目录运行：

```sh
bun install --cwd babylonjs --frozen-lockfile --ignore-scripts
just babylonjs             # http://127.0.0.1:5179/
just check-babylonjs       # 共享逻辑/存档测试、类型检查、生产构建
just preview-babylonjs     # http://127.0.0.1:5180/
```

空格、鼠标主键或轻触拍翅膀。首次输入直接起飞，结算后可重开；失焦或切到后台会暂停，回来后点击「继续游戏」。窗口等比缩放，逻辑范围保持 1024×768。最高分存档键为 `flappyx:babylonjs:best`，开发和生产 origin 分开保存。

`/?replay=baseline` 自动播放 210 tick；`/?replay=baseline&tick=184` 显示指定局面。回放从最高分 0 开局，显示「回放最高」，不读写玩家存档。

## 浏览器检查

使用自行启动的专用 Chrome profile；检查脚本连接 CDP，不使用会自动永久删除 profile 的启动方式：

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9225 \
  --user-data-dir=/private/tmp/flappyx-babylonjs-check \
  --no-first-run --no-default-browser-check about:blank
```

启动 Babylon 开发/生产服务器，以及用于对照的 `just phaser`。在 `babylonjs/` 串行执行：

```sh
bun run check:browser
bun run check:production
bun scripts/persistence-check.ts earn
# 正常退出专用 Chrome，重启同一个 profile 后：
bun scripts/persistence-check.ts check
```

可用 `CHROME_CDP_URL`、`FLAPPYX_URL`、`PHASER_URL` 指定地址。前两项使用隔离 context 并预置最高分 7，验证回放不会覆盖纪录；持久化检查用专用 profile 的默认 context，通过真实游戏输入得一分，再检查浏览器进程重启后保留。结束后正常退出浏览器，并将专用 profile 移入回收站：`/usr/bin/trash /private/tmp/flappyx-babylonjs-check`。

证据保存于 `docs/baselines/babylonjs/`。发布版只提供只读 `window.flappyx.snapshot()`；修改状态的 `flappyxTest` 仅在开发版 `?test=1` 时启用。
