import { QuestSpine } from '../quest/spine.js';
import { fill, makeStrings } from '../strings.js';
import { TEXT, TEXT_W2 } from '../text.js';
import glassLineText from '../text/quests/glass-line.json';
import cardsW3 from '../text/cards/hour-two-w3.json';
import { TEST_FLIGHT } from '../kite/roads.js';
import { TRUE_GROUND_ID } from '../quest/scar-plan.js';
import {
  GLASS_LINE_ID, GLASS_LINE_STAGES, GLASS_LINE_REWARD, CARRIED_FROM, CANE_N, CORD_N, anchorsOf, offered, flightFlagged, landingEvent,
} from './glass-line-plan.js';

/**
 * "A LINE OVER THE GLASS", LIVE (Milestone 3 wave 3, area B; BUILD M3.1, HT2). The plan and its rules are
 * ./glass-line-plan.js; every word is src/game/text/quests/glass-line.json (W3). It publishes `ctx.quests['glass-line']`
 * (the spine: report().reached is what the hour-two runner reads, by leg 4's beat ids) and `ctx.hour2.glassLine` (this),
 * and keeps its part of the hour-two save field (`ctx.hour2.part('glass-line', ...)`, ./index.js).
 *
 * Installed by the kite (src/hero/kiteFlight.js `installGlassLine`, the first frame the hour-two hub stands): the hub
 * (./index.js, area E's) says the kite quest registers its own part.
 *
 *   offered       the spine starts the first frame "True Ground" is done (hour two begins)
 *   the weather   row 0's default: the noon calima's ask clears at the first rest at a Brazier while the quest runs
 *   Ansel         TALK at Ansel plays 'kite' and, after the landing, 'kite-back' (the runtime's own prompt; this wraps the
 *                 runtime's talk for Ansel while one of the two scenes waits)
 *   the wreck     a prompt at the black beach's wreck (the beach's site point: PLACES.wreck): hold E to cut the sailcloth,
 *                 then the cane and cord (4 canes and 2 cords a hold: two holds)
 *   the rebuild   a prompt at the guild-house stud: the kite rebuilt; from here she carries it (the kite's pilot is given it)
 *   the tether    the moored Sonde's tether at the Sounding Ring: a live Sonde's own cutTether() when area C's kind stands
 *                 there, else a prompt at the Ring's post (a stand-in, said so in report())
 *   the flight    'kite:open' and 'kite:land' from the kite (src/hero/kiteFlight.js); an open while the Sonde is moored is
 *                 Flagged (HT2); a landing counts on the marked field at the law's safe speed (R3)
 *   reward        the Survey Kite and nothing else: 'quest-rewarded' { quest, item: 'survey-kite' }
 * The prompts' words are the stages' own notes (W3); the wreck, the post and the field have no meshes here (world's).
 */
const PROMPT_R = Object.freeze({ wreck: 6, 'guild-stud': 4, sonde: 6 });

export class GlassLineQuest {
  constructor(hub) {
    this.hub = hub;
    this.ctx = hub.ctx;
    this.sys = hub.sys;
    this.S = makeStrings({ ...TEXT, quest: glassLineText, extraCards: [...(TEXT_W2.tutorial?.cards || []), ...cardsW3.cards], extraSighting: TEXT_W2.sighting?.cards || [] });
    this.T = glassLineText;
    this.A = anchorsOf(TEST_FLIGHT.field);
    this.spine = new QuestSpine({ strings: this.S, hooks: this._hooks(), id: GLASS_LINE_ID, stages: GLASS_LINE_STAGES, reward: GLASS_LINE_REWARD, triangles: {}, closingCard: null });
    this.stats = { flagged: 0, opens: [], lands: [], tether: null, gathered: { sailcloth: 0, cane: 0, cord: 0 }, weatherCleared: null };
    this.entry = {};
    this.ctx.quests = { ...(this.ctx.quests || {}), [GLASS_LINE_ID]: this.spine };
    hub.glassLine = this;
    this._unpart = hub.part?.(GLASS_LINE_ID, { get: () => ({ quest: this.spine.serialize(), stats: { flagged: this.stats.flagged } }), set: (v) => this._restore(v) });
    this._listen();
    this._wrapTalk();
  }

  /* ------------------------------------------------------------ hooks */

