import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const file of process.argv.slice(2)) {
  try {
    const doc = await io.read(file);
    const root = doc.getRoot();
    const bytes = fs.statSync(file).size;
    let tris = 0, verts = 0;
    const bbox = [Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
    for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
      const idx = p.getIndices();
      const pos = p.getAttribute('POSITION');
      tris += idx ? idx.getCount()/3 : (pos ? pos.getCount()/3 : 0);
      if (pos) { verts += pos.getCount();
        const mn = pos.getMinNormalized ? pos.getMin([]) : pos.getMin([]);
        const mx = pos.getMax([]);
        for (let i=0;i<3;i++){ bbox[i]=Math.min(bbox[i],mn[i]); bbox[i+3]=Math.max(bbox[i+3],mx[i]); }
      }
    }
    const skins = root.listSkins().map(s => `${s.getName()||'skin'}:${s.listJoints().length}j`);
    const clips = root.listAnimations().map(a => a.getName());
    const meshNames = root.listMeshes().map(m=>m.getName()).slice(0,8);
    const dims = bbox[0]===Infinity ? 'n/a' : [bbox[3]-bbox[0],bbox[4]-bbox[1],bbox[5]-bbox[2]].map(v=>v.toFixed(2)).join(' x ');
    console.log(`\n### ${file}`);
    console.log(`  bytes=${bytes} tris=${Math.round(tris)} verts=${verts} meshes=${root.listMeshes().length} [${meshNames.join(', ')}]`);
    console.log(`  bboxWHD=${dims}  skins=[${skins.join(', ')}]`);
    console.log(`  clips(${clips.length})=${clips.join(', ')}`);
    const tex = root.listTextures().map(t=>`${t.getMimeType()}`);
    console.log(`  textures=${tex.length} materials=${root.listMaterials().length}`);
  } catch (e) { console.log(`\n### ${file}\n  ERROR: ${e.message}`); }
}
