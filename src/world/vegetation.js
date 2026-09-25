import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  SimplexNoise, pathFactor, riverFactor, shelfFactor,
  riverCenterX, riverHalfWidth,
  biomeWeights, forestFactor, snowFactor, marshFactor, ashFactor, screeFactor,
  northBenchFactor,
} from './terrain.js';
import { Props } from './props.js';

/**
 * ROUND 4 — lane `world-ground`. Everything that grows on the ground.
 *
 * Findings closed here: world-08 (sparse grass, bald past 110 m),
 * world-09 (cone-stack toy trees), world-17 (path litter),
 * world-18 (flowers are floating squares), `stealth-grass-visual-concealment`,
 * `stealth-no-cover-on-routes` (the density field reads terrain's authored
 * discs), `stealth-grass-interaction` (`uActors` bend + spring-back).
 *
 * ---------------------------------------------------------------------------
 * WHY THE GRASS STREAMS. The gate asks for >= 4 tufts/m^2 near the player and
 * >= 6 in a stealth patch. Over the 342,000 m^2 play disc that is ~1.5 M
 * instances — 120 MB of instance buffers and ten seconds of scatter — so the
 * near and mid tiers are POOLS of chunks that follow the camera on a toroidal
 * index, re-scattered in the background with a per-frame millisecond budget.
 * Memory and build time are then a function of the RING, not of the world.
 *
 *   near   9 chunks of 56 m  10.8 cand/m^2  full detail, fades out 46..62 m
 *   mid    9 chunks of 150 m   1.5 cand/m^2  1.75x tufts, 42 m .. 222 m
 *   far   16 static 192 m     0.22 cand/m^2  2.4x tufts, 172 m .. 344 m
 *
 * A tuft is a CARD — two crossed alpha-tested quads (8 verts, 4 triangles)
 * carrying a baked blade cluster — not the 28-triangle blade fan of Round 3.
 * That is what buys the 5x density inside the same triangle budget.
 *
 * TREES are branch cards on a trunk, in three LODs plus a crossed-billboard
 * impostor, ~1500 of them. LOD membership is re-sorted only when the camera
 * has moved 10 m, so the per-frame cost is zero.
 *
 * PUBLISHED (world-ground):
 *   vegetation.grassDensityAt(x, z)      authored tufts/m^2 at a point
 *   vegetation.countGrassNear(x, z, r)   live instances inside a disc
 *   vegetation.grassStats()              { near, mid, far, capacity, chunks }
 *   vegetation.treeStats()               { total, lod: [n0,n1,n2,nImp] }
 *   vegetation.forceStream(x, z)         synchronous re-scatter around a point
 *                                        (gates + teleports; ~120 ms)
 *   vegetation.windAt(x, z, t)           coherent gust 0..1 (audio rustle)
 *   vegetation.gustLevel                 gust at the player
 *   vegetation.displacers                the four live `uActors` slots
 * ---------------------------------------------------------------------------
 */

/* ------------------------------- tuning ---------------------------------- */
const GRASS_MAX_R = 336;          // no grass beyond the playable rim
const CAMP = { x: 22, z: 30 };
// ruin clusters + watchtower (see props.js) — keep trees/bushes from
// spawning through the structures
const KEEPOUT = [[-150, -55, 14], [135, -35, 14], [-45, 185, 14], [33, -14, 9]];

/** Authored grass density, tufts/m^2.
 *
 * MEASURED BUDGET, not a taste call. A same-run A/B in the meadow put
 * `vegetation.group` at 22.3 ms of a 38.9 ms frame while A59 was measuring
 * 8.9-10.7 tufts/m^2 against a floor of 4 and 0.149 bare ground against a
 * ceiling of 0.25 — better than 2x of headroom on the number the gate
 * actually asks for. Density comes down; card scale goes up a little so the
 * COVERAGE half of A59 (the framebuffer A/B, which is what "the meadow looks
 * like a meadow" really means) barely moves; and the near tier's fade window
 * comes in from 62 m to 48 m so the 10 tufts/m^2 tier stops being drawn out
 * where the 1 tuft/m^2 tier is already covering the ground.
 */
const D_MEADOW = 5.4;             // open meadow floor
const D_STEALTH = 4.0;            // added inside terrain's authored discs
const D_MAX = D_MEADOW + D_STEALTH;

/**
 * Pool geometry. `ring` is the Chebyshev radius in chunks, so the window is
 * (2r+1)^2 chunks and the GUARANTEED cover from the camera is
 * (ring + 0.5) * chunk — every fade-out must end inside that number or the
 * player can outrun the tier and see a bald ring.
 *   near: (1 + 0.5) * 56  = 84 m  >= 62
 *   mid:  (1 + 0.5) * 150 = 225 m >= 222
 */
const NEAR = {
  name: 'grass-chunk', chunk: 56, ring: 1, cand: D_MAX, norm: D_MAX, fill: 0.90,
  // fade-in starts at 0, not -4: at -4 the window was already full-open under
  // the camera, so cards directly beneath the lens were drawn at full size
  fade: [0, 3, 34, 48], sMul: 1.12, hMul: 1.04, cast: true,
};
const MID = {
  name: 'grass-mid', chunk: 150, ring: 1, cand: 1.0, norm: D_MEADOW, fill: 1.0,
  fade: [30, 44, 196, 222], sMul: 1.85, hMul: 1.55, cast: false,
};
const FAR = {
  name: 'grass-far', chunk: 192, grid: 4, cand: 0.22, norm: D_MEADOW,
  fade: [172, 214, 300, 344], sMul: 2.4, hMul: 2.0,
};

/** Tree LOD bands, metres. Band i is [LOD_BANDS[i-1], LOD_BANDS[i]). */
const LOD_BANDS = [50, 112, 205];
const TREE_RESORT_DIST = 10;      // camera travel that forces a re-sort

function inKeepout(x, z) {
  for (let i = 0; i < KEEPOUT.length; i++) {
    const k = KEEPOUT[i];
    const dx = x - k[0], dz = z - k[1];
    if (dx * dx + dz * dz < k[2] * k[2]) return true;
  }
  return false;
}

/* ----------------------------- deterministic RNG --------------------------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SS = THREE.MathUtils.smoothstep;

/* ---------------------------- baked card textures -------------------------
 * Everything alpha-tested in this file samples one of these. They are painted
 * into a Uint8Array rather than a canvas so the result is identical on every
 * machine (gates compare screenshots) and so no DOM call sits in the boot path.
 */

/** Bleed colour outward into transparent pixels so mips never fringe black. */
function _dilate(rgb, cov, N, passes = 2) {
  const tmpC = new Float32Array(cov.length);
  const tmpR = new Float32Array(rgb.length);
  for (let p = 0; p < passes; p++) {
    tmpC.set(cov); tmpR.set(rgb);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const o = y * N + x;
        if (cov[o] > 0.02) continue;
        let n = 0, r = 0, g = 0, b = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= N) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= N) continue;
            const oo = yy * N + xx;
            if (tmpC[oo] < 0.02) continue;
            n++; r += tmpR[oo * 3]; g += tmpR[oo * 3 + 1]; b += tmpR[oo * 3 + 2];
          }
        }
        if (!n) continue;
        rgb[o * 3] = r / n; rgb[o * 3 + 1] = g / n; rgb[o * 3 + 2] = b / n;
        cov[o] = 0.015;   // marks "coloured but still transparent"
      }
    }
  }
}

/**
 * Coverage-preserving mip chain (Castano). A naive box filter halves the alpha
 * of a thin blade at every level, so by mip 4 an alpha-TESTED spray is entirely
 * below the reference and the foliage VANISHES, leaving the opaque trunk — the
 * "forest of bare poles" this build filmed at 150 m. Each level's alpha is
 * rescaled until the fraction of texels passing `alphaRef` matches level 0.
 */
function _coverageMips(base, N, alphaRef) {
  const ref = alphaRef * 255;
  let cov0 = 0;
  for (let i = 0; i < N * N; i++) if (base[i * 4 + 3] >= ref) cov0++;
  cov0 /= N * N;
  const mips = [{ data: base, width: N, height: N }];
  let cur = base, size = N;
  while (size > 1) {
    const half = size >> 1;
    const out = new Uint8Array(half * half * 4);
    for (let y = 0; y < half; y++) {
      for (let x = 0; x < half; x++) {
        let r = 0, g = 0, b = 0, wsum = 0, asum = 0;
        let r2 = 0, g2 = 0, b2 = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const o = ((y * 2 + dy) * size + (x * 2 + dx)) * 4;
            const a = cur[o + 3] / 255;
            r += cur[o] * a; g += cur[o + 1] * a; b += cur[o + 2] * a;
            r2 += cur[o]; g2 += cur[o + 1]; b2 += cur[o + 2];
            wsum += a; asum += a;
          }
        }
        const oo = (y * half + x) * 4;
        if (wsum > 1e-4) {
          out[oo] = (r / wsum) | 0; out[oo + 1] = (g / wsum) | 0; out[oo + 2] = (b / wsum) | 0;
        } else {
          out[oo] = (r2 / 4) | 0; out[oo + 1] = (g2 / 4) | 0; out[oo + 2] = (b2 / 4) | 0;
        }
        out[oo + 3] = Math.min(255, (asum / 4) * 255) | 0;
      }
    }
    if (cov0 > 0) {
      let lo = 0.5, hi = 24;
      for (let it = 0; it < 14; it++) {
        const mid = (lo + hi) * 0.5;
        let c = 0;
        for (let i = 0; i < half * half; i++) {
          if (Math.min(255, out[i * 4 + 3] * mid) >= ref) c++;
        }
        if (c / (half * half) < cov0) lo = mid; else hi = mid;
      }
      const k = (lo + hi) * 0.5;
      for (let i = 0; i < half * half; i++) {
        out[i * 4 + 3] = Math.min(255, out[i * 4 + 3] * k) | 0;
      }
    }
    mips.push({ data: out, width: half, height: half });
    cur = out; size = half;
  }
  return mips;
}

/**
 * `flipRows` — WHY THE GRASS WAS UPSIDE DOWN (V32 fix).
 *
 * These bakes are written painter-style, row 0 at the TOP of the tile: the
 * tuft's blade tips are painted at row 0 and its roots at row N-1, and the
 * impostor's trunk is drawn from row N-1 upward. A DataTexture uploads row 0
 * at v=0, and v=0 is the BOTTOM of a card — so every one of them rendered
 * inverted. On the grass that meant the thick, ~47 %-opaque root band was
 * presented at the top of the card and the fine tips at the ground, which is
 * exactly the "solid red plank with a pointed bottom" the first V32 pass
 * filmed. (`texture.flipY` is not the fix: three ignores it for DataTexture,
 * and these carry a hand-built mip chain that would not be flipped with it.)
 *
 * The conifer ATLAS deliberately does not pass this: its tile origins are
 * documented against the unflipped buffer and its needle sprays are
 * vertically symmetric, so flipping it would only move the bark tile.
 */
function _texFromBuffers(rgb, cov, N, alphaRef = 0, flipRows = false) {
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    const row = (i / N) | 0;
    const src = flipRows ? (N - 1 - row) * N + (i % N) : i;
    data[i * 4] = Math.min(255, rgb[src * 3] * 255) | 0;
    data[i * 4 + 1] = Math.min(255, rgb[src * 3 + 1] * 255) | 0;
    data[i * 4 + 2] = Math.min(255, rgb[src * 3 + 2] * 255) | 0;
    data[i * 4 + 3] = cov[src] > 0.02 ? Math.min(255, cov[src] * 255) | 0 : 0;
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  if (alphaRef > 0) {
    tex.mipmaps = _coverageMips(data, N, alphaRef);
    tex.generateMipmaps = false;
  } else {
    tex.generateMipmaps = true;
  }
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * A cluster of tapered blades filling the tile: the grass card.
 *
 * BLADE WIDTH IS A WORLD MEASUREMENT, NOT A TEXEL ONE (V32 fix).
 * A blade painted `w0` texels wide on an N-texel tile ends up
 * `cardWidth * w0 / N` metres wide in the world. The first cut painted 26
 * blades at 2-4 texels on a 256 tile, which on the 0.47-0.71 m stealth card is
 * a 6-11 mm blade before mip blur and 3 cm after it: filmed from a 1.5 m eye
 * the meadow was a stack of red planks, not grass. 512 texels (so the first
 * mip is as sharp as the old level 0), 64 blades, and half the texel width put
 * a blade at ~1.5 cm — a real one is 4-10 mm — while keeping the tile dense
 * enough that a single card still reads as a tuft.
 */
function _bakeTuftTexture(N = 512, seed = 7, blades = 104) {
  const cov = new Float32Array(N * N);
  const rgb = new Float32Array(N * N * 3);
  const rng = mulberry32(seed);
  for (let b = 0; b < blades; b++) {
    const x0 = (0.10 + rng() * 0.80) * N;
    const tipY = (0.04 + rng() * 0.42) * N;      // row 0 is the top of the tile
    const bendX = (rng() - 0.5) * 0.62 * N;
    const w0 = (0.0034 + rng() * 0.0042) * N;
    const hue = 0.80 + rng() * 0.40;
    const rows = Math.max(4, Math.ceil(N - tipY));
    for (let s = 0; s <= rows; s++) {
      const t = s / rows;                        // 0 root .. 1 tip
      const yi = Math.round((N - 1) - t * ((N - 1) - tipY));
      if (yi < 0 || yi >= N) continue;
      const cx = x0 + bendX * t * t;
      const hw = w0 * (1 - t * 0.82) + 0.30;
      const lit = (0.20 + 0.80 * Math.pow(t, 0.75)) * hue;
      const r = 0.26 + 0.74 * lit, g = 0.24 + 0.70 * lit, bl = 0.13 + 0.40 * lit;
      const xL = cx - hw, xR = cx + hw;
      const i0 = Math.max(0, Math.floor(xL)), i1 = Math.min(N - 1, Math.ceil(xR));
      for (let xi = i0; xi <= i1; xi++) {
        const c = Math.min(xi + 1, xR) - Math.max(xi, xL);
        if (c <= 0) continue;
        const o = yi * N + xi;
        const a = Math.min(1, c);
        if (a <= cov[o]) continue;
        cov[o] = a; rgb[o * 3] = r; rgb[o * 3 + 1] = g; rgb[o * 3 + 2] = bl;
      }
    }
  }
  _dilate(rgb, cov, N, 2);
  return _texFromBuffers(rgb, cov, N, 0.28, true);
}

/**
 * 2x2 atlas for tree cards: three needle sprays and one opaque bark tile, so a
 * trunk and its foliage can share one alpha-tested material (and one draw).
 * Tile (u,v) origin: sprays at (0,0) (0.5,0) (0,0.5), bark at (0.5,0.5).
 */
function _bakeConiferAtlas(N = 256, seed = 31, opts = {}) {
  const cov = new Float32Array(N * N);
  const rgb = new Float32Array(N * N * 3);
  const H = N >> 1;
  const rng = mulberry32(seed);
  const dark = opts.dark || [0.086, 0.145, 0.062];
  const lite = opts.lite || [0.30, 0.42, 0.15];
  const leaf = !!opts.leaf;

  const stamp = (x, y, w, r, g, b, a) => {
    const i0 = Math.max(0, Math.floor(x - w)), i1 = Math.min(N - 1, Math.ceil(x + w));
    const j0 = Math.max(0, Math.floor(y - w)), j1 = Math.min(N - 1, Math.ceil(y + w));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = i + 0.5 - x, dy = j + 0.5 - y;
        const d = Math.hypot(dx, dy);
        if (d > w) continue;
        const o = j * N + i;
        const av = a * Math.min(1, (w - d) * 1.6 + 0.35);
        if (av <= cov[o]) continue;
        cov[o] = av; rgb[o * 3] = r; rgb[o * 3 + 1] = g; rgb[o * 3 + 2] = b;
      }
    }
  };

  // three foliage tiles
  const tiles = [[0, 0], [H, 0], [0, H]];
  for (let ti = 0; ti < 3; ti++) {
    const ox = tiles[ti][0], oy = tiles[ti][1];
    // the twig runs left (u=0, at the trunk) to right (u=1, the branch tip)
    const yMid = oy + H * 0.5;
    for (let s = 0; s <= H; s++) {
      const t = s / H;
      const x = ox + t * (H - 1);
      const w = 2.6 * (1 - t) + 0.6;
      stamp(x, yMid + Math.sin(t * 3.1 + ti) * H * 0.03, w, 0.20, 0.15, 0.09, 1);
    }
    const sprays = leaf ? 96 : 130;
    for (let k = 0; k < sprays; k++) {
      const t = 0.06 + rng() * 0.94;
      const bx = ox + t * (H - 1);
      const by = yMid + Math.sin(t * 3.1 + ti) * H * 0.03;
      const dir = rng() < 0.5 ? -1 : 1;
      const len = (leaf ? 0.30 : 0.22) * H * (1 - t * 0.55) * (0.55 + rng() * 0.85);
      const ang = dir * (0.55 + rng() * 0.75);
      const mix = rng();
      const r = dark[0] + (lite[0] - dark[0]) * mix;
      const g = dark[1] + (lite[1] - dark[1]) * mix;
      const b = dark[2] + (lite[2] - dark[2]) * mix;
      if (leaf) {
        // rounded leaf blob at the end of a short petiole
        const ex = bx + Math.cos(ang) * len * 0.7, ey = by + Math.sin(ang) * len * 0.7;
        stamp(ex, ey, len * 0.30 + 1.4, r, g, b, 1);
      } else {
        const steps = Math.ceil(len);
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const px = bx + Math.cos(ang) * len * u * 0.85 + u * 2.0;
          const py = by + Math.sin(ang) * len * u;
          stamp(px, py, 1.25 * (1 - u * 0.65) + 0.35, r, g, b, 1);
        }
      }
    }
  }

  // opaque bark tile
  const bx0 = H, by0 = H;
  const bark = opts.bark || [0.26, 0.19, 0.125];
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < H; i++) {
      const o = (by0 + j) * N + (bx0 + i);
      const fib = Math.sin(i * 0.9) * 0.5 + Math.sin(i * 2.7 + j * 0.13) * 0.28
        + Math.sin(i * 6.1 + j * 0.05) * 0.16;
      const k = 0.72 + fib * 0.34;
      rgb[o * 3] = bark[0] * k; rgb[o * 3 + 1] = bark[1] * k; rgb[o * 3 + 2] = bark[2] * k;
      cov[o] = 1;
    }
  }
  _dilate(rgb, cov, N, 2);
  return _texFromBuffers(rgb, cov, N, 0.34);
}

