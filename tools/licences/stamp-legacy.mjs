/**
 * Stamp `asset.extras.provenance` into the pre-Round-5 GLBs that ship until
 * their deletion wave (pipeline lane, W0a; gate A-ID-ip-assets-gone: "every
 * GLB carries extras.provenance.licence").
 *
 * METADATA ONLY. For a .glb only the JSON chunk is rewritten (re-padded to 4
 * bytes with spaces); every following chunk (BIN) is copied byte for byte and
 * verified identical afterwards. For a .gltf the block is inserted textually
 * into the `asset` object, so every other byte of the file stays put. Existing
 * `asset.extras` keys (e.g. the Round-1 optimiser block and the legacy rig block) are kept.
 *
 * The licence and source come from the file's row in public/LICENSES.json;
 * a row marked `ip: true` is never stamped (it cannot be given a shippable
 * licence; it is deleted at its R30 wave instead). Idempotent.
 *
 *   node tools/licences/stamp-legacy.mjs [--check]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, loadManifest, listFiles, matchRows, readGltfJson } from './lib.mjs';

const RECIPES = {
  'legacy-donor-snapmaw': 'tools/bake-rigs.mjs',
  'legacy-donor-ravager': 'tools/bake-rigs.mjs',
  'legacy-donor-corruptor': 'tools/bake-rigs.mjs',
  'legacy-donor-stormbird': 'tools/bake-rigs.mjs',
  'legacy-donor-broadhead': 'tools/bake-rigs.mjs',
  'legacy-donor-grazer': 'tools/bake-rigs.mjs',
  'legacy-donor-shellwalker': 'tools/bake-rigs.mjs',
};

export function provenanceFor(row) {
  return {
    generator: 'legacy-r4',
    recipe: RECIPES[row.id] || 'legacy-r4 (see models-staging/MANIFEST.md)',
    sources: [row.id],
    licence: row.licence,
  };
}

function padTo4(buf, fill) {
  const pad = (4 - (buf.length % 4)) % 4;
  return pad ? Buffer.concat([buf, Buffer.alloc(pad, fill)]) : buf;
}

/** Rewrite a .glb's JSON chunk with `asset.extras.provenance`; returns the new bytes. */
export function stampGlb(bytes, provenance) {
  const jsonLen = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLen).toString('utf8'));
  json.asset = json.asset || {};
  json.asset.extras = { ...(json.asset.extras || {}), provenance };
  const jsonBuf = padTo4(Buffer.from(JSON.stringify(json), 'utf8'), 0x20);
  const rest = bytes.subarray(20 + jsonLen);
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0);                 // magic
  head.writeUInt32LE(bytes.readUInt32LE(4), 4);      // version
  head.writeUInt32LE(20 + jsonBuf.length + rest.length, 8);
  head.writeUInt32LE(jsonBuf.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);                // 'JSON'
  const out = Buffer.concat([head, jsonBuf, rest]);
  if (Buffer.compare(out.subarray(20 + jsonBuf.length), rest) !== 0) throw new Error('BIN chunk changed');
  return out;
}

/** Insert `"extras": {provenance}` as the first key of the .gltf `asset` object. */
export function stampGltf(text, provenance) {
  const json = JSON.parse(text);
  if (json.asset?.extras) {
    json.asset.extras.provenance = provenance;
    throw new Error('stampGltf: asset.extras already present — extend this tool before re-stamping');
  }
  const m = /"asset"\s*:\s*\{(\s*)/.exec(text);
  if (!m) throw new Error('stampGltf: no asset object');
  const at = m.index + m[0].length;
  const indent = m[1].includes('\n') ? m[1] : ' ';
  const out = `${text.slice(0, at)}"extras" : ${JSON.stringify({ provenance })},${indent}${text.slice(at)}`;
  const back = JSON.parse(out);
  if (JSON.stringify(back.asset.extras.provenance) !== JSON.stringify(provenance)) throw new Error('stampGltf: round-trip mismatch');
  return out;
}

export function run({ check = false } = {}) {
  const manifest = loadManifest();
  const files = listFiles('public/models').filter((f) => /\.(glb|gltf)$/.test(f));
  const { byFile } = matchRows(manifest, files);
  const rows = new Map(manifest.rows.map((r) => [r.id, r]));
  const report = [];
  for (const f of files) {
    const ids = byFile.get(f) || [];
    const row = ids.length === 1 ? rows.get(ids[0]) : null;
    if (!row || !row.legacy || row.ip) { report.push({ file: f, action: row?.ip ? 'skip-ip' : 'skip' }); continue; }
    const want = provenanceFor(row);
    const have = readGltfJson(path.join(ROOT, f)).asset?.extras?.provenance;
    if (have && JSON.stringify(have) === JSON.stringify(want)) { report.push({ file: f, action: 'ok' }); continue; }
    if (check) { report.push({ file: f, action: 'missing' }); continue; }
    const abs = path.join(ROOT, f);
    if (f.endsWith('.glb')) writeFileSync(abs, stampGlb(readFileSync(abs), want));
    else writeFileSync(abs, stampGltf(readFileSync(abs, 'utf8'), want));
    report.push({ file: f, action: 'stamped', licence: want.licence });
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rep = run({ check: process.argv.includes('--check') });
  for (const r of rep) console.log(`${r.action.padEnd(8)} ${r.file}${r.licence ? `  ${r.licence}` : ''}`);
  if (rep.some((r) => r.action === 'missing')) process.exitCode = 1;
}
