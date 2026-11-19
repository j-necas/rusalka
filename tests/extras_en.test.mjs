// Educational extras in English: templates compose English sentences (and note names in the English system).
import './setup.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { nastavJazyk } from '../static/lib/texts.js';
import { nastavSoustavu } from '../static/lib/note_names.js';
import {
  faktaPisne, sablonaPruvodce, faktaNoty, OTAZKY, otazkyProNotu, odpovedSablonou, faktaPrednesu, sablonaPrednesu,
  STYLY, temata, TEMATA, sablonaNovePisne, faktaTydne, sablonaTydne, motiv, porovnejOzvenu,
} from '../static/lib/extras.js';

const CESKE = /[ěščřžýáíéůúňťďóĚŠČŘŽÝÁÍÉŮÚŇŤĎÓ]/;
const bezCestiny = (texty, co) => {
  for (const x of [texty].flat(Infinity)) assert.ok(!CESKE.test(x), `${co}: Czech diacritics in "${x}"`);
};
const anglicky = () => { nastavJazyk('en'); nastavSoustavu('en'); };
after(() => { nastavJazyk('cs'); nastavSoustavu('cs'); });

const n = (t, d, s = '') => ({ t, d, lig: false, s });
const q = (t, s = '') => n(t, '1/4', s);
const ak = (...a) => a.map(([doba, znacka]) => ({ doba, znacka }));
/** D major 4/4: bars 5–6 repeat 1–2, an octave leap in bar 3, an accidental G# and a natural in bar 8 */
const pisnicka = () => ({
  nazev: 'Testovací', autor: '', klic: 'houslovy', predznamenani: 2, takt: '4/4', tempo: 96, takty: [
    { akordy: ak([0, 'D']), noty: [q('D4', 'Ve-'), q('F#4', 'čer'), q('A4', 'pa-'), q('F#4', 'dá')] },
    { akordy: ak([0, 'G']), noty: [q('G4', 'na'), q('B4', 'tmavý'), n('A4', '1/2', 'les,')] },
    { akordy: ak([0, 'A7']), noty: [q('A4'), q('A5'), q('G5'), q('E5')] },
    { akordy: ak([0, 'D']), noty: [n('D5', '1/2'), n('r', '1/2')] },
    { akordy: ak([0, 'D']), noty: [q('D4'), q('F#4'), q('A4'), q('F#4')] },
    { akordy: ak([0, 'G']), noty: [q('G4'), q('B4'), n('A4', '1/2')] },
    { akordy: ak([0, 'Bm']), noty: [n('B4', '3/8'), n('C#5', '1/8'), q('D5'), q('B4')] },
    { akordy: ak([0, 'E7'], [2, 'A7']), noty: [n('G#4', '1/16'), n('A4', '1/16'), n('B4', '1/16'), n('G#4', '1/16'), q('A4'),
      n('E4', '1/8'), n('F#4', '1/8'), n('G4', '1/8'), n('A4', '1/8')] },
    { akordy: ak([0, 'D']), noty: [n('D4', '1/1')] },
  ],
});

