/**
 * CALIMA · Oro's kit in play (Milestone 2 area D, wave 3): the keys, the contacts and what the verbs do to the world.
 * Combat makes one (`combat.kitVerbs`) and calls `update(realDt, playing)` each frame; nothing happens before the
 * hand-over (the gaff, the Windwall and the pots are not owned). Bible §12 controls:
 *
 *   LMB          with the gaff in her hand: a light (the next of the chain inside its window); guarding: the bash
 *   RMB (hold)   with the gaff in her hand: the Windwall's guard (the bow does not aim: `combat.rmbGuard`)
 *   X            guarding: plant the Windwall; near the planted Windwall: lift it (else the ammo cycle, as before)
 *   R            with the gaff in her hand: the hook-rip (the hold-R make is off while the gaff is out)
 *   F            cast the selected pot at the ground the camera looks at (2-16 m from her)
 *   mouse wheel  the pot type, while the bow is not drawn
 *
 * The contacts are resolved on the step the animator names (gaff.onContact, the Windwall's 'bash-contact'), with the
 * pose of that step: the hook's tip is where it is drawn. The planted Windwall goes into the sight occluders
 * (src/instruments/lib/sight.js) and the collision occluders (what the machines' line of sight reads today) on the
 * step it is planted, and out when it is lifted. A hit on her is filtered by the guard (`guardFilter`, read by
 * player.takeDamage): a parry lets nothing through and stops the striker's attack, a block lets `WINDWALL.blockK`.
 */
import * as THREE from 'three';
import { GAFF_LIGHTS, HOOK_RIP } from './gaff.js';
import { WINDWALL, plantShape } from './windwall.js';
import { clampAim, POT_CAST } from './pots.js';
import { tearSeized, hookRipTear } from './status.js';
import { setOccluder, clearOccluder } from '../instruments/lib/sight.js';

const _ray = new THREE.Ray(), _tip = new THREE.Vector3(), _chest = new THREE.Vector3(), _d = new THREE.Vector3(), _pp = new THREE.Vector3();
const _n = new THREE.Vector3(), _cam = new THREE.Vector3(), _cd = new THREE.Vector3();
const SPARK = [0xF2EAD3, 0xD9C28F];
const OCC_SLOT = 'combat:windwall';

export class KitVerbs {
  constructor(ctx, combat) {
    this.ctx = ctx;
    this.combat = combat;
    this.hits = [];          // the last contacts (audit, rows)
    this._colId = -1;
    this._shape = null;
    this.lastAim = null;
    const inPlay = () => ctx.state === 'playing' || ctx.params?.has?.('shot');
    const input = ctx.input;
    input?.onDown?.('KeyR', () => { if (inPlay()) this.hookRip(); });
    input?.onDown?.('KeyF', () => { if (inPlay()) this.castPot(); });
    input?.onDown?.('KeyX', () => { if (inPlay()) this.plantOrLift(); });
    this._lmbWas = false;
  }

  get gaff() { return this.combat?.gaff ?? null; }
  get ww() { return this.combat?.windwall ?? null; }
  get pots() { return this.combat?.pots ?? null; }

  /** The gaff is in her right hand (or on its way): RMB is the Windwall's guard, LMB the gaff's. */
  get gaffOut() { const g = this.gaff; return !!(g?.owned && (g.want || g.inHand)); }

  /** RMB belongs to the guard now (player.js reads this before it sets `aiming`). */
  get rmbGuard() { return this.gaffOut && !!this.ww?.owned; }

  /** X: plant from the guard, or lift the planted Windwall when she stands by it. True when X was the Windwall's. */
  plantOrLift() {
    const ww = this.ww, p = this.ctx.player;
    if (!ww?.owned || !p) return false;
    if (ww.phase === 'guard') { ww.plant(); return true; }
    if (ww.phase === 'planted' && ww.plantedAt) {
      const s = this._shape;
      const d = s ? Math.hypot(p.position.x - s.cx, p.position.z - s.cz) : 0;
      if (d <= WINDWALL.pickupReach) { ww.pickUp(); this._unplant(); return true; }
    }
    return false;
  }

  /** Is X the Windwall's this press (combat's ammo cycle stands aside)? */
  ownsX() {
    const ww = this.ww, p = this.ctx.player;
    if (!ww?.owned) return false;
    if (ww.phase === 'guard' || ww.phase === 'planting') return true;
    if (ww.phase === 'planted' && this._shape && p) return Math.hypot(p.position.x - this._shape.cx, p.position.z - this._shape.cz) <= WINDWALL.pickupReach;
    return false;
  }

  hookRip() { if (this.gaffOut && this.gaff.inHand && !this.ww?.guarding) this.gaff.hookRip(); }

  /** F: the selected pot at the ground the camera looks at. */
  castPot() {
    const K = this.pots, p = this.ctx.player;
    if (!K?.owned || !p) return false;
    const aim = this.aimPoint();
    if (!aim) return false;
    this.lastAim = aim;
    return K.cast(aim);
  }

