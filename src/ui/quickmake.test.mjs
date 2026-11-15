// M1.6d: quick-make, pinned in Node (Tier 0, no browser). BIBLE §9 "hold a quick slot (1-4) for 1.2 s to
// quick-make a bundle of six ... taking damage interrupts it"; §16 "Reed arrow: cane ×2, gull feather ×1 -> 6"
// and "quick-make interrupted by damage makes nothing and loses nothing". The recipe is combat's own (AMMO);
// the hold is QuickSlots' own update on simulation steps of 1/60 s.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QuickSlots, QuickMake, QUICK_MAKE_S } from './quickslots.js';
import { AMMO } from '../combat/weapons.js';

/** A world with just enough of combat, the satchel, the keys and the events for the hold. */
function world() {
  const keys = new Set();
  const down = new Map();
  const listeners = new Map();
  const counts = new Map([['ridge-wood', 20], ['feather', 6]]);
  const inventory = {
    count: (id) => counts.get(id) ?? 0,
    take: (id, n) => { const h = counts.get(id) ?? 0; if (h < n) return false; counts.set(id, h - n); return true; },
  };
  const combat = {
    ammo: { hunter: 12 },
    weapons: [{ id: 'sabina-bow', activeAmmo: 'hunter' }],
    melee: { holsterLance() {} },
    setWeapon() {},
    craftBlocker(id) {
      const d = AMMO[id];
      if ((this.ammo[id] ?? 0) >= d.cap) return 'FULL';
      return d.recipe.every(([m, n]) => inventory.count(m) >= n) ? null : 'SHORT';
    },
    // combat.js craftAmmo, in its essentials: all or nothing, the recipe's batch, capped
    craftAmmo(id) {
      const d = AMMO[id];
      if (this.craftBlocker(id)) return false;
      for (const [m, n] of d.recipe) inventory.take(m, n);
      this.ammo[id] = Math.min(d.cap, (this.ammo[id] ?? 0) + d.batch);
      return true;
    },
  };
  const ctx = {
    state: 'playing', params: new Map(),
    input: { onDown: (code, fn) => down.set(code, fn), isDown: (code) => keys.has(code) },
    events: { on: (n, fn) => listeners.set(n, fn), emit: () => {} },
    combat, inventory,
  };
  const qs = new QuickSlots(ctx);
  const press = (code) => { keys.add(code); down.get(code)?.(); };
  const release = (code) => keys.delete(code);
  const step = (s) => { for (let i = 0; i < Math.round(s * 60); i++) qs.update(1 / 60); };
  const hit = () => listeners.get('player-damage')?.({ amount: 10 });
  return { ctx, qs, counts, combat, press, release, step, hit };
}

test('Reed arrow is cane ×2 and gull feather ×1, six to a making (BIBLE §16)', () => {
  assert.deepEqual(AMMO.hunter.recipe, [['ridge-wood', 2], ['feather', 1]]);
  assert.equal(AMMO.hunter.batch, 6);
  for (const id of ['hardpoint', 'fire', 'shock', 'freeze']) assert.equal(AMMO[id].batch, 6, id);
  assert.equal(QUICK_MAKE_S, 1.2);
});

test('hold slot 1 for 1.2 s: +6 Reed arrows, cane -2, feather -1', () => {
  const w = world();
  w.press('Digit1'); w.step(1.2); w.release('Digit1'); w.step(0.1);
  assert.equal(w.combat.ammo.hunter, 18);
  assert.equal(w.counts.get('ridge-wood'), 18);
  assert.equal(w.counts.get('feather'), 5);
  assert.equal(w.qs.make.made, 1);
});

test('a hit at 0.6 s: nothing made, nothing spent, and the held key does not restart it', () => {
  const w = world();
  w.press('Digit1'); w.step(0.6); w.hit(); w.step(1.4); w.release('Digit1'); w.step(0.1);
  assert.equal(w.combat.ammo.hunter, 12);
  assert.equal(w.counts.get('ridge-wood'), 20);
  assert.equal(w.counts.get('feather'), 6);
  assert.equal(w.qs.make.interrupted, 1);
});

test('released at 1.1 s: nothing; held 2.4 s: one bundle, not two', () => {
  const w = world();
  w.press('Digit1'); w.step(1.1); w.release('Digit1'); w.step(0.1);
  assert.equal(w.combat.ammo.hunter, 12);
  w.press('Digit1'); w.step(2.4); w.release('Digit1');
  assert.equal(w.combat.ammo.hunter, 18);
});

test('slot 2 (the lance) and the empty slots make nothing', () => {
  const w = world();
  for (const k of ['Digit2', 'Digit3', 'Digit4']) { w.press(k); w.step(1.5); w.release(k); }
  assert.equal(w.combat.ammo.hunter, 12);
  assert.equal(w.counts.get('feather'), 6);
});

test('the quick-make states alone', () => {
  const m = new QuickMake();
  m.press(1, 'hunter');
  let got = null;
  for (let i = 0; i < 71; i++) got = m.tick(1 / 60, true) || got;
  assert.equal(got, null);
  assert.equal(m.tick(1 / 60, true), 'hunter');
  assert.equal(m.tick(1 / 60, true), null);
});
