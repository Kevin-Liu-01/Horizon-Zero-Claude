// (M3 wave 3c, area E) THE TUBE SHELTER'S BRAZIER as the rest of "The Kiln Yards" ('tube-rest'): ctx.braziers holds
// 'tube-shelter' from boot, its prompt disabled while the Malpais is cold; it adopts the Brazier the region builds with
// its near form (src/world/sites/malpais-region.js) once the region is ready, kindles and rests there, and the rest's
// event is the one the quest waits for (kiln-yards.js: 'brazier-rest' {id} -> 'rested' {brazier}). The region taken down
// drops it again; an older record (no 'tube-shelter' in its list) still finds it open.
// node --test src/game/hour2/tube-rest.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { Braziers } from '../brazier/braziers.js';
import { BRAZIERS } from '../brazier/rules.js';
import { buildBrazier } from '../../world/settlements/brazier.js';
import { TUBE_SHELTER } from '../../world/sites/malpais-layout.js';
import { REGIONS } from '../../core/regions.js';
import { heightAt } from '../../world/island/recipe.js';
import { PLACES } from './plan.js';

const systems = JSON.parse(readFileSync(new URL('../text/ui/systems.json', import.meta.url), 'utf8'));

function world() {
  const scene = new THREE.Scene();
  const events = [];
  const entries = [];
  const terrain = { getHeight: (x, z) => heightAt(x, z), malpais: { state: 'cold', _held: null } };
  const ctx = {
    scene, terrain,
    environment: { time: 15, weather: 'trade', wind: { x: 1, z: 0 }, weatherParams: { windMS: 5 }, setTime(h) { this.time = h; } },
    player: { position: new THREE.Vector3(TUBE_SHELTER.brazier.x, 0, TUBE_SHELTER.brazier.z + 1), health: 40, maxHealth: 100, gourd: 0, maxGourd: 100 },
    interactables: { register: (e) => { entries.push(e); return e; }, unregister: () => {} },
    events: { emit: (n, e) => events.push([n, e]) },
    machines: { list: [] },
  };
  const present = { busy: false, brazier: async ({ rows }) => rows.find((r) => r.id === 'golden')?.id ?? rows[0]?.id ?? null };
  const B = new Braziers(ctx, { strings: { systems }, present, save: () => ({ ok: true }) });
  return { ctx, B, events, entries, scene };
}

/** what the Malpais region does on approach: its own Brazier, cold, in its group in the scene */
function buildRegion(w) {
  const br = buildBrazier({ terrain: w.ctx.terrain, x: TUBE_SHELTER.brazier.x, z: TUBE_SHELTER.brazier.z, yaw: 0, cistern: false, seed: 23 });
  br.setState({ kindled: false, burning: false });
  const group = new THREE.Group();
  group.add(br.group);
  w.scene.add(group);
  w.ctx.terrain.malpais = { state: 'ready', _held: { brazier: br, group } };
  return { br, group };
}

test('the tube shelter is a Brazier of the list, open to kindle, at the Malpais\' own spot; the Malpais is built', () => {
  const def = BRAZIERS.find((b) => b.id === 'tube-shelter');
  assert.ok(def, 'no tube-shelter in BRAZIERS');
  assert.equal(def.locked, false);
  assert.equal(def.region, 'malpais');
  assert.equal(REGIONS.find((r) => r.id === 'malpais').built, true);
  assert.ok(systems.brazier.names['tube-shelter'], 'no name for the tube shelter');
  assert.equal(PLACES.tubeShelter.x, TUBE_SHELTER.brazier.x);
  assert.equal(PLACES.tubeShelter.z, TUBE_SHELTER.brazier.z);
});

test('cold region: the record stands, no object, its prompt disabled, and nothing throws in the frame', () => {
  const w = world();
  const rec = w.B.byId('tube-shelter');
  assert.ok(rec);
  assert.equal(rec.obj, null);
  assert.ok(rec.entry && rec.entry.disabled === true);
  assert.ok(Math.hypot(rec.entry.position.x - TUBE_SHELTER.brazier.x, rec.entry.position.z - TUBE_SHELTER.brazier.z) < 1e-6);
  for (let i = 0; i < 4; i++) w.B.update(0.3, i * 0.3);
  assert.equal(w.B.dialog('tube-shelter').mode, 'kindle');
  assert.equal(w.B.seatHere(), false);
  return w.B.interact('tube-shelter').then((r) => assert.equal(r, null, 'no kindling with no Brazier standing'));
});

test('ready region: adopted, kindled by E, rested at; the rest is the event the quest waits for; depart drops it', async () => {
  const w = world();
  const { br } = buildRegion(w);
  w.B.update(0.016, 0);
  const rec = w.B.byId('tube-shelter');
  assert.equal(rec.obj, br, 'the region\'s own object is adopted (no second Brazier)');
  assert.equal(rec.entry.disabled, false);
  assert.equal(rec.entry.label, systems.brazier.six.kindle);
  // E (held 2 s): kindled
  const k = await w.B.interact('tube-shelter');
  assert.deepEqual(k, { ok: true, kindled: 'tube-shelter' });
  assert.ok(w.B.lit.has('tube-shelter'));
  assert.equal(br.state.kindled, true);
  // E again: the rest dialog; GOLDEN chosen
  const r = await w.B.interact('tube-shelter');
  assert.equal(r.ok, true);
  assert.equal(r.choice, 'golden');
  const ev = w.events.find(([n]) => n === 'brazier-rest');
  assert.deepEqual(ev[1].id, 'tube-shelter');
  assert.equal(w.ctx.player.health, 100);
  assert.equal(w.B.lastRest.id, 'tube-shelter');
  // the fire light parks at it once it burns
  for (let i = 0; i < 30; i++) w.B.update(0.016, i * 0.016);
  assert.ok(w.B.light.position.distanceTo(br.position) < 1.6);
  assert.ok(w.B.light.intensity > 0);
  // the region departs: dropped, its prompt off; the lit state is kept and goes on the next object
  w.ctx.terrain.malpais = { state: 'cold', _held: null };
  w.B.update(0.016, 1);
  assert.equal(rec.obj, null);
  assert.equal(rec.entry.disabled, true);
  const again = buildRegion(w);
  w.B.update(0.016, 2);
  assert.equal(rec.obj, again.br);
  assert.equal(again.br.state.kindled, true);
  // the save round trip, and an older record that never listed it
  const s = w.B.serialize();
  assert.ok(s.lit.includes('tube-shelter'));
  w.B.restore({ lit: ['cistern'], ash: [], unlocked: ['cistern'], lastRest: null });
  assert.ok(w.B.unlocked.has('tube-shelter'));
  assert.equal(w.B.lit.has('tube-shelter'), false);
  w.B.dispose();
});

test('refused while a Kiln within 60 m is wary, as every Brazier', async () => {
  const w = world();
  buildRegion(w);
  w.B.update(0.016, 0);
  await w.B.interact('tube-shelter');
  w.ctx.machines.list.push({ kind: 'kiln', alive: true, lampState: 'wary', position: new THREE.Vector3(TUBE_SHELTER.brazier.x + 30, 0, TUBE_SHELTER.brazier.z) });
  assert.equal(w.B.dialog('tube-shelter').mode, 'refused');
});
