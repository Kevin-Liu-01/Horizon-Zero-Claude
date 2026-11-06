/**
 * ROUND 5 — lane `armory` gates (docs/ROUND5-PLAN.md §9 "armory (W1, W3)"; W1 block).
 *
 *   node tools/gates.mjs --port 5257 --lane armory        (auto-discovered, gates.config.mjs)
 *
 * W1 scope (plan §9): armor variants Pan I–III and Ash I, weapon variants Sabina and
 * Shepherd's. The W2 poses of the swap matrix (gaff hook-rip, Windwall guard, pendulum
 * release) and the perks whose hooks land with combat-kit report PENDING by name.
 * Carried rows the block repeats run under `<id>@armory` with the carried row's own
 * assert (never a copy), so A4, A5, A51, A52 and V29 stay single-sourced.
 * Page helpers live in `src/hero/{matrix,sheets}.js` (dev / gate modules; never bundled).
 */
import { PLACES, placed, placedSetup } from './gate-places.mjs';
import { GATES as CARRIED } from './gates.r5.carried.mjs';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANE = 'armory';
void PLACES;

const PRE = `
      const C = __CTX__, p = C.player, an = p.animator, cmb = C.combat, E = C.engine, H = p.hero;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const simWait = async (sec, capMs = 25000) => { const s0 = E.simTime, w0 = performance.now(); while (E.simTime - s0 < sec && performance.now() - w0 < capMs) await frame(); return E.simTime - s0; };
      const freeze = () => { for (const m of (C.machines?.list || [])) m.update = () => {}; };
      const keys = C.input.keys;
      const release = () => { keys.clear(); C.input.mouse.buttons = 0; };
      const mem = () => { const i = C.renderer.info.memory; return { geo: i.geometries, tex: i.textures }; };
      const frames = async (n = 4) => { for (let i = 0; i < n; i++) await frame(); };
      const inHand = (M) => !M.layer?.ok || !!M.layer._held;   /* melee's own test: the layer's re-parent, not the stance clock */
      /* the lance through its own path: a swing from holstered draws it; aiming stows it fast (R8, R5) */
      const lanceOut = async () => {
        const M = cmb.melee;
        if (M.stance !== 'holstered' && H._lanceOut) return;
        M.swing({});
        const w0 = performance.now();
        // out of the draw and physically in her hand, not merely asked for
        while (performance.now() - w0 < 5000) { await frame(); if (H._lanceOut && inHand(M) && M.stance === 'ready' && M.poseState().phase === 'idle') break; }
        await frames(3);
      };
      const lanceAway = async () => {
        const M = cmb.melee;
        C.input.mouse.buttons |= 4;
        const w0 = performance.now();
        while (performance.now() - w0 < 5000) { await frame(); if (!H._lanceOut && M.stance === 'holstered') break; }
        C.input.mouse.buttons = 0;
        cmb._holsterT = 0;
        await simWait(0.4, 3000);
      };`;

const IDS = ['pan-1', 'pan-2', 'pan-3', 'ash-1'];
const carriedRow = (id) => CARRIED.find((g) => g.id === id);
const asArmory = (id, extra = {}) => {
  const g = carriedRow(id);
  if (!g) return null;
  return Object.defineProperties({}, { ...Object.getOwnPropertyDescriptors(g), id: { value: `${id}@armory`, enumerable: true }, lane: { value: LANE, enumerable: true }, shadowOf: { value: id, enumerable: true }, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, { value: v, enumerable: true }])) });
};

/* ---------------------------------------------------------------- A-gear-draws */
const A_GEAR_DRAWS = {
  id: 'A-gear-draws', kind: 'action', lane: LANE, timeout: 180000, settle: 400,
  title: 'Any loadout: <= 5 main draws (skin, hair, merged outfit, stow kit, held weapon), <= 2 shadow casters, every §4.1 tri cap and <= 40 k total; drawing a weapon collapses its stowed copy with 0 extra draws (R38 held-weapon clause: Sabina in hand)',
  setup: `__CTX__.input.enabled = true;`,
  assert: placed(['openGround'], `(async () => {${PRE}
    freeze(); standAt(p, 'openGround'); await wait(300);
    const rows = [];
    const tri = (L) => L.reduce((s, m) => s + m.tris, 0);
    const read = (tag, id) => {
      const J = H.info();
      const body = J.meshes.filter((m) => m.part === 'body' && /^Brea_/.test(m.name));
      const outfit = J.meshes.filter((m) => /^outfit/.test(m.part)), kit = J.meshes.filter((m) => /^stowkit/.test(m.part));
      const held = J.meshes.filter((m) => m.part === 'held');
      const rest = J.meshes.filter((m) => !body.includes(m) && !outfit.includes(m) && !kit.includes(m) && !held.includes(m));
      const r = { id, tag, draws: J.draws, casters: J.casters, tris: J.tris, body: tri(body), outfit: tri(outfit), kit: tri(kit), held: tri(held), heldMeshes: held.length, kitHidden: H.kit.hidden, stray: rest.map((m) => m.part + ':' + m.name).slice(0, 6) };
      r.ok = r.draws <= 5 && r.casters <= 2 && r.tris <= 40000 && r.body <= 10000 && r.outfit <= 17500 && r.kit <= 9000 && r.held <= 3000 && r.heldMeshes <= 1 && !rest.length;
      rows.push(r);
      return r;
    };
    for (const id of ${JSON.stringify(IDS)}) {
      await H.loadout.equipArmor(id); await frames(6);
      const idle = read('stowed', id);
      // the bow in her hand, full draw (the real input path)
      p.camPitch = 0; C.input.mouse.buttons |= 4; await simWait(0.6, 5000); C.input.mouse.buttons |= 1; await simWait(1.0, 6000);
      const r = read('bow full draw', id);
      r.bowHeld = cmb.drawStrength > 0.9 && (H.kit.hidden & 2) !== 0 && r.heldMeshes === 1;
      r.zeroExtra = r.draws === idle.draws + 1 && (r.kit === idle.kit);
      release(); await wait(500);
      cmb._holsterT = 0; await simWait(0.6, 3000);
      // the lance in her hand (the first swing from holstered draws it, R5)
      await lanceOut();
      const l = read('lance in hand', id);
      l.lanceHeld = (H.kit.hidden & 1) !== 0 && l.heldMeshes === 1;
      await lanceAway();
    }
    await H.loadout.equipArmor('pan-1');
    release();
    const pass = rows.every((r) => r.ok && (r.tag !== 'bow full draw' || (r.bowHeld && r.zeroExtra)) && (r.tag !== 'lance in hand' || r.lanceHeld));
    return { pass, detail: { rows, r38: 'held-weapon clause graded here: <= 5 draws, <= 2 casters with the Sabina in hand' } };
  })()`),
};

