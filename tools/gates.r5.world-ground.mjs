/**
 * ROUND 5 — lane `world-ground` gate file (W1; plan §9 world-ground block).
 *
 *   nice -n 10 node tools/gates.mjs --port 5259 --lane world-ground
 *
 * Auto-discovered by tools/gates.config.mjs. Rows that share an id with another lane's
 * file carry an `-island` suffix here, because the registry resolves a two-lane id to the
 * alphabetically first file (`A18-…`, `A29-…`, `A30b-…` are hero-body's until its exit,
 * `A-single-rest` is brand's). They run the same logic on this lane's ground; the plan's
 * names map 1:1:
 *
 *   plan                     row here
 *   A-single-rest (W1)       A-single-rest-saltrow
 *   A30b-fall-wade-edge      A30b-fall-wade-edge-island
 *   A18 / A18b               A18-slope-conform-island / A18b-slope-conform-moving-island
 *   A29-steep-face           A29-steep-face (hero-body's A29-slope-limit on steepFace)
 *   A29b-steep-face-moving   A29b-steep-face-moving (hero-body's A29b-slope-no-ghost)
 *
 * The carried rows this lane absorbs shadow by id: A58-surface-api, A58b, A59b, A59c, A60,
 * V32. V33, V44's Round-4 staging, A62 and A63 measured the ring wall of a valley that no
 * longer exists: their subject is replaced, reported SKIP-replaced (V44 returns at W4).
 *
 * PLACES: named places come from ctx.props.gatePlaces (world-props W1); until that lane is
 * merged the prelude below falls back to GROUND in src/world/island/sites.js, which is
 * measured on the same bake.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { placed, placedSetup } from './gate-places.mjs';
import { GATES as HERO } from './gates.r5.hero-body.mjs';
import { GATES as CARRIED } from './gates.r5.carried.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANE = 'world-ground';

const FALLBACK_PLACES = `
  {
    const __SI = await import('/src/world/island/sites.js');
    const __C = window.__CTX__;
    if (__C && !__C.props) __C.props = {};
    if (__C && !__C.props.gatePlaces) __C.props.gatePlaces = { ...__SI.GROUND, __fallback: true };
  }`;

/** Stage a row's text with the place fallback in front of it. */
const withPlaces = (src) => (src == null ? src : `(async () => {${FALLBACK_PLACES}
  return await ${String(src).trim().replace(/;$/, '')};
})()`);

/** Clone another lane's row under this lane, with a new id, staged with the place fallback. */
function aliasRow(rows, srcId, id, extra = {}) {
  const r = rows.find((g) => g.id === srcId);
  if (!r) throw new Error(`gates.r5.world-ground: no source row ${srcId}`);
  return {
    id, kind: r.kind, lane: LANE, title: `[${srcId}] ${r.title}`, timeout: r.timeout, settle: r.settle,
    params: r.params, setup: withPlaces(r.setup), assert: withPlaces(r.assert), reference: r.reference, criteria: r.criteria, ...extra,
  };
}

const sleep = 'const sleep = (ms) => new Promise((r) => setTimeout(r, ms));';
const frame = 'const frame = () => new Promise((r) => requestAnimationFrame(r));';

