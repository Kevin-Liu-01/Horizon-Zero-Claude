/**
 * ROUND 5 — lane `settlements` gates (W1, the NPC half: R56, R57 c; plan §9 settlements). Auto-discovered:
 *
 *   nice -n 10 node tools/gates.mjs --port 5264 --lane settlements
 *
 * Staging: the group `ctx.people` stands on neutral ground near REST (`ctx.people.stagePlace`), because Saltrow and
 * Ninewalls placement stay W2. Rows that name Saltrow in the plan are graded on that group at this wave, and re-staged at W2:
 *   A-npc-fidelity      2 m from a near-tier NPC of each archetype
 *   A-npc-face-delta    pairwise between archetypes of one sex, and against stock
 *   A-npc-variety       the silhouette clauses + the tier caps (the >= 10 archetypes and Saltrow-frame clauses stay W2 PENDING)
 *   A-npc-atlas-resident Pan group -> Holds group -> Pan group (at W2: Saltrow -> Ninewalls -> Saltrow)
 *   A-npc-dispose       spawn/despawn 20 x 3
 *   A96-npc-animated, A97-npc-no-skate   shadow the carried rows (the Round-4 crowd keeps its own system until W2)
 *   A-npc-draws         the staged group of 10, <= 44 draws incl. casters
 *   V-npc-vs-brea (+ one sheet per archetype), V41-npc-closeup, V-npc-builds
 *
 * Settlement-kit rows (A-settlement-*, A61, V35, V40, V45, A95, A97b, A99, A-lookout-call) stay PENDING: W2.
 */
import { placed, placedSetup, PLACES } from './gate-places.mjs';

const REFS = 'reference/r5/gates-perf/portrait-bokeh.jpg';
const IDS = ['salt-raker', 'guild-matron', 'salt-porter', 'boat-caulker', 'lantern-keeper', 'pit-farmer', 'tiller-follower', 'cochineal-picker', 'tube-smith'];

/** Page helpers: the system is up, machines are still, time helpers. */
const READY = `
      const C = __CTX__, E = C.engine, PP = C.people;
      if (!PP) return { pass: false, detail: 'ctx.people is not installed' };
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const frames = async (n) => { for (let i = 0; i < n; i++) await frame(); };
      const simWait = async (s) => { const t0 = E.simTime; let g = 0; while (E.simTime - t0 < s && g < 60000) { await frame(); g++; } return E.simTime - t0; };
      for (const m of (C.machines?.list || [])) m.update = () => {};
      const t00 = performance.now();
      while (!PP.ready && performance.now() - t00 < 120000) await wait(200);
      if (!PP.ready) return { pass: false, detail: 'the staged group never stood (120 s)' };
      const T3 = C.camera.position.constructor;
      const readGlbExtras = async (url) => {
        const b = await (await fetch(url)).arrayBuffer();
        const dv = new DataView(b);
        const len = dv.getUint32(12, true);
        const json = JSON.parse(new TextDecoder().decode(new Uint8Array(b, 20, len)));
        return { extras: json.asset?.extras || {}, bytes: b.byteLength };
      };
`;

/** A sheet canvas + pasted live views (the character-art gate's staging). */
const SHEET = `
      const S = await import('/src/hero/sheets.js');
      const overlay = (w, h) => {
        document.getElementById('sl-sheet')?.remove();
        const c = document.createElement('canvas');
        c.id = 'sl-sheet'; c.width = w; c.height = h;
        c.style.cssText = 'position:fixed;left:0;top:0;width:' + w + 'px;height:' + h + 'px;z-index:2147483646;background:#000';
        document.body.appendChild(c);
        return c;
      };
      const paste = (g, img, x, y, w, h) => { const k = document.createElement('canvas'); k.width = img.width; k.height = img.height; k.getContext('2d').putImageData(img, 0, 0); g.imageSmoothingQuality = 'high'; g.drawImage(k, x, y, w, h); };
      const label = (g, t, x, y) => { g.font = '500 15px "IBM Plex Mono", ui-monospace, Menlo, monospace'; g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x - 6, y - 16, g.measureText(t).width + 12, 22); g.fillStyle = '#efe9dc'; g.fillText(t, x, y); };
      for (const el of Array.from(document.body.children)) if (el.tagName !== 'CANVAS' && !el.querySelector('canvas')) el.style.visibility = 'hidden';
`;

/** Clear the stage, stand Brea and one person side by side on flat ground, same light, in the same facing. */
const SIDE = (archetype) => `
      PP.autoStage = false;
      PP.clearStage();
      const p = C.player, env = C.environment;
      C.input.keys.clear(); C.input.mouse.buttons = 0;
      const pl = PP.stagePlace || PP.findStage();
      p.position.set(pl.x, p.position.y, pl.z); p._snapToGround?.();
      env.timeFrozen = true; env.setTime(11); env.setWeather('clear', 0);
      const sun = env.sunDir;
      const face = Math.atan2(sun.x, sun.z) - 38 * Math.PI / 180;
      for (let i = 0; i < 40; i++) { p.heading = face; await frame(); }
      const fw = [Math.sin(face), Math.cos(face)], rt = [Math.cos(face), -Math.sin(face)];
      const nx = p.position.x - rt[0] * 0.95, nz = p.position.z - rt[1] * 0.95;
      const who = await PP.spawn(${JSON.stringify(archetype)}, { x: nx, z: nz, yaw: face, seed: 7 });
      who.frozen = false;
      who.play('Idle_Loop', { fade: 0 });
      who.showProps(['prop_back', 'prop_hip', 'prop_shoulder'].filter((k) => who.props[k]));
      PP.tierAt(who, 0);
      await simWait(0.9);
      p.hero?.kit?.setHidden(3);
      if (E) E.timeScale = 0;
      await frame();
`;

