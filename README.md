# HORIZON ZERO CLAUDE

A browser-native, third-person robot-dinosaur hunting game in the spirit of
*Horizon Zero Dawn* — built end-to-end by Claude using the
[Gauntlet Loop](https://somethingbig.ai/gauntlet-loop) methodology: parallel
builder agents, adversarial critic agents, and concrete reference standards
("does this look like HZD, or a programmer demo?") iterated until it passes.

![Horizon Zero Claude](shots/hero.png)

## Play

```bash
npm install
npm run dev        # http://localhost:5173
```

| Input | Action |
|---|---|
| WASD | Move |
| Shift | Sprint |
| C | Crouch (stealth in tall grass) |
| Space | Dodge roll |
| RMB | Aim |
| LMB (hold, aiming) | Draw / loose arrow |
| 1 · 2 · 3 | Hunter / Fire / Shock arrows |
| Q | Focus pulse (scan machines through terrain) |
| F | Medicine |
| Esc | Pause |

**The hunt:** clear the valley — 4 Watchers, 2 Sawtooths, the Behemoth, and
finally the Thunderjaw in the southern wastes.

## What's inside

- **Three.js + Vite**, no game engine, no frameworks.
- Six Sketchfab GLB models (435 MB raw) crunched to ~22 MB via
  `gltf-transform` (meshopt + quantization + WebP), `npm run optimize`.
- **Procedural animation** — the models shipped with zero animation clips.
  Aloy's locomotion/aim cycles and the Watcher's walk, neck-scan, and tail
  sway are all runtime bone posing; the big machines move with root-motion
  + procedural sway.
- Analytic simplex-FBM heightfield terrain, GPU-instanced wind-swaying grass,
  golden-hour sky shader, machine AI state machines with sight/hearing
  perception and stealth, part-based damage with weak points, fully
  procedural WebAudio soundscape (not a single audio file).
- A puppeteer screenshot harness (`npm run shot`) that the builder/critic
  agents used to judge their own work — the gauntlet loop's eyes.

## Credits

Models from Sketchfab (Aloy Fortnite rig, Redeye Watcher rig, Sawtooth,
Thunderjaw, Behemoth scans, HZD character fanart) — used here as fan-art in a
non-commercial tech demo. Horizon Zero Dawn is © Guerrilla Games / Sony
Interactive Entertainment; this project is an unaffiliated homage.

🤖 Built with [Claude Code](https://claude.com/claude-code)
