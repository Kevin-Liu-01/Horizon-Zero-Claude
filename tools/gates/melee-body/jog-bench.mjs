/**
 * M1a round 2 (hero-anim) — A104's and A105's jogging-heavy clauses in Node (the rows are tools/gates.r5.melee.mjs
 * `A104-melee-self-clear`'s "jog heavy" recover row, ruling R9: the right forearm >= 0.10 m off the pelvis->neck
 * axis on the recover and the 12 steps after it; and `A105-melee-while-moving`'s "jogging heavy" head cylinder,
 * ruling R3: forearm and haft > 0.16 m off the head axis at face height on the strike and the recover). The
 * layer's own debug numbers (`forearmToSpine`, `headCylForearm`, `headCylHaft`), as the rows read them. Not a gate.
 *
 *   node tools/gates/melee-body/jog-bench.mjs [--speed 5.0] [--stop]
 */
import { makeMeleeRig, step } from './bench.mjs';

const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

export async function jogHeavy(R, { speed = 5.0, stop = false, n = 3 } = {}) {
  const { player: p, an, melee } = R;
  const go = (v) => { p.velocity.set(Math.sin(p.heading) * v, 0, Math.cos(p.heading) * v); p.moveSpeed = v; };
  const out = [];
  for (let c = 0; c < n; c++) {
    melee.drawLance(30);
    for (let i = 0; i < 90; i++) { go(speed); step(R); melee.drawLance(30); }
    if (stop) go(0);
    melee.swing({ heavy: true });
    let rec = 9, all = 9, cyl = 9, began = false, frames = 0;
    for (let i = 0; i < 180; i++) {
      go(stop ? 0 : speed); step(R);
      const d = an.debugMelee();
      if (!d) continue;
      if (melee.stance === 'swing') began = true;
      if ((d.w ?? 0) > 0.3 && typeof d.forearmToSpine === 'number') all = Math.min(all, d.forearmToSpine);
      if (d.stance === 'swing' && d.phase === 'recover') rec = Math.min(rec, d.forearmToSpine);
      if (d.stance === 'swing' && (d.phase === 'strike' || d.phase === 'recover') && d.beat === 'heavy') { cyl = Math.min(cyl, d.headCylForearm, d.headCylHaft); frames++; }
      if (began && !melee.active && melee.stance !== 'swing') break;
    }
    for (let i = 0; i < 12; i++) { go(stop ? 0 : speed); step(R); const d = an.debugMelee(); if (d) rec = Math.min(rec, d.forearmToSpine); }
    out.push({ recoverForearmToSpine: +rec.toFixed(3), swingForearmToSpine: +all.toFixed(3), headCylMin: +cyl.toFixed(3), cylFrames: frames });
  }
  return out;
}

async function main() {
  const R = await makeMeleeRig();
  for (const stop of args.includes('--stop') ? [true] : [false, true]) {
    const rows = await jogHeavy(R, { speed: +(flag('--speed', stop ? 6.8 : 5.0)), stop });
    for (const r of rows) console.log(stop ? 'sprint-stop heavy' : 'jog heavy', JSON.stringify(r),
      r.recoverForearmToSpine >= 0.10 ? 'A104 ok' : 'A104 FAIL', r.headCylMin >= 0.16 ? 'A105 ok' : 'A105 FAIL');
  }
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
