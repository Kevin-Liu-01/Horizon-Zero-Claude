/**
 * Side-by-side comparison builder (Round 3).
 *
 * Usage:
 *   node tools/compare.mjs                    # build all pairs defined below
 *   node tools/compare.mjs --pair before.png after.png --label "Sprint" --out name
 *
 * Each pair renders to shots/compare/<out>.png: BEFORE | AFTER at 800px wide each
 * with a labeled header bar, plus shots/compare/index.html gallery.
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync, existsSync } from 'fs';

const PAIRS = [
  { before: 'shots/b-sprint-side.png', after: 'shots/a2-sprint-side.png', label: 'Sprint — arm drive, hip-hinge lean, running fists', out: 'sprint-side' },
  { before: 'shots/b-sprint-back.png', after: 'shots/a3-sprint-back.png', label: 'Sprint (chase cam) — crossbody swing, spine counter-yaw', out: 'sprint-back' },
  { before: 'shots/b-jog-side.png', after: 'shots/a1-jog-side.png', label: 'Jog — cadence + forward carry', out: 'jog-side' },
  { before: 'shots/b-idle-a.png', after: 'shots/a1-idle-a.png', label: 'Idle — weight shift + breathing amplitude', out: 'idle' },
  { before: 'shots/b-crouch.png', after: 'shots/a1-crouch-side.png', label: 'Crouch — stalk depth, arms-ready coil', out: 'crouch' },
  { before: 'shots/b-strafe-aim.png', after: 'shots/a1-strafe-aim.png', label: 'Aim-walk — upper/lower body split', out: 'strafe-aim' },
  { before: 'shots/b-dodge.png', after: 'shots/a1-dodge-mid.png', label: 'Dodge — tucked shoulder roll mid-frame', out: 'dodge' },
  // environment lane
  { before: 'shots/before-vista.png', after: 'shots/after-vista.png', label: 'Valley vista — grove clustering, sky, props', out: 'env-vista' },
  { before: 'shots/before-river.png', after: 'shots/after-river.png', label: 'Riverbed — cobbles, driftwood, riparian banks', out: 'env-river' },
  { before: 'shots/before-ring-n.png', after: 'shots/after-ring-n.png', label: 'Mountain ring — varied silhouettes, aspect light', out: 'env-ring' },
  { before: 'shots/before-camp.png', after: 'shots/after-camp.png', label: 'Camp — props, watchtower, atmosphere', out: 'env-camp' },
  // hud lane
  { before: 'shots/before-hud-combat.png', after: 'shots/after-hud-combat.png', label: 'Combat HUD — machine status stack, damage numbers', out: 'hud-combat' },
  { before: 'shots/before-loot.png', after: 'shots/after-loot.png', label: 'Loot flow — double-render fixed, popup only', out: 'hud-loot' },
  { before: 'shots/before-wheel.png', after: 'shots/after-wheel.png', label: 'Weapon wheel — HZD language', out: 'hud-wheel' },
  { before: 'shots/before-pause.png', after: 'shots/after-pause.png', label: 'Pause — tribal-tech smoked glass', out: 'hud-pause' },
  // machines lane — the statues walk
  { before: 'shots/sawtooth-before-close.png', after: 'shots/saw-stride-frz.png', label: 'Sawtooth — auto-rigged skeleton, mid-stride', out: 'mach-sawtooth' },
  { before: 'shots/behemoth-before-close.png', after: 'shots/behemoth-slam.png', label: 'Behemoth — slam rears through the spine', out: 'mach-behemoth' },
  { before: 'shots/tj-before-close.png', after: 'shots/tj-stomp-profile.png', label: 'Thunderjaw — biped stomp, tail counterbalance', out: 'mach-thunderjaw' },
  { before: 'shots/npc-before-front.png', after: 'shots/npc-after-front.png', label: 'Camp NPC — vertex-posed at the fire, transmission material culled', out: 'camp-npc' },
  // idle rig fix — Kevin's morning report (v2: IK hand targets, no twist drift)
  { before: 'shots/diag-idle-front.png', after: 'shots/fix2-idle-front.png', label: 'Idle arms — IK hand targets beside the hips, elbows tucked', out: 'idle-hands-front' },
  { before: 'shots/draw-diag-side.png', after: 'shots/fix2-fulldraw.png', label: 'Bow draw — hip-quiver nock flourish, no more skyward elbow', out: 'draw-flourish' },
];

const args = process.argv.slice(2);
const getFlag = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

let pairs = PAIRS;
const pb = getFlag('--pair');
if (pb) {
  const pa = args[args.indexOf('--pair') + 2];
  pairs = [{ before: pb, after: pa, label: getFlag('--label') || 'comparison', out: getFlag('--out') || 'custom' }];
}

mkdirSync('shots/compare', { recursive: true });

const W = 800, LABEL_H = 54;
const made = [];
for (const p of pairs) {
  if (!existsSync(p.before) || !existsSync(p.after)) {
    console.log(`skip ${p.out}: missing ${!existsSync(p.before) ? p.before : p.after}`);
    continue;
  }
  const b = await sharp(p.before).resize(W).toBuffer();
  const a = await sharp(p.after).resize(W).toBuffer();
  const bh = (await sharp(b).metadata()).height;
  const ah = (await sharp(a).metadata()).height;
  const H = Math.max(bh, ah);

  const svg = `<svg width="${W * 2}" height="${LABEL_H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#101418"/>
    <text x="20" y="34" font-family="Helvetica, Arial" font-size="19" letter-spacing="3" fill="#EFE6D5">${p.label.toUpperCase()}</text>
    <text x="${W - 90}" y="34" font-family="Helvetica, Arial" font-size="15" letter-spacing="4" fill="#8a8378">BEFORE</text>
    <text x="${W * 2 - 80}" y="34" font-family="Helvetica, Arial" font-size="15" letter-spacing="4" fill="#DA7756">AFTER</text>
    <rect x="${W - 1}" y="0" width="2" height="100%" fill="#DA7756" opacity="0.5"/>
  </svg>`;

  const out = `shots/compare/${p.out}.png`;
  await sharp({ create: { width: W * 2, height: H + LABEL_H, channels: 3, background: '#101418' } })
    .composite([
      { input: Buffer.from(svg), top: 0, left: 0 },
      { input: b, top: LABEL_H, left: 0 },
      { input: a, top: LABEL_H, left: W },
    ])
    .png()
    .toFile(out);
  console.log(`built ${out}`);
  made.push({ ...p, file: `${p.out}.png` });
}

writeFileSync('shots/compare/index.html', `<!doctype html><meta charset="utf8">
<title>HZC Round 3 — before/after</title>
<body style="background:#101418;color:#EFE6D5;font-family:Helvetica;margin:0;padding:24px">
<h1 style="font-weight:300;letter-spacing:6px">HORIZON ZERO CLAUDE — ROUND 3 COMPARISONS</h1>
${made.map((m) => `<img src="${m.file}" style="width:100%;max-width:1400px;display:block;margin:0 0 28px">`).join('\n')}
</body>`);
console.log(`gallery: shots/compare/index.html (${made.length} pairs)`);
