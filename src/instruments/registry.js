import { registerKindTables } from '../entities/machines/ai/tables.js';
import { registerDoctrine } from '../entities/machines/ai/doctrine.js';
import { registerRig } from '../entities/machines/autorig.js';
import { loadKindModels } from '../entities/machines/variety-assets.js';
import { ROLE_IDS, buildRoles } from './roles.js';
import { CLASS_CAPS, ENCOUNTER, buildSizeClasses, encounterVerdict, encounterAllows } from './lib/sizeclass.js';

/**
 * INSTRUMENT KIND AUTO-REGISTRATION (instruments-core, Round 5; contract
 * "kind auto-registration", plan §3.2; gates `A-kind-registration`,
 * `A-roles-published`).
 *
 * Drop a module into `src/instruments/kinds/` and it is a live kind: no edit to
 * a kept file. Vite's `import.meta.glob` finds it at build/serve time. A module
 * is a KIND MODULE if its default export is a descriptor with an `id`; any other
 * file there (a species' helper module) is skipped.
 *
 * Descriptor (default export):
 *   id          kind id = `machine.kind` (lower-case, never a role id, never a
 *               legacy kind id)
 *   Cls         the Machine subclass
 *   spec        asset row { url, targetHeight, yaw, shadowPolicy? }
 *   onEntry?    (entry) => void, run once on the loaded asset entry
 *               (e.g. `lib/generated.js` `liftExtras`)
 *   style?      `styleMachine` row (donor models only; generated kinds omit it)
 *   role?       one of ROLE_IDS (roles.js)
 *   sizeClass   'small' | 'medium' | 'large' | 'colossal' (lib/sizeclass.js; bible §7.4). Required: a kind
 *               that declares none is warned about and is classed null (never guessed)
 *   fixture?    true for a W0 staging fixture (R28)
 *   tables?     `registerKindTables` rows { perception, engage, attacks,
 *               attackMode, react, elem, alarm, escort, scavenger }
 *   rig?        `autorig.RIGS` row (generated kinds usually read
 *               `entry.r5Rig` in their constructor instead)
 *   doctrine?   `registerDoctrine` row { body, herd, reband, components,
 *               install, spawn: [...] }
 *   audio?      { set, mass } — the audio lane's set id for this kind
 *   height?     metres at scale 1 (P-03: hero-body's big-fight framing; W1 grant)
 *
 * Published on the manager:
 *   machines.instrumentKinds   { [id]: descriptor }   (frozen after install)
 *   machines.roles / roleNotes / roleIds / roleOf(kind)      (roles.js)
 *   machines.kindAudio         { [id]: audio row }
 *   machines.isLegacyKind(kind) -> boolean   (true for every kind NOT here)
 *   machines.sizeClassOf(kind) / sizeClasses / classCaps / encounterRule / encounterAudit() / encounterAllows(kind, x, z)
 *                              (lib/sizeclass.js)
 *
 *   installInstruments(machines) -> { kinds, roles, ready: Promise<{ loaded, failed }> }
 */
const MODULES = import.meta.glob('./kinds/*.js', { eager: true });

