# FlappyX · Phaser

Phaser 4.2.1 的可玩基准版本，共用 `shared/core-ts/` 内核、共享 PNG 和玩法配置。详细基准与验收记录见 [M2 记录](../docs/m2-phaser-baseline.md)。

从仓库根目录安装和启动：

```sh
bun install --cwd phaser --frozen-lockfile
just phaser
```

浏览器打开 <http://127.0.0.1:5174/>。空格、鼠标主键或轻触画面拍翅膀；开始按钮也可以起飞。失焦或切换后台会暂停，点击「继续游戏」恢复；点击「重新开始」返回准备状态，再次输入才起飞。最高分保存在该浏览器、该 origin 的 `flappyx:phaser:best` 下，开发与预览端口各自保存。

检查与生产预览：

```sh
just check-m2
just preview-phaser
```

生产预览为 <http://127.0.0.1:5175/>。`dist/` 是派生产物，不提交；构建覆盖同名输出，禁止自动清空目录。

固定输入回放为 `/?replay=baseline`；`/?replay=baseline&tick=118` 在指定 tick 定格，用于引擎间截图对照。允许 tick 0–150，HUD 的「回放最高」来自 fixture 的模型，初始为 0，结算后为 1。回放不读取或写入玩家最高分，点击「返回游戏」后恢复玩家纪录。开发模式的 `/?test=1` 暴露确定性验收接口并停用自动 tick；生产构建没有这个接口。

自动浏览器验收使用 `playwright-core` 连接单独启动的本机 Chrome，无需下载浏览器。macOS 可在独立终端启动以下可见窗口，其他平台使用本机 Chrome 可执行文件和绝对配置目录：

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9224 \
  --user-data-dir=/private/tmp/flappyx-browser-check \
  --no-first-run --no-default-browser-check
```

保持开发服务器与生产预览运行，依次执行检查（共享浏览器窗口，不能同时运行）：

```sh
CHROME_CDP_URL=http://127.0.0.1:9224 bun run --cwd phaser check:browser
CHROME_CDP_URL=http://127.0.0.1:9224 bun run --cwd phaser check:production
CHROME_CDP_URL=http://127.0.0.1:9224 bun run --cwd phaser check:review
```

检查均在隔离的浏览器 context 中运行，不使用日常游戏页的存档。开发与生产验收 context 预置 7 分纪录，验证刷新、重开和回放后仍保留 7 分；生产检查还比较回放前后存档的原始字符串。`check:review` 验证图片加载失败时停止游戏，以及销毁游戏后移除浏览器事件监听器。

生产检查需要可见 Chrome，以产生真实的窗口失焦事件。脚本关闭自己的验收页，不删除浏览器配置目录；退出这个独立 Chrome 后，macOS 清理使用 `/usr/bin/trash /private/tmp/flappyx-browser-check`。截图与 JSON 证据写入 `docs/baselines/phaser/`。
