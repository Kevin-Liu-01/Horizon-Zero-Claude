/**
 * ROUND 5 — lane `character-art` gates (W1; R54, R56, R58, R59; brief: Brea's close-up has to look
 * incredible). Auto-discovered by tools/gates.config.mjs:
 *
 *   nice -n 10 node tools/gates.mjs --port 5266 --lane character-art
 *
 *   V-brea-closeup           day, sun on her left: front, 3/4 and profile on her left, 0.8 m, 1600 x 900, through the LIVE scene
 *   V-brea-closeup-right     day, sun on her right: front, 3/4 and profile on her right
 *   V-brea-closeup-low       08:00, the low sun on her left: front, 3/4 on both sides (fix round 2)
 *   V-brea-closeup-shade     day, sun on her left: 3/4 and profile on her right, the shadow side, and the front
 *   V-brea-closeup-dusk      dusk, her left; V-brea-closeup-dusk-right, dusk, her right
 *   V-brea-closeup-back      day: the back at 0.8 m, back-high from the chase and aim cameras' angle, back 3/4
 *   V-brea-closeup-backlit   the sun behind her: front, 3/4, back (the light that finds every inward-facing surface)
 *   V-brea-closeup-calima    PENDING until world-sky's calima state is on main (R59 b); no stand-in can pass it
 *   V-brea-closeup-detail    the fine marks: eyes + paste, brow + scar, the eye in profile, the ∴; both temples, nose + lips, the ear
 *   V-brea-closeup-detail-back  the sun behind her, still air: the nape from both sides, the knot + tail root, the topknot's crown
 *   V-brea-closeup-night     01:00: the hero fill has fallen away (R59 c)
 *   A-wrap-closed            no see-through: 3 idle phases x (96 head views + 96 collar views, R64 d) on a key colour, 0 enclosed background px
 *   A-brea-fill              R59 c: the hero fill falls away with the scene's ambient at night
 *   A-skin-scatter           LOOK C-01: the skin light (src/hero/skinLook.js) on the close-up's staging, day / backlit / night
 *   A-brea-budget            plan §4.1 Brea row, measured live: <= 10 k tris, <= 2 draws, skin 1024²
 *                            + 512² normal/ORM, hair+wrap <= 512², <= 0.7 MB; and that the look's
 *                            maps are real: alpha-cut hair+wrap, a baked AO, pore-scale normal energy
 *
 * Staging (R59 d): the close-up rows hide only the stowed lance and bow; the alidade cord and the collar stay in frame.
 *
 * References (licence-clean, already staged, never downloaded by this lane):
 * reference/r5/gates-perf/portrait-bokeh.jpg (CC0: form shading on dark skin, real eye and lip
 * depth), reference/r5/character-art/ holds the before/after sheets (project-original).
 */
import { PLACES, placedSetup } from './gate-places.mjs';

/**
 * Hide the page chrome, stop the machines, pose her neutral with the sun on her LEFT front (the side
 * the scar is on and the side the 3/4 and profile are taken from). Then read the face's own frame off
 * the live skin (the idle carries the head a little bowed): `face(k)` is the world position of a
 * recipe landmark, and C / F / R / U the face's centre and axes (R toward her left, F out of the face).
 */
const STAGE = (hour, weather, sunOffDeg, windOff = false) => `
      const C = __CTX__, p = C.player, env = C.environment;
      for (const m of (C.machines?.list || [])) m.update = () => {};
      for (const el of Array.from(document.body.children)) if (el.tagName !== 'CANVAS' && !el.querySelector('canvas')) el.style.visibility = 'hidden';
      C.input.keys.clear(); C.input.mouse.buttons = 0;
      standAt(p, 'openGround');
      env.timeFrozen = true;
      env.setTime(${hour});
      const states = env.weatherStates || [];
      const wanted = ${JSON.stringify(weather)};
      const weatherUsed = states.includes(wanted) ? wanted : (wanted === 'calima' ? 'overcast (world-sky has no calima state yet)' : 'clear');
      env.setWeather(states.includes(wanted) ? wanted : (wanted === 'calima' ? 'overcast' : 'clear'), 0);
      const sun = env.sunDir;
      const h = Math.atan2(sun.x, sun.z) + (${sunOffDeg}) * Math.PI / 180;
      const an = p.animator;
      if (an && an._fidgetK != null) { an._fidgetK = 1; an._fidgetT = 1e6; }
      ${windOff ? 'an.setWind(0, 0, 0, 0);' : ''}
      for (let i = 0; i < ${windOff ? 90 : 40}; i++) { p.heading = h; await new Promise((r) => requestAnimationFrame(r)); }
      if (C.engine) C.engine.timeScale = 0;
      await new Promise((r) => requestAnimationFrame(r));
      const S = await import('/src/hero/sheets.js');
      const T3 = p.position.constructor;
      const head = an.b.head.bone.getWorldPosition(new T3());
      const A = C.assets.models.hero, LM = A.extras.r5Face.landmarks;
      let tpl = null, live = null;
      A.root.traverse((o) => { if (!tpl && o.isSkinnedMesh && o.geometry.getAttribute('_hidemask')) tpl = o; });
      p.model.traverse((o) => { if (!live && o.isSkinnedMesh && o.geometry.getAttribute('_hidemask')) live = o; });
      A.root.updateMatrixWorld(true);
      const lmIdx = {};
      { const v = new T3(), n = tpl.geometry.attributes.position.count;
        for (const k of Object.keys(LM)) { let b = -1, bd = 1e9; const q = LM[k].now; for (let i = 0; i < n; i++) { tpl.getVertexPosition(i, v); const d = (v.x - q[0]) ** 2 + (v.y - q[1]) ** 2 + (v.z - q[2]) ** 2; if (d < bd) { bd = d; b = i; } } lmIdx[k] = b; } }
      const face = (k) => { const v = new T3(); live.getVertexPosition(lmIdx[k], v); return live.localToWorld(v); };
      const brow = face('brow'), chin = face('chin'), jL = face('jawL'), jR = face('jawR'), bridge = face('noseBridge');
      const R0 = jL.clone().sub(jR).normalize(), U0 = brow.clone().sub(chin).normalize();
      const F0 = R0.clone().cross(U0).normalize(), U1 = F0.clone().cross(R0).normalize();
      const view = (yaw, el = 0) => F0.clone().multiplyScalar(Math.cos(yaw) * Math.cos(el)).add(R0.clone().multiplyScalar(Math.sin(yaw) * Math.cos(el))).add(U1.clone().multiplyScalar(Math.sin(el)));
      const overlay = (w, h2) => {
        document.getElementById('ca-sheet')?.remove();
        const c = document.createElement('canvas');
        c.id = 'ca-sheet'; c.width = w; c.height = h2;
        c.style.cssText = 'position:fixed;left:0;top:0;width:' + w + 'px;height:' + h2 + 'px;z-index:2147483646;background:#000';
        document.body.appendChild(c);
        return c;
      };
      const paste = (g, img, x, y, w, h3) => { const k = document.createElement('canvas'); k.width = img.width; k.height = img.height; k.getContext('2d').putImageData(img, 0, 0); g.imageSmoothingQuality = 'high'; g.drawImage(k, x, y, w, h3); };
      const label = (g, t, x, y) => { g.font = '500 15px "IBM Plex Mono", ui-monospace, Menlo, monospace'; g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x - 6, y - 16, g.measureText(t).width + 12, 22); g.fillStyle = '#efe9dc'; g.fillText(t, x, y); };
`;

/**
 * Three angles at 0.8 m, full height, at DPR 1.25 like the game. `views` = [[label, yaw, el]]: yaw 0 is the front, + toward her
 * left, - toward her right, PI the back; el lifts the camera. Only the stowed lance and bow are hidden (R59 d): they cross these
 * lenses; the alidade cord and the collar stay in frame. The mask holds until the next update, so it is set in the same task.
 */
const FRONT = ['FRONT', 0, 0], L34 = ['3/4 HER LEFT', Math.PI / 5, 0], LPROF = ['PROFILE HER LEFT', Math.PI / 2, 0];
const R34 = ['3/4 HER RIGHT', -Math.PI / 5, 0], RPROF = ['PROFILE HER RIGHT', -Math.PI / 2, 0];
const BACK = ['BACK', Math.PI, 0], BACKHIGH = ['BACK-HIGH (chase, aim)', Math.PI * 0.92, 0.42], BACK34 = ['BACK 3/4 HER RIGHT', -Math.PI * 0.76, 0.1];
const CLOSEUP = (name, hour, weather, sunOff, views = [FRONT, L34, LPROF], windOff = false) => `(async () => {${STAGE(hour, weather, sunOff, windOff)}
      const cen = brow.clone().add(chin).multiplyScalar(0.5).add(U1.clone().multiplyScalar(0.022)).sub(F0.clone().multiplyScalar(0.07));
      const W = 1600, H = 900, PW = Math.floor(W / 3);
      const c = overlay(W, H), g = c.getContext('2d');
      const views = ${JSON.stringify(views)};
      p.hero?.kit?.setHidden(3);
      views.forEach(([nm, yaw, el], i) => {
        const d = view(yaw, el);
        const img = S.liveView(C, [cen.x + d.x * 0.8, cen.y + d.y * 0.8, cen.z + d.z * 0.8], [cen.x, cen.y, cen.z], { width: Math.round(PW * 1.25), height: Math.round(H * 1.25), fov: 29 });
        paste(g, img, i * PW, 0, PW, H);
        label(g, nm, i * PW + 14, 28);
      });
      const tag = ${JSON.stringify(name)} + ' · ' + env.time.toFixed(1) + ' h · ' + weatherUsed + ' · 0.8 m';
      label(g, tag, 14, 56);
    })()`;

/**
 * Fix round 3 (LOOK C-02, C-03, C-04 rows): geometry masks off the LIVE skinned skin. `GEOM` defines, inside an assert:
 *   skinLive()            { live, n, P (world xyz per vertex, skinned), Z (_calzone, 0..255 x4), idx }
 *   camOf(pos, tgt, W, H, fov)   the camera S.liveView renders with (same fov, aspect, lookAt)
 *   raster(cam, W, H, G, triOk, front)   a W x H mask of the triangles triOk(a, b, c) accepts (front: facing the lens only)
 *   lin(c), lum(d, o)     sRGB byte -> linear; the linear relative luminance of pixel o of an RGBA array
 *   key(on)               the player alone on a green key (no fog, no sky, nothing else drawn), restored with key(false)
 */
const GEOM = `
      const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      const lum = (d, o) => 0.2126 * lin(d[o]) + 0.7152 * lin(d[o + 1]) + 0.0722 * lin(d[o + 2]);
      const skinLive = () => {
        let live = null; __CTX__.player.model.traverse((o) => { if (!live && o.isSkinnedMesh && o.name === 'Brea_Skin') live = o; });
        const T3 = __CTX__.player.position.constructor, v = new T3(), n = live.geometry.attributes.position.count;
        live.updateMatrixWorld(true);
        const P = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { live.getVertexPosition(i, v); live.localToWorld(v); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; }
        const za = live.geometry.getAttribute('_calzone');
        return { live, n, P, Z: za ? za.array : null, idx: live.geometry.index.array };
      };
      const camOf = (pos, tgt, W, H, fov) => { const c = __CTX__.camera.clone(); c.fov = fov; c.aspect = W / H; c.position.set(...pos); c.lookAt(...tgt); c.updateProjectionMatrix(); c.updateMatrixWorld(); return c; };
      const raster = (cam, W, H, G, triOk, front = true) => {
        const T3 = __CTX__.player.position.constructor, v = new T3(), m = new Uint8Array(W * H);
        const sx = new Float32Array(G.n), sy = new Float32Array(G.n), sz = new Float32Array(G.n);
        for (let i = 0; i < G.n; i++) { v.set(G.P[i * 3], G.P[i * 3 + 1], G.P[i * 3 + 2]).project(cam); sx[i] = (v.x + 1) / 2 * W; sy[i] = (1 - v.y) / 2 * H; sz[i] = v.z; }
        for (let t = 0; t < G.idx.length; t += 3) {
          const a = G.idx[t], b = G.idx[t + 1], c = G.idx[t + 2];
          if (!triOk(a, b, c) || sz[a] > 1 || sz[b] > 1 || sz[c] > 1) continue;
          const area = (sx[b] - sx[a]) * (sy[c] - sy[a]) - (sx[c] - sx[a]) * (sy[b] - sy[a]);
          if (front && area >= 0) continue;
          if (Math.abs(area) < 1e-9) continue;
          const x0 = Math.max(0, Math.floor(Math.min(sx[a], sx[b], sx[c]))), x1 = Math.min(W - 1, Math.ceil(Math.max(sx[a], sx[b], sx[c])));
          const y0 = Math.max(0, Math.floor(Math.min(sy[a], sy[b], sy[c]))), y1 = Math.min(H - 1, Math.ceil(Math.max(sy[a], sy[b], sy[c])));
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const px = x + 0.5, py = y + 0.5;
            const w0 = ((sx[b] - px) * (sy[c] - py) - (sx[c] - px) * (sy[b] - py)) / area, w1 = ((sx[c] - px) * (sy[a] - py) - (sx[a] - px) * (sy[c] - py)) / area;
            if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) m[y * W + x] = 1;
          }
        }
        return m;
      };
      const keyState = { on: false, hidden: [], bg: null, fog: null, cc: null, ca: 1 };
      const key = (on) => {
        const C = __CTX__, scene = C.scene, R = C.renderer;
        if (on && !keyState.on) {
          keyState.hidden = []; for (const o of scene.children) if (o !== C.player.model && !o.isLight && o.visible) { o.visible = false; keyState.hidden.push(o); }
          keyState.bg = scene.background; keyState.fog = scene.fog; scene.background = null; scene.fog = null;
          let colObj = null; C.player.model.traverse((o) => { if (!colObj && o.isMesh && o.material?.color) colObj = o.material.color.clone(); });
          keyState.cc = R.getClearColor(colObj); keyState.ca = R.getClearAlpha();
          R.setClearColor(0x00ff00, 1); keyState.on = true;
        } else if (!on && keyState.on) {
          for (const o of keyState.hidden) o.visible = true;
          scene.background = keyState.bg; scene.fog = keyState.fog; R.setClearColor(keyState.cc, keyState.ca); keyState.on = false;
        }
      };
`;

