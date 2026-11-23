// The recorded piano (Salamander): a sample every three semitones, the notes between retuned from the nearest one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VZORKY, naMidi, nejblizsiVzorek } from '../static/lib/piano.js';

test('30 samples from A0 to C8, every three semitones', () => {
  assert.equal(VZORKY.length, 30);
  const midi = VZORKY.map(naMidi);
  assert.equal(midi[0], 21); assert.equal(midi.at(-1), 108); assert.equal(naMidi('C4'), 60); assert.equal(naMidi('Ds4'), 63); assert.equal(naMidi('Fs1'), 30);
  assert.ok(midi.slice(1).every((m, i) => m - midi[i] === 3));
});

test('the nearest sample, retuned by at most a semitone and a half', () => {
  const vse = VZORKY.map(naMidi);
  assert.deepEqual(nejblizsiVzorek(60, vse), { vzorek: 60, rychlost: 1 });
  const d = nejblizsiVzorek(62, vse);                       // D4: from Ds4 one semitone down
  assert.equal(d.vzorek, 63); assert.ok(Math.abs(d.rychlost - Math.pow(2, -1 / 12)) < 1e-12);
  for (let p = 21; p <= 108; p++) assert.ok(Math.abs(nejblizsiVzorek(p, vse).vzorek - p) <= 1, p);
  assert.equal(nejblizsiVzorek(10, vse).vzorek, 21, 'below the piano: the lowest sample');
});

test('only loaded samples are used; none loaded → null', () => {
  assert.equal(nejblizsiVzorek(60, [48, 72]).vzorek, 48);
  assert.equal(nejblizsiVzorek(60, []), null);
});

test('only the samples a range of keys needs are loaded: the nearest one of every key', async () => {
  const { vzorkyPro } = await import('../static/lib/piano.js');
  assert.deepEqual(vzorkyPro(60, 72), ['C4', 'Ds4', 'Fs4', 'A4', 'C5']);
  assert.deepEqual(vzorkyPro(58, 58), ['A3']);
  assert.deepEqual(vzorkyPro(0, 200), VZORKY, 'beyond the piano: every sample');
});
