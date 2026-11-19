import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nastavSoustavu, soustava, nazevKroku, nazevTonu, jmenaKlaves, vychoziSoustava } from '../static/lib/note_names.js';
import { naMusicXml, zMusicXml } from '../static/lib/song.js';

test('Czech names: Cis, Es, As, B, H, His, Fes', () => {
  nastavSoustavu('cs');
  assert.equal(soustava(), 'cs');
  assert.deepEqual([['c', 1], ['e', -1], ['a', -1], ['b', -1], ['b', 0], ['b', 1], ['f', -1], ['d', 2], ['g', -2]].map(([k, a]) => nazevKroku(k, a)),
    ['Cis', 'Es', 'As', 'B', 'H', 'His', 'Fes', 'Disis', 'Geses']);
  assert.deepEqual([61, 63, 70, 71].map(m => nazevTonu(m)), ['Cis', 'Dis', 'Ais', 'H']);
  assert.deepEqual([61, 70].map(m => nazevTonu(m, true)), ['Des', 'B']);
  assert.deepEqual(jmenaKlaves(), ['C', 'Cis', 'D', 'Dis', 'E', 'F', 'Fis', 'G', 'Gis', 'A', 'B', 'H']);
});

test('English names: C#, Eb, Bb, B', () => {
  nastavSoustavu('en');
  assert.deepEqual([['c', 1], ['e', -1], ['b', -1], ['b', 0], ['f', 2], ['g', -2]].map(([k, a]) => nazevKroku(k, a)), ['C#', 'Eb', 'Bb', 'B', 'F##', 'Gbb']);
  assert.deepEqual([61, 70, 71].map(m => nazevTonu(m)), ['C#', 'A#', 'B']);
  assert.deepEqual([61, 70].map(m => nazevTonu(m, true)), ['Db', 'Bb']);
  assert.deepEqual(jmenaKlaves(), ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']);
  nastavSoustavu('cs');
});

test('chord B: drawn as H in Czech, B in English; saved notes can be read in both systems', () => {
  const pisen = { nazev: 'T', takt: '4/4', predznamenani: 0, klic: 'houslovy', tempo: 90,
    takty: [{ noty: [{ t: 'B4', d: '1/1', lig: false, s: '' }], akordy: [{ doba: 0, znacka: 'B' }] }] };
  nastavSoustavu('cs');
  const cs = naMusicXml(pisen);
  assert.match(cs, /<root-step text="H">B<\/root-step>/);
  nastavSoustavu('en');
  const en = naMusicXml(pisen);
  assert.match(en, /<root-step>B<\/root-step>/);
  for (const xml of [cs, en]) assert.equal(zMusicXml(xml).takty[0].akordy[0].znacka.replace('H', 'B'), 'B');
  nastavSoustavu('cs');
});

test('Do Re Mi: the syllables of the language, # and b like the English system', () => {
  nastavSoustavu('do', ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si']);
  assert.equal(soustava(), 'do');
  assert.equal(nazevKroku('d', 0), 'Ré');
  assert.equal(nazevKroku('b', -1), 'Sib');
  assert.equal(nazevKroku('f', 1), 'Fa#');
  assert.equal(jmenaKlaves()[1], 'Do#');
  assert.equal(jmenaKlaves()[10], 'Sib');
  nastavSoustavu('do');                                 // without syllables: the Latin ones
  assert.equal(nazevKroku('d', 0), 'Re');
  assert.equal(nazevKroku('c', 0, 'cs'), 'C');           // the other systems unchanged
  assert.equal(nazevKroku('b', 0, 'cs'), 'H');
  assert.equal(nazevKroku('b', -1, 'en'), 'Bb');
  nastavSoustavu('cs');
});

test('the default note names follow the language', () => {
  for (const j of ['cs', 'sk', 'de', 'pl']) assert.equal(vychoziSoustava(j), 'cs', j);
  for (const j of ['en', 'ja', 'zh-CN', 'hi']) assert.equal(vychoziSoustava(j), 'en', j);
  for (const j of ['fr', 'es', 'it', 'pt', 'pt-BR', 'ru', 'uk', 'ar']) assert.equal(vychoziSoustava(j), 'do', j);
});
