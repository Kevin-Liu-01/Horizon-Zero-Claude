/**
 * CALIMA — one NPC archetype, built like Brea (settlements; R56 "UBC body, face displacement field +
 * paint from the face library, separate hair or headwrap with live dyn_ chains, layered faction outfit,
 * the same skin and eye treatment"; recipe order = tools/build/recipes/brea.mjs `build`, kit API =
 * docs/ROUND5-CHARACTER-ART.md §3). Node only, deterministic.
 *
 * MALE BODIES. The kit's numbers are in the female pack's bind frame (its eyes at y 1.657). A male head
 * is the same head 42 mm higher, so male geometry goes through the kit 42 mm down, every chain and
 * prop point is authored in the same frame, and all of it comes back up at the end. The skeleton never
 * moves.
 *
 * OUTPUT public/models/npc/<id>.glb: ONE skeleton (UBC 65 joints + the person's dyn_ chains + prop
 * joints) and the tiers, each on that skeleton:
 *   Skin_L0  Hair_L0  Outfit_L0     near   <= 20 k tris, 3 draws (skin 1024² atlas of its own; hair +
 *                                          outfit materials are the shared atlases, resolved at spawn)
 *   Skin_L1  Outfit_L1              18-35 m <= 8 k, 2 draws (the wrap's shell folded into the outfit)
 *   Skin_L2  Outfit_L2              beyond  <= 4 k, 2 draws
 *   Caster                          the one shadow proxy (no main pass, one draw per cascade)
 */
import path from 'node:path';
import * as THREE from 'three';
import { joinPrimitives } from '@gltf-transform/functions';
import {
  srcRoot, UBC_DIR, HAIR_DIR, MCO_DIR, readGltf, cleanDoc, nodeByName, graft, addChain, jointIndex,
  findLandmarks, GRADED, faceField, applyField, recomputeNormals, refineEdges, smoothNormals, smoothPositions, smooth, noise3, profileMask, iou, writeSkinned,
} from './kit/face.mjs';
import { relayoutSkinUV, eyeOpening, TriGrid, triSoup, creases, colourZones, scarSeam } from './kit/skin.mjs';
import { WRAP_ATLAS, headForm, clothStack, ribbon, ellipsoidForm, underShell, clothTail, vertexAO, rng } from './kit/wrap.mjs';
import { woundHeadwrap, joinGeos, DEG, rising, compactGeo } from './kit/wrap-head.mjs';
import { lashCard, scatterAnchors, coilCards, coilField, coilSampler, hairlineLayer, coilTuft } from './kit/hair.mjs';
import {
  humanDensity, vertexWeightOf, eyeCentres, eyeFrontZ, movedMask, browLines, remapEyeUV, primFromGeo,
  cullUnderWrap, cullEyeBacks, simplifyHands, compactPrim, scalpCards, paintHumanSkin, hairBandUnderHem, corneaDome, leanInwardNormals, tuckUnderCloth, appendCollarSkirt, hairShape,
} from './kit/skin-human.mjs';
import { emptyGeo, primToGeo, compact, join, filterTris, clipAbsX, clipTopY, soupOf, simplify, simplifySloppy, nearestSkin, dye, lin, tris, recomputeGeoNormals } from './geo.mjs';
import { ATLAS, uvRect, mcoUV, NEUTRAL, HAIR_NEUTRAL } from './atlas.mjs';
import { OUTFITS } from './outfits.mjs';

const SEX = {
  F: { file: 'Superhero_Female_FullBody.gltf', body: 'Superhero_Female', browMat: 'MI_Hair_2', skinMat: 'MI_Superhero_Female', guide: 'Hair_BuzzedFemale.gltf', dy: 0 },
  M: { file: 'Superhero_Male_FullBody.gltf', body: 'SuperHero_Male', browMat: 'MI_Hair_1', skinMat: 'MI_Superhero_Male', guide: 'Hair_Buzzed.gltf', dy: 0.0425 },
};
const FEMALE_RAW = 1.775;   // the female pack's bbox, soles to crown (metres)

const shiftPrim = (prim, dy) => {
  if (!dy) return;
  const P = prim.getAttribute('POSITION'), a = Float32Array.from(P.getArray());
  for (let i = 1; i < a.length; i += 3) a[i] += dy;
  P.setArray(a);
};
const bbox = (prim) => {
  const P = prim.getAttribute('POSITION'), p = [0, 0, 0], min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (let i = 0; i < P.getCount(); i++) { P.getElement(i, p); for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); } }
  return { min, max };
};

/* ==================================================================== the face */

/**
 * The shared refinements (what made Brea's stock head not read as stock: alae in, a tip with a plane,
 * one mandible line, a neck with body, ears back), then the archetype's own vectors at the landmarks.
 * Asymmetry comes from the seed, so no two faces are mirror-true in the same way.
 */
function faceBumps(spec, L, mm, S, R) {
  const bumps = [];
  const B = (at, d, s, ax = null) => bumps.push({ at, d: d.map(mm), s: s / S, ...(ax ? { sx: ax[0] / S, sy: ax[1] / S, sz: ax[2] / S } : {}) });
  const F = spec.face;
  const mir = (v) => [-v[0], v[1], v[2]];
  B(L.noseBridge, F.noseBridge, 0.0125, [0.0088, 0.019, 0.016]);
  B(L.noseTip, F.noseTip, 0.0098, [0.0125, 0.0095, 0.012]);
  const cs = F.cheekS ?? 0.0165;
  B(L.cheekL, F.cheek, cs); B(L.cheekR, mir(F.cheek), cs);
  B(L.jawL, F.jaw, 0.0235); B(L.jawR, mir(F.jaw), 0.0235);
  B(L.chin, F.chin, 0.016, [0.0175, 0.0125, 0.016]);
  B(L.brow, F.brow, 0.0165);
  const bk = F.brow[2] * 0.78;
  B([L.brow[0] + 0.032, L.brow[1] - 0.004, L.brow[2] - 0.016], [0.6, 0.4, bk], 0.014);
  B([L.brow[0] - 0.032, L.brow[1] - 0.004, L.brow[2] - 0.016], [-0.6, 0.4, bk], 0.014);
  B(L.upperLip, F.upperLip, 0.0085);
  const ty = L.noseTip[1], tz = L.noseTip[2];
  B([0.0175, ty - 0.003, tz - 0.022], [-3.0, 1.3, -1.0], 0.0088);
  B([-0.0175, ty - 0.003, tz - 0.022], [3.0, 1.3, -1.0], 0.0088);
  B([0.0105, ty + 0.018, tz - 0.024], [-1.2, 0, -0.4], 0.0085);
  B([-0.0105, ty + 0.018, tz - 0.024], [1.2, 0, -0.4], 0.0085);
  for (const sx of [1, -1]) B([sx * 0.0105, ty - 0.004, tz - 0.007], [-sx * 2.0, 0.3, -0.9], 0.0062);
  for (const sx of [1, -1]) B([sx * 0.0165, ty - 0.006, tz - 0.02], [-sx * 1.1, 0.4, -0.2], 0.0062);
  B([0, ty + 0.0105, tz - 0.004], [0, 0, -0.8], 0.0058);
  B([0, ty - 0.0085, tz - 0.009], [0, 1.1, -0.7], 0.0058);
  // Brea's fix round 1 (R54, "the nose is a ball"), the same on every stock nose: the lobule narrows to a defined tip and the
  // alar lobules slim, across only, then a small point at the front of the lobule and its round underside tucked up and back
  for (const sx of [1, -1]) {
    B([sx * 0.0074, ty - 0.0015, tz - 0.0035], [-sx * 1.25, 0, 0], 0.0052);
    B([sx * 0.0185, ty - 0.0075, tz - 0.023], [-sx * 1.5, 0, 0], 0.0072);
  }
  B([0, ty + 0.0012, tz + 0.0008], [0, 0.25, 0.55], 0.0042);
  B([0, ty - 0.0058, tz - 0.0028], [0, 0.55, -0.5], 0.0048);
  // and her soft hollow under each cheekbone (R54, "wide and flat"): the bone reads as a plane over a shaded fall to the jaw. A
  // young face keeps its fullness (the adolescent's read is round cheeks), the years take more
  const hollow = spec.adolescent ? 0.15 : 0.7 + 0.5 * smooth(35, 70, spec.age);
  for (const sx of [1, -1]) B([sx * 0.052, 1.597, 0.036], [-sx * 3.4 * hollow, 0.2 * hollow, -1.4 * hollow], 0.0135);
  for (const sx of [1, -1]) {
    B([sx * 0.040, L.chin[1] + 0.012, 0.030], [sx * 1.6, -2.4, 0.2], 0.0165);
    B([sx * 0.024, L.chin[1] + 0.004, 0.066], [sx * 1.2, -1.2, 1.2], 0.0135);
  }
  const neck = spec.adolescent ? -5 : spec.sex === 'M' ? 6 : 10.5;
  for (const sx of [1, -1]) B([sx * 0.038, 1.495, -0.012], [sx * neck, 0, 0.8], 0.027);
  B([0, 1.495, 0.035], [0, 0, 3.8], 0.024);
  B([0, 1.50, -0.052], [0, 0, -3.0], 0.026);
  const my = L.upperLip[1] - 0.012, mz = L.upperLip[2] - 0.022;
  const a = (R() - 0.5) * 1.6, b = (R() - 0.5) * 1.1;
  B([0.0285, my, mz], [0.2, 0.5 + a, 0.3], 0.0058);
  B([-0.0285, my, mz], [0.35, 0.5 - a, -0.1], 0.0058);
  B([0, ty - 0.004, tz - 0.006], [b, 0, 0], 0.012);
  B([0.036, L.brow[1] + 0.006, L.brow[2] - 0.02], [0, 0.5 * Math.sign(a || 1), 0], 0.012);
  for (const sx of [1, -1]) {
    B([sx * 0.0795, 1.655, -0.04], [-sx * 3.2, 0, 0], 0.017);
    B([sx * 0.0735, 1.598, -0.012], [-sx * 3.0, 3.0, 0.4], 0.0075);
  }
  // age: the mouth corners and the jowls come down; a young face stays full under the eyes
  const old = smooth(45, 70, spec.age);
  if (old > 0) {
    for (const sx of [1, -1]) {
      B([sx * 0.0345, my - 0.002, mz - 0.006], [sx * 0.3, -2.4 * old, -0.4 * old], 0.0072);
      B([sx * 0.05, L.chin[1] + 0.016, 0.052], [sx * 2.0 * old, -3.2 * old, 0.2], 0.014);
    }
  }
  return bumps;
}

