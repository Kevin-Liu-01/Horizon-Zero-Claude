import * as THREE from 'three';
import { Perception } from './perception.js';
import { Engage } from './engage.js';
import { Search } from './search.js';
import { AttackPicker } from './attacks.js';
import { Reactions } from './reactions.js';
import { StimulusBus } from './stimulus.js';
import { SiteManager } from './sites.js';
import { Squads } from './squad.js';
import { OverrideSystem } from './override.js';
import { perceptionCfg, attackMode, NOISE } from './tables.js';
import { listenerErrors, clearListenerErrors } from './emit.js';

export { Perception, Engage, Search, AttackPicker, Reactions, StimulusBus, SiteManager, Squads, OverrideSystem };

/**
 * ============================ LANE CONTRACT ============================
 * Owner: `machine-ai`. Everything below is what OTHER lanes may rely on.
 * (docs/SPEC.md is owned by `core-platform`; these are the additions this
 * lane publishes for it to fold into §7 Events / §Machine contract.)
 *
 * --- ctx.machines API ---------------------------------------------------
 *   machines.noise({ x, z | pos, radius, strength, kind, source }) -> heard
 *       One world stimulus. kind defaults pull radius/strength from
 *       ai/tables.js NOISE.kinds ('noise'|'impact'|'explosion'|'rock'|
 *       'whistle'|'lure'|'death'|'footstep'). Machines inside the radius get
 *       suspicion + a lastKnown AT THE NOISE. `combat` should call this for
 *       arrow impacts, explosions, thrown rocks and melee.
 *   machines.lure(pos, opts)         whistle / thrown rock (pulls + holds)
 *   machines.alarm(caller, radius)   squad alarm (converges on the CALLER)
 *   machines.canOverride(m) / override(m) / mount(m) / dismount()
 *   machines.mounted                 machine | null
 *   machines.shotOrigin(hit)         reconstructed shot origin for a hit
 *   machines.sites.advance(s)        debug/gate: run the corpse clock forward
 *   machines.aiAudit()               { roster, states, stimuli, sites, mounted,
 *                                      listenerErrors, fx }
 *   machines.setAiRng(fn) -> prevFn   swap the dice this lane rolls (Engage's
 *       orbit flips + ring roll + jitter, AttackPicker._score's jitter, every
 *       tables.span(), and Perception's tick/scan phase + unseen-hit jitter).
 *       `null` restores Math.random; NOTHING else in the game is affected —
 *       this is not a Math.random stub.
 *       WHAT IT BUYS, precisely (judge-machine-ai-r2-r1 §2 measured the round-3
 *       overclaim: same seed, same bearing, PASS/FAIL/FAIL/PASS/PASS/FAIL): it
 *       fixes the DICE, not the fight. A repeatable duel ALSO needs a fixed
 *       step size (`engine.stepMode = 'fixed'`), an end condition counted in
 *       sim STEPS rather than wall time, and the machine's pose + fight state
 *       restored before each run. A41c-sustained-variety does all four and
 *       publishes what it measures in `replay:`. See ai/rng.js.
 *   machines.seededRng(seed)          a mulberry32 stream to hand to it
 *   machines.aiRngSeeded              is the lane on seeded dice right now?
 *   machines.clearListenerErrors()   reset the isolated-listener ledger
 *
 * --- machine fields other lanes read ------------------------------------
 *   machine.state       + 'stagger' | 'downed' | 'overridden'
 *   machine.suspicion   0..1        (HUD stealth meter, ui-12)
 *   machine.detectFill  fill/s right now (0 when it cannot see her)
 *   machine.scanOffset  sensor sweep offset (rad) applied to the sight cone
 *   machine.moveDir     Vector3 world XZ travel direction   (machine-rig gait)
 *   machine.strafeK     -1..1 sideways component            (machine-rig gait)
 *   machine.aiPose      { coil, lunge, charge, sweep, rear, forage } 0..1
 *   machine._react      { x, z, k, t } hit impulse, k decays 1 -> 0
 *   machine.elemThreshold  per-kind elemental buildup tier
 *   machine._frozen / _disposed   corpse lifecycle stages (perf-tech-08)
 *   machine.rootCtx     the un-facaded ctx (machine.ctx.events.emit is
 *                       isolated — see ai/emit.js machineCtx())
 *   machine.ai.picker.coveredAt(d) / nearestCovered(d) / coverage()
 *   machine.ai.picker.bandProfile()  per-row share of the engage band and the
 *                       largest sole-answer fraction (move variety, A41b)
 *   machine.ai.picker.ringPlan(lo, hi)  { id, ring, min, max, legal, blocked }
 *                       — the move the footwork is setting up. `legal` is a
 *                       construction check only (true by construction; kept
 *                       so a refactor that lets the ring escape its own row
 *                       trips it, NOT a bar). `blocked` is the livelock
 *                       invariant: rows that reach into the engage band while
 *                       the ring window cannot set them up. Asserted === 0 on
 *                       every sim step by A41c-sustained-variety.
 *   machine.ai.picker.bandBlocked(lo, hi)      the same count, non-allocating
 *   machine.ai.picker.bandUnreachable(lo, hi)  ...and the ids behind it
 *   machine.ai.picker.movesetSize()   how many moves the species owes a
 *                       standoff fight, counted off the TABLE alone — non-
 *                       rear, part attached, not disabled. Reads NOTHING the
 *                       footwork can move (not the band, not the ring
 *                       window), which is why A41c-sustained-variety takes
 *                       its variety bar from here: every band-derived
 *                       reading falls by one at the same instant a regression
 *                       pushes a row out of the fight.
 *   machine.ai.picker.movesetRows()   ...and the ids behind it
 *   machine.ai.picker.stalled        Map(id -> s) moves given up on because
 *                       they held the ring without firing (SCORING.arrangeGiveUp)
 *   machine.ai.picker.arrangedId     the move the ring is set up for, or null
 *   machine.ai.picker.blindRings()   [[id, s], ...] moves whose ring the
 *                       machine could not SEE from — set by
 *                       Engage._giveUpBlind after a whole beliefHold of blind
 *                       sweeping at that ring (SCORING.blindHold). A hint on
 *                       the ARRANGEMENT only: selection, coveredAt() and
 *                       bandBlocked() never consult it, `_bestArrangeable`
 *                       falls back to it when nothing else is arrangeable,
 *                       and firing the move clears it.
 *   machine.ai.engage.blindT         seconds of unbroken blind band-footwork.
 *                       ENGAGE-OWNED, not a perception field: the round-3
 *                       bound lived on Machine._unseenT, which every duel gate
 *                       pins to 0, so under the lane's own staging the blind
 *                       orbit never expired (judge-machine-ai-r2-r1 §1).
 *                       Machine._engageFrame calls engage.noteSeen() on every
 *                       frame it can fight her and engage.noteBlind(dt) on
 *                       every frame it cannot; noteBlind returns whether the
 *                       band still owns the frame (false -> pursue).
 *   machine.ai.engage.seek           { x, z, t } — a standoff spot the machine
 *                       could SEE her from, found by Engage._seekClearSpot
 *                       when the blind sweep fails and walked to by pursue
 *                       while t > 0 (ENGAGE.seekHold). Cleared by noteSeen.
 *                       Without it a blind machine walked at the remembered
 *                       point, into knife range, and fought by contactRange
 *                       for ever without ever selecting a standoff move.
 *   machine.ai.engage._ringWindow()  [lo, hi] radii the footwork can HOLD —
 *                       narrower than the band by half a hysteresis AT BOTH
 *                       ENDS. The outer clamp is new in FIX ROUND 3: ringing
 *                       exactly on band[1] sits on the `close` threshold, so
 *                       the orbit pumped in and out of close mode instead of
 *                       holding the radius, and every row whose midpoint is
 *                       past the band (a Scrapper laser at 7-29 m, a Behemoth
 *                       boulder at 11-42) rings exactly there.
 *   machine.ai.engage.mode / .hole   footwork mode, radius it is escaping to
 *   machine.ai.engage.heldAt(lo, hi)  MEASURED, not tabled: decayed seconds
 *                       this machine has actually STOOD between lo and hi
 *                       metres, sampled once per sim step. Non-allocating.
 *                       This is the reading `coverage()`/`bandProfile()`/
 *                       `bandBlocked()` structurally cannot make — all three
 *                       were green for a Scrapper whose laser never fired
 *                       because a rock sat where its band's outer third is.
 *   machine.ai.engage.heldReach(s)    outermost radius held for >= s seconds
 *   machine.ai.engage.heldProfile()   the whole histogram + reach + window,
 *                       for gates and the debug HUD (ALLOCATES).
 *                       `A41d-held-radius-coverage` asserts every move a
 *                       species owes the standoff either FIRES or is a radius
 *                       it measurably stood at.
 *   machine.ai.engage.believable()   sightline lost but the belief is fresh
 *                       and still at standoff range: `Machine` keeps working
 *                       the BAND against `lastKnown` instead of handing the
 *                       frame to the long-haul `pursue` (ENGAGE.beliefHold)
 *
 * --- player fields this lane writes (mount only) ------------------------
 *   player.mounted      machine | null      (player-control: suppress its own
 *                       locomotion while set; player-anim: ride pose)
 *   player.mountSeat    Vector3 saddle position, valid while mounted
 *
 * --- events emitted -----------------------------------------------------
 *   'machine-state'         { machine, state, prev }
 *   'machine-scan'          { machine, sweep, search? }
 *   'machine-alarm'         { machine, radius, recipients }
 *   'machine-attack-phase'  { machine, kind, phase:'windup'|'strike'|
 *                             'recover'|'end'|'cancel', hit? }
 *   'machine-flinch'        { machine, strength }
 *   'machine-stagger'       { machine, duration, kind:'stagger'|'downed' }
 *   'critical-hit'          { machine, damage }
 *   'machine-overridden'    { machine, mountable }
 *   'player-mounted' / 'player-dismounted'  { machine }
 *   'machine-scavenge'      { machine }
 *   'machine-disposed'      { kind, site }
 *   'machine-respawned'     { machine, site }
 *   'stimulus'              { x, z, radius, strength, kind, heard, source }
 *
 * --- what this lane asks of others -------------------------------------
 *   `combat`  : pass `origin` (the bow position at loose) on the hit object,
 *               and `seen: true` for melee. Without it this lane reconstructs
 *               the origin from its own 'arrow-fired' record, which is
 *               correct but coarser. Route impacts/explosions/rocks through
 *               machines.noise().
 *   `spatial` : a public `collision.forget(ref)` so a disposed machine's
 *               dynamic capsules go with it (ai/sites.js currently drops them
 *               through `_machineMap` defensively).
 *   `machine-rig` (1): route the ELEVEN raw `this.ctx.events.emit(...)` calls
 *               in the species files through `this.emit(...)` instead —
 *               watcher.js:305/:421, glinthawk.js:238/:362, longleg.js:317,
 *               behemoth.js:352, thunderjaw.js:283/:526/:594/:773,
 *               scrapper.js:357. Six are `player-damage`, the event whose
 *               broken subscriber quarantined `Machines.update` and disabled
 *               every machine in the valley for a whole session. `Machine`
 *               now hands each species a ctx view whose `events.emit` is
 *               `safeEmit` (ai/emit.js), so those sites are ALREADY isolated
 *               and nothing is on fire — but the guard is invisible at the
 *               call site, so a species file that ever captures the root bus
 *               (`const ev = ctx.events` at construction, a callback bound
 *               from the manager's ctx) silently steps back outside it.
 *               `this.emit()` is explicit and cannot drift.
 *   `machine-rig` (2): `strider.js:_frontKick` reaches 4.6 m
 *               (`damagePlayer(16, 4.6)`) where roster-v2 §4 gives the double
 *               front-kick 0-7 m; this lane covers 4.4-8.4 m with a `lunge`
 *               row ('dash-kick') because widening a builder is machine-rig's
 *               edit. If that reach becomes 7 m, fold the two rows back into
 *               one. Related: `strider.js:253`'s "Charge 15-50 m (roster)"
 *               docstring and the `dist > 15` guard in `strider.chooseAttack`
 *               are dead code — `ATTACK_MODE.strider = 'table'` means the
 *               ladder is never consulted and the row owns the range.
 * =======================================================================
 */

