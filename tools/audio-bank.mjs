/**
 * Audio bank builder — renders `tools/audio-recipes.js` through headless
 * Chrome's OfflineAudioContext, encodes each cue to Opus with MediaRecorder,
 * remuxes the WebM into a real Ogg container, verifies every file by decoding
 * it back, and writes both manifests.
 *
 *   node tools/audio-bank.mjs [--only foot,bow] [--concurrency 3]
 *
 * Outputs
 *   public/audio/<set>/<n>.ogg   the bank
 *   public/audio/MANIFEST.md     the licence manifest (one row per file)
 *   src/audio/manifest.js        the runtime index the loader reads
 *
 * Licence: every cue in this bank is synthesized by this repository's own code
 * and released CC0-1.0. Round 4 D2 lifted the "no asset files" clause; the
 * loader is format-agnostic, so Wave 3 can drop curated CC0 recordings
 * (freesound CC0 / Kenney / OpenGameArt) into the same folders and only the
 * two manifests change.
 */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT_DIR = path.join(ROOT, 'public', 'audio');

const args = process.argv.slice(2);
const getFlag = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const only = getFlag('--only', null)?.split(',').map((s) => s.trim());
const CONC = parseInt(getFlag('--concurrency', '3'), 10);

/* --------------------------------------------------------------------------
 * BUILD LIST — the seed bank. `set` is what gameplay asks for; `variants` are
 * the round-robin files inside it. Keep durations tight: the whole bank is
 * budgeted well under the 40 MB ceiling so it can live in git.
 * ------------------------------------------------------------------------ */
