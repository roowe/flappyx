import sys
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prepare_assets import LuaTableReader, straight_alpha, upright_sprite


class AssetConversionTests(unittest.TestCase):
    def test_premultiplied_edge_restores_color_without_changing_alpha(self):
        rgb = Image.new("RGB", (3, 1))
        rgb.putdata([(64, 32, 0), (12, 34, 56), (0, 0, 0)])
        alpha = Image.new("L", (3, 1))
        alpha.putdata([128, 255, 0])
        self.assertEqual(list(straight_alpha(rgb, alpha).get_flattened_data()), [(128, 64, 0, 128), (12, 34, 56, 255), (0, 0, 0, 0)])

    def test_rotated_pipe_follows_vertex_correspondence(self):
        atlas = Image.new("RGBA", (2, 3))
        pixels = [(i * 30, 0, 0, 255) for i in range(1, 7)]
        atlas.putdata(pixels)
        quad = {
            "screen": dict(enumerate([3, 0, 3, 2, 0, 2, 0, 0], start=1)),
            "src": dict(enumerate([2, 3, 0, 3, 0, 0, 2, 0], start=1)),
            "tex": 1,
        }
        result, metadata = upright_sprite(atlas, quad)
        self.assertEqual(result.size, (3, 2))
        self.assertEqual([p[0] for p in result.get_flattened_data()], [60, 120, 180, 30, 90, 150])
        self.assertEqual(metadata["orientation"], "rotate90ccw")

    def test_literal_reader_rejects_executable_lua(self):
        self.assertEqual(LuaTableReader('return {{["id"]=4,[1]={16,-16},["flag"]=false,},}').read()[1][1], {1: 16, 2: -16})
        with self.assertRaises(ValueError):
            LuaTableReader('return { os.execute("anything") }').read()


if __name__ == "__main__":
    unittest.main()
