/**
 * HOT — the services and player values the machines' per-frame paths read,
 * copied ONCE per frame off the root ctx (instruments-core W0b fix round 2;
 * plan §0 rule 5, the memory rule; gate `A-alloc-machines`).
 *
 * WHY. Optimised code that reads a field of another system's object (the
 * player, the engine, the terrain ...) depends on that object's SHAPE: when the
 * object gains a property or a field generalises (the player's `moveSpeed`
 * going from 0 to 0.37 the first time she is knocked back, her `heading` the
 * first time she turns, `contact` going from null to an object), V8 throws away
 * every optimised function that read it ("dependent prototype chain changed",
 * "wrong map"). Measured on the staged fight (`A-alloc-machines`,
 * R5_IC_SHAPEWATCH + R5_IC_TRACEDEOPT): such a wave at the first knockback and
 * another at the first sprint deoptimised this lane's per-machine functions,
 * which then ran in V8's interpreter / baseline tiers — where every double is a
 * heap allocation — for up to a whole 10 s window (`updateEyesM` 953 KB/s).
 * And a machine's `ctx` is a prototype-chained VIEW of the root ctx
 * (`ai/emit.js` `machineCtx`), so every `machine.ctx.player` load also depended
 * on the root ctx's shape.
 *
 * So the per-machine paths never touch another system's object. `Machines.update`
 * calls `refreshHot(ctx)` first thing every frame: it copies the services
 * (objects, for the few calls that need them) and the PLAYER VALUES the machines
 * read (`ppos`, a Vector3 this module owns, `pHealth`, `pCrouch` ...) into ONE
 * module object whose shape is fixed below and never changes (every double
 * field is born Double). Only `refreshHot` itself — one call per frame — is
 * exposed to the other systems' shape changes.
 *
 * `playerX` / `playerZ` are the player's position BOXED once per frame, on the
 * first frame a machine needs them (`playerBoxes()`): frozen APIs take (x, z)
 * as numbers (`engage.update(dt, x, z)`), and a double handed to a call V8
 * does not inline is boxed at the call — once per machine per frame. The two
 * Tagged fields (`null` first, so V8 never gives them the Double
 * representation) hold one HeapNumber each that every machine passes as-is.
 *
 * Read-only for everyone but `refreshHot` / `playerBoxes`. Not a contract for
 * other lanes (they keep reading `ctx`).
 */
import * as THREE from 'three';

export const HOT = {
  root: null,
  player: null,
  terrain: null,
  nav: null,
  engine: null,
  environment: null,
  collision: null,
  /** Smi frame counter (wraps at 2^30), bumped by every refreshHot */
  frame: 0,
  /** the frame whose player position `playerX` / `playerZ` box */
  boxedFrame: -1,
  playerX: null,
  playerZ: null,
  /** engine.simTime this frame */
  simTime: 0.5,
  /** the player this frame: 1 if there is one */
  pOk: 0,
  /** her position (a Vector3 owned here: a stable shape, copied each frame) */
  ppos: new THREE.Vector3(0.5, 0.5, 0.5),
  /** her health, ground speed, and the crouch / tall-grass flags (Smi 0/1) */
  pHealth: 0.5,
  pMoveSpeed: 0.5,
  pCrouch: 0,
  pTallGrass: 0,
};

/**
 * MUTABLE FROM BIRTH (W0b fix round 3). V8 tracks, per field of a map, whether the field has ever been written
 * with a different value ("const" until then). Optimised code that read a const field depends on it staying
 * const — above all for a module object like `HOT`, whose field loads TurboFan folds to constants — and the
 * FIRST store of a different value throws that code away ("dependent field type constness changed"). `pTallGrass`
 * stayed 0 until her first run through grass and `pCrouch` until her first crouch, so the first sprint deoptimised
 * every machine function that read them (`_sight`: measured 7-14 KB/s in that window, every run). Each field is
 * therefore written with a different value of the same kind and back, once, at construction: no field of the
 * object is const by the time any machine code is optimised, so no first value mid-session can deoptimise it.
 * Numbers keep their representation (an integer is bumped by 1, a double by 0.25); an object or null field takes
 * null / undefined and back (its tracked field type becomes "any" at boot, never mid-session).
 */
export function mutableFromBirth(o) {
  const keys = Object.keys(o);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i], v = o[k];
    if (typeof v === 'number') o[k] = v === Math.trunc(v) && Math.abs(v) < 0x3fffffff ? v + 1 : v + 0.25;
    else if (typeof v === 'boolean') o[k] = !v;
    else if (typeof v === 'string') o[k] = v + '\u0001';
    else if (typeof v === 'function') continue;   // methods copied onto an instance never change
    else o[k] = v === null ? undefined : null;
    o[k] = v;
  }
  return o;
}
mutableFromBirth(HOT);

/** Once per frame, first thing in `Machines.update`: copy the services and the player's values off the root ctx. */
export function refreshHot(ctx) {
  const H = HOT;
  if (H.root !== ctx) H.root = ctx;
  const p = ctx.player || null;
  if (H.player !== p) H.player = p;
  const t = ctx.terrain || null;
  if (H.terrain !== t) H.terrain = t;
  const n = ctx.nav || null;
  if (H.nav !== n) H.nav = n;
  const e = ctx.engine || null;
  if (H.engine !== e) H.engine = e;
  const env = ctx.environment || null;
  if (H.environment !== env) H.environment = env;
  const col = ctx.collision || null;
  if (H.collision !== col) H.collision = col;
  H.frame = (H.frame + 1) & 0x3fffffff;
  if (e) { const st = e.simTime; if (typeof st === 'number') H.simTime = st; }
  if (p && p.position) {
    H.pOk = 1;
    const pp = p.position, q = H.ppos;
    q.x = pp.x; q.y = pp.y; q.z = pp.z;
    const hp = p.health, sp = p.moveSpeed;
    H.pHealth = typeof hp === 'number' ? hp : 0;
    H.pMoveSpeed = typeof sp === 'number' ? sp : 0;
    H.pCrouch = p.crouching ? 1 : 0;
    H.pTallGrass = p.inTallGrass ? 1 : 0;
  } else {
    H.pOk = 0;
  }
}

/**
 * The player's (x, z) as two shared boxes for this frame: call before handing
 * `HOT.playerX` / `HOT.playerZ` to a frozen API. Allocates two HeapNumbers on
 * the first call of a frame and nothing after.
 */
export function playerBoxes() {
  const H = HOT;
  if (H.boxedFrame === H.frame) return;
  H.boxedFrame = H.frame;
  const q = H.ppos;
  H.playerX = q.x;
  H.playerZ = q.z;
}
