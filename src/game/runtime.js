import { STRINGS } from './text.js';
import { fill } from './strings.js';
import { QuestSpine } from './quest/spine.js';
import { QUEST_ID } from './quest/plan.js';
import { Presenter } from './present.js';
import { Braziers } from './brazier/braziers.js';
import { installReeds } from './reeds/index.js';
import { SiteClock } from './sites/clock.js';
import { SiteRefill, HourMeter } from './sites/refill.js';
import { saveFieldsOf } from './save/fields.js';
import { FirstHour } from './hour.js';
import { REST, TRIG, TRIG_TOP, siteById } from '../world/island/sites.js';
import { DITCH } from '../world/island/reedmask.js';
import { SLOT } from '../core/save.js';
import { vec3 } from '../world/settlements/brazier.js';
import { streetPoint } from '../world/settlements/saltrow-layout.js';

/** Which armour each rung puts on her (armory's variant ids, src/hero/variants.js; BIBLE §8.4). */
export const RUNG_ARMOR = Object.freeze({ starter: 'pan-1', scout: 'pan-2' });

/**
 * THE SYSTEMS RUNTIME (BUILD M1.6a, M1.6c, M1.6f): the live half of the quest spine, the Braziers and save v6.
 * `installGame(ctx)` runs after `installProgression`; it publishes
 *   ctx.spine          the QuestSpine (src/game/quest/spine.js)
 *   ctx.braziers       the Braziers (src/game/brazier/braziers.js)
 *   ctx.reeds          reed cover, its gust clocks and the stealth rule (src/game/reeds, M1.6e; installed first)
 *   ctx.siteClock      the site clock (src/game/sites/clock.js, M1.6n): hours played plus slept, the cleared sites
 *   ctx.siteRefill     its live half (src/game/sites/refill.js): every MachineSite returns on the clock, not on a timer
 *   ctx.systemsGame    this runtime: anchors, rung, report(), newGame(), restoreQuest()
 *   ctx.regions        Milestone 2: the regions seam's live half ({ map, tracker, loader }, engine.attachRegions)
 *   ctx.saveFields     Milestone 2: the save seam (src/game/save/fields.js), each area's { get, set } pair
 * and adds itself as a system (update at the sim rate; the presenter's subtitles at real time).
 *
 * STUBS FOR WHAT LATER ITEMS OWN, named so they are easy to retire:
 *   - Ansel and Mise stand at their quest anchors as `guild-matron` and `lantern-keeper` people when the people
 *     system can spawn them (settlements places them properly, M1.5).
 *   - The Peg swarm (0:10) and the dyke Plumb (0:21) are spawned when their kinds are registered (instruments).
 *   - Salt is raked and cane cut at interactables here (the Making ledger and quick-make are M1.6d's; the
 *     legacy hold-R ammo craft makes the Reed arrows until then).
 *   - The survey's bearing is the Alidade held on the pillar (take-a-bearing is M1.6j's).
 *   - The triangle and the rung are published as events (`triangle-closed`, `rung-granted`) for the map (M1.6b)
 *     and the armory (M1.6l) to take up.
 *   - The lower-third, subtitles and the Brazier dialog are ./present.js until the glass shell (M1.6g2).
 */
const _dir = vec3();
const _to = vec3();
const _cam = vec3();

const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k });
/** M1b pacing: the three Peg swarms' centres along the transect (pans 0 -> beach 1) and each stretch's half length. */
const SWARMS = Object.freeze([0.2, 0.5, 0.8]);
const SWARM_HALF = 0.05;
/** M1b: the share of its health the ditch's Plumb keeps until its bob is pried (see `_keepForPry`). */
const PRY_FLOOR = 0.12;

