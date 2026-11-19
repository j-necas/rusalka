import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notaProChybu, polohaDucha, chybyKPrehledu, stupenNoty } from '../static/lib/mistakes.js';

// targets on the middle line: B4 in treble clef, D3 in bass clef
const HOUSLOVY = { stupen: stupenNoty('b', 71), poloha: 0 };
const BASOVY = { stupen: stupenNoty('d', 50), poloha: 0 };

test('notaProChybu: nearest pitch, tie goes to the lower note', () => {
  const noty = [{ id: 'a', pitch: 60 }, { id: 'b', pitch: 64 }, { id: 'c', pitch: 67 }];
  assert.equal(notaProChybu(noty, 65).id, 'b');
  assert.equal(notaProChybu(noty, 62).id, 'a');
});

test('polohaDucha: treble clef positions and accidentals', () => {
  assert.deepEqual(polohaDucha(71, 0, HOUSLOVY), { poloha: 0, posuvka: null, mimo: null });
  assert.equal(polohaDucha(65, 0, HOUSLOVY).poloha, -3);
  const fis = polohaDucha(66, 0, HOUSLOVY);
  assert.equal(fis.poloha, -3);
  assert.equal(fis.posuvka, '♯');
  assert.equal(polohaDucha(66, 1, HOUSLOVY).posuvka, null);
  const f = polohaDucha(65, 1, HOUSLOVY);
  assert.equal(f.poloha, -3);
  assert.equal(f.posuvka, '♮');
  const b = polohaDucha(70, -1, HOUSLOVY);
  assert.equal(b.poloha, 0);
  assert.equal(b.posuvka, null);
  const ais = polohaDucha(70, 0, HOUSLOVY);
  assert.equal(ais.poloha, -1);
  assert.equal(ais.posuvka, '♯');
});

test('polohaDucha: bass clef', () => {
  assert.equal(polohaDucha(50, 0, BASOVY).poloha, 0);
  assert.equal(polohaDucha(43, 0, BASOVY).poloha, -4);
});

test('polohaDucha: clamped to three ledger lines', () => {
  const hi = polohaDucha(108, 0, HOUSLOVY);
  assert.equal(hi.poloha, 10);
  assert.equal(hi.mimo, 'nahoru');
  const lo = polohaDucha(36, 0, HOUSLOVY);
  assert.equal(lo.poloha, -10);
  assert.equal(lo.mimo, 'dolu');
});

test('stupenNoty: diatonic step of the written letter, octave from the sounding pitch', () => {
  assert.equal(stupenNoty('c', 60), 28);                 // C4
  assert.equal(stupenNoty('f', 66), 31);                 // F#4
  assert.equal(stupenNoty('b', 60), 27);                 // B#3 sounds as C4
  assert.equal(stupenNoty('c', 59), 28);                 // Cb4 sounds as B3
  assert.equal(stupenNoty('E', 64), 30);
  assert.equal(stupenNoty(undefined, 60), null);
});

test('polohaDucha: measured from the target note, whatever the clef', () => {
  // a left hand in treble clef: target E4 on the bottom line (−4), wrong G4 lands on the second line (−2)
  const g = polohaDucha(67, 0, { stupen: stupenNoty('e', 64), poloha: -4 });
  assert.deepEqual(g, { poloha: -2, posuvka: null, mimo: null });
  // after a clef change to bass: target D3 on the middle line, wrong F3 one line up
  assert.equal(polohaDucha(53, 0, { stupen: stupenNoty('d', 50), poloha: 0 }).poloha, 2);
  // clamped relative to the real staff, not to the target
  const hi = polohaDucha(84, 0, { stupen: stupenNoty('c', 72), poloha: 5 });
  assert.equal(hi.poloha, 10);
  assert.equal(hi.mimo, 'nahoru');
});

test('polohaDucha: accidental from the key valid at the target; unknown key never shows a natural', () => {
  const fis = { stupen: stupenNoty('f', 54), poloha: 2 };   // F#3 in bass clef, key of D
  assert.deepEqual(polohaDucha(53, 2, fis), { poloha: 2, posuvka: '♮', mimo: null });
  assert.deepEqual(polohaDucha(61, 2, fis), { poloha: 6, posuvka: null, mimo: null });
  assert.equal(polohaDucha(53, null, fis).posuvka, null);
  assert.equal(polohaDucha(61, null, fis).posuvka, '♯');
  assert.equal(polohaDucha(70, undefined, HOUSLOVY).posuvka, '♯');
});

test('chybyKPrehledu: grouped per note, distinct pitches, unknown notes dropped', () => {
  const stisky = [
    { pitch: 65, nota: 'n3', takt: 0 }, { pitch: 65, nota: 'n3', takt: 0 },
    { pitch: 62, nota: 'n3', takt: 0 }, { pitch: 64, nota: 'n3', takt: 0 },
    { pitch: 72, nota: 'n5', takt: 1 }, { pitch: 60, nota: 'zz', takt: 9 },
  ];
  const noty = [{ id: 'n5', ms: 2000, staff: 1, takt: 1 }, { id: 'n3', ms: 1000, staff: 1, takt: 0 }];
  assert.deepEqual(chybyKPrehledu(stisky, noty), [
    { nota: 'n3', takt: 0, staff: 1, vysky: [65, 62, 64] },
    { nota: 'n5', takt: 1, staff: 1, vysky: [72] },
  ]);
});

test('chybyKPrehledu: a fourth distinct wrong pitch on one note is dropped', () => {
  const stisky = [60, 62, 64, 65, 62].map(pitch => ({ pitch, nota: 'n1', takt: 0 }));
  assert.deepEqual(chybyKPrehledu(stisky, [{ id: 'n1', ms: 0, staff: 1, takt: 0 }]), [{ nota: 'n1', takt: 0, staff: 1, vysky: [60, 62, 64] }]);
});

test('chybyKPrehledu: the bar comes from the note, not from the press', () => {
  // a wrong key late in bar 3 belongs to the first note of bar 4
  const stisky = [{ pitch: 62, nota: 'n7', takt: 3 }];
  assert.deepEqual(chybyKPrehledu(stisky, [{ id: 'n7', ms: 0, staff: 1, takt: 4 }]), [{ nota: 'n7', takt: 4, staff: 1, vysky: [62] }]);
});
