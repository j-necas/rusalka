import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { zMusicXml } from '../static/lib/song.js';
import { obtiznost } from '../static/lib/difficulty.js';

const nacti = f => zMusicXml(readFileSync(new URL(`../songs/${f}.musicxml`, import.meta.url), 'utf8'));

test('samples: easy children\'s songs are easy, Für Elise and Minuet harder', () => {
  assert.equal(obtiznost(nacti('Mary Had a Little Lamb')).stupen, 1);
  assert.equal(obtiznost(nacti('Frère Jacques')).stupen, 1);
  assert.equal(obtiznost(nacti('Twinkle, Twinkle, Little Star')).stupen, 1);
  assert.ok(obtiznost(nacti('Für Elise (opening)')).stupen >= 2);
  assert.ok(obtiznost(nacti('Minuet in G')).stupen >= 2);
  assert.ok(obtiznost(nacti('Für Elise (opening)')).duvody.includes('šestnáctinové noty'));
});

test('every sample gets level 1–3 and a name', () => {
  for (const f of readdirSync(new URL('../songs/', import.meta.url)).filter(x => x.endsWith('.musicxml'))) {
    const o = obtiznost(zMusicXml(readFileSync(new URL(`../songs/${f}`, import.meta.url), 'utf8')));
    assert.ok([1, 2, 3].includes(o.stupen), f);
    assert.ok(['snadná', 'střední', 'těžší'].includes(o.nazev), f);
  }
});

test('an empty song is easy', () => {
  assert.equal(obtiznost({ takt: '4/4', predznamenani: 0, takty: [{ akordy: [], noty: [{ t: 'r', d: '1/1' }] }] }).stupen, 1);
});
