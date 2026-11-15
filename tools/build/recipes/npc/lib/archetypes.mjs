/**
 * CALIMA — the archetype table (bible §6.3, archetypes 1-9; settlements W1 by R56 + R57 c). Data only:
 * who each person is, what their face does (game millimetres at the seven landmarks of
 * A-npc-face-delta), what they wear and what they do. The construction is lib/human.mjs.
 *
 * Face vectors: [dx, dy, dz] at each landmark, game mm, +x her left, +y up, +z forward; cheek and
 * jaw are given for the left and mirrored. `age` drives the paint (creases, jowls, sun spots), `lidDrop`
 * the upper lid, `tone` the mid-cheek, `iris` the eye, `hair` the hair and brows.
 *
 * Skin tones stay in the island's range around Brea's #8A5A3C (bible §3.5), darker and lighter by
 * person and by work. A person's outfit dye is in the faction's palette (bible §6.1).
 *
 * `clips` carry the clip names the runtime plays (UAL2 native, UAL1 baked onto UBC by clips.mjs); `walk`
 * is the walk style of bible §6.2: clip, time scale, posture overlay (rad), arm-swing gain.
 *
 * `clips.stage` is what the W1 staging plays where the bible's clip needs a place that stands at W2 (a bench, a rail, a boat).
 *
 * Archetype 7 was the adolescent (male at the bible's uniform 0.90, the younger read from the face, bible §6.2); fix round 1
 * cut that variant by bible §8.9's fallback: it is a young adult farmhand now (its row says why).
 */
export const PAN = { orchil: '#6B3F73', orchilDeep: '#4F2A5C', orchilNight: '#3A2146', linen: '#D9CFBA', linenDirty: '#BFB29B', salt: '#E4E0D6', brass: '#B08A45', carmine: '#A3213A', basalt: '#4A4A50', esparto: '#B59A62', tar: '#17151A', palm: '#C2A566', leather: '#5C3D29', lapilli: '#1C1B1E', wood: '#6E5238', iron: '#3C3A3C' };
export const HOLDS = { lapilli: '#1C1B1E', rust: '#8E3B23', rustDeep: '#6A2A1A', wool: '#BDB19A', woolDark: '#7C7262', olive: '#5E5B38', leather: '#4B3122', leatherDark: '#2F2018', mica: '#8D8267', carmine: '#A3213A', carmineStain: '#7A1A2C', brass: '#A07A3F', wood: '#5D4530', iron: '#343236', wicker: '#9A7F52', seed: '#9D9A68' };

