// Milestone 2 area D (wave 3): the rules of Oro's kit in Node (Tier 0, no browser). KT3 (times), KT4 (the Windwall),
// KT5 (the pot cast), KT6 (statuses), and the gaff's verbs. The game runs these same files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POTS, POT_CAST, castVelocity, flyPot, clampAim, PotBelt, PotField, castPhase } from './pots.js';
import { ST, STATUS, STATUS_WORDS, StatusBook, tearSeized, hookRipTear, isSeized } from './status.js';
import { WINDWALL, WINDWALL_FAN, WindwallState, guardCovers, plantShape } from './windwall.js';
import { GAFF_LIGHTS, HOOK_RIP, GaffVerbs, verbContactAt, verbTotal } from './gaff.js';
import { setOccluder, clearOccluders, sightBlocked } from '../instruments/lib/sight.js';

/** a seeded generator, so the trials are the same every run */
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** hue (deg) of #rrggbb */
function hue(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 1e-6) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

test('KT5: the pot cast lands within 0.5 m of the aimed point at 6-14 m, 10 of 10, on flat and sloping ground', () => {
  const R = rng(7);
  const grounds = { flat: () => 0, slope: (x, z) => 0.18 * x - 0.07 * z, bumps: (x, z) => 0.4 * Math.sin(x * 0.3) * Math.cos(z * 0.25) };
  for (const [name, gy] of Object.entries(grounds)) {
    let ok = 0, worst = 0;
    for (let i = 0; i < 10; i++) {
      const d = 6 + 8 * (i / 9), a = R() * Math.PI * 2;
      // the release: her hand in front of her at hip-to-chest height (0.95-1.25 m over her feet)
      const from = { x: 0, y: gy(0, 0) + 0.95 + 0.3 * R(), z: 0 };
      const to = { x: Math.sin(a) * d, z: Math.cos(a) * d, y: 0 }; to.y = gy(to.x, to.z);
      const v = castVelocity(from, to);
      assert.ok(v, `${name} ${i}: a velocity`);
      const land = flyPot(from, v, gy, 1 / 60);
      const miss = Math.hypot(land.x - to.x, land.z - to.z);
      worst = Math.max(worst, miss);
      if (miss <= 0.5) ok++;
    }
    assert.equal(ok, 10, `${name}: ${ok}/10 within 0.5 m (worst ${worst.toFixed(3)} m)`);
  }
});

test('KT5: the aim is clamped to the cast range; the fields and their colours (nothing violet)', () => {
  const c = clampAim({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 40 }, () => 0);
  assert.equal(+c.z.toFixed(3), POT_CAST.maxRange);
  assert.equal(POTS.brine.colour, '#BDE6E3');
  assert.equal(POTS.cinder.colour, '#FF7A1A');
  assert.equal(POTS.brine.radius, 3); assert.equal(POTS.brine.lifeS, 8);
  assert.equal(POTS.cinder.radius, 2.5); assert.equal(POTS.cinder.lifeS, 6);
  for (const p of Object.values(POTS)) {
    const h = hue(p.colour);
    assert.ok(!(h >= 250 && h <= 320), `${p.id} ${p.colour} hue ${h.toFixed(0)} is not violet`);
  }
  const f = new PotField('brine', { x: 0, y: 0, z: 0 });
  assert.ok(f.contains(2.9, 1, 0)); assert.ok(!f.contains(3.1, 1, 0));
  for (let i = 0; i < 8 * 60; i++) f.step(1 / 60);
  assert.ok(!f.alive, 'the mist is gone after 8 s');
});

test('KT3: pot from belt to release 450-650 ms; Windwall open to guard 200-300 ms; the gaff verbs', () => {
  assert.ok(POT_CAST.releaseAt >= 0.45 && POT_CAST.releaseAt <= 0.65, `release at ${POT_CAST.releaseAt}`);
  const sum = POT_CAST.phases.slice(0, 3).reduce((a, p) => a + p[1], 0);
  assert.ok(Math.abs(sum - POT_CAST.releaseAt) < 1e-9, 'the phases T B F end at the release');
  assert.equal(castPhase(0.1)[0], 'T'); assert.equal(castPhase(0.3)[0], 'B'); assert.equal(castPhase(0.4)[0], 'F');
  assert.ok(WINDWALL.openS >= 0.2 && WINDWALL.openS <= 0.3);
  const ww = new WindwallState(); ww.owned = true; ww.guard(true);
  let upAt = null;
  for (let i = 1; i <= 40 && upAt == null; i++) if (ww.step(1 / 60) === 'up') upAt = i / 60;
  assert.ok(upAt >= 0.2 && upAt <= 0.3 + 1 / 60, `request to guard ${upAt}`);
  for (const L of GAFF_LIGHTS) assert.ok(verbTotal(L) <= 0.65, `${L.id} ${verbTotal(L)} s`);
});

