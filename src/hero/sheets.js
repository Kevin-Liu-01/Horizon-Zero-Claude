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
export function renderIsolated(ctx, object, { width = 400, height = 600, cam, background = '#ffffff', fill = null } = {}) {
  const R = ctx.renderer;
  const scene = new THREE.Scene();
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
 * Pose the hero for a sheet: idle, nothing in hand. Fix round 4: she stands
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
