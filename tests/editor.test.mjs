import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { naMusicXml, zMusicXml, kontrola, kopie, soucetTaktu, metrum, vysky } from '../static/lib/song.js';
import {
  prvni, dalsi, predchozi, posunVysku, posunOktavu, nastavVysku, nastavDelku, prepniTecku, prepniTriolu, naPomlku,
  smaz, vlozZa, prepniLigaturu, nastavSlabiku, nastavAkord, vlozTakt, smazTakt, nastavZnacky, nastavHlavicku,
  stavTaktu, novaHistorie, zapis, zpet, znovu, muzeZpet, muzeZnovu, klavesovaZkratka, proved, pravopis, rozloz,
  vybranaNota, MAX_HISTORIE,
} from '../static/lib/editor.js';

const n = (t, d, extra = {}) => ({ t, d, lig: false, s: '', ...extra });
const zaklad = (takty, extra = {}) => ({ nazev: 'Test', autor: 'Lid', klic: 'houslovy', predznamenani: 2, takt: '3/4', tempo: 90, takty, ...extra });
const V = (takt, index, ruka = 'p') => ({ takt, index, ruka });
const tt = (p, takt, ruka = 'p') => (ruka === 'l' ? p.takty[takt].leva : p.takty[takt].noty).map(x => x.t);
const dd = (p, takt, ruka = 'p') => (ruka === 'l' ? p.takty[takt].leva : p.takty[takt].noty).map(x => x.d);

// song in D major 3/4 with both hands, chords, syllables, a tie across the barline and a dyad
const pisen = () => zaklad([
  { akordy: [{ doba: 0, znacka: 'D' }],
    noty: [n('F#4', '1/4', { s: 'Hvěz-' }), n('A4', '1/4', { s: 'dič-' }), n('D5', '1/4', { s: 'ky', lig: true })],
    leva: [n('D3', '1/2'), n('A2', '1/4')] },
  { akordy: [{ doba: 0, znacka: 'A7' }],
    noty: [n('D5', '1/4'), n('C#5', '1/8'), n('B4', '1/8'), n('r', '1/4')],
    leva: [n('A2 E3 G3', '3/4')] },
  { akordy: [],
    noty: [n('A4 D5', '1/2'), n('r', '1/4')],
    leva: [n('D3', '1/2'), n('r', '1/4')] },
]);

/** normalised model content for comparing with a round trip */
const norm = p => ({
  nazev: p.nazev, autor: p.autor, klic: p.klic, predznamenani: p.predznamenani, takt: p.takt, tempo: p.tempo,
  takty: p.takty.map(t => ({
    akordy: (t.akordy || []).map(a => [a.doba, a.znacka]),
    noty: t.noty.map(x => [x.t, x.d, !!x.lig, x.s || '', x.prst ?? null]),
    leva: (t.leva || []).map(x => [x.t, x.d, !!x.lig, x.prst ?? null]),
    znacky: t.znacky || {},
  })),
});
/** the result must survive MusicXML → model without loss and pass the length check */
function rt(p, { kontrolovat = true } = {}) {
  const zpet = zMusicXml(naMusicXml(p));
  assert.deepEqual(norm(zpet), norm(p), 'round trip through MusicXML');
  if (kontrolovat) assert.deepEqual(kontrola(p), [], 'length check');
  return p;
}
function nemeni(vstup, fn) {
  const pred = JSON.stringify(vstup);
  const r = fn(vstup);
  assert.equal(JSON.stringify(vstup), pred, 'input must not be mutated');
  return r;
}

test('the default song is valid and survives a round trip', () => { rt(pisen()); });

test('navigation: first, next, previous across barlines, edges and the left hand', () => {
  const p = pisen();
  assert.deepEqual(prvni(p, 'p').vyber, V(0, 0));
  assert.deepEqual(prvni(p, 'l').vyber, V(0, 0, 'l'));
  assert.equal(prvni(p, 'p').pisen, p);
  assert.deepEqual(dalsi(p, V(0, 2)).vyber, V(1, 0));                   // across the barline
  assert.deepEqual(predchozi(p, V(1, 0)).vyber, V(0, 2));
  assert.deepEqual(predchozi(p, V(0, 0)).vyber, V(0, 0));               // stays at the start
  assert.deepEqual(dalsi(p, V(2, 1)).vyber, V(2, 1));                   // stays at the end
  assert.deepEqual(dalsi(p, V(0, 1, 'l')).vyber, V(1, 0, 'l'));
  assert.deepEqual(dalsi(p, null).vyber, V(0, 0));                      // no selection → first
  // an empty bar is skipped
  const q = kopie(p); q.takty[1].leva = [];
  assert.deepEqual(dalsi(q, V(0, 1, 'l')).vyber, V(2, 0, 'l'));
  assert.deepEqual(predchozi(q, V(2, 0, 'l')).vyber, V(0, 1, 'l'));
  // song without a left hand
  const r = kopie(p); r.takty.forEach(t => delete t.leva);
  assert.equal(prvni(r, 'l').vyber, null);
});

