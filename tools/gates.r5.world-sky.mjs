/**
 * ROUND 5 — lane `world-sky` gates (docs/ROUND5-PLAN.md §9 "world-sky"; the look rows are
 * docs/ROUND5-LOOK.md §7 "world-sky"; report docs/ROUND5-WORLD-SKY.md).
 *
 *   node tools/gates.mjs --port 5261 --lane world-sky
 *
 * §9 block (W1): A-weather-states, A-hour-keys, A55-light-ratio (re-staged), A56-cascades
 * (carried bar), A57-aerial (re-staged), A-cloud-sea, A-biome-grade, A-no-river, V-calima,
 * V31-night (re-staged), V-sky-trade. The three Round-4 ids (A55, A56, A57, V31) SHADOW the
 * carried world-light rows by id while this lane is active (plan §3.3).
 * LOOK W1 rows this lane can grade alone: A-look-ibl, A-sky-last, A-look-sunpath-dwell.
 * Lane film sheets (advisory, not §9 rows): V-sky-hours, V-sky-weathers.
 *
 * Every action row measures the live page: uniforms where the bar is written on uniforms
 * ("pre-grade"), real framebuffer pixels where it is written on what the eye sees, and a
 * control render (the term switched off) wherever a pixel claim could be satisfied by
 * something other than the term under test. No row names a species, a coordinate or a bone:
 * places come from tools/gate-places.mjs, Instruments from tools/gate-roster.mjs.
 */
import { PLACES, placed, placedSetup } from './gate-places.mjs';
import { ROSTER, SKIP_CARD } from './gate-roster.mjs';

const LANE = 'world-sky';

/** Page-context kit: render on demand, read real pixels, ΔE2000, contact sheets. */
const KIT = `
  const ctx = __CTX__;
  const engine = ctx.engine;
  const renderer = ctx.renderer;
  const cam = ctx.camera;
  const env = ctx.environment;
  const V = ctx.player.position.constructor;
  const gl = renderer.getContext();
  const gy = (x, z) => { const y = ctx.terrain?.getHeight?.(x, z); return Number.isFinite(y) ? y : 0; };
  const draw = (n = 3) => { for (let i = 0; i < n; i++) { engine._shadowCullClock = 0; engine.render(0.05); } };
  const W = () => renderer.domElement.width, H = () => renderer.domElement.height;
  const grab = () => { const w = W(), h = H(); const b = new Uint8ClampedArray(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
  const lum8 = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  /** median RGB (0-255) of an NxN patch at a screen pixel (GL origin bottom-left) of the live buffer */
  const patchPx = (px, py, N = 11) => {
    const h = N >> 1;
    if (px < h + 1 || py < h + 1 || px > W() - h - 2 || py > H() - h - 2) return null;
    const buf = new Uint8Array(N * N * 4);
    gl.readPixels(px - h, py - h, N, N, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const r = [], g = [], b = [];
    for (let i = 0; i < N * N; i++) { r.push(buf[i * 4]); g.push(buf[i * 4 + 1]); b.push(buf[i * 4 + 2]); }
    const med = (a) => { a.sort((x, y) => x - y); return a[a.length >> 1]; };
    return [med(r), med(g), med(b)];
  };
  const toScreen = (x, y, z) => {
    const v = new V(x, y, z).project(cam);
    if (!(v.z < 1) || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return null;
    return [Math.round((v.x * 0.5 + 0.5) * W()), Math.round((v.y * 0.5 + 0.5) * H())];
  };
  const patchAt = (x, y, z, N) => { const s = toScreen(x, y, z); return s ? patchPx(s[0], s[1], N) : null; };
  const saveCam = () => ({ p: cam.position.clone(), q: cam.quaternion.clone(), up: cam.up.clone(), fov: cam.fov });
  const restoreCam = (s) => { cam.position.copy(s.p); cam.quaternion.copy(s.q); cam.up.copy(s.up); cam.fov = s.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true); };
  /** camera at (x, y, z) looking along bearing (deg, 0 = north = -Z) and pitch (deg, + = up) */
  const aim = (x, y, z, bearingDeg, pitchDeg, fov = 55) => {
    const b = bearingDeg * Math.PI / 180, p = pitchDeg * Math.PI / 180;
    cam.up.set(0, 1, 0); cam.position.set(x, y, z);
    cam.lookAt(x + Math.sin(b) * Math.cos(p) * 100, y + Math.sin(p) * 100, z - Math.cos(b) * Math.cos(p) * 100);
    cam.fov = fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  };
  const bearingOf = (d) => ((Math.atan2(d.x, -d.z) * 180 / Math.PI) + 360) % 360;
  const elevOf = (d) => Math.asin(Math.max(-1, Math.min(1, d.y / Math.hypot(d.x, d.y, d.z)))) * 180 / Math.PI;
  /* CIE Lab (D65) and ΔE2000 from sRGB 0-255 */
  const lab = (c) => {
    const lin = (u) => { u /= 255; return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); };
    const r = lin(c[0]), g = lin(c[1]), b = lin(c[2]);
    const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    const f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
  };
  const dE00 = (c1, c2) => {
    const [L1, a1, b1] = lab(c1), [L2, a2, b2] = lab(c2);
    const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Math.pow(Cm, 7) / (Math.pow(Cm, 7) + Math.pow(25, 7))));
    const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
    const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    const h = (a, b) => { const t = Math.atan2(b, a) * 180 / Math.PI; return t < 0 ? t + 360 : t; };
    const h1 = h(a1p, b1), h2 = h(a2p, b2);
    const dL = L2 - L1, dC = C2p - C1p;
    let dh = h2 - h1; if (C1p * C2p === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
    const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(dh * Math.PI / 360);
    const Lm = (L1 + L2) / 2, Cpm = (C1p + C2p) / 2;
    let hm = h1 + h2; if (C1p * C2p !== 0) { hm = Math.abs(h1 - h2) > 180 ? (h1 + h2 + 360) / 2 : (h1 + h2) / 2; if (hm >= 360) hm -= 360; }
    const T = 1 - 0.17 * Math.cos((hm - 30) * Math.PI / 180) + 0.24 * Math.cos(2 * hm * Math.PI / 180) + 0.32 * Math.cos((3 * hm + 6) * Math.PI / 180) - 0.20 * Math.cos((4 * hm - 63) * Math.PI / 180);
    const SL = 1 + 0.015 * Math.pow(Lm - 50, 2) / Math.sqrt(20 + Math.pow(Lm - 50, 2)), SC = 1 + 0.045 * Cpm, SH = 1 + 0.015 * Cpm * T;
    const RT = -2 * Math.sqrt(Math.pow(Cpm, 7) / (Math.pow(Cpm, 7) + Math.pow(25, 7))) * Math.sin(60 * Math.exp(-Math.pow((hm - 275) / 25, 2)) * Math.PI / 180);
    return Math.sqrt(Math.pow(dL / SL, 2) + Math.pow(dC / SC, 2) + Math.pow(dH / SH, 2) + RT * (dC / SC) * (dH / SH));
  };
  const hex2 = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const col2 = (c) => { const k = c.clone().convertLinearToSRGB(); return [Math.round(k.r * 255), Math.round(k.g * 255), Math.round(k.b * 255)]; };
  const toHex = (a) => '#' + a.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
  const hideHud = () => { for (const id of ['hud', 'focus', 'crosshair']) { const h = document.getElementById(id); if (h) h.style.display = 'none'; } };
  const hideHero = () => { const p = ctx.player; const o = p.mesh || p.group || p.object3d || p.root; if (o) o.visible = false; return o; };
  /** labelled contact sheet over the page so the runner's one screenshot carries every frame */
  const sheet = (frames, labels, cols = 2) => {
    const w = W(), h = H();
    const rows = Math.ceil(frames.length / cols);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const t = document.createElement('canvas'); t.width = w; t.height = h;
    const tg = t.getContext('2d');
    for (let i = 0; i < frames.length; i++) {
      tg.putImageData(new ImageData(frames[i], w, h), 0, 0);
      g.save();
      g.translate((i % cols) * w / cols, Math.floor(i / cols) * h / rows);
      g.scale(1 / cols, -1 / rows);
      g.drawImage(t, 0, -h);
      g.restore();
      g.fillStyle = '#000'; g.globalAlpha = 0.6;
      g.fillRect((i % cols) * w / cols, Math.floor(i / cols) * h / rows, Math.min(w / cols, 520), 22);
      g.globalAlpha = 1; g.fillStyle = '#f2ead3';
      g.font = '13px ui-monospace, monospace';
      g.fillText(labels[i], (i % cols) * w / cols + 8, Math.floor(i / cols) * h / rows + 16);
    }
    const img = new Image();
    img.src = c.toDataURL('image/png');
    img.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647';
    document.body.appendChild(img);
  };
`;

