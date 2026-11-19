import { blockoutKind } from './blockout-kind.js';
import { FORMS } from '../lib/blockout.js';

/**
 * THE TILLER'S DEFAULT FORM AT BLOCKOUT (M2 wave 1; owner question Q1's default: a 2.7 m six-stilt hull, 4.5 x 1.8 m,
 * with a skirt because IN0 found the sightline passing under the M1 body's belly). A line-up kind only: it stands for
 * F23-tiller and F38 so the form can be judged grey before its art (wave 2) replaces the M1 body of `./tiller.js`,
 * which keeps walking the world until then. No role, no doctrine, never spawned by the world.
 */
const URL = '/models/instruments/tiller-blockout.glb';

export default {
  id: 'tiller-blockout',
  /** Size class (lib/sizeclass.js; bible §7.4, the Tiller's): footfall weight, the per-class caps and the encounter rule read it. */
  sizeClass: 'medium',
  ...blockoutKind({ id: 'tiller-blockout', kind: 'tiller', formId: FORMS.tiller.chosen, url: URL, sizeClass: 'medium', plannedRole: null, displayName: 'Tiller' }),
};