test('the owner\'s bar in the rules: the fan stays shut until the arm is half up, folds before the arm goes down, and a raise turned into a fold (or back) is continuous', () => {
  // (no step of the arm or the fan over 0.3 of its range, at the turns as anywhere: the fan's own fastest step, as it
  // snaps open over the guard's last 8 steps, is 0.29)
  const ww = new WindwallState(); ww.owned = true; ww.guard(true);
  let last = { arm: 0, open: ww.open };
  const look = () => {
    if (ww.arm < 0.5) assert.ok(ww.open < 0.3, `open ${ww.open} at arm ${ww.arm} (${ww.phase})`);
    const d = Math.max(Math.abs(ww.arm - last.arm), Math.abs(ww.open - last.open));
    assert.ok(d < 0.3, `a step of ${d.toFixed(3)} (${ww.phase}, t ${ww.t.toFixed(3)})`);
    last = { arm: ww.arm, open: ww.open };
  };
  for (let i = 0; i < 9; i++) { ww.step(1 / 60); look(); }
  ww.guard(false);
  for (let i = 0; i < 5; i++) { ww.step(1 / 60); look(); }
  ww.guard(true);
  while (ww.phase !== 'guard') { ww.step(1 / 60); look(); }
  ww.guard(false);
  while (ww.phase !== 'stowed') { ww.step(1 / 60); look(); }
  assert.equal(ww.arm, 0); assert.equal(ww.open, WINDWALL_FAN.closed);
});

test('KT4: the guard covers a frontal hit inside 120 deg; a parry window of 150-220 ms; blocks and parries', () => {
  const D = Math.PI / 180;
  assert.ok(guardCovers(0, Math.sin(59 * D), Math.cos(59 * D)));
  assert.ok(!guardCovers(0, Math.sin(61 * D), Math.cos(61 * D)));
  assert.ok(WINDWALL.parryS >= 0.15 && WINDWALL.parryS <= 0.22);
  const ww = new WindwallState(); ww.owned = true; ww.guard(true);
  while (ww.phase !== 'guard') ww.step(1 / 60);
  const me = { x: 0, z: 0, heading: 0 };
  ww.step(0.1);
  assert.equal(ww.block({ x: 0, z: 5 }, me), 'parry');
  ww.step(0.1);
  assert.equal(ww.block({ x: 0, z: 5 }, me), 'block');
  assert.equal(ww.block({ x: 0, z: -5 }, me), null, 'from behind: not covered');
});

test('KT4: planted, 0.9 m of cover in the occluder list within 1 step; blocks a Plumb\'s sightline in 10 of 10 crouched trials; plant only from guard', () => {
  clearOccluders('test:');
  const ww = new WindwallState(); ww.owned = true;
  assert.equal(ww.plant(), false, 'no plant from stowed');
  ww.guard(true);
  while (ww.phase !== 'guard') ww.step(1 / 60);
  assert.ok(ww.plant());
  const me = { x: 0, y: 0, z: 0, heading: 0 };
  let steps = 0, ev = null;
  while (ev !== 'planted' && steps < 60) { ev = ww.step(1 / 60, me); steps++; }
  assert.equal(ev, 'planted');
  // the occluder goes in on the step of the plant (combat's apply)
  const shape = plantShape(me.x, me.y, me.z, me.heading);
  setOccluder('test:windwall', shape);
  assert.ok(Math.abs(shape.hy * 2 - 0.91) < 0.02, `cover height ${shape.hy * 2}`);
  const R = rng(11);
  let blocked = 0;
  for (let i = 0; i < 10; i++) {
    // a Plumb's lamp 10-20 m in front of her, inside 20 deg of the line she planted it on (she plants it facing the
    // machine), its eye 2.2-4 m over her ground (the lamp's height, or the Plumb on a terrace above her)
    const d = 10 + 10 * R(), a = (R() - 0.5) * 40 * Math.PI / 180, eye = 2.2 + 1.8 * R();
    // crouched: her head 0.95 m, the chest the sight aims at 0.72 m, 0.05 m behind her feet' line
    const tgt = { x: 0, y: 0.72, z: -0.05 };
    if (sightBlocked(Math.sin(a) * d, eye, Math.cos(a) * d, tgt.x, tgt.y, tgt.z)) blocked++;
  }
  assert.equal(blocked, 10, `${blocked}/10 crouched trials blocked`);
  clearOccluders('test:');
});

test('KT6: Seized locks the joints 8 s with no damage multiplier; a seized part comes off with one Pry or one hook-rip; ids never in UI words', () => {
  const book = new StatusBook();
  const part = { name: 'ram seal', tearable: true, tearHp: 80, attached: true };
  const m = { alive: true, walkSpeed: 2, runSpeed: 6, sizeClass: 'large', parts: [part] };
  assert.equal(hookRipTear(m, part), 0, 'a large kind: the hook-rip takes only a seized part');
  assert.equal(tearSeized(part, 10), 10);
  book.apply(m, ST.lock, { parts: [part] });
  assert.ok(isSeized(part));
  assert.equal(m.walkSpeed, 2 * STATUS[ST.lock].speedK);
  assert.equal(STATUS[ST.lock].damageK, 1, 'no damage multiplier');
  assert.ok(tearSeized(part, 10) > part.tearHp, 'one Pry takes it');
  assert.ok(hookRipTear(m, part) > part.tearHp, 'one hook-rip takes it');
  for (let i = 0; i < 8 * 60 + 2; i++) book.step(1 / 60);
  assert.ok(!isSeized(part)); assert.equal(m.walkSpeed, 2); assert.equal(m.runSpeed, 6);
  // a medium kind: the hook-rip takes any tearable part in one rip
  const blade = { name: 'blade', tearable: true, tearHp: 40, attached: true };
  assert.ok(hookRipTear({ sizeClass: 'medium' }, blade) > 40);
  // Clouded: the lamp dark 6 s
  const p = { alive: true };
  book.apply(p, ST.blind);
  assert.equal(p.lampDarkT, 6);
  for (const id of Object.values(ST)) for (const w of STATUS_WORDS) assert.ok(!w.toLowerCase().includes(id.toLowerCase()) && !w.includes('st.'), `${w} carries no id`);
});

