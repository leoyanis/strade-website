#!/usr/bin/env python3
"""Precompute the stardust emblem's star positions (src/components/space/stardust-points.ts).

The emblem paths are the SSI emblem's (vision/ssi/Emblem.astro). Doing this once here, instead of
rasterising the paths in the visitor's browser on every load, takes ~30-60 ms off the first frame.

Run: python3 scripts/stardust-points.py   (needs numpy and Pillow)
"""
import base64
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

STAR = 'M0.00 -241.88C-9.05 -113.84 17.77 -8.07 -185.50 2.00C27.08 10.12 -11.69 108.05 0.00 233.50C6.78 82.62 -9.44 1.68 184.75 -1.25C176.77 -2.54 168.32 -2.81 160.25 -3.26C135.30 -4.66 105.33 -11.03 82.35 -20.72C72.76 -24.77 65.44 -32.98 58.00 -40.25C55.70 -42.50 52.42 -43.93 49.75 -45.85C37.51 -54.63 27.08 -65.02 19.73 -78.25C14.44 -87.76 10.28 -98.97 8.56 -109.75C2.83 -145.60 2.51 -182.06 0.51 -218.25C0.08 -226.01 1.23 -234.07 0.00 -241.88Z'
SLASH = 'M-41.00 62.00C-39.79 61.32 -47.24 63.12 -48.50 63.31C-54.05 64.15 -59.41 66.39 -65.00 67.27C-82.71 70.03 -99.94 73.49 -118.00 72.49C-123.64 72.18 -135.00 70.24 -134.22 62.50C-132.97 49.96 -102.92 31.61 -92.50 24.99C-59.60 4.11 -6.88 -25.95 30.50 -35.44C39.65 -37.77 48.78 -38.72 58.00 -40.25L35.75 -72.25C37.83 -71.33 52.35 -76.00 56.00 -76.65C74.20 -79.90 91.94 -83.00 110.50 -83.00C117.43 -83.00 127.86 -82.65 132.99 -77.25C137.75 -72.24 133.40 -65.95 129.81 -61.75C120.79 -51.23 107.63 -44.46 96.00 -37.30C65.49 -18.52 11.53 3.59 -23.00 14.57C-30.45 16.94 -60.11 24.69 -63.25 26.00Z'
RING_L = 'M-89.50 16.00C-95.43 22.91 -147.75 45.63 -151.65 66.00C-153.61 76.30 -132.16 77.75 -125.75 77.75C-104.89 77.75 -60.56 69.94 -41.35 62.22C-39.79 61.32 -47.24 63.12 -48.50 63.31C-54.05 64.15 -59.41 66.39 -65.00 67.27C-82.71 70.03 -99.94 73.49 -118.00 72.49C-123.64 72.18 -135.00 70.24 -134.22 62.50C-132.97 49.96 -102.92 31.61 -92.50 24.99C-59.60 4.11 -6.88 -25.95 30.50 -35.44C39.65 -37.77 48.78 -38.72 58.00 -40.25C17.75 -46.50 -52.25 -10.50 -89.50 16.00Z'
RING_R = 'M82.00 -21.00C87.11 -25.45 103.64 -31.97 110.75 -35.96C120.55 -41.45 130.24 -47.11 139.25 -53.84C145.41 -58.45 154.81 -65.30 156.19 -73.50C158.45 -86.89 136.88 -88.75 127.75 -88.75C99.60 -88.75 72.92 -81.98 45.75 -75.39C42.35 -74.57 39.13 -73.11 35.75 -72.25C37.83 -71.33 52.35 -76.00 56.00 -76.65C74.20 -79.90 91.94 -83.00 110.50 -83.00C117.43 -83.00 127.86 -82.65 132.99 -77.25C137.75 -72.24 133.40 -65.95 129.81 -61.75C120.79 -51.23 107.63 -44.46 96.00 -37.30C65.49 -18.52 11.53 3.59 -23.00 14.57C-30.45 16.94 -60.11 24.69 -63.25 26.00C0.75 43.50 40.75 21.50 82.00 -21.00Z'

BX, BY, BW, BH = -190, -246, 380, 484
S = 2  # raster px per path unit
W, H = BW * S, BH * S
COUNTS = {'star': 1500, 'ring': 1000, 'fill': 360}


