/**
 * Offline measurement harness — how the audio lane is *verified* rather than
 * asserted. Screenshots cannot show a mix, so every audio gate renders the real
 * graph through an `OfflineAudioContext` and measures the samples that come
 * out: channel energy, peak, RMS, band spectrum.
 *
 * The critical property is that `probeSpatial()` builds the mix with the same
 * `buildBuses()` and the same `SpatialChain` the player hears. If someone
 * regresses the panner's distance model, A74 fails — it is not measuring a
 * parallel implementation that can drift.
 */

import { buildBuses, DEFAULT_VOLUMES } from './buses.js';
import { SpatialChain } from './spatial.js';

const UNITY = { master: 1, music: 1, sfx: 1, ambience: 1, voice: 1, ui: 1, muted: false };

function OfflineCtor() {
  return (typeof OfflineAudioContext !== 'undefined' && OfflineAudioContext)
    || (typeof webkitOfflineAudioContext !== 'undefined' && webkitOfflineAudioContext)
    || null;
}

/** Compact in-place radix-2 FFT (magnitudes only). */
function fftMag(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang); const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1; let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k]; const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

/**
 * Log-spaced band energies + spectral centroid for a slice of PCM. Used to
 * prove two cues are *different sounds*, not the same roar at two pitches.
 */
export function spectrum(data, sampleRate, bands = 12) {
  const N = 4096;
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const half = N >> 1;
  const mag = new Float32Array(half);

  // Average over hops across the WHOLE cue, not one window at the head. A
  // single 4096-sample frame is 85 ms — the attack transient — and every
  // percussive cue has a broadband click there, so head-only analysis made
  // eight completely different creature voices look nearly identical.
  const hop = Math.max(1, Math.floor((data.length - N) / 11));
  let frames = 0;
  for (let off = 0; off + 1 <= data.length; off += hop) {
    const n = Math.min(N, data.length - off);
    if (n < N / 4 && frames > 0) break;
    re.fill(0); im.fill(0);
    let energy = 0;
    for (let i = 0; i < n; i++) {
      const v = data[off + i];
      energy += v * v;
      re[i] = v * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1 || 1)));
    }
    // skip near-silent frames: a long decay tail would otherwise dilute the
    // timbre with nothing but noise floor
    if (energy / n < 1e-8) { if (off + hop >= data.length) break; continue; }
    fftMag(re, im);
    for (let i = 1; i < half; i++) mag[i] += Math.sqrt(re[i] * re[i] + im[i] * im[i]);
    frames++;
    if (frames >= 12 || off + hop + N > data.length + hop) break;
  }
  let total = 0; let weighted = 0;
  for (let i = 1; i < half; i++) {
    const m = mag[i];
    const f = (i * sampleRate) / N;
    total += m; weighted += m * f;
  }
  const out = new Array(bands).fill(0);
  const fMin = 60; const fMax = Math.min(16000, sampleRate / 2);
  for (let i = 1; i < half; i++) {
    const f = (i * sampleRate) / N;
    if (f < fMin || f > fMax) continue;
    const b = Math.min(bands - 1,
      Math.floor((Math.log(f / fMin) / Math.log(fMax / fMin)) * bands));
    out[b] += mag[i];
  }
  const sum = out.reduce((a, b) => a + b, 0) || 1;
  return {
    bands: out.map((v) => +(v / sum).toFixed(4)),
    centroid: total > 0 ? +(weighted / total).toFixed(1) : 0,
  };
}

/** Cosine distance between two band vectors — 0 identical, 1 orthogonal. */
export function bandDistance(a, b) {
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na <= 0 || nb <= 0) return 1;
  return +(1 - dot / Math.sqrt(na * nb)).toFixed(4);
}

