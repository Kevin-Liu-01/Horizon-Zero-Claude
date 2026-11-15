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
 */
export const SOCKETS = Object.freeze({
  bow: Object.freeze({
    /** the riser, where the fist holds it carried and aimed */
    grip: Object.freeze({ p: [0, 0, 0], axis: [0, 1, 0] }),
    /** the lower limb just under the riser's wrap: on her back it crosses waist height behind her left hip */
    limb: Object.freeze({ p: [-0.0077, -0.185, -0.0144], axis: [0, 1, 0] }),
    /** the palm centre from the socket, mesh space (combat's carry hold) */
    palm: Object.freeze([0.0218, 0.0026, -0.035]),
    /** the keeper: the stowed bow leaves it sliding DOWN its own limb (-Y) */
    keeperAxis: Object.freeze([0, -1, 0]),
    /** the top tip (the far end the ownership rows follow) */
    tip: Object.freeze([0, 0.7421, -0.1239]),
  }),
  lance: Object.freeze({
    /** the left hand's take on the stowed haft, 0.42 m up from the butt cap (meleeLayer LC_S) */
    butt: Object.freeze({ p: [0, 0.42, 0], axis: [0, 1, 0] }),
    /** the right fist's grip (the GLB's own `grip` node, gripFrac 0.2) */
    grip: Object.freeze({ p: [0, 0.31, 0], axis: [0, 1, 0] }),
    /** the off hand in the guard (the GLB's `grip2`) */
    fore: Object.freeze({ p: [0, 0.8525, 0], axis: [0, 1, 0] }),
    /** the keeper: the stowed lance leaves it butt first, DOWN its own axis (-Y) */
    keeperAxis: Object.freeze([0, -1, 0]),
    tip: Object.freeze([0, 1.55, 0]),
  }),
});
