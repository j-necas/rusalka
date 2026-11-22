import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { kontrola, naMusicXml, zMusicXml, rozvin, vyska, kopie } from '../static/lib/song.js';
import * as Hra from '../static/lib/practice.js';
import {
  fraze, nazevUseku, cisloTaktu, jmenoTonu, souhrnPokusu, slucStatistiky, tezkaMista, dalsiTempo, faktaProTrenera,
  textTrenera,
} from '../static/lib/practice.js';

const n = (t, d, s = '', extra = {}) => ({ t, d, lig: false, s, ...extra });
const q = (t, s = '') => n(t, '1/4', s);
const zaklad = (takty, extra = {}) => ({ nazev: 'Test', autor: '', klic: 'houslovy', predznamenani: 2, takt: '4/4', tempo: 100, takty, ...extra });

/** artificial song in D major: phrases end with a rest (bar 4), a long note (bar 8) and the end of the song */
function pisnicka(sTextem = true) {
  const s = x => (sTextem ? x : '');
  const t = noty => ({ akordy: [], noty });
  return zaklad([
    t([q('F#4', s('Ve-')), q('A4', s('čer')), q('B4', s('pa-')), q('A4', s('dá'))]),
    t([q('G4', s('jsou')), q('F#4', s('jak')), q('E4', s('dým')), q('D4', s('a'))]),
    t([q('E4', s('let-')), q('F#4', s('ní')), q('G4', s('ve-')), q('A4', s('čer'))]),
    t([n('F#4', '1/2', s('svět.')), n('r', '1/2')]),
    t([q('B4', s('Ka-')), q('C#5', s('ždý')), q('D5', s('má')), q('B4', s('je'))]),
    t([q('A4', s('své')), q('G4'), q('F#4'), q('E4')]),
    t([q('D4'), q('E4'), q('F#4'), q('G4')]),
    t([n('A4', '1/1', s('ráj'))]),
    t([q('B4', s('a')), q('A4', s('pak')), q('G4', s('je')), q('F#4', s('ko-'))]),
    t([q('E4', s('nec')), q('F#4'), n('D4', '1/2', s('tmy.'))]),
  ]);
}

// ---------------------------------------------------------------- phrases
test('test songs are valid and survive a MusicXML round trip', () => {
  for (const p of [pisnicka(), pisnicka(false)]) {
    assert.deepEqual(kontrola(p), []);
    const zpet = zMusicXml(naMusicXml(p));
    assert.deepEqual(zpet.takty.map(t => t.noty.map(x => [x.t, x.d, x.s])), p.takty.map(t => t.noty.map(x => [x.t, x.d, x.s])));
    assert.deepEqual(fraze(zpet), fraze(p));
  }
});

test('the test song renders in Verovio', async () => {
  const { default: createVerovioModule } = await import('verovio/wasm');
  const { VerovioToolkit } = await import('verovio/esm');
  const tk = new VerovioToolkit(await createVerovioModule());
  assert.ok(tk.loadData(naMusicXml(pisnicka())));
});

test('phrases with lyrics: boundaries after a rest and a long note, name with the first words', () => {
  const p = pisnicka(), puvodni = kopie(p);
  const f = fraze(p);
  assert.deepEqual(f.map(x => [x.od, x.do]), [[0, 3], [4, 7], [8, 9]]);
  assert.equal(f[0].nazev, 'takty 1–4: ‚Večer padá jsou…‘');
  assert.equal(f[1].nazev, 'takty 5–8: ‚Každý má je…‘');
  assert.equal(f[2].nazev, 'takty 9–10: ‚a pak je…‘');
  assert.deepEqual(p, puvodni, 'input is not modified');
});

test('phrases without lyrics: same boundaries, name with bar numbers only', () => {
  const f = fraze(pisnicka(false));
  assert.deepEqual(f.map(x => [x.od, x.do]), [[0, 3], [4, 7], [8, 9]]);
  assert.deepEqual(f.map(x => x.nazev), ['takty 1–4', 'takty 5–8', 'takty 9–10']);
});