/** Lid droop by age; the lower lid rises a touch (the same pass Brea's recipe does at a fixed amount). */
function shapeLids(prim, { eyes, headW, mm, drop, lower = 0.5 }) {
  const P = prim.getAttribute('POSITION'), a = Float32Array.from(P.getArray());
  for (let i = 0; i < P.getCount(); i++) {
    const x = a[i * 3], y = a[i * 3 + 1], z = a[i * 3 + 2];
    const e = eyes[x > 0 ? 0 : 1];
    const dx = (x - e[0]) / 0.0235, dy = y - e[1];
    if (Math.abs(dx) > 1 || z < 0.05 || headW[i] < 0.5) continue;
    const xk = 1 - dx * dx * dx * dx;
    if (dy > 0.0015 && dy < 0.019) {
      const k = xk * (1 - smooth(0.0055, 0.0165, dy));
      a[i * 3 + 1] -= mm(drop) * k; a[i * 3 + 2] += mm(0.22) * k;
    } else if (dy < -0.0015 && dy > -0.014) {
      const k = xk * (1 - smooth(0.005, 0.0125, -dy));
      a[i * 3 + 1] += mm(lower) * k;
    }
  }
  P.setArray(a);
}

/* ================================================================ paint layers */

/** The years, in 3-D, on top of the standard face layers. */
function ageLayers({ L, eyes, age }) {
  const layers = [];
  const old = smooth(30, 70, age);
  const list = [];
  const browY = L.brow[1], browZ = L.brow[2];
  if (age >= 28) {
    // forehead lines
    const n = age > 55 ? 4 : age > 38 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const y = browY + 0.018 + i * 0.0105;
      const zc = browZ - 0.004 - i * 0.003;
      list.push({ pts: [[-0.052, y - 0.002, zc - 0.03], [-0.02, y + 0.0015, zc - 0.006], [0.02, y - 0.0005, zc - 0.006], [0.052, y + 0.001, zc - 0.03]], w: 0.0011 + 0.0007 * old, depth: 0.00018 + 0.0003 * old, dark: 0.08 + 0.13 * old });
    }
    // the frown between the brows
    for (const sx of [1, -1]) list.push({ pts: [[sx * 0.0075, browY - 0.002, browZ + 0.0015], [sx * 0.0105, browY + 0.016, browZ - 0.002]], w: 0.001 + 0.0006 * old, depth: 0.0002 + 0.0003 * old, dark: 0.09 + 0.12 * old });
  }
  if (age >= 40) {
    for (const sx of [1, -1]) {
      const e = eyes[sx > 0 ? 0 : 1];
      // bags under the eyes
      list.push({ pts: [[e[0] - sx * 0.018, e[1] - 0.0175, e[2] + 0.004], [e[0], e[1] - 0.0215, e[2] + 0.011], [e[0] + sx * 0.019, e[1] - 0.0165, e[2] - 0.004]], w: 0.0014, depth: 0.00022 + 0.0002 * old, dark: 0.09 + 0.1 * old });
      // deeper crow's feet
      const z = e[2] - 0.008;
      list.push({ pts: [[e[0] + sx * 0.0245, e[1] + 0.002, z], [e[0] + sx * 0.0345, e[1] + 0.0095, z - 0.012]], w: 0.001, depth: 0.00026, dark: 0.15 * old + 0.04 });
      list.push({ pts: [[e[0] + sx * 0.0255, e[1] - 0.0035, z], [e[0] + sx * 0.0355, e[1] - 0.0095, z - 0.012]], w: 0.001, depth: 0.00026, dark: 0.14 * old + 0.04 });
      // the fold deepens, a marionette line opens under the mouth corner
      const t = L.noseTip;
      // (both are folds, not lines: wide and soft, so they read as a shaded fall of the cheek and never as two scratches at the
      // mouth; the marionette fold starts under the corner, on the line the nasolabial fold would continue on)
      list.push({ pts: [[sx * 0.0215, t[1] - 0.006, t[2] - 0.034], [sx * 0.0335, t[1] - 0.028, t[2] - 0.044], [sx * 0.0385, t[1] - 0.047, t[2] - 0.052]], w: 0.0046, depth: 0.00034 + 0.00034 * old, dark: 0.07 + 0.08 * old });
      const m = L.upperLip;
      list.push({ pts: [[sx * 0.0372, m[1] - 0.02, m[2] - 0.03], [sx * 0.0392, m[1] - 0.042, m[2] - 0.036]], w: 0.0044, depth: 0.00026 + 0.00032 * old, dark: 0.04 + 0.07 * old });
    }
  }
  if (age >= 55) {
    // the neck bands, the lip's vertical lines
    for (let i = 0; i < 3; i++) { const y = 1.505 + i * 0.022; list.push({ pts: [[-0.05, y + 0.006, 0.03], [0, y, 0.058], [0.05, y + 0.006, 0.03]], w: 0.002, depth: 0.0003, dark: 0.12 }); }
    for (let i = 0; i < 6; i++) { const x = (i - 2.5) * 0.0062; const m = L.upperLip; list.push({ pts: [[x, m[1] + 0.006, m[2] - 0.002 - Math.abs(x) * 0.5], [x * 0.92, m[1] - 0.004, m[2] - 0.002 - Math.abs(x) * 0.5]], w: 0.00055, depth: 0.00014, dark: 0.1 }); }
  }
  if (list.length) layers.push(creases(list));
  // the colour of the years: hollow eye sockets, a sallow temple, sun on the nose + cheeks, sun spots
  const cheek = [L.cheekL[0], L.cheekL[1], L.cheekL[2]];
  const zones = [];
  if (old > 0.05) {
    for (const sx of [1, -1]) {
      const e = eyes[sx > 0 ? 0 : 1];
      zones.push({ at: [e[0], e[1] + 0.001, e[2] + 0.004], s: [0.024, 0.018, 0.02], gain: [1 - 0.14 * old, 1 - 0.17 * old, 1 - 0.15 * old] });
      zones.push({ at: [sx * 0.068, 1.685, 0.02], s: [0.018, 0.024, 0.024], gain: [1 - 0.07 * old, 1 - 0.09 * old, 1 - 0.08 * old] });
    }
    zones.push({ at: [cheek[0], cheek[1] - 0.018, cheek[2] - 0.005], s: [0.022, 0.018, 0.024], gain: [1 - 0.06 * old, 1 - 0.1 * old, 1 - 0.1 * old] });
    zones.push({ at: [-cheek[0], cheek[1] - 0.018, cheek[2] - 0.005], s: [0.022, 0.018, 0.024], gain: [1 - 0.06 * old, 1 - 0.1 * old, 1 - 0.1 * old] });
    layers.push(colourZones(zones));
  }
  if (age >= 50) {
    layers.push((T) => {
      if (T.Y < 1.45 && Math.abs(T.X) < 0.4) return;
      const n = noise3(T.X * 310, T.Y * 310, T.Z * 310), b = noise3(T.X * 46, T.Y * 46, T.Z * 46 + 7);
      const k = smooth(0.8, 0.9, n) * smooth(0.5, 0.72, b) * 0.13 * old;
      if (k <= 0) return;
      T.r *= 1 - k * 0.85; T.g *= 1 - k; T.b *= 1 - k * 1.05;
    });
  }
  return layers;
}

/** The beard: coils on the jaw, the lip and the cheek, dissolving at the edge, with a stubble halo. */
function beardLayer({ L, eyes, hair, kind }) {
  const f = coilField(192, 192, { count: 420, seed: 41, r: [2.6, 4.8], len: [8, 18], turns: [2, 3.6], strand: [0.9, 1.3] });
  const sampler = coilSampler(f, 0.048);
  const chin = L.chin, lip = L.upperLip, tip = L.noseTip;
  const mouthY = lip[1] - 0.012;
  const cov = (T) => {
    if (T.Y < 1.44 || T.Y > tip[1] + 0.02 || Math.abs(T.X) > 0.088 || T.Z < -0.03 || T.nz < -0.5) return 0;
    const ax = Math.abs(T.X);
    const wob = (noise3(T.X * 120, T.Y * 120, T.Z * 120) - 0.5) * 0.011 + (noise3(T.X * 300, T.Y * 300, T.Z * 300) - 0.5) * 0.004;
    // the upper edge: from the sideburn, in a curve under the cheekbone, down to the mouth corner
    const k = smooth(0.026, 0.075, ax);
    const top = mix(mouthY + 0.018, tip[1] - 0.006, k * k) + wob;
    const upper = 1 - smooth(top - 0.017, top + 0.003, T.Y);
    // the lower edge: under the jaw on the neck, rising toward the ear
    const low = chin[1] - 0.02 + 0.06 * smooth(0.03, 0.082, ax) + wob;
    const lower = smooth(low - 0.012, low + 0.003, T.Y);
    // it thins behind the jaw angle and stops short of the ear
    const back = smooth(-0.022, 0.012, T.Z + wob);
    // lips stay clear
    const lipD = Math.hypot(T.X / 0.031, (T.Y - mouthY) / 0.0145);
    const clear = smooth(0.92, 1.18, lipD);
    // a moustache band above the lip
    const moust = (1 - smooth(0.012, 0.026, Math.abs(T.Y - (mouthY + 0.022)))) * (1 - smooth(0.02, 0.05, ax)) * smooth(0.002, 0.006, tip[1] - 0.012 - T.Y);
    return Math.max(upper * lower * clear * back, moust);
  };
  if (kind === 'stubble') {
    return (T) => {
      const c = cov(T);
      if (c <= 0.02) return;
      const n = noise3(T.X * 1800, T.Y * 1800, T.Z * 1800);
      const k = c * (0.1 + 0.32 * smooth(0.5, 0.8, n));
      T.r *= 1 - k; T.g *= 1 - k * 1.02; T.b *= 1 - k * 1.02;
    };
  }
  const C = [parseInt(hair.slice(1, 3), 16), parseInt(hair.slice(3, 5), 16), parseInt(hair.slice(5, 7), 16)];
  const o = [0, 0], uv = [0, 0];
  return (T) => {
    const c = cov(T);
    if (c <= 0.01) return;
    uv[0] = T.X; uv[1] = T.Y + T.Z * 0.5;
    sampler(uv[0], uv[1], o);
    const hv = o[0], fine = noise3(T.X * 2400, T.Y * 2400, T.Z * 2400);
    // the shadow of the beard on the skin comes first, then the hair, dissolving through the coil field at its edge
    const under = smooth(0.05, 0.45, c), dark = mix(1, 0.56, under);
    T.r *= dark; T.g *= dark * 0.98; T.b *= dark * 0.96;
    const edge = smooth(0.3, 0.74, c + (hv - 0.42) * 0.7 + (fine - 0.5) * 0.25);
    if (edge <= 0) return;
    const k = 0.72 + 0.62 * hv + 0.16 * (fine - 0.5);
    T.r = mix(T.r, C[0] * k + 6 * hv, edge); T.g = mix(T.g, C[1] * k + 4 * hv, edge); T.b = mix(T.b, C[2] * k + 3 * hv, edge);
    T.h += edge * hv * 0.00028;
    T.rough = mix(T.rough, 0.86 + 0.1 * (1 - hv), edge);
    T.ao = mix(T.ao, Math.max(T.ao, 0.6), edge);
  };
}

