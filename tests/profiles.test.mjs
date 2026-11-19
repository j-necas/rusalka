import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETY, OBRAZKY, VSECHNY_OBRAZKY, paleta, prevedProfil, viditelni, smazHrace } from '../static/lib/profiles.js';
import { sluc } from '../static/lib/merge.js';

test('palettes and pictures as designed', () => {
  assert.deepEqual(PALETY.map(p => p.id), ['mech', 'mrkev', 'inkoust', 'svestka', 'horcice', 'malina']);
  assert.deepEqual(paleta('mech'), { id: 'mech', tmava: '#22504A', svetla: '#E2F0E8', stredni: '#C3E1D1' });
  assert.equal(paleta('nic').id, 'inkoust');
  assert.deepEqual(OBRAZKY.dite, ['lenochod', 'kralik', 'liska', 'sova', 'jezek', 'kocka', 'pejsek', 'panda-cervena', 'vydra', 'tucnak', 'kapybara', 'axolotl', 'veverka', 'myval', 'medvidek', 'koala', 'zabka', 'ovecka']);
  assert.deepEqual(OBRAZKY.dospely, ['rusalka', 'klic', 'klavir', 'metronom', 'lyra', 'ladicka']);
  assert.deepEqual(VSECHNY_OBRAZKY, [...OBRAZKY.dite, ...OBRAZKY.dospely]);   // one choice: the animals, then the pictures for adults
});

test('profile migration is idempotent and keeps an explicit choice', () => {
  const p = [{ id: 'e', zvire: 'lenochod', vek: 'dite' }, { id: 'f', zvire: 'kralik', vek: 'dite' }, { id: 'j', vek: 'dospely' },
    { id: 'm', vek: 'dite', obrazek: 'sova', barva: 'malina' }, { id: 'x', vek: 'dite' }];
  const a = p.map(x => prevedProfil(x, p));
  assert.deepEqual(a.map(x => [x.obrazek, x.barva]), [['lenochod', 'mech'], ['kralik', 'mrkev'], ['rusalka', 'inkoust'], ['sova', 'malina'], ['liska', 'inkoust']]);
  assert.equal(a[0].zvire, 'lenochod');
  assert.deepEqual(a.map(x => prevedProfil(x, a)), a);
  // a symbol of the first adult set becomes the illustration with the same motif; the colour stays
  assert.deepEqual(prevedProfil({ id: 'o', vek: 'dospely', obrazek: 'klavesy', barva: 'svestka' }), { id: 'o', vek: 'dospely', obrazek: 'klavir', barva: 'svestka' });
  assert.equal(prevedProfil({ id: 'o', vek: 'dospely', obrazek: 'metronom', barva: 'svestka' }).obrazek, 'metronom');
});

test('a deleted player does not come back after a merge', () => {
  const nase = [{ id: 'e', jmeno: 'E' }, { id: 'f', smazano: 5 }], jejich = [{ id: 'e', jmeno: 'E' }, { id: 'f', jmeno: 'F' }];
  assert.deepEqual(viditelni(sluc('profily', jejich, nase)).map(p => p.id), ['e']);
  assert.deepEqual(viditelni(sluc('profily', nase, jejich)).map(p => p.id), ['e']);
});

test('deleting a player: their data is gone, others\' stays, another player is selected', () => {
  const stav = { profily: [{ id: 'e', jmeno: 'E' }, { id: 'f', jmeno: 'F' }], profil: 'f',
    vysledky: { e: { a: 1 }, f: { b: 2 } }, statistiky: { e: {}, f: { x: 1 } }, oblibene: { f: ['a'], e: [] }, denik: { f: { '2026-11-17': [1, 1, 1] } } };
  const s = smazHrace(stav, 'f', 77);
  assert.deepEqual(s.profily, [{ id: 'e', jmeno: 'E' }, { id: 'f', smazano: 77 }]);
  assert.equal(s.profil, 'e');
  assert.deepEqual([s.vysledky, s.statistiky, s.oblibene, s.denik], [{ e: { a: 1 } }, { e: {} }, { e: [] }, {}]);
  assert.deepEqual(stav.vysledky.f, { b: 2 });                       // the original state is not modified
});

test('deleting a player drops their library songs hidden from home, others\' stay', () => {
  const stav = { profily: [{ id: 'e', jmeno: 'E' }, { id: 'f', jmeno: 'F' }], profil: 'e', vysledky: {}, statistiky: {}, oblibene: {},
    knihovnaSkryte: { e: { 'library/a.musicxml': 1 }, f: { 'library/b.musicxml': 2 } } };
  assert.deepEqual(smazHrace(stav, 'f', 77).knihovnaSkryte, { e: { 'library/a.musicxml': 1 } });
  assert.deepEqual(smazHrace({ ...stav, knihovnaSkryte: undefined }, 'f', 77).knihovnaSkryte, {});   // older data without the key
});
