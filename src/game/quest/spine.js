import { STAGES, REWARD, QUEST_ID, TRIANGLES } from './plan.js';
import { fill } from '../strings.js';

/**
 * THE QUEST SPINE (BUILD M1.6a) — "Raker's Morning" as a stage machine over `plan.js`, reading every word from
 * the writing (`makeStrings`). Pure: no DOM, no THREE, no ctx. The runtime (`src/game/runtime.js`) feeds it
 * events and a world probe each frame and turns its hooks into the HUD note, cards, subtitles, scenes, spawns,
 * checkpoints and the reward. node --test walks it beat by beat (tools/gates/systems/quest-spine.test.mjs).
 *
 *   new QuestSpine({ strings, hooks })
 *   start()                        the 0:00 beat (New Game)
 *   update(dt, world)              world: { near(anchor, r, up) -> bool, aim(target) -> bool, bearing(target) -> deg }
 *   notify(type, payload)          'scene-done' {scene, exit} · 'gathered' {source, n} · 'ammo-crafted' {ammo, n}
 *                                  'machine-killed' {kind} · 'plumb-topple' · 'part-torn' {part, kind} · 'flagged'
 *                                  'plumb-chime' · 'plumb-hit' · 'plumb-dark' · 'seen' (spotted, no Flag)
 *   talk(npc) -> scene id | null   the player spoke to npc: the scene to play, or null
 *   hudState()                     the field note in the shape `progression.state()` returns (src/ui/hud.js reads it)
 *   serialize() / restore(data)    plain JSON for save v6
 *   report()                       how far the run got: stages done in order, with the spine clock at each
 *
 * Hooks (all optional): note(text) · card(id, card) · turn(on, card, vars) · scene(id, scene) · log(stageId, line)
 * · checkpoint(reason) · spawn(what) · reward(REWARD) · triangle(id) · sighting(id, card) · done()
 */
export class QuestSpine {
  constructor({ strings, hooks = {}, stages = STAGES }) {
    this.S = strings;
    this.hooks = hooks;
    this.stages = stages;
    this.byId = new Map(stages.map((s) => [s.id, s]));
    for (const s of stages) {
      if (!strings.stage(s.id)) throw new Error(`stage ${s.id} has no text`);
    }
    this.reset();
  }

  get id() { return QUEST_ID; }

  reset() {
    this.started = false;
    this.done = false;
    this.rewarded = false;
    this.idx = 0;
    this.t = 0;
    /** @type {Record<string, {state:string, n:number, flagged:boolean, t0:number, t1:number}>} */
    this.st = {};
    for (const s of this.stages) this.st[s.id] = { state: 'pending', n: 0, flagged: false, seen: false, t0: -1, t1: -1 };
    this.seen = { turns: new Set(), cards: new Set(), scenes: new Set() };
    this.triangles = new Set();
    this.timers = [];
    this.aimT = 0;
    this.surveyed = new Set();
    this.surveyT = {};
    this.log = [];
    this.order = [];
  }

  /* ------------------------------------------------------------ flow */

  start() {
    this.reset();
    this.started = true;
    this._enter(0);
    return this;
  }

  /** The stage the field note shows (the first active non-optional one). */
  current() {
    if (!this.started || this.done) return null;
    return this.stages[this.idx] ?? null;
  }

  /** Stages active right now: the current one and the one that runs with it. */
  activeStages() {
    const out = [];
    const cur = this.current();
    if (!cur) return out;
    out.push(cur);
    if (cur.with && this.st[cur.with]?.state === 'active') out.push(this.byId.get(cur.with));
    return out;
  }

  _enter(i) {
    // an optional stage runs only alongside another; it is never the current stage
    while (this.stages[i] && (this.stages[i].optional || this.st[this.stages[i].id].state !== 'pending')) i++;
    this.idx = i;
    const s = this.stages[i];
    if (!s) return this._finish();
    const rec = this.st[s.id];
    rec.state = 'active';
    rec.t0 = this.t;
    this.aimT = 0;
    if (s.with) {
      const w = this.st[s.with];
      if (w && w.state === 'pending') { w.state = 'active'; w.t0 = this.t; }
    }
    if (s.spawn) this._hook('spawn', s.spawn);
    if (s.scenes?.start) this._scene(s.scenes.start);
    if (s.turns?.start) this._turn(s.turns.start);
    for (const c of (s.cards || [])) this._card(c);
    if (s.sighting && this.S.sighting(s.sighting)) this._hook('sighting', s.sighting, this.S.sighting(s.sighting));
    for (const tm of (s.timed || [])) this.timers.push({ at: this.t + tm.after, turn: tm.turn, stage: s.id });
    this._note();
  }

