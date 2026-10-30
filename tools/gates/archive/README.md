# Round-4 gate files, archived (gates-perf, W0a)

These are the Round-4 gate modules exactly as they stood at commit `9d3b891`
(`git show HEAD:tools/<file>`), kept for history only. **Nothing loads them.**
`tools/gates.mjs` scans only `tools/` itself, and `tools/gates.config.mjs`
loads `tools/gates.r5.*.mjs`.

Their 236 CARRY and RESTAGE gates live on, re-staged, in
`tools/gates.r5.carried.mjs` (roles via `tools/gate-roster.mjs`, places via
`tools/gate-places.mjs`, hero bones via the animator). The 12 DIES gates of
`docs/ROUND5-INVENTORY.md` Appendix B were deleted (plan §6).

These files still name Round-4 species, map coordinates and the old rig's bone
literals. They sit outside the `tools/gate*.mjs` glob that
`A-gate-preludes` / `A-gates-no-hero-literals` scan at W0; the W3-scope
`A-gates-no-hero-literals` ("all of `tools/`") must exclude this folder, or the
orchestrator deletes it before the W3 exit (git history keeps every byte).
