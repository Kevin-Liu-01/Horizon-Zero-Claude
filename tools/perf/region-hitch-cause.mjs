#!/usr/bin/env node
/**
 * A-region-hitch's CAUSE of a frame over 33 ms (EF1: "the probe names the cause of any frame over 33 ms"), from what the
 * page recorded in it: the GL calls since the frame before (count and ms), the row's marks, the responses that landed and
 * the long-animation-frame scripts. Pure: the page row (tools/perf/region-hitch.mjs) and Node read it, and a saved
 * report can be re-read with it (`node tools/perf/region-hitch-cause.mjs <region-hitch.json>`).
 *
 * Causes, first match: compile (>= 5 ms in compile/link calls, OR a program linked in the frame: with the parallel-compile
 * extension the link returns at once and its cost lands in the GPU process, so the wrapper's ms read 0 while the frame is
 * long), upload (>= 5 ms in texture or buffer calls), fetch/decode (a response or a loader step landed in it), nav (a
 * nav/path script), or unattributed. `during` names the region build step open over the frame (between two of its
 * marks: the step that ENDS at the later mark), e.g. 'malpais:compile'.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const COMPILE = ['compileShader', 'linkProgram', 'getProgramParameter', 'getProgramInfoLog'];
const UPLOAD = ['texImage2D', 'texImage3D', 'texSubImage2D', 'texSubImage3D', 'texStorage2D', 'texStorage3D', 'compressedTexImage2D', 'compressedTexSubImage2D', 'compressedTexImage3D', 'compressedTexSubImage3D', 'generateMipmap'];

export function causeOf(f, marks = [], res = [], loaf = []) {
  const gl = f.gl || {};
  const ms = (ks) => ks.reduce((s, k) => s + (gl[k]?.[1] ?? 0), 0);
  const compile = ms(COMPILE), upload = ms(UPLOAD), buf = ms(['bufferData', 'bufferSubData']);
  const links = gl.linkProgram?.[0] ?? 0, shaders = gl.compileShader?.[0] ?? 0;
  const lo = f.t - f.d - 2, hi = f.t + 2;
  const inFrame = marks.filter((m) => m.t >= lo && m.t <= hi).map((m) => m.tag);
  const fetched = res.filter((r) => r.end >= lo && r.end <= hi).map((r) => r.url);
  const scripts = loaf.filter((l) => l.t <= hi && l.t + l.d >= lo).flatMap((l) => l.scripts || []).slice(0, 6);
  // the build step open over the frame: the first step mark after it, if the one before it is of the same build
  const steps = marks.filter((m) => /^malpais:/.test(m.tag) || ['load-done', 'uploaded-spread', 'registered', 'programs-ready', 'added'].includes(m.tag));
  const before = steps.filter((m) => m.t <= lo).pop(), after = steps.find((m) => m.t >= hi);
  const during = before && after && !/ready|added|released/.test(before.tag) ? after.tag : null;
  let cause = 'unattributed';
  if (compile >= 5 || links > 0) cause = 'compile';
  else if (upload >= 5 || buf >= 5) cause = 'upload';
  else if (fetched.length || inFrame.some((t) => /load-done|uploaded/.test(t))) cause = 'fetch/decode';
  else if (scripts.some((s) => /nav|path/i.test(`${s.fn} ${s.url}`))) cause = 'nav';
  return { cause, during, links, shaders, compileMs: +compile.toFixed(1), uploadMs: +upload.toFixed(1), bufferMs: +buf.toFixed(1), marks: inFrame, fetched, scripts };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node tools/perf/region-hitch-cause.mjs <region-hitch.json>'); process.exit(2); }
  const r = JSON.parse(readFileSync(file, 'utf8'));
  for (const c of r.crossings || []) {
    c.long = (c.long || []).map((f) => ({ ...f, ...causeOf(f, c.marks, [], []) }));
    for (const f of c.long) console.log(`${c.id}: ${f.d} ms at ${JSON.stringify(f.at)}: ${f.cause}${f.during ? ` during ${f.during}` : ''} (${f.shaders} shaders, ${f.links} programs linked in it)`);
    if (!(c.long || []).length) console.log(`${c.id}: no frame over 33 ms`);
  }
}
