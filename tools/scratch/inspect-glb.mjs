import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
for (const name of process.argv.slice(2)) {
  const doc = await io.read(`public/models/${name}`);
  const r = doc.getRoot();
  console.log('====', name);
  console.log('meshes', r.listMeshes().length, 'materials', r.listMaterials().length, 'textures', r.listTextures().length, 'skins', r.listSkins().length, 'anims', r.listAnimations().map(a=>a.getName()).join(','));
  for (const t of r.listTextures()) {
    const img = t.getImage();
    console.log('  TEX', JSON.stringify(t.getName()), t.getMimeType(), t.getSize(), 'bytes', img?.byteLength);
  }
  for (const m of r.listMaterials()) {
    const maps = ['BaseColorTexture','NormalTexture','MetallicRoughnessTexture','EmissiveTexture','OcclusionTexture'];
    const has = maps.filter(k => m['get'+k] && m['get'+k]());
    console.log('  MAT', JSON.stringify(m.getName()), 'base', m.getBaseColorFactor().map(x=>+x.toFixed(2)).join(','),
      'mr', m.getMetallicFactor().toFixed(2), m.getRoughnessFactor().toFixed(2),
      'em', m.getEmissiveFactor().map(x=>+x.toFixed(2)).join(','), 'maps:', has.join('|') || 'none',
      'alpha', m.getAlphaMode());
  }
  let tris = 0;
  for (const me of r.listMeshes()) {
    const prims = me.listPrimitives();
    for (const p of prims) {
      const idx = p.getIndices();
      const n = idx ? idx.getCount()/3 : p.getAttribute('POSITION').getCount()/3;
      tris += n;
    }
    console.log('  MESH', JSON.stringify(me.getName()), 'prims', prims.length, prims.map(p=>p.getMaterial()?.getName()).join(','));
  }
  console.log('  TRIS', tris);
  // node hierarchy: which nodes hold meshes, and whether skinned
  const walk = (n, d=0) => {
    const mesh = n.getMesh(); const skin = n.getSkin();
    if (mesh || d < 3) console.log('   ', ' '.repeat(d*2), n.getName(), mesh ? `[mesh ${mesh.getName()}]` : '', skin ? '[SKIN]' : '');
    for (const c of n.listChildren()) walk(c, d+1);
  };
  for (const s of r.listScenes()) for (const n of s.listChildren()) walk(n);
}
