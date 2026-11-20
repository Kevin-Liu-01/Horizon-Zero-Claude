/**
 * THE SKYLINE MASKS (area A, M2 wave 1; M2 briefs §2 rule 3, HG8). The Holds, the Scar, Ninewalls and the Malpais
 * edge will appear on the skyline of accepted frames (F02, F05, F17, F24, F25, F32) and of the T1 beat's lens. Each
 * frame's mask is the set of pixels where that content can ever be drawn: a pixel is in the mask when its ray, before
 * it strikes ground outside the region, passes over the region's ground lower than the region's headroom (the
 * tallest thing it will hold), or strikes the region's ground. A change inside a mask is expected and re-anchored once;
 * a change outside it is a regression.
 *
 * The rays are the frame's own lens, read off the frozen frame by `film.mjs --probe /tools/world/camera-probe-page.mjs`
 * (its world matrix, fov and aspect); the ground is the island bake (recipe.heightAt on the render grid, bilinear),
 * the sea its surface. Nothing but the ground occludes (a house, a rock, Brea: the mask is only ever too large).
 *
 *   node tools/world/skyline-masks.mjs --run <film run dir> [--out <dir>] [--base <tree>]
 *       one mask per probed frame: <out>/<id>-mask.png (white = may change), <out>/masks.json (coverage, lens);
 *       with --base, also the pixels whose ground the blockout moved (the base tree's recipe against this one's):
 *       every one of them must be inside its mask
 *   node tools/world/skyline-masks.mjs --compare <run A> <run B> --masks <dir>
 *       per frame: the share of pixels changed (largest channel over 10 of 255) inside and outside its mask between
 *       two films, and, when run A was filmed with --repeat 2, A's own repeat difference outside the mask (the floor)
 *   --preview  with --run: also <id>-depth.png, the Node lens's view of the ground (to check it against the film)
 *
 * The masks live outside the repo (default <review>/masks/<run name>/); the region and headrooms are MASK_REGION below.
 *
 *   --region m3   (Milestone 3 wave 1, area A: the smallest change) the Malpais' region instead of the Holds': every
 *                 cell whose dominant biome is the Malpais, at the headrooms of tools/frames/stagings/m3-world.mjs MASKS
 *                 (its ground everywhere, the Yards' towers and stacks, the hornitos and their steam)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { ensureMacro, heightAt, biomesAt } from '../../src/world/island/recipe.js';
import { GRID } from '../../src/world/island/bake.js';
import { siteById } from '../../src/world/island/sites.js';
import { SCAR_LINE, FOOTPRINT, scarFrame } from '../../src/world/holds/blockout.js';
import { REVIEW, assertOutsideRepo } from '../frames/paths.mjs';
import { MASKS as M3_MASKS } from '../frames/stagings/m3-world.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * The region and what it may hold (m above its ground): the Holds' land (walls 2.4 m, dwellings, the dragon tree under
 * 9 m, the Screed 3.8 m, Tillers, carrizo), the Scar's band, the Malpais edge (the Holds' neighbour within 120 m) and
 * the Kiln Yards' far form (tower stubs 22-28 m). Authored frame (E, N).
 */
export const MASK_REGION = Object.freeze({
  holds: 12, scarBand: 30, scar: 8, malpaisEdge: 10, malpaisEdgeReach: 120,
  kilnYards: Object.freeze({ site: 'kiln-yards', r: 80, headroom: 32 }),
  cell: 4,
});

/* ---------------------------------------------------------------- the ground: the bake, bilinear */
function bakeGrid(hf) {
  const { side, step, half } = GRID, H = new Float32Array(side * side);
  for (let iz = 0; iz < side; iz++) for (let ix = 0; ix < side; ix++) H[iz * side + ix] = hf(ix * step - half, iz * step - half);
  return (x, z) => {
    const fx = (x + half) / step, fz = (z + half) / step;
    if (fx < 0 || fz < 0 || fx >= side - 1 || fz >= side - 1) return -20;
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, o = iz * side + ix;
    const a = H[o], b = H[o + 1], c = H[o + side], d = H[o + side + 1];
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * tz;
  };
}

