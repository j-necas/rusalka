// Text notation in the app (static/lib/notation.js): English header keys, structured errors for the app's language,
// and the round trip through naText. The rusalka-sheet-music skill keeps a copy of the same file.
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zTextu, naText } from '../static/lib/notation.js';
import { zMusicXml, naMusicXml, kontrola } from '../static/lib/song.js';
import { textChybZapisu } from '../static/lib/practice.js';
import { nastavJazyk } from '../static/lib/texts.js';
import cs from '../static/lang/cs.js';
import en from '../static/lang/en.js';

const PISEN = `title: Cat in the hole
author: traditional
time: 2/4
key: -1
tempo: 100
clef: treble
---
1) F | F4/8=Cat C5/8=in A4/4=the
2) C7 | G4/4 F4/4
`;

test('English header keys', () => {
  const { pisen, chyby } = zTextu(PISEN);
  assert.deepEqual(chyby, []);
  assert.equal(pisen.nazev, 'Cat in the hole'); assert.equal(pisen.autor, 'traditional');
  assert.equal(pisen.takt, '2/4'); assert.equal(pisen.predznamenani, -1); assert.equal(pisen.tempo, 100);
  assert.equal(pisen.klic, 'houslovy'); assert.equal(pisen.takty.length, 2);
  assert.equal(zTextu(PISEN.replace('clef: treble', 'clef: bass')).pisen.klic, 'basovy');
});

test('Czech header keys still work (old files and the skill)', () => {
  const { pisen, chyby } = zTextu('název: Kočka\ntakt: 3/4\npředznamenání: 2\nklíč: basový\n---\n1) | D4/2.\n');
  assert.deepEqual(chyby, []);
  assert.deepEqual([pisen.nazev, pisen.takt, pisen.predznamenani, pisen.klic], ['Kočka', '3/4', 2, 'basovy']);
});

test('errors are structured with line numbers and readable in both languages', () => {
  const { polozky, chyby } = zTextu('title: X\ncolour: red\n---\n1) C | C4/4 X9/4\n2) G7 C4/2\n');
  assert.deepEqual(polozky.map(p => [p.radek, p.druh]), [[2, 'neznamaHlavicka'], [4, 'spatnaNota'], [5, 'chybiSvislice']]);
  assert.equal(chyby.length, 3);                                   // Czech strings stay for the skill
  nastavJazyk('en', en);
  const t = textChybZapisu(polozky);
  assert.match(t[0], /line 2/); assert.match(t[1], /X9\/4/); assert.match(t[2], /\|/);
  assert.ok(t.every(x => !/[ěščřžýáíéůú]/.test(x)), t.join(' | '));
  nastavJazyk('cs', cs);
  assert.match(textChybZapisu(polozky)[0], /řádek 2/);
  assert.equal(zTextu('').polozky.at(-1).druh, 'zadneTakty');
});

test('naText writes English keys and round-trips', () => {
  const xml = readFileSync(new URL('../songs/Frère Jacques.musicxml', import.meta.url), 'utf8');
  const p = zMusicXml(xml), text = naText(p);
  assert.match(text, /^title: Frère Jacques\n/); assert.match(text, /\ntime: 4\/4\n/); assert.match(text, /\nkey: 0\n/);
  const zpet = zTextu(text);
  assert.deepEqual(zpet.chyby, []);
  assert.equal(naMusicXml(zpet.pisen), naMusicXml(p));
  assert.deepEqual(kontrola(zpet.pisen), []);
});

// ---------------------------------------------------------------- what parents actually paste from a chat
import { vyberZapis } from '../static/lib/notation.js';

