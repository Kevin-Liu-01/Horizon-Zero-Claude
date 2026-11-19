import { artKind } from './art-kind.js';
import { ExpansionMachine } from '../../entities/machines/rig/expansion-base.js';
import { SickleBrain, SicklePack, SickleFight, SICKLE_RULES, PACK } from './sickle-rules.js';
import { CENTRE as NW_CENTRE } from '../../world/settlements/ninewalls-layout.js';

/**
 * SICKLE — bible §7.4 #5 (medium; role `flanker` from its behaviour wave). A low wedge body on four raked-back legs;
 * a rotating hub at the front with two curved bronze blades that scissor; one lamp; an oxblood band on the hub cowl.
 * M2 wave 2: its art (tools/build/instruments/gen-sickle.mjs, the Instruments' shared language: white enamel plates,
 * brass, gunmetal, a lamp drum ON its right shoulder, the coolant flask a pale-ice vial, one antenna), standing on
 * its rig (`./art-kind.js`).
 *
 * M2 WAVE 3, ITS ROLE (IN8 on the page; the fight frame F39 has three beside the Screed). The Sickle that plays is the
 * rules the Node rows grade (`./sickle-rules.js`: SickleBrain for Clearcut and the Scissor Lunge, SickleFight and
 * SicklePack for the pack; tools/instruments/sickle-fight.test.mjs): Sickles stood up within PACK_JOIN_M of each other
 * are one pack; it waits calm, then circles her at 9-14 m and feints, one member attacking at a time. The hub bearing
 * (its weak point) is live only in the Clearcut wind-up: `weakPoints[hub].enabled` follows `hubExposed()`, so an arrow
 * outside the 0.6 s window strikes plate. It keeps no role (no every-kind kept row stages it) and fights only inside
 * the Holds (ARENA: Ninewalls' centre, 220 m), so the line-up's F23-sickle on the Pans stands calm.
 */
const URL = '/models/instruments/sickle.glb';
const QUAD = { stride: 0.9, duty: 0.6, lift: 0.14, offsets: { LF: 0, RH: 0.25, RF: 0.5, LH: 0.75 } };
/** Sickles stood up within this of a pack member join that pack (m). */
const PACK_JOIN_M = 30;
const ARENA = Object.freeze({ x: NW_CENTRE.x, z: NW_CENTRE.z, r: 220 });

const base = artKind({
  id: 'sickle', kind: 'sickle', url: URL, sizeClass: 'medium', plannedRole: 'flanker', displayName: 'Sickle',
  height: 1.7, bodyRadius: 0.75,
  // the hub bearing: live only in the Clearcut wind-up (IN8)
  weak: (S) => (Array.isArray(S.hub) ? [{ name: 'hub bearing', at: S.hub, r: (S.hubR ?? 0.13) * 1.3, mult: 2.5 }] : []),
  gait: {
    walk: QUAD, run: { ...QUAD, stride: 1.6, duty: 0.45, lift: 0.2 }, runRef: 7,
    rollAmp: 0.012, impactAmp: 0.012, breatheRate: 0.9, stepDustSpeed: 6,
    turnRadius: 1.0, lookClampYaw: 0.3, stanceFlex: 0.06, fidgets: [],
  },
});

class Sickle extends base.Cls {
  constructor(ctx, manager, opts = {}) {
    super(ctx, manager, opts);
    this.walkSpeed = SICKLE_RULES.walk; this.runSpeed = SICKLE_RULES.run;
    this.brain = new SickleBrain({ x: this.position.x, z: this.position.z, heading: opts.heading ?? this.heading });
    const packs = manager ? (manager._sicklePacks || (manager._sicklePacks = [])) : [];
    let pack = packs.find((pk) => pk.members.some((f) => f.alive() && Math.hypot(f.b.x - this.position.x, f.b.z - this.position.z) <= PACK_JOIN_M));
    if (!pack) { pack = new SicklePack(); packs.push(pack); }
    this.pack = pack;
    this.fightRules = new SickleFight(this.brain, pack, { arena: ARENA, alive: () => this.alive && !this._disposed });
    this._hub = this.weakPoints.find((w) => w.name === 'hub bearing') || null;
    if (this._hub) this._hub.enabled = false;
  }

  /** The plain report (the rows). */
  fight() {
    const b = this.brain;
    return { mode: this.fightRules.mode, move: b.move, phase: b.phase, hubExposed: b.hubExposed(), pack: this.pack.live().length,
      at: [+this.position.x.toFixed(1), +this.position.z.toFixed(1)] };
  }

  update(dt, t) {
    if (this._disposed) return undefined;
    if (this.alive && this.state !== 'dead' && dt > 0) this._think(dt);
    const r = ExpansionMachine.prototype.update.call(this, dt, t);
    this._publishShapes();
    return r;
  }

  _think(dt) {
    const b = this.brain, P = this.ctx.player?.position;
    // the pack steps once per frame: its first living member steps it
    if (this.pack.live()[0] === this.fightRules) this.pack.step(dt);
    const evs = this.fightRules.step(dt, P ? P.x : null, P ? P.z : null);
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      if (e.type === 'blade-hit') this.emit('player-damage', { amount: e.move === 'lunge' ? PACK.lungeDmg : PACK.clearcutDmg, from: this, knock: 4 });
      else { const { type, ...payload } = e; this.emit(type, { machine: this, ...payload }); }
    }
    if (this._hub) this._hub.enabled = b.hubExposed();
    this.position.x = b.x; this.position.z = b.z;
    this.heading = b.heading;
    this.sc._speed = b.move === 'lunge' && b.phase === 'strike' ? SICKLE_RULES.lungeLen / SICKLE_RULES.lungeDashS : (this.fightRules.ringSpeed || 0);
    const hostile = this.fightRules.mode !== 'wait';
    if (hostile && this.state !== 'alert') this.setState('alert');
    else if (!hostile && this.state !== 'patrol') this.setState('patrol');
  }

  _stateAttack() {}
  _engageFrame() {}

  takeDamage(hit) {
    const r = super.takeDamage(hit);
    if (r && r.damage > 0) this.fightRules.struck = true;
    return r;
  }
}

export default {
  id: 'sickle',
  /** Size class (lib/sizeclass.js; bible §7.4): footfall weight, the per-class caps and the encounter rule read it. */
  sizeClass: 'medium',
  ...base,
  Cls: Sickle,
};
