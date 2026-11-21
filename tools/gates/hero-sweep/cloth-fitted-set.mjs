#!/usr/bin/env node
/**
 * A-cloth-fitted-set (cloth lane, kept candidate): her sash panels as the GAME dresses her, not as a staged frame does.
 *
 * In play her set is put on more than once after the grid cloth is built on her first frame: the rung warm-up behind the
 * boot sheet (src/main.js _warmRungs: the Scout on, then hers back), a save that wears the Scout, the slice's reward.
 * Each put-on binds NEW meshes (src/hero/parts.js bindPart). The rig (src/entities/anim/cloth/rig.js) re-skins the
 * meshes it was built on; a set bound after it kept its panels on the old `dyn_panel*` chains, which the rig only drives
 * from each grid's centre column: a whole panel on one chain of swing-only links, flat, standing off her hips (the flap
 * the 2026-11-21 review filmed in the first hour). Staged frames (?shot) skip the warm-up and are built once: clean.
 *
 * TWO READS, both of the RENDERED panels (every outfit mesh she draws, the caster out; a panel vertex is one with at
 * least 0.3 of its skin on a `dyn_panel*` or `cl_panel*` bone, read off the mesh's own skeleton):
 *   loose   panel vertices skinned to a `dyn_panel*` chain bone, not to the grid (bar 0: the grid cloth owns every
 *           drawn panel vertex);
 *   out     panel vertices farther than BAR_OUT (0.20 m) from where the grid cloth itself puts that point of the panel
 *           (the rig's own sample at the vertex's grid parameter; for a vertex on the grid this is its skin's place), and
 *           the panels' farthest reach from her pelvis axis (m, reported).
 *   hats    the hat copies drawn (PIECE bits 32 head, 64 and 128 back): bar 1. In the page, the bits the DRAWN program
 *           hides (none when its program was linked without the piece stage: src/core/engine.js keepPrograms' keepers
 *           before the cloth lane's fix linked the Scout's program with the prototype's empty onBeforeCompile).
 *   flap    (the flap, round 2: the panels against HER BODY, not the grid) in the trade wind held at 5.5 m/s from the
 *           world's own bearing (the brief's C6 speed), standing 3 s and 1.5 s after a 2 s run's stop, each read the worst
 *           of 1 s of frames: every panel column's chord (its pin to its hem particle) within FLAP_COL deg (27: C6's 25 deg
 *           cap on a panel's lift at 5.5 m/s over C2's calm 2 deg; a column that lies on her body is exempt, as C2's "where
 *           it hangs free"; a stowed prop is not her body), and the drawn panel vertices within FLAP_REACH m of her pelvis
 *           axis (0.45: a 0.58 m panel hung from the belt's 0.20 m at C6's 25 deg). The flap filmed in the first hour: the
 *           back panel caught OUTSIDE the stow kit's 0.11 m lance capsule, and a panel's edge column out of her lee.
 *   sheet   (page; the drawn sheets, round 3) WHAT THE GPU DRAWS, not what the CPU reads: each mesh she draws (and every
 *           skinned or unculled mesh within 3 m of her) is rendered ALONE with its own material and program (camera and
 *           mesh on a spare layer, the scene's lights with them, the scene background off) and read back; its drawn pixels
 *           outside the screen box of its VISIBLE vertices as the CPU skins them (getVertexPosition; a vertex whose `_piece`
 *           bit the drawn program hides is not visible), that box grown by SHEET_PAD px, are the sheet. Bar SHEET_PX in
 *           total over her skinned meshes (a held weapon is reported, not graded), at every read: standing straight after
 *           CONTINUE and through a bow aim, draw, loose, the lance out and a swing; then a second load for the runs and the
 *           flap's reads. (The flap filmed in the first hour and at a bow aim: the piece masks (clothShader.js uHidePiece,
 *           stowkit.js uKitHide) put a hidden vertex at the bind-space origin BEFORE skinning; each such vertex is then
 *           moved by its own bones, so in any pose away from the bind the hidden hat copies, the stowed bow or lance
 *           opened into flat sheets a metre across, drawn where no CPU read puts a vertex.)
 *   --diag  (page) every drawn PIECE-mask mesh in the scene, its program, and who else holds the Scout's program.
 *   --list  (page) every mesh near her at each read: visible chain, skinned, parents, material and skeleton uuids, the
 *           skeleton's bone count and bone texture, bones[0]'s world matrix, frustumCulled, an onBeforeRender, and its
 *           drawn / outside pixels.
 *   --grid  (page) each panel's chord in her frame (plumb, colOff: a column's hem off its belt point), still air, a reset.
 *   --wide  (page) every vertex she draws farther than 0.40 m from her pelvis axis, by mesh, bone and ancestry.
 *
 *   --node                     the Node bench (no browser): Brea dressed in the Starter, the rig built, then the Scout
 *                              fitted over it and the Starter put back (the warm-up), then the Scout (the reward); each
 *                              read standing, at a walk, a jog and the stop after it.
 *   --page --port <p>          the game from the real title: fixture(2) (the slice's end, the Scout worn) written as a
 *                              save on disk, CONTINUE, the sheet closed; read standing, then after a 2 s run and a stop;
 *                              then the flap reads (the world's wind held at 5.5 m/s on its own bearing for them).
 *                              Vite is served from CLEAN_TREE (tools/perf/clean-measure.sh) or this tree.
 * Output: one JSON line per read, and `A-cloth-fitted-set PASS|FAIL` with the worst numbers. --json <file> writes all.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BAR_OUT = 0.20;
/** The flap clause's bars (see the header): a panel column's chord off plumb (deg) and the drawn panels' reach from her
 *  pelvis axis (m), in the trade wind at 5.5 m/s, standing and after a run's stop. */
