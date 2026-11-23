// Library selection logic: level, shelf order, At home, next song, search.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { urovenHrace, seradPolici, naDomove, dalsiZKnihovny, hledej, policeSouboru, navrhyZKnihovny, slucPisne } from '../static/lib/library.js';

const P = (soubor, stupen, police = 'children', nazev = soubor, extra = {}) => ({ soubor, nazev, police, stupen, autor: '', jazyk: 'cs', ...extra });

test('slucPisne gives a matching own song the public shelf without showing a second tile', () => {
  const soukroma = P('Pásli ovce valaši.musicxml', 2, null, 'Pásli ovce valaši');
  const verejna = P('library/christmas/pasli-ovce-valasi.musicxml', 1, 'christmas', 'Pásli ovce Valaši');
  const jina = P('library/christmas/jina.musicxml', 1, 'christmas', 'Jiná');
  const { vlastni, knihovna } = slucPisne([soukroma], [verejna, jina]);
  assert.deepEqual(vlastni, [{ ...soukroma, police: 'christmas', verejna }]);
  assert.deepEqual(knihovna, [jina]);
  assert.deepEqual(slucPisne([{ ...soukroma, chyba: true }], [verejna]).knihovna, [verejna]);
  assert.deepEqual(slucPisne([], [verejna]).knihovna, [verejna]);
});

test('slucPisne still honours a same-file sample edit and preserves distinct own files', () => {
  const ukazka = P('Silent Night.musicxml', 2, 'christmas', 'Silent Night');
  const prepsana = P('Silent Night.musicxml', 2, null, 'Tichá noc');
  const jina = P('own.musicxml', 1, null, 'Tichá noc');
  const { vlastni, knihovna } = slucPisne([prepsana, jina], [ukazka]);
  assert.deepEqual(vlastni.map(x => x.soubor), [prepsana.soubor, jina.soubor]);
  assert.equal(vlastni[0].police, 'christmas');
  assert.deepEqual(knihovna, []);
});

test('urovenHrace: no results -> 1; finished step of difficulty n -> n+1, clamped to 3', () => {
  const seznam = [{ soubor: 'A' }, { soubor: 'B' }];
  const info = { A: { obtiznost: { stupen: 1 } }, B: { obtiznost: { stupen: 3 } } };
  assert.equal(urovenHrace(seznam, {}, {}, info), 1);
  assert.equal(urovenHrace(seznam, { A: { cekam: { hvezdy: 2 } } }, {}, info), 1);
  assert.equal(urovenHrace(seznam, { A: { cekam: { hvezdy: 3 } } }, {}, info), 2);
  assert.equal(urovenHrace(seznam, { A: { cekam: { hvezdy: 3 } }, B: { tempo: { hvezdy: 3 } } }, {}, info), 3);
});

test('urovenHrace: a finished song of unknown difficulty does not count (not yet read, or unreadable)', () => {
  const seznam = [{ soubor: 'A' }, { soubor: 'B' }];
  const vys = { A: { cekam: { hvezdy: 3 } }, B: { tempo: { hvezdy: 3 } } };
  assert.equal(urovenHrace(seznam, vys, {}, { A: { obtiznost: { stupen: 1 } } }), 2);
  assert.equal(urovenHrace(seznam, vys, {}, { A: { obtiznost: { stupen: 1 } }, B: { obtiznost: null } }), 2);
  assert.equal(urovenHrace(seznam, vys, {}, {}), 1);
});

test('seradPolici: level first (by stupen, name), harder after with tezsi', () => {
  const r = seradPolici([P('c', 3), P('b', 1, 'children', 'Bbb'), P('d', 2), P('a', 1, 'children', 'Aaa')], 1);
  assert.deepEqual(r.map(x => x.polozka.soubor), ['a', 'b', 'd', 'c']);
  assert.deepEqual(r.map(x => x.tezsi), [false, false, true, true]);
});

