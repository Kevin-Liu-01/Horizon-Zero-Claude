import { buildBrazier, makeFireLight } from '../../world/settlements/brazier.js';
import { BRAZIERS, KINDLE_HOLD, dialogFor, REST_HOURS } from './rules.js';
import { REST, TRIG } from '../../world/island/sites.js';

/**
 * THE BRAZIERS of the slice, live (BUILD M1.6c). Brea's cistern (home: a New Game counts as a rest here) and the
 * one at T1's foot (kindled only after "Raker's Morning" pays). Rules from ./rules.js; words from
 * src/game/text/ui/systems.json; the object from src/world/settlements/brazier.js.
 *
 *   ctx.braziers.list                  [{ id, def, obj, entry }]
 *   ctx.braziers.lit / ash / unlocked  Sets of ids
 *   ctx.braziers.lastRest              { id, x, y, z, yaw, hour } where death stands Brea up
 *   ctx.braziers.newGame(hour)         cistern lit, in ash, and rested-at (BIBLE 17)
 *   ctx.braziers.unlock(id) · kindle(id) · rest(id, choice) -> Promise<{ ok, refused?, hour? }>
 *   ctx.braziers.serialize() / restore(d)
 *   ctx.braziers.machinesNear()        the refusal's input: [{ x, z, lamp, kind }]
 *
 * The settlement host still builds the Round-4 pit at the cistern; while this stands its group is hidden and its
 * `firePosition` is this bowl, so the host's REST lookup and the F30 filmer both find this Brazier. (Host file
 * untouched: a runtime change from this side, named in the lane report.)
 */
export class Braziers {
  constructor(ctx, { strings, present, save }) {
    this.ctx = ctx;
    this.S = strings;
    this.T = strings.systems;
    this.present = present;
    this.save = save;   // (reason) => writes the named save
    this.lit = new Set();
    this.ash = new Set();
    this.unlocked = new Set();
    this.lastRest = null;
    this.list = [];
    this.resting = false;
    this.stats = { kindled: 0, rests: 0, refused: 0 };
    this._build();
    this._defaults();
  }

  _place(def) {
    const T = this.ctx.terrain;
    if (def.id === 'cistern') {
      const fp = this.ctx.settlements?.firePosition;
      return { x: fp?.x ?? REST.x - 0.6, z: fp?.z ?? REST.z + 0.7, yaw: 0 };
    }
    const t1 = TRIG.find((t) => t.id === 'T1');
    // at the pillar's foot, 7 m to its seaward (south-west) side, on the flattest of four tries
    let best = null;
    for (const [dx, dz] of [[-5, 5], [5, 5], [-5, -5], [5, -5]]) {
      const x = t1.x + dx, z = t1.z + dz;
      const h = T?.getHeight?.(x, z) ?? 0;
      const s = Math.abs((T?.getHeight?.(x + 1, z) ?? h) - h) + Math.abs((T?.getHeight?.(x, z + 1) ?? h) - h);
      if (!best || s < best.s) best = { x, z, s };
    }
    return { x: best.x, z: best.z, yaw: 0.6 };
  }

  _build() {
    const ctx = this.ctx;
    // the one fire light (see buildBrazier): parked at the burning Brazier nearest Brea
    this.light = makeFireLight();
    ctx.scene?.add(this.light);
    for (const def of BRAZIERS) {
      const at = this._place(def);
      const obj = buildBrazier({ terrain: ctx.terrain, x: at.x, z: at.z, yaw: at.yaw, cistern: true, seed: def.id === 'cistern' ? 11 : 23, sharedLight: this.light });
      ctx.scene?.add(obj.group);
      const rec = { id: def.id, def, obj, entry: null };
      this.list.push(rec);
      if (ctx.interactables?.register) {
        rec.entry = ctx.interactables.register({
          position: obj.position.clone(), radius: 2.6, hold: 0.4, label: this.T.brazier.promptLit, once: false, site: 'brazier',
          onInteract: () => this.interact(def.id),
        });
      }
    }
    // the host's own pit gives way to the Brazier (see the header)
    const host = ctx.settlements;
    const home = this.list[0];
    if (host?.group) host.group.visible = false;
    if (host?.firePosition && home) host.firePosition.copy(home.obj.position);
  }

