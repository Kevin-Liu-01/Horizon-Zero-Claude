import './character.css';
import TEXT from '../game/text/ui/character.json';
import { figureSvg } from './figures.js';

/**
 * THE CHARACTER PAGE (M1.6i; BIBLE §8.4 the armour ladder, §18 "Character": header, the worn set on a turntable,
 * eight rung cards (tier label, set name, tagline, swatches; locked = black silhouette), customization | WEAR).
 *
 * The hub's CHARACTER tab, this lane's own page, mounted in the hub body:
 *   - the header `BREA · SALT-PAN RECKONER`;
 *   - the stage: Brea herself in the frozen world, turning (the worn set on a turntable). The lens is held for as
 *     long as the page is up: it stands where the chase lens stood (a place the chase rule already found clear),
 *     frames her whole figure in the stage's box, and she turns on her own spot, 24 s a turn (still under ?shot and
 *     under reduced motion; a drag on the stage turns her by hand). Nothing is rendered twice: it is the game's own
 *     frame, so the worn set is exactly what the world shows. Everything is handed back when the page closes;
 *   - the selected rung's detail (tier, name, tagline, perk, colours) with the one verb, WEAR;
 *   - eight rung cards in the ladder's order. In this build rungs 1 and 2 can be worn (Raker's Whites, Guild
 *     Whites: armory's `pan-1` and `pan-2`); rung 2 shows in colour and waits until it is hers (Raker's Morning,
 *     `systemsGame.rung === 'scout'`); rungs 3-8 are black silhouettes, LOCKED;
 *   - customization: the wrap's violet, locked (BIBLE §8.4), and the variant rows, none cut yet.
 * No level, experience, points or purchase anywhere (IP-PRIVATE §P2).
 *
 * WEAR goes through armory's published `player.hero.loadout.equipArmor(id)` (the deferred row loads, the old one
 * unloads, the perk swaps); the hero's piece mask is then settled at once with `hero.update(0)` (the world is
 * frozen under the hub, so nothing else would until play resumes).
 *
 * Every word is from src/game/text/ui/character.json.
 */

/** Which armory variant is each wearable rung (engine ids, kept out of the words file). */
const ARMOR_OF = Object.freeze({ starter: 'pan-1', scout: 'pan-2' });
const RUNG_OF_ARMOR = Object.freeze(Object.fromEntries(Object.entries(ARMOR_OF).map(([r, a]) => [a, r])));
const RUNG_IDS = TEXT.rungs.map((r) => r.id);

const TURN_S = 24;            // one turn of the stage
const STILL_DEG = 28;         // her angle off the lens when she stands still (?shot, reduced motion)
const LENS_DIST = 3.6;        // m from her: the chase lens's own range, so it stands in air the chase rule found clear
const FIG_H = 1.78;           // m: her figure, wrap and hat included
const FILL = 0.86;            // of the stage's height she fills
const D2R = Math.PI / 180;

const h = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};
const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));
const pad2 = (n) => String(n).padStart(2, '0');
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/**
 * The stage's lens: the game's camera held on her while the page is up, and her heading turned. Writes happen in
 * `apply()`, called from the menus' simulation slice (last system of the frame, when systems tick) and from its
 * presentation slice (rAF, when the world is frozen and no system ticks).
 */
export class StageLens {
  constructor(ctx) {
    this.ctx = ctx;
    this.held = null;
    this.angle = 0;
    this.still = false;
    this.box = null;
    this.info = { on: false, dist: 0, fov: 0, angleDeg: 0, cam: null };
  }

  get on() { return !!this.held; }

  begin(boxEl) {
    const ctx = this.ctx, cam = ctx.camera, p = ctx.player;
    if (this.held || !cam || !p?.model || !p.position) return false;
    this.box = boxEl;
    this.held = {
      pos: cam.position.toArray(), quat: cam.quaternion.toArray(), fov: cam.fov,
      heading: p.heading, rotY: p.model.rotation.y,
    };
    // the bearing the chase lens looked at her from: the stage keeps it
    let ux = cam.position.x - p.position.x, uz = cam.position.z - p.position.z;
    const L = Math.hypot(ux, uz);
    if (L < 1e-3) { ux = -Math.sin(p.camYaw ?? 0); uz = -Math.cos(p.camYaw ?? 0); } else { ux /= L; uz /= L; }
    this.ux = ux; this.uz = uz;
    this.face = Math.atan2(ux, uz);          // the heading that faces the lens (heading = atan2(vx, vz))
    this.still = !!ctx.params?.has?.('shot') || reducedMotion();
    this.angle = STILL_DEG * D2R;
    this.apply();
    return true;
  }

