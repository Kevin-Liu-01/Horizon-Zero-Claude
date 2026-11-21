import { ensureKind, spawnLive } from '../kiln/live-kind.js';
import { SONDE_KIND } from './kind.js';

/**
 * THE SONDE AT MOORING (Milestone 3 wave 3c, area C; IK7, HT2). "A Line Over the Glass" (src/game/hour2/glass-line.js,
 * area B) moors a Sonde 22 m off the Sounding Ring on bearing 060 (MOORING: where the tether's prompt is reachable); until
 * wave 3c it moored a stand-in (src/entities/anim/kite/mooredSonde.js). This stands the live kind there instead: its
 * model is fetched the first time the quest asks (IK11: not in the first load), its post is MOORING and its brain moors
 * it on the 18 m tether; the quest's `_liveSonde()` then finds it (a 'sonde' within 60 m of the Ring with
 * `rules.cutTether`) and the tether's prompt calls the live `cutTether()`.
 *
 *   const s = mooringSonde(ctx, MOORING)   asks once per ctx; returns { ready, failed, machine } (filled when it stands)
 */
const ASKED = new WeakMap();

export function mooringSonde(ctx, at) {
  let rec = ASKED.get(ctx);
  if (rec) return rec;
  rec = { ready: false, failed: null, machine: null, at: { x: at.x, z: at.z } };
  ASKED.set(ctx, rec);
  ensureKind(ctx, SONDE_KIND).then((ok) => {
    if (!ok) { rec.failed = 'sonde model'; return; }
    const m = spawnLive(ctx, SONDE_KIND.id, at.x, at.z, 0);
    if (!m) { rec.failed = 'sonde spawn'; return; }
    m.mooredAt = 'ring';
    rec.machine = m; rec.ready = true;
  });
  return rec;
}

/** Forget the ask (a New Game, or a record loaded past the cut): the machine, if any, is the caller's to take out. */
export function forgetMooring(ctx) { ASKED.delete(ctx); }
