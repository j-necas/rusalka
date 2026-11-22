import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import {
  zlomek, naZlomek, typNoty, metrum, vyska, vysky, zMidi, diatonickyKrok, kontrola, rozvin, naMusicXml, zMusicXml,
  akordZnacky, tonyAkordu,
} from '../static/lib/song.js';

const n = (t, d, extra = {}) => ({ t, d, lig: false, s: '', ...extra });
const zaklad = (takty, extra = {}) => ({ nazev: 'Test', autor: '', klic: 'houslovy', predznamenani: 2, takt: '3/4', tempo: 90, takty, ...extra });

test('note durations and types', () => {
  assert.equal(zlomek('3/8'), 1.5);
  assert.equal(zlomek('1'), 4);
  assert.equal(zlomek('x'), null);
  assert.equal(naZlomek(1.5), '3/8');
  assert.equal(naZlomek(1 / 3), '1/12');
  assert.deepEqual(typNoty(1.5), { typ: 'quarter', tecky: 1, trioly: false });
  assert.deepEqual(typNoty(1 / 3), { typ: 'eighth', tecky: 0, trioly: true });
  assert.equal(typNoty(1.25), null);
  assert.deepEqual(metrum('6/8'), { beats: 6, beatType: 8, delka: 3, doba: 1.5 });
});

test('pitches, spelling and diatonic step', () => {
  assert.equal(vyska('F#4').midi, 66);
  assert.equal(vyska('H3').krok, 'B');
  assert.equal(vyska('Bb3').midi, 58);
  assert.equal(vysky('C4 E4 G4').length, 3);
  assert.deepEqual(vysky('r'), []);
  assert.equal(zMidi(66, 2), 'F#4');
  assert.equal(zMidi(66, -2), 'Gb4');
  assert.equal(diatonickyKrok('E4', 1, 2), 'F#4');        // in D major F is always F#
  assert.equal(diatonickyKrok('C#5', 1, 2), 'D5');
  assert.equal(diatonickyKrok('C4', -1, 0), 'B3');
});

test('chord symbols, also in Czech notation', () => {
  assert.equal(akordZnacky('Hmi').koren, 'B');
  assert.equal(akordZnacky('Hmi').druh, 'minor');
  assert.equal(akordZnacky('A7').druh, 'dominant');
  assert.deepEqual(akordZnacky('D/F#').bas, { krok: 'F', alter: 1 });
  assert.deepEqual(tonyAkordu('G7').tony, [7, 11, 2, 5]);
});

test('kontrola: a pickup and a short bar before a repeat are not errors, a short bar in the middle is', () => {
  const p = zaklad([
    { akordy: [], noty: [n('A4', '1/4')] },                                     // pickup
    { akordy: [], noty: [n('D5', '1/2'), n('C#5', '1/4')] },
    { akordy: [], noty: [n('B4', '1/2')], znacky: { konecRepetice: true } },     // short before a repeat
    { akordy: [], noty: [n('A4', '1/2')] },                                     // short in the middle → error
    { akordy: [], noty: [n('D5', '1/2'), n('r', '1/4')] },
  ]);
  const k = kontrola(p);
  assert.equal(k.length, 1);
  assert.match(k[0], /takt 4/);
});

test('rozvin: repeat with endings', () => {
  const p = zaklad([
    { akordy: [], noty: [n('D4', '3/4')], znacky: { zacatekRepetice: true } },
    { akordy: [], noty: [n('E4', '3/4')] },
    { akordy: [], noty: [n('F#4', '3/4')], znacky: { volta: [1], konecRepetice: true } },
    { akordy: [], noty: [n('G4', '3/4')], znacky: { volta: [2] } },
    { akordy: [], noty: [n('A4', '3/4')] },
  ]);
  const { pisen, poradi } = rozvin(p);
  assert.deepEqual(poradi, [0, 1, 2, 0, 1, 3, 4]);
  assert.equal(pisen.takty.length, 7);
  assert.ok(pisen.takty.every(t => !t.znacky));
});