/** A whole-tree silhouette for the crossed-billboard impostor. */
function _bakeImpostor(N = 128, kind = 'pine') {
  const cov = new Float32Array(N * N);
  const rgb = new Float32Array(N * N * 3);
  const rng = mulberry32(kind === 'pine' ? 505 : kind === 'birch' ? 909 : 313);
  const put = (x, y, r, cr, cg, cb) => {
    const i0 = Math.max(0, Math.floor(x - r)), i1 = Math.min(N - 1, Math.ceil(x + r));
    const j0 = Math.max(0, Math.floor(y - r)), j1 = Math.min(N - 1, Math.ceil(y + r));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(i + 0.5 - x, j + 0.5 - y);
        if (d > r) continue;
        const o = j * N + i;
        const a = Math.min(1, (r - d) * 1.4 + 0.4);
        if (a <= cov[o]) continue;
        cov[o] = a;
        const k = 0.72 + 0.5 * (1 - d / r) + (rng() - 0.5) * 0.16;
        rgb[o * 3] = cr * k; rgb[o * 3 + 1] = cg * k; rgb[o * 3 + 2] = cb * k;
      }
    }
  };
  const cx = N * 0.5;
  // trunk
  const trunkTop = kind === 'pine' ? N * 0.22 : N * 0.40;
  for (let j = N - 1; j > trunkTop; j--) {
    const w = kind === 'birch' ? N * 0.017 : N * 0.022;
    const c = kind === 'birch' ? [0.68, 0.66, 0.60] : [0.24, 0.175, 0.115];
    put(cx + Math.sin(j * 0.02) * N * 0.01, j, w, c[0], c[1], c[2]);
  }
  if (kind === 'snag') {
    for (let k = 0; k < 5; k++) {
      const y = N * (0.28 + rng() * 0.4);
      const dir = rng() < 0.5 ? -1 : 1;
      const L = N * (0.10 + rng() * 0.16);
      for (let s = 0; s <= L; s++) {
        put(cx + dir * s, y - s * 0.6, N * 0.012, 0.26, 0.20, 0.14);
      }
    }
  } else if (kind === 'pine') {
    for (let w = 0; w < 11; w++) {
      const t = w / 10;
      const y = N * (0.94 - t * 0.80);
      const spread = N * 0.40 * Math.pow(1 - t, 0.75) + N * 0.02;
      const n = 9;
      for (let k = 0; k <= n; k++) {
        const u = (k / n) * 2 - 1;
        const x = cx + u * spread;
        const sag = Math.abs(u) * N * 0.035;
        const g = 0.10 + 0.16 * (1 - Math.abs(u)) + rng() * 0.07;
        put(x, y + sag, N * 0.075 * (1 - Math.abs(u) * 0.40) + 1.8,
          g * 0.65, g * 1.35, g * 0.42);
      }
    }
  } else {
    for (let k = 0; k < 150; k++) {
      const a = rng() * Math.PI * 2;
      const rr = Math.sqrt(rng());
      const x = cx + Math.cos(a) * rr * N * 0.36;
      const y = N * 0.34 + Math.sin(a) * rr * N * 0.28;
      const g = 0.22 + rng() * 0.20;
      put(x, y, N * 0.070, g * 0.78, g * 1.28, g * 0.44);
    }
  }
  _dilate(rgb, cov, N, 2);
  // NOT flipped, unlike the tuft: `_impostorGeometry` already compensates for
  // the painter convention in its UVs (card bottom -> v=1, card top -> v=0),
  // so this buffer is uploaded as painted. Flipping it here stands the tree
  // on its head. The grass card maps the other way round, which is why only
  // the tuft asks for the flip.
  return _texFromBuffers(rgb, cov, N, 0.36);
}

/* ------------------------------ shader snippets ---------------------------- */
// We apply instanceMatrix ourselves in begin_vertex (so wind bending happens in
// world-aligned space), so downstream chunks must NOT apply it again.
const PROJECT_NO_INSTANCE = /* glsl */ `
vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
gl_Position = projectionMatrix * mvPosition;
`;

const WORLDPOS_NO_INSTANCE = /* glsl */ `
vec4 worldPosition = modelMatrix * vec4( transformed, 1.0 );
`;

const GRASS_VERT_HEAD = /* glsl */ `
#include <common>
uniform float uTime;
uniform vec2 uWindDir;
uniform vec4 uFade;      // x..y: fade in over distance, z..w: fade out
uniform vec4 uActors[4]; // xy world pos, z radius, w strength
attribute vec2 aInfo;    // x: phase, y: flexibility
attribute float aBend;   // 0 at the root, 1 at the tip (flower heads: 1)
varying float vBladeY;
`;

const GRASS_VERT_BODY = /* glsl */ `
vec3 transformed = ( instanceMatrix * vec4( position, 1.0 ) ).xyz;
vBladeY = aBend;
vec3 iOrigin = instanceMatrix[3].xyz;
vec3 iWorld = ( modelMatrix * vec4( iOrigin, 1.0 ) ).xyz;

// distance window: cards rise out of / sink into the ground at the tier edges
float dCam = distance( iWorld, cameraPosition );
float fade = smoothstep( uFade.x, uFade.y, dCam )
           * ( 1.0 - smoothstep( uFade.z, uFade.w, dCam ) );
// A faded card must become a POINT, not a flat quad lying on the ground:
// sinking only Y leaves a 0.5 x 0.8 m horizontal polygon per instance, and at
// 8 tufts/m^2 that is the single most expensive thing in the frame (measured:
// 55 ms of GPU for the near ring alone before this line). Collapsing XZ as
// well makes every out-of-range instance degenerate and free.
float vis = step( 0.0025, fade );
transformed.xz = mix( iOrigin.xz, transformed.xz, vis );
transformed.y = mix( iOrigin.y, transformed.y, fade * vis );

// coherent gust field travelling along the wind + slow cross-swell
vec2 wxz = iWorld.xz;
float gust = sin( dot( wxz, uWindDir ) * 0.060 - uTime * 1.65 )
           + 0.55 * sin( dot( wxz, vec2( -uWindDir.y, uWindDir.x ) ) * 0.021 + uTime * 0.53 )
           + 0.30 * sin( uTime * 0.95 + wxz.x * 0.013 );
gust = clamp( gust * 0.5 + 0.5, 0.0, 1.2 );

// per-instance bend-direction jitter (±0.5 rad) so cards don't comb uniformly
float bja = fract( aInfo.x * 0.15915 ) - 0.5;
float bc = cos( bja ), bs = sin( bja );
vec2 bDir = vec2( uWindDir.x * bc - uWindDir.y * bs,
                  uWindDir.x * bs + uWindDir.y * bc );

float hh = aBend * aBend; // stiff root, floppy tip
float sway = ( 0.10 + 0.34 * gust * gust ) * aInfo.y;
vec2 bend = bDir * sway
          + vec2( -bDir.y, bDir.x ) * ( sin( uTime * 3.1 + aInfo.x ) * 0.05 * aInfo.y );

// stealth-grass-interaction: actors shoulder the blades aside, and the slot's
// strength decays after they leave, which IS the spring-back.
for ( int i = 0; i < 4; i++ ) {
  vec4 a = uActors[i];
  if ( a.w <= 0.001 ) continue;
  vec2 d = wxz - a.xy;
  float dist = length( d );
  float k = 1.0 - smoothstep( a.z * 0.30, a.z, dist );
  if ( k <= 0.0 ) continue;
  vec2 dir = dist > 0.0015 ? d / dist : vec2( 1.0, 0.0 );
  bend += dir * k * a.w * 0.85;
}

transformed.xz += bend * hh * fade;
transformed.y -= dot( bend, bend ) * 0.35 * hh;
`;

// Root->tip gradient: dark earthy base (fake AO) to warm bright tip.
const GRASS_FRAG_GRAD = /* glsl */ `
float grad = smoothstep( 0.0, 0.8, vBladeY );
diffuseColor.rgb *= mix( vec3( 0.66, 0.58, 0.46 ), vec3( 1.12, 1.05, 0.96 ), grad );
`;

const TREE_VERT_HEAD = /* glsl */ `
#include <common>
uniform float uTime;
uniform vec2 uWindDir;
varying vec3 vTreeW;
`;

const TREE_VERT_BODY = /* glsl */ `
vec3 transformed = ( instanceMatrix * vec4( position, 1.0 ) ).xyz;
vec3 iOrigin = instanceMatrix[3].xyz;
float phase = iOrigin.x * 0.37 + iOrigin.z * 0.61;
float hFrac = clamp( ( transformed.y - iOrigin.y ) / 9.0, 0.0, 1.4 );
float swayT = sin( uTime * 1.05 + phase ) + 0.4 * sin( uTime * 2.3 + phase * 1.7 );
transformed.xz += uWindDir * swayT * 0.06 * hFrac * hFrac;
vTreeW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
`;

// Near-camera screen-door fade: when the orbit camera swings inside a canopy
// the foliage dithers away instead of walling the lens with flat green polys.
const TREE_FRAG_FADE = /* glsl */ `
{
  float dCam = distance( vTreeW, cameraPosition );
  float keep = smoothstep( 1.1, 3.8, dCam );
  if ( keep < 0.999 ) {
    float dith = fract( 52.9829189 * fract(
      dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
    if ( dith >= keep ) discard;
  }
}
`;

/* ------------------------- shared scratch (no allocs) --------------------- */
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _eul = new THREE.Euler();
const _v3 = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _col = new THREE.Color();

export class Vegetation {
  constructor(ctx) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'vegetation';
    ctx.scene.add(this.group);

    // shared wind state (uniform objects shared across all vegetation shaders)
    this.windDir = new THREE.Vector2(0.82, 0.57).normalize();
    this._uTime = { value: 0 };
    this._uWindDir = { value: this.windDir };
    this.gustLevel = 0; // 0..1 at the player, for audio rustle

    // stealth-grass-interaction — four displacer slots
    this._uActors = {
      value: [new THREE.Vector4(), new THREE.Vector4(),
        new THREE.Vector4(), new THREE.Vector4()],
    };
    this.displacers = [];
    for (let i = 0; i < 4; i++) {
      this.displacers.push({ x: 0, z: 0, r: 1.3, s: 0, live: false, ref: null });
    }

    this._noise = new SimplexNoise(9042);
    this._lastTall = 0;
    // one reusable weights object: the scatter calls grassDensityAt ~470k
    // times per full stream and must not allocate
    this._bioW = {
      meadow: 1, forest: 0, snow: 0, marsh: 0, ash: 0, scree: 0,
    };
    this._lastBio = null;
    this._pools = [];
    this._primed = false;
    this._catchUp = 0;
    this._camX = 1e9; this._camZ = 1e9;

