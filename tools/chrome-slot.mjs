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
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SLOTS } from './frames/paths.mjs';

export const SLOT = path.join(SLOTS, 'slot1');

/*
 * The FIFO queue (orchestrator, Nov 20): waiters used to race `mkdir slot1` every 5-10 s, so a runner that released
 * and re-took the slot between legs won almost every round and other lanes waited hours. Now each waiter writes a
 * ticket <SLOTS>/queue/<ms>-<pid>-<who> and touches it every poll; only the oldest live ticket (its pid alive and
 * touched within 90 s) may try the mkdir. A ticket is removed when its run takes the slot, gives up, or exits; a run
 * that takes the slot again after releasing it queues again at the back. Tools that do not use the queue still race,
 * so the queue is a courtesy among the tools that do, never a lock.
 */
export const QUEUE = path.join(SLOTS, 'queue');
let ticket = null;
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return /** @type {any} */ (e).code === 'EPERM'; } };
/** Leave the queue (idempotent, synchronous). */
export function leaveSlotQueue() { if (ticket) { try { rmSync(ticket, { force: true }); } catch { /* */ } ticket = null; } }
/**
 * Queue for slot1 (joins on first call, touches the ticket on each call). True when this run is first in line.
 * @param {string} who
 */
export function slotTurn(who = 'run') {
  try {
    if (!ticket) {
      mkdirSync(QUEUE, { recursive: true });
      ticket = path.join(QUEUE, `${String(Date.now()).padStart(15, '0')}-${process.pid}-${String(who).replace(/[^\w.-]+/g, '_').slice(0, 40)}`);
      writeFileSync(ticket, `${who} ${process.pid}\n`);
      process.on('exit', leaveSlotQueue);
    }
    const now = new Date();
    utimesSync(ticket, now, now);
    for (const n of readdirSync(QUEUE).sort()) {
      const f = path.join(QUEUE, n), pid = Number(n.split('-')[1]);
      let fresh = false;
      try { fresh = Date.now() - statSync(f).mtimeMs < 90000; } catch { /* gone */ }
      if (f === ticket) return true;
      if (!pid || !alive(pid) || !fresh) { try { rmSync(f, { force: true }); } catch { /* */ } continue; }
      return false;
    }
    return true;
  } catch { return true; }   // the queue never blocks a run on its own failure
}
/** The queue as names, oldest first (for waiting messages). */
export function slotQueue() { try { return readdirSync(QUEUE).sort().map((n) => n.split('-').slice(2).join('-')); } catch { return []; } }
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
    const turn = slotTurn(who);
    if (m.ok && turn) {
      try { mkdirSync(SLOT); held = true; } catch { /* held by another run */ }
      if (held) {
        leaveSlotQueue();
        writeFileSync(path.join(SLOT, 'owner.txt'), `int ${who} ${process.pid} ${utc()}\n`);
        log(`[chrome-slot] slot1 taken (memory ${m.free} % free, level ${m.level})`);
        return { ok: true, held: true, waitedS: Math.round((Date.now() - t0) / 1000) };
      }
    }
    if (!(said % 6)) {
      let owner = '';
      try { owner = readFileSync(path.join(SLOT, 'owner.txt'), 'utf8').split('\n')[0].trim(); } catch { /* */ }
      log(`[chrome-slot] waiting: memory ${m.free} % free, level ${m.level}${owner ? `, slot1 held by "${owner}"` : ''}, queue [${slotQueue().join(', ')}]`);
    }
    await sleep(5000);
  }
  leaveSlotQueue();
  return { ok: false, held: false, waitedS: waitS, why: `slot1 not available within ${waitS} s (the memory guard or another run holds Chrome)` };
}
