/**
 * Round 4 gates — lane `world-props-expansion` (docs/ROUND4-AUDIT.md §4).
 *
 * The audit's block for this lane is four ids. Two of them already exist and
 * belong to this same lane's earlier wave, so they are NOT duplicated here:
 *
 *   `A61-colliders-registered`  lives in tools/gates.round4.world-props.mjs.
 *                               Its bar was RAISED there from 800 to 1200 to
 *                               match the expansion block. Raising a bar is
 *                               strengthening; nothing was weakened and no
 *                               other lane's gate was touched.
 *   `V34-midground`             lives in the same file, unchanged. The six new
 *                               places add landmarks to three of its four
 *                               bearings; the bar stays where it was because a
 *                               bar's job is to catch a regression on the
 *                               thinnest bearing, not to record today's best.
 *
 * The new ids are here. All are ACTION gates: they paint a labelled frame for
 * the eye (the runner screenshots every gate) but the verdict is a
 * measurement, because "enclosed, lit, readable" and "reads as a lived-in
 * settlement" are exactly the kind of criteria a build can drift out of while
 * a human still nods at the picture.
 *
 * ...which is exactly what happened, and it is why `V43` grew a HEDGE CLAUSE
 * and why `A98b` exists at all. The first pass of this lane built six places
 * inside world-ground's pine scatter, and `V43` filmed the outpost from its own
 * gate bearing and returned PASS over a frame that was 46 % canopy and 9 %
 * outpost. Every number in the assert was true. The criterion was false. A
 * census of what a place CONTAINS can never catch that on its own, so both
 * gates now also measure what the frame is made OF and whether the ground was
 * really cleared — see the clauses in place.
 *
 *   A98-sites     every new place is registered with a position, a radius and
 *                 at least two interactables, and each of those interactables
 *                 is FIRED and must produce an observable effect.
 *   V42-interior  inside Cauldron KAPPA: a ray hemisphere proves the chamber is
 *                 closed to the sky, the rendered frame proves it is lit and
 *                 that the light has a gradient rather than a flat fill, and
 *                 the three things you came in for project inside the frame and
 *                 are the nearest geometry along their own ray.
 *   V43-outpost   the north-shelf outpost: counted (posts, huts, tower, fire,
 *                 NPC slots, interactables), its palisade proved to stop a
 *                 swept capsule on every non-gate bearing while the gate
 *                 opening passes one, its frame proved to contain built
 *                 structure above the horizon rather than an empty meadow —
 *                 and, since the hedge, proved to contain MORE outpost than
 *                 foliage, down an approach a ray can travel without meeting a
 *                 trunk, into a keepout with no tree left standing in it.
 *   A98b-clearings  all six keepouts, proved cleared on both sides at once:
 *                 nothing drawn inside one, nothing still colliding inside one,
 *                 a capsule walks every ring on six bearings, and the cull is
 *                 not a silent no-op (it reports what it felled, and a skip is
 *                 a FAIL).
 */

/** Shared page-context kit: deterministic render, pixel probes, overlay. */
const KIT = `
  const ctx = __CTX__;
  const engine = ctx.engine;
  const renderer = ctx.renderer;
  const cam = ctx.camera;
  const V = ctx.player.position.constructor;
  const gl = renderer.getContext();
  const W = renderer.domElement.width, H = renderer.domElement.height;

  const draw = (n = 4) => {
    for (let i = 0; i < n; i++) { engine._shadowCullClock = 0; engine.render(0.05); }
  };
  const grab = () => {
    const buf = new Uint8ClampedArray(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return buf;
  };
  const luma = (buf, i) => 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
  /** Mean luma over a rectangle given in GL pixels (origin bottom-left). */
  const meanLuma = (buf, x0, y0, x1, y1) => {
    let s = 0, n = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      s += luma(buf, (y * W + x) * 4); n++;
    }
    return n ? s / n : 0;
  };
  /** Project a world point to GL pixel coords, or null when off-screen. */
  const project = (x, y, z) => {
    const v = new V(x, y, z).project(cam);
    if (!(v.z < 1)) return null;
    const px = Math.round((v.x * 0.5 + 0.5) * W);
    const py = Math.round((v.y * 0.5 + 0.5) * H);
    if (px < 2 || py < 2 || px > W - 3 || py > H - 3) return null;
    return { px, py };
  };
  const shot = (buf, lines) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const t = document.createElement('canvas'); t.width = W; t.height = H;
    t.getContext('2d').putImageData(new ImageData(buf, W, H), 0, 0);
    g.save(); g.scale(1, -1); g.drawImage(t, 0, -H); g.restore();
    g.fillStyle = '#000'; g.globalAlpha = 0.62;
    g.fillRect(0, 0, W, 18 + lines.length * 20);
    g.globalAlpha = 1; g.fillStyle = '#ffe3b0';
    g.font = '15px ui-monospace, monospace';
    for (let i = 0; i < lines.length; i++) g.fillText(lines[i], 10, 24 + i * 20);
    const img = new Image();
    img.src = c.toDataURL('image/png');
    img.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647';
    document.body.appendChild(img);
  };
  const hideHud = () => { const h = document.getElementById('hud'); if (h) h.style.display = 'none'; };
`;