/* ---------------------------------------------------------- A-weapon-sockets */
const A_WEAPON_SOCKETS = {
  id: 'A-weapon-sockets', kind: 'action', lane: LANE, timeout: 60000, settle: 300,
  title: 'Every weapon GLB has its class sockets; authored length within +-2 cm of the bible; bow pull = the Lmax solve +- 0.01 m; the 0.80 prop scale retired (melee.js, melee W1: reported PENDING until it lands)',
  assert: `(async () => {${PRE}
    const M = C.assets.models;
    const prof = p.model.userData?.rigProfile?.bow;
    const CLS = { bow: ['grip', 'stow', 'nock', 'string_top', 'string_bottom'], lance: ['grip', 'stow', 'tip'] };
    const NOM = { armoryBowSabina: 1.45, armoryLanceShepherd: 1.55 };
    const rows = [];
    for (const [row, nominal] of Object.entries(NOM)) {
      const e = M[row];
      if (!e) { rows.push({ row, ok: false, why: 'row not loaded' }); continue; }
      const X = e.extras?.r5Weapon || {};
      const names = new Set();
      let src = null;
      e.root.traverse((o) => { names.add(o.name); if (!src && o.isMesh) src = o; });
      const g = src.geometry; g.computeBoundingBox();
      const bb = g.boundingBox;
      const need = CLS[X.class] || [];
      const miss = need.filter((n) => !names.has(n));
      // authored length, measured off the mesh: the lance tip to butt; the bow along its back, nock groove to nock
      // groove (a bow's length is its stave's, not the braced string's chord), through the stave rings' centres
      const pos = (n) => { let q = null; src.traverse((o) => { if (o.name === n) q = o.position; }); return q; };
      let L;
      if (X.class === 'lance') L = pos('tip').distanceTo(pos('butt'));
      else {
        const P = g.getAttribute('position'), BW = g.getAttribute('_bw');
        const bins = new Map();
        for (let i = 0; i < P.count; i++) {
          if (BW.getX(i) > 0.5) continue;
          const s = BW.getY(i);
          if (Math.abs(s) > 0.97) continue;
          const k = Math.round(s * 16);
          const b = bins.get(k) || { x: 0, y: 0, z: 0, n: 0 };
          b.x += P.getX(i); b.y += P.getY(i); b.z += P.getZ(i); b.n++;
          bins.set(k, b);
        }
        const pts = [...bins.keys()].sort((a, b) => a - b).map((k) => { const b = bins.get(k); return p.position.clone().set(b.x / b.n, b.y / b.n, b.z / b.n); });
        const ends = [pos('string_bottom').clone(), ...pts, pos('string_top').clone()];
        L = 0; for (let i = 1; i < ends.length; i++) L += ends[i].distanceTo(ends[i - 1]);
      }
      const ok = !miss.length && Math.abs(L - nominal) <= 0.02;
      rows.push({ row, cls: X.class, declared: X.length, measured: +L.toFixed(3), chord: X.class === 'bow' ? +(pos('string_top').y - pos('string_bottom').y).toFixed(3) : undefined, sockets: [...names].filter((n) => /grip|stow|tip|nock|string|butt/.test(n)), miss, ok });
    }
    const bow = cmb.bow;
    const pullOk = Math.abs(bow.pull - (prof.drawLength + bow.restZ)) <= 0.01;
    // the retired prop scale (M9) is read off the live prop: its group must stand at 1 once melee retires it
    const held = cmb.melee.lance ?? null;
    const propScale = held ? 1 : +(cmb.melee.layer?.propScale ?? cmb.melee.spear?.group?.scale?.x ?? NaN);
    const retired = propScale === 1;
    const own = rows.every((r) => r.ok) && pullOk;
    return { pass: !own ? false : (retired ? true : null), detail: { rows, pull: bow.pull, restZ: bow.restZ, solve: prof, pullOk, propScale,
      note: retired ? 'the prop scale is gone' : 'PENDING: every armory clause passes; the 0.80 prop scale is melee.js (melee W1, M9). The lance model cancels it, so it renders at its real 1.55 m; bow.js publishes the option that drops the cancel when melee removes it.' } };
  })()`,
};

