import { blockoutKind } from './blockout-kind.js';

/**
 * SICKLE — bible §7.4 #5 (medium; role `flanker` from its behaviour wave). A low wedge body on four raked-back legs;
 * a rotating hub at the front with two curved bronze blades that scissor; one slit lamp; an oxblood hub cowl.
 * M2 wave 1: the grey blockout of src/instruments/lib/blockout.js, standing (`./blockout-kind.js`); its pack, the
 * hub bearing's window and the lunge are rules in Node (`./sickle-rules.js`, IN8).
 */
const URL = '/models/instruments/sickle.glb';

export default {
  id: 'sickle',
  /** Size class (lib/sizeclass.js; bible §7.4): footfall weight, the per-class caps and the encounter rule read it. */
  sizeClass: 'medium',
  ...blockoutKind({ id: 'sickle', kind: 'sickle', url: URL, sizeClass: 'medium', plannedRole: 'flanker', displayName: 'Sickle' }),
};
