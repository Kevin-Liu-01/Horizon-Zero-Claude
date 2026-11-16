/**
 * THE REACH LANE'S STATIC ROWS (BUILD M1.6m, engine lane). Node runners: no browser, no page.
 *
 *   A-lamp-canon-distance-ui  instruments-core's A-lamp-canon-distance (every lamp, beam, scanner and compass-pip
 *                             colour token >= 20 dE2000 from the five excluded colours), AND the lamp roles of every
 *                             accessibility palette (src/ui/settings.js PALETTES: the wary and hostile pips), which the
 *                             CSS scan never sees because the palettes re-point the pips at run time. The shell-ui lane
 *                             file that used to define this id has not loaded since M0.9 retired docs/ROUND5-PLAN.md
 *                             (gates.config.mjs LOAD_FAILURES), so the row was dark; it lives here now.
 *   A-cvd-ui-tokens           tools/reach/cvd.mjs: UI signal tokens with different meanings >= 15 dE2000 apart under
 *                             protanopia, deuteranopia and tritanopia (Machado 2009), with the DEFAULT tokens and with
 *                             each type's palette, or a shape difference whose evidence and form invariants hold.
 *
 *   node tools/gates.mjs --port <p> --only A-lamp-canon-distance-ui,A-cvd-ui-tokens
 */
const LANE = 'reach';

const A_LAMP_UI = {
  id: 'A-lamp-canon-distance-ui', kind: 'runner', lane: LANE, timeout: 120000,
  title: 'instruments-core\'s A-lamp-canon-distance over the CSS tokens, and the lamp roles (wary, hostile) of every accessibility palette: dE2000 >= 20 from #38c6ff #ffb31f #ff2413 #19ffd0 #9B6BFF',
  async check(ctx) {
    const core = (await import('./gates.r5.instruments-core.mjs')).GATES.find((g) => g.id === 'A-lamp-canon-distance');
    const r = core ? await core.check(ctx) : { pass: null, detail: { note: 'instruments-core row not found' } };
    const { paletteCanon, LAMP_FLOOR } = await import('./reach/cvd.mjs');
    const P = paletteCanon();
    const lamps = P.rows.filter((x) => x.lamp);
    const palettes = { pass: P.pass, floor: LAMP_FLOOR, graded: lamps.map((x) => `${x.palette} ${x.token} ${x.hex} min dE ${x.minDE} (vs ${x.nearest})`),
      offenders: lamps.filter((x) => !x.pass),
      notLampsUnderFloor: P.rows.filter((x) => !x.lamp && x.minDE < LAMP_FLOOR).map((x) => `${x.palette} ${x.token} ${x.hex} ${x.minDE} vs ${x.nearest}`) };
    return { pass: r.pass === null ? null : !!r.pass && P.pass, detail: { css: r.detail, palettes } };
  },
};

const A_CVD = {
  id: 'A-cvd-ui-tokens', kind: 'runner', lane: LANE, timeout: 60000,
  title: 'UI tokens with different meanings >= 15 dE2000 apart under three simulated colour-vision types (default tokens and each type\'s palette), or differ in shape (evidence and form invariants over every use)',
  async check() {
    const { check } = await import('./reach/cvd.mjs');
    const r = check();
    return { pass: r.pass, detail: {
      graded: Object.fromEntries(Object.entries(r.graded).map(([t, g]) => [t, { palette: g.palette, min: g.min, fails: g.fails.map((p) => `${p.pair} ${p.de}`) }])),
      default: r.default, shapes: r.shapes,
      claims: Object.fromEntries(Object.entries(r.claims).map(([k, c]) => [k, { found: c.found, missing: c.missing, forms: c.forms }])),
    } };
  },
};

export const GATES = [A_LAMP_UI, A_CVD];