test('phrases: end after a syllable with punctuation', () => {
  const slova = ['Ve', 'dne', 'dým.', 'V no-', 'ci', 'mráz']
  const p = zaklad(slova.map(s => ({ akordy: [], noty: [q('D4', s), q('E4'), q('F#4'), q('G4')] })));
  assert.deepEqual(fraze(p).map(x => [x.od, x.do, x.nazev]), [[0, 2, 'takty 1–3: ‚Ve dne dým.‘'], [3, 5, 'takty 4–6: ‚V noci mráz‘']]);
  p.takty[2].noty[0].s = 'dým';
  assert.notDeepEqual(fraze(p).map(x => [x.od, x.do]), [[0, 2], [3, 5]]);
});

test('phrases: a long stretch without boundaries is split, short ones are merged, always 2–4 bars', () => {
  const rovne = k => zaklad(Array.from({ length: k }, () => ({ akordy: [], noty: [q('D4'), q('E4'), q('F#4'), q('G4')] })));
  assert.deepEqual(fraze(rovne(12)).map(x => [x.od, x.do]), [[0, 3], [4, 7], [8, 11]]);
  for (const k of [2, 3, 5, 6, 7, 9, 10, 13]) {
    const f = fraze(rovne(k));
    assert.equal(f[0].od, 0); assert.equal(f[f.length - 1].do, k - 1);
    f.forEach((x, i) => {
      assert.ok(x.do - x.od + 1 >= 2 && x.do - x.od + 1 <= 4, `${k} bars: ${x.od}–${x.do}`);
      if (i) assert.equal(x.od, f[i - 1].do + 1);
    });
  }
  // every bar ends with a rest (strong boundary) → still no 1-bar phrases
  const sPomlkou = zaklad(Array.from({ length: 6 }, () => ({ akordy: [], noty: [n('D4', '3/4'), n('r', '1/4')] })));
  assert.ok(fraze(sPomlkou).every(x => x.do - x.od >= 1));
  assert.deepEqual(fraze(zaklad([{ akordy: [], noty: [n('D4', '1')] }])).map(x => [x.od, x.do]), [[0, 0]]);
});

test('phrases: the pickup does not count towards length, a tie across the barline does not split a phrase', () => {
  const p = pisnicka(false);
  p.takty.unshift({ akordy: [], noty: [q('A3')] });             // pickup
  assert.deepEqual(kontrola(p), []);
  assert.deepEqual(fraze(p).slice(0, 2).map(x => [x.od, x.do]), [[0, 4], [5, 8]]);
  const s = pisnicka(false);
  s.takty[3] = { akordy: [], noty: [n('F#4', '1/2'), n('F#4', '1/2', '', { lig: true })] };
  s.takty[4].noty[0] = n('F#4', '1/4');                           // tie from bar 4 to 5
  assert.ok(!fraze(s).some(x => x.do === 3));
});

test('phrases in a song with a repeat: unfolded indices, original bar numbers', () => {
  const p = pisnicka(false);
  p.takty[0].znacky = { zacatekRepetice: true };
  p.takty[3].znacky = { konecRepetice: true };
  const r = rozvin(p);
  assert.equal(r.pisen.takty.length, 14);
  const f = fraze(p);
  assert.deepEqual(f.slice(0, 2).map(x => [x.od, x.do, x.nazev]), [[0, 3, 'takty 1–4'], [4, 7, 'takty 1–4 (2. průchod)']]);
  assert.equal(cisloTaktu(p, 8), 5);
  assert.equal(nazevUseku(pisnicka(), 4, 5), 'takty 5–6: ‚Každý má je…‘');
  assert.deepEqual(fraze(r.pisen).map(x => [x.od, x.do]), f.map(x => [x.od, x.do]), 'the unfolded song gives the same indices');
});

