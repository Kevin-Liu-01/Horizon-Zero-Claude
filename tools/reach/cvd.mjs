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
 * GRADED (round 2: both): (1) THE DEFAULT TOKENS under all three types (a player who has not picked a palette), and
 * (2) for each type, the palette a player with that type picks (PROTAN, DEUTAN, TRITAN), simulated under that type.
 * Every pair of SIGNALS is at least MIN_DE apart, or the pair is in SHAPES: every piece of its evidence is found in the
 * shipped CSS (or code) AND its form invariants hold over every place the shipped CSS draws either token (`census`:
 * each declaration that uses the token, directly or through a custom property that aliases it). A claim that one
 * token is only ever a rule, a pin or a labelled chip fails the moment someone draws it another way.
 * Also: the lamp roles of every palette (wary, hostile) are >= 20 dE2000 from the five excluded colours (LAMP_CANON).
 *
 *   node tools/reach/cvd.mjs [--json]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deltaE, hexToRgb, rgbToHex, srgbToLinear, linearToSrgb } from '../../src/instruments/lib/color.js';
import { PALETTES } from '../../src/ui/settings.js';
import { LAMP_CANON } from '../../src/instruments/lamps.js';

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
  /* round 2 (the judge's fix list 2): the four default-token pairs under 15 dE in some type. Each is a form the token
   * keeps wherever it is drawn, checked over the whole census, not a sample. */
  'good|pry': {
    why: 'a gain is only ever a rule (an outline or the double rule of its flash), never a fill or a letter; Pry is only ever a filled chip that says PRY inside a staff-white inner frame',
    evidence: [/\.cal-dmg\.pry \{[^}]*box-shadow: inset 0 0 0 1px var\(--cal-pry-frame\)/, /\.calf-tag-pry \{[^}]*box-shadow: inset 0 0 0 1px var\(--cal-pry-frame\)/],
    code: [['src/ui/hud.js', /_popNumber\([^)]*'PRY', 'pry'/], ['src/ui/sighting.js', /<i class="calf-tag-pry">PRY<\/i>/]],
    forms: (U) => [
      ['good: every use is a box-shadow rule', all(U('--cal-c-good'), (u) => u.prop === 'box-shadow')],
      ['pry: every use is the fill of a .pry chip', all(U('--cal-c-pry'), (u) => u.prop === 'background' && /pry/.test(u.sel))],
    ],
  },
  'hostile|weak': {
    why: 'hostile is only the pin of a lamp iris (a 0.2 disc) and the blinking bubble of the exposure vial; a weak point is never drawn in a lamp or the vial: a hollow ring on the Sighting card, a line or a square elsewhere',
    evidence: [/\.cal-iris\[data-s='hostile'\][^}]*--ap: 0\.2;/, /\.calf-ring \{ fill: none; stroke: var\(--cal-c-weak\)/, /\.cal-vial\[data-m='seen'\] \.cal-vial-tube \{ animation:/],
    forms: (U) => [
      ['hostile: only in .cal-iris or .cal-vial', all(U('--cal-c-hostile'), (u) => LAMP_SEL.test(u.sel))],
      ['weak: never in .cal-iris or .cal-vial', all(U('--cal-c-weak'), (u) => !LAMP_SEL.test(u.sel))],
      ['weak: never a round fill', all(U('--cal-c-weak'), (u) => !(/^(background|fill)$/.test(u.prop) && u.round))],
    ],
  },
  'hostile|staff': {
    why: 'hostile is only the pin of a lamp iris and the blinking bubble of the exposure vial; the staff is bars, rules, flags and text, never round and never in a lamp or the vial',
    evidence: [/\.cal-iris\[data-s='hostile'\][^}]*--ap: 0\.2;/, /\.cal-iris i \{[^}]*border-radius: 50%/],
    forms: (U) => [
      ['hostile: only in .cal-iris or .cal-vial', all(U('--cal-c-hostile'), (u) => LAMP_SEL.test(u.sel))],
      ['staff: never in .cal-iris or .cal-vial', all(U('--cal-c-staff'), (u) => !LAMP_SEL.test(u.sel))],
      ['staff: never round', all(U('--cal-c-staff'), (u) => !u.round)],
    ],
  },
  'pry|staff': {
    why: 'Pry is only a chip that says PRY inside a staff-white inner frame; the staff never carries that frame',
    evidence: [/--cal-pry-frame:\s*#F1EEE6/i, /\.cal-dmg\.pry \{[^}]*box-shadow: inset 0 0 0 1px var\(--cal-pry-frame\)/, /\.calf-tag-pry \{[^}]*box-shadow: inset 0 0 0 1px var\(--cal-pry-frame\)/],
    code: [['src/ui/hud.js', /_popNumber\([^)]*'PRY', 'pry'/], ['src/ui/sighting.js', /<i class="calf-tag-pry">PRY<\/i>/]],
    forms: (U) => [
      ['pry: every use is the fill of a .pry chip', all(U('--cal-c-pry'), (u) => u.prop === 'background' && /pry/.test(u.sel))],
      ['staff: no rule that draws it also draws the Pry frame', all(U('--cal-c-staff'), (u) => !/--cal-pry-frame/.test(u.body))],
      ['the Pry frame is only on .pry chips', all(U('--cal-pry-frame'), (u) => /pry/.test(u.sel))],
    ],
  },
});
/** Every use passes, and there is at least one (an invariant over nothing proves nothing). */
const all = (uses, pred) => uses.length > 0 && uses.every(pred);
/** Where the lamp pins live: the lamp iris and the exposure vial (and the vial's blink keyframes). */
const LAMP_SEL = /cal-iris|cal-vial|calVialSeen/;

