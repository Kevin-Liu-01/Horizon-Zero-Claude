/**
 * ROUND 5 · HUMAN-PIPELINE PROOF — runtime (`?poc=human`).
 *
 * Loaded ONLY by `src/main.js` when the URL carries `poc=human`; the default
 * boot never imports this file. It replaces the protagonist BODY before the
 * Player is built and leaves every kept system — Retargeter, ClipLibrary,
 * LocomotionBlend, PlayerAnimator overlays, hair springs, controller, camera —
 * exactly as they are. The only thing it hands them is a rig profile on
 * `root.userData.rigProfile` (see ubcRig.js).
 *
 * URL params:
 *   pocOutfit = ranger | peasant | none   (default ranger)
 *   pocHood   = 1                          (ranger hood up; default down)
 *   pocHeight = metres of BODY height      (default 1.72, Aloy's, so every
 *                                           absolute-metre constant compares
 *                                           like for like)
 *
 * window.__POC__:
 *   info()        rig/clip/geometry report (bone map coverage, missing keys,
 *                 chains, tris, draws, file sizes)
 *   wear(name)    swap the outfit on the LIVE player (one skeleton, new meshes),
 *                 disposing the outgoing meshes, materials and textures
 *   hood(on)      toggle the hood piece
 *   dispose()     drop everything this module created
 */
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { applyShadowPolicy } from '../../src/core/assets.js';
import { ubcProfile } from './ubcRig.js';

const URLS = {
  base: new URL('./assets/heroine-base.glb', import.meta.url).href,
  male: new URL('./assets/npc-male-base.glb', import.meta.url).href,
  ranger: new URL('./assets/outfit-ranger.glb', import.meta.url).href,
  peasant: new URL('./assets/outfit-peasant.glb', import.meta.url).href,
  'male-ranger': new URL('./assets/outfit-male-ranger.glb', import.meta.url).href,
  'male-peasant': new URL('./assets/outfit-male-peasant.glb', import.meta.url).href,
};

/** Hair variant: `Hair` is the default style, `HairAlt_<X>` the alternates. */
function selectHair(root, which) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.name === 'Hair') o.visible = !which || which === 'default';
    else if (o.name.startsWith('HairAlt_')) {
      const alt = o.name.slice(8);
      o.visible = !!which && which.split('+').includes(alt);
    }
  });
}

/** Map of bone name -> Bone under `root`. */
function boneMap(root) {
  const m = new Map();
  root.traverse((o) => { if (o.isBone) m.set(o.name, o); });
  return m;
}

/**
 * Load an outfit GLB and bind every SkinnedMesh in it to `root`'s skeleton BY
 * BONE NAME. The part keeps its own inverse-bind matrices and bindMatrix (the
 * build verified they equal the base's), so it skins exactly as authored.
 */
async function attachOutfit(loader, root, name, { hood = false } = {}) {
  if (!URLS[name]) return [];
  const gltf = await loader.loadAsync(URLS[name]);
  const bones = boneMap(root);
  const armature = root.getObjectByName('Armature') || root;
  const parts = [];
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh) parts.push(o); });
  for (const m of parts) {
    const mapped = m.skeleton.bones.map((b) => bones.get(b.name));
    const miss = m.skeleton.bones.filter((b, i) => !mapped[i]).map((b) => b.name);
    if (miss.length) throw new Error(`[poc] outfit ${name}/${m.name}: bones missing on body: ${miss.join(',')}`);
    const skel = new THREE.Skeleton(mapped, m.skeleton.boneInverses.map((x) => x.clone()));
    const bind = m.bindMatrix.clone();
    armature.add(m);
    m.bind(skel, bind);
    m.userData.pocOutfit = name;
    m.castShadow = true; m.receiveShadow = true;
    for (const mat of [].concat(m.material)) mat.side = THREE.FrontSide;
    if (/Hood/.test(m.name)) m.visible = hood;
  }
  return parts;
}

