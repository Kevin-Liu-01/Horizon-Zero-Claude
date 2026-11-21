/**
 * M3 wave 3, area C: the SURFACES as built (public/models/instruments/{kiln,davit,sonde}.glb, from
 * tools/build/instruments/gen-m3-art.mjs), browser-free:  node --test tools/gates/instruments/m3/art.test.mjs
 *
 *   IK1 at art   height within 0.1 m of the roster (Kiln 5.5, Davit 4.2, Sonde 3.0), length and width within 0.16 m;
 *                LOD0 triangles under the class cap (80 k / 50 k / 25 k); every texture inside 1024 x 1024
 *   one source   the anchors the rules use are the form's exactly: the firebox door, the hose coupling, the keel ring,
 *                and the lamp at its form position (within 0.02 m); the moving and removable pieces are their own
 *                nodes (the Kiln's door, stack and hose; the Davit's three plates; the Sonde's two rotors)
 *   one lamp     one lamp socket, mounted: within its radius + 0.05 m of the hull's own vertices
 *   the never list nothing emissive but pale-ice glass (no bluer or brighter than #D6F0EE) and the Kiln's fire; the fire
 *                only behind the firebox door: its box inside the door's outline and behind the door's back face, so the
 *                shut door covers it from every bearing in front (no glow inside a body, no red lamp)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization, KHRTextureTransform } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { M3_FORMS } from './forms.mjs';
import { KILN_DOOR, KILN_COUPLING } from '../../../../src/instruments/kinds/kiln/form.js';
import { SONDE_KEEL } from '../../../../src/instruments/kinds/sonde/form.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const KINDS = ['kiln', 'davit', 'sonde'];
const CAP = { kiln: 80000, davit: 50000, sonde: 25000 };
const TOOLS = { kiln: ['door', 'stack', 'hose'], davit: ['plate1', 'plate2', 'plate3'], sonde: ['rotorR', 'rotorL'] };
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const ICE = [0xd6, 0xf0, 0xee].map((c) => lin(c / 255));

async function load(file) {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, KHRTextureTransform]).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  return io.read(file);
}
/** Every vertex of a node's mesh in the body frame (quantised positions carry their scale on the node). */
function verts(node) {
  const W = node.getWorldMatrix(), out = [];
  for (const prim of node.getMesh()?.listPrimitives() || []) {
    const P = prim.getAttribute('POSITION'), el = [0, 0, 0];
    for (let i = 0; i < P.getCount(); i++) {
      P.getElement(i, el);
      out.push([W[0] * el[0] + W[4] * el[1] + W[8] * el[2] + W[12], W[1] * el[0] + W[5] * el[1] + W[9] * el[2] + W[13], W[2] * el[0] + W[6] * el[1] + W[10] * el[2] + W[14]]);
    }
  }
  return out;
}
const boxOf = (vs) => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const v of vs) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[k]); mx[k] = Math.max(mx[k], v[k]); } return { mn, mx }; };
const near = (a, b, tol) => a.every((v, k) => Math.abs(v - b[k]) <= tol);