/**
 * THE FORM CENSUS: every declaration in the shipped CSS that uses a token, directly or through a custom property that
 * aliases it (`--lamp: var(--cal-c-hostile)` makes every `var(--lamp)` a use). Each use: the rule's selector (inside a
 * @keyframes block, the keyframes' name), the property, the rule's whole body, and whether the rule is round
 * (border-radius 50 %, or a fill inside `.cal-iris i`, which is the iris's disc).
 */
export function census(css) {
  const rules = [];
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const stack = [];
  let buf = '';
  for (const ch of src) {
    if (ch === '{') { stack.push(buf.trim()); buf = ''; continue; }
    if (ch === '}') {
      const sel = stack.pop() ?? '';
      if (buf.trim() && !/^@/.test(sel)) {
        const outer = stack.find((x) => /^@keyframes/.test(x));
        rules.push({ sel: outer ? `${outer} ${sel}` : sel, body: buf });
      }
      buf = '';
      continue;
    }
    buf += ch;
  }
  const decls = [];
  for (const r of rules) {
    const round = /border-radius:\s*50%/.test(r.body);
    for (const d of r.body.split(';')) {
      const m = /^\s*([\w-]+)\s*:\s*([\s\S]+)$/.exec(d);
      if (m) decls.push({ sel: r.sel.replace(/\s+/g, ' '), prop: m[1], value: m[2].trim(), body: r.body, round });
    }
  }
  const memo = new Map();
  const usesOf = (token, seen = new Set()) => {
    if (memo.has(token)) return memo.get(token);
    if (seen.has(token)) return [];
    seen.add(token);
    const re = new RegExp(`var\\(${token.replace(/[-]/g, '\\-')}\\s*[,)]`);
    const out = [];
    for (const d of decls) {
      if (!re.test(d.value)) continue;
      if (d.prop.startsWith('--')) {
        // an alias: its uses are this token's uses (a palette's own definition of the token is not a use)
        if (d.prop !== token) for (const u of usesOf(d.prop, seen)) out.push({ ...u, via: d.prop });
      } else out.push({ sel: d.sel, prop: d.prop, body: d.body, round: d.round || (/^(background|fill)$/.test(d.prop) && /\.cal-iris i\b/.test(d.sel)) });
    }
    memo.set(token, out);
    return out;
  };
  return usesOf;
}
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

/** One shape claim against the tree: its CSS evidence, its code evidence and its form invariants over the census. */
export function shapeClaim(key, css, root = ROOT) {
  const S = SHAPES[key];
  if (!S) return null;
  const U = census(css);
  const missing = S.evidence.filter((re) => !re.test(css)).map((re) => String(re).slice(0, 80));
  for (const [f, re] of S.code || []) {
    let t = '';
    try { t = readFileSync(path.join(root, f), 'utf8'); } catch { /* missing file: the claim fails */ }
    if (!re.test(t)) missing.push(`${f} ${String(re).slice(0, 60)}`);
  }
  const forms = (S.forms ? S.forms(U) : []).map(([what, ok]) => ({ what, ok }));
  return { why: S.why, found: missing.length === 0 && forms.every((f) => f.ok), missing, forms };
}

