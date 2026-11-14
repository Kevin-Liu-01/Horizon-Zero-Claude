// tools/look/hdr-dump.gates.mjs (look-post; NOT auto-discovered: pass it with --extra). Dumps what the output pass
// tone-maps at the look places (the scene target with GTAO's multiply and bloom's composite folded in, as the grade
// pass does) as RGBE, so the grade can be tuned offline on the frames the gates grade.
// v2 (fix round 2): the look places are staged by the gate block's own stageLook (the same settle and lens), every
// other device pixel is sampled (A-look-frame-stats reads every other pixel too), 800 x 450 per place, two places per
// 1600 x 900 shot (mantissa | exponent), four rows X-look-hdr-dump-1..4. v1 (400 x 225, scene target only, no AO)
// is gone: without GTAO its darkest fifth read 5-8 L* above the graded frames.
//   cd <scratch> && nice -n 10 node <tree>/tools/gates.mjs --port <p> --extra <tree>/tools/look/hdr-dump.gates.mjs --only X-look-hdr-dump-1,...
//   then a meta.json beside the four PNGs: { tiles: [{ file, slot, name, hour }] } (HDR_DUMP_TILES below)
import path from 'path';
import { fileURLToPath } from 'url';
const T = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { LOOK_PRELUDE } = await import(T + '/gates.r5.look-post.mjs');
export const HDR_DUMP_TILES = [
  [['field'], ['vista']],
  [['aim'], ['close']],
  [['dusk'], ['field', { hour: 12.5, sunRel: 140, pitch: 0.02 }, 'noon']],
  [['field', { hour: 17.2, sunRel: 150 }, 'field17-back'], ['vista', { hour: 18.4, sunRel: -60 }, 'vista18-side']],
];
const SETUP = (pair) => `window.__lookJob = (async () => {
  ${LOOK_PRELUDE}
  try {
  const cv = document.createElement('canvas'); cv.width = 1600; cv.height = 900;
  Object.assign(cv.style, { position: 'fixed', left: '0', top: '0', width: '1600px', height: '900px', zIndex: 2147483647, background: '#000' });
  const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 1600, 900);
  const W = 800, H = 450;
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, depthBuffer: false });
  const gu = __E.grade.uniforms;
  const mat = new THREE.ShaderMaterial({ uniforms: { t: { value: null }, tAO: { value: null }, tBloom: { value: null }, aoMix: { value: 0 }, bloomOn: { value: 0 }, src: { value: new THREE.Vector2(1600, 900) } }, depthTest: false, depthWrite: false,
    vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D t; uniform sampler2D tAO; uniform sampler2D tBloom; uniform float aoMix; uniform float bloomOn; uniform vec2 src; void main(){ vec2 uv = (floor(gl_FragCoord.xy) * 2.0 + 0.5) / src; vec4 c = texture2D(t, uv); if (aoMix > 0.0) c.rgb *= mix(vec3(1.0), texture2D(tAO, uv).rgb, aoMix); if (bloomOn > 0.0) { vec4 bl = texture2D(tBloom, uv); c.rgb += bl.rgb * bl.a; } gl_FragColor = vec4(c.rgb, 1.0); }' });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat), sc = new THREE.Scene(); sc.add(q); const oc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const grabHdr = () => new Promise((res) => { const hook = function lookHdr() { const i = __E.onAfterRender.indexOf(hook); if (i >= 0) __E.onAfterRender.splice(i, 1);
    const st = __E.sceneTarget; mat.uniforms.t.value = st.texture; mat.uniforms.src.value.set(st.width, st.height);
    mat.uniforms.tAO.value = gu.tAO.value; mat.uniforms.aoMix.value = gu.tAO.value ? gu.uAOMix.value : 0;
    mat.uniforms.tBloom.value = gu.tBloom.value; mat.uniforms.bloomOn.value = gu.tBloom.value ? gu.uBloomOn.value : 0;
    __R.setRenderTarget(rt); __R.render(sc, oc); const buf = new Float32Array(W * H * 4); __R.readRenderTargetPixels(rt, 0, 0, W, H, buf); __R.setRenderTarget(null); res(buf); };
    __E.onAfterRender.push(hook); });
  const put = (buf, slot) => {
    const oy = slot * 450, m = g.createImageData(W, H), e = g.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const si = ((H - 1 - y) * W + x) * 4, di = (y * W + x) * 4;
      const r = Math.max(0, buf[si]), gg = Math.max(0, buf[si + 1]), b = Math.max(0, buf[si + 2]);
      const mx = Math.max(r, gg, b);
      if (mx < 1e-9) { m.data[di] = m.data[di + 1] = m.data[di + 2] = 0; e.data[di] = 0; }
      else { const ex = Math.ceil(Math.log2(mx) + 1e-9); const k = 256 / Math.pow(2, ex);
        m.data[di] = Math.min(255, Math.floor(r * k)); m.data[di + 1] = Math.min(255, Math.floor(gg * k)); m.data[di + 2] = Math.min(255, Math.floor(b * k)); e.data[di] = ex + 128; }
      m.data[di + 3] = 255; e.data[di + 1] = 0; e.data[di + 2] = 0; e.data[di + 3] = 255;
    }
    g.putImageData(m, 0, oy); g.putImageData(e, 800, oy);
  };
  const info = [];
  const pair = ${JSON.stringify(pair)};
  for (let k = 0; k < pair.length; k++) {
    const [name, o = {}, label] = pair[k];
    const s = await stageLook(name, o);
    if (s.skip) { info.push({ k, name, skip: s.skip }); continue; }
    put(await grabHdr(), k);
    info.push({ k, name: label || name, hour: s.hour, exposure: __R.toneMappingExposure, aoMix: gu.uAOMix.value, bloomOn: gu.uBloomOn.value });
    unstage();
  }
  document.body.appendChild(cv);
  window.__hdrInfo = info; console.log('[hdr-dump] ' + JSON.stringify(info));
  rt.dispose(); mat.dispose(); q.geometry.dispose();
  } catch (e) { console.warn('[hdr-dump] ' + (e && e.message)); } finally { try { unstage(); } catch (e) { /* */ } window.__lookJobDone = true; }
})(); 'started'`;
export const GATES = HDR_DUMP_TILES.map((pair, i) => ({ id: 'X-look-hdr-dump-' + (i + 1), kind: 'visual', lane: 'look-post-tooling', timeout: 240000, settle: 110000, setup: SETUP(pair), criteria: 'tooling: RGBE dump, not graded' }));