/* ------------------------------------------------------- A-outfit-swap-memory */
const A_OUTFIT_SWAP = {
  id: 'A-outfit-swap-memory', kind: 'action', lane: LANE, timeout: 180000, settle: 400,
  title: '6 swaps across all owned variants, then unequip: geometries, textures and skeletons equal to the unequipped baseline (+-0); 0 console errors',
  setup: `__CTX__.input.enabled = true;`,
  assert: placed(['openGround'], `(async () => {${PRE}
    freeze(); standAt(p, 'openGround'); await wait(300);
    const skeletons = () => { const s = new Set(); p.model.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) s.add(o.skeleton); }); return s.size; };
    const snap = async () => { await frames(8); return { ...mem(), skeletons: skeletons() }; };
    await H.loadout.unequipArmor();
    const base = await snap();
    const trace = [];
    for (const id of ['pan-2', 'pan-3', 'ash-1', 'pan-1', 'pan-3', 'ash-1']) {
      await H.loadout.equipArmor(id);
      const s = await snap();
      trace.push({ id, ...s, info: H.outfit.info().tris });
    }
    await H.loadout.unequipArmor();
    const after = await snap();
    await H.loadout.equipArmor('pan-1');
    const resident = Object.keys(C.assets.models).filter((k) => /^armor[A-Z]/.test(k) && k !== 'armorPan1');
    const ok = after.geo === base.geo && after.tex === base.tex && after.skeletons === base.skeletons && resident.length === 0;
    return { pass: ok, detail: { base, after, trace, residentDeferred: resident } };
  })()`),
};

/* ------------------------------------------------------- A-weapon-swap-memory */
const A_WEAPON_SWAP = {
  id: 'A-weapon-swap-memory', kind: 'action', lane: LANE, timeout: 180000, settle: 400,
  title: 'Cycle every weapon variant twice (W1: Sabina drawn and stowed, the lance drawn and stowed, and the swapped-out model rebuilt): geometries, textures and materials back to baseline',
  setup: `__CTX__.input.enabled = true;`,
  assert: placed(['openGround'], `(async () => {${PRE}
    freeze(); standAt(p, 'openGround'); await wait(300);
    const matCount = () => { const s = new Set(); p.model.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) s.add(m); }); return s.size; };
    const snap = async () => { await frames(8); return { ...mem(), mats: matCount() }; };
    const cycle = async () => {
      p.camPitch = 0; C.input.mouse.buttons |= 4; await simWait(0.6, 5000); C.input.mouse.buttons |= 1; await simWait(0.9, 6000);
      release(); await wait(300); cmb._holsterT = 0; await simWait(0.5, 3000);
      await lanceOut();
      await lanceAway();
    };
    // one warm-up cycle: the first draw compiles and uploads what later cycles reuse
    await cycle();
    const base = await snap();
    const trace = [];
    for (let i = 0; i < 2; i++) { await cycle(); trace.push(await snap()); }
    // the model itself rebuilt (what a W3 variant swap does): dispose + build
    const B = await import('/src/combat/bow.js');
    const bowId = Object.keys(cmb._models).find((k) => cmb._models[k] === cmb.bow);
    const old = cmb._models[bowId], node = old.group.parent;
    const mat0 = old.material;
    const nb = B.buildWeaponModel(bowId, { bow: p.model.userData?.rigProfile?.bow });
    nb.group.visible = false;
    node.add(nb.group);
    old.dispose();
    p._matMap?.delete?.(mat0);
    cmb._models[bowId] = nb;
    if (cmb.bow === old) cmb.bow = nb;
    p._collectMaterials?.();
    await cycle();
    const after = await snap();
    const ok = after.geo === base.geo && after.tex === base.tex && after.mats === base.mats && trace.every((t) => t.geo === base.geo && t.tex === base.tex && t.mats === base.mats);
    return { pass: ok, detail: { base, trace, after } };
  })()`),
};

