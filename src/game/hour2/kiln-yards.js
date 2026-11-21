import { QuestSpine } from '../quest/spine.js';
import { fill } from '../strings.js';
import { makeStrings } from '../strings.js';
import { TEXT, TEXT_W2 } from '../text.js';
import kilnYardsText from '../text/quests/kiln-yards.json';
import cardsW3 from '../text/cards/hour-two-w3.json';
import * as seam from '../../world/sites/kilnyards-layout.js';
import { POT_CAP } from '../../combat/pots.js';
import {
  KILN_YARDS_ID, KILN_YARDS_STAGES, KILN_YARDS_REWARD, STANDS_ON_YARDS, YardsEncounter, quenchAt, offered, rewardVerdict, catchUp,
} from './kiln-yards-plan.js';
import { TRUE_GROUND_ID } from '../quest/scar-plan.js';
import { KILN_ROSTER } from '../../instruments/kinds/kiln/form.js';
import { SPINDLE_ROSTER } from '../../instruments/kinds/spindle/form.js';
import { buildYardsStandins, STANDIN_COLOURS as STANDIN } from '../../world/sites/yards-standins.js';
import { YardsLive } from '../../instruments/kinds/kiln/yards.js';
import { vec3 } from '../../world/settlements/brazier.js';

/**
 * "THE KILN YARDS", LIVE (Milestone 3 wave 3, area E; the quest half of BUILD M3.3). The plan, the encounter and the quench
 * law are ./kiln-yards-plan.js; every word is src/game/text/quests/kiln-yards.json (W3). Installed by ./index.js beside the
 * first hour's quests; it publishes `ctx.quests['kiln-yards']` (the spine: report().reached is what the hour-two runner
 * reads) and `ctx.hour2.kilnYards` (this: report()).
 *
 *   offered       the spine starts (its first stage: talk to Oro) the first frame "True Ground" is done (HT3)
 *   Oro           his TALK prompt at the tube mouth while a stage of this quest waits on him; he is stood up there if no one
 *                 stands him (the first hour's own prompt is disabled once "The Scar" is past its hand-over)
 *   'yards'       Oro fills her belt with Brine (to the belt's cap, 3) when the scene ends
 *   the Yards     the encounter stands up on 'climb' (and again when a record is continued in any stage that stands on it):
 *                 two Kilns and the Spindle as GREY STAND-INS (boxes and a ring, lamps in the three tokens) running the plan's
 *                 rules. They strike nothing: the fight is area C's live kinds'. If a live Kiln stands at the Yards (area C)
 *                 no stand-in Kiln is put up and the Yards are read from the seam alone.
 *   the quench    'pot-landed' {id: 'brine', at} -> the plan's quench law -> the seam's setQuenched -> 'wellhead-quenched'
 *                 {n, id} on ctx.events (and to the spine); Brine on a head no Kiln has held: Brea's 'brine-cold' turn
 *   the tank      the plant's quench tank at the bench's west end (a stand-in drum): E fills the belt's Brine to its cap
 *   'yards-quiet' all four quenched and no Kiln awake (the plan's encounter); sent on ctx.events too
 *   tube-rest     a rest at the Brazier 'tube-shelter' (systems' Braziers: not built; the beat fails by that name)
 *   scar-flight   'kite:land' {near: 'scar-foot'} from the flight seam (area B)
 *   reward        rung 7 held at Oro's while rung 6 is not owned: the closing words and the held card ('rung-held');
 *                 'quest-rewarded' {quest, held: 'rung-7'} on ctx.events (the runner's beat event)
 * Save: the hour-two field (./index.js `part`): { quest: spine serialize(), ever: [ids a Kiln has plugged into] } and the
 * wellheads (the seam's own wellheadsSave()).
 */
const TANK_UV = Object.freeze({ u: -22.5, v: -6.5 });
const SEEN_FROM_LIVE_M = 60;

