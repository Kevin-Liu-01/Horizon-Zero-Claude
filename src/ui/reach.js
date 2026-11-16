/**
 * REACH (M1.6m): the game's context for the input layer's pad and its hold-or-toggle latches. src/core/input.js reads
 * no ctx; it asks `input.hooks`, and this installs them (from the settings store, which every build constructs).
 *
 *   ui()        the page has the pad, not the world: the title, a menu, the hub, a dialogue, the death card
 *   sighting()  the Alidade is up (R3 takes a bearing instead of crouching)
 *   guarding()  the Windwall's guard is up (A plants it instead of jumping). The Windwall is Oro's kit (Milestone 2):
 *               until it lands nothing guards, and A is always the jump
 *   slots()     { active, list }: the quick slot in hand and the earned ones, for D-right's tap (cycle) and hold (make)
 *   longHold()  the interaction in front of her when it is a long hold (a benchmark's 15 s re-survey), else null:
 *               a TOGGLE re-survey latches E only on one of these, and lets go when it is no longer the one in front
 */

/** Seconds of hold from which an interaction is a re-survey-like hold that TOGGLE may latch. */
export const LONG_HOLD_S = 3;

export function installReach(ctx) {
  const input = ctx?.input;
  if (!input || input.hooks?.installed) return input?.hooks ?? null;
  const hooks = {
    installed: true,
    ui: () => ctx.state !== 'playing' || !!ctx.menus?.hubOpen || !!ctx.systemsGame?.present?.busy,
    sighting: () => !!ctx.sighting?.on,
    guarding: () => !!ctx.combat?.windwall?.guarding,
    slots: () => {
      const q = ctx.quickslots;
      const list = (q?.slots ?? []).filter((s) => s.kind).map((s) => s.slot);
      return { active: q?.activeSlot ?? 1, list: list.length ? list : [1, 2] };
    },
    longHold: () => {
      const e = ctx.interactables?.current?.entry;
      return e && (e.hold ?? 0) >= LONG_HOLD_S ? e : null;
    },
  };
  input.hooks = hooks;
  return hooks;
}
