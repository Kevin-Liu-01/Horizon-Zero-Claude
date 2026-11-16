#!/usr/bin/env node
/**
 * THE COLOUR-VISION CHECK ON UI TOKENS (BUILD M1.6m): "UI tokens with different meanings >= 15 dE2000 apart under three
 * simulated colour-vision types, or differ in shape". Node only, no browser.
 *
 * The tokens are read from the CSS the game ships (src/style.css; `var()` resolved), and the accessibility palettes
 * from src/ui/settings.js (PALETTES: what the READING page's "Colour palette" row re-points). The simulation is
 * Machado, Oliveira and Fernandes 2009 at severity 1.0 (protanopia, deuteranopia, tritanopia), applied in linear sRGB;
 * the difference is CIEDE2000 (src/instruments/lib/color.js, checked against the Sharma pairs in Tier 0).
 *
 * GRADED: for each type, the palette a player with that type picks (PROTAN, DEUTAN, TRITAN), simulated under that type.
 * Every pair of SIGNALS is at least MIN_DE apart, or the pair is in SHAPES and every piece of its evidence is found in
 * the shipped CSS. REPORTED: the default palette under all three types (a player who has not picked one).
 *
 *   node tools/reach/cvd.mjs [--json]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deltaE, hexToRgb, rgbToHex, srgbToLinear, linearToSrgb } from '../../src/instruments/lib/color.js';
import { PALETTES } from '../../src/ui/settings.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const MIN_DE = 15;

/** Machado 2009, severity 1.0, linear sRGB rows. */
export const MACHADO = Object.freeze({
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.011820, 0.042940, 0.968881],
  tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.303900],
});
/** The palette (settings.js PALETTES key) a player with each type picks. */
export const PALETTE_FOR = Object.freeze({ protan: 'protanopia', deutan: 'deuteranopia', tritan: 'tritanopia' });

/** The UI's signal tokens and what each one means. `fixed` ones are not re-pointed by a palette. */
export const SIGNALS = Object.freeze({
  staff: { css: '--cal-c-staff', means: 'the staff, a warning, full draw' },
  weak: { css: '--cal-c-weak', means: 'a weak point' },
  pry: { css: '--cal-c-pry', means: 'Pry' },
  wary: { css: '--cal-c-wary', means: 'an Instrument is wary' },
  hostile: { css: '--cal-c-hostile', means: 'an Instrument is hostile' },
  good: { css: '--cal-c-good', means: 'a gain, healing' },
  calm: { css: '--cal-lamp-calm', means: 'an Instrument is calm', fixed: true },
  select: { css: '--cal-select-line', means: 'the selection', fixed: true },
});

/**
 * Pairs that differ in shape where they are drawn, each with the CSS that makes them differ (every pattern must be
 * found in the shipped CSS, or the claim does not count).
 */
export const SHAPES = Object.freeze({
  'calm|select': {
    why: 'calm is a round lamp iris and a fill; the selection is a 1-2 px line along a row or a 7 px square mark',
    evidence: [/\.cal-iris i \{[^}]*border-radius: 50%/, /\.cal-iris\[data-s='calm'\][^}]*--ap: 1;/,
      /\.cal-qs-cell\.on \{[^}]*border-bottom: 2px solid var\(--cal-select-line\)/, /\.ch-mark \{[^}]*width: 7px; height: 7px;[^}]*var\(--cal-select-line\)/],
  },
  'calm|wary': {
    why: 'the lamp iris opens to the full disc when calm and half when wary',
    evidence: [/\.cal-iris\[data-s='calm'\][^}]*--ap: 1;/, /\.cal-iris\[data-s='wary'\][^}]*--ap: 0\.5;/],
  },
  'calm|hostile': {
    why: 'the lamp iris is the full disc when calm and a pin (0.2) when hostile',
    evidence: [/\.cal-iris\[data-s='calm'\][^}]*--ap: 1;/, /\.cal-iris\[data-s='hostile'\][^}]*--ap: 0\.2;/],
  },
  'hostile|wary': {
    why: 'the iris is half open when wary and a pin when hostile; the exposure vial blinks only when seen',
    evidence: [/\.cal-iris\[data-s='wary'\][^}]*--ap: 0\.5;/, /\.cal-iris\[data-s='hostile'\][^}]*--ap: 0\.2;/,
      /\.cal-vial\[data-m='seen'\] \.cal-vial-tube \{ animation:/],
  },
  'good|staff': {
    why: 'a gain flash carries a double rule, a warning flash a single one',
    evidence: [/\.cal-flash\.k-good \{ box-shadow: inset calc\(2px \* var\(--s\)\) 0 0 var\(--cal-c-good\), inset calc\(4px \* var\(--s\)\) 0 0 var\(--cal-glass-hud\), inset calc\(6px \* var\(--s\)\) 0 0 var\(--cal-c-good\)/,
      /\.cal-flash\.k-warn \{ box-shadow: inset calc\(3px \* var\(--s\)\) 0 0 var\(--cal-c-staff\)/],
  },
});
const pairKey = (a, b) => [a, b].sort().join('|');

