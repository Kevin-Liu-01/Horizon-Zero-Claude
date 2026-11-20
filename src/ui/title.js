import './title.css';
import TEXT from '../game/text/ui/title.json';
import BOOKS from '../game/text/books/field-books.json';
import QUEST from '../game/text/quests/rakers-morning.json';
import { REST } from '../world/island/sites.js';
import { BUILDINGS, placeOf } from '../world/settlements/saltrow-layout.js';

/**
 * THE TITLE, NEW GAME AND THE LOADING SHEET (M1.6h; BIBLE §18 "Title · New Game · Loading").
 *
 * Title: key art at 18:40, golden, not a panel. Our wordmark top-left (the plumb-line I over the datum
 * rule; no star, no affiliation line), the one tagline line THE ISLAND REMEMBERS left-aligned under the
 * rule in IBM Plex Mono with no flanking rules, five stations in a left column on a soft scrim
 * (CONTINUE · NEW GAME · SETTINGS · EXTRAS · QUIT), and Brea three-quarters from behind at the right
 * with the sea stacks and the Sounding Ring behind her.
 *
 * The shot is SOLVED, not searched (the old framing chooser cost about 250 ms in one frame per visit):
 * Brea stands at her station facing the Ring's side of the sky; the lens is placed so her body lands at
 * `heroX` of the screen width and the Ring at `ringX`, `dist` metres from her, `height` metres over her
 * feet, tilted `pitchDeg` up. Three fixed-point passes, no ray casts, no allocation per frame.
 *
 * The press beat and the dolly keep the contract `A70c-title-flow` grades: the camera stands `startExtra`
 * metres further out (and `startRise` higher) until a key is pressed, then closes on her over DOLLY_S on a
 * smoothstep keyed to the press; the stations arrive 1.1 s after it. `info` carries the authored ease and
 * radius (camera to Brea, horizontal) for the audit. Saltrow stands behind the cistern (settlements, after
 * this shot was first solved): the dolly's start is CHOSEN clear of it, among a few bearings and rises around
 * the lens's own line, by a fan of rays across the start lens against the town's footprints (`_clearStart`):
 * at 273e302 the start stood 7 m from a house wall, which filled the left third of the press frame.
 *
 * Light: the low sun is behind her in this shot, so she read flat and dark from behind. While the title
 * stands it borrows the environment's pooled impact light (`borrowLight`: the light count never changes, so
 * nothing recompiles) and sets it as a warm low-sun rim ahead of her face, over her leading shoulder.
 *
 * The title holds the world clock at TITLE_HOUR and hands back the hour and the clock it found when it is
 * left (`leave()`). The hour is set while the clock still runs, so the sky's light probe catches up on its
 * own round robin (one face a frame) instead of a full re-bake in one frame.
 *
 * Loading: a dark map sheet with one triangle being ruled in (its three sides draw with the boot's
 * progress) and one Field Book line. main.js compiles every program, uploads every texture and every
 * geometry behind it (engine.warmUp), unchanged; the sheet is built here at module load, before boot runs.
 */

export const TITLE_HOUR = 18 + 40 / 60;
export const DOLLY_S = 2.2;
export const MENU_AT_S = 1.1;
/** The shot. Screen x is 0 at the left edge and 1 at the right. */
export const FRAME = Object.freeze({
  dist: 2.7,         // m, lens to Brea (horizontal) at rest
  height: 1.1,       // m, lens over her feet
  pitchDeg: 9,       // up
  fov: 40,           // vertical, deg
  heroX: 0.64,       // her body on screen
  ringX: 0.84,       // the Ring on screen (whole, over her far shoulder; 0.86 cut it at the frame's edge)
  turnDeg: 80,       // she faces this far left of the lens's line: her cheek and profile edge show and the stowed
                     // bow stands behind her head (at 52 its stave ran through it); tuned on the fix-1 sweep at d8b05a4
  startExtra: 9,     // m further out before the press (the least tried; `_clearStart` may stand further out)
  startRise: 2.4,    // m higher before the press (the least rise tried; `_clearStart` may climb)
  rim: 12,           // the warm rim light's intensity (cd), 0 = off
});
/** The rim's colour: low sun through calima, warmer than the lamps' calm bone-gold. */
const RIM_COLOR = 0xFFC27A;
/** Dolly starts tried, in order: bearings off the lens's line (deg, + turns toward the lens's right) and rises (m). */
const START_TURNS = [0, 15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90];
const START_RISES = [0, 2, 4, 6];
/** How far out the start stands (m, horizontal; A70c wants > 6 m of radius drop and > 8 m of travel). */
const START_EXTRAS = [9, 12, 15, 18, 21];
/**
 * A start is clear when no wall the lens sees stands nearer than this (m) inside its view. Around the cistern every
 * bearing 9 m out stands inside or against a house (at 6baf73f's layout the clearest low start saw a wall at 4 m),
 * so the start that passes is over the roofs: an aerial start that looks down on her and levels as it closes.
 */