  _hooks() {
    const ctx = this.ctx;
    const keys = { interact: 'E', crouch: 'C', slot: '1' };
    return {
      note: () => {
        if (!this.spine?.started) return;
        if (ctx.progression) ctx.progression.tracked = GLASS_LINE_ID;
        ctx.events?.emit?.('quest-objective', { questId: GLASS_LINE_ID, label: this.spine.noteText() });
      },
      card: (id, c) => ctx.hud?.showTip?.({ id: `w3-${id}`, title: c.head || '', body: fill(c.body, { keys }), keys: [] }),
      turn: (on, c, vars) => this.sys?.present?.subtitle?.(c.lines.map((l) => fill(l, { ...vars, keys })), this.S.speakers.brea.name),
      scene: (id, scene) => this._scene(id, scene),
      log: (stage, line) => this.sys?.events?.push?.({ t: this.spine.t, quest: GLASS_LINE_ID, stage, line }),
      checkpoint: (reason) => ctx.progression?.checkpoint?.(`${GLASS_LINE_ID}:${reason}`),
      reward: (r, words) => this._reward(r, words),
      done: () => ctx.events?.emit?.('quest-complete', { questId: GLASS_LINE_ID }),
    };
  }

  _scene(id, scene) {
    const sys = this.sys;
    if (typeof sys?._playScene === 'function') return sys._playScene(id, scene, this.spine, this.S);
    this.spine.notify('scene-done', { scene: id, exit: true });
    return null;
  }

  _reward(r, words) {
    const ctx = this.ctx;
    ctx.player?.kitePilot?.give?.();
    ctx.progression?.banner?.(this.T.title, (words || []).join('  ·  '), 'quest');
    ctx.events?.emit?.('quest-rewarded', { quest: GLASS_LINE_ID, item: r.item, words });
  }

  /** TALK at Ansel: this quest's scene while one waits on her, else the runtime's own answer. */
  _wrapTalk() {
    const sys = this.sys;
    if (!sys || typeof sys.talk !== 'function' || sys.__glassLineTalk) return;
    sys.__glassLineTalk = true;
    const talk = sys.talk.bind(sys);
    sys.talk = (npc) => {
      const s = this.spine.current();
      if (npc === 'ansel' && this.spine.started && !this.spine.done && s?.type === 'talk' && s.npc === 'ansel' && !sys.present?.busy) { this.spine.talk('ansel'); return; }
      return talk(npc);
    };
  }

  /* ------------------------------------------------------------ the prompts */

  _entries() {
    const I = this.ctx.interactables;
    if (!I?.register || this.entry.wreck) return;
    const T = this.ctx.terrain;
    const at = (p) => ({ x: p.x, y: T?.getHeight?.(p.x, p.z) ?? 0, z: p.z });
    const pos = (p) => { const q = at(p); return this.ctx.camera?.position?.constructor ? new this.ctx.camera.position.constructor(q.x, q.y, q.z) : q; };
    const note = (id) => this.S.stage(id)?.note?.replace(/\s*\{n\}.*$/, '').toUpperCase() ?? id;
    this.entry.wreck = I.register({ position: pos(this.A.wreck), radius: PROMPT_R.wreck, hold: 0.5, label: note('wreck'), once: false, disabled: true, onInteract: () => this._atWreck() });
    this.entry.rebuild = I.register({ position: pos(this.A['guild-stud']), radius: PROMPT_R['guild-stud'], hold: 0.6, label: note('rebuild'), once: false, disabled: true, onInteract: () => this._rebuild() });
    this.entry.tether = I.register({ position: pos(this.A.sonde), radius: PROMPT_R.sonde, hold: 0.5, label: note('tether'), once: false, disabled: true, onInteract: () => this._cutTether() });
  }

  _atWreck() {
    const id = this.spine.current()?.id, ev = this.ctx.events;
    if (id === 'wreck') {
      this.stats.gathered.sailcloth++;
      ev?.emit?.('gathered', { source: 'wreck', item: 'sailcloth', n: 1 });
      this.spine.notify('gathered', { source: 'wreck', item: 'sailcloth', n: 1 });
    } else if (id === 'cane-cord') {
      const cane = CANE_N / 2, cord = CORD_N / 2;
      this.stats.gathered.cane += cane; this.stats.gathered.cord += cord;
      ev?.emit?.('gathered', { source: 'cane-cord', cane, cord, n: cane + cord });
      this.spine.notify('gathered', { source: 'cane-cord', n: cane + cord });
    }
  }

  _rebuild() {
    if (this.spine.current()?.id !== 'rebuild') return;
    this.ctx.player?.kitePilot?.give?.();
    this.ctx.events?.emit?.('kite-rebuilt', { at: 'guild-stud' });
    this.spine.notify('kite-rebuilt', {});
  }

