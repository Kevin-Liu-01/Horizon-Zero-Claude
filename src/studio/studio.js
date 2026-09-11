/**
 * PHOTO MODE — the Round 3 "Animation Studio", promoted. Lane `studio`.
 *
 * Findings closed here:
 *   missing-systems-photo-mode          poses, DoF, filters, frames, hide-Aloy
 *   player-anim-17                      takeDamage/jump/dodge filmable in studio
 *   machine-rig-19                      ONE timeScale authority (gate A79)
 *   onboarding-loop-studio-cast-buttons forceState + hold, close pause on
 *                                       enter, real dt, panel z-order (gate A78)
 *
 * F10 from playing / paused / dead / victory. While active:
 *   - Free-fly camera on REAL seconds (`interpolate(alpha, realDt)`), so the
 *     lens still moves with the world frozen at timeScale 0. Round 3 flew on a
 *     hard-coded `1/60` and drifted against every frame rate.
 *   - The studio owns ALL input (`ctx.input.enabled = false`), so Aloy never
 *     answers the fly keys.
 *   - `engine.requestTimeScale('studio', v)` is the ONLY way this file touches
 *     time. It outranks wheel / hitstop / concentration by the engine's own
 *     priority list, which is what makes a studio freeze survive live combat.
 *   - Panels sit at z-index 900: above the HUD (40), Focus (39), inventory
 *     (46), pause (50), wheel and quests (60), and above anything `shell-menus`
 *     lands at. "Hide HUD" then hides every chrome root it DISCOVERS, not the
 *     id `#hud` — core-platform's F3 stats overlay sits at 99999 and painted a
 *     frame-time readout across the photograph.
 *
 * Contract: constructed LAST in main.js. `update()` runs after Player's and
 * `interpolate()` runs after every system's, so the studio camera write and the
 * pose overlay are the last words before `engine.render()`. Everything else may
 * assume `ctx.studio` is absent (it is not built in shot mode's critical path).
 */
import * as THREE from 'three';
import './studio.css';
import { StudioPass, FILTERS, FRAMES } from './post.js';
import { PoseDirector, POSES, EXPRESSIONS, GAZES } from './pose.js';
import { CastDirector, CAST_STATES } from './cast.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/*
 * REAL-SECOND BUDGET FOR THE LENS. Two bands, because a SLOW FRAME and a STALL
 * are not the same event and must not be treated the same way.
 *
 *   0 .. MAX_REAL_DT   a slow frame. Spend it WHOLE. The valley renders at
 *                      7-20 fps on a headless box and on weak hardware, and a
 *                      photographer holding W there must still cross ground at
 *                      the true 14 m/s — not at frame-rate-dependent speed.
 *   .. STALL_REAL_DT   a very slow frame. Clamped, so it cannot lurch.
 *   > STALL_REAL_DT    not a frame at all: a backgrounded tab, a shader
 *                      compile, a breakpoint. DROPPED ENTIRELY (return 0), so
 *                      resuming does not fling the lens across the map.
 *
 * This was `clamp(real, 0, 1/20)` — a single lossy clamp that silently THREW
 * AWAY every millisecond past 50 ms. Correct against a 30 s stall, wrong every
 * frame under 20 fps: at ~8 fps the lens flew at 39% of true speed (gate A79b
 * measured 4.90 m where 12.6 m was due) and pose blending and lens
 * interpolation, which ride the same dt, crawled with it.
 */
const MAX_REAL_DT = 1 / 5;      // 0.2s — down to 5 fps, flown at true speed
const STALL_REAL_DT = 0.5;      // beyond this it is a stall, not a frame

/** Real seconds this frame may spend on the lens. See the bands above. */
const flyDt = (raw) => (raw > 0 ? (raw > STALL_REAL_DT ? 0 : Math.min(raw, MAX_REAL_DT)) : 0);

/**
 * Keys the studio owns outright while it is open — the fly set, its modifiers,
 * and the binds other lanes would otherwise answer underneath the shot (pause,
 * inventory, map, quests, Focus, the weapon wheel, the tool strip). Everything
 * NOT in here still reaches the page, so F12 and the browser's own shortcuts
 * keep working.
 */
const STUDIO_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE',
  'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'Space',
  'KeyF', 'KeyR', 'KeyI', 'KeyM', 'KeyJ', 'KeyK', 'KeyC', 'KeyV', 'KeyG', 'KeyH',
  'Tab', 'KeyP', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6',
]);