const FLAP_COL = 27, FLAP_REACH = 0.45;
/** The sheet clause (see the header): drawn pixels of her meshes outside their CPU-skinned visible box (+ SHEET_PAD px),
 *  in total per read, at 1600 x 900. */
const SHEET_PX = 200, SHEET_PAD = 6;
const BODY_COLS = /^(torso\d|hips|thigh[LR]|shin[LR]|upArm[LR]|foreArm[LR]|handR|head|neck)$/;

/** The panels against her body now: per panel its worst FREE column's chord off plumb (deg; a column with a particle within
 *  its stand-off + 5 mm of a body collider lies on her and is not graded), its centroid chord (belt row to hem row), and
 *  the drawn panel vertices' reach from her pelvis axis (readFitted). Self-contained: sent to the page as source. */
export function readFlap(M, rig, reach) {
  const out = { reach: +reach.toFixed(3), panels: {} };
  if (!rig) return out;
  const S = rig.sys, cols = S.colliders, body = cols.map((K) => /^(torso\d|hips|thigh[LR]|shin[LR]|upArm[LR]|foreArm[LR]|handR|head|neck)$/.test(K.name));
  for (const P of rig.pieces) {
    if (P.kind !== 'panel') continue;
    const x = P.x, C = P.C, R = P.R;
    const onBody = (i) => {
      const px = x[i * 3], py = x[i * 3 + 1], pz = x[i * 3 + 2];
      for (let c = 0; c < cols.length; c++) {
        const K = cols[c]; if (!body[c] || !K.on || !(P.mask & K.bit)) continue;
        const ax = K.a[0], ay = K.a[1], az = K.a[2], ex = K.b[0] - ax, ey = K.b[1] - ay, ez = K.b[2] - az, l2 = ex * ex + ey * ey + ez * ez;
        let t = l2 > 1e-12 ? ((px - ax) * ex + (py - ay) * ey + (pz - az) * ez) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(px - ax - ex * t, py - ay - ey * t, pz - az - ez * t) - (K.r0 + (K.r1 - K.r0) * t) - (P.offC ? P.offC[c] : P.off);
        if (d < 0.005) return true;
      }
      return false;
    };
    let worst = 0, worstC = -1, onB = 0;
    for (let c = 0; c < C; c++) {
      let lies = false; for (let r = 1; r < R && !lies; r++) lies = onBody(c + r * C);
      if (lies) { onB++; continue; }
      const a = c * 3, b = (c + (R - 1) * C) * 3, dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2], l = Math.hypot(dx, dy, dz);
      const d = Math.acos(Math.max(-1, Math.min(1, -dy / l))) * 57.2958;
      if (d > worst) { worst = d; worstC = c; }
    }
    const cen = (r) => { const o = [0, 0, 0]; for (let c = 0; c < C; c++) for (let k = 0; k < 3; k++) o[k] += x[(c + r * C) * 3 + k] / C; return o; };
    const A = cen(0), B = cen(R - 1), L = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
    out.panels[P.name] = { col: +worst.toFixed(1), at: worstC, onBody: onB, chord: +(Math.acos(Math.max(-1, Math.min(1, (A[1] - B[1]) / L))) * 57.2958).toFixed(1) };
  }
  return out;
}
const flapMax = (a, b) => { if (!a) return b; const o = { reach: Math.max(a.reach, b.reach), panels: {} }; for (const k of Object.keys(b.panels)) { const p = a.panels[k], q = b.panels[k]; o.panels[k] = !p || q.col >= p.col ? { ...q, chord: Math.max(q.chord, p?.chord ?? 0) } : { ...p, chord: Math.max(q.chord, p.chord) }; } return o; };
const flapPass = (f) => f.reach <= FLAP_REACH && Object.values(f.panels).every((p) => p.col <= FLAP_COL);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ the read (runs in Node or in the page) */
/** `M` her model, `rig` the grid cloth (or null), `bits` the loadout's hidden piece bits, `uOf(mesh)` the uHidePiece value
 *  the mesh's drawn program binds (null: unknown). Self-contained: sent to the page as source. */