test('song guide in English: key, time signature, range, leap and tips', () => {
  anglicky();
  const dosp = sablonaPruvodce(faktaPisne(pisnicka(), { pasmo: 'dospely' }));
  assert.match(dosp.odstavce[0], /^Key of D major \(2 sharps: F#, C#\), 4\/4 time – four quarter-note beats in a bar/);
  assert.match(dosp.odstavce[0], /The song is 9 bars long\.$/);
  assert.match(dosp.odstavce[1], /from D4 to A5 \(perfect twelfth\).*bar 3: from A4 to A5 \(perfect octave up\)/);
  assert.ok(dosp.tipy.some(t => /^Bar 8: .*G# outside the key signature/.test(t)), dosp.tipy.join(' / '));
  assert.ok(dosp.tipy.some(t => /a leap of an octave/.test(t)), dosp.tipy.join(' / '));
  const dite = sablonaPruvodce(faktaPisne(pisnicka(), { pasmo: 'dite' }));
  assert.equal(dite.odstavce[0], 'The song is in D major. It has two sharps: F#, C#. Count to four. Play it at a walking pace.');
  bezCestiny([dosp.odstavce, dosp.tipy, dite.odstavce, dite.tipy], 'guide');
});

test('questions and answers about a note in English (with the a/an article)', () => {
  anglicky();
  const p = pisnicka();
  const F = faktaNoty(p, 0, 1, 'prava', { pasmo: 'dite' });
  assert.deepEqual(OTAZKY.map(o => o.text).slice(0, 2), ['What note is this?', 'Why is there a sharp or flat here?']);
  assert.ok(otazkyProNotu(F).some(o => o.text === 'Why is there a sharp here?'));
  assert.equal(odpovedSablonou(F, 'co'), 'That’s the note F#4 – a black key.');
  assert.equal(odpovedSablonou(F, 'akord'), 'The chord here is D: D, F#, A – your note is part of it, it’s the third.');
  assert.equal(odpovedSablonou(faktaNoty(p, 2, 1), 'skok'), 'From A4 you go up – that’s an octave.');
  assert.equal(odpovedSablonou(faktaNoty(p, 6, 0), 'delka'), 'It’s a dotted quarter note; hold it for one and a half beats.');
  assert.equal(odpovedSablonou(faktaNoty(p, 3, 1), 'co'), 'That’s a half rest – a moment of silence.');
  assert.match(odpovedSablonou(faktaNoty(p, 7, 7), 'posuvka'), /^The natural sign cancels the key signature/);
  for (const pasmo of ['dite', 'dospely']) {
    p.takty.forEach((t, ti) => t.noty.forEach((_, i) => {
      const f = faktaNoty(p, ti, i, 'prava', { pasmo });
      bezCestiny([otazkyProNotu(f).map(o => o.text), ...[...OTAZKY.map(o => o.id), 'vse'].map(o => odpovedSablonou(f, o))], `note ${ti}/${i}`);
    }));
  }
});

test('weekly summary in English: plurals and a single bar (bar/bars)', () => {
  anglicky();
  const den = (d, h = 17) => new Date(2026, 10, d, h, 0).getTime();
  const st = (historie, takty = {}) => ({ verze: 1, pokusu: historie.length, takty, vzorce: {}, historie });
  const pokus = (kdy, presnost, rychlost, cisty = false) => ({ kdy, rychlost, od: 0, do: 8, presnost, cisty });
  const F = faktaTydne([
    { klic: 'a', nazev: 'Twinkle', statistika: st([pokus(den(2), 0.6, 70), pokus(den(9), 0.7, 70), pokus(den(11), 0.85, 80), pokus(den(13), 0.9, 80, true)],
      { 3: { noty: 10, chyby: 5 } }) },
  ], [{ kdy: den(9), minut: 1 }], den(9, 0), den(16, 0), { pasmo: 'dite' });
  const s = sablonaTydne(F);
  assert.equal(s.shrnuti, '3 days of practice, 3 tries, 1 minute, 1 without a mistake.');
  assert.equal(s.pisne[0], 'Twinkle: accuracy 60% → 82%, speed 70% → 80%, tricky spot: bar 4.');
  assert.equal(s.priste, 'Next time, play bar 4 of Twinkle slowly.');
  const prazdno = sablonaTydne(faktaTydne([], [], den(9, 0), den(16, 0), { pasmo: 'dospely' }));
  assert.equal(prazdno.shrnuti, 'No practice in this period.');
  bezCestiny([s.shrnuti, s.pisne.filter(x => !x.startsWith('Twinkle')), s.priste, prazdno.priste], 'week');
});

test('Echo, expression, styles and a new song in English', () => {
  anglicky();
  const p = pisnicka();
  const m = motiv(p, { delka: 4, uroven: 2 });
  const hraj = (vysky, casy) => vysky.map((midi, i) => ({ midi, ms: casy[i] }));
  const midi = m.noty.map(x => x.midi), ms = m.noty.map(x => x.ms);
  assert.equal(porovnejOzvenu(m, []).popis, 'No notes were played.');
  assert.equal(porovnejOzvenu(m, hraj(midi.slice(1), ms)).popis, 'The tune has 4 notes; you played 3.');
  assert.match(porovnejOzvenu(m, hraj(midi.map((x, i) => x + (i === 1)), ms)).popis, /^The second note should have been F#4, but you played G4\.$/);
  assert.equal(porovnejOzvenu(m, hraj(midi, ms)).popis, 'The notes and the rhythm are both right.');
  const prednes = sablonaPrednesu(faktaPrednesu({ od: 0, do: 8, noty: [] }, p, { pasmo: 'dospely' }));
  assert.match(prednes.veta, /^The keyboard sends neither key velocity nor note length/);
  bezCestiny([STYLY.map(s => [s.nazev, s.popis]), temata(), prednes.veta], 'styles and themes');
  assert.ok(temata().includes('winter'));
  assert.equal(sablonaNovePisne({ tema: 'winter', pasmo: 'dite' }, 1).nazev, 'My song – winter');
  assert.equal(sablonaNovePisne({ tema: 'zima', pasmo: 'dite' }, 1).nazev, 'My song – zima', 'a child\'s Czech theme also works in English');
  assert.equal(sablonaNovePisne({ pasmo: 'dospely' }, 1).nazev, 'My song');
  assert.ok(TEMATA.includes('zima'), 'TEMATA stay in Czech');
  nastavJazyk('cs'); nastavSoustavu('cs');
  assert.equal(porovnejOzvenu(m, []).popis, 'Nezazněl žádný tón.', 'back in Czech');
  assert.equal(STYLY.find(s => s.id === 'valcik').nazev, 'Valčík');
});
