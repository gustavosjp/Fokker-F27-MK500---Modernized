"""Our own thumbnails for the published add-on (v11): the aircraft selector's (thumbnail.jpg, thumbnail_small.jpg) and the package's
(ContentInfo Thumbnail.jpg), in the sizes of the author's, so none of his images goes out with a release (make-addon.mjs --public).
Usage: python make-addon-thumbnails.py <out dir>"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

BOLD = 'C:/Windows/Fonts/segoeuib.ttf'
REGULAR = 'C:/Windows/Fonts/segoeui.ttf'


def card(w, h, path):
    """A night-blue card with the name, sized and laid out on a 1618 x 582 design scaled to the height."""
    im = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / max(1, h - 1)
        d.line([(0, y), (w, y)], fill=(int(18 + 10 * (1 - t)), int(30 + 22 * (1 - t)), int(48 + 40 * (1 - t))))
    s = h / 582
    band = int(h * 0.76)
    d.rectangle([0, band, w, band + max(2, int(5 * s))], fill=(38, 166, 179))   # the tablet's accent colour
    x = int(70 * s)
    d.text((x, int(130 * s)), 'FOKKER F27-500', font=ImageFont.truetype(BOLD, int(118 * s)), fill=(240, 244, 248))
    d.text((x, int(275 * s)), 'MODERNIZED', font=ImageFont.truetype(BOLD, int(76 * s)), fill=(38, 196, 209))
    d.text((x, band + int(30 * s)), "WT21 avionics  \u00b7  F27 tablet  \u00b7  add-on for bgaurant's F27-500 v2",
           font=ImageFont.truetype(REGULAR, int(36 * s)), fill=(200, 210, 220))
    im.save(path, quality=90)


out = sys.argv[1]
os.makedirs(out, exist_ok=True)
card(1618, 582, os.path.join(out, 'thumbnail.jpg'))
card(600, 216, os.path.join(out, 'thumbnail_small.jpg'))
card(412, 170, os.path.join(out, 'Thumbnail.jpg'.replace('Thumbnail', 'ContentInfo-Thumbnail')))
print('thumbnails written to', out)
