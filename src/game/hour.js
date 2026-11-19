import { QUEST_STRINGS, TEXT_W2 } from './text.js';
import { fill } from './strings.js';
import { QuestSpine } from './quest/spine.js';
import {
  SCAR_ID, TRUE_GROUND_ID, SCAR_STAGES, TRUE_GROUND_STAGES, SCAR_REWARD, TRUE_GROUND_REWARD, FAIL_SOFT, ORO_KIT, RESURVEY,
} from './quest/scar-plan.js';
import { TrueGround } from './quest/true-ground.js';
import { ResurveyLive, liveMarks } from './resurvey/live.js';
import { saveFieldsOf } from './save/fields.js';
import { sightBlocked } from '../instruments/lib/sight.js';
import { TRIG, TRIG_TOP } from '../world/island/sites.js';
import { BENCHMARKS, site as layoutSite } from '../world/sites/layout.js';
import { PLUMB_TERRACE, HERD_SLOPE } from '../world/holds/blockout.js';
import * as NW from '../world/settlements/ninewalls-layout.js';
import { vec3 } from '../world/settlements/brazier.js';

/**
 * THE REST OF THE FIRST HOUR, LIVE (Milestone 2 area E, wave 3): "The Scar" and "True Ground" as two more QuestSpines
 * over src/game/quest/scar-plan.js, chained after "Raker's Morning" (its reward starts "The Scar"; the Scar's end starts
 * "True Ground"), every word from src/game/text/ (W2). Built by the systems runtime (src/game/runtime.js `SystemsGame`),
 * which keeps "Raker's Morning" as `ctx.spine` and the save record's `quest`; these two ride the save seam's `quests`
 * field and true ground its `regions` field (src/game/save/fields.js).
 *
 * Publishes:
 *   ctx.quests          { 'rakers-morning', 'the-scar', 'true-ground' } -> their spines (report().reached: the runner)
 *   ctx.trueGround      the regions' truth (./quest/true-ground.js); the encounter gate and the site clock read it
 *   ctx.travel          { nodes(), canWalk(id), walkTheLine(id) }: WALK THE LINE to a re-surveyed benchmark (HR4)
 *   ctx.systemsGame.hour   this (report(), resurvey, spawned)
 *
 * WHAT IT STANDS UP (each only if the area that owns the kind has not already put one there):
 *   'herd'     five Tillers in file up the herd's slope (blockout.js HERD_SLOPE) and the second Plumb on its terrace
 *   'oro'      Tube Smith Oro at the tube mouth (people.spawn('oro')) and his TALK prompt
 *   'screed'   the Screed outside the outer wall, when its kind can be spawned
 *   'lookers'  three Pegs at their stations 27 m round Benchmark 1: the Instruments that come to look
 * WHAT IT READS besides the owners' events (each event is the scar-plan's name; the Screed sends 'screed-stalled' and
 * 'seal-off' itself, src/instruments/kinds/screed.js, and the herd its own 'herd-lee', tiller.js):
 *   herd-lee        her chest in a Tiller hull's shadow from the terrace Plumb's lamp held 0.5 s (sight.js, the one ray
 *                   test); the stage completes once whichever is heard first
 *   wall-cut        the third wall's state 'cut', or three walls cut (ninewalls-layout.js onWallChange)
 * The re-survey is this area's own (./resurvey/live.js), and so is what follows it: true ground (the Holds), the line off
 * every wall (setPainted false), 'line-faded', the travel node.
 */
const LEE_STEP_S = 0.25;
const LEE_HOLD_S = 0.5;
const HERD_N = 5;
const LOOKER_STATIONS = Object.freeze([{ b: 110, r: 27 }, { b: 180, r: 27 }, { b: 250, r: 27 }]);
const D2R = Math.PI / 180;

