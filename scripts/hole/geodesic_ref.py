#!/usr/bin/env python3
"""Reference check of the black hole shader's lensing (Yanis, 2026-11-08: "are you sure the bending spacetime would
do that to the right of it?").

What it does
- Reads the live shader's own ray mapping (physics.mjs runs the live shader on the GPU with a debug exit right
  after its ray loop and writes, per pixel, the radius where the ray crosses the disc's plane the first and the
  second time, plus the Doppler factor it would shade with).
- Traces the same rays again, independently: Schwarzschild null geodesics in 3D Cartesian form,
  x'' = -1.5 h^2 x / r^5 with h = |x cross v| (units of the Schwarzschild radius), which is the exact spatial path
  of a light ray (it is the Binet equation u'' + u = 1.5 u^2 written in 3D), RK4 with a step of 0.4% of the
  radius, crossings of the plane y = 0 found by Hermite interpolation inside the step. No orbital-plane trick, no
  angle stepping, no step budget: nothing shared with the shader but the camera.
- Spot-checks that integrator against the full geodesic equations in Schwarzschild coordinates (t, r, theta, phi,
  Christoffel symbols, scipy DOP853 at 1e-12) on a few dozen rays, so the force law itself is tested too.
- Compares isoradial curves (r = 6M, 10M, 20M, i.e. 3, 5 and 10 Schwarzschild radii, plus the disc's outer edge
  13) of the shader and the reference, left of the hole against right of it, and mirrors each side onto the other.

    python3 scripts/hole/geodesic_ref.py            # reads .scratch/hole/phys/, writes figures and a report there

Finding index: physics.mjs, physics-page.js (DEBUG_GEOM), legacy-shader.js (the live FRAG), camera.js.
"""
import json
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
PHYS = os.path.normpath(os.path.join(HERE, '..', '..', '.scratch', 'hole', 'phys'))
RIN, ROUT = 3.0, 13.0
ISO = [(3.0, '6M (r=3, inner edge)'), (5.0, '10M (r=5)'), (10.0, '20M (r=10)'), (13.0, 'outer edge (r=13)')]


def load(name):
    meta = json.load(open(os.path.join(PHYS, name + '_meta.json')))
    w, h = meta['view']['bw'], meta['view']['bh']
    a = np.fromfile(os.path.join(PHYS, name + '.f32'), dtype=np.float32).reshape(h, w, 4)
    return meta, a


def ray_dirs(cam, xs, ys):
    """Unit directions of the rays through pixel centres (canvas px, y from the bottom), as the shader builds them."""
    F, R, U = (np.array(cam[k], dtype=np.float64) for k in ('F', 'R', 'U'))
    px = xs - cam['center'][0]
    py = ys - cam['center'][1]
    d = F[None, :] * cam['focal'] + R[None, :] * px[:, None] + U[None, :] * py[:, None]
    return d / np.linalg.norm(d, axis=1, keepdims=True)


