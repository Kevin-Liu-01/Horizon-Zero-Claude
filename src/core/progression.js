/**
 * PROGRESSION  —  lane `progression` (port 5213)
 * ===========================================================================
 * The spine the audit's §1 #8 asks for: XP, levels, a skill tree wired to real
 * gameplay hooks, a data-driven quest registry, the tutorial chain, difficulty,
 * the merchant economy, the camp hunter, and the save/checkpoint/respawn loop.
 *
 * Findings closed here:
 *   progression-001  XP curve + level-up banner + +HP + three skill trees
 *   progression-002  data-driven quest registry (talk/goto/scan/kill/gather)
 *   progression-003  campfire save + Continue + MachineSite respawn + victory
 *                    banner→resume (no more page-reload-to-play-again)
 *   progression-004  merchant: shards ARE currency, buy/sell against real items
 *   progression-005  weapon/ammo TIERS gated by level (D7 slice)
 *   progression-009  side content: four side quests from a named NPC, plus the
 *                    `award()`/`discover()` world-content XP the other lanes'
 *                    24 datapoints / 6 caches / override node / hunting ground
 *                    / fauna kills call into (FIX ROUND 2 — see `award()`)
 *   progression-012  `+XP` from `machine.level` instead of a kill feed
 *   progression-014  difficulty presets (damage in/out, loot, gauge, XP)
 *   progression-019  death reloads the checkpoint — no free pouch refill
 *   missing-systems-title-save-campfire-flow / -npc-dialogue-quests-merchants
 *   missing-systems-difficulty
 *   onboarding-loop-no-tutorial-hunt (data) / -death-no-stakes
 *
 * ---------------------------------------------------------------------------
 * INTEGRATION NOTE (read this first)
 * ---------------------------------------------------------------------------
 * `src/main.js` belongs to `core-platform`, so this lane cannot add itself to
 * the construction list. It therefore ships the same shape `spatial` ships
 * (`installSpatial`): a single idempotent entry point that registers itself as
 * a game system and publishes `ctx.progression`.
 *
 *     import { installProgression } from './core/progression.js';
 *     installProgression(ctx);          // after ctx.interactables, before hud
 *
 * Until `core-platform` adds that line, a page-context probe (and every gate in
 * `tools/gates.round4.progression.mjs`) calls it directly. Importing this
 * module is enough: it auto-installs against `window.__CTX__` when one already
 * exists, so `await import('/src/core/progression.js')` brings the lane up.
 *
 * ---------------------------------------------------------------------------
 * PUBLISHED API — `ctx.progression`
 * ---------------------------------------------------------------------------
 *   level · xp · xpIntoLevel · xpToNext · totalXp · skillPoints · spentPoints
 *   addXp(n, reason, meta?)            xpForKill(machine)
 *   award({xp, reason, id, once?})     -> granted   (world content; see below)
 *   discover(id, {label?, xp?}?)       -> bool      hasDiscovered(id) discoveries()
 *   has(skillId) -> bool               mult(key) -> number      (never NaN, never 0/0)
 *   canUnlock(id) -> {ok, reason}      unlock(id) -> bool       skillTree()
 *   difficulty · difficultyDef · setDifficulty(id) · DIFFICULTIES
 *   quests.start/complete/abandon/track/state/active/completed/all/progress
 *   markers            -> [{ x, y, z, label, questId, objectiveId, kind }]
 *   tier(kind)         -> unlocked weapon/ammo tier for progression-005
 *   merchant.stock()/price(id)/sellPrice(id)/buy(id,n)/sell(id,n)/shards()
 *   talkTo(npcId) · dialogue
 *   save() · hasSave() · continueGame() · newGame() · checkpoint(r) ·
 *   loadCheckpoint() · saves (the SaveSystem)
 *   openQuestLog() · openSkills() · openTrade()
 *   audit()            -> one object with everything a gate needs
 *
 * EVENTS (additive; SPEC §7 reserved `xp-gained`, `level-up`, `quest-*`,
 * `save-written`):
 *   'xp-gained'      { amount, total, level, reason, machine? }
 *   'level-up'       { level, skillPoints, maxHealth, gainedHealth }
 *   'skill-unlocked' { id, name, tree }
 *   'quest-started'  { id, title, type }
 *   'quest-objective'{ questId, objectiveId, label, have, need, done }
 *   'quest-complete' { id, title, rewards }
 *   'quest-tracked'  { id, title }
 *   'banner'         { title, detail, kind }        (shell-hud renders these)
 *   'difficulty-changed' { id, name }
 *   'trade-buy' / 'trade-sell' { id, n, shards }
 *   'dialogue-open' / 'dialogue-close' { npc, node }
 *   'checkpoint-loaded' { reason, killer }
 *   'discovery'      { id, label, total }           (once per id, ever)
 *   'victory-resume' {}                             (shell-menus takes over)
 *
 * ---------------------------------------------------------------------------
 * EXPANSION ROUND (lane `progression-expansion`) — what this file gained
 * ---------------------------------------------------------------------------
 * 1. THE ROSTER. All thirteen of `npc`'s named Nora are registered in `NPCS`
 *    (`NPC_IDS`), each with its own greetings and "ask about…" topics, so
 *    `ctx.npcs.talkTo(id)` opens a conversation for every person in camp
 *    instead of for Varl alone (docs/ROUND4-NPC.md §3).
 *
 *    `dialogueState(npcId)` -> { id, name, title, line, topic, talked,
 *       choices:[{ id, kind:'quest-turnin'|'quest-accept'|'topic'|'trade'|
 *       'journal'|'leave', label, hint, questId?, topicId? }] }   — 2-3 choices,
 *       exit last, HZD's priority order.
 *    `choose(choiceId)` -> { state, closed, action:'trade'|'journal'|null }
 *       — the ONLY place a choice has consequences; `src/ui/dialogue.js` just
 *       draws `state` and calls this back. `timesTalked(id)`.
 *    Events: `dialogue-open {npc,name,times}` · `dialogue-topic {npc,topic}` ·
 *       `dialogue-close {npc}` (unchanged).
 *
 * 2. SITE-ANCHORED SIDE QUESTS. Six new quests (`side-hunting-trial`,
 *    `side-cauldron-override`, `side-outpost-supply`, `side-lakeshore-fisher`,
 *    `side-cave-datapoints`, `side-wreck-salvage`) anchored at
 *    `ctx.props.sites()` BY KIND through `at:{ site, alt? }`, with the authored
 *    `x/z` as the fallback for a build where that site kind does not exist yet.
 *    `objectiveAnchor(questId, objectiveId?)` -> { x, z, site, kind, radius }
 *    publishes where an objective actually points, after resolution.
 *
 * 3. FOUR NEW OBJECTIVE TYPES, each on an event that already existed:
 *       datapoint  'datapoint-collected'   (src/items/datapoints.js)
 *       cache      'supply-cache'          (src/world/props/activities.js)
 *       override   'override-node'         (idem)
 *       hunt       'fauna-killed'          (src/world/fauna.js)
 *    plus `within: seconds` on a kill objective — a TIMED trial. The window
 *    opens when the objective becomes current, restarts when the player
 *    re-enters the ring ('hunting-ground'), and resets its own count when it
 *    lapses. `trialState(questId, objectiveId?)` · `restartTrial(groundId?)`.
 *
 * 4. PER-SITE RESPAWN. `respawnPolicy(site)` / `SITE_RESPAWN` re-time a
 *    MachineSite the frame `machine-ai` disposes it — a trial ring repopulates
 *    in 90-150 s so the trial can be run again, a Thunderjaw in 420-540 s.
 *    Written onto the published `site.respawnAt`, never slower than the stock
 *    window, and never an edit to that lane's file or its tuning table.
 *
 * 5. SAVE covers all of it: the four new tallies, per-quest credit ledgers,
 *    trial windows (as seconds LEFT, so they survive a clock that restarts at
 *    zero), and conversation state (`dialogue.seen` / `dialogue.talked`).
 *
 * CONTINUATION ROUND (Sep 25), both inside this lane, see
 * `docs/ROUND4-PROGRESSION.md` §5:
 *
 * 6. THE TURN-IN TAKES THE GOODS. A `gather` objective with `deliver: true` is
 *    handed over at completion — `_deliverGoods` removes it before the payout
 *    and raises `quest-delivered`. Four bounties used to pay on top of goods
 *    the player kept, and one of them asked for forty of the CURRENCY itself.
 *
 * 7. THE TRIAL HAS A CLOCK. `activeTrial()` answers "is a window running, and
 *    on what" (pre-formatted `mmss`), and `_tickTrials` pushes it into the
 *    lane's own `.pg-trial` chip at 5 Hz. `shell-hud` never took the render in
 *    §3.8 and a `within:` objective was counting down invisibly; the chip
 *    stands down the moment `ctx.hud.trialClock` appears.
 *
 * Gates: `tools/gates.round4.progression-expansion.mjs` —
 * `A66-quest-objectives-expansion` (now also `goodsDelivered` +
 * `trialClockDrawn`), `A65-save-restore-expansion`, `A99-dialogue`,
 * `V45-dialogue-panel` (the two suffixed ids are the audit's A66/A65 renamed
 * because lane `progression` already owns those ids).
 */

import * as THREE from 'three';
import { SaveSystem, SLOT } from './save.js';
import { QuestLogUI } from '../ui/quests.js';
import { SkillTreeUI } from '../ui/skills.js';
import { DialogueUI } from '../ui/dialogue.js';

/* ========================================================================== */
/* 1. XP + LEVELS                                                             */
/* ========================================================================== */

export const MAX_LEVEL = 20;

/** XP needed to go from `level` to `level + 1`. */
export function xpToNextAt(level) {
  const L = Math.max(1, level | 0);
  if (L >= MAX_LEVEL) return Infinity;
  return Math.round(100 + 55 * (L - 1) + 9 * (L - 1) * (L - 1));
}

/** Health granted by each level-up (progression-001: "+HP"). */
export const HEALTH_PER_LEVEL = 15;
export const POINTS_PER_LEVEL = 1;

/**
 * `progression-012` — XP is a function of `machine.level`, which the species
 * files already carry (strider 4 · watcher 5 · scrapper 6 · glinthawk 8 ·
 * longleg 12 · sawtooth 15 · behemoth 25 · thunderjaw 27). No kill feed, no
 * flat number: a Thunderjaw is worth eleven Watchers, and that is the whole
 * reason to go and fight one.
 */
export function xpForMachineLevel(level) {
  const L = Math.max(1, Number(level) || 1);
  return Math.round(10 * L * (1 + 0.06 * L));
}

/**
 * `award({xp, reason, id})` de-duplicates on `reason:id` so a re-entered
 * interactable cannot farm XP — EXCEPT for the reasons listed here, which are
 * events that legitimately recur under a stable id. `world/fauna.js:624` passes
 * the SPECIES key (`'boar'`, `'rabbit'`) as its id, so every boar after the
 * first would pay nothing if `hunt` were treated as one-shot. A caller can
 * force either behaviour per call with `award({..., once: true|false})`.
 */
export const AWARD_REPEATABLE = new Set(['hunt', 'kill', 'combat', 'trial', 'bonus']);

/**
 * `discover(id)` ids that name a PLACE, and the banner text for each.
 *
 * The ledger takes any id, but only a place gets the DISCOVERED banner. The
 * other two live callers are the 24 `dp-*` records, and `focus-items` already
 * renders a DATAPOINT card off `datapoint-collected` — a second overlay reading
 * "DISCOVERED · DP SPAN 1" would be the same pickup announced twice, in slug
 * case. Those still enter the ledger and still raise `discovery`, so a Notebook
 * or world map can count them; they just do not shout. A caller that wants a
 * banner for an id this map does not know passes its own
 * `discover(id, { label })`.
 */
export const PLACE_NAMES = {
  tallneck: 'TALLNECK',
  'override-tallneck': 'TALLNECK',
  'hunting-ground-valley': 'HUNTING GROUND',
};

/* ========================================================================== */
/* 2. SKILL TREES — 12 nodes, every one wired to a real hook                  */
/* ========================================================================== */

/**
 * `mult` keys are read through `progression.mult(key)` and are applied at the
 * call sites listed in `hook`. Nothing here is a number on a screen that does
 * not exist: every node changes a value the simulation already reads this
 * frame. Where a hook lives in another lane's file, this lane installs a
 * documented wrapper (see `_installHooks`) rather than editing that file, and
 * the wrapper disappears the moment the owner reads `mult()` natively.
 */
export const SKILLS = [
  /* ---- PROWLER (stealth) ---- */
  {
    id: 'prowler-silent-strike', tree: 'Prowler', tier: 1, cost: 1,
    name: 'Silent Strike', requires: [],
    desc: 'Strikes from cover deal +75% damage.',
    mult: { silentStrikeDamage: 1.75 },
    hook: 'Machine.takeDamage — hit.type "silent-strike"/"melee-stealth"',
  },
  {
    id: 'prowler-low-profile', tree: 'Prowler', tier: 1, cost: 1,
    name: 'Low Profile', requires: [],
    desc: 'Machines fill their suspicion 35% slower while you are crouched.',
    mult: { detectionRate: 0.65 },
    hook: 'suspicion growth damping in Progression.update',
  },
  {
    id: 'prowler-quiet-step', tree: 'Prowler', tier: 2, cost: 1,
    name: 'Quiet Sprint', requires: ['prowler-low-profile'],
    desc: 'The noise you make carries 40% less far.',
    mult: { noiseRadius: 0.6 },
    hook: 'machines.noise() wrapper',
  },
  {
    id: 'prowler-strike-from-above', tree: 'Prowler', tier: 3, cost: 2,
    name: 'Strike from Above', requires: ['prowler-silent-strike'],
    desc: 'Silent Strike damage doubles again, and tears components loose.',
    mult: { silentStrikeDamage: 2.0, tearOut: 1.15 },
    hook: 'Machine.takeDamage',
  },

  /* ---- BRAVE (combat) ---- */
  {
    id: 'brave-precision', tree: 'Brave', tier: 1, cost: 1,
    name: 'Precision', requires: [],
    desc: 'All weapon impact damage +15%.',
    mult: { damageOut: 1.15 },
    hook: 'Machine.takeDamage — hit.impact',
  },
  {
    id: 'brave-concentration', tree: 'Brave', tier: 1, cost: 1,
    name: 'Concentration+', requires: [],
    desc: 'Concentration lasts 60% longer.',
    mult: { concentrationDuration: 1.6 },
    hook: 'combat.concentration.gauge top-up in Progression.update',
  },
  {
    id: 'brave-fortitude', tree: 'Brave', tier: 2, cost: 1,
    name: 'Fortitude', requires: ['brave-concentration'],
    desc: 'You take 20% less damage.',
    mult: { damageIn: 0.8 },
    hook: 'player.takeDamage wrapper',
  },
  {
    id: 'brave-tinker', tree: 'Brave', tier: 2, cost: 2,
    name: 'Tinker', requires: ['brave-precision'],
    desc: 'Tear damage +30%; components come off faster.',
    mult: { tearOut: 1.3 },
    hook: 'Machine.takeDamage — hit.tear',
  },

  /* ---- FORAGER (survival) ---- */
  {
    id: 'forager-gatherer', tree: 'Forager', tier: 1, cost: 1,
    name: 'Gatherer', requires: [],
    desc: 'Resource pickups yield 1 extra.',
    mult: { gatherYield: 1 },
    hook: "'item-gained' listener (re-entrant-guarded inventory.add)",
  },
  {
    id: 'forager-herbalist', tree: 'Forager', tier: 1, cost: 1,
    name: 'Herbalist', requires: [],
    desc: 'Medicinal herbs restore 50% more, and the pouch holds 25 more.',
    mult: { herbPotency: 1.5, pouchBonus: 25 },
    hook: 'player.addPouch wrapper + player.maxPouch on unlock',
  },
  {
    id: 'forager-scavenger', tree: 'Forager', tier: 2, cost: 1,
    name: 'Scavenger', requires: ['forager-gatherer'],
    desc: 'Machine wrecks pay 35% more shards.',
    mult: { lootYield: 1.35 },
    hook: "'machine-killed' shard payout",
  },
  {
    id: 'forager-healer', tree: 'Forager', tier: 3, cost: 2,
    name: 'Healer', requires: ['forager-herbalist'],
    desc: 'The pouch holds 30 more still, and you keep half of it when you fall.',
    mult: { pouchBonus: 30, deathPouchKeep: 0.5 },
    hook: 'player.maxPouch on unlock + checkpoint restore',
  },
];

export const SKILL_TREES = ['Prowler', 'Brave', 'Forager'];

/** Defaults for every multiplier key. Additive keys default to 0. */
const MULT_DEFAULTS = {
  silentStrikeDamage: 1, detectionRate: 1, noiseRadius: 1, tearOut: 1,
  damageOut: 1, damageIn: 1, concentrationDuration: 1, herbPotency: 1,
  lootYield: 1, gatherYield: 0, pouchBonus: 0, deathPouchKeep: 0,
};
/** Keys that ADD instead of multiply. */
const ADDITIVE = new Set(['gatherYield', 'pouchBonus', 'deathPouchKeep']);

/* ========================================================================== */
/* 3. DIFFICULTY (missing-systems-difficulty / progression-014)               */
/* ========================================================================== */

export const DIFFICULTIES = [
  { id: 'story',     name: 'Story',      damageIn: 0.35, damageOut: 1.60, loot: 1.35, gauge: 1.60, xp: 0.90 },
  { id: 'easy',      name: 'Easy',       damageIn: 0.60, damageOut: 1.25, loot: 1.15, gauge: 1.25, xp: 0.95 },
  { id: 'normal',    name: 'Normal',     damageIn: 1.00, damageOut: 1.00, loot: 1.00, gauge: 1.00, xp: 1.00 },
  { id: 'hard',      name: 'Hard',       damageIn: 1.45, damageOut: 0.85, loot: 0.90, gauge: 0.85, xp: 1.10 },
  { id: 'very-hard', name: 'Very Hard',  damageIn: 1.90, damageOut: 0.75, loot: 0.80, gauge: 0.70, xp: 1.20 },
  { id: 'ultra',     name: 'Ultra Hard', damageIn: 2.50, damageOut: 0.65, loot: 0.70, gauge: 0.55, xp: 1.35 },
];

