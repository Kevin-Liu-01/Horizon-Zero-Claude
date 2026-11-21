import * as THREE from 'three';
import { ExpansionMachine } from '../../../entities/machines/rig/expansion-base.js';
import { registerKindTables } from '../../../entities/machines/ai/tables.js';
import { registerDoctrine } from '../../../entities/machines/ai/doctrine.js';
import { LAMP_STATES, lampGain } from '../../lamps.js';

/**
 * THE FOUR M3 KINDS AS LIVE, SPAWNABLE MACHINES (Milestone 3 wave 3c, area C; BUILD M3.4). Shared by the Kiln, the
 * Spindle, the Davit and the Sonde (kinds/<kind>/kind.js); it lives in the Kiln's folder because the lane's owned paths
 * are the four kinds' folders.
 *
 * NOT IN THE BOOT REGISTRY. The registry (../../registry.js) loads every kind module in `kinds/*.js` at boot. These
 * four are registered ON DEMAND (`ensureKind`): their model is fetched the first time a quest needs one (the Yards'
 * encounter on 'climb', the Sonde at MOORING once "A Line Over the Glass" runs: IK11's "fetched when the quest is given,
 * not in the first load"), then `machines.registerKind(id, Cls)` makes `machines.spawn(id, x, z)` build it. So they are
 * not in `machines.instrumentKinds` / `sizeClasses` (no every-kind kept row stages them: A76 would spawn a flying Sonde
 * for its footfalls), and the encounter audit does not count them; the Yards' own rule is the quest's (R7) and its page
 * row (tools/gates/instruments/m3/live-kinds.mjs).
 *
 * A LIVE KIND IS DRAWN FROM ITS BRAIN (rule 21). Its rules module (kinds/<kind>/rules.js) is the brain; the machine
 * only draws it: each frame `drive(dt)` reads the pose the brain gives (`this.pose`: { x, z, heading, y? }) and the
 * lamp state it wants (`this.lampWant`: calm | wary | hostile | dark) and the kind's own `animateKind(dt)` draws its
 * moving parts. The machine is docile: the engine's own AI never takes a state (perception gain 0, no attack table),
 * so nothing but the brain moves it.
 *
 * THE LAMP. Its own mesh at the generator's lamp socket (`r5Sockets.lamp`): a disc on the drum's face, or a lantern
 * lit all round (lampShape 'lantern'). Its colour is the lamp system's solved HDR value for the state
 * (`machines.lamps.lampHdr`: the value the output pass maps back onto the token, as the iris draw is), unlit, unfogged,
 * at the state's rhythm (lamps.js `lampGain`: calm steady, wary 1 Hz pulse, hostile 4 Hz flicker). `kindLamp` is the
 * state drawn (the page row reads it; `machine.lampState` is the engine's and stays calm on a docile machine).
 *
 * THE MODEL. The asset normaliser recentres a model on its box; these GLBs are built in the form's body frame (the
 * rules' anchors: the door, the coupling, the keel), so the constructor undoes the recentring and the body frame is the
 * form's again. Tool nodes (`r5Tools`: the Kiln's door, stack and hose, the Davit's plates, the Sonde's rotors) hang on
 * pivots at their anchors, as on the art page (tools/gates/instruments/m3/art.js). The LOD1 caster proxy is hidden.
 */

const D2R = Math.PI / 180;
const _lin = new THREE.Color();

/** The tables a live M3 kind registers: no perception, no attacks (the brain is the behaviour; artKind's rows). */
export const LIVE_TABLES = Object.freeze({
  perception: { gain: 0, periphRange: 0, scanSweep: 0.4, scanPeriod: 6.0, contactRange: 0 },
  engage: { archetype: 'skittish', band: [6, 14], orbitSpeed: 0.5, backSpeed: 0.6 },
  attacks: [],
  attackMode: 'table',
  react: { staggerFrac: 9, downedFrac: 9 },
  elem: 140,
});

const LOADS = new WeakMap();

/**
 * Make `d.id` spawnable now (or soon): its model fetched (`d.spec`) or built from code (`d.build()`: the grey Spindle),
 * its tables and doctrine row registered, its class registered on the manager. Idempotent per ctx and kind.
 * @param {object} ctx  the game's context (ctx.assets, ctx.machines)
 * @param {{ id: string, Cls: Function, sizeClass: string, spec?: object, build?: () => object }} d
 * @returns {Promise<boolean>} true once `machines.spawn(d.id, ...)` builds one
 */
