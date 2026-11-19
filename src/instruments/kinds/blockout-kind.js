import { ExpansionMachine } from '../../entities/machines/rig/expansion-base.js';
import { liftExtras } from '../lib/generated.js';
import { setOccluder, clearOccluders } from '../lib/sight.js';
import { hullShapes, FORMS } from '../lib/blockout.js';

/**
 * A WAVE 1 BLOCKOUT KIND (M2 briefs §3.4; area C). A helper module (no default export: the registry skips it).
 *
 * A grey hull from `tools/build/instruments/gen-blockout.mjs` that stands where it is spawned: no rig, no gait, no
 * attack table. It exists for the line-up frames (F23-tiller, F23-sickle, F23-screed) and to declare its size class
 * (A76 reads three). It claims NO role, so no role-staged gate and no every-kind kept row stages it (gate-roster.mjs
 * STAGED_KINDS is role-mapped), and no doctrine spawns it; the rules it will run are in Node (`./screed-rules.js`,
 * `./sickle-rules.js`). The kind's role is claimed in its behaviour wave, with its rig.
 *
 * Its lamp is the kind's one lamp, drawn by `machines.lamps` in the state's colour. Its occluding parts are published
 * to the sight occluders (src/instruments/lib/sight.js) under `<kind>:<id>:` while it lives.
 */
let _serial = 0;

export function blockoutKind({ id, kind, formId = null, url, sizeClass, plannedRole, displayName }) {
  class Blockout extends ExpansionMachine {
    constructor(ctx, manager, opts = {}) {
      super(ctx, manager, {
        kind: id, displayName, rigged: false, yawFix: 0,
        maxHealth: 400, armor: 0.1, level: 6,
        walkSpeed: 0.0001, runSpeed: 0.0001, turnRate: 0.5,
        sightRange: 30, hearRange: 20, eyeHeight: 1.5, attackRange: 2, bodyRadius: Math.max(0.6, FORMS[kind].W / 2),
        ...opts,
      });
      const entry = ctx.assets.models[this.modelKind];
      const bo = entry.r5Blockout || {};
      if (Array.isArray(bo.lamp)) this.addLamp(bo.lamp, { radius: Math.max(0.05, Math.min(0.24, bo.lampR || 0.15)) });
      this._occSlot = `${id}:${++_serial}:`;
      this._occAt = null;
    }

    /**
     * A blockout has no behaviour yet: it never leaves calm and never turns (the line-up films it calm and facing her;
     * at 6 m on open crust its perception would otherwise raise it to hostile in the settle). The occluders follow the
     * hull (cheap: a few boxes, rewritten only when it has moved or turned).
     */
    update(dt, t) {
      const r = super.update(dt, t);
      if (this.alive && this.state !== 'patrol') this.setState('patrol');
      if (this.sc) this.sc.suspicion = 0;
      const p = this.position, h = this.heading;
      const o = this._occAt;
      if (this.alive && (!o || Math.abs(o[0] - p.x) > 0.05 || Math.abs(o[1] - p.z) > 0.05 || Math.abs(o[2] - h) > 0.01)) {
        const shapes = hullShapes(kind, p.x, p.z, h, formId, p.y);
        for (let i = 0; i < shapes.length; i++) setOccluder(this._occSlot + i, shapes[i]);
        this._occAt = [p.x, p.z, h];
      }
      return r;
    }

    _statePatrol() {}
    _stateSuspicious() {}
    _stateAlert() {}
    _stateSearch() {}
    dispose() { clearOccluders(this._occSlot); return super.dispose(); }
    onDeathPose() {}
    animate() {}
  }
  return {
    id,
    /** no role until the behaviour wave (see the header); `plannedRole` is roles.js ROLE_PLAN's */
    plannedRole,
    blockout: kind,
    sizeClass,
    Cls: Blockout,
    /** P-03: the registry height (m); the GLB's own bbox height is the roster's (gen-blockout.mjs), so the normaliser scales by 1 */
    height: FORMS[kind].H,
    spec: { url, targetHeight: FORMS[kind].H, yaw: 0 },
    onEntry: (entry) => {
      liftExtras(entry);
      entry.r5Blockout = entry.gltf?.parser?.json?.asset?.extras?.r5Blockout || null;
    },
  };
}