test('a whole chat answer: the notation is taken from the code block, prose and fences dropped', () => {
  const odpoved = 'Here is the song:\r\n\r\n```text\r\ntitle: Test\r\ntime: 2/4\r\n---\r\n1) C | C4/4 E4/4\r\n2) G7 | G4/2\r\n```\r\n\r\nI wasn\'t sure about bar 2.\r\n';
  const z = vyberZapis(odpoved);
  assert.equal(z, 'title: Test\ntime: 2/4\n---\n1) C | C4/4 E4/4\n2) G7 | G4/2\n');
  assert.deepEqual(zTextu(z).chyby, []);
});

test('without fences: prose before the header and after the last bar is dropped', () => {
  const z = vyberZapis('Sure! Here it is.\ntitle: Test\ntime: 2/4\n---\n1) | C4/4 E4/4\n2) | G4/2\nBar 2 was smudged.\nHope it helps!');
  assert.equal(z, 'title: Test\ntime: 2/4\n---\n1) | C4/4 E4/4\n2) | G4/2\n');
  assert.equal(vyberZapis('title: A\n---\n1) | C4/1\n'), 'title: A\n---\n1) | C4/1\n', 'clean text unchanged');
});

test('numeric header values: a leading number counts, anything else is an error (no silent 0)', () => {
  const { pisen, polozky } = zTextu('title: A\nkey: 1 (G major)\ntempo: 120 (Allegro)\n---\n1) | C4/1\n');
  assert.deepEqual(polozky, []);
  assert.equal(pisen.predznamenani, 1); assert.equal(pisen.tempo, 120);
  const spatne = zTextu('title: A\nkey: F major\n---\n1) | C4/1\n').polozky;
  assert.deepEqual(spatne.map(p => [p.radek, p.druh]), [[2, 'spatnaHodnota']]);
});

test('uncertain bars as 0-based indexes for the editor', async () => {
  const { nejisteTakty } = await import('../static/lib/notation.js');
  const { pisen } = zTextu('title: A\n---\n1) | C4/1\n2) {?} | D4/1\n3) | E4/1\n4) {?} | F4/1\n');
  assert.deepEqual(nejisteTakty(pisen), [1, 3]);
});

test('a numbered bar line without "|" is kept (so its mistake is reported, not hidden)', () => {
  const z = vyberZapis('title: A\ntime: 2/4\n---\n1) C | C4/4 E4/4\n2) C4/2\nThanks!');
  assert.equal(z, 'title: A\ntime: 2/4\n---\n1) C | C4/4 E4/4\n2) C4/2\n');
  assert.deepEqual(zTextu(z).polozky.map(p => p.radek), [5]);
});

test('a beam never runs past the end of a triplet: Verovio keeps the bar its full length', async () => {
  const { default: createVerovioModule } = await import('verovio/wasm');
  const { VerovioToolkit } = await import('verovio/esm');
  const { zpracujVerovio } = await import('../static/lib/render.js');
  const tk = new VerovioToolkit(await createVerovioModule());
  const { pisen, chyby } = zTextu(`title: T
time: 4/4
---
1) | r/16t C4/16t D4/16t E4/8 F4/4 G4/2
2) | C4/1
`);
  assert.deepEqual(chyby, []);
  const xml = naMusicXml(pisen);
  // the tuplet's notes are beamed only among themselves: the eighth after it starts its own beam (or none)
  const noty = [...xml.matchAll(/<note>[\s\S]*?<\/note>/g)].map(m => m[0]);
  const e = noty.findIndex(n => /<step>E<\/step>/.test(n));
  assert.doesNotMatch(noty[e], /<beam number="1">(continue|end)<\/beam>/);
  const d = zpracujVerovio(tk, xml, pisen);
  assert.ok(Math.abs(d.takty[1] - 4) < 1e-6, `bar 2 starts at ${d.takty[1]}`);
});