test('rozvin: repeat from the start and D.S. al Coda', () => {
  const p = zaklad([
    { akordy: [], noty: [n('D4', '3/4')] },
    { akordy: [], noty: [n('E4', '3/4')], znacky: { segno: true } },
    { akordy: [], noty: [n('F#4', '3/4')], znacky: { doCody: true } },
    { akordy: [], noty: [n('G4', '3/4')], znacky: { ds: true } },
    { akordy: [], noty: [n('A4', '3/4')], znacky: { coda: true } },
  ]);
  assert.deepEqual(rozvin(p).poradi, [0, 1, 2, 3, 1, 2, 4]);
  const q = zaklad([
    { akordy: [], noty: [n('D4', '3/4')] },
    { akordy: [], noty: [n('E4', '3/4')], znacky: { konecRepetice: true } },
    { akordy: [], noty: [n('F#4', '3/4')] },
  ]);
  assert.deepEqual(rozvin(q).poradi, [0, 1, 0, 1, 2]);
});

test('model → MusicXML → model keeps notes, chords, syllables, ties, left hand and repeats', () => {
  const p = zaklad([
    { akordy: [{ doba: 0, znacka: 'D' }, { doba: 2, znacka: 'A7' }],
      noty: [n('F#4', '1/8', { s: 'Hvěz-' }), n('F#4', '1/8', { s: 'di-' }), n('E4', '1/4', { s: 'čky' }), n('D4 F#4', '1/4', { lig: true })],
      leva: [n('D3', '1/2'), n('A2', '1/4')], znacky: { zacatekRepetice: true } },
    { akordy: [{ doba: 0, znacka: 'Hmi' }],
      noty: [n('D4 F#4', '1/4'), n('r', '1/12'), n('C#5', '1/12'), n('B4', '1/12'), n('A4', '1/4', { prst: 3 })],
      leva: [n('B2', '3/4')], znacky: { konecRepetice: true } },
  ]);
  const xml = naMusicXml(p);
  assert.match(xml, /<staves>2<\/staves>/);
  assert.match(xml, /<repeat direction="backward"\/>/);
  assert.match(xml, /<root-step text="H">B<\/root-step>/);
  const zpet = zMusicXml(xml);
  assert.equal(zpet.takt, '3/4');
  assert.equal(zpet.predznamenani, 2);
  assert.equal(zpet.tempo, 90);
  assert.equal(zpet.takty.length, 2);
  assert.deepEqual(zpet.takty[0].noty.map(x => [x.t, x.d, x.s, x.lig]),
    [['F#4', '1/8', 'Hvěz-', false], ['F#4', '1/8', 'di-', false], ['E4', '1/4', 'čky', false], ['D4 F#4', '1/4', '', true]]);
  assert.deepEqual(zpet.takty[1].noty.map(x => x.d), ['1/4', '1/12', '1/12', '1/12', '1/4']);
  assert.equal(zpet.takty[1].noty[4].prst, 3);
  assert.deepEqual(zpet.takty[0].leva.map(x => x.t), ['D3', 'A2']);
  assert.deepEqual(zpet.takty[0].akordy, [{ doba: 0, znacka: 'D' }, { doba: 2, znacka: 'A7' }]);
  assert.equal(zpet.takty[1].akordy[0].znacka, 'Bmi');            // the symbol text stays, the root in English
  assert.deepEqual(zpet.takty[0].znacky, { zacatekRepetice: true });
  assert.deepEqual(zpet.takty[1].znacky, { konecRepetice: true });
  assert.deepEqual(kontrola(zpet), []);
});

test('zMusicXml reads real songs (private, only when available)', () => {
  const d = new URL('../private/songs/', import.meta.url);
  if (!existsSync(d)) return;
  for (const f of readdirSync(d).filter(x => x.endsWith('.musicxml'))) {
    const p = zMusicXml(readFileSync(new URL(f, d), 'utf8'));
    assert.ok(p.takty.length > 10, f);
    assert.ok(p.takty.some(t => t.noty.some(x => x.t !== 'r')), f);
    assert.equal(zMusicXml(naMusicXml(p)).takty.length, p.takty.length, f);
  }
});