const START_CLEAR = 14;


const D2R = Math.PI / 180;
const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));
const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const TITLE_TEXT = TEXT;

/** A 2D ray (origin x, z; unit direction dx, dz) against a box { x, z, c, s, hw, hd }: the entry distance, or null. */
function rayBox(B, x, z, dx, dz) {
  // into the box's frame: local x along (c, -s), local z along (s, c)
  const ox = (x - B.x) * B.c - (z - B.z) * B.s, oz = (x - B.x) * B.s + (z - B.z) * B.c;
  const vx = dx * B.c - dz * B.s, vz = dx * B.s + dz * B.c;
  let t0 = 0, t1 = 40;
  for (const [o, v, h] of [[ox, vx, B.hw], [oz, vz, B.hd]]) {
    if (Math.abs(v) < 1e-9) { if (o < -h || o > h) return null; continue; }
    let a = (-h - o) / v, b = (h - o) / v;
    if (a > b) { const t = a; a = b; b = t; }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return null;
  }
  return t0;
}

/* =========================================================================================== */
/* the shot                                                                                    */
/* =========================================================================================== */

export class TitleStage {
  constructor(ctx) {
    this.ctx = ctx;
    this.frame = { ...FRAME };
    this.station = null;      // { x, z } her feet; null = REST
    this.solved = null;       // { yaw, cx, cz, cy, hx, hz, hy, heading, ring }
    this.info = { since: 0, ease: 0, radius: 0, camY: 0, pitchDeg: 0 };
    this._clockHeld = null;
    this._hourHeld = null;
    this._fovHeld = null;
    this._rest = false;
    this._camHeld = null;
    this._rim = null;
  }

  /** Where the Ring stands (the place contract's `ring`, else its site). */
  _ring() {
    const r = this.ctx.props?.gatePlaces?.ring;
    if (r && Number.isFinite(r.x)) return r;
    return { x: REST.x - 60, z: REST.z + 60 };
  }

  /** Solve the lens for the current frame parameters. Pure arithmetic. */
  solve() {
    const ctx = this.ctx, F = this.frame;
    const st = this.station || REST;
    const T = ctx.terrain;
    const gy = (x, z) => (T?.getHeight ? T.getHeight(x, z) : 0);
    const hx = st.x, hz = st.z, hy = gy(hx, hz);
    const ring = this._ring();
    const cam = ctx.camera;
    const aspect = cam?.aspect || 16 / 9;
    const tv = Math.tan((F.fov * D2R) / 2), th = tv * aspect;
    // screen x (0..1) -> NDC (-1..1) -> the tangent off the lens axis, to the right
    const kb = (F.heroX * 2 - 1) * th, kr = (F.ringX * 2 - 1) * th;
    // depth along the axis that puts her `dist` m (horizontal) from the lens at tangent kb
    const db = F.dist / Math.sqrt(1 + kb * kb);
    let cx = hx, cz = hz, yaw = 0;
    for (let i = 0; i < 4; i++) {
      // az(v) = atan2(-vx, -vz) is the yaw whose forward is v; a point at tangent k to the right is at yaw - atan(k)
      yaw = Math.atan2(-(ring.x - cx), -(ring.z - cz)) + Math.atan(kr);
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      cx = hx - db * (fx + kb * rx);
      cz = hz - db * (fz + kb * rz);
    }
    // she faces the lens's forward turned turnDeg to the screen's left
    const fwdYaw = yaw + F.turnDeg * D2R;
    const vx = -Math.sin(fwdYaw), vz = -Math.cos(fwdYaw);
    const heading = Math.atan2(vx, vz);
    const ringD = Math.hypot(ring.x - hx, ring.z - hz);
    this.solved = { yaw, cx, cz, cy: hy + F.height, hx, hz, hy, heading, ring: { x: ring.x, z: ring.z, dist: +ringD.toFixed(1) },
      // the start of the dolly: further out along her line to the lens (turned clear of the town), and higher
      ux: (cx - hx) / F.dist, uz: (cz - hz) / F.dist, extra: F.startExtra, rise: F.startRise, yaw0: yaw, pitch0: F.pitchDeg - 3, start: null };
    this._clearStart(this.solved, gy, tv * aspect);
    return this.solved;
  }