def trace(x0, dirs, c=0.004, max_steps=12000, ncap=4):
    """Formulation A, vectorised RK4. Returns per ray: up to `ncap` plane crossings (radius, azimuth, Doppler g as the
    shader computes it), the number of crossings, and the fate (1 fell in, 2 got away, 0 out of steps)."""
    n = len(dirs)
    X = np.repeat(np.asarray(x0, dtype=np.float64)[None, :], n, axis=0)
    V = dirs.astype(np.float64).copy()
    H2 = np.sum(np.cross(X, V) ** 2, axis=1)
    cr = np.full((n, ncap), -1.0)
    cphi = np.full((n, ncap), np.nan)
    cg = np.full((n, ncap), np.nan)
    ncross = np.zeros(n, dtype=np.int64)
    fate = np.zeros(n, dtype=np.int64)
    idx = np.arange(n)
    x, v, h2 = X, V, H2

    def acc(p, h2):
        r2 = np.sum(p * p, axis=1)
        return -1.5 * (h2 / (r2 * r2 * np.sqrt(r2)))[:, None] * p

    for step in range(max_steps):
        if len(idx) == 0:
            break
        r = np.sqrt(np.sum(x * x, axis=1))
        sp = np.sqrt(np.sum(v * v, axis=1))
        dt = (c * r / sp)[:, None]
        k1x, k1v = v, acc(x, h2)
        k2x, k2v = v + 0.5 * dt * k1v, acc(x + 0.5 * dt * k1x, h2)
        k3x, k3v = v + 0.5 * dt * k2v, acc(x + 0.5 * dt * k2x, h2)
        k4x, k4v = v + dt * k3v, acc(x + dt * k3x, h2)
        x1 = x + dt / 6.0 * (k1x + 2 * k2x + 2 * k3x + k4x)
        v1 = v + dt / 6.0 * (k1v + 2 * k2v + 2 * k3v + k4v)
        # plane crossings inside this step: the root of the cubic Hermite through both ends, by bisection
        cm = (x[:, 1] * x1[:, 1] < 0) | ((x1[:, 1] == 0) & (x[:, 1] != 0))
        if cm.any():
            j = np.nonzero(cm)[0]
            p0, p1, v0, vv1, D = x[j], x1[j], v[j], v1[j], dt[j, 0]
            lo = np.zeros(len(j))
            hi = np.ones(len(j))
            y0 = p0[:, 1]

            def herm(s, comp):
                s2, s3 = s * s, s * s * s
                return ((2 * s3 - 3 * s2 + 1) * p0[:, comp] + (s3 - 2 * s2 + s) * D * v0[:, comp]
                        + (-2 * s3 + 3 * s2) * p1[:, comp] + (s3 - s2) * D * vv1[:, comp])

            def dherm(s, comp):
                s2 = s * s
                return ((6 * s2 - 6 * s) * p0[:, comp] + (3 * s2 - 4 * s + 1) * D * v0[:, comp]
                        + (-6 * s2 + 6 * s) * p1[:, comp] + (3 * s2 - 2 * s) * D * vv1[:, comp]) / D

            for _ in range(40):
                mid = 0.5 * (lo + hi)
                ym = herm(mid, 1)
                same = np.sign(ym) == np.sign(y0)
                lo = np.where(same, mid, lo)
                hi = np.where(same, hi, mid)
            s = 0.5 * (lo + hi)
            px, pz = herm(s, 0), herm(s, 2)
            rho = np.hypot(px, pz)
            vx, vy, vz = dherm(s, 0), dherm(s, 1), dherm(s, 2)
            vn = np.sqrt(vx * vx + vy * vy + vz * vz)
            # Doppler factor exactly as the shader writes it (circular orbits, rotation (-z, 0, x), light leaving
            # against the traced direction)
            with np.errstate(invalid='ignore', divide='ignore'):
                be = np.sqrt(0.5 / (rho - 1.0))
                cosang = ((-pz) * (-vx) + px * (-vz)) / (rho * vn)
                g = np.sqrt(1.0 - 1.0 / rho) * np.sqrt(1.0 - be * be) / (1.0 - be * cosang)
            g = np.where(rho > 1.6, g, np.nan)
            gi = idx[j]
            slot = ncross[gi]
            ok = slot < ncap
            cr[gi[ok], slot[ok]] = rho[ok]
            cphi[gi[ok], slot[ok]] = np.arctan2(pz, px)[ok]
            cg[gi[ok], slot[ok]] = g[ok]
            ncross[gi] += 1
        x, v = x1, v1
        r1 = np.sqrt(np.sum(x * x, axis=1))
        rv = np.sum(x * v, axis=1)
        # fell in: inside the photon sphere and moving inwards never comes back out
        cap = (r1 < 1.0005) | ((r1 < 1.5) & (rv < 0))
        esc = (r1 > 90.0) & (rv > 0)
        done = cap | esc
        if done.any():
            fate[idx[cap]] = 1
            fate[idx[esc]] = 2
            keep = ~done
            idx, x, v, h2 = idx[keep], x[keep], v[keep], h2[keep]
    return cr, cphi, cg, ncross, fate


