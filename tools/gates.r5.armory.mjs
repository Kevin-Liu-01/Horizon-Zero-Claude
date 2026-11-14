/**
 * ROUND 5 — lane `armory` gates (docs/ROUND5-PLAN.md §9 "armory (W1, W3)"; W1 block).
 *
 *   node tools/gates.mjs --port 5257 --lane armory        (auto-discovered, gates.config.mjs)
 *
 * W1 scope (plan §9): armor variants Pan I–III and Ash I, weapon variants Sabina and
 * Shepherd's. The W2 poses of the swap matrix (gaff hook-rip, Windwall guard, pendulum
 * release) and the perks whose hooks land with combat-kit report PENDING by name.
 * Carried rows the block repeats run under `<id>@armory` with the carried row's own
 * assert (never a copy), so A4, A5, A51, A52 and V29 stay single-sourced. A-variant-motion-rerun
 * runs hero-body's A-run-arms and A-wrap-clear asserts verbatim with each variant on (fix round 1),
 * and melee's A-stow-clearance once its file is in the tree.
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
  title: 'Any loadout: <= 5 main draws (skin, hair, merged outfit, stow kit, held weapon), <= 2 shadow casters, every §4.1 tri cap as R66 f shifts them (body 11.5 k, outfit 16.0 k, stow 9.0 k, held 3.0 k) and <= 40 k total; drawing a weapon collapses its stowed copy with 0 extra draws (R38 held-weapon clause: Sabina in hand)',
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
      // (R66 f's cap shift, binding from the W1 exit: body <= 11.5 k, outfit <= 16.0 k, stow <= 9.0 k, held <= 3.0 k)
      r.ok = r.draws <= 5 && r.casters <= 2 && r.tris <= 40000 && r.body <= 11500 && r.outfit <= 16000 && r.kit <= 9000 && r.held <= 3000 && r.heldMeshes <= 1 && !rest.length;
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
        // fix round 1 (judges: one sampled moment per row moved +-0.15 points between runs): every row reads SEVERAL
        // frames of its pose and keeps the WORST of each clause on its own — four across the sprint's stride, three
        // over the held idle and full-draw poses (0.1 s apart), three consecutive frames from the strike's contact
        const o2 = { ...(opts || {}), offenders: id === OFFENDERS_OF };
        const MAXK = ['stretch', 'stretchOver', 'insideFrac', 'inside', 'headIn', 'creaseExcluded'];
        const MINK = ['stowDeep', 'heldDeep', 'pieceToHand', 'pieceToHead', 'hatToLance', 'deepest'];
        const worst = (a, b) => {
          const r = { ...a };
          for (const k of MAXK) if (b[k] != null && (r[k] == null || b[k] > r[k])) r[k] = b[k];
          for (const k of MINK) if (b[k] != null && (r[k] == null || b[k] < r[k])) r[k] = b[k];
          for (const k of ['edgeOffenders', 'insideOffenders', 'stowOffenders', 'heldOffenders']) if (b[k] && (!r[k] || (k === 'insideOffenders' ? b.insideFrac >= a.insideFrac : true))) r[k] = b[k];
          r.samples = (a.samples || 1) + 1;
          return r;
        };
        let m = X.measurePose(C, snap, o2);
        const more = pose === 'sprint' ? 3 : 2;
        for (let k = 0; k < more; k++) {
          if (pose.includes('contact')) await frame(); else await simWait(pose === 'sprint' ? 0.09 : 0.1, 900);
          m = worst(m, X.measurePose(C, snap, o2));
        }
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
        const q = X.headCover(C), bq = X.boomPen(C);
        coverRows.push({ yaw: i, moving, ...q, boomPen: bq ? bq.pen : null, boomPiece: bq ? bq.piece : null });
      }
    }
    release();
    p.camYaw = y0;
    const cover = Math.max(...coverRows.map((r) => r.cover));
    const coverAt = coverRows.find((r) => r.cover === cover);
    // plan §9: no stowed item crosses the boom segment (pivot -> lens) by > 0.02 m, at any of the 48 sweep frames
    const boomRows = coverRows.filter((r) => r.boomPen != null);
    const boomWorst = boomRows.length ? Math.max(...boomRows.map((r) => r.boomPen)) : null;
    const boomAt = boomRows.find((r) => r.boomPen === boomWorst) || null;
    const boomOk = boomRows.length === 48 && boomWorst <= 0.02;
    // R62 (b): the median over the 24 yaws <= 8 % of the head's box (each sweep, standing and moving; the larger
    // median is graded), and the worst single yaw <= 20 %
    const sweep = (mv) => coverRows.filter((r) => r.moving === mv).map((r) => r.cover).sort((a, b) => a - b);
    const med = (L) => (L.length ? (L[(L.length - 1) >> 1] + L[L.length >> 1]) / 2 : 9);
    const coverMedian = +Math.max(med(sweep(false)), med(sweep(true))).toFixed(3);
    const coverOk = coverMedian <= 0.08 && cover <= 0.20;
`;
const A_STOW = {
  id: 'A-stow-clearance@armory', kind: 'action', lane: LANE, timeout: 120000, settle: 400,
  title: 'Sprint 4 s, crouch-walk, dodge, a 24-yaw chase-camera sweep (standing and moving): every stowed item >= 0.05 m from the calf capsules, >= 0.05 m above terrain crouched, no stowed item crosses the boom segment (pivot -> lens) by > 0.02 m, the head\'s screen box covered <= 8 % at the median yaw and <= 20 % at the worst (R62 b; melee owns the row at its W1 exit; armory reads it on the art-pass kit, every clause)',
  setup: `__CTX__.input.enabled = true;`,
  assert: placed(['openGround'], `(async () => {${PRE}
    freeze(); standAt(p, 'openGround'); await wait(300);${STOW_BODY}
    const pass = dCalf >= 0.05 && crouchLow >= 0.05 && coverOk && boomOk && frames_ > 60;
    return { pass, detail: { dCalf, dPiece, crouchLow, crouchPiece, coverMedian, coverWorst: cover, coverAt, boomWorst, boomAt, boomFrames: boomRows.length, frames: frames_, r62: 'cover: median of the 24 yaws <= 0.08, worst yaw <= 0.20; boom: <= 0.02 m into any shown piece (melee radii)' } };
  })()`),
};

/* ------------------------------------------------------ A-variant-motion-rerun */
/**
 * Plan §9: per armor variant, `A-stow-clearance`, `A-wrap-clear` and `A-run-arms` pass AT THEIR BARS. Fix round 1
 * (armory W1 judges): the rows are no longer re-coded here. Each variant row equips the variant, then runs the
 * carried rows' OWN asserts, verbatim, from their owners' gate files:
 *   - `A-run-arms` and `A-wrap-clear` from tools/gates.r5.hero-body.mjs (hero-body's, on their own staging: the flat
 *     46 m strip, the sprint-stop at four pitches and the two crouched rows, the M10 capsule minus its half-thickness);
 *   - `A-stow-clearance` from tools/gates.r5.melee.mjs once melee's row is in the tree (it owns the row at its W1
 *     exit); until then this file's `A-stow-clearance@armory` assert, which grades every clause of plan §9's row
 *     (calf capsules, crouched ground, the boom, R62 b's cover).
 * A missing owner row is a FAIL by name, never a skip. Loaded with top-level await, so an owner's file that fails to
 * import is reported in the row instead of breaking this module.
 */