export class KilnYardsQuest {
  constructor(hub) {
    this.hub = hub;
    this.ctx = hub.ctx;
    this.sys = hub.sys;
    this.S = makeStrings({ ...TEXT, quest: kilnYardsText, extraCards: [...(TEXT_W2.tutorial?.cards || []), ...cardsW3.cards], extraSighting: TEXT_W2.sighting?.cards || [] });
    this.T = kilnYardsText;
    this.H = this._hooks();
    this.spine = new QuestSpine({ strings: this.S, hooks: this.H, id: KILN_YARDS_ID, stages: KILN_YARDS_STAGES, reward: KILN_YARDS_REWARD, triangles: {}, closingCard: 'rung-held' });
    this.ever = new Set();
    this.Y = null;
    this.view = null;
    this.entry = { oro: null, tank: null };
    this.stats = { quenches: [], brineMisses: [], reached: [], filled: 0, standUps: 0, live: false };
    this._unseam = seam.onWellheadChange(() => { for (const w of seam.wellheads()) if (w.plugged) this.ever.add(w.id); });
    this.ctx.quests = { ...(this.ctx.quests || {}), [KILN_YARDS_ID]: this.spine };
    hub.part(KILN_YARDS_ID, {
      get: () => ({ quest: this.spine.serialize(), ever: [...this.ever] }),
      set: (v) => this._restore(v),
    });
    hub.part('wellheads', seam.wellheadsSave());
    this._listen();
  }

  /* ------------------------------------------------------------ hooks */

  _hooks() {
    const ctx = this.ctx, sys = this.sys;
    const keys = { alidade: 'V', bearing: 'T', steady: 'SHIFT', interact: 'E', crouch: 'C', slot: '1', pry: 'E' };
    return {
      note: () => {
        if (!this.spine.started) return;
        if (ctx.progression) ctx.progression.tracked = KILN_YARDS_ID;
        ctx.events?.emit?.('quest-objective', { questId: KILN_YARDS_ID, label: this.spine.noteText() });
      },
      card: (id, c) => ctx.hud?.showTip?.({ id: `w3-${id}`, title: c.head || '', body: fill(c.body, { keys }), keys: [] }),
      turn: (on, c, vars) => sys?.present?.subtitle?.(c.lines.map((l) => fill(l, { ...vars, keys })), this.S.speakers.brea.name),
      scene: (id, scene) => this._scene(id, scene),
      log: (stage, line) => sys?.events?.push?.({ t: this.spine.t, quest: KILN_YARDS_ID, stage, line }),
      checkpoint: (reason) => ctx.progression?.checkpoint?.(`${KILN_YARDS_ID}:${reason}`),
      spawn: (what) => { if (what === 'yards') this._standYards(); },
      reward: (r, words) => this._reward(r, words),
      done: () => ctx.events?.emit?.('quest-complete', { questId: KILN_YARDS_ID }),
    };
  }

  _scene(id, scene) {
    const sys = this.sys;
    if (typeof sys?._playScene === 'function') return sys._playScene(id, scene, this.spine, this.S).then(() => this._sceneDone(id));
    this.spine.notify('scene-done', { scene: id, exit: true });
    this._sceneDone(id);
    return null;
  }

  /** Oro's hand-over of Brine at the end of 'yards': the belt to its cap. */
  _sceneDone(id) {
    if (id === 'yards') this._fillBrine('oro');
  }

  _fillBrine(from) {
    const K = this.ctx.combat?.pots;
    if (!K?.belt) return 0;
    K.belt.owned = true;
    const room = Math.max(0, POT_CAP - (K.belt.total ?? 0));
    const n = room > 0 ? K.belt.add('brine', room) : 0;
    if (n > 0) { this.stats.filled += n; this.ctx.events?.emit?.('item-gained', { id: 'brine-pot', count: n, total: K.belt.count.brine, name: 'BRINE POT', from }); }
    return n;
  }