test('the belt: cap 3, the wheel cycles what she carries, a cast spends the selected pot', () => {
  const b = new PotBelt();
  assert.equal(b.add('brine', 2), 2); assert.equal(b.add('cinder', 1), 1); assert.equal(b.add('dust', 1), 0, 'cap 3');
  assert.equal(b.selected, 'brine');
  assert.equal(b.cycle(1), 'cinder'); assert.equal(b.cycle(1), 'brine');
  assert.equal(b.take(), 'brine'); assert.equal(b.count.brine, 1);
  b.selected = 'cinder'; assert.equal(b.take(), 'cinder'); assert.equal(b.selected, 'brine');
});

test('the gaff: three lights chain on presses inside the combo window; one contact each; the hook-rip', () => {
  const g = new GaffVerbs();
  g.strike();
  const ev = [], ids = new Set();
  for (let i = 0; i < 120; i++) {
    if (g.verb && g.t > 0.12 && g.i < 2) g.strike();
    const e = g.step(1 / 60);
    if (g.verb) ids.add(g.verb.id);
    if (e) ev.push(`${e}:${g.verb?.id ?? '-'}`);
  }
  const contacts = ev.filter((e) => e.startsWith('contact')).length;
  assert.equal(contacts, 3, ev.join(' '));
  assert.deepEqual([...ids], ['light1', 'light2', 'light3'], ev.join(' '));
  const h = new GaffVerbs();
  assert.ok(h.hookRip());
  let c = -1;
  for (let i = 1; i < 60; i++) if (h.step(1 / 60) === 'contact') { c = i / 60; break; }
  assert.ok(Math.abs(c - verbContactAt(HOOK_RIP)) < 1 / 60 + 1e-9, `contact at ${c}`);
});

test('the seam with a kind that answers its own parts: Brine seizes the seals the mist reaches, by the kind\'s names', () => {
  const book = new StatusBook();
  const calls = [];
  const m = { alive: true, walkSpeed: 1.4, kitBlow: (n, k) => { calls.push([n, k]); return 'seized'; } };
  book.apply(m, ST.lock, { parts: [], kitParts: ['sealL'] });
  assert.deepEqual(calls, [['sealL', 'brine']]);
  calls.length = 0;
  const m2 = { alive: true, kitBlow: (n, k) => { calls.push([n, k]); return 'seized'; } };
  book.apply(m2, ST.lock, { parts: [] });
  assert.deepEqual(calls, [['seal', 'brine']], 'no names reached: its own nearest seal');
});

test('KT9 (the Windwall\'s worth, a scripted thrust source): damage through three Spindle-class thrusts is >= 30 % less than with bow and lance only', () => {
  // the thrust: a 0.6 s wind-up she can read, then the hit from 2.5 m in front of her, 30 damage; three, 2.2 s apart.
  // KT0 (bow and lance only): nothing covers her; she takes all three. With the Windwall: she raises the guard 0.25 s
  // into each wind-up (a reaction), so the fan locks open 0.117 s before the hit: inside the parry window on the first
  // reading, and she lets it down 0.3 s after each hit. Sim time, 60 Hz.
  const D = 30, me = { x: 0, z: 0, heading: 0 }, from = { x: 0, z: 2.5 };
  const KT0 = 3 * D;
  const ww = new WindwallState(); ww.owned = true;
  let taken = 0, parries = 0, blocks = 0;
  const hits = [0.6, 2.8, 5.0];
  for (let i = 0, t = 0; i < 6.5 * 60; i++, t = i / 60) {
    const want = hits.some((h) => t >= h - 0.35 && t < h + 0.3);
    ww.guard(want);
    ww.step(1 / 60, { ...me, y: 0 });
    for (const h of hits) if (Math.abs(t - h) < 0.5 / 60) {
      const r = ww.block(from, me);
      if (r === 'parry') parries++; else if (r === 'block') { blocks++; taken += D * WINDWALL.blockK; } else taken += D;
    }
  }
  const less = 1 - taken / KT0;
  assert.ok(less >= 0.30, `damage through ${taken.toFixed(1)} of ${KT0} (KT0): ${(less * 100).toFixed(0)} % less (parries ${parries}, blocks ${blocks})`);
});
