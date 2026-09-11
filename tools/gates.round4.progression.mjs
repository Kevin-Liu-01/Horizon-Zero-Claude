/**
 * Round 4 gates — lane `progression` (docs/ROUND4-AUDIT.md §4).
 *
 * Same contract as tools/gates.config.mjs: ACTION gates resolve
 * { pass, detail } in page context with __CTX__/__GAME__ available.
 *
 * `src/main.js` belongs to `core-platform`, so this lane cannot add itself to
 * the construction list. Every gate therefore brings the lane up itself with
 * `installProgression(ctx)` — the one line core-platform will add to main.js
 * (see the INTEGRATION NOTE at the top of src/core/progression.js). The call is
 * idempotent and registers the system into the live frame loop, so a gate is
 * measuring the shipped code path, not a test harness.
 *
 * Gate ids A64/A65/A66/A67 were checked against every registered id across
 * tools/gates.config.mjs and tools/gates.round4.*.mjs before being claimed —
 * none of them was taken, so they keep the audit's names unsuffixed.
 */

const KEYS = ['hzc.save.v4', 'hzc.checkpoint.v4', 'hzc.meta.v4'];

/**
 * Gates share one browser profile, so localStorage carries between them: a save
 * (or a difficulty) written by A65 would otherwise change what A64 measures.
 * Every gate that is not deliberately testing persistence starts from nothing.
 */
const RESET = `for (const k of ${JSON.stringify(KEYS)}) { try { localStorage.removeItem(k); } catch { /* locked down */ } }`;

/**
 * Publish the lane's LIVE instance for the assert.
 *
 * FIX ROUND 1. This used to read `installProgression(__CTX__)` on a build whose
 * `src/main.js` never called it — the harness was supplying the integration the
 * product did not have, so every gate passed while a real player got no XP, no
 * quests and no save. `core-platform` has since added the call
 * (`src/main.js:19` + `:118`), so the gate's job is now to CHECK that, not to
 * do it: `preinstalled` records whether `ctx.progression` and the registered
 * `Progression` system were already there when the page finished booting, and
 * every gate below fails if they were not. The `installProgression` call is
 * kept only because it is idempotent and returns the live instance — it is a
 * handle, not a bring-up.
 *
 * `newGame('normal')` then puts that live instance at a known start: the page
 * is fresh, but `Progression`'s constructor reads persisted difficulty out of
 * `hzc.meta.v4` (progression.js:535), so a preset written by an earlier gate in
 * the shared browser profile would otherwise change what the next one measures.
 * It is the same call the title screen's NEW GAME makes.
 */
const UP = `(async () => {
  const preinstalled = !!__CTX__.progression
    && (__GAME__.systems || []).some((sy) => sy && sy.name === 'progression');
  ${RESET}
  const m = await import('/src/core/progression.js');
  const prog = m.installProgression(__CTX__);   // idempotent: hands back the live one
  prog.newGame('normal');
  __CTX__.input.enabled = true;
  window.__PROG__ = prog;
  window.__PREINSTALLED__ = preinstalled;
  return { preinstalled, level: prog.level, active: prog.quests.active().map((q) => q.id) };
})()`;

/** Shared page-context helpers. Injected into an assert body, not imported. */
const HELP = `
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Wait for a predicate, polling at 100 ms. Returns whether it came true. */
async function until(fn, ms) {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) { if (fn()) return true; await sleep(100); }
  return !!fn();
}
/**
 * Wait for N seconds of SIMULATED time.
 *
 * FIX ROUND 1 (judge: "A66 is non-deterministic - it failed on a clean
 * full-lane run and passed alone"). The 5 Hz samplers in Progression.update
 * accumulate the fixed-step dt, not wall time, and main.js clamps a loaded
 * frame to MAX_STEPS = 3 - so under a 15-file suite 0.2 s of sim can take well
 * over a second of wall clock. Every wait in this file is now either on the
 * observable itself (until) or on this clock, never on sleep().
 */
const simWait = (ctx, s, cap = 25000) => {
  const t0 = ctx.engine.simTime;
  return until(() => ctx.engine.simTime - t0 >= s, cap);
};
/** The deferred variety species (16 of the 24 sites) stream in after boot. */
const rosterReady = (ctx) => until(() => ctx.machines?.varietyReady && ctx.machines.sites.sites.length >= 24, 40000);
/** Kill a machine through the real damage path, not by setting a flag. */
function slay(m) {
  m.takeDamage({
    impact: (m.maxHealth || 500) * 4 + 5000,
    tear: 0, element: 'none',
    point: m.position.clone(),
    dir: { x: 0, y: 0, z: 1 },
    type: 'gate',
  });
  return m.alive === false;
}
/** Stable comparable form of an alive-set (mirrors SaveSystem.rosterKey). */
const rosterKey = (rows) => (rows || []).map((r) => (r.site ?? 'x') + ':' + r.kind).sort().join(',');
const liveRoster = (ctx) => ctx.machines.list
  .filter((m) => m && m.alive && !m._disposed && m._site)
  .map((m) => ({ site: m._site.id, kind: m.kind }));
`;

