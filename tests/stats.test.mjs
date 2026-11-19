// Statistics for a parent: practising regularly? improving? stuck where? (static/lib/stats.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pokusyHrace, kalendar, presnostPoDnech, stavPisni, mistaKdeDrhne, zapisDoDeniku } from '../static/lib/stats.js';

const DEN = 864e5;
const TED = new Date(2026, 10, 18, 18, 0).getTime();          // Wednesday 18 November 2026, 18:00
const den = d => new Date(2026, 10, 18 - d, 10, 0).getTime();  // d days ago, 10:00

const STAT = {
  'Óda.musicxml#2': { historie: [
    { kdy: den(0), rezim: 'tempo', krok: 'tempo', rychlost: 80, presnost: 0.9, cisty: false },
    { kdy: den(0) + 6e5, rezim: 'tempo', krok: 'tempo', rychlost: 80, presnost: 1, cisty: true },
    { kdy: den(2), rezim: 'cekam', krok: 'cekam', rychlost: 60, presnost: 0.8, cisty: false },
  ], takty: { 0: { noty: 8, chyby: 0.2 }, 4: { noty: 8, chyby: 3 }, 5: { noty: 6, chyby: 2 }, 9: { noty: 2, chyby: 2 } } },
  'Tichá noc.musicxml#5': { historie: [{ kdy: den(40), rezim: 'cekam', krok: 'cekam', rychlost: 60, presnost: 0.7, cisty: false }],
    takty: { 11: { noty: 10, chyby: 6 } } },
};

test('every attempt with its song (the file without the level)', () => {
  const p = pokusyHrace(STAT);
  assert.equal(p.length, 4);
  assert.deepEqual([...new Set(p.map(x => x.pisen))].sort(), ['Tichá noc.musicxml', 'Óda.musicxml']);
  assert.deepEqual(pokusyHrace(undefined), []);
});

test('calendar: 12 weeks of 7 days, Monday first, today marked, levels by plays', () => {
  const k = kalendar(pokusyHrace(STAT), TED);
  assert.equal(k.tydny.length, 12);
  assert.ok(k.tydny.every(t => t.length === 7));
  assert.equal(new Date(k.tydny[0][0].t).getDay(), 1, 'Monday');
  const vse = k.tydny.flat(), dnes = vse.find(d => d.dnes);
  assert.equal(new Date(dnes.t).getDate(), 18);
  assert.equal(dnes.n, 2); assert.equal(dnes.uroven, 1);
  assert.equal(vse.find(d => new Date(d.t).getDate() === 16 && new Date(d.t).getMonth() === 10).n, 1);
  assert.ok(vse.filter(d => d.budouci).every(d => d.t > dnes.t), 'the rest of this week is in the future');
  assert.deepEqual(k.tyden, { dny: 2, zahrani: 3 });
  const uroven = n => kalendar(Array.from({ length: n }, (_, i) => ({ kdy: den(0) + i })), TED).tydny.flat().find(d => d.dnes).uroven;
  assert.deepEqual([0, 1, 2, 3, 5, 6, 9].map(uroven), [0, 1, 1, 2, 2, 3, 3]);
});

test('accuracy per day over the last 30 days, oldest first', () => {
  const b = presnostPoDnech(pokusyHrace(STAT), TED);
  assert.equal(b.length, 2, 'the 40-day-old attempt is left out');
  assert.equal(new Date(b[0].t).getDate(), 16); assert.equal(b[0].v, 0.8); assert.equal(b[0].n, 1);
  assert.equal(b[1].v, 0.95); assert.equal(b[1].n, 2);
});

test('songs by last play with stars and what comes next', () => {
  const vys = { 'Óda.musicxml': { cekam: { hvezdy: 3 }, pockej: { hvezdy: 3 }, tempo: { hvezdy: 2 } }, 'Tichá noc.musicxml': { cekam: { hvezdy: 1 } },
    'Bratře Kubo.musicxml': { cekam: { hvezdy: 3 }, pockej: { hvezdy: 3 }, tempo: { hvezdy: 3 } } };
  const s = stavPisni(STAT, vys);
  assert.deepEqual(s.map(x => x.soubor), ['Óda.musicxml', 'Tichá noc.musicxml', 'Bratře Kubo.musicxml']);
  assert.deepEqual(s[0].hvezdy, [3, 3, 2]);
  assert.deepEqual(s[0].stav, { druh: 'krok', krok: 'tempo', rychlost: 80 }, 'In rhythm not finished yet, clean at 80 %');
  assert.deepEqual(s[1].stav, { druh: 'krok', krok: 'cekam', rychlost: 0 });
  assert.deepEqual(s[2].stav, { druh: 'krok', krok: 'tempo', rychlost: 0 }, 'three stars everywhere but never clean at 100 % → not learnt');
  const naucena = stavPisni({ 'X.musicxml#2': { historie: [{ kdy: den(1), krok: 'tempo', rychlost: 100, cisty: true }] } },
    { 'X.musicxml': { cekam: { hvezdy: 3 }, pockej: { hvezdy: 3 }, tempo: { hvezdy: 3 } } });
  assert.deepEqual(naucena[0].stav, { druh: 'naucena' });
});

test('where it gets stuck: bars with enough notes and many mistakes, neighbours joined, worst first', () => {
  const m = mistaKdeDrhne(STAT);
  assert.deepEqual(m.map(x => [x.soubor, x.od, x.do]), [['Tichá noc.musicxml', 11, 11], ['Óda.musicxml', 4, 5]]);
  assert.ok(Math.abs(m[1].podil - 5 / 14) < 1e-9, 'mistakes of both bars over their notes');
  assert.deepEqual(mistaKdeDrhne({}), []);
  assert.equal(mistaKdeDrhne(STAT, 1).length, 1);
});

test('the practice diary counts every play of a day (the song history keeps only the last 30 per song)', () => {
  let d = {};
  d = zapisDoDeniku(d, den(20), 0.8);
  d = zapisDoDeniku(d, den(20) + 6e5, 1);
  d = zapisDoDeniku(d, den(0), null);
  const k = kalendar([], TED, d), dny = k.tydny.flat();
  assert.equal(dny.find(x => new Date(x.t).getDate() === 29 && new Date(x.t).getMonth() === 9).n, 2, '29 October from the diary alone');
  assert.equal(dny.find(x => x.dnes).n, 1);
  const p = presnostPoDnech([], TED, 30, d);
  assert.deepEqual(p.map(x => [new Date(x.t).getDate(), x.v, x.n]), [[29, 0.9, 2]], 'today has no accuracy, so no point');
  const sHistorii = kalendar(pokusyHrace(STAT), TED, zapisDoDeniku({}, den(0), 0.5));
  assert.equal(sHistorii.tydny.flat().find(x => x.dnes).n, 2, 'the bigger of diary and history: older days played before the diary existed still count');
});

test('this week means Monday to today, like the calendar column', () => {
  const ctvrtek = new Date(2026, 10, 19, 12).getTime();          // Thursday; last Thursday is 7 days back, not this week
  const k = kalendar([{ kdy: new Date(2026, 10, 12, 10).getTime() }, { kdy: new Date(2026, 10, 16, 10).getTime() }], ctvrtek);
  assert.deepEqual(k.tyden, { dny: 1, zahrani: 1 });
});