  _complete(s) {
    const rec = this.st[s.id];
    if (rec.state !== 'active') return;
    rec.state = 'done';
    rec.t1 = this.t;
    this.order.push({ id: s.id, t: +this.t.toFixed(2) });
    const text = this.S.stage(s.id);
    let line = text.log;
    if (s.flagVariant && rec.flagged && text.logFlagged) line = text.logFlagged;
    else if (s.flagVariant && rec.seen && text.logSeen) line = text.logSeen;
    this._log(s.id, fill(line, { n: rec.n, of: s.count }));
    if (s.scenes?.done) this._scene(s.scenes.done);
    if (s.turns?.done) this._turn(s.turns.done);
    if (s.id === 'cross' && !rec.flagged && !rec.seen) this._turn('crossed-unseen');
    if (s.after) this.timers.push({ at: this.t + s.after.delay, turn: s.after.turn, stage: s.id });
    if (s.triangle && !this.triangles.has(s.triangle)) {
      this.triangles.add(s.triangle);
      this._hook('triangle', s.triangle, TRIANGLES[s.triangle]);
    }
    // the stage that ran alongside closes with its count (an optional one never blocks)
    if (s.with) {
      const w = this.byId.get(s.with), wr = this.st[s.with];
      if (wr.state === 'active') {
        wr.state = wr.n > 0 ? 'done' : 'skipped';
        wr.t1 = this.t;
        if (wr.n > 0) this._log(w.id, fill(this.S.stage(w.id).log, { n: wr.n, of: w.count }));
      }
    }
    if (s.checkpoint) this._hook('checkpoint', `stage:${s.id}`);
    if (!s.optional) this._enter(this.idx + 1);
  }

  _finish() {
    if (this.done) return;
    this.done = true;
    this.idx = this.stages.length;
    const closing = this.S.quest.closing;
    if (!this.rewarded) {
      this.rewarded = true;
      this._hook('reward', REWARD, closing.reward);
    }
    this._log('end', closing.logEnd);
    this._card('brazier');
    this._note();
    this._hook('checkpoint', 'quest:done');
    this._hook('done');
  }

  /* ---------------------------------------------------------- inputs */

