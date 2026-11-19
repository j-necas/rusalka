import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zMusicXml, rozvin } from '../static/lib/song.js';
import { pripravOriginal, doplnTempo, doplnPosuvky } from '../static/lib/original.js';
import { zpracujVerovio } from '../static/lib/render.js';

const XML = readFileSync(new URL('./data/piano_complex.musicxml', import.meta.url), 'utf8');
const doc = s => new DOMParser().parseFromString(s, 'application/xml');
const takty = s => [...doc(s).getElementsByTagName('part')[0].childNodes].filter(n => n.nodeName === 'measure');
let TK;
async function verovio() {
  if (TK) return TK;
  const { default: createVerovioModule } = await import('verovio/wasm');
  const { VerovioToolkit } = await import('verovio/esm');
  TK = new VerovioToolkit(await createVerovioModule());
  return TK;
}

test('model and unfolding: 5 bars → 1, 2, 3, 2, 4, 5', () => {
  const r = rozvin(zMusicXml(XML));
  assert.deepEqual(r.poradi, [0, 1, 2, 1, 3, 4]);
});

test('pripravOriginal: only the first part, bars in unfolded order, no repeats, with slur, dynamics and grace note', () => {
  const { poradi } = rozvin(zMusicXml(XML));
  const out = pripravOriginal(XML, poradi);
  const d = doc(out);
  assert.equal(d.getElementsByTagName('part').length, 1);
  assert.equal(d.getElementsByTagName('score-part').length, 1);
  assert.equal(d.getElementsByTagName('credit').length, 0);
  const m = takty(out);
  assert.equal(m.length, 6);
  assert.deepEqual(m.map(x => x.getAttribute('number')), ['1', '2', '3', '4', '5', '6']);
  assert.equal(d.getElementsByTagName('repeat').length, 0);
  assert.equal(d.getElementsByTagName('ending').length, 0);
  assert.ok(d.getElementsByTagName('slur').length >= 2, 'slurs remain');
  assert.ok(d.getElementsByTagName('dynamics').length >= 2, 'dynamics remain');
  assert.ok(d.getElementsByTagName('pedal').length >= 1, 'pedal remains');
  assert.equal(d.getElementsByTagName('grace').length, 2, 'grace note in both passes of bar 2');
  assert.equal(d.getElementsByTagName('part-name')[0].getAttribute('print-object'), 'no');
});

test('pripravOriginal: after a jump back restores the key, time signature and clef valid there', () => {
  // bars 1, 5 (3/4, treble clef in the left hand, G major from bar 4), then back to 2 → must restore C major, 4/4 and bass clef
  const out = pripravOriginal(XML, [0, 4, 1]);
  const m = takty(out);
  const attr = [...m[2].childNodes].find(n => n.nodeName === 'attributes');
  assert.ok(attr, 'attributes at the start of the bar jumped back to');
  const t = s => attr.getElementsByTagName(s)[0]?.textContent;
  assert.equal(t('fifths'), '0');
  assert.equal(t('beats'), '4');
  assert.equal(t('divisions'), '2');
  const klice = [...attr.getElementsByTagName('clef')].map(c => `${c.getAttribute('number')}:${c.getElementsByTagName('sign')[0].textContent}`);
  assert.deepEqual(klice, ['1:G', '2:F']);
  // bar 5 came right after bar 1 in the order, so it got G major from bar 4 (which was skipped)
  const a5 = [...m[1].childNodes].filter(n => n.nodeName === 'attributes');
  assert.ok(a5.some(a => a.getElementsByTagName('fifths')[0]?.textContent === '1'));
});

test('the game has notes of both right-hand voices and the left hand, not grace notes; bars match the model', async () => {
  const tk = await verovio();
  const model = rozvin(zMusicXml(XML));
  const data = zpracujVerovio(tk, doplnTempo(pripravOriginal(XML, model.poradi), 90), model.pisen);
  const vTaktu = (t, s) => data.noty.filter(n => n.takt === t && n.staff === s).map(n => n.pitch).sort((a, b) => a - b);
  assert.deepEqual(vTaktu(0, 1), [69, 71, 72, 74, 76], 'bar 1: E5 D5 (voice 1) and C5 B4 A4 (voice 2)');
  assert.deepEqual(vTaktu(0, 2), [48]);
  assert.deepEqual(vTaktu(1, 1), [72], 'bar 2 without grace note');
  assert.deepEqual(vTaktu(3, 1), [72], 'repeated bar 2');
  assert.deepEqual(vTaktu(4, 1), [78], 'bar 4 (2nd ending): F#5 from the G major key signature');
  assert.deepEqual(vTaktu(5, 2), [67], 'bar 5: left hand in treble clef G4');
  assert.equal(data.takty.length, 6);
  assert.deepEqual(data.osnovy, [1, 2]);
  // dynamics from the score: p from the start, f from the last bar, for both hands
  assert.ok(data.noty.filter(n => n.takt <= 4).every(n => n.dyn === 'p'));
  assert.ok(data.noty.filter(n => n.takt === 5).every(n => n.dyn === 'f'));
  assert.ok(data.svg.includes('<svg'));
  // the (simplified) model from the first voice: only E5 and D5 in bar 1
  assert.deepEqual(model.pisen.takty[0].noty.map(n => n.t), ['E5', 'D5']);
});