/** Inside an assert: the face's landmarks on the LIVE skin, `face(k)`, and its frame `frame()` -> { cen, F0, R0, U1, view(yaw, el) }. */
const LMK = `
      const T3 = __CTX__.player.position.constructor, A_ = __CTX__.assets.models.hero, LM_ = A_.extras.r5Face.landmarks;
      let tpl_ = null, live_ = null;
      A_.root.traverse((o) => { if (!tpl_ && o.isSkinnedMesh && o.geometry.getAttribute('_hidemask')) tpl_ = o; });
      __CTX__.player.model.traverse((o) => { if (!live_ && o.isSkinnedMesh && o.geometry.getAttribute('_hidemask')) live_ = o; });
      A_.root.updateMatrixWorld(true);
      const lmI_ = {};
      { const v = new T3(), n = tpl_.geometry.attributes.position.count;
        for (const k of Object.keys(LM_)) { let b = -1, bd = 1e9; const q = LM_[k].now; for (let i = 0; i < n; i++) { tpl_.getVertexPosition(i, v); const d = (v.x - q[0]) ** 2 + (v.y - q[1]) ** 2 + (v.z - q[2]) ** 2; if (d < bd) { bd = d; b = i; } } lmI_[k] = b; } }
      const face = (k) => { const v = new T3(); live_.getVertexPosition(lmI_[k], v); return live_.localToWorld(v); };
      const frame = () => {
        live_.updateMatrixWorld(true);
        const brow = face('brow'), chin = face('chin'), jL = face('jawL'), jR = face('jawR');
        const R0 = jL.clone().sub(jR).normalize(), U0 = brow.clone().sub(chin).normalize();
        const F0 = R0.clone().cross(U0).normalize(), U1 = F0.clone().cross(R0).normalize();
        const cen = brow.clone().add(chin).multiplyScalar(0.5).add(U1.clone().multiplyScalar(0.022)).sub(F0.clone().multiplyScalar(0.07));
        const view = (yaw, el = 0) => F0.clone().multiplyScalar(Math.cos(yaw) * Math.cos(el)).add(R0.clone().multiplyScalar(Math.sin(yaw) * Math.cos(el))).add(U1.clone().multiplyScalar(Math.sin(el)));
        return { cen, F0, R0, U1, view, brow, chin };
      };
      const frames = (n) => new Promise((r) => { let i = 0; const f = () => { if (++i >= n) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
      // relight with the idle FROZEN (fix round 3: A-skin-scatter's staging ran the engine at timeScale 1 for 30 frames per light, so
      // the head pose and the cheek patches moved between runs): the sun and her heading change, the pose does not
      const relight = async (hour, off, weather = 'clear') => {
        const C = __CTX__, env = C.environment, p = C.player;
        env.setTime(hour); env.setWeather(weather, 0);
        const sun = env.sunDir, h = Math.atan2(sun.x, sun.z) + off * Math.PI / 180;
        if (C.engine) C.engine.timeScale = 0;
        p.heading = h; p.model.rotation.y = h;
        await frames(4);
        p.heading = h; p.model.rotation.y = h; p.model.updateMatrixWorld(true);
      };
      const sheetOf = () => {
        document.getElementById('ca-sheet')?.remove();
        for (const el of Array.from(document.body.children)) if (el.tagName !== 'CANVAS' && !el.querySelector('canvas')) el.style.visibility = 'hidden';
        const c = document.createElement('canvas'); c.id = 'ca-sheet'; c.width = 1600; c.height = 900;
        c.style.cssText = 'position:fixed;left:0;top:0;width:1600px;height:900px;z-index:2147483646;background:#000';
        document.body.appendChild(c); return c.getContext('2d');
      };
      const putImg = (g, img, x, y, w, h, sx = 0, sy = 0, sw = img.width, sh = img.height) => { const k = document.createElement('canvas'); k.width = img.width; k.height = img.height; k.getContext('2d').putImageData(img, 0, 0); g.imageSmoothingQuality = 'high'; g.drawImage(k, sx, sy, sw, sh, x, y, w, h); };
      const tag = (g, t, x, y) => { g.font = '500 14px "IBM Plex Mono", ui-monospace, Menlo, monospace'; g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x - 6, y - 15, g.measureText(t).width + 12, 21); g.fillStyle = '#efe9dc'; g.fillText(t, x, y); };
`;

const COMMON = 'Reference: reference/r5/gates-perf/portrait-bokeh.jpg (CC0; the form shading, eye depth and lip structure a real face has). Pass: at 1600 x 900, at 0.8 m, front, 3/4 and profile read as a DESIGNED game heroine next to that reference. The headwrap is wound cloth: overlapping turns with hems and folds, soft woven edges, no paper band, no torn alpha, no blocky edge. No helmet hair: close coils at BOTH temples and the nape with a broken edge; the topknot is wound cloth with a carmine binding. Skin has form (socket, nose wing, under-lip and under-jaw shading), visible grain, no flat or plastic areas, no stubble. The nose is refined in profile, not blunt or oversized; the jaw runs in one line to a defined chin. The eyes are wet and deep: a highlight on the cornea, lid shadow on the ball, lashes. The salt-line is cracked paste with thickness over its whole length, not a flat stripe. The brows are hair, heavy and straight, the left one cut clean through by the scar. There is no hole at the collar: skin runs down inside it. The stowed lance and bow are hidden, nothing else: the alidade cord is graded in frame. FAIL on any of these, and (R54) FAIL if the frame passes the words and still looks cheap next to its reference.';