test('rozvin: a second repeat without a start begins after the end of the first', () => {
  const p = zaklad([
    { akordy: [], noty: [n('D4', '3/4')], znacky: { konecRepetice: true } },
    { akordy: [], noty: [n('E4', '3/4')] },
    { akordy: [], noty: [n('F#4', '3/4')], znacky: { konecRepetice: true } },
  ]);
  assert.deepEqual(rozvin(p).poradi, [0, 0, 1, 2, 1, 2]);
});

test('the left hand in a pickup gets only a rest of the pickup length', () => {
  const p = zaklad([
    { akordy: [], noty: [n('A4', '1/4')] },
    { akordy: [], noty: [n('D5', '3/4')], leva: [n('D3', '3/4')] },
  ]);
  const zpet = zMusicXml(naMusicXml(p));
  assert.equal(zpet.takty[0].leva[0].d, '1/4');
});

// accidentals outside the key signature must be written with <accidental>, otherwise Verovio does not draw them
const posuvky = xml => [...xml.matchAll(/<note>(?:(?!<\/note>).)*<\/note>/g)].filter(m => !m[0].includes('<rest/>'))
  .map(m => (m[0].match(/<step>(\w)<\/step>(?:<alter>(-?\d)<\/alter>)?<octave>(\d)/).slice(1).join('')) + ':' + (m[0].match(/<accidental>([\w-]+)<\/accidental>/)?.[1] || ''));

test('naMusicXml: accidentals outside the key signature are drawn, last until the end of the bar and only in their octave', () => {
  const p = zaklad([
    { noty: [n('E#4', '1/4'), n('E#4', '1/4'), n('E#5', '1/4')] },       // E# as found in a real song
    { noty: [n('E#4', '1/4'), n('E4', '1/4'), n('F#4', '1/4')] },        // new bar again, then a natural; F# is in D major
    { noty: [n('F4', '1/4'), n('Bb4', '1/4'), n('C4 E4 G#4', '1/4')] },  // natural on F, flat, chord (C# is in D major)
  ], { predznamenani: 2 });
  assert.deepEqual(posuvky(naMusicXml(p)), [
    'E14:sharp', 'E14:', 'E15:sharp',
    'E14:sharp', 'E4:natural', 'F14:',
    'F4:natural', 'B-14:flat', 'C4:natural', 'E4:', 'G14:sharp',
  ]);
});

test('naMusicXml: notes tied across the barline do not repeat the accidental', () => {
  const p = zaklad([
    { noty: [n('r', '1/2'), n('D#4', '1/4', { lig: true })] },
    { noty: [n('D#4', '1/4'), n('D#4', '1/4'), n('r', '1/4')] },
  ], { predznamenani: 0 });
  assert.deepEqual(posuvky(naMusicXml(p)), ['D14:sharp', 'D14:', 'D14:sharp']);
});

test('naMusicXml: a note inside a chain of ties stops the tie before starting the next one', () => {
  const p = zaklad([{ noty: [n('G4', '1/4', { lig: true }), n('G4', '1/4', { lig: true }), n('G4', '1/4')] }], { predznamenani: 0 });
  const prostredni = naMusicXml(p).match(/<note>[\s\S]*?<\/note>/g)[1];
  assert.match(prostredni, /<tie type="stop"\/><tie type="start"\/>/);
  assert.match(prostredni, /<tied type="stop"\/><tied type="start"\/>/);
});

const notaXml = (krok, delka = 4, dalsi = '') =>
  `<note><pitch><step>${krok}</step><octave>4</octave></pitch><duration>${delka}</duration>${dalsi}</note>`;
