/**
 * CALIMA · the loadout: which armor variant she wears and what it does (armory W1;
 * bible §4.1, §4.7; plan E43 is the W3 equip panel that drives this).
 *
 *   hero.loadout.equipArmor(id) -> Promise<info>   swaps the outfit, its perk, its pieces
 *   hero.loadout.armorId / .perk                    what is on her
 *   hero.loadout.info()                             { armorId, perk, row, resident[] }
 *   hero.loadout.save() / restore(data)             the shape A65 persists at W3
 *
 * A deferred row is loaded on demand and UNLOADED when she takes it off: the swap
 * disposes merged geometry, materials, every texture slot it owns and the Skeleton
 * (bible §4.1; A-outfit-swap-memory ±0). The sheet a variant shares stays with the
 * sheet's owner (`entry.sharedMaps`).
 *
 * PERKS act only through published hooks, each with apply + clear (R31, §4.7):
 *   Shrug      machines.perception.flagDuration = 3
 *   Ash-step   stimulus noise filter: jog footsteps on ash, lapilli, sand are dropped
 *   Brine-wade stimulus noise filter on footsteps in brine (the build-up half needs
 *              combat-kit's Brine build-up filter, W2; `pendingHooks` names it)
 *   Mist-fighter  combat-kit's Brine build-up filter, W2 (pending)
 */
import { ARMOR, DEFAULT_ARMOR } from './variants.js';
import { ARMOR_ROWS } from './rows.js';

const ASH_SURFACES = new Set(['ash', 'lapilli', 'sand', 'cinder', 'blacksand', 'black-sand']);
const WET_SURFACES = new Set(['brine', 'pan', 'flooded', 'water', 'shallow', 'wet', 'salt-pan']);
const FLAG_DEFAULT = 8;

export const PERKS = {
  /** Brine-wade: wading in brine applies no wet-footstep noise bonus; the build-up half is combat-kit's filter (W2). */
  brineWade: {
    pendingHooks: ['combat.brineFilter (combat-kit W2)'],
    apply(L) {
      L._noiseOff = L._addNoise((ev) => {
        if (ev?.kind === 'footstep' && ev.wet && WET_SURFACES.has(ev.surface)) { ev.strength = ev.dryStrength ?? ev.strength / (ev.wetMul || 1); ev.wet = false; }
        return ev;
      });
    },
    clear(L) { L._noiseOff?.(); L._noiseOff = null; },
  },
  /** Shrug: a Flag on her lasts 3 s instead of 8 s. */
  shrug: {
    apply(L) { const pc = L._perception(); if (pc) { L._flag0 = pc.flagDuration ?? FLAG_DEFAULT; pc.flagDuration = 3; } },
    clear(L) { const pc = L._perception(); if (pc && L._flag0 != null) pc.flagDuration = L._flag0; L._flag0 = null; },
  },
  /** Mist-fighter: no Brine and no slow in her own Brine Pot mist; the pots and the filter land with combat-kit (W2). */
  mistFighter: {
    pendingHooks: ['combat.brineFilter (combat-kit W2)'],
    apply() {}, clear() {},
  },
  /** Ash-step: at a jog, footsteps on ash, lapilli and sand emit no noise (sprint still does). */
  ashStep: {
    apply(L) {
      L._noiseOff = L._addNoise((ev) => {
        if (ev?.kind !== 'footstep') return ev;
        const p = L.player;
        const surf = ev.surface ?? p.surfaceAt?.(p.position.x, p.position.z) ?? null;
        if (!ASH_SURFACES.has(surf)) return ev;
        if (p.sprinting || p.isSprinting) return ev;
        return false;
      });
    },
    clear(L) { L._noiseOff?.(); L._noiseOff = null; },
  },
};

export class HeroLoadout {
  constructor(hero) {
    this.hero = hero;
    this.player = hero.player;
    this.ctx = hero.ctx;
    this.armorId = hero.outfit?.row ? DEFAULT_ARMOR : null;
    this.perk = null;
    this._pieceBits = -1;
    this._swapping = null;
    this._applyPerk(this.armorId);
  }

  _perception() { return this.ctx.machines?.perception ?? null; }

  _addNoise(fn) {
    const st = this.ctx.machines?.stimulus;
    if (!st?.addNoiseFilter) { this._pendingNoise = fn; return () => { this._pendingNoise = null; }; }
    return st.addNoiseFilter(fn);
  }