  update(dt, world) {
    if (!this.started) return;
    this.t += dt;
    // timed turns (each fires once)
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      if (this.t >= tm.at) { this.timers.splice(i, 1); this._turn(tm.turn); }
    }
    const s = this.current();
    if (!s || !world) return;
    if (s.type === 'goto') {
      if (world.near(s.anchor, s.radius, s.up ?? 0)) this._complete(s);
    } else if (s.type === 'sight') {
      if (world.aim(s.target)) {
        this.aimT += dt;
        if (this.aimT >= s.hold) this._complete(s);
      } else this.aimT = 0;
    } else if (s.type === 'survey') {
      if (!world.near(s.anchor, 6, 0)) return;
      for (const p of s.pillars) {
        if (this.surveyed.has(p)) continue;
        if (world.aim(p)) {
          this.surveyT[p] = (this.surveyT[p] ?? 0) + dt;
          if (this.surveyT[p] >= s.hold) {
            this.surveyed.add(p);
            this.st[s.id].n = this.surveyed.size;
            this._turn(`sight-${p.toLowerCase()}`, { bearing: world.bearing?.(p) ?? 0 });
            this._note();
          }
        } else this.surveyT[p] = 0;
      }
      if (s.pillars.every((p) => this.surveyed.has(p))) this._complete(s);
    }
  }

  notify(type, e = {}) {
    if (!this.started) return;
    const act = this.activeStages();
    if (type === 'flagged') {
      for (const s of act) this.st[s.id].flagged = true;
      this._turn('flagged');
      return;
    }
    // spotted (an Instrument alert or attacking within 60 m: the HUD's SPOTTED) without a Flag: the stage was seen
    if (type === 'seen') { for (const s of act) this.st[s.id].seen = true; return; }
    if (type === 'plumb-chime') { this._turn('chime'); return; }
    if (type === 'plumb-dark') { this._turn('plumb-dark'); return; }
    if (type === 'plumb-hit') {
      if (this.current()?.id === 'topple') this._turn('vial-hit');
      return;
    }
    for (const s of act) {
      const rec = this.st[s.id];
      if (s.type === 'talk' && type === 'scene-done' && e.scene === s.scene && e.exit !== false) this._complete(s);
      else if (s.type === 'gather') {
        const hit = (s.source && type === 'gathered' && e.source === s.source)
          || (s.ammo && type === 'ammo-crafted' && e.ammo === s.ammo);
        if (!hit) continue;
        rec.n = Math.min(s.count, rec.n + Math.max(1, e.n | 0 || 1));
        if (s.ammo || rec.n >= s.count) this._complete(s);
        else this._note();
      } else if (s.type === 'kill') {
        if (e.kind && e.kind !== s.kind) continue;
        const hit = (s.mode === 'kill' && type === 'machine-killed')
          || (s.mode === 'topple' && type === 'plumb-topple')
          || (s.mode === 'pry' && type === 'part-torn' && e.part === 'bob');
        if (!hit) continue;
        rec.n += 1;
        if (s.mode === 'kill' && s.kind === 'peg' && rec.n === 1) this._turn('peg-lamp-out');
        if (rec.n >= s.count && !s.optional) this._complete(s);
        else this._note();
      }
    }
  }

  /** The player spoke to `npc`. Returns the scene to play, or null when the quest has nothing to say. */
  talk(npc) {
    const s = this.current();
    if (s && s.type === 'talk' && s.npc === npc) { this._scene(s.scene, true); return s.scene; }
    if (this.done && npc === 'mise' && !this.seen.scenes.has('mise-dusk')) { this._scene('mise-dusk'); return 'mise-dusk'; }
    return null;
  }

  /* --------------------------------------------------------- outputs */

  noteText() {
    if (this.done) return this.S.quest.closing.note;
    const s = this.current();
    if (!s) return '';
    const rec = this.st[s.id];
    const count = s.type === 'survey' ? s.pillars.length : s.count;
    return fill(this.S.stage(s.id).note, { n: rec.n, of: count });
  }

  /** The shape `Progression.state(id)` returns: what src/ui/hud.js's field note reads. */
  hudState() {
    if (!this.started) return null;
    const s = this.current();
    return {
      id: QUEST_ID,
      status: 'active',   // the note stays up after the reward to say what the reward opened
      title: this.S.quest.title,
      current: { id: s?.id ?? 'end', type: s?.type ?? 'end', label: this.noteText(), have: 0, need: 1 },
      progress: 0,
    };
  }

  report() {
    return {
      quest: QUEST_ID,
      started: this.started,
      done: this.done,
      current: this.current()?.id ?? (this.done ? 'reward' : null),
      reached: this.order.map((o) => o.id),
      times: this.order,
      stages: Object.fromEntries(Object.entries(this.st).map(([k, v]) => [k, v.state])),
      lamps: this.st.lamps?.n ?? 0,
      flaggedCrossing: !!this.st.cross?.flagged,
      seenCrossing: !!this.st.cross?.seen,
      triangles: [...this.triangles],
      t: +this.t.toFixed(2),
    };
  }

  serialize() {
    return {
      v: 1, id: QUEST_ID, started: this.started, done: this.done, rewarded: this.rewarded, idx: this.idx,
      t: +this.t.toFixed(2),
      stages: Object.fromEntries(Object.entries(this.st).map(([k, v]) => [k, [v.state, v.n, v.flagged ? 1 : 0, v.seen ? 1 : 0]])),
      surveyed: [...this.surveyed],
      seen: { turns: [...this.seen.turns], cards: [...this.seen.cards], scenes: [...this.seen.scenes] },
      triangles: [...this.triangles],
      order: this.order.slice(),
      log: this.log.slice(),
    };
  }

  /** Restore without replaying anything: no card, turn or scene fires for what is already seen. */
  restore(d) {
    this.reset();
    if (!d || d.id !== QUEST_ID) return false;
    this.started = !!d.started;
    this.done = !!d.done;
    this.rewarded = !!d.rewarded;
    this.idx = Math.max(0, Math.min(this.stages.length, d.idx | 0));
    this.t = Number(d.t) || 0;
    for (const [k, v] of Object.entries(d.stages || {})) {
      if (!this.st[k] || !Array.isArray(v)) continue;
      this.st[k].state = String(v[0]);
      this.st[k].n = v[1] | 0;
      this.st[k].flagged = !!v[2];
      this.st[k].seen = !!v[3];
    }
    for (const p of (d.surveyed || [])) this.surveyed.add(p);
    for (const k of ['turns', 'cards', 'scenes']) for (const x of (d.seen?.[k] || [])) this.seen[k].add(x);
    for (const t of (d.triangles || [])) this.triangles.add(t);
    this.order = Array.isArray(d.order) ? d.order.slice() : [];
    this.log = Array.isArray(d.log) ? d.log.slice() : [];
    this._note();
    return true;
  }

  /* --------------------------------------------------------- helpers */

  _hook(name, ...a) {
    const fn = this.hooks[name];
    if (typeof fn === 'function') { try { fn(...a); } catch (err) { this.hookErrors = (this.hookErrors ?? 0) + 1; this.lastHookError = String(err?.message || err); } }
  }

  _note() { this._hook('note', this.noteText()); }

  _log(stageId, line) {
    this.log.push({ stage: stageId, line });
    this._hook('log', stageId, line);
  }

  _turn(on, vars = {}) {
    if (this.seen.turns.has(on)) return;
    const card = this.S.turn(on);
    if (!card) return;
    this.seen.turns.add(on);
    this._hook('turn', on, card, vars);
  }

  _card(id) {
    if (this.seen.cards.has(id)) return;
    const card = this.S.card(id);
    if (!card) return;
    this.seen.cards.add(id);
    this._hook('card', id, card);
  }

  _scene(id, force = false) {
    if (!force && this.seen.scenes.has(id)) return;
    const scene = this.S.scene(id);
    if (!scene) return;
    this.seen.scenes.add(id);
    this._hook('scene', id, scene);
  }
}