  /** Real seconds: the turn. */
  tick(dt) {
    if (!this.held || this.still || this.dragging) return;
    this.angle += dt * (2 * Math.PI / TURN_S);
    if (this.angle > Math.PI) this.angle -= 2 * Math.PI;
  }

  turnBy(rad) { if (this.held) this.angle += rad; }

  /** Her heading and the lens for this frame. No allocation. */
  apply() {
    const H = this.held;
    if (!H) return;
    const ctx = this.ctx, cam = ctx.camera, p = ctx.player;
    const hd = this.face + this.angle;
    p.heading = hd;
    p.model.rotation.y = hd;
    // the stage's box on screen (CSS px), and the frame size it is part of
    const W = window.innerWidth || 1, Ht = window.innerHeight || 1;
    const r = this.box?.isConnected ? this.box.getBoundingClientRect() : null;
    const bh = r && r.height > 40 ? r.height : Ht * 0.6;
    const sx = r ? r.left + r.width / 2 : W / 2, sy = r ? r.top + r.height / 2 : Ht / 2;
    // the vertical field that fits her (FIG_H / FILL) into the box's share of the frame at LENS_DIST
    const span = (FIG_H / FILL) * (Ht / bh);
    const fov = Math.min(60, Math.max(18, 2 * Math.atan(span / 2 / LENS_DIST) / D2R));
    if (Math.abs(cam.fov - fov) > 1e-3) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const tx = p.position.x, ty = p.position.y + FIG_H * 0.5, tz = p.position.z;
    const cx = tx + this.ux * LENS_DIST, cz = tz + this.uz * LENS_DIST;
    const ground = ctx.terrain?.getHeight ? ctx.terrain.getHeight(cx, cz) : -Infinity;
    const cy = Math.max(ty + 0.1, ground + 0.6);
    cam.position.set(cx, cy, cz);
    // aim at her middle, then turn so that point lands on the box's centre
    const yaw = Math.atan2(this.ux, this.uz);
    const pitch = Math.atan2(ty - cy, LENS_DIST);
    const tanV = Math.tan(fov * D2R / 2), tanH = tanV * (cam.aspect || W / Ht);
    const xn = sx / W * 2 - 1, yn = 1 - sy / Ht * 2;
    cam.rotation.set(pitch - Math.atan(yn * tanV), yaw + Math.atan(xn * tanH), 0, 'YXZ');
    cam.updateMatrixWorld();
    const I = this.info;
    I.on = true; I.dist = LENS_DIST; I.fov = +fov.toFixed(2); I.angleDeg = +(this.angle / D2R).toFixed(1);
    I.cam = [+cx.toFixed(2), +cy.toFixed(2), +cz.toFixed(2)];
  }

  /** Hand back the lens, the fov and her heading. Idempotent. */
  end() {
    const H = this.held;
    if (!H) return;
    const ctx = this.ctx, cam = ctx.camera, p = ctx.player;
    cam.position.fromArray(H.pos);
    cam.quaternion.fromArray(H.quat);
    if (cam.fov !== H.fov) { cam.fov = H.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    if (p) { p.heading = H.heading; if (p.model) p.model.rotation.y = H.rotY; }
    this.held = null;
    this.box = null;
    this.dragging = false;
    this.info.on = false;
  }
}

export class CharacterPage {
  constructor(ctx) {
    this.ctx = ctx;
    this.root = null;
    this.sel = null;
    this.busy = null;
    this.lens = new StageLens(ctx);
    this._log = [];
    this._onRung = () => { if (this.root) this.paint(); };
    ctx.events?.on?.('rung-granted', this._onRung);
  }

  get loadout() { return this.ctx.player?.hero?.loadout ?? null; }

  /** The highest rung she holds (systems' `rung`), as an index into the ladder. */
  ownedIndex() {
    const i = RUNG_IDS.indexOf(this.ctx.systemsGame?.rung ?? 'starter');
    return i < 0 ? 0 : i;
  }

  /** The rung she wears now, or null (no outfit, or a variant off this page's two). */
  wornRung() {
    const id = this.loadout?.armorId ?? null;
    return id ? (RUNG_OF_ARMOR[id] ?? null) : null;
  }

  /** One card's state: 'worn' | 'owned' (hers, not worn) | 'open' (wearable here, not hers yet) | 'locked'. */
  state(rung) {
    const i = RUNG_IDS.indexOf(rung.id);
    if (!ARMOR_OF[rung.id]) return 'locked';
    if (this.wornRung() === rung.id) return 'worn';
    return i <= this.ownedIndex() ? 'owned' : 'open';
  }

