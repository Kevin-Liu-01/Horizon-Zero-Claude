/**
 * THE SPINDLE'S CUE IDS (M3 wave 1, area C; the Cues seam of M3 briefs §3.2, row IK8). Ids only: audio (area H)
 * renders them; no file of this kind names or plays a sound file. Every state of the ring and the thrust and every
 * event its rules (./rules.js) emit has an id; the `spindle/*` ids are new and wait for area H's bank.
 */
export const SPINDLE_CUES = Object.freeze({
  /** the ring's states (SpindleRing.state) and the thrust's phases (SpindleThrust.phase), fired on entering them */
  state: Object.freeze({
    spinning: 'spindle/ring-spin', slowed: 'spindle/ring-drag', stopped: 'spindle/ring-stop',
    windup: 'spindle/thrust-windup', dash: 'spindle/thrust', recover: 'spindle/thrust-recover', rest: 'mstep/medium',
  }),
  event: Object.freeze({ deflect: 'spindle/deflect', 'bearing-exposed': 'spindle/bearing', 'thrust-hit': 'inst/strike' }),
  lamp: Object.freeze({ calm: 'lamp/calm', wary: 'lamp/wary', hostile: 'lamp/hostile', dark: 'lamp/dark' }),
});
