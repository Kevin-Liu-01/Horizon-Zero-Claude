/**
 * BUILD M1.6e — THE REED PROBE, the page half (lane systems). Run by
 *   node tools/frames/film.mjs --port <p> --only F03,F31 --probe /tools/gates/systems/reed-probe-page.mjs
 * after each frame is staged and screenshotted. It measures, on the live game (window.__CTX__ only):
 *
 *   on F31 (the Glass)
 *     beds     the mask, the planted reeds (instances, triangles), and which bed the F31 place stands in
 *     reed     10 gust/lull cycles of one carrizo bed's own clock. A Plumb spawned by the machines system stands 15 m
 *              off a straight 14 m path through dense carrizo, held facing Brea (the hardest case: she is always in its
 *              cone, its line of sight open). Brea is crouched and still at the path's start before each gust.
 *              GUST: from the frame the bed's wind rises through 4 m/s she crouch-walks (W held, the look steered
 *              along the path, back and forth) until it falls back through 4 m/s; the Plumb's lamp must read calm on
 *              every frame of the gust (10 of 10).
 *              LULL: she walks straight on into the lull (the Plumb calmed first if it was not); the lamp must read
 *              wary within 4 s (10 of 10). She stops the frame it does, and the Plumb is calmed.
 *     lean     on every one of those cycles: the frame the bed's lean uniform (what the canes are drawn with) leaves
 *              its lull value, against the frame the bed's wind reaches 4 m/s; bar 0.8 s +- 0.1
 *   on F03 (the golden meadow)
 *     meadow   the same crouch-walk 15 m from the same kind of Plumb, 10 runs, 5 started while the nearest reed bed is in
 *              a gust and 5 in a lull: the lamp must read wary within 4 s in all 10 (the meadow never hides)
 *     lane     a Peg swarm of 3 spawned to walk through a carrizo bed (the Peg's own `spawnSwarm`): the lane its
 *              transects cut in the world mask at each segment's quarter points (bar 1.0 m +- 0.2), the cover left
 *              in the lane, the reeds re-planted (instances before and after). The cuts are cleared afterwards so
 *              F31 is filmed on the uncut mask.
 * Restores the time freeze, the keys, the player, the camera and every machine it made.
 */
