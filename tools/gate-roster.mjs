/**
 * GATE ROSTER — who a gate stages, by ROLE, never by species (plan §9 intro,
 * §3.2 `ctx.machines.roles`, rulings R7, R18, R28, R30).
 *
 * Round 4's gates named HZD kinds by literal (57 gates said one sentry kind,
 * 29 the flanker, 19 the colossus ...). Round 5 replaces every kind, so a gate
 * that names a species is a gate that silently stops gating. This module is the
 * one place a gate learns WHAT to stage:
 *
 *   ROSTER    page-context prelude (splice it into an async gate body). Resolves
 *             `ctx.machines.roles` (instruments-core, W0a) into
 *               KIND[role]      the live non-legacy kind id, or null
 *               ROLE_NOTE[role] why it is null (named note, R18)
 *             and the helpers below. It never infers a role from a kind name.
 *   staged()  node-side wrapper: `staged(['sentry'], '(async () => {...})()')`
 *             returns an assert that reports the R18 / R28 / R30 SKIP (with a
 *             named note, never PASS) when a role has no live kind, and runs the
 *             body otherwise with `KIND.<role>` in scope.
 *   stagedSetup()  the same for a `setup` string (a missing role makes it a no-op).
 *   HERO      page-context prelude: the protagonist's bones and dyn_ chains read
 *             from the animator (`animator.b.<key>`, `animator.chainOf(cls)`),
 *             so no gate names a rig's bone literal (A-gates-no-hero-literals).
 *
 * SKIP labels (A-carried-suite counts each, never as PASS):
 *   SKIP-legacy-deleted (R30)  the role's Round-4 kind was IP and is deleted at
 *                              W0a (sentry, flanker, heavy, colossus) and its
 *                              replacement has not landed (Plumb W1, Sickle and
 *                              Screed W2, Transit W4)
 *   SKIP-legacy (R28)          the role's Round-4 kind still runs as legacy
 *                              content, which is never mapped to a role
 *   SKIP-R18                   no kind for the role yet, or `ctx.machines.roles`
 *                              is not published in this tree
 *
 * MECHANICS VALIDATION ONLY: `CAL_GATE_ROLE_OVERRIDE='{"herd":"<kind>",...}'`
 * maps roles to kinds for one run so a re-staged gate can be proven to still
 * measure what its Round-4 version measured. Every result produced under it is
 * tagged `roleOverride` in its detail, and A-carried-suite refuses to grade
 * such a report. It is not a verdict mode (R28).
 */

/** The twelve role ids (bible §7.4 / §10.2). None matches the forbidden HZD role words. */
export const ROLES = ['sentry', 'herd', 'swarm', 'flanker', 'heavy', 'keeper', 'duelist',
  'artillery', 'support', 'spotter', 'ambusher', 'colossus'];

/** What a role reports while it has no live kind — a static fact per role, no species names. */
export const ROLE_PENDING = {
  sentry: { label: 'SKIP-legacy-deleted (R30)', until: 'Plumb, instruments-a W1' },
  flanker: { label: 'SKIP-legacy-deleted (R30)', until: 'Sickle, instruments-b W2' },
  heavy: { label: 'SKIP-legacy-deleted (R30)', until: 'Screed, instruments-b W2' },
  colossus: { label: 'SKIP-legacy-deleted (R30)', until: 'Transit, instruments-d W4' },
  herd: { label: 'SKIP-legacy (R28)', until: 'Tiller fixture, instruments-core W0a' },
  swarm: { label: 'SKIP-legacy (R28)', until: 'Peg, instruments-a W1' },
  keeper: { label: 'SKIP-legacy (R28)', until: 'Gauge, instruments-b W2' },
  duelist: { label: 'SKIP-legacy (R28)', until: 'Spindle, instruments-c W3' },
  artillery: { label: 'SKIP-legacy (R28)', until: 'Kiln, instruments-c W3' },
  spotter: { label: 'SKIP-legacy (R28)', until: 'Sonde, instruments-c W3' },
  ambusher: { label: 'SKIP-legacy (R28)', until: 'Dredge, instruments-d W4' },
  support: { label: 'SKIP-R18', until: 'Davit, instruments-c W3' },
};