export class FirstHour {
  constructor(sys) {
    this.sys = sys;
    this.ctx = sys.ctx;
    const ctx = this.ctx;
    this.spawned = { herd: [], plumb2: [], screed: [], lookers: [] };
    this.people = {};
    this.flagged = false;
    this._leeT = 0; this._leeOn = 0;
    this.trueGround = new TrueGround({
      regionOf: (x, z) => ctx.regions?.map?.regionAt?.(x, z) ?? null,
      classOf: (k) => { try { return ctx.machines?.sizeClassOf?.(k) ?? null; } catch { return null; } },
    });
    ctx.trueGround = this.trueGround;
    this.S = QUEST_STRINGS;
    const make = (id, stages, reward, extra = {}) => new QuestSpine({
      strings: QUEST_STRINGS[id], hooks: this._hooks(id), stages, id, reward, triangles: {}, closingCard: null, ...extra,
    });
    this.scar = make(SCAR_ID, SCAR_STAGES, SCAR_REWARD, { failSoft: FAIL_SOFT });
    this.tg = make(TRUE_GROUND_ID, TRUE_GROUND_STAGES, TRUE_GROUND_REWARD);
    this.spines = [this.scar, this.tg];
    ctx.quests = { [sys.spine.id]: sys.spine, [SCAR_ID]: this.scar, [TRUE_GROUND_ID]: this.tg };
    this._anchors();
    this._fields();
    this._listen();
    this._travel();
    this.resurvey = null;
  }

  /* ----------------------------------------------------------- places */

  _anchors() {
    const ctx = this.ctx, A = this.sys.A;
    const C = NW.CENTRE, P = NW.PLACES;
    const tube = P.tubeMouth;
    // Oro stands 3.5 m out of the tube mouth toward the tree, facing the street
    const k = 3.5 / Math.max(1, Math.hypot(C.x - tube.x, C.z - tube.z));
    A.oro = { x: +(tube.x + (C.x - tube.x) * k).toFixed(2), z: +(tube.z + (C.z - tube.z) * k).toFixed(2) };
    A.ninewalls = { x: C.x, z: C.z };
    A['ninewalls-rise'] = { x: C.x, z: C.z };
    A.terrace = { x: PLUMB_TERRACE.e, z: -PLUMB_TERRACE.n };
    A.barranco = { x: (HERD_SLOPE[0].e + HERD_SLOPE[1].e) / 2, z: -(HERD_SLOPE[0].n + HERD_SLOPE[1].n) / 2 };
    A['ninewalls-brazier'] = { x: P.brazier.x, z: P.brazier.z };
    const bm = BENCHMARKS.find((b) => b.id === RESURVEY.benchmark);
    A.b1 = { x: bm.x, z: bm.z };
    // the live pad (props/survey.js stands it on the flattest ground within r of the table's point)
    this._padFromProps();
    this.herdLine = HERD_SLOPE.map((p) => ({ x: p.e, z: -p.n }));
    void ctx;
  }

  _padFromProps() {
    const b = this.ctx.props?.survey?.benchmarks?.find?.((q) => q.id === RESURVEY.benchmark);
    if (b) { this.sys.A.b1 = { x: b.x, z: b.z }; this._padLive = true; }
  }

  /* ------------------------------------------------------- the save seam */

  _fields() {
    const F = saveFieldsOf(this.ctx);
    const reg = (id, pair) => { try { F.register(id, pair); } catch (err) { console.warn(`[systems] save field ${id}:`, err?.message || err); } };
    reg('quests', {
      get: () => ({ [SCAR_ID]: this.scar.serialize(), [TRUE_GROUND_ID]: this.tg.serialize() }),
      set: (v) => {
        this._restoredQuests = true;
        for (const sp of this.spines) {
          const d = v?.[sp.id];
          // a fixture or an older shape ({ done, through }) is not a spine record: the quest is then judged from it
          if (d && d.v === 1) sp.restore(d);
          else if (d && d.done) { sp.start(); this._silentThrough(sp, d.through || sp.stages.map((s) => s.id)); }
          else sp.reset();
        }
      },
    });
    reg('regions', {
      get: () => this.trueGround.serialize(),
      set: (v) => { this.trueGround.restore(v); },
    });
  }

