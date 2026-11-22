import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { kontrola, naMusicXml, zMusicXml, kopie } from '../static/lib/song.js';
import { porovnej, rozdilyCteni, slucCteni, souhrnText, udalosti } from '../static/lib/compare.js';

const n = (t, d, extra = {}) => ({ t, d, lig: false, s: '', ...extra });
const zaklad = (takty, extra = {}) => ({ nazev: 'Test', autor: '', klic: 'houslovy', predznamenani: 2, takt: '3/4', tempo: 90, takty, ...extra });

// deterministic 16-bar "song": similar motifs, various pitches, syllables and chords
function pisen(pocet = 16) {
  const tony = ['D4', 'E4', 'F#4', 'G4', 'A4', 'B4', 'C#5', 'D5'];
  const rytmy = [['1/4', '1/4', '1/4'], ['3/8', '1/8', '1/4'], ['1/8', '1/8', '1/4', '1/4'], ['1/2', '1/4']];
  const akordy = ['D', 'G', 'A7', 'Hmi'];
  let x = 7;
  const nahoda = k => { x = (x * 1103515245 + 12345) % 2147483648; return x % k; };
  const takty = [];
  for (let i = 0; i < pocet; i++) {
    const r = rytmy[nahoda(rytmy.length)];
    takty.push({
      akordy: [{ doba: 0, znacka: akordy[nahoda(4)] }],
      noty: r.map((d, k) => n(tony[nahoda(tony.length)], d, { s: `s${i}${k}` })),
    });
  }
  return zaklad(takty);
}

const vsechno100 = v => {
  assert.equal(v.presnostTaktu, 1);
  assert.equal(v.presnostVysek, 1);
  assert.equal(v.presnostDelek, 1);
  assert.equal(v.presnostNot, 1);
  assert.deepEqual(v.rozdily, []);
};

test('events: a tie of the same pitch and adjacent rests are merged', () => {
  const e = udalosti([n('E4', '1/4', { lig: true }), n('E4', '1/8'), n('r', '1/8'), n('r', '1/4'), n('C4 E4', '1/4', { lig: true }), n('D4', '1/4')]);
  assert.deepEqual(e.map(x => [x.pos, x.d, x.t]), [[0, 1.5, 'E4'], [1.5, 1.5, 'r'], [3, 1, 'C4 E4'], [4, 1, 'D4']]);
});

test('identical models → 100 %', () => {
  const p = pisen();
  const v = porovnej(p, kopie(p));
  vsechno100(v);
  assert.equal(v.taktuVzor, 16);
  assert.equal(v.shodnychTaktu, 16);
  assert.equal(v.presnostAkordu, 1);
  assert.equal(v.presnostSlabik, 1);
  assert.deepEqual(v.zarovnani, p.takty.map((_, i) => [i, i]));
  assert.match(souhrnText(v), /^Takty 16\/16 \(100 %\), výšky 100 %, délky 100 %, akordy 100 %, slabiky 100 %/);
  assert.match(souhrnText(v), /Bez rozdílů\./);
});

test('one changed pitch', () => {
  const p = zaklad([
    { akordy: [], noty: [n('D4', '1/4'), n('F#4', '1/4'), n('A4', '1/4')] },
    { akordy: [], noty: [n('B4', '1/2'), n('A4', '1/4')] },
  ]);
  const t = kopie(p);
  t.takty[0].noty[1].t = 'E4';
  const v = porovnej(p, t);
  assert.equal(v.rozdily.length, 1);
  assert.equal(v.rozdily[0].popis, 'takt 1: E4 místo F#4 na 2. době');
  assert.deepEqual([v.rozdily[0].taktVzor, v.rozdily[0].taktTest, v.rozdily[0].druh], [0, 0, 'vyska']);
  assert.equal(v.shodnychTaktu, 1);
  assert.equal(v.presnostDelek, 1);
  assert.equal(v.presnostVysek, 4 / 5);
  assert.deepEqual(v.noty, { vzor: 5, test: 5, sparovano: 5, shoda: 4 });
});

