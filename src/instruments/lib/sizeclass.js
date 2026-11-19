/**
 * INSTRUMENT SIZE CLASSES (bible §7.4 roster; M2 wave 0, D6).
 *
 * Every kind module under `src/instruments/kinds/` declares `sizeClass` on its
 * descriptor: one of SIZE_CLASSES. The registry refuses to guess: a kind that
 * declares none (or an unknown one) is warned about and published as null, and
 * every consumer below treats null as "not classed" rather than as medium.
 *
 * What is read from the declared class, and nowhere else:
 *   - the footfall weight class (`weightOf`: small -> light, medium -> medium,
 *     large and colossal -> heavy);
 *   - the per-class caps (`CLASS_CAPS`: one hull's triangles and bones; graded
 *     against each kind's model by tools/instruments/sizeclass.test.mjs, the
 *     same numbers as tools/tier0/budgets.json);
 *   - the encounter rule (`ENCOUNTER`, `encounterVerdict`, `encounterAllows`):
 *     within 60 m, one large plus four medium or small, or the colossus plus
 *     three sentries. A group with no large and no colossal kind in it is not
 *     capped here (a herd or a swarm is sized by its own doctrine row);
 *   - which kinds an Undercut kills outright (`combat/kit.js isSmallKind`).
 *
 * Published on the manager by `installInstruments`:
 *   machines.sizeClassOf(kind) -> 'small' | 'medium' | 'large' | 'colossal' | null
 *   machines.sizeClasses        { [kind]: class }   (frozen)
 *   machines.classCaps          CLASS_CAPS
 *   machines.encounterRule      ENCOUNTER
 *   machines.encounterAudit()  -> encounterVerdict over the living roster
 *   machines.encounterAllows(kind, x, z) -> { ok, why }  (asked by ai/doctrine.js spawnExpansion and ai/sites.js
 *                               respawns before they spawn; a gate's or a stager's own machines.spawn never is)
 * and each kind's class carries `Cls.sizeClass` (a live machine's is
 * `m.constructor.sizeClass`).
 *
 * This module imports nothing, so node can load it for its test.
 */

export const SIZE_CLASSES = Object.freeze(['small', 'medium', 'large', 'colossal']);

/** Footfall weight class (the audio bank's mstep/* sets) by size class. */
export const WEIGHT_BY_CLASS = Object.freeze({ small: 'light', medium: 'medium', large: 'heavy', colossal: 'heavy' });

/** Per-class caps: one hull's triangles and bones, and how many hulls of the class one encounter may hold. */
export const CLASS_CAPS = Object.freeze({
  small: Object.freeze({ triangles: 25000, bones: 20 }),
  medium: Object.freeze({ triangles: 50000, bones: 30 }),
  large: Object.freeze({ triangles: 80000, bones: 40 }),
  colossal: Object.freeze({ triangles: 150000, bones: 64 }),
});

/**
 * The encounter rule. `radius` m around the biggest hull present:
 *   large:    at most 1 large and `others` medium or small (in any mix)
 *   colossal: 1 colossal and at most `escorts` of the `escortRole` kind, nothing else
 */
export const ENCOUNTER = Object.freeze({
  radius: 60,
  large: Object.freeze({ large: 1, others: 4 }),
  colossal: Object.freeze({ colossal: 1, escorts: 3, escortRole: 'sentry' }),
});

export const isSizeClass = (c) => SIZE_CLASSES.includes(c);
export const weightOf = (cls) => WEIGHT_BY_CLASS[cls] ?? null;
export const capsOf = (cls) => CLASS_CAPS[cls] ?? null;

/** { [kind]: class } from kind descriptors; an undeclared or unknown class is null (and listed in `undeclared`). */
export function buildSizeClasses(descriptors) {
  const classes = {};
  const undeclared = [];
  for (const d of descriptors || []) {
    if (!d?.id) continue;
    if (isSizeClass(d.sizeClass)) classes[d.id] = d.sizeClass;
    else { classes[d.id] = null; undeclared.push(d.id); }
  }
  return { classes: Object.freeze(classes), undeclared };
}