const BUILD = [
  // --- player footsteps: ONE SET PER PUBLISHED SURFACE. `Terrain.SURFACES`
  //     is ['water','cobble','silt','dirt','gravel','rock','snow','grass'];
  //     three sets meant a river crossing sounded like a gravel path.
  { set: 'foot/grass', variants: 4, dur: 0.42, gain: 1.0, tags: ['footstep', 'grass'] },
  { set: 'foot/dirt', variants: 4, dur: 0.42, gain: 1.0, tags: ['footstep', 'dirt'] },
  { set: 'foot/rock', variants: 4, dur: 0.42, gain: 1.0, tags: ['footstep', 'rock'] },
  { set: 'foot/gravel', variants: 4, dur: 0.44, gain: 1.0, tags: ['footstep', 'gravel'] },
  { set: 'foot/cobble', variants: 4, dur: 0.4, gain: 1.0, tags: ['footstep', 'cobble'] },
  { set: 'foot/silt', variants: 4, dur: 0.44, gain: 1.0, tags: ['footstep', 'silt'] },
  { set: 'foot/water', variants: 4, dur: 0.55, gain: 1.0, tags: ['footstep', 'water'] },
  { set: 'foot/snow', variants: 4, dur: 0.4, gain: 1.0, tags: ['footstep', 'snow'] },

  // --- bows: one full set per weapon (audio-13) --------------------------
  ...['hunter', 'sharpshot', 'war'].flatMap((w) => ([
    { set: `bow/${w}/nock`, variants: 2, dur: 0.24, gain: 0.9, tags: ['bow', w, 'nock'] },
    { set: `bow/${w}/draw`, variants: 1, dur: 0.95, gain: 0.9, tags: ['bow', w, 'draw'] },
    { set: `bow/${w}/release`, variants: 2, dur: 0.62, gain: 1.0, tags: ['bow', w, 'release'] },
    { set: `bow/${w}/flyby`, variants: 2, dur: 0.62, gain: 0.8, tags: ['bow', w, 'flyby'] },
    { set: `bow/${w}/empty`, variants: 1, dur: 0.2, gain: 0.8, tags: ['bow', w, 'empty'] },
  ])),

  // --- eight species, windup + strike each (audio-02) --------------------
  ...['watcher', 'strider', 'scrapper', 'longleg', 'glinthawk', 'sawtooth', 'behemoth', 'thunderjaw']
    .flatMap((s) => ([
      { set: `voice/${s}/windup`, variants: 1, dur: s === 'thunderjaw' || s === 'behemoth' ? 1.15 : 0.95, gain: 1.0, tags: ['voice', s, 'windup'] },
      { set: `voice/${s}/strike`, variants: 1, dur: s === 'thunderjaw' ? 1.7 : s === 'behemoth' ? 1.6 : 0.95, gain: 1.0, tags: ['voice', s, 'strike'] },
    ])),

  // --- machine footfalls by weight class (audio-07) ---------------------
  { set: 'mstep/light', variants: 3, dur: 0.4, gain: 1.0, tags: ['footfall', 'machine'] },
  { set: 'mstep/medium', variants: 3, dur: 0.5, gain: 1.0, tags: ['footfall', 'machine'] },
  { set: 'mstep/heavy', variants: 3, dur: 0.7, gain: 1.0, tags: ['footfall', 'machine'] },

  // --- hit ladder (audio-10) --------------------------------------------
  { set: 'hit/plink', variants: 2, dur: 0.3, gain: 1.0, tags: ['impact'] },
  { set: 'hit/thunk', variants: 2, dur: 0.42, gain: 1.0, tags: ['impact'] },
  { set: 'hit/crunch', variants: 2, dur: 0.55, gain: 1.0, tags: ['impact'] },
  { set: 'hit/crit', variants: 2, dur: 0.62, gain: 1.0, tags: ['impact', 'crit'] },
  { set: 'hit/flesh-soft', variants: 1, dur: 0.3, gain: 1.0, tags: ['impact', 'flesh'] },
  { set: 'hit/flesh-hard', variants: 1, dur: 0.36, gain: 1.0, tags: ['impact', 'flesh'] },
  { set: 'hit/ground', variants: 1, dur: 0.32, gain: 0.9, tags: ['impact', 'ground'] },

  // --- machine behaviour cues -------------------------------------------
  { set: 'machine/servo-loop', variants: 1, dur: 3.6, gain: 0.8, loop: true, tags: ['machine', 'loop'] },
  { set: 'machine/stagger', variants: 1, dur: 1.15, gain: 1.0, tags: ['machine', 'stagger'] },
  { set: 'machine/powerdown', variants: 1, dur: 1.65, gain: 1.0, tags: ['machine', 'death'] },
  { set: 'machine/scan-ping', variants: 1, dur: 0.85, gain: 0.9, tags: ['machine', 'scan'] },
  { set: 'machine/alarm', variants: 1, dur: 0.85, gain: 1.0, tags: ['machine', 'alert'] },

  // --- Aloy foley (D2: breath and gear, no VO) ---------------------------
  { set: 'aloy/breath-in', variants: 1, dur: 0.55, gain: 0.9, tags: ['aloy', 'breath'] },
  { set: 'aloy/breath-out', variants: 1, dur: 0.65, gain: 0.9, tags: ['aloy', 'breath'] },
  { set: 'aloy/effort', variants: 2, dur: 0.36, gain: 0.9, tags: ['aloy', 'effort'] },
  { set: 'aloy/hurt', variants: 2, dur: 0.48, gain: 1.0, tags: ['aloy', 'hurt'] },
  { set: 'gear/light', variants: 2, dur: 0.2, gain: 0.7, tags: ['gear'] },
  { set: 'gear/heavy', variants: 2, dur: 0.24, gain: 0.7, tags: ['gear'] },

  // --- ambience beds (audio-11) — stereo, crossfade-looped at runtime ----
  { set: 'amb/meadow', variants: 1, dur: 13, ch: 2, kbps: 80, gain: 1.0, loop: true, tags: ['ambience'] },
  { set: 'amb/river', variants: 1, dur: 13, ch: 2, kbps: 80, gain: 1.0, loop: true, tags: ['ambience'] },
  { set: 'amb/campfire', variants: 1, dur: 13, ch: 2, kbps: 80, gain: 1.0, loop: true, tags: ['ambience'] },
  { set: 'amb/forest', variants: 1, dur: 13, ch: 2, kbps: 80, gain: 1.0, loop: true, tags: ['ambience'] },
  { set: 'amb/night', variants: 1, dur: 13, ch: 2, kbps: 80, gain: 1.0, loop: true, tags: ['ambience'] },
  { set: 'amb/ridge', variants: 1, dur: 13, ch: 2, kbps: 80, gain: 1.0, loop: true, tags: ['ambience'] },
  // distant machine calls — the valley is inhabited (audio-11)
  { set: 'amb/call-far', variants: 3, dur: 2.4, ch: 2, kbps: 64, gain: 0.9, tags: ['ambience', 'call'] },

  // --- per-species idle beds (audio-02): eight identities, not one hum ---
  ...['watcher', 'strider', 'scrapper', 'longleg', 'glinthawk', 'sawtooth', 'behemoth', 'thunderjaw']
    .map((s) => ({ set: `idle/${s}`, variants: 1, dur: 3.2, gain: 0.9, loop: true, tags: ['machine', 'idle', s] })),

  // --- death: collapse + loot beacon (audio-06) -------------------------
  { set: 'machine/collapse', variants: 3, dur: 0.95, gain: 1.0, tags: ['machine', 'death'] },
  { set: 'machine/loot-beacon', variants: 1, dur: 2.4, gain: 0.8, loop: true, tags: ['machine', 'loot'] },

  // --- suspicion (audio-08) ---------------------------------------------
  { set: 'machine/warble', variants: 2, dur: 0.75, gain: 0.95, tags: ['machine', 'suspicion'] },
  { set: 'machine/unwarble', variants: 1, dur: 0.65, gain: 0.9, tags: ['machine', 'suspicion'] },

  // --- elemental status loops (audio-10) --------------------------------
  { set: 'status/burn', variants: 1, dur: 2.4, gain: 0.9, loop: true, tags: ['status', 'fire'] },
  { set: 'status/shock', variants: 1, dur: 2.4, gain: 0.9, loop: true, tags: ['status', 'shock'] },
  { set: 'status/frost', variants: 1, dur: 2.4, gain: 0.9, loop: true, tags: ['status', 'freeze'] },

  // --- Aloy's harder efforts (audio-03; D2 — still no VO) ---------------
  { set: 'aloy/effort-hard', variants: 2, dur: 0.46, gain: 0.95, tags: ['aloy', 'effort'] },
  { set: 'aloy/breath-hard', variants: 2, dur: 0.85, gain: 0.9, tags: ['aloy', 'breath'] },

  /* --- the adaptive score (audio-01) ------------------------------------
   * 96 BPM, 4/4: bar 2.5 s, phrase 10.0 s. Rendered at 10.6 s and looped by
   * MusicDirector at exactly 10.0 s — MediaRecorder truncates ~40 ms of tail,
   * and without the overhang that loss would land inside the loop.
   * `gain` here undoes the builder's per-file peak normalisation: without it
   * the exploration pad would come back as loud as the combat kit.
   */
  { set: 'music/pad-calm', variants: 1, dur: 10.6, ch: 2, kbps: 96, gain: 0.5, loop: true, tags: ['music', 'stem', 'calm'] },
  { set: 'music/pluck-calm', variants: 1, dur: 10.6, ch: 2, kbps: 96, gain: 0.55, loop: true, tags: ['music', 'stem', 'calm'] },
  { set: 'music/drone-tense', variants: 1, dur: 10.6, ch: 2, kbps: 96, gain: 0.55, loop: true, tags: ['music', 'stem', 'suspicious'] },
  { set: 'music/perc-tense', variants: 1, dur: 10.6, ch: 2, kbps: 96, gain: 0.6, loop: true, tags: ['music', 'stem', 'suspicious'] },
  { set: 'music/drums-combat', variants: 1, dur: 10.6, ch: 2, kbps: 96, gain: 0.8, loop: true, tags: ['music', 'stem', 'combat'] },
  { set: 'music/bass-combat', variants: 1, dur: 10.6, ch: 2, kbps: 96, gain: 0.7, loop: true, tags: ['music', 'stem', 'combat'] },
  { set: 'music/lead-combat', variants: 1, dur: 10.6, ch: 2, kbps: 96, gain: 0.6, loop: true, tags: ['music', 'stem', 'combat'] },
  { set: 'music/sting-combat', variants: 1, dur: 2.1, ch: 2, kbps: 80, gain: 0.85, tags: ['music', 'sting'] },
  { set: 'music/sting-resolve', variants: 1, dur: 3.0, ch: 2, kbps: 80, gain: 0.8, tags: ['music', 'sting'] },
  { set: 'music/sting-alert', variants: 1, dur: 1.3, ch: 2, kbps: 80, gain: 0.8, tags: ['music', 'sting'] },
  { set: 'music/sting-discover', variants: 1, dur: 2.6, ch: 2, kbps: 80, gain: 0.8, tags: ['music', 'sting'] },

  /* --- the spear (audio content half) -----------------------------------
   * `src/combat/melee.js` emits `melee-hit`, `critical-hit` and
   * `silent-strike`; before this pass nothing in the mix listened, so the
   * headline Round 4 melee verb was completely silent. Four rungs, matching
   * the arrow hit ladder's logic: light / heavy / crit / silent, plus the
   * swing that precedes all of them.
   */
  { set: 'melee/whoosh', variants: 3, dur: 0.4, gain: 0.85, tags: ['melee', 'swing'] },
  { set: 'melee/light', variants: 3, dur: 0.42, gain: 1.0, tags: ['melee', 'impact'] },
  { set: 'melee/heavy', variants: 2, dur: 0.72, gain: 1.0, tags: ['melee', 'impact'] },
  { set: 'melee/crit', variants: 2, dur: 0.8, gain: 1.0, tags: ['melee', 'impact', 'crit'] },
  { set: 'melee/silent', variants: 1, dur: 0.95, gain: 0.9, tags: ['melee', 'stealth'] },

  /* --- Tripcaster + Ropecaster ------------------------------------------
   * `src/combat/traps.js` emits `trap-placed`, `trap-triggered`,
   * `rope-attached` and `machine-tied`. Same story: four emitted events, no
   * listener, two whole weapons that made no sound of their own.
   */
  { set: 'trap/place', variants: 2, dur: 0.42, gain: 0.95, tags: ['trap', 'place'] },
  { set: 'trap/trigger', variants: 2, dur: 0.62, gain: 1.0, tags: ['trap', 'blast'] },
  { set: 'rope/attach', variants: 2, dur: 0.55, gain: 0.95, tags: ['rope', 'attach'] },
  { set: 'rope/tie', variants: 1, dur: 0.82, gain: 0.95, tags: ['rope', 'tie'] },
];

