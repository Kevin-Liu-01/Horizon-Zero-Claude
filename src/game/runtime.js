import { STRINGS } from './text.js';
import { fill } from './strings.js';
import { QuestSpine } from './quest/spine.js';
import { QUEST_ID } from './quest/plan.js';
import { Presenter } from './present.js';
import { Braziers } from './brazier/braziers.js';
import { REST, TRIG, TRIG_TOP, siteById } from '../world/island/sites.js';
import { SLOT } from '../core/save.js';
import { vec3 } from '../world/settlements/brazier.js';

/**
 * THE SYSTEMS RUNTIME (BUILD M1.6a, M1.6c, M1.6f): the live half of the quest spine, the Braziers and save v6.
 * `installGame(ctx)` runs after `installProgression`; it publishes
 *   ctx.spine          the QuestSpine (src/game/quest/spine.js)
 *   ctx.braziers       the Braziers (src/game/brazier/braziers.js)
 *   ctx.systemsGame    this runtime: anchors, rung, report(), newGame(), restoreQuest()
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
    this._entries();
    this._listen();
    this._hookProgression();
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
      mise: { x: saltrow.x - 6, z: saltrow.z + 4 },
      transect: mid,
      transectA: { x: pans.x, z: pans.z }, transectB: { x: beach.x, z: beach.z },
      crossed,
      t1: { x: t1.x, z: t1.z },
      station,
      ditch: lerp(station, t1, 0.12),
      'ansel-home': { x: saltrow.x + 3, z: saltrow.z - 2 },
    };
    // aim targets: the Gauge's drum and the pillar tops
    const H = (p) => ctx.terrain?.getHeight?.(p.x, p.z) ?? 0;
    this.targets = {
      gauge: { x: gauge.x, y: (g?.y ?? H(gauge)) + 5.3, z: gauge.z, tol: 7, range: 160 },
    };
    for (const t of TRIG) this.targets[t.id] = { x: t.x, y: H(t) + TRIG_TOP, z: t.z, tol: 2.5, range: 2000 };
  }

  placeName() {
    const p = this.ctx.player?.position;
    if (!p) return '';
    const lr = this.braziers?.lastRest;
    return lr ? (this.S.systems.brazier.names[lr.id] ?? '') : '';
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
      done: () => ctx.events?.emit?.('quest-complete', { questId: QUEST_ID }),
    };
  }

  /** Scenes queue: one lower-third at a time (a stage's end scene and the next stage's start scene can coincide). */
  _playScene(id, scene) {
    this._sceneChain = (this._sceneChain || Promise.resolve()).then(async () => {
      this.sceneOpen = id;
      const res = await this.present.scene(scene, this.S.speakers, { next: this.S.systems.dialogue.next });
      this.sceneOpen = null;
      this.spine.notify('scene-done', { scene: id, exit: res?.exit !== false });
    }).catch(() => { this.sceneOpen = null; });
    return this._sceneChain;
  }

  _reward(r, words) {
    const inv = this.ctx.inventory;
    for (const [id, n] of r.items) inv?.add?.(id, n);
    this.rung = r.rung;
    this.braziers.unlock(r.unlockBrazier);
    this.ctx.events?.emit?.('rung-granted', { rung: r.rung });
    this.ctx.progression?.banner?.(this.S.systems.reward.head, words.join('  ·  '), 'quest');
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

  _gather(source, item) {
    this.ctx.inventory?.add?.(item, 1);
    this.spine.notify('gathered', { source, n: 1 });
  }

  talk(npc) {
    if (this.present.busy) return;
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
      const a = this.A.transectA, b = this.A.transectB;
      for (let i = 0; i < 9; i++) {
        const p = lerp(a, b, 0.25 + 0.06 * i);
        const q = lerp(a, b, 0.3 + 0.06 * i);
        const m = M.spawn('peg', p.x, p.z, { route: [vec3(p.x, 0, p.z), vec3(q.x, 0, q.z)] });   // machines' routes are Vector3s
        if (m) this.spawned.transect.push(m);
      }
    } else if (what === 'plumb' && has('plumb')) {
      const s = this.A.station;
      const m = M.spawn('plumb', s.x, s.z, {});
      if (m) this.spawned.plumb.push(m);
    }
  }

  /* ---------------------------------------------------------- events */

  _listen() {
    const ev = this.ctx.events;
    if (!ev?.on) return;
    const on = (n, fn) => ev.on(n, (e) => { try { fn(e || {}); } catch (err) { this.listenErrors = (this.listenErrors ?? 0) + 1; this.lastListenError = String(err?.message || err); } });
    on('machine-killed', (e) => this.spine.notify('machine-killed', { kind: e.machine?.kind }));
    on('plumb-topple', (e) => this.spine.notify('plumb-topple', { kind: e.machine?.kind ?? 'plumb' }));
    on('part-torn', (e) => this.spine.notify('part-torn', { kind: e.machine?.kind, part: e.part?.name ?? e.part?.id }));
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
    this.rung = 'starter';
    this.braziers.newGame(7);
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
    for (const t of (triangles || [])) this.spine.triangles.add(t);
    if (this.ctx.progression) this.ctx.progression.tracked = this.spine.started ? QUEST_ID : this.ctx.progression.tracked;
    this._syncEntries();
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

  update(dt, t) {
    if (!this._peopleT) this._peopleT = 0;
    this._peopleT += dt;
    // Ansel and Mise stand at their anchors once a run has started (never in a ?shot film: F20/F21 stage their own)
    if (this._peopleT > 2 && this.spine.started) this._stagePeople();
    if (this.ctx.state === 'playing') this.spine.update(dt, this.world);
    this.braziers.update(dt, t);
    const now = performance.now();
    const real = this._lastReal ? Math.min(0.1, (now - this._lastReal) / 1000) : 0;
    this._lastReal = now;
    this.present.update(real);
    this._syncEntries();
  }

  report() {
    return { ...this.spine.report(), rung: this.rung, braziers: this.braziers.serialize(), stats: this.braziers.stats, log: this.events.slice() };
  }

  dispose() {
    for (const e of Object.values(this.entry || {})) this.ctx.interactables?.unregister?.(e);
    this.braziers.dispose();
    this.present.dispose();
  }
}

export function installGame(ctx) {
  const sys = new SystemsGame(ctx);
  ctx.game?.systems?.push?.(sys);
  return sys;
}
