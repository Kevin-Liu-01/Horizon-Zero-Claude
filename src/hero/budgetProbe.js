/**
 * M1.2g BUDGET PROBE (armory / hero-art). Not part of the game: tools/frames/film.mjs loads it with
 * `--probe /src/hero/budgetProbe.js` after a frame is staged and filmed, and its result lands in run.json.
 *
 *   probe(frame) -> {
 *     hero:     hero.info(): visible draws, triangles (index count inside the draw range, so the body's hidden faces
 *               are not counted), casters, skeletons, per mesh
 *     textures: { mb, list }  every texture Brea's visible meshes bind (material maps, and textures held in material
 *               uniforms / userData, e.g. the cloth and skin detail tiles), each counted once, at its GPU size:
 *               compressed (KTX2 transcoded) mip chains at their own byte length, other images at 4 bytes a texel
 *               with a 1/3 mip tail when mipmapped. Bone textures are counted with their meshes' skeletons
 *     frame:    renderer.info.render of the last frame (calls, triangles) for the whole filmed frame
 *   }
 * Reads only window.__CTX__.
 */
export async function probe() {
  const C = window.__CTX__, P = C.player, hero = P?.hero;
  const out = { hero: hero?.info ? hero.info() : null };
  const seen = new Map();
  const texBytes = (t) => {
    if (t.isCompressedTexture || t.isCompressedArrayTexture) {
      let b = 0;
      for (const m of t.mipmaps || []) b += m.data?.byteLength || 0;
      return { b, kind: 'compressed', w: t.image?.width, h: t.image?.height, fmt: t.format };
    }
    const img = t.image || {};
    const w = img.width || img.videoWidth || 0, h = img.height || img.videoHeight || 0, d = img.depth || 1;
    // RedFormat 1028: 1 channel, RGFormat 1030: 2, anything else (RGBAFormat 1023) 4; times the element size
    const ch = t.format === 1028 ? 1 : t.format === 1030 ? 2 : 4;
    const bpp = img.data ? (img.data.BYTES_PER_ELEMENT || 1) * ch : 4;
    const mip = t.generateMipmaps && t.minFilter !== 1006 && t.minFilter !== 1003 ? 4 / 3 : 1;
    return { b: Math.round(w * h * d * bpp * mip), kind: img.data ? 'data' : 'image', w, h };
  };
  const take = (t, where) => {
    if (!t || !t.isTexture || seen.has(t.uuid)) return;
    const r = texBytes(t);
    seen.set(t.uuid, { name: t.name || where, where, ...r });
  };
  const scan = (o, where, depth = 0) => {
    if (!o || typeof o !== 'object' || depth > 3) return;
    if (o.isTexture) { take(o, where); return; }
    for (const [k, v] of Object.entries(o)) {
      if (!v || typeof v !== 'object') continue;
      if (v.isTexture) take(v, `${where}.${k}`);
      else if (v.value && v.value.isTexture) take(v.value, `${where}.${k}`);
      else if (depth < 3 && !Array.isArray(v) && !v.isObject3D && !v.isMaterial) scan(v, `${where}.${k}`, depth + 1);
    }
  };
  const skeletons = new Set();
  P.model.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    for (let p = o.parent; p; p = p.parent) if (!p.visible) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap', 'specularMap', 'sheenColorMap', 'sheenRoughnessMap']) take(m[k], `${o.name}.${k}`);
      scan(m.uniforms, `${o.name}.uniforms`);
      scan(m.userData, `${o.name}.userData`);
    }
    if (o.isSkinnedMesh && o.skeleton) skeletons.add(o.skeleton);
  });
  let boneB = 0;
  for (const s of skeletons) if (s.boneTexture) boneB += s.boneTexture.image.width * s.boneTexture.image.height * 16;
  const list = [...seen.values()].sort((a, b) => b.b - a.b);
  const sum = list.reduce((a, t) => a + t.b, 0) + boneB;
  out.textures = { mb: +(sum / 1e6).toFixed(2), boneMB: +(boneB / 1e6).toFixed(3), count: list.length, list: list.map((t) => ({ name: t.name, where: t.where, kind: t.kind, w: t.w, h: t.h, mb: +(t.b / 1e6).toFixed(3) })) };
  const R = C.engine?.renderer;
  if (R?.info) out.frame = { calls: R.info.render.calls, triangles: R.info.render.triangles, textures: R.info.memory?.textures, geometries: R.info.memory?.geometries };
  return out;
}
