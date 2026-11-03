# ROUND 5 — lane melee (W1): the lance on Brea

Status: in progress (relaunch of Nov 3 08:50). Numbers below are from the last run named in each row.

## 1. What this lane built

- `src/entities/anim/meleeLayer.js`: the guard, the beat table and the stance tables on Brea with the 1.55 m
  lance, two hands on the haft (R1, R12), the hips turning and travelling with the beat (`py`, `dz` on every
  pose key), her eyes on the target (`HEAD_LEVEL`, `HEAD_LEAD`), the legs living in the guard and loading into
  the beat (`_stanceMix`).
- `src/combat/melee.js`: the press starts the swing (A-melee-latency), the draw is over when the grip is (R5),
  the Undercut draws first (M11), hit-stop holds the blade on the machine, `LANCE_VARIANTS` tuning.
- `src/combat/lanceStow.js`: the one surface other lanes read about the lance.
- `tools/gates.r5.melee.mjs`: the §9 W1 block.

## 2. API

```
lanceOut(melee) -> boolean
lanceObjects(melee, out) -> out
createHeldLance(ctx, url?) -> HeldLance
HeldLance { group, length, grip, grip2, variant, tuning, ready, setUrl(url), setVariant(id), dispose() }
LANCE_VARIANTS { shepherd | obsidian | counterweight: { url, heavyTime, knockdown } }
ctx.combat.melee { active, phase, heavy, combo, stance, lance, lanceInHand, drawLance(hold), holsterLance(fast),
                   swing({ heavy }), undercut(), undercutTarget, audit() }
```

## 3. Gate table

Filled at the end of the lane run.

## 4. Gaps and asks

Filled at the end of the lane run.
