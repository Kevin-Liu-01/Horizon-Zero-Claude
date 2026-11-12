import {
  GROUND, REST, TRIG, site, polar, fieldPoint, STACKS, ROQUES, SITES_OK,
} from './layout.js';

/**
 * `ctx.props.gatePlaces` — THE PLACE CONTRACT (plan §3.2, owner world-props,
 * stub W1 day 1, real by the W1 exit; gate A-gate-places-published). Gates
 * stage by NAME through `tools/gate-places.mjs`; no gate names a coordinate.
 *
 * Every row is `{ x, z, yaw?, pitch?, ..., note }` in the engine frame
 * (x = E, z = -N); `yaw` is `player.camYaw` (camYaw pi faces +z; facing a
 * compass bearing b is camYaw = -b). A list place is `{ points: [...] }` or
 * `{ legs: [...] }`. Rows adopted from world-ground's `sites.js` GROUND table
 * (measured on its bake) keep its note; world-props adds:
 *   rest, restSite      from sites.js REST / REST_SITE
 *   vistas.<biome>      one camera station per biome (all six, A-gate-places-published)
 *   landmarks           A-landmark-bearing's stations { saltrow, ninewalls, calibrationYard }
 *   kilnYardFight       flat ground at the Kiln Yards for the W3 assault (A21 at W3)
 *   look.<name>         ROUND5-LOOK L-00's fifteen look places (pose, camera
 *                       bearing relative to the sun, hour, weather; stub rows are
 *                       marked `stub: true` until their frame has been filmed)
 *   trig, gauge, ring   the survey-mark stations this lane's gates stand on
 *
 * `build(ctx)` resolves every row's ground height at boot (`y`), so a row that
 * stands in the sea or off the island is caught by the gate, not by a camera.
 */

const D2R = Math.PI / 180;
const camYawFor = (bearingDeg) => -bearingDeg * D2R;

function eyeView(ctx, x, z, eye, bearingDeg, pitchDeg, fov, extra = {}) {
  const T = ctx.terrain;
  const y = T.getHeight(x, z);
  const b = bearingDeg * D2R;
  const look = { x: x + Math.sin(b) * 100, y: y + eye + Math.tan(pitchDeg * D2R) * 100, z: z - Math.cos(b) * 100 };
  return { x, z, y, eye, yaw: camYawFor(bearingDeg), bearing: bearingDeg, pitch: pitchDeg * D2R, fov, look, ...extra };
}

