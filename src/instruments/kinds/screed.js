import { blockoutKind } from './blockout-kind.js';

/**
 * SCREED — bible §7.4 #9 (large; role `heavy` from its behaviour wave). A walking road-grader: a wide hull on six
 * short heavy legs, a 3.6 m moldboard on two rams in front, ripper tines behind, a cab mast with the lamp drum to
 * 3.8 m, a disc platform and a finial. M2 wave 1: the grey blockout of src/instruments/lib/blockout.js, standing
 * (`./blockout-kind.js`); its charge, stall, parts and cut are rules in Node (`./screed-rules.js`, IN5-IN7).
 * The first `large` kind: A76's third weight class (heavy) and the encounter rule's anchor read it.
 */
const URL = '/models/instruments/screed.glb';

export default {
  id: 'screed',
  /** Size class (lib/sizeclass.js; bible §7.4): footfall weight, the per-class caps and the encounter rule read it. */
  sizeClass: 'large',
  ...blockoutKind({ id: 'screed', kind: 'screed', url: URL, sizeClass: 'large', plannedRole: 'heavy', displayName: 'Screed' }),
};