test('spelling from MIDI in D major, Bb major, C major and Gb major', () => {
  assert.equal(pravopis(66, 2), 'F#4');
  assert.equal(pravopis(61, 2), 'C#4');
  assert.equal(pravopis(60, 2), 'C4');                 // outside the scale, natural
  assert.equal(pravopis(65, 2), 'F4');
  assert.equal(pravopis(70, 2), 'A#4');                // sharp in a sharp key
  assert.equal(pravopis(70, 2, -1), 'Bb4');            // chromatically down: flat
  assert.equal(pravopis(70, -2), 'Bb4');
  assert.equal(pravopis(63, -2), 'Eb4');
  assert.equal(pravopis(71, -2), 'B4');
  assert.equal(pravopis(66, -2), 'Gb4');
  assert.equal(pravopis(66, -2, 1), 'F#4');
  assert.equal(pravopis(61, 0), 'C#4');
  assert.equal(pravopis(71, -6), 'Cb5');               // Cb in Gb major with the correct octave
  assert.equal(pravopis(65, 6), 'E#4');                // E# in F# major
});

test('posunVysku: diatonic in the key, chromatic, dyad, rest, left hand', () => {
  const p = pisen();
  let r = nemeni(p, x => posunVysku(x, V(0, 0), 1));                    // F#4 → G4
  assert.equal(tt(r.pisen, 0)[0], 'G4');
  assert.deepEqual(r.vyber, V(0, 0));
  rt(r.pisen);
  r = posunVysku(p, V(0, 0), -1);                                       // F#4 → E4
  assert.equal(tt(r.pisen, 0)[0], 'E4');
  r = posunVysku(p, V(1, 2), 1);                                        // B4 → C#5 (in D major)
  assert.equal(tt(r.pisen, 1)[2], 'C#5');
  r = posunVysku(p, V(0, 0), 1, { chromaticky: true });                 // F#4 → G4
  assert.equal(tt(r.pisen, 0)[0], 'G4');
  r = posunVysku(p, V(0, 1), 1, { chromaticky: true });                 // A4 → A#4
  assert.equal(tt(r.pisen, 0)[1], 'A#4');
  r = posunVysku(p, V(0, 1), -1, { chromaticky: true });                // A4 → Ab4
  assert.equal(tt(r.pisen, 0)[1], 'Ab4');
  rt(r.pisen);
  r = posunVysku(p, V(1, 1), -1, { chromaticky: true });                // C#5 → C5
  assert.equal(tt(r.pisen, 1)[1], 'C5');
  r = posunVysku(p, V(2, 0), 1);                                        // dyad A4 D5 → B4 E5
  assert.equal(tt(r.pisen, 2)[0], 'B4 E5');
  rt(r.pisen);
  r = posunVysku(p, V(1, 0, 'l'), -1);                                  // left hand dyad
  assert.equal(tt(r.pisen, 1, 'l')[0], 'G2 D3 F#3');
  rt(r.pisen);
  r = posunVysku(p, V(1, 3), 1);                                        // rest
  assert.equal(r.pisen, p);
  assert.ok(r.chyba);
  r = posunVysku(p, V(9, 0), 1);                                        // invalid selection
  assert.equal(r.pisen, p);
  assert.ok(r.chyba);
});

test('moving the pitch of a tied note moves the whole chain across the barline', () => {
  const p = pisen();                                                    // D5 (bar 1) ⁀ D5 (bar 2)
  let r = posunVysku(p, V(0, 2), 1);
  assert.equal(tt(r.pisen, 0)[2], 'E5');
  assert.equal(tt(r.pisen, 1)[0], 'E5');
  assert.equal(r.pisen.takty[0].noty[2].lig, true);
  rt(r.pisen);
  r = posunVysku(p, V(1, 0), -1);                                       // also from the end of the chain
  assert.equal(tt(r.pisen, 0)[2], 'C#5');
  assert.equal(tt(r.pisen, 1)[0], 'C#5');
  rt(r.pisen);
});

test('posunOktavu: keeps spelling, dyad, piano range', () => {
  const p = pisen();
  let r = nemeni(p, x => posunOktavu(x, V(0, 0), 1));
  assert.equal(tt(r.pisen, 0)[0], 'F#5');
  r = posunOktavu(p, V(2, 0), -1);
  assert.equal(tt(r.pisen, 2)[0], 'A3 D4');
  rt(r.pisen);
  const q = kopie(p); q.takty[0].noty[0].t = 'C8';
  r = posunOktavu(q, V(0, 0), 1);
  assert.equal(r.pisen, q);
  assert.match(r.chyba, /rozsah/);
});

