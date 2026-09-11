/**
 * WORLD MAP  —  lane `shell-menus`  (ui-02, progression-003, missing-systems-map-quest-log)
 * ===========================================================================
 * A real map, not a minimap: the terrain is BAKED from the same heightfield the
 * renderer draws (`terrain.heightFast` / `slopeFast` / `surfaceAt`), shaded with
 * a low sun so ridges and the river read at a glance, and cached as an
 * ImageBitmap-sized canvas that is drawn once per open.
 *
 * Layers, bottom to top:
 *   1. relief bake            720 × 720 m sampled on a 288² grid (2.5 m/px)
 *   2. fog of war             cells the player has never been within 95 m of,
 *                             painted back over the relief and eroded with a
 *                             soft 1-cell blur so the frontier is not a staircase
 *   3. play-radius ring       the r = 330 m edge the world actually ends at
 *   4. sites                  camp, landmarks, activity sites, datapoints
 *   5. quest markers          `progression.getMarkers()` — the same list the
 *                             compass draws, so the two can never disagree
 *   6. tagged machines        `focus.tags` only (ui-04: the map is not a radar)
 *   7. player                 position + facing wedge
 *   8. waypoint               click anywhere reachable to plant one
 *
 * The waypoint is published on `ctx.menus.waypoint` and announced with
 * `waypoint-set` / `waypoint-cleared`, which is what `shell-hud` renders on the
 * compass. Until that lane ships it, `WaypointBeacon` (bottom of this file)
 * draws the bearing caret and the metre readout itself, docked under the HUD's
 * compass ribbon and retired automatically the moment `ctx.hud.setWaypoint`
 * exists — so the feature is never a promise, and never a duplicate.
 *
 * Cost: the bake is chunked across animation frames (16 rows at a time) and
 * runs once per session; everything else is a ~1 ms canvas pass on open and on
 * interaction. Nothing here runs while the world is simulating.
 */

import { WORLD_SIZE, WORLD_HALF, PLAY_RADIUS } from '../world/terrain.js';

const FOG_N = 72;                       // fog cells per axis (10 m cells)
const FOG_REVEAL_M = 95;                // how far Aloy's presence clears fog
const BAKE_N = 288;                     // relief samples per axis (2.5 m/px)
const MAP_PX = 720;                     // canvas pixels per axis
const FOG_KEY = 'hzc.map.v1';

/** Marker kinds you can travel TO (a quest arrow or a machine is not a place). */
const TRAVELABLE = new Set(['camp', 'landmark', 'tallneck', 'lookout', 'cache', 'override', 'hunting-ground']);
/** How close to the fire counts as "at the campfire". */
const CAMPFIRE_R = 7;

const el = (tag, cls, parent, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  if (parent) parent.appendChild(n);
  return n;
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, k) => a + (b - a) * k;

/** Height ramp: riverbed silt → meadow → upland → scree → snow. */
const RAMP = [
  [-6, [44, 62, 76]],
  [0, [104, 112, 78]],
  [6, [126, 130, 84]],
  [16, [150, 141, 90]],
  [34, [158, 134, 96]],
  [58, [152, 138, 118]],
  [92, [170, 168, 166]],
  [140, [216, 218, 222]],
];

function rampAt(h) {
  for (let i = 1; i < RAMP.length; i++) {
    if (h <= RAMP[i][0] || i === RAMP.length - 1) {
      const [h0, c0] = RAMP[i - 1];
      const [h1, c1] = RAMP[i];
      const k = clamp((h - h0) / (h1 - h0 || 1), 0, 1);
      return [lerp(c0[0], c1[0], k), lerp(c0[1], c1[1], k), lerp(c0[2], c1[2], k)];
    }
  }
  return RAMP[0][1];
}

/* ========================================================================= */
/* relief bake                                                               */
/* ========================================================================= */

export class MapBake {
  constructor(ctx) {
    this.ctx = ctx;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = MAP_PX;
    this.g = this.canvas.getContext('2d', { willReadFrequently: false });
    this.ready = false;
    this.rows = 0;
    this._img = null;
    this._running = false;
  }