/* ---------------------------------------------------------------- the region: headroom per 4 m cell (engine x, z) */
function regionGrid() {
  const c = MASK_REGION.cell, half = 560, n = Math.round((2 * half) / c) + 1;
  const dom = new Int8Array(n * n), head = new Float32Array(n * n), w = new Float64Array(6);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -half + i * c, z = -half + j * c;
    biomesAt(x, z, w);
    let bi = 0; for (let b = 1; b < 6; b++) if (w[b] > w[bi]) bi = b;
    dom[j * n + i] = heightAt(x, z) > 0 ? bi : -1;
  }
  // the Holds' land, and the Malpais within reach of it
  const reach = Math.ceil(MASK_REGION.malpaisEdgeReach / c);
  const holdsCells = [];
  for (let k = 0; k < n * n; k++) if (dom[k] === 1) { head[k] = MASK_REGION.holds; holdsCells.push(k); }
  const near = new Uint8Array(n * n);
  for (const k of holdsCells) {
    const i0 = k % n, j0 = (k / n) | 0;
    // only cells on the Holds' border spread (a cheap distance transform)
    let border = false;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = (j0 + dj) * n + i0 + di; if (dom[q] !== 1) { border = true; break; } }
    if (!border) continue;
    for (let dj = -reach; dj <= reach; dj++) for (let di = -reach; di <= reach; di++) {
      if (di * di + dj * dj > reach * reach) continue;
      const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= n || j >= n) continue;
      near[j * n + i] = 1;
    }
  }
  for (let k = 0; k < n * n; k++) if (near[k] && dom[k] === 2) head[k] = Math.max(head[k], MASK_REGION.malpaisEdge);
  // the Scar's band and the blockout's footprint
  const f = { u: 0, v: 0 };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -half + i * c, z = -half + j * c, e = x, nn = -z, k = j * n + i;
    scarFrame(e, nn, f);
    if (Math.abs(f.v) <= MASK_REGION.scarBand && f.u > -MASK_REGION.scarBand && f.u < SCAR_LINE.len + MASK_REGION.scarBand) head[k] = Math.max(head[k], MASK_REGION.scar);
    if (e >= FOOTPRINT.e0 && e <= FOOTPRINT.e1 && nn >= FOOTPRINT.n0 && nn <= FOOTPRINT.n1 && dom[k] === 1) head[k] = Math.max(head[k], MASK_REGION.holds);
  }
  const ky = siteById(MASK_REGION.kilnYards.site);
  if (ky) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -half + i * c, z = -half + j * c;
    if (Math.hypot(x - ky.x, z - ky.z) <= MASK_REGION.kilnYards.r) head[j * n + i] = Math.max(head[j * n + i], MASK_REGION.kilnYards.headroom);
  }
  return (x, z) => {
    const i = Math.round((x + half) / c), j = Math.round((z + half) / c);
    if (i < 0 || j < 0 || i >= n || j >= n) return 0;
    return head[j * n + i];
  };
}

/* ---------------------------------------------------------------- the Malpais' region (--region m3) */
function regionGridM3() {
  const R = M3_MASKS.region, c = MASK_REGION.cell, half = 560, n = Math.round((2 * half) / c) + 1;
  const head = new Float32Array(n * n), w = new Float64Array(6);
  const yards = siteById(R.yards.site), horn = siteById(R.hornitos.site);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -half + i * c, z = -half + j * c, k = j * n + i;
    if (heightAt(x, z) <= 0) continue;
    biomesAt(x, z, w);
    let bi = 0; for (let b = 1; b < 6; b++) if (w[b] > w[bi]) bi = b;
    if (bi === 2) head[k] = R.malpais;
    if (yards && Math.hypot(x - yards.x, z - yards.z) <= R.yards.r) head[k] = Math.max(head[k], R.yards.headroom);
    if (horn && Math.hypot(x - horn.x, z - horn.z) <= R.hornitos.r) head[k] = Math.max(head[k], R.hornitos.headroom);
  }
  return (x, z) => {
    const i = Math.round((x + half) / c), j = Math.round((z + half) / c);
    if (i < 0 || j < 0 || i >= n || j >= n) return 0;
    return head[j * n + i];
  };
}

