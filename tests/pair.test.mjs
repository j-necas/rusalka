import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zMusicXml } from '../static/lib/song.js';
import { hraniceDvojice, vysledekHrace, hvezdyZPodilu, modelProDvojici, maAkordyProDvojici } from '../static/lib/pair.js';
import { doprovodZAkordu } from '../static/lib/accompaniment.js';

const n = (id, pitch, staff) => ({ id, pitch, staff });
const NOTY = [n('m1', 60, 1), n('m2', 62, 1), n('m3', 64, 1), n('m4', 65, 1), n('b1', 48, 2), n('b2', 43, 2)];

test('boundary between bass and melody', () => {
  assert.equal(hraniceDvojice(NOTY), 54);
  assert.equal(hraniceDvojice([n('a', 55, 1), n('b', 57, 2)]), 56, 'overlap: still the average, not NaN');
  assert.equal(hraniceDvojice([n('a', 72, 1)]), 60, 'no bass');
});

test('Find the notes: each player their own notes and mistakes; a key exactly on the boundary belongs to the melody', () => {
  const chybne = [{ pitch: 54 }, { pitch: 70 }, { pitch: 40 }];
  const m = vysledekHrace({ noty: NOTY, zaznam: new Map(), chybneStisky: chybne, rezim: 'cekam', staff: 1, hranice: 54 });
  const b = vysledekHrace({ noty: NOTY, zaznam: new Map(), chybneStisky: chybne, rezim: 'cekam', staff: 2, hranice: 54 });
  assert.deepEqual([m.pocet, m.chyby, m.trefy], [4, 2, 4]);
  assert.equal(m.podil, 4 / 6);
  assert.equal(m.hvezdy, 1);
  assert.deepEqual([b.pocet, b.chyby], [2, 1]);
});

test('In rhythm: hits are notes with a record', () => {
  const zaznam = new Map([['m1', {}], ['m2', {}], ['m3', {}], ['m4', {}], ['b1', {}]]);
  const m = vysledekHrace({ noty: NOTY, zaznam, chybneStisky: [], rezim: 'tempo', staff: 1, hranice: 54 });
  const b = vysledekHrace({ noty: NOTY, zaznam, chybneStisky: [], rezim: 'tempo', staff: 2, hranice: 54 });
  assert.deepEqual([m.trefy, m.podil, m.hvezdy], [4, 1, 3]);
  assert.deepEqual([b.trefy, b.podil, b.hvezdy], [1, 0.5, 1]);
});

test('a player with no notes in their staff → null', () => {
  assert.equal(vysledekHrace({ noty: NOTY.filter(x => x.staff === 1), zaznam: new Map(), chybneStisky: [], rezim: 'cekam', staff: 2, hranice: 54 }), null);
});

test('stars from the ratio', () => {
  assert.deepEqual([0.96, 0.85, 0.6, 0.2].map(p => hvezdyZPodilu(p, 'tempo')), [3, 2, 1, 0]);
  assert.equal(hvezdyZPodilu(0.2, 'cekam'), 1, 'Find the notes gives at least one star');
});

test('duet model: melody and bass from the chords in every bar', () => {
  const p = zMusicXml(readFileSync(new URL('../songs/Happy Birthday.musicxml', import.meta.url), 'utf8'));
  assert.ok(maAkordyProDvojici(p));
  const d = modelProDvojici(p);
  const sBasem = d.takty.filter(t => (t.leva || []).some(x => x.t !== 'r'));
  assert.ok(sBasem.length >= d.takty.length - 1);
  assert.equal(d.takty[2].noty.length, p.takty[2].noty.length, 'melody unchanged');
  assert.ok(!maAkordyProDvojici({ ...p, takty: p.takty.map(t => ({ ...t, akordy: [] })) }));
});

test('accompaniment without bass: chords only, nothing below C3', () => {
  const C = { pc: 0, bas: 0, tony: [0, 4, 7] };
  const ud = doprovodZAkordu({ akordy: [{ q: 0, ...C }], takty: [0, 3, 6], konecQ: 9, takt: '3/4', tempo: 120, bezBasu: true });
  assert.ok(ud.length >= 3);
  assert.ok(ud.every(e => e.p.length && e.p.every(p => p >= 48)));
});