  /**
   * Choose the dolly's start: the first bearing and rise (START_TURNS x START_RISES) whose lens sees no wall nearer
   * than START_CLEAR inside its view, and whose path in to the rest lens crosses no building; else the clearest
   * one. Pure arithmetic over Saltrow's footprints (saltrow-layout.js), once per solve.
   */
  _clearStart(S, gy, th) {
    const F = this.frame;
    const boxes = this._townBoxes(gy, S.hx, S.hz);
    let px = S.uz, pz = -S.ux;
    if (px * Math.cos(S.yaw) - pz * Math.sin(S.yaw) < 0) { px = -px; pz = -pz; }
    let best = null;
    for (const extra of START_EXTRAS) {
      for (const rise of START_RISES) {
        for (const deg of START_TURNS) {
          // turn u about +y toward the lens's right by `deg`: u' = u cos a + p sin a (p: u's horizontal perpendicular on the right's side)
          const a = deg * D2R, c = Math.cos(a), s = Math.sin(a);
          const ux = S.ux * c + px * s, uz = S.uz * c + pz * s;
          const sx = S.cx + ux * extra, sz = S.cz + uz * extra;
          const sy = Math.max(S.cy + F.startRise + rise, gy(sx, sz) + 0.9);
          // the start lens looks at her (its yaw and pitch ease to the rest lens's over the dolly)
          const yaw0 = Math.atan2(-(S.hx - sx), -(S.hz - sz));
          const pitch0 = this._pitchAt(S, sx, sy, sz);
          const see = this._fan(boxes, sx, sy, sz, yaw0, pitch0, th);
          const path = this._pathClear(boxes, sx, sy, sz, S.cx, S.cy, S.cz);
          const score = path ? see : Math.min(see, 1);
          const cand = { ux, uz, extra, rise: F.startRise + rise, deg, yaw0, pitch0, see, path, score };
          if (!best || score > best.score + 1e-6) best = cand;
          if (score >= START_CLEAR) { this._takeStart(S, cand, boxes.length, false); return; }
        }
      }
    }
    this._takeStart(S, best, boxes.length, true);
  }

  _takeStart(S, c, n, short) {
    S.ux = c.ux; S.uz = c.uz; S.extra = c.extra; S.rise = c.rise; S.yaw0 = c.yaw0; S.pitch0 = c.pitch0;
    S.start = { deg: c.deg, extra: c.extra, rise: +c.rise.toFixed(2), see: +c.see.toFixed(2), path: c.path, boxes: n, pitch: +c.pitch0.toFixed(1), yaw0: +c.yaw0.toFixed(3), ...(short ? { short: true } : {}) };
  }

  /** A lens's pitch (deg) that puts her chest 7 deg under the middle of its frame. */
  _pitchAt(S, x, y, z) {
    const down = Math.atan2(y - (S.hy + 1.15), Math.hypot(x - S.hx, z - S.hz)) / D2R;
    return Math.min(this.frame.pitchDeg, -down + 7);
  }