/* ========================================================================== */
/* 4. WEAPON / AMMO TIERS (progression-005, D7 slice)                         */
/* ========================================================================== */

/**
 * The whole arsenal used to be available at spawn, which is why the first hunt
 * had no shape. Tiers gate AMMO TYPES by level; the bows themselves stay, so
 * nothing another lane owns has to change for this to read correctly. `combat`
 * (and the wheel) can consult `progression.ammoUnlocked(id)`; until it does,
 * the quest rewards hand the ammo over at the same pace.
 */
export const AMMO_TIERS = {
  hunter: 1, harvest: 1,
  fire: 2, hardpoint: 2,
  shock: 4, tearblast: 4,
  freeze: 6, precision: 6,
  'blast-bomb': 8, disc: 8,
};

/* ========================================================================== */
/* 5. MERCHANT (progression-004)                                             */
/* ========================================================================== */

/** Shards ARE the currency: `metal-shards` in the real inventory, nothing new. */
export const CURRENCY = 'metal-shards';

export const MERCHANT_STOCK = [
  { id: 'ridge-wood',     price: 4,  qty: 40 },
  { id: 'blaze',          price: 9,  qty: 24 },
  { id: 'sparker',        price: 11, qty: 18 },
  { id: 'chillwater',     price: 11, qty: 18 },
  { id: 'echo-shell',     price: 14, qty: 12 },
  { id: 'wire',           price: 7,  qty: 30 },
  { id: 'blastpaste',     price: 22, qty: 10 },
  { id: 'metal-vessel',   price: 18, qty: 10 },
  { id: 'medicinal-herb', price: 12, qty: 20 },
];

/** What the hunter pays for the trophies machines actually drop. */
export const SELL_VALUES = {
  'watcher-lens': 55, 'sawtooth-lens': 95, 'behemoth-lens': 140, 'thunderjaw-lens': 220,
  'watcher-heart': 120, 'sawtooth-heart': 190, 'behemoth-heart': 280, 'thunderjaw-heart': 420,
  'machine-core': 90, 'machine-heart': 150,
  'luminous-braiding': 210, 'crystal-braiding': 260,
  'echo-shell': 7, 'blastpaste': 11, 'metal-vessel': 9, 'wire': 3,
  'blaze': 4, 'sparker': 5, 'chillwater': 5, 'ridge-wood': 2,
};

/* ========================================================================== */
/* 6. NPC + DIALOGUE (missing-systems-npc-dialogue-quests-merchants)          */
/* ========================================================================== */

/**
 * THE ROSTER (expansion round).
 *
 * `npc` (port 5218) ships thirteen named Nora and routes every `TALK · NAME`
 * interactable through `ctx.npcs.talkTo(id)`, which hands off to
 * `progression.talkTo(id)` **only when `progression.NPCS[id]` exists**
 * (docs/ROUND4-NPC.md §3). Until this round exactly one id existed, so twelve
 * of the thirteen people in camp emitted an event nobody rendered and the
 * player got a hold prompt that did nothing.
 *
 * Every row is now registered, and each carries its own voice:
 *   greeting  2-3 lines, picked by what the run has actually done
 *   topics    the "ask about…" choices — a choice ADVANCES state (the topic is
 *             logged in `dialogue.seen`, pays its 10 XP once through the same
 *             `award()` ledger a datapoint uses, and raises `dialogue-topic`)
 *   trade     whether this person opens the merchant panel
 *
 * `lines` authored on the npc lane's own roster row (`ctx.npcs.roster`) are
 * merged in at read time by `_dialogueFor`, so that lane can rewrite a line
 * without touching this file and neither lane owns the other's copy.
 */
export const NPCS = {
  varl: {
    id: 'varl', name: 'Varl', title: 'Hunter of the Valley', trade: true,
    fallback: { x: 24.6, z: 32.2 },
    greeting: [
      'You slept through dawn again. The machines did not.',
      'Still breathing. The valley has not taken you yet.',
      'Back from the grass? Good. Sit, or trade, or go be useful.',
    ],
    topics: [
      { id: 'machines', q: 'What should I know about the machines?', a: 'They are herd animals with metal hearts. Watch one long enough and it tells you where it will be.' },
      { id: 'valley', q: 'Who holds the valley now?', a: 'We do, from the palisade out to the ridge. Past that it belongs to whatever walks it.' },
    ],
  },
  sona: {
    id: 'sona', name: 'Sona', title: 'War-Chief', fallback: { x: 16, z: 44 },
    greeting: [
      'Eyes on the ridge. The Watchers walk it at dusk.',
      'You shoot well enough. Now learn to leave before the herd answers.',
    ],
    topics: [
      { id: 'watch', q: 'What is the war-party watching for?', a: 'Corrupted ones out of the south. They do not graze and they do not leave.' },
      { id: 'orders', q: 'Any orders for me?', a: 'Stay useful and stay alive. In that order, if you can manage both.' },
    ],
  },
  teb: {
    id: 'teb', name: 'Teb', title: 'Stitcher', fallback: { x: 30, z: 20 },
    greeting: [
      'Hide takes a week to soften. Patience is the craft.',
      'Careful of the frame — that skin is half a moon of work.',
    ],
    topics: [
      { id: 'craft', q: 'What are you working on?', a: 'A winter coat for Karst. He will complain about the collar. He always does.' },
      { id: 'hides', q: 'Do you need anything brought in?', a: 'Boar hide, always. Bring it clean and I will not ask how you got it.' },
    ],
  },
  bast: {
    id: 'bast', name: 'Bast', title: 'Hunter', fallback: { x: 38, z: 34 },
    greeting: [
      'The gate stays watched. That is the whole of it.',
      'You want the trial? The ground south-east. Bring arrows, not opinions.',
    ],
    topics: [
      { id: 'trial', q: 'Tell me about the hunting ground.', a: 'A ring of wrecks the scrappers claim every season. Clear it inside the light and the Braves will hear of it.' },
      { id: 'boast', q: 'How many have you taken?', a: 'Enough that I have stopped counting out loud. Ask me again when you pass me.' },
    ],
  },
  vala: {
    id: 'vala', name: 'Vala', title: 'Storyteller', fallback: { x: 20, z: 28 },
    greeting: [
      'Sit. The fire is better with a story on it.',
      'You came back. That is already half a story.',
    ],
    topics: [
      { id: 'hollow', q: 'What is in the Hollow?', a: 'Voices in the old metal. The Elders call it wind. I have been inside, and wind does not repeat itself.' },
      { id: 'story', q: 'Tell me a story.', a: 'A hunter once outran a Thunderjaw. She did it by being three valleys away when it woke.' },
    ],
  },
  karst: {
    id: 'karst', name: 'Karst', title: 'Elder', fallback: { x: 14, z: 30 },
    greeting: [
      'I have seen the metal beasts change. They learn. So must we.',
      'Sit with an old man a moment. My knees have opinions about the cold.',
    ],
    topics: [
      { id: 'cauldron', q: 'What is the door under the hill?', a: 'A Cauldron. The metal beasts are born there. The Matriarchs forbid it, which is how I know it can be opened.' },
      { id: 'law', q: 'What does the law say about the ruins?', a: 'That they are forbidden. And that a Seeker may walk where the law does not. Read the law carefully.' },
    ],
  },
  maris: {
    id: 'maris', name: 'Maris', title: 'Trader', trade: true, fallback: { x: 28, z: 40 },
    greeting: [
      'Shards for arrows, arrows for shards. Everyone eats.',
      'You look like a woman with a full pouch and an empty pack.',
    ],
    topics: [
      { id: 'road', q: 'How is the trade road?', a: 'Walked by Scrappers and nobody else. The outpost has not had a delivery in a moon.' },
      { id: 'prices', q: 'Why are your prices what they are?', a: 'Because I am the only one carrying. Bring me competition and I will bring you a discount.' },
    ],
  },
  olin: {
    id: 'olin', name: 'Olin', title: 'Gatherer', fallback: { x: 12, z: 22 },
    greeting: [
      'Berries by the west wall, if the birds leave any.',
      'Do not step on the beds. I will know it was you.',
    ],
    topics: [
      { id: 'herbs', q: 'Where does the medicine grow?', a: 'Low ground, near water, in the shade. The bloom is worth three of the moss — do not trample it to get to it.' },
      { id: 'birds', q: 'The birds?', a: 'Grouse. Fat ones. Hunt them away from the beds and we will both be happy.' },
    ],
  },
  thok: {
    id: 'thok', name: 'Thok', title: 'Smith', fallback: { x: 34, z: 24 },
    greeting: [
      'Bring me metal shards and I will bring you arrowheads.',
      'The forge is hot and the crates are empty. You see my problem.',
    ],
    topics: [
      { id: 'salvage', q: 'What do you need from the wrecks?', a: 'Anything sealed. The caches out there hold better steel than anything we can draw from ore.' },
      { id: 'spear', q: 'Can you work on my spear?', a: 'I could. I would rather you brought me something to work WITH.' },
    ],
  },
  renn: {
    id: 'renn', name: 'Renn', title: 'Lookout', fallback: { x: 10, z: 38 },
    greeting: [
      'Nothing on the south line. Yet.',
      'Quiet is not the same as safe. Quiet is what it sounds like before.',
    ],
    topics: [
      { id: 'south', q: 'What is moving in the south?', a: 'Something tall enough to see over the tanks. It has not come closer. I would rather it stayed that way.' },
      { id: 'night', q: 'How is the night watch?', a: 'Cold. Long. Better than the alternative, which is not watching.' },
    ],
  },
  delve: {
    id: 'delve', name: 'Delve', title: 'Hunter', fallback: { x: 42, z: 30 },
    greeting: [
      'Two Striders on the west meadow. Easy shards, hard shots.',
      'You hunt loud. That is not a compliment, it is an observation.',
    ],
    topics: [
      { id: 'herd', q: 'Where is the herd grazing?', a: 'West meadow, past the stones. Take the lead one first or you will be chasing all six.' },
      { id: 'bow', q: 'Any advice on the bow?', a: 'Draw before you need it. A full draw late is worse than a half draw early.' },
    ],
  },
  aura: {
    id: 'aura', name: 'Aura', title: 'Gatherer', fallback: { x: 18, z: 18 },
    greeting: [
      'The racks will be full before the light goes.',
      'If you are heading to the water, I have a favour to ask.',
    ],
    topics: [
      { id: 'lake', q: 'What is down at the water?', a: 'Snapmaws, most days. And the best fishing in the valley, on the days they are elsewhere.' },
      { id: 'racks', q: 'Do you need a hand?', a: 'Hands I have. Meat I do not. Bring me something from the shore and we are square.' },
    ],
  },
  nil: {
    id: 'nil', name: 'Nil', title: 'Hunter', fallback: { x: 26, z: 16 },
    greeting: [
      'A spear you have not sharpened is a stick.',
      'Strike first, strike close, and do not tell Sona I said so.',
    ],
    topics: [
      { id: 'spear', q: 'Teach me something about the spear.', a: 'Get under the guard. A machine cannot bite what is already inside its reach.' },
      { id: 'stealth', q: 'How do you get that close?', a: 'Tall grass and patience. Mostly patience. The grass is easy to find.' },
    ],
  },
};

/** Every id the dialogue panel can open, in camp order. */
export const NPC_IDS = Object.keys(NPCS);

/* ========================================================================== */
/* 7. QUEST REGISTRY (progression-002 / onboarding-loop-no-tutorial-hunt)     */
/* ========================================================================== */

/**
 * Objective types — every one of them completes on a REAL event that already
 * exists in the build, which is the entire point of `A66-quest-objectives`:
 *
 *   talk   { npc }                    'dialogue-close' with that npc
 *   goto   { x, z, radius, label }    proximity, sampled at 5 Hz
 *   scan   { kind?, count }           'machine-tagged' (Focus, T)
 *   kill   { kind?, count }           'machine-killed'
 *   gather { item, count }            'item-gained'
 */
export const QUESTS = [
  /* --------------------------- MAIN: the tutorial chain ------------------- */
  {
    id: 'lessons-of-the-valley',
    title: 'Lessons of the Valley',
    type: 'main',
    giver: 'varl',
    autoStart: true,
    summary: 'Varl will not let you leave camp until you can look at a machine without dying to it.',
    objectives: [
      { id: 'talk', type: 'talk', npc: 'varl', label: 'Speak with Varl at the campfire' },
      { id: 'ridge', type: 'goto', x: -18, z: -34, radius: 9, label: 'Walk out to the north ridge' },
      { id: 'scan', type: 'scan', kind: 'watcher', count: 1, label: 'Scan a Watcher with your Focus (V, then T)' },
      { id: 'kill', type: 'kill', kind: 'watcher', count: 1, label: 'Bring down a Watcher' },
      { id: 'wood', type: 'gather', item: 'ridge-wood', count: 3, label: 'Gather Ridge-Wood for arrows' },
    ],
    rewards: { xp: 180, shards: 60, items: [{ id: 'blaze', n: 6 }], skillPoints: 1 },
    next: 'proving-of-the-hunt',
  },
  {
    id: 'proving-of-the-hunt',
    title: 'Proving of the Hunt',
    type: 'main',
    giver: 'varl',
    summary: 'A Watcher is a scout. Varl wants to know you can take what the scouts call in.',
    objectives: [
      { id: 'herd', type: 'kill', kind: 'strider', count: 2, label: 'Cull two Striders from the west herd' },
      { id: 'scrap', type: 'kill', kind: 'scrapper', count: 2, label: 'Clear two Scrappers off the wrecks' },
      { id: 'herb', type: 'gather', item: 'medicinal-herb', count: 2, label: 'Restock your pouch with herbs' },
    ],
    rewards: { xp: 320, shards: 120, items: [{ id: 'wire', n: 8 }], skillPoints: 1 },
    next: 'the-thunderjaw',
  },
  {
    id: 'the-thunderjaw',
    title: 'The Thunderjaw',
    type: 'main',
    giver: 'varl',
    summary: 'Something in the southern flats walks like a mountain. Kill it and the valley is ours.',
    objectives: [
      { id: 'saw', type: 'kill', kind: 'sawtooth', count: 1, label: 'Kill a Sawtooth to prove the spear' },
      { id: 'scan', type: 'scan', kind: 'thunderjaw', count: 1, label: 'Scan the Thunderjaw before you commit' },
      { id: 'tj', type: 'kill', kind: 'thunderjaw', count: 1, label: 'Destroy the Thunderjaw' },
    ],
    rewards: { xp: 900, shards: 400, items: [{ id: 'blastpaste', n: 4 }], skillPoints: 2 },
    victory: true,
  },

  /* ------------------------------- SIDE quests ---------------------------- */
  {
    id: 'side-broken-nest',
    title: 'The Broken Nest',
    type: 'side',
    giver: 'varl',
    offerAtLevel: 2,
    summary: 'Scrappers have moved into the old wrecks east of camp. They eat everything, including hunters.',
    objectives: [
      { id: 'scan', type: 'scan', kind: 'scrapper', count: 2, label: 'Scan two Scrappers' },
      { id: 'kill', type: 'kill', kind: 'scrapper', count: 3, label: 'Destroy three Scrappers' },
    ],
    rewards: { xp: 220, shards: 90, items: [{ id: 'metal-vessel', n: 2 }] },
  },
  {
    id: 'side-herbalists-debt',
    title: "The Herbalist's Debt",
    type: 'side',
    giver: 'varl',
    offerAtLevel: 2,
    summary: 'Camp is out of medicine and Varl is too proud to gather it himself.',
    objectives: [
      // a bounty you ACCEPT: what you are already carrying counts (see `_tallySnapshot`)
      { id: 'herb', type: 'gather', item: 'medicinal-herb', count: 5, fromStock: true, deliver: true, label: 'Gather five medicinal herbs' },
      { id: 'back', type: 'talk', npc: 'varl', label: 'Bring them back to Varl' },
    ],
    rewards: { xp: 160, shards: 140 },
  },
  {
    id: 'side-lens-trade',
    title: 'Lenses for the Trade Road',
    type: 'side',
    giver: 'varl',
    offerAtLevel: 3,
    summary: 'Watcher lenses fetch a good price on the trade road. Varl wants two.',
    objectives: [
      { id: 'lens', type: 'gather', item: 'watcher-lens', count: 2, fromStock: true, deliver: true, label: 'Recover two Watcher Lenses' },
    ],
    rewards: { xp: 200, shards: 180, items: [{ id: 'echo-shell', n: 3 }] },
  },
  {
    id: 'side-the-long-watch',
    title: 'The Long Watch',
    type: 'side',
    giver: 'varl',
    offerAtLevel: 4,
    summary: 'Something tall is walking the eastern shelf at night. Varl wants a name for it.',
    objectives: [
      { id: 'goto', type: 'goto', x: 152, z: 88, radius: 14, label: 'Reach the eastern shelf' },
      { id: 'scan', type: 'scan', kind: 'longleg', count: 1, label: 'Scan a Longleg' },
    ],
    rewards: { xp: 280, shards: 150, skillPoints: 1 },
  },

  /* ------------------- SIDE quests anchored at the world's SITES ----------- */
  /**
   * EXPANSION ROUND. `world-props` publishes `ctx.props.sites()` — datapoints,
   * caches, the override node, the hunting ground, and (as that lane's own
   * expansion lands) the outpost, the cauldron mouth, the lakeshore and the
   * wrecks. These six quests are anchored to those sites BY KIND, not by
   * coordinate: `_anchor()` resolves `at:{site}` against the live registry at
   * read time and falls back to the authored `x/z` when that kind does not
   * exist yet. So the same quest points at the real outpost the day it ships
   * and at the container yard until then — no cross-lane edit either way.
   *
   * Objective types added this round, every one on a REAL published event:
   *   datapoint  'datapoint-collected'  (src/items/datapoints.js)
   *   cache      'supply-cache'         (src/world/props/activities.js)
   *   override   'override-node'        (idem)
   *   hunt       'fauna-killed'         (src/world/fauna.js)
   *   kill + `within`  a TIMED trial: the window starts when the objective
   *                    becomes current, restarts when the player re-enters the
   *                    hunting ground, and resets its own count when it lapses.
   */
  {
    id: 'side-hunting-trial',
    title: 'The Valley Trial',
    type: 'side',
    giver: 'bast',
    offerAtLevel: 2,
    site: 'hunting-ground',
    summary: 'Bast says the Braves only count a hunt that was finished before the light went. The trial ring is south-east.',
    objectives: [
      { id: 'ground', type: 'goto', at: { site: 'hunting-ground' }, x: 128, z: -78, radius: 12, label: 'Reach the hunting ground' },
      {
        id: 'trial', type: 'kill', kind: 'scrapper', count: 3, within: 300,
        trial: 'hunting-ground', at: { site: 'hunting-ground' }, x: 128, z: -78,
        label: 'Take three Scrappers inside the trial window',
      },
    ],
    rewards: { xp: 260, shards: 120, items: [{ id: 'wire', n: 6 }], skillPoints: 1 },
  },
  {
    id: 'side-cauldron-override',
    title: 'The Cauldron Door',
    type: 'side',
    giver: 'karst',
    offerAtLevel: 2,
    site: 'cauldron',
    summary: 'Karst will not say the word out loud. The door under the hill is a Cauldron, and it answers to an override.',
    objectives: [
      { id: 'terminal', type: 'goto', at: { site: 'cauldron', alt: 'override' }, x: -36, z: 213, radius: 14, label: 'Reach the Cauldron terminal' },
      { id: 'records', type: 'datapoint', count: 3, at: { site: 'datapoint' }, label: 'Scan three datapoints inside' },
      { id: 'node', type: 'override', count: 1, at: { site: 'override' }, label: 'Override the node' },
    ],
    rewards: { xp: 340, shards: 160, items: [{ id: 'echo-shell', n: 3 }], skillPoints: 1 },
  },
  {
    id: 'side-outpost-supply',
    title: 'Supply Run',
    type: 'side',
    giver: 'maris',
    offerAtLevel: 2,
    site: 'outpost',
    summary: 'The outpost has not had a delivery in a moon. Maris has the shards; she does not have the legs.',
    objectives: [
      { id: 'wood', type: 'gather', item: 'ridge-wood', count: 6, deliver: true, label: 'Gather six Ridge-Wood for the run' },
      { id: 'crate', type: 'cache', count: 1, at: { site: 'cache' }, label: 'Empty a supply cache on the road' },
      { id: 'drop', type: 'goto', at: { site: 'outpost' }, x: 185, z: 5, radius: 14, label: 'Carry it out to the outpost' },
      { id: 'report', type: 'talk', npc: 'maris', label: 'Report back to Maris' },
    ],
    rewards: { xp: 240, shards: 150, items: [{ id: 'wire', n: 6 }, { id: 'blaze', n: 4 }] },
  },
  {
    id: 'side-lakeshore-fisher',
    title: "The Fisher's Request",
    type: 'side',
    giver: 'aura',
    offerAtLevel: 2,
    site: 'lakeshore',
    summary: 'Aura wants meat off the shore and would rather not meet whatever is basking on it.',
    objectives: [
      { id: 'shore', type: 'goto', at: { site: 'lakeshore', alt: 'lake' }, x: -146, z: -100, radius: 16, label: 'Walk down to the lakeshore' },
      { id: 'game', type: 'hunt', count: 2, label: 'Hunt two animals by the water' },
      { id: 'back', type: 'talk', npc: 'aura', label: 'Bring the catch back to Aura' },
    ],
    rewards: { xp: 200, shards: 110, items: [{ id: 'medicinal-herb', n: 3 }] },
  },
  {
    id: 'side-cave-datapoints',
    title: 'Echoes in the Hollow',
    type: 'side',
    giver: 'vala',
    offerAtLevel: 3,
    site: 'cave',
    summary: 'Vala has heard the old metal repeat itself inside the Hollow. She wants to know what it is saying.',
    objectives: [
      { id: 'mouth', type: 'goto', at: { site: 'cave', alt: 'hollow' }, x: -166, z: 118, radius: 16, label: 'Find the mouth of the Hollow' },
      { id: 'records', type: 'datapoint', count: 2, at: { site: 'datapoint' }, label: 'Recover two datapoints from the dark' },
      { id: 'tell', type: 'talk', npc: 'vala', label: 'Tell Vala what the voices said' },
    ],
    rewards: { xp: 220, shards: 100, items: [{ id: 'echo-shell', n: 2 }] },
  },
  {
    id: 'side-wreck-salvage',
    title: 'Salvage for the Forge',
    type: 'side',
    giver: 'thok',
    offerAtLevel: 2,
    site: 'wreck',
    summary: 'Thok has a hot forge and empty crates. The sealed caches out in the wrecks hold better steel than the ore does.',
    objectives: [
      { id: 'caches', type: 'cache', count: 2, at: { site: 'cache' }, label: 'Empty two sealed caches in the wrecks' },
      { id: 'metal', type: 'gather', item: 'metal-shards', count: 40, fromStock: true, deliver: true, label: 'Carry forty Metal Shards to the forge' },
      { id: 'hand', type: 'talk', npc: 'thok', label: 'Hand the salvage to Thok' },
    ],
    rewards: { xp: 260, items: [{ id: 'blaze', n: 8 }, { id: 'metal-vessel', n: 2 }], skillPoints: 1 },
  },
];

