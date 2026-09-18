/**
 * Round 4 gates — lane `memory-attribution` (port 5208).
 *
 * WHY THIS FILE EXISTS. `A90-memory-stability` fails on ONE term — textures —
 * and `A90-memory-stability-expansion` fails on ONE term — the population node
 * budget. Both numbers are aggregates: `renderer.info.memory.textures` is a
 * whole-process counter and `populationAudit().nodes` is a whole-roster
 * counter, so neither can say WHICH module produced the growth. Four rounds of
 * memory work on this repo have been spent guessing at that from deltas (the
 * round-3 verdict blamed corpse reclaim for what turned out to be an uncapped
 * population), and a guess costs a lane a day.
 *
 * So this lane does not add another aggregate. It adds an ATTRIBUTION.
 *
 * THREE INSTRUMENTS, because the counter A90 fails on is not the one a
 * constructor hook can see:
 *
 *   1. ALLOCATION. Every `THREE.Texture` / `BufferGeometry` / `Material` /
 *      `Object3D` construction and every `Object3D.prototype.add` is tagged
 *      with the first `/src/` frame on its stack — which, against the Vite dev
 *      server the gates run on, is the owning module AND LINE — and every
 *      `dispose()` is credited back to the module that allocated the thing
 *      being disposed.
 *
 *   2. UPLOAD. `renderer.info.memory.textures` does NOT count constructions:
 *      three increments it when a texture is first uploaded to the GPU
 *      (three.module.js:24825) and decrements it on dispose (:24500). Measured
 *      on this port, ten kills constructed **11** textures and moved that
 *      counter by **+25** — so two thirds of what A90 fails on was never
 *      allocated inside its window at all. `info.memory.textures` and
 *      `.geometries` are therefore replaced with accessors for the duration of
 *      the gate, which count uploads and frees separately. An aggregate that
 *      can move for two opposite reasons has to be split before it can be
 *      acted on.
 *
 *   3. REACHABILITY. A texture that is uploaded and no longer reachable from
 *      anything the app owns can never be disposed — three will hold its GPU
 *      memory until the context is lost, and `info.memory.textures` will never
 *      come back down. The sweep walks the scene, every donor model, every
 *      machine's `_rigOwned` set and LOD chain, combat's owned resources and
 *      every render target it can find, remembers where each texture was last
 *      seen, and reports the ones that have fallen out of all of them. That
 *      "last holder" string is the actionable half: it names the subsystem
 *      that dropped the reference without disposing.
 *
 * HOW THE CONSTRUCTORS ARE HOOKED WITHOUT TOUCHING `src/`. three r169 sets
 * `this.isTexture = true` / `isBufferGeometry` / `isMaterial` / `isObject3D` as
 * the first statement of each constructor body (three.module.js:2031, 10556,
 * 9167, 7223 — instance assignments, not prototype flags). An accessor defined
 * on the prototype therefore intercepts construction itself: the setter records
 * the allocation and then re-defines the flag as an own data property on the
 * instance, so every later read is the plain own-property read three expects
 * and nothing downstream can tell the difference. The prototypes are found by
 * walking up from a live instance to the proto that OWNS a known method
 * (`traverse` / `setAttribute` / `setValues` / `updateMatrix`) rather than by
 * `constructor.name`, because Vite's dev transform renames the classes
 * (`_Object3D`, `_Texture` — measured on this port).
 *
 * The technique is the one `combat-memory` used for the DOM
 * (`docs/ROUND4-COMBAT-MEMORY.md`, `DOM_WATCH`): wrap the allocator, key the
 * record by the first `/src/` frame, and self-test the instrument inside the
 * gate so a detector that has silently stopped working FAILS instead of
 * reporting zeroes forever.
 *
 * NOTHING IS LEFT ON IN PRODUCTION. Every hook lives in this file, is installed
 * from the gate's own assert, and is removed by `stop()` in a `finally`. No
 * file under `src/` is instrumented.
 *
 * NO PER-FRAME ALLOCATION. The instrument allocates one `Error` per TRACKED
 * ALLOCATION, never per frame, with `Error.stackTraceLimit` clamped to 16 while
 * it is installed; `Object3D.prototype.add` IS on the frame path, so its stack
 * tagging runs on a hard budget and says so in the report when the budget runs
 * out. Samples are `WeakRef`s behind a cap, so the instrument can neither
 * retain what it is measuring nor grow without bound. The census walks are
 * on-demand snapshots — three per run — never in the loop.
 */

const INPUT_ON = '__CTX__.input.enabled = true;';

/**
 * THE INSTRUMENT. Page-context source, installed by the gate and removed in a
 * `finally`. Written without template literals and without `${}` so it can be
 * embedded in a gate's own template literal unescaped; the only backslash in
 * here is the `\\n` that splits a stack, for the same reason.
 */
