import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ctiMidi, prehledStop, navrhniStopy, midiNaPisen } from '../static/lib/midi_file.js';
import { kontrola, naMusicXml, zMusicXml } from '../static/lib/song.js';

// ---------------------------------------------------------------- a small SMF writer for tests
const vlq = v => { const o = [v & 0x7f]; while ((v >>= 7)) o.unshift((v & 0x7f) | 0x80); return o; };
const txt = s => [...new TextEncoder().encode(s)];
const meta = (typ, data) => [0xff, typ, ...vlq(data.length), ...data];
/** udalosti: [tick, bytes] (absolute time) → MTrk chunk */
function stopa(udalosti) {
  const u = [...udalosti].sort((a, b) => a[0] - b[0]);
  const out = [];
  let t = 0;
  for (const [tick, data] of u) { out.push(...vlq(tick - t), ...data); t = tick; }
  out.push(0, 0xff, 0x2f, 0);
  return [...txt('MTrk'), ...u32(out.length), ...out];
}
const u32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
function soubor(stopy, { format = 1, ppq = 480 } = {}) {
  return new Uint8Array([...txt('MThd'), 0, 0, 0, 6, 0, format, 0, stopy.length, ppq >> 8, ppq & 255, ...stopy.flat()]);
}
/** noty [midi, start in quarters, length in quarters] → events (channel ch) */
function noty(seznam, { ch = 0, ppq = 480, legato = 0.95 } = {}) {
  return seznam.flatMap(([m, z, d]) => [[Math.round(z * ppq), [0x90 | ch, m, 90]], [Math.round((z + d * legato) * ppq), [0x80 | ch, m, 0]]]);
}
const hlavicka = ({ takt = [4, 2], tempo = 500000, sf = null, nazev = 'Píseň' } = {}) => [
  [0, meta(0x03, txt(nazev))], [0, meta(0x58, [takt[0], takt[1], 24, 8])],
  [0, meta(0x51, [(tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255])],
  ...(sf == null ? [] : [[0, meta(0x59, [sf & 255, 0])]]),
];
const tony = takt => takt.noty.map(n => `${n.t}/${n.d}${n.lig ? '~' : ''}`).join(' ');

test('reads the header, tempo, time signature, key signature and notes (including running status and note-on with zero)', () => {
  const ev = [...hlavicka({ sf: -1, tempo: 600000 }), [0, [0x90, 60, 80]], [480, [60, 0]], [480, [62, 70]], [960, [62, 0]]];
  const m = ctiMidi(soubor([stopa(ev)], { format: 0 }));
  assert.equal(m.ppq, 480);
  assert.equal(m.tempo, 100);
  assert.equal(m.takt, '4/4');
  assert.equal(m.predznamenani, -1);
  assert.equal(m.nazev, 'Píseň');
  assert.deepEqual(m.stopy[0].noty.map(n => [n.midi, n.zac, n.kon]), [[60, 0, 480], [62, 480, 960]]);
});

test('a simple melody → bars, durations and a tie across the barline', () => {
  const m = ctiMidi(soubor([stopa(hlavicka()), stopa(noty([[60, 0, 1], [62, 1, 1], [64, 2, 1], [65, 3, 2], [67, 5, 3]]))]));
  const { pisen } = midiNaPisen(m, { melodie: 0 });
  assert.equal(pisen.takty.length, 2);
  assert.equal(tony(pisen.takty[0]), 'C4/1/4 D4/1/4 E4/1/4 F4/1/4~');
  assert.equal(tony(pisen.takty[1]), 'F4/1/4 G4/3/4');
  assert.deepEqual(kontrola(pisen), []);
  assert.equal(pisen.predznamenani, 0);
});

test('pickup: a first note on the last beat becomes a short first bar', () => {
  const m = ctiMidi(soubor([stopa(hlavicka({ takt: [3, 2] })), stopa(noty([[67, 2, 1], [72, 3, 2], [71, 5, 1], [72, 6, 3]]))]));
  const { pisen } = midiNaPisen(m, { melodie: 0 });
  assert.equal(tony(pisen.takty[0]), 'G4/1/4');
  assert.equal(tony(pisen.takty[1]), 'C5/1/2 B4/1/4');
  assert.equal(tony(pisen.takty[2]), 'C5/3/4');
  assert.deepEqual(kontrola(pisen), []);
});

test('a loosely played recording is snapped to the grid', () => {
  const m = ctiMidi(soubor([stopa(hlavicka()), stopa(noty([[60, 0.02, 0.9], [62, 0.98, 0.9], [64, 2.03, 0.45], [65, 2.5, 0.5], [67, 3.01, 0.9]]))]));
  const { pisen, mrizka } = midiNaPisen(m, { melodie: 0 });
  assert.equal(mrizka, 0.5);
  assert.equal(tony(pisen.takty[0]), 'C4/1/4 D4/1/4 E4/1/8 F4/1/8 G4/1/4');
});

test('a short gap after a long note is merged, a rest after an eighth stays', () => {
  const m = ctiMidi(soubor([stopa(hlavicka()), stopa(noty([[60, 0, 0.75], [62, 1, 0.5], [64, 1.75, 0.25], [65, 2, 2]], { legato: 1 }))]));
  const { pisen } = midiNaPisen(m, { melodie: 0 });
  assert.equal(tony(pisen.takty[0]), 'C4/1/4 D4/1/8 r/1/16 E4/1/16 F4/1/2');
});

test('triplets: picks the triplet grid', () => {
  const m = ctiMidi(soubor([stopa(hlavicka()), stopa(noty([[60, 0, 1 / 3], [62, 1 / 3, 1 / 3], [64, 2 / 3, 1 / 3], [65, 1, 1], [67, 2, 2]], { legato: 1 }))]));
  const { pisen, mrizka } = midiNaPisen(m, { melodie: 0 });
  assert.equal(mrizka, 1 / 3);
  assert.equal(tony(pisen.takty[0]), 'C4/1/12 D4/1/12 E4/1/12 F4/1/4 G4/1/2');
  assert.deepEqual(kontrola(pisen), []);
});

test('missing key signature: estimated from the notes (D major → 2 sharps, F#)', () => {
  const m = ctiMidi(soubor([stopa(hlavicka()), stopa(noty([[62, 0, 1], [66, 1, 1], [69, 2, 1], [73, 3, 1], [74, 4, 4]]))]));
  const { pisen, poznamky } = midiNaPisen(m, { melodie: 0 });
  assert.equal(pisen.predznamenani, 2);
  assert.equal(tony(pisen.takty[0]), 'D4/1/4 F#4/1/4 A4/1/4 C#5/1/4');
  assert.ok(poznamky.some(p => p.includes('odhadl')));
});

test('a single piano track with chords: the melody is the top voice, the left hand everything below C4', () => {
  const ev = noty([[72, 0, 2], [64, 0, 2], [48, 0, 4], [55, 0, 4], [71, 2, 2], [62, 2, 2], [72, 4, 4], [48, 4, 4], [52, 4, 4]]);
  const m = ctiMidi(soubor([stopa(hlavicka()), stopa(ev)]));
  const navrh = navrhniStopy(m);
  assert.deepEqual(navrh, { melodie: 0, leva: 0 });
  const { pisen } = midiNaPisen(m, navrh);
  assert.equal(tony(pisen.takty[0]), 'C5/1/2 B4/1/2');
  assert.deepEqual(pisen.takty[0].leva.map(n => n.t), ['C3 G3']);
  assert.deepEqual(pisen.takty[1].leva.map(n => n.t), ['C3 E3']);
  assert.deepEqual(kontrola(pisen), []);
  const zpet = zMusicXml(naMusicXml(pisen));
  assert.equal(zpet.takty.length, 2);
  assert.equal(zpet.takty[0].leva[0].t, 'C3 G3');
});

test('track suggestion: melody by name, drums are ignored, the second piano track is the left hand', () => {
  const m = ctiMidi(soubor([
    stopa(hlavicka()),
    stopa([[0, meta(0x03, txt('Drums'))], ...noty([[36, 0, 1], [38, 1, 1], [36, 2, 1], [38, 3, 1], [36, 4, 1], [38, 5, 1], [36, 6, 1], [38, 7, 1], [42, 0, 1]], { ch: 9 })]),
    stopa([[0, meta(0x03, txt('Strings'))], [0, [0xc1, 40]], ...noty([[79, 0, 4], [81, 4, 4], [84, 8, 4], [79, 12, 4], [77, 16, 4], [76, 20, 4], [74, 24, 4], [72, 28, 4]], { ch: 1 })]),
    stopa([[0, meta(0x03, txt('Melody'))], ...noty(Array.from({ length: 16 }, (_, k) => [60 + (k % 5), k, 1]), { ch: 2 })]),
    stopa([[0, meta(0x03, txt('Left hand'))], ...noty(Array.from({ length: 8 }, (_, k) => [48, k * 2, 2]), { ch: 3 })]),
  ]));
  const pr = prehledStop(m);
  assert.equal(pr.length, 4);
  assert.ok(pr.find(s => s.bici));
  const navrh = navrhniStopy(m);
  assert.equal(m.stopy[navrh.melodie].nazev, 'Melody');
  assert.equal(m.stopy[navrh.leva].nazev, 'Left hand');
  assert.equal(pr.find(s => s.id === 1).popis, '2. Strings (smyčce)');
});

test('syllables from a karaoke file are assigned to notes, split words get a hyphen', () => {
  const sl = [[0, 'Hvěz'], [480, 'dič'], [960, 'ky '], [1440, 'svítí']].map(([t, s]) => [t, meta(0x05, txt(s))]);
  const m = ctiMidi(soubor([stopa(hlavicka()), stopa([...sl, ...noty([[60, 0, 1], [62, 1, 1], [64, 2, 1], [65, 3, 1]])])]));
  const { pisen } = midiNaPisen(m, { melodie: 0 });
  assert.deepEqual(pisen.takty[0].noty.map(n => n.s), ['Hvěz-', 'dič-', 'ky', 'svítí']);
});

test('empty bars at the start are skipped and the last bar is filled with a rest', () => {
  const m = ctiMidi(soubor([stopa(hlavicka()), stopa(noty([[60, 8, 1], [62, 9, 1]]))]));
  const { pisen } = midiNaPisen(m, { melodie: 0 });
  assert.equal(pisen.takty.length, 1);
  assert.equal(tony(pisen.takty[0]), 'C4/1/4 D4/1/4 r/1/2');
});

test('not MIDI → a clear error', () => {
  assert.throws(() => ctiMidi(new TextEncoder().encode('<score-partwise/>')), /není soubor MIDI/);
  const m = ctiMidi(soubor([stopa(hlavicka())]));
  assert.throws(() => navrhniStopy(m), /nejsou žádné noty/);
});
