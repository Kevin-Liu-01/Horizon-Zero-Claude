import { buildRig } from '../../entities/machines/autorig.js';
import { GaitController } from '../../entities/machines/gait.js';
import { attachRigRuntime, updateRigLOD, foldMachineMeshes } from '../../entities/machines/rig/lod.js';
import { snapSockets } from '../../entities/machines/rig/sockets.js';
import { ExpansionMachine } from '../../entities/machines/rig/expansion-base.js';
import { liftExtras, seedAuthoredWeights, weightAudit } from '../lib/generated.js';
import { prepareEntry, installHull } from '../lib/hull.js';
import { setOccluder, clearOccluders } from '../lib/sight.js';
import { hullShapes } from '../lib/blockout.js';

/**
 * A FINISHED KIND THAT STANDS (M2 wave 2 "the look"; area C). A helper module (no default export: the registry
 * skips it). The Sickle and the Screed have their art (tools/build/instruments/gen-sickle.mjs, gen-screed.mjs) before
 * their behaviour (wave 3): this is the M1 kinds' machine stack (generated GLB -> `liftExtras` -> authored weights ->
 * `buildRig` -> `GaitController` -> fold -> socket snap -> the hull look) on a machine that STANDS where it is
 * spawned and never leaves calm. It claims NO role, so no role-staged gate and no every-kind kept row stages it
 * (gate-roster.mjs STAGED_KINDS is role-mapped) and no doctrine spawns it; its rules run in Node
 * (`./screed-rules.js`, `./sickle-rules.js`). It declares its size class (A76 reads three).
 *
 * Its ONE lamp is the generator's lamp drum (`r5Sockets.lamp`, radius `lampR`), drawn by `machines.lamps` in the
 * state's colour. Its weak points are the generator's sockets (`weak`). Its occluding parts (blockout.js, by kind)
 * are published to the sight occluders under `<id>:<n>:` while it stands.
 */
let _serial = 0;

export function artKind({ id, kind, url, sizeClass, plannedRole, displayName, gait, weak = () => [], bodyRadius = 1, height }) {
  class Standing extends ExpansionMachine {
    constructor(ctx, manager, opts = {}) {
      super(ctx, manager, {
        kind: id, displayName, rigged: false, yawFix: 0,
        maxHealth: 400, armor: 0.1, level: 6,
        walkSpeed: 0.0001, runSpeed: 0.0001, turnRate: 0.5,
        sightRange: 30, hearRange: 20, eyeHeight: 1.5, attackRange: 2, bodyRadius,
        docile: true,
        ...opts,
      });
      const entry = ctx.assets.models[this.modelKind];
      const S = entry.r5Sockets || {};
      this._seeded = seedAuthoredWeights(this);
      if (Array.isArray(S.lamp)) {
        this.addLamp(S.lamp, { radius: S.lampR ?? 0.12 });
        this.addWeakPoint('lamp', this.body, S.lamp[0], S.lamp[1], S.lamp[2], Math.max(0.15, (S.lampR ?? 0.12) * 1.3), 2.2);
      }
      for (const w of weak(S)) this.addWeakPoint(w.name, this.body, w.at[0], w.at[1], w.at[2], w.r, w.mult ?? 2.0);
      attachRigRuntime(this, { quantise: false });
      buildRig(this, entry.r5Rig);
      this.gait = new GaitController(this, this.rig, gait);
      this.gait.update(0.016, 0);
      foldMachineMeshes(this);
      this.root.traverse((o) => { if (o.isMesh) o.userData.noSizeCull = true; });
      snapSockets(this);
      installHull(this);
      this._deathRoll = 0.25;
      this._deathSink = 0.03;
      this._occSlot = `${id}:${++_serial}:`;
      this._occAt = null;
    }

    weightAudit() { return weightAudit(this); }

    /**
     * No behaviour until its wave: it never leaves calm and never walks (the line-up films it calm and facing her).
     * The occluders follow the hull (a few boxes, rewritten only when it has been moved or turned).
     */
    update(dt, t) {
      const r = super.update(dt, t);
      if (this.alive && this.state !== 'patrol' && this.state !== 'dead') this.setState('patrol');
      if (this.sc) this.sc.suspicion = 0;
      const p = this.position, h = this.heading, o = this._occAt;
      if (this.alive && (!o || Math.abs(o[0] - p.x) > 0.05 || Math.abs(o[1] - p.z) > 0.05 || Math.abs(o[2] - h) > 0.01)) {
        const shapes = hullShapes(kind, p.x, p.z, h, null, p.y);
        for (let i = 0; i < shapes.length; i++) setOccluder(this._occSlot + i, shapes[i]);
        this._occAt = [p.x, p.z, h];
      } else if (!this.alive && o) { clearOccluders(this._occSlot); this._occAt = null; }
      return r;
    }

    _statePatrol() {}
    _stateSuspicious() {}
    _stateAlert() {}
    _stateSearch() {}

    onDeathPose(k, deathT) { this.gait.deathPose(k, deathT, 'quad'); }

    animate(dt, t) {
      const g = this.gait;
      if (this.state === 'dead') return;
      this._snapDoctrineSockets();
      if (updateRigLOD(this) >= 3) g.updateCheap(dt, t); else g.update(dt, t);
    }

    /** `ai/sites.js` dispose ends here; a staged machine (tools/frames/page.mjs) is undone through `dispose`. */
    disposeFx(keepBeacon = false) { if (this._disposed) { clearOccluders(this._occSlot); this._occAt = null; } return super.disposeFx(keepBeacon); }
    dispose() { clearOccluders(this._occSlot); this._occAt = null; super.dispose(); }
  }
  return {
    id,
    /** no role until the behaviour wave (see the header); `plannedRole` is roles.js ROLE_PLAN's */
    plannedRole,
    sizeClass,
    Cls: Standing,
    /** P-03: the registry height (m): the GLB's own r5Size[1], so the loader scales by 1 (body space == generator space) */
    height,
    spec: { url, targetHeight: height, yaw: 0 },
    onEntry: (entry) => { liftExtras(entry); prepareEntry(entry, id); },
    tables: {
      perception: { gain: 0, periphRange: 0, scanSweep: 0.4, scanPeriod: 6.0, contactRange: 0 },
      engage: { archetype: 'skittish', band: [6, 14], orbitSpeed: 0.5, backSpeed: 0.6 },
      attacks: [],
      attackMode: 'table',
      react: { staggerFrac: 9, downedFrac: 9 },
      elem: 140,
    },
  };
}