const taktXml = (obsah, i) => `<measure number="${i + 1}">${obsah}</measure>`;
const xmlTakty = (...takty) => '<score-partwise><part id="P1">' + takty.map(taktXml).join('') + '</part></score-partwise>';
const deleni = '<attributes><divisions>4</divisions></attributes>';
const repZac = '<barline location="left"><repeat direction="forward"/></barline>';
const voltaZac = cisla => `<barline location="left"><ending number="${cisla}" type="start"/></barline>`;
const voltaKon = (cisla, times) => `<barline location="right"><ending number="${cisla}" type="${times ? 'stop' : 'discontinue'}"/>`
  + (times ? `<repeat direction="backward" times="${times}"/>` : '') + '</barline>';
const smer = w => `<direction><direction-type><words>${w}</words></direction-type></direction>`;

test('MusicXML: volta covers every bar up to stop or discontinue and survives export', () => {
  const p = zMusicXml(xmlTakty(deleni + repZac + notaXml('C'), notaXml('D'),
    voltaZac('1') + notaXml('E'), notaXml('F') + voltaKon('1', 2),
    voltaZac('2') + notaXml('G'), notaXml('A') + voltaKon('2'), notaXml('B')));
  const poradi = [0, 1, 2, 3, 0, 1, 4, 5, 6];
  assert.deepEqual(rozvin(p).poradi, poradi);
  const xml = naMusicXml(p);
  assert.equal((xml.match(/<ending [^>]*type="start"/g) || []).length, 2);
  assert.deepEqual(rozvin(zMusicXml(xml)).poradi, poradi);
});

for (const skok of ['D.C.', 'D.S.']) {
  test(`${skok} al Fine plays the last ending without repeating the section`, () => {
    const p = zMusicXml(xmlTakty(deleni + repZac + notaXml('C')
      + '<direction><direction-type><segno/></direction-type></direction>',
    voltaZac('1') + notaXml('D') + voltaKon('1', 2),
    voltaZac('2') + notaXml('E') + smer('Fine') + voltaKon('2'), notaXml('F'), notaXml('G') + smer(skok + ' al Fine')));
    assert.deepEqual(rozvin(p).poradi, [0, 1, 0, 2, 3, 4, 0, 2]);
  });
}

test('MusicXML: repeat times=3 plays the combined first and second ending twice', () => {
  const p = zMusicXml(xmlTakty(deleni + repZac + notaXml('C'),
    voltaZac('1,2') + notaXml('D') + voltaKon('1,2', 3), voltaZac('3') + notaXml('E') + voltaKon('3')));
  const poradi = [0, 1, 0, 1, 0, 2];
  assert.deepEqual(rozvin(p).poradi, poradi);
  assert.deepEqual(rozvin(zMusicXml(naMusicXml(p))).poradi, poradi);
});

test('To Coda with a coda glyph jumps to the actual Coda bar', () => {
  const coda = '<direction-type><coda/></direction-type>';
  const p = zMusicXml(xmlTakty(deleni + notaXml('C'),
    notaXml('D') + '<direction>' + coda + '<direction-type><words>To Coda</words></direction-type></direction>',
    notaXml('E') + smer('D.C. al Coda'), '<direction>' + coda + '</direction>' + notaXml('F')));
  assert.deepEqual(rozvin(p).poradi, [0, 1, 2, 0, 1, 3]);
});

test('Czech chord roots and slash basses retain their accidentals', () => {
  assert.deepEqual(['Es', 'As', 'Asm', 'Esmi', 'Ases', 'Eses', 'Bes'].map(s => tonyAkordu(s).koren), [3, 8, 8, 3, 7, 2, 9]);
  assert.equal(akordZnacky('Esmi').druh, 'minor');
  assert.equal(akordZnacky('Asm').druh, 'minor');
  assert.deepEqual(['C/Fis', 'C/Es', 'C/Ges', 'C/Ases'].map(s => tonyAkordu(s).bas), [6, 3, 6, 7]);
  assert.deepEqual(['B', 'Bb', 'H'].map(s => tonyAkordu(s).koren), [11, 10, 11]);
  const p = zaklad([{ noty: [n('C4', '3/4')], akordy: [{ doba: 0, znacka: 'Ases/Eses' }] }]);
  assert.deepEqual(tonyAkordu(zMusicXml(naMusicXml(p)).takty[0].akordy[0].znacka), tonyAkordu('Ases/Eses'));
});