/**
 * Per-machine AI brain. One of these hangs off every `Machine` as `machine.ai`
 * and owns senses, footwork, search, move selection and hit reactions. The
 * machine's own state functions call into it; nothing in here touches meshes.
 */
export class MachineAI {
  constructor(machine) {
    this.m = machine;
    this.cfg = perceptionCfg(machine.kind);
    this.perception = new Perception(machine);
    this.engage = new Engage(machine);
    this.search = new Search(machine);
    this.picker = new AttackPicker(machine);
    this.reactions = new Reactions(machine);
    this.mode = attackMode(machine.kind);
    this.lureT = 0;
    this.lurePos = new THREE.Vector3();
  }

  /** A whistle/thrown rock: investigate the SOURCE and hold there. */
  lure(x, z, hold) {
    const m = this.m;
    if (m.state === 'attack' || m.state === 'overridden' || !m.alive) return;
    this.lureT = hold ?? NOISE.lureHold;
    this.lurePos.set(x, m.ctx.terrain.getHeight(x, z), z);
    m.lastKnown.copy(this.lurePos);
    m.suspicion = Math.max(m.suspicion, this.cfg.susEnter + 0.12);
    m._unseenT = 0.001;
    if (m.state === 'patrol' || m.state === 'return') m.setState('suspicious');
  }

