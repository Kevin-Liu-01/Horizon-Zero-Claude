// tools/look/hdr-dump.gates.mjs (look-post; NOT auto-discovered: pass it with --extra). Dumps the HDR scene target of the look
// places as RGBE (mantissa block + exponent block) into a 1600x900 overlay, so the grade can be tuned offline.
// Decode and preview with tools/look/hdr-look.mjs (one Chrome run, then node only):
//   cd <scratch> && nice -n 10 node <tree>/tools/gates.mjs --port <p> --extra <tree>/tools/look/hdr-dump.gates.mjs --only X-look-hdr-dump
//   node <tree>/tools/look/hdr-look.mjs shots/gates/X-look-hdr-dump.png out [set] [ev]
import path from 'path';
import { fileURLToPath } from 'url';
const T = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { LOOK_STANDINS } = await import(T + '/look/places.mjs');
const { PLACES } = await import(T + '/gate-places.mjs');
const SETUP = `window.__lookJob = (async () => {
  ${PLACES}
  const __C = window.__CTX__, __E = __C.engine, __R = __E.renderer;
  const THREE = await import('/tools/look/three.mjs');
  const STANDINS = ${JSON.stringify(LOOK_STANDINS)};
  const frames = async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); };
  const sunYaw = () => { const s = __C.environment.sunDir; return Math.atan2(-s.x, -s.z); };
  const cv = document.createElement('canvas'); cv.width = 1600; cv.height = 900;
  Object.assign(cv.style, { position: 'fixed', left: '0', top: '0', width: '1600px', height: '900px', zIndex: 2147483647, background: '#000' });
  document.body.appendChild(cv);
  const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 1600, 900);
  const W = 400, H = 225;
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, depthBuffer: false });
  const mat = new THREE.ShaderMaterial({ uniforms: { t: { value: null } }, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D t; varying vec2 vUv; void main(){ vec2 px = 1.0 / vec2(' + W + '.0, ' + H + '.0); vec3 c = vec3(0.0); for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) c += texture2D(t, vUv + (vec2(float(i), float(j)) - 1.5) * px * 0.25).rgb; gl_FragColor = vec4(c / 16.0, 1.0); }' });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat), sc = new THREE.Scene(); sc.add(q); const oc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const grabHdr = () => new Promise((res) => { const hook = function lookHdr() { const i = __E.onAfterRender.indexOf(hook); if (i >= 0) __E.onAfterRender.splice(i, 1);
    mat.uniforms.t.value = __E.sceneTarget.texture; __R.setRenderTarget(rt); __R.render(sc, oc); const buf = new Float32Array(W * H * 4); __R.readRenderTargetPixels(rt, 0, 0, W, H, buf); __R.setRenderTarget(null); res(buf); };
    __E.onAfterRender.push(hook); });
  const put = (buf, slot) => {
    const ox = (slot % 2) * 800, oy = Math.floor(slot / 2) * 225;
    const m = g.createImageData(W, H), e = g.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const si = ((H - 1 - y) * W + x) * 4, di = (y * W + x) * 4;
      const r = Math.max(0, buf[si]), gg = Math.max(0, buf[si + 1]), b = Math.max(0, buf[si + 2]);
      const mx = Math.max(r, gg, b);
      if (mx < 1e-9) { m.data[di] = m.data[di + 1] = m.data[di + 2] = 0; e.data[di] = 0; }
      else { const ex = Math.ceil(Math.log2(mx) + 1e-9); const k = 256 / Math.pow(2, ex);
        m.data[di] = Math.min(255, Math.floor(r * k)); m.data[di + 1] = Math.min(255, Math.floor(gg * k)); m.data[di + 2] = Math.min(255, Math.floor(b * k)); e.data[di] = ex + 128; }
      m.data[di + 3] = 255; e.data[di + 1] = 0; e.data[di + 2] = 0; e.data[di + 3] = 255;
    }
    g.putImageData(m, ox, oy); g.putImageData(e, ox + 400, oy);
  };
  const shots = [['field'], ['vista'], ['aim'], ['dusk'], ['field', { hour: 17.2, sunRel: 150 }], ['vista', { hour: 18.4, sunRel: -60 }], ['field', { hour: 13, sunRel: 120 }], ['close']];
  const info = [];
  for (let k = 0; k < shots.length; k++) {
    const [name, o = {}] = shots[k]; const P0 = STANDINS[name]; const b = PLACE(P0.base); if (!b) continue;
    const P = { ...P0, ...o };
    const env = __C.environment, p = __C.player;
    __E.requestTimeScale('studio', 0); env.timeFrozen = true; env.setWeather('clear', 0.05); env.setTime(P.hour); __E.setLookHour?.(P.hour, 'clear');
    p.position.set(b.x, 0, b.z); p.velocity?.set?.(0, 0, 0); p._snapToGround?.(); await frames(3);
    p.camYaw = sunYaw() + (P.sunRel || 0) * Math.PI / 180; p.camPitch = P.pitch ?? 0;
    let saved = null;
    if (P.cam === 'close') { await frames(4); const head = p.animator?.b?.head?.bone; if (head) { saved = p._updateCamera; p._updateCamera = () => {}; const cam = __C.camera, hp = new THREE.Vector3(), fw = new THREE.Vector3(0, 0, 1); head.getWorldPosition(hp); (p.model || head).updateMatrixWorld(true); fw.transformDirection((p.model || head).matrixWorld); fw.y = 0; fw.normalize(); fw.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.61); cam.position.copy(hp).addScaledVector(fw, 0.8); cam.position.y -= 0.03; cam.lookAt(hp.x, hp.y - 0.02, hp.z); cam.updateMatrixWorld(); } }
    await frames(24);
    put(await grabHdr(), k);
    info.push({ k, name, hour: P.hour, sunRel: P.sunRel, exposure: __R.toneMappingExposure });
    if (saved) p._updateCamera = saved;
    __E.requestTimeScale('studio', null);
  }
  window.__hdrInfo = info; document.title = JSON.stringify(info);
  rt.dispose(); mat.dispose(); q.geometry.dispose();
  window.__lookJobDone = true;
})(); 'started'`;
export const GATES = [{ id: 'X-look-hdr-dump', kind: 'visual', lane: 'look-post-tooling', timeout: 240000, settle: 100000, setup: SETUP, criteria: 'tooling: RGBE dump, not graded' }];
