/**
 * The cloth lane's clips for `session.mjs --clips` (merged into its CLIP_DEFS; the weapons brief's seam). Owned by the
 * cloth lane from the weapons lane's first commit on. Same format as clips-handling.mjs: every clip on SIMULATION time
 * (`sim: true`, 60 frames a second of sim time, each also written at quarter speed from the same frames); `lens` rides
 * her (`a` deg round her from her front, + to her left, or 'side' / '3q'; `d` m out, `h` m up, aimed `look` m over her
 * feet), null = the game's own chase camera.
 *
 * M1a cloth step 1 (the brief's 4.3): run-stop, turn on the spot, roll, landing, gust, crouch-walk, studio still, sprint
 * side-on, the heavy lunge, and the chase camera. Each starts by putting the cloth where the clip wants it: `G2` the grid
 * solver (cloth/rig.js); the old chains' clips (`G0`, the `...Old` clips) went with the old path in fix round 1 (the old
 * clips filmed at 20261116T004625Z-cloth stand beside the new).
 * The grid cloth is reset on the clip's first pose (its deterministic reset).
 */
const G2 = `p.animator.setClothMode?.(2); await w(1 / 60); p.animator.clothReset?.(0);`;
/** the world's wind at her held at `ms` m/s along its own bearing (environment.windAt scaled), restored by `UNWIND` */
const WIND = (ms) => `{ const E = C.environment; if (E && !E.__wa0) { E.__wa0 = E.windAt; } if (E) E.windAt = function (x, z, out) { const s = E.__wa0.call(E, x, z, out); const k = s > 1e-3 ? (${ms}) / s : 0; if (out) { out.x *= k; out.z *= k; } return s * k; }; }`;
const UNWIND = `{ const E = C.environment; if (E && E.__wa0) { E.windAt = E.__wa0; delete E.__wa0; } }`;
/** a turn on the spot: her heading (and the facing latch) swept by `deg` over `s` seconds */
const TURN = (deg, s) => `{ const n = Math.round(${s} * 60), d = (${deg}) * Math.PI / 180 / n; for (let i = 0; i < n; i++) { p.heading += d; if ('_faceX' in p) { p._faceX = p._candX = Math.sin(p.heading); p._faceZ = p._candZ = Math.cos(p.heading); } await w(1 / 60); } }`;

const runStop = (g) => `${g} await w(0.3); C.input.keys.add('KeyW'); await w(0.6); C.input.keys.add('ShiftLeft'); await w(1.6); C.input.keys.clear(); await w(2.0);`;
const gust = (g) => `${g} ${WIND(5.5)} await w(1.2); ${WIND(7.2)} await w(0.6); ${WIND(9)} await w(1.4); ${WIND(7.2)} await w(0.6); ${WIND(5.5)} await w(1.4); ${UNWIND}`;
const still = (g) => `${g} ${WIND(0)} await w(3.0); ${UNWIND}`;

/** a lens on the person whose id matches `re` (the clip's lens rides Brea; this one rides the person): `d` m out at `a` deg
 *  round from the person's front, `h` m up, aimed `look` m over their feet; undone by LENS_UNDO */
const PERSON_LENS = (re, a, d, h, look, fov) => `{ const E = C.engine, cam = C.camera; const q = (C.people?.list || []).find((x) => ${re}.test(x.id) && x.group?.visible) || (C.people?.list || []).filter((x) => x.group?.visible).sort((x, y) => x.distance - y.distance)[0];
  window.__lensQ = q ? q.id : null; const r0 = E.render; window.__lensR0 = r0; const V = cam.position.constructor;
  E.render = function (...args) { if (!q) return r0.apply(this, args); const sp = cam.position.clone(), sq = cam.quaternion.clone(), f0 = cam.fov, g = q.group.position, yw = q.group.rotation.y + (${a}) * Math.PI / 180;
    cam.position.set(g.x + Math.sin(yw) * ${d}, g.y + ${h}, g.z + Math.cos(yw) * ${d}); cam.lookAt(g.x, g.y + ${look}, g.z); cam.fov = ${fov}; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    try { return r0.apply(this, args); } finally { cam.position.copy(sp); cam.quaternion.copy(sq); cam.fov = f0; cam.updateProjectionMatrix(); cam.updateMatrixWorld(); } }; }`;