test('missing dot: 1/4 instead of 3/8, the next note does not cascade into pitch errors', () => {
  const p = zaklad([{ akordy: [], noty: [n('E4', '3/8'), n('F#4', '1/8'), n('G4', '1/4')] }]);
  const t = zaklad([{ akordy: [], noty: [n('E4', '1/4'), n('F#4', '1/4'), n('G4', '1/4')] }]);
  const v = porovnej(p, t);
  assert.equal(v.presnostVysek, 1);
  assert.deepEqual(v.rozdily.map(r => r.popis), [
    'takt 1: chybí tečka – 1/4 místo 3/8 (E4 na 1. době)',
    'takt 1: délka 1/4 místo 1/8 (F#4 na 2. době + 1/8)',
  ]);
  assert.match(porovnej(t, p).rozdily[0].popis, /tečka navíc – 3\/8 místo 1\/4/);
});

test('a missing bar in the middle does not turn the rest into errors', () => {
  const p = pisen(20);
  const t = kopie(p);
  t.takty.splice(9, 1);
  const v = porovnej(p, t);
  assert.deepEqual(v.rozdily.map(r => r.popis), ['chybí takt 10']);
  assert.equal(v.shodnychTaktu, 19);
  assert.equal(v.chybejicichTaktu, 1);
  assert.ok(v.zarovnani.some(([a, b]) => a === 9 && b === null));
  assert.deepEqual(v.zarovnani.find(([a]) => a === 15), [15, 14]);
  assert.equal(v.presnostTaktu, 19 / 20);
  assert.match(souhrnText(v), /vzor má 20 taktů, test 19, chybí 1/);
});

test('extra bar', () => {
  const p = pisen(12);
  const t = kopie(p);
  t.takty.splice(5, 0, { akordy: [], noty: [n('G4', '3/4', { s: 'la' })] });
  const v = porovnej(p, t);
  assert.deepEqual(v.rozdily.map(r => r.popis), ['takt navíc za taktem 5 (v testu takt 6)']);
  assert.equal(v.shodnychTaktu, 12);
  assert.equal(v.taktuNavic, 1);
  assert.deepEqual(v.rozdily[0].taktTest, 5);
});

test('enharmonic swap, order within a chord and chord spelling count as a match', () => {
  const p = zaklad([{ akordy: [{ doba: 0, znacka: 'Hmi' }, { doba: 2, znacka: 'F#7' }], noty: [n('F#4', '1/4'), n('C4 E4 G4', '1/4'), n('A#4', '1/4')] }]);
  const t = zaklad([{ akordy: [{ doba: 0, znacka: 'Bm' }, { doba: 2, znacka: 'Gb7' }], noty: [n('Gb4', '1/4'), n('G4 C4 E4', '1/4'), n('Bb4', '1/4')] }]);
  const v = porovnej(p, t);
  vsechno100(v);
  assert.equal(v.presnostAkordu, 1);
  t.takty[0].akordy[0].znacka = 'D';
  assert.equal(porovnej(p, t).rozdily[0].popis, 'takt 1: akord D místo Hmi na 1. době');
});

test('tie vs. dotted note is a match', () => {
  const p = zaklad([{ akordy: [], noty: [n('E4', '3/8', { s: 'lá' }), n('F#4', '1/8'), n('G4', '1/4')] }]);
  const t = zaklad([{ akordy: [], noty: [n('E4', '1/4', { s: 'lá', lig: true }), n('E4', '1/8'), n('F#4', '1/8'), n('G4', '1/4')] }]);
  vsechno100(porovnej(p, t));
  t.takty[0].noty[0].lig = false;                  // without the tie it is a different rhythm
  assert.ok(porovnej(p, t).rozdily.length > 0);
});

test('a repeat with signs vs. written out by hand is a match after unfolding', () => {
  const p = pisen(6);
  const sZnackami = kopie(p);
  sZnackami.takty[1].znacky = { zacatekRepetice: true };
  sZnackami.takty[3].znacky = { konecRepetice: true };
  const rozepsana = kopie(p);
  rozepsana.takty.splice(4, 0, ...kopie(p.takty.slice(1, 4)));
  const v = porovnej(sZnackami, rozepsana);
  vsechno100(v);
  assert.equal(v.taktuVzor, 9);
  assert.deepEqual(v.poradiVzor, [0, 1, 2, 3, 1, 2, 3, 4, 5]);
  const bez = porovnej(sZnackami, rozepsana, { rozvinout: false });
  assert.equal(bez.taktuNavic, 3);
});

test('ruka option: left hand and both hands', () => {
  const p = zaklad([{ akordy: [], noty: [n('D4', '3/4')], leva: [n('D3', '1/4'), n('A2', '1/2')] }]);
  const t = kopie(p);
  t.takty[0].leva[1].t = 'A3';
  vsechno100(porovnej(p, t));
  assert.equal(porovnej(p, t, { ruka: 'l' }).rozdily[0].popis, 'takt 1: A3 místo A2 na 2. době');
  assert.equal(porovnej(p, t, { ruka: 'obe' }).rozdily[0].popis, 'takt 1: levá ruka – A3 místo A2 na 2. době');
});