test('notes carry their diatonic step and the key valid at their bar (for Show mistakes)', async () => {
  const tk = await verovio();
  const xml = readFileSync(new URL('./data/clefs_and_keys.musicxml', import.meta.url), 'utf8');
  const model = rozvin(zMusicXml(xml));
  const data = zpracujVerovio(tk, doplnTempo(pripravOriginal(xml, model.poradi), 90), model.pisen);
  assert.deepEqual(data.noty.map(n => [n.pitch, n.staff, n.stupen, n.predznamenani]),
    [[64, 2, 30, 0], [50, 1, 22, 0], [54, 1, 24, 2]], 'E4 (left hand), D3, F#3 after the change to D major');
  // the piece with repeats: bar 1 in C major, the 2nd ending (5th bar played) after the change to G major
  const m2 = rozvin(zMusicXml(XML));
  const d2 = zpracujVerovio(tk, doplnTempo(pripravOriginal(XML, m2.poradi), 90), m2.pisen);
  assert.deepEqual([...new Set(d2.noty.filter(n => n.takt === 4).map(n => n.predznamenani))], [1]);
  assert.deepEqual([...new Set(d2.noty.filter(n => n.takt === 0).map(n => n.predznamenani))], [0]);
});

test('doplnTempo: adds a tempo only where the file lacks one', () => {
  assert.equal(doplnTempo(XML, 70), XML);
  const bez = XML.replace('<sound tempo="90"/>', '');
  assert.match(doplnTempo(bez, 70), /<measure number="1"><sound tempo="70"\/>/);
});

// files exported by Rusalka used to lack <accidental>; Verovio then did not draw accidentals outside the key signature
test('doplnPosuvky: a file without accidental marks gets them from the key signature and bar', () => {
  const nota = (step, alter, okt, extra = '') => `<note><pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ''}`
    + `<octave>${okt}</octave></pitch><duration>1</duration>${extra}<voice>1</voice><type>quarter</type><staff>1</staff></note>`;
  const xml = '<?xml version="1.0"?><score-partwise version="4.0"><part-list><score-part id="P1"/></part-list><part id="P1">'
    + '<measure number="1"><attributes><divisions>1</divisions><key><fifths>4</fifths></key></attributes>'
    + nota('E', 1, 4) + nota('E', 1, 4) + nota('D', 1, 4) + nota('D', 0, 4, '<tie type="start"/>') + '</measure>'
    + '<measure number="2">' + nota('D', 0, 4, '<tie type="stop"/>') + nota('D', 0, 4) + nota('B', -1, 3) + nota('E', 1, 5) + '</measure>'
    + '</part></score-partwise>';
  const vysledek = doplnPosuvky(xml);
  const znacky = [...doc(vysledek).getElementsByTagName('note')].map(n => n.getElementsByTagName('accidental')[0]?.textContent || '');
  assert.deepEqual(znacky, ['sharp', '', '', 'natural', '', 'natural', 'flat', 'sharp']);
  // the mark sits where MusicXML requires it (after <type>, before <staff>)
  assert.match(vysledek, /<type>quarter<\/type><accidental>sharp<\/accidental><staff>1<\/staff>/);
  // files that have the marks (MuseScore, Audiveris) stay unchanged
  const sMuseScore = xml.replace('<type>quarter</type>', '<type>quarter</type><accidental>sharp</accidental>');
  assert.equal(doplnPosuvky(sMuseScore), sMuseScore);
});

test('bezCeskehoH: in the English system text="H" on chord B disappears, in Czech it stays', async () => {
  const { bezCeskehoH } = await import('../static/lib/original.js');
  const xml = '<harmony><root><root-step text="H">B</root-step></root><bass><bass-step text="H">B</bass-step></bass></harmony>';
  assert.equal(bezCeskehoH(xml, 'en'), '<harmony><root><root-step>B</root-step></root><bass><bass-step>B</bass-step></bass></harmony>');
  assert.equal(bezCeskehoH(xml, 'cs'), xml);
});
