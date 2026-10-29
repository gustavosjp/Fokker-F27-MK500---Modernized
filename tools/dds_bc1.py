"""DXT1 (BC1) DDS writer used by the cockpit texture tools: per 4x4 block the endpoints are the darkest and brightest pixel, 4-colour
mode, nearest-colour indices; full mip chain (box filter); plus the MSFS ".json" sidecar the author's textures carry."""
import json

import numpy as np
from PIL import Image


def _to565(c):
    c = np.clip(np.rint(c), 0, 255).astype(np.int32)
    return ((c[..., 0] >> 3) << 11) | ((c[..., 1] >> 2) << 5) | (c[..., 2] >> 3)


def _from565(v):
    return np.stack([((v >> 11) & 31) * 255 / 31, ((v >> 5) & 63) * 255 / 63, (v & 31) * 255 / 31], -1)


def bc1(img):
    a = np.asarray(img.convert('RGB'), dtype=np.float32)
    h, w = a.shape[:2]
    ph, pw = (h + 3) // 4 * 4, (w + 3) // 4 * 4
    if (ph, pw) != (h, w):
        a = np.pad(a, ((0, ph - h), (0, pw - w), (0, 0)), mode='edge')
    blocks = a.reshape(ph // 4, 4, pw // 4, 4, 3).transpose(0, 2, 1, 3, 4).reshape(-1, 16, 3)
    lum = blocks @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    hi = blocks[np.arange(len(blocks)), lum.argmax(1)]
    lo = blocks[np.arange(len(blocks)), lum.argmin(1)]
    c0, c1 = _to565(hi), _to565(lo)
    swap = c0 < c1
    c0, c1 = np.where(swap, c1, c0), np.where(swap, c0, c1)
    c0 = np.where((c0 == c1) & (c0 < 0xFFFF), c0 + 1, c0)   # keep 4-colour mode (c0 > c1) even for flat blocks
    p0, p1 = _from565(c0), _from565(c1)
    pal = np.stack([p0, p1, (2 * p0 + p1) / 3, (p0 + 2 * p1) / 3], 1)
    idx = ((blocks[:, :, None, :] - pal[:, None, :, :]) ** 2).sum(-1).argmin(-1).astype(np.uint32)
    bits = (idx << (2 * np.arange(16, dtype=np.uint32))).sum(1).astype(np.uint32)
    out = np.zeros((len(blocks), 2), dtype=np.uint32)
    out[:, 0] = c0.astype(np.uint32) | (c1.astype(np.uint32) << 16)
    out[:, 1] = bits
    return out.tobytes()


def write_dds(img, path):
    w, h = img.size
    levels, cur = [], img
    while True:
        levels.append(bc1(cur))
        if cur.size == (1, 1):
            break
        cur = cur.resize((max(1, cur.size[0] // 2), max(1, cur.size[1] // 2)), Image.BOX)
    hdr = bytearray(128)
    hdr[0:4] = b'DDS '
    def u32(off, v): hdr[off:off + 4] = int(v).to_bytes(4, 'little')
    u32(4, 124); u32(8, 0x1 | 0x2 | 0x4 | 0x1000 | 0x20000 | 0x80000)
    u32(12, h); u32(16, w); u32(20, len(levels[0])); u32(28, len(levels))
    u32(76, 32); u32(80, 0x4); hdr[84:88] = b'DXT1'
    u32(108, 0x1000 | 0x8 | 0x400000)
    with open(path, 'wb') as f:
        f.write(bytes(hdr))
        for lv in levels:
            f.write(lv)
    with open(path + '.json', 'w') as f:
        json.dump({'Version': 2, 'SourceFileDate': 133688302360000000, 'Flags': ['FL_BITMAP_COMPRESSION', 'FL_BITMAP_MIPMAP']}, f)