const ownerRow = async (file, id) => {
  try {
    const m = await import(file);
    return (m.GATES || []).find((g) => g.id === id) || null;
  } catch (err) { return { error: String(err?.message || err).slice(0, 200) }; }
};
const HB_RUN_ARMS = await ownerRow('./gates.r5.hero-body.mjs', 'A-run-arms');
const HB_WRAP_CLEAR = await ownerRow('./gates.r5.hero-body.mjs', 'A-wrap-clear');
const MELEE_STOW = existsSync(path.join(ROOT, 'tools/gates.r5.melee.mjs')) ? await ownerRow('./gates.r5.melee.mjs', 'A-stow-clearance') : null;
const A_MOTION = {
  id: 'A-variant-motion-rerun', kind: 'runner', lane: LANE, timeout: 1200000,
  title: 'Per armor variant (W1: 4): A-stow-clearance, A-wrap-clear, A-run-arms at their bars',
  check: async () => ({ pass: null, detail: 'run as the page rows A-variant-motion-rerun:<variant>' }),
};
/** One carried row's assert, run inline with the variant on (its own setup line first, its own IIFE). */
const subRow = (g, name) => {
  if (!g || g.error || !g.assert) return `{ pass: false, detail: ${JSON.stringify(`the owner's ${name} row is not in this tree${g?.error ? ': ' + g.error : ''}`)} }`;
  const setup = g.setup && !/^\s*\(async/.test(g.setup) ? g.setup : '';
  return `await (async () => { ${setup}\n return await ${g.assert.trim()}; })()`;
};
const ARMORY_STOW_ASSERT = (() => placed(['openGround'], `(async () => {${PRE}
    freeze(); standAt(p, 'openGround'); await wait(300);${STOW_BODY}
    const pass = dCalf >= 0.05 && crouchLow >= 0.05 && coverOk && boomOk && frames_ > 60;
    return { pass, detail: { dCalf, dPiece, crouchLow, crouchPiece, coverMedian, coverWorst: cover, coverAt, boomWorst, boomAt, boomFrames: boomRows.length, frames: frames_ } };
  })()`))();
const motionPage = (id) => ({
  id: `A-variant-motion-rerun:${id}`, kind: 'action', lane: LANE, timeout: 600000, settle: 400,
  title: `Variant ${id}: A-stow-clearance (${MELEE_STOW ? "melee's row" : 'every clause of plan §9, melee\'s row not in this tree yet'}), hero-body's A-run-arms and A-wrap-clear, each run with ${id} equipped at its own bars`,
  setup: `__CTX__.input.enabled = true;`,
  assert: `(async () => {
    const C = __CTX__, H = C.player.hero;
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const equip = async () => { await H.loadout.equipArmor(${JSON.stringify(id)}); for (let i = 0; i < 6; i++) await frame(); return H.outfit.variant; };
    const rel = () => { C.input.keys.clear(); C.input.mouse.buttons = 0; C.player.setCrouch?.(false); };
    const out = {};
    out.variant = await equip();
    out.stow = ${MELEE_STOW ? subRow(MELEE_STOW, 'A-stow-clearance') : `await ${ARMORY_STOW_ASSERT.trim()}`};
    rel(); out.variantAfterStow = await equip();
    out.runArms = ${subRow(HB_RUN_ARMS, 'A-run-arms')};
    rel(); out.variantAfterArms = await equip();
    out.wrapClear = ${subRow(HB_WRAP_CLEAR, 'A-wrap-clear')};
    rel();
    out.stowRow = ${JSON.stringify(MELEE_STOW ? "melee's A-stow-clearance" : 'A-stow-clearance@armory (every plan §9 clause)')};
    out.equippedThroughout = [out.variant, out.variantAfterStow, out.variantAfterArms].every((v) => v === ${JSON.stringify(id)});
    await H.loadout.equipArmor('pan-1');
    const pass = !!(out.stow?.pass === true && out.runArms?.pass === true && out.wrapClear?.pass === true && out.equippedThroughout);
    return { pass, detail: out };
  })()`,
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

/* ------------------------------------------------- W1 exit: C-06 and C-08 (ROUND5-LOOK §7) */
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** CIEDE2000 between two sRGB 0-255 triples. */
function dE2000(c1, c2) {
  const lab = ([r, g, b]) => {
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const R = lin(r), G = lin(g), B = lin(b);
    const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
    const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const [L1, a1, b1] = lab(c1), [L2, a2, b2] = lab(c2);
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2, G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G), C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (b, a) => { const v = Math.atan2(b, a) * 180 / Math.PI; return v < 0 ? v + 360 : v; };
  const h1 = h(b1, a1p), h2 = h(b2, a2p);
  const dL = L2 - L1, dC = C2p - C1p;
  let dh = h2 - h1; if (C1p * C2p === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(dh * Math.PI / 360);
  const Lm = (L1 + L2) / 2, Cmp = (C1p + C2p) / 2;
  let hm = h1 + h2; if (C1p * C2p !== 0) { if (Math.abs(h1 - h2) > 180) hm += h1 + h2 < 360 ? 360 : -360; hm /= 2; }
  const T = 1 - 0.17 * Math.cos((hm - 30) * Math.PI / 180) + 0.24 * Math.cos(2 * hm * Math.PI / 180) + 0.32 * Math.cos((3 * hm + 6) * Math.PI / 180) - 0.2 * Math.cos((4 * hm - 63) * Math.PI / 180);
  const SL = 1 + 0.015 * (Lm - 50) ** 2 / Math.sqrt(20 + (Lm - 50) ** 2), SC = 1 + 0.045 * Cmp, SH = 1 + 0.015 * Cmp * T;
  const RT = -2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)) * Math.PI / 180);
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** A GLB's skinned mesh + its base colour texture decoded (node; a runner's reading of the shipped file). */
async function glbRead(rel) {
  const { io } = await import(path.join(ROOT, 'tools/build/recipes/lib/face.mjs'));
  const { createRequire } = await import('node:module');
  const sharp = createRequire(path.join(ROOT, 'package.json'))('sharp');
  const doc = await (await io()).read(path.join(ROOT, rel));
  const node = doc.getRoot().listNodes().find((n) => n.getMesh());
  const prim = node.getMesh().listPrimitives()[0];
  let tex = null;
  const t = prim.getMaterial()?.getBaseColorTexture();
  if (t) { const { data, info } = await sharp(Buffer.from(t.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true }); tex = { data, w: info.width, h: info.height }; }
  return { doc, prim, tex, bytes: statSync(path.join(ROOT, rel)).size, extras: doc.getRoot().getAsset().extras || {} };
}
const texAt = (tex, u, v) => { const x = Math.min(tex.w - 1, Math.max(0, Math.floor((u - Math.floor(u)) * tex.w))), y = Math.min(tex.h - 1, Math.max(0, Math.floor((v - Math.floor(v)) * tex.h))); const k = (y * tex.w + x) * 3; return [tex.data[k], tex.data[k + 1], tex.data[k + 2]]; };
const lin = (c) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };

