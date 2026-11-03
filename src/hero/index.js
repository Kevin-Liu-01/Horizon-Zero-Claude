/**
 * CALIMA · Brea on the kept rig — the hero assembly (hero-body W0b; handed to
 * armory with the rest of `src/hero/**` at W1 day 1).
 *
 *   installHero(player) -> HeroRig        (called by the Player constructor)
 *
 * The body is the `hero` boot row (Brea, `rows.js`); this module adds what a
 * body alone does not have:
 *   - ONE Skeleton for the two body meshes (skin, hair+wrap share a glTF skin;
 *     three gives each SkinnedMesh its own Skeleton and bone texture — the
 *     duplicate is disposed)
 *   - the caster policy (plan §4.1: <= 2 casters): body skin + outfit cast,
 *     hair/wrap and the stow kit do not
 *   - the default outfit (Pan Whites I) and the merged stow kit
 *   - the per-frame stow mask: the stowed lance collapses while the lance is
 *     drawn, the stowed bow while the bow is in her hand
 *
 * `player.hero` (this object) is the published surface:
 *   hero.equip(row) / hero.unequip()      outfit sets (rows in rows.js)
 *   hero.kit.setHidden(bits)              PIECE bits (stowkit.js)
 *   hero.loadout                          armor + weapon variants, perks (loadout.js)
 *   hero.info()                           draws / tris / casters / skeletons
 *   hero.dispose()                        everything installHero created
 */
import { HERO_ROWS, DEFAULT_OUTFIT, BREA_URL } from './rows.js';
import { HeroOutfit } from './outfit.js';
import { HeroStowKit, PIECE } from './stowkit.js';
import { disposeClothDetail } from './clothShader.js';
import { armoryAssets, adoptWeaponAtlas } from './weaponAtlas.js';
import { HeroLoadout } from './loadout.js';

export { HERO_ROWS, DEFAULT_OUTFIT, BREA_URL, PIECE };

export class HeroRig {
  constructor(player) {
    this.player = player;
    this.ctx = player.ctx;
    this.isBrea = this.ctx.assets?.models?.hero?.spec?.url === BREA_URL;
    this.bodyMeshes = [];
    this._sharedSkeleton = null;
    this.outfit = null;
    this.kit = null;
    this._lanceOut = false;
    this._bowOut = false;
  }

  install() {
    if (!this.isBrea) return this;
    const model = this.player.model;
    model.traverse((o) => { if (o.isSkinnedMesh) this.bodyMeshes.push(o); });
    // one skeleton for the body meshes (same joints, same inverse binds)
    const first = this.bodyMeshes[0];
    for (let i = 1; i < this.bodyMeshes.length; i++) {
      const m = this.bodyMeshes[i];
      if (m.skeleton !== first.skeleton && sameSkin(m.skeleton, first.skeleton)) {
        m.skeleton.dispose();
        m.skeleton = first.skeleton;
      }
    }
    this._sharedSkeleton = first?.skeleton || null;
    for (const m of this.bodyMeshes) {
      m.castShadow = m.geometry.getAttribute('_hidemask') != null;   // the skin casts; hair+wrap does not
      m.frustumCulled = false;
    }
    armoryAssets(this.ctx);       // bow.js builds the held weapons from these rows
    this.outfit = new HeroOutfit(this.player);
    if (this.ctx.assets.models[DEFAULT_OUTFIT]) this.outfit.equip(DEFAULT_OUTFIT);
    const kit = this.ctx.assets.models.heroStowKit;
    this.kit = new HeroStowKit(this.player, kit);
    if (kit) this.kit.attach();
    this.loadout = new HeroLoadout(this);
    this.player._collectMaterials?.();
    return this;
  }

  equip(row) { return this.outfit?.equip(row); }
  unequip() { return this.outfit?.unequip(); }