/** The amended bible §2.4 (R66 k = ROUND5-LOOK L-03): sky top, sky low band, fog at the keyed hours. */
const HOUR_TABLE = [
  { h: 5.5, label: '05:30', top: '#2B3550', low: '#9C8FA0', fog: '#6F7480' },
  { h: 7.0, label: '07:00', top: '#6E88A8', low: '#F2B98E', fog: '#C9B3A6' },
  { h: 12.0, label: '12:00', top: '#3F78B5', low: '#BFD3E0', fog: '#CFD8DE' },
  { h: 16.5, label: '16:30', top: '#6F7FB8', low: '#E2BBAE', fog: '#C89A88' },
  { h: 18.75, label: '18:45', top: '#555079', low: '#F08A5A', fog: '#D9A37E' },
  { h: 19.333, label: '19:20', top: '#4A4A7C', low: null, fog: null },
  { h: 19.75, label: '19:45', top: '#2F3560', low: '#C46A7A', fog: '#7A6474' },
  { h: 23.0, label: '23:00', top: '#0D1220', low: '#1B2438', fog: '#20283A' },
];

/** Bible §9.3, verbatim. */
const BIOME_TABLE = {
  pans: { fog: '#CFD8DE', dens: 1.0, ev: -0.3 },
  holds: { fog: '#D9C3A2', dens: 1.3, ev: 0.0 },
  malpais: { fog: '#B9A08C', dens: 1.1, ev: 0.1 },
  cloudline: { fog: '#8E9A8C', dens: 3.0, ev: 0.2 },
  flank: { fog: '#C7CDD2', dens: 1.2, ev: 0.0 },
  caldera: { fog: '#BFD0E6', dens: 0.6, ev: -0.1 },
};

/** Stand on a pure-Pans spot (the grade at the camera is then the hour key's own). */
const PANS_SPOT = `
  const pansSpot = () => {
    const o = { mix: {}, fogTint: [1, 1, 1] };
    for (let r = 0; r <= 300; r += 20) for (let a = 0; a < 12; a++) {
      const x = Math.cos(a * 0.5236) * r, z = Math.sin(a * 0.5236) * r;
      env.gradeAt(x, z, gy(x, z) + 2, o);
      if (o.mix.pans > 0.995) return { x, z };
    }
    return null;
  };
`;

