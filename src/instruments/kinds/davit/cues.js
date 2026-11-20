/**
 * THE DAVIT'S CUE IDS (M3 wave 1, area C; the Cues seam of M3 briefs §3.2, row IK8). Ids only: audio (area H)
 * renders them; no file of this kind names or plays a sound file. Every state and every event its rules (./rules.js)
 * emit has an id; the `davit/*` ids are new and wait for area H's bank.
 */
export const DAVIT_CUES = Object.freeze({
  /** DavitBrain.state, fired on entering it */
  state: Object.freeze({ idle: 'davit/idle', following: 'mstep/medium', 'to-repair': 'mstep/medium', reseating: 'davit/winch', spent: 'davit/idle' }),
  event: Object.freeze({ 'repair-start': 'davit/crane-swing', reseated: 'davit/reseat', 'plate-off': 'davit/plate-off', 'winch-off': 'davit/winch-break' }),
  lamp: Object.freeze({ calm: 'lamp/calm', wary: 'lamp/wary', hostile: 'lamp/hostile', dark: 'lamp/dark' }),
});