const JOBS = [];
let seedCounter = 1;
for (const b of BUILD) {
  if (only && !only.some((o) => b.set.startsWith(o))) continue;
  for (let v = 0; v < b.variants; v++) {
    JOBS.push({
      set: b.set,
      recipe: b.set,
      index: v,
      file: `${b.set}${b.variants > 1 ? `-${v + 1}` : ''}.ogg`,
      seed: 1000 + (seedCounter++) * 7919,
      dur: b.dur,
      ch: b.ch || 1,
      kbps: b.kbps || 56,
      gain: b.gain ?? 1,
      loop: !!b.loop,
      tags: b.tags || [],
    });
  }
}

/* -------------------------------------------------------------------------
 * WebM (EBML) -> Ogg/Opus remux. Chrome's MediaRecorder has no Ogg muxer, so
 * we take its Opus packets out of the Matroska SimpleBlocks and page them into
 * a standard Ogg stream. Verified by decoding the result back in the browser.
 * ----------------------------------------------------------------------- */
const MASTER = new Set([
  0x1a45dfa3, 0x18538067, 0x1549a966, 0x1654ae6b, 0xae, 0xe0, 0x1f43b675,
  0xa0, 0x1c53bb6b, 0xbb, 0x1254c367, 0x7373, 0x63c0,
]);

