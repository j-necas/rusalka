import './setup.mjs';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { nastavJazyk } from '../static/lib/texts.js';
import { fraze, nazevUseku, textTrenera, dalsiTempo, tezkaMista, textKontroly, kontrolaTexty } from '../static/lib/practice.js';
import { seznamUrovni } from '../static/lib/levels.js';
import { obtiznost } from '../static/lib/difficulty.js';
import { kontrola, kontrolaPolozky } from '../static/lib/song.js';
import cs from '../static/lang/cs/practice.js';
import en from '../static/lang/en/practice.js';

const DIAKRITIKA = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/;
const anglicky = (s, co = s) => assert.ok(!DIAKRITIKA.test(s), `Czech: ${co}`);

const n = (t, d, s = '') => ({ t, d, lig: false, s });
const q = (t, s = '') => n(t, '1/4', s);
const pisen = (takty, extra = {}) => ({ nazev: 'Test', autor: '', klic: 'houslovy', predznamenani: 0, takt: '4/4', tempo: 100,
  takty: takty.map(noty => ({ akordy: [], noty })), ...extra });
/** 8 bars, the first phrase with lyrics (the rest in bar 4 ends it) */
const pisnicka = () => pisen([
  [q('E4', 'Twin-'), q('E4', 'kle'), q('G4', 'twin-'), q('G4', 'kle')],
  [q('A4', 'lit-'), q('A4', 'tle'), n('G4', '1/2', 'star,')],
  [q('F4', 'how'), q('F4', 'I'), q('E4', 'won-'), q('E4', 'der')],
  [n('D4', '1/2', 'what.'), n('r', '1/2')],
  [q('C4'), q('D4'), q('E4'), q('F4')], [n('G4', '1/1')], [q('A4'), q('G4'), q('F4'), q('E4')], [n('C4', '1/1')],
]);

const fakta = (pasmo, extra = {}) => ({
  pasmo, rezim: 'tempo', ruka: 'prava', rychlost: 80, usek: { od: 0, do: 7, takty: '1–8' }, presnost: 85, cisty: false,
  spech: 'presne', posunMs: null, nejhorsiTakty: [], vzorce: [], trend: null, zlepseneTakty: [], tezkaMista: [],
  useky: [{ od: 0, do: 7, takty: '1–8', proc: 'cely usek' }], ...extra,
});
const fis = { typ: 'pulton', druh: 'krizek', ocekavano: 'F#', zahrano: 'F', takty: [5, 6], indexy: [4, 5], pocet: 2 };

after(() => nastavJazyk('cs'));

test('en: the cviceni area dictionary has the same keys as Czech and all start with cviceni.', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(cs).sort());
  for (const k of Object.keys(cs)) assert.ok(k.startsWith('cviceni.'), k);
  for (const [k, v] of Object.entries(en)) anglicky(JSON.stringify(v), k);
});

test('en: passage names – bars / bar, lyrics in quotes, repeated pass', () => {
  nastavJazyk('en');
  const p = pisnicka();
  assert.equal(nazevUseku(p, 0, 3), 'bars 1–4: “Twinkle twinkle little…”');
  assert.equal(nazevUseku(p, 4, 4), 'bar 5');
  const f = fraze(p);
  assert.equal(f[0].nazev, 'bars 1–4: “Twinkle twinkle little…”');
  const r = pisnicka();
  r.takty[0].znacky = { zacatekRepetice: true };
  r.takty[3].znacky = { konecRepetice: true };
  assert.deepEqual(fraze(r).slice(0, 2).map(x => x.nazev), ['bars 1–4: “Twinkle twinkle little…”', 'bars 1–4 (2nd time): “Twinkle twinkle little…”']);
  const tm = tezkaMista({ takty: { 4: { noty: 4, chyby: 2, tony: 2, vynechane: 0, posun: 0, mereno: 0 } } }, p, 1);
  assert.equal(tm[0].popis, 'bar 5 – mostly wrong notes');
  nastavJazyk('cs');
  assert.equal(nazevUseku(p, 4, 5), 'takty 5–6', 'back in Czech');
});