export function readFitted(M, rig, bits, uOf, BAR) {
  M.updateMatrixWorld(true);
  const T = M.position.constructor;
  const v = new T(), s = new T();
  let pel = null; M.traverse((o) => { if (!pel && o.isBone && o.name === 'pelvis') pel = o; });
  const pp = new T().setFromMatrixPosition(pel.matrixWorld);
  const out = { meshes: [], loose: 0, out: 0, worst: 0, reach: 0, panelVerts: 0, hats: null, hatBits: bits };
  // the rig's sample at (s, t) of a piece, and each piece's bind parameters by stem (the rig's own, P.verts)
  const pieces = rig ? rig.pieces.filter((P) => P.kind === 'panel') : [];
  const byIdx = new Map(pieces.map((P) => [P, new Map((P.verts || []).map((r) => [r.i, r]))]));
  M.traverse((o) => {
    if (!o.isSkinnedMesh || !/^outfit:/.test(o.userData?.heroPart || '') || o.name === 'Caster' || o.userData.heroCaster) return;
    if (!o.visible) return;
    const bn = o.skeleton.bones.map((b) => b.name), si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
    const row = { tag: o.userData.heroPart, panel: 0, loose: 0, out: 0, worst: 0 };
    // the rig's vertex records of this mesh (bind params), when it was built on it
    const vmap = new Map();
    for (const P of pieces) for (const r of P.verts || []) if (r.mesh === o) vmap.set(r.i, [P, r]);
    for (let i = 0; i < si.count; i++) {
      let wd = 0, wc = 0, stem = null;
      for (let k = 0; k < 4; k++) {
        const nm = bn[si.getComponent(i, k)] || '', w = sw.getComponent(i, k);
        if (nm.startsWith('dyn_panel')) { wd += w; stem = nm.replace(/_\d+$|_end$/, ''); } else if (nm.startsWith('cl_panel')) wc += w;
      }
      if (wd + wc < 0.3) continue;
      row.panel++;
      o.getVertexPosition(i, v); o.localToWorld(v);
      const reach = Math.hypot(v.x - pp.x, v.z - pp.z);
      if (reach > out.reach) out.reach = reach;
      if (wd >= 0.3) row.loose++;
      // where the grid puts this point: the rig's record (on the grid) or the same stem's piece at this vertex's place
      // in its bind, found by its nearest record on the rig's built mesh
      let d = 0;
      const rec = vmap.get(i);
      if (rec) { rig._sample(rec[0], rec[1].s, rec[1].t, s); d = v.distanceTo(s); }
      else if (stem) {
        const P = pieces.find((q) => q.stem === stem);
        if (P && P.verts?.length) {
          // the source geometry's vertex i is the same vertex in every binding of the same set (bindPart shares geometry)
          const r = byIdx.get(P).get(i);
          if (r) { rig._sample(P, r.s, r.t, s); d = v.distanceTo(s); }
        }
      }
      if (d > row.worst) row.worst = d;
      if (d > BAR) row.out++;
    }
    out.meshes.push(row);
    out.loose += row.loose; out.out += row.out; out.panelVerts += row.panel; out.worst = Math.max(out.worst, row.worst);
    // the hat: which of its copies (PIECE 32 head, 64 / 128 back) the drawn program shows
    const pc = o.geometry.getAttribute('_piece') || o.geometry.getAttribute('_PIECE');
    if (pc) {
      const have = new Set();
      for (let i = 0; i < pc.count; i++) { const p = Math.round(pc.getX(i)); for (const b of [32, 64, 128]) if (p & b) have.add(b); }
      const u = uOf(o);
      out.hats = { copies: [...have], drawnBits: u, shown: [...have].filter((b) => u == null ? true : !(u & b)).length };
    }
  });
  for (const k of ['worst', 'reach']) out[k] = +out[k].toFixed(3);
  for (const m of out.meshes) m.worst = +m.worst.toFixed(3);
  return out;
}

/** (page) The drawn-pixel pick: every candidate mesh rendered alone with its own material (see the header's `sheet`).
 *  Self-contained: sent to the page as source. Returns { total, meshes: [...] } (total over her meshes). */
export async function pickDrawn(PAD, list) {
  const C = window.__CTX__, R = C.renderer, S = C.scene, cam = C.camera, P = C.player, M = P.model, gl = R.getContext();
  await new Promise((r) => requestAnimationFrame(r));
  S.updateMatrixWorld(true);
  const T = M.position.constructor, v = new T();
  let pel = null; M.traverse((o) => { if (!pel && o.isBone && o.name === 'pelvis') pel = o; });
  const pp = new T().setFromMatrixPosition(pel.matrixWorld);
  const inHer = (o) => { let q = o; while (q) { if (q === M) return true; q = q.parent; } return false; };
  const shown = (o) => { let q = o; while (q) { if (!q.visible) return false; q = q.parent; } return true; };
  const cands = [];
  S.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position || !shown(o)) return;
    const her = inHer(o);
    if (!her) { if (!(o.isSkinnedMesh || o.frustumCulled === false)) return; v.setFromMatrixPosition(o.matrixWorld); if (v.distanceTo(pp) > 3) return; }
    cands.push({ o, her });
  });
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, buf = new Uint8Array(W * H * 4);
  const LAYER = 31, camMask = cam.layers.mask, bg = S.background, sAuto = R.shadowMap.autoUpdate, lights = [];
  S.traverse((o) => { if (o.isLight) lights.push([o, o.layers.mask]); });
  let Col = null; M.traverse((o) => { if (!Col && o.material?.color?.isColor) Col = o.material.color.constructor; });
  const cc = new Col(); const ca = R.getClearAlpha(); R.getClearColor(cc);
  const out = { total: 0, meshes: [] };
  try {
    S.background = null; R.shadowMap.autoUpdate = false; cam.layers.set(LAYER);
    for (const [L] of lights) L.layers.enable(LAYER);
    R.setRenderTarget(null);
    for (const { o, her } of cands) {
      const m0 = o.layers.mask; o.layers.enable(LAYER);
      try { R.setClearColor(0xff00ff, 1); R.clear(); R.render(S, cam); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf); } finally { o.layers.mask = m0; }
      // the key: a pixel no mesh drew (the clear colour as the drawing buffer holds it)
      const k0 = buf[0], k1 = buf[1], k2 = buf[2];
      // the CPU's box of its visible vertices, in drawing-buffer pixels (origin bottom left, as readPixels)
      const g = o.geometry, pos = g.attributes.position, pc = g.getAttribute('_piece') || g.getAttribute('_PIECE');
      const mats = [].concat(o.material || []);
      let bits = 0; for (const mm of mats) { const q = R.properties.get(mm)?.uniforms; bits |= (q?.uHidePiece?.value ?? q?.uKitHide?.value ?? 0) | 0; }
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, nv = 0, near = 0;
      for (let i = 0; i < pos.count; i++) {
        if (pc && bits && (Math.round(pc.getX(i)) & bits)) continue;
        if (o.isSkinnedMesh) o.getVertexPosition(i, v); else v.fromBufferAttribute(pos, i);
        o.localToWorld(v); v.project(cam);
        // (a vertex at or behind the near plane: its projection says nothing; the mesh is not graded)
        if (v.z > 1 || v.z < -1) { near++; continue; }
        const px = (v.x + 1) / 2 * W, py = (v.y + 1) / 2 * H; nv++;
        if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
      }
      x0 -= PAD; y0 -= PAD; x1 += PAD; y1 += PAD;
      if (near) { x0 = -1e9; y0 = -1e9; x1 = 1e9; y1 = 1e9; }
      let n = 0, outN = 0, bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const j = (y * W + x) * 4;
        if (buf[j] === k0 && buf[j + 1] === k1 && buf[j + 2] === k2) continue;
        n++; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
        if (x < x0 || x > x1 || y < y0 || y > y1) outN++;
      }
      // (graded: her skinned meshes, the body, the clothes, the wrap and the stow kit; a held weapon is reported only: the
      //  bow's own vertex hook bends its string and limbs on the GPU, combat/bow.js, 0.2 k px past the CPU's box in a draw)
      if (her && o.isSkinnedMesh) out.total += outN;
      if (!list && !outN) continue;
      let anc = [], q = o.parent; while (q && anc.length < 5) { anc.push(q.name || q.type); q = q.parent; }
      const sk = o.skeleton, b0 = sk?.bones?.[0]?.matrixWorld?.elements;
      out.meshes.push({ name: o.name || o.type, part: o.userData?.heroPart || null, her, skinned: !!o.isSkinnedMesh, anc: anc.join('<'),
        mat: mats.map((mm) => `${mm.name || mm.type}:${mm.uuid.slice(0, 8)}${mm.userData?.fadeU ? ':fade' : ''}`).join(','), bits, verts: pos.count, visVerts: nv,
        skel: sk ? { id: sk.uuid.slice(0, 8), bones: sk.bones.length, tex: sk.boneTexture ? sk.boneTexture.image.width : null, mats: sk.boneMatrices ? sk.boneMatrices.length / 16 : null, b0: b0 ? [b0[12], b0[13], b0[14]].map((u) => +u.toFixed(3)) : null } : null,
        culled: o.frustumCulled, obr: o.onBeforeRender && String(o.onBeforeRender).length > 40 ? String(o.onBeforeRender).slice(0, 60) : null,
        drawn: n, outside: outN, nearCam: near, drawnBox: n ? [bx0, by0, bx1, by1] : null, cpuBox: nv ? [x0, y0, x1, y1].map((u) => Math.round(u)) : null });
    }
  } finally {
    S.background = bg; R.shadowMap.autoUpdate = sAuto; cam.layers.mask = camMask;
    for (const [L, mk] of lights) L.layers.mask = mk;
    R.setClearColor(cc, ca);
  }
  return out;
}