def full_geodesic(x0, d, rtol=1e-12):
    """Formulation B for one ray: the geodesic equations in Schwarzschild coordinates with the polar axis along +y
    (so the disc is theta = pi/2), affine parameter, DOP853. Same initial tangent as the shader (coordinate-flat).
    Returns the list of plane-crossing radii."""
    from scipy.integrate import solve_ivp
    x0 = np.asarray(x0, float)
    d = np.asarray(d, float)
    # Cartesian (x, y, z) -> spherical with the polar axis +y: x = r sin(th) cos(ph), z = r sin(th) sin(ph)
    r0 = np.linalg.norm(x0)
    th0 = np.arccos(x0[1] / r0)
    ph0 = np.arctan2(x0[2], x0[0])
    rh = x0 / r0
    thh = np.array([np.cos(th0) * np.cos(ph0), -np.sin(th0), np.cos(th0) * np.sin(ph0)])
    phh = np.array([-np.sin(ph0), 0.0, np.cos(ph0)])
    dr = d @ rh
    dth = (d @ thh) / r0
    dph = (d @ phh) / (r0 * np.sin(th0))
    f0 = 1 - 1 / r0
    dtt = np.sqrt((dr * dr / f0 + r0 * r0 * (dth * dth + np.sin(th0) ** 2 * dph * dph)) / f0)

    def rhs(_, s):
        t, r, th, ph, vt, vr, vth, vph = s
        f = 1 - 1 / r
        sn, cs = np.sin(th), np.cos(th)
        at = -(1 / (r * r * f)) * vt * vr
        ar = -(f / (2 * r * r)) * vt * vt + (1 / (2 * r * r * f)) * vr * vr + r * f * (vth * vth + sn * sn * vph * vph)
        ath = -(2 / r) * vr * vth + sn * cs * vph * vph
        aph = -(2 / r) * vr * vph - 2 * (cs / sn) * vth * vph
        return [vt, vr, vth, vph, at, ar, ath, aph]

    def ev_plane(_, s):
        return np.cos(s[2])

    def ev_in(_, s):
        return s[1] - 1.0005
    ev_in.terminal = True

    def ev_out(_, s):
        return s[1] - 90.0
    ev_out.terminal = True
    ev_out.direction = 1
    sol = solve_ivp(rhs, (0, 1e4), [0, r0, th0, ph0, dtt, dr, dth, dph], method='DOP853', rtol=rtol, atol=1e-12,
                    events=[ev_plane, ev_in, ev_out], max_step=0.5)
    return [float(s[1]) for s in sol.y_events[0]]


def trace_cached(tag, cam, xs, ys):
    """trace() for the camera's rays through (xs, ys), cached in .scratch/hole/phys/ref_<tag>.npz (a run takes a few
    minutes per 400k rays; the figures are redrawn far more often than the rays change)."""
    path = os.path.join(PHYS, f'ref_{tag}.npz')
    key = np.array([cam['focal'], cam['dist'], *cam['e1'], *cam['R'], *cam['U'], *cam['center'], len(xs), xs.sum(), ys.sum()])
    if os.path.exists(path):
        z = np.load(path)
        if z['key'].shape == key.shape and np.allclose(z['key'], key):
            return z['cr'], z['cphi'], z['cg'], z['ncross'], z['fate'], 0.0
    t0 = time.time()
    cr, cphi, cg, ncross, fate = trace(np.array(cam['e1']) * cam['dist'], ray_dirs(cam, xs, ys))
    np.savez_compressed(path, key=key, cr=cr, cphi=cphi, cg=cg, ncross=ncross, fate=fate)
    return cr, cphi, cg, ncross, fate, time.time() - t0


def shader_slots(cr, ncross):
    """What the live shader keeps in its two slots: crossing 1, and crossing 2 if either of the first two hit the
    disc, else the LAST crossing (its loop overwrites slot 2 on every later crossing until one stops it)."""
    hit = lambda r: (r > RIN * 0.98) & (r < ROUT)
    s1 = np.where(ncross >= 1, cr[:, 0], -1.0)
    stop2 = hit(cr[:, 0]) | hit(cr[:, 1])
    last = np.take_along_axis(cr, np.clip(ncross - 1, 0, cr.shape[1] - 1)[:, None], axis=1)[:, 0]
    s2 = np.where(ncross >= 2, np.where(stop2, cr[:, 1], last), -1.0)
    return s1, s2


