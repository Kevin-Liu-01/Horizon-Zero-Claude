// M3 wave 3c, area B: THE SCAR ROAD BY INPUT, and leg 6's 'scar-flight' driver ("home down the 7 posts"; the hour-two
// runner, tools/gates/systems/hour-two.mjs, takes it through glass-line-drive.mjs's DRIVE4, so area E's file is not
// touched). Keys held and released and the look turned as a mouse turns it; nothing writes a position, a stage or a count.
//   pillarLaunch(page, K, id, bearing, maxS)   to the foot of a trig pillar's steps on foot, up its three 1 m steps
//                                              (W and Space: the mantle), across the deck by input to a start on the
//                                              run-off's side (PILLAR_RUN), the run, the jump, Space at 0.42 s airborne
//                                              and every 0.1 s while it has not opened
//   FLY_ROAD (in the page)                     A and D on the pilot's bearing (src/game/kite/pilot.js, the hand the Node
//                                              rows fly): the track on each post in turn, a post passed when her ground
//                                              track comes within POST_PASS_M of it; then home onto the road's landing
//                                              field (toField: the track, the orbit while there is height to lose, the
//                                              final) until her feet are down (the landing is the law's)
//   DRIVE6['scar-flight']                      T3's top (R4: the Scar road's launch is T3 on Rust Cone), the seven posts,
//                                              down on SCAR_FIELD; 'kite:land' then carries near: 'scar-foot', the
//                                              quest's event
// Kevin's bars are read on every frame the kite is out or being stowed (glass-line-drive.mjs BARS_INSTALL).
import * as SH from '../systems/slice-hour.mjs';
import { WIND_ROADS, ROAD_LAUNCH, POST_PASS_M, SCAR_FIELD } from '../../../src/game/kite/roads.js';
import { dirBearing } from '../../../src/game/kite/flight.js';
import { TRIG } from '../../../src/world/island/sites.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** In the page: the pillar record (survey.js: deck height, yaw, the steps' direction). */
const PILLAR = (id) => { const p = (window.__CTX__.props?.survey?.pillars || []).find((q) => q.id === id); return p ? { id, x: p.x, z: p.z, deck: p.deck, yaw: p.yaw, d: p.stepsDir } : null; };

/**
 * In the page: across the deck to the run-off start, then the run, the jump and the open. The start is 0.75 m ahead of the
 * pillar's centre on the bearing (the observing head, r 0.34 m, behind her; the drum's edge 1.0 m ahead), to the side of
 * the run-off line away from the mast (survey.js: local (-1.15, -0.75), turned by the pillar's yaw), reached round the
 * head on that side. At 7d5d0dd (leg 4) the start was 1.0 m BEHIND the centre and the run was checked at the head: she
 * moved 0.1 m and the kite opened on the deck.
 */
