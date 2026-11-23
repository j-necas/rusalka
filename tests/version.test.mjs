// Before playing, "What will you play?": which hand a card sets, a style only on "Melody and chords", the summary line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rukaPoKarte, stylPriOtevreni, souhrn, poslechCelePisne } from '../static/lib/version.js';

test('a card with a left hand on two staves sets both hands, the others the right hand', () => {
  assert.equal(rukaPoKarte(5, 2), 'vse');
  assert.equal(rukaPoKarte(4, 2), 'vse');
  assert.equal(rukaPoKarte(3, 2), 'vse');
  assert.equal(rukaPoKarte(2, 2), '1');
  assert.equal(rukaPoKarte(1, 2), '1');
  assert.equal(rukaPoKarte(5, 1), '1');               // one staff: there is only one hand to play
});

test('a left-hand style survives only on "Melody and chords" (level 4)', () => {
  assert.equal(stylPriOtevreni(4, 'valcik'), 'valcik');
  assert.equal(stylPriOtevreni(2, 'valcik'), '');
  assert.equal(stylPriOtevreni(5, 'polka'), '');
  assert.equal(stylPriOtevreni(4, ''), '');
  // a song with only a melody: the style belongs to Melody with accompaniment (level 5)
  assert.equal(stylPriOtevreni(5, 'polka', 5), 'polka');
  assert.equal(stylPriOtevreni(4, 'polka', 5), '');
});

test('the summary names the version and the hand, and what Rusalka plays', () => {
  assert.deepEqual(souhrn({ uroven: 5, ruka: '1', osnovy: 2 }), { verze: 'cviceni.uroven.5.nazev', ruka: 'verze.ruka.prava' });
  assert.deepEqual(souhrn({ uroven: 5, ruka: '2', osnovy: 2 }), { verze: 'cviceni.uroven.5.nazev', ruka: 'verze.ruka.leva' });
  assert.deepEqual(souhrn({ uroven: 3, ruka: 'vse', osnovy: 2 }), { verze: 'cviceni.uroven.3.nazev', ruka: 'verze.ruka.obe' });
  assert.equal(souhrn({ uroven: 2, ruka: '1', osnovy: 1 }).ruka, null);
  assert.equal(souhrn({ uroven: 5, ruka: '1', osnovy: 1, doprovod: true }).verze, 'cviceni.uroven.5.doprovod.nazev');
  assert.equal(souhrn({ uroven: 5, ruka: 'vse', osnovy: 2 }).verze, 'cviceni.uroven.5.nazev');
  assert.equal(souhrn({ uroven: 4, ruka: 'vse', osnovy: 2, dvojice: true }).ruka, null);
});

test('Listen plays the whole song as written: all notes, both hands, the original key, full speed, whole song', () => {
  assert.deepEqual(poslechCelePisne({ osnovy: 2 }),
    { uroven: 5, tonina: 'ne', prstoklad: false, styl: '', usek: null, rukaVolba: 'vse', rychlost: 100, doprovod: false });
});

test('a song with one staff is heard in its hardest version shown in full: Melody with accompaniment, the left hand on its own staff', () => {
  assert.deepEqual(poslechCelePisne({ osnovy: 1 }),
    { uroven: 5, tonina: 'ne', prstoklad: false, styl: '', usek: null, rukaVolba: 'vse', rychlost: 100, doprovod: false });
});
