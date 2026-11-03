/**
 * THE MEASURED RENDER-TARGET LEDGER (gate A-rt-ledger; owner: engine-gpu).
 *
 * A LEAF MODULE ON PURPOSE: no imports, so any module can re-export it without
 * an import cycle. tools/budgets.mjs (gates-perf) records it with
 *
 *   export { RT_LEDGER } from './r5-probes/rt-ledger.mjs';
 *
 * and tools/gates.r5.engine-gpu.mjs imports it from here. (Re-exporting it from
 * the lane gate file instead would close a cycle — that file imports
 * budgets.mjs — and break the gate runner: fix-round-2 judge finding.)
 *
 * The SHIPPED DEFAULT TIER after the W0b decision (`high`: SMAA-only, GTAO at
 * quarter resolution, SMAA targets RGBA8, CSM 2048 + 2 x 1024; fix round 1:
 * the direct post topology — no resolve copy, renderTarget2 holds the
 * grade's RGBA8 output, postTarget released), DPR 1.25 (a DPR-2 display
 * under the tier's 1.25 cap), 1600x900 CSS px (2000x1125 device px), staged
 * fight. Bytes per owner as engine.renderTargetLedger() reports them (the
 * bloom mip chain collapsed into one row, as the docs table does; an owner
 * that is not allocated reads 0), cross-checked against the GL allocation
 * calls by A-rt-ledger-census. Regenerate from the census detail
 * (`liveByOwner`); never edit by hand.
 * W0a (Round-4 tier, 340,743,360 B) is in docs/ROUND5-ENGINE.md §1.3.
 */
export const RT_LEDGER = Object.freeze({
  measured: '2026-10-19 (W0b fix round 1), port 5251, shipped tier high, DPR 1.25, 1600x900, CSM 2048/1024/1024, direct post topology; env row with the PMREM depth renderbuffer',
  unit: 'bytes (1 MB = 1e6)',
  rows: Object.freeze({
    'post:scene': 27000000,
    'post:pingA': 9000000,
    'post:pingB': 0,
    'post:GTAOPass.gtaoRenderTarget': 1686000,
    'post:GTAOPass.pdRenderTarget': 1686000,
    'post:UnrealBloomPass.bloom-chain': 10130880,
    'post:SMAAPass.edgesRT': 9000000,
    'post:SMAAPass.weightsRT': 9000000,
    'shadow:csm[0]': 33554432,
    'shadow:csm[1]': 8388608,
    'shadow:csm[2]': 8388608,
    'env:environment': 9437184,
  }),
});