def main():
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    drifts = [0.5, 0.0, 1.0]
    report = {}
    for d in drifts:
        meta, m1 = load(f'shader_m1_d{d:g}')
        _, m2 = load(f'shader_m2_d{d:g}')
        cam = meta['cam']
        w, h = meta['view']['bw'], meta['view']['bh']
        stride = 2
        ys, xs = np.mgrid[0:h:stride, 0:w:stride]
        xs = xs.ravel() + 0.5
        ys = ys.ravel() + 0.5
        cr, cphi, cg, ncross, fate, t_trace = trace_cached(f'd{d:g}', cam, xs, ys)
        gh, gw = h // stride, w // stride
        ref1, ref2 = shader_slots(cr, ncross)
        ref1 = ref1.reshape(gh, gw)
        ref2 = ref2.reshape(gh, gw)
        sh = m1[::stride, ::stride]
        sh1, sh2 = sh[..., 0].astype(np.float64), sh[..., 1].astype(np.float64)
        shg = m2[::stride, ::stride]
        refg1 = cg[:, 0].reshape(gh, gw)

        # image-plane geometry: offsets from the hole in pixels, and the projected spin axis (the mirror line)
        R, U = np.array(cam['R']), np.array(cam['U'])
        ax = np.array([R[1], U[1]])
        ax /= np.linalg.norm(ax)
        ox = (xs - cam['center'][0]).reshape(gh, gw)
        oy = (ys - cam['center'][1]).reshape(gh, gw)
        side = ox * ax[1] - oy * ax[0]  # signed distance from the axis: > 0 right of it
        shadow = cam['shadowPx']

        # how far the shader's isoradials sit from the reference's, in pixels: dr / |grad r|
        def contour_offsets(a_sh, a_ref, r0, band=0.06):
            gy, gx = np.gradient(a_ref, stride)
            grad = np.hypot(gx, gy)
            valid = (a_ref > 0) & (a_sh > 0) & (np.abs(a_ref - r0) < band * r0) & (grad > 1e-6)
            # ignore pixels where neighbours see different images (the gradient is a jump, not a slope)
            valid &= grad < 0.5
            off = np.where(valid, (a_sh - a_ref) / np.where(grad > 0, grad, 1), np.nan)
            out = {}
            for nm, msk in (('left', side < 0), ('right', side > 0)):
                v = np.abs(off[valid & msk])
                out[nm] = {'n': int(v.size), 'median_px': float(np.median(v)) if v.size else None,
                           'p99_px': float(np.percentile(v, 99)) if v.size else None}
            return out

        res = {'trace_s': round(t_trace, 1), 'rays': int(len(xs)), 'shadow_px': shadow}
        for nm, a_sh, a_ref in (('crossing1', sh1, ref1), ('crossing2', sh2, ref2)):
            res[nm] = {str(r0): contour_offsets(a_sh, a_ref, r0) for r0, _ in ISO}
        # where the two disagree on whether there is a crossing at all (the shader's step budget runs out next to
        # the shadow's edge): count and how far from the edge
        miss = ((ref2 > RIN * 0.98) & (ref2 < ROUT)) & ~((sh2 > RIN * 0.98) & (sh2 < ROUT))
        rad = np.hypot(ox, oy) / shadow
        res['crossing2_missing_in_shader'] = {'pixels_at_stride': int(miss.sum()),
                                              'max_dist_from_centre_in_shadow_radii': float(rad[miss].max()) if miss.any() else None}

        # mirror test: sample each map at the pixel mirrored about the projected axis (nearest grid point)
        def mirror_sample(a):
            px, py = ox, oy
            dot = px * ax[0] + py * ax[1]
            mx, my = 2 * dot * ax[0] - px, 2 * dot * ax[1] - py
            gxp = np.clip(np.round((mx + cam['center'][0] - 0.5) / stride).astype(int), 0, gw - 1)
            gyp = np.clip(np.round((my + cam['center'][1] - 0.5) / stride).astype(int), 0, gh - 1)
            return a[gyp, gxp]

        # exact mirror test: the shader rendered again with every pixel tracing its mirror image's ray
        _, mm = load(f'shader_m1_d{d:g}_mirror')
        full1, mir1 = m1[..., 0].astype(np.float64), mm[..., 0].astype(np.float64)
        ok = (full1 > RIN) & (full1 < ROUT) & (mir1 > RIN) & (mir1 < ROUT)
        dr = np.abs(full1 - mir1)[ok]
        res['mirror_exact_shader_r1'] = {'pixels': int(ok.sum()), 'max_dr': float(dr.max()), 'p99_dr': float(np.percentile(dr, 99))}
        full2, mir2 = m1[..., 1].astype(np.float64), mm[..., 1].astype(np.float64)
        ok = (full2 > RIN) & (full2 < ROUT) & (mir2 > RIN) & (mir2 < ROUT)
        dr = np.abs(full2 - mir2)[ok]
        res['mirror_exact_shader_r2'] = {'pixels': int(ok.sum()), 'max_dr': float(dr.max()), 'p99_dr': float(np.percentile(dr, 99))}
        # brightness: the shader's beaming g^6.66 against physics' g^4, on the two sides
        okg = (sh1 > RIN) & (sh1 < ROUT)
        gs = shg[..., 2].astype(np.float64)
        res['g_first_image'] = {
            'right_max': float(np.nanmax(np.where(okg & (side > 0), gs, np.nan))),
            'left_min': float(np.nanmin(np.where(okg & (side < 0), gs, np.nan))),
            'g_ref_vs_shader_median_abs': float(np.nanmedian(np.abs(np.where(okg, gs - refg1, np.nan)))),
        }
        report[f'd{d:g}'] = res
        print(f'd={d:g}: {len(xs)} rays ({t_trace:.1f}s)', flush=True)

        if d == 0.5:
            # ---- figure 1: isoradials, shader against reference, both images of the disc
            fig, axs = plt.subplots(1, 2, figsize=(20, 7.6), dpi=110)
            ext = [-cam['center'][0] / shadow, (w - cam['center'][0]) / shadow, -cam['center'][1] / shadow, (h - cam['center'][1]) / shadow]
            gx_ = ox[0] / shadow
            gy_ = oy[:, 0] / shadow
            cols = ['#ff5a36', '#ffd23f', '#3ddc97', '#5aa9ff']
            for k, (a_sh, a_ref, title) in enumerate(((sh1, ref1, 'first crossing of the disc plane (near side, and the far side bent over the top)'),
                                                     (sh2, ref2, 'second crossing (the far side bent under the shadow, and the thin ring round it)'))):
                axk = axs[k]
                img = np.where((a_sh > 0) & (a_sh < 30), a_sh, np.nan)
                axk.imshow(np.log(img), origin='lower', extent=ext, cmap='Greys_r', alpha=0.85)
                for (r0, lab), cc in zip(ISO, cols):
                    axk.contour(gx_, gy_, np.where(a_sh > 0, a_sh, np.nan), levels=[r0], colors=[cc], linewidths=2.2)
                    axk.contour(gx_, gy_, np.where(a_ref > 0, a_ref, np.nan), levels=[r0], colors=['k'], linewidths=0.9, linestyles='--')
                axk.add_patch(plt.Circle((0, 0), 1.0, fill=False, color='w', lw=0.8, ls=':'))
                axk.set_xlim(-6.2, 6.2)
                axk.set_ylim(-3.6, 3.6)
                axk.set_aspect('equal')
                axk.set_title(title, fontsize=11)
                axk.set_xlabel('screen x, in shadow radii (hole centre at 0)')
                axk.axline((0, 0), (ax[0], ax[1]), color='#888', lw=0.7, ls='-.')
            handles = [plt.Line2D([], [], color=cc, lw=2.2, label='shader ' + lab) for (r0, lab), cc in zip(ISO, cols)]
            handles.append(plt.Line2D([], [], color='k', lw=0.9, ls='--', label='reference geodesic (dashed)'))
            fig.legend(handles=handles, loc='lower center', ncol=5, fontsize=10, frameon=False)
            fig.suptitle('Live shader vs independent Schwarzschild geodesics: isoradial curves (live desktop camera, drift 0.5: elevation 6.5 deg, roll -0.5 deg)', fontsize=13)
            fig.tight_layout(rect=(0, 0.06, 1, 0.95))
            fig.savefig(os.path.join(PHYS, 'isoradials_shader_vs_reference.png'))
            plt.close(fig)

            # ---- figure 2: left against right, mirrored about the projected spin axis
            fig, axs = plt.subplots(1, 2, figsize=(20, 7.6), dpi=110)
            for k, (a_sh, title) in enumerate(((sh1, 'first crossing'), (sh2, 'second crossing'))):
                axk = axs[k]
                am = mirror_sample(a_sh)
                img = np.where((a_sh > 0) & (a_sh < 30), a_sh, np.nan)
                axk.imshow(np.log(img), origin='lower', extent=ext, cmap='Greys_r', alpha=0.85)
                for (r0, lab), cc in zip(ISO, cols):
                    axk.contour(gx_, gy_, np.where(a_sh > 0, a_sh, np.nan), levels=[r0], colors=[cc], linewidths=2.2)
                    axk.contour(gx_, gy_, np.where(am > 0, am, np.nan), levels=[r0], colors=['k'], linewidths=0.9, linestyles='--')
                axk.set_xlim(-6.2, 6.2)
                axk.set_ylim(-3.6, 3.6)
                axk.set_aspect('equal')
                axk.axline((0, 0), (ax[0], ax[1]), color='#888', lw=0.7, ls='-.')
                axk.set_title(f'{title}: the shader (solid) and the shader mirrored left-right about the spin axis (dashed)', fontsize=11)
            fig.legend(handles=handles[:-1] + [plt.Line2D([], [], color='k', lw=0.9, ls='--', label='mirror image (dashed)')], loc='lower center', ncol=5, fontsize=10, frameon=False)
            fig.suptitle('Left and right of the hole are mirror images: the lensed shape is the same on both sides', fontsize=13)
            fig.tight_layout(rect=(0, 0.06, 1, 0.95))
            fig.savefig(os.path.join(PHYS, 'isoradials_left_vs_right_mirrored.png'))
            plt.close(fig)

            # ---- figure 3: what IS different left and right: the Doppler factor and what the shader does with it
            fig, axs = plt.subplots(1, 3, figsize=(24, 6.6), dpi=100)
            gmap = np.where(okg, gs, np.where((sh2 > RIN) & (sh2 < ROUT), shg[..., 3], np.nan))
            im = axs[0].imshow(gmap, origin='lower', extent=ext, cmap='coolwarm_r', vmin=0.45, vmax=1.45)
            axs[0].set_title('Doppler + gravitational shift g on the disc (blue: towards us)')
            fig.colorbar(im, ax=axs[0], fraction=0.03)
            im = axs[1].imshow(np.log10(gmap ** 4), origin='lower', extent=ext, cmap='magma', vmin=-1.5, vmax=1.0)
            axs[1].set_title('physics: brightness x g^4 (log10)')
            fig.colorbar(im, ax=axs[1], fraction=0.03)
            im = axs[2].imshow(np.log10(gmap ** (1.85 * 3.6)), origin='lower', extent=ext, cmap='magma', vmin=-1.5, vmax=1.0)
            axs[2].set_title('live shader: brightness x g^6.66 (log10, same scale)')
            fig.colorbar(im, ax=axs[2], fraction=0.03)
            for a_ in axs:
                a_.set_xlim(-6.2, 6.2)
                a_.set_ylim(-3.6, 3.6)
                a_.set_aspect('equal')
            fig.suptitle('Only the brightness differs: the approaching (right) side is beamed. The live shader boosts it about 1,500x over the receding side where physics gives about 80x', fontsize=13)
            fig.tight_layout(rect=(0, 0, 1, 0.93))
            fig.savefig(os.path.join(PHYS, 'doppler_brightness_left_vs_right.png'))
            plt.close(fig)

    overlay_live(report)

    # ---- spot check of the integrator against the full geodesic equations
    meta, _ = load('shader_m1_d0.5')
    cam = meta['cam']
    rng = np.random.default_rng(7)
    pts = []
    for _ in range(40):
        rr = rng.uniform(1.05, 5.5) * cam['shadowPx']
        an = rng.uniform(0, 2 * np.pi)
        pts.append((cam['center'][0] + rr * np.cos(an), cam['center'][1] + rr * np.sin(an)))
    pts = np.array(pts)
    dirs = ray_dirs(cam, pts[:, 0], pts[:, 1])
    x0 = np.array(cam['e1']) * cam['dist']
    crA, _, _, ncA, _ = trace(x0, dirs)
    worst = 0.0
    for i in range(len(pts)):
        rb = full_geodesic(x0, dirs[i])
        ra = [r for r in crA[i] if r > 0]
        k = min(len(ra), len(rb), 2)
        for j in range(k):
            worst = max(worst, abs(ra[j] - rb[j]))
    report['integrator_vs_full_geodesic'] = {'rays': len(pts), 'max_abs_dr_first_two_crossings': worst}
    with open(os.path.join(PHYS, 'report.json'), 'w') as f:
        json.dump(report, f, indent=1)
    print(json.dumps(report, indent=1))


