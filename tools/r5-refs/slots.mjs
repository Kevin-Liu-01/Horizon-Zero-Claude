/**
 * Reference slots (gates-perf W0b). One row per reference image a visual gate is judged against.
 *   lane     the folder: reference/r5/<lane>/
 *   slot     the file stem: reference/r5/<lane>/<slot>.jpg (gates name `reference/r5/<lane>/<slot>`)
 *   gates    the visual gate ids judged against it
 *   subject  what the judge compares (pose / framing), one line
 *   query    the Commons search that found the candidates (`--search <slot>` re-runs it)
 *   file     the PINNED Commons file (exact title) the set uses; null = not chosen yet
 */
const INTRO = 'Licence-clean pose and framing references for the carried Round-4 visual rows (`tools/gates.r5.carried.mjs`) '
  + 'that gates-perf re-staged: the kept-system rows R33 (c) grades at W0a (V1–V4, V12–V14, V21) and the slots the '
  + 'lance rows already name (V46–V49, melee re-stages them at W1). They replace the deleted Round-4 stills (top-level '
  + '`reference/MANIFEST.md`). A judge compares body mechanics and framing, never costume or likeness.';

export const SLOTS = [
  { lane: 'gates-perf', intro: INTRO, slot: 'run-side', gates: ['V12-sprint-vs-reference', 'V1-sprint-frame'],
    subject: 'sprint, true side view: forward lean, opposing arm swing beside the body, long stride, contact on the ground line',
    query: 'Warrior Games track sprint', file: 'File:Marine team makes winning sprint toward Chairman’s Cup during 2013 Warrior Games 130514-M-HQ478-240.jpg' },
  { lane: 'gates-perf', slot: 'run-rear', gates: ['V1-sprint-frame'],
    subject: 'runner from behind / rear three-quarter: arms swing fore-aft beside the body, counter-rotation, trailing leg',
    query: 'runner seen from behind', file: 'File:The Operation Jack Marathon? (5108837840).jpg' },
  { lane: 'gates-perf', slot: 'idle-stand', gates: ['V2-idle-frame'],
    subject: 'relaxed standing, weight on one hip (contrapposto), asymmetric relaxed arms',
    query: 'contrapposto statue', file: 'File:Marcellus or Drusus major Statue MANN 8044.png' },
  { lane: 'gates-perf', slot: 'crouch-stalk', gates: ['V3-crouch-stalk'],
    subject: 'crouched stalking walk: low silhouette, torso pitched forward, one hand low for balance',
    query: 'soldier crouching patrol', file: 'File:SC 191880-S - Yank infantrymen crouch low to avoid German snipers as they patrol on an island near St. Germain, France. 29 July, 1944.jpg' },
  { lane: 'gates-perf', slot: 'draw-side', gates: ['V24-draw-vs-reference', 'V4-aim-anchor'],
    subject: 'archer at full draw, side view: knuckles at the jaw, forearm in line with the arrow, straight bow arm',
    query: 'archery competition athlete draws', file: 'File:Marine Corps Trials 2015 150304-M-FA225-009.jpg' },
  { lane: 'gates-perf', slot: 'draw-front', gates: ['V4-aim-anchor', 'V13-aim-strafe'],
    subject: 'archer at full draw seen from the front quarter: draw hand at the face, elbow level, torso turned to the target',
    query: 'Warrior Games archery', file: 'File:Archery at the 2017 Warrior Games 34896116493 31aee156df b.jpg' },
  { lane: 'gates-perf', slot: 'slope-stand', gates: ['V14-slope-contour'],
    subject: 'standing or walking across a steep cross-slope: soles banked with the ground, uphill leg shorter',
    query: 'hiker steep slope', file: 'File:NPS Ranger Cinimin Kofford guides visitors on a scree slope, near mile 56 of the park road, during a discovery hike on August 22 (babdc5b4-44fa-4f79-8dfd-f0f21938869e).JPG' },
  { lane: 'gates-perf', slot: 'chase-camera', gates: ['V21-camera-cover'],
    subject: 'a walker seen from behind and above at a few metres among tree trunks, nothing covering the figure (third-person framing)',
    query: 'hiker trail forest', file: 'File:Hiker on Deception Creek Trail, Willamette National Forest (34079846923).jpg' },
  { lane: 'gates-perf', slot: 'lance-ready-side', gates: ['V46-spear-ready'],
    subject: 'one-handed spear / staff guard: haft forward and down across the thigh, free hand open',
    query: 'pugil stick', file: 'File:Photo Gallery, Marine recruits practice bayonet techniques during pugil stick training 130729-M-PG802-012.jpg' },
  { lane: 'gates-perf', slot: 'lance-windup', gates: ['V47-melee-swing'],
    subject: 'pole or spear wound up before a strike: weight back, haft high and forward of the head',
    query: 'pugil stick', file: 'File:Flickr - The U.S. Army - Pugil stick fight.jpg' },
  { lane: 'gates-perf', slot: 'lance-strike', gates: ['V47-melee-swing'],
    subject: 'thrust or strike with a long pole: whole body extended over the lead foot',
    query: 'pugil stick', file: 'File:Pugil stick training DVIDS1112788.jpg' },
  { lane: 'gates-perf', slot: 'lance-follow', gates: ['V47-melee-swing'],
    subject: 'follow-through of a pole strike: haft below horizontal, weight over the lead foot',
    query: 'bayonet training', file: 'File:Drills - Infantry - Bayonet - Training camp activities. Bayonet instruction, Camp Dick, Texas - NARA - 31475672.jpg' },
  { lane: 'gates-perf', slot: 'lance-back-carry', gates: ['V48-spear-holster', 'V49-draw-from-jog'],
    subject: 'a long shaft slung diagonally across the back, butt low at one hip, tip above the opposite shoulder',
    query: 'rifle on his back', file: 'File:Young man with a rifle on his back standing on rocks, NINO F Scholten Choses interessantes 19.tiff' },
];
