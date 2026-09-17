/**
 * Round 4 gates — lane `combat-memory`.
 *
 * The lane exists because the app CRASHED: `A90-memory-stability` (core)
 * proved the session grows per machine death even after the full corpse
 * lifecycle has run at distance. These four gates hold the half of that number
 * combat is answerable for — every particle, spark, chip, decal, scorch,
 * explosion ring, arrow, bomb, disc and DOM node the weapon systems put on
 * screen — to a CONSTANT, and prove that the one place combat could retain a
 * dead machine (a pooled arrow re-parented into a corpse's skeleton) lets go
 * the moment the site reclaims the wreck.
 *
 * SCOPE. `combat.memoryAudit()` covers every file under `src/combat/`: the
 * particle/decal/blast pools, the arrow / bomb / disc pools, the seven weapon
 * models, AND the 74 rope/wire/preview meshes of `traps.js` plus the swing
 * trail and spear of `melee.js` (combat.js `_trapRoots` / `_meleeRoots`).
 * Those last 83 objects were invisible to the first cut of these gates, which
 * meant a `new THREE.Mesh` per tripwire or per swing could have passed all
 * four; `dTrapObjects` / `dMeleeObjects` are asserted at zero in A94 and
 * reported in A91. The contract is written up in
 * `docs/ROUND4-COMBAT-MEMORY.md`.
 *
 * GATE IDS. A91-A94 were unregistered when this lane opened (the highest id
 * in the merged suite was A90), so no `-lane` suffix is needed and nothing
 * collides. Same contract as tools/gates.config.mjs: ACTION gates resolve
 * { pass, detail } in page context with `__CTX__` / `__GAME__` available, and
 * any console error during a gate is a FAIL.
 *
 * WHAT THESE GATES DELIBERATELY DO NOT CLAIM. `renderer.info.memory` is a
 * WHOLE-PROCESS counter: a kill also runs machine death FX, part tear-off,
 * corpse fade and a site respawn, all of which live in `machine-ai` /
 * `machine-rig` files this lane may not touch. A91 therefore makes its
 * zero-growth claim on a combat-ONLY workload (sixty shots, every ammo type,
 * no kills), while A94 runs the mandated sixty-shots-plus-ten-kills loop,
 * asserts the combat-owned terms exactly, and REPORTS the global geometry /
 * texture / heap deltas in its detail so the residue stays visible and
 * attributable instead of being quietly absorbed.
 */

const INPUT_ON = `__CTX__.input.enabled = true;`;

/** Freeze every machine except `keep` so nothing wanders into the scenario. */
const FREEZE = `function freezeAll(keep) {
  const set = new Set(keep || []);
  for (const m of __CTX__.machines.list) {
    if (set.has(m)) continue;
    if (!m._frozenByGate) { m._frozenByGate = m.update; m.update = () => {}; }
  }
}`;

/** Point the lens at a machine and stand `d` metres off it. */
const FACE = `async function face(m, d) {
  const p = __CTX__.player;
  p.position.set(m.position.x + d, 0, m.position.z + d);
  p._snapToGround?.();
  const b = Math.atan2(m.position.x - p.position.x, m.position.z - p.position.z);
  p.camYaw = b + Math.PI; p.heading = b; p.camPitch = 0; p.moveSpeed = 0;
  try { p._updateCamera?.(0); } catch {}
  await new Promise(r => setTimeout(r, 140));
}`;

/**
 * Fire one round of a named weapon/ammo at a world point, straight through
 * `Combat._fire` so the real nock -> ballistics -> sweep -> impact path runs
 * (a gate that calls the pools directly would not test the thing that leaks).
 */
const FIRE = `async function fire(wid, ammo, x, y, z, waitMs) {
  const cb = __CTX__.combat;
  cb.setWeapon(wid, { silent: true });
  try { cb.selectAmmo(wid, ammo); } catch {}
  cb.ammo[ammo] = 999;
  cb.drawStrength = 1;
  cb.aimPoint.set(x, y, z);
  cb._fire();
  await new Promise(r => setTimeout(r, waitMs === undefined ? 130 : waitMs));
}`;

