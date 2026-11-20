/**
 * THE SONDE'S CUE IDS (M3 wave 1, area C; the Cues seam of M3 briefs §3.2, row IK8). Ids only: audio (area H)
 * renders them; no file of this kind names or plays a sound file. Every state and every event its rules (./rules.js)
 * emit has an id; the `sonde/*` ids are new and wait for area H's bank.
 */
export const SONDE_CUES = Object.freeze({
  /** SondeBrain.state, fired on entering it */
  state: Object.freeze({ moored: 'sonde/fans', adrift: 'sonde/adrift', sinking: 'sonde/fans-foul', falling: 'sonde/fall', down: 'inst/collapse' }),
  event: Object.freeze({
    'tether-cut': 'sonde/tether-snap', puncture: 'sonde/puncture', 'fans-fouled': 'sonde/fans-foul', 'brought-down': 'sonde/envelope-tear',
    flare: 'sonde/flare', down: 'inst/collapse',
  }),
  lamp: Object.freeze({ calm: 'lamp/calm', wary: 'lamp/wary', hostile: 'lamp/hostile', dark: 'lamp/dark' }),
});
