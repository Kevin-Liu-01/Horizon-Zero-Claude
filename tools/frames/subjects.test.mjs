// Milestone 3 rule 17 (area F's EF4): the subject check before the shutter. The law (subject-math.mjs) on synthetic
// lenses, the declarations (subjects.mjs) for every frame EF4 names, the Node pre-check on the fixed Malpais lenses, and
// the filmer's refusal wired before its screenshot. Browser-free: node --test tools/frames/subjects.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from './subject-math.mjs';
import { SUBJECTS, EF4_FRAMES, subjectsFor, validateSubjects, precheck } from './subjects.mjs';
import { loadLanes } from './stagings/index.mjs';

const W = 1600, H = 900;
const L = M.lensLookAt([0, 1.7, 0], [0, 1.7, -10], 55, W, H);   // looking down -z (north)

test('the lens: a point on the axis is the frame\'s centre; behind is not in front; the corners of the safe area', () => {
  const c = M.project(L, [0, 1.7, -20]);
  assert.ok(Math.abs(c.x - W / 2) < 1e-6 && Math.abs(c.y - H / 2) < 1e-6 && c.front);
  assert.equal(M.project(L, [0, 1.7, 20]).front, false);
  assert.ok(M.inSafe(L, { x: W * 0.06, y: H * 0.94, front: true }));
  assert.ok(!M.inSafe(L, { x: W * 0.04, y: H / 2, front: true }));
});

test('a member is judged by its floor, its share in the safe area and its unoccluded share, each failure named', () => {
  const pts = (cx, cz, h) => [[cx, 0, cz], [cx, h, cz], [cx + 0.5, h / 2, cz], [cx - 0.5, h / 2, cz]];
  const near = pts(0, -10, 3).map((p) => M.project(L, p));
  const ok = M.judgeMember(L, { minPx: 100 }, near, near.map(() => false));
  assert.ok(ok.pass, ok.why.join());
  const far = pts(0, -400, 3).map((p) => M.project(L, p));
  const small = M.judgeMember(L, { minPx: 20 }, far, far.map(() => false));
  assert.ok(!small.pass && /px tall < 20 px/.test(small.why[0]), small.why.join());
  const side = pts(30, -10, 3).map((p) => M.project(L, p));
  const out = M.judgeMember(L, { minPx: 1 }, side, side.map(() => null));
  assert.ok(!out.pass && /safe area/.test(out.why.join()), out.why.join());
  const hid = M.judgeMember(L, { minPx: 10 }, near, near.map(() => true));
  assert.ok(!hid.pass && /unoccluded/.test(hid.why.join()), hid.why.join());
  const back = pts(0, 10, 3).map((p) => M.project(L, p));
  assert.deepEqual(M.judgeMember(L, {}, back, back.map(() => null)).why, ['behind the lens']);
});

test('a subject needs `min` of its members; the refusal names the frame and each failing subject', () => {
  const good = { name: 'a', pass: true, why: [] }, bad = { name: 'b', pass: false, why: ['3 px tall < 20 px'] };
  assert.ok(M.judgeSubject({ name: 'two of three', min: 2 }, [good, good, bad]).pass);
  const s = M.judgeSubject({ name: 'all', }, [good, bad]);
  assert.ok(!s.pass && /1 of 2 pass, 2 wanted: b \(3 px tall < 20 px\)/.test(s.why[0]), s.why[0]);
  assert.deepEqual(M.judgeSubject({ name: 'none', missing: 'none of it is drawn' }, []).why, ['none of it is drawn']);
  assert.equal(M.refusal('F99', [{ ...s }]), `not staged: F99: subject 'all' ${s.why[0]}`);
  assert.equal(M.refusal('F99', [{ name: 'x', pass: true, why: [] }]), null);
});

test('the ground march: a hill between the lens and a point blocks it; open ground does not', () => {
  const hill = (x, z) => (Math.abs(z + 50) < 5 ? 20 : 0);
  assert.ok(M.groundBlocks(hill, [0, 1.7, 0], [0, 1, -100]));
  assert.equal(M.groundBlocks(() => 0, [0, 1.7, 0], [0, 1, -100]), null);
  const g = M.groundHit(() => 0, [0, 10, 0], [0, -Math.SQRT1_2, -Math.SQRT1_2]);
  assert.ok(Math.abs(g.t - 10 * Math.SQRT2) < 0.01, `${g.t}`);
});

test('every frame EF4 names declares subjects of known kinds, and every lane frame among them is staged by a lane file', async () => {
  assert.deepEqual(validateSubjects(), []);
  for (const id of EF4_FRAMES) assert.ok(subjectsFor({ id })?.length, id);
  const L2 = await loadLanes();
  const staged = new Set(L2.frames.map((f) => f.id));
  const unstaged = EF4_FRAMES.filter((id) => !staged.has(id));
  console.log(`  EF4: ${EF4_FRAMES.length} frames declare subjects; with no staging in any lane file yet: ${unstaged.join(', ') || 'none'}`);
  // a frame's own `subjects` wins over the table
  assert.deepEqual(subjectsFor({ id: 'F56', subjects: [{ name: 'x', kind: 'sun' }] }), [{ name: 'x', kind: 'sun' }]);
});

test('the filmer checks the subjects on the frozen frame BEFORE its screenshot and refuses a failing one (no picture)', () => {
  const src = readFileSync(new URL('./film.mjs', import.meta.url), 'utf8');
  const iCheck = src.indexOf("checkSubjects(fid, ss)"), iShot = src.indexOf("const shot = await page.screenshot");
  assert.ok(iCheck > 0 && iShot > iCheck, 'the check comes before the shutter');
  assert.match(src.slice(iCheck, iShot), /notStaged: true, error: sc\.refusal/);
  assert.match(src.slice(iCheck, iShot), /continue;/);
  // the page measures with the same law (rule 21)
  assert.match(readFileSync(new URL('./subject-page.mjs', import.meta.url), 'utf8'), /import \* as M from '\.\/subject-math\.mjs'/);
});

test('the Node pre-check on the fixed Malpais lenses (the recipe\'s ground, terrain the only occluder): printed', async () => {
  const L2 = await loadLanes();
  for (const id of ['F56', 'F57', 'F58']) {
    const f = L2.frames.find((x) => x.id === id);
    if (!f) continue;
    const r = await precheck(f);
    console.log(`  ${id}: ${r.refusal || 'its data subjects pass'}`);
    assert.ok(Array.isArray(r.subjects));
  }
});