const A_STARTER_CUT = {
  id: 'A-starter-cut', kind: 'runner', lane: LANE, timeout: 120000,
  title: 'ROUND5-LOOK §7 C-06, read off the shipped Starter and its recipe (bind pose): (a) no sleeve piece; (b) the harness centrelines cross within 3 cm of the sternum landmark (Brea\'s front skin at x = 0, spine_03 + 2 cm), boss 6 +- 1 cm; (c) both forearms covered by wrap (+ bracer) from the wrist to >= 0.18 m, the crescent plate on the LEFT (the stow kit\'s bracer, lowerarm_l); (d) >= 2 sash panels >= 0.30 m at her left-rear hip, their albedo >= 25 dE2000 from #A3213A; (e) boots mean linear albedo <= 0.10; (f) Starter <= 16.0 k tris, <= 0.8 MB, stow <= 9.0 k, held <= 3.0 k, Brea\'s visible body <= 11.5 k (her skin under the set\'s own cover + hair/wrap), total <= 40 k. (a) pixels and the draws/casters: A-starter-cut:arms; (g): the named rows in the same run',
  check: async () => {
    const out = {};
    const P1 = await import(path.join(ROOT, 'tools/build/recipes/outfit-pan-1.mjs'));
    const { jointPos } = await import(path.join(ROOT, 'tools/build/recipes/lib/face.mjs'));
    const base = await P1.panBase();
    await P1.panLayout(base.sheetParts, base.trim, base.W, base.H);      // the packed uvs the shipped atlas is painted on
    const parts = base.parts, by = (s) => parts.filter((p) => p.slot === s);
    const S = await glbRead('public/models/hero/outfit-pan-1.glb');
    const meta = S.extras.r5Outfit || {};
    // (a)
    out.a = { sleevePieces: parts.filter((p) => /sleeve|cuff/.test(p.slot)).length + (meta.pieces || []).filter((n) => /sleeve|cuff/.test(n)).length };
    out.a.ok = out.a.sleevePieces === 0;
    // (b) the two straps' centrelines (strapAlong, cols 2: the middle vertex of each row)
    const H = by('harness')[0];
    const nRow = H.pos.length / 3 / 3, half = nRow / 2;
    const cl = (s0) => Array.from({ length: half }, (_, s) => { const i = (s0 + s) * 3 + 1; return [H.pos[i * 3], H.pos[i * 3 + 1], H.pos[i * 3 + 2]]; });
    const A = cl(0), B = cl(half);
    let best = 9, at = null;
    for (const a of A) for (const b of B) { if (a[2] < 0.03 || b[2] < 0.03) continue; const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); if (d < best) { best = d; at = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; } }
    const y3 = jointPos(base.doc, 'spine_03')[1] + 0.02, F = base.fitBody;
    let lm = null;
    for (let i = 0; i < F.count; i++) { const x = F.pos[i * 3], y = F.pos[i * 3 + 1], z = F.pos[i * 3 + 2]; if (Math.abs(x) < 0.012 && Math.abs(y - y3) < 0.012 && (!lm || z > lm[2])) lm = [x, y, z]; }
    const Bo = by('boss')[0];
    let dia = 0; for (let i = 0; i < Bo.pos.length / 3; i++) for (let j = i + 1; j < Bo.pos.length / 3; j++) dia = Math.max(dia, Math.hypot(Bo.pos[i * 3] - Bo.pos[j * 3], Bo.pos[i * 3 + 1] - Bo.pos[j * 3 + 1], Bo.pos[i * 3 + 2] - Bo.pos[j * 3 + 2]));
    out.b = { centrelineGap: +best.toFixed(4), cross: at && at.map((v) => +v.toFixed(3)), landmark: lm && lm.map((v) => +v.toFixed(3)), crossToLandmark: at && lm ? +Math.hypot(at[0] - lm[0], at[1] - lm[1]).toFixed(4) : null, bossDia: +dia.toFixed(4) };
    out.b.ok = best < 0.02 && out.b.crossToLandmark != null && out.b.crossToLandmark <= 0.03 && dia >= 0.05 && dia <= 0.07;
    // (c) coverage along each forearm from the wrist, wrap + the right bracer; the kit's crescent bracer on lowerarm_l
    const cover = (side) => {
      const a = jointPos(base.doc, `lowerarm_${side}`), w = jointPos(base.doc, `hand_${side}`);
      const ax = [a[0] - w[0], a[1] - w[1], a[2] - w[2]], L = Math.hypot(...ax); ax.forEach((v, k) => { ax[k] = v / L; });
      let lo = 9, hi = -9;
      for (const p of [...by('armwrap'), ...by('bracer')]) for (let i = 0; i < p.pos.length / 3; i++) {
        const d = [p.pos[i * 3] - w[0], p.pos[i * 3 + 1] - w[1], p.pos[i * 3 + 2] - w[2]];
        if (Math.sign(p.pos[i * 3]) !== (side === 'l' ? 1 : -1)) continue;
        const t = d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2]; lo = Math.min(lo, t); hi = Math.max(hi, t);
      }
      return { fromWrist: +lo.toFixed(3), to: +hi.toFixed(3) };
    };
    const K = await glbRead('public/models/armory/stowkit.glb');
    const kp = K.prim.getAttribute('_PIECE'), kj = K.prim.getAttribute('JOINTS_0'), kw = K.prim.getAttribute('WEIGHTS_0');
    const kjn = K.doc.getRoot().listNodes().find((n) => n.getSkin())?.getSkin()?.listJoints().map((j) => j.getName()) || [];
    let crescentOn = null; const q = [0], jj = [0, 0, 0, 0], ww = [0, 0, 0, 0];
    for (let i = 0; kp && i < kp.getCount(); i++) { kp.getElement(i, q); if ((Math.round(q[0]) & 8) === 0) continue; kj.getElement(i, jj); kw.getElement(i, ww); crescentOn = kjn[jj[ww.indexOf(Math.max(...ww))]]; break; }
    out.c = { left: cover('l'), right: cover('r'), crescentOn };
    out.c.ok = ['left', 'right'].every((s) => out.c[s].fromWrist <= 0.012 && out.c[s].to >= 0.18) && crescentOn === 'lowerarm_l';
    // (d) the sash's hanging panels: its connected pieces below the knot, their length down the hip, place and albedo
    const Sa = by('sash')[0];
    const n = Sa.pos.length / 3, comp = new Int32Array(n).fill(-1);
    const nb = Array.from({ length: n }, () => []);
    for (let t = 0; t < Sa.idx.length; t += 3) for (const [u, v] of [[0, 1], [1, 2], [2, 0]]) { nb[Sa.idx[t + u]].push(Sa.idx[t + v]); }
    let nc = 0;
    for (let i = 0; i < n; i++) { if (comp[i] >= 0) continue; const st = [i]; comp[i] = nc; while (st.length) { const k = st.pop(); for (const m of nb[k]) if (comp[m] < 0) { comp[m] = nc; st.push(m); } } nc++; }
    const panels = [];
    for (let c = 0; c < nc; c++) {
      let y0 = 9, y1 = -9, sx = 0, sz = 0, m = 0;
      for (let i = 0; i < n; i++) if (comp[i] === c) { y0 = Math.min(y0, Sa.pos[i * 3 + 1]); y1 = Math.max(y1, Sa.pos[i * 3 + 1]); sx += Sa.pos[i * 3]; sz += Sa.pos[i * 3 + 2]; m++; }
      if (m > 20) panels.push({ len: +(y1 - y0).toFixed(3), x: +(sx / m).toFixed(3), z: +(sz / m).toFixed(3) });
    }
    const long = panels.filter((p) => p.len >= 0.3 && p.x > 0.03 && p.z < -0.02);
    // their albedo off the shipped atlas (the sash's trim cell)
    const uv = S.prim.getAttribute('TEXCOORD_0');
    let acc = [0, 0, 0], na = 0; const sr = base.trim.rect('sash'), u2 = [0, 0];
    for (let i = 0; i < uv.getCount(); i++) { uv.getElement(i, u2); if (u2[0] >= sr[0] && u2[0] <= sr[0] + sr[2] && u2[1] >= sr[1] && u2[1] <= sr[1] + sr[3]) { const c = texAt(S.tex, u2[0], u2[1]); acc = acc.map((v, k) => v + c[k]); na++; } }
    const sashRGB = acc.map((v) => Math.round(v / Math.max(1, na)));
    out.d = { panels, long: long.length, sashRGB, dEfromCarmine: +dE2000(sashRGB, hexRGB('#A3213A')).toFixed(1) };
    out.d.ok = long.length >= 2 && out.d.dEfromCarmine >= 25;
    // (e) the boots' albedo, area-weighted at their triangles' uv centroids off the shipped atlas
    const Bt = by('boots')[0];
    let lum = 0, area = 0;
    for (let t = 0; t < Bt.idx.length; t += 3) {
      const [a, b, c] = [Bt.idx[t], Bt.idx[t + 1], Bt.idx[t + 2]];
      const P = (i) => [Bt.pos[i * 3], Bt.pos[i * 3 + 1], Bt.pos[i * 3 + 2]];
      const e1 = P(b).map((v, k) => v - P(a)[k]), e2 = P(c).map((v, k) => v - P(a)[k]);
      const ar = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]) / 2;
      const U = (i) => [Bt.uvNew ? Bt.uvNew[i * 2] : Bt.uv[i * 2], Bt.uvNew ? Bt.uvNew[i * 2 + 1] : Bt.uv[i * 2 + 1]];
      const cu = (U(a)[0] + U(b)[0] + U(c)[0]) / 3, cv = (U(a)[1] + U(b)[1] + U(c)[1]) / 3;
      lum += lin(texAt(S.tex, cu, cv)) * ar; area += ar;
    }
    out.e = { bootLum: area ? +(lum / area).toFixed(4) : null, uvFrom: Bt.uvNew ? 'packed' : 'unpacked (run the layout first)' };
    out.e.ok = out.e.bootLum != null && out.e.bootLum <= 0.10;
    // (f) the caps, off the shipped files
    const tris = (G) => G.prim.getIndices().getCount() / 3;
    const bowG = await glbRead('public/models/armory/bow-sabina.glb'), lanceG = await glbRead('public/models/armory/lance-shepherd.glb');
    const brea = await glbRead('public/models/hero/brea.glb');
    let bodyVis = 0, hair = 0;
    {
      const hide = meta.hide;
      const bin = Buffer.from(hide.rle, 'base64'), runs = new Uint16Array(bin.buffer, bin.byteOffset, bin.length / 2), mask = new Uint8Array(hide.count);
      let at2 = 0; for (let r = 0; r < runs.length; r++) { if (r & 1) mask.fill(1, at2, at2 + runs[r]); at2 += runs[r]; }
      for (const nd of brea.doc.getRoot().listNodes()) {
        const pr = nd.getMesh()?.listPrimitives()[0]; if (!pr) continue;
        const ix = pr.getIndices().getArray();
        if (pr.getAttribute('_HIDEMASK') && pr.getAttribute('POSITION').getCount() === hide.count) { for (let t = 0; t < ix.length; t += 3) if (!(mask[ix[t]] && mask[ix[t + 1]] && mask[ix[t + 2]])) bodyVis++; }
        else hair += ix.length / 3;
      }
    }
    out.f = { outfitTris: tris(S), outfitMB: +(S.bytes / 1e6).toFixed(3), stowTris: tris(K), heldBow: tris(bowG), heldLance: tris(lanceG), body: bodyVis + hair, bodySkin: bodyVis, hairWrap: hair };
    out.f.total = out.f.outfitTris + out.f.stowTris + Math.max(out.f.heldBow, out.f.heldLance) + out.f.body;
    out.f.ok = out.f.outfitTris <= 16000 && out.f.outfitMB <= 0.8 && out.f.stowTris <= 9000 && out.f.heldBow <= 3000 && out.f.heldLance <= 3000 && out.f.body <= 11500 && out.f.total <= 40000;
    out.g = 'graded by the named rows in the same run: A-brea-contrast, V-brea-one-glance, A-variant-swap-matrix, A-wrap-clear, A-run-arms, A35, A-draw-elbow-level, A-stow-clearance (armory runs A-variant-swap-matrix, A-variant-motion-rerun:pan-1 = A-run-arms + A-wrap-clear + A-stow-clearance, A35@armory)';
    return { pass: ['a', 'b', 'c', 'd', 'e', 'f'].every((k) => out[k].ok), detail: out };
  },
};

