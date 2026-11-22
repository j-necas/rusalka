// Game flow without the DOM: scoring a finished attempt, the section loop, one frame of a running game, Find the notes
// key presses, the Learn bit by bit guide and the duet result.
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REZIM, postupHry, stiskVKroku, zlepsiVysledek, zapisUseku, dalsiKrokPruvodce } from '../static/lib/game.js';
import { vyhodnotPokus, dalsiPruchod, planPruvodce, souhrnPokusu } from '../static/lib/practice.js';
import { vyhodnotDvojici } from '../static/lib/pair.js';
import { KROKY } from '../static/lib/recommend.js';

/** attempt record: one note per step, four per bar; vysledky = 'ok' | 'vynechana' per note */
function zaznam(rezim, vysledky, chybnych = 0, extra = {}) {
  const noty = vysledky.map((v, i) => ({ takt: Math.floor(i / 4), index: i, pitch: 60 + (i % 5), ocekavanoMs: i * 500,
    zahranoMs: v === 'ok' ? i * 500 : null, vysledek: v, odchylkaMs: v === 'ok' && rezim === REZIM.TEMPO ? 0 : null,
    drzenoMs: null, ocekavanaDelkaMs: 500 }));
  const chybneStisky = Array.from({ length: chybnych }, (_, i) => ({ pitch: 80, ms: i * 500, takt: 0, index: 0 }));
  return { rezim, krok: rezim, rychlost: 80, od: 0, do: 1, ruka: 'prava', dobaMs: 500, predznamenani: 0, noty, chybneStisky, ...extra };
}
const ok = n => Array(n).fill('ok');

test('the play modes keep the stored strings and the steps use them', () => {
  assert.deepEqual({ ...REZIM }, { CEKAM: 'cekam', POCKEJ: 'pockej', TEMPO: 'tempo', POSLECH: 'poslech' });
  assert.ok(Object.isFrozen(REZIM));
  assert.deepEqual(KROKY, ['cekam', 'pockej', 'tempo']);
});

test('a clean Find the notes run earns three stars and keeps the other results of the song', () => {
  const pred = { tempo: { hvezdy: 1, procent: 40, pocet: 2 }, useky: { '0-1#2': 2 } };
  const v = vyhodnotPokus({ zaznam: zaznam(REZIM.CEKAM, ok(8)), uroven: 2, vysPisne: pred });
  assert.equal(v.dalsi, 'vysledek');
  assert.equal(v.hvezdy, 3);
  assert.equal(v.podil, 1);
  assert.equal(v.nadpis, 'Bravo, bez chyby!');
  assert.equal(v.text, 'Všech 8 not bez jediné chyby!', 'the first result is no record');
  assert.equal(v.rekord, true);
  assert.deepEqual(v.vysPisne, { ...pred, cekam: { hvezdy: 3, procent: 100, pocet: 1 } });
  assert.deepEqual(pred, { tempo: { hvezdy: 1, procent: 40, pocet: 2 }, useky: { '0-1#2': 2 } }, 'the input is not changed');
  assert.equal(v.souhrn.cisty, true);
});

test('finishing Find the notes earns a star however many keys missed; the best result stays', () => {
  const v = vyhodnotPokus({ zaznam: zaznam(REZIM.CEKAM, ok(8), 10), uroven: 2, vysPisne: { cekam: { hvezdy: 2, procent: 90, pocet: 3 } } });
  assert.equal(v.podil, 8 / 18);
  assert.equal(v.hvezdy, 1);
  assert.equal(v.nadpis, 'Dobrá práce!');
  assert.equal(v.text, 'Zahráno všech 8 not, 10× vedle.');
  assert.equal(v.rekord, false);
  assert.deepEqual(v.vysPisne.cekam, { hvezdy: 2, procent: 90, pocet: 4 });
});