    const t0 = performance.now();
    this._buildGrass();
    this._buildTrees();
    this._buildRocks();
    this._buildBushes();
    this._buildFlowers();
    this._buildButterflies();
    this._buildLitter();
    this._buildFogPockets();
    // static world props (riverbed litter, deadfall, ruins, watchtower)
    this.props = new Props(ctx);
    // fill the pooled tiers around the spawn camp before the first frame
    this.forceStream(CAMP.x, CAMP.z);
    this.buildMs = performance.now() - t0;
  }

  /** Riparian moisture 0..1 — greener, damper ground flanking the dried river. */
  _moisture(x, z) {
    const r2 = x * x + z * z;
    if (x < -215 || x > -38 || r2 > 302 * 302) return 0;
    const hw = riverHalfWidth(z);
    const rd = Math.abs(x - riverCenterX(z));
    if (rd > hw * 2.05) return 0;
    return (1 - SS(rd, hw * 0.5, hw * 2.0)) * (1 - SS(Math.sqrt(r2), 250, 302));
  }

  /* -------------------------------- grass -------------------------------- */

  /**
   * Authored grass density in tufts/m^2 — the single source of truth for the
   * scatter, for gate A59 and for `stealth-grass-visual-concealment`. Terrain
   * owns WHERE the tall stuff is (`tallGrassDensity`, authored from the machine
   * spawn table); this owns HOW MUCH of it gets planted.
   *
   * Side effect by design: stashes the tall-grass factor in `_lastTall` so the
   * scatter can pick the stealth tuft look without a second field evaluation.
   */
  grassDensityAt(x, z) {
    const terrain = this.ctx.terrain;
    const r2 = x * x + z * z;
    if (r2 > GRASS_MAX_R * GRASS_MAX_R) { this._lastTall = 0; this._lastBio = null; return 0; }
    const tall = terrain.tallGrassDensity(x, z);
    this._lastTall = tall;
    let d = D_MEADOW + D_STEALTH * SS(tall, 0.26, 0.60);

    /* BIOME MODULATION — and the numbers here are load-bearing for A59.
     *
     * The gate's six meadow points include (44,-74), which is inside the NE
     * forest, and its stealth-patch half samples whatever patch it finds near
     * each of them. So the forest floor is thinned by 18 % and no more: a
     * closed conifer stand in HZD is duff and fern, not bare dirt, and 0.82 x
     * 5.4 = 4.4 tufts/m^2 still clears the >= 4 bar with the stealth tier on
     * top of it. Snow, ash and scree are allowed to take the grass away
     * because none of the gate's points — and, by construction, none of the
     * machine routes (`biomeSuppress`) — are inside them.
     */
    const bw = biomeWeights(x, z, this._bioW);
    this._lastBio = bw;
    if (bw.meadow < 0.995) {
      d *= 1 - 0.18 * bw.forest;
      d *= 1 - 0.90 * bw.snow;
      d *= 1 - 0.96 * bw.ash;
      d *= 1 - 0.62 * bw.scree;
      d *= 1 - 0.45 * bw.marsh;
    }
    const cdx = x - CAMP.x, cdz = z - CAMP.z;
    d *= SS(Math.sqrt(cdx * cdx + cdz * cdz), 15, 33);         // trampled camp
    d *= 1 - SS(pathFactor(x, z), 0.14, 0.60);                 // worn trails
    /* The silt bed stays bare — EXCEPT under an authored cover disc, where
     * reeds hold the waterline. Same split, same reasoning and the same
     * numbers as `terrain.tallGrassDensity`: the two must agree or the
     * concealment field is claiming cover that was never planted. */
    const rfv = riverFactor(x, z);
    if (rfv > 0.02) {
      const bed = SS(rfv, 0.06, 0.40);
      d *= 1 - bed * (1 - 0.74 * SS(tall, 0.40, 0.85));
    }
    d *= 1 - 0.74 * SS(shelfFactor(x, z), 0.15, 0.75);         // SE stone shelf
    d *= 1 - SS(Math.sqrt(r2), 292, 332);                      // rim
    return d;
  }

  /**
   * A grass CARD: `quads` crossed alpha-tested planes carrying the baked blade
   * cluster. 8 verts / 4 triangles at quads=2 against the 36 verts / 28
   * triangles of a Round-3 blade fan — that ratio is the density budget.
   */
  _cardGeometry({ quads = 2, w = 0.62, h = 0.80, seed = 3, lean = 0.10 }) {
    const rng = mulberry32(seed);
    const pos = [], nor = [], uv = [], bend = [], idx = [];
    for (let k = 0; k < quads; k++) {
      const yaw = (k / quads) * Math.PI + rng() * 0.5;
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const hw = w * 0.5 * (0.85 + rng() * 0.3);
      const hh = h * (0.85 + rng() * 0.35);
      const tilt = (rng() - 0.5) * lean;
      const base = pos.length / 3;
      // corners: (-hw,0) (hw,0) (-hw,hh) (hw,hh) in the quad's own plane
      const pts = [[-hw, 0, 0], [hw, 0, 1], [-hw, hh, 2], [hw, hh, 3]];
      for (const p of pts) {
        const lx = p[0], ly = p[1];
        const top = ly > 0 ? 1 : 0;
        pos.push(lx * c + tilt * ly * s, ly, -lx * s + tilt * ly * c);
        // up-biased normals: foliage lit like a surface, never a black wall
        const nx = s * 0.22, nz = c * 0.22;
        const nl = Math.hypot(nx, 1, nz);
        nor.push(nx / nl, 1 / nl, nz / nl);
        uv.push(p[2] % 2 === 0 ? 0.02 : 0.98, top ? 0.98 : 0.02);
        bend.push(top ? 1 : 0);
      }
      idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
    geo.setAttribute('aBend', new THREE.BufferAttribute(new Float32Array(bend), 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    return geo;
  }

  /**
   * Grass shades with LAMBERT, not the standard PBR BRDF. A meadow at 8
   * tufts/m^2 is the most overdrawn surface in the game — a view ray at eye
   * height crosses dozens of alpha-tested cards — so the per-fragment cost is
   * what decides whether the field fits in the frame budget, and grass has no
   * specular story that a GGX lobe tells better than a wrap-lit diffuse one.
   * It keeps the cascades and the aerial fog: `environment.registerMaterial`
   * treats Lambert as a lit material.
   */
  _grassMaterial(fade, map) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: map || null,
      alphaTest: map ? 0.28 : 0,
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const uFade = { value: new THREE.Vector4(fade[0], fade[1], fade[2], fade[3]) };
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this._uTime;
      shader.uniforms.uWindDir = this._uWindDir;
      shader.uniforms.uFade = uFade;
      shader.uniforms.uActors = this._uActors;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', GRASS_VERT_HEAD)
        .replace('#include <begin_vertex>', GRASS_VERT_BODY)
        .replace('#include <project_vertex>', PROJECT_NO_INSTANCE)
        .replace('#include <worldpos_vertex>', WORLDPOS_NO_INSTANCE);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vBladeY;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + GRASS_FRAG_GRAD)
        // thin cards: light back faces like front faces (no black ribbons)
        .replace(
          '#include <normal_fragment_begin>',
          '#include <normal_fragment_begin>\nnormal = normalize( vNormal );',
        );
    };
    return mat;
  }

  _buildGrass() {
    this._tuftTex = _bakeTuftTexture(512, 7, 104);
    this._grassMat = this._grassMaterial(NEAR.fade, this._tuftTex);
    this._grassMidMat = this._grassMaterial(MID.fade, this._tuftTex);
    this._grassFarMat = this._grassMaterial(FAR.fade, this._tuftTex);

    this._nearGeo = this._cardGeometry({ quads: 2, w: 0.47, h: 0.77, seed: 3 });
    this._midGeo = this._cardGeometry({ quads: 2, w: 0.50, h: 0.78, seed: 11 });
    this._farGeo = this._cardGeometry({ quads: 1, w: 0.80, h: 0.88, seed: 23 });

    this._nearPool = this._makePool(NEAR, this._nearGeo, this._grassMat);
    this._midPool = this._makePool(MID, this._midGeo, this._grassMidMat);
    this._pools = [this._nearPool, this._midPool];
    this.farGrassCount = this._buildFarGrass();
    this.grassCount = 0;
  }

  /** Allocate one tier's ring of chunk meshes. Nothing is scattered yet. */
  _makePool(cfg, baseGeo, mat) {
    const n = cfg.ring * 2 + 1;
    const side = Math.max(8, Math.round(cfg.chunk * Math.sqrt(cfg.cand)));
    const cap = Math.ceil(side * side * cfg.fill);
    const pool = {
      cfg, n, side, cap, chunks: [], ci: 1e9, cj: 1e9, done: false,
      instances: 0,
    };
    for (let s = 0; s < n * n; s++) {
      const geo = new THREE.BufferGeometry();
      geo.setIndex(baseGeo.index);
      geo.setAttribute('position', baseGeo.attributes.position);
      geo.setAttribute('normal', baseGeo.attributes.normal);
      geo.setAttribute('uv', baseGeo.attributes.uv);
      geo.setAttribute('aBend', baseGeo.attributes.aBend);
      const info = new Float32Array(cap * 2);
      const aInfo = new THREE.InstancedBufferAttribute(info, 2);
      aInfo.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aInfo', aInfo);
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), cfg.chunk);

      const mesh = new THREE.InstancedMesh(geo, mat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // force the instanceColor buffer into existence now, once
      mesh.setColorAt(0, _col.setRGB(1, 1, 1));
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.name = `${cfg.name}-${s}`;
      mesh.castShadow = false;    // world-light promotes the nearest few
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.visible = false;
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), cfg.chunk);
      this.group.add(mesh);
      pool.chunks.push({
        mesh, info, aInfo, i: 1e9, j: 1e9, x: 0, z: 0,
        cursor: 0, n: 0, filled: false, rng: mulberry32(1),
        minY: 0, maxY: 0,
      });
    }
    return pool;
  }

  /** Toroidal slot for chunk cell (i, j) in a ring of side `n`. */
  _slot(n, i, j) {
    return (((i % n) + n) % n) * n + (((j % n) + n) % n);
  }

  /** Point every pooled chunk at the cell it should hold for this camera. */
  _assignPool(pool, camX, camZ) {
    const c = pool.cfg.chunk;
    const ci = Math.round(camX / c), cj = Math.round(camZ / c);
    if (ci === pool.ci && cj === pool.cj) return;
    pool.ci = ci; pool.cj = cj;
    const R = pool.cfg.ring, n = pool.n;
    for (let di = -R; di <= R; di++) {
      for (let dj = -R; dj <= R; dj++) {
        const i = ci + di, j = cj + dj;
        const ch = pool.chunks[this._slot(n, i, j)];
        if (ch.i === i && ch.j === j) continue;
        ch.i = i; ch.j = j;
        ch.x = i * c; ch.z = j * c;
        ch.cursor = 0; ch.n = 0; ch.filled = false;
        ch.rng = mulberry32((i * 73856093) ^ (j * 19349663) ^ 0x9e3779b9);
        ch.mesh.visible = false;
        ch.mesh.count = 0;
        ch.mesh.position.set(ch.x, 0, ch.z);
        ch.mesh.updateMatrix();
      }
    }
    pool.done = false;
  }

  /**
   * Resumable scatter for one chunk. Candidates sit on a jittered grid at the
   * tier's maximum density and are accepted with probability
   * `grassDensityAt / cand`, which reproduces the authored field exactly and
   * costs one field evaluation per candidate.
   */
  _fillChunk(pool, ch, budgetMs) {
    const t0 = performance.now();
    const cfg = pool.cfg;
    const terrain = this.ctx.terrain;
    const side = pool.side, cell = cfg.chunk / side, half = cfg.chunk / 2;
    const invCand = 1 / cfg.norm;
    const total = side * side;
    const mesh = ch.mesh, info = ch.info, cap = pool.cap;
    const rng = ch.rng;
    let n = ch.n;
    let minY = ch.cursor ? ch.minY : Infinity;
    let maxY = ch.cursor ? ch.maxY : -Infinity;
    let k = ch.cursor;

    for (; k < total; k++) {
      if ((k & 255) === 0 && k > ch.cursor
        && performance.now() - t0 > budgetMs) break;
      const gi = k % side, gj = (k / side) | 0;
      const lx = -half + (gi + rng()) * cell;
      const lz = -half + (gj + rng()) * cell;
      const x = ch.x + lx, z = ch.z + lz;
      const d = this.grassDensityAt(x, z);
      if (d <= 0) continue;
      if (rng() >= d * invCand) continue;
      if (n >= cap) continue;
      const tall = this._lastTall;
      const y = terrain.heightFast(x, z);
      if (y > 32) continue;                       // rocky heights stay bare
      const slope = terrain.slopeFast(x, z);
      if (slope > (tall > 0.4 ? 0.62 : 0.50)) continue;

      const yy = y - 0.06 - slope * 0.10;
      if (yy < minY) minY = yy;
      if (yy > maxY) maxY = yy;

      const swathe = this._noise.fbm(x * 0.02, z * 0.02, 2) * 0.5 + 0.5;
      const bio = this._lastBio;
      let sxz, sy, flex;
      if (bio && bio.marsh > 0.30) {
        /* REEDS. Marsh cover is a different plant: tall, narrow, blue-green,
         * and stiffer than meadow grass (a reed bends at the base, not along
         * its length), so it gets its own scale and flex rather than a tint
         * on the meadow tuft. */
        sy = (1.45 + rng() * 0.85) * cfg.hMul;
        sxz = (0.55 + rng() * 0.30) * cfg.sMul;
        flex = 0.30 + rng() * 0.18;
        _col.setHSL(0.205 + swathe * 0.045 + rng() * 0.02,
          0.25 + rng() * 0.16, 0.26 + swathe * 0.12 + rng() * 0.09,
          THREE.SRGBColorSpace);
      } else if (bio && bio.snow > 0.18) {
        // bleached bent grass poking through the dusting: short, pale, dry
        sy = (0.42 + rng() * 0.30) * cfg.hMul;
        sxz = (0.80 + rng() * 0.40) * cfg.sMul;
        flex = 0.30 + rng() * 0.16;
        _col.setHSL(0.105 + rng() * 0.02, 0.10 + rng() * 0.09,
          0.52 + swathe * 0.14 + rng() * 0.12, THREE.SRGBColorSpace);
      } else if (bio && bio.forest > 0.35) {
        // forest floor: cool deep-green fern and wood grass in the shade
        sy = (0.72 + rng() * 0.50) * cfg.hMul;
        sxz = (1.00 + rng() * 0.55) * cfg.sMul;
        flex = 0.34 + rng() * 0.20;
        _col.setHSL(0.245 - swathe * 0.035 + rng() * 0.02,
          0.30 + rng() * 0.16, 0.16 + swathe * 0.09 + rng() * 0.07,
          THREE.SRGBColorSpace);
      } else if (bio && bio.scree > 0.30) {
        // stone bench: sparse wiry tussock, sun-bleached olive
        sy = (0.50 + rng() * 0.34) * cfg.hMul;
        sxz = (0.72 + rng() * 0.36) * cfg.sMul;
        flex = 0.34 + rng() * 0.18;
        _col.setHSL(0.135 + swathe * 0.03 + rng() * 0.02,
          0.22 + rng() * 0.12, 0.34 + swathe * 0.10 + rng() * 0.09,
          THREE.SRGBColorSpace);
      } else if (tall > 0.40) {
        sy = (1.12 + rng() * 0.52) * cfg.hMul;
        sxz = (1.06 + rng() * 0.52) * cfg.sMul;
        flex = 0.80 + rng() * 0.35;
        // HZD red-gold stealth grass: rust -> luminous orange-gold swathes
        // hue floor lifted 0.032 -> 0.047 and saturation pulled back: the old
        // ramp bottomed out at a 11 deg pillar-box red that read as plastic
        // against the olive meadow. HZD's tall grass is rust-AMBER.
        _col.setHSL(0.047 + swathe * 0.048 + rng() * 0.028,
          0.38 + rng() * 0.17, 0.44 + swathe * 0.17 + rng() * 0.14,
          THREE.SRGBColorSpace);
      } else {
        sy = (0.64 + rng() * 0.46) * cfg.hMul;
        sxz = (0.94 + rng() * 0.46) * cfg.sMul;
        flex = 0.42 + rng() * 0.22;
        // dry green-gold filler
        _col.setHSL(0.095 + swathe * 0.06 + rng() * 0.03,
          0.36 + rng() * 0.18, 0.38 + swathe * 0.10 + rng() * 0.10,
          THREE.SRGBColorSpace);
      }
      _v3.set(lx, yy, lz);
      _eul.set(0, rng() * Math.PI * 2, 0);
      _q.setFromEuler(_eul);
      _scl.set(sxz, sy, sxz);
      _m4.compose(_v3, _q, _scl);
      mesh.setMatrixAt(n, _m4);
      mesh.setColorAt(n, _col);
      info[n * 2] = rng() * 6.283;
      info[n * 2 + 1] = flex;
      n++;
    }

    ch.n = n; ch.cursor = k; ch.minY = minY; ch.maxY = maxY;
    if (k < total) return false;

    ch.filled = true;
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    ch.aInfo.needsUpdate = true;
    if (n > 0) {
      const cy = (minY + maxY) * 0.5;
      const ry = (maxY - minY) * 0.5 + 2.6 * cfg.hMul;
      mesh.boundingSphere.center.set(0, cy, 0);
      mesh.boundingSphere.radius = Math.hypot(cfg.chunk * 0.7072, ry);
      mesh.geometry.boundingSphere.copy(mesh.boundingSphere);
      mesh.visible = true;
    }
    return true;
  }

  /** Spend up to `budgetMs` filling whatever chunks are stale. */
  _pumpPool(pool, budgetMs) {
    if (pool.done) return budgetMs;
    let left = budgetMs, all = true, live = 0;
    const chunks = pool.chunks;
    for (let s = 0; s < chunks.length; s++) {
      const ch = chunks[s];
      if (ch.filled) { live += ch.n; continue; }
      if (left <= 0) { all = false; continue; }
      const t0 = performance.now();
      const done = this._fillChunk(pool, ch, left);
      left -= performance.now() - t0;
      if (done) live += ch.n; else all = false;
    }
    pool.done = all;
    if (all) pool.instances = live;
    return left;
  }

  /**
   * Mark every pooled chunk stale so the streamer re-scatters it under its
   * normal per-frame budget. `terrain` calls this once when it stamps cover
   * onto the live machine routes (A60): the density field has changed under
   * chunks that are already filled, and re-scattering them progressively is
   * the difference between new grass appearing over a second or two and a
   * 120 ms hitch from a synchronous `forceStream`.
   */
  invalidate() {
    this._catchUp = 60;   // raised budget until the rings are whole again
    for (const pool of this._pools) {
      pool.done = false;
      for (const ch of pool.chunks) { ch.filled = false; ch.cursor = 0; ch.n = 0; }
    }
  }

  /**
   * Synchronous re-scatter around a point. Gates and teleports call this so
   * the near tier is never measured mid-fill; costs ~120 ms.
   */
  forceStream(x, z) {
    for (let i = 0; i < this._pools.length; i++) {
      const pool = this._pools[i];
      this._assignPool(pool, x, z);
      let guard = 0;
      while (!pool.done && guard++ < 64) this._pumpPool(pool, 1e6);
    }
    this._camX = x; this._camZ = z;
    this._primed = true;
    this.grassCount = this._nearPool.instances + this._midPool.instances;
    return this.grassCount;
  }

  /**
   * The static far tier. Two passes so the buffer is exactly the size of what
   * survived — the pooled tiers cannot do this (they refill at runtime), but
   * this one is built once and would otherwise waste 8 MB.
   */
  _buildFarGrass() {
    const terrain = this.ctx.terrain;
    const cfg = FAR;
    const half = (cfg.grid * cfg.chunk) / 2;
    const side = Math.max(8, Math.round(cfg.chunk * Math.sqrt(cfg.cand)));
    let total = 0;
    const px = [], pz = [], py = [];
    for (let ci = 0; ci < cfg.grid; ci++) {
      for (let cj = 0; cj < cfg.grid; cj++) {
        const cx = -half + (ci + 0.5) * cfg.chunk;
        const cz = -half + (cj + 0.5) * cfg.chunk;
        if (Math.hypot(cx, cz) > GRASS_MAX_R + cfg.chunk) continue;
        const rng = mulberry32(ci * 7919 + cj * 104729 + 40503);
        px.length = 0; pz.length = 0; py.length = 0;
        let minY = Infinity, maxY = -Infinity;
        for (let k = 0; k < side * side; k++) {
          const lx = -cfg.chunk / 2 + ((k % side) + rng()) * (cfg.chunk / side);
          const lz = -cfg.chunk / 2 + (((k / side) | 0) + rng()) * (cfg.chunk / side);
          const x = cx + lx, z = cz + lz;
          const d = this.grassDensityAt(x, z);
          if (d <= 0 || rng() >= d / FAR.norm) continue;
          const y = terrain.heightFast(x, z);
          if (y > 32) continue;
          if (terrain.slopeFast(x, z) > 0.55) continue;
          px.push(lx); pz.push(lz); py.push(y - 0.06);
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        if (!px.length) continue;
        total += px.length;

        const geo = new THREE.BufferGeometry();
        geo.setIndex(this._farGeo.index);
        geo.setAttribute('position', this._farGeo.attributes.position);
        geo.setAttribute('normal', this._farGeo.attributes.normal);
        geo.setAttribute('uv', this._farGeo.attributes.uv);
        geo.setAttribute('aBend', this._farGeo.attributes.aBend);
        const info = new Float32Array(px.length * 2);
        const rng2 = mulberry32(ci * 31 + cj * 131 + 7);
        for (let i = 0; i < px.length; i++) {
          info[i * 2] = rng2() * 6.283;
          info[i * 2 + 1] = 0.5 + rng2() * 0.3;
        }
        geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 2));

        const mesh = new THREE.InstancedMesh(geo, this._grassFarMat, px.length);
        const rng3 = mulberry32(ci * 977 + cj * 51 + 3);
        for (let i = 0; i < px.length; i++) {
          _v3.set(px[i], py[i], pz[i]);
          _eul.set(0, rng3() * Math.PI * 2, 0);
          _q.setFromEuler(_eul);
          const s = (0.9 + rng3() * 0.6) * cfg.sMul;
          _scl.set(s, (0.8 + rng3() * 0.6) * cfg.hMul, s);
          _m4.compose(_v3, _q, _scl);
          mesh.setMatrixAt(i, _m4);
          const sw = this._noise.fbm((cx + px[i]) * 0.02, (cz + pz[i]) * 0.02, 2) * 0.5 + 0.5;
          _col.setHSL(0.085 + sw * 0.05, 0.34 + sw * 0.14, 0.36 + sw * 0.12,
            THREE.SRGBColorSpace);
          mesh.setColorAt(i, _col);
        }
        const cy = (minY + maxY) * 0.5;
        const ry = (maxY - minY) * 0.5 + 3.2;
        mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, cy, 0),
          Math.hypot(cfg.chunk * 0.7072, ry));
        geo.boundingSphere = mesh.boundingSphere.clone();
        mesh.name = `grass-far-${ci}-${cj}`;
        mesh.position.set(cx, 0, cz);
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        this.group.add(mesh);
      }
    }
    return total;
  }

  /** Live instance count inside a disc — gate A59 and any stealth query. */
  countGrassNear(x, z, r) {
    const r2 = r * r;
    let n = 0;
    for (let p = 0; p < this._pools.length; p++) {
      const chunks = this._pools[p].chunks;
      for (let s = 0; s < chunks.length; s++) {
        const ch = chunks[s];
        if (!ch.filled || ch.n === 0) continue;
        const dcx = ch.x - x, dcz = ch.z - z;
        const reach = r + this._pools[p].cfg.chunk * 0.7072;
        if (dcx * dcx + dcz * dcz > reach * reach) continue;
        const arr = ch.mesh.instanceMatrix.array;
        for (let i = 0; i < ch.n; i++) {
          const dx = ch.x + arr[i * 16 + 12] - x;
          const dz = ch.z + arr[i * 16 + 14] - z;
          if (dx * dx + dz * dz <= r2) n++;
        }
      }
    }
    return n;
  }

  grassStats() {
    return {
      near: this._nearPool.instances,
      mid: this._midPool.instances,
      far: this.farGrassCount,
      nearCap: this._nearPool.cap * this._nearPool.chunks.length,
      midCap: this._midPool.cap * this._midPool.chunks.length,
      chunks: this._nearPool.chunks.length + this._midPool.chunks.length,
      nearReach: (NEAR.ring + 0.5) * NEAR.chunk,
      midReach: (MID.ring + 0.5) * MID.chunk,
      fade: { near: NEAR.fade, mid: MID.fade, far: FAR.fade },
    };
  }

  /** Weathered bare snag: leaning trunk + gnarled tapering branches. */
  _deadTreeGeometry(seed, height = 8) {
    const rng = mulberry32(seed);
    const parts = [];
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const cWood = new THREE.Color('#7c7060');
    const cDark = new THREE.Color('#4e453a');
    const tmp = new THREE.Color();
    const tube = (a, b, r0, r1, shade) => {
      dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const len = dir.length();
      const g = new THREE.CylinderGeometry(r1, r0, len, 6);
      q.setFromUnitVectors(up, dir.normalize());
      g.applyQuaternion(q);
      g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        tmp.copy(cWood).lerp(cDark, shade + (rng() - 0.5) * 0.25);
        arr[i * 3] = tmp.r; arr[i * 3 + 1] = tmp.g; arr[i * 3 + 2] = tmp.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      parts.push(g);
    };

    // trunk in two lean segments, snapped tip
    const lean = (rng() - 0.5) * 0.5;
    const lz = (rng() - 0.5) * 0.5;
    const midH = height * (0.5 + rng() * 0.12);
    const topH = height * (0.86 + rng() * 0.2);
    tube([0, -0.3, 0], [lean * 0.5, midH, lz * 0.5], 0.30, 0.185, 0.28);
    tube([lean * 0.5, midH - 0.05, lz * 0.5], [lean, topH, lz], 0.185, 0.05, 0.34);
    // root flares
    for (let i = 0; i < 3; i++) {
      const a = rng() * Math.PI * 2;
      tube([Math.cos(a) * 0.42, -0.25, Math.sin(a) * 0.42], [0, 0.6, 0], 0.1, 0.16, 0.42);
    }
    // gnarled branches, a few snapped short
    const nBr = 5 + (rng() * 3 | 0);
    for (let i = 0; i < nBr; i++) {
      const f = 0.35 + (i / nBr) * 0.55 + rng() * 0.06;
      const by = height * f;
      const bx = lean * f, bz = lz * f;
      const a = rng() * Math.PI * 2;
      const broken = rng() < 0.35;
      const L = (broken ? 0.5 + rng() * 0.6 : 1.3 + rng() * 1.6) * (1.2 - f * 0.55);
      const rise = 0.25 + rng() * 0.5;
      const ex = bx + Math.cos(a) * L, ez = bz + Math.sin(a) * L;
      const ey = by + L * rise;
      tube([bx, by, bz], [ex, ey, ez], 0.085 * (1.15 - f * 0.5), broken ? 0.05 : 0.016, 0.3 + rng() * 0.2);
      if (!broken && rng() < 0.6) {
        const a2 = a + (rng() - 0.5) * 1.4;
        const L2 = L * (0.35 + rng() * 0.3);
        tube([ex, ey, ez], [ex + Math.cos(a2) * L2, ey + L2 * (0.3 + rng() * 0.4), ez + Math.sin(a2) * L2],
          0.03, 0.012, 0.4);
      }
    }
    return mergeGeometries(parts);
  }
  /* -------------------------------- trees --------------------------------
   * world-09. A tree is a trunk plus BRANCH CARDS — alpha-tested quads
   * carrying a baked needle/leaf spray out of the 2x2 atlas — in three LODs
   * plus a crossed-billboard impostor. Every geometry is authored at a 10 m
   * reference height so one instance transform drives all four, and so the
   * `spatial` seed reads a sane trunk radius off the collision proxy.
   */

  /** Tapered bark tube, UV-mapped into the atlas' opaque bark tile. */
  _barkTube(P, rBot, rTop, h, seg, cLo, cHi, lean) {
    const pos = P.pos, nor = P.nor, uv = P.uv, col = P.col, idx = P.idx;
    const TAU = Math.PI * 2;
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * TAU, a1 = ((s + 1) / seg) * TAU;
      const base = pos.length / 3;
      const ring = [[a0, 0], [a1, 0], [a1, 1], [a0, 1]];
      for (const [a, t] of ring) {
        const r = rBot + (rTop - rBot) * t;
        const y = t * h;
        pos.push(Math.cos(a) * r + lean * y * y, y, Math.sin(a) * r);
        nor.push(Math.cos(a), 0.12, Math.sin(a));
        // bark tile occupies u,v in [0.5,1]
        uv.push(0.52 + (a / TAU) * 0.44, 0.52 + t * 0.44);
        // fake AO: the north-east side of the trunk sits in its own shadow
        const k = 0.62 + 0.38 * (0.5 + 0.5 * Math.cos(a - 2.2));
        const g = (cLo + (cHi - cLo) * t) * k;
        col.push(g, g * 0.94, g * 0.86);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  /**
   * One branch card. `ox,oy,oz` is the attachment point on the trunk, `dx,dz`
   * the outward direction, `L` the length, `W` the width, `up` selects the
   * vertical (true) or horizontal (false) plane of the cross.
   */
  _branchCard(P, ox, oy, oz, dx, dz, L, W, droop, up, tile, cIn, cOut) {
    const pos = P.pos, nor = P.nor, uv = P.uv, col = P.col, idx = P.idx;
    const sx = -dz, sz = dx;                        // tangential
    const base = pos.length / 3;
    const u0 = tile & 1 ? 0.5 : 0.0;
    const v0 = tile & 2 ? 0.5 : 0.0;
    const hw = W * 0.5;
    // corners: inner-lo, outer-lo, outer-hi, inner-hi
    const pts = up
      ? [[0, -hw, 0, 0], [L, -hw, 1, 0], [L, hw, 1, 1], [0, hw, 0, 1]]
      : [[0, -hw, 0, 0], [L, -hw, 1, 0], [L, hw, 1, 1], [0, hw, 0, 1]];
    for (const p of pts) {
      const along = p[0], across = p[1];
      const sag = droop * along;
      let px, py, pz;
      if (up) {
        px = ox + dx * along; py = oy - sag + across; pz = oz + dz * along;
      } else {
        px = ox + dx * along + sx * across;
        py = oy - sag;
        pz = oz + dz * along + sz * across;
      }
      pos.push(px, py, pz);
      // up-biased normals so foliage lights like a canopy, never a black wall
      nor.push(dx * 0.20, 0.96, dz * 0.20);
      uv.push(u0 + (0.02 + p[2] * 0.96) * 0.5, v0 + (0.02 + p[3] * 0.96) * 0.5);
      const g = cIn + (cOut - cIn) * p[2];
      col.push(g, g, g);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  _finishGeo(P) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P.pos), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(P.nor), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(P.uv), 2));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(P.col), 3));
    geo.setIndex(P.idx);
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }

  /** Conifer (`kind` 'pine' narrow spire / 'fir' broad skirt) at 10 m. */
  _coniferGeometry(seed, lod, kind = 'pine') {
    const H = 10, rng = mulberry32(seed * 131 + lod * 17 + 5);
    const P = { pos: [], nor: [], uv: [], col: [], idx: [] };
    const spread = kind === 'fir' ? 0.36 : 0.29;
    const whorls = lod === 0 ? 10 : lod === 1 ? 8 : 7;
    const per = lod === 0 ? 6 : lod === 1 ? 5 : 4;
    const cross = lod === 0;
    const wide = lod === 2 ? 1.95 : lod === 1 ? 1.35 : 1.0;
    const seg = lod === 0 ? 7 : lod === 1 ? 5 : 4;
    this._barkTube(P, 0.28, 0.075, H * 0.98, seg, 0.34, 0.52, 0.004);

    const t0 = 0.20, t1 = 0.99;
    for (let w = 0; w < whorls; w++) {
      const t = t0 + ((w + 0.5) / whorls) * (t1 - t0);
      const y = t * H;
      const trunkR = 0.28 + (0.075 - 0.28) * t;
      const L = (H * spread * Math.pow(1 - t, 0.80) + 0.30) * (0.85 + rng() * 0.3);
      const W = L * 0.62 * wide;
      const droop = 0.20 + rng() * 0.16 + t * 0.10;
      const dark = 0.42 + 0.40 * t;                       // lower whorls in AO
      const yaw0 = rng() * Math.PI * 2;
      for (let b = 0; b < per; b++) {
        const a = yaw0 + (b / per) * Math.PI * 2 + (rng() - 0.5) * 0.35;
        const dx = Math.cos(a), dz = Math.sin(a);
        const tile = (rng() * 3) | 0;                     // 0,1,2 = spray tiles
        const ox = dx * trunkR * 0.8, oz = dz * trunkR * 0.8;
        this._branchCard(P, ox, y, oz, dx, dz, L, W, droop, false, tile,
          dark * 0.72, dark * 1.18);
        if (cross) {
          this._branchCard(P, ox, y, oz, dx, dz, L, W * 0.78, droop, true,
            (tile + 1) % 3, dark * 0.66, dark * 1.10);
        }
      }
    }
    return this._finishGeo(P);
  }

  /** Pale-barked birch with a rounded leaf crown, at 10 m. */
  _birchGeometry(seed, lod) {
    const H = 10, rng = mulberry32(seed * 71 + lod * 13 + 9);
    const P = { pos: [], nor: [], uv: [], col: [], idx: [] };
    const whorls = lod === 0 ? 6 : lod === 1 ? 5 : 4;
    const per = lod === 0 ? 5 : lod === 1 ? 4 : 4;
    const cross = lod === 0;
    const seg = lod === 0 ? 6 : lod === 1 ? 5 : 4;
    this._barkTube(P, 0.20, 0.085, H, seg, 0.80, 1.00, 0.010);
    // two forking limbs give the birch its silhouette
    for (let k = 0; k < 2 && lod < 2; k++) {
      const a = rng() * Math.PI * 2;
      const P2 = { pos: P.pos, nor: P.nor, uv: P.uv, col: P.col, idx: P.idx };
      const base = P2.pos.length;
      this._barkTube(P2, 0.10, 0.05, H * 0.34, 4, 0.78, 0.96, 0.055);
      // lift + splay the limb we just appended
      for (let i = base / 1; i < P2.pos.length; i += 3) {
        const px = P2.pos[i], py = P2.pos[i + 1], pz = P2.pos[i + 2];
        P2.pos[i] = px * Math.cos(a) - pz * Math.sin(a) + Math.cos(a) * 0.3;
        P2.pos[i + 1] = py + H * 0.44;
        P2.pos[i + 2] = px * Math.sin(a) + pz * Math.cos(a) + Math.sin(a) * 0.3;
      }
    }
    for (let w = 0; w < whorls; w++) {
      const t = 0.42 + ((w + 0.5) / whorls) * 0.56;
      const y = t * H;
      // rounded crown profile
      const prof = Math.sin(Math.PI * ((t - 0.38) / 0.64));
      const wideL = lod === 2 ? 1.5 : lod === 1 ? 1.2 : 1.0;
      const L = (H * 0.26 * Math.max(0.28, prof) + 0.25) * (0.82 + rng() * 0.4);
      const W = L * 0.86 * wideL;
      const dark = 0.48 + 0.44 * t;
      const yaw0 = rng() * Math.PI * 2;
      for (let b = 0; b < per; b++) {
        const a = yaw0 + (b / per) * Math.PI * 2 + (rng() - 0.5) * 0.5;
        const dx = Math.cos(a), dz = Math.sin(a);
        const tile = (rng() * 3) | 0;
        this._branchCard(P, dx * 0.12, y, dz * 0.12, dx, dz, L, W,
          0.10 + rng() * 0.14, false, tile, dark * 0.74, dark * 1.16);
        if (cross) {
          this._branchCard(P, dx * 0.12, y, dz * 0.12, dx, dz, L, W * 0.8,
            0.10, true, (tile + 2) % 3, dark * 0.70, dark * 1.08);
        }
      }
    }
    return this._finishGeo(P);
  }

  /** Crossed-billboard impostor: 2 quads, 8 verts, at 10 m. */
  _impostorGeometry(widthK = 0.72) {
    const H = 10, W = H * widthK;
    const P = { pos: [], nor: [], uv: [], col: [], idx: [] };
    for (let k = 0; k < 2; k++) {
      const a = k * Math.PI * 0.5;
      const dx = Math.cos(a), dz = Math.sin(a);
      const base = P.pos.length / 3;
      const pts = [[-0.5, 0, 0, 1], [0.5, 0, 1, 1], [0.5, 1, 1, 0], [-0.5, 1, 0, 0]];
      for (const p of pts) {
        P.pos.push(dx * p[0] * W, p[1] * H, dz * p[0] * W);
        P.nor.push(-dz * 0.4, 0.9, dx * 0.4);
        P.uv.push(p[2], p[3]);
        P.col.push(1, 1, 1);
      }
      P.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return this._finishGeo(P);
  }

  _treeMaterial(map, opts = {}) {
    const mat = new THREE.MeshStandardMaterial({
      map: map || null,
      alphaTest: map ? 0.34 : 0,
      vertexColors: true,
      side: map ? THREE.DoubleSide : THREE.FrontSide,
      roughness: 0.94,
      metalness: 0,
      flatShading: !!opts.flat,
      emissive: '#161c0e',
      emissiveIntensity: 0.55,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this._uTime;
      shader.uniforms.uWindDir = this._uWindDir;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', TREE_VERT_HEAD)
        .replace('#include <begin_vertex>', TREE_VERT_BODY)
        .replace('#include <project_vertex>', PROJECT_NO_INSTANCE)
        .replace('#include <worldpos_vertex>', WORLDPOS_NO_INSTANCE);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTreeW;')
        .replace('#include <color_fragment>', '#include <color_fragment>\n'
          + (opts.noFade ? '' : TREE_FRAG_FADE));
      if (map) {
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <normal_fragment_begin>',
            '#include <normal_fragment_begin>\nnormal = normalize( vNormal );');
      }
    };
    return mat;
  }

  _buildTrees() {
    const terrain = this.ctx.terrain;
    const forest = new SimplexNoise(777);

    const needleTex = _bakeConiferAtlas(256, 31);
    const leafTex = _bakeConiferAtlas(256, 77, {
      leaf: true,
      dark: [0.13, 0.20, 0.065], lite: [0.46, 0.56, 0.20],
      bark: [0.70, 0.68, 0.62],
    });
    this._needleMat = this._treeMaterial(needleTex);
    this._leafMat = this._treeMaterial(leafTex);
    this._barkMat = this._treeMaterial(null, { flat: true });
    const impPine = this._treeMaterial(_bakeImpostor(128, 'pine'), { noFade: true });
    const impBirch = this._treeMaterial(_bakeImpostor(128, 'birch'), { noFade: true });
    const impSnag = this._treeMaterial(_bakeImpostor(128, 'snag'), { noFade: true });

    // dead snags keep the Round-3 gnarled tube model, normalised to 10 m
    const snag0 = this._deadTreeGeometry(61, 10);
    const snag1 = this._deadTreeGeometry(83, 10);
    snag0.computeBoundingBox(); snag1.computeBoundingBox();

    const groups = [
      {
        name: 'conifer',
        geos: [this._coniferGeometry(11, 0), this._coniferGeometry(11, 1),
          this._coniferGeometry(11, 2), this._impostorGeometry(0.80)],
        mats: [this._needleMat, this._needleMat, this._needleMat, impPine],
        trees: [], counts: [0, 0, 0, 0], meshes: [], cast: [1, 1, 0, 0],
      },
      {
        name: 'birch',
        geos: [this._birchGeometry(131, 0), this._birchGeometry(131, 1),
          this._birchGeometry(131, 2), this._impostorGeometry(0.70)],
        mats: [this._leafMat, this._leafMat, this._leafMat, impBirch],
        trees: [], counts: [0, 0, 0, 0], meshes: [], cast: [1, 0, 0, 0],
      },
      {
        name: 'snag',
        geos: [snag0, snag1, snag1, this._impostorGeometry(0.42)],
        mats: [this._barkMat, this._barkMat, this._barkMat, impSnag],
        trees: [], counts: [0, 0, 0, 0], meshes: [], cast: [1, 1, 0, 0],
      },
    ];
    this._treeGroups = groups;

    /* ---------------------------- scatter ----------------------------
     * TWO CHANGES IN ROUND 4's BIOME PASS.
     *
     * 1. The spacing test is a UNIFORM GRID, not a linear scan of everything
     *    placed so far. The old scan was O(n) per candidate — at 1520 trees
     *    and 140k candidates that is already ~10^8 distance tests, and the
     *    forest sector needs half again as many trees. A 12 m bucket grid
     *    makes it a 3x3 neighbourhood lookup, which is what pays for the
     *    denser stand.
     * 2. Candidates are DRAWN toward the NE forest sector. Sampling the disc
     *    uniformly puts only ~9 % of the darts inside it, so "dense conifer
     *    forest" would have been the same stand as everywhere else with a
     *    tighter spacing number. 45 % of the darts land in the sector's
     *    bounding box instead, and it decides its own species mix.
     */
    const rng = mulberry32(50421);
    const CELL = 12, GN = 64, GH = GN * CELL * 0.5;   // 768 m of grid
    const grid = new Array(GN * GN);
    const gput = (x, z) => {
      const i = ((x + GH) / CELL) | 0, j = ((z + GH) / CELL) | 0;
      if (i < 0 || j < 0 || i >= GN || j >= GN) return;
      const c = grid[j * GN + i];
      if (c) c.push(x, z); else grid[j * GN + i] = [x, z];
    };
    const gclear = (x, z, sp2) => {
      const i = ((x + GH) / CELL) | 0, j = ((z + GH) / CELL) | 0;
      for (let jj = j - 1; jj <= j + 1; jj++) {
        if (jj < 0 || jj >= GN) continue;
        for (let ii = i - 1; ii <= i + 1; ii++) {
          if (ii < 0 || ii >= GN) continue;
          const c = grid[jj * GN + ii];
          if (!c) continue;
          for (let k = 0; k < c.length; k += 2) {
            const dx = c[k] - x, dz = c[k + 1] - z;
            if (dx * dx + dz * dz < sp2) return false;
          }
        }
      }
      return true;
    };

    /* TWO BUDGETS, AND THE SECOND ONE IS NOT OPTIONAL. The open valley keeps
     * exactly the tree count it had (1520); the NE stand, the burn scar and
     * the shelf snags are added ON TOP. A single raised target instead let
     * the generic grove branches keep accepting until the total was reached,
     * which thickened the whole valley — and the first thing that filmed was
     * V33, whose camera looks north from the camp through what had become a
     * screen of pines instead of at the massif. */
    /* ======================= PASS 1: the open valley =====================
     * BYTE-IDENTICAL to the Round-3 scatter: same seed, same dart sampling,
     * same branch order, same number of rng() rolls per candidate, same 1520
     * budget. That is deliberate and it is not superstition — the scatter is
     * a stochastic dart throw, so consuming one extra random number at the
     * top re-rolls the WHOLE valley, and the first thing that films is V33,
     * whose camera looks north from the camp: two pines landing 12 m in front
     * of that lens turn "an alpine wall with strata and talus" into a hedge.
     * A biome pass is supposed to ADD a forest in the north-east, not move
     * every tree in the valley.
     *
     * Candidates that fall inside a biome region are still rolled and still
     * reserved in the spacing grid (so the sequence and the crowding state
     * are unchanged); they are simply not PLANTED, because pass 2 owns that
     * ground and plants the right species there.
     */
    const TARGET = 1520;                      // world-09 asks for 1200-1800
    let count = 0;
    for (let a = 0; a < 140000 && count < TARGET; a++) {
      const r = Math.sqrt(THREE.MathUtils.lerp(48 * 48, 326 * 326, rng()));
      const ang = rng() * Math.PI * 2;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;

      const grove = forest.fbm(x * 0.006, z * 0.006, 3);
      const moist = this._moisture(x, z);
      if (riverFactor(x, z) > 0.08) continue;   // none in the channel/ford
      if (pathFactor(x, z) > 0.28) continue;    // keep the trails open
      const h = terrain.heightFast(x, z);
      if (h > 36) continue;                     // no trees on high rock
      if (terrain.slopeFast(x, z) > 0.66) continue;
      if (Math.hypot(x - CAMP.x, z - CAMP.z) < 17) continue;
      if (inKeepout(x, z)) continue;

      // grove-and-clearing structure: dense mixed stands inside the forest
      // noise, sparse fringes, and rare lone silhouettes in the open
      let gi, spacing2, fir = false;
      if (grove > 0.06) {
        const w = rng();
        if (w < 0.68) { gi = 0; fir = rng() < 0.28; }
        else if (w < 0.985) gi = 1;
        else gi = 2;
        spacing2 = 11;
      } else if (grove > -0.03) {
        if (rng() > 0.44) continue;
        const w = rng();
        gi = w < 0.56 ? 0 : w < 0.955 ? 1 : 2;
        fir = gi === 0 && rng() < 0.2;
        spacing2 = 26;
      } else {
        if (rng() > 0.13) continue;
        const w = rng();
        gi = w < 0.10 ? 2 : w < 0.54 ? 1 : 0;
        spacing2 = 120;
      }
      if (moist > 0.4 && rng() < 0.5) gi = 1;   // birches crowd damp banks

      if (!gclear(x, z, spacing2)) continue;
      gput(x, z);

      const height = gi === 1 ? 7.5 + rng() * 5.5
        : gi === 2 ? 5.0 + rng() * 3.4
          : (fir ? 8.0 + rng() * 4.0 : 8.5 + rng() * 6.5);
      const sy = height / 10;
      const sx = sy * (fir ? 1.22 + rng() * 0.2 : 0.82 + rng() * 0.42);
      const tint = 0.82 + rng() * 0.34;
      const warm = rng() * 0.20;
      count++;
      // pass 2's ground: rolled, reserved, not planted
      if (forestFactor(x, z) > 0.34 || ashFactor(x, z) > 0.16
        || snowFactor(x, z) > 0.14 || marshFactor(x, z) > 0.35) continue;
      groups[gi].trees.push({
        x, z, y: h - 0.16,
        yaw: rng() * Math.PI * 2,
        tx: (rng() - 0.5) * 0.06, tz: (rng() - 0.5) * 0.06,
        sx, sy,
        r: tint + warm * 0.5, g: tint * (fir ? 0.90 : 1), b: tint - warm * 0.3,
      });
    }

    /* ======================= PASS 2: the biome stands ====================
     * Its own stream, so nothing here can move a tree in the open valley.
     * Darts land only inside the three wooded biomes, and each one states
     * its own species mix, spacing and colour:
     *
     *   forest  closed conifer stand, spacing 6.5 m at the fringe down to
     *           3.0 m in the core — "you cannot see through it"
     *   ash     standing charcoal, thinning toward the centre of the burn,
     *           leaning where it fell
     *   snow    a handful of silvered dead trees on the shelf, nothing alive
     */
    const brng = mulberry32(90213);
    const BIOME_TARGET = 680;
    let bcount = 0;
    for (let a = 0; a < 120000 && bcount < BIOME_TARGET; a++) {
      let x, z;
      if (brng() < 0.80) {
        x = 150 + (brng() - 0.5) * 268;         // NE stand's bounding box
        z = -120 + (brng() - 0.5) * 262;
      } else {
        x = -26 + (brng() - 0.5) * 300;         // the N shelf
        z = -256 + (brng() - 0.5) * 120;
      }
      if (x * x + z * z > 326 * 326) continue;
      if (riverFactor(x, z) > 0.08) continue;
      if (pathFactor(x, z) > 0.28) continue;
      const h = terrain.heightFast(x, z);
      if (h > 36) continue;
      if (terrain.slopeFast(x, z) > 0.66) continue;
      if (inKeepout(x, z)) continue;
      if (marshFactor(x, z) > 0.35) continue;

      const bAsh = ashFactor(x, z);
      const bSnow = snowFactor(x, z);
      const bFor = forestFactor(x, z);
      let gi, spacing2, fir = false, burnt = 0, frost = 0;
      if (bAsh > 0.18) {
        if (brng() > 0.34) continue;
        gi = 2;
        spacing2 = 26 + 70 * bAsh;
        burnt = bAsh;
      } else if (bSnow > 0.16) {
        if (brng() > 0.13) continue;
        gi = 2;
        spacing2 = 240;
        frost = bSnow;
      } else if (bFor > 0.20) {
        const w = brng();
        if (w < 0.86) { gi = 0; fir = brng() < 0.45; }
        else if (w < 0.965) gi = 1;
        else gi = 2;
        spacing2 = 42 - 33 * SS(bFor, 0.20, 0.92);
      } else {
        continue;
      }

      if (!gclear(x, z, spacing2)) continue;
      gput(x, z);

      const height = gi === 1 ? 7.5 + brng() * 5.5
        : gi === 2 ? 5.0 + brng() * 3.4
          : (fir ? 8.0 + brng() * 4.0 : 8.5 + brng() * 6.5);
      const sy = height / 10 * (burnt ? 0.85 + brng() * 0.45 : 1);
      const sx = sy * (fir ? 1.22 + brng() * 0.2 : 0.82 + brng() * 0.42);
      const tint = 0.82 + brng() * 0.34;
      const warm = brng() * 0.20;
      let cr = tint + warm * 0.5, cg = tint * (fir ? 0.90 : 1), cb = tint - warm * 0.3;
      if (burnt) {
        // charred to near-black, with a little grey ash on the windward side
        const k = 0.10 + brng() * 0.16;
        cr = k * 1.06; cg = k; cb = k * 0.95;
      } else if (frost) {
        // silvered driftwood-grey
        const k = 0.72 + brng() * 0.28;
        cr = k; cg = k * 1.01; cb = k * 1.06;
      }
      groups[gi].trees.push({
        x, z, y: h - 0.16,
        yaw: brng() * Math.PI * 2,
        tx: (brng() - 0.5) * (burnt ? 0.42 : 0.06),
        tz: (brng() - 0.5) * (burnt ? 0.42 : 0.06),
        sx, sy,
        r: cr, g: cg, b: cb,
      });
      bcount++;
    }
    count += bcount;
    this.biomeTreeCount = bcount;
    this.treeCount = count;

    /* --------------------- LOD meshes + collision proxy --------------- */
    for (const g of groups) {
      const n = g.trees.length;
      if (!n) continue;
      for (let l = 0; l < 4; l++) {
        const mesh = new THREE.InstancedMesh(g.geos[l], g.mats[l], n);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.setColorAt(0, _col.setRGB(1, 1, 1));
        mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        mesh.count = 0;
        mesh.name = `tree-${g.name}-lod${l}`;
        mesh.castShadow = !!g.cast[l];
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;     // instances span the world
        this.group.add(mesh);
        g.meshes.push(mesh);
      }
      // Collision proxy: `spatial.seedWorld()` looks for `pines-*` and reads
      // the trunk radius and canopy spread straight off the geometry. One
      // hidden mesh holding EVERY tree keeps the collider set independent of
      // which LOD happens to be showing.
      const proxy = new THREE.InstancedMesh(g.geos[1], g.mats[1], n);
      for (let i = 0; i < n; i++) {
        const t = g.trees[i];
        _v3.set(t.x, t.y, t.z);
        _eul.set(0, t.yaw, 0);
        _q.setFromEuler(_eul);
        _scl.set(t.sx, t.sy, t.sx);
        _m4.compose(_v3, _q, _scl);
        proxy.setMatrixAt(i, _m4);
      }
      proxy.name = `pines-${g.name}`;
      proxy.visible = false;
      proxy.castShadow = false;
      proxy.receiveShadow = false;
      proxy.frustumCulled = false;
      this.group.add(proxy);
      g.proxy = proxy;
    }
    this._treeSortX = 1e9; this._treeSortZ = 1e9;
    this._resortTrees(CAMP.x, CAMP.z);
  }

  /**
   * Assign every tree to a LOD bucket and write its transform into that LOD's
   * instance buffer. Called only when the camera has travelled 10 m, so the
   * per-frame cost of the whole tree system is zero.
   */
  _resortTrees(camX, camZ) {
    const dx = camX - this._treeSortX, dz = camZ - this._treeSortZ;
    if (dx * dx + dz * dz < TREE_RESORT_DIST * TREE_RESORT_DIST) return false;
    this._treeSortX = camX; this._treeSortZ = camZ;
    const b0 = LOD_BANDS[0] * LOD_BANDS[0];
    const b1 = LOD_BANDS[1] * LOD_BANDS[1];
    const b2 = LOD_BANDS[2] * LOD_BANDS[2];
    const groups = this._treeGroups;
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      if (!g.meshes.length) continue;
      const c = g.counts;
      c[0] = c[1] = c[2] = c[3] = 0;
      const trees = g.trees;
      for (let i = 0; i < trees.length; i++) {
        const t = trees[i];
        const ex = t.x - camX, ez = t.z - camZ;
        const d2 = ex * ex + ez * ez;
        const l = d2 < b0 ? 0 : d2 < b1 ? 1 : d2 < b2 ? 2 : 3;
        const mesh = g.meshes[l];
        const n = c[l]++;
        _v3.set(t.x, t.y, t.z);
        if (l === 3) _eul.set(0, t.yaw, 0);
        else _eul.set(t.tx, t.yaw, t.tz);
        _q.setFromEuler(_eul);
        _scl.set(t.sx, t.sy, t.sx);
        _m4.compose(_v3, _q, _scl);
        mesh.setMatrixAt(n, _m4);
        _col.setRGB(t.r, t.g, t.b);
        mesh.setColorAt(n, _col);
      }
      for (let l = 0; l < 4; l++) {
        const mesh = g.meshes[l];
        mesh.count = c[l];
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
    return true;
  }

  treeStats() {
    const lod = [0, 0, 0, 0];
    let total = 0;
    for (const g of this._treeGroups) {
      total += g.trees.length;
      for (let l = 0; l < 4; l++) lod[l] += g.counts[l];
    }
    return { total, lod, groups: this._treeGroups.length, bands: LOD_BANDS };
  }

  /* -------------------------------- bushes -------------------------------- */

  _bushGeometry(seed) {
    const rng = mulberry32(seed);
    const noise = new SimplexNoise(seed * 7 + 11);
    const parts = [];
    const cLo = new THREE.Color('#33421d');
    const cHi = new THREE.Color('#7a8038');
    const tmp = new THREE.Color();
    const blobs = 2 + (rng() * 2 | 0);
    for (let b = 0; b < blobs; b++) {
      const r = 0.42 + rng() * 0.3;
      const g = new THREE.IcosahedronGeometry(r, 1);
      const p = g.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const d = 1 + 0.42 * noise.fbm(v.x * 2.1 + b * 7, v.y * 1.9 - v.z * 1.6, 2);
        v.multiplyScalar(d);
        v.y *= 0.62;
        p.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      const arr = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const f = THREE.MathUtils.clamp(p.getY(i) / (r * 0.62) * 0.5 + 0.6, 0.05, 1.1);
        tmp.copy(cLo).lerp(cHi, f * (0.55 + rng() * 0.3));
        arr[i * 3] = tmp.r; arr[i * 3 + 1] = tmp.g; arr[i * 3 + 2] = tmp.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      g.translate((rng() - 0.5) * r * 1.5, r * 0.42 + (rng() - 0.4) * 0.1, (rng() - 0.5) * r * 1.5);
      parts.push(g);
    }
    return mergeGeometries(parts);
  }

  _buildBushes() {
    const terrain = this.ctx.terrain;
    const forest = new SimplexNoise(777); // same field as the groves
    const variants = [this._bushGeometry(301), this._bushGeometry(407)];
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
      flatShading: true,
      emissive: '#161d0c',
      emissiveIntensity: 0.7,
    });

    const rng = mulberry32(66103);
    const placed = [[], []];
    const TARGET = 660;
    let count = 0;
    for (let a = 0; a < 46000 && count < TARGET; a++) {
      // 40 % of the darts into the NE stand: sampling the disc uniformly would
      // put 9 % of them there and the understory would be a rumour
      let x, z;
      if (rng() < 0.40) {
        x = 150 + (rng() - 0.5) * 240;
        z = -120 + (rng() - 0.5) * 232;
        if (x * x + z * z > 320 * 320) continue;
      } else {
        const r = Math.sqrt(rng()) * 330;
        const ang = rng() * Math.PI * 2;
        x = Math.cos(ang) * r; z = Math.sin(ang) * r;
      }

      const grove = forest.fbm(x * 0.006, z * 0.006, 3);
      const moist = this._moisture(x, z);
      /* UNDERGROWTH. The NE stand gets its own shrub pass: a closed conifer
       * forest with a bare floor reads as a plantation, and the fern layer is
       * half of what makes the sector feel thick when you walk into it. The
       * burn scar and the snow shelf reject shrubs outright — nothing has
       * grown back in the one and nothing holds in the other. */
      const bFor = forestFactor(x, z);
      if (ashFactor(x, z) > 0.25 || snowFactor(x, z) > 0.20) continue;
      const understory = bFor > 0.30 && rng() < 0.55 + 0.35 * bFor;
      // shrubs skirt the grove edges + riverbanks; only a few stray into the open
      const edge = grove > 0.0 && grove < 0.14;
      if (!understory && !edge && moist < 0.3 && rng() < 0.8) continue;
      if (riverFactor(x, z) > 0.12) continue;
      if (pathFactor(x, z) > 0.3) continue;
      if (shelfFactor(x, z) > 0.6 && rng() < 0.7) continue;
      const h = terrain.getHeight(x, z);
      if (h > 30) continue;
      const gx = (terrain.getHeight(x + 0.8, z) - h) / 0.8;
      const gz = (terrain.getHeight(x, z + 0.8) - h) / 0.8;
      if (gx * gx + gz * gz > 0.32) continue;
      if (Math.hypot(x - CAMP.x, z - CAMP.z) < 13) continue;
      if (inKeepout(x, z)) continue;

      placed[(rng() * 2) | 0].push({
        x, z, y: h - 0.06,
        yaw: rng() * Math.PI * 2,
        s: (0.6 + rng() * 0.85) * (moist > 0.3 ? 1.25 : 1),
        tint: 0.8 + rng() * 0.34,
        green: moist > 0.3 ? 0.12 : 0,
      });
      count++;
    }
    this.bushCount = count;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eul = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();
    for (let v = 0; v < 2; v++) {
      const list = placed[v];
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(variants[v], mat, list.length);
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        pos.set(it.x, it.y, it.z);
        eul.set(0, it.yaw, 0);
        q.setFromEuler(eul);
        scl.set(it.s, it.s * (0.8 + (i % 5) * 0.08), it.s);
        m.compose(pos, q, scl);
        mesh.setMatrixAt(i, m);
        col.setRGB(it.tint * (1 - it.green), it.tint, it.tint * (1 - it.green * 0.5));
        mesh.setColorAt(i, col);
      }
      mesh.name = `bushes-${v}`;
      mesh.castShadow = false; // low shrubs: shadow cost not worth it
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }
  /* ------------------------------- flowers --------------------------------
   * world-18. A bloom is a CLUSTER: 3-5 leaning stems, each carrying a crossed
   * alpha-tested corolla at its tip. Stems and heads are two instanced meshes
   * over one transform list, so the stem stays green while the head takes the
   * instance tint (one flat vertex colour could never do both).
   */

  /** Five-petal corolla with a pollen eye. */
  _bakeFlowerTexture(N = 64) {
    const cov = new Float32Array(N * N);
    const rgb = new Float32Array(N * N * 3);
    const c = N * 0.5;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const dx = (i + 0.5 - c) / c, dy = (j + 0.5 - c) / c;
        const d = Math.hypot(dx, dy);
        const a = Math.atan2(dy, dx);
        const petal = 0.62 + 0.34 * Math.abs(Math.cos(a * 2.5));
        if (d > petal) continue;
        const o = j * N + i;
        cov[o] = Math.min(1, (petal - d) * 7 + 0.45);
        if (d < 0.20) {
          rgb[o * 3] = 1.0; rgb[o * 3 + 1] = 0.80; rgb[o * 3 + 2] = 0.22;
        } else {
          const k = 0.74 + 0.30 * (1 - d / petal);
          rgb[o * 3] = k; rgb[o * 3 + 1] = k * 0.97; rgb[o * 3 + 2] = k * 0.93;
        }
      }
    }
    _dilate(rgb, cov, N, 2);
    return _texFromBuffers(rgb, cov, N, 0.28);
  }

  _flowerCluster(seed) {
    const rng = mulberry32(seed);
    const S = { pos: [], nor: [], uv: [], col: [], bend: [], idx: [] };
    const Hd = { pos: [], nor: [], uv: [], col: [], bend: [], idx: [] };
    const heads = 3 + ((rng() * 3) | 0);
    for (let k = 0; k < heads; k++) {
      const a = rng() * Math.PI * 2;
      const lean = 0.045 + rng() * 0.085;
      const hgt = 0.19 + rng() * 0.17;
      const bx = (rng() - 0.5) * 0.07, bz = (rng() - 0.5) * 0.07;
      const tx = bx + Math.cos(a) * lean, tz = bz + Math.sin(a) * lean;
      const ca = Math.cos(a + 1.5708), sa = Math.sin(a + 1.5708);
      const w = 0.009 + rng() * 0.005;
      // stem: one tapering strip, doubled-sided, bending with the wind
      const base = S.pos.length / 3;
      const rows = 3;
      for (let r = 0; r <= rows; r++) {
        const t = r / rows;
        const px = bx + (tx - bx) * t * t, pz = bz + (tz - bz) * t * t;
        const py = hgt * t;
        const ww = w * (1 - t * 0.55);
        for (const s of [-1, 1]) {
          S.pos.push(px + ca * ww * s, py, pz + sa * ww * s);
          S.nor.push(ca * 0.25 * s, 1, sa * 0.25 * s);
          S.uv.push(s < 0 ? 0 : 1, t);
          S.bend.push(t);
          const g = 0.20 + 0.26 * t;
          S.col.push(g * 0.72, g * 1.25, g * 0.42);
        }
      }
      for (let r = 0; r < rows; r++) {
        const o = base + r * 2;
        S.idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
      }
      // corolla: two crossed quads at the stem tip
      const hs = 0.055 + rng() * 0.045;
      for (let q = 0; q < 2; q++) {
        const qa = a + q * Math.PI * 0.5;
        const dx = Math.cos(qa), dz = Math.sin(qa);
        const b2 = Hd.pos.length / 3;
        const pts = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
        for (const p of pts) {
          Hd.pos.push(tx + dx * p[0] * hs, hgt + p[1] * hs * 0.92, tz + dz * p[0] * hs);
          Hd.nor.push(-dz * 0.3, 0.94, dx * 0.3);
          Hd.uv.push(p[2], p[3]);
          Hd.bend.push(1);
          Hd.col.push(1, 1, 1);
        }
        Hd.idx.push(b2, b2 + 1, b2 + 2, b2, b2 + 2, b2 + 3);
      }
    }
    const mk = (P) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P.pos), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(P.nor), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(P.uv), 2));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(P.col), 3));
      g.setAttribute('aBend', new THREE.BufferAttribute(new Float32Array(P.bend), 1));
      g.setIndex(P.idx);
      g.computeBoundingSphere();
      return g;
    };
    return { stems: mk(S), heads: mk(Hd) };
  }

  _buildFlowers() {
    const terrain = this.ctx.terrain;
    const cluster = this._flowerCluster(4711);
    const bloom = new SimplexNoise(6021);
    const rng = mulberry32(140590);
    const palette = ['#f4ecd6', '#e8b84b', '#8a6fd0', '#d4593a', '#d9a8b8', '#e6dc7a']
      .map((c) => new THREE.Color(c));
    const items = [];
    const TARGET = 3100;
    this._flowerAnchors = [];
    for (let a = 0; a < 90000 && items.length < TARGET; a++) {
      const r = Math.sqrt(rng()) * 312;
      const ang = rng() * Math.PI * 2;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;

      // meadow patches: bloom noise gates whole drifts of colour
      const patch = bloom.fbm(x * 0.03, z * 0.03, 2);
      if (patch < 0.26) continue;
      if (rng() > 0.72) continue;
      if (terrain.tallGrassDensity(x, z) > 0.52) continue; // open filler only
      if (riverFactor(x, z) > 0.1 || pathFactor(x, z) > 0.24) continue;
      if (shelfFactor(x, z) > 0.45) continue;
      const h = terrain.heightFast(x, z);
      if (h > 26) continue;
      if (terrain.slopeFast(x, z) > 0.36) continue;
      const cdx = x - CAMP.x, cdz = z - CAMP.z;
      if (cdx * cdx + cdz * cdz < 120) continue;

      const pi = (patch * 31 + (rng() < 0.12 ? rng() * 6 : 0)) | 0;
      items.push({
        x, z, y: h - 0.02,
        yaw: rng() * Math.PI * 2,
        s: 0.80 + rng() * 0.75,
        c: palette[pi % palette.length],
      });
      if (this._flowerAnchors.length < 96 && rng() < 0.06) {
        this._flowerAnchors.push([x, h + 0.9, z]);
      }
    }
    this.flowerCount = items.length;
    if (!items.length) return;

    const stemMat = this._grassMaterial([-2, -1, 62, 86], null);
    stemMat.vertexColors = true;
    stemMat.side = THREE.DoubleSide;
    this._flowerStemMat = stemMat;
    const headMat = this._grassMaterial([-2, -1, 74, 104], this._bakeFlowerTexture(64));
    headMat.vertexColors = true;
    headMat.side = THREE.DoubleSide;
    this._flowerMat = headMat;

    const build = (geo, mat, name, tinted) => {
      const g = new THREE.BufferGeometry();
      g.setIndex(geo.index);
      g.setAttribute('position', geo.attributes.position);
      g.setAttribute('normal', geo.attributes.normal);
      g.setAttribute('uv', geo.attributes.uv);
      g.setAttribute('color', geo.attributes.color);
      g.setAttribute('aBend', geo.attributes.aBend);
      const info = new Float32Array(items.length * 2);
      const r2 = mulberry32(88);
      for (let i = 0; i < items.length; i++) {
        info[i * 2] = r2() * 6.283;
        info[i * 2 + 1] = 0.55 + r2() * 0.25;
      }
      g.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 2));
      const mesh = new THREE.InstancedMesh(g, mat, items.length);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        _v3.set(it.x, it.y, it.z);
        _eul.set(0, it.yaw, 0);
        _q.setFromEuler(_eul);
        _scl.setScalar(it.s);
        _m4.compose(_v3, _q, _scl);
        mesh.setMatrixAt(i, _m4);
        mesh.setColorAt(i, tinted ? it.c : _col.setRGB(1, 1, 1));
      }
      mesh.name = name;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return mesh;
    };
    build(cluster.stems, stemMat, 'meadow-flower-stems', false);
    build(cluster.heads, headMat, 'meadow-flowers', true);
  }

  /* ----------------------------- butterflies ------------------------------
   * world-18's second half. 72 instances wandering over the flower drifts,
   * wings flapped in the vertex shader so the per-frame CPU cost is 72 matrix
   * composes and nothing else.
   */
  _buildButterflies() {
    const anchors = this._flowerAnchors || [];
    const N = Math.min(72, anchors.length * 2);
    this.butterflyCount = N;
    if (!N) { this._butterflies = null; return; }

    const P = { pos: [], nor: [], uv: [], col: [], idx: [] };
    // two wings, each a quad hinged on the body axis (x = 0)
    for (const s of [-1, 1]) {
      const base = P.pos.length / 3;
      const pts = [[0, -0.5], [1, -0.6], [1, 0.7], [0, 0.45]];
      for (let i = 0; i < 4; i++) {
        P.pos.push(s * pts[i][0] * 0.085, 0, pts[i][1] * 0.075);
        P.nor.push(0, 1, 0);
        P.uv.push(pts[i][0], i < 2 ? 0 : 1);
        P.col.push(1, 1, 1);
      }
      P.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P.pos), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(P.nor), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(P.uv), 2));
    geo.setIndex(P.idx);
    const phase = new Float32Array(N);
    for (let i = 0; i < N; i++) phase[i] = (i * 2.399) % 6.283;
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: false, roughness: 0.7, metalness: 0,
      side: THREE.DoubleSide, emissive: '#3a2c12', emissiveIntensity: 0.5,
    });
    const uTime = this._uTime;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