test('phrases in real songs (private, only when available)', () => {
  const d = new URL('../private/songs/', import.meta.url);
  if (!existsSync(d)) return;
  for (const soubor of readdirSync(d).filter(x => x.endsWith('.musicxml'))) {
    const p = zMusicXml(readFileSync(new URL(soubor, d), 'utf8'));
    const pocet = rozvin(p).pisen.takty.length;
    const f = fraze(p);
    assert.equal(f[0].od, 0, soubor);
    assert.equal(f[f.length - 1].do, pocet - 1, soubor);
    f.forEach((x, i) => {
      const delka = x.do - x.od + 1 - (x.od === 0 ? 1 : 0);
      assert.ok(x.do - x.od + 1 >= 2 && delka <= 4, `${soubor}: ${x.nazev}`);
      if (i) assert.equal(x.od, f[i - 1].do + 1, soubor);
      assert.match(x.nazev, /^takty? \d+/);
    });
  }
});

// ---------------------------------------------------------------- record and summary
/** attempt record from a simplified note description: [takt, pitch, vysledek, odchylkaMs?, drzenoMs?, delkaMs?] */
function zaznam(noty, extra = {}) {
  let ms = 0;
  return {
    rezim: 'tempo', rychlost: 100, od: 0, do: 3, ruka: 'prava', dobaMs: 600, chybneStisky: [],
    noty: noty.map(([takt, pitch, vysledek, odchylka = 0, drzeno = null, delka = 600], index) => {
      const o = { takt, index, pitch, ocekavanoMs: ms, ocekavanaDelkaMs: delka, vysledek,
        zahranoMs: vysledek === 'vynechana' ? null : ms + odchylka, odchylkaMs: vysledek === 'vynechana' ? null : odchylka, drzenoMs: drzeno };
      ms += delka;
      return o;
    }),
    ...extra,
  };
}
const midi = t => vyska(t).midi;

test('note names in Czech', () => {
  assert.equal(jmenoTonu(66), 'Fis');
  assert.equal(jmenoTonu(70), 'Ais');
  assert.equal(jmenoTonu(70, true), 'B');
  assert.equal(jmenoTonu(71), 'H');
});

test('summary: accuracy, clean run, bars, worst bars', () => {
  const z = zaznam([[0, 66, 'ok'], [0, 69, 'ok'], [1, 67, 'vynechana'], [1, 66, 'ok'], [2, 64, 'vedle'], [2, 62, 'ok'], [3, 64, 'ok'], [3, 66, 'ok']],
    { chybneStisky: [{ pitch: 63, ms: 2400, takt: 2 }, { pitch: 70, ms: 3000, takt: 2 }] });
  const s = souhrnPokusu(z);
  assert.equal(s.ok, 6);
  assert.equal(s.presnost, Math.round(6 / 9 * 1000) / 1000);     // 8 notes + 1 extra key press (the second one explains 'vedle')
  assert.equal(s.cisty, false);
  assert.deepEqual(s.takty[2], { chyby: 2, noty: 2, odchylka: 0, tony: 2, vynechane: 0 });
  assert.deepEqual(s.takty[1], { chyby: 1, noty: 2, odchylka: 0, tony: 0, vynechane: 1 });
  assert.deepEqual(s.nejhorsiTakty.map(t => [t.takt, t.druh]), [[2, 'tony'], [1, 'vynechane']]);
  const cisty = souhrnPokusu(zaznam([[0, 62, 'ok'], [0, 64, 'ok'], [1, 66, 'ok']]));
  assert.equal(cisty.cisty, true);
  assert.equal(cisty.presnost, 1);
  assert.equal(cisty.spech, 'presne');
});