test('In rhythm counts hits on time against notes and wrong keys, and reports a new record', () => {
  const v = vyhodnotPokus({ zaznam: zaznam(REZIM.TEMPO, [...ok(9), 'vynechana'], 1), uroven: 2,
    vysPisne: { tempo: { hvezdy: 1, procent: 50, pocet: 2 } } });
  assert.equal(v.podil, 9 / 11);
  assert.equal(v.hvezdy, 2);
  assert.equal(v.text, 'Včas trefeno 9 z 10 not, 1× vedle. Rychlost 80 %. Nový rekord!');
  assert.deepEqual(v.vysPisne.tempo, { hvezdy: 2, procent: 82, pocet: 3 });
  const nula = vyhodnotPokus({ zaznam: zaznam(REZIM.TEMPO, [...ok(4), ...Array(6).fill('vynechana')]), uroven: 2 });
  assert.equal(nula.hvezdy, 0, 'In rhythm has no consolation star');
  assert.equal(nula.nadpis, 'Zkus to ještě jednou');
});

test('a section keeps only its own best stars, per level', () => {
  const pred = { cekam: { hvezdy: 1, procent: 60, pocet: 1 }, useky: { '2-3#2': 3 } };
  const v = vyhodnotPokus({ zaznam: zaznam(REZIM.POCKEJ, ok(8), 2), usek: { od: 2, do: 3 }, uroven: 2, vysPisne: pred });
  assert.equal(v.hvezdy, 2);
  assert.equal(v.nadpis, 'Úsek dohrán');
  assert.equal(v.rekord, false);
  assert.deepEqual(v.vysPisne, pred, 'a weaker section run changes nothing');
  const jina = vyhodnotPokus({ zaznam: zaznam(REZIM.CEKAM, ok(8)), usek: { od: 2, do: 3 }, uroven: 1, vysPisne: pred });
  assert.equal(jina.nadpis, 'Úsek čistě!');
  assert.deepEqual(jina.vysPisne.useky, { '2-3#2': 3, '2-3#1': 3 });
  assert.equal(zapisUseku(undefined, { od: 0, do: 1 }, 2, 1).useky['0-1#2'], 1);
});

test('the guide and a running section loop decide before anything is stored', () => {
  const z = zaznam(REZIM.TEMPO, ok(8));
  const p = vyhodnotPokus({ zaznam: z, uroven: 2, pruvodce: true, smycka: { zapnuto: true, cisteVRade: 0 } });
  assert.deepEqual(Object.keys(p), ['souhrn', 'dalsi']);
  assert.equal(p.dalsi, 'pruvodce');
  assert.deepEqual(p.souhrn, souhrnPokusu(z));
  const s = vyhodnotPokus({ zaznam: z, uroven: 2, smycka: { zapnuto: true, cisteVRade: 1 } });
  assert.equal(s.dalsi, 'smycka');
  assert.equal(s.vysPisne, undefined);
  assert.deepEqual(s.pruchod.smycka, { zapnuto: true, cisteVRade: 2 });
  assert.match(s.pruchod.zprava, / · čistě 2\/3 · 80 %$/);
});

