import SHELL from '../game/text/ui/shell.json';

/**
 * THE UNSUPPORTED-BROWSER PAGE (M1.6g2; BIBLE 18 "Unsupported browser": a plain page when WebGL 2 or a needed
 * extension is missing; `CALIMA NEEDS WEBGL 2` and what to try).
 *
 *   webglSupport() -> { ok, missing: [] }   probes a throwaway canvas: WebGL 2, and a float colour buffer
 *                                           (EXT_color_buffer_float or EXT_color_buffer_half_float: the engine's
 *                                           HDR targets). The probe context is released at once.
 *   showUnsupported(sup)                    replaces the loading sheet with the plain page
 *
 * `main.js` calls both before the engine is built. `?unsupported=1` shows the page on a capable browser (the filmer).
 */
export function webglSupport() {
  const missing = [];
  let gl = null;
  try {
    const c = document.createElement('canvas');
    gl = c.getContext('webgl2');
  } catch { gl = null; }
  if (!gl) return { ok: false, missing: ['WebGL 2'] };
  if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) {
    missing.push('EXT_color_buffer_float');
  }
  try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* the probe is dropped anyway */ }
  return { ok: missing.length === 0, missing };
}

export function showUnsupported(sup = { missing: ['WebGL 2'] }) {
  const U = SHELL.unsupported;
  for (const id of ['loading', 'title', 'hud']) document.getElementById(id)?.classList.add('hidden');
  const page = document.createElement('main');
  page.id = 'cal-unsupported';
  const style = document.createElement('style');
  style.textContent = `
#cal-unsupported { position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center;
  background: #16141F; color: #F1EEE6; }
#cal-unsupported .u-in { width: min(620px, 86vw); }
#cal-unsupported h1 { margin: 0 0 14px; font: 600 34px/1.1 'Chakra Petch', 'Arial Narrow', sans-serif; letter-spacing: 0.14em; }
#cal-unsupported p { margin: 0 0 18px; font: 400 14px/1.55 'IBM Plex Mono', ui-monospace, monospace; color: rgba(241, 238, 230, 0.66); }
#cal-unsupported ol { margin: 0; padding: 0; list-style: none; border-top: 1px solid rgba(241, 238, 230, 0.16); }
#cal-unsupported li { display: grid; grid-template-columns: 30px 1fr; padding: 9px 0 8px; border-bottom: 1px solid rgba(241, 238, 230, 0.16);
  font: 400 14px/1.5 'IBM Plex Mono', ui-monospace, monospace; }
#cal-unsupported li b { font-weight: 500; color: rgba(241, 238, 230, 0.66); }`;
  page.appendChild(style);
  const inner = document.createElement('div');
  inner.className = 'u-in';
  const h = document.createElement('h1');
  h.textContent = U.line;
  inner.appendChild(h);
  const p = document.createElement('p');
  p.textContent = U.missing.replace('{what}', (sup.missing?.length ? sup.missing : ['WebGL 2']).join(', '));
  inner.appendChild(p);
  const ol = document.createElement('ol');
  U.try.forEach((t, i) => {
    const li = document.createElement('li');
    const b = document.createElement('b');
    b.textContent = String(i + 1);
    li.appendChild(b);
    li.appendChild(document.createTextNode(t));
    ol.appendChild(li);
  });
  inner.appendChild(ol);
  page.appendChild(inner);
  document.body.appendChild(page);
  document.body.classList.add('cal-unsupported');
  window.__UNSUPPORTED__ = { missing: sup.missing ?? [] };
  return page;
}
