import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { obrazekHrace } from '../static/ui/pictures.js';
import { OBRAZKY, paleta } from '../static/lib/profiles.js';

test('animals are an expression atlas, the pictures for adults an illustration in an SVG, unknown → initial', () => {
  const pal = paleta('malina');
  for (const o of OBRAZKY.dite) assert.match(obrazekHrace({ jmeno: 'marta', obrazek: o }, pal), /^<span class="zvire" data-zvire=/, o);
  for (const o of OBRAZKY.dospely) {
    assert.match(obrazekHrace({ jmeno: 'marta', obrazek: o }, pal), new RegExp(`^<svg[^>]*><image href="pictures/${o}.webp"`), o);
    assert.ok(existsSync(new URL(`../static/pictures/${o}.webp`, import.meta.url)), o);
  }
  // the symbols of the first adult set show the illustration with the same motif
  assert.match(obrazekHrace({ jmeno: 'marta', obrazek: 'inicial' }, pal), /pictures\/rusalka\.webp/);
  assert.match(obrazekHrace({ jmeno: 'marta', obrazek: 'nota' }, pal), /pictures\/lyra\.webp/);
  assert.match(obrazekHrace({ jmeno: 'marta', obrazek: 'klavesy' }, pal), /pictures\/klavir\.webp/);
  assert.match(obrazekHrace({ jmeno: 'Ota', obrazek: 'neznamy' }, pal), />O</);   // unknown picture → initial
});