let OVERRIDE = null;
try {
  OVERRIDE = process.env.CAL_GATE_ROLE_OVERRIDE ? JSON.parse(process.env.CAL_GATE_ROLE_OVERRIDE) : null;
} catch (err) {
  console.error(`[gate-roster] CAL_GATE_ROLE_OVERRIDE is not JSON (${err.message}); ignored`);
}
if (OVERRIDE) {
  console.error(`[gate-roster] ROLE OVERRIDE ACTIVE — mechanics validation only, not a verdict run: ${JSON.stringify(OVERRIDE)}`);
}
export const ROLE_OVERRIDE = OVERRIDE;

/**
 * Page-context prelude. Must be spliced inside an `async` function body (it
 * declares consts; it does not await). Accepts every published shape of
 * `ctx.machines.roles` the contract allows: a plain object or Map of
 * `role -> kind | null | { kind, note }`, or an object with `get(role)`.
 */
export const ROSTER = `
      /* __R5_ROSTER__ (tools/gate-roster.mjs) */
      const __rC = window.__CTX__;
      const __rSrc = __rC?.machines?.roles ?? null;
      const __rOverride = ${JSON.stringify(OVERRIDE)};
      const __rPending = ${JSON.stringify(ROLE_PENDING)};
      const KIND = {}, ROLE_NOTE = {};
      for (const r of ${JSON.stringify(ROLES)}) {
        let v = null;
        try { v = __rSrc ? (typeof __rSrc.get === 'function' ? __rSrc.get(r) : __rSrc[r]) : null; } catch (e) { v = null; }
        let kind = null, note = null;
        if (typeof v === 'string') kind = v;
        else if (v && typeof v === 'object') { kind = typeof v.kind === 'string' ? v.kind : null; note = v.note || null; }
        if (__rOverride && typeof __rOverride[r] === 'string') { kind = __rOverride[r]; note = 'ROLE OVERRIDE (mechanics validation, not a verdict)'; }
        if (kind && !(__rC?.machines?.kinds || []).includes(kind)) { note = 'role ' + r + ' maps to ' + kind + ', which is not in ctx.machines.kinds'; kind = null; }
        const pend = __rPending[r] || { label: 'SKIP-R18', until: 'its Instruments lane' };
        KIND[r] = kind;
        ROLE_NOTE[r] = kind ? { label: null, text: note } : { label: pend.label, text: 'role ' + r + ': '
          + (note || (__rSrc ? 'no live kind yet' : 'ctx.machines.roles is not published in this tree (instruments-core W0a)'))
          + ' (lands with ' + pend.until + ')' };
      }
      /** null when every role resolves, else the SKIP result (named note, never PASS). */
      const roleSkip = (...roles) => {
        const miss = roles.flat().filter((r) => !KIND[r]);
        if (!miss.length) return null;
        const labels = [...new Set(miss.map((r) => ROLE_NOTE[r].label))];
        return { pass: null, detail: labels.join(' + ') + ': ' + miss.map((r) => ROLE_NOTE[r].text).join('; ') };
      };
      /** the first / every living machine of a role's kind */
      const liveOf = (role, filter) => (__rC.machines?.list || []).find((m) => m.alive && m.kind === KIND[role] && (!filter || filter(m))) || null;
      const livesOf = (role) => (__rC.machines?.list || []).filter((m) => m.alive && m.kind === KIND[role]);
      const spawnRole = (role, x, z, opts) => __rC.machines.spawn(KIND[role], x, z, opts);
      /** every live non-legacy kind (R7 / R28: role-staged gates never stage a legacy kind) */
      const STAGED_KINDS = [...new Set(Object.values(KIND).filter(Boolean))];
      const roleOfKind = (k) => Object.keys(KIND).find((r) => KIND[r] === k) || null;
      /**
       * A kind for a gate whose subject is "any machine" (the A90 family, a respawn):
       * the first role that resolves. Never a legacy kind (R28): with no role
       * resolved it returns kind null and the caller skips that step and says so.
       */
      const anyKind = () => {
        for (const r of ['herd', 'sentry', 'swarm', 'flanker', 'keeper', 'duelist', 'heavy', 'artillery', 'spotter', 'support', 'ambusher', 'colossus']) {
          if (KIND[r]) return { kind: KIND[r], role: r, source: 'role:' + r };
        }
        return { kind: null, role: null, source: 'none: no role resolves in this tree (R28 never stages a legacy kind)' };
      };
      /**
       * The A90 family's respawn, exactly as inventory Appendix B re-stages it ("kind swap only":
       * "swap to a new-roster kind (or machines.kinds[0])", bars unchanged): ONE kind for the whole
       * loop, the first role that resolves, else ctx.machines.kinds[0]. Every kill is followed by a
       * respawn, as in Round 4, in every merge order; there is no kill-only loop (it sheds ~1,200
       * scene objects and would hide a per-kill leak of that size behind the +60 bar).
       * Measured (gates-perf W0a fix round 1): respawning the kind just killed instead is a
       * DIFFERENT workload: it first-spawns ~11 kinds, each filling a lazy per-kind geometry cache
       * once (+0..+8 geometries per kind, equal on a second cycle), which the Round-4 bars were
       * never calibrated for. { kind: null } only when nothing was killed or no kind exists.
       */
      const memRespawn = (killedKind) => {
        if (!killedKind) return { kind: null, source: 'none: nothing was killed' };
        const a = anyKind();
        if (a.kind) return { kind: a.kind, source: a.source };
        const k0 = (__rC.machines?.kinds || [])[0] || null;
        return k0 ? { kind: k0, source: 'kinds[0]: ctx.machines.kinds[0] (no role resolves; Appendix B "or machines.kinds[0]")' }
          : { kind: null, source: 'none: ctx.machines.kinds is empty' };
      };
      /** the workload record every A90-family row reports and grades (respawns must equal kills) */
      const memWorkload = () => ({ kills: 0, respawned: 0, respawnFailed: 0, kinds: {}, sources: {} });
      const memRespawnAfter = (W, killedKind, x, z) => {
        if (!killedKind) return null;
        const rk = memRespawn(killedKind);
        W.sources[rk.source.split(':')[0]] = (W.sources[rk.source.split(':')[0]] || 0) + 1;
        let s = null;
        try { s = rk.kind ? __rC.machines.spawn(rk.kind, x, z) : null; } catch (e) { s = null; }
        if (s) { W.respawned++; W.kinds[rk.kind] = (W.kinds[rk.kind] || 0) + 1; } else W.respawnFailed++;
        return s;
      };
      /** null when the Round-4 workload ran (every kill respawned), else the result that replaces PASS */
      const memWorkloadVerdict = (W, minKills) => {
        if (W.kills === 0) return { pass: null, detail: { verdict: 'SKIP-R18: no live machine in the world to run the A90 kill -> respawn workload on', workload: W } };
        if (W.respawned !== W.kills || W.kills < minKills) return { pass: false, detail: { verdict: 'FAIL: the workload is not the Round-4 kill -> respawn loop: ' + W.kills + ' kills (min ' + minKills + '), ' + W.respawned + ' respawned, ' + W.respawnFailed + ' spawn(s) failed on a live kind', workload: W } };
        return null;
      };
      /**
       * The live machine of a role, or one spawned for the gate (dx/dz from the
       * player) when the world has none of that kind standing. null if the role
       * has no kind or the spawn failed. Every gate runs on a fresh page, so a
       * staged spawn never outlives its gate.
       */
      const stageRole = async (role, { dx = 14, dz = 14, wait = 700, filter } = {}) => {
        let m = liveOf(role, filter);
        if (m || !KIND[role]) return m;
        const pp = __rC.player.position;
        try { m = spawnRole(role, pp.x + dx, pp.z + dz); } catch (e) { m = null; }
        if (m) await new Promise((r) => setTimeout(r, wait));
        return m && m.alive ? m : null;
      };
      /** null, or the named SKIP when NO role resolves (an every-kind gate stages Round-5 kinds only, R7/R28). */
      const noKindsSkip = () => STAGED_KINDS.length ? null : { pass: null, detail: 'SKIP-R18: no role resolves to a live non-legacy kind in this tree, and every-kind gates stage Round-5 kinds only (R7, R28): '
        + (__rSrc ? 'ctx.machines.roles maps every role to null' : 'ctx.machines.roles is not published (instruments-core W0a)') };
      /** One living machine of every staged kind, sorted by kind; a kind with none standing is spawned 30 m out. */
      const stagedPicks = (filter) => {
        const out = [];
        for (const k of [...STAGED_KINDS].sort()) {
          let m = (__rC.machines?.list || []).find((x) => x.alive && x.kind === k && (!filter || filter(x)));
          if (!m) {
            const pp = __rC.player.position;
            try { m = __rC.machines.spawn(k, pp.x + 30 + 6 * out.length, pp.z + 30); } catch (e) { m = null; }
            if (m && filter && !filter(m)) m = null;
          }
          if (m) out.push(m);
        }
        return out;
      };
      const __roleMark = (res) => {
        if (!__rOverride || !res || typeof res !== 'object') return res;
        res.detail = (res.detail && typeof res.detail === 'object' && !Array.isArray(res.detail))
          ? { ...res.detail, roleOverride: __rOverride }
          : { roleOverride: __rOverride, result: res.detail };
        return res;
      };`;

