import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f); const root = doc.getRoot();
  const anims = root.listAnimations().map(a => a.getName());
  let tris = 0; const mats = new Set();
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    const idx = p.getIndices(); const pos = p.getAttribute('POSITION');
    tris += (idx ? idx.getCount() : pos.getCount()) / 3;
    if (p.getMaterial()) mats.add(p.getMaterial().getName());
  }
  // bbox
  let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9];
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    const pos = p.getAttribute('POSITION'); const a=[0,0,0];
    for (let i=0;i<pos.getCount();i++){ pos.getElement(i,a);
      for(let k=0;k<3;k++){ if(a[k]<mn[k])mn[k]=a[k]; if(a[k]>mx[k])mx[k]=a[k]; } }
  }
  console.log(f.split('/').pop(), '| tris', Math.round(tris), '| meshes', root.listMeshes().length,
    '| mats', [...mats].join(','), '| skins', root.listSkins().length,
    '| bbox', mn.map(v=>v.toFixed(2)).join(','), '->', mx.map(v=>v.toFixed(2)).join(','),
    '| size', mx.map((v,i)=>(v-mn[i]).toFixed(2)).join(' x '));
  console.log('   clips:', anims.join(', '));
  const sk = root.listSkins()[0];
  if (sk) {
    const names = sk.listJoints().map(j=>j.getName());
    console.log('   joints('+names.length+'):', names.join(', '));
  }
}
