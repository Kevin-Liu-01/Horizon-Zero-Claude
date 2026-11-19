/**
 * CALIMA · the element statuses Oro's kit puts on an Instrument (Milestone 2 area D, wave 3; bible §8.3, KT6).
 *
 *   Brine  -> Seized   joints lock 8 s: the Instrument's legs slow to a crawl, and every tool or plate inside the mist
 *                      is seized: one Pry or one hook-rip takes a seized part off. NO damage multiplier.
 *   Cinder -> Charred  burn over time (the machine's own burn: 8 s of damage over time)
 *   Dust   -> Clouded  lamps blinded 6 s (the lamp goes dark: no sight, no Flag) and the lock is broken
 *
 * Rules only, no THREE and no DOM, so the Node twin (src/combat/kit-m2.test.mjs) runs the same code the game does. The
 * live half is `StatusBook` (one per combat, `ctx.combat.status`): it holds each machine's statuses by an ENGINE id and
 * steps them on simulation time. **Engine ids never reach the UI** (bible §8.3): the HUD and the Kit Rack say only the
 * player's words (`STATUS[id].word`), and the Node row checks every UI string the kit has against every id.
 *
 * THE SEAM WITH THE INSTRUMENTS (hit parts, M2 briefs §3.2). A kind may answer a blow on a named part itself
 * (`m.kitBlow(partName, kind)` with kind 'brine' | 'pry' | 'hookRip': the Screed's ram seals, screed-rules.js
 * `hitPart`); otherwise the generic rule here works on the machine's tearable parts (`part.tearable`, `tearHp`).
 */

/** Engine ids (never shown). */
export const ST = Object.freeze({ lock: 'st.jointlock', burn: 'st.burn', blind: 'st.lampblind' });

/** The three statuses: the player's word, the element that builds it, its colour (bible §8.3), and its numbers. */
export const STATUS = Object.freeze({
  [ST.lock]: Object.freeze({ word: 'SEIZED', element: 'brine', colour: '#BDE6E3', seconds: 8, speedK: 0.25, damageK: 1 }),
  [ST.burn]: Object.freeze({ word: 'CHARRED', element: 'cinder', colour: '#FF7A1A', seconds: 8 }),
  [ST.blind]: Object.freeze({ word: 'CLOUDED', element: 'dust', colour: '#C98B4E', seconds: 6 }),
});

/** The element each pot carries -> the status it builds. */
export const ELEMENT_STATUS = Object.freeze({ brine: ST.lock, cinder: ST.burn, dust: ST.blind });

/** Every UI word the statuses use (the Node row reads these against the ids). */
export const STATUS_WORDS = Object.freeze(Object.values(STATUS).map((s) => s.word));

/** Is this part seized now (Brine on it, not yet worn off)? */
export const isSeized = (part) => !!part && part.attached !== false && (part.seizedT ?? 0) > 0;

/**
 * The tear a Pry or a hook-rip puts on `part`: the whole remaining tear when it is seized (one hit takes it off),
 * else `base`. A Seized machine takes NO more damage than it would (no multiplier): only the tear channel changes.
 */
export function tearSeized(part, base) {
  if (isSeized(part) && part.tearable && Number.isFinite(part.tearHp)) return Math.max(base, part.tearHp + 1);
  return base;
}

/**
 * The hook-rip's rule (bible §8.1: "hook-rip pulls a component off small and medium Instruments"): on a small or
 * medium kind any tearable part the hook catches comes off in one rip; on a large kind only a seized one does (the
 * Screed's ram seals, once Brine has seized them). Returns the tear to apply, or 0 (the rip only staggers).
 */
export function hookRipTear(m, part) {
  if (!m || !part || part.attached === false || !part.tearable || !Number.isFinite(part.tearHp)) return 0;
  const cls = m.sizeClass ?? m.constructor?.sizeClass ?? null;
  if (isSeized(part) || cls === 'small' || cls === 'medium') return part.tearHp + 1;
  return 0;
}

/**
 * The live statuses, one book per combat. Allocation-free per step (a machine's record is made once, on its first
 * status). `apply(m, id, opts)` starts or refreshes one; `step(dt)` wears them down and does what they do.
 */
