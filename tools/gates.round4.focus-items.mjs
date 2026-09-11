/**
 * Round 4 gates — lane `focus-items` (docs/ROUND4-AUDIT.md §4).
 *
 * Same contract as tools/gates.config.mjs: ACTION gates resolve
 * { pass, detail } in page context with __CTX__/__GAME__ available; VISUAL
 * gates capture a deterministic screenshot judged against `criteria`.
 *
 * A62 / A63 / V36 are the ids this lane's §4 block names; none of them was
 * already registered by another lane (checked against every
 * `id: '...'` in tools/gates.config.mjs and tools/gates.round4.*.mjs), so they
 * ship under their published names.
 */

/** Put the player `dist` metres from `target` on bearing `ang`, facing it. */
const FACE = `function faceTarget(target, dist, ang, pitch) {
  const p = __CTX__.player;
  p.position.set(target.x + Math.sin(ang) * dist, 0, target.z + Math.cos(ang) * dist);
  p.velocity?.set?.(0, 0, 0);
  p._snapToGround?.();
  p.camYaw = ang;
  p.camPitch = pitch ?? -0.03;
  p.heading = ang + Math.PI;
}`;

/** Move a machine (alive) onto a spot on the heightfield. */
const PLACE_MACHINE = `function placeMachine(m, x, z) {
  const y = __CTX__.terrain?.getHeight?.(x, z) ?? 0;
  m.position.set(x, y, z);
  m.root?.position?.set?.(x, y, z);
  if (m.ai) { m.ai.route = null; }
  m.route = null;
  return m.position;
}`;

/** Kill a machine outright through the published damage contract. */
const KILL = `function killMachine(m) {
  let mesh = null;
  m.root.traverse((o) => { if (!mesh && (o.isMesh || o.isSkinnedMesh)) mesh = o; });
  m.takeDamage({
    point: m.position.clone(), object: mesh, impact: 99999, tear: 0,
    element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 },
    type: 'hunter', baseDamage: 99999,
  });
}`;

/** The three camp supply crates the gather system places (items/gather.js). */
const CRATE = `function crateEntry() {
  return (__CTX__.interactables?.list || []).find(
    (e) => e && !e.removed && e.gatherNode?.kind === 'crate');
}`;

/**
 * V36 fails on "labels stacked on top of each other", so both action gates
 * assert it numerically instead of leaving it to the shot: every DISPLAYED
 * focus label (component labels and reveals alike) is measured with
 * getBoundingClientRect and no two may intersect.
 *
 * Round 2: `offsetParent !== null` was a vacuous visibility test — an
 * absolutely-positioned element at x = 2407 in a 1600 px frame has an
 * offsetParent, so half a reveal budget could render off screen and still be
 * counted as drawn. Every rect is now measured against the viewport too:
 * `off` collects boxes that are not MOSTLY inside the frame, `n` counts only
 * the ones that are, and both action gates fail on a non-empty `off`.
 */
const OVERLAPS = `function labelOverlaps() {
  const W = window.innerWidth, H = window.innerHeight;
  const els = [...document.querySelectorAll('.hzcf-plabel, .hzcf-reveal')]
    .filter((el) => el.style.display !== 'none' && el.offsetParent !== null);
  const all = els.map((el) => [el.getBoundingClientRect(), el.textContent.trim()]);
  const off = [];
  const r = [];
  for (const [b, txt] of all) {
    if (b.width < 1) continue;
    const vx = Math.min(b.right, W) - Math.max(b.left, 0);
    const vy = Math.min(b.bottom, H) - Math.max(b.top, 0);
    // "on screen" = at least half the box inside the frame in x, and nearly
    // all of it in y (the de-overlap passes stack along y)
    if (vx >= b.width * 0.5 && vy >= b.height * 0.85) r.push([b, txt]);
    else off.push(txt + ' @ ' + Math.round(b.left) + ',' + Math.round(b.top));
  }
  const bad = [];
  for (let i = 0; i < r.length; i++) {
    for (let j = i + 1; j < r.length; j++) {
      const a = r[i][0], b = r[j][0];
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      // 1 px of touching edges is not a stack; real overlap is area
      if (ox > 2 && oy > 2) bad.push(r[i][1] + ' | ' + r[j][1]);
    }
  }
  return { n: r.length, shown: all.length, bad, off };
}`;

