import * as THREE from 'three';
import { artKind } from './art-kind.js';
import { ExpansionMachine } from '../../entities/machines/rig/expansion-base.js';
import { ScreedBrain, ScreedFight, FIGHT, SCREED_RULES, bladeDropped } from './screed-rules.js';
import { segmentHitsWall, setWallCut, wallState, CENTRE as NW_CENTRE } from '../../world/settlements/ninewalls-layout.js';
import { SCAR } from '../../world/island/sites.js';

/**
 * SCREED — bible §7.4 #9 (large; role `heavy` from its behaviour wave). A walking road-grader: a wide plated hull on
 * six short heavy legs, the 3.5 m moldboard on a push frame and two rams in front, the ripper behind, a spoil hopper,
 * and the cab mast with its ONE lamp, the disc platform, two banners and a finial to 3.8 m. M2 wave 2: its art
 * (tools/build/instruments/gen-screed.mjs, the Instruments' shared language) standing on its rig (`./art-kind.js`).
 * The first `large` kind: A76's third weight class (heavy) and the encounter rule's anchor read it.
 *
 * M2 WAVE 3, THE FIGHT (bible §11.2 0:35; IN5-IN7 on the page). The Screed that plays is driven by the same rules the
 * Node twins grade (`./screed-rules.js` ScreedBrain, tools/instruments/screed-rules.test.mjs): this file only reads
 * her, feeds the brain and writes the brain's position, heading and blade back onto the machine.
 *   WAIT    it stands where the quest stood it up (systems, src/game/hour.js: outside the outer wall, facing the
 *           village), blade working, calm.
 *   COME    when she is within ENGAGE_M of it (or something hits it) the lamp goes hostile and it walks on the village at
 *           its walk (1.4 m/s): walking in un-stalled it cuts each wall its blade reaches down to the Datum Line (IN7).
 *   CHARGE  when she stands in front of it (within CHARGE_CONE of its heading) at CHARGE_M[0]-[1], it winds up (1.2 s,
 *           the blade to 2.6 m), commits and runs 25 m on that heading, never steering (IN5); the blade hits her if she
 *           is still in front of it. A charge that meets a whole wall, a basalt cluster or the Organ Shelf STALLS it 3.0 s,
 *           the blade planted: the opening to work the seals.
 *   PARTS   two ram seals and the cab lamp (IN6): a sealed seal comes off with two precision hits; Brine seizes it and one
 *           Pry or one hook-rip takes a seized one off (`kitBlow`, the combat seam: src/combat/status.js). Both seals
 *           off drop the blade: it cuts no more walls. The lamp off blinds it.
 *   DONE    at the third cut wall the fight ends fail-soft and it walks on along the Scar (IN7); with both seals off it
 *           stops cutting, and it walks on along the Scar too.
 * Events (`this.emit`, ctx.events; the names and payloads src/game/quest/scar-plan.js lists): 'screed-stalled'
 * { wall, by } when a charge stops on a wall, 'seal-off' { seal: 'ram-1' | 'ram-2' (the first and the second off),
 * part: 'sealL' | 'sealR' }; and for the rows and the HUD 'screed-engage', 'screed-charge', 'screed-seized'
 * { part }, 'screed-cut' { id, cuts } (settlements' own 'wall-cut' follows the wall's state), 'screed-done'
 * { failSoft, cuts, sealsOff }. The quest reads them for the first hour's `stall`, `seal-1` and `seal-2` beats; nothing
 * here writes a quest stage.
 * `fight()` is the plain report the runner and the rows read.
 */
const URL = '/models/instruments/screed.glb';
const HEX = { stride: 0.8, duty: 0.66, lift: 0.12, offsets: { LF: 0, RM: 0, LH: 0, RF: 0.5, LM: 0.5, RH: 0.5 } };


/** The nine walls as the brain asks for them (area B's seam, src/world/settlements/ninewalls-layout.js). */
const WALLS = Object.freeze({ segmentHitsWall, setWallCut, wallState });

const base = artKind({
  id: 'screed', kind: 'screed', url: URL, sizeClass: 'large', plannedRole: 'heavy', displayName: 'Screed',
  height: 3.8, bodyRadius: 1.8,
  // the two ram seals (IN6: both `off` drop the blade): seals[0] is the right ram (+x), seals[1] the left
  weak: (S) => (Array.isArray(S.seals) ? S.seals.map((at, i) => ({ name: i === 0 ? 'sealR' : 'sealL', at, r: (S.sealR ?? 0.18) * 1.2, mult: 2.5 })) : []),
  gait: {
    walk: HEX, run: { ...HEX, stride: 1.6, duty: 0.5, lift: 0.18 }, runRef: 8,
    rollAmp: 0.008, impactAmp: 0.03, breatheRate: 0.45, stepDustSpeed: 3,
    turnRadius: 4.0, lookClampYaw: 0.12, stanceFlex: 0.04, fidgets: [],
  },
});

class Screed extends base.Cls {
  constructor(ctx, manager, opts = {}) {
    super(ctx, manager, opts);
    this.walkSpeed = SCREED_RULES.walk; this.runSpeed = SCREED_RULES.chargeSpeed;
    this.brain = new ScreedBrain({ x: this.position.x, z: this.position.z, heading: opts.heading ?? this.heading, walls: WALLS, obstacles: opts.obstacles || [] });
    // the fight (screed-rules.js ScreedFight): on the village, then back out the way it came and down the Scar
    this.fightRules = new ScreedFight(this.brain, { centre: { x: NW_CENTRE.x, z: NW_CENTRE.z }, arena: { x: NW_CENTRE.x, z: NW_CENTRE.z, r: 160 },
      away: [{ x: this.position.x, z: this.position.z }, { x: SCAR.b.x, z: SCAR.b.z }] });
    this._sealW = this.weakPoints.filter((w) => w.name === 'sealR' || w.name === 'sealL');
    this._headLift = 0;
  }

