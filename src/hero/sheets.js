/**
 * CALIMA · Brea's review sheets (hero-body W0b; plan §3.1 W0b exit "Brea's
 * silhouette and face sheets shown to Kevin", §11 decision 1; gates
 * V-brea-one-glance, V-brea-face, V-traversal, A-brea-contrast).
 *
 * Dev/gate module: nothing in the game imports it; gates and the sheet tool
 * load it with `await import('/src/hero/sheets.js')`. Every render here is an
 * ISOLATED render of the live player (her real meshes, skeleton and pose) into
 * a render target with its own neutral lights, so a sheet shows Brea and not
 * the time of day. Everything it creates it disposes before it returns.
 */
import * as THREE from 'three';

export { THREE };

const NEUTRAL = (scene) => {
  const hemi = new THREE.HemisphereLight(0xfff6e8, 0x8d8272, 1.15);
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(1.2, 2.2, 2.0);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 0.9); rim.position.set(-1.5, 1.6, -2.0);
  scene.add(hemi, key, rim);
  return () => { scene.remove(hemi, key, rim); key.dispose?.(); rim.dispose?.(); hemi.dispose?.(); };
};

/**
 * Render `object` (re-parented temporarily into a private scene at the
 * origin, facing +Z) from `cam` = { pos, target, fov | ortho:{h} } into a
 * W x H RGBA pixel buffer (top row first). `fill` = '#rrggbb' renders a black
 * silhouette in that colour; `background` sets the clear colour (null = 0 alpha).
 */
export function renderIsolated(ctx, object, { width = 400, height = 600, cam, background = '#ffffff', fill = null, env = false } = {}) {
  const R = ctx.renderer;
  const scene = new THREE.Scene();
  // metal needs something to reflect: the armory sheets borrow the world's environment map
  if (env) { scene.environment = ctx.scene?.environment ?? null; scene.environmentIntensity = ctx.scene?.environmentIntensity ?? 1; }
  const undo = NEUTRAL(scene);
  const parent = object.parent, pos = object.position.clone(), rotY = object.rotation.y;
  scene.add(object);
  object.position.set(0, 0, 0); object.rotation.y = 0; object.updateMatrixWorld(true);
  let camera;
  if (cam.ortho) {
    const h = cam.ortho.h, w = h * width / height;
    camera = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.01, 50);
  } else {
    camera = new THREE.PerspectiveCamera(cam.fov ?? 30, width / height, 0.01, 50);
  }
  camera.position.set(...cam.pos); camera.lookAt(...cam.target); camera.updateMatrixWorld(); camera.updateProjectionMatrix?.();
  // A render target gets NEITHER the renderer's tone mapping NOR its sRGB
  // output encoding (three applies both only on the way to the screen), so the
  // scene is rendered LINEAR into a float target with a transparent clear and
  // the screen's own transform — ACES Filmic at the renderer's exposure, then
  // sRGB — is applied here, then composited over `background`. (The first
  // version read the linear bytes back as if they were sRGB: every sheet and
  // the A-brea-contrast numbers came out ~2.4x too dark.)
  const float = !!R.extensions?.has?.('EXT_color_buffer_float');
  const rt = new THREE.WebGLRenderTarget(width, height, { samples: 4, type: float ? THREE.FloatType : THREE.UnsignedByteType });
  const mat = fill ? new THREE.MeshBasicMaterial({ color: fill }) : null;
  if (mat) scene.overrideMaterial = mat;
  scene.background = null;
  const prevT = R.getRenderTarget();
  const prevClear = R.getClearColor(new THREE.Color()), prevAlpha = R.getClearAlpha();
  R.setRenderTarget(rt);
  R.setClearColor(0x000000, 0); R.clear();
  R.render(scene, camera);
  const n = width * height * 4;
  const buf = float ? new Float32Array(n) : new Uint8Array(n);
  R.readRenderTargetPixels(rt, 0, 0, width, height, buf);
  R.setRenderTarget(prevT); R.setClearColor(prevClear, prevAlpha);
  scene.overrideMaterial = null;
  // restore the player
  scene.remove(object); parent?.add(object); object.position.copy(pos); object.rotation.y = rotY; object.updateMatrixWorld(true);
  undo(); rt.dispose(); mat?.dispose();
  const out = screenPixels(R, buf, width, height, float, { background, fill });
  return new ImageData(out, width, height);
}

/**
 * Linear render-target pixels (bottom-up, premultiplied) -> what the SCREEN
 * shows: un-premultiply, the renderer's tone mapping (ACES Filmic at its
 * exposure; `fill` pixels are flat colour and skip it), sRGB, then composite
 * over `background` ('#rrggbb', or null for a transparent result).
 */
export function screenPixels(R, buf, width, height, float, { background = null, fill = null } = {}) {
  const n = width * height * 4;
  const k = float ? 1 : 1 / 255;
  const aces = R.toneMapping === THREE.ACESFilmicToneMapping;
  const expo = (R.toneMappingExposure ?? 1) / 0.6;
  const fit = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
  const enc = (c) => { c = c < 0 ? 0 : c > 1 ? 1 : c; return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055); };
  const bg = background ? new THREE.Color(background) : null;   // .r/.g/.b linear
  const bgS = bg ? [enc(bg.r), enc(bg.g), enc(bg.b)] : null;
  const fl = fill ? new THREE.Color(fill) : null;
  const flS = fl ? [enc(fl.r), enc(fl.g), enc(fl.b)] : null;
  const out = new Uint8ClampedArray(n);
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width * 4, dst = y * width * 4;   // GL reads bottom-up
    for (let x = 0; x < width * 4; x += 4) {
      const i = src + x, o = dst + x;
      const a = Math.min(1, buf[i + 3] * k);
      let r = 0, g = 0, b = 0;
      if (a > 1e-4) {
        if (flS) { r = flS[0]; g = flS[1]; b = flS[2]; } else {
          let lr = buf[i] * k / a, lg = buf[i + 1] * k / a, lb = buf[i + 2] * k / a;   // un-premultiply
          if (aces) {
            lr *= expo; lg *= expo; lb *= expo;
            const ir = 0.59719 * lr + 0.35458 * lg + 0.04823 * lb;
            const ig = 0.07600 * lr + 0.90834 * lg + 0.01566 * lb;
            const ib = 0.02840 * lr + 0.13383 * lg + 0.83777 * lb;
            const fr = fit(ir), fg = fit(ig), fb = fit(ib);
            lr = 1.60475 * fr - 0.53108 * fg - 0.07367 * fb;
            lg = -0.10208 * fr + 1.10813 * fg - 0.00605 * fb;
            lb = -0.00327 * fr - 0.07276 * fg + 1.07602 * fb;
          }
          r = enc(lr); g = enc(lg); b = enc(lb);
        }
      }
      if (bgS) {
        out[o] = r * a + bgS[0] * (1 - a); out[o + 1] = g * a + bgS[1] * (1 - a); out[o + 2] = b * a + bgS[2] * (1 - a); out[o + 3] = 255;
      } else { out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255 * a; }
    }
  }
  return out;
}