export const ARCHETYPES = [
  {
    // (M1.5c: her face read 4.5 mm from Brea's, under the cast's 5.6 mm "alike" line (faces.mjs): a broad face, a low flat nose
    // and a wide jaw now; hoop earrings and a partial paste mark, the Harvester's)
    id: 'salt-raker', n: 1, name: 'Salt Raker', faction: 'pan', family: 'Peasant', sex: 'F', height: 1.72, age: 34, browK: 0.85,
    tone: '#7F5238', iris: '#2E2018', amber: '#5A381E', hair: '#191310',
    face: { noseBridge: [0, -1.5, -2.5], noseTip: [0, -2.5, -3.5], cheek: [6.5, 1.0, 2.0], jaw: [6.5, -2.5, 1.5], chin: [0, -1.5, -2.5], brow: [0, -1.5, 1.5], upperLip: [0, -1.0, 2.0] },
    head: { kind: 'scarf', dye: PAN.linen, lining: PAN.linenDirty, seed: 11, tail: 'left' },
    earrings: { r: 0.012 }, marks: { paste: { xMax: 0.034 } },
    outfit: { key: 'raker' },
    clips: { idle: ['Farm_Harvest', 'Consume', 'Idle_Loop'], walk: { clip: 'Walk_Loop', ts: 0.95, lean: 0.105, swing: 0.85 }, carry: 'rake' },
  },
  {
    id: 'guild-matron', n: 2, name: 'Guild Matron', faction: 'pan', family: 'Peasant', sex: 'F', height: 1.64, age: 63, browK: 0.72,
    tone: '#8E6547', iris: '#3A2A1E', amber: '#6A4A2C', hair: '#6A6660', hairPaint: '#3E3B38', greyHair: true,
    face: { noseBridge: [0, -1.0, 1.5], noseTip: [0, -5.0, 6.0], cheek: [7.0, -3.5, 1.0], jaw: [7.0, -1.5, 2.5], chin: [0, -8.0, 0.5], brow: [0, -2.0, -1.5], upperLip: [0, -3.0, -3.5] },
    // M1.5b (Q6, violet as an accent): the wrap is the guild's salt-white linen, orchil only on its lining and her sash
    head: { kind: 'wrap', dye: PAN.salt, lining: PAN.orchil, seed: 22, bun: true, tail: 'left' },
    outfit: { key: 'matron' },
    // (M1b closing fix: at her quest spot she stood 293.5 s through the two-hour log, bar 90 s outside a working clip) she tallies
    // the morning's salt between her idle beats ('Interact', a working clip; routines.js WORK_CLIPS); a quest scene with her
    // in its cast holds her in talk (people/index.js _beat). The first stays the fold-armed stand every frame films her in
    clips: { idle: ['Idle_FoldArms_Loop', 'Interact', 'Idle_Talking_Loop', 'Interact', 'Idle_No_Loop', 'Interact'], walk: { clip: 'Walk_Formal_Loop', ts: 0.85, lean: -0.02, swing: 0.6 } },
  },
  {
    id: 'salt-porter', n: 3, name: 'Salt Porter', faction: 'pan', family: 'Peasant', sex: 'M', height: 1.82, age: 27, browK: 1.0,
    tone: '#7A4C33', iris: '#2A1C14', amber: '#553318', hair: '#15110F',
    face: { noseBridge: [0, 0.5, 5.5], noseTip: [0, 3.0, -1.0], cheek: [3.0, 3.0, 4.0], jaw: [5.5, -4.5, 1.0], chin: [0, -3.0, 6.5], brow: [0, 1.0, 4.0], upperLip: [0, 1.0, -1.0] },
    // (M1.5c: the Trader's wide straw hat over a salt-white sweatband, the sash orchil; was a carmine band)
    head: { kind: 'band', dye: PAN.salt, lining: PAN.linenDirty, seed: 33, hair: 'crop', tail: 'left', thin: true },
    hat: 'palm', faceK: 1.3,
    outfit: { key: 'porter' },
    clips: { idle: ['Consume', 'Yes', 'Idle_Loop'], walk: { clip: 'Walk_Loop', ts: 1.0, lean: 0.03, swing: 1 } },
  },
  {
    id: 'boat-caulker', n: 4, name: 'Boat-Caulker', faction: 'pan', family: 'Peasant', sex: 'M', height: 1.74, age: 52, browK: 1.12,
    tone: '#6F4830', iris: '#2E2219', amber: '#5A3C22', hair: '#231F1D',
    face: { noseBridge: [0, -2.0, -1.5], noseTip: [0, -3.5, 3.5], cheek: [7.5, -2.0, -0.5], jaw: [3.0, -1.0, -2.5], chin: [0, -6.5, -1.0], brow: [0, -2.5, 7.5], upperLip: [0, -3.5, 2.5] },
    // (M1.5c, Q6 and the Sailor: his rag the orchil accent, a hoop in each ear; was basalt)
    head: { kind: 'rag', dye: PAN.orchilDeep, lining: PAN.orchilNight, seed: 44, tail: 'right', beard: 'full' },
    earrings: { r: 0.01 }, faceK: 1.08,
    marks: { tar: true },
    outfit: { key: 'caulker' },
    clips: { idle: ['Fixing_Kneeling', 'Push_Loop', 'Idle_Loop'], stage: ['Fixing_Kneeling', 'Interact', 'Idle_Loop'], walk: { clip: 'Walk_Loop', ts: 0.9, lean: 0.03, swing: 0.9, stance: 0.06 } },
  },
  {
    // Lantern-Keeper Mise (bible §6.2; M1.5c): the Healer calling (head wrap, a paste mark, the layered shawl; outfits.mjs keeper),
    // a salt-white wrap lined in orchil (Q6); was an orchil hood
    id: 'lantern-keeper', n: 5, name: 'Lantern-Keeper Mise', faction: 'pan', family: 'Peasant', sex: 'F', height: 1.68, age: 68, browK: 0.68,
    tone: '#92694B', iris: '#3F3024', amber: '#6F5233', hair: '#77736C', hairPaint: '#45423E', greyHair: true,
    face: { noseBridge: [0, 1.2, 8.0], noseTip: [0, -2.0, 8.5], cheek: [-4.0, 0.5, -3.0], jaw: [-4.0, -3.0, -3.5], chin: [0, -2.0, 8.0], brow: [0, -1.0, 7.5], upperLip: [0, -1.0, -6.0] },
    head: { kind: 'wrap', dye: PAN.salt, lining: PAN.orchil, seed: 55, tail: 'left' },
    marks: { paste: { xMax: 0.026 } }, faceK: 1.15,
    outfit: { key: 'keeper' },
    clips: { idle: ['Idle_Lantern_Loop', 'Sitting_Idle_Loop', 'Idle_Rail_Call'], stage: ['Idle_Lantern_Loop', 'Idle_Rail_Call', 'Idle_Talking_Loop'], walk: { clip: 'Walk_Loop', ts: 0.75, lean: 0.175, swing: 0.55 }, carry: 'cane' },
  },
  {
    id: 'pit-farmer', n: 6, name: 'Pit Farmer', faction: 'holds', family: 'Ranger', sex: 'M', height: 1.78, age: 41, browK: 1.0,
    tone: '#75492F', iris: '#30221A', amber: '#5C3A20', hair: '#1E1815',
    face: { noseBridge: [0, 1.5, 8.0], noseTip: [0, -4.0, 7.0], cheek: [-3.5, 2.0, -1.5], jaw: [-4.5, -7.0, -1.5], chin: [0, -8.0, 1.5], brow: [0, 2.0, 1.5], upperLip: [0, -2.5, -4.0] },
    head: { kind: 'cap', dye: HOLDS.rust, lining: HOLDS.rustDeep, seed: 66, tail: 'right', goggles: true, beard: 'stubble' },
    outfit: { key: 'farmer' },
    clips: { idle: ['Farm_PlantSeed', 'Farm_Watering', 'Farm_Harvest'], walk: { clip: 'Walk_Loop', ts: 0.92, lean: 0.06, swing: 0.9 }, hand: ['Farm_Watering'] },
  },
  {
    // Bible §8.9's fallback, applied (settlements fix round 1): the adolescent variant is CUT. No face field on the UBC male head
    // read fifteen (V-npc-builds r0: "about 18-20"; a shorter lower face and a smaller nose read as a deformed adult), so the
    // Tiller-Follower is a young adult farmhand with the seed bag, at full scale, as the fallback beat says ("adult Pit Farmers
    // with seed bags" trail the Tiller). The build keeps the `adolescent` path for a later body that can carry it.
    id: 'tiller-follower', n: 7, name: 'Tiller-Follower', faction: 'holds', family: 'Ranger', sex: 'M', height: 1.74, age: 21, browK: 0.78,
    tone: '#83573A', iris: '#2C1F16', amber: '#5A3A1F', hair: '#181210',
    face: { noseBridge: [0, 0, -3.5], noseTip: [0, 5.0, -6.0], cheek: [4.0, 0, 5.2], cheekS: 0.027, jaw: [-5.0, 4.0, 0.5], chin: [0, 4.5, -4.5], brow: [0, 1.5, -4.0], upperLip: [0, 2.5, 2.5] },
    head: { kind: 'band', dye: HOLDS.wool, lining: HOLDS.woolDark, seed: 77, hair: 'crop', tail: 'left', thin: true },
    outfit: { key: 'follower' },
    clips: { idle: ['Idle_Rail_Loop', 'Farm_PlantSeed', 'Idle_Loop'], stage: ['Farm_PlantSeed', 'Idle_Loop', 'Idle_Talking_Loop'], walk: { clip: 'Walk_Loop', ts: 1.0, lean: 0.04, swing: 1 } },
  },
  {
    id: 'cochineal-picker', n: 8, name: 'Cochineal Picker', faction: 'holds', family: 'Ranger', sex: 'F', height: 1.70, age: 27, browK: 0.82,
    tone: '#865B3E', iris: '#2B1E17', amber: '#5A3A22', hair: '#1A1411',
    face: { noseBridge: [0, -0.5, -3.0], noseTip: [0, 4.5, -5.5], cheek: [5.0, 0.5, 5.6], cheekS: 0.025, jaw: [-3.6, 4.6, 2.4], chin: [0, 4.6, -5.2], brow: [0, 1.0, -3.5], upperLip: [0, 2.0, 3.5] },
    head: { kind: 'scarf', dye: HOLDS.carmine, lining: HOLDS.rustDeep, seed: 88, tail: 'left', knot: true },
    marks: { carmine: true },
    outfit: { key: 'picker' },
    clips: { idle: ['PickUp_Table', 'Interact', 'Idle_Talking_Loop'], walk: { clip: 'Walk_Loop', ts: 1.0, lean: 0.0, swing: 1 } },
  },
  {
    id: 'tube-smith', n: 9, name: 'Tube Smith', faction: 'holds', family: 'Ranger', sex: 'M', height: 1.84, age: 43, browK: 1.12,
    tone: '#6B432C', iris: '#2A1E17', amber: '#553519', hair: '#1B1613',
    face: { noseBridge: [1.5, -1.5, 3.0], noseTip: [2.0, -1.5, -2.5], cheek: [6.0, 4.0, 7.0], jaw: [9.0, -6.0, 3.0], chin: [0, -5.0, 8.5], brow: [0, -1.0, 9.0], upperLip: [0, -1.0, 3.5] },
    head: { kind: 'rag', dye: HOLDS.leatherDark, lining: HOLDS.lapilli, seed: 99, tail: 'left', beard: 'full' },
    marks: { burn: true },
    outfit: { key: 'smith' },
    clips: { idle: ['TreeChopping_Loop', 'Chest_Open', 'Idle_Loop'], walk: { clip: 'Walk_Loop', ts: 0.9, lean: 0.04, swing: 0.7 } },
  },

  /*
   * M1.5c — the slice's cast: unnamed Pan Houses people from archetypes 1, 3, 4 and 5 beside the four above, each a second person of
   * that archetype's calling (the Harvester, the Trader, the Sailor, the Healer) with a face, age, height, skin, hair, headwear and
   * earrings of their own, and their own copy of the calling's dress re-dyed (`dyes`), all in salt-white linen with one violet
   * accent (Q6). `rngN` seeds what the build draws at random (hair cards, wrap creases) apart from the first of the archetype.
   */
  {
    id: 'salt-raker-2', n: 1, rngN: 21, name: 'Salt Raker', faction: 'pan', family: 'Peasant', sex: 'F', height: 1.77, age: 24, browK: 0.8,
    tone: '#8C5E40', iris: '#33241A', amber: '#5E3C20', hair: '#16100D',
    face: { noseBridge: [0, 2.0, 7.5], noseTip: [0, 1.5, 6.5], cheek: [-3.0, 2.5, 3.5], jaw: [-5.0, -7.0, -2.0], chin: [0, -8.0, 4.5], brow: [0, 2.0, 2.5], upperLip: [0, -1.5, 1.0] },
    head: { kind: 'scarf', dye: PAN.salt, lining: PAN.orchil, seed: 121, tail: 'left', knot: true },
    hat: 'none', earrings: { r: 0.014 }, marks: { paste: { xMax: 0.03, dx: 0.004 } },
    // her accent the belt and sash's orchil, a brighter one; the apron undyed
    dyes: { [PAN.orchilDeep]: PAN.orchil, [PAN.salt]: PAN.linen },
    outfit: { key: 'raker' },
    clips: { idle: ['Farm_Harvest', 'Idle_Loop', 'Consume'], walk: { clip: 'Walk_Loop', ts: 1.02, lean: 0.07, swing: 0.95 }, carry: 'rake' },
  },
  {
    id: 'salt-porter-2', n: 3, rngN: 23, name: 'Salt Porter', faction: 'pan', family: 'Peasant', sex: 'M', height: 1.76, age: 34, browK: 1.08,
    tone: '#6A4330', iris: '#271A12', amber: '#4E2F17', hair: '#130F0D',
    face: { noseBridge: [0, -2.0, 3.0], noseTip: [0, -4.5, 5.0], cheek: [5.5, -2.0, 1.0], jaw: [7.5, -2.0, 2.5], chin: [0, -6.5, 3.0], brow: [0, -1.5, 6.5], upperLip: [0, -2.5, 2.5] },
    head: { kind: 'band', dye: PAN.orchil, lining: PAN.orchilDeep, seed: 123, hair: 'crop', tail: 'right', beard: 'stubble' },
    hat: 'none', faceK: 1.3,
    // no hat: the band is his accent, so the sash is undyed linen
    dyes: { [PAN.orchil]: PAN.linenDirty, [PAN.linen]: PAN.salt },
    outfit: { key: 'porter' },
    clips: { idle: ['Yes', 'Idle_Loop', 'Consume'], walk: { clip: 'Walk_Loop', ts: 0.96, lean: 0.05, swing: 0.95 } },
  },
  {
    id: 'boat-caulker-2', n: 4, rngN: 24, name: 'Boat-Caulker', faction: 'pan', family: 'Peasant', sex: 'M', height: 1.69, age: 46, browK: 1.0,
    tone: '#7C5034', iris: '#2B1F17', amber: '#583A20', hair: '#1A1513',
    face: { noseBridge: [0, 1.5, 4.5], noseTip: [0, 4.5, -3.0], cheek: [-2.5, 3.5, 5.0], jaw: [2.5, -5.0, -1.5], chin: [0, 2.0, 7.0], brow: [0, 3.0, 2.0], upperLip: [0, 2.5, -2.0] },
    head: { kind: 'band', dye: PAN.salt, lining: PAN.linenDirty, seed: 124, hair: 'crop', tail: 'left', beard: 'full' },
    earrings: { r: 0.011 }, faceK: 1.22,
    marks: { tar: true },
    // his violet the cuffs alone; the shirt the cleaner linen
    dyes: { [PAN.linenDirty]: PAN.linen },
    outfit: { key: 'caulker' },
    clips: { idle: ['Push_Loop', 'Fixing_Kneeling', 'Idle_Loop'], stage: ['Interact', 'Fixing_Kneeling', 'Idle_Loop'], walk: { clip: 'Walk_Loop', ts: 0.94, lean: 0.04, swing: 0.9, stance: 0.05 } },
  },
  {
    id: 'lantern-keeper-2', n: 5, rngN: 25, name: 'Lantern-Keeper', faction: 'pan', family: 'Peasant', sex: 'F', height: 1.65, age: 54, browK: 0.75,
    tone: '#7A5036', iris: '#2E2219', amber: '#5A3C22', hair: '#2A2420',
    face: { noseBridge: [0, 0.5, 5.0], noseTip: [0, -1.0, 9.0], cheek: [-4.0, 1.0, -1.0], jaw: [-5.0, -4.0, -2.5], chin: [0, 1.0, 6.0], brow: [0, -2.0, 6.0], upperLip: [0, -2.0, 1.0] },
    head: { kind: 'scarf', dye: PAN.linen, lining: PAN.orchilDeep, seed: 125, tail: 'right' },
    earrings: { r: 0.009 }, marks: { paste: { xMax: 0.022, dx: -0.006 } }, faceK: 1.0,
    // her shawl's ends the deeper orchil, her cloak a little greyer
    dyes: { [PAN.orchil]: PAN.orchilDeep, '#B9A682': '#A89C84' },
    outfit: { key: 'keeper' },
    clips: { idle: ['Idle_Rail_Call', 'Idle_Talking_Loop', 'Idle_Loop'], stage: ['Idle_Talking_Loop', 'Idle_Rail_Call', 'Idle_Loop'], walk: { clip: 'Walk_Loop', ts: 0.82, lean: 0.09, swing: 0.7 }, carry: 'cane' },
  },
];

/**
 * The slice's cast (M1.5c): Lantern-Keeper Mise and the unnamed Pan Houses people of archetypes 1, 3, 4 and 5. Guild Matron Ansel
 * (M1.5b) stands beside them in Saltrow and is not counted here.
 */
export const CAST = ['lantern-keeper', 'salt-raker', 'salt-raker-2', 'salt-porter', 'salt-porter-2', 'boat-caulker', 'boat-caulker-2', 'lantern-keeper-2'];

export const byId = Object.fromEntries(ARCHETYPES.map((a) => [a.id, a]));