  _defaults() {
    this.lit.clear(); this.ash.clear(); this.unlocked.clear();
    for (const def of BRAZIERS) {
      if (def.litAtStart) this.lit.add(def.id);
      if (!def.locked) this.unlocked.add(def.id);
    }
    const home = this.list.find((b) => b.def.home);
    this.lastRest = home ? this._restSpot(home, this.ctx.environment?.time ?? 7) : null;
    this._sync();
  }

  _restSpot(b, hour) {
    // she stands up where she spawns at home (REST), and at the seat elsewhere
    const s = b.def.home ? { x: REST.x, z: REST.z, yaw: b.obj.seat.yaw } : b.obj.seat;
    const y = this.ctx.terrain?.getHeight?.(s.x, s.z) ?? 0;
    return { id: b.id, x: +s.x.toFixed(3), y: +y.toFixed(3), z: +s.z.toFixed(3), yaw: +(s.yaw ?? 0).toFixed(3), hour: +(+hour).toFixed(3) };
  }

  byId(id) { return this.list.find((b) => b.id === id) ?? null; }

  /** New Game: 07:00 beside her cistern, the Brazier burned down to grey ash; the start counts as a rest there. */
  newGame(hour = 7) {
    this._defaults();
    this.ash.add('cistern');
    const home = this.byId('cistern');
    if (home) this.lastRest = this._restSpot(home, hour);
    this._sync();
  }

  unlock(id) { this.unlocked.add(id); this._sync(); }

  machinesNear() {
    const out = [];
    for (const m of (this.ctx.machines?.list ?? [])) {
      if (!m || m.alive === false || !m.position) continue;
      out.push({ x: m.position.x, z: m.position.z, lamp: m.lampState ?? 'calm', kind: m.kind });
    }
    return out;
  }

  dialog(id) {
    const b = this.byId(id);
    if (!b) return null;
    const env = this.ctx.environment;
    const w = env?.weatherParams || {};
    const wv = env?.wind;
    // the wind blows TOWARD (wind.x, wind.z) in the engine frame (x = E, z = -N); the forecast names where it comes from
    const toward = wv && (wv.x || wv.z) ? Math.atan2(wv.x, -wv.z) * 180 / Math.PI : 225;
    return dialogFor(this.T, b.def, {
      lit: this.lit, unlocked: this.unlocked, x: b.obj.position.x, z: b.obj.position.z,
      machines: this.machinesNear(),
      weather: { state: env?.weather ?? 'trade', windFrom: toward + 180, speed: w.windMS ?? 5, calimaAt: env?.calimaAt ?? null },
    });
  }

  /** E at a Brazier: kindle it, or sit and open the rest dialog (or its refusal). */
  async interact(id) {
    if (this.resting || this.present.busy) return null;
    const d = this.dialog(id);
    if (!d || d.mode === 'locked') return null;
    if (d.mode === 'kindle') return this.kindle(id);
    const b = this.byId(id);
    this._sit(b);
    const names = this.T.brazier.names;
    if (d.mode === 'refused') {
      this.stats.refused++;
      this.ctx.events?.emit?.('brazier-refused', { id, by: d.by?.kind ?? null });
      await this.present.brazier({ title: names[id] ?? '', line: d.line });
      return { ok: false, refused: true };
    }
    const choice = await this.present.brazier({ title: names[id] ?? '', rows: d.rows });
    if (!choice) return { ok: false };
    return this.rest(id, choice);
  }

  kindle(id) {
    if (!this.unlocked.has(id) || this.lit.has(id)) return null;
    this.lit.add(id);
    this.ash.delete(id);
    this.stats.kindled++;
    this.ctx.events?.emit?.('brazier-kindled', { id });
    this._sync();
    return { ok: true, kindled: id };
  }

  _sit(b) {
    const p = this.ctx.player;
    this.ash.delete(b.id);   // she lays the coals back up when she sits
    this._sync();
    p?.sit?.(b.obj.seat);
  }