test('summary: rushing and average offset in real ms (by speed)', () => {
  const z = zaznam([[0, 62, 'ok', -40], [0, 64, 'ok', -30], [1, 66, 'ok', -35], [1, 67, 'ok', -25]], { rychlost: 50 });
  const s = souhrnPokusu(z);
  assert.equal(s.prumernyPosunMs, -65);                         // −32.5 ms in song time = −65 ms in real time at 50 %
  assert.equal(s.prumernaOdchylkaMs, 65);
  assert.equal(s.spech, 'brzy');
  const k = souhrnPokusu({ ...z, rezim: 'cekam' });
  assert.equal(k.spech, null);
  assert.equal(k.prumernaOdchylkaMs, null);
});

test('With backing contributes no timing feedback or timing statistics, including older attempt records', () => {
  const z = zaznam([[0, 62, 'ok', -120], [0, 64, 'ok', -120], [0, 66, 'ok', -120]], { krok: 'pockej' });
  for (const rezim of ['pockej', 'tempo']) {
    const s = souhrnPokusu({ ...z, rezim });
    assert.equal(s.rezim, 'pockej');
    assert.equal(s.spech, null);
    assert.equal(s.prumernaOdchylkaMs, null);
    assert.equal(slucStatistiky(null, s, 0).takty[0].mereno, 0);
  }
});

test('one extra key in a chord counts once; even one extra key breaks a clean pass', () => {
  const z = zaznam(Array.from({ length: 24 }, (_, i) => [0, 60 + i, 'ok']), {
    rezim: 'cekam', chybneStisky: [{ pitch: 59, ms: 0, takt: 0, index: 0 }],
  });
  z.noty.slice(0, 3).forEach(n => { n.index = 0; });
  const s = souhrnPokusu(z);
  assert.equal(s.takty[0].chyby, 1);
  assert.equal(s.presnost, 0.96);
  assert.equal(s.cisty, false);
  // Older records could mark an entire chord as wrong for the same press.
  z.noty.slice(0, 3).forEach(n => { n.vysledek = 'vedle'; });
  assert.equal(souhrnPokusu(z).takty[0].chyby, 1);
});

test('the Find the notes loop finishes after three consecutive clean passes at any speed', () => {
  let stav = { rychlost: 60, cisteVRade: 0 };
  for (const [cisty, n] of [[true, 1], [false, 0], [true, 1], [true, 2], [true, 3]]) {
    stav = dalsiTempo(stav, { rezim: 'cekam', cisty, presnost: cisty ? 1 : 0.6 });
    assert.deepEqual([stav.rychlost, stav.cisteVRade, stav.hotovo], [60, n, n === 3]);
  }
});

const herniNota = (id, pitch, ms, navic = {}) => ({ id, pitch, ms, q: ms / 500, dur: 150, takt: 0, staff: 1, ...navic });

test('unison staves share one required key and keep both score ids and the longer duration', () => {
  const noty = [herniNota('a', 60, 0), herniNota('b', 60, 0, { staff: 2, dur: 300 }), herniNota('c', 60, 180)];
  const K = Hra.herniKroky(noty);
  assert.deepEqual(K.map(k => k.noty.map(n => [n.id, n.dur])), [[['a', 300]], [['c', 150]]]);
  assert.deepEqual(K[0].noty[0].souzvuk.map(n => n.id), ['b']);
  assert.equal(K[0].konec, 300);
  assert.equal(noty[0].dur, 150);
});

test('overlapping windows give the first repeat the first key, while expired notes are skipped', () => {
  const K = Hra.herniKroky([herniNota('a', 60, 0), herniNota('b', 60, 180)]);
  const zasah = (cas, hotovo = new Set()) => Hra.najdiZasah(K, { pitch: 60, cas, okno: 220, hotovo, od: 0 })?.nota.id;
  assert.equal(zasah(150), 'a');
  assert.equal(zasah(150, new Set(['a'])), 'b');
  assert.equal(zasah(221), 'b');
});