test('the section loop speeds up after three clean passes and ends at full tempo', () => {
  const cisty = rychlost => souhrnPokusu(zaznam(REZIM.TEMPO, ok(8), 0, { rychlost }));
  const rychleji = dalsiPruchod({ zapnuto: true, cisteVRade: 2 }, cisty(80));
  assert.deepEqual([rychleji.rychlost, rychleji.zmena, rychleji.hotovo], [85, 5, false]);
  assert.deepEqual(rychleji.smycka, { zapnuto: true, cisteVRade: 0 });
  assert.match(rychleji.zprava, /zrychlíme na 85 %.* · čistě 0\/3 · 85 %$/);
  const pomaleji = dalsiPruchod({ zapnuto: true, cisteVRade: 2 }, souhrnPokusu(zaznam(REZIM.TEMPO, [...ok(3), ...Array(5).fill('vynechana')])));
  assert.deepEqual([pomaleji.rychlost, pomaleji.zmena, pomaleji.smycka.cisteVRade], [70, -10, 0]);

  const v = vyhodnotPokus({ zaznam: zaznam(REZIM.TEMPO, ok(8), 0, { rychlost: 100 }), uroven: 2, smycka: { zapnuto: true, cisteVRade: 2 } });
  assert.equal(v.dalsi, 'vysledek');
  assert.deepEqual(v.pruchod.smycka, { zapnuto: false, cisteVRade: 0 });
  assert.equal(v.pruchod.zprava, 'Úsek zvládnutý v plném tempu!');
  assert.equal(v.vysPisne.tempo.hvezdy, 3);

  const najdi = dalsiPruchod({ zapnuto: true, cisteVRade: 2 }, souhrnPokusu(zaznam(REZIM.CEKAM, ok(8))));
  assert.equal(najdi.hotovo, true);
  assert.equal(najdi.rychlost, 80, 'Find the notes never changes the speed');
  assert.equal(najdi.zprava, 'Úsek jde čistě! Zkus ho teď S doprovodem.');
});

// ---------------------------------------------------------------- one frame
const krok = (ms, ...noty) => ({ ms, konec: ms + 400, vyska: new Set(noty.map(n => n.pitch)), noty });
const K = [krok(0, { id: 'a', pitch: 60 }), krok(500, { id: 'b', pitch: 62 }, { id: 'c', pitch: 64 }), krok(1000, { id: 'd', pitch: 65 })];
const zaklad = { tc: 0, okno: 220, sp: 1, konec: 1400, kontrola: 0, aktivni: -1, hotovo: new Set() };

test('In rhythm: a step whose window passed is checked, its unplayed notes are missed', () => {
  const p = postupHry(K, { ...zaklad, rezim: REZIM.TEMPO, tc: 800, tZasahu: 800, hotovo: new Set(['a', 'c']) });
  assert.equal(p.kontrola, 2);
  assert.deepEqual(p.minule.map(n => n.id), ['b']);
  assert.equal(p.aktivni, 2);
  assert.equal(p.zastavit, null);
  const kalibrace = postupHry(K, { ...zaklad, rezim: REZIM.TEMPO, tc: 800, tZasahu: 600 });
  assert.deepEqual([kalibrace.kontrola, kalibrace.minule.map(n => n.id)], [1, ['a']], 'the latency moves the window');
  const napred = postupHry(K, { ...zaklad, rezim: REZIM.TEMPO, tc: 100, hotovo: new Set(['a']) });
  assert.equal(napred.aktivni, 1, 'a step played early is no longer awaited');
  assert.equal(postupHry(K, { ...zaklad, rezim: REZIM.TEMPO, tc: 2000, kontrola: 3 }).konec, false);
  assert.equal(postupHry(K, { ...zaklad, rezim: REZIM.TEMPO, tc: 2101, kontrola: 0 }).konec, true, 'unchecked steps do not hold the end');
  assert.equal(postupHry(K, { ...zaklad, rezim: REZIM.TEMPO, tc: 2000, kontrola: 3, sp: 0.5 }).konec, true, 'the 700 ms tail is real time');
});

test('With backing: the song time stops at the awaited step and ends only after the last one', () => {
  const p = postupHry(K, { ...zaklad, rezim: REZIM.POCKEJ, tc: 520, kontrola: 1, aktivni: 0 });
  assert.equal(p.zastavit, 500);
  assert.equal(p.aktivni, 1);
  assert.deepEqual(p.minule, [], 'nothing is missed while waiting');
  assert.equal(postupHry(K, { ...zaklad, rezim: REZIM.POCKEJ, tc: 520, kontrola: 1, zastaveno: 500 }).zastavit, null);
  assert.equal(postupHry(K, { ...zaklad, rezim: REZIM.POCKEJ, tc: 480, kontrola: 1 }).zastavit, null);
  assert.equal(postupHry(K, { ...zaklad, rezim: REZIM.POCKEJ, tc: 5000, kontrola: 2 }).konec, false);
  assert.equal(postupHry(K, { ...zaklad, rezim: REZIM.POCKEJ, tc: 2101, kontrola: 3 }).konec, true);
});