export const MEM_INSTRUMENT = `
function installMemInstrument() {
  var C = __CTX__;
  var scene = C.scene;
  var renderer = C.renderer || (C.engine && C.engine.renderer);

  /* ---------- find the base prototypes from live instances ---------- */
  function protoOwning(obj, key) {
    var p = Object.getPrototypeOf(obj);
    while (p && !Object.prototype.hasOwnProperty.call(p, key)) p = Object.getPrototypeOf(p);
    return p;
  }
  var anyGeo = null, anyMat = null, anyTex = null;
  scene.traverse(function (o) {
    if (!anyGeo && o.geometry && o.geometry.isBufferGeometry) anyGeo = o.geometry;
    var m = o.material;
    var ms = Array.isArray(m) ? m : (m ? [m] : []);
    for (var i = 0; i < ms.length; i++) {
      if (!anyMat) anyMat = ms[i];
      if (!anyTex) {
        for (var k in ms[i]) { var v = ms[i][k]; if (v && v.isTexture) { anyTex = v; break; } }
      }
    }
    if (!anyTex && o.isSkinnedMesh && o.skeleton && o.skeleton.boneTexture) anyTex = o.skeleton.boneTexture;
  });
  var P = {
    objects: protoOwning(scene, 'traverse'),
    geometries: anyGeo ? protoOwning(anyGeo, 'setAttribute') : null,
    materials: anyMat ? protoOwning(anyMat, 'setValues') : null,
    textures: anyTex ? protoOwning(anyTex, 'updateMatrix') : null,
  };
  var FLAG = { objects: 'isObject3D', geometries: 'isBufferGeometry', materials: 'isMaterial', textures: 'isTexture' };
  var KINDS = ['textures', 'geometries', 'materials', 'objects'];
  var missing = [];
  for (var ki = 0; ki < KINDS.length; ki++) if (!P[KINDS[ki]]) missing.push(KINDS[ki]);

  /* ---------- owner tagging: the first /src/ frame on the stack ---------- */
  var prevLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = 16;
  var inSelfTest = false;
  var NUM = /^[0-9]+$/;
  /** our own frames, so 'via' names the THREE.js call, not the instrument */
  var MINE = ['siteOf', 'installMemInstrument', 'Object.set', 'rec ', '.rec', 'wrapDispose'];
  function isMine(L) {
    for (var i = 0; i < MINE.length; i++) if (L.indexOf(MINE[i]) >= 0) return true;
    return false;
  }
  function parseSrc(L) {
    var a = L.indexOf('/src/');
    if (a < 0) return null;
    var e = a;
    while (e < L.length && ' )?'.indexOf(L[e]) < 0) e++;
    var path = L.slice(a, e);
    var end = L.indexOf(')', e);
    if (end < 0) end = L.length;
    var parts = L.slice(e, end).split(':');
    var ln = parts.length >= 2 ? parts[parts.length - 2] : '';
    return { path: path, loc: NUM.test(ln) ? path + ':' + ln : path };
  }
  function siteOf() {
    if (inSelfTest) return { owner: '(selftest)', loc: '(selftest)', via: '' };
    var st;
    try { st = (new Error()).stack || ''; } catch (e) { return { owner: '(nostack)', loc: '(nostack)', via: '' }; }
    var lines = st.split('\\n');
    var via = '';
    for (var i = 1; i < lines.length; i++) {
      var L = lines[i];
      var s = parseSrc(L);
      if (!s) {
        if (!via && !isMine(L)) {
          var at = L.indexOf('at ');
          if (at >= 0) via = L.slice(at + 3).split(' (')[0].slice(0, 56);
        }
        continue;
      }
      return { owner: s.path, loc: s.loc, via: via };
    }
    return { owner: '(no-src-frame)', loc: '(no-src-frame)', via: via };
  }

  /* ---------- per-owner ledgers ---------- */
  var REF_CAP = 24000;                       // the instrument may not grow without bound
  var ledger = {};                           // kind -> owner -> { created, disposed, locs, vias }
  var refs = {};                             // kind -> [{ r:WeakRef, owner, seq }]
  var capped = {};
  var seq = 0;
  for (var q = 0; q < KINDS.length; q++) { ledger[KINDS[q]] = Object.create(null); refs[KINDS[q]] = []; capped[KINDS[q]] = 0; }
  var ownerOfObj = new WeakMap();
  var disposedOnce = new WeakSet();
  /**
   * Texture ids that went through dispose(), kept BY ID and not by identity.
   * A texture that was disposed and then garbage collected is indistinguishable
   * from one that was collected without ever being disposed once the object is
   * gone — and the first cut of this instrument called seven correctly-reclaimed
   * bone textures "collected while uploaded" for exactly that reason. An id
   * survives the object.
   */
  var disposedTexIds = new Set();
  var adds = Object.create(null);
  var removes = Object.create(null);

  /** id -> { ref, holder, uploaded, owner } for every texture ever SEEN */
  var texSeen = new Map();

  function rec(kind, obj) {
    var s = siteOf();
    var L = ledger[kind];
    var e = L[s.owner];
    if (!e) e = L[s.owner] = { created: 0, disposed: 0, locs: Object.create(null), vias: Object.create(null) };
    e.created++;
    e.locs[s.loc] = (e.locs[s.loc] || 0) + 1;
    if (s.via) e.vias[s.via] = (e.vias[s.via] || 0) + 1;
    try { ownerOfObj.set(obj, s.owner); } catch (err) { /* frozen/exotic */ }
    var arr = refs[kind];
    if (arr.length < REF_CAP) arr.push({ r: new WeakRef(obj), owner: s.owner, seq: seq++ });
    else capped[kind]++;
    if (kind === 'textures') {
      // the id is assigned one statement later, so register on the next turn
      var self = obj;
      Promise.resolve().then(function () {
        try { if (!texSeen.has(self.id)) texSeen.set(self.id, { ref: new WeakRef(self), holder: 'created by ' + s.loc, uploaded: false, owner: s.owner }); } catch (er) {}
      });
    }
  }

  /* ---------- constructor hooks ---------- */
  var undo = [];
  for (var h = 0; h < KINDS.length; h++) {
    (function (kind) {
      var proto = P[kind];
      if (!proto) return;
      var flag = FLAG[kind];
      var had = Object.getOwnPropertyDescriptor(proto, flag);
      Object.defineProperty(proto, flag, {
        configurable: true,
        enumerable: false,
        get: function () { return true; },
        set: function (v) {
          Object.defineProperty(this, flag, { value: v, writable: true, enumerable: true, configurable: true });
          try { rec(kind, this); } catch (e) { /* never break the build under test */ }
        },
      });
      undo.push(function () {
        if (had) Object.defineProperty(proto, flag, had); else delete proto[flag];
      });
    }(KINDS[h]));
  }

  /* ---------- dispose hooks (credit the disposal to the allocator) ---------- */
  function wrapDispose(kind) {
    var proto = P[kind];
    if (!proto || typeof proto.dispose !== 'function') return;
    var orig = proto.dispose;
    proto.dispose = function () {
      try {
        if (!disposedOnce.has(this)) {
          disposedOnce.add(this);
          if (kind === 'textures' && typeof this.id === 'number') disposedTexIds.add(this.id);
          var owner = ownerOfObj.get(this);
          var L = ledger[kind];
          var key = owner === undefined ? '(allocated before the window)' : owner;
          var e = L[key];
          if (!e) e = L[key] = { created: 0, disposed: 0, locs: Object.create(null), vias: Object.create(null) };
          e.disposed++;
        }
      } catch (e) { /* ignore */ }
      return orig.apply(this, arguments);
    };
    undo.push(function () { proto.dispose = orig; });
  }
  wrapDispose('textures'); wrapDispose('geometries'); wrapDispose('materials');

  /**
   * Object3D.prototype.add / remove, ON A BUDGET — unlike a constructor this
   * one IS on the frame path (effects park and unpark meshes every frame), so
   * tagging every call with a stack would put an Error allocation in the frame
   * loop, the exact thing this lane exists to stop. The first ADD_BUDGET calls
   * are attributed; past that they are counted without a stack and the report
   * says how many, so a run can never be skewed without admitting it.
   */
  var ADD_BUDGET = 20000;
  var addTagged = 0, addsUnattributed = 0, removesUnattributed = 0;
  if (P.objects) {
    var origAdd = P.objects.add;
    var origRemove = P.objects.remove;
    P.objects.add = function () {
      if (addTagged < ADD_BUDGET) {
        addTagged++;
        try { var s = siteOf(); adds[s.owner] = (adds[s.owner] || 0) + 1; } catch (e) {}
      } else addsUnattributed++;
      return origAdd.apply(this, arguments);
    };
    P.objects.remove = function () {
      if (addTagged < ADD_BUDGET) {
        addTagged++;
        try { var s2 = siteOf(); removes[s2.owner] = (removes[s2.owner] || 0) + 1; } catch (e) {}
      } else removesUnattributed++;
      return origRemove.apply(this, arguments);
    };
    undo.push(function () { P.objects.add = origAdd; P.objects.remove = origRemove; });
  }

  /**
   * UPLOAD / FREE COUNTERS. \`info.memory.textures\` is incremented by three on
   * upload and decremented on dispose, so a single delta cannot tell "we drew
   * something new" from "we leaked something old". Replace the two fields with
   * accessors and count the two directions separately.
   */
  var mem = renderer.info.memory;
  var texVal = mem.textures, geoVal = mem.geometries;
  var flux = { texUp: 0, texDown: 0, geoUp: 0, geoDown: 0 };
  Object.defineProperty(mem, 'textures', {
    configurable: true, enumerable: true,
    get: function () { return texVal; },
    set: function (v) { if (v > texVal) flux.texUp += v - texVal; else flux.texDown += texVal - v; texVal = v; },
  });
  Object.defineProperty(mem, 'geometries', {
    configurable: true, enumerable: true,
    get: function () { return geoVal; },
    set: function (v) { if (v > geoVal) flux.geoUp += v - geoVal; else flux.geoDown += geoVal - v; geoVal = v; },
  });
  undo.push(function () {
    Object.defineProperty(mem, 'textures', { value: texVal, writable: true, enumerable: true, configurable: true });
    Object.defineProperty(mem, 'geometries', { value: geoVal, writable: true, enumerable: true, configurable: true });
  });

  /** has three actually uploaded this texture to the GPU? (three.module.js:24790) */
  function uploaded(t) {
    try { var p = renderer.properties.get(t); return !!(p && p.__webglInit); } catch (e) { return false; }
  }

  /* ---------- the reachability sweep ---------- */
  function liveMachineRoots() {
    var s = new Set();
    var list = (C.machines && C.machines.list) || [];
    for (var i = 0; i < list.length; i++) if (list[i].root) s.add(list[i].root);
    return s;
  }
  function holderKey(o, liveRoots) {
    var n = o, top = o, hops = 0;
    while (n && hops < 64) {
      if (liveRoots.has(n)) return 'live-machine-root';
      if (n.parent === scene) top = n;
      n = n.parent; hops++;
    }
    return (top && (top.name || top.type)) || '(detached)';
  }
  var SUBSYS = ['machines', 'combat', 'hud', 'focus', 'audio', 'interactables', 'items',
    'progression', 'spatial', 'collision', 'nav', 'hitHulls', 'props', 'fauna', 'npcs',
    'studio', 'environment', 'vegetation', 'terrain', 'camp', 'player', 'engine', 'anim', 'menus'];

  /**
   * Everything the app can still reach a texture through. The scene is the
   * obvious one; the rest are the places a texture legitimately lives while
   * OFF the scene graph, and a sweep that missed them would report healthy
   * assets as leaks.
   */
  function sweep() {
    var liveRoots = liveMachineRoots();
    var found = new Map();
    var geoFound = new Set();
    var visited = new Set();
    function note(t, holder) {
      if (!t || !t.isTexture || found.has(t.id)) return;
      found.set(t.id, holder);
      var prev = texSeen.get(t.id);
      texSeen.set(t.id, { ref: new WeakRef(t), holder: holder, uploaded: uploaded(t), owner: prev ? prev.owner : null });
    }
    function noteGeo(g) { if (g && g.isBufferGeometry) geoFound.add(g.id); }
    function scanMaterial(m, holder) {
      if (!m) return;
      for (var k in m) { var v = m[k]; if (v && v.isTexture) note(v, holder); }
    }
    function scanRoot(root, label, useKey) {
      if (!root || !root.traverse) return;
      root.traverse(function (o) {
        var holder = useKey ? holderKey(o, liveRoots) : label;
        noteGeo(o.geometry);
        var ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (var i = 0; i < ms.length; i++) scanMaterial(ms[i], holder);
        if (o.isSkinnedMesh && o.skeleton && o.skeleton.boneTexture) note(o.skeleton.boneTexture, holder + ' [boneTexture]');
      });
    }
    function deep(v, label, depth) {
      if (!v || depth < 0 || typeof v !== 'object') return;
      if (visited.has(v) || visited.size > 24000) return;
      visited.add(v);
      if (v.isTexture) { note(v, label); return; }
      if (v.isBufferGeometry) { noteGeo(v); return; }
      if (v.isRenderTargetTexture || v.isWebGLRenderTarget) {
        deep(v.texture, label + '.rt', 0);
        if (Array.isArray(v.textures)) for (var r = 0; r < v.textures.length; r++) deep(v.textures[r], label + '.rt[' + r + ']', 0);
        return;
      }
      if (v.isObject3D) { scanRoot(v, label, false); return; }
      if (v.isMaterial) { scanMaterial(v, label); return; }
      if (v.isSkeleton) { if (v.boneTexture) note(v.boneTexture, label + ' [boneTexture]'); return; }
      if (Array.isArray(v)) {
        for (var i = 0; i < v.length && i < 600; i++) deep(v[i], label + '[]', depth - 1);
        return;
      }
      if (v instanceof Set || v instanceof Map) {
        var n = 0;
        v.forEach(function (x) { if (n++ < 600) deep(x, label + '<>', depth - 1); });
        return;
      }
      if (typeof v === 'function') return;
      var ks;
      try { ks = Object.keys(v); } catch (e) { return; }
      if (ks.length > 90) return;
      for (var j = 0; j < ks.length; j++) {
        var child;
        try { child = v[ks[j]]; } catch (e) { continue; }
        deep(child, label + '.' + ks[j], depth - 1);
      }
    }
    scanRoot(scene, 'scene', true);
    if (scene.background) deep(scene.background, '(scene.background)', 0);
    if (scene.environment) deep(scene.environment, '(scene.environment)', 0);
    // donor models: loaded once, never in the scene, and their maps are shared
    try {
      var models = C.assets && C.assets.models;
      if (models) for (var mk in models) { var entry = models[mk]; if (entry && entry.root) scanRoot(entry.root, 'assets.models.' + mk, false); }
    } catch (e) {}
    // per-machine rig-owned resources and LOD chains (off-graph by design)
    try {
      var list = (C.machines && C.machines.list) || [];
      for (var li = 0; li < list.length; li++) {
        var m = list[li];
        if (m._rigOwned) m._rigOwned.forEach(function (res) { deep(res, 'machine._rigOwned', 1); });
        if (m._lodChain) for (var lz = 0; lz < m._lodChain.length; lz++) scanRoot(m._lodChain[lz].root, 'machine._lodChain', false);
      }
    } catch (e) {}
    try {
      var own = C.combat && C.combat.ownedResources && C.combat.ownedResources();
      if (own && own.textures) for (var ci = 0; ci < own.textures.length; ci++) note(own.textures[ci], 'combat.ownedResources');
      if (own && own.geometries) for (var cg = 0; cg < own.geometries.length; cg++) noteGeo(own.geometries[cg]);
    } catch (e) {}
    for (var si = 0; si < SUBSYS.length; si++) {
      var sys = C[SUBSYS[si]];
      if (sys && typeof sys === 'object') deep(sys, SUBSYS[si], 3);
    }
    return { tex: found, geo: geoFound };
  }

  /**
   * Textures three has uploaded that nothing in the app can reach any more.
   * They can never be disposed, so \`info.memory.textures\` can never come back
   * down: this is the exact shape of the number A90 fails on. \`holder\` is
   * where the sweep last SAW the texture, which is the finding.
   */
  function orphans() {
    var live = sweep().tex;
    var rows = [];
    texSeen.forEach(function (e, id) {
      if (live.has(id)) return;
      if (disposedTexIds.has(id)) return;          // reclaimed properly, then collected
      var t = e.ref.deref();
      if (!t) { if (e.uploaded) rows.push({ id: id, lastHolder: e.holder, owner: e.owner, state: 'collected-while-uploaded' }); return; }
      if (!uploaded(t)) return;
      rows.push({
        id: id, lastHolder: e.holder, owner: e.owner, state: 'uploaded-orphan',
        name: t.name || (t.image && t.image.width ? (t.image.width + 'x' + t.image.height) : t.type),
      });
    });
    return rows;
  }

  /**
   * WHICH textures three uploaded during a window, by where they live.
   *
   * \`info.memory.textures\` counts UPLOADS, and three uploads a texture the
   * first time something draws with it — so a counter that climbs while the
   * player walks into a part of the world nobody had drawn yet looks exactly
   * like a leak and is not one. This names the difference: a snapshot taken at
   * the start of the window records, for every texture the sweep can reach,
   * whether it was already on the GPU; comparing at the end gives the holders
   * whose textures went to the GPU LATE, separately from the ones that are new.
   */
  function uploadSnapshot() {
    var live = sweep().tex;
    var m = new Map();
    live.forEach(function (holder, id) {
      var e = texSeen.get(id);
      m.set(id, { up: e ? e.uploaded : false, holder: holder });
    });
    return m;
  }
  function uploadFlips(snap) {
    var live = sweep().tex;
    var lateByHolder = Object.create(null);
    var newByHolder = Object.create(null);
    var late = 0, fresh = 0;
    live.forEach(function (holder, id) {
      var e = texSeen.get(id);
      var nowUp = e ? e.uploaded : false;
      if (!nowUp) return;
      var was = snap.get(id);
      if (!was) { fresh++; bump(newByHolder, holder); return; }
      if (!was.up) { late++; bump(lateByHolder, was.holder); }
    });
    return { lateUploads: late, lateByHolder: lateByHolder, newUploads: fresh, newByHolder: newByHolder };
  }

  /* ---------- census ---------- */
  function bump(m, k) { m[k] = (m[k] || 0) + 1; }
  function census() {
    var live = sweep().tex;
    var byHolder = Object.create(null);
    live.forEach(function (holder) { bump(byHolder, holder); });
    var sceneObjects = 0, skinned = 0, bone = 0, sprites = 0;
    scene.traverse(function (o) {
      sceneObjects++;
      if (o.isSprite) sprites++;
      if (o.isSkinnedMesh) { skinned++; if (o.skeleton && o.skeleton.boneTexture) bone++; }
    });
    return {
      infoTextures: mem.textures, infoGeometries: mem.geometries,
      programs: renderer.info.programs ? renderer.info.programs.length : null,
      sceneObjects: sceneObjects, reachableTextures: live.size,
      unreachableUploads: mem.textures - live.size,
      boneTextures: bone, skinnedMeshes: skinned, sprites: sprites,
      byHolder: byHolder,
      domNodes: document.querySelectorAll('*').length,
      domCanvases: document.querySelectorAll('canvas').length,
      heap: performance.memory ? performance.memory.usedJSHeapSize : null,
      containers: containerCensus(),
    };
  }

  /**
   * GENERIC RETAINER CENSUS. Every Array / Map / Set one and two levels inside
   * each subsystem, by size, plus the event bus per type. A leak that is not a
   * GPU resource — an array a kill appends to and nothing drains, a listener
   * registered per machine — shows up here as a number that only goes up, with
   * the property path that holds it. Read-only.
   */
  function sizeOf(v) {
    if (Array.isArray(v)) return v.length;
    if (v instanceof Map || v instanceof Set) return v.size;
    return -1;
  }
  function containerCensus() {
    var out = Object.create(null);
    for (var i = 0; i < SUBSYS.length; i++) {
      var name = SUBSYS[i];
      var sys = C[name];
      if (!sys || typeof sys !== 'object') continue;
      var keys;
      try { keys = Object.keys(sys); } catch (e) { continue; }
      for (var j = 0; j < keys.length; j++) {
        var k = keys[j], v;
        try { v = sys[k]; } catch (e) { continue; }
        var n = sizeOf(v);
        if (n >= 0) { out[name + '.' + k] = n; continue; }
        if (v && typeof v === 'object' && !v.isObject3D && !v.isMaterial && !v.isTexture) {
          var k2;
          try { k2 = Object.keys(v); } catch (e) { continue; }
          if (k2.length > 60) continue;
          for (var z = 0; z < k2.length; z++) {
            var v2;
            try { v2 = v[k2[z]]; } catch (e) { continue; }
            var n2 = sizeOf(v2);
            if (n2 >= 0) out[name + '.' + k + '.' + k2[z]] = n2;
          }
        }
      }
    }
    try {
      var em = C.events && C.events.map;
      if (em && em.forEach) em.forEach(function (set, type) { out['events.' + type] = set.size; });
    } catch (e) {}
    return out;
  }

  /* ---------- window bookkeeping ---------- */
  function snapshotLedger() {
    var out = {};
    for (var i = 0; i < KINDS.length; i++) {
      var kind = KINDS[i];
      var L = ledger[kind];
      var o = Object.create(null);
      for (var owner in L) o[owner] = { created: L[owner].created, disposed: L[owner].disposed };
      out[kind] = o;
    }
    out._refSeq = seq;
    out._adds = Object.assign(Object.create(null), adds);
    out._removes = Object.assign(Object.create(null), removes);
    out._flux = Object.assign({}, flux);
    return out;
  }

  function inScene(o) {
    var n = o, hops = 0;
    while (n && hops < 512) { if (n === scene) return true; n = n.parent; hops++; }
    return false;
  }

  /**
   * Per-owner delta between two ledger snapshots, plus the WeakRef verdict on
   * everything allocated inside the window: still reachable? still parented
   * into the scene? under a machine that is still on the roster? and, for
   * textures, did three ever upload it (an un-uploaded texture costs no GPU
   * memory, so it cannot be what A90 is counting).
   */
  function report(from, to, reach) {
    var liveRoots = liveMachineRoots();
    var R = reach || sweep();
    var out = {};
    for (var i = 0; i < KINDS.length; i++) {
      var kind = KINDS[i];
      var a = from[kind], b = to[kind];
      var rows = {};
      for (var owner in b) {
        var c0 = a[owner] ? a[owner].created : 0;
        var d0 = a[owner] ? a[owner].disposed : 0;
        var created = b[owner].created - c0;
        var disposed = b[owner].disposed - d0;
        if (created === 0 && disposed === 0) continue;
        rows[owner] = {
          created: created, disposed: disposed, undisposed: created - disposed,
          retained: 0, uploadedHeld: 0, heldUnreachable: 0,
          attached: 0, underLiveMachine: 0, detachedRetained: 0, locs: null,
        };
      }
      var arr = refs[kind];
      for (var j = 0; j < arr.length; j++) {
        var s = arr[j];
        if (s.seq < from._refSeq || s.seq >= to._refSeq) continue;
        var row = rows[s.owner];
        if (!row) continue;
        var obj = s.r.deref();
        if (!obj) continue;
        row.retained++;
        /**
         * HELD WITH NO WAY TO GIVE IT BACK. A resource this module allocated
         * in the window, never disposed, still reachable in JS — and NOT found
         * by the reachability sweep, so nothing the app owns points at it any
         * more and no code path will ever dispose it. That is a leak.
         *
         * The distinction is the whole point. Measured on this port across
         * five runs, the same workload leaves 8-11 bone textures and 27-33
         * merged part geometries undisposed — every one of them belonging to a
         * machine that is ALIVE at the end. A bar on raw "undisposed" calls
         * that a leak;
         * it is a population, which is populationAudit()'s business and was
         * exactly the round-3 misattribution this lane exists to stop
         * repeating.
         */
        if (kind === 'textures') {
          if (!disposedOnce.has(obj) && uploaded(obj)) row.uploadedHeld++;
          if (!disposedOnce.has(obj) && !R.tex.has(obj.id)) row.heldUnreachable++;
        }
        if (kind === 'geometries' && !disposedOnce.has(obj) && !R.geo.has(obj.id)) row.heldUnreachable++;
        if (kind === 'objects') {
          var live = false, n = obj, hops = 0;
          while (n && hops < 512) { if (liveRoots.has(n)) { live = true; break; } n = n.parent; hops++; }
          if (live) row.underLiveMachine++;
          else if (inScene(obj)) row.attached++;
          else row.detachedRetained++;
        }
      }
      for (var ow in rows) {
        var src = ledger[kind][ow];
        if (!src) continue;
        rows[ow].locs = Object.keys(src.locs).sort(function (x, y) { return src.locs[y] - src.locs[x]; }).slice(0, 4);
        var vk = Object.keys(src.vias).sort(function (x, y) { return src.vias[y] - src.vias[x]; }).slice(0, 2);
        if (vk.length) rows[ow].via = vk;
      }
      out[kind] = rows;
    }
    var addRows = {};
    for (var ao in to._adds) {
      var d = to._adds[ao] - (from._adds[ao] || 0);
      var dr = (to._removes[ao] || 0) - (from._removes[ao] || 0);
      if (d || dr) addRows[ao] = { adds: d, removes: dr, net: d - dr };
    }
    out.sceneGraphCalls = addRows;
    out.cappedSamples = Object.assign({}, capped);
    out.unattributed = { adds: addsUnattributed, removes: removesUnattributed, addBudget: ADD_BUDGET };
    out.gpuFlux = {
      textureUploads: to._flux.texUp - from._flux.texUp,
      textureFrees: to._flux.texDown - from._flux.texDown,
      geometryUploads: to._flux.geoUp - from._flux.geoUp,
      geometryFrees: to._flux.geoDown - from._flux.geoDown,
    };
    return out;
  }

  /**
   * TEETH. Allocate one of every tracked kind and dispose three of them, and
   * report what the instrument saw. A gate that reports zeroes because its
   * hooks silently came off must FAIL, not pass.
   */
  function selfTest() {
    var before = snapshotLedger();
    inSelfTest = true;
    var seenTex = 0, seenGeo = 0, seenMat = 0, seenObj = 0, disposedSeen = 0, fluxSeen = 0;
    try {
      var t = anyTex ? anyTex.clone() : null;
      var g = anyGeo ? anyGeo.clone() : null;
      var mt = anyMat ? anyMat.clone() : null;
      var ob = P.objects ? new P.objects.constructor() : null;
      var after = snapshotLedger();
      var d = function (kind) {
        var x = before[kind]['(selftest)'] ? before[kind]['(selftest)'].created : 0;
        var y = after[kind]['(selftest)'] ? after[kind]['(selftest)'].created : 0;
        return y - x;
      };
      seenTex = d('textures'); seenGeo = d('geometries'); seenMat = d('materials'); seenObj = d('objects');
      var dBefore = ledger.textures['(selftest)'] ? ledger.textures['(selftest)'].disposed : 0;
      var fBefore = flux.texUp;
      // drive the counter through three's own accounting so the flux accessor
      // is proven live too, not just the constructor hook
      mem.textures = mem.textures + 1;
      fluxSeen = flux.texUp - fBefore;
      mem.textures = mem.textures - 1;
      if (t) t.dispose();
      if (g) g.dispose();
      if (mt) mt.dispose();
      var dAfter = ledger.textures['(selftest)'] ? ledger.textures['(selftest)'].disposed : 0;
      disposedSeen = dAfter - dBefore;
      if (ob) ob = null;
    } finally {
      inSelfTest = false;
    }
    var ok = seenTex >= 1 && seenGeo >= 1 && seenMat >= 1 && seenObj >= 1 && disposedSeen >= 1 && fluxSeen >= 1;
    return {
      ok: ok, texturesSeen: seenTex, geometriesSeen: seenGeo, materialsSeen: seenMat,
      objectsSeen: seenObj, texturesDisposedSeen: disposedSeen, uploadCounterSeen: fluxSeen,
      hookedPrototypes: { textures: !!P.textures, geometries: !!P.geometries, materials: !!P.materials, objects: !!P.objects },
      missing: missing,
    };
  }

  function stop() {
    for (var i = undo.length - 1; i >= 0; i--) { try { undo[i](); } catch (e) {} }
    undo.length = 0;
    Error.stackTraceLimit = prevLimit;
    for (var k = 0; k < KINDS.length; k++) refs[KINDS[k]].length = 0;
    texSeen.clear();
  }

  return {
    missing: missing, snapshotLedger: snapshotLedger, report: report,
    census: census, orphans: orphans, selfTest: selfTest, stop: stop,
    uploadSnapshot: uploadSnapshot, uploadFlips: uploadFlips, sweepAll: sweep,
  };
}
`;

