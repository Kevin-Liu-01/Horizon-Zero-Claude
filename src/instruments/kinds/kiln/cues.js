/**
 * THE KILN'S CUE IDS (M3 wave 1, area C; the Cues seam of M3 briefs §3.2, row IK8: "each kind fires its cue ids on
 * every state change, 0 direct file plays"). Ids only: audio (area H) renders them into src/audio/manifest.js and its
 * director plays them; no file of this kind names a sound file or plays one. `null` is never an answer: every state
 * and every event the brain (./rules.js) emits has an id. Ids already in the manifest are shared (`mstep/heavy`,
 * `lamp/*`, `inst/stagger`); the `kiln/*` ids are new and wait for area H's bank (tools/gates/instruments/m3 IK8 lists
 * them as pending).
 */
export const KILN_CUES = Object.freeze({
  /** one per brain state (KilnBrain.state), fired on entering it */
  state: Object.freeze({
    idle: 'kiln/idle', walking: 'mstep/heavy', coupling: 'kiln/couple', plugged: 'kiln/plugged',
    unplugging: 'kiln/uncouple', awake: 'kiln/wake',
  }),
  /** one per brain event (KilnBrain.events[].type) and per mortar beat (planVolley, shellWarning) */
  event: Object.freeze({
    'door-sprung': 'kiln/door-spring', 'door-shut': 'kiln/door-shut', stagger: 'inst/stagger',
    plugged: 'kiln/hose-lock', unplugged: 'kiln/hose-free', 'wake-held': 'kiln/wake-held',
    volley: 'kiln/mortar', whistle: 'kiln/whistle', impact: 'kiln/shell', 'held-fire': 'kiln/mortar-hold',
  }),
  /** the lamp's states (src/instruments/lamps.js), the shared ids */
  lamp: Object.freeze({ calm: 'lamp/calm', wary: 'lamp/wary', hostile: 'lamp/hostile', dark: 'lamp/dark' }),
});
