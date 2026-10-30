import * as THREE from 'three';
import { VFX_COLORS } from '../../instruments/lib/vfx.js';
import { Strider } from './strider.js';
import { Scrapper } from './scrapper.js';
import { Glinthawk } from './glinthawk.js';
import { Longleg } from './longleg.js';
import { Broadhead } from './broadhead.js';
import { Grazer } from './grazer.js';
import { Snapmaw } from './snapmaw.js';
import { Ravager } from './ravager.js';
import { ShellWalker } from './shellwalker.js';
import { Corruptor } from './corruptor.js';
import { Stormbird } from './stormbird.js';
import { EXPANSION_RIGS } from './rig/rigs-expansion.js';
import { cannonMesh, cargoMesh, coreMesh, powerCellMesh, canisterMesh } from './parts.js';
import { registerRig } from './autorig.js';
import { registerKindTables } from './ai/tables.js';
import { registerDoctrine, rebandMachine } from './ai/doctrine.js';
import { loadKindModels, MACHINE_SHADOWS } from './variety-assets.js';
import { Assets } from '../../core/assets.js';
import { _st, moveTowardS } from './machine.js';

/**
 * ===================== LEGACY KINDS — the whole of them =====================
 *
 * Round 5, instruments-core W0a (plan §1.2 "legacy collapse", §6, R28, R30).
 *
 * Every machine kind that predates CALIMA lives in THIS file and nowhere else:
 * its class import, its asset row, its style row, its AI table rows, its rig
 * row, its doctrine (stat block, chassis, components, herd/basking/convoy,
 * re-band, spawn plan) and its authored roster. Kept code (`index.js`,
 * `ai/tables.js`, `ai/doctrine.js`, `autorig.js`, `variety-assets.js`) carries
 * no legacy row; it exposes registration hooks and this file calls them.
 *
 * The contract this collapse buys (`A-legacy-collapse`, `A-legacy-gone`):
 *   - a legacy kind is reachable ONLY through this file (0 imports of a legacy
 *     species module anywhere else);
 *   - deleting one row below plus its species file and model boots clean
 *     (`A1`, `A20b`) with 0 other edits;
 *   - instruments-b deletes this file, `rig/shells-expansion.js`,
 *     `rig/rigs-expansion.js` and the species files at the W2 exit and nothing
 *     else has to change: `index.js` reaches this module through a guarded
 *     `import.meta.glob('./legacy.js')`, so its absence boots clean (as does
 *     an emptied `LEGACY`).
 *
 * LEGACY KINDS ARE NEVER MAPPED TO A ROLE (R28): `src/instruments/roles.js`
 * maps roles only from `src/instruments/kinds/*`. They keep running so a
 * legacy breakage still fails `A1` / `A20b`.
 *
 * DELETED, not moved (R30, plan §6): the HZD-IP and CC-BY-NC kinds — Watcher,
 * Sawtooth, Behemoth, Thunderjaw and the Redeye Watcher variant — with their
 * classes, rig rows, shells, table rows and roster; the Tallneck kind (its
 * only body was the Behemoth chassis) and the Corruptor's corruption cascade
 * (R17). The Corruptor body stays a plain legacy hostile until W2.
 *
 * ROW SHAPE (one entry per kind in `LEGACY`):
 *   Cls          the species class
 *   spec         asset row { url, targetHeight, yaw }. For a 'boot' kind it is
 *                published in `BOOT_SPECS` and loaded by the boot loader
 *                (`assets.loadAll`) before `Machines` is built; for a
 *                'loaded' kind it is published in `LEGACY_SPECS` (deferred)
 *                and `installLegacy` loads it with `loadKindModels`. Either
 *                way the entry is styled here exactly once.
 *   style        `styleMachine` row (variety-assets.js)
 *   bake         freeze the donor's skin before auto-rigging
 *   registerAt   'boot'   — a BOOT KIND (the Round 3 kinds): model loaded at
 *                           boot, class registered at install, authored
 *                           roster spawned inside the `Machines` constructor,
 *                           so it exists at `__READY__` (see BOOT_SPECS)
 *                'loaded' — deferred: class retires its chassis once the
 *                           model loads; spawned by its doctrine rows
 *   rig          `autorig.RIGS[kind]` row
 *   tables       `registerKindTables(kind, …)` rows
 *   doctrine     `registerDoctrine(kind, …)` row (Round 4 kinds)
 *   roster(M)    the authored boot spawns (Round 3 kinds)
 */