function readVint(buf, p, keepMarker) {
  if (p >= buf.length) return null;
  const b0 = buf[p];
  if (b0 === 0) return null;
  let len = 1; let mask = 0x80;
  while (!(b0 & mask)) { mask >>= 1; len++; if (len > 8) return null; }
  if (p + len > buf.length) return null;
  let v = keepMarker ? b0 : (b0 & (mask - 1));
  let allOnes = (b0 & (mask - 1)) === (mask - 1);
  for (let i = 1; i < len; i++) {
    v = v * 256 + buf[p + i];
    if (buf[p + i] !== 0xff) allOnes = false;
  }
  return { value: v, next: p + len, unknown: !keepMarker && allOnes };
}

function demuxWebmOpus(buf) {
  let codecPrivate = null; const packets = [];
  const walk = (start, end) => {
    let p = start;
    while (p < end) {
      const id = readVint(buf, p, true); if (!id) return;
      const sz = readVint(buf, id.next, false); if (!sz) return;
      const ds = sz.next;
      if (sz.unknown || ds + sz.value > end) {
        if (MASTER.has(id.value)) walk(ds, end);
        return;
      }
      if (MASTER.has(id.value)) walk(ds, ds + sz.value);
      else if (id.value === 0x63a2) codecPrivate = buf.subarray(ds, ds + sz.value);
      else if (id.value === 0xa3 || id.value === 0xa1) {
        const tn = readVint(buf, ds, false);
        let q = tn.next + 2;
        const flags = buf[q]; q += 1;
        const lacing = (flags >> 1) & 3;
        if (lacing !== 0) throw new Error(`unsupported EBML lacing ${lacing}`);
        packets.push(buf.subarray(q, ds + sz.value));
      }
      p = ds + sz.value;
    }
  };
  walk(0, buf.length);
  return { codecPrivate, packets };
}

