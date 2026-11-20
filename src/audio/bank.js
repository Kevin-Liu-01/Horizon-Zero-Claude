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
 *
 * TWO PHASES (the first-load cap: the bytes fetched before she is under control). `load()` fetches the boot rows (every
 * manifest row without `load: 'late'`: the slice's bank, the music, the UI); `loadLate()` fetches the late rows (the
 * first hour's Milestone 2 bank) after New Game or Continue gives control, the rows of the place she is nearest first.
 * The manifest's `load` field is the one list: the shipped ledger (tools/tier0/budgets.mjs) reads the same rows.
 * Every ask for a late set is logged (`lateAudit()`): when it was first asked for, when it was decoded, and whether the
 * ask came before the decode (a miss).
 */

import { MANIFEST, SETS, AUDIO_BASE } from './manifest.js';

/** Licences that may enter a shipped bank. NC / ND / SA are refused. */
export const ALLOWED_LICENSES = ['CC0-1.0', 'CC-PD', 'Unlicense', 'PD'];

const isLate = (e) => e.load === 'late';

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
    /** @type {Promise<SampleBank>|null} the boot phase */
    this.ready = null;

    /** The late phase (the Milestone 2 bank): its sets, its state and its log. */
    this.lateSets = new Set(manifest.filter(isLate).map((e) => e.set));
    /** @type {Promise<SampleBank>|null} */
    this.lateReady = null;
    this.late = { state: 'waiting', rows: manifest.filter(isLate).length, decoded: 0, bytes: 0, controlAt: null, startedAt: null, doneAt: null };
    /** @type {Map<string, number>} late set -> performance.now() its first variant was decoded */
    this._decodedAt = new Map();
    /** @type {Map<string, {set:string, at:number, missed:boolean, n:number, misses:number}>} late set -> its first ask */
    this._asks = new Map();

    // round-robin cursors per set, so two consecutive footsteps never repeat
    this._cursor = new Map();
  }

  /** Decoded buffer count — the number gate A73 reads. */
  get size() { return this._buffers.size; }

  /** The rows of a phase that may load (licence on the allowlist); the refused ones are recorded once. */
  _licensed(rows) {
    return rows.filter((e) => {
      if (!e.license) { this.rejected.push({ id: e.id, reason: 'no licence row' }); return false; }
      if (!ALLOWED_LICENSES.includes(e.license)) {
        this.rejected.push({ id: e.id, reason: `licence "${e.license}" not on the allowlist` });
        return false;
      }
      return true;
    });
  }

  /**
   * Fetch + decode rows with `concurrency` workers. `next()` hands each worker its next row (null: none left), so the
   * late phase can choose by where she is at that moment.
   */
  _fetch(ac, count, next, { concurrency, onProgress, timeoutMs, onRow }) {
    let done = 0;
    const one = async () => {
      for (;;) {
        const row = next();
        if (!row) return;
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
          if (onRow) onRow(row, bytes);
        } catch (err) {
          this.failed.push({ id: row.id, reason: String((err && err.message) || err) });
        }
        done++;
        if (onProgress) onProgress(done / count, row.id);
      }
    };
    return Promise.all(Array.from({ length: Math.min(concurrency, Math.max(count, 1)) }, one));
  }

  /**
   * Fetch + decode the boot rows (everything not marked late). Idempotent: repeated calls return the same promise.
   * `concurrency` keeps the fetch burst off the first frame.
   */
  load(ac, { concurrency = 8, onProgress = null, timeoutMs = 20000 } = {}) {
    if (this.ready) return this.ready;
    this.loading = true;
    const rows = this._licensed(this.manifest.filter((e) => !isLate(e)));
    let i = 0;
    this.ready = this._fetch(ac, rows.length, () => (i < rows.length ? rows[i++] : null), { concurrency, onProgress, timeoutMs }).then(() => {
      this.loading = false;
      this.loaded = true;
      return this;
    });
    return this.ready;
  }

  /**
   * Fetch + decode the late rows (after control). `rank(row)` orders what is left each time a worker takes a row
   * (lower first; ties keep the manifest's order): GameAudio ranks the place she is in, and its beds, first.
   * Idempotent. Resolves when every late row has landed or failed.
   */
  loadLate(ac, { rank = null, concurrency = 4, onProgress = null, timeoutMs = 20000, controlAt = null } = {}) {
    if (this.lateReady) return this.lateReady;
    const L = this.late;
    L.state = 'loading';
    L.startedAt = performance.now();
    if (controlAt != null) L.controlAt = controlAt;
    const left = this._licensed(this.manifest.filter(isLate));
    const next = () => {
      if (!left.length) return null;
      let k = 0;
      if (rank) {
        let best = Infinity;
        for (let j = 0; j < left.length; j++) {
          let r = Infinity;
          try { r = rank(left[j]); } catch { /* a rank that throws ranks last */ }
          if (r < best) { best = r; k = j; }
        }
      }
      return left.splice(k, 1)[0];
    };
    const onRow = (row, bytes) => {
      L.decoded++; L.bytes += bytes;
      if (!this._decodedAt.has(row.set)) this._decodedAt.set(row.set, performance.now());
    };
    this.lateReady = this._fetch(ac, left.length, next, { concurrency, onProgress, timeoutMs, onRow }).then(() => {
      L.state = 'done';
      L.doneAt = performance.now();
      return this;
    });
    return this.lateReady;
  }

  /**
   * Log an ask for a set (a cue that would play now). Only late sets are logged: the boot sets load before control.
   * Allocation-free after a set's first ask.
   */
  noteAsk(setId) {
    if (!this.lateSets.has(setId)) return;
    const decoded = this._decodedAt.has(setId);
    let a = this._asks.get(setId);
    if (!a) { a = { set: setId, at: performance.now(), missed: !decoded, n: 0, misses: 0 }; this._asks.set(setId, a); }
    a.n++;
    if (!decoded) a.misses++;
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
    if (this.lateSets.has(setId)) this.noteAsk(setId);
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

  /** First variant of a set, without advancing the cursor (loops, probes). An ask: a late set's is logged. */
  first(setId) {
    if (this.lateSets.has(setId)) this.noteAsk(setId);
    return this.peek(setId);
  }

  /** First decoded variant of a set, not logged as an ask (a director checking whether a bed has landed). */
  peek(setId) {
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
   * The late phase as the rows read it, times in seconds after control (or after the late load began when no control
   * time was given): per late set its decode, its first ask and the lead between them; `missed` lists every set first
   * asked for before it was decoded.
   */
  lateAudit() {
    const L = this.late;
    const t0 = L.controlAt ?? L.startedAt;
    const s = (t) => (t == null || t0 == null ? null : +((t - t0) / 1000).toFixed(3));
    const sets = [];
    for (const set of this.lateSets) {
      const d = this._decodedAt.get(set) ?? null, a = this._asks.get(set) || null;
      sets.push({ set, decodedS: s(d), askedS: a ? s(a.at) : null, leadS: a && d != null ? +((a.at - d) / 1000).toFixed(3) : null,
        asks: a ? a.n : 0, misses: a ? a.misses : 0 });
    }
    const asked = sets.filter((x) => x.asks > 0);
    const leads = asked.filter((x) => x.leadS != null && x.misses === 0).map((x) => x.leadS);
    return {
      state: L.state, rows: L.rows, decoded: L.decoded, megabytes: +(L.bytes / 1048576).toFixed(3),
      startedS: s(L.startedAt), doneS: s(L.doneAt), lastDecodedS: sets.reduce((m, x) => (x.decodedS != null && x.decodedS > m ? x.decodedS : m), 0),
      asked: asked.length, missed: asked.filter((x) => x.misses > 0).map((x) => ({ set: x.set, askedS: x.askedS, decodedS: x.decodedS, misses: x.misses })),
      minLeadS: leads.length ? Math.min(...leads) : null,
      sets,
    };
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
    let lateMissed = 0;
    for (const a of this._asks.values()) if (a.misses > 0) lateMissed++;
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
      late: { state: this.late.state, rows: this.late.rows, decoded: this.late.decoded, asked: this._asks.size, missed: lateMissed },
    };
  }
}