test('With backing accepts the awaited chord within its early window or as late as needed', () => {
  const K = Hra.herniKroky([herniNota('a', 60, 500), herniNota('b', 62, 680)]);
  const zasah = (pitch, cas) => Hra.najdiZasah(K, { pitch, cas, okno: 220, hotovo: new Set(), od: 0, pockej: true })?.nota.id;
  assert.equal(zasah(60, 279), undefined, 'a press during the count-in, far ahead of the note');
  assert.equal(zasah(60, 300), 'a');
  assert.equal(zasah(62, 500), undefined, 'the second step cannot jump ahead of the first');
  assert.equal(zasah(60, 1500), 'a');
});

test('section accompaniment includes the first beat during a leading rest', () => {
  const K = Hra.herniKroky([herniNota('a', 60, 3000, { takt: 1 })]);
  const udalosti = [1900, 2000, 2500, 3100, 3200].map(ms => ({ ms }));
  const zacatek = Hra.zacatekHry(K, [0, 4], q => q * 500, 1);
  assert.equal(zacatek, 2000);
  assert.deepEqual(Hra.doprovodUseku(udalosti, zacatek, 3150).map(e => e.ms), [2000, 2500, 3100]);
});

test('advance scheduling sends each event once and stays inside the requested window', () => {
  const plan = Hra.vytvorPlanZvuku([0, 2500, 3000, 9000].map(ms => ({ ms })));
  const hrano = [];
  const prehraj = e => hrano.push(e.ms);
  plan(2500, prehraj);
  assert.deepEqual(hrano, [0, 2500]);
  plan(2500, prehraj);
  plan(4500, prehraj);
  assert.deepEqual(hrano, [0, 2500, 3000]);
  plan(9000, prehraj);
  assert.deepEqual(hrano, [0, 2500, 3000, 9000]);
});

test('pattern: F instead of F# repeatedly → forgets the sharp', () => {
  const F = midi('F4'), FIS = midi('F#4');
  const z = zaznam([[0, FIS, 'vedle'], [0, midi('A4'), 'ok'], [1, midi('G4'), 'ok'], [1, FIS, 'vedle'], [2, FIS, 'ok'], [3, FIS, 'vedle']], {
    rezim: 'cekam',
    chybneStisky: [{ pitch: F, ms: 0, takt: 0, index: 0 }, { pitch: F, ms: 1800, takt: 1, index: 3 }, { pitch: F, ms: 0, takt: 3, index: 5 },
      { pitch: midi('C5'), ms: 1200, takt: 1, index: 2 }],
  });
  const v = souhrnPokusu(z).vzorce.find(x => x.typ === 'pulton');
  assert.ok(v);
  assert.equal(v.druh, 'krizek');
  assert.equal(v.ocekavano, 'Fis');
  assert.equal(v.zahrano, 'F');
  assert.equal(v.pocet, 3);
  assert.deepEqual(v.takty, [0, 1, 3]);
  assert.match(v.popis, /F místo Fis.*křížek/);
  // without a step index the expected note is found by its time in the bar
  const bezIndexu = { ...z, chybneStisky: z.chybneStisky.map(({ index, ...s }) => s) };
  assert.equal(souhrnPokusu(bezIndexu).vzorce.find(x => x.typ === 'pulton')?.ocekavano, 'Fis');
  // a single semitone miss is not a pattern
  assert.ok(!souhrnPokusu({ ...z, chybneStisky: z.chybneStisky.slice(0, 1) }).vzorce.some(x => x.typ === 'pulton'));
  // B instead of Bb → flat
  const B = midi('Bb4'), H = midi('B4');
  const zb = zaznam([[0, B, 'vedle'], [1, B, 'vedle']], { chybneStisky: [{ pitch: H, ms: 0, takt: 0 }, { pitch: H, ms: 600, takt: 1 }] });
  const vb = souhrnPokusu(zb).vzorce.find(x => x.typ === 'pulton');
  assert.deepEqual([vb.druh, vb.ocekavano, vb.zahrano], ['becko', 'B', 'H']);
});