const mix = (a, b, t) => a + (b - a) * t;

/** Hands and forearms in tar, ragged at its edge, glossy where it is fresh. */
const tarLayer = () => (T) => {
  const ax = Math.abs(T.X);
  if (ax < 0.34) return;
  const n = noise3(T.X * 40, T.Y * 40, T.Z * 40) * 0.6 + noise3(T.X * 110, T.Y * 110, T.Z * 110) * 0.4;
  const k = smooth(0.40, 0.52, ax + (n - 0.5) * 0.12) * (0.82 + 0.18 * n);
  T.r = mix(T.r, 15, k); T.g = mix(T.g, 13, k); T.b = mix(T.b, 15, k);
  T.rough = mix(T.rough, 0.3 + 0.35 * n, k);
  T.h += 0.00025 * k * n;
};

/** Carmine to the elbow: deepest at the fingers, blotched, in the creases of the hand. */
const carmineLayer = () => (T) => {
  const ax = Math.abs(T.X);
  if (ax < 0.36) return;
  const n = noise3(T.X * 34, T.Y * 34, T.Z * 34) * 0.55 + noise3(T.X * 120, T.Y * 120, T.Z * 120) * 0.45;
  const k = smooth(0.42, 0.66, ax + (n - 0.5) * 0.14) * (0.62 + 0.38 * smooth(0.3, 0.7, n));
  T.r = mix(T.r, 118, k); T.g = mix(T.g, 18, k); T.b = mix(T.b, 42, k);
  T.rough = mix(T.rough, 0.5, k);
};

/** A shiny burn: pale, tight, puckered at its edge. `at` centre, `r` radii. */
function burnLayer(spots) {
  return (T) => {
    for (const s of spots) {
      const d = Math.hypot((T.X - s.at[0]) / s.r[0], (T.Y - s.at[1]) / s.r[1], (T.Z - s.at[2]) / s.r[2]);
      if (d > 1.4) continue;
      const n = noise3(T.X * 170, T.Y * 170, T.Z * 170);
      const k = 1 - smooth(0.55, 1.05, d + (n - 0.5) * 0.5);
      const rim = (1 - smooth(0.0, 0.24, Math.abs(d + (n - 0.5) * 0.5 - 0.8))) * 0.5;
      T.r = mix(T.r, 168, k * 0.8); T.g = mix(T.g, 118, k * 0.8); T.b = mix(T.b, 102, k * 0.8);
      T.r *= 1 - rim * 0.25; T.g *= 1 - rim * 0.4; T.b *= 1 - rim * 0.4;
      T.rough = mix(T.rough, 0.34, k);
      T.h += 0.0003 * k * (noise3(T.X * 400, T.Y * 400, T.Z * 400) - 0.5) - 0.00035 * rim;
    }
  };
}

/* ============================================================= the heads */

/** The chain points of a person's head tail, in the female frame. */
function headTailPoints(side, len = 0.42) {
  const s = side === 'right' ? -1 : 1;
  const k = len / 0.53;
  return [[s * 0.052, 1.678, -0.116], [s * 0.095, 1.665, -0.172], [s * 0.128, 1.635 - 0.03 * k, -0.215], [s * 0.15, 1.585 - 0.06 * k, -0.245], [s * 0.168, 1.53 - 0.1 * k, -0.262], [s * 0.18, 1.46 - 0.14 * k, -0.272], [s * 0.19, 1.39 - 0.2 * k, -0.278]];
}

/** A headband: one ribbon on the head form, a small knot and a free tail, the scalp above left bare. */
function bandHead({ headSoup, skin, joint, center, lift, tailPts, tailJ, width, seed }) {
  const A = WRAP_ATLAS, W = A.W;
  const form = headForm(headSoup, { center, lift, blur: 2 });
  const stack = clothStack(form, { skin: (dx, dy, dz) => { const f = form.R(dx, dy, dz), r = skin(dx, dy, dz); return r === null ? f - lift(dx, dy, dz) : Math.min(r, f + 0.002); } });
  const uvA = (v) => ({ rect: A.clothA.rect, period: A.clothA.period, W, pxPerM: 1 / 0.00065, v });
  const parts = [];
  const add = (name, g) => { g.part = name; parts.push(g); return g; };
  add('band', ribbon(form, { n: rising(0, 11 * DEG), o0: 16 * DEG, w: width, along: 34, rowsT: [-1, -0.9, -0.4, 0.3, 0.9, 1], lift: 0.0014, pillow: 0.002, stack, bridge: 0, hemSink: 0.0022, creases: 3, creaseAmp: 0.001, seed, joint, uv: uvA([0, 1]) }));
  const k0 = tailPts[0];
  const kf = ellipsoidForm([k0[0] * 0.9, k0[1] + 0.008, k0[2] + 0.018], { r: 0.021, rAxis: 0.019, axis: [0.3, 0.8, -0.5], egg: 0.05 });
  const kst = clothStack(kf, { azN: 120, elN: 60 });
  add('knotShell', underShell(kf, { axis: [0.3, 0.8, -0.5], oMin: () => -82 * DEG, seg: 10, rings: 4, joint, W, cloth: true, uv: [A.knotFold.rect[0], A.knotFold.rect[1], A.knotFold.period, A.knotFold.rect[3]], at: (dx, dy, dz) => kf.R(dx, dy, dz) - 0.0003 }));
  add('knot', ribbon(kf, { n: [0.5, 0.6, -0.6], o0: -14 * DEG, w: 0.86, along: 10, rowsT: [-1, -0.85, -0.3, 0.3, 0.85, 1], lift: 0, pillow: 0.0011, hemSink: 0.0002, stack: kst, bridge: 0, creases: 2, creaseAmp: 0.0007, seed: seed + 1, joint, uv: { rect: A.knotFold.rect, period: A.knotFold.period, W, pxPerM: 1 / 0.0012, v: [0, 1] }, wander: 0.04 }));
  add('tail', clothTail(tailPts, tailJ, {
    along: 14, across: 3, width: (u) => 0.058 * (1 - 0.22 * u), side: [0.55, 0.65, 0.5], thick: 0.003, curl: 0.1, twist: Math.PI / 2, gather: 0.42, gatherTo: 0.3, roll: 0.5, fold: 0.005, rootBack: 0.012,
    uvFront: { rect: A.clothA.rect, period: A.clothA.period, W, pxPerM: 1 / 0.00065, v: [1, 0] },
    uvBack: { rect: A.lining.rect, period: A.lining.period, W, pxPerM: 1 / 0.0012, v: [0, 1] },
    uvEnd: A.frayEnd.rect, fray: 0.1,
  }));
  const soup = Array.from(headSoup);
  for (const g of parts) for (let t = 0; t < g.idx.length; t++) { const i = g.idx[t]; soup.push(g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]); }
  const grid = new TriGrid(new Float32Array(soup), 0.012);
  for (const g of parts) vertexAO(g, grid, { rays: 40, maxD: 0.028, floor: 0.4 });
  for (const g of parts) compactGeo(g);
  return { geo: joinGeos(parts), parts: Object.fromEntries(parts.map((g) => [g.part, g.idx.length / 3])), soup: new Float32Array(soup.slice(headSoup.length)), covers: () => false, lowEdge: () => 1, hemGap: () => Infinity, stack, form, center };
}

/** Wrap specs by kind: what differs is how much of the head it takes and how it is wound. */
function wrapSpec(kind, H, chainTail) {
  const lift = (dx, dy, dz) => 0.0028 + 0.0052 * smooth(0.0, 0.75, dy) + 0.0032 * smooth(0.1, -0.85, dz) + 0.0045 * smooth(0.62, 0.95, dy);
  const tail = { points: chainTail.points, joints: chainTail.joints, width: (u) => (H.bun ? 0.095 : 0.078) * (1 - 0.22 * u), side: [0.55, 0.65, 0.5], curl: 0.12, twist: Math.PI / 2, gather: 0.3, gatherTo: 0.36, roll: 0.6, fold: 0.0075, along: 16, across: 4, rootBack: 0.014 };
  const base = {
    // a headscarf: low on the nape, cut across the brow, two soft crossing turns
    scarf: { lift, base: { tiltDeg: 14, warpDeg: -7, lowDeg: -6, w: 0.28, lift: 0.0012 }, turns: [{ phiDeg: 68, tauDeg: 11, oDeg: 30, w: 0.24, along: 30, lift: 0.0009, pillow: 0.0028, creaseAmp: 0.0013, seed: H.seed + 1, flip: true }], knot: chainTail.points[0], tail },
    wrap: { lift, base: { tiltDeg: 18, warpDeg: -9.5, lowDeg: -2.2, w: 0.25, lift: 0.0012 }, turns: [{ phiDeg: 82, tauDeg: 14.5, oDeg: 34, w: 0.225, along: 32, lift: 0.0009, pillow: 0.0026, creaseAmp: 0.0012, seed: H.seed + 1, flip: true }, { phiDeg: -74, tauDeg: 17, oDeg: 36.5, w: 0.235, along: 28, lift: 0.0009, pillow: 0.0028, creaseAmp: 0.0012, seed: H.seed + 2 }], bun: { c: [0, 1.7605, -0.100], axis: [0, 0.70, -0.71], r: 0.0605, rAxis: 0.0685, topY: 1.82756 }, knot: chainTail.points[0], tail },
    // a rag tied low and tight: a working man's
    rag: { lift: (dx, dy, dz) => 0.0018 + 0.002 * smooth(0, 0.8, dy), base: { tiltDeg: 8, warpDeg: -5, lowDeg: 8, w: 0.32, lift: 0.001 }, turns: [{ phiDeg: 15, tauDeg: 8, oDeg: 22, w: 0.2, along: 28, lift: 0.0008, pillow: 0.002, creaseAmp: 0.0016, seed: H.seed + 1 }], knot: chainTail.points[0], tail: { ...tail, width: (u) => 0.058 * (1 - 0.25 * u) } },
    // a wool cap: full, soft, sits on the head like a bag
    cap: { lift: (dx, dy, dz) => 0.006 + 0.008 * smooth(0, 0.9, dy) + 0.006 * smooth(0.1, -0.85, dz), base: { tiltDeg: 12, warpDeg: -6, lowDeg: 4, w: 0.3, lift: 0.0014 }, turns: [{ phiDeg: 180, tauDeg: 18, oDeg: 34, w: 0.26, along: 30, lift: 0.001, pillow: 0.0036, creaseAmp: 0.0018, seed: H.seed + 1 }], knot: chainTail.points[0], tail: { ...tail, width: (u) => 0.05 * (1 - 0.3 * u) } },
  };
  return base[kind];
}