/* ---------------------------------------------------------------- the rays */
function rayDirs(probe, W, Hh) {
  const [qx, qy, qz, qw] = probe.quaternion;
  const t = Math.tan((probe.fov * Math.PI / 180) / 2), asp = probe.aspect || W / Hh;
  const rot = (x, y, z) => {   // v' = q v q*
    const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
    return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
  };
  return (px, py) => {
    const nx = ((px + 0.5) / W) * 2 - 1, ny = 1 - ((py + 0.5) / Hh) * 2;
    const d = rot(nx * t * asp, ny * t, -1), l = Math.hypot(d[0], d[1], d[2]);
    return [d[0] / l, d[1] / l, d[2] / l];
  };
}

/** March one ray: { inMask, hitT } (hitT: the first ground or sea it strikes, Infinity for the sky). */
function march(o, d, ground, head, tMax = 2400) {
  let t = 0.3, inMask = false;
  while (t < tMax) {
    const x = o[0] + d[0] * t, y = o[1] + d[1] * t, z = o[2] + d[2] * t;
    const g = ground(x, z), surf = g > 0 ? g : 0;
    const hr = head(x, z);
    if (y <= surf) { if (hr > 0 && g > 0) inMask = true; return { inMask, hitT: t }; }
    if (hr > 0 && g > 0 && y <= g + hr) inMask = true;
    t += Math.max(0.25, t * 0.004);
  }
  return { inMask, hitT: Infinity };
}

async function writeMask(file, bits, w, h) {
  const buf = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) buf[i] = bits[i] ? 255 : 0;
  await sharp(buf, { raw: { width: w, height: h, channels: 1 } }).png().toFile(file);
}

function dilate(bits, w, h, r) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!bits[y * w + x]) continue;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
      out[Y * w + X] = 1;
    }
  }
  return out;
}

/* ---------------------------------------------------------------- build */
async function build() {
  const runDir = flag('--run');
  const run = JSON.parse(readFileSync(path.join(runDir, 'run.json'), 'utf8'));
  const out = flag('--out') || path.join(REVIEW, 'masks', path.basename(runDir));
  assertOutsideRepo(out, REPO);
  mkdirSync(out, { recursive: true });
  ensureMacro();
  const M3 = flag('--region') === 'm3';
  const ground = bakeGrid(heightAt), head = M3 ? regionGridM3() : regionGrid();
  let groundBase = null;
  if (flag('--base')) {
    const base = await import(pathToFileURL(path.resolve(flag('--base'), 'src/world/island/recipe.js')).href);
    base.ensureMacro();
    groundBase = bakeGrid(base.heightAt);
  }
  const vw = run.viewport?.width || 1600, vh = run.viewport?.height || 900, S = 4, w = vw / S, h = vh / S;
  const manifest = { tool: 'tools/world/skyline-masks.mjs', run: path.basename(runDir), commit: run.commit, dirty: run.dirty, region: M3 ? { m3: M3_MASKS.region } : MASK_REGION, frames: {} };
  for (const fr of run.frames) {
    const pr = fr.probe;
    if (!fr.ok || !pr || pr.error || (fr.repeat || 1) > 1) continue;
    const dir = rayDirs(pr, w, h), o = pr.position;
    const bits = new Uint8Array(w * h), moved = new Uint8Array(w * h), depth = new Uint8Array(w * h);
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const d = dir(px, py), r = march(o, d, ground, head);
      bits[py * w + px] = r.inMask ? 1 : 0;
      depth[py * w + px] = r.hitT === Infinity ? 255 : Math.min(250, Math.round(Math.log2(1 + r.hitT) * 22));
      if (groundBase) {
        const b = march(o, d, groundBase, () => 0);
        const hitA = r.hitT, hitB = b.hitT;
        // the ground the pixel shows moved: its first strike is a different distance (or one of them is the sky)
        if (!(hitA === Infinity && hitB === Infinity) && !(Math.abs(hitA - hitB) <= Math.max(0.05, hitA * 0.0005))) moved[py * w + px] = 1;
      }
    }
    // full resolution, dilated by 3 px (the 4 px rays' footprint and the bilinear's reach)
    const full = new Uint8Array(vw * vh);
    for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) full[y * vw + x] = bits[((y / S) | 0) * w + ((x / S) | 0)];
    const mask = dilate(full, vw, vh, 3);
    let n = 0; for (let i = 0; i < mask.length; i++) n += mask[i];
    await writeMask(path.join(out, `${fr.id}-mask.png`), mask, vw, vh);
    const rec = { coveragePct: r3(n / mask.length * 100), lens: { position: pr.position.map(r3), fov: pr.fov, aspect: r3(pr.aspect) } };
    if (groundBase) {
      let mv = 0, outside = 0;
      for (let i = 0; i < w * h; i++) if (moved[i]) { mv++; if (!bits[i]) outside++; }
      rec.groundMoved = { rays: mv, outsideMask: outside, of: w * h };
      await writeMask(path.join(out, `${fr.id}-moved.png`), moved, w, h);
    }
    // the Node lens's view of the ground (grey by distance, white sky): checked against the film by eye
    if (args.includes('--preview')) await sharp(Buffer.from(depth), { raw: { width: w, height: h, channels: 1 } }).png().toFile(path.join(out, `${fr.id}-depth.png`));
    manifest.frames[fr.id] = rec;
    console.log(`${fr.id.padEnd(9)} mask ${rec.coveragePct} % of the frame${rec.groundMoved ? `; rays whose ground the blockout moved ${rec.groundMoved.rays}, outside the mask ${rec.groundMoved.outsideMask}` : ''}`);
  }
  writeFileSync(path.join(out, 'masks.json'), JSON.stringify(manifest, null, 1));
  console.log(`masks: ${out}`);
}