/** Per-channel peak/RMS over a sample window. */
export function measure(rendered, from = 0, to = Infinity) {
  const n = rendered.length;
  const a = Math.max(0, Math.floor(from));
  const b = Math.min(n, Math.floor(to));
  const chans = [];
  for (let c = 0; c < rendered.numberOfChannels; c++) {
    const d = rendered.getChannelData(c);
    let peak = 0; let sum = 0;
    for (let i = a; i < b; i++) { const v = d[i]; const m = v < 0 ? -v : v; if (m > peak) peak = m; sum += v * v; }
    chans.push({ peak: +peak.toFixed(5), rms: +Math.sqrt(sum / Math.max(1, b - a)).toFixed(6) });
  }
  const left = chans[0] || { peak: 0, rms: 0 };
  const right = chans[1] || left;
  const rms = Math.sqrt((left.rms * left.rms + right.rms * right.rms) / 2);
  return {
    left: left.rms,
    right: right.rms,
    peak: Math.max(left.peak, right.peak),
    rms: +rms.toFixed(6),
    balance: +(((right.rms - left.rms) / (right.rms + left.rms || 1))).toFixed(4),
  };
}

/**
 * Render a short noise burst from each world position through the real bus +
 * spatial chain and report what the listener would receive.
 *
 * Listener sits at the origin, 1.6 m up, facing −Z (three.js camera
 * convention), so a positive X is to the player's RIGHT and a negative Z is in
 * FRONT — the same frame gameplay uses.
 *
 * @param {{x:number,y:number,z:number,occ?:number}[]} points
 * @returns {Promise<{points:object[], sampleRate:number}>}
 */
export async function probeSpatial(points, {
  sampleRate = 48000, slot = 0.35, panningModel = 'HRTF', occlusion = null,
} = {}) {
  const OC = OfflineCtor();
  if (!OC) return { points: [], sampleRate: 0, error: 'no OfflineAudioContext' };
  const total = Math.ceil(sampleRate * (slot * points.length + 0.4));
  const oc = new OC(2, total, sampleRate);
  const buses = buildBuses(oc, { volumes: UNITY });
  // the probe measures the direct path; reverb would smear one slot into the next
  buses.fxReturn.gain.value = 0;

  const L = oc.listener;
  if (L.positionX) {
    L.positionX.value = 0; L.positionY.value = 1.6; L.positionZ.value = 0;
    L.forwardX.value = 0; L.forwardY.value = 0; L.forwardZ.value = -1;
    L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
  } else {
    L.setPosition(0, 1.6, 0);
    L.setOrientation(0, 0, -1, 0, 1, 0);
  }

  // one deterministic burst reused by every slot
  const burst = oc.createBuffer(1, Math.floor(sampleRate * 0.25), sampleRate);
  const bd = burst.getChannelData(0);
  let seed = 0x1234abcd;
  for (let i = 0; i < bd.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const env = Math.min(1, i / (sampleRate * 0.01)) * (1 - i / bd.length);
    bd[i] = ((seed / 4294967296) * 2 - 1) * env;
  }

  points.forEach((p, i) => {
    const chain = new SpatialChain(buses, { panningModel });
    chain.route('sfx');
    chain.occ = p.occ || 0;
    chain.setPosition(p.x, p.y ?? 1.6, p.z);
    chain.applyDistance(0, 1.6, 0, 0, 0, -1);
    const src = oc.createBufferSource();
    src.buffer = burst;
    src.connect(chain.input);
    src.start(0.05 + i * slot);
  });

  const rendered = await oc.startRendering();
  const out = points.map((p, i) => {
    const a = Math.floor((0.05 + i * slot) * sampleRate);
    const b = Math.floor((0.05 + i * slot + 0.3) * sampleRate);
    const m = measure(rendered, a, b);
    // brightness matters as much as level: the head-shadow tilt and the
    // occlusion filter both show up here and nowhere else
    const spec = spectrum(rendered.getChannelData(0).subarray(a, b), sampleRate);
    const dx = p.x; const dy = (p.y ?? 1.6) - 1.6; const dz = p.z;
    return {
      pos: { x: p.x, y: p.y ?? 1.6, z: p.z },
      occ: p.occ || 0,
      distance: +Math.sqrt(dx * dx + dy * dy + dz * dz).toFixed(2),
      ...m,
      centroid: spec.centroid,
      bands: spec.bands,
    };
  });
  void occlusion;
  return { points: out, sampleRate };
}