  /** Saltrow's footprints within 60 m of her, as 2D boxes with their roof height (m, world). */
  _townBoxes(gy, hx, hz) {
    const out = [];
    for (const b of BUILDINGS) {
      const p = placeOf(b);
      if (Math.hypot(p.x - hx, p.z - hz) > 60) continue;
      const top = gy(p.x, p.z) + (b.h ?? 4) + (b.step?.h ?? 0);
      // local +z (the front) is (sin yaw, cos yaw) in the world; local +x is (cos yaw, -sin yaw)
      out.push({ x: p.x, z: p.z, c: Math.cos(p.yaw), s: Math.sin(p.yaw), hw: p.w / 2 + 0.4, hd: p.d / 2 + 0.4, top });
    }
    return out;
  }

  /**
   * The nearest wall a fan of 15 rays across the lens's view meets (m; 40 = none). A building counts when any of it
   * stands above the frame's bottom edge at that distance (a roof under a lens that looks down still fills the frame).
   */
  _fan(boxes, x, y, z, yaw, pitchDeg, th) {
    const half = Math.atan(th) + 4 * D2R;
    const lowTan = Math.tan((pitchDeg - this.frame.fov / 2) * D2R);
    let near = 40;
    for (let i = 0; i < 15; i++) {
      const phi = -half + (2 * half * i) / 14;          // + is to the lens's right
      const a = yaw - phi;
      const dx = -Math.sin(a), dz = -Math.cos(a);
      for (const B of boxes) {
        const t = rayBox(B, x, z, dx, dz);
        if (t == null || t >= near) continue;
        if (B.top > y + t * lowTan) near = t;
      }
    }
    return near;
  }

  /** Whether the straight path from the start lens to the rest lens stays out of every building under its height. */
  _pathClear(boxes, x0, y0, z0, x1, y1, z1) {
    for (let k = 0; k <= 12; k++) {
      const f = k / 12, x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f, z = z0 + (z1 - z0) * f;
      for (const B of boxes) {
        if (B.top < y - 0.3) continue;
        const lx = (x - B.x) * B.c - (z - B.z) * B.s, lz = (x - B.x) * B.s + (z - B.z) * B.c;
        if (Math.abs(lx) < B.hw + 0.4 && Math.abs(lz) < B.hd + 0.4) return false;
      }
    }
    return true;
  }

  /** Enter the title: her on her station, the hour and the clock borrowed, the lens solved. */
  begin({ station = null } = {}) {
    const ctx = this.ctx, env = ctx.environment, p = ctx.player;
    this.station = station;
    const st = station || REST;
    if (p) {
      p.position.set(st.x, p.position.y, st.z);
      p._snapToGround?.();
      p.velocity?.set?.(0, 0, 0);
      if ('moveSpeed' in p) p.moveSpeed = 0;
    }
    if (env && this._clockHeld == null) {
      this._clockHeld = !!env.timeFrozen;
      this._hourHeld = env.time;
      // the hour first, while the clock still runs: the light probe follows on its round robin
      env.timeFrozen = false;
      if (Math.abs(env.time - TITLE_HOUR) > 1e-3) env.setTime(TITLE_HOUR);
      env.timeFrozen = true;
    }
    const cam = ctx.camera;
    if (cam && this._fovHeld == null) this._fovHeld = cam.fov;
    // her chase lens stands down while the title holds the camera: its occlusion rule dissolved her
    // (the boom it solved at the cistern read as jammed), and its FOV damp fought the title's lens
    if (p && !this._camHeld) {
      this._camHeld = { own: Object.prototype.hasOwnProperty.call(p, '_updateCamera'), fn: p._updateCamera };
      p._updateCamera = function titleLens(dt, t) { this.fade = 1; this._applyFade?.(dt, t); };
    }
    this.solve();
  }

