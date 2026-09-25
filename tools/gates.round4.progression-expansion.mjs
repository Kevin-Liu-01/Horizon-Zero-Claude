/**
 * Round 4 gates — lane `progression-expansion` (docs/ROUND4-AUDIT.md §4).
 *
 * Same contract as tools/gates.config.mjs: ACTION gates resolve
 * { pass, detail } in page context with __CTX__/__GAME__ available; a console
 * error during a gate FAILS it.
 *
 * GATE IDS. The audit names this block A66-quest-objectives, A65-save-restore,
 * A99-dialogue and V45-dialogue-panel. Checked against every id registered in
 * tools/gates.config.mjs and tools/gates.round4.*.mjs before claiming any:
 *
 *   A99-dialogue / V45-dialogue-panel  unclaimed -> kept verbatim.
 *   A65-save-restore / A66-quest-objectives  ALREADY REGISTERED by lane
 *       `progression` (tools/gates.round4.progression.mjs) with a DIFFERENT
 *       meaning — that A66 runs the five tutorial objective types, that A65
 *       saves a tutorial-stage run. Per the lane contract they are registered
 *       here as `A65-save-restore-expansion` and
 *       `A66-quest-objectives-expansion`, and neither of the originals is
 *       edited, weakened, or re-run from this file.
 *
 * WHAT THESE MEASURE. Six new side quests anchored at `ctx.props.sites()`, four
 * new objective types on real published events, a TIMED trial, a thirteen-NPC
 * conversation card, and the fact that all of it survives a literal page
 * reload. Every objective below is driven through the same call a player's
 * input would reach — the datapoint's own `collect()`, the cache's registered
 * `onInteract`, `fauna._kill`, a real `takeDamage` kill, `npcs.talkTo` — never
 * by writing a counter.
 *
 * Run: node tools/gates.mjs --port 5213 --lane progression-expansion
 */

const KEYS = ['hzc.save.v4', 'hzc.checkpoint.v4', 'hzc.meta.v4'];
const RESET = `for (const k of ${JSON.stringify(KEYS)}) { try { localStorage.removeItem(k); } catch { /* locked down */ } }`;

/**
 * Bring the lane up the way this lane's Wave-2 gates do: record whether
 * `main.js` had already built it (a gate that installs the product it is
 * measuring proves nothing), then take the live instance and put it at a known
 * start.
 */
const UP = `(async () => {
  const preinstalled = !!__CTX__.progression
    && (__GAME__.systems || []).some((sy) => sy && sy.name === 'progression');
  ${RESET}
  const m = await import('/src/core/progression.js');
  const prog = m.installProgression(__CTX__);
  prog.newGame('normal');
  __CTX__.input.enabled = true;
  window.__PROG__ = prog;
  window.__PREINSTALLED__ = preinstalled;
  return { preinstalled, npcs: Object.keys(prog.NPCS).length, quests: prog.QUESTS.length };
})()`;

/** Shared page-context helpers (injected into an assert body, not imported). */
const HELP = `
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms) {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) { if (fn()) return true; await sleep(90); }
  return !!fn();
}
/** Wait N seconds of SIMULATED time — the samplers run on the fixed step. */
const simWait = (ctx, s, cap = 25000) => {
  const t0 = ctx.engine.simTime;
  return until(() => ctx.engine.simTime - t0 >= s, cap);
};
const rosterReady = (ctx) => until(() => ctx.machines && ctx.machines.varietyReady, 40000);
function slay(m) {
  m.takeDamage({
    impact: (m.maxHealth || 500) * 4 + 5000, tear: 0, element: 'none',
    point: m.position.clone(), dir: { x: 0, y: 0, z: 1 }, type: 'gate',
  });
  return m.alive === false;
}
const tp = (ctx, x, z) => {
  const p = ctx.player;
  p.position.set(x, p.position.y, z);
  p.velocity.set(0, 0, 0);
  if (p._snapToGround) p._snapToGround();
};
/** Walk to where the objective actually points, after site resolution. */
async function walkTo(ctx, prog, questId, objId) {
  const a = prog.objectiveAnchor(questId, objId);
  if (!a) return null;
  tp(ctx, a.x, a.z);
  await simWait(ctx, 0.8);
  return a;
}
const entriesOf = (ctx, site) =>
  (ctx.interactables.list || []).filter((e) => e.site === site && !e.consumed && !e.removed);
const objState = (prog, qid) => prog.quests.byId(qid).objectives.map((o) => o.have + '/' + o.need).join(' ');
/** Machines of a kind, spawned at the site if the roster is short. */
function ensureKind(ctx, kind, n, x, z) {
  const live = ctx.machines.list.filter((m) => m.kind === kind && m.alive);
  for (let i = live.length; i < n; i++) {
    const m = ctx.machines.spawn(kind, x + i * 7, z + i * 4);
    if (!m) break;
    live.push(m);
  }
  return live;
}
`;

