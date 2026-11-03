/**
 * ROUND 5 — lane `character-art` gates (W1; R54, R56; brief: Brea's close-up has to look
 * incredible). Auto-discovered by tools/gates.config.mjs:
 *
 *   nice -n 10 node tools/gates.mjs --port 5266 --lane character-art
 *
 *   V-brea-closeup          noon, 0.8 m, front / 3-4 / profile, 1600 x 900, through the LIVE scene
 *   V-brea-closeup-dusk     the same at dusk
 *   V-brea-closeup-calima   the same in the calima (world-sky's state when it exists; until then
 *                           a staged dust light, named in the frame)
 *   V-brea-closeup-detail   the fine marks at 0.35 m: the salt paste, the eye, the wrap's hem, the ∴
 *   A-brea-budget           plan §4.1 Brea row, measured live: <= 10 k tris, <= 2 draws, skin 1024²
 *                           + 512² normal/ORM, hair+wrap <= 512², <= 0.7 MB; and that the look's
 *                           maps are real: alpha-cut hair+wrap, a baked AO, pore-scale normal energy
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
const STAGE = (hour, weather, sunOffDeg) => `
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
      for (let i = 0; i < 40; i++) { p.heading = h; await new Promise((r) => requestAnimationFrame(r)); }
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
      const view = (yaw) => F0.clone().multiplyScalar(Math.cos(yaw)).add(R0.clone().multiplyScalar(Math.sin(yaw)));
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

/** The three angles at 0.8 m, full height, at DPR 1.25 like the game: all on her left, the sun's side. */
const CLOSEUP = (name, hour, weather, sunOff) => `(async () => {${STAGE(hour, weather, sunOff)}
      const cen = brow.clone().add(chin).multiplyScalar(0.5).add(U1.clone().multiplyScalar(0.055)).sub(F0.clone().multiplyScalar(0.03));
      const W = 1600, H = 900, PW = Math.floor(W / 3);
      const c = overlay(W, H), g = c.getContext('2d');
      const views = [['FRONT', 0], ['3/4', Math.PI / 5], ['PROFILE (HER LEFT)', Math.PI / 2]];
      views.forEach(([nm, yaw], i) => {
        const d = view(yaw);
        const img = S.liveView(C, [cen.x + d.x * 0.8, cen.y + d.y * 0.8, cen.z + d.z * 0.8], [cen.x, cen.y, cen.z], { width: Math.round(PW * 1.25), height: Math.round(H * 1.25), fov: 29 });
        paste(g, img, i * PW, 0, PW, H);
        label(g, nm, i * PW + 14, 28);
      });
      label(g, ${JSON.stringify(name)} + ' · ' + env.time.toFixed(1) + ' h · ' + weatherUsed + ' · 0.8 m', 14, H - 14);
    })()`;