/* ------------------------------------------------------ A-variant-swap-matrix */
const A_MATRIX = {
  id: 'A-variant-swap-matrix', kind: 'action', lane: LANE, timeout: 900000, settle: 400,
  title: 'Pan I-III, Ash I x Sabina, Shepherd\'s x the poses that exist at W1 (idle, sprint, full draw at 0 and -0.55, lance light-1 and heavy contact), CPU-skinned: stretch <= 1.6, weights ok; <= 0.5 % of outfit vertices > 4 mm inside the skinned body, 0 in the head (R62 c: a vertex whose nearest skin is itself under another body part is excluded and counted); stow and weapon vs outfit <= 5 mm; pieces >= 0.03 from the draw hand and head; the hat in its back socket >= 0.03 from the lance. Gaff, Windwall, pendulum poses PENDING (W2)',
  setup: `__CTX__.input.enabled = true;`,
  assert: placed(['openGround'], `(async () => {${PRE}
    freeze(); standAt(p, 'openGround'); await wait(300);
    const X = await import('/src/hero/matrix.js');
    const rows = [];
    const M = cmb.melee;
    const OFFENDERS_OF = window.__armoryOffenders ?? 'pan-1';
    const stage = {
      async idle(weapon) {
        release(); await wait(150);
        if (weapon === 'lance') { await lanceOut(); } else { C.input.mouse.buttons |= 4; await simWait(0.5, 3000); C.input.mouse.buttons = 0; await simWait(0.25, 2000); }
      },
      async sprint(weapon) {
        await stage.idle(weapon);
        keys.add('KeyW'); keys.add('ShiftLeft'); await simWait(1.4, 8000);
      },
      async draw0() { release(); await wait(200); p.camPitch = 0; C.input.mouse.buttons |= 4; await simWait(0.6, 5000); C.input.mouse.buttons |= 1; await simWait(1.0, 6000); },
      async drawDown() { release(); await wait(200); p.camPitch = -0.55; C.input.mouse.buttons |= 4; await simWait(0.6, 5000); C.input.mouse.buttons |= 1; await simWait(1.0, 6000); },
      async contact(heavy) {
        release(); await wait(100); await lanceOut();
        M.swing({ heavy });
        const w0 = performance.now();
        while (performance.now() - w0 < 2500) { await frame(); const s = M.poseState(); if (s.phase === 'strike') break; }
      },
    };
    const clear = async () => {
      release();
      await lanceAway();
      p.camPitch = 0;
    };
    for (const id of ${JSON.stringify(IDS)}) {
      await H.loadout.equipArmor(id); await frames(6);
      await simWait(0.3, 2000);
      const snap = X.bindSnapshot(C);
      await frames(2);
      const poses = [
        ['idle', 'sabina', () => stage.idle('bow')], ['idle', 'shepherd', () => stage.idle('lance')],
        ['sprint', 'sabina', () => stage.sprint('bow')], ['sprint', 'shepherd', () => stage.sprint('lance')],
        ['draw 0', 'sabina', () => stage.draw0(), { draw: true }], ['draw -0.55', 'sabina', () => stage.drawDown(), { draw: true }],
        ['light-1 contact', 'shepherd', () => stage.contact(false)], ['heavy contact', 'shepherd', () => stage.contact(true)],
      ];
      for (const [pose, weapon, fn, opts] of poses) {
        await fn();
        await frame();
        // sprint: read two more frames across the stride, keep the worst
        const o2 = { ...(opts || {}), offenders: id === OFFENDERS_OF };
        let m = X.measurePose(C, snap, o2);
        if (pose === 'sprint') for (let k = 0; k < 3; k++) { await simWait(0.09, 800); const q = X.measurePose(C, snap, o2); if (q.stretch > m.stretch || q.insideFrac > m.insideFrac) m = q; }
        rows.push({ id, pose, weapon, ...m, weightSumErr: snap.weightSumErr, drawS: pose.startsWith('draw') ? +cmb.drawStrength.toFixed(2) : undefined });
        await clear();
      }
    }
    await H.loadout.equipArmor('pan-1');
    const fails = rows.filter((r) => r.stretch > 1.6 || r.weightSumErr > 0.01 || r.insideFrac > 0.005 || r.headIn > 0 || r.stowDeep < -0.005 || r.heldDeep < -0.005 || (r.pieceToHand != null && r.pieceToHand < 0.03) || (r.pieceToHead != null && r.pieceToHead < 0.03) || (r.hatToLance != null && r.hatToLance < 0.03));
    const pending = ['gaff hook-rip', 'Windwall guard', 'pendulum release'];
    return { pass: fails.length === 0, detail: { rows: rows.length, fails: fails.slice(0, 24), worst: {
      stretch: Math.max(...rows.map((r) => r.stretch)), insideFrac: Math.max(...rows.map((r) => r.insideFrac)), creaseExcludedMax: Math.max(...rows.map((r) => r.creaseExcluded ?? 0)), stowDeep: Math.min(...rows.map((r) => r.stowDeep)), heldDeep: Math.min(...rows.map((r) => r.heldDeep)),
      pieceToHand: Math.min(...rows.map((r) => r.pieceToHand ?? 9)), pieceToHead: Math.min(...rows.map((r) => r.pieceToHead ?? 9)), hatToLance: Math.min(...rows.map((r) => r.hatToLance ?? 9)) }, pendingPoses: pending, all: rows } };
  })()`),
};

/* ------------------------------------------------------- A-stow-clearance@armory */
const STOW_BODY = `
    const X = await import('/src/hero/matrix.js');
    let dCalf = 9, dPiece = null, crouchLow = 9, crouchPiece = null, frames_ = 0;
    const coverRows = [];
    const run = async (sec, f) => { const s0 = E.simTime, w0 = performance.now(); while (E.simTime - s0 < sec && performance.now() - w0 < sec * 6000) { await frame(); const q = X.stowFrame(C); if (q) { frames_++; f(q); } } };
    const leg = (q) => { if (q.dCalf < dCalf) { dCalf = q.dCalf; dPiece = q.dPiece; } };
    release(); await wait(200);
    keys.add('KeyW'); keys.add('ShiftLeft'); await wait(800);
    await run(4, leg);
    release(); await wait(300);
    p.setCrouch ? p.setCrouch(true) : keys.add('KeyC');
    await simWait(0.5, 3000); keys.add('KeyW');
    await run(2.5, (q) => { leg(q); if (q.lowAboveGround < crouchLow) { crouchLow = q.lowAboveGround; crouchPiece = q.lowPiece; } });
    release(); p.setCrouch ? p.setCrouch(false) : 0; await wait(400); release();
    standAt(p, 'openGround'); keys.add('KeyW'); await simWait(0.3, 2000); p.dodge ? p.dodge() : C.input._downHandlers.get('ControlLeft')?.forEach((f) => f({}));
    await run(0.8, leg);
    release(); await wait(300);
    const y0 = p.camYaw ?? p.heading;
    for (const moving of [false, true]) {
      standAt(p, 'openGround'); p.velocity.set(0, 0, 0); await wait(200);
      for (let i = 0; i < 24; i++) {
        p.camYaw = (i / 24) * Math.PI * 2;
        if (moving) { keys.clear(); keys.add('KeyW'); standAt(p, 'openGround'); }
        const nf = moving ? 30 : 14; for (let k = 0; k < nf; k++) await frame();
        const q = X.headCover(C); coverRows.push({ yaw: i, moving, ...q });
      }
    }
    release();
    p.camYaw = y0;
    const cover = Math.max(...coverRows.map((r) => r.cover));
    const coverAt = coverRows.find((r) => r.cover === cover);
    // R62 (b): the median over the 24 yaws <= 8 % of the head's box (each sweep, standing and moving; the larger
    // median is graded), and the worst single yaw <= 20 %
    const sweep = (mv) => coverRows.filter((r) => r.moving === mv).map((r) => r.cover).sort((a, b) => a - b);
    const med = (L) => (L.length ? (L[(L.length - 1) >> 1] + L[L.length >> 1]) / 2 : 9);
    const coverMedian = +Math.max(med(sweep(false)), med(sweep(true))).toFixed(3);
    const coverOk = coverMedian <= 0.08 && cover <= 0.20;
`;
const A_STOW = {
  id: 'A-stow-clearance@armory', kind: 'action', lane: LANE, timeout: 120000, settle: 400,
  title: 'Sprint 4 s, crouch-walk, dodge, a 24-yaw chase-camera sweep: every stowed item >= 0.05 m from the calf capsules, >= 0.05 m above terrain crouched, the head\'s screen box covered <= 8 % at the median yaw and <= 20 % at the worst (R62 b; melee owns the row at its W1 exit; armory reads it on the art-pass kit)',
  setup: `__CTX__.input.enabled = true;`,
  assert: placed(['openGround'], `(async () => {${PRE}
    freeze(); standAt(p, 'openGround'); await wait(300);${STOW_BODY}
    const pass = dCalf >= 0.05 && crouchLow >= 0.05 && coverOk && frames_ > 60;
    return { pass, detail: { dCalf, dPiece, crouchLow, crouchPiece, coverMedian, coverWorst: cover, coverAt, frames: frames_, r62: 'cover: median of the 24 yaws <= 0.08, worst yaw <= 0.20' } };
  })()`),
};