const CRC = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  let r = i << 24;
  for (let j = 0; j < 8; j++) r = (r & 0x80000000) ? ((r << 1) ^ 0x04c11db7) : (r << 1);
  CRC[i] = r;
}
const crc32 = (b) => {
  let c = 0;
  for (let i = 0; i < b.length; i++) c = (CRC[((c >>> 24) ^ b[i]) & 0xff] ^ (c << 8)) | 0;
  return c >>> 0;
};

/** Samples in one Opus packet, from its TOC byte (48 kHz clock). */
function opusFrameSamples(pkt) {
  if (!pkt.length) return 0;
  const toc = pkt[0]; const cfg = toc >> 3;
  let ms;
  if (cfg < 12) ms = [10, 20, 40, 60][cfg & 3];
  else if (cfg < 16) ms = [10, 20][cfg & 1];
  else ms = [2.5, 5, 10, 20][cfg & 3];
  const c = toc & 3;
  const n = c === 0 ? 1 : c < 3 ? 2 : (pkt[1] & 0x3f);
  return Math.round(ms * 48 * n);
}

function muxOggOpus(codecPrivate, packets, serial) {
  const pages = []; let seq = 0;
  const emit = (packetList, granule, type) => {
    const lacing = [];
    for (const pk of packetList) {
      let n = pk.length;
      while (n >= 255) { lacing.push(255); n -= 255; }
      lacing.push(n);
    }
    const body = Buffer.concat(packetList.map((p) => Buffer.from(p)));
    const head = Buffer.alloc(27 + lacing.length);
    head.write('OggS', 0, 'ascii');
    head[4] = 0; head[5] = type;
    head.writeBigInt64LE(BigInt(granule), 6);
    head.writeUInt32LE(serial >>> 0, 14);
    head.writeUInt32LE(seq++, 18);
    head[26] = lacing.length;
    for (let i = 0; i < lacing.length; i++) head[27 + i] = lacing[i];
    const full = Buffer.concat([head, body]);
    full.writeUInt32LE(crc32(full), 22);
    pages.push(full);
  };
  const vendor = Buffer.from('horizon-zero-claude', 'utf8');
  const vlen = Buffer.alloc(4); vlen.writeUInt32LE(vendor.length);
  const tags = Buffer.concat([Buffer.from('OpusTags', 'ascii'), vlen, vendor, Buffer.alloc(4)]);
  emit([codecPrivate], 0, 2);
  emit([tags], 0, 0);
  let granule = Buffer.from(codecPrivate).readUInt16LE(10); // pre-skip
  let cur = []; let curSegs = 0;
  for (let i = 0; i < packets.length; i++) {
    const pk = packets[i];
    const segs = Math.floor(pk.length / 255) + 1;
    if (curSegs + segs > 255) { emit(cur, granule, 0); cur = []; curSegs = 0; }
    cur.push(pk); curSegs += segs; granule += opusFrameSamples(pk);
    if (curSegs >= 200 || i === packets.length - 1) {
      emit(cur, granule, i === packets.length - 1 ? 4 : 0);
      cur = []; curSegs = 0;
    }
  }
  return Buffer.concat(pages);
}

