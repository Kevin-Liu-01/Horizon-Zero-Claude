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
import { TRANSIT_CARD } from './quest/scar-plan.js';
import { Certifications } from './certs/live.js';
import { Counter } from './trade/counter.js';
import { TerraceDown } from './terrace-down.js';

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
/** C5: the seconds between the herd's Tillers standing up (five in 1 s; see _spawn). */
const HERD_STEP_S = 0.2;
/** (M2 fix wave 2) How far past its line's half-length a herd member chases her before it walks back (_herdLeash). */
export const HERD_LEASH_M = 30;
const LOOKER_STATIONS = Object.freeze([{ b: 110, r: 27 }, { b: 180, r: 27 }, { b: 250, r: 27 }]);
/**
 * THE TERRACE PLUMB'S READING (M2 fix wave, area E, HR1/HR8: the terrace beat survivable for a careful player). At
 * fa45e47 leg 2 died at 'plumb-2' in all three exit runs, 97-106 hp taken (Plumb 42-75, Tiller 64, Peg 22). The terrace's
 * Plumb is a surveyor on a bench, not a fighter: when it turns on her it READS her first (readS of its drum on her, the
 * chime and the lamp up, no blow), and between its blows it stands for gapS more than its table asks. A careful player
 * gets the second vial arrow away in the reading, or backs out of reach. While "The Scar" runs 'herd' or 'plumb-2' only.
 * And it reads from range: its engage band is 9-14 m (its kind's is 2.6-7, the slice's dyke Plumb keeps that). At 5fb4925
 * (run 20261119T212927Z-5fb4925-systems-fix-probe, leg 2 from plumb-2) it held at 5-7 m from her for 60 s, every stand
 * the topple chose was inside its band (out to 14 m, it followed), one arrow was loosed, and it took 105 hp: Sightline
 * 55, bob-drop 36, pendulum 14. At 9-14 m its blow is the Sightline (5, and the Flag), and the vial is shot from there.
 */
const TERRACE = Object.freeze({ readS: 1.8, gapS: 1.2, band: Object.freeze([9, 14]) });
/**
 * The stages that stand something up again when a record is continued in them (afterRestore and the 3 s re-spawn tick):
 * a stage's own `spawn`, and what an earlier stage stood up that this one still fights. At fa45e47 a record continued at
 * 'plumb-2' (every stage is a checkpoint) had no terrace Plumb to topple, and one at 'seal-1' or 'seal-2' no Screed.
 */
const STANDS_FOR = Object.freeze({ 'plumb-2': 'herd', 'seal-1': 'screed', 'seal-2': 'screed' });
const D2R = Math.PI / 180;
/**
 * WAVE 4, the last of "True Ground" (bible 11.2 0:50-0:55; HR5, HR6):
 *   rest-noon     the Ninewalls Brazier is unlocked when the stage begins; its dialog offers REST UNTIL NOON, pre-selected,
 *                 for this one rest (braziers.noonFor); the rest writes the named save; 'brazier-rest' -> 'rested'
 *   calima-cross  calima is ASKED FOR (environment.setWeather) the first frame the hour stands inside CALIMA_WINDOW while
 *                 the stage runs (the rest put it at 12:00); the Malpais edge is the nearest Malpais cell of the regions
 *                 map to the village, and the anchor 22 m inside it ('region-enter' fires 10 m in)
 *   read-transit  Sighting held on the far form's head (within TRANSIT_TOL_DEG, TRANSIT_HOLD_S) inside the window shows
 *                 its card exactly and sends 'sighted' {card}; outside the window there is no card and no far form drawn
 */
const CALIMA_WINDOW = Object.freeze([11.5, 12.5]);
const CALIMA_FADE_S = 6;
const CALIMA_END_H = 13.5;
const EDGE_IN_M = 22;
const TRANSIT_OUT_M = 115;
const TRANSIT_TOL_DEG = 3.0;
const TRANSIT_HOLD_S = 0.6;
/**
 * (M2 fix wave 2, HR6) How long the Transit's card stays up after the read registers (s of sim time), the far form drawn
 * with it. At 02f7125 the read completed "True Ground", the stage moved on that frame and the card was taken down the
 * next: the shot at the read showed the quest's banner and no card.
 */