test('naDomove: hidden/played/starred rules per player', () => {
  const p = P('S');
  const stat = t => ({ p1: { 'S#2': { posledni: t } } });
  const skryte = { p1: { S: 100 } };
  assert.equal(naDomove(p, 'p1', { statistiky: stat(50), oblibene: {}, knihovnaSkryte: skryte }), false);
  assert.equal(naDomove(p, 'p1', { statistiky: stat(200), oblibene: {}, knihovnaSkryte: skryte }), true);
  assert.equal(naDomove(p, 'p1', { statistiky: stat(50), oblibene: { p1: ['S'] }, knihovnaSkryte: skryte }), true);
  assert.equal(naDomove(p, 'p2', { statistiky: stat(200), oblibene: {}, knihovnaSkryte: skryte }), false);
  assert.equal(naDomove(p, 'p1', { statistiky: {}, oblibene: {}, knihovnaSkryte: {} }), false);
});

test('dalsiZKnihovny: exact level, else lower, else easiest; skips played; shelf order', () => {
  const idx = [P('c1', 1, 'classics', 'A'), P('k1', 1, 'folk', 'Z'), P('h2', 2, 'children', 'B'), P('h3', 3, 'children', 'C')];
  assert.equal(dalsiZKnihovny(idx, 1, {}, {}).soubor, 'k1');
  assert.equal(dalsiZKnihovny(idx, 2, {}, {}).soubor, 'h2');
  assert.equal(dalsiZKnihovny(idx, 2, { h2: { cekam: { hvezdy: 1 } } }, {}).soubor, 'k1');
  assert.equal(dalsiZKnihovny(idx, 1, {}, { 'k1#2': { posledni: 1 }, 'c1#2': {} }).soubor, 'h2');
  assert.equal(dalsiZKnihovny(idx, 1, {}, { 'k1#2': {}, 'c1#2': {} }).soubor, 'h2');
  assert.equal(dalsiZKnihovny([P('x', 1)], 1, { x: { cekam: { hvezdy: 1 } } }, {}), null);
  assert.equal(dalsiZKnihovny([], 1, {}, {}), null);
});

test('hledej: diacritics- and case-insensitive over name, author, translations', () => {
  const idx = [P('a', 1, 'children', 'Kachna', { preklad: { cs: 'Všechny moje kachničky' } }), P('b', 1, 'folk', 'Ovečka', { autor: 'Dvořák' })];
  assert.deepEqual(hledej(idx, 'kachnicky').map(p => p.soubor), ['a']);
  assert.deepEqual(hledej(idx, 'DVORAK').map(p => p.soubor), ['b']);
  assert.deepEqual(hledej(idx, 'ovecka').map(p => p.soubor), ['b']);
  assert.equal(hledej(idx, '').length, 2);
});

test('policeSouboru: the bundled sample songs belong to shelves; own songs to none', () => {
  assert.equal(policeSouboru('Frère Jacques.musicxml'), 'children');
  assert.equal(policeSouboru('Silent Night.musicxml'), 'christmas');
  assert.equal(policeSouboru('Für Elise (opening).musicxml'), 'classics');
  assert.equal(policeSouboru('Moje písnička.musicxml'), null);
});

test('navrhyZKnihovny: up to n unplayed songs, the player\'s level first, then easier; none played', () => {
  const ix = [
    { soubor: 'a', nazev: 'A', police: 'children', stupen: 1 }, { soubor: 'b', nazev: 'B', police: 'folk', stupen: 2 },
    { soubor: 'c', nazev: 'C', police: 'children', stupen: 2 }, { soubor: 'd', nazev: 'D', police: 'classics', stupen: 3 },
    { soubor: 'e', nazev: 'E', police: 'children', stupen: 1 },
  ];
  assert.deepEqual(navrhyZKnihovny(ix, 2, {}, {}, 3).map(p => p.soubor), ['c', 'b', 'a']);
  assert.deepEqual(navrhyZKnihovny(ix, 2, { c: { cekam: { hvezdy: 1 } } }, {}, 2).map(p => p.soubor), ['b', 'a']);
  assert.deepEqual(navrhyZKnihovny(ix, 1, {}, { 'a#2': { posledni: 1 } }, 4).map(p => p.soubor), ['e']);
  assert.deepEqual(navrhyZKnihovny([], 2, {}, {}, 4), []);
});