  /**
   * The lens for this frame. `since` is seconds since the press (null = not pressed). Writes the
   * camera and her facing; mutates `info` in place.
   */
  place(since) {
    const ctx = this.ctx, cam = ctx.camera, p = ctx.player;
    const S = this.solved || this.solve();
    const F = this.frame;
    const env = ctx.environment;
    // a rest still running when the title came up: the environment drives the hour until it lands,
    // and THAT hour is the one to hand back
    if (this._hourHeld != null && env) {
      if (env.resting) this._rest = true;
      else if (this._rest) { this._rest = false; this._hourHeld = env.time; env.timeFrozen = false; env.setTime(TITLE_HOUR); env.timeFrozen = true; }
    }
    const k = since == null ? 0 : clamp01(since / DOLLY_S);
    const ease = smooth(k);
    const out = (1 - ease) * (S.extra ?? F.startExtra);
    const cx = S.cx + S.ux * out, cz = S.cz + S.uz * out;
    // never under the ground on the way in (the rise behind her cistern climbs faster than the lens)
    const T = ctx.terrain;
    const floor = T?.getHeight ? T.getHeight(cx, cz) + 0.9 : -Infinity;
    const cy = Math.max(S.cy + (1 - ease) * (S.rise ?? F.startRise), floor);
    if (cam) {
      cam.position.set(cx, cy, cz);
      const pitch = (F.pitchDeg + (1 - ease) * ((S.pitch0 ?? F.pitchDeg - 3) - F.pitchDeg)) * D2R;
      // the yaw swings from the start lens's (on her) to the rest lens's by the shorter way
      let dy = S.yaw - (S.yaw0 ?? S.yaw);
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      cam.rotation.set(pitch, S.yaw - (1 - ease) * dy, 0, 'YXZ');
      if (Math.abs(cam.fov - F.fov) > 1e-3) { cam.fov = F.fov; cam.updateProjectionMatrix(); }
      cam.updateMatrixWorld();
    }
    if (p) {
      p.heading = S.heading;
      p.camYaw = S.yaw;
      if ('camPitch' in p) p.camPitch = 0;
      // off 'playing' the Player steps only her animator (player.js update), so her body is put on her mark here
      if (p.model) { p.model.position.copy(p.position); p.model.rotation.y = S.heading; }
    }
    this._placeRim(S);
    const I = this.info;
    I.since = since ?? 0; I.ease = ease;
    I.radius = Math.hypot(cx - S.hx, cz - S.hz);
    I.camY = cy; I.pitchDeg = F.pitchDeg + (1 - ease) * ((S.pitch0 ?? F.pitchDeg - 3) - F.pitchDeg);
    return I;
  }

  /**
   * The warm rim: the pooled impact light, held while the title stands (re-borrowed as its lease runs out; the
   * environment skips it while it is lent), ahead of her face and over her leading shoulder, beyond her from the lens.
   */
  _placeRim(S) {
    const env = this.ctx.environment, F = this.frame;
    if (!env?.borrowLight || !(F.rim > 0)) return;
    const l = env.borrowLight(500) || this._rim;
    if (!l) return;
    this._rim = l;
    const fx = Math.sin(S.heading), fz = Math.cos(S.heading);        // her forward (heading = atan2(vx, vz))
    const ax = -Math.sin(S.yaw), az = -Math.cos(S.yaw);              // the lens's forward: beyond her
    l.position.set(S.hx + fx * 1.15 + ax * 0.9, S.hy + 2.05, S.hz + fz * 1.15 + az * 0.9);
    l.color.setHex(RIM_COLOR);
    l.distance = 6;
    l.decay = 2;
    if (l.intensity !== F.rim) l.intensity = F.rim;
  }

  /** Hand back the clock, the hour and the lens's fov. Idempotent. */
  leave() {
    if (this._rim) { this._rim.intensity = 0; this._rim = null; }
    const env = this.ctx.environment, cam = this.ctx.camera;
    if (this._clockHeld != null && env) {
      const atTitle = Math.abs(env.time - TITLE_HOUR) < 1e-3;
      env.timeFrozen = false;
      if (this._hourHeld != null && atTitle) env.setTime(this._hourHeld);
      env.timeFrozen = this._clockHeld;
    }
    if (cam && this._fovHeld != null) { cam.fov = this._fovHeld; cam.updateProjectionMatrix(); }
    const p = this.ctx.player;
    if (p && this._camHeld) {
      if (this._camHeld.own) p._updateCamera = this._camHeld.fn;
      else delete p._updateCamera;
    }
    this._camHeld = null;
    this._clockHeld = null; this._hourHeld = null; this._fovHeld = null; this._rest = false;
  }