export const GATES = [
  /* ------------------------------------------------- A66 (expansion) */
  {
    id: 'A66-quest-objectives-expansion', kind: 'action', lane: 'progression-expansion',
    title: 'All six site-anchored side quests complete on their REAL events (goto/timed kill/datapoint/cache/override/hunt/gather/talk), each anchored at a live ctx.props site, with objective + completion events, paid rewards, and a talk marker that tracks the walking NPC',
    timeout: 240000,
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
      if (!await rosterReady(ctx)) return { pass: null, detail: 'SKIP: machine roster never became ready' };

      const objEvents = [];
      const doneEvents = [];
      const questXp = [];
      const offA = ctx.events.on('quest-objective', (e) => objEvents.push(e.questId + ':' + e.objectiveId + '=' + e.have));
      const offB = ctx.events.on('quest-complete', (e) => doneEvents.push(e.id));
      const offC = ctx.events.on('xp-gained', (e) => { if (e.reason === 'quest') questXp.push(e.amount); });
      const delivered = [];
      const offD = ctx.events.on('quest-delivered', (e) => delivered.push(e));

      // level up so the level-gated offers are reachable at all
      prog.addXp(1400, 'gate');
      const pointsBefore = prog.skillPoints;
      const IDS = ['side-hunting-trial', 'side-cauldron-override', 'side-outpost-supply',
                   'side-lakeshore-fisher', 'side-cave-datapoints', 'side-wreck-salvage'];
      const offeredNow = prog.quests.offered().map((q) => q.id);
      const offeredAll = IDS.every((id) => offeredNow.includes(id));

      const rows = [];
      const anchors = {};
      const dpIds = (ctx.props && ctx.props.datapoints ? ctx.props.datapoints : []).map((d) => d.id);
      let dpCursor = 0;
      const collectDatapoints = (n) => {
        let got = 0;
        while (got < n && dpCursor < dpIds.length) {
          if (ctx.items.datapoints.collect(dpIds[dpCursor])) got++;
          dpCursor++;
        }
        return got;
      };

      /* ---------------- 1. hunting trial: goto + TIMED kill -------------- */
      prog.quests.start('side-hunting-trial');
      anchors.trial = await walkTo(ctx, prog, 'side-hunting-trial', 'ground');
      const afterGoto = prog.quests.byId('side-hunting-trial').objectives[0].done;
      const trialOpen = prog.trialState('side-hunting-trial');
      /**
       * CONTINUATION ROUND — THE CLOCK IS ON SCREEN.
       * shell-hud never took the render in docs §3.8, so a "within:" objective
       * ran on a countdown nothing showed: the trial read like an ordinary
       * "Kill 3 Scrappers" until it silently reset. The lane now draws its own
       * .pg-trial chip (hud.css hides .pg-strip, so it is its OWN node), and
       * stands it down when ctx.hud.trialClock appears. Measured on the
       * DOM, against activeTrial(), with a 2 s tolerance because the chip is
       * written by the 5 Hz sampler and read here a tick later.
       */
      await simWait(ctx, 0.4);
      const chipEl = document.querySelector('#hzc-prog .pg-trial');
      const at = prog.activeTrial();
      const chipSecs = (() => {
        const txt = chipEl && chipEl.querySelector('.pg-trial-time')
          ? chipEl.querySelector('.pg-trial-time').textContent : '';
        // \\d, not \d: this body is a TEMPLATE LITERAL, and an untagged
        // template eats an unknown escape ('\d' -> 'd'), which silently turned
        // the clock regex into /^(d+):(dd)$/ and made the check unmeasurable.
        const p = /^(\\d+):(\\d\\d)$/.exec(txt.trim());
        return p ? (+p[1] * 60 + +p[2]) : null;
      })();
      const clock = {
        shown: !!(chipEl && chipEl.classList.contains('show')),
        secs: chipSecs,
        want: at ? Math.ceil(at.left) : null,
        count: chipEl && chipEl.querySelector('.pg-trial-count')
          ? chipEl.querySelector('.pg-trial-count').textContent : null,
        label: !!(chipEl && (chipEl.querySelector('.pg-trial-label').textContent || '').length > 8),
        questId: at ? at.questId : null,
      };
      const clockDrawn = clock.shown && clock.secs != null && clock.want != null
        && Math.abs(clock.secs - clock.want) <= 2
        && clock.count === (at.have + '/' + at.need)
        && clock.label && clock.questId === 'side-hunting-trial';
      const ring = anchors.trial || { x: 128, z: -78 };
      const scr = ensureKind(ctx, 'scrapper', 4, ring.x - 8, ring.z + 6);
      // one kill inside the window...
      slay(scr[0]);
      await simWait(ctx, 0.5);
      const afterOneKill = prog.quests.byId('side-hunting-trial').objectives[1].have;
      // ...then the real restart path: walking back into the ring resets it
      const hg = (ctx.interactables.list || []).find((e) => e.site === 'hunting-ground');
      if (hg && hg.onInteract) hg.onInteract();
      await simWait(ctx, 0.5);
      const afterRestart = prog.quests.byId('side-hunting-trial').objectives[1].have;
      for (let i = 1; i <= 3; i++) if (scr[i]) slay(scr[i]);
      await until(() => prog.quests.byId('side-hunting-trial').status === 'done', 9000);
      // ...and the chip clears itself the moment the window is gone
      await simWait(ctx, 0.5);
      clock.clearedAfter = !(chipEl && chipEl.classList.contains('show'));
      rows.push({ id: 'side-hunting-trial', status: prog.quests.byId('side-hunting-trial').status,
        objs: objState(prog, 'side-hunting-trial'), afterGoto, afterOneKill, afterRestart,
        windowOpen: !!(trialOpen && trialOpen.running && trialOpen.left > 0) });

      /* ------------- 2. cauldron: goto + 3 datapoints + override --------- */
      prog.quests.start('side-cauldron-override');
      anchors.cauldron = await walkTo(ctx, prog, 'side-cauldron-override', 'terminal');
      const dpGot = collectDatapoints(3);
      await simWait(ctx, 0.5);
      const ovEntry = entriesOf(ctx, 'override')[0];
      if (ovEntry && ovEntry.onInteract) ovEntry.onInteract();
      await until(() => prog.quests.byId('side-cauldron-override').status === 'done', 9000);
      rows.push({ id: 'side-cauldron-override', status: prog.quests.byId('side-cauldron-override').status,
        objs: objState(prog, 'side-cauldron-override'), dpGot, overrideDriven: !!ovEntry });

      /* -------------- 3. outpost: gather + cache + goto + talk ----------- */
      prog.quests.start('side-outpost-supply');
      ctx.inventory.add('ridge-wood', 6);
      await simWait(ctx, 0.5);
      const c1 = entriesOf(ctx, 'cache')[0];
      if (c1 && c1.onInteract) c1.onInteract();
      await simWait(ctx, 0.5);
      anchors.outpost = await walkTo(ctx, prog, 'side-outpost-supply', 'drop');
      /**
       * CONTINUATION ROUND — THE TURN-IN TAKES THE GOODS.
       * Every "bring me X" objective used to leave X in the pouch and pay on
       * top, which with metal-shards (the CURRENCY) made "carry forty to the
       * forge" free money. Measured across the hand-over itself: the six
       * Ridge-Wood and the forty shards LEAVE the inventory, the objective
       * counters still read full (they are stored counts, not a live read), and
       * the payout still lands.
       */
      const woodBefore = ctx.inventory.count('ridge-wood');
      ctx.npcs.talkTo('maris');
      prog.closeDialogue();
      await until(() => prog.quests.byId('side-outpost-supply').status === 'done', 9000);
      const woodAfter = ctx.inventory.count('ridge-wood');
      rows.push({ id: 'side-outpost-supply', status: prog.quests.byId('side-outpost-supply').status,
        objs: objState(prog, 'side-outpost-supply') });

      /* ------------------ 4. lakeshore: goto + hunt + talk --------------- */
      prog.quests.start('side-lakeshore-fisher');
      anchors.lakeshore = await walkTo(ctx, prog, 'side-lakeshore-fisher', 'shore');
      const animals = (ctx.fauna && ctx.fauna.animals ? ctx.fauna.animals : []).filter((a) => a.alive);
      let hunted = 0;
      for (const a of animals) { if (hunted >= 2) break; ctx.fauna._kill(a); hunted++; }
      await simWait(ctx, 0.5);

      /* ---- FIX ROUND 1: the gold pip on a PERSON follows the person ------
       * "Bring the catch back to Aura" is current here, and the npc lane walks Aura
       * around camp. The marker used to be baked at rebuild time and never
       * refreshed, so it sat on the dirt she had left (measured 7.8 m against
       * its own 2.5 m ring). Two measurements, both on the shipped read path:
       *   passive  — let her walk for six simulated seconds and compare the
       *              marker with her live transform;
       *   forced   — displace her 7.2 m deterministically, so the check can
       *              never pass just because she happened to stand still.
       * Restores her transform afterwards; the npc controller owns it.      */
      const markerOf = (npcId) => prog.getMarkers().find((r) => r.kind === 'talk' && r.npc === npcId);
      const auraPos = ctx.npcs.byId.get('aura').group.position;
      const mk0 = markerOf('aura');
      const auraFrom = mk0 ? { x: +mk0.x.toFixed(2), z: +mk0.z.toFixed(2) } : null;
      await simWait(ctx, 6);
      const mk1 = markerOf('aura');
      const passiveErr = mk1 ? Math.hypot(mk1.x - auraPos.x, mk1.z - auraPos.z) : 999;
      const auraWalked = (mk1 && auraFrom) ? Math.hypot(mk1.x - auraFrom.x, mk1.z - auraFrom.z) : 0;
      const keepX = auraPos.x, keepZ = auraPos.z;
      // SNAPSHOT: getMarkers() returns the same array and refreshes the rows IN
      // PLACE, so holding mk1 and comparing it with mk2 afterwards compares a
      // row with itself and always reads 0 displacement.
      const wasX = mk1 ? mk1.x : 0, wasZ = mk1 ? mk1.z : 0;
      auraPos.x += 6; auraPos.z += 4;
      const mk2 = markerOf('aura');
      const forcedErr = mk2 ? Math.hypot(mk2.x - auraPos.x, mk2.z - auraPos.z) : 999;
      const forcedMoved = mk2 ? Math.hypot(mk2.x - wasX, mk2.z - wasZ) : 0;
      auraPos.x = keepX; auraPos.z = keepZ;
      const talkMarker = {
        from: auraFrom, walkedIn6s: +auraWalked.toFixed(2),
        passiveErr: +passiveErr.toFixed(3), forcedDisplacement: +forcedMoved.toFixed(2),
        forcedErr: +forcedErr.toFixed(3),
      };
      const talkMarkerLive = passiveErr <= 0.05 && forcedErr <= 0.05 && forcedMoved > 6;

      ctx.npcs.talkTo('aura');
      prog.closeDialogue();
      await until(() => prog.quests.byId('side-lakeshore-fisher').status === 'done', 9000);
      rows.push({ id: 'side-lakeshore-fisher', status: prog.quests.byId('side-lakeshore-fisher').status,
        objs: objState(prog, 'side-lakeshore-fisher'), hunted });

      /* ---------------- 5. cave: goto + 2 datapoints + talk -------------- */
      prog.quests.start('side-cave-datapoints');
      anchors.cave = await walkTo(ctx, prog, 'side-cave-datapoints', 'mouth');
      const dpGot2 = collectDatapoints(2);
      await simWait(ctx, 0.5);
      ctx.npcs.talkTo('vala');
      prog.closeDialogue();
      await until(() => prog.quests.byId('side-cave-datapoints').status === 'done', 9000);
      rows.push({ id: 'side-cave-datapoints', status: prog.quests.byId('side-cave-datapoints').status,
        objs: objState(prog, 'side-cave-datapoints'), dpGot2 });

      /* ---------------- 6. wreck: 2 caches + gather + talk --------------- */
      prog.quests.start('side-wreck-salvage');
      const cs = entriesOf(ctx, 'cache');
      if (cs[0] && cs[0].onInteract) cs[0].onInteract();
      if (cs[1] && cs[1].onInteract) cs[1].onInteract();
      await simWait(ctx, 0.5);
      ctx.inventory.add('metal-shards', 60);
      await simWait(ctx, 0.6);
      const shardsBefore = ctx.inventory.count('metal-shards');
      ctx.npcs.talkTo('thok');
      prog.closeDialogue();
      await until(() => prog.quests.byId('side-wreck-salvage').status === 'done', 9000);
      const shardsAfter = ctx.inventory.count('metal-shards');
      rows.push({ id: 'side-wreck-salvage', status: prog.quests.byId('side-wreck-salvage').status,
        objs: objState(prog, 'side-wreck-salvage') });
      offA(); offB(); offC(); offD();

      /* ------------------------------ verdict ---------------------------- */
      const allDone = rows.every((r) => r.status === 'done');
      const allObjsFull = IDS.every((id) =>
        prog.quests.byId(id).objectives.every((o) => o.done));
      // every quest anchored at a LIVE site, not at its authored fallback
      const anchored = Object.keys(anchors).filter((k) => anchors[k] && anchors[k].site).length;
      const trialRow = rows[0];
      const trialSemantics = trialRow.afterGoto === true
        && trialRow.windowOpen === true
        && trialRow.afterOneKill === 1        // one kill credits exactly one
        && trialRow.afterRestart === 0;       // re-entering the ring restarts it
      /**
       * REWARDS. Measured on the XP channel and the skill-point channel, not on
       * the shard count: focus-items caps metal-shards at 500, and six quest
       * payouts plus the kills put the run on that ceiling, so "shards went up"
       * is a check that fails for being RIGHT. Every quest reward is asserted
       * individually - one xp-gained {reason:'quest'} of exactly the amount its
       * definition promises, per quest.
       */
      const wantXp = IDS.map((id) => (prog.quests.def(id).rewards || {}).xp || 0);
      const pool = questXp.slice();
      const missingXp = [];
      for (const amount of wantXp) {
        const i = pool.indexOf(amount);
        if (i < 0) missingXp.push(amount); else pool.splice(i, 1);
      }
      const wantPoints = IDS.reduce((n, id) => n + ((prog.quests.def(id).rewards || {}).skillPoints || 0), 0);
      const paid = missingXp.length === 0 && (prog.skillPoints - pointsBefore) >= wantPoints;
      const faults = prog.audit().emitFaults;

      /* the hand-over: goods out of the pouch, on the real completion path */
      const delivery = {
        wood: { before: woodBefore, after: woodAfter, took: woodBefore - woodAfter, want: 6 },
        shards: { before: shardsBefore, after: shardsAfter, took: shardsBefore - shardsAfter, want: 40 },
        events: delivered,
      };
      const goodsDelivered = delivery.wood.took === 6 && delivery.shards.took === 40
        && delivered.some((e) => e.id === 'side-outpost-supply'
          && e.items.some((i) => i.id === 'ridge-wood' && i.n === 6 && i.short === 0))
        && delivered.some((e) => e.id === 'side-wreck-salvage'
          && e.items.some((i) => i.id === 'metal-shards' && i.n === 40 && i.short === 0));

      const checks = {
        offeredAll,
        allDone,
        allObjsFull,
        objectiveEvents: objEvents.length >= 18,
        completeEvents: IDS.every((id) => doneEvents.includes(id)),
        trialSemantics,
        anchoredAtSites: anchored >= 4,
        talkMarkerLive,
        rewardsPaid: paid,
        goodsDelivered,
        trialClockDrawn: clockDrawn && clock.clearedAfter === true,
        noForeignFaults: Object.keys(faults).length === 0,
      };
      const failed = Object.keys(checks).filter((k) => !checks[k]);
      return {
        pass: failed.length === 0,
        detail: { failed, checks, rows, anchors, talkMarker, doneEvents, objectiveEvents: objEvents.length,
          rewards: { wantXp, gotXp: questXp, missingXp, wantPoints, gotPoints: prog.skillPoints - pointsBefore },
          delivery, clock, faults },
      };
    })()`,
  },

  /* ------------------------------------------------- A65 (expansion) */
  {
    id: 'A65-save-restore-expansion', kind: 'action', lane: 'progression-expansion',
    title: 'Save a run mid-expansion (three side quests part-done, a trial running, topics heard, a skill spent), RELOAD the page, Continue — quest counters, trial window, conversation state and skills all come back',
    timeout: 220000,
    setup: `(async () => {
      ${HELP}
      const preinstalled = !!__CTX__.progression
        && (__GAME__.systems || []).some((sy) => sy && sy.name === 'progression');
      ${RESET}
      const ctx = __CTX__;
      const m = await import('/src/core/progression.js');
      const prog = m.installProgression(ctx);
      prog.newGame('normal');
      ctx.input.enabled = true;
      localStorage.setItem('__A65X_PRE__', preinstalled ? '1' : '0');
      await rosterReady(ctx);

      prog.addXp(1400, 'gate');
      const skillOk = prog.unlock('forager-gatherer');   // tier 1: no prerequisite

      // --- conversation state: two people, one topic each ---
      ctx.npcs.talkTo('karst');
      const kTopic = prog.dialogueState('karst').choices.find((c) => c.kind === 'topic');
      if (kTopic) prog.choose(kTopic.id);
      prog.closeDialogue();
      ctx.npcs.talkTo('thok');
      const tTopic = prog.dialogueState('thok').choices.find((c) => c.kind === 'topic');
      if (tTopic) prog.choose(tTopic.id);
      prog.closeDialogue();

      // --- three side quests, each PART done ---
      prog.quests.start('side-cauldron-override');
      await walkTo(ctx, prog, 'side-cauldron-override', 'terminal');   // 1 of 3 objectives
      const dpIds = (ctx.props && ctx.props.datapoints ? ctx.props.datapoints : []).map((d) => d.id);
      ctx.items.datapoints.collect(dpIds[0]);                          // 1 of 3 records
      prog.quests.start('side-outpost-supply');
      ctx.inventory.add('ridge-wood', 6);                              // 1 of 4 objectives
      prog.quests.start('side-hunting-trial');
      await walkTo(ctx, prog, 'side-hunting-trial', 'ground');         // opens the trial window
      await simWait(ctx, 0.6);
      prog.track('side-cauldron-override');

      const trial = prog.trialState('side-hunting-trial');
      const res = prog.save('campfire');
      const want = {
        level: prog.level, totalXp: prog.totalXp, skillPoints: prog.skillPoints,
        unlocked: [...prog.unlocked].sort(),
        // the quest LEDGER (counts + credit bookkeeping). The trial window is
        // deliberately not in here: it is stored as seconds LEFT and the clock
        // moves between the save and the assert, so it is judged on its own
        // terms below (running, and inside its authored window).
        quests: prog.serialize().quests.list,
        tracked: prog.tracked,
        seen: [...prog.dialogue.seen].sort(),
        talked: { ...prog.dialogue.talked },
        trialRunning: !!(trial && trial.running),
        trialLeft: trial ? trial.left : null,
        counters: ['side-cauldron-override', 'side-outpost-supply', 'side-hunting-trial']
          .map((id) => id + '|' + prog.quests.byId(id).objectives.map((o) => o.have + '/' + o.need).join(' ')),
      };
      localStorage.setItem('__A65X__', JSON.stringify(want));

      // scramble everything the restore has to put back
      prog.addXp(6000, 'gate');
      prog.dialogue.seen.clear();
      prog.dialogue.talked = Object.create(null);
      prog.trials.clear();
      prog.quests.abandon('side-outpost-supply');
      ctx.inventory.counts.set('ridge-wood', 0);

      setTimeout(() => location.reload(), 250);
      return { saved: res.ok, bytes: res.bytes, seen: want.seen.length, trialLeft: want.trialLeft, skillOk };
    })()`,
    settle: 4000,
    assert: `(async () => {
      ${HELP}
      const booted = await until(() => window.__READY__ === true && window.__CTX__, 90000);
      if (!booted) return { pass: false, detail: 'the reloaded page never reached __READY__' };
      const ctx = window.__CTX__;
      const preinstalledAfter = !!ctx.progression
        && (window.__GAME__.systems || []).some((sy) => sy && sy.name === 'progression');
      const preinstalledBefore = localStorage.getItem('__A65X_PRE__') === '1';
      await rosterReady(ctx);

      const raw = localStorage.getItem('__A65X__');
      if (!raw) return { pass: false, detail: 'setup never wrote its expectation (did the reload happen?)' };
      const want = JSON.parse(raw);

      const m = await import('/src/core/progression.js');
      const prog = m.installProgression(ctx);
      const freshCounters = ['side-cauldron-override', 'side-outpost-supply', 'side-hunting-trial']
        .map((id) => id + '|' + prog.quests.byId(id).objectives.map((o) => o.have + '/' + o.need).join(' '));

      const info = prog.saveInfo();
      if (!info) return { pass: false, detail: 'no save survived the reload' };
      const res = prog.continueGame();
      await simWait(ctx, 0.6);

      const trial = prog.trialState('side-hunting-trial');
      const got = {
        level: prog.level, totalXp: prog.totalXp, skillPoints: prog.skillPoints,
        unlocked: [...prog.unlocked].sort(),
        // the quest LEDGER (counts + credit bookkeeping). The trial window is
        // deliberately not in here: it is stored as seconds LEFT and the clock
        // moves between the save and the assert, so it is judged on its own
        // terms below (running, and inside its authored window).
        quests: prog.serialize().quests.list,
        tracked: prog.tracked,
        seen: [...prog.dialogue.seen].sort(),
        talked: { ...prog.dialogue.talked },
        trialRunning: !!(trial && trial.running),
        trialLeft: trial ? trial.left : null,
        counters: ['side-cauldron-override', 'side-outpost-supply', 'side-hunting-trial']
          .map((id) => id + '|' + prog.quests.byId(id).objectives.map((o) => o.have + '/' + o.need).join(' ')),
      };
      // a topic already heard cannot be farmed again after a reload
      const xpBefore = prog.totalXp;
      const reheard = prog.dialogue.seen.size
        ? prog.award({ xp: 10, reason: 'talk', id: [...prog.dialogue.seen][0], once: true })
        : 0;

      const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const checks = {
        reloaded: booted,
        integratedBefore: preinstalledBefore,
        integratedAfter: preinstalledAfter,
        applyOk: res.ok === true,
        level: got.level === want.level,
        xp: got.totalXp === want.totalXp,
        skills: eq(got.unlocked, want.unlocked) && got.unlocked.length >= 1
          && got.skillPoints === want.skillPoints,
        questStage: eq(got.quests, want.quests),
        objectiveCounters: eq(got.counters, want.counters),
        tracked: got.tracked === want.tracked,
        dialogueSeen: eq(got.seen, want.seen) && got.seen.length >= 2,
        dialogueTalked: eq(got.talked, want.talked),
        trialRestored: got.trialRunning === want.trialRunning
          && (!want.trialRunning || (got.trialLeft > 0 && got.trialLeft <= 300)),
        // the restore actually DID something: a fresh boot was not already this
        restoreWasReal: !eq(freshCounters, want.counters),
        topicNotFarmable: reheard === 0 && prog.totalXp === xpBefore,
      };
      const failed = Object.keys(checks).filter((k) => !checks[k]);
      return {
        pass: failed.length === 0,
        detail: { failed, checks, got: { ...got, quests: got.quests.length },
          want: { ...want, quests: want.quests.length }, applied: res.applied, error: res.error },
      };
    })()`,
  },

  /* ---------------------------------------------------------- A99 */
  {
    id: 'A99-dialogue', kind: 'action', lane: 'progression-expansion',
    title: 'npcs.talkTo(id) opens the conversation card with THAT person lines for the whole roster; a choice advances quest state; the card closes cleanly and credits the talk',
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
      if (!ctx.npcs) return { pass: null, detail: 'SKIP: the npc lane has not published ctx.npcs' };
      prog.addXp(1400, 'gate');

      /* --- 1. every person in the roster has their own lines and choices --- */
      const ids = Object.keys(prog.NPCS);
      const firstLines = new Map();
      const perNpc = [];
      let badShape = null;
      for (const id of ids) {
        const st = prog.dialogueState(id);
        if (!st) { badShape = id + ': no state'; break; }
        if (!st.name || !st.line || st.line.length < 8) { badShape = id + ': empty line'; break; }
        if (!(st.choices.length >= 2 && st.choices.length <= 3)) {
          badShape = id + ': ' + st.choices.length + ' choices'; break;
        }
        if (st.choices[st.choices.length - 1].kind !== 'leave') { badShape = id + ': no exit'; break; }
        if (firstLines.has(st.line)) { badShape = id + ' shares a line with ' + firstLines.get(st.line); break; }
        firstLines.set(st.line, id);
        perNpc.push({ id, name: st.name, choices: st.choices.length });
      }
      // the npc lane's own roster is covered: every walking person can be talked to
      const rosterIds = (ctx.npcs.roster || []).map((r) => r.id);
      const rosterCovered = rosterIds.every((id) => !!prog.NPCS[id]);

      /* --- 2. the REAL path: the npc lane hands off to this panel --------- */
      const opens = [];
      const offOpen = ctx.events.on('dialogue-open', (e) => opens.push(e.npc));
      const closes = [];
      const offClose = ctx.events.on('dialogue-close', (e) => closes.push(e.npc));
      const opened = ctx.npcs.talkTo('karst');
      await until(() => prog.dialogueUI.isOpen, 3000);
      const panel = prog.dialogueUI.audit();
      const rootShown = !!document.querySelector('#hzc-dlg.show');
      const rows = [...document.querySelectorAll('#hzc-dlg .dlg-choice')];
      const nameOnScreen = (document.querySelector('#hzc-dlg .dlg-name') || {}).textContent || '';
      const lineOnScreen = (document.querySelector('#hzc-dlg .dlg-line') || {}).textContent || '';
      const stateWhileOpen = ctx.state;
      // ...and NOT through the old journal-overlay card
      const journalNotUsed = prog.ui.state !== 'dialogue';

      /* --- 3. a choice ADVANCES state: accept the quest by clicking it ---- */
      const acceptRow = rows.find((r) => r.dataset.kind === 'quest-accept');
      const questId = acceptRow ? acceptRow.dataset.choice.split(':').slice(1).join(':') : null;
      const before = questId ? prog.quests.byId(questId).status : null;
      if (acceptRow) acceptRow.click();
      await sleep(60);
      const after = questId ? prog.quests.byId(questId).status : null;

      /* --- 4. a topic choice changes the line and pays once --------------- */
      const xp0 = prog.totalXp;
      const topicRow = [...document.querySelectorAll('#hzc-dlg .dlg-choice')]
        .find((r) => r.dataset.kind === 'topic');
      const lineBefore = (document.querySelector('#hzc-dlg .dlg-line') || {}).textContent || '';
      if (topicRow) topicRow.click();
      await sleep(60);
      const lineAfter = (document.querySelector('#hzc-dlg .dlg-line') || {}).textContent || '';
      const xpAfterTopic = prog.totalXp;
      // asking the same thing twice does not pay twice
      const seenKey = [...prog.dialogue.seen][0];
      const repaid = seenKey ? prog.award({ xp: 10, reason: 'talk', id: seenKey, once: true }) : 0;

      /* --- 5. leaving closes cleanly and credits the talk ----------------- */
      const talkBefore = prog.tally.talk.karst || 0;
      const leaveRow = [...document.querySelectorAll('#hzc-dlg .dlg-choice')]
        .find((r) => r.dataset.kind === 'leave');
      if (leaveRow) leaveRow.click();
      await until(() => !prog.dialogueUI.isOpen, 3000);
      await sleep(60);
      const talkAfter = prog.tally.talk.karst || 0;
      offOpen(); offClose();

      /* --- 6. a second person gets their OWN lines ------------------------ */
      ctx.npcs.talkTo('maris');
      await until(() => prog.dialogueUI.isOpen, 3000);
      const second = prog.dialogueUI.audit();
      prog.closeDialogue();
      await sleep(60);

      const checks = {
        rosterShape: badShape === null,
        rosterSize: ids.length >= 12,
        rosterCovered,
        opened: opened === true,
        panelOpened: rootShown && panel.open === true,
        nameRendered: nameOnScreen.trim() === 'KARST',
        lineRendered: lineOnScreen.length > 10,
        choicesRendered: rows.length >= 2 && rows.length <= 3,
        stateParked: stateWhileOpen === 'dialogue',
        journalNotUsed,
        openEvent: opens.includes('karst'),
        choiceAdvancedQuest: !!questId && before !== 'active' && after === 'active',
        topicChangedLine: !!topicRow && lineAfter !== lineBefore && lineAfter.length > 10,
        topicPaidOnce: xpAfterTopic > xp0 && repaid === 0,
        closedClean: prog.dialogueUI.isOpen === false && ctx.state === 'playing' && prog.dialogue.open === false,
        closeEvent: closes.includes('karst'),
        talkCredited: talkAfter === talkBefore + 1,
        secondSpeakerDiffers: second.name.trim() === 'MARIS' && second.line !== panel.line,
        doesNotCoverSpeaker: panel.coverage > 0 && panel.coverage < 0.45 && panel.bottomAnchored === true,
      };
      const failed = Object.keys(checks).filter((k) => !checks[k]);
      return {
        pass: failed.length === 0,
        detail: { failed, checks, badShape, npcs: perNpc.length, sample: perNpc.slice(0, 4),
          questId, before, after, coverage: panel.coverage, panelChoices: panel.choices.map((c) => c.kind) },
      };
    })()`,
  },

  /* ---------------------------------------------------------- V45 */
  {
    id: 'V45-dialogue-panel', kind: 'visual', lane: 'progression-expansion',
    title: 'Conversation card open in front of a camp Nora',
    /**
     * Framing: stand where a player would, three and a half metres out, camera
     * on the speaker chest-high, then open the card through the npc lane's own
     * `talkTo`. The judged question is whether the card reads as HZD and leaves
     * the person it belongs to on screen.
     */
    setup: `(async () => {
      const ctx = __CTX__;
      const m = await import('/src/core/progression.js');
      const prog = m.installProgression(ctx);
      ctx.input.enabled = true;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 60 && !ctx.npcs; i++) await sleep(100);
      // level first, then let the level-up banners run out: they are shell-hud's
      // and they would otherwise sit across the middle of the judged frame
      prog.addXp(1400, 'gate');
      await sleep(3900);
      /**
       * Frame the speaker OUTSIDE the huts. The camp is dense — a hand-picked
       * bearing put the camera boom inside a roof — so the gate picks whichever
       * of the roving Nora is furthest from the fire right now and stands
       * beyond them, looking back in. That is also how a player meets them.
       */
      const centre = { x: 18, z: 26 };
      const CANDIDATES = ['bast', 'aura', 'delve', 'olin', 'renn', 'sona', 'karst'];
      const offers = prog.quests.offered();
      let best = null, bestScore = -1, bestId = null, bestD = 0;
      for (const id of CANDIDATES) {
        const rec = ctx.npcs && ctx.npcs.byId ? ctx.npcs.byId.get(id) : null;
        if (!rec || !rec.group) continue;
        const d = Math.hypot(rec.group.position.x - centre.x, rec.group.position.z - centre.z);
        // someone with work to offer draws the third choice row (ACCEPT QUEST)
        const score = d + (offers.some((q) => q.giver === id) ? 100 : 0);
        if (score > bestScore) { bestScore = score; bestD = d; best = rec.group.position; bestId = id; }
      }
      const target = best || { x: 20, y: 0, z: 30 };
      const p = ctx.player;
      /**
       * Open the conversation FIRST. npcs.talkTo stops that person, turns them
       * to the player and holds them for 5.5 s - framing them before that
       * frames where they used to be, which on a route-walker is two metres
       * and a shoulder away by the time the shutter opens.
       */
      ctx.npcs.talkTo(bestId);
      await sleep(220);
      const ox = target.x - centre.x, oz = target.z - centre.z;
      const len = Math.max(0.001, Math.hypot(ox, oz));
      p.position.set(target.x + (ox / len) * 4.2, p.position.y, target.z + (oz / len) * 4.2);
      p.velocity.set(0, 0, 0);
      if (p._snapToGround) p._snapToGround();
      /**
       * Yaw OFF the speaker by ~19 degrees. Aimed dead at them, the chase cam
       * puts Aloy's back exactly where the person is standing and the judged
       * frame shows the player character instead of the speaker.
       */
      p.camYaw = Math.atan2(target.x - p.position.x, target.z - p.position.z) + Math.PI + 0.34;
      p.camPitch = 0.06;
      /**
       * Then raise the boom until the speaker's head sits in the upper third of
       * the frame, measured by PROJECTING it — the people differ in height and
       * stand on different ground, and a hand-tuned pitch put one of them
       * behind the card. Closed loop, bounded, no console noise.
       */
      let ndc = null;
      for (let i = 0; i < 8; i++) {
        await sleep(140);
        const probe = target.clone();
        probe.y += 1.45;
        probe.project(ctx.camera);
        ndc = { x: +probe.x.toFixed(3), y: +probe.y.toFixed(3) };
        if (probe.y >= 0.08 && probe.y <= 0.3) break;
        p.camPitch += probe.y < 0.08 ? 0.05 : -0.04;
      }
      await sleep(120);
      // one topic showing, so the card is judged with real prose on it
      const topic = prog.dialogueState(bestId).choices.find((c) => c.kind === 'topic');
      if (topic) prog.choose(topic.id);
      await sleep(140);
      return { open: prog.dialogueUI.isOpen, npc: prog.dialogue.npc, dist: +bestD.toFixed(1),
        head: ndc, pitch: +p.camPitch.toFixed(2),
        line: prog.dialogueUI.audit().line.slice(0, 40) };
    })()`,
    settle: 2200,
    criteria: 'An HZD-style conversation card: the speaker NAME in tracked caps with their title under it, one spoken line in quotes, and 2-3 numbered choices each with a small role tag (ASK / ACCEPT QUEST / LEAVE) on the right. The card is anchored to the BOTTOM of the frame and the Nora being spoken to is still visible above it. FAIL if the panel is a full-screen modal, if it covers the speaker, if the name/line/choices are not all legible, or if it reads as an undesigned browser list.',
  },

  /* ------------------------------------- A67b (continuation round) */
  {
    id: 'A67b-site-ledgers-expansion', kind: 'action', lane: 'progression-expansion',
    title: 'Both machine-site ledgers hold ONLY live pending sites: a real disposal writes the per-site respawn tuning, a real respawn takes the entry back out of BOTH, a site that repopulates without the event is swept anyway, the lane\'s own dispose() really does empty them (called here, on the live instance) while leaving the frame loop quiet, and installProgression() AFTER that teardown hands back a live rebuilt lane rather than the corpse',
    timeout: 180000,
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
      if (!await rosterReady(ctx)) return { pass: null, detail: 'SKIP: machine roster never became ready' };
      const sites = ctx.machines.sites;
      if (!sites || !Array.isArray(sites.sites)) return { pass: null, detail: 'SKIP: no MachineSite manager' };

      /* ---- 1. three REAL disposals, through the lifecycle's own call ----- */
      const victims = sites.sites.filter((s) => s.machine && s.machine.alive).slice(0, 3);
      if (victims.length < 3) return { pass: null, detail: 'SKIP: fewer than three occupied sites' };
      const ids = victims.map((s) => s.id);
      for (const s of victims) { slay(s.machine); sites.dispose(s.machine); }
      await simWait(ctx, 0.4);
      const tunedAll = ids.every((id) => prog.siteTuning.has(id));
      const clearedAll = ids.every((id) => prog.clearedSites.has(id));
      const pendingAll = ids.every((id) => (sites.sites.find((s) => s.id === id) || {}).pending === true);
      // the tuning is REAL policy, not an empty marker
      const tuning = ids.map((id) => prog.siteTuning.get(id));
      const tuningShaped = tuning.every((t) => t && t.delay > 0 && t.lo > 0 && t.hi >= t.lo && typeof t.cls === 'string');
      // ...and never SLOWER than the stock window machine-ai had scheduled
      const notSlower = ids.every((id) => {
        const s = sites.sites.find((x) => x.id === id);
        return s && s.respawnAt <= sites.clock + 420.01;
      });

      /* ---- 2. a REAL respawn takes the entry out of BOTH ledgers --------- */
      const target = sites.sites.find((s) => s.id === ids[0]);
      // the manager refuses to repopulate within 120 m of the player
      const spots = [[0, 0], [250, 0], [-250, 0], [0, 250], [0, -250]];
      let best = spots[0], bestD = -1;
      for (const [x, z] of spots) {
        const d = Math.hypot(x - target.x, z - target.z);
        if (d > bestD) { bestD = d; best = [x, z]; }
      }
      tp(ctx, best[0], best[1]);
      target.respawnAt = sites.clock - 1;
      const respawned = await until(() => target.machine && !target.pending, 20000);
      await simWait(ctx, 0.4);
      const leftTuning = !prog.siteTuning.has(ids[0]);
      const leftCleared = !prog.clearedSites.has(ids[0]);

      /* ---- 3. a site that repopulates WITHOUT the event is swept anyway --
       * sites.js re-schedules silently when the model is not ready, so the
       * ledgers cannot depend on 'machine-respawned' arriving. Flip the second
       * site back by hand (no event), then drive any disposal and require the
       * sweep to have dropped it.                                          */
      const quiet = sites.sites.find((s) => s.id === ids[1]);
      quiet.pending = false;
      const third = sites.sites.find((s) => s.id === ids[2]);
      prog._pruneSiteLedgers();
      const sweptQuiet = !prog.siteTuning.has(ids[1]) && !prog.clearedSites.has(ids[1]);
      const keptPending = prog.siteTuning.has(ids[2]) && prog.clearedSites.has(ids[2]) && third.pending === true;

      const ledgers = prog.audit().siteLedgers;

      /* ---- 4. TEARDOWN releases both ledgers, for real ------------------
       * The fix round caught this lane claiming dispose() cleared these when
       * the two clear() calls actually sat in newGame() (one of them a
       * duplicate of a line already there, the other on the scratch set). A
       * claim about a method nothing in the shipped graph calls is worth
       * nothing unless a gate calls it, so this block does — on the LIVE
       * instance, last, after the ledgers above are provably non-empty.
       * dispose() takes itself out of ctx.game.systems and update() is inert
       * afterwards, so the frame loop that keeps running under the runner's
       * screenshot must stay quiet: any throw would land in __GAME__.systemErrors
       * and the runner fails this gate on that ledger independently.          */
      const hadLedgers = prog.siteTuning.size > 0 || prog.clearedSites.size > 0;
      const liveScratch = (prog._liveSiteIds?.size ?? 0) > 0;
      const systems = ctx.game?.systems || [];
      const wasRegistered = systems.includes(prog);
      /** the lane's DOM island, counted so the teardown/rebuild is non-vacuous */
      const domNodes = () => {
        const r = document.getElementById('hzc-prog');
        return r ? r.querySelectorAll('*').length + 1 : 0;
      };
      const domBefore = domNodes();
      prog.dispose();
      const disposedEmpty = prog.siteTuning.size === 0 && prog.clearedSites.size === 0
        && prog.trials.size === 0 && (prog._liveSiteIds?.size ?? 0) === 0;
      const leftLoop = !systems.includes(prog);
      // ...and the corpse is inert rather than throwing: drive its own update
      // the way the loop would, plus real simulated frames through the engine.
      let inert = true;
      try { prog.update(1 / 60, ctx.engine.simTime); prog.update(1 / 60, ctx.engine.simTime); }
      catch { inert = false; }
      await simWait(ctx, 0.5);
      const quarantined = (window.__GAME__.systemErrors || [])
        .filter((r) => r && /progression/i.test(String(r.key || '')));
      let idempotent = true;
      try { prog.dispose(); } catch { idempotent = false; }

      /* ---- 5. INSTALL-AFTER-DISPOSE composes: the rebuild is LIVE ---------
       * Fix round 2 finding. dispose() leaves ctx.progression pointing at the
       * corpse on purpose (dependents prefer a quiet object to a dangling
       * undefined), but installProgression used to short-circuit on a bare
       * truthiness test and hand that corpse straight back: out of
       * ctx.game.systems, update() early-returning forever, DOM island gone —
       * and nothing thrown, nothing in systemErrors, so a title-screen ->
       * new-game cycle (shell-menus owns the obvious first caller) would have
       * produced a silently dead progression lane. Measured here through the
       * real published API, immediately after the real teardown above.       */
      const domAfterDispose = domNodes();
      const mod = await import('/src/core/progression.js');   // module cache: same module
      const re = mod.installProgression(ctx);
      const reinstallIsNew = !!re && re !== prog;
      const reinstallLive = !!re && re._disposed !== true;
      const reinstallPublished = ctx.progression === re;
      const reinstallRegistered = systems.includes(re);
      const corpseStaysDead = prog._disposed === true && !systems.includes(prog);
      const domAfterReinstall = domNodes();
      // the island must come BACK, not merely leave an empty shell behind: the
      // corpse's dispose() leaves the bare #hzc-prog div (1 node), so a "> 0"
      // threshold would have passed on the broken build.
      const reinstallDom = domBefore > 0 && domAfterDispose < domBefore
        && domAfterReinstall >= Math.max(10, Math.floor(domBefore * 0.5));
      // ...and it is a WORKING lane, not merely a fresh object: real XP through
      // the real award path, over real frames of the loop it just re-joined,
      // and a real conversation card DRAWN by the rebuilt panel (the corpse's
      // dialogue root was removed and nulled, so it can only fail there).
      const xpBefore = re.xp;
      re.addXp(120, 'kill');
      await simWait(ctx, 0.5);
      const reinstallEarns = re.xp > xpBefore;
      let reinstallDialogue = false;
      try {
        re.talkTo('varl');
        await sleep(200);
        const dlg = document.getElementById('hzc-dlg');
        const txt = dlg ? (dlg.innerText || '').trim() : '';
        reinstallDialogue = !!dlg && re.dialogueUI && re.dialogueUI.isOpen === true && txt.length > 8;
        re.closeDialogue();
        await sleep(120);
      } catch (err) { reinstallDialogue = false; }
      const reinstallIdempotent = mod.installProgression(ctx) === re;
      const quarantined2 = (window.__GAME__.systemErrors || [])
        .filter((r) => r && /progression/i.test(String(r.key || '')));

      const checks = {
        tunedAll, clearedAll, pendingAll, tuningShaped, notSlower,
        respawned,
        leftTuning, leftCleared,
        sweptQuiet,
        keptPending,
        noStaleEntries: ledgers.stale === 0,
        boundedByPending: ledgers.tuning <= ledgers.pending && ledgers.cleared <= ledgers.pending,
        hadLedgers, liveScratch, wasRegistered,
        disposedEmpty, leftLoop, inert, idempotent,
        noQuarantine: quarantined.length === 0,
        reinstallIsNew, reinstallLive, reinstallPublished, reinstallRegistered,
        reinstallDom, reinstallEarns, reinstallDialogue, reinstallIdempotent, corpseStaysDead,
        noQuarantineAfterReinstall: quarantined2.length === 0,
      };
      const failed = Object.keys(checks).filter((k) => !checks[k]);
      return {
        pass: failed.length === 0,
        detail: {
          failed, checks, ids, tuning, ledgers,
          respawnTargetPending: target.pending,
          dom: { before: domBefore, afterDispose: domAfterDispose, afterReinstall: domAfterReinstall },
          xp: { before: xpBefore, after: re.xp },
          quarantined: quarantined.map((r) => r.key + ' x' + r.count),
          quarantined2: quarantined2.map((r) => r.key + ' x' + r.count),
        },
      };
    })()`,
  },
];
