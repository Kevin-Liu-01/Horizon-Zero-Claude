import { REED_KIND, COVER_LINE } from '../../world/island/reedmask.js';
import { GUST } from './gust.js';

/**
 * THE REED RULE (bible §14 "Reed cover"): "she is hidden when she is in cover and either still or the wind there is
 * 4 m/s or more. Below 4 m/s only stillness hides her. Carrizo hides her standing; junco only crouched; marram
 * colonies count; the golden meadow never does."
 *
 *   kind     what she stands in at her feet: CARRIZO / JUNCO (the reed mask, src/world/island/reedmask.js),
 *            MARRAM (the terrain's marram field), NONE (open ground, the meadow, a cut lane)
 *   cover    0..1 there, after the Peg cuts; in cover at COVER_LINE (0.45, the marram field's own line)
 *   crouch   she is crouched
 *   speed    her ground speed (m/s); still below 0.5 (the perception's own line, ai/perception.js)
 *   wind     the wind at that bed now (m/s, its gust clock)
 *
 * Marram is knee-high: like junco it hides her only crouched. The meadow is never a kind here (it hides nobody).
 */
export const STILL = 0.5;

export function inCover(kind, cover, crouch) {
  if (cover < COVER_LINE) return false;
  if (kind === REED_KIND.CARRIZO) return true;
  if (kind === REED_KIND.JUNCO || kind === REED_KIND.MARRAM) return !!crouch;
  return false;
}

export function reedHidden(kind, cover, crouch, speed, wind) {
  if (!inCover(kind, cover, crouch)) return false;
  return speed < STILL || wind >= GUST.on;
}