  /** Chunked so a first open never costs a visible hitch. */
  start(onProgress) {
    if (this.ready || this._running) return;
    const terrain = this.ctx.terrain;
    if (!terrain) return;
    this._running = true;
    this._img = this.g.createImageData(BAKE_N, BAKE_N);
    const step = WORLD_SIZE / BAKE_N;
    const h = (x, z) => (terrain.heightFast ? terrain.heightFast(x, z) : terrain.getHeight(x, z));
    const water = this.ctx.environment?.water;

    const run = () => {
      const t0 = performance.now();
      const data = this._img.data;
      while (this.rows < BAKE_N && performance.now() - t0 < 6) {
        const iz = this.rows;
        const z = -WORLD_HALF + (iz + 0.5) * step;
        for (let ix = 0; ix < BAKE_N; ix++) {
          const x = -WORLD_HALF + (ix + 0.5) * step;
          const y = h(x, z);
          let [r, g, b] = rampAt(y);

          /**
           * Hillshade from a NW sun: the difference between a map and a blob.
           * The term is centred on 1.0, not on 0.5 — the first cut halved every
           * flat pixel in the valley and the explored region came out as a dark
           * olive smear you could not read a ridge off (`shots/sm-hub-map.png`).
           * Flat ground now keeps its ramp colour and only slope moves it.
           */
          const hx = h(x + step, z) - h(x - step, z);
          const hz = h(x, z + step) - h(x, z - step);
          const shade = clamp(1 + (-hx * 0.55 - hz * 0.42) / (step * 1.1), 0.42, 1.72);
          r *= shade; g *= shade; b *= shade;

          // water reads as water, at its own level
          const d = water?.depthAt ? water.depthAt(x, z) : 0;
          if (d > 0.02) {
            const k = clamp(d / 2.2, 0.25, 0.9);
            r = lerp(r, 44, k); g = lerp(g, 92, k); b = lerp(b, 120, k);
          }

          const o = (iz * BAKE_N + ix) * 4;
          data[o] = clamp(r, 0, 255); data[o + 1] = clamp(g, 0, 255); data[o + 2] = clamp(b, 0, 255);
          data[o + 3] = 255;
        }
        this.rows++;
      }
      onProgress?.(this.rows / BAKE_N);
      if (this.rows >= BAKE_N) {
        this._finish();
      } else {
        requestAnimationFrame(run);
      }
    };
    requestAnimationFrame(run);
  }

  _finish() {
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = BAKE_N;
    tmp.getContext('2d').putImageData(this._img, 0, 0);
    this.g.imageSmoothingEnabled = true;
    this.g.imageSmoothingQuality = 'high';
    this.g.clearRect(0, 0, MAP_PX, MAP_PX);
    this.g.drawImage(tmp, 0, 0, MAP_PX, MAP_PX);
    this._img = null;
    this._running = false;
    this.ready = true;
  }
}

/* ========================================================================= */
/* fog of war                                                                */
/* ========================================================================= */