  audit() {
    const S = this.solved;
    return S ? { yaw: +S.yaw.toFixed(4), cam: [+S.cx.toFixed(2), +S.cy.toFixed(2), +S.cz.toFixed(2)], hero: [+S.hx.toFixed(2), +S.hy.toFixed(2), +S.hz.toFixed(2)],
      heading: +S.heading.toFixed(4), ring: S.ring, frame: { ...this.frame }, station: this.station,
      start: S.start, rim: this._rim ? { on: true, i: this._rim.intensity, at: this._rim.position.toArray().map((v) => +v.toFixed(2)) } : { on: false } } : null;
  }
}

/* =========================================================================================== */
/* the title's DOM                                                                             */
/* =========================================================================================== */

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};

/**
 * Build the title's layer inside `#title .title-inner` around the one wordmark index.html already holds.
 * Returns the nodes menu.js drives: { root, press, menu, save, tag, scrim }.
 */
export function buildTitle(host) {
  document.body.classList.add('cal-t2');
  const inner = host;
  const holder = inner.parentElement || inner;
  const scrim = el('div', 't2-scrim');
  scrim.setAttribute('aria-hidden', 'true');
  holder.insertBefore(scrim, holder.firstChild);   // under the wordmark and the stations, not over them
  const tag = el('div', 't2-tag', inner, TEXT.tagline);
  const root = el('div', 'mn-title t2-stations', inner);
  const press = el('div', 'mn-title-press', root, `<span>${TEXT.press}</span>`);
  const menu = el('nav', 'mn-title-menu', root);
  const save = el('div', 'mn-title-save', root);
  return { root, press, menu, save, tag, scrim };
}

/** The five stations (BIBLE §18), in order. `fns` maps each key to its action; CONTINUE may be disabled or absent. */
export function fillStations(menu, { canContinue, showContinue, fns, onPick }) {
  menu.innerHTML = '';
  const S = TEXT.stations;
  const items = [
    ...(showContinue ? [{ key: 'continue', label: S.continue, disabled: !canContinue }] : []),
    { key: 'newGame', label: S.newGame },
    { key: 'settings', label: S.settings },
    { key: 'extras', label: S.extras },
    { key: 'quit', label: S.quit },
  ];
  items.forEach((it, i) => {
    const b = el('button', `mn-title-item${it.disabled ? ' disabled' : ''}`, menu,
      `<span class="cal-stn" aria-hidden="true">STN ${String(i + 1).padStart(2, '0')}</span>${it.label}`);
    b.dataset.station = it.key;
    if (it.disabled) b.disabled = true;
    else b.addEventListener('click', () => { onPick?.(it.label); fns[it.key]?.(); });
  });
  return items.length;
}

/** The save line under the stations. */
export function saveLine(info, older) {
  if (info) {
    const name = info.quest === QUEST.id ? QUEST.title : (info.quest || 'Orchil');
    return fill(TEXT.save.lastEntry, { quest: String(name).toLowerCase() });
  }
  return older || TEXT.save.none;
}

/**
 * The New Game card: Tolerance (BIBLE §13, §18 "LOOSE · STANDARD · FINE · BEGIN"). `list` is
 * progression's DIFFICULTIES. BEGIN starts with the choice (STANDARD unless another is picked).
 * BEGIN also carries `mn-diff`, the class the slice-hour run clicks to start a New Game.
 */