export const PILLAR_RUN = async ({ x, z, deck, yaw, bearing, openAfter = 0.42 }) => {
  const C = window.__CTX__, p = C.player, E = C.engine;
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  const frame = () => new Promise((res) => requestAnimationFrame(res));
  const frames = async (n) => { for (let i = 0; i < n; i++) await frame(); };
  const waitSim = async (s) => { const t0 = E.simTime, w0 = performance.now(); while (E.simTime - t0 < s && performance.now() - w0 < 20000) await frame(); };
  const br = bearing * Math.PI / 180, dx = Math.sin(br), dz = -Math.cos(br), rx = -dz, rz = dx;   // the track, and its right
  const c = Math.cos(yaw), s = Math.sin(yaw), mast = { x: x + -1.15 * c + -0.75 * s, z: z - -1.15 * s + -0.75 * c };
  const segD = (q) => { // the mast's distance from the run-off line from q, 2 m along the track
    const vx = dx * 2, vz = dz * 2, t = Math.max(0, Math.min(1, ((mast.x - q.x) * vx + (mast.z - q.z) * vz) / 4));
    return Math.hypot(mast.x - q.x - vx * t, mast.z - q.z - vz * t);
  };
  let best = null;
  for (const side of [0, 0.5, -0.5]) { const q = { x: x + dx * 0.75 + rx * side, z: z + dz * 0.75 + rz * side, side }; const m = segD(q); if (!best || m > best.m + 0.05) best = { ...q, m }; }
  const sgn = best.side !== 0 ? Math.sign(best.side) : ((mast.x - x) * rx + (mast.z - z) * rz > 0 ? -1 : 1);
  const via = [{ x: x + rx * 0.95 * sgn - dx * 0.3, z: z + rz * 0.95 * sgn - dz * 0.3 }, { x: x + rx * 0.95 * sgn + dx * 0.4, z: z + rz * 0.95 * sgn + dz * 0.4 }, best];
  const walked = [];
  for (const q of via) {
    const w0 = performance.now();
    key('KeyW', true);
    while (performance.now() - w0 < 6000) {
      const ddx = q.x - p.position.x, ddz = q.z - p.position.z, d = Math.hypot(ddx, ddz);
      if (d < 0.22 || p.position.y < deck - 0.5) break;
      p.camYaw = -Math.atan2(ddx, -ddz);
      await frame();
    }
    key('KeyW', false);
    await frames(12);
    walked.push({ d: +Math.hypot(q.x - p.position.x, q.z - p.position.z).toFixed(2), y: +(p.position.y - deck).toFixed(2) });
    if (p.position.y < deck - 0.5) return { onDeck: false, walked };
  }
  p.camYaw = -br;
  await frames(10);
  const from = { x: +p.position.x.toFixed(2), z: +p.position.z.toFixed(2), aheadOfCentre: +((p.position.x - x) * dx + (p.position.z - z) * dz).toFixed(2), mastClearM: +best.m.toFixed(2) };
  key('KeyW', true);
  await waitSim(0.12);
  key('Space', true); await frames(2); key('Space', false);
  const w1 = performance.now();
  while (p.grounded && performance.now() - w1 < 3000) await frame();
  const air0 = E.simTime, leave = { x: p.position.x, z: p.position.z };
  await waitSim(openAfter);
  const presses = [];
  for (let i = 0; i < 13 && p.flight === 'none' && !p.grounded; i++) {
    key('Space', true); await frames(2); key('Space', false);
    presses.push(+(E.simTime - air0).toFixed(3));
    await frames(1);
    if (p.flight !== 'none') break;
    await waitSim(0.1);
  }
  key('KeyW', false);
  const o = p.kitePilot?.last?.open;
  return { onDeck: true, walked, from, presses, flight: p.flight, refused: p.kitePilot?.last?.refused ?? null,
    movedBeforeOpenM: o ? +Math.hypot(o.x - from.x, o.z - from.z).toFixed(2) : null, offDeckM: o ? +Math.hypot(o.x - x, o.z - z).toFixed(2) : null, leftDeckAt: { x: +leave.x.toFixed(2), z: +leave.z.toFixed(2) } };
};

/** On foot to a pillar's steps, up them, and the run off its deck on `bearing` (the open by input). */
export async function pillarLaunch(page, K, id, bearing, maxS) {
  const P = await page.evaluate(PILLAR, id);
  if (!P) return { ok: false, why: `no ${id} pillar record (props.survey.pillars)` };
  const foot = { x: P.x + P.d.x * 6.4, z: P.z + P.d.z * 6.4 };
  const w = await SH.walkPath(page, K, foot, 0.8, { maxS });
  await page.evaluate((x, z) => { const p = window.__CTX__.player; p.camYaw = Math.atan2(-(x - p.position.x), -(z - p.position.z)); }, P.x, P.z);
  await K.down('KeyW');
  let y = null;
  for (let i = 0; i < 16; i++) { await K.tap('Space', 90); await sleep(450); y = await page.evaluate(() => window.__CTX__.player.position.y); if (y >= P.deck - 0.3) break; }
  await K.up('KeyW');
  if (!(y >= P.deck - 0.3)) return { ok: false, walk: { ok: w.ok, why: w.why ?? null }, climbed: false, y, deck: P.deck };
  const run = await page.evaluate(PILLAR_RUN, { x: P.x, z: P.z, deck: P.deck, yaw: P.yaw, bearing });
  return { ok: run.flight !== 'none', walk: { ok: w.ok, why: w.why ?? null }, climbed: true, deck: +P.deck.toFixed(2), bearing: +bearing.toFixed(1), run, open: await page.evaluate(() => window.__CTX__.player.kitePilot?.last?.open ?? null) };
}