test('chord suffixes distinguish uppercase major from minor and power chords omit the third', () => {
  assert.deepEqual(['CM7', 'CM', 'Cm7', 'C5'].map(s => akordZnacky(s).druh), ['major-seventh', 'major', 'minor-seventh', 'power']);
  assert.deepEqual(tonyAkordu('C5').tony, [0, 7]);
});

test('MusicXML uses the kind element value when its custom display text disagrees', () => {
  const akord = (druh, text) => `<harmony><root><root-step>C</root-step></root><kind text="${text}">${druh}</kind></harmony>`;
  const p = zMusicXml(xmlTakty(deleni + akord('minor', '-') + notaXml('C') + akord('power', 'maj') + notaXml('D')));
  assert.deepEqual(p.takty[0].akordy.map(a => akordZnacky(a.znacka).druh), ['minor', 'power']);
});

test('MusicXML keeps gaps from forward and the duration of omitted cue notes per voice', () => {
  const p = zMusicXml(xmlTakty(deleni + notaXml('C')
    + '<forward><duration>2</duration><voice>1</voice><staff>1</staff></forward>'
    + '<note><cue/><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note>'
    + '<harmony><root><root-step>G</root-step></root><kind>major</kind></harmony>'
    + notaXml('E') + '<forward><duration>4</duration><voice>1</voice><staff>1</staff></forward>'
    + '<backup><duration>16</duration></backup>'
    + notaXml('G', 16, '<voice>2</voice><staff>2</staff>')));
  assert.deepEqual(p.takty[0].akordy, [{ doba: 2, znacka: 'G' }]);
  assert.deepEqual(p.takty[0].noty.map(n => [n.t, n.d]), [['C4', '1/4'], ['r', '1/4'], ['E4', '1/4'], ['r', '1/4']]);
  assert.deepEqual(p.takty[0].leva.map(n => [n.t, n.d]), [['G4', '1/1']]);
});

test('a quintuplet of sixteenths retains its sounding lengths through import and export', () => {
  const skupina = 'CDEFG'.split('').map(t => notaXml(t, 4,
    '<type>16th</type><time-modification><actual-notes>5</actual-notes><normal-notes>4</normal-notes></time-modification>')).join('');
  const p = zMusicXml(xmlTakty('<attributes><divisions>20</divisions></attributes>' + skupina));
  const delky = Array(5).fill('1/20');
  assert.deepEqual(p.takty[0].noty.map(n => n.d), delky);
  const xml = naMusicXml(p);
  assert.match(xml, /<actual-notes>5<\/actual-notes><normal-notes>4<\/normal-notes>/);
  assert.deepEqual(zMusicXml(xml).takty[0].noty.map(n => n.d), delky);
});

test('mixed quarter and eighth triplets close the bracket after a complete group', () => {
  const xml = naMusicXml(zaklad([{ noty: [n('C4', '1/6'), n('D4', '1/12'),
    n('E4', '1/12'), n('F4', '1/12'), n('G4', '1/12')] }]));
  assert.deepEqual(xml.match(/<note>[\s\S]*?<\/note>/g).map(n => [...n.matchAll(/<tuplet type="(\w+)"/g)].map(m => m[1])),
    [['start'], ['stop'], ['start'], [], ['stop']]);
});

test('first key, meter and clef can follow a divisions-only attributes block', () => {
  const p = zMusicXml(xmlTakty(deleni + '<attributes><key><fifths>-2</fifths></key>'
    + '<time><beats>3</beats><beat-type>8</beat-type></time><clef><sign>F</sign><line>4</line></clef></attributes>'
    + notaXml('C'), '<attributes><key><fifths>3</fifths></key></attributes>' + notaXml('D')));
  assert.deepEqual([p.predznamenani, p.takt, p.klic], [-2, '3/8', 'basovy']);
});
