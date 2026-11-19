import { artKind } from './art-kind.js';

/**
 * SICKLE — bible §7.4 #5 (medium; role `flanker` from its behaviour wave). A low wedge body on four raked-back legs;
 * a rotating hub at the front with two curved bronze blades that scissor; one lamp; an oxblood band on the hub cowl.
 * M2 wave 2: its art (tools/build/instruments/gen-sickle.mjs, the Instruments' shared language: white enamel plates,
 * brass, gunmetal, a lamp drum ON its right shoulder, the coolant flask a pale-ice vial, one antenna), standing on
 * its rig (`./art-kind.js`); its pack, the hub bearing's window and the lunge are rules in Node (`./sickle-rules.js`,
 * IN8) until wave 3.
 */
const URL = '/models/instruments/sickle.glb';
const QUAD = { stride: 0.9, duty: 0.6, lift: 0.14, offsets: { LF: 0, RH: 0.25, RF: 0.5, LH: 0.75 } };

export default {
  id: 'sickle',
  /** Size class (lib/sizeclass.js; bible §7.4): footfall weight, the per-class caps and the encounter rule read it. */
  sizeClass: 'medium',
  ...artKind({
    id: 'sickle', kind: 'sickle', url: URL, sizeClass: 'medium', plannedRole: 'flanker', displayName: 'Sickle',
    height: 1.7, bodyRadius: 0.75,
    // the hub bearing: exposed in the Clearcut wind-up (IN8; the window is wave 3's)
    weak: (S) => (Array.isArray(S.hub) ? [{ name: 'hub bearing', at: S.hub, r: (S.hubR ?? 0.13) * 1.3, mult: 2.5 }] : []),
    gait: {
      walk: QUAD, run: { ...QUAD, stride: 1.6, duty: 0.45, lift: 0.2 }, runRef: 7,
      rollAmp: 0.012, impactAmp: 0.012, breatheRate: 0.9, stepDustSpeed: 6,
      turnRadius: 1.0, lookClampYaw: 0.3, stanceFlex: 0.06, fidgets: [],
    },
  }),
};