export const GATES = [
  /* ------------------------------------------------------------------ A98 */
  {
    id: 'A98-sites', kind: 'action', lane: 'world-props-expansion',
    title: 'Six new places are published with position/radius/kind and each answers >= 2 interactables',
    settle: 2400, timeout: 90000,
    assert: `(async () => {
      const ctx = __CTX__;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      /**
       * Interacting writes a real save (progression awards XP on most of these
       * entries). A gate must not hand the next thing that runs a half-played
       * game, so snapshot localStorage and put it back.
       */
      const snap = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i); snap.push([k, localStorage.getItem(k)]);
        }
      } catch (err) { /* private mode: nothing to restore */ }

      const props = ctx.props;
      const places = props && props.places;
      const I = ctx.interactables;
      if (!Array.isArray(places) || !I) {
        return { pass: false, detail: { reason: 'ctx.props.places or ctx.interactables missing' } };
      }

      /* ---- 1. the published shape ---- */
      const shapeBad = [];
      for (const p of places) {
        const ok = p && typeof p.id === 'string' && typeof p.name === 'string'
          && typeof p.kind === 'string'
          && p.position && typeof p.position.x === 'number' && typeof p.position.z === 'number'
          && typeof p.radius === 'number' && p.radius > 4
          && Math.hypot(p.x, p.z) < 320;
        if (!ok) shapeBad.push(p && p.id);
      }
      // the same records must also come out of props.sites(), which is what
      // machine-ai and progression actually read
      const siteIds = new Set(props.sites().filter((s) => s.place).map((s) => s.id));
      const missingFromSites = places.filter((p) => !siteIds.has(p.id)).map((p) => p.id);

      /* ---- 2. two live interactables each, registered by place ---- */
      const byPlace = new Map();
      for (const e of I.list) {
        if (!e || !e.place) continue;
        if (!byPlace.has(e.place)) byPlace.set(e.place, []);
        byPlace.get(e.place).push(e);
      }

      /* ---- 3. and they RESPOND: fire two per place, watch the event bus ---- */
      const ev = ctx.events;
      const origEmit = ev.emit.bind(ev);
      let seen = [];
      ev.emit = (t, p) => { seen.push(t); return origEmit(t, p); };
      const perPlace = [];
      let firedOk = 0, firedTotal = 0;
      for (const p of places) {
        const list = byPlace.get(p.id) || [];
        const tried = [];
        for (const entry of list.slice(0, 2)) {
          firedTotal++;
          seen = [];
          let threw = null;
          try { await entry.onInteract(); } catch (err) { threw = String(err && err.message || err); }
          await sleep(60);
          const responded = !threw && seen.length > 0;
          if (responded) firedOk++;
          tried.push({ label: entry.label, events: seen.slice(0, 3), threw });
        }
        perPlace.push({
          id: p.id, name: p.name, kind: p.kind,
          radius: p.radius, xz: [Math.round(p.x), Math.round(p.z)],
          interactables: list.length, labels: list.map((e) => e.label).slice(0, 8),
          fired: tried,
        });
      }
      ev.emit = origEmit;

      try {
        localStorage.clear();
        for (const [k, v] of snap) localStorage.setItem(k, v);
      } catch (err) { /* nothing to restore */ }

      const thin = perPlace.filter((p) => p.interactables < 2).map((p) => p.id);
      const detail = {
        places: places.length, perPlace,
        totalPlaceEntries: [...byPlace.values()].reduce((a, b) => a + b.length, 0),
        shapeBad, missingFromSites, thin,
        firedOk: firedOk + '/' + firedTotal,
        npcSlots: (props.npcSlots || []).length,
        crossings: (props.crossings || []).map((c) => c.id),
        bar: '>= 6 places, each >= 2 interactables, every fired entry raises an event',
      };
      const pass = places.length >= 6
        && shapeBad.length === 0
        && missingFromSites.length === 0
        && thin.length === 0
        && firedTotal >= 12 && firedOk === firedTotal;
      return { pass, detail };
    })()`,
  },

  /* ------------------------------------------------------------------ V42 */
  {
    id: 'V42-interior', kind: 'action', lane: 'world-props-expansion',
    title: 'Inside Cauldron KAPPA: closed to the sky, lit with a gradient, and the three things you came for are visible',
    settle: 2600, timeout: 120000,
    assert: `(() => {
      ${KIT}
      hideHud();
      ctx.environment.setWeather('clear', 0);
      ctx.environment.setTime(11.0);
      if (ctx.settings) ctx.settings.cameraSmoothing = 0;

      const P = ctx.props && ctx.props.placeSystem;
      const IN = P && P.cauldronInterior;
      if (!IN) return { pass: null, detail: { reason: 'ctx.props.placeSystem.cauldronInterior missing' } };
      const deckY = IN.deckY;
      const mouth = IN.mouth;
      const dx = mouth.x - IN.x, dz = mouth.z - IN.z;
      const L = Math.hypot(dx, dz) || 1;
      const ux = dx / L, uz = dz / L;

      /* ---- 1. ENCLOSED: a ray fan from head height must not find the sky ---- */
      /**
       * The heightfield is not a collider and the sky is not geometry, so
       * "did the ray hit something" IS the enclosure test — an unclosed roof
       * lets the ray out to its 60 m limit with no hit. Rays go up and outward
       * over the whole upper hemisphere; the corridor mouth is the one honest
       * hole, so rays inside a 22 deg cone around the corridor axis are
       * excluded and counted separately.
       */
      const ox = IN.x, oy = deckY + 1.7, oz = IN.z;
      let rays = 0, blocked = 0, escaped = 0, viaMouth = 0;
      const esc = [];
      for (let ei = 1; ei <= 6; ei++) {
        const el = (ei / 7) * (Math.PI / 2);          // 12 deg .. 77 deg up
        const n = 24;
        for (let ai = 0; ai < n; ai++) {
          const az = (ai / n) * Math.PI * 2;
          const dxr = Math.cos(el) * Math.sin(az);
          const dzr = Math.cos(el) * Math.cos(az);
          const dyr = Math.sin(el);
          // the corridor mouth is a legitimate opening
          if (dxr * ux + dzr * uz > 0.93 && el < 0.5) { viaMouth++; continue; }
          rays++;
          const h = ctx.collision.raycast(ox, oy, oz, dxr, dyr, dzr, 60);
          if (h && h.hit) blocked++;
          else { escaped++; if (esc.length < 6) esc.push([Math.round(az * 57.3), Math.round(el * 57.3)]); }
        }
      }
      const sealed = rays ? blocked / rays : 0;

      /* ---- 2. the frame: lit, with a gradient, and the props readable ---- */
      const camX = IN.x + ux * 8.0, camZ = IN.z + uz * 8.0;
      ctx.player.position.set(camX, deckY, camZ);
      cam.position.set(camX, deckY + 1.72, camZ);
      cam.lookAt(new V(IN.x - ux * 6, deckY + 2.4, IN.z - uz * 6));
      cam.updateMatrixWorld(true);
      // the lens teleported without a sim frame: recompute draw distances the
      // way the frame loop would, or we render the room as it looked from 190 m
      P.refreshVisibility();
      draw(6);
      const buf = grab();

      // sky pixels: a real hole in the roof is bright AND blue-dominant
      let sky = 0, total = 0;
      for (let y = Math.floor(H * 0.55); y < H; y += 3) {
        for (let x = 0; x < W; x += 3) {
          const i = (y * W + x) * 4;
          total++;
          if (buf[i + 2] > 120 && buf[i + 2] > buf[i] + 22 && luma(buf, i) > 105) sky++;
        }
      }
      const skyPct = total ? (100 * sky / total) : 0;

      const frameLuma = meanLuma(buf, 0, 0, W, H);
      // gradient: the pit half of the frame must be measurably brighter than
      // the outer thirds, or the "lighting" is a flat ambient fill
      const midL = meanLuma(buf, Math.floor(W * 0.36), Math.floor(H * 0.25), Math.floor(W * 0.64), Math.floor(H * 0.62));
      const edgeL = (meanLuma(buf, 0, Math.floor(H * 0.25), Math.floor(W * 0.18), Math.floor(H * 0.62))
        + meanLuma(buf, Math.floor(W * 0.82), Math.floor(H * 0.25), W, Math.floor(H * 0.62))) / 2;
      const gradient = midL - edgeL;

      /* ---- 3. the three things you came in for ---- */
      /**
       * The audit names three things the chamber has to contain: the pour pit,
       * the override terminal and the machine-parts crates. THE CRATES ARE A
       * SET, not a coordinate — there are three of them round the deck, and
       * asking for crate[0] specifically only measures where the RNG happened
       * to drop the first one. Any crate counts; all three missing does not.
       */
      const targets = [
        [{ id: 'smelt-pit', x: IN.x, y: deckY + 0.4, z: IN.z }],
        [{ id: 'override-terminal', x: P.cauldronTerminal.x, y: P.cauldronTerminal.y + 2.5, z: P.cauldronTerminal.z }],
        P.cauldronCrates.map((c, i) => ({ id: 'parts-crate-' + i, x: c.x, y: c.y + 0.5, z: c.z })),
      ];
      const visible = [];
      let seenCount = 0;
      for (const group of targets) {
        let best = null;
        for (const t of group) {
          const p = project(t.x, t.y, t.z);
          if (!p) { if (!best) best = { id: t.id, onScreen: false }; continue; }
          const vx = t.x - cam.position.x, vy = t.y - cam.position.y, vz = t.z - cam.position.z;
          const d = Math.hypot(vx, vy, vz);
          const h = ctx.collision.raycast(cam.position.x, cam.position.y, cam.position.z,
            vx / d, vy / d, vz / d, d + 0.4);
          const clear = !h || !h.hit || h.distance > d - 0.9;
          const rec = { id: t.id, onScreen: true, clear, px: p.px, py: p.py, dist: +d.toFixed(1) };
          if (clear) { best = rec; break; }
          if (!best || best.onScreen === false) best = rec;
        }
        visible.push(best);
        if (best && best.onScreen && best.clear) seenCount++;
      }

      const pass = sealed >= 0.95 && escaped <= 4
        && skyPct < 1.0
        && frameLuma > 24 && frameLuma < 205
        && gradient > 6
        && seenCount === 3;

      shot(buf, [
        'V42 cauldron interior  ' + (pass ? 'PASS' : 'FAIL'),
        'enclosed: ' + blocked + '/' + rays + ' rays blocked (' + (sealed * 100).toFixed(1) + '%)'
          + '  escaped ' + escaped + '  via mouth ' + viaMouth,
        'lit: frame luma ' + frameLuma.toFixed(1) + '  pit ' + midL.toFixed(1)
          + '  walls ' + edgeL.toFixed(1) + '  gradient +' + gradient.toFixed(1)
          + '  sky pixels ' + skyPct.toFixed(2) + '%',
        'readable: ' + seenCount + '/3 of pit / terminal / parts crate unoccluded on screen',
      ]);

      return {
        pass,
        detail: {
          deckY: +deckY.toFixed(2), chamberR: IN.r,
          sealedFraction: +sealed.toFixed(3), rays, blocked, escaped, escapedDirs: esc, viaMouth,
          skyPct: +skyPct.toFixed(3), frameLuma: +frameLuma.toFixed(1),
          pitLuma: +midL.toFixed(1), wallLuma: +edgeL.toFixed(1), gradient: +gradient.toFixed(1),
          visible,
          bar: 'sealed >= 95% & escaped <= 4 & sky < 1% & 24 < luma < 205 & gradient > 6 & 3/3 visible',
        },
      };
    })()`,
  },

  /* ------------------------------------------------------------------ V43 */
  {
    id: 'V43-outpost', kind: 'action', lane: 'world-props-expansion',
    title: 'Ridgeback Outpost reads as a lived-in Nora post: sealed palisade with an open gate, huts, a 15 m watch-post, a fire, NPC slots',
    settle: 2600, timeout: 120000,
    assert: `(() => {
      ${KIT}
      hideHud();
      ctx.environment.setWeather('clear', 0);
      ctx.environment.setTime(10.5);
      if (ctx.settings) ctx.settings.cameraSmoothing = 0;

      const P = ctx.props && ctx.props.placeSystem;
      const rec = ctx.props && ctx.props.places && ctx.props.places.find((p) => p.id === 'outpost-ridgeback');
      if (!P || !rec) return { pass: null, detail: { reason: 'outpost-ridgeback not published' } };
      const X = rec.x, Z = rec.z;
      const C = ctx.collision;

      /* ---- 1. the census ---- */
      const posts = P.palisadePosts || 0;
      const huts = (P.outpostHuts || []).length;
      const tower = P.outpostLookout || null;
      const fire = (P.emitters || []).find((e) => e.id === 'outpost-brazier') || null;
      const slots = (ctx.props.npcSlots || []).filter((s) => s.site === 'outpost-ridgeback');
      const entries = ctx.interactables.list.filter((e) => e && e.place === 'outpost-ridgeback');

      /* ---- 2. the palisade is a WALL: swept capsule on every bearing ---- */
      /**
       * Same probe A61 runs on the hunter camp, because a palisade that a
       * capsule walks through is a fence painted on the grass. The cast follows
       * the GROUND at the wall line — a fixed height taken from the centre
       * sails over the wall where the shelf falls away and would call an open
       * flank sealed.
       */
      const R = 16, GAP_A = -2.36, GAP_W = 0.30;
      // angular distance from the gate bearing, wrapped into (-pi, pi]
      const inGate = (a) => Math.abs(((a - GAP_A + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < GAP_W;
      const probe = (a) => {
        const cx = Math.cos(a), cz = Math.sin(a);
        const gy = ctx.terrain.getHeight(X + cx * R, Z + cz * R);
        const from = new V(X + cx * (R - 3.4), gy + 0.05, Z + cz * (R - 3.4));
        const to = new V(X + cx * (R + 3.4), gy + 0.05, Z + cz * (R + 3.4));
        const hit = C.capsuleCast(from, to, 0.4, 1.7, { filter: (c) => c.kind !== 'tree' && c.kind !== 'rock' && c.kind !== 'canopy' });
        return hit && hit.hit ? +hit.distance.toFixed(2) : null;
      };
      let walled = 0, probes = 0;
      const leaks = [];
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        if (inGate(a)) continue;
        probes++;
        if (probe(a) !== null) walled++;
        else leaks.push(+(a * 180 / Math.PI).toFixed(0));
      }
      const gateOpen = probe(GAP_A) === null;

      /* ---- 3. the frame: built structure above the skyline ---- */
      const camD = 30;
      // stand on the GATE bearing: the approach a player actually walks, and
      // the only one the pine grove around the shelf does not screen
      const cx0 = X + Math.sin(GAP_A) * camD, cz0 = Z + Math.cos(GAP_A) * camD;
      const eye = ctx.terrain.getHeight(cx0, cz0) + 5.0;
      ctx.player.position.set(cx0, ctx.terrain.getHeight(cx0, cz0), cz0);
      cam.position.set(cx0, eye, cz0);
      cam.lookAt(new V(X, rec.y + 4.5, Z));
      cam.updateMatrixWorld(true);
      P.refreshVisibility();
      draw(6);
      const buf = grab();

      /**
       * Structure, measured as a silhouette rather than as an opinion: fire a
       * fan of rays through the upper half of the frame and count the ones
       * whose nearest hit is a mesh belonging to this place. A meadow with a
       * couple of tents in it scores single digits; a palisade with a tower
       * behind it does not.
       */
      const mine = new Set();
      const grp = ctx.scene.getObjectByName('world-places');
      if (grp) grp.traverse((o) => { if (o.isMesh && /places-outpost-/.test(o.name || '')) mine.add(o); });
      let hits = 0, shots = 0, other = 0, foliage = 0;
      const dir = new V();
      for (let cxi = 0; cxi < 61; cxi++) {
        for (let cyi = 0; cyi < 17; cyi++) {
          const ndcX = (cxi / 60) * 2 - 1;
          const ndcY = 0.55 - (cyi / 16) * 0.72;
          dir.set(ndcX, ndcY, 0.5).unproject(cam).sub(cam.position).normalize();
          shots++;
          const h = C.raycast(cam.position.x, cam.position.y, cam.position.z, dir.x, dir.y, dir.z, 120);
          if (!h || !h.hit) continue;
          const node = h.collider && (h.collider.node || h.collider.ref);
          const k = h.collider && h.collider.kind;
          if (node && mine.has(node)) hits++;
          else if (k === 'tree' || k === 'canopy') { foliage++; other++; } else other++;
        }
      }

      /**
       * ---- THE HEDGE CLAUSE -------------------------------------------------
       *
       * Everything above this line passed while the frame was a WALL OF PINE.
       * The first cut of this gate scored 99 outpost rays and called it green;
       * the PNG beside it was 46 % canopy and you could not see a single post.
       * The census was true, the criterion ("reads as a lived-in settlement")
       * was false, and nothing in the assert could tell the difference — which
       * is the whole reason this lane re-opened.
       *
       * Three additions, none of which a hedge can satisfy:
       *
       *   1. THE OUTPOST OUT-READS THE FOREST. Relative, not a magic number, so
       *      it cannot be tuned green: more of the frame must be outpost than
       *      is foliage. At the failing build that was 99 against 477.
       *   2. THE APPROACH IS OPEN. The ray from the lens to the middle of the
       *      post must arrive without hitting a trunk or a canopy on the way —
       *      a player walking in must be able to SEE where she is walking.
       *   3. THE CLEARING IS REAL. Not one tree collider inside the published
       *      ctx.props.keepouts hard radius. This is the assertion that
       *      survives a re-scatter: the day world-ground consumes the keepout
       *      list and clearings.js is deleted, this clause is what proves the
       *      hand-over actually happened.
       */
      const site = (ctx.props.keepouts || []).find((k) => k.id === 'outpost-ridgeback');
      let insideHard = 0;
      if (site && C.colliders) {
        for (const c of C.colliders) {
          if (c.kind !== 'tree') continue;
          const tx = c.type === 'capsule' ? c.ax : c.cx, tz = c.type === 'capsule' ? c.az : c.cz;
          if (Math.hypot(tx - site.x, tz - site.z) < site.hard) insideHard++;
        }
      }
      dir.set(X - cam.position.x, (rec.y + 4.5) - cam.position.y, Z - cam.position.z).normalize();
      const approach = C.raycast(cam.position.x, cam.position.y, cam.position.z,
        dir.x, dir.y, dir.z, camD + 10);
      const approachKind = approach && approach.hit && approach.collider ? approach.collider.kind : 'none';
      const approachClear = approachKind !== 'tree' && approachKind !== 'canopy';

      const towerH = tower ? (tower.y - ctx.terrain.getHeight(tower.x, tower.z)) + 3.9 : 0;
      const pass = posts >= 300 && huts >= 3 && towerH >= 14 && !!fire
        && slots.length >= 3 && entries.length >= 3
        && probes > 0 && walled === probes && gateOpen
        /**
         * BAR 75 of 1037 rays, measured rather than wished for. Kept exactly
         * where it was when it was written — a bar's job is to catch the day
         * the palisade, the huts or the watch-post stop being built, and the
         * clearing raising today's number is not a reason to raise it.
         */
        && hits >= 75
        && foliage < hits && approachClear && !!site && insideHard === 0;

      shot(buf, [
        'V43 Ridgeback Outpost  ' + (pass ? 'PASS' : 'FAIL'),
        'palisade ' + posts + ' posts, sealed ' + walled + '/' + probes
          + ' bearings, gate ' + (gateOpen ? 'OPEN' : 'BLOCKED'),
        huts + ' huts  watch-post ' + towerH.toFixed(1) + ' m  brazier '
          + (fire ? 'lit' : 'NONE') + '  NPC slots ' + slots.length
          + '  interactables ' + entries.length,
        'silhouette: ' + hits + '/' + shots + ' rays on outpost (bar 75), '
          + foliage + ' on foliage (must be < ' + hits + ')',
        'clearing: ' + insideHard + ' trees inside the ' + (site ? site.hard : '?')
          + ' m keepout (bar 0)   approach: ' + approachKind,
      ]);

      return {
        pass,
        detail: {
          posts, huts, towerHeight: +towerH.toFixed(1),
          brazier: !!fire, npcSlots: slots.map((s) => s.id),
          interactables: entries.map((e) => e.label),
          palisadeSealed: walled + '/' + probes, leakBearings: leaks.slice(0, 8),
          gateOpen, outpostRays: hits, rayGrid: shots, otherHits: other,
          foliageRays: foliage, treesInsideKeepout: insideHard,
          keepout: site ? site.hard : null, approachKind,
          bar: 'posts >= 300, huts >= 3, tower >= 14 m, fire, 3 NPC slots, 3 interactables, sealed, gate open, >= 75 silhouette rays, foliage < outpost, approach clear, 0 trees in the keepout',
        },
      };
    })()`,
  },

  /* ----------------------------------------------------------------- A98b */
  /**
   * The clearings, gated once for all six places.
   *
   * `V43` proves the outpost's ground; this proves the other five and, more
   * importantly, proves the three ways a clearing can be a LIE:
   *
   *   - drawn but not walkable — the instance is gone and the collider is not,
   *     so you bounce off an invisible pine in an empty ring;
   *   - walkable but not drawn — the collider is gone and the instance is not,
   *     so a machine shoots you through a tree it cannot see;
   *   - neither, silently — the shim feature-detects `world-ground`'s internals
   *     and is written to no-op rather than crash if they move, so "it did
   *     nothing" has to be a FAIL here or the no-op is invisible. The first cut
   *     of `clearings.js` ran a frame too early, reported
   *     `skipped: ['no-vegetation']`, culled nothing at all, and every gate in
   *     this file stayed green.
   *
   * The frame is the trial ground, which was the worst of the six: 69 trees
   * inside its 28 m radius, 24 of them inside 15 m.
   */
  {
    id: 'A98b-clearings', kind: 'action', lane: 'world-props-expansion',
    title: 'Every published keepout is really cleared — nothing drawn inside it, nothing left colliding in it, and the cull is not a silent no-op',
    settle: 2600, timeout: 90000,
    assert: `(() => {
      ${KIT}
      hideHud();
      ctx.environment.setWeather('clear', 0);
      ctx.environment.setTime(10.0);

      const keep = ctx.props && ctx.props.keepouts;
      const rep = ctx.props && ctx.props.clearingReport;
      if (!Array.isArray(keep) || !keep.length) {
        return { pass: false, detail: { reason: 'ctx.props.keepouts not published' } };
      }
      const C = ctx.collision;
      const inHard = (x, z) => {
        for (let i = 0; i < keep.length; i++) {
          const k = keep[i];
          const dx = x - k.x, dz = z - k.z;
          if (dx * dx + dz * dz < k.hard * k.hard) return k.id;
        }
        return null;
      };

      /* ---- 1. nothing DRAWN inside a clearing --------------------------- *
       * Read the render truth, not the source list: every live instance of
       * every tree LOD and of the hidden collision proxy, straight out of the
       * instance matrices up to their live count. */
      const drawn = {};
      const M = new (cam.matrixWorld.constructor)();   // THREE.Matrix4, no import
      let scanned = 0;
      ctx.scene.traverse((o) => {
        if (!o.isInstancedMesh || !o.count) return;
        if (!/^(tree-|pines-)/.test(o.name || '')) return;
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, M);
          scanned++;
          const id = inHard(M.elements[12], M.elements[14]);
          if (id) drawn[id] = (drawn[id] ?? 0) + 1;
        }
      });

      /* ---- 2. nothing COLLIDING inside a clearing ----------------------- *
       * Every scatter kind the cull touches, not just the trees. The first cut
       * of this clause checked tree/canopy only and passed while 78 boulders
       * kept their colliders after their instances were compacted away —
       * A61's own instance-vs-collider census is what caught it. An invisible
       * rock you bounce off in a cleared ring is the same bug as an invisible
       * pine; the gate now has to see both. */
      const ghosts = {}, ghostKinds = {};
      for (const c of C.colliders) {
        if (c.kind !== 'tree' && c.kind !== 'canopy' && c.kind !== 'rock') continue;
        const x = c.type === 'capsule' ? c.ax
          : c.type === 'mesh' ? (c.mat ? c.mat.elements[12] : (c.minx + c.maxx) / 2) : c.cx;
        const z = c.type === 'capsule' ? c.az
          : c.type === 'mesh' ? (c.mat ? c.mat.elements[14] : (c.minz + c.maxz) / 2) : c.cz;
        const id = inHard(x, z);
        if (id) {
          ghosts[id] = (ghosts[id] ?? 0) + 1;
          ghostKinds[c.kind] = (ghostKinds[c.kind] ?? 0) + 1;
        }
      }

      /* ---- 3. and a capsule can actually walk the middle of each ring --- */
      const blocked = [];
      for (const k of keep) {
        for (let a = 0; a < 6; a++) {
          const ang = (a / 6) * Math.PI * 2;
          const r = k.hard * 0.62;
          const fx = k.x + Math.cos(ang) * r, fz = k.z + Math.sin(ang) * r;
          const tx = k.x - Math.cos(ang) * r, tz = k.z - Math.sin(ang) * r;
          const gy = ctx.terrain.getHeight(fx, fz);
          const hit = C.capsuleCast(new V(fx, gy + 0.1, fz), new V(tx, ctx.terrain.getHeight(tx, tz) + 0.1, tz),
            0.4, 1.7, { filter: (c) => c.kind === 'tree' });
          if (hit && hit.hit) blocked.push(k.id + '@' + Math.round(ang * 180 / Math.PI));
        }
      }

      /* ---- 4. the cull is not a silent no-op ---------------------------- */
      const culled = rep ? (rep.trees | 0) : 0;
      const handedBack = rep ? (rep.colliders | 0) : 0;
      const skipped = rep && rep.skipped ? rep.skipped : ['no-report'];

      /* ---- the frame: the trial ground, the worst of the six ------------ */
      const arena = keep.find((k) => k.id === 'hunting-arena') || keep[0];
      const eye = ctx.terrain.getHeight(arena.x, arena.z) + 26;
      cam.position.set(arena.x + 4, eye, arena.z + 44);
      cam.lookAt(new V(arena.x, ctx.terrain.getHeight(arena.x, arena.z) + 4, arena.z));
      cam.updateMatrixWorld(true);
      const P = ctx.props.placeSystem; if (P) P.refreshVisibility();
      draw(6);
      const buf = grab();

      const drawnTotal = Object.values(drawn).reduce((a, b) => a + b, 0);
      const ghostTotal = Object.values(ghosts).reduce((a, b) => a + b, 0);
      const pass = keep.length >= 6
        && keep.every((k) => k.hard > 0 && k.soft >= k.hard && k.grass > 0)
        && drawnTotal === 0 && ghostTotal === 0 && blocked.length === 0
        && culled > 0 && handedBack >= culled && skipped.length === 0;

      shot(buf, [
        'A98b clearings  ' + (pass ? 'PASS' : 'FAIL'),
        keep.length + ' keepouts published; cull felled ' + culled
          + ' trees and handed back ' + handedBack + ' colliders'
          + (skipped.length ? '  SKIPPED: ' + skipped.join(',') : ''),
        'drawn inside a clearing: ' + drawnTotal + ' of ' + scanned
          + ' instances (bar 0)   still colliding: ' + ghostTotal + ' (bar 0)',
        'capsule walks all 6 rings on 6 bearings: '
          + (blocked.length ? 'BLOCKED ' + blocked.slice(0, 4).join(' ') : 'clear'),
      ]);

      return {
        pass,
        detail: {
          keepouts: keep.map((k) => k.id + ':' + k.hard + '/' + k.soft + '/' + k.grass),
          instancesScanned: scanned, drawnInside: drawn, collidingInside: ghosts, ghostKinds,
          blockedSweeps: blocked, culledTrees: culled, collidersHandedBack: handedBack,
          bushes: rep && rep.bushes, flowers: rep && rep.flowers, rocks: rep && rep.rocks,
          grassDecorated: rep && rep.grassDecorated, skipped,
          bar: '>= 6 keepouts, 0 drawn inside, 0 colliding inside, 0 blocked sweeps, culled > 0, colliders >= trees, nothing skipped',
        },
      };
    })()`,
  },
];