const COMMON = 'Reference: reference/r5/gates-perf/portrait-bokeh.jpg (CC0; the form shading, eye depth and lip structure a real face has). Pass: at 1600 x 900, at 0.8 m, front, 3/4 and profile read as a DESIGNED game heroine next to that reference. The headwrap is wound cloth: overlapping turns with hems and folds, soft woven edges, no paper band, no torn alpha, no blocky edge. No helmet hair: close coils at the temple and nape with a broken edge; the topknot is wound cloth with a carmine binding. Skin has form (socket, nose wing, under-lip and under-jaw shading), visible grain, no flat or plastic areas, no stubble. The nose is refined in profile, not blunt or oversized; the jaw runs in one line to a defined chin. The eyes are wet and deep: a highlight on the cornea, lid shadow on the ball, lashes. The salt-line is cracked paste with thickness, not a flat stripe. The brows are hair, heavy and straight, the left one cut by the scar. There is no hole at the collar: skin runs down inside it. FAIL on any of these, and (R54) FAIL if the frame passes the words and still looks cheap next to its reference.';

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
    title: 'Brea at 0.8 m: front, 3/4 and profile in the live scene, the day light, 1600 x 900',
    reference: 'reference/r5/gates-perf/portrait-bokeh.jpg',
    setup: placedSetup(['openGround'], CLOSEUP('DAY', 11, 'clear', -38)),
    criteria: COMMON,
  },
  {
    id: 'V-brea-closeup-dusk', kind: 'visual', lane: 'character-art', settle: 800, timeout: 90000,
    title: 'Brea at 0.8 m: front, 3/4 and profile in the live scene, dusk, 1600 x 900',
    reference: 'reference/r5/gates-perf/portrait-bokeh.jpg',
    setup: placedSetup(['openGround'], CLOSEUP('DUSK', 18.4, 'clear', -42)),
    criteria: COMMON + ' Dusk: the warm low key models the face; the shadow side keeps its form and does not go to a black mask.',
  },
  {
    id: 'V-brea-closeup-calima', kind: 'visual', lane: 'character-art', settle: 800, timeout: 90000,
    title: 'Brea at 0.8 m: front, 3/4 and profile in the live scene, calima light, 1600 x 900',
    reference: 'reference/r5/gates-perf/portrait-bokeh.jpg',
    setup: placedSetup(['openGround'], CLOSEUP('CALIMA', 15, 'calima', -30)),
    criteria: COMMON + ' Calima: flat dust light, no hard key; the form comes from the baked shading, and the cloth and skin stay separate in value.',
  },
  {
    id: 'V-brea-closeup-detail', kind: 'visual', lane: 'character-art', settle: 800, timeout: 90000,
    title: 'Brea detail at 0.32 m in the day light: the eye + salt paste, the wrap hem at the temple, the nape coils; the ∴ on the right hand',
    reference: 'reference/r5/gates-perf/portrait-bokeh.jpg',
    setup: placedSetup(['openGround'], `(async () => {${STAGE(11, 'clear', -30)}
      const W = 1600, H = 900, PW = 800, PH = 450;
      const c = overlay(W, H), g = c.getContext('2d');
      const shot = (i, j, tgt, dist, yaw, fov, lbl) => {
        const d = view(yaw);
        const img = S.liveView(C, [tgt.x + d.x * dist, tgt.y + d.y * dist, tgt.z + d.z * dist], [tgt.x, tgt.y, tgt.z], { width: Math.round(PW * 1.25), height: Math.round(PH * 1.25), fov });
        paste(g, img, i * PW, j * PH, PW, PH);
        label(g, lbl, i * PW + 14, j * PH + 28);
      };
      const eyeT = bridge.clone().add(U1.clone().multiplyScalar(-0.006)).add(R0.clone().multiplyScalar(0.016));
      shot(0, 0, eyeT, 0.30, 0.22, 21, 'EYES + SALT PASTE');
      const templeT = brow.clone().add(R0.clone().multiplyScalar(0.066)).add(U1.clone().multiplyScalar(0.012)).sub(F0.clone().multiplyScalar(0.055));
      shot(1, 0, templeT, 0.34, 1.0, 24, 'WRAP HEM + TEMPLE');
      const kit = p.hero?.kit, hid = kit?.hidden ?? 0;
      kit?.setHidden(31);
      await new Promise((r) => requestAnimationFrame(r));
      const napeT = chin.clone().sub(F0.clone().multiplyScalar(0.175)).add(U1.clone().multiplyScalar(0.03));
      shot(0, 1, napeT, 0.44, Math.PI * 0.9, 27, 'NAPE + KNOT TAIL');
      const hand = an.b.handR.bone.getWorldPosition(new T3()), knk = (an.bones.middle_01_r || an.b.handR.bone).getWorldPosition(new T3());
      const m = hand.clone().lerp(knk, 0.5);
      const fx = Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h);
      // the back of the hand: from outside the right hip, a little in front
      const lp = [m.x + rx * 0.26 + fx * 0.10, m.y + 0.05, m.z + rz * 0.26 + fz * 0.10];
      const himg = S.liveView(C, lp, [m.x, m.y, m.z], { width: Math.round(PW * 1.25), height: Math.round(PH * 1.25), fov: 26 });
      kit?.setHidden(hid);
      paste(g, himg, PW, PH, PW, PH);
      label(g, 'RIGHT HAND (∴)', PW + 14, PH + 28);
    })()`),
    criteria: 'Pass: the salt paste is a finger-wiped chalky paste with thickness and a slight crackle, thinning at its edges; the eye has a wet highlight, a lid shadow, a fibred dark iris and lashes; the wrap\'s edge is a soft woven hem with folds, not a cut; the nape is coils with a broken outline, not a shell, and the knot tail is a cloth end with a frayed fringe; the ∴ is a small fine dark tattoo, three separate dots, not white blobs. FAIL if any of them looks like a flat decal.',
  },
];
