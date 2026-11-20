import * as THREE from 'three';
import { TRANSIT_CARD } from '../../game/quest/scar-plan.js';
import { patchAerial, patchDeck } from '../../world/island/aerial.js';

/**
 * THE TRANSIT'S FAR FORM (M2 wave 4 "the hour", area C; bible 11.2 0:55, 7.4 #12; M2 briefs §6 wave 4, EN4).
 *
 * "True Ground"'s last beat reads what walks on the Malpais rim at noon in calima: `TRANSIT · BASELINE · STATION 1 OF 9`.
 * This is that far form: ONE MESH (`public/models/instruments/transit-far.glb`, tools/build/instruments/gen-transit.mjs:
 * three pale 20 m graduated staff legs, the tripod head with three Plumbs hung under it, the drum with its ring of five
 * lamps, the 9 m telescope, the caged level vial, four pennants; 22.0 m, 11.7 k triangles, one material, nothing
 * emissive), NO BEHAVIOUR (it is scenery: not a machine, no perception, no collider, no climb volume, no shadow), the
 * scene's fog (the calima) over it. It stands on the Malpais shelf at STATION, about 45 m above the beat's anchor and 86 m
 * from it on a bearing of 26 deg, broadside to her, its legs and drum clear against the dust. (M2 fix wave, area E, the
 * smallest change: it stood at 36 deg, where its legs (+-5 deg at 86 m) met the near cooling-tower stub of the Kiln Yards
 * (42-54 deg from the anchor) and it read as part of the ruin in F45-transit at fa45e47; at 26 deg it stands 11 deg clear.)
 *
 * NEVER AGAINST A LOW SUN, NEVER OUTSIDE THE BEAT'S WINDOW (bible 7.4 #12, BUILD M2.9 "the beat is locked to 12:00 ±
 * 0:30", EN4). It is drawn only while BOTH hold: the hour is inside WINDOW and the sun stands at least SUN_MIN_DEG up
 * (the sky's own sun: environment.sunDir). `show(true)` asks for it and is refused outside them; once shown it stays
 * up while they hold (the read does not pop it out of the frame) and goes the frame they fail (its own onBeforeRender
 * reads them every frame it is drawn), or on `show(false)`. The GLB is fetched on the first `show(true)` that the gate
 * allows (never at boot: the first load is unchanged), and the far form appears when it is in.
 *
 * Published as `ctx.transitFar` (src/instruments/registry.js), the shape the first hour reads (src/game/hour.js
 * `_transitFar`: `head`, `show(on)`):
 *   head            THREE.Vector3, the drum's centre in the world (the read point the Alidade is held on)
 *   show(on)        ask for it (true) or take it down (false); returns whether it is up
 *   gate()          { ok, hour, sunDeg, why }
 *   report()        { loaded, visible, station, head, drawnFrames, minSunDegDrawn, outsideWindowFrames, card }
 *   kind 'transit', card TRANSIT_CARD, standIn false
 */
export const URL = '/models/instruments/transit-far.glb';
/** Where it stands (engine x, z) and the beat's anchor it is set broadside to (hour.js `_malpaisEdge`, 22 m inside). */
export const STATION = Object.freeze({ x: 170.9, z: 5.9, view: Object.freeze({ x: 133.2, z: 83.2 }) });
/** BUILD M2.9: the beat is locked to 12:00 ± 0:30 (hour.js CALIMA_WINDOW is the same). */
export const WINDOW = Object.freeze([11.5, 12.5]);
/**
 * The lowest sun it is drawn under (deg). EN4 writes 60, but the sky's sun never stands above 50 deg (environment.js
 * SUN_MAX_ELEV; 47.6 deg at 11:30, 49.0 at 12:00, 49.8 at 12:30): 45 deg is every hour of the window and nothing lower
 * than the sun at 10:48 or 14:42. For a ruling (EN4's 60 deg cannot be met by this sky).
 */
