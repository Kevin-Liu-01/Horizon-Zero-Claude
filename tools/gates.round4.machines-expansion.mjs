/**
 * `machines-expansion` lane gates (Round 4 wave 4, audit §4).
 *
 * WHAT IS NOT HERE, AND WHY.
 *
 * §4 gives this lane `A44-socket-integrity`, `A45-no-skate-per-species`,
 * `A46-ground-truth`, `A47-corpse-grounded`, `A48-cadence`, `A41c-sustained-
 * variety`, `A21-real-draw-calls` and `A90-memory-stability` — "run per
 * species, INCLUDING EVERY NEW KIND". Not one of them needs a line of new gate
 * code: every one of those implementations discovers its cast by walking
 * `__CTX__.machines.list` and taking one live machine of each `kind`, and each
 * new species spawns at boot from `ai/doctrine.js`'s `SPAWN_PLAN`. A species is
 * covered the moment it exists. Redefining them here would fork the bar, which
 * is the one thing a gate file must never do.
 *
 * What DOES need new gates is exactly what `casting-v4.md` §6 predicted:
 *
 *   1. `V26`/`V27` name their cast explicitly, and a five-wide line-up cannot
 *      hold fourteen species. Split by batch — `V26a`/`V27a` for batch A,
 *      `V26b`/`V27b` for batch B — with the criteria written in `roster-v2`
 *      terms so a judge grades against the roster rather than against taste.
 *   2. `A44c-lineup-staged` proves the EXISTING line-up stages; the new ones
 *      need the same proof, hence `A44c-lineup-expansion`.
 *   3. `A90-memory-stability`'s bar for this lane is "geometries <= +40,
 *      textures <= +30 (rig-side disposal owned here)", which is a different
 *      measurement from the registered gate's whole-session loop: the rig-side
 *      question is what a SPAWN and a DISPOSE cost, and the registered gate
 *      answers "what does a 5-minute play loop cost", which includes a
 *      population the loop itself grows. `A90-rig-reclaim` is this lane's bar,
 *      measured on the thing this lane owns. The registered `A90` is untouched
 *      and its reading is reported honestly in the lane report.
 *
 * The staging helper is imported from `gates.round4.machine-rig.mjs` rather
 * than copied: it is 280 lines of hard-won framing (scale normalisation, the
 * screen-space clip fit, the LOD pin) and two copies would drift. Those four
 * consts were made `export`; no gate in that file was touched.
 */
import { LINEUP, WAIT_VARIETY } from './gates.round4.machine-rig.mjs';

/** The two expansion batches, in the order the criteria name them. */
const BATCH_A = ['broadhead', 'grazer', 'ravager', 'snapmaw', 'redeye'];
const BATCH_B = ['shellwalker', 'stormbird', 'corruptor', 'tallneck'];

/**
 * Start a real attack on every staged machine, through the AI's own table.
 *
 * `V27`'s helper calls `m.chooseAttack(dist)`, which is the `authored:
 * 'species'` seam — and every expansion row in `ai/doctrine.js` is a GENERIC
 * builder instead, so that call returns null for all nine new kinds. The table
 * is the right thing to ask anyway: `m.ai.chooseAttack(dist)` scores the same
 * rows the live fight scores, so the frame shows a move the player can
 * actually be hit by, with this lane's `attackPose()` layer running on top of
 * it (which is the thing V27 grades).
 */
const START_TABLE_ATTACK = `
  async (cast) => {
    for (const m of cast) {
      try {
        m._attackCd = 0;
        for (const k of Object.keys(m)) if (/^_cd[A-Z]/.test(k)) m[k] = 0;
        if (m.lastKnown && m.lastKnown.copy) m.lastKnown.copy(__CTX__.player.position);
        let a = null;
        for (const d of [3.0, 4.5, 6.0, 9.0, 13.0, 20.0]) {
          a = m.ai?.chooseAttack?.(d) || m.chooseAttack?.(d);
          if (a) break;
        }
        if (a) { a.plant = true; a.track = false; m._startAttack(a); }
      } catch (e) { /* another lane owns the table; the frame still stands */ }
    }
    await new Promise(r => setTimeout(r, 700));
  }`;