  _reward(r, words) {
    const ctx = this.ctx;
    const owned = ctx.armory?.rungsOwned?.() ?? (this.sys?.rung ? [this.sys.rung] : []);
    const v = rewardVerdict(owned);
    const out = v.held ? words : (this.T.closing.rewardMade || words);
    if (!v.held) ctx.events?.emit?.('rung-granted', { rung: v.rung, quest: KILN_YARDS_ID });
    this.hub.held(v.held ? 'rung-7' : null);
    ctx.progression?.banner?.(this.T.title, out.join('  ·  '), 'quest');
    ctx.events?.emit?.('quest-rewarded', { quest: KILN_YARDS_ID, held: v.held ? r.held : null, rung: v.rung, words: out });
  }

  /* ------------------------------------------------------------ events */

  _listen() {
    const ev = this.ctx.events;
    if (!ev?.on) return;
    const on = (n, fn) => ev.on(n, (e) => { try { fn(e || {}); } catch (err) { this.errors = (this.errors ?? 0) + 1; this.lastError = String(err?.message || err); } });
    on('region-enter', (e) => this.spine.notify('region-enter', e));
    on('brazier-rest', (e) => this.spine.notify('rested', { brazier: e.id, hour: e.hour }));
    on('rested', (e) => { if (e.brazier) this.spine.notify('rested', e); });
    on('kite:land', (e) => this.spine.notify('kite:land', e));
    on('pot-landed', (e) => { if (e.id === 'brine' && e.at) this._brine(e.at); });
  }

  /** A Brine field landed: the quench law (the plan's), and what it tells the quest. */
  _brine(at) {
    const r = this.Y ? this.Y.brine(at) : (() => { const q = quenchAt(at, seam.wellheads(), this.ever); if (q.id) seam.setQuenched(q.id); return q; })();
    if (!r.id) {
      if (Number.isFinite(r.d)) { this.stats.brineMisses.push({ why: r.why, d: +r.d.toFixed(2), t: +this.spine.t.toFixed(1) }); if (/no Kiln/.test(r.why)) this._turn('brine-cold'); }
      return;
    }
    const n = seam.quenchedCount();
    this.stats.quenches.push({ id: r.id, n, d: +r.d.toFixed(2), t: +this.spine.t.toFixed(1), seen: !!this.Y?.seen });
    // a pot that quenched the head before 'plugged' closed reached it too (unseen, if nothing saw her)
    if (this.spine.current()?.id === 'plugged' && !this.Y?.seen) this.spine.notify('wellhead-reached', { id: r.id, plugged: true, unseen: true, by: 'brine' });
    this.ctx.events?.emit?.('wellhead-quenched', { id: r.id, n, by: 'brine' });
    this.spine.notify('wellhead-quenched', { n, id: r.id });
  }

  /** The wellheads seam's four records ({ id, x, z, state, plugged }): what the hour-two runner's 'site:wellheads' reads. */
  wellheads() { return seam.wellheads(); }

  _turn(on) { const c = this.S.turn(on); if (c && !this.spine.seen.turns.has(on)) { this.spine.seen.turns.add(on); this.H.turn(on, c, {}); } }

  /* ------------------------------------------------------------ the Yards */

  _liveKilns() {
    const B = seam.YARDS_WALK.box;
    // (the encounter's own Kilns drawn as live kinds, ./../../instruments/kinds/kiln/yards.js, are not other Kilns)
    return (this.ctx.machines?.list || []).filter((m) => m && m.kind === 'kiln' && !m.yardsBound && m.alive !== false && !m._disposed && m.position
      && m.position.x >= B.x0 - 30 && m.position.x <= B.x1 + 30 && m.position.z >= B.z0 - 30 && m.position.z <= B.z1 + 30);
  }

  _standYards() {
    if (this.Y) return;
    this.stats.standUps++;
    this.Y = new YardsEncounter(seam, { ever: this.ever });
    if (this._liveKilns().length) { this.stats.live = true; this.Y.kilns = []; this.Y.spindle = null; this.Y.quiet = false; }
    else this.Y.standUp();
    this._buildView();
    this._tankEntry();
    // M3 wave 3c (area C, the smallest change here): the encounter drawn by the live kinds (two Kilns, the Spindle, the
    // Davit from the third wellhead); the grey stand-ins stand only until they are loaded
    if (!this.stats.live && this.ctx.machines && this.ctx.scene) this.live = new YardsLive(this.ctx, this.Y, { seam });
  }

