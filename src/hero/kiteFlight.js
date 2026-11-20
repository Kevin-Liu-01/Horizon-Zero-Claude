/**
 * M3 area B (M3.1), wave 3: FLIGHT ON THE PAGE. The Survey Kite flown by input: Space again once she has been airborne
 * 0.35 s with 3 m of clearance opens it (BIBLE §12), A and D bank it, C or Ctrl folds it, and it lands itself when her
 * feet reach the ground. The flight law (src/game/kite/flight.js, the one the Node rows step) moves her; the clips
 * (src/entities/anim/kite/kiteClips.js, through animator.setKiteFlight) pose her and the kite from the law's own state and
 * clock; the Survey Kite's mesh (src/entities/anim/kite/surveyKite.js) is placed from the hang's solve every frame, and
 * furled on its mount at the small of her back the rest of the time (once she owns it).
 *
 *   installKiteFlight(player)   -> the pilot (player.kitePilot); called once from the player's constructor
 *   pilot.onSpace()             player.jump()'s first ask: true when Space opened the kite (or she is flying), so the
 *                               press is spent here
 *   pilot.step(dt, t, realDt)   the player's update while `player.flight !== 'none'` (instead of her locomotion): the
 *                               law's step, her place and facing from it, her lens, her animator and her rig
 *   pilot.owned / give()        whether she carries the kite (the quest's reward gives it; `?kite` on the URL for a lane
 *                               film); nothing opens and no roll is drawn until then
 *   pilot.last                  the last open's and landing's numbers (the rows on the page read them)
 *
 * Publishes the lift seam where the runner and other lanes look for it: `ctx.lift = { liftAt }` (area A's field,
 * src/world/island/lift.js, through the kite's seam src/game/kite/lift.js). Events: 'kite:open' { from, x, y, z, clearM,
 * airborneS } and 'kite:land' { x, z, vs, damage, field, refusedWater, from, seconds } (the quest's beats wait on them),
 * 'kite:refused' { why, note } (a field note in the bible's words when the weather grounds it).
 *
 * Kevin's bars hold through the clips (Node: tools/gates/kite/clip-bench.mjs; page: tools/gates/kite/flight-page.mjs).
 * KF8: while `flight` is not 'none' no aim is held and no roll or crouch answers (weaponVerbsAllowed is false).
 */
import * as THREE from 'three';
import { KITE, canOpen, openAt, stepFlight, createFlightBody, weaponVerbsAllowed } from '../game/kite/flight.js';
import { setLiftSource, liftAt as seamLiftAt } from '../game/kite/lift.js';
import { TEST_FLIGHT } from '../game/kite/roads.js';
import { liftAt as islandLiftAt } from '../world/island/lift.js';
import { SEA_LEVEL, GLASS_LEVEL } from '../world/island/recipe.js';
import { TRIG } from '../world/island/sites.js';
import { buildSurveyKite, placeKite } from '../entities/anim/kite/surveyKite.js';
import { kiteClipPose, createKitePose } from '../entities/anim/kite/kiteClips.js';

const WATER_LEVEL = Math.max(SEA_LEVEL, GLASS_LEVEL);
/** m: an open within this of a trig pillar's centre is "from" it (the quest's 'launch' beat: T1's top) */
const FROM_TRIG_M = 8;
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _bar = new THREE.Vector3(0, 1.33, 0.5);