export class FogOfWar {
  constructor() {
    this.cells = new Uint8Array(FOG_N * FOG_N);
    this.seen = 0;
    this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(FOG_KEY);
      if (!raw) return;
      const bits = atob(raw);
      if (bits.length !== this.cells.length) return;
      for (let i = 0; i < bits.length; i++) {
        this.cells[i] = bits.charCodeAt(i) ? 1 : 0;
        if (this.cells[i]) this.seen++;
      }
    } catch { /* first run, or storage off */ }
  }

  save() {
    try {
      let s = '';
      for (let i = 0; i < this.cells.length; i++) s += String.fromCharCode(this.cells[i]);
      localStorage.setItem(FOG_KEY, btoa(s));
    } catch { /* ignore */ }
  }

  clear() { this.cells.fill(0); this.seen = 0; this.save(); }

  /** Reveal a disc; returns how many cells this call opened. */
  reveal(x, z, radius = FOG_REVEAL_M) {
    const step = WORLD_SIZE / FOG_N;
    const ci = (x + WORLD_HALF) / step;
    const cz = (z + WORLD_HALF) / step;
    const r = radius / step;
    let opened = 0;
    const i0 = Math.max(0, Math.floor(ci - r)), i1 = Math.min(FOG_N - 1, Math.ceil(ci + r));
    const z0 = Math.max(0, Math.floor(cz - r)), z1 = Math.min(FOG_N - 1, Math.ceil(cz + r));
    for (let iz = z0; iz <= z1; iz++) {
      for (let ix = i0; ix <= i1; ix++) {
        const dx = ix + 0.5 - ci, dz = iz + 0.5 - cz;
        if (dx * dx + dz * dz > r * r) continue;
        const o = iz * FOG_N + ix;
        if (!this.cells[o]) { this.cells[o] = 1; opened++; }
      }
    }
    if (opened) this.seen += opened;
    return opened;
  }

  get fraction() { return this.seen / this.cells.length; }

  /** Has the player ever been near enough to this spot to have seen it? */
  seenAt(x, z) {
    const step = WORLD_SIZE / FOG_N;
    const ix = Math.floor((x + WORLD_HALF) / step);
    const iz = Math.floor((z + WORLD_HALF) / step);
    if (ix < 0 || iz < 0 || ix >= FOG_N || iz >= FOG_N) return false;
    return !!this.cells[iz * FOG_N + ix];
  }

  /**
   * Paint the UNSEEN area onto a 2D context in map pixels.
   *
   * THE FRONTIER IS NOT A STAIRCASE. Filling one 10 × 10 m rect per unseen cell
   * drew the explored region as a pixel-art blob with 10 m teeth — filmed at
   * `shots/sm-hub-map.png`. The mask is instead rasterised once at cell
   * resolution into a 72² offscreen canvas and then drawn up to map pixels with
   * smoothing on, so the browser's own bilinear filter does the erosion for
   * free: same cost, a soft edge, and the frontier reads as "we have not been
   * out there" instead of as a rendering artefact.
   */
  paint(g, size) {
    if (!this._mask) {
      this._mask = document.createElement('canvas');
      this._mask.width = this._mask.height = FOG_N;
      this._maskG = this._mask.getContext('2d');
    }
    const mg = this._maskG;
    const img = mg.createImageData(FOG_N, FOG_N);
    const d = img.data;
    for (let i = 0; i < this.cells.length; i++) {
      const o = i * 4;
      d[o] = 7; d[o + 1] = 11; d[o + 2] = 16;
      d[o + 3] = this.cells[i] ? 0 : 222;      // 0.87 over the unknown
    }
    mg.putImageData(img, 0, 0);
    g.save();
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    // inset by half a cell so the smoothing samples cell CENTRES, not corners
    const half = size / FOG_N / 2;
    g.drawImage(this._mask, -half, -half, size + half * 2, size + half * 2);
    g.restore();
  }
}

/* ========================================================================= */
/* the map screen                                                            */
/* ========================================================================= */

const GLYPHS = {
  camp: { icon: '▲', color: '#e8c56a', label: 'Mother’s Watch' },
  landmark: { icon: '◆', color: '#9fd8e0', label: 'Landmark' },
  tallneck: { icon: '⚑', color: '#9fd8e0', label: 'Tallneck' },
  lookout: { icon: '⌂', color: '#9fd8e0', label: 'Lookout' },
  datapoint: { icon: '▣', color: '#c9a4ff', label: 'Datapoint' },
  cache: { icon: '■', color: '#e0b06a', label: 'Supply Cache' },
  override: { icon: '◉', color: '#37e0a0', label: 'Override Node' },
  'hunting-ground': { icon: '✦', color: '#f2c230', label: 'Hunting Ground' },
  quest: { icon: '◇', color: '#f2c230', label: 'Objective' },
  machine: { icon: '●', color: '#e8762c', label: 'Machine' },
};

export class WorldMap {
  constructor(ctx, menus) {
    this.ctx = ctx;
    this.menus = menus;
    this.bake = new MapBake(ctx);
    this.fog = new FogOfWar();
    this.waypoint = null;
    this.root = null;
    this.canvas = null;
    this._hover = null;
    this._selected = null;      // the site the side panel is offering to travel to
    this._sinceReveal = 0;
    this._legendOn = true;
    this._pendingSave = false;
    this._travels = 0;
  }

  /* ------------------------------------------------------------ lifecycle */

  /** Called from the menus system's update — only while the world is live. */
  track(dt) {
    const p = this.ctx.player;
    if (!p) return;
    this._sinceReveal += dt;
    if (this._sinceReveal < 0.35) return;
    this._sinceReveal = 0;
    if (this.fog.reveal(p.position.x, p.position.z)) this._pendingSave = true;
    if (this._pendingSave && Math.random() < 0.08) { this.fog.save(); this._pendingSave = false; }
  }