/* ------------------------------------------------------ A-variant-motion-rerun */
/** The hero-body rows, run with each variant on. Loaded lazily so a hero-body edit never breaks this file's import. */
const motionRows = async () => {
  const hb = await import('./gates.r5.hero-body.mjs');
  return ['A-wrap-clear', 'A-run-arms'].map((id) => hb.GATES.find((g) => g.id === id)).filter(Boolean);
};
const A_MOTION = {
  id: 'A-variant-motion-rerun', kind: 'runner', lane: LANE, timeout: 1200000,
  title: 'Per armor variant (W1: 4): A-stow-clearance, A-wrap-clear, A-run-arms at their bars',
  check: async () => ({ pass: null, detail: 'run as the page rows A-variant-motion-rerun:<variant>' }),
};
const motionPage = (id) => ({
  id: `A-variant-motion-rerun:${id}`, kind: 'action', lane: LANE, timeout: 420000, settle: 400,
  title: `Variant ${id}: A-stow-clearance (bars above), and the wrap / run-arm chains re-measured with it on`,
  setup: `__CTX__.input.enabled = true;`,
  assert: placed(['openGround'], `(async () => {${PRE}
    freeze(); standAt(p, 'openGround'); await wait(300);
    await H.loadout.equipArmor(${JSON.stringify(id)}); await frames(6);${STOW_BODY}
    const stow = { dCalf, dPiece, crouchLow, crouchPiece, coverMedian, coverWorst: cover, coverAt, frames: frames_, ok: dCalf >= 0.05 && crouchLow >= 0.05 && coverOk };
    // A-run-arms, its bars (hero-body row): sprint 4 s, wrist off the midline, below the shoulder, fore-aft range; no prance
    release(); await wait(300);
    standAt(p, 'openGround', { dx: 2 });
    keys.add('KeyW'); keys.add('ShiftLeft'); await simWait(1.5, 8000);
    const py = [];
    const b = an.b, CHP = (bone, out) => an._charOf(bone, out);
    const T3 = p.position.constructor, wL = new T3(), wR = new T3(), s = new T3(), pel = new T3(), kn = new T3(), hp = new T3();
    let minLat = 9, maxOver = -9, zL0 = 9, zL1 = -9, kneeOver = -9, frames2 = 0;
    const s0 = E.simTime, w0 = performance.now();
    while (E.simTime - s0 < 4 && performance.now() - w0 < 26000) {
      await frame();
      CHP(b.handL.bone, wL); CHP(b.handR.bone, wR); CHP(b.upArmL.bone, s); CHP(b.pelvis.bone, pel);
      CHP(b.calfL.bone, kn); CHP(b.thighL.bone, hp);
      minLat = Math.min(minLat, Math.abs(wL.x), Math.abs(wR.x));
      maxOver = Math.max(maxOver, wL.y - (s.y - 0.25), wR.y - (s.y - 0.25));
      zL0 = Math.min(zL0, wL.z); zL1 = Math.max(zL1, wL.z);
      py.push(pel.y);
      kneeOver = Math.max(kneeOver, kn.y - hp.y);
      frames2++;
    }
    release();
    // the pelvis's bob, per stride, as A-run-arms measures it
    const cyc = Math.max(4, Math.round(frames2 / Math.max(1, 4.0 * (an.loco?.freq || 1.6))));
    let bob = 0;
    for (let i = 0; i + cyc <= py.length; i += cyc) { let lo = 9, hi = -9; for (let k = i; k < i + cyc; k++) { lo = Math.min(lo, py[k]); hi = Math.max(hi, py[k]); } bob = Math.max(bob, hi - lo); }
    const arms = { minLat: +minLat.toFixed(3), wristBelowShoulderBy: +(-maxOver).toFixed(3), foreAft: +(zL1 - zL0).toFixed(3), pelvisOsc: +bob.toFixed(3), kneeOverHip: +kneeOver.toFixed(3), frames: frames2 };
    arms.ok = minLat >= 0.10 && maxOver <= 0 && (zL1 - zL0) >= 0.25 && bob <= 0.08 && kneeOver <= 0;
    // A-wrap-clear, its bar: every dyn_ chain >= 0.05 m from the draw hand through a draw cycle at the four pitches
    const chains = [];
    p.model.traverse((o) => { if (/^dyn_/.test(o.name)) chains.push(o); });
    let wrapMin = 9, wrapBy = null;
    const wr = new T3(), kk = new T3(), ft = new T3();
    const segD = (q, A, B) => { const ab = B.clone().sub(A), t = Math.max(0, Math.min(1, q.clone().sub(A).dot(ab) / ab.lengthSq())); return A.clone().addScaledVector(ab, t).distanceTo(q); };
    for (const pitch of [-0.55, -0.4, 0, 0.75]) {
      release(); await wait(250);
      p.camPitch = pitch; C.input.mouse.buttons |= 4; await simWait(0.5, 4000); C.input.mouse.buttons |= 1;
      const s1 = E.simTime, w1 = performance.now();
      while (E.simTime - s1 < 1.2 && performance.now() - w1 < 9000) {
        await frame();
        b.handR.bone.getWorldPosition(wr); an.debugDrawHand?.(kk, ft);
        for (const c of chains) { const q = c.getWorldPosition(new T3()); const d = segD(q, wr, kk); if (d < wrapMin) { wrapMin = d; wrapBy = c.name; } }
      }
    }
    release();
    const wrap = { min: +wrapMin.toFixed(3), by: wrapBy, ok: wrapMin >= 0.05 };
    await H.loadout.equipArmor('pan-1');
    return { pass: stow.ok && arms.ok && wrap.ok, detail: { id: ${JSON.stringify(id)}, stow, arms, wrap } };
  })()`),
});