/* ------------------------------- render ---------------------------------- */

const PAGE_HELPERS = `
window.__renderCue = async function (job) {
  const { RECIPES, kit } = window.HZC_AUDIO_RECIPES;
  const fn = RECIPES[job.recipe];
  if (!fn) throw new Error('no recipe ' + job.recipe);
  const oc = new OfflineAudioContext(job.ch, Math.ceil(48000 * job.dur), 48000);
  fn(kit(oc, job.seed));
  const rendered = await oc.startRendering();
  // peak-normalise to -1.5 dBFS so the runtime mixer sees a consistent bank
  let peak = 0;
  for (let c = 0; c < rendered.numberOfChannels; c++) {
    const d = rendered.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  }
  if (peak > 1e-5) {
    const k = 0.84 / peak;
    for (let c = 0; c < rendered.numberOfChannels; c++) {
      const d = rendered.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= k;
    }
  }
  const ac = new AudioContext({ sampleRate: 48000 });
  if (ac.state !== 'running') await ac.resume();
  const dest = ac.createMediaStreamDestination();
  try { dest.channelCount = job.ch; dest.channelCountMode = 'explicit'; } catch (e) {}
  const src = ac.createBufferSource();
  src.buffer = rendered; src.connect(dest);
  const chunks = [];
  const rec = new MediaRecorder(dest.stream, {
    mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: job.kbps * 1000,
  });
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((r) => { rec.onstop = r; });
  rec.start();
  src.start();
  await new Promise((r) => setTimeout(r, rendered.duration * 1000 + 220));
  rec.stop();
  await stopped;
  await ac.close();
  const ab = await new Blob(chunks).arrayBuffer();
  const u8 = new Uint8Array(ab);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { b64: btoa(s), peak: peak };
};

window.__verifyOgg = async function (b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const oc = new OfflineAudioContext(1, 48000, 48000);
  try {
    const buf = await oc.decodeAudioData(u8.buffer);
    let peak = 0, sum = 0;
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; }
    return { ok: true, dur: buf.duration, ch: buf.numberOfChannels, peak, rms: Math.sqrt(sum / d.length) };
  } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
};
`;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});

async function makePage() {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[page]', e.message));
  await page.goto('about:blank');
  await page.addScriptTag({ content: readFileSync(path.join(HERE, 'audio-recipes.js'), 'utf8') });
  await page.addScriptTag({ content: PAGE_HELPERS });
  return page;
}

const pages = [];
for (let i = 0; i < Math.max(1, CONC); i++) pages.push(await makePage());

const results = [];
let done = 0;
const t0 = Date.now();

