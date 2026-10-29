"""Draws the two CDU placements (v9 planning) on the straight-down pedestal render (out/ped_top.png, ortho 0.62 m across 1400 px,
centre = x 0, z 8.74; image up = forward, image left = aircraft left).
Usage: python annotate_pedestal.py
"""
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
M = 0.62 / 1400


def px(x, z):
    return (700 - x / M, 700 - (z - 8.74) / M)


def rect(d, x0, x1, z0, z1, col, label, f):
    a, b = px(max(x0, x1), max(z0, z1)), px(min(x0, x1), min(z0, z1))
    d.rectangle([a, b], outline=col, width=6)
    d.text((a[0] + 10, a[1] + 8), label, fill=col, font=f)


try:
    f = ImageFont.truetype('arialbd.ttf', 30)
    fs = ImageFont.truetype('arialbd.ttf', 24)
except OSError:
    f = fs = ImageFont.load_default()
base = Image.open(os.path.join(OUT, 'ped_top.png')).convert('RGB')

# A: CDU centred (CJ4-like), rudder trim knob + fuel datum/horn moved to the left block (old AP servo switches hidden)
a = base.copy()
d = ImageDraw.Draw(a)
rect(d, -0.075, 0.075, 8.64, 8.875, (60, 220, 90), 'CDU 15 x 23.5 cm', f)
rect(d, 0.083, 0.188, 8.79, 8.89, (255, 190, 40), 'fuel datum + horn', fs)
cx, cz = px(0.135, 8.72)
d.ellipse([cx - 100, cz - 100, cx + 100, cz + 100], outline=(255, 190, 40), width=6)
d.text((cx - 80, cz + 105), 'rudder trim', fill=(255, 190, 40), font=fs)
d.text((30, 1340), 'A: CDU no centro (como no CJ4); trim do leme e fuel datum vao para a esquerda', fill=(255, 255, 255), font=f)
a.save(os.path.join(OUT, 'ped_option_a.png'))

# C: CDU on the left block (over the old servo switches), everything else stays; the old AP area is free for a CCP later
c = base.copy()
d = ImageDraw.Draw(c)
rect(d, 0.075, 0.192, 8.70, 8.883, (60, 220, 90), 'CDU 11.7 x 18.3', fs)
rect(d, -0.072, 0.072, 8.78, 8.89, (120, 170, 255), 'CCP (depois)', fs)
d.text((30, 1340), 'C: CDU menor no bloco esquerdo; trim e fuel datum ficam onde estao', fill=(255, 255, 255), font=f)
c.save(os.path.join(OUT, 'ped_option_c.png'))
print('annotated')