export function fillTolerance(body, list, onBegin, initial = 'standard') {
  const T = TEXT.tolerance;
  el('div', 't2-card-lead', body, T.lead);
  let chosen = list.some((d) => d.id === initial) ? initial : (list[0]?.id ?? 'standard');
  const rows = [];
  for (const d of list) {
    const r = el('button', `mn-tol${d.id === chosen ? ' on' : ''}`, body);
    r.dataset.tol = d.id;
    el('b', null, r, T[d.id] ?? String(d.name).toUpperCase());
    el('span', null, r, fill(T.dials, { in: (d.damageIn ?? 1).toFixed(2), out: (d.damageOut ?? 1).toFixed(2), seen: (d.detection ?? 1).toFixed(2) }));
    r.addEventListener('click', () => { chosen = d.id; for (const x of rows) x.classList.toggle('on', x === r); });
    rows.push(r);
  }
  const begin = el('button', 'mn-tol-begin mn-diff', body, T.begin);
  begin.addEventListener('click', () => onBegin(chosen));
  return { rows, begin, get chosen() { return chosen; } };
}

/** EXTRAS: the Field Manual and the Credits (BIBLE §18 "Extras"). */
export function fillExtras(body, { manual, credits }) {
  const E = TEXT.extras;
  const a = el('button', 'mn-tol t2-extra', body, `<b>${E.manual}</b>`);
  a.addEventListener('click', manual);
  const b = el('button', 'mn-tol t2-extra', body, `<b>${E.credits}</b>`);
  b.addEventListener('click', credits);
}

/* =========================================================================================== */
/* the loading sheet (built at module load, before main.js boots)                               */
/* =========================================================================================== */

/** Contour rings of an island that is not quite Orchil: deterministic, a few hundred bytes. */
function contours() {
  let d = '';
  for (let k = 0; k < 7; k++) {
    const r = 120 + k * 46;
    let s = '';
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const w = 1 + 0.16 * Math.sin(a * 3 + k * 0.7) + 0.08 * Math.sin(a * 7 - k) + 0.05 * Math.cos(a * 11 + k * 1.3);
      const x = 760 + Math.cos(a) * r * w * 1.25, y = 470 + Math.sin(a) * r * w * 0.82;
      s += `${i ? 'L' : 'M'}${x.toFixed(0)} ${y.toFixed(0)}`;
    }
    d += s + 'Z';
  }
  return d;
}

export function buildLoadingSheet() {
  if (typeof document === 'undefined') return;
  const L = document.getElementById('loading');
  if (!L || L.dataset.sheet) return;
  L.dataset.sheet = '1';
  L.classList.add('t2-load');
  const sheet = el('div', 't2-sheet');
  sheet.setAttribute('aria-hidden', 'true');
  // three survey stations and the sides between them; each side draws over one third of the boot
  const A = [520, 610], B = [1010, 300], C = [1120, 700];
  const side = (p, q, i) => `<line class="t2-side t2-side-${i}" x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" pathLength="1"/>`;
  const stn = (p, n) => `<g class="t2-stn"><circle cx="${p[0]}" cy="${p[1]}" r="7"/><path d="M${p[0]} ${p[1] - 15}V${p[1] + 15}M${p[0] - 15} ${p[1]}H${p[0] + 15}"/><text x="${p[0] + 14}" y="${p[1] - 12}">T${n}</text></g>`;
  sheet.innerHTML = `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
    <defs><pattern id="t2-grid" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" fill="none" stroke="rgba(241,238,230,0.05)" stroke-width="1"/></pattern></defs>
    <rect width="1600" height="900" fill="url(#t2-grid)"/>
    <path class="t2-contours" d="${contours()}"/>
    ${side(A, B, 0)}${side(B, C, 1)}${side(C, A, 2)}
    ${stn(A, 1)}${stn(B, 2)}${stn(C, 6)}
  </svg>`;
  L.insertBefore(sheet, L.firstChild);
  const lines = (BOOKS.books || []).map((b) => b.loading).filter(Boolean);
  const inner = L.querySelector('.load-inner') || L;
  el('div', 't2-load-sheetname', inner, TEXT.loading.sheet);
  el('div', 't2-load-line', inner, lines.length ? lines[Math.floor(Math.random() * lines.length)] : '');
  // the boot's progress is written on the lockup (`--cal-load`, main.js); the sheet reads the same number
  const logo = L.querySelector('.cal-logo');
  if (logo && typeof MutationObserver !== 'undefined') {
    const mirror = () => { const v = logo.style.getPropertyValue('--cal-load'); if (v) L.style.setProperty('--t2-load', v); };
    new MutationObserver(mirror).observe(logo, { attributes: true, attributeFilter: ['style'] });
    mirror();
  }
}