/**
 * Two forced GCs with a beat between them, then read the heap. One `gc()` is
 * not enough on V8: the first pass can leave objects whose weak references are
 * only cleared on the next cycle, which is exactly the population of dead
 * machines this workload creates. `window.gc` exists only when Chrome was
 * launched with `--js-flags=--expose-gc` (tools/gates.mjs LAUNCH_ARGS), and
 * `performance.memory` is only precise with `--enable-precise-memory-info`;
 * the reading reports `forcedGc` so a number taken without them is never
 * mistaken for one taken with them.
 */
export const SETTLE_HEAP = `
async function settleHeap() {
  var forced = false;
  if (window.gc) { forced = true; window.gc(); await new Promise(function (r) { setTimeout(r, 300); }); window.gc(); }
  await new Promise(function (r) { setTimeout(r, 900); });
  return { forcedGc: forced, heap: performance.memory ? performance.memory.usedJSHeapSize : null };
}`;

/** Kill a machine through the real damage path (identical to A90's). */
const KILL = `
function kill(m) {
  var mesh = null;
  m.root.traverse(function (o) { if (!mesh && o.isMesh) mesh = o; });
  m.takeDamage({ point: m.position.clone(), object: mesh, impact: 99999, tear: 0,
    element: 'none', elementAmount: 0, dir: { x: 0, y: 0, z: 1 }, type: 'hunter', baseDamage: 99999 });
}`;

