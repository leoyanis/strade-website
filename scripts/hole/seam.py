#!/usr/bin/env python3
"""Proves the loop's seam: the last frame must flow into the first like any two neighbouring frames do.

The prototype clips are rendered across the seam (loop frames 285..299 then 0..74, render.mjs --frames
285-299,0-74), so the seam sits inside the clip, between clip frames 14 and 15. This streams the lossless master
through ffmpeg, measures the mean absolute change between every pair of neighbouring frames over the area round the
hole (where everything moves), and reports the seam's change against all the others. Any motion that is not
periodic in the loop would show as a jump there and nowhere else: the shader wraps time into the loop.
It also writes a strip of full-resolution crops of loop frames 297, 298, 299 | 0, 1, 2.

    python3 scripts/hole/seam.py .scratch/hole/clip/desktop-clip-master.mkv 3840 2160 2611 1069 266 [seam_index]
    python3 scripts/hole/seam.py .scratch/hole/clip/phone-clip-master.mkv 1440 3200 720 960 223
    python3 scripts/hole/seam.py <full loop master> W H cx cy shadow wrap
      a whole loop (frames 0..N-1): the seam is then the change from frame N-1 back to frame 0
"""
import json
import os
import subprocess
import sys

import numpy as np

FFMPEG = os.environ.get('FFMPEG', '/opt/homebrew/bin/ffmpeg')


def main():
    path, w, h, cx, cy = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
    sh = int(sys.argv[6])
    wrap = len(sys.argv) > 7 and sys.argv[7] == 'wrap'
    seam = 15 if wrap or len(sys.argv) <= 7 else int(sys.argv[7])
    # the area round the hole: 7 shadow radii either side, 4 up and down, clamped to the frame
    x0, x1 = max(0, cx - 7 * sh), min(w, cx + 7 * sh)
    y0, y1 = max(0, cy - 4 * sh), min(h, cy + 4 * sh)
    cw, ch = x1 - x0, y1 - y0
    proc = subprocess.Popen([FFMPEG, '-hide_banner', '-loglevel', 'error', '-i', path, '-vf', f'crop={cw}:{ch}:{x0}:{y0}',
                             '-f', 'rawvideo', '-pix_fmt', 'rgb48le', 'pipe:1'], stdout=subprocess.PIPE)
    size = cw * ch * 3 * 2
    prev = None
    first = None
    diffs = []
    keep = {}
    i = 0
    while True:
        buf = proc.stdout.read(size)
        if len(buf) < size:
            break
        f = np.frombuffer(buf, dtype=np.uint16).reshape(ch, cw, 3).astype(np.float32) / 65535.0
        if prev is not None:
            diffs.append(float(np.mean(np.abs(f - prev))) * 1023)  # in 10-bit code values
        if first is None:
            first = f
        if not wrap and seam - 3 <= i <= seam + 2:
            keep[i] = (f * 255 + 0.5).clip(0, 255).astype(np.uint8)
        if wrap and (i <= 2 or i >= 297):
            keep[i] = (f * 255 + 0.5).clip(0, 255).astype(np.uint8)
        prev = f
        i += 1
    proc.wait()
    if wrap:
        # the loop's own seam, last frame to first, put where the clip mode expects it: index seam - 1 of the diffs
        n = i
        d_wrap = float(np.mean(np.abs(first - prev))) * 1023
        # the n changes round the loop, rotated so the wrap (last to first) sits at index seam - 1
        circ = diffs + [d_wrap]
        diffs = [circ[(k + n - seam) % n] for k in range(n)]
        keep = {seam - 3: keep[n - 3], seam - 2: keep[n - 2], seam - 1: keep[n - 1], seam: keep[0], seam + 1: keep[1], seam + 2: keep[2]}
        i = n
    d = np.array(diffs)
    s = d[seam - 1]  # change from clip frame seam-1 (loop 299) to clip frame seam (loop 0)
    others = np.delete(d, seam - 1)
    rep = {
        'clip': os.path.basename(path), 'frames': i, 'area': [x0, y0, cw, ch],
        'seam_change_10bit': round(s, 3),
        'other_changes_10bit': {'min': round(float(others.min()), 3), 'median': round(float(np.median(others)), 3), 'max': round(float(others.max()), 3)},
        'seam_vs_median': round(float(s / np.median(others)), 3),
        'changes_around_seam': [round(x, 3) for x in d[max(0, seam - 4):seam + 3]],
    }
    print(json.dumps(rep, indent=1))
    out = os.path.join(os.path.dirname(path), os.path.basename(path).replace('-master.mkv', '') + '-seam')
    with open(out + '.json', 'w') as fp:
        json.dump(rep, fp, indent=1)
    # strip: crops of the six frames round the seam, full resolution, labelled with their loop frame numbers; a
    # tighter crop than the measured area (3.2 shadow radii either side, 1.9 up and down) so the disc's detail shows
    tx0, ty0 = max(0, cx - int(3.2 * sh)) - x0, max(0, cy - int(1.9 * sh)) - y0
    tx1, ty1 = min(w, cx + int(3.2 * sh)) - x0, min(h, cy + int(1.9 * sh)) - y0
    keep = {k: v[ty0:ty1, tx0:tx1] for k, v in keep.items()}
    cw, ch = tx1 - tx0, ty1 - ty0
    from PIL import Image, ImageDraw, ImageFont
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', max(18, ch // 30))
    tiles = []
    labels = {seam - 3: 'loop frame 297', seam - 2: '298', seam - 1: '299 (last)', seam: '0 (first)', seam + 1: '1', seam + 2: '2'}
    for k in range(seam - 3, seam + 3):
        im = Image.fromarray(keep[k])
        ImageDraw.Draw(im).text((16, 12), labels[k], font=font, fill=(255, 255, 255))
        tiles.append(im)
    strip = Image.new('RGB', (cw * 3 + 16, ch * 2 + 8), (60, 60, 60))
    for n, t in enumerate(tiles):
        strip.paste(t, ((n % 3) * (cw + 8), (n // 3) * (ch + 8)))
    strip.save(out + '-strip.jpg', quality=92)
    print('wrote', out + '-strip.jpg')


if __name__ == '__main__':
    main()
