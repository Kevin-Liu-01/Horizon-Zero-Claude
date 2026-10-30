/**
 * Licence rules for the licence-clean reference set (gates-perf W0b; plan §0 rule 9, §10.2 item 4,
 * §9 `A-reference-clean` / `A-reference-set`). A LEAF module (no imports): the fetcher, the
 * MANIFEST parser and the gates all read the same rules.
 *
 *   stored      PD | CC0-1.0 | CC-BY-<v> (attributed) | own-photo
 *   url-only    share-alike (CC BY-SA, GFDL, Free Art) or anything unclear: recorded as a URL, never stored
 *   refused     NC / ND, or any Horizon / Sony / Guerrilla / Epic / Fortnite / ripped source
 */

/** Sources that may never appear in reference/ (plan §0 rule 9; the deleted Round-4 stills came from these). */
export const FORBIDDEN_SOURCE_RE = /guerrilla|sony|playstation|horizon ?zero|horizon ?forbidden|\bhzd\b|\bhfw\b|\baloy\b|fortnite|epic ?games|steamstatic|gematsu|ytimg|youtube|sketchfab/i;

/**
 * licence codes a STORED row may carry (after normaliseLicence). `own-photo` and `project-original` are the project's
 * own work (plan §10.2 "own photos"; hero-body's review sheets are renders of the live build).
 */
export const STORED_LICENCES = /^(PD|CC0-1\.0|CC-BY-[1-4]\.0|CC-BY-2\.5|own-photo|project-original)$/;

/**
 * A MANIFEST licence cell, as any lane writes it, -> { code, cls, attribution } (W0b targeted fix round 1).
 *   'Public domain' | 'PD'                                   -> PD
 *   'CC0' | 'CC0-1.0 (render of a CC0 model)'                -> CC0-1.0
 *   'CC BY 3.0 (attribution: "X" by Y, CC BY 3.0)' | 'CC-BY-2.0' -> CC-BY-3.0 (+ the attribution string)
 *   'project-original (…)' | 'own photo'                     -> project-original | own-photo
 *   'CC BY-SA 4.0 — not stored' | GFDL                       -> cls url-only
 *   NC / ND                                                  -> cls refused
 *   'project text' / '—'                                     -> cls note (a spec row, no image)
 * The NC / ND / SA tests read the licence part only, never the attribution note (a title may hold any word).
 */
