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
 * Shipped tier `high`, DPR 1.25, 1600x900 CSS px (2000x1125 device px),
 * CSM 3 x 2048^2, staged fight. Bytes per owner as engine.renderTargetLedger()
 * reports them (the bloom mip chain collapsed into one row, as the docs table
 * does), cross-checked against the GL allocation calls by A-rt-ledger-census.
 * Regenerate from the census detail (`liveByOwner`); never edit by hand.
 */
export const RT_LEDGER = Object.freeze({
  measured: '2026-10-16, port 5251, tier high, DPR 1.25, 1600x900, CSM 3x2048; env row with the PMREM depth renderbuffer',
  unit: 'bytes (1 MB = 1e6)',
  rows: Object.freeze({
    'post:scene': 135000000,
    'post:pingA': 18000000,
    'post:pingB': 18000000,
    'post:GTAOPass.gtaoRenderTarget': 6756000,
    'post:GTAOPass.pdRenderTarget': 6756000,
    'post:UnrealBloomPass.bloom-chain': 10130880,
    'post:SMAAPass.edgesRT': 18000000,
    'post:SMAAPass.weightsRT': 18000000,
    'shadow:csm[0]': 33554432,
    'shadow:csm[1]': 33554432,
    'shadow:csm[2]': 33554432,
    'env:environment': 9437184,
  }),
});