/* --------------------------------------------------------------- A-armor-verb */
const A_VERB = {
  id: 'A-armor-verb', kind: 'action', lane: LANE, timeout: 300000, settle: 400,
  title: 'Each W1 perk through its published hook, driven by synthesized input, with its negative control: Ash-step (jog 10 s on ash: 0 footstep events, sprint 5 s: > 0; without it > 0 at the jog); Shrug (Flag ends at 3 +-0.1 s; without it 8 +-0.1 s). Brine-wade and Mist-fighter: PENDING until combat-kit publishes the Brine build-up filter (W2)',
  setup: `__CTX__.input.enabled = true;`,
  assert: placed(['openGround'], `(async () => {${PRE}
    freeze(); standAt(p, 'openGround'); await wait(300);
    const S = C.machines.stimulus, PC = C.machines.perception;
    if (!S?.addNoiseFilter || !PC) return { pass: null, detail: 'hooks not published' };
    const patch = p.surfaces.add({ x: p.position.x, z: p.position.z, r: 60, surface: 'ash' });
    const count = async (sec, sprint) => {
      let n = 0;
      const off = S.addNoiseFilter((ev) => { if (ev.kind === 'footstep') n++; return ev; });
      keys.add('KeyW'); if (sprint) keys.add('ShiftLeft');
      const tStart = E.simTime; let turn = 0;
      while (E.simTime - tStart < sec) { await simWait(1, 5000); p.heading += 0.5; turn++; standAt(p, 'openGround', { dx: (turn % 3) * 2 }); keys.add('KeyW'); }
      release(); off(); await wait(150);
      return n;
    };
    // negative control first: Pan I on ash
    await H.loadout.equipArmor('pan-1'); await frames(4);
    const baseJog = await count(10, false);
    await H.loadout.equipArmor('ash-1'); await frames(10);
    const armed = H.loadout._perkArmed;
    const jog = await count(10, false);
    const sprint = await count(5, true);
    const off2 = H.loadout.info();
    p.surfaces.remove(patch);
    // back on Pan I for the Flag: the real raise, timed on the perception clock
    const flagRun = async () => {
      const f = PC.flagPlayer(null);
      if (!f) return null;
      const w0 = performance.now();
      while (f.active && performance.now() - w0 < 14000) await frame();
      return f.active ? null : +(PC.clock - f.t0).toFixed(3);
    };
    await H.loadout.equipArmor('pan-1'); await frames(10);
    const flagBase = await flagRun();
    await H.loadout.equipArmor('pan-2'); await frames(10);
    const durHook = PC.flagDuration;
    const flagShrug = await flagRun();
    await H.loadout.equipArmor('pan-1'); await frames(4);
    const restored = PC.flagDuration;
    const ashOk = baseJog > 0 && jog === 0 && sprint > 0;
    const shrugOk = flagShrug != null && Math.abs(flagShrug - 3) <= 0.1 && flagBase != null && Math.abs(flagBase - 8) <= 0.1 && restored === 8;
    return { pass: ashOk && shrugOk ? null : false, detail: { ashStep: { baseJog, jog, sprint, armed, ok: ashOk }, shrug: { flagBase, flagShrug, durHook, restored, ok: shrugOk },
      pending: { brineWade: 'Brine build-up filter: combat-kit W2 (noise half armed)', mistFighter: 'Brine build-up filter + Brine Pot: combat-kit W2' }, info: off2 } };
  })()`),
};