const verdict = (reads) => {
  const loose = Math.max(...reads.map((r) => r.loose)), outN = Math.max(...reads.map((r) => r.out)), worst = Math.max(...reads.map((r) => r.worst));
  const hats = Math.max(...reads.map((r) => r.hats ? r.hats.shown : 1));
  // (no grid rig: the old chains were the cloth, before 4d11034; the row reads the grid cloth only)
  const noRig = reads.some((r) => r.rig === false);
  // (the flap clause: every flap read passes FLAP_COL and FLAP_REACH)
  const flaps = reads.filter((r) => r.flap);
  const flap = flaps.length ? { pass: flaps.every((r) => flapPass(r.flap)), col: Math.max(...flaps.flatMap((r) => Object.values(r.flap.panels).map((p) => p.col))), reach: Math.max(...flaps.map((r) => r.flap.reach)) } : null;
  // (the sheet clause, page only: the drawn pixels of her meshes outside their CPU-skinned visible box, worst read)
  const sh = reads.filter((r) => r.sheet != null);
  const sheet = sh.length ? { px: Math.max(...sh.map((r) => r.sheet)), at: sh.reduce((a, r) => (r.sheet > a.sheet ? r : a), sh[0]).label, reads: sh.length, pass: sh.every((r) => r.sheet <= SHEET_PX) } : null;
  const pass = !noRig && loose === 0 && outN === 0 && hats <= 1 && !!flap && flap.pass && (!sheet || sheet.pass);
  return { pass, noRig, loose, out: outN, worst: +worst.toFixed(3), reach: Math.max(...reads.filter((r) => !r.flap).map((r) => r.reach)), hatsShown: hats, flap, sheet };
};