def flatten(d, steps=28):
    """Absolute M/C/L/Z path -> list of polygons (lists of (x, y))."""
    toks = re.findall(r'[MCLZ]|-?\d+(?:\.\d+)?', d)
    polys, cur, i, cmd, pos = [], [], 0, None, (0.0, 0.0)
    while i < len(toks):
        t = toks[i]
        if t in 'MCLZ':
            cmd = t
            i += 1
            if t == 'Z':
                if cur:
                    polys.append(cur)
                cur = []
            continue
        if cmd == 'M':
            pos = (float(toks[i]), float(toks[i + 1]))
            cur = [pos]
            i += 2
            cmd = 'L'
        elif cmd == 'L':
            pos = (float(toks[i]), float(toks[i + 1]))
            cur.append(pos)
            i += 2
        elif cmd == 'C':
            p0 = pos
            p1 = (float(toks[i]), float(toks[i + 1]))
            p2 = (float(toks[i + 2]), float(toks[i + 3]))
            p3 = (float(toks[i + 4]), float(toks[i + 5]))
            for k in range(1, steps + 1):
                u = k / steps
                a, b, c, e = (1 - u) ** 3, 3 * u * (1 - u) ** 2, 3 * u * u * (1 - u), u ** 3
                cur.append((a * p0[0] + b * p1[0] + c * p2[0] + e * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + e * p3[1]))
            pos = p3
            i += 6
        else:
            i += 1
    if cur:
        polys.append(cur)
    return polys


def mask(paths, cut=None):
    img = Image.new('L', (W, H), 0)
    dr = ImageDraw.Draw(img)
    for d in paths:
        for poly in flatten(d):
            dr.polygon([((x - BX) * S, (y - BY) * S) for x, y in poly], fill=255)
    if cut:
        for poly in flatten(cut):
            dr.polygon([((x - BX) * S, (y - BY) * S) for x, y in poly], fill=0)
    return np.array(img) > 127


def edges(m):
    e = m.copy()
    inner = m[1:-1, 1:-1] & m[:-2, 1:-1] & m[2:, 1:-1] & m[1:-1, :-2] & m[1:-1, 2:]
    e[1:-1, 1:-1] &= ~inner
    ys, xs = np.nonzero(e)
    return xs, ys


rng = np.random.default_rng(20261106)


def sample(xs, ys, n, loose):
    idx = rng.integers(0, len(xs), n)
    x = xs[idx] / S + BX
    y = ys[idx] / S + BY
    wide = rng.random(n) < loose
    sig = np.where(wide, 6.0, 1.1)
    return x + rng.normal(0, 1, n) * sig, y + rng.normal(0, 1, n) * sig


def pack(x, y):
    a = np.empty(len(x) * 2, dtype='<i2')
    a[0::2] = np.round(x * 4)
    a[1::2] = np.round(y * 4)
    return base64.b64encode(a.tobytes()).decode()


star = mask([STAR], cut=SLASH)
ring = mask([RING_L, RING_R])
sx, sy = edges(star)
rx, ry = edges(ring)
fy, fx = np.nonzero(star | ring)

out = {
    'STAR_EDGE': pack(*sample(sx, sy, COUNTS['star'], 0.12)),
    'RING_EDGE': pack(*sample(rx, ry, COUNTS['ring'], 0.10)),
}
idx = rng.integers(0, len(fx), COUNTS['fill'])
out['FILL'] = pack(fx[idx] / S + BX + rng.normal(0, 0.8, COUNTS['fill']), fy[idx] / S + BY + rng.normal(0, 0.8, COUNTS['fill']))

dest = Path(__file__).resolve().parent.parent / 'src/components/space/stardust-points.ts'
lines = [
    '// Generated by scripts/stardust-points.py. Do not edit by hand.',
    '// Star positions for the stardust emblem: little-endian Int16 pairs (x, y) in path units × 4, base64.',
    '// Random order, so any prefix is an even sample (phones draw a prefix).',
]
lines += [f"export const {k} = '{v}';" for k, v in out.items()]
dest.write_text('\n'.join(lines) + '\n')
print('wrote', dest, {k: len(v) for k, v in out.items()})