export const SUN_MIN_DEG = 45;
export const HEIGHT = 22.0;
/** The drum's centre above the ground (gen-transit.mjs `r5Far.head`). */
const HEAD_Y = 19.95;
const FOOT_R = 7.0;
/**
 * POLISH (frames lane, "the far form's legs no paler than the dust around them"): the far form takes the island's
 * far-form air and the trade deck capped as the ground takes it (island/aerial.js patchAerial, patchDeck), as the Kiln
 * Yards' far form does (d174a23). It stands on the shelf at 153 m, its drum at 173 m: inside the deck's slab (105-150 m)
 * and over it, so it drew the deck's optical depth uncapped, and at 02f7125 its white enamel legs stood paler than the
 * dust they stand in (F45-transit). ALBEDO takes its painted colours a step down toward the island's range for a far
 * form (its enamel is linear 0.78; the Yards' tile is 0.04-0.09). Read in F45-transit's frame (run
 * 20261120T000919Z-4e451a2-polish-x1-partial, legs' mean display Y against the dust they hide and a 3-10 px ring round
 * them): the patches alone (x1.0) took the legs to 161.6 against 165.7 behind and 162.1 around; x0.7 to 159.3; x0.5 to
 * 158.4. 0.7 keeps the staff legs pale and under the dust round them.
 */
export const ALBEDO = 0.7;

export class TransitFar {
  constructor(ctx) {
    this.ctx = ctx;
    this.kind = 'transit';
    this.card = TRANSIT_CARD;
    this.standIn = false;
    this.root = null;
    this.loading = null;
    this.wanted = false;
    this.station = STATION;
    this._head = new THREE.Vector3(STATION.x, HEAD_Y, STATION.z);
    this._grounded = false;
    this._y0 = 0;
    this.drawnFrames = 0;
    this.minSunDegDrawn = null;
    this.outsideWindowFrames = 0;
    this.failed = null;
    // C5 (engine lane, the smallest change here): the GLB (150 KB) is fetched once the title stands (the deferred warm-up's
    // event; never in the boot's first load), hidden, so its program links and has its first use on the title, not when
    // calima arrives (at ddc31c1 it linked on its first frame there: 35.4 ms; linked off the frame in play, its first use
    // still waited 33.4 ms at 914bbfb: a synchronous GL call in play waits for the GPU process)
    // (not under ?shot: a film stages the far form itself, F45-transit, and every other film stays as it was)
    if (!ctx?.params?.has?.('shot')) {
      ctx?.events?.on?.('warm-up-complete', () => { this._load(); });
      ctx?.events?.on?.('game-start', () => { this._load(); });
    }
  }

  /** The ground it stands on: the lowest of its three feet (the higher feet stand into the slope, never over air). */
  _ground() {
    if (this._grounded) return this._y0;
    const T = this.ctx.terrain;
    if (!T?.getHeight) return 0;
    let y = Infinity;
    for (const d of [90, 210, 330]) {
      const a = (d * Math.PI) / 180;
      y = Math.min(y, T.getHeight(STATION.x + Math.cos(a) * FOOT_R, STATION.z + Math.sin(a) * FOOT_R));
    }
    this._y0 = Number.isFinite(y) ? y : 0;
    this._grounded = true;
    this._head.y = this._y0 + HEAD_Y;
    return this._y0;
  }

  get head() { this._ground(); return this._head; }

  /** The rule it is drawn under: the hour inside WINDOW and the sun at least SUN_MIN_DEG up. */
  gate() {
    const env = this.ctx.environment;
    const hour = env ? env.time : NaN;
    const sy = env?.sunDir ? env.sunDir.y : -1;
    const sunDeg = Math.asin(Math.max(-1, Math.min(1, sy))) * 180 / Math.PI;
    const inWindow = hour >= WINDOW[0] && hour <= WINDOW[1];
    const high = sunDeg >= SUN_MIN_DEG;
    return { ok: inWindow && high, hour, sunDeg, why: inWindow ? (high ? null : `the sun is ${sunDeg.toFixed(1)} deg up (under ${SUN_MIN_DEG})`) : `the hour ${Number(hour).toFixed(2)} is outside ${WINDOW[0]}-${WINDOW[1]}` };
  }

