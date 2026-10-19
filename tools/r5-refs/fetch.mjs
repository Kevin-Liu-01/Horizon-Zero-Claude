#!/usr/bin/env node
/**
 * THE LICENCE-CLEAN REFERENCE FETCHER (gates-perf W0b; plan §2 "tools/r5-refs/** (Commons fetcher)",
 * §10.2 item 4, §9 `A-reference-set`, `A-reference-clean`).
 *
 * Reference images for the visual gates (never shipped) come from the Wikimedia Commons API, filtered
 * to PD / CC0 / CC BY. Each slot in tools/r5-refs/slots.mjs names the gates it serves, the Commons
 * search that found it and the PINNED Commons file the set uses (so a re-fetch is deterministic):
 *
 *   node tools/r5-refs/fetch.mjs --search <slot | "free text"> [--limit 25]
 *       Commons search; every hit with its licence class (stored / url-only / refused), size and page
 *   node tools/r5-refs/fetch.mjs --preview <slot | "free text"> --out <dir outside every tree> [--limit 12]
 *       small (320 px) thumbnails of the STORABLE hits, for picking a slot's file by eye
 *   node tools/r5-refs/fetch.mjs --fetch [--lane <lane>] [--slot <slot>]
 *       for every pinned slot: re-read the file's licence from the API (refused unless PD / CC0 / CC BY),
 *       download its <= 1280 px rendition to a scratch dir, re-encode it (JPEG, metadata stripped) into
 *       reference/r5/<lane>/<slot>.jpg and rewrite that folder's MANIFEST.md; share-alike or unclear
 *       pins are written as URL-only rows, never as files; the scratch dir is deleted
 *   node tools/r5-refs/fetch.mjs --verify
 *       offline: every pinned slot has its file and a complete MANIFEST row whose sha256 matches; every
 *       file under reference/r5 has a row; exit 1 otherwise (A-reference-set runs this)
 *   node tools/r5-refs/fetch.mjs --selftest
 *       the licence classifier's positive / negative controls
 *
 * Network: api + upload.wikimedia.org only, with a descriptive User-Agent (Wikimedia's API policy).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { SLOTS } from './slots.mjs';
import { classifyCommons, authorOf, classifierSelfTest, FORBIDDEN_SOURCE_RE, STORED_LICENCES } from './licence.mjs';
import { readManifest, renderManifest, laneFolders } from './manifest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'CALIMA-reference-fetch/1.0 (licence-clean pose references for a game build; tools/r5-refs/fetch.mjs)';
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const argv = process.argv.slice(2);
const flag = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const META_KEYS = 'LicenseShortName|License|UsageTerms|Artist|Credit|AttributionRequired|Copyrighted|ImageDescription|DateTimeOriginal|LicenseUrl|ObjectName';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** polite GET: one request at a time, >= 1 s apart, 429 / 5xx retried with back-off (Retry-After honoured) */
let lastCall = 0;
async function politeFetch(url, headers) {
  for (let attempt = 0; ; attempt++) {
    const wait = lastCall + 1000 - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const r = await fetch(url, { headers });
    if (r.ok) return r;
    if ((r.status === 429 || r.status >= 500) && attempt < 5) {
      const ra = Number(r.headers.get('retry-after'));
      await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 5000 * (attempt + 1));
      continue;
    }
    throw new Error(`HTTP ${r.status} for ${String(url).slice(0, 140)}`);
  }
}
async function api(params) {
  const u = new URL(API);
  for (const [k, v] of Object.entries({ format: 'json', formatversion: '2', ...params })) u.searchParams.set(k, String(v));
  return (await politeFetch(u, { 'User-Agent': UA, 'Api-User-Agent': UA })).json();
}
const imageinfo = { prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiextmetadatafilter: META_KEYS, iiurlwidth: 1280 };