/**
 * Dispose a mesh's GPU resources: geometry, materials, every texture slot —
 * AND its Skeleton. Every SkinnedMesh three builds (GLTFLoader, SkeletonUtils
 * .clone, our rebind) owns its own Skeleton, and a Skeleton owns a bone
 * DataTexture (one GL texture each, counted in renderer.info.memory.textures).
 * Measured before this line: +1 texture per outfit mesh per swap, forever.
 */
function disposeMesh(m) {
  if (m.isSkinnedMesh) m.skeleton?.dispose();
  m.geometry?.dispose();
  for (const mat of [].concat(m.material)) {
    if (!mat) continue;
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) mat[k]?.dispose?.();
    mat.dispose();
  }
}

function bodyPieces(root) {
  return { full: root.getObjectByName('Body_Full'), head: root.getObjectByName('Body_Head') };
}

/**
 * Show the head-only body under an outfit, the full body without one. A
 * VISIBILITY toggle, not a re-parent: an invisible mesh costs no draw, no
 * shadow and no skinning, and it survives SkeletonUtils.clone into the Player.
 */
function selectBody(root, outfit) {
  const { full, head } = bodyPieces(root);
  if (full) full.visible = outfit === 'none';
  if (head) head.visible = outfit !== 'none';
}

export async function installPocHuman(ctx) {
  const P = ctx.params;
  const outfit = P.get('pocOutfit') ?? 'ranger';
  const hood = P.get('pocHood') === '1';
  const height = parseFloat(P.get('pocHeight') ?? '1.72');
  const loader = ctx.assets.loader;
  const t0 = performance.now();

  const gltf = await loader.loadAsync(URLS.base);
  gltf.scene.updateMatrixWorld(true);
  // scale so the BODY (soles to crown) is `height`, whatever the hair adds
  const bodyBox = new THREE.Box3().setFromObject(gltf.scene.getObjectByName('Body_Full'));
  const allBox = new THREE.Box3().setFromObject(gltf.scene);
  const bodyH = bodyBox.max.y - bodyBox.min.y;
  const spec = { url: URLS.base, targetHeight: height * (allBox.max.y - allBox.min.y) / bodyH, yaw: 0 };
  const entry = ctx.assets.normalize('heroine', gltf, spec);
  const root = entry.root;

  selectBody(root, outfit);
  selectHair(root, P.get('pocHair'));
  const parts = await attachOutfit(loader, root, outfit, { hood });
  applyShadowPolicy(root);

  root.userData.rigProfile = ubcProfile(root);
  // A/B switch for the finger-axis finding: `pocFingerAxes=0` curls about the
  // animator's stock local +Z (the UE4 convention) instead of the derived axes
  if (P.get('pocFingerAxes') === '0') root.userData.rigProfile.fingerAxes = {};

  // the Player and ClipLibrary read `models.aloy`: hand them the heroine
  ctx.assets.models.aloyOriginal = ctx.assets.models.aloy;
  ctx.assets.models.aloy = entry;
  ctx.assets.models.heroine = entry;

  const state = {
    outfit, hood, height, bodyH, scale: root.children[0].scale.x,
    loadMs: Math.round(performance.now() - t0), parts: parts.length,
    swaps: 0,
  };

  const api = {
    state,
    /** Measurement channel for the gates / screenshot --eval. */
    async info() {
      const p = ctx.player, an = p?.animator, lib = an?.lib;
      const meshes = [];
      p?.model.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        const idx = o.geometry.index;
        meshes.push({ name: o.name, tris: (idx ? idx.count : o.geometry.attributes.position.count) / 3,
          verts: o.geometry.attributes.position.count, cast: o.castShadow,
          mats: [].concat(o.material).map((m) => m.name) });
      });
      const sizes = {};
      for (const [k, u] of Object.entries(URLS)) {
        try { const r = await fetch(u); sizes[k] = (await r.arrayBuffer()).byteLength; } catch { sizes[k] = null; }
      }
      const rt = lib?.retargeter;
      const keyMissing = an ? Object.entries(an.KEY).filter(([k, v]) => !an.b[k]).map(([k, v]) => `${k}:${v}`) : null;
      return {
        state,
        rig: an ? {
          name: an.rigName, keyMissing, bones: Object.keys(an.bones).length,
          fingersL: an._fingerL.length, fingersR: an._fingerR.length,
          fingerAxisSet: an._fingerL.filter((e) => e.curlAxis).length + an._fingerR.filter((e) => e.curlAxis).length,
          chains: an._chains.map((c) => ({ root: c.links[0].name, n: c.links.length, cls: c.cls.name })),
          twists: an._twists.length, armLen: [an._lenUpL, an._lenLoL, an._lenUpR, an._lenLoR].map((x) => +x.toFixed(3)),
          ballRest: +an._ballRest.toFixed(4), ankRest: +an._ankRest.toFixed(4),
          bindPitchDeg: an._bindPitch.map((x) => +(x * 180 / Math.PI).toFixed(1)),
          pelvisRestY: +an._pelvisRestY.toFixed(3),
          melee: an.melee?.ok ?? null,
        } : null,
        retarget: rt ? {
          hipScale: +rt.hipScale.toFixed(4), missingSource: rt.missingSource, missingTarget: rt.missingTarget,
          animated: lib.animatedNames.size,
        } : null,
        clips: lib ? lib.report() : null,
        meshes,
        tris: meshes.reduce((s, m) => s + m.tris, 0),
        draws: meshes.length,
        shadowCasters: meshes.filter((m) => m.cast).length,
        fileBytes: sizes,
      };
    },

    /** Swap the outfit on the LIVE player. Returns renderer memory before/after. */
    async wear(name) {
      const p = ctx.player;
      const r = ctx.renderer.info.memory;
      const before = { geometries: r.geometries, textures: r.textures };
      const gone = [];
      p.model.traverse((o) => { if (o.isSkinnedMesh && o.userData.pocOutfit) gone.push(o); });
      for (const m of gone) {
        m.parent.remove(m);
        // the player wraps every material in a fade clone (`_collectMaterials`):
        // dispose the clone AND its source, and drop both bookkeeping entries
        for (const mat of [].concat(m.material)) {
          for (const [src, clone] of p._matMap || []) {
            if (clone !== mat) continue;
            disposeMesh({ material: src });
            p._matMap.delete(src);
          }
          const i = (p._mats || []).findIndex((e) => e.mat === mat);
          if (i >= 0) p._mats.splice(i, 1);
        }
        disposeMesh(m);
      }
      selectBody(p.model, name);
      const added = await attachOutfit(loader, p.model, name, { hood: state.hood });
      p._collectMaterials?.();
      state.outfit = name; state.swaps++;
      return { before, removed: gone.length, added: added.length };
    },

    /** Build the 8-NPC lineup (see `buildLineup`). */
    async lineup(at) { return buildLineup(ctx, api, at); },

    hood(on) {
      state.hood = !!on;
      ctx.player.model.traverse((o) => { if (o.isSkinnedMesh && /Hood/.test(o.name)) o.visible = state.hood; });
      return state.hood;
    },

    dispose() {
      api._lineup?.dispose();
      const p = ctx.player;
      const gone = [];
      p?.model.traverse((o) => { if (o.isSkinnedMesh && o.userData.pocOutfit) gone.push(o); });
      for (const m of gone) { m.parent.remove(m); disposeMesh(m); }
    },
  };
  window.__POC__ = api;
  if (P.get('pocLineup') === '1') {
    // after the Player exists (its ClipLibrary holds the baked idle)
    const poll = setInterval(() => {
      if (!ctx.player?.animator?.lib) return;
      clearInterval(poll);
      buildLineup(ctx, api).catch((e) => console.error('[poc-human] lineup failed', e));
    }, 50);
  }
  console.info(`[poc-human] heroine bound: outfit=${outfit} body ${bodyH.toFixed(3)} m -> ${height} m, `
    + `${parts.length} outfit meshes, ${state.loadMs} ms`);
  return api;
}