export const LEGACY = {
  strider: {
    Cls: Strider,
    spec: { url: '/models/strider.glb', targetHeight: 2.0, yaw: 0 },
    style: {},   // no reliable eye material — the species file adds a lens part
    registerAt: 'boot',
    tables: {
      perception: { gain: 2.15, periphRange: 9, scanSweep: 1.0, scanPeriod: 5.0, contactRange: 4.4 },
      /**
       * band 10-22 -> 4.2-14 (judge-machine-ai-followup-r0 §2). The old band sat
       * entirely ABOVE both kicks, so `_pickRing` could never park the Strider at
       * kick range and `charge` was the only row `coveredAt()` could satisfy
       * anywhere inside it — the dead zone was closed by making one move do
       * everything, which is `machine-ai-08` ("fixed attack ladder") again at the
       * other end of the range. The inner edge is now just below the front kick's
       * 4.4 m row so the footwork can set the kick up, and the outer edge is 14 m
       * so no single row owns more than 60 % of the band alone
       * (`A41b-attack-coverage` gates both).
       */
      engage: { archetype: 'skittish', band: [3.8, 14], orbitSpeed: 0.8, backSpeed: 0.9 },
      /**
       * THE DEAD ZONE, fixed TWICE.
       *
       * Round 4 wave 1 closed the original 4.2-15 m hole by widening `charge` down
       * to 4.2 m. That removed the hole and created a worse one: with the engage
       * band at 10-22 m and both kicks capped at 4.4 m, `charge` became the ONLY
       * row legal anywhere the footwork ever stood, so the species had a single
       * move — and a gallop the roster puts at 15-50 m was being thrown from 5.5 m
       * (measured: front-kick at 2 m, charge at every other staging).
       *
       * The band now covers kick range (ENGAGE.strider above) and the ladder has a
       * middle rung, so each range has a DIFFERENT answer:
       *
       *   0   - 4.6 m   front-kick  the authored double front-kick, reach 4.6 m
       *   0   - 4.4 m   back-kick   authored, rear arc only (never arranged for)
       *   4.0 - 8.4 m   dash-kick   skitter in and land the same double kick
       *   8.2 - 30  m   charge      the committed gallop, back at gallop distance
       *
       * FIX ROUND 2 (judge-machine-ai-followup-r1): `front-kick`'s row max was
       * 4.4 m — a tenth of a metre INSIDE the smallest ring the footwork can hold
       * (band[0] 4.2 + half a hysteresis = 4.5 m). The kick was therefore the move
       * the picker arranged for on every flip and the one move that could never
       * fire, so the Strider held 4.5 m for a whole fight and threw `dash-kick`
       * seven times: the dead zone back for a third time, wearing the ring instead
       * of the range. The row now reads 4.6 m, which is what the builder actually
       * strikes with (`strider.js:_frontKick` -> `damagePlayer(16, 4.6)`), so it
       * is honest AND clears the ring floor. The livelock itself is closed
       * structurally in `AttackPicker._reachable` / `Engage._ringWindow` — this
       * row is data being truthful, not the fix.
       *
       * `dash-kick` is the canon "Double front-kick 0-7 m" (roster-v2 §4) with the
       * approach the authored version does not have: `lunge` dashes 4.2 m through
       * the strike phase and rolls its 4.6 m front-arc damage check every frame of
       * it, so from the row's own maximum it arrives at 4.2 m and connects. It is
       * built HERE rather than by widening `strider.js:_frontKick`, whose
       * `damagePlayer(16, 4.6)` is a standing kick and belongs to `machine-rig`;
       * the ask to give that builder the canon 7 m reach (and to correct its
       * stale "Charge 15-50 m (roster)" docstring, which `ATTACK_MODE.strider =
       * 'table'` has made unreachable) is published in the LANE CONTRACT.
       *
       * Coverage is continuous 0-30 m and no row is the sole answer for more than
       * 57 % of the 4.2-14 m band. `A41b-attack-coverage` asserts both.
       */
      attacks: [
        { id: 'front-kick', min: 0, max: 4.6, cd: 3, score: 1.0, authored: '_frontKick' },
        { id: 'back-kick', min: 0, max: 4.4, cd: 4.5, score: 0.8, arc: 'rear', authored: '_backKick' },
        { id: 'dash-kick', min: 4, max: 8.4, cd: 3.6, score: 0.92, generic: 'lunge',
          params: { damage: 16, windup: 0.45, strike: 0.22, recover: 0.7, dash: 4.2, range: 4.6 } },
        { id: 'charge', min: 8.2, max: 30, cd: 6, score: 0.7, authored: '_charge', pass: 'dist', cdField: '_cdCharge' },
      ],
      react: { staggerFrac: 0.14, downedFrac: 0.3 },
      elem: 70,
      attackMode: 'table',
    },
    /** Strider herd x6 in the west meadow (roster-v2 §2 herd doctrine). The
     *  Round-3 Watcher escort was HZD IP and went with `watcher.js` (R30). */
    roster: (M) => {
      const HC = { x: -205, z: -55 };
      const herd = {
        center: new THREE.Vector3(HC.x, 0, HC.z),
        vector: new THREE.Vector3(0, 0, 1),
        alarmed: false,
        rearguard: null,
        members: [],
      };
      M._striderHerd = herd;
      M.squads.registerHerd(herd);   // machine-ai-07: the alarm flag RESETS
      const spots = [[-12, -8], [8, -14], [-3, 6], [14, 4], [-18, 12], [4, 18]];
      for (let i = 0; i < spots.length; i++) {
        M.spawn('strider', HC.x + spots[i][0], HC.z + spots[i][1], {
          herd,
          route: M._route(HC.x, HC.z, 18 + (i % 3) * 6, 4, i * 1.7),
          heading: Math.random() * Math.PI * 2,
        });
      }
    },
  },
  scrapper: {
    Cls: Scrapper,
    spec: { url: '/models/scrapper.glb', targetHeight: 1.5, yaw: 0 },
    style: {
      // mat12: yellow helmet eyes (+ matching accent stripes) become the sensor
      sensor: (m) => m.color.r > 0.9 && m.color.g > 0.7 && m.color.b < 0.2,
    },
    registerAt: 'boot',
    tables: {
      perception: { gain: 2.1, periphRange: 7.5 },
      engage: { archetype: 'pack', band: [2.5, 10], orbitSpeed: 0.75, orbitFlip: [1.6, 3.2] },
      attacks: [
        { id: 'claw', min: 0, max: 3.4, cd: 2.4, score: 1.0, authored: 'species' },
        /**
         * min 7 -> 6.4 (FIX ROUND 5, A41c/A41d Scrapper). The laser's floor sat
         * exactly on `dart-bite`'s 7.2 m ceiling, and `dart-bite` is a 4.2 m dash:
         * so the only radii where the laser was legal were ones the bite could
         * reach and immediately close. Traced on the Scrapper's hardest arc — the
         * footwork got to 7.03 m and held it for 0.10 decayed seconds across a
         * 30 s duel, threw `dart-bite` six times from 4-6.8 m, and the laser was
         * fresh, arrangeable and unblocked the whole way. 6.4 gives the laser
         * 0.8 m of overlap INSIDE the bite's reach — the same clearance rule the
         * band floors above already follow, applied to the other end of the
         * ladder — so the ranged move becomes legal before the closing move can
         * take the range away, and the fresh-first tier can actually pick it.
         * It is still a ranged burst: the claw is 3.4 m and the bite strikes at
         * 3.2 m.
         *
         * 6.4 -> 5.8 after one more pass. On the hardest FAIR arc `hardBearing`
         * can find around the Scrapper's ruin, the footwork's MEASURED reach over
         * four duels was 5.63 / 6.09 / 6.56 / 8.44 m: a floor at 6.4 sat above
         * where this species can stand on its own worst ground half the time, so
         * the laser was a move it carried and could not take — which is the
         * defect `A41d-held-radius-coverage` exists to name, not a reason to
         * stage an easier arc. 5.8 is inside the measured occupancy of every one
         * of those duels and still 2.4 m beyond the claw.
         */
        { id: 'laser', min: 5.8, max: 29, cd: 6, score: 0.85, authored: '_laserBurst', cdField: '_cdLaser' },
        // max 7.2, not 6.5: the old table left half a metre of nothing at exactly
        // the 7 m the Round-3 audit already caught this species parking at
        { id: 'dart-bite', min: 0, max: 7.2, cd: 3.2, score: 0.8, generic: 'lunge',
          params: { damage: 15, windup: 0.3, strike: 0.14, recover: 0.45, dash: 4.2, range: 3.2 } },
      ],
      react: { staggerFrac: 0.13, downedFrac: 0.32 },
      elem: 90,
      scavenger: true,
    },
    /** Scrapper pack x3 at the rusted-hull ruin: flanking arcs across the pack. */
    roster: (M) => {
      const packSpots = [[135, -35, 0], [143, -28, 1], [127, -26, -1]];
      for (let i = 0; i < packSpots.length; i++) {
        const [x, z, flank] = packSpots[i];
        M.spawn('scrapper', x, z, {
          flank,
          route: M._route(135, -32, 15, 4, i * 2.1),
          heading: Math.random() * Math.PI * 2,
        });
      }
    },
  },
  glinthawk: {
    Cls: Glinthawk,
    spec: { url: '/models/glinthawk.glb', targetHeight: 1.55, yaw: 0 },
    style: {
      // "Material": the big red mono-eye
      sensor: (m) => m.color.r > 0.6 && m.color.g < 0.15 && m.color.b < 0.15,
    },
    registerAt: 'boot',
    tables: {
      perception: { gain: 2.0, periphRange: 7, scanSweep: 0.7 },
      engage: { archetype: 'flyer', band: [12, 22], orbitSpeed: 0.8 },
      attacks: [
        // `dive` claims the flock's single diver token, so a second Glinthawk has
        // only the spit — which is why the spit now reaches in to 5 m instead of 9
        { id: 'dive', min: 0, max: 34, cd: 6, score: 1.0, authored: 'species' },
        { id: 'freeze-spit', min: 5, max: 30, cd: 5, score: 0.85, authored: '_freezeSpit', cdField: '_cdSpit' },
      ],
      react: { staggerFrac: 0.12, downedFrac: 0.26, downedTime: [4, 5.5] },
      elem: 110,
    },
    /** Glinthawk flock x3 circling above the riverbed pools (one diver token). */
    roster: (M) => {
      const pools = M.ctx.environment?.water?.pools ?? [];
      const flock = { diver: null };
      for (let i = 0; i < 3; i++) {
        const pool = pools.length
          ? pools[i % Math.min(pools.length, 2)]
          : { x: -122, z: -60 }; // contract gap fallback: river channel center
        M.spawn('glinthawk', pool.x + (i - 1) * 9, pool.z + (i % 2) * 10, {
          flock,
          pool: { x: pool.x, z: pool.z },
          phase: i * 2.1,
        });
      }
    },
  },
  longleg: {
    Cls: Longleg,
    spec: { url: '/models/longleg.gltf', targetHeight: 4.0, yaw: 0 },
    style: { texSat: 0.12, texBright: 1.5 }, // atlas texture -> grey chassis
    registerAt: 'boot',
    tables: {
      perception: { gain: 2.1, periphRange: 8.5, scanSweep: 1.0, contactRange: 4.5 },
      // band[1] 16 -> 12.5: the Longleg's longest move is the 13 m scream, so the
      // old outer edge parked it 3 m past anything it could throw (A41b).
      // band[0] 7 -> 6.4 (FIX ROUND 2): the jet blast is a 7 m cone and the ring
      // floor sat at 7.3 m, so the Longleg could arrange for a move it could never
      // be in range of — the Strider livelock in miniature, and it left the
      // species only TWO moves the footwork could set up. 6.4 puts the floor at
      // 6.7 m, inside the cone, and gives the harrier its third arrangeable move.
      engage: { archetype: 'harrier', band: [6.1, 12.5], orbitSpeed: 0.7, orbitFlip: [2, 4] },
      attacks: [
        { id: 'scream', min: 0, max: 13, cd: 8, score: 1.0, authored: 'species' },
        // the jet blast is a 7 m cone (`damagePlayer(24, 7)`), not a 20 m one; the
        // old row was legal out to 20 m and built nothing past 6.5
        { id: 'jet-blast', min: 0, max: 7, cd: 6, score: 0.85, authored: '_jetBlast', cdField: '_cdJet' },
        { id: 'peck', min: 0, max: 4, cd: 2.6, score: 0.8, authored: 'species' },
        // 0.9 s of strike at 13 m/s covers 11.7 m, so a 12 m hop actually arrives
        { id: 'hop-strike', min: 4, max: 12, cd: 5.5, score: 0.74, generic: 'charge',
          params: { damage: 22, windup: 0.5, strike: 0.9, recover: 0.8, speed: 13, knock: 7, range: 3 } },
      ],
      react: { staggerFrac: 0.12, downedFrac: 0.3 },
      elem: 150,
      alarm: 75,
      escort: { guards: ['strider', 'scrapper'], radius: 26, band: [18, 34] },
    },
    /** Longleg x2 on the SE rocky shelf. */
    roster: (M) => {
      M.spawn('longleg', 150, 95, { route: M._route(150, 95, 26, 5, 0.7), heading: -2.2 });
      M.spawn('longleg', 174, 60, { route: M._route(174, 60, 22, 4, 2.9), heading: 2.8 });
    },
  },
  broadhead: {
    Cls: Broadhead,
    spec: { url: '/models/broadhead.glb', targetHeight: 2.0, yaw: 0 },
    /* ---------------- ROUND 4 EXPANSION ----------------
     * Every one of these is an ANIMAL sculpt in animal colours (a brown bull, a
     * tan deer, a black caiman, an orange lion, a blue spider, a sand scorpion,
     * a brown hawk), and `roster-v2 §1` is explicit that the family reads as
     * white-grey armour plate over dark synthetic muscle with ONE state sensor.
     * The luminance ramp below does that work; the species files then add the
     * plate/muscle shell that carries the machine detail.
     *
     * `sensor` is deliberately absent on all of them: not one of these donors
     * has a material that is only the eye (the Bull's `Eye_Black` also paints
     * the muzzle rim, the Lion's face groups are four tiny colour patches), so
     * every species file adds its own `lensMesh` part instead — which is also
     * what lets the socket pass put the sensor exactly where `casting-v4` §2
     * measured it.
     */
    style: { rank: true, underbody: true },
    bake: true,              // donor baked out of its bind pose (`freezeSkins`)
    registerAt: 'loaded',
    rig: EXPANSION_RIGS.broadhead,
    tables: {
      perception: { gain: 2.1, periphRange: 9, scanSweep: 0.95, scanPeriod: 5.4, contactRange: 4.4 },
      engage: { archetype: 'skittish', band: [4.0, 15], orbitSpeed: 0.7, backSpeed: 0.9 },
      // --- 2.1 Broadhead: band [4,15], ring floor 4.3 < horn-strike 4.8 ---------
      attacks: [
        { id: 'horn-strike', min: 0, max: 4.8, cd: 3.2, score: 1.0, generic: 'lunge',
          params: { damage: 22, windup: 0.45, strike: 0.2, recover: 0.6, dash: 1.8, range: 4.6 } },
        { id: 'hind-kick', min: 0, max: 4.2, cd: 4.5, score: 0.78, arc: 'rear', generic: 'sweep',
          params: { damage: 20, windup: 0.4, strike: 0.18, recover: 0.6, range: 4.2, arcDeg: 200, knock: 7 } },
        { id: 'dash-horn', min: 4.2, max: 9.0, cd: 3.8, score: 0.9, generic: 'lunge',
          params: { damage: 26, windup: 0.5, strike: 0.24, recover: 0.75, dash: 4.4, range: 4.8 } },
        { id: 'horn-charge', min: 8.6, max: 32, cd: 6.5, score: 0.72, generic: 'charge',
          params: { damage: 30, windup: 0.6, strike: 0.8, recover: 0.85, speed: 14, knock: 10, range: 3.4 } },
      ],
      react: { staggerFrac: 0.13, downedFrac: 0.30 },
      elem: 95,
      attackMode: 'table',
    },
    doctrine: {
      body: {
        displayName: 'Broadhead', maxHealth: 220, armor: 0.10, level: 7,
        bodyRadius: 1.15, eyeHeight: 1.62, walkSpeed: 2.4, runSpeed: 8.5,
        attackRange: 4.6, sightRange: 42,
      },
      components: (m) => {
        m.addPart({
          name: 'blaze-canister', displayName: 'Blaze Canister',
          mesh: canisterMesh({ color: 0xff7a1e, r: 0.2, h: 0.55 }),
          pos: [0.30, 1.34, -0.30], tearHp: 55, elemental: 'blaze',
        });
      },
      chassis: 'strider',
      herd: true,
      spawn: [{ n: 2, x: -80, z: 170, route: 28, herd: true, poi: 'north-meadow' }],
    },
  },
  grazer: {
    Cls: Grazer,
    spec: { url: '/models/grazer.glb', targetHeight: 2.72, yaw: 0 },
    style: { rank: true, underbody: true },
    bake: true,              // donor baked out of its bind pose (`freezeSkins`)
    registerAt: 'loaded',
    rig: EXPANSION_RIGS.grazer,
    tables: {
      perception: { gain: 2.2, periphRange: 9.5, scanSweep: 1.05, scanPeriod: 4.6, contactRange: 4.0 },
      engage: { archetype: 'skittish', band: [3.4, 13], orbitSpeed: 0.85, backSpeed: 0.95 },
      // --- 2.2 Grazer: band [3.4,13], ring floor 3.7 < rotor-stab 4.2 ----------
      attacks: [
        { id: 'rotor-stab', min: 0, max: 4.2, cd: 2.6, score: 1.0, generic: 'lunge',
          params: { damage: 14, windup: 0.34, strike: 0.16, recover: 0.5, dash: 1.6, range: 4.0 } },
        { id: 'hind-kick', min: 0, max: 3.8, cd: 4.0, score: 0.75, arc: 'rear', generic: 'sweep',
          params: { damage: 13, windup: 0.36, strike: 0.16, recover: 0.55, range: 3.8, arcDeg: 200, knock: 5 } },
        { id: 'leap-kick', min: 3.6, max: 7.4, cd: 3.4, score: 0.92, generic: 'lunge',
          params: { damage: 14, windup: 0.38, strike: 0.2, recover: 0.6, dash: 3.8, range: 4.0 } },
        { id: 'antler-charge', min: 7.0, max: 26, cd: 6.0, score: 0.7, generic: 'charge',
          params: { damage: 22, windup: 0.55, strike: 0.75, recover: 0.8, speed: 15, knock: 8, range: 3.2 } },
      ],
      react: { staggerFrac: 0.14, downedFrac: 0.28, downedTime: [3, 4] },
      elem: 75,
      attackMode: 'table',
    },
    doctrine: {
      body: {
        displayName: 'Grazer', maxHealth: 130, armor: 0.05, level: 5,
        bodyRadius: 0.85, eyeHeight: 2.30, walkSpeed: 2.6, runSpeed: 9.5,
        attackRange: 4.0, sightRange: 40,
      },
      components: (m) => {
        for (let i = 0; i < 4; i++) {
          m.addPart({
            name: 'blaze-canister', displayName: 'Blaze Canister',
            mesh: canisterMesh({ color: 0xff7a1e, r: 0.16, h: 0.42 }),
            pos: [(i % 2 ? 0.22 : -0.22), 1.68, i < 2 ? 0.30 : -0.35],
            tearHp: 40, elemental: 'blaze',
          });
        }
      },
      chassis: 'strider',
      herd: true,
      spawn: [{ n: 2, x: -30, z: -150, route: 26, herd: true, poi: 'south-flats' }],
    },
  },
  snapmaw: {
    Cls: Snapmaw,
    spec: { url: '/models/snapmaw.glb', targetHeight: 0.98, yaw: 0 },
    style: { rank: true, underbody: true, texSat: 0.06, texBright: 0.55 }, // 1024² caiman atlas
    bake: true,              // donor baked out of its bind pose (`freezeSkins`)
    registerAt: 'loaded',
    rig: EXPANSION_RIGS.snapmaw,
    tables: {
      /**
       * AMBUSH IS A PERCEPTION SHAPE, NOT A NEW STATE (casting-v4 §2.3). A
       * basking Snapmaw notices LATE — a narrow peripheral arc and a slow sweep —
       * and then commits hard: `gain` 1.4 makes the fill from first contact to red
       * the fastest in the roster once the cone does land on her.
       */
      perception: { gain: 1.4, periphRange: 5, scanSweep: 0.35, scanPeriod: 11, contactRange: 5.5 },
      /**
       * band[1] 20 -> 16 and backSpeed 0.4 -> 0.6, MEASURED (A41d-must-fire).
       * A croc orbited at 0.4 x 7.5 = 3 m/s and its cheap `lunge-bite` dashes
       * 6.5 m forward, so the card's 20 m outer edge was a radius this species
       * structurally could not hold: 0.13 decayed seconds inside the mortar shell
       * across a 22 s duel, and the mortar never fired. A band whose outer third
       * the footwork never reaches is the same lie as a row whose builder cannot
       * reach its range — it just fails on terrain instead of arithmetic.
       *
       * orbitSpeed 0.4 -> 0.5 and backSpeed 0.6 -> 0.7 after the 5-seed sweep:
       * at 3 m/s it needed most of a 20 s duel just to travel between the bite
       * shell (5.8-7 m) and the mortar shell (11-15.7 m), and one run in five
       * showed only two of its four moves. 3.75 m/s is still the second-slowest
       * orbit in the roster and slower than everything but a Shell-Walker.
       */
      engage: { archetype: 'bruiser', band: [5.5, 16], orbitSpeed: 0.5, backSpeed: 0.7, orbitFlip: [3.5, 7] },
      // --- 2.3 Snapmaw: band [5.5,20], ring floor 5.8 < snap-bite 6.4 ---------
      attacks: [
        { id: 'snap-bite', min: 0, max: 6.4, cd: 2.8, score: 1.0, generic: 'lunge',
          params: { damage: 30, windup: 0.45, strike: 0.2, recover: 0.65, dash: 2.0, range: 6.0 } },
        { id: 'tail-spin', min: 0, max: 7.0, cd: 5.5, score: 0.8, generic: 'sweep',
          params: { damage: 34, windup: 0.6, strike: 0.26, recover: 0.9, range: 7.0, arcDeg: 300, knock: 8 } },
        { id: 'lunge-bite', min: 6.0, max: 12, cd: 4.2, score: 0.9, generic: 'lunge',
          params: { damage: 36, windup: 0.5, strike: 0.3, recover: 0.8, dash: 5.0, range: 6.4 } },
        // min 13 -> 11: the shell has to start inside the radii a 3 m/s croc holds
        { id: 'freeze-mortar', min: 11, max: 42, cd: 7.5, score: 0.85, generic: 'volley',
          params: { damage: 30, windup: 0.7, strike: 0.5, recover: 0.9, range: 42, shots: 2, arcDeg: 18, color: VFX_COLORS.brineMid } },
      ],
      react: { staggerFrac: 0.12, downedFrac: 0.30 },
      elem: 170,
      attackMode: 'table',
    },
    doctrine: {
      body: {
        displayName: 'Snapmaw', maxHealth: 400, armor: 0.22, level: 13,
        bodyRadius: 1.3, standoffHalfLen: 2.6, eyeHeight: 0.85,
        walkSpeed: 1.6, runSpeed: 7.5, attackRange: 6.0, sightRange: 40,
        elemWeak: 'fire', elemResist: 'freeze',
      },
      components: (m) => {
        m.addPart({
          name: 'freeze-sac', displayName: 'Chillwater Sac',
          mesh: canisterMesh({ color: VFX_COLORS.brineMid, r: 0.24, h: 0.55 }),
          pos: [0, m.eyeHeight * 0.75, 1.1], tearHp: 70,
          elemental: 'freeze', weak: true, weakMult: 2.5,
          linkedAttack: 'freeze-mortar',
        });
      },
      /** Basking pair + water ambush: the pair wakes WITH it (casting-v4 §2.3). */
      install: (m) => {
        m._basking = { t: 0, phase: Math.random() * 6.28 };
        m.onStateChange = (name) => {
          if (name !== 'alert' && name !== 'attack') return;
          const site = m.basking;
          if (!site || site.alarmed) return;
          site.alarmed = true;
          // they do not converge on the caller, they come out of the water
          for (const o of site.members) {
            if (o === m || !o.alive || o._disposed) continue;
            o.suspicion = Math.max(o.suspicion, 0.85);
            o._unseenT = 0;
            o.lastKnown.copy(m.lastKnown);
            if (o.state === 'patrol' || o.state === 'return') o.setState('alert');
          }
        };
      },
      spawn: [{ n: 2, x: -174, z: -160, route: 12, basking: true, territory: 12, poi: 'river-pools' }],
    },
  },
  ravager: {
    Cls: Ravager,
    spec: { url: '/models/ravager.glb', targetHeight: 3.66, yaw: 0 },
    style: { rank: true },        // donor retired under the shell: nothing to tone
    bake: true,              // donor baked out of its bind pose (`freezeSkins`)
    registerAt: 'loaded',
    rig: EXPANSION_RIGS.ravager,
    tables: {
      perception: { gain: 2.05, periphRange: 9, scanSweep: 0.8, contactRange: 5.0 },
      /**
       * band[1] 22 -> 18 and backSpeed 0.75 (default 0.55), same reading: the
       * Ravager banked 0.05 s inside its 12-21.7 m cannon shell and reached
       * 6.19 m, because its own `pounce` covered 11 m of ground per throw and put
       * it back at knife range. The pounce is shortened below; the band comes in
       * to meet what is left, and a cat that opens the range to use a dorsal
       * cannon has to be able to back up faster than it strolls.
       */
      engage: { archetype: 'stalker', band: [3.0, 18], orbitSpeed: 0.7, backSpeed: 0.75, orbitFlip: [2, 4] },
      // --- 2.4 Ravager: band [3,22], ring floor 3.3 < jaw-smash 4.0 -----------
      attacks: [
        { id: 'jaw-smash', min: 0, max: 4.0, cd: 2.0, score: 1.0, generic: 'lunge',
          params: { damage: 26, windup: 0.35, strike: 0.16, recover: 0.5, dash: 1.4, range: 3.8 } },
        { id: 'bite', min: 0, max: 5.0, cd: 2.8, score: 0.7, generic: 'lunge',
          params: { damage: 30, windup: 0.42, strike: 0.2, recover: 0.65, dash: 2.4, range: 4.2 } },
        { id: 'shock-cocoon', min: 0, max: 5.4, cd: 8, score: 0.8, generic: 'sweep',
          params: { damage: 33, windup: 0.7, strike: 0.3, recover: 0.9, range: 5.4, arcDeg: 360, knock: 6 } },
        // a POUNCE, not a charge across the arena: 16 m/s for 0.7 s covered 11.2 m
        // and landed the Ravager at knife range from anywhere in its band
        { id: 'pounce', min: 5.0, max: 14, cd: 4.0, score: 0.95, generic: 'charge',
          params: { damage: 34, windup: 0.5, strike: 0.5, recover: 0.8, speed: 13, knock: 10, range: 3.4 } },
        { id: 'cannon-burst', min: 10, max: 58, cd: 6.5, score: 0.9, generic: 'volley', needPart: 'cannon',
          params: { damage: 34, windup: 0.6, strike: 0.6, recover: 0.9, range: 58, shots: 3, arcDeg: 12, color: 0xffb36b } },
      ],
      react: { staggerFrac: 0.12, downedFrac: 0.32, critDamage: 0.32 },
      elem: 260,
      attackMode: 'table',
      escort: { guards: ['grazer'], radius: 70, band: [40, 90] },
    },
    doctrine: {
      body: {
        displayName: 'Ravager', maxHealth: 650, armor: 0.24, level: 18,
        bodyRadius: 1.5, eyeHeight: 2.6, walkSpeed: 2.4, runSpeed: 10,
        attackRange: 4.2, sightRange: 48, elemWeak: 'fire', elemResist: 'shock',
      },
      components: (m) => {
        m.addPart({
          name: 'cannon', displayName: 'Dorsal Cannon',
          mesh: cannonMesh({ accent: 0xffb36b }),
          pos: [0, m.eyeHeight * 0.92, -0.35], tearHp: 220,
          linkedAttack: 'cannon-burst',
          // the Thunderjaw disc-launcher pickup path, reused verbatim
          pickupWeapon: 'ravager-cannon',
          loot: [{ id: 'metal-shard', n: [12, 22] }],
          sparkleWhileTorn: true,
        });
        m.addPart({
          name: 'power-cell', displayName: 'Power Cell',
          mesh: powerCellMesh({ color: 0xffd23d }),
          pos: [0, m.eyeHeight * 0.55, -1.1], tearHp: 90,
          elemental: 'shock', weak: true, weakMult: 2.5,
        });
      },
      reband: { cannon: [3, 14] },
      spawn: [{ n: 1, x: -120, z: -195, route: 28, poi: 'south-ridge' }],
    },
  },
  shellwalker: {
    Cls: ShellWalker,
    spec: { url: '/models/shellwalker.glb', targetHeight: 2.1, yaw: 0 },
    style: { rank: true },    // donor retired under the shell
    bake: true,              // donor baked out of its bind pose (`freezeSkins`)
    registerAt: 'loaded',
    rig: EXPANSION_RIGS.shellwalker,
    tables: {
      perception: { gain: 1.9, periphRange: 8.5, scanSweep: 0.7, scanPeriod: 7.5, contactRange: 5.5 },
      /**
       * band 5-24 -> 4.4-16, MEASURED across three passes of
       * `A41d-held-radius-coverage`. A hexapod transport orbits at 0.4 x 6 =
       * 2.4 m/s and backs off at 3.3; on its own ground it settles at 5.9-9.3 m
       * and its measured `heldReach` never passed 11.25 / 11.81 / 10.13 m in
       * three 22 s duels. The card's 24 m outer edge, and then 18, were radii this
       * species structurally does not reach, so its two ranged rows were moves it
       * carried and could never take — which is exactly the defect A41d exists to
       * catch, arriving from the table side. The band now ends just past what the
       * footwork holds, the ranged floors come down to meet it (see
       * `homing-blast` below), and band[0] 5 -> 4.4 widens the 0.5 m sliver the
       * `claw-combo` shell had at the ring floor to 1.1 m.
       */
      engage: { archetype: 'bruiser', band: [4.4, 16], orbitSpeed: 0.4, closeSpeed: 0.85, orbitFlip: [3.5, 7] },
      // --- 2.5 Shell-Walker: band [5,24], ring floor 5.3 < claw-combo 5.8 -----
      attacks: [
        { id: 'claw-combo', min: 0, max: 5.8, cd: 3.0, score: 1.0, generic: 'flurry',
          params: { damage: 34, hits: 3, windup: 0.5, strike: 0.9, recover: 0.7, range: 5.0, arcDeg: 150, close: 6 } },
        // the 1.1 s windup IS the "whole body charges" telegraph (casting §2.5)
        { id: 'shock-nova', min: 0, max: 11, cd: 10, score: 0.85, generic: 'sweep',
          params: { damage: 44, windup: 1.1, strike: 0.35, recover: 1.2, range: 11, arcDeg: 360, knock: 14 } },
        { id: 'shock-volley', min: 9, max: 34, cd: 5.0, score: 0.8, generic: 'volley', needPart: 'lightning-gun',
          params: { damage: 28, windup: 0.6, strike: 0.5, recover: 0.8, range: 34, shots: 3, arcDeg: 12, color: VFX_COLORS.dustMid } },
        // min 13 -> 9.5: measured, this chassis holds 5.9-10.1 m on its own ground
        { id: 'homing-blast', min: 9.5, max: 48, cd: 8, score: 0.9, generic: 'volley', needPart: 'lightning-gun',
          params: { damage: 38, windup: 0.8, strike: 0.5, recover: 1.0, range: 48, shots: 1, arcDeg: 22, color: VFX_COLORS.dustMid } },
      ],
      react: { staggerFrac: 0.12, downedFrac: 0.34, impulse: 0.7, pushBack: 0.22 },
      elem: 230,
      attackMode: 'table',
      alarm: 55,
    },
    doctrine: {
      body: {
        displayName: 'Shell-Walker', maxHealth: 500, armor: 0.28, level: 17,
        bodyRadius: 1.8, eyeHeight: 2.2, walkSpeed: 2.0, runSpeed: 6.0,
        attackRange: 5.0, sightRange: 42, elemResist: 'shock',
      },
      components: (m) => {
        m.addPart({
          name: 'cargo', displayName: 'Cargo Crate', mesh: cargoMesh(),
          pos: [0, m.eyeHeight * 0.7, -0.2], tearHp: 60,
          loot: [{ id: 'metal-shard', n: [20, 40] }],
        });
        m.addPart({
          name: 'lightning-gun', displayName: 'Lightning Gun',
          mesh: cannonMesh({ accent: VFX_COLORS.dustMid }),
          pos: [0.75, m.eyeHeight * 0.8, 0.6], tearHp: 150,
          linkedAttack: 'shock-volley', pickupWeapon: 'shellwalker-gun',
          sparkleWhileTorn: true,
        });
        m.addPart({
          name: 'shield-projector', displayName: 'Shield Projector',
          mesh: coreMesh({ color: VFX_COLORS.bronzeChip, r: 0.24 }),
          pos: [-0.75, m.eyeHeight * 0.8, 0.6], tearHp: 130,
        });
      },
      reband: { 'lightning-gun': [2.5, 11] },   // both ranged rows drop
      spawn: [{ n: 2, x: 228, z: 18, route: 30, convoy: true, poi: 'east-road' }],
    },
  },
  corruptor: {
    Cls: Corruptor,
    spec: { url: '/models/corruptor.glb', targetHeight: 2.95, yaw: 0 },
    style: {
      /**
       * THE ONE SPECIES THAT OPTS OUT OF THE FAMILY PALETTE (`roster-v2 §4`:
       * "matte black chassis"). `tint` replaces the chassis/mid/muscle ramp with
       * a near-black one plus red trim, which is what `casting-v4` §5.3 asks
       * `shellMaterials(tint)` for on the shell side.
       */
      rank: true,
      tint: { chassis: 0x2a2b2e, mid: 0x1b1c1f, muscle: 0x0d0e10 },
      underbody: true,
      // ...and the same for any MAPPED surface: the ramp only reaches materials
      // with a flat colour, and a Faro machine that is matte black everywhere
      // except where it happens to carry a texture is not matte black.
      texSat: 0.04, texBright: 0.42,
    },
    bake: true,              // donor baked out of its bind pose (`freezeSkins`)
    registerAt: 'loaded',
    rig: EXPANSION_RIGS.corruptor,
    tables: {
      perception: { gain: 2.2, periphRange: 10, scanSweep: 0.9, scanPeriod: 5, contactRange: 5.0 },
      /**
       * band[1] 24 -> 20, MEASURED (A41d-must-fire). The Faro scuttle is fast
       * (0.85 x 12 = 10.2 m/s) but its home is the cauldron ruin and its measured
       * `heldReach` swung 7.9-20.3 m run to run on that broken ground — so the
       * outer 4 m of a 20 m-wide band was a coin flip, and `inferno-blast`
       * (shell 16-23.7 m) came up unfired-and-unstood-in once in five. 20 m keeps
       * both ranged rows inside the radii this ground reliably gives, and the
       * sole-answer share stays under 20 %.
       */
      engage: { archetype: 'stalker', band: [4, 20], orbitSpeed: 0.85, orbitFlip: [1.6, 3.2], jitter: 0.5 },
      // --- 2.6 Corruptor: band [4,24], ring floor 4.3 < talon-strike 5.0 ------
      attacks: [
        { id: 'talon-strike', min: 0, max: 5.0, cd: 1.8, score: 1.0, generic: 'lunge',
          params: { damage: 22, windup: 0.32, strike: 0.15, recover: 0.5, dash: 1.6, range: 4.6 } },
        { id: 'tail-sweep', min: 0, max: 9.5, cd: 5.0, score: 0.88, generic: 'sweep',
          params: { damage: 24, windup: 0.55, strike: 0.3, recover: 0.8, range: 9.5, arcDeg: 360, knock: 9 } },
        { id: 'leap', min: 6, max: 18, cd: 5.5, score: 0.9, generic: 'charge',
          params: { damage: 26, windup: 0.5, strike: 0.85, recover: 0.8, speed: 16, knock: 10, range: 3.4 } },
        { id: 'corruption-spike', min: 12, max: 46, cd: 6.0, score: 0.85, generic: 'volley', needPart: 'spike-launcher',
          params: { damage: 30, windup: 0.6, strike: 0.5, recover: 0.85, range: 46, shots: 3, arcDeg: 12, color: 0xff4a2a } },
        // min 16 -> 13.5: the shell has to sit inside the band this ground gives
        { id: 'inferno-blast', min: 13.5, max: 60, cd: 11, score: 0.8, generic: 'volley', needPart: 'grenade-launcher',
          params: { damage: 42, windup: 0.9, strike: 0.5, recover: 1.1, range: 60, shots: 1, arcDeg: 26, color: 0xff7a1e } },
      ],
      react: { staggerFrac: 0.12, downedFrac: 0.30, impulse: 0.8 },
      elem: 250,
      attackMode: 'table',
    },
    doctrine: {
      body: {
        displayName: 'Corruptor', maxHealth: 600, armor: 0.26, level: 19,
        bodyRadius: 1.6, standoffHalfLen: 2.2, eyeHeight: 1.1,
        walkSpeed: 3.0, runSpeed: 12, attackRange: 4.6, sightRange: 50,
        elemWeak: 'fire',
      },
      components: (m) => {
        m.addPart({
          name: 'spike-launcher', displayName: 'Spike Launcher',
          mesh: cannonMesh({ accent: 0xff4a2a }),
          pos: [0.42, m.eyeHeight * 0.85, 0.2], tearHp: 140,
          linkedAttack: 'corruption-spike', sparkleWhileTorn: true,
        });
        m.addPart({
          name: 'grenade-launcher', displayName: 'Grenade Launcher',
          mesh: cannonMesh({ accent: 0xff7a1e }),
          pos: [-0.42, m.eyeHeight * 0.85, 0.2], tearHp: 140,
          linkedAttack: 'inferno-blast', sparkleWhileTorn: true,
        });
        // the exposed heat core IS the state channel and the crit window
        m.addPart({
          name: 'heat-core', displayName: 'Heat Core',
          mesh: coreMesh({ color: 0xff4a2a, r: 0.22 }),
          pos: [0, m.eyeHeight * 0.95, -0.55], tearHp: Infinity,
          weak: true, weakMult: 3,
        });
      },
      chassis: 'longleg',
      spawn: [{ n: 1, x: 175, z: -195, route: 26, poi: 'cauldron' }],
    },
  },
  stormbird: {
    Cls: Stormbird,
    spec: { url: '/models/stormbird.glb', targetHeight: 7.89, yaw: 0 },
    style: { rank: true },      // donor retired under the shell (see stormbird.js)
    bake: true,              // donor baked out of its bind pose (`freezeSkins`)
    registerAt: 'loaded',
    rig: EXPANSION_RIGS.stormbird,
    tables: {
      perception: { gain: 2.0, periphRange: 12, scanSweep: 0.6, scanPeriod: 7, contactRange: 6.0 },
      engage: { archetype: 'flyer', band: [18, 40], orbitSpeed: 0.85 },
      /**
       * --- 2.7 Stormbird: band [18,40] -------------------------------------
       * The two GROUNDED rows carry the negated `needPart` this expansion needed
       * (`AttackPicker._needPartOk`): they are illegal while any engine is still
       * attached, which makes air-to-ground a data fact. Sole-answer share across
       * 18-40 m is 0 % — three rows answer every metre of the band.
       */
      attacks: [
        { id: 'thunder-clash', min: 12, max: 90, cd: 11, score: 1.0, generic: 'volley', needPart: 'engine',
          params: { damage: 60, windup: 0.9, strike: 0.6, recover: 1.1, range: 90, shots: 3, arcDeg: 14, color: VFX_COLORS.dustMid, knock: 8 } },
        { id: 'shock-blast', min: 14, max: 70, cd: 6, score: 0.9, generic: 'volley', needPart: 'lightning-gun',
          params: { damage: 34, windup: 0.6, strike: 0.5, recover: 0.9, range: 70, shots: 2, arcDeg: 12, color: VFX_COLORS.dustMid } },
        { id: 'bomb-run', min: 25, max: 80, cd: 13, score: 0.85, generic: 'volley',
          params: { damage: 46, windup: 0.8, strike: 0.7, recover: 1.0, range: 80, shots: 4, arcDeg: 20, color: 0xff9a3d } },
        /**
         * max 17.5, not the card's 18. A row that ends EXACTLY on the band floor
         * is the livelock `AttackPicker._reachable` exists to reject: the ring
         * window starts half a hysteresis above `band[0]`, so at 18.0 the screech
         * reaches into the band and no holdable ring can ever set it up
         * (`bandBlocked` 1, asserted per sim step by `A41c`). Below the floor it
         * is honestly OUT of the airborne standoff — and it comes back the moment
         * the Stormbird is GROUNDED and re-bands to [4, 20], which is exactly
         * where a screech belongs (roster-v2 §4: the landed phase).
         */
        { id: 'screech-stun', min: 0, max: 17.5, cd: 9, score: 0.8, generic: 'sweep',
          params: { damage: 18, windup: 0.8, strike: 0.3, recover: 1.0, range: 17.5, arcDeg: 200, knock: 6 } },
        { id: 'tail-lash', min: 0, max: 20, cd: 5, score: 0.75, arc: 'rear', generic: 'sweep', needPart: '!engine',
          params: { damage: 30, windup: 0.5, strike: 0.26, recover: 0.8, range: 20, arcDeg: 220, knock: 9 } },
        { id: 'thunder-rush', min: 8, max: 36, cd: 7, score: 0.82, generic: 'charge', needPart: '!engine',
          params: { damage: 52, windup: 0.7, strike: 0.9, recover: 1.1, speed: 20, knock: 16, range: 4 } },
      ],
      react: { staggerFrac: 0.11, downedFrac: 0.30, impulse: 0.5, pushBack: 0.15, downedTime: [4, 5.5] },
      elem: 480,
      attackMode: 'table',
    },
    doctrine: {
      body: {
        displayName: 'Stormbird', maxHealth: 1400, armor: 0.30, level: 26,
        bodyRadius: 2.2, eyeHeight: 3.7, walkSpeed: 8, runSpeed: 16,
        attackRange: 18, sightRange: 90, elemResist: 'shock',
      },
      components: (m) => {
        // six feather-jet engines: ALL of them must go before the grounded rows
        // become legal (`needPart: '!engine'`)
        for (let i = 0; i < 6; i++) {
          const side = i < 3 ? -1 : 1;
          const k = i % 3;
          m.addPart({
            name: 'engine', displayName: 'Feather Jet',
            mesh: canisterMesh({ color: VFX_COLORS.bronzeChip, r: 0.18, h: 0.5 }),
            pos: [side * (0.9 + k * 0.5), m.eyeHeight * 0.75, -0.2 - k * 0.35],
            tearHp: 120, elemental: null, sparkleWhileTorn: true,
          });
        }
        m.addPart({
          name: 'lightning-gun', displayName: 'Lightning Gun',
          mesh: cannonMesh({ accent: VFX_COLORS.dustMid }),
          pos: [0, m.eyeHeight * 0.55, 0.8], tearHp: 180,
          linkedAttack: 'shock-blast', sparkleWhileTorn: true,
        });
      },
      chassis: 'glinthawk',
      /** Solo flyer, grounded for good once all six jets are gone (roster-v2 §4). */
      install: (m) => {
        m.flyCruise = 16;
        m._onPartTorn = () => {
          const jets = m.parts.filter((p) => p.name === 'engine' && p.attached).length;
          if (jets > 0) return false;
          // the two grounded rows become legal at the same instant through
          // `needPart: '!engine'`, so the fight changes shape from data alone
          m._airborne = false;
          m.flyCruise = 0;
          rebandMachine(m, [4, 20], 'bruiser');
          if (m.ai?.engage) m.ai.engage._heldHi = 30;
          m.emit('machine-grounded', { machine: m });
          return true;
        };
      },
      spawn: [{ n: 1, x: 150, z: 230, route: 40, poi: 'north-spire' }],
    },
  },};

