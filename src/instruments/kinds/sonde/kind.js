import * as THREE from 'three';
import { liveKindClass } from '../kiln/live-kind.js';
import { SondeBrain, SONDE_RULES, bearingOf } from './rules.js';
import { SONDE_ROSTER, SONDE_POST, SONDE_TETHER } from './form.js';
import { M3_LIVE_URLS } from '../kiln/files.js';

/**
 * THE SONDE AS A LIVE KIND (Milestone 3 wave 3c, area C; BUILD M3.4, IK7). Its body is the surfaced GLB
 * (gen-m3-art.mjs, public/models/instruments/sonde.glb); its brain is a `SondeBrain` (./rules.js) moored on its 18 m
 * banded tether over its post, stepped here every frame in the island's wind (`environment.windAt`: the trade, from
 * 045) over the drawn ground. `m.rules` is the brain: "A Line Over the Glass" (src/game/hour2/glass-line.js
 * `_liveSonde`) finds a live Sonde within 60 m of the Ring and calls its `cutTether()`; the hull then goes adrift
 * downwind (IK7: within 10 deg of the wind's bearing) and comes down inside 60 s, and the machine is taken out of the
 * world GONE_S after it is down.
 *
 * Drawn here besides the hull: the post (an iron stake, SONDE_POST) and the tether, banded red and staff-white every
 * metre (SONDE_TETHER), from the post's shackle to the keel ring; once cut, a short tail of it hangs from the keel.
 * The two fans' rotors turn (the GLB's `rotorR`, `rotorL` nodes).
 */
export const SONDE_ID = 'sonde';
export const SONDE_URL = M3_LIVE_URLS.sonde;
/** s after it is down until the machine is taken out of the world */
export const GONE_S = 20;

const Base = liveKindClass({ id: SONDE_ID, displayName: 'Sonde', bodyRadius: 0.3, maxHealth: 300 });