  _dropYards() {
    this.Y = null;
    if (this.view) { this.view.dispose(); this.view = null; }
    if (this.live) { this.live.dispose(); this.live = null; }
    this._standinsHidden = false;
  }

  /** The live kinds (area C) take over from the stand-ins once they stand: the stand-ins' Kilns and Spindle are hidden. */
  _syncLive(dt) {
    const L = this.live;
    if (!L) return;
    L.sync(dt);
    const V = this.view;
    if (L.ready && V && !this._standinsHidden) {
      for (const v of V.kilns || []) v.root.visible = false;
      if (V.spindle) V.spindle.root.visible = false;
      this._standinsHidden = true;
    }
  }

  /** The grey stand-ins (src/world/sites/yards-standins.js: src/game builds no meshes itself). */
  _buildView() {
    if (!this.ctx.scene || this.view) return;
    const tp = seam.apronPoint(TANK_UV.u, TANK_UV.v), tx = tp.e, tz = -tp.n;
    this.view = buildYardsStandins(this.ctx.scene, {
      kilns: this.Y?.kilns?.length ?? 0, spindle: !!this.Y?.spindle,
      tank: { x: tx, y: this.ctx.terrain?.getHeight?.(tx, tz) ?? seam.APRON.h, z: tz },
      kiln: { L: KILN_ROSTER.L, W: KILN_ROSTER.W, H: KILN_ROSTER.H }, spindleH: SPINDLE_ROSTER.H,
    });
  }

  _syncView(dt) {
    const V = this.view, Y = this.Y;
    if (!V || !Y) return;
    const h = (x, z) => this.ctx.terrain?.getHeight?.(x, z) ?? seam.APRON.h;
    Y.kilns.forEach((k, i) => {
      const v = V.kilns[i]; if (!v) return;
      const B = k.brain;
      v.root.position.set(B.x, h(B.x, B.z), B.z);
      v.root.rotation.y = B.heading;
      const awake = k.role === 'awake' || k.role === 'going';
      V.lampHex(v.lamp, k.role === 'cold' ? STANDIN.dark : awake ? (Y.seen && Y.seenBy === B.id ? STANDIN.hostile : STANDIN.wary) : STANDIN.calm);
    });
    if (V.spindle && Y.spindle) {
      V.spindle.root.position.set(Y.spindle.x, h(Y.spindle.x, Y.spindle.z), Y.spindle.z);
      V.spindle.root.rotation.y = Y.spindle.heading ?? 0;
      if (!Y.quiet) V.spindle.ring.rotation.z += dt * 2 * Math.PI * 1.2;
      V.lampHex(V.spindle.lamp, Y.quiet ? STANDIN.calm : Y.seenBy === 'spindle' ? STANDIN.hostile : STANDIN.wary);
    }
  }

  _tankEntry() {
    const I = this.ctx.interactables;
    if (!I?.register || this.entry.tank) return;
    const tp = seam.apronPoint(TANK_UV.u, TANK_UV.v), x = tp.e, z = -tp.n;
    const y = this.ctx.terrain?.getHeight?.(x, z) ?? seam.APRON.h;
    this.entry.tank = I.register({ position: vec3(x, y, z), radius: 3.0, hold: 0.3, label: this.T.prompts.tank, once: false,
      onInteract: () => { const n = this._fillBrine('tank'); if (n > 0) this._turn('tank'); } });
  }

  /* ------------------------------------------------------------ Oro */

  _oroWanted() {
    const s = this.spine.current();
    return !!(s && s.type === 'talk' && s.npc === 'oro');
  }