/** Three views at 2 m, both of them in frame, from the front, 3/4 and profile. */
const SIDE_SHEET = (archetype, name) => `(async () => {${READY}${SHEET}${SIDE(archetype)}
      const W = 1600, H = 900, PW = Math.floor(W / 3);
      const c = overlay(W, H), g = c.getContext('2d');
      const midX = (p.position.x + who.group.position.x) / 2, midZ = (p.position.z + who.group.position.z) / 2, top = Math.max(p.position.y, who.group.position.y);
      const cy = top + 1.28;
      [['FRONT', 0], ['3/4', Math.PI / 5], ['PROFILE', Math.PI / 2]].forEach(([nm, yaw], i) => {
        const dx = Math.sin(face + yaw), dz = Math.cos(face + yaw);
        const img = S.liveView(C, [midX + dx * 2.15, cy + 0.02, midZ + dz * 2.15], [midX, cy, midZ], { width: Math.round(PW * 1.25), height: Math.round(H * 1.25), fov: 32 });
        paste(g, img, i * PW, 0, PW, H);
        label(g, nm, i * PW + 14, 28);
      });
      label(g, 'BREA (her left) + ' + ${JSON.stringify(name)} + ' (her right) · 11 h · 2 m', 14, 56);
    })()`;

const VS_CRITERIA = 'R56, R54. Brea and this near-tier NPC side by side, front, 3/4 and profile at 2 m, same light. Pass: an independent judge cannot tell from detail alone which is the hero: same skin, eye, hair and cloth treatment, same outfit depth. FAIL if the NPC reads a tier below her (flat skin, stock face, single-mesh clothes, no secondary motion). A frame that passes the words and looks cheap is a major finding.';

const ROWS = [
  ['salt-raker', 'SALT RAKER'], ['guild-matron', 'GUILD MATRON'], ['salt-porter', 'SALT PORTER'], ['boat-caulker', 'BOAT-CAULKER'], ['lantern-keeper', 'LANTERN-KEEPER'],
  ['pit-farmer', 'PIT FARMER'], ['tiller-follower', 'TILLER-FOLLOWER'], ['cochineal-picker', 'COCHINEAL PICKER'], ['tube-smith', 'TUBE SMITH'],
];