/** Kind ids, in roster order. */
export const LEGACY_KINDS = Object.keys(LEGACY);

/** The loader row of a kind: its asset row with the machine shadow policy. */
const loaderRow = (k) => ({ ...LEGACY[k].spec, shadowPolicy: LEGACY[k].spec.shadowPolicy ?? MACHINE_SHADOWS });

/**
 * BOOT ROWS — the models the boot roster is built from (fix round 1).
 *
 * `{ kind: { url, targetHeight, yaw, shadowPolicy } }` for every 'boot' kind.
 * Published for pipeline's data-driven `assets.js` (contract "`assets.specs`
 * rows", plan §3.2 / §1.2: "rows from `src/core/assets.specs.js` +
 * `machines/legacy.js`"), which merges `BOOT_SPECS` into `ctx.assets.specs`
 * and loads it in `loadAll`, before `Machines` is constructed.
 *
 * WHY THESE ARE BOOT ROWS. Base built its authored roster in the `Machines`
 * constructor — the four IP kinds, whose models `assets.js` loaded at boot.
 * R30 deletes those kinds, and every surviving legacy kind used to stream in
 * ~2.6 s after `__READY__`. That broke a contract other lanes rely on:
 * `progression.js` installs its difficulty/skill damage wrapper through
 * `machines.list[0]` at construction (an empty list leaves it to a 1 Hz retry
 * that gives up after 30 tries), and the Round-4 suite stages on whatever is
 * alive at `__READY__` (A64b/A64c FAIL, A62/A63 SKIP, judge-measured). So the
 * Round-3 kinds' models now load at boot (1.7 MB, against the 4.8 MB of IP
 * models they replace at boot) and their roster is built in the constructor
 * again. The Round-4 expansion kinds and the Instrument kinds stay deferred,
 * exactly as in base.
 *
 * `shadowPolicy` is the same `MACHINE_SHADOWS` the deferred loader applies,
 * so an entry is normalised identically whichever loader fetched it.
 */
