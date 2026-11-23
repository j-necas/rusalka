// What the app recommends to a player: next step, speed, "I can play it", the For me order, actions after a result.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KROKY, RYCHLOSTI, stavKroku, rozehraneKroky, nejrychlejsiCisty, umim, doporuceni, proMe, jeNova, akcePoVysledku } from '../static/lib/recommend.js';

const hotovo = { cekam: { hvezdy: 3 }, pockej: { hvezdy: 3 }, tempo: { hvezdy: 3 } };
const DEN = 864e5;

test('constants', () => {
  assert.deepEqual(KROKY, ['cekam', 'pockej', 'tempo']);
  assert.deepEqual(RYCHLOSTI, [60, 80, 100]);
});

test('only old results without history: step by stars, speed Slow', () => {
  const vys = { cekam: { hvezdy: 3 }, pockej: { hvezdy: 2 } };
  assert.deepEqual(stavKroku(vys), ['hotovo', 'ted', 'nezacato']);
  assert.deepEqual(doporuceni(vys, {}, 'A.musicxml'), { krok: 'pockej', rychlost: 60, umim: false });
  assert.deepEqual(stavKroku(undefined), ['ted', 'nezacato', 'nezacato']);
  assert.deepEqual(stavKroku(hotovo), ['hotovo', 'hotovo', 'hotovo']);
});

test('unfinished step: the last speed used for this step, rounded down', () => {
  const stat = { 'A.musicxml#2': { historie: [
    { kdy: 1, rezim: 'tempo', krok: 'pockej', rychlost: 95, presnost: 0.8 },
    { kdy: 3, rezim: 'tempo', krok: 'pockej', rychlost: 85, presnost: 0.9 },
    { kdy: 4, rezim: 'tempo', krok: 'tempo', rychlost: 100, presnost: 0.9 },
    { kdy: 5, rezim: 'cekam', rychlost: 100, presnost: 1 },
  ] }, 'B.musicxml#2': { historie: [{ kdy: 9, rezim: 'tempo', krok: 'pockej', rychlost: 100 }] } };
  assert.deepEqual(doporuceni({ cekam: { hvezdy: 3 } }, stat, 'A.musicxml'), { krok: 'pockej', rychlost: 80, umim: false });
});

test('all done: In rhythm faster, after a clean run at 100 % "I can play it"', () => {
  const stat = r => ({ 'A.musicxml#2': { historie: [{ kdy: 1, rezim: 'tempo', krok: 'tempo', rychlost: r, cisty: true }, { kdy: 2, rezim: 'tempo', krok: 'tempo', rychlost: 100, cisty: false }] } });
  assert.equal(nejrychlejsiCisty(stat(60), 'A.musicxml'), 60);
  assert.equal(nejrychlejsiCisty({}, 'A.musicxml'), 0);
  assert.deepEqual(doporuceni(hotovo, stat(60), 'A.musicxml'), { krok: 'tempo', rychlost: 80, umim: false });
  assert.deepEqual(doporuceni(hotovo, stat(80), 'A.musicxml'), { krok: 'tempo', rychlost: 100, umim: false });
  assert.deepEqual(doporuceni(hotovo, stat(100), 'A.musicxml'), { krok: 'tempo', rychlost: 100, umim: true });
  assert.equal(umim(hotovo, stat(100), 'A.musicxml'), true);
  assert.equal(umim({ cekam: { hvezdy: 3 } }, stat(100), 'A.musicxml'), false);
});

test('For me: in progress by last played, then not started up to mastered difficulty + 1, then the rest, "I can play it" last', () => {
  const s = n => ({ soubor: n + '.musicxml' });
  const seznam = ['umi', 'teska', 'snadna', 'stredni', 'roz1', 'roz2'].map(s);
  const vys = { 'umi.musicxml': hotovo, 'roz1.musicxml': { cekam: { hvezdy: 3 } }, 'roz2.musicxml': { cekam: { hvezdy: 1 } } };
  const stat = {
    'umi.musicxml#2': { posledni: 50, historie: [{ kdy: 50, rezim: 'tempo', krok: 'tempo', rychlost: 100, cisty: true }] },
    'roz1.musicxml#2': { posledni: 10, historie: [] }, 'roz2.musicxml#2': { posledni: 20, historie: [] },
  };
  const info = { 'umi.musicxml': 1, 'teska.musicxml': 3, 'snadna.musicxml': 1, 'stredni.musicxml': 2, 'roz1.musicxml': 1, 'roz2.musicxml': 1 };
  const inf = Object.fromEntries(Object.entries(info).map(([k, v]) => [k, { obtiznost: { stupen: v } }]));
  assert.deepEqual(proMe(seznam, vys, stat, inf).map(p => p.soubor.replace('.musicxml', '')),
    ['roz2', 'roz1', 'snadna', 'stredni', 'teska', 'umi']);
});

test('new song: appeared less than 7 days ago and the player has not played it', () => {
  const ted = 100 * DEN;
  assert.equal(jeNova(ted - 6 * DEN, false, ted), true);
  assert.equal(jeNova(ted - 8 * DEN, false, ted), false);
  assert.equal(jeNova(ted - 1 * DEN, true, ted), false);
  assert.equal(jeNova(undefined, false, ted), false);
});