test('M3 surfaces: IK1 at art, one source, one mounted lamp, the never list', async () => {
  const out = {};
  for (const kind of KINDS) {
    const file = path.join(ROOT, 'public/models/instruments', `${kind}.glb`);
    const doc = await load(file);
    const ex = doc.getRoot().getAsset().extras, S = ex.r5Sockets, R = M3_FORMS[kind].roster, sz = ex.r5Size;
    assert.ok(Math.abs(sz[1] - R.H) <= 0.1 + 1e-9, `${kind} height ${sz[1]} vs ${R.H}`);
    assert.ok(Math.abs(sz[2] - R.L) <= 0.16 + 1e-9, `${kind} length ${sz[2]} vs ${R.L}`);
    assert.ok(Math.abs(sz[0] - R.W) <= 0.16 + 1e-9, `${kind} width ${sz[0]} vs ${R.W}`);
    const mt = ex.r5Stats.meshTris, lod0 = Object.entries(mt).filter(([n]) => !/-lod1$/.test(n)).reduce((s, [, v]) => s + v, 0);
    assert.ok(lod0 <= CAP[kind], `${kind} ${lod0} triangles over ${CAP[kind]}`);
    const tex = [];
    for (const t of doc.getRoot().listTextures()) { const m = await sharp(Buffer.from(t.getImage())).metadata(); tex.push([m.width, m.height]); assert.ok(m.width <= 1024 && m.height <= 1024, `${kind} texture ${m.width}x${m.height}`); }
    // the moving and removable pieces
    const names = doc.getRoot().listNodes().map((n) => n.getName());
    for (const t of TOOLS[kind]) assert.ok(names.includes(t), `${kind} has no ${t} node`);
    // one lamp, at the form's place, mounted
    const lampPart = M3_FORMS[kind].parts.find((p) => p.lamp);
    assert.ok(Object.keys(S).filter((k) => k === 'lamp' || k === 'lens').length === 1, `${kind} lamp sockets`);
    assert.ok(Math.abs(S.lamp[0] - lampPart.c[0]) <= 0.02 && Math.abs(S.lamp[1] - lampPart.c[1]) <= 0.02 && Math.abs(S.lamp[2] - lampPart.c[2]) <= 0.03, `${kind} lamp ${S.lamp} vs form ${lampPart.c}`);
    const hullNode = doc.getRoot().listNodes().find((n) => n.getName() === `${kind}-hull`);
    let d = Infinity;
    for (const v of verts(hullNode)) d = Math.min(d, Math.hypot(v[0] - S.lamp[0], v[1] - S.lamp[1], v[2] - S.lamp[2]));
    assert.ok(d <= S.lampR + 0.05, `${kind} lamp ${d.toFixed(3)} m from its hull`);
    // the never list: emissive only in pale-ice glass and the Kiln's fire, the fire behind the shut door
    const emissive = [];
    for (const node of doc.getRoot().listNodes()) {
      for (const prim of node.getMesh()?.listPrimitives() || []) {
        const e = prim.getMaterial()?.getEmissiveFactor() || [0, 0, 0];
        if (e.some((v) => v > 0)) emissive.push({ node, name: prim.getMaterial().getName(), e });
      }
    }
    for (const em of emissive) {
      if (kind === 'kiln' && (em.name === 'r5-kiln-fire' || em.name === 'r5-kiln-crust')) {
        const f = boxOf(verts(em.node)), doorB = boxOf(verts(doc.getRoot().listNodes().find((n) => n.getName() === 'door')));
        assert.ok(f.mn[0] >= doorB.mn[0] - 1e-3 && f.mx[0] <= doorB.mx[0] + 1e-3 && f.mn[1] >= doorB.mn[1] - 1e-3 && f.mx[1] <= doorB.mx[1] + 1e-3, `fire ${JSON.stringify(f)} outside the door ${JSON.stringify(doorB)}`);
        assert.ok(f.mx[2] < doorB.mn[2], `fire front ${f.mx[2]} not behind the door's back ${doorB.mn[2]}`);
        out.fireBehindDoorM = +(doorB.mn[2] - f.mx[2]).toFixed(3);
        continue;
      }
      assert.ok(/glass/.test(em.name), `${kind}: ${em.name} is emissive`);
      for (let c = 0; c < 3; c++) assert.ok(em.e[c] <= ICE[c] + 1e-3, `${kind} glass emissive ${em.e} over pale ice`);
    }
    if (kind === 'kiln') {
      assert.ok(near(S.door, KILN_DOOR.c, 1e-4), `door ${S.door}`);
      assert.ok(near(S.coupling, KILN_COUPLING, 1e-4), `coupling ${S.coupling}`);
    }
    if (kind === 'sonde') assert.ok(near(S.keel, SONDE_KEEL, 1e-4), `keel ${S.keel}`);
    out[kind] = { size: sz, H: sz[1], lod0, cap: CAP[kind], textures: tex, lampToHull: +d.toFixed(3), emissive: emissive.map((x) => x.name), bytes: fs.statSync(file).size };
  }
  console.log(JSON.stringify(out));
});