const FAR_CARD_HOLD_S = 6.0;
const TRANSIT_RANGE_M = 600;

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
    // wave 4: the one noon rest (HR5); the certifications (HR11); the Ninewalls counter (HR10)
    if (sys.braziers) sys.braziers.noonFor = (id) => id === 'ninewalls' && this.tg.current()?.id === 'rest-noon';
    this.certs = new Certifications(ctx, { text: TEXT_W2.certs });
    this.counter = new Counter(ctx, { present: sys.present, text: TEXT_W2.trade, notices: TEXT_W2.notices });
    this._transitT = 0;
    this._farHoldT = 0;
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
      const what = this._standsFor(sp.current());
      if (what) this._spawn(what, true);
    }
    // Oro's kit is hers once he has handed it over
    if (this.scar.st.oro?.state === 'done') this._grantKit(true);
    // (wave 4) a record with no certifications counts them from its quests (a slice save carried forward, Q5)
    this.certs?.afterRestore(rm, this.tg);
    // the counter opened on "The Scar"'s reward: a record from before wave 4 carries no counter field
    if (this.scar.done && this.scar.rewarded) this.counter?.open();
    this._track();
  }

  /* ------------------------------------------------------- the chain */

  /** New Game: neither quest has begun and no region is true. */
  newGame() {
    for (const sp of this.spines) sp.reset();
    this.trueGround.restore(null);
    this._kitGiven = false; this._cutSent = false; this._fadeAt = null;
    this.resurvey?.dispose(); this.resurvey = null;
    this._calimaAsked = null; this._calimaLet = false; this._sighted = null;
    this.certs?.newGame();
    this.counter?.newGame();
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
    // the quest's own title (at 5fb4925 the reward of "True Ground" was headed RAKER'S MORNING: systems.json's slice head)
    this.ctx.progression?.banner?.(TEXT_W2.quests[qid]?.title ?? this.sys.S.systems.reward.head, words.join('  ·  '), 'quest');
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
    // wave 4: a rest at a Brazier is the scar-plan's 'rested' {brazier, hour}; the weather's change its 'weather' {state}
    on('brazier-rest', (e) => all('rested', { brazier: e.id, hour: e.hour, choice: e.choice }));
    on('weather-changed', (e) => { all('weather', { state: e.weather }); ev.emit?.('weather', { state: e.weather, by: 'sky-look' }); });
    on('counter-opened', (e) => { if (e.id === 'ninewalls-counter') this.counter.open(); });
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

  /** What a running stage stands up (its own spawn, or what an earlier stage stood up that it still fights). */
  _standsFor(stage) { return stage ? (stage.spawn ?? STANDS_FOR[stage.id] ?? null) : null; }

  /**
   * (M2 fix wave 2, HR8) THE HERD'S LEASH. A member that turns on her (she stood on its bearing, or struck it) gives up
   * the chase HERD_LEASH_M past the half-length of its own line, measured from the line's middle (engage.js leashed():
   * territory.r + cfg.leash; the kind's table leaves 150 m), and walks back to its file. At 13030d5 chained run 3 two
   * Tillers that turned on her by the terrace followed her 110 m into Ninewalls and shoved and burst her from 80 hp to 0
   * in 8 s beside Oro (7 blows); at 2944784 run 2 one did the same at the terrace (100 hp in 23 s). A grazing herd
   * defends its line; it does not hunt her through a village. The terrace (75 m from the line's middle) is still inside.
   */
  _herdLeash(m, a, b) {
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    m.territory = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, r: L / 2 };
    const E = m.ai?.engage;
    if (E?.cfg) E.cfg = Object.freeze({ ...E.cfg, leash: HERD_LEASH_M });
  }

  _near(kind, at, r) {
    return this._live(this.ctx.machines?.list).filter((m) => m.kind === kind && Math.hypot(m.position.x - at.x, m.position.z - at.z) <= r);
  }

  _spawn(what, again = false) {
    const M = this.ctx.machines;
    const can = (k) => { try { return !!(M?.canSpawn?.(k) ?? M?.instrumentKinds?.[k]); } catch { return false; } };
    if (what === 'herd') {
      const A = this.sys.A;
      // (fix wave) ours alive anywhere is enough: at fa45e47 the 3 s tick asked only within 30 m of the terrace, and a
      // terrace Plumb that chased her off it would have been stood up a second time
      if (can('plumb') && !this._live(this.spawned.plumb2).length && !this._near('plumb', A.terrace, 30).length) {
        const m = M.spawn('plumb', A.terrace.x, A.terrace.z, {});
        if (m) { this.sys.siteRefill?.own(m, SCAR_ID); this._keepForTopple(m); this._terraceReads(m); this.spawned.plumb2.push(m); }
      }
      const [a, b] = this.herdLine;
      if (can('tiller') && !this._herdQ?.length && !this._near('tiller', { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, 150).length) {
        const herd = { center: vec3((a.x + b.x) / 2, 0, (a.z + b.z) / 2), vector: vec3(b.x - a.x, 0, b.z - a.z).normalize(), alarmed: false, rearguard: null, members: [] };
        M.squads?.registerHerd?.(herd);
        const L = Math.hypot(b.x - a.x, b.z - a.z) || 1, ux = (b.x - a.x) / L, uz = (b.z - a.z) / L, heading = Math.atan2(ux, uz);
        // C5 (engine lane, the smallest change in this file): the five stand up one at a time, HERD_STEP_S apart (update),
        // not in the frame the walk ends. At 865e8c6 the Plumb and the five Tillers built in one frame took 32 ms of its 92
        // (first-hour leg 2, run hh-c5-865e8c6), and each new machine's hit hulls are built the frame after it stands
        this._herdQ = [];
        this._herdQT = HERD_STEP_S;
        for (let i = 0; i < HERD_N; i++) {
          // in file from the slope's foot, 9.5 m apart (tiller-herd.js FILE.gap), the leader highest
          const s = Math.max(0, 6 + (HERD_N - 1 - i) * 9.5);
          const x = a.x + ux * s, z = a.z + uz * s;
          this._herdQ.push(() => {
            const m = M.spawn('tiller', x, z, { herd, heading, route: [vec3(x, 0, z), vec3(b.x, 0, b.z)] });
            if (!m) return;
            this._herdLeash(m, a, b);
            M.squads?.join?.(m, herd, 'herd');
            this.sys.siteRefill?.own(m, SCAR_ID);
            this.spawned.herd.push(m);
          });
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

  /**
   * The terrace Plumb reads her before it strikes (TERRACE): its attack choice (machine.js asks `ai.chooseAttack` every
   * frame it is engaged and off its cooldown) answers nothing for readS from the first such ask of an alert episode, nor
   * for gapS after each blow it starts. Only while 'herd' or 'plumb-2' runs.
   */
  _terraceReads(m) {
    const ai = m.ai, pick = ai?.chooseAttack?.bind(ai), scar = this.scar, E = this.ctx.engine;
    if (!pick) return;
    // its own engage row (the kind's table is shared): the band, and what the constructor derived from it
    const eng = ai.engage;
    if (eng?.cfg?.band) {
      // it stands where it reads (orbitSpeed 0: inside a metre of its ring it holds still). At c78a669 (run
      // 20261119T214111Z-c78a669-systems-fix-probe3) it circled her at 10-15 m the whole fight, its glass never still: the
      // topple waited out its 9 s for a still glass at every shot, loosed 3 arrows in 150 s, and the Sightline took 105 hp
      eng.cfg = { ...eng.cfg, band: [...TERRACE.band], orbitSpeed: 0 };
      eng.ring = (TERRACE.band[0] + TERRACE.band[1]) / 2;
      if (Number.isFinite(eng._heldHi)) eng._heldHi = Math.max(4, TERRACE.band[1] * 1.5);
    }
    let since = -1, inEp = false, blowAt = -1;
    const R = (this.terraceRule = { reads: 0, held: 0, blows: 0 });
    ai.chooseAttack = (dist) => {
      const st = scar.current()?.id;
      if (!(st === 'herd' || st === 'plumb-2')) return pick(dist);
      const t = E?.simTime ?? performance.now() / 1000;
      // an engagement is machine.js's alert episode (set going alert or attack, cleared back on patrol or return): the
      // reading starts the first time it could strike in one
      if (!m._alertEpisode) inEp = false;
      else if (!inEp) { inEp = true; since = t; R.reads++; }
      if (t - since < TERRACE.readS || (blowAt >= 0 && t - blowAt < TERRACE.gapS)) { R.held++; return null; }
      const a = pick(dist);
      if (a) { blowAt = t; R.blows++; }
      return a;
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
    // C5: the herd's next Tiller, while a stage still stands the herd up (a New Game or a load in between drops the rest)
    if (this._herdQ?.length && (this._herdQT -= dt) <= 0) {
      this._herdQT = HERD_STEP_S;
      if (this.spines.some((sp) => this._standsFor(sp.current()) === 'herd')) this._herdQ.shift()();
      else this._herdQ.length = 0;
    }
    // what a running stage stands up, again if its kinds were still loading when it began (every 3 s; each is guarded)
    this._spawnT = (this._spawnT ?? 0) + dt;
    if (this._spawnT > 3) {
      this._spawnT = 0;
      for (const sp of this.spines) { const what = this._standsFor(sp.current()); if (what) this._spawn(what, true); }
    }
    this._downStep();
    const cur = this.scar.current()?.id;
    // (M2 fix wave 2) 'barbed' closes on Barbed arrows she already carries. The slice's pry makes them from the only
    // makings she has (obsidian, which nothing sells or drops before the Ninewalls counter opens at the Scar's end): at
    // d674c92 the chained hour reached 'barbed' with 14 Barbed arrows and 0 obsidian, NEED 2 OBSIDIAN, and stopped there
    if (cur === 'barbed') { const n = ctx.combat?.ammo?.hardpoint ?? 0; if (n >= 1) this.scar.notify('ammo-held', { ammo: 'hardpoint', n }); }
    // the Oro prompt is live while the hand-over waits; he stays standing after
    if (this.oroEntry) this.oroEntry.disabled = cur !== 'oro';
    if (cur === 'herd') this._lee(dt);
    this._resurveyStep(dt);
    this._noonStep(dt);
    this.certs?.update(this.sys.spine);
    if (this._fadeAt != null && this.tg.t >= this._fadeAt) {
      this._fadeAt = null;
      ctx.events?.emit?.('line-faded', { walls: (NW.WALLS || []).filter((w) => NW.wallState(w.id)?.painted).length, by: 'systems' });
    }
  }

  /**
   * (M2 exit, X1) The terrace Plumb toppled at 'plumb-2' stays down while she is within 80 m of it or it is in her view,
   * then gets up out of sight and goes home calm on a leash to its terrace (./terrace-down.js, the site clock's rule).
   */
  _downStep() {
    if (!this.spawned.plumb2.length) return;
    if (!this.terraceDown) {
      const T = this.sys.A?.terrace;
      if (!T) return;
      this.terraceDown = new TerraceDown({
        done: () => this.scar.done || this.scar.st?.['plumb-2']?.state === 'done',
        world: () => {
          const P = this.ctx.player?.position, W = this.sys.siteRefill?.world;
          return { player: () => (P ? { x: P.x, z: P.z } : null), inView: (x, z) => !!W?.inView?.(x, z) };
        },
        home: { x: T.x, z: T.z },
      });
    }
    this.terraceDown.step(this.spawned.plumb2, this.scar.t);
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
    // (fix wave) the quest's lookers take turns from the moment they stand (resurvey/live.js TURNS)
    if (want && this.spawned.lookers.length) this.resurvey.watch(this._live(this.spawned.lookers));
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
    // (wave 4) the Instruments that came to look have seen the mark taken: they go back to their stations, calm (at
    // aba90a3 the three Pegs followed her off the pad, 72 -> 43 hp through 'fade', and stood wary within the Brazier's 60 m)
    // (fix wave) and they STAND DOWN: their own loop, docile (machine.js: a docile machine never leaves patrol). At fa45e47
    // run 2 the runner had to put their lamps out before she could sit at the Brazier (31 -> 4 hp): set to 'return' they
    // took her up again on the way
    for (const m of this._live(this.spawned.lookers)) {
      try {
        if (m.sc) m.sc.suspicion = 0; else m.suspicion = 0;
        m._attack = null;
        m.setState?.('patrol');
        m.docile = true;
      } catch { /* its own state machine */ }
    }
  }

  /* ------------------------------------------------------------ noon, calima, the Transit (wave 4) */

  /** The Malpais edge nearest the village (regions map), and the point EDGE_IN_M inside it on the same bearing. */
  _malpaisEdge() {
    if (this._edge !== undefined) return this._edge;
    const map = this.ctx.regions?.map;
    if (!map?.regionAt) return null;
    const C = NW.CENTRE;
    let best = null;
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2, ux = Math.sin(a), uz = Math.cos(a);
      for (let d = 60; d <= 420; d += 4) {
        const x = C.x + ux * d, z = C.z + uz * d;
        if (map.regionAt(x, z) === 'malpais') { if (!best || d < best.d) best = { x, z, d, ux, uz }; break; }
      }
    }
    if (!best) { this._edge = null; return null; }
    const H = (x, z) => this.ctx.terrain?.getHeight?.(x, z) ?? 0;
    const inX = best.x + best.ux * EDGE_IN_M, inZ = best.z + best.uz * EDGE_IN_M;
    const tx = best.x + best.ux * TRANSIT_OUT_M, tz = best.z + best.uz * TRANSIT_OUT_M;
    this._edge = { edge: { x: +best.x.toFixed(1), z: +best.z.toFixed(1) }, at: { x: +inX.toFixed(1), z: +inZ.toFixed(1) }, transit: { x: +tx.toFixed(1), z: +tz.toFixed(1), y: H(tx, tz) }, fromNinewalls: best.d };
    this.sys.A['malpais-edge'] = this._edge.at;
    return this._edge;
  }

  /** The far form the read is taken on: one published by its owners, else this lane's stand-in. */
  _transitFar() {
    const ctx = this.ctx;
    if (ctx.transitFar?.head) return ctx.transitFar;
    const m = this._live(ctx.machines?.list).find((q) => q.kind === 'transit');
    if (m) { const h = m.position.clone(); h.y += (m.height ?? 15) * 0.9; return { head: h, machine: m, show() {} }; }
    // no far form published (area C's ctx.transitFar is built by src/instruments/registry.js at boot): the beat cannot be
    // read and fails by name. The systems stand-in that used to be built here imported three into src/game/ (Tier 0).
    return null;
  }

  _noonStep(dt) {
    const ctx = this.ctx, cur = this.tg.current()?.id, env = ctx.environment, B = this.sys.braziers;
    const late = cur === 'rest-noon' || cur === 'calima-cross' || cur === 'read-transit';
    if (late && B && !B.unlocked.has('ninewalls')) B.unlock('ninewalls');
    // the forecast row names the calima the hour is waiting on ("CALIMA BY NOON", the bible's own example)
    if (B) B.calimaAt = (cur === 'rest-noon') ? 12 : null;
    const hour = env?.time ?? 0;
    const inWindow = hour >= CALIMA_WINDOW[0] && hour <= CALIMA_WINDOW[1];
    if ((cur === 'calima-cross' || cur === 'read-transit') && inWindow && !this._calimaAsked && env?.setWeather) {
      this._calimaAsked = { hour: +hour.toFixed(3), t: +this.tg.t.toFixed(2), was: env.weather };
      if (env.weather !== 'calima') env.setWeather('calima', CALIMA_FADE_S);
      this._malpaisEdge();
    }
    if (this._calimaAsked && !this._calimaLet && env && (hour >= CALIMA_END_H || hour < 6) && env.weather === 'calima') {
      this._calimaLet = true;
      env.setWeather('trade', 30);
    }
    // the far form: drawn only while the beat can be read (EN4), read through the Alidade (HR6), and while its card
    // stays up after the read (FAR_CARD_HOLD_S)
    const holding = this._farHoldT > 0;
    const want = ((cur === 'calima-cross' || cur === 'read-transit') && inWindow) || holding;
    const far = want || this._standIn ? this._transitFar() : null;
    if (far?.show) far.show(want);
    if (holding) {
      this._farHoldT -= dt;
      if (this._farHoldT <= 0) { this._farHoldT = 0; if (this.sys.present.farShown) this.sys.present.farCard(null); }
      return;
    }
    if (cur !== 'read-transit' || !want || !far) { this._transitT = 0; if (this.sys.present.farShown) this.sys.present.farCard(null); return; }
    const on = this._onFar(far);
    this._transitT = on ? this._transitT + dt : 0;
    const card = TEXT_W2.sighting?.cards?.find?.((c) => c.id === 'transit');
    if (on && this._transitT >= TRANSIT_HOLD_S && card) {
      this.sys.present.farCard({ line: card.line, read: card.read });
      if (!this._sighted && card.line === TRANSIT_CARD) {
        this._sighted = { hour: +hour.toFixed(3), standIn: !!far.standIn };
        this._farHoldT = FAR_CARD_HOLD_S;
        ctx.events?.emit?.('sighted', { card: card.line, kind: 'transit', hour, standIn: !!far.standIn });
      }
    } else if (!on && this.sys.present.farShown) this.sys.present.farCard(null);
  }

  /** Is the Alidade up and its line within TRANSIT_TOL_DEG of the far form's head? */
  _onFar(far) {
    const ctx = this.ctx, cam = ctx.camera;
    if (!ctx.sighting?.on || !cam?.getWorldDirection) return false;
    const p = cam.getWorldPosition(vec3()), d = cam.getWorldDirection(vec3());
    const h = far.head, tx = h.x - p.x, ty = h.y - p.y, tz = h.z - p.z, L = Math.hypot(tx, ty, tz) || 1;
    if (L > TRANSIT_RANGE_M) return false;
    const c = Math.max(-1, Math.min(1, (d.x * tx + d.y * ty + d.z * tz) / L));
    return Math.acos(c) / D2R <= TRANSIT_TOL_DEG;
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
    // the frame is the hold's tenth second, not what the lookers do after it: they are held from the step they stand
    // (at e049ea2, held 0.3 s later, they had seen her and her own camera's combat framing dissolved her to 0.06)
    this._held = [];
    for (const m of this._live(this.spawned.lookers)) { this._held.push([m, m.update]); m.update = function () {}; }
    L.running = true; L.startT = L.simT;
    // placed, not lured: a lure turns them wary on the spot, and her camera answers a wary Instrument 19 m off
    L._sendLookers(this._live(this.spawned.lookers), { lure: false });
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
    const P = this.ctx.player?.position;
    const rep = L.report();
    rep.placed = L.lookers.map((lk) => ({ kind: lk.kind, x: +lk.m.position.x.toFixed(1), z: +lk.m.position.z.toFixed(1), toHer: P ? +Math.hypot(lk.m.position.x - P.x, lk.m.position.z - P.z).toFixed(1) : null }));
    return rep;
  }

  /** The staging's undo: the quest's own arming takes the re-survey back. */
  unstageResurvey() {
    for (const [m, u] of (this._held || [])) m.update = u;
    this._held = null;
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
      calima: this._calimaAsked ?? null, edge: this._edge ?? null, sighted: this._sighted ?? null, transitStandIn: !!this._standIn,
      certs: this.certs?.report?.() ?? null, counter: this.counter?.report?.() ?? null,
      terraceDown: this.terraceDown ? this.terraceDown.log.slice(-8) : null,
    };
  }

  dispose() {
    this._standIn?.dispose();
    this.counter?.dispose();
    this.certs?.dispose();
    this._unwall?.();
    if (this.oroEntry) this.ctx.interactables?.unregister?.(this.oroEntry);
    this.resurvey?.dispose();
  }
}

export { RESURVEY };