/**
 * In the page: fly a road by A and D on the pilot's bearing, from post `i0`; returns at `stopAt` posts passed (a shot), at
 * her feet down, or at `capS` of sim time. The flight state, the landing record and the passes are the page's own.
 */
export const FLY_ROAD = async ({ posts, passM, field, i0 = 0, stopAt = null, capS = 150 }) => {
  const C = window.__CTX__, p = C.player, E = C.engine, f = p.kite;
  const P = await import('/src/game/kite/pilot.js');
  const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
  const frame = () => new Promise((res) => requestAnimationFrame(res));
  let kL = false, kR = false, i = i0;
  const W = (window.__ROAD = window.__ROAD || { passes: [], phases: { track: 0, orbit: 0, final: 0 }, t0: E.simTime });
  const t0 = E.simTime;
  let last = E.simTime;
  while (E.simTime - t0 < capS && (p.flight === 'gliding' || p.flight === 'opening')) {
    let want;
    if (i < posts.length) {
      const a = P.alongPosts(f, posts, i, passM);
      if (a.passed) {
        const q = posts[i], g = C.terrain.getHeight(q.x, q.z);
        W.passes.push({ id: q.id, agl: +(f.y - g).toFixed(1), d: +a.d.toFixed(1), t: +(E.simTime - W.t0).toFixed(1) });
        i++;
        if (stopAt != null && i === stopAt) break;
      }
      want = i < posts.length ? P.alongPosts(f, posts, i, passM).want : P.toField(f, field).want;
    } else {
      const h = P.toField(f, field);
      W.phases[h.phase] += E.simTime - last;
      want = h.want;
    }
    last = E.simTime;
    const b = P.bankToward(f, want);
    if ((b < 0) !== kL) { kL = b < 0; key('KeyA', kL); }
    if ((b > 0) !== kR) { kR = b > 0; key('KeyD', kR); }
    await frame();
  }
  key('KeyA', false); key('KeyD', false);
  return { i, state: p.flight, s: +(E.simTime - W.t0).toFixed(2), passes: W.passes, phases: Object.fromEntries(Object.entries(W.phases).map(([a, b]) => [a, +b.toFixed(1)])),
    land: p.kitePilot?.last?.land ?? null, at: { x: +p.position.x.toFixed(1), y: +p.position.y.toFixed(1), z: +p.position.z.toFixed(1) }, agl: +f.agl.toFixed(2) };
};

const T3 = TRIG.find((t) => t.id === ROAD_LAUNCH.scar);
/** the bearing from T3 to the Scar's first post: the run-off's */
export const SCAR_BEARING = dirBearing(WIND_ROADS.scar[0].x - T3.x, WIND_ROADS.scar[0].z - T3.z);
export const SCAR_ROAD = { posts: WIND_ROADS.scar.map((p) => ({ id: p.id, x: p.x, z: p.z })), passM: POST_PASS_M, field: { ...SCAR_FIELD } };

export const DRIVE6 = {
  'scar-flight': async (page, K, b, maxS) => {
    const { BARS_INSTALL, barsNow } = await import('./glass-line-drive.mjs');
    await page.evaluate(BARS_INSTALL);
    await page.evaluate(() => { window.__ROAD = null; });
    const L = await pillarLaunch(page, K, ROAD_LAUNCH.scar, SCAR_BEARING, Math.max(30, maxS * 0.4));
    if (!L.ok) return { launch: L, bars: await barsNow(page) };
    // the flight is about 100 s of sim time from T3 (the law's 1.5 m/s sink over 141 m): it is not cut at the beat's budget
    const F = await page.evaluate(FLY_ROAD, { ...SCAR_ROAD, capS: Math.max(150, maxS) });
    for (let i = 0; i < 40; i++) { if (await page.evaluate(() => window.__CTX__.player.flight === 'none')) break; await sleep(100); }
    await sleep(1200);   // the stow after the landing (the bars read it too)
    return { launch: L, flight: F, bars: await barsNow(page) };
  },
};