const A_STARTER_ARMS = {
  id: 'A-starter-cut:arms', kind: 'action', lane: LANE, timeout: 120000, settle: 400,
  title: 'C-06 (a) and (f) in the page: bare arms (skin-hue pixels >= 60 % of the shoulder-to-elbow band on both arms, flat-lit front and back, as V-brea-one-glance\'s sheet frames her) and the Starter\'s <= 5 draws, <= 2 casters, <= 40 k tris',
  setup: `__CTX__.input.enabled = true;`,
  assert: placed(['openGround'], `(async () => {${PRE}
    freeze(); standAt(p, 'openGround'); await wait(300);
    await H.loadout.equipArmor('pan-1'); await frames(6);
    const S = await import('/src/hero/sheets.js');
    const T3 = p.position.constructor;
    const model = await S.poseIdle(C, 0.6);
    const an2 = p.animator;
    const rows = [];
    // (the outfit's arms, not the gear: the stow kit collapses for these renders, as V-pan-closeup's)
    const kit = H.kit, hid0 = kit?.hidden ?? 0;
    kit?.setHidden(31);
    for (const [view, yaw] of [['front', 0], ['back', Math.PI]]) {
      const w = 360, h = 720, cam = { pos: [Math.sin(yaw) * 4.2, 0.95, Math.cos(yaw) * 4.2], target: [0, 0.93, 0], fov: 26 };
      const img = S.renderIsolated(C, model, { width: w, height: h, cam, background: '#00ff00' });
      // the same camera, to project the joints
      const cm = new S.THREE.PerspectiveCamera(cam.fov, w / h, 0.05, 50); cm.position.set(...cam.pos); cm.lookAt(...cam.target); cm.updateMatrixWorld(); cm.updateProjectionMatrix();
      // the joints where the render had them: the model at the origin, its yaw zeroed (renderIsolated's staging)
      const p0 = model.position.clone(), ry0 = model.rotation.y;
      model.position.set(0, 0, 0); model.rotation.y = 0; model.updateMatrixWorld(true);
      const J = {};
      for (const side of ['l', 'r']) { J[side] = [an2.b['upArm' + side.toUpperCase()].bone.getWorldPosition(new T3()), an2.b['loArm' + side.toUpperCase()].bone.getWorldPosition(new T3())]; }
      model.position.copy(p0); model.rotation.y = ry0; model.updateMatrixWorld(true);
      for (const side of ['l', 'r']) {
        const a = J[side][0].clone().project(cm), b = J[side][1].clone().project(cm);
        let skin = 0, all = 0;
        for (let k = 0; k <= 40; k++) for (let o = -3; o <= 3; o++) {
          const t = 0.15 + 0.7 * k / 40;
          const sx = (a.x + (b.x - a.x) * t) * 0.5 + 0.5, sy = 0.5 - (a.y + (b.y - a.y) * t) * 0.5;
          const px = Math.round(sx * w + o), py = Math.round(sy * h);
          if (px < 0 || py < 0 || px >= w || py >= h) continue;
          const i = (py * w + px) * 4, r = img.data[i], g = img.data[i + 1], bl = img.data[i + 2];
          if (g > 200 && r < 80 && bl < 80) continue;             // background
          all++;
          const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), sat = mx ? (mx - mn) / mx : 0;
          let hue = 0; if (mx !== mn) { if (mx === r) hue = 60 * (((g - bl) / (mx - mn)) % 6); else if (mx === g) hue = 60 * ((bl - r) / (mx - mn) + 2); else hue = 60 * ((r - g) / (mx - mn) + 4); } if (hue < 0) hue += 360;
          if (hue >= 5 && hue <= 48 && sat >= 0.2 && mx >= 40 && mx <= 235) skin++;
        }
        rows.push({ view, side, skinFrac: all ? +(skin / all).toFixed(3) : 0, px: all });
      }
    }
    kit?.setHidden(hid0);
    // the Starter's draws and casters (stowed, the bow in hand at full draw)
    const J0 = H.info();
    C.input.mouse.buttons |= 4; await simWait(0.6, 5000); C.input.mouse.buttons |= 1; await simWait(1.0, 6000);
    const J1 = H.info();
    release(); await wait(400);
    const draws = { stowed: { draws: J0.draws, casters: J0.casters, tris: J0.tris }, drawn: { draws: J1.draws, casters: J1.casters, tris: J1.tris } };
    const pass = rows.every((r) => r.skinFrac >= 0.6 && r.px > 40) && [J0, J1].every((J) => J.draws <= 5 && J.casters <= 2 && J.tris <= 40000);
    return { pass, detail: { arms: rows, draws } };
  })()`),
};

