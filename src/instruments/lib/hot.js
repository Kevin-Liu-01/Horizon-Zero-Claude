/**
 * HOT — the services the machines' per-frame paths read, copied ONCE per frame
 * off the root ctx (instruments-core W0b fix round 2; plan §0 rule 5, the memory
 * rule; gate `A-alloc-machines`).
 *
 * WHY NOT `machine.ctx.player`. A machine's `ctx` is a prototype-chained VIEW of
 * the root ctx (`ai/emit.js` `machineCtx`), which makes the root ctx a PROTOTYPE
 * object, and other lanes install and re-assign fields on it after boot. V8
 * treats any change to a prototype object as a change to every prototype chain
 * through it: each one marks EVERY optimised function whose loads go through the
 * view for deoptimisation ("dependent prototype chain changed"), and the code
 * that holds the root ctx itself (perception, the lamp system) takes "wrong
 * map" deopts the same way. A deoptimised per-machine function then runs in
 * V8's interpreter / baseline tiers until it is re-optimised — and there every
 * double is a heap allocation: the W0b judge measured `updateEyesM` at
 * 775–887 KB/s and `Machines._stepMachines` at 443–461 KB/s in such windows,
 * after a 30 s warm-up.
 *
 * So the hot paths never load through ctx. `Machines.update` calls
 * `refreshHot(ctx)` first thing every frame, and the hot paths read `HOT.player`,
 * `HOT.terrain` ...: ONE module object whose shape is fixed here and never
 * changes, and whose fields are re-written only when the root ctx's field
 * actually changed identity (a late-installed `nav`, a new player).
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
};

/** Once per frame, first thing in `Machines.update`: copy the services off the root ctx. */
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
  const p = H.player;
  if (!p) { H.playerX = 0; H.playerZ = 0; return; }
  H.playerX = p.position.x;
  H.playerZ = p.position.z;
}