/* ======================================================================== */
/*  NPC LINEUP — >= 8 visibly different people from 2 bodies, 4 outfits,    */
/*  6 hairstyles, tints; one skeleton per person, clips played natively     */
/* ======================================================================== */

/**
 * Each row: body, outfit, hair (`default` | alternate names joined by `+`),
 * hood, pauldrons, braid, outfit tint, skin tint, hair tint, height (m).
 * Tints are material.color multipliers on the CC0 textures — the cheapest
 * variation axis; the pack's Source tier ships 3 texture colourways per outfit.
 */
const LINEUP = [
  { body: 'f', outfit: 'ranger', hair: 'Long', hood: true, paul: true, tint: [1, 1, 1], skin: [1, 1, 1], h: 1.70 },
  { body: 'm', outfit: 'male-ranger', hair: 'Buzzed+Beard', hood: false, paul: true, tint: [0.62, 0.72, 1.15], skin: [0.72, 0.62, 0.56], hairC: [0.12, 0.09, 0.07], h: 1.84 },
  { body: 'f', outfit: 'peasant', hair: 'Buns', tint: [1, 1, 1], skin: [1.32, 1.22, 1.12], hairC: [0.55, 0.22, 0.09], h: 1.64 },
  { body: 'm', outfit: 'male-peasant', hair: 'default', tint: [1.1, 0.8, 0.62], skin: [1.25, 1.15, 1.05], hairC: [0.62, 0.48, 0.28], h: 1.76 },
  { body: 'f', outfit: 'ranger', hair: 'default', hood: false, paul: false, braid: true, tint: [1.25, 0.62, 0.48], skin: [0.78, 0.66, 0.58], h: 1.72 },
  { body: 'm', outfit: 'male-ranger', hair: 'default', hood: true, paul: false, tint: [0.55, 0.55, 0.55], skin: [1, 1, 1], h: 1.80 },
  { body: 'f', outfit: 'peasant', hair: 'Long', tint: [0.6, 0.85, 0.75], skin: [0.85, 0.74, 0.66], hairC: [0.05, 0.04, 0.04], h: 1.68 },
  { body: 'm', outfit: 'male-peasant', hair: 'Buzzed', tint: [0.7, 0.62, 0.95], skin: [0.62, 0.5, 0.44], hairC: [0.05, 0.04, 0.04], h: 1.79 },
];

