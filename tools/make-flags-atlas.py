"""v10.5: texture of the WT21 exterior's protection covers and ground-lock streamers (F27WT21_FLAGS.PNG.DDS, 512 x 512 DXT1 + sidecar):
cover fabric (red), the streamer (red, white REMOVE BEFORE FLIGHT along its length) and the plug face (darker red). The rectangles are
the ones make-wt21-exterior.mjs maps its meshes into (FLAGS_UV there, in pixels / 512).
Usage: python make-flags-atlas.py <out dir>"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dds_bc1 import write_dds  # noqa: E402

RED, DARK, WHITE = (190, 22, 32), (120, 12, 18), (245, 245, 245)
img = Image.new('RGB', (512, 512), RED)
d = ImageDraw.Draw(img)
# cover fabric: y 0..160 (a darker hem along its edges so the covers read as fabric)
d.rectangle([0, 0, 511, 159], fill=RED)
d.rectangle([0, 0, 511, 9], fill=DARK)
d.rectangle([0, 150, 511, 159], fill=DARK)
# streamer: y 192..320, text along u. v10.6: the letters fill half the streamer's width (they were a fifth): drawn at that size and
# squeezed along u to fit, so that on the model's streamers (about 6:1 where this rectangle is 4:1) they read as a condensed bold face
d.rectangle([0, 192, 511, 319], fill=RED)
text = 'REMOVE BEFORE FLIGHT'
try:
    font = ImageFont.truetype('arialbd.ttf', 88)
except OSError:
    font = ImageFont.load_default()
bb = d.textbbox((0, 0), text, font=font)
strip = Image.new('RGB', (bb[2] - bb[0] + 8, 128), RED)
ImageDraw.Draw(strip).text((4 - bb[0], 64 - (bb[1] + bb[3]) / 2), text, fill=WHITE, font=font)
img.paste(strip.resize((488, 128), Image.LANCZOS), (12, 192))
print(f'streamer text: {bb[3] - bb[1]} px of 128 high, squeezed {488 / strip.width:.2f} along u')
# plug face: y 352..480
d.rectangle([0, 352, 511, 479], fill=DARK)
out = os.path.join(sys.argv[1], 'F27WT21_FLAGS.PNG.DDS')
write_dds(img, out)
print(f'wrote {out}')
