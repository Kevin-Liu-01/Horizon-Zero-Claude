/**
 * THE NINE WALLS (M2 seam, owner: settlements). Plain frozen data and pure maths, no three: Ninewalls' crescent
 * walls as arcs, and their state. Callers only call:
 *   instruments  the Screed's stall and its cut (`segmentHitsWall`, `setWallCut`)
 *   systems      fail-soft writes `cut`; true ground clears `painted`; the save takes `wallsSave()` ({ get, set })
 *   world        the terrain under the walls (`WALLS`, `OUTER_R`)
 *   sight        the occluder list (`wallOccluders()`)
 *
 * Frame: engine x = E, z = -N (island/sites.js). A bearing is compass degrees (0 north, 90 east); a wall's arc runs
 * clockwise from `from` to `to`.
 *
 * @typedef {'whole' | 'cut'} WallState
 * @typedef {object} Wall
 * @property {string} id         'wall-1' (the outermost, the first the Screed meets) .. 'wall-9' (the innermost)
 * @property {number} order      1..9, the order a Screed coming in from the north-east meets them
 * @property {{x: number, z: number}} c   the arc's centre (engine metres)
 * @property {number} r          the arc's radius to the wall's centreline (m)
 * @property {number} from       the arc's first bearing (deg)
 * @property {number} to         the arc's last bearing (deg), clockwise from `from`
 * @property {number} t          the wall's thickness (m)
 * @property {number} h          the wall's height above its foot, whole (m)
 * @property {number} lineH      the Datum Line's centre above the wall's foot (m); a cut wall stands to the line's top
 * @property {number} lineW      the Datum Line's height (m)
 * @property {boolean} painted0  the line is on this wall at a new game
 *
 * @typedef {object} WallSave   what the save keeps: { cut: string[], painted: string[] }
 */

/** @type {ReadonlyArray<Wall>} */
export const WALLS = Object.freeze([]);

/** The outermost wall's outer face from the centre (m): what the terrain must give room for. */
export const OUTER_R = 0;

/** @param {string} id @returns {Wall | null} */
export function wallById(id) { return WALLS.find((w) => w.id === id) || null; }

/** @param {string} id @returns {{ state: WallState, painted: boolean } | null} */
export function wallState(id) { return null; }

/** @param {string} id */
export function setWallCut(id) {}

/** @param {string} id @param {boolean} on */
export function setPainted(id, on) {}

/** Listen for any wall's state change. @param {(id: string) => void} fn @returns {() => void} unsubscribe */
export function onWallChange(fn) { return () => {}; }

/** The save's pair. @returns {{ get: () => WallSave, set: (v: WallSave) => void }} */
export function wallsSave() { return { get: () => ({ cut: [], painted: [] }), set: () => {} }; }

/**
 * The first wall a straight move from a to b strikes, with a body of half-width `pad` (m): the Screed's charge.
 * @returns {{ id: string, t: number, x: number, z: number } | null}
 */
export function segmentHitsWall(ax, az, bx, bz, pad = 0) { return null; }

/** The nine walls as sight occluders: yaw boxes per segment. @returns {Array<{ id: string, c: number[], half: number[], yaw: number }>} */
export function wallOccluders() { return []; }