/* ================================================================== outfits */

/** Read one MCO part as a bucket in the female frame, on the base skeleton. */
async function loadPart(base, spec, SRC, dy) {
  const name = spec.from || spec.part;
  const doc = await readGltf(path.join(MCO_DIR(SRC), `${name}.gltf`));
  cleanDoc(doc);
  // meshes to take: the main body by default, the belts only on request
  for (const n of doc.getRoot().listNodes()) {
    if (!n.getMesh()) continue;
    const isBelt = /Belt/.test(n.getName());
    const want = spec.meshes ? spec.meshes.test(n.getName()) : !isBelt;
    if (!want) { n.getMesh().dispose(); n.dispose(); }
  }
  const nodes = graft(base, doc, name);
  const out = [];
  for (const n of nodes) for (const prim of n.getMesh().listPrimitives()) {
    const mat = prim.getMaterial()?.getName() || '';
    if (spec.dropMat && spec.dropMat.test(mat)) continue;
    out.push(primToGeo(prim, { dy: -dy }));
  }
  for (const n of nodes) { const m = n.getMesh(); for (const pr of m.listPrimitives()) { const mt = pr.getMaterial(); if (mt) { for (const t of [mt.getBaseColorTexture(), mt.getNormalTexture(), mt.getMetallicRoughnessTexture(), mt.getOcclusionTexture()]) t?.dispose(); mt.dispose(); } } m.dispose(); n.dispose(); }
  return join(out);
}

/* ================================================================= the build */