/** The shipped CSS, every file the game loads its UI from. */
export function readCss(root = ROOT) {
  const files = ['src/style.css', 'src/ui/hud.css', 'src/ui/glass.css', 'src/ui/title.css', 'src/ui/making.css',
    'src/ui/character.css', 'src/ui/inventory.css', 'src/ui/sighting.css'];
  return files.map((f) => { try { return readFileSync(path.join(root, f), 'utf8'); } catch { return ''; } }).join('\n');
}

/** `--name: value` from the CSS, `var()` resolved (the first definition wins: :root comes first in style.css). */
export function tokenTable(css) {
  const raw = new Map();
  for (const m of css.matchAll(/(--cal-[\w-]+)\s*:\s*([^;]+);/g)) if (!raw.has(m[1])) raw.set(m[1], m[2].trim());
  const resolve = (name, depth = 0) => {
    const v = raw.get(name);
    if (!v || depth > 8) return null;
    const r = /^var\((--[\w-]+)\)$/.exec(v);
    return r ? resolve(r[1], depth + 1) : v;
  };
  return { get: (name) => resolve(name) };
}

/** A hex colour seen by a type (null type = as authored). */
export function simulate(hex, type) {
  const rgb = hexToRgb(hex);
  if (!type) return rgbToHex(rgb);
  const m = MACHADO[type], l = rgb.map(srgbToLinear);
  return rgbToHex([0, 1, 2].map((i) => linearToSrgb(Math.min(1, Math.max(0, m[3 * i] * l[0] + m[3 * i + 1] * l[1] + m[3 * i + 2] * l[2])))));
}

/** The signal colours under one palette (null = the default). */
export function signalColours(css, paletteName) {
  const T = tokenTable(css);
  const P = paletteName ? PALETTES[paletteName] : null;
  const out = {};
  for (const [id, s] of Object.entries(SIGNALS)) {
    const v = (!s.fixed && P?.[s.css]) || T.get(s.css);
    if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`token ${s.css} does not resolve to a hex colour (${v})`);
    out[id] = v.toUpperCase();
  }
  return out;
}

/** Every pair of signals under one type: dE, the shape claim and whether its evidence is in the CSS. */
export function pairs(css, colours, type) {
  const ids = Object.keys(colours), seen = Object.fromEntries(ids.map((k) => [k, simulate(colours[k], type)]));
  const out = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j], key = pairKey(a, b);
    const de = deltaE(seen[a], seen[b]);
    const S = SHAPES[key];
    const shape = S ? { why: S.why, found: S.evidence.every((re) => re.test(css)) } : null;
    out.push({ pair: key, de: +de.toFixed(1), shape, pass: de >= MIN_DE || !!shape?.found });
  }
  return out;
}

/** The whole check. */
export function check(root = ROOT) {
  const css = readCss(root);
  const graded = {}, dflt = {};
  for (const type of Object.keys(MACHADO)) {
    const pal = PALETTE_FOR[type];
    const P = pairs(css, signalColours(css, pal), type);
    graded[type] = { palette: pal, min: Math.min(...P.filter((p) => !p.shape?.found).map((p) => p.de)), fails: P.filter((p) => !p.pass), pairs: P };
    const D = pairs(css, signalColours(css, null), type);
    dflt[type] = { min: Math.min(...D.map((p) => p.de)), under: D.filter((p) => p.de < MIN_DE).map((p) => ({ pair: p.pair, de: p.de, shape: !!p.shape?.found })),
      fails: D.filter((p) => !p.pass).map((p) => `${p.pair} ${p.de}`) };
  }
  const shapes = Object.fromEntries(Object.entries(SHAPES).map(([k, S]) => [k, S.evidence.every((re) => re.test(css))]));
  return { pass: Object.values(graded).every((g) => g.fails.length === 0), minDE: MIN_DE, graded, default: dflt, shapes };
}

if (import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const r = check();
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 1)); process.exit(r.pass ? 0 : 1); }
  for (const [type, g] of Object.entries(r.graded)) {
    console.log(`${g.fails.length ? 'FAIL' : 'PASS'} ${type} with the ${g.palette} palette: closest pair without a shape difference ${g.min.toFixed(1)} dE2000 (bar ${MIN_DE})${g.fails.length ? '; under the bar: ' + g.fails.map((p) => `${p.pair} ${p.de}`).join(', ') : ''}`);
  }
  for (const [type, d] of Object.entries(r.default)) {
    console.log(`  default palette under ${type}: closest ${d.min.toFixed(1)}; under ${MIN_DE}: ${d.under.map((p) => `${p.pair} ${p.de}${p.shape ? ' (shape)' : ''}`).join(', ') || 'none'}`);
  }
  console.log(`  shape claims found in the CSS: ${Object.entries(r.shapes).map(([k, v]) => `${k} ${v ? 'yes' : 'NO'}`).join(', ')}`);
  process.exit(r.pass ? 0 : 1);
}