export const GATES = [
  /* ------------------------------------------------------------------ A-npc-face-delta */
  {
    id: 'A-npc-face-delta', kind: 'action', lane: 'settlements', timeout: 60000, settle: 300,
    title: 'Pairwise between archetypes of one sex, >= 4 mm on >= 4 of the 7 graded face landmarks; no archetype face equals stock (>= 6 mm on >= 3 landmarks)',
    assert: `(async () => {${READY}
      const ids = ${JSON.stringify(IDS)};
      const faces = {};
      for (const id of ids) { const { extras } = await readGlbExtras('/models/npc/' + id + '.glb'); faces[id] = { sex: extras.r5Npc.sex, lm: extras.r5Face.landmarks, graded: extras.r5Face.graded, eye: extras.r5Face.eyeSocketMaxMm }; }
      const graded = faces[ids[0]].graded;
      const rows = [], stock = {};
      let ok = true;
      for (const a of ids) {
        const n = graded.filter((k) => faces[a].lm[k].deltaMm >= 6).length;
        stock[a] = { over6mm: n, deltas: Object.fromEntries(graded.map((k) => [k, faces[a].lm[k].deltaMm])), eyeSocketMaxMm: faces[a].eye };
        if (n < 3) ok = false;
      }
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const A = faces[ids[i]], B = faces[ids[j]];
        if (A.sex !== B.sex) continue;
        const per = graded.map((k) => { const p = A.lm[k].v, q = B.lm[k].v; return +Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]).toFixed(1); });
        const over = per.filter((v) => v >= 4).length;
        rows.push({ pair: ids[i] + ' / ' + ids[j], over4mm: over, per });
        if (over < 4) ok = false;
      }
      return { pass: ok, detail: { graded, pairs: rows, stock } };
    })()`,
  },

  /* ------------------------------------------------------------------ A-npc-fidelity */
  {
    id: 'A-npc-fidelity', kind: 'action', lane: 'settlements', timeout: 300000, settle: 300,
    title: 'R56, near tier of each archetype at 2 m: 15-20 k tris, <= 4 draws; a face field + paint from the face library (not stock); separate hair or headwrap with live dyn_ chains whose tips move the same order as Brea\'s; >= 3 layered outfit pieces with their own normal/ORM; skin 1024² + normal; the tier change at 18 m cross-fades with <= 0.02 m silhouette jump',
    assert: `(async () => {${READY}
      const ids = ${JSON.stringify(IDS)};
      PP.autoStage = false;
      PP.clearStage();
      const pl = PP.stagePlace || PP.findStage();
      const p = C.player;
      C.input.keys.clear(); C.input.mouse.buttons = 0;
      p.position.set(pl.x, p.position.y, pl.z - 2); p._snapToGround?.();
      await frames(4);
      // Brea, walking, as the yardstick: a chain tip's detrended travel per second against the head
      const an = p.animator;
      const tipOf = (b) => { let q = b; while (q.children.find((c) => c.isBone && c.name.startsWith('dyn_'))) q = q.children.find((c) => c.isBone && c.name.startsWith('dyn_')); return q; };
      const heroTip = an?.chainOf?.('hair');
      const heroBone = heroTip ? (heroTip.links ? tipOf(heroTip.links[0].bone) : (heroTip.bone ? tipOf(heroTip.bone) : null)) : null;
      let heroTravel = null;
      if (heroBone) {
        C.input.keys.add('KeyW');
        await simWait(1.2);
        const v = new T3(), h = new T3();
        const samples = [];
        const t0 = E.simTime; while (E.simTime - t0 < 2.5) { heroBone.getWorldPosition(v); an.b.head.bone.getWorldPosition(h); samples.push(v.clone().sub(h).toArray()); await frame(); }
        C.input.keys.clear();
        let mn = [9, 9, 9], mx = [-9, -9, -9]; for (const s of samples) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], s[k]); mx[k] = Math.max(mx[k], s[k]); }
        heroTravel = +Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]).toFixed(3);
        p.position.set(pl.x, p.position.y, pl.z - 2); p._snapToGround?.();
        await frames(4);
      }
      const rows = [];
      let ok = true;
      for (const id of ids) {
        const who = await PP.spawn(id, { x: pl.x, z: pl.z, yaw: 0, seed: 11 });
        PP.tierAt(who, 0);
        await frames(3);
        who.walkTo(pl.x + 40, pl.z + 40);
        await frame();
        const I = who.info();
        const ex = who.entry.extras;
        const near = I.tris;
        const lm = ex.r5Face.landmarks, graded = ex.r5Face.graded;
        const over6 = graded.filter((k) => lm[k].deltaMm >= 6).length;
        const skinM = who.meshes.Skin_L0.material, atlas = who.meshes.Outfit_L0.material;
        const size = (t) => (t?.image ? t.image.width : 0);
        const npc = ex.r5Npc;
        // live chains: the tip's travel against the head over 2.5 s of walking
        await simWait(0.6);
        const chainRows = [];
        const tipsV = {};
        const tick = [];
        const t0 = E.simTime;
        const tips = who.chains.chains.map((c) => ({ key: c.key, tip: c.tip || c.links[c.links.length - 1], min: [9, 9, 9], max: [-9, -9, -9] }));
        const v = new T3(), h = new T3();
        while (E.simTime - t0 < 2.5) {
          who.head.getWorldPosition(h);
          const fw = who.yaw;
          for (const t of tips) { t.tip.getWorldPosition(v); v.sub(h); const x = v.x * Math.cos(fw) - v.z * Math.sin(fw), z = v.x * Math.sin(fw) + v.z * Math.cos(fw); const q = [x, v.y, z]; for (let k = 0; k < 3; k++) { t.min[k] = Math.min(t.min[k], q[k]); t.max[k] = Math.max(t.max[k], q[k]); } }
          await frame();
        }
        for (const t of tips) chainRows.push({ key: t.key, travel: +Math.hypot(t.max[0] - t.min[0], t.max[1] - t.min[1], t.max[2] - t.min[2]).toFixed(3) });
        const best = Math.max(...chainRows.map((c) => c.travel), 0);
        // the head chain itself, on hair or wrap
        const headChain = (npc.chains || []).find((c) => c.parent === 'Head');
        // the tier change: silhouette extents, L0 against L1, same pose, against the camera's plane
        const jump = (() => {
          who.root.updateWorldMatrix(true, true);
          const q = new T3();
          const slice = 0.1, map = [{}, {}];
          const camR = new T3(Math.cos(who.yaw), 0, -Math.sin(who.yaw));
          [who.tierMeshes[0], who.tierMeshes[1]].forEach((list, ti) => {
            for (const m of list) {
              const n = m.geometry.attributes.position.count;
              const stride = Math.max(1, Math.floor(n / 6000));
              for (let i = 0; i < n; i += stride) {
                m.getVertexPosition(i, q); m.localToWorld(q);
                const k = Math.round((q.y - who.group.position.y) / slice);
                const s = q.x * camR.x + q.z * camR.z;
                const e = map[ti][k] || (map[ti][k] = [1e9, -1e9]);
                e[0] = Math.min(e[0], s); e[1] = Math.max(e[1], s);
              }
            }
          });
          let mx = 0;
          for (const k in map[0]) { const a = map[0][k], b = map[1][k]; if (!b) continue; mx = Math.max(mx, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])); }
          return +mx.toFixed(4);
        })();
        // a tier change, watched: both tiers are on through the fade, on complementary dither, and it ends clean
        PP.tierAt(who, 1);
        await frame();
        const during = who.info().draws;
        const fadeMat = who.meshes.Outfit_L1.material;
        const fadeU = fadeMat.userData.npcFade?.value;
        await simWait(0.5);
        const after = who.info();
        PP.tierAt(who, null);
        const clauses = {
          tris: near >= 15000 && near <= 20000, draws: I.draws <= 4, face: over6 >= 3, paint: size(skinM.map) === 1024 && !!skinM.normalMap, hairSeparate: !!who.meshes.Hair_L0,
          chains: !!headChain && best >= 0.02 && (heroTravel == null || best >= heroTravel / 10), layers: npc.layers >= 3 && !!atlas.normalMap && !!atlas.roughnessMap,
          fade: during >= after.draws && after.tier === 1, jump: jump <= 0.02,
        };
        const pass = Object.values(clauses).every(Boolean);
        if (!pass) ok = false;
        rows.push({ id, pass, tris: near, draws: I.draws, tiers: npc.tiers, over6mm: over6, skinMap: size(skinM.map), normalMap: size(skinM.normalMap), layers: npc.layers, procedural: npc.procedural, chains: chainRows, bestTip: best, heroTip: heroTravel, drawsDuringFade: during, fadeUniform: fadeU, drawsAfter: after.draws, silhouetteJumpM: jump, clauses });
        PP.despawn(who);
        await frames(2);
      }
      return { pass: ok, detail: { heroTravelM: heroTravel, rows } };
    })()`,
  },

  /* ------------------------------------------------------------------ A-npc-variety */
  {
    id: 'A-npc-variety', kind: 'action', lane: 'settlements', timeout: 240000, settle: 300,
    title: 'W1 clauses: >= 3 distinct silhouettes (height-normalised mask IoU <= 0.85 pairwise at 10 m), every archetype wears >= 1 procedural faction piece, near tier <= 4 draws and <= 20 k tris, LOD1 <= 2 draws and <= 8 k, LOD2 <= 4 k, only the nearest 4 cast. PENDING W2: >= 10 archetypes (9 at W1, 13 at W4) and >= 8 archetypes in one Saltrow frame',
    assert: `(async () => {${READY}
      const ids = ${JSON.stringify(IDS)};
      PP.autoStage = false;
      PP.clearStage();
      const pl = PP.stagePlace || PP.findStage();
      const masks = {}, tiers = {};
      const q = new T3();
      for (const id of ids) {
        const who = await PP.spawn(id, { x: pl.x, z: pl.z, yaw: 0, seed: 3 });
        PP.tierAt(who, 0);
        who.play('Idle_Loop', { fade: 0 });
        who.showProps(['prop_back', 'prop_hip', 'prop_shoulder'].filter((k) => who.props[k]));
        await simWait(0.5);
        who.root.updateWorldMatrix(true, true);
        // an orthographic raster of the near tier from the front, height-normalised, 64 x 128 (10 m, one view)
        const W = 64, H = 128;
        const img = new Uint8Array(W * H);
        let top = -1e9, base = 1e9;
        for (const m of who.tierMeshes[0]) { const n = m.geometry.attributes.position.count; for (let i = 0; i < n; i += 3) { m.getVertexPosition(i, q); m.localToWorld(q); top = Math.max(top, q.y); base = Math.min(base, q.y); } }
        const hgt = top - base, k = (H - 1) / hgt;
        for (const m of who.tierMeshes[0]) {
          const idx = m.geometry.index, pos = m.geometry.attributes.position;
          const n = idx ? idx.count : pos.count;
          const a = new T3(), b = new T3(), c = new T3();
          const stride = Math.max(3, Math.floor(n / 6000) * 3);
          for (let t = 0; t + 2 < n; t += stride) {
            const ia = idx ? idx.getX(t) : t, ib = idx ? idx.getX(t + 1) : t + 1, ic = idx ? idx.getX(t + 2) : t + 2;
            m.getVertexPosition(ia, a); m.getVertexPosition(ib, b); m.getVertexPosition(ic, c);
            m.localToWorld(a); m.localToWorld(b); m.localToWorld(c);
            const P = [a, b, c].map((v) => [(v.x - pl.x) * k + W / 2, (top - v.y) * k]);
            const x0 = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
            const y0 = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
            const area = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
            if (Math.abs(area) < 1e-6) continue;
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
              const w0 = ((P[1][0] - x - 0.5) * (P[2][1] - y - 0.5) - (P[2][0] - x - 0.5) * (P[1][1] - y - 0.5)) / area;
              const w1 = ((P[2][0] - x - 0.5) * (P[0][1] - y - 0.5) - (P[0][0] - x - 0.5) * (P[2][1] - y - 0.5)) / area;
              if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) img[y * W + x] = 1;
            }
          }
        }
        masks[id] = img;
        const npc = who.entry.extras.r5Npc;
        const count = (list) => list.reduce((s, m) => s + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0);
        tiers[id] = { near: { draws: who.tierMeshes[0].length, tris: count(who.tierMeshes[0]) }, lod1: { draws: who.tierMeshes[1].length, tris: count(who.tierMeshes[1]) }, lod2: { draws: who.tierMeshes[2].length, tris: count(who.tierMeshes[2]) }, procedural: npc.procedural };
        PP.despawn(who);
        await frames(2);
      }
      const iou = (a, b) => { let i = 0, u = 0; for (let k = 0; k < a.length; k++) { const x = a[k], y = b[k]; if (x && y) i++; if (x || y) u++; } return u ? i / u : 1; };
      const pairs = {};
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs[ids[i] + '/' + ids[j]] = +iou(masks[ids[i]], masks[ids[j]]).toFixed(3);
      // the largest set of pairwise-distinct silhouettes (greedy over each starting archetype)
      let bestSet = [];
      for (const start of ids) {
        const set = [start];
        for (const o of ids) { if (o === start) continue; if (set.every((s) => iou(masks[s], masks[o]) <= 0.85)) set.push(o); }
        if (set.length > bestSet.length) bestSet = set;
      }
      const capsOk = Object.values(tiers).every((t) => t.near.draws <= 4 && t.near.tris <= 20000 && t.lod1.draws <= 2 && t.lod1.tris <= 8000 && t.lod2.tris <= 4000 && t.procedural >= 1);
      // only the nearest 4 cast: re-stand the group and read it
      await PP.stage({});
      await frames(6);
      const I = PP.info();
      const casters = I.people.filter((r) => r.casting);
      const dist = I.people.map((r) => r.distance).sort((a, b) => a - b);
      const castOk = casters.length <= 4 && casters.every((r) => r.distance <= dist[3] + 1e-3);
      return { pass: bestSet.length >= 3 && capsOk && castOk, detail: { distinctSilhouettes: bestSet, iou: pairs, tiers, capsOk, casters: casters.map((r) => r.id + '@' + r.distance), castOk, pending: 'W2: >= 10 archetypes; >= 8 archetypes in one Saltrow frame' } };
    })()`,
  },

  /* ------------------------------------------------------------------ A-npc-atlas-resident */
  {
    id: 'A-npc-atlas-resident', kind: 'action', lane: 'settlements', timeout: 180000, settle: 300,
    title: 'Pan group -> Holds group -> Pan group (at W2: Saltrow -> Ninewalls -> Saltrow): <= 4 faction atlases resident at every sample; the atlases of the group left behind are disposed (textures back within +2 of baseline)',
    assert: `(async () => {${READY}
      PP.autoStage = false;
      PP.clearStage();
      await frames(10);
      const mem = () => ({ textures: E.renderer.info.memory.textures, geometries: E.renderer.info.memory.geometries });
      const base = mem();
      const samples = [];
      const sample = (tag) => samples.push({ tag, atlases: PP.bank.residentAtlases(), ...mem(), people: PP.list.length });
      sample('empty');
      for (const f of ['pan', 'holds', 'pan']) {
        await PP.stage({ faction: f });
        await frames(30);
        sample(f + ' stood');
        PP.clearStage();
        await frames(30);
        sample(f + ' left');
      }
      const after = mem();
      const maxAtlases = Math.max(...samples.map((s) => s.atlases.length));
      const empties = samples.filter((s) => / left$/.test(s.tag));
      const backOk = empties.every((s) => s.textures <= base.textures + 2 && s.atlases.length === 0);
      return { pass: maxAtlases <= 4 && backOk, detail: { base, after, maxAtlases, samples } };
    })()`,
  },

  /* ------------------------------------------------------------------ A-npc-dispose */
  {
    id: 'A-npc-dispose', kind: 'action', lane: 'settlements', timeout: 240000, settle: 300,
    title: 'Spawn + despawn 20 NPCs x 3: geometries, textures and skeletons back to baseline',
    assert: `(async () => {${READY}
      PP.autoStage = false;
      PP.clearStage();
      await frames(10);
      const ids = ${JSON.stringify(IDS)};
      const mem = () => ({ textures: E.renderer.info.memory.textures, geometries: E.renderer.info.memory.geometries });
      const countSkel = () => { const s = new Set(); C.scene.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) s.add(o.skeleton); }); return s.size; };
      const base = { ...mem(), skeletons: countSkel() };
      const rows = [];
      const pl = PP.stagePlace || PP.findStage();
      for (let round = 0; round < 3; round++) {
        const made = [];
        for (let i = 0; i < 20; i++) {
          const a = i / 20 * Math.PI * 2;
          made.push(await PP.spawn(ids[i % ids.length], { x: pl.x + Math.cos(a) * 6, z: pl.z + Math.sin(a) * 6, yaw: a, seed: 200 + i }));
          made[i].play('Idle_Loop', { fade: 0 });
        }
        await frames(20);
        const peak = { ...mem(), skeletons: countSkel(), atlases: PP.bank.residentAtlases() };
        for (const p of made) PP.despawn(p);
        await frames(20);
        rows.push({ round, peak, after: { ...mem(), skeletons: countSkel(), atlases: PP.bank.residentAtlases(), archetypes: [...PP.bank.entries.keys()] } });
      }
      const last = rows[rows.length - 1].after;
      const ok = rows.every((r) => r.after.textures <= base.textures && r.after.geometries <= base.geometries && r.after.skeletons <= base.skeletons);
      return { pass: ok, detail: { base, rows, last } };
    })()`,
  },

  /* ------------------------------------------------------------------ A96-npc-animated */
  {
    id: 'A96-npc-animated', kind: 'action', lane: 'settlements', timeout: 300000, settle: 300,
    title: '60 sim s on the staged group: every mixer advances; >= 3 distinct clips per NPC; >= 4 NPCs traverse >= 8 m (shadows the Round-4 row; that crowd keeps its own system until W2)',
    assert: `(async () => {${READY}
      const pl = PP.stagePlace;
      const p = C.player;
      C.input.keys.clear(); C.input.mouse.buttons = 0;
      p.position.set(pl.x, p.position.y, pl.z); p._snapToGround?.();
      for (const q of PP.list) { q.clipCount.clear(); if (q.current) q.clipCount.add(q.current.getClip().name); q.travelled = 0; }
      const clock0 = new Map(PP.list.map((q) => [q, q.mixerClock]));
      const sim = await simWait(60);
      const rows = PP.list.map((q) => ({ id: q.id, clock: +(q.mixerClock - clock0.get(q)).toFixed(1), clips: [...q.clipCount], travelled: +q.travelled.toFixed(2) }));
      const mixersOk = rows.every((r) => r.clock > 40);
      const clipsOk = rows.every((r) => r.clips.length >= 3);
      const walkers = rows.filter((r) => r.travelled >= 8).length;
      return { pass: mixersOk && clipsOk && walkers >= 4 && rows.length >= 10, detail: { sim: +sim.toFixed(1), people: rows.length, mixersOk, clipsOk, walkers, rows } };
    })()`,
  },

  /* ------------------------------------------------------------------ A97-npc-no-skate */
  {
    id: 'A97-npc-no-skate', kind: 'action', lane: 'settlements', timeout: 240000, settle: 300,
    title: 'Planted drift <= 0.08 m on a walking NPC: a foot within 3 cm of its loop\'s low point, its world position over that stance window (shadows the Round-4 row)',
    assert: `(async () => {${READY}
      PP.autoStage = false;
      PP.clearStage();
      await frames(6);
      const pl = PP.stagePlace || PP.findStage();
      const ids = ['salt-raker', 'guild-matron', 'salt-porter', 'lantern-keeper', 'tube-smith', 'cochineal-picker'];
      const rows = [];
      const p = C.player;
      p.position.set(pl.x + 3, p.position.y, pl.z + 12); p._snapToGround?.();
      const v = new T3();
      for (const id of ids) {
        const who = await PP.spawn(id, { x: pl.x - 7, z: pl.z, yaw: Math.PI / 2, seed: 5 });
        PP.tierAt(who, 0);
        who.walkTo(pl.x + 9, pl.z);
        await simWait(1.2);
        const feet = ['ball_l', 'ball_r'].map((n) => ({ n, b: who.bones[n], w: [], cur: null, min: 1e9 }));
        const t0 = E.simTime;
        const trace = [];
        while (E.simTime - t0 < 7 && who.walking) {
          who.root.updateWorldMatrix(true, true);
          for (const f of feet) { f.b.getWorldPosition(v); trace.push(f.n, v.x, v.y, v.z); f.min = Math.min(f.min, v.y); }
          await frame();
        }
        // the stance windows: below min + 3 cm, runs of >= 4 frames, drift = the largest horizontal range in the run
        let worst = 0, windows = 0;
        for (const f of feet) {
          let run = null;
          for (let i = 0; i < trace.length; i += 4) {
            if (trace[i] !== f.n) continue;
            const x = trace[i + 1], y = trace[i + 2], z = trace[i + 3];
            if (y < f.min + 0.03) { if (!run) run = { x0: x, x1: x, z0: z, z1: z, n: 0 }; run.x0 = Math.min(run.x0, x); run.x1 = Math.max(run.x1, x); run.z0 = Math.min(run.z0, z); run.z1 = Math.max(run.z1, z); run.n++; }
            else if (run) { if (run.n >= 4) { windows++; worst = Math.max(worst, Math.hypot(run.x1 - run.x0, run.z1 - run.z0)); } run = null; }
          }
        }
        rows.push({ id, windows, drift: +worst.toFixed(3), travelled: +who.travelled.toFixed(2), speed: +who.speed.toFixed(2) });
        PP.despawn(who);
        await frames(2);
      }
      const ok = rows.every((r) => r.windows >= 4 && r.drift <= 0.08);
      return { pass: ok, detail: { bar: 0.08, rows } };
    })()`,
  },

  /* ------------------------------------------------------------------ A-npc-draws */
  {
    id: 'A-npc-draws', kind: 'action', lane: 'settlements', timeout: 120000, settle: 300,
    title: 'The staged group of 10 (at W2: Saltrow at dusk): NPC owner <= 44 draws incl. casters (R56), counted off the renderer, the shadow pass and the main pass apart',
    assert: `(async () => {${READY}
      const p = C.player, pl = PP.stagePlace;
      C.input.keys.clear(); C.input.mouse.buttons = 0;
      p.position.set(pl.x, p.position.y, pl.z); p._snapToGround?.();
      if (PP.list.length !== 10) return { pass: false, detail: 'expected the group of 10, got ' + PP.list.length };
      await simWait(1.5);
      const R = E.renderer;
      const real = R.renderBufferDirect;
      const count = { main: 0, shadow: 0, frames: 0, perFrame: [] };
      let cur = 0;
      const isOurs = (o) => { let n = o; while (n) { if (n === PP.group) return true; n = n.parent; } return false; };
      R.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
        if (object && isOurs(object)) {
          if (material === PP.bank.casterMat) { /* the proxy's skipped main pass: no GL draw reaches the driver */ }
          else if (/Depth|Distance/.test(material.type)) { count.shadow++; cur++; }
          else { count.main++; cur++; }
        }
        return real.call(this, camera, scene, geometry, material, object, group);
      };
      const per = [];
      for (let i = 0; i < 12; i++) { cur = 0; await frame(); per.push(cur); }
      R.renderBufferDirect = real;
      const I = PP.info();
      return { pass: Math.max(...per) <= 44, detail: { perFrame: per, max: Math.max(...per), bar: 44, mainPerFrame: +(count.main / 12).toFixed(1), shadowPerFrame: +(count.shadow / 12).toFixed(1), casters: I.casters, people: I.people.map((r) => r.id + ' tier ' + r.tier + ' @' + r.distance + ' ' + r.draws + ' draws ' + r.tris + ' tris') } };
    })()`,
  },

  /* ------------------------------------------------------------------ V-npc-* */
  ...ROWS.map(([id, name]) => ({
    id: `V-npc-vs-brea-${id}`, kind: 'visual', lane: 'settlements', settle: 700, timeout: 120000,
    title: `Brea and the ${name.toLowerCase()}, side by side at 2 m, front, 3/4, profile, same light (R56), 1600 x 900`,
    reference: REFS,
    setup: SIDE_SHEET(id, name),
    criteria: VS_CRITERIA,
  })),
  {
    id: 'V-npc-vs-brea', kind: 'visual', lane: 'settlements', settle: 700, timeout: 240000,
    title: 'All nine archetypes in one sheet at 1600 x 900, in full, front and 3/4, staged in the same light: a line-up beside Brea',
    reference: REFS,
    setup: `(async () => {${READY}${SHEET}
      PP.autoStage = false;
      PP.clearStage();
      const p = C.player, env = C.environment;
      C.input.keys.clear(); C.input.mouse.buttons = 0;
      const pl = PP.stagePlace || PP.findStage();
      p.position.set(pl.x, p.position.y, pl.z); p._snapToGround?.();
      env.timeFrozen = true; env.setTime(11); env.setWeather('clear', 0);
      const sun = env.sunDir;
      const face = Math.atan2(sun.x, sun.z) - 25 * Math.PI / 180;
      for (let i = 0; i < 40; i++) { p.heading = face; await frame(); }
      const rt = [Math.cos(face), -Math.sin(face)], fw = [Math.sin(face), Math.cos(face)];
      const ids = ${JSON.stringify(IDS)};
      const ppl = [];
      for (let i = 0; i < ids.length; i++) {
        const s = (i + 1) * 0.86;
        const who = await PP.spawn(ids[i], { x: p.position.x - rt[0] * s, z: p.position.z - rt[1] * s, yaw: face, seed: 7 + i });
        who.play('Idle_Loop', { fade: 0 });
        who.showProps(['prop_back', 'prop_hip', 'prop_shoulder'].filter((k) => who.props[k]));
        PP.tierAt(who, 0);
        ppl.push(who);
      }
      await simWait(0.9);
      p.hero?.kit?.setHidden(3);
      if (E) E.timeScale = 0;
      await frame();
      const c = overlay(1600, 900), g = c.getContext('2d');
      const mx = p.position.x - rt[0] * 4.3, mz = p.position.z - rt[1] * 4.3, y = p.position.y + 0.95;
      const front = S.liveView(C, [mx + fw[0] * 9.2, y + 0.1, mz + fw[1] * 9.2], [mx, y, mz], { width: 2000, height: 562, fov: 13 });
      paste(g, front, 0, 0, 1600, 450);
      const hd = S.liveView(C, [mx + fw[0] * 9.2, y + 0.75, mz + fw[1] * 9.2], [mx, y + 0.72, mz], { width: 2000, height: 562, fov: 6.2 });
      paste(g, hd, 0, 450, 1600, 450);
      label(g, 'BREA, then ARCHETYPES 1-9, left to right · 11 h · 9 m lens', 14, 28);
    })()`,
    criteria: VS_CRITERIA,
  },
  {
    id: 'V41-npc-closeup', kind: 'visual', lane: 'settlements', settle: 700, timeout: 120000,
    title: 'Two bodies walking side by side: three frames across a stride, 1600 x 900',
    reference: 'reference/r5/gates-perf/conversation.jpg',
    setup: `(async () => {${READY}${SHEET}
      PP.autoStage = false;
      PP.clearStage();
      const p = C.player, env = C.environment;
      C.input.keys.clear(); C.input.mouse.buttons = 0;
      const pl = PP.stagePlace || PP.findStage();
      p.position.set(pl.x + 25, p.position.y, pl.z + 25); p._snapToGround?.();
      env.timeFrozen = true; env.setTime(10.5); env.setWeather('clear', 0);
      const a = await PP.spawn('salt-porter', { x: pl.x - 7, z: pl.z - 0.5, yaw: Math.PI / 2, seed: 3 });
      const b = await PP.spawn('cochineal-picker', { x: pl.x - 7, z: pl.z + 0.5, yaw: Math.PI / 2, seed: 4 });
      for (const w of [a, b]) { PP.tierAt(w, 0); w.showProps(['prop_back', 'prop_hip', 'prop_shoulder'].filter((k) => w.props[k])); }
      a.walkTo(pl.x + 12, pl.z - 0.5);
      b.walkTo(pl.x + 12, pl.z + 0.5);
      await simWait(2.6);
      const c = overlay(1600, 900), g = c.getContext('2d');
      const PW = 533;
      for (let i = 0; i < 3; i++) {
        const mx = (a.group.position.x + b.group.position.x) / 2, mz = (a.group.position.z + b.group.position.z) / 2, y = a.group.position.y + 0.92;
        const img = S.liveView(C, [mx + 2.0, y + 0.12, mz + 3.1], [mx, y, mz], { width: 666, height: 1125, fov: 38 });
        paste(g, img, i * PW, 0, PW, 900);
        label(g, 'FRAME ' + (i + 1), i * PW + 14, 28);
        await simWait(0.27);
      }
      a.frozen = true; b.frozen = true;
      if (E) E.timeScale = 0;
    })()`,
    criteria: 'Two bodies walking side by side. Pass: different faces (not the stock face), outfits and builds; natural gait; no T-pose, no skate. R54: a frame that passes the words and looks cheap is a major finding.',
  },
  {
    id: 'V-npc-builds', kind: 'visual', lane: 'settlements', settle: 700, timeout: 120000,
    title: 'The adolescent (uniform 0.90) and an adult of the same body: full height, and the neck, head and shoulders close, 1600 x 900',
    reference: REFS,
    setup: `(async () => {${READY}${SHEET}
      PP.autoStage = false;
      PP.clearStage();
      const p = C.player, env = C.environment;
      C.input.keys.clear(); C.input.mouse.buttons = 0;
      const pl = PP.stagePlace || PP.findStage();
      p.position.set(pl.x + 25, p.position.y, pl.z + 25); p._snapToGround?.();
      env.timeFrozen = true; env.setTime(11); env.setWeather('clear', 0);
      const sun = env.sunDir, face = Math.atan2(sun.x, sun.z) - 25 * Math.PI / 180;
      const rt = [Math.cos(face), -Math.sin(face)], fw = [Math.sin(face), Math.cos(face)];
      const a = await PP.spawn('tiller-follower', { x: pl.x - rt[0] * 0.5, z: pl.z - rt[1] * 0.5, yaw: face, seed: 3 });
      const b = await PP.spawn('pit-farmer', { x: pl.x + rt[0] * 0.5, z: pl.z + rt[1] * 0.5, yaw: face, seed: 4 });
      for (const w of [a, b]) { PP.tierAt(w, 0); w.play('Idle_Loop', { fade: 0 }); w.showProps(['prop_back', 'prop_hip', 'prop_shoulder'].filter((k) => w.props[k])); }
      await simWait(0.9);
      if (E) E.timeScale = 0;
      await frame();
      const y0 = a.group.position.y;
      const c = overlay(1600, 900), g = c.getContext('2d');
      const full = S.liveView(C, [pl.x + fw[0] * 4.4, y0 + 1.0, pl.z + fw[1] * 4.4], [pl.x, y0 + 0.92, pl.z], { width: 666, height: 1125, fov: 30 });
      paste(g, full, 0, 0, 533, 900);
      label(g, 'ADOLESCENT 0.90 + ADULT', 14, 28);
      const close = (w, top, x0, nm) => {
        const px = w.group.position.x, pz = w.group.position.z;
        const img = S.liveView(C, [px + fw[0] * 1.15 + rt[0] * 0.32, y0 + top, pz + fw[1] * 1.15 + rt[1] * 0.32], [px, y0 + top - 0.02, pz], { width: 666, height: 1125, fov: 30 });
        paste(g, img, x0, 0, 533, 900);
        label(g, nm, x0 + 14, 28);
      };
      close(a, 1.42, 533, 'ADOLESCENT: NECK, HEAD, SHOULDERS');
      close(b, 1.58, 1066, 'ADULT');
    })()`,
    criteria: 'Adolescent (uniform 0.90 scale only) and adult variants. Pass: no LBS artefacts at the neck, head or shoulders; the younger read comes from the face (rounder cheeks, shorter nose); otherwise the adolescent variant is cut (fallback text, bible §8.9). R54.',
  },
];
