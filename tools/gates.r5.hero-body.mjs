/**
 * ROUND 5 — lane `hero-body` gate file (W0b): Brea on the kept rig.
 *
 *   node tools/gates.mjs --port 5252 --extra tools/gates.r5.hero-body.mjs --lane hero-body
 *
 * WHAT IS IN HERE (plan §9 hero-body + the fix-round-1 additions, 58 gates):
 *   - the Round-4 rows hero-body shadows (plan §9 table: the gates.config animator
 *     rows, anim-core A26, player-anim, player-control), taken VERBATIM from
 *     gates-perf's re-staged `tools/gates.r5.carried.mjs` (roles, places and
 *     `animator.b.*` / `chainOf()` names — no species, coordinates or bone
 *     literals), re-laned to `hero-body`, with the W0b bar changes:
 *       A13-no-skate      5/5 runs on Brea (R27); staged on the flattest clear
 *                         strip with every machine frozen and none within 15 m
 *       A35-cheek-anchor  the -0.55 up-aim pitch added (four pitches)
 *       A16-draw-anchor   + the launch clause (arrow within 0.3 deg of the ray)
 *       A19, A33-hair     staged on the flat strip (A19: chainOf hair/cloth/gear)
 *       V13               aim held every frame, the aim point frozen before the
 *                         lens moves; a red STAGING FAILED caption if not aiming
 *       V23               filmed from her LEFT (all four chains), sun on that side
 *   - this lane's new gates (A-lmax-solve, A-draw-elbow-level, A-wrap-clear,
 *     A-alidade-pose, A-run-arms, A31g, A-climb-1m, A-slide, A-player-mods,
 *     A-ride-hook, A-input-actions, A-face-delta, A-brea-contrast, A-hero-draws,
 *     A-outfit-merge-dispose, V-brea-one-glance, V-brea-face, V-traversal) and,
 *     fix round 1, A-lance-stow (R10 in motion, the judges' request).
 *   Fix round 2 (Oct 22): A17's flourish is counted on the SIM clock (R11:
 *     animator updates inside the beat; rendered frames reported beside it);
 *     A35's band is graded on the Head JOINT (plan §9 "|hand_r - head|, UBC
 *     Head sits at the skull base"), the skull-ellipsoid centre Round 4 read
 *     and the Round-4-equivalent point reported; A-draw-elbow-level reports,
 *     per row, the failing clause(s) and the least head-plane depth any elbow
 *     on the arm's roll circle could reach under the two form bars;
 *     A-run-arms' backswing windows span 1.2 stride cycles (the bar unchanged).
 *   Fix round 3 (Oct 22, rulings R35-R38): A-draw-elbow-level encodes R35
 *     exactly (the hand never > 0.10 m behind the head plane AND always in
 *     front of the back of the skull, the elbow <= 0.20 m) and grades the
 *     LOOSE on every sim step (the hand in front of the back of the skull, the
 *     elbow <= 0.20 m) at the four pitches, strafing both ways, and from a jog
 *     and a sprint; V12's criteria are R37's (run-side.jpg, 10-30 deg lean);
 *     V23 films from her front-left three-quarter, closer; A-hero-draws and
 *     A-input-actions grade their binding clauses and report the other
 *     lane's clause DEFERRED by name under R38 (the held Sabina bow: armory
 *     W1 exit; the settings rebind list: shell-ui W2 exit) — a deferred
 *     clause is not a W0b failure, and is graded here the moment its piece
 *     exists. A31c-clamp-framing failed at the W0-day1 baseline: R36 lists it
 *     (must not get worse), it is not a W0b exit blocker.
 *
 * TWO RUNNERS. Under gates-perf's registry (`gates.config.mjs` auto-discovers
 * `tools/gates.r5.*.mjs`), every row here shadows the carried row of the same
 * id (plan §3.3) and `--extra` is redundant. Under the Round-4 runner (main
 * until gates-perf merges) the base `gates.config.mjs` and the round4 lane
 * files are merged BEFORE `--extra`, and a duplicate id keeps the FIRST row; so
 * this module shadows in place instead: a base gates.config row with the same
 * id is REPLACED in its own array object (the runner shares those objects), and
 * a round4-file row (already copied by the runner) is run here under
 * `<id>@hero` so `--lane hero-body` still runs this lane's version.
 *
 * The vendored helpers below (gate-roster, gate-places, budgets) are copies of
 * gates-perf's W0a files, which are not in main yet; drop them for imports once
 * those merge (the orchestrator folds this lane's rows back into carried.mjs at
 * the W0b exit, plan §3.3).
 */
import { CANON_SPEEDS } from './gate-speeds.mjs';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawnSync } from 'child_process';
import os from 'os';
import path from 'path';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));

/* ===================== vendored: tools/gate-roster.mjs (gates-perf W0a) ==================== */
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
const ROLES = ['sentry', 'herd', 'swarm', 'flanker', 'heavy', 'keeper', 'duelist',
  'artillery', 'support', 'spotter', 'ambusher', 'colossus'];

/** What a role reports while it has no live kind — a static fact per role, no species names. */
const ROLE_PENDING = {
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
const ROLE_OVERRIDE = OVERRIDE;

/** How long the roster prelude waits for `ctx.machines.varietyReady` before it reports the roster not ready. */
const ROSTER_READY_MS = 45000;

/**
 * Page-context prelude. Must be spliced inside an `async` function body (it
 * declares consts and AWAITS readiness). Accepts every published shape of
 * `ctx.machines.roles` the contract allows: a plain object or Map of
 * `role -> kind | null | { kind, note }`, or an object with `get(role)`.
 *
 * READINESS (W0b fix round 1). The role map is complete only once every kind
 * registrar has run (`ctx.machines.varietyReady`): read at boot, the Tiller
 * fixture is not registered yet and `herd` read "not in ctx.machines.kinds" or
 * "maps every role to null", so a role-staged row reported a SKIP that hid its
 * real result (the W0b judges found it in the perf rows; the first sealed
 * carried run of this round showed it in A47c, A49, A62, A63, A75, A76, A76b and
 * V5). The prelude now waits up to ROSTER_READY_MS. Not ready by then, or a
 * role the published map points at a kind that is still not registered, makes
 * `roleSkip` return a FAIL by name (`pass: false`), never a SKIP; `stagedSetup`
 * throws it (the visual row is an ERROR, not a SKIP card).
 */
const ROSTER = `
      /* __R5_ROSTER__ (tools/gate-roster.mjs) */
      const __rT0 = performance.now();
      while (window.__CTX__?.machines && !window.__CTX__.machines.varietyReady && performance.now() - __rT0 < ${ROSTER_READY_MS}) {
        await new Promise((r) => setTimeout(r, 100));
      }
      const __rReady = !!window.__CTX__?.machines?.varietyReady;
      const __rWaitMs = Math.round(performance.now() - __rT0);
      const __rUnregistered = [];
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
        if (kind && !(__rC?.machines?.kinds || []).includes(kind)) { note = 'role ' + r + ' maps to ' + kind + ', which is not in ctx.machines.kinds'; __rUnregistered.push(r + ' -> ' + kind); kind = null; }
        const pend = __rPending[r] || { label: 'SKIP-R18', until: 'its Instruments lane' };
        KIND[r] = kind;
        ROLE_NOTE[r] = kind ? { label: null, text: note } : { label: pend.label, text: 'role ' + r + ': '
          + (note || (__rSrc ? 'no live kind yet' : 'ctx.machines.roles is not published in this tree (instruments-core W0a)'))
          + ' (lands with ' + pend.until + ')' };
      }
      /** null when every role resolves, else the SKIP result (named note, never PASS); a roster that is not
       *  ready, or a requested role mapped to an unregistered kind, is a FAIL by name instead (pass: false). */
      const roleSkip = (...roles) => {
        const miss = roles.flat().filter((r) => !KIND[r]);
        if (!miss.length) return null;
        if (!__rReady && __rC?.machines) return { pass: false, detail: 'FAIL (infra: roster not ready): ctx.machines.varietyReady still false after ' + __rWaitMs + ' ms; roles ' + miss.join(', ') + ' could not be read' };
        const broken = miss.filter((r) => __rUnregistered.some((u) => u.startsWith(r + ' -> ')));
        if (broken.length) return { pass: false, detail: 'FAIL: ctx.machines.roles maps a role to a kind that is not registered after varietyReady (instruments-core contract): ' + __rUnregistered.filter((u) => broken.some((r) => u.startsWith(r + ' -> '))).join(', ') };
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
function staged(roles, body) {
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
const SKIP_CARD = `
      const __skipCard = (detail) => {
        window.__R5_SKIP__ = detail;
        const d = document.createElement('div');
        d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#101418;color:#f2ead3;'
          + 'font:600 22px/1.5 ui-monospace,Menlo,monospace;padding:48px;white-space:pre-wrap';
        d.textContent = 'VISUAL GATE NOT STAGED — no subject in this frame\\n\\n' + detail;
        document.body.appendChild(d);
      };`;

/** Same for a `setup` string: statements, or an IIFE expression (awaited). A skip draws the SKIP card. */
function stagedSetup(roles, setup = '') {
  const run = !setup ? '' : isIife(setup) ? `await ${setup.trim()};` : setup;
  return `(async () => {${ROSTER}${SKIP_CARD}
      { const __s = roleSkip(${JSON.stringify(roles)}); if (__s) { if (__s.pass === false) throw new Error(__s.detail); __skipCard(__s.detail); return; } }
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
const HERO = `
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

/* ===================== vendored: tools/gate-places.mjs (gates-perf W0a) ==================== */
/**
 * GATE PLACES — where a gate stages, by NAME, never by coordinate (plan §9
 * intro, §3.2 `ctx.props.gatePlaces`).
 *
 * Round 4's gates teleported to literal coordinates of the old valley map (the
 * flat meadow strip, the 56 deg face, the west herd, the camp ...). Round 5
 * replaces the map at W1, so a coordinate in a gate is a gate that silently
 * measures the wrong ground. Every gate now asks for a NAMED place:
 *
 *   1. `ctx.props.gatePlaces[name]` — published by the build (world-props, W1
 *      day 1; `A-gate-places-published`). Authoritative whenever present.
 *   2. The W0 MAP TABLE below — the same names, authored once for the map this
 *      tree ships until world-ground's W1 terrain lands. It is used ONLY while
 *      the live terrain matches the W0 map's height signature, so a gate can
 *      never teleport onto coordinates of a map that is gone.
 *   3. Neither → the gate reports `SKIP-R18 (place)` with a named note.
 *
 * `rest` and `restSite` come from the page's own `src/world/island/sites.js`
 * (the module instance the game imported), so they follow world-ground's move
 * of REST to Saltrow at W1 with no table edit.
 *
 * Place record: `{ x, z, yaw?, pitch?, r?, ... , note }`. `yaw` is the camera
 * yaw (`player.camYaw`) the gate faces; a list place (e.g. `grassPoints`) is
 * `{ points: [{x, z}, ...] }`. Every name below is a contract for world-props'
 * `gatePlaces` (docs/ROUND5-GATES-PERF.md §places lists their meaning).
 */


/**
 * The W0 map (the Round-4 valley at PLAY_RADIUS 330). Heights measured on this
 * tree with `terrain.getHeight` (Oct 15, port 5255): if any of these three
 * reads more than 5 cm off, the table is not this map's and is not used.
 */
const W0_SIGNATURE = [
  [-60, -45, -1.267],
  [118, 220, 9.474],
  [-205, -55, -2.346],
];

/** name -> record, for the W0 map only. Comments say what the place IS, so world-props can re-author it. */
const W0_PLACES = {
  // a flat strip with ≥ 60 m of clear running along +Z (camYaw π faces +Z); the
  // animator gates' sprint/strafe/draw course
  openGround: { x: -60, z: -45, yaw: Math.PI, note: 'flat meadow strip, clear run along +Z' },
  // the spawn vista A9/A21 measure: a wide view over the playable world from near the spawn
  spawnVista: { x: 0, z: 0, yaw: Math.PI, pitch: 0.06, note: 'map centre facing the valley (Round-4 spawn vista)' },
  // open grazing ground where a herd of 6 + 2 escorts stands in one frame (A21 herd scenario)
  herdSite: { x: -205, z: -55, note: 'west meadow herd ground' },
  // flat ground with room for an 8-machine arc 9-17 m ahead (A21 staged fight)
  fightGround: { x: 0, z: 0, yaw: Math.PI, pitch: 0.05, note: 'flat ground at the map centre' },
  // the map's signature water feature, framed (V8; used when the water system publishes no pool)
  waterFeature: { x: -60, z: 20, yaw: 4.7, pitch: 0.2, note: 'dry riverbed cut' },
  // a tree line against open sky in the upper-left screen quadrant (V20 crops 140,300 400x225 px)
  aaRidgeView: { x: 0, z: 0, yaw: Math.PI, pitch: -0.03, note: 'pine ridge against sky from the map centre' },
  // the open-ground spot facing a flat, single-surface bearing clear for >= 50 m (A33 sprints down it)
  runway: { x: -60, z: -45, yaw: Math.PI * 0.5, len: 50, note: 'open-ground spot facing due -X: flat, grass, fast for 50 m' },
  // a > 50 deg terrain face the player cannot sprint up (A29, A31b)
  steepFace: { x: 118, z: 220, note: 'terrace lip, 56 deg over ~1.5 m of its fall line' },
  // flat, clear ground away from any herd where one machine is staged for a melee/stealth duel (A49, A50)
  duelGround: { x: -60, z: -60, note: 'flat clear meadow, away from the herd' },
  // flat, clear, well-lit ground for a filmed hit or chase on one machine (V28, V29)
  impactGround: { x: -70, z: -70, note: 'flat clear meadow, the impact/carry film spot' },
  // a target spot with >= 55 m of flat, unobstructed sight line along +Z (A52 shoots from 55 m)
  rangeGround: { x: -80, z: -80, note: 'flat meadow with 55 m of open sight line along +Z' },
  // a water-cut channel: x-range to scan for its lowest line, z stations to sample, and the z of the V32 shot
  riverChannel: { x0: -200, x1: -60, zs: [-120, 0, 120], zShot: -20, note: 'the dry west river channel' },
  // a rock surface zone (A58 zone probe)
  rockShelf: { x: 150, z: 95, note: 'SE rocky-highland shelf' },
  // a dense-grass meadow spot (A58 zone probe; A59 bare-ground frame)
  grassSite: { x: -60, z: -90, note: 'meadow, dense grass' },
  // six grass points spread over the map for near-tier density (A59)
  grassPoints: { points: [[-60, -90], [-30, -40], [88, 34], [-110, -90], [44, -74], [-160, 90]], note: 'six meadow points' },
  // a spot near the rest site facing the map's boundary massif (V33): look.dy is metres above the spot's ground
  rimView: { x: 22, z: -6, look: { x: 22, z: -330, dy: 120 }, note: 'north of the camp palisade, facing the north rim' },
  // one station from which four bearings 90 deg apart run out to different biomes (V44)
  biomeStation: { x: 30, z: -60, note: 'valley-floor station, four bearings 35/125/215/305 deg' },
  // inside the play radius facing the boundary wall the player walks into (A62)
  rimFace: { x: 0, z: -300, look: { x: 0, z: -420, dy: 40 }, note: 'r=300 at the north wall' },
  // an open sunlit ground frame used as the luminance reference (A62)
  litMeadowRef: { x: -40, z: -60, look: { x: -32, z: -52, dy: -2 }, note: 'lit meadow reference frame' },
  // a view of the boundary wall's bedding planes (A63): look.y is absolute
  rimStrata: { x: 0, z: -250, look: { x: 0, y: 80, z: -400 }, note: 'facing the north wall strata' },
  // a raised platform that casts a clean ground shadow: footprint centre and platform height h (A55)
  shadowCaster: { x: 33, z: -14, h: 5.05, note: 'hunters watchtower platform, 5.05 m' },
  // somewhere to park the hero out of every measurement frame (A55)
  parkAway: { x: -120, z: 120, note: 'open meadow far from the light probes' },
  // a station with open sight lines 240-290 m out on all bearings (A57 aerial perspective)
  aerialStation: { x: 0, z: 0, note: 'map centre with 240-290 m sight lines on 8 bearings' },
  // a low rise open on all four bearings to 150-300 m (V34)
  midgroundVista: { x: -20, z: 20, note: 'low rise NW of the camp, open on four bearings' },
  // where to park the hero out of every GTAO measurement frame
  gtaoPark: { x: 52, z: 24, note: 'player parking east of the camp, out of the GTAO frames' },
  // four long cross-map nav legs [x0, z0, x1, z1], each between two walkable land points >= 150 m apart,
  // crossing the valley floor, the river cut and the rock highland (A25b; Round 4's legs: from the
  // open-ground strip, the rest site, the SE rock shelf and a NW meadow point)
  navLegs: { legs: [[-60, -45, 120, -120], [22, 30, -205, -55], [150, 95, 30, -220], [-160, 90, 135, -35]],
    note: 'four cross-map nav legs between walkable land points' },
  // open walkable ground with a clear 34 m run east AND west of it, no blocker inside 8 m (A25b
  // registers a blocker there, paths through it, removes it and paths again)
  navProbe: { x: 0, z: 0, note: 'open ground at the map centre, clear 34 m east and west' },
  // a station whose camera, looking up at `look`, frames the boundary massif's CREST LINE against
  // open sky across most of the frame width (V7: the skyline must be in frame, not a wall of rock)
  ringSkyline: { x: 0, z: 0, look: { x: 0, z: 330, dy: 105 }, note: 'map centre facing the south massif, crest against sky' },
};

/** Every name a gate may ask for (the gatePlaces contract world-props publishes at W1). */
const PLACE_KEYS = ['rest', 'restSite', ...Object.keys(W0_PLACES)];

/**
 * Page-context prelude. Splice inside an `async` body (it awaits one dynamic
 * import of sites.js). Defines:
 *   PLACE(name)          record or null
 *   placeSkip(...names)  null, or the SKIP-R18 (place) result naming what is missing
 *   standAt(p, name, { dx, dz, yaw })  teleport the player onto the place (snap
 *                        to ground, zero velocity, face its yaw unless yaw: false)
 *   PLACES_SOURCE        'ctx.props.gatePlaces' | 'W0 map table' | 'none'
 */
const PLACES = `
      /* __R5_PLACES__ (tools/gate-places.mjs) */
      const __pC = window.__CTX__;
      const __pPub = __pC?.props?.gatePlaces || null;
      const __pT = __pC?.terrain;
      const __pW0 = ${JSON.stringify({ sig: W0_SIGNATURE, places: W0_PLACES })};
      const __pW0ok = !!__pT?.getHeight && __pW0.sig.every(([x, z, h]) => Math.abs(__pT.getHeight(x, z) - h) < 0.05);
      let __pSites = null;
      try { __pSites = await import('/src/world/island/sites.js'); } catch (e) { __pSites = null; }
      const PLACES_SOURCE = __pPub ? 'ctx.props.gatePlaces' : __pW0ok ? 'W0 map table' : 'none';
      const PLACE = (k) => {
        if (k === 'rest' && __pSites?.REST) return { x: __pSites.REST.x, z: __pSites.REST.z, note: 'sites.js REST' };
        if (k === 'restSite' && __pSites?.REST_SITE) return { ...__pSites.REST_SITE, note: 'sites.js REST_SITE' };
        if (__pPub && __pPub[k] != null) return __pPub[k];
        if (__pW0ok && __pW0.places[k]) return __pW0.places[k];
        return null;
      };
      const placeSkip = (...keys) => {
        const miss = keys.flat().filter((k) => !PLACE(k));
        return miss.length ? { pass: null, detail: 'SKIP-R18 (place) ' + miss.join(', ') + ': not in ctx.props.gatePlaces (world-props W1) and the W0 map table does not match this terrain' } : null;
      };
      const standAt = (p, k, o = {}) => {
        const s = PLACE(k);
        p.position.set(s.x + (o.dx || 0), 0, s.z + (o.dz || 0));
        p.velocity?.set?.(0, 0, 0);
        p._snapToGround?.();
        if (o.yaw !== false && (o.yaw != null || s.yaw != null)) p.camYaw = o.yaw ?? s.yaw;
        return s;
      };`;

const isIifeP = (s) => /^\s*\(/.test(s);

/** Wrap an assert expression so it SKIPs when a named place is unavailable. */
function placed(names, body) {
  return `(async () => {${PLACES}
      const __pskip = placeSkip(${JSON.stringify(names)});
      if (__pskip) return __pskip;
      return await ${body.trim()};
    })()`;
}

/** Same for a `setup` string: a missing place draws the SKIP card (gate-roster SKIP_CARD) and stages nothing. */
function placedSetup(names, setup = '') {
  const run = !setup ? '' : isIifeP(setup) ? `await ${setup.trim()};` : setup;
  return `(async () => {${PLACES}${SKIP_CARD}
      { const __s = placeSkip(${JSON.stringify(names)}); if (__s) { __skipCard(__s.detail); return; } }
      ${run}
    })()`;
}

/* ===================== vendored: tools/budgets.mjs (gates-perf W0a) ====================== */
/**
 * ONE budget file (perf-tech-02). Every performance gate reads its numbers
 * from here; nothing hard-codes a threshold in a gate body. Run it directly
 * (`npm run budgets`) to print the contract.
 *
 * Where the numbers come from — measured on the Round 3 build, spawn vista,
 * 1600x900, `renderer.info.autoReset = false` accumulated per frame:
 *
 *   draw calls          464   (241 of them the shadow pass, 223 everything else)
 *   triangles           6.33 M
 *   p95 frame @ DPR 2   18.5 ms on an idle box, 31+ ms with two other GPU
 *                       clients on the same machine
 *
 * The Round 4 targets below are what the audit's §4 A21 spec asks for. The
 * draw-call budget is the hard one: it is exact, deterministic and completely
 * independent of what else the machine is doing.
 *
 * FIX ROUND 1 — four corrections that cost the previous round its credibility.
 *
 * 1. WHERE THE FRAME GOES. The Round 4 build's post stack costs ~8 ms of GPU
 *    at applied DPR 1.5 (GTAO 2.8, SMAA 1.3, grade 0.8, bloom ~0, the rest is
 *    half-float bandwidth), measured with `engine.enableGpuTimer(true)` +
 *    `perfSnapshot().medianGpuMs`: everything-on 20.5 ms, post-off 12.6 ms.
 *    An earlier report claimed "<= 1 ms" from an A/B of rAF intervals. That
 *    number is wrong and nobody should plan against it: rAF deltas are
 *    vsync-quantised to 16.7 / 33.3 ms and cannot resolve an 8 ms difference.
 *    Downstream consequence: `world-light` has ~12 ms of the 20 ms frame to
 *    spend on CSM + fog, NOT ~19.
 *
 * 2. WHAT THE SCENARIOS MEASURE. They used to teleport the camera and sample
 *    whatever the AI had left in frame, which put +-30 % of drift on every
 *    number in A21 (the same scenario read 456 / 341 / 295 calls in one run).
 *    Each scenario now PLACES its cast at fixed world offsets and returns a
 *    pin closure that re-asserts those transforms after every render, so the
 *    composition is frozen while gait, skinning and the cull pass keep running
 *    at full cost. Filmed to prove the framing is what the name says:
 *    `shots/perf-spawn-vista.png`, `shots/perf-west-herd.png`,
 *    `shots/perf-staged-fight.png` — the west herd measurement really does
 *    look at eight machines between 9 and 45 m.
 *
 * 3. THE PIXEL COUNT HAS TO BE THE ONE ON THE LABEL. Dynamic resolution
 *    multiplies `basePixelRatio` by `renderScale`, so a burst labelled
 *    "DPR 1.5" could be sampling 1.05 under load with nothing in the output
 *    saying so. A21 now calls `engine.setDynamicResolution(false)` for the
 *    whole gate and reports `effectivePixelRatio` from the renderer itself.
 *    The engine half of the same bug was worse and is fixed in engine.js: the
 *    screen-space size cull measured projected size against the DRS-scaled
 *    drawing buffer, so a busy frame quietly deleted machine parts and made
 *    the draw-call count depend on GPU load. It reads the base resolution now.
 *
 * 4. A WALL CLOCK ONLY MEANS SOMETHING ON A BOX THAT CAN PRESENT A FRAME.
 *    A21 measures a NULL FRAME after every scenario — scene hidden, no post,
 *    no shadows, DPR 0.5, i.e. a clear and a present — and uses the worst of
 *    them. rAF is vsync-locked, so a healthy null frame reads ~16.7 ms; if it
 *    reads materially more, or the GPU timer still reports milliseconds with
 *    nothing drawn, another process owns the GPU and no wall-clock number from
 *    that run is attributable.
 *
 *    AN UNJUDGED TERM IS PENDING, NEVER PASS (fix round 2). When the clock
 *    terms are excluded the gate reports every frame/JS number exactly as
 *    measured, flags `clockTermsCounted: false`, and resolves `pass: null` —
 *    PENDING — so it can never read green on a term it did not judge. A red
 *    DETERMINISTIC term still FAILs on the spot: counters do not care how busy
 *    the box is, and they are the terms that are currently red. `A9-perf-budget`
 *    follows the same rule for its fps half.
 *
 *    The GPU timer is the one clock that can resolve what rAF quantises away,
 *    so it VOTES — but only when it witnesses itself: every per-scenario null
 *    frame under 3 ms AND the four bursts of one frozen composition agreeing
 *    within 1.4x. It measures elapsed time on the GPU TIMELINE, so it is
 *    inflated when our stream queues behind another client's (measured on this
 *    box: 42.8 then 70.8 ms for one identical configuration).
 *
 * WHO OWES THE DEFICIT. Staged west herd at applied DPR 1.5: ~480 calls
 * against a 350 budget. The gate now prints the exact per-owner ledger, taken
 * by wrapping `renderer.renderBufferDirect` (main pass vs shadow pass vs post,
 * bucketed by scene owner) — no estimates. It also prints `batchCeiling`: the
 * best a renderer-side BatchedMesh pass could ever do, computed from the live
 * scene by grouping every rigid, opaque, single-material mesh by material
 * SIGNATURE. Measured on this build: 396 machine meshes, 136 of them skinned
 * (unbatchable), 26 transparent, and the 234 rigid ones carry 58 distinct
 * signatures — so a perfect engine-side batch saves ~176 draws world-wide but
 * leaves the west herd over budget, because the herd's own cost is dominated
 * by skinned meshes with near-unique materials. The remedy is `machine-rig`
 * perf-tech-04 (offline LOD chains + skinned bounds) and perf-tech-14
 * (per-species mesh/material budgets). Until it lands, A21's call term stays
 * RED against core-platform's ledger and the gate names the owner in
 * `detail.blockedBy`.
 *
 * NOTHING IN THIS FILE MOVES TO MAKE A GATE GREEN.
 */



const BUDGETS = {
  /** Accumulated renderer.info.render.calls for one full frame (all passes). */
  drawCalls: 350,
  /** Accumulated triangles for one full frame. */
  triangles: 6_500_000,
  /** p95 of the rAF frame interval, milliseconds. */
  frameP95Ms: 20,
  /**
   * Median scene GPU time (EXT_disjoint_timer_query), milliseconds, at the shipped default tier
   * (plan §9 A21 re-cast: "median GPU <= 14 ms at the A-gpu-tier tier"; engine-gpu's W0b
   * A-gpu-tier chooses that tier). Round 4 graded the GPU term against frameP95Ms (20 ms).
   */
  gpuMedianMs: 14,
  /**
   * p95 of the JS half of the frame, milliseconds. "Half of the frame" means
   * the WHOLE main-loop callback: every system update in every fixed sub-step,
   * every `interpolate()`, the render submit and the frame tail. Round 4 judge
   * finding — A21 used to read `engine.render()`'s return value here, which is
   * the submit alone, so the systems this budget exists to bound were not in
   * the number. `engine.perfSnapshot().jsTerm` declares the coverage and A21
   * refuses to grade the term without it. The budget itself never moved.
   */
  jsP95Ms: 9,
  /** Frames sampled per burst, and bursts per measurement. */
  sampleFrames: 40,
  bursts: 4,
  /**
   * The gate measures on a simulated devicePixelRatio-2 display. The engine's
   * quality tier caps the applied pixel ratio (high = 1.5) — that cap IS the
   * perf-tech-05 fix, so the gate exercises it rather than bypassing it. The
   * raw uncapped DPR-2 numbers are reported alongside for the record, measured
   * from the SAME pinned scene rather than a minute later.
   */
  deviceDpr: 2,
  /** Shadow caster cull distance per tier, metres (perf-tech-03). */
  shadowCullDistance: { low: 70, medium: 95, high: 120, ultra: 190 },
  /** Programs compiled behind the loading bar (perf-tech-10). */
  warmUpMaxMs: 4000,
};

/**
 * W0b budgets (plan §4.2, §4.4, §9 gates-perf: `A-alloc-rate`, `A-vram-ledger`, `A90-abs`,
 * `A-unattributed-cap`). The numbers are the plan's, verbatim; the gates read them from here.
 * Units: 1 KB = 1024 B for allocation rates; 1 MB = 1e6 B and 1 GB = 1e9 B for memory (the
 * A-rt-ledger convention).
 */
const W0B_BUDGETS = Object.freeze({
  /** §9 A-alloc-rate: src/** <= 64 KB/s, no single src function > 4 KB/s, post-GC heap slope <= 0 */
  alloc: Object.freeze({ srcKBps: 64, fnKBps: 4, heapSlopeBps: 0, windowS: 10, warmupS: 3, samplingIntervalB: 2048, refFps: 60 }),
  /** §4.4 / §9 A-vram-ledger: textures <= 160 MB, render targets <= 170 MB (the A-rt-ledger cap), geometry <= 120 MB, sum <= 450 MB */
  vram: Object.freeze({ texturesB: 160e6, renderTargetsB: 170e6, geometryB: 120e6, totalB: 450e6 }),
  /** §9 A90-abs: post-GC JS heap <= 450 MB, Chrome GPU-process footprint <= 1.5 GB, after the A90 workload + 60 s of the staged fight */
  abs: Object.freeze({ heapB: 450e6, gpuProcessB: 1.5e9, fightS: 60, a90LoopS: 150, a90LifecycleS: 150, minKills: 25 }),
  /** §4.2 / §9 A-unattributed-cap: recorded at W0 (UNATTRIBUTED_CAP below), non-increasing every wave, <= 30 from the W2 exit */
  unattributed: Object.freeze({ w2Bar: 30 }),
});

/**
 * THE W0 UNATTRIBUTED-DRAW CAP (plan §4.2 row "unattributed scene children (measured at W0, capped
 * <= 30 by W2)"). Recorded once from a named staged-fight measurement of `A-unattributed-cap` (hide
 * each registered owner in turn); every later wave must measure <= `draws`, and <= 30 from the W2
 * exit. Never raised to make a gate green: a later wave that needs more draws fails.
 */
const UNATTRIBUTED_CAP = Object.freeze({
  W0: Object.freeze({
    draws: 16,
    runId: 'p5255-33343-1792428531490',
    confirmedBy: ['p5255-34463-1792428571168'],
    measured: '2026-10-19, port 5255 (gates-perf W0b fix round 1), A21 staged fight (8 casts of the herd role = the Tiller fixture, the other 7 roles named R18/R28/R30 fallbacks), tier high, pixel ratio 1.5, 1600x900; 335 draws/frame in all, post chain 22',
    method: 'the largest of: the plan\'s hide-each-owner residual (-2 / 3), the direct per-draw attribution (11 / 11), the drawing unregistered roots hidden together (16 / 16)',
    roots: 'datapoints (6 direct draws: progression, items/datapoints.js) + 5 unnamed meshes (5: the focus wave/ring/gather meshes of ui/focus.js, the combat trajectory/landing ring of combat/combat.js, the melee trail) — none carries an owner name yet',
  }),
});

/**
 * THE MEASURED RENDER-TARGET LEDGER (engine-gpu's leaf module; `A-rt-ledger` compares it owner by
 * owner against the live ledger). Re-exported here so every budget a gate reads comes from this
 * file; the leaf has no imports, so there is no import cycle with tools/gates.r5.engine-gpu.mjs.
 */
export { RT_LEDGER } from './r5-probes/rt-ledger.mjs';

/** How long STAGE_PRELUDE waits for `ctx.machines.varietyReady` before it refuses to cast (infra). */
const ROSTER_READY_TIMEOUT_MS = 45000;

/**
 * Page-context staging kit shared by every perf scenario (and available to any
 * other gate that needs a reproducible scene). Splice it inside an `async`
 * body, then eval the scenario expressions: `STAGE_PRELUDE + scenario` is
 * SELF-CONTAINED (plan §8.3 R34: engine-gpu's gates eval the scenarios with
 * this prelude alone). It brings its own role prelude (tools/gate-roster.mjs)
 * and place prelude (tools/gate-places.mjs) inside a private scope, so it
 * never collides with a gate that splices ROSTER / PLACES itself.
 *
 * READINESS (W0b judge finding: the staged fight was cast right after boot,
 * before the Instrument kinds had registered, so `herd -> tiller` read "not in
 * ctx.machines.kinds" and three rows reported a SKIP that hid real numbers).
 * The prelude first waits for `ctx.machines.varietyReady` (every kind
 * registrar has run) for up to ROSTER_READY_TIMEOUT_MS, and only then reads
 * the role map. Not ready by then -> `castPlan` returns
 * `{ fail: 'infra: roster not ready …' }` (a FAIL, never a SKIP). Once ready,
 * a role the published map points at a kind that is still not registered is
 * a contract break of `ctx.machines.roles` (instruments-core): `castPlan`
 * returns `{ fail }` naming it. Only a role whose map entry is null (no kind
 * yet: R18 / R28 / R30) is filled from the roles that have one, named.
 *
 * The important piece is `pinAll()`: it freezes the COMPOSITION, not the
 * simulation. Machine positions/headings and the camera are re-asserted in an
 * `engine.onAfterRender` hook, so the AI cannot walk the scene out from under a
 * measurement burst, while animation, skinning, the shadow-caster cull and the
 * screen-space cull all keep running at their true cost. It returns an unpin
 * function; every caller must call it.
 */
const STAGE_PRELUDE = `
  const __stage = await (async () => {
    const ctx = __CTX__;
    const __readyT0 = performance.now();
    while (!ctx.machines?.varietyReady && performance.now() - __readyT0 < ${ROSTER_READY_TIMEOUT_MS}) {
      await new Promise((r) => setTimeout(r, 100));
    }
    const ready = !!ctx.machines?.varietyReady;
    const readyWaitMs = Math.round(performance.now() - __readyT0);
    ${ROSTER}
    ${PLACES}
    /** roles the published map points at a kind that is NOT registered (read after readiness) */
    const mappedMissing = (() => {
      const src = ctx.machines?.roles ?? null, kinds = ctx.machines?.kinds || [], out = [];
      if (!src) return out;
      for (const r of ${JSON.stringify(ROLES)}) {
        let v = null;
        try { v = typeof src.get === 'function' ? src.get(r) : src[r]; } catch (e) { v = null; }
        const k = typeof v === 'string' ? v : (v && typeof v.kind === 'string' ? v.kind : null);
        if (k && !kinds.includes(k)) out.push(r + ' -> ' + k);
      }
      return out;
    })();
    const machines = () => (ctx.machines?.list || []).filter((m) => m.alive);
    const groundY = (x, z) => {
      const y = ctx.terrain?.getHeight?.(x, z);
      return Number.isFinite(y) ? y : 0;
    };
    /** Every machine back on its spawn point, calm, with a fixed heading. */
    const resetAll = () => {
      machines().forEach((m, i) => {
        if (m.spawnPos) m.position.set(m.spawnPos.x, m.spawnPos.y, m.spawnPos.z);
        m.position.y = groundY(m.position.x, m.position.z);
        m.heading = (i * 0.61) % (Math.PI * 2);
        // Do NOT null lastKnown: a kind's attack update may copy it unconditionally
        // once the machine is in attack (Round 4's sentry did), and a null there throws inside
        // Machines.update every frame (the guarded loop survives it, but a
        // throwing update is not a scene worth measuring). Reported to
        // machine-ai as a missing null guard.
        try { m.state = 'patrol'; m.suspicion = 0; } catch (e) { /* machine-ai owns these */ }
      });
    };
    /** Spawn order is fixed by the world seed, so slice(0, n) is stable. */
    const pick = (kind, n) => machines().filter((m) => m.kind === kind).slice(0, n);
    const place = (m, x, z, heading) => {
      m.position.set(x, groundY(x, z), z);
      m.heading = heading;
      try { m._speed = 0; } catch (e) { /* optional */ }
    };
    const lookAt = (x, z) => {
      const p = ctx.player;
      p.camYaw = Math.atan2(x - p.position.x, z - p.position.z) + Math.PI;
    };
    const pinAll = () => {
      const snap = machines().map((m) => ({
        m, x: m.position.x, y: m.position.y, z: m.position.z, h: m.heading,
      }));
      const p = ctx.player;
      const pp = { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.camYaw, pitch: p.camPitch };
      const fn = () => {
        for (let i = 0; i < snap.length; i++) {
          const s = snap[i];
          s.m.position.set(s.x, s.y, s.z);
          s.m.heading = s.h;
        }
        p.position.set(pp.x, pp.y, pp.z);
        p.camYaw = pp.yaw;
        p.camPitch = pp.pitch;
      };
      ctx.engine.onAfterRender.push(fn);
      return () => {
        const i = ctx.engine.onAfterRender.indexOf(fn);
        if (i >= 0) ctx.engine.onAfterRender.splice(i, 1);
      };
    };
    /**
     * R5: turn [[role, n], ...] into a per-role kind plan. A role without a
     * kind borrows, in order, from the roles that have one, and says so.
     * Every role missing -> { skip } carrying the roster's named note.
     * Not ready / a mapped kind not registered -> { fail } (never a SKIP).
     */
    const castPlan = (want) => {
      if (!ready) return { fail: 'infra: roster not ready: ctx.machines.varietyReady still false after ' + readyWaitMs + ' ms (the kind registrars have not finished), nothing cast' };
      if (mappedMissing.length) return { fail: 'FAIL: ctx.machines.roles maps a role to a kind that is not registered after varietyReady (contract break, instruments-core): ' + mappedMissing.join(', ') };
      const have = want.map(([r]) => r).filter((r) => KIND[r]);
      const pool = have.length ? have : Object.keys(KIND).filter((r) => KIND[r]);
      if (!pool.length) return { skip: roleSkip(...want.map(([r]) => r)).detail };
      const fallbacks = [];
      let k = 0;
      const rows = want.map(([role, n]) => {
        if (KIND[role]) return { role, kind: KIND[role], n };
        const from = pool[k++ % pool.length];
        fallbacks.push(role + ' -> ' + from + ' (' + KIND[from] + '): ' + (ROLE_NOTE[role].label || 'no kind'));
        return { role, kind: KIND[from], n };
      });
      return { rows, fallbacks };
    };
    /** The plan's machines: live ones first, the deficit spawned at (x, z). */
    const fill = (plan, x, z) => {
      const out = [];
      for (const row of plan.rows) {
        const got = machines().filter((m) => m.kind === row.kind && !out.includes(m)).slice(0, row.n);
        for (let i = got.length; i < row.n; i++) {
          let m = null;
          try { m = ctx.machines.spawn(row.kind, x + 3 * i, z + 3 * i); } catch (e) { m = null; }
          if (!m) break;
          got.push(m);
        }
        out.push(...got);
      }
      return out;
    };
    return { machines, resetAll, pick, place, lookAt, pinAll, groundY, castPlan, fill, casts: {},
      ready, readyWaitMs, mappedMissing, KIND, ROLE_NOTE, roleSkip, PLACE, placeSkip, standAt, PLACES_SOURCE };
  })();
`;

/**
 * Scenarios A21 walks. Each expression stages a fixed scene and evaluates to
 * the unpin function for it — `const unpin = eval(SC[name]); … ; unpin();` —
 * or, when its cast cannot be staged, to `{ skip: '<SKIP label>: <named note>' }`,
 * or, when the roster is not ready or broken, to `{ fail: '<why>' }` (a FAIL).
 * Every name they use comes from `__stage` (STAGE_PRELUDE), so
 * `STAGE_PRELUDE + scenario` evaluates on its own (R34).
 *
 * ROUND 5 RE-CAST (gates-perf W0a, plan §9 `A21-real-draw-calls`): the cast is
 * by ROLE (`__stage.KIND.<role>` from tools/gate-roster.mjs) and the stage by
 * PLACE (`__stage.PLACE(name)` / `__stage.standAt()` from tools/gate-places.mjs).
 * No species, no coordinate.
 *   vista         the spawn vista (gatePlaces.spawnVista), whatever the world has in view
 *   herd          herd x6 + sentry x2 at gatePlaces.herdSite
 *   staged-fight  colossus, heavy, artillery, duelist, sentry, herd, flanker, spotter in a
 *                 forward arc at gatePlaces.fightGround
 * A role with no live kind is filled from the roles that have one, and every
 * substitution is NAMED in `__stage.casts[scenario].fallbacks` (R18); a
 * scenario whose roles ALL lack a kind is skipped with the R18/R28/R30 note.
 * Legacy kinds are never cast (R28). Missing instances are spawned for the
 * scenario (every gate runs on a fresh page, so nothing outlives the gate).
 */
const PERF_SCENARIOS = {
  vista: `(() => {
    const ps = __stage.placeSkip('spawnVista');
    if (ps) return { skip: ps.detail };
    __stage.resetAll();
    const p = __CTX__.player;
    const s = __stage.standAt(p, 'spawnVista'); p.camPitch = s.pitch ?? 0.06;
    __stage.casts.vista = { cast: 'world as found', place: s.note || 'spawnVista' };
    return __stage.pinAll();
  })()`,

  herd: `(() => {
    // herd x6 + a sentry x2 escort at fixed offsets around gatePlaces.herdSite,
    // placed (not camera-only) so the AI cannot walk the scene out of frame.
    const want = [['herd', 6], ['sentry', 2]];
    const plan = __stage.castPlan(want);
    if (plan.skip || plan.fail) return plan;
    const ps = __stage.placeSkip('herdSite');
    if (ps) return { skip: ps.detail };
    __stage.resetAll();
    const HC = __stage.PLACE('herdSite');
    const OFF = [[0, 0], [6.5, 3], [-5, 4.5], [3, -6], [-7.5, -3], [9, -7.5], [-11, 1.5], [12.5, 6]];
    const herd = __stage.fill(plan, HC.x, HC.z);
    herd.forEach((m, i) => {
      const o = OFF[i] || [0, 0];
      __stage.place(m, HC.x + o[0], HC.z + o[1], (i * 0.8) % (Math.PI * 2));
    });
    const p = __CTX__.player;
    p.position.set(HC.x + 24, 0, HC.z + 24); p.camPitch = 0.06; p._snapToGround?.();
    __stage.lookAt(HC.x, HC.z);
    __stage.casts.herd = { cast: herd.map((m) => m.kind), fallbacks: plan.fallbacks, place: HC.note || 'herdSite' };
    return __stage.pinAll();
  })()`,

  'staged-fight': `(() => {
    // Deterministic: staged on flat ground (gatePlaces.fightGround) so the
    // scenario cannot inherit whatever biome the previous one left us in, one
    // machine per fighting role in a fixed order, topped up from the roles that
    // have a kind (named), so it is the same eight on every run.
    //
    // FIX ROUND 1 (kept): a forward arc, +-38 degrees (the camera's horizontal
    // half-FOV at 55 deg vertical / 16:9 is 42 deg), 9-17 m out in two ranks, so
    // all eight are inside the frustum.
    const order = ['colossus', 'heavy', 'artillery', 'duelist', 'sentry', 'herd', 'flanker', 'spotter'];
    const plan = __stage.castPlan(order.map((r) => [r, 1]));
    if (plan.skip || plan.fail) return plan;
    const ps = __stage.placeSkip('fightGround');
    if (ps) return { skip: ps.detail };
    __stage.resetAll();
    const p = __CTX__.player;
    const s = __stage.standAt(p, 'fightGround'); p.camPitch = s.pitch ?? 0.05;
    const cast = __stage.fill(plan, p.position.x, p.position.z);
    // camera forward for camYaw: (-sin, -cos) — see player.js _updateCamera
    const fx = -Math.sin(p.camYaw), fz = -Math.cos(p.camYaw);
    cast.slice(0, 8).forEach((m, i) => {
      const spread = (i - 3.5) / 3.5;                 // -1 .. 1 across the arc
      const a = Math.atan2(fx, fz) + spread * 0.66;   // +-38 degrees of forward
      const r = 9 + (i % 2) * 5.5 + (i % 4) * 1.1;    // two ranks, 9-17 m
      __stage.place(m, p.position.x + Math.sin(a) * r, p.position.z + Math.cos(a) * r, a + Math.PI);
      // A machine in the attack state reads lastKnown every frame; give it one.
      try {
        m.lastKnown = (m.lastKnown && m.lastKnown.copy) ? m.lastKnown.copy(p.position) : p.position.clone();
        m.state = 'attack'; m.alerted = true; m.suspicion = 1;
      } catch (e) { /* machine-ai owns these */ }
    });
    __stage.casts['staged-fight'] = { cast: cast.slice(0, 8).map((m) => m.kind), fallbacks: plan.fallbacks, place: s.note || 'fightGround' };
    return __stage.pinAll();
  })()`,
};


/* ================== carried: boxContention (gates.r5.carried.mjs, gates-perf) ================= */
function boxContention() {
  const load = os.loadavg().map((v) => +v.toFixed(2));
  let otherGateChromes = null;
  try {
    const ps = spawnSync('ps', ['-axww', '-o', 'pid=,ppid=,command='], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).stdout || '';
    otherGateChromes = ps.split('\n').filter((l) => /Chrome for Testing|chrome-headless-shell/.test(l) && !/--type=/.test(l)
      && /--remote-debugging/.test(l) && !new RegExp('^\\s*\\d+\\s+' + process.pid + '\\s').test(l)).length;
  } catch { otherGateChromes = null; }
  return { load, otherGateChromes, quiet: load[0] < 3 && otherGateChromes === 0, at: new Date().toISOString() };
}

/* ========================================================================== */
/* carried: re-staged Round-4 scopes (gates.r5.carried.mjs, gates-perf W0a)   */
/* ========================================================================== */
/* source: tools/gates.config.mjs (Round 4), re-staged for Round 5 */
/* ========================================================================== */
const __S_gates_config = await (async () => {
/**
 * Round 3 quality gates — the literal acceptance bar for every builder lane.
 *
 * ACTION gates: `assert` JS runs in page context (async supported, __CTX__/__GAME__
 * available) and must resolve to { pass: boolean, detail: any }. Console errors
 * during a gate = automatic FAIL. Gates whose required API is missing should
 * resolve { pass: null, detail: 'SKIP: <why>' } — reported as PENDING, not fail.
 *
 * VISUAL gates: capture a deterministic screenshot; `criteria` is the written
 * pass bar a human/judge-agent evaluates against the PNG.
 */


const INPUT_ON = `__CTX__.input.enabled = true;`;

/**
 * CANON SPEEDS COME FROM THE BUILD, NOT FROM A LITERAL IN THIS FILE.
 * The prelude moved to `tools/gate-speeds.mjs` so every LANE gate file can
 * import the same one instead of re-deriving the number by hand — see that
 * file for the full history, and `A81-canon-speed-bands` for the gate that
 * fails any assert which hard-codes a locomotion speed.
 */


/**
 * MEASURE A SPRINT ON GROUND THERE IS ROOM TO SPRINT ON.
 *
 * WHAT BROKE (core-platform-followup2). `A13`, `A19` and `A28` already staged
 * onto the flat meadow before running. `A3` and `A12` did not — they held W and
 * Shift from wherever the player spawned. Round 4 put a camp (tent, crates,
 * bedroll, all with collision) a few metres in front of the spawn point, so
 * those two gates stopped measuring the hero's sprint and started measuring the
 * tent: filmed at `shots/cpf2-sprint-probe.png` with `sprinting: true`,
 * `moveSpeed: 0.29`, the LOOT prompt up, and the player parked at (18.1, 32.1)
 * on every single attempt. The readings were 3.6 and 0.41 m/s.
 *
 * That is a gate failing a correct build, and worse, failing it in a way that
 * looks exactly like "the new canon speed broke the animator" — the reading is
 * far below 6.8 and the detail said nothing about a wall. The evidence that it
 * is the course and not the build: on the SAME build in the SAME run, the three
 * gates that do stage measured 6.19, 6.6 and 4.88 m/s and cleared their floors.
 *
 * No threshold moved. The gates just start where the other three start.
 */
const OPEN_GROUND =
  `standAt(p, 'openGround'); /* gatePlaces.openGround: flat, clear run along the place's yaw (R5: was a literal meadow coordinate) */
      await new Promise(r => setTimeout(r, 250));`;

/** Page-context helper: block until the variety machines have spawned. */
const WAIT_VARIETY = `
  const _t0 = performance.now();
  while (!__CTX__.machines?.varietyReady && performance.now() - _t0 < 25000) {
    await new Promise(r => setTimeout(r, 150));
  }`;

/** Page-context helper: one measurement burst of N rendered frames. */
const BURST = `
  const burst = async (n) => {
    const e = __CTX__.engine;
    e.perfReset();
    const f0 = e.frames;
    while (e.frames - f0 < n) await new Promise(r => requestAnimationFrame(r));
    return e.perfSnapshot(n);
  };
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };`;

/** Page-context helper: one living machine per species, nearest first. */
const SPECIES = `
  const species = new Map();
  for (const _m of (__CTX__.machines?.list || [])) {
    if (!_m.alive) continue;
    if (!species.has(_m.kind)) species.set(_m.kind, _m);
  }
  const V = __CTX__.player.position.constructor;`;

/**
 * Page-context helper: world-space hull boxes of a machine's meshes, and the
 * distance from a point to the nearest one (0 when inside). Cheap enough to
 * run per weak point and exact enough to catch an eye floating off a head.
 */
const HULL = `
  const hullBoxes = (m) => {
    const root = m.root || m.body; if (!root) return [];
    root.updateMatrixWorld(true);
    const boxes = [];
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.visible) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox; if (!bb) return;
      const mn = { x: 1e9, y: 1e9, z: 1e9 }, mx = { x: -1e9, y: -1e9, z: -1e9 };
      for (let i = 0; i < 8; i++) {
        const v = new V(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z)
          .applyMatrix4(o.matrixWorld);
        mn.x = Math.min(mn.x, v.x); mn.y = Math.min(mn.y, v.y); mn.z = Math.min(mn.z, v.z);
        mx.x = Math.max(mx.x, v.x); mx.y = Math.max(mx.y, v.y); mx.z = Math.max(mx.z, v.z);
      }
      boxes.push({ mn, mx });
    });
    return boxes;
  };
  const distToHull = (p, boxes) => {
    let best = 1e9;
    for (const b of boxes) {
      const dx = Math.max(b.mn.x - p.x, 0, p.x - b.mx.x);
      const dy = Math.max(b.mn.y - p.y, 0, p.y - b.mx.y);
      const dz = Math.max(b.mn.z - p.z, 0, p.z - b.mx.z);
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < best) best = d;
    }
    return best;
  };`;

/**
 * Page-context helper: get a species moving. Machines only walk when something
 * is worth walking towards, so the player is dropped 14 m away and given two
 * seconds to be noticed before sampling starts.
 */
const PROVOKE = `
  {
    const _p = __CTX__.player;
    _p.position.set(m.position.x + 14, 0, m.position.z + 14);
    _p._snapToGround?.();
    _p.camYaw = Math.atan2(m.position.x - _p.position.x, m.position.z - _p.position.z) + Math.PI;
    await new Promise(r => setTimeout(r, 2200));
  }`;

const GATES = [
  // ---------------- ACTION GATES ----------------
  {
    id: 'A90-memory-stability', kind: 'action', lane: 'core', timeout: 420000,
    title: 'Memory stays bounded: JS heap, geometries and textures do not grow across a 3-minute kill/loot/respawn loop',
    setup: INPUT_ON,
    settle: 2000,
    assert: `(async () => {${ROSTER}
      // R5: every kill is followed by a respawn of ONE kind, as in Round 4: a ROLE's kind when one
      // resolves, else ctx.machines.kinds[0] (memRespawn, tools/gate-roster.mjs; Appendix B "kind
      // swap only ... or machines.kinds[0]"). Never a kill-only loop, never a species literal.
      const W = memWorkload();
      const r = __CTX__.renderer || __CTX__.engine?.renderer;
      const mem = () => ({ heap: performance.memory?.usedJSHeapSize ?? null, geo: r.info.memory.geometries, tex: r.info.memory.textures, progs: r.info.programs?.length ?? null, objs: (() => { let n = 0; __CTX__.scene.traverse(() => n++); return n; })() });
      const kill = (m) => { let mesh = null; m.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; }); m.takeDamage({ point: m.position.clone(), object: mesh, impact: 99999, tear: 0, element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'hunter', baseDamage: 99999 }); };
      if (window.gc) window.gc();
      await new Promise(res => setTimeout(res, 1500));
      const a = mem();
      const t0 = performance.now(); let kills = 0;
      while (performance.now() - t0 < 150000) {
        const m = (__CTX__.machines?.list || []).find(x => x.alive);
        const killedKind = m ? m.kind : null;
        if (m) { kill(m); kills++; W.kills++; }
        __CTX__.input.keys.add('KeyW'); await new Promise(res => setTimeout(res, 2500)); __CTX__.input.keys.delete('KeyW');
        memRespawnAfter(W, killedKind, __CTX__.player.position.x + 30, __CTX__.player.position.z + 30);
        await new Promise(res => setTimeout(res, 2500));
      }
      // let the corpse lifecycle run: MachineSite disposal needs the player far away (~90 m)
      // and ~130 s; a leak is what REMAINS after that, not what is merely pending
      const p0 = __CTX__.player.position.clone();
      __CTX__.player.position.set(p0.x + 130, 0, p0.z + 130); __CTX__.player._snapToGround?.();
      await new Promise(res => setTimeout(res, 150000));
      const mid = mem();
      if (window.gc) window.gc();
      await new Promise(res => setTimeout(res, 1500));
      const b = mem();
      const heapGrowth = (a.heap && b.heap) ? (b.heap - a.heap) / a.heap : null;
      const geoGrowth = b.geo - a.geo, texGrowth = b.tex - a.tex, objGrowth = b.objs - a.objs;
      const pass = (heapGrowth === null || heapGrowth < 0.25) && geoGrowth <= 40 && texGrowth <= 8 && objGrowth <= 60;
      const detail = { kills, workload: W, before: a, afterLifecycle: b, atLoopEnd: mid, heapGrowthPct: heapGrowth === null ? 'n/a (enable --enable-precise-memory-info)' : +(heapGrowth * 100).toFixed(1), geoGrowth, texGrowth, objGrowth };
      const wv = memWorkloadVerdict(W, 25);
      if (wv) return { pass: wv.pass, detail: { ...detail, verdict: wv.detail.verdict } };
      return { pass, detail };
    })()`,
  },
  {
    id: 'A1-boot-clean', kind: 'action', lane: 'core',
    title: 'Game boots to playing state with zero console errors',
    settle: 1500,
    assert: `(async () => ({ pass: __CTX__.state === 'playing' || __CTX__.state === 'title', detail: 'state=' + __CTX__.state }))()`,
  },
  {
    id: 'A2-dodge-displacement', kind: 'action', lane: 'animator',
    title: 'Dodge roll displaces 1.5–6m horizontally within 1s and animator recovers',
    setup: INPUT_ON,
    settle: 400,
    assert: `(async () => {
      const p = __CTX__.player; const start = p.position.clone();
      ${''}
      __CTX__.input.keys.add('KeyW');
      await new Promise(r => setTimeout(r, 350));
      p.dodge ? p.dodge() : __CTX__.input._downHandlers.get('Space')?.forEach(f => f({}));
      await new Promise(r => setTimeout(r, 1000));
      const d = Math.hypot(p.position.x - start.x, p.position.z - start.z);
      const animOk = p.animator && !Number.isNaN(p.model.position.x);
      return { pass: d >= 1.5 && d <= 9 && animOk, detail: { displacement: +d.toFixed(2), animOk } };
    })()`,
  },
  {
    id: 'A3-sprint-speed', kind: 'action', lane: 'animator',
    title: 'Sprint sustains the published canon sprint speed (0.9–1.15 x player.speeds.sprint), measured in sim time',
    setup: INPUT_ON,
    settle: 200,
    /**
     * MEASURED IN SIM TIME, NOT WALL TIME (core-platform-followup2). Round 4's
     * fixed-step loop advances the simulation in 60 Hz slices with a cap on how
     * many it will run per rendered frame, so on a loaded box sim time falls
     * behind the wall clock — measured here at 14 fps: 0.90 s of sim in 1.50 s
     * of wall, which turned a correct 6.56 m/s sprint into a 3.94 m/s reading.
     * Dividing displacement by the wall clock therefore measures the neighbours'
     * CPU load, not the hero's speed, and this gate would fail every correct build
     * on a busy machine. engine.simTime is the clock the movement was integrated
     * against, so it is the clock the speed is computed on.
     */
    assert: placed(['openGround'], `(async () => {
      const p = __CTX__.player, e = __CTX__.engine;${CANON_SPEEDS}
      ${OPEN_GROUND}
      __CTX__.input.keys.add('KeyW'); __CTX__.input.keys.add('ShiftLeft');
      await new Promise(r => setTimeout(r, 2000));            // spin up to canon sprint
      const a = p.position.clone(), s0 = e.simTime, w0 = performance.now();
      await new Promise(r => setTimeout(r, 1500));
      const sim = e.simTime - s0, wall = (performance.now() - w0) / 1000;
      __CTX__.input.keys.clear();
      if (!(sim > 0.4)) return { pass: null, detail: { verdict: 'SKIP: sim advanced only ' + sim.toFixed(2) + 's in ' + wall.toFixed(2) + 's of wall clock — the box is too wedged to measure speed', sim, wall } };
      const v = Math.hypot(p.position.x - a.x, p.position.z - a.z) / sim;
      /**
       * DIAGNOSTIC ONLY — the pass bar above is untouched. A slow reading has
       * three very different causes and the old detail could not tell them
       * apart: the animator really is slow; the box is too wedged to measure
       * (covered by the sim-time SKIP above); or the hero is sprinting INTO
       * something and the gate is measuring a wall. The third is what a
       * straight-line KeyW sprint from spawn now hits — Round 4 put a camp tent
       * a few metres south of the spawn point, and a sprinting:true /
       * moveSpeed:0.29 reading pinned against it looks exactly like a broken
       * animator unless the detail says otherwise.
       */
      const intent = p.moveSpeed ?? null;
      // The sprint flag is still set (input was never released) but almost no
      // ground was covered: that is a wall, not a slow animator.
      const obstructed = !!p.sprinting && v < 0.4 * SPD.sprint;
      return { pass: v >= SPRINT_MIN && v <= SPRINT_MAX, detail: {
        speed: +v.toFixed(2), canonSprint: SPD.sprint,
        band: [+SPRINT_MIN.toFixed(2), +SPRINT_MAX.toFixed(2)],
        simS: +sim.toFixed(2), wallS: +wall.toFixed(2),
        sprinting: !!p.sprinting, moveSpeedAtEnd: intent === null ? null : +intent.toFixed(2),
        endPos: [+p.position.x.toFixed(1), +p.position.z.toFixed(1)],
        likelyObstructed: obstructed || undefined,
        note: obstructed ? 'sprint flag is set but displacement is near zero — the hero is running INTO something, not running slowly' : undefined,
      } };
    })()`),
  },
  {
    id: 'A4-draw-strength', kind: 'action', lane: 'combat',
    title: 'Aim + hold LMB reaches full draw within 1.6s',
    setup: INPUT_ON,
    settle: 300,
    assert: `(async () => {
      __CTX__.input.mouse.buttons |= 4;
      await new Promise(r => setTimeout(r, 250));
      __CTX__.input.mouse.buttons |= 1;
      const t0 = performance.now();
      let ds = 0;
      while (performance.now() - t0 < 1600) {
        ds = __CTX__.combat?.drawStrength ?? 0;
        if (ds >= 0.95) break;
        await new Promise(r => setTimeout(r, 60));
      }
      return { pass: ds >= 0.95, detail: { drawStrength: +ds.toFixed(2) } };
    })()`,
  },
  {
    id: 'A5-arrow-fired-event', kind: 'action', lane: 'combat',
    title: 'Releasing a full draw emits arrow-fired',
    setup: INPUT_ON,
    settle: 300,
    assert: `(async () => {
      let fired = null;
      __CTX__.events.on('arrow-fired', (e) => { fired = e; });
      __CTX__.input.mouse.buttons |= 4;
      await new Promise(r => setTimeout(r, 250));
      __CTX__.input.mouse.buttons |= 1;
      await new Promise(r => setTimeout(r, 1300));
      __CTX__.input.mouse.buttons &= ~1;
      await new Promise(r => setTimeout(r, 400));
      return { pass: !!fired, detail: fired ? { type: fired.type, draw: +(fired.drawStrength ?? 0).toFixed(2) } : 'no event' };
    })()`,
  },
  {
    id: 'A6-machine-foot-plant', kind: 'action', lane: 'machines',
    title: 'Walking machine stance feet sit on terrain (|footY - ground| ≤ 0.15m, slip < 0.2m)',
    settle: 500,
    assert: `(async () => {
      const list = __CTX__.machines?.list || [];
      const m = list.find(x => x.alive && x.debugFeet);
      if (!m) return { pass: null, detail: 'SKIP: no machine exposes debugFeet() yet (Round 3 machines contract)' };
      const samples = [];
      for (let i = 0; i < 12; i++) {
        const feet = m.debugFeet();
        for (const f of feet) if (f.planted) samples.push({
          err: Math.abs(f.world.y - __CTX__.terrain.getHeight(f.world.x, f.world.z)),
          x: f.world.x, z: f.world.z, name: f.name,
        });
        await new Promise(r => setTimeout(r, 120));
      }
      if (!samples.length) return { pass: null, detail: 'SKIP: no planted samples (machine idle?)' };
      const maxErr = Math.max(...samples.map(s => s.err));
      return { pass: maxErr <= 0.15, detail: { maxGroundErr: +maxErr.toFixed(3), samples: samples.length, kind: m.kind } };
    })()`,
  },
  {
    id: 'A7-alert-fsm', kind: 'action', lane: 'machines',
    title: 'The sentry escalates patrol → suspicious/alert when the player stands close',
    setup: INPUT_ON,
    settle: 300,
    assert: staged(['sentry'], `(async () => {
      const w = await stageRole('sentry');
      if (!w) return { pass: null, detail: 'SKIP: no living sentry (' + KIND.sentry + ') could be staged' };
      const p = __CTX__.player;
      p.position.set(w.position.x + 4, 0, w.position.z + 4);
      const t0 = performance.now();
      let st = w.state;
      while (performance.now() - t0 < 8000) {
        st = w.state;
        if (st !== 'patrol' && st !== 'return') break;
        await new Promise(r => setTimeout(r, 200));
      }
      return { pass: ['suspicious', 'alert', 'attack', 'search'].includes(st), detail: { finalState: st } };
    })()`),
  },
  {
    id: 'A8-death-collapse', kind: 'action', lane: 'machines',
    title: 'Lethal damage kills the sentry; corpse persists (no console errors, alive=false)',
    settle: 400,
    assert: staged(['sentry'], `(async () => {
      const w = await stageRole('sentry');
      if (!w) return { pass: null, detail: 'SKIP: no living sentry (' + KIND.sentry + ') could be staged' };
      let mesh = null; w.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
      const hit = { point: w.position.clone(), object: mesh, impact: 99999, tear: 0,
                    element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'hunter',
                    baseDamage: 99999 };
      w.takeDamage(hit);
      await new Promise(r => setTimeout(r, 2500));
      return { pass: w.alive === false && w.state === 'dead', detail: { alive: w.alive, state: w.state } };
    })()`),
  },
  {
    id: 'A9-perf-budget', kind: 'action', lane: 'core',
    title: 'R26 at the spawn vista: draw calls < 350, always graded; MEDIAN fps >= 58 over 3 s on a quiet box (1-minute load average < 3), else the fps half is PENDING',
    settle: 2000, timeout: 60000,
    /**
     * R5 (gates-perf W0a) — R26 replaces Round 4's "avg FPS >= 45": the bar is the MEDIAN
     * frame rate, 58, graded whenever the box is quiet, and "quiet" is R26's definition, the
     * 1-minute load average < 3, read in node at the moment the assert is handed to the page
     * (this is a getter: the registry and the carried list keep accessors, so it is read when
     * the gate runs, not when the suite loads). On a loud box (load >= 3) a median under 58 is
     * PENDING; a median >= 58 passes on any box; the draw-call bar grades on every box.
     * Round 4's empty-frame witness is still measured and reported, but it no longer turns a
     * quiet-box FAIL into a PENDING (R26 names load average as the quiet test).
     */
    get assert() {
      const { load, otherGateChromes } = boxContention();   // a puppeteer Chrome's MAIN process carries --remote-debugging; ours is a child of this runner
      return `(async () => {
      const LOAD = ${JSON.stringify(load)}, OTHER_CHROMES = ${JSON.stringify(otherGateChromes)};
      const QUIET = LOAD[0] < 3;                                    // R26
      const ctx = __CTX__, e = ctx.engine;
      const r = ctx.renderer || e?.renderer;
      if (e?.enableGpuTimer) e.enableGpuTimer(true);
      const dts = new Float64Array(2048);                           // preallocated: no per-frame allocation
      const sample = async (ms) => {
        let frames = 0, calls = -1, n = 0, last = 0; const t0 = performance.now();
        if (e?.perfReset) e.perfReset();
        await new Promise(res => {
          const tick = (now) => {
            frames++;
            if (last && n < dts.length) dts[n++] = now - last;
            last = now;
            calls = Math.max(calls, r?.info?.render?.calls ?? -1); // sample right after each render
            if (performance.now() - t0 >= ms) res(); else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        const snap = e?.perfSnapshot ? e.perfSnapshot(frames) : null;
        const sorted = Array.prototype.slice.call(dts, 0, n).sort((a, b) => a - b);
        const medDt = n ? (n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2) : null;
        return { avgFps: frames / ((performance.now() - t0) / 1000), medianFps: medDt ? 1000 / medDt : 0,
                 p95FrameMs: n ? +sorted[Math.min(n - 1, Math.floor(n * 0.95))].toFixed(2) : null,
                 frames, calls, gpuMs: snap ? snap.medianGpuMs : null };
      };
      const run = await sample(3000);
      const calls = run.calls, sceneGpuMs = run.gpuMs;
      const callsOk = calls > 0 && calls < 350;
      const fpsOk = run.medianFps >= 58;
      /*
       * Round 4's empty-frame witness (scene hidden, post off, shadows off, DPR 0.5), measured
       * when the fps half misses and reported for diagnosis: GPU milliseconds with NOTHING
       * drawn mean our command stream is queued behind another client. Under R26 it is
       * information only.
       */
      let nullFps = null, nullGpuMs = null;
      if (!fpsOk && e && e.composer && ctx.scene) {
        const keep = { dpr: e.basePixelRatio, gtao: e.gtao?.enabled, bloom: e.bloom?.enabled,
                       smaa: e.smaa?.enabled, shadows: r.shadowMap.enabled, vis: ctx.scene.visible,
                       drs: e.drsEnabled };
        try {
          if (e.setDynamicResolution) e.setDynamicResolution(false);
          if (e.gtao) e.gtao.enabled = false;
          if (e.bloom) e.bloom.enabled = false;
          if (e.smaa) e.smaa.enabled = false;
          r.shadowMap.enabled = false;
          ctx.scene.visible = false;
          e.basePixelRatio = 0.5; e.renderScale = 1; e.resize();
          await new Promise(res => setTimeout(res, 400));
          const nf = await sample(1500);
          nullFps = +nf.medianFps.toFixed(1);
          nullGpuMs = nf.gpuMs;
        } finally {
          ctx.scene.visible = keep.vis;
          if (e.gtao) e.gtao.enabled = keep.gtao;
          if (e.bloom) e.bloom.enabled = keep.bloom;
          if (e.smaa) e.smaa.enabled = keep.smaa;
          r.shadowMap.enabled = keep.shadows;
          e.basePixelRatio = keep.dpr; e.renderScale = 1; e.resize();
          if (e.setDynamicResolution) e.setDynamicResolution(keep.drs);
          await new Promise(res => setTimeout(res, 300));
        }
      }
      const contentionWitnessed = (nullFps != null && nullFps < 55) || (nullGpuMs != null && nullGpuMs > 3);
      const pass = !callsOk ? false : fpsOk ? true : QUIET ? false : null;
      const med = run.medianFps.toFixed(1);
      return { pass, detail: {
        drawCalls: calls, medianFps: +med, avgFps: +run.avgFps.toFixed(1), p95FrameMs: run.p95FrameMs, frames: run.frames,
        sceneGpuMs, callsOk, fpsOk, loadAverage: LOAD, quietBox: QUIET, otherGateChromes: OTHER_CHROMES,
        nullFrameFps: nullFps, nullFrameGpuMs: nullGpuMs, contentionWitnessed,
        bars: { drawCalls: '< 350 (always graded)', medianFps: '>= 58 on a quiet box (R26: 1-min load average < 3)' },
        verdict: !callsOk ? 'FAIL: drawCalls ' + calls + ' >= 350'
          : pass ? 'PASS: median ' + med + ' fps, ' + calls + ' draw calls'
          : pass === false ? 'FAIL: median ' + med + ' fps < 58 on a quiet box (load average ' + LOAD[0] + ' < 3, R26); scene GPU ' + sceneGpuMs + ' ms'
            + (contentionWitnessed ? '; the empty-frame witness also read ' + nullGpuMs + ' ms GPU / ' + nullFps + ' fps with nothing drawn (reported, not graded under R26)' : '')
          : 'PENDING: not a quiet box (R26): load average ' + LOAD[0] + ' >= 3, so the median ' + med + ' fps is not graded; draw calls ' + calls + ' inside budget',
      } };
    })()`;
    },
  },
  {
    id: 'A10-loot-single-render', kind: 'action', lane: 'hud',
    title: 'Looting shows exactly one loot surface (popup XOR toast stack, not both)',
    setup: INPUT_ON,
    settle: 400,
    assert: staged(['sentry'], `(async () => {
      if (!window.__HUD_DEBUG__?.lootSurfaces) return { pass: null, detail: 'SKIP: __HUD_DEBUG__ missing' };
      const w = await stageRole('sentry');
      if (!w) return { pass: null, detail: 'SKIP: no living sentry (' + KIND.sentry + ') could be staged' };
      let mesh = null; w.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
      w.takeDamage({ point: w.position.clone(), object: mesh, impact: 99999, tear: 0,
                     element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'hunter', baseDamage: 99999 });
      await new Promise(r => setTimeout(r, 2200));
      __CTX__.player.position.set(w.position.x + 0.8, 0, w.position.z + 0.8);
      const t0 = performance.now();
      let cur = null;
      while (performance.now() - t0 < 5000) {
        cur = __CTX__.interactables?.current;
        if (cur) break;
        await new Promise(r => setTimeout(r, 150));
      }
      if (!cur) return { pass: null, detail: 'SKIP: corpse interactable never became current' };
      __CTX__.input.keys.add('KeyE');            // real hold-to-interact path
      await new Promise(r => setTimeout(r, 900)); // hold 0.45s + margin
      __CTX__.input.keys.delete('KeyE');
      await new Promise(r => setTimeout(r, 400));
      const s = window.__HUD_DEBUG__.lootSurfaces();
      return { pass: s.popupVisible === true && s.toastCount === 0,
               detail: { popupVisible: s.popupVisible, toastCount: s.toastCount, label: cur.label } };
    })()`),
  },
  {
    id: 'A11-idle-alive', kind: 'action', lane: 'animator',
    title: 'Idle pose measurably changes over 5s (pelvis/hand world delta > 8mm) — no frozen mannequin',
    settle: 1200,
    assert: `(async () => {${HERO}
      const an = __CTX__.player.animator;
      if (!an?.getBoneWorld) return { pass: null, detail: 'SKIP: no getBoneWorld' };
      const v = (n) => { const o = new (__CTX__.player.position.constructor)(); an.getBoneWorld(n, o); return o.clone(); };
      const names = [HBN('pelvis'), HBN('handR'), HBN('head')];   // animator-published, never a rig literal
      if (names.some((n) => !n)) return { pass: null, detail: { verdict: 'SKIP: animator.b lacks pelvis/handR/head', names } };
      const base = names.map(v);
      // idle motion is oscillatory (weight-shift cycles return to base) — track the
      // PATH maximum over 6s, not the endpoint delta, or the gate is phase-flaky
      let max = 0;
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 500));
        names.forEach((n, j) => { max = Math.max(max, v(n).distanceTo(base[j])); });
      }
      return { pass: max > 0.008, detail: { maxPathMm: +(max * 1000).toFixed(1) } };
    })()`,
  },

  {
    id: 'A12-clip-driven', kind: 'action', lane: 'animator',
    title: 'Locomotion is mocap-clip driven: mixer advancing, Sprint_Loop dominant at the published canon sprint speed',
    setup: INPUT_ON,
    settle: 300,
    assert: placed(['openGround'], `(async () => {
      const an = __CTX__.player.animator, p = __CTX__.player;${CANON_SPEEDS}
      if (!an?.mixer) return { pass: null, detail: 'SKIP: animator exposes no AnimationMixer (procedural fallback)' };
      ${OPEN_GROUND}
      const t0 = an.mixer.time;
      __CTX__.input.keys.add('KeyW'); __CTX__.input.keys.add('ShiftLeft');
      await new Promise(r => setTimeout(r, 2000));
      const acts = Object.values(an.loco?.actions ?? {});
      // NB: the gait actions carry timeScale 0 because the blend scrubs their
      // .time from a shared phase, so isRunning() is false by construction —
      // isScheduled() is the predicate for "the mixer is evaluating this action"
      const live = acts.filter(a => a.isScheduled() && a.getEffectiveWeight() > 0.001);
      const dom = an.dominantAction();
      const spd = __CTX__.player.moveSpeed;
      const pass = an.mixer.time > t0 && live.length >= 1
        && !!dom && dom.clip === 'Sprint_Loop' && dom.weight > 0.6 && spd > SPRINT_MIN;
      return { pass, detail: {
        mixerAdvanced: +(an.mixer.time - t0).toFixed(2), liveActions: live.length,
        dominant: dom && { clip: dom.clip, weight: +dom.weight.toFixed(3) },
        speed: +spd.toFixed(2), sprintFloor: +SPRINT_MIN.toFixed(2), canonSprint: SPD.sprint,
        clips: Object.keys(an.clipReport()?.clips ?? {}).length,
      } };
    })()`),
  },
  {
    id: 'A13-no-skate', kind: 'action', lane: 'animator',
    title: 'Planted foot does not skate: stance-window XZ drift ≤ 0.06m at full sprint',
    setup: INPUT_ON,
    settle: 300,
    assert: placed(['openGround'], `(async () => {
      const an = __CTX__.player.animator, T = __CTX__.terrain, p = __CTX__.player;${CANON_SPEEDS}
      if (!an?.debugFeet) return { pass: null, detail: 'SKIP: animator exposes no debugFeet()' };
      standAt(p, 'openGround'); // gatePlaces.openGround (flat, clear run along its yaw)
      __CTX__.input.keys.add('KeyW'); __CTX__.input.keys.add('ShiftLeft');
      await new Promise(r => setTimeout(r, 2000));           // spin up to canon sprint
      // a stance window = consecutive frames where a foot is BOTH clip-flagged
      // planted and within 3cm of the terrain; its drift is the XZ bounding box
      const open = {}, done = [];
      let hitched = 0, prev = performance.now();
      const t0 = prev;
      // 2600ms, not 1600: at sprint a single foot is in contact for only ~66ms
      // (contactDuty 0.3 of a 0.6s cycle), which is 3-4 rAF samples, so a short
      // window collected too few complete stances and the gate SKIPPED itself
      // on any frame rate under 60. The drift threshold below is unchanged.
      while (performance.now() - t0 < 2600) {
        const now = performance.now();
        // A dropped frame in headless Chrome moves her 0.4m+ between samples;
        // that is a measurement artifact, not skate, so windows spanning one
        // are counted and discarded rather than silently passed.
        const hitch = now - prev > 45;
        prev = now;
        for (const f of an.debugFeet()) {
          const on = f.planted && (f.world.y - T.getHeight(f.world.x, f.world.z)) <= 0.03;
          const w = open[f.name];
          if (on) {
            if (!w) open[f.name] = { x0: f.world.x, x1: f.world.x, z0: f.world.z, z1: f.world.z, n: 1, bad: false };
            else {
              w.x0 = Math.min(w.x0, f.world.x); w.x1 = Math.max(w.x1, f.world.x);
              w.z0 = Math.min(w.z0, f.world.z); w.z1 = Math.max(w.z1, f.world.z); w.n++;
              if (hitch) w.bad = true;
            }
          } else if (w) {
            // 3 frames at canon sprint still spans ~55ms of stance and a third
            // of a metre of travel — a real skate measurement, not a lowered bar
            if (w.n >= 3) { if (w.bad) hitched++; else done.push(+Math.hypot(w.x1 - w.x0, w.z1 - w.z0).toFixed(4)); }
            open[f.name] = null;
          }
        }
        await new Promise(r => requestAnimationFrame(r));
      }
      if (done.length < 2) return { pass: null, detail: 'SKIP: fewer than 2 clean stance windows sampled (hitched=' + hitched + ')' };
      const worst = Math.max(...done);
      const spd = __CTX__.player.moveSpeed;
      return { pass: worst <= 0.06 && spd > SPRINT_MIN,
               detail: { maxStanceDriftM: worst, windows: done.length, hitchedWindows: hitched, drifts: done,
                         speed: +spd.toFixed(2), sprintFloor: +SPRINT_MIN.toFixed(2), canonSprint: SPD.sprint } };
    })()`),
  },


  // ---------------- ROUND 4 · animator (§ character) ----------------
  {
    id: 'A14-dodge-zero-dt', kind: 'action', lane: 'animator',
    title: 'A roll survives dt === 0 ticks: position stays finite and the dodge still covers ground',
    setup: INPUT_ON,
    settle: 300,
    assert: placed(['openGround'], `(async () => {
      const C = __CTX__, p = C.player, e = C.engine;
      // The fixed-step loop ticks with dt === 0 whenever a frame does not fill a
      // 1/60 step (every other frame on a 120Hz display) and whenever timeScale
      // is 0. Differentiating the roll's root-motion curve by dt used to make
      // position NaN forever, which renders the whole world black.
      standAt(p, 'openGround');
      C.input.keys.add('KeyW');
      await new Promise(r => setTimeout(r, 500));
      const start = p.position.clone();
      p.dodge();
      if (!p.dodging) return { pass: null, detail: 'SKIP: dodge did not start' };
      // drive the roll while repeatedly freezing time (steps === 0 -> _tick(0))
      let zeroTicks = 0;
      const t0 = performance.now();
      while (p.dodging && performance.now() - t0 < 2500) {
        e.timeScale = (zeroTicks++ % 2) ? 0 : 1;
        await new Promise(r => requestAnimationFrame(r));
      }
      e.timeScale = 1;
      C.input.keys.delete('KeyW');
      await new Promise(r => setTimeout(r, 400));
      const fin = Number.isFinite(p.position.x) && Number.isFinite(p.position.y)
        && Number.isFinite(p.position.z) && Number.isFinite(p.velocity.x)
        && Number.isFinite(p.moveSpeed);
      const cam = C.camera.position;
      const camFin = Number.isFinite(cam.x) && Number.isFinite(cam.y) && Number.isFinite(cam.z);
      const disp = fin ? +start.distanceTo(p.position).toFixed(2) : -1;
      return { pass: fin && camFin && disp > 1.5,
               detail: { finite: fin, cameraFinite: camFin, displacement: disp, frozenFrames: zeroTicks >> 1 } };
    })()`),
  },
  {
    id: 'A15-foot-flat', kind: 'action', lane: 'animator',
    title: 'Feet are flat at rest: idle + aim foot pitch within 5 deg of the bind pose, heels not floating',
    setup: INPUT_ON,
    settle: 1500,
    assert: placed(['openGround'], `(async () => {
      const C = __CTX__, p = C.player, an = p.animator;
      if (!an?.debugStance) return { pass: null, detail: 'SKIP: animator exposes no debugStance()' };
      standAt(p, 'openGround');
      // The teleport moves the body before the animator has run once at the new
      // spot, so the very next sample compares last frame's pose against this
      // frame's terrain and reads ~12 deg of pitch error that is not in the
      // render. Let two frames go by; the thresholds below are unchanged.
      await new Promise(r => requestAnimationFrame(r));
      await new Promise(r => requestAnimationFrame(r));
      const worst = { idle: 0, aim: 0 };
      const sample = async (tag, ms) => {
        const t0 = performance.now();
        while (performance.now() - t0 < ms) {
          for (const f of an.debugStance().feet) {
            worst[tag] = Math.max(worst[tag], Math.abs(f.pitch - f.bindPitch));
          }
          await new Promise(r => requestAnimationFrame(r));
        }
      };
      await sample('idle', 2200);
      C.input.mouse.buttons |= 4;                       // aim, standing still
      await new Promise(r => setTimeout(r, 900));
      await sample('aim', 1400);
      C.input.mouse.buttons &= ~4;
      const pass = worst.idle <= 5 && worst.aim <= 5;
      return { pass, detail: { maxIdlePitchErrDeg: +worst.idle.toFixed(2),
                               maxAimPitchErrDeg: +worst.aim.toFixed(2),
                               stance: an.debugStance() } };
    })()`),
  },
  {
    id: 'A16-draw-anchor', kind: 'action', lane: 'animator',
    title: 'Full draw: string hand ON the nock, draw elbow at/below the shoulder, arm clear of the head — at every aim pitch and while strafing',
    setup: INPUT_ON,
    settle: 400,
    assert: placed(['openGround'], `(async () => {
      const C = __CTX__, p = C.player, an = p.animator, cmb = C.combat;${HERO}
      if (!an?.debugArm) return { pass: null, detail: 'SKIP: animator exposes no debugArm()' };
      const V = () => new p.position.constructor();
      const rows = [];
      const measure = async (pitch, key, tag) => {
        C.input.mouse.buttons = 0; C.input.keys.clear();
        await new Promise(r => setTimeout(r, 600));
        standAt(p, 'openGround'); p.camPitch = pitch;
        C.input.mouse.buttons |= 4;
        if (key) C.input.keys.add(key);
        await new Promise(r => setTimeout(r, 700));
        C.input.mouse.buttons |= 1;
        await new Promise(r => setTimeout(r, 1900));
        p.camPitch = pitch;
        await new Promise(r => setTimeout(r, 200));
        const arm = an.debugArm('r');
        const nk = V(); cmb.bow.getNockWorld(cmb.drawStrength, nk);
        const hr = V(); an.getBoneWorld(HBN('handR'), hr);
        rows.push({ tag, drawS: +cmb.drawStrength.toFixed(2),
          nockToHand: +nk.distanceTo(hr).toFixed(4),
          elbowAboveShoulder: arm.elbowAboveShoulder,
          headClear: arm.headClear });
      };
      await measure(0, null, 'level');
      await measure(0.75, null, 'down');
      await measure(-0.4, null, 'up');
      await measure(-0.55, null, 'up55');
      await measure(0, 'KeyD', 'strafeRight');
      await measure(0, 'KeyA', 'strafeLeft');
      C.input.mouse.buttons = 0; C.input.keys.clear();
      const bad = rows.filter(r => !(r.drawS > 0.9 && r.nockToHand <= 0.09
        && r.elbowAboveShoulder <= 0 && r.headClear >= 0.98));
      return { pass: bad.length === 0, detail: { rows, failing: bad.map(r => r.tag) } };
    })()`),
  },
  {
    id: 'A17-draw-beats', kind: 'action', lane: 'animator',
    title: 'Nock flourish reaches the hip quiver and the loose has a rearward follow-through',
    setup: INPUT_ON,
    settle: 400,
    assert: placed(['openGround'], `(async () => {
      const C = __CTX__, p = C.player, an = p.animator;
      if (!an?.debugArm) return { pass: null, detail: 'SKIP: animator exposes no debugArm()' };
      standAt(p, 'openGround'); p.camPitch = 0;
      // --- nock flourish: the string hand must dip to the hip quiver, and it
      // is a beat of the AIM RAISE, not of the draw. Round 4 fired it on the
      // draw edge, so for its whole 0.28s the hand hung at her hip while the
      // string was already bending (nock -> hand 0.63m); the string must never
      // go live before the hand is back on it, which is asserted here too.
      // R11 (plan §8.2): the flourish frames are counted on the SIM clock
      // (>= 8 sim frames at 60 Hz). Every animator update is one sim step, so
      // the count is the number of updates (dt > 0) that end inside the beat;
      // rendered frames are reported beside it (on a loaded box main.js runs
      // up to 3 sim steps per rendered frame, which is what the Round-4 rAF
      // count measured: 7 rendered frames for a 20-sim-frame beat, Oct 22).
      let minQ = 99, frames = 0, simFrames = 0, drawDuringFlourish = 0;
      const upd = an.update;
      an.update = function (dt, t) { const r = upd.call(this, dt, t); if (dt > 0 && this._quiverT < 1) simFrames++; return r; };
      C.input.mouse.buttons |= 4;
      const t0 = performance.now();
      try {
        while (performance.now() - t0 < 700) {
          minQ = Math.min(minQ, an.debugArm('r').handToQuiver);
          if (an._quiverT < 1) { frames++; drawDuringFlourish = Math.max(drawDuringFlourish, C.combat.drawStrength); }
          await new Promise(r => requestAnimationFrame(r));
        }
      } finally { an.update = upd; }
      C.input.mouse.buttons |= 1;
      await new Promise(r => setTimeout(r, 1500));
      // --- loose: the hand holds at the anchor and kicks back along -aim
      const before = an.debugArm('r').hand;
      C.input.mouse.buttons &= ~1;
      let maxBack = 0;
      const t1 = performance.now();
      while (performance.now() - t1 < 260) {
        const h = an.debugArm('r').hand;
        maxBack = Math.max(maxBack, before.z - h.z);
        await new Promise(r => requestAnimationFrame(r));
      }
      C.input.mouse.buttons = 0;
      const pass = minQ <= 0.18 && maxBack >= 0.05 && simFrames >= 8 && drawDuringFlourish <= 0.02;
      return { pass, detail: { minHandToQuiverM: +minQ.toFixed(3),
                               flourishSimFrames: simFrames, flourishRenderedFrames: frames,
                               maxDrawDuringFlourish: +drawDuringFlourish.toFixed(3),
                               looseRearM: +maxBack.toFixed(4) } };
    })()`),
  },

  {
    id: 'A18-slope-conform', kind: 'action', lane: 'animator',
    title: 'Feet conform ACROSS the fall line: soles lie on the surface and neither foot floats at 10/20/30 deg',
    setup: INPUT_ON,
    settle: 400,
    assert: `(async () => {
      const C = __CTX__, p = C.player, an = p.animator, T = C.terrain;
      if (!an?.debugStance || !T?.getHeight) return { pass: null, detail: 'SKIP: no debugStance()/terrain' };
      // Pick ONE spot per slope band, deterministically: scan on a fixed grid
      // and take the first whose surface is locally consistent (the normal at
      // +-0.6m agrees within 6 deg), so a ridge or a crease never decides the
      // result. This is the case the old A15 never sampled — it only ever
      // stood in the flat meadow, and the conform had no lateral axis at all:
      // on a 25 deg contour both soles were held world-level and the downhill
      // boot hung 0.098m in the air.
      const nrmAt = (x, z) => { const n = new p.position.constructor(); T.getNormal(x, z, n); return n; };
      const angOf = (n) => Math.acos(Math.max(-1, Math.min(1, n.y))) * 180 / Math.PI;
      const pick = (band) => {
        let best = null;
        for (let x = -200; x <= 200; x += 3) for (let z = -200; z <= 200; z += 3) {
          const n = nrmAt(x, z); const a = angOf(n);
          if (Math.abs(a - band) > 1.2) continue;
          let ok = true;
          for (const [dx, dz] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]) {
            if (nrmAt(x + dx, z + dz).dot(n) < 0.9945) { ok = false; break; }   // ~6 deg
          }
          if (!ok) continue;
          const d = Math.abs(a - band);
          if (!best || d < best.d) best = { x, z, a, d, n };
        }
        return best;
      };
      const rows = [];
      for (const band of [10, 20, 30]) {
        const s = pick(band);
        if (!s) { rows.push({ band, skip: true }); continue; }
        // stand ACROSS the fall line (perpendicular to the gradient)
        const fall = Math.atan2(-s.n.x, -s.n.z);
        p.position.set(s.x, 0, s.z); p.velocity.set(0, 0, 0);
        p.heading = fall + Math.PI / 2; p.camYaw = p.heading; p._snapToGround();
        await new Promise(r => setTimeout(r, 900));
        p.heading = fall + Math.PI / 2;
        await new Promise(r => setTimeout(r, 300));
        const st = an.debugStance();
        const clr = an.debugFeet().map((f) => +(f.world.y - T.getHeight(f.world.x, f.world.z) - an._ballRest).toFixed(4));
        rows.push({ band, slopeDeg: +s.a.toFixed(1),
          ballClearM: clr, soleTiltDeg: st.feet.map((f) => f.soleTiltErrDeg) });
      }
      C.input.keys.clear();
      const live = rows.filter((r) => !r.skip);
      const bad = live.filter((r) => Math.max(...r.ballClearM.map(Math.abs)) > 0.02
                                  || Math.max(...r.soleTiltDeg) > 6);
      return { pass: live.length === 3 && bad.length === 0,
               detail: { rows, failing: bad.map((r) => r.band) } };
    })()`,
  },

  {
    id: 'A19-secondary-motion', kind: 'action', lane: 'animator',
    title: 'dyn_ hair/skirt chains actually swing at sprint and follow through after a hard stop',
    setup: INPUT_ON,
    settle: 400,
    assert: placed(['openGround'], `(async () => {
      const C = __CTX__, p = C.player, an = p.animator;${CANON_SPEEDS}${HERO}
      standAt(p, 'openGround');
      // R5: the probe bones are the rig's published chains (animator.chainOf, or
      // the longest discovered chain of the class), at the Round-4 link depths:
      // the hair chain's 4th link, a cloth chain's 3rd, a gear chain's 2nd.
      const probe = { hair: chainLink('hair', 3), cloth: chainLink('cloth', 2), gear: chainLink('gear', 1) };
      if (!probe.hair || !probe.cloth || !probe.gear) return { pass: null, detail: { verdict: 'SKIP: this rig publishes no hair/cloth/gear dyn_ chain', chains: HERO_CHAINS } };
      // read the LIVE bones the skinned mesh uses, not the animator's map
      const bones = {};
      for (const k in probe) bones[k] = probe[k];
      const snap = () => { const o = {}; for (const n in bones) { const q = bones[n].quaternion; o[n] = [q.x, q.y, q.z, q.w]; } return o; };
      const rangeDeg = (list) => {
        const o = {};
        for (const n in bones) {
          let mx = 0;
          for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
            const A = list[i][n], B = list[j][n];
            const d = Math.min(1, Math.abs(A[0] * B[0] + A[1] * B[1] + A[2] * B[2] + A[3] * B[3]));
            const a = 2 * Math.acos(d) * 180 / Math.PI; if (a > mx) mx = a;
          }
          o[n] = +mx.toFixed(2);
        }
        return o;
      };
      C.input.keys.add('KeyW'); C.input.keys.add('ShiftLeft');
      await new Promise(r => setTimeout(r, 2400));
      const run = []; for (let i = 0; i < 22; i++) { run.push(snap()); await new Promise(r => setTimeout(r, 95)); }
      const sprint = rangeDeg(run);
      const speed = p.moveSpeed;
      C.input.keys.delete('KeyW'); C.input.keys.delete('ShiftLeft');
      const stop = []; for (let i = 0; i < 9; i++) { stop.push(snap()); await new Promise(r => setTimeout(r, 45)); }
      const after = rangeDeg(stop);
      C.input.keys.clear();
      // A converged spring is not motion: a chain parked at a constant lean by
      // a DC velocity term measured 0.0-0.26 deg over 2.5s of sprint while the
      // legs swung 100 deg. These bars are what "the hair swings" costs.
      const pass = speed > SPRINT_MIN
        && sprint.hair >= 8 && sprint.cloth >= 4
        && sprint.gear >= 1.5
        && after.hair >= 6;
      return { pass, detail: { speed: +speed.toFixed(2), sprintFloor: +SPRINT_MIN.toFixed(2), canonSprint: SPD.sprint,
                               probeBones: { hair: probe.hair.name, cloth: probe.cloth.name, gear: probe.gear.name },
                               sprintRangeDeg: sprint, afterStopRangeDeg: after } };
    })()`),
  },

  {
    id: 'A33-rig-finite', kind: 'action', lane: 'animator',
    title: 'No bone or dyn_ spring ever goes non-finite across a teleport/turn/sprint/aim/dodge stress run',
    setup: INPUT_ON,
    settle: 400,
    assert: placed(['openGround'], `(async () => {
      const C = __CTX__, p = C.player, an = p.animator, T = C.terrain;
      const bones = [];
      p.model.traverse((o) => { if (o.isBone) bones.push(o); });
      if (!bones.length) return { pass: null, detail: 'SKIP: no bones' };
      // A NaN here is not a glitch: a non-finite bone matrix collapses every
      // vertex it skins, so one bad spring state silently DELETES the hair,
      // skirt, boot fur and pouches from the render, and the integrator has no
      // path back. The fix-round film caught exactly that after a teleport.
      const bad = [];
      const check = (tag) => {
        for (const b of bones) {
          const q = b.quaternion, v = b.position;
          if (!(Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) && Number.isFinite(q.w)
                && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z))) {
            bad.push(tag + ':bone:' + b.name); return;
          }
        }
        for (const c of (an._chains || [])) {
          if (!(Number.isFinite(c.ax) && Number.isFinite(c.az) && Number.isFinite(c.vx) && Number.isFinite(c.vz))) {
            bad.push(tag + ':chain:' + (c.links[0] && c.links[0].name)); return;
          }
        }
        for (const k of ['_grnd', '_lvx', '_lvz', '_jerkX', '_jerkZ', '_yawRate', '_drawS', '_aimW']) {
          if (!Number.isFinite(an[k])) { bad.push(tag + ':state:' + k); return; }
        }
      };
      const hold = async (ms, tag) => {
        const t0 = performance.now();
        while (performance.now() - t0 < ms) { check(tag); await new Promise(r => requestAnimationFrame(r)); }
      };
      // scan for a steep spot, teleport onto it and slam the heading — the
      // exact sequence the film harness ran when the chains went NaN
      const nAt = (x, z) => { const v = new p.position.constructor(); T.getNormal(x, z, v); return v; };
      const O = PLACE('openGround');   // scan its 65 m neighbourhood (R5: was a literal box)
      let steep = { x: O.x, z: O.z, n: nAt(O.x, O.z) };
      for (let x = O.x - 65; x <= O.x + 65; x += 4) for (let z = O.z - 65; z <= O.z + 65; z += 4) {
        const v = nAt(x, z);
        if (v.y < steep.n.y) steep = { x, z, n: v };
      }
      const fall = Math.atan2(-steep.n.x, -steep.n.z);
      const jump = async (x, z, h) => {
        p.position.set(x, 0, z); p.velocity.set(0, 0, 0); p.heading = h; p.camYaw = h; p._snapToGround();
        await hold(500, 'jump');
      };
      await hold(300, 'boot');
      await jump(steep.x, steep.z, fall + Math.PI / 2);
      await jump(steep.x, steep.z, fall);                     // 90 deg heading slam
      await jump(O.x, O.z, 0);
      C.input.keys.add('KeyW'); C.input.keys.add('ShiftLeft');
      await hold(1800, 'sprint');
      p.camYaw = 2.6; await hold(400, 'hardturn');
      C.input.keys.delete('ShiftLeft'); C.input.keys.delete('KeyW');
      await hold(500, 'stop');
      // R5 fix round 3: dodge is ControlLeft, bound with input.onDown (player.js); Space is jump, and
      // keys.add() of either never fires an onDown handler, so Round 4's line rolled nothing. A real
      // ControlLeft keydown + keyup through the input listener, and the row says whether she rolled.
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlLeft' }));
      const dodgeFired = p.dodging === true;
      await hold(120, 'dodge');
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ControlLeft' }));
      await hold(1000, 'roll');
      C.input.mouse.buttons |= 4; await hold(500, 'aim');
      C.input.mouse.buttons |= 1; await hold(1200, 'draw');
      C.input.mouse.buttons = 0; await hold(500, 'loose');
      C.input.keys.clear();
      // a run whose dodge never fired did not stage the sequence this row is about: not a pass
      return { pass: bad.length === 0 && dodgeFired, detail: { firstBad: bad.slice(0, 5), bones: bones.length,
                                                 chains: (an._chains || []).length, dodgeFired,
                                                 ...(dodgeFired ? {} : { staging: 'FAIL: the ControlLeft keydown did not start a dodge (player.dodging stayed false)' }) } };
    })()`),
  },

  {
    id: 'A28-run-cadence', kind: 'action', lane: 'animator',
    title: 'Plain-W run reads as a run, not a bound: cadence >= 2.6 steps/s and flight fraction <= 0.40',
    setup: INPUT_ON,
    settle: 400,
    assert: placed(['openGround'], `(async () => {
      const C = __CTX__, p = C.player, an = p.animator, T = C.terrain;${CANON_SPEEDS}
      if (!an?.debugFeet) return { pass: null, detail: 'SKIP: animator exposes no debugFeet()' };
      const run = async (keys) => {
        standAt(p, 'openGround');
        C.input.keys.clear(); for (const k of keys) C.input.keys.add(k);
        await new Promise(r => setTimeout(r, 2200));
        const S = []; const t0 = performance.now();
        while (performance.now() - t0 < 2400) {
          const f = an.debugFeet();
          S.push({ lo: Math.min(...f.map((x) => x.world.y - T.getHeight(x.world.x, x.world.z))),
                   pl: f.map((x) => x.planted), w: [an._stL, an._stR],
                   hz: 2 * (an.loco?.freq ?? 0), sp: p.moveSpeed });
          await new Promise(r => requestAnimationFrame(r));
        }
        const dur = 2.4;
        // Foot-edge counting is a NOISY cadence probe: the blended stance
        // weight chatters across 0.5 and merges or doubles edges, which is
        // worth +-0.4 steps/s on a 2.4s window. Count it with hysteresis as a
        // cross-check and assert on the cadence the clips are actually driven
        // at — the locomotion phase rate, 2 steps per gait cycle.
        let steps = 0; const held = [S[0].pl[0], S[0].pl[1]];
        for (let i = 1; i < S.length; i++) {
          for (let j = 0; j < 2; j++) {
            if (!held[j] && S[i].w[j] > 0.65) { held[j] = true; steps++; }
            else if (held[j] && S[i].w[j] < 0.35) held[j] = false;
          }
        }
        const spd = S.reduce((a, s) => a + s.sp, 0) / S.length;
        const cad = S.map((s) => s.hz).sort((a, b) => a - b);
        const med = cad[cad.length >> 1];
        return { stepsPerSec: +med.toFixed(2),
                 stepsPerSecFromFeet: +(steps / dur).toFixed(2),
                 flightFrac: +(S.filter((s) => s.lo > 0.05).length / S.length).toFixed(2),
                 strideM: +(spd / med).toFixed(2), speed: +spd.toFixed(2) };
      };
      // Plain W is the gait the player spends the whole game in and A12/A13
      // only ever drove W+Shift. On the old 4.6 m/s canon against a 6.05 m/s jog
      // clip it ran at 0.76x: 126 spm, a 2.2m stride and 55% flight —
      // low-gravity bounding. Both floors below now come from player.speeds.
      const w = await run(['KeyW']);
      const s = await run(['KeyW', 'ShiftLeft']);
      C.input.keys.clear();
      const pass = w.speed > JOG_MIN && w.stepsPerSec >= 2.6 && w.flightFrac <= 0.40
                && s.speed > SPRINT_MIN && s.stepsPerSec >= 3.0 && s.flightFrac <= 0.55;
      return { pass, detail: { runW: w, sprint: s,
                               floors: { jog: +JOG_MIN.toFixed(2), sprint: +SPRINT_MIN.toFixed(2) },
                               canon: { jog: SPD.jog, sprint: SPD.sprint } } };
    })()`),
  },

  {
    id: 'A31-aim-strafe-skate', kind: 'action', lane: 'animator',
    title: 'Aim-strafe does not skate either: planted-foot stance drift <= 0.06m sidestepping left AND right under aim',
    setup: INPUT_ON,
    settle: 400,
    assert: placed(['openGround'], `(async () => {
      const C = __CTX__, p = C.player, an = p.animator, T = C.terrain;
      if (!an?.debugFeet) return { pass: null, detail: 'SKIP: animator exposes no debugFeet()' };
      // Same stance-window algorithm as A13, driven sideways under aim — the
      // dominant combat locomotion of a bow game, and the case A13 never covered:
      // yawing a forward walk left the stride axis ~30 deg off the travel
      // direction and dragged the planted foot 0.15-0.18m per stance.
      const measure = async (key) => {
        C.input.mouse.buttons = 0; C.input.keys.clear();
        standAt(p, 'openGround');
        C.input.mouse.buttons |= 4; C.input.keys.add(key);
        await new Promise(r => setTimeout(r, 1800));
        const open = {}, done = []; let hitched = 0, prev = performance.now();
        const t0 = prev;
        while (performance.now() - t0 < 2600) {
          const now = performance.now(); const hitch = now - prev > 45; prev = now;
          for (const f of an.debugFeet()) {
            const on = f.planted && (f.world.y - T.getHeight(f.world.x, f.world.z)) <= 0.03;
            const w = open[f.name];
            if (on) {
              if (!w) open[f.name] = { x0: f.world.x, x1: f.world.x, z0: f.world.z, z1: f.world.z, n: 1, bad: false };
              else {
                w.x0 = Math.min(w.x0, f.world.x); w.x1 = Math.max(w.x1, f.world.x);
                w.z0 = Math.min(w.z0, f.world.z); w.z1 = Math.max(w.z1, f.world.z); w.n++;
                if (hitch) w.bad = true;
              }
            } else if (w) {
              if (w.n >= 3) { if (w.bad) hitched++; else done.push(+Math.hypot(w.x1 - w.x0, w.z1 - w.z0).toFixed(4)); }
              open[f.name] = null;
            }
          }
          await new Promise(r => requestAnimationFrame(r));
        }
        const travelled = p.moveSpeed;
        return { drifts: done, windows: done.length, hitched, speed: +travelled.toFixed(2) };
      };
      const R = await measure('KeyD');
      const L = await measure('KeyA');
      C.input.mouse.buttons = 0; C.input.keys.clear();
      if (R.windows < 2 || L.windows < 2) return { pass: null, detail: { R, L, note: 'SKIP: fewer than 2 clean stance windows' } };
      const worst = Math.max(...R.drifts, ...L.drifts);
      return { pass: worst <= 0.06 && R.speed > 0.9 && L.speed > 0.9,
               detail: { maxStanceDriftM: worst, right: R, left: L } };
    })()`),
  },

  {
    id: 'A32-draw-ramp', kind: 'action', lane: 'animator',
    title: 'The string hand is on the nock for the WHOLE draw ramp, and the hand is not inside her head at full draw',
    setup: INPUT_ON,
    settle: 400,
    assert: placed(['openGround'], `(async () => {
      const C = __CTX__, p = C.player, an = p.animator, cmb = C.combat;${HERO}
      if (!an?.debugArm) return { pass: null, detail: 'SKIP: animator exposes no debugArm()' };
      const V = () => new p.position.constructor();
      const rows = [];
      // A16 only ever samples drawS > 0.9, so it could not see that the first
      // 0.28s of every draw ran with the hand at her hip and the string open in
      // a V with nothing holding it (nock -> hand 0.63m at drawS 0.18). And its
      // headClear tests only the arm SEGMENTS, so it passed while hand_r itself
      // sat at 0.94 of the head-ellipsoid radius, inside the skull.
      const measure = async (pitch, key, tag) => {
        C.input.mouse.buttons = 0; C.input.keys.clear();
        await new Promise(r => setTimeout(r, 600));
        standAt(p, 'openGround'); p.camPitch = pitch;
        C.input.mouse.buttons |= 4; if (key) C.input.keys.add(key);
        await new Promise(r => setTimeout(r, 900));
        C.input.mouse.buttons |= 1;
        let ramp = 0, rampAt = 0, minHand = 9, full = 0;
        const t0 = performance.now();
        while (performance.now() - t0 < 1800) {
          p.camPitch = pitch;
          const ds = cmb.drawStrength;
          const nk = V(); cmb.bow.getNockWorld(ds, nk);
          const hr = V(); an.getBoneWorld(HBN('handR'), hr);
          const d = nk.distanceTo(hr);
          if (ds > 0.05 && ds < 0.9 && d > ramp) { ramp = d; rampAt = ds; }
          if (ds >= 0.9) { full = Math.max(full, d); minHand = Math.min(minHand, an.debugArm('r').handHeadUnit); }
          await new Promise(r => requestAnimationFrame(r));
        }
        rows.push({ tag, rampMaxNockToHand: +ramp.toFixed(4), rampAtDrawS: +rampAt.toFixed(2),
                    fullMaxNockToHand: +full.toFixed(4), minHandHeadUnit: +minHand.toFixed(3) });
      };
      await measure(0, null, 'level');
      await measure(0.75, null, 'down');
      await measure(1.05, null, 'down105');
      await measure(-0.4, null, 'up');
      await measure(-0.55, null, 'up55');
      await measure(0, 'KeyD', 'strafeRight');
      C.input.mouse.buttons = 0; C.input.keys.clear();
      // handHeadUnit >= 0.88 == the glove rests ON the cheek rather than inside
      // the skull (the animator itself clamps the target to 0.90).
      const bad = rows.filter((r) => !(r.rampMaxNockToHand <= 0.09 && r.fullMaxNockToHand <= 0.09
                                    && r.minHandHeadUnit >= 0.88));
      return { pass: bad.length === 0, detail: { rows, failing: bad.map((r) => r.tag) } };
    })()`),
  },

  // ---------------- ROUND 4 · core-platform (§4) ----------------
  {
    id: 'A20-frame-loop-survives', kind: 'action', lane: 'core-platform',
    title: 'A throwing system cannot kill the frame loop; error logged once, sim keeps advancing',
    settle: 900, timeout: 90000,
    // this gate creates its own quarantined failures on purpose
    allowSystemErrors: ['^GateTempSystem\\.', '^Game\\._frameTail$'],
    assert: `(async () => {
      const g = __GAME__, ctx = __CTX__, e = ctx.engine;
      /**
       * FIX (core-platform-followup2) — THE PROBE MUST NOT BE ABLE TO BREAK THE
       * PATIENT. This gate is the only one that deliberately makes the running
       * game throw, and it did so with two unguarded mutations: a synthetic
       * system pushed into g.systems, and e._updateStats monkey-patched. Both
       * were undone by plain statements in the middle of the assert, so ANY
       * early exit — a thrown TypeError on a missing API, the runner's own
       * assert timeout abandoning this evaluate, the page being torn down
       * mid-await — left the game permanently sabotaged: a system throwing
       * 60x/second for the rest of the page's life, or the frame tail replaced
       * by a stub. That state then bled into the screenshot this gate saves and
       * into anything else reading the page. Worse, the removal was
       * \`splice(indexOf(bad), 1)\`, and indexOf returns -1 when the system is
       * already gone — splice(-1, 1) DELETES THE LAST REAL SYSTEM, silently
       * unregistering whatever lane happened to register last.
       *
       * Now: one \`undo()\` that is index-safe and idempotent, called from a
       * finally, and armed on the page's own clock as a watchdog so an
       * abandoned evaluate still restores the game.
       */
      let bad = null, realStats = null, badRef = null;
      const undo = () => {
        try {
          if (bad) { const i = g.systems.indexOf(bad); if (i >= 0) g.systems.splice(i, 1); bad = null; }
        } catch (err) { /* the array is gone; nothing to restore */ }
        try {
          if (realStats) { e._updateStats = realStats; realStats = null; }
        } catch (err) { /* engine is gone; nothing to restore */ }
      };
      if (window.__A20_WATCHDOG__) clearTimeout(window.__A20_WATCHDOG__);
      window.__A20_WATCHDOG__ = setTimeout(undo, 120000);
      try {
      /**
       * FIX (core-platform-followup) — WAIT FOR FRAMES, NOT FOR THE CLOCK.
       * The property under test is "a throwing system does not stop the loop",
       * and it was being sampled with setTimeout(1400): on a box running seven
       * lane suites at once that window delivered 6 rendered frames and the
       * gate failed for the neighbours' load, not for the build (measured:
       * framesAdvanced 6 and 26 against a >= 20 bar, with every error-ledger
       * term green). The waits below block until the loop has produced 40
       * frames, with a hard 20 s ceiling — so a DEAD loop still fails (frames
       * never arrive, the ceiling expires, frames < 20), a slow box does not,
       * and every threshold below is exactly the one it was.
       *
       * FOLLOWUP2 also counts raw rAF callbacks alongside engine.frames. The
       * question "is the loop alive" is then answered on two independent
       * channels — the engine's own counter, and the browser still servicing
       * animation frames for this document — and neither is console output,
       * which a quarantined system deliberately never writes to.
       */
      const waitFrames = async (n, capMs) => {
        const f = e.frames, t = performance.now();
        let raf = 0;
        while (e.frames - f < n && performance.now() - t < capMs) {
          await new Promise(r => requestAnimationFrame(r));
          raf++;
        }
        return { frames: e.frames - f, raf, ms: Math.round(performance.now() - t) };
      };
      const before = g.systemErrors.length;
      const alive = (ctx.machines?.list || []).filter(m => m.alive);
      const start = alive.map(m => ({ m, x: m.position.x, z: m.position.z }));
      const f0 = e.frames, s0 = e.simTime;
      const mix0 = ctx.player?.animator?.mixer?.time ?? 0;
      let calls = 0;
      bad = badRef = {
        constructor: { name: 'GateTempSystem' },
        update() { calls++; if (calls <= 3) throw new Error('A20 synthetic system failure'); },
      };
      g.systems.push(bad);
      const w1 = await waitFrames(40, 30000);
      undo();                                   // index-safe; never splice(-1, 1)
      const w1b = await waitFrames(4, 3000);
      const rec = g.systemErrors.find(x => x.key === 'GateTempSystem.update');
      let moved = 0;
      for (const s of start) moved = Math.max(moved, Math.hypot(s.m.position.x - s.x, s.m.position.z - s.z));
      const frames = e.frames - f0, sim = e.simTime - s0;
      const rafTicks = w1.raf + w1b.raf;
      const mixerAdvanced = (ctx.player?.animator?.mixer?.time ?? 0) - mix0;
      // Three independent witnesses that the loop kept running through the
      // throws: the engine's frame counter, the browser still servicing rAF for
      // this document, and simulated time actually moving the world.
      const simAlive = frames >= 20 && rafTicks >= 20 && sim > 0.4
        && (moved > 0.001 || mixerAdvanced > 0.4);

      // ---- the TAIL of the frame is guarded too ----
      // _recordFrame/_updateStats/_updateDynamicResolution run after the sim and
      // after render(); three re-arms rAF only once the whole callback returns,
      // so a throw there is just as fatal. _updateDynamicResolution calls
      // engine.resize(), which calls csm.updateFrustums() and the cross-lane
      // onResize hook — this is reachable, not theoretical.
      const f1 = e.frames;
      const boundStats = e._updateStats.bind(e);
      realStats = boundStats;                   // undo() restores this, always
      let tailCalls = 0;
      e._updateStats = function (dt) { tailCalls++; if (tailCalls <= 3) throw new Error('A20 synthetic frame-tail failure'); return boundStats(dt); };
      const w2 = await waitFrames(40, 30000);
      undo();
      const w2b = await waitFrames(4, 3000);
      const tailRec = g.systemErrors.find(x => x.key === 'Game._frameTail');
      const tailFrames = e.frames - f1;
      const tailRaf = w2.raf + w2b.raf;
      const tailOk = !!tailRec && tailRec.count >= 3 && tailRec.logs === 1
        && tailFrames >= 20 && tailRaf >= 20 && tailCalls > 3;

      const pass = !!rec && rec.count >= 3 && rec.logs === 1
        && g.systemErrors.length === before + 2 && simAlive && calls > 3 && tailOk;
      return { pass, detail: {
        framesAdvanced: frames, rafTicks, simAdvanced: +sim.toFixed(2),
        machineMoved: +moved.toFixed(3), mixerAdvanced: +mixerAdvanced.toFixed(2),
        systemCalledAfterThrow: calls, throws: rec?.count ?? 0, consoleLogs: rec?.logs ?? 0,
        waits: { systemPhase: w1, tailPhase: w2, note: 'frame-driven waits; ms is how long this box took to deliver them' },
        tail: { framesAfterTailThrow: tailFrames, tailRafTicks: tailRaf, tailThrows: tailRec?.count ?? 0,
                tailLogs: tailRec?.logs ?? 0, tailCalledAfterThrow: tailCalls, tailOk },
        errorRecords: g.systemErrors.length,
        restored: { tempSystemRemoved: g.systems.indexOf(badRef) < 0, frameTailRestored: e._updateStats === boundStats },
      } };
      } finally {
        // The game is handed back exactly as it was found, on every path out of
        // this gate — including the ones that do not come through here.
        undo();
        clearTimeout(window.__A20_WATCHDOG__);
        window.__A20_WATCHDOG__ = null;
      }
    })()`,
  },
  {
    id: 'A21-real-draw-calls', kind: 'action', lane: 'core-platform',
    title: 'Honest per-frame draw calls + whole-loop JS + frame budget on a DPR-2 display, three role-staged scenarios (vista, herd, staged fight), per-term status; the GPU term is graded on the tier pass, on a quiet box only',
    settle: 400, timeout: 300000,
    /**
     * R5 (gates-perf W0a, fix round 3): a getter, like A9, so the node-side contention read
     * (boxContention: load average + other gate Chromes) is taken when the row RUNS. The GPU
     * term is attributable only on a quiet box (judge finding: at load 15-20 this row read
     * 137.5 ms on the spawn vista while A9 read 54.9 ms on the same vista in the same run,
     * both with a sub-millisecond null frame).
     */
    get assert() {
      const box = boxContention();
      return `(async () => {
      const BOX = ${JSON.stringify(box)};
      const ctx = __CTX__, e = ctx.engine;
      ${WAIT_VARIETY}
      ${BURST}${ROSTER}${PLACES}
      ${STAGE_PRELUDE}
      const B = ${JSON.stringify(BUDGETS)};
      const SC = ${JSON.stringify(PERF_SCENARIOS)};
      // "at DPR 2" = on a devicePixelRatio-2 display. The engine's quality tier
      // caps the applied ratio (high = 1.5) and THAT cap is the perf-tech-05
      // fix, so the gate exercises it instead of bypassing it. The uncapped
      // DPR-2 numbers are measured too and reported for the record.
      const applied = Math.min(B.deviceDpr, e.tier.dprCap);
      // FIX ROUND 1 — dynamic resolution OFF for the whole gate. With DRS live
      // the engine multiplies basePixelRatio by renderScale, so a burst
      // labelled "DPR 1.5" could be sampling 1.05 under load and no number in
      // the output would say so. setDynamicResolution(false) also snaps the
      // scale back to 1.
      const drsWas = e.drsEnabled;
      e.setDynamicResolution(false);
      e.enableGpuTimer(true);

      // Draw-call attribution so a failure names the lane that owes the fix.
      const census = () => {
        const cam = ctx.camera.position;
        const out = { player: 0, machines: 0, vegetation: 0, props: 0, terrainSky: 0, other: 0 };
        const casters = { player: 0, machines: 0, vegetation: 0, props: 0, terrainSky: 0, other: 0 };
        const bucket = (n) => /player|hero/i.test(n) ? 'player'
          : /machine/i.test(n) ? 'machines'
          : /vegetation|grass|tree/i.test(n) ? 'vegetation'
          : /camp|prop|npc|gather|water/i.test(n) ? 'props'
          : /terrain|sky|ridge/i.test(n) ? 'terrainSky' : 'other';
        for (const child of ctx.scene.children) {
          if (!child.visible) continue;
          const k = bucket(child.name || '');
          child.traverse((o) => {
            if (!o.isMesh || !o.visible) return;
            const d = Math.hypot(o.matrixWorld.elements[12] - cam.x, o.matrixWorld.elements[14] - cam.z);
            if (d > 260) return;
            out[k]++;
            if (o.castShadow) casters[k]++;
          });
        }
        return { meshesWithin260m: out, shadowCasters: casters, activeShadowCasters: e.activeShadowCasters };
      };

      /**
       * EXACT attribution: wrap renderBufferDirect for a few frames and record
       * every real draw, bucketed by owner and by pass. The shadow pass swaps
       * in a MeshDepthMaterial, the post chain draws fullscreen quads with no
       * scene ancestor — so each call lands in exactly one bucket and the
       * totals add up to renderer.info.render.calls. Runs OUTSIDE the timed
       * bursts: the wrapper costs JS time and must not pollute a frame budget.
       */
      const ownerOf = (o) => {
        // Walk to the scene child this draw belongs to. An object with NO scene
        // ancestor is a fullscreen quad from the post chain; a scene child with
        // no name is somebody's unlabelled root and gets its own bucket rather
        // than being quietly added to post (that mistake hid 43 calls of scene
        // content inside "post" in the first version of this gate).
        let n = o, root = null;
        while (n) { if (n.parent === ctx.scene) { root = n; break; } n = n.parent; }
        if (!root) return null;
        const name = root.name || '';
        if (!name) return 'unnamedRoots';
        return /player|hero/i.test(name) ? 'player'
          : /machine/i.test(name) ? 'machines'
          : /vegetation|grass|tree/i.test(name) ? 'vegetation'
          : /camp|prop|npc|gather|water/i.test(name) ? 'props'
          : /terrain|sky|ridge/i.test(name) ? 'terrainSky' : 'other';
      };
      const attributeCalls = async (frames = 6) => {
        const R = e.renderer;
        const real = R.renderBufferDirect.bind(R);
        const main = {}, shadow = {}, postDetail = {};
        let post = 0, total = 0, f = 0;
        R.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
          total++;
          const k = ownerOf(object);
          if (k === null) {
            post++;
            const tag = (material?.name || material?.type || '?');
            postDetail[tag] = (postDetail[tag] || 0) + 1;
          } else if (material && (material.isMeshDepthMaterial || material.isMeshDistanceMaterial)) {
            shadow[k] = (shadow[k] || 0) + 1;
          } else {
            main[k] = (main[k] || 0) + 1;
          }
          return real(camera, scene, geometry, material, object, group);
        };
        const f0 = e.frames;
        while (e.frames - f0 < frames) await new Promise(r => requestAnimationFrame(r));
        f = e.frames - f0;
        R.renderBufferDirect = real;
        const per = (obj) => { const o = {}; for (const k in obj) o[k] = Math.round(obj[k] / f); return o; };
        return { perFrame: Math.round(total / f), main: per(main), shadow: per(shadow),
                 post: Math.round(post / f), postDetail: per(postDetail) };
      };

      /**
       * What the engine could still batch, and what only the model owner can.
       * Every rigid (non-skinned, opaque, single-material) mesh with the same
       * material SIGNATURE could share one BatchedMesh draw; a skinned mesh
       * cannot be batched at all, and a mesh with a unique signature has
       * nothing to batch with. This is the ceiling of any renderer-side fix —
       * print it so nobody has to argue about whose deficit it is.
       */
      const batchCeiling = () => {
        const sig = (m) => [m.type, m.color && m.color.getHexString(), (m.roughness ?? -1).toFixed(3),
          (m.metalness ?? -1).toFixed(3), m.emissive && m.emissive.getHexString(), (m.emissiveIntensity ?? 1).toFixed(2),
          m.map?.uuid || '', m.normalMap?.uuid || '', m.roughnessMap?.uuid || '', m.emissiveMap?.uuid || '',
          m.transparent, m.side, m.flatShading, m.vertexColors].join('|');
        const per = {};
        for (const c of ctx.scene.children) {
          const mm = /^(\\w+)-machine$/.exec(c.name || ''); if (!mm) continue;
          const k = mm[1];
          const p = per[k] || (per[k] = { instances: 0, meshes: 0, skinned: 0, transparent: 0, rigid: 0, sigs: new Set() });
          p.instances++;
          c.traverse((o) => {
            if (!o.isMesh) return;
            p.meshes++;
            if (o.isSkinnedMesh) { p.skinned++; return; }
            const mat = Array.isArray(o.material) ? o.material[0] : o.material;
            if (!mat || Array.isArray(o.material)) { p.transparent++; return; }
            if (mat.transparent) { p.transparent++; return; }
            p.rigid++; p.sigs.add(sig(mat));
          });
        }
        const out = {}; let meshes = 0, batched = 0;
        for (const [k, v] of Object.entries(per)) {
          const drawsNow = v.meshes;
          const drawsBatched = v.skinned + v.transparent + v.sigs.size;
          out[k] = { instances: v.instances, meshes: v.meshes, skinned: v.skinned, transparent: v.transparent,
                     rigid: v.rigid, signatures: v.sigs.size, drawsNow, drawsIfEngineBatched: drawsBatched,
                     perInstanceNow: +(v.meshes / v.instances).toFixed(1) };
          meshes += drawsNow; batched += drawsBatched;
        }
        return { perSpecies: out, machineDrawsNow: meshes, machineDrawsIfEngineBatched: batched,
                 engineCeilingSaving: meshes - batched };
      };

      // Split the frame into what the ENGINE decides (post passes, how many
      // casters survived the cull) and what the CONTENT costs (main-pass
      // meshes). A failure has to be attributable or it is not actionable.
      const ledger = async (total) => {
        const R = e.renderer;
        const was = R.shadowMap.enabled;
        R.shadowMap.enabled = false;
        const s = await burst(12);
        R.shadowMap.enabled = was;
        const noShadow = s ? s.maxDrawCalls : null;
        return {
          totalCalls: total,
          shadowPassCalls: noShadow == null ? null : total - noShadow,
          mainPlusPostCalls: noShadow,
          postPasses: e.composer.passes.filter((p) => p.enabled).length,
          activeShadowCasters: e.activeShadowCasters,
          shadowCascades: e.shadowCascades ?? 1,
          sizeCulled: e.sizeCulled,
        };
      };

      const measureAt = async (dpr) => {
        e.basePixelRatio = dpr; e.renderScale = 1; e.resize();
        await new Promise(r => setTimeout(r, 700));
        const p95s = [], calls = [], callsMin = [], tris = [], js = [], gpu = [];
        const sim = [], sub = [], tail = [];
        let lastSnap = null;
        for (let i = 0; i < B.bursts; i++) {
          const s = await burst(B.sampleFrames);
          lastSnap = s;
          p95s.push(s.p95FrameMs); calls.push(s.maxDrawCalls); callsMin.push(s.minDrawCalls);
          tris.push(s.maxTriangles); js.push(s.p95JsMs);
          // JUDGE FIX — the JS term is now the whole main-loop callback
          // (engine._perf.js, written by main.js _frame). Its three parts are
          // reported so a red says which half owes it. A build whose engine
          // predates the split reports the parts as 0 and they sum short of
          // p95Js — that discrepancy is printed as jsPartsMissing rather than
          // silently ignored.
          sim.push(s.p95SimMs ?? null); sub.push(s.p95RenderMs ?? null); tail.push(s.p95TailMs ?? null);
          if (s.medianGpuMs != null) gpu.push(s.medianGpuMs);
        }
        const partsKnown = sim.every((x) => x != null);
        return {
          p95FrameMs: +median(p95s).toFixed(2), maxDrawCalls: Math.max(...calls),
          minDrawCalls: Math.min(...callsMin), maxTriangles: Math.max(...tris),
          p95JsMs: +median(js).toFixed(2),
          jsTerm: lastSnap?.jsTerm ?? null,
          p95SimMs: partsKnown ? +median(sim).toFixed(2) : null,
          p95SubmitMs: partsKnown ? +median(sub).toFixed(2) : null,
          p95TailMs: partsKnown ? +median(tail).toFixed(2) : null,
          jsPartsMissing: !partsKnown,
          jsBursts: js.map((x) => +x.toFixed(2)),
          jsInstability: +(Math.max(...js) / Math.max(0.01, Math.min(...js))).toFixed(2),
          medianGpuMs: gpu.length ? +median(gpu).toFixed(2) : null,
          effectivePixelRatio: +e.renderer.getPixelRatio().toFixed(3),
          // Four bursts of the SAME pinned frame. On a quiet box they agree;
          // when they disagree by more than a third, something outside this
          // page is deciding when our frames land.
          p95Bursts: p95s.map((x) => +x.toFixed(1)),
          p95Instability: +(Math.max(...p95s) / Math.max(0.01, Math.min(...p95s))).toFixed(2),
          // FIX ROUND 2 — the same self-witness for the GPU timer. A disjoint
          // timer query measures elapsed time on the GPU TIMELINE, so it is
          // inflated when our command stream is queued behind another client's
          // (measured: the same all-on configuration read 42.8 then 70.8 ms
          // minutes apart). Four bursts of ONE frozen composition that
          // disagree by more than a third are not measuring our frame.
          gpuBursts: gpu.map((x) => +x.toFixed(1)),
          gpuInstability: gpu.length > 1
            ? +(Math.max(...gpu) / Math.max(0.01, Math.min(...gpu))).toFixed(2) : null,
        };
      };

      // ONE staging per scenario; the capped pass, the frozen census and the
      // raw DPR-2 pass all read the SAME pinned scene instead of whatever the
      // AI had rearranged a minute later.
      const runScenario = async (name) => {
        // R5: a scenario whose cast cannot be staged returns { skip } (named, R18/R28/R30)
        const staged = eval(SC[name]);
        if (typeof staged !== 'function') return { skip: (staged && staged.skip) || 'SKIP-R18: scenario ' + name + ' staged nothing' };
        const unpin = staged;
        try {
          await new Promise(r => setTimeout(r, 1500));   // settle under the pin
          const capped = await measureAt(applied);
          const attribution = census();
          const led = await ledger(capped.maxDrawCalls);
          // Sim halted: an exactly reproducible call count (min == max) that a
          // reviewer can re-derive by hand, plus the exact per-owner ledger.
          e.requestTimeScale('gate', 0);
          await new Promise(r => setTimeout(r, 350));
          const f = await burst(20);
          const draws = await attributeCalls(6);
          e.requestTimeScale('gate', null);
          const rawDpr2 = await measureAt(B.deviceDpr);
          return { capped, rawDpr2, attribution, ledger: led, draws,
                   frozen: { calls: f.maxDrawCalls, spread: f.maxDrawCalls - f.minDrawCalls } };
        } finally { unpin(); }
      };

      /**
       * CAN THIS BOX PRESENT ANY FRAME AT ALL? Hide the whole scene, kill every
       * post pass and the shadow map, drop to DPR 0.5 and measure: that frame
       * is a clear and a present, nothing else. rAF intervals are vsync-locked,
       * so a healthy null frame reads ~16.7 ms; anything materially above that
       * (or a GPU timer that still reads milliseconds with nothing drawn) means
       * another process owns the GPU and NO wall-clock number from this run can
       * be attributed to our frame. The draw-call and triangle terms are
       * unaffected — they are counters, not clocks — so they always count.
       */
      /**
       * CPU WITNESS FOR THE JS TERM. The null frame and the GPU timer say
       * nothing about whether our JAVASCRIPT ran at full speed: a box whose
       * cores are busy — or thermally throttled — inflates every
       * performance.now() delta inside the frame, and the JS term is nothing
       * but such deltas. So run a fixed, allocation-free arithmetic loop and
       * time it the same way in every scenario. The absolute number is
       * hardware; what the gate uses is its STABILITY across the run. Best of
       * five (the least-preempted sample is the honest one).
       */
      const cpuProbe = () => {
        let best = Infinity;
        for (let r = 0; r < 5; r++) {
          const t = performance.now();
          let x = 0;
          for (let i = 1; i <= 300000; i++) x += Math.sqrt(i) / (i + (x % 7) + 1);
          window.__cpuProbeSink = x;   // keep the loop from being optimised away
          const ms = performance.now() - t;
          if (ms < best) best = ms;
        }
        return +best.toFixed(3);
      };

      const nullFrame = async () => {
        const keep = { dpr: e.basePixelRatio, gtao: e.gtao.enabled, bloom: e.bloom.enabled,
                       smaa: e.smaa.enabled, shadows: e.renderer.shadowMap.enabled, vis: ctx.scene.visible };
        try {
          e.gtao.enabled = false; e.bloom.enabled = false; e.smaa.enabled = false;
          e.renderer.shadowMap.enabled = false;
          ctx.scene.visible = false;
          e.basePixelRatio = 0.5; e.renderScale = 1; e.resize();
          await new Promise(r => setTimeout(r, 500));
          const s = await burst(60);
          return { p95FrameMs: s.p95FrameMs, medianFrameMs: s.medianFrameMs,
                   medianGpuMs: s.medianGpuMs, calls: s.maxDrawCalls,
                   cpuProbeMs: cpuProbe() };
        } finally {
          ctx.scene.visible = keep.vis;
          e.gtao.enabled = keep.gtao; e.bloom.enabled = keep.bloom; e.smaa.enabled = keep.smaa;
          e.renderer.shadowMap.enabled = keep.shadows;
          e.basePixelRatio = keep.dpr; e.renderScale = 1; e.resize();
          await new Promise(r => setTimeout(r, 300));
        }
      };

      const capped = {}, rawDpr2 = {}, perScenario = {}, floors = {}, skipped = {};
      for (const name of Object.keys(SC)) {
        const r = await runScenario(name);
        if (r.skip) { skipped[name] = r.skip; continue; }
        capped[name] = r.capped; rawDpr2[name] = r.rawDpr2;
        perScenario[name] = { frozenCalls: r.frozen.calls, frozenSpread: r.frozen.spread,
                              drawsPerFrame: r.draws, ledger: r.ledger, attribution: r.attribution,
                              staging: __stage.casts[name] || null };
        // FIX ROUND 2 — the contention witness is sampled RIGHT AFTER the
        // scenario it guards, not once at the end of a five-minute run. The
        // single trailing probe read 0.53 ms of GPU in a quiet gap and so
        // declared the whole run attributable, while the scenarios themselves
        // had been measured against a second suite on the same GPU. Three
        // probes, spread across the run; the verdict uses the WORST.
        floors[name] = await nullFrame();
      }
      if (!Object.keys(floors).length) {
        e.setDynamicResolution(drsWas);
        return { pass: null, detail: Object.values(skipped)[0] + ' — every A21 scenario skipped: ' + JSON.stringify(skipped) };
      }
      const ceiling = batchCeiling();
      const fnames = Object.keys(floors);
      const floor = {
        p95FrameMs: Math.max(...fnames.map((n) => floors[n].p95FrameMs)),
        medianFrameMs: Math.max(...fnames.map((n) => floors[n].medianFrameMs)),
        medianGpuMs: fnames.every((n) => floors[n].medianGpuMs == null) ? null
          : Math.max(...fnames.map((n) => floors[n].medianGpuMs ?? 0)),
        calls: Math.max(...fnames.map((n) => floors[n].calls)),
        cpuProbeMs: { best: Math.min(...fnames.map((n) => floors[n].cpuProbeMs)),
                      worst: Math.max(...fnames.map((n) => floors[n].cpuProbeMs)) },
        perScenario: floors,
      };
      // Same loop, three points in a five-minute run: if it takes materially
      // longer in one scenario than another, the CPU this page got was not
      // constant and no JS millisecond in that run is the build's.
      const cpuInstability = +(floor.cpuProbeMs.worst / Math.max(0.001, floor.cpuProbeMs.best)).toFixed(2);
      e.basePixelRatio = Math.min(window.devicePixelRatio || 1, e.tier.dprCap);
      e.renderScale = 1; e.resize();
      e.setDynamicResolution(drsWas);

      const names = Object.keys(SC).filter((n) => !skipped[n]);
      /**
       * FIX ROUND 2 — grade the DPR-2 pass, not only the tier-capped one.
       * §4 says "accumulate 20 frames at DPR 2". The gate used to grade
       * the capped pass (applied ratio 1.5) and merely REPORTED the DPR-2 one,
       * which is quietly more lenient: the screen-space size cull thresholds on
       * basePixelRatio, so a lower applied ratio culls more meshes and yields
       * fewer draws (measured: up to 8 draws hidden). Every term is now graded
       * on the WORSE of the two passes — that includes the literal DPR-2 bar
       * and can never be more forgiving than either pass alone. Both passes
       * are still reported in full.
       *
       * R5 (gates-perf W0a, fix round 3) — EXCEPT the GPU term. Plan §9 re-casts
       * it as "median GPU <= 14 ms at the A-gpu-tier tier": a GPU budget is a
       * statement about the pixel ratio the tier ships, and no tier applies the
       * uncapped DPR-2 ratio (the cull argument above is about draw counts, not
       * about GPU time). Grading the GPU term on the worse pass failed it on a
       * pixel ratio the build never renders at. It is graded on the TIER pass
       * (applied = min(deviceDpr, tier.dprCap)) only; the DPR-2 GPU time is
       * reported beside it as medianGpuMsRawDpr2, never graded.
       */
      const worseOf = (n, k) => Math.max(capped[n][k], rawDpr2[n][k]);
      const graded = {};
      for (const n of names) {
        graded[n] = {
          maxDrawCalls: worseOf(n, 'maxDrawCalls'), maxTriangles: worseOf(n, 'maxTriangles'),
          p95FrameMs: worseOf(n, 'p95FrameMs'), p95JsMs: worseOf(n, 'p95JsMs'),
          medianGpuMs: capped[n].medianGpuMs ?? null,                 // the tier pass: graded
          medianGpuMsRawDpr2: rawDpr2[n].medianGpuMs ?? null,         // the uncapped DPR-2 pass: reported only
          // the parts of the graded JS number, from the pass that was graded
          jsParts: (() => {
            const src = capped[n].p95JsMs >= rawDpr2[n].p95JsMs ? capped[n] : rawDpr2[n];
            return { simMs: src.p95SimMs, submitMs: src.p95SubmitMs, tailMs: src.p95TailMs,
                     term: src.jsTerm, partsMissing: src.jsPartsMissing };
          })(),
          jsInstability: worseOf(n, 'jsInstability'),
          p95Instability: worseOf(n, 'p95Instability'),
          gpuInstability: capped[n].gpuInstability ?? null,           // of the graded (tier) pass
          gpuInstabilityRawDpr2: rawDpr2[n].gpuInstability ?? null,
          gradedFrom: { cappedPixelRatio: capped[n].effectivePixelRatio,
                        dpr2PixelRatio: rawDpr2[n].effectivePixelRatio,
                        gpuTerm: 'tier pass only (pixel ratio ' + capped[n].effectivePixelRatio + ')' },
        };
      }
      const callsOk = names.every(n => graded[n].maxDrawCalls <= B.drawCalls);
      const trisOk = names.every(n => graded[n].maxTriangles <= B.triangles);
      const frameOk = names.every(n => graded[n].p95FrameMs <= B.frameP95Ms);
      const jsOk = names.every(n => graded[n].p95JsMs <= B.jsP95Ms);
      // The wall-clock terms only mean something on a box that can present an
      // empty frame inside the budget. This is NOT a way to pass — when the
      // witnesses trip the gate resolves PENDING, never PASS — and the
      // deterministic terms always count. Three witnesses, sampled three times
      // (once after each scenario), because they catch different neighbours:
      // (a) null-frame rAF: nothing drawn, DPR 0.5 — if THAT misses vsync the
      //     box cannot present at all (CPU contention, thermal, a busy
      //     compositor).
      // (b) null-frame GPU: milliseconds of GPU time with nothing drawn means
      //     our command stream is queued behind another client's. Measured on
      //     this box: 0.53 ms idle, 4.92 ms with a second suite running — and
      //     the rAF half read a healthy 60.7 fps through the same contention,
      //     which is exactly why one witness is not enough.
      // (c) instability: four bursts of one pinned, frozen composition that
      //     disagree by more than a third are not measuring our frame.
      const unstable = Math.max(...names.map((n) => graded[n].p95Instability));
      const contended = floor.p95FrameMs > B.frameP95Ms * 0.9
        || (floor.medianGpuMs != null && floor.medianGpuMs > 3)
        || unstable > 1.4;
      const clockTermsCounted = !contended;

      /**
       * FIX ROUND 2 — the GPU term now votes.
       * The rAF interval is vsync-quantised and shared with every other Chrome
       * on the box, which is why it needs the witnesses above. The disjoint
       * timer query is neither: it measures OUR command stream. So when the
       * null frame proves the GPU is essentially idle for us (< 3 ms with
       * nothing drawn), a scene whose median GPU time blows the frame budget
       * is our cost and FAILS here — this term is deterministic enough to
       * count even on a run where the wall clock is not.
       */
      const gpuUnstable = Math.max(0, ...names.map((n) => graded[n].gpuInstability ?? 0));
      /*
       * R5 (gates-perf W0a, fix round 3) — the null frame alone does not make the GPU term
       * attributable. A frame with nothing drawn fits inside one GPU time slice, so a
       * sub-millisecond null frame says nothing about whether a 50 ms frame was preempted by
       * the other Chromes on the GPU (measured: this row read 137.5 ms on the spawn vista at
       * load 15-20 while A9, minutes earlier in the same run, read 54.9 ms on the same vista;
       * both null frames were < 5 ms). The term now also needs a QUIET BOX, read in node when
       * the row starts (BOX: 1-minute load average < 3, R26's quiet test, and 0 other gate
       * Chromes alive). On a loud box it is PENDING, attributed, never PASS.
       */
      const gpuJudgeable = BOX.quiet === true
        && floor.medianGpuMs != null && floor.medianGpuMs < 3
        && names.every((n) => graded[n].medianGpuMs != null)
        && gpuUnstable > 0 && gpuUnstable <= 1.4;
      // R5 (§9 A21 re-cast): median GPU <= 14 ms (B.gpuMedianMs) at the A-gpu-tier tier (engine-gpu
      // chooses it at W0b; today the shipped default, e.quality); Round 4 graded this term against
      // the 20 ms frame budget
      const gpuOk = !gpuJudgeable
        || names.every((n) => graded[n].medianGpuMs <= B.gpuMedianMs);
      const gpuBlockedBy = gpuOk ? null : {
        term: 'medianGpuMs', budget: B.gpuMedianMs, tier: e.quality, pixelRatio: applied,
        perScenario: Object.fromEntries(names.map((n) => [n, graded[n].medianGpuMs])),
        rawDpr2PerScenarioNotGraded: Object.fromEntries(names.map((n) => [n, graded[n].medianGpuMsRawDpr2])),
        nullFrameGpuMs: floor.medianGpuMs, gpuInstability: gpuUnstable, box: BOX,
        owner: 'the frame itself, at tier "' + e.quality + '" (pixel ratio ' + applied + '): on a quiet box (load '
             + BOX.load[0] + ', ' + BOX.otherGateChromes + ' other gate Chromes) the GPU gives us an empty frame in '
             + floor.medianGpuMs + ' ms, so the scene GPU time is ours to pay down (engine-gpu: A-gpu-tier, W0b).',
      };

      // Name the owner of whatever is over. Machine meshes have no LOD chain at
      // any distance (perf-tech-04) and near-unique materials (perf-tech-14),
      // so when they dominate the ledger the deficit is machine-rig's, not the
      // renderer's — say so in the failure instead of leaving it anonymous.
      const worst = names.slice().sort((a, b) => graded[b].maxDrawCalls - graded[a].maxDrawCalls)[0];
      const wd = perScenario[worst].drawsPerFrame;
      const machineDraws = (wd.main.machines || 0) + (wd.shadow.machines || 0);
      const blockedBy = callsOk ? null : {
        term: 'drawCalls', scenario: worst,
        over: graded[worst].maxDrawCalls - B.drawCalls,
        machineDrawsInWorstFrame: machineDraws,
        engineSideCeiling: ceiling.engineCeilingSaving,
        owner: 'machine-rig perf-tech-04 (LOD chains) + perf-tech-14 (per-species mesh/material budgets)',
        note: 'Engine-side levers are spent and measured: shadow casters culled to '
            + perScenario[worst].ledger.activeShadowCasters + ', screen-space cull hides '
            + perScenario[worst].ledger.sizeCulled + ' sub-pixel meshes/frame, post is '
            + wd.post + ' calls. Even a perfect BatchedMesh pass over every rigid machine mesh '
            + 'that shares a material signature would only save ' + ceiling.engineCeilingSaving
            + ' draws world-wide (' + ceiling.machineDrawsNow + ' -> ' + ceiling.machineDrawsIfEngineBatched
            + '), because the machines are ' + Object.values(ceiling.perSpecies).reduce((a, b) => a + b.skinned, 0)
            + ' skinned meshes and near-unique materials. Only per-species LOD chains close this.',
      };
      const frameBlockedBy = frameOk ? null : {
        term: 'frameP95Ms', nullFrame: floor, counted: clockTermsCounted, worstBurstInstability: unstable,
        owner: contended
          ? 'NOT ATTRIBUTABLE on this box: null frame p95 ' + floor.p95FrameMs + ' ms (gpu '
            + floor.medianGpuMs + ' ms) with nothing drawn, and four bursts of one FROZEN composition '
            + 'disagree by ' + unstable + 'x. Something outside this page decides when our frames land. '
            + 'Re-run on a quiet machine (one Chrome) before judging this term.'
          : 'the frame itself: an empty frame presents inside budget on this box, so the cost is ours.',
      };
      /**
       * THE JS TERM (Round 4 judge finding). Two things must be true before it
       * can be graded at all:
       *   (1) the engine must SAY what its JS number covers. perfSnapshot
       *       publishes jsTerm and the sim/submit/tail split; a build that
       *       reports neither is timing the submit half only — which is the
       *       exact defect this gate was rewritten for — and grading that
       *       against a "systems + submit" budget would be a false green.
       *   (2) the CPU this page got must have been constant across the run
       *       (cpuProbe), on top of the null-frame witnesses. JS milliseconds
       *       are performance.now() deltas: a preempted or throttled core
       *       inflates every one of them.
       */
      const JS_TERM = 'sim(steps+interpolate) + renderSubmit + frameTail';
      const jsWhole = names.every((n) => graded[n].jsParts.term === JS_TERM
        && graded[n].jsParts.simMs != null && graded[n].jsParts.partsMissing !== true);
      const jsUnstable = Math.max(...names.map((n) => graded[n].jsInstability ?? 0));
      const cpuStable = cpuInstability <= 1.4;
      const jsJudgeable = jsWhole && clockTermsCounted && cpuStable && jsUnstable <= 1.6;
      const jsWhy = jsJudgeable ? null
        : !jsWhole
          ? 'this build does not publish a whole-loop JS term (perfSnapshot().jsTerm = '
            + JSON.stringify(graded[names[0]].jsParts.term) + '), so the only number available is the '
            + 'render-submit half and grading it against a systems+submit budget would be a false green'
        : !clockTermsCounted
          ? 'the box is contended: null frame p95 ' + floor.p95FrameMs + ' ms (gpu ' + floor.medianGpuMs
            + ' ms) with nothing drawn, frame-burst instability ' + unstable + 'x'
        : !cpuStable
          ? 'the same fixed CPU loop took ' + cpuInstability + 'x longer in one scenario than another ('
            + floor.cpuProbeMs.best + ' -> ' + floor.cpuProbeMs.worst + ' ms): the cores were not ours for the whole run'
          : 'four JS bursts of one frozen composition disagree by ' + jsUnstable + 'x';
      const jsWorst = names.slice().sort((a, b) => graded[b].p95JsMs - graded[a].p95JsMs)[0];
      const jsBlockedBy = (jsJudgeable && !jsOk) ? {
        term: 'jsP95Ms', budget: B.jsP95Ms, scenario: jsWorst, value: graded[jsWorst].p95JsMs,
        parts: graded[jsWorst].jsParts, cpuProbeMs: floor.cpuProbeMs,
        owner: 'core-platform + whichever system dominates the sim half: of ' + graded[jsWorst].p95JsMs
             + ' ms, sim (every system update + interpolate) is ' + graded[jsWorst].jsParts.simMs
             + ' ms, render submit ' + graded[jsWorst].jsParts.submitMs + ' ms, frame tail '
             + graded[jsWorst].jsParts.tailMs + ' ms. F3 prints the same split live.',
      } : null;

      /**
       * PER-TERM STATUS — an unjudged term is PENDING WITH A REASON, never
       * PASS, and never silently folded into a verdict.
       * A red DETERMINISTIC term (calls / triangles / an attributable GPU
       * timer) FAILs on the spot: counters do not care how busy the box is.
       * Anything the gate could not measure honestly resolves PENDING and says
       * why, in its own row. Gate verdict = FAIL if any term FAILs, else
       * PENDING if any term is unjudged, else PASS.
       */
      const per = (k) => Object.fromEntries(names.map((n) => [n, graded[n][k]]));
      const T = (status, value, budget, extra) => Object.assign({ status, value, budget }, extra || {});
      const terms = {
        drawCalls: T(callsOk ? 'PASS' : 'FAIL', per('maxDrawCalls'), B.drawCalls,
          { measures: 'renderer.info.render.calls, whole frame, autoReset off (deterministic counter)',
            blockedBy }),
        triangles: T(trisOk ? 'PASS' : 'FAIL', per('maxTriangles'), B.triangles,
          { measures: 'renderer.info.render.triangles, whole frame (deterministic counter)',
            blockedBy: trisOk ? null : (() => {
              const w = names.slice().sort((a, b) => graded[b].maxTriangles - graded[a].maxTriangles)[0];
              return { term: 'triangles', scenario: w, over: graded[w].maxTriangles - B.triangles,
                       meshesWithin260m: perScenario[w].attribution.meshesWithin260m,
                       shadowCasters: perScenario[w].attribution.shadowCasters,
                       drawsPerFrame: perScenario[w].drawsPerFrame,
                       owner: 'whichever content lane owns the heaviest bucket above: the counter is '
                            + 'the whole frame, so a shadow-casting mesh is counted once per cascade. '
                            + 'core-platform levers (distance + screen-space culling, caster budget) '
                            + 'are already applied and reported in perScenario[' + w + '].ledger.' };
            })() }),
        medianGpuMs: T(!gpuJudgeable ? 'PENDING' : gpuOk ? 'PASS' : 'FAIL', per('medianGpuMs'), B.gpuMedianMs,
          { measures: 'EXT_disjoint_timer_query over the whole composer chain, graded on the TIER pass only: quality "' + e.quality
              + '", pixel ratio ' + applied + ' = min(device DPR ' + B.deviceDpr + ', tier dprCap ' + e.tier.dprCap
              + ') (plan §9 re-cast: <= 14 ms at the A-gpu-tier tier); the uncapped DPR-2 pass is reported as medianGpuMsRawDpr2, not graded',
            valueRawDpr2NotGraded: per('medianGpuMsRawDpr2'),
            box: BOX,
            reason: gpuJudgeable ? null
              : 'not attributable: ' + [
                  BOX.quiet === true ? null : 'the box is not quiet when the row starts (1-minute load average ' + BOX.load[0]
                    + (BOX.load[0] < 3 ? '' : ' >= 3') + ', ' + BOX.otherGateChromes + ' other gate Chrome(s) alive; needs < 3 and 0)',
                  floor.medianGpuMs != null && floor.medianGpuMs < 3 ? null : 'null-frame GPU ' + floor.medianGpuMs + ' ms with nothing drawn (needs < 3 ms)',
                  gpuUnstable > 0 && gpuUnstable <= 1.4 ? null : 'GPU-burst instability ' + gpuUnstable + 'x (needs <= 1.4x)',
                ].filter(Boolean).join('; ') + ' — graded on the orchestrator\\'s quiet-box run (port 5270, 0 lane Chromes)',
            blockedBy: gpuBlockedBy }),
        p95FrameMs: T(!clockTermsCounted ? 'PENDING' : frameOk ? 'PASS' : 'FAIL', per('p95FrameMs'), B.frameP95Ms,
          { measures: 'rAF interval, vsync-quantised wall clock',
            reason: clockTermsCounted ? null
              : 'not attributable: null frame p95 ' + floor.p95FrameMs + ' ms (gpu ' + floor.medianGpuMs
                + ' ms) with nothing drawn; frame-burst instability ' + unstable + 'x',
            blockedBy: frameBlockedBy }),
        p95JsMs: T(!jsJudgeable ? 'PENDING' : jsOk ? 'PASS' : 'FAIL', per('p95JsMs'), B.jsP95Ms,
          { measures: 'WHOLE main-loop callback: ' + (jsWhole ? JS_TERM : 'UNKNOWN (build does not say)'),
            parts: Object.fromEntries(names.map((n) => [n, graded[n].jsParts])),
            witnesses: { termDeclaredWholeLoop: jsWhole,
                         cpuInstability, cpuMax: 1.4, cpuProbeMs: floor.cpuProbeMs,
                         jsBurstInstability: jsUnstable, jsBurstMax: 1.6,
                         boxPresentsAFrame: clockTermsCounted },
            reason: jsWhy, blockedBy: jsBlockedBy }),
      };
      const statuses = Object.values(terms).map((t) => t.status);
      // R5: a skipped scenario is never folded into a PASS — the verdict is the
      // scenario's named SKIP unless a measured deterministic term FAILs.
      const skipNames = Object.keys(skipped);
      const verdict = statuses.includes('FAIL') ? false
        : (statuses.includes('PENDING') || skipNames.length) ? null : true;
      const say = (s) => Object.entries(terms).filter(([, t]) => t.status === s).map(([k]) => k);
      return { pass: verdict, detail: {
        verdict: (skipNames.length && verdict !== false ? skipped[skipNames[0]].split(':')[0] + ' (scenario ' + skipNames.join(' + ') + ') + ' : '')
          + (verdict === true ? 'PASS' : verdict === null ? 'PENDING' : 'FAIL') + ' — '
          + [say('FAIL').length ? 'FAIL ' + say('FAIL').join(' + ') : '',
             say('PENDING').length ? 'PENDING ' + say('PENDING').join(' + ') : '',
             say('PASS').length ? 'PASS ' + say('PASS').join(' + ') : '']
            .filter(Boolean).join('; ')
          + ' — see detail.terms for the reason on every unjudged term.',
        terms,
        gradedAt: 'GPU term: the tier pass (' + applied + ') only; draws, triangles, frame and JS: the worse of tier-capped (' + applied + ') and DPR ' + B.deviceDpr,
        box: BOX,
        deviceDpr: B.deviceDpr, appliedPixelRatio: applied, quality: e.quality, dynamicResolution: 'off for measurement',
        budget: { drawCalls: B.drawCalls, triangles: B.triangles, frameP95Ms: B.frameP95Ms, jsP95Ms: B.jsP95Ms, gpuMedianMs: B.gpuMedianMs },
        graded, capped, rawDpr2, callsOk, trisOk, gpuOk, gpuJudgeable, gpuInstability: gpuUnstable,
        frameOk, jsOk, jsJudgeable, jsWhole, jsInstability: jsUnstable,
        cpuProbeMs: floor.cpuProbeMs, cpuInstability,
        clockTermsCounted, nullFrame: floor,
        perScenario, skippedScenarios: skipped, batchCeiling: ceiling, blockedBy, frameBlockedBy, gpuBlockedBy,
      } };
    })()`;
    },
  },
  {
    id: 'A22-msaa', kind: 'action', lane: 'core-platform',
    title: 'Composer scene target is multisampled and an SMAA pass is live',
    settle: 900,
    assert: `(async () => {
      const e = __CTX__.engine;
      const passes = e.composer.passes.map(p => p.constructor.name);
      const samples = e.composer.renderTarget1.samples;
      const aaPass = e.composer.passes.find(p => /SMAA|TAA/.test(p.constructor.name));
      return { pass: samples >= 4 && !!aaPass && aaPass.enabled === true
                 && e.composer.renderTarget1 === e.sceneTarget,
               detail: { samples, aaPass: aaPass?.constructor.name ?? null,
                         aaEnabled: aaPass?.enabled ?? false,
                         sceneTargetIsRenderTarget1: e.composer.renderTarget1 === e.sceneTarget,
                         gtao: e.gtao.enabled, passes } };
    })()`,
  },

  {
    id: 'A20b-no-system-errors', kind: 'action', lane: 'core-platform',
    title: 'A clean boot plus 6 s of play quarantines nothing: systemErrors and hook errors both empty',
    setup: INPUT_ON, settle: 900, timeout: 40000,
    assert: `(async () => {
      const g = __GAME__, e = __CTX__.engine;
      const f0 = e.frames;
      // exercise the paths that only run under load: input, resize (which is
      // what dynamic resolution calls), quality swap, and the cull pass
      __CTX__.input.keys.add('KeyW');
      await new Promise(r => setTimeout(r, 1500));
      __CTX__.input.keys.add('ShiftLeft');
      await new Promise(r => setTimeout(r, 1500));
      __CTX__.input.keys.delete('KeyW'); __CTX__.input.keys.delete('ShiftLeft');
      e.resize();
      await new Promise(r => setTimeout(r, 1200));
      e.setQuality('medium'); await new Promise(r => setTimeout(r, 900));
      e.setQuality('high');   await new Promise(r => setTimeout(r, 1200));
      const errs = (g.systemErrors || []).map(r => ({ key: r.key, count: r.count, message: r.message.slice(0, 90) }));
      const hooks = e.hookErrorCount || 0;
      const frames = e.frames - f0;
      return { pass: errs.length === 0 && hooks === 0 && frames > 120,
               detail: { systemErrors: errs, hookErrors: hooks, framesAdvanced: frames,
                         quality: e.quality, stepMode: e.stepMode } };
    })()`,
  },
  {
    id: 'A45-no-skate-per-species', kind: 'action', lane: 'machine-rig',
    title: 'PER SPECIES: a planted machine foot does not skate (audit A45: stance drift <= 0.06 m)',
    settle: 500, timeout: 180000,
    assert: `(async () => {
      ${WAIT_VARIETY}
      ${SPECIES}
      const T = __CTX__.terrain, out = {};
      let worstAll = 0, measured = 0;
      for (const [kind, m] of species) {
        if (!m.debugFeet || m.debugFeet().length < 2) { out[kind] = 'no feet'; continue; }
        ${PROVOKE}
        const open = {}, done = [];
        const t0 = performance.now();
        let moved = 0, sx = m.position.x, sz = m.position.z;
        while (performance.now() - t0 < 5000) {
          moved += Math.hypot(m.position.x - sx, m.position.z - sz);
          sx = m.position.x; sz = m.position.z;
          for (const f of m.debugFeet()) {
            const on = f.planted && Math.abs(f.world.y - T.getHeight(f.world.x, f.world.z)) <= 0.25;
            const w = open[f.name];
            if (on) {
              if (!w) open[f.name] = { x0: f.world.x, x1: f.world.x, z0: f.world.z, z1: f.world.z, n: 1 };
              else {
                w.x0 = Math.min(w.x0, f.world.x); w.x1 = Math.max(w.x1, f.world.x);
                w.z0 = Math.min(w.z0, f.world.z); w.z1 = Math.max(w.z1, f.world.z); w.n++;
              }
            } else if (w) {
              if (w.n >= 4) done.push(+Math.hypot(w.x1 - w.x0, w.z1 - w.z0).toFixed(3));
              open[f.name] = null;
            }
          }
          await new Promise(r => requestAnimationFrame(r));
        }
        if (moved < 0.4 || done.length < 2) { out[kind] = { skipped: 'idle', movedM: +moved.toFixed(2), windows: done.length }; continue; }
        const worst = Math.max(...done);
        out[kind] = { maxStanceDriftM: worst, windows: done.length, movedM: +moved.toFixed(2) };
        worstAll = Math.max(worstAll, worst);
        measured++;
      }
      if (measured < 2) return { pass: null, detail: { note: 'SKIP: fewer than 2 species walked far enough to sample', out } };
      return { pass: worstAll <= 0.06, detail: { budgetM: 0.06, worstM: worstAll, speciesMeasured: measured, out } };
    })()`,
  },
  {
    id: 'A44-socket-integrity', kind: 'action', lane: 'machine-rig',
    title: 'PER SPECIES: every weak point sits on the hull (audit A44: gap <= 0.10 m) alive AND dead',
    settle: 600, timeout: 120000,
    assert: `(async () => {
      ${WAIT_VARIETY}
      ${SPECIES}
      ${HULL}
      const out = {}; let worst = 0, checked = 0;
      const scan = (m, phase, rec) => {
        const boxes = hullBoxes(m);
        if (!boxes.length || !m.weakPoints?.length) return;
        for (const wp of m.weakPoints) {
          if (!wp.obj) continue;
          const p = wp.obj.getWorldPosition(new V());
          const gap = Math.max(0, distToHull(p, boxes) - (wp.radius || 0));
          rec[phase + ':' + wp.name] = +gap.toFixed(3);
          if (gap > worst) worst = gap;
          checked++;
        }
      };
      for (const [kind, m] of species) {
        const rec = {};
        scan(m, 'alive', rec);
        out[kind] = rec;
      }
      // dead pass: kill one of each species and re-measure once it has settled
      for (const [, m] of species) {
        try { m.takeDamage({ impact: 99999, dir: new V(0, 0, 1), point: m.position.clone() }); } catch (e) { /* */ }
        if (m.alive) { try { m._die(); } catch (e) { /* */ } }
      }
      await new Promise(r => setTimeout(r, 3200));
      for (const [kind, m] of species) scan(m, 'dead', out[kind]);
      if (!checked) return { pass: null, detail: 'SKIP: no machine exposes weakPoints' };
      return { pass: worst <= 0.1, detail: { budgetM: 0.1, worstGapM: +worst.toFixed(3), pointsChecked: checked, out } };
    })()`,
  },
  {
    id: 'A47-corpse-grounded', kind: 'action', lane: 'machine-rig',
    title: 'PER SPECIES: a corpse settles ON the ground (audit A47: penetration <= 0.10 m, and it may not float)',
    settle: 600, timeout: 120000,
    assert: `(async () => {
      ${WAIT_VARIETY}
      ${SPECIES}
      ${HULL}
      const T = __CTX__.terrain, out = {};
      for (const [, m] of species) {
        try { m.takeDamage({ impact: 99999, dir: new V(0, 0, 1), point: m.position.clone() }); } catch (e) { /* */ }
        if (m.alive) { try { m._die(); } catch (e) { /* */ } }
      }
      await new Promise(r => setTimeout(r, 5000));
      let worst = 0, n = 0;
      for (const [kind, m] of species) {
        const boxes = hullBoxes(m);
        if (!boxes.length) { out[kind] = 'no hull'; continue; }
        let minY = 1e9, cx = 0, cz = 0;
        for (const b of boxes) { minY = Math.min(minY, b.mn.y); cx += (b.mn.x + b.mx.x) / 2; cz += (b.mn.z + b.mx.z) / 2; }
        cx /= boxes.length; cz /= boxes.length;
        const ground = T.getHeight(cx, cz);
        const off = minY - ground;
        out[kind] = { lowestMinusGroundM: +off.toFixed(2), dead: !m.alive };
        worst = Math.max(worst, Math.abs(off > 0 ? off / 0.4 : off / 0.3));
        n++;
      }
      if (!n) return { pass: null, detail: 'SKIP: no species hulls' };
      const bad = Object.entries(out).filter(([, v]) => v && v.lowestMinusGroundM !== undefined
        && (v.lowestMinusGroundM < -0.1 || v.lowestMinusGroundM > 0.4)).map(([k]) => k);
      return { pass: bad.length === 0, detail: { budget: 'penetration <= 0.10 m, float <= 0.40 m', offenders: bad, speciesChecked: n, out } };
    })()`,
  },
  {
    id: 'A48-cadence', kind: 'action', lane: 'machine-rig',
    title: 'PER SPECIES: stride cadence scales with body length, graded on MOVING frames (audit A48; airborne fraction reported)',
    /**
     * ORCHESTRATOR RULING Sep 26 (docs/ROUND4-AUDIT.md §4, machines-expansion
     * block), applied here by machines-expansion as the ruling names it the
     * owner of the gate and the ledger. What changed, and nothing else did —
     * the band, its reference (2.2 Hz at 2.5 m, sqrt of body length) and its
     * width (0.45x-1.35x) are exactly what they were:
     *
     *   1. "A48-cadence grades MOVING frames only: frames where the machine's
     *      horizontal speed is below 0.5x its walk speed (patrol waits,
     *      turns-in-place, takeoff/landing windows for fliers) are excluded
     *      from the cadence window." Speed is measured per drawn frame over
     *      SIM time (a patrol wait is sim time, machine-ai's clock) against
     *      the machine's own current \`walkSpeed\` (a grounded Flier
     *      publishes its ground walk there, the Round-4 flier file). A flier
     *      (\`flyCruise\` defined) has every frame within 1.0 sim-s of an
     *      \`_airborne\` change excluded, and every frame reporting fewer than
     *      two feet is excluded outright. The window is 5 s of MOVING wall
     *      time (it was 5 s of any wall time), collected for at most 15 s of
     *      wall time; a species with under 2 s of moving time is reported
     *      'idle' and not graded, which is what "moved < 0.4 m" meant before.
     *   2. "the stance ledger publishes a window that survives a slow frame
     *      (rig/contact.js latch counts a plant per dominant-clip stance
     *      wrap)." Every debugFeet() row now carries \`stances\`, the per-foot
     *      count of stance windows the rig's phase authority opened; a plant
     *      is an increment of that counter, attributed to the frame it is
     *      first seen on. A row without the field falls back to the rising
     *      edge of \`planted\`, as before.
     *
     * Cadence is still footfalls per foot per WALL second, over the moving
     * frames' wall time.
     */
    settle: 500, timeout: 360000,
    assert: `(async () => {
      ${WAIT_VARIETY}
      ${SPECIES}
      ${HULL}
      const E = __CTX__.engine;
      const out = {}; let measured = 0; const offenders = [];
      const WINDOW_S = 5, CAP_S = 15, MIN_S = 2, FLIGHT_WIN = 1.0;
      for (const [kind, m] of species) {
        if (!m.debugFeet || m.debugFeet().length < 2) { out[kind] = 'no feet'; continue; }
        const boxes = hullBoxes(m);
        let L = 1;
        for (const b of boxes) L = Math.max(L, Math.max(b.mx.x - b.mn.x, b.mx.z - b.mn.z));
        ${PROVOKE}
        const flier = typeof m.flyCruise === 'number';
        const rows = [];
        const lastCount = {}, lastPlanted = {};
        let px = m.position.x, pz = m.position.z, ps = E.simTime, pw = performance.now();
        let air = !!m._airborne, flips = [];
        let movingS = 0;
        const t0 = performance.now();
        while (movingS < WINDOW_S && performance.now() - t0 < CAP_S * 1000) {
          await new Promise(r => requestAnimationFrame(r));
          if (!m.alive) break;
          const now = performance.now(), st = E.simTime;
          const dW = (now - pw) / 1000, dS = st - ps;
          const dx = m.position.x - px, dz = m.position.z - pz;
          px = m.position.x; pz = m.position.z; ps = st; pw = now;
          if (!!m._airborne !== air) { air = !!m._airborne; flips.push(st); }
          const fs = m.debugFeet();
          let got = 0, planted = 0;
          for (const f of fs) {
            if (typeof f.stances === 'number') {
              const prev = lastCount[f.name];
              if (prev !== undefined && f.stances > prev) got += f.stances - prev;
              lastCount[f.name] = f.stances;
            } else {
              if (f.planted && lastPlanted[f.name] === false) got++;
            }
            lastPlanted[f.name] = !!f.planted;
            if (f.planted) planted++;
          }
          const speed = dS > 1e-5 ? Math.hypot(dx, dz) / dS : 0;
          const walk = Math.max(0.1, m.walkSpeed || 1);
          const row = { st, dW, dist: Math.hypot(dx, dz), got, feet: fs.length, planted,
                        moving: speed >= 0.5 * walk && fs.length >= 2 && !(flier && m._airborne) };
          rows.push(row);
          // online estimate (the flight windows are applied again below, both sides)
          if (row.moving && !(flier && flips.length && st - flips[flips.length - 1] < FLIGHT_WIN)) movingS += dW;
        }
        // a flier's takeoff / landing window is excluded on BOTH sides of the change
        let plants = 0, secs = 0, frames = 0, airborne = 0, moved = 0, feetN = 0, slow = 0, flight = 0;
        for (const r of rows) {
          if (!r.moving) { slow++; continue; }
          if (flier && flips.some((f) => Math.abs(r.st - f) < FLIGHT_WIN)) { flight++; continue; }
          plants += r.got; secs += r.dW; frames++; moved += r.dist;
          feetN = Math.max(feetN, r.feet);
          if (r.planted === 0) airborne++;
        }
        const hz = feetN && secs > 0 ? plants / feetN / secs : 0;
        // biomechanical scaling: stride frequency falls as sqrt of body length.
        // reference = a 2.5 m herd walker at 2.2 Hz; band is 0.45x - 1.35x of it.
        const ref = 2.2 / Math.sqrt(Math.max(0.5, L / 2.5));
        const lo = ref * 0.45, hi = ref * 1.35;
        const ok = (secs < MIN_S || moved < 0.4) ? null : hz >= lo && hz <= hi;
        out[kind] = { bodyLengthM: +L.toFixed(1), cadenceHz: +hz.toFixed(2),
                      bandHz: [+lo.toFixed(2), +hi.toFixed(2)], movingS: +secs.toFixed(2),
                      movedM: +moved.toFixed(2), plants, feet: feetN,
                      framesMoving: frames, framesExcluded: { slow, flight },
                      wallS: +((performance.now() - t0) / 1000).toFixed(1),
                      airborneFraction: frames ? +(airborne / frames).toFixed(3) : null,
                      status: ok === null ? 'idle' : ok ? 'ok' : 'OUT OF BAND' };
        if (ok === false) offenders.push(kind);
        if (ok !== null) measured++;
      }
      if (measured < 2) return { pass: null, detail: { note: 'SKIP: fewer than 2 species walked far enough to sample', out } };
      return { pass: offenders.length === 0, detail: { speciesMeasured: measured, offenders,
        rule: 'moving frames only (speed >= 0.5x walkSpeed over sim time; flier takeoff/landing +-1 s excluded); plants = per-foot stance-window counter increments', out } };
    })()`,
  },

  // ---------------- VISUAL GATES ----------------
  {
    id: 'V1-sprint-frame', kind: 'visual', lane: 'animator',
    title: 'Sprint mid-stride reads athletic',
    // R5: staged on gatePlaces.openGround like A3/A12 — from the spawn she sprints into the rest site's
    // tent and the frame shows her standing (filmed in the first W0a carried run)
    // R5 fix round 2: the meadow grass hid her legs and feet in every W0a frame (the subject is the
    // body, as in V13/V14, which hide it too)
    setup: placedSetup(['openGround'], `${INPUT_ON} standAt(__CTX__.player, 'openGround'); { const __veg = __CTX__.scene.getObjectByName('vegetation'); if (__veg) __veg.visible = false; } __CTX__.input.keys.add('KeyW'); __CTX__.input.keys.add('ShiftLeft');`),
    settle: 2300,
    criteria: 'Visible arm swing (a wrist clearly away from the hip line), forward torso lean, stride extension, hair/cloth trailing. FAIL if arms hang straight or pose reads as walking mannequin.',
  },
  {
    id: 'V2-idle-frame', kind: 'visual', lane: 'animator',
    title: 'Idle stance reads alive and asymmetric',
    settle: 4000,
    criteria: 'Weight settled into one hip (pelvis offset), relaxed asymmetric arms, natural head angle. FAIL if perfectly symmetric A-pose-with-arms-down.',
  },
  {
    id: 'V3-crouch-stalk', kind: 'visual', lane: 'animator',
    title: 'Crouch-walk reads as stalking',
    // R5: staged on gatePlaces.openGround (from the spawn the crouch-walk runs into the rest site)
    // R5 fix round 2: the meadow grass hid the crouched silhouette (the subject is the body)
    // R5 fix round 3: crouch is a TOGGLE bound with input.onDown('KeyC') (player.js), which fires
    // only from a real keydown (input._press); Round 4's keys.add('KeyC') never crouched her (judge
    // control: crouching false, 4.90 m/s, head 1.275 m). A real KeyC keydown + keyup, as the
    // player-control rows do; W is polled (isDown), so it stays a held key.
    setup: placedSetup(['openGround'], `${INPUT_ON} standAt(__CTX__.player, 'openGround'); { const __veg = __CTX__.scene.getObjectByName('vegetation'); if (__veg) __veg.visible = false; } { if (__CTX__.player.crouching) __CTX__.player.setCrouch(false); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC' })); } __CTX__.input.keys.add('KeyW');`),
    settle: 2300,
    criteria: 'Silhouette ~60% of standing height, torso pitched forward ~30°, weapon held low, one hand low for balance. FAIL if it reads as slightly-bent standing.',
  },
  {
    id: 'V4-aim-anchor', kind: 'visual', lane: 'animator',
    title: 'Full draw anchored at cheek',
    setup: `${INPUT_ON} __CTX__.input.mouse.buttons |= 4; setTimeout(() => { __CTX__.input.mouse.buttons |= 1; }, 400);`,
    settle: 2200,
    criteria: 'Draw hand at cheek/jaw, elbow high and level, arrow nocked ON the string line, torso twisted toward target. FAIL if arrow floats detached or draw hand is off the face.',
  },
  {
    id: 'V5-machine-stride', kind: 'visual', lane: 'machines',
    title: 'The flanker mid-stride: lifted swing leg + planted stance leg',
    setup: stagedSetup([], `(async () => {
      // R5: the flanker role, else any other staged (non-legacy) role kind, named in the shot log
      const m = (await stageRole('flanker')) || (await stageRole(anyKind().role || 'flanker'));
      if (!m) { __skipCard((noKindsSkip() || { detail: 'SKIP-R18: no flanker (or other staged kind) could be staged' }).detail); return; }
      const p = __CTX__.player;
      p.position.set(m.position.x + 9, 0, m.position.z + 7);
      p.camYaw = Math.atan2(m.position.x - p.position.x, m.position.z - p.position.z) + Math.PI;
      p.camPitch = 0.18; p._snapToGround?.();
    })();`),
    settle: 2500,
    criteria: 'At least one leg clearly lifted mid-swing while a contralateral foot is planted ON the ground line. No vertex smearing/stretching at the hips. FAIL if legs are frozen or feet hover.',
  },
  {
    id: 'V6-machine-death', kind: 'visual', lane: 'machines',
    title: 'Machine wreck reads as collapsed, not sunk',
    setup: stagedSetup(['sentry'], `(async () => { const w = await stageRole('sentry'); if (w) { let mesh = null; w.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; }); const p = __CTX__.player; p.position.set(w.position.x + 7, 0, w.position.z + 5); p.camYaw = Math.atan2(w.position.x - p.position.x, w.position.z - p.position.z) + Math.PI; p.camPitch = 0.2; p._snapToGround?.(); w.takeDamage({ point: w.position.clone(), object: mesh, impact: 99999, tear: 0, element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'hunter', baseDamage: 99999 }); } })();`),
    settle: 3500,
    criteria: 'Corpse shows buckled legs / dropped neck / keeled body ON the terrain surface. FAIL if it is a half-sunk intact statue.',
  },
  {
    id: 'V7-vista-mountains', kind: 'visual', lane: 'environment',
    title: 'Mountain ring silhouettes varied, no wallpaper banding',
    // R5: from gatePlaces.ringSkyline, a fixed lens looking UP at the ring's crest on the Round-4
    // bearing (yaw 3.1, facing +Z). Fix round 2: the chase camera at the Round-4 pitch, from the
    // spawn (the rest site's huts) and from midgroundVista (a beige wall with no sky: the crest sits
    // 21-39 deg above every station), never put the skyline in frame; the judge could not grade it.
    setup: placedSetup(['ringSkyline'], `(() => {
      const ctx = __CTX__, cam = ctx.camera, T = ctx.terrain;
      const RV = PLACE('ringSkyline');
      const p = ctx.player;
      p._updateCamera = () => {};
      if (ctx.studio) ctx.studio.update = () => {};
      p.position.set(RV.x, 0, RV.z); p._snapToGround?.();
      const y = T.getHeight(RV.x, RV.z);
      const shot = () => {
        cam.fov = 52; cam.updateProjectionMatrix();
        cam.position.set(RV.x, y + 5.0, RV.z);
        cam.lookAt(RV.look.x, y + RV.look.dy, RV.look.z);
        cam.updateMatrixWorld(true);
      };
      shot();
      setInterval(shot, 8);
    })();`),
    settle: 1800,
    criteria: 'Peaks differ in silhouette across the skyline; strata banding only on some faces; irregular snowline. FAIL if the same striped wall texture repeats uniformly.',
  },
  {
    id: 'V8-riverbed', kind: 'visual', lane: 'environment',
    title: 'Riverbed is a place, not a void',
    setup: placedSetup([], `(() => {
      const w = __CTX__.environment?.water;
      const p = w?.pools?.[0];
      if (p) { __CTX__.player.position.set(p.x + 10, 0, p.z + 8); __CTX__.player.camYaw = Math.atan2(p.x - __CTX__.player.position.x, p.z - __CTX__.player.position.z) + Math.PI; __CTX__.player.camPitch = 0.25; __CTX__.player._snapToGround?.(); }
      else if (PLACE('waterFeature')) { const s = standAt(__CTX__.player, 'waterFeature'); __CTX__.player.camPitch = s.pitch ?? 0.2; }
    })();`),
    settle: 1800,
    criteria: 'River rocks / a standing pool with reeds / moisture gradient visible in the cut. FAIL if featureless brown plane.',
  },
  {
    id: 'V9-sky-golden', kind: 'visual', lane: 'environment',
    title: 'Sky has golden-hour drama',
    params: 'yaw=0.2&pitch=-0.15',
    settle: 1800,
    criteria: 'Clouds with sunlit edges, warm horizon gradient toward sun bearing, tasteful god rays or light shafts. FAIL if flat haze gradient.',
  },
  {
    id: 'V10-hud-language', kind: 'visual', lane: 'hud',
    title: 'HUD combat state reads as one designed system (Round-4 HUD criteria until shell-ui\'s field-book HUD, W2)',
    setup: stagedSetup(['sentry'], `${INPUT_ON}
      await (async () => {
        const w = await stageRole('sentry');
        if (!w) { __skipCard('STAGING FAILED: the sentry kind (' + KIND.sentry + ') could not be staged — this frame has no subject'); return; }
        __CTX__.player.position.set(w.position.x + 10, 0, w.position.z + 10);
        let mesh = null; w.root.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
        w.takeDamage({ point: w.position.clone(), object: mesh, impact: 25, tear: 0,
                       element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'hunter', baseDamage: 25 });
        setTimeout(() => { w.takeDamage({ point: w.position.clone(), object: mesh, impact: 18, tear: 0,
                       element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'hunter', baseDamage: 18 }); }, 900);
        __CTX__.input.mouse.buttons |= 4;
      })();`),
    settle: 2400,
    criteria: 'Machine status stack visible (thin tracked-caps name, awareness cue, no mustard text), styled damage numbers (off-white/yellow), compass diamond pips, health bar cluster, reticle. FAIL if generic yellow-text bars.',
  },
  {
    id: 'V13-aim-strafe', kind: 'visual', lane: 'animator',
    title: 'Aim side-step reads as a weighted step, not a splay',
    // Deterministic recipe: flat meadow, aim held, strafe to HER left for 2.4s,
    // then lock a front camera 6.5m out and freeze so the judge always sees the
    // same mid-step frame. Vegetation is hidden so the feet are visible.
    setup: placedSetup(['openGround'], `${INPUT_ON}
      (() => {
        const C = __CTX__, p = C.player;
        C.state = 'playing';
        document.getElementById('hud').style.display = 'none';
        standAt(p, 'openGround'); p.camPitch = 0;
        C.input.mouse.buttons |= 4;
        C.input.keys.add('KeyA');
        const veg = C.scene.getObjectByName('vegetation'); if (veg) veg.visible = false;
        setTimeout(() => {
          /* fix round 4 (judge r1: "Brea is only about 370 px tall in the frame,
           * which makes the legs hard to read"): 3.3 m out (was 6.5 m), the lens
           * at hip height (combat's aim zoom owns the FOV while she aims — it
           * reads ~44 deg here — so the distance is the lever): she fills ~63 %
           * of the frame's height */
          p._updateCamera = function () {
            const cam = this.ctx.camera;
            cam.position.set(this.position.x, this.position.y + 1.0, this.position.z + 3.3);
            cam.lookAt(this.position.x, this.position.y + 0.82, this.position.z);
          };
          C.camera.fov = 22; C.camera.updateProjectionMatrix();
          setTimeout(() => {
            C.engine.timeScale = 0;
            /* R33 (g): the staging asserts the aim state (aiming, the bow in her
             * hand) before it is filmed, or the frame says it failed by name */
            const bowIn = !!C.combat?.bow?.group && C.combat.bow.group.visible !== false && C.combat.bow.group.parent === C.combat._bowNode;
            if (!p.aiming || !bowIn) {
              const d = document.createElement('div');
              d.style.cssText = 'position:fixed;left:0;top:0;right:0;z-index:2147483647;background:#7a1010;color:#fff;font:600 22px/1.4 ui-monospace,Menlo,monospace;padding:18px';
              d.textContent = 'V13 STAGING FAILED: aiming=' + !!p.aiming + ' bowInHand=' + bowIn + ' — this frame is not an aim side-step';
              document.body.appendChild(d);
            }
          }, 900);
        }, 2400);
      })();`),
    settle: 4200,
    criteria: 'Locked front view of an aiming side-step (she is travelling to HER left, i.e. '
      + 'screen right; a red banner across the top means the staging was not aiming = FAIL). PASS if both feet point roughly the same way (within ~20 deg of each '
      + 'other) and toward the travel direction, the stance reads as a weighted step, and the '
      + 'upper body still holds the bow up on target. FAIL on a duck-footed A-stance (feet '
      + 'splayed away from each other), on a foot dragging on its toe tip, on the legs reading '
      + 'crossed or tangled, or on the swing leg kicking opposite to the travel direction.',
  },
  {
    id: 'V14-slope-contour', kind: 'visual', lane: 'animator',
    title: 'Standing across a cross-slope: both soles lie ON the ground, banked with it',
    // Deterministic recipe: scan for the steepest locally-consistent surface in
    // the 20-24 deg band, stand ACROSS its fall line, lock a camera along the
    // contour at boot height so the judge is looking down the slope line, and
    // freeze. This is the frame the fix-round judge shot as
    // shots/judge-locomotion-r1-slope-contour.png.
    setup: placedSetup(['openGround'], `${INPUT_ON}
      (() => {
        const C = __CTX__, p = C.player, T = C.terrain;
        C.state = 'playing';
        document.getElementById('hud').style.display = 'none';
        const veg = C.scene.getObjectByName('vegetation'); if (veg) veg.visible = false;
        const n = new p.position.constructor();
        const nAt = (x, z) => { const v = new p.position.constructor(); T.getNormal(x, z, v); return v; };
        let best = null;
        // search the open-ground place's own 65 m neighbourhood: far corners of
        // the map render the hero at a reduced detail level and the film reads worse
        const O = PLACE('openGround');
        for (let x = O.x - 65; x <= O.x + 65; x += 2) for (let z = O.z - 65; z <= O.z + 65; z += 2) {
          const v = nAt(x, z);
          const a = Math.acos(Math.max(-1, Math.min(1, v.y))) * 180 / Math.PI;
          if (a < 20 || a > 24) continue;
          let ok = true;
          for (const [dx, dz] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]) {
            if (nAt(x + dx, z + dz).dot(v) < 0.9945) { ok = false; break; }
          }
          if (ok && (!best || a > best.a)) best = { x, z, a, n: v };
        }
        if (!best) return;
        const fall = Math.atan2(-best.n.x, -best.n.z);
        p.position.set(best.x, 0, best.z); p.velocity.set(0, 0, 0);
        p.heading = fall + Math.PI / 2; p.camYaw = p.heading; p._snapToGround();
        p._updateCamera = function () {
          const cam = this.ctx.camera;
          // stand off ALONG the contour, low, so the slope line reads
          const a = fall + Math.PI / 2;
          cam.position.set(this.position.x + Math.sin(a) * 3.4, this.position.y + 0.55,
                           this.position.z + Math.cos(a) * 3.4);
          cam.lookAt(this.position.x, this.position.y + 0.30, this.position.z);
        };
        setTimeout(() => { p.heading = fall + Math.PI / 2; }, 900);
        setTimeout(() => { C.engine.timeScale = 0; }, 1800);
      })();`),
    settle: 3000,
    criteria: 'Close, low view along the contour of a ~22 deg cross-slope, both boots in frame. '
      + 'PASS if each sole lies flat ON the ground, BANKED with the slope (the boot tops tilt '
      + 'with the hillside, not with the horizon), with no visible air gap under either boot and '
      + 'no boot sunk into the dirt; the uphill leg reads shorter than the downhill one. FAIL if '
      + 'either sole is held horizontal in world space while the ground falls away under it, if '
      + 'the downhill boot hangs clear of the ground with its toe pointing into space, if a heel '
      + 'is lifted off the surface, or if the whole body is levitating above the hillside.',
  },
  {
    id: 'V12-sprint-vs-reference', kind: 'visual', lane: 'animator',
    title: 'Sprint side profile matches the licence-clean side-sprint reference',
    // R5: the Round-4 reference was a publisher still (deleted at W0b, A-reference-clean);
    // the licence-clean reference arrives with A-reference-set (gates-perf W0b).
    reference: 'reference/r5/gates-perf/run-side (A-reference-set, W0b)',
    // Deterministic recipe: teleport to the flat meadow, lock a side camera on
    // her RIGHT (char -X) 3.6m out at chest height, sprint north, and hold the
    // frame the moment a foot is clip-flagged planted so the judge always sees
    // a contact frame rather than a random point of the flight phase.
    setup: placedSetup(['openGround'], `${INPUT_ON}
      (() => {
        const p = __CTX__.player;
        __CTX__.state = 'playing';
        document.getElementById('hud').style.display = 'none';
        standAt(p, 'openGround', { dz: -7 });
        // R5 fix round 2: the meadow grass hid both feet, so clause (1) could not be judged
        { const veg = __CTX__.scene.getObjectByName('vegetation'); if (veg) veg.visible = false; }
        p._updateCamera = function () {
          const s = Math.sin(this.heading), c = Math.cos(this.heading);
          const cam = this.ctx.camera;
          cam.position.set(this.position.x - 3.6 * c, this.position.y + 1.25, this.position.z + 3.6 * s);
          cam.lookAt(this.position.x, this.position.y + 1.05, this.position.z);
        };
        __CTX__.input.keys.add('KeyW'); __CTX__.input.keys.add('ShiftLeft');
        setTimeout(function hold() {
          if (__CTX__.player.animator.debugFeet().some(f => f.planted)) { __CTX__.engine.timeScale = 0; return; }
          requestAnimationFrame(hold);
        }, 1500);
      })();`),
    settle: 2400,
    criteria: 'Mid-sprint contact frame, camera on her right side. PASS needs ALL of: (1) the rear foot is ON the ground line — sole touching, not hovering and not buried; (2) forward torso lean roughly 25-45° with the chest ahead of the hips; (3) opposing arm swing — one elbow driven back past the hip line, the other forward across the chest, both bent, neither hanging straight; (4) a long stride: front thigh lifted toward horizontal, rear leg extended behind; (5) hair and skirt trailing BEHIND her, not hanging vertically. FAIL if both feet float clear of the ground, if the legs are near-symmetric, if the arms hang, or if any limb bends backwards / the knee inverts.',
  },
  {
    id: 'V20-aa-crop', kind: 'visual', lane: 'core-platform',
    title: 'Anti-aliasing: 4x nearest-neighbour crop of a pine ridge against sky',
    // The crop is done in-page from the WebGL canvas inside engine.onAfterRender
    // (same task as the render, so the drawing buffer is still intact without
    // preserveDrawingBuffer) and blown up 4x with smoothing off, so the shot the
    // judge sees IS the pixel evidence: MSAA + SMAA must put intermediate
    // values on every silhouette edge.
    setup: placedSetup(['aaRidgeView'], `(() => {
      const ctx = __CTX__, e = ctx.engine, p = ctx.player;
      ctx.state = 'playing';
      const hud = document.getElementById('hud'); if (hud) hud.style.display = 'none';
      const s = standAt(p, 'aaRidgeView'); p.camPitch = s.pitch;   // a tree line against open sky (R5: was the map origin)
      setTimeout(() => {
        e.requestTimeScale('gate', 0);
        const src = e.renderer.domElement;
        const cv = document.createElement('canvas');
        cv.width = 1600; cv.height = 900;
        cv.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483647;image-rendering:pixelated';
        const g = cv.getContext('2d');
        g.imageSmoothingEnabled = false;
        document.body.appendChild(cv);
        const SX = 140, SY = 300, SW = 400, SH = 225; // pine ridge against sky
        e.onAfterRender.push(() => {
          g.imageSmoothingEnabled = false;
          g.drawImage(src, SX * (src.width / 1600), SY * (src.height / 900),
                      SW * (src.width / 1600), SH * (src.height / 900), 0, 0, 1600, 900);
          g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
          g.strokeRect(1, 1, 1598, 898);
          g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 856, 470, 44);
          g.fillStyle = '#dfeaf2'; g.font = '18px ui-monospace, Menlo, monospace';
          g.fillText('4x NEAREST CROP  src ' + SX + ',' + SY + ' ' + SW + 'x' + SH
            + '  msaa ' + e.composer.renderTarget1.samples, 12, 884);
        });
      }, 1400);
    })();`),
    settle: 3200,
    criteria: 'Every silhouette edge (pine needles against sky, ridge line, branch tips) shows a gradient of intermediate pixels between the tree colour and the sky colour — at 4x magnification the edge should read as a soft 2-3 pixel ramp. FAIL if edges are pure hard stair-steps with exactly two colours and no in-between values, which is what samples=0 looked like in Round 3 (compare shots/verify-perf-tech-aa-crop.png).',
  },
];
  return { GATES };
})();

/* ========================================================================== */

/* source: tools/gates.round4.anim-core.mjs (Round 4), re-staged for Round 5 */
/* ========================================================================== */
const __S_anim_core = await (async () => {
/**
 * Round 4 gate block — lane `anim-core` (§4 of docs/ROUND4-AUDIT.md).
 *
 * Same contract as tools/gates.config.mjs: ACTION gates run `assert` in page
 * context with `__CTX__` / `__GAME__` available and resolve
 * `{ pass, detail }`; a console error during a gate is an automatic FAIL;
 * a missing API resolves `{ pass: null }` (PENDING, not FAIL).
 *
 * tools/* is owned by core-platform, so this block lives in its own file and
 * the runner merges every `tools/gates.round4.*.mjs` alongside GATES.
 *
 * FIX ROUND 1 — four judge findings are answered here and in
 * src/entities/anim/{clipLayer,locomotion,registry}.js:
 *   1+5  `stuck()` short-circuited on external layers, so A27's two stuck
 *        clauses could not fail. ClipLayer now has a real external detector
 *        (owner-declared intent + timeline stall) and A27 PROVES it can fire,
 *        headlessly and on the live roll layer, before asserting it is empty.
 *   2    A27's literal subject (flier) is no longer folded into an the hero
 *        PASS: it is its own gate, A27b, which reports PENDING while
 *        machine-rig has not migrated and FAILS the moment they claim to have.
 *   3+4  A26 could not fail on machine-side divergence. `audit()` now marks a
 *        divergent machine rig `legacy` and carries a `machines.ok` term, and
 *        the pass expression below reads both.
 *   6    A27 repaired the cross-lane NaN and then asserted the repaired
 *        condition. The verdict is now computed first; the restore happens
 *        after it, only so the gate's screenshot is not a black frame.
 */

const INPUT_ON = `__CTX__.input.enabled = true;`;

/**
 * combat.js and wheel.js both WRITE engine.timeScale every frame (they damp it
 * toward their own target), so a plain assignment survives about one frame.
 * To hold a slow-motion condition for a measurable window the gate pins the
 * property behind an accessor whose setter is a no-op, then restores the plain
 * data property. Nothing in src/ is modified; the pin is undone in a finally.
 */
const PIN = `
  const pinTS = (eng, v) => {
    const had = Object.getOwnPropertyDescriptor(eng, 'timeScale');
    const prev = eng.timeScale;
    Object.defineProperty(eng, 'timeScale', {
      configurable: true, enumerable: true, get: () => v, set: () => {},
    });
    return () => {
      if (had) Object.defineProperty(eng, 'timeScale', had);
      else Object.defineProperty(eng, 'timeScale',
        { value: prev, writable: true, enumerable: true, configurable: true });
      eng.timeScale = prev;
    };
  };
`;

const GATES = [
  {
    id: 'A26-one-convention', kind: 'action', lane: 'anim-core',
    title: 'One bone-space convention: __CTX__.anim.audit() proves every hero rotation path is BoneSpace, and FAILS on any live rig — hero or machine — that diverges',
    settle: 1500,
    assert: `(async () => {
      const anim = __CTX__.anim || window.__ANIM__;
      if (!anim || typeof anim.audit !== 'function') {
        return { pass: false, detail: 'no __CTX__.anim.audit() — anim-core did not publish' };
      }
      const a = anim.audit(__CTX__);
      const st = anim.selftest(0.02);
      // R5: the protagonist's section of the audit is the one carrying the live
      // animator probe, whatever the registry names the rig (hero-body renames
      // its rows to the rig profile id in W0b) — never a literal rig name here.
      const heroKey = Object.keys(a).find((k) => a[k] && typeof a[k] === 'object' && 'animatorProbe' in a[k] && Array.isArray(a[k].rows));
      if (!heroKey) return { pass: false, detail: 'audit() publishes no hero section (no object with animatorProbe + rows)' };
      const hero = a[heroKey];
      const probe = hero.animatorProbe;
      const ml = a.machines.local;

      // The bar, literally:
      //  1. every anim-core module exists and its algebra self-test passes
      //  2. zero rig modules in the KNOWN_MODULES table are 'legacy' — that
      //     status is set by a LIVE probe, not by self-declaration, and now
      //     covers the machine rigs as well as the hero (judge findings 3+4)
      //  3. every the hero rotation path is BoneSpace, and the one still owned by
      //     another lane (playerAnimator, player-anim, Wave 2) is proved
      //     identical to BoneSpace on the LIVE rig — an import swap, not a
      //     second convention
      //  4. the machine rigs that ARE reachable are identical too, so a
      //     Wave 1 migration that changes the algebra fails this gate instead
      //     of merely printing DIVERGENT in the detail
      const pass = !!(a.ok && st.pass
        && a.modulesPresent
        && a.legacyModules.length === 0
        && hero.ok && hero.divergent.length === 0
        && probe && probe.reachable === true && probe.identical === true
        && probe.entryTableValid === true
        && a.machines.ok === true
        && (ml && ml.reachable ? ml.identical === true : true));

      return { pass, detail: {
        version: a.version,
        modules: Object.keys(a.modules).filter(k => a.modules[k]).join('+'),
        algebraMaxDeltaRad: a.algebra.maxDeltaRad,
        clipLayerSelftest: st.clipLayer.pass,
        stuckDetectorSelftest: st.stuckDetector.pass,
        rigSelftest: st.rig.pass,
        legacyModules: a.legacyModules,
        selfDeclaredForeign: a.selfDeclaredForeign,
        registered: a.registered.map(r => r.id + '=' + r.convention),
        heroSection: heroKey, heroPaths: hero.rows,
        animatorEquivalence: probe && {
          bones: probe.bones, probed: probe.checked,
          maxDeltaRad: probe.maxDeltaRad, identical: probe.identical,
          entryTableValid: probe.entryTableValid,
        },
        machinesOk: a.machines.ok,
        machineLocalEquivalence: ml,
        mixerSpecies: a.machines.mixer,
        pendingMigration: a.pendingMigration.map(p => p.id + ' -> ' + p.owner + ' (wave ' + p.wave + ')'),
        doc: a.doc,
      } };
    })()`,
  },

  {
    id: 'A27-timescale-safe', kind: 'action', lane: 'anim-core',
    title: 'Hero one-shots restore on mixer time, not wall clock: 0.02 timeScale through a roll leaves no action stuck — and the stuck detector is proved able to fire first',
    setup: INPUT_ON,
    settle: 900,
    assert: `(async () => {
      const anim = __CTX__.anim || window.__ANIM__;
      if (!anim || typeof anim.selftest !== 'function') {
        return { pass: false, detail: 'no __CTX__.anim — anim-core did not publish' };
      }
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      ${PIN}
      const eng = __CTX__.engine, p = __CTX__.player, an = p.animator;
      const TS = 0.02;

      /* ---- 1. headless proof: one-shot restores on animation time, AND the
              stuck detector fires for every state it claims to catch ---- */
      const st = anim.selftest(TS);

      /* ---- 2. FALSIFIABILITY on the live rig ------------------------------
         The first Round 4 drop asserted \`stuck.length === 0\` on layers whose
         stuck() opened with \`if (this.external) return null\`. Before this gate
         is allowed to read anything into an empty list, it forces the REAL
         the hero roll layer into each stuck state and checks the detector reports
         it. Purely synchronous: no frame is drawn between the force and the
         restore, and update() rewrites the weight from the action next tick. */
      let falsifiable = { reachable: false };
      const loco = an && an.loco;
      const rollLayer = loco && loco.set && loco.set.get && loco.set.get('roll');
      if (rollLayer) {
        const save = {
          intent: rollLayer.intent, intentT: rollLayer.intentT,
          overstayT: rollLayer.overstayT,
          stallT: rollLayer.stallT, weight: rollLayer.weight,
          _lastIntent: rollLayer._lastIntent,
        };
        try {
          const before = rollLayer.stuck();
          rollLayer.intent = 0; rollLayer.overstayT = 9; rollLayer.weight = 0.9;
          const heldAfterIntent = rollLayer.stuck();
          const setSees = loco.audit().stuck.map(s => s.name);
          rollLayer.intent = 1; rollLayer.overstayT = 0;
          rollLayer.stallT = 9; rollLayer.weight = 0.9;
          const frozenScrub = rollLayer.stuck();
          falsifiable = {
            reachable: true, external: rollLayer.external, scrubbed: rollLayer.scrubbed,
            healthyBefore: before,
            heldAfterIntent, frozenScrub, setRollup: setSees,
            // the clause A27 asserts must be able to come out non-empty
            canFail: before === null
              && typeof heldAfterIntent === 'string' && /after intent cleared/.test(heldAfterIntent)
              && typeof frozenScrub === 'string' && /frozen/.test(frozenScrub)
              && setSees.indexOf('roll') >= 0,
          };
        } finally {
          rollLayer.intent = save.intent; rollLayer.intentT = save.intentT;
          rollLayer.overstayT = save.overstayT;
          rollLayer.stallT = save.stallT; rollLayer.weight = save.weight;
          rollLayer._lastIntent = save._lastIntent;
        }
        falsifiable.healthyAfterRestore = rollLayer.stuck();
      }

      /* ---- 3. the live the hero roll one-shot under a pinned 0.02 timeScale ---- */
      // NOTE the fixed-step loop (main.js, D5) only advances the sim once the
      // accumulator reaches 1/60 s, so at timeScale 0.02 roughly 49 frames in
      // 50 tick every system with dt === 0. That is the condition this gate
      // exists to survive; anim-core is dt-0 safe (ClipLayer guards dt > 0,
      // LocomotionBlend only ever multiplies BY dt).
      let live = { skipped: 'no clip base' };
      let liveOk = null;
      let crossLane = [];
      let repair = null;
      const roll = loco && loco.actions && loco.actions.roll;
      const finite = (v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
      if (loco && roll && typeof loco.audit === 'function') {
        const dur = roll.getClip().duration;
        const homePos = p.position.clone();
        // ---- REGRESSION GUARD: dodge OUT OF A SPRINT, not from a standstill.
        // The first Round 4 drop rolled from rest, and passed. In the full
        // suite it FAILED, because a dodge that interrupts locomotion is a
        // different state: every gait layer's intent drops to 0 while its
        // weight is still high, and locomotion.js normalizes by the weight
        // sum — as the sum dips during the roll's ramp, the division pushes
        // those decaying tails back UP. A detector that timed the age of the
        // intent value instead of the age of the overstay fired on that. This
        // is also just what a player does, so the gate now does it too and
        // the two stuck-list clauses below are measured in that state.
        __CTX__.input.keys.add('KeyW');
        __CTX__.input.keys.add('ShiftLeft');
        await sleep(1400);
        const sprintSpeed = Math.hypot(p.velocity.x, p.velocity.z);
        const gaitWeightAtDodge = {};
        for (const slot of ['idle', 'walk', 'jog', 'sprint']) {
          const L = loco.set.get(slot);
          if (L) gaitWeightAtDodge[slot] = +L.weight.toFixed(4);
        }

        // mixer baseline AFTER the sprint: the animation-seconds clauses below
        // measure the slow-motion window only, not the run-up into it
        const mix0 = an.mixer.time;
        const unpin = pinTS(eng, TS);
        let slow;
        try {
          await sleep(120);
          const mixPin = an.mixer.time;
          p.dodge();
          __CTX__.input.keys.delete('KeyW');
          __CTX__.input.keys.delete('ShiftLeft');
          const t0 = performance.now();
          await sleep(900);
          const wall = (performance.now() - t0) / 1000;
          slow = {
            wallSeconds: +wall.toFixed(3),
            observedTimeScale: +((an.mixer.time - mixPin - 0.12 * TS) / wall).toFixed(4),
            dodging: p.dodging,
            dodgeK: +p.dodgeK.toFixed(4),
            rollClipFrac: +(roll.time / dur).toFixed(4),
            rollWeight: +roll.weight.toFixed(4),
            rollIntent: rollLayer ? rollLayer.intent : null,
            animSeconds: +(an.mixer.time - mix0).toFixed(4),
            stuck: loco.audit().stuck,
            playerFinite: finite(p.position) && finite(p.velocity),
          };
        } finally { unpin(); }

        await sleep(1700);                     // let the roll finish in real time
        const after = {
          dodging: p.dodging,
          dodgeK: +p.dodgeK.toFixed(3),
          rollWeight: +roll.weight.toFixed(4),
          rollIntent: rollLayer ? rollLayer.intent : null,
          rollIntentHeldFor: rollLayer ? +rollLayer.intentT.toFixed(3) : null,
          dominant: an.dominantAction() && an.dominantAction().slot,
          animSeconds: +(an.mixer.time - mix0).toFixed(3),
          stuck: loco.audit().stuck,
          playerFinite: finite(p.position) && finite(p.velocity),
        };

        // ---- VERDICT FIRST, repair after (judge finding 6) ----
        // player.js integrates the roll from the clip's root-motion curve; an
        // earlier revision differentiated it by dt, which is 0/0 on a dt === 0
        // fixed-step tick and sent position NaN (scene renders black). That is
        // another lane's file, but a NaN player during a slow-motion roll is a
        // real failure of the behaviour this gate films, so it FAILS here and
        // is named — it is not repaired into a pass.
        const nanSeen = slow.playerFinite === false || after.playerFinite === false;
        if (nanSeen) {
          crossLane.push({
            id: 'player-dodge-divide-by-dt', owner: 'player-control', wave: 1,
            file: 'src/entities/player.js (dodge integration)',
            symptom: 'dt === 0 fixed-step tick during a roll -> 0/0 -> NaN velocity and position; scene renders black',
            trigger: 'engine.timeScale <= ~0.3 (wheel 0.25, Concentration 0.02) while dodging',
            fix: 'integrate the root-motion curve directly, or guard the divide (dt > 1e-5)',
            blocking: 'A27 FAILS while this is live',
          });
        }

        // Every clause below is an ANIMATION quantity except the last, which is
        // the cross-lane blocker above: anim-core's contract is that the
        // one-shot advances on the mixer's clock and hands back cleanly.
        liveOk = slow.dodging === true                 // still rolling 900 ms in
          && slow.dodgeK < 0.35                        // a wall clock would be > 1
          && slow.rollClipFrac < 0.35                  // the clip did NOT run ahead
          && slow.animSeconds < 0.15                   // the mixer ran on scaled dt
          && slow.stuck.length === 0
          && after.dodging === false                   // resolved once time ran
          && after.rollWeight < 0.05                   // handed back, not stuck
          && after.animSeconds > 1.0
          && after.stuck.length === 0
          && nanSeen === false;

        // only NOW, and only to leave the film a lit frame
        if (nanSeen) {
          p.velocity.set(0, 0, 0);
          p.position.copy(homePos);
          if (p._snapToGround) p._snapToGround();
          repair = 'restored player after the verdict was recorded (gate still FAILS)';
        }
        live = { clipDuration: +dur.toFixed(3), pinnedTimeScale: TS, fixedStepDtZeroTicks: true,
                 enteredFrom: 'sprint', sprintSpeedMs: +sprintSpeed.toFixed(2), gaitWeightAtDodge,
                 slow, after, postVerdictRepair: repair };
      }

      // the stuck clauses above only mean anything if the detector can fail
      const detectorProved = !!(st.stuckDetector && st.stuckDetector.pass
        && falsifiable.reachable && falsifiable.canFail === true
        && falsifiable.healthyAfterRestore === null);

      return { pass: liveOk === null ? null : !!(st.pass && detectorProved && liveOk), detail: {
        subject: 'hero roll one-shot (locomotion.js). The machine half (any kind with a ClipLayer one-shot) is instruments-core\\'s (plan §9 table); Round 4\\'s A27b died with its subject kind.',
        clipLayerSelftest: st.clipLayer,
        stuckDetectorSelftest: { pass: st.stuckDetector.pass, failed: st.stuckDetector.failed,
          cases: Object.fromEntries(Object.entries(st.stuckDetector.cases)
            .map(([k, v]) => [k, v.stuck === null ? 'silent (expected ' + v.want + ')' : v.stuck])) },
        liveStuckDetectorFalsifiable: falsifiable,
        detectorProved,
        heroRoll: live,
        heroRollOk: liveOk,
        crossLane,
      } };
    })()`,
  },

];
  return { GATES };
})();

/* ========================================================================== */

/* source: tools/gates.round4.player-anim.mjs (Round 4), re-staged for Round 5 */
/* ========================================================================== */
const __S_player_anim = await (async () => {
/**
 * Round 4 gates — lane `player-anim` (docs/ROUND4-AUDIT.md §4).
 *
 * Same contract as tools/gates.config.mjs: ACTION gates resolve
 * { pass, detail } in page context with __CTX__/__GAME__ available; VISUAL
 * gates capture shots/gates/<id>.png against written criteria. Every gate also
 * captures a frame, so an action gate can be judged on film as well.
 *
 * GATE IDS. §4 names these A33/A34/A35/A36/V23/V24. `A33` is already taken by
 * the character lane's `A33-rig-finite` — a DIFFERENT gate with a different
 * meaning — but the runner keys on the FULL id and `A33-hair-bounce` collides
 * with nothing, so the §4 names are used verbatim. Nothing here edits or
 * weakens another lane's gate. Two extra gates carry a lane suffix because
 * their §4 subject is already gated by the `animator` lane under the same
 * number and this lane's version is stricter, not a replacement:
 *   · `A31b-aim-strafe-skate-player-anim` — the character lane's
 *     `A31-aim-strafe-skate` SKIPs under load ("fewer than 2 clean stance
 *     windows"): at 1.35 m/s its 45 ms hitch filter, written for an 8 m/s
 *     sprint, discards every window. Same 0.06 m bar, a hitch filter scaled to
 *     the travel speed, plus the leg-CROSSING measurement A31 never had.
 *   · `A18b-slope-conform-moving` — A18 stands still; this one walks.
 */


/** Deterministic flat ground the whole suite already stages on (gatePlaces.openGround; R5: was a literal coordinate). */
const STAGE = `standAt(p, 'openGround');`;

/**
 * A33's RUNWAY: the same staging spot, aimed down the one bearing that stays
 * flat and fast for 50 m (fix round 3, judge-player-anim-r2).
 *
 * `STAGE`'s heading (camYaw = PI, due +Z) is fine for a gate that stands still
 * and wrong for one that sprints: measured along it in 5 m steps from the
 * staging point, her speed reads 6.47 / 6.49 / 6.87 / 6.55 / 6.57 m/s out to
 * 25 m and then 4.82 / 4.12 / 5.54 m/s at 30-40 m as the ground climbs from
 * -1.33 m to +0.57 m. That hill is why A33's window had to be cut to 3.0 s,
 * and a 3.0 s window is why its cadence estimator had too few gait cycles to
 * separate the +-15 % bar.
 *
 * `camYaw = PI/2` sends her due -X instead. The same sweep along it reads
 * 6.71 / 6.87 / 6.89 / 6.83 / 6.86 / 6.84 / 6.61 / 6.82 / 6.64 / 6.68 m/s over
 * 5-50 m, all of it grass, with the ground falling gently from -1.21 to
 * -2.69 m — no hill, no water, no surface change. (It does break up past 55 m:
 * 5.39 m/s at 55, silt at 60, cobble at 65-75. The 5.5 s window plus the 1.7 s
 * run-up is ~49 m at full frame rate, so it never gets there.)
 */
const RUNWAY = `standAt(p, 'runway'); /* gatePlaces.runway: the open-ground spot facing its flat, fast 50 m bearing */`;

/** Freeze the machine roster: a wandering machine is a different test. */
const FREEZE = `for (const m of __CTX__.machines.list) m.update = () => {};`;

/**
 * Hide EVERY DOM overlay, not just `#hud`.
 *
 * FIX ROUND 1: the setup used to hide `#hud`, and the XP bar, the quest banner
 * and the focus layer are NOT inside it — they are their own top-level
 * siblings (`#calf-layer`, the progression bar, `#cal-cfx`, `#cal-wheel`,
 * `#perf-stats`, …). They stayed on screen over a gate shot whose whole
 * subject is a 20 cm region of her face.
 */
const NOHUD = `for (const el of Array.from(document.body.children)) {
    if (el.id === 'app' || el.tagName === 'SCRIPT' || el.tagName === 'CANVAS') continue;
    el.style.display = 'none';
  }`;

/** Hide the meadow grass — every one of these shots is about her legs/hair. */
const FILM = `
  if (__CTX__.vegetation?.group) __CTX__.vegetation.group.visible = false;
  __CTX__.player.model.traverse((o) => { o.frustumCulled = false; });`;

/**
 * Lock the camera by replacing the controller's own `_updateCamera`, which is
 * the only place that runs at exactly the right point in the frame (the same
 * trick V12 uses). `right` / `up` / `back` are metres in HER frame.
 */
const LOCKCAM = `function lockCam(right, up, back, aimH, aimFwd) {
  // NB: char +X is her LEFT (ANCHOR_OFF.x is negative for the RIGHT cheek), so
  // the world axis this multiplies is her left; pass a NEGATIVE right to stand
  // on her right, which is the side the archery side reference is shot from.
  // \`aimFwd\` (metres, default 0) slides the LOOK-AT point down her own facing,
  // so a shot can be centred on the draw triangle — the anchor, the arrow and
  // the bow grip — instead of on her spine. It does not move the camera.
  __CTX__.player._updateCamera = function () {
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    const cam = this.ctx.camera;
    const f = aimFwd ?? 0;
    cam.position.set(
      this.position.x + c * right - s * back,
      this.position.y + up,
      this.position.z - s * right - c * back);
    cam.lookAt(this.position.x + s * f, this.position.y + (aimH ?? 1.2), this.position.z + c * f);
  };
}`;

/**
 * Local-quaternion angular range of a bone over a list of samples: the max
 * pairwise angle, which is the only measure a chain PARKED AT A CONSTANT LEAN
 * cannot fake. (The first Round-4 drop drove every chain into its bend clamp
 * and left it there — 0.55 m off rest, and 1.28 deg of range.)
 */
const QRANGE = `function qrange(list, key) {
  let mx = 0;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const A = list[i][key], B = list[j][key];
      const d = Math.min(1, Math.abs(A[0]*B[0] + A[1]*B[1] + A[2]*B[2] + A[3]*B[3]));
      const a = 2 * Math.acos(d) * 180 / Math.PI;
      if (a > mx) mx = a;
    }
  }
  return mx;
}`;

const GATES = [
  /* ------------------------------------------------------- A33-hair-bounce */
  {
    id: 'A33-hair-bounce', kind: 'action', lane: 'player-anim',
    timeout: 95000,
    title: 'The ponytail actually bounces at sprint: >= 0.04 m of world-Y travel, locked to the footfall cadence',
    setup: `__CTX__.input.enabled = true;`,
    settle: 500,
    assert: placed(['runway'], `(async () => {
     try {
      const C = __CTX__, p = C.player, an = p.animator;${CANON_SPEEDS}${HERO}
      ${FREEZE}
      ${RUNWAY}
      // where the runway starts: the window's stop condition is a DISTANCE
      // budget measured from here, because the flat bearing is only clear for
      // ~50 m (see RUNWAY) and wall clock does not say how far she has gone
      const sx = p.position.x, sz = p.position.z;
      const V = () => new p.position.constructor();
      // R5: the ponytail is the rig's published hair chain (animator.chainOf('hair'),
      // else its longest hair chain), 5th link — the Round-4 probe depth
      const bone = chainLink('hair', 4);
      if (!bone) return { pass: null, detail: { verdict: 'SKIP: this rig publishes no hair dyn_ chain', chains: HERO_CHAINS } };
      const name = bone.name;
      // the chain this bone belongs to, so the DEVIATION from its own animated
      // rest can be measured too — world Y alone also moves when the body bobs,
      // and a rigid rod welded to a bobbing head would pass on that number
      const chain = an._chains.find((c) => c.links.some((l) => l.bone === bone));
      const idx = chain ? chain.links.findIndex((l) => l.bone === bone) : -1;
      /* SOLVER STATE, NAMED (fix round 5). The one unexplained A33 FAIL in the
       * judge's four re-runs carried nothing but "Cannot read properties of
       * undefined (reading '9')". 9 is idx * 3 for this bone (it sits 4th
       * in its chain), i.e. chain.pos was undefined at the deviation read —
       * a chain that exists but whose Verlet arrays were never allocated
       * (_initChainSolver runs once at construction; anything that leaves it
       * half-done leaves exactly this). It is still a FAIL — an unmeasurable
       * deviation clause has not passed — but it now says WHICH of the two
       * things went wrong instead of a stack. */
      if (chain && !(chain.pos && chain.anim)) {
        return { pass: false, detail: {
          bone: name, chainLinks: chain.links.length, chainIndex: idx,
          note: 'chain solver state missing: _initChainSolver never allocated pos/anim for this chain',
        } };
      }
      C.input.keys.clear(); C.input.keys.add('KeyW'); C.input.keys.add('ShiftLeft');
      await new Promise((r) => setTimeout(r, 1700));
      const w = V();
      const ys = [], devs = [], ts = [], freqs = [], phs = [], sps = [];
      const t0 = performance.now();
      /* THE WINDOW IS CLOSED BY FOOTFALLS, NOT BY THE WALL CLOCK.
       *
       * FIX ROUND 3 (judge-player-anim-r2) moved the bearing: the OLD one
       * (camYaw = PI, due +Z) runs out of flat ground at ~28 m — measured along
       * it her sprint speed falls 6.57 -> 4.82 -> 4.12 m/s between 25 and 35 m
       * as the ground climbs from -1.33 to +0.57 m — so its window had to be
       * cut to 3.0 s and the estimator was left with 5.4 footfalls to separate
       * a +-15 % bar. The runway now points down the ONE bearing that stays
       * flat (see RUNWAY).
       *
       * FIX ROUND 4 (judge-player-anim-r2, residue) closes the other half. A
       * FIXED 5.5 s window buys a number of gait cycles that depends on how
       * busy the box is: measured here, 13.7 footfalls at 14 fps against 19.9
       * at 24 fps, and the judge — running sixteen lanes at once — got windows
       * short enough that the clause could not be read at all and reported
       * PENDING. Wall clock was never the quantity that mattered. The loop now
       * runs until the GAIT has banked \`FOOT_TARGET\` footfalls (measured the
       * same way the estimator measures them, by unwrapping loco.phase), which
       * is frame-rate invariant, and the two other bounds are pure safety:
       *
       *   · DIST_MAX 46 m from the staging point — the runway is clear to 50 m
       *     and this is the quantity that actually decides whether she is still
       *     on it. Frame rate cannot push her past it: distance per footfall is
       *     a sim-space constant (1.79 m measured), so 20 footfalls is 41.5 m
       *     off the 5.5 m run-up at ANY frame rate.
       *   · 45 s of wall clock / 1200 frames — the deadline is a HANG guard,
       *     not a measurement bound, so it is set from the assert's own 95 s
       *     budget rather than from any frame rate. Banked footfalls per wall
       *     second are fps x MAX_FRAME x footHz = 0.19 x fps here, so 45 s
       *     banks the full 20 at 2.4 fps and still clears the 16-footfall
       *     resolvability floor at 1.9 fps; below that the lock SKIPs (never
       *     fails) and the physical clauses are still asserted. The frame cap
       *     cannot bind before the footfall target at any rate: 20 footfalls
       *     is ~107 frames on a sim-clamped host and 318 at 60 fps.
       *
       * Measured on this box at 20.5 fps: 20 footfalls at t = 6.1 s, 41 m
       * downrange, her speed 6.69 m/s and the ground still falling smoothly.
       * Under a synthetic frame hog (fix round 5): 20 footfalls / ratio 1.000
       * at 17.1, 16.9, 18.8 and 6.3 fps, and 17.6 footfalls / ratio 0.995 at
       * 3.7 fps, where the OLD 25 s deadline was what cut the window short. */
      const FOOT_TARGET = 20, DIST_MAX = 46;
      let phPrev = an.loco?.phase ?? 0, cycAcc = 0, dist = 0;
      while (ys.length < 1200 && performance.now() - t0 < 45000
             && Math.abs(cycAcc) * 2 < FOOT_TARGET && dist < DIST_MAX) {
        bone.getWorldPosition(w);
        ys.push(w.y);
        ts.push((performance.now() - t0) / 1000);
        freqs.push(an.loco?.freq ?? 0);
        const ph = an.loco?.phase ?? 0;
        phs.push(ph);
        let dph = ph - phPrev;
        if (dph < -0.5) dph += 1; else if (dph > 0.5) dph -= 1;
        cycAcc += dph; phPrev = ph;
        dist = Math.hypot(p.position.x - sx, p.position.z - sz);
        sps.push(p.moveSpeed);
        if (chain && idx >= 0) {
          const i = idx * 3;
          devs.push(Math.hypot(chain.pos[i] - chain.anim[i],
                               chain.pos[i+1] - chain.anim[i+1],
                               chain.pos[i+2] - chain.anim[i+2]));
        }
        await new Promise((r) => requestAnimationFrame(r));
      }
      const runwayM = dist;
      /* The MEDIAN sprint speed across the window, not the last frame's. One
       * end-of-window sample is a reading of where she happened to stop, and
       * this gate is about the hair while she is sprinting, not about the
       * terrain 40 m downrange. */
      const speed = sps.slice().sort((a, b) => a - b)[sps.length >> 1] || 0;
      const speedEnd = p.moveSpeed;
      C.input.keys.clear();
      if (ys.length < 24) return { pass: null, detail: { n: ys.length, note: 'SKIP: too few frames' } };
      const p2p = Math.max(...ys) - Math.min(...ys);
      const devP2P = devs.length ? Math.max(...devs) - Math.min(...devs) : 0;
      const devMax = devs.length ? Math.max(...devs) : 0;

      /* --- the footfall rate to lock AGAINST, measured, not assumed.
       *
       * FIX ROUND 1. loco.freq is the NOMINAL gait rate the blend derives
       * from travel speed, in GAMEPLAY seconds. Under load those are not wall
       * seconds: src/main.js caps a frame at MAX_FRAME = 0.05 s, so at 15 fps
       * (0.067 s frames) the whole simulation — her legs included — advances at
       * 75 % of real time. The hair, which is driven BY the legs, then swings
       * at 0.75 x 3.65 = 2.7 Hz in wall clock while loco.freq * 2 still reads
       * 3.65, and the gate failed a correctly-locked ponytail. Both of this
       * lane's earlier estimators measured that 2.7 Hz, which is how we know it
       * was the reference that was wrong.
       *
       * FIX ROUND 2 (judge-player-anim-r1): this reference change is the ONLY
       * fix A33 ever needed. Fix round 1 also shipped a dt clamp / MAX_SUB
       * change in playerAnimator.js and called it a rig-side slow-motion bug;
       * main.js sub-steps the sim, so _springs never sees more than 1/60 s
       * and that code has never executed. See docs/ROUND4-PLAYER-ANIM.md §6c.
       * (Fix round 3 removed that dead pair; the constants are back at 3 /
       * 0.05 s, the values the loop has always effectively used.) Nothing here
       * was weakened for it: p2p / oscP2P / restDev and the +-15 % lock are all
       * still asserted.
       *
       * The gait PHASE (loco.phase, 0..1 per cycle) is the honest reference:
       * unwrapped over the sample window it gives the cycles that ACTUALLY
       * happened while the hair was being watched, whatever the host did. The
       * nominal rate is still reported alongside it. */
      const psi = new Array(phs.length);
      psi[0] = 0;
      let cyc = 0;
      for (let i = 1; i < phs.length; i++) {
        let d = phs[i] - phs[i - 1];
        if (d < -0.5) d += 1; else if (d > 0.5) d -= 1;
        cyc += d;
        psi[i] = cyc;
      }
      const span = ts[ts.length - 1] - ts[0];
      const gaitHzMeasured = span > 0.2 ? Math.abs(cyc) / span : 0;
      const gaitHzNominal = freqs.slice().sort((a, b) => a - b)[freqs.length >> 1] || 0;
      const gaitHz = gaitHzMeasured > 0.2 ? gaitHzMeasured : gaitHzNominal;
      const footHz = gaitHz * 2;
      const footCycles = Math.abs(cyc) * 2;      // footfalls inside the window

      /* --- the tip's own oscillation, detrended.
       * The raw world Y is DETRENDED first: sprinting 40 m across a meadow,
       * most of its range is the terrain going up and down under her, and a
       * mean-removed signal reports that ~1 Hz drift instead of the hair. A
       * centred moving average over ~0.45 s is longer than a step and far
       * shorter than the terrain trend, so subtracting it leaves the
       * stride-rate oscillation. */
      const dtAvg = span / Math.max(1, ys.length - 1);
      const half = Math.max(2, Math.round(0.225 / Math.max(0.005, dtAvg)));
      const res = [];
      for (let i = 0; i < ys.length; i++) {
        let sum = 0, n = 0;
        for (let j = Math.max(0, i - half); j <= Math.min(ys.length - 1, i + half); j++) { sum += ys[j]; n++; }
        res.push(ys[i] - sum / n);
      }
      // the boxcar is truncated at both ends, so the residual is only NEARLY
      // zero-mean; the sin/cos basis below carries no constant term, so remove
      // what is left before fitting
      const mean = res.reduce((a, v) => a + v, 0) / res.length;
      for (let i = 0; i < res.length; i++) res[i] -= mean;
      const oscP2P = Math.max(...res) - Math.min(...res);

      /* --- THE LOCK, MEASURED ON THE GAIT-PHASE AXIS, NOT THE WALL CLOCK.
       *
       * FIX ROUND 3 (judge-player-anim-r2). Fix round 1's Lomb-Scargle fitted
       * the residual against sin/cos of WALL-CLOCK time and then divided the
       * winning frequency by the measured footfall rate. That estimator
       * scattered: the judge measured 1.176 / 1.21 / 1.04 / 1.026 across four
       * clean re-runs of a rig he independently confirmed to be locked, and I
       * reproduce it here (1.426 at 19.7 fps, 1.319 at 16.8 fps on the same
       * frames whose gait-phase fit reads 1.055 and 0.965). The reason is not
       * noise, it is DRIFT: her cadence is not constant across the window —
       * it tracks speed, which moves with the ground and with how much sim
       * time each frame was allowed — so no single wall-clock sinusoid fits
       * the whole record, the periodogram's peak smears, and a 3 s window's
       * ~0.33 Hz half-width is wider than the +-0.5 Hz the +-15 % bar allows
       * at 3.3 Hz.
       *
       * The gait phase already tracks that drift exactly. So the fit is done
       * against sin/cos of (r x 2 x psi), where psi is the unwrapped gait
       * phase in cycles: r is the number of hair oscillations PER FOOTFALL,
       * which is precisely what "locked to the footfall cadence" means, and
       * the +-15 % bar from §4 applies to it unchanged. Cadence drift now
       * moves the basis with the legs instead of smearing the peak, and the
       * peak is sharp: 19 footfalls of window gives a half-width of ~0.026 in
       * r against a +-0.15 bar. Measured on the flat runway at 17 fps —
       * exactly the frame rate the old estimator failed at — r = 1.000 with
       * 65 % of the residual's variance explained and 145x the median power
       * in the scan. No physical clause moved. */
      const varTot = res.reduce((a, v) => a + v * v, 0);
      const PH = (r) => {
        const k = 2 * Math.PI * 2 * r;
        let ss = 0, sc = 0, cc = 0, sy = 0, cy = 0;
        for (let i = 0; i < res.length; i++) {
          const s = Math.sin(k * psi[i]), c = Math.cos(k * psi[i]), v = res[i];
          ss += s * s; sc += s * c; cc += c * c; sy += s * v; cy += c * v;
        }
        const det = ss * cc - sc * sc;
        if (!(Math.abs(det) > 1e-9)) return 0;
        const a = (cc * sy - sc * cy) / det, b2 = (ss * cy - sc * sy) / det;
        return Math.max(0, a * sy + b2 * cy);      // explained sum of squares
      };
      const sampleHz = span > 0.2 ? ys.length / span : 0;
      const perCycle = footCycles > 0.5 ? ys.length / footCycles : 0;
      /* The scan's top end is capped at THREE samples per hair oscillation
       * (FIX ROUND 4). r = 2.2 asks for the fit of an oscillation sampled
       * perCycle/2.2 times a cycle, and on a slow host that is 2.4 — inside a
       * hair's breadth of Nyquist, where the basis stops being able to tell a
       * real 2.2 from an alias of something slower. Nothing the bar cares
       * about moves: r = 1 keeps >= 5 samples per oscillation, the half-rate
       * competitor at 0.5 is always in the scan, and a hair that genuinely
       * swung at twice the cadence would peak at the scan's edge and fail the
       * lock exactly as it does today. */
      const rMax = Math.min(2.2, Math.max(0.8, perCycle / 3));
      let ratio = 0, best = 0;
      const pw = [];
      for (let r = 0.4; r <= rMax + 0.0001; r += 0.005) {
        const v = PH(r);
        pw.push(v);
        if (v > best) { best = v; ratio = r; }
      }
      pw.sort((a, b) => a - b);
      const medPw = pw[pw.length >> 1];
      const signif = varTot > 1e-9 ? best / varTot : 0;
      // how far the winning rate stands above the scan's own noise floor: the
      // standard "is there a peak at all" test, and the one that decides
      // whether this window can be read
      const contrast = medPw > 1e-12 ? best / medPw : 999;
      const hairHz = ratio * footHz;
      const locked = Math.abs(ratio - 1) <= 0.15;

      /* Resolvability. The clause is SKIPPED rather than failed when the
       * window cannot be read — the way A13 skips when it has too few clean
       * stance windows.
       *
       * FIX ROUND 4 (judge-player-anim-r2, residue) RAISES this floor to the
       * >= 8 GAIT CYCLES the judge asked for — 16 footfalls, twice the old bar
       * — and the window above is what makes that affordable: it no longer
       * stops at a wall-clock deadline, it stops when 20 footfalls have been
       * banked, so the floor is cleared with margin at every frame rate this
       * box produces instead of being cleared only when the box happens to be
       * quiet. 16 footfalls puts the fit's half-width at ~0.031 in r against
       * the +-0.15 bar. The rest of the floor is unchanged: >= 4 samples per
       * footfall (twice Nyquist at the bar), a peak at least 4x the scan's
       * median power, and a scan whose top end still reaches 1.5 so the bar is
       * not the edge of the scan.
       *
       * Every physical clause is asserted at every frame rate regardless: a
       * frozen chain fails on detrendedYp2p and restDeviationP2P whatever the
       * sampler managed. */
      const canResolve = footCycles >= 16 && perCycle >= 4 && contrast >= 4
        && ys.length >= 40 && signif >= 0.15 && rMax >= 1.5;
      // (fix round 4: the sprint floor is the build's canon band, SPRINT_MIN, not a hand-frozen 6.1 — A81)
      const physical = speed > SPRINT_MIN && p2p >= 0.04 && oscP2P >= 0.03
        && devP2P >= 0.012 && devMax <= 0.35;
      const pass = !physical ? false : (canResolve ? locked : null);
      // R5 (gates-perf W0a, fix round 3): name the floor(s) actually missed. Round 4's note listed
      // three numbers that were all above their floors (20.1 footfalls, 9.8 samples, contrast 9.3)
      // when the miss was the fit's significance (0.1497 < 0.15), so the owner could not tell why.
      const missed = [footCycles >= 16 ? null : 'footfalls ' + footCycles.toFixed(1) + ' < 16',
        perCycle >= 4 ? null : 'samples per footfall ' + perCycle.toFixed(1) + ' < 4',
        contrast >= 4 ? null : 'peak contrast ' + contrast.toFixed(1) + ' < 4',
        ys.length >= 40 ? null : 'frames ' + ys.length + ' < 40',
        signif >= 0.15 ? null : 'significance ' + signif.toFixed(4) + ' < 0.15 (share of the residual variance the best-fit oscillation explains)',
        rMax >= 1.5 ? null : 'scan top ' + rMax.toFixed(2) + ' < 1.5'].filter(Boolean);
      return { pass, detail: {
        note: canResolve ? undefined
          : 'frequency lock NOT ASSERTED: ' + footCycles.toFixed(1) + ' footfalls / '
            + perCycle.toFixed(1) + ' samples per footfall / peak contrast '
            + contrast.toFixed(1) + ' cannot resolve the cadence; floor missed: ' + missed.join(', '),
        resolvabilityMissed: canResolve ? undefined : missed,
        sampleHz: +sampleHz.toFixed(1),
        bone: name, speed: +speed.toFixed(2), speedEndOfWindow: +speedEnd.toFixed(2),
        frames: ys.length,
        worldYp2p: +p2p.toFixed(4), detrendedYp2p: +oscP2P.toFixed(4),
        hairHz: +hairHz.toFixed(2), footfallHz: +footHz.toFixed(2), ratio: +ratio.toFixed(3),
        footfallHzNominal: +(gaitHzNominal * 2).toFixed(2),
        gaitCyclesInWindow: +cyc.toFixed(2), footfallsInWindow: +footCycles.toFixed(2),
        samplesPerFootfall: +perCycle.toFixed(2),
        significance: +signif.toFixed(3), peakContrast: +contrast.toFixed(1),
        scanTop: +rMax.toFixed(2), runwayMetres: +runwayM.toFixed(1),
        windowSeconds: +span.toFixed(2),
        restDeviationP2P: +devP2P.toFixed(4), restDeviationMax: +devMax.toFixed(4),
      } };
     } catch (e) {
      /* A THROWN GATE MUST STILL SAY WHERE IT THREW (fix round 4). This gate
       * failed one clean re-run with nothing but the runner's own
       * "Cannot read properties of undefined (reading '9')" — the message
       * puppeteer keeps when an assert rejects, with no stack and no state, so
       * the failure could not be told from a real regression. It still FAILS
       * (pass: false, exactly as before), it just fails legibly. */
      return { pass: false, detail: {
        threw: String((e && e.message) || e),
        stack: String((e && e.stack) || '').split('\\n').slice(0, 12).join(' | '),
      } };
     }
    })()`),
  },

  /* ----------------------------------------------------- A34-chains-driven */
  {
    id: 'A34-chains-driven', kind: 'action', lane: 'player-anim',
    timeout: 60000,
    title: 'At least 66 % of the hero\'s dyn_ bones move > 0.5 deg over 3 s of jog (ruling R19; Round 4: 180 of 271)',
    setup: `__CTX__.input.enabled = true;`,
    settle: 500,
    assert: placed(['openGround'], `(async () => {
      const C = __CTX__, p = C.player, an = p.animator;
      ${FREEZE}
      ${STAGE}
      ${QRANGE}
      // EVERY dyn_ bone on the live skeleton, not the animator's own list —
      // a bone the chain builder silently dropped has to show up as a failure
      const bones = [];
      p.model.traverse((o) => { if (o.isBone && o.name.startsWith('dyn_')) bones.push(o); });
      if (!bones.length) return { pass: null, detail: { found: 0, note: 'SKIP: rig has no dyn_ chains' } };
      const BAR = Math.ceil(0.66 * bones.length);   // R19: >= 66 % (180 / 271 = 66.4 % on the Round-4 rig)
      C.input.keys.clear(); C.input.keys.add('KeyW');
      await new Promise((r) => setTimeout(r, 1800));
      const snaps = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 3000) {
        const row = new Array(bones.length);
        for (let i = 0; i < bones.length; i++) {
          const q = bones[i].quaternion;
          row[i] = [q.x, q.y, q.z, q.w];
        }
        snaps.push(row);
        await new Promise((r) => setTimeout(r, 60));
      }
      const speed = p.moveSpeed;
      C.input.keys.clear();
      let moved = 0, worst = 0;
      const still = [];
      for (let i = 0; i < bones.length; i++) {
        const deg = qrange(snaps, i);
        if (deg > 0.5) moved++; else if (still.length < 12) still.push(bones[i].name);
        if (deg > worst) worst = deg;
      }
      const chains = an.debugChains();
      const pass = moved >= BAR && speed > 3.5 && chains.nonFinite === 0;
      return { pass, detail: {
        dynBones: bones.length, movedOver0p5Deg: moved, bar: BAR, fraction: +(moved / bones.length).toFixed(3),
        maxDeg: +worst.toFixed(2), speed: +speed.toFixed(2),
        chains: chains.chains, links: chains.links, nonFinite: chains.nonFinite,
        stillExamples: still,
      } };
    })()`),
  },

  /* ------------------------------------------------------ A35-cheek-anchor */
  {
    id: 'A35-cheek-anchor', kind: 'action', lane: 'player-anim',
    timeout: 70000,
    title: 'Full draw at three aim pitches: knuckle on the cheek, hand behind the face plane, bow arm locked 165-172 deg, hands >= 0.45 m apart',
    setup: `__CTX__.input.enabled = true;`,
    settle: 500,
    assert: placed(['openGround'], `(async () => {
      const C = __CTX__, p = C.player, an = p.animator, cmb = C.combat;${HERO}
      ${FREEZE}
      if (!an?.debugArm) return { pass: null, detail: 'SKIP: animator exposes no debugArm()' };
      const V = () => new p.position.constructor();
      const rows = [];
      const measure = async (pitch, tag) => {
        C.input.mouse.buttons = 0; C.input.keys.clear();
        await new Promise((r) => setTimeout(r, 500));
        ${STAGE}
        p.camPitch = pitch;
        C.input.mouse.buttons |= 4;
        await new Promise((r) => setTimeout(r, 700));
        C.input.mouse.buttons |= 1;
        // long enough for a full draw even at 20 fps with a 0.42 s nock delay
        await new Promise((r) => setTimeout(r, 2400));
        p.camPitch = pitch;
        await new Promise((r) => setTimeout(r, 200));
        const R = an.debugArm('r'), L = an.debugArm('l');
        const hl = V(), hr = V();
        an.getBoneWorld(HBN('handL'), hl); an.getBoneWorld(HBN('handR'), hr);
        rows.push({ tag, drawS: +cmb.drawStrength.toFixed(2),
          handToHead: R.handToHead,
          handBehindFace: R.handBehindFace,
          bowElbowDeg: L.elbowDeg,
          handSep: +hl.distanceTo(hr).toFixed(4),
          handHeadUnit: R.handHeadUnit });
      };
      await measure(-0.4, 'up');
      await measure(0, 'level');
      await measure(0.75, 'down');
      C.input.mouse.buttons = 0; C.input.keys.clear();
      const bad = rows.filter((r) => !(r.drawS > 0.9
        && r.handToHead >= 0.10 && r.handToHead <= 0.16
        && r.handBehindFace > 0
        && r.bowElbowDeg >= 165 && r.bowElbowDeg <= 172
        && r.handSep >= 0.45
        && r.handHeadUnit >= 0.88));
      return { pass: bad.length === 0, detail: { rows, failing: bad.map((r) => r.tag) } };
    })()`),
  },

  /* --------------------------------------------------- A36-hit-react-visible */
  {
    id: 'A36-hit-react-visible', kind: 'action', lane: 'player-anim',
    timeout: 70000,
    title: 'A 14 hp hit at rest leans the torso >= 12 deg, decays over > 0.45 s, and makes a hit clip the dominant action',
    setup: `__CTX__.input.enabled = true;`,
    settle: 500,
    assert: placed(['openGround'], `(async () => {
      const C = __CTX__, p = C.player, an = p.animator;
      ${FREEZE}
      ${STAGE}
      if (!an?.torsoAxis) return { pass: null, detail: 'SKIP: animator exposes no torsoAxis()' };
      const V = () => new p.position.constructor();
      C.input.keys.clear(); C.input.mouse.buttons = 0;
      await new Promise((r) => setTimeout(r, 900));
      // the axis just BEFORE the hit is the reference — the idle clip already
      // sits ~10.6 deg off bind, so an angle measured from bind can go DOWN
      // when the torso leans back through that offset
      const ref = an.torsoAxis(V());
      const baseFromBind = an.torsoLeanDeg();
      const hp0 = p.health;
      const cur = V();
      // the exact §4 stimulus: the event other lanes deal damage with
      C.events.emit('player-damage', { amount: 14 });
      const S = [];
      const t0 = performance.now();
      let dominantHit = false, dominantSlot = null;
      while (performance.now() - t0 < 2000) {
        const d = an.dominantAction();
        if (d && (d.slot === 'hitChest' || d.slot === 'hitHead')) { dominantHit = true; dominantSlot = d.slot; }
        an.torsoAxis(cur);
        const dot = Math.max(-1, Math.min(1, cur.dot(ref)));
        S.push({ t: (performance.now() - t0) / 1000, lean: Math.acos(dot) * 180 / Math.PI,
                 w: an._hitClipW, slot: an._hitSlot });
        await new Promise((r) => requestAnimationFrame(r));
      }
      // peak, and how long it takes to fall back under 25 % of the peak
      let peak = 0, peakT = 0;
      for (const s of S) if (Math.abs(s.lean) > peak) { peak = Math.abs(s.lean); peakT = s.t; }
      let endT = S[S.length - 1].t;
      for (const s of S) if (s.t > peakT && Math.abs(s.lean) < peak * 0.25) { endT = s.t; break; }
      const decay = endT - peakT;
      const hurt = p.health < hp0;
      const pass = peak >= 12 && decay > 0.45 && dominantHit && hurt;
      return { pass, detail: {
        idleLeanFromBindDeg: +baseFromBind.toFixed(2), peakLeanDeg: +peak.toFixed(2),
        peakAtS: +peakT.toFixed(3), decayS: +decay.toFixed(3),
        dominantHitSlot: dominantSlot, hitClass: an._hitClass,
        maxClipWeight: +Math.max(...S.map((s) => s.w)).toFixed(3),
        healthBefore: hp0, healthAfter: p.health,
      } };
    })()`),
  },

  /* ------------------------------------ A31b-aim-strafe-skate-player-anim */
  {
    id: 'A31b-aim-strafe-skate-player-anim', kind: 'action', lane: 'player-anim',
    // FIX ROUND 7: four passes instead of two (the two transition ENTRIES the
    // blocker below lived in), each closing on banked footfalls rather than
    // wall clock, so the whole gate's duration scales with how slow the box is.
    // Sized off A18b's 150 s: four passes x (2 s staging + 30 s hang guard).
    timeout: 185000,
    title: 'Aim-strafe from a standing start, a backpedal AND a run: planted-foot drift <= 0.06 m BOTH ways, the legs never cross, and the cadence is a side-step not a shuffle',
    setup: `__CTX__.input.enabled = true;`,
    settle: 500,
    assert: placed(['openGround'], `(async () => {
      const C = __CTX__, p = C.player, an = p.animator, T = C.terrain;
      ${FREEZE}
      if (!an?.debugFeet) return { pass: null, detail: 'SKIP: animator exposes no debugFeet()' };
      // fix round 8: the mirror clause below reads loco.phase / loco._revSign,
      // so ABSENT telemetry must SKIP here rather than read as a mirrored gait
      // further down. (The footfall window already depended on loco.phase.)
      if (!an.loco || typeof an.loco.phase !== 'number') {
        return { pass: null, detail: 'SKIP: animator exposes no loco.phase/_revSign' };
      }
      /* FIX ROUND 7 (judge-player-anim-r2, blocker) — THE ENTRY PATH IS PART
       * OF THE TEST.
       *
       * Both run() calls used to clear the keys, re-stage and press a single
       * key, so every pass entered the sidestep from a STANDING START. The
       * locomotion mirror is latched (locomotion.js, REV_HYST), and from a
       * standing start the latch is always +1 — so the gate could not see the
       * case where it is -1. Entering the same sidestep straight out of a
       * backpedal, with aim held throughout, ran the entire strafe with the
       * gait phase backward and slid the trailing ball 0.0176-0.0670 m per
       * stance against this gate's own 0.06 m bar, five times across four
       * runs at 15.6-44 fps, and A31b read 0.0002-0.0021 m the whole time.
       *
       * \`entry\` now stages the pass the way a player reaches it: 'stand'
       * (unchanged), 'back' (backpedal, then release KeyS and press the strafe
       * key the same frame) and 'fwd' (forward run into the sidestep). Aim is
       * pressed BEFORE the entry move and never released, which is what makes
       * the whole thing one continuous aim-strafe rather than three states.
       * Both strafe directions get both a standing start and a transition. */
      const run = async (key, entry) => {
        C.input.keys.clear(); C.input.mouse.buttons = 0;
        ${STAGE}
        await new Promise((r) => setTimeout(r, 400));
        C.input.mouse.buttons |= 4;
        if (entry === 'back') {
          C.input.keys.add('KeyS');
          await new Promise((r) => setTimeout(r, 1500));
          C.input.keys.delete('KeyS');
        } else if (entry === 'fwd') {
          C.input.keys.add('KeyW');
          await new Promise((r) => setTimeout(r, 1500));
          C.input.keys.delete('KeyW');
        }
        C.input.keys.add(key);
        await new Promise((r) => setTimeout(r, 1600));
        const S = [];
        const t0 = performance.now();
        let prev = performance.now();
        /* THE WINDOW IS CLOSED BY FOOTFALLS, NOT BY THE WALL CLOCK.
         *
         * FIX ROUND 7 (judge-player-anim-r2, major) — the same treatment A33
         * already got in fix round 4, applied to this gate. A FIXED 3000 ms
         * window buys a number of stances that depends on how busy the box is,
         * and the audit's working condition is sixteen lanes at once: measured
         * here the suite runs at 12-20 fps, and at those rates 3 s is barely
         * three stances per foot before the n >= 3 sample floor starts eating
         * them. The loop now runs until the GAIT has banked FOOT_TARGET
         * footfalls (loco.phase, unwrapped — the same reference A33 uses),
         * which is frame-rate invariant: 8 footfalls is ~4 stances per foot at
         * ANY frame rate, twice the 2-window floor below.
         *
         * The two other bounds are pure HANG guards, not measurement bounds:
         * 30 s of wall clock and 900 frames. Banked footfalls per wall second
         * are fps x MAX_FRAME(0.05) x footHz(~2.4), so 30 s banks the full 8
         * at 2.2 fps; the frame cap cannot bind first (8 footfalls is ~200
         * frames at 60 fps and ~45 on a sim-clamped host). */
        const FOOT_TARGET = 8;
        let phPrev = an.loco?.phase ?? 0, cycAcc = 0, frames = 0;
        while (frames < 900 && performance.now() - t0 < 30000
               && Math.abs(cycAcc) * 2 < FOOT_TARGET) {
          const now = performance.now();
          const f = an.debugFeet();
          const ph = an.loco?.phase ?? 0;
          let dph = ph - phPrev;
          if (dph < -0.5) dph += 1; else if (dph > 0.5) dph -= 1;
          cycAcc += dph; phPrev = ph; frames++;
          // legs crossed = the RIGHT ball is on her LEFT of the left ball, in
          // HER frame. This is the measurement A31 never had, and it is what
          // the audit filmed on 41 % of aim-strafe frames.
          const h = p.heading, s = Math.sin(h), c = Math.cos(h);
          const lx = (f[0].world.x - p.position.x) * c - (f[0].world.z - p.position.z) * s;
          const rx = (f[1].world.x - p.position.x) * c - (f[1].world.z - p.position.z) * s;
          S.push({ dt: now - prev, feet: f, crossed: rx > lx, sep: lx - rx, dph,
                   hz: 2 * (an.loco?.freq ?? 0), sp: p.moveSpeed });
          prev = now;
          await new Promise((r) => requestAnimationFrame(r));
        }
        const spd = S.reduce((a, x) => a + x.sp, 0) / S.length;
        /* Hitch filter SCALED TO TRAVEL. A13's flat 45 ms is written for an
         * 8.2 m/s sprint, where a dropped frame moves her 0.37 m and swamps a
         * 0.06 m measurement. At the 1.35 m/s aim-strafe the same 45 ms moves
         * her 0.06 m — and this box runs the suite at ~20 fps, so EVERY window
         * spanned one and A31 discarded all of them and reported SKIP. The
         * honest bar is the frame time in which she travels the drift bar
         * itself, floored at 100 ms so a normal loaded frame is not a hitch.
         *
         * FIX ROUND 7 (judge-player-anim-r2, major) — THAT FILTER WAS STILL
         * ALL-OR-NOTHING, AND IT TOOK THE WHOLE GATE DOWN UNDER LOAD.
         *
         * \`hitchMs\` floors at 100 ms, so every window containing one frame
         * slower than 10 fps was thrown away whole — which on a loaded box is
         * every window. Measured on a quiet box: PASS, 9 windows, 0 hitched.
         * On the same box running the lane's own 8-gate suite (~17.7 fps):
         * R 0 windows / 5 hitched, L 0 / 6, "SKIP: fewer than 2 clean stance
         * windows" — and a SKIP does not fail a run, so with the blocker above
         * live the gate was silent on exactly the runs the audit cares about.
         * The judge's no-filter probe at 10.0-10.3 fps scored 9 and 10 windows
         * and read 0.0047 / 0.0015 m worst drift on windows whose longest
         * frames were 146 and 138 ms: the windows this gate was discarding
         * measure fine.
         *
         * A long frame can only ever INFLATE a drift reading (the body
         * translates, the lock updates once), never deflate one, and the
         * inflation is bounded by how far she travels in that frame. So the
         * filter is now applied where it can change a verdict and nowhere
         * else: every stance with >= 3 samples is scored and reported, and a
         * window is set aside as UNRESOLVABLE only when it both fails the
         * 0.06 m bar AND its longest frame could account for the whole reading
         * (dt * speed >= drift). A window under the bar passes whatever its
         * frame times were; a window over the bar that its own worst frame
         * cannot explain is a real slide and still fails the gate — the
         * blocker's 0.067 m at 38 ms (0.051 m of travel) is exactly that case.
         * The gate falls back to SKIP only if fewer than 2 windows survive
         * THAT test, or if the unresolvable ones outnumber the resolved ones
         * (at which point the pass genuinely did not measure anything). */
        const hitchMs = Math.max(100, (0.06 / Math.max(0.4, spd)) * 1000);
        const DRIFT_BAR = 0.06;
        const drifts = [];
        let hitched = 0;
        const unresolved = [];
        /* WHAT THE WORST WINDOW IS MADE OF (fix round 5, additive — no bar,
         * filter or clause here moved). worstWindow carries the shape of the
         * worst window: sample count, the longest frame inside it, how far the
         * ball rose within it, how far above the ground it got, how much of
         * the foot lock's budget it spent, and where in the run it fell. That
         * is the discriminator between a real slide (flat, yRange ~ 0, lock
         * error at the cap) and a stance window split by the foot's own
         * toe-off across the 5 cm ground test.
         *
         * FIX ROUND 6 — this comment used to argue from those same numbers
         * that the gate's two suite failures (0.1154 / 0.1177 m) "do not
         * reproduce standalone" over sixteen runs and were "never
         * attributable". That was wrong, and wrong because of the bug fixed
         * just below: the gate never scored the stance that was still open at
         * loop exit, which on aim-strafe-left is the long saturated one. It
         * reproduces standalone every time, at 0.13-0.57 m, with no load.
         * Cause and fix: docs/ROUND4-PLAYER-ANIM.md 6e. */
        const wins = [];
        /* FIX ROUND 6 (judge-player-anim-r2, blocker). A window used to be
         * scored ONLY in the lift branch below — only when the foot came UP
         * inside the sampling window. The stance still OPEN when the 3000 ms
         * loop expired was silently dropped, and on aim-strafe-LEFT that
         * dropped stance is deterministically the long, saturated one: the
         * judge measured it at 0.3433 m (this exact 3 s logic) and 0.4469 m
         * (the same stance allowed to close), with lock.errM pinned at capM
         * 0.3000, while every window this gate did score read 1-6 mm. The gate
         * was green over a third of a metre of planted-foot slide. closeWin is
         * now called BOTH on lift and once after the loop, so the last stance
         * is scored like any other. isLast is kept (a useful diagnostic) but it
         * is no longer the difference between measured and invisible. */
        for (let side = 0; side < 2; side++) {
          let win = null;
          const closeWin = () => {
            if (win && win.n >= 3) {
              const d = Math.hypot(win.x1 - win.x0, win.z1 - win.z0);
              /* HOW MUCH OF \`d\` THE LONGEST FRAME COULD HAVE MANUFACTURED.
               *
               * FIX ROUND 8 (judge-player-anim-r2, major) — this used to be
               * body travel alone, \`(maxDt/1000) * spd\`. At 1.35 m/s that is
               * 0.06 m at 44 ms, so below ~22 fps the excuse covered the whole
               * drift bar and kept covering it: measured 0.0885 / 0.0952 /
               * 0.0545 / 0.1040 m of "explainable" on a PASSING standalone run
               * at 41-78 ms worst frames. The 6f blocker's own slides were
               * 0.0176-0.0670 m, so on a box one notch busier than that run
               * the gate would have filed the blocker \`unresolved\` instead of
               * failing it. An excuse that grows with the frame rate is not a
               * bar, and the suite runs this gate at 12-25 fps.
               *
               * The honest bound is not how far SHE moved, it is how far a
               * long frame can move a PLANTED BALL, and the animator publishes
               * exactly that. The ball rides \`anchor + IK residual\`; the
               * anchor is captured on the plant frame and does not move again
               * until the correction saturates MAX_LOCK (playerAnimator
               * _footLock). So while the lock is unsaturated the ball cannot
               * travel further than the correction the lock was holding, which
               * is \`lock.errM\` — a slow frame inflates both together, and the
               * residual is a FRACTION of errM, never a multiple of it. Only
               * once errM pins at capM does the anchor itself slide, and only
               * then is body travel the relevant bound.
               *
               *   unsaturated: explainM = min(body travel, maxLockErr)
               *   saturated  : explainM = body travel   (the anchor is moving)
               *
               * This is frame-rate-independent in form: it is measured lock
               * state, not fps. Against the 6f blocker (errM peaked at 0.037
               * of the 0.300 cap while the left ball slid 0.0670 m) it yields
               * explainM 0.037 < 0.067 at ANY frame rate -> a real FAIL, not
               * an unresolved window. Against the round-6 saturated blocker
               * (errM pinned at capM, 0.34-0.45 m of slide) body travel is
               * still an order of magnitude short -> also a FAIL. */
              const travelM = (win.maxDt / 1000) * spd;
              const sat = win.lockCap != null && win.lockErr >= win.lockCap - 1e-3;
              const explainM = (win.lockCap == null || sat)
                ? travelM : Math.min(travelM, win.lockErr);
              if (d > DRIFT_BAR && explainM >= d) {
                hitched++;
                unresolved.push({ foot: side === 0 ? 'L' : 'R', driftM: +d.toFixed(4),
                                  samples: win.n, longestFrameMs: Math.round(win.maxDt),
                                  couldExplainM: +explainM.toFixed(4),
                                  bodyTravelM: +travelM.toFixed(4),
                                  maxLockErrM: +win.lockErr.toFixed(4), saturated: sat });
              } else { drifts.push(d); wins.push({ d, w: win, explainM }); }
            }
            win = null;
          };
          for (const s of S) {
            const f = s.feet[side];
            const above = f.world.y - T.getHeight(f.world.x, f.world.z);
            const planted = f.planted && Math.abs(above) < 0.05;
            if (planted) {
              if (!win) {
                win = { x0: f.world.x, x1: f.world.x, z0: f.world.z, z1: f.world.z, n: 0,
                        side, y0: f.world.y, y1: f.world.y, a0: above, a1: above, maxDt: 0,
                        lockErr: 0, lockCap: f.lock?.capM ?? null };
              }
              if (s.dt > win.maxDt) win.maxDt = s.dt;
              // how much of the foot lock's budget this stance is using: past
              // the cap the anchor slides and the ball travels the excess, so
              // this is the one number that tells a real slide from a
              // measurement artefact (see docs/ROUND4-PLAYER-ANIM.md 6e)
              if ((f.lock?.errM ?? 0) > win.lockErr) win.lockErr = f.lock.errM;
              win.x0 = Math.min(win.x0, f.world.x); win.x1 = Math.max(win.x1, f.world.x);
              win.z0 = Math.min(win.z0, f.world.z); win.z1 = Math.max(win.z1, f.world.z);
              win.y0 = Math.min(win.y0, f.world.y); win.y1 = Math.max(win.y1, f.world.y);
              win.a0 = Math.min(win.a0, above); win.a1 = Math.max(win.a1, above);
              win.n++;
            } else closeWin();
          }
          closeWin();   // the trailing stance is a stance
        }
        const worst = wins.reduce((a, w) => (a && a.d >= w.d ? a : w), null);
        const crossedFrac = S.filter((x) => x.crossed).length / S.length;
        const cad = S.map((x) => x.hz).sort((a, b) => a - b)[S.length >> 1];
        C.input.keys.clear(); C.input.mouse.buttons = 0;
        const footfalls = Math.abs(cycAcc) * 2;
        const wallS = (performance.now() - t0) / 1000;
        return { key, entry, drifts: drifts.map((d) => +d.toFixed(4)), windows: drifts.length, hitched,
                 unresolved,
                 maxDrift: drifts.length ? +Math.max(...drifts).toFixed(4) : null,
                 crossedFrac: +crossedFrac.toFixed(3),
                 minSepM: +Math.min(...S.map((x) => x.sep)).toFixed(4),
                 stepsPerSec: +cad.toFixed(2), speed: +spd.toFixed(2), hitchMs: Math.round(hitchMs),
                 footfalls: +footfalls.toFixed(2), frames: S.length, windowS: +wallS.toFixed(1),
                 fps: +(S.length / Math.max(0.1, wallS)).toFixed(1),
                 // the mirror latch the entry paths exist to exercise: a
                 // sustained sidestep must settle to the FORWARD loop (+1)
                 // whatever preceded it (locomotion.js, REV_HYST / REV_DWELL)
                 revSign: an.loco?._revSign ?? null,
                 reverse: +(an.loco?.reverse ?? 0).toFixed(3),
                 phaseBackFrames: S.filter((x) => x.dph < -1e-6).length,
                 worstWindow: worst ? {
                   foot: worst.w.side === 0 ? 'L' : 'R',
                   samples: worst.w.n, longestFrameMs: Math.round(worst.w.maxDt),
                   driftM: +worst.d.toFixed(4),
                   yRangeM: +(worst.w.y1 - worst.w.y0).toFixed(4),
                   aboveGroundM: [+worst.w.a0.toFixed(3), +worst.w.a1.toFixed(3)],
                   maxLockErrM: +worst.w.lockErr.toFixed(4), lockCapM: worst.w.lockCap,
                   couldExplainM: +worst.explainM.toFixed(4),
                   // what the OLD (fix round 7) rule would have excused: body
                   // travel in the longest frame, unbounded by the lock. Kept
                   // beside couldExplainM so the gap between the two — the
                   // whole of fix round 8's tightening — is readable in any
                   // verdict without re-deriving it from fps.
                   bodyTravelM: +((worst.w.maxDt / 1000) * spd).toFixed(4),
                   ofWindows: drifts.length, isLast: wins[wins.length - 1] === worst,
                 } : null };
      };
      /* FOUR PASSES: both directions from a standing start (the two this gate
       * has always run), plus the two TRANSITION entries the blocker lived in
       * — a sidestep out of a backpedal and a sidestep out of a forward run,
       * aim never released. The mirror latch keys on |moveAngle|, so one
       * direction per transition covers it and neither key gets only one
       * entry path. */
      const passes = [];
      passes.push(await run('KeyD', 'stand'));
      passes.push(await run('KeyA', 'stand'));
      passes.push(await run('KeyA', 'back'));
      passes.push(await run('KeyD', 'fwd'));
      const detail = {};
      for (const x of passes) detail[(x.key === 'KeyD' ? 'R' : 'L') + '-' + x.entry] = x;
      const nameOf = (x) => (x.key === 'KeyD' ? 'R' : 'L') + '-' + x.entry;
      /* (1) THE MIRROR CLAUSE — CHECKED FIRST, AND IT CANNOT BE SKIPPED PAST.
       *
       * FIX ROUND 8 (judge-player-anim-r2, major). Every clause this gate had
       * was a DRIFT measurement, and a drift measurement can always be argued
       * with (a long frame, a short window, a sample floor). The failure mode
       * it exists to catch has a second signature that no frame time can fake:
       * a sustained sidestep played on the MIRRORED clip runs the master gait
       * phase BACKWARD. All four passes here are sustained sidesteps and all
       * four settle to the forward loop by design (locomotion.js REV_HYST /
       * REV_BIAS: 1.5708 is below both switching bounds, so a sidestep
       * resolves to +1 from either latch state); the backpedal mirror is a
       * different input and is not one of A31b's passes. Measured on the 6f
       * blocker: revSign -1 with 101/102 and 82/83 frames of backward phase.
       * Measured on the fixed build, 8+ runs, every pass: +1 and 0 backward
       * frames. So this is a binary, and it is checked BEFORE the SKIP branch
       * — a mirrored run is RED whatever its windows did, and can never hide
       * behind an unresolvable window or a short sample. */
      const mirrored = passes.filter((x) => x.revSign !== 1 || x.phaseBackFrames !== 0);
      if (mirrored.length) {
        return { pass: false, detail: { ...detail,
          failing: mirrored.map(nameOf),
          note: 'MIRRORED: ' + mirrored.map((x) => nameOf(x) + ' rev ' + x.revSign
            + ', ' + x.phaseBackFrames + '/' + x.frames + ' frames of backward gait phase').join('; ') } };
      }
      /* (2) SKIP is the LAST resort, not the first (fix round 7) — but an
       * unresolvable window is now VISIBLE (fix round 8, judge-player-anim-r2).
       * It used to take unresolvable > resolved to stop a PASS, so a run could
       * carry a >6 cm window it could not account for and still read green
       * with nothing in the verdict saying so. Every unresolvable window is by
       * construction over the drift bar, so ANY of them means this pass did
       * not settle the question: the run is yellow, not green. That costs
       * nothing on a healthy build (a sub-bar window is never set aside, at
       * any frame rate — measured 0 unresolvable across 4 passes down to
       * 22.6 fps under the lane's own suite) and it stops the one shape the
       * judge found: a bar-grazing slide filed as an excuse and reported as a
       * pass. */
      const blind = passes.filter((x) => x.windows < 2 || x.hitched > 0);
      if (blind.length) {
        return { pass: null, detail: { ...detail,
          note: 'SKIP: ' + blind.map((x) => nameOf(x)
            + ' resolved ' + x.windows + ' / unresolvable ' + x.hitched
            + (x.unresolved[0] ? ' (worst ' + Math.max(...x.unresolved.map((u) => u.driftM))
               + ' m, lock ' + x.unresolved[0].maxLockErrM + ' m)' : '')).join(', ') } };
      }
      const ok = (x) => x.maxDrift <= 0.06 && x.crossedFrac <= 0.02
        && x.stepsPerSec >= 1.8 && x.stepsPerSec <= 3.6;
      const failing = passes.filter((x) => !ok(x)).map(nameOf);
      return { pass: failing.length === 0, detail: failing.length ? { ...detail, failing } : detail };
    })()`),
  },

  /* ------------------------------------------- A18b-slope-conform-moving */
  {
    id: 'A18b-slope-conform-moving', kind: 'action', lane: 'player-anim',
    // FIX ROUND 1: 70 s was not enough headroom. The body of this gate is only
    // ~5.5 s of staged walking, but it runs a deterministic terrain scan and
    // two re-stages, and on a box running fourteen lanes' suites at once the
    // whole thing has measured 78 s wall clock and been killed by its own
    // timeout while every clause inside it was passing. The measurement window
    // is unchanged; only the patience is.
    timeout: 150000,
    title: 'The conform holds WHILE MOVING: walking up and down a ~20 deg face, planted soles stay ON the ground (no float, no sink)',
    setup: `__CTX__.input.enabled = true;`,
    settle: 500,
    assert: `(async () => {
      const C = __CTX__, p = C.player, an = p.animator, T = C.terrain;
      ${FREEZE}
      if (!an?.debugFeet || !T?.getHeight) return { pass: null, detail: 'SKIP: no debugFeet()/terrain' };
      const V = () => new p.position.constructor();
      const n = V();
      const angOf = (v) => Math.acos(Math.max(-1, Math.min(1, v.y))) * 180 / Math.PI;
      // deterministic: fixed scan order, first LOCALLY CONSISTENT ~20 deg face
      let spot = null;
      for (let x = -200; x <= 200 && !spot; x += 5) {
        for (let z = -200; z <= 200; z += 5) {
          T.getNormal(x, z, n);
          if (Math.abs(angOf(n) - 20) > 1.5) continue;
          const nx = n.x, ny = n.y, nz = n.z;
          let ok = true;
          for (const [dx, dz] of [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) {
            T.getNormal(x + dx, z + dz, n);
            if (n.x * nx + n.y * ny + n.z * nz < 0.9945) { ok = false; break; }
          }
          if (!ok) continue;
          // fall-line heading (downhill) in world yaw
          spot = { x, z, up: Math.atan2(-nx, -nz), n: { x: nx, y: ny, z: nz } };
          break;
        }
      }
      if (!spot) return { pass: null, detail: 'SKIP: no consistent 20 deg face found' };

      const walk = async (yaw, tag) => {
        C.input.keys.clear();
        // re-stage before EACH direction and keep the sample window short: at
        // 1.5 m/s she leaves a 20 deg face in about two seconds, and a sample
        // taken on the 7 deg run-out is not a measurement of this gate
        p.position.set(spot.x, 0, spot.z); p.velocity.set(0, 0, 0); p._snapToGround();
        p.camYaw = yaw;
        await new Promise((r) => setTimeout(r, 500));
        C.input.keys.add('KeyW'); C.input.keys.add('AltLeft');   // stroll
        await new Promise((r) => setTimeout(r, 700));
        let worstClear = 0, worstTilt = 0, samples = 0, offFace = 0, flatFrames = 0;
        const clears = [], tilts = [];
        let minSlope = 90, maxSpeed = 0;
        const t0 = performance.now();
        while (performance.now() - t0 < 1300) {
          const f = an.debugFeet();
          const st = an.debugStance ? an.debugStance() : null;
          T.getNormal(p.position.x, p.position.z, n);
          const slope = angOf(n);
          maxSpeed = Math.max(maxSpeed, p.moveSpeed);
          // only judge frames she is actually still on the face
          if (slope < 12) { offFace++; await new Promise((r) => requestAnimationFrame(r)); continue; }
          minSlope = Math.min(minSlope, slope);
          for (let i = 0; i < 2; i++) {
            if (!f[i].planted) continue;
            samples++;
            const ft = st && st.feet ? st.feet[i] : null;
            // A planted sole touches the ground SOMEWHERE: the heel on a heel
            // strike, the ball on a toe-off. Measuring the ball alone reports
            // 0.16 m of "float" on the frame the heel is down, which is the
            // clip, not the conform (docs/ROUND4-CHARACTER.md §3 makes the same
            // point about the pelvis clamp).
            const clear = ft && ft.heelClear != null
              ? (Math.abs(ft.heelClear) < Math.abs(ft.toeClear) ? ft.heelClear : ft.toeClear)
              : f[i].world.y - T.getHeight(f[i].world.x, f[i].world.z);
            clears.push(Math.abs(clear));
            if (Math.abs(clear) > Math.abs(worstClear)) worstClear = clear;
            // Sole TILT is only a conform question during the FLAT phase. A
            // walking foot is mid-roll for most of its stance — heel-strike to
            // toe-off legitimately sweeps ~30 deg, and downhill that is the
            // whole point of the clip — so the tilt is judged only on frames
            // where the entire sole is near the ground (both contact points
            // within 5 cm, the nearer within 2 cm).
            if (ft && ft.soleTiltErrDeg != null && ft.heelClear != null) {
              const near = Math.min(Math.abs(ft.heelClear), Math.abs(ft.toeClear));
              const far = Math.max(Math.abs(ft.heelClear), Math.abs(ft.toeClear));
              if (near < 0.02 && far < 0.05) {
                flatFrames++;
                tilts.push(ft.soleTiltErrDeg);
                if (ft.soleTiltErrDeg > worstTilt) worstTilt = ft.soleTiltErrDeg;
              }
            }
          }
          await new Promise((r) => requestAnimationFrame(r));
        }
        C.input.keys.clear();
        const gy = T.getHeight(p.position.x, p.position.z);
        clears.sort((a, b) => a - b);
        tilts.sort((a, b) => a - b);
        const pct = (arr) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.9))] : 0);
        return { tag, worstClearM: +worstClear.toFixed(4), p90ClearM: +pct(clears).toFixed(4),
                 worstSoleTiltDeg: +worstTilt.toFixed(2), p90SoleTiltDeg: +pct(tilts).toFixed(2),
                 samples, flatFrames, offFaceFrames: offFace, minSlopeDeg: +minSlope.toFixed(1),
                 maxSpeed: +maxSpeed.toFixed(2), bodyErrM: +(p.position.y - gy).toFixed(4) };
      };
      const down = await walk(spot.up, 'downhill');
      const up = await walk(spot.up + Math.PI, 'uphill');
      const rows = [down, up];
      if (rows.some((r) => r.samples < 8)) {
        return { pass: null, detail: { at: { x: spot.x, z: spot.z }, rows, note: 'SKIP: too few planted samples on the face' } };
      }
      /* Bars, and why they are not A18's.
       * CLEARANCE 0.05 m (A18 standing: 0.02 m) is the finding this gate
       * exists for — "downhill floats, uphill sinks" — and it is the number
       * that moved: 0.149 m downhill / -0.083 m uphill before the flat-phase
       * conform authority and the per-foot LOWER term, 0.025 / 0.014 after.
       * SOLE TILT 26 deg (A18 standing: 6 deg) because a WALKING sole is not a
       * standing one: descending a 20 deg face you land heel-first on a surface
       * that is falling away and the ankle dorsiflexes through the contact, so
       * a large sole-to-ground angle mid-stance is the clip being right, not
       * the conform being wrong. It is measured only on frames where the whole
       * sole is near the ground, and it is held to a bar rather than merely
       * reported so a conform that stops working downhill still fails here.
       * Measured after the fix: 19-24 deg downhill, 1.6-2.3 deg uphill; before
       * it, 27-34 deg downhill. A18's own 0.02 m / 6 deg standing bars are
       * untouched and still run. */
      /* Clearance is judged on the 90th PERCENTILE of the planted samples with
       * a hard outlier ceiling on the single worst frame, not on the worst
       * frame alone. On film (shots/pa-slope-uphill.png) both soles sit on a
       * 20 deg face with heel/toe clearance 0.002/0.000 m — but this box runs
       * the suite at ~20 fps, and one frame in thirty catches the pelvis clamp
       * mid-convergence right after the stage teleport and reads 0.07 m. A
       * single-frame worst is measuring the sampler, not the conform. The
       * ceiling still fails the finding this gate exists for: the 0.149 m
       * downhill float was EVERY frame, not one. */
      const bad = rows.filter((r) => !(r.p90ClearM <= 0.05 && Math.abs(r.worstClearM) <= 0.12
        && r.flatFrames >= 3 && r.p90SoleTiltDeg <= 22 && r.worstSoleTiltDeg <= 32
        && Math.abs(r.bodyErrM) <= 0.06 && r.maxSpeed > 0.6));
      return { pass: bad.length === 0, detail: { at: { x: spot.x, z: spot.z }, rows, failing: bad.map((r) => r.tag) } };
    })()`,
  },

  /* ---------------------------------------------------- V23-secondary-motion */
  {
    id: 'V23-secondary-motion', kind: 'visual', lane: 'player-anim',
    title: 'Sprint, side view — three frames 80 ms apart, composited',
    criteria: 'Three vertical strips of the SAME sprint, 80 ms apart, left to right. '
      + 'PASS if the ponytail, the braids, the quiver, the belt pouches and the '
      + 'skirt flaps are in visibly DIFFERENT positions in each strip, and if the '
      + 'hair trails BEHIND her head rather than sticking out forward or sideways. '
      + 'FAIL if the hair is a rigid cone welded to her back (Round 3), if any '
      + 'strand stands straight out from the body like a tentacle, or if the three '
      + 'strips are indistinguishable.',
    // The three moments are grabbed inside `engine.onAfterRender` — the same
    // task as the render, so the drawing buffer is still intact without
    // `preserveDrawingBuffer` (the trick V20-aa-crop uses) — composited into
    // one canvas as three strips, and laid over the page for the shot.
    setup: placedSetup(['openGround'], `(async () => {
      const C = __CTX__, p = C.player, e = C.engine;
      C.input.enabled = true;
      C.state = 'playing';
      ${NOHUD}
      ${FREEZE}
      ${FILM}
      ${LOCKCAM}
      ${STAGE}
      // FIX ROUND 1: her RIGHT (negative), not her left. The sun sits on this
      // side at the stage point, and from the left she filmed as a backlit
      // silhouette — the judge has to tell a ponytail from a braid from a
      // pouch strap across three strips, and none of that reads in shadow.
      lockCam(-3.5, 1.15, 0, 1.05);
      C.input.keys.clear(); C.input.keys.add('KeyW'); C.input.keys.add('ShiftLeft');
      await new Promise((r) => setTimeout(r, 2600));

      const dom = C.renderer.domElement;
      const W = dom.width, H = dom.height, sw = Math.floor(W / 3);
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const g = cv.getContext('2d');
      let want = false, got = 0;
      const grab = () => {
        if (!want || got >= 3) return;
        want = false;
        g.drawImage(dom, (W - sw) / 2, 0, sw, H, got * sw, 0, sw, H);
        g.strokeStyle = '#000'; g.lineWidth = 4;
        g.strokeRect(got * sw + 2, 2, sw - 4, H - 4);
        got++;
      };
      e.onAfterRender.push(grab);
      for (let i = 0; i < 3; i++) {
        want = true;
        const t0 = performance.now();
        while (want && performance.now() - t0 < 1500) await new Promise((r) => requestAnimationFrame(r));
        const t1 = performance.now();
        while (performance.now() - t1 < 80) await new Promise((r) => requestAnimationFrame(r));
      }
      const i = e.onAfterRender.indexOf(grab);
      if (i >= 0) e.onAfterRender.splice(i, 1);
      C.input.keys.clear();
      if (got < 3) return false;
      const el = document.createElement('img');
      el.src = cv.toDataURL('image/png');
      el.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;object-fit:fill';
      document.body.appendChild(el);
      return true;
    })()`),
    settle: 900,
  },

  /* -------------------------------------------------- V24-draw-vs-reference */
  {
    id: 'V24-draw-vs-reference', kind: 'visual', lane: 'player-anim',
    title: 'Full draw, side, zoomed — judged against the licence-clean archery side reference',
    // R5: the Round-4 reference was a publisher still (deleted at W0b, A-reference-clean);
    // the licence-clean one arrives with A-reference-set (gates-perf W0b).
    reference: 'reference/r5/gates-perf/draw-side (A-reference-set, W0b)',
    criteria: 'The hero at full draw, from her right, close. Judge against '
      + 'the licence-clean archery side reference. PASS requires ALL of: the drawing hand\'s '
      + 'KNUCKLES are on her cheek/jaw (touching the face, not floating in front '
      + 'of it and not buried inside the skull or the braid); the arrow shaft and '
      + 'the drawing forearm are roughly IN LINE, so the fletching sits at the '
      + 'corner of her mouth; the BOW ARM is straight — a locked elbow, not a '
      + 'visibly bent one; her eye is looking down the shaft. FAIL if the hand is '
      + 'out in front of her face, below her chin, behind her ear, if the bracer '
      + 'lies across her eyes, or if the bow arm is bent like a curl.',
    setup: placedSetup(['openGround'], `(async () => {
      const C = __CTX__, p = C.player;
      C.input.enabled = true;
      C.state = 'playing';
      ${NOHUD}
      ${FREEZE}
      ${FILM}
      ${LOCKCAM}
      ${STAGE}
      p.camPitch = 0;
      C.input.mouse.buttons |= 4;
      await new Promise((r) => setTimeout(r, 800));
      C.input.mouse.buttons |= 1;
      await new Promise((r) => setTimeout(r, 2600));
      const before = p.animator.debugArm('l').elbowDeg;
      /*
       * FIX ROUND 1 — FREEZE THE AIM BEFORE MOVING THE CAMERA.
       *
       * \`combat.aimPoint\` is the CAMERA RAY's world hit (src/combat/combat.js
       * \`_updateAimPoint\`), so the moment this gate relocated the camera to
       * film her from the side, the thing she is aiming AT jumped with it —
       * measured -60.5,0,-12.3 (60 m down her own facing) -> 80.8,-2.6,-74.5
       * (140 m off to the side). The bow arm then folds to reach across her
       * body: elbow 167.9 deg -> 97.1, the string hand ends up IN FRONT of her
       * face (behindFace +0.061 -> -0.006 m). Those are verbatim the FAIL
       * conditions in this gate's own criteria, and they were an artefact of
       * the camera, not of the rig — A35 measures the same pose at 167.9 deg
       * because A35 never moves the camera. Stubbing the updater holds the last
       * gameplay aim point, so the pose the judge sees is the pose the player
       * gets.
       */
      C.combat._updateAimPoint = () => {};
      /*
       * Framing. The archery side reference is a near-perpendicular view from her
       * RIGHT (negative \`right\`), a hand's breadth behind the shoulder line,
       * at anchor height, with the look-at slid 0.34 m DOWN HER FACING so the
       * whole draw triangle — anchor fist, arrow, bow grip, bow arm elbow —
       * sits in the middle of the frame instead of her spine. The previous
       * numbers put the camera 0.45 m in FRONT of her and looked at her chest,
       * which cropped the bow arm out entirely and left three of the four PASS
       * clauses unjudgeable.
       */
      lockCam(-1.70, 1.46, 0.22, 1.35, 0.34);
      C.camera.fov = 31; C.camera.updateProjectionMatrix();
      await new Promise((r) => setTimeout(r, 500));
      const A = p.animator.debugArm('r'), B = p.animator.debugArm('l');
      // the arrow has to be ON the string for the judge to call the fletching
      const bow = C.combat.bow;
      let arrowVisible = null;
      if (bow && bow.nockArrow) {
        arrowVisible = bow.nockArrow.group.visible;
        for (let o = bow.nockArrow.group; o; o = o.parent) if (!o.visible) arrowVisible = false;
      }
      C.engine.timeScale = 0;
      return { drawS: C.combat.drawStrength, arrowVisible,
        bowElbowDegBeforeCamLock: before, bowElbowDeg: B.elbowDeg,
        handToHead: A.handToHead, handBehindFace: A.handBehindFace };
    })()`),
    settle: 900,
  },
];
  return { GATES };
})();

/* ========================================================================== */

/* source: tools/gates.round4.player-control.mjs (Round 4), re-staged for Round 5 */
/* ========================================================================== */
const __S_player_control = await (async () => {
/**
 * Round 4 gates — lane `player-control` (docs/ROUND4-AUDIT.md §4).
 *
 * Same contract as tools/gates.config.mjs: ACTION gates resolve
 * { pass, detail } in page context with __CTX__/__GAME__ available; every gate
 * also captures shots/gates/<id>.png, so an action gate can be judged on film
 * as well as on its numbers.
 *
 * GATE IDS: §4 names these A28/A29/A30/A31/A32/V22.  `animator` already owns
 * A28-run-cadence, A31-aim-strafe-skate and A32-draw-ramp — the NUMBERS
 * overlap, the ids do not, and the runner keys on the full id, so the §4 names
 * are used verbatim and nothing collides.
 *
 * Every gate here measures the SHIPPED controller: `src/entities/player.js`
 * calls `ctx.collision.moveCapsule` / `cameraBoom` itself now, so nothing has
 * to be spliced in from the gate (the `spatial` demo shims are not used).
 */


/** Freeze the machine roster: a wandering machine is a different test (A25). */
const FREEZE = `const freeze = () => { for (const m of __CTX__.machines.list) m.update = () => {}; };`;

/** Deterministic flat ground: fixed scan order, first spot under 1.5 deg. */
const FLAT = `function flatSpot(minR, maxR) {
  const C = __CTX__, V = C.player.position.constructor, n = new V();
  for (let x = -150; x <= 150; x += 3) {
    for (let z = -150; z <= 150; z += 3) {
      const r = Math.hypot(x, z);
      if (r < (minR ?? 0) || r > (maxR ?? 1e9)) continue;
      C.terrain.getNormal(x, z, n);
      if (Math.acos(Math.max(-1, Math.min(1, n.y))) * 180 / Math.PI > 1.5) continue;
      // and clear of anything she could collide with
      if (C.collision && C.collision.sphereQuery(x, C.terrain.getHeight(x, z) + 1, z, 3.5, [],
          (c) => c.blocking).length) continue;
      return { x, z };
    }
  }
  return null;
}`;

/** Project every skinned vertex of the player model; return NDC y extent. */
/**
 * Her projected silhouette in NDC.
 *
 * FIX ROUND 2 — vertices BEHIND the lens are skipped.  `Vector3.project`
 * divides by `w`, and `w < 0` behind the camera mirrors the point through the
 * origin and blows it up: at the pitch clamp the lens sits below her chest, her
 * feet and lower legs end up behind it, and the helper reported ndcTop 2045.94
 * / ndcBottom -6053.70 for a frame that has her plainly in it.  A vertex behind
 * the lens is not on screen, so it is not part of the silhouette — this makes
 * the measurement honest rather than looser, and `inFront` says how much of her
 * was measurable at all.
 */
const SILHOUETTE = `function silhouette() {
  const C = __CTX__, p = C.player, V = p.position.constructor;
  const v = new V(), vw = new V();
  let minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9, n = 0, behind = 0, inBox = 0;
  p.model.updateWorldMatrix(true, true);
  p.model.traverse((o) => {
    if (!o.isSkinnedMesh && !o.isMesh) return;
    const pos = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
    if (!pos) return;
    const stride = Math.max(1, Math.floor(pos.count / 2500));
    for (let i = 0; i < pos.count; i += stride) {
      v.fromBufferAttribute(pos, i);
      if (o.isSkinnedMesh && o.applyBoneTransform) o.applyBoneTransform(i, v);
      v.applyMatrix4(o.matrixWorld);
      vw.copy(v).applyMatrix4(C.camera.matrixWorldInverse);
      if (vw.z > -C.camera.near) { behind++; continue; }   // behind the lens
      v.project(C.camera);
      if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
      if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
      if (v.x >= -1 && v.x <= 1 && v.y >= -1 && v.y <= 1) inBox++;
      n++;
    }
  });
  if (!n) return { n: 0, behind, inBox: 0, onFrac: 0, minY: 9, maxY: -9, minX: 9, maxX: -9, full: 0, visible: 0 };
  return { n, behind, inBox, onFrac: inBox / n, minY, maxY, minX, maxX,
    full: (maxY - minY) / 2,
    visible: Math.max(0, (Math.min(maxY, 1) - Math.max(minY, -1)) / 2) };
}`;

/**
 * RESIDUE FIX ROUND 1 — her silhouette as RENDERED.  The rig carries 69
 * meshes and 53 of them are hidden: the five unequipped weapons (sharpshot /
 * war bow, blast sling, ropecaster, tripcaster, disc launcher) are all
 * parented to her left hand bone and toggled invisible, and `SILHOUETTE` above
 * samples them anyway — about half of every sample set, all of it sitting in
 * her left fist.  A hidden weapon near the lens is not on screen and a hidden
 * weapon off the frame edge is not "her out of frame", so A31b / A31c count
 * only meshes whose whole ancestor chain is visible.  (V22 and A29b keep the
 * original helper: their bars are silhouette EXTENTS, which the hidden weapons
 * in her hand never widen.)
 */
const VISIBLE = `function onRig(o) { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; }`;
const SILHOUETTE_VIS = SILHOUETTE.replace('function silhouette() {', 'function silhouette() {\n  /* visible meshes only (see VISIBLE) */')
  .replace("if (!o.isSkinnedMesh && !o.isMesh) return;", "if (!o.isSkinnedMesh && !o.isMesh) return;\n    if (!onRig(o)) return;");

/**
 * RESIDUE FIX ROUND 2 — one per-frame sample of what the camera films of her:
 * the fraction of her VISIBLE vertices inside the frame (in front of the
 * lens), the nearest visible vertex to the lens (m), and whether her head bone (animator.b.head)
 * is inside the frame and in front of the lens.  Needs VISIBLE's `onRig`.
 */
const FRAME_SAMPLE = `const _fsHead = __CTX__.player.animator?.b?.head?.bone || null;   // R5: animator-published, never a rig literal
function frameSample() {
  const C = __CTX__, p = C.player, V = p.position.constructor;
  const v = new V(), vw = new V(), e = C.camera.position;
  let nIn = 0, inBox = 0, nearest = 9;
  p.model.updateWorldMatrix(true, true);
  p.model.traverse((o) => {
    if (!o.isSkinnedMesh && !o.isMesh) return;
    if (!onRig(o)) return;
    const pos = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
    if (!pos) return;
    const stride = Math.max(1, Math.floor(pos.count / 2500));
    for (let i = 0; i < pos.count; i += stride) {
      v.fromBufferAttribute(pos, i);
      if (o.isSkinnedMesh && o.applyBoneTransform) o.applyBoneTransform(i, v);
      v.applyMatrix4(o.matrixWorld);
      const d = v.distanceTo(e);
      if (d < nearest) nearest = d;
      vw.copy(v).applyMatrix4(C.camera.matrixWorldInverse);
      if (vw.z > -C.camera.near) continue;
      v.project(C.camera);
      if (v.x >= -1 && v.x <= 1 && v.y >= -1 && v.y <= 1) inBox++;
      nIn++;
    }
  });
  let headIn = false, hx = 9, hy = 9;
  if (_fsHead) {
    const h = new V(); _fsHead.getWorldPosition(h);
    const hv = h.clone().applyMatrix4(C.camera.matrixWorldInverse);
    const hp = h.clone().project(C.camera);
    if (hv.z < -C.camera.near) { hx = hp.x; hy = hp.y; headIn = Math.abs(hp.x) <= 1 && Math.abs(hp.y) <= 1; }
  }
  return { frac: nIn ? inBox / nIn : 0, nearest, headIn, hx, hy };
}`;

/**
 * RESIDUE FIX ROUND 3 — the hillside staging A31b / A31d / A31e / A31f share
 * (judge: "A31b failed the full-suite run on its 600 s timeout … move the pan
 * and sweep rows into their own gate ids with their own timeouts").  The same
 * searches A31b has always used: the flat clear control ground (14 m of clear
 * air, under 3 deg) and the steepest clear, grass-free 26-40 deg face; and the
 * PINNED flat control at a pitch, measured with A31b's own estimator (56
 * frames, 16 to settle, `silhouette().onFrac` every 2nd frame, the median).
 * Needs FREEZE, VISIBLE and SILHOUETTE_VIS above it.
 */
const HILLSIDE = `const C = __CTX__, p = C.player, T = C.terrain, K = C.collision;
      freeze();
      const V = p.position.constructor, n = new V();
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const DEG = 180 / Math.PI;
      const hider = (c) => c.camera || c.kind === 'canopy';
      const ONFRAC_FLOOR = 0.12, FRAME_KEEP = 0.45;
      let flat = null;
      for (let x = -220; x <= 220 && !flat; x += 7) {
        for (let z = -220; z <= 220; z += 7) {
          T.getNormal(x, z, n);
          if (Math.acos(Math.max(-1, Math.min(1, n.y))) * DEG > 3) continue;
          if (K.sphereQuery(x, T.getHeight(x, z) + 1, z, 14, [], hider).length) continue;
          flat = { x, z }; break;
        }
      }
      let hill = null;
      for (let x = -300; x <= 300; x += 9) {
        for (let z = -300; z <= 300; z += 9) {
          if (Math.hypot(x, z) > 310) continue;
          T.getNormal(x, z, n);
          const d = Math.acos(Math.max(-1, Math.min(1, n.y))) * DEG;
          if (d < 26 || d > 40) continue;
          const h = T.getHeight(x, z);
          if (K.sphereQuery(x, h + 1, z, 7, [], hider).length) continue;
          if (T.tallGrassDensity && T.tallGrassDensity(x, z) > 0.12) continue;
          if (!hill || d > hill.deg) hill = { x, z, deg: +d.toFixed(1), down: Math.atan2(n.x, n.z) };
        }
      }
      const CTRL = { pin: {} };
      const pinnedControl = async (pitch) => {
        p.position.set(flat.x, 0, flat.z); p.velocity.set(0, 0, 0); p._snapToGround();
        p.heading = 0; p.camYaw = Math.PI; p.camPitch = pitch;
        p._relief = 0; p._lift = 0; p._pivotSeeded = false;
        C.input.keys.clear(); C.input.mouse.buttons = 0;
        const fracs = [];
        for (let i = 0; i < 56; i++) {
          await frame();
          p.position.x = flat.x; p.position.z = flat.z; p.velocity.x = 0; p.velocity.z = 0;
          p.camYaw = Math.PI; p.camPitch = pitch;
          if (i < 16) continue;
          if (i % 2 === 0) { const sq = silhouette(); fracs.push(sq.n ? sq.onFrac : 0); }
        }
        fracs.sort((a, b) => a - b);
        const ctrl = fracs[fracs.length >> 1];
        CTRL.pin[pitch] = { ctrl, bar: Math.max(ONFRAC_FLOOR, FRAME_KEEP * ctrl) };
      };
      /* the film: re-stage a pinned hillside frame and hold it for the shutter
       * (the pin retires after 12 s so it cannot leak into the next gate) */
      const filmAt = async (pitch, offDeg) => {
        const yaw = hill.down + Math.PI + offDeg / DEG;
        p.position.set(hill.x, 0, hill.z); p.velocity.set(0, 0, 0); p._snapToGround();
        p.heading = hill.down; p.camYaw = yaw; p.camPitch = pitch;
        p._relief = 0; p._lift = 0; p._pivotSeeded = false;
        C.input.keys.clear(); C.input.mouse.buttons = 0;
        const until = performance.now() + 12000;
        const pin = () => {
          if (performance.now() > until) return;
          p.position.x = hill.x; p.position.z = hill.z; p.velocity.x = 0; p.velocity.z = 0;
          p.camPitch = pitch; p.camYaw = yaw; p.heading = hill.down;
          requestAnimationFrame(pin);
        };
        pin();
        for (let i = 0; i < 40; i++) await frame();
        let u = 1; for (const m of p._mats) if (m.u.value < u) u = m.u.value;
        const m = frameSample();
        return { pitch, offDeg, opacity: +u.toFixed(3), onFrac: +m.frac.toFixed(3), headIn: m.headIn,
          head: [+m.hx.toFixed(2), +m.hy.toFixed(2)], nearestVertexM: +m.nearest.toFixed(3),
          lensGap: +C.camera.position.distanceTo(p.camPivot).toFixed(2), swingDeg: +((p.camSwing ?? 0) * DEG).toFixed(1),
          ok: u >= 0.98 && m.headIn && m.nearest >= 0.15 };
      };`;

const GATES = [
  /* ------------------------------------------------------------------ A28 */
  {
    id: 'A28-jump-arc', kind: 'action', lane: 'player-control',
    title: 'Space from flat ground: apex 1.35-1.7 m, 0.55-0.9 s of air, lands on the surface',
    setup: `__CTX__.input.enabled = true;`,
    settle: 700, timeout: 90000,
    assert: `(async () => {
      ${FREEZE}
      ${FLAT}
      const C = __CTX__, p = C.player;
      freeze();
      const spot = flatSpot(20, 150);
      if (!spot) return { pass: null, detail: 'SKIP: no flat clear ground found' };
      p.position.set(spot.x, 0, spot.z); p.velocity.set(0, 0, 0);
      p._snapToGround(); p.camYaw = Math.PI;
      C.input.keys.clear();
      await new Promise((r) => setTimeout(r, 500));

      /* The arc is measured in SIMULATION time by the controller itself
       * (player.lastJump).  A wall-clock rAF probe cannot do it: main.js caps
       * a frame at 0.05 s of sim, so on a loaded box a 0.74 s arc spans 1.2 s
       * of wall clock and every rAF sample reads it long.  apex is the peak of
       * the integrated arc, air is summed dt, landErr is |feet - terrain| on
       * the landing frame. */
      const runs = [];
      for (let i = 0; i < 3; i++) {
        p.lastJump = null;
        const y0 = p.position.y;
        p.jump();
        if (p.grounded && !p.lastJump) return { pass: false, detail: 'jump did not leave the ground' };
        const t0 = performance.now();
        while (!p.lastJump && performance.now() - t0 < 6000) await new Promise((r) => requestAnimationFrame(r));
        if (!p.lastJump) return { pass: false, detail: { i, note: 'never landed' } };
        const gy = C.terrain.getHeight(p.position.x, p.position.z);
        runs.push({ apex: p.lastJump.apex, air: p.lastJump.air,
                    landErr: +(p.position.y - gy).toFixed(4), drift: +Math.abs(p.position.y - y0).toFixed(3) });
        await new Promise((r) => setTimeout(r, 250));
      }
      const ok = runs.every((r) => r.apex >= 1.35 && r.apex <= 1.7
        && r.air >= 0.55 && r.air <= 0.9 && Math.abs(r.landErr) <= 0.1);
      return { pass: ok && p.grounded && p.health === p.maxHealth,
               detail: { runs, grounded: p.grounded, health: p.health, at: spot } };
    })()`,
  },

  /* ----------------------------------------------------------------- A28b */
  {
    id: 'A28b-canon-speeds', kind: 'action', lane: 'player-control',
    title: 'Canon ground speeds: walk 1.5, crouch 1.4, jog 5.0, sprint 6.8 (ratio ~1.4), measured in sim time',
    setup: `__CTX__.input.enabled = true;`,
    settle: 700, timeout: 90000,
    assert: `(async () => {
      ${FREEZE}
      ${FLAT}
      const C = __CTX__, p = C.player, E = C.engine;
      freeze();
      const spot = flatSpot(20, 150);
      if (!spot) return { pass: null, detail: 'SKIP: no flat clear ground found' };

      /* Measured against engine.simTime, NOT wall clock. main.js caps a frame
       * at 0.05 s of simulation, so on a box under load a wall-clock probe
       * reads a 6.8 m/s sprint as 2.2 m/s — it is measuring the frame rate,
       * not the controller. Sim time is what the character actually moved in. */
      const run = async (keys, crouch) => {
        C.input.keys.clear();
        p.setCrouch(!!crouch);
        p.position.set(spot.x, 0, spot.z); p.velocity.set(0, 0, 0);
        p._snapToGround(); p.camYaw = Math.PI; p.heading = 0;
        await new Promise((r) => setTimeout(r, 350));
        for (const k of keys) C.input.keys.add(k);
        // spin up: 1.2 s of SIM time, so the damp has converged whatever the fps
        let t0 = E.simTime;
        while (E.simTime - t0 < 1.2) await new Promise((r) => requestAnimationFrame(r));
        const a = p.position.clone(); t0 = E.simTime; const slopes = [];
        while (E.simTime - t0 < 1.2) {
          await new Promise((r) => requestAnimationFrame(r));
          slopes.push(p.slopeDeg);
        }
        const dt = E.simTime - t0;
        C.input.keys.clear();
        return { v: +(Math.hypot(p.position.x - a.x, p.position.z - a.z) / dt).toFixed(2),
                 slope: +(slopes.reduce((x, y) => x + y, 0) / slopes.length).toFixed(1), simDt: +dt.toFixed(2) };
      };
      const walk = await run(['KeyW', 'AltLeft']);
      const jog = await run(['KeyW']);
      const sprint = await run(['KeyW', 'ShiftLeft']);
      const crouch = await run(['KeyW'], true);
      p.setCrouch(false);
      const S = p.speeds;
      const near = (m, want, tol) => Math.abs(m - want) <= tol;
      const ratio = +(sprint.v / jog.v).toFixed(2);
      const tableOk = S && S.walk === 1.5 && S.crouch === 1.4 && S.jog === 5 && S.sprint === 6.8;
      // +-12 % covers the grade model: uphill costs speed by design, and even
      // the flattest 3 m grid cell in this world drifts onto a few degrees.
      const pass = tableOk
        && near(walk.v, 1.5, 0.2) && near(jog.v, 5.0, 0.6)
        && near(sprint.v, 6.8, 0.8) && near(crouch.v, 1.4, 0.25)
        && ratio >= 1.25 && ratio <= 1.5;
      return { pass, detail: { published: S, walk, jog, sprint, crouch, sprintJogRatio: ratio, at: spot } };
    })()`,
  },

  /* ------------------------------------------------------------------ A29 */
  {
    id: 'A29-slope-limit', kind: 'action', lane: 'player-control',
    title: 'Sprinting up the steep face (gatePlaces.steepFace, > 50 deg): speed <= 3 m/s, feet on the surface throughout',
    setup: `__CTX__.input.enabled = true;`,
    settle: 700, timeout: 90000,
    assert: placed(['steepFace'], `(async () => {
      ${FREEZE}
      const C = __CTX__, p = C.player, T = C.terrain;
      const V = p.position.constructor, n = new V();
      freeze();
      const SF = PLACE('steepFace'), X = SF.x, Z = SF.z;
      T.getNormal(X, Z, n);
      const face = Math.acos(Math.max(-1, Math.min(1, n.y))) * 180 / Math.PI;
      if (face < 50) return { pass: null, detail: { face, note: 'SKIP: gatePlaces.steepFace is no longer a >50 deg face' } };

      /* The W0 map's steep face is a 1 m terrace lip: sampled along its own fall
       * line the slope is >50 deg for barely 1.5 m (44.9 / 56.4 / 56.5 / 50.8 /
       * 36.7 at half-metre steps), and a controller that correctly refuses to
       * hold it slides off in ~0.2 s.  One continuous run therefore collects
       * ~10 on-face frames out of 130.  Re-stage it 8 times and pool the frames
       * that are actually ON the face — the same measurement, enough of it. */
      const uphill = Math.atan2(-n.x, -n.z) + Math.PI;   // -grad is downhill; +PI = uphill
      C.input.keys.clear(); C.input.mouse.buttons = 0;
      C.input.keys.add('KeyW'); C.input.keys.add('ShiftLeft');
      const S = [];
      const climbs = [];
      for (let rep = 0; rep < 8; rep++) {
        p.position.set(X, 0, Z); p.velocity.set(0, 0, 0);
        p._snapToGround();
        p.camYaw = uphill + Math.PI;      // camera behind her, so W drives uphill
        p.heading = uphill;
        const y0 = p.position.y;
        let peak = y0;
        const t0 = performance.now();
        while (performance.now() - t0 < 600) {
          await new Promise((r) => requestAnimationFrame(r));
          const g = T.getHeight(p.position.x, p.position.z);
          peak = Math.max(peak, p.position.y);
          /* fade is sampled too: this gate used to assert speed and foot error
           * while she was rendered as a screen door (the hillside was booked as
           * an occluder), and passed. 'hid' counts anything the camera could
           * legitimately be behind, so a tree in the shot is not a failure. */
          const e = C.camera.position;
          const hid = C.collision
            ? C.collision.sphereQuery(e.x, e.y, e.z, 1.1, [], (c) => c.camera || c.kind === 'canopy').length : 0;
          S.push({ slope: p.slopeDeg, speed: p.moveSpeed, err: Math.abs(p.position.y - g),
                   sliding: p.sliding, grounded: p.grounded,
                   fade: p.fade, applied: p._fadeCur, hid,
                   solidCut: p.solidCut, boom: p.boomLength });
        }
        climbs.push(+(peak - y0).toFixed(3));
      }
      C.input.keys.clear();
      const onFace = S.filter((s) => s.slope > 50);
      if (onFace.length < 25) return { pass: null, detail: { samples: S.length, onFace: onFace.length, note: 'SKIP: too few on-face frames to measure' } };
      const maxSpeed = Math.max(...onFace.map((s) => s.speed));
      const maxErr = Math.max(...onFace.map((s) => s.err));
      const climbed = Math.max(...climbs);
      const visible = onFace.filter((s) => s.hid === 0);
      const ghosted = visible.filter((s) => s.fade < 0.999 || s.applied < 0.99);
      return {
        pass: maxSpeed <= 3 && maxErr <= 0.12 && climbed <= 1.0 && ghosted.length === 0,
        detail: { faceDeg: +face.toFixed(1), samples: S.length, onFace: onFace.length,
                  maxSpeedMs: +maxSpeed.toFixed(2), maxFootErrM: +maxErr.toFixed(4),
                  climbedM: climbed, climbsPerRep: climbs,
                  airborneFrames: onFace.filter((s) => !s.grounded).length,
                  slidFrac: +(onFace.filter((s) => s.sliding).length / onFace.length).toFixed(2),
                  onFaceUnoccluded: visible.length, ghostedOnFace: ghosted.length,
                  minFadeOnFace: visible.length ? +Math.min(...visible.map((s) => s.fade)).toFixed(3) : null,
                  minBoomOnFace: +Math.min(...onFace.map((s) => s.boom)).toFixed(2),
                  maxSolidCutOnFace: +Math.max(...onFace.map((s) => s.solidCut)).toFixed(2) },
      };
    })()`),
  },

  /* ------------------------------------------------------------------ A30 */
  {
    id: 'A30-dodge-window', kind: 'action', lane: 'player-control',
    title: 'Roll i-frames are a WINDOW: a hit at dodgeK 0.05 and 0.65 lands, 0.25 is negated',
    setup: `__CTX__.input.enabled = true;`,
    settle: 700, timeout: 90000,
    assert: `(async () => {
      ${FREEZE}
      ${FLAT}
      const C = __CTX__, p = C.player;
      freeze();
      const spot = flatSpot(20, 150);
      if (!spot) return { pass: null, detail: 'SKIP: no flat clear ground found' };
      p.position.set(spot.x, 0, spot.z); p.velocity.set(0, 0, 0); p._snapToGround();
      p.camYaw = Math.PI; C.input.keys.clear(); C.input.mouse.buttons = 0;
      await new Promise((r) => setTimeout(r, 400));

      /* PART 1 — sample the window in a real, freely running roll: the roll is
       * driven by the clip's own root motion and invulnerable is a getter, so
       * this reads the shipped predicate frame by frame. */
      p.health = p.maxHealth;
      p.dodge();
      if (!p.dodging) return { pass: null, detail: 'SKIP: dodge did not start' };
      const trail = [];
      const t0 = performance.now();
      while (p.dodging && performance.now() - t0 < 3000) {
        trail.push({ k: p.dodgeK, inv: p.invulnerable });
        await new Promise((r) => requestAnimationFrame(r));
      }
      const invK = trail.filter((s) => s.inv).map((s) => s.k);
      const window = invK.length ? { from: +Math.min(...invK).toFixed(3), to: +Math.max(...invK).toFixed(3) } : null;
      await new Promise((r) => setTimeout(r, 400));

      /* PART 2 — the literal §4 test.  The phase is SET before each hit rather
       * than waited for: a rAF probe lands wherever the frame rate puts it
       * (dodgeK advances up to 0.06 per frame on a loaded box), and "at dodgeK
       * 0.05" has to mean 0.05.  The roll itself is real and running. */
      const hits = [];
      for (const k of [0.05, 0.25, 0.65]) {
        p.health = p.maxHealth;
        p.dodge();
        if (!p.dodging) { hits.push({ k, note: 'roll did not start' }); continue; }
        await new Promise((r) => requestAnimationFrame(r));
        p._dodgeTime = k * p.dodgeDuration;
        p.dodgeK = k;
        const inv = p.invulnerable;
        p.takeDamage(25, 'gate');
        hits.push({ k, invulnerable: inv, health: p.health, damaged: p.health < p.maxHealth });
        // let the roll finish before the next one
        const tw = performance.now();
        while (p.dodging && performance.now() - tw < 3000) await new Promise((r) => requestAnimationFrame(r));
        await new Promise((r) => setTimeout(r, 250));
      }
      p.health = p.maxHealth;
      const pass = hits.length === 3
        && hits[0].damaged === true && hits[1].damaged === false && hits[2].damaged === true
        && !!window && window.from > 0.10 && window.from < 0.22 && window.to > 0.42 && window.to < 0.56;
      return { pass, detail: { hits, measuredWindowK: window, iFramesSeconds: p.iFrames,
                               rollSeconds: +p.dodgeDuration.toFixed(2), samples: trail.length } };
    })()`,
  },

  /* ----------------------------------------------------------------- A30b */
  {
    id: 'A30b-fall-wade-edge', kind: 'action', lane: 'player-control',
    title: 'Fall damage >4 m / lethal >9 m, wade slowdown in a pool, and a soft world edge instead of a wall',
    setup: `__CTX__.input.enabled = true;`,
    settle: 700, timeout: 90000,
    assert: `(async () => {
      ${FREEZE}
      ${FLAT}
      const C = __CTX__, p = C.player, E = C.engine;
      freeze();
      const spot = flatSpot(20, 150);
      if (!spot) return { pass: null, detail: 'SKIP: no flat clear ground found' };
      const drop = async (h) => {
        C.input.keys.clear();
        C.state = 'playing';
        p.position.set(spot.x, 0, spot.z); p.velocity.set(0, 0, 0); p._snapToGround();
        p.health = p.maxHealth;
        await new Promise((r) => setTimeout(r, 260));
        p.lastJump = null;
        p.position.y += h; p.grounded = false; p.velocity.y = 0;
        p._launchY = p.position.y; p._fallPeak = p.position.y;
        const t0 = performance.now();
        while (!p.lastJump && performance.now() - t0 < 8000) await new Promise((r) => requestAnimationFrame(r));
        return { h, fall: p.lastJump && p.lastJump.fall, health: +p.health.toFixed(1), state: C.state };
      };
      const safe = await drop(3);
      const hurt = await drop(6);
      const lethal = await drop(12);
      C.state = 'playing'; p.health = p.maxHealth;

      // --- wade
      const pools = C.environment && C.environment.water && C.environment.water.pools;
      let wade = null;
      if (pools && pools.length) {
        const q = pools[0];
        p.position.set(q.x, 0, q.z); p.velocity.set(0, 0, 0); p._snapToGround();
        p.camYaw = Math.PI; await new Promise((r) => setTimeout(r, 400));
        const depth = p.waterDepth, wading = p.wading;
        C.input.keys.add('KeyW');
        let t0 = E.simTime;
        while (E.simTime - t0 < 1.0) await new Promise((r) => requestAnimationFrame(r));
        const a = p.position.clone(); t0 = E.simTime;
        while (E.simTime - t0 < 0.8) await new Promise((r) => requestAnimationFrame(r));
        const v = Math.hypot(p.position.x - a.x, p.position.z - a.z) / (E.simTime - t0);
        C.input.keys.clear();
        wade = { depthM: +depth.toFixed(2), wading, speedMs: +v.toFixed(2) };
      }

      /* --- soft edge: sprint straight at the rim.  The BEARING is chosen, not
       * fixed at +X: the prompt fires at k > 0.08 (r > 313.4) and the run is a
       * fixed 4 s of sim, so a rim that has since grown a 50 deg lip stops her
       * dead short of the band and the edge system is never exercised at all
       * (measured maxR 312.8, peak 2.34 m/s, prompted false, from both 305 and
       * 308).  Walk the outward ray at 24 bearings and take the flattest.
       * Same bars — this only guarantees she can REACH the thing under test. */
      let bear = 0, bearCost = 1e9;
      for (let b = 0; b < 24; b++) {
        const a2 = (b / 24) * Math.PI * 2;
        let worst2 = 0, prev = C.terrain.getHeight(Math.sin(a2) * 306, Math.cos(a2) * 306);
        for (let rr = 307; rr <= 316; rr++) {
          const h2 = C.terrain.getHeight(Math.sin(a2) * rr, Math.cos(a2) * rr);
          worst2 = Math.max(worst2, h2 - prev); prev = h2;
        }
        if (worst2 < bearCost) { bearCost = worst2; bear = a2; }
      }
      p.position.set(Math.sin(bear) * 306, 0, Math.cos(bear) * 306);
      p.velocity.set(0, 0, 0); p._snapToGround();
      p.camYaw = Math.atan2(-p.position.x, -p.position.z);   // W drives outward
      await new Promise((r) => setTimeout(r, 300));
      let prompted = false;
      const off = (e) => { if (e && e.active) prompted = true; };
      C.events.on('player-edge', off);
      C.input.keys.add('KeyW'); C.input.keys.add('ShiftLeft');
      const trail = [];
      /* 6.5 s, not 4: the soft edge is a damping RATE (time constant 2.5 s at
       * the start of the band by design, so it reads as a soft edge and not a
       * wall), and a 4 s window that spends only the last 1.5 s inside the
       * band measures the approach, not the braking — endV/peakV 0.56 against
       * a 0.45 bar with the mechanism working exactly as specified.  Same bar,
       * a window long enough to contain the thing it measures. */
      let t0 = E.simTime;
      while (E.simTime - t0 < 6.5) {
        await new Promise((r) => requestAnimationFrame(r));
        trail.push({ r: Math.hypot(p.position.x, p.position.z), k: p.edgeK, v: p.moveSpeed });
      }
      C.input.keys.clear();
      const maxR = Math.max(...trail.map((x) => x.r));
      const entered = trail.filter((x) => x.k > 0);
      const endV = trail.slice(-8).reduce((s2, x) => s2 + x.v, 0) / Math.max(1, trail.slice(-8).length);
      // the baseline is her PEAK on the approach, not the first frames — she
      // starts from a standstill, so a "first 8 frames" baseline measures the
      // acceleration ramp and nothing else
      const peakV = trail.reduce((s2, x) => Math.max(s2, x.v), 0);

      const pass = safe.health === 100
        && hurt.health < 100 && hurt.health > 40
        && lethal.health === 0
        && (!wade || (wade.wading === true && wade.speedMs < p.speeds.jog * 0.9))
        && maxR <= 330 && maxR > 313 && entered.length > 5 && endV < peakV * 0.45 && prompted;
      return { pass, detail: { safe, hurt, lethal, wade,
        edge: { maxR: +maxR.toFixed(1), framesInBand: entered.length, prompted,
                peakSpeed: +peakV.toFixed(2), endSpeed: +endV.toFixed(2) } } };
    })()`,
  },

  /* ------------------------------------------------------------------ A31 */
  {
    id: 'A31-crouch-aim', kind: 'action', lane: 'player-control',
    title: 'C toggles crouch and aiming does not cancel it: grass stealth holds, pivot <= 1.2 m',
    setup: `__CTX__.input.enabled = true;`,
    /* 300 s (was 90): ~830 frames of sweeps; under a load average of 43 the
     * lane run timed out at 90 s with no bar failing (residue fix round 3) */
    settle: 700, timeout: 300000,
    assert: `(async () => {
      ${FREEZE}
      const C = __CTX__, p = C.player, T = C.terrain;
      freeze();
      // deterministic patch of tall grass
      let spot = null;
      for (let x = -160; x <= 160 && !spot; x += 2) {
        for (let z = -160; z <= 160; z += 2) {
          if (!T.isInTallGrass(x, z)) continue;
          if (C.collision && C.collision.sphereQuery(x, T.getHeight(x, z) + 1, z, 2.5, [], (c) => c.blocking).length) continue;
          spot = { x, z }; break;
        }
      }
      if (!spot) return { pass: null, detail: 'SKIP: no tall grass found' };
      p.position.set(spot.x, 0, spot.z); p.velocity.set(0, 0, 0); p._snapToGround();
      p.camYaw = Math.PI; C.input.keys.clear(); C.input.mouse.buttons = 0;
      if (p.crouching) p.setCrouch(false);
      await new Promise((r) => setTimeout(r, 450));

      // a REAL key press through the real listener — C is a toggle now
      const key = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code }));
      key('KeyC');
      await new Promise((r) => setTimeout(r, 350));
      const afterC = { crouching: p.crouching, pivotH: +p.pivotHeight.toFixed(3) };
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC' }));   // toggle: release must not stand her up
      await new Promise((r) => setTimeout(r, 350));
      const afterRelease = { crouching: p.crouching };

      // now aim
      C.input.mouse.buttons |= 4;
      await new Promise((r) => setTimeout(r, 600));
      const stealth = p.crouching && p.inTallGrass;   // machine.js:1174 predicate
      const aim = {
        crouching: p.crouching, aiming: p.aiming, crouchAim: p.crouchAim,
        inTallGrass: p.inTallGrass, stealth,
        pivotH: +p.pivotHeight.toFixed(3),
        pivotAboveFeet: +(p.camPivot.y - p.position.y).toFixed(3),
      };
      C.input.mouse.buttons = 0;                       // releasing aim must not stand her up
      await new Promise((r) => setTimeout(r, 300));
      const afterAim = { crouching: p.crouching };
      /* --- FIX ROUND 3 (judge: "A31's camera pivot <= 1.2 m bar is violated
       * while crouch-aiming at ANY look-up; the guard that enforces it is dead
       * code").
       *
       * The bar above is measured at whatever pitch the crouch-aim happened to
       * be sitting at — which is ~0, and at "up" 0 the look-up lift is 0, so
       * this gate could never see the defect it is named for.  That is how the
       * dead guard shipped: _lookLift, which carries the clamp, was not being
       * called, and the raw LOOKUP_LIFT * up * up curve put the pivot 1.51 m
       * above her feet at the pitch clamp.
       *
       * So the look-up is now STAGED, and staged the way a player reaches it —
       * by sweeping mouse.dy, the same field the pointer-lock listener writes
       * (a teleported camPitch skips the pivot damp transient, and the
       * transient is where the second half of this defect lived: the damp LEADS
       * its target by v/k, so a target pinned exactly to the bar is delivered
       * ABOVE it — measured 1.2139 / 1.2162 / 1.2176 m on slow / normal / flick
       * sweeps of the shipped build).  Every frame of the sweep is sampled, and
       * the bar is on the WORST frame, not on the settled one. */
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const sweepUp = async (dy) => {
        p.camPitch = 0; p.position.set(spot.x, p.position.y, spot.z); p.velocity.set(0, 0, 0);
        for (let i = 0; i < 20; i++) { p.position.set(spot.x, p.position.y, spot.z); p.velocity.set(0, 0, 0); await frame(); }
        let worst = -9, atDeg = 0, peakDeg = 0;
        for (let i = 0; i < 110; i++) {
          C.input.mouse.dy = dy;                  // the REAL look path
          await frame();
          p.position.set(spot.x, p.position.y, spot.z); p.velocity.set(0, 0, 0);
          const above = p.camPivot.y - p.position.y;
          const deg = -p.camPitch * 180 / Math.PI;
          if (deg > peakDeg) peakDeg = deg;
          if (above > worst) { worst = above; atDeg = deg; }
        }
        return { dy, maxPivotAboveFeet: +worst.toFixed(4), atPitchDeg: +atDeg.toFixed(1),
                 peakPitchDeg: +peakDeg.toFixed(1),
                 settledAboveFeet: +(p.camPivot.y - p.position.y).toFixed(4),
                 crouchAim: p.crouchAim, overBar: worst > 1.2 };
      };
      C.input.mouse.buttons |= 4;                 // still crouch-aiming
      const lookUps = [];
      for (const dy of [-40, -120, -400, -900]) lookUps.push(await sweepUp(dy));
      /* …and the STAGED pitch axis the judge asked for, verbatim ("stage
       * crouch+aim at camPitch -0.5 / -0.8 / -1.15 and assert pivotAboveFeet
       * <= 1.2 on every one"): each pitch is held for 40 frames from a settled
       * pitch-0 crouch-aim, so the step itself (the damp's worst transient)
       * and the settled value are both inside the sampled window. */
      const staged = [];
      for (const pitch of [-0.5, -0.8, -1.15]) {
        p.camPitch = 0; p.position.set(spot.x, p.position.y, spot.z); p.velocity.set(0, 0, 0);
        for (let i = 0; i < 20; i++) { p.camPitch = 0; p.position.set(spot.x, p.position.y, spot.z); p.velocity.set(0, 0, 0); await frame(); }
        let worst = -9;
        for (let i = 0; i < 40; i++) {
          p.camPitch = pitch;
          await frame();
          p.position.set(spot.x, p.position.y, spot.z); p.velocity.set(0, 0, 0);
          const above = p.camPivot.y - p.position.y;
          if (above > worst) worst = above;
        }
        staged.push({ camPitch: pitch, maxPivotAboveFeet: +worst.toFixed(4),
          settledAboveFeet: +(p.camPivot.y - p.position.y).toFixed(4), crouchAim: p.crouchAim });
      }
      /* …and the standing look-up must NOT be clamped: 1.06 is a crouch pivot,
       * and capping a standing one at 1.2 would quietly break the look-up
       * framing A32b measures.  This row proves the clamp is crouch-only. */
      C.input.mouse.buttons = 0;
      key('KeyC');                                     // second press stands her up
      await new Promise((r) => setTimeout(r, 400));
      const toggledOff = !p.crouching;
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyC' }));
      C.input.mouse.buttons |= 4;
      const standing = await sweepUp(-400);
      C.input.mouse.buttons = 0;
      p.camPitch = 0;

      const maxLookUpPivot = Math.max(...lookUps.map((r) => r.maxPivotAboveFeet));
      const reachedClamp = lookUps.every((r) => r.peakPitchDeg >= 60);
      const heldCrouchAim = lookUps.every((r) => r.crouchAim === true);
      const standingFree = standing.maxPivotAboveFeet > 1.25;   // NOT clamped
      const stagedOK = staged.every((r) => r.maxPivotAboveFeet <= 1.2 && r.crouchAim === true);

      const pass = afterC.crouching === true && afterRelease.crouching === true
        && aim.crouching === true && aim.aiming === true && aim.crouchAim === true
        && aim.stealth === true && aim.pivotH <= 1.2 && aim.pivotAboveFeet <= 1.2
        && afterAim.crouching === true && toggledOff === true
        && maxLookUpPivot <= 1.2 && reachedClamp && heldCrouchAim && standingFree && stagedOK;
      return { pass, detail: { spot, afterC, afterRelease, aim, afterAim, toggledOff,
        stagedPitches: staged, stagedOK,
        lookUps, maxLookUpPivot: +maxLookUpPivot.toFixed(4), reachedClamp, heldCrouchAim,
        standingLookUp: standing, standingNotClamped: standingFree } };
    })()`,
  },

  /* ------------------------------------------------------------------ A32 */
  {
    id: 'A32-look-up', kind: 'action', lane: 'player-control',
    title: 'Forward pitch reaches >= 60 deg while aiming, standing AND crouched; an aerial target at 10 m / 16 m altitude is on the reticle in both; crouched, she stays solid (opacity >= 0.98) and the boom >= 0.85 m at the clamp',
    setup: `__CTX__.input.enabled = true;`,
    settle: 700, timeout: 90000,
    assert: `(async () => {
      ${FREEZE}
      ${FLAT}
      const C = __CTX__, p = C.player, V = p.position.constructor;
      freeze();
      const spot = flatSpot(20, 150);
      if (!spot) return { pass: null, detail: 'SKIP: no flat clear ground found' };
      p.position.set(spot.x, 0, spot.z); p.velocity.set(0, 0, 0); p._snapToGround();
      p.camYaw = Math.PI; C.input.keys.clear();
      C.input.mouse.buttons |= 4;                       // aiming
      await new Promise((r) => setTimeout(r, 500));

      // drive the look with the SAME field the pointer-lock listener writes
      for (let i = 0; i < 90; i++) {
        C.input.mouse.dy = -400;
        await new Promise((r) => requestAnimationFrame(r));
      }
      await new Promise((r) => setTimeout(r, 200));

      const fwd = new V(0, 0, -1).applyQuaternion(C.camera.quaternion).normalize();
      const forwardPitch = Math.asin(Math.max(-1, Math.min(1, fwd.y))) * 180 / Math.PI;
      const atClamp = { camPitch: +p.camPitch.toFixed(3), boomM: +p.boomLength.toFixed(2) };

      /* "reticle-reachable" is not "visible at maximum pitch" — at the clamp the
       * lens is looking PAST a nearer target.  It means the player can put the
       * reticle on it, so do exactly that: a closed-loop servo on the mouse
       * delta, the same field the pointer-lock listener writes, until the
       * Flier sits on the crosshair. */
      const bx = Math.sin(p.heading), bz = Math.cos(p.heading);
      const targets = [];
      for (const alt of [10, 16]) {
        const t = new V(p.position.x + bx * 10, p.position.y + alt, p.position.z + bz * 10);
        let ndc = t.clone().project(C.camera);
        for (let i = 0; i < 150 && Math.abs(ndc.y) > 0.03; i++) {
          C.input.mouse.dy = -Math.max(-60, Math.min(60, ndc.y * 90));
          await new Promise((r) => requestAnimationFrame(r));
          ndc = t.clone().project(C.camera);
        }
        const eye = C.camera.position;
        const elev = Math.atan2(t.y - eye.y, Math.hypot(t.x - eye.x, t.z - eye.z)) * 180 / Math.PI;
        targets.push({ alt, elevDeg: +elev.toFixed(1), ndcX: +ndc.x.toFixed(3), ndcY: +ndc.y.toFixed(3),
                       camPitchDeg: +(p.camPitch * 180 / Math.PI).toFixed(1),
                       onReticle: Math.abs(ndc.x) < 0.12 && Math.abs(ndc.y) < 0.12 && ndc.z < 1 });
      }
      C.input.mouse.buttons = 0;

      /* RESIDUE FIX ROUND 1 (judge: "the Finding-1 crouch pivot cap cuts
       * crouch-aim look-up to 51.6 deg; A32's 16 m Flier is no longer
       * reticle-reachable while crouched").  A32 never crouched, so A31's
       * 1.2 m pivot cap could take the look-up away unseen: from a 1.2 m pivot
       * the 0.9 m minimum boom meets the ground, the ground rotation lifts it
       * 14 deg, and the view hijack used to hand all 14 back out of the aim.
       * Crouch-aiming from tall grass at a flier is core stealth play, so the
       * same procedure now runs crouched: C, aim, the same sweep, the same
       * servo, the same bars. */
      p.camPitch = 0; p.setCrouch(true);
      await new Promise((r) => setTimeout(r, 350));
      C.input.mouse.buttons |= 4;
      await new Promise((r) => setTimeout(r, 500));
      /* RESIDUE FIX ROUND 3 (judge: "crouch-aim at a 56-66 deg look-up
       * dissolves the hero to opacity 0.06 on flat open ground … A32's crouch row
       * records crouchAim.atClamp {boomM 0.5, reliefDeg 0} and passes, because
       * it only checks pitch and reticle").  The crouch row now also holds her
       * applied opacity (every frame of the sweep and the 30 frames after it)
       * and the boom at the clamp (>= 0.85 m: the crouch-aim boom is 0.9 m,
       * BOOM_MIN, and the judge's dissolved frame read 0.5). */
      let crouchMinU = 1;
      const minU = () => { let u = 1; for (const m of p._mats) if (m.u.value < u) u = m.u.value; return u; };
      for (let i = 0; i < 90; i++) {
        C.input.mouse.dy = -400;
        await new Promise((r) => requestAnimationFrame(r));
        crouchMinU = Math.min(crouchMinU, minU());
      }
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        crouchMinU = Math.min(crouchMinU, minU());
      }
      await new Promise((r) => setTimeout(r, 200));
      crouchMinU = Math.min(crouchMinU, minU());
      const cfwd = new V(0, 0, -1).applyQuaternion(C.camera.quaternion).normalize();
      const crouchPitch = Math.asin(Math.max(-1, Math.min(1, cfwd.y))) * 180 / Math.PI;
      const crouchAt = { camPitch: +p.camPitch.toFixed(3), boomM: +p.boomLength.toFixed(2),
        crouchAim: p.crouchAim, pivotAboveFeet: +(p.camPivot.y - p.position.y).toFixed(3),
        reliefDeg: +((p.camRelief || 0) * 180 / Math.PI).toFixed(1), hijackDeg: +((p.camHijack || 0) * 180 / Math.PI).toFixed(1),
        lensGapM: +C.camera.position.distanceTo(p.camPivot).toFixed(2), minOpacity: +crouchMinU.toFixed(3) };
      const cbx = Math.sin(p.heading), cbz = Math.cos(p.heading);
      const crouchTargets = [];
      for (const alt of [10, 16]) {
        const t = new V(p.position.x + cbx * 10, p.position.y + alt, p.position.z + cbz * 10);
        let ndc = t.clone().project(C.camera);
        for (let i = 0; i < 150 && Math.abs(ndc.y) > 0.03; i++) {
          C.input.mouse.dy = -Math.max(-60, Math.min(60, ndc.y * 90));
          await new Promise((r) => requestAnimationFrame(r));
          ndc = t.clone().project(C.camera);
        }
        crouchTargets.push({ alt, ndcX: +ndc.x.toFixed(3), ndcY: +ndc.y.toFixed(3),
          camPitchDeg: +(p.camPitch * 180 / Math.PI).toFixed(1),
          onReticle: Math.abs(ndc.x) < 0.12 && Math.abs(ndc.y) < 0.12 && ndc.z < 1 });
      }
      const crouchHeld = p.crouching && p.aiming && p.crouchAim;
      C.input.mouse.buttons = 0;
      p.setCrouch(false);
      const crouchSolid = crouchAt.minOpacity >= 0.98 && crouchAt.boomM >= 0.85;
      const pass = forwardPitch >= 60 && targets.every((t) => t.onReticle)
        && crouchHeld && crouchPitch >= 60 && crouchTargets.every((t) => t.onReticle) && crouchSolid;
      return { pass, detail: { forwardPitchDeg: +forwardPitch.toFixed(1), atClamp, targets,
        crouchAim: { held: crouchHeld, forwardPitchDeg: +crouchPitch.toFixed(1), atClamp: crouchAt, solid: crouchSolid, targets: crouchTargets } } };
    })()`,
  },

  /* ------------------------------------------------------------------ V22 */
  {
    id: 'V22-chase-framing', kind: 'action', lane: 'player-control',
    title: 'Idle chase cam frames her like the licence-clean third-person chase reference: >=55% of frame height, lens at head level',
    // R5: the Round-4 reference was a publisher press still (deleted at W0b, A-reference-clean);
    // the licence-clean one arrives with A-reference-set (gates-perf W0b).
    reference: 'reference/r5/gates-perf/chase-back (A-reference-set, W0b)',
    criteria: 'Side-by-side with the licence-clean chase reference: the hero fills at least 55% of frame height, '
      + 'the lens sits at head height behind her right shoulder, the horizon is near mid-frame and the camera is '
      + 'not looking down at her. FAIL if she is a distant doll, if the camera is above her head looking down, '
      + 'or if she is centred with no shoulder offset.',
    setup: `__CTX__.input.enabled = true; document.getElementById('hud').style.display = 'none';`,
    settle: 900, timeout: 90000,
    assert: `(async () => {
      ${FREEZE}
      ${FLAT}
      ${SILHOUETTE}
      const C = __CTX__, p = C.player, V = p.position.constructor;
      freeze();
      const spot = flatSpot(20, 150);
      if (!spot) return { pass: null, detail: 'SKIP: no flat clear ground found' };
      p.position.set(spot.x, 0, spot.z); p.velocity.set(0, 0, 0); p._snapToGround();
      p.camYaw = Math.PI; p.camPitch = 0.10; p.heading = 0;
      C.input.keys.clear(); C.input.mouse.buttons = 0;

      /* Wait for a SETTLED lens, not a fixed wall-clock delay.  A fixed 1400 ms
       * measures whatever the box managed in 1400 ms: under load (this repo is
       * often running several lanes' suites at once) the canvas had not reached
       * its final size and the pivot damp had not converged, and the gate read a
       * camera 7 % short of the boom — bimodal PASS/FAIL with nothing else
       * different.  Require 12 consecutive frames with the lens, the aspect and
       * the model all still, so the measurement is the same on any box. */
      let still = 0, px = 1e9, py = 1e9, pz = 1e9, pa = 0, settledIn = 0;
      for (let i = 0; i < 420 && still < 12; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        settledIn = i;
        const c = C.camera;
        const moved = Math.abs(c.position.x - px) + Math.abs(c.position.y - py)
          + Math.abs(c.position.z - pz) + Math.abs(c.aspect - pa);
        px = c.position.x; py = c.position.y; pz = c.position.z; pa = c.aspect;
        still = (moved < 0.001 && C.state === 'playing') ? still + 1 : 0;
      }

      const s = silhouette();
      const cam = C.camera;
      const fwd = new V(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
      const lookDownDeg = -Math.asin(Math.max(-1, Math.min(1, fwd.y))) * 180 / Math.PI;
      const camAbove = cam.position.y - p.position.y;
      // she must be off-centre (over the shoulder), not dead centre
      const cx = (s.minX + s.maxX) / 2;
      const pass = s.visible >= 0.55 && camAbove >= 1.15 && camAbove <= 2.15
        && lookDownDeg <= 15 && Math.abs(cx) > 0.02 && Math.abs(cx) < 0.45
        && s.minY > -1.08;
      return { pass, detail: {
        fillVisible: +s.visible.toFixed(3), fillFull: +s.full.toFixed(3),
        ndcFeet: +s.minY.toFixed(3), ndcCrown: +s.maxY.toFixed(3), ndcCentreX: +cx.toFixed(3),
        camAboveFeetM: +camAbove.toFixed(2), lookDownDeg: +lookDownDeg.toFixed(1),
        boomM: +p.boomLength.toFixed(2), camDist: +p.camDist.toFixed(2),
        pivotH: p.pivotHeight, fov: cam.fov, verts: s.n, at: spot,
        // diagnostics only — no bar reads these
        aspect: +cam.aspect.toFixed(3), state: C.state,
        camY: +cam.position.y.toFixed(3), pY: +p.position.y.toFixed(3),
        lensFromPivot: +cam.position.distanceTo(p.camPivot).toFixed(3),
        pivotY: +p.camPivot.y.toFixed(3), pivotX: +p.camPivot.x.toFixed(3),
        camPitch: +p.camPitch.toFixed(3), camYaw: +p.camYaw.toFixed(3),
        heading: +p.heading.toFixed(3), moveSpeed: +p.moveSpeed.toFixed(2),
        shake: +p._shake.toFixed(3), fade: +p.fade.toFixed(3), mats: p._mats.length,
        settledAfterFrames: settledIn, settleStreak: still,
      } };
    })()`,
  },
  /* ----------------------------------------------------------------- A29b */
  {
    id: 'A29b-slope-no-ghost', kind: 'action', lane: 'player-control',
    title: 'Real terrain, 8 slope bands x 2 headings: no ghosting on any hillside, and the boom stays off her head',
    criteria: 'Film shows the hero walking a real hillside, SOLID — no screen-door dither anywhere on body, '
      + 'hair, bow or quiver — at the normal chase distance. FAIL if she is translucent or dithered, if the '
      + 'lens is inside her head or shoulders, or if she is out of frame. (The steeper, camera-lifted case '
      + 'is shots/fix2-a29-face.png: same rule, 56 deg face, solid.)',
    setup: `__CTX__.input.enabled = true; document.getElementById('hud').style.display = 'none';`,
    settle: 700, timeout: 90000,
    assert: `(async () => {
      ${FREEZE}
      const C = __CTX__, p = C.player, T = C.terrain;
      freeze();
      const V = p.position.constructor, n = new V();

      /* A32b sweeps camera PITCH on flat ground.  This sweeps SLOPE on the
       * real heightfield, which is the case that regressed: descending points
       * the boom up-hill, cameraBoom's terrain march legitimately cuts it, and
       * a fade that reads any cut as an occluder dissolves her for the whole
       * descent.  A hillside is not an occluder — nothing here may fade her. */
      const BANDS = [[6, 10], [10, 15], [15, 20], [20, 26], [26, 33], [33, 42], [42, 52], [52, 70]];
      /* Anything the camera can legitimately hide behind: solid camera
       * colliders AND leaf canopy (the lens inside a tree fades her on
       * purpose).  Those rows are reported but not judged. */
      const hider = (c) => c.camera || c.kind === 'canopy';
      /* Two passes per band: a spot with 7 m of clear air around it FIRST, any
       * spot in the band second.  Same bars, same rows — but a boom that is no
       * longer cut by the hill reaches further back, so the un-vetted scan was
       * parking the lens inside a trunk on 9 of 16 rows and the gate ran out
       * of JUDGEABLE ones (clearRows 7, and it wants 10).  Vetting the staging
       * is not a softer bar; an unjudgeable row proves nothing either way. */
      const found = BANDS.map(() => null);
      for (let pass2 = 0; pass2 < 2; pass2++) {
        for (let x = -300; x <= 300 && found.some((f) => !f); x += 13) {
          for (let z = -300; z <= 300; z += 13) {
            if (Math.hypot(x, z) > 320) continue;
            T.getNormal(x, z, n);
            const d = Math.acos(Math.max(-1, Math.min(1, n.y))) * 180 / Math.PI;
            const b = BANDS.findIndex((r) => d >= r[0] && d < r[1]);
            if (b < 0 || found[b]) continue;
            if (!pass2 && C.collision.sphereQuery(
              x, T.getHeight(x, z) + 1, z, 7, [], hider).length) continue;
            found[b] = { x, z, deg: +d.toFixed(1), downhill: Math.atan2(n.x, n.z) };
          }
        }
      }
      const spots = found.filter(Boolean);
      if (spots.length < 6) return { pass: null, detail: { spots: spots.length, note: 'SKIP: terrain has too few slope bands' } };
      const rows = [];
      for (const s of spots) {
        for (const [tag, yawOff] of [['descending', 0], ['traversing', Math.PI / 2]]) {
          p.position.set(s.x, 0, s.z); p.velocity.set(0, 0, 0); p._snapToGround();
          p.heading = s.downhill + yawOff; p.camYaw = p.heading + Math.PI; p.camPitch = 0.10;
          p._relief = 0; p._pivotSeeded = false;
          C.input.keys.clear(); C.input.mouse.buttons = 0;
          let minFade = 1, minApplied = 1, minBoom = 9, maxRelief = 0, occ = 0;
          let terr = 0, solid = 0, minLensGap = 9;
          for (let i = 0; i < 16; i++) {
            await new Promise((r) => requestAnimationFrame(r));
            p.camPitch = 0.10;
            if (i < 6) continue;                        // let the relief damp land
            const e = C.camera.position;
            minFade = Math.min(minFade, p.fade);
            minApplied = Math.min(minApplied, p._fadeCur);
            minBoom = Math.min(minBoom, p.boomLength);
            minLensGap = Math.min(minLensGap, e.distanceTo(p.camPivot));
            maxRelief = Math.max(maxRelief, p.camRelief);
            terr = Math.max(terr, p.terrainCut); solid = Math.max(solid, p.solidCut);
            occ = Math.max(occ, C.collision.sphereQuery(e.x, e.y, e.z, 1.1, [], hider).length);
          }
          rows.push({ deg: s.deg, tag, at: [s.x, s.z], occ,
            minFade: +minFade.toFixed(3), minApplied: +minApplied.toFixed(3),
            minBoom: +minBoom.toFixed(2), lensGap: +minLensGap.toFixed(2),
            reliefDeg: +(maxRelief * 180 / Math.PI).toFixed(1),
            terrainCut: +terr.toFixed(2), solidCut: +solid.toFixed(2) });
        }
      }

      const clear = rows.filter((r) => r.occ === 0);
      const ghosted = clear.filter((r) => r.minFade < 0.999 || r.minApplied < 0.99);
      /* Lens jam. Two bars, because the two cases are different: on ground she
       * can STAND on the relief must hold a real boom (1.2 m), while above the
       * 50 deg slide limit she is already sliding and the hill geometry changes
       * under the damp every frame — there the bar is only that the lens never
       * gets inside her head at all (1.0 m; it was 0.53 m before the relief). */
      const jammed = clear.filter((r) => r.lensGap < 1.0 || (r.deg <= 50 && r.lensGap < 1.2));
      // a hill may never be BOOKED as an occluder, whatever it does to the boom
      const misbooked = clear.filter((r) => r.solidCut > 0.01);

      /* Park her on the steepest face she can actually STAND on (over the 50 deg
       * slide limit she is gone before the shutter opens) and let her settle,
       * so the still is a real steady-state frame and not a freeze-frame. */
      const standable = spots.filter((s) => s.deg < 46);
      const steep = standable.length ? standable[standable.length - 1] : spots[spots.length - 1];
      p.position.set(steep.x, 0, steep.z); p.velocity.set(0, 0, 0); p._snapToGround();
      p.heading = steep.downhill; p.camYaw = steep.downhill + Math.PI; p.camPitch = 0.10;
      C.input.keys.add('KeyW');
      for (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));
      C.input.keys.clear();
      for (let i = 0; i < 8; i++) await new Promise((r) => requestAnimationFrame(r));
      const pe = C.camera.position;
      const parked = { deg: steep.deg, slope: +p.slopeDeg.toFixed(1), fade: +p.fade.toFixed(3),
                       boom: +p.boomLength.toFixed(2), reliefDeg: +(p.camRelief * 180 / Math.PI).toFixed(1),
                       occ: C.collision.sphereQuery(pe.x, pe.y, pe.z, 1.1, [], hider).length,
                       mats: p._mats.length,
                       matsLeftFaded: p._mats.filter((e) => e.u.value < 0.99).length };
      // the FILM itself is judged, so assert the frame that gets captured: with
      // nothing near the lens, every one of her materials must be fully opaque
      const filmSolid = parked.occ > 0 || (parked.fade > 0.999 && parked.matsLeftFaded === 0);

      const pass = clear.length >= 10 && ghosted.length === 0
        && jammed.length === 0 && misbooked.length === 0 && filmSolid;
      return { pass, detail: { filmSolid,
        slopeBands: spots.map((s) => s.deg), rows: rows.length, clearRows: clear.length,
        ghostedOnClearSlopes: ghosted.length, lensInsideHer: jammed.length,
        hillBookedAsOccluder: misbooked.length,
        minFadeOnClearSlopes: +Math.min(...clear.map((r) => r.minFade)).toFixed(3),
        minBoomOnClearSlopes: +Math.min(...clear.map((r) => r.minBoom)).toFixed(2),
        minLensGapM: +Math.min(...clear.map((r) => r.lensGap)).toFixed(2),
        maxReliefDeg: Math.max(...rows.map((r) => r.reliefDeg)),
        parked, worst: [...ghosted, ...jammed, ...misbooked].slice(0, 4), rowsAll: rows,
      } };
    })()`,
  },

  /* ----------------------------------------------------------------- A32b */
  {
    id: 'A32b-lookup-no-ghost', kind: 'action', lane: 'player-control',
    title: 'Look-up never ghosts her without an occluder (standing, free, and CROUCH-AIMING swept to the clamp through the real input: opacity >= 0.98 and lens >= 0.85 m from the pivot every frame); a real occluder still fades her, dithered, with depth',
    criteria: 'Film shows the hero SOLID while aiming steeply up at open sky (bow, arrow, hair all opaque, '
      + 'no see-through interior). FAIL if she is translucent, if her silhouette shows internal geometry, '
      + 'or if the weapon stays solid while the body dissolves.',
    setup: `__CTX__.input.enabled = true; document.getElementById('hud').style.display = 'none';`,
    settle: 700, timeout: 90000,
    assert: `(async () => {
      ${FREEZE}
      ${FLAT}
      const C = __CTX__, p = C.player;
      freeze();
      const spot = flatSpot(20, 150);
      if (!spot) return { pass: null, detail: 'SKIP: no flat clear ground found' };
      const blocking = (c) => c.blocking !== false;

      /* --- 1. sweep the whole look-up range, aiming and free, on OPEN ground.
       * Nothing may fade her there: the boom is shortened on purpose, and a
       * deliberate shortening is not an occlusion. */
      const sweep = async (aim) => {
        p.position.set(spot.x, 0, spot.z); p.velocity.set(0, 0, 0); p._snapToGround();
        p.camYaw = Math.PI; p.heading = 0; C.input.keys.clear();
        C.input.mouse.buttons = aim ? 4 : 0;
        await new Promise((r) => setTimeout(r, 300));
        const rows = [];
        for (let deg = 0; deg <= 66; deg += 6) {
          p.camPitch = -deg * Math.PI / 180;
          for (let i = 0; i < 8; i++) await new Promise((r) => requestAnimationFrame(r));
          const e = C.camera.position;
          rows.push({
            deg,
            boom: +p.boomLength.toFixed(2),
            camDist: +p.camDist.toFixed(3),
            fade: +p.fade.toFixed(3),
            lensAboveFeet: +(e.y - p.position.y).toFixed(3),
            occ: C.collision.sphereQuery(e.x, e.y, e.z, 1.0, [], blocking).length,
          });
        }
        return rows;
      };
      const aimRows = await sweep(true);
      const freeRows = await sweep(false);

      /* --- 1b. CROUCH-AIM to the clamp (residue fix round 3, judge:
       * "crouch-aim at a 56-66 deg look-up dissolves the hero to opacity 0.06 on
       * flat open ground … A32b stages standing aim only").  The judge's own
       * staging through the real input path: C (keydown/keyup on the real
       * listener), RMB, mouse.dy sweeps to the clamp — slow (-40/frame) and a
       * flick (-400) — then held 60 frames.  On EVERY frame of the sweep and
       * the hold, on clear ground: applied opacity >= 0.98 and the lens >=
       * 0.85 m from the pivot (the crouch-aim boom is BOOM_MIN 0.9 m; the
       * dissolved frame sat at 0.50). */
      const crouchAim = [];
      {
        const key = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code }));
        const minU = () => { let u = 1; for (const m of p._mats) if (m.u.value < u) u = m.u.value; return u; };
        for (const dy of [-40, -400]) {
          p.position.set(spot.x, 0, spot.z); p.velocity.set(0, 0, 0); p._snapToGround();
          p.camYaw = Math.PI; p.heading = 0; p.camPitch = 0; C.input.keys.clear(); C.input.mouse.buttons = 0;
          if (p.crouching) p.setCrouch(false);
          for (let i = 0; i < 10; i++) await new Promise((r) => requestAnimationFrame(r));
          key('KeyC', 'keydown'); await new Promise((r) => requestAnimationFrame(r)); key('KeyC', 'keyup');
          C.input.mouse.buttons |= 4;
          for (let i = 0; i < 25; i++) await new Promise((r) => requestAnimationFrame(r));
          let u = 1, gap = 9, occ = 0, frames = 0, worst = null, peak = 0;
          for (let i = 0; i < 100; i++) {
            if (i < 40) C.input.mouse.dy = dy;
            C.input.mouse.buttons |= 4;
            await new Promise((r) => requestAnimationFrame(r));
            p.position.x = spot.x; p.position.z = spot.z; p.velocity.x = 0; p.velocity.z = 0;
            const e = C.camera.position;
            if (C.collision.sphereQuery(e.x, e.y, e.z, 1.0, [], blocking).length) { occ++; continue; }
            frames++;
            const uu = minU(), g = e.distanceTo(p.camPivot);
            peak = Math.max(peak, -p.camPitch * 180 / Math.PI);
            if (uu < u || g < gap) worst = { frame: i, pitchDeg: +(-p.camPitch * 180 / Math.PI).toFixed(1), opacity: +uu.toFixed(3),
              lensGap: +g.toFixed(2), boom: +p.boomLength.toFixed(2), reliefDeg: +(p.camRelief * 180 / Math.PI).toFixed(1) };
            u = Math.min(u, uu); gap = Math.min(gap, g);
          }
          crouchAim.push({ dy, crouchAim: p.crouchAim, peakPitchDeg: +peak.toFixed(1), frames, occ,
            minOpacity: +u.toFixed(3), minLensGap: +gap.toFixed(2), worst,
            elevDeg: +(p.camElev * 180 / Math.PI).toFixed(1), reliefDeg: +(p.camRelief * 180 / Math.PI).toFixed(1),
            ok: p.crouchAim === true && peak >= 60 && occ === 0 && u >= 0.98 && gap >= 0.85 });
          C.input.mouse.buttons = 0;
          key('KeyC', 'keydown'); await new Promise((r) => requestAnimationFrame(r)); key('KeyC', 'keyup');
        }
        if (p.crouching) p.setCrouch(false);
      }
      const crouchAimOK = crouchAim.every((r) => r.ok);
      const clear = [...aimRows, ...freeRows].filter((r) => r.occ === 0);
      const ghosted = clear.filter((r) => r.fade < 0.999);
      const sunk = clear.filter((r) => r.lensAboveFeet < 0.5);
      // the boom must not wander up and down as she tracks a flyer
      let mono = true;
      for (let i = 1; i < aimRows.length; i++) if (aimRows[i].boom > aimRows[i - 1].boom + 0.02) mono = false;
      /* FIX ROUND 3 (judge: "re-measure camDist at 48 -> 66 deg directly ... the
       * linear curve needs its own check rather than the doc's assumption").
       * The boom check above tolerates +0.02 m per 6 deg step, which is enough
       * slack to hide a lift curve that grows faster than sin(pitch).  So the
       * boom the CAMERA asks for (camDist, before any collider) is read
       * directly over the steep end of the aim sweep, where _lookLift is
       * binding, and it may not grow at all (1 mm of float slack). */
      const steepAim = aimRows.filter((r) => r.deg >= 48);
      let camDistMono = steepAim.length >= 3;
      for (let i = 1; i < steepAim.length; i++) if (steepAim[i].camDist > steepAim[i - 1].camDist + 0.001) camDistMono = false;

      /* --- 2. a REAL occluder must still fade her, and the fade must be a
       * dithered discard in the opaque pass (depth written), not blending. */
      const rocks = [];
      C.collision.sphereQuery(0, 0, 0, 400, rocks, (c) => c.blocking !== false && c.kind === 'rock');
      let big = null;
      for (const c of rocks) if (!big || c.r > big.r) big = c;
      let occluded = null;
      if (big) {
        const a = 0.7, R = big.r;
        const px = big.cx + Math.cos(a) * (R + 0.42), pz = big.cz + Math.sin(a) * (R + 0.42);
        p.position.set(px, 0, pz); p.velocity.set(0, 0, 0); p._snapToGround();
        p.camYaw = Math.atan2(big.cx - px, big.cz - pz);
        p.camPitch = 0.05; p.heading = p.camYaw + Math.PI;
        C.input.mouse.buttons = 0;
        for (let i = 0; i < 55; i++) await new Promise((r) => requestAnimationFrame(r));
        const solid = p._mats.filter((e) => e.u.value > 0.99).length;
        occluded = {
          boom: +p.boomLength.toFixed(2), cut: +p.boomCut.toFixed(2), fade: +p.fade.toFixed(3),
          mats: p._mats.length, matsLeftSolid: solid,
          blended: p._mats.filter((e) => e.mat.transparent === true).length,
          depthOff: p._mats.filter((e) => e.mat.depthWrite === false).length,
        };
      }

      /* park her back on open sky, aiming up, for the film */
      p.position.set(spot.x, 0, spot.z); p.velocity.set(0, 0, 0); p._snapToGround();
      p.camYaw = Math.PI; p.heading = 0; p.camPitch = -1.15;
      C.input.mouse.buttons |= 4;
      for (let i = 0; i < 35; i++) await new Promise((r) => requestAnimationFrame(r));
      const parked = { fade: +p.fade.toFixed(3), boom: +p.boomLength.toFixed(2) };
      C.input.mouse.buttons = 0;

      const pass = ghosted.length === 0 && sunk.length === 0 && mono && camDistMono && crouchAimOK
        && parked.fade > 0.999
        && !!occluded && occluded.fade < 0.9 && occluded.matsLeftSolid === 0
        && occluded.depthOff === 0 && occluded.blended === 0;
      return { pass, detail: {
        clearSamples: clear.length, ghostedOnClearGround: ghosted.length, lensSunkBelow0m5: sunk.length,
        boomMonotonicInPitch: mono, camDistMonotonic48to66: camDistMono,
        aimCamDist48to66: steepAim.map((r) => [r.deg, r.camDist]), minFadeOnClearGround: +Math.min(...clear.map((r) => r.fade)).toFixed(3),
        minLensAboveFeet: +Math.min(...clear.map((r) => r.lensAboveFeet)).toFixed(3),
        parkedAt66deg: parked, occluded, worstClear: ghosted.slice(0, 4),
        crouchAim, crouchAimOK,
      } };
    })()`,
  },

  /* ---------------------------------------------------------------- A31b */
  /**
   * The film finding this closes, verbatim: "the hero still dissolves to
   * near-invisible (fade 0.44-0.72, depthWrite off) on an ordinary hillside the
   * moment she looks up - with NO occluder between camera and character
   * (solidCut 0)."
   *
   * A29b sweeps SLOPE at a fixed shallow pitch and A32b sweeps PITCH on flat
   * ground; neither stages the corner where the two meet, which is the one that
   * shipped broken twice.  This gate stages the shots the finding names and
   * reads the number that decides the pixels: the dither uniform on her
   * materials.
   *
   * FIX ROUND 1 — the judge round proved the first cut of this gate could not
   * see either of the two failures still on disk, so it now measures three
   * things it did not:
   *
   *   1. `minLensGapM` over EVERY sampled frame, not just the worst-opacity
   *      one.  A sprint parked the lens 0.45 m from her chest at opacity 1.000
   *      and the frame rendered her ABSENT, near-plane clipped; a gate that
   *      only reads opacity calls that a pass.
   *   2. an UPHILL sprint into a rising face, unpinned, alongside the downhill
   *      one — the moving case where the damp used to lag the geometry.
   *   3. AIM TRACKING: `camElev` vs the requested pitch on every clear
   *      staging.  The shipped build delivered -30.6 deg of look-DOWN for
   *      +28.6 deg of requested look-up (and -48.1 for +63.0), because the
   *      terrain lift rotated the boom and the view was aimed along it.  The
   *      contract is now stated and measured: the ground may take at most
   *      `player.camAimBudget` radians of look-down — half the requested
   *      look-up, capped at 25.8 deg, and never a sign flip.
   */
  {
    id: 'A31b-no-ghost-without-occluder', kind: 'action', lane: 'player-control',
    title: 'Hillside/valley/sprint look-ups across the WHOLE pitch range (-0.5, -0.8, -1.15 clamp): opacity >= 0.98, lens never inside her, aim within budget, framing within FRAME_KEEP of a flat-ground control staged at the SAME pitch and gait (one control per pitch/gait); a trunk still fades her < 0.8; the filmed frame (the 38.4 deg hillside at camPitch -0.8) is solid, looks up > 15 deg, has her head and both shoulders in frame with her top above centre, and shows sky (>= 60% of the top row, >= 25% of all view rays) and the skyline (>= 10% far terrain) with <= 25% near ground. Yaw pans and the 24-yaw sweep: A31d / A31e / A31f',
    criteria: 'Film: the 38.4 deg hillside at a deep look-up (camPitch -0.8, 45.8 deg asked), camera on the slope '
      + 'behind her. the hero is SOLID — no screen-door dither on body, hair, bow or quiver — her head and shoulders are '
      + 'IN FRAME at a normal chase distance, and the camera is LOOKING UP (sky and the skyline in shot, not a frame '
      + 'of dirt). FAIL if she is translucent anywhere, if the lens is inside her, if she is off the edge of the '
      + 'frame, or if the shot points down when a look-up was asked for.',
    setup: `__CTX__.input.enabled = true; document.getElementById('hud').style.display = 'none';`,
    settle: 700, timeout: 900000,
    assert: placed(['steepFace'], `(async () => {${HERO}
      ${FREEZE}
      ${VISIBLE}
      ${SILHOUETTE_VIS}
      const C = __CTX__, p = C.player, T = C.terrain, K = C.collision;
      freeze();
      const V = p.position.constructor, n = new V();
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const DEG = 180 / Math.PI;
      /* Anything the lens may legitimately be behind: a camera collider or leaf
       * canopy.  A row with one of these near the lens is not evidence either
       * way and is reported, not judged. */
      const hider = (c) => c.camera || c.kind === 'canopy';

      /**
       * FIX ROUND 3 (judge: "A31b's onScreen bar is set below what flat ground
       * delivers").  Two changes to the ESTIMATOR, both of which only add
       * information:
       *   WINDOW  56 frames instead of 40, so the judged part is ~0.66 s — at
       *           a 6.7 m/s sprint that is 1.3 gait cycles rather than 0.8,
       *           and the median no longer depends on which half of a stride
       *           the window happened to open on.
       *   RATE    every 2nd judged frame instead of every 4th: 20 samples, not
       *           6.  The run bob swings a single frame's framing from 0.05 to
       *           0.32 at the clamp, and a 6-sample median of that is itself
       *           noisy — measured 0.139 and 0.234 on consecutive runs of the
       *           same staging off the same build.
       */
      const FRAMES = 56, SETTLE = 16;
      /** One staging: worst opacity frame, plus the worst of every frame. */
      const run = async (s) => {
        p.position.set(s.x, 0, s.z); p.velocity.set(0, 0, 0); p._snapToGround();
        p.heading = s.heading; p.camYaw = s.yaw; p.camPitch = s.pitch;
        p._relief = 0; p._lift = 0; p._pivotSeeded = false;
        C.input.keys.clear(); C.input.mouse.buttons = 0;
        if (s.keys) for (const k of s.keys) C.input.keys.add(k);
        let worst = null, worstAny = null, occFrames = 0, minGap = 9, maxLoss = -99, minElev = 99, occAny = 0, frames = 0;
        const fracs = [];                    // how much of her is in frame, per sample
        for (let i = 0; i < FRAMES; i++) {
          await frame();
          if (s.pin) {                       // hold the staging she was put in
            p.position.x = s.x; p.position.z = s.z;
            p.velocity.x = 0; p.velocity.z = 0;
            p.camYaw = s.yaw;
          }
          p.camPitch = s.pitch;              // the player's request, every frame
          if (i < SETTLE) continue;          // let the pivot/relief/lift damp land
          const e = C.camera.position;
          /* THE number this gate is about: the dither uniform actually bound on
           * her materials, not the intent field that feeds it. */
          let minU = 1;
          for (const m of p._mats) if (m.u.value < minU) minU = m.u.value;
          const occ = K.sphereQuery(e.x, e.y, e.z, 1.1, [], hider).length;
          const gap = e.distanceTo(p.camPivot);
          /* Framing is sampled ACROSS the window, not read off the last frame:
           * the gait and the run bob swing it wildly frame to frame (0.04 to
           * 0.35 measured four frames apart on one downhill sprint), so a
           * single sample is noise, not a measurement. */
          if (i % 2 === 0) { const sq = silhouette(); fracs.push(sq.n ? sq.onFrac : 0); }
          frames++;
          occAny = Math.max(occAny, occ);
          if (!occ) {
            if (gap < minGap) minGap = gap;
            const loss = (-s.pitch) - p.camElev;
            if (loss > maxLoss) maxLoss = loss;
            if (p.camElev < minElev) minElev = p.camElev;
          }
          const row = {
            tag: s.tag, opacity: +minU.toFixed(3), fade: +p.fade.toFixed(3),
            boom: +p.boomLength.toFixed(2), camDist: +p.camDist.toFixed(2),
            camDistFlat: +p.camDistFlat.toFixed(2),
            lift: +(p.camLift ?? 0).toFixed(2), reliefDeg: +(p.camRelief * DEG).toFixed(1),
            hijackDeg: +((p.camHijack ?? 0) * DEG).toFixed(1),
            solidCut: +p.solidCut.toFixed(3), terrainCut: +p.terrainCut.toFixed(3),
            lensGap: +gap.toFixed(2), occ,
            blended: p._mats.filter((m) => m.mat.transparent === true).length,
            depthOff: p._mats.filter((m) => m.mat.depthWrite === false).length,
          };
          /* RESIDUE FIX ROUND 2: the worst frame is taken over the frames
           * with NO hider near the lens (a hider is exactly where a fade is
           * right), and the row counts as judged while >= 75 % of its frames
           * are clear.  Under load the 56-frame sprint windows cover up to
           * twice the distance and the downhill clamp sprint ran into a
           * trunk for its last frames — correctly faded, and the whole row
           * was booked unjudgeable. */
          if (occ) occFrames++;
          if (!occ && (!worst || row.opacity < worst.opacity)) worst = row;
          if (!worstAny || row.opacity < worstAny.opacity) worstAny = row;
        }
        if (!worst || occFrames > 0.25 * frames) worst = worstAny;
        else worst.occ = 0;
        if (worst) worst.hiderFrames = occFrames;
        const sil = silhouette();                  // is she actually ON SCREEN?
        C.input.keys.clear();
        if (!worst) return null;
        worst.ndcTop = +sil.maxY.toFixed(2);
        worst.ndcBottom = +sil.minY.toFixed(2);
        worst.vertsInFront = sil.n;
        fracs.sort((a, b) => a - b);
        const medFrac = fracs.length ? fracs[fracs.length >> 1] : (sil.n ? sil.onFrac : 0);
        worst.onFrac = +medFrac.toFixed(3);
        worst.onFracLast = +sil.onFrac.toFixed(3);
        worst.onFracMin = fracs.length ? +fracs[0].toFixed(3) : null;
        /* "In the picture" measured DIRECTLY: the fraction of her vertices that
         * land inside the NDC box, in front of the lens.  The min/max heuristic
         * it replaces (abs minX < 9) is an artifact detector, not a visibility
         * test — one vertex a few centimetres past the near plane projects to
         * |x| ~ 20 while she fills half the frame, and both sprint stagings at
         * the clamp were failed on exactly that.
         *
         * FIX ROUND 3 — the bar is now RELATIVE to a flat-ground control at
         * the same pitch and the same gait (s.bar, see FRAME_KEEP below).
         * The absolute 0.12 it replaces was set BELOW what flat ground itself
         * delivers: measured here, flat ground sprinting at the pitch clamp
         * medians 0.12-0.16, so a 0.12 bar could only ever catch total loss of
         * the subject, never "the slope cost her the frame" — which is the
         * finding this gate exists for.  0.12 is kept as an absolute FLOOR, so
         * the bar is never weaker than it was. */
        worst.frameBar = +(s.bar ?? ONFRAC_FLOOR).toFixed(3);
        worst.frameCtrl = s.ctrl != null ? +s.ctrl.toFixed(3) : null;
        worst.frameRatio = s.ctrl ? +(medFrac / s.ctrl).toFixed(2) : null;
        worst.onScreen = sil.n > 0 && sil.maxY > -0.85 && sil.minY < 1
          && medFrac >= worst.frameBar;
        worst.minLensGap = +minGap.toFixed(2);
        worst.elevReqDeg = +((-s.pitch) * DEG).toFixed(1);
        worst.elevMinDeg = minElev < 99 ? +(minElev * DEG).toFixed(1) : null;
        worst.aimLossDeg = maxLoss > -99 ? +(maxLoss * DEG).toFixed(1) : null;
        worst.budgetDeg = +((p.camAimBudget ?? 0) * DEG).toFixed(1);
        worst.judgedFrames = frames;
        worst.occAny = occAny;
        return worst;
      };

      /* --- 0. THE CONTROL (fix round 3).
       *
       * The judge finding, verbatim: "A31b's onScreen bar is set below what
       * flat ground delivers."  It was: staged flat, sprinting at the pitch
       * clamp, this build medians 0.12-0.16 of her vertices in frame, and the
       * bar was 0.12.  The reason is geometry, not ground — at camPitch
       * -1.15 the boom is 1.31 m by design (LENS_FLOOR plus the look-up
       * shortening), which is shorter than she is tall, so she fills the
       * bottom of the frame and the run bob swings her legs out of it.  An
       * ABSOLUTE bar therefore measures the pitch clamp, not the hillside, and
       * cannot see the defect this gate was written for.
       *
       * So the bar is now a RATIO against a flat-ground control staged in the
       * SAME RUN at the SAME PITCH with the SAME GAIT — one pinned, one
       * sprinting — and the slope rows must keep FRAME_KEEP of what flat
       * ground delivers.  The old 0.12 stays as an absolute floor, so no row
       * is judged more leniently than before.
       */
      const ONFRAC_FLOOR = 0.12;
      const FRAME_KEEP = 0.45;
      let flat = null;
      for (let x = -220; x <= 220 && !flat; x += 7) {
        for (let z = -220; z <= 220; z += 7) {
          T.getNormal(x, z, n);
          if (Math.acos(Math.max(-1, Math.min(1, n.y))) * DEG > 3) continue;
          /* 14 m of clear air: the control sprints, so it has to stay out of
           * anything that could hide the lens for the whole window. */
          if (K.sphereQuery(x, T.getHeight(x, z) + 1, z, 14, [], hider).length) continue;
          flat = { x, z }; break;
        }
      }
      if (!flat) return { pass: null, detail: 'SKIP: no flat clear control ground found' };
      /* RESIDUE FIX ROUND 1 (judge: "A31b judges its -0.5 hillside row against
       * the clamp control").  It did: every pinned row — at -0.5, -0.8 and the
       * clamp — was held to the flat PINNED control at the CLAMP (0.382), and
       * every sprint row to the flat sprint at the clamp.  The flat control at
       * -0.5 frames her at 0.85, so the -0.5 hillside passed at 0.30 of its
       * own control.  There is now one control per pitch and gait the gate
       * uses, and every row is judged against the control at ITS pitch and
       * gait — the title says "the same pitch and gait", and now it is. */
      const PINNED = [-0.5, -0.8, -1.15], SPRINT = [0.06, -0.25, -0.8, -1.15];
      const CTRL = { pin: {}, run: {} };
      const controls = [];
      for (const pitch of PINNED) {
        const r = await run({ tag: 'flat-pinned@' + pitch, x: flat.x, z: flat.z,
          heading: 0, yaw: Math.PI, pitch, pin: true, bar: ONFRAC_FLOOR });
        if (!r) return { pass: null, detail: 'SKIP: control flat-pinned@' + pitch + ' produced no judged frames' };
        CTRL.pin[pitch] = { ctrl: r.onFrac, bar: Math.max(ONFRAC_FLOOR, FRAME_KEEP * r.onFrac) };
        controls.push(r);
      }
      for (const pitch of SPRINT) {
        const r = await run({ tag: 'flat-sprint@' + pitch, x: flat.x, z: flat.z,
          heading: 0, yaw: Math.PI, pitch, keys: ['KeyW', 'ShiftLeft'], bar: ONFRAC_FLOOR });
        if (!r) return { pass: null, detail: 'SKIP: control flat-sprint@' + pitch + ' produced no judged frames' };
        CTRL.run[pitch] = { ctrl: r.onFrac, bar: Math.max(ONFRAC_FLOOR, FRAME_KEEP * r.onFrac) };
        controls.push(r);
      }
      const PIN = (pitch) => CTRL.pin[pitch];
      const RUN = (pitch) => CTRL.run[pitch];

      /* --- 1. hillside look-up on an ORDINARY hillside — the finding's own
       * words.  The steepest face in 26-40 deg: comfortably inside the 50 deg
       * slide limit (SLIDE_DEG), so she is standing on it rather than being
       * carried down it, camera up-hill, camPitch -0.5, and clear of anything
       * the lens could hide behind.  A29b sweeps the whole band range at a
       * shallow pitch; the A29 face at this pitch is row 1b below. */
      let hill = null;
      for (let x = -300; x <= 300; x += 9) {
        for (let z = -300; z <= 300; z += 9) {
          if (Math.hypot(x, z) > 310) continue;
          T.getNormal(x, z, n);
          const d = Math.acos(Math.max(-1, Math.min(1, n.y))) * DEG;
          if (d < 26 || d > 40) continue;
          const h = T.getHeight(x, z);
          if (K.sphereQuery(x, h + 1, z, 7, [], hider).length) continue;
          /* …and out of the tall grass.  Grass is not a camera collider, so a
           * staging inside it is UNJUDGEABLE on film — she can be perfectly
           * solid and still invisible behind a curtain of tufts.  That is a
           * real gap (see the doc's known gaps) but it is the vegetation
           * lane's, and filming it here would only hide this lane's result. */
          if (T.tallGrassDensity && T.tallGrassDensity(x, z) > 0.12) continue;
          if (!hill || d > hill.deg) hill = { x, z, deg: +d.toFixed(1), down: Math.atan2(n.x, n.z) };
        }
      }
      if (!hill) return { pass: null, detail: 'SKIP: no clear 26-40 deg standable face found' };
      /* FIX ROUND 2 — a PITCH AXIS.  The first cut of this gate staged the
       * hillside at camPitch -0.5 only, and -0.5 is the one look-up on this
       * face that the shipped build survived: the judge round measured the
       * same staging dithering to 0.06 at the -1.15 clamp and to 0.58 at -0.8,
       * with solidCut 0 and nothing within 8 m.  Sweeping the corner in ONE
       * axis is what let two builds ship with the finding open, so the
       * hillside and both sprints now run the whole look-up range. */
      const hillside = await run({ tag: 'hillside-lookup', x: hill.x, z: hill.z,
        heading: hill.down, yaw: hill.down + Math.PI, pitch: -0.5, pin: true, ...PIN(-0.5) });
      const hillside80 = await run({ tag: 'hillside-lookup-0.8', x: hill.x, z: hill.z,
        heading: hill.down, yaw: hill.down + Math.PI, pitch: -0.8, pin: true, ...PIN(-0.8) });
      const hillsideClamp = await run({ tag: 'hillside-lookup-clamp', x: hill.x, z: hill.z,
        heading: hill.down, yaw: hill.down + Math.PI, pitch: -1.15, pin: true, ...PIN(-1.15) });

      /* --- 1b. the A29 FACE (56.5 deg) at the same look-up: past the slide
       * limit, and past what any camera can do.  There is no lens 1.2 m from
       * her chest on that face that is both outside the mountain and inside
       * the frame — the shipped build "passed" it only by re-aiming her camera
       * 59 deg, and forcing the lift instead films her below the bottom edge
       * (NDC top -1.13, measured).  So this row is judged on the CONTRACT
       * rather than on opacity: the aim she asked for is still delivered, the
       * hill is still not booked as an occluder, she is never a blended draw,
       * and if she dissolves at all the lens really is inside her. */
      const SF = PLACE('steepFace');
      T.getNormal(SF.x, SF.z, n);
      const faceDeg = Math.acos(Math.max(-1, Math.min(1, n.y))) * DEG;
      const down = Math.atan2(n.x, n.z);
      const face = faceDeg >= 40 ? await run({ tag: 'a29-face-lookup', x: SF.x, z: SF.z,
        heading: down, yaw: down + Math.PI, pitch: -0.5, pin: true, ...PIN(-0.5) }) : null;

      /* --- 2. valley floor look-up: the LOWEST clear near-flat spot */
      let low = null;
      for (let x = -140; x <= 140; x += 5) {
        for (let z = -140; z <= 140; z += 5) {
          T.getNormal(x, z, n);
          if (Math.acos(Math.max(-1, Math.min(1, n.y))) * DEG > 6) continue;
          const h = T.getHeight(x, z);
          if (K.sphereQuery(x, h + 1, z, 4, [], hider).length) continue;
          if (!low || h < low.h) low = { x, z, h };
        }
      }
      if (!low) return { pass: null, detail: 'SKIP: no clear valley floor found' };
      const valley = await run({ tag: 'valley-lookup', x: low.x, z: low.z,
        heading: 0, yaw: Math.PI, pitch: -0.5, pin: true, ...PIN(-0.5) });

      /* --- 3/4. real sprints on a real face, unpinned, DOWNhill and UPhill.
       * The uphill one is the staging the judge round asked for: the boom then
       * points back over ground that is FALLING while she climbs, so the solve
       * is chasing geometry at 6.8 m/s and the damp is what is on trial. */
      let dh = null;
      for (let x = -280; x <= 280 && !dh; x += 11) {
        for (let z = -280; z <= 280; z += 11) {
          if (Math.hypot(x, z) > 300) continue;
          T.getNormal(x, z, n);
          const deg = Math.acos(Math.max(-1, Math.min(1, n.y))) * DEG;
          if (deg < 20 || deg > 42) continue;
          const h = T.getHeight(x, z);
          /* 11 m of clear air: she really runs, so the clearance has to cover
           * the ~4 m she covers in the sampled window plus the boom behind her,
           * or a trunk drifts into the lens and the row becomes unjudgeable. */
          if (K.sphereQuery(x, h + 1, z, 11, [], hider).length) continue;
          dh = { x, z, deg: +deg.toFixed(1), down: Math.atan2(n.x, n.z) };
          break;
        }
      }
      if (!dh) return { pass: null, detail: 'SKIP: no clear 20-42 deg slope found' };
      const sprint = await run({ tag: 'sprint-downhill', x: dh.x, z: dh.z,
        heading: dh.down, yaw: dh.down + Math.PI, pitch: 0.06, keys: ['KeyW', 'ShiftLeft'], ...RUN(0.06) });
      /* Same face, run the other way: INTO the rising ground, with a look-up on
       * top of it — pitch and slope fighting each other while she moves. */
      const uphill = await run({ tag: 'sprint-uphill', x: dh.x, z: dh.z,
        heading: dh.down + Math.PI, yaw: dh.down, pitch: -0.25, keys: ['KeyW', 'ShiftLeft'], ...RUN(-0.25) });
      /* …and both sprints at the deep look-ups the judge round reproduced in
       * ordinary play: 50 of 56 frames dithered at the clamp uphill, 19 of 56
       * downhill, every one of them with maxSolidCut 0. */
      const sprintClamp = await run({ tag: 'sprint-downhill-clamp', x: dh.x, z: dh.z,
        heading: dh.down, yaw: dh.down + Math.PI, pitch: -1.15, keys: ['KeyW', 'ShiftLeft'], ...RUN(-1.15) });
      const uphillClamp = await run({ tag: 'sprint-uphill-clamp', x: dh.x, z: dh.z,
        heading: dh.down + Math.PI, yaw: dh.down, pitch: -1.15, keys: ['KeyW', 'ShiftLeft'], ...RUN(-1.15) });
      const uphill80 = await run({ tag: 'sprint-uphill-0.8', x: dh.x, z: dh.z,
        heading: dh.down + Math.PI, yaw: dh.down, pitch: -0.8, keys: ['KeyW', 'ShiftLeft'], ...RUN(-0.8) });

      /* --- 5. a real occluder: a TRUNK between the lens and the hero.  The fade
       * must engage here, or the clear rows prove nothing: a fade that is
       * simply switched off would pass them. */
      const trees = [];
      K.sphereQuery(0, 0, 0, 400, trees, (c) => c.kind === 'tree' && c.camera);
      let big = null;
      for (const c of trees) {
        const cx = c.cx ?? (c.ax + c.bx) / 2, cz = c.cz ?? (c.az + c.bz) / 2;
        if (Math.hypot(cx, cz) > 200) continue;
        if (!big || c.r > big.r) big = { cx, cz, r: c.r };
      }
      if (!big) return { pass: null, detail: { trees: trees.length, note: 'SKIP: no trunk collider within 200 m' } };
      const a = 0.9, gap = 1.0;
      const ox = big.cx + Math.cos(a) * (big.r + gap), oz = big.cz + Math.sin(a) * (big.r + gap);
      const oyaw = Math.atan2(big.cx - ox, big.cz - oz);
      const occluded = await run({ tag: 'trunk-occluder', x: ox, z: oz,
        heading: oyaw + Math.PI, yaw: oyaw, pitch: 0.05, pin: true });

      /* --- 6/7. The hillside YAW PANS and the 24-yaw STATIC SWEEP were rows
       * of this gate until residue fix round 3 (judge: "A31b failed the
       * full-suite run on its 600 s timeout and has only a 7% margin in
       * isolation").  They are their own gates now, with their own timeouts
       * and the same bars: A31d-hillside-pan-0.8, A31e-hillside-pan-clamp,
       * A31f-hillside-yaw-sweep. */

      const clearRows = [...controls, hillside, hillside80, hillsideClamp, valley,
        sprint, uphill, sprintClamp, uphillClamp, uphill80];
      /* The A29-face contract: aim delivered, hill not booked, no blending,
       * and a dissolve only ever explained by the lens being inside her. */
      const faceOK = !face || (face.occ > 0) || (
        face.solidCut <= 0.01 && face.blended === 0 && face.depthOff === 0
        && face.aimLossDeg <= face.budgetDeg + 2 && face.elevMinDeg > 0
        && (face.opacity >= 0.98 ? face.onScreen : face.minLensGap < 1.05));
      /* A row with a hider near the lens for the WHOLE window cannot be judged;
       * if the world has moved under a staging, say so rather than passing. */
      const judged = clearRows.filter((r) => r && r.occ === 0 && r.minLensGap < 9);
      const ghosted = judged.filter((r) => r.opacity < 0.98 || r.fade < 0.98);
      const misbooked = judged.filter((r) => r.solidCut > 0.01);
      /* THE lens-in-head bar (judge round: 0.45 m, opacity 1.000, she rendered
       * absent).  1.20 m is above the 1.05 m the fade itself trips at, so a
       * clear staging never even reaches the dissolve. */
      const jammed = judged.filter((r) => r.minLensGap < 1.20);
      /* THE aim bar.  The ground may take at most the published budget (plus
       * 2 deg for the framing tilt, the bob and the damp), and a real look-up
       * may never come back as a look-DOWN. */
      const hijacked = judged.filter((r) => r.aimLossDeg > r.budgetDeg + 2
        || (r.elevReqDeg >= 15 && r.elevMinDeg <= 0));
      /* …and she has to be IN THE PICTURE.  Without this the lift can buy a
       * perfect opacity/lens-gap row by pushing her under the bottom edge, and
       * the first cut of this gate filmed exactly that. */
      const offScreen = judged.filter((r) => !r.onScreen);
      // ...and she must still be a solid, depth-writing, non-blended draw
      const blended = clearRows.filter((r) => r && (r.blended > 0 || r.depthOff > 0));
      const fades = !!occluded && occluded.opacity < 0.8 && occluded.solidCut > 0.5 && occluded.occ > 0;

      /* THE FILM (residue fix round 3, judge: "A31b film fails its own written
       * criteria: a frame of dirt, she is mostly off the bottom edge").  It
       * was the -0.5 hillside row, and from that spot the aim budget leaves
       * 7.2 deg of the 28.6 asked and the bowl's far wall fills everything
       * above her: no lens there can show sky, so that row is judged on its
       * numbers above and no longer filmed.  The film is the SAME 38.4 deg
       * face at camPitch -0.8 (45.8 deg asked) — a hillside look-up the
       * camera answers with the ground swing — and the captured frame is held
       * to the written criteria literally:
       *   SOLID       applied opacity > 0.98, lens >= 1.20 m from the pivot;
       *   LOOKING UP  delivered elevation > 15 deg;
       *   IN FRAME    her head bone in the frame (|x|, |y| <= 0.9) and both
       *               clavicles in it — head and shoulders — and her top
       *               above the frame's centre line (ndcTop > 0);
       *   SKY         a 9 x 7 grid of view rays marched through the
       *               heightfield: >= 60 % of the TOP row and >= 25 % of all
       *               rays reach open sky, >= 10 % end on terrain more than
       *               40 m out (the skyline: horizon in shot), and <= 25 %
       *               end on ground within 40 m (not a frame of dirt).
       * The pin retires itself after 12 s so it cannot leak into whatever
       * gate runs next in this page. */
      const FILM_PITCH = -0.8;
      p.position.set(hill.x, 0, hill.z); p.velocity.set(0, 0, 0); p._snapToGround();
      p.heading = hill.down; p.camYaw = hill.down + Math.PI; p.camPitch = FILM_PITCH;
      p._relief = 0; p._lift = 0; p._pivotSeeded = false;
      C.input.keys.clear(); C.input.mouse.buttons = 0;
      const until = performance.now() + 12000;
      const pin = () => {
        if (performance.now() > until) return;
        p.position.x = hill.x; p.position.z = hill.z;
        p.velocity.x = 0; p.velocity.z = 0;
        p.camPitch = FILM_PITCH; p.camYaw = hill.down + Math.PI; p.heading = hill.down;
        requestAnimationFrame(pin);
      };
      pin();
      for (let i = 0; i < 40; i++) await frame();
      let filmU = 1;
      for (const m of p._mats) if (m.u.value < filmU) filmU = m.u.value;
      const fsil = silhouette();
      const ndcOf = (name) => {
        let b = null;
        p.model.traverse((o) => { if (!b && o.isBone && (o.name === name || o.name.replace(/_[0-9]+$/, '') === name)) b = o; });
        if (!b) return null;
        const w = new V(); b.getWorldPosition(w);
        const cv = w.clone().applyMatrix4(C.camera.matrixWorldInverse);
        const q = w.clone().project(C.camera);
        return { x: +q.x.toFixed(2), y: +q.y.toFixed(2), front: cv.z < -C.camera.near };
      };
      const inF = (q) => !!q && q.front && Math.abs(q.x) <= 0.9 && Math.abs(q.y) <= 0.9;
      const headN = ndcOf(HBN('head')), clavL = ndcOf(HBN('clavL')), clavR = ndcOf(HBN('clavR'));   // R5: animator-published names
      /* sky: march each view ray through the heightfield until it is above
       * the highest terrain anywhere (sky) or under the ground (land) */
      let topH = -1e9;
      for (let x = -340; x <= 340; x += 8) for (let z = -340; z <= 340; z += 8) { const h = T.getHeight(x, z); if (h > topH) topH = h; }
      const sky = (() => {
        const o = C.camera.position, d = new V();
        let skyN = 0, tot = 0, topSky = 0, topN = 0, far = 0, near = 0;
        const rows = [];
        for (let yi = 0; yi < 7; yi++) {
          const ny = 0.95 - yi * 0.3; let row = '';
          for (let xi = 0; xi < 9; xi++) {
            d.set(-0.9 + xi * 0.225, ny, 0.5).unproject(C.camera).sub(o).normalize();
            let hit = -1;
            for (let t = 0.5; t < 1500; t *= 1.04) {
              const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
              if (y > topH + 1) break;
              if (y < T.getHeight(x, z)) { hit = t; break; }
            }
            tot++;
            if (hit < 0) skyN++; else if (hit > 40) far++; else near++;
            if (yi === 0) { topN++; if (hit < 0) topSky++; }
            row += hit < 0 ? 'S' : hit > 40 ? 'f' : 'd';
          }
          rows.push(row);
        }
        return { skyFrac: +(skyN / tot).toFixed(2), topRowSky: +(topSky / topN).toFixed(2),
          skylineFrac: +(far / tot).toFixed(2), nearGroundFrac: +(near / tot).toFixed(2), rows };
      })();
      const filmed = { pitch: FILM_PITCH, opacity: +filmU.toFixed(3), boom: +p.boomLength.toFixed(2),
        lensGap: +C.camera.position.distanceTo(p.camPivot).toFixed(2),
        elevDeg: +(p.camElev * DEG).toFixed(1), elevReqDeg: +(-FILM_PITCH * DEG).toFixed(1),
        swingDeg: +((p.camSwing ?? 0) * DEG).toFixed(1),
        ndcTop: +fsil.maxY.toFixed(2), ndcBottom: +fsil.minY.toFixed(2),
        silVisible: +fsil.visible.toFixed(3), onFrac: +fsil.onFrac.toFixed(3),
        head: headN, clavicleL: clavL, clavicleR: clavR, sky };
      // the frame that is actually captured is held to the written criteria
      const filmSolid = filmed.opacity > 0.98 && filmed.lensGap >= 1.20
        && filmed.elevDeg > 15 && inF(headN) && inF(clavL) && inF(clavR) && fsil.maxY > 0
        && sky.topRowSky >= 0.6 && sky.skyFrac >= 0.25 && sky.skylineFrac >= 0.1 && sky.nearGroundFrac <= 0.25;

      const pass = filmSolid && judged.length === clearRows.length
        && ghosted.length === 0 && misbooked.length === 0
        && jammed.length === 0 && hijacked.length === 0 && offScreen.length === 0
        && blended.length === 0 && fades && faceOK;
      const ctrlTable = {};
      for (const k of Object.keys(CTRL.pin)) ctrlTable['pinned@' + k] = { ctrl: +CTRL.pin[k].ctrl.toFixed(3), bar: +CTRL.pin[k].bar.toFixed(3) };
      for (const k of Object.keys(CTRL.run)) ctrlTable['sprint@' + k] = { ctrl: +CTRL.run[k].ctrl.toFixed(3), bar: +CTRL.run[k].bar.toFixed(3) };
      return { pass, detail: {
        hillAt: hill, faceDeg: +faceDeg.toFixed(1), valleyAt: [low.x, low.z, +low.h.toFixed(1)], slopeAt: dh,
        filmed, filmSolid, flatAt: flat, controls: ctrlTable,
        frameKeep: FRAME_KEEP, onFracFloor: ONFRAC_FLOOR,
        hillside, hillside80, hillsideClamp, valley, sprint, uphill,
        sprintClamp, uphillClamp, uphill80, face, faceOK, occluded,
        judgedClearStagings: judged.length, ghostedWithoutOccluder: ghosted.length,
        hillBookedAsOccluder: misbooked.length, lensInsideHer: jammed.length,
        aimHijacked: hijacked.length, offScreen: offScreen.length,
        blendedOrDepthOff: blended.length,
        occluderDoesFade: fades,
        worstFrameRatio: judged.length
          ? +Math.min(...judged.filter((r) => r.frameRatio != null).map((r) => r.frameRatio)).toFixed(2) : null,
        minOpacityNoOccluder: judged.length ? +Math.min(...judged.map((r) => r.opacity)).toFixed(3) : null,
        minLensGapM: judged.length ? +Math.min(...judged.map((r) => r.minLensGap)).toFixed(2) : null,
        maxAimLossDeg: judged.length ? +Math.max(...judged.map((r) => r.aimLossDeg)).toFixed(1) : null,
        occluderOpacity: occluded ? occluded.opacity : null,
      } };
    })()`),
  },

  /* ---------------------------------------------------------------- A31d-hillside-pan-0.8 */
  /**
   * RESIDUE FIX ROUND 3 — A31b's YAW PAN rows at camPitch -0.8, as their own
   * gate (judge: "A31b failed the full-suite run on its 600 s timeout").  The
   * rows, the bars and the estimator are A31b's, unchanged (residue fix rounds
   * 1 and 2, see the comment block inside): a full 360 deg pan of the 38.4 deg
   * hillside at 0.005 and 0.02 rad/frame, aiming and not, judged on every
   * sampled frame.  Only the pitch axis is split across two gate ids.
   */
  {
    id: 'A31d-hillside-pan-0.8', kind: 'action', lane: 'player-control',
    title: 'A full 360 deg yaw pan of the 38.4 deg hillside at camPitch -0.8 (45.8 deg asked), slow (0.005 rad/frame) and moderate (0.02), aiming and not, on EVERY sampled frame: view <= 3 deg past the input, opacity >= 0.98, head in frame, onFrac >= FRAME_KEEP x the pinned flat control at that pitch (aimed rows: the aimed control), nearest visible vertex >= 0.15 m, lens >= 0.85 m from the pivot',
    criteria: 'Film: the 38.4 deg hillside at camPitch -0.8, the camera swung 90 deg across the slope (mid-pan). the hero is SOLID '
      + 'and IN FRAME, the lens is not inside her or her gear. FAIL if she is dithered, off the frame, or the frame is her gear at the near plane.',
    setup: `__CTX__.input.enabled = true; document.getElementById('hud').style.display = 'none';`,
    settle: 700, timeout: 1200000,
    assert: `(async () => {
      ${FREEZE}
      ${VISIBLE}
      ${SILHOUETTE_VIS}
      ${FRAME_SAMPLE}
      ${HILLSIDE}
      if (!flat) return { pass: null, detail: 'SKIP: no flat clear control ground found' };
      if (!hill) return { pass: null, detail: 'SKIP: no clear 26-40 deg standable face found' };
      const PITCHES = [-0.8];
      for (const pitch of PITCHES) await pinnedControl(pitch);
      /* --- 6. YAW PANS on the hillside (residue fix round 1, judge: "ground
       * yaw swing breaks yaw pans at a deep look-up: 15-22 deg one-frame view
       * lurches and ghosting with no occluder").  Every staging above pins
       * camYaw, so the swing was only ever seen settled; a player tracking a
       * flier pans.  Each row pans a full 360 deg at a slow (0.005 rad/frame)
       * and a moderate (0.02) rate, pinned on the hillside, at -0.8 and the
       * clamp, aiming and not, and on EVERY frame:
       *   STEP     the delivered view may move at most 3 deg more than the
       *            requested view did (the angle between consecutive REQUESTED
       *            directions, computed from camYaw/camPitch — not the raw
       *            yaw rate, which overstates it at a look-up);
       *   SOLID    applied opacity >= 0.98.
       *
       * RESIDUE FIX ROUND 2 (judge: "a whole yaw sector and every pan crossing
       * have no the hero in frame, and clamp pans put the lens inside her gear;
       * A31b's pan rows do not measure either").  They did not: a row was ok
       * on view step, opacity and a lens-to-PIVOT gap, and the judge filmed 234
       * consecutive frames of a clamp pan with under 5 % of her in frame and
       * her stowed gear 0.033 m from the lens while that gap read 1.315 m.
       * Every pan row now also holds, on every sampled frame (every frame at
       * 0.02, every 2nd at 0.005):
       *   IN FRAME   her head bone inside the frame, in front of the lens;
       *   FRAMING    onFrac >= FRAME_KEEP x the flat control at the SAME pitch
       *              (floor 0.12), per frame, not as a median;
       *   NOT IN HER no vertex of her visible mesh within 0.15 m of the lens
       *              (the near plane is 0.10).
       * Aimed rows are held to the flat AIMED control at their pitch (the aim
       * rig's framing contract is the reticle, A32: at the clamp the flat aim
       * control itself has her head off the frame, onFrac 0.006, so its head
       * bar applies only where that control has her head in frame on >= 90 %
       * of samples, and then on >= 90 % of the row's).
       *
       * GAP.  The lens-to-pivot bar these rows carried (1.2 m, or 0.95 of the
       * flat aim gap) is now 0.85 m — the camera's own dolly floor
       * (DOLLY_GAP 0.90 less 0.05 of placement slop, above the fade's absolute LENS_JAM 0.80) — and
       * the direct measurement above is what stands for "never inside her".
       * A 360 deg pan must carry the lens across the UP-slope bearing once,
       * and on this 38.4 deg face no lens 1.2 m from the pivot there both
       * clears the ground and keeps her in the frame (brute force over swing
       * x rotation x length, docs/ROUND4-PLAYER-CONTROL.md §13): the old bar
       * could only be met by filming the mountain, which is the finding.  The
       * pivot sits 0.45 m ABOVE her crown at a deep look-up, so "1.2 m from
       * the pivot" never measured the lens against her anyway — the judge's
       * 0.033 m frame read 1.315 m on it. */
      const flatAimGap = {}, AIMCTL = {};
      for (const pitch of PITCHES) {
        p.position.set(flat.x, 0, flat.z); p.velocity.set(0, 0, 0); p._snapToGround();
        p.heading = 0; p.camYaw = Math.PI; p.camPitch = pitch;
        p._relief = 0; p._lift = 0; p._pivotSeeded = false;
        C.input.keys.clear(); C.input.mouse.buttons = 4;
        const af = []; let ah = 0, an = 0;
        for (let i = 0; i < 56; i++) {
          await frame();
          p.position.x = flat.x; p.position.z = flat.z; p.velocity.x = 0; p.velocity.z = 0;
          p.camYaw = Math.PI; p.camPitch = pitch; C.input.mouse.buttons |= 4;
          if (i < 16 || i % 2) continue;
          const m = frameSample(); af.push(m.frac); an++; if (m.headIn) ah++;
        }
        flatAimGap[pitch] = C.camera.position.distanceTo(p.camPivot);
        af.sort((a, b) => a - b);
        AIMCTL[pitch] = { ctrl: af[af.length >> 1], headIn: ah / an };
        C.input.mouse.buttons = 0;
      }
      const GAP_FLOOR = 0.85, NEAR_BAR = 0.15;
      const reqDir = (yaw, pitch, out) => out.set(-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const pan = async (pitch, rate, aim) => {
        const tag = 'pan' + (aim ? '-aim' : '') + '@' + pitch + '/' + rate;
        p.position.set(hill.x, 0, hill.z); p.velocity.set(0, 0, 0); p._snapToGround();
        p.heading = hill.down; p.camYaw = hill.down + Math.PI; p.camPitch = pitch;
        p._relief = 0; p._lift = 0; p._pivotSeeded = false;
        C.input.keys.clear(); C.input.mouse.buttons = aim ? 4 : 0;
        const hold = () => {
          p.position.x = hill.x; p.position.z = hill.z; p.velocity.x = 0; p.velocity.z = 0;
          p.camPitch = pitch; if (aim) C.input.mouse.buttons |= 4;
        };
        for (let i = 0; i < 30; i++) { await frame(); hold(); }
        const N = Math.ceil(2 * Math.PI / rate), every = rate < 0.01 ? 2 : 1;
        const dPrev = new V(), dNow = new V(), rPrev = new V(), rNow = new V();
        C.camera.getWorldDirection(dPrev);
        reqDir(p.camYaw + (p.recoil ? p.recoil.yaw : 0), p.camPitch, rPrev);
        let maxEx = 0, exAt = -1, minU = 1, minGap = 9, occFrames = 0, over = 0;
        let samples = 0, headIn = 0, headRun = 0, headRunMax = 0, minFrac = 9, fracLow = 0, minNear = 9, nearAt = -1, nearDeg = 0;
        const ctl = aim ? AIMCTL[pitch] : { ctrl: CTRL.pin[pitch].ctrl, headIn: 1 };
        /* an aimed control that does not have her in frame (the clamp: head
         * off the frame, onFrac 0.08) has no framing to keep — judged on the
         * other bars and reported */
        const framed = !aim || ctl.headIn >= 0.9;
        const fracBar = !framed ? 0 : aim ? FRAME_KEEP * ctl.ctrl : Math.max(ONFRAC_FLOOR, FRAME_KEEP * ctl.ctrl);
        for (let i = 0; i < N; i++) {
          p.camYaw += rate;
          await frame();
          hold();
          C.camera.getWorldDirection(dNow);
          reqDir(p.camYaw, p.camPitch, rNow);
          const step = Math.acos(Math.max(-1, Math.min(1, dNow.dot(dPrev)))) * DEG;
          const req = Math.acos(Math.max(-1, Math.min(1, rNow.dot(rPrev)))) * DEG;
          dPrev.copy(dNow); rPrev.copy(rNow);
          const e = C.camera.position;
          if (K.sphereQuery(e.x, e.y, e.z, 1.1, [], hider).length) { occFrames++; continue; }
          const ex = step - req;
          if (ex > maxEx) { maxEx = ex; exAt = i; }
          if (ex > 3) over++;
          for (const m of p._mats) if (m.u.value < minU) minU = m.u.value;
          const g = e.distanceTo(p.camPivot);
          if (g < minGap) minGap = g;
          if (i % every) continue;
          const m = frameSample();
          samples++;
          if (m.headIn) { headIn++; headRun = 0; } else { headRun++; if (headRun > headRunMax) headRunMax = headRun; }
          if (m.frac < minFrac) minFrac = m.frac;
          if (m.frac < fracBar) fracLow++;
          if (m.nearest < minNear) { minNear = m.nearest; nearAt = i; nearDeg = ((p.camYaw - hill.down - Math.PI) * DEG) % 360; }
        }
        C.input.mouse.buttons = 0;
        const headNeed = !aim ? 1 : ctl.headIn >= 0.9 ? 0.9 : 0;
        const headFrac = samples ? headIn / samples : 0;
        const ok = maxEx <= 3 && minU >= 0.98 && minGap >= GAP_FLOOR && occFrames < N * 0.1
          && headFrac >= headNeed && fracLow === 0 && minNear >= NEAR_BAR;
        return { tag, frames: N, occFrames, maxViewExcessDeg: +maxEx.toFixed(2), at: exAt, framesOver3Deg: over,
          minOpacity: +minU.toFixed(3), minLensGap: +minGap.toFixed(2), gapBar: GAP_FLOOR,
          samples, headInFrame: +headFrac.toFixed(3), headBar: headNeed, headOutRunMax: headRunMax,
          minOnFrac: +minFrac.toFixed(3), onFracBar: +fracBar.toFixed(3), framesUnderFracBar: fracLow,
          nearestVertexM: +minNear.toFixed(3), nearAt, nearAtPanDeg: +nearDeg.toFixed(1), ok };
      };
      const pans = [];
      for (const pitch of PITCHES) {
        for (const aim of [false, true]) {
          for (const rate of [0.005, 0.02]) pans.push(await pan(pitch, rate, aim));
        }
      }
      const panFails = pans.filter((r) => !r.ok);
      const film = await filmAt(-0.8, 90);
      const pass = panFails.length === 0 && pans.length === 4 && film.ok;
      return { pass, detail: {
        hillAt: hill, flatAt: flat, pitch: -0.8,
        control: { ctrl: +CTRL.pin[-0.8].ctrl.toFixed(3), bar: +CTRL.pin[-0.8].bar.toFixed(3) },
        aimControl: { ctrl: +AIMCTL[-0.8].ctrl.toFixed(3), headIn: +AIMCTL[-0.8].headIn.toFixed(2) },
        flatAimGap: +flatAimGap[-0.8].toFixed(2),
        pans, panFails: panFails.length, film,
      } };
    })()`,
  },
  /* ---------------------------------------------------------------- A31e-hillside-pan-clamp */
  /**
   * RESIDUE FIX ROUND 3 — A31b's YAW PAN rows at camPitch -1.15, as their own
   * gate (judge: "A31b failed the full-suite run on its 600 s timeout").  The
   * rows, the bars and the estimator are A31b's, unchanged (residue fix rounds
   * 1 and 2, see the comment block inside): a full 360 deg pan of the 38.4 deg
   * hillside at 0.005 and 0.02 rad/frame, aiming and not, judged on every
   * sampled frame.  Only the pitch axis is split across two gate ids.
   */
  {
    id: 'A31e-hillside-pan-clamp', kind: 'action', lane: 'player-control',
    title: 'A full 360 deg yaw pan of the 38.4 deg hillside at camPitch -1.15 (the 65.9 deg clamp), slow (0.005 rad/frame) and moderate (0.02), aiming and not, on EVERY sampled frame: view <= 3 deg past the input, opacity >= 0.98, head in frame, onFrac >= FRAME_KEEP x the pinned flat control at that pitch (aimed rows: the aimed control), nearest visible vertex >= 0.15 m, lens >= 0.85 m from the pivot',
    criteria: 'Film: the 38.4 deg hillside at camPitch -1.15, the camera swung 90 deg across the slope (mid-pan). the hero is SOLID '
      + 'and IN FRAME, the lens is not inside her or her gear. FAIL if she is dithered, off the frame, or the frame is her gear at the near plane.',
    setup: `__CTX__.input.enabled = true; document.getElementById('hud').style.display = 'none';`,
    settle: 700, timeout: 1200000,
    assert: `(async () => {
      ${FREEZE}
      ${VISIBLE}
      ${SILHOUETTE_VIS}
      ${FRAME_SAMPLE}
      ${HILLSIDE}
      if (!flat) return { pass: null, detail: 'SKIP: no flat clear control ground found' };
      if (!hill) return { pass: null, detail: 'SKIP: no clear 26-40 deg standable face found' };
      const PITCHES = [-1.15];
      for (const pitch of PITCHES) await pinnedControl(pitch);
      /* --- 6. YAW PANS on the hillside (residue fix round 1, judge: "ground
       * yaw swing breaks yaw pans at a deep look-up: 15-22 deg one-frame view
       * lurches and ghosting with no occluder").  Every staging above pins
       * camYaw, so the swing was only ever seen settled; a player tracking a
       * flier pans.  Each row pans a full 360 deg at a slow (0.005 rad/frame)
       * and a moderate (0.02) rate, pinned on the hillside, at -0.8 and the
       * clamp, aiming and not, and on EVERY frame:
       *   STEP     the delivered view may move at most 3 deg more than the
       *            requested view did (the angle between consecutive REQUESTED
       *            directions, computed from camYaw/camPitch — not the raw
       *            yaw rate, which overstates it at a look-up);
       *   SOLID    applied opacity >= 0.98.
       *
       * RESIDUE FIX ROUND 2 (judge: "a whole yaw sector and every pan crossing
       * have no the hero in frame, and clamp pans put the lens inside her gear;
       * A31b's pan rows do not measure either").  They did not: a row was ok
       * on view step, opacity and a lens-to-PIVOT gap, and the judge filmed 234
       * consecutive frames of a clamp pan with under 5 % of her in frame and
       * her stowed gear 0.033 m from the lens while that gap read 1.315 m.
       * Every pan row now also holds, on every sampled frame (every frame at
       * 0.02, every 2nd at 0.005):
       *   IN FRAME   her head bone inside the frame, in front of the lens;
       *   FRAMING    onFrac >= FRAME_KEEP x the flat control at the SAME pitch
       *              (floor 0.12), per frame, not as a median;
       *   NOT IN HER no vertex of her visible mesh within 0.15 m of the lens
       *              (the near plane is 0.10).
       * Aimed rows are held to the flat AIMED control at their pitch (the aim
       * rig's framing contract is the reticle, A32: at the clamp the flat aim
       * control itself has her head off the frame, onFrac 0.006, so its head
       * bar applies only where that control has her head in frame on >= 90 %
       * of samples, and then on >= 90 % of the row's).
       *
       * GAP.  The lens-to-pivot bar these rows carried (1.2 m, or 0.95 of the
       * flat aim gap) is now 0.85 m — the camera's own dolly floor
       * (DOLLY_GAP 0.90 less 0.05 of placement slop, above the fade's absolute LENS_JAM 0.80) — and
       * the direct measurement above is what stands for "never inside her".
       * A 360 deg pan must carry the lens across the UP-slope bearing once,
       * and on this 38.4 deg face no lens 1.2 m from the pivot there both
       * clears the ground and keeps her in the frame (brute force over swing
       * x rotation x length, docs/ROUND4-PLAYER-CONTROL.md §13): the old bar
       * could only be met by filming the mountain, which is the finding.  The
       * pivot sits 0.45 m ABOVE her crown at a deep look-up, so "1.2 m from
       * the pivot" never measured the lens against her anyway — the judge's
       * 0.033 m frame read 1.315 m on it. */
      const flatAimGap = {}, AIMCTL = {};
      for (const pitch of PITCHES) {
        p.position.set(flat.x, 0, flat.z); p.velocity.set(0, 0, 0); p._snapToGround();
        p.heading = 0; p.camYaw = Math.PI; p.camPitch = pitch;
        p._relief = 0; p._lift = 0; p._pivotSeeded = false;
        C.input.keys.clear(); C.input.mouse.buttons = 4;
        const af = []; let ah = 0, an = 0;
        for (let i = 0; i < 56; i++) {
          await frame();
          p.position.x = flat.x; p.position.z = flat.z; p.velocity.x = 0; p.velocity.z = 0;
          p.camYaw = Math.PI; p.camPitch = pitch; C.input.mouse.buttons |= 4;
          if (i < 16 || i % 2) continue;
          const m = frameSample(); af.push(m.frac); an++; if (m.headIn) ah++;
        }
        flatAimGap[pitch] = C.camera.position.distanceTo(p.camPivot);
        af.sort((a, b) => a - b);
        AIMCTL[pitch] = { ctrl: af[af.length >> 1], headIn: ah / an };
        C.input.mouse.buttons = 0;
      }
      const GAP_FLOOR = 0.85, NEAR_BAR = 0.15;
      const reqDir = (yaw, pitch, out) => out.set(-Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const pan = async (pitch, rate, aim) => {
        const tag = 'pan' + (aim ? '-aim' : '') + '@' + pitch + '/' + rate;
        p.position.set(hill.x, 0, hill.z); p.velocity.set(0, 0, 0); p._snapToGround();
        p.heading = hill.down; p.camYaw = hill.down + Math.PI; p.camPitch = pitch;
        p._relief = 0; p._lift = 0; p._pivotSeeded = false;
        C.input.keys.clear(); C.input.mouse.buttons = aim ? 4 : 0;
        const hold = () => {
          p.position.x = hill.x; p.position.z = hill.z; p.velocity.x = 0; p.velocity.z = 0;
          p.camPitch = pitch; if (aim) C.input.mouse.buttons |= 4;
        };
        for (let i = 0; i < 30; i++) { await frame(); hold(); }
        const N = Math.ceil(2 * Math.PI / rate), every = rate < 0.01 ? 2 : 1;
        const dPrev = new V(), dNow = new V(), rPrev = new V(), rNow = new V();
        C.camera.getWorldDirection(dPrev);
        reqDir(p.camYaw + (p.recoil ? p.recoil.yaw : 0), p.camPitch, rPrev);
        let maxEx = 0, exAt = -1, minU = 1, minGap = 9, occFrames = 0, over = 0;
        let samples = 0, headIn = 0, headRun = 0, headRunMax = 0, minFrac = 9, fracLow = 0, minNear = 9, nearAt = -1, nearDeg = 0;
        const ctl = aim ? AIMCTL[pitch] : { ctrl: CTRL.pin[pitch].ctrl, headIn: 1 };
        /* an aimed control that does not have her in frame (the clamp: head
         * off the frame, onFrac 0.08) has no framing to keep — judged on the
         * other bars and reported */
        const framed = !aim || ctl.headIn >= 0.9;
        const fracBar = !framed ? 0 : aim ? FRAME_KEEP * ctl.ctrl : Math.max(ONFRAC_FLOOR, FRAME_KEEP * ctl.ctrl);
        for (let i = 0; i < N; i++) {
          p.camYaw += rate;
          await frame();
          hold();
          C.camera.getWorldDirection(dNow);
          reqDir(p.camYaw, p.camPitch, rNow);
          const step = Math.acos(Math.max(-1, Math.min(1, dNow.dot(dPrev)))) * DEG;
          const req = Math.acos(Math.max(-1, Math.min(1, rNow.dot(rPrev)))) * DEG;
          dPrev.copy(dNow); rPrev.copy(rNow);
          const e = C.camera.position;
          if (K.sphereQuery(e.x, e.y, e.z, 1.1, [], hider).length) { occFrames++; continue; }
          const ex = step - req;
          if (ex > maxEx) { maxEx = ex; exAt = i; }
          if (ex > 3) over++;
          for (const m of p._mats) if (m.u.value < minU) minU = m.u.value;
          const g = e.distanceTo(p.camPivot);
          if (g < minGap) minGap = g;
          if (i % every) continue;
          const m = frameSample();
          samples++;
          if (m.headIn) { headIn++; headRun = 0; } else { headRun++; if (headRun > headRunMax) headRunMax = headRun; }
          if (m.frac < minFrac) minFrac = m.frac;
          if (m.frac < fracBar) fracLow++;
          if (m.nearest < minNear) { minNear = m.nearest; nearAt = i; nearDeg = ((p.camYaw - hill.down - Math.PI) * DEG) % 360; }
        }
        C.input.mouse.buttons = 0;
        const headNeed = !aim ? 1 : ctl.headIn >= 0.9 ? 0.9 : 0;
        const headFrac = samples ? headIn / samples : 0;
        const ok = maxEx <= 3 && minU >= 0.98 && minGap >= GAP_FLOOR && occFrames < N * 0.1
          && headFrac >= headNeed && fracLow === 0 && minNear >= NEAR_BAR;
        return { tag, frames: N, occFrames, maxViewExcessDeg: +maxEx.toFixed(2), at: exAt, framesOver3Deg: over,
          minOpacity: +minU.toFixed(3), minLensGap: +minGap.toFixed(2), gapBar: GAP_FLOOR,
          samples, headInFrame: +headFrac.toFixed(3), headBar: headNeed, headOutRunMax: headRunMax,
          minOnFrac: +minFrac.toFixed(3), onFracBar: +fracBar.toFixed(3), framesUnderFracBar: fracLow,
          nearestVertexM: +minNear.toFixed(3), nearAt, nearAtPanDeg: +nearDeg.toFixed(1), ok };
      };
      const pans = [];
      for (const pitch of PITCHES) {
        for (const aim of [false, true]) {
          for (const rate of [0.005, 0.02]) pans.push(await pan(pitch, rate, aim));
        }
      }
      const panFails = pans.filter((r) => !r.ok);
      const film = await filmAt(-1.15, 90);
      const pass = panFails.length === 0 && pans.length === 4 && film.ok;
      return { pass, detail: {
        hillAt: hill, flatAt: flat, pitch: -1.15,
        control: { ctrl: +CTRL.pin[-1.15].ctrl.toFixed(3), bar: +CTRL.pin[-1.15].bar.toFixed(3) },
        aimControl: { ctrl: +AIMCTL[-1.15].ctrl.toFixed(3), headIn: +AIMCTL[-1.15].headIn.toFixed(2) },
        flatAimGap: +flatAimGap[-1.15].toFixed(2),
        pans, panFails: panFails.length, film,
      } };
    })()`,
  },
  /* ---------------------------------------------------------------- A31f */
  /**
   * RESIDUE FIX ROUND 3 — A31b's 24-yaw STATIC SWEEP of the 38.4 deg hillside,
   * as its own gate (judge: "A31b failed the full-suite run on its 600 s
   * timeout").  Rows, bars and estimator unchanged (residue fix round 2, see
   * the comment block inside).
   */
  {
    id: 'A31f-hillside-yaw-sweep', kind: 'action', lane: 'player-control',
    title: '24 camera yaws (15 deg steps) round the 38.4 deg hillside, pinned, at camPitch -0.8 and the -1.15 clamp, each on 20 samples after a 16-frame settle: head in frame on every sample, onFrac >= FRAME_KEEP x the pinned flat control at that pitch on every sample, nearest visible vertex >= 0.15 m, opacity >= 0.98, lens >= 0.85 m from the pivot; at most 4 rows unjudgeable',
    criteria: 'Film: the 38.4 deg hillside at the pitch clamp, camera 45 deg off straight up-slope. the hero is SOLID and IN FRAME, the lens '
      + 'is not inside her or her gear. FAIL if she is dithered, off the frame, or the frame is her gear at the near plane.',
    setup: `__CTX__.input.enabled = true; document.getElementById('hud').style.display = 'none';`,
    settle: 700, timeout: 1200000,
    assert: `(async () => {
      ${FREEZE}
      ${VISIBLE}
      ${SILHOUETTE_VIS}
      ${FRAME_SAMPLE}
      ${HILLSIDE}
      if (!flat) return { pass: null, detail: 'SKIP: no flat clear control ground found' };
      if (!hill) return { pass: null, detail: 'SKIP: no clear 26-40 deg standable face found' };
      const PITCHES = [-0.8, -1.15];
      for (const pitch of PITCHES) await pinnedControl(pitch);
      const GAP_FLOOR = 0.85, NEAR_BAR = 0.15;
      /* --- 7. STATIC YAW SWEEP (residue fix round 2, judge: "static at the
       * clamp, camYaw 15/30/45 deg to one side of straight up-slope: onFrac
       * 0, head in frame 0 … the one yaw A31b stages (offset 0) is fine").
       * 24 camera yaws in 15 deg steps round the same 38.4 deg face, pinned,
       * at -0.8 and the clamp, each judged on 20 samples after a 16-frame
       * settle against the pinned flat control at its pitch: head in frame on
       * every sample, onFrac >= FRAME_KEEP x control (floor 0.12) on every
       * sample, nearest visible vertex >= 0.15 m, opacity >= 0.98, lens >=
       * GAP_FLOOR from the pivot (see GAP above). */
      const sweep = [];
      for (const pitch of PITCHES) {
        const fracBar = Math.max(ONFRAC_FLOOR, FRAME_KEEP * CTRL.pin[pitch].ctrl);
        for (let off = 0; off < 360; off += 15) {
          const yaw = hill.down + Math.PI + off / DEG;
          p.position.set(hill.x, 0, hill.z); p.velocity.set(0, 0, 0); p._snapToGround();
          p.heading = hill.down; p.camYaw = yaw; p.camPitch = pitch;
          p._relief = 0; p._lift = 0; p._pivotSeeded = false;
          C.input.keys.clear(); C.input.mouse.buttons = 0;
          let n = 0, hin = 0, minF = 9, near = 9, u = 1, gap = 9, occ = 0;
          const fr = [];
          for (let i = 0; i < 56; i++) {
            await frame();
            p.position.x = hill.x; p.position.z = hill.z; p.velocity.x = 0; p.velocity.z = 0;
            p.camYaw = yaw; p.camPitch = pitch;
            if (i < 16) continue;
            for (const m of p._mats) if (m.u.value < u) u = m.u.value;
            const e = C.camera.position;
            if (K.sphereQuery(e.x, e.y, e.z, 1.1, [], hider).length) occ++;
            gap = Math.min(gap, e.distanceTo(p.camPivot));
            if (i % 2) continue;
            const m = frameSample(); n++; fr.push(m.frac);
            if (m.headIn) hin++;
            if (m.frac < minF) minF = m.frac;
            if (m.nearest < near) near = m.nearest;
          }
          fr.sort((a, b) => a - b);
          const row = { off, pitch, onFrac: +fr[fr.length >> 1].toFixed(3), minOnFrac: +minF.toFixed(3), bar: +fracBar.toFixed(3),
            headInFrame: +(hin / n).toFixed(3), nearestVertexM: +near.toFixed(3), minOpacity: +u.toFixed(3), minLensGap: +gap.toFixed(2),
            swingDeg: +((p.camSwing ?? 0) * DEG).toFixed(1), reliefDeg: +(p.camRelief * DEG).toFixed(1), dolly: +(p.camDolly ?? 1).toFixed(3),
            elevDeg: +(p.camElev * DEG).toFixed(1), occ };
          row.ok = occ > 0 || (hin === n && minF >= fracBar && near >= NEAR_BAR && u >= 0.98 && gap >= GAP_FLOOR);
          sweep.push(row);
        }
      }
      const sweepFails = sweep.filter((r) => !r.ok);
      const sweepJudged = sweep.filter((r) => r.occ === 0).length;
      const film = await filmAt(-1.15, 45);
      const pass = sweepFails.length === 0 && sweepJudged >= sweep.length - 4 && film.ok;
      return { pass, detail: {
        hillAt: hill, flatAt: flat,
        controls: { '-0.8': { ctrl: +CTRL.pin[-0.8].ctrl.toFixed(3), bar: +CTRL.pin[-0.8].bar.toFixed(3) },
          '-1.15': { ctrl: +CTRL.pin[-1.15].ctrl.toFixed(3), bar: +CTRL.pin[-1.15].bar.toFixed(3) } },
        sweepFails: sweepFails.length, sweepJudged, sweepFailRows: sweepFails,
        sweepWorst: sweep.length ? {
          minOnFracRatio: +Math.min(...sweep.map((r) => r.minOnFrac / r.bar)).toFixed(2),
          minHeadIn: Math.min(...sweep.map((r) => r.headInFrame)),
          minNearestVertexM: Math.min(...sweep.map((r) => r.nearestVertexM)),
          minLensGap: Math.min(...sweep.map((r) => r.minLensGap)),
          minOpacity: Math.min(...sweep.map((r) => r.minOpacity)) } : null,
        sweep: sweep.map((r) => [r.pitch, r.off, r.onFrac, r.minOnFrac, r.headInFrame, r.nearestVertexM, r.minLensGap, r.swingDeg, r.reliefDeg, r.dolly, r.elevDeg].join(' ')),
        film,
      } };
    })()`,
  },

  /* ---------------------------------------------------------------- A31c */
  /**
   * FIX ROUND 3 — the pitch-clamp framing, booked as its OWN finding.
   *
   * The judge round, verbatim: "if the control itself films as this one does,
   * book the clamp framing as an open finding (its own gate id) instead of
   * folding it into 'known gaps'."  It did: the flat-ground sprint at the
   * clamp — zero slope, camLift 0, camRelief 0 — filmed her bow in the lower
   * left and nothing else.  This gate judges the control itself, in absolute
   * terms, at the pitch where it failed.
   *
   * RESIDUE FIX ROUND 1 (judge: "lean follow and arm clearance only work for
   * the one run direction A31c stages, and A31c's head-in-frame check ignores
   * the horizontal edge").  It staged heading 0 only, and its head test was
   * |x| <= 1 on the head CENTRE, so a head cut in half at x -0.98 passed.  Now
   * FOUR run directions — away / left / right / toward the camera — at jog and
   * sprint, each staged with her already FACING that way (heading and facing
   * latch preset, so the row measures the run, not the turn into it), and on
   * EVERY row:
   *   HEAD IN FRAME   her head bone inside the frame, in front of the lens, on
   *                   >= 90 % of samples;
   *   COMPOSITION     |head NDC x| <= 0.8 on >= 90 % of samples (the new bar);
   *   KEEPS FRAMING   moving rows keep >= 0.75 of the PINNED median onFrac;
   *   PINNED FLOOR    pinned median onFrac >= 0.25;
   *   NOT INSIDE HER  no vertex of her VISIBLE mesh within 0.15 m of the lens
   *                   (the near plane is 0.10) on any sampled frame;
   *   SOLID           applied opacity >= 0.98 throughout.
   * Measured on her VISIBLE meshes only (see VISIBLE above): 53 of the rig's
   * 69 meshes are the hidden spare weapons in her left fist.
   *
   * RESIDUE FIX ROUND 2 (judge r1): the AWAY rows must also see her head past
   * her own shoulders (an occlusion-aware test, see `crownHidden`) on >= 90 %
   * of samples, and eight turns out of an ESTABLISHED run (60 frames first)
   * are judged every frame: lens >= 0.15 m from her visible mesh, opacity
   * >= 0.98.  The four diagonals are still reported under `diagnostics`.
   */
  {
    id: 'A31c-clamp-framing', kind: 'action', lane: 'player-control',
    title: 'Pitch-clamp framing on FLAT ground, in FOUR run directions (away / left / right / toward the lens) at jog and sprint: the head bone in frame and |NDC x| <= 0.8 on >= 90% of samples, running AWAY her head seen past her shoulders (occlusion-aware) on >= 90%, moving keeps >= 0.75 of the pinned onFrac, pinned >= 0.25, lens >= 0.15 m from her visible mesh, opacity >= 0.98, the view <= 6 deg off the input and the elevation <= 5.5 deg off the request on every judged frame; eight turns out of an ESTABLISHED run (60 frames) keep the lens >= 0.15 m from her mesh and her solid on every frame; RMB out of an established clamp sprint puts the view within 2 deg of the request from the 2nd frame of the draw, no frame stepping it > 3 deg',
    criteria: 'Film: flat open ground, SPRINTING at the pitch clamp (camPitch -1.15, looking steeply up). the hero\'s head, braid, '
      + 'shoulders and upper back are IN THE PICTURE in the lower part of the frame, solid, with sky above, and not pushed to a frame edge. '
      + 'FAIL if only the bow or spear is visible, if she is off the bottom or side edge, or if the lens is visibly inside her body.',
    setup: `__CTX__.input.enabled = true; document.getElementById('hud').style.display = 'none';`,
    settle: 700, timeout: 180000,
    assert: `(async () => {${HERO}
      ${FREEZE}
      ${VISIBLE}
      const C = __CTX__, p = C.player, T = C.terrain, K = C.collision;
      freeze();
      const V = p.position.constructor, n = new V();
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const DEG = 180 / Math.PI;
      const hider = (c) => c.camera || c.kind === 'canopy';
      const head = HB('head');   // R5: animator.b.head, never a rig literal
      if (!head) return { pass: null, detail: 'SKIP: animator.b.head not found on the rig' };
      /* RESIDUE FIX ROUND 2 (judge: "A31c's head test is a projection with no
       * occlusion check … make the head-visible test occlusion-aware: the
       * ORBIT_CAPS torso/shoulder segment test on the crown sight line").
       * The same capsules and radii the solver's list flags as occluders
       * (upper arms, clavicles, pelvis to neck), read LIVE off her bones,
       * against the sight line from the lens that filmed the frame to a point
       * 0.13 m over the head bone.  On the Round-4 rig it sits at her mouth (lip bones +0.00,
       * brows +0.075, top of the skull +0.176, measured on the idle rig), so
       * 0.13 is the middle of the upper half of her head: a clear line to it
       * is at least the top half of her head in the picture. */
      // R5: the occluder segments by ANIMATOR KEY (animator.b), not by rig bone name
      const OCC = [['upArmL', 'loArmL', 0.07], ['upArmR', 'loArmR', 0.07], ['clavL', 'upArmL', 0.09],
        ['clavR', 'upArmR', 0.09], ['pelvis', 'spine1', 0.17], ['spine1', 'spine3', 0.17],
        ['spine3', 'spine5', 0.17], ['spine5', 'neck1', 0.12]];
      const bones = {};
      for (const [a, b] of OCC) { bones[a] = HB(a); bones[b] = HB(b); }
      const occ = OCC.filter(([a, b]) => bones[a] && bones[b]);
      if (occ.length !== OCC.length) return { pass: null, detail: 'SKIP: occluder bones missing on the rig' };
      const segDist = (a, b, c, d) => {   // closest distance between segments ab and cd (Vector3s)
        const u = b.clone().sub(a), v = d.clone().sub(c), w = a.clone().sub(c);
        const A = u.dot(u), B = u.dot(v), Cc = v.dot(v), D = u.dot(w), E = v.dot(w), den = A * Cc - B * B;
        let sc = den > 1e-9 ? (B * E - Cc * D) / den : 0; sc = Math.max(0, Math.min(1, sc));
        let tc = Cc > 1e-9 ? (B * sc + E) / Cc : 0;
        if (tc < 0) { tc = 0; sc = A > 1e-9 ? Math.max(0, Math.min(1, -D / A)) : 0; }
        else if (tc > 1) { tc = 1; sc = A > 1e-9 ? Math.max(0, Math.min(1, (B - D) / A)) : 0; }
        return a.clone().addScaledVector(u, sc).sub(c.clone().addScaledVector(v, tc)).length();
      };
      const _ca = new V(), _cb = new V(), _cr = new V();
      const crownHidden = () => {
        head.getWorldPosition(_cr); _cr.y += 0.13;
        const e = C.camera.position.clone();
        for (const [a, b, r] of occ) {
          bones[a].getWorldPosition(_ca); bones[b].getWorldPosition(_cb);
          if (segDist(e, _cr, _ca, _cb) < r) return true;
        }
        return false;
      };
      /** In-frame fraction of her VISIBLE vertices, and the nearest one to the lens. */
      const measure = () => {
        const v = new V(), vw = new V(), e = C.camera.position;
        let nIn = 0, inBox = 0, nearest = 9;
        p.model.updateWorldMatrix(true, true);
        p.model.traverse((o) => {
          if (!o.isSkinnedMesh && !o.isMesh) return;
          if (!onRig(o)) return;
          const pos = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
          if (!pos) return;
          const stride = Math.max(1, Math.floor(pos.count / 2500));
          for (let i = 0; i < pos.count; i += stride) {
            v.fromBufferAttribute(pos, i);
            if (o.isSkinnedMesh && o.applyBoneTransform) o.applyBoneTransform(i, v);
            v.applyMatrix4(o.matrixWorld);
            const d = v.distanceTo(e);
            if (d < nearest) nearest = d;
            vw.copy(v).applyMatrix4(C.camera.matrixWorldInverse);
            if (vw.z > -C.camera.near) continue;
            v.project(C.camera);
            if (v.x >= -1 && v.x <= 1 && v.y >= -1 && v.y <= 1) inBox++;
            nIn++;
          }
        });
        const h = new V(); head.getWorldPosition(h);
        const hv = h.clone().applyMatrix4(C.camera.matrixWorldInverse);
        const hp = h.clone().project(C.camera);
        const front = hv.z < -C.camera.near;
        const headIn = front && Math.abs(hp.x) <= 1 && Math.abs(hp.y) <= 1;
        const headX = front && Math.abs(hp.x) <= 0.8 && Math.abs(hp.y) <= 1;
        return { frac: nIn ? inBox / nIn : 0, nearest, headIn, headX, hx: hp.x, hy: hp.y, seen: headIn && !crownHidden() };
      };
      // the same flat, clear control ground A31b stages its controls on
      let flat = null;
      for (let x = -220; x <= 220 && !flat; x += 7) {
        for (let z = -220; z <= 220; z += 7) {
          T.getNormal(x, z, n);
          if (Math.acos(Math.max(-1, Math.min(1, n.y))) * DEG > 3) continue;
          if (K.sphereQuery(x, T.getHeight(x, z) + 1, z, 14, [], hider).length) continue;
          flat = { x, z }; break;
        }
      }
      if (!flat) return { pass: null, detail: 'SKIP: no flat clear control ground found' };
      const FRAMES = 56, SETTLE = 16;
      /* camYaw PI: the camera looks along +z, so her heading 0 runs AWAY from
       * the lens, +PI/2 to the frame's LEFT (A), -PI/2 to its RIGHT (D), and
       * PI TOWARD the lens (S). */
      const face = (h) => { p.heading = h; p._faceX = p._candX = Math.sin(h); p._faceZ = p._candZ = Math.cos(h); };
      /* Angle (deg) between the delivered view axis and the REQUESTED one
       * (camYaw / camPitch): residue fix round 3, judge: "run framing turns the
       * delivered view about 23 deg off the player's input on flat ground". */
      const _vd = new V(), _vr = new V();
      const viewOff = () => {
        C.camera.getWorldDirection(_vd);
        _vr.set(-Math.sin(p.camYaw) * Math.cos(p.camPitch), -Math.sin(p.camPitch), -Math.cos(p.camYaw) * Math.cos(p.camPitch));
        return Math.acos(Math.max(-1, Math.min(1, _vd.dot(_vr)))) * DEG;
      };
      const run = async (tag, keys, pin, heading) => {
        p.position.set(flat.x, 0, flat.z); p.velocity.set(0, 0, 0); p._snapToGround();
        face(heading); p.camYaw = Math.PI; p.camPitch = -1.15;
        p._relief = 0; p._lift = 0; p._pivotSeeded = false;
        C.input.keys.clear(); C.input.mouse.buttons = 0;
        for (const k of keys) C.input.keys.add(k);
        const fracs = [], xs = [];
        let heads = 0, headXs = 0, seen = 0, samples = 0, nearest = 9, minU = 1, speed = 0, lean = 0, worstHeadY = 9;
        let viewErr = 0, elevLoss = 0;
        const hidAt = [];
        for (let i = 0; i < FRAMES; i++) {
          await frame();
          if (pin) { p.position.x = flat.x; p.position.z = flat.z; p.velocity.x = 0; p.velocity.z = 0; }
          p.camYaw = Math.PI; p.camPitch = -1.15;
          if (i < SETTLE) continue;
          for (const m of p._mats) if (m.u.value < minU) minU = m.u.value;
          /* the VIEW is the player's (residue fix round 3): every judged frame */
          viewErr = Math.max(viewErr, viewOff());
          elevLoss = Math.max(elevLoss, Math.abs(1.15 - p.camElev) * DEG);
          if (i % 2) continue;
          const m = measure();
          fracs.push(m.frac); samples++; if (m.headIn) heads++; if (m.headX) headXs++;
          if (m.seen) seen++;
          else hidAt.push(i + ':' + ((p.camOrbitPsi ?? 0) * DEG).toFixed(0) + '/' + (p._orbitR ?? 0).toFixed(2) + '/k' + (p.camRunK ?? 0).toFixed(2));
          xs.push(m.hx);
          if (m.nearest < nearest) nearest = m.nearest;
          if (m.hy < worstHeadY) worstHeadY = m.hy;
          speed += Math.hypot(p.velocity.x, p.velocity.z); lean += p.camLean || 0;
        }
        C.input.keys.clear();
        fracs.sort((a, b) => a - b); xs.sort((a, b) => a - b);
        return { tag, onFrac: +fracs[fracs.length >> 1].toFixed(3), onFracMin: +fracs[0].toFixed(3),
          headInFrame: +(heads / samples).toFixed(3), headXInside08: +(headXs / samples).toFixed(3),
          headSeen: +(seen / samples).toFixed(3), headHiddenAtFrames: hidAt.join(','),
          headNdcX: [+xs[0].toFixed(2), +xs[xs.length >> 1].toFixed(2), +xs[xs.length - 1].toFixed(2)],
          worstHeadNdcY: +worstHeadY.toFixed(2),
          nearestVertexM: +nearest.toFixed(3), minOpacity: +minU.toFixed(3),
          maxViewOffInputDeg: +viewErr.toFixed(2), maxElevOffRequestDeg: +elevLoss.toFixed(2),
          speedMs: +(speed / samples).toFixed(2), camLeanM: +(lean / samples).toFixed(3), samples };
      };
      const DIRS = [['away', 'KeyW', 0], ['left', 'KeyA', Math.PI / 2], ['right', 'KeyD', -Math.PI / 2], ['toward', 'KeyS', Math.PI]];
      const pinned = await run('flat-clamp-pinned', [], true, 0);
      const moving = [];
      for (const [name, key, h] of DIRS) {
        moving.push(await run('jog-' + name, [key], false, h));
        moving.push(await run('sprint-' + name, [key, 'ShiftLeft'], false, h));
      }
      const rows = [pinned, ...moving];
      const HEAD_IN = 0.9, HEAD_X = 0.9, KEEP = 0.75, PIN_FLOOR = 0.25, NEAR = 0.15, SEEN = 0.9;
      const VIEW_OFF = 6.0, VIEW_ELEV = 5.5, AIM_ENTRY = 2.0;
      const failing = [];
      for (const r of rows) {
        r.bar = r === pinned ? PIN_FLOOR : +(KEEP * pinned.onFrac).toFixed(3);
        if (r.headInFrame < HEAD_IN) failing.push(r.tag + ': head in frame ' + r.headInFrame);
        if (r.headXInside08 < HEAD_X) failing.push(r.tag + ': head |x| <= 0.8 on ' + r.headXInside08);
        if (r.onFrac < r.bar) failing.push(r.tag + ': onFrac ' + r.onFrac + ' < ' + r.bar);
        if (r.nearestVertexM < NEAR) failing.push(r.tag + ': lens ' + r.nearestVertexM + ' m from her mesh');
        if (r.minOpacity < 0.98) failing.push(r.tag + ': opacity ' + r.minOpacity);
        if (/-away$/.test(r.tag) && r.headSeen < SEEN) failing.push(r.tag + ': head seen past her shoulders on ' + r.headSeen);
      }
      for (const r of moving) {
        const want = r.tag.startsWith('sprint') ? 5.5 : 3.5;
        if (r.speedMs < want) failing.push(r.tag + ': staging did not reach speed (' + r.speedMs + ' m/s)');
        /* RESIDUE FIX ROUND 3: on flat ground the run framing may turn the
         * view by at most RUN_YAW_MAX (3.4 deg), plus the 0.2 deg frame drop
         * and what is left of the standstill rig's body-clearance rotation
         * (2-3 deg when she starts facing sideways, decaying at 4.5/s once
         * the run framing takes her body clearance over); the delivered
         * elevation may not leave the request by more than VIEW_ELEV.  The
         * shipped build measured 23.9 deg of view and 15.2 deg of elevation
         * off the request here. */
        if (r.maxViewOffInputDeg > VIEW_OFF) failing.push(r.tag + ': view ' + r.maxViewOffInputDeg + ' deg off the input');
        if (r.maxElevOffRequestDeg > VIEW_ELEV) failing.push(r.tag + ': elevation ' + r.maxElevOffRequestDeg + ' deg off the request');
      }

      /* AIM ENTRY (residue fix round 3, judge: "on aim entry the reticle
       * drifts 23 deg over about 0.5 s … add a gate row: sprint at the clamp,
       * then RMB; delivered view within 2 deg of the requested axis within 2
       * frames of aim entry").  An ESTABLISHED run (60 frames) away from the
       * lens and to the frame's left (the two directions that took the most
       * turn), then RMB with the keys still held: from the SECOND frame after
       * the press the view is within AIM_ENTRY of the requested axis on every
       * frame of the next 30, and no frame steps the view by more than 3 deg
       * beyond the input (the draw may not lurch it either). */
      const aimEntry = [];
      for (const [name, keys, h] of [['away', ['KeyW', 'ShiftLeft'], 0], ['left', ['KeyA', 'ShiftLeft'], Math.PI / 2]]) {
        p.position.set(flat.x, 0, flat.z); p.velocity.set(0, 0, 0); p._snapToGround();
        face(h); p.camYaw = Math.PI; p.camPitch = -1.15;
        p._relief = 0; p._lift = 0; p._pivotSeeded = false;
        C.input.keys.clear(); C.input.mouse.buttons = 0;
        for (const k of keys) C.input.keys.add(k);
        for (let i = 0; i < 60; i++) { await frame(); p.camYaw = Math.PI; p.camPitch = -1.15; }
        const before = viewOff();
        const dPrev = new V(); C.camera.getWorldDirection(dPrev);
        C.input.mouse.buttons |= 4;
        const errs = []; let maxStep = 0;
        for (let i = 0; i < 32; i++) {
          await frame(); p.camYaw = Math.PI; p.camPitch = -1.15; C.input.mouse.buttons |= 4;
          errs.push(+viewOff().toFixed(2));
          const dNow = new V(); C.camera.getWorldDirection(dNow);
          maxStep = Math.max(maxStep, Math.acos(Math.max(-1, Math.min(1, dNow.dot(dPrev)))) * DEG);
          dPrev.copy(dNow);
        }
        C.input.mouse.buttons = 0; C.input.keys.clear();
        const after = errs.slice(1);
        const r = { tag: 'sprint-' + name + '-then-aim', viewOffBeforeDeg: +before.toFixed(2), viewOffFrames: errs.slice(0, 8),
          maxAfter2ndFrameDeg: Math.max(...after), maxStepDeg: +maxStep.toFixed(2), aiming: p.aiming };
        aimEntry.push(r);
        if (r.maxAfter2ndFrameDeg > AIM_ENTRY) failing.push(r.tag + ': view ' + r.maxAfter2ndFrameDeg + ' deg off the request after the 2nd frame of the draw');
        if (r.maxStepDeg > 3) failing.push(r.tag + ': the draw stepped the view ' + r.maxStepDeg + ' deg in one frame');
      }

      /* Diagnostics (reported, NOT judged): the four diagonals at a sprint,
       * already facing the diagonal, and three turns OUT of a sprint away
       * from the lens — where the lens has to get round her trailing legs. */
      const diagnostics = [];
      for (const [name, keys, h] of [['away-left', ['KeyW', 'KeyA'], Math.PI / 4], ['away-right', ['KeyW', 'KeyD'], -Math.PI / 4],
        ['toward-left', ['KeyS', 'KeyA'], 3 * Math.PI / 4], ['toward-right', ['KeyS', 'KeyD'], -3 * Math.PI / 4]]) {
        diagnostics.push(await run('sprint-' + name, [...keys, 'ShiftLeft'], false, h));
      }
      /* TURNS OUT OF AN ESTABLISHED RUN (residue fix round 2, judge:
       * "turning out of an established run at the pitch clamp puts the lens
       * inside her … A31c's turn diagnostics start the turn from a standstill,
       * before the 42-frame clearance window and the orbit are established").
       * Each turn now starts after 60 frames of running away from the lens,
       * and is JUDGED over the 45 frames after the stick changes, every frame:
       * nearest visible vertex >= 0.15 m and opacity >= 0.98.  Head in frame is
       * reported, not judged. */
      const turns = [];
      const turn = async (gait, then) => {
        const tag = gait + '-away-then-' + then.name;
        p.position.set(flat.x, 0, flat.z); p.velocity.set(0, 0, 0); p._snapToGround();
        face(0); p.camYaw = Math.PI; p.camPitch = -1.15;
        p._relief = 0; p._lift = 0; p._pivotSeeded = false;
        C.input.keys.clear(); C.input.mouse.buttons = 0;
        C.input.keys.add('KeyW'); if (gait === 'sprint') C.input.keys.add('ShiftLeft');
        for (let i = 0; i < 60; i++) { await frame(); p.camYaw = Math.PI; p.camPitch = -1.15; }
        const speed0 = Math.hypot(p.velocity.x, p.velocity.z);
        C.input.keys.clear();
        for (const k of then.keys) C.input.keys.add(k);
        if (gait === 'sprint') C.input.keys.add('ShiftLeft');
        let nearest = 9, nearAt = -1, minU = 1, heads = 0, n = 0, under = 0;
        for (let i = 0; i < 45; i++) {
          await frame(); p.camYaw = Math.PI; p.camPitch = -1.15;
          for (const m of p._mats) if (m.u.value < minU) minU = m.u.value;
          const m = measure(); n++;
          if (m.headIn) heads++;
          if (m.nearest < NEAR) under++;
          if (m.nearest < nearest) { nearest = m.nearest; nearAt = i; }
        }
        C.input.keys.clear();
        return { tag, runSpeedBefore: +speed0.toFixed(2), nearestVertexM: +nearest.toFixed(3), nearAt, framesUnder015: under,
          minOpacity: +minU.toFixed(3), headInFrame: +(heads / n).toFixed(3), headingEndDeg: +(p.heading * DEG % 360).toFixed(1) };
      };
      for (const gait of ['sprint', 'jog']) {
        for (const then of [{ name: 'left', keys: ['KeyA'] }, { name: 'right', keys: ['KeyD'] },
          { name: 'toward', keys: ['KeyS'] }, { name: 'away-left', keys: ['KeyW', 'KeyA'] }]) {
          turns.push(await turn(gait, then));
        }
      }
      for (const r of turns) {
        if (r.nearestVertexM < NEAR) failing.push(r.tag + ': lens ' + r.nearestVertexM + ' m from her mesh (frame ' + r.nearAt + ' of the turn)');
        if (r.minOpacity < 0.98) failing.push(r.tag + ': opacity ' + r.minOpacity);
        if (r.runSpeedBefore < (r.tag.startsWith('sprint') ? 5.5 : 3.5)) failing.push(r.tag + ': run not established before the turn (' + r.runSpeedBefore + ' m/s)');
      }

      /* The FILM is the sprint away — the staging the judge first filmed as a
       * bow and nothing else.  Keys stay held so the runner's frame is
       * mid-stride; they are released after 3 s so nothing leaks. */
      p.position.set(flat.x, 0, flat.z); p.velocity.set(0, 0, 0); p._snapToGround();
      face(0); p.camYaw = Math.PI; p.camPitch = -1.15; p._pivotSeeded = false;
      C.input.keys.clear(); C.input.keys.add('KeyW'); C.input.keys.add('ShiftLeft');
      const until = performance.now() + 3000;
      const hold = () => {
        if (performance.now() > until) { C.input.keys.clear(); return; }
        p.camPitch = -1.15; requestAnimationFrame(hold);
      };
      hold();
      for (let i = 0; i < 30; i++) await frame();
      const film = measure();

      return { pass: failing.length === 0, detail: {
        flatAt: flat, bars: { headIn: HEAD_IN, headXInside08: HEAD_X, keep: KEEP, pinnedFloor: PIN_FLOOR, nearestVertexM: NEAR, headSeenAway: SEEN,
          viewOffInputDeg: VIEW_OFF, elevOffRequestDeg: VIEW_ELEV, aimEntryDeg: AIM_ENTRY },
        pinned, moving, turns, aimEntry, failing, diagnostics,
        film: { onFrac: +film.frac.toFixed(3), headIn: film.headIn, headNdcX: +film.hx.toFixed(2), headNdcY: +film.hy.toFixed(2),
          nearestVertexM: +film.nearest.toFixed(3), camLeanM: +(p.camLean || 0).toFixed(3), headSeen: film.seen },
      } };
    })()`,
  },
];
  return { GATES };
})();

/* ========================================================================== */

/* ========================================================================== */
/* hero-body W0b — the gates this lane adds (plan §9 hero-body)               */
/* ========================================================================== */

const INPUT_ON = `__CTX__.input.enabled = true;`;

/** Page prelude shared by the hero-body gates (splice inside an async body). */
const HB = `
      const C = __CTX__, p = C.player, an = p.animator, cmb = C.combat, E = C.engine;
      const T3 = p.position.constructor;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      /** wait SIM seconds (the clock movement integrates on), with a wall cap */
      const simWait = async (sec, capMs = 25000) => { const s0 = E.simTime, w0 = performance.now(); while (E.simTime - s0 < sec && performance.now() - w0 < capMs) await frame(); return E.simTime - s0; };
      const freeze = () => { for (const m of (C.machines?.list || [])) m.update = () => {}; };
      const keys = C.input.keys;
      const release = () => { keys.clear(); C.input.mouse.buttons = 0; };
      const WP = (bone) => bone.getWorldPosition(new T3());
      const CH = (v) => p.model.worldToLocal(v.clone());
      const prof = p.model.userData?.rigProfile || null;`;

/** Full draw at `pitch` (RMB, then LMB), held `holdS` sim seconds. */
const DRAW = `
      const drawAt = async (pitch, key = null, holdS = 2.0) => {
        release(); await wait(350);
        p.camPitch = pitch; C.input.mouse.buttons |= 4;
        if (key) keys.add(key);
        await simWait(0.6, 4000);
        C.input.mouse.buttons |= 1;
        await simWait(holdS, 15000);
        p.camPitch = pitch; await frame(); await frame();
      };`;

const GATE_PITCHES = [-0.55, -0.4, 0, 0.75];
/** Fix round 4 (judge r1: knuckle 0.109 m from the nock at the 0.75 down aim): the hand ON the string, at every pitch. */
const KNUCKLE_NOCK = 0.06, FINGERTIP_NOCK = 0.06;

/** Page prelude: flatStrip(len) — a flat, clear, dry straight run (see the comment inside). */
const FLAT_STRIP = `
      /* the flattest clear, dry straight run of len m on the terrain: a
       * deterministic ring scan from the map centre, 8 bearings, samples every
       * 2 m; no blocking collider within 1.0 m of the line; kept the one whose
       * worst slope (and twice its worst UPHILL grade) is least, at most 9 deg.
       * The W0 places table's openGround climbs a rise 28 m out and its runway
       * meets a collider at 26 m, both inside a full-sprint window. */
      /* Fix round 1 (R27): every machine on the map is FROZEN first (its
       * update stubbed), and a strip within 15 m of any machine's frozen
       * position is rejected — the judges' replicas showed A13's 4th-5th runs
       * failing exactly when a patrolling machine had walked to 2.1-2.5 m of
       * the strip and shoved her (lock pinned at its cap, 0.17-0.95 m skate). */
      for (const m of (__CTX__.machines?.list || [])) m.update = () => {};
      const flatStrip = (len) => {
        const n = new p.position.constructor(), K = __CTX__.collision, T = __CTX__.terrain;
        const pools = __CTX__.environment?.water?.pools || [];
        const wet = (x, z) => pools.some((q) => ((x - q.x) / q.rx) ** 2 + ((z - q.z) / q.rz) ** 2 < 1.3);
        const mach = (__CTX__.machines?.list || []).filter((m) => !m._disposed && m.position).map((m) => [m.position.x, m.position.z]);
        const nearMachine = (x, z) => mach.some(([mx, mz]) => (mx - x) ** 2 + (mz - z) ** 2 < 15 * 15);
        const blk = (c) => c.blocking;
        let best = null;
        for (let r = 0; r <= 240; r += 12) for (let a = 0; a < 6.283; a += (r ? 12 / r : 7)) {
          const x0 = Math.cos(a) * r, z0 = Math.sin(a) * r;
          for (let k = 0; k < 8; k++) {
            const dx = Math.sin(k * Math.PI / 4), dz = Math.cos(k * Math.PI / 4);
            let ok = true, maxSl = 0, maxUp = 0, hPrev = null;
            for (let s = 0; s <= len && ok; s += 2) {
              const x = x0 + dx * s, z = z0 + dz * s;
              if (Math.hypot(x, z) > 290 || wet(x, z) || nearMachine(x, z)) { ok = false; break; }
              T.getNormal(x, z, n); const sl = Math.acos(Math.min(1, n.y)) * 57.2958; if (sl > maxSl) maxSl = sl;
              if (maxSl >= 9) { ok = false; break; }
              const h = T.getHeight(x, z);
              if (hPrev !== null) { const up = Math.atan2(h - hPrev, 2) * 57.2958; if (up > maxUp) maxUp = up; }
              hPrev = h;
              if (K.sphereQuery(x, h + 1, z, 1.0, [], blk).length) { ok = false; break; }
            }
            if (!ok) continue;
            const score = Math.max(maxSl, 2 * maxUp);
            if (!best || score < best.score) best = { x: x0, z: z0, dx, dz, yaw: Math.atan2(-dx, -dz), score, maxSlopeDeg: maxSl, maxUphillDeg: maxUp };
          }
        }
        return best;
      };
`;

const NEW_GATES = [
  /* ------------------------------------------------------- A-lmax-solve */
  {
    id: 'A-lmax-solve', kind: 'action', lane: 'hero-body', timeout: 90000,
    title: "Each bow's pull equals the Lmax solve on Brea (max over the gate pitches) +- 0.01 m; arrow = pull + 0.20 +- 0.02 m; values published in the rig profile",
    setup: INPUT_ON, settle: 400,
    assert: placed(['openGround'], `(async () => {${HB}${DRAW}
      freeze(); standAt(p, 'openGround'); await wait(300);
      const bow = prof?.bow;
      if (!bow) return { pass: false, detail: 'no rigProfile.bow published' };
      const rows = [];
      for (const pitch of ${JSON.stringify(GATE_PITCHES)}) {
        await drawAt(pitch);
        const A = an.debugAim();
        rows.push({ pitch, drawS: +cmb.drawStrength.toFixed(2), lmax: A.lmax, pullLive: A.pull });
      }
      release();
      const lmaxMax = Math.max(...rows.map((r) => r.lmax));
      const bows = Object.entries(cmb._models || {}).filter(([id]) => /-bow$/.test(id))
        .map(([id, m]) => ({ id, pull: m.pull, restZ: m.restZ, solution: +(lmaxMax + m.restZ).toFixed(4) }));
      const bowsOk = bows.length > 0 && bows.every((b) => Math.abs(b.pull - b.solution) <= 0.01);
      const profileOk = Math.abs(bow.pull - (lmaxMax + bow.restZ)) <= 0.01 && Math.abs(bow.drawLength - lmaxMax) <= 0.01;
      const arrowOk = Math.abs(bow.arrowLen - bow.pull - 0.20) <= 0.02;
      const drawn = rows.every((r) => r.drawS > 0.9 && r.lmax > 0);
      return { pass: drawn && bowsOk && profileOk && arrowOk,
        detail: { rows, lmaxMax: +lmaxMax.toFixed(4), bows, profile: { drawLength: bow.drawLength, pull: bow.pull, arrowLen: bow.arrowLen, restZ: bow.restZ }, bowsOk, profileOk, arrowOk } };
    })()`),
  },

  /* -------------------------------------------------- A-draw-elbow-level */
  {
    id: 'A-draw-elbow-level', kind: 'action', lane: 'hero-body', timeout: 120000,
    title: 'Full draw, four pitches + strafing (and from a jog / a sprint): draw elbow within [shoulder - 0.03, shoulder + 0.05] m (aim frame), >= 0.05 m behind the hand along the arrow, bow arm >= 0.04 m clear of the chest surface (torso-skinned outfit vertices); R35: the draw HAND never > 0.10 m behind the head plane and always in front of the back of the skull, the draw ELBOW <= 0.20 m behind it; the hand ON the string: middle knuckle <= 0.06 m and middle fingertip <= 0.06 m from the bow nock (fix round 4); at the four pitches the forearm within 20 deg of the arrow and the wrist within 0.03 m of the level draw\'s height over the Head joint and of its place in the head\'s frame (fix round 5) — and through the LOOSE, on every sim step from the release until 0.3 s after it, the hand still in front of the back of the skull and the elbow <= 0.20 m',
    setup: INPUT_ON, settle: 400,
    assert: placed(['openGround'], `(async () => {${HB}${DRAW}
      freeze(); standAt(p, 'openGround'); await wait(300);
      // the chest surface: the equipped outfit's (else the body's) vertices in
      // the chest band at rest, skinned LIVE through three's own CPU skinning
      let skin = null;
      p.model.traverse((o) => { if (o.isSkinnedMesh && /outfit/.test(o.userData.heroPart || '')) skin = o; });
      if (!skin) p.model.traverse((o) => { if (!skin && o.isSkinnedMesh && o.geometry.getAttribute('_hidemask')) skin = o; });
      // ...and only vertices the TORSO carries: a sleeve or shoulder-cap vertex
      // skinned to the arm moves with the arm, so its distance to the arm is a
      // constant of the mesh, not a clearance (it read -0.0024 m at every pitch)
      const tmp = new T3(), idx = [];
      const hips = WP(an.b.pelvis.bone), neck = WP(an.b.neck1.bone);
      const bn = skin.skeleton.bones.map((x) => x.name);
      const sIdx = skin.geometry.attributes.skinIndex, sWt = skin.geometry.attributes.skinWeight;
      const armW = (i) => { let w = 0; for (let k = 0; k < 4; k++) if (/clavicle|upperarm|lowerarm|hand/i.test(bn[sIdx.getComponent(i, k)] || '')) w += sWt.getComponent(i, k); return w; };
      for (let i = 0; i < skin.geometry.attributes.position.count; i += 2) {
        if (armW(i) >= 0.1) continue;
        skin.getVertexPosition(i, tmp); skin.localToWorld(tmp);
        const c = CH(tmp), hc = CH(hips), nc = CH(neck);
        if (c.y > hc.y + 0.18 && c.y < nc.y - 0.02 && Math.abs(c.x) < 0.2) idx.push(i);
      }
      const segD = (P, A, B) => { const ab = B.clone().sub(A), ap = P.clone().sub(A); const t = Math.max(0, Math.min(1, ap.dot(ab) / ab.lengthSq())); return ap.sub(ab.multiplyScalar(t)).length(); };
      const rows = [];
      /* fix round 3: + a draw from a jog and from a sprint (the follow-through
       * clause below; the judge's trace found the loose behind the skull from
       * both). A row re-stands her at the place, runs 1 s first if it moves,
       * aims, draws and holds; keys are held through the loose. */
      const runs = ${JSON.stringify(GATE_PITCHES.map((p) => [p, null]))}.concat([[0, 'KeyD'], [0, 'KeyA'], [0, 'KeyW'], [0, 'KeyW+ShiftLeft']]);
      const LOOSE_TAIL = 0.3;
      for (const [pitch, key] of runs) {
        release(); await wait(350);
        standAt(p, 'openGround'); p.velocity.set(0, 0, 0); await simWait(0.3, 4000);
        p.camPitch = pitch;
        if (key) for (const k of key.split('+')) keys.add(k);
        if (key && key.includes('KeyW')) await simWait(1.0, 8000);
        C.input.mouse.buttons |= 4;
        await simWait(0.6, 4000);
        C.input.mouse.buttons |= 1;
        await simWait(2.0, 15000);
        p.camPitch = pitch; await frame(); await frame();
        const R = an.debugArm('r'), A = an.debugAim();
        const d = new T3(...A.d).normalize();
        const up = new T3(0, 1, 0).addScaledVector(d, -d.y).normalize();
        const sh = new T3(R.shoulder.x, R.shoulder.y, R.shoulder.z), el = new T3(R.elbow.x, R.elbow.y, R.elbow.z), ha = new T3(R.hand.x, R.hand.y, R.hand.z);
        const s0 = WP(an.b.upArmL.bone), s1 = WP(an.b.loArmL.bone), s2 = WP(an.b.handL.bone);
        const mid = s0.clone().lerp(s1, 0.5);
        let chest = 9;
        for (const i of idx) { skin.getVertexPosition(i, tmp); skin.localToWorld(tmp); chest = Math.min(chest, segD(tmp, mid, s1) - 0.045, segD(tmp, s1, s2) - 0.035); }
        /* FEASIBILITY (Oct 22, reported, not graded): every elbow the arm CAN
         * take with this shoulder and this hand is on the circle about the
         * shoulder -> wrist axis (upper arm and forearm lengths fixed). The
         * scan reports the least "behind the head plane" among the circle's
         * points that also hold the two form bars above (height in
         * [-0.03, +0.05], >= 0.05 m behind the hand), so a miss of the
         * head-plane clause can be told apart from a bad roll choice. */
        const L1 = sh.distanceTo(el), L2 = el.distanceTo(ha), Dv = ha.clone().sub(sh), Dl = Dv.length(), ax = Dv.clone().normalize();
        const ca = (L1 * L1 - L2 * L2 + Dl * Dl) / (2 * Dl), rad = Math.sqrt(Math.max(0, L1 * L1 - ca * ca));
        const cc = sh.clone().addScaledVector(ax, ca), cu = new T3(0, 1, 0).addScaledVector(ax, -ax.y).normalize(), cv = new T3().crossVectors(ax, cu);
        let feasibleMin = null;
        for (let k = 0; k < 72; k++) {
          const t = k * Math.PI / 36, e2 = cc.clone().addScaledVector(cu, Math.cos(t) * rad).addScaledVector(cv, Math.sin(t) * rad);
          const u2 = e2.clone().sub(sh).dot(up), bh = ha.clone().sub(e2).dot(d);
          if (u2 >= -0.03 && u2 <= 0.05 && bh >= 0.05) { const b2 = an.behindHead(e2); if (feasibleMin === null || b2 < feasibleMin) feasibleMin = b2; }
        }
        // fix round 4 (judge r1, the 0.75 down aim: "the draw hand is not on the
        // string"): the middle knuckle and the middle fingertip to the bow's own
        // nock (combat.bow.getNockWorld), world metres, every row
        const nkW = new T3(); cmb.bow.getNockWorld(cmb.drawStrength, nkW);
        const knW = new T3(), ftW = new T3();
        const hasHand = an.debugDrawHand ? an.debugDrawHand(knW, ftW) : false;
        /* fix round 5 (judge r2, the 0.75 down aim: "the draw forearm is 64 deg
         * off the arrow and the fist sits over the ear"): the forearm (elbow ->
         * wrist) against the arrow (the bow's nock -> the bow hand), world; the
         * wrist against the Head joint — its height, and its position in the
         * head's own frame — compared with the level draw's below */
        const wrW = WP(an.b.handR.bone), elW = WP(an.b.loArmR.bone), bhW = WP(an.b.handL.bone), hdW = WP(an.b.head.bone);
        const foreDir = wrW.clone().sub(elW).normalize(), arrowDir = bhW.clone().sub(nkW).normalize();
        const wrHead = wrW.clone().applyMatrix4(an.b.head.bone.matrixWorld.clone().invert());
        rows.push({ pitch, key, drawS: +cmb.drawStrength.toFixed(2),
          forearmToArrowDeg: +(Math.acos(Math.max(-1, Math.min(1, foreDir.dot(arrowDir)))) * 180 / Math.PI).toFixed(2),
          wristOverHeadJointM: +(wrW.y - hdW.y).toFixed(4), wristInHead: wrHead.toArray().map((v) => +v.toFixed(4)),
          elbowAboveShoulderWorld: +(elW.y - WP(an.b.upArmR.bone).y).toFixed(4),
          knuckleToNock: hasHand ? +knW.distanceTo(nkW).toFixed(4) : null,
          fingertipToNock: hasHand ? +ftW.distanceTo(nkW).toFixed(4) : null,
          elbowUp: +el.clone().sub(sh).dot(up).toFixed(4),
          elbowBehindHand: +ha.clone().sub(el).dot(d).toFixed(4),
          bowArmChest: +chest.toFixed(4), chestPoints: idx.length,
          handBehindHead: +an.behindHead(ha).toFixed(4), elbowBehindHead: +an.behindHead(el).toFixed(4),
          shoulderBehindHead: +an.behindHead(sh).toFixed(4),
          elbowBehindHeadBestFeasible: feasibleMin === null ? null : +feasibleMin.toFixed(4) });
        /* THE FOLLOW-THROUGH (fix round 3; judge r0: the wrist +0.03..+0.06 m
         * BEHIND the back of the skull at looseT 0.22-0.44, which no clause
         * sampled). Every animator update (= one sim step) from the release
         * until LOOSE_TAIL sim seconds after it: the draw hand (wrist joint,
         * the rearmost point of the hand through the loose) and the elbow
         * against the same plane, the same function. */
        const row = rows[rows.length - 1];
        let lH = -9, lE = -9, lF = -9, lN = 0, lBack = 0;
        const h0 = ha.clone();
        const upd = an.update, sh0 = E.simTime;
        let tRel = null;
        an.update = function (dt, t) {
          const r = upd.call(this, dt, t);
          if (dt > 0 && tRel !== null && E.simTime - tRel <= LOOSE_TAIL + 1e-6) {
            const Q = this.debugArm('r');
            const h = new T3(Q.hand.x, Q.hand.y, Q.hand.z), e = new T3(Q.elbow.x, Q.elbow.y, Q.elbow.z);
            lH = Math.max(lH, this.behindHead(h)); lE = Math.max(lE, this.behindHead(e)); lF = Math.max(lF, this.behindHead(h.clone().lerp(e, 0.5)));
            lBack = Math.max(lBack, h0.z - h.z); lN++;
          }
          return r;
        };
        try {
          tRel = E.simTime; C.input.mouse.buttons &= ~1;
          await simWait(LOOSE_TAIL + 0.05, 8000);
        } finally { an.update = upd; }
        Object.assign(row, { looseSteps: lN, looseMaxHandBehindHead: +lH.toFixed(4), looseMaxElbowBehindHead: +lE.toFixed(4),
          looseMaxForearmMidBehindHead: +lF.toFixed(4), looseRearM: +lBack.toFixed(4) });
        release();
      }
      release();
      /* head plane = the back of the skull (the head ellipsoid's back, along
       * the head's live forward: animator.behindHead). R35 (plan §8.3, §9):
       * the HAND never more than 0.10 m behind it and always in front of it
       * (< 0); the ELBOW at most 0.20 m behind it; the other clauses as
       * before. The follow-through clauses on every row. */
      const ok = (r) => [r.drawS > 0.9 ? null : 'drawS', r.elbowUp >= -0.03 && r.elbowUp <= 0.05 ? null : 'elbowHeight',
        r.elbowBehindHand >= 0.05 ? null : 'elbowBehindHand', r.bowArmChest >= 0.04 ? null : 'bowArmChest',
        r.handBehindHead <= 0.10 ? null : 'handBehindHeadPlane', r.handBehindHead < 0 ? null : 'handBehindSkull',
        r.elbowBehindHead <= 0.20 ? null : 'elbowBehindHead',
        r.knuckleToNock != null && r.knuckleToNock <= ${KNUCKLE_NOCK} ? null : 'knuckleOffString',
        r.fingertipToNock != null && r.fingertipToNock <= ${FINGERTIP_NOCK} ? null : 'fingertipOffString',
        r.looseSteps >= 6 ? null : 'looseSampled', r.looseMaxHandBehindHead < 0 ? null : 'looseHandBehindSkull',
        r.looseMaxElbowBehindHead <= 0.20 ? null : 'looseElbowBehindHead'].filter(Boolean);
      // fix round 5: at each of the four gate pitches (no strafe key) the forearm
      // within 20 deg of the arrow, and the wrist held where the LEVEL draw holds
      // it on the head: its height over the Head joint within 0.03 m of the
      // level row's, and its position in the head's own frame within 0.03 m
      const lvl = rows.find((r) => r.pitch === 0 && !r.key);
      for (const r of rows) {
        if (r.key || !lvl) continue;
        r.wristHeadYOffLevelM = +Math.abs(r.wristOverHeadJointM - lvl.wristOverHeadJointM).toFixed(4);
        r.wristHeadFrameOffLevelM = +Math.hypot(...r.wristInHead.map((v, i) => v - lvl.wristInHead[i])).toFixed(4);
      }
      const okT = (r) => r.key ? [] : [r.forearmToArrowDeg <= 20 ? null : 'forearmOffArrow',
        r.wristHeadYOffLevelM <= 0.03 ? null : 'wristHeightOffLevel', r.wristHeadFrameOffLevelM <= 0.03 ? null : 'wristOffLevelAnchor'].filter(Boolean);
      const ok0 = ok;
      const okAll = (r) => [...ok0(r), ...okT(r)];
      const bad = rows.filter((r) => okAll(r).length);
      const margin = {
        elbowBehindHeadMax: +Math.max(...rows.map((r) => r.elbowBehindHead)).toFixed(4),
        elbowTo020Min: +(0.20 - Math.max(...rows.map((r) => r.elbowBehindHead))).toFixed(4),
        strafeElbowTo020: rows.filter((r) => r.key === 'KeyD' || r.key === 'KeyA').map((r) => +(0.20 - r.elbowBehindHead).toFixed(4)),
        downElbowBehindHand: rows.find((r) => r.pitch === 0.75 && !r.key)?.elbowBehindHand ?? null,
        handBehindHeadMax: +Math.max(...rows.map((r) => r.handBehindHead)).toFixed(4),
        looseHandBehindHeadMax: +Math.max(...rows.map((r) => r.looseMaxHandBehindHead)).toFixed(4),
        looseElbowBehindHeadMax: +Math.max(...rows.map((r) => r.looseMaxElbowBehindHead)).toFixed(4),
        knuckleToNockMax: +Math.max(...rows.map((r) => r.knuckleToNock ?? 9)).toFixed(4),
        fingertipToNockMax: +Math.max(...rows.map((r) => r.fingertipToNock ?? 9)).toFixed(4),
      };
      margin.forearmToArrowMaxDeg = +Math.max(...rows.filter((r) => !r.key).map((r) => r.forearmToArrowDeg)).toFixed(2);
      margin.wristHeadYOffLevelMax = +Math.max(...rows.filter((r) => !r.key).map((r) => r.wristHeadYOffLevelM)).toFixed(4);
      margin.wristHeadFrameOffLevelMax = +Math.max(...rows.filter((r) => !r.key).map((r) => r.wristHeadFrameOffLevelM)).toFixed(4);
      return { pass: bad.length === 0 && idx.length > 20, detail: { rule: 'R35 + fix round 5 (forearm on the arrow, wrist at the level anchor)', rows, margin, failing: bad.map((r) => r.pitch + (r.key || '') + ':' + okAll(r).join('+')) } };
    })()`),
  },

  /* --------------------------------------------------------- A-wrap-clear */
  {
    id: 'A-wrap-clear', kind: 'action', lane: 'hero-body', timeout: 120000,
    title: 'M10: every dyn_ chain (wrap tail, knot tail, sash end, alidade cord) >= 0.05 m from the draw hand/forearm through a full draw cycle from a sprint-stop at four pitches; the hand capsule reported active',
    setup: INPUT_ON, settle: 400,
    assert: placed(['openGround'], `(async () => {${HB}
      freeze();
      const half = ${JSON.stringify(0.035)};      // the hand/forearm's own half-thickness (rig profile UBC_HAND_HALF)
      if (!an.debugHandCollider) return { pass: false, detail: 'no M10 collider on the animator' };
      const chains = (an._chains || []).map((c) => c.links[0].name);
      const rows = [];
      for (const pitch of ${JSON.stringify(GATE_PITCHES)}) {
        release(); standAt(p, 'openGround'); await wait(300);
        keys.add('KeyW'); keys.add('ShiftLeft'); await simWait(1.2, 8000);
        keys.clear();                                       // sprint-stop
        p.camPitch = pitch; C.input.mouse.buttons |= 4;
        let minAxis = 9, frames = 0, inactive = 0, drawMax = 0, at = null, fullFrames = 0;
        const t0 = E.simTime;
        let drew = false;
        while (E.simTime - t0 < 3.4) {
          if (!drew && E.simTime - t0 > 0.5) { C.input.mouse.buttons |= 1; drew = true; }
          if (drew && E.simTime - t0 > 2.6) C.input.mouse.buttons &= ~1;   // loose
          p.camPitch = pitch;
          await frame();
          const H = an.debugHandCollider();
          if (!H.active) inactive++;
          if (H.minAxis < minAxis) { minAxis = H.minAxis; at = H.at + ' @' + (E.simTime - t0).toFixed(2) + 's'; }
          frames++;
          drawMax = Math.max(drawMax, cmb.drawStrength);
          if (cmb.drawStrength > 0.9) fullFrames++;
        }
        rows.push({ pitch, frames, minClearM: +(minAxis - half).toFixed(4), closest: at, inactiveFrames: inactive, drawMax: +drawMax.toFixed(2), fullDrawFrames: fullFrames });
      }
      release();
      const pass = rows.every((r) => r.minClearM >= 0.05 && r.inactiveFrames === 0 && r.frames > 30 && r.drawMax > 0.9 && r.fullDrawFrames > 10);
      return { pass, detail: { rows, chains, collider: an.debugHandCollider() } };
    })()`),
  },

  /* ------------------------------------------------------ A-alidade-pose */
  {
    id: 'A-alidade-pose', kind: 'action', lane: 'hero-body', timeout: 90000,
    title: 'Raise the alidade (Sighting) from idle, jog and crouch: tube within 0.03 m of the right eye, elbow below the head and in front of the head plane; lowered again in <= 0.3 s',
    setup: INPUT_ON, settle: 400,
    assert: placed(['openGround'], `(async () => {${HB}
      freeze();
      if (!an.debugAlidade) return { pass: false, detail: 'no alidade overlay' };
      const S = C.sighting;
      if (!S) return { pass: null, detail: 'SKIP: no Sighting system in this build' };
      const press = async () => { C.input._press?.('KeyV', { code: 'KeyV' }); await frame(); keys.delete('KeyV'); C.input._upHandlers?.get('KeyV')?.forEach((fn) => fn({ code: 'KeyV' })); };
      const rows = [];
      for (const mode of ['idle', 'jog', 'crouch']) {
        release(); standAt(p, 'openGround'); await wait(300);
        if (mode === 'crouch') p.setCrouch(true); else p.setCrouch(false);
        if (mode === 'jog') keys.add('KeyW');
        await simWait(0.6, 5000);
        if (!S.on) await press();
        await simWait(0.5, 5000);
        const up = an.debugAlidade();
        if (S.on) await press();
        const t0 = E.simTime; let back = null;
        while (E.simTime - t0 < 1.0) { await frame(); if (an.debugAlidade().w < 0.05) { back = E.simTime - t0; break; } }
        rows.push({ mode, on: up.w, tubeToEye: up.tubeToEye, elbowBelowHead: up.elbowBelowHead, elbowAhead: up.elbowAheadOfHeadPlane, lowerS: back === null ? null : +back.toFixed(3) });
        release(); p.setCrouch(false);
      }
      const pass = rows.every((r) => r.on > 0.9 && r.tubeToEye <= 0.03 && r.elbowBelowHead > 0 && r.elbowAhead > 0 && r.lowerS !== null && r.lowerS <= 0.3);
      return { pass, detail: { rows } };
    })()`),
  },

  /* ----------------------------------------------------------- A-run-arms */
  {
    id: 'A-run-arms', kind: 'action', lane: 'hero-body', timeout: 60000,
    title: "Kevin's running arms: sprint 4 s, every frame — wrist >= 0.10 m off the torso midline (no crossing), below shoulder - 0.25 m (no T-rex), >= 0.25 m fore-aft per cycle, each elbow driven >= 0.10 m behind the hip once per stride cycle (the backswing, V12); pelvis bob <= 0.08 m p-p and the knee never above the hip (no prancing)",
    setup: INPUT_ON, settle: 400,
    assert: `(async () => {${HB}${FLAT_STRIP}
      freeze();
      const fs = flatStrip(46);
      if (!fs) return { pass: null, detail: 'SKIP-R18 (place): no flat, clear 46 m strip on this terrain' };
      p.position.set(fs.x, 0, fs.z); p.velocity.set(0, 0, 0); p._snapToGround(); p.camYaw = fs.yaw; p.camPitch = 0;
      await wait(300);
      keys.add('KeyW'); keys.add('ShiftLeft');
      await simWait(1.5, 8000);
      const b = an.b;
      let minLat = 9, maxRel = -9, frames = 0, kneeOver = 0, spdSum = 0;
      let pyMin = 9, pyMax = -9;
      const fa = { l: [], r: [] }, py = [], eb = { l: [], r: [] };
      const t0 = E.simTime;
      while (E.simTime - t0 < 4.0) {
        await frame(); frames++;
        const pel = CH(WP(b.pelvis.bone)), sp = CH(WP(b.spine3.bone)), shL = CH(WP(b.upArmL.bone)), shR = CH(WP(b.upArmR.bone));
        const wl = CH(WP(b.handL.bone)), wr = CH(WP(b.handR.bone));
        const midX = (pel.x + sp.x) / 2;
        minLat = Math.min(minLat, wl.x - midX, midX - wr.x);
        maxRel = Math.max(maxRel, wl.y - (shL.y - 0.25), wr.y - (shR.y - 0.25));
        fa.l.push(wl.z - pel.z); fa.r.push(wr.z - pel.z);
        eb.l.push(CH(WP(b.loArmL.bone)).z - pel.z); eb.r.push(CH(WP(b.loArmR.bone)).z - pel.z);
        pyMin = Math.min(pyMin, pel.y); pyMax = Math.max(pyMax, pel.y); py.push(pel.y);
        for (const [th, ca] of [[b.thighL, b.calfL], [b.thighR, b.calfR]]) if (CH(WP(ca.bone)).y > CH(WP(th.bone)).y) kneeOver++;
        spdSum += p.moveSpeed;
      }
      release();
      // fore-aft range per stride cycle: the median of the per-window ranges
      const cyc = Math.max(4, Math.round(frames / Math.max(1, 4.0 * (an.loco?.freq || 1.6))));
      const ranges = (arr) => { const out = []; for (let i = 0; i + cyc <= arr.length; i += cyc) { const w = arr.slice(i, i + cyc); out.push(Math.max(...w) - Math.min(...w)); } out.sort((x, y) => x - y); return out.length ? out[Math.floor(out.length / 2)] : 0; };
      const foreAft = Math.min(ranges(fa.l), ranges(fa.r));
      // the vertical OSCILLATION: the worst peak-to-peak inside one stride
      // cycle (slow drift across cycles is the conform following the ground,
      // not a bounce); the whole-window range is reported beside it
      const bobCycles = []; for (let i = 0; i + cyc <= py.length; i += cyc) { const w = py.slice(i, i + cyc); bobCycles.push(Math.max(...w) - Math.min(...w)); }
      const bob = bobCycles.length ? Math.max(...bobCycles) : 9;
      const speed = spdSum / Math.max(1, frames);
      // the backswing: in EVERY full stride cycle each elbow passes >= 0.10 m
      // behind the hip (pelvis joint), char space
      // (fix round 2: each window spans 1.2 cycles, stepped by one — the frames
      // per cycle come from the MEAN gait rate, and on a jittery frame clock an
      // exact-length window could fall between two backswing peaks: one window
      // in eight read -0.083 m while every stride measured -0.126..-0.136 m)
      const cycW = Math.ceil(cyc * 1.2);
      const backCycles = (arr) => { const out = []; for (let i = 0; i + cycW <= arr.length; i += cyc) out.push(Math.min(...arr.slice(i, i + cycW))); return out; };
      const bl = backCycles(eb.l), br = backCycles(eb.r);
      const backswingOk = bl.length > 0 && bl.every((v) => v <= -0.10) && br.every((v) => v <= -0.10);
      const pass = frames > 60 && minLat >= 0.10 && maxRel < 0 && foreAft >= 0.25 && bob <= 0.08 && kneeOver === 0 && backswingOk && speed > 0.9 * p.speeds.sprint;
      return { pass, detail: { frames, wristToMidlineMinM: +minLat.toFixed(4), wristOverShoulderMinus25cm: +maxRel.toFixed(4),
        foreAftPerCycleM: +foreAft.toFixed(3), framesPerCycle: cyc, pelvisBobPpM: +bob.toFixed(4), pelvisWindowRangeM: +(pyMax - pyMin).toFixed(4),
        kneeAboveHipFrames: kneeOver, elbowBehindHipPerCycleM: { l: bl.map((v) => +v.toFixed(3)), r: br.map((v) => +v.toFixed(3)) }, backswingOk, meanSpeed: +speed.toFixed(2), strip: { x: +fs.x.toFixed(1), z: +fs.z.toFixed(1), yaw: +fs.yaw.toFixed(3), maxSlopeDeg: +fs.maxSlopeDeg.toFixed(1), maxUphillDeg: +fs.maxUphillDeg.toFixed(1) } } };
    })()`,
  },

  /* ----------------------------------------------- A31g-direction-change-skate */
  {
    id: 'A31g-direction-change-skate', kind: 'action', lane: 'hero-body', timeout: 150000,
    title: 'Aim-strafe reversals L->R and R->L, 10 each: the first stance after EVERY reversal (20 of 20 measured) drifts <= 0.08 m',
    setup: INPUT_ON, settle: 400,
    assert: placed(['openGround'], `(async () => {${HB}
      freeze(); standAt(p, 'openGround'); await wait(300);
      if (!an.debugFeet) return { pass: null, detail: 'SKIP: no debugFeet()' };
      const T = C.terrain;
      C.input.mouse.buttons |= 4; await simWait(0.6, 5000);
      const firsts = [];
      let key = 'KeyA';
      keys.add(key); await simWait(0.8, 6000);
      for (let rev = 0; rev < 20; rev++) {
        keys.delete(key); key = key === 'KeyA' ? 'KeyD' : 'KeyA'; keys.add(key);
        // the first COMPLETE stance window after the reversal
        const open = {}; let got = null; const t0 = E.simTime;
        while (E.simTime - t0 < 1.4 && got === null) {
          await frame();
          for (const f of an.debugFeet()) {
            const on = f.planted && (f.world.y - T.getHeight(f.world.x, f.world.z)) <= 0.03;
            const w = open[f.name];
            if (on) { if (!w) open[f.name] = { x0: f.world.x, x1: f.world.x, z0: f.world.z, z1: f.world.z, n: 1 }; else { w.x0 = Math.min(w.x0, f.world.x); w.x1 = Math.max(w.x1, f.world.x); w.z0 = Math.min(w.z0, f.world.z); w.z1 = Math.max(w.z1, f.world.z); w.n++; } }
            else if (w) { if (w.n >= 3 && got === null) got = +Math.hypot(w.x1 - w.x0, w.z1 - w.z0).toFixed(4); open[f.name] = null; }
          }
        }
        firsts.push({ dir: key === 'KeyD' ? 'L->R' : 'R->L', drift: got });
        await simWait(0.5, 4000);
      }
      release();
      // plan §9: the first stance after EVERY reversal (targeted fix: 20 of 20
      // measured, was >= 16 — an unmeasured reversal is a FAIL, named below)
      const measured = firsts.filter((f) => f.drift !== null);
      const worst = measured.length ? Math.max(...measured.map((f) => f.drift)) : null;
      const unmeasured = firsts.map((f, i) => f.drift === null ? '#' + (i + 1) + ' ' + f.dir : null).filter(Boolean);
      const pass = firsts.length === 20 && measured.length === 20 && worst <= 0.08;
      return { pass, detail: { reversals: firsts.length, measured: measured.length, unmeasured, worstFirstStanceDriftM: worst, firsts } };
    })()`),
  },

  /* ---------------------------------------------------------- A-climb-1m */
  {
    id: 'A-climb-1m', kind: 'action', lane: 'hero-body', timeout: 120000,
    title: 'R31: mantle a 1.0 m ledge from a walk and a jog, and the trig-pillar steps, by synthesized input — on top <= 1.2 s per ledge; both palms <= 0.05 m from the edge through the WHOLE pull (the MAX, from the catch until her chest is over the edge, and the chest must get over the edge while both palms are still on it: body over the hands); no float/sink > 0.05 m after; pillar top <= 3 s',
    setup: INPUT_ON, settle: 400,
    assert: placed(['openGround'], `(async () => {${HB}
      freeze();
      const K = C.collision, T = C.terrain;
      const made = [];
      const block = (x, z, w, d, h, y0) => {
        const id = K.register({ kind: 'prop', shape: { type: 'box', c: [x, y0 + h / 2, z], half: [w / 2, h / 2, d / 2] } });
        made.push(id); return id;
      };
      const climbOnce = async (gait, rise) => {
        release();
        const o = PLACE('openGround');
        const x = o.x, z = o.z + 6;
        const gy = T.getHeight(x, z);
        const id = block(x, z + 3.5, 3.0, 2.0, rise, gy - 0.5);
        p.position.set(x, 0, z); p.velocity.set(0, 0, 0); p._snapToGround(); p.camYaw = Math.PI; p.heading = 0;
        await simWait(0.3, 3000);
        keys.add('KeyW'); if (gait === 'jog') { /* jog = default run */ } else keys.add('AltLeft');
        let t0 = null, top = null, mantled = false, clipSeen = null;
        // the pull, graded on its MAX (fix round 1): from the CATCH (both palms
        // first within 0.05 m of the edge) until the chest (spine_03) is 0.05 m
        // past the wall face — the body over the hands — every frame
        let catchK = null, overK = null, palmMax = 0, palmsAtOver = null, frames = 0;
        const s3 = new T3();
        const w0 = E.simTime;
        while (E.simTime - w0 < 6) {
          await frame();
          if (!mantled && p.position.z > z + 1.6 && !p.mantling) { C.input._press?.('Space', { code: 'Space' }); keys.delete('Space'); }
          if (p.mantling && t0 === null) { t0 = E.simTime; mantled = true; }
          if (p.mantling && p.mantleClip) clipSeen = p.mantleClip;
          if (p.mantling && overK === null) {
            const d = an.debugClimb?.(), Ed = p.mantleEdge;
            if (d && Ed?.valid) {
              const pm = Math.max(d.l, d.r), k = p.mantleK ?? 0;
              if (catchK === null && pm <= 0.05) catchK = k;
              if (catchK !== null) {
                frames++;
                if (pm > palmMax) palmMax = pm;
                an.b.spine3.bone.getWorldPosition(s3);
                const past = (s3.x - Ed.x) * Ed.dx + (s3.z - Ed.z) * Ed.dz;
                if (past >= 0.05) { overK = k; palmsAtOver = +pm.toFixed(4); }
              }
            }
          }
          if (mantled && !p.mantling && top === null) { top = E.simTime - t0; break; }
        }
        keys.clear();
        await simWait(0.4, 3000);
        const ledgeY = gy - 0.5 + rise;
        const err = p.position.y - ledgeY;
        K.unregister(id); made.splice(made.indexOf(id), 1);
        return { gait, rise: +(rise - 0.5).toFixed(2), clip: clipSeen, topS: top === null ? null : +top.toFixed(3),
          catchK: catchK === null ? null : +catchK.toFixed(3), bodyOverHandsK: overK === null ? null : +overK.toFixed(3),
          palmMaxPullM: +palmMax.toFixed(4), palmsAtBodyOverM: palmsAtOver, pullFrames: frames, standErrM: +err.toFixed(4) };
      };
      const rows = [];
      rows.push(await climbOnce('walk', 1.0 + 0.5));
      rows.push(await climbOnce('jog', 1.0 + 0.5));
      // the trig-pillar steps: three 1 m steps up a stepped plinth (fixture until world-props W1)
      release();
      const o = PLACE('openGround');
      const x = o.x, z = o.z + 6, gy = T.getHeight(x, z);
      // trig-pillar steps (fixture until world-props W1): three 1 m risers, 1.2 m treads,
      // the timer from 0.9 m short of the first riser
      const z0 = z + 0.9, TR = 1.2;
      const steps = [0, 1, 2].map((i) => K.register({ kind: 'prop', shape: { type: 'box', c: [x, gy - 0.5 + ((i + 1) + 0.5) / 2, z0 + i * TR + (3 - i) * TR / 2], half: [1.5, ((i + 1) + 0.5) / 2, (3 - i) * TR / 2] } }));
      p.position.set(x, 0, z); p.velocity.set(0, 0, 0); p._snapToGround(); p.camYaw = Math.PI; p.heading = 0;
      await simWait(0.3, 3000);
      keys.add('KeyW');
      const tp = E.simTime; let pillarTop = null;
      while (E.simTime - tp < 8) {
        await frame();
        if (!p.mantling && p.grounded) { C.input._press?.('Space', { code: 'Space' }); keys.delete('Space'); }
        if (p.position.y > gy + 2.9 && !p.mantling) { pillarTop = E.simTime - tp; break; }
      }
      release();
      for (const id of steps) K.unregister(id);
      for (const id of made) K.unregister(id);
      const pass = rows.every((r) => r.clip === 'climb1m') && rows.every((r) => r.topS !== null && r.topS <= 1.2
          && r.catchK !== null && r.catchK <= 0.25 && r.bodyOverHandsK !== null && r.pullFrames >= 5
          && r.palmMaxPullM <= 0.05 && r.palmsAtBodyOverM !== null && r.palmsAtBodyOverM <= 0.05 && Math.abs(r.standErrM) <= 0.05)
        && pillarTop !== null && pillarTop <= 3;
      return { pass, detail: { ledges: rows, pillarTopS: pillarTop === null ? null : +pillarTop.toFixed(2) } };
    })()`),
  },

  /* -------------------------------------------------------------- A-slide */
  {
    id: 'A-slide', kind: 'action', lane: 'hero-body', timeout: 150000,
    title: 'R31: run onto cinder faces at 30 and 40 deg and a 35 deg non-cinder face — a slide starts on cinder > 28 deg and not on the 35 deg non-cinder face; speed <= SLIDE_TERMINAL; exits on input within 0.3 s; planted foot within 0.08 m of the surface',
    setup: INPUT_ON, settle: 400,
    assert: `(async () => {${HB}
      freeze();
      const T = C.terrain;
      // faces of the wanted slope on THIS terrain (W0: a heightfield search), each
      // a 4 m run down its fall line; cinder is a surface patch (fixture until the Malpais, W3)
      const slopeAt = (x, z) => { const n = new T3(); T.getNormal(x, z, n); return Math.acos(Math.max(-1, Math.min(1, n.y))) * 180 / Math.PI; };
      // a deterministic grid scan of the whole play area (2.5 m), keeping the
      // spot whose fall line holds the wanted slope +-tol over a 4 m run (1 m
      // up, 3 m down) most evenly, away from standing water
      const pools = C.environment?.water?.pools || [];
      const dry = (x, z) => !pools.some((q) => ((x - q.x) / q.rx) ** 2 + ((z - q.z) / q.rz) ** 2 < 1.5);
      const find = (deg, tol) => {
        const n = new T3(); let best = null;
        for (let x = -320; x <= 320; x += 2.5) for (let z = -320; z <= 320; z += 2.5) {
          if (Math.hypot(x, z) > 318) continue;
          const a = slopeAt(x, z); if (Math.abs(a - deg) > tol) continue;
          T.getNormal(x, z, n); const l = Math.hypot(n.x, n.z); if (l < 1e-3) continue;
          const dx = n.x / l, dz = n.z / l;
          let lo = 99, hi = 0;
          for (let s = -1.0; s <= 3.0; s += 0.5) { const sd = slopeAt(x + dx * s, z + dz * s); lo = Math.min(lo, sd); hi = Math.max(hi, sd); }
          if (lo < deg - tol || hi > deg + tol || !dry(x, z)) continue;
          const spread = hi - lo + Math.abs(a - deg) * 0.5;
          if (!best || spread < best.spread) best = { x, z, dx, dz, spread };
        }
        return best;
      };
      const runs = [];
      for (const [deg, surface] of [[30, 'cinder'], [40, 'cinder'], [35, 'grass']]) {
        const f = find(deg, 3);
        if (!f) { runs.push({ deg, surface, skip: 'no ' + deg + ' deg face on this terrain' }); continue; }
        release();
        const pid = surface === 'cinder' ? p.surfaces.add({ x: f.x + f.dx * 1.2, z: f.z + f.dz * 1.2, r: 4.5, surface: 'cinder' }) : null;
        // start uphill of the face, run down it
        p.position.set(f.x - f.dx * 0.8, 0, f.z - f.dz * 0.8); p.velocity.set(0, 0, 0); p._snapToGround();
        p.camYaw = Math.atan2(f.dx, f.dz) + Math.PI;
        await simWait(0.3, 3000);
        keys.add('KeyW');
        let slid = false, vmax = 0, footErr = 0, exitS = null, t0 = E.simTime, hopT = null;
        while (E.simTime - t0 < 3.5) {
          await frame();
          if (p.sliding) {
            slid = true;
            vmax = Math.max(vmax, Math.hypot(p.velocity.x, p.velocity.z));
            for (const ft of an.debugFeet()) if (ft.planted) footErr = Math.max(footErr, Math.abs(ft.world.y - T.getHeight(ft.world.x, ft.world.z)));
            if (hopT === null && E.simTime - t0 > 1.0) { hopT = E.simTime; C.input._press?.('Space', { code: 'Space' }); keys.delete('Space'); }
          }
          if (hopT !== null && exitS === null && !p.sliding) exitS = E.simTime - hopT;
          if (exitS !== null) break;
        }
        release();
        if (pid) p.surfaces.remove(pid);
        runs.push({ deg, surface, slopeMeasured: +slopeAt(f.x, f.z).toFixed(1), slid, maxSpeed: +vmax.toFixed(2), exitS: exitS === null ? null : +exitS.toFixed(3), footErrM: +footErr.toFixed(4) });
        await simWait(0.6, 4000);
      }
      const graded = runs.filter((r) => !r.skip);
      const ok = (r) => r.surface === 'cinder'
        ? r.slid && r.maxSpeed <= ${JSON.stringify(2.6)} + 0.05 && r.exitS !== null && r.exitS <= 0.3 && r.footErrM <= 0.08
        : !r.slid;
      if (graded.length < 3) return { pass: null, detail: { verdict: 'SKIP-R18 (place): a wanted face is missing on this terrain', runs } };
      return { pass: graded.every(ok), detail: { runs, terminal: 2.6 } };
    })()`,
  },

  /* -------------------------------------------------------- A-player-mods */
  {
    id: 'A-player-mods', kind: 'action', lane: 'hero-body', timeout: 240000,
    title: 'player.mods, every field exercised through gameplay (bible §4.7 probes): a 5.5 m and a 10 m drop (fallSafe / fallLethal), a knockdown hit (knockdownMode), 20 s at 30 % HP in a fog bank (regen + regenCap), a jog on ash (noiseMul), an aim (zoom), a run onto a 35 deg face (slideDegBySurface) — each changes exactly its behaviour and resets on clear(); player.speeds deep-equals canon throughout (R16)',
    setup: INPUT_ON, settle: 400,
    assert: placed(['openGround'], `(async () => {${HB}
      freeze();
      const M = p.mods, T = C.terrain;
      if (!M || typeof M.clear !== 'function') return { pass: false, detail: 'player.mods not published' };
      const canon = JSON.stringify(p.speeds);
      let speedsDrift = 0;
      const checkSpeeds = () => { if (JSON.stringify(p.speeds) !== canon) speedsDrift++; };
      const res = {};
      /* DAMAGE SINK: the probe records what each landing deals instead of
       * letting a lethal one end the page (the fall path calls
       * takeDamage(maxHealth + 50, 'fall') for a lethal landing) */
      const realTake = p.takeDamage;
      let sink = null;
      p.takeDamage = function (amt, cause, ...rest) { if (sink) { sink.push({ amt, cause }); return; } return realTake.call(this, amt, cause, ...rest); };
      const drop = async (h) => {
        release(); standAt(p, 'openGround'); await simWait(0.3, 3000);
        p.health = p.maxHealth; sink = [];
        p.position.y += h; p.grounded = false; p.velocity.set(0, 0, 0); p._fallPeak = p.position.y; p._launchY = p.position.y;
        const t0 = E.simTime;
        while (E.simTime - t0 < 3.0) { await frame(); checkSpeeds(); if (p.grounded && E.simTime - t0 > 0.3) break; }
        await simWait(0.2, 2000);
        const fall = sink.filter((e) => e.cause === 'fall'); sink = null;
        const dmg = fall.reduce((a, e) => a + e.amt, 0);
        return { dmg: +dmg.toFixed(2), lethal: fall.some((e) => e.amt >= p.maxHealth) };
      };
      // Sure-foot (fallSafe 6, fallLethal 12): 5.5 m -> 0 damage, 10 m -> alive / canon: damage, then dead
      res.fall = { canon55: await drop(5.5), canon10: await drop(10) };
      M.fallSafe = 6; M.fallLethal = 12;
      res.fall.mod55 = await drop(5.5); res.fall.mod10 = await drop(10);
      M.clear();
      res.fall.cleared55 = await drop(5.5); res.fall.cleared10 = await drop(10);
      p.takeDamage = realTake;
      // Brace (knockdownMode 'stagger'): a knockdown-class hit is a stagger
      const hit = async () => { p.health = p.maxHealth; C.events.emit('player-damage', { amount: p.maxHealth * 0.3, from: null }); await frame(); return an.lastHitClass; };
      res.knockdown = { canon: await hit() }; await simWait(1.8, 6000);
      M.knockdownMode = 'stagger'; res.knockdown.mod = await hit(); await simWait(1.8, 6000); M.clear(); res.knockdown.cleared = await hit(); await simWait(1.8, 6000);
      // Fog-mend (regen 1 hp/s, regenCap 0.6): 20 s at 30 % HP in a fog bank
      // (world-sky's 'fogbank' weather when this tree has it), then the cap
      const env = C.environment;
      const hasFog = !!(env?.setWeather && (env.states?.fogbank || env.weatherStates?.fogbank || env._states?.fogbank));
      const prevWeather = env?.weather;
      if (hasFog) env.setWeather('fogbank', 0.01);
      const regen = async (frac, sec) => { release(); standAt(p, 'openGround'); p.health = p.maxHealth * frac; const h0 = p.health, s0 = E.simTime; await simWait(sec, sec * 1000 + 15000); checkSpeeds(); return { rate: +((p.health - h0) / (E.simTime - s0)).toFixed(3), end: +(p.health / p.maxHealth).toFixed(3) }; };
      res.regen = { canon: await regen(0.30, 20) };
      M.regen = 1; M.regenCap = 0.6;
      res.regen.mod = await regen(0.30, 20); res.regen.cap = await regen(0.56, 8);
      M.clear(); res.regen.cleared = await regen(0.30, 5);
      if (hasFog && prevWeather) env.setWeather(prevWeather, 0.01);
      p.health = p.maxHealth;
      // Ash-step (noiseMul): a jog on ash (a surface patch until the Malpais, W3)
      const jogNoise = async () => {
        release(); standAt(p, 'openGround');
        const pid = p.surfaces.add({ x: p.position.x, z: p.position.z, r: 30, surface: 'ash' });
        keys.add('KeyW'); await simWait(0.6, 5000);
        let sum = 0, n = 0, onAsh = 0; const t0 = E.simTime;
        while (E.simTime - t0 < 3) { await frame(); checkSpeeds(); sum += p.noise; n++; if (p.surface === 'ash') onAsh++; }
        release(); p.surfaces.remove(pid);
        return { noise: +(sum / Math.max(1, n)).toFixed(3), onAshFrac: +(onAsh / Math.max(1, n)).toFixed(2) };
      };
      res.noise = { canon: await jogNoise() }; M.noiseMul = 0.5; res.noise.mod = await jogNoise(); M.clear(); res.noise.cleared = await jogNoise();
      res.noise.filterHooked = typeof C.machines?.stimulus?.addNoiseFilter === 'function';
      // zoom: an aim
      const aimZoom = async () => { release(); C.input.mouse.buttons |= 4; await simWait(0.8, 5000); const z = C.camera.zoom; release(); await simWait(0.6, 4000); return { aim: +z.toFixed(3), after: +C.camera.zoom.toFixed(3) }; };
      res.zoom = { canon: await aimZoom() }; M.zoom = 2; res.zoom.mod = await aimZoom(); M.clear(); res.zoom.cleared = await aimZoom();
      // slideDegBySurface: RUN onto a 35 deg face of the terrain's own surface
      const slopeAt = (x, z) => { const n = new T3(); T.getNormal(x, z, n); return Math.acos(Math.max(-1, Math.min(1, n.y))) * 180 / Math.PI; };
      const pools = C.environment?.water?.pools || [];
      const dry = (x, z) => !pools.some((q) => ((x - q.x) / q.rx) ** 2 + ((z - q.z) / q.rz) ** 2 < 1.5);
      let f = null;
      { const n = new T3();
        for (let x = -320; x <= 320; x += 2.5) for (let z = -320; z <= 320; z += 2.5) {
          if (Math.hypot(x, z) > 318) continue;
          const a = slopeAt(x, z); if (Math.abs(a - 35) > 3) continue;
          T.getNormal(x, z, n); const l = Math.hypot(n.x, n.z); if (l < 1e-3) continue;
          const dx = n.x / l, dz = n.z / l; let lo = 99, hi = 0;
          for (let st = -1.0; st <= 3.0; st += 0.5) { const sd = slopeAt(x + dx * st, z + dz * st); lo = Math.min(lo, sd); hi = Math.max(hi, sd); }
          if (lo < 32 || hi > 38 || !dry(x, z)) continue;
          if (!f || hi - lo < f.spread) f = { x, z, dx, dz, spread: hi - lo };
        } }
      const slideRun = async () => {
        release(); p.position.set(f.x - f.dx * 0.8, 0, f.z - f.dz * 0.8); p.velocity.set(0, 0, 0); p._snapToGround();
        p.camYaw = Math.atan2(f.dx, f.dz) + Math.PI; await simWait(0.3, 3000);
        keys.add('KeyW'); let slid = false; const t0 = E.simTime;
        while (E.simTime - t0 < 2.5) { await frame(); checkSpeeds(); if (p.sliding) { slid = true; break; } }
        release(); await simWait(0.6, 4000);
        return slid;
      };
      let surf = null;
      if (f) {
        surf = p.surfaceAt(f.x, f.z) || 'default';
        res.slide = { surface: surf, faceDeg: +slopeAt(f.x, f.z).toFixed(1), canon: await slideRun() };
        M.slideDegBySurface = { [surf]: 33 }; res.slide.mod = await slideRun(); res.slide.cinderStill = p.slideDegOn('cinder');
        M.clear(); res.slide.cleared = await slideRun();
      } else res.slide = { skip: 'no 35 deg face on this terrain' };
      checkSpeeds();
      const near = (a, b, tol) => Math.abs(a - b) <= tol;
      const ok = {
        fallSafe: res.fall.canon55.dmg > 1 && res.fall.mod55.dmg === 0 && near(res.fall.cleared55.dmg, res.fall.canon55.dmg, 1),
        fallLethal: res.fall.canon10.lethal && !res.fall.mod10.lethal && res.fall.mod10.dmg > 0 && res.fall.cleared10.lethal,
        knockdown: res.knockdown.canon === 'knockdown' && res.knockdown.mod === 'stagger' && res.knockdown.cleared === 'knockdown',
        regen: Math.abs(res.regen.canon.rate) < 0.05 && near(res.regen.mod.rate, 1, 0.1) && res.regen.cap.end <= 0.605 && res.regen.cap.end >= 0.59 && Math.abs(res.regen.cleared.rate) < 0.05,
        noise: res.noise.canon.noise > 0 && res.noise.canon.onAshFrac > 0.9 && near(res.noise.mod.noise, res.noise.canon.noise * 0.5, 0.03) && near(res.noise.cleared.noise, res.noise.canon.noise, 0.03),
        zoom: near(res.zoom.canon.aim, 1, 0.01) && res.zoom.mod.aim > 1.9 && near(res.zoom.mod.after, 1, 0.05) && near(res.zoom.cleared.aim, 1, 0.01),
        slide: !!f && res.slide.canon === false && res.slide.mod === true && res.slide.cinderStill === 28 && res.slide.cleared === false,
        speeds: speedsDrift === 0,
      };
      return { pass: Object.values(ok).every(Boolean), detail: { ok, res, active: M.active(), speedsDrift,
        fogBank: hasFog ? 'staged: environment weather fogbank' : 'no fogbank weather in this tree (world-sky W1): the 20 s stand is on open ground; regen is not fog-gated on the mods surface (the Fog-mend perk sets regen inside fog)',
        noiseHook: res.noise.filterHooked ? 'noise filter hooked into stimulus' : 'stimulus.addNoiseFilter not in this tree (instruments-core W0b contract): player.noise / noiseMul published' } };
    })()`),
  },

  /* ------------------------------------------------------- A-ride-hook */
  {
    id: 'A-ride-hook', kind: 'action', lane: 'hero-body', timeout: 90000,
    title: 'player.ride on a fixture 40 m path: seated (pelvis) <= 0.05 m from the seat socket on every seated frame; the ride ends on input (player.endRide, event player-ride-end with cause input); geometries, textures and input listeners back to baseline',
    setup: INPUT_ON, settle: 400,
    assert: placed(['openGround'], `(async () => {${HB}
      freeze(); release(); standAt(p, 'openGround'); await simWait(0.4, 3000);
      if (typeof p.ride !== 'function') return { pass: false, detail: 'player.ride not published' };
      // fix round 4: the exit is \`endRide\` / 'player-ride-end' (A-no-override's
      // mechanic lexicon reserves the mount words for the removed Override)
      if (typeof p.endRide !== 'function') return { pass: false, detail: 'player.endRide not published' };
      const ends = []; const onEnd = (e) => ends.push(e && e.cause);
      C.events.on('player-ride-end', onEnd);
      const R = C.renderer.info.memory;
      const count = (m) => { let n = 0; for (const s of m.values()) n += s.size; return n; };
      const snap = () => ({ geo: R.geometries, tex: R.textures, down: count(C.input._downHandlers), up: count(C.input._upHandlers) });
      const o = PLACE('openGround'), y = C.terrain.getHeight(o.x, o.z) + 3;
      const path = [{ x: o.x, y, z: o.z }, { x: o.x, y: y + 4, z: o.z + 20 }, { x: o.x + 4, y: y + 2, z: o.z + 40 }];
      // warm-up: the SAME ride once, ended the same way, so first-use
      // allocations (the seated clip's action) and the ground the ride streams
      // in along its 20 m are not booked as a leak; then the baseline once the
      // counters have held still for 30 frames
      const settle = async () => { let s0 = snap(), still = 0; const w0 = performance.now(); while (still < 30 && performance.now() - w0 < 10000) { await frame(); const n = snap(); if (n.geo === s0.geo && n.tex === s0.tex) still++; else { still = 0; s0 = n; } } return s0; };
      { const hw = p.ride(path, { speed: 8 }); const tw = E.simTime; while (E.simTime - tw < 2.5 && p.riding) await frame();
        C.input._press?.('Space', { code: 'Space' }); keys.delete('Space'); await Promise.race([hw.done, wait(1500)]); await simWait(0.5, 3000); }
      standAt(p, 'openGround');
      const base = await settle();
      let pelvisWorst = 0, frames = 0, seatedFrames = 0;
      const h = p.ride(path, { speed: 8 });
      const t0 = E.simTime;
      while (E.simTime - t0 < 2.5 && p.riding) {
        await frame(); frames++;
        const sw = an.debugNative?.()?.sit?.w ?? 0;
        if (sw < 0.95) continue;                       // blending into the seat
        seatedFrames++;
        pelvisWorst = Math.max(pelvisWorst, WP(an.b.pelvis.bone).distanceTo(h.socket));
      }
      const seated = an.debugNative?.()?.sit?.w ?? null;
      // end the ride on input (Space)
      C.input._press?.('Space', { code: 'Space' }); keys.delete('Space');
      const cause = await Promise.race([h.done, wait(1500).then(() => 'timeout')]);
      await simWait(0.5, 3000);
      standAt(p, 'openGround');
      const after = await settle();
      C.events.off('player-ride-end', onEnd);
      const endEvents = ends.slice();
      const pass = frames > 20 && seatedFrames > 20 && pelvisWorst <= 0.05 && cause === 'input' && !p.riding
        && endEvents.length === 2 && endEvents[1] === 'input' && typeof p.dismount === 'undefined'
        && after.geo === base.geo && after.tex === base.tex && after.down === base.down && after.up === base.up;
      return { pass, detail: { frames, seatedFrames, pelvisFromSocketMaxM: +pelvisWorst.toFixed(4), seatedW: seated, cause, endEvents, noDismountName: typeof p.dismount === 'undefined', base, after } };
    })()`),
  },

  /* -------------------------------------------------- A-input-actions */
  {
    id: 'A-input-actions', kind: 'action', lane: 'hero-body', timeout: 60000,
    title: 'plant, cast, tool, slot1..4 exist with pad entries, appear in the settings rebind list, and a rebind persists across a reload (a fresh document reading the same storage)',
    setup: INPUT_ON, settle: 300,
    assert: `(async () => {
      const C = __CTX__, I = C.input;
      const mod = await import('/src/core/input.js');
      const want = ['plant', 'cast', 'tool', 'slot1', 'slot2', 'slot3', 'slot4'];
      const rows = want.map((a) => ({ a, code: I.codeFor(a), pad: mod.ACTION_PAD?.[a] ?? null, actionsTable: (mod.ACTIONS || []).includes(a) }));
      // THE RELOAD (fix round 1: constructing a second Input in the same page
      // is not a reload). Rebind through the live Input, then load a FRESH
      // document — a same-origin iframe with its own realm and module map —
      // that imports input.js anew and reads the binding back from storage.
      const before = localStorage.getItem('cal.binds.v5');
      const readFresh = () => new Promise((res) => {
        const f = document.createElement('iframe');
        f.style.cssText = 'position:fixed;left:-10px;top:-10px;width:1px;height:1px;opacity:0';
        const done = (v) => { window.removeEventListener('message', on); f.remove(); res(v); };
        const on = (e) => { if (e.source === f.contentWindow && e.data && e.data.__hbInput) done(e.data); };
        window.addEventListener('message', on);
        f.srcdoc = '<!doctype html><script type="module">import { Input } from "/src/core/input.js";'
          + 'const I = new Input(document.createElement("canvas"));'
          + 'parent.postMessage({ __hbInput: 1, plant: I.codeFor("plant"), slot3: I.codeFor("slot3"), href: location.href }, "*");<\\/script>';
        document.body.appendChild(f);
        setTimeout(() => done({ __hbInput: 1, timeout: true }), 15000);
      });
      I.bind('plant', 'KeyB'); I.bind('slot3', 'KeyK');
      const fresh1 = await readFresh();
      I.bind('plant', 'KeyX'); I.bind('slot3', 'Digit3');
      const fresh2 = await readFresh();
      if (before === null) localStorage.removeItem('cal.binds.v5'); else localStorage.setItem('cal.binds.v5', before);
      const keysOk = Object.keys(localStorage).filter((k) => k.startsWith('cal.binds')).every((k) => /^cal\\..*\\.v5$/.test(k));
      const reloadOk = fresh1.plant === 'KeyB' && fresh1.slot3 === 'KeyK' && fresh2.plant === 'KeyX' && fresh2.slot3 === 'Digit3';
      // the settings rebind list (shell-ui, W2: src/ui/settings.js reads
      // ACTIONS / ACTION_PAD) — PENDING, named, until that panel exists
      const panel = document.querySelector('[data-rebind]');
      const listed = panel ? want.filter((a) => panel.querySelector('[data-rebind="' + a + '"]')).length : null;
      const ownOk = rows.every((r) => r.code && r.pad && r.actionsTable) && reloadOk && keysOk;
      // R38 (plan §8.3): the actions, pad entries and rebind persistence are
      // binding at W0b; the settings-list clause is graded at shell-ui's W2
      // exit (reported, deferred by name, not a W0b failure) — and graded
      // here as soon as a rebind panel exists
      const pass = !ownOk ? false : panel === null ? true : listed === want.length;
      return { pass, detail: { rule: 'R38', rows, fresh1, fresh2, reloadOk, keysOk,
        settingsRebindList: panel === null ? 'DEFERRED(R38: graded at shell-ui W2 exit): no settings rebind panel in this tree; ACTIONS / ACTION_PAD are exported for it' : listed + ' of ' + want.length + ' listed',
        verdict: panel === null && ownOk ? 'PASS under R38: actions, pad entries and rebind persistence (binding); the settings-list clause deferred to shell-ui W2' : undefined } };
    })()`,
  },

  /* ---------------------------------------------------------- A-face-delta */
  {
    id: 'A-face-delta', kind: 'action', lane: 'hero-body', timeout: 30000,
    title: "Brea's face vs stock UBC at bind: >= 6 mm on >= 5 of the 7 landmarks; eye sockets <= 0.5 mm; face-profile IoU vs stock (side, 0.5 mm px, eyes-forward window) <= 0.92",
    setup: INPUT_ON, settle: 300,
    assert: `(async () => {
      const C = __CTX__, A = C.assets.models.hero;
      const F = A?.extras?.r5Face;
      if (!F) return { pass: false, detail: 'brea.glb carries no r5Face record' };
      let body = null;
      A.root.traverse((o) => { if (!body && o.isSkinnedMesh && o.geometry.getAttribute('_hidemask')) body = o; });
      const g = body.geometry, P = g.attributes.position, T3 = C.player.position.constructor;
      // the bind-pose position in the GLB's own units: the quantisation is
      // folded into the inverse bind matrices (skinned meshes cannot carry it on
      // the node), so the template's own skinning at rest IS the dequantised
      // vertex — three's SkinnedMesh.getVertexPosition on the never-animated
      // template (attached bind mode: the result is in the mesh's glTF space)
      A.root.updateMatrixWorld(true);
      const v = new T3();
      const n = P.count, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { body.getVertexPosition(i, v); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; }
      const S = F.scale;
      // each landmark: the LIVE mesh must hold a vertex at the recorded displaced
      // point (<= 0.5 mm), and its distance to the stock point is the delta
      const near = (q) => { let b = 9; for (let i = 0; i < n; i++) { const d = Math.hypot(pos[i * 3] - q[0], pos[i * 3 + 1] - q[1], pos[i * 3 + 2] - q[2]); if (d < b) b = d; } return b; };
      const rows = Object.entries(F.landmarks).map(([k, L]) => ({ k, liveVertexMm: +(near(L.now) * S * 1000).toFixed(2), deltaMm: +(Math.hypot(L.now[0] - L.stock[0], L.now[1] - L.stock[1], L.now[2] - L.stock[2]) * S * 1000).toFixed(2) }));
      const graded = rows.filter((r) => F.graded.includes(r.k));
      const big = graded.filter((r) => r.deltaMm >= 6 && r.liveVertexMm <= 0.5).length;
      // eye sockets: the recipe moves the eye mesh by the SAME field, held rigid by an
      // 18 mm falloff mask; it records the eye mesh's largest move
      const eyeMax = F.eyeSocketMaxMm ?? null;
      // profile IoU vs the stock mask the recipe stored (same window, same px)
      const W = F.window, px = F.px, Wd = Math.round((W.z1 - W.z0) / px), Ht = Math.round((W.y1 - W.y0) / px);
      const now = new Uint8Array(Wd * Ht);
      const idx = g.index.array;
      const head = new Uint8Array(n);
      const sk = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      const bones = body.skeleton.bones.map((b) => b.name);
      for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < 4; c++) { const nm = bones[sk.getComponent(i, c)]; if (nm === 'Head' || nm === 'neck_01') s += sw.getComponent(i, c); } head[i] = s > 0.5 ? 1 : 0; }
      const tri = (a, b, c) => {
        const q = [a, b, c].map((i) => [(pos[i * 3 + 2] - W.z0) / px, (W.y1 - pos[i * 3 + 1]) / px]);
        const [A0, B0, C0] = q; const ar = (B0[0] - A0[0]) * (C0[1] - A0[1]) - (C0[0] - A0[0]) * (B0[1] - A0[1]); if (Math.abs(ar) < 1e-12) return;
        const x0 = Math.max(0, Math.floor(Math.min(A0[0], B0[0], C0[0]))), x1 = Math.min(Wd - 1, Math.ceil(Math.max(A0[0], B0[0], C0[0])));
        const y0 = Math.max(0, Math.floor(Math.min(A0[1], B0[1], C0[1]))), y1 = Math.min(Ht - 1, Math.ceil(Math.max(A0[1], B0[1], C0[1])));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const qx = x + 0.5, qy = y + 0.5;
          const w0 = ((B0[0] - qx) * (C0[1] - qy) - (C0[0] - qx) * (B0[1] - qy)) / ar, w1 = ((C0[0] - qx) * (A0[1] - qy) - (A0[0] - qx) * (C0[1] - qy)) / ar;
          if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) now[y * Wd + x] = 1; }
      };
      for (let t = 0; t < idx.length; t += 3) { const a = idx[t], b = idx[t + 1], c = idx[t + 2]; if (a >= n || b >= n || c >= n) continue; if (head[a] || head[b] || head[c]) tri(a, b, c); }
      const stock = new Uint8Array(Wd * Ht); { let k = 0, cur = 0; for (const r of F.stockProfile.runs) { for (let j = 0; j < r; j++) stock[k++] = cur; cur = 1 - cur; } }
      let I = 0, U = 0; for (let k = 0; k < now.length; k++) { if (now[k] && stock[k]) I++; if (now[k] || stock[k]) U++; }
      const iou = U ? I / U : 1;
      const pass = big >= 5 && iou <= 0.92 && eyeMax !== null && eyeMax <= 0.5;
      return { pass, detail: { landmarks: rows, gradedAt6mm: big, profileIoU: +iou.toFixed(4), recipeIoU: F.iou, window: W, eyeSocketMaxMm: eyeMax } };
    })()`,
  },

  /* ------------------------------------------------------ A-brea-contrast */
  {
    id: 'A-brea-contrast', kind: 'action', lane: 'hero-body', timeout: 40000,
    title: 'Brea (default outfit, noon light) over salt crust and over black sand: silhouette mean luminance contrast >= 3.0:1 on salt; on black sand mean dE2000 >= 20 and >= 15 % of silhouette pixels at >= 3:1',
    setup: INPUT_ON, settle: 500,
    assert: `(async () => {${HB}
      freeze(); release();
      const S = await import('/src/hero/sheets.js');
      for (let i = 0; i < 10; i++) await frame();
      const cam = { pos: [0, 0.95, 4.2], target: [0, 0.9, 0], fov: 30 };
      const Wd = 240, Ht = 320;
      const mask = S.renderIsolated(C, p.model, { width: Wd, height: Ht, cam, background: null }).data;
      const salt = S.renderIsolated(C, p.model, { width: Wd, height: Ht, cam, background: '#EDEAE2' }).data;
      const sand = S.renderIsolated(C, p.model, { width: Wd, height: Ht, cam, background: '#1C1B1E' }).data;
      const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      const lum = (b, i) => 0.2126 * lin(b[i]) + 0.7152 * lin(b[i + 1]) + 0.0722 * lin(b[i + 2]);
      const lab = (r, g, b) => { let [x, y, z] = [r, g, b].map(lin); const X = (0.4124 * x + 0.3576 * y + 0.1805 * z) / 0.95047, Y = 0.2126 * x + 0.7152 * y + 0.0722 * z, Z = (0.0193 * x + 0.1192 * y + 0.9505 * z) / 1.08883;
        const f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]; };
      const de2000 = (a, b) => { const [L1, a1, b1] = a, [L2, a2, b2] = b; const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
        const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7)))); const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
        const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2); const h = (x, y) => { const t = Math.atan2(y, x) * 180 / Math.PI; return t < 0 ? t + 360 : t; };
        const h1 = h(a1p, b1), h2 = h(a2p, b2); const dL = L2 - L1, dC = C2p - C1p; let dh = h2 - h1; if (C1p * C2p === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
        const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(dh * Math.PI / 360); const Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
        let hb = h1 + h2; if (C1p * C2p !== 0) { if (Math.abs(h1 - h2) > 180) hb += h1 + h2 < 360 ? 360 : -360; hb /= 2; }
        const T = 1 - 0.17 * Math.cos((hb - 30) * Math.PI / 180) + 0.24 * Math.cos(2 * hb * Math.PI / 180) + 0.32 * Math.cos((3 * hb + 6) * Math.PI / 180) - 0.2 * Math.cos((4 * hb - 63) * Math.PI / 180);
        const SL = 1 + 0.015 * Math.pow(Lb - 50, 2) / Math.sqrt(20 + Math.pow(Lb - 50, 2)), SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T;
        const RT = -2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7))) * Math.sin(60 * Math.exp(-Math.pow((hb - 275) / 25, 2)) * Math.PI / 180);
        return Math.sqrt(Math.pow(dL / SL, 2) + Math.pow(dC / SC, 2) + Math.pow(dH / SH, 2) + RT * (dC / SC) * (dH / SH)); };
      let n = 0, lSalt = 0, lSand = 0, de = 0, hi = 0;
      const bgSalt = 0.2126 * lin(0xED) + 0.7152 * lin(0xEA) + 0.0722 * lin(0xE2), bgSand = 0.2126 * lin(0x1C) + 0.7152 * lin(0x1B) + 0.0722 * lin(0x1E);
      const labSand = lab(0x1C, 0x1B, 0x1E);
      for (let i = 0; i < Wd * Ht * 4; i += 4) {
        if (mask[i + 3] < 250) continue;
        n++; lSalt += lum(salt, i); const ls = lum(sand, i); lSand += ls;
        de += de2000(lab(sand[i], sand[i + 1], sand[i + 2]), labSand);
        if ((ls + 0.05) / (bgSand + 0.05) >= 3) hi++;
      }
      const meanSalt = lSalt / n, meanSand = lSand / n;
      const cSalt = (bgSalt + 0.05) / (meanSalt + 0.05);
      const meanDE = de / n, hiFrac = hi / n;
      const pass = n > 2000 && cSalt >= 3.0 && meanDE >= 20 && hiFrac >= 0.15;
      return { pass, detail: { silhouettePx: n, saltContrast: +cSalt.toFixed(2), sandMeanDE2000: +meanDE.toFixed(1), sandPxAt3to1: +hiFrac.toFixed(3) } };
    })()`,
  },

  /* ---------------------------------------------------------- A-hero-draws */
  {
    id: 'A-hero-draws', kind: 'action', lane: 'hero-body', timeout: 40000,
    title: 'The real W0 loadout, measured LIVE while she aims: her own body + outfit + merged stow kit <= 4 draws, <= 2 shadow casters, <= 20 k tris, each §4.1 cap met (binding, R38); with the Sabina bow in hand <= 5 main draws, <= 2 casters, <= 40 k tris (graded at armory W1 exit, R38, while combat still holds its procedural Round-4 bow)',
    setup: INPUT_ON, settle: 500,
    assert: placed(['openGround'], `(async () => {${HB}
      freeze(); standAt(p, 'openGround'); await wait(300);
      const I0 = p.hero?.info?.();
      if (!I0?.brea) return { pass: false, detail: 'Brea is not the hero' };
      // LIVE: aiming at full draw, the bow in her hand (fix round 1 — the
      // first cut measured a preview it bound itself)
      p.camPitch = 0; C.input.mouse.buttons |= 4; await simWait(0.6, 5000); C.input.mouse.buttons |= 1; await simWait(1.0, 6000);
      const J = p.hero.info();
      // the renderer's own count for the frame, scene-wide, as a cross-check
      const tri = (list) => list.reduce((s, m) => s + m.tris, 0);
      const body = J.meshes.filter((m) => m.part === 'body' && /^Brea_/.test(m.name));
      const outfit = J.meshes.filter((m) => /^outfit/.test(m.part)), kit = J.meshes.filter((m) => /^stowkit/.test(m.part));
      const held = J.meshes.filter((m) => !(m.part === 'body' && /^Brea_/.test(m.name)) && !/^outfit/.test(m.part) && !/^stowkit/.test(m.part));
      const heroMeshes = [...body, ...outfit, ...kit];
      const heroDraws = heroMeshes.length, heroCasters = heroMeshes.filter((m) => m.cast).length;
      const caps = { body: tri(body) <= 10000, outfit: tri(outfit) <= 17500, kit: tri(kit) <= 9000 };
      // the held weapon is combat's (bow.js, armory from W1): its clause is
      // graded when the Sabina GLB is what she holds
      const heldIsSabina = held.length > 0 && held.every((m) => m.part === 'held');
      const heldOk = heldIsSabina && held.length <= 1 && tri(held) <= 3000;
      const total = J.tris;
      // R38 (plan §8.3): her own measure is BINDING at W0b — <= 4 draws,
      // <= 2 casters, <= 20 k tris for body + outfit + kit (and each §4.1 cap)
      const heroTris = tri(body) + tri(outfit) + tri(kit);
      const heroOk = heroDraws <= 4 && heroCasters <= 2 && heroTris <= 20000 && caps.body && caps.outfit && caps.kit && C.combat.drawStrength > 0.9;
      const allOk = heroOk && heldOk && J.draws <= 5 && J.casters <= 2 && total <= 40000;
      release();
      /* R38: the held-weapon clause (<= 5 draws / <= 2 casters with the Sabina
       * bow in hand) is graded at armory's W1 exit; reported here, deferred by
       * name, not a W0b failure. Once the Sabina is what she holds it is
       * graded here too. */
      const pass = !heroOk ? false : (heldIsSabina ? allOk : true);
      return { pass, detail: { rule: 'R38', live: { aiming: !!p.aiming, drawS: +C.combat.drawStrength.toFixed(2), draws: J.draws, casters: J.casters, tris: total },
        hero: { draws: heroDraws, casters: heroCasters, tris: { body: tri(body), outfit: tri(outfit), kit: tri(kit), total: heroTris }, caps, binding: heroOk },
        held: { meshes: held.length, casters: held.filter((m) => m.cast).length, tris: tri(held), names: held.slice(0, 12).map((m) => m.part + ':' + m.name),
          clause: heldIsSabina ? (allOk ? 'PASS' : 'FAIL') : 'DEFERRED(R38: graded at armory W1 exit): the held bow is combat procedural Round-4 bow (' + held.length + ' meshes) until armory loads bow-sabina-v0.glb in src/combat/bow.js' },
        verdict: heldIsSabina ? undefined : 'PASS under R38: her own ' + heroDraws + ' draws / ' + heroCasters + ' casters / ' + heroTris + ' tris (binding); the held-weapon clause deferred to armory W1' } };
    })()`),
  },

  /* ---------------------------------------------------------- A-lance-stow */
  {
    id: 'A-lance-stow', kind: 'action', lane: 'hero-body', timeout: 180000,
    title: 'R10 in motion (fix round 1): the stowed Shepherd\'s Lance, measured off its own skinned vertices every frame at idle, jog, sprint, crouch (still and walking), the 1 m climb and a full draw at camPitch -0.55 / -0.4 / 0 / 0.75 — 32-40 deg from vertical at idle, jog, sprint, crouch and every draw, and through the 1 m climb A100\'s in-motion 30-60 (R10 keeps it: the press folds her trunk 85-96 deg over the ledge, where an exhaustive search finds no continuous 32-40 path that holds A100\'s bars; the share of climb frames inside 32-40 is reported), butt low at her left, blade above her right shoulder (A100: 0.20-0.70 m) and right of the spine (> 0.15 m), never ahead of the head plane, >= 0.06 m from the skull, and while drawing >= 0.06 m from the draw arm; A100\'s own bars on this lance too (midpoint <= 0.30 m from the upper back, wrap tail and knot tail >= 0.06 m from the shaft); and never inside her torso (an elliptic section 0.17 x 0.13 m round the pelvis -> neck line, tested in each segment frame where the section is a unit circle)',
    setup: INPUT_ON, settle: 400,
    assert: placed(['openGround'], `(async () => {${HB}${FLAT_STRIP}
      freeze();
      const T = C.terrain;
      const kit = p.hero?.kit?.meshes?.[0];
      if (!kit) return { pass: false, detail: 'no stow kit on the hero' };
      // the lance's butt and tip vertices (lowest / highest bind y of piece bit 1)
      const g = kit.geometry, P = g.getAttribute('_piece'), pos = g.getAttribute('position');
      let lo = -1, hi = -1;
      for (let i = 0; i < pos.count; i++) { if ((Math.round(P.getX(i)) & 1) === 0) continue; if (lo < 0 || pos.getY(i) < pos.getY(lo)) lo = i; if (hi < 0 || pos.getY(i) > pos.getY(hi)) hi = i; }
      const bt = new T3(), tp = new T3(), hc = new T3(), hf = new T3(), a0 = new T3(), a1 = new T3(), a2 = new T3(), s3 = new T3(), shR = new T3(), uL = new T3(), uR = new T3();
      const segPt = (q, A, B) => { const ab = B.clone().sub(A), t = Math.max(0, Math.min(1, q.clone().sub(A).dot(ab) / ab.lengthSq())); return A.clone().addScaledVector(ab, t).distanceTo(q); };
      const segSeg = (A, B, Cc, D) => { let m = 9; for (let i = 0; i <= 12; i++) { const q = A.clone().lerp(B, i / 12); m = Math.min(m, segPt(q, Cc, D)); } return m; };
      const rows = {};
      const sample = (tag, drawArm) => {
        if (p.hero.kit.hidden & 1) return;                       // drawn: the stowed copy is collapsed
        kit.getVertexPosition(lo, bt); kit.localToWorld(bt); const b = CH(bt);
        kit.getVertexPosition(hi, tp); kit.localToWorld(tp); const t = CH(tp);
        const R = an.skull(hc, hf), headR = Math.max(R.x, R.y, R.z);
        const d = t.clone().sub(b).normalize();
        const deg = Math.acos(Math.min(1, Math.abs(d.y))) * 180 / Math.PI;
        // her lateral axes: the shoulder line for the blade, the hip line for
        // the butt (left minus right, level) — a bladed draw turns the two apart
        an._charOf(an.b.upArmL.bone, uL); an._charOf(an.b.upArmR.bone, uR); an._charOf(an.b.spine3.bone, s3);
        const lat = uL.clone().sub(uR); lat.y = 0; lat.normalize();
        an._charOf(an.b.thighL.bone, a0); an._charOf(an.b.thighR.bone, a1);
        const latH = a0.clone().sub(a1); latH.y = 0; latH.normalize();
        an._charOf(an.b.pelvis.bone, a2);
        const buttLeft = b.clone().sub(a2).dot(latH), tipRight = -t.clone().sub(s3).dot(lat);
        // A100's upper-back centre: the SURFACE, spine_03 pushed 0.13 m back
        // along the trunk's forward (shoulder line x pelvis->neck)
        an._charOf(an.b.neck1.bone, a1);
        const Ut = a1.clone().sub(a2).normalize(), Ft = new T3().crossVectors(lat, Ut).normalize();
        const backC = s3.clone().addScaledVector(Ft, -0.13);
        const aboveSh = t.y - uR.y;
        const rel = t.clone().sub(hc);
        const ahead = Math.max(rel.dot(hf), rel.z);              // > 0: ahead of the head's frontal plane
        const headGap = segPt(hc, b.clone().lerp(t, 0.45), t) - headR;
        let armGap = null;
        if (drawArm) { an._charOf(an.b.upArmR.bone, a0); an._charOf(an.b.loArmR.bone, a1); an._charOf(an.b.handR.bone, a2); armGap = Math.min(segSeg(b, t, a0, a1), segSeg(b, t, a1, a2)) - 0.05; }
        // A100's bars on THIS lance: midpoint <= 0.30 m from the upper-back
        // centre (spine_03); the wrap tail and the knot tail >= 0.06 m from the
        // shaft (their segments vs the lance axis, less the shaft's radius)
        const mid = b.clone().lerp(t, 0.5).distanceTo(backC);
        let tailGap = 9;
        for (const cls of ['hair', 'cloth', 'wrap']) {     // fix round 4: the wrap tail is class 'wrap'
          const ch = an.chainOf?.(cls) || [];
          for (let i = 0; i + 1 < ch.length; i++) { an._charOf(ch[i], a0); an._charOf(ch[i + 1], a1); tailGap = Math.min(tailGap, segSeg(a0, a1, b, t) - 0.0145); }
        }
        // her torso: an elliptic section (0.17 m to the side, 0.13 m front / back)
        // round the pelvis -> spine_01 -> spine_02 -> spine_03 -> neck line; the
        // shaft stays outside it (the climb swings the lance round her flank)
        const spine = [new T3(), new T3(), new T3(), new T3(), new T3()];
        an._charOf(an.b.pelvis.bone, spine[0]); an._charOf(an.b.spine1.bone, spine[1]); an._charOf(an.b.spine2.bone, spine[2]);
        an._charOf(an.b.spine3.bone, spine[3]); an._charOf(an.b.neck1.bone, spine[4]);
        // per spine segment, the shaft taken into the segment's frame
        // scaled by the section (the section becomes the unit circle), then
        // the closest distance to the axis segment (sampled shafts missed
        // the thin crossings)
        let torso = 9;
        for (let j = 0; j + 1 < spine.length; j++) {
          const A0 = spine[j], ax = spine[j + 1].clone().sub(A0), len = ax.length();
          if (len < 1e-4) continue;
          ax.divideScalar(len);
          const l1 = lat.clone().addScaledVector(ax, -lat.dot(ax)).normalize(), l2 = new T3().crossVectors(ax, l1);
          const tr = (q) => { const r0 = q.clone().sub(A0); return new T3(r0.dot(ax), r0.dot(l1) / 0.17, r0.dot(l2) / 0.13); };
          const z0 = tr(b), z1 = tr(t);
          // clip the shaft to the segment's span (the torso ends at the pelvis
          // and the neck), then its distance from the axis in the section plane
          let m = 9;
          for (let i = 0; i <= 400; i++) { const q = z0.clone().lerp(z1, i / 400); if (q.x < 0 || q.x > len) continue; m = Math.min(m, Math.hypot(q.y, q.z)); }
          torso = Math.min(torso, m);
        }
        const r = rows[tag] || (rows[tag] = { n: 0, degMin: 99, degMax: 0, in3240: 0, buttLeftMin: 9, buttLowMin: 9, tipRightMin: 9, aboveShMin: 9, aboveShMax: -9, aheadMax: -9, headGapMin: 9, midMax: 0, tailGapMin: 9, torsoMin: 9, armGapMin: drawArm ? 9 : null });
        if (deg >= 32 && deg <= 40) r.in3240++;
        r.midMax = Math.max(r.midMax, mid); r.tailGapMin = Math.min(r.tailGapMin, tailGap); r.torsoMin = Math.min(r.torsoMin, torso);
        r.n++; r.degMin = Math.min(r.degMin, deg); r.degMax = Math.max(r.degMax, deg);
        r.buttLeftMin = Math.min(r.buttLeftMin, buttLeft); r.buttLowMin = Math.min(r.buttLowMin, t.y - b.y);
        r.tipRightMin = Math.min(r.tipRightMin, tipRight); r.aboveShMin = Math.min(r.aboveShMin, aboveSh); r.aboveShMax = Math.max(r.aboveShMax, aboveSh);
        r.aheadMax = Math.max(r.aheadMax, ahead); r.headGapMin = Math.min(r.headGapMin, headGap);
        if (drawArm) r.armGapMin = Math.min(r.armGapMin, armGap);
      };
      const run = async (tag, sec, drawArm = false) => { const t0 = E.simTime; while (E.simTime - t0 < sec) { await frame(); sample(tag, drawArm); } };
      const fs = flatStrip(46);
      const home = () => { release(); p.setCrouch?.(false); if (fs) { p.position.set(fs.x, 0, fs.z); p.camYaw = fs.yaw; } else standAt(p, 'openGround'); p.velocity.set(0, 0, 0); p._snapToGround(); p.camPitch = 0; };
      home(); await simWait(0.8, 5000); await run('idle', 1.0);
      home(); await simWait(0.3, 3000); keys.add('KeyW'); await simWait(1.0, 6000); await run('jog', 2.0);
      home(); await simWait(0.3, 3000); keys.add('KeyW'); keys.add('ShiftLeft'); await simWait(1.2, 6000); await run('sprint', 2.5);
      home(); await simWait(0.3, 3000); p.setCrouch(true); await simWait(0.8, 5000); await run('crouch', 1.0);
      keys.add('KeyW'); await simWait(0.6, 5000); await run('crouchWalk', 2.0);
      home(); await simWait(0.6, 4000);
      // the 1 m climb (A-climb-1m's fixture)
      { const K = C.collision; const o = PLACE('openGround'); const x = o.x, z = o.z + 6, gy = T.getHeight(x, z);
        const id = K.register({ kind: 'prop', shape: { type: 'box', c: [x, gy + 0.25, z + 3.5], half: [1.5, 0.75, 1.0] } });
        p.position.set(x, 0, z); p.velocity.set(0, 0, 0); p._snapToGround(); p.camYaw = Math.PI; p.heading = 0; await simWait(0.3, 3000);
        keys.add('KeyW'); const w0 = E.simTime; let went = false;
        while (E.simTime - w0 < 5) { await frame(); if (!p.mantling && !went && p.position.z > z + 1.6) { C.input._press?.('Space', { code: 'Space' }); keys.delete('Space'); } if (p.mantling) { went = true; sample('climb', false); } else if (went) break; }
        release(); K.unregister(id); }
      for (const pitch of ${JSON.stringify(GATE_PITCHES)}) {
        home(); await simWait(0.4, 3000); p.camPitch = pitch; C.input.mouse.buttons |= 4; await simWait(0.6, 4000); C.input.mouse.buttons |= 1; await simWait(1.0, 6000);
        p.camPitch = pitch; await run('draw' + pitch, 0.8, true);
      }
      release();
      const fails = [];
      for (const [tag, r] of Object.entries(rows)) {
        if (r.n < 5) fails.push(tag + ': ' + r.n + ' samples');
        // R10's 32-40 in every state but the 1 m climb, which holds A100's
        // in-motion 30-60 (R10: "A100's 30-60 band ... stand"): its press folds
        // her trunk 85-96 deg over the ledge, where an exhaustive search of
        // every lance line (32-40, every azimuth, every midpoint within 0.30 m
        // of the upper back) finds 0-29 poses of ~140 000 that hold A100's
        // bars and clear the torso, arms and thighs, in disjoint families
        const [dLo, dHi] = tag === 'climb' ? [30, 60] : [32, 40];
        if (r.degMin < dLo || r.degMax > dHi) fails.push(tag + ': ' + r.degMin.toFixed(1) + '-' + r.degMax.toFixed(1) + ' deg (' + dLo + '-' + dHi + ')');
        if (!(r.buttLeftMin > 0)) fails.push(tag + ': butt not at her left (' + r.buttLeftMin.toFixed(3) + ')');
        if (!(r.buttLowMin > 0.5)) fails.push(tag + ': butt not low');
        if (!(r.tipRightMin > 0.15)) fails.push(tag + ': blade ' + r.tipRightMin.toFixed(3) + ' m right of the spine (> 0.15)');
        if (!(r.aboveShMin > 0.20 && r.aboveShMax <= 0.70)) fails.push(tag + ': blade ' + r.aboveShMin.toFixed(3) + '-' + r.aboveShMax.toFixed(3) + ' m over the right shoulder (0.20-0.70)');
        if (!(r.aheadMax <= 0)) fails.push(tag + ': blade ' + r.aheadMax.toFixed(3) + ' m AHEAD of the head plane');
        if (!(r.headGapMin >= 0.06)) fails.push(tag + ': ' + r.headGapMin.toFixed(3) + ' m from the skull (>= 0.06)');
        if (r.armGapMin !== null && !(r.armGapMin >= 0.06)) fails.push(tag + ': ' + r.armGapMin.toFixed(3) + ' m from the draw arm (>= 0.06)');
        if (!(r.midMax <= 0.30)) fails.push(tag + ': midpoint ' + r.midMax.toFixed(3) + ' m from the upper back (<= 0.30, A100)');
        if (!(r.tailGapMin >= 0.06)) fails.push(tag + ': wrap/knot tail ' + r.tailGapMin.toFixed(3) + ' m from the shaft (>= 0.06, A100)');
        if (!(r.torsoMin >= 1)) fails.push(tag + ': the shaft passes inside her torso (section ratio ' + r.torsoMin.toFixed(2) + ' < 1)');
      }
      for (const r of Object.values(rows)) r.in3240 = +(r.in3240 / Math.max(1, r.n)).toFixed(3);
      const round = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(3) : v]));
      const states = ['idle', 'jog', 'sprint', 'crouch', 'crouchWalk', 'climb', ...${JSON.stringify(GATE_PITCHES)}.map((x) => 'draw' + x)];
      const missing = states.filter((s) => !rows[s]);
      return { pass: fails.length === 0 && missing.length === 0, detail: { fails, missing, rows: Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, round(v)])), carry: p.hero.kit.carryInfo?.() } };
    })()`),
  },

  /* ------------------------------------------------ A-outfit-merge-dispose */
  {
    id: 'A-outfit-merge-dispose', kind: 'action', lane: 'hero-body', timeout: 60000,
    title: 'Equip/unequip the default outfit, re-socket the forearm kit (the bracer piece; the Windwall lands W2) and rebuild the stow kit x6: geometries, textures and skeletons back to baseline (+-0)',
    setup: INPUT_ON, settle: 500,
    assert: `(async () => {${HB}
      freeze();
      const H = p.hero, R = C.renderer.info.memory;
      if (!H?.outfit) return { pass: false, detail: 'no hero outfit system' };
      const skels = () => { const s = new Set(); p.model.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) s.add(o.skeleton); }); return s.size; };
      const BR = H.kit?.constructor?.PIECE?.bracer ?? 8;
      const cycle = async () => {
        H.unequip(); await frame(); await frame();
        const off = { geo: R.geometries, tex: R.textures, skel: skels() };
        H.equip('heroOutfitPan1'); await frame(); await frame();
        H.kit.setHidden(BR); await frame(); H.kit.setHidden(0); await frame();     // the forearm socket swap
        H.kit.detach(); await frame(); H.kit.attach(); await frame(); await frame();
        return off;
      };
      // warm-up cycle (first-use shader/program work is not a leak), then the
      // baseline once the counters have held still for 30 frames (streamed
      // world content is still arriving in the first seconds of a page)
      await cycle();
      let base = { geo: R.geometries, tex: R.textures }, still = 0; const w0 = performance.now();
      while (still < 30 && performance.now() - w0 < 12000) { await frame(); if (R.geometries === base.geo && R.textures === base.tex) still++; else { still = 0; base = { geo: R.geometries, tex: R.textures }; } }
      base = { geo: R.geometries, tex: R.textures, skel: skels(), outfit: H.outfit.row, settledFrames: still };
      const trace = [];
      for (let i = 0; i < 6; i++) trace.push({ off: await cycle() });
      await wait(200);
      const end = { geo: R.geometries, tex: R.textures, skel: skels(), outfit: H.outfit.row };
      const pass = still >= 30 && end.geo === base.geo && end.tex === base.tex && end.skel === base.skel && end.outfit === base.outfit
        && trace.every((t) => t.off.skel === base.skel - 1);
      return { pass, detail: { base, end, trace: trace.slice(0, 2), bodyHiddenTris: H.outfit.info().bodyHiddenTris } };
    })()`,
  },

  /* ------------------------------------------------------ A-melee-floor (R47) */
  {
    id: 'A-melee-floor', kind: 'action', lane: 'hero-body', timeout: 120000,
    title: 'R47 floor: on Brea, light x3, a heavy (held LMB), the melee-ready key and a block press (RMB) throw nothing (no error event, rejection or console error); light1-3 each reach stance swing with a swing active (the combo count >= i by the end of light i) and the heavy fires a new swing that is a heavy (targeted fix: the swings asserted, not only reported); afterwards a valid locomotion state — not aiming, no swing active, bones finite, and she then walks, jogs and sprints at canon speed with her feet alternating',
    setup: INPUT_ON, settle: 400,
    assert: placed(['openGround'], `(async () => {${HB}${CANON_SPEEDS}${FLAT_STRIP}
      freeze(); release();
      // a flat, clear, dry 46 m strip (the W0 openGround climbs a rise 28 m out,
      // inside a sprint's window); the combo is thrown at its start
      const fs = flatStrip(46);
      if (!fs) return { pass: null, detail: 'SKIP-R18 (place): no flat, clear 46 m strip' };
      const toStart = () => { p.position.set(fs.x, 0, fs.z); p.velocity.set(0, 0, 0); p._snapToGround(); p.camYaw = fs.yaw; p.camPitch = 0; p.heading = fs.yaw + Math.PI; };
      toStart(); await simWait(0.6, 5000);
      const M = cmb.melee;
      if (!M || typeof M.swing !== 'function') return { pass: null, detail: 'SKIP: no combat.melee' };
      const errs = [];
      const onErr = (e) => errs.push('error: ' + String(e.message || e.reason || e));
      window.addEventListener('error', onErr); window.addEventListener('unhandledrejection', onErr);
      const ce = console.error; console.error = (...a) => { errs.push('console: ' + a.map(String).join(' ').slice(0, 200)); ce.apply(console, a); };
      const finite = () => { let bad = 0; p.model.traverse((o) => { if (o.isBone) { const q = o.quaternion, v = o.position; if (![q.x, q.y, q.z, q.w, v.x, v.y, v.z].every(Number.isFinite)) bad++; } }); return bad; };
      const beats = [];
      const click = async (ms) => { C.input.mouse.buttons |= 1; await wait(ms); C.input.mouse.buttons &= ~1; };
      /* targeted fix (judge r2: "A-melee-floor never asserts a swing happened"):
       * every rendered frame of each beat's window is sampled — the frames in
       * stance 'swing' with a swing active (and of those, heavy), and the
       * swing counter (combat.melee.audit().swings, +1 per fired swing) at the
       * window's start and end. Graded below: light1-3 each reach 'swing'
       * with the combo's count at >= i by the end of light i; the heavy fires
       * a NEW swing that is a heavy. */
      const swings = () => (typeof M.audit === 'function' ? M.audit().swings : (M._stats?.swings ?? 0));
      let cur = null, samp = true;
      const tick = () => { if (!samp) return; if (cur && M.stance === 'swing' && M.active) { cur.swingFrames++; if (M.heavy) cur.heavyFrames++; } if (cur) cur.frames++; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      const beat = async (name, fn) => {
        cur = { beat: name, frames: 0, swingFrames: 0, heavyFrames: 0, swings0: swings() };
        try { await fn(); } finally { const b = cur; cur = null; b.swings1 = swings(); b.newSwings = b.swings1 - b.swings0; b.stance = M.stance; b.active = !!M.active; beats.push(b); }
      };
      let after = null, combo0 = 0;
      try {
        // light x3 (a combo), each click then its swing's time
        combo0 = swings();
        for (let i = 0; i < 3; i++) await beat('light' + (i + 1), async () => { await click(90); await simWait(0.5, 6000); });
        await simWait(0.9, 8000);
        // heavy: LMB held past the charge
        await beat('heavy', async () => { await click(700); await simWait(1.5, 12000); });
        // the melee-ready key (draw / holster the lance)
        keys.add('KeyB'); await frame(); await frame(); keys.delete('KeyB'); await simWait(0.6, 6000); beats.push({ beat: 'readyKey', stance: M.stance });
        // block: RMB (the guard press; with the Round-4 kit it raises the bow)
        C.input.mouse.buttons |= 4; await simWait(0.8, 8000); beats.push({ beat: 'block', aiming: !!p.aiming, stance: M.stance });
        C.input.mouse.buttons &= ~4; await simWait(0.8, 8000);
        after = { aiming: !!p.aiming, swinging: !!M.active, stance: M.stance, dodging: !!p.dodging, health: p.health, nonFinite: finite() };
      } finally {
        samp = false;
        console.error = ce; window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onErr);
        release();
      }
      // the locomotion state afterwards: walk (Alt), jog, sprint from a standstill
      // each gait from a standstill at the strip's start: the speed is the MEDIAN
      // over its last second (sim), not one sampled frame
      const gait = async (ks, sec) => {
        release(); await simWait(0.3, 4000); toStart(); await simWait(0.4, 4000);
        for (const k of ks) keys.add(k);
        let top = 0, plants = 0, prev = null;
        const late = [];
        const s0 = E.simTime;
        while (E.simTime - s0 < sec) {
          await frame();
          top = Math.max(top, p.moveSpeed);
          if (E.simTime - s0 > sec - 1) late.push(p.moveSpeed);
          const f = an.debugFeet(); const pl = f.map((x) => x.planted ? 1 : 0).join('');
          if (prev !== null && pl !== prev) plants++;
          prev = pl;
        }
        late.sort((a, b) => a - b);
        const dom = an.dominantAction?.();
        const r = { keys: ks.join('+'), speed: +(late.length ? late[late.length >> 1] : p.moveSpeed).toFixed(2), top: +top.toFixed(2), footChanges: plants, dominant: dom ? dom.clip : null };
        release();
        return r;
      };
      const walk = await gait(['KeyW', 'AltLeft'], 1.6);
      const jog = await gait(['KeyW'], 1.8);
      const sprint = await gait(['KeyW', 'ShiftLeft'], 2.4);
      const bad = [];
      if (errs.length) bad.push('threw: ' + errs.slice(0, 3).join(' | '));
      if (!after) bad.push('the combo did not complete');
      for (let i = 1; i <= 3; i++) {
        const b = beats.find((x) => x.beat === 'light' + i);
        if (!b) { bad.push('light' + i + ': no beat'); continue; }
        if (!(b.swingFrames > 0)) bad.push('light' + i + ': never reached stance swing with a swing active (' + b.frames + ' frames sampled)');
        if (!(b.swings1 - combo0 >= i)) bad.push('light' + i + ': ' + (b.swings1 - combo0) + ' swing(s) fired by the end of its window (want >= ' + i + ')');
      }
      {
        const h = beats.find((x) => x.beat === 'heavy');
        if (!h) bad.push('heavy: no beat');
        else {
          if (!(h.newSwings >= 1)) bad.push('heavy: no new swing activation (' + h.newSwings + ' fired in its window)');
          if (!(h.heavyFrames > 0)) bad.push('heavy: no frame with a HEAVY swing active');
        }
      }
      if (after) {
        if (after.aiming) bad.push('still aiming after the block was released');
        if (after.swinging) bad.push('a swing is still active');
        if (after.nonFinite) bad.push(after.nonFinite + ' non-finite bones');
        if (!(after.health > 0)) bad.push('dead');
      }
      if (!(walk.speed >= 0.8 * (SPD.walk || 1.5) && walk.footChanges >= 2)) bad.push('walk ' + walk.speed + ' m/s, ' + walk.footChanges + ' foot changes');
      if (!(jog.speed >= JOG_MIN && jog.footChanges >= 2)) bad.push('jog ' + jog.speed + ' m/s (floor ' + JOG_MIN.toFixed(2) + '), ' + jog.footChanges + ' foot changes');
      if (!(sprint.speed >= SPRINT_MIN && sprint.footChanges >= 2)) bad.push('sprint ' + sprint.speed + ' m/s (floor ' + SPRINT_MIN.toFixed(2) + '), ' + sprint.footChanges + ' foot changes');
      return { pass: bad.length === 0, detail: { rule: 'R47', bad, beats, after, errors: errs.length, walk, jog, sprint } };
    })()`),
  },

  /* ----------------------------------------------------- A-tail-legible */
  {
    id: 'A-tail-legible', kind: 'action', lane: 'hero-body', timeout: 240000,
    title: 'V-brea-one-glance cue 2 MEASURED (fix round 5, judge r2: "the wrap tail cannot be separated from the stowed bow\'s upper limb" at 64 px). W0b targeted fix: the draft bar restored — graded at the sheet\'s instant AND at every gust moment, not only the sheet\'s. On the silhouette sheet\'s own staging (the neutral idle, facing N in the NE trade wind) and lens (56 x 82 px black fill, ortho 2.3 m), front / side (her right) / back / side (her left): the pixels only the wrap tail covers (the view rendered again with the tail collapsed into its knot) include >= 4 standing >= 3 px clear of every other part of the silhouette (bow, lance, head, body) AND the tail reaches >= 4 px out — at the sheet\'s instant and at 23 gust moments after it (every 0.35 s of SIM for 8 s: the trade wind\'s slowest gust swell is 7.6 s long). Reported with numbers, not graded: her idle head scan both ways (the fidget that turns the neck and head 0.5 rad; 2 scans each way x 3 instants), still air (after 3 s, then every 0.5 s for 2 s) and the 3/4 view',
    setup: INPUT_ON, settle: 400,
    assert: `(async () => {${HB}
      freeze();
      release(); p.position.set(-157, 0, 81); p.velocity.set(0, 0, 0); p._snapToGround?.();
      const s = await import('/src/hero/sheets.js');
      const VIEWS = ['FRONT', 'SIDE (her right)', 'BACK', 'SIDE (her left)'];
      const BAR = { clear3: 4, reach: 4 };
      const pick = (rows) => rows.map((r) => ({ ...r, ok: r.clear3 >= BAR.clear3 && r.reach >= BAR.reach }));
      const TRADE = [45 * Math.PI / 180, 5.5, 0.35, 0.32];   // the default world wind (bible §2.2)
      // the sheet's own hold (facing N, the neutral idle), stepped on the SIM
      // clock: poseIdle waits >= 20 rendered frames, so on a slow box its
      // 0.35 s ran ~0.9 s of sim
      const hold = async (sec) => { const s0 = E.simTime, w0 = performance.now(); while (E.simTime - s0 < sec && performance.now() - w0 < 10000) { p.heading = Math.PI; await frame(); } p.heading = Math.PI; };
      const headYaw = () => { const T = s.THREE, hf = new T.Vector3(0, 0, 1).applyQuaternion(an.b.head.bone.getWorldQuaternion(new T.Quaternion())).applyQuaternion(p.model.getWorldQuaternion(new T.Quaternion()).invert()); return +(Math.atan2(hf.x, hf.z) * 180 / Math.PI).toFixed(1); };
      an.setWind(...TRADE);
      const graded = [], scan = [], calm = [];
      try {
        // the sheet's instant (silhouetteSheetOverlay's own staging: 1.5 s of the neutral idle facing N)
        await s.poseIdle(C, 1.5);
        graded.push({ at: 'sheet', t: +E.simTime.toFixed(2), yaw: headYaw(), rows: pick(s.tailLegibility(C)) });
        // the gust moments: every 0.35 s of sim for 8 s after it, the same
        // neutral idle the sheet shows (its fidgets held, as poseIdle holds them)
        an._fidgetK = 1; an._fidgetT = 1e9;
        for (let k = 1; k <= 23; k++) {
          await hold(0.35);
          graded.push({ at: '+' + (0.35 * k).toFixed(2), t: +E.simTime.toFixed(2), yaw: headYaw(), rows: pick(s.tailLegibility(C)) });
        }
        // REPORTED: the idle head scan (_idleLife fidget 0: she scans the side
        // she is not weighted onto) — the weight-shift phase picks the side,
        // twice each way; sampled 0.5 / 0.8 / 1.1 s into the 1.6 s scan
        for (const ph of [0.25, 0.75, 0.25, 0.75]) {
          an._shiftPh = ph; await hold(1.2);
          an._fidgetK = 0; an._fidgetKind = 0; an._fidgetT = 1e9;
          for (const dt of [0.5, 0.3, 0.3]) {
            await hold(dt);
            const yaw = headYaw();   // > 0: turned to her left (model +X)
            scan.push({ at: 'scan-' + (yaw > 0 ? 'left' : 'right') + '+' + (+(an._fidgetK * 1.6).toFixed(2)) + 's', t: +E.simTime.toFixed(2), yaw, rows: pick(s.tailLegibility(C)) });
          }
          await hold(0.7);
        }
        // REPORTED: still air
        an.setWind(0, 0, 0, 0);
        await hold(3.0);
        calm.push({ at: 'calm+3.0', rows: pick(s.tailLegibility(C)) });
        for (let k = 1; k <= 4; k++) { await hold(0.5); calm.push({ at: 'calm+' + (3 + 0.5 * k).toFixed(1), rows: pick(s.tailLegibility(C)) }); }
      } finally {
        an.setWind(...TRADE); an._fidgetK = 1; an._fidgetT = 6;
      }
      const bad = [];
      for (const m of graded) for (const r of m.rows) if (VIEWS.includes(r.view) && !r.ok) bad.push(m.at + ' ' + r.view + ': ' + r.tailPx + ' tail px, ' + r.clear3 + ' px >= 3 clear, reach ' + r.reach);
      // the numbers per view: min / median / max over the graded moments, the scans, and still air
      const stat = (list, view, key) => { const v = list.map((m) => m.rows.find((r) => r.view === view)?.[key]).filter((x) => x != null).sort((a, b) => a - b); return v.length ? [v[0], v[v.length >> 1], v[v.length - 1]] : null; };
      const summary = {};
      for (const view of [...VIEWS, '3/4']) summary[view] = {
        graded: { clear3: stat(graded, view, 'clear3'), reach: stat(graded, view, 'reach'), tailPx: stat(graded, view, 'tailPx') },
        headScan: { clear3: stat(scan, view, 'clear3'), reach: stat(scan, view, 'reach'), tailPx: stat(scan, view, 'tailPx') },
        calm: { clear3: stat(calm, view, 'clear3'), reach: stat(calm, view, 'reach'), tailPx: stat(calm, view, 'tailPx') },
      };
      const below = (list) => { const o = []; for (const m of list) for (const r of m.rows) if (VIEWS.includes(r.view) && !r.ok) o.push(m.at + (m.yaw != null ? ' (head ' + m.yaw + ' deg)' : '') + ' ' + r.view + ': ' + r.clear3 + ' px >= 3 clear, reach ' + r.reach); return o; };
      const failMoments = [...new Set(bad.map((b) => b.split(' ')[0]))];
      const short = (rows) => rows.map((r) => r.view[0] + (r.view.includes('right') ? 'R' : r.view.includes('left') ? 'L' : '') + ':' + r.clear3 + '/' + r.reach).join(' ');
      return { pass: bad.length === 0 && graded.length === 24, detail: {
        graded: 'the sheet instant + 23 gust moments (every 0.35 s sim) x 4 views: clear3 >= 4 and reach >= 4',
        moments: graded.length, failingMoments: failMoments.length, bad, summaryMinMedMax: summary,
        headScanBelowBar: below(scan), headScanMomentsBelow: scan.filter((m) => m.rows.some((r) => VIEWS.includes(r.view) && !r.ok)).length + ' of ' + scan.length,
        calmBelowBar: below(calm),
        gradedMoments: graded.map((m) => ({ at: m.at, t: m.t, headYawDeg: m.yaw, v: short(m.rows) })),
        headScan: scan.map((m) => ({ at: m.at, t: m.t, headYawDeg: m.yaw, v: short(m.rows) })), calm: calm.map((m) => ({ at: m.at, v: short(m.rows) })) } };
    })()`,
  },

  /* ------------------------------------------------------- A-strafe-feet */
  {
    id: 'A-strafe-feet', kind: 'action', lane: 'hero-body', timeout: 120000,
    title: 'V13 action twin (fix round 5, judge r2: "the right swing foot snaps ~90 deg in yaw at the top of every aim side-step swing"): the aim side-step, on EVERY frame with one foot planted and the other in the air, 3 s to her LEFT and 3 s to her RIGHT — the swing foot\'s heading (read off its lateral axis, so a toe-down foot still has one) within 20 deg of the planted foot\'s, both feet within 30 deg of the travel line, the swing foot\'s ankle -> toe-tip line <= 0.45 rad below the horizontal and its toe tip not under the ground; and the same on V13\'s own filmed frame (strafing left, the right swing foot at the top of its swing)',
    setup: INPUT_ON, settle: 400,
    assert: placed(['openGround'], `(async () => {${HB}
      freeze();
      const T = C.terrain, Qc = p.model.quaternion.constructor, D = 180 / Math.PI;
      const tip = (e) => (e.bone.children || []).find((o) => o.isBone) || e.bone;
      const F = [[an.b.footL, tip(an.b.ballL)], [an.b.footR, tip(an.b.ballR)]];
      // each foot's lateral axis in its own frame: the local axis that is char +X at its BIND orientation
      const latLoc = F.map(([f]) => new T3(1, 0, 0).applyQuaternion(f.W.clone().invert()));
      const wrapD = (a) => { while (a > 180) a -= 360; while (a < -180) a += 360; return a; };
      const meas = (sd) => {
        const [f, tp] = F[sd];
        const inv = p.model.getWorldQuaternion(new Qc()).invert();
        const lat = latLoc[sd].clone().applyQuaternion(f.bone.getWorldQuaternion(new Qc()).premultiply(inv));
        const aw = WP(f.bone), tw = WP(tp);
        const d = CH(tw).sub(CH(aw)), dl = d.length();
        return { hdg: Math.atan2(-lat.z, lat.x) * D, pitch: Math.asin(-d.y / dl), toeH: tw.y - T.getHeight(tw.x, tw.z), ankH: aw.y - T.getHeight(aw.x, aw.z) };
      };
      const travel = () => { const lv = CH(p.position.clone().add(p.velocity)).sub(CH(p.position.clone())); return Math.atan2(lv.x, lv.z) * D; };
      const row = (sw) => { const S = meas(sw), P = meas(1 - sw), tr = travel();
        return { sw, dYaw: Math.abs(wrapD(S.hdg - P.hdg)), offS: Math.abs(wrapD(S.hdg - tr)), offP: Math.abs(wrapD(P.hdg - tr)), pitch: S.pitch, toeH: S.toeH, ankH: S.ankH }; };
      const run = async (key, sec) => {
        release(); standAt(p, 'openGround'); p.camPitch = 0; p.velocity.set(0, 0, 0); await simWait(0.5, 4000);
        const rows = []; const t0 = E.simTime; let aimF = 0;
        while (E.simTime - t0 < sec + 0.9) {
          C.input.mouse.buttons |= 4; keys.add(key);
          await frame();
          if (E.simTime - t0 < 0.9) continue;
          if (!p.aiming) continue;
          aimF++;
          const pl = an.debugFeet().map((x) => x.planted);
          if (pl[0] === pl[1]) continue;
          rows.push(row(pl[0] ? 1 : 0));
        }
        release();
        return { rows, aimF };
      };
      const L = await run('KeyA', 3.0), R = await run('KeyD', 3.0);
      // V13's own frame: standAt, aim + strafe left for 2.4 + 0.9 s, then the first
      // frame the RIGHT (trailing) foot stops rising in the air — V13 freezes there
      const filmed = await (async () => {
        release(); standAt(p, 'openGround'); p.camPitch = 0; p.velocity.set(0, 0, 0); await simWait(0.4, 3000);
        const t0 = E.simTime; let hPrev = -1, got = null;
        while (E.simTime - t0 < 8 && !got) {
          C.input.mouse.buttons |= 4; keys.add('KeyA');
          await frame();
          if (E.simTime - t0 < 3.3) continue;
          const fs = an.debugFeet(), h = meas(1).ankH;
          if (!fs[1].planted && fs[0].planted && hPrev > 0.12 && h <= hPrev) got = row(1);
          hPrev = fs[1].planted ? -1 : h;
        }
        release();
        return got;
      })();
      const summ = (rows) => rows.length ? { lifted: rows.length, dYawMax: +Math.max(...rows.map((r) => r.dYaw)).toFixed(1), offTravelMax: +Math.max(...rows.map((r) => Math.max(r.offS, r.offP))).toFixed(1),
        pitchMax: +Math.max(...rows.map((r) => r.pitch)).toFixed(3), toeMin: +Math.min(...rows.map((r) => r.toeH)).toFixed(3), ankMax: +Math.max(...rows.map((r) => r.ankH)).toFixed(3) } : { lifted: 0 };
      const ok = (r) => r.dYaw <= 20 && r.offS <= 30 && r.offP <= 30 && r.pitch <= 0.45 && r.toeH >= 0;
      const bad = [];
      for (const [tag, X] of [['left', L], ['right', R]]) {
        if (X.rows.length < 20) bad.push(tag + ': ' + X.rows.length + ' lifted frames (< 20; aiming ' + X.aimF + ')');
        const b = X.rows.filter((r) => !ok(r));
        if (b.length) bad.push(tag + ': ' + b.length + ' frames off (worst dYaw ' + Math.max(...b.map((r) => r.dYaw)).toFixed(1) + ', pitch ' + Math.max(...b.map((r) => r.pitch)).toFixed(3) + ')');
      }
      if (!filmed) bad.push('V13 frame: the right swing foot never peaked'); else if (!ok(filmed)) bad.push('V13 frame off: ' + JSON.stringify(filmed));
      const r3 = (o) => o && Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(3) : v]));
      return { pass: bad.length === 0, detail: { bad, left: summ(L.rows), right: summ(R.rows), filmed: r3(filmed) } };
    })()`),
  },
];

/* --------------------------------------------------------------- visual gates */

/** Film setup: stage Brea at the open ground facing the camera; HUD off. */
const FILM_PRE = `
      const C = __CTX__, p = C.player;
      for (const m of (C.machines?.list || [])) m.update = () => {};
      for (const el of Array.from(document.body.children)) if (el.tagName !== 'CANVAS' && !el.querySelector('canvas')) el.style.visibility = 'hidden';`;

const NEW_VISUALS = [
  {
    id: 'V-brea-one-glance', kind: 'visual', lane: 'hero-body', settle: 1500,
    title: 'Brea black-fill silhouettes front / side (her right) / back / side (her left) / 3-4 at 64 px tall, default loadout',
    reference: 'reference/r5/hero/brea-silhouette-sheet.png (built by tools/build; the 5 bible cues)',
    setup: `(async () => {${FILM_PRE}
      const s = await import('/src/hero/sheets.js');
      await s.silhouetteSheetOverlay(C);
    })()`,
    criteria: 'Plan §9, verbatim: black-fill silhouette front/side/back at 64 px tall, default loadout. Pass: 5 of 5 cues (violet wrap + topknot, wrap tail left-rear, crescent bracer, lance diagonal with the bob-shaped butt, cane quiver); no braid, no mane. (The sheet shows each black-fill view 4x nearest-neighbour beside its true 64 px size, a side from each side, a 3/4, and the same views in full colour below; the violet of cue 1 can only be read in the colour row.)',
  },
  {
    id: 'V-brea-face', kind: 'visual', lane: 'hero-body', settle: 1500,
    title: 'Brea face sheet at 1.2 m: front, profile, three-quarter, next to the stock UBC face',
    reference: 'reference/r5/hero/brea-face-sheet.png',
    setup: `(async () => {${FILM_PRE}
      const s = await import('/src/hero/sheets.js');
      await s.faceSheetOverlay(C);
    })()`,
    criteria: 'Pass: the salt-line (pale paste across the nose bridge and both cheeks, below the eyes), the scar through the LEFT brow and the dark-brown eyes read in the front view; the ∴ shows on the back of the right hand in the hand inset; the profile is visibly not the stock UBC face (stronger nose bridge and chin); the expression reads around the salt-line. FAIL if the face is the stock face, if the paint smears off the face, or if the scar is on the right brow.',
  },
  {
    id: 'V24-draw-down', kind: 'visual', lane: 'hero-body', settle: 600, timeout: 60000,
    title: 'Full draw aimed 43 deg DOWN (camPitch 0.75): from her right, and from her front-right three-quarter — the drawing hand on the string at the jaw corner',
    reference: 'reference/r5/gates-perf/draw-side (licence-clean archery side reference, the level draw this pose must keep relative to the head)',
    setup: placedSetup(['openGround'], `(async () => {${FILM_PRE}
      C.input.enabled = true; C.state = 'playing';
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      standAt(p, 'openGround'); p.camPitch = 0.75;
      C.input.mouse.buttons |= 4; await wait(800);
      C.input.mouse.buttons |= 1; await wait(2600);
      p.camPitch = 0.75; await frame();
      C.combat._updateAimPoint = () => {};           // hold the aim point (see V24)
      C.engine.timeScale = 0; await frame(); await frame();
      const an = p.animator, T3 = p.position.constructor;
      const nk = new T3(); C.combat.bow.getNockWorld(C.combat.drawStrength, nk);
      const kn = new T3(), ft = new T3(); an.debugDrawHand(kn, ft);
      const head = an.b.head.bone.getWorldPosition(new T3());
      const h = p.heading, fx = Math.sin(h), fz = Math.cos(h), rx = -Math.cos(h), rz = Math.sin(h);
      /* fix round 5: she now bends at the hips with the whole T (judge r2), so
       * the frame is centred on the T itself — the head, the draw elbow and the
       * bow grip — and the side lens is LEVEL with it, square to the draw's
       * vertical plane (the old raised lens, aimed forward of an upright face,
       * cut the bent head into a corner); the measured form is printed */
      const elW = an.b.loArmR.bone.getWorldPosition(new T3()), wrW = an.b.handR.bone.getWorldPosition(new T3()), bhW = an.b.handL.bone.getWorldPosition(new T3());
      const tgt = head.clone().add(elW).add(bhW).multiplyScalar(1 / 3);
      const foreDeg = Math.acos(Math.max(-1, Math.min(1, wrW.clone().sub(elW).normalize().dot(bhW.clone().sub(nk).normalize())))) * 180 / Math.PI;
      const S = await import('/src/hero/sheets.js');
      const W = 780, H = 830;
      const live = (pos) => S.liveView(C, [pos.x, pos.y, pos.z], [tgt.x, tgt.y, tgt.z], { width: W, height: H, fov: 34 });
      const side = new T3(tgt.x + rx * 1.9, tgt.y + 0.08, tgt.z + rz * 1.9);
      const d34x = (fx + rx) / Math.SQRT2, d34z = (fz + rz) / Math.SQRT2;
      const q34 = new T3(tgt.x + d34x * 1.9, tgt.y + 0.30, tgt.z + d34z * 1.9);
      const a = live(side), b = live(q34);
      const cv = document.createElement('canvas'); cv.width = 1600; cv.height = 900;
      cv.style.cssText = 'position:fixed;left:0;top:0;width:1600px;height:900px;z-index:2147483646;background:#f4f1ea';
      document.body.appendChild(cv);
      const g = cv.getContext('2d'); g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 1600, 900);
      const put = (img, x) => { const t = document.createElement('canvas'); t.width = W; t.height = H; t.getContext('2d').putImageData(img, 0, 0); g.drawImage(t, x, 34); };
      put(a, 14); put(b, 806);
      g.fillStyle = '#2a2420'; g.font = '600 15px ui-monospace, Menlo, monospace';
      g.fillText('FULL DRAW, AIM 43 deg DOWN — from her RIGHT (lens level, square to the draw)', 18, 24);
      g.fillText('— from her FRONT-RIGHT 3/4 (raised)', 810, 24);
      g.fillText('middle knuckle -> nock ' + kn.distanceTo(nk).toFixed(3) + ' m   fingertip -> nock ' + ft.distanceTo(nk).toFixed(3) + ' m   forearm vs arrow ' + foreDeg.toFixed(1) + ' deg   drawStrength ' + C.combat.drawStrength.toFixed(2), 18, 892);
      return { drawS: C.combat.drawStrength, knuckleToNock: +kn.distanceTo(nk).toFixed(4), fingertipToNock: +ft.distanceTo(nk).toFixed(4), forearmToArrowDeg: +foreDeg.toFixed(2) };
    })()`),
    criteria: 'Full draw aimed steeply DOWN (camPitch 0.75, 43 deg), two views: from her right, and from her front-right three-quarter. Judge against the licence-clean archery side reference: the hand must hold the same relation to the face as a level draw. PASS requires ALL of: the drawing hand is ON the string at the nock — the hooked fingers on the string and the knuckles at her jaw / cheek beside the mouth corner, not up on the headwrap, at the temple or above the ear; the nock and the string meet the fingers at the jaw corner (not at the chin away from the hand); the drawing forearm runs back from the hand roughly along the arrow with the elbow level or back; the bow arm straight; no part of the hand inside the face. FAIL if the fist sits above the cheekbone (on the wrap or the temple), if the string runs through the back of the hand or the wrist instead of into the fingers, or if the forearm crosses her face.',
  },
  {
    id: 'V-traversal', kind: 'visual', lane: 'hero-body', settle: 400, timeout: 60000,
    title: 'Ledge climb (pull frame), a cinder slide and a stepped climb, side views',
    reference: 'reference/r5/hero/MANIFEST.md (licence-clean climbing and scree-running references)',
    setup: `(async () => {${FILM_PRE}
      const s = await import('/src/hero/sheets.js');
      await s.traversalOverlay(C);
    })()`,
    criteria: 'Plan §9: ledge climb, a cinder slide and a basalt-column stair (W0: the trig-pillar step fixture until world-props W1). Pass: hands on the ledge, body over the hands at the top, slide posture low with the arms out for balance, no float. The climb panel is the last frame of the pull (both palms on the top, her chest just past the edge); the slide panel is a front three-quarter so both arms read; FAIL on hands in the air, float above the surface, or limbs through the ledge.',
  },
];

/* ========================================================================== */
/* assembly                                                                   */
/* ========================================================================== */

const CARRIED_IDS = {
  "__S_gates_config": [
    "A2-dodge-displacement",
    "A3-sprint-speed",
    "A11-idle-alive",
    "A12-clip-driven",
    "A13-no-skate",
    "A15-foot-flat",
    "A19-secondary-motion",
    "A16-draw-anchor",
    "A17-draw-beats",
    "A18-slope-conform",
    "A28-run-cadence",
    "A31-aim-strafe-skate",
    "A32-draw-ramp",
    "A33-rig-finite",
    "V1-sprint-frame",
    "V2-idle-frame",
    "V3-crouch-stalk",
    "V4-aim-anchor",
    "V12-sprint-vs-reference",
    "V13-aim-strafe",
    "V14-slope-contour"
  ],
  "__S_anim_core": [
    "A26-one-convention"
  ],
  "__S_player_anim": [
    "A33-hair-bounce",
    "A34-chains-driven",
    "A35-cheek-anchor",
    "A36-hit-react-visible",
    "A31b-aim-strafe-skate-player-anim",
    "A18b-slope-conform-moving",
    "V23-secondary-motion",
    "V24-draw-vs-reference"
  ],
  "__S_player_control": [
    "A28b-canon-speeds",
    "A32-look-up",
    "V22-chase-framing",
    "A32b-lookup-no-ghost",
    "A31b-no-ghost-without-occluder",
    "A31d-hillside-pan-0.8",
    "A31e-hillside-pan-clamp",
    "A31f-hillside-yaw-sweep",
    "A31c-clamp-framing"
  ]
};

/** Copy a row with its accessors (A9-style getters survive), then override. */
const withProps = (g, extra) => Object.defineProperties({}, {
  ...Object.getOwnPropertyDescriptors(g), ...Object.getOwnPropertyDescriptors(extra),
});
const SCOPES = { __S_gates_config, __S_anim_core, __S_player_anim, __S_player_control };
const carried = [];
for (const [scope, ids] of Object.entries(CARRIED_IDS)) {
  const list = SCOPES[scope].GATES;
  for (const id of ids) {
    const g = list.find((x) => x.id === id);
    if (!g) throw new Error(`[gates.r5.hero-body] carried row ${id} not in ${scope}`);
    carried.push(withProps(g, { lane: 'hero-body', r4Lane: g.lane, carriedFrom: 'gates.r5.carried.mjs (' + scope + ')' }));
  }
}

/* ---- W0b bar changes on carried rows ---- */
const byId = (id) => carried.find((g) => g.id === id);
{
  // A13 (R27): 5/5 runs on Brea — the Round-4 intermittency is closed, not tolerated
  const g = byId('A13-no-skate');
  // staging: a flat, clear 46 m strip (flatStrip, the same search A-run-arms
  // uses) — the openGround strip climbs a rise ~28 m out, inside this gate's
  // 31 m of sprint, and the speed clause read the uphill (5.1 m/s at the end of
  // the window, every run; Round 4's 'flaky' baseline); the speed is the
  // window's MEAN sim speed, not one end-of-window sample
  const one0 = Object.getOwnPropertyDescriptor(g, 'assert').value;
  const swaps = [
    ["standAt(p, 'openGround');", FLAT_STRIP + "const fs = flatStrip(46); if (!fs) return { pass: null, detail: 'SKIP-R18 (place): no flat, clear 46 m strip' }; p.position.set(fs.x, 0, fs.z); p.velocity.set(0, 0, 0); p._snapToGround(); p.camYaw = fs.yaw; { const E0 = __CTX__.engine, s0 = E0.simTime, w0 = performance.now(); while (E0.simTime - s0 < 0.6 && performance.now() - w0 < 5000) await new Promise((r) => requestAnimationFrame(r)); } const __nearM = Math.min(99, ...(__CTX__.machines?.list || []).filter((m) => m.position).map((m) => Math.hypot(m.position.x - p.position.x, m.position.z - p.position.z)));"],
    ['let hitched = 0, prev = performance.now();', 'let hitched = 0, prev = performance.now(), spdSum = 0, spdN = 0;'],
    ['const hitch = now - prev > 45;', 'const hitch = now - prev > 45; spdSum += p.moveSpeed; spdN++;'],
    ['const spd = __CTX__.player.moveSpeed;', 'const spd = spdN ? spdSum / spdN : __CTX__.player.moveSpeed;'],
    ['speed: +spd.toFixed(2),', 'speed: +spd.toFixed(2), nearestMachineM: +__nearM.toFixed(1), strip: { x: +fs.x.toFixed(1), z: +fs.z.toFixed(1) },'],
  ];
  let one = one0;
  for (const [x, y] of swaps) { if (!one.includes(x)) throw new Error('A13 shape changed: ' + x); one = one.replace(x, y); }
  Object.defineProperty(g, 'assert', { value: `(async () => {
      const runs = [];
      for (let i = 0; i < 5; i++) {
        __CTX__.input.keys.clear();
        await new Promise((r) => setTimeout(r, 400));
        const r = await ${one.trim()};
        runs.push({ pass: r.pass, worst: r.detail?.maxStanceDriftM ?? null, windows: r.detail?.windows ?? null, speed: r.detail?.speed ?? null, hitched: r.detail?.hitchedWindows ?? null, nearestMachineM: r.detail?.nearestMachineM ?? null, skip: r.pass === null ? r.detail : undefined });
        __CTX__.input.keys.clear();
      }
      const pass = runs.every((r) => r.pass === true) ? true : runs.some((r) => r.pass === false) ? false : null;
      return { pass, detail: { rule: 'R27: 5/5 runs', runs, worstOfRuns: Math.max(...runs.map((r) => r.worst ?? 0)) } };
    })()`, enumerable: true, configurable: true, writable: true });
  g.timeout = 120000;
  g.title = 'Planted foot does not skate at full sprint: stance-window XZ drift <= 0.06 m, 5/5 runs on Brea (R27)';
}
{
  // A33-hair-bounce: staged on the flattest clear 50 m strip (flatStrip) — the
  // W0 table's runway meets a collider 26 m out (measured on Brea's W0b tree)
  // and rides +-0.3 m of ground, which the window's linear detrend leaves in
  // the residual the footfall fit is graded against
  const g = byId('A33-hair-bounce');
  const a = Object.getOwnPropertyDescriptor(g, 'assert').value;
  const stage = "standAt(p, 'runway'); /* gatePlaces.runway: the open-ground spot facing its flat, fast 50 m bearing */";
  if (!a.includes(stage)) throw new Error('A33 shape changed');
  Object.defineProperty(g, 'assert', { value: a.replace(stage, FLAT_STRIP + "const fs = flatStrip(50); if (!fs) return { pass: null, detail: 'SKIP-R18 (place): no flat, clear 50 m strip' }; p.position.set(fs.x, 0, fs.z); p.velocity.set(0, 0, 0); p._snapToGround(); p.camYaw = fs.yaw; p.camPitch = 0;"), enumerable: true, configurable: true, writable: true });
}
{
  // V13 (R33 g): the staging ASSERTS the aim state before it films — aim and
  // the strafe key are held every frame until the freeze (one press was lost:
  // the final W0b film showed her strafing with no bow up), and a film whose
  // player is not aiming at the freeze carries a red STAGING FAILED caption,
  // so the judge fails it by name
  const g = byId('V13-aim-strafe');
  const a = Object.getOwnPropertyDescriptor(g, 'setup').value;
  const press = "C.input.mouse.buttons |= 4;\n        C.input.keys.add('KeyA');";
  if (!a.includes(press)) throw new Error('V13 shape changed');
  const hold = "const __hold = () => { if (C.engine.timeScale === 0) { if (!(p.aiming && C.combat?.weaponDrawn)) { const d = document.createElement('div'); d.textContent = 'V13 STAGING FAILED: not aiming / bow not in hand at the freeze'; d.style.cssText = 'position:fixed;left:20px;top:20px;z-index:2147483647;color:#fff;background:#c00;font:700 22px monospace;padding:8px'; document.body.appendChild(d); } return; } C.input.mouse.buttons |= 4; C.input.keys.add('KeyA'); requestAnimationFrame(__hold); }; __hold();";
  // ...and the AIM POINT is frozen before the camera moves to the front (fix
  // round 1): combat.aimPoint is the camera ray's hit, so relocating the lens
  // in front of her swung her aim round to face the lens and the film showed
  // her square to the camera with the bow down (V24 carries the same stub)
  const relocate = 'p._updateCamera = function () {';
  if (!a.includes(relocate)) throw new Error('V13 relocate shape changed');
  let a2 = a.replace(press, hold).replace(relocate, 'C.combat._updateAimPoint = () => {};\n          ' + relocate);
  /* fix round 5 (judge r2: "the film is phase-dependent: the freeze is a
   * 2.4 s + 0.9 s timer"): the freeze waits for a DETERMINISTIC gait phase —
   * the first frame the RIGHT (trailing) foot stops rising in the air, i.e.
   * the top of its swing, the phase the judge caught snapping 90 deg — so
   * the film always shows the worst case. A-strafe-feet grades the same frame
   * numerically (and every lifted frame of a full strafe each way). */
  const freezeAt = 'setTimeout(() => {\n            C.engine.timeScale = 0;';
  if (!a2.includes(freezeAt) || !a2.includes('}, 900);')) throw new Error('V13 freeze shape changed');
  const peak = "setTimeout(() => { const __an = p.animator, __T = C.terrain, __V = p.position.constructor; let __hp = -1, __n = 0; const __poll = () => { __n++; const __fs = __an.debugFeet(); const __w = __an.b.footR.bone.getWorldPosition(new __V()); const __h = __w.y - __T.getHeight(__w.x, __w.z); const __pk = !__fs[1].planted && __fs[0].planted && __hp > 0.12 && __h <= __hp; __hp = __fs[1].planted ? -1 : __h; if (!__pk && __n < 600) { requestAnimationFrame(__poll); return; } __frz(); }; const __frz = () => {\n            C.engine.timeScale = 0;";
  a2 = a2.replace(freezeAt, peak).replace('}, 900);', '}; __poll(); }, 900);');
  Object.defineProperty(g, 'setup', { value: a2, enumerable: true, configurable: true, writable: true });
  g.settle = 6500;
  g.criteria = g.criteria.replace('Locked front view of an aiming side-step', 'Locked front view of an aiming side-step, frozen at the top of the trailing (right) foot\'s swing');
}
{
  // V23 (fix round 1, plan §9: "wrap tail, knot tail, sash end and alidade
  // cord in visibly different positions"): filmed from her LEFT, the side
  // that shows all four chains (the wrap tail trails left-rear, the sash end
  // hangs at the left hip, the knot tail behind the head, the alidade cord at
  // the sternum) — the right-side lens hid three of them. Staged on the flat
  // strip, run in whichever direction puts the sun on her left (from the left
  // she filmed backlit on the W0 table's heading), machines frozen.
  const g = byId('V23-secondary-motion');
  const a = Object.getOwnPropertyDescriptor(g, 'setup').value;
  const stage = "standAt(p, 'openGround');";
  const cam = 'lockCam(-3.5, 1.15, 0, 1.05);';
  if (!a.includes(stage) || !a.includes(cam)) throw new Error('V23 shape changed');
  const sunStage = FLAT_STRIP + `const fs = flatStrip(46);
      if (fs) {
        let sun = null; C.scene.traverse((o) => { if (!sun && o.isDirectionalLight && o.castShadow) sun = o; });
        let sx = 0, sz = 1; if (sun) { sx = sun.position.x - sun.target.position.x; sz = sun.position.z - sun.target.position.z; }
        const h0 = Math.atan2(fs.dx, fs.dz);
        const leftDot = Math.cos(h0) * sx - Math.sin(h0) * sz;          // her left (cos h, -sin h) . sun
        if (leftDot >= 0) { p.position.set(fs.x, 0, fs.z); p.camYaw = fs.yaw; }
        else { p.position.set(fs.x + fs.dx * 46, 0, fs.z + fs.dz * 46); p.camYaw = fs.yaw + Math.PI; }
        p.velocity.set(0, 0, 0); p._snapToGround();
      } else standAt(p, 'openGround');`;
  /* fix round 3 (judge r0: "no brass alidade tube at the sternum appears in
   * any of the three strips; the sash end is a small dark tab"): a pure side
   * view hides the sternum behind her own arm swing and shows the sash end
   * edge-on. Filmed from her FRONT-LEFT three-quarter (35 deg ahead of her
   * left side), 2.3 m out at chest height: the sternum and the alidade tube,
   * the sash end at the left hip against the dark trousers, the wrap tail
   * trailing left-rear past her shoulder and the knot tail behind the head
   * are all in the lens at once, at twice the old scale. */
  /* fix round 4 (judge r1: "the alidade reads static … a brass fleck of about
   * 6 px at the buckle … no cord is visible"): the cord is shortened to the
   * bible's sternum (the tube at mid-sternum, ~1.26 m at idle, clear of the
   * arm swing) and the neck cord itself is now modelled (a cream cord round
   * the neck, down to the tube); the lens comes in to ~1.9 m (was 2.3), the
   * look-at at the sternum. */
  Object.defineProperty(g, 'setup', { value: a.replace(stage, sunStage).replace(cam, 'lockCam(1.55, 1.28, -1.1, 1.22);'), enumerable: true, configurable: true, writable: true });
  g.criteria = 'Plan §9: three frames of the SAME sprint, 80 ms apart, left to right, filmed from her FRONT-LEFT three-quarter (the sun on that side). PASS if the wrap tail (violet, from the knot at the left-rear of the head), the knot tail (behind the head), the sash end (the strip hanging at her left hip/thigh) and the alidade (the brass tube hanging on a cream neck cord at her STERNUM, mid-chest) are each in visibly DIFFERENT positions across the strips and the hair/cloth trails behind her rather than sticking out forward; FAIL if any of the four reads rigid, or the strips are indistinguishable.';
  g.title = 'Sprint, front-left three-quarter — three frames 80 ms apart, composited: wrap tail, knot tail, sash end, alidade cord';
}
{
  // V12 (R37, plan §8.3, Oct 22): judged side by side against the licence-clean
  // run-side reference; the Round-4 "25-45 deg lean" and "front thigh toward
  // horizontal" clauses are replaced by the ruling's text
  const g = byId('V12-sprint-vs-reference');
  g.reference = 'reference/r5/gates-perf/run-side.jpg (licence-clean, gates-perf A-reference-set)';
  g.criteria = 'R37: mid-sprint contact frame, camera on her right side, judged side by side against the licence-clean reference/r5/gates-perf/run-side.jpg. PASS needs ALL of: (1) the stance foot ON the ground line (sole touching, not hovering, not buried); (2) torso lean 10-30 deg (hip to neck) with the chest ahead of the hips; (3) the stance leg near vertical at contact with the swing thigh forward, the rear leg extended behind; (4) arms bent and swinging fore-aft beside the body — never crossing the midline, never T-rex (elbows pinned, hands up at the chest) or prancing (Kevin\'s bar); (5) the hair / wrap tail trailing BEHIND her. FAIL if both feet float, if the legs are near-symmetric, if the arms hang straight or cross the body, or if any limb bends backwards / the knee inverts.';
}
{
  // V24 (fix round 1): plan §9's pass list verbatim — the carried criteria
  // text predates it and did not ask for the ∴ or the wrap tail
  const g = byId('V24-draw-vs-reference');
  g.criteria = 'Plan §9: the hero at full draw, from her right, close, judged against the licence-clean archery side reference. PASS requires ALL of: the knuckle at the jaw corner; the fletching near the mouth corner; the drawing forearm in line with the arrow; the draw elbow level with the arrow or back; the ∴ (three pale dots on the back of the right hand) VISIBLE; the wrap tail clear of the hand; the bow arm straight. FAIL if the hand is out in front of her face, below her chin or behind her ear, if the bracer lies across her eyes, or if the bow arm is bent like a curl.';
}
{
  // A19 (R33 g: graded by hero-body on Brea): staged on the flat strip with
  // the machines frozen; the probes are animator.chainOf(): hair = the knot
  // tail, cloth = the longest cloth chain (fix round 4: the sash end — the wrap
  // tail is its own class, 'wrap', cloth in the world wind), gear = the alidade
  // cord (profile chainClasses)
  const g = byId('A19-secondary-motion');
  const a = Object.getOwnPropertyDescriptor(g, 'assert').value;
  const stage = "standAt(p, 'openGround');";
  if (!a.includes(stage)) throw new Error('A19 shape changed');
  Object.defineProperty(g, 'assert', { value: a.replace(stage, FLAT_STRIP + "const fs = flatStrip(46); if (!fs) return { pass: null, detail: 'SKIP-R18 (place): no flat, clear 46 m strip' }; p.position.set(fs.x, 0, fs.z); p.velocity.set(0, 0, 0); p._snapToGround(); p.camYaw = fs.yaw; p.camPitch = 0;"), enumerable: true, configurable: true, writable: true });
}
{
  // A35: the -0.55 up-aim (Round 4 never gated it) joins -0.4 / 0 / 0.75
  const g = byId('A35-cheek-anchor');
  const a = Object.getOwnPropertyDescriptor(g, 'assert').value;
  if (!a.includes("await measure(-0.4, 'up');")) throw new Error('A35 shape changed');
  /* ...and the band is graded where plan §9 puts it: |hand_r - head| with
   * "UBC Head sits at the skull base like Aloy's" — the HEAD JOINT. Round 4's
   * `debugArm().handToHead` measured to the head keep-out ellipsoid's centre
   * instead (Aloy: head bone + 5 cm), and on Brea that centre is the re-fitted
   * skull's, 11.4 cm over the joint: with the fist OUTSIDE the jaw (Oct 22: it
   * had been inside it) the wrist sits under the ear, 0.17-0.18 m from that
   * centre and 0.11-0.13 m from the joint. Both are reported, with the
   * Round-4-equivalent point (joint + (0, 0.05, 0.01)) and the jaw corner the
   * band is re-verified against (plan: "re-verified by measuring the
   * jaw-corner point"). */
  const meas = 'rows.push({ tag, drawS: +cmb.drawStrength.toFixed(2),\n          handToHead: R.handToHead,';
  const band = '&& r.handToHead >= 0.10 && r.handToHead <= 0.16';
  if (!a.includes(meas) || !a.includes(band)) throw new Error('A35 band shape changed');
  const meas2 = `const hj = V(); an.getBoneWorld(HBN('head'), hj);
        const r4 = p.model.worldToLocal(hj.clone()); r4.y += 0.05; r4.z += 0.01; p.model.localToWorld(r4);
        const jaw = p.model.userData?.rigProfile?.tune?.anchorOff;
        rows.push({ tag, drawS: +cmb.drawStrength.toFixed(2),
          handToHeadJoint: +hr.distanceTo(hj).toFixed(4), handToHeadR4Point: +hr.distanceTo(r4).toFixed(4),
          jawCornerToHeadJoint: jaw ? +Math.hypot(jaw[0], jaw[1], jaw[2]).toFixed(4) : null,
          handToSkullCentre: R.handToHead,`;
  Object.defineProperty(g, 'assert', { value: a.replace("await measure(-0.4, 'up');", "await measure(-0.55, 'up55');\n      await measure(-0.4, 'up');")
    .replace(meas, meas2).replace(band, '&& r.handToHeadJoint >= 0.10 && r.handToHeadJoint <= 0.16'), enumerable: true, configurable: true, writable: true });
  g.timeout = 90000;
  g.title = 'Full draw at FOUR pitches (-0.55, -0.4, 0, 0.75): hand_r 0.10-0.16 m from the Head joint (plan §9; the skull centre and the Round-4-equivalent point reported), behind the face plane, bow arm locked 165-172 deg, hands >= 0.45 m apart';
}

{
  // A16 (W0b): plus the LAUNCH clause — the arrow leaves within 0.3 deg of the
  // crosshair ray (aimPoint - origin, A52's definition) at every pitch
  const g = byId('A16-draw-anchor');
  const a = Object.getOwnPropertyDescriptor(g, 'assert').value;
  const hook = 'headClear: arm.headClear });';
  if (!a.includes(hook) || !a.includes('&& r.headClear >= 0.98')) throw new Error('A16 shape changed');
  const loose = `headClear: arm.headClear, aimPitch: pitch,
        elbowAboveShoulderAimFrame: (() => { const A = an.debugAim(), d = V().set(A.d[0], A.d[1], A.d[2]).normalize(), up = V().set(0, 1, 0).addScaledVector(d, -d.y).normalize();
          return +V().set(arm.elbow.x, arm.elbow.y, arm.elbow.z).sub(V().set(arm.shoulder.x, arm.shoulder.y, arm.shoulder.z)).dot(up).toFixed(4); })(),
        knuckleToNock: (() => { const k = V(), t = V(); return an.debugDrawHand && an.debugDrawHand(k, t) ? +k.distanceTo(nk).toFixed(4) : null; })(),
        fingertipToNock: (() => { const k = V(), t = V(); return an.debugDrawHand && an.debugDrawHand(k, t) ? +t.distanceTo(nk).toFixed(4) : null; })(),
        launchOffDeg: await (async () => {
          let fired = null; const h = (e) => { fired = e; }; C.events.on('arrow-fired', h);
          C.input.mouse.buttons &= ~1;
          const t0 = performance.now();
          while (!fired && performance.now() - t0 < 1500) await new Promise((r) => requestAnimationFrame(r));
          C.events.off('arrow-fired', h);
          if (!fired?.dir || !fired.origin || !fired.aimPoint) return null;
          const V3 = p.position.constructor;
          const o = new V3(fired.origin.x, fired.origin.y, fired.origin.z);
          const w = new V3(fired.aimPoint.x, fired.aimPoint.y, fired.aimPoint.z).sub(o).normalize();
          const gd = new V3(fired.dir.x, fired.dir.y, fired.dir.z).normalize();
          return +(Math.acos(Math.max(-1, Math.min(1, w.dot(gd)))) * 180 / Math.PI).toFixed(3);
        })() });`;
  // fix round 4 (judge r1): + the hand ON the string at every row — middle knuckle and
  // middle fingertip within 0.06 m of the bow's own nock (the wrist-to-nock bar alone
  // passed a fist on the headwrap at the 0.75 down aim, knuckle 0.109 m)
  /* R52 (plan §8.3, Oct 30): "elbow not above the shoulder" is measured
   * PERPENDICULAR TO THE ARROW in the draw plane at every aim pitch — the
   * elbow - shoulder vector (character space) on world up made perpendicular
   * to the aim direction (debugAim().d), exactly A-draw-elbow-level's
   * `elbowUp` — so a pitched shot is graded as the level draw rotated at the
   * hips. At camPitch 0 (level and both strafes) the character-height reading
   * stays graded too, unchanged (the two coincide there); at the pitched rows
   * it is reported (`elbowAboveShoulder`), not graded. */
  const ELBOW_OLD = '&& r.elbowAboveShoulder <= 0';
  const ELBOW_R52 = '&& r.elbowAboveShoulderAimFrame !== null && r.elbowAboveShoulderAimFrame <= 0 && (r.aimPitch !== 0 || r.elbowAboveShoulder <= 0)';
  if (!a.includes(ELBOW_OLD)) throw new Error('A16 elbow clause changed');
  const DET_OLD = 'detail: { rows, failing: bad.map(r => r.tag) }';
  if (!a.includes(DET_OLD)) throw new Error('A16 detail shape changed');
  const DET_R52 = "detail: { rule: 'R52: elbow height perpendicular to the arrow at every pitch (character height also graded at camPitch 0)', rows, failing: bad.map(r => r.tag + ':' + [r.drawS > 0.9 ? null : 'drawS', r.nockToHand <= 0.09 ? null : 'nockToHand', r.elbowAboveShoulderAimFrame !== null && r.elbowAboveShoulderAimFrame <= 0 ? null : 'elbowAboveShoulderAimFrame', r.aimPitch !== 0 || r.elbowAboveShoulder <= 0 ? null : 'elbowAboveShoulderLevel', r.headClear >= 0.98 ? null : 'headClear', r.launchOffDeg !== null && r.launchOffDeg <= 0.3 ? null : 'launch', r.knuckleToNock !== null && r.knuckleToNock <= " + KNUCKLE_NOCK + " ? null : 'knuckle', r.fingertipToNock !== null && r.fingertipToNock <= " + FINGERTIP_NOCK + " ? null : 'fingertip'].filter(Boolean).join('+')) }";
  Object.defineProperty(g, 'assert', { value: a.replace(hook, loose).replace(ELBOW_OLD, ELBOW_R52).replace(DET_OLD, DET_R52).replace('&& r.headClear >= 0.98', '&& r.headClear >= 0.98 && r.launchOffDeg !== null && r.launchOffDeg <= 0.3 && r.knuckleToNock !== null && r.knuckleToNock <= ' + KNUCKLE_NOCK + ' && r.fingertipToNock !== null && r.fingertipToNock <= ' + FINGERTIP_NOCK), enumerable: true, configurable: true, writable: true });
  g.timeout = 120000;
  g.title = 'Full draw at -0.55 / -0.4 / 0 / 0.75 and strafing: string hand on the nock (wrist <= 0.09 m; middle knuckle and fingertip <= 0.06 m), draw elbow not above the shoulder measured perpendicular to the arrow in the draw plane at every pitch (R52; character height also at camPitch 0), arm clear of the head (>= 0.98), and the loosed arrow leaves within 0.3 deg of the crosshair ray';
}

/* ---- the lane's own gates ---- */
const OURS = [...carried, ...NEW_GATES, ...NEW_VISUALS];

/* ---- two runners (see the header) ---- */
const isRegistry = (() => {
  try { return readFileSync(path.join(TOOLS, 'gates.config.mjs'), 'utf8').includes('LANE_FILE_RE'); } catch { return true; }
})();
let exported = OURS;
if (!isRegistry) {
  const base = (await import(pathToFileURL(path.join(TOOLS, 'gates.config.mjs')).href)).GATES;
  const round4Ids = new Set();
  for (const f of (await import('fs')).readdirSync(TOOLS).filter((x) => /^gates\.round4\..+\.mjs$/.test(x))) {
    const t = readFileSync(path.join(TOOLS, f), 'utf8');
    for (const m of t.matchAll(/^\s*id: '([^']+)'/gm)) round4Ids.add(m[1]);
  }
  exported = [];
  for (const g of OURS) {
    const b = base.find((x) => x.id === g.id);
    if (b) {
      // same object the runner already merged: replace its contents in place
      for (const k of Object.keys(b)) delete b[k];
      Object.defineProperties(b, Object.getOwnPropertyDescriptors(g));
      b.shadowedInPlace = true;
    } else if (round4Ids.has(g.id)) {
      exported.push(withProps(g, { id: g.id + '@hero', shadowOf: g.id }));
    } else exported.push(g);
  }
}
export const GATES = exported;
export const HERO_BODY_GATE_IDS = OURS.map((g) => g.id);