export const BOOT_SPECS = Object.fromEntries(LEGACY_KINDS
  .filter((k) => LEGACY[k].registerAt === 'boot').map((k) => [k, loaderRow(k)]));

/**
 * The deferred asset rows (every 'loaded' kind), same shape — loaded by
 * `installLegacy` itself through `loadKindModels`; published so pipeline's
 * loader can list them (`ctx.assets.deferredSpecs`) without fetching them.
 */
export const LEGACY_SPECS = Object.fromEntries(LEGACY_KINDS
  .filter((k) => LEGACY[k].registerAt !== 'boot').map((k) => [k, loaderRow(k)]));

/**
 * MERGE-ORDER BRIDGE for `BOOT_SPECS` (W0a only; inert once pipeline's
 * data-driven loader is merged, deleted with this file at the W2 exit).
 *
 * W0a lanes merge in any order (plan §3.1). Pipeline's `assets.js` reads
 * `BOOT_SPECS` from this file; the Round-4 `assets.js` in a tree without that
 * merge does not, and then the boot roster would have no models at
 * construction. So `Assets.prototype.loadAll` is wrapped ONCE, here, when this
 * module evaluates (it is imported by `machines/index.js`, which `main.js`
 * imports before it builds `Assets`):
 *   - a data-driven loader — one that publishes `assets.specs`, the §3.2
 *     contract — reads `BOOT_SPECS` itself: the wrapper calls straight
 *     through and changes nothing;
 *   - otherwise the missing boot rows load through the published
 *     `loadExtra`, IN PARALLEL with the original rows, inside the same
 *     awaited `loadAll` (the loading bar reports both halves).
 * A boot row that fails to load is not fatal: `installLegacy` finds no model
 * for it at construction and that kind falls back to the deferred path (its
 * roster spawns once its model is in), with one console.warn here.
 */
