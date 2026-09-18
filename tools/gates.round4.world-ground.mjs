/**
 * Round 4 gates — lane `world-ground` (docs/ROUND4-AUDIT.md §4).
 *
 * Same contract as tools/gates.config.mjs: ACTION gates resolve { pass, detail }
 * in page context with __CTX__/__GAME__ available; VISUAL gates capture a
 * deterministic screenshot judged against `criteria`.
 *
 * Two of these measure PIXELS, not counters, on purpose:
 *
 *  - A59's coverage term renders the frame twice, once with `vegetation.group`
 *    hidden, and calls a pixel "visible ground" only when the two frames agree.
 *    A density number can be gamed by shrinking a card until nothing covers
 *    anything; an A/B of the real framebuffer cannot. Grass shadow casting is
 *    switched off for both halves so the diff is occlusion and nothing else.
 *  - A58 scans the whole play disc rather than four hand-picked coordinates, so
 *    a surface that exists only under a single texel cannot count as a surface.
 *
 * A60 walks the LIVE machine routes (`machines.list[].route`), not terrain's
 * private copy of the spawn table — the whole point of the finding is that the
 * grass covers the lanes the machines actually patrol.
 */

/** Page-context kit: direct rendering + framebuffer reads, no rAF in between. */
const KIT = `
  const ctx = __CTX__;
  const engine = ctx.engine;
  const renderer = ctx.renderer;
  const cam = ctx.camera;
  const T = ctx.terrain;
  const V = ctx.player.position.constructor;
  const gl = renderer.getContext();

  const draw = (n = 3) => {
    for (let i = 0; i < n; i++) {
      engine._shadowCullClock = 0;   // the cull pass is rate-limited to 10 Hz
      engine.render(0.05);
    }
  };

  /** Park Aloy far from the measurement so she is never a "ground" pixel. */
  const parkPlayer = (x, z) => {
    const p = ctx.player;
    p.position.set(x, 0, z);
    p.velocity?.set?.(0, 0, 0);
    p._snapToGround?.();
  };

  /** Aim the engine camera at a world point from a given height and pitch. */
  const aim = (x, z, height, pitchDown, yaw) => {
    const y = T.getHeight(x, z);
    cam.position.set(x, y + height, z);
    const d = 12;
    cam.lookAt(x + Math.sin(yaw) * d, y + height - Math.tan(pitchDown) * d,
      z + Math.cos(yaw) * d);
    cam.updateMatrixWorld(true);
  };
`;