  /** Mark stages done without playing anything (an older record's `through`). */
  _silentThrough(sp, ids) {
    for (const id of ids) { const r = sp.st[id]; if (r) { r.state = 'done'; r.t1 = sp.t; sp.order.push({ id, t: sp.t }); } }
    sp.restore(sp.serialize());
  }

  /** After a record is applied (SystemsGame.restoreQuest): a slice save carries forward into "The Scar" (Q5). */
  afterRestore() {
    const rm = this.sys.spine;
    if (rm.done && !this.scar.started) this.startScar();
    if (this.scar.done && !this.tg.started) this.startTrueGround();
    // what a running stage stood up is the quest's, not a site's: stand it up again
    for (const sp of this.spines) {
      const cur = sp.current();
      if (cur?.spawn) this._spawn(cur.spawn, true);
    }
    // Oro's kit is hers once he has handed it over
    if (this.scar.st.oro?.state === 'done') this._grantKit(true);
    this._track();
  }

  /* ------------------------------------------------------- the chain */

  /** New Game: neither quest has begun and no region is true. */
  newGame() {
    for (const sp of this.spines) sp.reset();
    this.trueGround.restore(null);
    this._kitGiven = false; this._cutSent = false; this._fadeAt = null;
    this.resurvey?.dispose(); this.resurvey = null;
  }

  /** "Raker's Morning" is rewarded: "The Scar" starts (and on Continue from a slice save, quietly). */
  startScar() {
    if (this.scar.started) return;
    this.scar.start();
    this._track();
  }

  startTrueGround() {
    if (this.tg.started) return;
    this.tg.start();
    this._track();
  }

  /** The quest the field note holds: the first of the chain still running. */
  active() {
    if (this.tg.started && !this.tg.done) return this.tg;
    if (this.scar.started && !this.scar.done) return this.scar;
    if (this.tg.done) return this.tg;
    return null;
  }

  _track() {
    const a = this.active(), prog = this.ctx.progression;
    if (a && prog) prog.tracked = a.id;
  }

  /* ------------------------------------------------------------ hooks */

  _hooks(qid) {
    const ctx = this.ctx, sys = this.sys;
    const keys = { alidade: 'V', bearing: 'T', steady: 'SHIFT', interact: 'E', crouch: 'C', slot: '1', pry: 'E' };
    const spine = () => (qid === SCAR_ID ? this.scar : this.tg);
    const S = () => QUEST_STRINGS[qid];
    return {
      note: () => {
        if (this.active()?.id !== qid) return;
        const prog = ctx.progression;
        if (prog) prog.tracked = qid;
        ctx.events?.emit?.('quest-objective', { questId: qid, label: spine()?.noteText?.() ?? '' });
      },
      card: (id, c) => ctx.hud?.showTip?.({ id: `w2-${id}`, title: c.head || '', body: fill(c.body, { keys }), keys: [] }),
      turn: (on, c, vars) => sys.present.subtitle(c.lines.map((l) => fill(l, { ...vars, keys })), S().speakers.brea.name),
      scene: (id, scene) => sys._playScene(id, scene, spine(), S()),
      log: (stage, line) => sys.events.push({ t: spine()?.t ?? 0, quest: qid, stage, line }),
      checkpoint: (reason) => ctx.progression?.checkpoint?.(`${qid}:${reason}`),
      spawn: (what) => this._spawn(what),
      reward: (r, words) => this._reward(qid, r, words),
      sighting: (id) => { sys.sightingCard = id; },
      done: () => {
        ctx.events?.emit?.('quest-complete', { questId: qid });
        if (qid === SCAR_ID) this.startTrueGround();
      },
    };
  }