(function bridgeBootRows() {
  const proto = Assets?.prototype;
  if (!proto || typeof proto.loadAll !== 'function' || proto.loadAll.__legacyBootRows) return;
  const base = proto.loadAll;
  async function loadAll(onProgress = () => {}) {
    if (this.specs && typeof this.specs === 'object') return base.call(this, onProgress);
    const rows = {};
    for (const k of Object.keys(BOOT_SPECS)) if (!this.models?.[k]) rows[k] = BOOT_SPECS[k];
    if (!Object.keys(rows).length || typeof this.loadExtra !== 'function') return base.call(this, onProgress);
    let pa = 0, pb = 0;
    const report = (name) => onProgress((pa + pb) / 2, name);
    const [models] = await Promise.all([
      base.call(this, (p, name) => { pa = p; report(name); }),
      this.loadExtra(rows, { onProgress: (p, name) => { pb = p; report(name); } })
        .catch((err) => {
          pb = 1;
          console.warn('[legacy] a boot row did not load at boot; that kind loads deferred instead:', err?.message ?? err);
        }),
    ]);
    return models;
  }
  loadAll.__legacyBootRows = true;
  proto.loadAll = loadAll;
}());

let _installed = null;

/**
 * THE STEERING RETURN, ON DEMAND, FOR THE LEGACY KINDS (W0b targeted fix; judge: "`_moveToward` reached 4.38 KB/s
 * in A-alloc-machines' paired no-inline run").
 *
 * MEASURED (census of every `_moveToward` call in A-alloc-machines' staging, 405 frames): 4.89 calls per frame, all
 * from legacy kinds — 3.67 from `Glinthawk._orbit` (glinthawk.js:144) and 1.22 from the frozen convoy step
 * (`Squads.stepConvoy`, squad.js:289) walking the ShellWalkers — and every one of those callers DISCARDS the result.
 * The bytes were not a deopt: `Machine._moveToward` returns `_st.out`, a double, and a double returned from a call
 * that is not inlined is a fresh HeapNumber (12 B), in every window (3.35 / 3.43 / 4.26 / 2.42 / 3.02 / 2.95 KB/s
 * with inlining off).
 *
 * Of all `_moveToward` callers only ONE reads the result: the frozen scavenger step (`Squads.stepScavenge`,
 * squad.js:501, `d < cfg.arrive`), which calls it only while `m.scavenge` is set. So on the legacy classes the
 * method returns the distance exactly when its machine is scavenging and nothing otherwise: the same motion, the
 * same value wherever a value is read, no number boxed for the callers that drop it. The base `Machine._moveToward`
 * keeps its contract (the distance, always) for every Instrument kind. Deleted with this file at the W2 exit.
 */