export async function probe(frame) {
  if (frame?.id !== 'F31' && frame?.id !== 'F03') return { skipped: 'measured on F31 and F03 only' };
  const C = window.__CTX__, E = C.engine, M = C.machines, p = C.player, T = C.terrain, R = C.reeds;
  if (!R) return { error: 'no ctx.reeds: the reed system is not installed' };
  const RM = await import('/src/world/island/reedmask.js');
  const G = await import('/src/game/reeds/gust.js');
  const LS = M.lamps;
  const out = { frame: frame.id, t0: performance.now() };
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  const r3 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1000) / 1000);
  const hy = (x, z) => T.getHeight(x, z);
  const guard = async (k, fn) => { const t = performance.now(); try { out[k] = await fn(); } catch (e) { out[k] = { error: String(e?.stack || e).slice(0, 600) }; } (out.seconds ||= {})[k] = r3((performance.now() - t) / 1000); };
  const made = [];
  const disposeM = (m) => { try { if (M.sites?.dispose) M.sites.dispose(m); else throw new Error('no sites'); } catch (e) { const L = M.list, i = L.indexOf(m); if (i >= 0) L.splice(i, 1); try { m.dispose?.(); } catch (e2) { /* */ } m.root?.parent?.remove(m.root); } };
  const calm = (m) => { m.suspicion = 0; if (m.sc) m.sc.suspicion = 0; m._unseenT = 99; if (m.state !== 'patrol' && m.alive) m.setState?.('patrol'); };
  const face = (m, x, z) => { const h = Math.atan2(x - m.position.x, z - m.position.z); m.heading = h; if (m.sc) m.sc.heading = h; };
  const still = (m, x, z) => {
    m.route = [{ x, y: hy(x, z), z }]; m._wpIndex = 0;
    if (m.sc) m.sc._waitT = 1e6; else m._waitT = 1e6;
    m.position.set(x, hy(x, z), z); m.seatFeet?.();
  };
  const placeBrea = (x, z) => { p.position.set(x, hy(x, z), z); p._snapToGround?.(); p.velocity?.set?.(0, 0, 0); };
  const keys = C.input.keys;
  const walk = (on) => { if (on) keys.add('KeyW'); else keys.delete('KeyW'); };
  const steer = (x, z) => { const dx = x - p.position.x, dz = z - p.position.z; p.camYaw = Math.atan2(-dx, -dz); };
  const P0 = p.position.clone(), yaw0 = p.camYaw, crouch0 = !!p.crouching;
  const tc = () => R.t;

  E.requestTimeScale('studio', null);
  try {
    if (frame.id === 'F31') {
      /* ---- the beds ---- */
      await guard('beds', async () => {
        const b = R.mask.bedAt(P0.x, P0.z);
        let tris = 0; const draw = R.draw.stats();
        for (const k of Object.keys(draw)) tris += draw[k].instances * draw[k].trisEach;
        return { mask: R.mask.stats(), draw, triangles: tris, f31: { x: r3(P0.x), z: r3(P0.z), cover: r3(R.mask.cover(P0.x, P0.z)), bed: b ? b.id : null, kind: b ? b.kind : null } };
      });

      /* ---- the path through dense carrizo and the Plumb's stand ---- */
      const dense = (x, z) => { const b = R.mask.bedAt(x, z); return b && b.kind === RM.REED_KIND.CARRIZO ? R.mask.cover(x, z) : 0; };
      const GL = 0.16;
      let best = null;
      for (let i = 0; i < 4000 && !best; i++) {
        const x = R.mask.x0 + 8 + ((i * 0.618034) % 1) * 112, z = R.mask.z0 + 8 + ((i * 0.381966 * 7) % 1) * 112;
        if (dense(x, z) < 0.8) continue;
        for (let k = 0; k < 12 && !best; k++) {
          const a = k / 12 * Math.PI, dx = Math.sin(a), dz = Math.cos(a), L = 7.5;
          let ok = true;
          for (let s = -L; s <= L && ok; s += 0.5) for (const o of [-0.7, 0, 0.7]) {
            const qx = x + dx * s - dz * o, qz = z + dz * s + dx * o;
            if (dense(qx, qz) < 0.6 || hy(qx, qz) < GL + 0.08) ok = false;
          }
          if (!ok) continue;
          for (const side of [1, -1]) {
            const px = x - dz * 15 * side, pz = z + dx * 15 * side;
            if (hy(px, pz) < GL + 0.05 || R.mask.cover(px, pz) > 0.3) continue;
            let flat = true;
            for (let q = 0; q < 8; q++) { const b = q / 8 * Math.PI * 2; if (Math.abs(hy(px + Math.sin(b) * 2, pz + Math.cos(b) * 2) - hy(px, pz)) > 0.6) flat = false; }
            if (!flat) continue;
            best = { a: [x - dx * L, z - dz * L], b: [x + dx * L, z + dz * L], mid: [x, z], plumb: [px, pz], bed: R.mask.bedAt(x, z).id };
            break;
          }
        }
      }
      if (!best) { out.reed = { error: 'no straight 15 m path in dense carrizo with a dry stand 15 m off it' }; return out; }
      out.path = { a: best.a.map(r3), b: best.b.map(r3), plumb: best.plumb.map(r3), bed: best.bed };
      const clock = R.clocks[best.bed];

      const pl = M.spawn('plumb', best.plumb[0], best.plumb[1], { route: [{ x: best.plumb[0], z: best.plumb[1] }], heading: 0 });
      made.push(pl);
      still(pl, best.plumb[0], best.plumb[1]);

      await guard('reed', async () => {
        const gust = [], lull = [], leads = [];
        p.setCrouch(true);
        let target = best.b;
        const step = () => {
          const d = Math.hypot(target[0] - p.position.x, target[1] - p.position.z);
          if (d < 0.7) target = target === best.b ? best.a : best.b;
          steer(target[0], target[1]);
          face(pl, p.position.x, p.position.z);
        };
        const onLean = G.GUST.leanLull + 0.01 * (1 - G.GUST.leanLull);
        for (let cyc = 0; cyc < 10; cyc++) {
          if (performance.now() - out.t0 > 205000) { out.reedBudget = `stopped after ${cyc} cycles: 205 s of the page's 240 s call`; break; }
          // wait for the lull before the next gust; seat her, still and crouched, at the path's start
          walk(false);
          still(pl, best.plumb[0], best.plumb[1]); calm(pl);
          const w0 = performance.now();
          while (clock.gusting(tc()) && performance.now() - w0 < 20000) { face(pl, p.position.x, p.position.z); await raf(); }
          placeBrea(best.a[0], best.a[1]); target = best.b; p.setCrouch(true);
          let tOnLean = null, lastLull = null;
          // hold still until the rise through 4 m/s, watching the drawn lean leave its lull value
          while (!clock.gusting(tc()) && performance.now() - w0 < 25000) {
            const L = R.draw.uLean.value[best.bed];
            if (L <= onLean) { lastLull = tc(); tOnLean = null; } else if (tOnLean === null && lastLull !== null) tOnLean = tc();
            steer(target[0], target[1]); face(pl, p.position.x, p.position.z); calm(pl);
            await raf();
          }
          const tX = tc();
          if (tOnLean !== null) leads.push(r3(tX - tOnLean));
          // GUST: walk while the wind is >= 4 m/s
          const g = { cycle: cyc, start: r3(tX), frames: 0, calmFrames: 0, hiddenFrames: 0, coverFrames: 0, walked: 0, dMin: 99, dMax: 0, susMax: 0, lamps: {} };
          let last = p.position.clone();
          walk(true);
          const wg = performance.now();
          while (clock.gusting(tc()) && performance.now() - wg < 16000) {
            step();
            await raf();
            g.frames++;
            const s = LS.stateOf(pl); g.lamps[s] = (g.lamps[s] || 0) + 1; if (s === 'calm') g.calmFrames++;
            if (p.reedHidden) g.hiddenFrames++;
            if (p.reedKind === RM.REED_KIND.CARRIZO && p.reedCover >= RM.COVER_LINE) g.coverFrames++;
            g.walked += Math.hypot(p.position.x - last.x, p.position.z - last.z); last.copy(p.position);
            const d = Math.hypot(pl.position.x - p.position.x, pl.position.z - p.position.z); g.dMin = Math.min(g.dMin, d); g.dMax = Math.max(g.dMax, d);
            g.susMax = Math.max(g.susMax, pl.sc?.suspicion ?? pl.suspicion ?? 0);
          }
          g.seconds = r3(tc() - tX); g.walked = r3(g.walked); g.dMin = r3(g.dMin); g.dMax = r3(g.dMax); g.susMax = r3(g.susMax);
          g.pass = g.frames > 0 && g.calmFrames === g.frames && g.walked >= 0.7 * 1.4 * g.seconds && g.coverFrames >= 0.95 * g.frames;
          gust.push(g);
          // LULL: walk straight on; the lamp must read wary within 4 s
          const l = { cycle: cyc, start: r3(tc()), susAtStart: r3(pl.sc?.suspicion ?? 0), tWary: null, frames: 0, hiddenFrames: 0, coverFrames: 0, wind: null };
          if (LS.stateOf(pl) !== 'calm') calm(pl);
          const tL = tc();
          const wl = performance.now();
          while (!clock.gusting(tc()) && tc() - tL < 4.5 && performance.now() - wl < 9000) {
            step();
            await raf();
            l.frames++;
            if (p.reedHidden) l.hiddenFrames++;
            if (p.reedKind === RM.REED_KIND.CARRIZO && p.reedCover >= RM.COVER_LINE) l.coverFrames++;
            if (LS.stateOf(pl) === 'wary' || LS.stateOf(pl) === 'hostile') { l.tWary = r3(tc() - tL); l.lamp = LS.stateOf(pl); l.wind = r3(clock.speed(tc())); break; }
          }
          walk(false);
          calm(pl);
          l.pass = l.tWary !== null && l.tWary <= 4;
          lull.push(l);
        }
        walk(false);
        const leadPass = leads.filter((d) => Math.abs(d - 0.8) <= 0.1).length;
        out.lean = { leads, pass: leads.length >= 10 && leadPass === leads.length, inBar: leadPass, of: leads.length,
          bar: 'the bed\'s drawn lean (uLean) leaves its lull value 0.8 s +- 0.1 before its wind reaches 4 m/s' };
        return { gust, lull, gustPass: gust.filter((x) => x.pass).length, lullPass: lull.filter((x) => x.pass).length,
          bar: 'gust: the Plumb at 15 m stays calm on every frame of the gust while she crouch-walks in carrizo (10/10); lull: the same walk raises it to wary within 4 s (10/10)',
          pass: gust.filter((x) => x.pass).length === 10 && lull.filter((x) => x.pass).length === 10 };
      });
    }

    if (frame.id === 'F03') {
      /* ---- the meadow never hides ---- */
      const ref = R.clocks[0];
      await guard('meadow', async () => {
        const runs = [];
        const md = C.vegetation?.meadow;
        // a stand 15 m ahead of her on the meadow, a 10 m walk across its line of sight
        const fx = -Math.sin(p.camYaw), fz = -Math.cos(p.camYaw);
        const px = P0.x + fx * 15, pz = P0.z + fz * 15;
        const pl = M.spawn('plumb', px, pz, { route: [{ x: px, z: pz }], heading: 0 });
        made.push(pl); still(pl, px, pz);
        const a = [P0.x + fz * 5, P0.z - fx * 5], b = [P0.x - fz * 5, P0.z + fx * 5];
        for (let k = 0; k < 10; k++) {
          const wantGust = k < 5;
          const w0 = performance.now();
          while (ref.gusting(tc()) !== wantGust && performance.now() - w0 < 20000) { await raf(); }
          placeBrea(a[0], a[1]); p.setCrouch(true); calm(pl);
          for (let q = 0; q < 6; q++) { face(pl, p.position.x, p.position.z); steer(b[0], b[1]); calm(pl); await raf(); }
          const t0 = tc(), r = { gustAtStart: ref.gusting(t0), wind: r3(ref.speed(t0)), tWary: null, hiddenFrames: 0, frames: 0,
            meadow: md?.densityAt ? r3(md.densityAt(p.position.x, p.position.z)) : null, kind: null };
          walk(true);
          const wm = performance.now();
          while (tc() - t0 < 4.5 && performance.now() - wm < 9000) {
            steer(b[0], b[1]); face(pl, p.position.x, p.position.z);
            await raf(); r.frames++;
            if (p.reedHidden) r.hiddenFrames++;
            r.kind = p.reedKind;
            const s = LS.stateOf(pl);
            if (s === 'wary' || s === 'hostile') { r.tWary = r3(tc() - t0); break; }
          }
          walk(false); calm(pl);
          r.dist = r3(Math.hypot(pl.position.x - p.position.x, pl.position.z - p.position.z));
          r.pass = r.tWary !== null && r.tWary <= 4 && r.hiddenFrames === 0;
          runs.push(r);
        }
        return { runs, pass: runs.every((r) => r.pass), inBar: runs.filter((r) => r.pass).length, of: runs.length,
          bar: 'crouch-walking in the golden meadow 15 m from a Plumb raises it to wary within 4 s in 10/10 (5 in a gust, 5 in a lull), hidden on no frame' };
      });

      /* ---- a Peg swarm's lane through the reeds ---- */
      await guard('lane', async () => {
        const SW = await import('/src/instruments/kinds/peg-swarm.js');
        const TSm = await import('/src/instruments/kinds/peg-transect.js');
        // a line along the F31 bed (its densest straight run), the swarm's own spawn
        const dense = (x, z) => { const b = R.mask.bedAt(x, z); return b && b.kind === RM.REED_KIND.CARRIZO ? R.mask.cover(x, z) : 0; };
        let line = null;
        for (let i = 0; i < 3000 && !line; i++) {
          const x = R.mask.x0 + 8 + ((i * 0.618034) % 1) * 112, z = R.mask.z0 + 8 + ((i * 0.2763932) % 1) * 112;
          if (dense(x, z) < 0.9) continue;
          for (let k = 0; k < 12 && !line; k++) {
            const a = k / 12 * Math.PI; let ok = true;
            for (let s = -9; s <= 9 && ok; s += 1) if (dense(x + Math.sin(a) * s, z + Math.cos(a) * s) < 0.7) ok = false;
            if (ok) line = { x, z, bearing: a };
          }
        }
        if (!line) throw new Error('no 18 m straight run of dense carrizo for the swarm');
        const planted0 = R.draw.planted, cuts0 = R.mask.cuts.cuts;
        // Brea 25 m off (the AI runs near her), crouched and still
        placeBrea(line.x + Math.cos(line.bearing) * 25, line.z - Math.sin(line.bearing) * 25);
        const six = SW.spawnSwarm(M, line.x, line.z, 3, { bearing: line.bearing, length: 18 });
        made.push(...six);
        for (const m of six) { m.sightRange = 0.01; m.hearRange = 0.01; }
        const S = TSm.transectsOf(M);
        const t0 = tc(), w0 = performance.now();
        while (tc() - t0 < 22 && performance.now() - w0 < 30000) { await raf(); for (const m of six) { m.sightRange = 0.01; m.hearRange = 0.01; } if (six.every((m) => (m._drove || 0) >= 5)) break; }
        // the drawing re-plants within half a second of a cut
        const w1 = performance.now(); while (R.draw.version !== R.mask.version && performance.now() - w1 < 3000) await raf();
        const runs = [], ints = [], left = [];
        for (let i = 0; i < (S.mesh ? S.mesh.count : 0); i++) {
          if (!S.used[i] || S.prev[i] < 0 || !six.includes(S.owner[i])) continue;
          const j = S.prev[i], ax = S.px[j], az = S.pz[j], bx = S.px[i], bz = S.pz[i];
          const l = Math.hypot(bx - ax, bz - az); if (l < 0.5) continue;
          const nx = -(bz - az) / l, nz = (bx - ax) / l;
          for (const t of [0.25, 0.5, 0.75]) {
            const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
            if (R.mask.baseAt(x, z) < 0.45) continue;   // only where reed stood
            const q = R.mask.cuts.laneAt(x, z, nx, nz, 1.4); runs.push(q.run); ints.push(q.integral); left.push(R.mask.cover(x, z));
          }
        }
        const st = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? { n: b.length, min: r3(b[0]), median: r3(b[b.length >> 1]), max: r3(b[b.length - 1]) } : { n: 0 }; };
        const inBar = runs.filter((w) => Math.abs(w - 1.0) <= 0.2).length;
        const planted1 = R.draw.planted;
        const res = { line: { x: r3(line.x), z: r3(line.z), bearingDeg: r3(line.bearing * 180 / Math.PI) }, cuts: R.mask.cuts.cuts - cuts0, drove: six.map((m) => m._drove || 0),
          run: st(runs), integral: st(ints), coverLeftInLane: st(left), inBar, of: runs.length, planted: { before: planted0, after: planted1 },
          bar: 'every cross-section where reed stood: a lane 1.0 m +- 0.2; nothing left at the cover line in it; fewer reeds drawn',
          pass: runs.length > 0 && inBar === runs.length && left.every((v) => v < RM.COVER_LINE) && planted1 < planted0 };
        // clear the cuts so F31 is filmed on the uncut mask
        R.mask.cuts.tiles.clear(); R.mask.version++;
        return res;
      });
    }
  } finally {
    walk(false);
    for (const m of made) disposeM(m);
    if (R.mask.version !== R.draw.version) R.draw.plant();
    placeBrea(P0.x, P0.z); p.camYaw = yaw0; p.setCrouch(crouch0);
    E.requestTimeScale('studio', 0);
    out.seconds = { ...(out.seconds || {}), total: r3((performance.now() - out.t0) / 1000) };
  }
  return out;
}