export async function buildNpc(spec, { file, provenance, log = () => {} }) {
  const SRC = srcRoot();
  const SX = SEX[spec.sex];
  const dy = SX.dy;
  const R = rng((spec.n * 2654435761) >>> 0);
  const base = await readGltf(path.join(UBC_DIR(SRC), SX.file));
  cleanDoc(base);
  const root = base.getRoot();
  const bodyNode = nodeByName(base, SX.body), eyesNode = nodeByName(base, 'Eyes'), browNode = nodeByName(base, 'Eyebrows');
  const bodyPrim = bodyNode.getMesh().listPrimitives()[0], eyesPrim = eyesNode.getMesh().listPrimitives()[0], browPrim = browNode.getMesh().listPrimitives()[0];
  for (const p of [bodyPrim, eyesPrim, browPrim]) shiftPrim(p, -dy);

  const box0 = bbox(bodyPrim);
  const rawBodyH = box0.max[1] - box0.min[1];
  const S = spec.height / rawBodyH;
  const mm = (v) => v / 1000 / S;

  const joints = root.listSkins()[0].listJoints().map((j) => j.getName());
  const headSet = new Set(['Head', 'neck_01'].map((n) => joints.indexOf(n)));
  let headW = vertexWeightOf(bodyPrim, headSet);
  const headPts = [];
  { const P = bodyPrim.getAttribute('POSITION'), p = [0, 0, 0]; for (let i = 0; i < P.getCount(); i++) { P.getElement(i, p); if (headW[i] > 0.5 && p[1] > 1.45) headPts.push([p[0], p[1], p[2], i]); } }
  const eyes = eyeCentres(eyesPrim);
  const eyeSphereZ = eyeFrontZ(eyesPrim) - 0.0165;
  const L = findLandmarks(headPts, eyes);
  for (const k of Object.keys(L)) if (!L[k]) throw new Error(`[npc ${spec.id}] landmark ${k} not found`);

  // ---- the face field
  const bumps = faceBumps(spec, L, mm, S, R);
  const region = (p) => smooth(1.425, 1.47, p[1]) * smooth(-0.10, -0.03, p[2]);
  const field = faceField(bumps, { rigid: eyes, r0: mm(15), r1: mm(33), region });
  const stockPos = new Float32Array(bodyPrim.getAttribute('POSITION').getArray());
  const stockN = stockPos.length / 3;
  const WIN = { y0: L.chin[1] - 0.03, y1: L.brow[1] + 0.035, z0: (eyes[0][2] + eyes[1][2]) / 2 - 0.02, z1: L.noseTip[2] + 0.03 };
  const headTri = (a, b, c) => headW[a] > 0.5 || headW[b] > 0.5 || headW[c] > 0.5;
  const stockProfile = profileMask(bodyPrim, WIN, 0.0005, headTri);
  applyField(bodyPrim, field);
  // a young face has the open eye of its age: the upper lid barely comes down and the lower one does not rise
  shapeLids(bodyPrim, { eyes, headW, mm, drop: spec.adolescent ? 0.2 : 0.72 + 1.4 * smooth(40, 70, spec.age), lower: spec.adolescent ? 0 : 0.5 });
  const moved = movedMask(bodyPrim, stockPos);
  recomputeNormals(bodyPrim, moved);
  refineEdges(bodyPrim, {
    minLen: 0.0066, maxEdges: 260,
    want: (p) => {
      const ax = Math.abs(p[0]);
      if (ax > 0.064 && p[1] > 1.585 && p[1] < 1.705 && p[2] > -0.07 && p[2] < 0.03) return true;
      if (p[1] > 1.625 && p[1] < 1.71 && ax > 0.048 && ax < 0.09 && p[2] > -0.02) return true;
      if (p[1] < 1.515 || p[1] > 1.625 || ax > 0.09 || p[2] < -0.05) return false;
      return !(p[1] > 1.565 && ax < 0.03 && p[2] > 0.07);
    },
  });
  smoothPositions(bodyPrim, {
    iters: 3,
    weight: (p) => {
      const ax = Math.abs(p[0]);
      const ear = smooth(0.068, 0.074, ax) * smooth(1.59, 1.6, p[1]) * (1 - smooth(1.70, 1.71, p[1])) * smooth(-0.075, -0.065, p[2]) * (1 - smooth(0.012, 0.024, p[2]));
      const cheek = 0.35 * smooth(0.05, 0.062, ax) * (1 - smooth(0.086, 0.092, ax)) * smooth(1.545, 1.56, p[1]) * (1 - smooth(1.66, 1.68, p[1])) * smooth(-0.01, 0.01, p[2]);
      return Math.max(ear, cheek);
    },
  });
  // the adolescent's neck: the source is a grown man's, corded with muscle; a boy's is a smooth column (the face carries the age,
  // the neck must not contradict it)
  if (spec.adolescent) {
    smoothPositions(bodyPrim, {
      iters: 8,
      weight: (p) => smooth(1.37, 1.41, p[1]) * (1 - smooth(1.495, 1.525, p[1])) * (1 - smooth(0.085, 0.11, Math.abs(p[0]))),
    });
  }
  { const P = bodyPrim.getAttribute('POSITION'), q = [0, 0, 0], m = new Uint8Array(P.getCount()); for (let i = 0; i < m.length; i++) { P.getElement(i, q); m[i] = q[1] > (spec.adolescent ? 1.36 : 1.5) ? 1 : 0; } recomputeNormals(bodyPrim, m); }
  headW = vertexWeightOf(bodyPrim, headSet);
  smoothNormals(bodyPrim, {
    iters: 6,
    weight: (p) => {
      if (p[1] < 1.47 || Math.abs(p[0]) > 0.11) return 0;
      const lid = Math.min(Math.hypot((Math.abs(p[0]) - eyes[0][0]) / 0.024, (p[1] - eyes[0][1]) / 0.0125), 1.6);
      const lip = Math.hypot(p[0] / 0.032, (p[1] - (L.upperLip[1] - 0.011)) / 0.017);
      const nose = Math.hypot(p[0] / 0.022, (p[1] - (L.noseTip[1] - 0.012)) / 0.013);
      // the ear keeps the normals the source's map was baked against (Brea's fix round 1: softened, the map printed its planes)
      const ear = smooth(0.058, 0.066, Math.abs(p[0])) * smooth(1.575, 1.59, p[1]) * (1 - smooth(1.70, 1.715, p[1])) * smooth(-0.08, -0.07, p[2]) * (1 - smooth(0.022, 0.035, p[2]));
      return smooth(0.85, 1.25, lid) * smooth(0.8, 1.2, lip) * smooth(0.75, 1.15, nose) * (1 - ear);
    },
  });
  applyField(browPrim, field);
  const eyeStock = new Float32Array(eyesPrim.getAttribute('POSITION').getArray());
  applyField(eyesPrim, field);
  let eyeMax = 0;
  { const a = eyesPrim.getAttribute('POSITION').getArray(); for (let i = 0; i < a.length; i += 3) eyeMax = Math.max(eyeMax, Math.hypot(a[i] - eyeStock[i], a[i + 1] - eyeStock[i + 1], a[i + 2] - eyeStock[i + 2])); }
  corneaDome(eyesPrim, eyes, eyeSphereZ);

  // what the field did at each landmark (the gate's reference): vectors in game mm
  const faceRec = { landmarks: {}, graded: GRADED, scale: +S.toFixed(6), dy };
  {
    const P = bodyPrim.getAttribute('POSITION'), p = [0, 0, 0];
    for (const k of Object.keys(L)) {
      let bi = -1, bd = 1e9;
      for (let i = 0; i < stockN; i++) { const d = (stockPos[i * 3] - L[k][0]) ** 2 + (stockPos[i * 3 + 1] - L[k][1]) ** 2 + (stockPos[i * 3 + 2] - L[k][2]) ** 2; if (d < bd) { bd = d; bi = i; } }
      P.getElement(bi, p);
      const v = [(p[0] - stockPos[bi * 3]) * S * 1000, (p[1] - stockPos[bi * 3 + 1]) * S * 1000, (p[2] - stockPos[bi * 3 + 2]) * S * 1000];
      faceRec.landmarks[k] = { v: v.map((x) => +x.toFixed(2)), deltaMm: +Math.hypot(...v).toFixed(2) };
    }
    faceRec.graded6mm = GRADED.filter((k) => faceRec.landmarks[k].deltaMm >= 6).length;
    faceRec.iou = +iou(stockProfile, profileMask(bodyPrim, WIN, 0.0005, headTri)).toFixed(4);
    faceRec.eyeSocketMaxMm = +(eyeMax * S * 1000).toFixed(3);
  }

  // ---- guides: the stock brows and hair shell are read, not shipped
  const brows = browLines(browPrim);
  // each person's own brow weight (the stock card is one heavy brow for every face): a thinner line for the young and the old
  const browK = spec.browK ?? 1;
  if (browK !== 1) for (const sd of [1, -1]) { const f = brows[sd].line; brows[sd].line = (x) => { const r = f(x); return { y: r.y + (1 - browK) * 0.0012, half: Math.max(0.0012, r.half * browK) }; }; }
  const hairDoc = await readGltf(path.join(HAIR_DIR(SRC), SX.guide));
  cleanDoc(hairDoc);
  const hairNodes = graft(base, hairDoc, 'guide');
  const guidePrim = hairNodes[0].getMesh().listPrimitives()[0];
  shiftPrim(guidePrim, -dy);
  applyField(guidePrim, field);
  const shellGrid = new TriGrid(new Float32Array(triSoup(guidePrim)), 0.016);

  // ---- chains and props are authored in the female frame and live on the true skeleton
  const chainTable = [];
  const chain = (key, parent, points) => {
    const names = points.map((_, i) => (i === points.length - 1 ? `dyn_${key}_end` : `dyn_${key}_${String(i + 1).padStart(2, '0')}`));
    const idx = addChain(base, names, points.map((p) => [p[0], p[1] + dy, p[2]]), parent);
    chainTable.push({ key, root: names[0], parent, links: points.length - 1 });
    return idx.slice(0, -1);
  };
  const propTable = [];
  const prop = (name, parent, at, tip) => {
    const idx = addChain(base, [name, `${name}_end`], [[at[0], at[1] + dy, at[2]], [tip[0], tip[1] + dy, tip[2]]], parent);
    propTable.push({ name, parent });
    return idx[0];
  };
  const J = {};
  for (const n of ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'clavicle_l', 'clavicle_r', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'hand_l', 'hand_r', 'upperarm_l', 'upperarm_r']) J[n] = jointIndex(base, n);

  // ---- body vertices for nearest-skin: the kit's triangles + weights in the female frame
  const skinJ = bodyPrim.getAttribute('JOINTS_0'), skinW = bodyPrim.getAttribute('WEIGHTS_0');
  const P0 = bodyPrim.getAttribute('POSITION');
  const nearV = [];
  { const q = [0, 0, 0]; for (let i = 0; i < P0.getCount(); i++) { P0.getElement(i, q); nearV.push(q[0], q[1], q[2], i); } }
  const skinNear = nearestSkin(nearV, skinJ, skinW);

  // ---- the outfit: MCO parts, then the faction pieces on top
  const OUT = OUTFITS[spec.outfit.key];
  const pieces = [];   // { geo, dye, hide, noHide, shade, prop }
  let armPose = null;
  for (const ps of OUT.parts) {
    let g = await loadPart(base, ps, SRC, dy);
    if (ps.cutX) g = clipAbsX(g, ps.cutX);
    if (ps.cutTop) g = clipTopY(g, ps.cutTop);
    // the source UV -> the faction block, or a swatch for a part from another family
    if (ps.swatch) {
      const r = uvRect(ps.swatch);
      const n = g.pos.length / 3;
      for (let i = 0; i < n; i++) { const x = g.pos[i * 3], y = g.pos[i * 3 + 1], z = g.pos[i * 3 + 2]; const az = Math.atan2(x, z + 0.02); g.uv[i * 2] = r[0] + ((az / (2 * Math.PI) + 0.5) * 3 % 1) * r[2]; g.uv[i * 2 + 1] = r[1] + (((y * 3.2) % 1 + 1) % 1) * r[3]; }
    } else {
      const n = g.pos.length / 3;
      for (let i = 0; i < n; i++) { const q = mcoUV(g.uv[i * 2], g.uv[i * 2 + 1]); g.uv[i * 2] = q[0]; g.uv[i * 2 + 1] = q[1]; }
    }
    // a superhero neck in a regular collar: the collar stands off it
    if (ps.collar) {
      const n = g.pos.length / 3;
      for (let i = 0; i < n; i++) {
        const x = g.pos[i * 3], y = g.pos[i * 3 + 1], z = g.pos[i * 3 + 2];
        const k = smooth(ps.collar.y0, ps.collar.y0 + 0.035, y);
        if (k <= 0) continue;
        const dx = x, dz = z + 0.012, l = Math.hypot(dx, dz) || 1;
        g.pos[i * 3] = x + dx / l * ps.collar.push * k; g.pos[i * 3 + 2] = z + dz / l * ps.collar.push * k;
      }
    }
    const before = tris(g);
    if (ps.target && before > ps.target) g = await simplify(g, ps.target, { err: 0.018, lock: true });
    pieces.push({ geo: g, dye: ps.dye, hide: !ps.noHideOnBody, shade: ps.shade ?? 1, part: ps.part, cut: ps.cutX, cuff: ps.cuff });
    log(`  part ${ps.part}: ${before} -> ${tris(g)}`);
  }
  let gridCache = null;
  const invalidate = () => { gridCache = null; };
  const bodySoup = triSoup(bodyPrim);
  const gridOf = () => {
    if (gridCache) return gridCache;
    const soup = Array.from(bodySoup);
    for (const p of pieces) if (!p.noHide && !p.prop) soupOf(p.geo, soup);
    gridCache = new TriGrid(new Float32Array(soup), 0.02);
    return gridCache;
  };
  const uvOf = (name) => { const r = uvRect(name); return (q) => [r[0] + Math.max(0, Math.min(1, q[0])) * r[2], r[1] + Math.max(0, Math.min(1, q[1])) * r[3]]; };
  const ctx = {
    J, grid: gridOf, skinNear, chain, prop,
    add(g, o = {}) { const list = Array.isArray(g) ? g : [g]; for (const q of list) pieces.push({ geo: q, dye: o.dye, hide: !!o.hide, noHide: !!o.noHide, shade: o.shade ?? 1, prop: o.prop || null }); invalidate(); },
    uvOf,
    rectUV: (name) => { const r = uvRect(name); return (u, v) => [r[0] + u * r[2], r[1] + v * r[3]]; },
    palm: (side) => { const c = side === 'r' ? base.getRoot().listSkins()[0].listJoints()[J.hand_r] : base.getRoot().listSkins()[0].listJoints()[J.hand_l]; const w = c.getWorldMatrix(); return [w[12] + (side === 'r' ? -0.072 : 0.072), w[13] - dy - 0.024, w[14] + 0.02]; },
    armPose(o) { armPose = solveArmPose(base, o, dy); },
  };
  OUT.pieces(ctx);
  // the cuffs need the cut geometry
  for (const q of pieces.slice()) if (q.cuff && q.cut) {
    for (const s of [1, -1]) {
      const n = q.geo.pos.length / 3;
      const r = uvRect('linen');
      const { cuff } = await import('./pieces.mjs');
      const g = cuff({ geo: q.geo, sgn: s, xCut: q.cut, uv: (w) => [r[0] + w[0] * r[2], r[1] + w[1] * r[3]] });
      if (g) pieces.push({ geo: g, dye: q.cuff, hide: false, shade: 1 });
      void n;
    }
  }
  invalidate();
  const outfitBodyTris = () => { const s = []; for (const p of pieces) if (p.hide) soupOf(p.geo, s); return new Float32Array(s); };

  // ---- the head
  const H = spec.head;
  const head = J.Head;
  const skinCenter = [0, 1.672, -0.012];
  const isEar = (p) => Math.abs(p[0]) > 0.0735 && p[1] < 1.70 && p[2] < 0.03;
  const headKeep = (() => {
    const P = bodyPrim.getAttribute('POSITION'), p = [0, 0, 0], ear = new Uint8Array(P.getCount());
    for (let i = 0; i < ear.length; i++) { P.getElement(i, p); ear[i] = isEar(p) ? 1 : 0; }
    return (a, b, c) => (headW[a] > 0.5 || headW[b] > 0.5 || headW[c] > 0.5) && !(ear[a] || ear[b] || ear[c]);
  })();
  const headSoup = new Float32Array(triSoup(bodyPrim, headKeep));
  const skinGridAll = new TriGrid(new Float32Array(triSoup(bodyPrim, (a, b, c) => headW[a] > 0.5 || headW[b] > 0.5 || headW[c] > 0.5)), 0.016);
  const skinFrom = (dx, dy2, dz) => { const t = skinGridAll.cast(skinCenter[0], skinCenter[1], skinCenter[2], dx, dy2, dz, 0.2, 0.01); return t >= 0 ? t : null; };
  let wrapped = null, knotAt = null;
  let bareHair = false;
  if (H.kind === 'scarf' || H.kind === 'wrap' || H.kind === 'rag' || H.kind === 'cap') {
    const pts = headTailPoints(H.tail || 'left', H.kind === 'rag' ? 0.28 : H.kind === 'cap' ? 0.24 : 0.46);
    const j = chain(H.kind === 'wrap' ? 'wrapSash' : 'hairTail', 'Head', pts);
    const ws = wrapSpec(H.kind, H, { points: pts, joints: j });
    wrapped = woundHeadwrap({ headSoup, skin: skinFrom, joint: head, center: skinCenter, ...ws });
  } else if (H.kind === 'band') {
    const pts = headTailPoints(H.tail || 'left', 0.3);
    knotAt = pts[0];
    const j = chain('hairTail', 'Head', pts);
    wrapped = bandHead({ headSoup, skin: skinFrom, joint: head, center: skinCenter, lift: (dx, dy2) => 0.0022 + 0.002 * smooth(0, 0.7, dy2), tailPts: pts, tailJ: j, width: H.thin ? 0.1 : 0.14, seed: H.seed });
    bareHair = true;
  } else if (H.kind === 'hood') {
    bareHair = true;
  }

  if (H.goggles && wrapped) {
    const P2 = await import('./pieces.mjs');
    const gridW = new TriGrid(new Float32Array(wrapped.soup), 0.012);
    const y = 1.742, front = (x) => { const t = gridW.cast(x, y, 0.5, 0, 0, -1, 0.8, 0.0001); return t >= 0 ? 0.5 - t : 0.1; };
    const z = Math.max(front(0.034), front(-0.034)) + 0.004;
    const gg = P2.goggles({ joint: head, y, z, dx: 0.034, uvBrass: uvOf('brass'), uvMica: uvOf('brass'), tilt: 0.42 });
    gg.forEach((g, i) => pieces.push({ geo: g, dye: i % 2 === 1 && i < 4 ? '#6F6A58' : '#8A6A3A', hide: false, noHide: true, shade: 1 }));
  }

  // ---- the skull under the wrap and the backs of the eyes are never seen; neither is the body under the clothes
  let culled = 0;
  if (wrapped && !bareHair) { tuckUnderCloth(bodyPrim, wrapped.stack, isEar); culled = cullUnderWrap(bodyPrim, wrapped.covers, isEar); }
  const eyesCulled = cullEyeBacks(eyesPrim, eyes);
  const hide = coverageMask(bodyPrim, outfitBodyTris(), 0.08, spec.sex === 'M' ? 0.075 : 0.04, spec.sex === 'M' ? 0.1 : 0.05);
  const insideCollar = spec.sex === 'M' ? (x, y, z) => (y > 1.452 && Math.abs(x) < 0.1) || (OUT.vNeck && y > 1.37 && Math.abs(x) < 0.05 && z > 0) : (x, y) => y > 1.40 && Math.abs(x) < 0.112;
  const hiddenLegsFrom = OUT.legsHidden ?? (OUT.legsHiddenFrom ?? null);
  {
    const P = bodyPrim.getAttribute('POSITION'), q = [0, 0, 0], idx = bodyPrim.getIndices().getArray(), n = P.getCount();
    const h = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      P.getElement(i, q);
      h[i] = hide[i] && !insideCollar(q[0], q[1], q[2]) ? 1 : 0;
      if (hiddenLegsFrom && q[1] < hiddenLegsFrom && q[1] > 0.02) h[i] = 1;
    }
    const keep = [];
    for (let t = 0; t < idx.length; t += 3) {
      // on the trunk two hidden corners are enough (a superhero chest pokes through a regular shirt); on an arm all three, so a sleeve's end has skin under it
      P.getElement(idx[t], q);
      const need = Math.abs(q[0]) > 0.28 ? 3 : 2;
      if (h[idx[t]] + h[idx[t + 1]] + h[idx[t + 2]] < need) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    bodyPrim.getIndices().setArray(new Uint32Array(keep));
  }
  await simplifyHands(bodyPrim);
  compactPrim(bodyPrim);
  headW = vertexWeightOf(bodyPrim, headSet);
  log(`  body after culls: ${bodyPrim.getIndices().getCount() / 3} tris`);

  // ---- materials
  const skinMat = root.listMaterials().find((m) => m.getName() === SX.skinMat).setName(`MI_Npc_Skin_${spec.id}`);
  const eyeMat = root.listMaterials().find((m) => m.getName() === 'MI_Eyes');
  void eyeMat;

  // ---- the skin atlas
  const EYE_PX = 160;
  // a person whose clothes hide more of the body has the texels for more face: the densest layout that packs
  let layout = null, densityK = 1.3;
  for (; densityK > 0.4 && !layout; densityK -= 0.04) {
    try { const k = densityK; layout = relayoutSkinUV(bodyPrim, { density: (q) => humanDensity(q) * k, reserve: [{ id: 'eye', w: EYE_PX / 1024, h: EYE_PX / 1024 }], pad: 0.009, elastic: 0.7 * k }); } catch (e) { if (!/does not pack/.test(e.message)) throw e; }
  }
  if (!layout) throw new Error(`[npc ${spec.id}] the skin atlas does not pack`);
  const eyeR = layout.reserved.eye;
  remapEyeUV(eyesPrim, eyes, eyeR);
  const eyeTrue = eyes.map((e) => [e[0], e[1], eyeSphereZ]);
  const nearFace = (p) => p[1] > 1.6 && p[2] > 0 && Math.abs(p[0]) < 0.075;
  const faceSoup = (() => { const P = bodyPrim.getAttribute('POSITION'), q = [0, 0, 0], ok = new Uint8Array(P.getCount()); for (let i = 0; i < ok.length; i++) { P.getElement(i, q); ok[i] = nearFace(q) ? 1 : 0; } return triSoup(bodyPrim, (a, b, c) => ok[a] && ok[b] && ok[c]); })();
  const faceGrid = new TriGrid(new Float32Array(faceSoup), 0.006);
  const ballGrid = new TriGrid(new Float32Array(triSoup(eyesPrim)), 0.006);
  const opens = eyeTrue.map((e) => eyeOpening(faceGrid, e, { eyeR: 0.0168, ballGrid }));
  const zAt = (x, y) => { const t = faceGrid.cast(x, y + 0.0004, 0.2, 0, 0, -1, 0.17, 0.0001); return t >= 0 ? 0.2 - t : eyeTrue[0][2] + 0.016; };
  const lashes = [1, -1].map((side, i) => lashCard(opens[i], { side, joint: head, zAt, rect: WRAP_ATLAS.lashes.rect, W: WRAP_ATLAS.W }));

  // ---- the marks
  const marks = [...ageLayers({ L, eyes, age: spec.age })];
  if (H.beard) marks.push(beardLayer({ L, eyes, hair: spec.hair, kind: H.beard }));
  if (spec.marks?.tar) marks.push(tarLayer());
  if (spec.marks?.carmine) marks.push(carmineLayer());
  if (spec.marks?.burn) marks.push(burnLayer([{ at: [-0.46, 1.42, 0.02], r: [0.05, 0.035, 0.04] }, { at: [0.52, 1.40, 0.0], r: [0.035, 0.03, 0.04] }, { at: [-0.05, 1.615, 0.058], r: [0.016, 0.013, 0.02] }]));
  // the source's forehead reads olive once the cheek is on tone; the forehead comes back to the same skin
  marks.push(colourZones([{ at: [0, 1.71, 0.075], s: [0.06, 0.032, 0.06], gain: [1.05, 0.93, 0.9] }, { at: [0, L.brow[1], L.brow[2]], s: [0.05, 0.016, 0.03], gain: [1.02, 0.96, 0.94] }]));
  // the adolescent: the source's adult muscle and bone relief goes from the head and neck (the younger read comes from the face)
  if (spec.adolescent) marks.push((T) => { if (T.Y > 1.42 && Math.abs(T.X) < 0.12) T.nflat = Math.max(T.nflat ?? 0, 0.72); });
  if (spec.age < 20) marks.push(colourZones([{ at: [eyes[0][0], eyes[0][1] - 0.016, eyes[0][2] + 0.008], s: [0.02, 0.009, 0.022], gain: [1.12, 1.12, 1.1] }, { at: [eyes[1][0], eyes[1][1] - 0.016, eyes[1][2] + 0.008], s: [0.02, 0.009, 0.022], gain: [1.12, 1.12, 1.1] }, { at: [eyes[0][0], eyes[0][1] + 0.012, eyes[0][2] + 0.002], s: [0.02, 0.008, 0.02], gain: [1.1, 1.08, 1.07] }, { at: [eyes[1][0], eyes[1][1] + 0.012, eyes[1][2] + 0.002], s: [0.02, 0.008, 0.02], gain: [1.1, 1.08, 1.07] }, { at: [0.03, L.noseTip[1] - 0.03, L.noseTip[2] - 0.042], s: [0.012, 0.018, 0.018], gain: [1.1, 1.09, 1.08] }, { at: [-0.03, L.noseTip[1] - 0.03, L.noseTip[2] - 0.042], s: [0.012, 0.018, 0.018], gain: [1.1, 1.09, 1.08] }]));
  if (spec.age < 20) marks.push(colourZones([{ at: [L.cheekL[0], L.cheekL[1] - 0.006, L.cheekL[2]], s: [0.022, 0.018, 0.024], gain: [1.05, 1.0, 0.98] }, { at: [L.cheekR[0], L.cheekR[1] - 0.006, L.cheekR[2]], s: [0.022, 0.018, 0.024], gain: [1.05, 1.0, 0.98] }]));

  // the hairline: wrapped heads keep the kit's shape, bare heads the whole shell
  const fullShape = (X, Y, Z) => {
    const ax = Math.abs(X);
    const onEar = ax > 0.0715 && Z > -0.052 && Z < 0.006 && Y < 1.671 ? 0 : 1;
    const wob = (noise3(X * 90, Y * 90, Z * 90) - 0.5) * 0.008;
    return smooth(1.565, 1.585, Y + wob) * onEar;
  };
  const shape = bareHair ? fullShape : hairShape;
  const collarSoup = outfitBodyTris();
  const occl = wrapped ? wrapped.soup : new Float32Array(0);
  const skinImg = await paintHumanSkin({
    bodyPrim, skinMat, layout, eyeR, EYE_PX, L, eyes, brows, shellGrid, opens, scar: null, names: `npc-${spec.id}`,
    occluders: occl, collar: collarSoup, hairBand: wrapped && !bareHair ? hairBandUnderHem(wrapped.hemGap) : null, hairShape: shape,
    marks, tone: spec.tone, iris: spec.iris, amber: spec.amber, hairColor: spec.hair,
  });
  leanInwardNormals(bodyPrim, eyesPrim, { L, eyes });
  const darkUV = (() => {
    const Q = bodyPrim.getAttribute('POSITION'), U = bodyPrim.getAttribute('TEXCOORD_0'), q = [0, 0, 0], u = [0, 0];
    let best = -1, bz = 9;
    for (let i = 0; i < Q.getCount(); i++) { Q.getElement(i, q); if (q[1] > 1.565 && q[1] < 1.6 && Math.abs(q[0]) < 0.025 && q[2] > 0 && q[2] < bz) { bz = q[2]; best = i; } }
    U.getElement(Math.max(0, best), u);
    return [u[0], u[1]];
  })();
  appendCollarSkirt(bodyPrim, collarSoup, { darkUV, rx1: 0.135, rz1: 0.095, seg: 16 });

  // ---- hair + wrap
  const hairParts = [];
  const hairTint = lin(spec.hair).map((v) => Math.min(1, v / HAIR_NEUTRAL));
  let cardCount = 0;
  if (wrapped && !bareHair) {
    const cards = scalpCards({ bodyPrim, headW, shellGrid, wrapped, skinJ: bodyPrim.getAttribute('JOINTS_0'), skinW: bodyPrim.getAttribute('WEIGHTS_0'), twoSided: true });
    cardCount = cards.idx.length / 3;
    hairParts.push(wrapped.geo, cards);
  } else if (bareHair) {
    if (wrapped) hairParts.push(wrapped.geo);
    const soup = triSoup(bodyPrim, (a, b, c) => headW[a] > 0.5 || headW[b] > 0.5 || headW[c] > 0.5);
    const grid = new TriGrid(new Float32Array(soup), 0.016);
    const J2 = bodyPrim.getAttribute('JOINTS_0'), W2 = bodyPrim.getAttribute('WEIGHTS_0');
    const P2 = bodyPrim.getAttribute('POSITION');
    const verts = [];
    { const q = [0, 0, 0]; for (let i = 0; i < P2.getCount(); i++) { P2.getElement(i, q); if (q[1] > 1.5) verts.push(q[0], q[1], q[2], i); } }
    const skinOf = nearestSkin(verts, J2, W2);
    const keep = (p, d) => {
      const hit = shellGrid.cast(p[0] - d[0] * 0.002, p[1] - d[1] * 0.002, p[2] - d[2] * 0.002, d[0], d[1], d[2], 0.03, 0.0001);
      if (hit < 0 || shape(p[0], p[1] - 0.002, p[2]) <= 0.6) return false;
      if (knotAt && Math.hypot(p[0] - knotAt[0], p[1] - knotAt[1], p[2] - knotAt[2]) < 0.045) return false;
      if (wrapped?.stack) {
        // not under the band, and not just above it, where a card's tip would lie on the cloth
        // (a card is up to 2 cm long, flows down and back or forward, and its tip stands up to 5 mm off the scalp: wherever it
        // could lie must be clear of the band, or its tip comes through the cloth)
        const x = p[0] - skinCenter[0], y = p[1] - skinCenter[1], z = p[2] - skinCenter[2];
        for (const drop of [0, 0.01, 0.02, 0.03, 0.04]) for (const dx of [-0.012, 0, 0.012]) for (const dz of [-0.018, 0, 0.012]) {
          const xx = x + dx, yy = y - drop, zz = z + dz, q = Math.hypot(xx, yy, zz) || 1;
          if (wrapped.stack.coveredAt(xx / q, yy / q, zz / q)) return false;
        }
      }
      return true;
    };
    const anchors = scatterAnchors(grid, { center: [0, 1.66, -0.02], step: H.kind === 'hood' ? 0.2 : 0.1, seed: 5 + spec.n, keep, elMin: -1.2, elMax: 1.45 });
    const cards = coilCards(anchors, { flow: (a, Rr) => { const x = a.p[0], z = a.p[2]; return [Math.sign(x) * 0.25 + (Rr() - 0.5) * 0.8, -0.55, (z > 0 ? 0.3 : -0.8) + (Rr() - 0.5) * 0.7]; }, skinOf, rect: WRAP_ATLAS.coilFringe.rect, W: WRAP_ATLAS.W, length: [0.012, 0.02], width: [0.012, 0.02], liftTip: [0.002, 0.0055], twoSided: true });
    cardCount = cards.idx.length / 3;
    hairParts.push(cards);
    if (H.kind === 'hood') {
      // a grey lock escapes the hood on her left, on a chain
      const pts = [[0.074, 1.668, 0.03], [0.083, 1.625, 0.034], [0.086, 1.58, 0.034], [0.085, 1.535, 0.03], [0.082, 1.495, 0.024]];
      const j = chain('hairLock', 'Head', pts);
      const A = WRAP_ATLAS;
      hairParts.push(coilTuft(pts, j, { count: 3, along: 7, width: 0.014, uv: { rect: A.coilTile.rect, period: A.coilTile.period, W: A.W }, side: [1, 0, 0.3], seed: 13 + spec.n }));
    }
  }
  const hairBase = joinGeos([...hairParts]);
  const lashGeo = joinGeos(lashes);
  // tint by what the texel is: cloth takes the dye, coils the hair colour; lashes are painted as they are
  const A = WRAP_ATLAS;
  const inRect = (u, v, R) => { const x = u * A.W, y = v * A.W; return x >= R[0] && x < R[0] + R[2] && y >= R[1] && y < R[1] + R[3]; };
  const clothD = lin(H.dye).map((v) => Math.min(1, v / NEUTRAL)), liningD = lin(H.lining || H.dye).map((v) => Math.min(1, v / NEUTRAL)), tailBackD = clothD.map((v, k) => v * 0.62 + liningD[k] * 0.1);
  {
    const n = hairBase.pos.length / 3;
    for (let i = 0; i < n; i++) {
      const u = hairBase.uv[i * 2], v = hairBase.uv[i * 2 + 1];
      const hair = inRect(u, v, A.coilTile.rect) || inRect(u, v, A.coilFringe.rect) || inRect(u, v, A.lockTile.rect);
      const lining = inRect(u, v, A.lining.rect);
      const onHead = hairBase.wgt[i * 4] > 0.99 && hairBase.jnt[i * 4] === head;
      const c = hair ? hairTint : lining ? (onHead ? liningD : tailBackD) : clothD;
      for (let k = 0; k < 3; k++) hairBase.col[i * 4 + k] *= c[k];
    }
  }
  const hairGeo = join([hairBase, lashGeo]);
  hairGeo.jnt = hairGeo.jnt.map((v) => v);
  fixMale(hairGeo, dy);

  // ---- the near outfit: contact shade against everything, then the dyes
  {
    const soup = Array.from(triSoup(bodyPrim));
    for (const p of pieces) soupOf(p.geo, soup);
    if (wrapped) soupOf(wrapped.geo, soup);
    const grid = new TriGrid(new Float32Array(soup), 0.02);
    for (const p of pieces) {
      const g = p.geo;
      const keepCol = g.col && g.col.length === (g.pos.length / 3) * 4 ? g.col.slice() : null;
      vertexAO(g, grid, { rays: 24, maxD: 0.05, floor: 0.42, tint: [1, 0.97, 0.95] });
      if (keepCol) for (let i = 0; i < g.col.length; i++) g.col[i] *= keepCol[i];
      if (p.dye) dye(g, p.dye, NEUTRAL);
      if (p.shade && p.shade !== 1) for (let i = 0; i < g.col.length; i++) if (i % 4 !== 3) g.col[i] = Math.min(1, g.col[i] * p.shade);
    }
  }
  const outfitGeo = join(pieces.map((p) => p.geo));
  fixMale(outfitGeo, dy);

  // ---- the skin: body + eyes
  shiftPrim(bodyPrim, dy); shiftPrim(eyesPrim, dy);
  eyesPrim.setMaterial(skinMat);
  const skinJoined = joinPrimitives([bodyPrim, eyesPrim]);
  skinJoined.setMaterial(skinMat);
  const skinGeo = primToGeo(skinJoined);

  // ---- tiers. The wrap's cloth shell folds into the outfit below near; its UV moves onto a swatch of the same value
  const sw = uvRect('panelB');
  const clothLod = (() => {
    if (!wrapped || hairBase.pos.length === 0) return null;
    const c = { pos: hairBase.pos.slice(), nrm: hairBase.nrm.slice(), uv: hairBase.uv.slice(), jnt: hairBase.jnt.slice(), wgt: hairBase.wgt.slice(), col: hairBase.col.slice(), idx: [] };
    // cloth triangles only (no coil cards, no alpha tricks)
    for (let t = 0; t < hairBase.idx.length; t += 3) {
      const a = hairBase.idx[t];
      const u = hairBase.uv[a * 2], v = hairBase.uv[a * 2 + 1];
      if (inRect(u, v, A.coilFringe.rect) || inRect(u, v, A.coilTile.rect) || inRect(u, v, A.lockTile.rect)) continue;
      c.idx.push(hairBase.idx[t], hairBase.idx[t + 1], hairBase.idx[t + 2]);
    }
    const n = c.pos.length / 3;
    for (let i = 0; i < n; i++) { c.uv[i * 2] = sw[0] + sw[2] * (0.5 + 0.5 * Math.sin(c.pos[i * 3] * 11)); c.uv[i * 2 + 1] = sw[1] + sw[3] * (0.5 + 0.5 * Math.sin(c.pos[i * 3 + 1] * 13)); c.col[i * 4 + 3] = 1; }
    fixMale(c, dy);
    return compact(c);
  })();
  // the cloth below near: a shell cast onto the wound cloth from outside (no gaps, no cards), the tails as they are, simplified
  const shellOf = (rows, seg) => {
    if (!wrapped || !clothLod) return [];
    const soup = [];
    const headIdx = [];
    for (let t = 0; t < clothLod.idx.length; t += 3) { const a = clothLod.idx[t]; if (clothLod.jnt[a * 4] === head && clothLod.wgt[a * 4] > 0.99) headIdx.push(clothLod.idx[t], clothLod.idx[t + 1], clothLod.idx[t + 2]); }
    for (const i of headIdx) soup.push(clothLod.pos[i * 3], clothLod.pos[i * 3 + 1], clothLod.pos[i * 3 + 2]);
    if (!soup.length) return [];
    const grid = new TriGrid(new Float32Array(soup), 0.016);
    const c = [skinCenter[0], skinCenter[1] + dy, skinCenter[2]];
    const far = 0.4;
    const g = emptyGeo();
    const map = new Int32Array((rows + 1) * seg).fill(-1);
    for (let r = 0; r <= rows; r++) for (let s = 0; s < seg; s++) {
      const el = Math.PI / 2 - (r / rows) * Math.PI * 0.72, az = (s / seg) * Math.PI * 2;
      const d = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
      const t = grid.cast(c[0] + d[0] * far, c[1] + d[1] * far, c[2] + d[2] * far, -d[0], -d[1], -d[2], far, 0.0001);
      if (t < 0) continue;
      map[r * seg + s] = g.pos.length / 3;
      g.pos.push(c[0] + d[0] * (far - t + 0.0015), c[1] + d[1] * (far - t + 0.0015), c[2] + d[2] * (far - t + 0.0015));
      g.nrm.push(d[0], d[1], d[2]);
      g.uv.push(sw[0] + sw[2] * 0.5, sw[1] + sw[3] * 0.5);
      g.jnt.push(head, 0, 0, 0); g.wgt.push(1, 0, 0, 0);
      const k = 0.8 + 0.2 * smooth(-0.3, 0.8, d[1]);
      g.col.push(clothD[0] * k, clothD[1] * k, clothD[2] * k, 1);
    }
    for (let r = 0; r < rows; r++) for (let s = 0; s < seg; s++) {
      const a = map[r * seg + s], b = map[r * seg + (s + 1) % seg], e = map[(r + 1) * seg + s], f = map[(r + 1) * seg + (s + 1) % seg];
      if (a >= 0 && b >= 0 && e >= 0) g.idx.push(a, e, b);
      if (b >= 0 && e >= 0 && f >= 0) g.idx.push(b, e, f);
    }
    recomputeGeoNormals(g);
    const tails = compact({ ...clothLod, pos: clothLod.pos.slice(), nrm: clothLod.nrm.slice(), uv: clothLod.uv.slice(), jnt: clothLod.jnt.slice(), wgt: clothLod.wgt.slice(), col: clothLod.col.slice(), idx: (() => { const o = []; for (let t = 0; t < clothLod.idx.length; t += 3) { const a = clothLod.idx[t]; if (!(clothLod.jnt[a * 4] === head && clothLod.wgt[a * 4] > 0.99)) o.push(clothLod.idx[t], clothLod.idx[t + 1], clothLod.idx[t + 2]); } return o; })() });
    return [g, tails];
  };
  const skinEyes = skinGeo;
  // LOD1 keeps every vertex of what stands off the body and moves on its own (dyn_ tails, aprons, sashes, the tools and baskets
  // on prop joints): those are the silhouette at 18 m, and a 16-triangle apron or a 56-triangle tail popped 3-7 cm at the change
  // (A-npc-fidelity's jump clause). The rest of the outfit pays for them.
  const silJ = new Set();
  root.listSkins()[0].listJoints().forEach((jn, i) => { if (/^(dyn_|prop_)/.test(jn.getName())) silJ.add(i); });
  const onSil = (g) => (i) => { for (let k = 0; k < 4; k++) if (g.wgt[i * 4 + k] >= 0.25 && silJ.has(g.jnt[i * 4 + k])) return true; return false; };
  const l1Src = join([outfitGeo, ...shellOf(10, 22)]);
  const L1 = {
    skin: await simplify(skinEyes, Math.min(3200, Math.floor(tris(skinEyes) * 0.55)), { err: 0.03 }),
    outfit: await simplifyTo(l1Src, 4750, 0.03, 1.25, 0.28, onSil(l1Src)),
  };
  const L2 = {
    skin: await simplifyTo(skinEyes, 1350, 0.08),
    outfit: await simplifyTo(join([outfitGeo, ...shellOf(6, 14)]), 2400, 0.08, 1.08, 0.9),
  };
  const caster = await simplifyTo(join([L2.skin, L2.outfit]), 2000, 0.12, 2);

  // ---- nodes
  const skin = root.listSkins()[0];
  const arm = nodeByName(base, 'Armature');
  const outfitMat = base.createMaterial('MI_Npc_Outfit').setMetallicFactor(1).setRoughnessFactor(1);
  const hairMat = base.createMaterial('MI_Npc_Hair').setAlphaMode('MASK').setAlphaCutoff(0.5).setDoubleSided(false).setMetallicFactor(1).setRoughnessFactor(1);
  const casterMat = base.createMaterial('MI_Npc_Caster');
  const buf = root.listBuffers()[0];
  const prim = (g, mat, { color = true, uv = true, normal = true } = {}) => geoPrim(base, buf, g, mat, { color, uv, normal });
  for (const n of [bodyNode, eyesNode, browNode, ...hairNodes]) { n.getMesh()?.dispose(); n.dispose(); }
  const addNode = (name, p) => arm.addChild(base.createNode(name).setMesh(base.createMesh(name).addPrimitive(p)).setSkin(skin));
  addNode('Skin_L0', skinJoined);
  addNode('Hair_L0', prim(hairGeo, hairMat));
  addNode('Outfit_L0', prim(outfitGeo, outfitMat));
  addNode('Skin_L1', prim(L1.skin, skinMat, { color: false }));
  addNode('Outfit_L1', prim(L1.outfit, outfitMat));
  addNode('Skin_L2', prim(L2.skin, skinMat, { color: false }));
  addNode('Outfit_L2', prim(L2.outfit, outfitMat));
  addNode('Caster', prim(caster, casterMat, { color: false, uv: false, normal: false }));
  const keepMats = new Set([skinMat, outfitMat, hairMat, casterMat]);
  for (const m of root.listMaterials()) if (!keepMats.has(m)) m.dispose();
  for (const t of root.listTextures()) if (!t.listParents().some((p) => p.propertyType === 'Material')) t.dispose();

  // the body's top + feet in the true frame, for placement
  const bodyBox = (() => { let lo = 1e9, hi = -1e9; const a = skinGeo.pos; for (let i = 1; i < a.length; i += 3) { lo = Math.min(lo, a[i]); hi = Math.max(hi, a[i]); } return { lo, hi }; })();
  const tierTris = {
    L0: { skin: tris(skinGeo), hair: tris(hairGeo), outfit: tris(outfitGeo) },
    L1: { skin: tris(L1.skin), outfit: tris(L1.outfit) },
    L2: { skin: tris(L2.skin), outfit: tris(L2.outfit) },
    caster: tris(caster),
  };
  const stats = await writeSkinned(base, file, {
    provenance,
    extras: {
      r5Npc: {
        id: spec.id, n: spec.n, name: spec.name, faction: spec.faction, sex: spec.sex, age: spec.age, adolescent: !!spec.adolescent,
        height: spec.height, scale: +S.toFixed(6), rawBodyH: +rawBodyH.toFixed(5), footY: +(box0.min[1] + dy).toFixed(5),
        chains: chainTable, props: propTable, tiers: tierTris, clips: spec.clips, armPose,
        pieces: pieces.map((p) => p.part || (p.prop ? `prop:${p.prop}` : 'procedural')).reduce((m, k) => { m[k] = (m[k] || 0) + 1; return m; }, {}),
        layers: pieces.filter((p) => !p.prop && !p.noHide).length,
        procedural: pieces.filter((p) => !p.part).length,
        head: H.kind, hairParts: wrapped ? wrapped.parts : null, cards: cardCount, culled, eyesCulled,
      },
      r5Face: faceRec,
      r5Paint: { ...skinImg.stats, layout: { shrink: +layout.shrink.toFixed(3), density: +(densityK + 0.04).toFixed(2), eyePatch: eyeR } },
    },
  });
  log(`  ${spec.id}: ${JSON.stringify(tierTris)} ${stats.bytes} B, density ${(densityK + 0.04).toFixed(2)} shrink ${layout.shrink.toFixed(3)}, body box ${bodyBox.lo.toFixed(3)}..${bodyBox.hi.toFixed(3)}`);
  return { ...stats, tiers: tierTris, face: faceRec.landmarks, iou: faceRec.iou };
}