/* ------------------------------------------------------------ A-no-move-mods */
const A_NO_MOVE = {
  id: 'A-no-move-mods', kind: 'action', lane: LANE, timeout: 240000, settle: 300,
  title: 'With every W1 variant: player.speeds deep-equals canon; player.mods carries no speed key; the dodge displacement and the jump arc read the same as Pan I within their bars',
  setup: `__CTX__.input.enabled = true;`,
  assert: placed(['openGround'], `(async () => {${PRE}
    freeze(); standAt(p, 'openGround'); await wait(300);
    // the table as she boots in the default set; A28b grades its numbers against the canon
    const canon = { ...p.speeds };
    const eq = (a, b) => JSON.stringify(Object.keys(b).sort().map((k) => [k, +(+a[k]).toFixed(4)])) === JSON.stringify(Object.keys(b).sort().map((k) => [k, +(+b[k]).toFixed(4)]));
    const rows = [];
    const dodge = async () => {
      standAt(p, 'openGround'); await wait(200);
      const x0 = p.position.clone();
      keys.add('KeyW'); await simWait(0.3, 2000); const x1 = p.position.clone();
      p.dodge ? p.dodge() : C.input._downHandlers.get('ControlLeft')?.forEach((f) => f({}));
      await simWait(0.7, 3000); release(); const x2 = p.position.clone();
      void x0;
      return +x2.distanceTo(x1).toFixed(3);
    };
    const jump = async () => {
      standAt(p, 'openGround'); await wait(250);
      p.lastJump = null;
      p.jump();
      const w0 = performance.now();
      while (!p.lastJump && performance.now() - w0 < 6000) await frame();
      return p.lastJump ? { apex: +p.lastJump.apex.toFixed(3), air: +p.lastJump.air.toFixed(3) } : null;
    };
    for (const id of ${JSON.stringify(IDS)}) {
      await H.loadout.equipArmor(id); await frames(6);
      rows.push({ id, speedsCanon: eq(p.speeds, canon), mods: p.mods.active(), dodge: await dodge(), jump: await jump() });
    }
    await H.loadout.equipArmor('pan-1');
    const d0 = rows[0].dodge, j0 = rows[0].jump;
    // the bars as carried: A28's apex 1.35-1.7 m, 0.55-0.9 s of air; every variant within 0.25 m / 0.03 m of the default set
    const pass = rows.every((r) => r.speedsCanon && !Object.keys(r.mods).some((k) => /speed|dodge|jump/i.test(k)) && Math.abs(r.dodge - d0) <= 0.25 && r.jump && r.jump.apex >= 1.35 && r.jump.apex <= 1.7 && r.jump.air >= 0.55 && r.jump.air <= 0.9 && Math.abs(r.jump.apex - j0.apex) <= 0.03);
    return { pass, detail: { rows, canon } };
  })()`),
};

/* ----------------------------------------------------------- A-weapon-role */
const A_ROLE = {
  id: 'A-weapon-role', kind: 'runner', lane: LANE, timeout: 5000,
  title: 'The six bible §5.1 scenarios: reported every wave, a pass bar from the W3 exit (all six weapons exist then)',
  check: () => ({ pass: null, detail: 'PENDING until W3: at W1 only the bow and the lance exist, on Tiller and Plumb only' }),
};

/* ------------------------------------------------------------- budgets offline */
const A_BUDGET = {
  id: 'A-armory-budget', kind: 'runner', lane: LANE, timeout: 20000,
  title: '§4.1 file budgets of every armory GLB: set <= 0.8 MB, extra variant <= 0.15 MB, stow kit <= 0.6 MB, held weapon <= 0.15 MB',
  check: () => {
    const rows = [['public/models/hero/outfit-pan-1.glb', 0.8], ['public/models/armory/armor-ash-1.glb', 0.8], ['public/models/armory/armor-pan-2.glb', 0.15], ['public/models/armory/armor-pan-3.glb', 0.15], ['public/models/armory/stowkit.glb', 0.6], ['public/models/armory/bow-sabina.glb', 0.15], ['public/models/armory/lance-shepherd.glb', 0.15]]
      .map(([f, cap]) => { const p = path.join(ROOT, f); const mb = existsSync(p) ? statSync(p).size / 1e6 : null; return { f, mb: mb && +mb.toFixed(3), cap, ok: mb != null && mb <= cap }; });
    return { pass: rows.every((r) => r.ok), detail: rows };
  },
};

/* ------------------------------------------------------------------- visuals */
const FILM_PRE = `
      const C = __CTX__, p = C.player;
      for (const m of (C.machines?.list || [])) m.update = () => {};
      for (const el of Array.from(document.body.children)) if (el.tagName !== 'CANVAS' && !el.querySelector('canvas')) el.style.visibility = 'hidden';`;