test('missing and extra note, syllable', () => {
  const p = zaklad([{ akordy: [], noty: [n('D4', '1/4', { s: 'Hvěz-' }), n('E4', '1/4', { s: 'di-' }), n('F#4', '1/4', { s: 'čky' })] }]);
  const t = zaklad([{ akordy: [], noty: [n('D4', '1/2', { s: 'Hvěz-' }), n('F#4', '1/4', { s: 'čka' })] }]);
  const v = porovnej(p, t);
  assert.deepEqual(v.rozdily.map(r => r.popis), [
    'takt 1: délka 1/2 místo 1/4 (D4 na 1. době)',
    'takt 1: chybí E4 1/4 na 2. době',
    'takt 1: slabika „čka“ místo „čky“ (F#4 na 3. době)',
  ]);
  assert.deepEqual(v.slabiky, { vzor: 3, test: 2, shoda: 1 });
  assert.equal(v.presnostSlabik, 1 / 3);
});

test('rozdilyCteni finds exactly the changed bars', () => {
  const a = pisen(10);
  const b = kopie(a);
  b.takty[1].noty[0].t = b.takty[1].noty[0].t === 'D4' ? 'E4' : 'D4';
  b.takty[4].noty[1].s = 'jiná';
  b.takty[6].akordy[0].znacka = b.takty[6].akordy[0].znacka === 'D' ? 'G' : 'D';
  b.takty[8].znacky = { konecRepetice: true };
  const r = rozdilyCteni(a, b);
  assert.deepEqual(r.map(x => x.takt), [1, 4, 6, 8]);
  assert.deepEqual(r.map(x => x.druhy), [['vysky'], ['slabiky'], ['akordy'], ['znacky']]);
  assert.match(r[0].popis, /^takt 2: výška na 1\. době: A \S+, B \S+$/);
  assert.deepEqual(rozdilyCteni(a, kopie(a)), []);
  // an extra bar in b and a missing one in b
  const c = kopie(a);
  c.takty.splice(3, 1);
  c.takty.splice(6, 0, { akordy: [], noty: [n('C#5', '3/4')] });
  const r2 = rozdilyCteni(a, c);
  assert.deepEqual(r2.map(x => [x.takt, x.taktB, x.druhy[0]]), [[3, null, 'takt'], [null, 6, 'takt']]);
  assert.equal(r2[1].zaTaktem, 6);
});

test('slucCteni: takes matching bars, differing ones by decision, the rest uncertain', () => {
  const a = pisen(10);
  const b = kopie(a);
  b.takty[1].noty[0].t = 'C#5';
  b.takty[4].noty[1].s = 'jiná';
  b.takty[6].akordy[0].znacka = 'Hmi7';
  const snimekA = JSON.stringify(a), snimekB = JSON.stringify(b);

  const bez = slucCteni(a, b);
  assert.deepEqual(bez.nejiste, [1, 4, 6]);
  assert.deepEqual(bez.pisen.takty, a.takty);
  assert.equal(bez.pisen.nejistoty.length, 3);
  assert.match(bez.pisen.nejistoty[0], /^takt 2: čtení se liší – /);

  const vlastni = { akordy: [{ doba: 0, znacka: 'G' }], noty: [n('G4', '3/4', { s: 'hm' })] };
  const s = slucCteni(a, b, { 1: 'b', 4: vlastni, 6: 'a' });
  assert.deepEqual(s.nejiste, []);
  assert.deepEqual(s.pisen.takty[1], b.takty[1]);
  assert.deepEqual(s.pisen.takty[4], vlastni);
  assert.deepEqual(s.pisen.takty[6], a.takty[6]);
  assert.equal(s.pisen.nejistoty, undefined);
  assert.notEqual(s.pisen.takty[1], b.takty[1]);              // a copy, not a shared object
  // inputs unchanged
  assert.equal(JSON.stringify(a), snimekA);
  assert.equal(JSON.stringify(b), snimekB);
  // the result passes the check and a lossless MusicXML round trip
  for (const p of [bez.pisen, s.pisen]) {
    assert.deepEqual(kontrola(p), []);
    const zpet = zMusicXml(naMusicXml(p));
    assert.deepEqual(rozdilyCteni(p, zpet), []);
    vsechno100(porovnej(p, zpet));
  }
});