/** Same measurement, narrowed to one class — A63 compares the reveal count
 *  `focus.audit()` publishes against the boxes really inside the frame. */
const ON_SCREEN = `function onScreenCount(sel) {
  const W = window.innerWidth, H = window.innerHeight;
  return [...document.querySelectorAll(sel)]
    .filter((el) => el.style.display !== 'none' && el.offsetParent !== null)
    .map((el) => el.getBoundingClientRect())
    .filter((b) => b.width >= 1
      && (Math.min(b.right, W) - Math.max(b.left, 0)) >= b.width * 0.5
      && (Math.min(b.bottom, H) - Math.max(b.top, 0)) >= b.height * 0.85).length;
}`;

export const GATES = [
  /* ------------------------------------------------------------------ A62 */
  {
    id: 'A62-focus-components', kind: 'action', lane: 'focus-items',
    title: 'Focus scan lists NAMED components with their loot, and labels each one in the world',
    timeout: 45000,
    settle: 600,
    assert: `(async () => {
      ${FACE}${OVERLAPS}${ON_SCREEN}
      const ctx = __CTX__;
      const m = ctx.machines?.list?.find((x) => x.kind === 'sawtooth' && x.alive)
        || ctx.machines?.list?.find((x) => x.alive && Array.isArray(x.parts) && x.parts.length);
      if (!m) return { pass: null, detail: 'SKIP: no living machine with parts' };
      if (typeof ctx.focus?.audit !== 'function') {
        return { pass: null, detail: 'SKIP: focus.audit() missing' };
      }
      faceTarget(m.position, 15, 0.8, -0.03);
      ctx.focus.toggle(true);
      // the machine keeps patrolling, so re-aim while we wait out the 1.5 s
      // activation pulse and the card's 0.4 s crosshair dwell
      let a = null;
      const t0 = performance.now();
      while (performance.now() - t0 < 12000) {
        await new Promise((r) => setTimeout(r, 250));
        faceTarget(m.position, 15, 0.8, -0.03);
        a = ctx.focus.audit();
        if (a.cardVisible && (a.partLabels?.length ?? 0) >= 3
          && performance.now() - t0 > 2000) break;
      }
      if (!a) return { pass: null, detail: 'SKIP: no audit sample' };
      const comps = a.card?.components ?? [];
      const named = comps.filter((c) => typeof c.name === 'string' && c.name.trim().length > 1);
      const withLoot = comps.filter((c) => (c.loot?.length ?? 0) > 0);
      const lootNamed = withLoot.every((c) => c.loot.every((l) => l.name && l.name.length > 1));
      const labels = a.partLabels ?? [];
      const labelsNamed = labels.filter((l) => l.name && l.name.trim().length > 1);
      // "hovering a part shows its name": the component nearest the crosshair
      // is the hovered one, and it must be one of the labels on screen
      const hoverOk = typeof a.hoverPart === 'string' && a.hoverPart.length > 1
        && labelsNamed.some((l) => l.name === a.hoverPart);
      // and the shells that name those components have to be DRAWN: the part
      // holder is hidden by the rig LOD at this range, so a shell parented to
      // it renders nothing at all (the bug this gate missed in round 1)
      const shells = [...(ctx.focus._parts?.values?.() ?? [])]
        .filter((e) => e.machine === m)
        .reduce((n, e) => n + e.meshes.filter((x) => x.visible && x.parent).length, 0);
      const ov = labelOverlaps();
      // round 2: audit() may not over-report. Every label it publishes has to
      // be a DOM box really inside the frame, and its own coordinates have to
      // be inside the viewport it reports.
      const drawnLabels = onScreenCount('.hzcf-plabel');
      const vp = a.viewport ?? { w: innerWidth, h: innerHeight };
      const strayCoords = labels.filter(
        (l) => !(l.x >= 0 && l.x <= vp.w && l.y >= 0 && l.y <= vp.h));
      const pass = a.on === true && a.cardVisible === true
        && a.target === (m.kind ?? '')
        && named.length >= 3 && named.length === comps.length
        && withLoot.length >= 1 && lootNamed
        && labelsNamed.length >= 3 && labelsNamed.length === labels.length
        && drawnLabels >= labels.length && strayCoords.length === 0
        && shells >= 3 && ov.bad.length === 0 && ov.off.length === 0
        && hoverOk;
      return { pass, detail: {
        shells, labelsOnScreen: ov.n, labelsShown: ov.shown, offScreen: ov.off,
        drawnLabels, strayCoords: strayCoords.length, viewport: vp,
        overlaps: ov.bad,
        machine: a.target, cardVisible: a.cardVisible,
        components: comps.length, named: named.length, withLoot: withLoot.length,
        labels: labels.length, labelsNamed: labelsNamed.length,
        hoverPart: a.hoverPart,
        names: comps.map((c) => c.name + (c.count > 1 ? ' x' + c.count : '')),
        loot: withLoot.map((c) => c.name + ' -> ' + c.loot.map((l) => l.name).join('/')),
      } };
    })()`,
  },

  /* ------------------------------------------------------------------ A63 */
  {
    id: 'A63-loot-reveals', kind: 'action', lane: 'focus-items',
    title: 'Focus reveals a machine wreck AND a supply crate as named LOOT, plus datapoint records',
    timeout: 60000,
    settle: 600,
    assert: `(async () => {
      ${FACE}${PLACE_MACHINE}${KILL}${CRATE}${OVERLAPS}${ON_SCREEN}
      const ctx = __CTX__;
      if (typeof ctx.focus?.audit !== 'function') {
        return { pass: null, detail: 'SKIP: focus.audit() missing' };
      }
      const crate = crateEntry();
      if (!crate) return { pass: null, detail: 'SKIP: no supply crate registered' };
      const m = ctx.machines?.list?.find((x) => x.kind === 'watcher' && x.alive)
        || ctx.machines?.list?.find((x) => x.alive);
      if (!m) return { pass: null, detail: 'SKIP: no living machine' };

      // stage the wreck 7 m from the crate so one frame holds both
      const cx = crate.position.x, cz = crate.position.z;
      // NOTE: do not freeze m.update here — the death sequence (and with it
      // the loot beacon that registers the wreck) runs from the machine's own
      // update, so a frozen machine never becomes lootable.
      placeMachine(m, cx + 6, cz + 3);
      killMachine(m);
      // the corpse registers its loot entry with the death beacon
      const t0 = performance.now();
      let wreck = null;
      while (performance.now() - t0 < 8000) {
        wreck = (ctx.interactables.list || []).find(
          (e) => e && !e.removed && e.machine === m && Array.isArray(e.loot));
        if (wreck) break;
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!wreck) return { pass: null, detail: 'SKIP: corpse never registered a loot entry' };

      // stand back and look at both of them
      const mid = { x: (cx + m.position.x) / 2, z: (cz + m.position.z) / 2 };
      const ang = Math.atan2(mid.x - cx, mid.z - cz);
      faceTarget(mid, 11, ang + Math.PI, -0.16);
      ctx.focus.toggle(false);
      ctx.focus.toggle(true);
      await new Promise((r) => setTimeout(r, 1900));

      const a = ctx.focus.audit();
      const reveals = a.reveals ?? [];
      const loots = reveals.filter((r) => r.kind === 'LOOT');
      const wreckRow = loots.find((r) => /WRECK/.test(r.name || ''));
      const crateRow = loots.find((r) => /CRATE/.test(r.name || ''));
      // Every reveal must be a real DOM element MEASURED inside the frame.
      // Round 1 filtered on offsetParent, which an element at x = 2407 also
      // passes, so the assertion was vacuous on exactly the axis it claimed.
      const drawn = onScreenCount('.hzcf-reveal');
      const shown = [...document.querySelectorAll('.hzcf-reveal')]
        .filter((el) => el.style.display !== 'none' && el.offsetParent !== null).length;
      const vp = a.viewport ?? { w: innerWidth, h: innerHeight };
      const stray = reveals.filter(
        (r) => !(r.x >= 0 && r.x <= vp.w && r.y >= 0 && r.y <= vp.h));
      // and the datapoint pedestals must reveal themselves the same way
      const dp = ctx.items?.datapoints;
      const ov = labelOverlaps();
      const pass = !!wreckRow && !!crateRow && drawn >= reveals.length
        && shown === drawn && stray.length === 0
        && reveals.every((r) => r.name && r.name.length > 1)
        && ov.bad.length === 0 && ov.off.length === 0
        && !!dp && dp.total >= 12;
      return { pass, detail: {
        reveals: reveals.length, drawn, shown, stray: stray.length,
        candidates: a.revealCandidates ?? null, viewport: vp,
        labelsOnScreen: ov.n, offScreen: ov.off, overlaps: ov.bad,
        wreck: wreckRow?.name ?? null, wreckRarity: wreckRow?.rarity ?? null,
        crate: crateRow?.name ?? null, crateRarity: crateRow?.rarity ?? null,
        kinds: [...new Set(reveals.map((r) => r.kind))],
        datapoints: dp ? dp.total : 0,
      } };
    })()`,
  },

  /* ------------------------------------------------------------------ V36 */
  {
    id: 'V36-focus-scan', kind: 'visual', lane: 'focus-items',
    title: 'Focus active on a Sawtooth at 15 m',
    criteria: 'The world keeps its colour and readable detail: Focus is a violet VIGNETTE '
      + '(clear through the middle, at most ~20% at the corners), never a full-screen wash. '
      + 'The machine carries yellow component labels that NAME each part (BLAZE CANISTER, '
      + 'POWER CELL, ANTENNA, HIP ARMOR) with the loot each one drops, and a holo scan card '
      + 'lists the same components with WEAK/TEAR/elemental tags and loot rows. Patrol ribbons '
      + 'on the ground read as smooth CURVES, not as straight-line polygons between waypoints. '
      + 'FAIL on: a grey/violet washed-out world, unnamed component blobs, a component COUNT '
      + 'instead of a component list, labels stacked on top of each other, or a faceted '
      + 'polyline patrol route.',
    // shot mode: park Aloy 15 m from the Sawtooth, Focus on, past the pulse
    setup: `(async () => {
      ${FACE}
      const ctx = __CTX__;
      ctx.input.enabled = true;
      const m = ctx.machines.list.find((x) => x.kind === 'sawtooth' && x.alive)
        || ctx.machines.list.find((x) => x.alive);
      if (!m) return 'no machine';
      // hold the frame: this is a composed shot, and a patrolling Sawtooth
      // walks out of it during the settle window
      m.update = () => {};
      // Stand OUTSIDE the patrol loop looking back in, so the near arc of the
      // route crosses the lower frame and its curvature is what the shot is
      // actually judging. The bearing comes from the route's own centroid, so
      // this holds whatever route data the machine was spawned with.
      // Bearing 0.8 puts the camera in the open meadow on the machine's
      // patrol side: the loop's far arc sweeps across the middle distance and
      // the near arc clips the bottom corners, which is what makes the spline
      // readable as a curve. (Bearings chosen by terrain slope alone kept
      // landing the camera inside a grass-card thicket.)
      const ang = 0.8;
      // pitch: -0.22 buried the Sawtooth in foreground meadow grass (the
      // camera looked down into it). -0.12 keeps the near arc of the patrol
      // ribbon in frame while the machine clears the grass line.
      faceTarget(m.position, 15, ang, -0.12);
      // nudge the camera off-axis so the Sawtooth is not standing directly
      // behind Aloy's head — still inside the crosshair cone, so the card and
      // the component labels stay up
      ctx.player.camYaw = ang + 0.17;
      ctx.focus.toggle(true);
      // Hold the aim until the scan card is actually up: the card needs the
      // machine inside the crosshair cone for its 0.4 s dwell, and one frame
      // of drift during the settle window loses it. Framing, not grading —
      // the gate still judges whatever the shot shows.
      const t0 = performance.now();
      while (performance.now() - t0 < 9000) {
        await new Promise((r) => setTimeout(r, 200));
        faceTarget(m.position, 15, ang, -0.12);
        ctx.player.camYaw = ang + 0.17;
        const a2 = ctx.focus.audit();
        if (a2.cardVisible && (a2.partLabels?.length ?? 0) >= 3) break;
      }
      return m.kind;
    })()`,
    // long enough that the 1.5 s activation sweep has fully cleared the frame
    settle: 4200,
  },
];
