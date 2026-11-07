/**
 * CALIMA — the pose dump behind armor/rom-poses.json (armory W1; a tool, not a gate of the block).
 *
 *   node tools/gates.mjs --port <lane port> --only P-dump-poses --extra tools/build/recipes/armor/lib/rom-dump.gates.mjs
 *   node tools/build/recipes/armor/lib/rom-dump.mjs <that run's cwd>
 *
 * Re-dump when the clips or the rig change; the outfit recipes fit themselves to the file (lib/romfit.mjs).
 */
import { placed } from '../../../../gate-places.mjs';
const PRE = `
  const C = __CTX__, p = C.player, an = p.animator, cmb = C.combat, E = C.engine, H = p.hero;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const simWait = async (sec, capMs = 25000) => { const s0 = E.simTime, w0 = performance.now(); while (E.simTime - s0 < sec && performance.now() - w0 < capMs) await frame(); return E.simTime - s0; };
  for (const m of (C.machines?.list || [])) m.update = () => {};
  const keys = C.input.keys;
  const release = () => { keys.clear(); C.input.mouse.buttons = 0; };
  const T3 = p.position.constructor;
  const bone = (n) => an.bones?.[n] ?? (() => { let q = null; p.model.traverse((o) => { if (!q && o.isBone && o.name === n) q = o; }); return q; })();
`;
export const GATES = [{
  id: 'P-dump-poses', kind: 'action', lane: 'armory-tool', timeout: 180000, settle: 400,
  title: 'probe: bone matrices (model space) at the matrix poses, for the offline skin check',
  setup: `__CTX__.input.enabled = true;`,
  assert: placed(['openGround'], `(async () => {${PRE}
    standAt(p, 'openGround'); await wait(300);
    const M = cmb.melee;
    const outfit = H.outfit.meshes[0];
    const bones = outfit.skeleton.bones;
    const names = bones.map((b) => b.name);
    const inv = p.model.matrixWorld.clone();
    const dump = (tag, out) => { p.model.updateWorldMatrix(true, true); inv.copy(p.model.matrixWorld).invert(); const rows = bones.map((b) => { const m = b.matrixWorld.clone().premultiply(inv).elements; return Array.from(m, (v) => +v.toFixed(5)); }); out.push({ tag, rows }); };
    const lanceOut = async () => { if (M.stance !== 'holstered' && H._lanceOut) return; M.swing({}); const w0 = performance.now(); while (performance.now() - w0 < 5000) { await frame(); if (H._lanceOut && (!M.layer?.ok || !!M.layer._held) && M.stance === 'ready' && M.poseState().phase === 'idle') break; } await frame(); };
    const lanceAway = async () => { C.input.mouse.buttons |= 4; const w0 = performance.now(); while (performance.now() - w0 < 5000) { await frame(); if (!H._lanceOut && M.stance === 'holstered') break; } C.input.mouse.buttons = 0; cmb._holsterT = 0; await simWait(0.4, 3000); };
    const out = [];
    release(); await wait(150); C.input.mouse.buttons |= 4; await simWait(0.5, 3000); C.input.mouse.buttons = 0; await simWait(0.25, 2000);
    dump('idle-bow', out);
    await lanceOut(); dump('idle-lance', out);
    // (fix round 1: the lance's ready stance over 1.5 s, not one moment: the matrix's idle with the lance read 1.69-1.82
    // at the left ankle on a frame the single dump never saw)
    for (let k = 1; k <= 6; k++) { await simWait(0.25, 1500); dump('idle-lance-' + k, out); }
    keys.add('KeyW'); keys.add('ShiftLeft'); await simWait(1.4, 8000);
    for (let k = 0; k < 12; k++) { dump('sprint-lance-' + k, out); await simWait(0.055, 800); }
    release(); await lanceAway();
    C.input.mouse.buttons |= 4; await simWait(0.5, 3000); C.input.mouse.buttons = 0; await simWait(0.25, 2000);
    keys.add('KeyW'); keys.add('ShiftLeft'); await simWait(1.4, 8000);
    for (let k = 0; k < 12; k++) { dump('sprint-bow-' + k, out); await simWait(0.055, 800); }
    release(); await wait(300);
    keys.add('KeyW'); await simWait(0.9, 6000);
    for (let k = 0; k < 6; k++) { dump('jog-' + k, out); await simWait(0.09, 800); }
    release(); await wait(200);
    p.setCrouch(true); await simWait(0.5, 3000); keys.add('KeyW'); await simWait(0.6, 4000);
    for (let k = 0; k < 6; k++) { dump('crouch-' + k, out); await simWait(0.12, 900); }
    release(); p.setCrouch(false); await wait(400);
    keys.add('KeyW'); await simWait(0.3, 2000); p.dodge();
    for (let k = 0; k < 5; k++) { await simWait(0.1, 800); dump('dodge-' + k, out); }
    release(); await wait(500);
    p.jump(); for (let k = 0; k < 3; k++) { await simWait(0.18, 800); dump('jump-' + k, out); }
    release(); await wait(700);
    p.camPitch = 0; C.input.mouse.buttons |= 4; await simWait(0.6, 5000); C.input.mouse.buttons |= 1; await simWait(1.0, 6000); dump('draw0', out);
    release(); await wait(200); p.camPitch = -0.55; C.input.mouse.buttons |= 4; await simWait(0.6, 5000); C.input.mouse.buttons |= 1; await simWait(1.0, 6000); dump('drawDown', out);
    release(); await wait(200); p.camPitch = 0.5; C.input.mouse.buttons |= 4; await simWait(0.6, 5000); C.input.mouse.buttons |= 1; await simWait(1.0, 6000); dump('drawUp', out);
    release(); await wait(300); p.camPitch = 0;
    await lanceOut(); M.swing({ heavy: false }); let w0 = performance.now(); while (performance.now() - w0 < 2500) { await frame(); if (M.poseState().phase === 'strike') break; } dump('light', out); await frame(); dump('light1', out); await simWait(0.1, 800); dump('light2', out);
    release(); await wait(600); await lanceOut(); M.swing({ heavy: true }); w0 = performance.now(); while (performance.now() - w0 < 2500) { await frame(); if (M.poseState().phase === 'strike') break; } dump('heavy', out); await frame(); dump('heavy1', out); await simWait(0.12, 800); dump('heavy2', out);
    release();
    return { pass: true, detail: { names, poses: out, scale: p.model.getWorldScale(new T3()).x } };
  })()`),
}];