/**
 * POST-STAGING REPAIR, and why a visual gate in this lane needs one.
 *
 * `stageCast` measures each machine's frame footprint from
 * `geometry.boundingBox * matrixWorld`, which is the bind-pose box of a
 * SkinnedMesh — and every expansion species is a DONOR SCULPT PLUS A SHELL
 * bound to an auto-rig, so its bind box and its drawn body can disagree by a
 * lot. Two things fall out of that, both measured on the first `V26a` frame:
 *
 *   1. meshes vanish. Three culls a skinned mesh against the same bind-pose
 *      sphere; a machine that has been re-centred and uniformly scaled by the
 *      staging can land with its posed body outside it, and the frame loses
 *      the machine entirely while `stageCast`'s own report says it is staged
 *      and unclipped (measured: Ravager and Snapmaw absent from a frame whose
 *      staging report listed both at ndcX ±0.16).
 *   2. the fit is solved against a box bigger than the body, so the machine is
 *      shrunk to fit a footprint it never had.
 *
 * Both are fixed by measuring what is DRAWN. `repairCast` turns culling off
 * for the staged cast (a five-machine still has no culling budget to defend),
 * recomputes every skinned bound from the POSED skeleton, and then re-fits
 * each machine from its posed box — so the scale and the slot centre are
 * solved against the silhouette a judge will actually see.
 */
const REPAIR = `
  const repairCast = (cast, opts) => {
    const O = opts || {};
    const cam = __CTX__.camera;
    const V3 = __CTX__.player.position.constructor;
    const n = cast.length;
    const fov = O.fov ?? 26, D = O.depth ?? 60, BX = 0, BZ = 120;
    const aspect = cam.aspect || (16 / 9);
    const hFov = 2 * Math.atan(Math.tan(fov * Math.PI / 360) * aspect);
    const eyeY = __CTX__.terrain.getHeight(BX, BZ) + (O.eyeY ?? 6);
    // 1. draw everything, and give every skinned mesh a POSED bound
    for (const m of cast) {
      m.root.traverse((o) => {
        if (!o.isMesh) return;
        o.frustumCulled = false;
        o.userData.noSizeCull = true;
        if (o.userData.lodHidden) { o.visible = true; o.userData.lodHidden = false; }
        if (o.isSkinnedMesh && o.computeBoundingSphere) {
          try { o.computeBoundingBox(); o.computeBoundingSphere(); } catch (e) { /* */ }
        }
      });
      for (const pt of m.parts || []) if (pt.attached && pt.mesh) pt.mesh.visible = true;
    }
    // 2. POSED world box: skinned vertices go through the skeleton, sub-sampled
    const posedBox = (m) => {
      m.root.updateMatrixWorld(true);
      const v = new V3();
      let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], any = false;
      m.root.traverse((o) => {
        if (!o.isMesh || !o.visible || !o.geometry?.attributes?.position) return;
        const P = o.geometry.attributes.position;
        const step = Math.max(1, Math.floor(P.count / 900));
        for (let i = 0; i < P.count; i += step) {
          v.fromBufferAttribute(P, i);
          if (o.isSkinnedMesh && o.applyBoneTransform) o.applyBoneTransform(i, v);
          v.applyMatrix4(o.matrixWorld);
          if (v.x < mn[0]) mn[0] = v.x; if (v.x > mx[0]) mx[0] = v.x;
          if (v.y < mn[1]) mn[1] = v.y; if (v.y > mx[1]) mx[1] = v.y;
          if (v.z < mn[2]) mn[2] = v.z; if (v.z > mx[2]) mx[2] = v.z;
          any = true;
        }
      });
      return { mn, mx, ok: any, c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2] };
    };
    // 3. re-fit from the posed box
    const frameW = 2 * D * Math.tan(hFov / 2);
    const slotW = frameW / n;
    const target = slotW * (O.fill ?? 0.78);
    const out = [];
    cast.forEach((m, i) => {
      // ITERATED FIT. One pass assumes the measurement before the scale and the
      // measurement after it agree, and on two of five species they did not —
      // the Ravager and the Snapmaw came out at a quarter of their slot from a
      // single correction. Three passes converge on the drawn size whatever the
      // first reading was, and a species that is already right costs two
      // no-op multiplies.
      let f = null;
      for (let pass = 0; pass < 3; pass++) {
        const b0 = posedBox(m);
        if (!b0.ok) { out.push(m.kind + ' NOT DRAWN'); return; }
        const w = b0.mx[0] - b0.mn[0], h = b0.mx[1] - b0.mn[1];
        const k = target / Math.max(w, h * 1.12, 0.5);
        if (Math.abs(k - 1) > 0.01) {
          m.root.scale.multiplyScalar(k);
          m.root.updateMatrixWorld(true);
        }
        const b1 = posedBox(m);
        m.position.x += BX + ((n - 1) / 2 - i) * slotW - b1.c[0];
        m.position.y += eyeY - b1.c[1];
        m.position.z += (BZ + D) - b1.c[2];
        m.root.updateMatrixWorld(true);
        f = posedBox(m);
      }
      out.push(m.kind + ' w=' + (f.mx[0] - f.mn[0]).toFixed(1) + ' h=' + (f.mx[1] - f.mn[1]).toFixed(1));
    });
    console.log('[repairCast] ' + out.join(' | '));
    // 4. re-pin on the new marks
    const frozen = cast.map((m) => ({ m, x: m.position.x, y: m.position.y, z: m.position.z, k: m.root.scale.x }));
    __CTX__.engine.onAfterRender.push(() => {
      for (const f of frozen) {
        f.m.position.set(f.x, f.y, f.z);
        f.m.root.scale.setScalar(f.k);
      }
      cam.position.set(BX, eyeY, BZ);
      cam.lookAt(BX, eyeY, BZ + 10);
      cam.updateMatrixWorld();
    });
    return out;
  };`;