/** Every projectile ammo type in the game, by the weapon that fires it. */
const AMMO_MATRIX = `const TYPES = [
  ['hunter-bow', 'hunter'], ['hunter-bow', 'hardpoint'], ['hunter-bow', 'fire'],
  ['sharpshot-bow', 'precision'], ['sharpshot-bow', 'tearblast'],
  ['war-bow', 'shock'], ['war-bow', 'freeze'],
  ['blast-sling', 'blast-bomb'],
];`;

/** One combined snapshot: combat's own audit + the global counters. */
const SNAP = `function snap() {
  const C = __CTX__;
  const r = C.renderer || C.engine?.renderer;
  const a = C.combat.memoryAudit();
  let sceneTotal = 0; C.scene.traverse(() => sceneTotal++);
  return {
    fp: a.fingerprint,
    sceneObjects: a.sceneObjects, live: a.live,
    riding: a.arrows.riding, orphaned: a.arrows.orphaned, detached: a.arrows.detached,
    arrowsInScene: a.arrows.inScene, bombsInScene: a.bombs.inScene, discsInScene: a.discs.inScene,
    poolLive: Object.fromEntries(Object.entries(a.pools).map(([k, v]) => [k, v.live])),
    poolMax: Object.fromEntries(Object.entries(a.pools).map(([k, v]) => [k, v.max])),
    poolOver: Object.entries(a.pools).filter(([, v]) => v.live > v.max).map(([k]) => k),
    /* live MINUS the scorch decals. Decals age on the FX clock (see A91), so
     * "how many are still fading" is a function of frame rate; "are they
     * inside the cap, and do they drain on command" is not. */
    liveTransient: a.live - a.pools.decals.live,
    trapObjects: a.traps.objects, meleeObjects: a.melee.objects,
    domCombat: a.dom.combat, dom: a.dom.document,
    geo: r.info.memory.geometries, tex: r.info.memory.textures, sceneTotal,
    heap: performance.memory ? performance.memory.usedJSHeapSize : null,
  };
}`;

/** Kill a machine through the real damage path. */
const KILL = `function kill(m) {
  let mesh = null; m.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
  m.takeDamage({ point: m.position.clone(), object: mesh, impact: 99999, tear: 0,
    element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 },
    type: 'hunter', baseDamage: 99999 });
}`;