  _reward(qid, r, words) {
    const inv = this.ctx.inventory;
    for (const [id, n] of (r.items || [])) inv?.add?.(id, n);
    if (r.opens) this.ctx.events?.emit?.('counter-opened', { id: r.opens, quest: qid });
    if (r.node) this.ctx.events?.emit?.('travel-node', { id: r.node, quest: qid });
    this.ctx.progression?.banner?.(this.sys.S.systems.reward.head, words.join('  ·  '), 'quest');
  }

  /** A scene of one of these quests has played to its end (SystemsGame._playScene). */
  sceneDone(id, spine) {
    if (spine === this.scar && id === 'hand-over') this._grantKit(false);
  }

  /** Oro's hand-over (bible 0:35): the gaff, the Windwall, two Brine and one Cinder, on her (armory) and in the record. */
  _grantKit(quiet) {
    if (this._kitGiven) return;
    this._kitGiven = true;
    const hero = this.ctx.player?.hero;
    try { hero?.grantOroKit?.({ gaff: true, windwall: true, pots: 3 })?.catch?.((err) => console.warn('[systems] kit:', err?.message || err)); } catch (err) { console.warn('[systems] kit:', err?.message || err); }
    if (!quiet) this.ctx.events?.emit?.('kit-given', { items: ORO_KIT.map(([id, n]) => [id, n]) });
  }

  /* ------------------------------------------------------------ events */

  _listen() {
    const ev = this.ctx.events;
    if (!ev?.on) return;
    const on = (n, fn) => ev.on(n, (e) => { try { fn(e || {}); } catch (err) { this.listenErrors = (this.listenErrors ?? 0) + 1; this.lastListenError = String(err?.message || err); } });
    const all = (type, e) => { for (const sp of this.spines) sp.notify(type, e); };
    // the scar-plan's own events, sent by the areas that own them
    for (const n of ['region-enter', 'herd-lee', 'screed-stalled', 'seal-off', 'line-faded', 'rested', 'weather', 'sighted', 'resurvey-done']) on(n, (e) => all(n, e));
    on('wall-cut', (e) => all('wall-cut', e));
    // the slice's events these quests also wait on
    on('plumb-topple', (e) => all('plumb-topple', { kind: e.machine?.kind ?? 'plumb' }));
    on('machine-killed', (e) => all('machine-killed', { kind: e.machine?.kind }));
    on('ammo-crafted', (e) => all('ammo-crafted', { ammo: e.ammo, n: e.n }));
    on('flagged', () => { this.flagged = true; all('flagged', {}); });
    on('flag-ended', () => { this.flagged = false; });
    on('plumb-chime', () => all('plumb-chime', {}));
    // the third wall cut (whoever cut it: the Screed's rules write it through the walls seam)
    this._unwall = NW.onWallChange?.((id) => this._wallChanged(id));
  }

  _wallChanged(id) {
    if (id == null) return;
    const cut = (NW.WALLS || []).filter((w) => NW.wallState(w.id)?.state === 'cut').length;
    const st = NW.wallState(id);
    if (st?.state === 'cut' && (String(id) === `wall-${FAIL_SOFT.wall}` || cut >= FAIL_SOFT.wall) && !this._cutSent) {
      this._cutSent = true;
      this.ctx.events?.emit?.('wall-cut', { wall: FAIL_SOFT.wall, id, cuts: cut });
    }
  }

  talk(npc) {
    if (npc !== 'oro') return null;
    return this.scar.talk('oro');
  }

  /* ------------------------------------------------------------ spawns */

  _live(list) { return (list || []).filter((m) => m && m.alive !== false && !m._disposed); }

  _near(kind, at, r) {
    return this._live(this.ctx.machines?.list).filter((m) => m.kind === kind && Math.hypot(m.position.x - at.x, m.position.z - at.z) <= r);
  }