test('patterns: skipping after a leap, rushing eighths, holding long notes too short', () => {
  const skok = souhrnPokusu(zaznam([[0, 62, 'ok'], [0, 74, 'vynechana'], [1, 62, 'ok'], [1, 72, 'vynechana'], [2, 64, 'ok'], [2, 65, 'vynechana']]));
  const vs = skok.vzorce.find(x => x.typ === 'skok');
  assert.equal(vs.pocet, 2);
  assert.deepEqual(vs.takty, [0, 1]);
  // eighths (300 ms at dobaMs 600) rush, quarters are on time
  const osm = souhrnPokusu(zaznam([
    [0, 62, 'ok', 0], [0, 64, 'ok', -60, null, 300], [0, 66, 'ok', -50, null, 300], [1, 67, 'ok', 5],
    [1, 69, 'ok', -70, null, 300], [1, 67, 'ok', -45, null, 300], [2, 66, 'ok', 0], [2, 64, 'ok', -10],
  ]));
  const sp = osm.vzorce.find(x => x.typ === 'spech');
  assert.ok(sp);
  assert.equal(sp.posunMs, -56);
  // long notes (halves, 1200 ms) held too short
  const dr = souhrnPokusu(zaznam([[0, 62, 'ok', 0, 500, 1200], [1, 64, 'ok', 0, 400, 1200], [2, 66, 'ok', 0, 1150, 1200], [3, 67, 'ok', 0, 300]]));
  const vd = dr.vzorce.find(x => x.typ === 'drzeni');
  assert.deepEqual(vd.takty, [0, 1]);
  assert.equal(vd.drzenoProcent, 38);
  // no problems, no patterns
  assert.deepEqual(souhrnPokusu(zaznam([[0, 62, 'ok'], [0, 74, 'ok'], [1, 62, 'ok']])).vzorce, []);
});

// ---------------------------------------------------------------- statistics
test('statistics: merging with decay, history, JSON', () => {
  const s1 = souhrnPokusu(zaznam([[0, 62, 'ok'], [1, 64, 'vynechana'], [1, 66, 'vynechana'], [2, 67, 'ok']]));
  const st1 = slucStatistiky(null, s1, new Date('2026-11-01T10:00:00Z'));
  assert.deepEqual(st1.takty[1], { noty: 2, chyby: 2, tony: 0, vynechane: 2, posun: 0, mereno: 0 });
  assert.equal(st1.pokusu, 1);
  const s2 = souhrnPokusu(zaznam([[0, 62, 'ok'], [1, 64, 'ok'], [1, 66, 'ok'], [2, 67, 'ok']]));
  const st2 = slucStatistiky(st1, s2, '2026-11-01T10:05:00Z');
  assert.equal(st2.takty[1].chyby, 1.6);                         // 2 × 0.8 (decay per attempt, almost no time elapsed)
  assert.equal(st2.takty[1].noty, 3.6);
  assert.equal(st2.historie.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(st2)), st2);
  assert.equal(st1.takty[1].chyby, 2, 'old statistics are not modified');
  // half weight after 30 days
  const st3 = slucStatistiky(st2, { ...s2, takty: {} , vzorce: [] }, Date.parse('2026-12-01T10:05:00Z'));
  assert.equal(st3.takty[1].chyby, 0.8);
  // bars outside the attempt are not weakened by the per-attempt decay
  const s4 = souhrnPokusu(zaznam([[3, 62, 'ok']], { od: 3, do: 3 }));
  assert.equal(slucStatistiky(st2, s4, '2026-11-01T10:06:00Z').takty[1].chyby, 1.6);
});