export class Studio {
  constructor(ctx) {
    this.ctx = ctx;
    this.active = false;
    this._prevState = null;
    this._deathFilm = false;

    /* ------------------------------------------------------------ camera */
    this._pos = new THREE.Vector3();
    this._yaw = 0;
    this._pitch = 0;
    this._roll = 0;
    this._fov = 55;
    this._speed = 14;
    this._keys = new Set();
    this._look = { dx: 0, dy: 0 };
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._probe = new THREE.Vector3();
    this._camDir = new THREE.Vector3();

    /* ------------------------------------------------------------- time */
    this.timeScale = 1;
    this.pinTime = false;

    /* -------------------------------------------------------------- lens */
    this.lens = {
      active: false,
      dof: false,
      focus: 8,
      autoFocus: true,
      aperture: 0.45,
      nearRange: 3.5,
      farRange: 14,
      filter: 'none',
      filterAmt: 1,
      grain: 0,
      vignette: 0,
      frameAspect: 0,
      guides: false,
    };
    /** @type {StudioPass|null} built on first enter — zero cost until then */
    this.pass = null;

    this.pose = new PoseDirector(ctx);
    this.cast = new CastDirector(ctx);

    this._interpSeen = false;
    this._lastWall = 0;
    this._readoutT = 0;

    /** Chrome roots THIS object hid, so exit restores exactly those. */
    this._hiddenChrome = [];
    this._chromeHidden = false;

    this._buildUi();

    /*
     * Own listeners — independent of `ctx.input` so the game never sees the fly
     * keys. CAPTURE PHASE, and swallowing what it handles.
     *
     * `onboarding-loop-studio-cast-buttons`: the studio is constructed LAST, so
     * on a bubble-phase `window` listener every other lane's keydown handler had
     * already run by the time this one saw the event. Esc therefore left photo
     * mode AND opened the pause menu — the photographer pressed one key and
     * landed in a frozen game with the menu painted over the shot they were
     * lining up. Window capture runs before every bubble-phase listener in the
     * document, so stopping the event here means nothing else ever sees the keys
     * the studio owns.
     */
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F10') { this._swallow(e); this.toggle(); return; }
      if (!this.active) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.code === 'Escape') { this._swallow(e); this.exit(); return; }
      this._keys.add(e.code);
      // Fly keys, modifiers and the pause/inventory/wheel/focus binds all belong
      // to the studio while it is open; anything else (F-keys, devtools) passes.
      if (STUDIO_KEYS.has(e.code)) this._swallow(e);
    }, { capture: true });
    window.addEventListener('keyup', (e) => {
      this._keys.delete(e.code);
      if (this.active && STUDIO_KEYS.has(e.code)) this._swallow(e);
    }, { capture: true });
    window.addEventListener('blur', () => this._keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.active || document.pointerLockElement !== this._canvas()) return;
      this._look.dx += e.movementX;
      this._look.dy += e.movementY;
    });
  }

  _canvas() { return this.ctx.renderer.domElement; }

  /** Consume an event outright: no other listener, in any phase, will see it. */
  _swallow(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  toggle() { if (this.active) this.exit(); else this.enter(); }

  /* ------------------------------------------------------------ lifecycle */

  /**
   * Close whatever modal is up before taking the world.
   * `onboarding-loop-studio-cast-buttons`: F10 from the pause menu used to
   * leave the pause overlay painted across the shot AND leave `_prevState` at
   * 'paused', so Esc dropped back into a frozen game.
   */
  _closeOverlays() {
    const ctx = this.ctx;
    const tries = [
      () => { if (ctx.state === 'paused') ctx.hud?.setPaused?.(false); },
      () => ctx.menu?.close?.(),          // shell-menus, when it lands
      () => ctx.wheel?.close?.(),
      () => ctx.ui?.inventory?.close?.(),
      () => ctx.quests?.close?.(),
      () => ctx.skills?.close?.(),
    ];
    for (const fn of tries) { try { fn(); } catch { /* optional lane API */ } }
    // belt and braces: any lane's modal that only knows how to hide itself
    document.getElementById('pause')?.classList.remove('show');
  }

  enter() {
    const ctx = this.ctx;
    if (this.active) return false;
    if (!['playing', 'paused', 'dead', 'victory'].includes(ctx.state)) return false;
    this._closeOverlays();
    this.active = true;
    this._prevState = ctx.state === 'paused' ? 'playing' : ctx.state;
    ctx.state = 'studio';
    ctx.input.enabled = false;
    ctx.input.keys.clear();
    this._keys.clear();
    this._look.dx = 0; this._look.dy = 0;
    this._lastWall = ctx.engine.wallTime;

    // start from the current camera pose
    this._pos.copy(ctx.camera.position);
    this._euler.setFromQuaternion(ctx.camera.quaternion, 'YXZ');
    this._yaw = this._euler.y;
    this._pitch = this._euler.x;
    this._roll = 0;
    this._fov = ctx.camera.fov;

    this._ensurePass();
    this.lens.active = true;
    this._applyTimeScale();
    this._ui.classList.remove('hidden');
    this._hint.classList.remove('hidden');
    this._canvas().addEventListener('click', this._lockFn ??= () => {
      if (this.active) this._canvas().requestPointerLock?.();
    });
    this._syncUi();
    return true;
  }

  /**
   * Leave, ALWAYS into a living world, and always into the same one.
   *
   * The world a studio session hands back must not depend on a race. Round 4's
   * first cut returned `'dead'` when a filmed death happened to still be
   * unresolved and `'playing'` when `Player._die()`'s 3.2 s **wall-clock**
   * `setTimeout` had already fired — so pressing Esc a second early dumped the
   * photographer onto the death screen, and a second late did not. Gate A78b
   * caught exactly that, twice green and once red on identical code.
   *
   * A death the studio staged is the studio's to undo, like the hidden chrome
   * and the held cast state: heal her and return where the photographer came
   * from. A death the studio only *held* (F10 pressed inside the 3.2 s window)
   * is also resolved into life here, because `_die()`'s timer early-outs on
   * `state !== 'dead'` — it fired during the shoot, found the studio holding
   * the world, and returned. That respawn is already gone; exiting completes
   * it instead of stranding her on a death screen with no timer left to run.
   * We do NOT teleport to camp the way `_die()` would: the photographer keeps
   * the frame they composed.
   */
  exit() {
    const ctx = this.ctx;
    if (!this.active) return false;
    this.active = false;
    const p = ctx.player;
    if ((this._deathFilm || this._prevState === 'dead') && p && p.health <= 0) {
      p.health = p.maxHealth;
    }
    ctx.state = this._prevState === 'dead' ? 'playing' : (this._prevState ?? 'playing');
    this._deathFilm = false;
    ctx.input.enabled = true;
    // release the time authority; combat/wheel own it again
    ctx.engine.requestTimeScale?.('studio', null);
    ctx.engine.timeScale = 1;
    ctx.camera.fov = 55;
    ctx.camera.updateProjectionMatrix();
    this.cast.release();
    this.pose.restore();
    this.lens.active = false;
    if (this.pass) this.pass.enabled = false;
    this._ui.classList.add('hidden');
    this._hint.classList.add('hidden');
    this._guides.classList.add('hidden');
    this.setChromeHidden(false);
    document.exitPointerLock?.();
    return true;
  }

  /* ---------------------------------------------------------------- chrome */

  /**
   * Every chrome root that is not the studio's own — DISCOVERED, never listed.
   *
   * Sixteen lanes each append their overlay straight to `<body>`, and one of
   * them (core-platform's F3 stats) sits at z-index 99999, far above the
   * studio's 900. A "Hide HUD" that only knew the id `#hud` therefore left a
   * frame-time readout, and anything a later lane adds, painted across the
   * photograph. Anything that is neither studio chrome, nor the element that
   * holds the renderer's canvas, nor a non-rendering tag, is game chrome —
   * including whatever lands next round.
   * @returns {Element[]}
   */
  _chromeRoots() {
    const canvas = this._canvas();
    const out = [];
    for (const el of document.body.children) {
      if (el === this._ui || el === this._guides || el === this._hint) continue;
      if (el.contains(canvas)) continue;
      const tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'TEMPLATE') continue;
      out.push(el);
    }
    return out;
  }

  /**
   * Hide (or restore) all non-studio chrome. Only elements THIS object hid are
   * ever restored, so a panel another lane had already closed stays closed.
   * @returns {boolean} the new state
   */
  setChromeHidden(on) {
    if (on && !this._chromeHidden) {
      for (const el of this._chromeRoots()) {
        if (el.classList.contains('studio-hidden')) continue;
        el.classList.add('studio-hidden');
        this._hiddenChrome.push(el);
      }
    } else if (!on) {
      for (const el of this._hiddenChrome) el.classList.remove('studio-hidden');
      this._hiddenChrome.length = 0;
    }
    this._chromeHidden = !!on;
    this._hudBtn.classList.toggle('on', this._chromeHidden);
    this._hudBtn.textContent = this._chromeHidden ? 'Show HUD' : 'Hide HUD';
    return this._chromeHidden;
  }

  /* ----------------------------------------------------------------- time */

  /**
   * THE ONLY TIME WRITE IN THIS FILE (`machine-rig-19` / gate A79).
   * `studio` is first in the engine's priority list, so a freeze here outranks
   * combat hitstop, Concentration and the weapon wheel — all of which keep
   * requesting their own scale every frame while the studio is open.
   */
  _applyTimeScale() {
    const e = this.ctx.engine;
    if (!e?.requestTimeScale) return;
    if (!this.active) { e.requestTimeScale('studio', null); return; }
    if (this.timeScale === 1 && !this.pinTime) e.requestTimeScale('studio', null);
    else e.requestTimeScale('studio', this.timeScale);
  }

  setTimeScale(v) {
    this.timeScale = clamp(Number(v) || 0, 0, 1);
    this._applyTimeScale();
    const el = this._ui.querySelector('#st-time');
    if (el) {
      el.value = String(this.timeScale);
      this._ui.querySelector('#st-time-out').value = this.timeScale.toFixed(2);
    }
    return this.ctx.engine.timeScale;
  }

  /* ----------------------------------------------------------------- frame */

  /** SIM tick: holds, and taking the world back after a filmed death. */
  update(dt) {
    if (!this.active) return;
    const ctx = this.ctx;
    this.cast.update(dt);
    /*
     * Take the world back the instant anything else claims it.
     *
     * `Player._die()` sets `ctx.state = 'dead'` and schedules a 3.2 s
     * WALL-CLOCK respawn that heals her, teleports her to CAMP_POS and sets
     * 'playing'. Waiting for that timer — which is what this used to do — meant
     * a filmed death yanked the subject across the valley three seconds into
     * the shot, and left the exit state depending on whether the timer had
     * fired yet. Reclaiming 'dead' immediately means the timer finds
     * `state !== 'dead'`, returns, and Aloy lies where she fell for as long as
     * the photographer wants her there. The death CLIP is unaffected: it runs
     * on the animator's own layer, not on `ctx.state`.
     *
     * `_deathFilm` latches so `exit()` knows to heal what the studio staged.
     */
    if (ctx.state === 'playing') { ctx.state = 'studio'; this._deathFilm = false; }
    else if (ctx.state === 'dead') { ctx.state = 'studio'; this._deathFilm = true; }
    this._applyTimeScale();
    // fallback path only: main.js always calls interpolate(), but a host that
    // does not must still fly the lens on real seconds.
    if (!this._interpSeen) {
      const wall = ctx.engine.wallTime;
      const real = flyDt(wall - this._lastWall);
      this._lastWall = wall;
      this._frame(real);
    }
  }

  /**
   * REAL dt, once per rendered frame, after every system has updated —
   * `onboarding-loop-studio-cast-buttons`. The camera write and the pose
   * overlay land here so nothing can overwrite them before `engine.render()`.
   */
  interpolate(_alpha, realDt) {
    this._interpSeen = true;
    if (!this.active) return;
    this._lastWall = this.ctx.engine.wallTime;
    this._frame(flyDt(realDt || 0));
  }

  _frame(realDt) {
    const ctx = this.ctx;
    this._fly(realDt);

    ctx.camera.position.copy(this._pos);
    this._euler.set(this._pitch, this._yaw, this._roll, 'YXZ');
    ctx.camera.quaternion.setFromEuler(this._euler);
    if (ctx.camera.fov !== this._fov) {
      ctx.camera.fov = this._fov;
      ctx.camera.updateProjectionMatrix();
    }
    ctx.camera.updateMatrixWorld(true);

    // cast target follows the lens unless locked
    ctx.camera.getWorldDirection(this._camDir);
    this.cast.retarget(ctx.camera.position, this._camDir);

    this.pose.apply(realDt);
    this._syncLens(realDt);
    this._tickReadout();
  }

  _fly(rdt) {
    const boost = (this._keys.has('ShiftLeft') || this._keys.has('ShiftRight')) ? 3.2 : 1;
    const slow = (this._keys.has('AltLeft') || this._keys.has('AltRight')) ? 0.22 : 1;
    const v = this._speed * boost * slow * rdt;
    const cp = Math.cos(this._pitch);
    this._fwd.set(-Math.sin(this._yaw) * cp, -Math.sin(this._pitch), -Math.cos(this._yaw) * cp);
    this._right.set(Math.cos(this._yaw), 0, -Math.sin(this._yaw));
    if (this._keys.has('KeyW')) this._pos.addScaledVector(this._fwd, v);
    if (this._keys.has('KeyS')) this._pos.addScaledVector(this._fwd, -v);
    if (this._keys.has('KeyD')) this._pos.addScaledVector(this._right, v);
    if (this._keys.has('KeyA')) this._pos.addScaledVector(this._right, -v);
    if (this._keys.has('KeyE')) this._pos.y += v;
    if (this._keys.has('KeyQ')) this._pos.y -= v;

    this._yaw -= this._look.dx * 0.0022;
    this._pitch -= this._look.dy * 0.0022;
    this._pitch = clamp(this._pitch, -1.45, 1.45);
    this._look.dx = 0;
    this._look.dy = 0;

    const floor = (this.ctx.terrain?.getHeight?.(this._pos.x, this._pos.z) ?? 0) + 0.3;
    if (this._pos.y < floor) this._pos.y = floor;
  }

  /* ------------------------------------------------------------------ lens */

  _ensurePass() {
    if (this.pass || !this.ctx.engine?.composer) return;
    try {
      this.pass = new StudioPass(this.ctx.engine);
      this.ctx.engine.composer.addPass(this.pass);
    } catch (err) {
      console.warn('[studio] photo pass unavailable:', err);
      this.pass = null;
    }
  }

  /**
   * Where auto-focus actually lands. A portrait focuses on the EYES, not on
   * the transform origin at the subject's feet — with a wide aperture the
   * 40 cm between her sternum and her face is the difference between a sharp
   * face and a soft one. Aloy resolves to her head bone through the animator's
   * published `b.head`; a machine resolves to half its own height.
   * @returns {boolean} whether `this._probe` now holds a world focus point
   */
  _focusPoint() {
    const subject = this.pose.hideAloy ? this.cast.target : (this.ctx.player ?? this.cast.target);
    if (!subject?.position) return false;
    const head = subject === this.ctx.player ? this.pose.animator?.b?.head?.bone : null;
    if (head) { head.getWorldPosition(this._probe); return true; }
    this._probe.copy(subject.position);
    this._probe.y += subject.height ? subject.height * 0.5 : 1.45;
    return true;
  }

  _syncLens(realDt) {
    const L = this.lens;
    if (L.dof && L.autoFocus && this._focusPoint()) {
      L.focus = clamp(this._probe.distanceTo(this.ctx.camera.position), 0.5, 400);
    }
    if (!this.pass) return;
    this.pass.sync(this.ctx.camera, {
      active: this.active && L.active,
      dof: L.dof,
      focus: L.focus,
      nearRange: L.nearRange,
      farRange: L.farRange,
      aperture: L.aperture,
      filter: L.filter,
      filterAmt: L.filterAmt,
      grain: L.grain,
      vignette: L.vignette,
      frameAspect: L.frameAspect,
    }, realDt);
  }

  /** Composition guides live in the DOM so an exported PNG stays clean. */
  _syncGuides() {
    const L = this.lens;
    const g = this._guides;
    g.classList.toggle('hidden', !L.guides || !this.active);
    if (!L.guides) return;
    const view = window.innerWidth / Math.max(1, window.innerHeight);
    let padX = 0, padY = 0;
    if (L.frameAspect > 0.01) {
      if (L.frameAspect < view) padX = (1 - L.frameAspect / view) * 50;
      else padY = (1 - view / L.frameAspect) * 50;
    }
    g.style.setProperty('--pad-x', padX + '%');
    g.style.setProperty('--pad-y', padY + '%');
  }

  /* -------------------------------------------------------------- exports */

  _exportFrame() {
    // render synchronously, then read the buffer before compositing clears it
    this.ctx.engine.render();
    const url = this._canvas().toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hzc-studio-' + Date.now() + '.png';
    a.click();
  }

  /* ------------------------------------------------------------------- API */

  /**
   * Fire one Aloy pose — the ONE entry point, so a scripted shot behaves
   * exactly like the panel button. `player-anim-17`: a pose that hands the
   * state on (a filmed death drops `ctx.state` to 'dead') latches `_deathFilm`
   * so `update()` takes the world back when the respawn timer releases it and
   * Esc still returns the photographer to where they came from.
   * @returns {{ok:boolean, detail:string, handedState?:boolean}}
   */
  playPose(id) {
    const r = this.pose.play(id);
    if (r.handedState) this._deathFilm = true;
    return r;
  }

  /** Force a state on the cast target and HOLD it. See `CastDirector`. */
  setCastState(id, opts) { return this.cast.setState(id, opts); }

  /** Published for gates and for anyone scripting a shot. */
  debug() {
    const e = this.ctx.engine;
    return {
      active: this.active,
      state: this.ctx.state,
      prevState: this._prevState,
      timeScale: this.timeScale,
      engineTimeScale: e.timeScale,
      timeSources: e.timeScaleSources?.() ?? null,
      pinTime: this.pinTime,
      lens: { ...this.lens, pass: !!this.pass, passEnabled: !!this.pass?.enabled },
      pose: this.pose.debug(),
      cast: this.cast.debug(),
      fov: this._fov,
      chromeHidden: this._chromeHidden,
      chromeRoots: this._chromeRoots().length,
    };
  }

  /* -------------------------------------------------------------------- ui */

  _buildUi() {
    const ui = document.createElement('div');
    ui.id = 'studio-ui';
    ui.className = 'hidden';
    ui.innerHTML = `
      <div class="studio-panel studio-aloy hidden" id="st-aloy-panel">
        <div class="studio-head">ALOY</div>
        <div class="studio-sub">POSE</div>
        <div class="studio-chips" id="st-poses"></div>
        <div class="studio-sub">EXPRESSION</div>
        <div class="studio-chips" id="st-expr"></div>
        <div class="studio-sub">GAZE</div>
        <div class="studio-chips" id="st-gaze"></div>
        <label class="studio-row">Yaw
          <input type="range" id="st-gaze-yaw" min="-0.95" max="0.95" step="0.01" value="0">
          <output id="st-gaze-yaw-out">0.00</output>
        </label>
        <label class="studio-row">Pitch
          <input type="range" id="st-gaze-pitch" min="-0.42" max="0.42" step="0.01" value="0">
          <output id="st-gaze-pitch-out">0.00</output>
        </label>
        <div class="studio-chips">
          <button id="st-hide-aloy">Hide Aloy</button>
        </div>
        <div class="studio-note" id="st-aloy-note"></div>
      </div>

      <div class="studio-panel studio-lens hidden" id="st-lens-panel">
        <div class="studio-head">LENS</div>
        <div class="studio-chips"><button id="st-dof">Depth of field</button><button id="st-af">Auto focus</button></div>
        <label class="studio-row">Focus
          <input type="range" id="st-focus" min="0.5" max="120" step="0.5" value="8">
          <output id="st-focus-out">8.0</output>
        </label>
        <label class="studio-row">Aperture
          <input type="range" id="st-aper" min="0" max="1" step="0.02" value="0.45">
          <output id="st-aper-out">0.45</output>
        </label>
        <label class="studio-row">Depth
          <input type="range" id="st-range" min="1" max="40" step="0.5" value="14">
          <output id="st-range-out">14.0</output>
        </label>
        <div class="studio-sub">FILTER</div>
        <div class="studio-chips" id="st-filters"></div>
        <label class="studio-row">Amount
          <input type="range" id="st-filter-amt" min="0" max="1" step="0.02" value="1">
          <output id="st-filter-amt-out">1.00</output>
        </label>
        <div class="studio-sub">FRAME</div>
        <div class="studio-chips" id="st-frames"></div>
        <div class="studio-chips"><button id="st-guides">Guides</button></div>
        <label class="studio-row">Grain
          <input type="range" id="st-grain" min="0" max="1" step="0.02" value="0">
          <output id="st-grain-out">0.00</output>
        </label>
        <label class="studio-row">Vignette
          <input type="range" id="st-vig" min="0" max="1" step="0.02" value="0">
          <output id="st-vig-out">0.00</output>
        </label>
      </div>

      <div class="studio-panel studio-cast hidden" id="st-cast-panel">
        <div class="studio-head">CAST</div>
        <div class="studio-sub">SPAWN AT VIEW</div>
        <div class="studio-chips" id="st-cast-kinds"></div>
        <div class="studio-sub">TARGET</div>
        <div class="studio-chips">
          <button id="st-cast-prev">&lsaquo;</button>
          <button id="st-cast-lock">Lock</button>
          <button id="st-cast-next">&rsaquo;</button>
        </div>
        <div class="studio-note" id="st-cast-target">&mdash;</div>
        <div class="studio-sub">STATE</div>
        <div class="studio-chips cast-states" id="st-cast-states"></div>
        <div class="studio-chips"><button id="st-cast-release">Release hold</button></div>
        <div class="studio-note" id="st-cast-note"></div>
      </div>

      <div class="studio-bar">
        <div class="studio-title">PHOTO</div>
        <label class="studio-group">Time
          <input type="range" id="st-time" min="0" max="1" step="0.05" value="1">
          <output id="st-time-out">1.00</output>
        </label>
        <button id="st-pin" title="Hold this time scale even at 1.0 (locks out hitstop / Concentration)">Pin</button>
        <label class="studio-group">FOV
          <input type="range" id="st-fov" min="14" max="95" step="1" value="55">
          <output id="st-fov-out">55</output>
        </label>
        <label class="studio-group">Roll
          <input type="range" id="st-roll" min="-0.5" max="0.5" step="0.01" value="0">
          <output id="st-roll-out">0.00</output>
        </label>
        <button id="st-aloy">Aloy</button>
        <button id="st-lens">Lens</button>
        <button id="st-cast">Cast</button>
        <button id="st-hud">Hide HUD</button>
        <button id="st-shot">Frame &rarr; PNG</button>
        <button id="st-exit">Exit (F10)</button>
      </div>`;
    document.body.appendChild(ui);
    this._ui = ui;

    const guides = document.createElement('div');
    guides.id = 'studio-guides';
    guides.className = 'hidden';
    guides.innerHTML = '<div class="g-inner"></div>';
    document.body.appendChild(guides);
    this._guides = guides;

    const hint = document.createElement('div');
    hint.id = 'studio-hint';
    hint.className = 'hidden';
    hint.textContent = 'PHOTO MODE — WASD fly · Q/E down/up · Shift boost · Alt crawl · click to look · Esc exit';
    document.body.appendChild(hint);
    this._hint = hint;

    this._wire();
  }

  _wire() {
    const ui = this._ui;
    const $ = (sel) => ui.querySelector(sel);
    const slider = (id, out, fn, fmt = (v) => v.toFixed(2)) => {
      const el = $(id), o = $(out);
      el.addEventListener('input', () => { const v = parseFloat(el.value); fn(v); o.value = fmt(v); });
    };

    /* ------- bar ------- */
    slider('#st-time', '#st-time-out', (v) => this.setTimeScale(v));
    slider('#st-fov', '#st-fov-out', (v) => { this._fov = v; }, (v) => String(v | 0));
    slider('#st-roll', '#st-roll-out', (v) => { this._roll = v; });
    this._pinBtn = $('#st-pin');
    this._pinBtn.addEventListener('click', () => {
      this.pinTime = !this.pinTime;
      this._pinBtn.classList.toggle('on', this.pinTime);
      this._applyTimeScale();
    });

    this._hudBtn = $('#st-hud');
    this._hudBtn.addEventListener('click', () => this.setChromeHidden(!this._chromeHidden));
    $('#st-shot').addEventListener('click', () => this._exportFrame());
    $('#st-exit').addEventListener('click', () => this.exit());

    const panel = (btnId, panelId, onOpen) => {
      const b = $(btnId), p = $(panelId);
      b.addEventListener('click', () => {
        const open = p.classList.toggle('hidden') === false;
        b.classList.toggle('on', open);
        if (open) onOpen?.();
      });
      return p;
    };
    this._aloyPanel = panel('#st-aloy', '#st-aloy-panel');
    this._lensPanel = panel('#st-lens', '#st-lens-panel');
    this._castPanel = panel('#st-cast', '#st-cast-panel', () => this._refreshCastKinds());

    /* ------- Aloy ------- */
    const poses = $('#st-poses');
    for (const p of POSES) {
      const b = document.createElement('button');
      b.textContent = p.label;
      b.dataset.pose = p.id;
      b.addEventListener('click', () => {
        const r = this.playPose(p.id);
        $('#st-aloy-note').textContent = r.ok ? r.detail + ' playing' : 'refused: ' + r.detail;
      });
      poses.appendChild(b);
    }
    const expr = $('#st-expr');
    for (const e of EXPRESSIONS) {
      const b = document.createElement('button');
      b.textContent = e.label;
      b.dataset.expr = e.id;
      b.addEventListener('click', () => {
        this.pose.expression = e.id;
        expr.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      });
      if (e.id === 'neutral') b.classList.add('on');
      expr.appendChild(b);
    }
    const gaze = $('#st-gaze');
    for (const g of GAZES) {
      const b = document.createElement('button');
      b.textContent = g;
      b.dataset.gaze = g;
      b.addEventListener('click', () => {
        this.pose.gaze = g;
        gaze.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      });
      if (g === 'auto') b.classList.add('on');
      gaze.appendChild(b);
    }
    slider('#st-gaze-yaw', '#st-gaze-yaw-out', (v) => { this.pose.gazeYaw = v; });
    slider('#st-gaze-pitch', '#st-gaze-pitch-out', (v) => { this.pose.gazePitch = v; });
    this._hideBtn = $('#st-hide-aloy');
    this._hideBtn.addEventListener('click', () => {
      this.pose.setHidden(!this.pose.hideAloy);
      this._hideBtn.classList.toggle('on', this.pose.hideAloy);
      this._hideBtn.textContent = this.pose.hideAloy ? 'Show Aloy' : 'Hide Aloy';
    });

    /* ------- lens ------- */
    this._dofBtn = $('#st-dof');
    this._dofBtn.addEventListener('click', () => {
      this.lens.dof = !this.lens.dof;
      this._dofBtn.classList.toggle('on', this.lens.dof);
    });
    this._afBtn = $('#st-af');
    this._afBtn.classList.add('on');
    this._afBtn.addEventListener('click', () => {
      this.lens.autoFocus = !this.lens.autoFocus;
      this._afBtn.classList.toggle('on', this.lens.autoFocus);
    });
    slider('#st-focus', '#st-focus-out', (v) => {
      this.lens.focus = v;
      this.lens.autoFocus = false;
      this._afBtn.classList.remove('on');
    }, (v) => v.toFixed(1));
    slider('#st-aper', '#st-aper-out', (v) => { this.lens.aperture = v; });
    slider('#st-range', '#st-range-out', (v) => {
      this.lens.farRange = v;
      this.lens.nearRange = Math.max(1, v * 0.25);
    }, (v) => v.toFixed(1));
    slider('#st-filter-amt', '#st-filter-amt-out', (v) => { this.lens.filterAmt = v; });
    slider('#st-grain', '#st-grain-out', (v) => { this.lens.grain = v; });
    slider('#st-vig', '#st-vig-out', (v) => { this.lens.vignette = v; });

    const filters = $('#st-filters');
    for (const f of FILTERS) {
      const b = document.createElement('button');
      b.textContent = f;
      b.dataset.filter = f;
      b.addEventListener('click', () => {
        this.lens.filter = f;
        filters.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      });
      if (f === 'none') b.classList.add('on');
      filters.appendChild(b);
    }
    const frames = $('#st-frames');
    for (const f of FRAMES) {
      const b = document.createElement('button');
      b.textContent = f.label;
      b.dataset.frame = f.id;
      b.addEventListener('click', () => {
        this.lens.frameAspect = f.aspect;
        frames.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        this._syncGuides();
      });
      if (f.aspect === 0) b.classList.add('on');
      frames.appendChild(b);
    }
    this._guideBtn = $('#st-guides');
    this._guideBtn.addEventListener('click', () => {
      this.lens.guides = !this.lens.guides;
      this._guideBtn.classList.toggle('on', this.lens.guides);
      this._syncGuides();
    });

    /* ------- cast ------- */
    const states = $('#st-cast-states');
    for (const s of CAST_STATES) {
      const b = document.createElement('button');
      b.textContent = s.label;
      b.dataset.state = s.id;
      b.addEventListener('click', () => {
        const r = this.cast.setState(s.id);
        $('#st-cast-note').textContent = r.ok ? 'held: ' + r.detail : 'refused: ' + r.detail;
        states.querySelectorAll('button').forEach((x) => x.classList.toggle('on', r.ok && x === b));
      });
      states.appendChild(b);
    }
    $('#st-cast-release').addEventListener('click', () => {
      this.cast.release();
      states.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      $('#st-cast-note').textContent = 'released to AI';
    });
    this._lockBtn = $('#st-cast-lock');
    this._lockBtn.addEventListener('click', () => {
      this.cast.locked = !this.cast.locked;
      this._lockBtn.classList.toggle('on', this.cast.locked);
    });
    $('#st-cast-prev').addEventListener('click', () => { this.cast.cycle(-1); this._lockBtn.classList.add('on'); });
    $('#st-cast-next').addEventListener('click', () => { this.cast.cycle(1); this._lockBtn.classList.add('on'); });
  }

  _refreshCastKinds() {
    const box = this._ui.querySelector('#st-cast-kinds');
    const kinds = this.cast.kinds;
    if (!kinds.length || !this.cast.canSpawn) {
      box.innerHTML = '<span class="studio-note">spawn API not available</span>';
      return;
    }
    if (box.dataset.built === String(kinds.length)) return;
    box.dataset.built = String(kinds.length);
    box.innerHTML = '';
    for (const kind of kinds) {
      const b = document.createElement('button');
      b.textContent = kind;
      b.dataset.kind = kind;
      b.addEventListener('click', () => {
        const p = this._lookPoint();
        const m = this.cast.spawn(kind, p.x, p.z);
        this._ui.querySelector('#st-cast-note').textContent = m
          ? 'spawned ' + kind : 'spawn failed: ' + this.cast.lastError;
        this._lockBtn.classList.toggle('on', this.cast.locked);
      });
      box.appendChild(b);
    }
  }

  /** March the camera ray forward to the terrain surface; fall back to 18 m. */
  _lookPoint() {
    const ctx = this.ctx;
    const origin = ctx.camera.position;
    ctx.camera.getWorldDirection(this._camDir);
    const probe = this._probe;
    for (let d = 4; d <= 120; d += 2) {
      probe.copy(origin).addScaledVector(this._camDir, d);
      if (probe.y <= (ctx.terrain?.getHeight?.(probe.x, probe.z) ?? -1e9)) return probe;
    }
    return probe.copy(origin).addScaledVector(this._camDir, 18);
  }

  /** Cheap 4 Hz readout; no allocation on the other frames. */
  _tickReadout() {
    this._readoutT++;
    if (this._readoutT < 15) return;
    this._readoutT = 0;
    // Re-sweep at 4 Hz while the chrome is hidden: a toast, a tutorial card or
    // a loot popup appended AFTER the button was pressed would otherwise pop
    // into the middle of a shot. Eighteen tag/contains checks, no styles read,
    // on one frame in fifteen — never in `_frame`'s hot path.
    if (this._chromeHidden) {
      for (const el of this._chromeRoots()) {
        if (el.classList.contains('studio-hidden')) continue;
        el.classList.add('studio-hidden');
        this._hiddenChrome.push(el);
      }
    }
    const m = this.cast.target;
    const h = this.cast.hold;
    const el = this._ui.querySelector('#st-cast-target');
    if (el) {
      el.textContent = m
        ? m.kind + ' · ' + m.state + (h ? ' · held ' + h.t.toFixed(1) + 's' : '') + (this.cast.locked ? ' · locked' : '')
        : '—';
    }
    this._syncGuides();
  }

  _syncUi() {
    const ui = this._ui;
    ui.querySelector('#st-time').value = String(this.timeScale);
    ui.querySelector('#st-time-out').value = this.timeScale.toFixed(2);
    ui.querySelector('#st-fov').value = String(Math.round(this._fov));
    ui.querySelector('#st-fov-out').value = String(Math.round(this._fov));
    ui.querySelector('#st-roll').value = String(this._roll);
    this._syncGuides();
  }
}