const LENS_UNDO = `{ if (window.__lensR0) { C.engine.render = window.__lensR0; window.__lensR0 = null; } }`;
/** the crowd's cost (TECH 9): every frame's game step timed on the REAL clock (the slate pins performance.now), the
 *  people near, each near person's cloth ring and Brea's, into window.__crowdStats for cloth-row.mjs's C-crowd-cost */
const CROWD = (sec, key = '__crowdStats') => `{ const rn = Performance.prototype.now.bind(performance), st = []; const P = C.people;
  for (const q of P?.list || []) if (q.chains?.strands) { q.chains.strands.sys.ringN = 0; q.chains.strands.sys.ringI = 0; }
  const s0 = window.__simStep; window.__simStep = () => { const t0 = rn(); s0(); st.push(rn() - t0); };
  const near = []; const n = Math.round(${sec} * 60);
  for (let i = 0; i < n; i++) { window.__simStep(); near.push((P?.list || []).filter((q) => q.tier === 0).length); await fr(); if (i % 2 === 0) await window.__simGrab(); }
  window.__simStep = s0;
  const ppl = (P?.list || []).filter((q) => q.chains?.strands && q.chains.strands.sys.ringN > 0).map((q) => ({ id: q.id, tier: q.tier, d: +q.distance.toFixed(1), ...q.chains.strands.info() }));
  const srt = st.slice().sort((a, b) => a - b), mean = st.reduce((a, b) => a + b, 0) / st.length;
  window.${key} = { frames: st.length, stepMs: { mean: +mean.toFixed(3), p50: +srt[srt.length >> 1].toFixed(3), p95: +srt[Math.floor(srt.length * 0.95)].toFixed(3) }, nearMax: Math.max(...near), nearMean: +(near.reduce((a, b) => a + b, 0) / near.length).toFixed(2), visible: (P?.list || []).filter((q) => q.group?.visible).length, people: ppl, brea: p.animator.clothInfo?.()?.timing || null, peopleMeanSum: +ppl.reduce((a, q) => a + (q.timing?.mean || 0), 0).toFixed(4),
    // (cloth round 6: who is on the solver and with what: each near person's archetype and its pieces' names, so a row can
    //  ask that Oro's apron is one of them)
    cast: (P?.list || []).filter((q) => q.tier === 0).map((q) => ({ id: q.id, arch: q.archetype || null, strands: q.chains?.strands ? q.chains.strands.info().pieces?.map((x) => x.name) ?? true : null, chains: (q.chains?.chains || []).map((c) => c.key) })) }; }`;

