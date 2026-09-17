# NPC assets — lane `npc` (Round 4, Wave 4)

**Nothing was downloaded for this lane.** The rig and the clip library the camp's
people run on were already in the repo, and the bodies are generated against that
rig at boot. This file records the sourcing decision, the licence of what is
actually used, and the tradeoff against the brief's first choice.

---

## 1. What the NPCs are made of

| part | source | licence | where |
|---|---|---|---|
| skeleton (53 joints, humanoid, T-pose bind, 1.75 m, +Y up / +Z fwd) | Quaternius — **Universal Animation Library** (`Rig` > `root` > `DEF-*`) | **CC0 1.0** — bundled `public/anims/LICENSE` | `public/anims/AnimationLibrary_Godot_Standard.gltf` (+ `.bin`) |
| 46 animation clips (`Idle_Loop`, `Walk_Loop`, `Sitting_*`, `Interact`, `PickUp_Table`, `Fixing_Kneeling`, `Push_Loop`, `Punch_Jab`, `Crouch_Idle_Loop`, `Sword_Idle`, `Dance_Loop`, …) | same file | **CC0 1.0** | same file |
| bodies, faces, hair, outfits, carried gear | **generated in this repo** by `src/world/npc/npcBody.js` | this project's own code | — |

Pack pages (for the credits screen and for re-fetching):

- Universal Animation Library — <https://quaternius.com/packs/universalanimationlibrary.html> (CC0, <https://creativecommons.org/publicdomain/zero/1.0/>)
- Universal Base Characters — <https://quaternius.com/packs/universalbasecharacters.html> (CC0) — *the pack the brief asked for; see §2*
- Modular Character Outfits Fantasy — <https://quaternius.com/packs/modularcharacteroutfitsfantasy.html> (CC0, "compatible with the Universal Base Characters")

CC0 requires no attribution. Quaternius is credited anyway in the credits
screen, alongside the Round-3 machine assets in `../MANIFEST.md`.

## 2. The tradeoff — why the character pack was not fetched

The brief's first choice was Quaternius **Universal Base Characters** (CC0),
which rides this same rig. Its only distribution channel is an interactive
itch.io download widget (`quaternius.itch.io/universal-base-characters`); the
pack page carries no direct file URL, and an agent must not pull binaries
through an unattended purchase/download flow. The brief's own fallback therefore
applies: build the bodies here, on the UAL skeleton, and document the tradeoff.

**What is lost.** Hand-sculpted heads and hands, UV'd textures, and the pack's
62-piece modular outfit set. These NPCs are untextured, vertex-coloured,
~2.0–2.4 k triangles each, and read as stylised rather than sculpted up close.

**What is gained, and it is not a consolation prize.**

- **No retargeting at all.** The clips were authored on this exact skeleton, so
  a walk cycle on an NPC is the animator's walk cycle — not a mapping of it. The
  character lane's `ClipLibrary` has to bake these same clips onto Aloy's
  424-joint rig through a solver; this lane skips that problem entirely.
- **One draw call per person.** Body, clothes, hair, spear, bow and basket are
  one skinned buffer with vertex colours. The thirteen-person crowd costs
  thirteen draws — what the six baked mannequins it replaces already cost.
- **Variety is a parameter, not an import.** Six body builds (`lean`, `broad`,
  `stocky`, `slight`, `tall`, `elder`) × per-NPC palette, hair style, outfit
  grammar and carried gear. `A95-npc-roster` measures the result: thirteen
  distinct mesh/colour signatures across six builds.
- **Licence-clean by construction.** Nothing non-commercial, nothing to
  re-distribute, no upstream file to attribute beyond CC0.

**If the pack is ever fetched by hand**, it drops straight in: place the `.gltf`
in `public/models/npc/`, load it through `assets.loadExtra`, and point
`NpcRigSource.instantiate()` at its skeleton — the clip names, bone names and
bind space are the same. `npcBody.js` becomes optional dressing on top.

## 3. Bone-name caveat (bit us once, recorded so it does not again)

`GLTFLoader` runs every node name through `PropertyBinding.sanitizeNodeName`,
which strips the characters an animation-track path reserves. The pack's
`DEF-spine.001` therefore arrives in three.js as `DEF-spine001`, and
`DEF-toe.L` as `DEF-toeL`. `NpcRigSource._bindNames()` rewrites the lane's bone
table to whatever the loaded skeleton really calls them. Without it every skin
weight silently falls back to bone 0 and the whole crowd renders as rigid
T-poses welded to the root.

## 4. Files

`public/models/npc/` is reserved for a future downloaded character pack and is
empty by design; `public/models/npc.glb` is the Round-2 static mannequin and
belongs to `world-props`, not to this lane.