export function installKiteFlight(player) {
  const ctx = player.ctx;
  // the lift seam: area A's field behind the kite's seam (the page's binding; Node steps area A's function directly)
  setLiftSource((x, y, z) => islandLiftAt(x, y, z));
  if (!ctx.lift) ctx.lift = { liftAt: seamLiftAt };

  const terrainY = (x, z) => ctx.terrain.getHeight(x, z);
  /** the world the law reads: the page's own ground and weather */
  const world = {
    windAt: (x, z, out) => (ctx.environment?.windAt ? ctx.environment.windAt(x, z, out) : (out.x = 0, out.z = 0, 0)),
    liftAt: (x, y, z) => seamLiftAt(x, y, z),
    groundAt: (x, z) => terrainY(x, z),
    waterDepthAt: (x, z) => Math.max(0, WATER_LEVEL - terrainY(x, z)),
    flyable: () => (typeof ctx.environment?.flyable === 'function' ? ctx.environment.flyable() : true),
  };

  const pilot = {
    f: createFlightBody(),
    world,
    owned: !!ctx.params?.has?.('kite'),
    /** this pilot opened the flight now running (a row that sets player.flight itself, tools/perf/region-hitch.mjs, is
     *  not flown by the law) */
    active: false,
    K: null,
    bank: 0,
    foldAsked: false,
    from: null,
    t0: 0,
    last: { open: null, land: null, refused: null },
    pose: createKitePose(),
    give() { this.owned = true; return true; },

    /** the mesh, built on first need (0 bytes shipped: built from code) */
    _kite() {
      if (this.K) return this.K;
      const K = buildSurveyKite({ furl: 0 });
      K.mesh.frustumCulled = false;
      const root = player.animator?.space?.root || player.model;
      root.add(K.group);
      this.K = K;
      return K;
    },

    /** Space while airborne (player.jump's first ask). True when the press is spent here. */
    onSpace() {
      if (player.flight !== 'none') return this.active;
      if (!this.owned || player.grounded || player._ride || player.mantling) return false;
      const gy = terrainY(player.position.x, player.position.z);
      const w = ctx.environment;
      const q = canOpen({ airborneS: player.airTime, clearM: player.position.y - gy, weather: w?.weather ?? 'trade', w: w?.w ?? null, state: player.flight });
      if (!q.ok) {
        this.last.refused = { why: q.why, note: q.note ?? null, airborneS: +player.airTime.toFixed(3), clearM: +(player.position.y - gy).toFixed(2) };
        if (q.why === 'weather') { ctx.events?.emit?.('kite:refused', { why: q.why, note: q.note }); ctx.progression?.toast?.(q.note); return true; }
        return false;   // too soon or too low: the press does nothing (a buffered jump never fires in the air)
      }
      // her bearing: where she is going if she is moving, else where she faces (flight.js: dir = (sin b, -cos b))
      const vx = player.velocity.x, vz = player.velocity.z, sp = Math.hypot(vx, vz);
      const dx = sp > 1 ? vx / sp : Math.sin(player.heading), dz = sp > 1 ? vz / sp : Math.cos(player.heading);
      const bearing = ((Math.atan2(dx, -dz) * 180 / Math.PI) % 360 + 360) % 360;
      const f = this.f, p = player.position;
      player.flight = openAt(f, { x: p.x, y: p.y, z: p.z, headingDeg: bearing, groundY: gy });
      this.active = true;
      let from = null;
      for (const T of TRIG) if (Math.hypot(T.x - p.x, T.z - p.z) <= FROM_TRIG_M) from = T.id;
      this.from = from; this.t0 = ctx.engine?.simTime ?? 0; this.bank = 0; this.foldAsked = false;
      this.last.open = { from, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), clearM: +(p.y - gy).toFixed(2), airborneS: +player.airTime.toFixed(3), bearing: +bearing.toFixed(1) };
      this.last.land = null;
      this._kite().group.visible = true;
      // KF8: nothing of a weapon answers in the air
      player.aiming = false; player.sprinting = false;
      ctx.events?.emit?.('kite:open', { ...this.last.open });
      return true;
    },

    /** The player's update while flying. */
    step(dt, t, realDt) {
      const f = this.f, input = ctx.input, prev = player.flight;
      // the bar: A left, D right (a pad's stick through the move axis when there is one)
      const kb = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
      const mv = typeof input.moveAxis === 'function' ? input.moveAxis() : null;
      const want = kb || (mv && Math.abs(mv.x) > 0.2 ? Math.sign(mv.x) * Math.min(1, Math.abs(mv.x)) : 0);
      // (the bar rolls in over 0.25 s, not a step: the clip's bank follows it)
      this.bank += Math.max(-dt * 4, Math.min(dt * 4, want - this.bank));
      const fold = this.foldAsked; this.foldAsked = false;
      const next = dt > 0 ? stepFlight(prev, f, { bank: this.bank, fold }, world, dt) : prev;
      player.position.set(f.x, f.y, f.z);
      player.velocity.set(f.vx, f.vy, f.vz);
      player._prevPos?.copy?.(player.position);
      player.heading = Math.PI - f.heading;
      player.grounded = false; player.moveSpeed = 0; player.airTime += dt;
      // KF8: no weapon verb, no roll, no crouch while the kite is out
      if (!weaponVerbsAllowed(next)) { player.aiming = false; player.sprinting = false; player.dodging = false; player._dodgeQueued = -1; if (player.crouching) player.setCrouch(false); }
      if (prev !== 'landing' && next === 'landing') {
        const field = Math.hypot(f.x - TEST_FLIGHT.field.x, f.z - TEST_FLIGHT.field.z) <= TEST_FLIGHT.field.r;
        this.last.land = { x: +f.x.toFixed(2), z: +f.z.toFixed(2), vs: +f.landVs.toFixed(2), damage: +f.landDamage.toFixed(1), field, refusedWater: f.refusedWater, from: this.from,
          seconds: +(((ctx.engine?.simTime ?? 0) - this.t0)).toFixed(2), hpBefore: Math.round(player.health) };
        if (f.landDamage > 0) player.takeDamage(f.landDamage, 'fall');
        ctx.events?.emit?.('player-land', { fall: 0, vy: -f.landVs, hard: f.landDamage > 0 });
        ctx.events?.emit?.('kite:land', { ...this.last.land });
      }
      if (next === 'none') {
        const gy = player._sampleGround ? player._sampleGround(f.x, f.z, f.y) : terrainY(f.x, f.z);
        if (prev === 'landing' || f.y - gy < 0.05) {
          player.position.y = gy; player.grounded = true; player.velocity.set(0, 0, 0); player.airTime = 0;
        } else {
          // folded in the air: the page's gravity takes her from here (the fall rule judges the drop)
          player.grounded = false; player.velocity.y = f.vy; player.airTime = 0; player._fallPeak = f.y; player._launchY = f.y;
        }
      }
      player.flight = next;
      if (next === 'none') this.active = false;
      player.animator.setKiteFlight(next, f.t, { bank: this.bank, forced: !!f.forced });
      player.model.position.copy(player.position);
      player.model.rotation.y = player.heading;
      player._updateCamera(realDt, t);
      player.animator.update(dt, t);
      player.hero?.update(dt);
    },

    /** after every animator update (flying or not): the kite placed from the hang's solve, or furled on its mount */
    _afterAnim() {
      if (!this.owned) { if (this.K) this.K.group.visible = false; return; }
      const K = this._kite(), an = player.animator, root = an.space?.root || player.model;
      K.group.visible = true;
      const flying = an._kiteFl && an._kiteFl.state !== 'none';
      const info = flying ? an.hangPoseInfo?.() : null;
      if (info) { placeKite(K, root, info); return; }
      // stowed: on the mount, which rides her back (spine_02's live place: kiteClips.js BACK_REF)
      const b = an.b;
      if (!b?.spine2) return;
      const back = this._back || (this._back = { p: new THREE.Vector3(), q: new THREE.Quaternion() });
      an._charOf(b.spine2.bone, back.p); an._liveW(b.spine2.bone, back.q);
      const o = kiteClipPose('none', 0, { back }, _bar, this.pose);
      const I = this._stowInfo || (this._stowInfo = { kite: { pos: [0, 0, 0], quat: [0, 0, 0, 1], furl: 0 } });
      o.pos.toArray(I.kite.pos); o.quat.toArray(I.kite.quat); I.kite.furl = 0;
      placeKite(K, root, I);
    },
  };
  // C or Ctrl folds it (the player's own crouch and roll binds are spent harmlessly in the air: step clears them)
  const askFold = () => { if (player.flight === 'gliding') pilot.foldAsked = true; };
  ctx.input?.onDown?.('KeyC', askFold);
  ctx.input?.onDown?.('ControlLeft', askFold);
  // the quest's reward gives the kite
  ctx.events?.on?.('quest-rewarded', (e) => { if (e?.item === 'survey-kite' || e?.reward?.item === 'survey-kite') pilot.give(); });
  ctx.events?.on?.('kite-given', () => pilot.give());
  // the kite follows every pose of her (the animator's update is wrapped once: her flight, her walk, a ride, a staging)
  const an = player.animator;
  if (an && !an._kiteWrapped) {
    const u0 = an.update.bind(an);
    an.update = (dt, t) => { const r = u0(dt, t); try { pilot._afterAnim(); } catch (e) { /* the kite never stops her frame */ } return r; };
    an._kiteWrapped = true;
  }
  player.flight = 'none';
  player.kite = pilot.f;
  return pilot;
}