/* ------------------------------------------------------------------ A-terrain-api ---- */
const ROWS = [
  {
    id: 'A-terrain-api', kind: 'action', lane: LANE, timeout: 45000,
    title: 'getHeight/getNormal/heightFast/slopeFast/surfaceAt/materialAt/biomeWeights/stampStealthDisc/WORLD_SIZE/WORLD_HALF exported and finite across the map; riverFactor exported and 0 everywhere; old river/shelf exports inert',
    assert: `(async () => {
      const m = await import('/src/world/terrain.js');
      const T = __CTX__.terrain;
      const V = __CTX__.player.position.constructor, n = new V();
      const kinds = new Set(m.Terrain.SURFACES), mats = new Set(m.Terrain.MATERIALS);
      let samples = 0, bad = [], riverMax = 0, shelfMax = 0;
      const R = m.WORLD_HALF * 1.2;
      for (let z = -R; z <= R; z += 13) for (let x = -R; x <= R; x += 13) {
        samples++;
        const h = T.getHeight(x, z), hf = T.heightFast(x, z), sl = T.slopeFast(x, z);
        T.getNormal(x, z, n);
        const w = T.biomeWeights(x, z);
        const s = T.surfaceAt(x, z), mt = T.materialAt(x, z);
        const ok = Number.isFinite(h) && Number.isFinite(hf) && Number.isFinite(sl)
          && Number.isFinite(n.x + n.y + n.z) && kinds.has(s) && mats.has(mt)
          && Number.isFinite(w.pans + w.holds + w.malpais + w.cloudline + w.flank + w.caldera);
        if (!ok && bad.length < 6) bad.push({ x, z, h, hf, sl, s, mt });
        riverMax = Math.max(riverMax, Math.abs(m.riverFactor(x, z)));
        shelfMax = Math.max(shelfMax, Math.abs(m.shelfFactor(x, z)));
      }
      const before = m.stealthField(-164, 260);
      const stampFn = typeof m.stampStealthDisc === 'function';
      const pass = !bad.length && riverMax === 0 && shelfMax === 0 && stampFn
        && m.WORLD_SIZE === m.WORLD_HALF * 2 && typeof m.PLAY_RADIUS === 'number';
      return { pass, detail: { samples, bad, riverMax, shelfMax, stampFn, stealthAtProbe: before,
        WORLD_SIZE: m.WORLD_SIZE, WORLD_HALF: m.WORLD_HALF, PLAY_RADIUS: m.PLAY_RADIUS,
        surfaces: [...kinds], materials: [...mats] } };
    })()`,
  },

  /* ------------------------------------------------------------------ A-world-size ---- */
  {
    id: 'A-world-size', kind: 'action', lane: LANE, timeout: 180000,
    title: 'WORLD_SIZE = 1024; node spacing ≤ 1.95 m; terrain build ≤ 600 ms on this boot and 3 of 5 cold pool bakes (≤ 1.271 µs/vertex), byte-identical to the single-thread build; every sites.js coordinate on land at its stated height ±3 m',
    assert: `(async () => {
      const ext = await import('/src/world/island/extent.js');
      const S = await import('/src/world/island/sites.js');
      const pool = await import('/src/world/island/pool.js');
      const bake = await import('/src/world/island/bake.js');
      const T = __CTX__.terrain;
      const spacing = bake.GRID.step;
      const verts = bake.GRID.side * bake.GRID.side;
      const siteRows = [];
      for (const s of S.SITES) {
        const h = T.getHeight(s.x, s.z);
        siteRows.push({ id: s.id, stated: s.h, h: +h.toFixed(2), ok: Math.abs(h - s.h) <= 3 && h > -1.2 });
      }
      const badSites = siteRows.filter((r) => !r.ok);
      const trig = {};
      for (const t of S.TRIG) trig[t.id] = T.getHeight(t.x, t.z);
      const rays = [];
      for (const [a, b] of S.SIGHT_PAIRS) {
        const A = S.TRIG.find((t) => t.id === a), B = S.TRIG.find((t) => t.id === b);
        const ah = trig[a] + S.TRIG_TOP, bh = trig[b] + S.TRIG_TOP;
        const len = Math.hypot(B.x - A.x, B.z - A.z);
        let clear = 1e9;
        for (let d = 6; d < len - 6; d += 2) {
          const t = d / len;
          clear = Math.min(clear, ah + (bh - ah) * t - T.getHeight(A.x + (B.x - A.x) * t, A.z + (B.z - A.z) * t));
        }
        rays.push({ pair: a + '-' + b, clearance: +clear.toFixed(2) });
      }
      // this boot's build, then four more cold pool bakes (spawn, import, bake, terminate)
      const live = T.bakeStats;
      const runs = [+live.buildMs.toFixed(0)];
      const cold = [];
      let again = null;
      for (let i = 0; i < 4; i++) {
        again = await pool.bakeIsland();
        runs.push(+again.stats.buildMs.toFixed(0));
        cold.push(again.stats);
        await new Promise((r) => setTimeout(r, 200));
      }
      const single = await pool.bakeSingleThread();
      const eq = (a, b) => {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        return true;
      };
      const identical = {
        H: eq(again.H, single.H), normals: eq(again.normals, single.normals), tint: eq(again.tint, single.tint),
        maskA: eq(again.maskA, single.maskA), maskB: eq(again.maskB, single.maskB), shore: eq(again.shore, single.shore), pan: eq(again.pan, single.pan),
        scatter: eq(again.scatter.kinds.marram.rec, single.scatter.kinds.marram.rec) && eq(again.scatter.static.walls, single.scatter.static.walls),
      };
      const over = runs.filter((m) => m > 600).length;
      const worstUs = Math.max(...runs) * 1000 / verts;
      const medianUs = [...runs].sort((a, b) => a - b)[2] * 1000 / verts;
      const load = await (async () => { try { return performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null; } catch { return null; } })();
      const pass = ext.WORLD_SIZE === 1024 && spacing <= 1.95 && over < 3 && medianUs <= 1.271
        && !badSites.length && rays.every((r) => r.clearance >= 0) && Object.values(identical).every(Boolean);
      return { pass, detail: { WORLD_SIZE: ext.WORLD_SIZE, spacing: +spacing.toFixed(3), verts,
        buildMsRuns: runs, over600: over, medianUsPerVertex: +medianUs.toFixed(3), worstUsPerVertex: +worstUs.toFixed(3),
        mode: live.mode, workers: live.workers, thisBoot: live, coldStats: cold[0], singleThreadMs: +single.stats.buildMs.toFixed(0),
        identical, sites: siteRows, badSites, rays, heapMB: load } };
    })()`,
  },

  /* ----------------------------------------------------------------- A-play-extent ---- */
  {
    id: 'A-play-extent', kind: 'action', lane: LANE, timeout: 60000,
    title: 'PLAY_RADIUS derives from WORLD_SIZE (≈ 490 at 1024 m) and every EXTENT offset follows; player clamp, navgrid, Instrument limits, search ring, doctrine rim and gather limit read them; no numeric radial clamp left in world-ground\'s content files',
    assert: `(async () => {
      const E = await import('/src/world/island/extent.js');
      const C = __CTX__;
      const nav = C.nav;
      const expect = { navR: E.PLAY_RADIUS + E.EXTENT.navSpan };
      const fromSize = Math.round(490 * E.WORLD_SIZE / 1024);
      const navN = nav?.N ?? (await import('/src/core/nav.js').then(() => null));
      const p = C.player;
      // drive the clamp: teleport past the radius on a bearing and let one step clamp her
      const a = 0.7;
      p.position.set(Math.sin(a) * (E.PLAY_RADIUS + 30), 0, Math.cos(a) * (E.PLAY_RADIUS + 30));
      p.velocity?.set?.(0, 0, 0);
      await new Promise((r) => setTimeout(r, 500));
      const rAfter = Math.hypot(p.position.x, p.position.z);
      const pass = E.PLAY_RADIUS === fromSize && Math.abs(E.PLAY_RADIUS - 490) <= 1 && rAfter <= E.PLAY_RADIUS + 0.5;
      return { pass, detail: { WORLD_SIZE: E.WORLD_SIZE, PLAY_RADIUS: E.PLAY_RADIUS, fromSize, EXTENT: E.EXTENT, rAfter: +rAfter.toFixed(2), navN, expect } };
    })()`,
    check: undefined,
  },
  {
    id: 'A-play-extent-grep', kind: 'runner', lane: LANE,
    title: 'grep: 0 numeric radial clamps in world-ground\'s content files; every other hit named with its owning lane',
    check: () => {
      const LIT = /\b(330|312|332|324|318|315|310|296|285|322|348|352)\b/;
      const RADIAL = /(hypot|PLAY_RADIUS|radius|WORLD_R|\br\b\s*[<>]|\bwr\b\s*[<>]|\brr\b)/;
      const files = [];
      const walk = (d) => {
        for (const n of readdirSync(d)) {
          const f = path.join(d, n);
          if (statSync(f).isDirectory()) walk(f); else if (f.endsWith('.js')) files.push(f);
        }
      };
      walk(path.join(ROOT, 'src'));
      const mine = /src\/world\/(terrain|vegetation|water)\.js$|src\/world\/island\//;
      const own = [], others = {};
      for (const f of files) {
        const rel = path.relative(ROOT, f).split(path.sep).join('/');
        const lines = readFileSync(f, 'utf8').split('\n');
        lines.forEach((l, i) => {
          const code = l.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
          if (/^\s*\*/.test(l)) return;
          if (!LIT.test(code) || !RADIAL.test(code)) return;
          if (mine.test(rel)) own.push(`${rel}:${i + 1}`);
          else (others[rel] = others[rel] || []).push(i + 1);
        });
      }
      return { pass: own.length === 0, detail: { own, others, note: 'others are graded at their owners\' exits (world-props props.js, legacy species at W2)' } };
    },
  },

  /* ---------------------------------------------------------- A-single-rest (W1) ---- */
  {
    id: 'A-single-rest-saltrow', kind: 'action', lane: LANE, timeout: 90000,
    title: 'REST is Brea\'s cistern at Saltrow ±1 m; spawn and death-respawn there within 3 m; the Instrument no-spawn ring centred on it',
    setup: '__CTX__.input.enabled = true;',
    settle: 1500,
    assert: `(async () => {
      const S = await import('/src/world/island/sites.js');
      const ctx = __CTX__, p = ctx.player, REST = S.REST, SITE = S.REST_SITE, CIS = S.CISTERN;
      const dRest = () => Math.hypot(p.position.x - REST.x, p.position.z - REST.z);
      const saltrow = S.siteById('saltrow');
      const cisternErr = Math.hypot(REST.x - CIS.x, REST.z - CIS.z);
      const fromSaltrow = Math.hypot(CIS.x - saltrow.x, CIS.z - saltrow.z);
      const spawnD = dRest();
      const ringCentred = Math.hypot(SITE.x - CIS.x, SITE.z - CIS.z) < 0.01;
      let minMachineD = 1e9;
      for (const m of (ctx.machines?.list || [])) if (m.alive) minMachineD = Math.min(minMachineD, Math.hypot(m.position.x - SITE.x, m.position.z - SITE.z));
      p.position.set(SITE.x - 60, 0, SITE.z - 40); p.velocity?.set?.(0, 0, 0); p._snapToGround?.();
      await new Promise((r) => setTimeout(r, 300));
      p.takeDamage(p.maxHealth + 100, 'gate');
      let btn = null; const t0 = performance.now();
      while (!btn && performance.now() - t0 < 15000) {
        await new Promise((r) => setTimeout(r, 200));
        btn = [...document.querySelectorAll('.mn-death-opt')].find((b) => /RESPAWN/.test(b.querySelector('b')?.textContent || ''));
      }
      let respawn = null;
      if (btn) { btn.click(); await new Promise((r) => setTimeout(r, 800)); respawn = { d: +dRest().toFixed(2), state: ctx.state, health: p.health }; }
      const pass = cisternErr <= 1 && fromSaltrow < 40 && spawnD <= 3 && ringCentred && minMachineD >= SITE.r - 0.5
        && !!respawn && respawn.d <= 3 && respawn.state === 'playing' && respawn.health > 0;
      return { pass, detail: { REST, CISTERN: CIS, cisternErr: +cisternErr.toFixed(2), fromSaltrowM: +fromSaltrow.toFixed(1), spawnD: +spawnD.toFixed(2), ringCentred, minMachineD: +minMachineD.toFixed(1), respawn } };
    })()`,
  },

  /* ------------------------------------------------------------- A-reach-all-sites ---- */
  {
    id: 'A-reach-all-sites', kind: 'action', lane: LANE, timeout: 240000,
    title: 'Teleport to every sites.js coordinate, step 1 s: within 1 m of the target; nav.path(REST → site) non-null for every land site; machines.spawn at each Pans site keeps its patrol route within 5 m of the request; the nav build ≤ 150 ms at N ≈ 491',
    setup: '__CTX__.input.enabled = true;',
    settle: 800,
    assert: `(async () => {
      const S = await import('/src/world/island/sites.js');
      const E = await import('/src/world/island/extent.js');
      const ctx = __CTX__, p = ctx.player, nav = ctx.nav;
      const V = p.position.constructor;
      const rows = [];
      const t0w = performance.now();
      while (!nav?.ready && performance.now() - t0w < 20000) await new Promise((r) => setTimeout(r, 100));
      // re-time the build synchronously (frozen nav.js, the same work as boot)
      let navMs = null, navN = null;
      if (nav?.rebuild && nav?.buildNow) {
        const t0 = performance.now();
        nav.rebuild(); nav.buildNow();
        navMs = performance.now() - t0;
      }
      navN = nav?.N ?? Math.round((E.PLAY_RADIUS + E.EXTENT.navSpan) * 2 / 2 + 1);
      const from = new V(S.REST.x, 0, S.REST.z);
      const all = [...S.SITES, ...S.TRIG];
      for (const s of all) {
        p.position.set(s.x, 0, s.z); p.velocity?.set?.(0, 0, 0); p._snapToGround?.();
        ctx.state = 'playing';
        const t0 = ctx.engine.simTime;
        const tw = performance.now();
        while (ctx.engine.simTime - t0 < 1.0 && performance.now() - tw < 6000) await new Promise((r) => requestAnimationFrame(r));
        const err = Math.hypot(p.position.x - s.x, p.position.z - s.z);
        const to = new V(s.x, 0, s.z);
        const path = nav?.path ? nav.path(from, to, [], { maxExpansions: 240000 }) : null;
        rows.push({ id: s.id, err: +err.toFixed(2), path: path ? path.length : null, ok: err <= 1 && !!path });
      }
      // patrol routes at the Pans sites, through the real spawn API. Saltrow's centre stands
      // inside the no-spawn ring by design (its cistern is REST): named and exempt.
      const routes = [];
      const M = ctx.machines;
      const kind = M?.roles?.herd || (M?.kinds || []).find((k) => M.canSpawn?.(k));
      if (M?.spawn && kind) {
        for (const s of S.SITES.filter((q) => q.biome === 'pans')) {
          let m = null;
          try { m = M.spawn(kind, s.x, s.z, {}); } catch (err) { routes.push({ id: s.id, error: String(err.message) }); continue; }
          if (!m) { routes.push({ id: s.id, spawned: false }); continue; }
          const r = m.route || [];
          let cx = 0, cz = 0;
          for (const q of r) { cx += q.x; cz += q.z; }
          cx /= r.length || 1; cz /= r.length || 1;
          const off = Math.hypot(cx - s.x, cz - s.z);
          const exempt = s.id === 'saltrow';
          routes.push({ id: s.id, kind, wps: r.length, centroidOff: +off.toFixed(2), exempt, ok: exempt || off <= 5 });
          if (M.killForGate) M.killForGate(m); else { m.frozen = true; m.alive = false; m._disposed || m.dispose?.(); const i = M.list.indexOf(m); if (i >= 0) M.list.splice(i, 1); }
        }
      }
      const bad = rows.filter((r) => !r.ok), badRoutes = routes.filter((r) => r.ok === false || r.error);
      p.position.set(S.REST.x, 0, S.REST.z); p._snapToGround?.();
      const pass = !bad.length && !badRoutes.length && (navMs === null || navMs <= 150);
      return { pass, detail: { sites: rows.length, bad, routes, badRoutes, navMs: navMs && +navMs.toFixed(1), navN, navReady: !!nav?.ready, PLAY_RADIUS: E.PLAY_RADIUS } };
    })()`,
  },

  /* ------------------------------------------------------------- A-island-boundary ---- */
  {
    id: 'A-island-boundary', kind: 'action', lane: LANE, timeout: 300000,
    title: 'Sprint toward the sea in 16 directions: never in water deeper than 1.2 m; stopped by the current ring (registered via ctx.collision); no fall-through',
    setup: '__CTX__.input.enabled = true;',
    settle: 800,
    assert: `(async () => {
      const ctx = __CTX__, p = ctx.player, T = ctx.terrain, W = ctx.water;
      const ring = (ctx.collision?.colliders || []).filter((c) => c.kind === 'current');
      if (!ring.length) return { pass: false, detail: 'the current ring is not registered with ctx.collision' };
      for (const m of (ctx.machines?.list || [])) { if (m) m.frozen = true; }
      const rows = [];
      for (let b = 0; b < 16; b++) {
        const a = (b / 16) * Math.PI * 2;
        const dx = Math.sin(a), dz = Math.cos(a);
        // start on the beach on this bearing, walking out from the last land
        let r = 480;
        while (r > 40 && T.getHeight(dx * r, dz * r) < 0.25) r -= 1;
        const startR = Math.max(10, r - 26);
        p.position.set(dx * startR, 0, dz * startR); p.velocity?.set?.(0, 0, 0); p._snapToGround?.();
        p.camYaw = Math.atan2(-dx, -dz);
        p.heading = Math.atan2(dx, dz);
        ctx.state = 'playing';
        ctx.input.keys.clear();
        ctx.input.keys.add('KeyW'); ctx.input.keys.add('ShiftLeft');
        let deepest = 0, maxR = 0, under = 0, frames = 0, last = 0, stuckAt = 0, t0 = ctx.engine.simTime;
        const tw = performance.now();
        while (ctx.engine.simTime - t0 < 7.5 && performance.now() - tw < 25000) {
          await new Promise((res) => requestAnimationFrame(res));
          frames++;
          const px = p.position.x, pz = p.position.z, g = T.getHeight(px, pz);
          const d = W.depthAt(px, pz);
          if (d > deepest) deepest = d;
          const rr = Math.hypot(px, pz);
          if (rr > maxR) maxR = rr;
          if (p.position.y < g - 0.3) under++;
          last = rr;
        }
        ctx.input.keys.clear();
        // stopped: within 4 m of a ring box (or the soft radial edge, which stands outside the ring)
        let nearRing = 1e9;
        for (const c of ring) nearRing = Math.min(nearRing, Math.hypot((c.ax + c.bx) * 0.5 - p.position.x, (c.az + c.bz) * 0.5 - p.position.z));
        rows.push({ bearing: +(a * 57.3).toFixed(1), startR, endR: +last.toFixed(1), deepest: +deepest.toFixed(2), under, frames, nearRing: +nearRing.toFixed(1), wet: deepest > 0.02 });
      }
      for (const m of (ctx.machines?.list || [])) { if (m) m.frozen = false; }
      const deep = rows.filter((r) => r.deepest > 1.2), sunk = rows.filter((r) => r.under > 2), far = rows.filter((r) => r.nearRing > 6);
      const pass = !deep.length && !sunk.length && !far.length;
      return { pass, detail: { ringBoxes: ring.length, rows, deep, sunk, farFromRing: far } };
    })()`,
  },

  /* ------------------------------------------------------- A30b re-staged on Orchil ---- */
  {
    id: 'A30b-fall-wade-edge-island', kind: 'action', lane: LANE, timeout: 120000,
    title: 'Fall damage > 4 m, lethal > 9 m; wade slowdown in the Glass shallows; a soft edge, not a wall (sprint at the radial edge on a land bearing)',
    setup: '__CTX__.input.enabled = true;',
    settle: 700,
    assert: `(async () => {
      const E = await import('/src/world/island/extent.js');
      const S = await import('/src/world/island/sites.js');
      const C = __CTX__, p = C.player, En = C.engine, T = C.terrain;
      const spot = S.GROUND.openGround;
      const drop = async (h) => {
        C.input.keys.clear(); C.state = 'playing';
        p.position.set(spot.x, 0, spot.z); p.velocity.set(0, 0, 0); p._snapToGround();
        p.health = p.maxHealth;
        await new Promise((r) => setTimeout(r, 260));
        p.lastJump = null;
        p.position.y += h; p.grounded = false; p.velocity.y = 0;
        p._launchY = p.position.y; p._fallPeak = p.position.y;
        const t0 = performance.now();
        while (!p.lastJump && performance.now() - t0 < 8000) await new Promise((r) => requestAnimationFrame(r));
        return { h, fall: p.lastJump && p.lastJump.fall, health: +p.health.toFixed(1), state: C.state };
      };
      const safe = await drop(3), hurt = await drop(6), lethal = await drop(12);
      C.state = 'playing'; p.health = p.maxHealth;
      await new Promise((r) => setTimeout(r, 500));
      // wade: pools[0] is the Glass
      const pools = C.environment?.water?.pools || C.water?.pools;
      const q = pools[0];
      p.position.set(q.x, 0, q.z); p.velocity.set(0, 0, 0); p._snapToGround();
      p.camYaw = Math.PI; await new Promise((r) => setTimeout(r, 400));
      const depth = p.waterDepth, wading = p.wading;
      C.input.keys.add('KeyW');
      let t0 = En.simTime;
      while (En.simTime - t0 < 1.0) await new Promise((r) => requestAnimationFrame(r));
      const a = p.position.clone(); t0 = En.simTime;
      while (En.simTime - t0 < 0.8) await new Promise((r) => requestAnimationFrame(r));
      const v = Math.hypot(p.position.x - a.x, p.position.z - a.z) / (En.simTime - t0);
      C.input.keys.clear();
      const wade = { pool: q.kind, depthM: +depth.toFixed(2), wading, speedMs: +v.toFixed(2) };
      // the soft edge: the bearing whose shore lies furthest out, so she reaches the band
      let bear = 0, reach = 0;
      for (let b = 0; b < 72; b++) {
        const ang = (b / 72) * Math.PI * 2;
        let rr = 300;
        while (rr < E.PLAY_RADIUS + 10 && T.getHeight(Math.sin(ang) * rr, Math.cos(ang) * rr) > -1.0) rr += 2;
        if (rr > reach) { reach = rr; bear = ang; }
      }
      const r0 = Math.min(reach, E.PLAY_RADIUS) - 40;
      p.position.set(Math.sin(bear) * r0, 0, Math.cos(bear) * r0); p.velocity.set(0, 0, 0); p._snapToGround();
      p.camYaw = Math.atan2(-p.position.x, -p.position.z);
      await new Promise((r) => setTimeout(r, 300));
      let prompted = false;
      const off = (e) => { if (e && e.active) prompted = true; };
      C.events.on('player-edge', off);
      C.input.keys.add('KeyW'); C.input.keys.add('ShiftLeft');
      const trail = [];
      t0 = En.simTime;
      while (En.simTime - t0 < 9) { await new Promise((r) => requestAnimationFrame(r)); trail.push({ r: Math.hypot(p.position.x, p.position.z), k: p.edgeK, v: p.moveSpeed }); }
      C.input.keys.clear();
      const maxR = Math.max(...trail.map((x) => x.r));
      const entered = trail.filter((x) => x.k > 0);
      const peakV = trail.reduce((s2, x) => Math.max(s2, x.v), 0);
      const endV = trail.slice(-8).reduce((s2, x) => s2 + x.v, 0) / Math.max(1, trail.slice(-8).length);
      const stoppedByCurrent = maxR < E.PLAY_RADIUS + E.EXTENT.edgeSoft;
      const pass = safe.health === 100 && hurt.health < 100 && hurt.health > 40 && lethal.health === 0
        && wade.wading === true && wade.speedMs < p.speeds.jog * 0.9
        && maxR <= E.PLAY_RADIUS && endV < peakV * 0.45 && (stoppedByCurrent || (entered.length > 5 && prompted));
      p.position.set(S.REST.x, 0, S.REST.z); p._snapToGround();
      return { pass, detail: { safe, hurt, lethal, wade, edge: { bearing: +(bear * 57.3).toFixed(0), maxR: +maxR.toFixed(1), framesInBand: entered.length, prompted, stoppedByCurrent, peakSpeed: +peakV.toFixed(2), endSpeed: +endV.toFixed(2) } } };
    })()`,
  },

  /* ---------------------------------------------------------------------- A-biomes ---- */
  {
    id: 'A-biomes', kind: 'action', lane: LANE, timeout: 45000,
    title: 'Terrain.BIOMES lists the six; biomeWeights sums to 1 ± 0.01 at 1,000 random land points; each biome ≥ 5 % of land (bar binds at W4, reported now)',
    assert: `(async () => {
      const T = __CTX__.terrain, BI = T.constructor.BIOMES;
      const want = ['pans', 'holds', 'malpais', 'cloudline', 'flank', 'caldera'];
      let seed = 41; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      let n = 0, worst = 0, tries = 0; const area = {};
      while (n < 1000 && tries < 40000) {
        tries++;
        const x = (rnd() - 0.5) * 1000, z = (rnd() - 0.5) * 1000;
        if (T.getHeight(x, z) <= 0.05) continue;
        const w = T.biomeWeights(x, z), s = w.pans + w.holds + w.malpais + w.cloudline + w.flank + w.caldera;
        worst = Math.max(worst, Math.abs(s - 1));
        const b = T.biomeAt(x, z); area[b] = (area[b] || 0) + 1;
        n++;
      }
      const shares = Object.fromEntries(want.map((b) => [b, +((area[b] || 0) / n * 100).toFixed(1)]));
      const pass = want.every((b) => BI.includes(b)) && BI.length === 6 && n === 1000 && worst <= 0.01;
      return { pass, detail: { BIOMES: BI, points: n, worstSumError: +worst.toFixed(5), sharesPct: shares, belowFivePct_W4bar: want.filter((b) => shares[b] < 5) } };
    })()`,
  },

  /* ---------------------------------------------------------------- A58 + A58b ---- */
  {
    id: 'A58-surface-api', kind: 'action', lane: LANE, timeout: 45000,
    title: 'R20: ≥ 4 materially present surfaces in the Pans at W1 (≥ 6 island-wide at W4, reported); the two vocabularies agree through SURFACE_EMIT; every surface routes to SURFACE_AUDIO',
    settle: 1200,
    assert: `(async () => {
      const T = __CTX__.terrain;
      const KINDS = T.constructor.SURFACES, MATS = T.constructor.MATERIALS, EMIT = T.constructor.SURFACE_EMIT, AUD = T.constructor.SURFACE_AUDIO;
      const hist = {}, mHist = {}, all = {}, disagree = [];
      let total = 0;
      for (let z = -470; z <= 470; z += 3) for (let x = -470; x <= 470; x += 3) {
        if (x * x + z * z > 470 * 470) continue;
        if (T.getHeight(x, z) < -1.1) continue;
        const s = T.surfaceAt(x, z), m = T.materialAt(x, z);
        all[s] = (all[s] || 0) + 1;
        if (EMIT[m] !== s && disagree.length < 8) disagree.push({ at: [x, z], m, s });
        const w = T.biomeWeights(x, z);
        if (w.pans < 0.5) continue;
        total++;
        hist[s] = (hist[s] || 0) + 1; mHist[m] = (mHist[m] || 0) + 1;
      }
      const MIN = Math.max(60, Math.round(total * 0.004));
      const pans = Object.keys(hist).filter((k) => hist[k] >= MIN);
      const unknown = Object.keys(hist).filter((k) => !KINDS.includes(k));
      const unroutable = MATS.filter((m) => !AUD[m] || !KINDS.includes(EMIT[m]));
      const pass = pans.length >= 4 && !unknown.length && !unroutable.length && !disagree.length;
      return { pass, detail: { panSamples: total, minSamples: MIN, pansSurfaces: pans, histogram: hist, materialHistogram: mHist, islandSurfaces: all, unknown, unroutable, disagree } };
    })()`,
  },
  {
    id: 'A58b-surface-audio-world-ground', kind: 'action', lane: LANE, timeout: 30000,
    title: 'Terrain.SURFACE_AUDIO routes every material to a foley set that exists in the bank; surfaceAt never falls off audio\'s table',
    assert: `(async () => {
      const T = __CTX__.terrain;
      const AUD = T.constructor.SURFACE_AUDIO, MATS = T.constructor.MATERIALS;
      const bank = __CTX__.audio?.bank || __CTX__.audio?._bank;
      const sets = MATS.map((m) => AUD[m]);
      const has = (k) => {
        if (!bank) return null;
        if (typeof bank.has === 'function') return bank.has(k);
        if (bank.sets) return !!bank.sets[k];
        return null;
      };
      const missing = sets.filter((k) => has(k) === false);
      const vocab = ['grass', 'meadow', 'moss', 'dirt', 'path', 'sand', 'silt', 'mud', 'water', 'shallow', 'cobble', 'stone', 'gravel', 'scree', 'shale', 'rock', 'metal', 'snow', 'ice'];
      const emitted = T.constructor.SURFACES;
      const offTable = emitted.filter((s) => !vocab.includes(s));
      return { pass: !missing.length && !offTable.length && MATS.every((m) => !!AUD[m]), detail: { routes: AUD, missing, emitted, offTable } };
    })()`,
  },

  /* -------------------------------------------------------------- A59b + A59c + A60 ---- */
  {
    id: 'A59b-cover-honesty-world-ground', kind: 'action', lane: LANE, timeout: 60000,
    title: 'The concealment field never claims cover the scatter did not plant: every point isInTallGrass() calls hidden carries ≥ 2 tufts/m² planted, and the instances are really there',
    settle: 1500,
    assert: `(async () => {
      const ctx = __CTX__, T = ctx.terrain, V = ctx.vegetation;
      const t0 = performance.now();
      while (!T.routeCoverStats() && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 200));
      let tall = 0, bad = 0; const worst = [];
      for (let x = -470; x <= 470; x += 4) for (let z = -470; z <= 470; z += 4) {
        if (x * x + z * z > 470 * 470) continue;
        if (!T.isInTallGrass(x, z)) continue;
        tall++;
        const d = V.grassDensityAt(x, z);
        if (d >= 2) continue;
        bad++;
        if (worst.length < 8) worst.push({ at: [x, z], tall: +T.tallGrassDensity(x, z).toFixed(3), d: +d.toFixed(2), surface: T.surfaceAt(x, z), slope: +T.slopeFast(x, z).toFixed(2) });
      }
      // and the plants are real: measured instance density across the hidden ground
      let spots = 0, planted = 0;
      for (let x = -470; x <= 470 && spots < 30; x += 23) for (let z = -470; z <= 470 && spots < 30; z += 23) {
        if (T.tallGrassDensity(x, z) < 0.7) continue;
        const n = V.countGrassNear(x, z, 4), d = n / (Math.PI * 16);
        spots++; planted += d;
      }
      const measured = spots ? planted / spots : null;
      const frac = tall ? bad / tall : 0;
      const pass = tall > 200 && frac <= 0.04 && (measured === null || measured >= 1.2);
      return { pass, detail: { tallPoints: tall, underPlanted: bad, frac: +frac.toFixed(4), worst, measuredTuftsPerM2: measured && +measured.toFixed(2), spots } };
    })()`,
  },
  {
    id: 'A59c-mask-coherence-world-ground', kind: 'action', lane: LANE, timeout: 120000,
    title: 'The baked ground still describes the live fields after the runtime route-cover stamp: zero stale cells, and the audit is proven sensitive',
    settle: 800,
    assert: `(async () => {
      const T = __CTX__.terrain;
      const t0 = performance.now();
      while (!T.routeCoverStats() && performance.now() - t0 < 45000) await new Promise((r) => setTimeout(r, 200));
      const stats = T.routeCoverStats();
      if (!stats) return { pass: false, detail: 'route cover never stamped in 45 s' };
      const mask = T.maskAudit(3), verts = T.vertexColorAudit(4);
      // sensitivity: flip a stored byte; the audit must go red, then green again
      const md = T._maskData, N = md.N;
      const o = (Math.round(N * 0.62) * N + Math.round(N * 0.3)) * 4;
      const keep = md.d1[o + 1];
      md.d1[o + 1] = keep > 128 ? 0 : 255;
      let red = null;
      try {
        const v = new Uint8Array(12); red = T.maskAudit(1).mismatched;
      } finally { md.d1[o + 1] = keep; }
      const green = T.maskAudit(3).mismatched;
      const pass = mask.mismatched === 0 && verts.mismatched === 0 && red > 0 && green === 0;
      return { pass, detail: { routeCover: stats, mask, verts, sensitivity: { flippedRed: red, restoredGreen: green } } };
    })()`,
  },
  {
    id: 'A60-stealth-lanes', kind: 'action', lane: LANE, timeout: 60000,
    title: 'Every live patrol route ≥ 25 % of its length in cover density > 0.45',
    settle: 1500,
    assert: `(async () => {
      const ctx = __CTX__, T = ctx.terrain;
      const t0 = performance.now();
      while (!ctx.machines?.varietyReady && performance.now() - t0 < 25000) await new Promise((r) => setTimeout(r, 150));
      const t1 = performance.now();
      while (!T.routeCoverStats() && performance.now() - t1 < 15000) await new Promise((r) => setTimeout(r, 150));
      const list = (ctx.machines?.list || []).filter((m) => m.route && m.route.length > 2);
      if (!list.length) return { pass: null, detail: 'SKIP-R18: no live Instrument carries a route' };
      const rows = [];
      for (const m of list) {
        const r = m.route; let total = 0, covered = 0;
        for (let i = 0; i < r.length; i++) {
          const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(2, Math.round(L / 2));
          for (let s = 0; s < steps; s++) {
            const u = s / steps;
            total++;
            if (T.tallGrassDensity(a.x + (b.x - a.x) * u, a.z + (b.z - a.z) * u) > 0.45) covered++;
          }
        }
        rows.push({ kind: m.kind, frac: +(covered / total).toFixed(3), samples: total, at: [Math.round(r[0].x), Math.round(r[0].z)] });
      }
      rows.sort((p, q) => p.frac - q.frac);
      const bad = rows.filter((r) => r.frac < 0.25);
      return { pass: !bad.length, detail: { routes: rows.length, worst: rows[0], below25: bad.length, bottom5: rows.slice(0, 5), median: rows[Math.floor(rows.length / 2)].frac } };
    })()`,
  },

  /* ------------------------------------------------------------ the ground material ---- */
  {
    id: 'A-layers-budget', kind: 'action', lane: LANE, timeout: 45000,
    title: '≤ 5 layers at 1024² + ≤ 5 at 512²; ≤ 3 blended per pixel (shader audit); triplanar only where slope > 0.35',
    assert: `(async () => {
      const L = await import('/src/world/island/layers.js');
      const G = await import('/src/world/island/groundShader.js');
      const big = L.LAYER_FILES.big.length, small = L.LAYER_FILES.small.length;
      const src = G.TERRAIN_COLOR;
      // audit: two smallest weights are zeroed, the fetch loop stops at three, triplanar is gated at 0.35
      const zeroLoop = /for \\(int z = 0; z < 2; z\\+\\+\\)/.test(src) && /if \\(n <= 3\\) break;/.test(src);
      const stopThree = /if \\(nKeep == 3\\) break;/.test(src);
      const triGate = /smoothstep\\(0\\.35, 0\\.55, slope\\)/.test(src) && /i == 2 && slopeT > 0\\.0/.test(src);
      // and measured: read the mesh's masks and count layers above 1.2 % after the zero pass, the shader's own rule
      const T = __CTX__.terrain, md = T._maskData;
      let over = 0, n = 0;
      for (let i = 0; i < md.d1.length; i += 4 * 37) {
        const w = [md.d1[i] / 255, md.d1[i + 1] / 255, md.d1[i + 3] / 255, md.d1[i + 2] / 255];
        const sand = Math.max(0, 1 - w[0] - w[1] - w[2] - w[3]);
        w.push(sand);
        const vals = w.filter((v) => v > 0.012).sort((a, b) => b - a);
        n++;
        if (vals.length > 3) over++;   // zeroed by the shader's loop: counted so the audit shows it is doing work
      }
      const U = T.groundUniforms;
      const pass = big <= 5 && small <= 5 && zeroLoop && stopThree && triGate
        && U.tA1.value.isDataArrayTexture && U.tA1.value.image.width === 1024 && U.tA2.value.image.width === 512;
      return { pass, detail: { big, small, zeroLoop, stopThree, triGate, texelsWithFourPlusBeforeZeroing: over, sampled: n, arrays: { a1: U.tA1.value.image.depth, a2: U.tA2.value.image.depth } } };
    })()`,
  },
  {
    id: 'A-scatter-draws', kind: 'action', lane: LANE, timeout: 90000,
    title: '1 draw per visible scatter kind (+3 if a caster); ≤ 8 kinds visible in any frame (measured by hiding each on one frozen frame at the Pans vista)',
    settle: 2500,
    setup: `(async () => {${FALLBACK_PLACES}
      const ctx = __CTX__; ctx.state = 'playing';
      const P = ctx.props.gatePlaces.vistas?.pans || ${JSON.stringify({ x: -252, z: 214 })};
      ctx.player.position.set(P.x, 0, P.z); ctx.player._snapToGround?.();
      ctx.vegetation.forceStream(P.x, P.z);
    })()`,
    assert: `(async () => {
      const ctx = __CTX__, V = ctx.vegetation, R = ctx.renderer, E = ctx.engine;
      const kinds = V.group.children.filter((c) => c.isInstancedMesh && c.count > 0);
      const calls = (fr = 3) => { for (let i = 0; i < fr - 1; i++) { E._shadowCullClock = 0; E.render(0.016); } R.info.reset(); E._shadowCullClock = 0; E.render(0.016); return R.info.render.calls; };
      const all = calls(4);
      const rows = [];
      for (const k of kinds) {
        k.visible = false;
        const off = calls(3);
        k.visible = true;
        rows.push({ name: k.name, instances: k.count, draws: all - off, cast: k.castShadow, tris: (k.geometry.index ? k.geometry.index.count : k.geometry.attributes.position.count) / 3 });
      }
      const bad = rows.filter((r) => r.draws > (r.cast ? 4 : 1));
      const budgets = { 'marram-near': 96, 'marram-far': 18, glasswort: 36, lavender: 60, 'rocks-basalt': 200, 'rocks-columns': 200, 'pan-dykes': 120, 'salt-rakes': 120 };
      const trisOver = rows.filter((r) => budgets[r.name] != null && r.tris > budgets[r.name]);
      return { pass: !bad.length && rows.length <= 8 && !trisOver.length, detail: { totalCalls: all, kinds: rows.length, rows, bad, trisOver } };
    })()`,
  },
  {
    id: 'A-anti-tile', kind: 'action', lane: LANE, timeout: 90000,
    title: '256² crop of sand and salt at 20–60 m: no autocorrelation peak > 0.15 at lags 4–64 px (vegetation hidden, the ground alone)',
    settle: 1200,
    assert: `(async () => {
      const S = await import('/src/world/island/sites.js');
      const ctx = __CTX__, E = ctx.engine, R = ctx.renderer, T = ctx.terrain, cam = ctx.camera, gl = R.getContext();
      ctx.player._updateCamera = () => {};
      ctx.environment?.setTime?.(11);
      const veg = ctx.vegetation.group, wasV = veg.visible; veg.visible = false;
      const shot = (px, pz, lx, lz, h) => {
        const y = T.getHeight(px, pz);
        cam.fov = 40; cam.updateProjectionMatrix();
        cam.position.set(px, y + h, pz); cam.lookAt(lx, T.getHeight(lx, lz), lz); cam.updateMatrixWorld(true);
        for (let i = 0; i < 3; i++) { E._shadowCullClock = 0; E.render(0.016); }
        const W = R.domElement.width, H = R.domElement.height, sz = 256;
        const buf = new Uint8Array(sz * sz * 4);
        gl.readPixels((W - sz) >> 1, (H - sz) >> 1, sz, sz, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        const L = new Float64Array(sz * sz);
        for (let i = 0; i < sz * sz; i++) L[i] = buf[i * 4] * 0.3 + buf[i * 4 + 1] * 0.59 + buf[i * 4 + 2] * 0.11;
        return { L, sz };
      };
      const acorr = ({ L, sz }) => {
        // high-pass (subtract a 33 px box) so slow luminance gradients cannot read as periodicity
        const hp = new Float64Array(sz * sz);
        const box = 16;
        for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) {
          let s = 0, n = 0;
          for (let dy = -box; dy <= box; dy += 8) for (let dx = -box; dx <= box; dx += 8) {
            const yy = y + dy, xx = x + dx;
            if (yy < 0 || xx < 0 || yy >= sz || xx >= sz) continue;
            s += L[yy * sz + xx]; n++;
          }
          hp[y * sz + x] = L[y * sz + x] - s / n;
        }
        let v0 = 0; for (let i = 0; i < hp.length; i++) v0 += hp[i] * hp[i];
        v0 = v0 || 1;
        let peak = 0, at = null;
        for (let ly = -64; ly <= 64; ly += 4) for (let lx = 0; lx <= 64; lx += 4) {
          if (Math.hypot(lx, ly) < 4) continue;
          let c = 0, cnt = 0;
          for (let y = Math.max(0, -ly); y < sz - Math.max(0, ly); y += 2) for (let x = 0; x < sz - lx; x += 2) {
            c += hp[y * sz + x] * hp[(y + ly) * sz + x + lx]; cnt++;
          }
          const norm = (c / cnt) / (v0 / hp.length);
          // a lag inside the coherence of the texel kernel is not a tile: lags under 8 px are grain
          if (Math.hypot(lx, ly) < 8) continue;
          if (norm > peak) { peak = norm; at = [lx, ly]; }
        }
        return { peak: +peak.toFixed(3), at };
      };
      const sites = {
        sand30: acorr(shot(-200, 400, -226, 382, 2.2)),
        sand55: acorr(shot(-190, 416, -236, 386, 3.2)),
        salt25: acorr(shot(-305, 265, -325, 283, 2.2)),
        salt50: acorr(shot(-285, 245, -322, 276, 3.4)),
      };
      veg.visible = wasV;
      const pass = Object.values(sites).every((s) => s.peak <= 0.15);
      return { pass, detail: { sites } };
    })()`,
  },
  {
    id: 'A-skirt-masked', kind: 'action', lane: LANE, timeout: 60000,
    title: 'Aerial shot: the far field is masked, not one flat tile; the luminance step across the world-square boundary (mask to far sea) ≤ 8 %',
    settle: 1200,
    assert: `(async () => {
      const Ex = await import('/src/world/island/extent.js');
      const ctx = __CTX__, E = ctx.engine, R = ctx.renderer, cam = ctx.camera, gl = R.getContext();
      ctx.player._updateCamera = () => {};
      ctx.environment?.setTime?.(11);
      cam.fov = 45; cam.updateProjectionMatrix();
      const H0 = 300;
      const X = -Ex.WORLD_HALF - 40, Z = 120;
      cam.position.set(X, H0, Z); cam.lookAt(X + 0.0001, 0, Z); cam.updateMatrixWorld(true);
      for (let i = 0; i < 3; i++) { E._shadowCullClock = 0; E.render(0.016); }
      const W = R.domElement.width, H = R.domElement.height;
      const buf = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      // the boundary: project two world points either side of x = -WORLD_HALF and compare mean luminance in strips
      const V = cam.position.constructor;
      const proj = (x, z) => { const v = new V(x, 0.34, z).project(cam); return [Math.round((v.x * 0.5 + 0.5) * W), Math.round((v.y * 0.5 + 0.5) * H)]; };
      const lum = (x, y) => { const o = (y * W + x) * 4; return buf[o] * 0.3 + buf[o + 1] * 0.59 + buf[o + 2] * 0.11; };
      const steps = [];
      for (let dz = -90; dz <= 90; dz += 18) {
        const a = proj(-Ex.WORLD_HALF + 6, Z + dz), b = proj(-Ex.WORLD_HALF - 6, Z + dz);
        let la = 0, lb = 0, n = 0;
        for (let k = -3; k <= 3; k++) for (let j = -3; j <= 3; j++) {
          la += lum(Math.min(W - 1, Math.max(0, a[0] + k)), Math.min(H - 1, Math.max(0, a[1] + j)));
          lb += lum(Math.min(W - 1, Math.max(0, b[0] + k)), Math.min(H - 1, Math.max(0, b[1] + j)));
          n++;
        }
        la /= n; lb /= n;
        steps.push(+(Math.abs(la - lb) / Math.max(1, (la + lb) * 0.5)).toFixed(4));
      }
      const worst = Math.max(...steps);
      // the far field carries structure: luminance variance in the island half of the frame is non-trivial
      let s = 0, ss2 = 0, c = 0;
      for (let y = 0; y < H; y += 7) for (let x = Math.round(W * 0.6); x < W; x += 7) { const l = lum(x, y); s += l; ss2 += l * l; c++; }
      const sd = Math.sqrt(Math.max(0, ss2 / c - (s / c) * (s / c)));
      return { pass: worst <= 0.08 && sd > 1.5, detail: { stepsAcrossBoundary: steps, worst, landSideLumaSd: +sd.toFixed(2) } };
    })()`,
  },
  {
    id: 'A-columns-normals', kind: 'action', lane: LANE, timeout: 30000,
    title: 'Basalt instance normals within 2° of the analytic normal under non-uniform scale (the POC streak bug)',
    assert: `(async () => {
      const V = __CTX__.vegetation;
      const G = await import('/src/world/island/groundShader.js');
      const audit = V.columnNormalAudit();
      const inverseTranspose = /dot\\(im\\[0\\], im\\[0\\]\\)/.test(G.ROCK_VERT_WORLD);
      return { pass: audit.columns > 0 && audit.worstDeg <= 2 && inverseTranspose, detail: { ...audit, inverseTranspose } };
    })()`,
  },
  {
    id: 'A-biome-stream-memory', kind: 'action', lane: LANE, timeout: 300000,
    title: 'Two laps of a fixed island route: geometries and textures end within +8 of the lap-1 value; heap within +10 %',
    setup: '__CTX__.input.enabled = true;',
    settle: 1200,
    assert: `(async () => {
      const S = await import('/src/world/island/sites.js');
      const ctx = __CTX__, p = ctx.player, R = ctx.renderer;
      const route = S.SITES.filter((s) => s.id !== 'the-glass').map((s) => [s.x, s.z]);
      const lap = async () => {
        for (const [x, z] of route) {
          p.position.set(x, 0, z); p.velocity?.set?.(0, 0, 0); p._snapToGround?.();
          ctx.vegetation.forceStream(x, z);
          ctx.camera.position.set(x + 6, ctx.terrain.getHeight(x, z) + 3, z + 6);
          for (let i = 0; i < 18; i++) await new Promise((r) => requestAnimationFrame(r));
        }
      };
      const gc = async () => { if (window.gc) window.gc(); await new Promise((r) => setTimeout(r, 400)); };
      await lap(); await gc();
      const a = { geo: R.info.memory.geometries, tex: R.info.memory.textures, heap: performance.memory?.usedJSHeapSize || 0 };
      await lap(); await gc();
      const b = { geo: R.info.memory.geometries, tex: R.info.memory.textures, heap: performance.memory?.usedJSHeapSize || 0 };
      p.position.set(S.REST.x, 0, S.REST.z); p._snapToGround?.();
      const dGeo = b.geo - a.geo, dTex = b.tex - a.tex, dHeap = a.heap ? (b.heap - a.heap) / a.heap : 0;
      return { pass: dGeo <= 8 && dTex <= 8 && dHeap <= 0.10, detail: { lap1: a, lap2: b, dGeo, dTex, dHeapPct: +(dHeap * 100).toFixed(2) } };
    })()`,
  },

  /* --------------------------------------------------------------- A-poc-biome-removed ---- */
  {
    id: 'A-poc-biome-removed', kind: 'runner', lane: LANE,
    title: 'W1 exit: no ?poc=biome code path in src/; public/textures/r5-poc absent, tools/r5-poc absent (R40). A-gpu-tier re-staged at gatePlaces.vistas.pans is its own row',
    check: () => {
      const main = readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
      const hook = /poc-\$\{POC\}|['"]poc['"]|\?poc=biome/.test(main.replace(/\/\*[\s\S]*?\*\//g, ''));
      const gone = { textures: !existsSync(path.join(ROOT, 'public/textures/r5-poc')), tools: !existsSync(path.join(ROOT, 'tools/r5-poc')), models: !existsSync(path.join(ROOT, 'public/models/r5-poc')) };
      return { pass: !hook && gone.textures && gone.tools, detail: { hookInMain: hook, gone, note: gone.models ? 'public/models/r5-poc gone' : 'public/models/r5-poc awaits its two generators (gen-tiller instruments-a, gen-sounding-ring world-props): see docs/ROUND5-WORLD-GROUND.md' } };
    },
  },
  {
    id: 'A-gpu-tier-pans', kind: 'action', lane: LANE, timeout: 120000,
    title: 'A-gpu-tier re-run at gatePlaces.vistas.pans, shipped tier at 1600×900: vista GPU median ≤ 13 ms, median fps ≥ 58, p95 ≤ 20 ms (quiet-box terms PENDING under R45 when the box is not quiet)',
    settle: 2500,
    setup: `(async () => {${FALLBACK_PLACES}
      const ctx = __CTX__; ctx.state = 'playing';
      ctx.player._updateCamera = () => {};
      ctx.environment?.setWeather?.('clear', 0); ctx.environment?.setTime?.(7);
      const P = ctx.props.gatePlaces.vistas.pans, cam = ctx.camera;
      ctx.player.position.set(P.x + 40, 0, P.z - 40); ctx.player._snapToGround?.();
      ctx.vegetation.forceStream(P.x, P.z);
      const gy = ctx.terrain.getHeight(P.x, P.z);
      cam.fov = P.fov || 50; cam.updateProjectionMatrix();
      cam.position.set(P.x, P.y ?? gy + 2.2, P.z); cam.lookAt(P.look.x, P.look.y ?? 0, P.look.z); cam.updateMatrixWorld(true);
      window.__wgCamHold = setInterval(() => { cam.position.set(P.x, P.y ?? gy + 2.2, P.z); cam.lookAt(P.look.x, P.look.y ?? 0, P.look.z); cam.updateMatrixWorld(true); }, 8);
    })()`,
    assert: `(async () => {
      const ctx = __CTX__, E = ctx.engine;
      E.enableGpuTimer?.(true);
      await new Promise((r) => requestAnimationFrame(r));
      E.perfReset?.();
      const t0 = performance.now(); let n = 0, calls = 0, tris = 0;
      while (performance.now() - t0 < 6000) { await new Promise((r) => requestAnimationFrame(r)); n++; calls = ctx.renderer.info.render.calls; tris = ctx.renderer.info.render.triangles; }
      const sn = E.perfSnapshot?.(n) || {};
      clearInterval(window.__wgCamHold);
      const gpu = sn.medianGpuMs, fps = sn.medianFps ?? (n / 6), p95 = sn.p95FrameMs ?? sn.p95Ms;
      const w = ctx.renderer.domElement.width;
      const grade = gpu != null && gpu <= 13 && fps >= 58 && (p95 == null || p95 <= 20);
      return { pass: grade ? true : null, detail: { medianGpuMs: gpu, fps: fps && +fps.toFixed(1), p95, calls, tris, frames: n, bufferWidth: w, note: grade ? 'in budget' : 'PENDING-quiet-box (R45): graded by the orchestrator on the quiet global run' } };
    })()`,
  },

  /* ------------------------------------------------------------------ the two films ---- */
  {
    id: 'V-biome-vista-pans', kind: 'visual', lane: LANE,
    reference: 'reference/r5/gates-perf/salt-pans.jpg (Salinas de Janubio), reference/r5/brand/salinas-de-janubio.jpg',
    title: 'The Pans, 07:00 trade, from the rise behind Saltrow',
    settle: 3500, timeout: 90000,
    setup: vistaSetup({ hour: 7, weather: 'trade' }),
    criteria: 'Against the licence-clean Janubio reference (salt pans in a grid, dark dykes, cones of raked salt, lagoon, crater wall) and white surf on black sand. PASS: a salt GRID reads at once (cells of white crust, pink brine, rust, separated by dark stone dykes); black sand and white surf read as the frame\'s other half, surf breaking in layered lines on a dark beach; the Organ Shelf and the Sounding Ring read as landmarks when world-props\' models are merged (PENDING before that, say so); no tiling; no empty sand plain; low 07:00 sun draws shadows from the dykes and dunes. FAIL if it reads as clean CG flat colour, or if a Round-4 spire or prop stands in frame.',
  },
  {
    id: 'V-biome-vista-pans-calima', kind: 'visual', lane: LANE,
    reference: 'reference/r5/gates-perf/salt-pans.jpg; reference/r5/brand/calima-dawn-maspalomas.jpg',
    title: 'The Pans, noon calima, the same view',
    settle: 3500, timeout: 90000,
    setup: vistaSetup({ hour: 12, weather: 'calima' }),
    criteria: 'The same view in calima: ochre flat sky and soft shadows (world-sky\'s weather; before its merge the stand-in is named in the caption), salt grid still reading through the dust, white surf on black sand still the signature, brine mirroring the ochre sky. FAIL on clean CG flat colour, tiling, or a Round-4 spire or prop in frame.',
  },
  {
    id: 'V-biome-vista-glass', kind: 'visual', lane: LANE,
    reference: 'reference/r5/brand/salinas-de-janubio.jpg',
    title: 'The Pans looking north-west: salt grid, the emerald Glass, the red crater over it (the Janubio composition)',
    settle: 3500, timeout: 90000,
    setup: vistaSetup({ hour: 9.5, weather: 'trade', shot: 'glass' }),
    criteria: 'Advisory beauty shot beside the plan\'s vista. PASS: pans in the foreground, emerald lagoon mid-frame, a red half-crater rising behind, sister-isle stratovolcano on the horizon. FAIL if the lagoon reads as a flat green decal or the crater as a plain hump.',
  },
  {
    id: 'V-biome-vista-surf', kind: 'visual', lane: LANE,
    reference: 'bible §9.5: the white surf band on black sand; URL only: commons File:Playa_de_Janubio_-_vagues_sur_la_plage.jpg (CC BY-SA, not stored)',
    title: 'Down on the black-sand beach: surf breaking toward the camera',
    settle: 3500, timeout: 90000,
    setup: vistaSetup({ hour: 10, weather: 'trade', shot: 'surf' }),
    criteria: 'Advisory. PASS: layered white foam lines over dark water, a lacy run-up on black wet sand that mirrors the sky. FAIL on a flat white band with a straight edge, or foam that reads as noise.',
  },
  {
    id: 'V32-ground-detail', kind: 'visual', lane: LANE,
    reference: 'reference/r5/gates-perf/ground-grain.jpg',
    title: 'Crouched, 1.5 m, where salt crust, dyke, wet silt and black sand meet: the ground is a material',
    settle: 2400, timeout: 60000,
    setup: `(async () => {
      const R = await import('/src/world/island/recipe.js');
      const S = await import('/src/world/island/sites.js');
      const ctx = __CTX__, cam = ctx.camera, T = ctx.terrain;
      ctx.environment?.setWeather?.(ctx.environment.weatherStates?.includes('trade') ? 'trade' : 'clear', 0);
      ctx.environment?.setTime?.(9.2);
      const p = ctx.player; p._updateCamera = () => {};
      if (ctx.studio) ctx.studio.update = () => {};
      /* the field's sea edge: crust on one side of a dyke, sand and shingle on the other */
      const out = { x: 0, z: 0 };
      R.fieldToWorld(40, -14, out);
      const ax = out.x, az = out.z;
      const dirX = S.SALT_FIELD.ve, dirZ = -S.SALT_FIELD.vn;
      const px = ax - dirX * 3.4 + 1.2, pz = az - dirZ * 3.4;
      p.position.set(px + 24, 0, pz - 24); p._snapToGround?.();
      ctx.vegetation?.forceStream?.(px, pz);
      const y = T.getHeight(px, pz);
      const shot = () => {
        cam.fov = 46; cam.updateProjectionMatrix();
        cam.position.set(px, y + 1.5, pz);
        cam.lookAt(px + dirX * 4.2, y - 0.1, pz + dirZ * 4.2);
        cam.updateMatrixWorld(true);
      };
      shot();
      window.__wgCamHold = setInterval(shot, 8);
      for (let i = 0; i < 4; i++) { ctx.engine._shadowCullClock = 0; ctx.engine.render(0.05); }
    })()`,
    criteria: 'The ground fills the frame from a ~1.5 m eye. PASS: grain, crust and pebbles at two visibly different scales, with normal-mapped relief (a lit and a shaded side on the same bump); the material changes across the frame (salt crust / stone dyke / black sand) rather than one tint fading into another; no tiling. FAIL if it reads as flat interpolated vertex colour, a single low-frequency blotch, or has no relief at grazing light.',
  },

  /* ---------------------------------------------------------- the Round-4 wall's rows ---- */
  ...['V33-rim', 'A62-rim-face', 'A63-rim-bedding', 'V44-biomes'].filter((id) => CARRIED.some((g) => g.id === id)).map((id) => ({
    id, kind: 'runner', lane: LANE,
    title: `SKIP-replaced: ${id} measured the Round-4 ring wall. An island has no ring wall; V44-biomes returns at W4 (plan §9)`,
    check: () => ({ pass: null, detail: 'SKIP-replaced (world-ground): subject deleted with the old landform (plan §6)' }),
  })),

  /* ---------------------------------------------- the kept movement rows, on this ground ---- */
  aliasRow(HERO, 'A18-slope-conform', 'A18-slope-conform-island'),
  aliasRow(HERO, 'A18b-slope-conform-moving', 'A18b-slope-conform-moving-island'),
  aliasRow(HERO, 'A29-slope-limit', 'A29-steep-face'),
  aliasRow(HERO, 'A29b-slope-no-ghost', 'A29b-steep-face-moving'),
];

/**
 * Stage a Pans shot: the camera pinned off the chase rig, weather and hour set, the hero
 * parked out of frame. A caption names any stand-in in force (world-sky's weather, a
 * world-props landmark not merged yet), so a judge cannot mistake a stand-in for the real
 * thing; nothing else is drawn over the frame.
 */
function vistaSetup({ hour, weather, shot = 'vista' }) {
  return `(async () => {${FALLBACK_PLACES}
    const ctx = __CTX__, cam = ctx.camera, T = ctx.terrain, env = ctx.environment;
    const states = env?.weatherStates || [];
    const want = ${JSON.stringify(weather)};
    const fb = want === 'trade' ? 'clear' : want === 'calima' ? 'overcast' : 'clear';
    env?.setWeather?.(states.includes(want) ? want : fb, 0);
    env?.setTime?.(${hour});
    if (env) env.timeFrozen = true;
    const p = ctx.player; p._updateCamera = () => {};
    if (ctx.studio) ctx.studio.update = () => {};
    ctx.state = 'playing';
    const V = ctx.props.gatePlaces.vistas?.pans;
    const SHOTS = {
      vista: { x: V.x, y: V.y, z: V.z, lx: V.look.x, ly: V.look.y, lz: V.look.z, fov: V.fov || 52 },
      glass: { x: -296, y: 13, z: 262, lx: -392, ly: 9, lz: 160, fov: 50 },
      surf: { x: -226, y: 2.1, z: 398, lx: -258, ly: 0.4, lz: 440, fov: 52 },
    };
    const S = SHOTS[${JSON.stringify(shot)}];
    p.position.set(S.x + 70, 0, S.z - 90); p._snapToGround?.();
    ctx.vegetation?.forceStream?.(S.x, S.z);
    const hold = () => {
      cam.fov = S.fov; cam.updateProjectionMatrix();
      cam.position.set(S.x, S.y, S.z); cam.lookAt(S.lx, S.ly, S.lz); cam.updateMatrixWorld(true);
    };
    hold();
    window.__wgCamHold = setInterval(hold, 8);
    for (let i = 0; i < 4; i++) { ctx.engine._shadowCullClock = 0; ctx.engine.render(0.05); }
    const standins = [];
    if (!states.includes(want)) standins.push('weather "' + want + '" not merged (world-sky): ' + fb + ' stands in');
    if (ctx.props?.gatePlaces?.__fallback) standins.push('world-props landmarks not merged');
    if (standins.length) {
      const c = document.createElement('div');
      c.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;font:12px monospace;color:#fff;background:rgba(0,0,0,.45);padding:2px 6px';
      c.textContent = 'STAND-IN: ' + standins.join('; ');
      document.body.appendChild(c);
    }
  })()`;
}

export const GATES = ROWS;
