/**
 * THE GATE TURNTABLE (M0.12): the stage the kept-stack rows use instead of the photo studio.
 *
 * Page-context prelude (splice it into an async gate body). It defines `TT`, a small stage that
 * owns three things and gives each back on `TT.exit()`:
 *
 *   time    `TT.freeze()` / `TT.thaw()` speak through the engine's ONE time authority
 *           (`engine.requestTimeScale`) on its top-priority source, read from the engine's own
 *           order, so the freeze outranks hitstop, concentration and legacy writes.
 *   lens    `TT.lens({ pos, look, fov })` writes the camera after every system has run
 *           (a stage system appended LAST to the frame's system list, `interpolate` phase),
 *           so it wins the frame the way a fixed turntable camera does.
 *   hold    `TT.hold(machine, state)` keeps a machine in a sustained state through the
 *           entity's own published contract: `machine.forceState(name)` plus the perception
 *           fields that call documents (suspicion, `_unseenT`, `lastKnown`, the leash anchor).
 *           The hold re-pins those fields every SIM step and re-issues `forceState` only when
 *           the state drifts; `TT.release()` puts the anchor back and hands the machine to its AI.
 *
 * Nothing here imports or reads `src/studio/**`. The kept-stack runner (`--kept-stack`) also
 * removes the studio system from the frame and traps `ctx.studio` before each row runs, so a row
 * that still reached for the studio fails on that alone (tools/gates/kept-stack.mjs).
 */

export const TURNTABLE = `
  const TT = (() => {
    const ctx = __CTX__, G = __GAME__, e = ctx.engine;
    const source = (e && e._tsOrder && e._tsOrder[0]) || 'studio';
    const st = { on: false, lens: null, hold: null, inputWas: null, fovWas: null };
    const pin = (m, state) => {
      const p = ctx.player;
      if (state === 'attack' || state === 'alert') {
        m.suspicion = 1; m._unseenT = 0;
        if (p && m.lastKnown) m.lastKnown.copy(p.position);
      } else if (state === 'search') m.suspicion = 0.5;
      else if (state === 'suspicious') { m.suspicion = 0.6; m._unseenT = 0; }
      else if (state === 'patrol') m.suspicion = 0;
    };
    const system = {
      name: 'GateTurntable',
      update(dt) {
        const h = st.hold;
        if (!h) return;
        const m = h.machine;
        if (!m || m._disposed || !m.alive) { api.release(); return; }
        h.t += dt;
        pin(m, h.state);
        if (m.state !== h.state) { h.reforced++; m.forceState(h.state); }
      },
      interpolate() {
        const L = st.lens;
        if (!L) return;
        const cam = ctx.camera;
        if (L.pos) cam.position.copy(L.pos);
        if (L.quat) cam.quaternion.copy(L.quat);
        else if (L.look) cam.lookAt(L.look);
        if (L.fov != null && cam.fov !== L.fov) cam.fov = L.fov;
        cam.updateProjectionMatrix();
        cam.updateMatrixWorld();
      },
    };
    const api = {
      source,
      get active() { return st.on; },
      get timeScale() { return e.timeScaleSources()[source]; },
      enter({ input = false } = {}) {
        if (st.on) return true;
        st.on = true;
        st.inputWas = ctx.input.enabled;
        st.fovWas = ctx.camera.fov;
        if (!input) ctx.input.enabled = false;
        G.systems.push(system);
        return true;
      },
      /** Hold the camera where it is now (pose and orientation); only the fov is the stage's. */
      lensHere(fov) {
        const cam = ctx.camera;
        st.lens = { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: fov ?? cam.fov };
        return st.lens;
      },
      lens({ pos, look, fov } = {}) {
        st.lens = { pos: pos ? pos.clone() : null, look: look ? look.clone() : null, quat: null, fov: fov ?? null };
        return st.lens;
      },
      setFov(fov) { if (st.lens) st.lens.fov = fov; },
      freeze() { e.requestTimeScale(source, 0); return e.timeScale; },
      thaw() { e.requestTimeScale(source, null); return e.timeScale; },
      hold(m, state) {
        api.release();
        if (!m || typeof m.forceState !== 'function') return { ok: false, detail: 'machine has no forceState' };
        const home = m.spawnPos ? m.spawnPos.clone() : null;
        if (m.spawnPos) m.spawnPos.set(m.position.x, m.spawnPos.y, m.position.z);
        st.hold = { machine: m, state, home, t: 0, reforced: 0 };
        pin(m, state);
        m.forceState(state);
        return { ok: true, state: m.state };
      },
      release() {
        const h = st.hold;
        if (!h) return;
        if (h.home && h.machine && h.machine.spawnPos) h.machine.spawnPos.copy(h.home);
        st.hold = null;
      },
      debug() {
        const h = st.hold;
        return { source, ts: e.timeScale, sources: e.timeScaleSources(), lens: !!st.lens,
          hold: h ? { state: h.state, held: +h.t.toFixed(2), reforced: h.reforced } : null };
      },
      exit() {
        api.release();
        api.thaw();
        st.lens = null;
        const i = G.systems.indexOf(system);
        if (i >= 0) G.systems.splice(i, 1);
        if (st.inputWas !== null) ctx.input.enabled = st.inputWas;
        if (st.fovWas !== null) { ctx.camera.fov = st.fovWas; ctx.camera.updateProjectionMatrix(); }
        st.on = false;
      },
    };
    return api;
  })();
`;