function collect() {
  const out = [];
  for (const [path, mod] of Object.entries(MODULES)) {
    const d = mod?.default;
    if (!d || typeof d !== 'object' || !d.id) continue;
    if (typeof d.Cls !== 'function' || !d.spec?.url) {
      console.warn(`[instruments] ${path}: kind '${d.id}' has no class or no spec.url — skipped`);
      continue;
    }
    out.push({ ...d, source: path });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

let _rowsInstalled = false;

export function installInstruments(machines) {
  const descriptors = collect();
  const kinds = {};
  for (const d of descriptors) kinds[d.id] = d;

  if (!_rowsInstalled) {
    for (const d of descriptors) {
      if (d.tables) registerKindTables(d.id, d.tables);
      if (d.rig) registerRig(d.id, d.rig);
      registerDoctrine(d.id, d.doctrine || {});
    }
    _rowsInstalled = true;
  }

  const { roles, notes } = buildRoles(descriptors);
  machines.instrumentKinds = Object.freeze(kinds);
  machines.roles = roles;
  machines.roleNotes = notes;
  machines.roleIds = ROLE_IDS;
  machines.roleOf = (kind) => ROLE_IDS.find((r) => machines.roles[r] === kind) ?? null;
  machines.kindAudio = Object.freeze(Object.fromEntries(descriptors.map((d) => [d.id, d.audio || null])));
  machines.isLegacyKind = (kind) => !kinds[kind];
  /**
   * Size classes (lib/sizeclass.js): the declared class of each kind, the per-class caps and the encounter rule.
   * The class also rides the kind's class (`Cls.sizeClass`), so a live machine's is `m.constructor.sizeClass`.
   */
  const sized = buildSizeClasses(descriptors);
  if (sized.undeclared.length) console.warn(`[instruments] no sizeClass declared by: ${sized.undeclared.join(', ')} (lib/sizeclass.js)`);
  for (const d of descriptors) if (sized.classes[d.id]) d.Cls.sizeClass = sized.classes[d.id];
  machines.sizeClasses = sized.classes;
  machines.sizeClassOf = (kind) => sized.classes[kind] ?? null;
  machines.classCaps = CLASS_CAPS;
  machines.encounterRule = ENCOUNTER;
  /** The living Instruments as encounter members ({ kind, x, z }); legacy kinds are never counted. Cold path. */
  const members = () => (machines.list || []).filter((m) => m && m.alive !== false && !m._disposed && kinds[m.kind])
    .map((m) => ({ kind: m.kind, x: m.position.x, z: m.position.z }));
  /** The living roster graded against the encounter rule (one large + four medium or small in 60 m). */
  machines.encounterAudit = () => encounterVerdict(members(), machines.sizeClassOf, machines.roleOf);
  /**
   * May the world spawn one more `kind` at (x, z)? The spawners (ai/doctrine.js spawnExpansion, ai/sites.js respawns)
   * ask before they spawn; a gate's or the frame stager's own `machines.spawn` is never held back.
   */
  machines.encounterAllows = (kind, x, z) => encounterAllows(members(), kind, x, z, machines.sizeClassOf, machines.roleOf);
  /** P-03 (instruments-a W1): an Instrument kind's height (m, scale 1), or null; a live machine's own is `m.height`. */
  machines.heightOf = (kind) => (kinds[kind] && Number.isFinite(kinds[kind].height) ? kinds[kind].height : null);

  const rows = {};
  for (const d of descriptors) rows[d.id] = { spec: d.spec, style: d.style, bake: false };
  const ready = loadKindModels(machines.ctx, rows, {
    onLoaded: (id, entry) => {
      const d = kinds[id];
      if (d.onEntry && entry.instrumentEntry !== id) {
        d.onEntry(entry);
        entry.instrumentEntry = id;
      }
      machines.registerKind(id, d.Cls);
    },
  }).then((res) => {
    /**
     * A role maps to a LIVE kind (A-roles-published): a kind whose model did
     * not load is not live, so its role goes back to null with the reason in
     * the note instead of pointing a gate at something it cannot spawn.
     */
    if (res.failed.length) {
      const live = descriptors.filter((d) => !res.failed.includes(d.id));
      const rebuilt = buildRoles(live);
      const notes = { ...rebuilt.notes };
      for (const d of descriptors) {
        if (res.failed.includes(d.id) && d.role) notes[d.role] = `R18: kind '${d.id}' registered but its model (${d.spec.url}) did not load`;
      }
      machines.roles = rebuilt.roles;
      machines.roleNotes = Object.freeze(notes);
    }
    return res;
  });
  return { kinds: Object.keys(kinds), roles, ready };
}