/* ---------------------------------------------------------------- compare two films */
async function compare() {
  const i = args.indexOf('--compare'), A = args[i + 1], B = args[i + 2], M = flag('--masks');
  const ra = JSON.parse(readFileSync(path.join(A, 'run.json'), 'utf8')), rb = JSON.parse(readFileSync(path.join(B, 'run.json'), 'utf8'));
  const TH = 10;
  const raw = async (f) => sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const stats = (a, b, m, W, Hh) => {
    let inN = 0, inC = 0, outN = 0, outC = 0;
    for (let k = 0; k < W * Hh; k++) {
      const o = k * 3, dd = Math.max(Math.abs(a[o] - b[o]), Math.abs(a[o + 1] - b[o + 1]), Math.abs(a[o + 2] - b[o + 2]));
      if (m[k]) { inN++; if (dd > TH) inC++; } else { outN++; if (dd > TH) outC++; }
    }
    return { insidePct: inN ? r3(inC / inN * 100) : null, outsidePct: outN ? r3(outC / outN * 100) : null, outsidePx: outC };
  };
  const res = {};
  for (const fa of ra.frames) {
    if (!fa.ok || (fa.repeat || 1) > 1) continue;
    const fb = rb.frames.find((x) => x.id === fa.id && x.ok && (x.repeat || 1) === 1);
    const mf = path.join(M, `${fa.id}-mask.png`);
    if (!fb || !existsSync(mf)) continue;
    const a = await raw(path.join(A, fa.file)), b = await raw(path.join(B, fb.file));
    const mk = await sharp(mf).extractChannel(0).raw().toBuffer();
    const W = a.info.width, Hh = a.info.height;
    const s = stats(a.data, b.data, mk, W, Hh);
    const rep = ra.frames.find((x) => x.id === fa.id && x.repeat === 2 && x.ok);
    if (rep) { const a2 = await raw(path.join(A, rep.file)); s.floor = stats(a.data, a2.data, mk, W, Hh); }
    const repB = rb.frames.find((x) => x.id === fa.id && x.repeat === 2 && x.ok);
    if (repB) { const b2 = await raw(path.join(B, repB.file)); s.floorB = stats(b.data, b2.data, mk, W, Hh); }
    res[fa.id] = s;
    console.log(`${fa.id.padEnd(9)} changed inside the mask ${s.insidePct} %, outside ${s.outsidePct} % (${s.outsidePx} px)${s.floor ? `; A's own repeat outside ${s.floor.outsidePct} %` : ''}${s.floorB ? `; B's own repeat outside ${s.floorB.outsidePct} %` : ''}`);
  }
  if (flag('--json')) writeFileSync(flag('--json'), JSON.stringify({ A, B, masks: M, threshold: TH, frames: res }, null, 1));
}

if (args.includes('--compare')) await compare();
else if (flag('--run')) await build();
else { console.error('usage: --run <film run dir> [--out <dir>] [--base <tree>] | --compare <run A> <run B> --masks <dir>'); process.exit(2); }