const dist2 = (a, b) => { const dx = a.x - b.x; const dz = a.z - b.z; return dx * dx + dz * dz; };

/**
 * Grade a set of hulls against the encounter rule.
 *
 *   members  [{ kind, x, z }]  (living hulls only: the caller filters)
 *   classOf  (kind) -> class | null
 *   roleOf   (kind) -> role id | null   (only the colossal row reads it)
 *
 * Each large or colossal hull is an anchor; the hulls within ENCOUNTER.radius
 * of it are its encounter. Returns { ok, anchors: [{ kind, x, z, cls, large,
 * colossal, others, escorts, strangers, ok, why }], unclassed: [kind] }.
 */
export function encounterVerdict(members, classOf, roleOf = () => null) {
  const list = (members || []).filter((m) => m && Number.isFinite(m.x) && Number.isFinite(m.z));
  const r2 = ENCOUNTER.radius * ENCOUNTER.radius;
  const unclassed = [...new Set(list.filter((m) => !isSizeClass(classOf(m.kind))).map((m) => m.kind))].sort();
  const anchors = [];
  for (const a of list) {
    const cls = classOf(a.kind);
    if (cls !== 'large' && cls !== 'colossal') continue;
    const near = list.filter((m) => m !== a && dist2(m, a) <= r2);
    const count = (c) => near.filter((m) => classOf(m.kind) === c).length;
    const row = { kind: a.kind, x: a.x, z: a.z, cls, large: count('large'), colossal: count('colossal'), others: 0, escorts: 0, strangers: 0, ok: true, why: [] };
    if (cls === 'large') {
      row.large += 1;
      row.others = count('small') + count('medium');
      if (row.large > ENCOUNTER.large.large) row.why.push(`${row.large} large within ${ENCOUNTER.radius} m (cap ${ENCOUNTER.large.large})`);
      if (row.others > ENCOUNTER.large.others) row.why.push(`${row.others} medium or small within ${ENCOUNTER.radius} m (cap ${ENCOUNTER.large.others})`);
      if (row.colossal) row.why.push('a colossal kind within the radius of a large one');
    } else {
      row.colossal += 1;
      row.escorts = near.filter((m) => roleOf(m.kind) === ENCOUNTER.colossal.escortRole).length;
      row.strangers = near.length - row.escorts;
      if (row.colossal > ENCOUNTER.colossal.colossal) row.why.push(`${row.colossal} colossal within ${ENCOUNTER.radius} m (cap ${ENCOUNTER.colossal.colossal})`);
      if (row.escorts > ENCOUNTER.colossal.escorts) row.why.push(`${row.escorts} ${ENCOUNTER.colossal.escortRole} escorts (cap ${ENCOUNTER.colossal.escorts})`);
      if (row.strangers) row.why.push(`${row.strangers} hull(s) that are not ${ENCOUNTER.colossal.escortRole} escorts`);
    }
    row.ok = row.why.length === 0;
    anchors.push(row);
  }
  return { ok: anchors.every((a) => a.ok), anchors, unclassed };
}

/**
 * May one more hull of `kind` stand at (x, z)? True when the roster with it
 * added breaks the rule at no anchor that the roster without it satisfied
 * (so a roster already over the cap is not made worse, and a spawn far from
 * any large hull is always allowed).
 */
export function encounterAllows(members, kind, x, z, classOf, roleOf = () => null) {
  const before = encounterVerdict(members, classOf, roleOf);
  const after = encounterVerdict([...(members || []), { kind, x, z }], classOf, roleOf);
  const key = (a) => `${a.kind}@${a.x},${a.z}`;
  const wasBad = new Set(before.anchors.filter((a) => !a.ok).map(key));
  const broken = after.anchors.filter((a) => !a.ok && !wasBad.has(key(a)));
  return { ok: broken.length === 0, why: broken.flatMap((a) => a.why) };
}