/**
 * Fix round 4: one view of the LIVE scene (its lights, its shading) from `pos`
 * looking at `target` (world [x, y, z]) into an ImageData, through the screen's
 * own tone map (gate V24-draw-down). The render target is disposed before it
 * returns.
 */
export function liveView(ctx, pos, target, { width = 780, height = 860, fov = 34, background = '#000000' } = {}) {
  const R = ctx.renderer, c = ctx.camera.clone();
  c.fov = fov; c.aspect = width / height; c.position.set(...pos); c.lookAt(...target); c.updateProjectionMatrix(); c.updateMatrixWorld();
  const float = !!R.extensions?.has?.('EXT_color_buffer_float');
  const rt = new THREE.WebGLRenderTarget(width, height, { samples: 4, type: float ? THREE.FloatType : THREE.UnsignedByteType });
  const prev = R.getRenderTarget(); R.setRenderTarget(rt); R.render(ctx.scene, c);
  const buf = float ? new Float32Array(width * height * 4) : new Uint8Array(width * height * 4);
  R.readRenderTargetPixels(rt, 0, 0, width, height, buf); R.setRenderTarget(prev); rt.dispose();
  return new ImageData(screenPixels(R, buf, width, height, float, { background }), width, height);
}

/** ImageData -> canvas. */
function canvasOf(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  c.getContext('2d').putImageData(img, 0, 0); return c;
}