export function buildGatePlaces(ctx, props) {
  const T = ctx.terrain;
  const P = {};
  // 1. world-ground's measured rows, as they are
  if (GROUND) for (const [k, v] of Object.entries(GROUND)) P[k] = v;
  // 2. the rest point
  if (REST) P.rest = { x: REST.x, z: REST.z, note: 'sites.js REST (Brea\'s cistern at Saltrow)' };

  // 3. one vista per biome (camera stations; eye metres above the ground)
  const st = (id) => site(id) || { x: 0, z: 0 };
  const v = { ...(GROUND?.vistas || {}) };
  if (!v.pans) v.pans = { ...eyeView(ctx, -405, 86, 1.8, 150, -6, 42), note: 'the crater rim over the Glass and the salt grid' };
  const ninewalls = st('ninewalls'), kiln = st('kiln-yards'), fog = st('fog-harp'), muster = st('leveler-muster'), cal = st('calibration-yard');
  v.holds = { ...eyeView(ctx, ninewalls.x + 40, ninewalls.z + 70, 1.8, 330, -3, 46), note: 'below Ninewalls on the Scar\'s line, looking up the terraces' };
  v.malpais = { ...eyeView(ctx, kiln.x + 64, kiln.z + 74, 1.8, 315, -2, 46), note: 'on the lava shelf by the Rust Cone, over the Kiln Yards' };
  v.cloudline = { ...eyeView(ctx, fog.x - 30, fog.z + 50, 1.8, 20, 2, 46), note: 'up the barranco to the Fog Harp and Mistfold' };
  v.flank = { ...eyeView(ctx, muster.x + 6, muster.z + 30, 1.8, 50, 4, 46), note: 'the low bench below the Flank wall' };
  v.caldera = { ...eyeView(ctx, cal.x, cal.z, 1.8, 130, 1, 46), note: 'the Calibration Yard over the caldera floor to the Fundamental' };
  P.vistas = v;

  // 4. A-landmark-bearing's stations (W1 Saltrow; W3 Ninewalls; W4 the Calibration Yard)
  const salt = st('saltrow');
  P.landmarks = {
    saltrow: { x: salt.x, z: salt.z, eye: 1.7, note: 'Saltrow (bible §8.4)' },
    ninewalls: { x: ninewalls.x, z: ninewalls.z, eye: 1.7, note: 'Ninewalls (W3 station)' },
    calibrationYard: { x: cal.x, z: cal.z, eye: 1.7, note: 'the Calibration Yard (W4 station)' },
  };

  // 5. the Kiln Yard assault ground (W3): the flattest point within 30 m of the yards' site
  {
    let bx = kiln.x, bz = kiln.z, bs = Infinity;
    for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
      const x = kiln.x + i * 7, z = kiln.z + j * 7;
      const s = Math.abs(T.getHeight(x + 4, z) - T.getHeight(x - 4, z)) + Math.abs(T.getHeight(x, z + 4) - T.getHeight(x, z - 4));
      if (s < bs) { bs = s; bx = x; bz = z; }
    }
    P.kilnYardFight = { x: bx, z: bz, yaw: Math.PI, note: 'flattest ground at the Kiln Yards (W3 builds the yards)' };
  }

  // 6. this lane's stations
  P.trig = Object.fromEntries(TRIG.map((t) => [t.id, { x: t.x, z: t.z, note: `trig pillar ${t.id} ${t.name}` }]));
  const ring = st('sounding-ring');
  P.ring = { x: ring.x, z: ring.z, note: 'the Sounding Ring (its site)' };
  if (props?.gauge) P.gauge = { x: props.gauge.x, z: props.gauge.z, note: 'the static scripted Gauge at Sluice 3' };
  // the basalt column A24 sprints into: the tallest column of the Organ Shelf cluster nearest T1
  if (props?.organ?.columns?.length) {
    const t1 = TRIG[0];
    let best = null, bd = Infinity;
    for (const c of props.organ.columns) {
      const h = c.y1 - T.getHeight(c.x, c.z);
      if (h < 3) continue;
      const d = Math.hypot(c.x - t1.x, c.z - t1.z);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) P.basaltColumn = { x: best.x, z: best.z, r: best.r, note: 'an Organ Shelf column >= 3 m tall (A24)' };
  }
  // the midground vista V34 turns four yaws from: on the salt field's seaward side, where the
  // reservoir pump (N), the Organ Shelf (E), stack 4 (S) and the sea arch (W) all stand 150-300 m out
  P.midgroundVista = { x: -296, z: 326, yawOffsetDeg: 0, note: 'the salt field\'s seaward side: a landmark 150-300 m out on all four bearings (V34)' };

  // 7. ROUND5-LOOK L-00 look places
  const t1 = TRIG[0];
  const L = {};
  const look = (name, x, z, eye, bearing, pitch, fov, hour, weather, note, extra = {}) => {
    L[name] = { ...eyeView(ctx, x, z, eye, bearing, pitch, fov), hour, weather, note, ...extra };
  };
  look('field', -238, 262, 1.6, 300, 1, 50, 16.5, 'trade', 'behind Brea in the meadow belt landward of the salt field, the pans and the Ring ahead', { pose: 'behind', stub: true });
  look('vista', t1.x - 6, t1.z - 4, 1.7, 283, -1, 46, 19.0, 'trade', 'on the Organ Shelf\'s edge by T1 facing the sun, the Ring mid-distance (164 m), the stacks beyond', { pose: 'vista' });
  look('aim', -196, 398, 1.6, 300, 0, 46, 17.75, 'trade', 'over the shoulder on the black-sand beach toward the Ring', { pose: 'aim', stub: true });
  look('close', REST?.x ?? salt.x, REST?.z ?? salt.z, 1.55, 250, 0, 30, 18.75, 'trade', 'at 0.8 m at the cistern (character-art\'s close-up place)', { pose: 'close', dist: 0.8, stub: true });
  look('dusk', -338, 214, 1.5, 270, 1, 50, 19.75, 'trade', 'among the sea-lavender on the Glass\'s shore', { pose: 'behind', stub: true });
  look('pansInland', -255, 380, 1.7, 345, 3, 55, 18.75, 'trade', 'from the black-sand beach inland: the Ring at left, the salt field, Saltrow, the caldera rim and the Roque plug on the skyline');
  look('pansSunset', -226, 186, 1.8, 262, 0, 50, 18.75, 'trade', 'Saltrow\'s rise west over the pans into the sun: the glitter path and the stacks');
  look('meadow', -214, 230, 1.6, 240, 0, 50, 17.5, 'trade', 'the gold meadow belt landward of the pans (world-ground W-06)', { stub: true });
  look('beach', -226, 392, 1.6, 255, -1, 50, 18.25, 'trade', 'the black-sand beach and its surf toward the Ring and the stacks', { stub: true });
  look('title', -255, 380, 1.7, 330, 2, 40, 18.67, 'trade', 'U-08 title: a rise facing the Ring and the spires; Brea idle (shell-ui W2)', { pose: 'title', stub: true });
  look('saltrowDusk', salt.x + 30, salt.z + 40, 1.7, 330, 1, 50, 19.5, 'trade', 'Saltrow at dusk (settlements W2)', { stub: true });
  look('craterWall', -356, 196, 1.7, 335, 12, 50, 17.0, 'trade', 'the red tuff wall from the Glass\'s shore: beds, talus, tuff blocks');
  look('steepFace', P.steepFace?.x ?? -14, (P.steepFace?.z ?? -380) + 40, 1.7, 0, 10, 50, 16.0, 'trade', 'the north-coast scarp (world-ground\'s steepFace row)', { stub: true });
  look('reed', -406, 196, 1.2, 60, 0, 50, 17.0, 'trade', 'reed cover at the Glass (world-ground F-4)', { stub: true });
  look('brazier', salt.x + 10, salt.z + 6, 1.6, 200, 0, 50, 20.0, 'trade', 'the Brazier at Saltrow (W3, F-1)', { stub: true });
  P.look = L;

  // provenance of the table
  P.__source = 'world-props';
  P.__island = SITES_OK ? 'world-ground W1 island (sites.js tables present)' : 'W0 stub sites.js (no island tables): rows are bible coordinates on a map that does not have them';
  P.__stacks = STACKS.map((s) => ({ id: s.id, ...polar(s.bearing, s.range) }));
  P.__roques = ROQUES.map((r) => ({ id: r.id, x: r.x, z: r.z }));
  P.__field = fieldPoint(0, 0);
  return P;
}
