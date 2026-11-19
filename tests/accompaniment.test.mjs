import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doprovodZAkordu, stylPodleTaktu, tonyProRoli } from '../static/lib/accompaniment.js';

const C = { pc: 0, bas: 0, tony: [0, 4, 7] }, G = { pc: 7, bas: 7, tony: [7, 11, 2] }, G7 = { pc: 7, bas: 7, tony: [7, 11, 2, 5] };
const takty = (n, d) => Array.from({ length: n }, (_, i) => i * d);

test('style by time signature and tempo', () => {
  assert.equal(stylPodleTaktu('3/4', 110), 'valcik');
  assert.equal(stylPodleTaktu('3/4', 80), 'ukolebavka', 'Brahms lullaby');
  assert.equal(stylPodleTaktu('2/4', 100), 'polka');
  assert.equal(stylPodleTaktu('4/4', 90), 'popBalada');
  assert.equal(stylPodleTaktu('4/4', 120), 'polka');
  assert.equal(stylPodleTaktu('6/8', 60), 'ukolebavka', 'dotted quarter 40/min');
  assert.equal(stylPodleTaktu('6/8', 150), 'valcik');
});

test('role pitches: bass low, whole chord below C4, fifth above the bass, seventh chord without the fifth', () => {
  assert.deepEqual(tonyProRoli('bas', C), [36]);
  assert.deepEqual(tonyProRoli('souzvuk', C), [48, 52, 55]);
  assert.deepEqual(tonyProRoli('kvinta', G), [50]);
  assert.deepEqual(tonyProRoli('souzvuk', G7), [53, 55, 59]);
  assert.deepEqual(tonyProRoli('akord', { pc: 0, bas: 4, tony: [0, 4, 7] }).slice(0, 1), [40], 'C/E: bass E');
  assert.deepEqual(tonyProRoli('pomlka', C), []);
});

test('waltz in 3/4: bass – chord – chord in every bar, last bar a held chord', () => {
  const ud = doprovodZAkordu({ akordy: [{ q: 0, ...C }, { q: 3, ...G }, { q: 6, ...C }], takty: takty(3, 3), konecQ: 9, takt: '3/4', tempo: 120 });
  assert.deepEqual(ud.map(e => [e.q, e.p.length]), [[0, 1], [1, 3], [2, 3], [3, 1], [4, 3], [5, 3], [6, 4]]);
  assert.deepEqual(ud[3].p, [43], 'bass G');
  assert.equal(ud[6].dq, 3);
  assert.ok(ud[0].sila > ud[1].sila, 'bass louder on the downbeat');
});

test('a chord change mid-note splits it; the pickup gets the end of the pattern; silence before the first chord', () => {
  // 4/4 ballad (bass 1.5 – fifth 0.5 – chord 2), G from beat 1.5, one-beat pickup without a chord
  const ud = doprovodZAkordu({ akordy: [{ q: 1, ...C }, { q: 2, ...G }], takty: [0, 1, 5], konecQ: 9, takt: '4/4', tempo: 90 });
  assert.ok(ud.every(e => e.q >= 1));
  const takt1 = ud.filter(e => e.q >= 1 && e.q < 5).map(e => [e.q, e.dq, e.p[0]]);
  assert.deepEqual(takt1, [[1, 1, 36], [2, 0.5, 43], [2.5, 0.5, 50], [3, 2, 50]]);
});

test('chords only: original behaviour (chord at the start of the bar and halfway through 4/4)', () => {
  const ud = doprovodZAkordu({ akordy: [{ q: 0, ...C }], takty: takty(2, 4), konecQ: 8, styl: 'jenAkordy' });
  assert.deepEqual(ud.map(e => e.q), [0, 2, 4, 6]);
  assert.equal(ud[0].p.length, 4);
  assert.equal(ud[1].p.length, 3);
});

test('no chords, no accompaniment', () => {
  assert.deepEqual(doprovodZAkordu({ akordy: [], takty: [0], konecQ: 4 }), []);
});
