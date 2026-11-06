/**
 * CALIMA · an allocation-free clip player for one person (settlements; plan §0 rule 5, `A-alloc-rate`).
 *
 * three's AnimationMixer boxes a double per track per update in `Interpolant.evaluate` (about 40 B a track: 2-3 KB per person per
 * update, measured with V8's sampling heap profiler in node and by `A-alloc-rate` in the game, where it put this lane's owner row
 * at 1.75x its W0b baseline). This plays the same clips from the same pack straight into a preallocated pose:
 *
 *   - a clip is bound once per person: per track a bone index, its times and values (the pack's own typed arrays) and a cached key;
 *   - between keys, a normalised lerp on the shorter arc (keys are about 33 ms apart: indistinguishable from slerp, and no trig);
 *   - a cross-fade runs from a snapshot of the last pose to the new clip, so a clip change mid-fade never pops;
 *   - bones a clip does not animate go back to bind, as three restores a binding no action uses any more;
 *   - every bone is written on every update, so an overlay composed after this (lean, look, carriage) never compounds.
 *
 * Nothing in `update` allocates: no closures, no calls with number arguments in the loops, typed arrays only.
 */
export class PosePlayer {
  /** @param bones name -> Bone of one person (the dyn_ chains and prop_ joints are not the clips' and are left alone) */
  constructor(bones) {
    const list = [];
    for (const name in bones) if (!/^(dyn_|prop_)/.test(name)) list.push(bones[name]);
    this.bones = list;
    this.index = new Map(list.map((b, i) => [b.name, i]));
    const n = list.length;
    this.bindQ = new Float32Array(n * 4);
    this.bindP = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { list[i].quaternion.toArray(this.bindQ, i * 4); list[i].position.toArray(this.bindP, i * 3); }
    this.outQ = Float32Array.from(this.bindQ);
    this.outP = Float32Array.from(this.bindP);
    this.tgtQ = new Float32Array(n * 4);
    this.tgtP = new Float32Array(n * 3);
    this.snapQ = new Float32Array(n * 4);
    this.snapP = new Float32Array(n * 3);
    /** bones whose position any bound clip animates (the pelvis): only those positions are written */
    this.hasP = new Uint8Array(n);
    this.bound = new Map();
    this.current = null;
    this.fade = 0;
    this.fadeDur = 0;
    /** the tick's length (s): set before `update()` (a field, not an argument: no boxed number per call) */
    this.step = 0;
  }

  /** A clip bound to these bones (once per clip per person). The object is also the "playing" record: `time`, `getClip()`. */
  bind(clip) {
    let b = this.bound.get(clip.name);
    if (b) return b;
    const bi = [], kind = [], times = [], values = [];
    for (const tr of clip.tracks) {
      const dot = tr.name.lastIndexOf('.');
      const i = this.index.get(tr.name.slice(0, dot));
      const prop = tr.name.slice(dot + 1);
      if (i === undefined || (prop !== 'quaternion' && prop !== 'position')) continue;
      bi.push(i); kind.push(prop === 'quaternion' ? 1 : 0); times.push(tr.times); values.push(tr.values);
      if (prop === 'position') this.hasP[i] = 1;
    }
    b = {
      clip, name: clip.name, duration: clip.duration, n: bi.length,
      bi: Int32Array.from(bi), kind: Uint8Array.from(kind), times, values, cache: new Int32Array(bi.length),
      time: 0, ts: 1, loop: true,
      getClip() { return this.clip; },
    };
    this.bound.set(clip.name, b);
    return b;
  }

  /** Start a clip (a cross-fade of `fade` s from the pose as it stands). Returns the playing record. */
  play(clip, { fade = 0.35, ts = 1, loop = true, offset = null } = {}) {
    const b = this.bind(clip);
    if (this.current === b) { b.ts = ts; return b; }
    this.snapQ.set(this.outQ);
    this.snapP.set(this.outP);
    this.fadeDur = fade > 0 ? fade : 0;
    this.fade = this.fadeDur;
    b.time = offset !== null ? offset * b.duration : 0;
    b.ts = ts;
    b.loop = loop;
    b.cache.fill(0);
    this.current = b;
    return b;
  }