/** A full-window overlay canvas the gate's screenshot captures. */
function overlay(w, h, bg = '#f4f1ea') {
  document.getElementById('hb-sheet')?.remove();
  const c = document.createElement('canvas');
  c.id = 'hb-sheet'; c.width = w; c.height = h;
  c.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;z-index:2147483646;background:${bg}`;
  document.body.appendChild(c);
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  return { c, g };
}
const label = (g, text, x, y, size = 15, color = '#2a2420') => { g.fillStyle = color; g.font = `600 ${size}px ui-monospace, Menlo, monospace`; g.fillText(text, x, y); };

/**
 * Pose the hero for a sheet: the neutral idle (no fidget), nothing in hand. Fix round 4: she stands
 * facing NORTH in the island's NE trade wind (the animator's default world
 * wind, bible §2.2: from bearing 045, "flags stream SW"), i.e. the wind on her
 * front-right, for 1.5 s of sim so the wrap tail has settled into it — the
 * cloth streams to her left-rear by physics, not by a posed rest (fix round
 * 3's `restKick`, retired). The views are rendered in one frame, so they all
 * show the same instant of the gusting tail.
 */
async function poseIdle(ctx, settle = 1.5) {
  const p = ctx.player, E = ctx.engine;
  ctx.input.keys.clear(); ctx.input.mouse.buttons = 0;
  if (ctx.sighting?.on) ctx.sighting.toggle?.(false);
  p.heading = Math.PI;                       // facing north (-Z)
  // W0b targeted fix: the sheets show the NEUTRAL idle. An idle fidget (the
  // head scan, the strap or the grip) in progress ends here and none starts
  // during the settle, so a sheet never catches her mid-glance by chance
  // (the timer is random); A-tail-legible grades this same staging
  const an = p.animator;
  if (an && an._fidgetK != null) { an._fidgetK = 1; an._fidgetT = Math.max(an._fidgetT || 0, settle + 3); }
  const s0 = E?.simTime ?? 0, w0 = performance.now();
  for (let i = 0; i < 20 || ((E?.simTime ?? 1e9) - s0 < settle && performance.now() - w0 < 8000); i++) {
    await new Promise((r) => requestAnimationFrame(r));
    p.heading = Math.PI;
  }
  return p.model;
}

/** Camera around the model (it faces +Z): yaw 0 = front. */
const around = (yaw, dist, h, ty = h) => ({ pos: [Math.sin(yaw) * dist, h, Math.cos(yaw) * dist], target: [0, ty, 0] });

/**
 * Fix round 5 — cue 2 MEASURED (gate A-tail-legible, V-brea-one-glance's
 * numeric twin; judge r2: "the wrap tail cannot be separated from the stowed
 * bow's upper limb at 64 px"). For each sheet view, the black fill at the
 * sheet's own 64 px (56 x 82, ortho 2.3 m, the same lens) is rendered twice —
 * as is, and with the wrap tail collapsed into its knot (its root joint scaled
 * to ~0 for that one render) — and the pixels only the tail covers are
 * counted, with each one's distance (Chebyshev, px) to the nearest pixel of
 * EVERYTHING ELSE: `clear2` / `clear3` = tail pixels standing >= 2 / >= 3 px
 * off the rest of the silhouette, `reach` = the farthest. Poses nothing: the
 * caller stages her (`poseIdle`). Allocates (a gate / sheet path only).
 */
export function tailLegibility(ctx, rootName = 'dyn_wrapSash_01') {
  const p = ctx.player, model = p.model;
  let root = null; model.traverse((o) => { if (!root && o.isBone && o.name === rootName) root = o; });
  if (!root) return null;
  const W = 56, H = 82;
  const views = [['FRONT', 0], ['SIDE (her right)', -Math.PI / 2], ['BACK', Math.PI], ['SIDE (her left)', Math.PI / 2], ['3/4', Math.PI / 4]];
  const mask = (img) => { const m = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) m[i] = img.data[i * 4] < 128 ? 1 : 0; return m; };
  const out = [];
  for (const [name, yaw] of views) {
    const cam = { ...around(yaw, 6, 0.95, 0.95), ortho: { h: 2.3 } };
    const a = mask(renderIsolated(ctx, model, { width: W, height: H, cam, background: '#ffffff', fill: '#000000' }));
    const sc = root.scale.clone();
    root.scale.setScalar(1e-4); model.updateMatrixWorld(true);
    const b = mask(renderIsolated(ctx, model, { width: W, height: H, cam, background: '#ffffff', fill: '#000000' }));
    root.scale.copy(sc); model.updateMatrixWorld(true);
    let tail = 0, clear2 = 0, clear3 = 0, reach = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!a[i] || b[i]) continue;
      tail++;
      let d = 99;
      for (let yy = Math.max(0, y - 9); yy <= Math.min(H - 1, y + 9); yy++) for (let xx = Math.max(0, x - 9); xx <= Math.min(W - 1, x + 9); xx++) if (b[yy * W + xx]) d = Math.min(d, Math.max(Math.abs(xx - x), Math.abs(yy - y)));
      if (d >= 2) clear2++; if (d >= 3) clear3++; if (d > reach) reach = d;
    }
    out.push({ view: name, tailPx: tail, clear2, clear3, reach });
  }
  return out;
}

/** Fix round 5: the sheets' staging, for gates that measure what the sheet shows. */
export { poseIdle };

/**
 * The SILHOUETTE sheet (bible §3.2, gate V-brea-one-glance): front, side,
 * back, three-quarter at 64 px tall in black fill (each also shown 4x,
 * nearest-neighbour, so the cues are judged at the real read size), and the
 * same four in full colour. Returns the sheet as a PNG data URL.
 */
export async function silhouetteSheetOverlay(ctx) {
  const model = await poseIdle(ctx);
  // five views (fix round 1): the wrap tail trails LEFT-rear and the bracer
  // and the bob are on her LEFT, so a left side joins the right one
  const views = [['FRONT', 0], ['SIDE (her right)', -Math.PI / 2], ['BACK', Math.PI], ['SIDE (her left)', Math.PI / 2], ['3/4', Math.PI / 4]];
  const W = 1600, H = 900;
  const { c, g } = overlay(W, H);
  label(g, 'BREA — silhouette at 64 px (black fill), default loadout: Pan Whites I, Shepherd\'s Lance, cane quiver, crescent bracer, alidade', 24, 30, 16);
  label(g, 'idle, facing N in the NE trade wind (bible §2.2, 5.5 m/s from 045: on her front-right) — the wrap tail is cloth in that wind', 24, 50, 12, '#6b6058');
  views.forEach(([name, yaw], i) => {
    const cam = { ...around(yaw, 6, 0.95, 0.95), ortho: { h: 2.3 } };
    // 64 px tall: the 2.3 m frame at 64/1.80*2.3 px = the body at ~64 px
    const small = renderIsolated(ctx, model, { width: 56, height: 82, cam, background: '#ffffff', fill: '#000000' });
    const sc = canvasOf(small);
    const x0 = 16 + i * 316;
    label(g, name, x0, 64, 14);
    g.imageSmoothingEnabled = false;
    g.drawImage(sc, x0, 74, 56 * 4, 82 * 4);         // 4x nearest
    g.drawImage(sc, x0 + 56 * 4 + 12, 74 + 82 * 4 - 82, 56, 82);   // true size
    label(g, '64 px', x0 + 56 * 4 + 12, 74 + 82 * 4 + 16, 11, '#6b6058');
    const col = renderIsolated(ctx, model, { width: 280, height: 392, cam: { ...around(yaw, 4.6, 0.95, 0.92), fov: 27 }, background: '#d9d4c8' });
    g.drawImage(canvasOf(col), x0, 440, 280, 392);
  });
  label(g, 'cues (plan §9): 1 violet wrap + topknot   2 wrap tail left-rear   3 crescent bracer   4 lance diagonal with the bob-shaped butt   5 cane quiver   — no braid, no mane', 24, 870, 13, '#4a4038');
  return c.toDataURL('image/png');
}

/**
 * The FACE sheet (bible §3.5, gate V-brea-face): Brea at 1.2 m — front,
 * profile, three-quarter — beside the stock UBC face (reference renders in
 * reference/r5/hero/, made from the CC0 source by the sheet tool), plus a
 * hand inset for the ∴. Returns a PNG data URL.
 */
export async function faceSheetOverlay(ctx, stock = null) {
  const model = await poseIdle(ctx);
  const an = ctx.player.animator;
  // head height in the model frame
  const head = an.b.head.bone.getWorldPosition(new THREE.Vector3());
  const mw = model.matrixWorld.clone().invert();
  head.applyMatrix4(mw);
  const hy = head.y + 0.10;
  // around the HEAD (the idle pose carries it off the root line)
  const aroundHead = (yaw, dist, h, ty) => ({ pos: [head.x + Math.sin(yaw) * dist, h, head.z + Math.cos(yaw) * dist], target: [head.x, ty, head.z] });
  const W = 1600, H = 900;
  const { c, g } = overlay(W, H);
  label(g, 'BREA — face at 1.2 m (salt-line, left-brow scar, dark eyes) vs stock UBC; ∴ on the back of the right hand', 24, 30, 16);
  const views = [['FRONT', 0], ['PROFILE (her left)', Math.PI / 2], ['3/4', -Math.PI / 5]];
  views.forEach(([name, yaw], i) => {
    const img = renderIsolated(ctx, model, { width: 360, height: 400, cam: { ...aroundHead(yaw, 1.2, hy, hy - 0.02), fov: 14 }, background: '#cfc9bd' });
    g.drawImage(canvasOf(img), 24 + i * 380, 70);
    label(g, 'BREA ' + name, 24 + i * 380, 62, 14);
  });
  // stock UBC references (rendered once by tools; CC0 source)
  for (const [i, f] of ['ubc-stock-front.png', 'ubc-stock-profile.png'].entries()) {
    try {
      const im = new Image(); im.src = stock?.[i ? 'profile' : 'front'] || ('/reference/r5/hero/' + f);
      await im.decode();
      g.drawImage(im, 24 + i * 380, 500, 360 * 0.92, 400 * 0.92 * 0.95);
      label(g, 'STOCK UBC ' + (i ? 'PROFILE' : 'FRONT'), 24 + i * 380, 492, 13, '#6b6058');
    } catch { label(g, '(stock reference missing: ' + f + ')', 24 + i * 380, 520, 12, '#a3213a'); }
  }
  // the right hand, back of the hand toward the lens (idle pose: hand by the thigh);
  // the stowed kit is collapsed for this one frame so the quiver does not hide it
  const hand = an.b.handR.bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(mw);
  const knuckle = (an.bones.middle_01_r || an.b.handR.bone).getWorldPosition(new THREE.Vector3()).applyMatrix4(mw);
  const kit = ctx.player.hero?.kit, hid = kit?.hidden ?? 0;
  kit?.setHidden(31);
  const mid = hand.clone().lerp(knuckle, 0.5);
  const hi = renderIsolated(ctx, model, { width: 320, height: 320, cam: { pos: [mid.x - 0.30, mid.y + 0.06, mid.z + 0.10], target: [mid.x, mid.y, mid.z], fov: 22 }, background: '#cfc9bd' });
  kit?.setHidden(hid);
  g.drawImage(canvasOf(hi), 1160, 500);
  label(g, 'RIGHT HAND (∴)', 1160, 492, 13);
  return c.toDataURL('image/png');
}

/**
 * The TRAVERSAL strip (gate V-traversal): a 1 m ledge climb caught in the
 * pull, a cinder slide, and the top of a stepped climb — side views. Uses the
 * same fixtures as A-climb-1m / A-slide, all removed before it returns.
 */
export async function traversalOverlay(ctx) {
  const p = ctx.player, T = ctx.terrain, K = ctx.collision, E = ctx.engine;
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const simWait = async (s, cap = 15000) => { const s0 = E.simTime, w0 = performance.now(); while (E.simTime - s0 < s && performance.now() - w0 < cap) await frame(); };
  const W = 1600, H = 900;
  const shots = [];
  const camAt = (yawOff, dist, h) => { const hd = p.heading + yawOff; return { pos: [p.position.x + Math.sin(hd) * dist, p.position.y + h, p.position.z + Math.cos(hd) * dist], target: [p.position.x, p.position.y + 0.9, p.position.z] }; };
  const liveShot = (cam) => {
    const R = ctx.renderer, c = ctx.camera.clone();
    c.fov = 40; c.aspect = 500 / 560; c.position.set(...cam.pos); c.lookAt(...cam.target); c.updateProjectionMatrix(); c.updateMatrixWorld();
    const float = !!R.extensions?.has?.('EXT_color_buffer_float');
    const rt = new THREE.WebGLRenderTarget(500, 560, { samples: 4, type: float ? THREE.FloatType : THREE.UnsignedByteType });
    const prevT = R.getRenderTarget(); R.setRenderTarget(rt); R.render(ctx.scene, c);
    const buf = float ? new Float32Array(500 * 560 * 4) : new Uint8Array(500 * 560 * 4);
    R.readRenderTargetPixels(rt, 0, 0, 500, 560, buf); R.setRenderTarget(prevT); rt.dispose();
    return new ImageData(screenPixels(R, buf, 500, 560, float, { background: '#000000' }), 500, 560);
  };
  const mats = [];
  const box = (cx, cy, cz, hx, hy, hz) => {
    const id = K.register({ kind: 'prop', shape: { type: 'box', c: [cx, cy, cz], half: [hx, hy, hz] } });
    const m = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.9 }));
    m.position.set(cx, cy, cz); ctx.scene.add(m); mats.push(m);
    return { id, m };
  };
  const clear = (b) => { K.unregister(b.id); b.m.removeFromParent(); b.m.geometry.dispose(); b.m.material.dispose(); };
  for (const m of ctx.machines?.list || []) m.update = () => {};
  // --- 1. ledge climb, caught mid-pull
  {
    const x = -60, z = -39, gy = T.getHeight(x, z);
    const b = box(x, gy + 0.25, z + 3.5, 1.5, 0.75, 1.0);   // a 1.0 m ledge: top 1.0 m over her feet
    p.position.set(x, 0, z); p.velocity.set(0, 0, 0); p._snapToGround(); p.heading = 0; p.camYaw = Math.PI;
    await simWait(0.3);
    ctx.input.keys.add('KeyW');
    const w0 = E.simTime;
    while (E.simTime - w0 < 4 && !p.mantling) { await frame(); if (p.position.z > z + 1.6) { ctx.input._press?.('Space', { code: 'Space' }); ctx.input.keys.delete('Space'); } }
    ctx.input.keys.clear();
    // the pull's last frame (fix round 1): both palms still on the top and the
    // chest coming over them (A-climb-1m's body-over-hands moment, k ~0.36)
    const an = p.animator;
    while (p.mantling && (p.mantleK ?? 0) < 0.6) {
      await frame();
      if ((p.mantleK ?? 0) < 0.25) continue;
      const s3 = an.b.spine3.bone.getWorldPosition(new THREE.Vector3());
      const past = (s3.x - p.mantleEdge.x) * p.mantleEdge.dx + (s3.z - p.mantleEdge.z) * p.mantleEdge.dz;
      if (past >= 0) break;
    }
    E.timeScale = 0; await frame();
    // a true side view at the ledge's own height, framed on the edge: the wall
    // face, the top, her palms on it and her chest over them
    { const Ed = p.mantleEdge, sx = Ed.dz, sz = -Ed.dx;           // her left
      const cam = { pos: [Ed.x - sx * 2.6 - Ed.dx * 0.25, Ed.y + 0.35, Ed.z - sz * 2.6 - Ed.dz * 0.25], target: [Ed.x - Ed.dx * 0.1, Ed.y + 0.15, Ed.z - Ed.dz * 0.1] };
      shots.push(['LEDGE CLIMB (pull: palms on the top, chest over them)', liveShot(cam)]); }
    E.timeScale = 1;
    await simWait(1.0);
    clear(b);
  }
  // --- 2. cinder slide on a terrain face (a surface patch until the Malpais)
  {
    const slopeAt = (x, z) => { const n = new THREE.Vector3(); T.getNormal(x, z, n); return Math.acos(Math.min(1, n.y)) * 180 / Math.PI; };
    const W = ctx.environment?.water;
    const dry = (x, z) => !(W?.depthAt && W.depthAt(x, z) > 0);
    // the A-slide face search: a 2.5 m grid over the play area, the 30-38 deg
    // spot whose fall line holds its slope most evenly over 4 m, dry
    let f = null;
    for (let x = -320; x <= 320; x += 2.5) for (let z = -320; z <= 320; z += 2.5) {
      if (Math.hypot(x, z) > 318) continue;
      const a0 = slopeAt(x, z); if (a0 < 30 || a0 > 38 || !dry(x, z)) continue;
      const n = new THREE.Vector3(); T.getNormal(x, z, n); const l = Math.hypot(n.x, n.z); if (l < 1e-3) continue;
      const dx = n.x / l, dz = n.z / l;
      let lo = 99, hi = 0;
      for (let st = -1; st <= 3; st += 0.5) { const sd = slopeAt(x + dx * st, z + dz * st); lo = Math.min(lo, sd); hi = Math.max(hi, sd); }
      if (lo < 29 || hi > 39) continue;
      if (!f || hi - lo < f.spread) f = { x, z, dx, dz, spread: hi - lo };
    }
    if (f) {
      const pid = p.surfaces.add({ x: f.x, z: f.z, r: 5, surface: 'cinder' });
      p.position.set(f.x - f.dx * 0.8, 0, f.z - f.dz * 0.8); p.velocity.set(0, 0, 0); p._snapToGround(); p.camYaw = Math.atan2(f.dx, f.dz) + Math.PI;
      ctx.input.keys.add('KeyW');
      const w0 = E.simTime;
      let slidT = null;
      while (E.simTime - w0 < 3.5) { await frame(); if (p.sliding && slidT === null) slidT = E.simTime; if (slidT !== null && E.simTime - slidT > 0.45) break; }
      E.timeScale = 0; await frame();
      // feet in frame (fix round 1): further out, the look-at at her knees
      const cam = camAt(-Math.PI * 0.14, 3.8, 1.2); cam.target[1] = p.position.y + 0.55;
      shots.push([slidT !== null ? 'CINDER SLIDE' : 'CINDER SLIDE (did not start)', liveShot(cam)]);
      E.timeScale = 1;
      ctx.input.keys.clear();
      p.surfaces.remove(pid);
    } else shots.push(['CINDER SLIDE: no 30-38 deg face found on this terrain', null]);
  }
  // --- 3. stepped climb (trig-pillar steps fixture), standing on top
  {
    const x = -60, z = -39, gy = T.getHeight(x, z);
    // step i: top (i + 1) m over her feet, 1.2 m treads (A-climb-1m's pillar
    // fixture), the first riser 0.9 m ahead of her
    const z0 = z + 0.9, TR = 1.2;
    const steps = [0, 1, 2].map((i) => box(x, gy - 0.5 + ((i + 1) + 0.5) / 2, z0 + i * TR + (3 - i) * TR / 2, 1.5, ((i + 1) + 0.5) / 2, (3 - i) * TR / 2));
    p.position.set(x, 0, z); p.velocity.set(0, 0, 0); p._snapToGround(); p.heading = 0; p.camYaw = Math.PI;
    await simWait(0.3);
    ctx.input.keys.add('KeyW');
    const w0 = E.simTime;
    while (E.simTime - w0 < 7 && p.position.y < gy + 2.9) { await frame(); if (!p.mantling && p.grounded) { ctx.input._press?.('Space', { code: 'Space' }); ctx.input.keys.delete('Space'); } }
    ctx.input.keys.clear();
    await simWait(0.6);
    shots.push([p.position.y > gy + 2.9 ? 'STEPS: on top (3 m)' : 'STEPS: not on top', liveShot(camAt(-Math.PI / 2, 5.0, 0.2))]);
    for (const s of steps) clear(s);
  }
  const { c, g } = overlay(W, H);
  label(g, 'BREA — traversal (side views): 1 m ledge climb, cinder slide, stepped climb', 24, 30, 16);
  shots.forEach(([name, img], i) => { label(g, name, 24 + i * 520, 62, 14); if (img) g.drawImage(canvasOf(img), 24 + i * 520, 72); });
  return c.toDataURL('image/png');
}

/**
 * The STOCK UBC face (the comparison V-brea-face asks for), rendered from the
 * CC0 source with the same lights and lens as Brea's: front + profile at
 * 1.2 m. The renders are stored in reference/r5/hero/ (`ubc-stock-front.png`,
 * `ubc-stock-profile.png`), and `faceSheetOverlay(ctx)` reads THOSE by
 * default, so the sheet needs no source body at all. `url` is REQUIRED (no
 * default): the stock heroine GLB pipeline's `tools/build/humans.mjs
 * buildHeroineBase()` writes from `models-staging/r5-src/` (W0b pipeline
 * request §6.4: the Round-5 proof's copy is not a reader any more).
 */
export async function renderStockFace(ctx, url) {
  if (!url) throw new Error('[sheets] renderStockFace(ctx, url): pass the stock heroine GLB (pipeline humans.mjs buildHeroineBase); the sheet reads reference/r5/hero/ubc-stock-*.png by default');
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const root = new THREE.Group(); root.add(gltf.scene);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.visible = /^(Body_Full|Eyes|Brows|Hair)$/.test(o.name);
    o.frustumCulled = false;
  });
  // the same body height as Brea (1.72 m) so the lens matches
  const box = new THREE.Box3().setFromObject(gltf.scene.getObjectByName('Body_Full'));
  root.scale.setScalar(1.72 / (box.max.y - box.min.y));
  root.position.y = -box.min.y * root.scale.y;
  root.updateMatrixWorld(true);
  const head = gltf.scene.getObjectByName('Head').getWorldPosition(new THREE.Vector3());
  const hy = head.y + 0.10;
  const out = {};
  for (const [name, yaw] of [['front', 0], ['profile', Math.PI / 2]]) {
    const img = renderIsolated(ctx, root, { width: 360, height: 400, cam: { ...around(yaw, 1.2, hy, hy - 0.02), fov: 14 }, background: '#cfc9bd' });
    out[name] = canvasOf(img).toDataURL('image/png');
  }
  // dispose everything the load made
  root.traverse((o) => {
    if (o.isSkinnedMesh) o.skeleton?.dispose();
    o.geometry?.dispose();
    for (const m of [].concat(o.material || [])) { for (const k of Object.keys(m)) if (m[k]?.isTexture) m[k].dispose(); m.dispose(); }
  });
  return out;
}


/* ------------------------------------------------------------- armory W1 */

const imgOf = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(`no image ${url}`)); i.src = url; });

/** Fit an image into a box on the sheet, cropped to fill. */
function fitInto(g, img, x, y, w, h, cropY = 0.5) {
  const k = Math.max(w / img.width, h / img.height);
  const sw = w / k, sh = h / k;
  g.drawImage(img, (img.width - sw) / 2, (img.height - sh) * cropY, sw, sh, x, y, w, h);
}

/**
 * V-pan-closeup: Pan Whites I at close range in the game's own material, neutral
 * light, beside the licence-clean references: the torso, the girdle and pouch, the
 * rolled sleeve, the wrapped shin, the back. Pass or fail on material separation,
 * seams, wear and layered depth.
 */
export async function panCloseupOverlay(ctx, refs = []) {
  const model = await poseIdle(ctx);
  const W = 1600, H = 900;
  const { c, g } = overlay(W, H, '#e9e4d8');
  label(g, 'PAN WHITES I — close-up, in-engine material, neutral light (left) beside the references (right)', 20, 28, 16);
  const shots = [
    ['torso, 1.1 m', { pos: [0.34, 1.32, 0.92], target: [0.0, 1.14, 0], fov: 34 }, 0, 40, 400, 540],
    ['neck: bound keyhole, linen collar, tie', { pos: [0.1, 1.47, 0.5], target: [0.0, 1.41, 0.04], fov: 30 }, 402, 40, 296, 268],
    ['girdle, buckle, keeper, tongue', { pos: [0.14, 1.12, 0.56], target: [-0.01, 1.06, 0.08], fov: 30 }, 402, 312, 296, 268],
    ['sleeve, armhole, cuff', { pos: [-0.66, 1.34, 0.5], target: [-0.2, 1.2, 0.0], fov: 26 }, 700, 40, 296, 268],
    // (Nov 6: the knot is tied behind the left hip now, clear of the bow hand; fix round 1: on the band, at 1.07)
    ['sash knot on the band, tails', { pos: [0.78, 1.1, -0.72], target: [0.12, 0.97, -0.17], fov: 26 }, 700, 312, 296, 268],
    ['hem, under-tunic, trousers', { pos: [0.3, 0.72, 0.72], target: [0.04, 0.68, 0.04], fov: 34 }, 998, 40, 296, 268],
    ['shin wraps, sole', { pos: [0.34, 0.3, 0.66], target: [0.1, 0.2, 0.02], fov: 36 }, 998, 312, 296, 268],
    ['back, salt pouch', { pos: [-0.36, 1.28, -1.08], target: [0, 1.12, 0], fov: 36 }, 1296, 40, 300, 540],
  ];
  // the outfit, not the gear: the kit collapses for these renders (one synchronous pass, no frame runs)
  const kit = ctx.player.hero?.kit, hid0 = kit?.hidden ?? 0;
  kit?.setHidden(31);
  for (const [name, cam, x, y, w, h] of shots) {
    const shot = renderIsolated(ctx, model, { width: w * 2, height: h * 2, cam, background: '#b9b2a2', env: true });
    g.drawImage(canvasOf(shot), x + 8, y, w, h);
    g.fillStyle = 'rgba(233,228,216,0.82)'; g.fillRect(x + 8, y, w, 20);
    label(g, name, x + 14, y + 15, 12, '#1a1612');
  }
  kit?.setHidden(hid0);
  let rx = 8;
  for (const r of refs) {
    try { const i = await imgOf(`/${r.file}`); fitInto(g, i, rx, 590, 390, 290, r.cropY ?? 0.5); label(g, r.note, rx + 6, 606, 11, '#fff'); } catch { label(g, `missing ${r.file}`, rx + 6, 606, 12); }
    rx += 398;
  }
  return c.toDataURL('image/png');
}

/**
 * V-variant-sheet: each armor variant front / side / back, flat-lit, then a true
 * 20 m reading (FOV 55 at 1600 x 900: about 75 px tall). Swaps the outfit through
 * `hero.loadout` (awaits the deferred rows) and leaves her in the default.
 */
export async function variantSheetOverlay(ctx, ids = ['pan-1', 'pan-2', 'pan-3', 'ash-1']) {
  const hero = ctx.player.hero;
  const W = 1600, H = 900;
  const { c, g } = overlay(W, H);
  label(g, 'ARMOR VARIANTS (W1) — front, side, back at flat light; lower row: the same at 20 m (FOV 55, 1600x900: about 75 px)', 16, 22, 15);
  const views = [['front', 0], ['side', -Math.PI / 2], ['back', Math.PI]];
  const cellW = 130, cellH = 300;
  for (let v = 0; v < ids.length; v++) {
    await hero.loadout.equipArmor(ids[v]);
    await new Promise((r) => setTimeout(r, 400));
    const model = await poseIdle(ctx, 0.5);
    const x0 = 14 + v * 396;
    label(g, ids[v] + ' — ' + (hero.loadout.info().perk || ''), x0, 44, 13);
    views.forEach(([name, yaw], i) => {
      const shot = renderIsolated(ctx, model, { width: cellW * 2, height: cellH * 2, cam: { ...around(yaw, 5.2, 0.95, 0.93), fov: 22 }, background: '#d9d4c8' });
      g.drawImage(canvasOf(shot), x0 + i * (cellW - 4), 52, cellW - 4, cellH);
      label(g, name, x0 + i * (cellW - 4) + 3, 66, 10, '#403830');
      const fh = 900, far = renderIsolated(ctx, model, { width: 90, height: 96, cam: { ...around(yaw, 20, 0.95, 0.93), fov: 55 * (96 / fh) }, background: '#d9d4c8' });
      g.imageSmoothingEnabled = false;
      g.drawImage(canvasOf(far), x0 + i * (cellW - 4), 360, 90, 96);
      g.drawImage(canvasOf(far), x0 + i * (cellW - 4), 470, 90 * 1.4, 96 * 4 * 0.7);
      g.imageSmoothingEnabled = true;
    });
  }
  await hero.loadout.equipArmor('pan-1');
  label(g, 'each must read different at 20 m by shape, not only colour; no fur, no red hip sash, no braids; pauldrons sit on the clavicle', 16, 880, 13);
  return c.toDataURL('image/png');
}

/** V-weapon-sheet: the bow and the lance on their own at scale, with their detail crops. */
export async function weaponSheetOverlay(ctx, refs = []) {
  const W = 1600, H = 900;
  const { c, g } = overlay(W, H, '#e4dfd2');
  label(g, "WEAPONS (W1) — Sabina Bow 1.45 m, Shepherd's Lance 1.55 m, on the shared atlas, at one scale (1 m bar)", 16, 22, 15);
  const cmb = ctx.combat, bow = cmb.bow, sp = ctx.player.hero.heldLance();
  const shoot = async (src, cam, w, h, stand = false) => {
    const parent = src.parent, p0 = src.position.clone(), q0 = src.quaternion.clone(), s0 = src.scale.clone(), vis = src.visible;
    const grp = new THREE.Group();
    grp.add(src); src.position.set(0, 0, 0); src.quaternion.identity(); src.scale.setScalar(1); src.visible = true;
    // stand the lance up, tip to the sky (a GLB directly under `src` is authored along +Y already: melee's held prop)
    if (stand && Math.abs(src.children[0]?.rotation?.x ?? 0) > 0.1) src.rotation.x = -Math.PI / 2;
    src.traverse((o) => { o.userData.__v = o.visible; if (o.isMesh && o.userData.heroPart === 'held') o.visible = true; });
    const shot = renderIsolated(ctx, grp, { width: w, height: h, cam, background: '#e4dfd2', env: true });
    src.traverse((o) => { o.visible = o.userData.__v; delete o.userData.__v; });
    if (parent) parent.add(src); src.position.copy(p0); src.quaternion.copy(q0); src.scale.copy(s0); src.visible = vis;
    return shot;
  };
  const rows = [];
  bow.setDraw(0, true);
  const bowG = bow.model, lanceG = sp.model;
  const bm = 1.7;           // metres of frame height
  const b1 = await shoot(bowG, { pos: [2.6, 0.06, 0.1], target: [0, 0.06, -0.08], ortho: { h: bm } }, 380, 760);
  g.drawImage(canvasOf(b1), 20, 40, 190, 380 * 2);
  label(g, 'bow, side, braced', 30, 56, 11);
  bow.setDraw(1, true);
  const b2 = await shoot(bowG, { pos: [2.6, 0.06, -0.1], target: [0, 0.06, -0.14], ortho: { h: bm } }, 380, 760);
  g.drawImage(canvasOf(b2), 210, 40, 190, 380 * 2);
  label(g, 'bow, side, full draw', 220, 56, 11);
  bow.setDraw(0, false);
  const b3 = await shoot(bowG, { pos: [0.34, 0.11, -0.44], target: [0, 0.095, 0.03], fov: 30 }, 460, 400);
  g.drawImage(canvasOf(b3), 410, 40, 330, 287);
  label(g, 'grip: esparto, carmine', 420, 56, 11);
  const b4 = await shoot(bowG, { pos: [0.34, 0.74, -0.46], target: [0, 0.76, -0.1], fov: 28 }, 460, 400);
  g.drawImage(canvasOf(b4), 410, 330, 330, 287);
  label(g, 'upper limb, horn nock', 420, 346, 11);
  const sc0 = lanceG.scale.clone();
  lanceG.scale.setScalar(1);
  const l1 = await shoot(lanceG, { pos: [0, 0.775, 2.8], target: [0, 0.775, 0], ortho: { h: bm } }, 380, 760, true);
  g.drawImage(canvasOf(l1), 750, 40, 190, 380 * 2);
  label(g, 'lance, whole', 760, 56, 11);
  const l2 = await shoot(lanceG, { pos: [0.16, 1.43, 0.72], target: [0, 1.43, 0], fov: 30 }, 460, 400, true);
  g.drawImage(canvasOf(l2), 950, 40, 310, 270);
  label(g, 'leaf blade, socket, carmine lash', 960, 56, 11);
  const l3 = await shoot(lanceG, { pos: [0.1, 0.1, 0.34], target: [0, 0.06, 0], fov: 30 }, 460, 400, true);
  g.drawImage(canvasOf(l3), 950, 314, 310, 270);
  label(g, 'bob-shaped butt cap', 960, 330, 11);
  const l4 = await shoot(lanceG, { pos: [0.1, 1.14, 0.62], target: [0, 1.14, 0], fov: 30 }, 460, 400, true);
  g.drawImage(canvasOf(l4), 950, 588, 310, 270);
  label(g, 'vermilion / white graduations', 960, 604, 11);
  lanceG.scale.copy(sc0);
  void rows;
  let ry = 40;
  for (const r of refs) {
    try { const i = await imgOf(`/${r.file}`); fitInto(g, i, 1270, ry, 320, 270, r.cropY ?? 0.5); label(g, r.note, 1276, ry + 16, 11, '#fff'); } catch { label(g, `missing ${r.file}`, 1276, ry + 16, 12); }
    ry += 276;
  }
  return c.toDataURL('image/png');
}


/**
 * V-gear-in-hand: the gear on her, in the world's own light. Full draw from her right
 * and from her front-right; the lance in her hands from the side; the kit from behind.
 * Stages through the real input path; freezes the sim while it films.
 */
export async function gearInHandOverlay(ctx) {
  const p = ctx.player, an = p.animator, E = ctx.engine, cmb = ctx.combat, T3 = p.position.constructor;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const W = 1600, H = 900;
  const { c, g } = overlay(W, H, '#14120f');
  const live = (pos, tgt, x, y, w, h, fov = 30) => {
    const img = liveView(ctx, [pos.x, pos.y, pos.z], [tgt.x, tgt.y, tgt.z], { width: w, height: h, fov });
    g.drawImage(canvasOf(img), x, y, w, h);
  };
  const toW = (x, y, z) => p.model.localToWorld(new T3(x, y, z));
  // --- full draw
  ctx.input.mouse.buttons |= 4; await wait(800);
  ctx.input.mouse.buttons |= 1; await wait(2200);
  cmb._updateAimPoint = () => {};
  const ts0 = E.timeScale;
  E.timeScale = 0; await frame(); await frame();
  const tgtD = toW(0, 1.28, 0.22);
  live(toW(-2.1, 1.36, 0.28), tgtD, 0, 30, 620, 860, 34);
  live(toW(-1.05, 1.42, 1.5), tgtD, 620, 30, 490, 430, 34);
  live(toW(0.1, 1.5, -1.6), toW(0, 1.2, 0.05), 620, 460, 490, 430, 34);
  label(g, 'full draw: from her right, front-right, behind', 10, 20, 13, '#efe8da');
  E.timeScale = ts0;
  ctx.input.mouse.buttons = 0; await wait(400);
  delete cmb._updateAimPoint;
  // --- the lance in her hands (fix round 1, judges: "both lance panels crop her head and catch the lance trailing in
  // one hand": the frame is taken once she is READY, out of the draw and settled, and each panel holds her whole
  // figure, head to boots, with the lance's full length)
  const M = cmb.melee;
  M.swing({});
  { const w0 = performance.now(); while (performance.now() - w0 < 5000) { await frame(); const st = M.poseState?.(); if (M.stance === 'ready' && (!st || st.phase === 'idle')) break; } }
  await wait(500);
  E.timeScale = 0; await frame(); await frame();
  live(toW(-2.7, 1.25, 1.35), toW(0, 0.92, 0.25), 1110, 30, 490, 430, 36);
  live(toW(2.0, 1.3, 2.4), toW(0, 0.92, 0.25), 1110, 460, 490, 430, 36);
  label(g, 'the lance in her hands, ready', 1120, 20, 13, '#efe8da');
  E.timeScale = ts0;
  void an;
  return c.toDataURL('image/png');
}

/**
 * The bow carried at a jog (the V29 staging without a machine: a live alert kind lands with the
 * Plumb, W1): the combat hold keeps it in her left hand. Film from her left, in the world's light.
 */
export async function bowCarryOverlay(ctx) {
  const p = ctx.player, E = ctx.engine, cmb = ctx.combat, T3 = p.position.constructor;
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const W = 1600, H = 900;
  const { c, g } = overlay(W, H, '#14120f');
  const toW = (x, y, z) => p.model.localToWorld(new T3(x, y, z));
  ctx.input.keys.clear(); ctx.input.keys.add('KeyW');
  const shots = [[2.3, 1.15, 0.2, 0, 800], [0.9, 1.3, 2.3, 800, 800]];
  const s0 = E.simTime, w0 = performance.now();
  while (E.simTime - s0 < 1.4 && performance.now() - w0 < 12000) { cmb.noteCombatAction?.(); await frame(); }
  const ts0 = E.timeScale;
  E.timeScale = 0; await frame(); await frame();
  for (const [x, y, z, ox, w] of shots) {
    const img = liveView(ctx, toW(x, y, z).toArray(), toW(0, 0.95, 0.05).toArray(), { width: w, height: 860, fov: 34 });
    g.drawImage(canvasOf(img), ox, 30, w, 860);
  }
  label(g, 'the bow carried at a jog: low in her LEFT hand, top limb forward', 10, 20, 13, '#efe8da');
  E.timeScale = ts0;
  ctx.input.keys.clear();
  return c.toDataURL('image/png');
}
