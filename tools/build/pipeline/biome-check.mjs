/**
 * A-poc-promoted, dynamic half (pipeline lane, W0b): after the ?poc=human and
 * ?poc=creature removal, `?poc=biome` must still serve A-gpu-tier's vista.
 *
 * Serves THIS tree (its real path; Vite in middleware mode on a unix socket,
 * dep cache in scratch — nothing is written into the tree) and drives ONE
 * headless Chrome (tools/build/pipeline/specs-fixture.mjs serveAndRun, the
 * same preflight + semaphore path): load `/?shot=1&poc=biome`, wait for
 * `__R5BIOME_READY__`, read `__R5BIOME__.stats()`. Pass: the landmark and the
 * Tillers are in the scene (both r5-poc GLBs loaded), ground + scatter built,
 * 0 console errors. Run in a child so its Chrome holds its own ticket:
 *
 *   node tools/build/pipeline/biome-check.mjs --scratch <dir> [--port <p>]   -> one JSON line
 */
import os from 'node:os';
import path from 'node:path';
import { mkdirSync, rmSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serveAndRun, preflight } from './specs-fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const BIOME_ASSERT = `(() => {
  const B = window.__R5BIOME__;
  if (!B) return { pass: false, detail: { error: '__R5BIOME__ missing' } };
  const s = B.stats();
  const ring = s.bytes['sounding-ring.glb'] || 0, tiller = s.bytes['tiller.glb'] || 0;
  const pass = s.landmarkTris > 0 && s.tillerTris > 0 && s.patch.terrainTris > 0 && ring > 0 && tiller > 0;
  return { pass, detail: { landmarkTris: s.landmarkTris, tillerTris: s.tillerTris, terrainTris: s.patch.terrainTris,
    scatter: s.scatter, bytes: s.bytes, buildMs: s.buildMs, memory: s.memory } };
})()`;

export async function biomeCheck({ root = ROOT, scratch, port = 0, waitMs = 180000 } = {}) {
  const t0 = Date.now();
  let pf = preflight(root);
  while (!pf.ok && Date.now() - t0 < waitMs) { await new Promise((r) => setTimeout(r, 10000)); pf = preflight(root); }
  if (!pf.ok) return { pass: null, detail: { pending: 'preflight refused to launch Chrome (plan §0 rule 8)', preflight: pf } };
  mkdirSync(scratch, { recursive: true });
  const cacheDir = path.join(realpathSync(scratch), `biome-vite-cache-${process.pid}`);
  const sock = path.join(os.tmpdir(), `cal-bc-${process.pid}.sock`);
  const detail = { preflight: pf };
  try {
    const [g] = await serveAndRun(realpathSync(root), [{ id: 'poc-biome-serves', params: 'poc=biome', ready: 'window.__R5BIOME_READY__ === true', settle: 1500, timeout: 30000, assert: BIOME_ASSERT }],
      { port, sock, cacheDir, onProbe: (p) => { detail.viteProbe = p; } });
    detail.gate = g;
    return { pass: g.pass === true, detail };
  } catch (err) {
    detail.error = String(err?.stack || err).slice(0, 500);
    return { pass: false, detail };
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
    rmSync(sock, { force: true });
    detail.ms = Date.now() - t0;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const val = (f, d = null) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : d; };
  const res = await biomeCheck({ scratch: val('--scratch', path.join(os.tmpdir(), 'calima-r5-scratch', 'pipeline')), port: Number(val('--port', 0)) });
  process.stdout.write(`${JSON.stringify(res)}\n`, () => process.exit(0));
}