  mount(host) {
    this.unmount();
    const R = this.root = h('div', 'ch', host);
    R.dataset.screen = 'character';
    this.sel = this.wornRung() ?? 'starter';
    this.paint();
    this._onKey = (e) => {
      if (!this.root) return;
      const i = RUNG_IDS.indexOf(this.sel);
      if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
        this.sel = RUNG_IDS[(i + (e.code === 'ArrowRight' ? 1 : RUNG_IDS.length - 1)) % RUNG_IDS.length];
        this.paint();
        e.preventDefault();
      } else if (e.code === 'Enter') {
        this.wear(this.sel);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', this._onKey);
    return R;
  }

  unmount() {
    this.lens.end();
    if (this._scrim) for (const k of ['--ch-l', '--ch-t', '--ch-r', '--ch-b']) this._scrim.style.removeProperty(k);
    this._scrim = null;
    this._cut = null;
    if (this._onKey) window.removeEventListener('keydown', this._onKey);
    this._onKey = null;
    this.root?.remove();
    this.root = null;
  }

  /** Per frame while mounted (real seconds). */
  tick(dt) {
    if (!this.root) return;
    if (!this.lens.on && this._stage?.isConnected) this.lens.begin(this._stage);
    this.lens.tick(dt);
    this.lens.apply();
    this._cutFrost();
  }

  /**
   * The hub's frost is cut by the stage's box (character.css): the world frosts behind every surface and margin of
   * the page, and stands clear only where she does. Percentages of the scrim's own box, written only on a change.
   */
  _cutFrost() {
    const st = this._stage;
    const scrim = this._scrim ??= this.root?.closest('.mn-hub')?.querySelector('.mn-hub-scrim') ?? null;
    if (!st?.isConnected || !scrim) return;
    const a = scrim.getBoundingClientRect(), b = st.getBoundingClientRect();
    if (a.width < 1 || a.height < 1) return;
    const pc = (v, o, n) => `${(((v - o) / n) * 100).toFixed(2)}%`;
    const key = `${pc(b.left, a.left, a.width)} ${pc(b.top, a.top, a.height)} ${pc(b.right, a.left, a.width)} ${pc(b.bottom, a.top, a.height)}`;
    if (key === this._cut) return;
    this._cut = key;
    const [l, t, r, bt] = key.split(' ');
    const S = scrim.style;
    S.setProperty('--ch-l', l); S.setProperty('--ch-t', t); S.setProperty('--ch-r', r); S.setProperty('--ch-b', bt);
  }

  /** WEAR: put the rung on her through armory's loadout. Resolves true when she wears it. */
  async wear(rungId) {
    const rung = TEXT.rungs.find((r) => r.id === rungId);
    const st = rung ? this.state(rung) : 'locked';
    if (st !== 'owned' || this.busy) return false;
    const L = this.loadout;
    if (!L?.equipArmor) return false;
    const t0 = performance.now();
    this.busy = rungId;
    if (this.root) this.paint();
    let ok = false;
    try {
      await L.equipArmor(ARMOR_OF[rungId]);
      // the piece mask (the hat on her head or her back): settled now, the world is frozen under the hub
      this.ctx.player?.hero?.update?.(0);
      ok = this.wornRung() === rungId;
    } catch (err) {
      console.warn('[character] wear:', err?.message || err);
    }
    this.busy = null;
    this._log.push({ wear: rungId, ok, ms: Math.round(performance.now() - t0) });
    if (this._log.length > 16) this._log.shift();
    this.ctx.events?.emit?.('ui-confirm', { label: TEXT.wear });
    if (this.root) this.paint();
    return ok;
  }

  paint() {
    const R = this.root;
    if (!R) return;
    R.innerHTML = '';

    const left = h('section', 'ch-col ch-left gs-glass', R);
    h('div', 'ch-head', left, TEXT.head);
    const rung = TEXT.rungs.find((r) => r.id === this.sel) ?? TEXT.rungs[0];
    const st = this.state(rung);
    const locked = st === 'locked';
    const det = h('div', 'ch-detail', left);
    h('div', 'ch-tier', det, `<span>${fill(TEXT.rung, { n: rung.n })}</span><b>${rung.tier}</b>`);
    if (locked) {
      h('div', 'ch-name', det, TEXT.locked);
    } else {
      h('div', 'ch-name', det, rung.name);
      h('div', 'ch-tagline', det, `“${rung.tagline}”`);
      const pk = h('div', 'ch-perk', det);
      h('span', null, pk, TEXT.perk);
      h('b', null, pk, rung.perk);
      h('p', null, pk, rung.does);
      const sw = h('div', 'ch-swatches big', det);
      h('span', 'ch-k', sw, TEXT.colours);
      for (const c of rung.swatches || []) h('i', null, sw).style.background = c;
    }
    const acts = h('div', 'ch-acts', left);
    const wearBtn = h('button', `ch-wear${st === 'owned' && !this.busy ? '' : ' off'}`, acts, TEXT.wear);
    wearBtn.dataset.wear = rung.id;
    if (st === 'owned' && !this.busy) wearBtn.addEventListener('click', () => this.wear(rung.id));
    else wearBtn.disabled = true;
    const why = this.busy ? TEXT.fitting : st === 'worn' ? TEXT.worn : st === 'open' ? fill(TEXT.notOwned, { how: rung.how }) : '';
    h('div', `ch-why${st === 'worn' ? ' worn' : ''}`, acts, why);

    // the stage: a clear box in the page where she stands in the frozen world, turning
    const stage = h('div', 'ch-stage', R);
    stage.dataset.turn = '1';
    h('div', 'ch-stage-hint', stage, TEXT.turn);
    this._stage = stage;
    this._bindDrag(stage);
    if (this.lens.on) this.lens.box = stage;

    const right = h('section', 'ch-col ch-right gs-glass', R);
    h('div', 'ch-sub', right, TEXT.custom.head);
    const cw = h('div', 'ch-crow locked', right);
    h('span', null, cw, TEXT.custom.wrap);
    h('b', null, cw, `<i style="background:${(TEXT.rungs[0].swatches || [])[0]}"></i>${TEXT.custom.wrapValue}`);
    h('em', null, cw, TEXT.custom.wrapLocked);
    for (const row of TEXT.custom.rows.slice(1)) {
      const r = h('div', 'ch-crow none', right);
      h('span', null, r, row);
      h('b', null, r, '—');
    }
    h('p', 'ch-note', right, TEXT.custom.none);

    const cards = h('div', 'ch-cards', R);
    for (const r of TEXT.rungs) {
      const s = this.state(r);
      const c = h('button', `ch-card ${s}${r.id === this.sel ? ' on' : ''}`, cards);
      c.dataset.rung = r.id;
      c.dataset.state = s;
      const top = h('div', 'ch-card-top', c);
      h('span', 'ch-n', top, pad2(r.n));
      h('b', 'ch-t', top, r.tier);
      if (s === 'worn') h('i', 'ch-mark', top);
      h('div', 'ch-card-fig', c, figureSvg(r.id, { swatches: r.swatches, locked: s === 'locked' }));
      if (s === 'locked') {
        h('div', 'ch-card-name', c, TEXT.locked);
      } else {
        h('div', 'ch-card-name', c, r.name);
        h('div', 'ch-card-tag', c, r.tagline);
        const sw = h('div', 'ch-swatches', c);
        for (const col of r.swatches || []) h('i', null, sw).style.background = col;
      }
      c.addEventListener('click', () => { this.sel = r.id; this.paint(); });
      c.addEventListener('dblclick', () => this.wear(r.id));
    }
  }

  _bindDrag(stage) {
    let x0 = null;
    stage.addEventListener('pointerdown', (e) => { x0 = e.clientX; this.lens.dragging = true; stage.setPointerCapture?.(e.pointerId); });
    stage.addEventListener('pointermove', (e) => { if (x0 == null) return; this.lens.turnBy((e.clientX - x0) * 0.012); x0 = e.clientX; });
    const up = () => { x0 = null; this.lens.dragging = false; };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
  }

  audit() {
    const R = this.root;
    const cards = R ? [...R.querySelectorAll('.ch-card')].map((c) => ({ rung: c.dataset.rung, state: c.dataset.state,
      tier: c.querySelector('.ch-t')?.textContent ?? '', name: c.querySelector('.ch-card-name')?.textContent ?? '',
      silhouette: !!c.querySelector('.ch-fig.locked') })) : [];
    return {
      mounted: !!R,
      head: R?.querySelector('.ch-head')?.textContent ?? null,
      sel: this.sel,
      worn: this.wornRung(),
      armorId: this.loadout?.armorId ?? null,
      owned: RUNG_IDS[this.ownedIndex()],
      cards,
      locked: cards.filter((c) => c.state === 'locked').length,
      silhouettes: cards.filter((c) => c.silhouette).length,
      wearable: cards.filter((c) => c.state !== 'locked').map((c) => c.rung),
      buttons: R ? [...R.querySelectorAll('button.ch-wear')].map((b) => ({ text: b.textContent, on: !b.disabled })) : [],
      busy: this.busy,
      lens: { ...this.lens.info },
      frostCut: this._cut ?? null,
      log: this._log.slice(),
    };
  }

  dispose() {
    this.unmount();
    this.ctx.events?.off?.('rung-granted', this._onRung);
  }
}