test('weak spots: neighbouring bars are merged, description with lyrics and the kind of mistakes', () => {
  const st = { verze: 1, pokusu: 3, posledni: 0, vzorce: {}, historie: [], takty: {
    0: { noty: 8, chyby: 0, tony: 0, vynechane: 0, posun: 0, mereno: 0 },
    4: { noty: 8, chyby: 3, tony: 3, vynechane: 0, posun: 0, mereno: 0 },
    5: { noty: 8, chyby: 2, tony: 1, vynechane: 1, posun: 0, mereno: 0 },
    8: { noty: 8, chyby: 3, tony: 0, vynechane: 3, posun: 0, mereno: 0 },
    9: { noty: 8, chyby: 0.2, tony: 0.2, vynechane: 0, posun: -800, mereno: 8 },
  } };
  const tm = tezkaMista(st, pisnicka(), 3);
  assert.deepEqual(tm.map(u => [u.od, u.do, u.druh]), [[4, 5, 'tony'], [8, 9, 'vynechane']]);
  assert.equal(tm[0].popis, 'takty 5–6: ‚Každý má je…‘ – nejčastěji spletené tóny');
  assert.equal(tm[0].takty, '5–6');
  assert.equal(tezkaMista(st, pisnicka(), 1).length, 1);
  assert.deepEqual(tezkaMista(null, pisnicka()), []);
});

// ---------------------------------------------------------------- tempo plan
test('tempo plan: 3 clean in a row +5 %, below 70 % −10 %, limits 40–100', () => {
  const cisty = { cisty: true, presnost: 1 }, spatny = { cisty: false, presnost: 0.6 }, stredni = { cisty: false, presnost: 0.85 };
  let st = { rychlost: 70, cisteVRade: 0 };
  st = dalsiTempo(st, cisty); assert.deepEqual([st.rychlost, st.cisteVRade], [70, 1]);
  st = dalsiTempo(st, cisty); assert.deepEqual([st.rychlost, st.cisteVRade], [70, 2]);
  st = dalsiTempo(st, cisty); assert.deepEqual([st.rychlost, st.cisteVRade, st.zmena], [75, 0, 5]);
  assert.match(st.zprava, /75 %/);
  st = dalsiTempo(st, cisty); st = dalsiTempo(st, stredni);
  assert.deepEqual([st.rychlost, st.cisteVRade], [75, 0], 'an unclean run resets the streak');
  st = dalsiTempo(st, spatny); assert.deepEqual([st.rychlost, st.zmena], [65, -10]);
  assert.equal(dalsiTempo({ rychlost: 45, cisteVRade: 2 }, spatny).rychlost, 40);
  assert.equal(dalsiTempo({ rychlost: 40, cisteVRade: 0 }, spatny).rychlost, 40);
  const konec = dalsiTempo({ rychlost: 100, cisteVRade: 2 }, cisty);
  assert.deepEqual([konec.rychlost, konec.hotovo], [100, true]);
  assert.equal(dalsiTempo({ rychlost: 98, cisteVRade: 2 }, cisty).rychlost, 100);
});

// ---------------------------------------------------------------- coach
function pokusSFis() {
  const F = midi('F4'), FIS = midi('F#4');
  const z = zaznam([[4, FIS, 'vedle'], [4, midi('A4'), 'ok'], [5, midi('G4'), 'ok'], [5, FIS, 'vedle'], [6, FIS, 'ok'], [7, midi('A4'), 'ok']], {
    rezim: 'cekam', od: 4, do: 7, rychlost: 70,
    chybneStisky: [{ pitch: F, ms: 0, takt: 4, index: 0 }, { pitch: F, ms: 1800, takt: 5, index: 3 }],
  });
  const souhrn = souhrnPokusu(z);
  const stat = slucStatistiky(null, souhrn, Date.parse('2026-11-01'));
  return { souhrn, stat };
}