function bandTexture() {
  const c = document.createElement('canvas'); c.width = 2; c.height = 2;
  const g = c.getContext('2d');
  g.fillStyle = SONDE_TETHER.colours[0]; g.fillRect(0, 0, 2, 1);
  g.fillStyle = SONDE_TETHER.colours[1]; g.fillRect(0, 1, 2, 1);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class SondeLive extends Base {
  constructor(ctx, manager, opts = {}) {
    super(ctx, manager, opts);
    const gy = ctx.terrain?.getHeight?.(this.position.x, this.position.z) ?? 0;
    this.rules = opts.brain || new SondeBrain({ post: { x: this.position.x, y: gy, z: this.position.z } });
    this.brain = this.rules;
    this._wind = { x: 0, z: 0 };
    this._windRec = { speed: 0, fromDeg: 45 };
    this._groundT = 0;
    this.stats = { cutAt: null, cutPos: null, downAt: null, downPos: null, windFromAtCut: null };
    // the post and the tether (world objects: the post stands still, the line follows the keel)
    const W = new THREE.Group(); W.name = 'sonde-mooring';
    const iron = new THREE.MeshStandardMaterial({ color: 0x2f3236, roughness: 0.6, metalness: 0.5 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(SONDE_POST.r * 0.7, SONDE_POST.r, SONDE_POST.h, 10), iron);
    post.position.set(this.rules.post.x, this.rules.post.y + SONDE_POST.h / 2, this.rules.post.z); post.castShadow = true;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(SONDE_POST.base, SONDE_POST.base * 1.1, 0.12, 12), iron);
    foot.position.set(this.rules.post.x, this.rules.post.y + 0.06, this.rules.post.z); foot.receiveShadow = true;
    this._bands = bandTexture();
    const line = new THREE.Mesh(new THREE.CylinderGeometry(SONDE_TETHER.r, SONDE_TETHER.r, 1, 6, 1, true),
      new THREE.MeshStandardMaterial({ map: this._bands, roughness: 0.85 }));
    line.name = 'sonde-tether'; line.castShadow = false;
    W.add(post, foot, line);
    ctx.scene?.add(W);
    this.mooring = W; this.line = line;
    this.rotors = [this.tools.rotorR, this.tools.rotorL].filter(Boolean);
  }

  /** The wind seam at the hull: { speed, fromDeg } (fromDeg the bearing it blows FROM; x east, z -north). */
  _windAt() {
    const E = this.ctx.environment, w = this._windRec;
    if (E?.windAt) {
      const v = this._wind; v.x = 0; v.z = 0;
      const s = E.windAt(this.rules.x, this.rules.z, v);
      const sp = Number.isFinite(s) ? s : Math.hypot(v.x, v.z);
      w.speed = sp;
      if (Math.hypot(v.x, v.z) > 1e-4) w.fromDeg = bearingOf(-v.x, -v.z);
    } else { w.speed = 5.5; w.fromDeg = 45; }
    return w;
  }

  drive(dt) {
    const B = this.rules, T = this.ctx.terrain;
    const wind = this._windAt();
    const wasTethered = B.tethered;
    B.step(Math.min(dt, 0.1), { wind, groundY: (x, z) => T?.getHeight?.(x, z) ?? B.post.y, calima: this.ctx.environment?.weather === 'calima' });
    for (const e of B.events.splice(0)) {
      if (e.type === 'tether-cut') { this.stats.cutAt = +B.t.toFixed(2); this.stats.cutPos = { x: B.x, z: B.z }; this.stats.windFromAtCut = +wind.fromDeg.toFixed(1); }
      if (e.type === 'down') { this.stats.downAt = +B.t.toFixed(2); this.stats.downPos = { x: +B.x.toFixed(2), z: +B.z.toFixed(2) }; }
      this.ctx.events?.emit?.(`sonde:${e.type}`, { ...e, machine: this.id ?? null });
    }
    if (wasTethered && !B.tethered) this.lampWant = 'wary';
    this.pose.x = B.x; this.pose.z = B.z; this.pose.y = B.y; this.pose.heading = B.heading;
    super.drive(dt);
  }

  animateKind(dt) {
    const B = this.rules;
    for (const r of this.rotors) r.rotation.y += dt * (B.flying ? 14 : 0) * (r === this.tools.rotorL ? -1 : 1);
    this.lampWant = B.state === 'down' ? 'dark' : B.tethered ? 'calm' : 'wary';
    this.awake = false;
    this._drawLine();
    if (B.state === 'down') {
      this._groundT += dt;
      if (this._groundT > GONE_S && !this.gone) {
        this.gone = true;
        const L = this.ctx.machines?.list, i = L ? L.indexOf(this) : -1;
        if (i >= 0) L.splice(i, 1);
        this.dispose(); this.root?.removeFromParent();
      }
    }
  }

  /** The tether from the shackle to the keel ring (taut); once cut, a 3 m tail hanging from the keel. */
  _drawLine() {
    const B = this.rules, k = B.keel(), line = this.line;
    const a = B.tethered ? B.shackle() : { x: k.x + 0.4, y: k.y - 3, z: k.z + 0.2 };
    const dx = k.x - a.x, dy = k.y - a.y, dz = k.z - a.z, L = Math.hypot(dx, dy, dz) || 1e-3;
    line.position.set((a.x + k.x) / 2, (a.y + k.y) / 2, (a.z + k.z) / 2);
    line.scale.set(1, L, 1);
    line.quaternion.setFromUnitVectors(_up, _d.set(dx / L, dy / L, dz / L));
    this._bands.repeat.set(1, L / SONDE_TETHER.bandM / 2);
    line.visible = B.state !== 'down';
  }

  /** The tether's length as it runs now (IK7: within 18 m), and the drift's bearing off the wind's since the cut. */
  report() {
    const B = this.rules, s = this.stats;
    let drift = null;
    if (s.cutPos) {
      const dx = B.x - s.cutPos.x, dz = B.z - s.cutPos.z;
      if (Math.hypot(dx, dz) > 1) {
        const brg = bearingOf(dx, dz), downwindDeg = (s.windFromAtCut + 180) % 360;
        drift = { metres: +Math.hypot(dx, dz).toFixed(2), bearing: +brg.toFixed(1), downwind: +downwindDeg.toFixed(1), offDeg: +Math.abs(((brg - downwindDeg + 540) % 360) - 180).toFixed(2) };
      }
    }
    return {
      state: B.state, tethered: B.tethered, tetherM: +B.tetherDist().toFixed(3), cap: SONDE_RULES.tetherM,
      post: { x: +B.post.x.toFixed(2), y: +B.post.y.toFixed(2), z: +B.post.z.toFixed(2) }, hull: { x: +B.x.toFixed(2), y: +B.y.toFixed(2), z: +B.z.toFixed(2) },
      altOverPost: +(B.y - B.post.y).toFixed(2), wind: { ...this._windRec, speed: +this._windRec.speed.toFixed(2), fromDeg: +this._windRec.fromDeg.toFixed(1) },
      cutAt: s.cutAt, downAt: s.downAt, downInS: s.cutAt !== null && s.downAt !== null ? +(s.downAt - s.cutAt).toFixed(2) : null, drift, lamp: this.kindLamp,
    };
  }

  disposeKind() {
    if (this.mooring) {
      this.mooring.removeFromParent();
      this.mooring.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      this._bands?.dispose();
      this.mooring = null;
    }
  }
}

const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();

export const SONDE_KIND = Object.freeze({
  id: SONDE_ID, Cls: SondeLive, sizeClass: SONDE_ROSTER.cls, height: SONDE_ROSTER.H,
  // the GLB's own height (its r5Size: 3.038 m) so the normaliser scales by 1
  spec: Object.freeze({ url: SONDE_URL, targetHeight: 3.038, yaw: 0 }),
});
