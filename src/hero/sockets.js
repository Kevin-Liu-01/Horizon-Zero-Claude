/**
 * WEAPON SOCKETS (M1a, the weapons brief step 1, ruling 10): where a hand holds each weapon, as data in the PROP'S OWN
 * mesh space (`public/models/armory/bow-sabina.glb`: the stave along +Y, the arrow along +Z, the riser's belly at the
 * origin; `lance-shepherd.glb`: the haft along +Y from the butt cap at 0). No weapon GLB is rebuilt for them;
 * `tools/gates/hero-sweep/sockets-check.mjs` checks each against the built mesh in Node (within 2 mm of the haft's axis
 * or the limb's centreline).
 *
 * A socket is `p` (the point on the centreline the palm closes round) and `axis` (the centreline's direction there,
 * which the hand's grip axis, pinky to index, lies along). `palm` is the palm centre's offset from `p` as the held bow
 * sits in combat's carry (combat.js `_placeInHand`: the group at the palm, the model 0.1 m under it, canted 0.22 rad,
 * the mesh at its grip offsets), so the take on the limb and the carry hold the stave the same way in the fist.
 * `r` (M1a weapons fix 1) is the surface's radius there, read off the built mesh by `sockets-check.mjs` (W1's
 * fingertip clause: a closed finger lies on the surface, none inside it).
 */
export const SOCKETS = Object.freeze({
  bow: Object.freeze({
    /** the riser, where the fist holds it carried and aimed */
    grip: Object.freeze({ p: [0, 0, 0], axis: [0, 1, 0], r: 0.0196 }),
    /** the lower limb just under the riser's wrap (0.13 m below the grip: her palm reaches it on her back at 0.025 m inside the arm's reach; at 0.185 m it was at its limit): on her back it is at waist height behind her spine */
    limb: Object.freeze({ p: [-0.0022, -0.085, -0.0046], axis: [0, 1, 0], r: 0.0177,
      /** M1a weapons round 2: the palm's side of the limb at the take (mesh; from the socket, square to the stave): the
       *  side the left fist closes on the stowed bow from with the straightest wrist her reach round the hip allows
       *  (the index toward the top limb), read off the dressed bench at the take: 49 deg round the stave from the grip's.
       *  The fist turns round the stave from this side to the grip's as the limb runs through it (the regrip) */
      palm: Object.freeze([-0.0124, 0.0026, -0.0392]) }),
    /** the palm centre from the socket, mesh space (combat's carry hold) */
    palm: Object.freeze([0.0218, 0.0026, -0.035]),
    /** the keeper: the stowed bow leaves it sliding DOWN its own limb (-Y) */
    keeperAxis: Object.freeze([0, -1, 0]),
    /** the top tip (the far end the ownership rows follow) */
    tip: Object.freeze([0, 0.7421, -0.1239]),
  }),
  lance: Object.freeze({
    /** the left hand's take on the stowed haft (meleeLayer LC_S). M1a weapons round 2: 0.42 -> 0.50 m up from the butt
     *  cap. Stowed, 0.42 lay 0.49 m from her left shoulder against an arm of 0.47 m (the fist stopped 0.05-0.08 m short
     *  of it, W1); 0.50 is 0.45 m off, below the shoulder blade at belt height, with room for the keeper slide */
    butt: Object.freeze({ p: [0, 0.50, 0], axis: [0, 1, 0], r: 0.0142 }),
    /** the right fist's grip (the GLB's own `grip` node, gripFrac 0.2) */
    grip: Object.freeze({ p: [0, 0.31, 0], axis: [0, 1, 0], r: 0.0173 }),
    /** the off hand in the guard (the GLB's `grip2`) */
    fore: Object.freeze({ p: [0, 0.8525, 0], axis: [0, 1, 0], r: 0.0162 }),
    /** the keeper: the stowed lance leaves it butt first, DOWN its own axis (-Y) */
    keeperAxis: Object.freeze([0, -1, 0]),
    tip: Object.freeze([0, 1.55, 0]),
  }),
  /**
   * M3 (brief §3.2, "Props in the hands"): THE KITE'S BAR, the `kiteBar` slot (area B: the kite's rows in this file).
   * Mesh space is the Survey Kite's (src/entities/anim/kite/surveyKite.js: the origin the bar's centre, +x along the bar,
   * her left). Each hand's socket is the middle of its leather grip (KITE_RECIPE.grip 0.22 m from the centre, gripLen
   * 0.12, radius barR x 1.35); furled, the roll lies along the bar, so the same sockets hold the roll (0.97 of the span).
   * The keeper is the survey case's lower flap (the roll leaves it down its own axis). The open and the fold run on the
   * hang layer (anim/kite/kiteClips.js) and place the PALM on these sockets; they enter `handling.js`'s tables only once
   * D3 closes (the M3 brief). tools/gates/kite/flight-law.test.mjs checks these against the built mesh.
   */
  kiteBar: Object.freeze({
    gripL: Object.freeze({ p: [0.22, 0, 0], axis: [1, 0, 0], r: 0.023, len: 0.12 }),
    gripR: Object.freeze({ p: [-0.22, 0, 0], axis: [1, 0, 0], r: 0.023, len: 0.12 }),
    /** furled: the sockets' share of the open span (kiteClips.js gripOf) */
    furledK: 0.97,
    /** the keeper: the furled roll leaves the case's lower flap down its own axis (its -x end first, her right) */
    keeperAxis: Object.freeze([-1, 0, 0]),
  }),
  /**
   * M3 (brief §3.2, "Props in the hands"): THE HAND NET, the `heldNet` slot. Typed and EMPTY on purpose: committed at
   * M3 wave 2b by area C as the smallest change in hero-anim's file (the seam's owner was not in the wave), as wave 1's
   * seams were committed (empty but typed). Its sockets are hero-anim's and area D's to fill, in the mesh space of the
   * net's own GLB (tools/build/recipes/weapons/net-hand.mjs, not built), and the net enters `handling.js` only once D3
   * closes (the M3 brief: no new hand prop until the gaff in the loop reads 0 and A100-A106 pass on the page). Callers
   * (combat's cast, armory's lumbar stow) read `SOCKETS.heldNet.grip` and must treat its absence as "not built".
   * @type {Readonly<{
   *   grip?: Readonly<{ p: number[], axis: number[], r: number }>,   // the right fist on the bundle's throat
   *   spin?: Readonly<{ p: number[], axis: number[], r: number }>,   // where the spin is taken (hip height, NT1's bars)
   *   keeperAxis?: Readonly<number[]>,                               // the lumbar stow (BIBLE §5.2): the bundle leaves along it
   * }>}
   */
  heldNet: Object.freeze({}),
});