export function normaliseLicence(cell) {
  const raw = String(cell ?? '').replace(/`/g, '').trim();
  const am = /\(\s*attribution\s*:\s*([\s\S]*)\)\s*$/i.exec(raw);
  const attribution = am ? am[1].trim() : '';
  const lic = (am ? raw.slice(0, am.index) : raw).trim();
  const low = lic.toLowerCase();
  const out = (code, cls) => ({ code, cls, attribution, text: raw });
  if (!low || /^(—|-|–|n\/a)$/.test(low) || /^project text\b/.test(low)) return out('', 'note');
  if (/^project[- ]original\b/.test(low)) return out('project-original', 'stored');
  if (/^own[- ](photo|render|work)\b/.test(low)) return out('own-photo', 'stored');
  if (/(^|[^a-z])(nc|nd)([^a-z]|$)|non-?commercial|no-?deriv/.test(low)) return out(lic, 'refused');
  if (/not stored|url[- ]only/.test(low) || /(^|[^a-z])sa([^a-z]|$)|share ?-?alike|gfdl|free art|\bfal\b/.test(low)) return out(lic, 'url-only');
  if (/^cc0\b|cc-zero|public domain dedication/.test(low)) return out('CC0-1.0', 'stored');
  if (/^public domain\b|^pd([^a-z]|$)/.test(low)) return out('PD', 'stored');
  const by = /^cc[- ]?by[- ]?(\d\.\d)\b/.exec(low);
  if (by) return out(`CC-BY-${by[1]}`, 'stored');
  return out(lic, 'unclear');
}

const strip =(s) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Classify a Commons file from its imageinfo `extmetadata` (the `value` strings).
 * -> { cls: 'stored' | 'url-only' | 'refused', licence, why }
 */
export function classifyCommons(meta = {}) {
  const v = (k) => strip(meta[k]?.value ?? meta[k] ?? '');
  const code = v('License').toLowerCase();               // e.g. pd, cc0, cc-by-4.0, cc-by-sa-3.0
  const short = v('LicenseShortName');                    // e.g. Public domain, CC0, CC BY 4.0, CC BY-SA 3.0
  const all = `${code} | ${short} | ${v('UsageTerms')}`.toLowerCase();
  if (/(^|[^a-z])(nc|nd)([^a-z]|$)|non-?commercial|no-?deriv/.test(all)) return { cls: 'refused', licence: short || code, why: 'NC / ND (plan §0 rule 9: never)' };
  if (/(^|[^a-z])sa([^a-z]|$)|share ?-?alike|gfdl|free art|\bfal\b|copyleft/.test(all)) return { cls: 'url-only', licence: short || code, why: 'share-alike: stored as a URL only (plan §10.2)' };
  if (/cc0|cc-zero|public domain dedication/.test(all)) return { cls: 'stored', licence: 'CC0-1.0', why: null };
  if (/^pd([^a-z]|$)|public domain|(^|[^a-z])pd-/.test(all) || code === 'pd') return { cls: 'stored', licence: 'PD', why: null };
  const by = /cc[- ]by[- ]?(\d\.\d)/.exec(all);
  if (by) return { cls: 'stored', licence: `CC-BY-${by[1]}`, why: null };
  if (/cc[- ]by(?![- ]?(sa|nc|nd))/.test(all)) return { cls: 'url-only', licence: short || code, why: 'CC BY without a version: unclear, URL only' };
  return { cls: 'url-only', licence: short || code || 'unknown', why: 'licence unclear: URL only (plan §10.2)' };
}

/** Plain-text author from Commons `Artist` (HTML), never empty for a stored row. */
export const authorOf = (meta = {}) => strip(meta.Artist?.value ?? meta.Artist ?? '') || strip(meta.Credit?.value ?? meta.Credit ?? '') || 'unknown';

/**
 * Positive / negative controls the gates run (A-reference-set): the classifier must store PD, CC0 and
 * CC BY, keep CC BY-SA and unclear sources as URL only, and refuse NC / ND.
 */
export const CLASSIFIER_CONTROLS = [
  [{ License: 'pd', LicenseShortName: 'Public domain' }, 'stored', 'PD'],
  [{ License: 'cc0', LicenseShortName: 'CC0' }, 'stored', 'CC0-1.0'],
  [{ License: 'cc-by-4.0', LicenseShortName: 'CC BY 4.0' }, 'stored', 'CC-BY-4.0'],
  [{ License: 'cc-by-2.0', LicenseShortName: 'CC BY 2.0' }, 'stored', 'CC-BY-2.0'],
  [{ License: 'cc-by-sa-4.0', LicenseShortName: 'CC BY-SA 4.0' }, 'url-only', null],
  [{ License: 'cc-by-sa-3.0', LicenseShortName: 'CC BY-SA 3.0', UsageTerms: 'Creative Commons Attribution-Share Alike 3.0' }, 'url-only', null],
  [{ License: 'gfdl', LicenseShortName: 'GFDL' }, 'url-only', null],
  [{ License: 'cc-by-nc-2.0', LicenseShortName: 'CC BY-NC 2.0' }, 'refused', null],
  [{ License: 'cc-by-nd-4.0', LicenseShortName: 'CC BY-ND 4.0' }, 'refused', null],
  [{ License: '', LicenseShortName: '' }, 'url-only', null],
];
export function classifierSelfTest() {
  const out = CLASSIFIER_CONTROLS.map(([m, cls, lic]) => { const r = classifyCommons(m); return { input: m.LicenseShortName || '(none)', want: cls, got: r.cls, licence: r.licence, ok: r.cls === cls && (!lic || r.licence === lic) }; });
  return { ok: out.every((x) => x.ok), cases: out };
}