/** Every pair of signals under one type: dE, the shape claim and whether it holds in the tree. */
export function pairs(css, colours, type, root = ROOT) {
  const ids = Object.keys(colours), seen = Object.fromEntries(ids.map((k) => [k, simulate(colours[k], type)]));
  const out = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j], key = pairKey(a, b);
    const de = deltaE(seen[a], seen[b]);
    const shape = shapeClaim(key, css, root);
    out.push({ pair: key, de: +de.toFixed(1), shape, pass: de >= MIN_DE || !!shape?.found });
  }
  return out;
}

/** The lamp roles of every palette against the five excluded colours (the lamp colour rule's floor, 20 dE2000). */
export const LAMP_ROLES = Object.freeze(['--cal-c-wary', '--cal-c-hostile']);
export const LAMP_FLOOR = 20;
export function paletteCanon() {
  const rows = [];
  for (const [name, P] of Object.entries(PALETTES)) {
    if (!P) continue;
    for (const [tok, hex] of Object.entries(P)) {
      const ds = LAMP_CANON.map((c) => deltaE(hex, c));
      const min = Math.min(...ds);
      rows.push({ palette: name, token: tok, hex, minDE: +min.toFixed(1), nearest: LAMP_CANON[ds.indexOf(min)], lamp: LAMP_ROLES.includes(tok),
        pass: !LAMP_ROLES.includes(tok) || min >= LAMP_FLOOR });
    }
  }
  return { pass: rows.every((r) => r.pass), rows };
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
  const claims = Object.fromEntries(Object.keys(SHAPES).map((k) => [k, shapeClaim(k, css, root)]));
  const shapes = Object.fromEntries(Object.entries(claims).map(([k, c]) => [k, c.found]));
  const canon = paletteCanon();
  return { pass: Object.values(graded).every((g) => g.fails.length === 0) && Object.values(dflt).every((d) => d.fails.length === 0) && canon.pass,
    minDE: MIN_DE, graded, default: dflt, shapes, claims, canon };
}

if (import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const r = check();
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 1)); process.exit(r.pass ? 0 : 1); }
  for (const [type, g] of Object.entries(r.graded)) {
    console.log(`${g.fails.length ? 'FAIL' : 'PASS'} ${type} with the ${g.palette} palette: closest pair without a shape difference ${g.min.toFixed(1)} dE2000 (bar ${MIN_DE})${g.fails.length ? '; under the bar: ' + g.fails.map((p) => `${p.pair} ${p.de}`).join(', ') : ''}`);
  }
  for (const [type, d] of Object.entries(r.default)) {
    console.log(`${d.fails.length ? 'FAIL' : 'PASS'} ${type} with the DEFAULT tokens: closest ${d.min.toFixed(1)}; under ${MIN_DE}: ${d.under.map((p) => `${p.pair} ${p.de}${p.shape ? ' (shape)' : ' (NO SHAPE)'}`).join(', ') || 'none'}`);
  }
  for (const [k, c] of Object.entries(r.claims)) {
    console.log(`  shape ${k}: ${c.found ? 'holds' : 'DOES NOT HOLD'}${c.missing.length ? ' missing ' + c.missing.join(' | ') : ''}${c.forms.length ? '; ' + c.forms.map((f) => `${f.what} ${f.ok ? 'yes' : 'NO'}`).join('; ') : ''}`);
  }
  const lampRows = r.canon.rows.filter((x) => x.lamp);
  console.log(`${r.canon.pass ? 'PASS' : 'FAIL'} palette lamp roles >= ${LAMP_FLOOR} dE2000 from the excluded colours: ${lampRows.map((x) => `${x.palette} ${x.token.replace('--cal-c-', '')} ${x.hex} ${x.minDE}`).join(', ')}`);
  console.log(`  (not lamps, reported) ${r.canon.rows.filter((x) => !x.lamp && x.minDE < LAMP_FLOOR).map((x) => `${x.palette} ${x.token.replace('--cal-c-', '')} ${x.hex} ${x.minDE} vs ${x.nearest}`).join(', ')}`);
  process.exit(r.pass ? 0 : 1);
}