test('facts for the coach: facts only, bar numbers, no names or lyrics', () => {
  const { souhrn, stat } = pokusSFis();
  const f = faktaProTrenera(souhrn, stat, pisnicka(), { id: 'anna', jmeno: 'Anna', zvire: 'zirafa' });
  const json = JSON.stringify(f);
  assert.ok(!/Anna|anna|zirafa|Každý|Test/.test(json), json);
  assert.equal(f.pasmo, 'dite');
  assert.equal(faktaProTrenera(souhrn, stat, pisnicka(), { vek: 40 }).pasmo, 'dospely');
  assert.deepEqual(f.usek, { od: 4, do: 7, takty: '5–8' });
  assert.deepEqual(f.vzorce[0], { typ: 'pulton', pocet: 2, takty: [5, 6], indexy: [4, 5], druh: 'krizek', ocekavano: 'Fis', zahrano: 'F' });
  assert.equal(f.trend, null, 'an identical last history record does not count towards the trend');
  assert.ok(f.useky.some(u => u.od === 4 && u.do === 7));
  assert.ok(json.length < 1500);
});

test('facts: trend and improved bars', () => {
  const { souhrn, stat } = pokusSFis();
  const lepsi = souhrnPokusu(zaznam([[4, 66, 'ok'], [4, 69, 'ok'], [5, 67, 'ok'], [5, 66, 'ok'], [6, 66, 'ok'], [7, 69, 'ok']],
    { rezim: 'cekam', od: 4, do: 7, rychlost: 70 }));
  const f = faktaProTrenera(lepsi, stat, pisnicka(), { pasmo: 'dospely' });
  assert.equal(f.trend.smer, 'lepsi');
  assert.equal(f.trend.rozdil, 33);
  assert.deepEqual(f.zlepseneTakty, [5, 6]);
  const t = textTrenera(f);
  assert.equal(t.veta, 'Takty 5 a 6 jsou teď bez chyby. Čistý průchod při 70 %.');
  assert.deepEqual(t.ukol, { od: 4, do: 7, rychlost: 70, ruka: 'prava', opakovani: 3 });
  assert.equal(souhrn.cisty, false);
});

test('template coach: child and adult tone, a concrete task, no superlatives', () => {
  const { souhrn, stat } = pokusSFis();
  const fd = faktaProTrenera(souhrn, stat, pisnicka(), { pasmo: 'dite' });
  const d = textTrenera(fd);
  assert.equal(d.veta, 'V taktech 5 a 6 hraješ F místo Fis – nezapomeň na křížek.');
  assert.equal(d.ukol.ruka, 'prava');
  assert.ok(d.ukol.od >= 4 && d.ukol.do <= 7);
  assert.ok(d.ukol.rychlost >= 40 && d.ukol.rychlost <= 70);
  const a = textTrenera({ ...fd, pasmo: 'dospely' });
  assert.match(a.veta, /zaznělo F místo Fis – chybí křížek/);
  assert.equal(a.ukol.opakovani, 5);
  for (const t of [d, a]) {
    assert.ok(t.veta.length <= 240);
    assert.ok(!/skvěl|výborn|úžasn|perfektn|nejlepš/i.test(t.veta));
  }
  // clean run at full tempo → no task
  const plne = textTrenera({ ...fd, cisty: true, rychlost: 100, vzorce: [], nejhorsiTakty: [], zlepseneTakty: [], trend: null });
  assert.equal(plne.ukol, null);
  assert.equal(plne.veta, 'Čistý průchod v plném tempu.');
  // low accuracy → slow down by 10 %
  const pomalu = textTrenera({ ...fd, presnost: 50, vzorce: [], nejhorsiTakty: [], rychlost: 60 });
  assert.equal(pomalu.ukol.rychlost, 50);
  // rhythm for an adult
  const r = textTrenera({ ...fd, pasmo: 'dospely', rezim: 'tempo', vzorce: [], nejhorsiTakty: [], spech: 'pozde', posunMs: 72, presnost: 90 });
  assert.equal(r.veta, 'Nástupy jsou v průměru o 72 ms později.');
});

test('history preserves the step supplied by a legacy summary', () => {
  const st = slucStatistiky(null, { rezim: 'tempo', krok: 'pockej', rychlost: 80, od: 0, do: 3, presnost: 1, cisty: true, takty: {} }, 1000);
  assert.equal(st.historie[0].krok, 'pockej');
});
