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
 *   arm()                          the note only: play began with no New Game or Continue (see arm())
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
  /**
   * Milestone 2: one spine per quest. "Raker's Morning" is the default (plan.js); "The Scar" and "True Ground" hand in
   * their own `id`, `stages`, `reward` and strings (src/game/quest/scar-plan.js, makeQuestStrings). `failSoft` is a
   * quest's one branch: { event, where, from: [stage ids], continuesTo } (HR2: the Screed cuts the third wall and the
   * quest goes on from 'seal-2'). `closingCard` is the tutorial card the reward raises (the BRAZIER card, the slice's).
   */
  constructor({ strings, hooks = {}, stages = STAGES, id = QUEST_ID, reward = REWARD, triangles = TRIANGLES, failSoft = null, closingCard = 'brazier' }) {
    this.S = strings;
    this.hooks = hooks;
    this.stages = stages;
    this.qid = id;
    this.reward = reward;
    this.triangleSets = triangles;
    this.failSoft = failSoft;
    this.closingCard = closingCard;
    this.byId = new Map(stages.map((s) => [s.id, s]));
    for (const s of stages) {
      if (!strings.stage(s.id)) throw new Error(`stage ${s.id} has no text`);
    }
    this.reset();
  }

  get id() { return this.qid; }

  reset() {
    this.started = false;
    this.armed = false;
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
    this.branch = null;
  }

  /* ------------------------------------------------------------ flow */

  start() {
    this.reset();
    this.started = true;
    this._enter(0);
    return this;
  }

  /**
   * ARMED, not started: the field note names the quest and its first objective, and nothing else runs (no stage is
   * entered, no turn, card, scene, spawn, timer or checkpoint; update and notify ignore the world). The runtime arms
   * the spine when play begins without New Game or Continue (a `?shot` page: the Frame Set and the gate rows), so
   * the field note stands there as the stand-in quest stood before the spine (A71g-tracker-live passed on it at
   * fb6d5f0; at 39f7533 nothing was tracked there and the note never showed). New Game starts the quest for real.
   */
  arm() {
    if (this.started) return this;
    this.armed = true;
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
      this._hook('triangle', s.triangle, this.triangleSets?.[s.triangle]);
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
    // the silent checkpoint is written AFTER the next stage is entered: written before, the record held the finished
    // stage as current, and a death or Continue restored a quest wedged on a stage that can never complete again
    // (f90d2b0 film: died at the ditch, stood up on 'sight' done, no way on)
    if (!s.optional) this._enter(this.idx + 1);
    if (s.checkpoint) this._hook('checkpoint', `stage:${s.id}`);
  }

  _finish() {
    if (this.done) return;
    this.done = true;
    this.idx = this.stages.length;
    const closing = this.S.quest.closing;
    if (!this.rewarded) {
      this.rewarded = true;
      if (this.reward) this._hook('reward', this.reward, closing.reward);
    }
    this._log('end', this.branch && closing.logEndBranch ? closing.logEndBranch : closing.logEnd);
    if (this.closingCard) this._card(this.closingCard);
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
    if (this.failSoft && type === this.failSoft.event && matches(this.failSoft.where, e) && this._failSoft()) return;
    for (const s of act) {
      const rec = this.st[s.id];
      // Milestone 2 objective types (src/game/quest/scar-plan.js): each completes on its one event
      if (s.type === 'event') { if (type === s.event && matches(s.where, e)) this._complete(s); continue; }
      if (s.type === 'hold' && type === 'bearing-taken' && e.benchmark === s.benchmark) { rec.n = Math.min(s.bearings ?? 3, e.n | 0); this._note(); continue; }
      if (s.type === 'hold') { if (type === 'resurvey-done' && e.benchmark === s.benchmark) { rec.n = (e.bearings || []).length; this._complete(s); } continue; }
      if (s.type === 'rest') { if (type === 'rested' && e.brazier === s.brazier) this._complete(s); continue; }
      if (s.type === 'read') { if (type === 'sighted' && e.card === s.card) this._complete(s); continue; }
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

  /**
   * The quest's one branch (HR2's fail-soft): while a stage it covers runs, its event skips the stages between and
   * enters `continuesTo`, quietly (each skipped stage is 'cut'; the log keeps the branch's own line). Once only.
   */
  _failSoft() {
    const F = this.failSoft, cur = this.current();
    if (this.branch || !cur || !(F.from || []).includes(cur.id)) return false;
    this.branch = F.event;
    for (const id of F.from) {
      if (id === F.continuesTo) break;
      const rec = this.st[id];
      if (rec && (rec.state === 'active' || rec.state === 'pending')) { rec.state = 'cut'; rec.t1 = this.t; }
    }
    const text = this.S.stage(cur.id);
    if (text?.logBranch) this._log(cur.id, text.logBranch);
    if (F.turn) this._turn(F.turn);
    const i = this.stages.findIndex((s) => s.id === F.continuesTo);
    if (i >= 0 && this.st[F.continuesTo].state === 'pending') this._enter(i);
    return true;
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
    const count = s.type === 'survey' ? s.pillars.length : s.type === 'hold' ? s.bearings : s.count;
    return fill(this.S.stage(s.id).note, { n: rec.n, of: count });
  }

  /** The shape `Progression.state(id)` returns: what src/ui/hud.js's field note reads. */
  hudState() {
    if (!this.started && this.armed) {
      const s0 = this.stages.find((s) => !s.optional);
      const count = s0?.type === 'survey' ? s0.pillars.length : s0?.count;
      return {
        id: this.qid, status: 'active', title: this.S.quest.title, armed: true,
        current: { id: s0?.id ?? 'start', type: s0?.type ?? 'goto', label: s0 ? fill(this.S.stage(s0.id).note, { n: 0, of: count }) : '', have: 0, need: 1 },
        progress: 0,
      };
    }
    if (!this.started) return null;
    const s = this.current();
    return {
      id: this.qid,
      status: 'active',   // the note stays up after the reward to say what the reward opened
      title: this.S.quest.title,
      current: { id: s?.id ?? 'end', type: s?.type ?? 'end', label: this.noteText(), have: 0, need: 1 },
      progress: 0,
    };
  }

  report() {
    return {
      quest: this.qid,
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
      branch: this.branch,
      t: +this.t.toFixed(2),
    };
  }

  serialize() {
    return {
      v: 1, id: this.qid, started: this.started, done: this.done, rewarded: this.rewarded, idx: this.idx,
      t: +this.t.toFixed(2),
      stages: Object.fromEntries(Object.entries(this.st).map(([k, v]) => [k, [v.state, v.n, v.flagged ? 1 : 0, v.seen ? 1 : 0]])),
      surveyed: [...this.surveyed],
      seen: { turns: [...this.seen.turns], cards: [...this.seen.cards], scenes: [...this.seen.scenes] },
      triangles: [...this.triangles],
      order: this.order.slice(),
      log: this.log.slice(),
      ...(this.branch ? { branch: this.branch } : {}),
    };
  }

  /** Restore without replaying anything: no card, turn or scene fires for what is already seen. */
  restore(d) {
    this.reset();
    if (!d || d.id !== this.qid) return false;
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
    this.branch = d.branch ?? null;
    // an older record may hold a finished stage as current (written before the next was entered): step on to the
    // first unfinished one and make it active, quietly (its cards, turns and scenes are not replayed; its spawn is
    // the runtime's, restoreQuest)
    if (this.started && !this.done) {
      let i = this.idx;
      while (this.stages[i] && (this.stages[i].optional || ['done', 'skipped', 'cut'].includes(this.st[this.stages[i].id].state))) i++;
      this.idx = i;
      const cur = this.stages[i];
      if (!cur) { this.done = true; this.idx = this.stages.length; }
      else if (this.st[cur.id].state === 'pending') { this.st[cur.id].state = 'active'; this.st[cur.id].t0 = this.t; }
    }
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

/** A stage's `where` against an event's payload: every key equal (a wall's id may come as 3 or 'wall-3'). */
export function matches(where, e = {}) {
  if (!where) return true;
  for (const k of Object.keys(where)) {
    const want = where[k], got = e?.[k];
    if (want === got) continue;
    if (k === 'wall' && String(got).replace(/^wall-/, '') === String(want).replace(/^wall-/, '')) continue;
    return false;
  }
  return true;
}
