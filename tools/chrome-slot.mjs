/**
 * The machine-wide Chrome slot (PROCESS §6: one Chrome on this machine, shared by every lane), for runners that
 * launch their own headless Chrome: tools/gates.mjs (and the same protocol as tools/frames/film.mjs and
 * tools/gates/hero-sweep/session.mjs, which carry their own copy).
 *
 *   1. the machine guard: memory free >= 50 % (memory_pressure -Q) and pressure level 1
 *      (sysctl kern.memorystatus_vm_pressure_level);
 *   2. the slot: mkdir <slots>/slot1 (atomic), owner.txt "int <who> <pid> <utc>";
 *   3. released (rm -r) the moment the run ends, on every exit path (exit, signals, an uncaught throw).
 *
 * CALIMA_SLOT_HELD=1 says the caller already holds slot1 for this run (a lane that wraps the runner inside its own
 * slot): the runner then takes nothing and releases nothing.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SLOTS } from './frames/paths.mjs';

export const SLOT = path.join(SLOTS, 'slot1');
const utc = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let held = false;
let hooked = false;

/** The machine guard's reading. */
export function machineMemory() {
  let free = 0, level = '?';
  try { free = Number(/free percentage:\s*(\d+)%/.exec(execFileSync('memory_pressure', ['-Q'], { encoding: 'utf8' }))?.[1] || 0); } catch { /* */ }
  try { level = execFileSync('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'], { encoding: 'utf8' }).trim(); } catch { /* */ }
  return { free, level, ok: free >= 50 && level === '1' };
}

/** Release the slot if this process holds it (idempotent, synchronous: safe from an 'exit' handler). */
export function releaseMachineSlot(log = console.log) {
  if (!held) return;
  try { rmSync(SLOT, { recursive: true, force: true }); } catch { /* */ }
  held = false;
  log('[chrome-slot] slot1 released');
}

/**
 * Wait for the machine guard and take slot1. Returns { ok, held, waitedS, why }.
 * @param {{ who?: string, waitS?: number, log?: (...a: any[]) => void }} [o]
 */
export async function takeMachineSlot({ who = 'gates', waitS = 1800, log = console.log } = {}) {
  if (process.env.CALIMA_SLOT_HELD === '1') { log('[chrome-slot] CALIMA_SLOT_HELD=1: the caller holds slot1; not taking it'); return { ok: true, held: false, waitedS: 0, why: 'held by the caller' }; }
  if (held) return { ok: true, held: true, waitedS: 0 };
  if (!hooked) {
    hooked = true;
    process.on('exit', () => releaseMachineSlot(log));
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { releaseMachineSlot(log); process.exit(130); });
  }
  const t0 = Date.now(), until = t0 + waitS * 1000;
  for (let said = 0; Date.now() < until; said++) {
    const m = machineMemory();
    if (m.ok) {
      try { mkdirSync(SLOT); held = true; } catch { /* held by another run */ }
      if (held) {
        writeFileSync(path.join(SLOT, 'owner.txt'), `int ${who} ${process.pid} ${utc()}\n`);
        log(`[chrome-slot] slot1 taken (memory ${m.free} % free, level ${m.level})`);
        return { ok: true, held: true, waitedS: Math.round((Date.now() - t0) / 1000) };
      }
    }
    if (!(said % 6)) {
      let owner = '';
      try { owner = readFileSync(path.join(SLOT, 'owner.txt'), 'utf8').split('\n')[0].trim(); } catch { /* */ }
      log(`[chrome-slot] waiting: memory ${m.free} % free, level ${m.level}${owner ? `, slot1 held by "${owner}"` : ''}`);
    }
    await sleep(5000);
  }
  return { ok: false, held: false, waitedS: waitS, why: `slot1 not available within ${waitS} s (the memory guard or another run holds Chrome)` };
}