export class StatusBook {
  constructor() {
    /** @type {any[]} machines with a record, in the order they first took a status */
    this.list = [];
    this.applied = 0;
  }

  /** The machine's record (made once). */
  rec(m) {
    let r = m.__kitStatus;
    if (!r) {
      r = m.__kitStatus = { [ST.lock]: 0, [ST.burn]: 0, [ST.blind]: 0, walk0: null, run0: null, slowed: false };
      this.list.push(m);
    }
    return r;
  }

  /** Seconds left on status `id` of machine `m` (0 when none). */
  left(m, id) { return m?.__kitStatus ? m.__kitStatus[id] || 0 : 0; }

  /**
   * Start (or refresh) status `id` on `m`. opts: { parts } the parts the element reached (Brine seizes them),
   * { at } the point it struck (Cinder's burn anchor). Returns true when it took.
   */
  apply(m, id, opts = {}) {
    if (!m || m.alive === false || m._disposed || !STATUS[id]) return false;
    const S = STATUS[id], r = this.rec(m);
    r[id] = Math.max(r[id], S.seconds);
    this.applied++;
    if (id === ST.lock) {
      // the joints lock: the legs slow (restored when it wears off); the parts in the mist are seized
      if (!r.slowed) {
        r.slowed = true;
        if (typeof m.walkSpeed === 'number') { r.walk0 = m.walkSpeed; m.walkSpeed *= S.speedK; }
        if (typeof m.runSpeed === 'number') { r.run0 = m.runSpeed; m.runSpeed *= S.speedK; }
      }
      const parts = opts.parts ?? m.parts ?? [];
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (!p || p.attached === false) continue;
        p.seizedT = S.seconds;
        if (typeof m.kitBlow === 'function') { try { m.kitBlow(p.name, 'brine'); } catch { /* the kind's own rule */ } }
      }
      if (typeof m.kitBlow === 'function' && !parts.length) { try { m.kitBlow(null, 'brine'); } catch { /* none */ } }
    } else if (id === ST.burn) {
      // the machine's own burn over time (machine.js: 8 s of damage over time at its own rate)
      if (typeof m._triggerElement === 'function') { try { m._triggerElement('fire', opts.at ?? null); } catch { /* none */ } }
    } else if (id === ST.blind) {
      // the lamp goes dark (no sight, no Flag: lamps.js reads lampDarkT) and the lock breaks
      m.lampDarkT = Math.max(m.lampDarkT || 0, S.seconds);
      const ai = m.ai;
      if (ai?.perception?.forget) { try { ai.perception.forget(); } catch { /* none */ } }
    }
    return true;
  }

  /** Wear every status down by `dt` (simulation seconds). */
  step(dt) {
    if (!(dt > 0)) return;
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const m = L[i], r = m.__kitStatus;
      if (!r || m._disposed) { L.splice(i, 1); continue; }
      if (r[ST.lock] > 0) {
        r[ST.lock] = Math.max(0, r[ST.lock] - dt);
        if (r[ST.lock] === 0 && r.slowed) {
          r.slowed = false;
          if (r.walk0 != null) m.walkSpeed = r.walk0;
          if (r.run0 != null) m.runSpeed = r.run0;
          r.walk0 = r.run0 = null;
        }
      }
      if (r[ST.burn] > 0) r[ST.burn] = Math.max(0, r[ST.burn] - dt);
      if (r[ST.blind] > 0) r[ST.blind] = Math.max(0, r[ST.blind] - dt);
      const parts = m.parts;
      if (parts) for (let k = 0; k < parts.length; k++) { const p = parts[k]; if (p && p.seizedT > 0) p.seizedT = Math.max(0, p.seizedT - dt); }
    }
  }

  /** The player's words for what `m` carries now (for the Sighting card; never an id). Into `out`. */
  words(m, out = []) {
    out.length = 0;
    const r = m?.__kitStatus;
    if (!r) return out;
    for (const id of [ST.lock, ST.burn, ST.blind]) if (r[id] > 0) out.push(STATUS[id].word);
    return out;
  }
}
