import { Engine } from './core/engine.js';
import { Assets } from './core/assets.js';
import { Input } from './core/input.js';
import { Events } from './core/events.js';
import { Terrain } from './world/terrain.js';
import { Environment } from './world/environment.js';
import { Vegetation } from './world/vegetation.js';
import { Camp } from './world/camp.js';
import { Player } from './entities/player.js';
import { Machines } from './entities/machines/index.js';
import { Combat } from './combat/combat.js';
import { FocusSystem } from './ui/focus.js';
import { HUD } from './ui/hud.js';
import { GameAudio } from './audio/audio.js';

const params = new URLSearchParams(location.search);

class Game {
  constructor() {
    this.ctx = {
      game: this,
      params,
      engine: null, scene: null, camera: null, renderer: null,
      input: null, events: new Events(), assets: new Assets(),
      terrain: null, environment: null, vegetation: null, camp: null,
      player: null, machines: null, combat: null, focus: null,
      hud: null, audio: null,
      state: 'loading', // loading | title | playing | paused | dead | victory
      settings: { quality: params.get('q') || 'high' },
    };
    this.systems = [];
    this.started = false;
  }

  async boot() {
    const ctx = this.ctx;
    const engine = new Engine(document.getElementById('app'));
    ctx.engine = engine;
    ctx.scene = engine.scene;
    ctx.camera = engine.camera;
    ctx.renderer = engine.renderer;
    ctx.input = new Input(engine.renderer.domElement);

    const fill = document.getElementById('load-fill');
    const label = document.getElementById('load-label');
    await ctx.assets.loadAll((p, name) => {
      fill.style.width = `${Math.round(p * 100)}%`;
      label.textContent = `Calibrating ${name}…`;
    });

    // Construction order matters: world -> actors -> presentation.
    ctx.terrain = this._add(new Terrain(ctx));
    ctx.environment = this._add(new Environment(ctx));
    ctx.vegetation = this._add(new Vegetation(ctx));
    ctx.camp = this._add(new Camp(ctx));
    ctx.player = this._add(new Player(ctx));
    ctx.machines = this._add(new Machines(ctx));
    ctx.combat = this._add(new Combat(ctx));
    ctx.focus = this._add(new FocusSystem(ctx));
    ctx.audio = this._add(new GameAudio(ctx));
    ctx.hud = this._add(new HUD(ctx));

    const loadingEl = document.getElementById('loading');
    if (params.has('shot')) loadingEl.remove();
    else loadingEl.classList.add('hidden');

    // Screenshot/automation harness support
    if (params.has('shot')) {
      window.__GAME__ = this;
      window.__CTX__ = ctx;
      this.start(false);
      const p = ctx.player;
      if (params.has('px')) p.position.x = parseFloat(params.get('px'));
      if (params.has('pz')) p.position.z = parseFloat(params.get('pz'));
      if (params.has('yaw')) p.camYaw = parseFloat(params.get('yaw'));
      if (params.has('pitch')) p.camPitch = parseFloat(params.get('pitch'));
      p._snapToGround?.();
      window.__READY__ = true;
    } else {
      this._showTitle();
    }

    engine.renderer.setAnimationLoop(() => this._frame());
  }

  _add(system) {
    this.systems.push(system);
    return system;
  }

  _showTitle() {
    this.ctx.state = 'title';
    const title = document.getElementById('title');
    title.classList.remove('hidden');
    document.getElementById('btn-start').addEventListener('click', () => this.start(true));
  }

  start(lockPointer) {
    document.getElementById('title').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.ctx.state = 'playing';
    this.ctx.input.enabled = true;
    if (lockPointer) this.ctx.input.requestPointerLock();
    this.started = true;
    this.ctx.events.emit('game-start');
  }

  _frame() {
    const ctx = this.ctx;
    const rawDt = Math.min(ctx.engine.clock.getDelta(), 0.05);
    const dt = rawDt * ctx.engine.timeScale;
    const t = ctx.engine.clock.elapsedTime;

    if (ctx.state === 'playing' || ctx.state === 'title' || params.has('shot')) {
      for (const s of this.systems) s.update?.(dt, t);
    }
    ctx.input.endFrame();
    ctx.engine.render();
  }
}

new Game().boot().catch((err) => {
  console.error('[HZC] boot failed:', err);
  const label = document.getElementById('load-label');
  if (label) {
    label.textContent = `BOOT FAILED — ${err.message}`;
    label.style.color = '#e04f3f';
  }
});