  /** Rest to `choice` (dawn | golden | dusk | night). Refused again at the moment of resting if lamps came up. */
  async rest(id, choice) {
    const b = this.byId(id);
    const d = this.dialog(id);
    if (!b || !d) return { ok: false };
    if (d.mode === 'refused') { this.stats.refused++; return { ok: false, refused: true }; }
    if (d.mode !== 'rest' || !(choice in REST_HOURS)) return { ok: false };
    const toHour = REST_HOURS[choice];
    const env = this.ctx.environment;
    this.resting = true;
    this.ctx.events?.emit?.('brazier-rest-start', { id, choice, toHour });
    try {
      if (env?.rest) await env.rest({ toHour, seconds: 2.4 });
      else env?.setTime?.(toHour);
    } catch { /* environment busy: the hour is set below */ }
    if (env && Math.abs((env.time ?? toHour) - toHour) > 0.05) env.setTime?.(toHour);
    const p = this.ctx.player;
    if (p) {
      if (Number.isFinite(p.maxGourd)) p.gourd = p.maxGourd;   // refills the fog-water Gourds
      if (Number.isFinite(p.maxHealth)) p.health = p.maxHealth;
      this.ctx.events?.emit?.('player-hurt', { health: p.health, max: p.maxHealth });
    }
    this.ctx.inventory?.refillGourds?.();
    this.lit.add(id);
    this.lastRest = this._restSpot(b, toHour);
    this.stats.rests++;
    this.resting = false;
    const res = this.save?.('brazier');
    this.ctx.events?.emit?.('brazier-rest', { id, hour: toHour, choice });
    return { ok: true, hour: toHour, choice, save: res ?? null };
  }

  _sync() {
    for (const b of this.list) {
      const kindled = this.lit.has(b.id);
      b.obj.setState({ kindled, burning: kindled && !this.ash.has(b.id) });
      // the prompt only matters where Brea can see it: skip the lamp sweep beyond 40 m
      if (b.entry && !(b._d2 > 1600)) {
        const d = this.dialog(b.id);
        b.entry.disabled = !d || d.mode === 'locked';
        b.entry.label = d?.prompt ?? this.T.brazier.promptLit;
        b.entry.hold = d?.mode === 'kindle' ? KINDLE_HOLD : 0.4;
      }
    }
  }

  update(dt, t) {
    const cam = this.ctx.camera;
    const k = this.ctx.environment?.fireDayK ?? 1;
    const p = this.ctx.player?.position;
    let near = null, nd = Infinity;
    for (const b of this.list) {
      const d = p ? (b.obj.position.x - p.x) ** 2 + (b.obj.position.z - p.z) ** 2 : 0;
      b._d2 = d;
      if (b.obj.burning && d < nd) { nd = d; near = b; }
    }
    if (near) near.obj.claimLight();
    else this.light.intensity = 0;
    for (const b of this.list) b.obj.update(t, cam, k);
    // the prompt follows the lamps (refusal) at 2 Hz
    this._syncT = (this._syncT ?? 0) + dt;
    if (this._syncT > 0.5) { this._syncT = 0; this._sync(); }
  }

  serialize() {
    return { lit: [...this.lit].sort(), ash: [...this.ash].sort(), unlocked: [...this.unlocked].sort(), lastRest: this.lastRest ? { ...this.lastRest } : null };
  }

  restore(d) {
    if (!d) return;
    this.lit = new Set(d.lit || []);
    this.ash = new Set(d.ash || []);
    this.unlocked = new Set(d.unlocked || BRAZIERS.filter((b) => !b.locked).map((b) => b.id));
    this.lastRest = d.lastRest ? { ...d.lastRest } : this.lastRest;
    this._sync();
  }

  dispose() {
    for (const b of this.list) {
      if (b.entry) this.ctx.interactables?.unregister?.(b.entry);
      b.obj.dispose();
    }
    this.list.length = 0;
    this.light?.removeFromParent();
    this.light?.dispose?.();
    if (this.ctx.settlements?.group) this.ctx.settlements.group.visible = true;
  }
}