/* ========================================================================== */
/* 7b. SITE RESPAWN POLICY (progression-003, expansion round)                 */
/* ========================================================================== */

/**
 * `machine-ai` owns the MachineSite scheduler and draws EVERY site from one
 * window (`SITE.respawn = [300, 420]`), so the trial ring a side quest asks you
 * to clear three times repopulates on the same clock as the Thunderjaw that is
 * meant to be a landmark. This lane owns what the schedule means to the run, so
 * it re-times the site the frame it is disposed — a published field on a
 * published record, never an edit to that lane's file or its tuning table.
 *
 * Windows are in seconds and are all INSIDE machine-ai's own upper bound, so
 * nothing here can make a site slower than the stock scheduler would have.
 */
export const SITE_RESPAWN = {
  trial: [90, 150],     // inside a hunting ground: the trial has to be re-runnable
  quest: [120, 180],    // an active quest is asking for this kind right now
  small: [240, 330],    // watcher · strider · grazer · broadhead · scrapper
  medium: [330, 450],   // sawtooth · longleg · snapmaw · shellwalker · ravager · redeye · glinthawk
  large: [420, 540],    // thunderjaw · behemoth · stormbird · corruptor
};

const RESPAWN_CLASS = {
  watcher: 'small', strider: 'small', grazer: 'small', broadhead: 'small', scrapper: 'small',
  sawtooth: 'medium', longleg: 'medium', snapmaw: 'medium', shellwalker: 'medium',
  ravager: 'medium', redeye: 'medium', glinthawk: 'medium',
  thunderjaw: 'large', behemoth: 'large', stormbird: 'large', corruptor: 'large',
};

/**
 * Seconds -> `M:SS`, the way HZD writes a Hunting Ground clock. Rounds UP so a
 * clock reading `0:01` still has time on it and `0:00` is genuinely spent.
 */
