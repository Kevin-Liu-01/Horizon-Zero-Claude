import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const names = process.argv.slice(2);
for (const n of names) {
  const doc = await io.read(`public/models/${n}.glb`);
  const root = doc.getRoot();
  console.log(`\n=== ${n} ===`);
  console.log('skins', root.listSkins().length, 'anims', root.listAnimations().map(a=>a.getName()).join(','));
  console.log('materials', root.listMaterials().length, 'textures', root.listTextures().length);
  for (const t of root.listTextures()) {
    const img = t.getImage();
    console.log('  tex', JSON.stringify(t.getName()), t.getMimeType(), img?.byteLength, t.getSize());
  }
  for (const m of root.listMaterials()) {
    console.log('  mat', JSON.stringify(m.getName()), 'base', m.getBaseColorFactor().map(x=>+x.toFixed(2)).join(','),
      'map', m.getBaseColorTexture()?.getName() ?? '-', 'nrm', m.getNormalTexture()?.getName() ?? '-',
      'mr', m.getMetallicRoughnessTexture()?.getName() ?? '-', 'emis', m.getEmissiveTexture()?.getName() ?? '-',
      'occl', m.getOcclusionTexture()?.getName() ?? '-', 'alpha', m.getAlphaMode());
  }
  const walk = (node, d=0) => {
    const mesh = node.getMesh();
    const sk = node.getSkin();
    if (mesh) {
      for (const p of mesh.listPrimitives()) {
        console.log(' '.repeat(d) + `node ${JSON.stringify(node.getName())} mesh=${JSON.stringify(mesh.getName())} skin=${sk?'Y':'n'} verts=${p.getAttribute('POSITION').getCount()} mat=${JSON.stringify(p.getMaterial()?.getName())} attrs=${p.listSemantics().join('/')}`);
      }
    }
    for (const c of node.listChildren()) walk(c, d+1);
  };
  for (const s of root.listScenes()) for (const nd of s.listChildren()) walk(nd, 0);
}
