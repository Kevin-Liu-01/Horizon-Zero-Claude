/**
 * Animation Studio — staging & cinematography mode (Round 3, orchestrator lane).
 *
 * F10 toggles from playing state. While active:
 *  - Free-fly camera: WASD + Q/E down/up, Shift boost, click canvas to mouse-look.
 *  - Gameplay keeps simulating (machines patrol, player idles) but the studio owns
 *    ALL input: ctx.input is disabled so Aloy doesn't respond to fly keys.
 *  - Time control: timeScale slider 0–1 (freeze → full speed) via engine.timeScale.
 *  - FOV + camera roll sliders, HUD hide toggle, PNG frame export.
 *
 * Contract: constructed LAST in main.js so its update() runs after Player's and
 * its camera write wins the frame. Exposes ctx.studio; other systems must not
 * depend on it (it may be absent in shot mode).
 */
import * as THREE from 'three';
import './studio.css';

export class Studio {
  constructor(ctx) {
    this.ctx = ctx;
    this.active = false;
    this._prevState = null;
    this._pos = new THREE.Vector3();
    this._yaw = 0;
    this._pitch = 0;
    this._roll = 0;
    this._fov = 55;
    this._speed = 14;
    this._keys = new Set();
    this._look = { dx: 0, dy: 0 };
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._buildUi();

    // Own listeners — independent of ctx.input so the game never sees fly keys.
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F10') { e.preventDefault(); this.toggle(); return; }
      if (!this.active) return;
      if (e.code === 'Escape') { this.exit(); return; }
      this._keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this._keys.delete(e.code));
    document.addEventListener('mousemove', (e) => {
      if (!this.active || document.pointerLockElement !== this._canvas()) return;
      this._look.dx += e.movementX;
      this._look.dy += e.movementY;
    });
  }

  _canvas() { return this.ctx.renderer.domElement; }

  toggle() {
    if (this.active) this.exit();
    else this.enter();
  }

  enter() {
    const ctx = this.ctx;
    if (this.active) return;
    if (!['playing', 'paused'].includes(ctx.state)) return;
    this.active = true;
    this._prevState = ctx.state;
    ctx.state = 'studio';
    ctx.input.enabled = false;
    ctx.input.keys.clear();
    // start from the current camera pose
    this._pos.copy(ctx.camera.position);
    this._euler.setFromQuaternion(ctx.camera.quaternion, 'YXZ');
    this._yaw = this._euler.y;
    this._pitch = this._euler.x;
    this._roll = 0;
    this._fov = ctx.camera.fov;
    this._ui.classList.remove('hidden');
    this._hint.classList.remove('hidden');
    this._canvas().addEventListener('click', this._lockFn ??= () => {
      if (this.active) this._canvas().requestPointerLock?.();
    });
  }

  exit() {
    const ctx = this.ctx;
    if (!this.active) return;
    this.active = false;
    ctx.state = this._prevState ?? 'playing';
    ctx.input.enabled = true;
    ctx.engine.timeScale = 1;
    ctx.camera.fov = 55;
    ctx.camera.updateProjectionMatrix();
    this._ui.classList.add('hidden');
    this._hint.classList.add('hidden');
    document.getElementById('hud')?.classList.remove('studio-hidden');
    this._hudBtn.classList.remove('on');
    document.exitPointerLock?.();
  }

  update(dt) {
    if (!this.active) return;
    const ctx = this.ctx;

    // fly (real time, unaffected by timeScale)
    const rdt = Math.min(ctx.engine.clock.getDelta ? 1 / 60 : 1 / 60, 1 / 30); // fixed-ish step
    const boost = this._keys.has('ShiftLeft') || this._keys.has('ShiftRight') ? 3.2 : 1;
    const v = this._speed * boost * rdt;
    const sinY = Math.sin(this._yaw), cosY = Math.cos(this._yaw);
    const fwd = new THREE.Vector3(-sinY * Math.cos(this._pitch), Math.sin(this._pitch) * -1, -cosY * Math.cos(this._pitch));
    const right = new THREE.Vector3(cosY, 0, -sinY);
    if (this._keys.has('KeyW')) this._pos.addScaledVector(fwd, v);
    if (this._keys.has('KeyS')) this._pos.addScaledVector(fwd, -v);
    if (this._keys.has('KeyD')) this._pos.addScaledVector(right, v);
    if (this._keys.has('KeyA')) this._pos.addScaledVector(right, -v);
    if (this._keys.has('KeyE')) this._pos.y += v;
    if (this._keys.has('KeyQ')) this._pos.y -= v;

    // mouse look
    this._yaw -= this._look.dx * 0.0022;
    this._pitch -= this._look.dy * 0.0022;
    this._pitch = THREE.MathUtils.clamp(this._pitch, -1.45, 1.45);
    this._look.dx = 0;
    this._look.dy = 0;

    // don't fly under the terrain
    const floor = ctx.terrain.getHeight(this._pos.x, this._pos.z) + 0.3;
    if (this._pos.y < floor) this._pos.y = floor;

    ctx.camera.position.copy(this._pos);
    this._euler.set(this._pitch, this._yaw, this._roll, 'YXZ');
    ctx.camera.quaternion.setFromEuler(this._euler);
    if (ctx.camera.fov !== this._fov) {
      ctx.camera.fov = this._fov;
      ctx.camera.updateProjectionMatrix();
    }
  }

  _buildUi() {
    const ui = document.createElement('div');
    ui.id = 'studio-ui';
    ui.className = 'hidden';
    ui.innerHTML = `
      <div class="studio-bar">
        <div class="studio-title">STUDIO</div>
        <label class="studio-group">Time
          <input type="range" id="st-time" min="0" max="1" step="0.05" value="1">
          <output id="st-time-out">1.0</output>
        </label>
        <label class="studio-group">FOV
          <input type="range" id="st-fov" min="24" max="95" step="1" value="55">
          <output id="st-fov-out">55</output>
        </label>
        <label class="studio-group">Roll
          <input type="range" id="st-roll" min="-0.5" max="0.5" step="0.01" value="0">
          <output id="st-roll-out">0</output>
        </label>
        <button id="st-hud">Hide HUD</button>
        <button id="st-shot">Frame → PNG</button>
        <button id="st-cast">Cast</button>
        <button id="st-exit">Exit (F10)</button>
      </div>
      <div class="studio-cast hidden" id="st-cast-panel">
        <div class="cast-title">CAST — SPAWN AT VIEW</div>
        <div class="cast-kinds" id="st-cast-kinds"></div>
        <div class="cast-title">NEAREST MACHINE</div>
        <div class="cast-states">
          <button data-state="patrol">Patrol</button>
          <button data-state="suspicious">Suspicious</button>
          <button data-state="alert">Alert</button>
          <button data-state="attack">Attack</button>
        </div>
      </div>`;
    document.body.appendChild(ui);
    this._ui = ui;

    const hint = document.createElement('div');
    hint.id = 'studio-hint';
    hint.className = 'hidden';
    hint.textContent = 'STUDIO — WASD fly · Q/E down/up · Shift boost · click to look · Esc exit';
    document.body.appendChild(hint);
    this._hint = hint;

    const $ = (id) => ui.querySelector(id);
    $('#st-time').addEventListener('input', (e) => {
      this.ctx.engine.timeScale = parseFloat(e.target.value);
      $('#st-time-out').value = parseFloat(e.target.value).toFixed(2);
    });
    $('#st-fov').addEventListener('input', (e) => {
      this._fov = parseFloat(e.target.value);
      $('#st-fov-out').value = e.target.value;
    });
    $('#st-roll').addEventListener('input', (e) => {
      this._roll = parseFloat(e.target.value);
      $('#st-roll-out').value = parseFloat(e.target.value).toFixed(2);
    });
    this._hudBtn = $('#st-hud');
    this._hudBtn.addEventListener('click', () => {
      const hud = document.getElementById('hud');
      const on = hud.classList.toggle('studio-hidden');
      this._hudBtn.classList.toggle('on', on);
      this._hudBtn.textContent = on ? 'Show HUD' : 'Hide HUD';
    });
    $('#st-shot').addEventListener('click', () => this._exportFrame());
    $('#st-exit').addEventListener('click', () => this.exit());

    // Cast panel — lights up only when the machines.spawn API exists (variety wave).
    this._castPanel = $('#st-cast-panel');
    $('#st-cast').addEventListener('click', () => {
      this._refreshCastKinds();
      this._castPanel.classList.toggle('hidden');
    });
    ui.querySelectorAll('.cast-states button').forEach((b) =>
      b.addEventListener('click', () => {
        const m = this._nearestMachine();
        m?.setState?.(b.dataset.state);
      }));
  }

  _refreshCastKinds() {
    const box = this._ui.querySelector('#st-cast-kinds');
    const kinds = this.ctx.machines?.kinds;
    const canSpawn = typeof this.ctx.machines?.spawn === 'function';
    if (!kinds?.length || !canSpawn) {
      box.innerHTML = '<span class="cast-note">spawn API not available</span>';
      return;
    }
    box.innerHTML = '';
    for (const kind of kinds) {
      const b = document.createElement('button');
      b.textContent = kind;
      b.addEventListener('click', () => {
        const p = this._lookPoint();
        try { this.ctx.machines.spawn(kind, p.x, p.z); } catch (e) { console.warn('[studio] spawn failed:', e); }
      });
      box.appendChild(b);
    }
  }

  /** March the camera ray forward to the terrain surface; fall back to 18m ahead. */
  _lookPoint() {
    const ctx = this.ctx;
    const origin = ctx.camera.position;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(ctx.camera.quaternion);
    const probe = new THREE.Vector3();
    for (let d = 4; d <= 120; d += 2) {
      probe.copy(origin).addScaledVector(dir, d);
      if (probe.y <= ctx.terrain.getHeight(probe.x, probe.z)) return probe;
    }
    return probe.copy(origin).addScaledVector(dir, 18);
  }

  _nearestMachine() {
    const list = this.ctx.machines?.list || [];
    let best = null, bd = Infinity;
    for (const m of list) {
      if (!m.alive) continue;
      const d = m.position.distanceToSquared(this._pos);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  _exportFrame() {
    // render synchronously, then read the buffer before compositing clears it
    this.ctx.engine.render();
    const url = this._canvas().toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `hzc-studio-${Date.now()}.png`;
    a.click();
  }
}