test('actions after a result: next step, faster, next song, practise, again', () => {
  const zaklad = { soubor: 'A.musicxml', stat: {}, dalsi: { soubor: 'B.musicxml' } };
  assert.deepEqual(akcePoVysledku({ ...zaklad, krok: 'cekam', hvezdy: 3, vys: { cekam: { hvezdy: 3 } } }), { druh: 'krok', krok: 'pockej' });
  const statTempo = r => ({ 'A.musicxml#2': { historie: [{ kdy: 1, rezim: 'tempo', krok: 'tempo', rychlost: r, cisty: true }] } });
  assert.deepEqual(akcePoVysledku({ ...zaklad, krok: 'tempo', hvezdy: 3, vys: hotovo, stat: statTempo(60) }), { druh: 'rychleji', krok: 'tempo', rychlost: 80 });
  assert.deepEqual(akcePoVysledku({ ...zaklad, krok: 'tempo', hvezdy: 3, vys: hotovo, stat: statTempo(100) }), { druh: 'dalsi', pisen: { soubor: 'B.musicxml' } });
  assert.deepEqual(akcePoVysledku({ ...zaklad, krok: 'tempo', hvezdy: 3, vys: hotovo, stat: statTempo(100), dalsi: null }), { druh: 'znovu' });
  const misto = { od: 4, do: 5, takty: '5–6' };
  assert.deepEqual(akcePoVysledku({ ...zaklad, krok: 'cekam', hvezdy: 2, vys: {}, mistoSlabe: misto, taktu: 16 }), { druh: 'procvicit', misto });
  assert.deepEqual(akcePoVysledku({ ...zaklad, krok: 'cekam', hvezdy: 1, vys: {}, mistoSlabe: { od: 0, do: 15 }, taktu: 16 }), { druh: 'znovu' });
  assert.deepEqual(akcePoVysledku({ ...zaklad, krok: 'cekam', hvezdy: 2, vys: {} }), { druh: 'znovu' });
});

test('player week: days, songs and attempts in the last 7 days', async () => {
  const { tydenHrace } = await import('../static/lib/recommend.js');
  const ted = Date.UTC(2026, 10, 16, 12);
  const stat = {
    'A.musicxml#2': { historie: [{ kdy: ted - 1 * DEN }, { kdy: ted - 1 * DEN + 3600e3 }, { kdy: ted - 9 * DEN }] },
    'A.musicxml#1': { historie: [{ kdy: ted - 2 * DEN }] },
    'B.musicxml#2': { historie: [{ kdy: ted - 3 * DEN }] },
    'C.musicxml#2': { historie: [{ kdy: ted - 8 * DEN }] },
  };
  assert.deepEqual(tydenHrace(stat, ted), { dny: 3, pisni: 2, pokusu: 4 });
  assert.deepEqual(tydenHrace({}, ted), { dny: 0, pisni: 0, pokusu: 0 });
});

test('With accompaniment clean at 100 % is not "I can play it"; an old In rhythm record without a step does not count', () => {
  const stat = h => ({ 'A.musicxml#2': { historie: [h] } });
  assert.equal(umim(hotovo, stat({ kdy: 1, rezim: 'tempo', krok: 'pockej', rychlost: 100, cisty: true }), 'A.musicxml'), false);
  assert.equal(nejrychlejsiCisty(stat({ kdy: 1, rezim: 'tempo', rychlost: 100, cisty: true }), 'A.musicxml'), 0);
  // an unfinished In rhythm does not take the speed from a With accompaniment game
  const vys = { cekam: { hvezdy: 3 }, pockej: { hvezdy: 3 } };
  assert.deepEqual(doporuceni(vys, stat({ kdy: 1, rezim: 'tempo', krok: 'pockej', rychlost: 100 }), 'A.musicxml'), { krok: 'tempo', rychlost: 60, umim: false });
});

test('faster: at least one notch above the speed just played; at 100 % without a clean run, again', () => {
  const zaklad = { soubor: 'A.musicxml', stat: {}, dalsi: null, krok: 'tempo', hvezdy: 3, vys: hotovo };
  assert.deepEqual(akcePoVysledku({ ...zaklad, rychlost: 80 }), { druh: 'rychleji', krok: 'tempo', rychlost: 100 });
  assert.deepEqual(akcePoVysledku({ ...zaklad, rychlost: 100 }), { druh: 'znovu' });
});

test('rozehraneKroky: a step played but without three stars yet; a finished or untouched one is not', () => {
  assert.deepEqual(rozehraneKroky(undefined), [false, false, false]);
  assert.deepEqual(rozehraneKroky({ cekam: { hvezdy: 1, procent: 40, pocet: 1 } }), [true, false, false]);
  assert.deepEqual(rozehraneKroky({ cekam: { hvezdy: 3, procent: 100, pocet: 2 }, pockej: { hvezdy: 0, procent: 20, pocet: 1 } }), [false, true, false]);
  assert.deepEqual(rozehraneKroky({ cekam: { hvezdy: 3 }, pockej: { hvezdy: 3 }, tempo: { hvezdy: 3 } }), [false, false, false]);
});