/** Commons search over File: pages -> [{ title, page, licence class, w, h, mime, thumb }] */
export async function search(query, limit = 25) {
  const j = await api({ action: 'query', generator: 'search', gsrsearch: `${query} filetype:bitmap`, gsrnamespace: 6, gsrlimit: limit, ...imageinfo });
  const pages = (j.query?.pages || []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return pages.map((p) => {
    const ii = p.imageinfo?.[0] || {};
    const c = classifyCommons(ii.extmetadata || {});
    return { title: p.title, cls: c.cls, licence: c.licence, why: c.why, w: ii.width, h: ii.height, mime: ii.mime,
      page: ii.descriptionurl, thumb: ii.thumburl, author: authorOf(ii.extmetadata || {}).slice(0, 80) };
  });
}

/** One pinned file's metadata (exact title) */
export async function fileInfo(title) {
  const j = await api({ action: 'query', titles: title, ...imageinfo });
  const p = j.query?.pages?.[0];
  if (!p || p.missing || !p.imageinfo?.[0]) throw new Error(`no such Commons file: ${title}`);
  const ii = p.imageinfo[0];
  return { title: p.title, ii, meta: ii.extmetadata || {}, c: classifyCommons(ii.extmetadata || {}) };
}

async function download(url, dir) {
  const r = await politeFetch(url, { 'User-Agent': UA });
  const buf = Buffer.from(await r.arrayBuffer());
  const f = path.join(mkdtempSync(path.join(dir, 'dl-')), 'image.bin');   // every download in its own new dir
  writeFileSync(f, buf);
  return f;
}

const slotsOf = (lane, slot) => SLOTS.filter((s) => (!lane || s.lane === lane) && (!slot || s.slot === slot));

async function fetchAll({ lane, slot }) {
  const { default: sharp } = await import('sharp');
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'cal-r5-refs-'));
  const today = new Date().toISOString().slice(0, 10);
  const byLane = new Map();
  try {
    for (const s of slotsOf(lane, slot)) {
      if (!s.file) { console.log(`[refs] ${s.lane}/${s.slot}: no pinned file yet (search: ${s.query})`); continue; }
      const info = await fileInfo(s.file);
      const page = info.ii.descriptionurl;
      const author = authorOf(info.meta);
      if (FORBIDDEN_SOURCE_RE.test(`${info.title} ${author} ${page}`)) throw new Error(`${s.slot}: forbidden source (${info.title})`);
      const L = byLane.get(s.lane) || { stored: [], urlOnly: [] };
      byLane.set(s.lane, L);
      if (info.c.cls !== 'stored') {
        L.urlOnly.push({ slot: s.slot, gates: s.gates, source: page, licence: info.c.licence, why: info.c.why || info.c.cls });
        console.log(`[refs] ${s.lane}/${s.slot}: ${info.c.cls} (${info.c.licence}) -> URL only`);
        continue;
      }
      const raw = await download(info.ii.thumburl || info.ii.url, scratch);
      const out = await sharp(raw).rotate().resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      const dir = path.join(ROOT, 'reference', 'r5', s.lane);
      mkdirSync(dir, { recursive: true });
      const file = `${s.slot}.jpg`;
      writeFileSync(path.join(dir, file), out);
      const lic = info.c.licence;
      const attribution = /^CC-BY/.test(lic) ? `"${info.title.replace(/^File:/, '')}" by ${author}, ${lic.replace(/^CC-BY-/, 'CC BY ')}, via Wikimedia Commons (${page})` : '';
      L.stored.push({ file, slot: s.slot, gates: s.gates, subject: s.subject, author, licence: lic, source: page, retrieved: today, sha256: sha256(out), attribution });
      console.log(`[refs] ${s.lane}/${file}: ${lic}, ${author.slice(0, 60)}, ${(out.length / 1024).toFixed(0)} KB`);
    }
    for (const [ln, L] of byLane) {
      const dir = path.join(ROOT, 'reference', 'r5', ln);
      // keep the rows of slots not fetched in this call (a --slot run updates one slot)
      const old = readManifest(dir);
      const keepS = old.stored.filter((r) => !L.stored.some((x) => x.slot === r.slot) && !L.urlOnly.some((x) => x.slot === r.slot) && SLOTS.some((x) => x.lane === ln && x.slot === r.slot));
      const keepU = old.urlOnly.filter((r) => !L.stored.some((x) => x.slot === r.slot) && !L.urlOnly.some((x) => x.slot === r.slot) && SLOTS.some((x) => x.lane === ln && x.slot === r.slot));
      const intro = SLOTS.find((x) => x.lane === ln)?.intro || `Licence-clean references for lane ${ln}'s visual gates.`;
      writeFileSync(path.join(dir, 'MANIFEST.md'), renderManifest({ lane: ln, intro,
        stored: [...keepS, ...L.stored].sort((a, b) => a.slot.localeCompare(b.slot)), urlOnly: [...keepU, ...L.urlOnly].sort((a, b) => a.slot.localeCompare(b.slot)) }));
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Offline verification -> { ok, problems[], stored, urlOnly, files } (A-reference-set runs it) */
export function verify(root = ROOT) {
  const problems = [];
  let stored = 0, urlOnly = 0, files = 0;
  for (const { lane, dir } of laneFolders(root)) {
    const m = readManifest(dir);
    const imgs = readdirSync(dir).filter((f) => /\.(jpe?g|png|webp|gif|tiff?)$/i.test(f));
    files += imgs.length;
    if (!m.exists) { if (imgs.length) problems.push(`${lane}: ${imgs.length} image(s) and no MANIFEST.md`); continue; }
    stored += m.stored.length; urlOnly += m.urlOnly.length;
    for (const f of imgs) if (!m.stored.some((r) => r.file === f)) problems.push(`${lane}/${f}: no MANIFEST row`);
    for (const r of m.stored) {
      const p = path.join(dir, r.file);
      if (!existsSync(p)) { problems.push(`${lane}/${r.file}: row without a file`); continue; }
      if (sha256(readFileSync(p)) !== r.sha256) problems.push(`${lane}/${r.file}: sha256 differs from its row`);
      for (const k of ['author', 'licence', 'source', 'retrieved']) if (!r[k] || r[k] === 'unknown') problems.push(`${lane}/${r.file}: ${k} missing`);
      if (!STORED_LICENCES.test(r.licence)) problems.push(`${lane}/${r.file}: licence ${r.licence} is not PD / CC0 / CC BY / own photo`);
      if (/^CC-BY/.test(r.licence) && !r.attribution) problems.push(`${lane}/${r.file}: CC BY without its attribution string`);
      if (FORBIDDEN_SOURCE_RE.test(`${r.source} ${r.author} ${r.subject}`)) problems.push(`${lane}/${r.file}: forbidden source`);
      if (!/^https:\/\/commons\.wikimedia\.org\/|^own-photo/.test(r.source) && r.licence !== 'own-photo') problems.push(`${lane}/${r.file}: source is not a Commons page`);
    }
    for (const r of m.urlOnly) if (imgs.some((f) => f.startsWith(r.slot + '.'))) problems.push(`${lane}/${r.slot}: URL-only row but a file is stored`);
  }
  for (const s of SLOTS.filter((x) => x.file)) {
    const m = readManifest(path.join(root, 'reference', 'r5', s.lane));
    if (!m.stored.some((r) => r.slot === s.slot) && !m.urlOnly.some((r) => r.slot === s.slot)) problems.push(`${s.lane}/${s.slot}: pinned in slots.mjs but not fetched`);
  }
  return { ok: problems.length === 0, problems, stored, urlOnly, files };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const run = async () => {
    if (argv.includes('--selftest')) { const t = classifierSelfTest(); console.log(JSON.stringify(t, null, 1)); return t.ok ? 0 : 1; }
    if (argv.includes('--verify')) { const v = verify(); console.log(JSON.stringify(v, null, 1)); return v.ok ? 0 : 1; }
    const q = flag('--search') || flag('--preview');
    if (q) {
      const s = SLOTS.find((x) => x.slot === q);
      const hits = await search(s ? s.query : q, Number(flag('--limit', argv.includes('--preview') ? 12 : 25)));
      if (argv.includes('--search')) { for (const h of hits) console.log(`${h.cls.padEnd(8)} ${String(h.licence).padEnd(14)} ${h.w}x${h.h}  ${h.title}  | ${h.author}`); return 0; }
      const out = flag('--out');
      if (!out) { console.error('--preview needs --out <dir outside every tree>'); return 2; }
      const { default: sharp } = await import('sharp');
      mkdirSync(out, { recursive: true });
      let n = 0;
      for (const h of hits.filter((x) => x.cls === 'stored')) {
        const f = await download(h.thumb, out);
        const name = path.join(out, `${String(n++).padStart(2, '0')}.jpg`);
        await sharp(f).resize({ width: 320 }).jpeg({ quality: 70 }).toFile(name);
        rmSync(path.dirname(f), { recursive: true, force: true });
        console.log(`${path.basename(name)}  ${h.licence}  ${h.title}`);
      }
      return 0;
    }
    if (argv.includes('--fetch')) { await fetchAll({ lane: flag('--lane'), slot: flag('--slot') }); const v = verify(); console.log(`[refs] verify: ${v.ok ? 'OK' : 'PROBLEMS ' + v.problems.join('; ')}`); return v.ok ? 0 : 1; }
    console.error('usage: node tools/r5-refs/fetch.mjs --search <slot|text> | --preview <slot|text> --out <dir> | --fetch [--lane l] [--slot s] | --verify | --selftest');
    return 2;
  };
  run().then((c) => process.exit(c), (e) => { console.error('[refs] ' + (e?.stack || e)); process.exit(1); });
}
