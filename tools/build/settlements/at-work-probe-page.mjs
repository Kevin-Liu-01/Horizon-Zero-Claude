/**
 * F36's people at work, measured in the frame (M2 fix wave, area B; NW5's count). Run by
 *   node tools/frames/film.mjs --port <p> --only F36 --no-review --probe /tools/build/settlements/at-work-probe-page.mjs
 * after F36 is staged, frozen and screenshotted. For every person the staging stood (ctx.people.holds._staged) and for Brea:
 *
 *   areaPx     the pixels of the frozen frame that are that figure's: the frame through the game's own render (E.render, the
 *              same post) against the same frame with that one figure hidden (all renders in one task, the world frozen), a
 *              channel changing by more than 12 (as tools/build/recipes/npc/cast-probe-page.mjs measures the crowd)
 *   box        its screen box from its skinned vertices, clamped to the frame ([x0, y0, x1, y1], viewport CSS px), and
 *              inFrame, the share of that box inside the frame
 *   violetPx   of areaPx, the pixels that read violet (HSV hue 255-335 deg, saturation >= 0.22, value >= 0.12)
 *   clip       the clip it stands in, its time and time scale (a held work clip: ts 0) and whether that clip is a work clip
 *   ground     the game's terrain under its feet against where its feet are (m)
 *   heights    (F36 only) the game's terrain.getHeight over the village on a 1 m grid (x0, z0, n, values in cm) for the lens
 *              planning in Node: the island bake in Node reads up to a metre off it round the cistern
 * `atWork` counts the people in a work clip with areaPx >= MIN_PX (a figure a viewer can read at 1600 x 900; a person at
 * 20 m covers about 1,000 px standing). Bar (NW5): 5. Nothing is changed that is not put back.
 */
const MIN_PX = 400;
const WORK = /Kneeling|PlantSeed|Harvest|Watering|PickUp|Chopping|Chest_Open|Fixing|Push|Sweep|Dig|Hammer/;
const VIOLET = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx / 255, s = mx ? (mx - mn) / mx : 0;
  if (v < 0.12 || s < 0.22) return false;
  let h;
  const d = mx - mn || 1;
  if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  return h >= 255 && h <= 335;
};

export async function probe(frame) {
  if (frame?.id !== 'F36' && !String(frame?.id || '').startsWith('F39')) return { skipped: 'measured on F36 and the F39 stagings only' };
  const THREE = await import('/tools/look/three.mjs');
  const C = window.__CTX__, E = C.engine, R = E.renderer, cam = C.camera, p = C.player;
  const H = C.people?.holds;
  const staged = (H?._staged || []).filter((q) => q.group);
  const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
  const W = R.domElement.width, Hh = R.domElement.height, cw = innerWidth, ch = innerHeight;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh;
  const g2 = cv.getContext('2d', { willReadFrequently: true });
  const grab = () => { E.render(0); g2.drawImage(R.domElement, 0, 0); return g2.getImageData(0, 0, W, Hh).data; };
  const figures = staged.map((q) => ({ id: q.archetype || q.id, obj: q.group, person: q }));
  if (p?.model?.visible) figures.push({ id: 'brea', obj: p.model, person: null });
  const V = new THREE.Vector3();
  const boxOf = (obj) => {
    const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    obj.updateMatrixWorld(true);
    obj.traverseVisible((m) => {
      if (!m.isMesh || !m.geometry?.attributes?.position || m.name === 'Caster') return;
      const pos = m.geometry.attributes.position, n = pos.count, stride = Math.max(1, Math.floor(n / 3000));
      for (let i = 0; i < n; i += stride) {
        if (m.getVertexPosition) m.getVertexPosition(i, V); else V.fromBufferAttribute(pos, i);
        V.applyMatrix4(m.matrixWorld).project(cam);
        if (V.z > 1) continue;
        const x = (V.x + 1) / 2 * cw, y = (1 - V.y) / 2 * ch;
        lo[0] = Math.min(lo[0], x); lo[1] = Math.min(lo[1], y); hi[0] = Math.max(hi[0], x); hi[1] = Math.max(hi[1], y);
      }
    });
    if (!Number.isFinite(lo[0])) return { box: null, inFrame: 0 };
    const cl = (v, m) => Math.max(0, Math.min(m, v));
    const a = (hi[0] - lo[0]) * (hi[1] - lo[1]) || 1;
    const ia = (cl(hi[0], cw) - cl(lo[0], cw)) * (cl(hi[1], ch) - cl(lo[1], ch));
    return { box: [lo[0], lo[1], hi[0], hi[1]].map(Math.round), inFrame: r2(ia / a) };
  };
  const all = grab();
  const rows = [];
  for (const f of figures) {
    const v0 = f.obj.visible;
    f.obj.visible = false;
    const px = grab();
    f.obj.visible = v0;
    let area = 0, violet = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (Math.max(Math.abs(px[i] - all[i]), Math.abs(px[i + 1] - all[i + 1]), Math.abs(px[i + 2] - all[i + 2])) <= 12) continue;
      area++;
      if (VIOLET(all[i], all[i + 1], all[i + 2])) violet++;
    }
    const q = f.person, cur = q?.current || null, name = cur?.getClip?.()?.name || null;
    const g = f.obj.getWorldPosition(new THREE.Vector3());
    rows.push({
      id: f.id, areaPx: area, violetPx: violet, ...boxOf(f.obj),
      clip: name, clipTime: r2(cur?.time), clipTs: cur ? cur.ts : null, work: !!(name && WORK.test(name)),
      at: [r2(g.x), r2(g.y), r2(g.z)], ground: r2(C.terrain?.getHeight?.(g.x, g.z)), tier: q ? q.tier : null,
      distance: r2(cam.position.distanceTo(g)),
    });
  }
  grab();
  const people = rows.filter((r) => r.id !== 'brea');
  const atWork = people.filter((r) => r.work && r.areaPx >= MIN_PX).length;
  const brea = rows.find((r) => r.id === 'brea') || null;
  const maxOther = people.reduce((m, r) => Math.max(m, r.violetPx), 0);
  let heights = null;
  if (frame.id === 'F36' && C.terrain?.getHeight) {
    const x0 = -51, z0 = 173, n = 81, v = new Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) v[j * n + i] = Math.round(C.terrain.getHeight(x0 + i, z0 + j) * 100);
    heights = { x0, z0, n, step: 1, cm: v };
  }
  return {
    heights,
    frame: { W, H: Hh, css: [cw, ch] }, minPx: MIN_PX, staged: staged.length, atWork, bar: 5, rows,
    held: people.every((r) => r.clipTs === 0),
    violet: brea ? { brea: brea.violetPx, maxOther, ratio: r2(brea.violetPx / Math.max(1, maxOther)), bar: 5 } : null,
  };
}