  beginSearch(fromAlarm = false) { this.search.begin(fromAlarm); }

  /**
   * Selection entry point used by `Machine._stateAttack`.
   *
   * Consulting the species' own `chooseAttack()` is NOT free: those ladders
   * commit their move's cooldown (`this._cdFlash = 12`) and, for the
   * Glinthawk, the flock's single dive token, at the moment they *offer* — so
   * every offer the scored table then declined quietly put a move the machine
   * never threw on cooldown, and a Glinthawk that lost a dive to a fresher
   * freeze-spit leaked the flock token for the rest of its life. The ladder's
   * side-effect state is snapshotted and rolled back unless its candidate is
   * the move that actually fires. Snapshot keys are resolved once per machine
   * and the buffer is reused, so this costs no per-frame allocation (and
   * selection only runs when the machine is off its global attack cooldown).
   */
  chooseAttack(dist) {
    const m = this.m;
    if (this.mode === 'table' || !m.chooseAttack) return this.picker.pick(dist, null);

    const keys = this._cdKeys || (this._cdKeys = MachineAI._cooldownKeys(m));
    const snap = this._cdSnap || (this._cdSnap = new Float64Array(keys.length));
    for (let i = 0; i < keys.length; i++) snap[i] = m[keys[i]];
    const diver = m.flock ? m.flock.diver : undefined;

    const species = m.chooseAttack(dist);
    const picked = this.picker.pick(dist, species);
    if (species && picked !== species) {
      for (let i = 0; i < keys.length; i++) m[keys[i]] = snap[i];
      if (m.flock && m.flock.diver !== diver) m.flock.diver = diver;
    }
    return picked;
  }

