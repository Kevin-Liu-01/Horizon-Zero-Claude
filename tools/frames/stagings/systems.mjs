/**
 * Area E's Milestone 2 frames and their stagings (systems): F44 the re-survey at Benchmark 1, F46 the TRADE screen;
 * F35 (with settlements) and F38 (with instruments) are staged in those lanes' files. Contract: ./index.mjs.
 */
export const lane = 'systems';
/** @type {object[]} frameset.json-shaped frame definitions, `in: 'M2'` */
export const frames = [];
/** @type {Record<string, { world?: Function, beforeFreeze?: Function }>} in-page hooks per frame id */
export const stagings = {};