export class SystemsGame {
  constructor(ctx) {
    this.ctx = ctx;
    this.S = STRINGS;
    this.rung = 'starter';
    this.present = new Presenter(ctx);
    this.people = {};
    this.spawned = { transect: [], plumb: [] };
    this.events = [];
    this._anchors();
    ctx.systemsGame = this;
    this.spine = new QuestSpine({ strings: this.S, hooks: this._hooks() });
    ctx.spine = this.spine;
    this.braziers = new Braziers(ctx, { strings: this.S, present: this.present, save: (reason) => this._writeNamed(reason) });
    ctx.braziers = this.braziers;
    this._siteClock();
    this._entries();
    this._listen();
    this._hookProgression();
    // Milestone 2: "The Scar" and "True Ground", chained after this quest's reward (./hour.js)
    this.hour = new FirstHour(this);
  }

  /* ----------------------------------------------------------- places */

  _anchors() {
    const ctx = this.ctx;
    const pans = siteById('salt-pans'), saltrow = siteById('saltrow'), beach = siteById('black-sand-beach');
    const t1 = TRIG.find((t) => t.id === 'T1');
    const g = ctx.props?.gauge;
    const gauge = g ? { x: g.x, z: g.z } : lerp(pans, saltrow, -0.4);
    const station = lerp(saltrow, pans, 0.55);
    // the transect: pans to the black beach (bearing 132); the crossing is 25 m past its middle, seaward
    const mid = lerp(pans, beach, 0.5);
    const dx = beach.x - pans.x, dz = beach.z - pans.z, L = Math.hypot(dx, dz) || 1;
    const nx = dz / L, nz = -dx / L;   // the side away from Saltrow
    const side = Math.sign((saltrow.x - mid.x) * nx + (saltrow.z - mid.z) * nz) || 1;
    // the line runs along the coast: the far side is the beach, so take the widest offset that is still dry ground
    let crossed = null;
    for (const d of [25, 18, 12, 8, 5]) {
      const c = { x: mid.x - nx * side * d, z: mid.z - nz * side * d };
      if ((ctx.terrain?.getHeight?.(c.x, c.z) ?? 1) > 0.4) { crossed = c; break; }
    }
    crossed = crossed || { x: mid.x - nx * side * 5, z: mid.z - nz * side * 5 };
    this.A = {
      rest: { x: REST.x, z: REST.z },
      pans: { x: pans.x, z: pans.z },
      ansel: { x: pans.x + 2.2, z: pans.z + 1.4 },
      gauge,
      cane: lerp(pans, gauge, 0.5),
      mise: this._shoreNear(saltrow) ?? { x: saltrow.x - 6, z: saltrow.z + 4 },
      transect: mid,
      transectA: { x: pans.x, z: pans.z }, transectB: { x: beach.x, z: beach.z },
      crossed,
      t1: { x: t1.x, z: t1.z },
      station,
      // M1b round 2: the lee ditch is the rush on the outer dyke's lee side (reedmask.js DITCH, the dyke the station
      // stands on): the stage's anchor is in it, 22 m along the dyke from the station toward its north-east end (the
      // side she comes down from T1; the rush starts at 14 m), and `ditchHead` is where she drops into it, 8 m from
      // that end. Round 1 stood the anchor on open salt cells 17.6 m from the station (0 of 1963 stalk frames in cover)
      ditch: DITCH ? this._ditchPoint(22) : lerp(station, t1, 0.12),
      ditchHead: DITCH ? this._ditchPoint(null, 8) : lerp(station, t1, 0.4),
      // the quest's end: Ansel waits in the guild house's little square, 4.5 m down the street from its step (the
      // datum stud, the travel node, is left clear). It stood at Saltrow's centre + (3, -2), 1.9 m inside house r3 since
      // the town was built round it, and at 9f8bc85 the slice run's walk to her stopped 5.7 m short, against its wall
      'ansel-home': streetPoint(41.5, 1.4),
    };
    // aim targets: the Gauge's drum and the pillar tops
    const H = (p) => ctx.terrain?.getHeight?.(p.x, p.z) ?? 0;
    this.targets = {
      gauge: { x: gauge.x, y: (g?.y ?? H(gauge)) + 5.3, z: gauge.z, tol: 7, range: 160 },
    };
    for (const t of TRIG) this.targets[t.id] = { x: t.x, y: H(t) + TRIG_TOP, z: t.z, tol: 2.5, range: 2000 };
  }

