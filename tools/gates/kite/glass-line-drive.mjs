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
//   tether          to the moored Sonde's stake (the quest's own prompt: 22 m off the Ring on bearing 060, wave 3b; at
//                   4c14e00 the walk to the Ring's centre stopped 8.9 m short under its tilted face), E (a live Sonde's
//                   cutTether when area C's kind stands there, else the stand-in's line parts)
//   launch          (wave 3c: scar-flight-drive.mjs pillarLaunch, the start ahead of the centre; the old text:) to the foot
//                   of T1's steps, up the three 1 m steps (W and Space: the mantle). Wave 3b: the steps face
//                   270 and the field's track is 283, so she tops out at the deck's run-off edge; at 4c14e00 W walked her
//                   straight off it with no jump (refused, 0.185 s airborne, 1.63 m clear). Now she walks back across
//                   the deck by input (W, the look turned toward each point, round the centring plate's south side) to
//                   flight-page's T1 start (1.0 m behind the centre on the track, 0.8 m to its right), turns to 283, and
//                   runs: W, Space after 0.3 s (the jump at the edge), Space again 0.42 s after she leaves the deck and
//                   every 0.1 s while she is still in the air and it has not opened (a player presses again)
//   fly             A and D toward the marked field until her feet are down (the landing is the law's)
//   kite-given      to Ansel, E, the scene played through
//   scar-flight     (leg 6, wave 3c) scar-flight-drive.mjs DRIVE6: T3's top, the Scar's seven posts, down on its field
import * as SH from '../systems/slice-hour.mjs';
import { PLACES } from '../../../src/game/hour2/plan.js';
import { TEST_FLIGHT } from '../../../src/game/kite/roads.js';
import { pillarLaunch, DRIVE6 } from './scar-flight-drive.mjs';

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

/** Kevin's bars on her bones on every frame the kite is out or being stowed (flight-page.mjs's read: each wrist against
 *  the head's facing plane and under the head bone, each elbow under its shoulder, R10: a wrist behind the plane must be
 *  under the shoulders). Installed once; `window.__KF4BARS` holds the count. */
export const BARS_INSTALL = () => {
  if (window.__KF4BARS) return true;
  const C = window.__CTX__, p = C.player, V = p.position.constructor;
  const B = (window.__KF4BARS = { frames: 0, bad: 0, badAt: [], behind: 0, worst: { front: Infinity, under: Infinity, elbow: -Infinity }, minUnderShoulder: Infinity });
  const hd = new V(), w = new V(), e = new V(), sh = new V(), sh2 = new V(), fwd = new V();
  const wp = (bone, out) => { bone.updateWorldMatrix(true, false); return out.setFromMatrixPosition(bone.matrixWorld); };
  const tick = () => {
    try {
      const an = p.animator, b = an?.b;
      if (b && (p.flight !== 'none' || an._kiteAfter)) {
        B.frames++;
        wp(b.head.bone, hd); fwd.set(Math.sin(p.heading), 0, Math.cos(p.heading));
        const shY = Math.min(wp(b.upArmL.bone, sh).y, wp(b.upArmR.bone, sh2).y);
        let bad = null;
        for (const sd of ['L', 'R']) {
          wp(b[`hand${sd}`].bone, w); wp(b[`loArm${sd}`].bone, e); wp(b[`upArm${sd}`].bone, sh);
          const front = w.clone().sub(hd).dot(fwd), under = hd.y - w.y, elbow = e.y - sh.y, us = shY - w.y;
          B.worst.front = Math.min(B.worst.front, front); B.worst.under = Math.min(B.worst.under, under); B.worst.elbow = Math.max(B.worst.elbow, elbow);
          if (under < 0) bad = `${sd} wrist over the head bone`;
          if (elbow >= 0) bad = `${sd} elbow over its shoulder`;
          if (front <= 0) { B.behind++; B.minUnderShoulder = Math.min(B.minUnderShoulder, us); if (us <= 0) bad = `${sd} wrist behind the head plane at or above her shoulder`; }
        }
        if (bad) { B.bad++; if (B.badAt.length < 8) B.badAt.push({ why: bad, state: p.flight }); }
      }
    } catch (err) { /* the read never stops her frame */ }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
};
export const barsNow = (page) => page.evaluate(() => { const B = window.__KF4BARS; if (!B) return null; const r = (v) => (Number.isFinite(v) ? +v.toFixed(3) : null);
  return { frames: B.frames, bad: B.bad, badAt: B.badAt, behind: B.behind, minUnderShoulder: r(B.minUnderShoulder), worst: { front: r(B.worst.front), under: r(B.worst.under), elbow: r(B.worst.elbow) } }; });

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
  tether: async (page, K, b, maxS) => {
    const at = await page.evaluate(() => { const e = window.__CTX__.hour2?.glassLine?.entry?.tether; return e ? { x: e.position.x, z: e.position.z } : null; });
    if (!at) return { ok: false, why: 'no tether prompt (hour2.glassLine.entry.tether)' };
    const out = await atPrompt(page, K, at, 2.5, maxS, 1);
    out.prompt = at;
    out.sonde = await page.evaluate(() => window.__CTX__.hour2?.glassLine?.report?.().standIn ?? null);
    return out;
  },
  launch: async (page, K, b, maxS) => {
    // wave 3c: the steps, the deck and the run by scar-flight-drive.mjs pillarLaunch (the start 0.75 m AHEAD of the centre
    // on the track, away from the mast: at 7d5d0dd the start behind the centre was checked at the head and the kite
    // opened on the deck, 0.1 m from where she stood, on 320.8)
    await page.evaluate(BARS_INSTALL);
    const L = await pillarLaunch(page, K, 'T1', TEST_FLIGHT.bearing, maxS);
    const s2 = await waitFor(page, (x) => x.flight !== 'none' || x.grounded, 3000, 50);
    return { ...L, after: s2, bars: await barsNow(page) };
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
    await sleep(1200);   // the stow after the landing (the bars read it too)
    return { ...r, after: await now(page), bars: await barsNow(page) };
  },
  'kite-given': (page, K, b, maxS) => talkAnsel(page, K, maxS),
  // wave 3c: leg 6's 'scar-flight' rides here, so the hour-two runner (area E's) takes it with no change to its file
  ...DRIVE6,
};
