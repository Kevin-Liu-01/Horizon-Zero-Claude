/**
 * THE FAUNA SEAM (M3 briefs §3.2 "Fauna"; area H, M3.9). Owner: world, `src/world/fauna/**`. Everyone else only calls:
 * systems (the loot rows), audio (the calls). Instruments NEVER call it: Instruments ignore animals (§3.2), so nothing
 * under src/instruments/ imports this file (tools/gates/instruments/m3/seams.test.mjs checks it).
 *
 * Typed and EMPTY on purpose: committed at M3 wave 2b by area C because its owner was not in the wave, as wave 1's seams
 * were committed on day 0 (empty but typed). No species, no spawn, no mover, nothing loaded: 0 bytes to the first load
 * and nothing in any accepted lens (FA4). Area H fills it in wave 3 beside behaviour (it needs the Malpais ground and the
 * nav grid): five species (BIBLE §3.5: rabbit, giant lizard, gull, shearwater, blind crab, the crab ambient only; the
 * goat built and placed in M4), their regions and densities, the loot (hide, horn, meat, scale, feather), one shared
 * mover on the walk grid, and `scare(point)`.
 *
 * Pure: no THREE, no DOM, so Node reads it.
 */

/**
 * @typedef {'hide'|'horn'|'meat'|'scale'|'feather'} FaunaLoot
 *
 * @typedef {object} Species
 * @property {string} id                 e.g. 'rabbit', 'giant-lizard', 'gull', 'shearwater', 'blind-crab' (BIBLE §3.5)
 * @property {string} name
 * @property {ReadonlyArray<string>} regions   region ids of src/core/regions.js REGIONS
 * @property {number} density            animals per hectare in each of its regions (*)
 * @property {'walk'|'fly'|'ambient'} moves  'ambient': never moves off its spot, never scared (the blind crab)
 * @property {number} triCap             FA1: <= 8,000 triangles
 * @property {ReadonlyArray<string>} clips     walk and idle, or fly and idle
 * @property {ReadonlyArray<FaunaLoot>} loot
 * @property {number} scareM             she startles it within this distance (m) (*)
 *
 * @typedef {object} Spawn
 * @property {string} species
 * @property {string} region
 * @property {number} x
 * @property {number} z
 * @property {number} [hour]             the hour of day it appears (shearwaters over the Pans at dusk)
 *
 * @typedef {object} Animal
 * @property {string} id
 * @property {string} species
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {number} heading            radians
 * @property {'idle'|'walk'|'fly'|'flee'} state
 *
 * @typedef {object} FaunaMover          the one shared mover on the walk grid (FA3: 0 path segments through
 *                                       collision, no animal inside a dwelling ring)
 * @property {ReadonlyArray<Readonly<Animal>>} animals
 * @property {(dt: number) => void} step
 * @property {(regionId: string) => void} enter    spawn a region's animals (on the regions seam's `approach`)
 * @property {(regionId: string) => void} leave    release them (on `depart`)
 */

/** @type {ReadonlyArray<Readonly<Species>>} empty until area H */
export const SPECIES = Object.freeze([]);

/** A region's spawns (empty until area H). @param {string} regionId @returns {ReadonlyArray<Readonly<Spawn>>} */
export const spawnsFor = (regionId) => Object.freeze([]);   // eslint-disable-line no-unused-vars

/** The shared mover (empty: no animals, steps nothing). @type {Readonly<FaunaMover>} */
export const MOVER = Object.freeze({ animals: Object.freeze([]), step() {}, enter() {}, leave() {} });

/**
 * Startle every animal near a point (her footfall, a shot's impact, a Kiln's shell). Returns how many fled (0: there
 * are none yet). Instruments never call it.
 * @param {{ x: number, z: number }} point
 * @param {number} [radiusM]  defaults to each species' own scareM
 * @returns {number}
 */
export function scare(point, radiusM) { return 0; }   // eslint-disable-line no-unused-vars
