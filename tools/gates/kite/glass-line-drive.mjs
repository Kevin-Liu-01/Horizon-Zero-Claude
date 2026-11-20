// M3 wave 3, area B: LEG 4's DRIVERS, "A Line Over the Glass" played by input (keys held and released, E held at a
// prompt, the look turned as a mouse turns it; nothing writes a position, a stage or a count). The hour-two runner
// (tools/gates/systems/hour-two.mjs, area E's) takes them beside leg 6's (`DRIVE4`), one per beat of leg 4:
//   weather-clears  to the Ninewalls Brazier on foot, E, REST (the quest's rule: the noon calima's ask clears at her first
//                   rest while the quest runs), then the weather read until it is the trade and flyable
//   walk-the-line   to the guild-house stud on foot (WALK THE LINE has no control yet: the travel seam is a function,
//                   ctx.travel.walkTheLine, with no key or map row that calls it; BACKLOG)
//   ansel-kite      to Ansel, E (TALK), the scene played through
//   wreck           to the wreck's prompt on the black beach, E (the sailcloth)
//   cane-cord       E twice at the wreck (4 canes and 2 cords a hold)
//   rebuild         to the stud's prompt, E
//   tether          to the Sounding Ring's post, E (a live Sonde's cutTether when area C's kind stands there)
//   launch          to the foot of T1's steps, up the three 1 m steps (W and Space: the mantle), across the drum's deck,
//                   turned to 283 (toward the field), W, Space (the jump off the deck's edge), Space again 0.42 s later
//   fly             A and D toward the marked field until her feet are down (the landing is the law's)
//   kite-given      to Ansel, E, the scene played through
import * as SH from '../systems/slice-hour.mjs';
import { PLACES } from '../../../src/game/hour2/plan.js';
import { TEST_FLIGHT } from '../../../src/game/kite/roads.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = (page) => page.evaluate(() => {
  const C = window.__CTX__, p = C.player, Q = C.hour2?.glassLine;
  return { stage: Q?.spine?.current?.()?.id ?? null, reached: Q?.spine?.report?.().reached ?? [], busy: !!C.systemsGame?.present?.busy, flight: p.flight, grounded: p.grounded,
    p: { x: +p.position.x.toFixed(1), y: +p.position.y.toFixed(2), z: +p.position.z.toFixed(1) }, weather: C.environment.weather, flyable: !!C.environment.flyable?.(), hp: Math.round(p.health) };
});
async function waitFor(page, fn, ms, every = 250) { const t0 = Date.now(); for (;;) { const s = await now(page); if (fn(s)) return s; if (Date.now() - t0 > ms) return null; await sleep(every); } }
const faceBearing = (page, b) => page.evaluate((bd) => { window.__CTX__.player.camYaw = -bd * Math.PI / 180; }, b);

async function talkAnsel(page, K, maxS) {
  const A = await page.evaluate(() => { const e = window.__CTX__.systemsGame?.entry?.ansel; return e ? { x: e.position.x, z: e.position.z } : null; });
  if (!A) return { ok: false, why: 'no Ansel prompt (systemsGame.entry.ansel)' };
  const w = await SH.walkPath(page, K, A, 2.2, { maxS });
  await sleep(300);
  await SH.holdE(page, K, 500);
  await sleep(400);
  const played = await SH.playScene(page, K, 60);
  return { walk: { ok: w.ok, why: w.why ?? null }, played, after: await now(page) };
}
async function atPrompt(page, K, at, r, maxS, holds = 1) {
  const w = await SH.walkPath(page, K, at, r, { maxS });
  const out = { walk: { ok: w.ok, why: w.why ?? null, d: w.d ?? null }, holds: [] };
  for (let i = 0; i < holds; i++) { await SH.holdE(page, K, 750); await sleep(300); out.holds.push((await now(page)).stage); }
  return out;
}

