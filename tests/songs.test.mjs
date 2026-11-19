// My songs (Songs window): the user's own songs, searchable without diacritics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtrujPisne } from '../static/lib/songs.js';

const SEZNAM = [
  { soubor: 'Silent Night.musicxml', nazev: 'Silent Night' },
  { soubor: 'Píseň.musicxml', nazev: 'Píseň o klavíru' },
  { soubor: 'Ode to Joy.musicxml', nazev: 'Ode to Joy' },
  { soubor: 'Áčko.musicxml', nazev: 'Áčko' },
];

test('by title (Czech order)', () => {
  assert.deepEqual(filtrujPisne(SEZNAM, '').map(p => p.nazev), ['Áčko', 'Ode to Joy', 'Píseň o klavíru', 'Silent Night']);
});

test('search ignores case and diacritics, in titles and authors', () => {
  assert.deepEqual(filtrujPisne(SEZNAM, 'pisen').map(p => p.nazev), ['Píseň o klavíru']);
  assert.deepEqual(filtrujPisne(SEZNAM, 'JOY').map(p => p.nazev), ['Ode to Joy']);
  assert.deepEqual(filtrujPisne(SEZNAM, 'beethoven', { 'Ode to Joy.musicxml': { autor: 'Ludwig van Beethoven' } }).map(p => p.nazev), ['Ode to Joy']);
  assert.deepEqual(filtrujPisne(SEZNAM, '  '), filtrujPisne(SEZNAM, ''));
});
