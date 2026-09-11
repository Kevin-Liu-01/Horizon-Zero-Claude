/**
 * Round 4 gates — lane `world-light` (docs/ROUND4-AUDIT.md §4).
 *
 * Same contract as tools/gates.config.mjs: ACTION gates resolve { pass, detail }
 * in page context with __CTX__/__GAME__ available; VISUAL gates capture a
 * deterministic screenshot judged against `criteria`.
 *
 * Every measurement here is taken off REAL PIXELS from a real frame. The two
 * light-ratio samples are additionally proved to be a shadow and a lit patch by
 * re-rendering with the occluder hidden and checking which one brightens — a
 * lighting change that only moved numbers and not photons cannot pass.
 */

/**
 * Page-context kit: drive the engine's own camera, render a frame on demand,
 * and read the luminance of the real framebuffer at a set of world points.
 *
 * `engine.render()` is called directly rather than waiting on rAF so the read
 * happens in the same task as the draw — the drawing buffer is not preserved,
 * and a yield between them would return a cleared buffer.
 */
const KIT = `
  const ctx = __CTX__;
  const engine = ctx.engine;
  const renderer = ctx.renderer;
  const cam = ctx.camera;
  const env = ctx.environment;
  const V = ctx.player.position.constructor;
  const gl = renderer.getContext();

  /** Terrain height, falling back to 0 where the API is unavailable. */
  const gy = (x, z) => {
    const y = ctx.terrain?.getHeight?.(x, z);
    return Number.isFinite(y) ? y : 0;
  };

  /** Render N frames through the full composer with the CURRENT camera. */
  const draw = (n = 3) => {
    for (let i = 0; i < n; i++) {
      engine._shadowCullClock = 0;   // the cull pass is rate-limited to 10 Hz
      engine.render(0.05);
    }
  };

  /** Median relative luminance of an 11x11 patch centred on a world point. */
  const sampleLum = (p) => {
    const W = renderer.domElement.width, H = renderer.domElement.height;
    const v = new V(p.x, p.y, p.z).project(cam);
    if (!(v.z < 1)) return null;
    const px = Math.round((v.x * 0.5 + 0.5) * W);
    const py = Math.round((v.y * 0.5 + 0.5) * H);
    if (px < 6 || py < 6 || px > W - 7 || py > H - 7) return null;
    const buf = new Uint8Array(11 * 11 * 4);
    gl.readPixels(px - 5, py - 5, 11, 11, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const l = [];
    for (let i = 0; i < 121; i++) {
      l.push((0.2126 * buf[i * 4] + 0.7152 * buf[i * 4 + 1] + 0.0722 * buf[i * 4 + 2]) / 255);
    }
    l.sort((a, b) => a - b);
    return l[60];
  };

  /** Median RGB (0-1) of an 11x11 patch centred on a world point. */
  const sampleRGB = (p) => {
    const W = renderer.domElement.width, H = renderer.domElement.height;
    const v = new V(p.x, p.y, p.z).project(cam);
    if (!(v.z < 1)) return null;
    const px = Math.round((v.x * 0.5 + 0.5) * W);
    const py = Math.round((v.y * 0.5 + 0.5) * H);
    if (px < 6 || py < 6 || px > W - 7 || py > H - 7) return null;
    const buf = new Uint8Array(11 * 11 * 4);
    gl.readPixels(px - 5, py - 5, 11, 11, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const r = [], g = [], b = [];
    for (let i = 0; i < 121; i++) { r.push(buf[i * 4]); g.push(buf[i * 4 + 1]); b.push(buf[i * 4 + 2]); }
    const med = (a) => { a.sort((x, y) => x - y); return a[60] / 255; };
    return [med(r), med(g), med(b)];
  };

  const saveCam = () => ({
    p: cam.position.clone(), q: cam.quaternion.clone(),
    up: cam.up.clone(), fov: cam.fov,
  });
  const restoreCam = (s) => {
    cam.position.copy(s.p); cam.quaternion.copy(s.q); cam.up.copy(s.up);
    cam.fov = s.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  };
  /** Point the engine camera straight down at a world point from \`hAbove\` m. */
  const nadir = (x, z, hAbove) => {
    const y = gy(x, z);
    cam.up.set(0, 0, -1);
    cam.position.set(x, y + hAbove, z + 0.4);
    cam.lookAt(x, y, z);
    cam.fov = 55; cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
  };
`;