  /** The live Sonde at the Ring (area C), if its kind stands there with a tether. */
  _liveSonde() {
    const R = this.A.sonde;
    for (const m of this.ctx.machines?.list || []) {
      if (!m || m.kind !== 'sonde' || m.alive === false || !m.position) continue;
      if (Math.hypot(m.position.x - R.x, m.position.z - R.z) > 60) continue;
      const rules = m.rules || m.brain || m;
      if (typeof rules.cutTether === 'function') return { m, rules };
    }
    return null;
  }

  _cutTether() {
    if (this.spine.current()?.id !== 'tether') return;
    const live = this._liveSonde();
    const ok = live ? live.rules.cutTether() !== false : true;
    if (!ok) return;
    this.stats.tether = { live: !!live, standIn: !live, t: +this.spine.t.toFixed(1) };
    this.ctx.events?.emit?.('sonde-cut', { sonde: 'ring', standIn: !live });
    this.spine.notify('sonde-cut', { sonde: 'ring' });
  }

  /* ------------------------------------------------------------ events */

  _listen() {
    const ev = this.ctx.events;
    if (!ev?.on) return;
    ev.on('kite:open', (e) => {
      if (!this.spine.started || this.spine.done) return;
      const flagged = flightFlagged(this.spine, this._liveSonde() ? (this._liveSonde().rules.tethered ?? null) : null);
      this.stats.opens.push({ from: e?.from ?? null, flagged, t: +this.spine.t.toFixed(1) });
      if (flagged) { this.stats.flagged++; this.spine.notify('flagged'); ev.emit?.('kite-flagged', { by: 'sonde', at: 'ring' }); }
      this.spine.notify('kite:open', e || {});
    });
    ev.on('kite:land', (e) => {
      if (!this.spine.started || this.spine.done) return;
      const L = landingEvent(e || {});
      this.stats.lands.push({ field: L.field, safe: L.safe, vs: L.vs, t: +this.spine.t.toFixed(1) });
      this.spine.notify('kite:land', L);
    });
    // row 0's default: the noon calima's ask clears at her first rest while the quest runs
    ev.on('brazier-rest', (e) => {
      const env = this.ctx.environment;
      if (!this.spine.started || this.spine.done || !env || env.weather !== 'calima' || this.stats.weatherCleared) return;
      this.stats.weatherCleared = { at: e?.id ?? null, hour: +(env.time ?? 0).toFixed(2) };
      env.setWeather('trade', 30);
    });
  }

  _restore(v) {
    if (!v?.quest) { this.spine.reset(); return; }
    this.spine.restore(v.quest);
    this.stats.flagged = v.stats?.flagged ?? 0;
  }

  /* ------------------------------------------------------------ the frame */

  update(dt) {
    const ctx = this.ctx;
    if (ctx.state !== 'playing') return;
    if (!this.spine.started && !this.spine.done && offered(ctx.quests?.[TRUE_GROUND_ID])) this.spine.start();
    if (!this.spine.started) return;
    this._entries();
    const p = ctx.player?.position;
    const near = (anchor, r) => { const a = this.A[anchor]; return !!(a && p && Math.hypot(p.x - a.x, p.z - a.z) <= r); };
    this.spine.update(dt, { near, aim: () => false, bearing: () => 0 });
    const cur = this.spine.current()?.id ?? null;
    if (this.entry.wreck) this.entry.wreck.disabled = !(cur === 'wreck' || cur === 'cane-cord');
    if (this.entry.rebuild) this.entry.rebuild.disabled = cur !== 'rebuild';
    if (this.entry.tether) this.entry.tether.disabled = cur !== 'tether';
    // she carries the kite from the rebuild on (a record continued past it gives it back)
    const iC = GLASS_LINE_STAGES.findIndex((s) => s.id === CARRIED_FROM);
    if (this.spine.done || (this.spine.st[CARRIED_FROM]?.state === 'done') || (cur && GLASS_LINE_STAGES.findIndex((s) => s.id === cur) > iC)) ctx.player?.kitePilot?.give?.();
  }

  report() {
    const r = this.spine.report();
    return { stage: this.spine.current()?.id ?? null, reached: r.reached, done: this.spine.done, stats: this.stats, sondeLive: !!this._liveSonde() };
  }
}

/** Install beside the hour-two hub (once): the quest and its update as a system of the game. */
export function installGlassLine(ctx) {
  const hub = ctx.hour2;
  if (!hub || hub.glassLine) return hub?.glassLine ?? null;
  const q = new GlassLineQuest(hub);
  ctx.game?.systems?.push?.(q);
  return q;
}