async function loadRaw(loader, url) {
  const g = await loader.loadAsync(url);
  g.scene.updateMatrixWorld(true);
  return g.scene;
}

/** Bind clones of `parts` (outfit SkinnedMeshes) to `root`'s bones by name. */
function bindClones(root, parts, row) {
  const bones = boneMap(root);
  const armature = root.getObjectByName('Armature') || root;
  const made = [];
  for (const src of parts) {
    if (/Hood/.test(src.name) && !row.hood) continue;
    if (/Pauldron/.test(src.name) && row.paul === false) continue;
    const m = new THREE.SkinnedMesh(src.geometry, src.material);
    m.name = src.name;
    m.position.copy(src.position); m.quaternion.copy(src.quaternion); m.scale.copy(src.scale);
    armature.add(m);
    m.bind(new THREE.Skeleton(src.skeleton.bones.map((b) => bones.get(b.name)), src.skeleton.boneInverses), src.bindMatrix);
    made.push(m);
  }
  return made;
}

async function buildLineup(ctx, api, at = null) {
  if (api._lineup) return api._lineup.info;
  const loader = ctx.assets.loader;
  const lib = ctx.player.animator.lib;
  const idle = lib.get('idle').clip;
  const [fem, male] = await Promise.all([loadRaw(loader, URLS.base), loadRaw(loader, URLS.male)]);
  const outfits = {};
  for (const k of ['ranger', 'peasant', 'male-ranger', 'male-peasant']) {
    const sc = await loadRaw(loader, URLS[k]);
    outfits[k] = [];
    sc.traverse((o) => { if (o.isSkinnedMesh) outfits[k].push(o); });
  }
  const group = new THREE.Group();
  group.name = 'poc-lineup';
  const owned = { geos: new Set(), mats: new Set() };
  const mixers = [];
  const p = ctx.player;
  const cx = at?.x ?? p.position.x, cz = at?.z ?? p.position.z;
  const tintMat = (mat, rgb) => {
    if (!rgb || (rgb[0] === 1 && rgb[1] === 1 && rgb[2] === 1)) return mat;
    const c = mat.clone();
    c.color.setRGB(rgb[0], rgb[1], rgb[2]);
    owned.mats.add(c);
    return c;
  };
  LINEUP.forEach((row, i) => {
    const src = row.body === 'm' ? male : fem;
    const npc = skeletonClone(src);
    selectBody(npc, row.outfit);
    selectHair(npc, row.hair);
    npc.traverse((o) => {
      if (!o.isMesh) return;
      if (o.name === 'Braid') o.visible = !!row.braid;
      if (/^Body_|^Eyes|^Brows/.test(o.name) && row.skin && o.name.startsWith('Body_')) o.material = tintMat(o.material, row.skin);
      if (/^Hair|^HairAlt_|^Brows|^Braid/.test(o.name) && row.hairC) o.material = tintMat(o.material, row.hairC);
    });
    const parts = bindClones(npc, outfits[row.outfit], row);
    for (const m of parts) {
      const skinPart = /Regular/.test([].concat(m.material)[0]?.name || '');
      m.material = tintMat(m.material, skinPart ? row.skin : row.tint);
    }
    const root = new THREE.Group();
    root.name = `poc-npc-${i}`;
    const s = row.h / (row.body === 'm' ? 1.83 : 1.775);   // raw body heights (measured)
    npc.scale.setScalar(s);
    root.add(npc);
    // a row of 8, 1.15 m apart, 4 m in front of the player, facing her
    const x = cx + (i - 3.5) * 1.15, z = cz + 4.0;
    root.position.set(x, ctx.terrain?.getHeight ? ctx.terrain.getHeight(x, z) : 0, z);
    root.rotation.y = Math.PI;
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    group.add(root);
    const mixer = new THREE.AnimationMixer(npc);
    const act = mixer.clipAction(idle);
    act.play();
    act.time = (i * 0.37) % idle.duration;
    mixers.push(mixer);
  });
  ctx.scene.add(group);
  const sys = { update(dt) { for (let i = 0; i < mixers.length; i++) mixers[i].update(dt); } };
  ctx.game._add(sys);
  let draws = 0, tris = 0;
  group.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    draws++;
    tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });
  const info = { npcs: LINEUP.length, draws, tris, perNpcDraws: +(draws / LINEUP.length).toFixed(1) };
  api._lineup = {
    group, info,
    dispose() {
      const i = ctx.game.systems.indexOf(sys);
      if (i >= 0) ctx.game.systems.splice(i, 1);
      for (const m of mixers) { m.stopAllAction(); m.uncacheRoot(m.getRoot()); }
      ctx.scene.remove(group);
      for (const c of owned.mats) c.dispose();
      // geometry/textures are the loaded GLBs': dispose them once, here
      const seen = new Set();
      group.traverse((o) => {
        if (!o.isMesh) return;
        if (o.isSkinnedMesh) o.skeleton?.dispose();          // bone texture
        if (!seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
        for (const mat of [].concat(o.material)) {
          if (seen.has(mat)) continue;
          seen.add(mat);
          for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) mat[k]?.dispose?.();
          mat.dispose();
        }
      });
      api._lineup = null;
    },
  };
  console.info('[poc-human] lineup', info);
  return info;
}