/* ------------------------------------------------------------------ Node */
async function runNode() {
  // (the game's own cloth, as cloth/mode.js gives it: no flag is set here)
  const B = await import('./bench.mjs');
  const { loadPartRow } = await import('./load.mjs');
  const { ARMOR_ROWS } = await import('../../../src/hero/rows.js');
  const { peekClothRig } = await import('../../../src/entities/anim/cloth/rig.js');
  const R = await B.makeBench({});
  B.reset(R);
  // (the bench's assets: the deferred rows load and unload as src/core/assets.js does it, by row)
  const A = R.ctx.assets;
  A.loadExtra = async (rows) => { for (const [k, spec] of Object.entries(rows)) A.models[k] = await loadPartRow(k, spec); };
  A.unload = (k) => { delete A.models[k]; };
  // the bench's player has no fade clones: the drawn uniform is the source material's own
  const uOf = (m) => m.material?.userData?.clothU?.uHidePiece?.value ?? null;
  const reads = [];
  const read = (label) => { const rig = peekClothRig(R.an); const r = readFitted(R.model, rig, R.hero.loadout._pieceBits, uOf, BAR_OUT); r.label = label; r.row = R.hero.outfit.row; r.rig = !!rig; reads.push(r); console.log(JSON.stringify({ label, row: r.row, rig: r.rig, loose: r.loose, out: r.out, worst: r.worst, reach: +r.reach.toFixed(3), hats: r.hats, meshes: r.meshes.map((m) => `${m.tag}:${m.panel}/${m.loose}/${m.out}`) })); };
  const go = (speed, n) => { R.player.velocity.set(0, 0, speed); R.player.moveSpeed = speed; for (let i = 0; i < n; i++) B.step(R); };
  const legs = (tag) => { go(0, 60); read(`${tag} stand`); go(1.5, 90); read(`${tag} walk`); go(5, 90); read(`${tag} jog`); go(0, 45); read(`${tag} stop`); };
  legs('starter');
  // the warm-up: the Scout fitted over, then hers back
  await R.hero.loadout.equipArmor('pan-2'); B.step(R);
  await R.hero.loadout.equipArmor('pan-1');
  legs('starter after warm-up');
  // the reward
  await R.hero.loadout.equipArmor('pan-2');
  legs('scout');
  // the flap: the trade wind at 5.5 m/s from the bench's NE (the world's bearing), the Scout worn: standing 3 s, then
  // 1.5 s after a 2 s run's stop, each the worst of its last second
  R.an.setWind(45 * Math.PI / 180, 5.5);
  const flapRead = (label, speed, n) => {
    let f = null;
    for (let i = 0; i < n; i++) { R.player.velocity.set(0, 0, speed); R.player.moveSpeed = speed; B.step(R); if (i >= n - 60) { const rig = peekClothRig(R.an); f = flapMax(f, readFlap(R.model, rig, readFitted(R.model, rig, R.hero.loadout._pieceBits, uOf, BAR_OUT).reach)); } }
    const r = { label, row: R.hero.outfit.row, rig: true, loose: 0, out: 0, worst: 0, reach: f.reach, hats: null, flap: f }; reads.push(r);
    console.log(JSON.stringify({ label, flap: f, pass: flapPass(f) }));
  };
  flapRead('flap: standing in the trade wind', 0, 180);
  go(5, 120);
  flapRead('flap: 1.5 s after a run', 0, 150);
  return reads;
}