  /** The plain report (the runner, the rows, the Sighting card). */
  fight() {
    const b = this.brain, P = b.parts;
    return { mode: this.fightRules.mode, phase: b.phase, stalls: b.stalls.slice(), cuts: b.cuts.slice(), failSoft: b.failSoft,
      seals: { sealL: P.sealL.state, sealR: P.sealR.state }, lamp: P.lamp.state, bladeDropped: bladeDropped(P), bladeY: +b.bladeY.toFixed(2),
      at: [+this.position.x.toFixed(1), +this.position.z.toFixed(1)] };
  }

  update(dt, t) {
    if (this._disposed) return undefined;
    if (this.alive && this.state !== 'dead' && dt > 0) this._think(dt);
    // the machine stack (perception, conform to the ground, the gait, the lamp) without the standing kind's calm
    const r = ExpansionMachine.prototype.update.call(this, dt, t);
    this._publishShapes();
    return r;
  }

  _think(dt) {
    const b = this.brain, P = this.ctx.player?.position;
    const evs = this.fightRules.step(dt, P ? P.x : null, P ? P.z : null);
    for (let i = 0; i < evs.length; i++) this._out(evs[i]);
    // the brain owns where it is; the machine stack conforms it to the ground and walks its legs
    this.position.x = b.x; this.position.z = b.z;
    this.heading = b.heading;
    this.sc._speed = b.phase === 'charge' ? SCREED_RULES.chargeSpeed : b.phase === 'walk' || b.phase === 'done' ? (b.target ? SCREED_RULES.walk : 0) : 0;
    const hostile = this.fightRules.mode === 'come';
    if (hostile && this.state !== 'alert') this.setState('alert');
    else if (!hostile && this.state !== 'patrol') this.setState('patrol');
  }

  /** One rules event onto ctx.events (scar-plan.js's names), with the machine; the blade's blow is her damage. */
  _out(e) {
    if (e.type === 'blade-hit') { this.emit('player-damage', { amount: FIGHT.bladeDmg, from: this, knock: 7 }); return; }
    if (e.type === 'seal-off') { const w = this._sealW.find((x) => x.name === e.part); if (w) w.enabled = false; }
    const { type, ...payload } = e;
    this.emit(type, { machine: this, ...payload });
  }

  _stateAttack() {}
  _engageFrame() {}

  animate(dt, t) {
    super.animate(dt, t);
    // the moldboard and the rams' rods ride the `head` bone: the wind-up lifts it to bladeUp, a dropped blade sits low
    const head = this.rig?.head;
    if (head && this.state !== 'dead') {
      const want = this.brain.bladeY - SCREED_RULES.bladeRest;
      this._headLift += (want - this._headLift) * (1 - Math.exp(-10 * dt));
      head.position.y += this._headLift;
    }
  }

  /** A precision hit on a seal (IN6): two on a sealed seal take it off. Any blow that lands starts the fight. */
  takeDamage(hit) {
    const r = super.takeDamage(hit);
    if (r && r.damage > 0) this.fightRules.struck = true;
    if (!hit || !hit.point || !this.alive) return r;
    for (const w of this._sealW) {
      if (w.enabled === false) continue;
      w.obj.getWorldPosition(_wp);
      if (_wp.distanceToSquared(hit.point) <= (w.radius + 0.05) * (w.radius + 0.05)) { this._partBlow(w.name, 'precision'); break; }
    }
    return r;
  }

  /**
   * The combat seam (src/combat/status.js: "a kind may answer a blow on a named part itself"): kind 'brine' seizes a
   * seal, 'pry' / 'hookRip' take a seized one off, 'precision' is an arrow on it. `part` is 'sealL' | 'sealR' | 'lamp'
   * or a generic seal name (the seal nearest her that is not off). Returns the part's new state, or null.
   */
  kitBlow(part, kind) {
    let id = part === 'sealL' || part === 'sealR' || part === 'lamp' ? part : null;
    if (!id && /seal/i.test(String(part || ''))) id = this._nearestSeal();
    if (!id) return null;
    return this._partBlow(id, kind);
  }

  _nearestSeal() {
    const P = this.ctx.player?.position, S = this.brain.parts;
    let best = null, bd = Infinity;
    for (const w of this._sealW) {
      if (S[w.name].state === 'off') continue;
      w.obj.getWorldPosition(_wp);
      const d = P ? _wp.distanceToSquared(P) : 0;
      if (d < bd) { bd = d; best = w.name; }
    }
    return best;
  }

  _partBlow(id, kind) {
    const st = this.fightRules.blow(id, kind);
    if (id === 'lamp' && st === 'off') this.sc.lampDarkT = 1e6;
    const evs = this.fightRules.events;
    for (let i = 0; i < evs.length; i++) this._out(evs[i]);
    return st;
  }
}

const _wp = new THREE.Vector3();

export default {
  id: 'screed',
  /** Size class (lib/sizeclass.js; bible §7.4): footfall weight, the per-class caps and the encounter rule read it. */
  sizeClass: 'large',
  ...base,
  Cls: Screed,
};
