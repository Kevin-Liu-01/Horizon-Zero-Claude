/**
 * M3 area C (instruments), wave 2: the Sonde's swept-volume mask PROOF staging. Inert in every film unless the
 * environment says CALIMA_SONDE_PROOF=1, and then only on the proof's second repeat (`film.mjs --repeat 3`: repeat 1
 * and 3 are the frames as accepted, repeat 2 the same frames with the grey Sonde moored at its post), so a film of the
 * frozen set never sees it. The install is tools/gates/instruments/m3/sonde-stage-page.mjs; the masks and the
 * comparison are tools/gates/instruments/m3/sonde-mask.mjs. This lane file adds no frame.
 */
export const lane = 'm3-instruments';
export const frames = [];

/** The sixteen accepted frames (tools/frames/accepted.json at 034a602). */
export const PROOF_FRAMES = Object.freeze(['F02', 'F03', 'F05', 'F08', 'F09', 'F10', 'F11', 'F13', 'F14', 'F15', 'F16', 'F18', 'F19', 'F20', 'F23-plumb', 'F24']);

const hook = {
  async world(f, api) {
    if ((f._repeat || 1) !== 2) return;
    const m = await import('/tools/gates/instruments/m3/sonde-stage-page.mjs');
    await m.install(f, api);
  },
};

export const stagings = process.env.CALIMA_SONDE_PROOF === '1' ? Object.fromEntries(PROOF_FRAMES.map((id) => [id, hook])) : {};
