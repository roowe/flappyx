# Cocos Creator Flappy Bird

当前统一使用 `easyV1`：更宽的水管开口、更慢的滚动与下落，以及更高的开局位置。参数见 [共享配置](../shared/config/gameplay.json)。

工程位于 `cocos/game/`，入口为 `assets/scenes/Boot.scene`。Creator 3.8.8 的编辑器浏览器预览和 Web Desktop Release 均已验收，详见 [M4 记录](../docs/m4-cocos.md)。

在仓库根目录运行：

```sh
bun install --cwd cocos/game --frozen-lockfile --ignore-scripts
just cocos                 # 同步共享文件并打开 Creator
just check-m4              # 测试、无 DOM 内核类型检查、Release 构建及引擎类型检查
just preview-cocos         # http://127.0.0.1:5178/
```

`just cocos` 默认使用 `/Applications/Cocos/Creator/3.8.8/CocosCreator.app`，其他安装位置设置 `COCOS_CREATOR` 为 `.app` 的绝对路径。编辑器打开后双击 Boot 场景，选择「浏览器」预览并运行；本机预览服务器通常为 7456，端口冲突时以编辑器显示为准。

Dashboard 也可添加 `cocos/game`。第一次打开或共享源码改变后，先执行 `just assets-cocos`；编辑器打开期间同步后，用资源管理器刷新 `assets/scripts` 与 `assets/resources`，再刷新预览。`assets/scripts/shared`、`assets/resources/images` 是派生文件，修改共享源后重新同步；不要在派生副本中调参。

空格、鼠标左键或轻触拍翅膀。首次输入同时起飞；死亡后保护期结束可重新开始。窗口失焦会暂停，回前台点击「继续游戏」；继续和重开不触发拍翅。最高分使用 `flappyx:cocos:best`，开发与发布 origin 分开保存。

正式发布页随窗口等比缩放。Creator 的设备预览保留加载时的容器尺寸，选择「网页全屏」后，改变窗口大小需要刷新预览。

发布页支持 `/?replay=baseline` 自动回放，也支持 `/?replay=baseline&tick=184` 静态对照。回放显示「回放最高」，不读取或写入玩家纪录。

## 浏览器验收

测试连接自行启动的专用 Chrome，不会调用 Playwright 临时 profile 的自动删除。先启动独立浏览器，保留这个 profile 供进程重启测试：

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9224 \
  --user-data-dir=/private/tmp/flappyx-cocos-browser-check \
  --no-first-run --no-default-browser-check about:blank
```

打开 Creator 的 Boot 场景并启动浏览器预览，再启动 `just preview-cocos`。在 `cocos/game/` **串行**运行：

```sh
CHROME_CDP_URL=http://127.0.0.1:9224 FLAPPYX_URL=http://127.0.0.1:7456 bun run check:browser
CHROME_CDP_URL=http://127.0.0.1:9224 FLAPPYX_URL=http://127.0.0.1:5178 bun run check:production
bun scripts/persistence-check.ts earn
# 正常退出专用 Chrome，重启上面同一个 profile 后：
bun scripts/persistence-check.ts check
```

前两项各建隔离 context 并预置 7 分；持久化检查使用专用浏览器的默认 context，从最高分 0 开局，通过真实更新和键盘事件得 1 分。不要用日常浏览器资料目录。检查结束，正常退出专用浏览器，再将 `/private/tmp/flappyx-cocos-browser-check` 移入回收站：`/usr/bin/trash /private/tmp/flappyx-cocos-browser-check`。

`check:browser` 将预览模式切换为「网页全屏」，在三个窗口尺寸下重载；`check:production` 在同一发布页面连续调整窗口。

需要重现编辑器导入证据时，用 `bun run editor --remote-debugging-port=9238` 启动本工程，再运行 `EDITOR_CDP_URL=http://127.0.0.1:9238 bun run check:editor`。脚本通过 Creator 官方消息接口核对工程、Boot 场景、脚本 UUID 和预览分辨率，先确认工程路径，避免操作其他项目。

证据保存在 `docs/baselines/cocos/`，构建日志位于 `cocos/game/build/logs/web-desktop.log`。Release 只有只读 `window.flappyx.snapshot()`；修改状态的 `flappyxTest` 仅在 Creator DEBUG 预览加 `?test=1` 时存在。
