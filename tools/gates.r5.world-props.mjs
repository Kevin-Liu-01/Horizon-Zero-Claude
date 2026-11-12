/**
 * ROUND 5 — lane `world-props` gate file (W1; plan §9 world-props block, the
 * ROUND5-LOOK §7 world-props rows, R48(c) fauna).
 *
 *   nice -n 10 node tools/gates.mjs --port 5260 --lane world-props
 *
 * Auto-discovered by tools/gates.config.mjs. Rows that share an id with a
 * carried Round-4 row SHADOW it while this file exists (A98-sites, A98b-clearings,
 * A61-colliders-registered, A24-player-blocked, V34-midground): each restates the
 * Round-4 row for the island, at the plan's W1 bar.
 *
 * STAGING. Every row stages by NAME through `ctx.props.gatePlaces` (this lane's
 * contract) or by the published records `ctx.props.{landmarks, places, survey,
 * gauge, organ}`; no row names a coordinate. Every row first awaits
 * `ctx.props.ready` (the landmark GLBs load asynchronously) and the frame on
 * which the props handed their colliders and interactables over.
 *
 * VISUAL rows paint their own contact sheet over the page (rendered frames
 * composited into one image) so the runner's screenshot is the judged frame.
 * Frames are 1600x900 (the runner's viewport).
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANE = 'world-props';

/** Page prelude (splice inside an async body): waits for the props, defines helpers. */
const KIT = `
      const ctx = __CTX__, E = ctx.engine, cam = ctx.camera, renderer = ctx.renderer, T = ctx.terrain;
      const V3 = ctx.player.position.constructor;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const PR = ctx.props;
      if (!PR || !PR.ready) return { pass: false, detail: 'ctx.props (world-props) missing or has no ready promise' };
      await Promise.race([PR.ready, wait(40000)]);
      for (let i = 0; i < 240 && !(PR._collidersDone && PR._interactablesDone); i++) await frame();
      if (!PR.loaded) return { pass: false, detail: { reason: 'landmarks never loaded', loadError: PR.loadError } };
      const GP = PR.gatePlaces;
      const W = renderer.domElement.width, H = renderer.domElement.height;
      const hideHud = () => { const h = document.getElementById('hud'); if (h) h.style.display = 'none'; };
      const stillRoster = () => { for (const m of (ctx.machines?.list || [])) { m.update = () => {}; const r = m.root || m.group; if (r) r.visible = false; } };
      const D2R = Math.PI / 180;
      const bearingOf = (ax, az, bx, bz) => ((Math.atan2(bx - ax, -(bz - az)) / D2R) + 360) % 360;
      const camAt = (x, y, z, lx, ly, lz, fov = 55) => {
        cam.fov = fov; cam.aspect = W / H; cam.updateProjectionMatrix();
        cam.position.set(x, y, z); cam.lookAt(lx, ly, lz); cam.updateMatrixWorld(true);
      };
      const draw = (n = 3) => { for (let i = 0; i < n; i++) { E._shadowCullClock = 0; E.render(0.05); } };
      const gl = renderer.getContext();
      const grab = () => { const b = new Uint8ClampedArray(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
      const _pv = new V3();
      /** screen px (top-left origin) of a world point, or null behind the camera */
      const proj = (x, y, z) => { _pv.set(x, y, z).project(cam); if (_pv.z > 1) return null; return { x: (_pv.x * 0.5 + 0.5) * W, y: (0.5 - _pv.y * 0.5) * H, z: _pv.z }; };
      /** fraction (0..1) of the segment base->top visible over the terrain from the camera (8 samples) */
      const visFrac = (x, z, y0, y1) => {
        let vis = 0;
        for (let k = 1; k <= 8; k++) {
          const ty = y0 + (y1 - y0) * k / 8;
          const dx = x - cam.position.x, dy = ty - cam.position.y, dz = z - cam.position.z;
          const d = Math.hypot(dx, dz);
          let ok = true;
          for (let t = 3; t < d - 3; t += 2) { const f = t / d; if (T.getHeight(cam.position.x + dx * f, cam.position.z + dz * f) > cam.position.y + dy * f) { ok = false; break; } }
          if (ok) vis++;
        }
        return vis / 8;
      };
      /** composite labelled frames into one full-window image (the runner's screenshot) */
      const sheet = (frames, labels, cols = 2, title = '') => {
        const rows = Math.ceil(frames.length / cols);
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        const t = document.createElement('canvas'); t.width = W; t.height = H;
        const tg = t.getContext('2d');
        g.fillStyle = '#111'; g.fillRect(0, 0, W, H);
        for (let i = 0; i < frames.length; i++) {
          tg.putImageData(new ImageData(frames[i], W, H), 0, 0);
          const ox = (i % cols) * W / cols, oy = Math.floor(i / cols) * H / rows;
          g.save(); g.translate(ox, oy); g.scale(1 / cols, -1 / rows); g.drawImage(t, 0, -H); g.restore();
          g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(ox, oy, Math.min(W / cols, 760), 20);
          g.fillStyle = '#f2ead3'; g.font = '13px ui-monospace, monospace'; g.fillText(labels[i], ox + 6, oy + 14);
        }
        if (title) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, H - 22, W, 22); g.fillStyle = '#f2ead3'; g.font = '13px ui-monospace, monospace'; g.fillText(title, 8, H - 7); }
        const img = new Image(); img.src = c.toDataURL('image/png');
        img.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647';
        document.body.appendChild(img);
        return img;
      };
      const setLight = (hour, weather = 'trade') => {
        const env = ctx.environment; if (!env) return 'no environment';
        const states = env.weatherStates || [];
        const fb = weather === 'calima' ? 'overcast' : 'clear';
        env.setWeather?.(states.includes(weather) ? weather : fb, 0);
        env.setTime?.(hour); env.timeFrozen = true;
        return states.includes(weather) ? weather : (fb + ' stands in for ' + weather + ' (world-sky not merged)');
      };`;

/** Setup for a held frame: hud off, the player camera parked (the asserts freeze the roster). */
const HOLD_BODY = `
  __CTX__.input && (__CTX__.input.enabled = true);
  { const h = document.getElementById('hud'); if (h) h.style.display = 'none'; }
  __CTX__.player._updateCamera = () => {};
  __CTX__.state = 'playing';`;
const HOLD = `(async () => {${HOLD_BODY}
})()`;
/** A visual row's setup: hold the frame, wait for the props, then run `body` (which paints the sheet). */
const paint = (body) => `(async () => {${HOLD_BODY}${KIT}${body}
})()`;