export function ensureKind(ctx, d) {
  const M = ctx?.machines;
  if (!M || !ctx.assets) return Promise.resolve(false);
  if (M.canSpawn?.(d.id)) return Promise.resolve(true);
  let per = LOADS.get(ctx);
  if (!per) { per = new Map(); LOADS.set(ctx, per); }
  if (per.has(d.id)) return per.get(d.id);
  const p = (async () => {
    if (!ctx.assets.models[d.id]) {
      if (d.build) ctx.assets.models[d.id] = d.build();
      else await ctx.assets.loadExtra({ [d.id]: { ...d.spec, shadowPolicy: d.spec.shadowPolicy } });
    }
    if (!ctx.assets.models[d.id]) return false;
    registerKindTables(d.id, LIVE_TABLES);
    registerDoctrine(d.id, {});
    d.Cls.sizeClass = d.sizeClass;
    M.registerKind(d.id, d.Cls);
    return !!M.canSpawn?.(d.id);
  })().catch((e) => { console.warn(`[instruments] live kind '${d.id}' did not load:`, e?.message ?? e); per.delete(d.id); return false; });
  per.set(d.id, p);
  return p;
}

/**
 * Spawn a live kind at (x, z) facing `heading`, standing where it is put (a one-point route) and forgotten by the
 * site memory (ai/sites.js would otherwise repopulate the spot after a wreck: these are a quest's, not a site's).
 */
export function spawnLive(ctx, id, x, z, heading = 0, extra = {}) {
  const M = ctx.machines;
  const m = M?.spawn?.(id, x, z, { route: [{ x, z }], heading, ...extra });
  if (!m) return null;
  const S = M.sites;
  if (S?.sites && m._site) { const i = S.sites.indexOf(m._site); if (i >= 0) S.sites.splice(i, 1); }
  m._site = null;
  return m;
}

/** Take a live kind out of the world (the frame stager's undo, tools/frames/page.mjs). */
export function despawnLive(ctx, m) {
  if (!m) return;
  const L = ctx.machines?.list, i = L ? L.indexOf(m) : -1;
  if (i >= 0) L.splice(i, 1);
  try { m.dispose?.(); } catch { /* */ }
  m.root?.parent?.remove(m.root);
}

/** The GLB's extras (the normaliser keeps them on the entry; a code-built entry carries its own). */
export const extrasOf = (entry) => entry?.extras || entry?.gltf?.parser?.json?.asset?.extras || {};

