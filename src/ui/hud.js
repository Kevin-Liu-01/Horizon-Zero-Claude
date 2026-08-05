import * as THREE from 'three';
import './hud.css';

const RAD2DEG = 180 / Math.PI;

const QUEST = [
  { kind: 'watcher', need: 4, title: 'THIN THE HERD', detail: 'Destroy the Watchers prowling the meadow' },
  { kind: 'sawtooth', need: 2, title: 'FANGS OF THE VALLEY', detail: 'Bring down both Sawtooths' },
  { kind: 'behemoth', need: 1, title: 'THE BULL', detail: 'Topple the Behemoth in the hills' },
  { kind: 'thunderjaw', need: 1, title: 'SHADOW OF THE APEX', detail: 'Slay the Thunderjaw' },
];

const XP = { watcher: 120, sawtooth: 480, behemoth: 900, thunderjaw: 2500 };
const LEVELS = { watcher: 5, sawtooth: 15, behemoth: 25, thunderjaw: 27 };

/* ------------------------------ glyph library ------------------------------ */
/* Flat "tribal glyph" icons per docs/research/ui.md — inline SVG, currentColor. */

const P = (d, extra = '') => `<path d="${d}" ${extra}/>`;
const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"';

const GLYPHS = {
  arrow: P('M12 1 L16 8 H13.4 V16 H10.6 V8 H8 Z') + P('M9.2 17.5 H14.8 L12 22.5 Z'),
  hardpoint: P('M12 1 L17.4 9 H14 V14.6 H10 V9 H6.6 Z') + P('M8.4 16.8 H15.6 L12 23 Z'),
  precision: P('M12 0.5 L15 6.2 H13.1 V17.6 H10.9 V6.2 H9 Z') + P('M9.6 19 H14.4 L12 23.5 Z'),
  fire: P('M12 2 C14.2 6 17 8.4 17 13 A5 5 0 0 1 7 13 C7 9.8 9.2 8.6 9.8 6 C10.9 7.6 11.6 9 12 10.6 C12.9 8.2 11.4 5.2 12 2 Z'),
  shock: P('M13.2 2 L5 13.4 H10 L8.2 22 L19 9.2 H12.6 Z'),
  freeze: P('M12 2 V22 M3.3 7 L20.7 17 M20.7 7 L3.3 17 M12 2 L9.5 4.5 M12 2 L14.5 4.5 M12 22 L9.5 19.5 M12 22 L14.5 19.5', STROKE),
  tearblast: P('M12 2 L13.7 8.6 L19.6 5.4 L15.4 10.6 L22 12 L15.4 13.4 L19.6 18.6 L13.7 15.4 L12 22 L10.3 15.4 L4.4 18.6 L8.6 13.4 L2 12 L8.6 10.6 L4.4 5.4 L10.3 8.6 Z'),
  blast: '<circle cx="11" cy="14.5" r="7"/>' + P('M11 7.5 V5 C11 3 13 2.2 14.6 3.4 M17.5 2 L19 4.2 M20.5 6 L18 6.4', STROKE),
  disc: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.6"/><circle cx="12" cy="12" r="3.2"/>',
  shard: P('M12 2 L19 12 L12 22 L5 12 Z'),
  wood: P('M5 20 L17 5 M9 21 L19 9 M13.4 9.4 L16 12', STROKE),
  droplet: P('M12 2 C15 8 19 11 19 15 A7 7 0 0 1 5 15 C5 11 9 8 12 2 Z'),
  leaf: P('M12 22 C4.5 16 5 6 20 3 C20.5 14 16 20 12 22 Z') + P('M12 21 C12.6 15 14 9.5 17.6 5.8', 'fill="none" stroke="rgba(10,14,12,0.6)" stroke-width="1.4"'),
  shell: '<circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="1.5"/>',
  wire: P('M3 12 C3 8 8 8 8 12 C8 16 12 16 12 12 C12 8 16 8 16 12 C16 16 21 16 21 12', STROKE),
  lens: '<circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.4"/>',
  core: P('M12 3 L19 7.5 V16.5 L12 21 L5 16.5 V7.5 Z') + '<circle cx="12" cy="12" r="2.6" fill="rgba(10,14,12,0.6)"/>',
};