/** Sort an owner table into an array, worst first, and keep it printable. */
const TOP = `
function top(rows, key, n) {
  var out = [];
  for (var o in rows) { var r = rows[o]; r.owner = o; out.push(r); }
  out.sort(function (a, b) { return (b[key] || 0) - (a[key] || 0); });
  return out.slice(0, n || 12);
}`;

export const GATES = [
  /* ------------------------------------------- A90b-memory-attribution ---- */
  /**
   * THE DETECTOR. Runs A90's workload — 30 kills, a Watcher spawned after each,
   * the player walking between them, then the full corpse lifecycle at distance
   * — with all three instruments installed, and answers what
   * `A90-memory-stability` cannot: for each module, how much did it allocate,
   * how much did it dispose, and what is it STILL holding once every wreck has
   * been reclaimed.
   *
   * THE BAR, and why each term is defined the way it is:
   *
   *   textures    `heldUnreachable` per owner <= 4: textures this module
   *               allocated in the window that it never disposed AND that the
   *               reachability sweep can no longer find — nothing the app owns
   *               points at them, so no code path will ever dispose them.
   *               NOT raw `undisposed`: measured on this port, the same
   *               workload ends with 11 undisposed bone textures and 33
   *               undisposed merged part geometries, every one of them
   *               belonging to a machine that is ALIVE at the end. A bar on
   *               raw undisposed calls a population a leak, which is precisely
   *               the round-3 misattribution this lane exists to stop
   *               repeating. `uploadedHeld` and `undisposed` are reported
   *               beside it so the population is visible, not hidden.
   *   orphans     ZERO uploaded textures may be unreachable from everything the
   *               app owns (scene, donor models, rig-owned sets, LOD chains,
   *               combat's resources, render targets, every subsystem three
   *               levels deep). An unreachable upload can never be disposed, so
   *               it is a permanent GPU leak — the single most actionable thing
   *               this gate can find, and it names where the texture last lived.
   *               This term also catches what a per-owner table cannot: a
   *               texture allocated BEFORE the window and dropped during it.
   *   geometries  `heldUnreachable` per owner <= 20, same definition.
   *   objects     `Object3D` has no `dispose()`, so the question is different:
   *               of the objects this module allocated in the window, how many
   *               are still REACHABLE and either (a) parented into the scene
   *               but NOT under a machine still on the roster — an orphan
   *               nothing will reclaim — or (b) detached from the scene and
   *               still held in JS — a pool or an array that grew. <= 20 each.
   *               Nodes under a LIVE machine root are reported separately and
   *               never counted as a leak: that is population, which is
   *               `populationAudit()`'s job, and conflating the two is exactly
   *               what the round-3 verdict got wrong.
   *
   * SELF-TEST. Before the measured window the instrument allocates one texture,
   * geometry, material and object, drives three's own upload counter, and
   * disposes three of them; if it does not see all of that the gate FAILS with
   * `instrument-dead` and reports nothing else. A detector whose hooks came off
   * must never report a clean table.
   *
   * CADENCE. A90 spends 150 s on its kill loop and then 150 s of wall clock
   * waiting out the corpse lifecycle. This gate runs the same thirty kills at a
   * tighter cadence and then drives the lifecycle through `sites.advance()` —
   * the same hook `A43-corpse-lifecycle` and `A90-memory-stability-expansion`
   * use — so a diagnostic every lane's suite now runs costs ~100 s instead of
   * ~330 s. A90 remains the bar; this is the microscope, and its counters are
   * cross-checked against A90's in docs/ROUND4-MEMORY.md.
   */
  {
    id: 'A90b-memory-attribution', kind: 'action', lane: 'memory-attribution', timeout: 300000,
    title: 'Per-module allocation attribution across the A90 kill/respawn workload: zero unreachable GPU textures, and no module still holds > 4 textures, > 20 geometries or > 20 objects that nothing can reach after the corpse lifecycle',
    setup: INPUT_ON,
    settle: 2000,
    assert: `(async () => {
      ${MEM_INSTRUMENT}
      ${SETTLE_HEAP}
      ${KILL}
      ${TOP}
      const ctx = __CTX__;
      // the variety + expansion roster streams in behind __READY__; measuring
      // across its arrival would bill the boot loader for a leak it never had
      const tWait = performance.now();
      while (!ctx.machines.expansionReady && performance.now() - tWait < 45000) {
        await new Promise((r) => setTimeout(r, 200));
      }
      /**
       * ...and then until the GPU resource count STOPS MOVING. The deferred
       * warm-up (main.js _warmUpDeferred -> engine.warmUp) fires off the
       * same promise that sets expansionReady, so the flag is up while the
       * upload burst is still in flight. Measured on this port: warm-up
       * completes 580 ms after __READY__ and the counter is flat from there.
       * Taking the baseline inside that burst would bill the boot loader for
       * every texture the world was always going to need.
       */
      {
        const rr = ctx.renderer || ctx.engine.renderer;
        let last = -1, stable = 0, tries = 0;
        while (stable < 2 && tries++ < 40) {
          await new Promise((r) => setTimeout(r, 500));
          const now = rr.info.memory.textures;
          stable = (now === last) ? stable + 1 : 0;
          last = now;
        }
      }
      const inst = installMemInstrument();
      try {
        const self = inst.selfTest();
        if (!self.ok) {
          return { pass: false, detail: { verdict: 'instrument-dead', selfTest: self,
            note: 'the hooks did not see their own control allocations — every number this gate could report would be a false zero' } };
        }
        const h0 = await settleHeap();
        const before = inst.census();
        const upl0 = inst.uploadSnapshot();
        const l0 = inst.snapshotLedger();

        let kills = 0;
        for (let i = 0; i < 30; i++) {
          const m = (ctx.machines.list || []).find((x) => x.alive && !x._disposed && !x.docile);
          if (m) { kill(m); kills++; }
          ctx.input.keys.add('KeyW');
          await new Promise((r) => setTimeout(r, 1100));
          ctx.input.keys.delete('KeyW');
          try { ctx.machines.spawn('watcher', ctx.player.position.x + 30, ctx.player.position.z + 30); } catch (e) {}
          await new Promise((r) => setTimeout(r, 400));
        }
        const atLoopEnd = inst.census();
        const lLoop = inst.snapshotLedger();

        // the corpse lifecycle: the player leaves, and the site clock runs out
        const p0 = ctx.player.position.clone();
        ctx.player.position.set(p0.x + 260, 0, p0.z + 260);
        ctx.player._snapToGround?.();
        await new Promise((r) => setTimeout(r, 1200));
        ctx.machines.sites.advance(240, 1);
        await new Promise((r) => setTimeout(r, 2500));

        const h1 = await settleHeap();
        const afterLifecycle = inst.census();
        const l1 = inst.snapshotLedger();
        const orphanTex = inst.orphans();
        const uploadWhen = inst.uploadFlips(upl0);

        const reach = inst.sweepAll();
        const loop = inst.report(l0, lLoop, reach);
        const whole = inst.report(l0, l1, reach);

        const offenders = [];
        const skip = (o) => o === '(selftest)';
        for (const owner in whole.textures) {
          const r = whole.textures[owner];
          if (!skip(owner) && r.heldUnreachable > 4) offenders.push({ kind: 'textures/held-unreachable', owner, held: r.heldUnreachable, uploadedHeld: r.uploadedHeld, created: r.created, disposed: r.disposed, at: r.locs, via: r.via });
        }
        for (const owner in whole.geometries) {
          const r = whole.geometries[owner];
          if (!skip(owner) && r.heldUnreachable > 20) offenders.push({ kind: 'geometries/held-unreachable', owner, held: r.heldUnreachable, created: r.created, disposed: r.disposed, retained: r.retained, at: r.locs, via: r.via });
        }
        for (const owner in whole.objects) {
          const r = whole.objects[owner];
          if (skip(owner)) continue;
          if (r.attached > 20) offenders.push({ kind: 'objects/orphan-in-scene', owner, held: r.attached, created: r.created, at: r.locs, via: r.via });
          if (r.detachedRetained > 20) offenders.push({ kind: 'objects/retained-off-scene', owner, held: r.detachedRetained, created: r.created, at: r.locs, via: r.via });
        }
        if (orphanTex.length) offenders.push({ kind: 'textures/unreachable-upload', owner: 'see orphanedTextures', held: orphanTex.length });

        const heapDelta = (h0.heap && h1.heap) ? +(((h1.heap - h0.heap) / h0.heap) * 100).toFixed(1) : null;
        const dmap = (a, b) => {
          const d = {};
          for (const k of new Set(Object.keys(a).concat(Object.keys(b)))) { const v = (b[k] || 0) - (a[k] || 0); if (v) d[k] = v; }
          return d;
        };

        return {
          pass: offenders.length === 0,
          detail: {
            kills, selfTest: self, offenders,
            orphanedTextures: orphanTex.slice(0, 20),
            heap: { forcedGc: h0.forcedGc, beforeBytes: h0.heap, afterBytes: h1.heap, growthPct: heapDelta },
            counters: {
              before: { tex: before.infoTextures, geo: before.infoGeometries, objs: before.sceneObjects, reachableTex: before.reachableTextures, unreachableUploads: before.unreachableUploads, boneTex: before.boneTextures, domNodes: before.domNodes, domCanvases: before.domCanvases },
              atLoopEnd: { tex: atLoopEnd.infoTextures, geo: atLoopEnd.infoGeometries, objs: atLoopEnd.sceneObjects, reachableTex: atLoopEnd.reachableTextures, unreachableUploads: atLoopEnd.unreachableUploads, boneTex: atLoopEnd.boneTextures, domNodes: atLoopEnd.domNodes, domCanvases: atLoopEnd.domCanvases },
              afterLifecycle: { tex: afterLifecycle.infoTextures, geo: afterLifecycle.infoGeometries, objs: afterLifecycle.sceneObjects, reachableTex: afterLifecycle.reachableTextures, unreachableUploads: afterLifecycle.unreachableUploads, boneTex: afterLifecycle.boneTextures, domNodes: afterLifecycle.domNodes, domCanvases: afterLifecycle.domCanvases },
            },
            gpuFlux: { wholeRun: whole.gpuFlux, loopOnly: loop.gpuFlux },
            uploadWhen,
            textureHolderDelta: dmap(before.byHolder, afterLifecycle.byHolder),
            containerDelta: dmap(before.containers, afterLifecycle.containers),
            byOwner: {
              textures: top(whole.textures, 'heldUnreachable'),
              geometries: top(whole.geometries, 'heldUnreachable'),
              materials: top(whole.materials, 'undisposed', 8),
              objects: top(whole.objects, 'attached'),
            },
            sceneGraphCalls: whole.sceneGraphCalls,
            sampling: { capped: whole.cappedSamples, unattributed: whole.unattributed },
            populationAudit: ctx.machines.populationAudit ? ctx.machines.populationAudit() : null,
            sitesAudit: ctx.machines.sites ? ctx.machines.sites.audit() : null,
            note: 'uploadedHeld = allocated in the window, uploaded to the GPU by three, never disposed. gpuFlux splits info.memory movement into uploads and frees, because a single delta cannot tell a new draw from a leak. orphanedTextures are uploads nothing can reach any more: they can never be disposed and are a permanent GPU leak.',
          },
        };
      } finally {
        inst.stop();
      }
    })()`,
  },
];