test('Listen: the step under the cursor and the end of its sound', () => {
  const p = postupHry(K, { ...zaklad, rezim: REZIM.POSLECH, tc: 600 });
  assert.equal(p.aktivni, 1);
  assert.equal(p.zhasnout, false);
  assert.equal(postupHry(K, { ...zaklad, rezim: REZIM.POSLECH, tc: 880, aktivni: 1 }).zhasnout, true);
  assert.equal(postupHry(K, { ...zaklad, rezim: REZIM.POSLECH, tc: -100 }).aktivni, -1);
});

test('Find the notes: a chord is pressed key by key, a wrong key may be the right note an octave away', () => {
  const k = K[1], nic = new Set();
  const prvni = stiskVKroku(k, nic, 62);
  assert.deepEqual([prvni.druh, prvni.nota.id, [...prvni.stisknute]], ['nota', 'b', [62]]);
  assert.equal(nic.size, 0, 'the pressed keys are a new set');
  assert.equal(stiskVKroku(k, prvni.stisknute, 62).druh, 'znovu');
  const druhy = stiskVKroku(k, prvni.stisknute, 64);
  assert.deepEqual([druhy.druh, druhy.nota.id], ['krok', 'c']);
  assert.deepEqual([stiskVKroku(k, nic, 74).druh, stiskVKroku(k, nic, 74).jinaOktava], ['vedle', true]);
  assert.equal(stiskVKroku(k, nic, 63).jinaOktava, false);
  assert.equal(stiskVKroku(K[0], nic, 60).druh, 'krok');
});

test('best result of a mode', () => {
  assert.deepEqual(zlepsiVysledek(undefined, 2, 0.84), { vysledek: { hvezdy: 2, procent: 84, pocet: 1 }, rekord: true });
  assert.deepEqual(zlepsiVysledek({ hvezdy: 3, procent: 90, pocet: 5, part: 'bas' }, 1, 0.96),
    { vysledek: { hvezdy: 3, procent: 96, pocet: 6, part: 'bas' }, rekord: false });
});

// ---------------------------------------------------------------- guide
test('the guide repeats a step until it is clean or nearly clean three times, then moves on to the end', () => {
  const P = { plan: [{ rezim: REZIM.POSLECH }, { rezim: REZIM.CEKAM }, { rezim: REZIM.TEMPO, posledni: true }], i: 0, pokusu: 0 };
  assert.deepEqual(dalsiKrokPruvodce(P, null), { akce: 'dalsi', pruvodce: { ...P, i: 1, pokusu: 0 }, toast: 'app.tedTy' });
  const krok1 = { ...P, i: 1 };
  const skoro = { cisty: false, presnost: 0.9 };
  const a = dalsiKrokPruvodce(krok1, skoro);
  assert.deepEqual([a.akce, a.pruvodce.pokusu, a.toast], ['opakuj', 1, 'app.skoro']);
  assert.equal(krok1.pokusu, 0, 'the state is not changed');
  assert.equal(dalsiKrokPruvodce({ ...krok1, pokusu: 1 }, { cisty: false, presnost: 0.5 }).toast, 'app.klidne');
  assert.deepEqual(dalsiKrokPruvodce({ ...krok1, pokusu: 2 }, skoro), { akce: 'dalsi', pruvodce: { ...P, i: 2, pokusu: 0 }, toast: 'app.jdemeDal' });
  assert.equal(dalsiKrokPruvodce({ ...krok1, pokusu: 5 }, { cisty: false, presnost: 0.84 }).akce, 'opakuj');
  assert.deepEqual(dalsiKrokPruvodce({ ...P, i: 2 }, { cisty: true, presnost: 1 }), { akce: 'hotovo', pruvodce: null, toast: null });
});

