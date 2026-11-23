// Library build tool: catalog + text notation → build/library (MusicXML, index.json, review.html), and its checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { postavKnihovnu } from '../tools/library.mjs';

const PISEN = (nazev, takt3 = 'C4/4 D4/4 E4/4 F4/4') => `title: ${nazev}
author: traditional
time: 4/4
key: 0
tempo: 100
clef: treble
---
1) C | C4/4=Ka- D4/4=čen- E4/4=ky C4/4=do
2) F | F4/4=ry- E4/4=b- D4/4=ní- D4/4=ku
3) G7 | ${takt3}
4) C | C4/1=už
`;
const ZAZNAM = (txt, extra = {}) => ({ txt, police: txt.split('/')[0], jazyk: 'cs', zdroj: 'test source', volne: 'traditional', ...extra });

/** temp folder removed after the test, also when an assertion fails */
function docasna(t) {
  const d = mkdtempSync(join(tmpdir(), 'rusalka-lib-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}
/** temp library: { 'children/a.txt': text, … } + catalog entries → { zdroj, cil } URLs */
function knihovna(t, soubory, katalog) {
  const d = docasna(t);
  for (const [cesta, text] of Object.entries(soubory)) {
    mkdirSync(join(d, 'library', cesta.split('/')[0]), { recursive: true });
    writeFileSync(join(d, 'library', cesta), text);
  }
  mkdirSync(join(d, 'library'), { recursive: true });
  writeFileSync(join(d, 'library', 'catalog.json'), JSON.stringify(katalog));
  return { zdroj: pathToFileURL(join(d, 'library') + '/'), cil: pathToFileURL(join(d, 'build') + '/'), d };
}

test('a valid song → MusicXML, index entry with stupen from obtiznost and nazev from the title, review page', async t => {
  const { zdroj, cil, d } = knihovna(t, { 'children/kacenky.txt': PISEN('Kačenky') },
    [ZAZNAM('children/kacenky.txt', { preklad: { en: 'Ducklings' } })]);
  const { index, chyby } = await postavKnihovnu({ zdroj, cil });
  assert.deepEqual(chyby, []);
  assert.deepEqual(index, [{ soubor: 'library/children/kacenky.musicxml', nazev: 'Kačenky', police: 'children', stupen: 1,
    autor: 'traditional', jazyk: 'cs', preklad: { en: 'Ducklings' } }]);
  const xml = readFileSync(join(d, 'build', 'children', 'kacenky.musicxml'), 'utf8');
  assert.match(xml, /<work-title>Kačenky<\/work-title>/);
  assert.deepEqual(JSON.parse(readFileSync(join(d, 'build', 'index.json'), 'utf8')), index);
  const review = readFileSync(join(d, 'build', 'review.html'), 'utf8');
  assert.match(review, /Kačenky/);
  assert.match(review, /test source/);
  assert.match(review, /\.\.\/vendor\/verovio-toolkit-wasm\.js/);
  assert.match(review, /children\/kacenky\.musicxml/);
});

test('a harder song gets a higher stupen than an easy one', async t => {
  const tezka = PISEN('Těžká', 'C4/16 D#4/16 F#4/16 G#4/16 A#4/16 C#5/16 D#5/16 F5/16 G5/4 C4/4').replace('tempo: 100', 'tempo: 160');
  const { zdroj, cil, d } = knihovna(t, { 'children/lehka.txt': PISEN('Lehká'), 'classics/tezka.txt': tezka },
    [ZAZNAM('children/lehka.txt'), ZAZNAM('classics/tezka.txt')]);
  const { index, chyby } = await postavKnihovnu({ zdroj, cil });
  assert.deepEqual(chyby, []);
  const st = Object.fromEntries(index.map(p => [p.nazev, p.stupen]));
  assert.ok(st['Těžká'] > st['Lehká'], JSON.stringify(st));
});

test('a separate verse is kept in the index, while invalid lyric lines fail the build', async t => {
  const slova = ['První řádek', 'Druhý řádek.'];
  const variantyTextu = [{ nazev: 'Druhá verze', jazyk: 'cs', slova, police: 'christmas' }];
  const data = knihovna(t, { 'children/a.txt': PISEN('A'), 'children/b.txt': PISEN('B'), 'children/c.txt': PISEN('C') },
    [ZAZNAM('children/a.txt', { slova, variantyTextu }), ZAZNAM('children/b.txt', { slova: [' '] }),
      ZAZNAM('children/c.txt', { variantyTextu: [{ ...variantyTextu[0], jazyk: '"' }] })]);
  const { index, chyby } = await postavKnihovnu(data);
  assert.deepEqual(index.map(p => p.slova), [slova]);
  assert.deepEqual(index.map(p => p.variantyTextu), [variantyTextu]);
  assert.equal(chyby.length, 2);
  assert.match(chyby[0], /children\/b\.txt: slova/);
  assert.match(chyby[1], /children\/c\.txt: variantyTextu/);
});

test('a bar-length error names the file and the bar', async t => {
  const { zdroj, cil, d } = knihovna(t, { 'children/spatna.txt': PISEN('Špatná', 'C4/4 D4/4 E4/4') }, [ZAZNAM('children/spatna.txt')]);
  const { chyby } = await postavKnihovnu({ zdroj, cil });
  assert.equal(chyby.length, 1, chyby.join('\n'));
  assert.match(chyby[0], /children\/spatna\.txt/);
  assert.match(chyby[0], /takt 3/);
});

test('a .txt without a catalog entry and a catalog entry without a .txt are both errors', async t => {
  const { zdroj, cil, d } = knihovna(t, { 'folk/sama.txt': PISEN('Sama') }, [ZAZNAM('folk/chybi.txt')]);
  const { chyby } = await postavKnihovnu({ zdroj, cil });
  assert.ok(chyby.some(c => c.includes('folk/sama.txt')), chyby.join('\n'));
  assert.ok(chyby.some(c => c.includes('folk/chybi.txt')), chyby.join('\n'));
});

test('missing zdroj, volne or jazyk is an error', async t => {
  for (const pole of ['zdroj', 'volne', 'jazyk']) {
    const zaznam = ZAZNAM('children/a.txt');
    delete zaznam[pole];
    const { zdroj, cil, d } = knihovna(t, { 'children/a.txt': PISEN('A') }, [zaznam]);
    const { index, chyby } = await postavKnihovnu({ zdroj, cil });
    assert.ok(chyby.some(c => c.includes('children/a.txt') && c.includes(pole)), `${pole}: ${chyby.join('\n')}`);
    assert.deepEqual(index, [], pole);
  }
});

test('a duplicate title, or a title of a starter song, is an error', async t => {
  const { zdroj, cil, d } = knihovna(t, { 'children/a.txt': PISEN('Stejná'), 'folk/b.txt': PISEN('stejna'), 'christmas/c.txt': PISEN('Silent Night') },
    [ZAZNAM('children/a.txt'), ZAZNAM('folk/b.txt'), ZAZNAM('christmas/c.txt')]);
  const { chyby } = await postavKnihovnu({ zdroj, cil });
  assert.ok(chyby.some(c => c.includes('folk/b.txt') && /duplicate/i.test(c)), chyby.join('\n'));
  assert.ok(chyby.some(c => c.includes('christmas/c.txt') && /starter/i.test(c)), chyby.join('\n'));
});

test('Czech folk songs stay in folk/ (their address keeps the players\' results) but stand on their own shelf', async t => {
  const { zdroj, cil } = knihovna(t, { 'folk/kacenky.txt': PISEN('Kačenky'), 'folk/ducks.txt': PISEN('Ducks') },
    [ZAZNAM('folk/kacenky.txt', { police: 'czech' }), ZAZNAM('folk/ducks.txt', { jazyk: 'en' })]);
  const { index, chyby } = await postavKnihovnu({ zdroj, cil });
  assert.deepEqual(chyby, []);
  assert.deepEqual(index.map(p => [p.soubor, p.police]),
    [['library/folk/kacenky.musicxml', 'czech'], ['library/folk/ducks.musicxml', 'folk']]);
  const spatne = knihovna(t, { 'children/a.txt': PISEN('A') }, [ZAZNAM('children/a.txt', { police: 'czech' })]);
  assert.ok((await postavKnihovnu(spatne)).chyby.some(c => /czech/.test(c) && /folk\//.test(c)), 'czech belongs in folk/');
});

test('an unknown shelf is an error', async t => {
  const { zdroj, cil, d } = knihovna(t, { 'pop/a.txt': PISEN('A') }, [ZAZNAM('pop/a.txt')]);
  const { chyby } = await postavKnihovnu({ zdroj, cil });
  assert.ok(chyby.some(c => c.includes('pop/a.txt') && /shelf/i.test(c)), chyby.join('\n'));
});

test('an uncertain bar (?) is an error: library songs must be checked', async t => {
  const { zdroj, cil, d } = knihovna(t, { 'children/a.txt': PISEN('A').replace('3) G7 |', '3) {?} G7 |') }, [ZAZNAM('children/a.txt')]);
  const { chyby } = await postavKnihovnu({ zdroj, cil });
  assert.ok(chyby.some(c => c.includes('children/a.txt') && c.includes('takt 3')), chyby.join('\n'));
});

test('the real library builds with no errors, one index entry per catalog entry', async t => {
  const d = docasna(t);
  const zdroj = new URL('../library/', import.meta.url);
  const { index, chyby } = await postavKnihovnu({ zdroj, cil: pathToFileURL(d + '/') });
  assert.deepEqual(chyby, []);
  const katalog = JSON.parse(readFileSync(new URL('catalog.json', zdroj), 'utf8'));
  assert.equal(index.length, katalog.length);
  for (const p of index) assert.ok(existsSync(join(d, p.soubor.replace(/^library\//, ''))), p.soubor);
});

test('review playback: repeats unrolled, tied notes joined, chords last until the next one', async t => {
  const { prehravani } = await import('../tools/library.mjs');
  const { zTextu } = await import('../static/lib/notation.js');
  const { pisen } = zTextu(`title: T
time: 2/4
tempo: 0
---
1) {|:} C | C4/4 E4/4~
2) {:|} G7 | E4/4 r/4
`);
  const { tempo, noty, akordy } = prehravani(pisen);
  assert.equal(tempo, 100);
  assert.deepEqual(noty, [{ t: 0, d: 1, m: [60] }, { t: 1, d: 2, m: [64] }, { t: 4, d: 1, m: [60] }, { t: 5, d: 2, m: [64] }]);
  assert.deepEqual(akordy.map(a => [a.t, a.d, a.m]), [[0, 2, [48, 52, 55]], [2, 2, [55, 59, 62, 65]], [4, 2, [48, 52, 55]], [6, 2, [55, 59, 62, 65]]]);
});

test('a song whose catalog entry has an error is left out of the index', async t => {
  const bezJazyka = ZAZNAM('children/a.txt');
  delete bezJazyka.jazyk;
  const { zdroj, cil } = knihovna(t, { 'children/a.txt': PISEN('A'), 'folk/b.txt': PISEN('B'), 'folk/c.txt': PISEN('C') },
    [bezJazyka, ZAZNAM('folk/b.txt', { preklad: { de: 'B' } }), ZAZNAM('folk/c.txt')]);
  const { index, chyby } = await postavKnihovnu({ zdroj, cil });
  assert.ok(chyby.some(c => c.includes('children/a.txt') && c.includes('jazyk')), chyby.join('\n'));
  assert.ok(chyby.some(c => c.includes('folk/b.txt') && c.includes('preklad')), chyby.join('\n'));
  assert.deepEqual(index.map(p => p.nazev), ['C']);
});

test('a file name with #, ? or % is reported, not a crash', async t => {
  const soubory = { 'children/a#b.txt': PISEN('A'), 'children/c?d.txt': PISEN('C'), 'children/e%20f.txt': PISEN('E'), 'children/ok.txt': PISEN('OK') };
  const { zdroj, cil } = knihovna(t, soubory, Object.keys(soubory).map(f => ZAZNAM(f)));
  const { index, chyby } = await postavKnihovnu({ zdroj, cil });
  for (const f of ['a#b', 'c?d', 'e%20f']) assert.ok(chyby.some(c => c.includes(`children/${f}.txt`) && /file name/.test(c)), `${f}: ${chyby.join('\n')}`);
  assert.deepEqual(index.map(p => p.nazev), ['OK']);
});

test('the website gets the library without the review page (npm run web → web/library/)',
  { skip: !existsSync(new URL('../static/vendor/verovio-toolkit-wasm.js', import.meta.url)) && 'no static/vendor' }, async t => {
    const koren = new URL('../', import.meta.url);
    const { chyby } = await postavKnihovnu({ zdroj: new URL('library/', koren), cil: new URL('build/library/', koren) });
    assert.deepEqual(chyby, []);
    const ven = docasna(t);
    execFileSync('node', ['tools/web.mjs'], { cwd: fileURLToPath(koren), stdio: 'ignore', env: { ...process.env, RUSALKA_WEB_OUT: ven } });
    assert.ok(existsSync(join(ven, 'library', 'index.json')));
    assert.ok(existsSync(join(ven, 'library', 'folk', 'pasla-ovecky.musicxml')));
    assert.ok(!existsSync(join(ven, 'library', 'review.html')), 'review.html must stay on the dev server');
  });