export const CLIPS = {
  // 1. run-stop: a sprint, released (player.js's own deceleration), side lens
  cRunStop: { sim: true, frame: 'F15', pose: 'idle', lens: { a: 'side', d: 3.2, h: 1.0, look: 0.9, fov: 40 }, js: runStop(G2) },
  // 2. a 180 deg turn on the spot in 0.5 s, three-quarter back
  cTurn: { sim: true, frame: 'F02', pose: 'idle', lens: { a: 150, d: 2.6, h: 1.1, look: 0.9, fov: 40 }, js: `${G2} await w(0.5); ${TURN(180, 0.5)} await w(1.4);` },
  // 3. a roll from a jog, side lens
  cRoll: { sim: true, frame: 'F15', pose: 'idle', lens: { a: 'side', d: 3.4, h: 1.0, look: 0.8, fov: 42 }, js: `${G2} C.input.keys.add('KeyW'); await w(0.8); p.dodge?.(); await w(1.0); C.input.keys.clear(); await w(1.0);` },
  // 4. a jump and its landing standing (the page has no 1.2 m drop at a frame's place: the jump's own fall)
  cLand: { sim: true, frame: 'F15', pose: 'idle', lens: { a: 'side', d: 3.0, h: 1.0, look: 0.9, fov: 40 }, js: `${G2} await w(0.4); p.jump?.(); await w(1.2); p.jump?.(); await w(1.4);` },
  // 5. the gust, standing: 5.5 m/s rising to 9 and back, three-quarter back
  cGust: { sim: true, frame: 'F02', pose: 'idle', lens: { a: 140, d: 2.6, h: 1.1, look: 0.9, fov: 40 }, js: gust(G2) },
  // 6. the crouch-walk, three-quarter front
  cCrouchWalk: { sim: true, frame: 'F18', pose: 'idle', lens: { a: '3q', q: 50, d: 2.6, h: 0.9, look: 0.7, fov: 40 }, js: `${G2} p.setCrouch?.(true); await w(0.6); C.input.keys.add('KeyW'); await w(2.4); C.input.keys.clear(); await w(0.8);` },
  // 7. the studio still: still air, three-quarter front at the studio place
  cStill: { sim: true, frame: 'F08', pose: 'idle', lens: { a: 35, d: 2.4, h: 1.2, look: 1.0, fov: 40 }, js: still(G2) },
  // 8. the sprint side-on (F15's staging)
  cSprint: { sim: true, frame: 'F15', pose: 'idle', lens: { a: 'side', d: 3.0, h: 1.0, look: 0.9, fov: 40 }, js: `${G2} C.input.keys.add('KeyW'); C.input.keys.add('ShiftLeft'); await w(3.0); C.input.keys.clear();` },
  // 9. the heavy lunge (F19's staging)
  cLunge: { sim: true, frame: 'F19', pose: 'idle', lens: { a: '3q', q: 70, d: 3.1, h: 1.2, look: 1.0, fov: 42 }, js: `${G2} const mel = C.combat.melee; mel.aimLock = 0; mel.drawLance(30); await w(1.2); C.input.mouse.buttons |= 1; await w(0.9); C.input.mouse.buttons &= ~1; await w(1.2);` },
  // 10. run, sprint and turns through the game's chase camera
  // 11. (step 2) the people: Ansel beside her (F20) at her tally in the trade wind, a three-quarter lens on Ansel; a near
  //     person at work in F21's line-up; the Saltrow street with the crowd (F22), the game's chase lens, timed (CROWD)
  cPeople: { sim: true, frame: 'F20', pose: 'idle', lens: null, js: `${PERSON_LENS('/matron/', 35, 2.6, 1.3, 1.0, 40)} await w(5.0); ${LENS_UNDO}` },
  cPeopleWork: { sim: true, frame: 'F21', pose: 'idle', lens: null, js: `${PERSON_LENS('/raker|porter|keeper/', 40, 2.4, 1.2, 0.9, 40)} await w(4.0); ${LENS_UNDO}` },
  cCrowd: { sim: true, frame: 'F22', pose: 'idle', lens: null, js: `${G2} ${CROWD(6.0)}` },
  // (cloth round 6) the Holds people: the Ninewalls street at work (F36, the five at work) timed as the Saltrow crowd is,
  //  into window.__holdsStats (cloth-row.mjs C-holds-cost); and Oro beside her (F37), a three-quarter lens on him and his
  //  apron, timed into window.__oroStats (C-oro-apron)
  cHolds: { sim: true, frame: 'F36', pose: 'idle', lens: null, js: `${G2} ${CROWD(6.0, '__holdsStats')}` },
  cOro: { sim: true, frame: 'F37', pose: 'idle', lens: null, js: `${G2} ${PERSON_LENS('/oro/', 35, 2.8, 1.3, 0.9, 40)} ${CROWD(4.0, '__oroStats')} ${LENS_UNDO}` },
  // (fix round 1: the judge at 49a86ca: the lens stayed where F15's staging put it while she ran off. The game's own
  //  camera update is put back (the frame's undo restores the staging's after the clip), behind her on her heading)
  cChase: { sim: true, frame: 'F15', pose: 'idle', lens: null, js: `${G2} p._updateCamera = Object.getPrototypeOf(p)._updateCamera; p.camYaw = p.heading + Math.PI; p.camPitch = 0.12; await w(0.3); C.input.keys.add('KeyW'); await w(1.2); C.input.keys.add('ShiftLeft'); await w(1.5); C.input.keys.delete('ShiftLeft'); C.input.keys.add('KeyD'); await w(0.8); C.input.keys.delete('KeyD'); C.input.keys.add('KeyA'); await w(0.8); C.input.keys.clear(); await w(1.2);` },
};
