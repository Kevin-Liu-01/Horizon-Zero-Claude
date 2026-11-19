/**
 * M2 wave 3 (area B) — the Holds people's live measurements, the page half (the Node twin is holds-routines.test.mjs). Run by
 *   node tools/frames/film.mjs --port <p> --only F36 --probe /tools/build/recipes/npc/holds-probe-page.mjs
 * after F36 is staged and screenshotted; every other frame is skipped.
 *
 *   stream   the cast streamed in as play does (HoldsPeople forced on in the film): the time until all eight stand, and every
 *            animation frame's interval while they come in (NW11: no frame over 50 ms)
 *   grid     the people's walk grid over Ninewalls built on the LIVE ground (terrain.getHeight) and the live collision world:
 *            its build time, cells, colliders
 *   log      two in-game hours from 10:00 stepped through the people system at 1/30 s (the environment's clock rate), each person
 *            held at tier 1 so the pose is evaluated: activity changes, the longest still run outside a work clip, samples with
 *            no clip or in the bind pose (both upper arms level and out to the sides), walking samples inside a static blocking
 *            collider of the live world, and every leg of every route marched at 0.1 m against it (a 0.25 m capsule)
 *   talk     Oro's dialogue staging: a card naming him put on the presenter for 3 s: held, turned to her, in his talk clip; then
 *            the card off: his loop goes on
 * Everything is undone after (the cast despawned, the routines' and the stream's force off, the card restored).
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const D2R = Math.PI / 180;

export async function probe(frame) {
  if (frame?.id !== 'F36') return { skipped: 'measured on F36 only' };
  const C = window.__CTX__, PS = C.people, env = C.environment, SG = C.systemsGame;
  const H = PS?.holds;
  if (!H) return { error: 'no Holds people in this build' };
  const R = H.routines;
  const out = {};
  const undo = [];
  const { WORK_CLIPS, bareClip } = await import('/src/world/npc/people/routines.js');
  const { HOLDS_CAST } = await import('/src/world/npc/people/holds.js');
  try {
    /* ---- the grid on the live world ---- */
    const g0 = performance.now();
    const G = R.grid();
    out.grid = G ? { buildMs: +(performance.now() - g0).toFixed(1), ...G.audit() } : { error: 'no grid: ' + JSON.stringify({ nav: !!C.nav?.addWalkGrid, colliders: C.settlements?.ninewalls?.stats?.colliders }) };
    /* ---- the stream, on rAF ---- */
    // the frame's own five (F36's staging) are not the cast's
    H.force = true; R.force = true;
    undo.push(() => { H.force = false; R.force = false; H._despawnAll(); });
    const intervals = [];
    let last = performance.now(), streaming = true;
    const tick = () => { const now = performance.now(); intervals.push(now - last); last = now; if (streaming) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const s0 = performance.now();
    let lastT = performance.now();
    while (performance.now() - s0 < 30000 && H.persons.size < HOLDS_CAST.length) {
      const now = performance.now();
      H.update(Math.min(0.1, (now - lastT) / 1000));
      lastT = now;
      await new Promise((r) => requestAnimationFrame(r));
    }
    streaming = false;
    await sleep(50);
    const iv = intervals.slice(1);
    out.stream = { castStanding: H.persons.size, of: HOLDS_CAST.length, secondsToAll: +((performance.now() - s0) / 1000).toFixed(2), frames: iv.length,
      over33: iv.filter((x) => x > 33.4).length, over50: iv.filter((x) => x > 50).length, worstMs: +Math.max(0, ...iv).toFixed(1), state: H.state, failed: H.stats.failed };
    if (H.persons.size < HOLDS_CAST.length) return { ...out, error: 'the cast did not all stand' };

    /* ---- the routine log: two game hours from 10:00 ---- */
    const allRoutes = [], route0 = R.route;
    R.route = function (e, from, step) { const path = route0.call(this, e, from, step); allRoutes.push(this.routes[this.routes.length - 1]); return path; };
    undo.push(() => { R.route = route0; });
    let h = 10.0;
    const hour0 = R.hourOf; R.hourOf = () => h; undo.push(() => { R.hourOf = hour0; });
    const tracked = R.list.map((e) => ({ id: e.id, e, person: e.person }));
    for (const t of tracked) { PS.tierAt(t.person, 1); undo.push(() => PS.tierAt(t.person, null)); }
    const V = (await import('/tools/look/three.mjs')).Vector3;
    const up = new V(), lo = new V();
    const Cl = C.collision, T = C.terrain;
    const inside = (x, z, r) => { const res = Cl.resolveCapsule({ x, y: T.getHeight(x, z), z }, r, 1.6, { passes: 1, filter: (c) => c.blocking && !c.dynamic && c.kind !== 'npc' }); return res?.hit ? res.collider : null; };
    const logs = tracked.map((t) => ({ id: t.id, acts: [], lastAct: null, changes: 0, still: 0, maxStill: 0, anchor: null, noClip: 0, tpose: 0, insideWalking: 0, samples: 0 }));
    const dt = 1 / 30;
    let simT = 0, nextSample = 0;
    const l0 = performance.now();
    while (h < 12.0) {
      h += env.clockRate(h) * dt;
      simT += dt;
      PS.update(dt, simT);
      if (simT >= nextSample) {
        nextSample += 0.25;
        tracked.forEach((Tk, k) => {
          const L = logs[k], p = Tk.person, g = p.group.position, e = Tk.e;
          L.samples++;
          const clip = bareClip(p.current?.getClip().name) || null;
          if (!clip) L.noClip++;
          let level = 0;
          const sx = Math.cos(p.yaw), sz = -Math.sin(p.yaw);
          for (const nm of ['upperarm_l', 'upperarm_r']) {
            const ua = p.bones[nm], la = p.bones[nm.replace('upper', 'lower')];
            if (!ua || !la) continue;
            ua.getWorldPosition(up); la.getWorldPosition(lo); lo.sub(up);
            const Ln = lo.length() || 1;
            const el = Math.asin(Math.max(-1, Math.min(1, lo.y / Ln))) / D2R;
            if (Math.abs(el) < 15 && Math.abs((lo.x * sx + lo.z * sz) / Ln) > 0.85) level++;
          }
          if (level === 2) L.tpose++;
          if (e.act !== 'walk' && e.act !== L.lastAct) { if (L.lastAct && L.lastAct !== 'start') L.changes++; L.lastAct = e.act; L.acts.push(e.act); }
          const working = clip && WORK_CLIPS.has(clip);
          if (!L.anchor || Math.hypot(g.x - L.anchor.x, g.z - L.anchor.z) > 0.25 || working) { L.anchor = { x: g.x, z: g.z }; L.still = 0; }
          else { L.still += 0.25; L.maxStill = Math.max(L.maxStill, L.still); }
          if (e.act === 'walk' && inside(g.x, g.z, 0.2)) L.insideWalking++;
        });
      }
    }
    // every leg of every route against the live collision world
    const legsBad = [];
    let legs = 0;
    for (const rec of allRoutes) {
      for (let i = 0; i + 1 < rec.pts.length; i++) {
        legs++;
        const a = rec.pts[i], b = rec.pts[i + 1], Ln = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(Ln / 0.1));
        for (let k = 0; k <= n; k++) {
          const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n, c = inside(x, z, 0.25);
          if (c) { legsBad.push(`${rec.id} -> ${rec.act} leg ${i}: ${c.kind} at ${x.toFixed(2)}, ${z.toFixed(2)}`); break; }
        }
      }
    }
    out.log = { hours: '10-12', simS: +simT.toFixed(0), wallS: +((performance.now() - l0) / 1000).toFixed(1), routes: allRoutes.length, legs, legsThroughCollision: legsBad.length, legsBad: legsBad.slice(0, 6),
      navMiss: R.list.reduce((s, e) => s + (e.navMiss || 0), 0), stuck: R.list.reduce((s, e) => s + (e.stuck || 0), 0), offGrid: allRoutes.filter((r) => !r.grid).length,
      rows: logs.map((L) => ({ id: L.id, changes: L.changes, maxStillS: +L.maxStill.toFixed(1), noClip: L.noClip, tpose: L.tpose, insideWalking: L.insideWalking, samples: L.samples, acts: L.acts.join(' ') })) };

    /* ---- Oro's dialogue staging ---- */
    const oro = H.person('oro');
    if (oro && SG?.present) {
      const P = SG.present, card0 = P.card;
      undo.push(() => { P.card = card0; });
      const pl = C.player.position;
      // she stands 3 m in front of the anvil spot, toward the tree
      const a = oro.group.position;
      const before = { act: R.list.find((e) => e.person === oro)?.act, yawDeg: +(oro.yaw / D2R).toFixed(1) };
      const pos0 = pl.clone(); undo.push(() => pl.copy(pos0));
      pl.set(a.x - 2.2, pl.y, a.z + 2.0);
      P.card = { who: 'oro', cast: ['oro', 'brea'], text: '...' };
      for (let i = 0; i < 90; i++) PS.update(dt, simT += dt);
      const want = Math.atan2(pl.x - a.x, pl.z - a.z);
      let dy = (oro.yaw - want) / D2R; while (dy > 180) dy -= 360; while (dy < -180) dy += 360;
      const held = { talkHeld: !!oro._talkHeld, clip: bareClip(oro.current?.getClip().name), yawOffHerDeg: +Math.abs(dy).toFixed(1), walking: !!oro.walking, face: !!PS.faces.faceOf('oro') };
      P.card = card0;
      for (let i = 0; i < 60; i++) PS.update(dt, simT += dt);
      const e = R.list.find((q) => q.person === oro);
      out.talk = { before, held, after: { talkHeld: !!oro._talkHeld, act: e?.act, phase: e?.phase } };
    } else out.talk = { error: oro ? 'no presenter' : 'no Oro' };
    return out;
  } catch (err) {
    return { ...out, error: String(err?.stack || err).slice(0, 600) };
  } finally {
    for (const f of undo.reverse()) { try { f(); } catch (e) { /* */ } }
  }
}