  /**
   * A point on the lee ditch's rush line (3.2 m off the dyke's centre on its lee side): `fromStation` m along the dyke
   * from the station's own foot toward the dyke's north-east end, or `fromEnd` m back from that end.
   */
  _ditchPoint(fromStation, fromEnd = 0) {
    const D = DITCH, ex = (D.bx - D.ax) / D.len, ez = (D.bz - D.az) / D.len;
    const s0 = (D.station.x - D.ax) * ex + (D.station.z - D.az) * ez;
    const s = fromStation != null ? Math.min(D.len - 2, s0 + fromStation) : D.len - fromEnd;
    return { x: +(D.ax + ex * s + D.nx * 3.2).toFixed(2), z: +(D.az + ez * s + D.nz * 3.2).toFixed(2) };
  }

  /**
   * Mise keeps the breakwater lamp (BIBLE 8.6): her anchor is the sea's edge nearest Saltrow, the last dry metre
   * before the water (round 1 stood her in a meadow 7 m from the street while her note said "on the breakwater").
   * No breakwater is built yet (settlements); this is where it will meet the sea. 24 bearings, 2 m steps, 160 m.
   */
  _shoreNear(c) {
    const H = (x, z) => this.ctx.terrain?.getHeight?.(x, z);
    if (H(c.x, c.z) == null) return null;
    let best = null;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
      for (let d = 8; d <= 160; d += 2) {
        const x = c.x + dx * d, z = c.z + dz * d;
        const h = H(x, z);
        if (h < 0) break;                                   // the sea: this bearing's shore was the last dry step
        // (people M1.5d fix round 2, the smallest change: at 3 m from the sea the spot stood in 0.11 m of water, 20fe91e film;
        // the most landward step within 6 m of the sea that stands dry)
        if (h > 1.2 || H(x + dx * 6, z + dz * 6) >= 0 || (this.ctx.water?.depthAt?.(x, z) ?? 0) > 0.02) continue;
        if (!best || d < best.d) best = { x: +x.toFixed(2), z: +z.toFixed(2), d };
        break;
      }
    }
    return best ? { x: best.x, z: best.z } : null;
  }

  placeName() {
    const p = this.ctx.player?.position;
    if (!p) return '';
    const lr = this.braziers?.lastRest;
    return lr ? (this.S.systems.brazier.names[lr.id] ?? '') : '';
  }

  /* ------------------------------------------------------- site clock */

  /** M1.6n: the site clock (BIBLE §17 "Sites refill on a clock"), wired to the live world. */
  _siteClock() {
    const ctx = this.ctx;
    this.siteClock = new SiteClock();
    this.hours = new HourMeter(this.siteClock);
    const v = vec3();
    this.siteRefill = new SiteRefill({
      machines: () => ctx.machines ?? null,
      player: () => { const p = ctx.player?.position; return p ? { x: p.x, z: p.z } : null; },
      camera: () => {
        const c = ctx.camera;
        if (!c?.getWorldDirection) return null;
        c.getWorldDirection(v);
        return { x: c.position.x, y: c.position.y, z: c.position.z, dx: v.x, dy: v.y, dz: v.z, fov: c.fov, aspect: c.aspect, far: c.far };
      },
      groundAt: (x, z) => ctx.terrain?.getHeight?.(x, z) ?? 0,
      // (Milestone 2) the regions made true by a re-survey stand in for world-ground's datum service until it exists
      datum: () => ctx.datum ?? this.hour?.trueGround?.datum?.() ?? null,
      questStages: () => (this.spine?.activeStages?.() ?? []).map((st) => ({ quest: QUEST_ID, id: st.id, type: st.type, kind: st.kind ?? null })),
      emit: (n, e) => ctx.events?.emit?.(n, e),
    }, this.siteClock);
    ctx.siteClock = this.siteClock;
    ctx.siteRefill = this.siteRefill;
  }

  /* ------------------------------------------------------------ hooks */

  _hooks() {
    const ctx = this.ctx;
    const keys = { alidade: 'V', bearing: 'T', steady: 'SHIFT', interact: 'E', crouch: 'C', slot: '1', pry: 'E' };
    return {
      note: () => {
        const prog = ctx.progression;
        if (prog) prog.tracked = QUEST_ID;
        ctx.events?.emit?.('quest-objective', { questId: QUEST_ID, label: this.spine?.noteText?.() ?? '' });
      },
      card: (id, c) => ctx.hud?.showTip?.({ id: `rm-${id}`, title: c.head || '', body: fill(c.body, { keys }), keys: [] }),
      turn: (on, c, vars) => this.present.subtitle(c.lines.map((l) => fill(l, { ...vars, keys })), this.S.speakers.brea.name),
      scene: (id, scene) => this._playScene(id, scene),
      log: (stage, line) => this.events.push({ t: this.spine?.t ?? 0, stage, line }),
      checkpoint: (reason) => ctx.progression?.checkpoint?.(reason),
      spawn: (what) => this._spawn(what),
      reward: (r, words) => this._reward(r, words),
      triangle: (id, pillars) => ctx.events?.emit?.('triangle-closed', { id, pillars }),
      sighting: (id) => { this.sightingCard = id; },
      done: () => {
        ctx.events?.emit?.('quest-complete', { questId: QUEST_ID });
        // Milestone 2: the reward opens "The Scar" (./hour.js)
        this.hour?.startScar();
      },
    };
  }

  /** Scenes queue: one lower-third at a time (a stage's end scene and the next stage's start scene can coincide). */
  _playScene(id, scene, spine = this.spine, S = this.S) {
    this._sceneChain = (this._sceneChain || Promise.resolve()).then(async () => {
      this.sceneOpen = id;
      const res = await this.present.scene(scene, S.speakers, { next: this.S.systems.dialogue.next });
      this.sceneOpen = null;
      spine.notify('scene-done', { scene: id, exit: res?.exit !== false });
      if (spine !== this.spine) this.hour?.sceneDone(id, spine);
    }).catch(() => { this.sceneOpen = null; });
    return this._sceneChain;
  }

  _reward(r, words) {
    const inv = this.ctx.inventory;
    for (const [id, n] of r.items) inv?.add?.(id, n);
    this.rung = r.rung;
    this.braziers.unlock(r.unlockBrazier);
    // M1.6l: the quest pays what the bible says it pays, and she wears it from Ansel's door (its perk, Shrug, with it);
    // the Character page can put the Starter back on
    this.wear(r.rung);
    this.ctx.events?.emit?.('rung-granted', { rung: r.rung });
    this.ctx.progression?.banner?.(this.S.systems.reward.head, words.join('  ·  '), 'quest');
  }

  /** Put a rung's armour on her through armory's loadout (a deferred row loads; resolves with the loadout's info, or null). */
  wear(rung) {
    const L = this.ctx.player?.hero?.loadout, id = RUNG_ARMOR[rung];
    if (!L?.equipArmor || !id || L.armorId === id) return Promise.resolve(null);
    // fix round 1: the armour being put on is what a record written meanwhile holds (src/core/save.js): equipArmor
    // loads a file, and the quest's own checkpoints ('quest:done', 'stage:return') are written in the same frame as
    // the reward, so at 16645ca the record after Raker's Morning held rung 'scout' and wear 'pan-1', and CONTINUE stood
    // her up in the Starter
    this.wantArmor = id;
    const done = (r) => { if (this.wantArmor === id) this.wantArmor = null; return r; };
    this._wearing = L.equipArmor(id).then(done, (err) => { console.warn('[systems] wear:', err?.message || err); return done(null); });
    return this._wearing;
  }

  /* ------------------------------------------------- world stand-ins */

  _entries() {
    const I = this.ctx.interactables;
    if (!I?.register) return;
    const T = this.ctx.terrain;
    const at = (p) => vec3(p.x, T?.getHeight?.(p.x, p.z) ?? 0, p.z);
    const P = this.S.systems.prompts;
    const talk = (npc) => fill(P.talk, { name: this.S.speakers[npc].name });
    this.entry = {
      ansel: I.register({ position: at(this.A.ansel), radius: 3.0, hold: 0.3, label: talk('ansel'), once: false, onInteract: () => this.talk('ansel') }),
      mise: I.register({ position: at(this.A.mise), radius: 3.0, hold: 0.3, label: talk('mise'), once: false, onInteract: () => this.talk('mise') }),
      rake: I.register({ position: at(this.A.pans), radius: 6.5, hold: 0.5, label: P.rake, once: false, disabled: true, onInteract: () => this._gather('rake', 'metal-shards') }),
      cane: I.register({ position: at(this.A.cane), radius: 5.0, hold: 0.5, label: P.cut, once: false, disabled: true, onInteract: () => this._gather('cane', 'ridge-wood') }),
    };
  }

  /**
   * Rake and cut: the satchel gains the catalogue item (the salt is `metal-shards`, the cane the `ridge-wood`
   * stand-in until the Making ledger's own cane item, M1.6d), but the toast's name is the writing's
   * (src/game/text/ui/systems.json `items`), never the catalogue's ("Juniper" for cut cane, systems-1b judge).
   */
  _gather(source, item) {
    const inv = this.ctx.inventory;
    const name = this.S.systems.items?.[source] ?? null;
    if (inv?.counts && name) {
      const have = inv.counts.get(item) ?? 0;
      const cap = typeof inv.capacity === 'function' ? inv.capacity(item) : Infinity;
      const total = Math.min(Number.isFinite(cap) ? cap : Infinity, have + 1);
      inv.counts.set(item, total);
      if (total > have) this.ctx.events?.emit?.('item-gained', { id: item, count: total - have, total, name, glyph: null, color: null, rarity: 'common', capped: false });
    } else inv?.add?.(item, 1);
    this.spine.notify('gathered', { source, n: 1 });
  }

  talk(npc) {
    if (this.present.busy) return;
    if (npc === 'oro') { this.hour?.talk('oro'); return; }
    this.spine.talk(npc);
  }

  _stagePeople() {
    const people = this.ctx.people;
    if (!people?.spawn || this._peopleAsked) return;
    this._peopleAsked = true;
    const put = (who, arche, p, yaw) => people.spawn(arche, { x: p.x, z: p.z, yaw, seed: who === 'ansel' ? 64 : 68 })
      .then((person) => { this.people[who] = person; }).catch(() => { /* the prompt still stands */ });
    put('ansel', 'guild-matron', this.A.ansel, 2.2);
    put('mise', 'lantern-keeper', this.A.mise, 0.8);
  }

  _moveAnsel(p) {
    const e = this.entry?.ansel;
    if (e) { e.position.x = p.x; e.position.z = p.z; e.position.y = this.ctx.terrain?.getHeight?.(p.x, p.z) ?? 0; }
    const person = this.people.ansel;
    if (person?.group) person.group.position.set(p.x, e?.position.y ?? person.group.position.y, p.z);
  }

  _spawn(what) {
    const M = this.ctx.machines;
    if (!M?.spawn) return;
    const has = (k) => !!M.instrumentKinds?.[k];
    if (what === 'transect' && has('peg')) {
      // M1b pacing: Mise's nine Pegs come in as THREE SWARMS OF THREE (bible §7.4: swarms of 3-6), each hammering its
      // own 18 m stretch of the line, the stretches 53 m apart (the line is 178 m, pans to beach), so a player meets
      // them a swarm at a time; the crossing (25 m seaward of the middle) faces the middle swarm only. At 6fa199d the
      // nine stood in one block (every 11 m from 0.25 to 0.73 of the line, routes overlapping, joined into swarms of
      // six and three by peg-swarm.js) and the slice run lost 86 of 100 hp to them
      const a = this.A.transectA, b = this.A.transectB;
      for (const c of SWARMS) {
        const p = lerp(a, b, c - SWARM_HALF), q = lerp(a, b, c + SWARM_HALF);
        const L = Math.hypot(q.x - p.x, q.z - p.z) || 1, nx = -(q.z - p.z) / L, nz = (q.x - p.x) / L;
        for (const slot of [0, 1, -1]) {
          // spawned in one tick within 3 m of the first: peg-swarm.js joins them into one swarm walking abreast on the
          // first's line (each on its slot, 3 m apart)
          const x = p.x + nx * slot * 3, z = p.z + nz * slot * 3;
          const m = M.spawn('peg', x, z, { route: [vec3(p.x, 0, p.z), vec3(q.x, 0, q.z)] });   // machines' routes are Vector3s
          if (m) { this.siteRefill?.own(m, QUEST_ID); this.spawned.transect.push(m); }
        }
      }
    } else if (what === 'plumb' && has('plumb')) {
      const s = this.A.station;
      const m = M.spawn('plumb', s.x, s.z, {});
      if (m) { this.siteRefill?.own(m, QUEST_ID); this._keepForPry(m); this.spawned.plumb.push(m); }
    }
  }

  /**
   * M1b: THE DITCH'S PLUMB LIVES UNTIL ITS BOB IS PRIED. The slice teaches "two hits on the vial, then Pry the bob
   * while it is down", and nothing else ends the 'ditch', 'topple' and 'pry' stages: a Plumb killed before its bob
   * comes off left the quest with no Plumb to pry (de71979: four Reed arrows round the vial took 190 hp to 10, and the
   * Barbed arrow on the toppled bob killed it; the stage stood at 'pry' with 'no live plumb'). While one of those
   * stages runs and the bob is on, a hit still lands in full (its damage, reactions and events) but leaves it at
   * PRY_FLOOR of its health at least; once the bob is off, or after the quest, it dies as any Instrument does.
   */
  _keepForPry(m) {
    const td = m.takeDamage.bind(m), spine = this.spine;
    m.takeDamage = (hit) => {
      const st = spine?.current?.()?.id;
      const keep = (st === 'ditch' || st === 'topple' || st === 'pry') && m.alive !== false && m._bob?.attached !== false;
      if (!keep) return td(hit);
      const h0 = m.health, room = 1e6, floor = Math.max(1, PRY_FLOOR * (m.maxHealth || 1));
      m.health = h0 + room;
      try { return td(hit); } finally {
        if (m.alive !== false) m.health = Math.max(Math.min(h0, floor), m.health - room);
      }
    };
  }

  /* ---------------------------------------------------------- events */

  _listen() {
    const ev = this.ctx.events;
    if (!ev?.on) return;
    const on = (n, fn) => ev.on(n, (e) => { try { fn(e || {}); } catch (err) { this.listenErrors = (this.listenErrors ?? 0) + 1; this.lastListenError = String(err?.message || err); } });
    // play began without New Game or Continue (a ?shot page): the field note names the quest, nothing runs (spine.arm).
    // Registered before the HUD's own game-start listener, so the note it renders is this one. New Game starts the
    // quest; Continue restores it (the title's Continue fires game-start first, then restores over this).
    on('game-start', () => {
      if (this.spine.started) return;
      this.spine.arm();
      if (this.ctx.progression) this.ctx.progression.tracked = QUEST_ID;
    });
    // the site clock is told before the spine, so a kill that ends a stage is judged by the stage that asked for it
    on('machine-killed', (e) => { this.siteRefill.killed(e.machine); this.spine.notify('machine-killed', { kind: e.machine?.kind }); });
    on('machine-disposed', (e) => this.siteRefill.disposed(e.site));
    on('brazier-rest-start', (e) => this.hours.restStart(this.ctx.environment?.time ?? e.toHour, e.toHour));
    on('brazier-rest', () => this.hours.restEnd(this.ctx.environment?.time));
    on('save-loaded', () => this.hours.resync(this.ctx.environment?.time));
    on('plumb-topple', (e) => this.spine.notify('plumb-topple', { kind: e.machine?.kind ?? 'plumb' }));
    on('part-torn', (e) => this.spine.notify('part-torn', { kind: e.machine?.kind, part: e.part?.name ?? e.part?.id }));
    // nothing in the build emits 'part-torn' (audio listens for it; machines report a torn tool on machine-damaged):
    // the bob torn off the Plumb is read there too (the Pry verb itself is M1.6j's)
    on('machine-damaged', (e) => {
      const tp = e.tornPart;
      if (tp) this.spine.notify('part-torn', { kind: e.machine?.kind, part: tp.name ?? tp.id ?? String(tp) });
    });
    on('flagged', () => this.spine.notify('flagged'));
    on('plumb-chime', () => this.spine.notify('plumb-chime'));
    on('ammo-crafted', (e) => this.spine.notify('ammo-crafted', { ammo: e.ammo, n: e.n }));
    on('arrow-hit', (e) => { if ((e.machine ?? e.target)?.kind === 'plumb') this.spine.notify('plumb-hit'); });
  }

  /* ---------------------------------------------- progression bridge */

  _hookProgression() {
    const prog = this.ctx.progression;
    if (!prog || prog.__systemsHooked) return;
    prog.__systemsHooked = true;
    const ng = prog.newGame.bind(prog);
    prog.newGame = (difficulty) => { const r = ng(difficulty); this.newGame(); return r; };
  }

  /** New Game: 07:00 beside her cistern, the Brazier in grey ash; the start counts as a rest there (BIBLE 17). */
  newGame() {
    const ctx = this.ctx;
    ctx.environment?.setTime?.(7);
    this.siteClock.restore(null);
    this.hours.resync(7);
    this.rung = 'starter';
    this.wear('starter');
    this.braziers.newGame(7);
    this.hour?.newGame();
    this.spine.start();
    if (ctx.progression) ctx.progression.tracked = QUEST_ID;
    this._writeNamed('new-game');
  }

  _writeNamed(reason) {
    const saves = this.ctx.progression?.saves;
    return saves ? saves.write(SLOT.main, reason) : null;
  }

  restoreQuest(q, triangles) {
    if (q) this.spine.restore(q);
    else this.spine.reset();
    // what the current stage spawned is the quest's, not a site's: the roster restore does not bring it back, so a
    // Continue onto 'topple' would find no Plumb. Spawn it again if none of it is standing.
    const cur = this.spine.current();
    if (cur?.spawn) {
      const live = (this.spawned[cur.spawn] || []).filter((m) => m && m.alive !== false && !m._disposed);
      this.spawned[cur.spawn] = live;
      if (!live.length) this._spawn(cur.spawn);
    }
    // stages after a spawn stage need its spawn too (topple and pry stand on the ditch's Plumb)
    if (cur && !cur.spawn && (cur.id === 'topple' || cur.id === 'pry')) {
      const live = (this.spawned.plumb || []).filter((m) => m && m.alive !== false && !m._disposed);
      this.spawned.plumb = live;
      if (!live.length) this._spawn('plumb');
    }
    for (const t of (triangles || [])) this.spine.triangles.add(t);
    if (this.ctx.progression) this.ctx.progression.tracked = this.spine.started ? QUEST_ID : this.ctx.progression.tracked;
    this._syncEntries();
    // Milestone 2: the rest of the hour after the record's own quest (a slice save carries forward into "The Scar", Q5)
    this.hour?.afterRestore();
  }

  /* --------------------------------------------------------- the frame */

  /** The world as the spine asks about it. */
  get world() {
    if (this._world) return this._world;
    const self = this;
    this._world = {
      near(anchor, r, up = 0) {
        const a = self.A[anchor], p = self.ctx.player?.position;
        if (!a || !p) return false;
        const dx = p.x - a.x, dz = p.z - a.z;
        if (dx * dx + dz * dz > r * r) return false;
        if (up > 0) return p.y - (self.ctx.terrain?.getHeight?.(a.x, a.z) ?? 0) >= up;
        return true;
      },
      aim(id) {
        const s = self.ctx.sighting;
        const t = self.targets[id], cam = self.ctx.camera;
        if (!s?.on || !t || !cam) return false;
        cam.getWorldPosition(_cam);
        cam.getWorldDirection(_dir);
        _to.set(t.x - _cam.x, t.y - _cam.y, t.z - _cam.z);
        const d = _to.length();
        if (d > t.range || d < 1) return false;
        const ang = Math.acos(Math.max(-1, Math.min(1, _dir.dot(_to) / d))) * 180 / Math.PI;
        return ang <= t.tol;
      },
      bearing(id) {
        const t = self.targets[id], p = self.ctx.player?.position;
        if (!t || !p) return 0;
        // engine x = E, z = -N
        return ((Math.atan2(t.x - p.x, -(t.z - p.z)) * 180 / Math.PI) + 360) % 360;
      },
    };
    return this._world;
  }

  _syncEntries() {
    const cur = this.spine.current()?.id;
    if (this.entry) {
      this.entry.rake.disabled = cur !== 'rake';
      this.entry.cane.disabled = cur !== 'cane';
    }
    const home = cur === 'return' || this.spine.done;
    if (home !== this._anselHome) { this._anselHome = home; this._moveAnsel(home ? this.A['ansel-home'] : this.A.ansel); }
  }

  /** Is any live Instrument within 60 m alert or attacking (the HUD's SPOTTED: its meter full)? */
  _spotted() {
    const p = this.ctx.player?.position, L = this.ctx.machines?.list;
    if (!p || !Array.isArray(L)) return false;
    for (const m of L) {
      if (!m || m.alive === false || !m.position) continue;
      if (m.state !== 'alert' && m.state !== 'attack') continue;
      const dx = m.position.x - p.x, dz = m.position.z - p.z;
      if (dx * dx + dz * dz < 3600) return true;
    }
    return false;
  }

  update(dt, t) {
    if (!this._peopleT) this._peopleT = 0;
    // the crossing is judged seen the moment the HUD would say SPOTTED (4 Hz check)
    this._seenT = (this._seenT ?? 0) + dt;
    if (this._seenT > 0.25) {
      this._seenT = 0;
      if (this.ctx.state === 'playing' && this.spine.current()?.flagVariant && this._spotted()) this.spine.notify('seen');
    }
    this._peopleT += dt;
    // Ansel and Mise stand at their anchors once a run has started (never in a ?shot film: F20/F21 stage their own)
    if (this._peopleT > 2 && this.spine.started) this._stagePeople();
    if (this.ctx.state === 'playing') this.spine.update(dt, this.world);
    this.hour?.update(dt);
    // while the quest runs its own cards (src/game/text/cards) are the only tutorial cards: hud.js reads this flag
    // and holds the bible-table cards it raises by itself (tips.js), which ran alongside them in round 1
    if (this.ctx.hud) this.ctx.hud.questCards = !!this.spine.started;
    this.braziers.update(dt, t);
    // the site clock: the hour's forward steps are hours played (a rest counts its hours slept when it begins)
    this.hours.read(this.ctx.environment?.time);
    if (this.ctx.state === 'playing') this.siteRefill.update(dt);
    // the regions seam: her position each step while playing (a teleport across a border fires its crossing once)
    if (this.ctx.state === 'playing' && this.ctx.player) this.ctx.engine?.regionTick?.(this.ctx.player.position.x, this.ctx.player.position.z);
    const now = performance.now();
    const real = this._lastReal ? Math.min(0.1, (now - this._lastReal) / 1000) : 0;
    this._lastReal = now;
    this.present.update(real);
    this._syncEntries();
  }

  report() {
    return { ...this.spine.report(), rung: this.rung, braziers: this.braziers.serialize(), stats: this.braziers.stats, log: this.events.slice(), hour: this.hour?.report?.() ?? null };
  }

  dispose() {
    for (const e of Object.values(this.entry || {})) this.ctx.interactables?.unregister?.(e);
    this.hour?.dispose();
    this.braziers.dispose();
    this.present.dispose();
  }
}

export function installGame(ctx) {
  installReeds(ctx);   // M1.6e: reed cover, the gust clock, the rule (src/game/reeds); ctx.terrain.cutCover
  // Milestone 2: the regions (engine's seam, src/core/regions.js) built behind the loading sheet; ticked in update()
  ctx.regions = ctx.engine?.attachRegions?.({ assets: ctx.assets, events: ctx.events }) ?? null;
  saveFieldsOf(ctx);   // the save seam (src/game/save/fields.js): areas register their { get, set } pairs on it
  const sys = new SystemsGame(ctx);
  ctx.game?.systems?.push?.(sys);
  return sys;
}