/* ------------------------------------------------------------------ page */
async function runPage() {
  const { spawn } = await import('node:child_process');
  const net = await import('node:net');
  const puppeteer = (await import('puppeteer')).default;
  const { RUNS } = await import('../../frames/paths.mjs');
  const { guardPort, profileDir, disposeProfile, installProfileCleanup } = await import('../../chrome-profile.mjs');
  const { takeMachineSlot, releaseMachineSlot } = await import('../../chrome-slot.mjs');
  const { fixture } = await import('../systems/first-hour-fixtures.mjs');
  const PORT = guardPort(flag('--port'));
  const TREE = process.env.CLEAN_TREE || REPO;
  const { execFileSync } = await import('node:child_process');
  const commit = execFileSync('git', ['-C', TREE, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const runDir = path.join(RUNS, `${stamp}-${commit}-${flag('--label', 'cloth-fitted')}`);
  mkdirSync(runDir, { recursive: true });
  const portOpen = (p) => new Promise((r) => { const s = net.connect(p, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
  let vite = null, browser = null, profile = null;
  const reads = [], cons = [];
  try {
    if (await portOpen(PORT)) throw new Error(`port ${PORT} already in use`);
    const slot = await takeMachineSlot({ who: `cloth fitted-set ${PORT}`, waitS: 1800 });
    if (!slot.ok) throw new Error(slot.why);
    vite = spawn('nice', ['-n', '10', 'npx', 'vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: TREE, stdio: 'ignore', detached: true });
    for (let i = 0; i < 240 && !(await portOpen(PORT)); i++) await sleep(250);
    installProfileCleanup();
    profile = profileDir(PORT);
    browser = await puppeteer.launch({ headless: 'new', userDataDir: profile, protocolTimeout: 240000,
      args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1600,940',
        '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
    page.on('console', (m) => { if (m.type() === 'error') cons.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => cons.push(`pageerror: ${String(e).slice(0, 300)}`));
    const base = `http://127.0.0.1:${PORT}/`;
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.__CTX__?.state === 'title' && !!window.__CTX__?.progression?.saves?.store, { timeout: 180000, polling: 200 });
    const rec = { ...fixture(2), savedAt: Date.now() };
    const wrote = await page.evaluate((r) => { const st = window.__CTX__.progression.saves.store; st.setActive(1); return st.write(r); }, rec);
    if (!wrote?.ok) throw new Error(`fixture not written: ${JSON.stringify(wrote)}`);
    // the game from the title: CONTINUE on the fixture's slot (twice: the verbs' reads come from a load of their own)
    const boot = async () => {
      await page.goto('about:blank');
      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 180000 });
      await page.waitForFunction(() => window.__CTX__?.state === 'title' && window.__CTX__?.menus?.titleStage === 'press', { timeout: 180000, polling: 100 });
      await sleep(500);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.__CTX__?.menus?.titleStage === 'menu', { timeout: 60000, polling: 50 });
      await sleep(300);
      const cont = await page.evaluate(() => {
        const b = [...document.querySelectorAll('.mn-title-item')].find((x) => /CONTINUE/.test(x.textContent));
        if (!b || b.disabled) return 'no CONTINUE on the title';
        b.click();
        const g = document.querySelector('.gs-slot.cont .gs-slot-go');
        if (!g) return 'no marked slot card';
        g.click(); return null;
      });
      if (cont) throw new Error(cont);
      await page.waitForFunction(() => window.__CTX__?.state === 'playing' && document.getElementById('loading')?.classList.contains('hidden') !== false, { timeout: 120000, polling: 100 });
      await sleep(3000);
      await page.evaluate(`window.__readFitted = ${readFitted.toString()}; window.__pickDrawn = ${pickDrawn.toString()};`);
    };
    await boot();
    const read = async (label) => {
      const r = await page.evaluate(async (BAR) => {
        const C = window.__CTX__, P = C.player, an = P.animator, R = C.renderer;
        // (the app's own module instance: Vite serves it at this URL)
        const rig = (await import('/src/entities/anim/cloth/rig.js')).peekClothRig(an);
        // the value the DRAWN program binds: 0 when its program has no uHidePiece (a program linked without the piece
        // stage draws every copy, whatever the material's uniform says)
        const uOf = (m) => { const q = R.properties.get(m.material), map = q?.currentProgram?.getUniforms?.()?.map; if (!map) return null; return 'uHidePiece' in map ? (q.uniforms?.uHidePiece?.value ?? 0) : 0; };
        const out = window.__readFitted(P.model, rig, P.hero?.loadout?._pieceBits ?? null, uOf, BAR);
        out.row = P.hero?.outfit?.row; out.rig = !!rig; out.info = an.clothInfo?.()?.pieces?.map((p) => `${p.name}:${p.verts}`) ?? null;
        return out;
      }, BAR_OUT);
      r.label = label; reads.push(r);
      // the sheet: what the GPU draws against where the CPU skins it
      const pk = await page.evaluate(async (PAD, list) => window.__pickDrawn(PAD, list), SHEET_PAD, args.includes('--list'));
      r.sheet = pk.total;
      console.log('SHEET', label, JSON.stringify({ total: pk.total, meshes: pk.meshes }));
      // --wide: every vertex she draws (any mesh on her, the caster out) farther than 0.40 m from her pelvis axis, by mesh
      // and its dominant bone
      if (args.includes('--wide')) {
        const w = await page.evaluate(() => {
          const C = window.__CTX__, P = C.player, M = P.model; M.updateMatrixWorld(true);
          const T = M.position.constructor, v = new T(); let pel = null; M.traverse((o) => { if (!pel && o.isBone && o.name === 'pelvis') pel = o; });
          const pp = new T().setFromMatrixPosition(pel.matrixWorld), out = {};
          M.traverse((o) => {
            if (!o.isMesh || !o.visible || o.material?.colorWrite === false) return;
            const g = o.geometry, pos = g.attributes.position; if (!pos) return;
            const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, pc = g.getAttribute('_piece') || g.getAttribute('_PIECE');
            const bn = o.skeleton ? o.skeleton.bones.map((b) => b.name) : null;
            for (let i = 0; i < pos.count; i++) {
              if (o.isSkinnedMesh) o.getVertexPosition(i, v); else v.fromBufferAttribute(pos, i);
              o.localToWorld(v);
              const d = Math.hypot(v.x - pp.x, v.z - pp.z); if (d < 0.40 || v.y > pp.y + 0.3) continue;
              let b = '-'; if (si && bn) { let bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; b = bn[si.getComponent(i, k)]; } } }
              let anc = [], q = o.parent, shown = o.visible; while (q && q !== M) { anc.push(q.name || q.type); shown = shown && q.visible; q = q.parent; }
              const key = `${o.name}|${o.userData?.heroPart || ''}|${b}${pc ? '|p' + Math.round(pc.getX(i)) : ''}|${o.name ? '' : `${o.type} ${o.material?.name || o.material?.type} #${o.material?.color?.getHexString?.()} v${pos.count} shown=${shown} anc=${anc.slice(0, 4).join('<')} ud=${Object.keys(o.userData || {}).join(',')}`}`;
              out[key] = out[key] || { n: 0, max: 0 }; out[key].n++; out[key].max = Math.max(out[key].max, +d.toFixed(3));
            }
          });
          return out;
        });
        console.log('WIDE', label, JSON.stringify(w));
      }
      await page.screenshot({ path: path.join(runDir, `${label.replace(/\W+/g, '-')}.jpg`), type: 'jpeg', quality: 85 });
      console.log(JSON.stringify({ label, row: r.row, rig: r.rig, loose: r.loose, out: r.out, worst: r.worst, reach: +r.reach.toFixed(3), hats: r.hats, meshes: r.meshes.map((m) => `${m.tag}:${m.panel}/${m.loose}/${m.out}`) }));
    };
    await read('continued stand');
    // (the drawn sheets, straight after CONTINUE, where the flap was filmed at a bow aim (after the runs she may face a wall
    //  and the aim's camera then stands inside her): a bow aim, the draw, the loose, the lance out and a swing; the sheet clause reads each)
    await page.mouse.move(800, 450);
    await page.keyboard.press('Digit1'); await sleep(400);
    await page.mouse.down({ button: 'right' }); await sleep(1200);
    await read('aim');
    await page.keyboard.down('ShiftLeft');
    await page.mouse.down({ button: 'left' }); await sleep(1000);
    await read('draw');
    await page.mouse.up({ button: 'left' }); await sleep(500);
    await read('loosed');
    await page.keyboard.up('ShiftLeft'); await page.mouse.up({ button: 'right' }); await sleep(800);
    await page.keyboard.press('Digit2'); await sleep(1200);
    await read('lance out');
    await page.mouse.down({ button: 'left' }); await sleep(120); await page.mouse.up({ button: 'left' }); await sleep(350);
    await read('lance swing');
    await sleep(900);
    // (then a load of their own for the runs and the flap: its clause is read on the hang straight after a load, the
    //  verbs' own state is backlog)
    await boot();
    await read('continued stand 2');
    await page.keyboard.down('KeyW'); await sleep(2000); await page.keyboard.up('KeyW');
    await read('after run');
    await sleep(1500);
    await read('stopped');
    // the flap: the world's wind held at 5.5 m/s on its own bearing (environment.windAt, put back after), standing 3 s,
    // then 1.5 s after a 2 s run's stop; each the worst of 1 s of frames
    await page.evaluate(`window.__readFlap = ${readFlap.toString()}; window.__flapMax = ${flapMax.toString()};`);
    const flapRead = async (label) => {
      const f = await page.evaluate(async (BAR) => {
        const C = window.__CTX__, P = C.player, an = P.animator;
        const rig = (await import('/src/entities/anim/cloth/rig.js')).peekClothRig(an);
        let f = null;
        for (let k = 0; k < 60; k++) {
          await new Promise((r) => requestAnimationFrame(r));
          const reach = window.__readFitted(P.model, rig, P.hero?.loadout?._pieceBits ?? null, () => null, BAR).reach;
          f = window.__flapMax(f, window.__readFlap(P.model, rig, reach));
        }
        return f;
      }, BAR_OUT);
      const r = { label, row: null, rig: true, loose: 0, out: 0, worst: 0, reach: f.reach, hats: null, flap: f }; reads.push(r);
      await page.screenshot({ path: path.join(runDir, `${label.replace(/\W+/g, '-')}.jpg`), type: 'jpeg', quality: 85 });
      console.log(JSON.stringify({ label, flap: f, pass: flapPass(f) }));
    };
    await page.evaluate(() => {
      const E = window.__CTX__.environment; if (!E || E.__flapWind) return;
      const own = E.windAt; E.__flapWind = own;
      E.windAt = function (x, z, out) { const w = this.wind, l = Math.hypot(w.x, w.z) || 1; if (out) { out.x = w.x / l * 5.5; out.z = w.z / l * 5.5; if ('y' in out) out.y = 0; } return 5.5; };
    });
    await sleep(2000);
    await flapRead('flap standing in the trade wind');
    await page.keyboard.down('KeyW'); await sleep(2000); await page.keyboard.up('KeyW');
    await sleep(1500);
    await flapRead('flap 1.5 s after a run');
    await page.evaluate(() => { const E = window.__CTX__.environment; if (E?.__flapWind) { E.windAt = E.__flapWind; delete E.__flapWind; } });
    // --diag: every drawn mesh that carries a PIECE mask, in the whole scene: its owner, the program it is drawn with,
    // whether that program binds uHidePiece, and the value it binds
    // --grid: each panel's chord (belt row to hem row centroids) in her frame, the wind, the colliders; then the same with
    // the wind held at 0 for 2 s, and after a fresh reset of the cloth
    if (args.includes('--grid')) {
      const g = await page.evaluate(async () => {
        const C = window.__CTX__, P = C.player, an = P.animator;
        const rig = (await import('/src/entities/anim/cloth/rig.js')).peekClothRig(an);
        const sleepP = (ms) => new Promise((r) => setTimeout(r, ms));
        const chord = () => rig.pieces.map((Q) => {
          const cen = (r) => { const o = [0, 0, 0]; for (let c = 0; c < Q.C; c++) for (let k = 0; k < 3; k++) o[k] += Q.x[(c + r * Q.C) * 3 + k] / Q.C; return o; };
          const a = cen(0), b = cen(Q.R - 1), h = P.heading, f = [Math.sin(h), 0, Math.cos(h)], rt = [Math.cos(h), 0, -Math.sin(h)];
          const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d);
          let wmax = 0; for (let c = 0; c < Q.C; c++) { const i = c + (Q.R - 1) * Q.C, j = c; wmax = Math.max(wmax, Math.hypot(Q.x[i * 3] - Q.x[j * 3], Q.x[i * 3 + 2] - Q.x[j * 3 + 2])); }
          // the hem's width across (first to last column) against the belt's
          const wid = (r) => Math.hypot(Q.x[((Q.C - 1) + r * Q.C) * 3] - Q.x[(r * Q.C) * 3], Q.x[((Q.C - 1) + r * Q.C) * 3 + 2] - Q.x[(r * Q.C) * 3 + 2]);
          return { n: Q.name, plumb: +(Math.acos(Math.max(-1, Math.min(1, -d[1] / L))) * 57.3).toFixed(1), fwd: +(d[0] * f[0] + d[2] * f[2]).toFixed(3), lat: +(d[0] * rt[0] + d[2] * rt[2]).toFixed(3), len: +L.toFixed(3), hemW: +wid(Q.R - 1).toFixed(3), beltW: +wid(0).toFixed(3), colOff: +wmax.toFixed(3), asleep: Q.asleep };
        });
        const out = { wind: { ...an.wind }, info: rig.info(), stand: chord(), scale: rig.rootP?.s, rest: rig.pieces.map((Q) => Q.restScale) };
        // (round 2: the world's wind is written into an.wind every frame (playerAnimator, environment.windAt), so the still
        //  air is held at the source: at round 1 this read was the trade wind still)
        const E = C.environment, own = E?.windAt;
        if (E) E.windAt = (x, z, o) => { if (o) { o.x = 0; o.z = 0; } return 0; };
        const w0 = { ...an.wind }; an.wind.x = 0; an.wind.z = 0; an.wind.gust = 0;
        await sleepP(2000); out.still = chord();
        if (E) E.windAt = own;
        Object.assign(an.wind, w0);
        an.clothReset?.(C.engine?.simTime ?? 0); await sleepP(300); out.reset = chord();
        out.info = { sub: out.info.sub, colliders: out.info.colliders.filter((c) => c.on === false || c.r0 > 0.2).map((c) => c.name), pieces: out.info.pieces };
        return out;
      });
      console.log('GRID', JSON.stringify(g));
    }
    if (args.includes('--diag')) {
      const d = await page.evaluate(() => {
        const C = window.__CTX__, R = C.renderer, out = [];
        C.scene.traverse((o) => {
          if (!o.isMesh || !o.geometry) return;
          const pc = o.geometry.getAttribute('_piece') || o.geometry.getAttribute('_PIECE');
          if (!pc) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            const pr = R.properties.get(m), prog = pr?.currentProgram;
            const map = prog?.getUniforms?.()?.map || {};
            let anc = [], q = o; while (q && anc.length < 4) { anc.push(q.name || q.type); q = q.parent; }
            out.push({ name: o.name, part: o.userData?.heroPart ?? null, visible: o.visible, inHer: (() => { let q = o; while (q) { if (q === C.player.model) return true; q = q.parent; } return false; })(), anc: anc.join('<'),
              mat: m?.name, fade: !!m?.userData?.fadeU, key: prog?.cacheKey?.slice(0, 80) ?? null, hasU: 'uHidePiece' in map, u: pr?.uniforms?.uHidePiece?.value ?? null, layers: o.layers.mask, skinned: !!o.isSkinnedMesh });
          }
        });
        // the Scout's drawn material: its own hook on a bare shader, its key, and every program of a cloth key
        let mesh = null; C.player.model.traverse((o) => { if (!mesh && /^outfit:armorPan2/.test(o.userData?.heroPart || '')) mesh = o; });
        if (mesh) {
          const m = mesh.material, fake = { vertexShader: '#include <common>\n#include <begin_vertex>\n#include <project_vertex>', fragmentShader: '#include <common>\nvoid main() {', uniforms: {} };
          let hookOk = null; try { m.onBeforeCompile(fake, R); hookOk = fake.vertexShader.includes('uHidePiece'); } catch (e) { hookOk = String(e).slice(0, 120); }
          const pr = R.properties.get(m);
          out.push({ scout: true, key: m.customProgramCacheKey?.(), progKeyTail: pr?.currentProgram?.cacheKey?.slice(-80), hookOk, obc: String(m.onBeforeCompile).slice(0, 160), version: m.version,
            programs: (R.info.programs || []).filter((p) => /hero-cloth/.test(p.cacheKey)).map((p) => {
              const gl = R.getContext(), sh = gl.getAttachedShaders(p.program) || [], src = sh.map((x) => gl.getShaderSource(x) || '').join('\n');
              const map = p.getUniforms().map || {};
              return { tail: p.cacheKey.slice(-50), used: p.usedTimes, hasU: 'uHidePiece' in map, srcHasU: src.includes('uHidePiece'), srcHasFade: src.includes('uFadeK'), srcHasDetail: src.includes('uDetail'), nU: Object.keys(map).length, mapHasFade: 'uFadeK' in map, id: p.id };
            }), cur: pr?.currentProgram?.id });
          // who else holds program `cur` (every material in the scene and the engine's keepers)
          const cur = pr?.currentProgram, holders = [];
          const look = (mm, where) => { if (!mm) return; const q = R.properties.get(mm); if (q?.currentProgram === cur || (q?.programs && [...q.programs.values()].includes(cur))) holders.push({ where, name: mm.name, fade: !!mm.userData?.fadeU, keeper: /^keeper:/.test(mm.name || ''), obcNoop: String(mm.onBeforeCompile).length < 20, keyFn: String(mm.customProgramCacheKey).slice(0, 40), same: mm === m,
            obc: String(mm.onBeforeCompile).slice(0, 90), own: Object.keys(mm).filter((k) => typeof mm[k] === 'function'), uKeys: Object.keys(q?.uniforms || {}).filter((k) => /^u[A-Z]/.test(k)), ver: mm.version, defs: JSON.stringify(mm.defines) }); };
          C.scene.traverse((o) => { for (const mm of [].concat(o.material || [])) look(mm, o.name); });
          for (const k of C.engine._keepers || []) look(k, 'keeper');
          out.push({ holders });
          // (and once more after the material is asked to compile again)
          m.needsUpdate = true; R.render(C.scene, C.camera);
          const pr2 = R.properties.get(m), p2 = pr2?.currentProgram;
          out.push({ after: true, cur: p2?.id, hasU: 'uHidePiece' in (p2?.getUniforms?.()?.map || {}) });
        }
        return out;
      });
      console.log('DIAG', JSON.stringify(d));
    }
  } finally {
    try { await browser?.close(); } catch { /* */ }
    if (profile) disposeProfile(profile);
    if (vite) { try { process.kill(-vite.pid, 'SIGTERM'); } catch { /* */ } }
    releaseMachineSlot();
  }
  writeFileSync(path.join(runDir, 'report.json'), JSON.stringify({ commit, reads, console: cons }, null, 1));
  console.log(`run dir ${runDir}; console errors ${cons.length}`);
  return reads;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const reads = args.includes('--page') ? await runPage() : await runNode();
  const V = verdict(reads);
  console.log(`A-cloth-fitted-set ${V.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(V)}`);
  if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify({ verdict: V, reads }, null, 1));
  process.exitCode = V.pass ? 0 : 1;
}