  _applyPerk(id) {
    const key = id ? ARMOR[id]?.perk : null;
    if (this.perk) PERKS[this.perk]?.clear(this);
    this.perk = key || null;
    this._perkArmed = false;
  }

  /** The machines may be constructed after the player: arm the perk on the first frame they exist. */
  _armPerk() {
    if (this._perkArmed || !this.perk) return;
    if (!this.ctx.machines) return;
    PERKS[this.perk]?.apply(this);
    this._perkArmed = true;
  }

  /** Swap the outfit. Deferred rows load here; the row she takes off is unloaded. */
  async equipArmor(id) {
    const def = ARMOR[id];
    if (!def) throw new Error(`[loadout] no armor variant "${id}"`);
    if (id === this.armorId) return this.info();
    if (this._swapping) await this._swapping;
    const assets = this.ctx.assets;
    const job = (async () => {
      if (!assets.models[def.row]) {
        const spec = ARMOR_ROWS[def.row];
        if (!spec) throw new Error(`[loadout] row ${def.row} has no spec`);
        await assets.loadExtra({ [def.row]: { ...spec } });
        if (!assets.models[def.row]) throw new Error(`[loadout] row ${def.row} did not load`);
      }
      const old = this.hero.outfit.row;
      if (this.perk && this._perkArmed) PERKS[this.perk]?.clear(this);
      this.perk = null;
      this.hero.outfit.equip(def.row);
      this._unloadIfDeferred(old, def.row);
      this.armorId = id;
      this._applyPerk(id);
      this._pieceBits = -1;
      this.player._collectMaterials?.();
    })();
    this._swapping = job;
    try { await job; } finally { this._swapping = null; }
    return this.info();
  }

  /** Take everything off (dev / gates): the body shows, the row is unloaded. */
  async unequipArmor() {
    if (this._swapping) await this._swapping;
    const old = this.hero.outfit.row;
    if (this.perk && this._perkArmed) PERKS[this.perk]?.clear(this);
    this.perk = null;
    this.hero.outfit.unequip();
    this._unloadIfDeferred(old, null);
    this.armorId = null;
    return this.info();
  }

  _unloadIfDeferred(row, keep) {
    if (!row || row === keep || !ARMOR_ROWS[row]) return;
    const assets = this.ctx.assets;
    const entry = assets.models[row];
    if (!entry) return;
    if (entry.sharedMaps) {
      // the sheet stays with its owner: detach its maps so unload frees geometry + material only
      entry.root.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        const m = o.material;
        m.map = null; m.normalMap = null; m.roughnessMap = null; m.metalnessMap = null;
      });
    }
    entry.root.traverse((o) => { if (o.isSkinnedMesh && o.material?.userData?.clothU) o.material.userData.clothU = null; });
    assets.unload(row);
  }

  /** Per frame, no allocation: the hat's two hidden meshes, and arming a late perk. */
  update(dt, lanceOut, bowOut) {
    if (!this._perkArmed) this._armPerk();
    const O = this.hero.outfit;
    if (!O?.hasPieces) return;
    // Guild Whites: on her head at rest, on her back the moment a weapon is out (no draw changes). The bits are the
    // copies HIDDEN: 32 on her head, 64 on her back over the stowed bow (the lance out), 128 on her back close in
    // (the bow in her hand: nothing stowed under it)
    const aiming = this.player.aiming;
    const combat = lanceOut || bowOut || aiming;
    const bits = !combat ? (64 | 128) : (lanceOut && !bowOut && !aiming) ? (32 | 128) : (32 | 64);
    if (bits !== this._pieceBits) { this._pieceBits = bits; O.setPieces(bits); }
  }

  info() {
    return {
      armorId: this.armorId, perk: this.perk, row: this.hero.outfit?.row ?? null,
      pendingHooks: this.perk ? (PERKS[this.perk]?.pendingHooks ?? []) : [],
      resident: Object.keys(ARMOR_ROWS).filter((r) => this.ctx.assets?.models?.[r]),
    };
  }

  /** What A65 persists (wired to save.js by progression at W3). */
  save() { return { armor: this.armorId }; }
  async restore(data) { if (data?.armor && ARMOR[data.armor]) await this.equipArmor(data.armor); }

  dispose() {
    if (this.perk && this._perkArmed) PERKS[this.perk]?.clear(this);
    this.perk = null;
  }
}
