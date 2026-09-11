import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

function mul(a,b){const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;}
function trs(t,r,s){const[x,y,z,w]=r;const x2=x+x,y2=y+y,z2=z+z;const xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;
 return [ (1-(yy+zz))*s[0],(xy+wz)*s[0],(xz-wy)*s[0],0, (xy-wz)*s[1],(1-(xx+zz))*s[1],(yz+wx)*s[1],0, (xz+wy)*s[2],(yz-wx)*s[2],(1-(xx+yy))*s[2],0, t[0],t[1],t[2],1];}
function xf(m,v){return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];}

for (const file of process.argv.slice(2)) {
  const doc = await io.read(file); const root = doc.getRoot();
  const scene = root.listScenes()[0];
  const world = new Map();
  const walk = (node, parent) => {
    const local = trs(node.getTranslation(), node.getRotation(), node.getScale());
    const m = parent ? mul(parent, local) : local;
    world.set(node, m);
    for (const c of node.listChildren()) walk(c, m);
  };
  for (const n of scene.listChildren()) walk(n, null);

  const bb=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
  const acc=(p)=>{for(let i=0;i<3;i++){bb[i]=Math.min(bb[i],p[i]);bb[i+3]=Math.max(bb[i+3],p[i]);}};
  const joints = [];
  for (const [node,m] of world) {
    const mesh = node.getMesh(); if(!mesh) continue;
    const skin = node.getSkin();
    let jm = null;
    if (skin) {
      const ibmA = skin.getInverseBindMatrices();
      const js = skin.listJoints();
      jm = js.map((j,i)=>{ const ibm = ibmA.getElement(i,new Array(16)); return mul(world.get(j)||m, ibm); });
      js.forEach((j,i)=>{ const w=world.get(j); if(w) joints.push([j.getName(), w[12],w[13],w[14]]); });
    }
    for (const p of mesh.listPrimitives()) {
      const pos=p.getAttribute('POSITION'); if(!pos) continue;
      const JO=p.getAttribute('JOINTS_0'), WE=p.getAttribute('WEIGHTS_0');
      const v=new Array(3), j4=new Array(4), w4=new Array(4);
      for(let i=0;i<pos.getCount();i++){
        pos.getElement(i,v);
        if(jm&&JO&&WE){ JO.getElement(i,j4); WE.getElement(i,w4);
          let out=[0,0,0];
          for(let k=0;k<4;k++){ const w=w4[k]; if(!w) continue; const mm=jm[j4[k]]; if(!mm) continue; const t=xf(mm,v); out[0]+=t[0]*w; out[1]+=t[1]*w; out[2]+=t[2]*w; }
          acc(out);
        } else acc(xf(m,v));
      }
    }
  }
  const d=[bb[3]-bb[0],bb[4]-bb[1],bb[5]-bb[2]];
  console.log(`\n### ${file}`);
  console.log(`  worldBBox  X ${bb[0].toFixed(2)}..${bb[3].toFixed(2)}  Y ${bb[1].toFixed(2)}..${bb[4].toFixed(2)}  Z ${bb[2].toFixed(2)}..${bb[5].toFixed(2)}`);
  console.log(`  size  ${d.map(x=>x.toFixed(2)).join(' x ')}   (W x H x D)`);
  const want = process.env.JOINTS ? process.env.JOINTS.split(',') : [];
  if (want.length) for (const [n,x,y,z] of joints) if (want.some(w=>n.toLowerCase().includes(w.toLowerCase()))) console.log(`   joint ${n.padEnd(18)} ${x.toFixed(3)} ${y.toFixed(3)} ${z.toFixed(3)}`);
  if (process.env.ALLJOINTS) console.log('   joints: ' + joints.map(j=>j[0]).join(', '));
}