export const GATES = [
  {
    id: 'A-brea-budget', kind: 'action', lane: 'character-art', timeout: 40000, settle: 800,
    title: 'Plan §4.1, Brea body + head + hair + wrap + eyes, measured live under the default outfit: <= 10 k tris, <= 2 draws, one skeleton, skin 1024² base + 512² normal/ORM, hair+wrap maps <= 512², brea.glb <= 0.7 MB; and the look is real: hair+wrap is alpha-cut with per-vertex shadow (assets.js renders every model FrontSide, so the cloth carries both its faces as geometry), the skin carries a baked AO, its normal map has pore-scale energy on the face',
    assert: `(async () => {
      const C = __CTX__, p = C.player;
      const I = p.hero?.info?.();
      if (!I?.brea) return { pass: false, detail: 'Brea is not the hero' };
      const body = I.meshes.filter((m) => m.part === 'body' && /^Brea_/.test(m.name));
      const tris = body.reduce((s, m) => s + m.tris, 0), draws = body.length;
      let skin = null, wrap = null;
      p.model.traverse((o) => { if (o.isSkinnedMesh && o.name === 'Brea_Skin') skin = o; if (o.isSkinnedMesh && o.name === 'Brea_HairWrap') wrap = o; });
      if (!skin || !wrap) return { pass: false, detail: { missing: { skin: !!skin, wrap: !!wrap }, names: I.meshes.map((m) => m.name) } };
      const size = (t) => (t?.image ? [t.image.width, t.image.height] : null);
      const SM = skin.material, WM = wrap.material;
      const maps = {
        skin: { base: size(SM.map), normal: size(SM.normalMap), orm: size(SM.roughnessMap), ao: size(SM.aoMap) },
        wrap: { base: size(WM.map), normal: size(WM.normalMap), orm: size(WM.roughnessMap) },
      };
      const eq = (a, n) => !!a && a[0] === n && a[1] === n;
      const le = (a, n) => !!a && a[0] <= n && a[1] <= n;
      const mapsOk = eq(maps.skin.base, 1024) && eq(maps.skin.normal, 512) && eq(maps.skin.orm, 512) && eq(maps.skin.ao, 512) && le(maps.wrap.base, 512) && le(maps.wrap.normal, 512) && le(maps.wrap.orm, 512);
      const bytes = (await (await fetch('/models/hero/brea.glb')).arrayBuffer()).byteLength;
      const skels = new Set([skin.skeleton, wrap.skeleton]).size;
      // the skin's normal map, read back: the face's high-frequency energy (mean |n - blur(n)| in the face window)
      const read = (t, x0, y0, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(t.image, -x0, -y0); return g.getImageData(0, 0, w, h).data; };
      const face = read(SM.normalMap, 40, 60, 240, 200);
      let energy = 0, n = 0;
      for (let y = 1; y < 199; y++) for (let x = 1; x < 239; x++) { const i = (y * 240 + x) * 4; const a = face[i], l = face[i - 4], r = face[i + 4], u = face[i - 960], d = face[i + 960]; energy += Math.abs(a - (l + r + u + d) / 4); n++; }
      energy /= n;
      const orm = read(SM.aoMap, 40, 60, 240, 200);
      let aoMin = 255, aoMax = 0;
      for (let i = 0; i < orm.length; i += 4) { aoMin = Math.min(aoMin, orm[i]); aoMax = Math.max(aoMax, orm[i]); }
      const look = { alphaTest: WM.alphaTest, vertexColors: WM.vertexColors === true, wrapHasColor: !!wrap.geometry.attributes.color, normalEnergy: +energy.toFixed(2), aoRange: [aoMin, aoMax] };
      const lookOk = look.alphaTest >= 0.3 && look.vertexColors && look.wrapHasColor && look.normalEnergy >= 0.6 && aoMax - aoMin >= 90;
      const pass = tris <= 10000 && draws <= 2 && skels === 1 && mapsOk && bytes <= 700000 && lookOk;
      return { pass, detail: { tris, draws, meshes: body, skeletons: skels, maps, mapsOk, bytes, look, lookOk } };
    })()`,
  },
  {
    id: 'V-brea-closeup', kind: 'visual', lane: 'character-art', settle: 800, timeout: 90000,
    title: 'Brea at 0.8 m in the live scene, the day light, the sun on her left: front, 3/4 and profile on her left, 1600 x 900',
    reference: 'reference/r5/gates-perf/portrait-bokeh.jpg',
    setup: placedSetup(['openGround'], CLOSEUP('DAY, SUN HER LEFT', 11, 'clear', -38)),
    criteria: COMMON,
  },
  {
    id: 'V-brea-closeup-right', kind: 'visual', lane: 'character-art', settle: 800, timeout: 90000,
    title: 'Brea at 0.8 m in the live scene, the day light, the sun on her right: front, 3/4 and profile on her right, 1600 x 900',
    reference: 'reference/r5/gates-perf/portrait-bokeh.jpg',
    setup: placedSetup(['openGround'], CLOSEUP('DAY, SUN HER RIGHT', 11, 'clear', 38, [FRONT, R34, RPROF])),
    criteria: COMMON + ' Her right temple carries close coils the same as her left. The wrap holds on this side too: no flat lens or zigzag where the turns cross.',
  },
  {
    // fix round 2 (the engineering + film judge's 08:00 frame: smudges at the mouth corners and under the nose in a low sun)
    id: 'V-brea-closeup-low', kind: 'visual', lane: 'character-art', settle: 800, timeout: 90000,
    title: 'Brea at 0.8 m in the live scene, the low morning sun (08:00) on her left: front, 3/4 on her left and on her right, 1600 x 900',
    reference: 'reference/r5/gates-perf/portrait-bokeh.jpg',
    setup: placedSetup(['openGround'], CLOSEUP('LOW SUN, 08:00', 8, 'clear', -38, [FRONT, L34, R34])),
    criteria: COMMON + ' Low sun: the raking light models the cheek, the lips and the lids; nothing round the mouth or under the nose reads as stubble, grime or a smudge, and the skin carries a sheen on the cheekbone, the nose and the lower lip.',
  },
  {
    id: 'V-brea-closeup-shade', kind: 'visual', lane: 'character-art', settle: 800, timeout: 90000,
    title: 'The shadow side at 0.8 m, the day light, the sun on her left: front, 3/4 and profile on her right, 1600 x 900',
    reference: 'reference/r5/gates-perf/portrait-bokeh.jpg',
    setup: placedSetup(['openGround'], CLOSEUP('DAY, HER SHADOW SIDE', 11, 'clear', -38, [FRONT, R34, RPROF])),
    criteria: COMMON + ' The shadow side keeps its form: socket, brow, nose wing, cheek and jaw all read as separate shapes in the shade, none of it a black mask, and her right brow reads as hair.',
  },
  {
    id: 'V-brea-closeup-dusk', kind: 'visual', lane: 'character-art', settle: 800, timeout: 90000,
    title: 'Brea at 0.8 m in the live scene, dusk: front, 3/4 and profile on her left, 1600 x 900',
    reference: 'reference/r5/gates-perf/portrait-bokeh.jpg',
    setup: placedSetup(['openGround'], CLOSEUP('DUSK', 18.4, 'clear', -42)),
    criteria: COMMON + ' Dusk: the warm low key models the face; the shadow side keeps its form and does not go to a black mask.',
  },
  {
    id: 'V-brea-closeup-dusk-right', kind: 'visual', lane: 'character-art', settle: 800, timeout: 90000,
    title: 'Brea at 0.8 m in the live scene, dusk, the key on her left: 3/4 and profile on her right and the back, 1600 x 900',
    reference: 'reference/r5/gates-perf/portrait-bokeh.jpg',
    setup: placedSetup(['openGround'], CLOSEUP('DUSK, HER SHADOW SIDE', 18.4, 'clear', -42, [R34, RPROF, BACK])),
    criteria: COMMON + ' Dusk, away from the key: the form holds in the shade, the wrap stays cloth from behind.',
  },
  {
    id: 'V-brea-closeup-back', kind: 'visual', lane: 'character-art', settle: 800, timeout: 90000,
    title: 'What the player sees: the back of the head at 0.8 m, back-high from the chase and aim cameras\' angle, back 3/4, the day light, still air',
    reference: 'reference/r5/gates-perf/portrait-bokeh.jpg',
    setup: placedSetup(['openGround'], CLOSEUP('DAY, BEHIND HER, STILL AIR', 11, 'clear', 150, [BACK, BACKHIGH, BACK34], true)),
    criteria: 'Pass: from behind and above the wrap is wound cloth, turns lying on turns, nothing see-through and no stepped hems. The topknot\'s crown is gathered radial pleats with no concentric rings or rectangular tone blocks; its carmine binding is seated, no saw-teeth. The wrap knot is a knot and the tail leaves from inside it as a gathered roll, not a square-cut plate standing off it. The nape is close coils with value and a broken outline, not a black shell. FAIL on any of these, and (R54) FAIL if it looks cheap.',
  },
  {
    id: 'V-brea-closeup-backlit', kind: 'visual', lane: 'character-art', settle: 800, timeout: 90000,
    title: 'The sun behind her, the day light, 0.8 m: front, 3/4 on her left, back, 1600 x 900',
    reference: 'reference/r5/gates-perf/portrait-bokeh.jpg',
    setup: placedSetup(['openGround'], CLOSEUP('DAY, BACKLIT', 11, 'clear', 180, [FRONT, L34, BACK])),
    criteria: 'Pass: nothing that faces into the head lights up: no bright spot inside the nostril, no white lines at the mouth corners or the lower lids. The face in its own shade keeps form. FAIL on any of these, and (R54) FAIL if it looks cheap.',
  },
  {
    id: 'V-brea-closeup-night', kind: 'visual', lane: 'character-art', settle: 800, timeout: 90000,
    title: 'Brea at 0.8 m at 01:00, clear: front, 3/4 on her left, profile on her right. R59 c: the hero fill has fallen away with the ambient',
    reference: 'reference/r5/gates-perf/portrait-bokeh.jpg',
    setup: placedSetup(['openGround'], CLOSEUP('NIGHT, 01:00', 1, 'clear', -38, [FRONT, L34, RPROF])),
    criteria: 'Pass: at night she is lit by the night: the face is dark, moonlit and sits in the scene, with no glow of its own; nothing reads as self-lit against the dark ground beside her; the salt-line and the eyes do not float. FAIL if she reads as a lit object pasted on the night.',
  },
  {
    // PENDING, not visual, until world-sky's state lands (R59 b): the row films whatever it finds and says which it is. Once the
    // state exists the frame is real and the judge grades it; until then no stand-in can pass it.
    id: 'V-brea-closeup-calima', kind: 'action', lane: 'character-art', settle: 800, timeout: 90000,
    title: 'Brea at 0.8 m in the live scene, the calima state: front, 3/4 and profile on her left. PENDING until world-sky\'s calima state is on main (R59 b)',
    reference: 'reference/r5/gates-perf/portrait-bokeh.jpg',
    setup: placedSetup(['openGround'], CLOSEUP('CALIMA', 15, 'calima', -30)),
    assert: `(async () => {
      const has = (__CTX__.environment.weatherStates || []).includes('calima');
      return { pass: null, detail: has
        ? 'calima state present: this frame is real and a judge grades it against bible §2 (Calima Ochre fog, coral sun disc, shadow strength 0.45) and: ' + ${JSON.stringify(COMMON)}
        : 'PENDING (R59 b): this tree has no calima state, the frame uses overcast and cannot pass; re-filmed by the merge run when world-sky lands' };
    })()`,
    criteria: COMMON + ' Calima: flat dust light, no hard key; the form comes from the baked shading, and the cloth and skin stay separate in value.',
  },
  {
    id: 'V-brea-closeup-detail', kind: 'visual', lane: 'character-art', settle: 800, timeout: 120000,
    title: 'Brea detail in the day light, still air: eyes + salt paste, brow + scar, both eyes in profile, the ∴ on the right hand; both temples, the nose and lips, the ear',
    reference: 'reference/r5/gates-perf/portrait-bokeh.jpg',
    setup: placedSetup(['openGround'], `(async () => {${STAGE(11, 'clear', -30, true)}
      const W = 1600, H = 900, PW = 400, PH = 450;
      const c = overlay(W, H), g = c.getContext('2d');
      const shot = (i, j, tgt, dist, yaw, fov, lbl, el = 0) => {
        const d = view(yaw, el);
        const img = S.liveView(C, [tgt.x + d.x * dist, tgt.y + d.y * dist, tgt.z + d.z * dist], [tgt.x, tgt.y, tgt.z], { width: Math.round(PW * 1.25), height: Math.round(PH * 1.25), fov });
        paste(g, img, i * PW, j * PH, PW, PH);
        label(g, lbl, i * PW + 14, j * PH + 28);
      };
      const off = (o, r, u, f) => o.clone().add(R0.clone().multiplyScalar(r)).add(U1.clone().multiplyScalar(u)).add(F0.clone().multiplyScalar(f));
      p.hero?.kit?.setHidden(3);
      shot(0, 0, off(bridge, 0.012, -0.012, 0), 0.30, 0.2, 24, 'EYES + SALT PASTE');
      shot(1, 0, off(brow, 0.034, 0.006, -0.01), 0.24, 0.42, 21, 'LEFT BROW + SCAR');
      // fix round 2 (the judge: "refilm the detail sheet with both eyes in profile"): the panel holds both, her left over her right
      const half = (j2, tgt, dist, yaw, fov, lbl) => {
        const d = view(yaw, 0);
        const img = S.liveView(C, [tgt.x + d.x * dist, tgt.y + d.y * dist, tgt.z + d.z * dist], [tgt.x, tgt.y, tgt.z], { width: Math.round(PW * 1.25), height: Math.round(PH / 2 * 1.25), fov });
        paste(g, img, 2 * PW, j2 * PH / 2, PW, PH / 2);
        label(g, lbl, 2 * PW + 14, j2 * PH / 2 + 28);
      };
      // (fix round 2, Nov 12: centred on the eye itself, 2.3 cm under the brow landmark; at 3.3 cm the eye sat at the panel's top edge)
      half(0, off(brow, 0.036, -0.023, -0.018), 0.24, Math.PI / 2, 11, 'HER LEFT EYE IN PROFILE');
      half(1, off(brow, -0.036, -0.023, -0.018), 0.24, -Math.PI / 2, 11, 'HER RIGHT EYE IN PROFILE');
      const hand = an.b.handR.bone.getWorldPosition(new T3()), knk = (an.bones.middle_01_r || an.b.handR.bone).getWorldPosition(new T3());
      const m = hand.clone().lerp(knk, 0.5);
      const fx = Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h);
      // the back of the hand, from outside the right hip, a little in front: the kit hangs across this one lens, so it alone hides all of it
      p.hero?.kit?.setHidden(31);
      const himg = S.liveView(C, [m.x + rx * 0.26 + fx * 0.10, m.y + 0.05, m.z + rz * 0.26 + fz * 0.10], [m.x, m.y, m.z], { width: Math.round(PW * 1.25), height: Math.round(PH * 1.25), fov: 26 });
      p.hero?.kit?.setHidden(3);
      paste(g, himg, 3 * PW, 0, PW, PH);
      label(g, 'RIGHT HAND (∴)', 3 * PW + 14, 28);
      shot(0, 1, off(brow, 0.066, 0.02, -0.055), 0.34, 1.0, 24, 'HEM + TEMPLE, HER LEFT');
      shot(1, 1, off(brow, -0.066, 0.02, -0.055), 0.34, -1.0, 24, 'HEM + TEMPLE, HER RIGHT');
      shot(2, 1, off(bridge, 0, -0.045, 0.0), 0.26, 0.5, 24, 'NOSE + LIPS');
      shot(3, 1, off(chin, 0.075, 0.075, -0.1), 0.26, 1.35, 24, 'THE EAR');
    })()`),
    criteria: 'Pass: the salt paste is a finger-wiped chalky paste with thickness, cracked across its whole length, uneven in width, thinning at its edges; the eye has a wet highlight, a lid shadow, a fibred dark iris and lashes, and in profile (both eyes) it shows an iris and a cornea, a lid with thickness and lashes that are hair, not a slab or a pale wedge; the left brow is cut clean through by a scar with relief; the wrap\'s edges on both sides are soft woven hems with folds, not cuts; both temples are coils with a broken outline, with real value, not a shell; the nostrils are graded dark brown, not black holes, with no pale shard; the ear is rounded, not faceted, a real ear\'s size and height (its top near the brow line, not at the hem), no point; the ∴ is a small fine dark tattoo, three separate dots, not white blobs. FAIL if any of them looks like a flat decal.',
  },
  {
    id: 'V-brea-closeup-detail-back', kind: 'visual', lane: 'character-art', settle: 800, timeout: 120000,
    title: 'The back of the head in detail, the sun behind her, still air: the nape from both sides, the knot and the tail\'s root, the topknot\'s crown and binding',
    reference: 'reference/r5/gates-perf/portrait-bokeh.jpg',
    setup: placedSetup(['openGround'], `(async () => {${STAGE(11, 'clear', 165, true)}
      const W = 1600, H = 900, PW = 800, PH = 450;
      const c = overlay(W, H), g = c.getContext('2d');
      const shot = (i, j, tgt, dist, yaw, fov, lbl, el = 0) => {
        const d = view(yaw, el);
        const img = S.liveView(C, [tgt.x + d.x * dist, tgt.y + d.y * dist, tgt.z + d.z * dist], [tgt.x, tgt.y, tgt.z], { width: Math.round(PW * 1.25), height: Math.round(PH * 1.25), fov });
        paste(g, img, i * PW, j * PH, PW, PH);
        label(g, lbl, i * PW + 14, j * PH + 28);
      };
      const off = (o, r, u, f) => o.clone().add(R0.clone().multiplyScalar(r)).add(U1.clone().multiplyScalar(u)).add(F0.clone().multiplyScalar(f));
      p.hero?.kit?.setHidden(3);
      shot(0, 0, off(chin, -0.02, 0.05, -0.15), 0.42, -Math.PI * 0.8, 24, 'THE NAPE, HER RIGHT, STILL AIR');
      shot(1, 0, off(chin, 0.03, 0.05, -0.15), 0.42, Math.PI * 0.72, 24, 'THE NAPE, HER LEFT, STILL AIR');
      shot(0, 1, off(brow, 0.05, 0.0, -0.205), 0.44, Math.PI * 0.7, 26, 'THE KNOT + TAIL ROOT', 0.15);
      shot(1, 1, off(brow, 0.0, 0.085, -0.17), 0.46, Math.PI * 0.86, 26, 'THE TOPKNOT: CROWN + BINDING', 0.55);
    })()`),
    criteria: 'Pass: the nape is coils with a broken outline, with real value, not a shell; the tail leaves the knot as a gathered roll, not a square-cut plate standing off it; the knot is cloth all round, with no dark hollow; the topknot\'s crown is gathered radial pleats with no rectangular tone blocks; its carmine binding is seated in the cloth with no saw-teeth; its other end is a cloth end with a frayed fringe. FAIL if any of them looks like a flat decal, and (R54) FAIL if it looks cheap.',
  },
  {
    id: 'A-wrap-closed', kind: 'action', lane: 'character-art', settle: 800, timeout: 900000,
    title: 'No see-through (plan §9 "no see-through"; R64 d): only the player drawn on a key colour, still air, the stow kit and both free cloth ends collapsed, at THREE idle phases in the same run (fix round 2: a pinhole that comes and goes with the idle is not closed). Each phase scans two view sets at 0.8 m: the HEAD (24 azimuths x 4 elevations round the face) and the COLLAR (24 azimuths x 4 elevations up to 1.2 rad, centred on neck_01 minus 0.06 m). 0 enclosed background pixels within 300 px of the head\'s centre, and, in the collar views, 0 SEE-THROUGH px within 220 px of the collar: background that a double-sided draw of the player covers (a look through a surface from its back into a hollow; the air between body parts is not a hole) (a speck of coil-card alpha, under 6 px or 3 x 2 px, is hair). Each collar state is drawn twice: a see-through is background in BOTH single-sided frames and covered in the double-sided one (a frame that drops a mesh after the side change is not a hole)',
    setup: placedSetup(['openGround'], `(async () => {${STAGE(11, 'clear', -38, true)}
    })()`),
    assert: `(async () => {
      const C = __CTX__, p = C.player, scene = C.scene, R = C.renderer, an = p.animator;
      const S = await import('/src/hero/sheets.js');
      const T3 = p.position.constructor, A = C.assets.models.hero, LM = A.extras.r5Face.landmarks;
      let tpl = null, live = null, neck = null;
      A.root.traverse((o) => { if (!tpl && o.isSkinnedMesh && o.geometry.getAttribute('_hidemask')) tpl = o; });
      p.model.traverse((o) => { if (!live && o.isSkinnedMesh && o.geometry.getAttribute('_hidemask')) live = o; if (!neck && o.isBone && /^neck_01/.test(o.name)) neck = o; });
      A.root.updateMatrixWorld(true);
      const idxOf = (q) => { const v = new T3(), n = tpl.geometry.attributes.position.count; let b = -1, bd = 1e9; for (let i = 0; i < n; i++) { tpl.getVertexPosition(i, v); const d = (v.x - q[0]) ** 2 + (v.y - q[1]) ** 2 + (v.z - q[2]) ** 2; if (d < bd) { bd = d; b = i; } } return b; };
      const lmI = {}; for (const k of ['brow', 'chin', 'jawL', 'jawR']) lmI[k] = idxOf(LM[k].now);
      const face = (k) => { const v = new T3(); live.getVertexPosition(lmI[k], v); return live.localToWorld(v); };
      const bones = [];
      p.model.traverse((o) => { if (o.isBone && /^dyn_(wrapSash|hairKnotTail)_01$/.test(o.name)) bones.push(o); });
      const frames = (n) => new Promise((r) => { let i = 0; const f = () => { if (++i >= n) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
      const W = 900, H = 900;
      // fix round 2, Nov 12: the KEY colour is the greenest pixel on the frame's border, not the top-left pixel. Looking steeply down
      // (the collar set's 0.8 and 1.2 rad) the bowed head or the shoulder covers that corner, the "key" became a cloth or skin colour,
      // and every pixel of that colour which the double-sided draw lights a little differently counted as a see-through (r1-r6: the
      // 4-7 k px blobs at az 75-105 that the row's own sheet shows as solid smock)
      const keyOf = (px) => {
        let best = -1e9, k = [px[0], px[1], px[2]];
        const at = (i) => { const g = px[i * 4 + 1] - (px[i * 4] + px[i * 4 + 2]) / 2; if (g > best) { best = g; k = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]]; } };
        for (let x = 0; x < W; x += 7) { at(x); at((H - 1) * W + x); }
        for (let y = 0; y < H; y += 7) { at(y * W); at(y * W + W - 1); }
        return k;
      };
      // one view: the enclosed key-colour components within 300 px of (cx, cy)
      const scanView = (pos, tgt, inside) => {
        const img = S.liveView(C, pos.toArray(), tgt.toArray(), { width: W, height: H, fov: 29 });
        const px = img.data;
        const k = keyOf(px);
        const bg = new Uint8Array(W * H), seen = new Uint8Array(W * H);
        for (let i = 0; i < W * H; i++) bg[i] = Math.abs(px[i * 4] - k[0]) < 28 && Math.abs(px[i * 4 + 1] - k[1]) < 28 && Math.abs(px[i * 4 + 2] - k[2]) < 28 ? 1 : 0;
        const st = [];
        const push = (i) => { if (bg[i] && !seen[i]) { seen[i] = 1; st.push(i); } };
        for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
        for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
        while (st.length) { const i = st.pop(), x = i % W, y = (i / W) | 0; if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (y > 0) push(i - W); if (y < H - 1) push(i + W); }
        const comps = [];
        for (let i = 0; i < W * H; i++) if (bg[i] && !seen[i]) {
          let area = 0, sx = 0, sy = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1; const s2 = [i]; seen[i] = 1;
          while (s2.length) { const j = s2.pop(); area++; const x = j % W, y = (j / W) | 0; sx += x; sy += y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
            for (const q of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, y > 0 ? j - W : -1, y < H - 1 ? j + W : -1]) if (q >= 0 && bg[q] && !seen[q]) { seen[q] = 1; s2.push(q); } }
          comps.push({ area, w: x1 - x0 + 1, h: y1 - y0 + 1, x: Math.round(sx / area), y: Math.round(sy / area) });
        }
        return comps.filter((c) => c.area >= 6 && c.w >= 3 && c.h >= 2 && inside(c)).sort((a, b) => b.area - a.area);
      };
      // the collar views count a background pixel only when it is a SEE-THROUGH: background with the player drawn as it is, but covered
      // when every player material is drawn double-sided. That is a look through a surface from its back, into a hollow (the smock's
      // single-sided inner collar seen past the neck, the gap down the collar past a bowed head), never the air between body parts. A
      // radius round the collar, and then a convex outline of it, counted the air between her arm and her side, and beside the bowed
      // head, as holes (r3, r5: 15-18 k px components enclosed by the arm, the torso and the head)
      const mats = [];
      p.model.traverse((o) => { if (o.isMesh && o.material) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (!mats.includes(m)) mats.push(m); });
      const sides0 = mats.map((m) => m.side);
      const setDouble = (on) => { mats.forEach((m, i) => { const want = on ? 2 : sides0[i]; if (m.side !== want) { m.side = want; m.needsUpdate = true; } }); };
      // fix round 2, Nov 12: each state is drawn TWICE and a pixel is a see-through only when BOTH single-sided frames show background there
      // and the second double-sided frame covers it, so a frame drawn right after the side change can never invent a hole; with the key
      // colour read off the border (keyOf) every real see-through still counts
      const seeThrough = (pos, tgt) => {
        const opt = { width: W, height: H, fov: 29 };
        const a0 = S.liveView(C, pos.toArray(), tgt.toArray(), opt).data;
        const a = S.liveView(C, pos.toArray(), tgt.toArray(), opt).data;
        const k = keyOf(a);
        setDouble(true);
        let b;
        try { S.liveView(C, pos.toArray(), tgt.toArray(), opt); b = S.liveView(C, pos.toArray(), tgt.toArray(), opt).data; } finally { setDouble(false); }
        const isBg = (d, i) => Math.abs(d[i * 4] - k[0]) < 28 && Math.abs(d[i * 4 + 1] - k[1]) < 28 && Math.abs(d[i * 4 + 2] - k[2]) < 28;
        const mark = new Uint8Array(W * H);
        for (let i = 0; i < W * H; i++) if (isBg(a, i) && isBg(a0, i) && !isBg(b, i)) mark[i] = 1;
        const seen = new Uint8Array(W * H), comps = [];
        for (let i = 0; i < W * H; i++) if (mark[i] && !seen[i]) {
          let area = 0, sx = 0, sy = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1; const s2 = [i]; seen[i] = 1;
          while (s2.length) { const j = s2.pop(); area++; const x = j % W, y = (j / W) | 0; sx += x; sy += y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
            for (const q of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, y > 0 ? j - W : -1, y < H - 1 ? j + W : -1]) if (q >= 0 && mark[q] && !seen[q]) { seen[q] = 1; s2.push(q); } }
          comps.push({ area, w: x1 - x0 + 1, h: y1 - y0 + 1, x: Math.round(sx / area), y: Math.round(sy / area) });
        }
        // the collar's neighbourhood: 220 px (10 cm at 0.8 m) round the view's centre; the armholes and the hem are the outfit's own
        return comps.filter((c) => c.area >= 6 && c.w >= 3 && c.h >= 2 && Math.hypot(c.x - W / 2, c.y - H / 2) < 220).sort((x, y) => y.area - x.area);
      };
      // freeze the scene to the player on the key colour (restored at the end)
      const hidden = [];
      for (const o of scene.children) if (o !== p.model && !o.isLight && o.visible) { o.visible = false; hidden.push(o); }
      const bg0 = scene.background, fog0 = scene.fog; scene.background = null; scene.fog = null;
      const cc = R.getClearColor(live.material.color.clone()), ca = R.getClearAlpha();
      R.setClearColor(0x00ff00, 1);
      const res = [], phases = [];
      // three idle phases: now, then the idle run on 1.3 s and 2.9 s further (the engine clock runs only between phases)
      for (const [ph, adv] of [[0, 0], [1, 78], [2, 96]]) {
        if (adv) {
          // the world runs between phases exactly as it was (its fog, sky and objects back), so nothing it updates finds them gone
          for (const b of bones) b.scale.setScalar(1);
          for (const o of hidden) o.visible = true;
          scene.background = bg0; scene.fog = fog0; R.setClearColor(cc, ca);
          if (C.engine) C.engine.timeScale = 1; await frames(adv); if (C.engine) C.engine.timeScale = 0; await frames(2);
          for (const o of hidden) o.visible = false;
          scene.background = null; scene.fog = null; R.setClearColor(0x00ff00, 1);
        }
        // the stow kit hidden and the free cloth ends collapsed to their roots (what hangs behind the neck encloses real background, which is
        // not a hole), then the face's and the collar's frames read off the live pose
        const stage = () => {
          p.hero?.kit?.setHidden(31);
          for (const b of bones) b.scale.setScalar(1e-4);
          p.model.updateMatrixWorld(true);
          const brow = face('brow'), chin = face('chin'), jL = face('jawL'), jR = face('jawR');
          const R0 = jL.clone().sub(jR).normalize(), U0 = brow.clone().sub(chin).normalize();
          const F0 = R0.clone().cross(U0).normalize(), U1 = F0.clone().cross(R0).normalize();
          const cen = brow.clone().add(chin).multiplyScalar(0.5).add(U1.clone().multiplyScalar(0.05)).sub(F0.clone().multiplyScalar(0.07));
          // the collar: neck_01 less 6 cm, orbited in the body's own level frame
          const nk = neck.getWorldPosition(new T3()), col = nk.clone(); col.y -= 0.06;
          const Up = new T3(0, 1, 0), Fh = F0.clone(); Fh.y = 0; Fh.normalize(); const Rh = Up.clone().cross(Fh).normalize();
          return { cen, F0, R0, U1, col, Fh, Rh, Up };
        };
        let st = stage();
        // fix round 2, Nov 12: both material states are drawn once at the scan's own render-target type before each phase, with frames
        // between; then the kit and the cloth ends are staged again (the frames run the hero rig, which shows the kit and lets them hang)
        for (let w = 0; w < 3; w++) {
          for (const dbl of [false, true]) { setDouble(dbl); S.liveView(C, [st.col.x + 0.3, st.col.y + 0.5, st.col.z + 0.6], st.col.toArray(), { width: 64, height: 64, fov: 29 }); S.liveView(C, [st.cen.x, st.cen.y, st.cen.z + 0.8], st.cen.toArray(), { width: 64, height: 64, fov: 29 }); }
          setDouble(false);
          // (the world runs its frames with its fog and sky back: Environment.update reads them)
          scene.background = bg0; scene.fog = fog0;
          await frames(12);
          scene.background = null; scene.fog = null; R.setClearColor(0x00ff00, 1);
        }
        st = stage();
        const { cen, F0, R0, U1, col, Fh, Rh, Up } = st;
        phases.push({ phase: ph, head: cen.toArray().map((v) => +v.toFixed(3)), collar: col.toArray().map((v) => +v.toFixed(3)) });
        const sets = [['head', cen, F0, R0, U1, [-0.35, 0, 0.35, 0.8]], ['collar', col, Fh, Rh, Up, [0, 0.4, 0.8, 1.2]]];
        for (const [region, c0, Fv, Rv, Uv, els] of sets) for (const el of els) for (let az = 0; az < 360; az += 15) {
          const yaw = az * Math.PI / 180;
          const d = Fv.clone().multiplyScalar(Math.cos(yaw) * Math.cos(el)).add(Rv.clone().multiplyScalar(Math.sin(yaw) * Math.cos(el))).add(Uv.clone().multiplyScalar(Math.sin(el)));
          const pos = c0.clone().add(d.multiplyScalar(0.8));
          const near = region === 'collar' ? seeThrough(pos, c0) : scanView(pos, c0, (c) => Math.hypot(c.x - 450, c.y - 400) < 300);
          res.push({ phase: ph, region, az, el, area: near.reduce((s, c) => s + c.area, 0), top: near.slice(0, 2), pos: pos.toArray(), tgt: c0.toArray(), cx: 450, cy: region === 'head' ? 400 : 450 });
        }
      }
      const total = res.reduce((s, r) => s + r.area, 0);
      const by = (k) => { const o = {}; for (const r of res) { const key = r[k]; o[key] = o[key] || { views: 0, withHoles: 0, px: 0 }; o[key].views++; if (r.area) { o[key].withHoles++; o[key].px += r.area; } } return o; };
      // the row's shot: the four worst views on the key colour, 2x round their largest hole (or the centre, if clean)
      res.sort((a, b) => b.area - a.area);
      for (const o of Array.from(document.body.children)) if (o.tagName !== 'CANVAS' && !o.querySelector('canvas')) o.style.visibility = 'hidden';
      const sheet = document.createElement('canvas'); sheet.width = 1600; sheet.height = 900;
      sheet.style.cssText = 'position:fixed;left:0;top:0;width:1600px;height:900px;z-index:2147483646;background:#000';
      document.body.appendChild(sheet);
      const g = sheet.getContext('2d');
      const worst = res.filter((r) => r.region === 'head').slice(0, 2).concat(res.filter((r) => r.region === 'collar').slice(0, 2));
      worst.forEach((r, i) => {
        const img = S.liveView(C, r.pos, r.tgt, { width: W, height: H, fov: 29 });
        const k = document.createElement('canvas'); k.width = W; k.height = H; k.getContext('2d').putImageData(img, 0, 0);
        const t = r.top[0] || { x: r.cx, y: r.cy };
        const cw = 400, ch = 225, sx = Math.max(0, Math.min(W - cw, t.x - cw / 2)), sy = Math.max(0, Math.min(H - ch, t.y - ch / 2));
        const x = (i % 2) * 800, y = (i >> 1) * 450;
        g.imageSmoothingEnabled = false; g.drawImage(k, sx, sy, cw, ch, x, y, 800, 450);
        const lb = r.region + ' · phase ' + r.phase + ' · az ' + r.az + ' el ' + r.el + ' · 2x · enclosed px ' + r.area;
        g.font = '500 15px "IBM Plex Mono", ui-monospace, Menlo, monospace'; g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(x + 8, y + 8, g.measureText(lb).width + 12, 22); g.fillStyle = '#fff'; g.fillText(lb, x + 14, y + 24);
      });
      setDouble(false);
      R.setClearColor(cc, ca);
      for (const o of hidden) o.visible = true;
      scene.background = bg0; scene.fog = fog0;
      for (const b of bones) b.scale.setScalar(1);
      p.model.updateMatrixWorld(true);
      const pass = total === 0;
      const strip = ({ pos, tgt, ...r }) => r;
      return { pass, detail: { views: res.length, totalPx: total, byPhase: by('phase'), byRegion: by('region'), phases, worstHead: res.filter((r) => r.region === 'head' && r.area).slice(0, 6).map(strip), worstCollar: res.filter((r) => r.region === 'collar' && r.area).slice(0, 6).map(strip) } };
    })()`,
  },
  {
    // fix round 2, Nov 12, ROUND5-LOOK C-01: the skin's own light (src/hero/skinLook.js) measured on the close-up's own staging
    id: 'A-skin-scatter', kind: 'action', lane: 'character-art', settle: 800, timeout: 240000,
    title: 'LOOK C-01 skin light (src/hero/skinLook.js): front close-up at 0.8 m, the idle frozen at the staged instant (fix round 3), 9 x 9 px patches at the projected face landmarks (linear relative luminance of the displayed frame). (a) DAY 11:00: shadow cheek 0.022-0.060; (b) lit:shadow 3.5-5.5; (c) the 80 -> 20 % fall where the terminator runs with no cast shadow across it (the forehead, 1.2 cm over the brow, 5 cm either side) spans >= 10 % of the face\'s width; (d) shadow-cheek warmth (R-B)/(R+G+B) >= 0.40; (e) BACKLIT 18:45, the 3/4 on her left: the brightest patch on her left ear\'s rim >= 1.5 x the shadow cheek, and < 1.15 x with the transmission term off (negative control); (f) NIGHT 01:00: shadow cheek <= 0.010; (g) the live skin carries userData.calSkin === 1, Brea\'s draws and texture sizes are unchanged',
    setup: placedSetup(['openGround'], `(async () => {${STAGE(11, 'clear', -38, true)}
    })()`),
    assert: `(async () => {
      const C = __CTX__, p = C.player, env = C.environment, an = p.animator;
      const S = await import('/src/hero/sheets.js');
      const T3 = p.position.constructor, A = C.assets.models.hero, LM = A.extras.r5Face.landmarks;
      let tpl = null, live = null;
      A.root.traverse((o) => { if (!tpl && o.isSkinnedMesh && o.geometry.getAttribute('_hidemask')) tpl = o; });
      p.model.traverse((o) => { if (!live && o.isSkinnedMesh && o.geometry.getAttribute('_hidemask')) live = o; });
      A.root.updateMatrixWorld(true);
      const idxOf = (q) => { const v = new T3(), n = tpl.geometry.attributes.position.count; let b = -1, bd = 1e9; for (let i = 0; i < n; i++) { tpl.getVertexPosition(i, v); const d = (v.x - q[0]) ** 2 + (v.y - q[1]) ** 2 + (v.z - q[2]) ** 2; if (d < bd) { bd = d; b = i; } } return b; };
      const lmI = {}; for (const k of ['brow', 'chin', 'jawL', 'jawR', 'cheekL', 'cheekR', 'noseTip']) lmI[k] = idxOf(LM[k].now);
      // the left ear's helix: the bind vertex furthest out and up on the reshaped ear (lib/skin-human.mjs EAR)
      const at = (i) => { const v = new T3(); live.getVertexPosition(i, v); return live.localToWorld(v); };
      const face = (k) => at(lmI[k]);
      const frames = (n) => new Promise((r) => { let i = 0; const f = () => { if (++i >= n) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
      const relight = async (hour, off) => {
        env.setTime(hour); env.setWeather('clear', 0);
        const sun = env.sunDir, h = Math.atan2(sun.x, sun.z) + off * Math.PI / 180;
        // fix round 3 (the judge: "the staging runs the engine at timeScale 1 for 30 frames with the idle live, so the head pose and the
        // cheek patches move between runs"): the idle stays FROZEN at the staged instant; only the sun and her heading change
        if (C.engine) C.engine.timeScale = 0;
        p.heading = h; p.model.rotation.y = h;
        await frames(4);
        p.heading = h; p.model.rotation.y = h;
        p.model.updateMatrixWorld(true);
      };
      const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      const W = 666, H = 1125;
      const shoot = (yaw) => {
        const brow = face('brow'), chin = face('chin'), jL = face('jawL'), jR = face('jawR');
        const R0 = jL.clone().sub(jR).normalize(), U0 = brow.clone().sub(chin).normalize();
        const F0 = R0.clone().cross(U0).normalize(), U1 = F0.clone().cross(R0).normalize();
        const cen = brow.clone().add(chin).multiplyScalar(0.5).add(U1.clone().multiplyScalar(0.022)).sub(F0.clone().multiplyScalar(0.07));
        const d = F0.clone().multiplyScalar(Math.cos(yaw)).add(R0.clone().multiplyScalar(Math.sin(yaw)));
        const pos = cen.clone().add(d.multiplyScalar(0.8));
        p.hero?.kit?.setHidden(3);
        const img = S.liveView(C, pos.toArray(), cen.toArray(), { width: W, height: H, fov: 29 });
        const cam = C.camera.clone(); cam.fov = 29; cam.aspect = W / H; cam.position.copy(pos); cam.lookAt(cen); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
        const proj = (w) => { const v = w.clone().project(cam); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; };
        const patch = ([x, y], r = 4) => { let L = 0, R = 0, G = 0, B = 0, n = 0; for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const X = Math.round(x) + i, Y = Math.round(y) + j; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const o = (Y * W + X) * 4; const r1 = lin(img.data[o]), g1 = lin(img.data[o + 1]), b1 = lin(img.data[o + 2]); R += r1; G += g1; B += b1; L += 0.2126 * r1 + 0.7152 * g1 + 0.0722 * b1; n++; } return { L: L / n, R: R / n, G: G / n, B: B / n }; };
        const lumAt = (x, y) => { let L = 0, n = 0; for (let j = -3; j <= 3; j++) { const X = Math.round(x), Y = Math.round(y) + j; const o = (Y * W + X) * 4; L += 0.2126 * lin(img.data[o]) + 0.7152 * lin(img.data[o + 1]) + 0.0722 * lin(img.data[o + 2]); n++; } return L / n; };
        return { img, proj, patch, lumAt };
      };
      const r3 = (v) => +v.toFixed(4);
      const skinMat = live.material;
      const U = skinMat.userData?.calSkinU || null;
      const out = {};
      // DAY 11:00, the sun on her left front (the close-up's staging)
      await relight(11, -38);
      { const s = shoot(0);
        const cL = s.proj(face('cheekL')), cR = s.proj(face('cheekR'));
        const a = s.patch(cL), b = s.patch(cR);
        const litIsL = a.L >= b.L, lit = litIsL ? a : b, sh = litIsL ? b : a;
        const wFace = Math.abs(s.proj(face('jawL'))[0] - s.proj(face('jawR'))[0]);
        // the fall, where the TERMINATOR runs and no cast shadow crosses it: across the forehead, 1.2 cm over the brow landmark, from 5 cm
        // toward the lit side to 5 cm toward the shadow side (the cheek line crosses the nose's cast shadow, a cast edge, not the
        // terminator; the lower face sits near the terminator everywhere). Each sample is a 7 px vertical mean, smoothed over 9 px; 80 %
        // and 20 % lie between the line's two ends; the span is the path length between the two crossings over the face's width
        const brow0 = face('brow'), jl0 = face('jawL'), jr0 = face('jawR'), chin0 = face('chin');
        const Rx = jl0.clone().sub(jr0).normalize(), Ux = brow0.clone().sub(chin0).normalize();
        const Fx = Rx.clone().cross(Ux).normalize(), Uy = Fx.clone().cross(Rx).normalize();
        const mid = brow0.clone().add(Uy.clone().multiplyScalar(0.012));
        const sgn = litIsL ? 1 : -1;
        const e0 = s.proj(mid.clone().add(Rx.clone().multiplyScalar(0.05 * sgn))), e1 = s.proj(mid.clone().add(Rx.clone().multiplyScalar(-0.05 * sgn)));
        const path = []; { const n = Math.ceil(Math.hypot(e1[0] - e0[0], e1[1] - e0[1])); for (let i = 0; i <= n; i++) path.push([e0[0] + (e1[0] - e0[0]) * i / n, e0[1] + (e1[1] - e0[1]) * i / n]); }
        const prof = path.map(([x, y]) => s.lumAt(x, y));
        const sm = prof.map((_, i) => { let q = 0, n = 0; for (let k = -4; k <= 4; k++) { const v = prof[i + k]; if (v != null) { q += v; n++; } } return q / n; });
        const Ll = Math.max(...sm.slice(0, 12)), Ls = Math.min(...sm.slice(-12));
        const P80 = Ls + 0.8 * (Ll - Ls), P20 = Ls + 0.2 * (Ll - Ls);
        let i80 = -1, i20 = -1;
        for (let i = 0; i < sm.length; i++) { if (i20 < 0 && sm[i] >= P80) i80 = i; if (i80 >= 0 && sm[i] <= P20) { i20 = i; break; } }
        const span = i80 >= 0 && i20 >= 0 ? (i20 - i80) / wFace : 0;
        const warm = (sh.R - sh.B) / (sh.R + sh.G + sh.B);
        out.day = { shadowCheek: r3(sh.L), litCheek: r3(lit.L), ratio: +(lit.L / sh.L).toFixed(2), fallSpan: +span.toFixed(3), foreheadLit: r3(Ll), foreheadShadow: r3(Ls), faceWidthPx: Math.round(wFace), warmth: +warm.toFixed(3), shadowSide: litIsL ? 'her right' : 'her left' }; }
      // BACKLIT 18:45, the sun behind her, the 3/4 on her left (the backlit close-up's lens): the brightest 3 x 3 patch on her left ear's
      // rim against her shadow cheek, then with the transmission term off (the negative control)
      await relight(18.75, 180);
      { const rim = []; { const v = new T3(), n = tpl.geometry.attributes.position.count, P = []; for (let i = 0; i < n; i++) { tpl.getVertexPosition(i, v); if (v.x > 0.074 && v.y > LM.cheekL.now[1] - 0.012 && v.y < LM.brow.now[1] + 0.004 && v.z < LM.jawL.now[2] + 0.012) P.push(i); } rim.push(...P); }
        const ear = () => { const s = shoot(Math.PI / 5); let e = 0; for (const i of rim) { const q = s.proj(at(i)); e = Math.max(e, s.patch(q, 1).L); } return { e, c: s.patch(s.proj(face('cheekL'))).L }; };
        const on = ear();
        let off = null;
        if (U) { U.calThinK.value = 0; off = ear(); U.calThinK.value = 1; }
        out.backlit = { earRimVerts: rim.length, earHelix: r3(on.e), shadowCheek: r3(on.c), ratio: +(on.e / on.c).toFixed(2), ratioThinOff: off ? +(off.e / off.c).toFixed(2) : null }; }
      // NIGHT 01:00
      await relight(1, -38);
      { const s = shoot(0); const a = s.patch(s.proj(face('cheekL'))), b = s.patch(s.proj(face('cheekR'))); out.night = { shadowCheek: r3(Math.min(a.L, b.L)) }; }
      const I = p.hero?.info?.();
      const body = (I?.meshes || []).filter((m) => m.part === 'body' && /^Brea_/.test(m.name));
      const sz = (t) => (t?.image ? t.image.width : 0);
      out.material = { calSkin: skinMat.userData?.calSkin ?? null, draws: body.length, tris: body.reduce((q, m) => q + m.tris, 0), maps: [sz(skinMat.map), sz(skinMat.normalMap), sz(skinMat.roughnessMap)] };
      const d = out.day, b = out.backlit;
      const terms = {
        a: d.shadowCheek >= 0.022 && d.shadowCheek <= 0.060,
        b: d.ratio >= 3.5 && d.ratio <= 5.5,
        c: d.fallSpan >= 0.10,
        d: d.warmth >= 0.40,
        e: b.ratio >= 1.5 && b.ratioThinOff != null && b.ratioThinOff < 1.15,
        f: out.night.shadowCheek <= 0.010,
        g: out.material.calSkin === 1 && out.material.draws <= 2 && out.material.maps.join() === '1024,512,512',
      };
      return { pass: Object.values(terms).every(Boolean), detail: { terms, ...out } };
    })()`,
  },
  {
    // fix round 3, ROUND5-LOOK C-02 (§7 character-art block, at its literal bars)
    id: 'A-skin-spec', kind: 'action', lane: 'character-art', settle: 800, timeout: 240000,
    title: 'LOOK C-02 skin specular and micro-detail (src/hero/skinLook.js + the recipe ORM): the 3/4 DAY close-up at 0.8 m re-rendered with a flat skin albedo (gate-only override, calFlat): (a) highlights (>= 2.2 x the face median, linear luminance) cover 1.5-8 % of the face box; (b) >= 60 % of them within 2 cm of the forehead, nose-bridge and cheekbone landmarks; (c) MACRO, the lit cheek at 0.4 m: high-pass RMS 0.012-0.040, falling >= 30 % with the detail weight forced to 0, and the detail weight 0 at 3 m (the frames with and without it identical); (d) in the true albedo the salt-line >= 2.5 x the lit cheek with >= 90 % of its pixels <= 0.97 sRGB; (e) brea.glb <= 0.7 MB',
    setup: placedSetup(['openGround'], `(async () => {${STAGE(11, 'clear', -38, true)}
    })()`),
    assert: `(async () => {
      const C = __CTX__, p = C.player;
      const S = await import('/src/hero/sheets.js');
      ${GEOM}
      ${LMK}
      await relight(11, -38);
      p.hero?.kit?.setHidden(3);
      const G = skinLive(), U = G.live.material.userData.calSkinU;
      if (!U || !G.Z || !U.calFlat) return { pass: false, detail: { calSkinU: !!U, calzone: !!G.Z, calFlat: !!U?.calFlat } };
      const Fr = frame();
      const W = 666, H = 1125, FOV = 29;
      const d34 = Fr.view(Math.PI / 5);
      const pos = Fr.cen.clone().add(d34.clone().multiplyScalar(0.8));
      const cam = camOf(pos.toArray(), Fr.cen.toArray(), W, H, FOV);
      const shoot = () => S.liveView(C, pos.toArray(), Fr.cen.toArray(), { width: W, height: H, fov: FOV });
      const N = shoot();
      U.calFlat.value.set(0.20, 0.11, 0.07, 1);
      const F = shoot();
      G.live.visible = false; const Hd = shoot(); G.live.visible = true;
      // the face: front-facing skin triangles on the face's detail zone, not the eyes, where the skin is the visible surface
      const Z = G.Z;
      const geo = raster(cam, W, H, G, (a, b, c) => Z[a * 4] + Z[b * 4] + Z[c * 4] > 3 * 160 && Z[a * 4 + 3] + Z[b * 4 + 3] + Z[c * 4 + 3] === 0);
      const mask = new Uint8Array(W * H);
      let x0 = W, x1 = 0, y0 = H, y1 = 0, nm = 0;
      for (let i = 0; i < W * H; i++) {
        if (!geo[i]) continue;
        const o = i * 4; if (Math.abs(F.data[o] - Hd.data[o]) + Math.abs(F.data[o + 1] - Hd.data[o + 1]) + Math.abs(F.data[o + 2] - Hd.data[o + 2]) < 6) continue;
        mask[i] = 1; nm++; const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      const Ls = []; for (let i = 0; i < W * H; i++) if (mask[i]) Ls.push(lum(F.data, i * 4));
      Ls.sort((a, b) => a - b);
      const med = Ls[Ls.length >> 1] || 1e-6;
      const box = (x1 - x0 + 1) * (y1 - y0 + 1);
      const T3b = p.position.constructor;
      const proj = (w) => { const v = w.clone().project(cam); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; };
      const lms = [face('brow').add(Fr.U1.clone().multiplyScalar(0.015)), face('noseBridge'), face('cheekL').add(Fr.U1.clone().multiplyScalar(0.009)), face('cheekR').add(Fr.U1.clone().multiplyScalar(0.009))];
      const lp = lms.map((w) => ({ c: proj(w), r: Math.hypot(...proj(w.clone().add(Fr.R0.clone().multiplyScalar(0.02))).map((q, k) => q - proj(w)[k])) }));
      let hi = 0, near = 0;
      const hiMask = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) if (mask[i] && lum(F.data, i * 4) >= 2.2 * med) {
        hi++; hiMask[i] = 1; const x = i % W, y = (i / W) | 0;
        if (lp.some((l) => Math.hypot(x - l.c[0], y - l.c[1]) <= l.r)) near++;
      }
      const cover = hi / Math.max(1, box), nearK = hi ? near / hi : 0;
      // (d) the paste: where the true albedo is far brighter than the flat one under the same light
      const lc = [proj(face('cheekL')), proj(face('cheekR'))];
      const patch = (img, c) => { let L = 0, n = 0; for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) { const X = Math.round(c[0]) + i, Y = Math.round(c[1]) + j; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; L += lum(img.data, (Y * W + X) * 4); n++; } return L / n; };
      const litCheek = Math.max(patch(N, lc[0]), patch(N, lc[1]));
      const pasteL = []; let clip = 0;
      for (let i = 0; i < W * H; i++) {
        if (!mask[i]) continue;
        const ln = lum(N.data, i * 4), lf = lum(F.data, i * 4);
        if (ln > 2.0 * lf && ln > 0.02) { pasteL.push(ln); const o = i * 4; if (Math.max(N.data[o], N.data[o + 1], N.data[o + 2]) > 0.97 * 255) clip++; }
      }
      pasteL.sort((a, b) => a - b);
      const pasteMed = pasteL.length ? pasteL[pasteL.length >> 1] : 0;
      // (c) MACRO: the lit cheek at 0.4 m, flat albedo, detail on and off; then the same at 3 m
      const litW = patch(N, lc[0]) >= patch(N, lc[1]) ? face('cheekL') : face('cheekR');
      const MW = 600, MH = 600;
      const mpos = litW.clone().add(d34.clone().multiplyScalar(0.4));
      const macro = (dist) => { const q = litW.clone().add(d34.clone().multiplyScalar(dist)); return S.liveView(C, q.toArray(), litW.toArray(), { width: MW, height: MH, fov: 29 }); };
      const hp = (img) => {
        const L = new Float32Array(MW * MH); for (let i = 0; i < MW * MH; i++) { const o = i * 4; L[i] = (0.2126 * img.data[o] + 0.7152 * img.data[o + 1] + 0.0722 * img.data[o + 2]) / 255; }
        const r = 5, x0b = MW / 2 - 70, y0b = MH / 2 - 70; let s2 = 0, n = 0;
        for (let y = y0b; y < y0b + 140; y++) for (let x = x0b; x < x0b + 140; x++) { let b = 0, m = 0; for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { b += L[(y + j) * MW + x + i]; m++; } const d = L[y * MW + x] - b / m; s2 += d * d; n++; }
        return Math.sqrt(s2 / n);
      };
      const M1 = macro(0.4); U.calDetailK.value = 0; const M0 = macro(0.4); U.calDetailK.value = 1;
      const rms1 = hp(M1), rms0 = hp(M0), fall = rms1 > 0 ? (rms1 - rms0) / rms1 : 0;
      const far1 = macro(3.02); U.calDetailK.value = 0; const far0 = macro(3.02); U.calDetailK.value = 1;
      let farDiff = 0; for (let i = 0; i < far1.data.length; i += 4) if (Math.abs(far1.data[i] - far0.data[i]) + Math.abs(far1.data[i + 1] - far0.data[i + 1]) + Math.abs(far1.data[i + 2] - far0.data[i + 2]) > 3) farDiff++;
      U.calFlat.value.w = 0;
      const bytes = (await (await fetch('/models/hero/brea.glb')).arrayBuffer()).byteLength;
      // the sheet: flat 3/4 with its highlights (red) and the landmark circles; the true 3/4 with the paste (cyan); the macro on / off
      const g = sheetOf();
      const Fo = new ImageData(new Uint8ClampedArray(F.data), W, H), No = new ImageData(new Uint8ClampedArray(N.data), W, H);
      for (let i = 0; i < W * H; i++) { if (hiMask[i]) { Fo.data[i * 4] = 255; Fo.data[i * 4 + 1] = 30; Fo.data[i * 4 + 2] = 30; } }
      for (let i = 0; i < W * H; i++) if (mask[i]) { const ln = lum(N.data, i * 4), lf = lum(F.data, i * 4); if (ln > 2.0 * lf && ln > 0.02) { No.data[i * 4] = 0; No.data[i * 4 + 1] = 230; No.data[i * 4 + 2] = 255; } }
      putImg(g, Fo, 0, 0, 533, 900); putImg(g, No, 533, 0, 533, 900);
      g.strokeStyle = '#ffd400'; g.lineWidth = 2; for (const l of lp) { g.beginPath(); g.arc(l.c[0] * 533 / W, l.c[1] * 900 / H, l.r * 533 / W, 0, Math.PI * 2); g.stroke(); }
      putImg(g, M1, 1066, 0, 534, 450, 150, 150, 300, 300); putImg(g, M0, 1066, 450, 534, 450, 150, 150, 300, 300);
      tag(g, 'FLAT ALBEDO 3/4 DAY: highlights >= 2.2x median (red), 2 cm landmark rings', 12, 24);
      tag(g, 'TRUE ALBEDO: the paste (cyan)', 545, 24);
      tag(g, 'MACRO 0.4 m, detail on: RMS ' + rms1.toFixed(4), 1078, 24); tag(g, 'detail off: RMS ' + rms0.toFixed(4), 1078, 474);
      const terms = {
        a: cover >= 0.015 && cover <= 0.08,
        b: nearK >= 0.60,
        c: rms1 >= 0.012 && rms1 <= 0.040 && fall >= 0.30 && farDiff === 0,
        d: pasteL.length > 50 && pasteMed >= 2.5 * litCheek && clip <= 0.10 * pasteL.length,
        e: bytes <= 700000,
      };
      return { pass: Object.values(terms).every(Boolean), detail: { terms, faceMaskPx: nm, faceBox: box, faceMedian: +med.toFixed(4), highlights: { px: hi, cover: +cover.toFixed(4), nearLandmarks: +nearK.toFixed(3) }, macro: { rmsOn: +rms1.toFixed(4), rmsOff: +rms0.toFixed(4), fall: +fall.toFixed(3), at3mDifferingPx: farDiff }, paste: { px: pasteL.length, median: +pasteMed.toFixed(4), litCheek: +litCheek.toFixed(4), ratio: +(pasteMed / Math.max(1e-6, litCheek)).toFixed(2), over097: clip, over097K: +(clip / Math.max(1, pasteL.length)).toFixed(3) }, bytes } };
    })()`,
  },
  {
    // fix round 3, ROUND5-LOOK C-03 (§7 character-art block, at its literal bars)
    id: 'A-eye-catchlight', kind: 'action', lane: 'character-art', settle: 800, timeout: 300000,
    title: 'LOOK C-03 eyes (the _calZone cornea and tear line, the sky-window lobe, the lash line): front and 3/4 at 0.8 m, 1600 x 900 at DPR 1.25. (a) DAY 11:00 and DUSK 18.4: each iris disc in view holds a highlight blob >= 2 x 2 px, >= 0.75 sRGB and >= 4 x the iris median; (b) NIGHT 01:00: no iris pixel > 0.50 sRGB; (c) PROFILE (both sides, day): a >= 1 px rim highlight (>= 2.5 x the cornea median and >= 0.45 sRGB, on the outline or 1 px inside it) on >= 30 % of the cornea outline; (d) front, day: the 2 mm band over the upper lid margin <= 0.45 x the lid 4 mm above, over >= 70 % of the eye width; (e) is A-wrap-closed\'s own row in the same run (0 px). The iris is the cornea zone that is visible: the skin is flattened to a green albedo and the hair + wrap hidden for the mask render only',
    setup: placedSetup(['openGround'], `(async () => {${STAGE(11, 'clear', -38, true)}
    })()`),
    assert: `(async () => {
      const C = __CTX__, p = C.player;
      const S = await import('/src/hero/sheets.js');
      ${GEOM}
      ${LMK}
      p.hero?.kit?.setHidden(3);
      let wrapM = null; p.model.traverse((o) => { if (o.isSkinnedMesh && o.name === 'Brea_HairWrap') wrapM = o; });
      const W = 666, H = 1125, FOV = 29;
      const out = { day: {}, dusk: {}, night: {}, profile: {}, lid: {} }, shots = [];
      const views = { front: 0, '3/4': Math.PI / 5 };
      const analyse = (yaw, withLid) => {
        const G = skinLive(), U = G.live.material.userData.calSkinU, Z = G.Z, Fr = frame();
        const pos = Fr.cen.clone().add(Fr.view(yaw).multiplyScalar(0.8));
        const cam = camOf(pos.toArray(), Fr.cen.toArray(), W, H, FOV);
        const N = S.liveView(C, pos.toArray(), Fr.cen.toArray(), { width: W, height: H, fov: FOV });
        U.calFlat.value.set(0, 1, 0, 1); if (wrapM) wrapM.visible = false;
        const K = S.liveView(C, pos.toArray(), Fr.cen.toArray(), { width: W, height: H, fov: FOV });
        U.calFlat.value.w = 0; if (wrapM) wrapM.visible = true;
        const green = (i) => { const o = i * 4; return K.data[o + 1] > 1.3 * K.data[o] + 4 && K.data[o + 1] > 1.3 * K.data[o + 2] + 4; };
        const out2 = [];
        for (const side of [1, -1]) {
          const ctr = Fr.cen.clone().add(Fr.F0.clone().multiplyScalar(0.07));
          const sideOf = (i) => (G.P[i * 3] - ctr.x) * Fr.R0.x + (G.P[i * 3 + 1] - ctr.y) * Fr.R0.y + (G.P[i * 3 + 2] - ctr.z) * Fr.R0.z > 0 ? 1 : -1;
          const eyeM = raster(cam, W, H, G, (a, b, c) => Z[a * 4 + 3] > 200 && Z[b * 4 + 3] > 200 && Z[c * 4 + 3] > 200 && sideOf(a) === side, false);
          const corM = raster(cam, W, H, G, (a, b, c) => Z[a * 4 + 1] + Z[b * 4 + 1] + Z[c * 4 + 1] > 3 * 128 && sideOf(a) === side, false);
          const vis = new Uint8Array(W * H), iris = new Uint8Array(W * H); let nv = 0, ni = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
          for (let i = 0; i < W * H; i++) if (eyeM[i] && !green(i)) { vis[i] = 1; nv++; if (corM[i]) { iris[i] = 1; ni++; const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
          const Li = []; for (let i = 0; i < W * H; i++) if (iris[i]) Li.push(lum(N.data, i * 4));
          Li.sort((a, b) => a - b);
          const med = Li.length ? Li[Li.length >> 1] : 0;
          let maxS = 0; for (let i = 0; i < W * H; i++) if (iris[i]) { const o = i * 4; maxS = Math.max(maxS, (0.2126 * N.data[o] + 0.7152 * N.data[o + 1] + 0.0722 * N.data[o + 2]) / 255); }
          // highlight blobs: >= 0.75 sRGB luma and >= 4 x the median (linear)
          const hb = new Uint8Array(W * H);
          for (let i = 0; i < W * H; i++) if (iris[i]) { const o = i * 4; const sl = (0.2126 * N.data[o] + 0.7152 * N.data[o + 1] + 0.0722 * N.data[o + 2]) / 255; if (sl >= 0.75 && lum(N.data, o) >= 4 * med) hb[i] = 1; }
          let best = null; const seen = new Uint8Array(W * H);
          for (let i = 0; i < W * H; i++) if (hb[i] && !seen[i]) {
            let area = 0, bx0 = W, bx1 = 0, by0 = H, by1 = 0; const st = [i]; seen[i] = 1;
            while (st.length) { const j = st.pop(); area++; const x = j % W, y = (j / W) | 0; bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y);
              for (const q of [j - 1, j + 1, j - W, j + W]) if (q >= 0 && q < W * H && hb[q] && !seen[q]) { seen[q] = 1; st.push(q); } }
            const bl = { area, w: bx1 - bx0 + 1, h: by1 - by0 + 1 };
            if (!best || bl.area > best.area) best = bl;
          }
          const blobOk = !!best && best.w >= 2 && best.h >= 2 && best.area >= 4;
          let lid = null;
          if (withLid && nv > 40) {
            // the margin per column: the topmost visible eye pixel; px per mm off the projection of 1 cm across the face
            const pc = Fr.cen.clone().add(Fr.F0.clone().multiplyScalar(0.07)), q0 = pc.clone().project(cam), q1 = pc.clone().add(Fr.R0.clone().multiplyScalar(0.01)).project(cam);
            const pxmm = Math.abs((q1.x - q0.x) / 2 * W) / 10;
            let ex0 = W, ex1 = 0; for (let i = 0; i < W * H; i++) if (vis[i]) { const x = i % W; ex0 = Math.min(ex0, x); ex1 = Math.max(ex1, x); }
            const a0 = Math.round(ex0 + 0.1 * (ex1 - ex0)), a1 = Math.round(ex1 - 0.1 * (ex1 - ex0));
            let cols = 0, ok = 0; const ratios = [];
            for (let x = a0; x <= a1; x++) {
              let top = -1; for (let y = 0; y < H; y++) if (vis[y * W + x]) { top = y; break; }
              if (top < 0) continue;
              const band = (ya, yb) => { let L = 0, n = 0; for (let y = Math.max(0, Math.round(ya)); y <= Math.round(yb); y++) { L += lum(N.data, (y * W + x) * 4); n++; } return n ? L / n : 0; };
              const A = band(top - 2 * pxmm, top - 1), B = band(top - 4.5 * pxmm, top - 3.5 * pxmm);
              cols++; const r = B > 0 ? A / B : 9; ratios.push(r); if (r <= 0.45) ok++;
            }
            ratios.sort((a, b) => a - b);
            lid = { cols, ok, k: cols ? +(ok / cols).toFixed(3) : 0, medianRatio: ratios.length ? +ratios[ratios.length >> 1].toFixed(3) : null, pxPerMm: +pxmm.toFixed(2) };
          }
          out2.push({ side: side > 0 ? 'her left' : 'her right', irisPx: ni, visPx: nv, median: +med.toFixed(4), maxSrgb: +maxS.toFixed(3), blob: best, blobOk, lid, box: [x0, y0, x1, y1] });
        }
        return { N, out: out2, cam };
      };
      const profile = (yaw) => {
        const G = skinLive(), U = G.live.material.userData.calSkinU, Z = G.Z, Fr = frame();
        const side = yaw > 0 ? 1 : -1;
        const eyeC = face('brow').add(Fr.R0.clone().multiplyScalar(0.036 * side)).sub(Fr.U1.clone().multiplyScalar(0.023)).sub(Fr.F0.clone().multiplyScalar(0.018));
        const PW = 600, PH = 600, PF = 11;
        const pos = eyeC.clone().add(Fr.view(yaw).multiplyScalar(0.24));
        const cam = camOf(pos.toArray(), eyeC.toArray(), PW, PH, PF);
        const N = S.liveView(C, pos.toArray(), eyeC.toArray(), { width: PW, height: PH, fov: PF });
        U.calFlat.value.set(0, 1, 0, 1); if (wrapM) wrapM.visible = false;
        const K = S.liveView(C, pos.toArray(), eyeC.toArray(), { width: PW, height: PH, fov: PF });
        U.calFlat.value.w = 0; if (wrapM) wrapM.visible = true;
        const green = (i) => { const o = i * 4; return K.data[o + 1] > 1.3 * K.data[o] + 4 && K.data[o + 1] > 1.3 * K.data[o + 2] + 4; };
        const ctr = Fr.cen.clone().add(Fr.F0.clone().multiplyScalar(0.07));
        const sideOf = (i) => (G.P[i * 3] - ctr.x) * Fr.R0.x + (G.P[i * 3 + 1] - ctr.y) * Fr.R0.y + (G.P[i * 3 + 2] - ctr.z) * Fr.R0.z > 0 ? 1 : -1;
        const corM = raster(cam, PW, PH, G, (a, b, c) => Z[a * 4 + 1] + Z[b * 4 + 1] + Z[c * 4 + 1] > 3 * 128 && sideOf(a) === side, false);
        const cor = new Uint8Array(PW * PH); const Lc = [];
        for (let i = 0; i < PW * PH; i++) if (corM[i] && !green(i)) { cor[i] = 1; Lc.push(lum(N.data, i * 4)); }
        Lc.sort((a, b) => a - b);
        const med = Lc.length ? Lc[Lc.length >> 1] : 0;
        const bright = (i) => { const o = i * 4; return lum(N.data, o) >= 2.5 * med && (0.2126 * N.data[o] + 0.7152 * N.data[o + 1] + 0.0722 * N.data[o + 2]) / 255 >= 0.45; };
        // the outline: cornea pixels with a 4-neighbour outside it that is not lid (green) either: the dome's edge against the air
        let outline = 0, lit = 0; const mark = new Uint8Array(PW * PH);
        for (let i = 0; i < PW * PH; i++) {
          if (!cor[i]) continue;
          const x = i % PW, y = (i / PW) | 0;
          let edge = false;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= PW || Y >= PH) continue; const q = Y * PW + X; if (!cor[q] && !green(q)) edge = true; }
          if (!edge) continue;
          outline++;
          let hit = false;
          for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1 && !hit; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= PW || Y >= PH) continue; const q = Y * PW + X; if (cor[q] && bright(q)) hit = true; }
          if (hit) { lit++; mark[i] = 1; }
        }
        return { N, mark, res: { side: side > 0 ? 'her left' : 'her right', corneaPx: Lc.length, median: +med.toFixed(4), outline, lit, k: outline ? +(lit / outline).toFixed(3) : 0 } };
      };
      await relight(11, -38);
      for (const [nm, yaw] of Object.entries(views)) { const r = analyse(yaw, nm === 'front'); out.day[nm] = r.out; shots.push(['DAY ' + nm, r]); }
      const pL = profile(Math.PI / 2), pR = profile(-Math.PI / 2); out.profile = { left: pL.res, right: pR.res };
      await relight(18.4, -42);
      for (const [nm, yaw] of Object.entries(views)) { const r = analyse(yaw, false); out.dusk[nm] = r.out; shots.push(['DUSK ' + nm, r]); }
      await relight(1, -38);
      for (const [nm, yaw] of Object.entries(views)) { const r = analyse(yaw, false); out.night[nm] = r.out; shots.push(['NIGHT ' + nm, r]); }
      await relight(11, -38);
      // the sheet: each eye crop of every view (2x), the two profiles with their lit outline (magenta)
      const g = sheetOf();
      shots.forEach(([lb, r], k) => {
        r.out.forEach((e, j) => {
          if (!e.irisPx) return;
          const cx = (e.box[0] + e.box[2]) / 2, cy = (e.box[1] + e.box[3]) / 2, cw = 100, ch = 75;
          const x = (k % 3) * 266 + j * 133, y = Math.floor(k / 3) * 200;
          putImg(g, r.N, x, y, 133, 100, cx - cw / 2, cy - ch / 2, cw, ch);
        });
        tag(g, lb, (k % 3) * 266 + 6, Math.floor(k / 3) * 200 + 118);
      });
      [pL, pR].forEach((pr, k) => {
        const im = new ImageData(new Uint8ClampedArray(pr.N.data), 600, 600);
        for (let i = 0; i < 600 * 600; i++) if (pr.mark[i]) { im.data[i * 4] = 255; im.data[i * 4 + 1] = 0; im.data[i * 4 + 2] = 255; }
        putImg(g, pr.N, 800 + k * 400, 0, 400, 400, 100, 100, 400, 400);
        putImg(g, im, 800 + k * 400, 450, 400, 400, 100, 100, 400, 400);
        tag(g, 'PROFILE ' + pr.res.side + ': lit outline ' + pr.res.lit + ' / ' + pr.res.outline, 812 + k * 400, 474);
      });
      const eyesIn = (set) => Object.values(set).flat().filter((e) => e.irisPx >= 60);
      const terms = {
        a: eyesIn(out.day).length >= 3 && eyesIn(out.day).every((e) => e.blobOk) && eyesIn(out.dusk).length >= 3 && eyesIn(out.dusk).every((e) => e.blobOk),
        b: eyesIn(out.night).length >= 3 && eyesIn(out.night).every((e) => e.maxSrgb <= 0.50),
        c: out.profile.left.k >= 0.30 && out.profile.right.k >= 0.30,
        d: out.day.front.every((e) => e.lid && e.lid.cols >= 8 && e.lid.k >= 0.70),
      };
      return { pass: Object.values(terms).every(Boolean), detail: { terms, e: 'graded by A-wrap-closed in the same run', ...out } };
    })()`,
  },
  {
    // fix round 3, ROUND5-LOOK C-04 (§7 character-art block, at its literal bars)
    id: 'A-hero-rim', kind: 'action', lane: 'character-art', settle: 900, timeout: 240000,
    title: 'LOOK C-04 golden-hour rim: the chase staging (the lens behind her at head height, as V22), the sun BEHIND her within 30 deg of the lens axis at 8-15 deg up (the first hour from 18.75 back that puts it there). Her mask from a key render (player only); edge = her pixels within 3 px of the outside, interior = the rest; linear luminance of the displayed frame. (a) edge mean >= 1.8 x interior mean; (b) >= 35 % of edge pixels >= the interior P90; (c) in a landmark\'s cast shadow (a 7 x 9 m slab stood 4 m toward the sun, gate-only) edge:interior <= 1.2; (d) noon, front-lit (the sun behind the lens): edge:interior <= 1.3; (e) no extra draws: her drawn meshes = the hero\'s own count (<= 5). Per-part edge ratios (skin + wrap, outfit, kit) are reported',
    setup: placedSetup(['openGround'], `(async () => {
      const C = __CTX__, p = C.player, env = C.environment;
      for (const m of (C.machines?.list || [])) m.update = () => {};
      for (const el of Array.from(document.body.children)) if (el.tagName !== 'CANVAS' && !el.querySelector('canvas')) el.style.visibility = 'hidden';
      C.input.keys.clear(); C.input.mouse.buttons = 0;
      standAt(p, 'openGround');
      env.timeFrozen = true;
    })()`),
    assert: `(async () => {
      const C = __CTX__, p = C.player, env = C.environment, scene = C.scene;
      const S = await import('/src/hero/sheets.js');
      ${GEOM}
      const frames = (n) => new Promise((r) => { let i = 0; const f = () => { if (++i >= n) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
      const T3 = p.position.constructor;
      // the hour: the first from 18.75 back whose sun stands 8-15 deg up
      let hour = 18.75, elev = 0;
      for (const hh of [18.75, 18.6, 18.5, 18.4, 18.3, 18.2, 18.0, 17.8, 17.6, 17.4]) { env.setTime(hh); env.setWeather('clear', 0); await frames(2); elev = Math.asin(Math.max(-1, Math.min(1, env.sunDir.y / Math.hypot(env.sunDir.x, env.sunDir.y, env.sunDir.z)))) * 180 / Math.PI; hour = hh; if (elev >= 8 && elev <= 15) break; }
      const W = 1600, H = 900;
      const stage = async (hourX, toSun, offDeg) => {
        env.setTime(hourX); env.setWeather('clear', 0);
        const sun = env.sunDir, az = Math.atan2(sun.x, sun.z) + offDeg * Math.PI / 180;
        const h = toSun ? az : az + Math.PI;
        if (C.engine) C.engine.timeScale = 1;
        for (let i = 0; i < 70; i++) { p.heading = h; p.camYaw = h + Math.PI; p.camPitch = 0.10; await frames(1); }
        if (C.engine) C.engine.timeScale = 0; await frames(2);
        const cam = C.camera, fwd = new T3(); cam.getWorldDirection(fwd);
        const pos = cam.position.clone(), tgt = pos.clone().add(fwd.multiplyScalar(10));
        return { pos: pos.toArray(), tgt: tgt.toArray(), fov: cam.fov, sunAngle: +(Math.acos(Math.max(-1, Math.min(1, fwd.normalize().dot(sun.clone().setY(0).normalize())))) * 180 / Math.PI).toFixed(1) };
      };
      const shot = (v) => S.liveView(C, v.pos, v.tgt, { width: W, height: H, fov: v.fov });
      const meshes = []; p.model.traverse((o) => { if (o.isMesh && o.visible) meshes.push(o); });
      const partOf = (o) => (/^Brea_/.test(o.name) ? 'body' : (o.isSkinnedMesh ? 'outfit' : 'kit'));
      const keyMask = (v, only) => {
        key(true);
        const hid = []; if (only) for (const o of meshes) if (partOf(o) !== only && o.visible) { o.visible = false; hid.push(o); }
        const K = shot(v);
        for (const o of hid) o.visible = true;
        key(false);
        const m = new Uint8Array(W * H);
        // (her pixels are the ones the key does not tint: an anti-aliased edge pixel that is a quarter key or more is not hers, so the
        // edge band never averages in the sky behind her)
        for (let i = 0; i < W * H; i++) { const o = i * 4; if (K.data[o + 1] - Math.max(K.data[o], K.data[o + 2]) < 60) m[i] = 1; }
        return m;
      };
      const measure = (v, parts = false) => {
        const img = shot(v), m = keyMask(v);
        const edge = new Uint8Array(W * H);
        for (let i = 0; i < W * H; i++) {
          if (!m[i]) continue;
          const x = i % W, y = (i / W) | 0; let e = false;
          for (let dy = -3; dy <= 3 && !e; dy++) for (let dx = -3; dx <= 3 && !e; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H || !m[Y * W + X]) e = true; }
          if (e) edge[i] = 1;
        }
        const Le = [], Li = [];
        for (let i = 0; i < W * H; i++) if (m[i]) (edge[i] ? Le : Li).push(lum(img.data, i * 4));
        const mean = (a) => a.reduce((q, x) => q + x, 0) / Math.max(1, a.length);
        const sorted = Li.slice().sort((a, b) => a - b), p90 = sorted.length ? sorted[Math.floor(sorted.length * 0.9)] : 0;
        const r = { edgePx: Le.length, interiorPx: Li.length, edge: +mean(Le).toFixed(4), interior: +mean(Li).toFixed(4), ratio: +(mean(Le) / Math.max(1e-6, mean(Li))).toFixed(3), overP90: +(Le.filter((x) => x >= p90).length / Math.max(1, Le.length)).toFixed(3) };
        if (parts) {
          r.parts = {};
          for (const part of ['body', 'outfit', 'kit']) {
            const pm = keyMask(v, part); const a = [];
            for (let i = 0; i < W * H; i++) if (edge[i] && pm[i]) a.push(lum(img.data, i * 4));
            r.parts[part] = { edgePx: a.length, ratio: +(mean(a) / Math.max(1e-6, mean(Li))).toFixed(3) };
          }
        }
        return { r, img, m, edge };
      };
      p.hero?.kit?.setHidden(0);
      const vB = await stage(hour, true, 12);
      const back = measure(vB, true);
      // (c) the same light in a landmark's cast shadow: a slab stood 4 m toward the sun (gate-only, removed and disposed)
      const sd = env.sunDir.clone().setY(0).normalize();
      const { THREE } = await import('/src/core/collision.js');
      const geo = new THREE.BoxGeometry(7, 9, 0.6), mat = new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 0.9 });
      const wall = new THREE.Mesh(geo, mat); wall.castShadow = true; wall.receiveShadow = true;
      wall.position.set(p.position.x + sd.x * 4, p.position.y + 4.5, p.position.z + sd.z * 4); wall.lookAt(p.position.x, p.position.y + 4.5, p.position.z);
      scene.add(wall); await frames(3);
      const shade = measure(vB);
      scene.remove(wall); geo.dispose(); mat.dispose(); await frames(2);
      // (d) noon, front-lit: the sun behind the lens
      const vN = await stage(12.5, false, 12);
      const noon = measure(vN);
      // (e) her drawn meshes
      const I = p.hero?.info?.();
      const drawn = []; p.model.traverse((o) => { if (o.isMesh && o.visible) drawn.push(o.name); });
      // the sheet: the backlit frame with her edge band (yellow), the slab's shade, the noon frame
      const g = (() => { document.getElementById('ca-sheet')?.remove(); const c = document.createElement('canvas'); c.id = 'ca-sheet'; c.width = 1600; c.height = 900; c.style.cssText = 'position:fixed;left:0;top:0;width:1600px;height:900px;z-index:2147483646;background:#000'; document.body.appendChild(c); return c.getContext('2d'); })();
      const box = (m) => { let x0 = W, x1 = 0, y0 = H, y1 = 0; for (let i = 0; i < W * H; i++) if (m[i]) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; };
      const crop = (res, x, y, w, h, mark) => {
        const b = box(res.m), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, ch = Math.min(H, (b[3] - b[1]) * 1.15), cw = ch * w / h;
        const im = new ImageData(new Uint8ClampedArray(res.img.data), W, H);
        if (mark) for (let i = 0; i < W * H; i++) if (res.edge[i] && (i % 3 === 0)) { im.data[i * 4] = 255; im.data[i * 4 + 1] = 230; im.data[i * 4 + 2] = 0; }
        const k = document.createElement('canvas'); k.width = W; k.height = H; k.getContext('2d').putImageData(im, 0, 0);
        g.drawImage(k, cx - cw / 2, cy - ch / 2, cw, ch, x, y, w, h);
      };
      crop(back, 0, 0, 400, 900, false); crop(back, 400, 0, 400, 900, true); crop(shade, 800, 0, 400, 900, false); crop(noon, 1200, 0, 400, 900, false);
      const tg = (t, x, y) => { g.font = '500 14px "IBM Plex Mono", ui-monospace, Menlo, monospace'; g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x - 6, y - 15, g.measureText(t).width + 12, 21); g.fillStyle = '#efe9dc'; g.fillText(t, x, y); };
      tg('BACKLIT ' + hour + ' h, sun ' + elev.toFixed(1) + ' deg up: edge:int ' + back.r.ratio, 10, 24); tg('edge band (3 px)', 410, 24); tg('IN THE SLAB SHADE: ' + shade.r.ratio, 810, 24); tg('NOON, FRONT-LIT: ' + noon.r.ratio, 1210, 24);
      const terms = {
        a: back.r.ratio >= 1.8,
        b: back.r.overP90 >= 0.35,
        c: shade.r.ratio <= 1.2,
        d: noon.r.ratio <= 1.3,
        e: drawn.length <= 5 && (!I || drawn.length === I.meshes.length),
      };
      return { pass: Object.values(terms).every(Boolean), detail: { terms, hour, sunElevDeg: +elev.toFixed(1), sunFromLensAxisDeg: vB.sunAngle, backlit: back.r, slabShade: shade.r, noonFrontLit: noon.r, drawn, heroMeshes: I?.meshes?.length ?? null } };
    })()`,
  },
  {
    // fix round 3, ROUND5-LOOK C-01..C-04 key-art face (§7 character-art block)
    id: 'V-brea-face-keyart', kind: 'visual', lane: 'character-art', settle: 800, timeout: 150000,
    title: 'Brea at 0.8 m in the live scene: front, 3/4 and profile on both sides, DAY 11:00 (top row) and 18:45 (bottom row), 1600 x 900',
    reference: 'reference/r5/hero/brea-face-sheet.png',
    setup: placedSetup(['openGround'], `(async () => {${STAGE(11, 'clear', -38, true)}
      const frames = (n) => new Promise((r) => { let i = 0; const f = () => { if (++i >= n) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
      const W = 1600, H = 900, PW = 320, PH = 450;
      const c = overlay(W, H), g = c.getContext('2d');
      const views = [['PROFILE HER RIGHT', -Math.PI / 2], ['3/4 HER RIGHT', -Math.PI / 5], ['FRONT', 0], ['3/4 HER LEFT', Math.PI / 5], ['PROFILE HER LEFT', Math.PI / 2]];
      p.hero?.kit?.setHidden(3);
      for (const [row, hour, off] of [[0, 11, -38], [1, 18.75, -42]]) {
        env.setTime(hour);
        const sun = env.sunDir, hh = Math.atan2(sun.x, sun.z) + off * Math.PI / 180;
        p.heading = hh; p.model.rotation.y = hh; await frames(4); p.heading = hh; p.model.rotation.y = hh; p.model.updateMatrixWorld(true);
        const brow2 = face('brow'), chin2 = face('chin'), jL2 = face('jawL'), jR2 = face('jawR');
        const Rr = jL2.clone().sub(jR2).normalize(), Uu = brow2.clone().sub(chin2).normalize(), Ff = Rr.clone().cross(Uu).normalize(), Uv = Ff.clone().cross(Rr).normalize();
        const cen2 = brow2.clone().add(chin2).multiplyScalar(0.5).add(Uv.clone().multiplyScalar(0.03)).sub(Ff.clone().multiplyScalar(0.07));
        views.forEach(([nm, yaw], i) => {
          const d = Ff.clone().multiplyScalar(Math.cos(yaw)).add(Rr.clone().multiplyScalar(Math.sin(yaw)));
          const img = S.liveView(C, [cen2.x + d.x * 0.8, cen2.y + d.y * 0.8, cen2.z + d.z * 0.8], [cen2.x, cen2.y, cen2.z], { width: Math.round(PW * 1.25), height: Math.round(PH * 1.25), fov: 17 });
          paste(g, img, i * PW, row * PH, PW, PH);
          label(g, nm, i * PW + 10, row * PH + 26);
        });
        label(g, (row ? '18:45' : 'DAY 11:00') + ' · 0.8 m', 10, row * PH + 52);
      }
    })()`),
    criteria: 'Against Kevin\'s Nov 6 key-art face panels (#1-MC: all three faces), #5-7 and reference/r5/hero/brea-face-sheet.png. Pass: (1) a warm red-brown shadow side that keeps the cheekbone, jaw and nose planes; (2) a soft terminator; (3) sheen on the forehead, the nose bridge and the cheekbone; (4) wet eyes with catch-lights; (5) a dark upper lash line; (6) a matte chalky salt-line; (7) the wrap as soft dyed cloth with deep folds. FAIL if it reads as brea-closeup-day-nov6-wip with only the brightness changed, or looks cheap beside the panel (R54 d). IP-clause: nothing from the never-copy list (ROUND5-LOOK §8.1).',
  },
  {
    // fix round 3, ROUND5-LOOK C-04 (§7 character-art block)
    id: 'V-brea-golden-hour', kind: 'visual', lane: 'character-art', settle: 900, timeout: 150000,
    title: 'The chase lens from behind and to her right (back 3/4), the sun behind her low (the A-hero-rim hour): idle (left) and mid-sprint (right), 1600 x 900',
    reference: 'reference/r5/gates-perf/run-rear.jpg',
    setup: placedSetup(['openGround'], `(async () => {
      const C = __CTX__, p = C.player, env = C.environment;
      for (const m of (C.machines?.list || [])) m.update = () => {};
      for (const el of Array.from(document.body.children)) if (el.tagName !== 'CANVAS' && !el.querySelector('canvas')) el.style.visibility = 'hidden';
      C.input.keys.clear(); C.input.mouse.buttons = 0;
      standAt(p, 'openGround');
      env.timeFrozen = true;
      const S = await import('/src/hero/sheets.js');
      const T3 = p.position.constructor;
      const frames = (n) => new Promise((r) => { let i = 0; const f = () => { if (++i >= n) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
      let hour = 18.75;
      for (const hh of [18.75, 18.6, 18.5, 18.4, 18.3, 18.2, 18.0, 17.8]) { env.setTime(hh); env.setWeather('clear', 0); await frames(2); const e = Math.asin(env.sunDir.y / env.sunDir.length()) * 180 / Math.PI; hour = hh; if (e >= 8 && e <= 15) break; }
      const az = Math.atan2(env.sunDir.x, env.sunDir.z);
      const c = document.createElement('canvas'); c.id = 'ca-sheet'; c.width = 1600; c.height = 900;
      c.style.cssText = 'position:fixed;left:0;top:0;width:1600px;height:900px;z-index:2147483646;background:#000';
      const g = c.getContext('2d');
      const grab = (x) => {
        const cam = C.camera, f = new T3(); cam.getWorldDirection(f);
        const img = S.liveView(C, cam.position.toArray(), cam.position.clone().add(f.multiplyScalar(10)).toArray(), { width: 1000, height: 1125, fov: cam.fov * 1.0 });
        const k = document.createElement('canvas'); k.width = img.width; k.height = img.height; k.getContext('2d').putImageData(img, 0, 0);
        g.drawImage(k, x, 0, 800, 900);
      };
      // idle: she faces the sun (30 deg off the lens axis), the lens behind her right shoulder
      if (C.engine) C.engine.timeScale = 1;
      for (let i = 0; i < 80; i++) { p.heading = az + 0.35; p.camYaw = az + 0.35 + Math.PI - 0.5; p.camPitch = 0.08; await frames(1); }
      if (C.engine) C.engine.timeScale = 0; await frames(2);
      grab(0);
      // mid-sprint toward the sun
      if (C.engine) C.engine.timeScale = 1;
      C.input.keys.add('KeyW'); C.input.keys.add('ShiftLeft');
      for (let i = 0; i < 75; i++) { p.camYaw = az + 0.35 + Math.PI - 0.5; p.camPitch = 0.08; await frames(1); }
      if (C.engine) C.engine.timeScale = 0; await frames(2);
      C.input.keys.delete('KeyW'); C.input.keys.delete('ShiftLeft');
      grab(800);
      document.body.appendChild(c);
      const lb = (t, x, y) => { g.font = '500 15px "IBM Plex Mono", ui-monospace, Menlo, monospace'; g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x - 6, y - 16, g.measureText(t).width + 12, 22); g.fillStyle = '#efe9dc'; g.fillText(t, x, y); };
      lb('IDLE · ' + hour + ' h · sun behind her', 14, 28); lb('MID-SPRINT', 814, 28);
    })()`),
    criteria: 'Against #1-TL, #5-3 and reference/r5/gates-perf/run-rear.jpg. Pass: (1) a warm sun-rim on the shoulder, the arm, the wrap\'s edge and the tail; (2) deep saturated violet; (3) skin glowing warm at its edges; (4) glints on leather and bronze; (5) light, not an outline, separates her from the background. FAIL: flat-lit against a golden sky; a uniform halo. IP-clause: nothing from the never-copy list (ROUND5-LOOK §8.1).',
  },
  {
    id: 'A-brea-fill', kind: 'action', lane: 'character-art', settle: 600, timeout: 60000,
    title: 'R59 c: the hero fill (the emissive slot on the skin and wrap) follows the scene\'s ambient: full by day, at most 15 % of it at 01:00, no new map and no new draw; the material stays the one the outfit and the fade clone already use',
    setup: placedSetup(['openGround'], `(async () => {
      const C = __CTX__, env = C.environment;
      for (const m of (C.machines?.list || [])) m.update = () => {};
      standAt(C.player, 'openGround');
      env.timeFrozen = true;
    })()`),
    assert: `(async () => {
      const C = __CTX__, env = C.environment, p = C.player;
      let skin = null, wrap = null;
      p.model.traverse((o) => { if (o.isSkinnedMesh && o.name === 'Brea_Skin') skin = o; if (o.isSkinnedMesh && o.name === 'Brea_HairWrap') wrap = o; });
      const frames = (n) => new Promise((r) => { let i = 0; const f = () => { if (++i >= n) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
      const read = async (hour, weather) => { env.setWeather(weather, 0); env.setTime(hour); await frames(4); return { hour, weather, skin: +skin.material.emissiveIntensity.toFixed(3), wrap: +wrap.material.emissiveIntensity.toFixed(3), hemi: +env.hemi.intensity.toFixed(3) }; };
      const noon = await read(11, 'clear'), dusk = await read(18.4, 'clear'), over = await read(11, 'overcast'), night = await read(1, 'clear');
      const pass = noon.skin >= 0.95 && noon.wrap >= 0.95 && night.skin <= 0.15 && night.wrap <= 0.15 && dusk.skin > night.skin;
      return { pass, detail: { noon, dusk, over, night } };
    })()`,
  },
];

/** (debug and NPC rows may reuse the staging and the masks) */
export { STAGE, GEOM, LMK, CLOSEUP };