function legacyMoveToward(x, z, speed, dt) {
  _st.x = x; _st.z = z; _st.speed = speed;
  moveTowardS(this, dt);
  if (this.scavenge) return _st.out;
  return undefined;
}

/**
 * Register every legacy kind with the manager and load its model.
 *
 *   installLegacy(machines) -> { kinds, boot, ready: Promise<{ loaded, failed }> }
 *
 * Synchronous part (before `Machines` builds `kinds`): table rows, rig rows,
 * doctrine rows, and the boot kinds' classes. Every model already in
 * `ctx.assets.models` — the boot rows — is styled and handed over in this
 * call (`loadKindModels` finishes present models synchronously), so `boot`
 * lists the kinds the constructor can spawn right now. Asynchronous part:
 * the remaining models; a 'loaded' class retires its chassis the moment its
 * model is in. `ready` never rejects — a kind whose model fails is listed in
 * `failed` and is simply never spawned.
 */
export function installLegacy(machines) {
  if (!_installed) {
    for (const kind of LEGACY_KINDS) {
      const row = LEGACY[kind];
      registerKindTables(kind, row.tables || {});
      if (row.rig) registerRig(kind, row.rig);
      if (row.doctrine) registerDoctrine(kind, row.doctrine);
      // the legacy steering return (above): set once, before any legacy machine exists
      if (row.Cls && row.Cls.prototype._moveToward !== legacyMoveToward) row.Cls.prototype._moveToward = legacyMoveToward;
    }
    _installed = true;
  }
  for (const kind of LEGACY_KINDS) {
    if (LEGACY[kind].registerAt === 'boot') machines._registry[kind] = LEGACY[kind].Cls;
  }
  const rows = {};
  for (const kind of LEGACY_KINDS) rows[kind] = LEGACY[kind];
  const boot = [];
  let inCall = true;   // models finished inside this call are the boot set
  const ready = loadKindModels(machines.ctx, rows, {
    onLoaded: (kind) => {
      if (LEGACY[kind].registerAt === 'loaded') machines.registerKind(kind, LEGACY[kind].Cls);
      if (inCall) boot.push(kind);
    },
  });
  inCall = false;
  return { kinds: LEGACY_KINDS, boot, ready };
}

/**
 * The authored Round-3 roster (the Round-4 kinds spawn from their doctrine
 * `spawn` rows through `spawnExpansion`). Called by `Machines` twice: in its
 * constructor, where it spawns every kind whose model is already loaded (the
 * boot rows), and again once the deferred models are in, where it spawns only
 * the kinds the first call could not (a boot row that had to fall back to
 * deferred loading). A kind's roster is spawned at most once per manager.
 * Returns how many machines this call asked for.
 */
export function spawnLegacyRoster(machines) {
  const done = (machines._legacyRosterDone ||= new Set());
  let n = 0;
  for (const kind of LEGACY_KINDS) {
    const row = LEGACY[kind];
    if (!row.roster || done.has(kind) || !machines.canSpawn(kind)) continue;
    done.add(kind);
    const before = machines.list.length;
    row.roster(machines);
    n += machines.list.length - before;
  }
  return n;
}