export const GATES = [
  /* --------------------------------------------------------------------- */
  {
    id: 'A58-surface-api', kind: 'action', lane: 'world-ground',
    title: 'terrain.surfaceAt() names at least 7 materially present surfaces '
      + '(snow, mud and ash among them), >= 5 biomes cover real ground, and '
      + 'the river / trail / shelf / meadow do not all read the same',
    timeout: 45000,
    settle: 1200,
    assert: `(async () => {
      const ctx = __CTX__;
      const T = ctx.terrain;
      if (!T || typeof T.surfaceAt !== 'function') {
        return { pass: null, detail: 'SKIP: terrain.surfaceAt not published' };
      }
      const KINDS = T.constructor.SURFACES;
      if (!Array.isArray(KINDS) || KINDS.length < 4) {
        return { pass: false, detail: 'Terrain.SURFACES is not a list of surface names' };
      }
      // 3 m grid over the play disc
      const hist = {}, where = {};
      let total = 0;
      for (let z = -320; z <= 320; z += 3) {
        for (let x = -320; x <= 320; x += 3) {
          if (x * x + z * z > 320 * 320) continue;
          const s = T.surfaceAt(x, z);
          total++;
          hist[s] = (hist[s] || 0) + 1;
          if (!where[s]) where[s] = [x, z];
        }
      }
      const MIN = Math.max(200, Math.round(total * 0.0008));
      const material = Object.keys(hist).filter((k) => hist[k] >= MIN);
      const unknown = Object.keys(hist).filter((k) => !KINDS.includes(k));

      // the four zones the finding names, located from the field itself
      const zone = {};
      // river: the lowest point of the west channel at three z stations
      for (const zz of [-120, 0, 120]) {
        let bx = -130, by = Infinity;
        for (let x = -200; x <= -60; x += 1) {
          const h = T.getHeight(x, zz);
          if (h < by) { by = h; bx = x; }
        }
        zone['river@' + zz] = T.surfaceAt(bx, zz);
      }
      // trail: the strongest non-grass sample inside the camp approach
      let trail = null;
      for (let r = 12; r < 90 && !trail; r += 1.5) {
        for (let a = 0; a < 6.283; a += 0.05) {
          const x = 22 + Math.cos(a) * r, z = 30 + Math.sin(a) * r;
          const s = T.surfaceAt(x, z);
          if (s === 'dirt' || s === 'gravel') { trail = [s, +x.toFixed(1), +z.toFixed(1)]; break; }
        }
      }
      zone.trail = trail ? trail[0] : 'none';
      zone.shelf = T.surfaceAt(150, 95);
      zone.meadow = T.surfaceAt(-60, -90);
      const zoneSet = new Set(Object.values(zone).filter((v) => v !== 'none'));

      /* ROUND 4 EXPANSION BAR (world-ground-expansion §4): >= 7 materially
       * present surfaces, and specifically the three the biome pass owes —
       * snow on the north bench, mud in the marsh, ash in the burn scar.
       * Naming them is the point: a bare count of 7 alone could be met
       * by slicing the existing meadow finer, which is not a biome pass. The
       * ORIGINAL terms (no unknown values, three distinct zones, the meadow
       * reads as grass, a trail exists) are all still required. */
      const OWED = ['snow', 'mud', 'ash'];
      const missing = OWED.filter((k) => !material.includes(k));

      // ...and the biome vocabulary itself has to be present on the ground
      const biomes = {};
      if (typeof T.biomeAt === 'function') {
        for (let z = -320; z <= 320; z += 6) {
          for (let x = -320; x <= 320; x += 6) {
            if (x * x + z * z > 320 * 320) continue;
            const b = T.biomeAt(x, z);
            biomes[b] = (biomes[b] || 0) + 1;
          }
        }
      }
      const bList = Object.keys(biomes).filter((k) => biomes[k] >= 40);

      const pass = material.length >= 7 && missing.length === 0
        && unknown.length === 0 && zoneSet.size >= 3
        && zone.meadow === 'grass' && trail !== null
        && bList.length >= 5;
      return {
        pass,
        detail: {
          distinctMaterial: material.length, material, minSamples: MIN,
          missingOwed: missing,
          histogram: hist, unknown, zones: zone, zoneDistinct: zoneSet.size,
          biomes, biomesMaterial: bList,
          samplePoints: where, trailAt: trail,
        },
      };
    })()`,
  },

  /* --------------------------------------------------------------------- */
  {
    id: 'A59-grass-coverage', kind: 'action', lane: 'world-ground',
    title: '>= 4 tufts/m^2 at six meadow points, >= 6 in a stealth patch, and '
      + '< 25% of a downward shot is bare ground',
    timeout: 120000,
    settle: 2000,
    setup: `(() => { __CTX__.environment?.setWeather?.('clear', 0); __CTX__.environment?.setTime?.(15.0); })();`,
    assert: `(async () => {
      ${KIT}
      const veg = ctx.vegetation;
      if (!veg || typeof veg.countGrassNear !== 'function'
        || typeof veg.forceStream !== 'function') {
        return { pass: null, detail: 'SKIP: vegetation.countGrassNear/forceStream not published' };
      }

      /* ---- 1. six meadow points, near-tier density ---- */
      const MEADOW = [[-60, -90], [-30, -40], [88, 34], [-110, -90],
        [44, -74], [-160, 90]];
      const R = 20, AREA = Math.PI * R * R;
      const near = [];
      for (const [x, z] of MEADOW) {
        veg.forceStream(x, z);
        near.push(+(veg.countGrassNear(x, z, R) / AREA).toFixed(2));
      }
      const worstMeadow = Math.min(...near);

      /* ---- 2. stealth patches: >= 6 tufts/m^2 where the grass hides you ---- */
      const stealth = [];
      const seen = [];
      for (const [cx, cz] of MEADOW) {
        let best = null;
        for (let a = 0; a < 6.283 && !best; a += 0.22) {
          for (let r = 2; r < 26; r += 2) {
            const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
            if (T.tallGrassDensity(x, z) > 0.62) { best = [x, z]; break; }
          }
        }
        if (!best) continue;
        veg.forceStream(best[0], best[1]);
        const d = veg.countGrassNear(best[0], best[1], 8) / (Math.PI * 64);
        stealth.push(+d.toFixed(2));
        seen.push([+best[0].toFixed(1), +best[1].toFixed(1)]);
      }
      const worstStealth = stealth.length ? Math.min(...stealth) : null;

      /* ---- 3. bare-ground fraction of a real downward frame ---- */
      // Grass shadows are switched off for BOTH halves of the A/B so the diff
      // measures occlusion by vegetation and not the shadow it casts.
      const casters = [];
      ctx.scene.traverse((o) => {
        if (o.isMesh && o.castShadow && /grass-|bush|tree-|litter-|meadow-flower/.test(o.name || '')) {
          casters.push(o); o.castShadow = false;
        }
      });
      const site = [-60, -90];
      veg.forceStream(site[0], site[1]);
      parkPlayer(site[0] + 90, site[1] + 90);
      aim(site[0], site[1], 3.2, 0.78, 0.9);   // 3.2 m up, ~45 deg down

      const W = renderer.domElement.width, H = renderer.domElement.height;
      // GL's origin is bottom-left, so this window is the LOWER-CENTRE of the
      // frame: the ground from ~3 m to ~18 m, which is the ground the player
      // is standing in. Both halves get 6 rendered frames so the cascades have
      // fully re-solved before either read — a stale shadow map on one side of
      // the A/B is worth several points of "coverage" that is not there.
      const x0 = Math.round(W * 0.18), y0 = Math.round(H * 0.04);
      const w = Math.round(W * 0.64), h = Math.round(H * 0.52);
      const A = new Uint8Array(w * h * 4), B = new Uint8Array(w * h * 4);
      draw(6);
      gl.readPixels(x0, y0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, A);
      veg.group.visible = false;
      draw(6);
      gl.readPixels(x0, y0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, B);
      veg.group.visible = true;
      for (const o of casters) o.castShadow = true;
      draw(2);

      let same = 0;
      for (let i = 0; i < w * h; i++) {
        const dr = Math.abs(A[i * 4] - B[i * 4]);
        const dg = Math.abs(A[i * 4 + 1] - B[i * 4 + 1]);
        const db = Math.abs(A[i * 4 + 2] - B[i * 4 + 2]);
        if (dr < 10 && dg < 10 && db < 10) same++;
      }
      const bare = same / (w * h);

      const pass = worstMeadow >= 4 && worstStealth !== null && worstStealth >= 6
        && bare < 0.25;
      return {
        pass,
        detail: {
          meadowDensity: near, worstMeadow,
          stealthDensity: stealth, worstStealth, stealthAt: seen,
          bareGroundFraction: +bare.toFixed(3), samplePixels: w * h,
          stats: veg.grassStats(),
        },
      };
    })()`,
  },

  /* --------------------------------------------------------------------- */
  {
    id: 'A60-stealth-lanes', kind: 'action', lane: 'world-ground',
    title: 'Every live machine patrol route has >= 25% of its length in grass '
      + 'above the 0.45 concealment threshold',
    timeout: 60000,
    settle: 1500,
    assert: `(async () => {
      const ctx = __CTX__;
      const T = ctx.terrain;
      if (!T || typeof T.tallGrassDensity !== 'function') {
        return { pass: null, detail: 'SKIP: terrain.tallGrassDensity not published' };
      }
      const t0 = performance.now();
      while (!ctx.machines?.varietyReady && performance.now() - t0 < 25000) {
        await new Promise((r) => setTimeout(r, 150));
      }
      const list = (ctx.machines?.list || []).filter((m) => m.route && m.route.length > 2);
      if (!list.length) return { pass: null, detail: 'SKIP: no machine carries a route' };

      const rows = [];
      for (const m of list) {
        const r = m.route;
        let total = 0, covered = 0;
        for (let i = 0; i < r.length; i++) {
          const a = r[i], b = r[(i + 1) % r.length];
          const L = Math.hypot(b.x - a.x, b.z - a.z);
          const steps = Math.max(2, Math.round(L / 2));
          for (let s = 0; s < steps; s++) {
            const u = s / steps;
            const x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u;
            total++;
            if (T.tallGrassDensity(x, z) > 0.45) covered++;
          }
        }
        rows.push({ kind: m.kind, frac: +(covered / total).toFixed(3), samples: total });
      }
      rows.sort((p, q) => p.frac - q.frac);
      const worst = rows[0];
      const bad = rows.filter((r) => r.frac < 0.25);
      return {
        pass: bad.length === 0,
        detail: {
          routes: rows.length, worst, below25: bad.length,
          bottom5: rows.slice(0, 5),
          median: rows[Math.floor(rows.length / 2)].frac,
        },
      };
    })()`,
  },

  /* --------------------------------------------------------------------- */
  {
    id: 'V32-ground-detail', kind: 'visual', lane: 'world-ground',
    title: 'Crouched on the trail-and-channel ground, 1.5 m up: the terrain is a '
      + 'material, not a vertex colour',
    params: 'px=-95&pz=6&pitch=0.05',
    settle: 2400,
    timeout: 60000,
    setup: `(() => {
      const ctx = __CTX__, cam = ctx.camera, T = ctx.terrain;
      ctx.environment?.setWeather?.('clear', 0);
      ctx.environment?.setTime?.(15.5);
      // Take the lens off the chase rig for this frame: the player's own
      // camera solve and the studio both write ctx.camera every frame, so a
      // raw camera pose set from a gate is overwritten before the capture.
      const p = ctx.player;
      p._updateCamera = () => {};
      if (ctx.studio) ctx.studio.update = () => {};
      // Stand on the dried channel where the splat's cobble/silt/gravel tiers
      // meet: grass thins out there on purpose, so this frames the GROUND.
      let bx = -130, by = Infinity;
      for (let x = -200; x <= -60; x += 1) {
        const h = T.getHeight(x, -20);
        if (h < by) { by = h; bx = x; }
      }
      // stand on the east bank looking ACROSS the cut, so one frame carries
      // grass -> gravel bar -> cobble -> silt -> water and back
      const px = bx + 13, pz = -20;
      p.position.set(px + 26, 0, pz + 26);      // Aloy out of frame
      p._snapToGround?.();
      ctx.vegetation?.forceStream?.(px, pz);
      const y = T.getHeight(px, pz);
      const shot = () => {
        cam.fov = 46; cam.updateProjectionMatrix();
        cam.position.set(px, y + 1.5, pz);
        cam.lookAt(bx + 1, y - 3.6, pz + 3);     // 1.5 m eye, ~19 deg down
        cam.updateMatrixWorld(true);
      };
      shot();
      setInterval(shot, 8);
      for (let i = 0; i < 4; i++) { ctx.engine._shadowCullClock = 0; ctx.engine.render(0.05); }
    })();`,
    criteria: 'The ground fills the frame from a ~1.5 m eye. PASS: the surface '
      + 'shows small-scale grain — pebbles, grit, soil mottling — at two '
      + 'visibly different scales, with normal-mapped relief (a lit and a '
      + 'shaded side on the same bump), AND the material changes across the '
      + 'cut (bank grass / silt / cobble / water) rather than one tint fading '
      + 'into another. FAIL if it reads as flat interpolated vertex colour, if '
      + 'the only variation is a single large low-frequency blotch, or if the '
      + 'surface has no relief at grazing light.',
  },

  /* --------------------------------------------------------------------- */
  {
    id: 'V33-rim', kind: 'visual', lane: 'world-ground',
    title: 'From the camp toward the north rim: an alpine wall with strata and '
      + 'talus, hazed, with 150 m+ of relief',
    params: 'px=22&pz=-6&pitch=0.16',
    settle: 2600,
    timeout: 60000,
    setup: `(() => {
      const ctx = __CTX__, cam = ctx.camera, T = ctx.terrain;
      ctx.environment?.setWeather?.('clear', 0);
      /* 09:00, not 16:00. world-light's solar arc keeps sunDir.z NEGATIVE all
       * day (the sun tracks across the northern sky), so a 16:00 shot of the
       * NORTH rim looks straight into the sun: the disc sits in frame, the
       * pow(dot(view,sun),7) in-scatter term peaks at 0.12, and 150 m of wall
       * disappears into white. At 09:00 the sun is at (0.61, 0.53, -0.59) —
       * 55 deg off the view axis and to the EAST — which is what the criteria
       * actually needs: raking light that puts a sun face and a shade face on
       * the same massif and rakes the bedding planes. The criteria itself is
       * untouched; this only stops the gate from filming into the glare. */
      ctx.environment?.setTime?.(9.0);
      const p = ctx.player;
      p._updateCamera = () => {};
      if (ctx.studio) ctx.studio.update = () => {};
      // just north of the palisade so the camp fence is not the subject
      p.position.set(22, 0, -6);
      p._snapToGround?.();
      ctx.vegetation?.forceStream?.(22, -6);
      const y = T.getHeight(22, -6);
      const shot = () => {
        cam.fov = 52; cam.updateProjectionMatrix();
        cam.position.set(22, y + 5.0, -6);
        cam.lookAt(22, y + 120, -330);             // due north, up at the massif
        cam.updateMatrixWorld(true);
      };
      shot();
      setInterval(shot, 8);
      for (let i = 0; i < 4; i++) { ctx.engine._shadowCullClock = 0; ctx.engine.render(0.05); }
    })();`,
    criteria: 'The north rim fills the upper half of the frame. PASS: it reads '
      + 'as a lit alpine wall — horizontal strata / bench lines, a jagged crest, '
      + 'individual rock slabs and talus/scree cones at its foot, sun and shade '
      + 'faces on the same massif, and aerial haze separating it from the '
      + 'meadow; at least ~150 m of vertical relief from valley floor to crest. '
      + 'FAIL on a bald beige hump, a flat unlit backdrop, or a wall with no '
      + 'rock detail at its base.',
  },

  /* --------------------------------------------------------------------- */
  {
    id: 'V44-biomes', kind: 'visual', lane: 'world-ground',
    title: 'Four-bearing vista from the valley floor: the 330 m disc carries '
      + 'visibly different biomes, not one meadow',
    params: 'px=55&pz=-40&pitch=0.12',
    settle: 2600,
    timeout: 90000,
    setup: `(() => {
      const ctx = __CTX__, engine = ctx.engine, renderer = ctx.renderer, cam = ctx.camera;
      ctx.environment?.setWeather?.('clear', 0);
      ctx.environment?.setTime?.(11.0);
      const p = ctx.player;
      p._updateCamera = () => {};
      if (ctx.studio) ctx.studio.update = () => {};
      const T = ctx.terrain;

      /* ONE STATION, FOUR BEARINGS 90 DEGREES APART — not four hand-picked
       * postcards. A biome pass that only reads from a camera parked inside
       * each region has not changed the WORLD, it has changed five places you
       * can stand; the point of this framing is that a player turning on the
       * spot in the middle of the valley sees different ground every quarter
       * turn. ONE station at (30,-60), ONE camera height, and four bearings
       * exactly 90 degrees apart: 35 / 125 / 215 / 305. The only thing chosen
       * is the base angle, and it is chosen once — those four bearings happen
       * to run out to the SE scree benches, the NE conifer stand, the N snow
       * shelf and the W marsh, which is the claim being made. The lens is
       * 76 m up because at head height the near meadow fills two thirds of
       * every frame and no vista gate can see past it. */
      const CX = 30, CZ = -60;
      p.position.set(CX + 8, 0, CZ + 8);
      p._snapToGround?.();
      ctx.vegetation?.forceStream?.(CX, CZ);
      const gy = T.getHeight(CX, CZ);
      const W = renderer.domElement.width, H = renderer.domElement.height;

      const shot = (yaw) => {
        cam.fov = 46; cam.updateProjectionMatrix();
        cam.position.set(CX, gy + 76, CZ);
        cam.lookAt(CX + Math.sin(yaw) * 235, gy + 10, CZ + Math.cos(yaw) * 235);
        cam.updateMatrixWorld(true);
        for (let i = 0; i < 4; i++) { engine._shadowCullClock = 0; engine.render(0.05); }
        const buf = new Uint8ClampedArray(W * H * 4);
        renderer.getContext().readPixels(0, 0, W, H, 0x1908, 0x1401, buf);
        return buf;
      };
      const D = Math.PI / 180;
      const yaws = [35 * D, 125 * D, 215 * D, 305 * D];
      const names = ['bearing 35', 'bearing 125', 'bearing 215', 'bearing 305'];
      const frames = yaws.map(shot);

      const sheet = document.createElement('canvas');
      sheet.width = W; sheet.height = H;
      const g = sheet.getContext('2d');
      const tmp = document.createElement('canvas');
      tmp.width = W; tmp.height = H;
      const tg = tmp.getContext('2d');
      for (let i = 0; i < 4; i++) {
        tg.putImageData(new ImageData(frames[i], W, H), 0, 0);
        g.save();
        g.translate((i % 2) * W / 2, Math.floor(i / 2) * H / 2);
        g.scale(0.5, -0.5);
        g.drawImage(tmp, 0, -H);
        g.restore();
        g.fillStyle = '#000'; g.globalAlpha = 0.55;
        g.fillRect((i % 2) * W / 2, Math.floor(i / 2) * H / 2, 210, 22);
        g.globalAlpha = 1; g.fillStyle = '#ffe3b0';
        g.font = '13px ui-monospace, monospace';
        g.fillText(names[i] + '   station (30,-60) +76m   t=11:00',
          (i % 2) * W / 2 + 8, Math.floor(i / 2) * H / 2 + 16);
      }
      const img = new Image();
      img.src = sheet.toDataURL('image/png');
      img.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647';
      document.body.appendChild(img);
    })();`,
    criteria: 'A 2x2 contact sheet of four bearings from one station in the '
      + 'valley. PASS: at least THREE of the four tiles show ground that is '
      + 'visibly a different biome from the others — e.g. a dense dark '
      + 'conifer stand, a pale snow shelf with bare snags, a green reed marsh '
      + 'with standing water, a stony scree bench with boulders, an open '
      + 'gold/olive meadow — each distinguishable by GROUND COLOUR AND COVER '
      + 'TYPE, not merely by distance haze or by what props happen to be in '
      + 'frame. FAIL if three or more tiles read as the same meadow with the '
      + 'same grass, if the differences are only in lighting, or if a "biome" '
      + 'is just a flat recoloured patch with no matching vegetation.',
  },
  /* --------------------------------------------------------------------- */
  {
    /* Ids A61/A62 are already taken by other lanes (progression, focus-items),
     * so these carry the lane suffix the round-4 brief asks for. */
    id: 'A61-scree-seated-world-ground', kind: 'action', lane: 'world-ground',
    title: 'Every talus fan at the rim sits ON the ground: no base-ring vertex '
      + 'of a rim-scree instance floats more than 0.6 m above the terrain',
    timeout: 60000,
    settle: 1200,
    assert: `(async () => {
      const ctx = __CTX__;
      const T = ctx.terrain;
      const targets = [];
      ctx.scene.traverse((o) => {
        if (o.isInstancedMesh && /^rim-scree/.test(o.name || '')) targets.push(o);
      });
      if (!targets.length) return { pass: null, detail: 'SKIP: no rim-scree instances' };
      const rows = [];
      for (const im of targets) {
        const m = im.instanceMatrix.array;
        const pos = im.geometry.attributes.position;
        /* The BASE RING, not every low vertex. A cone's base cap has a centre
         * vertex at local (0,0,0) that is buried inside the mound and never
         * drawn against the sky; measuring it would fail a fan that is seated
         * perfectly in a hollow. What reads as "floating" is the visible LIP,
         * so that is what is measured: local y at the base, radius >= 0.5. */
        let minY = Infinity;
        for (let i = 0; i < pos.count; i++) minY = Math.min(minY, pos.getY(i));
        const ring = [];
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i);
          const rr = Math.hypot(pos.getX(i), pos.getZ(i));
          if (y <= minY + 0.06 && rr >= 0.5) ring.push([pos.getX(i), y, pos.getZ(i)]);
        }
        if (!ring.length) continue;
        for (let i = 0; i < im.count; i++) {
          const o = i * 16;
          let worst = -Infinity, at = null;
          for (const [lx, ly, lz] of ring) {
            const px = m[o] * lx + m[o + 4] * ly + m[o + 8] * lz + m[o + 12];
            const py = m[o + 1] * lx + m[o + 5] * ly + m[o + 9] * lz + m[o + 13];
            const pz = m[o + 2] * lx + m[o + 6] * ly + m[o + 10] * lz + m[o + 14];
            const gap = py - T.getHeight(px, pz);
            if (gap > worst) { worst = gap; at = [+px.toFixed(1), +pz.toFixed(1)]; }
          }
          rows.push({ gap: +worst.toFixed(2), at, r: +Math.hypot(m[o + 12], m[o + 14]).toFixed(0) });
        }
      }
      rows.sort((a, b) => b.gap - a.gap);
      const over = rows.filter((r) => r.gap > 0.6);
      const inPlay = rows.filter((r) => r.r < 345);
      return {
        pass: over.length === 0,
        detail: {
          fans: rows.length, over06: over.length,
          worst: rows[0], median: rows[Math.floor(rows.length / 2)].gap,
          worstInPlay: inPlay[0] || null,
        },
      };
    })()`,
  },

  /* --------------------------------------------------------------------- */
  {
    id: 'A62-rim-face-lit-world-ground', kind: 'action', lane: 'world-ground',
    title: 'The boundary escarpment seen from inside the play disc is never a '
      + 'black void: >= 35% of the lit meadow luma at 08:00, 12:00 and 17:00',
    timeout: 90000,
    settle: 1500,
    assert: `(async () => {
      ${KIT}
      const p = ctx.player;
      p._updateCamera = () => {};
      if (ctx.studio) ctx.studio.update = () => {};
      ctx.environment?.setWeather?.('clear', 0);
      const W = renderer.domElement.width, H = renderer.domElement.height;
      const buf = new Uint8Array(W * H * 4);
      const luma = (x0, y0, w, h) => {
        gl.readPixels(x0, y0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        let s = 0;
        for (let i = 0; i < w * h; i++) {
          s += 0.3 * buf[i * 4] + 0.59 * buf[i * 4 + 1] + 0.11 * buf[i * 4 + 2];
        }
        return s / (w * h);
      };
      const rows = [];
      for (const hr of [8, 12, 17]) {
        ctx.environment?.setTime?.(hr);
        /* Stand at r=300, INSIDE PLAY_RADIUS, and look at the wall the player
         * actually walks into. V33 films the same massif from the camp at
         * 300+ m, where the aerial haze alone lifts it to a readable value;
         * this is the framing that catches an unlit near face. */
        parkPlayer(0, -300);
        ctx.vegetation?.forceStream?.(0, -300);
        let y = T.getHeight(0, -300);
        cam.fov = 55; cam.updateProjectionMatrix();
        cam.position.set(0, y + 2.0, -300);
        cam.lookAt(0, y + 40, -420);
        cam.updateMatrixWorld(true);
        draw(6);
        const wall = luma(Math.round(W * 0.25), Math.round(H * 0.55),
          Math.round(W * 0.5), Math.round(H * 0.3));
        // reference: the lit meadow at the same hour
        parkPlayer(-40, -60);
        ctx.vegetation?.forceStream?.(-40, -60);
        y = T.getHeight(-40, -60);
        cam.position.set(-40, y + 3.2, -60);
        cam.lookAt(-32, y - 2, -52);
        cam.updateMatrixWorld(true);
        draw(6);
        const meadow = luma(Math.round(W * 0.25), Math.round(H * 0.2),
          Math.round(W * 0.5), Math.round(H * 0.4));
        rows.push({ hour: hr, wall: +wall.toFixed(1), meadow: +meadow.toFixed(1),
          ratio: +(wall / Math.max(1, meadow)).toFixed(3) });
      }
      const worst = Math.min(...rows.map((r) => r.ratio));
      return { pass: worst >= 0.35, detail: { rows, worst } };
    })()`,
  },

  /* --------------------------------------------------------------------- */
  {
    /* A63 is taken by `progression` (A63-loot-reveals), so this one carries the
     * lane suffix, per the round-4 id rule. */
    id: 'A63-bedding-planar-world-ground', kind: 'action', lane: 'world-ground',
    title: 'The rim\'s bedding term is a set of PLANES, not a wood grain: the '
      + 'bed-height field never climbs faster than 0.9 m per metre walked, the '
      + 'beds are 16-40 m thick, and they still render',
    timeout: 90000,
    settle: 1500,
    assert: `(async () => {
      ${KIT}
      /* WHAT THIS GUARDS, AND WHY IT MEASURES A FIELD AND NOT A SCREENSHOT.
       *
       * The "wood veneer / fingerprint" that two judges filmed on the massif
       * was the strata shader's bedding term, isolated on film with the
       * composer bypassed (shots/wg-r2-gate-direct*.png: constant vertex
       * colours, analytic filtered normals, no terracing, no shadows and no
       * GTAO all left it untouched; zeroing THIS term alone removed it).
       *
       * Its defect was geometric. The bedding "plane" had an azimuth that was
       * a function of position, applied through dot(vWPos.xz, dir) * 0.44 —
       * a lever arm of up to 176 m — so the bed-height field climbed by a
       * MEDIAN of 2.4 m and a p99 of 12.0 m for every metre walked sideways.
       * Beds 20-40 m thick with a gradient of 12 cycle every ~2 m of ground,
       * which at 350 m is sub-pixel: that is the grain. A plane, by
       * definition, has a constant gradient equal to its dip.
       *
       * No screenshot statistic separates that from honest bedding — measured,
       * on the difference of two real frames: the beds sit under rock grain,
       * aerial haze and the sun's own shading, and orientation and periodicity
       * scores both came out BETTER for the broken build than the fixed one.
       * So the gate bounds the field, through terrain.beddingAt(), the JS
       * mirror published beside the shader. Fixed build: median 0.257, p99
       * 0.386, max 0.403.
       *
       * The second half of the gate stops the first half being satisfied by
       * deleting the bedding: it renders the same frame with the beds on and
       * off (terrain.setStrataStrength) and requires the difference to be
       * really there. V33 asks the wall FOR strata.
       */
      if (typeof T.beddingAt !== 'function' || typeof T.setStrataStrength !== 'function') {
        return { pass: null, detail: 'SKIP: terrain.beddingAt / setStrataStrength not published' };
      }
      const g = [], th = [];
      const e = 0.5;
      for (let a = 0; a < 6.283; a += 0.02) {
        for (let rr = 300; rr <= 430; rr += 4) {
          const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
          const y = T.getHeight(x, z);
          const b = T.beddingAt(x, y, z);
          const gx = (T.beddingAt(x + e, y, z).bh - T.beddingAt(x - e, y, z).bh) / (2 * e);
          const gz = (T.beddingAt(x, y, z + e).bh - T.beddingAt(x, y, z - e).bh) / (2 * e);
          g.push(Math.hypot(gx, gz));
          th.push(b.thick);
        }
      }
      g.sort((p, q) => p - q);
      const quant = (t) => g[Math.min(g.length - 1, Math.floor(t * g.length))];
      const gradMax = g[g.length - 1];
      const thickMin = Math.min(...th), thickMax = Math.max(...th);

      /* --- and the beds must still be on the wall ------------------------ */
      const p = ctx.player;
      p._updateCamera = () => {};
      if (ctx.studio) ctx.studio.update = () => {};
      ctx.environment?.setWeather?.('clear', 0);
      ctx.environment?.setTime?.(12.0);
      // core-platform's GTAO is blended out for this measurement: its tile grid
      // is a separate artefact on the same pixels and is reported separately.
      const gtaoWas = [];
      for (const ps of (engine.composer?.passes || [])) {
        if (ps && ps.constructor && /GTAO/i.test(ps.constructor.name)) {
          gtaoWas.push([ps, ps.enabled, ps.blendIntensity]);
          ps.enabled = false;
          if ('blendIntensity' in ps) ps.blendIntensity = 0;
        }
      }
      const hidden = [];
      for (const gr of [ctx.vegetation?.group, ctx.props?.group, ctx.machines?.group]) {
        if (gr && gr.visible) { gr.visible = false; hidden.push(gr); }
      }
      parkPlayer(0, -250);
      const wy = T.getHeight(0, -250);
      cam.fov = 52; cam.updateProjectionMatrix();
      cam.position.set(0, wy + 5.0, -250);
      cam.lookAt(0, 80, -400);
      cam.updateMatrixWorld(true);
      const W = renderer.domElement.width, H = renderer.domElement.height;
      const grab = () => {
        draw(4);
        const buf = new Uint8Array(W * H * 4);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        return buf;
      };
      let A, B;
      try {
        T.setStrataStrength(1); A = grab();
        T.setStrataStrength(0); B = grab();
      } finally {
        // never leave the scene mutated for the gates that run after this one
        T.setStrataStrength(1);
        for (const gr of hidden) gr.visible = true;
        for (const [ps, en, bi] of gtaoWas) {
          ps.enabled = en;
          if ('blendIntensity' in ps) ps.blendIntensity = bi;
        }
      }
      let sq = 0, n = 0, peak = 0;
      const x0 = Math.round(W * 0.10), x1 = Math.round(W * 0.92);
      const y0 = Math.round(H * 0.38), y1 = Math.round(H * 0.88);
      for (let sy = y0; sy < y1; sy += 2) {
        for (let sx = x0; sx < x1; sx += 2) {
          const o = (sy * W + sx) * 4;
          const d = (0.2126 * (A[o] - B[o]) + 0.7152 * (A[o + 1] - B[o + 1])
                   + 0.0722 * (A[o + 2] - B[o + 2])) / 255;
          sq += d * d; n++;
          const ab = Math.abs(d); if (ab > peak) peak = ab;
        }
      }
      const bedRms = Math.sqrt(sq / Math.max(1, n));
      const detail = {
        samples: g.length,
        gradP50: +quant(0.5).toFixed(3), gradP99: +quant(0.99).toFixed(3),
        gradMax: +gradMax.toFixed(3),
        thick: [+thickMin.toFixed(1), +thickMax.toFixed(1)],
        bedRms: +bedRms.toFixed(5), bedPeak: +peak.toFixed(4),
      };
      const pass = gradMax <= 0.9
        && thickMin >= 16 && thickMax <= 40
        && bedRms >= 0.006 && peak >= 0.05;
      return { pass, detail };
    })()`,
  },
];
