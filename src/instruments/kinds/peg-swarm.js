/**
 * PEG SWARMS (instruments, BUILD M1.4d; BIBLE §7.4 #1 "swarms of 3-6 hammer transect
 * pegs in straight lines between Plumbs ... a swarm reads as a row of walking poles").
 * A helper module of the Peg kind (no default export).
 *
 * A SWARM IS A ROW. Pegs spawned together (within `joinS` s and `joinR` m of the
 * first, as a doctrine site spawns them in one loop) join one swarm of at most `max`.
 * The first one's route gives the swarm its LINE (its first and last waypoints); each
 * member walks that line offset sideways by its slot (0, +1, -1, +2, -2, +3) x `gap`,
 * so the swarm walks abreast, a row of poles, and lays parallel transects `gap` apart,
 * each cutting its own lane. A Peg spawned alone (the frame stager, a respawn) is a
 * swarm of one and keeps its own route.
 *
 *   joinSwarm(peg)                         the Peg's constructor
 *   leaveSwarm(peg)                        its dispose
 *   spawnSwarm(machines, x, z, n, opts)    a whole swarm on one line centred on (x, z):
 *                                          opts { bearing (rad, the line's direction), length (m) }
 *   swarmsOf(machines) -> [{ id, members, line, anchor }]
 *
 * Cold path only (spawn and dispose).
 */
import * as THREE from 'three';

export const SWARM = Object.freeze({ min: 3, max: 6, gap: 3.0, joinR: 25, joinS: 1.0 });

let _id = 0;

export function swarmsOf(machines) {
  if (!machines) return [];
  if (!machines.pegSwarms) machines.pegSwarms = [];
  return machines.pegSwarms;
}

const slotOf = (k) => (k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2));
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** The route for slot `slot` of a swarm whose line is [A, B] (objects with x, z): two Vector3 waypoints. */
function slotRoute(line, slot) {
  const [A, B] = line;
  const ex = B.x - A.x, ez = B.z - A.z, l = Math.hypot(ex, ez) || 1;
  const nx = -ez / l, nz = ex / l, o = slot * SWARM.gap;
  const mk = (x, z) => new THREE.Vector3(x, 0, z);
  return [mk(A.x + nx * o, A.z + nz * o), mk(B.x + nx * o, B.z + nz * o)];
}

/** Join (or found) the swarm this Peg was spawned with; re-route it onto its slot of the swarm's line. */
export function joinSwarm(peg) {
  const list = swarmsOf(peg.manager);
  const sx = peg.position.x, sz = peg.position.z, t = now();
  for (let i = list.length - 1; i >= 0; i--) if (!list[i].members.length) list.splice(i, 1);
  let s = null;
  for (const q of list) {
    if (q.members.length >= SWARM.max || t - q.born > SWARM.joinS * 1000) continue;
    if (Math.hypot(q.anchor.x - sx, q.anchor.z - sz) <= SWARM.joinR) { s = q; break; }
  }
  if (!s) {
    const r = Array.isArray(peg.route) ? peg.route : null;
    const line = r && r.length >= 2 ? [{ x: r[0].x, z: r[0].z }, { x: r[r.length - 1].x, z: r[r.length - 1].z }] : null;
    s = { id: ++_id, anchor: { x: sx, z: sz }, line, born: t, members: [] };
    list.push(s);
  }
  const slot = slotOf(s.members.length);
  s.members.push(peg);
  peg.swarm = s;
  peg.swarmSlot = slot;
  if (s.line && slot !== 0 && Array.isArray(peg.route) && peg.route.length) {
    peg.route = slotRoute(s.line, slot);
    peg._wpIndex = 0;
  }
  return s;
}

export function leaveSwarm(peg) {
  const s = peg.swarm;
  if (!s) return;
  const i = s.members.indexOf(peg);
  if (i >= 0) s.members.splice(i, 1);
  peg.swarm = null;
  if (!s.members.length) {
    const list = swarmsOf(peg.manager), k = list.indexOf(s);
    if (k >= 0) list.splice(k, 1);
  }
}

/** Spawn a swarm of n (clamped 3-6) on one line `length` m long through (x, z), heading `bearing`. */
export function spawnSwarm(machines, x, z, n, { bearing = 0, length = 24 } = {}) {
  const k = Math.max(SWARM.min, Math.min(SWARM.max, n | 0));
  const ax = Math.sin(bearing), az = Math.cos(bearing);
  const line = [{ x: x - ax * length / 2, z: z - az * length / 2 }, { x: x + ax * length / 2, z: z + az * length / 2 }];
  const out = [];
  for (let i = 0; i < k; i++) {
    const r = slotRoute(line, slotOf(i));
    const m = machines.spawn('peg', r[0].x, r[0].z, { route: slotRoute(line, 0), heading: bearing });
    if (m) out.push(m);
  }
  return out;
}
