import { artKind } from './art-kind.js';

/**
 * SCREED — bible §7.4 #9 (large; role `heavy` from its behaviour wave). A walking road-grader: a wide plated hull on
 * six short heavy legs, the 3.5 m moldboard on a push frame and two rams in front, the ripper behind, a spoil hopper,
 * and the cab mast with its ONE lamp, the disc platform, two banners and a finial to 3.8 m. M2 wave 2: its art
 * (tools/build/instruments/gen-screed.mjs, the Instruments' shared language) standing on its rig (`./art-kind.js`);
 * its charge, stall, parts and cut are rules in Node (`./screed-rules.js`, IN5-IN7) until wave 3.
 * The first `large` kind: A76's third weight class (heavy) and the encounter rule's anchor read it.
 */
const URL = '/models/instruments/screed.glb';
const HEX = { stride: 0.8, duty: 0.66, lift: 0.12, offsets: { LF: 0, RM: 0, LH: 0, RF: 0.5, LM: 0.5, RH: 0.5 } };

export default {
  id: 'screed',
  /** Size class (lib/sizeclass.js; bible §7.4): footfall weight, the per-class caps and the encounter rule read it. */
  sizeClass: 'large',
  ...artKind({
    id: 'screed', kind: 'screed', url: URL, sizeClass: 'large', plannedRole: 'heavy', displayName: 'Screed',
    height: 3.8, bodyRadius: 1.8,
    // the two ram seals (IN6: both `off` drop the blade)
    weak: (S) => (Array.isArray(S.seals) ? S.seals.map((at) => ({ name: 'ram seal', at, r: (S.sealR ?? 0.18) * 1.2, mult: 2.5 })) : []),
    gait: {
      walk: HEX, run: { ...HEX, stride: 1.6, duty: 0.5, lift: 0.18 }, runRef: 8,
      rollAmp: 0.008, impactAmp: 0.03, breatheRate: 0.45, stepDustSpeed: 3,
      turnRadius: 4.0, lookClampYaw: 0.12, stanceFlex: 0.04, fidgets: [],
    },
  }),
};
