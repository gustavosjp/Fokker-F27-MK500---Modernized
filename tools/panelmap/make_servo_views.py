"""Close-up top views of the ORIGINAL AP servo-switch panel (author's interior dump out/interior_orig), to plan copying its art:
servo_orig.png (textured) and servo_frames.png (x0_Struct_Cadres in red).
Usage: python make_servo_views.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
L = os.path.join(HERE, 'out', 'layouts')
base = dict(dump=os.path.join(HERE, 'out', 'interior_orig').replace('\\', '/'), textured=True,
            skip_materials=['Occluder', 'Collision', 'int_Glass_Gauge', 'int_Glass_ApBtn', 'int_Glass_Visor', 'WINDSHIELD', 'WINDSHIELD.001'],
            hide_prefixes=['x0_Lever_', 'x0_Knobs', 'x0_Trim_Pitch_Wheel'], screens=[], bezels=[],
            eye=[0.132, 1.0, 8.838], look_at=[0.132, 0.134, 8.8385], ortho=True, ortho_scale=0.15, clip_start=0.5, roll_deg=0, res=[1200, 1200])
json.dump(base, open(os.path.join(L, 'servo_orig.json'), 'w'))
json.dump(dict(base, hilite_prefixes=['x0_Struct_Cadres']), open(os.path.join(L, 'servo_frames.json'), 'w'))
print('servo views written')
