"""从 Noto Sans CJK SC 裁剪游戏 UI 使用的字符；通过 uv run --with fonttools 执行。"""

from pathlib import Path
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
text = "".join(path.read_text() for path in (root / "game/Assets/Scripts").glob("*.cs"))
text += "".join(chr(code) for code in range(32, 127))
font = TTFont(sys.argv[1])
options = subset.Options()
options.name_IDs = ["*"]
options.name_languages = ["*"]
subsetter = subset.Subsetter(options=options)
subsetter.populate(text=text)
subsetter.subset(font)
for record in font["name"].names:
    if record.nameID in (1, 3, 4, 6, 16):
        record.string = "FlappyXUI".encode(record.getEncoding())
cff = font["CFF "].cff
cff.fontNames = ["FlappyXUI"]
cff.topDictIndex[0].FamilyName = "FlappyXUI"
cff.topDictIndex[0].FullName = "FlappyXUI"
output = root / "web/FlappyUI.otf"
font.save(output)
print(f"Saved {output}: {output.stat().st_size} bytes")