export const DRIVE4 = {
  'weather-clears': async (page, K, b, maxS) => {
    const s0 = await now(page);
    if (s0.weather === 'trade' && s0.flyable) return { already: true };
    const B = await page.evaluate(() => { const z = window.__CTX__.braziers?.byId?.('ninewalls'); return z ? { x: z.obj.position.x, z: z.obj.position.z } : null; });
    if (!B) return { ok: false, why: 'no Ninewalls Brazier' };
    const w = await SH.walkPath(page, K, B, 1.4, { maxS });
    await sleep(300);
    await SH.holdE(page, K, 600);
    await sleep(600);
    const dialog = await page.evaluate(() => [...document.querySelectorAll('#cal-sys .sys-row')].map((r) => r.firstChild?.textContent ?? ''));
    await K.tap('Enter');
    for (let i = 0; i < 40; i++) { await sleep(300); if (await page.evaluate(() => !window.__CTX__.braziers?.resting && !window.__CTX__.systemsGame?.present?.busy)) break; }
    const s = await waitFor(page, (x) => x.weather === 'trade' && x.flyable, 40000);
    return { walk: { ok: w.ok, why: w.why ?? null }, dialog, cleared: !!s, after: await now(page), quest: await page.evaluate(() => window.__CTX__.hour2?.glassLine?.stats?.weatherCleared ?? null) };
  },
  'walk-the-line': async (page, K, b, maxS) => {
    const w = await SH.walkPath(page, K, PLACES.guildStud, 6, { maxS });
    await sleep(500);
    return { onFoot: true, walk: { ok: w.ok, why: w.why ?? null, d: w.d ?? null }, after: await now(page) };
  },
  'ansel-kite': (page, K, b, maxS) => talkAnsel(page, K, maxS),
  wreck: (page, K, b, maxS) => atPrompt(page, K, PLACES.wreck, 3, maxS, 1),
  'cane-cord': (page, K, b, maxS) => atPrompt(page, K, PLACES.wreck, 3, maxS, 2),
  rebuild: (page, K, b, maxS) => atPrompt(page, K, PLACES.guildStud, 2.5, maxS, 1),
  tether: (page, K, b, maxS) => atPrompt(page, K, PLACES.sonde, 4, maxS, 1),
  launch: async (page, K, b, maxS) => {
    const P = await page.evaluate(() => { const p = (window.__CTX__.props?.survey?.pillars || []).find((q) => q.id === 'T1'); return p ? { x: p.x, z: p.z, deck: p.deck, d: p.stepsDir } : null; });
    if (!P) return { ok: false, why: 'no T1 pillar record (props.survey.pillars)' };
    const foot = { x: P.x + P.d.x * 6.4, z: P.z + P.d.z * 6.4 };
    const w = await SH.walkPath(page, K, foot, 0.8, { maxS });
    // up the steps: face the pillar, W held, Space at each step (the mantle onto a 1 m step)
    await page.evaluate((x, z) => { const p = window.__CTX__.player; p.camYaw = Math.atan2(-(x - p.position.x), -(z - p.position.z)); }, P.x, P.z);
    await K.down('KeyW');
    let s = null;
    for (let i = 0; i < 16; i++) { await K.tap('Space', 90); await sleep(450); s = await now(page); if (s.p.y >= P.deck - 0.3) break; }
    await K.up('KeyW');
    if (!(s && s.p.y >= P.deck - 0.3)) return { walk: w.ok, climbed: false, at: s };
    // across the deck toward the field's side, then the run-off: W, the jump at the edge, Space again 0.42 s later
    await faceBearing(page, TEST_FLIGHT.bearing);
    await sleep(200);
    await K.down('KeyW'); await sleep(250); await K.tap('Space', 60);
    await sleep(420); await K.tap('Space', 60); await K.up('KeyW');
    const s2 = await waitFor(page, (x) => x.flight !== 'none' || x.grounded, 3000, 50);
    return { walk: w.ok, climbed: true, deck: P.deck, after: s2, open: await page.evaluate(() => window.__CTX__.player.kitePilot?.last ?? null) };
  },
  fly: async (page, K, b, maxS) => {
    // the in-page pilot's hands: A and D toward the field (8 deg dead band), as the page flight driver steers
    const r = await page.evaluate(async (tx, tz, capS) => {
      const C = window.__CTX__, p = C.player, E = C.engine, f = p.kite;
      const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
      const frame = () => new Promise((res) => requestAnimationFrame(res));
      let kL = false, kR = false; const t0 = E.simTime;
      while (E.simTime - t0 < capS && (p.flight === 'gliding' || p.flight === 'opening')) {
        const want = (Math.atan2(tx - p.position.x, -(tz - p.position.z)) * 180 / Math.PI + 360) % 360;
        let hdg = (f.heading * 180 / Math.PI) % 360; if (hdg < 0) hdg += 360;
        let d = want - hdg; while (d > 180) d -= 360; while (d < -180) d += 360;
        const l = d < -8, rr = d > 8;
        if (l !== kL) { key('KeyA', l); kL = l; } if (rr !== kR) { key('KeyD', rr); kR = rr; }
        await frame();
      }
      key('KeyA', false); key('KeyD', false);
      return { state: p.flight, s: +(E.simTime - t0).toFixed(2), land: p.kitePilot?.last?.land ?? null };
    }, TEST_FLIGHT.field.x, TEST_FLIGHT.field.z, Math.max(30, maxS));
    await waitFor(page, (x) => x.flight === 'none', 4000, 100);
    return { ...r, after: await now(page) };
  },
  'kite-given': (page, K, b, maxS) => talkAnsel(page, K, maxS),
};