const GATES = [
  /* ---------------------------------------------------- A-gate-places-published */
  {
    id: 'A-gate-places-published', kind: 'action', lane: LANE, timeout: 90000, settle: 600,
    title: 'ctx.props.gatePlaces lists openGround, steepFace, hillside38, herdSite, rest, tallCover, pool, waterFeature, vistas (one per biome), landmarks, kilnYardFight, each on valid terrain; every look.* place too',
    assert: `(async () => {${KIT}
      const need = ['openGround', 'steepFace', 'hillside38', 'herdSite', 'rest', 'tallCover', 'pool', 'waterFeature', 'vistas', 'landmarks', 'kilnYardFight'];
      const biomes = (T.constructor?.BIOMES || ['pans', 'holds', 'malpais', 'cloudline', 'flank', 'caldera']);
      const missing = need.filter((k) => GP[k] == null);
      const vistasMissing = biomes.filter((b) => !GP.vistas?.[b]);
      const half = (await import('/src/world/island/extent.js')).WORLD_HALF ?? 512;
      const bad = [], rows = [];
      const check = (name, r) => {
        if (!r || typeof r !== 'object') return;
        if (typeof r.x === 'number' && typeof r.z === 'number') {
          const h = T.getHeight(r.x, r.z);
          const water = ctx.water?.depthAt?.(r.x, r.z) ?? 0;
          const ok = Number.isFinite(h) && Math.abs(r.x) < half && Math.abs(r.z) < half && (h > -0.05 || name === 'pool' || name === 'waterFeature') && water <= 1.2;
          rows.push(name + ' h=' + h.toFixed(1) + (water > 0 ? ' wade=' + water.toFixed(2) : ''));
          if (!ok) bad.push({ name, x: +r.x.toFixed(1), z: +r.z.toFixed(1), h: +h.toFixed(2), water: +(+water).toFixed(2) });
        }
        if (Array.isArray(r.points)) r.points.forEach((q, i) => check(name + '.' + i, Array.isArray(q) ? { x: q[0], z: q[1] } : q));
      };
      for (const k of need) {
        const v = GP[k];
        if (k === 'vistas' || k === 'landmarks') for (const [s, r] of Object.entries(v || {})) check(k + '.' + s, r);
        else check(k, v);
      }
      for (const [k, r] of Object.entries(GP.look || {})) check('look.' + k, r);
      const lookNames = ['field', 'vista', 'aim', 'close', 'dusk', 'pansInland', 'pansSunset', 'meadow', 'beach', 'title', 'saltrowDusk', 'craterWall', 'steepFace', 'reed', 'brazier'];
      const lookMissing = lookNames.filter((n) => !GP.look?.[n]);
      const pass = missing.length === 0 && vistasMissing.length === 0 && bad.length === 0 && lookMissing.length === 0 && GP.__source === 'world-props';
      return { pass, detail: { source: GP.__source, island: GP.__island, missing, vistasMissing, lookMissing, bad, checked: rows.length,
        stubs: Object.entries(GP.look || {}).filter(([, r]) => r.stub).map(([k]) => k), keys: Object.keys(GP).filter((k) => !k.startsWith('__')) } };
    })()`,
  },

  /* ------------------------------------------------------------------ A98-sites */
  {
    id: 'A98-sites', kind: 'action', lane: LANE, timeout: 120000, settle: 800,
    title: '>= 8 sites at W1, each published with position/radius/kind and >= 2 interactables that respond to interact (every one fired; pure landmarks named)',
    assert: `(async () => {${KIT}
      const snap = [];
      try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); snap.push([k, localStorage.getItem(k)]); } } catch (e) { /* */ }
      const I = ctx.interactables;
      const places = PR.places || [];
      const shapeBad = places.filter((p) => !(p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.kind === 'string'
        && p.position && Number.isFinite(p.position.x) && p.radius > 4)).map((p) => p && p.id);
      const siteIds = new Set(PR.sites().filter((s) => s.place).map((s) => s.id));
      const missingFromSites = places.filter((p) => !siteIds.has(p.id)).map((p) => p.id);
      const byPlace = new Map();
      for (const e of I.list) { if (!e || !e.place) continue; if (!byPlace.has(e.place)) byPlace.set(e.place, []); byPlace.get(e.place).push(e); }
      const ev = ctx.events, orig = ev.emit.bind(ev);
      let seen = [];
      ev.emit = (t, p) => { seen.push(t); return orig(t, p); };
      const per = []; let firedOk = 0, fired = 0;
      for (const p of places) {
        const list = byPlace.get(p.id) || [];
        const tried = [];
        for (const e of list) {
          fired++; seen = []; let threw = null;
          try { await e.onInteract(ctx, e); } catch (err) { threw = String(err && err.message || err); }
          await wait(30);
          const ok = !threw && seen.length > 0;
          if (ok) firedOk++;
          tried.push({ label: e.label, events: seen.slice(0, 3), threw });
        }
        per.push({ id: p.id, kind: p.kind, radius: p.radius, interactables: list.length, fired: tried });
      }
      ev.emit = orig;
      try { localStorage.clear(); for (const [k, v] of snap) localStorage.setItem(k, v); } catch (e) { /* */ }
      const thin = per.filter((p) => p.interactables < 2).map((p) => p.id);
      const pure = PR.landmarks.filter((l) => !places.some((p) => p.id === l.id) && !String(l.id).startsWith('trig-')).map((l) => l.id);
      const pass = places.length >= 8 && shapeBad.length === 0 && missingFromSites.length === 0 && thin.length === 0 && fired >= 16 && firedOk === fired;
      return { pass, detail: { places: places.length, bar: '>= 8 sites, each >= 2 interactables, every fired entry raises an event', shapeBad, missingFromSites, thin,
        firedOk: firedOk + '/' + fired, pureLandmarks: pure, per } };
    })()`,
  },

  /* -------------------------------------------------------------- A-trig-pillars */
  {
    id: 'A-trig-pillars', kind: 'action', lane: LANE, timeout: 240000, settle: 800,
    title: '6 pillars at sites.js TRIG +-1 m; the top (the 3 m deck under the 4 m plate) is reached through the climb action in <= 3 s; all 10 sight pairs unobstructed (terrain + colliders)',
    setup: '__CTX__.input.enabled = true;',
    assert: `(async () => {${KIT}
      const S = await import('/src/world/island/sites.js');
      if (!Array.isArray(S.TRIG)) return { pass: null, detail: 'PENDING: this tree has no sites.js TRIG table (world-ground W1 island not merged)' };
      const pillars = PR.survey.pillars;
      const placeRows = S.TRIG.map((t) => {
        const p = pillars.find((q) => q.id === t.id);
        let inst = null;
        if (p && p.object) { const m = new (cam.matrixWorld.constructor)(); p.object.getMatrixAt(p.instanceId, m); inst = { x: m.elements[12], z: m.elements[14] }; }
        const err = p ? Math.hypot(p.x - t.x, p.z - t.z) : 99;
        const instErr = inst ? Math.hypot(inst.x - t.x, inst.z - t.z) : 99;
        return { id: t.id, errM: +err.toFixed(3), meshErrM: +instErr.toFixed(3) };
      });
      const placeOk = pillars.length === 6 && placeRows.every((r) => r.errM <= 1 && r.meshErrM <= 1);

      /* sight pairs: plate (TRIG_TOP) to plate, terrain marched every 1 m, colliders ray-tested */
      const C = ctx.collision;
      const top = (S.TRIG_TOP ?? 4);
      const pairRows = [];
      for (const [a, b] of (S.SIGHT_PAIRS || [])) {
        const A = pillars.find((q) => q.id === a), B = pillars.find((q) => q.id === b);
        const ay = A.y + top + 0.25, by = B.y + top + 0.25;
        const dx = B.x - A.x, dy = by - ay, dz = B.z - A.z, len = Math.hypot(dx, dy, dz), hl = Math.hypot(dx, dz);
        let minClear = Infinity, at = 0;
        for (let t = 4; t < hl - 4; t += 1) {
          const f = t / hl; const c = ay + dy * f - T.getHeight(A.x + dx * f, A.z + dz * f);
          if (c < minClear) { minClear = c; at = t; }
        }
        const hit = C.raycast(A.x + dx / len * 3, ay + dy / len * 3, A.z + dz / len * 3, dx / len, dy / len, dz / len, len - 6, { filter: (c) => c.kind !== 'trig' });
        pairRows.push({ pair: a + '-' + b, lenM: +hl.toFixed(0), minTerrainClearM: +minClear.toFixed(2), atM: at, collider: hit && hit.hit ? (hit.collider.kind + '@' + hit.distance.toFixed(0)) : null });
      }
      const pairsOk = pairRows.length === 10 && pairRows.every((r) => r.minTerrainClearM > 0 && !r.collider);

      /* the climb: synthesized input, the way A-climb-1m drives the fixture */
      const p = ctx.player, keys = ctx.input.keys;
      stillRoster();
      const simWait = async (sec, cap = 20000) => { const s0 = E.simTime, w0 = performance.now(); while (E.simTime - s0 < sec && performance.now() - w0 < cap) await frame(); };
      const climbRows = [];
      for (const q of pillars) {
        keys.clear();
        const sx = q.stepsDir.x, sz = q.stepsDir.z;
        p.position.set(q.x + sx * 6.4, 0, q.z + sz * 6.4); p.velocity.set(0, 0, 0); p._snapToGround();
        p.camYaw = Math.atan2(sx, sz); p.camPitch = 0; p.heading = Math.atan2(-sx, -sz);
        await simWait(0.35, 4000);
        keys.add('KeyW');
        const t0 = E.simTime; let reached = null, mantles = 0, wasM = false;
        while (E.simTime - t0 < 8) {
          await frame();
          if (p.mantling && !wasM) mantles++;
          wasM = !!p.mantling;
          if (!p.mantling && p.grounded) { ctx.input._press?.('Space', { code: 'Space' }); keys.delete('Space'); }
          if (p.position.y > q.y + 2.9 && !p.mantling && p.grounded) { reached = E.simTime - t0; break; }
        }
        keys.clear();
        await simWait(0.3, 3000);
        const onDeck = Math.hypot(p.position.x - q.x, p.position.z - q.z) < 2.2 + 1.3 && p.position.y > q.y + 2.85;
        climbRows.push({ id: q.id, topS: reached === null ? null : +reached.toFixed(2), mantles, onDeck, standY: +(p.position.y - q.y).toFixed(2) });
      }
      const climbOk = climbRows.every((r) => r.topS !== null && r.topS <= 3);
      return { pass: placeOk && pairsOk && climbOk, detail: { placeOk, pairsOk, climbOk, place: placeRows, pairs: pairRows, climb: climbRows, bar: 'pillar <= 1 m from sites.js; deck reached <= 3 s by input; 10/10 rays clear' } };
    })()`,
  },

  /* ---------------------------------------------------------- A-landmark-bearing */
  {
    id: 'A-landmark-bearing', kind: 'action', lane: LANE, timeout: 120000, settle: 1200,
    title: 'From Saltrow (gatePlaces.landmarks.saltrow): each of the 8 bearing sectors has >= 1 registered landmark at 150-500 m projecting >= 12 px at 1600x900, occlusion-tested',
    setup: HOLD,
    assert: `(async () => {${KIT}
      hideHud(); stillRoster();
      const st = GP.landmarks?.saltrow;
      if (!st) return { pass: false, detail: 'gatePlaces.landmarks.saltrow missing' };
      const eye = T.getHeight(st.x, st.z) + (st.eye ?? 1.7);
      const C = ctx.collision;
      const SECT = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const best = SECT.map(() => null);
      const rows = [];
      for (const l of PR.landmarks) {
        if (!l.height) continue;
        const d = Math.hypot(l.x - st.x, l.z - st.z);
        if (d < 150 || d > 500) continue;
        const b = bearingOf(st.x, st.z, l.x, l.z);
        const s = Math.round(b / 45) % 8;
        const y0 = l.y ?? T.getHeight(l.x, l.z), y1 = y0 + l.height;
        camAt(st.x, eye, st.z, l.x, (y0 + y1) / 2, l.z, 55);
        const a = proj(l.x, y0, l.z), c = proj(l.x, y1, l.z);
        if (!a || !c) continue;
        let vf = visFrac(l.x, l.z, y0, y1);
        // a collider between (anything that is not the landmark itself) occludes it
        if (vf > 0) {
          const ty = y0 + (y1 - y0) * 0.75, dx = l.x - st.x, dy = ty - eye, dz = l.z - st.z, len = Math.hypot(dx, dy, dz);
          const hit = C.raycast(st.x, eye, st.z, dx / len, dy / len, dz / len, Math.max(0, len - 25), { mode: 'occluder' });
          if (hit && hit.hit && hit.collider && hit.collider.ref !== l.object && hit.collider.node !== l.object) vf *= 0.5;
        }
        const px = Math.abs(a.y - c.y) * vf;
        rows.push({ id: l.id, sector: SECT[s], bearing: +b.toFixed(0), d: +d.toFixed(0), px: +px.toFixed(1), visible: vf });
        if (px >= 12 && (!best[s] || px > best[s].px)) best[s] = { id: l.id, px: +px.toFixed(1), d: +d.toFixed(0), y0, y1, x: l.x, z: l.z };
      }
      // the frames: one per sector, the camera at Saltrow's eye on that sector's best landmark
      const frames = [], labels = [];
      setLight(10.5, 'trade');
      for (let s = 0; s < 8; s++) {
        const r = best[s];
        const bb = s * 45 * D2R;
        if (r) camAt(st.x, eye, st.z, r.x, (r.y0 + r.y1) / 2, r.z, 55);
        else camAt(st.x, eye, st.z, st.x + Math.sin(bb) * 100, eye, st.z - Math.cos(bb) * 100, 55);
        draw(3); frames.push(grab());
        labels.push(SECT[s] + ': ' + (r ? r.id + ' ' + r.d + ' m  ' + r.px + ' px' : 'NONE'));
      }
      sheet(frames, labels, 4, 'A-landmark-bearing from Saltrow (' + st.x.toFixed(0) + ', ' + st.z.toFixed(0) + '): >= 1 landmark 150-500 m and >= 12 px in every sector');
      const sectors = Object.fromEntries(SECT.map((n, i) => [n, best[i] ? best[i].id + ' ' + best[i].px + 'px@' + best[i].d + 'm' : null]));
      const pass = best.every(Boolean);
      return { pass, detail: { sectors, empty: SECT.filter((n, i) => !best[i]), candidates: rows } };
    })()`,
  },

  /* ---------------------------------------------------- A61-colliders-registered */
  {
    id: 'A61-colliders-registered', kind: 'action', lane: LANE, timeout: 90000, settle: 1200,
    title: '>= 95 % of collidable instances registered (identity + coverage), >= 600 colliders at W1; every world-props mesh that can be walked into is a collider; the offshore stacks have none',
    assert: `(async () => {${KIT}
      const C = ctx.collision;
      const byRef = new Map();
      for (const c of C.colliders) { for (const o of [c.ref, c.node]) { if (!o) continue; if (!byRef.has(o)) byRef.set(o, []); byRef.get(o).push(c); } }
      const g = PR.group; g.updateWorldMatrix(true, true);
      const M = new (cam.matrixWorld.constructor)();
      const rows = []; let inst = 0, covered = 0;
      const exempt = /lamp|jet|skyline|rotor/;   // lamps, the brine jet, the offshore rock (no colliders by design), the pump rotors 10 m up
      g.traverse((o) => {
        if (!o.isMesh) return;
        if (exempt.test(o.name || '')) return;
        const cols = byRef.get(o) || [];
        if (o.isInstancedMesh) {
          let ok = 0;
          for (let i = 0; i < o.count; i++) {
            o.getMatrixAt(i, M); M.premultiply(o.matrixWorld);
            const x = M.elements[12], z = M.elements[14];
            if (cols.some((c) => x >= c.minx - 0.6 && x <= c.maxx + 0.6 && z >= c.minz - 0.6 && z <= c.maxz + 0.6)) ok++;
          }
          inst += o.count; covered += ok;
          rows.push(o.name + ': ' + ok + '/' + o.count + ' instances, ' + cols.length + ' colliders');
        } else {
          inst += 1; if (cols.length) covered += 1;
          rows.push(o.name + ': ' + (cols.length ? cols.length + ' colliders' : 'UNREGISTERED'));
        }
      });
      // world-ground's rock scatter (seeded by collision.seedWorld): instances vs rock colliders
      let rockInst = 0, rockCols = 0;
      const veg = ctx.vegetation?.group;
      if (veg) for (const c of veg.children) if (c.isInstancedMesh && /^rocks-/.test(c.name)) { rockInst += c.count; rockCols += (byRef.get(c) || []).length; }
      const stacks = PR.landmarkSet.stacks || [];
      const stackCols = C.colliders.filter((c) => stacks.some((s) => Math.hypot(((c.minx + c.maxx) / 2) - s.x, ((c.minz + c.maxz) / 2) - s.z) < 30)).length;
      const total = C.count();
      const frac = inst ? covered / inst : 0;
      const census = C.census();
      const pass = total >= 600 && frac >= 0.95 && stackCols === 0 && PR.colliderCount > 0;
      return { pass, detail: { total, bar: '>= 600 total; >= 95 % of world-props collidable instances; 0 on the offshore stacks', worldProps: { instances: inst, covered, frac: +frac.toFixed(3), colliders: PR.colliderCount },
        worldGroundRocks: { instances: rockInst, colliders: rockCols }, stackColliders: stackCols, census, rows } };
    })()`,
  },

  /* --------------------------------------------------------- A24-player-blocked */
  {
    id: 'A24-player-blocked', kind: 'action', lane: LANE, timeout: 90000, settle: 900,
    title: 'Sprinting into an Organ Shelf basalt column (gatePlaces.basaltColumn) stops her: distance to its axis >= 0.45 m, speed < 1 m/s at contact',
    setup: '__CTX__.input.enabled = true;',
    assert: `(async () => {${KIT}
      const p = ctx.player, C = ctx.collision;
      stillRoster();
      const bc = GP.basaltColumn;
      if (!bc) return { pass: false, detail: 'gatePlaces.basaltColumn missing' };
      // the column's own collider, and an approach from open ground on the cluster's outside
      const col = PR.organ.columns.reduce((b, c) => (Math.hypot(c.x - bc.x, c.z - bc.z) < Math.hypot(b.x - bc.x, b.z - bc.z) ? c : b));
      const mine = C.colliders.filter((c) => c.kind === 'basalt' && Math.abs((c.minx + c.maxx) / 2 - col.x) < 0.05 && Math.abs((c.minz + c.maxz) / 2 - col.z) < 0.05);
      let ang = null;
      for (let k = 0; k < 24 && ang === null; k++) {
        const th = (k / 24) * Math.PI * 2;
        let ok = true;
        for (let d = 1.4; d <= 9; d += 0.5) {
          const x = col.x + Math.sin(th) * d, z = col.z + Math.cos(th) * d, gy = T.getHeight(x, z);
          if (C.sphereQuery(x, gy + 1, z, 0.55, [], (c) => c.blocking && !mine.includes(c)).length) { ok = false; break; }
          if (gy > col.y1 - 2.2) { ok = false; break; }
        }
        if (ok) ang = th;
      }
      if (ang === null) return { pass: false, detail: { reason: 'no clear 9 m approach to the chosen column', col } };
      const hook = C.playerHook || C.attachPlayer({ radius: 0.4, height: 1.8 });
      p.position.set(col.x + Math.sin(ang) * 9, 0, col.z + Math.cos(ang) * 9); p.velocity.set(0, 0, 0); p._snapToGround();
      p.camYaw = ang; p.camPitch = 0.05; p.heading = ang + Math.PI;
      await wait(300);
      ctx.input.keys.add('KeyW'); ctx.input.keys.add('ShiftLeft');
      let minAxis = 1e9, contactT = 0, contactKind = null, peak = 0;
      const trail = []; const t0 = performance.now(); let prev = { x: p.position.x, z: p.position.z, t: t0 };
      while (performance.now() - t0 < 3500) {
        await frame();
        const d = Math.hypot(p.position.x - col.x, p.position.z - col.z);
        if (d < minAxis) minAxis = d;
        const now = performance.now();
        if (!contactT && hook.blocked) { contactT = now; contactKind = hook.kind; }
        if (now - prev.t >= 80) { const v = Math.hypot(p.position.x - prev.x, p.position.z - prev.z) / ((now - prev.t) / 1000); trail.push({ wStart: prev.t, v }); peak = Math.max(peak, v); prev = { x: p.position.x, z: p.position.z, t: now }; }
      }
      ctx.input.keys.delete('KeyW'); ctx.input.keys.delete('ShiftLeft');
      const win = contactT ? trail.filter((x) => x.wStart >= contactT && x.wStart - contactT <= 400) : [];
      const atContact = win.length ? win.reduce((s, x) => s + x.v, 0) / win.length : 99;
      const reached = minAxis <= col.r + 0.4 + 0.45;
      const pass = minAxis >= 0.45 && atContact < 1 && reached && peak > 4.5 && contactKind === 'basalt';
      return { pass, detail: { minAxisM: +minAxis.toFixed(3), columnRadiusM: +col.r.toFixed(2), columnHeightM: +(col.y1 - T.getHeight(col.x, col.z)).toFixed(2),
        speedAtContactMs: +atContact.toFixed(2), peakMs: +peak.toFixed(2), contactKind, reached, approachDeg: +(ang / D2R).toFixed(0) } };
    })()`,
  },

  /* ------------------------------------------------------------- A98b-clearings */
  {
    id: 'A98b-clearings', kind: 'action', lane: LANE, timeout: 90000, settle: 1200,
    title: 'Every published keepout (ctx.props.keepouts) is really cleared: no scatter drawn inside it, no world-ground tree/rock collider left inside it, a capsule walks each ring; the thinning is not a silent no-op',
    assert: `(async () => {${KIT}
      const K = PR.keepouts || [];
      const C = ctx.collision;
      const inHard = (x, z) => { for (const k of K) { const dx = x - k.x, dz = z - k.z; if (dx * dx + dz * dz < k.hard * k.hard) return k.id; } return null; };
      const M = new (cam.matrixWorld.constructor)();
      const drawn = {}; let scanned = 0;
      const veg = ctx.vegetation?.group;
      if (veg) veg.traverse((o) => {
        if (!o.isInstancedMesh || !o.count) return;
        o.updateWorldMatrix(true, false);
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, M); M.premultiply(o.matrixWorld);
          const s = Math.hypot(M.elements[0], M.elements[1], M.elements[2]);
          if (s < 1e-4) continue;                               // thinned (zero-scale) instances are not drawn
          scanned++;
          const id = inHard(M.elements[12], M.elements[14]);
          if (id) { const key = id + ':' + (o.name || '?'); drawn[key] = (drawn[key] || 0) + 1; }
        }
      });
      const mineRefs = new Set(); PR.group.traverse((o) => mineRefs.add(o));
      const ghosts = {};
      for (const c of C.colliders) {
        if (c.kind !== 'tree' && c.kind !== 'canopy' && c.kind !== 'rock') continue;
        if (mineRefs.has(c.ref) || mineRefs.has(c.node)) continue;     // this lane's own rock
        const x = c.type === 'capsule' ? c.ax : c.type === 'mesh' ? (c.mat ? c.mat.elements[12] : (c.minx + c.maxx) / 2) : c.cx;
        const z = c.type === 'capsule' ? c.az : c.type === 'mesh' ? (c.mat ? c.mat.elements[14] : (c.minz + c.maxz) / 2) : c.cz;
        const id = inHard(x, z);
        if (id) ghosts[id] = (ghosts[id] || 0) + 1;
      }
      const blocked = [];
      for (const k of K) {
        for (let a = 0; a < 6; a++) {
          const ang = (a / 6) * Math.PI * 2, r = k.hard * 0.62;
          const fx = k.x + Math.cos(ang) * r, fz = k.z + Math.sin(ang) * r, tx = k.x - Math.cos(ang) * r, tz = k.z - Math.sin(ang) * r;
          const hit = C.capsuleCast(new V3(fx, T.getHeight(fx, fz) + 0.1, fz), new V3(tx, T.getHeight(tx, tz) + 0.1, tz), 0.4, 1.7, { filter: (c) => c.kind === 'tree' || c.kind === 'rock' && !mineRefs.has(c.ref) && !mineRefs.has(c.node) });
          if (hit && hit.hit) blocked.push(k.id + '@' + Math.round(ang / D2R));
        }
      }
      const consumer = typeof ctx.vegetation?._applyKeepouts === 'function' ? 'vegetation._applyKeepouts' : null;
      const drawnTotal = Object.values(drawn).reduce((a, b) => a + b, 0);
      const ghostTotal = Object.values(ghosts).reduce((a, b) => a + b, 0);
      const pass = K.length >= 6 && K.every((k) => k.hard > 0 && k.soft >= k.hard && k.grass > 0) && drawnTotal === 0 && ghostTotal === 0 && blocked.length === 0 && !!consumer;
      return { pass, detail: { keepouts: K.length, consumer, instancesScanned: scanned, drawnInside: drawn, collidingInside: ghosts, blockedSweeps: blocked,
        bar: '>= 6 keepouts, 0 drawn inside, 0 colliding inside, 0 blocked sweeps, a live consumer (world-ground reads ctx.props.keepouts)' } };
    })()`,
  },

  /* -------------------------------------------------------------- A-place-draws */
  {
    id: 'A-place-draws', kind: 'action', lane: LANE, timeout: 120000, settle: 1500,
    title: 'Each landmark <= 3 main draws + <= 2 casters; landmarks + places <= 45 draws in any frame (the look and vista frames, the V34 station four ways), measured by hiding world-props on the frozen frame',
    setup: HOLD,
    assert: `(async () => {${KIT}
      hideHud(); stillRoster();
      setLight(18.75, 'trade');
      // per landmark: meshes (main draws) and casters, read off the scene graph
      const groups = {
        'sounding-ring': [PR.landmarkSet.ring?.group], 'wind-pumps': [PR.landmarkSet.meshes.pumpTower, PR.landmarkSet.meshes.pumpRotor],
        'skyline (stacks + arch)': ['stack-a', 'stack-b', 'stack-c', 'sea-arch'].map((k) => PR.landmarkSet.meshes[k]),
        roques: [PR.landmarkSet.meshes.roques], 'trig pillars': [PR.survey.meshes.trig], benchmarks: [PR.survey.meshes.bench],
        'organ shelf': [PR.organ.mesh], 'red crater': [PR.crater.blocks, PR.crater.buttresses], gauge: [PR.gauge.root],
      };
      const per = {};
      for (const [name, list] of Object.entries(groups)) {
        let main = 0, cast = 0;
        for (const o of list) if (o) o.traverse((m) => { if (m.isMesh) { main++; if (m.castShadow) cast++; } });
        per[name] = { main, casters: cast };
      }
      // the stacks are four kinds of one landmark family; graded per kind (one draw each)
      const perOk = Object.entries(per).every(([n, r]) => (n.startsWith('skyline') ? r.main <= 4 : r.main <= 3) && r.casters <= 2);
      // frame deltas: render the frozen frame with and without the world-props group
      const info = renderer.info;
      const callsOf = () => { info.reset(); E._shadowCullClock = 0; E.render(0.016); return info.render.calls; };
      const frames = [];
      const V = (r) => r && camAt(r.x, (r.y ?? T.getHeight(r.x, r.z)) + (r.eye ?? 1.7), r.z, r.look.x, r.look.y, r.look.z, r.fov || 55);
      const stations = [['look.pansInland', GP.look?.pansInland], ['look.pansSunset', GP.look?.pansSunset], ['look.vista', GP.look?.vista], ['vistas.pans', GP.vistas?.pans]];
      const mv = GP.midgroundVista;
      for (const name of ['N', 'E', 'S', 'W']) {
        const b = { N: 0, E: 90, S: 180, W: 270 }[name] + (mv?.yawOffsetDeg || 0);
        if (mv) stations.push(['midground ' + name, { x: mv.x, z: mv.z, eye: 1.75, fov: 55, look: { x: mv.x + Math.sin(b * D2R) * 100, y: T.getHeight(mv.x, mv.z) + 2.5, z: mv.z - Math.cos(b * D2R) * 100 } }]);
      }
      let worst = 0;
      for (const [name, r] of stations) {
        if (!r) continue;
        V(r); draw(2);
        const on = callsOf(); PR.group.visible = false; const off = callsOf(); PR.group.visible = true;
        const d = on - off; worst = Math.max(worst, d);
        frames.push({ name, calls: on, without: off, worldProps: d });
      }
      const pass = perOk && worst <= 45;
      return { pass, detail: { perLandmark: per, perOk, frames, worstFrameDraws: worst, bar: 'each <= 3 main + <= 2 casters; <= 45 in any frame' } };
    })()`,
  },

  /* -------------------------------------------------------------- A-site-dispose */
  {
    id: 'A-site-dispose', kind: 'action', lane: LANE, timeout: 150000, settle: 1200,
    title: 'Load / unload every place x3 (the landmark set, the survey marks, the Gauge, the basalt): geometries, textures and collider ids back to baseline each time',
    setup: HOLD,
    assert: `(async () => {${KIT}
      const L = await import('/src/world/sites/landmarks.js');
      const S = await import('/src/world/sites/survey.js');
      const G = await import('/src/world/sites/gauge.js');
      const B = await import('/src/world/sites/basalt.js');
      const C = ctx.collision, mem = renderer.info.memory;
      const g0 = PR.group.parent; const holder = new PR.group.constructor(); holder.name = 'a-site-dispose'; g0.add(holder);
      const look = GP.look?.pansInland; if (look) camAt(look.x, look.y + 1.7, look.z, look.look.x, look.look.y, look.look.z, 55);
      draw(3); await frame(); draw(2);
      const base = { geometries: mem.geometries, textures: mem.textures, colliders: C.count(), ids: C.colliders.length };
      const cycles = [];
      for (let k = 0; k < 3; k++) {
        const lm = new L.Landmarks(ctx, holder), sv = new S.SurveyMarks(ctx, holder), ga = new G.StaticGauge(ctx, holder);
        const org = B.buildOrganShelf(T), cr = B.buildCraterRock(T);
        holder.add(org.mesh, cr.blocks, cr.buttresses);
        await Promise.all([lm.ready, sv.ready, ga.ready]);
        const ids = [];
        for (const d of [...lm.colliders(), ...sv.colliders(), ...ga.colliders(), { kind: 'rock', object: cr.blocks }]) { const id = C.register(d); if (Array.isArray(id)) ids.push(...id); else if (id >= 0) ids.push(id); }
        draw(3);
        const loaded = { geometries: mem.geometries, textures: mem.textures, colliders: C.count() };
        C.unregister(ids);
        lm.dispose(); sv.dispose(); ga.dispose();
        holder.remove(org.mesh, cr.blocks, cr.buttresses);
        org.mesh.geometry.dispose(); org.mesh.material.dispose(); cr.blocks.dispose(); cr.geo.dispose(); cr.bgeo.dispose(); cr.mat.dispose();
        draw(3); await frame(); draw(1);
        const after = { geometries: mem.geometries, textures: mem.textures, colliders: C.count() };
        cycles.push({ loaded, after, registered: ids.length });
      }
      holder.removeFromParent();
      const ok = cycles.every((c) => c.after.geometries <= base.geometries && c.after.textures <= base.textures && c.after.colliders === base.colliders && c.loaded.geometries > base.geometries);
      return { pass: ok, detail: { base, cycles, bar: 'after every unload: geometries, textures and collider count back to the baseline' } };
    })()`,
  },

  /* --------------------------------------------------------------- V34-midground */
  {
    id: 'V34-midground', kind: 'action', lane: LANE, timeout: 120000, settle: 1500,
    title: 'Four yaws from gatePlaces.midgroundVista: every bearing has a landmark silhouette in the 150-300 m band (visible over the terrain, >= 10 px), filmed as a contact sheet',
    setup: HOLD,
    assert: `(async () => {${KIT}
      hideHud(); stillRoster();
      const mv = GP.midgroundVista;
      if (!mv) return { pass: false, detail: 'gatePlaces.midgroundVista missing' };
      setLight(10, 'trade');
      const eye = T.getHeight(mv.x, mv.z) + 1.75;
      const frames = [], labels = [], per = [];
      for (let k = 0; k < 4; k++) {
        const b = k * 90 + (mv.yawOffsetDeg || 0);
        camAt(mv.x, eye, mv.z, mv.x + Math.sin(b * D2R) * 100, eye + 1.5, mv.z - Math.cos(b * D2R) * 100, 55);
        const hits = [];
        for (const l of PR.landmarks) {
          if (!l.height) continue;
          const d = Math.hypot(l.x - mv.x, l.z - mv.z);
          if (d < 150 || d > 300) continue;
          const y0 = l.y ?? T.getHeight(l.x, l.z), y1 = y0 + l.height;
          const a = proj(l.x, y0, l.z), c = proj(l.x, y1, l.z);
          if (!a || !c || a.x < 0 || a.x > W) continue;
          const px = Math.abs(a.y - c.y) * visFrac(l.x, l.z, y0, y1);
          if (px >= 10) hits.push(l.id + ' ' + d.toFixed(0) + 'm ' + px.toFixed(0) + 'px');
        }
        draw(3); frames.push(grab());
        labels.push('bearing ' + ((b % 360 + 360) % 360).toFixed(0) + ': ' + (hits.length ? hits.slice(0, 3).join(', ') : 'NONE'));
        per.push({ bearing: b, landmarks: hits });
      }
      sheet(frames, labels, 2, 'V34 midground vista (' + mv.x.toFixed(0) + ', ' + mv.z.toFixed(0) + '): a landmark in the 150-300 m band on every bearing');
      return { pass: per.every((r) => r.landmarks.length > 0), detail: { station: { x: mv.x, z: mv.z, note: mv.note }, per } };
    })()`,
  },

  /* ----------------------------------------------------------- V-landmark-sheet */
  {
    id: 'V-landmark-sheet', kind: 'visual', lane: LANE, timeout: 150000, settle: 2500,
    reference: 'reference/r5/gates-perf/survey-tripod.jpg (the gimbal/instrument read of the Ring); reference/r5/gates-perf/strata-talus.jpg (bedded rock); reference/r5/brand/os-benchmark-broad-arrow.jpg (survey mark); reference/r5/brand/salinas-de-janubio.jpg (pans, pumps); ext:kevin-nov6-board.jpg@f2694e04#LANDMARKS (form only)',
    title: 'Landmark sheet (W1): the Sounding Ring, the Organ Shelf, a wind pump, a trig pillar, plus the static Gauge and the Roque plug, at 16:30 trade light, each framed at its read distance',
    setup: paint(`
      hideHud(); stillRoster();
      const light = setLight(16.5, 'trade');
      const LS = PR.landmarkSet, R = LS.ring, frames = [], labels = [];
      const shot = (label, x, y, z, lx, ly, lz, fov) => { camAt(x, y, z, lx, ly, lz, fov); draw(4); frames.push(grab()); labels.push(label); };
      // 1 the Ring: from its face side, 70 m out, eye height
      { const fx = Math.sin(R.yaw), fz = Math.cos(R.yaw); const x = R.x + fx * 62 + fz * 18, z = R.z + fz * 62 - fx * 18;
        shot('Sounding Ring (34 m, ' + LS.ring.info.tiltDeg + ' deg off vertical)', x, T.getHeight(x, z) + 1.7, z, R.x, R.y + 14, R.z, 50); }
      // 2 the Organ Shelf: the tallest cluster from its face, 34 m out
      { const cols = PR.organ.columns.filter((c) => c.cluster === 'organ-2'); const cx = cols.reduce((a, c) => a + c.x, 0) / cols.length, cz = cols.reduce((a, c) => a + c.z, 0) / cols.length;
        const b = 285 * D2R, x = cx + Math.sin(b) * 26, z = cz - Math.cos(b) * 26; const gy = T.getHeight(cx, cz);
        shot('Organ Shelf, cluster 2 (columns to 12 m)', x, Math.max(T.getHeight(x, z) + 1.7, gy + 2.5), z, cx, gy + 5, cz, 55); }
      // 3 a wind pump, 20 m out, looking up at the hub
      { const rec = LS.records.find((r) => r.id === 'pump-intake-a'); const x = rec.x + 16, z = rec.z + 10;
        shot('wind pump (9.6 m tower, 6 m rotor)', x, T.getHeight(x, z) + 1.6, z, rec.x, rec.y + 7, rec.z, 50); }
      // 4 trig pillar T1 from its steps side
      { const q = PR.survey.pillars[0]; const x = q.x + q.stepsDir.x * 11 + q.stepsDir.z * 8, z = q.z + q.stepsDir.z * 11 - q.stepsDir.x * 8;
        shot('trig pillar T1 (4 m, three 1 m steps)', x, T.getHeight(x, z) + 1.7, z, q.x, q.y + 2.6, q.z, 50); }
      // 5 the static Gauge at Sluice 3
      { const g = PR.gauge; const x = g.x + 10, z = g.z + 9;
        shot('static Gauge at Sluice 3 (' + g.state + ')', x, T.getHeight(x, z) + 1.7, z, g.x, g.y + 5, g.z, 50); }
      // 6 the Roque plug and needle from the caldera floor
      { const rp = LS.records.find((r) => r.id === 'roque-plug'); const x = rp.x + 110, z = rp.z + 60;
        shot('Roque plug (58 m) + needle (28 m)', x, T.getHeight(x, z) + 1.7, z, rp.x, rp.y + 26, rp.z, 50); }
      sheet(frames, labels, 3, 'V-landmark-sheet  16:30, ' + light);`),
    criteria: 'Bible §8.3-§8.5 and ROUND5-LOOK W-05. PASS when each panel reads as its bible description at a glance: (1) the SOUNDING RING an upright broken ring 34 m across, 15-25 deg off vertical, glazed ceramic panels on bronze flanges with a gimbal inside and a dim core, a broken quadrant whose panels lie in the shingle, sky showing through it; never a closed stone portal, never half-buried; (2) the ORGAN SHELF hexagonal basalt columns in clusters stepping 2-14 m like organ pipes, with joints, chamfered tops and salt on the treads; (3) a WIND PUMP a 9-12 m lattice tower with a 6 m multi-blade rotor and tail vane on a lime-washed cistern; (4) a TRIG PILLAR a white survey drum with three 1 m steps, a vermilion band, the observing pillar and plate, a signal mast; (5) the GAUGE a lighthouse on four long stilts with a float drum, a graduated staff and a sluice nozzle (no head, no eyes); (6) the ROQUE PLUG a fluted, ledged volcanic needle (never a cone, never a smooth pillar). FAIL on flat CG colour, floating or buried footings, z-fighting, a missing panel, or anything on the ROUND5-LOOK §8 never-copy list. Per R54: FAIL if a panel looks cheap next to its reference even when the words pass.',
  },

  /* ------------------------------------------------------ A-look-landmark-scale */
  {
    id: 'A-look-landmark-scale', kind: 'action', lane: LANE, timeout: 150000, settle: 1500,
    title: 'ROUND5-LOOK W-05: the Ring >= 140 px from look.pansInland and >= 120 px from T1; >= 15 % of its box shows background; >= 50 % of its silhouette above the sea line; tilt 15-25 deg; outer diameter 34 +- 0.5 m; the Organ Shelf shows >= 8 distinct column tops from 150 m; pump rotors >= 30 px from the salt field\'s centre; every filmed look frame meets 140/40/40 px over >= 2 thirds',
    setup: HOLD,
    assert: `(async () => {${KIT}
      hideHud(); stillRoster(); setLight(18.75, 'trade');
      const LS = PR.landmarkSet, R = LS.ring, info = R.info || {};
      const ringMesh = LS.meshes['ring-hull'];
      const C = ctx.collision;
      const onRing = (c) => c.node === ringMesh;
      const _d = new V3();
      const read = (eyeX, eyeY, eyeZ) => {
        camAt(eyeX, eyeY, eyeZ, R.x, R.y + 15, R.z, 55);
        // projected box of the ring hull's world-space bounds
        const g = ringMesh.geometry; if (!g.boundingBox) g.computeBoundingBox();
        const bb = g.boundingBox.clone().applyMatrix4(ringMesh.matrixWorld);
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const X of [bb.min.x, bb.max.x]) for (const Y of [bb.min.y, bb.max.y]) for (const Z of [bb.min.z, bb.max.z]) {
          const q = proj(X, Y, Z); if (!q) continue; x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
        }
        // sample the box: ray hits on the ring vs background, and hits above the sea line
        const hz = proj(eyeX + (R.x - eyeX) * 40, 0, eyeZ + (R.z - eyeZ) * 40);     // the sea line along the view
        let hits = 0, n = 0, above = 0, ringTop = 1e9, ringBot = -1e9;
        const N = 36, far = Math.hypot(R.x - eyeX, R.z - eyeZ) + 30;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const sx = x0 + (x1 - x0) * (i + 0.5) / N, sy = y0 + (y1 - y0) * (j + 0.5) / N;
          _d.set(sx / W * 2 - 1, 1 - sy / H * 2, 0.5).unproject(cam).sub(cam.position).normalize();
          n++;
          const h = C.raycast(cam.position.x, cam.position.y, cam.position.z, _d.x, _d.y, _d.z, far, { filter: onRing });
          if (h && h.hit) {
            hits++; ringTop = Math.min(ringTop, sy); ringBot = Math.max(ringBot, sy);
            if (hz && sy < hz.y) above++;
          }
        }
        return { heightPx: +(ringBot - ringTop).toFixed(0), boxPx: [+(x1 - x0).toFixed(0), +(y1 - y0).toFixed(0)], background: +(1 - hits / n).toFixed(3),
          aboveSeaLine: hits ? +(above / hits).toFixed(3) : 0, seaLineY: hz ? +hz.y.toFixed(0) : null };
      };
      const LI = GP.look?.pansInland;
      const fromInland = read(LI.x, LI.y + LI.eye, LI.z);
      const t1 = PR.survey.pillars.find((p) => p.id === 'T1');
      const fromT1 = read(t1.x, t1.deck + 1.6, t1.z);
      // the Organ Shelf from 150 m (toward Saltrow): distinct visible column-top heights (0.25 m bins)
      const cols = PR.organ.columns;
      const sx = cols.reduce((a, c) => a + c.x, 0) / cols.length, sz = cols.reduce((a, c) => a + c.z, 0) / cols.length;
      const salt = GP.landmarks.saltrow; const dl = Math.hypot(salt.x - sx, salt.z - sz);
      const ox = sx + (salt.x - sx) / dl * 150, oz = sz + (salt.z - sz) / dl * 150;
      camAt(ox, T.getHeight(ox, oz) + 1.7, oz, sx, T.getHeight(sx, sz) + 5, sz, 55);
      const bins = new Set();
      for (const c of cols) {
        const q = proj(c.x, c.y1, c.z); if (!q || q.x < 0 || q.x > W || q.y < 0 || q.y > H) continue;
        if (visFrac(c.x, c.z, c.y1 - 0.3, c.y1) < 1) continue;
        bins.add(Math.round((c.y1 - T.getHeight(c.x, c.z)) / 0.25));
      }
      // pump rotors from the salt field's centre
      const fc = GP.__field;
      const rotorPx = LS.records.filter((r) => r.id.startsWith('pump')).map((r) => {
        camAt(fc.x, T.getHeight(fc.x, fc.z) + 1.7, fc.z, r.hub.x, r.hub.y, r.hub.z, 55);
        const a = proj(r.hub.x, r.hub.y - 3, r.hub.z), b = proj(r.hub.x, r.hub.y + 3, r.hub.z);
        return { id: r.id, px: a && b ? +Math.abs(a.y - b.y).toFixed(0) : 0, d: +Math.hypot(r.x - fc.x, r.z - fc.z).toFixed(0) };
      });
      // the 140/40/40 rule on the filmed (non-stub) look frames
      const rule = [];
      for (const [name, r] of Object.entries(GP.look || {})) {
        if (r.stub) continue;
        camAt(r.x, r.y + r.eye, r.z, r.look.x, r.look.y, r.look.z, r.fov || 55);
        const sizes = [];
        for (const l of PR.landmarks) {
          if (!l.height) continue;
          const y0 = l.y ?? T.getHeight(l.x, l.z);
          const a = proj(l.x, y0, l.z), c = proj(l.x, y0 + l.height, l.z);
          if (!a || !c || a.x < 0 || a.x > W) continue;
          const px = Math.abs(a.y - c.y) * visFrac(l.x, l.z, y0, y0 + l.height);
          if (px >= 40) sizes.push({ id: l.id, px: +px.toFixed(0), third: Math.min(2, Math.floor(a.x / (W / 3))) });
        }
        sizes.sort((p, q) => q.px - p.px);
        const thirds = new Set(sizes.map((s) => s.third));
        rule.push({ frame: name, ok: sizes.length >= 3 && sizes[0].px >= 140 && thirds.size >= 2, top: sizes.slice(0, 4) });
      }
      const clauses = {
        inland140: fromInland.heightPx >= 140, t1_120: fromT1.heightPx >= 120, background15: fromInland.background >= 0.15,
        aboveSeaLine50: fromInland.aboveSeaLine >= 0.5, tilt: info.tiltDeg >= 15 && info.tiltDeg <= 25, diameter: Math.abs((info.outerDiameter ?? 0) - 34) <= 0.5,
        organTops8: bins.size >= 8, rotors30: rotorPx.every((r) => r.px >= 30), lookFrames: rule.every((r) => r.ok),
      };
      return { pass: Object.values(clauses).every(Boolean), detail: { clauses, fromInland, fromT1, tiltDeg: info.tiltDeg, outerDiameterM: info.outerDiameter, innerDiameterM: info.innerDiameter,
        organDistinctTops: bins.size, rotorPx, lookFrames: rule, note: 'A-landmark-bearing and A-place-draws are their own rows' } };
    })()`,
  },

  /* ------------------------------------------------------- A-look-sea-skyline */
  {
    id: 'A-look-sea-skyline', kind: 'action', lane: LANE, timeout: 150000, settle: 1500,
    title: 'ROUND5-LOOK W-04: from look.pansSunset and look.title at 18:45 >= 3 stacks >= 24 px, >= 1 in the glitter column darker than it by >= 25 L*, height CV >= 0.25, all >= PLAY_RADIUS + 20 m out with 0 colliders, <= 4 draws + <= 1 caster, foam at every visible foot; the stratovolcano clause is world-ground\'s (L-15)',
    setup: HOLD,
    assert: `(async () => {${KIT}
      hideHud(); stillRoster(); setLight(18.75, 'trade');
      const LS = PR.landmarkSet, ST = LS.stacks || [];
      const X = await import('/src/world/island/extent.js');
      const lstar = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        const Y = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y; };
      const patchL = (buf, cx, cy, rw, rh) => { let s = 0, n = 0; for (let y = Math.max(0, cy - rh); y <= Math.min(H - 1, cy + rh); y++) for (let x = Math.max(0, cx - rw); x <= Math.min(W - 1, cx + rw); x++) { const i = ((H - 1 - y) * W + x) * 4; s += lstar(buf[i], buf[i + 1], buf[i + 2]); n++; } return n ? s / n : 0; };
      const sun = ctx.environment?.sunDir;
      const frames = [], labels = [], out = {};
      for (const name of ['pansSunset', 'title']) {
        const r = GP.look?.[name]; if (!r) continue;
        camAt(r.x, r.y + r.eye, r.z, r.look.x, r.look.y, r.look.z, r.fov || 55);
        draw(4); const buf = grab();
        const sunScr = sun ? proj(cam.position.x + sun.x * 1500, cam.position.y + sun.y * 1500, cam.position.z + sun.z * 1500) : null;
        const rows = [];
        for (const s of ST) {
          const a = proj(s.x, 0, s.z), c = proj(s.x, s.height, s.z);
          if (!a || !c || a.x < 0 || a.x > W) continue;
          const px = Math.abs(a.y - c.y) * visFrac(s.x, s.z, 0.5, s.height);
          if (px < 6) continue;
          const midY = Math.round((a.y + c.y) / 2), ax = Math.round(a.x);
          const body = patchL(buf, ax, midY, 3, Math.max(2, Math.round(px * 0.15)));
          const inColumn = sunScr ? Math.abs(a.x - sunScr.x) < W * 0.06 : false;
          const column = inColumn ? (patchL(buf, ax - Math.round(W * 0.025), midY, 4, 6) + patchL(buf, ax + Math.round(W * 0.025), midY, 4, 6)) / 2 : null;
          const foot = patchL(buf, ax, Math.round(a.y) - 2, Math.max(3, Math.round(px * 0.12)), 2);
          rows.push({ id: s.id, px: +px.toFixed(0), body: +body.toFixed(1), column: column === null ? null : +column.toFixed(1), footL: +foot.toFixed(1), inColumn });
        }
        out[name] = { rows, sunOnScreen: !!(sunScr && sunScr.x >= 0 && sunScr.x <= W) };
        frames.push(buf); labels.push('look.' + name + ' 18:45: ' + rows.filter((q) => q.px >= 24).length + ' stacks >= 24 px');
      }
      sheet(frames, labels, 1, 'A-look-sea-skyline');
      const hs = ST.map((s) => s.height), mean = hs.reduce((a, b) => a + b, 0) / hs.length;
      const cv = Math.sqrt(hs.reduce((a, b) => a + (b - mean) ** 2, 0) / hs.length) / mean;
      const minRange = Math.min(...ST.map((s) => Math.hypot(s.x, s.z)));
      const C = ctx.collision;
      const stackCols = C.colliders.filter((c) => ST.some((s) => Math.hypot((c.minx + c.maxx) / 2 - s.x, (c.minz + c.maxz) / 2 - s.z) < 30)).length;
      let draws = 0, casters = 0; for (const k of ['stack-a', 'stack-b', 'stack-c', 'sea-arch']) { const m = LS.meshes[k]; if (m) { draws++; if (m.castShadow) casters++; } }
      const main = out.pansSunset?.rows || [];
      const clauses = {
        threeStacks24: main.filter((q) => q.px >= 24).length >= 3,
        darkInColumn: main.some((q) => q.inColumn && q.column !== null && q.body <= q.column - 25),
        heightCV: cv >= 0.25, beyondRadius: minRange >= X.PLAY_RADIUS + 20, noColliders: stackCols === 0,
        draws: draws <= 4 && casters <= 1, foam: main.filter((q) => q.px >= 24).every((q) => q.footL >= 75),
      };
      const mine = Object.values(clauses).every(Boolean);
      return { pass: mine ? null : false, detail: { clauses, heightCV: +cv.toFixed(3), minRangeM: +minRange.toFixed(0), bar: 'PLAY_RADIUS + 20 = ' + (X.PLAY_RADIUS + 20), stackColliders: stackCols, draws, casters, frames: out,
        pending: 'stratovolcano 6-9 deg above the sea line drawn in front of the dome: world-ground L-15 / look-post L-10 (not in this tree); the glitter column itself is world-sky W-09' } };
    })()`,
  },

  /* --------------------------------------------------------------- A-look-spires */
  {
    id: 'A-look-spires', kind: 'action', lane: LANE, timeout: 120000, settle: 1500,
    title: 'ROUND5-LOOK W-04: from look.pansInland at 18:45 and 07:00 >= 2 needles (height:base >= 3:1) above the caldera rim line, the plug >= 90 px and the second >= 40 px; <= 40 k tris, <= 3 draws + 2 casters; the +0.45 ms clause is timed on the quiet box',
    setup: HOLD,
    assert: `(async () => {${KIT}
      hideHud(); stillRoster();
      const LS = PR.landmarkSet, r = GP.look?.pansInland;
      const needles = LS.records.filter((q) => q.id.startsWith('roque'));
      const frames = [], labels = [], per = {};
      for (const hour of [18.75, 7.0]) {
        setLight(hour, 'trade');
        camAt(r.x, r.y + r.eye, r.z, r.look.x, r.look.y, r.look.z, r.fov || 55);
        const rows = [];
        for (const nd of needles) {
          const y0 = nd.y, y1 = nd.y + nd.height;
          const a = proj(nd.x, y0, nd.z), c = proj(nd.x, y1, nd.z);
          if (!a || !c) { rows.push({ id: nd.id, onScreen: false }); continue; }
          // the rim line in this screen column: the highest terrain the view ray meets short of the needle
          const dx = nd.x - cam.position.x, dz = nd.z - cam.position.z, dd = Math.hypot(dx, dz);
          let rimY = H;
          for (let t = 20; t < dd + 60; t += 4) { const f = t / dd; const x = cam.position.x + dx * f, z = cam.position.z + dz * f; const q = proj(x, T.getHeight(x, z), z); if (q) rimY = Math.min(rimY, q.y); }
          const vis = visFrac(nd.x, nd.z, y0, y1);
          rows.push({ id: nd.id, px: +(Math.abs(a.y - c.y) * vis).toFixed(0), topY: +c.y.toFixed(0), rimY: +rimY.toFixed(0), aboveRim: c.y < rimY - 4,
            ratio: +(nd.height / (2 * nd.base)).toFixed(2), onScreen: c.x >= 0 && c.x <= W });
        }
        draw(4); frames.push(grab()); labels.push('look.pansInland ' + hour + ' h: ' + rows.map((q) => q.id + ' ' + (q.px ?? '-') + ' px').join(', '));
        per[hour] = rows;
      }
      sheet(frames, labels, 1, 'A-look-spires');
      const mesh = LS.meshes.roques; const tris = mesh ? (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3 : 0;
      const ok = (rows) => {
        const plug = rows.find((q) => q.id === 'roque-plug'), sec = rows.find((q) => q.id === 'roque-needle');
        return !!plug && !!sec && plug.onScreen && sec.onScreen && plug.aboveRim && sec.aboveRim && plug.px >= 90 && sec.px >= 40 && plug.ratio >= 3 && sec.ratio >= 3;
      };
      const clauses = { dusk: ok(per[18.75] || []), morning: ok(per[7] || []), tris: tris <= 40000, draws: !!mesh && mesh.castShadow };
      const mine = Object.values(clauses).every(Boolean);
      return { pass: mine ? null : false, detail: { clauses, per, roquesTris: tris, draws: '1 main + 1 caster (plug + needle merged)', pending: '+0.45 ms: timed by look-post L-16 on the quiet box (A-look-ledger)' } };
    })()`,
  },

  /* ------------------------------------------------------------- A-place-names */
  {
    id: 'A-place-names', kind: 'runner', lane: LANE,
    title: 'Place ids, map labels and place strings of world-props: 0 named lint hits, 0 /spire/i',
    check: async () => {
      const { loadLexicon, matchTexts } = await import(pathToFileURL(path.join(ROOT, 'tools/lint/namecheck.mjs')).href);
      const L = await import(pathToFileURL(path.join(ROOT, 'src/world/sites/layout.js')).href);
      const texts = [];
      const push = (where, t) => texts.push({ where, text: String(t) });
      for (const b of L.BENCHMARKS) { push('benchmark', b.id); push('benchmark', b.name); push('benchmark.region', b.region); }
      for (const s of L.STACKS) { push('stack', s.id); push('stack', s.kind); }
      for (const r of L.ROQUES) push('roque', r.id);
      for (const p of L.PUMPS) push('pump', p.id);
      for (const o of L.ORGAN) push('organ', o.id);
      push('gauge', L.GAUGE.id);
      for (const t of L.TRIG) { push('trig', t.id); push('trig', t.name); }
      // the strings src/world/props.js and src/world/sites/** put on screen or on the map
      const strings = [];
      for (const f of ['src/world/props.js', ...readdirSync(path.join(ROOT, 'src/world/sites')).map((n) => 'src/world/sites/' + n)]) {
        const src = readFileSync(path.join(ROOT, f), 'utf8');
        for (const m of src.matchAll(/(?:name|label|text)\s*:\s*'([^']+)'/g)) { push(f, m[1]); strings.push(m[1]); }
      }
      const hits = matchTexts(loadLexicon(), texts, 'named');
      const spire = texts.filter((t) => /spire/i.test(t.text));
      return { pass: hits.length === 0 && spire.length === 0, detail: { texts: texts.length, hits, spire, strings: strings.length } };
    },
  },

  /* ------------------------------------------------------------- the V-look rows */
  {
    id: 'V-look-ring', kind: 'visual', lane: LANE, timeout: 150000, settle: 2500,
    reference: 'ext:kevin-nov6-board.jpg@f2694e04#2-MC (The Sounding Ring card, form only); ext:kevin-nov6-keyart.jpg@860d7e9f#1-MR; reference/r5/gates-perf/survey-tripod.jpg',
    title: 'The Sounding Ring from look.pansInland and from T1 at 18:45',
    setup: paint(`
      hideHud(); stillRoster(); const light = setLight(18.75, 'trade');
      const frames = [], labels = [];
      const r = GP.look.pansInland; camAt(r.x, r.y + r.eye, r.z, r.look.x, r.look.y, r.look.z, r.fov || 55); draw(4); frames.push(grab()); labels.push('look.pansInland 18:45');
      const t1 = PR.survey.pillars[0], R = PR.landmarkSet.ring; camAt(t1.x, t1.deck + 1.6, t1.z, R.x, R.y + 13, R.z, 46); draw(4); frames.push(grab()); labels.push('from T1\\'s deck 18:45');
      sheet(frames, labels, 1, 'V-look-ring  ' + light);`),
    criteria: 'PASS: an upright broken ring proud of the ground, legible at a glance, sun or sea glow through it, gimbal-and-flange construction readable, larger on screen than the pumps. FAIL: flat or half-buried; a closed stone portal; smaller on screen than the pumps. IP-clause: nothing on the ROUND5-LOOK §8 never-copy list, no eye or glowing heart. R54: FAIL if it reads cheap beside the panel.',
  },
  {
    id: 'V-look-sea-skyline', kind: 'visual', lane: LANE, timeout: 150000, settle: 2500,
    reference: 'ext:kevin-nov6-keyart.jpg@860d7e9f#1-MR; reference/r5/gates-perf/ridge-skyline.jpg',
    title: 'The stacks and the arch from look.pansSunset at 18:45',
    setup: paint(`
      hideHud(); stillRoster(); const light = setLight(18.75, 'trade');
      const r = GP.look.pansSunset; camAt(r.x, r.y + r.eye, r.z, r.look.x, r.look.y, r.look.z, r.fov || 55); draw(4);
      sheet([grab()], ['look.pansSunset 18:45'], 1, 'V-look-sea-skyline  ' + light);`),
    criteria: 'PASS: a staggered chain of stacks at >= 3 distances, backlit on the bright sea, hazed with distance, with surf at their feet. FAIL: an empty sea line; one blob; equal stacks in a row; a stack over the sun disc. The glitter column is world-sky\'s (W-09) and the sister isle world-ground\'s (L-15): name them PENDING if absent. IP-clause.',
  },
  {
    id: 'V-look-spires', kind: 'visual', lane: LANE, timeout: 150000, settle: 2500,
    reference: 'ext:kevin-nov6-board.jpg@f2694e04#2-MC (row 2 right, form only); reference/r5/gates-perf/strata-talus.jpg',
    title: 'The Roque plug and needle above the caldera rim from look.pansInland (18:45) and close from the caldera floor',
    setup: paint(`
      hideHud(); stillRoster(); const light = setLight(18.75, 'trade');
      const frames = [], labels = [];
      const r = GP.look.pansInland; camAt(r.x, r.y + r.eye, r.z, r.look.x, r.look.y, r.look.z, r.fov || 55); draw(4); frames.push(grab()); labels.push('look.pansInland 18:45');
      const rp = PR.landmarkSet.records.find((q) => q.id === 'roque-plug'); const x = rp.x + 95, z = rp.z + 70;
      camAt(x, T.getHeight(x, z) + 1.7, z, rp.x, rp.y + 28, rp.z, 50); draw(4); frames.push(grab()); labels.push('from the caldera floor, 117 m');
      sheet(frames, labels, 1, 'V-look-spires  ' + light);`),
    criteria: 'PASS: a tall fluted needle with ledges standing above the rim line, a second, smaller needle beside it. FAIL: a cone; a smooth pillar; black glass. IP-clause (the panel is form only; never the panel\'s name).',
  },
];

export { GATES };