/**
 * Onset envelope vs a beat grid — how gate A77 proves a stem is COMPOSED and
 * not a texture.
 *
 * "Adaptive music" that crossfades two ambient drones passes every level and
 * spectrum check a mix can make, and is still not music. The thing that
 * separates the two is metre: a composed percussion stem puts its energy on a
 * grid, and a texture does not.
 *
 * Method: 10 ms energy hops -> half-wave-rectified first difference (the
 * standard spectral-flux-lite onset function) -> local maxima above a fraction
 * of the strongest onset. Then search a global phase offset, because the Opus
 * decoder's pre-skip shifts every sample in the file by a few milliseconds and
 * a grid test anchored at t=0 would fail on encoder padding rather than on
 * musical content. The reported `onGrid` is the best-offset fit.
 *
 * @param {AudioBuffer} buffer
 * @param {number} beat seconds per beat (0.625 at 96 BPM)
 */
export function beatGrid(buffer, beat, { hop = 0.01, tolerance = 0.045, minRel = 0.28 } = {}) {
  const sr = buffer.sampleRate;
  const d = buffer.getChannelData(0);
  const n = Math.max(1, Math.floor(hop * sr));
  const frames = Math.floor(d.length / n);
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const a = f * n;
    for (let i = 0; i < n; i++) { const v = d[a + i]; sum += v * v; }
    energy[f] = Math.sqrt(sum / n);
  }
  // half-wave-rectified first difference
  const flux = new Float32Array(frames);
  let maxFlux = 0;
  for (let f = 1; f < frames; f++) {
    const v = energy[f] - energy[f - 1];
    flux[f] = v > 0 ? v : 0;
    if (flux[f] > maxFlux) maxFlux = flux[f];
  }
  const empty = { onsets: 0, onGrid: 0, offset: 0, meanError: 1, beat };
  if (maxFlux <= 1e-6) return empty;
  const thr = maxFlux * minRel;
  const onsets = [];
  for (let f = 1; f < frames - 1; f++) {
    if (flux[f] < thr) continue;
    if (flux[f] < flux[f - 1] || flux[f] < flux[f + 1]) continue;
    onsets.push(f * hop);
    f += 2;                                    // one onset per ~30 ms
  }
  if (!onsets.length) return empty;

  // grid-search the global phase; 2 ms resolution over one beat
  let best = { hits: -1, offset: 0, err: 1 };
  for (let o = 0; o < beat; o += 0.002) {
    let hits = 0; let err = 0;
    for (let i = 0; i < onsets.length; i++) {
      const k = (onsets[i] - o) / beat;
      const e = Math.abs(k - Math.round(k)) * beat;
      err += e;
      if (e <= tolerance) hits++;
    }
    if (hits > best.hits) best = { hits, offset: +o.toFixed(3), err: err / onsets.length };
  }
  return {
    onsets: onsets.length,
    onGrid: +(best.hits / onsets.length).toFixed(3),
    offset: best.offset,
    meanError: +best.err.toFixed(4),
    beat,
  };
}

/**
 * Render one decoded bank buffer through the mix and report level + spectrum.
 * Used by A73 (every set is audible) and A75 (species voices are distinct).
 */
export async function probeBuffer(buffer, { sampleRate = 48000, category = 'sfx' } = {}) {
  const OC = OfflineCtor();
  if (!OC || !buffer) return null;
  const oc = new OC(2, Math.ceil(sampleRate * (buffer.duration + 0.15)), sampleRate);
  const buses = buildBuses(oc, { volumes: UNITY });
  buses.fxReturn.gain.value = 0;
  const src = oc.createBufferSource();
  src.buffer = buffer;
  src.connect(buses.dryFor(category));
  src.start(0);
  const rendered = await oc.startRendering();
  const m = measure(rendered);
  const spec = spectrum(rendered.getChannelData(0), sampleRate);
  return { duration: +buffer.duration.toFixed(3), ...m, ...spec };
}

export { DEFAULT_VOLUMES };
