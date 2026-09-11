/**
 * SampleBank — the manifest-driven asset half of the hybrid audio system
 * (Round 4 decision **D2**, finding `audio-16`).
 *
 * Every buffer that enters the bank must have a manifest row, and that row's
 * `license` must be on `ALLOWED_LICENSES`. That is not paperwork: it is the
 * mechanism that keeps a CC-BY-**NC** file (D3 forbids them) out of a build,
 * and it is what gate `A73-sample-bank` asserts.
 *
 * Nothing here is Ogg-specific — `decodeAudioData` handles .ogg/.webm/.wav, so
 * Wave 3 can drop curated CC0 downloads into `public/audio/` and only touch the
 * two manifests.
 *
 * Loading never throws and never blocks the game: a missing or corrupt file is
 * recorded in `audit().failed` and the caller falls back to synthesis.
 */

import { MANIFEST, SETS, AUDIO_BASE } from './manifest.js';

/** Licences that may enter a shipped bank. NC / ND / SA are refused. */
export const ALLOWED_LICENSES = ['CC0-1.0', 'CC-PD', 'Unlicense', 'PD'];

export class SampleBank {
  constructor(manifest = MANIFEST, sets = SETS, base = AUDIO_BASE) {
    this.manifest = manifest;
    this.sets = sets;
    this.base = base;

    /** @type {Map<string, AudioBuffer>} decoded buffers by manifest id */
    this._buffers = new Map();
    /** @type {Map<string, object>} manifest row by id */
    this._rows = new Map(manifest.map((e) => [e.id, e]));
    /** @type {{id:string,reason:string}[]} */
    this.failed = [];
    /** @type {{id:string,reason:string}[]} rows refused before they ever loaded */
    this.rejected = [];

    this.bytes = 0;
    this.loading = false;
    this.loaded = false;
    /** @type {Promise<SampleBank>|null} */
    this.ready = null;

    // round-robin cursors per set, so two consecutive footsteps never repeat
    this._cursor = new Map();
  }

  /** Decoded buffer count — the number gate A73 reads. */
  get size() { return this._buffers.size; }

  /**
   * Fetch + decode the whole manifest. Idempotent: repeated calls return the
   * same promise. `concurrency` keeps the fetch burst off the first frame.
   */
  load(ac, { concurrency = 8, onProgress = null, timeoutMs = 20000 } = {}) {
    if (this.ready) return this.ready;
    this.loading = true;
    const rows = this.manifest.filter((e) => {
      if (!e.license) { this.rejected.push({ id: e.id, reason: 'no licence row' }); return false; }
      if (!ALLOWED_LICENSES.includes(e.license)) {
        this.rejected.push({ id: e.id, reason: `licence "${e.license}" not on the allowlist` });
        return false;
      }
      return true;
    });

    let next = 0;
    let done = 0;
    const one = async () => {
      for (;;) {
        const i = next++;
        if (i >= rows.length) return;
        const row = rows[i];
        try {
          const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
          const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
          const res = await fetch(this.base + row.file, ctl ? { signal: ctl.signal } : undefined);
          if (timer) clearTimeout(timer);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const ab = await res.arrayBuffer();
          // decodeAudioData detaches the ArrayBuffer; measure first.
          const bytes = ab.byteLength;
          const buf = await ac.decodeAudioData(ab);
          this._buffers.set(row.id, buf);
          this.bytes += bytes;
        } catch (err) {
          this.failed.push({ id: row.id, reason: String((err && err.message) || err) });
        }
        done++;
        if (onProgress) onProgress(done / rows.length, row.id);
      }
    };

    this.ready = Promise.all(
      Array.from({ length: Math.min(concurrency, Math.max(rows.length, 1)) }, one),
    ).then(() => {
      this.loading = false;
      this.loaded = true;
      return this;
    });
    return this.ready;
  }

  /** @returns {AudioBuffer|null} */
  get(id) { return this._buffers.get(id) || null; }

  /** Manifest row (licence included) for an id. */
  rowOf(id) { return this._rows.get(id) || null; }

  /** Does this set have at least one decoded variant? */
  has(setId) {
    const list = this.sets[setId];
    if (!list) return false;
    for (const e of list) if (this._buffers.has(e.id)) return true;
    return false;
  }

  /**
   * Pick the next variant of a set. Round-robin with a random start so a
   * five-step run never sounds like a loop, and never the same file twice in a
   * row when the set has more than one variant.
   */
  pick(setId) {
    const list = this.sets[setId];
    if (!list || !list.length) return null;
    let c = this._cursor.get(setId);
    if (c === undefined) c = (Math.random() * list.length) | 0;
    for (let k = 0; k < list.length; k++) {
      const row = list[(c + k) % list.length];
      const buf = this._buffers.get(row.id);
      if (buf) {
        this._cursor.set(setId, (c + k + 1) % list.length);
        return { buffer: buf, row };
      }
    }
    return null;
  }

  /** First variant of a set, without advancing the cursor (loops, probes). */
  first(setId) {
    const list = this.sets[setId];
    if (!list) return null;
    for (const row of list) {
      const buf = this._buffers.get(row.id);
      if (buf) return { buffer: buf, row };
    }
    return null;
  }

  /** Sets that have at least one decoded buffer. */
  setIds() {
    const out = [];
    for (const id of Object.keys(this.sets)) if (this.has(id)) out.push(id);
    return out;
  }

  /**
   * Gate-facing summary. `unlicensed` must always be 0: it counts decoded
   * buffers with no manifest licence, which is the failure A73 exists to catch.
   */
  audit() {
    let unlicensed = 0;
    const licenses = {};
    for (const id of this._buffers.keys()) {
      const row = this._rows.get(id);
      if (!row || !row.license || !ALLOWED_LICENSES.includes(row.license)) unlicensed++;
      else licenses[row.license] = (licenses[row.license] || 0) + 1;
    }
    return {
      size: this._buffers.size,
      declared: this.manifest.length,
      sets: this.setIds().length,
      bytes: this.bytes,
      megabytes: +(this.bytes / 1048576).toFixed(3),
      unlicensed,
      licenses,
      failed: this.failed.slice(0, 12),
      failedCount: this.failed.length,
      rejected: this.rejected.slice(0, 12),
      rejectedCount: this.rejected.length,
      loaded: this.loaded,
      loading: this.loading,
    };
  }
}