  mount(host) {
    this.root = el('div', 'mn-map', host);
    const frame = el('div', 'mn-map-frame', this.root);
    this.canvas = el('canvas', 'mn-map-canvas', frame);
    this.canvas.width = this.canvas.height = MAP_PX;
    this._tip = el('div', 'mn-map-tip', frame);
    this._tip.style.display = 'none';

    const side = el('aside', 'mn-map-side', this.root);
    el('h3', 'mn-set-title', side, 'THE VALLEY');
    this._stats = el('div', 'mn-map-stats', side);
    this._wpBox = el('div', 'mn-map-wp', side);
    this._legend = el('div', 'mn-map-legend', side);
    for (const key of ['camp', 'landmark', 'datapoint', 'cache', 'override', 'hunting-ground', 'quest', 'machine']) {
      const g = GLYPHS[key];
      const row = el('div', 'mn-map-leg-row', this._legend);
      el('span', 'mn-map-leg-icon', row, g.icon).style.color = g.color;
      el('span', 'mn-map-leg-text', row, g.label.toUpperCase());
    }
    el('div', 'mn-set-note', side,
      'CLICK THE MAP TO PLANT A WAYPOINT · RIGHT-CLICK TO CLEAR IT · '
      + 'CLICK A SITE TO SELECT IT, THEN FAST TRAVEL FROM A CAMPFIRE');

    this.canvas.addEventListener('mousemove', (e) => this._onHover(e));
    this.canvas.addEventListener('mouseleave', () => { this._hover = null; this._tip.style.display = 'none'; this.draw(); });
    this.canvas.addEventListener('click', (e) => this._onClick(e));
    this.canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); this.clearWaypoint(); });

    if (!this.bake.ready) this.bake.start(() => this.draw());
    // reveal around the player the first time the map is ever opened, so a
    // fresh save is not a black square
    const p = this.ctx.player;
    if (p) this.fog.reveal(p.position.x, p.position.z);
    this.draw();
    return this.root;
  }

  unmount() { this.root?.remove(); this.root = null; this.canvas = null; }

  /* ------------------------------------------------------- coordinate math */

  worldToMap(x, z) {
    return {
      x: ((x + WORLD_HALF) / WORLD_SIZE) * MAP_PX,
      y: ((z + WORLD_HALF) / WORLD_SIZE) * MAP_PX,
    };
  }

  mapToWorld(px, py) {
    return {
      x: (px / MAP_PX) * WORLD_SIZE - WORLD_HALF,
      z: (py / MAP_PX) * WORLD_SIZE - WORLD_HALF,
    };
  }

  _eventToMap(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      px: ((e.clientX - r.left) / r.width) * MAP_PX,
      py: ((e.clientY - r.top) / r.height) * MAP_PX,
    };
  }

  /* -------------------------------------------------------------- markers */

  markers() {
    const out = [];
    const ctx = this.ctx;
    const camp = { x: 18, z: 26 };
    out.push({ kind: 'camp', x: camp.x, z: camp.z, name: 'Mother’s Watch', done: false });

    for (const l of (ctx.props?.landmarks || [])) {
      const kind = l.id === 'tallneck' ? 'tallneck' : l.id === 'lookout' ? 'lookout' : 'landmark';
      out.push({ kind, x: l.x, z: l.z, name: l.name || l.id, done: false });
    }
    try {
      for (const s of (ctx.props?.sites?.() || [])) {
        out.push({ kind: s.kind, x: s.x, z: s.z, name: s.name, done: !!s.done });
      }
    } catch { /* activities not built yet */ }

    try {
      for (const m of (ctx.progression?.getMarkers?.() || [])) {
        out.push({ kind: 'quest', x: m.x, z: m.z, name: m.label || 'Objective', done: false, tracked: m.tracked });
      }
    } catch { /* progression may be mid-refresh */ }

    // ui-04: only what Focus has TAGGED, never a live radar of the roster
    const tags = ctx.focus?.tags;
    if (tags && typeof tags.forEach === 'function') {
      tags.forEach((_v, m) => {
        const mm = m?.position ? m : _v;
        if (mm?.position && mm.alive !== false) {
          out.push({ kind: 'machine', x: mm.position.x, z: mm.position.z, name: (mm.displayName || mm.kind || 'machine'), done: false });
        }
      });
    }
    return out;
  }

  /** The markers a player has actually earned the right to see. */
  visibleMarkers() {
    return this.markers().filter((m) =>
      m.kind === 'quest' || m.kind === 'machine' || this.fog.seenAt(m.x, m.z));
  }

  /* ---------------------------------------------------------------- paint */

  draw() {
    const g = this.canvas?.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, MAP_PX, MAP_PX);

    // 1 — relief (or a placeholder while the bake streams in)
    if (this.bake.rows > 0) {
      g.drawImage(this.bake.canvas, 0, 0, MAP_PX, MAP_PX);
    }
    if (!this.bake.ready) {
      g.fillStyle = 'rgba(10,14,18,0.55)';
      g.fillRect(0, MAP_PX * (this.bake.rows / BAKE_N), MAP_PX, MAP_PX);
    }

    // 2 — fog
    this.fog.paint(g, MAP_PX);

    // 3 — play radius + grid
    const c = MAP_PX / 2;
    const rr = (PLAY_RADIUS / WORLD_SIZE) * MAP_PX;
    g.save();
    g.strokeStyle = 'rgba(239,230,213,0.16)';
    g.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      const p = (i / 8) * MAP_PX;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, MAP_PX); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(MAP_PX, p); g.stroke();
    }
    g.strokeStyle = 'rgba(218,119,86,0.55)';
    g.setLineDash([7, 7]);
    g.lineWidth = 2;
    g.beginPath(); g.arc(c, c, rr, 0, Math.PI * 2); g.stroke();
    g.restore();

    /**
     * 4-6 — sites, quests, tagged machines.
     *
     * A marker under the fog is NOT drawn (`ui-02`: fog of war that leaks every
     * site on the first open is decoration, not exploration). Two exceptions,
     * both deliberate: a tracked objective is the game telling you where to go,
     * and a machine you personally tagged through the Focus is knowledge you
     * already have — neither is the map giving away the valley.
     */
    const marks = this.visibleMarkers();
    for (const m of marks) this._drawMarker(g, m);

    // 7 — player
    const p = this.ctx.player;
    if (p) {
      const pt = this.worldToMap(p.position.x, p.position.z);
      const yaw = p.camYaw ?? 0;
      g.save();
      g.translate(pt.x, pt.y);
      // world +Z maps to screen +Y; the chase camera looks along -forward
      g.rotate(-yaw + Math.PI);
      g.fillStyle = '#efe6d5';
      g.strokeStyle = 'rgba(10,14,18,0.85)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, -11); g.lineTo(7.5, 8); g.lineTo(0, 4); g.lineTo(-7.5, 8);
      g.closePath(); g.fill(); g.stroke();
      g.restore();
      g.save();
      g.strokeStyle = 'rgba(239,230,213,0.30)';
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(pt.x, pt.y, 15, 0, Math.PI * 2); g.stroke();
      g.restore();
    }

    // 8 — waypoint
    if (this.waypoint) {
      const w = this.worldToMap(this.waypoint.x, this.waypoint.z);
      g.save();
      g.strokeStyle = '#59c1c6';
      g.fillStyle = 'rgba(89,193,198,0.22)';
      g.lineWidth = 2.5;
      g.beginPath(); g.arc(w.x, w.y, 10, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(w.x, w.y - 18); g.lineTo(w.x, w.y - 6); g.stroke();
      g.beginPath(); g.moveTo(w.x, w.y + 6); g.lineTo(w.x, w.y + 18); g.stroke();
      g.beginPath(); g.moveTo(w.x - 18, w.y); g.lineTo(w.x - 6, w.y); g.stroke();
      g.beginPath(); g.moveTo(w.x + 6, w.y); g.lineTo(w.x + 18, w.y); g.stroke();
      g.restore();
    }

    // hover ring
    if (this._hover) {
      g.save();
      g.strokeStyle = 'rgba(242,194,48,0.85)';
      g.lineWidth = 2;
      const h = this.worldToMap(this._hover.x, this._hover.z);
      g.beginPath(); g.arc(h.x, h.y, 13, 0, Math.PI * 2); g.stroke();
      g.restore();
    }

    this._paintSide(marks);
  }

  _drawMarker(g, m) {
    const glyph = GLYPHS[m.kind] || GLYPHS.landmark;
    const pt = this.worldToMap(m.x, m.z);
    g.save();
    g.font = `${m.kind === 'quest' ? 20 : 17}px "Rajdhani", system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(8,12,16,0.9)';
    g.strokeText(glyph.icon, pt.x, pt.y);
    g.fillStyle = m.done ? 'rgba(239,230,213,0.35)' : glyph.color;
    g.fillText(glyph.icon, pt.x, pt.y);
    if (m.tracked) {
      g.strokeStyle = '#f2c230';
      g.lineWidth = 2;
      g.beginPath(); g.arc(pt.x, pt.y, 14, 0, Math.PI * 2); g.stroke();
    }
    g.restore();
  }

  _paintSide(marks) {
    if (!this._stats) return;
    const p = this.ctx.player;
    const pos = p ? `${p.position.x.toFixed(0)}, ${p.position.z.toFixed(0)}` : '—';
    const disc = this.ctx.progression?.discoveries?.()?.length ?? 0;
    this._stats.innerHTML =
      `<div><b>${Math.round(this.fog.fraction * 100)}%</b><span>EXPLORED</span></div>` +
      `<div><b>${marks.filter((m) => m.kind !== 'machine' && m.kind !== 'quest').length}</b><span>SITES FOUND</span></div>` +
      `<div><b>${disc}</b><span>DISCOVERED</span></div>` +
      `<div><b>${pos}</b><span>POSITION</span></div>`;
    this._paintWaypointBox();
  }

  _paintWaypointBox() {
    if (!this._wpBox) return;
    const sel = this._selected;
    const gate = sel ? this.canFastTravel(sel) : null;
    const travel = sel
      ? `<div class="mn-map-wp-site"><b>${String(sel.name).toUpperCase()}</b></div>`
        + `<button class="mn-btn small${gate.ok ? ' primary' : ' off'}" id="mn-wp-travel"`
        + `${gate.ok ? '' : ' disabled'}>${gate.ok ? 'FAST TRAVEL' : gate.reason}</button>`
      : '';
    if (!this.waypoint) {
      this._wpBox.innerHTML = `<div class="mn-map-wp-empty">NO WAYPOINT</div>${travel}`;
    } else {
      const d = this.distanceToWaypoint();
      this._wpBox.innerHTML =
        `<div class="mn-map-wp-live"><span class="mn-map-wp-dot"></span>` +
        `<b>WAYPOINT</b><i>${d == null ? '—' : `${Math.round(d)} m`}</i></div>` +
        `${travel}` +
        `<button class="mn-btn small" id="mn-wp-clear">CLEAR WAYPOINT</button>`;
      this._wpBox.querySelector('#mn-wp-clear')?.addEventListener('click', () => this.clearWaypoint());
    }
    this._wpBox.querySelector('#mn-wp-travel')?.addEventListener('click', () => this.fastTravel());
  }

  /* ------------------------------------------------------------ interaction */

  _nearestMarker(world, tolerance = 16) {
    let best = null, bestD = Infinity;
    // only what is on screen can be picked: an invisible marker under the fog
    // must not steal a click meant for the ground beneath it
    for (const m of this.visibleMarkers()) {
      const d = Math.hypot(m.x - world.x, m.z - world.z);
      if (d < bestD) { bestD = d; best = m; }
    }
    const tolWorld = (tolerance / MAP_PX) * WORLD_SIZE;
    return bestD <= tolWorld ? best : null;
  }

  _onHover(e) {
    const { px, py } = this._eventToMap(e);
    const world = this.mapToWorld(px, py);
    const near = this._nearestMarker(world);
    this._hover = near;
    if (near) {
      const r = this.canvas.getBoundingClientRect();
      const sx = (this.worldToMap(near.x, near.z).x / MAP_PX) * r.width;
      const sy = (this.worldToMap(near.x, near.z).y / MAP_PX) * r.height;
      this._tip.style.display = 'block';
      this._tip.style.left = `${sx}px`;
      this._tip.style.top = `${sy}px`;
      const dist = this.ctx.player
        ? Math.hypot(near.x - this.ctx.player.position.x, near.z - this.ctx.player.position.z) : null;
      this._tip.innerHTML = `<b>${String(near.name).toUpperCase()}</b>` +
        (dist != null ? `<i>${Math.round(dist)} m</i>` : '') +
        (near.done ? '<u>VISITED</u>' : '');
    } else {
      this._tip.style.display = 'none';
    }
    this.draw();
  }

  _onClick(e) {
    const { px, py } = this._eventToMap(e);
    const world = this.mapToWorld(px, py);
    const near = this._nearestMarker(world);
    const target = near || world;
    this._selected = near && TRAVELABLE.has(near.kind) ? near : null;
    this.setWaypoint(target.x, target.z, near ? String(near.name) : 'Waypoint');
  }

  /* ----------------------------------------------------------- fast travel */

  /**
   * `missing-systems-title-save-campfire-flow`, travel half. HZD's rule is the
   * one worth copying: travel is FREE from a campfire and otherwise costs a
   * pack. There is no pack item in this build and `items` owns the pockets, so
   * this ships the free half honestly — from a campfire, to somewhere you have
   * actually been, when nothing is hunting you — and says which of those three
   * is missing rather than greying out a button with no reason.
   */
  canFastTravel(site = this._selected) {
    if (!site) return { ok: false, reason: 'SELECT A DISCOVERED SITE' };
    if (!TRAVELABLE.has(site.kind)) return { ok: false, reason: 'NOT A TRAVEL POINT' };
    if (!this.fog.seenAt(site.x, site.z)) return { ok: false, reason: 'UNDISCOVERED — WALK THERE FIRST' };
    const p = this.ctx.player;
    if (!p) return { ok: false, reason: 'NO PLAYER' };
    const fire = this.ctx.camp?.firePosition;
    const dFire = fire ? Math.hypot(p.position.x - fire.x, p.position.z - fire.z) : Infinity;
    if (dFire > CAMPFIRE_R) return { ok: false, reason: 'REST AT A CAMPFIRE TO TRAVEL' };
    if (Math.hypot(site.x - p.position.x, site.z - p.position.z) < 25) {
      return { ok: false, reason: 'ALREADY HERE' };
    }
    const hunted = (this.ctx.machines?.list || []).some((m) => m.alive !== false
      && (m.state === 'alert' || m.state === 'attack')
      && Math.hypot(m.position.x - p.position.x, m.position.z - p.position.z) < 60);
    if (hunted) return { ok: false, reason: 'NOT WHILE THE MACHINES ARE AWAKE' };
    return { ok: true, reason: 'TRAVEL' };
  }

  fastTravel(site = this._selected) {
    const gate = this.canFastTravel(site);
    if (!gate.ok) return gate;
    const p = this.ctx.player;
    const from = { x: p.position.x, z: p.position.z };
    p.position.set(site.x, p.position.y, site.z);
    p.velocity?.set?.(0, 0, 0);
    p._snapToGround?.();
    this.fog.reveal(site.x, site.z);
    this._travels++;
    this.menus?._emit?.('fast-travel', { from, to: { x: site.x, z: site.z }, site: site.name });
    // an autosave on arrival, through the owning lane's published writer
    try { this.ctx.progression?.checkpoint?.('fast-travel'); } catch { /* no save lane */ }
    this.menus?.closeHub?.();
    return { ok: true, to: site.name };
  }

  /* -------------------------------------------------------------- waypoint */

  setWaypoint(x, z, label = 'Waypoint') {
    const y = this.ctx.terrain?.getHeight?.(x, z) ?? 0;
    this.waypoint = { x, y, z, label };
    this.menus?._emit?.('waypoint-set', { x, y, z, label, distance: this.distanceToWaypoint() });
    this.menus?._emit?.('ui-confirm', { source: 'map' });
    this.ctx.hud?.setWaypoint?.(this.waypoint);
    this.draw();
    return this.waypoint;
  }

  clearWaypoint() {
    if (!this.waypoint) return;
    this.waypoint = null;
    this.menus?._emit?.('waypoint-cleared', {});
    this.ctx.hud?.setWaypoint?.(null);
    this.draw();
  }

  distanceToWaypoint() {
    const p = this.ctx.player;
    if (!p || !this.waypoint) return null;
    return Math.hypot(this.waypoint.x - p.position.x, this.waypoint.z - p.position.z);
  }

  bearingToWaypoint() {
    const p = this.ctx.player;
    if (!p || !this.waypoint) return null;
    return Math.atan2(this.waypoint.x - p.position.x, this.waypoint.z - p.position.z);
  }

  audit() {
    return {
      baked: this.bake.ready,
      bakeRows: this.bake.rows,
      fogFraction: +this.fog.fraction.toFixed(3),
      markers: this.markers().length,
      waypoint: this.waypoint ? { ...this.waypoint, distance: this.distanceToWaypoint() } : null,
      selected: this._selected ? { kind: this._selected.kind, name: this._selected.name } : null,
      travel: this._selected ? this.canFastTravel(this._selected) : null,
      travels: this._travels,
      canvas: this.canvas ? { w: this.canvas.width, h: this.canvas.height, onScreen: !!this.canvas.offsetParent } : null,
    };
  }
}

/* ========================================================================= */
/* waypoint beacon — the compass half of ui-02                               */
/* ========================================================================= */

/**
 * The audit's A70 asks for a waypoint "that appears on the compass with metres".
 * The compass ribbon belongs to `shell-hud`; this beacon is the shell-menus side
 * of the contract and it is deliberately self-retiring:
 *
 *   · if `ctx.hud.setWaypoint` exists, that lane renders it and this draws nothing;
 *   · otherwise it docks itself to the live `.hzc-compass` element (measured, not
 *     hard-coded) and draws the caret at the waypoint's bearing inside the same
 *     ±70° window the ribbon uses, with the distance in metres under it.
 *
 * It runs on rAF, not on `update()`, because the world is frozen while the hub
 * is open and the beacon still has to track the player after it closes.
 */
export class WaypointBeacon {
  constructor(ctx, map) {
    this.ctx = ctx;
    this.map = map;
    this.root = el('div', 'mn-wp-beacon', document.body);
    this.root.innerHTML =
      '<div class="mn-wp-caret"></div>' +
      '<div class="mn-wp-body"><span class="mn-wp-label">WAYPOINT</span>' +
      '<span class="mn-wp-dist">0 m</span></div>';
    this.caret = this.root.querySelector('.mn-wp-caret');
    this.labelEl = this.root.querySelector('.mn-wp-label');
    this.distEl = this.root.querySelector('.mn-wp-dist');
    this.visible = false;
    this._rectT = 0;
    this._rect = null;
  }

  get delegated() { return typeof this.ctx.hud?.setWaypoint === 'function'; }

  update(now) {
    const wp = this.map.waypoint;
    const show = !!wp && !this.delegated
      && (this.ctx.state === 'playing' || this.ctx.state === 'dead');
    if (show !== this.visible) {
      this.visible = show;
      this.root.classList.toggle('show', show);
    }
    if (!show) return;

    // dock under the compass ribbon if one exists (re-measured at 2 Hz)
    if (now - this._rectT > 500) {
      this._rectT = now;
      const comp = document.querySelector('.hzc-compass');
      this._rect = comp ? comp.getBoundingClientRect() : null;
    }
    /**
     * Dock, but only WRITE when something moved. This runs on rAF for as long
     * as a waypoint exists, and the three template strings below were being
     * rebuilt 60×/s to set the same three pixel values — 180 throwaway strings
     * a second, plus three style recalcs, for a box that moves when the window
     * resizes. Same for the distance readout, which only changes once a metre.
     */
    const wantL = this._rect && this._rect.width > 40 ? `${this._rect.left + this._rect.width / 2}px` : '50%';
    const wantT = this._rect && this._rect.width > 40 ? `${this._rect.bottom + 6}px` : '78px';
    const wantW = this._rect && this._rect.width > 40 ? `${this._rect.width}px` : '480px';
    if (wantL !== this._dockL) { this.root.style.left = wantL; this._dockL = wantL; }
    if (wantT !== this._dockT) { this.root.style.top = wantT; this._dockT = wantT; }
    if (wantW !== this._dockW) { this.root.style.width = wantW; this._dockW = wantW; }

    const p = this.ctx.player;
    const bearing = this.map.bearingToWaypoint();
    const dist = this.map.distanceToWaypoint();
    if (bearing == null || dist == null || !p) return;
    // camYaw is the chase camera's heading; the ribbon shows ±70° of it
    let rel = bearing - (p.camYaw + Math.PI);
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    const halfWin = (70 * Math.PI) / 180;
    const k = clamp(rel / halfWin, -1, 1);
    const tx = `translateX(${(k * 50).toFixed(2)}%)`;
    if (tx !== this._caretTx) { this.caret.style.transform = tx; this._caretTx = tx; }
    this.caret.classList.toggle('edge', Math.abs(rel) > halfWin);
    const metres = Math.round(dist);
    if (metres !== this._metres) { this._metres = metres; this.distEl.textContent = `${metres} m`; }
    const label = String(this.map.waypoint.label || 'WAYPOINT').toUpperCase();
    if (label !== this._label) { this._label = label; this.labelEl.textContent = label; }
  }

  audit() {
    const style = this.visible ? getComputedStyle(this.root) : null;
    return {
      delegated: this.delegated,
      visible: this.visible,
      text: this.distEl?.textContent ?? null,
      opacity: style ? +style.opacity : 0,
      rect: this.visible ? this.root.getBoundingClientRect().toJSON() : null,
    };
  }

  dispose() { this.root?.remove(); }
}
