/**
 * DRAW OWNERS: the registration table for draw attribution (moved out of the retired W0b check file at M0.3
 * R4a; the rows are unchanged). A top-level scene child is REGISTERED to an owner when its name matches that
 * owner's pattern; draws from a scene child that matches none (or has no name) are UNATTRIBUTED. Lights and
 * their targets draw nothing themselves and are never hidden. The post chain is not a scene child and is
 * measured as its own row. Each owner names the lane(s) that answer for its draws.
 */
export const DRAW_OWNERS = Object.freeze([
  { id: 'terrain-sky-sea', row: 'terrain, skirt, sky, sea', lanes: 'world-ground, world-sky',
    re: /^(terrain|terrain-?skirt|skirt|sky|sky-?dome|sea|ocean|water|river-?water|far-?ridges|ridges?|horizon-?ring|clouds?|cloud-?sea)$/i },
  { id: 'ground-scatter', row: 'ground scatter', lanes: 'world-ground', re: /^(ground-?)?scatter|^pebbles|^ground-?cover|^rock-?scatter/i },
  { id: 'vegetation', row: 'vegetation chunks', lanes: 'world-ground', re: /^vegetation|^grass|^trees?$|^shrubs?/i },
  { id: 'landmarks-places', row: 'landmarks + places', lanes: 'world-props',
    re: /^(world-)?props?$|landmark|^places?$|^sites?$|^(world-)?rockworks$|^gather-nodes$|^(world-)?activities$|^fieldbooks$|megastructure/i },
  { id: 'settlement', row: 'settlement kit', lanes: 'settlements', re: /settlement|^(hunter-)?camp$|hamlet/i },
  { id: 'instruments', row: 'Instruments', lanes: 'instruments lanes (legacy kinds: instruments-core / -b)', re: /^machines?$|^instruments?$|-machine$|-instrument$/i },
  { id: 'lamp-beams', row: 'lamp beams', lanes: 'instruments-core', re: /beam/i },
  { id: 'hero', row: 'Brea + gear', lanes: 'hero-body, armory', re: /^(player|hero|brea)\b/i },
  { id: 'npcs', row: 'NPCs', lanes: 'settlements', re: /^npcs?$|^npc-crowd$|^people$/i },
  { id: 'vfx-ui-pooled', row: 'VFX, UI, pooled', lanes: 'combat-kit, world-props (fauna), world-sky (weather)',
    re: /particles?|vfx|-fx$|^fx$|arrows?|trails?|decals?|projectiles?|^thrown-|pool|fauna|weather|rain|dust|flocks|motes/i },
]);
