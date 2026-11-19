// The editor area in English: edit errors (lib/editor.js), bar status and MIDI import (lib/midi_file.js).
import './setup.mjs';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { nastavJazyk } from '../static/lib/texts.js';
import { nastavSoustavu } from '../static/lib/note_names.js';
import { nastavVysku, nastavAkord, nastavHlavicku, smazTakt, vlozZa, stavTaktu } from '../static/lib/editor.js';
import { ctiMidi, prehledStop, midiNaPisen } from '../static/lib/midi_file.js';

afterEach(() => { nastavJazyk('cs'); nastavSoustavu('cs'); });

const n = (t, d) => ({ t, d, lig: false, s: '' });
const pisen = () => ({ nazev: 'Test', autor: '', klic: 'houslovy', predznamenani: 0, takt: '3/4', tempo: 90,
  takty: [{ akordy: [], noty: [n('C4', '1/4'), n('E4', '1/4'), n('G4', '1/4')], leva: [n('C3', '3/4')] },
    { akordy: [], noty: [n('D4', '3/4')], leva: [n('G2', '1/2'), n('B2', '1/2')] },       // left hand 4/4 instead of 3/4
    { akordy: [], noty: [n('C5', '3/4')] }] });
const V = (takt, index, ruka = 'p') => ({ takt, index, ruka });

test('edit errors in English, with substituted values; Czech unchanged', () => {
  nastavJazyk('en');
  assert.equal(nastavVysku(pisen(), V(0, 0), 109).chyba, 'The note is out of the piano range.');
  assert.equal(nastavAkord(pisen(), 0, 0, 'X#q').chyba, 'Unknown chord symbol “X#q”.');
  assert.equal(nastavHlavicku(pisen(), { takt: '3/5' }).chyba, 'Invalid time signature “3/5”.');
  assert.equal(vlozZa(pisen(), V(0, 2), { t: 'C4', d: '1/4' }).chyba,
    'No room in the bar – shorten or delete the following notes first.');
  const jeden = { ...pisen(), takty: [pisen().takty[2]] };
  assert.equal(smazTakt(jeden, 0).chyba, 'The last bar cannot be deleted.');
  nastavJazyk('cs');
  assert.equal(nastavAkord(pisen(), 0, 0, 'X#q').chyba, 'Neznámá akordová značka „X#q“.');
  assert.equal(smazTakt(jeden, 0).chyba, 'Poslední takt smazat nejde.');
});

test('bar status: a long left hand is reported in English as "left hand: …"', () => {
  nastavJazyk('en');
  const s = stavTaktu(pisen());
  assert.deepEqual(s.map(x => x.ok), [true, false, true]);
  assert.match(s[1].zprava, /^left hand: /);
});

// ---------------------------------------------------------------- a small SMF writer
const vlq = v => { const o = [v & 0x7f]; while ((v >>= 7)) o.unshift((v & 0x7f) | 0x80); return o; };
const txt = s => [...new TextEncoder().encode(s)];
const u32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const meta = (typ, data) => [0xff, typ, ...vlq(data.length), ...data];
function stopa(udalosti) {
  const u = [...udalosti].sort((a, b) => a[0] - b[0]), out = [];
  let t = 0;
  for (const [tick, data] of u) { out.push(...vlq(tick - t), ...data); t = tick; }
  out.push(0, 0xff, 0x2f, 0);
  return [...txt('MTrk'), ...u32(out.length), ...out];
}
const soubor = stopy => new Uint8Array([...txt('MThd'), 0, 0, 0, 6, 0, 1, 0, stopy.length, 480 >> 8, 480 & 255, ...stopy.flat()]);
const noty = (seznam, ch = 0) => seznam.flatMap(([m, z, d]) => [[z * 480, [0x90 | ch, m, 90]], [Math.round((z + d * 0.95) * 480), [0x80 | ch, m, 0]]]);
const takt44 = [0, meta(0x58, [4, 2, 24, 8])];

test('MIDI in English: track descriptions, range in English note names, notes, title and error', () => {
  nastavJazyk('en'); nastavSoustavu('en');
  const m = ctiMidi(soubor([
    stopa([takt44]),
    stopa([[0, meta(0x03, txt('Strings'))], [0, [0xc1, 40]], ...noty([[66, 0, 1], [71, 1, 1], [70, 2, 2]], 1)]),
    stopa(noty([[60, 0, 4]], 2)),
  ]));
  const pr = prehledStop(m);
  assert.equal(pr.find(s => s.id === 0).popis, '1. Strings (strings)');
  assert.equal(pr.find(s => s.id === 0).rozsah, 'F#4–B4');
  assert.equal(pr.find(s => s.id === 1).popis, '2. Piano, channel 3');
  const { pisen: p, poznamky } = midiNaPisen({ ...m, nazev: '' }, { melodie: 0 });
  assert.equal(p.nazev, 'Song from MIDI');
  assert.deepEqual(poznamky, ['The file has no key signature; I guessed it from the notes.']);
  assert.throws(() => ctiMidi(txt('<score-partwise/>')), /^Error: this is not a MIDI file$/);
  nastavJazyk('cs'); nastavSoustavu('cs');
  assert.equal(prehledStop(m).find(s => s.id === 0).rozsah, 'Fis4–H4');
  assert.equal(prehledStop(m).find(s => s.id === 1).popis, '2. Klavír, kanál 3');
});

test('editor: bar length error in English without Czech', async () => {
  const { nastavJazyk } = await import('../static/lib/texts.js');
  const { stavTaktu } = await import('../static/lib/editor.js');
  const pisen = { takt: '4/4', takty: [{ noty: [{ t: 'C4', d: '1/1' }] }, { noty: [{ t: 'C4', d: '1/4' }], leva: [{ t: 'C3', d: '1/2' }] }, { noty: [{ t: 'C4', d: '1/1' }] }] };
  nastavJazyk('en');
  const z = stavTaktu(pisen)[1].zprava;
  nastavJazyk('cs');
  assert.ok(z && !/[ěščřžýáíéůú]|součet/.test(z), z);
  assert.match(stavTaktu(pisen)[1].zprava, /součet délek/);
});