const A_WEAPON_FINISH = {
  id: 'A-weapon-finish', kind: 'runner', lane: LANE, timeout: 90000,
  title: 'ROUND5-LOOK §7 C-08 off the recipes and the shipped atlas: (b) the Sabina\'s tips reflexed >= 8 deg off the limb (tip chord 0.92-1 against the limb chord 0.6-0.86), nock to nock 1.45 +- 0.02 m; (c) the fletching within 6 dE2000 of #6B3F73 (the cock feather\'s atlas cell, the flying arrow\'s material); (d) no weapon emissive within 20 dE of #9B6BFF, the element heads PENDING with F-2 (W3); (e) atlas sizes and the bow\'s draws unchanged (A-gear-draws, A-weapon-swap-memory); (a) the blade\'s glint: A-weapon-finish:glint',
  check: async () => {
    const out = {};
    const WG = await import(path.join(ROOT, 'tools/build/recipes/armor/lib/weapongeo.mjs'));
    const ang = (t1, t2) => { const a = WG.stave(t1), b = WG.stave(t2); return Math.atan2(b[2] - a[2], b[1] - a[1]) * 180 / Math.PI; };
    let L = 0, q0 = WG.stave(-1); for (let i = 1; i <= 800; i++) { const q = WG.stave(-1 + 2 * i / 800); L += Math.hypot(q[0] - q0[0], q[1] - q0[1], q[2] - q0[2]); q0 = q; }
    out.b = { reflexDeg: +(ang(0.92, 1) - ang(0.6, 0.86)).toFixed(1), lengthM: +L.toFixed(3) };
    out.b.ok = out.b.reflexDeg >= 8 && Math.abs(L - 1.45) <= 0.02;
    const WA = await import(path.join(ROOT, 'tools/build/recipes/armor/lib/weaponatlas.mjs'));
    const T = WA.weaponTrim(), r = T.rect('fletchB');
    const K = await glbRead('public/models/armory/stowkit.glb');
    let acc = [0, 0, 0], n = 0;
    for (let k = 0; k < 64; k++) { const u = r[0] + r[2] * (0.2 + 0.6 * (k % 8) / 7), v = r[1] + r[3] * (0.2 + 0.6 * Math.floor(k / 8) / 7); const c = texAt(K.tex, u, v); acc = acc.map((x, i) => x + c[i]); n++; }
    const atlasRGB = acc.map((x) => Math.round(x / n));
    const src = readFileSync(path.join(ROOT, 'src/combat/arrows.js'), 'utf8');
    const m = /const fletchMats = \{[^]*?hunter:\s*new THREE\.MeshStandardMaterial\(\{\s*color:\s*0x([0-9a-f]{6})/i.exec(src);
    const flyRGB = m ? hexRGB('#' + m[1]) : null;
    out.c = { atlasRGB, dEatlas: +dE2000(atlasRGB, hexRGB('#6B3F73')).toFixed(1), flyRGB, dEfly: flyRGB ? +dE2000(flyRGB, hexRGB('#6B3F73')).toFixed(1) : null };
    out.c.ok = out.c.dEatlas <= 6 && out.c.dEfly != null && out.c.dEfly <= 6;
    // (d) every emissive the weapon code sets, against the retired glow violet #9B6BFF (R66 c)
    const ems = [...src.matchAll(/emissive:\s*0x([0-9a-f]{6})/gi)].map((x) => '#' + x[1]);
    const near = ems.filter((h) => dE2000(hexRGB(h), hexRGB('#9B6BFF')) < 20);
    out.d = { emissives: ems.length, nearRetiredViolet: near, elementHeads: 'PENDING: W3 with F-2 (Brine-Gourd, Cinder-Resin, Dust-Puff)' };
    out.d.ok = near.length === 0;
    out.e = { atlas: K.tex ? [K.tex.w, K.tex.h] : null, note: 'draws: A-gear-draws (bow in hand = 1 draw); swaps: A-weapon-swap-memory' };
    out.e.ok = !!K.tex && K.tex.w <= 1024;
    return { pass: out.b.ok && out.c.ok && out.d.ok && out.e.ok, detail: out };
  },
};

const A_WEAPON_GLINT = {
  id: 'A-weapon-finish:glint', kind: 'action', lane: LANE, timeout: 120000, settle: 400,
  title: 'C-08 (a): at the golden hour (18:45), the lance\'s bronze leaf at 1.5 m in the world\'s light, seen from where the low sun mirrors off its face or a bevel (a glint exists only there): a highlight >= 0.85 sRGB over >= 4 px',
  setup: `__CTX__.input.enabled = true;`,
  assert: placed(['openGround'], `(async () => {${PRE}
    freeze(); standAt(p, 'openGround'); await wait(300);
    const env = C.environment; const h0 = env.time; env.setTime(18.75);
    await frames(6);
    await lanceOut();
    const S = await import('/src/hero/sheets.js');
    const T3 = p.position.constructor;
    const lay = cmb.melee.layer, sp = H.heldLance();
    const tip = new T3(), grip = new T3();
    lay.tipWorld(tip); lay.gripWorld(grip);
    const ax = tip.clone().sub(grip).normalize();
    const mid = tip.clone().addScaledVector(ax, -0.1);           // the leaf's middle, 0.1 m back from the point
    // the leaf's face normal: the lance model's own z (its blade lies in its x-y plane), and the bevels' either side
    sp.model.updateWorldMatrix(true, false);
    const nz = new T3().setFromMatrixColumn(sp.model.matrixWorld, 2).normalize();
    const nx = new T3().setFromMatrixColumn(sp.model.matrixWorld, 0).normalize();
    const sun = env.sunDir.clone().normalize();
    const ts0 = E.timeScale; E.timeScale = 0; await frames(2);
    const rows = [];
    // a glint is the sun mirrored by the steel: the camera stands where the low sun's reflection off the face or a
    // bevel leaves it, 1.5 m off (a three-quarter view of the blade under golden light, the one place a glint exists)
    for (const [name, n] of [['face+', nz], ['face-', nz.clone().negate()], ['bevel+', nz.clone().multiplyScalar(0.85).addScaledVector(nx, 0.53).normalize()], ['bevel-', nz.clone().multiplyScalar(0.85).addScaledVector(nx, -0.53).normalize()], ['bevel+b', nz.clone().multiplyScalar(-0.85).addScaledVector(nx, 0.53).normalize()], ['bevel-b', nz.clone().multiplyScalar(-0.85).addScaledVector(nx, -0.53).normalize()]]) {
      const r = sun.clone().addScaledVector(n, -2 * sun.dot(n));           // the sun's ray off the steel, reversed: toward the eye
      if (r.dot(n) <= 0 || n.dot(sun) <= 0) { rows.push({ name, px: 0, lit: false }); continue; }
      const pos = mid.clone().addScaledVector(r, 1.5);
      const img = S.liveView(C, pos.toArray(), mid.toArray(), { width: 320, height: 320, fov: 14 });
      let bright = 0;
      for (let i = 0; i < img.data.length; i += 4) if (Math.max(img.data[i], img.data[i + 1], img.data[i + 2]) >= 217) bright++;
      rows.push({ name, px: bright, cam: pos.toArray().map((v) => +v.toFixed(2)), sunElev: +(Math.asin(sun.y) * 180 / Math.PI).toFixed(1) });
    }
    E.timeScale = ts0;
    env.setTime(h0);
    await lanceAway();
    const best = rows.reduce((m, r) => Math.max(m, r.px), 0);
    return { pass: best >= 4, detail: { best, rows, note: 'pixels >= 0.85 sRGB in a 320 px, 14 deg crop on the leaf at 1.5 m, from where the 18:45 sun mirrors off its face or a bevel' } };
  })()`),
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
    reference: 'reference/r5/armory/linen-tunic.jpg, reference/r5/armory/belt-brass.jpg, reference/r5/armory/espadrilles.jpg; ext:kevin-nov13-brea-turnaround.jpg@722ebae7 (R69, binding for rung 1)',
    setup: `(async () => {${FILM_PRE}
      const s = await import('/src/hero/sheets.js');
      await s.panCloseupOverlay(C, [
        { file: 'reference/r5/armory/linen-tunic.jpg', note: 'linen: weave, seam, wear', cropY: 0.1 },
        { file: 'reference/r5/armory/belt-brass.jpg', note: 'leather + metal fittings', cropY: 0.5 },
        { file: 'reference/r5/armory/espadrilles.jpg', note: 'esparto plait', cropY: 0.6 },
        { file: 'reference/r5/gates-perf/idle-stand.jpg', note: 'cloth weight and fall', cropY: 0.3 },
      ]);
    })()`,
    criteria: 'Orchestrator brief + R54 + R64(a), on the C-06 Starter cut (R66 f: the smock art pass transfers to the sleeveless top at the same bar): in a close-up beside the references Pan Whites I holds up. Pass: each material reads as itself without labels (the top\'s dyed cloth with a visible weave and dye variation, dark oiled leather with a burnished edge and stitching, bronze and brass with patina, plaited esparto, wound wraps); seams and hems exist as real lines; the armhole binding lies ON the cloth with no hook, fin or loop; wear sits where wear goes (hems, salt, worn ridges); layers have real depth (the harness over the top with a contact shadow, the girdle over the top, the bracer over the wrap). FAIL if it reads as a stock corset, plaid, sewing-pattern stitching, flat colour blocks, or blocky compression; a frame that passes the words and looks cheap next to its reference is a major finding.',
  },
  {
    id: 'V-variant-sheet', kind: 'visual', lane: LANE, settle: 1500, timeout: 120000,
    title: 'W1 armor variants front / side / back flat-lit, and at 20 m',
    reference: 'reference/r5/gates-perf/idle-stand.jpg; ext:kevin-nov13-brea-turnaround.jpg@722ebae7 (R69, binding for rung 1)',
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
    reference: 'reference/r5/gates-perf/draw-side.jpg, reference/r5/gates-perf/lance-ready-side.jpg; ext:kevin-nov13-brea-turnaround.jpg@722ebae7 (R69, binding for rung 1)',
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
  reference: 'reference/r5/gates-perf/bow-in-hand.jpg; ext:kevin-nov13-brea-turnaround.jpg@722ebae7 (R69, binding for rung 1)',
  setup: placedSetup(['openGround'], `(async () => {${FILM_PRE}
    C.input.enabled = true; C.state = 'playing';
    standAt(p, 'openGround'); p.camPitch = 0;
    const s = await import('/src/hero/sheets.js');
    await s.bowCarryOverlay(C);
  })()`),
  criteria: 'Plan V29: bow low in the LEFT hand, left-arm swing damped; FAIL if on her back. Plus: the grip in the fist, neither limb through her legs, skirt or pouch.',
});
V_ROWS.push({
  id: 'V-starter-vs-board', kind: 'visual', lane: LANE, settle: 1200, timeout: 120000,
  title: 'C-06: the Starter at 2 m front, 3/4 and back, and from the chase camera, at DAY (12:30) and at 18:45, beside the stored silhouette sheet; the board panels (#2-TC, #1-TL, kevin-nov6-armor.md#4-L1) are read from outside the repo (R66 a)',
  reference: 'ext:kevin-nov13-brea-turnaround.jpg@722ebae7 (R69, binding for rung 1); reference/r5/hero/brea-silhouette-sheet.png; ext:kevin-nov6-board.jpg@f2694e04#2-TC; ext:kevin-nov6-keyart.jpg@860d7e9f#1-TL; ext:kevin-nov6-armor.md@d8509a8f#4-L1',
  setup: placedSetup(['openGround'], `(async () => {${FILM_PRE}
    C.input.enabled = true; C.state = 'playing';
    standAt(p, 'openGround'); p.camPitch = 0;
    await p.hero.loadout.equipArmor('pan-1');
    const s = await import('/src/hero/sheets.js');
    await s.starterBoardOverlay(C, 'reference/r5/hero/brea-silhouette-sheet.png');
  })()`),
  criteria: 'ROUND5-LOOK §7 V-starter-vs-board: 1 sleeveless violet top with bare toned arms; 2 crossed brown harness with a bronze boss; 3 violet forearm wraps under bracers; 4 sash panels that hang and move; 5 dark trousers and dark laced knee boots; 6 the wrap, tail, salt-line, lance and cane quiver all read; 7 the top carries R64(a)\'s smock art-pass bar (weave, seams, folds, armhole binding) at 0.8 m. FAIL: the old smock with its sleeves cut off; boots the brightest thing below the waist. IP-clause.',
});
V_ROWS.push({
  id: 'V-weapon-keyart', kind: 'visual', lane: LANE, settle: 1200, timeout: 120000,
  title: 'C-08: the Sabina at full draw (V24) and the kit stowed, at 18:45, with crops of the reflexed tip and the grip',
  reference: 'reference/r5/gates-perf/bow-in-hand.jpg; ext:kevin-nov6-keyart.jpg@860d7e9f#1-BL; ext:kevin-nov6-keyart.jpg@860d7e9f#1-TL',
  setup: placedSetup(['openGround'], `(async () => {${FILM_PRE}
    C.input.enabled = true; C.state = 'playing';
    standAt(p, 'openGround'); p.camPitch = 0;
    const s = await import('/src/hero/sheets.js');
    await s.weaponKeyartOverlay(C, 'reference/r5/gates-perf/bow-in-hand.jpg');
  })()`),
  criteria: 'ROUND5-LOOK §7 V-weapon-keyart: the bronze blade glints; a hand-made bow with reflexed tips and a grip wrap; the haft\'s bands read; only element arrows glow, in their element colour. IP-clause.',
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
  A_STARTER_CUT, A_STARTER_ARMS, A_WEAPON_FINISH, A_WEAPON_GLINT,
  asArmory('A4-draw-strength'), asArmory('A5-arrow-fired-event'), asArmory('A51-nock-gap'), asArmory('A52-arrow-drop'),
  ...V_ROWS,
  V29,
].filter(Boolean);
void A_MOTION; void readFileSync;
export const ARMORY_GATE_IDS = GATES.map((g) => g.id);