const GATES = [
  /* ------------------------------------------------------------ A-hour-keys */
  {
    id: 'A-hour-keys', kind: 'action', lane: LANE,
    title: 'Sky top, sky low band and fog at the amended bible §2.4 hours within ΔE 5 (pre-grade uniforms); the 05:30 key and the 05:24 / 19:54 troughs',
    timeout: 60000, settle: 1500,
    assert: `(async () => {
      ${KIT}
      ${PANS_SPOT}
      if (!env?.setTime || !env.skyKeys) return { pass: null, detail: 'SKIP: environment has no keyed sky' };
      const spot = pansSpot();
      if (spot) { ctx.player.position.set(spot.x, 0, spot.z); ctx.player._snapToGround?.(); }
      env.setWeather('trade', 0);
      await new Promise((r) => setTimeout(r, 200));
      const T = ${JSON.stringify(HOUR_TABLE)};
      const SK = env.skyKeys;
      const rows = [];
      let worst = 0;
      for (const k of T) {
        env.setTime(k.h);
        const tint = env.biomeFogTint;
        const fog = SK.fog.clone();
        // the bar is on the hour key: divide out the biome tint (1,1,1 on a pure-Pans spot)
        fog.r /= tint.r; fog.g /= tint.g; fog.b /= tint.b;
        const got = { top: col2(SK.top), low: col2(SK.low), fog: col2(fog) };
        const row = { hour: k.label };
        for (const f of ['top', 'low', 'fog']) {
          if (!k[f]) continue;
          const d = dE00(hex2(k[f]), got[f]);
          row[f] = { want: k[f], got: toHex(got[f]), dE00: +d.toFixed(2) };
          worst = Math.max(worst, d);
        }
        rows.push(row);
      }
      const keys = env.constructor.KEYS || [];
      const has0530 = keys.some((k) => Math.abs(k.h - 5.5) < 1e-3);
      env.setTime(5.4); const t1 = env.debugInfo().sunIntensity;
      env.setTime(19.9); const t2 = env.debugInfo().sunIntensity;
      env.setTime(${17.75});
      const pass = worst <= 5 && has0530 && t1 <= 0.15 && t2 <= 0.15;
      return { pass, detail: { worstDE00: +worst.toFixed(2), bar: 5, key0530: has0530,
        troughs: { '05:24': +t1.toFixed(3), '19:54': +t2.toFixed(3), bar: 0.15 },
        biomeAtCamera: env.biome, pansWeight: +(env.biomeMix.pans || 0).toFixed(3), rows } };
    })()`,
  },

  /* -------------------------------------------------------- A-weather-states */
  {
    id: 'A-weather-states', kind: 'action', lane: LANE,
    title: 'setWeather each state: fog colour/density within ±5 % after the fade; calima disc ΔE ≤ 3 of #F2A27E; perceptionScale 1.0/0.5/0.5/0.8, 0.7 at night',
    timeout: 90000, settle: 1500,
    assert: `(async () => {
      ${KIT}
      ${PANS_SPOT}
      if (!env?.setWeather) return { pass: null, detail: 'SKIP: no setWeather' };
      hideHud();
      const spot = pansSpot();
      if (spot) { ctx.player.position.set(spot.x, 0, spot.z); ctx.player._snapToGround?.(); }
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      env.setWeather('trade', 0);
      env.setTime(12.0);
      await wait(300);
      const states = env.weatherStates;
      const want = {
        trade: { fog: '#CFD8DE', densX: 1, perc: 1.0, src: 'bible §2.4 12:00 fog' },
        calima: { fog: '#C98B4E', densX: 4, perc: 0.5, src: 'bible §2.3 / §9.3 calima ×4' },
        fogbank: { fog: '#CFD8DE', densX: 3, perc: 0.5, src: 'bible §2.3 ×3 (colour: the hour fog; the bible gives none)' },
        squall: { fog: null, densX: 1.6, perc: 0.8, src: 'bible §2.3 0.8 (density ×1.6 is this lane\\'s table; the bible gives none)' },
      };
      const rel = (a, b) => Math.max(...[0, 1, 2].map((i) => Math.abs(a[i] - b[i]) / Math.max(b[i], 32)));
      env.setWeather('trade', 0); await wait(200);
      const D0 = env.u.calFogA.value.x;
      const rows = {};
      let ok = states.join() === 'trade,calima,fogbank,squall';
      for (const s of states) {
        env.setWeather(s, 0.6);          // a real fade, then read after it
        await wait(1100);
        const fog = col2(env.skyKeys.fog);
        const dens = env.u.calFogA.value.x;
        const r = { fog: toHex(fog), densityX: +(dens / D0).toFixed(3), perceptionScale: +env.perceptionScale.toFixed(3), src: want[s].src };
        r.densOk = Math.abs(dens / D0 - want[s].densX) <= 0.05 * want[s].densX;
        r.fogOk = want[s].fog ? rel(fog, hex2(want[s].fog)) <= 0.05 : true;
        if (want[s].fog) r.fogRelErr = +rel(fog, hex2(want[s].fog)).toFixed(3);
        r.percOk = Math.abs(env.perceptionScale - want[s].perc) < 0.011;
        r.fadeDone = env.weatherParams && Math.abs((env.weatherParams.densMul ?? 0) - (env.states[s]?.densMul ?? -1)) < 1e-6;
        ok = ok && r.densOk && r.fogOk && r.percOk && r.fadeDone;
        rows[s] = r;
      }
      // the calima disc: real pixels at the disc centre, camera looking straight at the sun
      env.setWeather('calima', 0); env.setTime(12.0);
      const saved = saveCam();
      const p = ctx.player.position;
      const sd = env.sunDir.clone();
      const eye = new V(p.x, gy(p.x, p.z) + 2, p.z);
      cam.up.set(0, 1, 0); cam.position.copy(eye); cam.lookAt(eye.x + sd.x * 100, eye.y + sd.y * 100, eye.z + sd.z * 100);
      cam.fov = 40; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
      draw(3);
      const disc = patchPx(Math.round(W() / 2), Math.round(H() / 2), 5);
      const ring = patchAt(eye.x + sd.x * 100 + 6, eye.y + sd.y * 100, eye.z + sd.z * 100 + 0, 5);
      restoreCam(saved);
      const discDE = disc ? dE00(disc, hex2('#F2A27E')) : 99;
      const uni = env.sky.material.uniforms.uDisc.value;
      rows.calima.disc = { renderedCentre: disc && toHex(disc), dE00: +discDE.toFixed(2), bar: 3, solvedLinear: uni.toArray().map((v) => +v.toFixed(3)), justOutside: ring && toHex(ring) };
      env.setWeather('trade', 0);
      env.setTime(23.0); await wait(200);
      const night = env.perceptionScale;
      env.setTime(17.75);
      const nightOk = Math.abs(night - 0.7) < 0.011;
      const pass = ok && discDE <= 3 && nightOk;
      return { pass, detail: { states, rows, night: { hour: 23, perceptionScale: +night.toFixed(3), bar: 0.7 }, tradeDensity: +D0.toFixed(6), biomeAtCamera: env.biome } };
    })()`,
  },

  /* --------------------------------------------------- A55 (re-staged, noon) */
  {
    id: 'A55-light-ratio', kind: 'action', lane: LANE,
    title: 'At noon in trade, shadowed ground under a raised caster (gatePlaces.windPump, else shadowCaster) is ≤ 55 % as bright as lit ground',
    timeout: 60000, settle: 2500,
    setup: placedSetup(['parkAway'], `(() => {
      __CTX__.environment.setWeather('trade', 0);
      __CTX__.environment.setTime(12.0);
      standAt(__CTX__.player, 'parkAway', { yaw: false });
    })();`),
    assert: `(async () => {${PLACES}
      ${KIT}
      const __pick = ['windPump', 'shadowCaster'].find((k) => PLACE(k));
      if (!__pick) return { pass: null, detail: 'SKIP-R18 (place) windPump, shadowCaster: not in ctx.props.gatePlaces and the W0 map table does not match this terrain' };
      const PL = PLACE(__pick);
      const PLAT_H = PL.h ?? 5;
      const shadowPoint = () => {
        const s = env.sunDir;
        const baseY = gy(PL.x, PL.z);
        let x = PL.x, z = PL.z;
        for (let i = 0; i < 3; i++) { const drop = (baseY + PLAT_H - gy(x, z)) / Math.max(0.05, s.y); x = PL.x - s.x * drop; z = PL.z - s.z * drop; }
        return { x, z };
      };
      await new Promise((r) => setTimeout(r, 400));
      const S = shadowPoint();
      const saved = saveCam();
      const y0 = gy(S.x, S.z);
      cam.up.set(0, 0, -1); cam.position.set(S.x, y0 + 14, S.z + 0.4); cam.lookAt(S.x, y0, S.z);
      cam.fov = 55; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
      draw(4);
      const w = W(), h = H();
      const bufA = grab();
      const props = ctx.scene.getObjectByName('world-props');
      if (!props) { restoreCam(saved); return { pass: null, detail: 'SKIP: no world-props group to prove the occluder with' }; }
      const was = props.visible; props.visible = false; draw(3);
      const bufB = grab();
      props.visible = was; draw(1); restoreCam(saved);
      const STEP = 2;
      const lum = (b, i) => lum8(b[i], b[i + 1], b[i + 2]);
      let maxLift = 0;
      for (let y = 0; y < h; y += STEP) for (let x = 0; x < w; x += STEP) { const i = (y * w + x) * 4; const l = lum(bufB, i) - lum(bufA, i); if (l > maxLift) maxLift = l; }
      if (!(maxLift > 0.12)) return { pass: false, detail: { note: 'no measurable shadow: hiding the occluder changed nothing', maxLift: +maxLift.toFixed(4), place: __pick } };
      let cx = 0, cy = 0, cn = 0;
      for (let y = 0; y < h; y += STEP) for (let x = 0; x < w; x += STEP) { const i = (y * w + x) * 4; if (lum(bufB, i) - lum(bufA, i) >= maxLift * 0.85) { cx += x; cy += y; cn++; } }
      cx /= cn; cy /= cn;
      const shade = [], lit = [];
      for (let y = 0; y < h; y += STEP) for (let x = 0; x < w; x += STEP) {
        const i = (y * w + x) * 4; const a = lum(bufA, i); const l = lum(bufB, i) - a; const r = Math.hypot(x - cx, y - cy);
        if (r > 320) continue;
        if (l >= maxLift * 0.75 && r <= 110) shade.push(a);
        else if (l <= maxLift * 0.06 && Math.abs(l) < 0.02 && r > 110) lit.push(a);
      }
      const med = (a) => { const s2 = a.slice().sort((x, y) => x - y); return s2[s2.length >> 1]; };
      if (shade.length < 40 || lit.length < 200) return { pass: null, detail: { note: 'SKIP: could not isolate umbra / lit ground', umbra: shade.length, lit: lit.length, place: __pick } };
      const sL = med(shade), lL = med(lit), ratio = sL / Math.max(1e-4, lL);
      return { pass: ratio <= 0.55 && lL > 0.06, detail: { ratio: +ratio.toFixed(3), bar: 0.55, shadowLum: +sL.toFixed(4), litLum: +lL.toFixed(4),
        umbraPixels: shade.length, litPixels: lit.length, place: __pick + (__pick === 'shadowCaster' ? ' (W0 stand-in until world-props publishes windPump)' : ''),
        hour: env.time, weather: env.weather, sunElevDeg: +elevOf(env.sunDir).toFixed(1), sunBearing: +bearingOf(env.sunDir).toFixed(1),
        sunI: +env.debugInfo().sunIntensity.toFixed(2), envIntensity: +ctx.scene.environmentIntensity.toFixed(3), environment: ctx.scene.environment?.name } };
    })()`,
  },

  /* ---------------------------------------------- A56 (carried bar, shadowed) */
  {
    id: 'A56-cascades', kind: 'action', lane: LANE,
    title: '3 cascades, near texel ≤2 cm/px, casters culled beyond 120 m, grass+bush cast',
    settle: 3000, timeout: 45000,
    assert: `(async () => {
      const ctx = __CTX__, engine = ctx.engine;
      const csm = engine.csm;
      if (!csm) return { pass: false, detail: 'no engine.csm — cascades are not wired' };
      await new Promise(r => setTimeout(r, 400));
      const cascades = csm.cascades;
      const near = csm.lights[0].shadow.camera;
      const texel = (near.right - near.left) / csm.shadowMapSize;
      const cull = engine.shadowCullDistance;
      const camPos = ctx.camera.position;
      let worst = 0, worstName = '', casters = 0, grass = 0, bush = 0, overCount = 0;
      ctx.scene.traverse((o) => {
        if (!o.isMesh) return;
        const n = o.name || '';
        if (n.startsWith('grass-chunk') && (o.castShadow || o.userData.__shadowBase)) grass++;
        if (n.startsWith('bushes-') && (o.castShadow || o.userData.__shadowBase)) bush++;
        if (!o.castShadow || !o.visible) return;
        casters++;
        let r = o.geometry?.boundingSphere?.radius;
        if (r == null) { o.geometry?.computeBoundingSphere?.(); r = o.geometry?.boundingSphere?.radius ?? 0; }
        const e = o.matrixWorld.elements;
        const sc = Math.sqrt(Math.max(e[0]*e[0]+e[1]*e[1]+e[2]*e[2], e[4]*e[4]+e[5]*e[5]+e[6]*e[6], e[8]*e[8]+e[9]*e[9]+e[10]*e[10]));
        const dx = e[12]-camPos.x, dy = e[13]-camPos.y, dz = e[14]-camPos.z;
        const d = Math.max(0, Math.sqrt(dx*dx+dy*dy+dz*dz) - r * sc);
        if (d > worst) { worst = d; worstName = n || o.type; }
        if (d > cull + 2) overCount++;
      });
      const ok = cascades >= 3 && texel <= 0.02 && cull <= 120 && overCount === 0 && grass > 0 && bush > 0;
      return { pass: ok, detail: { cascades, nearTexelCm: +(texel * 100).toFixed(2), shadowMapSize: csm.shadowMapSize,
        cascadeFarM: csm.breaks.map(b => +(b * csm.maxFar).toFixed(1)), shadowCullDistance: cull, castersBeyondCull: overCount,
        farthestCasterM: +worst.toFixed(1), farthestCaster: worstName, grassCasterChunks: grass, bushCasterMeshes: bush,
        note: 'bar unchanged from Round 4 (plan §9: carry)' } };
    })()`,
  },

  /* ---------------------------------------------------- A57 (re-staged) */
  {
    id: 'A57-aerial', kind: 'action', lane: LANE,
    title: 'Aerial perspective: fog transmittance at 300 m 0.55–0.70 in trade, 0.20–0.40 in calima; the rendered haze moves pixels toward the in-scatter',
    settle: 2500, timeout: 90000,
    setup: `(() => { __CTX__.environment.setWeather('trade', 0); __CTX__.environment.setTime(12.0); })();`,
    assert: placed(['aerialStation'], `(async () => {
      ${KIT}
      if (!env?.fogParams) return { pass: null, detail: 'SKIP: no environment.fogParams' };
      const AS = PLACE('aerialStation');
      const p = ctx.player;
      p.position.set(AS.x, 0, AS.z); p._snapToGround?.();
      await new Promise(r => setTimeout(r, 400));
      const camY = gy(AS.x, AS.z) + 2.0;
      env.setWeather('trade', 0); env.setTime(12.0);
      const Ttrade = env.fogParams.transmittance(300, camY, camY);
      const profTrade = [100, 200, 300, 500, 900].map((d) => [d, +env.fogParams.transmittance(d, camY, camY).toFixed(3)]);
      env.setWeather('calima', 0);
      const Tcal = env.fogParams.transmittance(300, camY, camY);
      const profCal = [100, 200, 300, 500, 900].map((d) => [d, +env.fogParams.transmittance(d, camY, camY).toFixed(3)]);
      env.setWeather('trade', 0);

      /* the shader really applies it: the same distant ground with the aerial term off,
         on, and saturated; on must sit between (mist and cloud sea held off for the proof) */
      const saved = saveCam();
      const cy = gy(AS.x, AS.z) + 3.2;
      const A = env.u.calFogA.value, C = env.u.calFogC.value, Dd = env.u.calFogD.value;
      const a0 = A.x, c0 = C.x, d0 = Dd.x, f0 = ctx.scene.fog.density;
      const setDens = (d) => { A.x = d; ctx.scene.fog.density = d; };
      C.x = 0; Dd.x = 0;
      const rows = [];
      for (const B of [0.4, 1.3, 1.9, 2.6, 3.4, 4.2, 4.9, 5.6]) {
        const dx = Math.sin(B), dz = Math.cos(B);
        cam.up.set(0, 1, 0); cam.position.set(AS.x, cy, AS.z); cam.lookAt(AS.x + dx * 400, cy, AS.z + dz * 400);
        cam.fov = 55; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
        const tg = [240, 290].map(D => [AS.x + dx * D, gy(AS.x + dx * D, AS.z + dz * D) + 1.0, AS.z + dz * D]);
        setDens(a0); draw(3); const on = tg.map((t) => patchAt(t[0], t[1], t[2]));
        setDens(0); draw(2); const off = tg.map((t) => patchAt(t[0], t[1], t[2]));
        setDens(0.05); draw(2); const full = tg.map((t) => patchAt(t[0], t[1], t[2]));
        for (let i = 0; i < 2; i++) {
          if (!on[i] || !off[i] || !full[i]) continue;
          if (Math.max(...off[i]) > 245 || Math.max(...full[i]) > 250) continue;
          const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 255;
          const dOn = dist(on[i], full[i]), dOff = dist(off[i], full[i]);
          if (dOff < 0.08) continue;
          rows.push({ bearing: +B.toFixed(2), dist: [240, 290][i], on: on[i], off: off[i], full: full[i],
            towardHaze: dOn < dOff - 0.01, shift: +dist(on[i], off[i]).toFixed(3), renderedRatio: +(dOn / dOff).toFixed(3) });
        }
      }
      setDens(a0); C.x = c0; Dd.x = d0; ctx.scene.fog.density = f0;
      draw(1); restoreCam(saved);
      const measurable = rows.filter(r => r.shift > 0.05);
      const contra = measurable.filter(r => !r.towardHaze);
      const empiricalOk = measurable.length >= 3 && contra.length === 0;
      const ok = Ttrade >= 0.55 && Ttrade <= 0.70 && Tcal >= 0.20 && Tcal <= 0.40 && empiricalOk;
      return { pass: ok, detail: {
        trade300m: +Ttrade.toFixed(3), tradeBar: [0.55, 0.70], calima300m: +Tcal.toFixed(3), calimaBar: [0.20, 0.40],
        hour: 12, camY: +camY.toFixed(2), biomeAtCamera: env.biome,
        profileTrade: profTrade, profileCalima: profCal,
        ridges: env.ridges ? 'present' : 'none (L-15: the Round-4 rings are gone; the rim-lit clause has no subject)',
        measurableSamples: measurable.length, samplesMovingAwayFromHaze: contra.length, samples: rows } };
    })()`),
  },

  /* ------------------------------------------------------------ A-cloud-sea */
  {
    id: 'A-cloud-sea', kind: 'action', lane: LANE,
    title: 'From the caldera rim at 07:00, windward slopes below 150 m read as cloud (luminance ≥ 0.75 of sky); 0 transparent planes (draw delta 0)',
    timeout: 90000, settle: 2000,
    assert: `(async () => {${PLACES}
      ${KIT}
      if (!env?.u?.calFogD) return { pass: null, detail: 'SKIP: no cloud-sea term' };
      hideHud();
      env.setWeather('trade', 0); env.setTime(7.0);
      await new Promise(r => setTimeout(r, 300));
      // the station: gatePlaces.calderaRim when world-props/world-ground publish it; else the
      // highest ground in the play disc, raised to rim height (named stand-in on this terrain)
      let st = PLACE('calderaRim'), standIn = false;
      if (!st) { st = { x: 0, z: 0 }; standIn = true; }
      const gyS = gy(st.x, st.z);
      const eyeY = Math.max(gyS + 2, 205);
      const wf = { x: Math.SQRT1_2, z: -Math.SQRT1_2 };       // the trade blows FROM bearing 045
      // windward ground below 140 m, well inside the windward half, seen from the rim
      const pts = [];
      for (let b = 25; b <= 65; b += 5) for (let d = 160; d <= 760; d += 30) {
        const br = b * Math.PI / 180;
        const x = st.x + Math.sin(br) * d, z = st.z - Math.cos(br) * d, y = gy(x, z);
        // inside the terrain mesh only (a point past its edge would sample sky, not ground)
        if (Math.abs(x) < 460 && Math.abs(z) < 460 && y < 140 && y > -2 && x * wf.x + z * wf.z > 160) pts.push([x, y + 0.5, z]);
      }
      const saved = saveCam();
      hideHero();
      aim(st.x, eyeY, st.z, 45, -14, 55);
      const skyDir = { b: 45 * Math.PI / 180, e: 9 * Math.PI / 180 };
      const skyPt = [st.x + Math.sin(skyDir.b) * Math.cos(skyDir.e) * 1500, eyeY + Math.sin(skyDir.e) * 1500, st.z - Math.cos(skyDir.b) * Math.cos(skyDir.e) * 1500];
      const D = env.u.calFogD.value; const d0 = D.x;
      draw(3);
      const info = renderer.info.render.calls;
      const onB = grab();
      const onS = pts.map((p) => patchAt(p[0], p[1], p[2], 7));
      const skyC = patchAt(skyPt[0], skyPt[1], skyPt[2], 9);
      D.x = 0; draw(3);
      const offCalls = renderer.info.render.calls;
      const offS = pts.map((p) => patchAt(p[0], p[1], p[2], 7));
      const offB = grab();
      D.x = d0; draw(1);
      const frames = [onB, offB];
      restoreCam(saved);
      let n = 0, ok = 0; const ratios = [], lifts = [];
      const skyL = skyC ? lum8(...skyC) : null;
      for (let i = 0; i < pts.length; i++) {
        if (!onS[i] || !offS[i] || !skyL) continue;
        // a sample the deck does not touch (occluded by nearer ground, or sky) is not evidence either way
        if (Math.abs(lum8(...onS[i]) - lum8(...offS[i])) < 0.02 && lum8(...offS[i]) > skyL * 0.9) continue;
        n++;
        const r = lum8(...onS[i]) / skyL; ratios.push(r); lifts.push(lum8(...onS[i]) - lum8(...offS[i]));
        if (r >= 0.75) ok++;
      }
      ratios.sort((a, b) => a - b); lifts.sort((a, b) => a - b);
      const med = (a) => a.length ? a[a.length >> 1] : null;
      let planes = 0;
      ctx.scene.traverse((o) => { if (o.isMesh && o.material?.transparent && /cloud|deck|sea-?fog/i.test(o.name || '') ) planes++; });
      sheet(frames, ['07:00 trade, cloud sea ON (calFogD.x=' + d0.toFixed(3) + ')' + (standIn ? ' — rim stand-in at ' + eyeY.toFixed(0) + ' m' : ''), 'control: cloud sea OFF'], 1);
      const medRatio = med(ratios);
      const pass = n >= 8 && medRatio >= 0.75 && ok / n >= 0.6 && med(lifts) > 0.04 && offCalls === info && planes === 0;
      return { pass, detail: { samples: n, medianLumRatio: medRatio && +medRatio.toFixed(3), bar: 0.75, fractionAtBar: n ? +(ok / n).toFixed(2) : 0,
        medianLiftOverControl: med(lifts) && +med(lifts).toFixed(3), skyLum: skyL && +skyL.toFixed(3), sky: skyC && toHex(skyC),
        drawCallsOn: info, drawCallsOff: offCalls, drawDelta: info - offCalls, transparentCloudPlanes: planes,
        station: standIn ? 'stand-in: the island centre with the eye raised to ' + eyeY.toFixed(0) + ' m (rim height; no gatePlaces.calderaRim on this terrain)' : 'gatePlaces.calderaRim',
        slab: { base: D.y, top: D.z, density: +d0.toFixed(4) } } };
    })()`,
  },

  /* ---------------------------------------------------------- A-biome-grade */
  {
    id: 'A-biome-grade', kind: 'action', lane: LANE,
    title: 'Walk across a biome border: exposure changes ≤ 0.05 EV per frame (and does change); the six bible §9.3 rows are the live grade',
    timeout: 120000, settle: 1500,
    assert: `(async () => {
      ${KIT}
      if (!env?.gradeAt) return { pass: null, detail: 'SKIP: no environment.gradeAt' };
      env.setWeather('trade', 0); env.setTime(12.0);
      const BT = ${JSON.stringify(BIOME_TABLE)};
      const B = env.constructor.BIOMES || {};
      // 1. the table is the bible's, all six rows
      const table = {};
      let tableOk = true;
      for (const id of Object.keys(BT)) {
        const r = B[id];
        const okRow = !!r && r.fog.toUpperCase() === BT[id].fog && Math.abs(r.dens - BT[id].dens) < 1e-6 && Math.abs(r.ev - BT[id].ev) < 1e-6;
        table[id] = okRow ? 'ok' : r ? { fog: r.fog, dens: r.dens, ev: r.ev } : 'missing';
        tableOk = tableOk && okRow;
      }
      // 2. where each biome dominates on this terrain, the live grade is its row
      const o = { mix: {}, fogTint: [1, 1, 1] };
      const found = {};
      for (let r = 0; r <= 330; r += 12) for (let a = 0; a < 36; a++) {
        const x = Math.cos(a * 0.1745) * r, z = Math.sin(a * 0.1745) * r;
        env.gradeAt(x, z, gy(x, z) + 2, o);
        const id = o.biome;
        if (o.mix[id] > 0.97 && !found[id]) found[id] = { x: +x.toFixed(1), z: +z.toFixed(1), ev: +o.ev.toFixed(3), dens: +o.dens.toFixed(3), wantEv: BT[id].ev, wantDens: BT[id].dens };
      }
      let liveOk = Object.keys(found).length > 0;
      for (const id in found) { const f = found[id]; if (Math.abs(f.ev - f.wantEv) > 0.01 || (id !== 'cloudline' && Math.abs(f.dens - f.wantDens) > 0.02)) liveOk = false; }
      // 3. a border: two points 20-60 m apart whose EVs differ by >= 0.25, then walk it at run speed
      let pair = null;
      const pts = [];
      for (let r = 0; r <= 300; r += 10) for (let a = 0; a < 48; a++) { const x = Math.cos(a * 0.1309) * r, z = Math.sin(a * 0.1309) * r; env.gradeAt(x, z, gy(x, z) + 2, o); pts.push([x, z, o.ev]); }
      outer: for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
        if (d >= 20 && d <= 60 && Math.abs(pts[i][2] - pts[j][2]) >= 0.25) { pair = [pts[i], pts[j]]; break outer; }
      }
      if (!pair) return { pass: null, detail: { note: 'SKIP: no biome border with an EV step on this terrain', table, tableOk, found } };
      const p = ctx.player;
      const [A, Bp] = pair;
      const len = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]);
      ctx.settings && (ctx.settings.cameraSmoothing = ctx.settings.cameraSmoothing ?? 1);
      p.position.set(A[0] - (Bp[0] - A[0]) / len * 10, 0, A[1] - (Bp[1] - A[1]) / len * 10); p._snapToGround?.();
      await new Promise(r => setTimeout(r, 1500));
      const evs = [], dts = [];
      let s = -10, last = performance.now();
      while (s < len + 15) {
        await new Promise(r => requestAnimationFrame(r));
        const now = performance.now(); const dt = (now - last) / 1000; last = now;
        s += 6.0 * Math.min(dt, 0.1);
        p.position.set(A[0] + (Bp[0] - A[0]) / len * s, p.position.y, A[1] + (Bp[1] - A[1]) / len * s); p._snapToGround?.();
        evs.push(env.exposureEV); dts.push(dt);
      }
      for (let k = 0; k < 90; k++) { await new Promise(r => requestAnimationFrame(r)); evs.push(env.exposureEV); }
      let maxStep = 0; for (let i = 1; i < evs.length; i++) maxStep = Math.max(maxStep, Math.abs(evs[i] - evs[i - 1]));
      const moved = Math.max(...evs) - Math.min(...evs);
      const pass = tableOk && liveOk && maxStep <= 0.05 && moved >= 0.2;
      const sdt = dts.slice().sort((a, b) => a - b);
      return { pass, detail: { maxEvStepPerFrame: +maxStep.toFixed(4), bar: 0.05, evMoved: +moved.toFixed(3), frames: evs.length,
        medianFrameMs: +(sdt[sdt.length >> 1] * 1000).toFixed(1),
        border: { from: [+A[0].toFixed(1), +A[1].toFixed(1), A[2]], to: [+Bp[0].toFixed(1), +Bp[1].toFixed(1), Bp[2]], metres: +len.toFixed(1) },
        evTrace: evs.filter((_, i) => i % 6 === 0).map((v) => +v.toFixed(3)), table, tableOk, liveBiomes: found, liveOk } };
    })()`,
  },

  /* ------------------------------------------------------------- A-no-river */
  {
    id: 'A-no-river', kind: 'action', lane: LANE,
    title: 'RiverWater absent (source and scene); water draws = sea + Glass + ribbons only',
    timeout: 45000, settle: 1500,
    assert: `(async () => {
      ${KIT}
      const src = await (await fetch('/src/world/environment.js')).text();
      const imports = (src.match(/import[^;]*\\bRiverWater\\b[^;]*;/g) || []).length;
      const news = (src.match(/new\\s+RiverWater\\b/g) || []).length;
      let mainSrc = '';
      try { mainSrc = await (await fetch('/src/main.js')).text(); } catch (e) { mainSrc = ''; }
      const mainNews = (mainSrc.match(/RiverWater/g) || []).length;
      let riverObjs = 0; const waterMeshes = []; const bad = [];
      ctx.scene.traverse((o) => {
        const n = o.name || '';
        if (/river/i.test(n)) riverObjs++;
      });
      const groups = new Set();
      const W0 = ctx.water || env.water;
      if (W0?.group) groups.add(W0.group);
      const named = ctx.scene.getObjectByName('water'); if (named) groups.add(named);
      for (const g of groups) g.traverse((o) => { if (o.isMesh) { waterMeshes.push(o.name || o.type); if (!/sea|glass|offing|ribbon|fall/i.test(o.name || '')) bad.push(o.name || o.type); } });
      const isRiverInstance = !!(env.water && env.water.constructor && /River/.test(env.water.constructor.name) && !/Island/.test(env.water.constructor.name));
      const pass = imports === 0 && news === 0 && mainNews === 0 && riverObjs === 0 && bad.length === 0 && !isRiverInstance;
      return { pass, detail: { riverWaterImports: imports, newRiverWater: news, mainRefs: mainNews, sceneObjectsNamedRiver: riverObjs,
        waterMeshes, nonSeaGlassRibbon: bad, envWater: env.water ? env.water.constructor?.name : null,
        note: waterMeshes.length ? null : 'this tree carries no island water yet (world-ground W1 brings the sea, the Glass and the offing); 0 water draws' } };
    })()`,
  },

  /* ------------------------------------------------------------- A-look-ibl */
  {
    id: 'A-look-ibl', kind: 'action', lane: LANE,
    title: 'Sky-captured IBL: scene.environment is CAL.skyIBL, no RoomEnvironment; +Y/−Y faces follow the keys; rebakes allocate nothing',
    timeout: 60000, settle: 1500,
    assert: `(async () => {
      ${KIT}
      const src = await (await fetch('/src/world/environment.js')).text();
      const room = (src.match(/import[^;]*RoomEnvironment/g) || []).length;
      const envName = ctx.scene.environment?.name || null;
      env.setWeather('trade', 0); env.setTime(16.5);
      const I = env._ibl;
      if (!I) return { pass: false, detail: { note: 'no IBL built', envName, room } };
      const read = (face) => {
        const n = I.size, buf = new Uint16Array(n * n * 4);
        renderer.readRenderTargetPixels(I.cubeRT, 0, 0, n, n, buf, face);
        let r = 0, g = 0, b = 0;
        const c = n >> 1, R = Math.max(2, n >> 3);
        let k = 0;
        for (let y = c - R; y < c + R; y++) for (let x = c - R; x < c + R; x++) { const i = (y * n + x) * 4; r += THREE_HF(buf[i]); g += THREE_HF(buf[i + 1]); b += THREE_HF(buf[i + 2]); k++; }
        return [r / k, g / k, b / k];
      };
      const THREE_HF = (h) => { const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff; return e === 0 ? s * Math.pow(2, -14) * (f / 1024) : e === 31 ? (f ? NaN : s * Infinity) : s * Math.pow(2, e - 15) * (1 + f / 1024); };
      const hue = (c) => { const [L, a, b] = lab(c); return (Math.atan2(b, a) * 180 / Math.PI + 360) % 360; };
      const toS = (lin) => lin.map((v) => Math.round(255 * Math.min(1, v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)));
      const hd = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
      const up = read(2), dn = read(3);
      const top = env.skyKeys.top, gnd = env.hemi.groundColor;
      const upHue = hue(toS(up)), topHue = hue(col2(top));
      const dnHue = hue(toS(dn)), gndHue = hue(col2(gnd));
      const upLum = 0.2126 * up[0] + 0.7152 * up[1] + 0.0722 * up[2];
      const topLum = 0.2126 * top.r + 0.7152 * top.g + 0.0722 * top.b;
      // 10 forced rebakes: no texture or geometry growth, timed
      const tex0 = renderer.info.memory.textures, geo0 = renderer.info.memory.geometries;
      const tFace = [], tPm = [];
      const px = new Uint8Array(4);
      for (let i = 0; i < 10; i++) {
        for (let f = 0; f < 6; f++) { const t0 = performance.now(); env._renderIBLFace(f); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); tFace.push(performance.now() - t0); }
        const t0 = performance.now(); env._filterIBL(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); tPm.push(performance.now() - t0);
      }
      const tex1 = renderer.info.memory.textures, geo1 = renderer.info.memory.geometries;
      const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
      const ledger = engine.renderTargetLedger ? engine.renderTargetLedger().map((r) => ({ owner: r.owner, name: r.name, w: r.width, h: r.height, mb: r.mb })) : [];
      const roomPm = ledger.filter((r) => r.w === 768 && r.h === 1024);
      env.setTime(17.75);
      const a = envName === 'CAL.skyIBL' && room === 0;
      const b = hd(upHue, topHue) <= 25 && Math.abs(upLum / topLum - 1) <= 0.30 && hd(dnHue, gndHue) <= 25;
      const c = tex1 === tex0 && geo1 === geo0;
      const d = roomPm.length === 0;
      return { pass: a && b && c && d, detail: {
        a: { environment: envName, roomEnvironmentImports: room },
        b: { upHue: +upHue.toFixed(1), topKeyHue: +topHue.toFixed(1), upLumOverTopKey: +(upLum / topLum).toFixed(3), downHue: +dnHue.toFixed(1), groundKeyHue: +gndHue.toFixed(1), up: toHex(toS(up)), down: toHex(toS(dn)) },
        c: { textures: [tex0, tex1], geometries: [geo0, geo1], faceMsMedian: +med(tFace).toFixed(3), faceMsMax: +Math.max(...tFace).toFixed(3), pmremMsMedian: +med(tPm).toFixed(3), pmremMsMax: +Math.max(...tPm).toFixed(3), note: 'CPU submit + 1 px readback sync; the quiet-box GPU timing is the orchestrator\\'s (R45)' },
        d: { roomPmremTargets: roomPm.length, envRows: ledger.filter((r) => /^env:/.test(r.owner)) } } };
    })()`,
  },

  /* ------------------------------------------------------------- A-sky-last */
  {
    id: 'A-sky-last', kind: 'action', lane: LANE,
    title: 'The sky is the last opaque draw (z = w, LEQUAL); order-independent pixels; no fbm outside the night branch',
    timeout: 60000, settle: 1500,
    assert: `(async () => {
      ${KIT}
      env.setWeather('trade', 0); env.setTime(16.5);
      const sky = env.sky;
      // (a) a plain render of the scene: inspect the opaque list it sorted
      const saved = saveCam();
      aim(ctx.player.position.x, gy(ctx.player.position.x, ctx.player.position.z) + 2, ctx.player.position.z, 200, 4, 55);
      renderer.render(ctx.scene, cam);
      const list = renderer.renderLists.get(ctx.scene, 0);
      const opaque = list?.opaque || [];
      const lastIsSky = opaque.length > 0 && opaque[opaque.length - 1].object === sky;
      // (b) order independence: drawn first vs last, same pixels
      draw(3); const A = grab();
      const ro = sky.renderOrder; sky.renderOrder = -1000; draw(3); const B = grab(); sky.renderOrder = ro; draw(1);
      restoreCam(saved);
      let same = 0, n = 0;
      for (let i = 0; i < A.length; i += 4) { n++; if (Math.abs(A[i] - B[i]) <= 1 && Math.abs(A[i + 1] - B[i + 1]) <= 1 && Math.abs(A[i + 2] - B[i + 2]) <= 1) same++; }
      const m = sky.material;
      const vs = m.vertexShader || '', fs = m.fragmentShader || '';
      const zw = /gl_Position\\.z\\s*=\\s*gl_Position\\.w/.test(vs);
      const fbm = (fs.match(/\\bfbm\\s*\\(/g) || []).length;
      env.setTime(17.75);
      const pass = lastIsSky && sky.renderOrder >= 1000 && m.depthFunc === 3 /* LessEqualDepth */ && m.depthTest && !m.depthWrite && zw && same / n >= 0.999 && fbm === 0;
      return { pass, detail: { lastOpaqueIsSky: lastIsSky, opaqueCount: opaque.length, renderOrder: sky.renderOrder, depthFunc: m.depthFunc, depthWrite: m.depthWrite, zEqualsW: zw,
        orderIndependentFraction: +(same / n).toFixed(5), fbmCallsInSkyShader: fbm, noise: m.uniforms.uNoise?.value?.name,
        c: 'PENDING-orchestrator: the interleaved A/B timing (noise row, order row) runs on the quiet box (R45, LOOK L-16)' } };
    })()`,
  },

  /* ---------------------------------------------------- A-look-sunpath-dwell */
  {
    id: 'A-look-sunpath-dwell', kind: 'action', lane: LANE,
    title: 'Noon in the south (28° N); golden clock: ≥ 30 % golden, ≤ 22 % night, 1800 s ± 1 %, rate change ≤ 10 %/frame; start hours',
    timeout: 45000, settle: 1000,
    assert: `(async () => {
      ${KIT}
      const E = env.constructor;
      const d = new V();
      const b = (h) => bearingOf(E.direction(h, d)), e = (h) => elevOf(E.direction(h, d));
      let peak = -99; for (let h = 6; h <= 19.5; h += 0.01) peak = Math.max(peak, e(h));
      const a = { b1245: +b(12.75).toFixed(2), b1200: +b(12.0).toFixed(2), peakElev: +peak.toFixed(2), sunrise: +b(6.0).toFixed(1), sunset: +b(19.5).toFixed(1), pumpShadow1200: +((b(12.0) + 180) % 360).toFixed(1) };
      const aOk = Math.abs(a.b1245 - 180) <= 5 && Math.abs(a.b1200 - 168) <= 5 && Math.abs(peak - 50) <= 1 && a.sunrise >= 65 && a.sunrise <= 75 && a.sunset >= 285 && a.sunset <= 295 && Math.abs(a.pumpShadow1200 - 348) <= 8;
      // (b)(c) a 24 h simulation in 1/60 s steps of the live clock rate
      const clk = env.clock; env.clock = 'golden';
      let h = 0, t = 0, gold = 0, night = 0, maxStep = 0, prev = null;
      while (h < 24) { const r = env.clockRate(h); if (prev) maxStep = Math.max(maxStep, Math.abs(r / prev - 1)); prev = r; const el = e(h); if (el >= 2 && el <= 22) gold++; if (el < -4) night++; h += r / 60; t++; }
      env.clock = clk;
      const secs = t / 60;
      const bOk = gold / t >= 0.30 && night / t <= 0.22 && Math.abs(secs - 1800) <= 18;
      const cOk = maxStep <= 0.10;
      const hours = E.HOURS || {};
      const eOk = hours.newGame === 7 && hours.title === 17.75 && hours.shot === 17.75;
      // the 0:55 beat at noon: a free-running 1800 s day cannot put 55 real minutes after 07:00 at noon
      let hh = 7, tt = 0; while (tt < 55 * 60) { hh += env.clockRate(hh % 24) / 60; tt += 1 / 60; }
      return { pass: aOk && bOk && cOk && eOk, detail: { a, aOk, b: { goldenFraction: +(gold / t).toFixed(4), nightFraction: +(night / t).toFixed(4), daySeconds: +secs.toFixed(1) }, bOk,
        c: { maxRateChangePerFrame: +maxStep.toFixed(5) }, cOk, e: { hours, bootHourUnderShot: null }, eOk,
        beat055: { hourAfter55RealMinutesFrom0700: +(hh % 24).toFixed(2), status: 'PENDING-progression W3: the first-hour script must set or rest the clock to put the 0:55 beat at 12:00 ± 0:30; no clock rate can (55 min is 1.8 days at 1800 s/day)' } } };
    })()`,
  },

  /* ---------------------------------------------------------------- V-calima */
  {
    id: 'V-calima', kind: 'visual', lane: LANE,
    reference: 'reference/r5/brand/calima-dawn-maspalomas.jpg (licence-clean, A-reference-set); ext:kevin-nov6-board.jpg@f2694e04#2-BR (THE CALIMA card: light and haze only)',
    title: 'Pans at noon in calima: ochre flat sky, coral disc sun, soft shadows, lamps readable at 40 m',
    timeout: 120000, settle: 2500,
    setup: `(async () => {${PLACES}${ROSTER}${SKIP_CARD}
      ${KIT}
      hideHud();
      env.setWeather('calima', 0); env.setTime(12.0);
      const st = PLACE('look')?.field || PLACE('spawnVista');
      if (!st) { __skipCard('SKIP-R18 (place) spawnVista'); return; }
      const p = ctx.player;
      p.position.set(st.x, 0, st.z); p._snapToGround?.();
      const sd = env.sunDir.clone();
      const sunB = bearingOf(sd);
      // an Instrument 40 m out, across the sun, so its lamp reads against the dust
      const lb = (sunB + 70) * Math.PI / 180;
      const mx = p.position.x + Math.sin(lb) * 40, mz = p.position.z - Math.cos(lb) * 40;
      let m = null;
      const a = anyKind();
      if (a.kind) { try { m = spawnRole(a.role, mx, mz); } catch (e) { m = null; } }
      await new Promise((r) => setTimeout(r, 2500));
      const ey = gy(p.position.x, p.position.z) + 1.7;
      const frames = [], labels = [];
      const shot = (b, pch, fov, lab) => { aim(p.position.x, ey, p.position.z, b, pch, fov); draw(4); frames.push(grab()); labels.push(lab); };
      shot(sunB, 30, 62, 'into the sun (bearing ' + sunB.toFixed(0) + ', disc at ' + elevOf(sd).toFixed(0) + '°), 12:00 calima');
      shot(sunB + 70, 3, 55, 'across: an Instrument at 40 m (' + (a.kind || 'none staged') + ')');
      shot(sunB + 180, -6, 55, 'away from the sun: soft shadows');
      // the hero at 6 m, her shadow on the ground
      const hb = (sunB + 120) * Math.PI / 180;
      cam.up.set(0, 1, 0); cam.position.set(p.position.x + Math.sin(hb) * 6, ey + 0.6, p.position.z - Math.cos(hb) * 6);
      cam.lookAt(p.position.x, ey - 0.8, p.position.z); cam.fov = 45; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
      draw(4); frames.push(grab()); labels.push('Brea at 6 m: shadow strength 0.45 (bible)');
      sheet(frames, labels, 2);
    })()`,
    criteria: 'Four frames at noon in calima on the Pans stand-in (W0 map until world-ground merges). Pass: the sky is a flat ochre/amber haze with no blue and no cloud field; the sun is a soft coral disc (#F2A27E family), not a white HDR glare; shadows are soft and weak (≈ 0.45 strength), not crisp black; the distance dissolves into ochre dust within a few hundred metres; an Instrument lamp at 40 m is still readable as a lamp. FAIL on a blue sky, a white sun, hard noon shadows, brown mud with no air, or a lamp lost in the haze. R54: FAIL if it looks cheap next to the reference (a muddy brown filter instead of luminous dust). IP-clause (R66 c): nothing from the refused sources, no red-eye glow.',
  },

  /* ------------------------------------------------------- V31 (re-staged) */
  {
    id: 'V31-night', kind: 'visual', lane: LANE,
    reference: 'reference/r5/gates-perf/night-stars (A-reference-set)',
    title: 'Night at 23:00: moonlit ground, stars, lamps and fire the only colour, no black mud',
    timeout: 90000, settle: 2600,
    setup: placedSetup(['spawnVista'], `(async () => {
      ${KIT}
      hideHud();
      env.setWeather('trade', 0); env.setTime(23.0);
      const p = ctx.player;
      standAt(p, 'spawnVista', { yaw: false });
      const mine = new Set([env.fireLight, ...env.eyeLights]);
      let fire = null;
      ctx.scene.traverse((o) => { if (!fire && o.isPointLight && !mine.has(o)) fire = o; });
      const t = fire ? fire.getWorldPosition(new V()) : null;
      if (t) { const l = Math.hypot(t.x - p.position.x, t.z - p.position.z) || 1; p.position.set(t.x - (t.x - p.position.x) / l * 11, 0, t.z - (t.z - p.position.z) / l * 11); p._snapToGround?.(); }
      await new Promise((r) => setTimeout(r, 1200));
      const ey = gy(p.position.x, p.position.z) + 1.7;
      const frames = [], labels = [];
      const md = env.moonDir.clone();
      aim(p.position.x, ey, p.position.z, bearingOf(md) + 25, Math.min(26, elevOf(md) - 6), 60); draw(4); frames.push(grab()); labels.push('23:00 toward the moon (' + elevOf(md).toFixed(0) + '° up): stars, moonlit ground');
      const fb = t ? bearingOf({ x: t.x - p.position.x, y: 0, z: t.z - p.position.z }) : 180;
      aim(p.position.x, ey, p.position.z, fb, 2, 55); draw(4); frames.push(grab()); labels.push('toward the rest-site fire (11 m)');
      aim(p.position.x, ey, p.position.z, bearingOf(md) + 180, 4, 55); draw(4); frames.push(grab()); labels.push('away from the moon: the ground still reads');
      aim(p.position.x, ey + 1, p.position.z, bearingOf(md) - 60, 38, 70); draw(4); frames.push(grab()); labels.push('the sky: stars');
      sheet(frames, labels, 2);
    })()`),
    criteria: 'Four night frames at 23:00. Pass: the ground reads as moonlit (cool, low, legible) without a torch; a moon and a dense field of stars; the fire and any Instrument lamps are the only saturated colour against the cool moonlight; no black mud where nothing reads, and not a daylight-bright night. FAIL on an unreadable black frame, no stars, or a sky brighter than a night sky. R54: FAIL if it looks cheap next to the reference.',
  },

  /* ------------------------------------------------------------ V-sky-trade */
  {
    id: 'V-sky-trade', kind: 'visual', lane: LANE,
    reference: 'reference/r5/gates-perf/golden-clouds.jpg and reference/r5/brand/salinas-de-janubio.jpg (A-reference-set); bible §9.4',
    title: 'Trade noon: flat-bottomed trade cumulus drifting SW; no radial god-ray spokes; not golden-hour drama',
    timeout: 90000, settle: 2500,
    setup: placedSetup(['spawnVista'], `(async () => {
      ${KIT}
      hideHud();
      env.setWeather('trade', 0); env.setTime(12.0);
      const p = ctx.player;
      standAt(p, 'spawnVista', { yaw: false });
      await new Promise((r) => setTimeout(r, 800));
      const ey = gy(p.position.x, p.position.z) + 1.7;
      const su = env.sky.material.uniforms;
      const frames = [], labels = [];
      aim(p.position.x, ey, p.position.z, 45, 8, 60); draw(3); frames.push(grab()); labels.push('12:00 trade, upwind (NE, 045)');
      const d0x = su.uDrift.value.x, d0y = su.uDrift.value.y;
      su.uDrift.value.set(d0x + env.wind.x * 1800, d0y + env.wind.z * 1800);   // ≈ 2.5 real minutes of drift
      draw(3); frames.push(grab()); labels.push('same view, clouds after ≈ 2.5 min: they move toward SW (away, down-left)');
      su.uDrift.value.set(d0x, d0y);
      const sb = bearingOf(env.sunDir);
      aim(p.position.x, ey, p.position.z, sb, 14, 60); draw(3); frames.push(grab()); labels.push('toward the noon sun (' + sb.toFixed(0) + '°, ' + elevOf(env.sunDir).toFixed(0) + '° up): no spokes');
      aim(p.position.x, ey, p.position.z, 225, 4, 60); draw(3); frames.push(grab()); labels.push('downwind (SW, 225): the sea line');
      sheet(frames, labels, 2);
    })()`),
    criteria: 'Four frames at trade noon. Pass: low, flat-bottomed trade cumulus/stratocumulus with lit tops and shaded flat bases, smaller and flatter toward the sea line; between frames 1 and 2 the field drifts toward the SW (downwind); no radial god-ray spokes around the sun; a clear maritime noon (blue overhead to pale haze at the sea line), not golden-hour drama (R66 j: graded at trade noon only). FAIL on wispy noise smears, a cloud layer that does not move, spokes from the sun, or orange golden light at noon. R54: FAIL if it looks cheap next to the reference.',
  },

  /* ------------------------------------------------- lane film sheets (advisory) */
  {
    id: 'V-sky-hours', kind: 'visual', lane: LANE,
    reference: 'lane film sheet (advisory, not a §9 row): the L-03 keys across the day',
    title: 'Lane sheet: nine hours of the trade day from the spawn vista, facing the sun',
    timeout: 120000, settle: 2500,
    setup: placedSetup(['spawnVista'], `(async () => {
      ${KIT}
      hideHud();
      env.setWeather('trade', 0);
      const p = ctx.player;
      standAt(p, 'spawnVista', { yaw: false });
      await new Promise((r) => setTimeout(r, 800));
      const ey = gy(p.position.x, p.position.z) + 1.7;
      const frames = [], labels = [];
      for (const [h, lab] of [[5.5, '05:30'], [7, '07:00'], [9.5, '09:30'], [12, '12:00'], [16.5, '16:30'], [17.75, '17:45'], [18.75, '18:45'], [19.75, '19:45'], [23, '23:00']]) {
        env.setTime(h);
        const s = env.sunDir.y > -0.05 ? env.sunDir : env.moonDir;
        const b = bearingOf(s) + 28, el = elevOf(s);
        aim(p.position.x, ey, p.position.z, b, Math.max(-2, Math.min(18, el * 0.5)), 62); draw(3);
        frames.push(grab()); labels.push(lab + ' trade  EV ' + env.exposureEV.toFixed(2) + '  ' + env.biome);
      }
      env.setTime(17.75);
      sheet(frames, labels, 3);
    })()`),
    criteria: 'Advisory lane sheet (the builder reads it; not graded): each hour should read as its bible/L-03 key, warm light split from violet-rose shadow and distance at 16:30–19:45, no royal-blue overhead at golden hours, a seamless sky–ground sea line.',
  },
  {
    id: 'V-sky-weathers', kind: 'visual', lane: LANE,
    reference: 'lane film sheet (advisory, not a §9 row): the four bible weathers',
    title: 'Lane sheet: trade, calima, fogbank and squall at 17:45 and noon from the spawn vista',
    timeout: 120000, settle: 2500,
    setup: placedSetup(['spawnVista'], `(async () => {
      ${KIT}
      hideHud();
      const p = ctx.player;
      standAt(p, 'spawnVista', { yaw: false });
      await new Promise((r) => setTimeout(r, 800));
      const ey = gy(p.position.x, p.position.z) + 1.7;
      const frames = [], labels = [];
      for (const h of [17.75, 12]) for (const w of ['trade', 'calima', 'fogbank', 'squall']) {
        env.setWeather(w, 0); env.setTime(h);
        const b = bearingOf(env.sunDir) + 35;
        aim(p.position.x, ey, p.position.z, b, 4, 62); draw(3);
        frames.push(grab()); labels.push(w + ' ' + (h === 12 ? '12:00' : '17:45') + '  perc ' + env.perceptionScale.toFixed(2) + '  EV ' + env.exposureEV.toFixed(2));
      }
      env.setWeather('trade', 0); env.setTime(17.75);
      sheet(frames, labels, 4);
    })()`),
    criteria: 'Advisory lane sheet: calima ochre and flat with a coral disc; fogbank a low white bank; squall dark and wet; trade clear.',
  },
];

export { GATES };
