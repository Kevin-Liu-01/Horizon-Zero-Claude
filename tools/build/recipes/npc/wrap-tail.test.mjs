/**
 * BUILD M1.5c (F21) — a person's head-wrap tail hangs from its knot, whatever the head does (node --test; no browser).
 *
 * F21 at 4175212 and 705c2f2 filmed the Boat-Caulker's wrap tail standing straight up over his crown to the rake head. The
 * people's wrap class (src/world/npc/people/chains.js) pulled each link to its authored rest carried rigidly by the head, ten
 * times harder than the strip's weight: a head bowed over work turned the authored down-and-back into up-and-back. The rest
 * now hangs (`hang`): the knot keeps its exit, the strip falls from it.
 *
 * The bench: the shipped person's skeleton in its bind pose, the whole body bowed 0-100 deg forward and turned to four
 * bearings, the trade wind (5.5 m/s from 045, the people's fallback), the live chain solver stepped at 60 Hz for 10 s. Bar:
 * after the first 2 s the tail's tip never rises above 0.05 m under its knot (before the fix: 0.12 m ABOVE it, caulker, 80 deg).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import * as THREE from 'three';
import { io, ROOT } from '../lib/human/face.mjs';
import { PersonChains } from '../../../../src/world/npc/people/chains.js';

const PEOPLE = ['boat-caulker', 'salt-raker', 'salt-porter', 'guild-matron'];
const BOWS = [0, 45, 80, 100], YAWS = [0, 90, 180, 270];
const WIND = { x: -3.9, z: 3.9 };

async function rig(id) {
  const doc = await (await io()).read(path.join(ROOT, 'public/models/npc', `${id}.glb`));
  const ex = doc.getRoot().getAsset().extras.r5Npc;
  const joints = doc.getRoot().listSkins()[0].listJoints();
  const parentOf = new Map();
  for (const n of doc.getRoot().listNodes()) for (const c of n.listChildren()) parentOf.set(c, n);
  const map = new Map(), bones = {};
  for (const j of joints) {
    const b = new THREE.Bone(); b.name = j.getName();
    b.position.fromArray(j.getTranslation()); b.quaternion.fromArray(j.getRotation()); b.scale.fromArray(j.getScale());
    map.set(j, b); bones[b.name] = b;
  }
  const root = new THREE.Group();
  for (const j of joints) { const p = parentOf.get(j); (p && map.has(p) ? map.get(p) : root).add(map.get(j)); }
  root.scale.setScalar(ex.scale);
  const bind = new Map(Object.values(bones).map((b) => [b, b.quaternion.clone()]));
  return { root, bones, ex, bind };
}

/** The worst (highest) tip-above-knot over 2-10 s of one bow and bearing, metres. */
function worst({ root, bones, ex, bind }, bowDeg, yawDeg) {
  for (const [b, q] of bind) b.quaternion.copy(q);   // the solver writes the links: every case starts from the bind pose
  root.rotation.set(bowDeg * Math.PI / 180, yawDeg * Math.PI / 180, 0, 'YXZ');
  root.updateMatrixWorld(true);
  const ch = new PersonChains(bones, ex.chains, { worldScale: ex.scale });
  const tail = ch.chains.find((c) => /^(hairTail|wrapSash)$/.test(c.key));
  if (!tail) return null;
  let hi = -Infinity;
  for (let f = 0; f < 600; f++) {
    ch.dt = 1 / 60; ch.update(WIND); root.updateMatrixWorld(true);
    if (f >= 120) hi = Math.max(hi, tail.tipPos.y - tail.pos[1]);
  }
  return hi;
}

test('a wrap tail hangs below its knot with the head bowed over work, in the trade wind', async () => {
  const rows = [];
  for (const id of PEOPLE) {
    const r = await rig(id);
    for (const bow of BOWS) for (const yaw of YAWS) {
      const h = worst(r, bow, yaw);
      if (h !== null) rows.push({ id, bow, yaw, h: +h.toFixed(3) });
    }
  }
  assert.ok(rows.length >= PEOPLE.length * BOWS.length * YAWS.length, `cases ${rows.length}`);
  const bad = rows.filter((q) => q.h > -0.05);
  assert.equal(bad.length, 0, `tip above 0.05 m under the knot: ${JSON.stringify(bad)}`);
});