export function mmss(seconds) {
  const s = Math.max(0, Math.ceil(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Deterministic 0..1 from a site id — a save and a gate must agree on it. */
function siteJitter(id) {
  let h = (id | 0) * 2654435761;
  h ^= h >>> 15;
  return ((h >>> 0) % 1000) / 1000;
}

/* ========================================================================== */

const _v = new THREE.Vector3();
/** Reused by `_anchor` so a 5 Hz proximity sweep allocates nothing. */
const _anchorOut = { x: 0, z: 0, ok: false, site: null };

/**
 * Run tallies — one bucket per objective type that COUNTS something, so credit
 * earned before an objective became current is never thrown away (see the
 * `this.tally` comment in the constructor). The expansion round adds the four
 * world-content types; `freshTally` is the single place the shape is defined,
 * used by the constructor, `newGame()` and `deserialize()` alike.
 */
export const TALLY_TYPES = ['kill', 'scan', 'talk', 'datapoint', 'cache', 'override', 'hunt'];
function freshTally(src = null) {
  const out = Object.create(null);
  for (const t of TALLY_TYPES) out[t] = { ...(src && src[t] ? src[t] : {}) };
  return out;
}

/** Loot paid in shards per machine level when a wreck is destroyed. */
const SHARDS_PER_LEVEL = 6;

export class Progression {
  constructor(ctx, opts = {}) {
    this.ctx = ctx;
    this.name = 'progression';

    /**
     * The registries, hung off the instance so the two UI files can read them
     * without importing back into this module (quests.js is imported FROM
     * here; a circular import would put these consts in TDZ at eval time).
     */
    this.SKILLS = SKILLS;
    this.SKILL_TREES = SKILL_TREES;
    this.QUESTS = QUESTS;
    this.NPCS = NPCS;
    this.DIFFICULTIES = DIFFICULTIES;
    this.AMMO_TIERS = AMMO_TIERS;

    /* ---- level / xp ---- */
    this.level = 1;
    this.xpIntoLevel = 0;
    this.totalXp = 0;
    this.skillPoints = 0;
    this.unlocked = new Set();
    this.baseMaxHealth = ctx.player?.maxHealth ?? 100;
    this.baseMaxPouch = ctx.player?.maxPouch ?? 100;

    /* ---- difficulty ---- */
    this._difficulty = 'normal';

    /* ---- quests ---- */
    /** @type {Map<string, {id,state,counts:Record<string,number>,startedAt}>} */
    this.questState = new Map();
    this.tracked = null;
    this.markers = [];
    /** how many rows in `markers` are `talk` anchors — see `_refreshTalkMarkers` */
    this._talkRows = 0;
    this._markersDirty = true;

    /* ---- stats ---- */
    this.stats = {
      kills: 0, scans: 0, gathers: 0, deaths: 0, shardsEarned: 0, questsDone: 0,
      respawns: 0, sitesCleared: 0,
    };
    this.killsByKind = Object.create(null);
    /**
     * RUN TALLIES — the fix for out-of-order objective credit (fix round 1).
     *
     * Objectives complete IN ORDER (that is what makes the tutorial a
     * tutorial), and the old `_advance` threw away any event that did not
     * match the objective standing at the front of the queue. So the single
     * most likely path through `lessons-of-the-valley` — Focus-tag the Watcher
     * you can see while Varl is still talking — silently lost the scan, and
     * the obvious recovery (tag it again) is a NO-OP because
     * `FocusSystem.tagTarget()` is a toggle: the second press removes the tag
     * and emits nothing. The player was stuck on step 3 with no feedback.
     *
     * So every scan/kill/talk is counted here the moment it happens, whatever
     * objective is current, and an objective SETTLES against these counters
     * the moment it becomes current (`_settle`). Ordering is preserved — you
     * still cannot finish step 4 before step 3 — but work the run already did
     * is never thrown away. Keys are the machine kind / npc id, plus `'*'` for
     * the "any" objectives. Baselines are snapshotted per quest at
     * `startQuest`, so a quest accepted after a long hunt is not instantly
     * completed by kills that predate it.
     */
    this.tally = freshTally();
    /**
     * Simulated seconds since the lane came up — the clock a TIMED trial
     * objective (`within`) is judged on. Accumulated from the fixed-step `dt`
     * in `update()`, never from the wall clock, so a loaded frame cannot fail
     * a hunt the player was winning.
     */
    this.clock = 0;
    /** `questId:objectiveId` -> { endsAt, startedAt } for `within` objectives. */
    this.trials = new Map();
    /** Was a window open on the previous sampler tick? (see `_tickTrials`) */
    this._hadTrial = false;
    /** Sites whose machine is gone and whose respawn is pending. */
    this.clearedSites = new Set();
    /** siteId -> the window this lane re-timed it to (diagnostic, see audit). */
    this.siteTuning = new Map();
    /** one-second cache of `ctx.props.sites()` — see `_sites()`. */
    this._sitesCache = [];
    this._sitesAt = null;
    this.lastKiller = null;

    /**
     * `award()` / `discover()` ledgers — see the two methods below. Both are
     * serialized, so a reload cannot re-farm a one-shot pickup and the Notebook
     * / world map can ask what this run has already found.
     */
    this.awarded = new Set();
    this.discovered = new Set();

    /* ---- runtime ---- */
    this.saves = new SaveSystem(ctx, this);
    this._gotoT = 0;
    this._suspPrev = new WeakMap();
    this._inGrant = false;
    this._victoryT = -1;
    this._deathPouch = 0;
    this._campEntry = null;
    this._npcEntry = null;
    this._hooked = false;
    this._hookT = 0;
    /** Bounded: 30 s of 1 Hz retries, then this lane stops asking. */
    this._hookTries = 0;
    this._off = [];
    this._multCache = Object.create(null);
    this._multDirty = true;
    this._bootT = 0;
    /** item id -> last observed inventory count (gather backstop, `_pollInventory`). */
    this._invSeen = new Map();
    /** key -> count of foreign listener faults swallowed (see `_emit`). */
    this._emitFaults = Object.create(null);

    /* ---- UI (this lane owns both files) ---- */
    this.ui = new QuestLogUI(ctx, this);
    this.skillsUI = new SkillTreeUI(ctx, this);
    /** The conversation card (expansion round). Owns its own DOM island. */
    this.dialogueUI = new DialogueUI(ctx, this);

    /* ---- merchant ---- */
    this.merchant = this._makeMerchant();

    /* ---- dialogue ---- */
    /**
     * `topic` is the line currently on the card, `seen` the topics this run has
     * already heard (one 10 XP award each, through the same ledger a datapoint
     * uses), `talked` how many conversations each person has had. All three are
     * serialized: a choice is state, and A65 restores it.
     */
    this.dialogue = {
      open: false, npc: null, topic: null,
      seen: new Set(), talked: Object.create(null),
    };

    this._bind();
    this._installHooks();
    this._seedSeen();

    // difficulty persists across runs even without a save file
    const meta = this.saves.meta();
    if (meta.difficulty && DIFFICULTIES.some((d) => d.id === meta.difficulty)) {
      this._difficulty = meta.difficulty;
    }

    if (opts.autoStart !== false) this._startAutoQuests();
  }

  /* ====================================================================== */
  /* level / xp                                                             */
  /* ====================================================================== */

  get xp() { return this.totalXp; }
  get xpToNext() { return xpToNextAt(this.level); }
  get spentPoints() {
    let n = 0;
    for (const id of this.unlocked) n += (SKILLS.find((s) => s.id === id)?.cost ?? 1);
    return n;
  }

  /** XP a machine is worth, before the difficulty multiplier. */
  xpForKill(machine) {
    return xpForMachineLevel(machine?.level ?? 1);
  }

  /**
   * The one way XP enters the game. Returns the amount actually granted so a
   * gate can assert `after - before === xpForKill(m)`.
   */
  addXp(amount, reason = 'kill', meta = null) {
    let n = Math.max(0, Math.round(Number(amount) || 0));
    if (!n) return 0;
    if (reason === 'kill') n = Math.max(1, Math.round(n * this.difficultyDef.xp));
    this.totalXp += n;
    this.xpIntoLevel += n;
    this._emit('xp-gained', {
      amount: n, total: this.totalXp, level: this.level, reason,
      machine: meta?.machine ?? null,
    });
    let guard = 0;
    while (this.level < MAX_LEVEL && this.xpIntoLevel >= this.xpToNext && guard++ < 64) {
      this.xpIntoLevel -= this.xpToNext;
      this._levelUp();
    }
    if (this.level >= MAX_LEVEL) this.xpIntoLevel = 0;
    this.ui.refreshXp();
    return n;
  }

  /**
   * WORLD-CONTENT XP — `award({ xp, reason, id })` → granted.
   *
   * FIX ROUND 2 (judge: "`progression.award()` / `discover()` never published —
   * all side-content and fauna XP silently pays 0"). Eight live call sites in
   * two other lanes' files were already calling this API against the shape
   * documented in `docs/ROUND4-WORLD-PROPS.md:106`:
   *
   *   src/world/props/activities.js:439  discover(id)            (datapoint)
   *   src/world/props/activities.js:440  award 25  'datapoint'   × 24
   *   src/world/props/activities.js:524  award 15  'cache'       × 6
   *   src/world/props/activities.js:541  award 150 'override-node'
   *   src/world/props/activities.js:542  discover('tallneck')
   *   src/world/props/activities.js:562  discover(hunting-ground)
   *   src/world/fauna.js:624             award 20/12 'hunt'      × every kill
   *
   * `?.award?.(...)` means a missing method throws nothing — it just pays
   * nothing, so 840 XP of pickups plus every fauna kill was being dropped in
   * silence against a main chain worth 1400. The `progression-009` line in this
   * file's header was claiming side content closed while its XP went nowhere.
   *
   * Deduplication is `reason:id`, because the two kinds of caller are different:
   * an interactable is one-shot (`activities` already guards with `once:true` /
   * `d.found`, but this ledger is what survives a page reload and what stops a
   * second system re-raising the same pickup from paying twice), while a fauna
   * kill recurs under a species id and must pay every time — see
   * `AWARD_REPEATABLE`. `once` overrides the default either way.
   *
   * Accepts the positional form `award(25, 'datapoint', id)` too, so a caller
   * that guesses the simpler signature is not silently paid 0 a second time.
   */
  award(spec, reason2, id2) {
    let xp; let reason; let id; let once;
    if (typeof spec === 'number') {
      xp = spec; reason = reason2 ?? 'bonus'; id = id2 ?? null; once = undefined;
    } else if (spec && typeof spec === 'object') {
      xp = spec.xp ?? spec.amount ?? 0;
      reason = spec.reason ?? 'bonus';
      id = spec.id ?? null;
      once = spec.once;
    } else return 0;

    const n = Math.max(0, Math.round(Number(xp) || 0));
    if (!n) return 0;

    const key = id == null ? null : `${reason}:${id}`;
    const oneShot = once === undefined
      ? (key != null && !AWARD_REPEATABLE.has(reason))
      : !!once;
    if (oneShot && key != null) {
      if (this.awarded.has(key)) return 0;
      this.awarded.add(key);
    }
    return this.addXp(n, reason, { id });
  }

  /**
   * ONE-SHOT DISCOVERY LEDGER — `discover(id, opts?)` → whether it was new.
   *
   * The other half of the API the world lanes call. Idempotent per id: it
   * emits `discovery` exactly once, whatever re-raises it, which is what a
   * Notebook / world-map entry wants (and what stops a re-entered hunting
   * ground spamming the banner strip). It pays no XP of its own —
   * `activities.js:439-440` pairs `discover(id)` with its own `award(...)`, so
   * granting here would double-pay — but `discover(id, { xp })` routes through
   * `award()` for a caller that wants one call.
   *
   * The DISCOVERED banner is reserved for ids that name a place (`PLACE_NAMES`,
   * or an explicit `opts.label`); see that map for why the 24 datapoint ids are
   * deliberately silent.
   */
  discover(id, opts = null) {
    if (id == null || id === '') return false;
    const key = String(id);
    if (this.discovered.has(key)) return false;
    this.discovered.add(key);
    // hasOwn, not a bare lookup: an id of "constructor" or "toString" would
    // otherwise resolve to a function off Object.prototype and banner it
    const named = opts?.label ?? (Object.hasOwn(PLACE_NAMES, key) ? PLACE_NAMES[key] : null);
    const xp = Number(opts?.xp) || 0;
    if (xp > 0) this.award({ xp, reason: opts?.reason ?? 'discovery', id: key });
    this._emit('discovery', {
      id: key, label: named, place: !!named, total: this.discovered.size,
    });
    if (named) this.banner('DISCOVERED', named, 'discovery');
    return true;
  }

  /** Has this run already logged `id`? (world map / Notebook) */
  hasDiscovered(id) { return this.discovered.has(String(id)); }

  /** Everything this run has logged, in insertion order. */
  discoveries() { return [...this.discovered]; }

  _levelUp() {
    this.level++;
    this.skillPoints += POINTS_PER_LEVEL;
    const p = this.ctx.player;
    let gained = 0;
    if (p) {
      gained = HEALTH_PER_LEVEL;
      p.maxHealth = this.baseMaxHealth + HEALTH_PER_LEVEL * (this.level - 1);
      p.health = p.maxHealth;                 // canon: a level-up heals you
      this._emit('player-hurt', { health: p.health, max: p.maxHealth });
    }
    this._emit('level-up', {
      level: this.level, skillPoints: this.skillPoints,
      maxHealth: p?.maxHealth ?? 0, gainedHealth: gained,
    });
    /**
     * ONE banner, one path (fix round 1, judge: "every level-up renders the
     * LEVEL banner twice"). `banner()` already emits the `banner` event for
     * shell-hud AND appends the `.pg-banner` node through `QuestLogUI.banner`,
     * so the old follow-up `ui.levelUpBanner(...)` appended a second, identical
     * node that stacked over the NEW QUEST card. `levelUpBanner` is gone from
     * quests.js with it — the formatting lives here.
     */
    this.banner(`LEVEL ${this.level}`, `+${gained} HEALTH   ·   +${POINTS_PER_LEVEL} SKILL POINT`, 'level');
  }

  /** Applies the level/skill health + pouch bonuses to the live player. */
  _applyBodyBonuses() {
    const p = this.ctx.player;
    if (!p) return;
    const maxH = this.baseMaxHealth + HEALTH_PER_LEVEL * (this.level - 1);
    const ratio = p.maxHealth > 0 ? p.health / p.maxHealth : 1;
    p.maxHealth = maxH;
    p.health = Math.min(maxH, Math.max(0, maxH * ratio));
    const maxP = this.baseMaxPouch + this.mult('pouchBonus');
    p.maxPouch = maxP;
    p.pouch = Math.min(p.pouch, maxP);
  }

  /* ====================================================================== */
  /* skills                                                                 */
  /* ====================================================================== */

  has(skillId) { return this.unlocked.has(skillId); }

  /** Multiplier (or additive bonus) for a hook key. Never NaN. */
  mult(key) {
    if (this._multDirty) this._rebuildMults();
    const v = this._multCache[key];
    return v === undefined ? (MULT_DEFAULTS[key] ?? 1) : v;
  }

  _rebuildMults() {
    const out = this._multCache;
    for (const k in MULT_DEFAULTS) out[k] = MULT_DEFAULTS[k];
    for (const s of SKILLS) {
      if (!this.unlocked.has(s.id) || !s.mult) continue;
      for (const k in s.mult) {
        if (ADDITIVE.has(k)) out[k] = (out[k] ?? 0) + s.mult[k];
        else out[k] = (out[k] ?? 1) * s.mult[k];
      }
    }
    // difficulty folds into the same two combat channels the skills use
    const d = this.difficultyDef;
    out.damageIn *= d.damageIn;
    out.damageOut *= d.damageOut;
    out.lootYield *= d.loot;
    out.concentrationDuration *= d.gauge;
    this._multDirty = false;
  }

  skillTree() {
    return SKILLS.map((s) => ({
      ...s,
      unlocked: this.unlocked.has(s.id),
      available: this.canUnlock(s.id).ok,
    }));
  }

  canUnlock(id) {
    const s = SKILLS.find((x) => x.id === id);
    if (!s) return { ok: false, reason: 'no such skill' };
    if (this.unlocked.has(id)) return { ok: false, reason: 'already unlocked' };
    for (const r of s.requires || []) {
      if (!this.unlocked.has(r)) {
        const req = SKILLS.find((x) => x.id === r);
        return { ok: false, reason: `requires ${req?.name ?? r}` };
      }
    }
    if (this.skillPoints < s.cost) return { ok: false, reason: `needs ${s.cost} skill point${s.cost > 1 ? 's' : ''}` };
    return { ok: true, reason: '' };
  }

  unlock(id) {
    const check = this.canUnlock(id);
    if (!check.ok) return false;
    const s = SKILLS.find((x) => x.id === id);
    this.skillPoints -= s.cost;
    this.unlocked.add(id);
    this._multDirty = true;
    this._applyBodyBonuses();
    this._emit('skill-unlocked', { id, name: s.name, tree: s.tree });
    this.banner('SKILL LEARNED', s.name.toUpperCase(), 'skill');
    this.skillsUI.refresh();
    this.ui.refreshXp();
    return true;
  }

  /* ====================================================================== */
  /* difficulty                                                             */
  /* ====================================================================== */

  get difficulty() { return this._difficulty; }
  get difficultyDef() {
    return DIFFICULTIES.find((d) => d.id === this._difficulty) ?? DIFFICULTIES[2];
  }

  setDifficulty(id) {
    const d = DIFFICULTIES.find((x) => x.id === id);
    if (!d) return false;
    this._difficulty = d.id;
    this._multDirty = true;
    this.saves.writeMeta({ difficulty: d.id });
    this._emit('difficulty-changed', { id: d.id, name: d.name });
    return true;
  }

  /* ====================================================================== */
  /* tiers (progression-005)                                                */
  /* ====================================================================== */

  ammoUnlocked(ammoId) { return this.level >= (AMMO_TIERS[ammoId] ?? 1); }
  tier(ammoId) { return AMMO_TIERS[ammoId] ?? 1; }
  /** Every ammo id currently permitted, for `combat`/the wheel to filter on. */
  unlockedAmmo() { return Object.keys(AMMO_TIERS).filter((id) => this.ammoUnlocked(id)); }

  /* ====================================================================== */
  /* quests                                                                 */
  /* ====================================================================== */

  get quests() {
    if (!this._questApi) {
      const self = this;
      this._questApi = {
        all: () => QUESTS.map((q) => self.state(q.id)),
        active: () => QUESTS.filter((q) => self.questState.get(q.id)?.state === 'active').map((q) => self.state(q.id)),
        completed: () => QUESTS.filter((q) => self.questState.get(q.id)?.state === 'done').map((q) => self.state(q.id)),
        offered: () => QUESTS.filter((q) => self._isOffered(q)).map((q) => self.state(q.id)),
        byId: (id) => self.state(id),
        def: (id) => QUESTS.find((q) => q.id === id) ?? null,
        start: (id) => self.startQuest(id),
        complete: (id) => self._completeQuest(id, true),
        abandon: (id) => self.abandonQuest(id),
        track: (id) => self.track(id),
        get tracked() { return self.tracked ? self.state(self.tracked) : null; },
        progress: (id) => self.state(id)?.progress ?? 0,
      };
    }
    return this._questApi;
  }

  /** Full view of one quest: definition + live counters. */
  state(id) {
    const def = QUESTS.find((q) => q.id === id);
    if (!def) return null;
    const st = this.questState.get(id);
    const counts = st?.counts ?? Object.create(null);
    let done = 0;
    const objectives = def.objectives.map((o) => {
      const need = o.count ?? 1;
      const have = Math.min(need, counts[o.id] ?? 0);
      const complete = have >= need;
      if (complete) done++;
      return { ...o, have, need, done: complete };
    });
    return {
      id: def.id, title: def.title, type: def.type, giver: def.giver,
      summary: def.summary, rewards: def.rewards,
      status: st?.state ?? (this._isOffered(def) ? 'offered' : 'locked'),
      objectives,
      current: objectives.find((o) => !o.done) ?? null,
      progress: def.objectives.length ? done / def.objectives.length : 0,
      tracked: this.tracked === def.id,
    };
  }

  _isOffered(def) {
    if (this.questState.get(def.id)) return false;
    if (def.autoStart) return true;
    if (def.offerAtLevel != null) return this.level >= def.offerAtLevel;
    // chain quests are offered by their predecessor's `next`
    return QUESTS.some((q) => q.next === def.id && this.questState.get(q.id)?.state === 'done');
  }

  startQuest(id) {
    const def = QUESTS.find((q) => q.id === id);
    if (!def) return false;
    const existing = this.questState.get(id);
    if (existing && existing.state !== 'abandoned') return false;
    this.questState.set(id, {
      id, state: 'active', counts: Object.create(null), startedAt: Date.now(),
      // credit bookkeeping — see `this.tally`
      base: this._tallySnapshot(def),
      used: Object.create(null),
      reached: Object.create(null),
    });
    this._markersDirty = true;
    if (!this.tracked || def.type === 'main') this.track(id);
    this._emit('quest-started', { id, title: def.title, type: def.type });
    this.banner('NEW QUEST', def.title.toUpperCase(), 'quest');
    this.ui.refresh();
    // credit anything this run already earned: wood gathered before he asked,
    // a Watcher scanned on the walk in, a Scrapper already down.
    this._settle(id);
    return true;
  }

  abandonQuest(id) {
    const st = this.questState.get(id);
    if (!st || st.state !== 'active') return false;
    const def = QUESTS.find((q) => q.id === id);
    if (def?.type === 'main') return false;      // the chain is not optional
    st.state = 'abandoned';
    if (this.tracked === id) this.track(this._firstActive());
    this._markersDirty = true;
    this.ui.refresh();
    return true;
  }

  track(id) {
    if (id && !QUESTS.some((q) => q.id === id)) return false;
    this.tracked = id ?? null;
    this._markersDirty = true;
    const def = QUESTS.find((q) => q.id === this.tracked);
    this._emit('quest-tracked', { id: this.tracked, title: def?.title ?? null });
    this._emitObjectiveChanged();
    this.ui.refresh();
    return true;
  }

  _firstActive() {
    for (const q of QUESTS) if (this.questState.get(q.id)?.state === 'active') return q.id;
    return null;
  }

  /* ------------------------- credit bookkeeping ------------------------- */

  /** Ledger key for an objective: type + the thing it is counting. */
  _objKey(o) {
    /**
     * Tallied types share a key on purpose: two "kill 2 Striders" steps in one
     * quest must draw from the same run tally, four kills between them.
     * `goto` is NOT tallied — it is a per-objective boolean in `st.reached` —
     * so it keys on the objective id. Sharing `goto:*` across two places in one
     * quest made the first arrival spend the credit for the second, which then
     * could never complete.
     */
    if (o.type === 'goto') return `goto:${o.id}`;
    return `${o.type}:${o.kind ?? o.npc ?? o.item ?? o.species ?? o.node ?? o.dp ?? '*'}`;
  }

  /**
   * Shallow copy of the run tallies, taken when a quest starts, plus the stock
   * of every item that quest asks you to gather.
   *
   * The item baseline is why the tutorial still teaches gathering: Aloy starts
   * with 20 ridge-wood, so crediting "have 3 ridge-wood" against the bag would
   * tick "Gather Ridge-Wood for arrows" off the instant the Watcher fell. An
   * objective marked `fromStock` opts out and counts what you are already
   * carrying — that is the right reading for a bounty you ACCEPT ("Varl wants
   * two lenses"), and the wrong one for a step whose whole job is to make you
   * pick something up.
   */
  _tallySnapshot(def = null) {
    const snap = freshTally(this.tally);
    snap.items = Object.create(null);
    const inv = this.ctx.inventory;
    for (const o of (def?.objectives || [])) {
      if (o.type === 'gather' && o.item) snap.items[o.item] = inv?.count?.(o.item) ?? 0;
    }
    return snap;
  }

  /** Count one scan/kill/talk into the run tallies, whatever quest is current. */
  _bump(type, key) {
    const t = this.tally[type];
    if (!t) return;
    if (key) t[key] = (t[key] ?? 0) + 1;
    t['*'] = (t['*'] ?? 0) + 1;
  }

  /** Machines currently wearing a Focus tag that match `kind` (belt for scan). */
  _liveTags(kind) {
    const tags = this.ctx.focus?.tags;
    if (!tags || !tags.size) return 0;
    if (!kind) return tags.size;
    let n = 0;
    for (const m of tags.keys()) if (m?.kind === kind) n++;
    return n;
  }

  /**
   * How much credit objective `o` can still claim from work the run already
   * did, over and above what this quest has already spent on it (`st.used`).
   * Never negative.
   */
  _earned(st, o) {
    /**
     * A TIMED objective only ever takes credit from inside its own window. The
     * window re-baselines the tally when it opens, so this is belt and braces —
     * but a trial that could be settled by yesterday's kills is not a trial.
     */
    if (o.within && !this.trials.has(this._trialKey(st.id, o.id))) return 0;
    const used = st.used?.[this._objKey(o)] ?? 0;
    let n = 0;
    switch (o.type) {
      case 'gather': {
        const held = this.ctx.inventory?.count?.(o.item) ?? 0;
        n = o.fromStock ? held : held - (st.base?.items?.[o.item] ?? 0);
        break;
      }
      case 'kill': case 'scan': {
        const k = o.kind ?? '*';
        n = (this.tally[o.type][k] ?? 0) - (st.base?.[o.type]?.[k] ?? 0);
        // A tag standing on screen right now is proof you scanned that machine,
        // even if the emit predates this quest or was toggled off and on.
        if (o.type === 'scan') n = Math.max(n, this._liveTags(o.kind));
        break;
      }
      /**
       * World-content types (expansion round). Identical bookkeeping to
       * kill/scan: the run tallies every pickup the moment it happens, the
       * quest's baseline was snapshotted when it started, and `used` is what
       * this quest already spent — so a cache emptied on the walk out counts
       * when the objective comes up, and a reload cannot double-credit it.
       */
      case 'datapoint': case 'cache': case 'override': case 'hunt': {
        const k = o.id2 ?? o.dp ?? o.node ?? o.species ?? '*';
        n = (this.tally[o.type][k] ?? 0) - (st.base?.[o.type]?.[k] ?? 0);
        break;
      }
      case 'talk':
        n = (this.tally.talk[o.npc] ?? 0) - (st.base?.talk?.[o.npc] ?? 0);
        break;
      case 'goto':
        n = st.reached?.[o.id] ? 1 : 0;
        break;
      default: return 0;
    }
    return Math.max(0, n - used);
  }

  /**
   * Put `amount` on one objective and tell everyone. The single place a
   * counter moves, so `_advance` (live event) and `_settle` (earned earlier)
   * fire identical events, banners and marker invalidation.
   */
  _credit(def, st, o, amount) {
    const need = o.count ?? 1;
    const have = st.counts[o.id] ?? 0;
    if (have >= need || !(amount > 0)) return false;
    const next = Math.min(need, have + amount);
    st.counts[o.id] = next;
    const key = this._objKey(o);
    if (st.used) st.used[key] = (st.used[key] ?? 0) + (next - have);
    this._emit('quest-objective', {
      questId: def.id, objectiveId: o.id, label: o.label,
      have: next, need, done: next >= need,
    });
    if (next >= need) {
      this._markersDirty = true;
      if (this.tracked === def.id) {
        this.banner('OBJECTIVE COMPLETE', o.label.toUpperCase(), 'objective');
      }
    }
    return true;
  }

  /** The first objective that is not finished, or null. */
  _current(def, st) {
    for (const o of def.objectives) {
      if ((st.counts[o.id] ?? 0) < (o.count ?? 1)) return o;
    }
    return null;
  }

  /**
   * The objective engine. Every gameplay event funnels through here with a
   * `type` and a matcher; nothing else in this file knows how a quest advances.
   * Only the CURRENT objective can take a live event (order is the tutorial);
   * anything the event earned that a later step will want was already counted
   * into `this.tally`, and `_settle` hands it over when that step comes up.
   */
  _advance(type, match, amount = 1) {
    /**
     * DOUBLE-CREDIT FIX (expansion round, found on film by the trial gate).
     *
     * This used to credit the current objective DIRECTLY and then call
     * `_settleAll()` — two paths that both pay out of the same run tally, with
     * nothing to stop them paying for the same event twice. The race is not
     * hypothetical and it is not rare: `machine-killed` bumps the tally, then
     * pays shards through `_grant`, which emits `item-gained`, which re-enters
     * `_advance('gather')`, which settles — and the settle credits the kill
     * from the tally *before* the kill's own `_credit` line has run. One
     * Scrapper then counted as two.
     *
     * It was invisible for a year because every kill objective in the shipped
     * chain asks for a number the FIRST credit already reaches (1), so the
     * second was clamped by `_credit`'s `have >= need` guard. `A66-…-expansion`
     * measured a 3-kill trial and read 2 after one kill.
     *
     * So there is now exactly ONE way a counter moves: `_earned` (tally minus
     * this quest's baseline minus what it has already spent) through `_settle`.
     * Live events bump the tally and then ask for a settle — same events, same
     * banners, same tick, arithmetic that cannot pay twice. `type`/`match`/
     * `amount` stay in the signature because the callers read as documentation
     * of which event feeds which objective type, and because `_earned` is
     * keyed off exactly the fields `match` tests.
     */
    void type; void match; void amount;
    const settled = this._settleAll();
    if (settled) { this.ui.refresh(); this._emitObjectiveChanged(); }
    return settled;
  }

  /**
   * Settle every active quest's current objective against work the run already
   * did (`_earned`). Runs after every credit, on every quest start, and from
   * the 5 Hz sampler — so a scan banked three steps early lands the instant its
   * step comes up, with the same banner it would have had live.
   */
  _settleAll() {
    if (this._settling) return false;
    this._settling = true;
    let changed = false;
    try {
      for (const def of QUESTS) {
        const st = this.questState.get(def.id);
        if (!st || st.state !== 'active') continue;
        if (this._settle(def.id, true)) changed = true;
      }
    } finally { this._settling = false; }
    return changed;
  }

  /**
   * Walk one quest forward as far as banked credit allows, in order, then
   * complete it if every objective is done.
   */
  _settle(id, nested = false) {
    const def = QUESTS.find((q) => q.id === id);
    const st = this.questState.get(id);
    if (!def || !st || st.state !== 'active') return false;
    let changed = false;
    // bounded: each pass either finishes an objective or stops
    for (let guard = 0; guard <= def.objectives.length; guard++) {
      const o = this._current(def, st);
      if (!o) break;
      const avail = this._earned(st, o);
      if (!(avail > 0)) break;
      if (!this._credit(def, st, o, avail)) break;
      changed = true;
      if ((st.counts[o.id] ?? 0) < (o.count ?? 1)) break;   // partial: still current
    }
    if (!this._current(def, st)) this._completeQuest(id);
    if (changed && !nested) { this.ui.refresh(); this._emitObjectiveChanged(); }
    return changed;
  }

  _completeQuest(id, force = false) {
    const st = this.questState.get(id);
    const def = QUESTS.find((q) => q.id === id);
    if (!def || !st || st.state === 'done') return false;
    if (force) for (const o of def.objectives) st.counts[o.id] = o.count ?? 1;
    st.state = 'done';
    st.doneAt = Date.now();
    this.stats.questsDone++;
    this._markersDirty = true;

    // HAND THE GOODS OVER BEFORE THE PAYOUT: a bounty that leaves the herbs in
    // your pouch is a gift, not a trade (see `_deliverGoods`).
    const handed = this._deliverGoods(def, st);

    const r = def.rewards || {};
    if (r.xp) this.addXp(r.xp, 'quest');
    if (r.shards) this._grant(CURRENCY, r.shards);
    for (const it of (r.items || [])) this._grant(it.id, it.n ?? 1);
    if (r.skillPoints) this.skillPoints += r.skillPoints;

    this._emit('quest-complete', { id, title: def.title, rewards: r, delivered: handed });
    this.banner('QUEST COMPLETE', def.title.toUpperCase(), 'quest-done');

    if (this.tracked === id) this.track(this._firstActive());
    if (def.next) {
      // chained quests offer themselves; auto-start the main line so the
      // tutorial never dead-ends on a menu the player has not found yet
      const nextDef = QUESTS.find((q) => q.id === def.next);
      if (nextDef && !this.questState.get(def.next)) this.startQuest(def.next);
    }
    if (def.victory) this._onVictory();
    this.checkpoint('quest');
    this.ui.refresh();
    return true;
  }

  _emitObjectiveChanged() {
    const s = this.tracked ? this.state(this.tracked) : null;
    const title = s ? s.title : 'THE VALLEY';
    const detail = s?.current?.label ?? (s ? 'Return to camp' : 'Hunt as you please');
    if (title === this._lastObjTitle && detail === this._lastObjDetail) return;
    this._lastObjTitle = title;
    this._lastObjDetail = detail;
    // legacy SPEC event — audio + the Round 3 HUD both key off it
    this._emit('objective-changed', { title, detail });
  }

  /* ====================================================================== */
  /* markers (for shell-hud compass + shell-menus map)                      */
  /* ====================================================================== */

  _rebuildMarkers() {
    this._markersDirty = false;
    const out = this.markers;
    out.length = 0;
    this._talkRows = 0;
    const terrain = this.ctx.terrain;
    for (const def of QUESTS) {
      const st = this.questState.get(def.id);
      if (!st || st.state !== 'active') continue;
      const s = this.state(def.id);
      const o = s.current;
      if (!o) continue;
      let x = null, z = null; const kind = o.type;
      let npcId = null;
      if (o.type === 'talk') {
        npcId = o.npc;
        const npc = this._npcPos(o.npc);
        if (npc) { x = npc.x; z = npc.z; }
      } else {
        // goto / datapoint / cache / override / timed kill — all of them resolve
        // through the site registry, so the pip lands on the real thing
        const a = this._anchor(o);
        if (a.ok) { x = a.x; z = a.z; }
      }
      if (x == null) continue;
      out.push({
        x, y: (terrain?.getHeight?.(x, z) ?? 0) + 1.6, z,
        label: o.label, questId: def.id, objectiveId: o.id,
        kind, tracked: this.tracked === def.id,
        radius: o.radius ?? 2.5,
        /** set only on `talk` rows — the id `_refreshTalkMarkers` re-reads */
        npc: npcId,
      });
      if (npcId) this._talkRows++;
    }
    return out;
  }

  /**
   * FIX ROUND 1 — the gold pip on a PERSON has to follow the person.
   *
   * `_rebuildMarkers` bakes the anchor into scalars and only re-runs when
   * `_markersDirty` is set, which nothing does on a timer. Every other anchor
   * kind (`goto`/`datapoint`/`cache`/`override`) resolves through the static
   * `ctx.props.sites()` registry and is genuinely static, so caching is right
   * for them — but `npc` (port 5218) walks thirteen Nora around camp, and this
   * lane put four `talk` objectives on the roving ones. Measured: the marker
   * for "Bring the catch back to Aura" sat frozen while Aura walked 7.8 m away,
   * three times its own 2.5 m ring, so the player stood inside the marker with
   * no TALK prompt. Max roam over 70 s reaches 21.7 m (sona).
   *
   * So `talk` rows resolve LIVE, on read. Cost is bounded by `_talkRows` (0 in
   * almost every frame — at most one per active quest), the early-out is a
   * counter test, and the body allocates nothing: it writes into the row
   * objects `_rebuildMarkers` already created. `_npcPos` returns either the
   * npc lane's live `group.position` or a module-scope scratch vector; both are
   * read immediately and never retained.
   */
  _refreshTalkMarkers() {
    const rows = this.markers;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.npc) continue;
      const p = this._npcPos(r.npc);
      if (!p) continue;
      if (p.x === r.x && p.z === r.z) continue;
      r.x = p.x; r.z = p.z;
      r.y = (this.ctx.terrain?.getHeight?.(p.x, p.z) ?? 0) + 1.6;
    }
  }

  getMarkers() {
    if (this._markersDirty) this._rebuildMarkers();
    if (this._talkRows > 0) this._refreshTalkMarkers();
    return this.markers;
  }

  _npcPos(npcId) {
    const def = NPCS[npcId];
    if (!def) return null;
    /**
     * `npc` (port 5218) walks thirteen people around camp, so a marker on a
     * person has to follow them. `ctx.npcs.byId(id).group.position` is that
     * lane's published transform; `ctx.camp.npc` (Varl's anchor) and the
     * authored fallback are the two older answers, kept for a build without it.
     */
    try {
      const rec = this.ctx.npcs?.byId?.get ? this.ctx.npcs.byId.get(npcId) : this.ctx.npcs?.byId?.(npcId);
      if (rec?.group?.position) return rec.group.position;
    } catch { /* npc lane mid-build */ }
    if (npcId === 'varl') {
      const npc = this.ctx.camp?.npc;
      if (npc?.position) return npc.position;
    }
    const fb = def.fallback;
    if (!fb) return null;
    _v.set(fb.x, 0, fb.z);
    _v.y = this.ctx.terrain?.getHeight?.(_v.x, _v.z) ?? 0;
    return _v;
  }

  /* ====================================================================== */
  /* site anchors — quests point at the WORLD, not at coordinates           */
  /* ====================================================================== */

  /**
   * Resolve an objective's world anchor.
   *
   * `at:{ site:'outpost', alt:'cache' }` asks `world-props` for a site of that
   * kind through the published `ctx.props.sites()` registry, preferring one
   * that is not finished yet and, among those, the nearest to the player. The
   * authored `x/z` on the objective is the fallback for a build where that kind
   * does not exist yet, so the quest is playable today and snaps onto the real
   * outpost/cauldron/lakeshore/wreck the day that lane registers them.
   *
   * Allocation-free: the answer is written into one shared record, read
   * immediately by the caller, and never retained.
   */
  _anchor(o) {
    const out = _anchorOut;
    out.ok = false; out.site = null;
    out.x = o.x ?? 0; out.z = o.z ?? 0;
    if (o.x != null && o.z != null) out.ok = true;
    const want = o.at;
    if (!want) return out;
    const rows = this._sites();
    if (!rows.length) return out;
    const p = this.ctx.player?.position;
    let best = null, bestScore = Infinity;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      /**
       * A site matches on its KIND (either the wanted one or the named
       * alternative that stands in for it today), or on its id containing the
       * wanted kind — so a future `cauldron-rho` site registered under some
       * other kind still answers `at:{site:'cauldron'}`. The alternative is
       * deliberately NOT matched by id substring: `alt` is a stand-in, and a
       * loose stand-in silently drags a quest marker onto the wrong thing.
       */
      const primary = r.kind === want.site
        || (typeof r.id === 'string' && r.id.includes(want.site));
      const stand = !primary && !!want.alt && r.kind === want.alt;
      if (!primary && !stand) continue;
      if (want.id && r.id !== want.id) continue;
      /**
       * Order: the real thing before the stand-in, an unfinished site before a
       * finished one, and only then the nearest. Distance alone is not enough —
       * `world-props` now registers BOTH a `cauldron` site and the older
       * `override` node this quest used to point at, and a marker that moves
       * between them depending on where the player happens to be standing is a
       * quest objective that cannot be followed.
       */
      const dx = p ? p.x - r.x : 0, dz = p ? p.z - r.z : 0;
      const score = (stand ? 1e9 : 0) + (r.done ? 1e6 : 0) + Math.sqrt(dx * dx + dz * dz);
      if (score < bestScore) { bestScore = score; best = r; }
    }
    if (best) { out.x = best.x; out.z = best.z; out.ok = true; out.site = best.id; }
    return out;
  }

  /**
   * `ctx.props.sites()` BUILDS its array every call (20+ records, one object
   * each). The 5 Hz proximity sweep asks per unfinished `goto`, and the marker
   * rebuild asks per active objective, so an uncached read is ~15 throwaway
   * arrays a second for a list that changes when a datapoint is picked up.
   * Cached for a second of simulated time; `_markersDirty` is unaffected.
   */
  _sites() {
    if (this._sitesAt != null && this.clock - this._sitesAt < 1) return this._sitesCache;
    let rows = null;
    try { rows = this.ctx.props?.sites?.(); } catch { rows = null; }
    this._sitesCache = Array.isArray(rows) ? rows : [];
    this._sitesAt = this.clock;
    return this._sitesCache;
  }

  /**
   * Published: where an objective actually points, after site resolution.
   * The compass, the world map and the gates all need the same answer, and
   * none of them should have to know that `at:{site:'outpost'}` resolves
   * through `world-props`. Returns a COPY (the internal record is reused).
   */
  objectiveAnchor(questId, objectiveId = null) {
    const def = QUESTS.find((q) => q.id === questId);
    if (!def) return null;
    const st = this.questState.get(questId);
    const o = objectiveId
      ? def.objectives.find((x) => x.id === objectiveId)
      : (st ? this._current(def, st) : def.objectives[0]);
    if (!o) return null;
    if (o.type === 'talk') {
      const npc = this._npcPos(o.npc);
      return npc ? { x: npc.x, z: npc.z, site: o.npc, kind: 'talk', objectiveId: o.id } : null;
    }
    const a = this._anchor(o);
    return a.ok ? { x: a.x, z: a.z, site: a.site, kind: o.type, objectiveId: o.id, radius: o.radius ?? 2.5 } : null;
  }

  /* ====================================================================== */
  /* timed trials (`within`) — the hunting-ground contract                  */
  /* ====================================================================== */

  _trialKey(questId, objId) { return `${questId}:${objId}`; }

  /**
   * Start (or restart) the window on a timed objective and re-baseline it, so
   * only work done INSIDE the window counts. Kills banked before the trial
   * began are not stolen from the player — they simply do not pay for a trial
   * that is about doing it now, quickly.
   */
  _startTrial(def, st, o, reason = 'start') {
    const key = this._trialKey(def.id, o.id);
    // A quest restored from a pre-expansion save has no bucket for this type;
    // creating it is the difference between "kills since the window opened" and
    // "every kill this run", which would settle the trial the moment it starts.
    if (!st.base) st.base = this._tallySnapshot(def);
    if (!st.base[o.type]) st.base[o.type] = Object.create(null);
    st.base[o.type][o.kind ?? '*'] = this.tally[o.type]?.[o.kind ?? '*'] ?? 0;
    if (st.used) st.used[this._objKey(o)] = 0;
    const had = st.counts[o.id] ?? 0;
    st.counts[o.id] = 0;
    this.trials.set(key, { endsAt: this.clock + o.within, startedAt: this.clock });
    this._markersDirty = true;
    if (had > 0 || reason !== 'start') {
      this._emit('quest-objective', {
        questId: def.id, objectiveId: o.id, label: o.label,
        have: 0, need: o.count ?? 1, done: false, trial: reason,
      });
      if (reason === 'lapsed') this.banner('TRIAL LAPSED', o.label.toUpperCase(), 'objective');
      if (reason === 'restart') this.banner('TRIAL RESTARTED', o.label.toUpperCase(), 'objective');
    }
    return this.trials.get(key);
  }

  /** Seconds left on a timed objective, or null when it is not running. */
  trialState(questId, objectiveId = null) {
    const def = QUESTS.find((q) => q.id === questId);
    const st = this.questState.get(questId);
    if (!def || !st) return null;
    const o = objectiveId
      ? def.objectives.find((x) => x.id === objectiveId)
      : def.objectives.find((x) => x.within && (st.counts[x.id] ?? 0) < (x.count ?? 1));
    if (!o || !o.within) return null;
    const t = this.trials.get(this._trialKey(def.id, o.id));
    return {
      questId, objectiveId: o.id, within: o.within,
      running: !!t, left: t ? Math.max(0, +(t.endsAt - this.clock).toFixed(2)) : null,
      have: st.counts[o.id] ?? 0, need: o.count ?? 1,
    };
  }

  /**
   * THE ONE TRIAL WORTH DRAWING, or null.
   *
   * `trialState(questId)` answers about a quest you already name; a HUD has to
   * ask the opposite question — "is a clock running right now, and on what?".
   * The tracked quest wins, then the first running window in registry order, so
   * the answer is stable frame to frame. `label` is the objective's own text
   * and `mmss` is pre-formatted, so a consumer allocates nothing per frame.
   *
   * `shell-hud` should render this beside the tracked objective (docs
   * §3.8) and set `ctx.hud.trialClock = true`; the lane's own chip
   * (`.pg-trial`) stands down the moment that flag appears.
   */
  activeTrial() {
    if (!this.trials.size) return null;
    let best = null;
    for (const def of QUESTS) {
      const st = this.questState.get(def.id);
      if (!st || st.state !== 'active') continue;
      const o = def.objectives.find((x) => x.within && (st.counts[x.id] ?? 0) < (x.count ?? 1));
      if (!o) continue;
      const t = this.trials.get(this._trialKey(def.id, o.id));
      if (!t) continue;
      const left = Math.max(0, t.endsAt - this.clock);
      const row = {
        questId: def.id, title: def.title, objectiveId: o.id, label: o.label,
        within: o.within, left: +left.toFixed(2), mmss: mmss(left),
        have: st.counts[o.id] ?? 0, need: o.count ?? 1,
      };
      if (this.tracked === def.id) return row;
      if (!best) best = row;
    }
    return best;
  }

  /**
   * One pass per sampler tick: open a window on any timed objective that has
   * become current, and reset one that lapsed. A lapsed trial restarts itself
   * rather than dead-ending the quest — HZD's Hunting Grounds let you run the
   * trial again, and a side quest that can be permanently failed by a slow walk
   * is a bug report, not a challenge.
   */
  _tickTrials() {
    for (const def of QUESTS) {
      const st = this.questState.get(def.id);
      if (!st || st.state !== 'active') continue;
      const o = this._current(def, st);
      if (!o || !o.within) continue;
      const key = this._trialKey(def.id, o.id);
      const t = this.trials.get(key);
      if (!t) { this._startTrial(def, st, o, 'start'); continue; }
      if (this.clock >= t.endsAt) this._startTrial(def, st, o, 'lapsed');
    }
    // a finished (or abandoned) trial keeps no timer. Guarded on `size` so the
    // sampler allocates nothing at all on the 99 % of ticks with no trial open.
    if (this.trials.size) {
      for (const key of [...this.trials.keys()]) {
        const [qid, oid] = key.split(':');
        const def = QUESTS.find((q) => q.id === qid);
        const st = this.questState.get(qid);
        const o = def?.objectives.find((x) => x.id === oid);
        if (!def || !st || !o || st.state !== 'active' || (st.counts[oid] ?? 0) >= (o.count ?? 1)) {
          this.trials.delete(key);
        }
      }
    }
    /**
     * Draw the clock. `_hadTrial` keeps this to ONE call on the tick a trial
     * opens or closes: with no window open `activeTrial()` returns on the empty
     * `trials` map and `setTrial` is not called at all, so the 99 % case is two
     * property reads at 5 Hz.
     */
    const open = this.trials.size > 0;
    if (open || this._hadTrial) {
      this._hadTrial = open;
      this.ui?.setTrial?.(open ? this.activeTrial() : null);
    }
  }

  /** The player walked back into a trial ring: run it again, from zero. */
  restartTrial(groundId = null) {
    let n = 0;
    for (const def of QUESTS) {
      const st = this.questState.get(def.id);
      if (!st || st.state !== 'active') continue;
      const o = this._current(def, st);
      if (!o || !o.within) continue;
      if (groundId && o.trial && !String(groundId).includes(o.trial) && o.trial !== groundId) continue;
      this._startTrial(def, st, o, 'restart');
      n++;
    }
    if (n) { this.ui.refresh(); this._emitObjectiveChanged(); }
    return n;
  }

  /* ====================================================================== */
  /* machine-site respawn policy (progression-003, expansion round)         */
  /* ====================================================================== */

  /** Which window this site should repopulate on, and why. */
  respawnPolicy(site) {
    if (!site) return null;
    let cls = RESPAWN_CLASS[site.kind] ?? 'medium';
    let why = cls;
    // a trial ring has to be re-runnable: the quest asks for three of them
    const ground = this._anchor({ at: { site: 'hunting-ground' }, x: 128, z: -78 });
    if (ground.ok) {
      const dx = site.x - ground.x, dz = site.z - ground.z;
      if (dx * dx + dz * dz <= 70 * 70) { cls = 'trial'; why = 'trial'; }
    }
    if (why !== 'trial') {
      // an active quest is asking for this kind right now
      for (const def of QUESTS) {
        const st = this.questState.get(def.id);
        if (!st || st.state !== 'active') continue;
        const o = this._current(def, st);
        if (o && o.type === 'kill' && (o.kind === site.kind || !o.kind)) { cls = 'quest'; why = 'quest'; break; }
      }
    }
    const [lo, hi] = SITE_RESPAWN[cls] ?? SITE_RESPAWN.medium;
    const delay = lo + (hi - lo) * siteJitter(site.id);
    return { cls, why, delay: +delay.toFixed(1), lo, hi };
  }

  /**
   * Re-time one site the frame `machine-ai` disposed its wreck. Writes only the
   * published `respawnAt` field on the published site record — no edit to that
   * lane's file, and never SLOWER than the stock window it replaces.
   */
  _tuneSiteRespawn(siteId) {
    const mgr = this.ctx.machines?.sites;
    if (!mgr || siteId == null) return null;
    const site = mgr.sites?.find?.((s) => s.id === siteId);
    if (!site || !site.pending) return null;
    const pol = this.respawnPolicy(site);
    if (!pol) return null;
    const next = (mgr.clock ?? 0) + pol.delay;
    // never push a site out past what machine-ai already scheduled
    site.respawnAt = Math.min(site.respawnAt ?? Infinity, next);
    this.siteTuning.set(siteId, { ...pol, at: +site.respawnAt.toFixed(1), kind: site.kind });
    return pol;
  }

  /* ====================================================================== */
  /* dialogue (expansion round) — data lives here, the card just draws it    */
  /* ====================================================================== */

  /** Merge this lane's authored rows with the npc lane's own `lines`. */
  _dialogueFor(npcId) {
    const def = NPCS[npcId];
    if (!def) return null;
    let row = null;
    try { row = this.ctx.npcs?.roster?.find?.((r) => r.id === npcId) ?? null; } catch { row = null; }
    const greeting = [...(def.greeting || [])];
    for (const l of (row?.lines || [])) if (l && !greeting.includes(l)) greeting.push(l);
    return {
      id: npcId,
      name: def.name ?? row?.name ?? npcId,
      title: def.title ?? row?.title ?? '',
      greeting,
      topics: def.topics || [],
      trade: !!def.trade,
    };
  }

  /** How many times this run has spoken to `npcId`. */
  timesTalked(npcId) { return this.dialogue.talked[npcId] ?? 0; }

  /**
   * Everything the conversation card draws, computed from run state: which
   * greeting this person is on, the line currently showing (a topic answer
   * replaces the greeting), and 2-3 choices in HZD's priority order —
   * report-in first, then the offer, then an unheard topic, then trade, and
   * LEAVE always last.
   */
  dialogueState(npcId = this.dialogue.npc) {
    const d = this._dialogueFor(npcId);
    if (!d) return null;
    const talked = this.timesTalked(npcId);
    const idx = Math.min(d.greeting.length - 1, Math.max(0, talked - 1 + Math.floor(this.stats.kills / 6)));
    let line = d.greeting[Math.max(0, idx)] ?? 'Speak, then.';
    let topicId = null;
    if (this.dialogue.topic && this.dialogue.npc === npcId) {
      const t = d.topics.find((x) => x.id === this.dialogue.topic);
      if (t) { line = t.a; topicId = t.id; }
    }

    const primary = [];
    const active = this.quests.active().filter((q) => q.giver === npcId);
    const offered = this.quests.offered().filter((q) => q.giver === npcId);
    const turnIn = active.find((q) => q.current && q.current.type === 'talk' && q.current.npc === npcId);
    if (turnIn) {
      primary.push({ id: `turnin:${turnIn.id}`, kind: 'quest-turnin', questId: turnIn.id,
        label: `“About ${turnIn.title}…”`, hint: 'REPORT IN' });
    }
    for (const q of offered) {
      primary.push({ id: `accept:${q.id}`, kind: 'quest-accept', questId: q.id,
        label: `“Tell me about ${q.title}.”`, hint: 'ACCEPT QUEST' });
    }
    for (const t of d.topics) {
      if (t.id === topicId) continue;
      primary.push({ id: `topic:${t.id}`, kind: 'topic', topicId: t.id,
        label: `“${t.q}”`, hint: this.dialogue.seen.has(`${npcId}:${t.id}`) ? 'ASK AGAIN' : 'ASK' });
    }
    if (active.length) {
      primary.push({ id: 'journal', kind: 'journal', label: '“What am I supposed to be doing?”', hint: 'JOURNAL' });
    }

    /**
     * HZD's wheel shows a handful, never a wall: two lines plus the exit. A
     * MERCHANT always keeps one of those two, because "buy arrows" is the whole
     * reason that person is stood there — with a turn-in and an offer both
     * pending, a flat top-two cut hid the only shop in the valley behind quest
     * state.
     */
    const choices = primary.slice(0, d.trade ? 1 : 2);
    if (d.trade) {
      choices.push({ id: 'trade', kind: 'trade', label: '“Show me what you have to trade.”', hint: 'TRADE' });
    }
    choices.push({ id: 'leave', kind: 'leave', label: `“Later, ${d.name}.”`, hint: 'LEAVE' });
    return {
      id: npcId, name: d.name, title: d.title, line, topic: topicId,
      talked, choices, open: this.dialogue.open && this.dialogue.npc === npcId,
    };
  }

  /**
   * Take a choice. Returns `{ state, closed, action }` — the card re-renders
   * from `state` and performs `action` ('trade' | 'journal') on the way out, so
   * the panel holds no rules of its own.
   */
  choose(choiceId) {
    const npcId = this.dialogue.npc;
    const before = this.dialogueState(npcId);
    if (!before) return { state: null, closed: true, action: null };
    const c = before.choices.find((x) => x.id === choiceId) || null;
    if (!c) return { state: before, closed: false, action: null };

    switch (c.kind) {
      case 'topic': {
        this.dialogue.topic = c.topicId;
        const key = `${npcId}:${c.topicId}`;
        if (!this.dialogue.seen.has(key)) {
          this.dialogue.seen.add(key);
          // one-shot, through the same ledger a datapoint uses
          this.award({ xp: 10, reason: 'talk', id: key, once: true });
        }
        this._emit('dialogue-topic', { npc: npcId, topic: c.topicId });
        break;
      }
      case 'quest-accept':
        this.dialogue.topic = null;
        this.startQuest(c.questId);
        break;
      case 'quest-turnin':
        // leaving the conversation is what closes a `talk` objective
        return { state: null, closed: true, action: null, turnIn: c.questId };
      case 'trade':
        return { state: before, closed: true, action: 'trade' };
      case 'journal':
        return { state: before, closed: true, action: 'journal' };
      case 'leave':
      default:
        return { state: before, closed: true, action: null };
    }
    /**
     * Keep the card in sync when a choice arrives through the API rather than
     * through the panel's own click handler (a gate, a controller binding, a
     * later voice/wheel front-end). The panel re-renders from state either way.
     */
    const state = this.dialogueState(npcId);
    if (this.dialogueUI?.isOpen) { try { this.dialogueUI.refresh(); } catch { /* card gone */ } }
    return { state, closed: false, action: null };
  }

  /* ====================================================================== */
  /* merchant                                                               */
  /* ====================================================================== */

  _makeMerchant() {
    const self = this;
    const stock = MERCHANT_STOCK.map((s) => ({ ...s }));
    return {
      npc: 'varl',
      stock: () => stock,
      shards: () => self.ctx.inventory?.count?.(CURRENCY) ?? 0,
      /** Buy price, scaled by difficulty (harder = pricier). */
      price(id) {
        const row = stock.find((s) => s.id === id);
        if (!row) return null;
        const d = self.difficultyDef;
        return Math.max(1, Math.round(row.price * (2 - d.loot)));
      },
      /** What the hunter pays you. Scavenger lifts it with the loot channel. */
      sellPrice(id) {
        const base = SELL_VALUES[id];
        if (base == null) return null;
        return Math.max(1, Math.round(base * 0.55 * self.mult('lootYield')));
      },
      /**
       * Method shorthand, NOT an arrow: `this` has to be the merchant object so
       * `this.sellPrice` resolves. As an arrow it closed over `_makeMerchant`'s
       * `this` — the Progression instance, which has no `sellPrice` — and the
       * "Your goods" column of the trade panel threw on open.
       */
      sellable() {
        const inv = self.ctx.inventory;
        if (!inv) return [];
        const rows = [];
        for (const [id, n] of inv.counts) {
          if (n <= 0 || id === CURRENCY) continue;
          const p = SELL_VALUES[id];
          if (p == null) continue;
          rows.push({ id, n, price: this.sellPrice(id) });
        }
        return rows;
      },
      buy(id, n = 1) {
        const inv = self.ctx.inventory;
        const row = stock.find((s) => s.id === id);
        if (!inv || !row || n <= 0) return { ok: false, reason: 'no such wares' };
        if (row.qty < n) return { ok: false, reason: 'out of stock' };
        // `focus-items` caps every pocket and `inventory.add` clamps silently,
        // so buying into a full pocket used to take the shards and hand back
        // nothing. Refuse the trade instead.
        const cap = typeof inv.capacity === 'function' ? inv.capacity(id) : Infinity;
        if (Number.isFinite(cap) && inv.count(id) + n > cap) {
          return { ok: false, reason: 'your pouch is full' };
        }
        const cost = this.price(id) * n;
        if (inv.count(CURRENCY) < cost) return { ok: false, reason: 'not enough shards' };
        inv.take(CURRENCY, cost);
        row.qty -= n;
        self._grant(id, n);
        self.ctx.events?.emit?.('trade-buy', { id, n, cost, shards: inv.count(CURRENCY) });
        return { ok: true, cost };
      },
      sell(id, n = 1) {
        const inv = self.ctx.inventory;
        if (!inv || n <= 0) return { ok: false, reason: 'nothing to sell' };
        const unit = this.sellPrice(id);
        if (unit == null) return { ok: false, reason: 'he will not take that' };
        if (!inv.take(id, n)) return { ok: false, reason: 'you do not have that many' };
        const paid = unit * n;
        self._grant(CURRENCY, paid);
        self.ctx.events?.emit?.('trade-sell', { id, n, paid, shards: inv.count(CURRENCY) });
        return { ok: true, paid };
      },
    };
  }

  /**
   * TURN-IN TAKES THE GOODS (`quest-delivered`).
   *
   * Every "bring me X" objective carries `deliver: true`, and until this round
   * none of them cost anything: Varl's five medicinal herbs, the two Watcher
   * lenses, the outpost's six Ridge-Wood and Thok's forty Metal Shards all
   * stayed in the pouch while the quest paid out on top. In HZD the hand-over
   * is the trade — the items leave your pockets and the reward replaces them —
   * and with `metal-shards` being the CURRENCY itself, "Carry forty Metal
   * Shards to the forge" for a 260 XP payout was simply free money.
   *
   * Runs once, from `_completeQuest`, after `state` is already `'done'` so the
   * settle pass cannot re-open the objective on the smaller stock (`state()`
   * reads the stored `counts`, never live inventory — see `state`).
   *
   * NEVER STRANDS A RUN. `metal-shards` is spendable at the merchant between
   * the objective ticking and the turn-in, so a short pouch hands over what is
   * there and reports the shortfall rather than refusing the quest. Every
   * `take` is guarded the way `_grant` is: `inventory.take` does not emit, but
   * a foreign subclass could, and a throw here must not cost the payout.
   */
  _deliverGoods(def, st) {
    const inv = this.ctx.inventory;
    if (!inv?.take || !def?.objectives) return null;
    let out = null;
    for (const o of def.objectives) {
      if (!o.deliver || o.type !== 'gather' || !o.item) continue;
      const want = o.count ?? 1;
      let took = 0;
      try {
        const have = inv.count?.(o.item) ?? 0;
        took = Math.min(want, have);
        if (took > 0) inv.take(o.item, took);
      } catch (err) { this._fault(`deliver:${o.item}`, err); took = 0; }
      this._syncSeen(o.item);
      (out ??= []).push({ id: o.item, n: took, short: want - took });
    }
    if (out) {
      this._emit('quest-delivered', { id: def.id, title: def.title, items: out });
      this.ui.refresh();
    }
    return out;
  }

  /**
   * inventory.add with the gather-yield re-entry guard held down.
   *
   * `inventory.add` emits `item-gained` synchronously, so a broken subscriber
   * takes the caller with it (see `_emit`). Catching here is what keeps a quest
   * reward, a shard payout or a merchant purchase from half-applying.
   * `_syncSeen` afterwards keeps the gather backstop from double-counting the
   * item we just handed over.
   */
  _grant(id, n) {
    if (!id || !(n > 0)) return;
    this._inGrant = true;
    try { this.ctx.inventory?.add?.(id, n); }
    catch (err) { this._fault(`grant:${id}`, err); }
    finally {
      this._inGrant = false;
      this._syncSeen(id);
    }
  }

  /* ====================================================================== */
  /* gather backstop (progression-002 / A66)                                */
  /* ====================================================================== */

  /**
   * `gather` objectives key off `item-gained`, which `inventory.add` emits.
   *
   * KEPT ON PURPOSE after the fix round, with the honest reason (the old one —
   * "`playerAnimator` is registered ahead of us and currently throws" — was
   * false and is retracted; see `_emit`). Two real holes remain: `events.js`
   * `emit()` has no try/catch, so ANY future subscriber registered before this
   * lane can still swallow the rest of the set mid-pickup; and items handed
   * over by code that never emits at all (quest reward `_grant` re-entry,
   * `SaveSystem.apply` replacing the bag wholesale, a merchant refund) are
   * invisible to the event.
   *
   * So the event is the fast path and the inventory itself is the truth: at
   * 5 Hz, any item whose count rose since the last sample is credited exactly
   * once, through the same `_onGained` funnel the event uses. Cost is one Map
   * lookup per held item stack (single digits), no allocation, and it shares
   * the tick that already runs the goto sampler — it buys robustness for
   * roughly nothing, so it stays.
   */
  _syncSeen(id) {
    const inv = this.ctx.inventory;
    if (!inv?.count) return;
    this._invSeen.set(id, inv.count(id) ?? 0);
  }

  _seedSeen() {
    this._invSeen.clear();
    const counts = this.ctx.inventory?.counts;
    if (!counts) return;
    for (const [id, n] of counts) this._invSeen.set(id, n);
  }

  _pollInventory() {
    const counts = this.ctx.inventory?.counts;
    if (!counts) return;
    for (const [id, n] of counts) {
      const prev = this._invSeen.get(id);
      if (prev === undefined) { this._invSeen.set(id, n); continue; }
      if (n > prev) this._onGained(id, n - prev);
      else if (n !== prev) this._invSeen.set(id, n);
    }
  }

  /** The one place an acquired item advances a quest or earns the Gatherer bonus. */
  _onGained(id, count) {
    if (!id || !(count > 0)) return;
    this.stats.gathers++;
    this._advance('gather', (o) => o.item === id, count);
    // Gatherer: one extra of any *resource*, guarded against re-entry
    const bonus = this.mult('gatherYield');
    if (bonus > 0 && !this._inGrant && id !== CURRENCY && !/lens|heart|core|braid/.test(id)) {
      this._grant(id, bonus);     // _grant re-syncs `_invSeen` for us
    } else {
      this._syncSeen(id);
    }
  }

  /* ====================================================================== */
  /* dialogue / NPC                                                         */
  /* ====================================================================== */

  talkTo(npcId = 'varl') {
    const def = NPCS[npcId];
    if (!def) return false;
    // switching speakers mid-conversation starts a fresh card
    if (this.dialogue.open && this.dialogue.npc !== npcId) this.closeDialogue();
    this.dialogue.npc = npcId;
    this.dialogue.topic = null;
    this.dialogue.open = true;
    this.dialogue.talked[npcId] = (this.dialogue.talked[npcId] ?? 0) + 1;
    this._emit('dialogue-open', { npc: npcId, name: def.name, times: this.dialogue.talked[npcId] });
    /**
     * The conversation card is its own panel now (`src/ui/dialogue.js`,
     * expansion round). `QuestLogUI.openDialogue` — the two-line card bolted
     * into the journal overlay — is the fallback for a build where the card
     * failed to construct, and nothing else calls it.
     */
    const ok = this.dialogueUI?.open?.(npcId);
    if (!ok) this.ui.openDialogue(npcId);
    return true;
  }

  closeDialogue() {
    if (!this.dialogue.open) return;
    const npc = this.dialogue.npc;
    this.dialogue.open = false;
    this.dialogue.npc = null;
    /**
     * `closeDialogue()` is published API, and until now only the UI's own
     * `close()` took the panel down — so a consumer (or a probe) that called
     * this directly left the conversation card on screen AND `ctx.state` stuck
     * at `'dialogue'`, which main.js's `live` test excludes: the whole
     * simulation froze. `QuestLogUI.close()` re-enters here, but `open` is
     * already false one line up, so the recursion stops immediately.
     */
    if (this.ui?.state === 'dialogue') { try { this.ui.close(); } catch { /* panel gone */ } }
    if (this.dialogueUI?.isOpen) { try { this.dialogueUI.close({ silent: true }); } catch { /* card gone */ } }
    this.dialogue.topic = null;
    this._emit('dialogue-close', { npc });
    this._bump('talk', npc);
    this._advance('talk', (o) => o.npc === npc);
  }

  /* ====================================================================== */
  /* save / checkpoint / death / victory                                    */
  /* ====================================================================== */

  serialize() {
    const quests = [];
    for (const [id, st] of this.questState) {
      quests.push({
        id, state: st.state, counts: { ...st.counts },
        base: st.base ?? null, used: { ...(st.used || {}) }, reached: { ...(st.reached || {}) },
      });
    }
    /**
     * Timed trials are stored as SECONDS LEFT, not as an absolute clock: the
     * sim clock restarts at zero on a fresh page, so an endsAt written before a
     * reload would either expire instantly or never. A trial with no time left
     * is simply not written.
     */
    const trials = [];
    for (const [key, t] of this.trials) {
      const left = t.endsAt - this.clock;
      if (left > 0.05) trials.push({ key, left: +left.toFixed(2) });
    }
    return {
      level: this.level, xpIntoLevel: this.xpIntoLevel, totalXp: this.totalXp,
      skillPoints: this.skillPoints, unlocked: [...this.unlocked],
      difficulty: this._difficulty,
      baseMaxHealth: this.baseMaxHealth, baseMaxPouch: this.baseMaxPouch,
      stats: { ...this.stats }, killsByKind: { ...this.killsByKind },
      tally: freshTally(this.tally),
      quests: { list: quests, tracked: this.tracked, trials },
      /** conversation state: topics heard (one award each) + who has been met */
      dialogue: {
        seen: [...this.dialogue.seen],
        talked: { ...this.dialogue.talked },
      },
      merchant: this.merchant.stock().map((s) => ({ id: s.id, qty: s.qty })),
      // one-shot world-content ledgers (award/discover)
      awarded: [...this.awarded],
      discovered: [...this.discovered],
    };
  }

  deserialize(data) {
    if (!data) return false;
    this.level = Math.max(1, data.level | 0 || 1);
    this.xpIntoLevel = Math.max(0, data.xpIntoLevel | 0);
    this.totalXp = Math.max(0, data.totalXp | 0);
    this.skillPoints = Math.max(0, data.skillPoints | 0);
    this.unlocked = new Set(Array.isArray(data.unlocked) ? data.unlocked : []);
    if (data.difficulty) this._difficulty = data.difficulty;
    if (Number.isFinite(data.baseMaxHealth)) this.baseMaxHealth = data.baseMaxHealth;
    if (Number.isFinite(data.baseMaxPouch)) this.baseMaxPouch = data.baseMaxPouch;
    this.stats = { ...this.stats, ...(data.stats || {}) };
    this.killsByKind = { ...(data.killsByKind || {}) };
    // run tallies + per-quest ledger, so out-of-order credit survives a reload
    this.tally = freshTally(data.tally);
    // a save written before the run tallies existed carries only killsByKind
    if (!data.tally?.kill) this.tally.kill = { ...(data.killsByKind || {}) };
    this.questState.clear();
    for (const q of (data.quests?.list || [])) {
      const qdef = QUESTS.find((x) => x.id === q.id);
      const counts = { ...(q.counts || {}) };
      /**
       * A save written before the credit ledger existed carries only `counts`.
       * Rebuild the rest rather than guessing: baseline the tallies AND the
       * gather stock at now (so nothing is retro-credited), and re-key what the
       * quest already spent from `counts` through `_objKey` — copying `counts`
       * straight into `used` would key it by objective id, which `_earned`
       * never looks up, and every gather step would then re-credit itself off
       * the bag.
       */
      let used = q.used;
      if (!used) {
        used = Object.create(null);
        for (const o of (qdef?.objectives || [])) {
          const n = counts[o.id] ?? 0;
          if (n > 0) { const k = this._objKey(o); used[k] = (used[k] ?? 0) + n; }
        }
      }
      this.questState.set(q.id, {
        id: q.id, state: q.state, counts,
        base: q.base ?? this._tallySnapshot(qdef),
        used: { ...used },
        reached: { ...(q.reached || {}) },
      });
    }
    // A save written before the ledgers existed simply has none — an empty set
    // is the safe restore (a pickup the world still flags as taken re-awards at
    // worst once, and `activities` keeps its own `found` flag anyway).
    this.awarded = new Set(Array.isArray(data.awarded) ? data.awarded : []);
    this.discovered = new Set(Array.isArray(data.discovered) ? data.discovered : []);
    // conversation state (expansion round): heard topics + who has been met
    this.dialogue.seen = new Set(Array.isArray(data.dialogue?.seen) ? data.dialogue.seen : []);
    this.dialogue.talked = { ...(data.dialogue?.talked || {}) };
    this.dialogue.topic = null;
    // timed trials resume with the time they had left, on the NEW clock
    this.trials.clear();
    for (const row of (data.quests?.trials || [])) {
      if (!row?.key || !(row.left > 0)) continue;
      this.trials.set(row.key, { endsAt: this.clock + row.left, startedAt: this.clock });
    }
    this.tracked = data.quests?.tracked ?? this._firstActive();
    for (const row of (data.merchant || [])) {
      const s = this.merchant.stock().find((x) => x.id === row.id);
      if (s) s.qty = row.qty;
    }
    this._multDirty = true;
    this._markersDirty = true;
    // the inventory was replaced whole by `SaveSystem.apply` one step ago —
    // re-baseline the gather backstop so a restore is not credited as a haul
    this._seedSeen();
    this._applyBodyBonuses();
    this._startAutoQuests();
    this._emitObjectiveChanged();
    this.ui.refresh();
    this.ui.refreshXp();
    this.skillsUI.refresh();
    return true;
  }

  /** Campfire save (also writes the checkpoint — they are the same moment). */
  save(reason = 'campfire') {
    const res = this.saves.write(SLOT.main, reason);
    this.saves.write(SLOT.checkpoint, reason);
    if (res.ok) this.banner('PROGRESS SAVED', reason === 'campfire' ? 'CAMPFIRE' : reason.toUpperCase(), 'save');
    return res;
  }

  /** Silent autosave. Never banners — it fires on every quest step. */
  checkpoint(reason = 'auto') {
    return this.saves.write(SLOT.checkpoint, reason);
  }

  hasSave() { return this.saves.has(SLOT.main); }
  saveInfo() { return this.saves.info(SLOT.main); }

  continueGame() {
    const data = this.saves.read(SLOT.main);
    if (!data) return { ok: false, error: 'no save' };
    const res = this.saves.apply(data);
    this.banner('CONTINUE', `LEVEL ${this.level}`, 'save');
    return res;
  }

  newGame(difficulty) {
    this.saves.clear(SLOT.main);
    this.saves.clear(SLOT.checkpoint);
    if (difficulty) this.setDifficulty(difficulty);
    this.level = 1; this.xpIntoLevel = 0; this.totalXp = 0;
    this.skillPoints = 0; this.unlocked.clear();
    this.questState.clear(); this.tracked = null;
    this.killsByKind = Object.create(null);
    this.tally = freshTally();
    this.trials.clear();
    this.siteTuning.clear();
    this.dialogue.open = false; this.dialogue.npc = null; this.dialogue.topic = null;
    this.dialogue.seen.clear();
    this.dialogue.talked = Object.create(null);
    this.clearedSites.clear();
    this.awarded.clear();
    this.discovered.clear();
    this.stats = {
      kills: 0, scans: 0, gathers: 0, deaths: 0, shardsEarned: 0, questsDone: 0,
      respawns: 0, sitesCleared: 0,
    };
    this._multDirty = true; this._markersDirty = true;
    this._seedSeen();
    this._applyBodyBonuses();
    this._startAutoQuests();
    this.ui.refresh(); this.ui.refreshXp(); this.skillsUI.refresh();
    return true;
  }

  loadCheckpoint(reason = 'death') {
    const data = this.saves.read(SLOT.checkpoint) || this.saves.read(SLOT.main);
    if (!data) return { ok: false, error: 'no checkpoint' };
    /**
     * Run-level tallies are NOT part of the saved state: deaths and respawns
     * describe what happened to the player, not where the world stands, and
     * rolling them back would let the death counter read 0 after four deaths
     * (the checkpoint that restores you was written before any of them).
     * Everything else — quest counts, inventory, health — is meant to roll back.
     */
    const deaths = this.stats.deaths;
    const respawns = this.stats.respawns;
    // `world:false` — the fight you just lost stays lost; you do not get a
    // freshly-repopulated valley as a reward for dying.
    const res = this.saves.apply(data, { world: false, quiet: true });
    this.stats.deaths = Math.max(this.stats.deaths, deaths);
    this.stats.respawns = Math.max(this.stats.respawns, respawns);
    this._emit('checkpoint-loaded', { reason, killer: this.lastKiller });
    return res;
  }

  _startAutoQuests() {
    for (const q of QUESTS) {
      if (q.autoStart && !this.questState.get(q.id)) this.startQuest(q.id);
    }
  }

  /**
   * `ui-13` / `progression-003`: winning used to set `ctx.state = 'victory'`
   * forever, so the only way to keep playing was a page reload. Now: banner,
   * three seconds, resume. `shell-menus` owns the real endgame card and takes
   * this over the moment `ctx.menus` exists — the DOM cleanup below is the
   * bridge until then, and it never touches another lane's file.
   */
  _onVictory() {
    this._victoryT = 0;
    this.save('victory');
    this.banner('VALLEY RECLAIMED', 'THE THUNDERJAW IS DOWN', 'victory');
  }

  banner(title, detail, kind = 'info') {
    this._emit('banner', { title, detail, kind });
    this.ui.banner(title, detail, kind);
  }

  /* ====================================================================== */
  /* event wiring                                                           */
  /* ====================================================================== */

  /**
   * EVERY emit out of this lane goes through here, and every listener into it
   * is wrapped (`on` below).
   *
   * WHY, precisely — and no more than that (fix round 1: the previous version
   * of this comment named three `playerAnimator.js` methods as undefined and
   * claimed `inventory.add()` therefore threw on every pickup. That was WRONG
   * and it was filed as a cross-lane blocker against `player-anim` /
   * `player-control`. Measured on this tree: `_startAction`, `_onDamage` and
   * `_idleLife` are all defined, `ctx.inventory.add('ridge-wood', 2)` returns
   * cleanly, `player-damage` takes the player 100 → 93, and `audit().emitFaults`
   * after a kill + pickup + death cycle is `{}`. Retracted in
   * docs/ROUND4-PROGRESSION.md §3.2.)
   *
   * What IS true: `src/core/events.js` `emit()` is a bare
   * `for (fn of set) fn(payload)` with no try/catch, and it belongs to no
   * Round 4 lane. One subscriber that throws — today, or the first time any
   * lane adds a listener with a typo — unwinds the emitter's whole call stack,
   * and this lane emits from inside payout paths where the next statement is a
   * quest step (`machine-killed` → XP → shards → `_advance('kill', …)`). A
   * progression system that can lose a quest step to somebody else's exception
   * is not a progression system, so the guard stays until `events.js` grows
   * one; then it costs a try/catch that never fires.
   *
   * So: emitting never throws, and a listener of ours never throws INTO someone
   * else's emit either. Failures are counted and warned once per key (warn, not
   * error — console.error is the gate runner's hard-fail channel and this
   * lane's fault tolerance must not fail an unrelated lane's gate).
   * `_emitFaults` is in `audit()` so the damage is visible rather than silent.
   */
  _emit(type, payload) {
    const ev = this.ctx.events;
    if (!ev?.emit) return;
    try {
      ev.emit(type, payload);
    } catch (err) {
      this._fault(`emit:${type}`, err);
    }
  }

  _fault(key, err) {
    const n = (this._emitFaults[key] ?? 0) + 1;
    this._emitFaults[key] = n;
    if (n === 1) {
      console.warn(`[progression] a foreign listener threw during "${key}":`,
        err?.message || err);
    }
  }

  _bind() {
    const ev = this.ctx.events;
    if (!ev) return;
    /** Register a listener that can never throw into another system's emit. */
    const on = (name, fn) => this._off.push(ev.on(name, (payload) => {
      try { fn(payload); } catch (err) { this._fault(`on:${name}`, err); }
    }));

    on('machine-killed', ({ machine } = {}) => {
      if (!machine) return;
      this.stats.kills++;
      this.killsByKind[machine.kind] = (this.killsByKind[machine.kind] ?? 0) + 1;
      this._bump('kill', machine.kind);
      this.addXp(this.xpForKill(machine), 'kill', { machine });
      // progression-004: wrecks pay in the real currency, scaled by Scavenger
      const shards = Math.max(1, Math.round(
        (machine.level ?? 1) * SHARDS_PER_LEVEL * this.mult('lootYield')));
      this._grant(CURRENCY, shards);
      this.stats.shardsEarned += shards;
      this._advance('kill', (o) => !o.kind || o.kind === machine.kind);
    });

    on('machine-tagged', ({ machine } = {}) => {
      if (!machine) return;
      this.stats.scans++;
      this._bump('scan', machine.kind);
      this._advance('scan', (o) => !o.kind || o.kind === machine.kind);
    });

    on('item-gained', (e = {}) => {
      if (!e.id || !(e.count > 0)) return;
      this._onGained(e.id, e.count);
    });

    /**
     * WORLD-CONTENT OBJECTIVES (expansion round). Four types, four events that
     * already existed and that nothing was listening to for quest credit:
     *   'datapoint-collected'  src/items/datapoints.js   (all 24 records)
     *   'supply-cache'         src/world/props/activities.js
     *   'override-node'        idem
     *   'fauna-killed'         src/world/fauna.js
     * Each is tallied by id/species AND under '*', so an objective can ask for
     * "three datapoints" or for one named record with the same machinery.
     */
    on('datapoint-collected', ({ id } = {}) => {
      this._bump('datapoint', id);
      this._advance('datapoint', (o) => !o.dp || o.dp === id);
    });
    on('supply-cache', ({ id } = {}) => {
      this._bump('cache', id);
      this._advance('cache', (o) => !o.node || o.node === id);
    });
    on('override-node', ({ id } = {}) => {
      this._bump('override', id);
      this._advance('override', (o) => !o.node || o.node === id);
    });
    on('fauna-killed', ({ species } = {}) => {
      this._bump('hunt', species);
      this._advance('hunt', (o) => !o.species || o.species === species);
    });
    /** Walking back into the trial ring runs the trial again, from zero. */
    on('hunting-ground', ({ id } = {}) => { this.restartTrial(id); });

    on('player-damage', ({ from } = {}) => {
      if (from) this.lastKiller = from?.displayName ?? from?.kind ?? String(from);
    });

    on('player-died', () => {
      this.stats.deaths++;
      this._deathPouch = this.ctx.player?.pouch ?? 0;
    });

    /**
     * `progression-019` — the player's own `_die()` refills the pouch to 60 and
     * teleports her to camp 3.2 s later. That is the "death has no stakes"
     * finding. This lane cannot edit `player.js`, so it takes the frame after:
     * the checkpoint is reloaded, which restores the pouch the run actually had
     * (minus what Healer lets you keep), her saved position, and her health.
     */
    on('player-respawn', () => {
      const res = this.loadCheckpoint('death');
      const p = this.ctx.player;
      if (!res.ok && p) {
        // no checkpoint yet: still no free refill
        p.pouch = Math.min(p.maxPouch, this._deathPouch * Math.max(0.25, this.mult('deathPouchKeep')));
      } else if (p) {
        p.pouch = Math.min(p.maxPouch, Math.max(p.pouch * 0.5, this._deathPouch * this.mult('deathPouchKeep')));
      }
      this.banner('YOU FELL', this.lastKiller ? `KILLED BY ${String(this.lastKiller).toUpperCase()}` : 'CHECKPOINT RESTORED', 'death');
    });

    /**
     * `progression-003` site lifecycle. `machine-ai` owns the MachineSite
     * scheduler (`ai/sites.js`); this lane owns what the schedule MEANS to the
     * run: the alive-set a save restores, and the ledger the world map and
     * gate A67 read. Both events are additive and cost nothing per frame.
     */
    on('machine-disposed', ({ site } = {}) => {
      this.stats.sitesCleared++;
      if (site != null) {
        this.clearedSites.add(site);
        // progression-003 (expansion): per-site respawn timing, see respawnPolicy
        this._tuneSiteRespawn(site);
      }
    });
    on('machine-respawned', ({ site } = {}) => {
      this.stats.respawns++;
      if (site != null) this.clearedSites.delete(site);
      this.checkpoint('respawn');
    });

    on('victory', () => { if (this._victoryT < 0) this._onVictory(); });

    on('game-start', () => { this._emitObjectiveChanged(); this.ui.refreshXp(); });
  }

  /* ====================================================================== */
  /* cross-lane hooks                                                       */
  /* ====================================================================== */

  /**
   * Skills are worthless unless they change a number the simulation reads. The
   * call sites live in `player.js` and `machine.js`, which belong to other
   * lanes, so this lane wraps the two published methods instead of editing
   * either file. Both wrappers:
   *   - are installed once and are idempotent,
   *   - keep the original on `__hzcOriginal` so an owner can retire them,
   *   - never throw (a wrapper that can throw is worse than no skill), and
   *   - become no-ops the moment the owner reads `ctx.progression.mult()`
   *     natively (they check `__hzcNative`).
   * Requested in the lane report: `player-control` reading `damageIn` inside
   * `takeDamage`, and `machine-ai` reading `damageOut`/`tearOut`/
   * `silentStrikeDamage` inside `Machine.takeDamage`.
   */
  _installHooks() {
    if (this._hooked) return;
    const self = this;

    /* ---- damage taken: difficulty.damageIn × Fortitude ---- */
    const p = this.ctx.player;
    if (p && typeof p.takeDamage === 'function' && !p.takeDamage.__hzcWrapped) {
      const orig = p.takeDamage.bind(p);
      const wrapped = function (amount, from) {
        let a = amount;
        try {
          if (!wrapped.__hzcNative) a = amount * self.mult('damageIn');
          // onboarding-loop-death-no-stakes wants the killer's NAME on the death
          // card. The `player-damage` listener in `_bind` gets it for machine
          // hits (verified: `lastKiller` reads "Watcher" after one emit). This
          // line covers the calls that never go through the bus at all —
          // `player.js:1085/1089` call `takeDamage(dmg, 'fall')` directly, and
          // falling off the ridge is a real way to die.
          if (from) self.lastKiller = from.displayName ?? from.kind ?? String(from);
        } catch { a = amount; }
        return orig(a, from);
      };
      wrapped.__hzcWrapped = true;
      wrapped.__hzcOriginal = orig;
      p.takeDamage = wrapped;
      this._playerHook = wrapped;
    }

    /* ---- pouch: Herbalist potency ---- */
    if (p && typeof p.addPouch === 'function' && !p.addPouch.__hzcWrapped) {
      const orig = p.addPouch.bind(p);
      const wrapped = function (amount) {
        let a = amount;
        try { a = amount * self.mult('herbPotency'); } catch { a = amount; }
        return orig(a);
      };
      wrapped.__hzcWrapped = true;
      wrapped.__hzcOriginal = orig;
      p.addPouch = wrapped;
    }

    /* ---- damage dealt: difficulty.damageOut × Precision × Tinker × Strike ---- */
    const first = this.ctx.machines?.list?.[0];
    const Proto = first ? Object.getPrototypeOf(first) : null;
    const MachineProto = this._rootMachineProto(Proto);
    if (MachineProto && typeof MachineProto.takeDamage === 'function'
        && !MachineProto.takeDamage.__hzcWrapped) {
      const orig = MachineProto.takeDamage;
      const wrapped = function (hit) {
        let h = hit;
        try {
          if (!wrapped.__hzcNative && hit) {
            const dmg = self.mult('damageOut');
            const tear = self.mult('tearOut');
            const silent = (hit.type === 'silent-strike' || hit.silent === true)
              ? self.mult('silentStrikeDamage') : 1;
            if (dmg !== 1 || tear !== 1 || silent !== 1) {
              // `machine.js:640` maps the ROUND-1 channel onto impact, but ONLY
              // while `hit.impact === undefined`. Writing `impact: 0` over a
              // legacy `{ baseDamage }` hit therefore did not scale that hit —
              // it deleted it: impact became a defined 0, the compat branch
              // never ran, and the machine took no damage and no tear at all.
              // So resolve the source channel first, and scale the channel the
              // caller actually used.
              const legacy = hit.impact === undefined && hit.baseDamage !== undefined;
              const sTear = tear * (silent > 1 ? 1.15 : 1);
              // shallow copy: `combat` may be reusing its hit record
              h = { ...hit };
              if (legacy) {
                // Leave `impact` undefined so machine.js still runs its own
                // compat branch — that branch is also what maps a legacy
                // `type:'fire'|'shock'|'freeze'` onto elemental buildup, which
                // a resolved-to-impact copy would silently drop.
                h.baseDamage = hit.baseDamage * dmg * silent;
                // ...but pin `tear` here, or the derived tear would ride the
                // scaled baseDamage (picking up damageOut) and miss tearOut.
                // 0.35 mirrors machine.js:643.
                h.tear = (hit.tear ?? hit.baseDamage * 0.35) * sTear;
              } else {
                h.impact = (hit.impact ?? 0) * dmg * silent;
                h.tear = (hit.tear ?? 0) * sTear;
                // keep the legacy field in sync: a consumer reading either one
                // must see the same, skill-scaled number.
                if (hit.baseDamage !== undefined) h.baseDamage = h.impact;
              }
            }
          }
        } catch { h = hit; }
        return orig.call(this, h);
      };
      wrapped.__hzcWrapped = true;
      wrapped.__hzcOriginal = orig;
      MachineProto.takeDamage = wrapped;
      this._machineProto = MachineProto;
    }

    /* ---- noise: Quiet Sprint ---- */
    const machines = this.ctx.machines;
    if (machines && typeof machines.noise === 'function' && !machines.noise.__hzcWrapped) {
      const orig = machines.noise.bind(machines);
      const wrapped = function (opts) {
        try {
          const k = self.mult('noiseRadius');
          if (k !== 1 && opts && opts.kind !== 'impact') {
            return orig({ ...opts, radius: (opts.radius ?? 0) * k, strength: (opts.strength ?? 1) * k });
          }
        } catch { /* fall through to the untouched call */ }
        return orig(opts);
      };
      wrapped.__hzcWrapped = true;
      wrapped.__hzcOriginal = orig;
      machines.noise = wrapped;
    }

    /**
     * Only stop retrying once every wrapper has actually landed.
     *
     * The machine wrapper is found through `machines.list[0]`'s prototype, so
     * installing this lane before the roster exists (a probe, a title-screen
     * boot, or core-platform choosing a different call site in main.js) used to
     * mark the lane hooked with `_machineProto` still null — and Precision,
     * Tinker and Strike from Above would have been dead numbers on a screen for
     * the whole run, which is the exact failure progression-001 is about.
     * `update()` re-attempts at 1 Hz until this flips.
     */
    this._hooked = !!(this._playerHook && this._machineProto
      && (!machines || machines.noise?.__hzcWrapped)
      && (!p || p.addPouch?.__hzcWrapped));
  }

  /**
   * The prototype whose `takeDamage` an instance actually calls — the most
   * derived one that declares it. Today only `Machine.prototype` does, so this
   * resolves to the shared base and one wrapper covers all eight species; if a
   * species ever overrides it, this still wraps the override that runs.
   */
  _rootMachineProto(proto) {
    let p = proto;
    while (p && p !== Object.prototype) {
      if (Object.prototype.hasOwnProperty.call(p, 'takeDamage')) return p;
      p = Object.getPrototypeOf(p);
    }
    return null;
  }

  /* ====================================================================== */
  /* world interactables — campfire + the camp hunter                        */
  /* ====================================================================== */

  _ensureInteractables() {
    const ctx = this.ctx;
    const inter = ctx.interactables;
    if (!inter?.register) return;

    if (!this._campEntry) {
      const fire = ctx.camp?.firePosition;
      const pos = fire ? fire.clone() : new THREE.Vector3(22, 0, 30);
      if (!fire) pos.y = ctx.terrain?.getHeight?.(pos.x, pos.z) ?? 0;
      this._campEntry = inter.register({
        position: pos, radius: 3.4, label: 'REST & SAVE', hold: 0.55,
        onInteract: () => this.openCampfire(),
      });
    }

    if (!this._npcEntry) {
      const npc = ctx.camp?.npc;
      const pos = npc?.position
        ? npc.position.clone()
        : new THREE.Vector3(NPCS.varl.fallback.x, 0, NPCS.varl.fallback.z);
      if (!npc?.position) pos.y = ctx.terrain?.getHeight?.(pos.x, pos.z) ?? 0;
      this._npcEntry = inter.register({
        position: pos, radius: 2.8, label: 'TALK  ·  VARL', hold: 0.35,
        onInteract: () => this.talkTo('varl'),
      });
      this._markersDirty = true;
    }
  }

  /* ====================================================================== */
  /* UI entry points                                                        */
  /* ====================================================================== */

  openQuestLog() { this.ui.openLog(); }
  openSkills() { this.skillsUI.open(); }
  openTrade() { this.ui.openTrade(); }
  openCampfire() { this.ui.openCampfire(); }

  /** Rest at the fire: advance the clock, restore the pouch, save. */
  async rest(toHour = 6.2) {
    const env = this.ctx.environment;
    this.save('campfire');
    if (env?.rest) { try { await env.rest({ toHour, seconds: 2.0 }); } catch { /* env busy */ } }
    const p = this.ctx.player;
    if (p) {
      p.health = p.maxHealth;
      p.pouch = p.maxPouch;
      this._emit('player-hurt', { health: p.health, max: p.maxHealth });
    }
    this.checkpoint('rest');
    this.banner('RESTED', 'HEALTH AND POUCH RESTORED', 'save');
    return true;
  }

  /* ====================================================================== */
  /* frame                                                                  */
  /* ====================================================================== */

  update(dt, t) {
    this._bootT += dt;
    // the trial clock is SIMULATED seconds, never wall time (see `this.clock`)
    this.clock += dt;
    if (!this._campEntry || !this._npcEntry) this._ensureInteractables();

    // Cross-lane hooks that could not resolve at construction (see
    // `_installHooks`): retry at 1 Hz, then never again.
    if (!this._hooked && this._hookTries < 30) {
      this._hookT += dt;
      if (this._hookT >= 1) { this._hookT = 0; this._hookTries++; this._installHooks(); }
    }

    // A first checkpoint so the very first death has something to roll back to
    // (progression-019: dying before you ever reach a campfire must still cost
    // you the pouch you spent, not hand you a fresh one).
    if (!this._bootCheckpoint && this._bootT > 1.5) {
      this._bootCheckpoint = true;
      if (!this.saves.has(SLOT.checkpoint)) this.checkpoint('start');
    }

    /* --- goto objectives + markers, 5 Hz, no allocation --- */
    this._gotoT += dt;
    if (this._gotoT >= 0.2) {
      this._gotoT = 0;
      this._pollInventory();
      this._tickTrials();
      const p = this.ctx.player;
      if (p) {
        const px = p.position.x, pz = p.position.z;
        let reachedSomething = false;
        for (const def of QUESTS) {
          const st = this.questState.get(def.id);
          if (!st || st.state !== 'active') continue;
          // EVERY unfinished goto is tested, not just the current one: walking
          // past the ridge while Varl is still talking has to count when the
          // ridge step comes up (same rule as scan/kill — see `this.tally`).
          for (const o of def.objectives) {
            if (o.type !== 'goto') continue;
            if (st.reached?.[o.id]) continue;
            if ((st.counts[o.id] ?? 0) >= (o.count ?? 1)) continue;
            const a = this._anchor(o);
            if (!a.ok) continue;
            const dx = px - a.x, dz = pz - a.z;
            const r = o.radius ?? 8;
            if (dx * dx + dz * dz <= r * r) {
              if (st.reached) st.reached[o.id] = 1;
              reachedSomething = true;
            }
          }
        }
        // settle unconditionally: cheap (one pass over active quests) and it
        // is also the safety net for any credit banked while a panel was open.
        if (this._settleAll() || reachedSomething) {
          this.ui.refresh();
          this._emitObjectiveChanged();
        }
      }
      if (this._markersDirty) this._rebuildMarkers();
    }

    /* --- Concentration+ : hand back part of the drain --- */
    const conc = this.ctx.combat?.concentration;
    if (conc?.active) {
      const m = this.mult('concentrationDuration');
      if (m > 1 && conc.gauge > 0) {
        conc.gauge = Math.min(1, conc.gauge + (dt / 6) * (1 - 1 / m));
      } else if (m < 1) {
        conc.gauge = Math.max(0, conc.gauge - (dt / 6) * (1 / m - 1));
      }
    }

    /* --- Low Profile: damp suspicion GROWTH while crouched --- */
    const k = this.mult('detectionRate');
    const player = this.ctx.player;
    if (k < 1 && player?.crouching && this.ctx.machines?.list) {
      const list = this.ctx.machines.list;
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (!m || !m.alive || m._disposed) continue;
        const s = m.suspicion;
        if (typeof s !== 'number') continue;
        const prev = this._suspPrev.get(m);
        if (prev !== undefined && s > prev) m.suspicion = prev + (s - prev) * k;
        this._suspPrev.set(m, m.suspicion);
      }
    }

    /* --- victory: banner, then hand the world back --- */
    if (this._victoryT >= 0) {
      this._victoryT += dt;
      if (this._victoryT > 3.2) {
        this._victoryT = -1;
        this._resumeAfterVictory();
      }
    }

    this.ui.update(dt, t);
    this.skillsUI.update(dt, t);
  }

  _resumeAfterVictory() {
    const ctx = this.ctx;
    ctx.events?.emit?.('victory-resume', {});
    // shell-menus owns the endgame card once it lands; until then clear the
    // Round 3 HUD's soft-lock so the valley is playable after the kill.
    if (!ctx.menus) {
      try {
        const hudRoot = ctx.hud?.rootEl ?? document.getElementById('hud');
        hudRoot?.classList?.remove('endgame');
        hudRoot?.querySelectorAll?.('.show').forEach((el) => {
          if (/victory/i.test(el.className)) el.classList.remove('show');
        });
        // hud.js latches `_victoryShown` and re-asserts state='victory' from its
        // own `player-respawn` guard, so leaving it set means the very next
        // death re-locks the game — the ui-13 soft-lock, one death later.
        // Clearing the latch (not `_victoryFired`, so the fanfare stays a
        // one-shot) is part of the same bridge and goes away with `ctx.menus`.
        if (ctx.hud && ctx.hud._victoryShown) ctx.hud._victoryShown = false;
      } catch { /* the HUD moved on — shell-menus owns it now */ }
      if (ctx.state === 'victory') ctx.state = 'playing';
    }
    this.banner('THE HUNT GOES ON', 'THE VALLEY IS YOURS TO WALK', 'victory');
  }

  /* ====================================================================== */
  /* diagnostics — one call, everything a gate needs                        */
  /* ====================================================================== */

  audit() {
    const sites = this.ctx.machines?.sites;
    return {
      level: this.level, xp: this.totalXp, xpIntoLevel: this.xpIntoLevel,
      xpToNext: this.xpToNext, skillPoints: this.skillPoints,
      unlocked: [...this.unlocked], spentPoints: this.spentPoints,
      difficulty: this._difficulty,
      mults: {
        damageIn: this.mult('damageIn'), damageOut: this.mult('damageOut'),
        silentStrikeDamage: this.mult('silentStrikeDamage'),
        concentrationDuration: this.mult('concentrationDuration'),
        gatherYield: this.mult('gatherYield'), lootYield: this.mult('lootYield'),
        detectionRate: this.mult('detectionRate'), noiseRadius: this.mult('noiseRadius'),
        tearOut: this.mult('tearOut'), pouchBonus: this.mult('pouchBonus'),
      },
      quests: QUESTS.map((q) => {
        const s = this.state(q.id);
        return { id: q.id, status: s.status, progress: +s.progress.toFixed(3), current: s.current?.id ?? null };
      }),
      tracked: this.tracked,
      markers: this.getMarkers().length,
      /** expansion round: timed trials, conversation state, respawn tuning */
      clock: +this.clock.toFixed(2),
      trials: [...this.trials.keys()].map((k) => {
        const [qid, oid] = k.split(':');
        return this.trialState(qid, oid);
      }).filter(Boolean),
      dialogue: {
        open: this.dialogue.open, npc: this.dialogue.npc, topic: this.dialogue.topic,
        npcs: NPC_IDS.length,
        seen: [...this.dialogue.seen],
        talked: { ...this.dialogue.talked },
        panel: this.dialogueUI ? this.dialogueUI.audit() : null,
      },
      siteTuning: [...this.siteTuning.entries()].map(([id, v]) => ({ id, ...v })),
      stats: { ...this.stats },
      killsByKind: { ...this.killsByKind },
      clearedSites: [...this.clearedSites],
      /** world-content ledgers — `award()` keys paid once, `discover()` ids logged */
      awarded: [...this.awarded],
      discovered: [...this.discovered],
      hooks: {
        player: !!this.ctx.player?.takeDamage?.__hzcWrapped,
        machine: !!this._machineProto?.takeDamage?.__hzcWrapped,
        noise: !!this.ctx.machines?.noise?.__hzcWrapped,
        pouch: !!this.ctx.player?.addPouch?.__hzcWrapped,
      },
      save: {
        hasSave: this.hasSave(),
        hasCheckpoint: this.saves.has(SLOT.checkpoint),
        lastError: this.saves.lastError,
      },
      sites: sites ? sites.audit() : null,
      merchant: { shards: this.merchant.shards(), stock: this.merchant.stock().length },
      victoryT: this._victoryT,
      /** Foreign listeners this lane had to swallow. Non-empty = someone else's bug. */
      emitFaults: { ...this._emitFaults },
    };
  }

  dispose() {
    for (const off of this._off) { try { off?.(); } catch { /* already gone */ } }
    this._off.length = 0;
    const p = this.ctx.player;
    if (p?.takeDamage?.__hzcOriginal) p.takeDamage = p.takeDamage.__hzcOriginal;
    if (p?.addPouch?.__hzcOriginal) p.addPouch = p.addPouch.__hzcOriginal;
    if (this._machineProto?.takeDamage?.__hzcOriginal) {
      this._machineProto.takeDamage = this._machineProto.takeDamage.__hzcOriginal;
    }
    const machines = this.ctx.machines;
    if (machines?.noise?.__hzcOriginal) machines.noise = machines.noise.__hzcOriginal;
    if (this._campEntry) this.ctx.interactables?.unregister?.(this._campEntry);
    if (this._npcEntry) this.ctx.interactables?.unregister?.(this._npcEntry);
    this.trials.clear();
    this.siteTuning.clear();
    this.ui.dispose();
    this.skillsUI.dispose();
    this.dialogueUI?.dispose?.();
  }
}

