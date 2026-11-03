/**
 * CALIMA · rig profiles (hero-body W0b). One entry point the Player calls on
 * the hero body before anything clones it:
 *
 *   attachRigProfile(root) -> profile | null
 *
 * It recognises the skeleton and writes `root.userData.rigProfile` (unless one
 * is already there). No profile = the Round-4 named rig, every seam unchanged.
 */
import { isUbcRig, ubcProfile } from './ubc.js';

export { ubcProfile, isUbcRig, UBC_TUNE, UBC_BOW, UBC_KEY, UBC_HAND_COLLIDER } from './ubc.js';

export function attachRigProfile(root) {
  if (!root) return null;
  if (root.userData?.rigProfile) return root.userData.rigProfile;
  if (isUbcRig(root)) {
    root.userData.rigProfile = ubcProfile(root);
    return root.userData.rigProfile;
  }
  return null;
}
