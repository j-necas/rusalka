// Animals V13: the original drawings (V8) of all 18 animals in motion, by static/lib/natural.js (a port of the set's
// behavior.js, mouth.js and natural.js); static/animals/v13.js and static/animals/v13/ are generated from the set by
// tools/animals.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { sample, duration, project, GESTA, DRUHY } from '../static/lib/natural.js';
import { RIG, CASTI, OBLASTI } from '../static/animals/v13.js';
import { POHYB } from '../static/animals/motion.js';
import { OBRAZKY } from '../static/lib/profiles.js';

const SADA = new URL('../navrhy/zviratka-2026-11-16/finalni-sada-v13/', import.meta.url);
const POHYBY = ['alive', 'alive-b', 'alive-c', 'turn', 'listen', 'curious', 'wave', 'happy', 'pet', 'eyes', 'blink'];

test('V13 rig: every animal of the app, with its drawing, clean plate, eyes, mouth and soft parts', () => {
  assert.deepEqual([...DRUHY].sort(), [...OBRAZKY.dite].sort());
  for (const id of DRUHY) {
    const a = RIG[id];
    for (const f of [a.source, a.cleanPlate]) assert.ok(existsSync(new URL('../static/' + f, import.meta.url)), `${id}: ${f}`);
    assert.ok(existsSync(new URL(`../static/animals/${id}.webp`, import.meta.url)), `${id}: atlas`);
    assert.equal(a.eyes.length, 2, id);
    assert.ok(['smile', 'beak'].includes(a.mouth.type), id);
    assert.equal(CASTI[id].eyes.length, 2, id);
    assert.ok(OBLASTI[id].bones.length > 0, id);
    assert.ok(POHYB[id], `${id}: CSS motion without WebGL`);
  }
});

test('every motion stays within limits; gestures end neutral with the soft parts at rest', () => {
  for (const id of DRUHY) {
    for (const kind of POHYBY) for (let t = 0; t < duration(id, kind); t += 0.37) {
      const p = sample(id, kind, t);
      assert.ok(Math.abs(p.headX) <= 0.98 && Math.abs(p.eyeX) <= 1 && p.smile >= 0 && p.smile <= 1 && p.lids.every(l => l >= 0 && l <= 1), `${id} ${kind} ${t}`);
    }
    for (const kind of GESTA) {
      const p = sample(id, kind, duration(id, kind));
      assert.ok(Math.abs(p.headX) < 0.02 && p.smile < 0.02 && p.lids.every(l => l < 0.02), `${id} ${kind} end`);
      assert.ok(p.secondaryAngles.every(a => Math.abs(a) < 0.05), `${id} ${kind} soft parts at rest`);
    }
  }
});

test('the paws and the lower outline stay fixed while the head turns', () => {
  for (const id of DRUHY) {
    const klid = project(id, sample(id, 'portrait-idle', 0)), otoceni = project(id, sample(id, 'turn', 1.2));
    const dole = klid.map((q, n) => [q, otoceni[n]]).filter(([q]) => q[1] >= 420);
    assert.ok(dole.every(([a, b]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6), `${id}: the bottom moved`);
    assert.ok(klid.some((q, n) => Math.hypot(q[0] - otoceni[n][0], q[1] - otoceni[n][1]) > 2), `${id}: the head did not turn`);
  }
});

test('the port matches the set\'s behavior.js', { skip: !existsSync(SADA) && 'set V13 not available' }, () => {
  const ctx = {};
  vm.createContext(ctx);
  const kod = ['reference/reference-secondary.js', 'behavior.js'].map(f => readFileSync(new URL(f, SADA), 'utf8')).join('\n');
  vm.runInContext(kod + '\n;globalThis.__b = RusalkaBehavior;', ctx);
  const puvodni = ctx.__b;
  for (const id of DRUHY) for (const kind of POHYBY) for (const t of [0, 0.5, 1.7, 3.3, 6.1, 13.9, 15.2, 30.4]) {
    const a = puvodni.sample(id, kind, t), b = sample(id, kind, t);
    for (const k of ['eyeX', 'eyeY', 'headX', 'headY', 'roll', 'smile', 'sniff', 'earPerk']) assert.equal(b[k], a[k], `${id} ${kind} ${t} ${k}`);
    assert.deepEqual(b.lids, [...a.lids], `${id} ${kind} ${t} lids`);
    assert.deepEqual(b.secondaryAngles, [...a.secondaryAngles], `${id} ${kind} ${t} soft`);
  }
});