  /** The ground the camera's centre line meets (marched over the terrain), clamped to the cast's range from her. */
  aimPoint() {
    const ctx = this.ctx, cam = ctx.camera, terr = ctx.terrain, p = ctx.player;
    if (!cam || !p) return null;
    const gy = (x, z) => terr?.getHeight?.(x, z) ?? p.position.y;
    cam.getWorldPosition(_cam); cam.getWorldDirection(_cd);
    let hit = null;
    for (let s = 1; s <= 60; s += 0.5) {
      const x = _cam.x + _cd.x * s, y = _cam.y + _cd.y * s, z = _cam.z + _cd.z * s;
      if (y <= gy(x, z)) { hit = { x, y: gy(x, z), z }; break; }
    }
    if (!hit) { const d = POT_CAST.maxRange; hit = { x: p.position.x + Math.sin(p.heading) * d, y: 0, z: p.position.z + Math.cos(p.heading) * d }; }
    return clampAim(p.position, hit, gy);
  }

  /** Each frame (real seconds; the verbs themselves run on sim time in the animator). */
  update(realDt, playing) {
    const ctx = this.ctx, g = this.gaff, ww = this.ww;
    if (g && !g.onContact) g.onContact = (v) => this._gaffContact(v);
    if (ww && !ww.onEvent) ww.onEvent = (ev) => this._wwEvent(ev);
    // (lifted by walking away from it: WindwallState lifts it itself; its cover goes with it)
    if (this._shape && ww?.phase !== 'planted') this._unplant();
    if (!playing) { this._lmbWas = false; return; }
    const input = ctx.input;
    // RMB: the guard while the gaff is out
    if (ww?.owned) ww.guard(this.rmbGuard && !!input?.mouseDown?.(2) && !this.pots?.casting);
    // LMB: a light, or the bash from the guard (on the press)
    const lmb = !!input?.mouseDown?.(0);
    if (lmb && !this._lmbWas && this.gaffOut) {
      if (ww?.phase === 'guard') ww.bash();
      else if (g.inHand) g.strike();
    }
    this._lmbWas = lmb;
    // the wheel: the pot type, while the bow is not drawn
    const K = this.pots;
    if (K?.owned && input?.mouse && !this.combat?.weaponDrawn) {
      const wh = input.mouse.wheel || 0;
      if (Math.abs(wh) >= 1) { K.belt.cycle(wh > 0 ? 1 : -1); }
    }
    // the statuses wear down (the pot layer steps them on sim time once the pots are owned; else here)
    if (!K?.owned) this.combat?.status?.step?.(realDt);
  }

  /** The guard's filter on a hit coming at her: the amount that gets through. */
  guardFilter(amount, from) {
    const ww = this.ww, p = this.ctx.player;
    if (!ww?.guarding || !p || !from || !from.position) return amount;
    const r = ww.block(from.position, { x: p.position.x, z: p.position.z, heading: p.heading || 0 });
    if (!r) return amount;
    this.ctx.events?.emit?.('windwall-block', { result: r, amount, kind: from.kind ?? null });
    if (r === 'parry') { try { from._cancelAttack?.(); } catch { /* none */ } return 0; }
    return amount * WINDWALL.blockK;
  }

  /* ----------------------------------------------------------------------------------------------- the contacts */