async function worker(page, slot) {
  for (let i = slot; i < JOBS.length; i += pages.length) {
    const job = JOBS[i];
    let record = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { b64 } = await page.evaluate((j) => window.__renderCue(j), job);
      const webm = Buffer.from(b64, 'base64');
      let ogg;
      try {
        const { codecPrivate, packets } = demuxWebmOpus(webm);
        if (!codecPrivate || !packets.length) throw new Error('no opus packets');
        ogg = muxOggOpus(Buffer.from(codecPrivate), packets, 0x484f5243 + i);
      } catch (err) {
        console.error(`  ! ${job.file} remux failed (${err.message}), retry ${attempt + 1}`);
        continue;
      }
      const v = await page.evaluate((b) => window.__verifyOgg(b), ogg.toString('base64'));
      const wantDur = job.dur;
      if (!v.ok || v.peak < 0.02 || v.dur < wantDur * 0.55) {
        console.error(`  ! ${job.file} verify failed (${JSON.stringify(v)}), retry ${attempt + 1}`);
        continue;
      }
      record = { ...job, bytes: ogg.length, decodedDur: +v.dur.toFixed(3), decodedCh: v.ch, peak: +v.peak.toFixed(3), rms: +v.rms.toFixed(4), buf: ogg };
      break;
    }
    if (!record) { console.error(`  X ${job.file} GAVE UP`); continue; }
    results.push(record);
    done++;
    if (done % 10 === 0) console.log(`  ${done}/${JOBS.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
}

console.log(`[audio-bank] rendering ${JOBS.length} cues on ${pages.length} page(s)…`);
await Promise.all(pages.map((p, i) => worker(p, i)));
await browser.close();

results.sort((a, b) => (a.set === b.set ? a.index - b.index : a.set < b.set ? -1 : 1));

/* ------------------------------- write ----------------------------------- */
if (!only && existsSync(OUT_DIR)) {
  for (const d of ['foot', 'bow', 'voice', 'mstep', 'hit', 'machine', 'aloy', 'gear', 'amb',
    'idle', 'status', 'music']) {
    rmSync(path.join(OUT_DIR, d), { recursive: true, force: true });
  }
}
let total = 0;
for (const r of results) {
  const p = path.join(OUT_DIR, r.file);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, r.buf);
  total += r.bytes;
}

// --only renders a subset; writing the manifests from a subset would silently
// delete every other row, so that mode writes files only and says so.
if (only) {
  console.log(`[audio-bank] --only: wrote ${results.length} file(s); manifests NOT updated. `
    + 'Re-run without --only to regenerate src/audio/manifest.js and public/audio/MANIFEST.md.');
  process.exit(results.length === JOBS.length ? 0 : 1);
}

const LICENSE = 'CC0-1.0';
const SOURCE = 'https://github.com/Kevin-Liu-01/Horizon-Zero-Claude — synthesized by tools/audio-recipes.js';
const AUTHOR = 'Horizon Zero Claude (procedurally synthesized, no third-party audio)';

const sets = new Map();
for (const r of results) {
  if (!sets.has(r.set)) sets.set(r.set, []);
  sets.get(r.set).push(r);
}

const runtime = `/**
 * GENERATED by tools/audio-bank.mjs — do not hand-edit; re-run the builder.
 *
 * The runtime index for public/audio/. Every row carries its licence so
 * SampleBank can refuse to load an unlicensed file and so gate A73 can assert
 * "every buffer has a licence entry" (Round 4, D2).
 *
 * Adding curated CC0 downloads later: drop the files under public/audio/<set>/,
 * add rows here with the real \`license\`/\`source\`/\`author\`, and mirror them in
 * public/audio/MANIFEST.md. Nothing in the loader is Ogg-specific — .ogg, .webm
 * and .wav all decode.
 */

export const AUDIO_BASE = '/audio/';

/** @type {{id:string,set:string,file:string,bytes:number,dur:number,ch:number,gain:number,loop:boolean,tags:string[],license:string,source:string,author:string}[]} */
export const MANIFEST = [
${results.map((r) => `  { id: '${r.set}${r.index ? `#${r.index + 1}` : ''}', set: '${r.set}', file: '${r.file}', bytes: ${r.bytes}, dur: ${r.decodedDur}, ch: ${r.decodedCh}, gain: ${r.gain}, loop: ${r.loop}, tags: [${r.tags.map((t) => `'${t}'`).join(', ')}], license: '${LICENSE}', source: '${SOURCE}', author: '${AUTHOR}' },`).join('\n')}
];

/** set id -> the manifest rows in that set, in round-robin order. */
export const SETS = MANIFEST.reduce((m, e) => {
  (m[e.set] || (m[e.set] = [])).push(e);
  return m;
}, /** @type {Record<string, typeof MANIFEST>} */({}));

export const BANK_BYTES = ${total};
`;
writeFileSync(path.join(ROOT, 'src', 'audio', 'manifest.js'), runtime);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const md = `# Audio bank — licence manifest

**Every file in \`public/audio/\` is released under [CC0 1.0 Universal][cc0] (public domain
dedication).** Round 4 decision **D2** lifted the "100 % procedural, no asset files" clause from
\`docs/SPEC.md\`; this directory is the result. No third-party audio is bundled, so there is no
non-commercial, attribution or share-alike obligation anywhere in this tree.

| field | value |
|---|---|
| files | ${results.length} |
| sets | ${sets.size} |
| total size | ${kb(total)} (budget 40 MB) |
| format | Ogg / Opus, 48 kHz, ${'`'}audioBitsPerSecond${'`'} 56–80 kbps |
| generator | \`tools/audio-bank.mjs\` + \`tools/audio-recipes.js\` (deterministic; re-run reproduces the bank) |
| runtime index | \`src/audio/manifest.js\` |

## Provenance

These cues are **synthesized by this repository's own code** — Web Audio graphs (filtered noise
bursts, inharmonic partial stacks, swept oscillators, AM growls) rendered offline in
\`OfflineAudioContext\` and encoded to Opus. They were not sampled, recorded or derived from any
third-party work, so the copyright holder is this project and the dedication below is ours to make.

> To the extent possible under law, the authors of Horizon Zero Claude have waived all copyright
> and related or neighbouring rights to the audio files in \`public/audio/\`. See
> <https://creativecommons.org/publicdomain/zero/1.0/>.

## Swapping in curated CC0 recordings (Wave 3)

The loader is deliberately format-agnostic and manifest-driven. To replace any set with real
CC0 recordings from [freesound (CC0 filter)](https://freesound.org/search/?f=license:%22Creative+Commons+0%22),
[Kenney](https://kenney.nl/assets?q=audio) or [OpenGameArt (CC0 filter)](https://opengameart.org/art-search-advanced?field_art_licenses_tid%5B%5D=4):

1. Drop the files under \`public/audio/<set>/\` (\`.ogg\`, \`.webm\` and \`.wav\` all decode).
2. Add or edit the rows in \`src/audio/manifest.js\` with the real \`license\`, \`source\` (the
   direct URL of the sound page) and \`author\`.
3. Mirror the rows in the table below. **A73 fails if any loaded buffer has no licence row**, and
   \`SampleBank\` refuses to load a row whose \`license\` is not on the allowlist
   (\`CC0-1.0\`, \`CC-PD\`, \`Unlicense\`) — CC-BY-**NC** can never enter the bank (D3).

## Files

| file | set | duration | size | licence | author | source |
|---|---|---|---|---|---|---|
${results.map((r) => `| \`${r.file}\` | \`${r.set}\` | ${r.decodedDur.toFixed(2)} s | ${kb(r.bytes)} | ${LICENSE} | ${AUTHOR} | ${SOURCE} |`).join('\n')}

[cc0]: https://creativecommons.org/publicdomain/zero/1.0/
`;
writeFileSync(path.join(OUT_DIR, 'MANIFEST.md'), md);

console.log(`[audio-bank] ${results.length}/${JOBS.length} files, ${sets.size} sets, ${kb(total)} total in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
if (results.length !== JOBS.length) process.exitCode = 1;