/* ========================================================================== */
/* install                                                                    */
/* ========================================================================== */

/**
 * Bring the progression lane up on an existing ctx and register it as a game
 * system. Idempotent: calling it twice returns the same instance.
 *
 * `core-platform` should call this from `main.js` after `ctx.interactables`;
 * until then any page-context probe (and every gate in this lane) calls it
 * directly. See the INTEGRATION NOTE at the top of this file.
 */
export function installProgression(ctx, opts = {}) {
  if (!ctx) return null;
  if (ctx.progression) return ctx.progression;
  const prog = new Progression(ctx, opts);
  ctx.progression = prog;
  if (ctx.game && Array.isArray(ctx.game.systems)) ctx.game.systems.push(prog);
  return prog;
}

/**
 * Zero-integration boot: importing this module against a live ctx installs it.
 * That is what makes `await import('/src/core/progression.js')` sufficient for
 * a probe or a gate, and it is a no-op inside the normal module graph (the ctx
 * does not exist yet when main.js's imports evaluate).
 */
if (typeof window !== 'undefined') {
  window.__installProgression = (ctx) => installProgression(ctx || window.__CTX__);
  if (window.__CTX__ && window.__CTX__.player) {
    try { installProgression(window.__CTX__); }
    catch (err) { console.warn('[progression] auto-install deferred:', err?.message || err); }
  }
}