/**
 * A held arm: the two-bone solve from the bind pose to a hand point (female frame) in the shoulder's own frame, as
 * local rotations the runtime writes over the clip. The hand stays rigid to whatever hangs on the clavicle.
 */
function solveArmPose(base, { side, hand, pole }, dy) {
  const joints = base.getRoot().listSkins()[0].listJoints();
  const by = (n) => joints.find((j) => j.getName() === `${n}_${side}`);
  const dec = (j) => { const m = new THREE.Matrix4().fromArray(j.getWorldMatrix()); const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(p, q, s); return { p, q }; };
  const cl = dec(by('clavicle')), up = dec(by('upperarm')), lo = dec(by('lowerarm')), ha = dec(by('hand'));
  const S = up.p, E = lo.p, H = ha.p;
  const L1 = S.distanceTo(E), L2 = E.distanceTo(H);
  const T = new THREE.Vector3(hand[0], hand[1] + dy, hand[2]);
  const dir = T.clone().sub(S);
  const dist = Math.min(dir.length(), (L1 + L2) * 0.985);
  dir.normalize();
  const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const pd = new THREE.Vector3(...pole);
  pd.sub(dir.clone().multiplyScalar(pd.dot(dir))).normalize();
  const E2 = S.clone().add(dir.clone().multiplyScalar(a)).add(pd.multiplyScalar(h));
  const T2 = S.clone().add(dir.clone().multiplyScalar(dist));
  const R1 = new THREE.Quaternion().setFromUnitVectors(E.clone().sub(S).normalize(), E2.clone().sub(S).normalize());
  const upW = R1.clone().multiply(up.q);
  const upLocal = cl.q.clone().invert().multiply(upW);
  const loLocal0 = up.q.clone().invert().multiply(lo.q);
  const loW0 = upW.clone().multiply(loLocal0);
  const d2 = H.clone().sub(E).normalize().applyQuaternion(R1);
  const R2 = new THREE.Quaternion().setFromUnitVectors(d2, T2.clone().sub(E2).normalize());
  const loW = R2.clone().multiply(loW0);
  const loLocal = upW.clone().invert().multiply(loW);
  const row = (q) => [q.x, q.y, q.z, q.w].map((v) => +v.toFixed(5));
  return { side, [`upperarm_${side}`]: row(upLocal), [`lowerarm_${side}`]: row(loLocal) };
}