test('the guide plan: each phrase listened, found and played with backing, pairs joined, then the whole song', () => {
  const takt = { akordy: [], noty: [{ t: 'C4', d: '1/4', lig: false, s: '' }, { t: 'D4', d: '1/4', lig: false, s: '' }, { t: 'r', d: '1/2', lig: false, s: '' }] };
  const pisen = { nazev: 'Test', autor: '', klic: 'houslovy', predznamenani: 0, takt: '4/4', tempo: 100, takty: Array(8).fill(takt) };
  const plan = planPruvodce(pisen);
  assert.deepEqual(plan.map(k => [k.rezim, k.od, k.do ?? null, k.rychlost ?? null]), [
    ['poslech', 0, 3, null], ['cekam', 0, 3, null], ['pockej', 0, 3, 70],
    ['poslech', 4, 7, null], ['cekam', 4, 7, null], ['pockej', 4, 7, 70], ['pockej', 0, 7, 70],
    ['pockej', null, null, 70], ['tempo', null, null, 70],
  ]);
  assert.equal(plan[1].text, 'Najdi noty: takty 1–4');
  assert.equal(plan[6].text, 'Spoj takty 1–8');
  assert.deepEqual(plan.map(k => !!k.posledni), [...Array(8).fill(false), true]);
});

// ---------------------------------------------------------------- duet
test('a duet stores each child’s own stars under dvojice and leaves the solo results', () => {
  const noty = [{ id: 'm1', pitch: 60, staff: 1 }, { id: 'm2', pitch: 62, staff: 1 }, { id: 'b1', pitch: 48, staff: 2 }, { id: 'b2', pitch: 43, staff: 2 }];
  const zaznamNot = new Map([['m1', {}], ['m2', {}], ['b1', {}]]);
  const vysledky = { A: { cekam: { hvezdy: 3, procent: 100, pocet: 1 }, dvojice: { tempo: { hvezdy: 3, procent: 100, pocet: 1, part: 'melodie', s: 'B' } } } };
  const d = vyhodnotDvojici({ noty, zaznam: zaznamNot, chybneStisky: [{ pitch: 40 }], rezim: REZIM.TEMPO, hranice: 54,
    dvojice: { melodie: 'A', bas: 'B' }, vysledky });
  assert.deepEqual(d.hraci.map(x => [x.part, x.id, x.tr, x.v.hvezdy]), [['bas', 'B', 'b', 0], ['melodie', 'A', 'a', 3]]);
  assert.equal(d.hraci[0].veta, 'Bas: včas 1 z 2 not, 1× vedle.');
  assert.equal(d.cisti, false);
  assert.deepEqual(d.zapisy.A, { cekam: { hvezdy: 3, procent: 100, pocet: 1 },
    dvojice: { tempo: { hvezdy: 3, procent: 100, pocet: 2, part: 'melodie', s: 'B' } } });
  assert.deepEqual(d.zapisy.B, { dvojice: { tempo: { hvezdy: 0, procent: 33, pocet: 1, part: 'bas', s: 'A' } } });
  assert.equal(vysledky.A.dvojice.tempo.pocet, 1, 'the input is not changed');

  const usek = vyhodnotDvojici({ noty: noty.filter(n => n.staff === 1), zaznam: new Map(), chybneStisky: [], rezim: REZIM.CEKAM,
    hranice: 54, dvojice: { melodie: 'A', bas: 'B' }, usek: { od: 0, do: 1 } });
  assert.deepEqual(usek.zapisy, {}, 'a section is not stored');
  assert.equal(usek.hraci[0].v, null);
  assert.equal(usek.hraci[0].veta, 'Bas: v tomhle úseku nehraješ.');
  assert.equal(usek.hraci[1].veta, 'Melodie: všech 2 not bez chyby!');
  assert.equal(usek.cisti, true);
});