test('nastavVysku from MIDI: spelling in D major and Bb major, rest → note, dyad', () => {
  const p = pisen();
  let r = nemeni(p, x => nastavVysku(x, V(0, 1), 66));                  // A4 → F#4
  assert.equal(tt(r.pisen, 0)[1], 'F#4');
  assert.equal(r.pisen.takty[0].noty[1].d, '1/4');                      // duration stays
  assert.equal(r.pisen.takty[0].noty[1].s, 'dič-');                     // syllable stays
  r = nastavVysku(p, V(0, 1), 61);
  assert.equal(tt(r.pisen, 0)[1], 'C#4');
  r = nastavVysku(p, V(0, 1), 70);
  assert.equal(tt(r.pisen, 0)[1], 'A#4');
  rt(r.pisen);
  const b = { ...pisen(), predznamenani: -2 };
  b.takty = b.takty.map(t => ({ ...t, noty: t.noty.map(x => ({ ...x, t: x.t.replace(/#/g, '') })), leva: t.leva.map(x => ({ ...x, t: x.t.replace(/#/g, '') })) }));
  r = nastavVysku(b, V(0, 1), 70);
  assert.equal(tt(r.pisen, 0)[1], 'Bb4');
  r = nastavVysku(b, V(0, 1), 63);
  assert.equal(tt(r.pisen, 0)[1], 'Eb4');
  r = nastavVysku(b, V(0, 1), 66);
  assert.equal(tt(r.pisen, 0)[1], 'Gb4');
  rt(r.pisen);
  // rest → note of the same duration
  r = nastavVysku(p, V(1, 3), 69);
  assert.deepEqual([tt(r.pisen, 1)[3], dd(r.pisen, 1)[3]], ['A4', '1/4']);
  rt(r.pisen);
  // dyad: a number changes the top tone, an array sets the whole chord
  r = nastavVysku(p, V(2, 0), 76);
  assert.equal(tt(r.pisen, 2)[0], 'A4 E5');
  r = nastavVysku(p, V(2, 0), [62, 66, 69]);
  assert.equal(tt(r.pisen, 2)[0], 'D4 F#4 A4');
  r = nastavVysku(p, V(2, 0), [69]);
  assert.equal(tt(r.pisen, 2)[0], 'A4');
  rt(r.pisen);
  r = nastavVysku(p, V(1, 0, 'l'), 45);                                 // left hand: A2 E3 G3 → G3 replaced by A2 (the doubling disappears)
  assert.equal(tt(r.pisen, 1, 'l')[0], 'A2 E3');
  r = nastavVysku(p, V(0, 0), 10);
  assert.equal(r.pisen, p);
  assert.match(r.chyba, /rozsah/);
});

test('a pitch change removes a tie into a note of a different pitch', () => {
  const p = pisen();
  // tied D5 → moving only the start is not possible (the whole chain moves), but setting the pitch of a note after the tie outside the chain:
  const q = kopie(p); q.takty[0].noty[1].lig = true; q.takty[0].noty[1].t = 'D5';   // A4→D5 ⁀ D5 ⁀ D5
  const r = nastavVysku(q, V(1, 0), 74);                                // same pitch: nothing is removed
  assert.ok(r.pisen.takty[0].noty[1].lig);
  const s = naPomlku(q, V(1, 0));                                       // a rest in the middle → the tie into it disappears
  assert.equal(s.pisen.takty[0].noty[2].lig, false);
  rt(s.pisen);
});

test('nastavDelku with filling keeps the bar total (shortening and lengthening)', () => {
  const p = pisen();
  // shortening: quarter → eighth, an eighth rest is added after it
  let r = nemeni(p, x => nastavDelku(x, V(0, 1), '1/8'));
  assert.deepEqual(tt(r.pisen, 0), ['F#4', 'A4', 'r', 'D5']);
  assert.deepEqual(dd(r.pisen, 0), ['1/4', '1/8', '1/8', '1/4']);
  rt(r.pisen);
  // shortening a half to a sixteenth → rests of 3/16 (dotted eighth)
  r = nastavDelku(p, V(0, 0, 'l'), '1/16');
  assert.equal(soucetTaktu(r.pisen.takty[0].leva), 3);
  assert.deepEqual(tt(r.pisen, 0, 'l'), ['D3', 'r', 'r', 'A2']);
  rt(r.pisen);
  // lengthening: rests first – D5 1/4 → 1/2 takes the rest at the end, the notes shift
  r = nastavDelku(p, V(1, 0), '1/2');
  assert.deepEqual(tt(r.pisen, 1), ['D5', 'C#5', 'B4']);
  assert.deepEqual(dd(r.pisen, 1), ['1/2', '1/8', '1/8']);
  rt(r.pisen);
  // lengthening by more than the rests → takes from notes too
  r = nastavDelku(p, V(1, 0), '5/8');                                   // 5/8 cannot be a single note
  assert.equal(r.pisen, p);
  assert.ok(r.chyba);
  r = nastavDelku(p, V(1, 0), '3/8');                                   // dotted quarter: 1/8 from the rest
  assert.deepEqual(dd(r.pisen, 1), ['3/8', '1/8', '1/8', '1/8']);
  rt(r.pisen);
  r = nastavDelku(p, V(1, 0), '3/4');                                   // the whole bar – eats everything
  assert.deepEqual(tt(r.pisen, 1), ['D5']);
  rt(r.pisen);
  // not possible: the last note of the bar, nothing after it
  r = nastavDelku(p, V(0, 2), '1/2');
  assert.equal(r.pisen, p);
  assert.match(r.chyba, /místo/);
  // without filling: the bar overflows and stavTaktu shows it
  r = nastavDelku(p, V(0, 2), '1/2', { doplnit: false });
  assert.equal(soucetTaktu(r.pisen.takty[0].noty), 4);
  assert.equal(stavTaktu(r.pisen)[0].ok, false);
  rt(r.pisen, { kontrolovat: false });
});

test('nastavDelku: a partly shortened note is written out as tied notes, an incomplete bar is filled first', () => {
  const p = zaklad([{ akordy: [], noty: [n('D4', '1/4'), n('E4', '1/2', { s: 'lá' })] }, { akordy: [], noty: [n('F#4', '3/4')] }]);
  const r = nastavDelku(p, V(0, 0), '3/8');                            // D4 → 3/8, E4 1/2 → 3/8
  assert.deepEqual(dd(r.pisen, 0), ['3/8', '3/8']);
  assert.equal(r.pisen.takty[0].noty[1].s, 'lá');
  rt(r.pisen);
  const q = zaklad([{ akordy: [], noty: [n('D4', '1/4')] }, { akordy: [], noty: [n('E4', '1/4'), n('F#4', '1/4')] }, { akordy: [], noty: [n('G4', '3/4')] }]);
  const s = nastavDelku(q, V(1, 1), '1/2');                             // bar 2 is short – its free space is used first
  assert.deepEqual(dd(s.pisen, 1), ['1/4', '1/2']);
  rt(s.pisen);
  const w = nastavDelku(zaklad([{ akordy: [], noty: [n('D4', '1/8'), n('E4', '1/2', { s: 'lá' }), n('r', '1/8')] }]), V(0, 0), '3/16');
  // rests first: 1/16 is taken from the rest (1/8 → 1/16)
  assert.deepEqual(tt(w.pisen, 0), ['D4', 'E4', 'r']);
  assert.deepEqual(dd(w.pisen, 0), ['3/16', '1/2', '1/16']);
  rt(w.pisen);
  const x = nastavDelku(zaklad([{ akordy: [], noty: [n('D4', '1/8'), n('E4', '1/2', { s: 'lá' }), n('F4', '1/8')] }]), V(0, 0), '1/4');
  // no rests: an eighth is taken from E4 → 3/8; F4 stays
  assert.deepEqual(dd(x.pisen, 0), ['1/4', '3/8', '1/8']);
  rt(x.pisen);
  const y = nastavDelku(zaklad([{ akordy: [], noty: [n('D4', '1/16'), n('E4', '1/2', { s: 'lá-', lig: false }), n('F4', '3/16')] }]), V(0, 0), '1/4');
  // takes 3/16 from E4: 1/2 − 3/16 = 5/16 → 1/4 ⁀ 1/16 (tied), syllable on the first only
  assert.deepEqual(tt(y.pisen, 0), ['D4', 'E4', 'E4', 'F4']);
  assert.deepEqual(dd(y.pisen, 0), ['1/4', '1/4', '1/16', '3/16']);
  assert.deepEqual(y.pisen.takty[0].noty.map(z => z.lig), [false, true, false, false]);
  assert.deepEqual(y.pisen.takty[0].noty.map(z => z.s), ['', 'lá-', '', '']);
  rt(y.pisen);
});

test('prepniTecku and prepniTriolu', () => {
  const p = pisen();
  let r = nemeni(p, x => prepniTecku(x, V(1, 0)));                     // D5 1/4 → 3/8, takes an eighth from the rest
  assert.deepEqual(dd(r.pisen, 1), ['3/8', '1/8', '1/8', '1/8']);
  rt(r.pisen);
  r = prepniTecku(r.pisen, V(1, 0));                                   // back without the dot, adds a rest
  assert.deepEqual(dd(r.pisen, 1), ['1/4', '1/8', '1/8', '1/8', '1/8']);
  assert.equal(soucetTaktu(r.pisen.takty[1].noty), 3);
  rt(r.pisen);
  r = prepniTriolu(p, V(0, 1));                                        // quarter → eighth-note triplet
  assert.deepEqual(tt(r.pisen, 0), ['F#4', 'A4', 'r', 'r', 'D5']);
  assert.deepEqual(dd(r.pisen, 0), ['1/4', '1/12', '1/12', '1/12', '1/4']);
  rt(r.pisen);
  assert.ok(prepniTecku(r.pisen, V(0, 2)).chyba);                      // a triplet cannot be dotted
  const s = prepniTriolu(r.pisen, V(0, 3));                            // removing the triplet → one quarter
  assert.deepEqual(tt(s.pisen, 0), ['F#4', 'A4', 'D5']);
  assert.deepEqual(s.vyber, V(0, 1));
  assert.equal(s.pisen.takty[0].noty[1].s, 'dič-');
  rt(s.pisen);
});

test('naPomlku, smaz, prepniLigaturu', () => {
  const p = pisen();
  let r = nemeni(p, x => naPomlku(x, V(0, 0)));
  assert.deepEqual(r.pisen.takty[0].noty[0], { t: 'r', d: '1/4', lig: false, s: '' });
  rt(r.pisen);
  r = smaz(p, V(1, 0));                                                // end of a tie → the tie from bar 1 disappears
  assert.equal(tt(r.pisen, 1)[0], 'r');
  assert.equal(r.pisen.takty[0].noty[2].lig, false);
  rt(r.pisen);
  r = smaz(p, V(1, 0, 'l'));
  assert.deepEqual(tt(r.pisen, 1, 'l'), ['r']);
  rt(r.pisen);
  r = prepniLigaturu(p, V(0, 2));                                      // turn off
  assert.equal(r.pisen.takty[0].noty[2].lig, false);
  rt(r.pisen);
  r = prepniLigaturu(r.pisen, V(0, 2));                                // turn back on (next note is the same)
  assert.equal(r.pisen.takty[0].noty[2].lig, true);
  r = prepniLigaturu(p, V(0, 0));                                      // F#4 → A4 not possible
  assert.equal(r.pisen, p);
  assert.ok(r.chyba);
  assert.ok(prepniLigaturu(p, V(1, 3)).chyba);                        // rest
  assert.ok(prepniLigaturu(p, V(2, 0)).chyba);                        // dyad A4 D5 → rest
});

test('vlozZa: with filling takes from the following notes, at the start of a bar, into the left hand, MIDI, errors', () => {
  const p = pisen();
  let r = nemeni(p, x => vlozZa(x, V(1, 0), { t: 'E5', d: '1/8' }));  // after D5, takes an eighth from the rest
  assert.deepEqual(tt(r.pisen, 1), ['D5', 'E5', 'C#5', 'B4', 'r']);
  assert.deepEqual(dd(r.pisen, 1), ['1/4', '1/8', '1/8', '1/8', '1/8']);
  assert.deepEqual(r.vyber, V(1, 1));
  rt(r.pisen);
  r = vlozZa(p, V(2, -1), { t: 74, d: '1/4' });                        // at the start, MIDI → D5
  assert.deepEqual(tt(r.pisen, 2), ['D5', 'A4 D5']);
  assert.deepEqual(dd(r.pisen, 2), ['1/4', '1/2']);                    // the rest at the end was used up
  rt(r.pisen);
  r = vlozZa(p, V(0, 2), { t: 'E5', d: '1/4' });                       // no room at the end of a full bar
  assert.equal(r.pisen, p);
  assert.match(r.chyba, /místo/);
  r = vlozZa(p, V(0, 2), { t: 'E5', d: '1/4' }, { doplnit: false });  // without filling the bar overflows
  assert.equal(tt(r.pisen, 0).length, 4);
  assert.equal(stavTaktu(r.pisen)[0].ok, false);
  assert.match(stavTaktu(r.pisen)[0].zprava, /4\/4 místo 3\/4/);
  rt(r.pisen, { kontrolovat: false });
  const bez = kopie(p); bez.takty.forEach(t => delete t.leva);
  r = vlozZa(bez, V(1, -1, 'l'), { t: 'A2', d: '3/4' });               // new left hand in a bar without one
  assert.deepEqual(tt(r.pisen, 1, 'l'), ['A2']);
  assert.ok(vlozZa(p, V(0, 0), { t: 'X9', d: '1/4' }).chyba);
  assert.ok(vlozZa(p, V(0, 0), { t: 'C4', d: '5/16' }).chyba);
  assert.ok(vlozZa(p, V(7, 0), { t: 'C4', d: '1/4' }).chyba);
});

test('nastavSlabiku and nastavAkord', () => {
  const p = pisen();
  let r = nemeni(p, x => nastavSlabiku(x, V(1, 1), ' ne- '));
  assert.equal(r.pisen.takty[1].noty[1].s, 'ne-');
  r = nastavSlabiku(r.pisen, V(1, 2), 'bi');
  rt(r.pisen);
  r = nastavSlabiku(p, V(0, 0), '');
  assert.equal(r.pisen.takty[0].noty[0].s, '');
  rt(r.pisen);
  assert.ok(nastavSlabiku(p, V(0, 0, 'l'), 'x').chyba);
  assert.ok(nastavSlabiku(p, V(1, 3), 'x').chyba);
  r = nemeni(p, x => nastavAkord(x, 0, 2, 'A7', V(0, 0)));
  assert.deepEqual(r.pisen.takty[0].akordy, [{ doba: 0, znacka: 'D' }, { doba: 2, znacka: 'A7' }]);
  assert.deepEqual(r.vyber, V(0, 0));
  rt(r.pisen);
  r = nastavAkord(r.pisen, 0, 0, 'Bm');                                // replaces
  assert.deepEqual(r.pisen.takty[0].akordy.map(a => a.znacka), ['Bm', 'A7']);
  r = nastavAkord(r.pisen, 0, 2, null);                                // deletes
  assert.deepEqual(r.pisen.takty[0].akordy, [{ doba: 0, znacka: 'Bm' }]);
  rt(r.pisen);
  r = nastavAkord(p, 1, 1.5, 'F#m7');                                  // on an eighth
  assert.deepEqual(r.pisen.takty[1].akordy[1], { doba: 1.5, znacka: 'F#m7' });
  rt(r.pisen);
  assert.ok(nastavAkord(p, 0, 0, 'X#q').chyba);
  assert.ok(nastavAkord(p, 0, 3, 'D').chyba);                          // outside the bar
  assert.ok(nastavAkord(p, 5, 0, 'D').chyba);
});

test('bars: insert, delete, repeat marks', () => {
  const p = pisen();
  let r = nemeni(p, x => vlozTakt(x, 0));
  assert.equal(r.pisen.takty.length, 4);
  assert.deepEqual(r.pisen.takty[1].noty, [{ t: 'r', d: '3/4', lig: false, s: '' }]);
  assert.deepEqual(tt(r.pisen, 1, 'l'), ['r']);
  assert.deepEqual(r.vyber, V(1, 0));
  assert.equal(r.pisen.takty[0].noty[2].lig, false);                   // the D5 tie would lead into a rest → removed
  rt(r.pisen);
  r = vlozTakt(p, -1);                                                 // at the start
  assert.equal(r.pisen.takty[0].noty[0].t, 'r');
  r = vlozTakt(zaklad([{ akordy: [], noty: [n('C4', '1/1')] }], { takt: '5/4' }), 0);
  assert.deepEqual(r.pisen.takty[1].noty.map(x => x.d), ['1/1', '1/4']);  // 5/4 is split up
  assert.equal(r.pisen.takty[1].leva, undefined);
  rt(r.pisen);
  r = vlozTakt(p, 1, 'kopie');
  assert.deepEqual(r.pisen.takty[2].noty, p.takty[1].noty);
  r = smazTakt(p, 1);                                                  // the tie D5 → A4 D5 (common tone) stays
  assert.equal(r.pisen.takty[0].noty[2].lig, true);
  r = vlozTakt(p, 1, 'kopie');
  r = smazTakt(nastavVysku(r.pisen, V(2, 0), 60).pisen, 1);           // after deleting, the tie leads into C4 → removed
  assert.equal(r.pisen.takty[0].noty[2].lig, false);
  r = nemeni(p, x => smazTakt(x, 1, V(2, 1)));
  assert.equal(r.pisen.takty.length, 2);
  assert.deepEqual(r.vyber, V(1, 1));                                  // the selection moved
  rt(r.pisen);
  r = smazTakt(p, 1, V(1, 2));                                         // selection in the deleted bar
  assert.deepEqual(r.vyber, V(1, 0));
  r = smazTakt(p, 2, V(2, 0));                                         // last bar
  assert.deepEqual(r.vyber, V(1, 0));
  assert.ok(smazTakt(zaklad([{ akordy: [], noty: [n('C4', '3/4')] }]), 0).chyba);
  r = nemeni(p, x => nastavZnacky(x, 0, { zacatekRepetice: true }));
  r = nastavZnacky(r.pisen, 1, { konecRepetice: true, volta: [1] });
  r = nastavZnacky(r.pisen, 2, { volta: 2, fine: true });
  assert.deepEqual(r.pisen.takty[2].znacky, { volta: [2], fine: true });
  rt(r.pisen);
  r = nastavZnacky(r.pisen, 2, {});
  assert.equal(r.pisen.takty[2].znacky, undefined);
  assert.ok(nastavZnacky(p, 0, { repete: true }).chyba);
  assert.ok(nastavZnacky(p, 0, { volta: [0] }).chyba);
});

test('header: the key signature changes only spelling, the time signature recalculates nothing', () => {
  const p = pisen();
  let r = nemeni(p, x => nastavHlavicku(x, { predznamenani: -5, nazev: ' Nový ', tempo: 120 }));
  assert.equal(r.pisen.nazev, 'Nový');
  assert.equal(r.pisen.tempo, 120);
  assert.deepEqual(tt(r.pisen, 0), ['Gb4', 'A4', 'D5']);
  assert.deepEqual(tt(r.pisen, 1), ['D5', 'Db5', 'B4', 'r']);
  // sounding pitches (MIDI) did not change, in both hands
  const zni = q => JSON.stringify(q.takty.map(t => [t.noty, t.leva].map(a => a.map(x => vysky(x.t).map(v => v.midi)))));
  assert.equal(zni(r.pisen), zni(p));
  assert.deepEqual(tt(r.pisen, 1, 'l'), ['A2 E3 G3']);
  rt(r.pisen);
  r = nastavHlavicku(p, { takt: '4/4' });
  assert.deepEqual(r.pisen.takty, p.takty);
  assert.equal(stavTaktu(r.pisen)[1].ok, false);
  assert.match(stavTaktu(r.pisen)[1].zprava, /3\/4 místo 4\/4/);
  r = nastavHlavicku(p, { klic: 'basovy', autor: 'L. van Beethoven' });
  rt(r.pisen);
  assert.ok(nastavHlavicku(p, { takt: '3/5' }).chyba);
  assert.ok(nastavHlavicku(p, { predznamenani: 9 }).chyba);
  assert.ok(nastavHlavicku(p, { tempo: -1 }).chyba);
  assert.ok(nastavHlavicku(p, { klic: 'altovy' }).chyba);
  assert.equal(nastavHlavicku(p, { takt: 'x' }).pisen, p);
});

test('stavTaktu: totals, pickup, left hand', () => {
  const p = zaklad([
    { akordy: [], noty: [n('A4', '1/4')], leva: [n('r', '1/4')] },        // pickup
    { akordy: [], noty: [n('D5', '1/2')], leva: [n('D3', '3/4')] },       // short in the middle
    { akordy: [], noty: [n('D5', '3/4')], leva: [n('D3', '1/2'), n('A2', '1/2')] },
    { akordy: [], noty: [n('D5', '3/4')] },
  ]);
  const s = stavTaktu(p);
  assert.deepEqual(s.map(x => x.ok), [true, false, false, true]);
  assert.equal(s[0].soucet, 1);
  assert.equal(s[1].ocekavano, 3);
  assert.equal(s[3].soucetLeva, null);
  assert.match(s[1].zprava, /součet délek 2\/4 místo 3\/4/);
  assert.match(s[2].zprava, /^levá ruka: součet délek 4\/4/);
});

test('history: record, undo, redo, discarding a branch, 200-step limit', () => {
  const p0 = pisen();
  let { pisen: p, historie: h } = novaHistorie(p0);
  assert.equal(p, p0);
  assert.equal(muzeZpet(h), false);
  const p1 = posunVysku(p0, V(0, 0), 1).pisen;
  ({ historie: h } = zapis(h, p1, 'výška'));
  const p2 = nastavDelku(p1, V(0, 1), '1/8').pisen;
  ({ historie: h } = zapis(h, p2, 'délka'));
  assert.equal(zapis(h, p2, 'nic').historie, h);                       // the same state is not recorded
  let z = zpet(h);
  assert.equal(z.popis, 'délka');
  assert.deepEqual(z.pisen, p1);
  assert.notEqual(z.pisen, p1);                                        // a fresh copy
  z = zpet(z.historie);
  assert.deepEqual(z.pisen, p0);
  assert.equal(muzeZpet(z.historie), false);
  const nic = zpet(z.historie);
  assert.equal(nic.popis, null);
  assert.deepEqual(nic.pisen, p0);
  let y = znovu(z.historie);
  assert.equal(y.popis, 'výška');
  assert.deepEqual(y.pisen, p1);
  assert.ok(muzeZnovu(y.historie));
  // a new record after undo discards "redo"
  const p3 = naPomlku(y.pisen, V(0, 0)).pisen;
  ({ historie: h } = zapis(y.historie, p3, 'pomlka'));
  assert.equal(muzeZnovu(h), false);
  assert.equal(znovu(h).popis, null);
  // mutating the returned model does not corrupt the history
  const w = zpet(h);
  w.pisen.takty[0].noty[0].t = 'C4';
  assert.equal(zpet(h).pisen.takty[0].noty[0].t, 'G4');
  // limit
  let hh = novaHistorie(p0).historie, q = p0;
  for (let i = 0; i < MAX_HISTORIE + 50; i++) {
    q = { ...q, tempo: 10 + i };
    hh = zapis(hh, q, `krok ${i}`).historie;
  }
  assert.equal(hh.kroky.length, MAX_HISTORIE + 1);
  let k = 0, x = { historie: hh };
  while (muzeZpet(x.historie)) { x = zpet(x.historie); k++; }
  assert.equal(k, MAX_HISTORIE);
  assert.equal(x.pisen.tempo, 10 + 49);
});

test('keyboard shortcuts and proved', () => {
  const k = klavesovaZkratka;
  assert.equal(k('ArrowUp'), 'vyskaNahoru');
  assert.equal(k('ArrowDown'), 'vyskaDolu');
  assert.equal(k('ArrowUp', { shift: true }), 'chromatickyNahoru');
  assert.equal(k('ArrowDown', { alt: true }), 'oktavaDolu');
  assert.equal(k('ArrowRight'), 'dalsi');
  assert.equal(k('ArrowLeft'), 'predchozi');
  assert.deepEqual(['1', '2', '3', '4', '5', '6'].map(x => k(x)), ['delka1', 'delka2', 'delka4', 'delka8', 'delka16', 'delka32']);
  assert.equal(k('š'), 'delka4');                                     // Czech keyboard
  assert.equal(k('%', { shift: true, kod: 'Digit5' }), 'delka16');
  assert.equal(k('.'), 'tecka');
  assert.equal(k('r'), 'pomlka');
  assert.equal(k('0'), 'pomlka');
  assert.equal(k('Delete'), 'smazat');
  assert.equal(k('Backspace'), 'smazat');
  assert.equal(k('t'), 'ligatura');
  assert.equal(k('z', { meta: true }), 'zpet');
  assert.equal(k('Z', { meta: true, shift: true }), 'znovu');
  assert.equal(k('z', { ctrl: true }), 'zpet');
  assert.equal(k('z'), null);
  assert.equal(k('1', { meta: true }), null);
  assert.equal(k('x'), null);
  const p = pisen();
  assert.equal(tt(proved('vyskaNahoru', p, V(0, 0)).pisen, 0)[0], 'G4');
  assert.equal(dd(proved('delka8', p, V(0, 1)).pisen, 0)[1], '1/8');
  assert.equal(dd(proved('delka1', zaklad([{ akordy: [], noty: [n('C4', '1/4'), n('r', '1/2')] }], { takt: '4/4' }), V(0, 0)).pisen, 0)[0], '1/1');
  assert.deepEqual(proved('dalsi', p, V(0, 2)).vyber, V(1, 0));
  assert.ok(proved('nesmysl', p, V(0, 0)).chyba);
});

test('rozloz: writable durations', () => {
  assert.deepEqual(rozloz(3), [3]);
  assert.deepEqual(rozloz(5), [4, 1]);
  assert.deepEqual(rozloz(1.25), [1, 0.25]);
  assert.deepEqual(rozloz(4 / 3), [4 / 3]);
  assert.deepEqual(rozloz(2 / 3), [2 / 3]);
  assert.equal(rozloz(0.01), null);
});

test('the result renders in Verovio', async () => {
  const { default: createVerovioModule } = await import('verovio/wasm');
  const { VerovioToolkit } = await import('verovio/esm');
  const tk = new VerovioToolkit(await createVerovioModule());
  let p = pisen();
  p = prepniTriolu(p, V(0, 1)).pisen;
  p = nastavDelku(p, V(1, 0), '3/8').pisen;
  p = nastavAkord(p, 1, 1.5, 'F#m7').pisen;
  p = vlozTakt(p, 2).pisen;
  p = nastavVysku(p, V(3, 0), 62).pisen;
  p = nastavZnacky(p, 3, { konecRepetice: true }).pisen;
  p = nastavHlavicku(p, { predznamenani: -3 }).pisen;
  rt(p);
  assert.ok(tk.loadData(naMusicXml(p)));
  assert.ok(tk.renderToSVG(1).includes('<svg'));
});

test('real songs: edits keep the round trip and bar status (only when available)', () => {
  const d = new URL('../private/songs/', import.meta.url);
  if (!existsSync(d)) return;
  for (const f of readdirSync(d).filter(x => x.endsWith('.musicxml'))) {
    const p0 = zMusicXml(naMusicXml(zMusicXml(readFileSync(new URL(f, d), 'utf8'))));
    const chyb0 = kontrola(p0).length;
    let { pisen: p, vyber: v } = prvni(p0, 'p');
    while (vybranaNota(p, v)?.t === 'r') v = dalsi(p, v).vyber;      // first real note
    for (const krok of [
      x => posunVysku(x, v, 1), x => posunVysku(x, v, -1, { chromaticky: true }), x => posunOktavu(x, v, 1),
      x => nastavVysku(x, v, 60), x => prepniTecku(x, v), x => prepniTecku(x, v), x => naPomlku(x, v),
      x => nastavVysku(x, v, 67), x => vlozTakt(x, 0), x => smazTakt(x, 1),
      x => nastavHlavicku(x, { predznamenani: ((x.predznamenani || 0) + 3) % 7 }),
      x => nastavAkord(x, 0, 0, 'Am'),
    ]) {
      const r = krok(p);
      if (!r.chyba) p = r.pisen;
      const zpet = zMusicXml(naMusicXml(p));
      assert.deepEqual(norm(zpet), norm(p), f);
    }
    // bar totals are kept by filling: changing durations added no errors
    assert.ok(kontrola(p).length <= chyb0, `${f}: ${kontrola(p).join(' | ')}`);
    const m = metrum(p.takt).delka;
    assert.ok(stavTaktu(p).every(s => s.ocekavano === m));
  }
});