/**
 * Where the hunters' watchtower's platform shadow lands (props.js builds it at
 * x=33, z=-14 with a 5.4 m frame). Solved by marching the shadow ray twice so
 * the answer is right on sloped ground.
 */
const TOWER = `
  const TOWER_X = 33, TOWER_Z = -14, PLAT_H = 5.05;
  const shadowPoint = () => {
    const s = env.sunDir;
    const baseY = gy(TOWER_X, TOWER_Z);
    let x = TOWER_X, z = TOWER_Z;
    for (let i = 0; i < 3; i++) {
      const drop = (baseY + PLAT_H - gy(x, z)) / Math.max(0.05, s.y);
      x = TOWER_X - s.x * drop;
      z = TOWER_Z - s.z * drop;
    }
    return { x, z };
  };
`;

export const GATES = [
  /* ------------------------------------------------------------------ A55 */
  {
    id: 'A55-light-ratio', kind: 'action', lane: 'world-light',
    title: 'Shadowed ground is ≤55% as bright as lit ground under the watchtower',
    timeout: 60000,
    settle: 2500,
    setup: `(() => {
      __CTX__.environment.setWeather('clear', 0);
      __CTX__.environment.setTime(17.0);
      // Aloy out of shot and off the sample patch.
      __CTX__.player.position.set(-120, 0, 120);
      __CTX__.player._snapToGround?.();
    })();`,
    assert: `(async () => {
      ${KIT}
      ${TOWER}
      if (!env || !env.sunDir) return { pass: null, detail: 'SKIP: no environment.sunDir' };
      await new Promise(r => setTimeout(r, 400));

      const S = shadowPoint();

      /* ------------------------------------------------------------------
       * Look straight down at the ground the platform shadow falls across and
       * read the WHOLE frame twice: once as it renders, once with the props
       * (the tower is a merged mesh inside them) hidden. How much a pixel
       * brightens when the occluder is removed IS its direct-light
       * contribution, so the two populations are found, not assumed:
       *
       *   umbra  = lift >= 75% of the deepest lift anywhere in frame
       *   lit    = lift <= 6% of it (and under the 8-bit noise floor)
       *   between = penumbra, and belongs to neither
       *
       * That survives world-props moving or rebuilding the watchtower, cannot
       * be satisfied by a scene where nothing casts a shadow, and cannot be
       * gamed by picking a friendly pixel: both sides are medians over
       * thousands of samples of the same ground.
       * ------------------------------------------------------------------ */
      const saved = saveCam();
      nadir(S.x, S.z, 14);
      draw(4);
      const W = renderer.domElement.width, H = renderer.domElement.height;
      const bufA = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, bufA);

      const props = ctx.scene.getObjectByName('world-props');
      if (!props) { restoreCam(saved); return { pass: null, detail: 'SKIP: no world-props group to prove the occluder with' }; }
      const was = props.visible;
      props.visible = false;
      draw(3);
      const bufB = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, bufB);
      props.visible = was;
      draw(1);
      restoreCam(saved);

      const STEP = 2;
      const lum = (b, i) => (0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2]) / 255;
      let maxLift = 0;
      for (let y = 0; y < H; y += STEP) {
        for (let x = 0; x < W; x += STEP) {
          const i = (y * W + x) * 4;
          const l = lum(bufB, i) - lum(bufA, i);
          if (l > maxLift) maxLift = l;
        }
      }
      if (!(maxLift > 0.12)) {
        return { pass: false, detail: { note: 'no measurable shadow: hiding the occluder changed nothing', maxLift: +maxLift.toFixed(4) } };
      }
      // centroid of the deepest-lift pixels = where the shadow actually is
      let cx = 0, cy = 0, cn = 0;
      for (let y = 0; y < H; y += STEP) {
        for (let x = 0; x < W; x += STEP) {
          const i = (y * W + x) * 4;
          if (lum(bufB, i) - lum(bufA, i) >= maxLift * 0.85) { cx += x; cy += y; cn++; }
        }
      }
      cx /= cn; cy /= cn;

      const shade = [], lit = [];
      let penumbra = 0;
      for (let y = 0; y < H; y += STEP) {
        for (let x = 0; x < W; x += STEP) {
          const i = (y * W + x) * 4;
          const a = lum(bufA, i);
          const l = lum(bufB, i) - a;
          const r = Math.hypot(x - cx, y - cy);
          if (r > 320) continue;                    // stay on the same ground
          if (l >= maxLift * 0.75 && r <= 110) shade.push(a);
          else if (l <= maxLift * 0.06 && Math.abs(l) < 0.02 && r > 110) lit.push(a);
          else penumbra++;
        }
      }
      const med = (a) => {
        if (!a.length) return null;
        const s2 = a.slice().sort((x, y) => x - y);
        return s2.length % 2 ? s2[(s2.length - 1) / 2]
          : (s2[s2.length / 2 - 1] + s2[s2.length / 2]) / 2;
      };
      if (shade.length < 40 || lit.length < 200) {
        return {
          pass: null,
          detail: {
            note: 'SKIP: could not isolate enough umbra / fully-lit ground pixels',
            umbraPixels: shade.length, litPixels: lit.length,
            maxLift: +maxLift.toFixed(4), probedAt: [+S.x.toFixed(1), +S.z.toFixed(1)],
          },
        };
      }
      const shadowLum = med(shade);
      const litLum = med(lit);
      const ratio = shadowLum / Math.max(1e-4, litLum);

      return {
        pass: ratio <= 0.55 && litLum > 0.06,
        detail: {
          ratio: +ratio.toFixed(3), shadowLum: +shadowLum.toFixed(4), litLum: +litLum.toFixed(4),
          umbraPixels: shade.length, fullyLitPixels: lit.length, penumbraPixels: penumbra,
          maxLift: +maxLift.toFixed(4), shadowCentroidPx: [Math.round(cx), Math.round(cy)],
          sunIntensity: +env.sun.intensity.toFixed(2), hemiIntensity: +env.hemi.intensity.toFixed(3),
          envIntensity: +ctx.scene.environmentIntensity.toFixed(3),
          hour: +env.time.toFixed(2), shadowAt: [+S.x.toFixed(1), +S.z.toFixed(1)],
        },
      };
    })()`,
  },

  /* ------------------------------------------------------------------ A56 */
  {
    id: 'A56-cascades', kind: 'action', lane: 'world-light',
    title: '3 cascades, near texel ≤2 cm/px, casters culled beyond 120 m, grass+bush cast',
    settle: 3000,
    timeout: 45000,
    assert: `(async () => {
      const ctx = __CTX__, engine = ctx.engine;
      const csm = engine.csm;
      if (!csm) return { pass: false, detail: 'no engine.csm — cascades are not wired' };
      // let the engine's rate-limited cull pass run at least twice
      await new Promise(r => setTimeout(r, 400));

      const cascades = csm.cascades;
      const near = csm.lights[0].shadow.camera;
      const texel = (near.right - near.left) / csm.shadowMapSize;
      const cull = engine.shadowCullDistance;

      // Every mesh still flagged as a caster must be inside the cull distance.
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
        const sc = Math.sqrt(Math.max(
          e[0]*e[0]+e[1]*e[1]+e[2]*e[2], e[4]*e[4]+e[5]*e[5]+e[6]*e[6], e[8]*e[8]+e[9]*e[9]+e[10]*e[10]));
        const dx = e[12]-camPos.x, dy = e[13]-camPos.y, dz = e[14]-camPos.z;
        const d = Math.max(0, Math.sqrt(dx*dx+dy*dy+dz*dz) - r * sc);
        if (d > worst) { worst = d; worstName = n || o.type; }
        if (d > cull + 2) overCount++;
      });

      const ok = cascades >= 3 && texel <= 0.02 && cull <= 120 && overCount === 0
        && grass > 0 && bush > 0;
      return {
        pass: ok,
        detail: {
          cascades, nearTexelCm: +(texel * 100).toFixed(2), shadowMapSize: csm.shadowMapSize,
          breaks: csm.breaks.map(b => +b.toFixed(3)),
          cascadeFarM: csm.breaks.map(b => +(b * csm.maxFar).toFixed(1)),
          shadowCullDistance: cull, castersBeyondCull: overCount,
          farthestCasterM: +worst.toFixed(1), farthestCaster: worstName,
          activeCasters: engine.activeShadowCasters, casterBudget: engine.shadowCasterBudget,
          grassCasterChunks: grass, bushCasterMeshes: bush,
          shadowDrawEstimate: engine.shadowDrawEstimate,
        },
      };
    })()`,
  },

  /* ------------------------------------------------------------------ A57 */
  {
    id: 'A57-aerial', kind: 'action', lane: 'world-light',
    title: 'Aerial perspective: 300 m transmittance 0.55–0.70 and rim geometry is lit',
    settle: 2500,
    timeout: 60000,
    setup: `(() => {
      __CTX__.environment.setWeather('clear', 0);
      __CTX__.environment.setTime(17.0);
    })();`,
    assert: `(async () => {
      ${KIT}
      if (!env?.fogParams) return { pass: null, detail: 'SKIP: no environment.fogParams' };
      await new Promise(r => setTimeout(r, 300));

      /* ---- 1. the published contract ---- */
      const camY = gy(0, 0) + 2.0;
      const T300 = env.fogParams.transmittance(300, camY, camY);

      /* ---- 2. the rim is lit geometry, not an unlit painted band ---- */
      const rimMats = [];
      let basic = 0, litMats = 0, csmMats = 0;
      env.ridges.traverse((o) => {
        if (!o.isMesh) return;
        const m = o.material;
        rimMats.push(m.type);
        if (m.isMeshBasicMaterial) basic++;
        if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.isMeshLambertMaterial
            || m.isMeshPhongMaterial) litMats++;
        if (m.defines && m.defines.USE_CSM) csmMats++;
      });

      /* ---- 3. PROVE the shader really applies it. Three renders of the
               SAME distant terrain: aerial term off, aerial term on, aerial
               term saturated. In linear light the middle one is exactly
               mix(fullFog, noFog, T), so it must sit between the other two —
               a fog that only moved a JS number cannot do that. ---- */
      const saved = saveCam();
      const p = ctx.player;
      p.position.set(0, 0, 0); p._snapToGround?.();
      const cy = gy(0, 0) + 3.2;
      const dens0 = env.u.hzcFogA.value.x;
      const fogDens0 = ctx.scene.fog.density;
      const setDens = (d) => { env.u.hzcFogA.value.x = d; ctx.scene.fog.density = d; };

      const rows = [];
      for (const B of [0.4, 1.3, 1.9, 2.6, 3.4, 4.2, 4.9, 5.6]) {
        const dx = Math.sin(B), dz = Math.cos(B);
        cam.up.set(0, 1, 0);
        cam.position.set(0, cy, 0);
        cam.lookAt(dx * 400, cy, dz * 400);
        cam.fov = 55; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
        const targets = [240, 290].map(D => new V(dx * D, gy(dx * D, dz * D) + 1.0, dz * D));
        setDens(dens0); draw(3);
        const on = targets.map(sampleRGB);
        setDens(0); draw(2);
        const off = targets.map(sampleRGB);
        setDens(0.05); draw(2);
        const full = targets.map(sampleRGB);
        for (let i = 0; i < targets.length; i++) {
          if (!on[i] || !off[i] || !full[i]) continue;
          if (Math.max(...off[i]) > 0.96 || Math.max(...full[i]) > 0.98) continue;
          const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
          const dOn = dist(on[i], full[i]);
          const dOff = dist(off[i], full[i]);
          if (dOff < 0.08) continue;                 // nothing to measure here
          rows.push({
            bearing: +B.toFixed(2), dist: [240, 290][i],
            on: on[i].map(v => +v.toFixed(3)),
            off: off[i].map(v => +v.toFixed(3)),
            full: full[i].map(v => +v.toFixed(3)),
            towardHaze: dOn < dOff - 0.01,
            shift: +dist(on[i], off[i]).toFixed(3),
            renderedRatio: +(dOn / dOff).toFixed(3),
          });
        }
      }
      setDens(dens0);
      ctx.scene.fog.density = fogDens0;
      draw(1);
      restoreCam(saved);

      // A sample whose pixel barely moved is a target the terrain occluded at
      // short range — nothing to measure there, and not evidence either way.
      // The bar: at least three bearings show a real haze contribution, and NO
      // sample anywhere moved AWAY from the measured in-scatter colour.
      // A sample the terrain occluded at short range shows renderedRatio ~1 and
      // a shift down in the 8-bit noise floor: nothing to measure, and not
      // evidence either way. Only samples the aerial term visibly moved count.
      const measurable = rows.filter(r => r.shift > 0.05);
      const contra = measurable.filter(r => !r.towardHaze);
      const empiricalOk = measurable.length >= 3 && contra.length === 0;

      const ok = T300 >= 0.55 && T300 <= 0.70 && basic === 0 && litMats > 0 && empiricalOk;
      return {
        pass: ok,
        detail: {
          transmittance300m: +T300.toFixed(3),
          density: +env.fogParams.density.toFixed(6),
          heightFalloffH: +(1 / env.fogParams.heightFalloff).toFixed(1),
          transmittanceProfile: [100, 200, 300, 500, 900].map(d =>
            [d, +env.fogParams.transmittance(d, camY, camY).toFixed(3)]),
          rimMaterials: [...new Set(rimMats)], rimBasicMaterials: basic,
          rimLitMaterials: litMats, rimCsmRegistered: csmMats,
          renderedSamples: rows.length, measurableSamples: measurable.length,
          samplesMovingAwayFromHaze: contra.length,
          samples: rows,
        },
      };
    })()`,
  },

  /* ------------------------------------------------------------------ V30 */
  {
    id: 'V30-golden-hour', kind: 'visual', lane: 'world-light',
    title: 'Golden hour at 17:30 — all four yaws from the spawn vista',
    params: 'px=0&pz=0&pitch=0.05',
    settle: 2200,
    timeout: 60000,
    setup: `(() => {
      const ctx = __CTX__, engine = ctx.engine, renderer = ctx.renderer, cam = ctx.camera;
      const env = ctx.environment;
      env.setWeather('clear', 0);
      env.setTime(17.5);
      ctx.settings.cameraSmoothing = 0;      // snap the boom: no spring settle
      const p = ctx.player;
      p.position.set(0, 0, 0); p._snapToGround?.();
      p.camPitch = 0.05;

      const W = renderer.domElement.width, H = renderer.domElement.height;
      const shot = (yaw) => {
        p.camYaw = yaw;
        for (let i = 0; i < 3; i++) p._updateCamera(0.2, 0);
        for (let i = 0; i < 3; i++) { engine._shadowCullClock = 0; engine.render(0.05); }
        const buf = new Uint8ClampedArray(W * H * 4);
        renderer.getContext().readPixels(0, 0, W, H, 0x1908 /* RGBA */, 0x1401 /* UNSIGNED_BYTE */, buf);
        return buf;
      };
      // Four bearings 90 deg apart, ANCHORED to the sun so exactly one tile
      // contains the disc: the judge has to be able to see whether it is a
      // tight disc with a corona or a smeared blob, and at 17:30 a fixed
      // 0/90/180/270 set puts it in the corner of a frame.
      const sun = env.sunDir;
      const sunYaw = Math.atan2(-sun.x, -sun.z);
      const yaws = [0, 1, 2, 3].map(i => sunYaw + i * Math.PI / 2);
      const frames = yaws.map(shot);
      const deg = (y) => ((Math.round(y * 180 / Math.PI) % 360) + 360) % 360;

      // 2x2 contact sheet, flipped back to top-down, drawn over the page so the
      // runner's single screenshot carries all four bearings.
      const sheet = document.createElement('canvas');
      sheet.width = W; sheet.height = H;
      const g = sheet.getContext('2d');
      const tmp = document.createElement('canvas');
      tmp.width = W; tmp.height = H;
      const tg = tmp.getContext('2d');
      for (let i = 0; i < 4; i++) {
        tg.putImageData(new ImageData(frames[i], W, H), 0, 0);
        g.save();
        g.translate((i % 2) * W / 2, Math.floor(i / 2) * H / 2);
        g.scale(0.5, -0.5);
        g.drawImage(tmp, 0, -H);
        g.restore();
        g.fillStyle = '#000'; g.globalAlpha = 0.55;
        g.fillRect((i % 2) * W / 2, Math.floor(i / 2) * H / 2, 190, 22);
        g.globalAlpha = 1; g.fillStyle = '#ffe3b0';
        g.font = '13px ui-monospace, monospace';
        g.fillText((i === 0 ? 'into sun' : 'yaw +' + (i * 90) + '°') + '  ' + deg(yaws[i]) + '°  t=17:30',
          (i % 2) * W / 2 + 8, Math.floor(i / 2) * H / 2 + 16);
      }
      const img = new Image();
      img.src = sheet.toDataURL('image/png');
      img.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647';
      document.body.appendChild(img);
    })();`,
    criteria: 'Four bearings 90 deg apart at 17:30, the first looking into the sun. Pass: long crisp directional shadows from tents/trees/machines on the ground; cool blue-ish shade against warm sunlit ground; the far rim hazed roughly 40% toward the horizon colour with peaks clearer than bases; the sun a tight disc with a corona (not a smeared blob) in the bearing that contains it. FAIL on flat ambient light, no ground shadows, or a milky uniform haze.',
  },

  /* ------------------------------------------------------------------ V31 */
  {
    id: 'V31-night', kind: 'visual', lane: 'world-light',
    title: 'Night at 23:00 — moonlit, readable, campfire and machine eyes are the light',
    params: 'px=0&pz=0&pitch=0.04',
    settle: 2600,
    timeout: 60000,
    setup: `(() => {
      const ctx = __CTX__;
      const env = ctx.environment;
      env.setWeather('clear', 0);
      env.setTime(23.0);
      ctx.settings.cameraSmoothing = 0;
      const p = ctx.player;
      p.position.set(0, 0, 0); p._snapToGround?.();
      // face the camp fire so the "campfire is a light source" claim is visible
      // skip this lane's OWN pooled lights — they are added before the camp's
      const mine = new Set([env.fireLight, ...env.eyeLights]);
      let fire = null;
      ctx.scene.traverse((o) => { if (!fire && o.isPointLight && !mine.has(o)) fire = o; });
      const t = fire ? fire.getWorldPosition(new (p.position.constructor)()) : null;
      if (t) {
        // stand a lantern's throw from the fire, still on the spawn meadow with
        // the rim in frame: at 37 m the fire is a dot and the gate cannot judge
        // whether it is actually lighting anything.
        const l = Math.hypot(t.x - p.position.x, t.z - p.position.z) || 1;
        p.position.set(t.x - (t.x / l) * 11, 0, t.z - (t.z / l) * 11);
        p._snapToGround?.();
      }
      p.camYaw = t ? Math.atan2(t.x - p.position.x, t.z - p.position.z) + Math.PI : 2.3;
      p.camPitch = 0.04;
      for (let i = 0; i < 4; i++) p._updateCamera(0.2, 0);
    })();`,
    criteria: 'Pass: the scene is readable moonlit blue — terrain, tents and tree silhouettes all legible without a torch; stars visible in the sky with a moon; the campfire and any nearby machine eyes read as the warm/coloured light sources against the cool moonlight. FAIL on black mud with nothing readable, on a daylight-bright "night", or on a sky with no stars.',
  },
];