def overlay_live(report):
    """The true isoradials drawn on the live render itself: .scratch/hole/live/live-desktop-d0.5.png is a screenshot of
    the dev server at 1920x1080 CSS (2x, so 3840x2160) at drift 0.5; shader_m1_live4k is the live shader's mapping
    for exactly that camera. Writes live_screenshot_with_true_isoradials.png."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from PIL import Image
    shot = os.path.normpath(os.path.join(PHYS, '..', 'live', 'live-desktop-d0.5.png'))
    if not os.path.exists(shot):
        return
    meta, m1 = load('shader_m1_live4k')
    cam = meta['cam']
    W, H = meta['view']['bw'], meta['view']['bh']
    x0, x1, y0, y1 = 950, 3840, 180, 1960  # crop, screen pixels from the top left
    stride = 4
    yy, xx = np.mgrid[y0:y1:stride, x0:x1:stride]
    xs = xx.ravel() + 0.5
    ys = (H - yy.ravel()) - 0.5  # camera y runs up from the bottom
    cr, _, _, ncross, _, _ = trace_cached('live4k', cam, xs, ys)
    ref1, ref2 = shader_slots(cr, ncross)
    gh, gw = yy.shape
    ref1, ref2 = ref1.reshape(gh, gw), ref2.reshape(gh, gw)
    sh = m1[::-1][y0:y1:stride, x0:x1:stride]  # rows of the float map run bottom to top
    img = np.asarray(Image.open(shot).convert('RGB'))[y0:y1, x0:x1]
    fig = plt.figure(figsize=(img.shape[1] / 200, img.shape[0] / 200), dpi=200)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.imshow(img, extent=[x0, x1, y1, y0])
    cols = ['#ff5a36', '#ffd23f', '#3ddc97', '#5aa9ff']
    gx = xx[0] + 0.5
    gy = yy[:, 0] + 0.5
    for (r0, lab), cc in zip(ISO, cols):
        for a, ls in ((ref1, '-'), (ref2, '--')):
            ax.contour(gx, gy, np.where(a > 0, a, np.nan), levels=[r0], colors=[cc], linewidths=1.1, linestyles=ls, alpha=0.95)
    ax.set_xlim(x0, x1)
    ax.set_ylim(y1, y0)
    ax.axis('off')
    handles = [plt.Line2D([], [], color=cc, lw=1.4, label=lab) for (r0, lab), cc in zip(ISO, cols)]
    handles += [plt.Line2D([], [], color='w', lw=1.2, label='solid: first crossing (near side, far side bent over the top)'),
                plt.Line2D([], [], color='w', lw=1.2, ls='--', label='dashed: second crossing (far side bent under the shadow)')]
    leg = ax.legend(handles=handles, loc='lower left', fontsize=7, frameon=True, facecolor='#000', edgecolor='#444', labelcolor='w')
    ax.text(0.01, 0.98, 'Live render (dev server, 1920x1080 @2x, drift 0.5) with the isoradials of independently integrated Schwarzschild geodesics drawn on it.\n'
            'Left and right are mirror images. The white patch at 1 to 3 o\'clock is the inner edge (r = 6M) of the side moving towards us: beamed, not bent.',
            transform=ax.transAxes, va='top', fontsize=7.5, color='w')
    fig.savefig(os.path.join(PHYS, 'live_screenshot_with_true_isoradials.png'))
    plt.close(fig)
    ok = (ref1 > RIN) & (ref1 < ROUT) & (sh[..., 0] > RIN) & (sh[..., 0] < ROUT)
    report['live4k_shader_vs_reference_r1'] = {'pixels': int(ok.sum()), 'max_dr': float(np.abs(ref1 - sh[..., 0])[ok].max())}
    # the new offline renderer (shaders.js SCENE): its slots go strictly by crossing number, so compare with the
    # reference's crossings 1, 2 and 3 directly
    if os.path.exists(os.path.join(PHYS, 'new_live4k.f32')):
        _, nm = load('new_live4k')
        nm = nm[::-1][y0:y1:stride, x0:x1:stride]
        out = {}
        for k in range(3):
            a = nm[..., k].astype(np.float64)
            rr = cr[:, k].reshape(gh, gw)
            okk = (a > RIN) & (a < ROUT) & (rr > RIN) & (rr < ROUT)
            gy, gx = np.gradient(rr, stride)
            grad = np.hypot(gx, gy)
            okp = okk & (grad > 1e-6) & (grad < 0.5)
            offs = np.abs(a - rr)[okp] / grad[okp]
            out[f'crossing{k + 1}'] = {'pixels': int(okk.sum()), 'max_dr': float(np.abs(a - rr)[okk].max()) if okk.any() else None,
                                       'p99_offset_px': float(np.percentile(offs, 99)) if offs.size else None}
        report['new_renderer_live4k_vs_reference'] = out


if __name__ == '__main__':
    sys.exit(main())