  /**
   * Per frame, no allocation: collapse the stowed copy of whatever is in her
   * hands. The lance is out when melee's stance is not `holstered`; the bow is
   * out when combat has its bow model visible on the hand node.
   */
  update(dt = 1 / 60) {
    if (!this.kit?.attached) return;
    // the procedural spear melee builds (W1 replaces it) is shown only in her
    // hands: holstered, the stow kit's Shepherd's Lance is the one on her back
    const ml = this.player.animator?.melee;
    const sp = this._lanceProp = ml?.lance ?? ml?.spear ?? null;
    if (sp) sp.visible = sp.parent !== ml.socketBone;
    // melee's held prop (lanceStow.js, once merged) loads the GLB itself: give it the atlas
    const LI = this.ctx.combat?.melee?.lance?.inner ?? null;
    if (LI !== this._lanceInner) { this._lanceInner = LI; if (LI) adoptWeaponAtlas(LI); }
    const cmb = this.ctx.combat;
    const stance = cmb?.melee?.stance;
    this._lanceOut = !!stance && stance !== 'holstered';
    const bow = cmb?.bow?.group;
    this._bowOut = !!bow && bow.visible && bow.parent === cmb._bowNode;
    // combat's procedural Round-4 bow on her BACK (its stow bone, now found
    // through the rig profile's alias): the stow kit's Sabina is the stowed
    // bow she wears, so the procedural one is hidden there (its group keeps
    // its transform: melee's free-arm clearance reads it); shown again the
    // moment it is back in her hand. Toggled on change only.
    const onBack = !!bow && !!cmb._stow && bow.parent === cmb._stow.bone;
    if (onBack !== this._bowOnBackHidden) {
      this._bowOnBackHidden = onBack;
      if (onBack) {
        // hide what is showing now, and remember exactly that (restored as it was)
        this._bowHidden = [];
        for (const m of Object.values(cmb?._models || {})) {
          const kids = m?.group?.children;
          if (!kids) continue;
          for (let i = 0; i < kids.length; i++) if (kids[i].visible) { kids[i].visible = false; this._bowHidden.push(kids[i]); }
        }
      } else if (this._bowHidden) {
        for (const o of this._bowHidden) o.visible = true;
        this._bowHidden = null;
      }
    }
    const bits = (this._lanceOut ? PIECE.lance : 0) | (this._bowOut ? PIECE.bow : 0);
    if (bits !== this.kit.hidden) this.kit.setHidden(bits);
    this.loadout?.update(dt, this._lanceOut, this._bowOut);
    // the stowed lance rides the trunk in the R10 band (carry.js)
    this.kit.solve(this.player.animator, dt);
  }

  /** The held lance: `{ group, model, ... }` as bow.js built it (dev / sheets), or null. */
  heldLance() {
    const g = this._lanceProp;
    if (!g) return null;
    return { group: g, model: g.children[0] };
  }

  info() {
    const model = this.player.model;
    let draws = 0, tris = 0, casters = 0;
    const meshes = [];
    const skeletons = new Set();
    model.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      let vis = true;
      for (let p = o.parent; p; p = p.parent) if (!p.visible) { vis = false; break; }
      if (!vis) return;
      const g = o.geometry;
      const idxN = g.index ? g.index.count : g.attributes.position.count;
      const n = Math.min(idxN, g.drawRange.count) / 3;
      draws++; tris += n; if (o.castShadow) casters++;
      if (o.isSkinnedMesh && o.skeleton) skeletons.add(o.skeleton);
      meshes.push({ name: o.name, tris: Math.round(n), cast: o.castShadow, part: o.userData.heroPart || 'body' });
    });
    return {
      brea: this.isBrea, draws, tris: Math.round(tris), casters, skeletons: skeletons.size, meshes,
      outfit: this.outfit?.info() ?? null, kit: this.kit?.info() ?? null,
      lanceOut: this._lanceOut, bowOut: this._bowOut,
    };
  }

  dispose() {
    const r = { outfit: this.outfit?.unequip() ?? null, kit: this.kit?.dispose() ?? null };
    this.loadout?.dispose();
    this.loadout = null; this.outfit = null; this.kit = null;
    disposeClothDetail();
    return r;
  }
}

function sameSkin(a, b) {
  if (!a || !b || a.bones.length !== b.bones.length) return false;
  for (let i = 0; i < a.bones.length; i++) {
    if (a.bones[i] !== b.bones[i]) return false;
    const x = a.boneInverses[i].elements, y = b.boneInverses[i].elements;
    for (let k = 0; k < 16; k++) if (Math.abs(x[k] - y[k]) > 1e-6) return false;
  }
  return true;
}

export function installHero(player) {
  return new HeroRig(player).install();
}