const V_ROWS = [
  {
    id: 'V-pan-closeup', kind: 'visual', lane: LANE, settle: 1600, timeout: 90000,
    title: 'Pan Whites I at close range in its in-engine material, beside the linen, belt and esparto references',
    reference: 'reference/r5/armory/linen-tunic.jpg, reference/r5/armory/belt-brass.jpg, reference/r5/armory/espadrilles.jpg',
    setup: `(async () => {${FILM_PRE}
      const s = await import('/src/hero/sheets.js');
      await s.panCloseupOverlay(C, [
        { file: 'reference/r5/armory/linen-tunic.jpg', note: 'linen: weave, seam, wear', cropY: 0.1 },
        { file: 'reference/r5/armory/belt-brass.jpg', note: 'leather + metal fittings', cropY: 0.5 },
        { file: 'reference/r5/armory/espadrilles.jpg', note: 'esparto plait', cropY: 0.6 },
        { file: 'reference/r5/gates-perf/idle-stand.jpg', note: 'cloth weight and fall', cropY: 0.3 },
      ]);
    })()`,
    criteria: 'Orchestrator brief + R54: in a close-up beside the references Pan Whites I holds up. Pass: each material reads as itself without labels (linen with a visible weave and dye variation, dark oiled leather with a burnished edge and stitching, brass with patina, plaited esparto); seams and hems exist as real lines; wear sits where wear goes (hems, salt tide lines on the shins, worn ridges); layers have real depth (the smock over the linen under-tunic, the girdle over the smock with a contact shadow, the sling over the shoulder). FAIL if it reads as a stock corset, plaid, sewing-pattern stitching, flat colour blocks, or blocky compression; a frame that passes the words and looks cheap next to its reference is a major finding.',
  },
  {
    id: 'V-variant-sheet', kind: 'visual', lane: LANE, settle: 1500, timeout: 120000,
    title: 'W1 armor variants front / side / back flat-lit, and at 20 m',
    reference: 'reference/r5/gates-perf/idle-stand.jpg',
    setup: `(async () => {${FILM_PRE}
      const s = await import('/src/hero/sheets.js');
      await s.variantSheetOverlay(C);
    })()`,
    criteria: 'Plan §9 at W1 (4 of the 12): each variant reads different at 20 m by shape, not only colour; no fur, no red hip sash, no braids; pauldrons sit on the clavicle.',
  },
  {
    id: 'V-weapon-sheet', kind: 'visual', lane: LANE, settle: 1500, timeout: 90000,
    title: "The Sabina Bow and the Shepherd's Lance on their own at one scale, with detail crops, beside a self-bow and a bronze socketed blade",
    reference: 'reference/r5/armory/bow-longbow.jpg, reference/r5/armory/blade-bronze.jpg, reference/r5/gates-perf/lance-back-carry.jpg',
    setup: `(async () => {${FILM_PRE}
      const s = await import('/src/hero/sheets.js');
      await s.weaponSheetOverlay(C, [
        { file: 'reference/r5/armory/bow-longbow.jpg', note: 'self-bow: stave, stripe, grip' },
        { file: 'reference/r5/armory/blade-bronze.jpg', note: 'bronze leaf, midrib, socket' },
        { file: 'reference/r5/gates-perf/bow-in-hand.jpg', note: 'bow proportion to the body' },
      ]);
    })()`,
    criteria: 'Plan §9: silhouettes per spec, real proportions; the bob cap reads. Bible: 1.45 m juniper self-bow, pale sapwood face, dark heartwood stripe, esparto grip, horn nocks; 1.55 m resin-dark pine lance, 22 cm bronze leaf, esparto wraps at both hand positions, vermilion/white graduations on the upper third, the bob-shaped butt cap. R54: it must not look cheap next to the references (no flat colour, no pipe-section stave).',
  },
  {
    id: 'V-gear-in-hand', kind: 'visual', lane: LANE, settle: 1200, timeout: 90000,
    title: 'The gear on Brea in the world: full draw with the Sabina from three sides (flexed limbs, the string at the nock), the lance in her hands',
    reference: 'reference/r5/gates-perf/draw-side.jpg, reference/r5/gates-perf/lance-ready-side.jpg',
    setup: placedSetup(['openGround'], `(async () => {${FILM_PRE}
      C.input.enabled = true; C.state = 'playing';
      standAt(p, 'openGround'); p.camPitch = 0;
      const s = await import('/src/hero/sheets.js');
      await s.gearInHandOverlay(C);
    })()`),
    criteria: 'Kevin: bow draw hand at the cheek outside the hair, elbow level/back, bow arm clear of the chest, never an arm behind the head. Plus this lane: the limbs are visibly flexed, the string runs tip to nock to tip straight, the arrow lies on the string at the hand, the grip sits in the bow hand, the stowed bow is gone from her back and the stowed lance and quiver are in place.',
  },
];
V_ROWS.push({
  id: 'V-bow-carry', kind: 'visual', lane: LANE, settle: 900, timeout: 90000,
  title: 'The Sabina carried at a jog (V29 staged without a machine until an alert kind is live): low in her left hand',
  reference: 'reference/r5/gates-perf/bow-in-hand.jpg',
  setup: placedSetup(['openGround'], `(async () => {${FILM_PRE}
    C.input.enabled = true; C.state = 'playing';
    standAt(p, 'openGround'); p.camPitch = 0;
    const s = await import('/src/hero/sheets.js');
    await s.bowCarryOverlay(C);
  })()`),
  criteria: 'Plan V29: bow low in the LEFT hand, left-arm swing damped; FAIL if on her back. Plus: the grip in the fist, neither limb through her legs, skirt or pouch.',
});
const V29 = asArmory('V29-wielded-carry');
if (V29 && !V29.reference) Object.defineProperty(V29, 'reference', { value: 'reference/r5/gates-perf/bow-in-hand.jpg', enumerable: true });

export const GATES = [
  A_BUDGET,
  A_WEAPON_SOCKETS,
  A_GEAR_DRAWS,
  A_OUTFIT_SWAP,
  A_WEAPON_SWAP,
  A_MATRIX,
  ...IDS.map(motionPage),
  A_STOW,
  A_VERB,
  A_NO_MOVE,
  A_ROLE,
  asArmory('A4-draw-strength'), asArmory('A5-arrow-fired-event'), asArmory('A51-nock-gap'), asArmory('A52-arrow-drop'),
  ...V_ROWS,
  V29,
].filter(Boolean);
void A_MOTION; void motionRows; void readFileSync;
export const ARMORY_GATE_IDS = GATES.map((g) => g.id);