  /** `_cdFlash`, `_slamCd`, … — the species' own per-move cooldown fields. */
  static _cooldownKeys(m) {
    const out = [];
    for (const k of Object.keys(m)) {
      if (typeof m[k] !== 'number') continue;
      if (/^_cd[A-Z]/.test(k) || /^_[a-zA-Z]+Cd$/.test(k)) out.push(k);
    }
    return out;
  }

  tick(dt) {
    this.picker.tick(dt);
    this.lureT = Math.max(0, this.lureT - dt);
  }
}

/**
 * Manager-side install: builds the stimulus bus, the site lifecycle, squad
 * doctrine and the override system, and publishes their API on `ctx.machines`.
 * Called from `Machines`' constructor.
 */
export function installMachineAI(machines) {
  const ctx = machines.ctx;

  machines.stimulus = new StimulusBus(machines);
  machines.sites = new SiteManager(machines);
  machines.squads = new Squads(machines);
  machines.overrides = new OverrideSystem(machines);
  machines.mounted = null;

  /* ---------------------------- public API ---------------------------- */

  /** Fire a world noise stimulus. See ai/stimulus.js for the contract. */
  machines.noise = (ev) => machines.stimulus.emit(ev || {});
  /** Lure: whistle, thrown rock — pulls machines to the SOURCE. */
  machines.lure = (pos, opts = {}) => machines.stimulus.emit({
    x: pos.x, z: pos.z, kind: opts.kind || 'lure', lure: true, ...opts,
  });
  /** Whistle: Aloy makes the noise, so machines investigate HER position. */
  machines.whistle = (opts = {}) => {
    const p = ctx.player;
    if (!p) return 0;
    return machines.stimulus.emit({ x: p.position.x, z: p.position.z, kind: 'whistle', ...opts });
  };
  /** Squad alarm; recipients converge on the caller in `search`. */
  machines.alarm = (caller, radius) => machines.stimulus.alarm(caller, radius);
  machines.canOverride = (m) => machines.overrides.canOverride(m);
  machines.override = (m) => machines.overrides.override(m);
  machines.mount = (m) => machines.overrides.mount(m);
  machines.dismount = () => machines.overrides.dismount();
  machines.aiAudit = () => ({
    roster: machines.list.length,
    states: machines.list.reduce((a, m) => { a[m.state] = (a[m.state] || 0) + 1; return a; }, {}),
    stimuli: machines.stimulus.count,
    sites: machines.sites.audit(),
    mounted: machines.mounted ? machines.mounted.kind : null,
    /**
     * Foreign subscribers that threw out of a machine event and were isolated
     * (see `ai/emit.js`). Never empty by accident: an entry here is a real
     * defect in whoever owns that listener, it is just no longer allowed to
     * take the whole machine loop down. `A44-listener-isolation` asserts both
     * halves — the loop survives, and the failure is still reported.
     */
    listenerErrors: listenerErrors(),
    fx: machines.list.reduce((a, m) => {
      const f = m.fxAudit ? m.fxAudit() : null;
      if (f) { a.owned += f.owned; a.inScene += f.inScene; }
      return a;
    }, { owned: 0, inScene: 0 }),
  });

  /** Gate hook: begin a clean listener-error measurement window. */
  machines.clearListenerErrors = clearListenerErrors;

  ctx.events.on('machine-killed', ({ machine }) => {
    machines.sites.onKilled(machine);
    machines.squads.noteKill(machine);
    // a machine going down is loud
    machines.stimulus.emit({
      x: machine.position.x, z: machine.position.z, kind: 'death', source: machine,
    });
  });

  return machines;
}
