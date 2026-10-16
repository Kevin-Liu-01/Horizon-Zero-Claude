/**
 * GATE ROLES -> live Instrument kinds (instruments-core, Round 5; contract
 * `ctx.machines.roles`, plan §3.2, gates `A-roles-published`, R18, R28).
 *
 * Every role-staged gate asks for a ROLE, never a species (plan §9: "no gate
 * names a species"); `tools/gate-roster.mjs` (gates-perf) resolves the role
 * through this map. The map is built from the registered Instrument kinds
 * (`src/instruments/kinds/*`, each declaring `role`), so it fills in as the
 * Instruments lanes land with 0 edits here.
 *
 * Published on the manager by `installInstruments`:
 *
 *   machines.roles      { [roleId]: kindId | null }   exactly the 12 ROLE_IDS,
 *                       frozen; null = no live kind yet (R18: the gate reports
 *                       SKIP with the note, never PASS)
 *   machines.roleNotes  { [roleId]: string }          why null, or which fixture
 *   machines.roleIds    ROLE_IDS
 *   machines.roleOf(kind) -> roleId | null
 *
 * LEGACY KINDS ARE NEVER MAPPED (R28): only modules under
 * `src/instruments/kinds/` can claim a role, and `machines/legacy.js` kinds
 * cannot be registered there. No role id matches
 * /charger|burrower|grazer|stalker|watcher|apex|scout/i (bible §7.4).
 */

/** The twelve roles, in bible §7.4 roster order. */
export const ROLE_IDS = Object.freeze([
  'sentry', 'herd', 'swarm', 'flanker', 'heavy', 'keeper',
  'duelist', 'artillery', 'support', 'spotter', 'ambusher', 'colossus',
]);

/** Who fills each role, and when (bible §7.4 / §10.2, plan §2). The R18 note. */
export const ROLE_PLAN = Object.freeze({
  sentry: { kind: 'plumb', lane: 'instruments-a', wave: 'W1' },
  herd: { kind: 'tiller', lane: 'instruments-a', wave: 'W1 (W0 fixture: instruments-core)' },
  swarm: { kind: 'peg', lane: 'instruments-a', wave: 'W1' },
  flanker: { kind: 'sickle', lane: 'instruments-b', wave: 'W2' },
  heavy: { kind: 'screed', lane: 'instruments-b', wave: 'W2' },
  keeper: { kind: 'gauge', lane: 'instruments-b', wave: 'W2' },
  duelist: { kind: 'spindle', lane: 'instruments-c', wave: 'W3' },
  artillery: { kind: 'kiln', lane: 'instruments-c', wave: 'W3' },
  support: { kind: 'davit', lane: 'instruments-c', wave: 'W3' },
  spotter: { kind: 'sonde', lane: 'instruments-c', wave: 'W3' },
  ambusher: { kind: 'dredge', lane: 'instruments-d', wave: 'W4' },
  colossus: { kind: 'transit', lane: 'instruments-d', wave: 'W4' },
});

export const FORBIDDEN_ROLE_ID = /charger|burrower|grazer|stalker|watcher|apex|scout/i;

/**
 * Build the role map from registered kind descriptors ({ id, role, fixture }).
 * The first registered kind claiming a role wins; a second claimant is listed
 * in its note (a role is one kind, so a gate staging it is deterministic).
 */
export function buildRoles(descriptors) {
  const roles = {};
  const notes = {};
  for (const r of ROLE_IDS) {
    roles[r] = null;
    const p = ROLE_PLAN[r];
    notes[r] = `R18: no live kind yet — ${p.kind} (${p.lane}, ${p.wave})`;
  }
  for (const d of descriptors) {
    if (!d?.role) continue;
    if (!ROLE_IDS.includes(d.role)) {
      console.warn(`[instruments] kind '${d.id}' claims unknown role '${d.role}' — ignored`);
      continue;
    }
    if (roles[d.role]) { notes[d.role] += `; also claimed by '${d.id}'`; continue; }
    roles[d.role] = d.id;
    notes[d.role] = d.fixture
      ? `R28 fixture: '${d.id}' stages this role until ${ROLE_PLAN[d.role].lane} ${ROLE_PLAN[d.role].wave.split(' ')[0]}`
      : `live: '${d.id}'`;
  }
  return { roles: Object.freeze(roles), notes: Object.freeze(notes) };
}
