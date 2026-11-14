import * as THREE from 'three';

/**
 * SHADER PATCH ASSERTION (M0.7, TECH §2 step 1). The game edits three's shaders in about 30
 * `onBeforeCompile` hooks and a few post-pass materials, each by `replace()` on an anchor taken from
 * three's own chunk text. When three moves an anchor the replace silently does nothing: the material
 * still compiles and still renders, just without the patch. That is the failure an engine bump is most
 * likely to cause and least likely to show.
 *
 * This module watches every `replace` / `replaceAll` made on shader text while an `onBeforeCompile`
 * hook runs, keyed by the calling source line, and asserts that each one changed the string. A site
 * that never applied on any material is a missed patch: it is reported once with `console.error`, so
 * the boot check (Tier 0) and every gate (a console error fails a row) see it. A site that applied on
 * some materials and not on others is legal (a hook shared by material types whose shaders differ) and
 * is listed, not failed. The post-pass anchors the engine checks itself (`gtaoPatched`,
 * `postFoldReady`, `bloomClampReady`, `bloomRoundReady`) are asserted by `assertPostPatches`.
 *
 * Cost: nothing per frame. The hook only wraps the call three makes once per program build; the
 * wrapper keeps the hook's own `toString()`, which three uses in the program cache key.
 *
 * Read it in a page: `window.__calShaderPatchAudit.report()`.
 */

const WRAPPED = Symbol('calPatchAuditFn');
const OWN = Symbol('calPatchAuditOwn');
const sites = new Map();
/** Materials whose onBeforeCompile output contains a `discard` (three's own chunks are still `#include`s there). */
const discards = new WeakSet();
const reported = new Set();
let depth = 0;
let current = null;
const strReplace = String.prototype.replace;
const strReplaceAll = String.prototype.replaceAll;

function looksLikeShader(s) {
  return s.length > 64 && (s.includes('void main') || s.includes('#include <') || s.includes('gl_FragColor')
    || s.includes('gl_Position'));
}

function callSite() {
  const lines = (new Error().stack || '').split('\n');
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.includes('shaderPatchAudit')) continue;
    const m = /\(?((?:https?:\/\/[^/]+)?\/?[^()\s]*?):(\d+):(\d+)\)?\s*$/.exec(l.trim());
    if (!m) continue;
    const file = m[1].replace(/^https?:\/\/[^/]+\//, '').replace(/\?[^:]*$/, '');
    return `${file}:${m[2]}`;
  }
  return 'unknown';
}

function anchorText(a) {
  if (a instanceof RegExp) return String(a);
  return String(a).slice(0, 80);
}

function record(site, changed, anchor) {
  let s = sites.get(site);
  if (!s) {
    s = { site, anchor: anchorText(anchor), calls: 0, applied: 0, missed: 0, materials: new Set(), missedOn: new Set() };
    sites.set(site, s);
  }
  s.calls++;
  const type = current?.type || '?';
  s.materials.add(type);
  if (changed) s.applied++;
  else { s.missed++; s.missedOn.add(`${type}${current?.name ? ` "${current.name}"` : ''}`); }
}

function hook(orig) {
  return function auditedReplace(a, b) {
    const out = orig.call(this, a, b);
    if (depth > 0 && typeof this === 'string' && looksLikeShader(this)) record(callSite(), out !== this, a);
    return out;
  };
}
const auditedReplace = hook(strReplace);
const auditedReplaceAll = strReplaceAll ? hook(strReplaceAll) : null;

function wrap(fn) {
  const w = function (shader, renderer) {
    const outer = depth === 0;
    const prevMat = current;
    if (outer) {
      String.prototype.replace = auditedReplace;
      if (auditedReplaceAll) String.prototype.replaceAll = auditedReplaceAll;
    }
    depth++;
    current = this;
    try {
      return fn.call(this, shader, renderer);
    } finally {
      // perf attribution (M0.8): a material whose patched fragment shader can discard defeats early depth and HSR
      if (typeof shader?.fragmentShader === 'string' && /\bdiscard\b/.test(shader.fragmentShader)) discards.add(this);
      depth--;
      current = prevMat;
      if (outer) {
        String.prototype.replace = strReplace;
        if (strReplaceAll) String.prototype.replaceAll = strReplaceAll;
        scheduleCheck();
      }
    }
  };
  w[WRAPPED] = fn;
  // three's program cache key is `onBeforeCompile.toString()`: keep the hook's own text
  w.toString = () => fn.toString();
  return w;
}

let checkQueued = false;
function scheduleCheck() {
  if (checkQueued) return;
  checkQueued = true;
  queueMicrotask(() => { checkQueued = false; checkMisses(); });
}

/** Report each site that has run and never applied, once. */
function checkMisses() {
  for (const s of sites.values()) {
    if (s.applied > 0 || s.missed === 0 || reported.has(s.site)) continue;
    reported.add(s.site);
    console.error(`[CAL] shader patch did not apply (three r${THREE.REVISION}): ${s.site} anchor ${JSON.stringify(s.anchor)} on ${[...s.missedOn].slice(0, 3).join(', ')}`);
  }
}

const postFlags = {};

/**
 * The engine's own anchor checks on the post materials (GTAO, bloom high pass, bloom composite). Each
 * flag is the result of an `includes()` the engine ran before patching; false means three moved the
 * anchor and the engine fell back to the stock pass.
 */
export function assertPostPatches(engine) {
  const want = {
    gtaoPatched: engine.gtaoPatched,
    postFoldReady: engine.postFoldReady,
    bloomClampReady: engine.bloomClampReady,
    bloomRoundReady: engine.bloomRoundReady,
  };
  for (const [k, v] of Object.entries(want)) {
    postFlags[k] = v === true;
    if (v !== true) console.error(`[CAL] post shader patch did not apply (three r${THREE.REVISION}): engine.${k} = ${v}`);
  }
}

function install() {
  const proto = THREE.Material.prototype;
  const own = Object.getOwnPropertyDescriptor(proto, 'onBeforeCompile');
  if (own && own.get) return; // installed already (HMR)
  const base = proto.onBeforeCompile;
  Object.defineProperty(proto, 'onBeforeCompile', {
    configurable: true,
    enumerable: false,
    get() { return this[OWN] || base; },
    set(fn) { this[OWN] = typeof fn === 'function' && !fn[WRAPPED] && fn !== base ? wrap(fn) : fn; },
  });
}

install();

function report() {
  const list = [...sites.values()].map((s) => ({
    site: s.site, anchor: s.anchor, calls: s.calls, applied: s.applied, missed: s.missed,
    materials: [...s.materials], missedOn: [...s.missedOn].slice(0, 6),
  })).sort((a, b) => a.site.localeCompare(b.site));
  return {
    revision: THREE.REVISION,
    sites: list.length,
    calls: list.reduce((n, s) => n + s.calls, 0),
    neverApplied: list.filter((s) => s.applied === 0),
    partial: list.filter((s) => s.applied > 0 && s.missed > 0),
    post: { ...postFlags },
    ok: list.every((s) => s.applied > 0) && Object.values(postFlags).every(Boolean),
    list,
  };
}

if (typeof window !== 'undefined') window.__calShaderPatchAudit = { report, sites, discards };
