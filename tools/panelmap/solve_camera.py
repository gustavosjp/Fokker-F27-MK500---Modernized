"""Recovers the sim camera of a user screenshot from 2D-3D point pairs, so the Blender preview can be rendered from the same viewpoint.
Pinhole with square pixels and the principal point at the image centre; unknowns: eye (3), yaw/pitch/roll (3), focal length (1);
Levenberg-Marquardt with a numeric Jacobian (the reference points are almost coplanar, so a linear DLT is degenerate).
Usage: python solve_camera.py <pairs.json>   pairs: {"size":[w,h], "points":[[x,y,z,u,v],...]}  (glTF space; u,v pixels from top-left)
Writes <pairs>_camera.json with eye / look_at / fov_deg / roll_deg for render_preview.py."""
import json, sys
import numpy as np
d = json.load(open(sys.argv[1]))
W, H = d['size']
P3 = np.array([p[:3] for p in d['points']], float)
P2 = np.array([p[3:5] for p in d['points']], float)

def rot(yaw, pitch, roll):
    # camera looks along +z of glTF when yaw=pitch=roll=0; yaw about y, pitch about x, roll about the view axis
    cy, sy, cp, sp, cr, sr = np.cos(yaw), np.sin(yaw), np.cos(pitch), np.sin(pitch), np.cos(roll), np.sin(roll)
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rx = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]])
    Rz = np.array([[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]])
    return Ry @ Rx @ Rz   # columns: camera right(-x_img?), up, forward in world

def project(q):
    ex, ey, ez, yaw, pitch, roll, f = q
    R = rot(yaw, pitch, roll)
    rel = (P3 - [ex, ey, ez]) @ R      # camera coords: [a, b, c] along R's columns
    # glTF +x is the aircraft LEFT, so with forward = +z the image right is -x: u grows with -a
    u = W / 2 - f * rel[:, 0] / rel[:, 2]
    v = H / 2 - f * rel[:, 1] / rel[:, 2]
    return np.c_[u, v]

def resid(q):
    return (project(q) - P2).ravel()

q = np.array([0.40, 0.90, 8.50, np.radians(-15), np.radians(-30), 0.0, W / 2 / np.tan(np.radians(30))])
lam = 1e-3
for it in range(300):
    r = resid(q)
    J = np.zeros((len(r), len(q)))
    for k in range(len(q)):
        dq = np.zeros_like(q); dq[k] = 1e-6 * max(1, abs(q[k]))
        J[:, k] = (resid(q + dq) - r) / dq[k]
    A = J.T @ J; g = J.T @ r
    step = np.linalg.solve(A + lam * np.diag(np.diag(A)), -g)
    if np.sum(resid(q + step) ** 2) < np.sum(r ** 2):
        q = q + step; lam *= 0.3
    else:
        lam *= 10
    if np.linalg.norm(step) < 1e-10: break
err = np.linalg.norm(project(q) - P2, axis=1)
ex, ey, ez, yaw, pitch, roll, f = q
R = rot(yaw, pitch, roll)
fwd = R[:, 2]
fov = 2 * np.degrees(np.arctan(W / 2 / f))
print('reprojection error px: mean %.1f max %.1f  (per point: %s)' % (err.mean(), err.max(), ' '.join('%.0f' % e for e in err)))
print('eye', np.round([ex, ey, ez], 3).tolist(), 'forward', np.round(fwd, 3).tolist(), 'fov %.1f deg  roll %.1f deg' % (fov, np.degrees(roll)))
json.dump({'eye': [ex, ey, ez], 'look_at': (np.array([ex, ey, ez]) + fwd).tolist(), 'fov_deg': fov, 'roll_deg': float(np.degrees(roll)), 'res': [W, H]},
          open(sys.argv[1].replace('.json', '_camera.json'), 'w'))