test('slucCteni: a bar only in b is inserted only on request, a bar only in a can be left out', () => {
  const a = pisen(12);
  const b = kopie(a);
  const navic = { akordy: [], noty: [n('C#5', '3/4')] };
  b.takty.splice(3, 0, navic);
  b.takty.splice(9, 1);                                          // the original a[8]
  const s = slucCteni(a, b);
  assert.deepEqual(s.navicB, [3]);
  assert.deepEqual(s.nejiste, [8]);
  assert.deepEqual(s.pisen.takty, a.takty);
  const s2 = slucCteni(a, b, { b3: 'b', 8: 'b' });
  assert.deepEqual(s2.pisen.takty, [...a.takty.slice(0, 3), navic, ...a.takty.slice(3, 8), ...a.takty.slice(9)]);
  assert.deepEqual(s2.nejiste, []);
  assert.deepEqual(s2.navicB, []);
});

test('the merged model renders in Verovio', async () => {
  const { default: createVerovioModule } = await import('verovio/wasm');
  const { VerovioToolkit } = await import('verovio/esm');
  const tk = new VerovioToolkit(await createVerovioModule());
  const a = pisen(8), b = kopie(a);
  b.takty[2].noty[0].t = 'C#5';
  assert.ok(tk.loadData(naMusicXml(slucCteni(a, b, { 2: 'b' }).pisen)));
});

test('real song: 100 % against itself, against a damaged copy only the damaged spots', () => {
  // a private song in 3/8 with chords and lyrics, longer than 45 bars (only when available; its title is not in the repository)
  const d = new URL('../private/songs/', import.meta.url);
  if (!existsSync(d)) return;
  const p = readdirSync(d).filter(x => x.endsWith('.musicxml')).map(x => zMusicXml(readFileSync(new URL(x, d), 'utf8')))
    .find(q => q.takt === '3/8' && q.takty.length > 45 && q.takty.some(t => t.akordy.length));
  if (!p) return;
  const v = porovnej(p, zMusicXml(naMusicXml(p)));
  vsechno100(v);
  assert.equal(v.presnostAkordu, 1);
  assert.equal(v.presnostSlabik, 1);

  const t = kopie(p);
  const k = t.takty.findIndex((x, i) => i > 10 && x.noty.length === 3 && x.noty[1].t !== 'r');
  t.takty[k].noty[1].t = t.takty[k].noty[1].t === 'A4' ? 'B4' : 'A4';     // changed pitch
  t.takty.splice(30, 1);                                                    // missing bar 31
  const j = t.takty.findIndex((x, i) => i > 40 && x.noty.length === 1 && x.noty[0].d === '3/8');
  t.takty[j].noty = [n(t.takty[j].noty[0].t, '1/4', { s: t.takty[j].noty[0].s, lig: true }), n(t.takty[j].noty[0].t, '1/8')];  // tie instead of a dot
  const w = porovnej(p, t);
  assert.ok(w.rozdily.some(r => r.popis === 'chybí takt 31'), JSON.stringify(w.rozdily));
  assert.ok(w.rozdily.some(r => r.taktVzor === k && r.druh === 'vyska'), JSON.stringify(w.rozdily));
  assert.equal(w.rozdily.length, 2, JSON.stringify(w.rozdily));
  assert.equal(w.shodnychTaktu, p.takty.length - 2);
  assert.ok(w.presnostVysek < 1 && w.presnostVysek > 0.95);
  assert.ok(!w.rozdily.some(r => r.druh === "delka"));          // tie = dot; only the missing bar lowers the durations score
  assert.equal(souhrnText(w).split('\n').length, 3);
  assert.deepEqual(rozdilyCteni(p, t).map(r => r.takt), [k, 30]);
});

test('the editor comparison renders both details and summary in English', async () => {
  const { nastavJazyk } = await import('../static/lib/texts.js');
  nastavJazyk('en');
  try {
    const p = zaklad([{ noty: [n('C4', '1/4'), n('D4', '1/4'), n('E4', '1/4')] }]);
    const q = kopie(p); q.takty[0].noty[0].t = 'D4';
    const s = souhrnText(porovnej(p, q));
    assert.match(s, /^Bars 0\/1/);
    assert.match(s, /bar 1: D4 instead of C4 on beat 1/);
  } finally {
    nastavJazyk('cs');
  }
});