  /** Advance the clip by `this.step` s (scaled by its time scale), blend, and write every bone. */
  update() {
    const step = this.step;
    const b = this.current;
    if (!b) return;
    const D = b.duration;
    let t = b.time + step * b.ts;
    if (b.loop) { if (D > 0) { t %= D; if (t < 0) t += D; } } else if (t > D) t = D; else if (t < 0) t = 0;
    if (t < b.time) b.cache.fill(0);
    b.time = t;
    const tq = this.tgtQ, tp = this.tgtP;
    tq.set(this.bindQ);
    tp.set(this.bindP);
    const nT = b.n, BI = b.bi, K = b.kind, C = b.cache, TT = b.times, VV = b.values;
    for (let k = 0; k < nT; k++) {
      const tm = TT[k], vv = VV[k], nk = tm.length, o = BI[k];
      let i = C[k], a = 0;
      if (nk > 1) {
        if (i > nk - 2 || t < tm[i]) i = 0;
        while (i < nk - 2 && t >= tm[i + 1]) i++;
        C[k] = i;
        const t0 = tm[i], t1 = tm[i + 1];
        a = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
        if (a < 0) a = 0; else if (a > 1) a = 1;
      } else i = 0;
      if (K[k] === 1) {
        const s0 = i * 4, s1 = nk > 1 ? s0 + 4 : s0;
        const x0 = vv[s0], y0 = vv[s0 + 1], z0 = vv[s0 + 2], w0 = vv[s0 + 3];
        let x1 = vv[s1], y1 = vv[s1 + 1], z1 = vv[s1 + 2], w1 = vv[s1 + 3];
        if (x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1 < 0) { x1 = -x1; y1 = -y1; z1 = -z1; w1 = -w1; }
        const x = x0 + (x1 - x0) * a, y = y0 + (y1 - y0) * a, z = z0 + (z1 - z0) * a, w = w0 + (w1 - w0) * a;
        const l = Math.sqrt(x * x + y * y + z * z + w * w);
        const f = l > 1e-9 ? 1 / l : 0;
        const q = o * 4;
        tq[q] = x * f; tq[q + 1] = y * f; tq[q + 2] = z * f; tq[q + 3] = w * f;
      } else {
        const s0 = i * 3, s1 = nk > 1 ? s0 + 3 : s0, p = o * 3;
        tp[p] = vv[s0] + (vv[s1] - vv[s0]) * a;
        tp[p + 1] = vv[s0 + 1] + (vv[s1 + 1] - vv[s0 + 1]) * a;
        tp[p + 2] = vv[s0 + 2] + (vv[s1 + 2] - vv[s0 + 2]) * a;
      }
    }
    // the cross-fade from the snapshot
    const oq = this.outQ, op = this.outP, n = this.bones.length;
    let wf = 1;
    if (this.fade > 0) {
      this.fade -= step;
      wf = this.fade > 0 && this.fadeDur > 0 ? 1 - this.fade / this.fadeDur : 1;
    }
    if (wf >= 1) { oq.set(tq); op.set(tp); } else {
      const sq = this.snapQ, sp = this.snapP;
      for (let j = 0; j < n; j++) {
        const q = j * 4;
        const x0 = sq[q], y0 = sq[q + 1], z0 = sq[q + 2], w0 = sq[q + 3];
        let x1 = tq[q], y1 = tq[q + 1], z1 = tq[q + 2], w1 = tq[q + 3];
        if (x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1 < 0) { x1 = -x1; y1 = -y1; z1 = -z1; w1 = -w1; }
        const x = x0 + (x1 - x0) * wf, y = y0 + (y1 - y0) * wf, z = z0 + (z1 - z0) * wf, w = w0 + (w1 - w0) * wf;
        const l = Math.sqrt(x * x + y * y + z * z + w * w);
        const f = l > 1e-9 ? 1 / l : 0;
        oq[q] = x * f; oq[q + 1] = y * f; oq[q + 2] = z * f; oq[q + 3] = w * f;
        const p = j * 3;
        op[p] = sp[p] + (tp[p] - sp[p]) * wf; op[p + 1] = sp[p + 1] + (tp[p + 1] - sp[p + 1]) * wf; op[p + 2] = sp[p + 2] + (tp[p + 2] - sp[p + 2]) * wf;
      }
    }
    // into the bones (the private fields: no change callback, so no Euler sync per bone per frame; nothing reads a bone's Euler)
    const B = this.bones, H = this.hasP;
    for (let j = 0; j < n; j++) {
      const bq = B[j].quaternion, q = j * 4;
      bq._x = oq[q]; bq._y = oq[q + 1]; bq._z = oq[q + 2]; bq._w = oq[q + 3];
      if (H[j] === 1) { const bp = B[j].position, p = j * 3; bp.x = op[p]; bp.y = op[p + 1]; bp.z = op[p + 2]; }
    }
  }

  dispose() {
    this.bound.clear();
    this.current = null;
    this.bones = [];
  }
}

/**
 * The rotation (and uniform-scale-free position) of a world matrix into `q` (and `p`, `s` when given), with no call that takes or
 * returns a number: `Matrix4.decompose` calls `determinant()`, whose returned number is boxed (about 130 B per person per frame in
 * the chain solve and the head overlays, measured). The bones here have positive scale, so no reflection check is needed.
 */
export function rotOf(e, q, p = null, s = null) {
  const sx = Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]), sy = Math.sqrt(e[4] * e[4] + e[5] * e[5] + e[6] * e[6]), sz = Math.sqrt(e[8] * e[8] + e[9] * e[9] + e[10] * e[10]);
  const ix = sx > 0 ? 1 / sx : 0, iy = sy > 0 ? 1 / sy : 0, iz = sz > 0 ? 1 / sz : 0;
  const m11 = e[0] * ix, m12 = e[4] * iy, m13 = e[8] * iz, m21 = e[1] * ix, m22 = e[5] * iy, m23 = e[9] * iz, m31 = e[2] * ix, m32 = e[6] * iy, m33 = e[10] * iz;
  const tr = m11 + m22 + m33;
  let x, y, z, w;
  if (tr > 0) { const k = 0.5 / Math.sqrt(tr + 1); w = 0.25 / k; x = (m32 - m23) * k; y = (m13 - m31) * k; z = (m21 - m12) * k; }
  else if (m11 > m22 && m11 > m33) { const k = 2 * Math.sqrt(1 + m11 - m22 - m33); w = (m32 - m23) / k; x = 0.25 * k; y = (m12 + m21) / k; z = (m13 + m31) / k; }
  else if (m22 > m33) { const k = 2 * Math.sqrt(1 + m22 - m11 - m33); w = (m13 - m31) / k; x = (m12 + m21) / k; y = 0.25 * k; z = (m23 + m32) / k; }
  else { const k = 2 * Math.sqrt(1 + m33 - m11 - m22); w = (m21 - m12) / k; x = (m13 + m31) / k; y = (m23 + m32) / k; z = 0.25 * k; }
  q._x = x; q._y = y; q._z = z; q._w = w;
  if (p) { p.x = e[12]; p.y = e[13]; p.z = e[14]; }
  if (s) { s.x = sx; s.y = sy; s.z = sz; }
}