test('en: coach for a child – friendly tone, English note name', () => {
  nastavJazyk('en');
  const t1 = textTrenera(fakta('dite', { vzorce: [fis], zlepseneTakty: [3] }));
  assert.equal(t1.veta, 'Bar 3 goes without a mistake now. In bars 5 and 6 you play F instead of F# – don’t forget the sharp.');
  const t2 = textTrenera(fakta('dite', { spech: 'brzy', posunMs: -80 }));
  assert.equal(t2.veta, 'You’re hurrying ahead of the beat a little – listen to the accompaniment.');
  const t3 = textTrenera(fakta('dite', { presnost: 50 }));
  assert.equal(t3.veta, 'This bit is still tricky – let’s try it slower.');
  for (const t of [t1, t2, t3]) anglicky(t.veta);
  nastavJazyk('cs');
});

test('en: coach for an adult – matter-of-fact tone with numbers', () => {
  nastavJazyk('en');
  const t1 = textTrenera(fakta('dospely', { vzorce: [fis], trend: { smer: 'lepsi', rozdil: 12, predchozi: [70] } }));
  assert.equal(t1.veta, 'Accuracy is 12 points higher than in previous attempts. '
    + 'In bars 5 and 6, F was played instead of F# repeatedly – the sharp from the key signature is missing.');
  assert.equal(textTrenera(fakta('dospely', { nejhorsiTakty: [{ cislo: 4, index: 3, chyby: 3, druh: 'vynechane' }] })).veta,
    'Most mistakes (3) were in bar 4: missed notes.');
  assert.equal(textTrenera(fakta('dospely', { cisty: true, presnost: 100 })).veta, 'Clean run at 80 %.');
  assert.equal(dalsiTempo({ rychlost: 70, cisteVRade: 2 }, { presnost: 1, cisty: true }).zprava, 'Three clean runs in a row – speeding up to 75 %.');
  nastavJazyk('cs');
  assert.equal(textTrenera(fakta('dospely', { cisty: true, presnost: 100 })).veta, 'Čistý průchod při 80 %.', 'back in Czech');
});

test('en: levels – names and descriptions including accompaniment', () => {
  nastavJazyk('en');
  const u = seznamUrovni({ ...pisnicka(), takt: '3/4' });
  assert.deepEqual(u.map(x => x.nazev), ['Melody, easy rhythm', 'Whole melody', 'Melody and bass', 'Melody and chords', 'All the notes']);
  assert.equal(u[3].popis, 'The right hand plays the melody, the left plays chords (waltz: bass – chord – chord). We’ll add chords to fit the melody.');
  for (const x of seznamUrovni(pisen([[q('C4')]], { takt: '4/4' }))) { anglicky(x.nazev); anglicky(x.popis); }
  nastavJazyk('cs');
  assert.equal(seznamUrovni(pisnicka())[4].nazev, 'Všechny noty');
});

test('en: difficulty – name and reasons', () => {
  nastavJazyk('en');
  assert.equal(obtiznost(pisnicka()).nazev, 'easy');
  const tezka = pisen(Array.from({ length: 12 }, () => [n('C4', '1/16'), n('C6', '1/16'), n('D4', '3/16'), n('F#5', '1/8'), n('Bb4', '1/2')]),
    { tempo: 140, predznamenani: 4 });
  tezka.takty.forEach(t => { t.leva = [n('C3 G3', '1/1')]; });
  const o = obtiznost(tezka);
  assert.equal(o.nazev, 'harder');
  assert.ok(o.duvody.includes('both hands') && o.duvody.includes('fast tempo'), o.duvody.join(', '));
  for (const d of o.duvody) anglicky(d);
  nastavJazyk('cs');
  assert.equal(obtiznost(pisnicka()).nazev, 'snadná');
});

test('en: bar length check – data from song.js, text in the app language', () => {
  const p = pisnicka();
  p.takty[2].noty.pop();
  p.takty[5].leva = [n('C3', '1/2')];
  p.takty[6].noty[0] = n('X4', '1/4');
  nastavJazyk('en');
  assert.deepEqual(kontrolaTexty(p), ['bar 3: note lengths add up to 3/4 instead of 4/4', 'bar 6 (left hand): note lengths add up to 2/4 instead of 4/4',
    'bar 7: unknown pitch "X4"']);
  assert.equal(textKontroly({ takt: 2, leva: false, druh: 'nezapisovatelna', d: '5/16' }), 'bar 2: length 5/16 can’t be written as a single note');
  nastavJazyk('cs');
  assert.deepEqual(kontrolaTexty(p), kontrola(p));
  assert.equal(kontrolaPolozky(p).length, 3);
});
