/**
 * ROUND 5 — lane `character-art` gates (W1; R54, R56, R58, R59; brief: Brea's close-up has to look
 * incredible). Auto-discovered by tools/gates.config.mjs:
 *
 *   nice -n 10 node tools/gates.mjs --port 5266 --lane character-art
 *
 *   V-brea-closeup           day, sun on her left: front, 3/4 and profile on her left, 0.8 m, 1600 x 900, through the LIVE scene
 *   V-brea-closeup-right     day, sun on her right: front, 3/4 and profile on her right
 *   V-brea-closeup-shade     day, sun on her left: 3/4 and profile on her right, the shadow side, and the front
 *   V-brea-closeup-dusk      dusk, her left; V-brea-closeup-dusk-right, dusk, her right
 *   V-brea-closeup-back      day: the back at 0.8 m, back-high from the chase and aim cameras' angle, back 3/4
 *   V-brea-closeup-backlit   the sun behind her: front, 3/4, back (the light that finds every inward-facing surface)
 *   V-brea-closeup-calima    PENDING until world-sky's calima state is on main (R59 b); no stand-in can pass it
 *   V-brea-closeup-detail    the fine marks: eyes + paste, brow + scar, the eye in profile, the ∴; both temples, nose + lips, the ear
 *   V-brea-closeup-detail-back  the sun behind her, still air: the nape from both sides, the knot + tail root, the topknot's crown
 *   V-brea-closeup-night     01:00: the hero fill has fallen away (R59 c)
 *   A-wrap-closed            no see-through: 96 views on a key colour, 0 enclosed background pixels
 *   A-brea-fill              R59 c: the hero fill falls away with the scene's ambient at night
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
    title: 'Brea detail in the day light, still air: eyes + salt paste, brow + scar, the eye in profile, the ∴ on the right hand; both temples, the nose and lips, the ear',
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
      shot(2, 0, off(brow, 0.036, -0.02, -0.022), 0.24, Math.PI / 2, 20, 'THE EYE IN PROFILE');
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
    criteria: 'Pass: the salt paste is a finger-wiped chalky paste with thickness, cracked across its whole length, uneven in width, thinning at its edges; the eye has a wet highlight, a lid shadow, a fibred dark iris and lashes, and in profile it shows an iris and a cornea, with lashes that are hair and not a slab; the left brow is cut clean through by a scar with relief; the wrap\'s edges on both sides are soft woven hems with folds, not cuts; both temples are coils with a broken outline, with real value, not a shell; the nostrils are graded dark brown, not black holes, with no pale shard; the ear is rounded, not faceted; the ∴ is a small fine dark tattoo, three separate dots, not white blobs. FAIL if any of them looks like a flat decal.',
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
    id: 'A-wrap-closed', kind: 'action', lane: 'character-art', settle: 800, timeout: 180000,
    title: 'No see-through (plan §9 "no see-through", the scan the engineering judge ran): only the player drawn on a key colour, still air, the stow kit and both free cloth ends collapsed: over 96 views at 0.8 m (24 azimuths x 4 elevations) 0 enclosed background pixels near the head, neck and collar (a speck of coil-card alpha, under 6 px or 3 x 2 px, is hair)',
    setup: placedSetup(['openGround'], `(async () => {${STAGE(11, 'clear', -38, true)}
    })()`),
    assert: `(async () => {
      const C = __CTX__, p = C.player, scene = C.scene, R = C.renderer, an = p.animator;
      const S = await import('/src/hero/sheets.js');
      const T3 = p.position.constructor, A = C.assets.models.hero, LM = A.extras.r5Face.landmarks;
      let tpl = null, live = null;
      A.root.traverse((o) => { if (!tpl && o.isSkinnedMesh && o.geometry.getAttribute('_hidemask')) tpl = o; });
      p.model.traverse((o) => { if (!live && o.isSkinnedMesh && o.geometry.getAttribute('_hidemask')) live = o; });
      A.root.updateMatrixWorld(true);
      const idxOf = (q) => { const v = new T3(), n = tpl.geometry.attributes.position.count; let b = -1, bd = 1e9; for (let i = 0; i < n; i++) { tpl.getVertexPosition(i, v); const d = (v.x - q[0]) ** 2 + (v.y - q[1]) ** 2 + (v.z - q[2]) ** 2; if (d < bd) { bd = d; b = i; } } return b; };
      const face = (k) => { const v = new T3(); live.getVertexPosition(idxOf(LM[k].now), v); return live.localToWorld(v); };
      const brow = face('brow'), chin = face('chin'), jL = face('jawL'), jR = face('jawR');
      const R0 = jL.clone().sub(jR).normalize(), U0 = brow.clone().sub(chin).normalize();
      const F0 = R0.clone().cross(U0).normalize(), U1 = F0.clone().cross(R0).normalize();
      const cen = brow.clone().add(chin).multiplyScalar(0.5).add(U1.clone().multiplyScalar(0.05)).sub(F0.clone().multiplyScalar(0.07));
      p.hero?.kit?.setHidden(31);
      // the free cloth ends collapse to their roots: what hangs behind the neck encloses real background, which is not a hole
      const bones = [];
      p.model.traverse((o) => { if (o.isBone && /^dyn_(wrapSash|hairKnotTail)_01$/.test(o.name)) bones.push(o); });
      for (const b of bones) b.scale.setScalar(1e-4);
      p.model.updateMatrixWorld(true);
      const hidden = [];
      for (const o of scene.children) if (o !== p.model && !o.isLight && o.visible) { o.visible = false; hidden.push(o); }
      const bg0 = scene.background, fog0 = scene.fog; scene.background = null; scene.fog = null;
      const cc = R.getClearColor(live.material.color.clone()), ca = R.getClearAlpha();
      R.setClearColor(0x00ff00, 1);
      const W = 900, H = 900, res = [];
      for (const el of [-0.35, 0, 0.35, 0.8]) for (let az = 0; az < 360; az += 15) {
        const yaw = az * Math.PI / 180;
        const d = F0.clone().multiplyScalar(Math.cos(yaw) * Math.cos(el)).add(R0.clone().multiplyScalar(Math.sin(yaw) * Math.cos(el))).add(U1.clone().multiplyScalar(Math.sin(el)));
        const pos = cen.clone().add(d.multiplyScalar(0.8));
        const img = S.liveView(C, pos.toArray(), cen.toArray(), { width: W, height: H, fov: 29 });
        const px = img.data;
        const k = [px[0], px[1], px[2]];
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
        const near = comps.filter((c) => c.area >= 6 && c.w >= 3 && c.h >= 2 && Math.hypot(c.x - 450, c.y - 400) < 300).sort((a, b) => b.area - a.area);
        res.push({ az, el, area: near.reduce((s, c) => s + c.area, 0), top: near.slice(0, 2) });
      }
      res.sort((a, b) => b.area - a.area);
      const total = res.reduce((s, r) => s + r.area, 0);
      // the row's shot: the four worst views on the key colour, 2x around their largest hole (or the head, if clean)
      for (const o of Array.from(document.body.children)) if (o.tagName !== 'CANVAS' && !o.querySelector('canvas')) o.style.visibility = 'hidden';
      const sheet = document.createElement('canvas'); sheet.width = 1600; sheet.height = 900;
      sheet.style.cssText = 'position:fixed;left:0;top:0;width:1600px;height:900px;z-index:2147483646;background:#000';
      document.body.appendChild(sheet);
      const g = sheet.getContext('2d');
      res.slice(0, 4).forEach((r, i) => {
        const yaw = r.az * Math.PI / 180;
        const d = F0.clone().multiplyScalar(Math.cos(yaw) * Math.cos(r.el)).add(R0.clone().multiplyScalar(Math.sin(yaw) * Math.cos(r.el))).add(U1.clone().multiplyScalar(Math.sin(r.el)));
        const img = S.liveView(C, cen.clone().add(d.multiplyScalar(0.8)).toArray(), cen.toArray(), { width: W, height: H, fov: 29 });
        const k = document.createElement('canvas'); k.width = W; k.height = H; k.getContext('2d').putImageData(img, 0, 0);
        const t = r.top[0] || { x: 450, y: 400 };
        const cw = 400, ch = 225, sx = Math.max(0, Math.min(W - cw, t.x - cw / 2)), sy = Math.max(0, Math.min(H - ch, t.y - ch / 2));
        const x = (i % 2) * 800, y = (i >> 1) * 450;
        g.imageSmoothingEnabled = false; g.drawImage(k, sx, sy, cw, ch, x, y, 800, 450);
        const lb = 'az ' + r.az + ' el ' + r.el + ' · 2x · enclosed px ' + r.area;
        g.font = '500 15px ui-monospace, Menlo, monospace'; g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(x + 8, y + 8, g.measureText(lb).width + 12, 22); g.fillStyle = '#fff'; g.fillText(lb, x + 14, y + 24);
      });
      R.setClearColor(cc, ca);
      for (const o of hidden) o.visible = true;
      scene.background = bg0; scene.fog = fog0;
      for (const b of bones) b.scale.setScalar(1);
      p.model.updateMatrixWorld(true);
      return { pass: total === 0, detail: { views: res.length, withHoles: res.filter((r) => r.area > 0).length, totalPx: total, worst: res.slice(0, 6) } };
    })()`,
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