export const GATES = [
  /* ------------------------------------------------------------------ A64 */
  {
    id: 'A64-xp-loop', kind: 'action', lane: 'progression',
    title: 'Killing a Watcher pays f(machine.level) XP, pops +XP, and levels up with a point and +HP; world content pays through award()/discover()',
    timeout: 90000,
    setup: UP,
    settle: 1200,
    assert: `(async () => {
      ${HELP}
      const ctx = __CTX__;
      const prog = window.__PROG__;
      if (!prog) return { pass: false, detail: 'installProgression did not publish' };
      if (!window.__PREINSTALLED__) {
        return { pass: false, detail: 'ctx.progression was NOT built by main.js — the lane is dead code in a normal session' };
      }
      if (prog.difficulty !== 'normal') return { pass: false, detail: 'difficulty not reset: ' + prog.difficulty };

      const w = ctx.machines.list.find((m) => m.kind === 'watcher' && m.alive);
      if (!w) return { pass: false, detail: 'no live watcher in the roster' };

      // f(machine.level) — a Watcher is level 5, a Thunderjaw 27; the whole
      // point of progression-012 is that this is NOT a flat kill-feed number.
      const level = w.level;
      const expect = prog.xpForKill(w);
      const other = prog.xpForKill({ level: 27 });
      const xp0 = prog.totalXp;

      const seen = [];
      const off = ctx.events.on('xp-gained', (e) => seen.push(e));
      const died = slay(w);
      await until(() => prog.totalXp > xp0, 8000);
      off();

      const gained = prog.totalXp - xp0;
      const pops = document.querySelectorAll('#hzc-prog .pg-toast').length;
      const popText = [...document.querySelectorAll('#hzc-prog .pg-toast')].map((n) => n.textContent).join('|');

      /**
       * FIX ROUND 2 — world-content XP actually pays.
       *
       * The judge's finding: eight live call sites in world-props / fauna call
       * \`ctx.progression?.award?.({xp,reason,id})\` and \`?.discover?.(id)\`, and
       * neither method existed. Optional chaining meant nothing threw — it just
       * paid 0. This drives the SHIPPED path (the registered SUPPLY CACHE
       * entry's own onInteract, which is the callback interactables.js:164
       * fires on a completed hold), then proves the two dedup rules.
       */
      const api = { award: typeof prog.award, discover: typeof prog.discover };
      const disc = [];
      const offD = ctx.events.on('discovery', (e) => disc.push(e));

      // 1. shipped path: a real registered cache pays 15 the first time, 0 again
      const cache = (ctx.interactables?.list || []).find((e) => e && e.site === 'cache' && e.onInteract);
      const xpC0 = prog.totalXp;
      if (cache) cache.onInteract(ctx, cache);
      const cachePaid = prog.totalXp - xpC0;
      const xpC1 = prog.totalXp;
      if (cache) cache.onInteract(ctx, cache);
      const cacheAgain = prog.totalXp - xpC1;

      // 2. one-shot reason: a datapoint id can never be farmed
      const dp1 = prog.award({ xp: 25, reason: 'datapoint', id:'gate-dp' });
      const dp2 = prog.award({ xp: 25, reason: 'datapoint', id:'gate-dp' });

      // 3. repeatable reason: fauna passes the SPECIES key, so every kill pays.
      //    Driven through fauna's own _kill when two of a species are alive.
      const sameKind = (() => {
        const live = (ctx.fauna?.animals || []).filter((a) => a && a.alive);
        for (const a of live) { if (live.filter((b) => b.key === a.key).length >= 2) return a.key; }
        return null;
      })();
      let huntPaid = [0, 0];
      if (sameKind && typeof ctx.fauna._kill === 'function') {
        const two = ctx.fauna.animals.filter((a) => a.alive && a.key === sameKind).slice(0, 2);
        for (let i = 0; i < 2; i++) {
          const b = prog.totalXp;
          ctx.fauna._kill(two[i], { source: 'gate' });
          huntPaid[i] = prog.totalXp - b;
        }
      } else {
        huntPaid = [prog.award({ xp: 20, reason: 'hunt', id:'boar' }),
          prog.award({ xp: 20, reason: 'hunt', id:'boar' })];
      }

      // 4. discover(): idempotent — one 'discovery' event per id, ever. A PLACE
      //    banners; the 24 datapoint slugs are ledgered silently, because
      //    focus-items already renders a DATAPOINT card for each of them and a
      //    "DISCOVERED · DP SPAN 1" overlay would announce the same pickup
      //    twice, in slug case.
      const d1 = prog.discover('hunting-ground-valley');   // in PLACE_NAMES
      const d2 = prog.discover('hunting-ground-valley');   // idempotent
      const d3 = prog.discover('dp-gate-quiet');           // ledgered, no banner
      offD();
      const discBanners = [...document.querySelectorAll('#hzc-prog .pg-banner')]
        .filter((n) => /DISCOVERED/.test(n.textContent));
      const awardOk = api.award === 'function' && api.discover === 'function'
        && cachePaid === 15 && cacheAgain === 0
        && dp1 === 25 && dp2 === 0
        && huntPaid[0] > 0 && huntPaid[1] === huntPaid[0]
        && d1 === true && d2 === false && d3 === true
        && disc.length === 2
        && disc[0].id === 'hunting-ground-valley' && disc[0].place === true
        && disc[1].id === 'dp-gate-quiet' && disc[1].place === false
        && discBanners.length === 1
        && /HUNTING GROUND/.test(discBanners[0].textContent)
        && prog.hasDiscovered('hunting-ground-valley') === true
        && prog.hasDiscovered('dp-gate-quiet') === true
        && prog.audit().awarded.includes('datapoint:gate-dp');

      // level-up: step exactly onto the threshold through the public API
      const lvl0 = prog.level, pts0 = prog.skillPoints, hp0 = ctx.player.maxHealth, cur0 = ctx.player.health;
      const need = prog.xpToNext - prog.xpIntoLevel;
      const lvlEvents = [];
      const off2 = ctx.events.on('level-up', (e) => lvlEvents.push(e));
      prog.addXp(need, 'gate');
      await until(() => prog.level > lvl0, 8000);
      off2();
      const banners = [...document.querySelectorAll('#hzc-prog .pg-banner')].map((n) => n.textContent);

      const detail = {
        machineLevel: level, expect, thunderjawWouldBe: other, gained, died,
        xpEvents: seen.length, pops, popText: popText.slice(0, 60),
        level: prog.level, lvl0, skillPoints: prog.skillPoints, pts0,
        maxHealth: ctx.player.maxHealth, hp0, healed: ctx.player.health > cur0,
        levelUpEvents: lvlEvents.length,
        banner: banners.find((b) => /LEVEL/.test(b)) || null,
        world: {
          api, cacheEntry: !!cache, cachePaid, cacheAgain, dp1, dp2,
          huntSpecies: sameKind, huntPaid, d1, d2, d3,
          discoveryEvents: disc.map((e) => e.id + (e.place ? ':place' : ':quiet')),
          discBanners: discBanners.map((n) => n.textContent), awardOk,
        },
      };
      const pass = died === true
        && gained === expect && expect > 0
        && other > expect * 3                       // scales with the machine
        && seen.length >= 1 && seen[0].amount === expect
        && pops >= 1 && /\\+/.test(popText) && /XP/.test(popText)
        && prog.level === lvl0 + 1
        && prog.skillPoints === pts0 + 1
        && ctx.player.maxHealth === hp0 + 15
        && ctx.player.health > cur0
        && lvlEvents.length === 1
        && !!detail.banner
        && awardOk;
      return { pass, detail };
    })()`,
  },

  /* ------------------------------------------------------------------ A65 */
  {
    id: 'A65-save-restore', kind: 'action', lane: 'progression',
    title: 'Save at the campfire, kill two machines, RELOAD the page, Continue — quest stage, inventory, ammo, position and alive-set all match',
    timeout: 180000,
    /**
     * A literal page reload, not a simulated one. The setup builds a
     * distinctive run, saves it, then scrambles the live world so a restore
     * that quietly did nothing cannot pass — and schedules `location.reload()`
     * on the way out. The runner's settle window covers the navigation; the
     * assert runs on the FRESH document, waits for its own boot, and only then
     * calls Continue. Nothing but the bytes in localStorage crosses over.
     */
    setup: `(async () => {
      ${HELP}
      // recorded BEFORE anything of ours runs: main.js has to have built it
      const preinstalled = !!__CTX__.progression
        && (__GAME__.systems || []).some((sy) => sy && sy.name === 'progression');
      ${RESET}
      const ctx = __CTX__;
      const m = await import('/src/core/progression.js');
      const prog = m.installProgression(ctx);
      prog.newGame('normal');
      ctx.input.enabled = true;
      localStorage.setItem('__A65_PRE__', preinstalled ? '1' : '0');
      await rosterReady(ctx);

      prog.setDifficulty('hard');
      prog.addXp(700, 'gate');                     // a couple of levels
      prog.unlock('brave-precision');
      prog.talkTo('varl'); prog.closeDialogue();   // one tutorial step done

      // two real kills, so the saved alive-set is genuinely short. These come
      // FIRST: a kill pays shards into the inventory, so stamping the
      // distinctive counts before them would leave the payout on top and the
      // gate would be asserting a number it had already invalidated.
      const victims = ctx.machines.list.filter((x) => x.alive && x._site).slice(0, 2);
      const killedSites = victims.map((v) => v._site.id);
      for (const v of victims) slay(v);
      await until(() => victims.every((v) => v.alive === false), 8000);

      // Distinctive counts that the pockets can actually HOLD. focus-items caps
      // metal-shards at 500, and SaveSystem.apply clamps a restore to the same
      // published capacity, so stuffing 777 in here would make the gate demand
      // that a load reproduce an illegal inventory.
      const setTo = (id, n) => {
        const cap = typeof ctx.inventory.capacity === 'function' ? ctx.inventory.capacity(id) : Infinity;
        if (n > cap) throw new Error('gate wants ' + n + ' ' + id + ' but the cap is ' + cap);
        ctx.inventory.counts.set(id, n);
      };
      setTo('metal-shards', 321);
      setTo('ridge-wood', 13);
      if (ctx.combat && ctx.combat.ammo) ctx.combat.ammo.hunter = 7;
      // let the 5 Hz inventory sampler re-baseline — on ITS clock, not the wall's
      await simWait(ctx, 0.5);

      const p = ctx.player;
      p.position.set(88, p.position.y, -42);
      p.velocity.set(0, 0, 0);
      p._snapToGround && p._snapToGround();

      // FIX ROUND 2 — the world-content ledgers have to cross the reload too,
      // or a save/load cycle becomes an XP farm for every one-shot pickup.
      prog.award({ xp: 25, reason: 'datapoint', id:'a65-dp' });
      prog.discover('a65-place');

      const res = prog.save('campfire');
      const snap = prog.saves.read('hzc.save.v4');

      const expected = {
        bytes: res.bytes,
        level: prog.level, totalXp: prog.totalXp, xpIntoLevel: prog.xpIntoLevel,
        skillPoints: prog.skillPoints, unlocked: [...prog.unlocked].sort(),
        difficulty: prog.difficulty,
        quests: prog.serialize().quests,
        // read back, never hardcoded: whatever the world actually held is what
        // the save must reproduce
        shards: ctx.inventory.count('metal-shards'),
        wood: ctx.inventory.count('ridge-wood'),
        ammoHunter: ctx.combat && ctx.combat.ammo ? ctx.combat.ammo.hunter : null,
        px: 88, pz: -42,
        killedSites,
        rosterKey: rosterKey(snap.world.roster),
        aliveAtSave: snap.world.roster.length,
      };
      localStorage.setItem('__A65__', JSON.stringify(expected));

      // scramble everything the restore is supposed to put back
      prog.addXp(5000, 'gate');
      ctx.inventory.counts.set('metal-shards', 3);
      ctx.inventory.counts.set('ridge-wood', 0);
      if (ctx.combat && ctx.combat.ammo) ctx.combat.ammo.hunter = 99;
      p.position.set(-150, p.position.y, 150);

      setTimeout(() => location.reload(), 250);
      return { saved: res.ok, bytes: res.bytes, aliveAtSave: expected.aliveAtSave, killedSites };
    })()`,
    settle: 4000,
    assert: `(async () => {
      ${HELP}
      // --- this is a brand new document: wait for its own boot ---
      const booted = await until(() => window.__READY__ === true && window.__CTX__, 90000);
      if (!booted) return { pass: false, detail: 'the reloaded page never reached __READY__' };
      const ctx = window.__CTX__;
      // the RELOADED document has to bring the lane up on its own, too
      const preinstalledAfter = !!ctx.progression
        && (window.__GAME__.systems || []).some((sy) => sy && sy.name === 'progression');
      const preinstalledBefore = localStorage.getItem('__A65_PRE__') === '1';
      await rosterReady(ctx);

      const raw = localStorage.getItem('__A65__');
      if (!raw) return { pass: false, detail: 'setup never wrote its expectation (did the reload happen?)' };
      const want = JSON.parse(raw);

      const m = await import('/src/core/progression.js');
      const prog = m.installProgression(ctx);
      const freshRosterKey = rosterKey(liveRoster(ctx));   // the untouched world

      // "Continue" — exactly what the title screen calls.
      const info = prog.saveInfo();
      if (!info) return { pass: false, detail: 'no save survived the reload' };
      const res = prog.continueGame();
      await simWait(ctx, 0.5);

      const p = ctx.player;
      const got = {
        level: prog.level, totalXp: prog.totalXp, xpIntoLevel: prog.xpIntoLevel,
        skillPoints: prog.skillPoints, unlocked: [...prog.unlocked].sort(),
        difficulty: prog.difficulty,
        quests: prog.serialize().quests,
        shards: ctx.inventory.count('metal-shards'),
        wood: ctx.inventory.count('ridge-wood'),
        ammoHunter: ctx.combat && ctx.combat.ammo ? ctx.combat.ammo.hunter : null,
        px: p.position.x, pz: p.position.z,
        rosterKey: rosterKey(liveRoster(ctx)),
        alive: liveRoster(ctx).length,
      };

      // one-shot ledgers survived: the datapoint cannot be re-farmed, and the
      // place stays discovered (checked AFTER "got", so it cannot skew the XP)
      const reAward = prog.award({ xp: 25, reason: 'datapoint', id:'a65-dp' });
      const stillDiscovered = prog.hasDiscovered('a65-place');

      const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const checks = {
        reloaded: booted,
        // the product, not the harness, constructs the lane — on both documents
        integratedBefore: preinstalledBefore,
        integratedAfter: preinstalledAfter,
        level: got.level === want.level,
        xp: got.totalXp === want.totalXp && got.xpIntoLevel === want.xpIntoLevel,
        skills: eq(got.unlocked, want.unlocked) && got.skillPoints === want.skillPoints,
        difficulty: got.difficulty === want.difficulty,
        questStage: eq(got.quests, want.quests),
        inventory: got.shards === want.shards && got.wood === want.wood,
        ammo: got.ammoHunter === want.ammoHunter,
        position: Math.abs(got.px - want.px) < 0.75 && Math.abs(got.pz - want.pz) < 0.75,
        aliveSet: got.rosterKey === want.rosterKey,
        aliveCount: got.alive === want.aliveAtSave,
        // the restore actually DID something: the fresh world was not already
        // the saved one (two machines had to be culled to get there)
        restoreWasReal: freshRosterKey !== want.rosterKey,
        applyOk: res.ok === true,
        awardLedger: reAward === 0,
        discoverLedger: stillDiscovered === true,
      };
      const failed = Object.keys(checks).filter((k) => !checks[k]);
      return {
        pass: failed.length === 0,
        detail: { failed, checks, got: { ...got, quests: got.quests.length, rosterKey: undefined }, want: { ...want, quests: want.quests.length, rosterKey: undefined }, applied: res.applied, error: res.error },
      };
    })()`,
  },

  /* ------------------------------------------------------------------ A66 */
  {
    id: 'A66-quest-objectives', kind: 'action', lane: 'progression',
    title: 'The tutorial chain runs: talk / goto / scan / kill / gather each complete on their real event, with banners',
    timeout: 120000,
    setup: UP,
    settle: 1500,
    assert: `(async () => {
      ${HELP}
      const ctx = __CTX__;
      const prog = window.__PROG__;
      if (!prog) return { pass: false, detail: 'installProgression did not publish' };
      if (!window.__PREINSTALLED__) {
        return { pass: false, detail: 'ctx.progression was NOT built by main.js — the lane is dead code in a normal session' };
      }
      await rosterReady(ctx);

      const QID = 'lessons-of-the-valley';
      const def = prog.quests.def(QID);
      const types = def.objectives.map((o) => o.type);
      const st0 = prog.state(QID);
      if (st0.status !== 'active') return { pass: false, detail: 'the tutorial chain did not auto-start: ' + st0.status };

      const objEvents = [];
      const banners = [];
      const done = [];
      const offA = ctx.events.on('quest-objective', (e) => objEvents.push(e));
      const offB = ctx.events.on('banner', (e) => banners.push(e.title));
      const offC = ctx.events.on('quest-complete', (e) => done.push(e.id));

      const objOf = (oid) => prog.state(QID).objectives.find((o) => o.id === oid);
      /** Wait for an objective to actually finish. No wall-clock sleeps. */
      const untilDone = (oid, ms = 12000) => until(() => objOf(oid).done, ms);
      const counts = () => prog.state(QID).objectives.map((o) => o.id + ':' + o.have + '/' + o.need).join(' ');
      const foreign = [];
      const guard = async (label, fn) => {
        try { await fn(); }
        catch (err) { foreign.push(label + ': ' + (err && err.message ? err.message : String(err))); }
      };

      /* -------------------------------------------------------------------
       * 0. OUT-OF-ORDER SCAN — the regression this gate exists to hold.
       *
       * The most likely path through the tutorial is to Focus-tag the Watcher
       * you can already see while Varl is still talking. That credit used to be
       * discarded, and the obvious recovery is a NO-OP because
       * FocusSystem.tagTarget() is a toggle. So: tag the Watcher now, while
       * 'talk' is the current objective, then tag it AGAIN so the marker is
       * removed and the live tag set is empty. Nothing but the run tally can
       * credit step 3 after that, and the gate refuses to touch the Watcher
       * again.
       * ------------------------------------------------------------------- */
      const watcher = ctx.machines.list.find((m) => m.kind === 'watcher' && m.alive);
      const tagState = { at: prog.state(QID).current.id, tagged: false, liveTagsAfter: -1 };
      await guard('oob-scan', async () => {
        if (!watcher || !ctx.focus) return;
        ctx.focus._target = watcher; ctx.focus.tagTarget();   // emits machine-tagged
        ctx.focus._target = watcher; ctx.focus.tagTarget();   // toggles the marker OFF, emits nothing
        tagState.tagged = true;
        tagState.liveTagsAfter = ctx.focus.tags.size;
      });
      const scanDoneEarly = objOf('scan').done;               // must still be 0/1: order holds

      const steps = [];
      const record = (label, ok) => steps.push({ label, advanced: !!ok, counts: counts() });

      // 1. TALK — the same call the camp interactable makes.
      await guard('talk', () => { prog.talkTo('varl'); prog.closeDialogue(); });
      record('talk', await untilDone('talk'));

      // 2. GOTO — walk the player there; the 5 Hz proximity sampler in
      //    Progression.update must notice on its own, on ITS clock.
      const goto = def.objectives.find((o) => o.type === 'goto');
      await guard('goto', () => {
        const p = ctx.player;
        p.position.set(goto.x, p.position.y, goto.z);
        p.velocity.set(0, 0, 0);
        p._snapToGround && p._snapToGround();
      });
      record('goto', await untilDone('ridge'));

      // 3. SCAN — no new action. The tag from step 0 has to land here.
      record('scan', await untilDone('scan', 6000));

      // 4. KILL — the real damage path.
      await guard('kill', () => { if (watcher) slay(watcher); });
      record('kill', await untilDone('kill'));

      // 5. GATHER — the real inventory API every pickup goes through.
      //    Aloy STARTS with 20 ridge-wood, so this step is only meaningful if
      //    the step is earned rather than read off the bag: assert it is still
      //    open first, then pick three up.
      const woodOpenBefore = !objOf('wood').done && objOf('wood').have === 0;
      await guard('gather', () => { ctx.inventory.add('ridge-wood', 3); });
      record('gather', await untilDone('wood'));

      await until(() => prog.state(QID).status === 'done', 6000);
      await until(() => prog.state('proving-of-the-hunt').status === 'active', 6000);
      offA(); offB(); offC();

      const final = prog.state(QID);
      const allDone = final.objectives.every((o) => o.done);
      const advanced = steps.filter((s) => s.advanced).length;
      const objBanners = banners.filter((b) => /OBJECTIVE COMPLETE/.test(b)).length;
      const levelBanners = banners.filter((b) => /^LEVEL /.test(b));

      const detail = {
        types, steps, allDone, status: final.status,
        outOfOrderScan: { ...tagState, scanDoneEarly, creditedLater: objOf('scan').done },
        // the gather step was EARNED, not read off a starting stack of 20
        woodOpenBefore, startWood: 20,
        objectiveEvents: objEvents.length, objBanners,
        banners: banners.slice(0, 14),
        // one level-up must print exactly one LEVEL banner (fix round 1)
        levelBanners, levelBannerDupes: levelBanners.length !== new Set(levelBanners).size,
        completed: done,
        nextStarted: prog.state('proving-of-the-hunt').status,
        emitFaults: prog.audit().emitFaults,
        foreign,                                 // other lanes' throws, named
      };
      const pass = types.join(',') === 'talk,goto,scan,kill,gather'
        && advanced === 5
        && tagState.at === 'talk'                // ...while step 1 was still current
        && tagState.tagged                       // the out-of-order tag really happened
        && tagState.liveTagsAfter === 0          // ...and nothing was left on screen to credit it
        && scanDoneEarly === false               // order still holds: no jumping the queue
        && woodOpenBefore === true                // the last step still had to be earned
        && allDone
        && final.status === 'done'
        && objEvents.length >= 5
        && objBanners >= 4                       // the last one banners as QUEST COMPLETE
        && detail.levelBannerDupes === false     // no doubled LEVEL banner
        && done.includes(QID)
        && banners.some((b) => /QUEST COMPLETE/.test(b))
        && prog.state('proving-of-the-hunt').status === 'active';
      return { pass, detail };
    })()`,
  },

  /* ------------------------------------------------------------------ A67 */
  {
    id: 'A67-machine-respawn', kind: 'action', lane: 'progression',
    title: 'Clear a site, stand well away, advance the site clock past the respawn window — the roster repopulates',
    timeout: 120000,
    setup: UP,
    settle: 1500,
    assert: `(async () => {
      ${HELP}
      const ctx = __CTX__;
      const prog = window.__PROG__;
      if (!prog) return { pass: false, detail: 'installProgression did not publish' };
      if (!window.__PREINSTALLED__) {
        return { pass: false, detail: 'ctx.progression was NOT built by main.js — the lane is dead code in a normal session' };
      }
      await rosterReady(ctx);
      const sites = ctx.machines.sites;
      if (!sites) return { pass: false, detail: 'machine-ai has not published machines.sites' };

      const victim = ctx.machines.list.find((m) => m.kind === 'watcher' && m.alive && m._site);
      if (!victim) return { pass: false, detail: 'no live watcher with a site' };
      const siteId = victim._site.id;
      const site = sites.sites.find((s) => s.id === siteId);
      const kind = victim.kind;

      const disposed = [], respawned = [];
      const offA = ctx.events.on('machine-disposed', (e) => disposed.push(e.site));
      const offB = ctx.events.on('machine-respawned', (e) => respawned.push(e.site));

      slay(victim);
      await until(() => victim.alive === false, 8000);

      // Stand well outside SITE.respawnMinDist (120 m) — a site never
      // repopulates in the player's face, and the gate must not accidentally
      // prove that it does.
      const p = ctx.player;
      p.position.set(site.x + 260, p.position.y, site.z + 260);
      p.velocity.set(0, 0, 0);
      p._snapToGround && p._snapToGround();
      const dist = Math.hypot(p.position.x - site.x, p.position.z - site.z);

      const pendingAt = [];
      // Advance the SAME scheduler the frame loop drives, one simulated second
      // at a time: dispose lands ~82 s after death, and the respawn is drawn
      // from SITE.respawn = [300, 420] s after that. 700 s clears the window
      // with margin; the loop is the shipped SiteManager.update, not a poke
      // at its internals.
      for (let i = 0; i < 700; i++) {
        sites.update(1);
        if (i === 120 && site.pending) pendingAt.push(i);
        if (respawned.length) break;
        if (i % 120 === 0) await sleep(0);
      }
      await until(() => respawned.length > 0, 4000);
      offA(); offB();

      const fresh = ctx.machines.list.find((m) => m._site && m._site.id === siteId && m.alive && !m._disposed);
      const audit = prog.audit();
      const detail = {
        siteId, kind, dist: +dist.toFixed(1),
        disposed: disposed.filter((s) => s === siteId).length,
        respawned: respawned.filter((s) => s === siteId).length,
        sitePending: site.pending,
        siteHasMachine: !!site.machine,
        freshAlive: !!fresh, freshKind: fresh ? fresh.kind : null,
        clearedSitesNow: audit.clearedSites.length,
        stillCleared: audit.clearedSites.includes(siteId),
        stats: { respawns: audit.stats.respawns, sitesCleared: audit.stats.sitesCleared },
        siteAudit: audit.sites,
        wentPending: pendingAt.length > 0,
      };
      const pass = disposed.includes(siteId)
        && respawned.includes(siteId)
        && !!fresh && fresh.kind === kind
        && site.pending === false && !!site.machine
        && audit.stats.respawns >= 1
        && audit.stats.sitesCleared >= 1
        && !audit.clearedSites.includes(siteId)
        && dist > 120;
      return { pass, detail };
    })()`,
  },

  /* ----------------------------------------------------------------- A64b */
  /**
   * RESIDUE ROUND regression gate for the Wave-2 finding "the skill/difficulty
   * wrapper on Machine.takeDamage zeroes the legacy `baseDamage` channel".
   *
   * `machine.js:640` maps `hit.baseDamage` onto impact ONLY while `hit.impact`
   * is undefined. The wrapper wrote `impact: (hit.impact ?? 0) * dmg`, so a
   * legacy `{ baseDamage }` hit arrived with a DEFINED `impact: 0`: the compat
   * branch never ran, the machine took 0 damage, 0 tear and no elemental
   * buildup — and the bug was invisible at Normal, because the wrapper only
   * copies the record when a multiplier is off 1.
   *
   * The gate therefore measures the same hit twice, once per difficulty, on
   * both channels, and asserts the legacy channel tracks `damageOut` exactly
   * like the modern one. `A64b-damage-channels` was checked against every id in
   * tools/gates.config.mjs and tools/gates.round4.*.mjs — unclaimed.
   */
  {
    id: 'A64b-damage-channels', kind: 'action', lane: 'progression',
    title: 'The skill/difficulty wrapper scales the legacy baseDamage channel instead of deleting it: damage, tear and elemental buildup all survive and track damageOut',
    timeout: 90000,
    setup: UP,
    settle: 1200,
    assert: `(async () => {
      ${HELP}
      const ctx = __CTX__;
      const prog = window.__PROG__;
      if (!prog) return { pass: false, detail: 'installProgression did not publish' };
      if (!window.__PREINSTALLED__) {
        return { pass: false, detail: 'ctx.progression was NOT built by main.js — the lane is dead code in a normal session' };
      }
      // A watcher by preference: it is the only species with no elemental
      // canister part, so the fire probe below cannot detonate one and change
      // the parts list (and with it the weak-spot multiplier) between probes.
      const alive_ = ctx.machines.list.filter((mm) => mm && mm.alive);
      const m = alive_.find((mm) => mm.kind === 'watcher') || alive_[0];
      if (!m) return { pass: null, detail: 'SKIP: no living machine' };
      if (!prog._machineProto || !prog._machineProto.takeDamage.__hzcWrapped) {
        return { pass: false, detail: 'the machine damage wrapper is not installed' };
      }

      // Fixed body-centre point, no struck node: the same weak-spot/armour
      // multiplier applies to every probe below, so the ratios are clean.
      const pt = () => { const q = m.position.clone(); q.y += (m.height ?? 2) * 0.5; return q; };
      const BASE = 40;
      /** One probe on a restored machine. \`legacy\` omits impact entirely. */
      const probe = (legacy, element) => {
        m.health = m.maxHealth; m.brittleT = 0;
        for (const k of Object.keys(m.elemental || {})) m.elemental[k] = 0;
        // A part that actually tears off would change which weak-spot
        // multiplier the NEXT probe lands on, so hold every component on:
        // the returned tear channel is what this gate measures, not the rip.
        for (const q of (m.parts || [])) { if (q && q.attached) q.tearHp = 1e9; }
        const hit = {
          point: pt(), object: null, dir: { x: 0, y: 0, z: 1 },
          type: element || 'gate', draw: 1, seen: true,
        };
        if (legacy) hit.baseDamage = BASE;
        else { hit.impact = BASE; hit.tear = BASE * 0.35; hit.baseDamage = BASE; }
        if (!element) { hit.element = 'none'; hit.elementAmount = 0; }
        const res = m.takeDamage(hit);
        return {
          damage: +(res?.damage ?? 0).toFixed(4),
          tear: +(res?.tear ?? 0).toFixed(4),
          fire: +((m.elemental?.fire ?? 0) + (res?.triggeredElement === 'fire' ? 100 : 0)).toFixed(3),
        };
      };

      const seen = [];
      const run = (id) => {
        prog.setDifficulty(id);
        const out = { id, out: prog.mult('damageOut'), legacy: probe(true), modern: probe(false), fire: probe(true, 'fire') };
        seen.push(out);
        return out;
      };
      const normal = run('normal');   // damageOut 1.00 — wrapper does not copy
      const easy = run('easy');       // damageOut 1.25 — wrapper copies
      const hard = run('hard');       // damageOut 0.85
      prog.setDifficulty('normal');
      m.health = m.maxHealth; m.brittleT = 0;
      for (const k of Object.keys(m.elemental || {})) m.elemental[k] = 0;

      const near = (a, b, tol = 0.02) => b > 0 && Math.abs(a - b) / b <= tol;
      const detail = {
        rows: seen.map((r) => ({ id: r.id, damageOut: +r.out.toFixed(3),
          legacyDamage: r.legacy.damage, modernDamage: r.modern.damage,
          legacyTear: r.legacy.tear, modernTear: r.modern.tear, legacyFire: r.fire.fire })),
      };

      // 1. the legacy channel is never zero — the exact defect
      const alive = [normal, easy, hard].every((r) => r.legacy.damage > 0 && r.legacy.tear > 0);
      // 2. it tracks damageOut, like the modern channel
      const scales = near(easy.legacy.damage, normal.legacy.damage * easy.out)
        && near(hard.legacy.damage, normal.legacy.damage * hard.out);
      // 3. the two channels agree with each other at every difficulty
      const parity = [normal, easy, hard].every(
        (r) => near(r.legacy.damage, r.modern.damage) && near(r.legacy.tear, r.modern.tear));
      // 4. tear rides tearOut, NOT damageOut (no skill points spent → 1.0)
      const tearClean = [normal, easy, hard].every((r) => near(r.legacy.tear, normal.legacy.tear));
      // 5. machine.js's legacy type→element mapping still runs under a copy
      const elemental = [normal, easy, hard].every((r) => r.fire.fire > 0);
      detail.checks = { alive, scales, parity, tearClean, elemental };
      return { pass: alive && scales && parity && tearClean && elemental, detail };
    })()`,
  },
];