const isIife = (s) => /^\s*\(/.test(s);

/**
 * Wrap an assert expression so it SKIPs (R18/R28/R30) when any of `roles`
 * has no live kind. `body` is an expression string, normally `(async () => {...})()`.
 */
export function staged(roles, body) {
  return `(async () => {${ROSTER}
      const __skip = roleSkip(${JSON.stringify(roles)});
      if (__skip) return __skip;
      return __roleMark(await ${body.trim()});
    })()`;
}

/**
 * The shot a SKIPped visual gate takes: the skip note written over the frame,
 * so a judge (and the lane) can never grade an unstaged scene as the subject.
 * Also left on `window.__R5_SKIP__`.
 */
export const SKIP_CARD = `
      const __skipCard = (detail) => {
        window.__R5_SKIP__ = detail;
        const d = document.createElement('div');
        d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#101418;color:#f2ead3;'
          + 'font:600 22px/1.5 ui-monospace,Menlo,monospace;padding:48px;white-space:pre-wrap';
        d.textContent = 'VISUAL GATE NOT STAGED — no subject in this frame\\n\\n' + detail;
        document.body.appendChild(d);
      };`;

/** Same for a `setup` string: statements, or an IIFE expression (awaited). A skip draws the SKIP card. */
export function stagedSetup(roles, setup = '') {
  const run = !setup ? '' : isIife(setup) ? `await ${setup.trim()};` : setup;
  return `(async () => {${ROSTER}${SKIP_CARD}
      { const __s = roleSkip(${JSON.stringify(roles)}); if (__s) { __skipCard(__s.detail); return; } }
      ${run}
    })()`;
}

/**
 * The protagonist, read from the animator — never a bone literal.
 *   HB(key)        bone for an animator key (`pelvis`, `head`, `handR`, `handL`, `clavL`, `upArmR`, ...)
 *   HBN(key)       that bone's name (for APIs that take a name, e.g. `getBoneWorld`)
 *   chainOf(cls)   the dyn_ chain of a class: `animator.chainOf(cls)` when the
 *                  rig profile publishes it (hero-body W0b), else the longest
 *                  discovered chain of that class (`animator._chains[].cls.name`)
 *                  → { root, links: [bone...], n, published }
 *   chainLink(cls, i)  bone i along that chain (clamped)
 *   chainBones(cls)    every dyn_ bone of that class (all chains)
 *   HERO_CHAINS    the class names this rig carries
 */
export const HERO = `
      /* __R5_HERO__ (tools/gate-roster.mjs) */
      const __hAn = window.__CTX__?.player?.animator;
      const HB = (k) => __hAn?.b?.[k]?.bone || null;
      const HBN = (k) => HB(k)?.name || null;
      const __chainBones = (c) => (c?.links || []).map((l) => l.bone || l).filter(Boolean);
      const chainOf = (cls) => {
        if (typeof __hAn?.chainOf === 'function') {
          const pub = __hAn.chainOf(cls);
          if (pub) {
            const links = Array.isArray(pub) ? pub : (pub.links ? __chainBones(pub) : (pub.isBone ? [pub] : []));
            if (links.length) return { root: links[0], links, n: links.length, published: true };
          }
        }
        let best = null;
        for (const c of (__hAn?._chains || [])) {
          if (c.cls?.name !== cls) continue;
          if (!best || c.links.length > best.links.length) best = c;
        }
        if (!best) return null;
        const links = __chainBones(best);
        return { root: links[0], links, n: links.length, published: false };
      };
      const chainLink = (cls, i) => { const c = chainOf(cls); return c ? c.links[Math.max(0, Math.min(c.n - 1, i))] : null; };
      const chainBones = (cls) => (__hAn?._chains || []).filter((c) => c.cls?.name === cls).flatMap(__chainBones);
      const HERO_CHAINS = [...new Set((__hAn?._chains || []).map((c) => c.cls?.name).filter(Boolean))];`;