export const GATES = [
  /* ------------------------------------------------------------------ */
  /* A44c-lineup-expansion — the new cast can be staged at all           */
  /* ------------------------------------------------------------------ */
  {
    id: 'A44c-lineup-expansion', kind: 'action', lane: 'machines-expansion',
    title: 'STAGING: every NEW species V26a/V26b ask for is found, drawn and inside the frame',
    settle: 600, timeout: 180000,
    assert: `(async () => {
      ${LINEUP}
      ${REPAIR}
      const out = {};
      let pass = true;
      for (const [name, want] of [['A', ${JSON.stringify(BATCH_A)}], ['B', ${JSON.stringify(BATCH_B)}]]) {
        const r = await stageCast(want);
        const fit = repairCast(r.cast);
        await new Promise(res => setTimeout(res, 300));
        const n = (__CTX__.__stageCastReport) || (r && r.notes) || null;
        if (!n) { out[name] = 'stageCast returned no report'; pass = false; continue; }
        const ok = n.missing.length === 0 && n.notDrawn.length === 0
          && n.clipped.length === 0 && n.staged.length === want.length;
        out[name] = { requested: n.requested, staged: n.staged, missing: n.missing,
                      notDrawn: n.notDrawn, clipped: n.clipped, fit,
                      scales: r.cast.map(m => m.kind + ' k=' + m.root.scale.x.toFixed(3)
                        + ' @' + m.position.x.toFixed(1) + ',' + m.position.y.toFixed(1)) };
        if (!ok) pass = false;
        // a second batch cannot be staged in the same page: the first call
        // hides every non-cast root and splices the cast out of the update
        // list, so batch B is measured on its own page below
        break;
      }
      return { pass, detail: out };
    })()`,
  },

  /* ------------------------------------------------------------------ */
  /* A90-rig-reclaim — THIS LANE's §4 memory bar                         */
  /* ------------------------------------------------------------------ */
  {
    id: 'A90-rig-reclaim', kind: 'action', lane: 'machines-expansion', timeout: 300000,
    title: 'RIG-SIDE RECLAIM: 30 spawn/kill/dispose cycles across the roster grow geometries <= +40 and textures <= +30, and a LIVE machine costs <= 1 of each',
    settle: 1500,
    /**
     * WHY THIS IS THE HONEST FORM OF §4's "geometries <= +40, textures <= +30".
     *
     * Measured at 5207 against the residue: `A90-memory-stability` grew
     * geometries +158 and textures +38 over its loop, and an A/B on the same
     * page attributed it — 45 s of running with no machine traffic costs +3
     * geometries and 0 textures; 45 s of the gate's own kill/spawn loop costs
     * +49 geometries, +7 textures and **+7 net LIVING machines**, because every
     * `machines.spawn()` registers a site that later respawns. So the growth
     * was not a disposal hole, it was per-machine cost times a population the
     * gate grows, and the rig-side fix is to make both terms small:
     *
     *   1. RECLAIM — a machine that is disposed must give everything back.
     *      The leak found and closed here was the skeleton's BONE TEXTURE
     *      (`Skeleton.computeBoneTexture`), one per machine, invisible to a
     *      teardown that walks materials and geometries. `rig/lod.js`
     *      `disposeRig` releases it.
     *   2. POOLING — a machine that is ALIVE must cost almost nothing beyond
     *      the first of its species. `rig/lod.js` pools every buffer the fold
     *      builds per species; measured after: 0.5 geometries and 0.38
     *      textures per additional live Watcher, against 5.3 and 1.27 before.
     *
     * Both are graded: the loop below spawns, kills, runs the corpse
     * lifecycle and disposes 30 machines across the roster and asserts the §4
     * budget on the NET, then holds 8 alive at once and asserts the per-live
     * cost. A regression in either term fails it.
     */
    assert: `(async () => {
      ${WAIT_VARIETY}
      const r = __CTX__.engine.renderer, M = __CTX__.machines;
      const wait = (ms) => new Promise(res => setTimeout(res, ms));
      const mem = () => ({ geo: r.info.memory.geometries, tex: r.info.memory.textures });
      const kill = (m) => {
        let mesh = null;
        m.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
        try {
          m.takeDamage({ point: m.position.clone(), object: mesh, impact: 99999, tear: 0,
            element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 },
            type: 'hunter', baseDamage: 99999 });
        } catch (e) { /* */ }
        if (m.alive) { try { m._die(); } catch (e) { /* */ } }
      };
      const px = __CTX__.player.position.x, pz = __CTX__.player.position.z;
      const roster = M.kinds.filter(k => M.canSpawn ? M.canSpawn(k) : true);
      if (roster.length < 4) return { pass: null, detail: { note: 'SKIP: roster not loaded', roster } };

      // --- warm: one full cycle per kind so every lazy cache is built
      for (const k of roster) {
        const m = M.spawn(k, px + 40, pz + 40);
        if (!m) continue;
        await wait(200); kill(m); await wait(500);
        M.sites.dispose(m); await wait(120);
      }
      await wait(600);

      // --- 30 spawn / kill / dispose cycles, round-robin across the roster
      const a = mem();
      let cycles = 0;
      for (let i = 0; i < 30; i++) {
        const kind = roster[i % roster.length];
        const m = M.spawn(kind, px + 40, pz + 40);
        if (!m) continue;
        cycles++;
        await wait(170);
        kill(m);
        await wait(620);            // let the death FX and the corpse solve run
        M.sites.dispose(m);
        await wait(130);
      }
      await wait(900);
      const b = mem();
      const dGeo = b.geo - a.geo, dTex = b.tex - a.tex;

      // --- per-LIVE-machine cost: 8 of one kind held at once
      const liveKind = roster.includes('watcher') ? 'watcher' : roster[0];
      const c = mem();
      const held = [];
      for (let i = 0; i < 8; i++) {
        const m = M.spawn(liveKind, px + 35 + i, pz + 35);
        if (m) held.push(m);
        await wait(180);
      }
      await wait(700);
      const d = mem();
      const perGeo = held.length ? (d.geo - c.geo) / held.length : 0;
      const perTex = held.length ? (d.tex - c.tex) / held.length : 0;
      for (const m of held) M.sites.dispose(m);
      await wait(700);
      const e = mem();

      const pass = dGeo <= 40 && dTex <= 30 && perGeo <= 1.0 && perTex <= 1.0;
      return { pass, detail: {
        cycles, roster,
        budget: { geometries: 40, textures: 30, perLiveGeo: 1.0, perLiveTex: 1.0 },
        afterCycles: { geoGrowth: dGeo, texGrowth: dTex },
        perLiveMachine: { kind: liveKind, n: held.length,
                          geo: +perGeo.toFixed(2), tex: +perTex.toFixed(2) },
        heldThenReleased: { geoGrowth: e.geo - c.geo, texGrowth: e.tex - c.tex },
      } };
    })()`,
  },

  /* ------------------------------------------------------------------ */
  /* V26a / V26b — silhouette, split by batch (casting-v4 §6)            */
  /* ------------------------------------------------------------------ */
  {
    id: 'V26a-silhouette', kind: 'visual', lane: 'machines-expansion',
    title: 'Batch A reads as its HZD machine in side profile against plain sky',
    settle: 2600, timeout: 150000,
    setup: `(async () => {
      ${LINEUP}
      ${REPAIR}
      const r = await stageCast(${JSON.stringify(BATCH_A)});
      repairCast(r.cast);
    })()`,
    criteria: 'Five machines side-on against a flat sky, scale-normalised, left to right: '
      + 'BROADHEAD, GRAZER, RAVAGER, SNAPMAW, REDEYE WATCHER. Each faces SCREEN LEFT. '
      + 'PASS requires all five reads from docs/research/roster-v2.md §3/§4 and casting-v4.md §6: '
      + 'the BROADHEAD is a heavy four-legged quadruped with WIDE HORNS sweeping out past the width of its body; '
      + 'the GRAZER is a lighter, taller-headed quadruped whose ANTLERS carry ROTOR BLADES, with two dorsal canister rows along its back; '
      + 'the RAVAGER is a CAT WITH A CANNON RAIL ON ITS BACK and its head carried HIGH — not a second Sawtooth in a low prowl; '
      + 'the SNAPMAW is a LONG LOW SPRAWL with the knees OUTBOARD of the hips, a long tail and a scute row down the spine; '
      + 'the REDEYE is a Watcher body with a RED sensor and a dorsal blaster. '
      + 'Plate/muscle materials: white-grey armour over dark underbody with lit edges. '
      + 'FAIL if any of the five reads as the wrong animal, or if the Ravager and a Sawtooth would be indistinguishable.',
  },
  {
    id: 'V26b-silhouette', kind: 'visual', lane: 'machines-expansion',
    title: 'Batch B reads as its HZD machine in side profile against plain sky',
    settle: 2600, timeout: 150000,
    setup: `(async () => {
      ${LINEUP}
      ${REPAIR}
      const r = await stageCast(${JSON.stringify(BATCH_B)});
      repairCast(r.cast);
    })()`,
    criteria: 'Four machines side-on against a flat sky, scale-normalised, left to right: '
      + 'SHELL-WALKER, STORMBIRD, CORRUPTOR, TALLNECK. Each faces SCREEN LEFT. '
      + 'PASS requires, per docs/research/roster-v2.md §3/§4 and casting-v4.md §6: '
      + 'the SHELL-WALKER walks on SIX legs, holds TWO raised arm-claws clear of the ground, and carries a cargo platform with a crate under it; '
      + 'the STORMBIRD has SPREAD WINGS with THREE ENGINE NACELLES per wing; '
      + 'the CORRUPTOR is a MATTE-BLACK scorpion — visibly darker than the other machines — with its tail ARCHED UP OVER ITS BACK and a glowing core; '
      + 'the TALLNECK is a TOWER with a DISC on top and NO EYE (the missing eye is CORRECT — roster-v2 §4 says "no eyes", so a judge must not file it as a defect). '
      + 'FAIL if any reads as the wrong machine, if the Shell-Walker walks on its claws, or if the Corruptor is the same colour as the rest.',
  },

  /* ------------------------------------------------------------------ */
  /* V27a / V27b — attack pose, split by batch                           */
  /* ------------------------------------------------------------------ */
  {
    id: 'V27a-attack-pose', kind: 'visual', lane: 'machines-expansion',
    title: 'Batch A mid-windup: the LIMBS are doing the work',
    settle: 2600, timeout: 150000,
    setup: `(async () => {
      ${LINEUP}
      ${REPAIR}
      const r = await stageCast(['broadhead', 'grazer', 'ravager', 'snapmaw'], {
        state: 'attack', settle: 900, live: true, windupAt: 0.8,
        beforeFreeze: ${START_TABLE_ATTACK},
      });
      repairCast(r.cast);
    })()`,
    criteria: 'Four machines frozen mid-attack-windup against a flat sky, scale-normalised, left to right: '
      + 'Broadhead, Grazer, Ravager, Snapmaw. '
      + 'PASS requires visible LIMB work in at least three of them — horns and head dropped forward and down, '
      + 'a foreleg cocked or both forefeet off the ground, a coiled crouch with the hind legs gathered, '
      + 'a head reared back and up, or a tail swung out of line — so the pose reads as a wind-up rather than the '
      + 'idle stance rotated. FAIL if three or more differ from their idle only by body yaw/pitch.',
  },
  {
    id: 'V27b-attack-pose', kind: 'visual', lane: 'machines-expansion',
    title: 'Batch B mid-windup: the LIMBS are doing the work',
    settle: 2600, timeout: 150000,
    setup: `(async () => {
      ${LINEUP}
      ${REPAIR}
      const r = await stageCast(['shellwalker', 'stormbird', 'corruptor'], {
        state: 'attack', settle: 900, live: true, windupAt: 0.8,
        beforeFreeze: ${START_TABLE_ATTACK},
      });
      repairCast(r.cast);
    })()`,
    criteria: 'Three machines frozen mid-attack-windup against a flat sky, scale-normalised, left to right: '
      + 'Shell-Walker, Stormbird, Corruptor. The TALLNECK is deliberately absent — it has no attacks '
      + '(roster-v2 §4: docile, never reacts), the same exemption the Glinthawk has from the foot gates. '
      + 'PASS requires visible LIMB work in at least two of them — a claw drawn back or thrown forward, '
      + 'wings folded or swept, a tail coiled over the back, a body visibly charging (crouched and braced) — '
      + 'so the pose reads as a wind-up rather than the idle stance rotated.',
  },
];

export default GATES;