  _spawn(what, again = false) {
    const M = this.ctx.machines;
    const can = (k) => { try { return !!(M?.canSpawn?.(k) ?? M?.instrumentKinds?.[k]); } catch { return false; } };
    if (what === 'herd') {
      const A = this.sys.A;
      if (can('plumb') && !this._near('plumb', A.terrace, 30).length) {
        const m = M.spawn('plumb', A.terrace.x, A.terrace.z, {});
        if (m) { this.sys.siteRefill?.own(m, SCAR_ID); this._keepForTopple(m); this.spawned.plumb2.push(m); }
      }
      const [a, b] = this.herdLine;
      if (can('tiller') && !this._near('tiller', { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, 150).length) {
        const herd = { center: vec3((a.x + b.x) / 2, 0, (a.z + b.z) / 2), vector: vec3(b.x - a.x, 0, b.z - a.z).normalize(), alarmed: false, rearguard: null, members: [] };
        M.squads?.registerHerd?.(herd);
        const L = Math.hypot(b.x - a.x, b.z - a.z) || 1, ux = (b.x - a.x) / L, uz = (b.z - a.z) / L, heading = Math.atan2(ux, uz);
        for (let i = 0; i < HERD_N; i++) {
          // in file from the slope's foot, 9.5 m apart (tiller-herd.js FILE.gap), the leader highest
          const s = Math.max(0, 6 + (HERD_N - 1 - i) * 9.5);
          const x = a.x + ux * s, z = a.z + uz * s;
          const m = M.spawn('tiller', x, z, { herd, heading, route: [vec3(x, 0, z), vec3(b.x, 0, b.z)] });
          if (!m) continue;
          M.squads?.join?.(m, herd, 'herd');
          this.sys.siteRefill?.own(m, SCAR_ID);
          this.spawned.herd.push(m);
        }
      }
    } else if (what === 'oro') {
      this._standOro();
    } else if (what === 'screed') {
      if (!can('screed')) return;
      const C = NW.CENTRE, r = (NW.OUTER_R || 68) + 14, b = 45 * D2R;
      const at = { x: C.x + Math.sin(b) * r, z: C.z - Math.cos(b) * r };
      if (this._near('screed', NW.CENTRE, 160).length) return;
      const m = M.spawn('screed', at.x, at.z, { heading: Math.atan2(C.x - at.x, C.z - at.z) });
      if (m) { this.sys.siteRefill?.own(m, SCAR_ID); this.spawned.screed.push(m); }
    } else if (what === 'lookers') {
      if (!can('peg')) return;
      const B = this.sys.A.b1;
      if (!again || !this._live(this.spawned.lookers).length) {
        for (const st of LOOKER_STATIONS) {
          const x = B.x + Math.sin(st.b * D2R) * st.r, z = B.z - Math.cos(st.b * D2R) * st.r;
          const m = M.spawn('peg', x, z, { route: [vec3(x, 0, z), vec3(x + Math.sin(st.b * D2R) * 4, 0, z - Math.cos(st.b * D2R) * 4)] });
          if (m) { this.sys.siteRefill?.own(m, TRUE_GROUND_ID); this.spawned.lookers.push(m); }
        }
      }
    }
  }

  /**
   * The terrace Plumb lives until it is toppled (as the slice's ditch Plumb lives until its bob is pried, runtime.js
   * _keepForPry): while 'herd' or 'plumb-2' runs a hit lands in full but leaves it a floor of health, so arrows that
   * miss the vial cannot end the beat with no Plumb to topple.
   */
  _keepForTopple(m) {
    const td = m.takeDamage?.bind(m), scar = this.scar;
    if (!td) return;
    m.takeDamage = (hit) => {
      const st = scar.current()?.id;
      if (!(st === 'herd' || st === 'plumb-2') || m.alive === false) return td(hit);
      const h0 = m.health, room = 1e6, floor = Math.max(1, 0.12 * (m.maxHealth || 1));
      m.health = h0 + room;
      try { return td(hit); } finally { if (m.alive !== false) m.health = Math.max(Math.min(h0, floor), m.health - room); }
    };
  }

  /** Oro at the tube mouth: the one the people lane stood there, or one stood here; and his TALK prompt. */
  _standOro() {
    const ctx = this.ctx, A = this.sys.A;
    const found = ctx.people?.list?.find?.((p) => p.archetype === 'oro');
    if (found) this.people.oro = found;
    else if (!this._oroAsked && ctx.people?.spawn) {
      this._oroAsked = true;
      const yaw = Math.atan2(NW.CENTRE.x - A.oro.x, NW.CENTRE.z - A.oro.z);
      ctx.people.spawn('oro', { x: A.oro.x, z: A.oro.z, yaw, seed: 9 }).then((p) => { this.people.oro = p; }).catch(() => { /* the prompt still stands */ });
    }
    const I = ctx.interactables;
    if (I?.register && !this.oroEntry) {
      const y = ctx.terrain?.getHeight?.(A.oro.x, A.oro.z) ?? 0;
      const label = fill(this.sys.S.systems.prompts.talk, { name: QUEST_STRINGS[SCAR_ID].speakers.oro.name });
      this.oroEntry = I.register({ position: vec3(A.oro.x, y, A.oro.z), radius: 3.0, hold: 0.3, label, once: false, onInteract: () => this.sys.talk('oro') });
    }
  }

  /* ------------------------------------------------------------ the frame */

  update(dt) {
    const ctx = this.ctx;
    if (!this._padLive) this._padFromProps();
    this._gate();
    if (ctx.state !== 'playing') return;
    for (const sp of this.spines) if (sp.started && !sp.done) sp.update(dt, this.sys.world);
    // what a running stage stands up, again if its kinds were still loading when it began (every 3 s; each is guarded)
    this._spawnT = (this._spawnT ?? 0) + dt;
    if (this._spawnT > 3) {
      this._spawnT = 0;
      for (const sp of this.spines) { const c = sp.current(); if (c?.spawn) this._spawn(c.spawn, true); }
    }
    const cur = this.scar.current()?.id;
    // the Oro prompt is live while the hand-over waits; he stays standing after
    if (this.oroEntry) this.oroEntry.disabled = cur !== 'oro';
    if (cur === 'herd') this._lee(dt);
    this._resurveyStep(dt);
    if (this._fadeAt != null && this.tg.t >= this._fadeAt) {
      this._fadeAt = null;
      ctx.events?.emit?.('line-faded', { walls: (NW.WALLS || []).filter((w) => NW.wallState(w.id)?.painted).length, by: 'systems' });
    }
  }

  /** The encounter gate (HR4): on true ground no correcting kind is let in (doctrine and site respawns ask it first). */
  _gate() {
    const M = this.ctx.machines;
    if (!M?.encounterAllows || M.__trueGroundGate) return;
    const orig = M.encounterAllows;
    M.encounterAllows = (kind, x, z) => (this.trueGround.refuses(kind, x, z) ? { ok: false, why: ['true ground: no correcting kind'] } : orig(kind, x, z));
    M.__trueGroundGate = true;
  }

  /** herd-lee: her chest in a Tiller's hull shadow from the terrace Plumb's lamp, held LEE_HOLD_S. */
  _lee(dt) {
    this._leeT += dt;
    if (this._leeT < LEE_STEP_S) return;
    const step = this._leeT; this._leeT = 0;
    const p = this.ctx.player?.position;
    const plumbs = this._near('plumb', this.sys.A.terrace, 40);
    if (!p || !plumbs.length) return;
    const P = plumbs[0];
    const ly = P.position.y + (PLUMB_TERRACE.lamp ?? 2.5);
    if (Math.hypot(P.position.x - p.x, P.position.z - p.z) > 90) { this._leeOn = 0; return; }
    const hit = sightBlocked(P.position.x, ly, P.position.z, p.x, p.y + 1.2, p.z, 'plumb:');
    const inShadow = !!hit && String(hit).startsWith('tiller');
    this.lastLee = { inShadow, by: hit, t: +this.scar.t.toFixed(2) };
    this._leeOn = inShadow ? this._leeOn + step : 0;
    if (this._leeOn >= LEE_HOLD_S) {
      this._leeOn = 0;
      this.ctx.events?.emit?.('herd-lee', { inShadow: true, plumb: P.id ?? null, by: hit, from: 'systems' });
    }
  }

  /* ------------------------------------------------------------ the re-survey */

  _resurveyStep(dt) {
    // a frame's staging holds the re-survey where it set it (stageResurvey): the quest's own arming stands aside
    if (this._staged) return;
    const want = this.tg.current()?.id === 'survey';
    if (want && !this.resurvey) this._buildResurvey();
    if (!this.resurvey) return;
    this.resurvey.arm(want);
    if (want) this.resurvey.update(dt);
  }

  _buildResurvey() {
    const ctx = this.ctx;
    const ground = (x, z) => ctx.terrain?.getHeight?.(x, z) ?? 0;
    const names = TEXT_W2.quests[TRUE_GROUND_ID].resurvey?.marks ?? {};
    const marks = liveMarks({ ground, trig: TRIG, trigTop: TRIG_TOP, ring: layoutSite('sounding-ring'), names });
    const spine = this.tg;
    this.resurvey = new ResurveyLive(ctx, {
      at: this.sys.A.b1, marks,
      hooks: {
        refuses: (k) => this.trueGround.isCorrecting(k),
        start: () => spine._turn('resurvey-start'),
        lookers: (list) => { if (list.length) spine._turn('lookers'); },
        paused: (why) => spine._turn(why === 'hit' ? 'arc-paused' : 'off-mark'),
        bearing: (r) => {
          spine._turn(`bearing-${r.id}`, { bearing: r.bearing });
          spine.notify('bearing-taken', { benchmark: RESURVEY.benchmark, n: r.n });
          ctx.events?.emit?.('resurvey-bearing', { benchmark: RESURVEY.benchmark, ...r });
        },
        done: (rep) => this._resurveyed(rep),
      },
    });
  }

  /** The re-survey closed: true ground in the Holds, the line off every wall, the Screeds stand down (bible 11.2 0:45). */
  _resurveyed(rep) {
    const ctx = this.ctx;
    const bearings = rep.bearings.map((b) => b.bearing);
    this.resurveyReport = rep;
    ctx.events?.emit?.('resurvey-done', { benchmark: RESURVEY.benchmark, bearings, report: rep });
    ctx.events?.emit?.('benchmark-resurveyed', { id: RESURVEY.benchmark, region: 'ninewalls' });
    const hour = ctx.environment?.time ?? 0;
    this.trueGround.makeTrue('holds', { benchmark: RESURVEY.benchmark, hour });
    ctx.events?.emit?.('true-ground', { region: 'holds', benchmark: RESURVEY.benchmark });
    for (const w of (NW.WALLS || [])) NW.setPainted?.(w.id, false);
    // the 'fade' stage's line-faded: settlements sends it when the walls have drawn the change; if not, 2 s on
    this._fadeAt = this.tg.t + 2.0;
    // the correcting kinds in the Holds stand down: calm, and back to where they came from
    for (const m of this._live(ctx.machines?.list)) {
      if (!this.trueGround.isCorrecting(m.kind) || !this.trueGround.trueAt(m.position.x, m.position.z)) continue;
      try { m.forceState?.('return'); } catch { /* its own state machine */ }
    }
  }

  /**
   * F44's staging (tools/frames/stagings/systems.mjs; a ?shot page, no quest running): the re-survey as it stands `atS`
   * seconds into the hold, set from a clean slate rather than played: the lookers stood up at their stations and placed
   * where a lured Peg is at that time (0.9 s facing, then 0.7 of its 1.25 m/s walk toward its point), T1 and T2 taken,
   * the arc at `atS` less the slew between them, the overlay painted. Returns the report it froze.
   */
  stageResurvey({ atS = 10, slewS = 1.2, taken = 2 } = {}) {
    if (!this.resurvey) this._buildResurvey();
    const L = this.resurvey;
    this._staged = true;
    L.arm(true);
    this._spawn('lookers');
    L.running = true; L.startT = L.simT;
    L._sendLookers();
    const walked = Math.max(0, atS - 0.9) * 1.25 * 0.7;
    const H = (x, z) => this.ctx.terrain?.getHeight?.(x, z) ?? 0;
    for (const lk of L.lookers) {
      const m = lk.m; if (!m?.position) continue;
      const dx = lk.to.x - lk.from.x, dz = lk.to.z - lk.from.z, d = Math.hypot(dx, dz) || 1, k = Math.min(1, walked / d);
      const x = lk.from.x + dx * k, z = lk.from.z + dz * k;
      m.position.set(x, H(x, z), z);
      if (m.sc) m.sc.heading = Math.atan2(dx, dz);
      lk.leaveT = 0.9; if (Math.hypot(x - L.at.x, z - L.at.z) <= L.cfg.nearM) lk.arriveT = +atS.toFixed(2);
    }
    const eye = { x: L.at.x, y: H(L.at.x, L.at.z) + 1.55, z: L.at.z };
    for (const m of L.R.marks.slice(0, taken)) {
      const dir = { x: m.x - eye.x, y: (m.y1 - 0.3) - eye.y, z: m.z - eye.z };
      const n = Math.hypot(dir.x, dir.y, dir.z); dir.x /= n; dir.y /= n; dir.z /= n;
      L.R.take({ eye, dir, alidade: true, onPad: true });
    }
    L.R.arc = Math.max(0, atS - slewS * Math.max(0, taken - 1));
    L.R.t = atS; L.simT = L.startT + atS;
    L.R.on = true; L.R.mark = L.R.marks[Math.max(0, taken - 1)].id;
    L._shown = false; L._show(true); L._paint();
    return L.report();
  }

  /** The staging's undo: the quest's own arming takes the re-survey back. */
  unstageResurvey() {
    this._staged = false;
    this.resurvey?.arm(false);
  }

  /* ------------------------------------------------------------ travel */

  _travel() {
    const ctx = this.ctx, self = this;
    ctx.travel = {
      nodes: () => self.trueGround.nodes(),
      /** null when she may walk to it, else why not: 'not-a-node' | 'flagged' | 'wary' */
      canWalk(id) {
        if (!self.trueGround.nodes().includes(id)) return 'not-a-node';
        return self.trueGround.walkRefused({ flagged: self.flagged, wary: self.sys._spotted?.() ?? false });
      },
      walkTheLine(id) {
        const why = this.canWalk(id);
        if (why) return { ok: false, why };
        const b = ctx.props?.survey?.benchmarks?.find?.((q) => q.id === id) ?? BENCHMARKS.find((q) => q.id === id);
        const p = ctx.player;
        if (!b || !p) return { ok: false, why: 'no-place' };
        const from = { x: p.position.x, z: p.position.z };
        p.position.set(b.x + 1.6, p.position.y, b.z + 1.6);
        p.velocity?.set?.(0, 0, 0);
        p._snapToGround?.();
        ctx.events?.emit?.('travel', { from, to: { x: b.x, z: b.z }, site: id, walk: 'the-line' });
        try { ctx.progression?.checkpoint?.('travel'); } catch { /* no save lane */ }
        return { ok: true, to: id };
      },
    };
  }

  /* ------------------------------------------------------------ out */

  report() {
    return {
      scar: this.scar.report(), trueGround: this.tg.report(), regions: this.trueGround.serialize(), refused: this.trueGround.refused,
      resurvey: this.resurvey?.report?.() ?? null, lee: this.lastLee ?? null,
      spawned: Object.fromEntries(Object.entries(this.spawned).map(([k, v]) => [k, this._live(v).length])),
      oro: !!this.people.oro, kit: !!this._kitGiven, flagged: this.flagged,
    };
  }

  dispose() {
    this._unwall?.();
    if (this.oroEntry) this.ctx.interactables?.unregister?.(this.oroEntry);
    this.resurvey?.dispose();
  }
}

export { RESURVEY };