/** Simplify to a triangle target, loosening the error until it is met. */
async function simplifyTo(g, target, err, slack = 1.25, maxE = 0.28, vlock = null) {
  let e = err, out = await simplify(g, target, { err: e, vlock });
  for (let k = 0; k < 7 && tris(out) > target * 1.02 && e < maxE; k++) { e *= 1.6; out = await simplify(g, target, { err: Math.min(maxE, e), vlock }); }
  if (tris(out) > target * slack) out = await simplifySloppy(out, target, 0.3);
  return out;
}

function fixMale(g, dy) {
  if (!dy) return;
  for (let i = 1; i < g.pos.length; i += 3) g.pos[i] += dy;
}

/** A primitive from a bucket; COLOR_0 is u16 so a dark dye keeps its contact shade. */
function geoPrim(doc, buf, g, mat, { color = true, uv = true, normal = true } = {}) {
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const p = doc.createPrimitive().setAttribute('POSITION', acc('VEC3', new Float32Array(g.pos)));
  if (normal) {
    const n = new Float32Array(g.nrm);
    for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
    p.setAttribute('NORMAL', acc('VEC3', n));
  }
  if (uv) p.setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(g.uv)));
  p.setAttribute('JOINTS_0', acc('VEC4', new Uint16Array(g.jnt)));
  p.setAttribute('WEIGHTS_0', acc('VEC4', new Float32Array(g.wgt)));
  if (color) {
    const nv = g.pos.length / 3, c = new Uint16Array(nv * 4);
    for (let i = 0; i < nv * 4; i++) c[i] = Math.max(0, Math.min(65535, Math.round((g.col ? g.col[i] : 1) * 65535)));
    p.setAttribute('COLOR_0', doc.createAccessor().setType('VEC4').setArray(c).setNormalized(true).setBuffer(buf));
  }
  p.setIndices(acc('SCALAR', new Uint32Array(g.idx)));
  p.setMaterial(mat);
  return p;
}