test('after an import: the bars to check are the ones that do not add up and the uncertain ones', async () => {
  const { taktyKOvereni } = await import('../static/lib/notation.js');
  const n = (t, d) => ({ t, d, lig: false, s: '' });
  const p = { takt: '4/4', takty: [{ noty: [n('C4', '1/1')] }, { noty: [n('C4', '1/2')] }, { noty: [n('C4', '1/1')] }, { noty: [n('C4', '1/1')] }],
    nejistoty: ['takt 4: změna taktu na 3/4', 'takt 2: vynechán hlas 2'] };
  assert.deepEqual(taktyKOvereni(p), [2, 4]);
  assert.deepEqual(taktyKOvereni({ takt: '4/4', takty: [{ noty: [n('C4', '1/1')] }] }), []);
});

test('the notation rejects bad input with the line number instead of crashing or silently dropping it', () => {
  const H = (hlavicka = '', telo = '| C4/1') => zTextu(`title: T\ntime: 4/4\n${hlavicka}---\n${telo}\n`);
  const druhy = r => r.polozky.map(p => p.druh);
  for (const takt of ['0/4', '4/0', '3/5', '4/6']) {
    const r = zTextu(`title: T\ntime: ${takt}\n---\n| C4/1\n`);
    assert.ok(druhy(r).includes('spatnyTakt'), takt);
    assert.ok(r.polozky.find(p => p.druh === 'spatnyTakt').radek === 2, `${takt}: line number`);
  }
  assert.ok(druhy(H('key: 99\n')).includes('mimoMez'));
  assert.ok(druhy(H('key: -8\n')).includes('mimoMez'));
  assert.ok(druhy(H('tempo: -50\n')).includes('mimoMez'));
  assert.deepEqual(druhy(H('tempo: 0\nkey: -7\n')), [], 'tempo 0 = not given, -7 flats are fine');
  assert.deepEqual(H('', '| C9/1').polozky.map(p => [p.druh, p.radek]), [['mimoRozsah', 4]]);
  assert.ok(druhy(H('', '| A-1/1')).includes('mimoRozsah'));
  assert.deepEqual(druhy(H('', '| C4/1 || C3/1 || E3/1')), ['vicLevych']);
  for (const a of ['Cfoo', 'G@9', 'A@-3', 'H7x']) assert.ok(druhy(H('', `${a} | C4/1`)).includes('spatnyAkord'), a);
  assert.deepEqual(druhy(H('', 'C G7@3.5 Am@2 | C4/1')), []);
  assert.deepEqual(H('', '| C4/2~ D4/2\n| E4/1').polozky.map(p => [p.druh, p.radek]), [['spatnaLigatura', 4]]);
  assert.deepEqual(druhy(H('', '| C4/2 E4/2~\n| r/1')), ['spatnaLigatura']);
  assert.deepEqual(druhy(H('', '| C4/2 E4/2~\n| E4/1')), [], 'a tie across the bar line to the same pitch');
});

test('prose with a "|" after the notation is not read as a bar', () => {
  const text = 'Here you go:\n```\ntitle: T\ntime: 4/4\n---\n1) C | C4/1\n2) G | D4/1\n```\nTip: play slowly | then faster.\n';
  const { pisen, chyby } = zTextu(vyberZapis(text));
  assert.deepEqual(chyby, []);
  assert.equal(pisen.takty.length, 2);
  const bezPlotu = 'title: T\ntime: 4/4\n---\n1) C | C4/1\n2) G | D4/1\nTip: play slowly | then faster.\n';
  assert.equal(zTextu(vyberZapis(bezPlotu)).pisen.takty.length, 2);
});

test('a repeat played three times survives the notation and back (naText writes :|x3)', () => {
  const xml = `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>x</part-name></score-part></part-list><part id="P1">`
    + `<measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>`
    + `<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>`
    + `<barline location="right"><repeat direction="backward" times="3"/></barline></measure></part></score-partwise>`;
  const p = zMusicXml(xml);
  assert.equal(p.takty[0].znacky.pocetPruchodu, 3);
  const text = naText(p);
  assert.match(text, /\{:\|x3\}/);
  assert.equal(zTextu(text).pisen.takty[0].znacky.pocetPruchodu, 3);
});