  show(on) {
    if (!on) { this.wanted = false; if (this.root) this.root.visible = false; return false; }
    if (!this.gate().ok) { if (this.root) this.root.visible = false; return false; }
    this.wanted = true;
    if (!this.root) { this._load(); return false; }
    this.root.visible = true;
    return true;
  }

  _load() {
    if (this.loading || this.failed) return this.loading;
    const A = this.ctx.assets;
    if (!A?.loadExtra) { this.failed = 'no ctx.assets.loadExtra'; return null; }
    this.loading = A.loadExtra({ 'transit-far': { url: URL, targetHeight: HEIGHT, yaw: 0 } }).then(() => {
      const entry = A.models['transit-far'];
      if (!entry?.root) { this.failed = 'the far form did not load'; return; }
      const root = entry.root;
      root.name = 'transit-far';
      const y0 = this._ground();
      root.position.set(STATION.x, y0, STATION.z);
      // broadside to the beat's anchor: its telescope (model +z) square to her line of sight
      const vx = STATION.x - STATION.view.x, vz = STATION.z - STATION.view.z;
      root.rotation.y = Math.atan2(vx, vz) + Math.PI / 2;
      const gate = () => this.gate();
      root.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = false; o.receiveShadow = false;
        // the far-form air and the capped deck, set before the environment registers the material (its wrapper calls
        // this first), and the albedo in the island's range
        const mat = o.material;
        if (mat && !mat.userData.calFar) {
          mat.userData.calFar = true;
          if (mat.color) mat.color.multiplyScalar(ALBEDO);
          mat.onBeforeCompile = (shader) => { patchAerial(shader); patchDeck(shader); };
          mat.customProgramCacheKey = () => 'cal-transit-far';
          mat.needsUpdate = true;
          this.ctx.environment?.registerMaterial?.(mat);
        }
        o.userData.noSizeCull = true;
        // every frame it is drawn: the record, and down the frame the window or the sun fails (EN4)
        o.onBeforeRender = () => {
          const g = gate();
          this.drawnFrames++;
          if (this.minSunDegDrawn === null || g.sunDeg < this.minSunDegDrawn) this.minSunDegDrawn = +g.sunDeg.toFixed(2);
          if (!g.ok) { this.outsideWindowFrames++; root.visible = false; }
        };
      });
      root.updateMatrixWorld(true);
      const add = () => {
        root.visible = this.wanted && this.gate().ok;
        this.root = root;
        this.ctx.scene?.add(root);
      };
      // C5 (engine lane, the smallest change here: the first hour's hitches): its program (the hulls' but for its key) is
      // linked off the frame before it stands in the scene, and given its first use at once while the title (or a sheet)
      // stands: added as the GLB landed, it linked on its first frame when calima arrived after the rest, 35.4 ms at ddc31c1
      const E = this.ctx.engine;
      if (E?.compileOffFrame) return E.compileOffFrame(root, { force: this.ctx.state !== 'playing' }).then(add, add);
      add();
    }).catch((err) => { this.failed = String(err?.message || err); });
    return this.loading;
  }

  report() {
    const g = this.gate();
    return {
      kind: this.kind, card: this.card, loaded: !!this.root, failed: this.failed, visible: !!this.root?.visible, wanted: this.wanted,
      station: { x: STATION.x, z: STATION.z, ground: +this._ground().toFixed(2) }, head: this._head.toArray().map((v) => +v.toFixed(2)),
      gate: { ok: g.ok, hour: +Number(g.hour).toFixed(3), sunDeg: +g.sunDeg.toFixed(2), why: g.why },
      drawnFrames: this.drawnFrames, minSunDegDrawn: this.minSunDegDrawn, outsideWindowFrames: this.outsideWindowFrames,
    };
  }

  dispose() {
    if (this.root) { this.root.removeFromParent(); this.root.visible = false; }
    try { this.ctx.assets?.unload?.('transit-far'); } catch { /* */ }
    this.root = null; this.loading = null; this.wanted = false;
  }
}