/**
 * Which body vertices sit under the outfit: a ray from the vertex along its normal meets an outfit
 * triangle within `maxD` (the same test as Brea's hide mask; here the triangles go at build time).
 */
function coverageMask(prim, tris9, maxD, inset = 0.03, trunkInset = 0) {
  const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL');
  const n = P.getCount();
  const grid = new TriGrid(tris9, 0.04);
  const out = new Uint8Array(n);
  const p = [0, 0, 0], d = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    P.getElement(i, p); N.getElement(i, d);
    const l = Math.hypot(d[0], d[1], d[2]) || 1; d[0] /= l; d[1] /= l; d[2] /= l;
    // from 3 cm inside: a body vertex up to 3 cm outside the cloth is the skin poking through it, and is covered too
    // a male trunk bulges further out of the regular-body cloth than anything else
    const ins = Math.abs(p[0]) < 0.3 && p[1] < 1.45 ? Math.max(inset, trunkInset) : inset;
    const t = grid.cast(p[0] - d[0] * ins, p[1] - d[1] * ins, p[2] - d[2] * ins, d[0], d[1], d[2], maxD + ins, 0.0001);
    if (t >= 0) out[i] = 1;
  }
  return out;
}

export { emptyGeo, filterTris, recomputeGeoNormals, primFromGeo, ATLAS, FEMALE_RAW };
