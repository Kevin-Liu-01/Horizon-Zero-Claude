/**
 * M1a regfix 3 (hero-anim) — A104's own run with a probe on the melee layer's last pass (`postFix`), for
 * `session.mjs --extra-rows` (not a gate: the grade is A104's, untouched). Each rendered frame where the haft ends
 * nearer her head/neck/spine than 0.135 m, or the forearm nearer the spine than 0.11 m, records the haft's axial gap
 * at each step of `postFix` (as it came in, after the hand guard `_handOffSelf`, after the hull pass `_armHullFinal`,
 * after the left hand's re-seat, and the final) and the stance, phase and nearest bone, so the pass that leaves the
 * haft (or the arm) near her is named. With the studio taken out first (kept-stack `NO_STUDIO`).
 */
import { NO_STUDIO } from '../kept-stack.mjs';
import { GATES as KEPT } from './kept-rows.mjs';

const src = KEPT.find((g) => g.id === 'A104-melee-self-clear');
const HOOK = `(() => {
  const an = window.__CTX__.player.animator, L = an?.melee;
  if (!L || L.__probe) return;
  L.__probe = true; window.__a104 = [];
  let st = null;
  const gap = () => (L._held ? +L._shaftGap(true).toFixed(4) : null);
  const H = L._handOffSelf.bind(L), A = L._armHullFinal.bind(L), R = L._reseatLeft.bind(L), F = L.postFix.bind(L);
  L._handOffSelf = (a, e) => { if (st) st.inHand = gap(); H(a, e); if (st) st.afterHand = gap(); };
  L._armHullFinal = (a) => { A(a); if (st) { st.afterHull = gap(); st.hullCode = L._dbg.armHullFinal ?? null; } };
  L._reseatLeft = () => { R(); if (st) st.afterReseat = gap(); };
  L.postFix = () => {
    st = { f: window.__CTX__.renderer?.info?.render?.frame ?? 0, stance: L._dbg.stance, phase: L._dbg.phase, beat: L._dbg.beat ?? null, w: +(L.w ?? 0).toFixed(2), guardOn: !!L._guardOn, held: !!L._held };
    st.inPost = gap();
    F();
    st.final = L._held ? +L._dbg.shaftClear.toFixed(4) : null;
    st.hairGuard = L._dbg.hairClearGuard != null ? +(+L._dbg.hairClearGuard).toFixed(4) : null;
    st.fore = L._dbg.forearmToSpine != null ? +(+L._dbg.forearmToSpine).toFixed(4) : null;
    if ((st.final != null && st.final < 0.135) || (st.inPost != null && st.inPost < 0.12) || (st.fore != null && st.fore < 0.11)) {
      if (window.__a104.length < 120) window.__a104.push(st);
    }
    st = null;
  };
})()`;
export const GATES = src ? [{ ...src, id: 'A104-probe', timeout: 150000,
  setup: `${NO_STUDIO}; ${src.setup || ''}; ${HOOK};`,
  assert: `(async () => { const r = await ${src.assert}; return { pass: r?.pass ?? null, detail: { ...(r?.detail && typeof r.detail === 'object' ? r.detail : { raw: r?.detail }), probe: window.__a104 || null } }; })()` }] : [];