/**
 * The sheet closes on warm frames, not on the boot's last line. main.js hides the sheet the moment its warm-up
 * returns and starts the frame loop; the first frames of the world still paid for what a compile cannot do ahead
 * (measured at b3c6642: a 2,075 ms first frame, then the deferred warm-up of the late Instrument kinds, 307 ms).
 * So while the sheet is up the hide is held: the sheet stays until the deferred warm-up has run (or 8 s have
 * passed) and the loop has drawn WARM_FRAMES frames in a row each under 33 ms, then it closes (12 s at most).
 */
const WARM_FRAMES = 8;
export function holdSheetForWarmFrames() {
  if (typeof document === 'undefined') return;
  const L = document.getElementById('loading');
  if (!L || L.dataset.hold) return;
  L.dataset.hold = '1';
  let releasing = false, released = false;
  const obs = new MutationObserver(() => {
    if (released || !L.classList.contains('hidden') || releasing) return;
    L.classList.remove('hidden');
    releasing = true;
    const t0 = performance.now();
    let warmed = false, run = 0, last = t0;
    window.__CTX__?.events?.on?.('warm-up-complete', () => { warmed = true; });
    const tick = (now) => {
      const d = now - last; last = now;
      run = d < 33 ? run + 1 : 0;
      const waited = now - t0;
      const ready = (warmed || waited > 8000 || !window.__CTX__?.machines) && run >= WARM_FRAMES;
      if (ready || waited > 12000) {
        released = true; obs.disconnect();
        L.dataset.closedAfterMs = String(Math.round(waited));
        L.classList.add('hidden');
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  obs.observe(L, { attributes: true, attributeFilter: ['class'] });
}

/**
 * Run `fn` behind the Loading sheet (BEGIN and CONTINUE): the sheet goes up, two frames are drawn so it is on
 * screen, `fn` runs (the New Game's resets, the save's apply, the quest's first spawns: 165 ms of script in one
 * click at 6f2f50e), and the sheet closes on WARM_FRAMES frames in a row under 33 ms (6 s at most).
 * Returns a promise of `fn`'s result. Without the sheet (`?shot`, where main.js removed it) `fn` runs at once.
 */
export function underSheet(fn) {
  const L = typeof document !== 'undefined' ? document.getElementById('loading') : null;
  if (!L) return Promise.resolve(fn());
  L.classList.remove('hidden');
  L.style.setProperty('--t2-load', '1');
  return new Promise((resolve) => {
    let n = 0;
    const lift = () => {
      if (++n < 3) { requestAnimationFrame(lift); return; }
      let out;
      try { out = fn(); } finally {
        // C5 (engine lane, the smallest change here): two frames for what the start put in the world, then the engine's
        // start warm-up (its programs linked and first used under the sheet: engine.warmStart), then the warm frames
        const E = typeof window !== 'undefined' ? window.__CTX__?.engine : null;
        const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
        const warm = E?.warmStart ? frame().then(frame).then(() => E.warmStart()).catch(() => null) : Promise.resolve(null);
        warm.then(() => {
          const t0 = performance.now();
          let run = 0, last = t0;
          const tick = (now) => {
            const d = now - last; last = now;
            run = d < 33 ? run + 1 : 0;
            if (run >= WARM_FRAMES || now - t0 > 6000) { L.classList.add('hidden'); L.dataset.closedAfterMs = String(Math.round(now - t0)); resolve(out); return; }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      }
    };
    requestAnimationFrame(lift);
  });
}

buildLoadingSheet();
holdSheetForWarmFrames();