  _standOro() {
    const ctx = this.ctx, A = this.sys?.A?.oro;
    if (!A) return;
    if (!this._oroAsked && !ctx.people?.list?.find?.((p) => p.archetype === 'oro') && ctx.people?.spawn) {
      this._oroAsked = true;
      ctx.people.spawn('oro', { x: A.x, z: A.z, yaw: 0, seed: 9 }).catch(() => { /* the prompt still stands */ });
    }
    const I = ctx.interactables;
    if (I?.register && !this.entry.oro) {
      const y = ctx.terrain?.getHeight?.(A.x, A.z) ?? 0;
      const label = fill(this.S.systems?.prompts?.talk ?? 'TALK · {name}', { name: this.S.speakers.oro.name });
      this.entry.oro = I.register({ position: vec3(A.x, y, A.z), radius: 3.0, hold: 0.3, label, once: false, onInteract: () => this.talk('oro') });
    }
  }

  /** The player spoke to Oro: this quest's scene, when one of its stages waits on him. */
  talk(npc) {
    if (this.sys?.present?.busy) return null;
    if (npc !== 'oro' || !this._oroWanted()) return null;
    return this.spine.talk('oro');
  }

  /* ------------------------------------------------------------ save */

  _restore(v) {
    this._dropYards();
    this.ever = new Set(Array.isArray(v?.ever) ? v.ever : []);
    if (v?.quest?.v === 1) this.spine.restore(v.quest);
    else this.spine.reset();
    this._restored = true;
  }

  newGame() { this._dropYards(); this.spine.reset(); this.ever = new Set(); seam.resetWellheads(); }

  /* ------------------------------------------------------------ the frame */

  update(dt) {
    const ctx = this.ctx;
    if (ctx.state !== 'playing') return;
    // offered the first frame "True Ground" is done (HT3)
    if (!this.spine.started && offered(ctx.quests?.[TRUE_GROUND_ID])) this.spine.start();
    if (this._restored) {
      this._restored = false;
      const cur = this.spine.current()?.id;
      if (cur && STANDS_ON_YARDS.includes(cur)) this._standYards();
    }
    if (this._oroWanted()) this._standOro();
    if (this.entry.oro) this.entry.oro.disabled = !this._oroWanted();
    const Y = this.Y;
    if (Y) {
      const p = ctx.player?.position;
      let seenBy = null;
      if (this.stats.live && p) {
        // area C's live kinds: seen when one of them is alert or attacking within 60 m
        const m = (ctx.machines?.list || []).find((q) => q && (q.kind === 'kiln' || q.kind === 'spindle') && q.alive !== false && (q.state === 'alert' || q.state === 'attack')
          && Math.hypot(q.position.x - p.x, q.position.z - p.z) < SEEN_FROM_LIVE_M);
        seenBy = m ? m.kind : null;
      }
      const evs = Y.step(dt, p ? { x: p.x, z: p.z } : null);
      if (seenBy) { Y.seen = true; Y.seenBy = seenBy; }
      for (const e of evs) {
        if (e.type === 'wellhead-reached') { if (seenBy) e.unseen = false; this.stats.reached.push({ id: e.id, unseen: e.unseen, d: e.d, t: +this.spine.t.toFixed(1) }); this.spine.notify('wellhead-reached', e); ctx.events?.emit?.('wellhead-reached', e); }
        else if (e.type === 'spindle-met') this._turn('spindle');
        else if (e.type === 'yards-quiet') { this.spine.notify('yards-quiet', e); ctx.events?.emit?.('yards-quiet', e); }
        else ctx.events?.emit?.(`yards:${e.type}`, e);
      }
      this._syncView(dt);
      this._syncLive(dt);
    }
    const c = catchUp(this.spine.current()?.id, seam, Y);
    if (c) this.spine.notify(...c);
    if (this.spine.started && !this.spine.done) this.spine.update(dt, this.sys?.world);
  }

  report() {
    return { quest: this.spine.report(), yards: this.Y?.report?.() ?? null, live: this.live?.report?.() ?? null, ever: [...this.ever], quenched: seam.quenchedCount(), stats: { ...this.stats, quenches: this.stats.quenches.slice(-8), brineMisses: this.stats.brineMisses.slice(-8), reached: this.stats.reached.slice(-8) } };
  }

  dispose() {
    this._dropYards();
    this._unseam?.();
    for (const e of Object.values(this.entry)) if (e) this.ctx.interactables?.unregister?.(e);
  }
}