uniform float uTime;
attribute float aPhase;`)
        .replace('#include <begin_vertex>', `
float flap = sin( uTime * 17.0 + aPhase );
vec3 wing = position;
float k = 0.30 + 0.70 * abs( flap );
wing.x *= k;
wing.y += abs( position.x ) * flap * 0.9;
vec3 transformed = ( instanceMatrix * vec4( wing, 1.0 ) ).xyz;`)
        .replace('#include <project_vertex>', PROJECT_NO_INSTANCE)
        .replace('#include <worldpos_vertex>', WORLDPOS_NO_INSTANCE);
    };
    this._butterflyMat = mat;

    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, _col.setRGB(1, 1, 1));
    mesh.name = 'butterflies';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    this.group.add(mesh);

    const rng = mulberry32(9931);
    this._butterflies = { mesh, N, items: [] };
    const pal = [[0.95, 0.83, 0.35], [0.92, 0.55, 0.28], [0.85, 0.88, 0.95],
      [0.78, 0.45, 0.62]];
    for (let i = 0; i < N; i++) {
      const a = anchors[i % anchors.length];
      const c = pal[(rng() * pal.length) | 0];
      mesh.setColorAt(i, _col.setRGB(c[0], c[1], c[2]));
      this._butterflies.items.push({
        ax: a[0], ay: a[1], az: a[2],
        r: 1.4 + rng() * 3.2,
        w1: 0.28 + rng() * 0.34, w2: 0.19 + rng() * 0.28,
        ph: rng() * 6.283, ph2: rng() * 6.283,
        s: 0.8 + rng() * 0.5,
      });
    }
    mesh.instanceColor.needsUpdate = true;
  }

  _updateButterflies(t) {
    const B = this._butterflies;
    if (!B) return;
    const cam = this.ctx.camera.position;
    const items = B.items;
    for (let i = 0; i < B.N; i++) {
      const b = items[i];
      const x = b.ax + Math.sin(t * b.w1 + b.ph) * b.r;
      const z = b.az + Math.sin(t * b.w2 + b.ph2) * b.r * 0.8;
      const y = b.ay + Math.sin(t * 1.7 + b.ph) * 0.32;
      const dx = x - cam.x, dz = z - cam.z;
      if (dx * dx + dz * dz > 4900) {         // > 70 m: park it underground
        _v3.set(x, -60, z); _scl.setScalar(0.001);
      } else {
        _v3.set(x, y, z); _scl.setScalar(b.s);
      }
      _eul.set(0, Math.atan2(Math.cos(t * b.w2 + b.ph2), Math.cos(t * b.w1 + b.ph)), 0);
      _q.setFromEuler(_eul);
      _m4.compose(_v3, _q, _scl);
      B.mesh.setMatrixAt(i, _m4);
    }
    B.mesh.instanceMatrix.needsUpdate = true;
  }

  /* -------------------------------- litter --------------------------------
   * world-17's clutter half: the shoulder of every trail carries kicked-out
   * pebbles and dropped twigs, which is what stops a narrowed path from
   * reading as a decal stripe.
   */
  _buildLitter() {
    const terrain = this.ctx.terrain;
    const rng = mulberry32(31337);
    const pebbleGeo = this._rockGeometry(517);
    const twig = new THREE.BoxGeometry(1, 0.055, 0.055);
    twig.translate(0.5, 0, 0);
    const tc = new Float32Array(twig.attributes.position.count * 3);
    for (let i = 0; i < tc.length; i += 3) { tc[i] = 0.36; tc[i + 1] = 0.29; tc[i + 2] = 0.20; }
    twig.setAttribute('color', new THREE.BufferAttribute(tc, 3));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.96, metalness: 0, flatShading: true,
    });
    this._litterMat = mat;

    const peb = [], tw = [];
    for (let a = 0; a < 900000 && peb.length + tw.length < 1500; a++) {
      const r = Math.sqrt(rng()) * 320;
      const ang = rng() * Math.PI * 2;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      const pf = pathFactor(x, z);
      if (pf < 0.12 || pf > 0.94) continue;      // the shoulder, not the tread
      if (rng() > 0.72) continue;
      const y = terrain.heightFast(x, z);
      if (y > 34) continue;
      (rng() < 0.62 ? peb : tw).push({
        x, z, y,
        yaw: rng() * Math.PI * 2,
        s: 0.06 + rng() * 0.13,
        L: 0.20 + rng() * 0.45,
        g: 0.55 + rng() * 0.5,
      });
    }
    this.litterCount = peb.length + tw.length;

    const mk = (list, geo, name, isTwig) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        _v3.set(it.x, it.y + (isTwig ? 0.02 : it.s * 0.35), it.z);
        _eul.set(isTwig ? 0 : 0.30, it.yaw, 0);
        _q.setFromEuler(_eul);
        if (isTwig) _scl.set(it.L, 1, 1);
        else _scl.set(it.s * 1.3, it.s * 0.62, it.s);
        _m4.compose(_v3, _q, _scl);
        mesh.setMatrixAt(i, _m4);
        mesh.setColorAt(i, _col.setRGB(it.g, it.g * 0.95, it.g * 0.88));
      }
      mesh.name = name;               // NOT `rocks-*`: litter must not block
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    };
    mk(peb, pebbleGeo, 'litter-pebbles', false);
    mk(tw, twig, 'litter-twigs', true);
  }

  /* -------------------------------- rocks -------------------------------- */

  _rockGeometry(seed) {
    const rng = mulberry32(seed);
    const n = new SimplexNoise(seed * 31 + 5);
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const p = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const d = 0.68
        + 0.4 * (n.fbm(v.x * 1.2 + seed, v.y * 1.2 - v.z * 0.9, 3) * 0.5 + 0.5)
        + 0.1 * n.noise2D(v.x * 3.5 - v.z * 2.8, v.y * 3.3 + seed);
      v.multiplyScalar(d);
      v.y *= 0.72; // squat boulders
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();

    // strong dirt/ochre soil stain climbing from the buried base so rocks
    // read as bedded into the meadow rather than dropped gray props
    const colors = new Float32Array(p.count * 3);
    const cRock = new THREE.Color('#6e685a');
    const cDirt = new THREE.Color('#6f4e26');
    const tmp = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      tmp.copy(cRock).lerp(cDirt, THREE.MathUtils.clamp(0.72 - y * 1.1, 0, 0.92));
      const j = (rng() - 0.5) * 0.07;
      colors[i * 3] = tmp.r + j; colors[i * 3 + 1] = tmp.g + j; colors[i * 3 + 2] = tmp.b + j;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }

  _buildRocks() {
    const terrain = this.ctx.terrain;
    const variants = [this._rockGeometry(3), this._rockGeometry(8), this._rockGeometry(21)];
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      flatShading: true,
    });

    const rng = mulberry32(88771);
    // per variant: [smallRocks, bigRocks] — small rocks skip the shadow pass
    const placed = [[[], []], [[], []], [[], []]];
    const TARGET = 300;
    let count = 0;
    for (let a = 0; a < 6000 && count < TARGET; a++) {
      const r = Math.sqrt(rng()) * 338;
      const ang = rng() * Math.PI * 2;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      if (riverFactor(x, z) > 0.3) continue; // keep the silt bed clear
      const h = terrain.getHeight(x, z);
      if (h > 45) continue;
      const gx = (terrain.getHeight(x + 0.8, z) - h) / 0.8;
      const gz = (terrain.getHeight(x, z + 0.8) - h) / 0.8;
      const slope = Math.hypot(gx, gz);
      if (slope > 0.85) continue;
      // fewer rocks in flat meadow, more on hills
      if (slope < 0.08 && h < 6 && rng() < 0.6) continue;
      if (Math.hypot(x - CAMP.x, z - CAMP.z) < 10) continue;

      const big = rng();
      const s = 0.45 + big * big * 2.3; // mostly small, occasional boulders
      const v = Math.min(2, (rng() * 3) | 0);
      placed[v][s < 1.05 ? 0 : 1].push({
        x, z, y: h - s * 0.4, // sunk deep so they emerge from the soil
        yaw: rng() * Math.PI * 2,
        s, sy: s * (0.85 + rng() * 0.5),
        tx: (rng() - 0.5) * 0.3, tz: (rng() - 0.5) * 0.3,
        tint: 0.74 + rng() * 0.24,
      });
      count++;
    }

    /* ------------------------- scree + erratics -------------------------
     * The SE shelf's "rocky benches" were pale ground with nothing standing
     * on them: the splat said stone and the silhouette said meadow. This
     * pass throws BLOCKS — a talus field is boulders shed off the bench
     * risers, densest right under them — plus a scatter of glacial erratics
     * on the north snow shelf so that bench has something to break its
     * skyline. Both feed the SAME three instanced meshes as the meadow
     * rocks, so the whole biome costs zero extra draw calls.
     */
    const screeRng = mulberry32(31771);
    const TARGET_SCREE = 760;
    let screeCount = 0;

    /* TALUS MUST NOT WALL THE BENCH OFF (A25b-nav-and-occlusion).
     *
     * `collision.js` makes any rock whose effective radius reaches 0.6 m a
     * BLOCKING collider, and `nav` stamps those into the cost grid. The first
     * cut of this pass threw 3-9 blocks inside a ~10 m box, so the big ones
     * fused: the scree benches measured 1704 blocked nav cells against 1373
     * open — 55 % of the biome impassable — and that dragged the world's
     * navigable fraction to 0.544 against spatial's 0.55 bar. A talus field you
     * cannot pick your way across is also worse than the real thing: scree has
     * lines through it, and that is what makes it read as loose rock rather
     * than as a wall.
     *
     * The fix keeps EVERY block. A block large enough to block, landing within
     * `BIG_GAP` of one already placed large, is demoted to steppable size
     * rather than rejected — same count, same silhouette variety, same draw
     * calls, but the spills keep lanes between them.
     *
     * DETERMINISM: the demotion reads `sc` AFTER it is rolled and consumes NO
     * random numbers, so the rng stream is byte-identical to before. That
     * matters here for the same reason it matters for the trees: this is a dart
     * throw, and one extra roll at the top re-rolls every block in the world.
     */
    const BIG_GAP = 4.6;                 // metres between BLOCKING talus
    const bigGrid = new Map();           // build-time only; dropped after
    const bigTooClose = (x, z) => {
      const gx = Math.floor(x / BIG_GAP), gz = Math.floor(z / BIG_GAP);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const arr = bigGrid.get((gx + dx) * 100003 + (gz + dz));
          if (!arr) continue;
          for (let i = 0; i < arr.length; i += 2) {
            const ex = arr[i] - x, ez = arr[i + 1] - z;
            if (ex * ex + ez * ez < BIG_GAP * BIG_GAP) return true;
          }
        }
      }
      return false;
    };
    const bigAdd = (x, z) => {
      const k = Math.floor(x / BIG_GAP) * 100003 + Math.floor(z / BIG_GAP);
      let arr = bigGrid.get(k);
      if (!arr) bigGrid.set(k, (arr = []));
      arr.push(x, z);
    };
    for (let a = 0; a < 40000 && screeCount < TARGET_SCREE; a++) {
      let cx, cz, onSnow = false;
      if (screeRng() < 0.76) {
        cx = 40 + screeRng() * 250;
        cz = 40 + screeRng() * 250;
      } else {
        cx = -26 + (screeRng() - 0.5) * 290;
        cz = -256 + (screeRng() - 0.5) * 112;
        onSnow = true;
      }
      if (cx * cx + cz * cz > 328 * 328) continue;
      const w = onSnow ? northBenchFactor(cx, cz) : screeFactor(cx, cz);
      if (w < 0.24) continue;
      if (screeRng() > (onSnow ? 0.30 : 0.75) * w) continue;

      /* Rocks come in CLUSTERS, not as a uniform sprinkle. Talus is what a
       * bench riser has shed: a spill of blocks with bare ground between the
       * spills. A uniform scatter at the same count reads as gravel texture
       * and disappears into the tussock, which is exactly what the first cut
       * of this pass did. */
      const n = onSnow ? 1 + ((screeRng() * 3) | 0) : 3 + ((screeRng() * 7) | 0);
      const spread = onSnow ? 5 : 3.2 + screeRng() * 4.5;
      for (let k = 0; k < n && screeCount < TARGET_SCREE; k++) {
        const x = cx + (screeRng() - 0.5) * spread * 2;
        const z = cz + (screeRng() - 0.5) * spread * 2;
        const h = terrain.heightFast(x, z);
        const slope = terrain.slopeFast(x, z);
        if (slope > 1.35) continue;
        const big = screeRng();
        /* `sc` is rolled exactly as before; only its CLASS is reconsidered.
         *
         * BLOCK_SC is derived, not guessed: the rock geometry is a unit
         * icosahedron, collision.js takes radius = boundingSphere * scale *
         * 0.82 and calls anything from 0.60 m up a blocking sphere, so a block
         * starts blocking at scale 0.60/0.82 = 0.732. Keying the spacing rule
         * on the bucket split (1.05) instead — as the first cut did — left
         * every block between 0.73 and 1.05 free to fuse, and demoted the rest
         * to a size that still blocked; it returned 141 cells of the 681
         * needed. The demoted size sits just UNDER the threshold so the rubble
         * still reads as chunky rock (~1.4 m across) you can step over. */
        const BLOCK_SC = 0.732;
        let sc = (onSnow ? 0.95 : 0.60) + big * big * (onSnow ? 2.9 : 2.7);
        if (sc >= BLOCK_SC) {
          if (bigTooClose(x, z)) sc = 0.66 + big * 0.06;   // 0.66..0.72: steppable
          else bigAdd(x, z);
        }
        const v = Math.min(2, (screeRng() * 3) | 0);
        placed[v][sc < 1.05 ? 0 : 1].push({
          x, z, y: h - sc * 0.30,
          yaw: screeRng() * Math.PI * 2,
          sc, s: sc, sy: sc * (0.55 + screeRng() * 0.55),
          tx: (screeRng() - 0.5) * 0.6, tz: (screeRng() - 0.5) * 0.6,
          tint: onSnow ? 0.80 + screeRng() * 0.28 : 0.66 + screeRng() * 0.32,
        });
        screeCount++;
      }
    }
    this.rockCount = count + screeCount;
    this.screeRockCount = screeCount;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const eul = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();

    for (let v = 0; v < 3; v++) {
      for (let size = 0; size < 2; size++) {
        const list = placed[v][size];
        if (!list.length) continue;
        const mesh = new THREE.InstancedMesh(variants[v], mat, list.length);
        for (let i = 0; i < list.length; i++) {
          const it = list[i];
          pos.set(it.x, it.y, it.z);
          eul.set(it.tx, it.yaw, it.tz);
          q.setFromEuler(eul);
          scl.set(it.s, it.sy, it.s);
          m.compose(pos, q, scl);
          mesh.setMatrixAt(i, m);
          col.setScalar(it.tint);
          mesh.setColorAt(i, col);
        }
        mesh.name = `rocks-${size ? 'big' : 'small'}-${v}`;
        mesh.castShadow = size === 1; // small scatter rocks don't cast
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        this.group.add(mesh);
      }
    }
  }
  /* ------------------------------ fog pockets -----------------------------
   * Ground mist lying in the forest hollows. `world-light` owns the ATMOSPHERE
   * (aerial perspective, height fog, weather) and this lane must not touch it,
   * so these are not fog at all: they are three stacked soft-edged discs per
   * pocket, drawn as ONE instanced mesh, parked in the local low points of the
   * NE stand. That is what makes the forest read as its own place from the
   * ridge — a stand of trees with nothing between the trunks looks like a park.
   *
   * Cost: one draw call, no shadow pass, no depth write, and the discs are
   * sized so a pocket is a 20-30 m patch rather than a wall of alpha.
   */
  _bakeMistTexture(N = 128) {
    const data = new Uint8Array(N * N * 4);
    const c = (N - 1) * 0.5;
    const nz = new SimplexNoise(881);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const dx = (i - c) / c, dy = (j - c) / c;
        const r = Math.sqrt(dx * dx + dy * dy);
        // soft core, ragged edge: the noise breaks the circle so a pocket does
        // not read as a saucer
        const nn = nz.fbm(i * 0.035, j * 0.035, 3) * 0.5 + 0.5;
        let a = (1 - SS(r, 0.12, 1.0)) * (0.45 + 0.75 * nn);
        a = a < 0 ? 0 : a > 1 ? 1 : a;
        const o = (j * N + i) * 4;
        data[o] = 255; data[o + 1] = 255; data[o + 2] = 255;
        data[o + 3] = (a * 255) | 0;
      }
    }
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  }

  _buildFogPockets() {
    const terrain = this.ctx.terrain;
    const rng = mulberry32(7731);
    const spots = [];
    for (let a = 0; a < 7000 && spots.length < 30; a++) {
      const x = 150 + (rng() - 0.5) * 250;
      const z = -120 + (rng() - 0.5) * 240;
      if (x * x + z * z > 320 * 320) continue;
      if (forestFactor(x, z) < 0.45) continue;
      const h = terrain.heightFast(x, z);
      /* A HOLLOW, measured as "below the ground around it" rather than "below
       * it on all four bearings": the strict four-way test found 8 pockets in
       * the whole sector, because a 14 m stencil on this heightfield almost
       * always has one neighbour lower. The mean of the ring is the basin
       * test that actually describes where cold air pools. */
      const ring = (terrain.heightFast(x + 15, z) + terrain.heightFast(x - 15, z)
        + terrain.heightFast(x, z + 15) + terrain.heightFast(x, z - 15)
        + terrain.heightFast(x + 11, z + 11) + terrain.heightFast(x - 11, z - 11)) / 6;
      if (h > ring - 0.22) continue;
      if (terrain.slopeFast(x, z) > 0.34) continue;
      let near = false;
      for (let i = 0; i < spots.length; i++) {
        const dx = spots[i][0] - x, dz = spots[i][1] - z;
        if (dx * dx + dz * dz < 680) { near = true; break; }
      }
      if (near) continue;
      spots.push([x, z, h]);
    }
    this.fogPocketCount = spots.length;
    if (!spots.length) return;

    this._mistTex = this._bakeMistTexture(128);
    const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: this._mistTex,
      color: 0xcdd6dc,
      transparent: true,
      depthWrite: false,
      opacity: 0.34,
      side: THREE.DoubleSide,
      fog: true,
    });
    const uT = this._uTime;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uT;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `
          vec3 transformed = ( instanceMatrix * vec4( position, 1.0 ) ).xyz;
          {
            vec3 iOrigin = instanceMatrix[3].xyz;
            float ph = iOrigin.x * 0.21 + iOrigin.z * 0.17;
            transformed.x += sin(uTime * 0.08 + ph) * 1.6;
            transformed.z += cos(uTime * 0.063 + ph * 1.3) * 1.4;
            transformed.y += sin(uTime * 0.11 + ph * 0.7) * 0.18;
          }
        `)
        .replace('#include <project_vertex>', `
          vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
          gl_Position = projectionMatrix * mvPosition;
        `)
        .replace('#include <worldpos_vertex>', `
          vec4 worldPosition = modelMatrix * vec4( transformed, 1.0 );
        `);
    };
    this.ctx.environment?.registerMaterial?.(mat);

    const LAYERS = 3;
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length * LAYERS);
    let n = 0;
    for (const sp of spots) {
      for (let l = 0; l < LAYERS; l++) {
        const w = (17 + rng() * 15) * (1 - l * 0.16);
        _v3.set(sp[0] + (rng() - 0.5) * 6, sp[2] + 0.55 + l * 0.85, sp[1] + (rng() - 0.5) * 6);
        _eul.set(0, rng() * Math.PI * 2, 0);
        _q.setFromEuler(_eul);
        _scl.set(w, 1, w * (0.72 + rng() * 0.5));
        _m4.compose(_v3, _q, _scl);
        mesh.setMatrixAt(n++, _m4);
      }
    }
    mesh.count = n;
    mesh.name = 'forest-mist';
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 3;
    /* The one new draw call this lane adds, and it is frustum-culled: the
     * pockets all sit inside the NE stand, so `computeBoundingSphere()` gives
     * three's culler a real sphere and the call disappears on every bearing
     * that is not looking into the forest. A21 is 8 over its budget on
     * `machine-rig`'s account; this lane does not get to add to that bill. */
    mesh.computeBoundingSphere();
    mesh.frustumCulled = true;
    this.group.add(mesh);
  }


  /**
   * Full teardown (round-4 memory rule). Nothing calls this today — the
   * vegetation lives for the session — but every runtime object this lane
   * creates has to have a disposal path, and this one owns the largest GPU
   * allocation in the world: ~18 pooled chunk meshes with dynamic instance
   * buffers, four baked card atlases, the impostor textures and the mist map.
   */
  dispose() {
    const seen = new Set();
    this.group.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh && !o.isPoints) return;
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || seen.has(m)) continue;
        seen.add(m);
        for (const k of ['map', 'alphaMap', 'normalMap', 'emissiveMap']) {
          const t = m[k];
          if (t && !seen.has(t)) { seen.add(t); t.dispose(); }
        }
        m.dispose();
      }
    });
    for (const t of [this._tuftTex, this._mistTex]) {
      if (t && !seen.has(t)) { seen.add(t); t.dispose(); }
    }
    this.props?.dispose?.();
    this.group.parent?.remove(this.group);
    this.group.clear();
    this._pools = [];
    this._treeGroups = null;
    this._tuftTex = this._mistTex = null;
  }

  /* ------------------------------- runtime ------------------------------- */

  /** Coherent gust strength 0..1 at world (x,z), matches the shader field. */
  windAt(x, z, t = this._uTime.value) {
    const w = this.windDir;
    const g = Math.sin((x * w.x + z * w.y) * 0.06 - t * 1.65)
      + 0.55 * Math.sin((x * -w.y + z * w.x) * 0.021 + t * 0.53)
      + 0.30 * Math.sin(t * 0.95 + x * 0.013);
    return THREE.MathUtils.clamp(g * 0.5 + 0.5, 0, 1);
  }

  /**
   * `stealth-grass-interaction`. Four displacer slots: the player always owns
   * slot 0, the three machines nearest the camera take 1..3. Strength rises in
   * ~0.15 s and decays in ~0.6 s while the slot HOLDS its last position — that
   * decay is the spring-back, and it costs one uniform write per slot.
   */
  _updateActors(dt) {
    const slots = this.displacers;
    for (let i = 0; i < 4; i++) slots[i].live = false;

    const p = this.ctx.player;
    if (p && p.position) {
      const s = slots[0];
      s.live = true; s.x = p.position.x; s.z = p.position.z;
      s.r = (p.crouching || p.crouched) ? 1.05 : 1.35;
    }

    const list = this.ctx.machines?.list;
    if (list && list.length) {
      const cam = this.ctx.camera.position;
      // three nearest live machines within 60 m — an explicit 3-slot ladder,
      // no sort and no allocation
      let m0 = null, m1 = null, m2 = null;
      let d0 = Infinity, d1 = Infinity, d2 = Infinity;
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (!m || m.alive === false || !m.position) continue;
        const ex = m.position.x - cam.x, ez = m.position.z - cam.z;
        const dd = ex * ex + ez * ez;
        if (dd > 3600) continue;
        if (dd < d0) { m2 = m1; d2 = d1; m1 = m0; d1 = d0; m0 = m; d0 = dd; }
        else if (dd < d1) { m2 = m1; d2 = d1; m1 = m; d1 = dd; }
        else if (dd < d2) { m2 = m; d2 = dd; }
      }
      const near3 = this._near3 || (this._near3 = [null, null, null]);
      near3[0] = m0; near3[1] = m1; near3[2] = m2;
      for (let k = 0; k < 3; k++) {
        const m = near3[k];
        if (!m) continue;
        const s = slots[k + 1];
        s.live = true; s.x = m.position.x; s.z = m.position.z;
        s.r = THREE.MathUtils.clamp((m.bodyRadius || 1.2) * 1.7, 1.6, 5.5);
      }
    }

    const u = this._uActors.value;
    for (let i = 0; i < 4; i++) {
      const s = slots[i];
      const rate = s.live ? 8.0 : 1.7;
      s.s += ((s.live ? 1 : 0) - s.s) * Math.min(1, rate * dt);
      if (s.s < 0.004) s.s = 0;
      u[i].set(s.x, s.z, s.r, s.s * 0.62);
    }
  }

  update(dt, t) {
    this._uTime.value = t;
    this._updateButterflies(t);
    const p = this.ctx.player; // built after us; lazy lookup
    if (p) this.gustLevel = this.windAt(p.position.x, p.position.z, t);
  }

  /**
   * Once per rendered frame: follow the camera with the pooled grass tiers,
   * re-sort the tree LODs when it has moved far enough, and step the grass
   * displacers. `realDt` is unscaled, so hitstop and Concentration do not
   * freeze the spring-back half-way.
   */
  interpolate(_alpha, realDt) {
    const cam = this.ctx.camera.position;
    this._updateActors(Math.min(0.1, realDt || 0.016));

    const dx = cam.x - this._camX, dz = cam.z - this._camZ;
    const moved2 = dx * dx + dz * dz;
    if (moved2 > 4) {
      this._camX = cam.x; this._camZ = cam.z;
      for (let i = 0; i < this._pools.length; i++) {
        this._assignPool(this._pools[i], cam.x, cam.z);
      }
    }
    /**
     * TELEPORT. A fast travel, a gate staging a shot or a studio jump moves the
     * lens further in one frame than the whole near ring is wide, so EVERY
     * chunk is stale at once. Trickling that in at a few ms a frame leaves the
     * player standing on bald ground for seconds (worse on a contended box,
     * where the budget buys a third as many frames). Pay for the near tier in
     * one 220 ms hitch — a teleport already costs a fade — and let the mid tier
     * catch up on a raised budget behind it.
     */
    if (moved2 > 24 * 24 && this._primed) {
      let guard = 0;
      while (!this._nearPool.done && guard++ < 32) this._pumpPool(this._nearPool, 1e6);
      this._catchUp = 40;
    }
    // Scatter budget: generous until the first full ring exists (the loading
    // bar is still up), then 4 ms so a boundary crossing costs no frame — and
    // 12 ms while a teleport's mid ring is still coming in.
    let budget = this._primed ? (this._catchUp > 0 ? 12 : 4) : 40;
    if (this._catchUp > 0) this._catchUp--;
    for (let i = 0; i < this._pools.length && budget > 0; i++) {
      budget = this._pumpPool(this._pools[i], budget);
    }
    if (!this._primed && this._nearPool.done && this._midPool.done) {
      this._primed = true;
    }
    if (this._nearPool.done && this._midPool.done) {
      this.grassCount = this._nearPool.instances + this._midPool.instances;
    }
    this._resortTrees(cam.x, cam.z);
  }
}