function svgIcon(glyph, color) {
  const body = GLYPHS[glyph] ?? GLYPHS.shard;
  return `<svg viewBox="0 0 24 24" style="color:${color}" fill="currentColor" ` +
    `xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

/* ammo id -> glyph + color + display name (v2 roster + round-1 fallbacks) */
function ammoLook(id) {
  const s = String(id ?? 'hunter').toLowerCase();
  if (s.includes('hardpoint')) return { glyph: 'hardpoint', color: '#efe6d5', name: 'Hardpoint Arrow' };
  if (s.includes('precision')) return { glyph: 'precision', color: '#f5c95c', name: 'Precision Arrow' };
  if (s.includes('tear')) return { glyph: 'tearblast', color: '#9adfe8', name: 'Tearblast Arrow' };
  if (s.includes('fire')) return { glyph: 'fire', color: '#f0a03c', name: 'Fire Arrow' };
  if (s.includes('shock')) return { glyph: 'shock', color: '#4fa3e3', name: 'Shock Arrow' };
  if (s.includes('freeze') || s.includes('chill')) return { glyph: 'freeze', color: '#59c1c6', name: 'Freeze Arrow' };
  if (s.includes('blast') || s.includes('bomb')) return { glyph: 'blast', color: '#e8762c', name: 'Blast Bomb' };
  if (s.includes('disc')) return { glyph: 'disc', color: '#f5c95c', name: 'Disc' };
  return { glyph: 'arrow', color: '#efe6d5', name: 'Hunter Arrow' };
}

/* item id -> glyph + color + display name (items builder catalog wins if present) */
const ITEMS = {
  'metal-shards': { glyph: 'shard', color: '#c9d4d8', name: 'Metal Shards' },
  'ridge-wood': { glyph: 'wood', color: '#b08a5a', name: 'Ridge-Wood' },
  'blaze': { glyph: 'fire', color: '#f0a03c', name: 'Blaze' },
  'chillwater': { glyph: 'droplet', color: '#59c1c6', name: 'Chillwater' },
  'sparker': { glyph: 'shock', color: '#4fa3e3', name: 'Sparker' },
  'echo-shell': { glyph: 'shell', color: '#8f7be8', name: 'Echo Shell' },
  'wire': { glyph: 'wire', color: '#9aa4a8', name: 'Wire' },
  'watcher-lens': { glyph: 'lens', color: '#4ec9b0', name: 'Watcher Lens' },
  'machine-heart': { glyph: 'core', color: '#3d7bd9', name: 'Machine Heart' },
  'machine-core': { glyph: 'core', color: '#3d7bd9', name: 'Machine Core' },
  'medicinal-herb': { glyph: 'leaf', color: '#7fb069', name: 'Medicinal Herb' },
  'blastpaste': { glyph: 'blast', color: '#e8762c', name: 'Blastpaste' },
};

function prettify(id) {
  return String(id).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const AWARE_EDGE_MARGIN = 42;

function wrap180(d) {
  d %= 360;
  if (d > 180) d -= 360;
  else if (d < -180) d += 360;
  return d;
}
function norm360(d) {
  d %= 360;
  return d < 0 ? d + 360 : d;
}
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function div(cls, parent, html) {
  const el = document.createElement('div');
  el.className = cls;
  if (html != null) el.innerHTML = html;
  parent.appendChild(el);
  return el;
}

/**
 * HZD-accurate presentation layer (round 2): segmented red health + green
 * medicine pouch, parchment compass ribbon with diamond pips, screen-edge
 * awareness indicators, weapon/ammo HUD, Concentration gauge, [E] interaction
 * prompt, item toasts, damage/tear numbers, machine health + elemental
 * buildup meters, quest chain, and the title/pause/death/victory screens.
 */
export class HUD {
  constructor(ctx) {
    this.ctx = ctx;
    this.rootEl = document.getElementById('hud');

    this._vw = window.innerWidth;
    this._vh = window.innerHeight;
    window.addEventListener('resize', () => {
      this._vw = window.innerWidth;
      this._vh = window.innerHeight;
    });

    this._v = new THREE.Vector3(); // scratch for projections

    // compass window: ±70° visible, mapped across 480px (edges masked out)
    this._halfWinDeg = 70;
    this._pxPerDeg = 3.35;

    // dirty-check caches so per-frame DOM writes only happen on change
    this._lastHp = -1;
    this._lastLow = null;
    this._lastPouch = -1;
    this._lastPouchHint = null;
    this._lastHealing = null;
    this._lastIdle = null;
    this._lastAim = null;
    this._lastWpnSig = '';
    this._lastConcSig = '';
    this._lastIntSig = '';
    this._lastBearing = -1;
    this._lastVin = -1;
    this._lastMhbW = -1;
    this._lastElemSig = '';

    this._hurtFlash = 0;
    this._mhbTarget = null;
    this._mhbTimer = 0;
    this._mhbShown = false;

    this._pips = new Map();        // machine -> compass pip element
    this._awares = new Map();      // machine -> awareness indicator entry
    this._attackFlash = new Map(); // machine -> remaining flash seconds

    // quest sequencer
    this._killCounts = Object.create(null);
    this._stage = 0;
    this._victoryFired = false;
    this._victoryShown = false;
    this._lastObjTitle = null;

    this._build();
    this._bindEvents();
    this._renderObjective(false);
  }

  /* --------------------------------- DOM ---------------------------------- */

  _build() {
    const root = this.rootEl;

    this._vignette = div('hzc-vignette', root);

    // top-left vitals: segmented RED health, thin GREEN pouch meter under it
    const tl = div('hzc-topleft', root);
    this._topleftEl = tl;
    const hb = div('hzc-healthbar', tl);
    this._healthFill = div('hzc-healthfill', hb);
    for (const pct of [25, 50, 75]) {
      const seg = div('hzc-health-seg', hb);
      seg.style.left = pct + '%';
    }
    const pr = div('hzc-pouchrow', tl);
    this._pouchRow = pr;
    this._pouchFill = div('hzc-pouchfill', div('hzc-pouchbar', pr));
    this._pouchKey = document.createElement('kbd');
    this._pouchKey.className = 'hzc-pouch-key';
    this._pouchKey.textContent = 'Q';
    pr.appendChild(this._pouchKey);

    // compass ribbon
    const comp = div('hzc-compass', root);
    const win = div('hzc-compass-window', comp);
    const track = div('hzc-compass-track', win);
    this._ticks = [];
    for (let a = 0; a < 360; a += 15) {
      if (a % 45 === 0) continue;
      this._ticks.push({ a, el: div('hzc-tick', track), label: false, vis: null });
    }
    const dirs = [
      [0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'],
      [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW'],
    ];
    for (const [a, n] of dirs) {
      let cls = 'hzc-cdir';
      if (n.length === 1) cls += ' main';
      if (n === 'N') cls += ' north';
      this._ticks.push({ a, el: div(cls, track, n), label: true, vis: null });
    }
    this._pipLayer = div('hzc-compass-pips', win);
    div('hzc-compass-caret', comp);
    this._bearingEl = div('hzc-bearing', comp, '000');

    // machine health bar + elemental buildup micro-meters
    this._mhbEl = div('hzc-mhb', root);
    this._mhbName = div('hzc-mhb-name', this._mhbEl, 'MACHINE');
    this._mhbFill = div('hzc-mhb-fill', div('hzc-mhb-bar', this._mhbEl));
    const elems = div('hzc-mhb-elems', this._mhbEl);
    this._elemEls = {};
    for (const e of ['fire', 'shock', 'freeze']) {
      const row = div('hzc-elem', elems, svgIcon(e === 'fire' ? 'fire' : e === 'shock' ? 'shock' : 'freeze', 'currentColor'));
      row.dataset.e = e;
      this._elemEls[e] = { row, fill: div('hzc-elem-fill', div('hzc-elem-bar', row)), w: -1, trig: null, shown: null };
    }

    // awareness indicator layer (screen-projected, edge-clamped)
    this._awareLayer = div('hzc-awares', root);

    // objective card
    this._objEl = div('hzc-objective', root);
    div('hzc-obj-kicker', this._objEl, 'HUNT');
    this._objTitle = div('hzc-obj-title', this._objEl);
    this._objDetail = div('hzc-obj-detail', this._objEl);
    this._objProg = div('hzc-obj-progress', this._objEl);

    // crosshair — every stroke is doubled (dark under, light over) so it
    // stays readable against bright sky and chrome machine plating alike
    const cross = div('hzc-cross', root);
    div('hzc-dot', cross);
    this._ring = div('hzc-ring', cross);
    this._ring.innerHTML =
      '<svg viewBox="0 0 72 72">' +
      '<circle class="track-under" cx="36" cy="36" r="26"/>' +
      '<circle class="track" cx="36" cy="36" r="26"/>' +
      '<circle class="prog-under" cx="36" cy="36" r="26" transform="rotate(-90 36 36)"/>' +
      '<circle class="prog" cx="36" cy="36" r="26" transform="rotate(-90 36 36)"/>' +
      '</svg>';
    this._prog = this._ring.querySelector('.prog');
    this._progUnder = this._ring.querySelector('.prog-under');
    this._ringC = 2 * Math.PI * 26;
    for (const el of [this._prog, this._progUnder]) {
      el.style.strokeDasharray = this._ringC.toFixed(2);
      el.style.strokeDashoffset = this._ringC.toFixed(2);
    }
    // Concentration gauge: thin yellow vertical drain bar beside the reticle
    this._concEl = div('hzc-conc', cross);
    this._concFill = div('hzc-conc-fill', this._concEl);

    // [E] interaction prompt with radial hold fill
    this._intEl = div('hzc-interact', root);
    this._intRing = div('hzc-int-ring', this._intEl);
    const intKey = document.createElement('kbd');
    intKey.className = 'hzc-int-key';
    intKey.textContent = 'E';
    this._intRing.appendChild(intKey);
    this._intLabel = div('hzc-int-label', this._intEl, 'LOOT');

    // weapon HUD bottom-right
    const wpn = div('hzc-weapon', root);
    this._wpnName = div('hzc-wpn-name', wpn, 'HUNTER BOW');
    const wrow = div('hzc-wpn-row', wpn);
    this._wpnGlyph = div('hzc-wpn-glyph', wrow, svgIcon('arrow', '#efe6d5'));
    this._wpnCount = div('hzc-wpn-count', wrow, '∞');
    this._wpnAmmoName = div('hzc-wpn-ammoname', wpn, 'HUNTER ARROW');
    div('hzc-wpn-hint', wpn,
      '<kbd>Z</kbd><kbd>X</kbd><span>AMMO</span><kbd>TAB</kbd><span>WHEEL</span>');

    // item pickup toasts (bottom-right stack, above the weapon HUD)
    this._itemsEl = div('hzc-items', root);

    // kill feed + damage numbers
    this._toastsEl = div('hzc-toasts', root);
    const dl = div('hzc-dmglayer', root);
    this._dmgPool = [];
    for (let i = 0; i < 24; i++) {
      this._dmgPool.push({
        el: div('hzc-dmg', dl),
        active: false, age: 0, dur: 1, drift: 0,
        world: new THREE.Vector3(),
      });
    }

    // death screen
    this._deathEl = div('hzc-death', root);
    div('hzc-death-title', this._deathEl, 'YOU DIED');
    div('hzc-death-rule', this._deathEl);
    div('hzc-death-sub', this._deathEl, 'THE CAMPFIRE REKINDLES YOUR SPARK');

    // victory screen
    this._victoryEl = div('hzc-victory', root);
    div('hzc-victory-kicker', this._victoryEl, 'QUEST COMPLETED');
    div('hzc-victory-title', this._victoryEl, 'VALLEY RECLAIMED');
    div('hzc-victory-line', this._victoryEl);
    div('hzc-victory-sub', this._victoryEl, 'EVERY MACHINE LIES SILENT · THE HUNT IS OVER');

    // pause menu (only HUD child with pointer events)
    this._pauseEl = div('hzc-pause', root);
    const pi = div('hzc-pause-inner', this._pauseEl);
    div('hzc-pause-title', pi, 'PAUSED');
    const btn = document.createElement('button');
    btn.className = 'hzc-btn';
    btn.textContent = 'RESUME THE HUNT';
    btn.addEventListener('click', () => this.setPaused(false));
    pi.appendChild(btn);
    div('hzc-pause-hints', pi,
      '<div><b>WASD</b> Move</div><div><b>SHIFT</b> Sprint · Concentration (aim)</div>' +
      '<div><b>C</b> Crouch</div><div><b>SPACE / CTRL</b> Dodge roll</div>' +
      '<div><b>RMB</b> Aim</div><div><b>LMB</b> Draw / loose</div>' +
      '<div><b>TAB</b> Weapon wheel (hold)</div><div><b>1–4</b> Weapon quick-slots</div>' +
      '<div><b>Z / X</b> Cycle ammo</div><div><b>V</b> Focus</div>' +
      '<div><b>T</b> Tag machine (Focus)</div><div><b>E</b> Interact (hold)</div>' +
      '<div><b>Q</b> Medicine (hold)</div><div><b>R</b> Craft ammo</div>' +
      '<div><b>I</b> Inventory</div><div><b>ESC</b> Pause</div>');
  }

  /* -------------------------------- events -------------------------------- */

  _bindEvents() {
    const ev = this.ctx.events;

    // machine-damaged carries the v2 payload extensions (tear/tornPart);
    // it is the single source for damage numbers so hits never double-pop.
    ev.on('machine-damaged', (e) => {
      const m = e?.machine;
      if (!m) return;
      if (m !== this._mhbTarget) {
        this._mhbTarget = m;
        this._renderMhbName(m);
        this._lastMhbW = -1;
        this._lastElemSig = '';
      }
      this._mhbTimer = 4;
      this._spawnDamage(e);
    });
    ev.on('machine-killed', (e) => this._onKill(e));
    ev.on('machine-attack', (e) => {
      if (e?.machine) this._attackFlash.set(e.machine, 1.35);
    });
    ev.on('machine-telegraph', (e) => {
      if (e?.machine) this._attackFlash.set(e.machine, 0.65);
    });
    ev.on('item-gained', (e) => this._itemToast(e));
    ev.on('player-hurt', () => {
      this._hurtFlash = Math.min(1.2, this._hurtFlash + 0.75);
    });
    ev.on('player-died', () => {
      if (this._victoryShown) return; // victory owns the screen — no death card
      this._deathEl.classList.add('show');
    });
    ev.on('player-respawn', () => {
      this._deathEl.classList.remove('show');
      this._hurtFlash = 0;
      this._vignette.style.opacity = '0';
      this._lastVin = 0;
      // Race guard: if victory fired during the respawn window, player.js just
      // reset state to 'playing' underneath the overlay — re-assert victory.
      if (this._victoryShown) {
        this.ctx.state = 'victory';
        this.ctx.input.exitPointerLock();
      }
    });
    ev.on('victory', () => this._showVictory());
    ev.on('game-start', () => this._renderObjective(false));

    this.ctx.input.onDown('Escape', () => {
      if (this.ctx.state === 'playing') this.setPaused(true);
      else if (this.ctx.state === 'paused') this.setPaused(false);
    });
    // Browsers exit pointer lock on Esc without delivering the keydown —
    // treat any lock loss during play as a pause request.
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement == null &&
          this.ctx.state === 'playing' &&
          this.ctx.game?.started &&
          !this.ctx.params.has('shot')) {
        this.setPaused(true);
      }
    });
    // Esc-unpause can't re-acquire pointer lock (no user activation, and
    // browsers enforce a cooldown after Esc). Any click while playing and
    // unlocked counts as the activation we need to restore mouse-look.
    document.addEventListener('mousedown', () => {
      if (this.ctx.state === 'playing' &&
          !this.ctx.input.pointerLocked &&
          !this.ctx.params.has('shot')) {
        this.ctx.input.requestPointerLock();
      }
    });
  }

  /* ------------------------------ pause menu ------------------------------- */

  setPaused(on) {
    const ctx = this.ctx;
    if (on) {
      if (ctx.state !== 'playing') return;
      ctx.state = 'paused';
      this._pauseEl.classList.add('show');
      ctx.input.exitPointerLock();
    } else {
      if (ctx.state !== 'paused') return;
      ctx.state = 'playing';
      this._pauseEl.classList.remove('show');
      if (!ctx.params.has('shot')) ctx.input.requestPointerLock();
    }
  }

  /* --------------------------- quest sequencer ----------------------------- */

  _onKill(e) {
    const m = e?.machine ?? e ?? {};
    const kind = m.kind ?? 'machine';
    this._killCounts[kind] = (this._killCounts[kind] || 0) + 1;

    const name = String(m.displayName ?? kind).toUpperCase();
    this._toast(`<b>${name}</b>&ensp;DESTROYED&ensp;·&ensp;+${XP[kind] ?? 100} XP`);

    if (m === this._mhbTarget) this._mhbTimer = Math.min(this._mhbTimer, 0.9);
    this._attackFlash.delete(m);

    let advanced = false;
    while (this._stage < QUEST.length &&
           (this._killCounts[QUEST[this._stage].kind] || 0) >= QUEST[this._stage].need) {
      this._stage++;
      advanced = true;
    }
    if (advanced && this._stage < QUEST.length) this._toast('<b>OBJECTIVE COMPLETE</b>');
    this._renderObjective(advanced);

    // Killing the Thunderjaw completes the hunt (SPEC) even if earlier quest
    // stages are unfinished; the full chain also lands here on its last kill.
    if (!this._victoryFired && (kind === 'thunderjaw' || this._stage >= QUEST.length)) {
      this._victoryFired = true;
      // let the kill explosion breathe before the fanfare
      setTimeout(() => this.ctx.events.emit('victory'), 1400);
    }
  }

  _renderObjective(bump) {
    let title, detail;
    if (this._stage >= QUEST.length) {
      title = 'VALLEY RECLAIMED';
      detail = 'All machines destroyed';
      this._objProg.textContent = '';
    } else {
      const s = QUEST[this._stage];
      title = s.title;
      detail = s.detail;
      const have = Math.min(this._killCounts[s.kind] || 0, s.need);
      this._objProg.textContent = `${have} / ${s.need} DESTROYED`;
    }
    this._objTitle.textContent = title;
    this._objDetail.textContent = detail;
    if (title !== this._lastObjTitle) {
      this._lastObjTitle = title;
      this.ctx.events.emit('objective-changed', { title, detail });
    }
    if (bump) {
      this._objEl.classList.remove('bump');
      void this._objEl.offsetWidth;
      this._objEl.classList.add('bump');
    }
  }

  _showVictory() {
    this._victoryFired = true;
    this._victoryShown = true;
    this._pauseEl.classList.remove('show');
    this._deathEl.classList.remove('show');
    this._victoryEl.classList.add('show');
    // hide every gameplay HUD layer under the overlay (see hud.css)
    this.rootEl.classList.add('endgame');
    this.ctx.state = 'victory';
    this.ctx.input.exitPointerLock();
  }

  /* ------------------------------ kill feed -------------------------------- */

  _toast(html) {
    const el = document.createElement('div');
    el.className = 'hzc-toast';
    el.innerHTML = html;
    this._toastsEl.appendChild(el);
    while (this._toastsEl.children.length > 4) this._toastsEl.firstChild.remove();
    setTimeout(() => el.remove(), 3250);
  }

  /* ------------------------------ item toasts ------------------------------ */

  _itemToast(e) {
    let id = e?.id ?? e?.item?.id ?? (typeof e?.item === 'string' ? e.item : null);
    let n = e?.count ?? e?.n ?? e?.qty ?? 1;
    if (id == null) return;
    id = String(id);

    // catalog lookup (items builder may expose one) with local fallback
    const inv = this.ctx.inventory;
    const cat = inv?.catalog ?? inv?.items;
    const entry = cat instanceof Map ? cat.get(id) : cat?.[id];
    const local = ITEMS[id] ?? {};
    const name = entry?.name ?? local.name ?? prettify(id);
    const glyph = entry?.glyph && GLYPHS[entry.glyph] ? entry.glyph : (local.glyph ?? 'shard');
    const color = entry?.color ?? local.color ?? '#efe6d5';

    // merge into the newest row when the same item streams in
    const last = this._itemsEl.lastChild;
    if (last && last.dataset.id === id) {
      n += Number(last.dataset.n) || 0;
      last.remove();
    }
    const el = document.createElement('div');
    el.className = 'hzc-item';
    el.dataset.id = id;
    el.dataset.n = String(n);
    el.innerHTML = `${svgIcon(glyph, color)}<span>${name}</span><b>×${n}</b>`;
    this._itemsEl.appendChild(el);
    while (this._itemsEl.children.length > 6) this._itemsEl.firstChild.remove();
    setTimeout(() => el.remove(), 3050);
  }

  /* ---------------------------- damage numbers ----------------------------- */

  _dmgSlot() {
    let slot = null, oldest = null;
    for (const c of this._dmgPool) {
      if (!c.active) { slot = c; break; }
      if (!oldest || c.age > oldest.age) oldest = c;
    }
    return slot ?? oldest;
  }

  _popNumber(point, text, cls, dur) {
    const slot = this._dmgSlot();
    slot.active = true;
    slot.age = 0;
    slot.dur = dur;
    slot.world.copy(point);
    slot.world.y += 0.15;
    slot.drift = (Math.random() - 0.5) * 40;
    slot.el.textContent = text;
    slot.el.className = 'hzc-dmg' + (cls ? ' ' + cls : '');
    slot.el.style.visibility = 'visible';
  }

  _spawnDamage(e) {
    if (!e) return;
    let point = e.point;
    if (!point && e.machine?.position) {
      this._v.copy(e.machine.position);
      this._v.y += (e.machine.height ?? 2) * 0.6;
      point = this._v;
    }
    if (!point) return;
    const dmg = Math.round(e.damage ?? 0);
    if (dmg > 0) this._popNumber(point, String(dmg), e.weak ? 'weak' : '', e.weak ? 1.1 : 0.9);
    // component ripped off -> blue-cyan '+TEAR' pop (v2 payload, defensive)
    if (e.tornPart) {
      this._v.copy(point);
      this._v.y += 0.42;
      this._popNumber(this._v, '+TEAR', 'tear', 1.2);
    }
  }

  _updateDamageNumbers(dt) {
    const cam = this.ctx.camera;
    const v = this._v;
    for (const d of this._dmgPool) {
      if (!d.active) continue;
      d.age += dt;
      if (d.age >= d.dur) {
        d.active = false;
        d.el.style.visibility = 'hidden';
        continue;
      }
      v.copy(d.world).project(cam);
      if (v.z > 1 || v.z < -1) {
        d.el.style.visibility = 'hidden';
        continue;
      }
      d.el.style.visibility = 'visible';
      const k = d.age / d.dur;
      const x = (v.x * 0.5 + 0.5) * this._vw + d.drift * k;
      const y = (-v.y * 0.5 + 0.5) * this._vh - 48 * k;
      d.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%,-100%)`;
      d.el.style.opacity = (k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88).toFixed(2);
    }
  }

  /* ------------------------------ frame update ----------------------------- */

  update(dt, t) {
    const p = this.ctx.player;
    if (!p) return;
    this._updateHealth(p);
    this._updateCompass(p);
    this._updateAwareness(dt, p);
    this._updateMachineBar(dt);
    this._updateCrosshair(p);
    this._updateWeapon();
    this._updateInteract();
    this._updateDamageNumbers(dt);
    this._updateVignette(dt, t, p);
  }

  /* --------------------------- health + pouch ------------------------------ */

  _updateHealth(p) {
    const hp = clamp01(p.health / p.maxHealth);
    const w = Math.round(hp * 200) / 2; // 0.5% granularity
    if (w !== this._lastHp) {
      this._lastHp = w;
      this._healthFill.style.width = w + '%';
      const low = hp < 0.32;
      if (low !== this._lastLow) {
        this._lastLow = low;
        this._healthFill.classList.toggle('low', low);
      }
    }

    const pouch = clamp01((p.pouch ?? 0) / (p.maxPouch || 100));
    const pw = Math.round(pouch * 100);
    if (pw !== this._lastPouch) {
      this._lastPouch = pw;
      this._pouchFill.style.width = pw + '%';
    }
    const healing = !!p.healing;
    if (healing !== this._lastHealing) {
      this._lastHealing = healing;
      this._pouchRow.classList.toggle('healing', healing);
    }
    const hint = (p.pouch ?? 0) > 0.5 && p.health < p.maxHealth;
    if (hint !== this._lastPouchHint) {
      this._lastPouchHint = hint;
      this._pouchKey.classList.toggle('show', hint);
    }
    // dynamic HUD: vitals recede when full and untouched (research 2, global)
    const idle = hp >= 0.999 && !healing;
    if (idle !== this._lastIdle) {
      this._lastIdle = idle;
      this._topleftEl.classList.toggle('idle', idle);
    }
  }

  /* -------------------------------- compass -------------------------------- */

  _updateCompass(p) {
    // camera forward is (-sin camYaw, -cos camYaw) => bearing = -camYaw
    const camB = norm360(-p.camYaw * RAD2DEG);

    for (const tk of this._ticks) {
      const d = wrap180(tk.a - camB);
      if (Math.abs(d) > this._halfWinDeg) {
        if (tk.vis !== false) { tk.el.style.visibility = 'hidden'; tk.vis = false; }
        continue;
      }
      if (tk.vis !== true) { tk.el.style.visibility = 'visible'; tk.vis = true; }
      const x = (d * this._pxPerDeg).toFixed(1);
      tk.el.style.transform = tk.label
        ? `translateX(calc(${x}px - 50%))`
        : `translateX(${x}px)`;
    }

    const bi = Math.round(camB) % 360;
    if (bi !== this._lastBearing) {
      this._lastBearing = bi;
      this._bearingEl.textContent = String(bi).padStart(3, '0');
    }

    const list = this.ctx.machines?.list;
    if (!Array.isArray(list)) return;
    for (const m of list) {
      let pip = this._pips.get(m);
      if (!pip) {
        pip = div('hzc-pip', this._pipLayer);
        this._pips.set(m, pip);
      }
      const pos = m.position ?? m.root?.position;
      if (!pos || m.alive === false) { pip.style.visibility = 'hidden'; continue; }
      const dx = pos.x - p.position.x;
      const dz = pos.z - p.position.z;
      const dist = Math.hypot(dx, dz);
      const d = wrap180(Math.atan2(dx, -dz) * RAD2DEG - camB);
      if (dist > 320 || dist < 2 || Math.abs(d) > this._halfWinDeg) {
        pip.style.visibility = 'hidden';
        continue;
      }
      pip.style.visibility = 'visible';
      pip.style.transform =
        `translateX(calc(${(d * this._pxPerDeg).toFixed(1)}px - 50%)) rotate(45deg)`;
      pip.style.opacity = Math.max(0.3, Math.min(1, 1.25 - dist / 300)).toFixed(2);
      const s = (m.state === 'alert' || m.state === 'attack') ? 'hostile'
        : (m.state === 'suspicious' || m.state === 'search') ? 'wary' : 'calm';
      if (pip.dataset.s !== s) pip.dataset.s = s;
    }
  }

  /* ------------------------ awareness indicators ---------------------------- */

  _awareEntry(m) {
    let a = this._awares.get(m);
    if (!a) {
      const el = div('hzc-aware', this._awareLayer);
      div('hzc-aware-circle', el);
      div('hzc-aware-diamond', el,
        '<svg viewBox="0 0 30 30"><polygon points="15,1 18.4,9.2 26,5.6 21.4,12.6 29,15 21.4,17.4 26,24.4 18.4,20.8 15,29 11.6,20.8 4,24.4 8.6,17.4 1,15 8.6,12.6 4,5.6 11.6,9.2"/></svg>');
      a = { el, circle: el.firstChild, mode: null, frac: -1, vis: null, edge: null };
      this._awares.set(m, a);
    }
    return a;
  }

  _updateAwareness(dt, p) {
    // decay attack-flash timers
    if (this._attackFlash.size) {
      for (const [m, ttl] of this._attackFlash) {
        const left = ttl - dt;
        if (left <= 0) this._attackFlash.delete(m);
        else this._attackFlash.set(m, left);
      }
    }

    const list = this.ctx.machines?.list;
    if (!Array.isArray(list)) return;
    const cam = this.ctx.camera;
    const v = this._v;

    for (const m of list) {
      const a = this._awareEntry(m);

      let mode = null;
      let frac = 0;
      if (m.alive !== false) {
        if (this._attackFlash.has(m)) {
          mode = 'attack';
        } else if (m.state === 'alert' || m.state === 'attack') {
          mode = 'alert';
        } else if (m.state === 'suspicious' || m.state === 'search') {
          mode = 'fill';
          frac = clamp01(m.suspicion ?? 0.5);
        }
      }

      if (!mode) {
        if (a.vis !== false) { a.el.style.visibility = 'hidden'; a.vis = false; }
        continue;
      }

      const pos = m.position ?? m.root?.position;
      if (!pos) {
        if (a.vis !== false) { a.el.style.visibility = 'hidden'; a.vis = false; }
        continue;
      }
      v.set(pos.x, pos.y + (m.height ?? 2.2) + 0.7, pos.z).project(cam);
      const behind = v.z > 1;
      let x = (v.x * 0.5 + 0.5) * this._vw;
      let y = (-v.y * 0.5 + 0.5) * this._vh;
      if (behind) { // mirror through screen center so the clamp points backward
        x = this._vw - x;
        y = this._vh - y;
      }
      const mgn = AWARE_EDGE_MARGIN;
      const edge = behind || x < mgn || x > this._vw - mgn || y < mgn || y > this._vh - mgn;
      if (edge) {
        // slide along the ray from screen center until it meets the margin
        // rectangle — off-screen threats pin to the edge toward the danger
        const cx = this._vw / 2, cy = this._vh / 2;
        const dx = x - cx;
        const dy = behind ? Math.abs(y - cy) + cy * 0.4 : y - cy; // park behind-threats low
        const k = Math.min(
          (cx - mgn) / Math.max(1e-4, Math.abs(dx)),
          (cy - mgn) / Math.max(1e-4, Math.abs(dy)),
        );
        x = cx + dx * k;
        y = cy + dy * k;
      }

      if (a.vis !== true) { a.el.style.visibility = 'visible'; a.vis = true; }
      if (a.edge !== edge) { a.edge = edge; a.el.classList.toggle('edge', edge); }
      a.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      if (a.mode !== mode) { a.mode = mode; a.el.dataset.m = mode; a.frac = -1; }
      if (mode === 'fill' && Math.abs(frac - a.frac) > 0.02) {
        a.frac = frac;
        a.circle.style.background =
          `conic-gradient(#f5c95c ${(frac * 100).toFixed(0)}%, rgba(8,10,12,0.35) 0)`;
      }
    }
  }

  /* --------------------- machine health + elemental meters ------------------ */

  _renderMhbName(m) {
    const name = String(m.displayName ?? m.kind ?? 'MACHINE').toUpperCase();
    const lv = m.level ?? LEVELS[m.kind];
    this._mhbName.innerHTML = lv != null ? `${name}&ensp;<b>LV ${lv}</b>` : name;
  }

  _updateMachineBar(dt) {
    const m = this._mhbTarget;
    if (m) {
      const hostile = m.alive !== false && (m.state === 'alert' || m.state === 'attack');
      if (hostile) this._mhbTimer = 4;
      this._mhbTimer -= dt;
    }
    const show = !!m && this._mhbTimer > 0;
    if (show !== this._mhbShown) {
      this._mhbShown = show;
      this._mhbEl.classList.toggle('show', show);
    }
    if (!show) return;

    const frac = clamp01((m.health ?? 0) / (m.maxHealth || 1));
    const w = Math.round(frac * 200) / 2;
    if (w !== this._lastMhbW) {
      this._lastMhbW = w;
      this._mhbFill.style.width = w + '%';
    }

    // elemental buildup micro-meters (machines builder lands machine.elemental
    // concurrently — read every shape defensively, hide when absent)
    const el = m.elemental;
    let sig = '';
    for (const k of ['fire', 'shock', 'freeze']) {
      const raw = el ? el[k] : null;
      let val = typeof raw === 'number' ? raw : raw?.value ?? raw?.buildup ?? 0;
      if (val > 1.5) val /= 100; // 0..100 scale -> 0..1
      val = clamp01(val);
      const trig = !!(raw && typeof raw === 'object'
        ? (raw.triggered ?? raw.active) : val >= 0.999);
      sig += k + (val * 50 | 0) + (trig ? 'T' : '');
      const e = this._elemEls[k];
      const shown = val > 0.02 || trig;
      if (shown !== e.shown) { e.shown = shown; e.row.classList.toggle('show', shown); }
      if (!shown) continue;
      const pw = Math.round(val * 100);
      if (pw !== e.w) { e.w = pw; e.fill.style.width = pw + '%'; }
      if (trig !== e.trig) { e.trig = trig; e.row.classList.toggle('triggered', trig); }
    }
    this._lastElemSig = sig;
  }

  /* -------------------- crosshair + concentration gauge --------------------- */

  _updateCrosshair(p) {
    const aiming = !!p.aiming;
    if (aiming !== this._lastAim) {
      this._lastAim = aiming;
      this._ring.classList.toggle('show', aiming);
      if (!aiming && this._lastConcSig !== 'off') {
        this._lastConcSig = 'off';
        this._concEl.classList.remove('show', 'active');
      }
    }
    if (!aiming) return;

    const dsRaw = this.ctx.combat?.drawStrength;
    const ds = typeof dsRaw === 'number' ? clamp01(dsRaw) : 0;
    const off = (this._ringC * (1 - ds)).toFixed(1);
    this._prog.style.strokeDashoffset = off;
    this._progUnder.style.strokeDashoffset = off;
    this._prog.classList.toggle('full', ds > 0.985);

    // Concentration gauge (weapons builder lands combat.concentration
    // concurrently) — thin yellow drain bar, only shown when not full
    const conc = this.ctx.combat?.concentration;
    const gauge = clamp01(conc?.gauge ?? 1);
    const active = !!conc?.active;
    const show = gauge < 0.995 || active;
    const sig = show ? `${(gauge * 100) | 0}|${active ? 1 : 0}` : 'off';
    if (sig !== this._lastConcSig) {
      this._lastConcSig = sig;
      this._concEl.classList.toggle('show', show);
      this._concEl.classList.toggle('active', active);
      if (show) this._concFill.style.height = ((gauge * 100) | 0) + '%';
    }
  }

  /* ------------------------------ weapon HUD -------------------------------- */

  _updateWeapon() {
    const c = this.ctx.combat;
    const w = c?.activeWeapon;

    // active ammo may be an id string or an ammo object (v2), or the round-1
    // arrowType — normalize to an id + optional object
    let ammo = c?.activeAmmo ?? w?.activeAmmo ?? c?.arrowType ?? 'hunter';
    let ammoObj = null;
    if (ammo && typeof ammo === 'object') {
      ammoObj = ammo;
      ammo = ammo.id ?? ammo.name ?? 'hunter';
    }
    if (typeof ammo === 'number') ammo = ['hunter', 'fire', 'shock'][ammo] ?? 'hunter';
    if (!ammoObj && Array.isArray(w?.ammoTypes)) {
      ammoObj = w.ammoTypes.find((a) => a && (a.id === ammo || a.name === ammo)) ?? null;
    }

    let count = ammoObj?.count;
    if (count == null) {
      count = c?.counts?.[ammo] ?? c?.ammoCounts?.[ammo] ?? c?.arrowCounts?.[ammo];
    }
    if (count == null && String(ammo) === 'hunter') count = Infinity;

    const wName = String(w?.name ?? w?.displayName ?? 'Hunter Bow').toUpperCase();
    const look = ammoLook(ammo);
    const ammoName = String(ammoObj?.name ?? look.name).toUpperCase();
    const countText = count === Infinity ? '∞' : count == null ? '—' : String(count | 0);

    const sig = `${wName}|${ammo}|${countText}|${ammoName}`;
    if (sig === this._lastWpnSig) return;
    this._lastWpnSig = sig;

    this._wpnName.textContent = wName;
    this._wpnAmmoName.textContent = ammoName;
    this._wpnCount.textContent = countText;
    this._wpnCount.classList.toggle('empty', typeof count === 'number' && count <= 0);
    this._wpnGlyph.innerHTML = svgIcon(look.glyph, look.color);
  }

  /* --------------------------- interaction prompt --------------------------- */

  _updateInteract() {
    const cur = this.ctx.interactables?.current;
    if (!cur) {
      if (this._lastIntSig !== 'off') {
        this._lastIntSig = 'off';
        this._intEl.classList.remove('show');
      }
      return;
    }
    const label = String(cur.label ?? 'INTERACT').toUpperCase();
    const prog = clamp01(cur.holdProgress ?? cur.progress ?? 0);
    const sig = `${label}|${(prog * 50) | 0}`;
    if (sig === this._lastIntSig) return;
    this._lastIntSig = sig;
    this._intEl.classList.add('show');
    this._intLabel.textContent = label;
    this._intRing.style.background =
      `conic-gradient(#f5c95c ${(prog * 100).toFixed(0)}%, rgba(239,230,213,0.18) 0)`;
  }

  /* ------------------------------- vignette --------------------------------- */

  _updateVignette(dt, t, p) {
    this._hurtFlash = Math.max(0, this._hurtFlash - dt * 0.9);
    const hp = p.health / p.maxHealth;
    const low = hp < 0.35 ? (0.35 - hp) / 0.35 : 0;
    const pulse = low > 0 ? low * (0.38 + 0.1 * Math.sin(t * 4.2)) : 0;
    const o = Math.min(0.92, this._hurtFlash * 0.8 + pulse);
    if (Math.abs(o - this._lastVin) > 0.008) {
      this._lastVin = o;
      this._vignette.style.opacity = o.toFixed(3);
    }
  }
}