/** A live M3 kind's class. `o`: { id, displayName, bodyRadius, maxHealth } */
export function liveKindClass(o) {
  class LiveInstrument extends ExpansionMachine {
    constructor(ctx, manager, opts = {}) {
      super(ctx, manager, {
        kind: o.id, displayName: o.displayName, rigged: false, yawFix: 0,
        maxHealth: o.maxHealth ?? 600, armor: 0.1, level: 8,
        walkSpeed: 0.0001, runSpeed: 0.0001, turnRate: 0.5,
        sightRange: 30, hearRange: 20, eyeHeight: 1.5, attackRange: 2, bodyRadius: o.bodyRadius ?? 1,
        docile: true,
        ...opts,
      });
      const entry = ctx.assets.models[this.modelKind];
      const ex = extrasOf(entry);
      this.extras = ex;
      this.S = ex.r5Sockets || {};
      // the body frame is the form's: undo the normaliser's recentring and scale (the GLB is built at 1:1)
      const inner = this.model.children[0], src = inner?.children?.[0];
      if (inner && src) { inner.scale.setScalar(1); inner.rotation.y = 0; src.position.set(0, 0, 0); }
      this.nodes = {};
      this.model.traverse((n) => { if (n.name) this.nodes[n.name] = this.nodes[n.name] || n; if (n.isMesh) n.userData.noSizeCull = true; });
      for (const [n, q] of Object.entries(this.nodes)) if (/-lod1$/.test(n)) q.visible = false;
      this.tools = {};
      for (const [name, anchor] of Object.entries(ex.r5Tools || {})) {
        const node = this.nodes[name];
        if (!node) continue;
        const pivot = new THREE.Group(), hang = new THREE.Group();
        pivot.name = `${name}-pivot`; pivot.position.set(anchor[0], anchor[1], anchor[2]);
        hang.position.set(-anchor[0], -anchor[1], -anchor[2]);
        (node.parent || this.model).add(pivot); pivot.add(hang); hang.add(node);
        this.tools[name] = pivot;
      }
      this.pose = { x: this.position.x, z: this.position.z, heading: this.heading, y: null };
      this.lampWant = 'calm';
      this.kindLamp = 'calm';
      this.awake = false;
      this._lampT = Math.random();
      this._hdrT = 0;
      this._hdr = {};
      this._buildLamp();
    }

    /** The lamp: a disc on the drum's face, or a lantern lit all round. Unlit and unfogged (lamps.js's own rule). */
    _buildLamp() {
      const S = this.S;
      if (!Array.isArray(S.lamp)) { this.lampMesh = null; return; }
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false });
      mat.name = `${o.id}-lamp`;
      let geo;
      if (S.lampShape === 'lantern') geo = new THREE.CylinderGeometry(S.lampR, S.lampR, S.lampH ?? 0.2, 20);
      else geo = new THREE.CircleGeometry(S.lampR ?? 0.13, 28);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'lamp';
      mesh.position.set(S.lamp[0], S.lamp[1], S.lamp[2] + (S.lampShape === 'lantern' ? 0 : 0.003));
      mesh.castShadow = false; mesh.receiveShadow = false;
      const host = this.model.children[0]?.children?.[0] || this.model;
      host.add(mesh);
      this.lampMesh = mesh;
      this._paintLamp(0);
    }

    /** The state's solved HDR value (refreshed twice a second; the token itself where no lamp system runs). */
    _hdrOf(s) {
      const L = this.manager?.lamps;
      const h = L?.lampHdr?.(s);
      if (h && (h.r + h.g + h.b) > 0) return h;
      _lin.set(LAMP_STATES[s]?.token || '#F2EAD3');
      return { r: _lin.r, g: _lin.g, b: _lin.b };
    }

    _paintLamp(dt) {
      const m = this.lampMesh;
      if (!m) return;
      const s = this.alive === false ? 'dark' : this.lampWant;
      this._hdrT -= dt;
      if (this._hdrT <= 0 || !this._hdr[s]) { this._hdrT = 0.5; this._hdr[s] = this._hdrOf(s); }
      this._lampT += dt;
      const h = this._hdr[s], k = s === 'dark' ? 1 : lampGain(s, this._lampT);
      m.material.color.setRGB(h.r * k, h.g * k, h.b * k);
      this.kindLamp = s;
    }

    /** The brain's pose, put on the machine before the engine grounds it (conformM). */
    drive() {
      const P = this.pose;
      if (!P) return;
      if (Number.isFinite(P.x) && Number.isFinite(P.z)) { this.position.x = P.x; this.position.z = P.z; }
      if (Number.isFinite(P.heading)) this.heading = P.heading;
    }

    update(dt, t) {
      if (this._disposed) return undefined;
      if (this.alive !== false) this.drive(dt);
      const r = super.update(dt, t);
      if (this.alive && this.state !== 'patrol' && this.state !== 'dead') this.setState('patrol');
      if (this.sc) this.sc.suspicion = 0;
      // a flier's height is its brain's, not the ground's
      if (this.alive !== false && this.pose && Number.isFinite(this.pose.y)) this.position.y = this.pose.y;
      this._paintLamp(dt);
      if (this.alive !== false) this.animateKind?.(dt, t);
      return r;
    }

    _statePatrol() {}
    _stateSuspicious() {}
    _stateAlert() {}
    _stateSearch() {}
    onDeathPose() {}
    animate() {}

    dispose() {
      this.disposeKind?.();
      if (this.lampMesh) { this.lampMesh.geometry.dispose(); this.lampMesh.material.dispose(); this.lampMesh.removeFromParent(); this.lampMesh = null; }
      return super.dispose();
    }
  }
  return LiveInstrument;
}

/** Degrees to radians (the kinds' poses). */
export const deg = (d) => d * D2R;
