# Web 中文字体

`../FlappyUI.otf` 是 Noto Sans CJK SC Regular 的字符子集，使用 SIL Open Font License 1.1，许可证为 [OFL.txt](./OFL.txt)。字体内部的版权信息保留，派生字体名称改为 `FlappyXUI`。

来源：[Noto CJK 官方仓库](https://github.com/notofonts/noto-cjk/blob/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf)。2026-10-03 下载的原文件 SHA-256：

```text
2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b
```

子集包含 `game/Assets/Scripts/*.cs` 中出现的字符及可打印 ASCII，大小约 53 KB。构建只使用已保存的子集，不联网下载，也不需要 Python。

新增中文 UI 文案后，在仓库根目录重新生成子集，再构建 Web：

```sh
mkdir -p u3d/.checks/font-source
xh --ignore-stdin --download --output u3d/.checks/font-source/NotoSansCJKsc-Regular.otf GET https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf
uv run --with fonttools==4.66.1 python u3d/tools/subset-font.py u3d/.checks/font-source/NotoSansCJKsc-Regular.otf
just build-unity-web
```

构建脚本将许可证复制到 Web 产物的 `FONT-LICENSE.txt`，部署时一起保留。