  /** The gaff's contact (the animator's step): the machine and the part the hook meets, and what the verb does. */
  _gaffContact(v) {
    const ctx = this.ctx, p = ctx.player, an = p?.animator;
    if (!p || !an?.gaffHookWorld?.(_tip)) return null;
    _chest.copy(p.position); _chest.y += 1.1;
    const rip = v.id === HOOK_RIP.id;
    const reach = v.reach;
    let m = null, object = null, part = null;
    // 1. the line from her chest through the hook's tip, a little past it
    const hulls = ctx.hitHulls;
    _d.subVectors(_tip, _chest);
    const L = _d.length();
    if (hulls?.raycast && L > 0.05) {
      _ray.origin.copy(_chest); _ray.direction.copy(_d).multiplyScalar(1 / L);
      const h = hulls.raycast(_ray, { far: L + 0.6 });
      if (h?.hit) { m = h.machine || null; object = h.object || null; _tip.set(h.x, h.y, h.z); }
    }
    // 2. else the nearest machine whose shell is inside the reach, in front of her (the verb's arc)
    if (!m) {
      const list = ctx.machines?.list || [];
      const fx = Math.sin(p.heading || 0), fz = Math.cos(p.heading || 0), cosA = Math.cos((v.arcDeg ?? 90) * 0.5 * Math.PI / 180);
      let best = Infinity;
      for (const q of list) {
        if (!q || q.alive === false || q._disposed || !q.position) continue;
        const dx = q.position.x - p.position.x, dz = q.position.z - p.position.z, d = Math.hypot(dx, dz);
        const gap = d - (q.bodyRadius ?? 1);
        if (gap > reach || d < 1e-3) continue;
        if ((dx * fx + dz * fz) / d < cosA) continue;
        if (gap < best) { best = gap; m = q; }
      }
    }
    if (!m) { this._note({ verb: v.id, kind: null, part: null, torn: false, damage: 0 }); return null; }
    // the part: the struck one, else the attached one nearest the hook's tip (within 1.2 m)
    for (let o = object; o; o = o.parent) if (o.userData?.part) { part = o.userData.part; break; }
    if (!part && Array.isArray(m.parts)) {
      let bd = 1.2;
      for (const q of m.parts) {
        if (!q || q.attached === false || !q.mesh?.getWorldPosition) continue;
        q.mesh.getWorldPosition(_pp);
        const d = _pp.distanceTo(_tip);
        if (d < bd) { bd = d; part = q; }
      }
    }
    if (part && !object) object = part.mesh;
    const tear = rip ? hookRipTear(m, part) : (part ? tearSeized(part, v.tear) : 0);
    if (rip && part) { try { m.kitBlow?.(part.name, 'hookRip'); } catch { /* the kind's own rule */ } }
    _d.subVectors(_tip, p.position).setY(0);
    if (_d.lengthSq() < 1e-6) _d.set(Math.sin(p.heading || 0), 0, Math.cos(p.heading || 0));
    _d.normalize(); _n.copy(_d).negate();
    let res = null;
    try {
      res = m.takeDamage({
        point: _tip.clone(), object, dir: _d.clone(), impact: v.impact, tear, element: 'none', elementAmount: 0,
        type: rip ? 'hookRip' : 'gaff', word: 'pry', baseDamage: v.impact, draw: 1, seen: true,
      });
    } catch { res = null; }
    this.combat?.impactFeedback?.({
      point: _tip, normal: _n, machine: m, damage: res?.damage ?? 0, weak: !!res?.weak, tear: res?.tear ?? tear,
      tornPart: res?.tornPart ?? null, kind: rip ? 'tear' : 'impact', maxHealth: m.maxHealth ?? 100, colors: SPARK,
    });
    const out = { verb: v.id, kind: m.kind ?? null, part: part?.name ?? null, torn: !!res?.tornPart, damage: +(res?.damage ?? 0).toFixed(2), tear: +tear.toFixed(1) };
    this._note(out);
    ctx.events?.emit?.('gaff-hit', out);
    return out;
  }

  _note(h) { this.hits.push(h); if (this.hits.length > 24) this.hits.shift(); }

  /** The Windwall's events (the animator's step). */
  _wwEvent(ev) {
    const ctx = this.ctx, p = ctx.player, ww = this.ww;
    if (ev === 'planted' && ww?.plantedAt) this._plant(ww.plantedAt);
    else if (ev === 'bash-contact' && p) {
      const list = ctx.machines?.list || [];
      const fx = Math.sin(p.heading || 0), fz = Math.cos(p.heading || 0);
      for (const q of list) {
        if (!q || q.alive === false || q._disposed || !q.position) continue;
        const dx = q.position.x - p.position.x, dz = q.position.z - p.position.z, d = Math.hypot(dx, dz);
        if (d - (q.bodyRadius ?? 1) > WINDWALL.bashReach || d < 1e-3 || (dx * fx + dz * fz) / d < 0.5) continue;
        _tip.set(q.position.x - dx / d * (q.bodyRadius ?? 1), p.position.y + 1.0, q.position.z - dz / d * (q.bodyRadius ?? 1));
        try { q.takeDamage({ point: _tip.clone(), impact: WINDWALL.bashImpact, tear: 0, element: 'none', dir: new THREE.Vector3(fx, 0, fz), type: 'bash', word: 'blunt', seen: true }); } catch { /* none */ }
        try { q._cancelAttack?.(); } catch { /* none */ }
        this._note({ verb: 'bash', kind: q.kind ?? null, part: null, torn: false, damage: WINDWALL.bashImpact });
        ctx.events?.emit?.('windwall-bash', { kind: q.kind ?? null });
        break;
      }
    }
  }

  /** The plant: 0.9 m of cover in the sight occluders and the collision occluders, on this step. */
  _plant(at) {
    const ctx = this.ctx;
    const y = ctx.terrain?.getHeight?.(at.x, at.z) ?? at.y;
    const s = this._shape = plantShape(at.x, y, at.z, at.heading);
    setOccluder(OCC_SLOT, s);
    if (ctx.collision?.register) {
      if (this._colId >= 0) ctx.collision.unregister?.(this._colId);
      this._colId = ctx.collision.register({ kind: 'windwall', shape: { type: 'box', c: [s.cx, s.cy, s.cz], half: [s.hx, s.hy, s.hz], yaw: s.yaw }, blocking: true, occluder: true, camera: false });
    }
    ctx.events?.emit?.('windwall-planted', { x: +s.cx.toFixed(2), z: +s.cz.toFixed(2), h: +(s.hy * 2).toFixed(2) });
  }

  _unplant() {
    clearOccluder(OCC_SLOT);
    if (this._colId >= 0) { this.ctx.collision?.unregister?.(this._colId); this._colId = -1; }
    this._shape = null;
  }
}

export { GAFF_LIGHTS };
