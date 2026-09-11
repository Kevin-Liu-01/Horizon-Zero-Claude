(async () => {
  const __CTX__ = window.__CTX__;
  const _t0 = performance.now();
  while (!__CTX__.machines?.varietyReady && performance.now() - _t0 < 25000) {
    await new Promise(r => setTimeout(r, 150));
  }
  
  const __stage = (() => {
    const ctx = __CTX__;
    const machines = () => (ctx.machines?.list || []).filter((m) => m.alive);
    const groundY = (x, z) => {
      const y = ctx.terrain?.getHeight?.(x, z);
      return Number.isFinite(y) ? y : 0;
    };
    /** Every machine back on its spawn point, calm, with a fixed heading. */
    const resetAll = () => {
      machines().forEach((m, i) => {
        if (m.spawnPos) m.position.set(m.spawnPos.x, m.spawnPos.y, m.spawnPos.z);
        m.position.y = groundY(m.position.x, m.position.z);
        m.heading = (i * 0.61) % (Math.PI * 2);
        // Do NOT null lastKnown: watcher.js:466 copies it unconditionally once
        // the machine is in attack, and a null there throws inside
        // Machines.update every frame (the guarded loop survives it, but a
        // throwing update is not a scene worth measuring). Reported to
        // machine-ai as a missing null guard.
        try { m.state = 'patrol'; m.suspicion = 0; } catch (e) { /* machine-ai owns these */ }
      });
    };
    /** Spawn order is fixed by the world seed, so slice(0, n) is stable. */
    const pick = (kind, n) => machines().filter((m) => m.kind === kind).slice(0, n);
    const place = (m, x, z, heading) => {
      m.position.set(x, groundY(x, z), z);
      m.heading = heading;
      try { m._speed = 0; } catch (e) { /* optional */ }
    };
    const lookAt = (x, z) => {
      const p = ctx.player;
      p.camYaw = Math.atan2(x - p.position.x, z - p.position.z) + Math.PI;
    };
    const pinAll = () => {
      const snap = machines().map((m) => ({
        m, x: m.position.x, y: m.position.y, z: m.position.z, h: m.heading,
      }));
      const p = ctx.player;
      const pp = { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.camYaw, pitch: p.camPitch };
      const fn = () => {
        for (let i = 0; i < snap.length; i++) {
          const s = snap[i];
          s.m.position.set(s.x, s.y, s.z);
          s.m.heading = s.h;
        }
        p.position.set(pp.x, pp.y, pp.z);
        p.camYaw = pp.yaw;
        p.camPitch = pp.pitch;
      };
      ctx.engine.onAfterRender.push(fn);
      return () => {
        const i = ctx.engine.onAfterRender.indexOf(fn);
        if (i >= 0) ctx.engine.onAfterRender.splice(i, 1);
      };
    };
    return { machines, resetAll, pick, place, lookAt, pinAll, groundY };
  })();

  const unpin = (() => {
    // Deterministic: staged on the flat ground at spawn so the scenario cannot
    // inherit whatever biome the previous one left us in, and the cast is one
    // of each species (topped up from the roster) so it is the same eight
    // machines on every run regardless of list-order churn.
    //
    // FIX ROUND 1: they used to be placed on a full ring around the player, so
    // five of the eight were behind the camera and never rendered — the gate
    // called it an eight-machine fight and measured three. They are staged in
    // a forward arc now, +-38 degrees (the camera's horizontal half-FOV at
    // 55 deg vertical / 16:9 is 42 deg), 9-17 m out in two ranks, so all eight
    // are inside the frustum. That is a strictly heavier frame than the ring
    // was; see shots/perf-staged-fight.png.
    __stage.resetAll();
    const p = __CTX__.player;
    p.position.set(0, 0, 0); p.camPitch = 0.05; p._snapToGround?.();
    p.camYaw = Math.PI;
    // camera forward for camYaw: (-sin, -cos) — see player.js _updateCamera
    const fx = -Math.sin(p.camYaw), fz = -Math.cos(p.camYaw);
    const order = ['thunderjaw', 'sawtooth', 'behemoth', 'longleg', 'watcher', 'strider', 'scrapper', 'glinthawk'];
    const seen = new Set(); const cast = [];
    for (const k of order) { const m = __stage.pick(k, 1)[0]; if (m && !seen.has(m)) { cast.push(m); seen.add(m); } }
    for (const m of __stage.machines()) { if (cast.length >= 8) break; if (!seen.has(m)) { cast.push(m); seen.add(m); } }
    cast.slice(0, 8).forEach((m, i) => {
      const spread = (i - 3.5) / 3.5;                 // -1 .. 1 across the arc
      const a = Math.atan2(fx, fz) + spread * 0.66;   // +-38 degrees of forward
      const r = 9 + (i % 2) * 5.5 + (i % 4) * 1.1;    // two ranks, 9-17 m
      __stage.place(m, p.position.x + Math.sin(a) * r, p.position.z + Math.cos(a) * r, a + Math.PI);
      // A machine in the attack state reads lastKnown every frame; give it one.
      try {
        m.lastKnown = (m.lastKnown && m.lastKnown.copy) ? m.lastKnown.copy(p.position) : p.position.clone();
        m.state = 'attack'; m.alerted = true; m.suspicion = 1;
      } catch (e) { /* machine-ai owns these */ }
    });
    return __stage.pinAll();
  })();
  for (let i = 0; i < 40; i++) await new Promise(r => requestAnimationFrame(r));
  const out = {};
  const cam = __CTX__.camera;
  for (const m of (__CTX__.machines?.list || [])) {
    if (!m.alive) continue;
    const d = Math.hypot(cam.position.x - m.position.x, cam.position.z - m.position.z);
    if (d > 60) continue;
    const rows = [];
    m.root.updateMatrixWorld(true);
    m.root.traverse((o) => {
      if (!o.isMesh) return;
      let vis = true, n = o;
      while (n) { if (n.visible === false) { vis = false; break; } n = n.parent; }
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      rows.push({ name: o.name || '(unnamed)', parent: o.parent?.name || '?', vis,
                  skinned: !!o.isSkinnedMesh, mat: mat ? (mat.name || mat.type) + '#' + mat.id : '-',
                  groups: o.geometry?.groups?.length || 0,
                  noHull: !!o.userData.noHull, hiddenSculpt: !!o.userData.hiddenSculpt,
                  lodHidden: !!o.userData.lodHidden, shell: !!o.userData.shell });
    });
    out[m.kind] = { dist: +d.toFixed(1), H: +m.height.toFixed(2), tier: m._lodTier,
                    visible: rows.filter(r => r.vis).length, total: rows.length,
                    parts: (m.parts||[]).map(p => ({ n: p.name, tearHp: p.tearHp, weak: !!p.weak, el: p.elemental||null, vis: p.mesh.visible, att: p.attached })),
                    rows: rows.filter(r => r.vis) };
  }
  const info = __CTX__.engine.renderer.info.render;
  unpin();
  return { calls: info.calls, out };
})()