export const GATES = [
  /* ------------------------------------------------------------------ A91 */
  {
    id: 'A91-combat-fx-bounded', kind: 'action', lane: 'combat-memory', timeout: 180000,
    title: 'Sixty shots across all eight ammo types add zero geometries, zero textures '
      + 'and zero scene objects: every combat effect is pooled behind a hard cap, '
      + 'and the whole FX layer drains on command',
    setup: INPUT_ON,
    settle: 1200,
    assert: `(async () => {
      ${FREEZE} ${FACE} ${FIRE} ${SNAP} ${AMMO_MATRIX}
      const C = __CTX__, p = C.player;
      freezeAll([]);
      const gy = (x, z) => C.terrain ? C.terrain.getHeight(x, z) : 0;
      /* WARM-UP. A texture or geometry is counted by the renderer the first
       * time it is RENDERED, so the first fire-arrow, the first bomb and the
       * first scorch each legitimately upload once. That is initialisation,
       * not growth — the baseline is taken after it, and every shot the gate
       * measures is then required to cost exactly nothing. */
      for (const [w, a] of TYPES) await fire(w, a, p.position.x + 20, gy(p.position.x + 20, p.position.z + 20), p.position.z + 20, 260);
      await new Promise(r => setTimeout(r, 6000));
      /* CONTROL WINDOW. renderer.info.memory is a WHOLE-PROCESS counter and the
       * world keeps streaming underneath a standing player (measured on port
       * 5208: +6 geometries / +1 texture over 28 idle seconds with the roster
       * frozen and not a single shot fired, none of them reachable from the
       * scene graph). So the gate first measures the ambient drift over a
       * window of the same length, and the shooting window must not beat it. */
      const c0 = snap();
      await new Promise(r => setTimeout(r, 28000));
      const c1 = snap();
      const ambientGeo = c1.geo - c0.geo, ambientTex = c1.tex - c0.tex;
      const before = snap();
      let shots = 0;
      for (let i = 0; i < 60; i++) {
        const [w, a] = TYPES[i % TYPES.length];
        const d = 14 + (i % 5) * 6;
        const x = p.position.x + d, z = p.position.z + d;
        await fire(w, a, x, gy(x, z), z);
        shots++;
      }
      /* long enough for every particle, arrow, bomb and blast ring to expire.
       *
       * NOT long enough to be sure about the scorch decals, and the gate no
       * longer pretends otherwise. Decals age on combat's FX clock, whose step
       * is min(0.05, realDt) (combat.js update), so below 20 fps the
       * decal clock runs SLOWER than the wall clock: a 16 s decal needs 16 s
       * of wall time on an idle box (measured: t = 16.03 s after a 20.00 s
       * wall wait, a 0.03 s margin) and up to 32 s on a box at 10 fps. Racing
       * that clock made this gate's result depend on machine load — it passed
       * alone and failed inside the suite with liveAfter: 3.
       *
       * So the claim is split into the two halves that are actually about
       * memory, neither of which has a clock in it: everything that is not a
       * decal must have expired, the decals must be inside their hard cap
       * however many are still fading, and then the whole FX layer must DRAIN
       * ON COMMAND via clearFx(). That is strictly more than the old
       * assertion tested, because a decal pool that had grown past its cap or
       * refused to release would now fail in two places instead of one. */
      await new Promise(r => setTimeout(r, 20000));
      const after = snap();
      const dGeo = after.geo - before.geo, dTex = after.tex - before.tex;
      const dObj = after.sceneObjects - before.sceneObjects;
      C.combat.clearFx();
      await new Promise(r => setTimeout(r, 600));
      const drained = snap();
      /* THE COMBAT-SCOPED CLAIM. combat.gpuFingerprint() is a CUMULATIVE set of
       * every geometry / material / texture the weapon systems have ever
       * referenced, so after a warm-up that has touched all six weapons and all
       * eight ammo types, a barrage must add nothing to it.
       *
       * MATERIALS are reported but not asserted, and the reason is measured,
       * not assumed: the sharpshot bow's two body materials are REPLACED (2
       * added, 2 removed, set size unchanged at 86) the first time the model is
       * seen in its stowed bone rather than in the hand — a scene-wide material
       * patch from another lane's lighting/weather pass, one-off per model
       * state, not a combat allocation. Geometry and texture counts are the
       * terms combat actually controls, and they must not move at all. */
      const fpSame = after.fp.geometries === before.fp.geometries
        && after.fp.textures === before.fp.textures;
      /* The global counter keeps a BOUND rather than a zero. renderer.info is
       * whole-process: measured on port 5208 the sixty-shot window moves it by
       * +6 geometries / +1 texture while combat's own cumulative fingerprint
       * moves by 0/0 and a scene-graph diff over the same window finds no new
       * combat object at all (the +1 is a machine skeleton's boneTexture
       * computed the first time that mesh is rendered). The bound is what has
       * the teeth: anything that allocates PER SHOT lands at +60 and fails
       * here, whichever lane wrote it. */
      const fpDrained = drained.fp.geometries === before.fp.geometries
        && drained.fp.textures === before.fp.textures;
      const pass = shots === 60 && fpSame && dObj === 0
        && after.liveTransient === 0
        && after.poolLive.decals <= after.poolMax.decals
        && after.detached === 0 && after.poolOver.length === 0
        && drained.live === 0 && drained.sceneObjects === before.sceneObjects
        && fpDrained && drained.poolOver.length === 0
        && dGeo <= 10 && dTex <= 3;
      return { pass, detail: { shots, combatGeoTexUnchanged: fpSame,
        dCombatGeometries: after.fp.geometries - before.fp.geometries,
        dCombatTextures: after.fp.textures - before.fp.textures,
        dCombatMaterials: after.fp.materials - before.fp.materials,
        dSceneObjects: dObj,
        liveTransientAfter: after.liveTransient,
        decalsAfter: after.poolLive.decals + '/' + after.poolMax.decals,
        liveAfterClearFx: drained.live,
        dSceneObjectsAfterClearFx: drained.sceneObjects - before.sceneObjects,
        detached: after.detached,
        poolOverCap: after.poolOver,
        subSystems: { trapObjects: after.trapObjects, meleeObjects: after.meleeObjects,
          dTrapObjects: after.trapObjects - before.trapObjects,
          dMeleeObjects: after.meleeObjects - before.meleeObjects },
        gpu: { shotsWindow: { dGeo, dTex }, idleControlWindow: { dGeo: ambientGeo, dTex: ambientTex } },
        before, after, drained } };
    })()`,
  },

  /* ------------------------------------------------------------------ A92 */
  /**
   * FIX ROUND 2 — this gate was rewritten twice over, for two findings.
   *
   * J1: the old version called `sites.dispose(m)` by hand one second after the
   * shot and called that "exactly the way the site lifecycle does". It is not.
   * A stuck arrow SELF-RECYCLES at `age > 10` over a 0.35 s taper (arrows.js
   * `update`), and the corpse lifecycle's fastest route to `dispose()` is
   * freeze at `SITE.freeze` 10 s plus a 12 s dissolve = ~22 s after death, so
   * in wall time a rider is always gone before the wreck is. The gate now
   * drives the REAL lifecycle through `sites.advance(95, 1)` — the debug hook
   * sites.js:75 publishes for exactly this — which runs freeze -> fade ->
   * dispose -> `machine-disposed` in one synchronous burst while the riders
   * are still ~1 s old. Measured: `ridingAtDeath 8`, wreck disposed, riders
   * released. Phase B then covers the one route that reaches a rider in REAL
   * time: `src/core/save.js:426` (`_applyRoster`) disposes LIVE machines on
   * load, with no 10 s of grace anywhere in it.
   *
   * J2: `sites.dispose()` traverses `m.root` and calls `dispose()` on every
   * geometry and material it finds, BEFORE it emits `machine-disposed`
   * (sites.js:118-145). While a stuck arrow was a CHILD of that root, combat's
   * shared module singletons were inside that traverse and the old gate had no
   * term for it. It does now, and the instrument is a `dispose` listener on
   * every asset `combat.sharedAssets()` publishes — not a counter. Measured
   * why: `renderer.info.memory.geometries` moves by -10 either way (a second
   * dispose of an already-freed geometry does not decrement twice, and three
   * re-uploads from the RAM copy on the next frame), and
   * `combat.gpuFingerprint()` does not move at all (it is a cumulative set of
   * REFERENCES, and the arrow still references the geometry it just lost).
   * Both are reported; neither can carry the claim.
   *
   * PHASE C is the negative control, and it runs FIRST so any renderer churn
   * it causes heals long before the real phases assert. It re-parents live
   * riders into `m.root` — the exact pre-fix shape — and requires the
   * listeners to FIRE (measured: 24 geometry + 40 material + 17 sprite
   * events). A gate whose instrument has gone blind therefore fails here
   * instead of passing everywhere.
   */
  {
    id: 'A92-arrow-corpse-release', kind: 'action', lane: 'combat-memory', timeout: 260000,
    title: 'A wreck reclaimed by the real corpse lifecycle releases its riders and destroys '
      + 'none of combat\'s shared GPU assets — proven against a negative control that '
      + 'shows the same instrument firing 24 times on the pre-fix shape',
    setup: INPUT_ON,
    settle: 1000,
    assert: `(async () => {
      ${FREEZE} ${FACE} ${FIRE} ${SNAP} ${KILL}
      const C = __CTX__, cb = C.combat;
      const r = C.renderer || C.engine?.renderer;
      freezeAll([]);
      const fresh = () => C.machines.list.find(x => x.alive !== false && !x._disposed && x.root);

      /* A rider can only exist on a machine that is TICKING: its per-bone hit
       * hulls are refreshed by its own update, and arrows fly straight through
       * a frozen one (measured: 14 shots, 0 riding). */
      const thaw = (m) => { if (m._frozenByGate) { m.update = m._frozenByGate; m._frozenByGate = null; } };

      async function plant(m, n) {
        thaw(m);
        await face(m, 9);
        for (let i = 0; i < n; i++) {
          m.health = m.maxHealth;
          await fire('hunter-bow', 'hunter', m.position.x, m.position.y + (m.height || 2) * 0.5, m.position.z);
        }
        await new Promise(x => setTimeout(x, 600));
        return cb.arrows.audit().riding;
      }

      /* dispose-listener instrument over everything combat.sharedAssets()
       * publishes, plus THREE's process-wide Sprite quad (reported, never
       * asserted — any lane's sprite can free it). */
      function instrument() {
        const sa = cb.sharedAssets();
        const ev = { geo: 0, mat: 0, tex: 0, sprite: 0 };
        const offs = [];
        const bind = (o, k) => { const f = () => { ev[k]++; }; o.addEventListener('dispose', f); offs.push([o, f]); };
        for (const g of sa.geometries) bind(g, 'geo');
        for (const m of sa.materials) bind(m, 'mat');
        for (const t of sa.textures) bind(t, 'tex');
        bind(cb.arrows.list[0].glow.geometry, 'sprite');
        return { ev, stop: () => { for (const [o, f] of offs) o.removeEventListener('dispose', f); } };
      }

      function strays() {
        let n = 0;
        for (const a of cb.arrows.list) { let t = a.group; while (t.parent) t = t.parent; if (t !== C.scene) n++; }
        return n;
      }

      /* =============== PHASE C (first): NEGATIVE CONTROL =============== */
      const mC = fresh();
      if (!mC) return { pass: null, detail: 'SKIP: empty roster' };
      const ridingC = await plant(mC, 14);
      let reparented = 0;
      for (const a of cb.arrows.list) if (a.stuckTo === mC) { mC.root.attach(a.group); reparented++; }
      const insC = instrument();
      C.machines.sites.dispose(mC);
      await new Promise(x => setTimeout(x, 1200));
      insC.stop();
      const control = { riding: ridingC, reparented, ev: { ...insC.ev } };
      cb.arrows.recycleAll();
      /* let three re-upload the buffers the control just freed */
      await new Promise(x => setTimeout(x, 2500));

      /* =============== PHASE A: THE REAL CORPSE LIFECYCLE =============== */
      const mA = fresh();
      if (!mA) return { pass: null, detail: { skip: 'roster exhausted after control', control } };
      const ridingA = await plant(mA, 14);
      const insA = instrument();
      const fpA0 = cb.gpuFingerprint(), geoA0 = r.info.memory.geometries;
      const disposedA0 = C.machines.sites.audit().disposed;
      kill(mA);
      await new Promise(x => setTimeout(x, 900));
      const ridingAtDeath = cb.arrows.audit().riding;
      /* the published debug hook: run the corpse clock forward through
       * freeze -> fade -> dispose while the riders are ~1 s old. */
      const siteAudit = C.machines.sites.advance(95, 1);
      await new Promise(x => setTimeout(x, 900));
      insA.stop();
      const aA = cb.arrows.audit();
      const fpA1 = cb.gpuFingerprint();
      const phaseA = {
        ridingBeforeDeath: ridingA, ridingAtDeath,
        wreckDisposed: !!mA._disposed,
        sitesDisposedDelta: C.machines.sites.audit().disposed - disposedA0,
        riding: aA.riding, orphaned: aA.orphaned, detached: aA.detached, hosted: aA.hosted,
        inScene: aA.inScene + '/' + aA.max, stray: strays(),
        combatAssetDisposals: { ...insA.ev },
        dFingerprint: { geometries: fpA1.geometries - fpA0.geometries,
          materials: fpA1.materials - fpA0.materials, textures: fpA1.textures - fpA0.textures },
        dRendererGeometries: r.info.memory.geometries - geoA0,
      };

      /* ===== PHASE B: OUT-OF-BAND EARLY DISPOSE (save.js _applyRoster) ===== */
      const mB = fresh();
      if (!mB) return { pass: null, detail: { skip: 'roster exhausted before phase B', control, phaseA } };
      let phaseB = null;
      {
        const ridingB = await plant(mB, 14);
        const insB = instrument();
        C.machines.sites.dispose(mB);   // the save-load roster reconcile route
        await new Promise(x => setTimeout(x, 1200));
        insB.stop();
        const aB = cb.arrows.audit();
        phaseB = { ridingBefore: ridingB, wreckDisposed: !!mB._disposed,
          riding: aB.riding, orphaned: aB.orphaned, detached: aB.detached, hosted: aB.hosted,
          inScene: aB.inScene + '/' + aB.max, stray: strays(),
          combatAssetDisposals: { ...insB.ev } };
      }

      /* The tex term is vacuous by construction and is asserted only so a
       * future traverse that DOES free textures cannot slip through: sites.js
       * frees geometries and materials, and Material.dispose() does not touch
       * its maps, so the control measures tex 0 as well. geo and mat are the
       * terms with teeth - 24 and 40 on the pre-fix shape. */
      const clean = (ph) => ph && ph.riding === 0 && ph.orphaned === 0 && ph.detached === 0
        && ph.hosted === 0 && ph.stray === 0
        && ph.combatAssetDisposals.geo === 0 && ph.combatAssetDisposals.mat === 0
        && ph.combatAssetDisposals.tex === 0;

      const pass = control.reparented > 0 && control.ev.geo > 0 && control.ev.mat > 0
        && phaseA.ridingAtDeath > 0 && phaseA.wreckDisposed && phaseA.sitesDisposedDelta >= 1
        && clean(phaseA)
        && phaseA.dFingerprint.geometries === 0 && phaseA.dFingerprint.textures === 0
        && phaseB !== null && phaseB.wreckDisposed && clean(phaseB);

      return { pass, detail: { control, phaseA, phaseB, note:
        'control = the pre-fix shape (riders re-parented into m.root) proving the listeners '
        + 'are on the right objects; phaseA = kill + sites.advance(95,1), the shipped '
        + 'lifecycle; phaseB = sites.dispose() out of band, the save.js:426 roster-reload '
        + 'route. combatAssetDisposals.sprite is THREE\\'s process-wide Sprite quad and is '
        + 'REPORTED only — the wreck\\'s own eye-glow sprite frees it (see doc §7).' } };
    })()`,
  },

  /* ------------------------------------------------------------------ A93 */
  {
    id: 'A93-combat-dom-bounded', kind: 'action', lane: 'combat-memory', timeout: 240000,
    title: 'Sixty shots and ten kills leave no DOM residue: combat\'s own overlay is a fixed '
      + 'node count and the document returns to its baseline',
    setup: INPUT_ON,
    settle: 1200,
    assert: `(async () => {
      ${FREEZE} ${FACE} ${FIRE} ${SNAP} ${KILL} ${AMMO_MATRIX}
      const C = __CTX__, p = C.player;
      const gy = (x, z) => C.terrain ? C.terrain.getHeight(x, z) : 0;
      const before = snap();
      let shots = 0, kills = 0;
      for (let i = 0; i < 60; i++) {
        const m = C.machines.list.find(x => x.alive && !x._disposed);
        if (!m) break;
        if (i % 6 === 0) await face(m, 14);
        const [w, a] = TYPES[i % TYPES.length];
        let x, y, z;
        if (i % 2 === 0) { m.health = m.maxHealth; x = m.position.x; y = m.position.y + 1; z = m.position.z; }
        else { x = p.position.x + 18; z = p.position.z + 18; y = gy(x, z); }
        await fire(w, a, x, y, z);
        shots++;
        if (i % 6 === 5) { kill(m); kills++; await new Promise(r => setTimeout(r, 500)); }
      }
      await new Promise(r => setTimeout(r, 2500));
      const atBurst = snap();
      const p0 = p.position.clone();
      p.position.set(p0.x + 150, 0, p0.z + 150); p._snapToGround?.();
      await new Promise(r => setTimeout(r, 30000));
      const after = snap();
      const dCombat = after.domCombat - before.domCombat;
      const dDoc = after.dom - before.dom;
      /* combat's own overlay must be EXACTLY constant; the document as a whole
       * is shared with the HUD's pooled toasts and prompts, so it is held to a
       * return-to-baseline with a small tolerance rather than to zero. */
      const pass = shots === 60 && kills >= 8 && dCombat === 0 && dDoc <= 8;
      return { pass, detail: { shots, kills, dCombatNodes: dCombat, dDocumentNodes: dDoc,
        burstPeakNodes: atBurst.dom - before.dom, before, atBurst, after } };
    })()`,
  },

  /* ------------------------------------------------------------------ A94 */
  {
    id: 'A94-combat-memory-return', kind: 'action', lane: 'combat-memory', timeout: 300000,
    title: 'Sixty shots and ten kills: every combat-owned count — pools, arrows, traps, melee, '
      + 'DOM — returns to baseline within 30 s (and the global renderer/heap residue is '
      + 'reported and attributed)',
    setup: INPUT_ON,
    settle: 1200,
    assert: `(async () => {
      ${FREEZE} ${FACE} ${FIRE} ${SNAP} ${KILL} ${AMMO_MATRIX}
      const C = __CTX__, p = C.player;
      const gy = (x, z) => C.terrain ? C.terrain.getHeight(x, z) : 0;
      /* warm-up so first-render uploads are not read as growth */
      let mw = C.machines.list.find(x => x.alive && !x._disposed);
      if (!mw) return { pass: null, detail: 'SKIP: empty roster' };
      await face(mw, 14);
      for (const [w, a] of TYPES) {
        mw.health = mw.maxHealth;
        await fire(w, a, mw.position.x, mw.position.y + 1, mw.position.z, 240);
      }
      await new Promise(r => setTimeout(r, 6000));
      mw.health = mw.maxHealth;
      if (window.gc) window.gc();
      const before = snap();
      let shots = 0, kills = 0;
      for (let i = 0; i < 60; i++) {
        const m = C.machines.list.find(x => x.alive && !x._disposed);
        if (!m) break;
        if (i % 6 === 0) await face(m, 14);
        const [w, a] = TYPES[i % TYPES.length];
        let x, y, z;
        if (i % 2 === 0) { m.health = m.maxHealth; x = m.position.x; y = m.position.y + 1; z = m.position.z; }
        else { x = p.position.x + 18; z = p.position.z + 18; y = gy(x, z); }
        await fire(w, a, x, y, z);
        shots++;
        if (i % 6 === 5) { kill(m); kills++; await new Promise(r => setTimeout(r, 500)); }
      }
      await new Promise(r => setTimeout(r, 2500));
      const atBurst = snap();
      const p0 = p.position.clone();
      p.position.set(p0.x + 150, 0, p0.z + 150); p._snapToGround?.();
      await new Promise(r => setTimeout(r, 30000));
      if (window.gc) window.gc();
      await new Promise(r => setTimeout(r, 800));
      const after = snap();
      /* same split as A91: decals age on the FX clock, which runs slow under
       * load, so they are held to their CAP here and to zero after an explicit
       * drain — everything else must have expired on its own within the 30 s. */
      C.combat.clearFx();
      await new Promise(r => setTimeout(r, 600));
      const drained = snap();
      const heapGrowth = (before.heap && after.heap) ? (after.heap - before.heap) / before.heap : null;
      const combatOwned = {
        dSceneObjects: after.sceneObjects - before.sceneObjects,
        liveTransientAfter: after.liveTransient,
        decalsAfter: after.poolLive.decals + '/' + after.poolMax.decals,
        liveAfterClearFx: drained.live,
        dSceneObjectsAfterClearFx: drained.sceneObjects - before.sceneObjects,
        dTrapObjects: after.trapObjects - before.trapObjects,
        dMeleeObjects: after.meleeObjects - before.meleeObjects,
        orphaned: after.orphaned,
        detached: after.detached,
        arrowsInScene: after.arrowsInScene + '/' + C.combat.arrows.audit().max,
        dCombatDom: after.domCombat - before.domCombat,
        poolOverCap: after.poolOver,
      };
      /* NOT combat's to fix — recorded so the residue stays attributable.
       * Measured on port 5208: every disposed machine leaves one live
       * skeleton.boneTexture behind (ai/sites.js disposes geometries and
       * materials but never the Skeleton), plus the per-death FX/part churn. */
      const global = {
        dGeometries: after.geo - before.geo,
        dTextures: after.tex - before.tex,
        dSceneTotal: after.sceneTotal - before.sceneTotal,
        heapGrowthPct: heapGrowth === null ? 'n/a' : +(heapGrowth * 100).toFixed(1),
        note: 'geometry/texture residue after kills is machine-ai / machine-rig: '
          + 'corpse dispose never calls skeleton.dispose(), so each reclaimed wreck '
          + 'keeps one boneTexture uploaded',
      };
      const pass = shots === 60 && kills >= 8
        && combatOwned.dSceneObjects === 0
        && combatOwned.liveTransientAfter === 0
        && after.poolLive.decals <= after.poolMax.decals
        && combatOwned.liveAfterClearFx === 0
        && combatOwned.dSceneObjectsAfterClearFx === 0
        && combatOwned.dTrapObjects === 0 && combatOwned.dMeleeObjects === 0
        && combatOwned.orphaned === 0 && combatOwned.detached === 0
        && combatOwned.dCombatDom === 0 && combatOwned.poolOverCap.length === 0
        && (heapGrowth === null || heapGrowth < 0.25);
      return { pass, detail: { shots, kills, combatOwned, global, before, atBurst, after, drained } };
    })()`,
  },
];
