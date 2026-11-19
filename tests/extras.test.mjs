import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { kontrola, naMusicXml, zMusicXml, kopie, vysky, zlomek, metrum } from '../static/lib/song.js';
import { fraze } from '../static/lib/practice.js';
import {
  faktaPisne, sablonaPruvodce,
  faktaNoty, OTAZKY, otazkyProNotu, odpovedSablonou,
  faktaPrednesu, sablonaPrednesu,
  STYLY, ROLE_TONU, vzorProTakt, doprovodVeStylu, vzorNaDoprovod,
  TEMATA, sablonaNovePisne,
  faktaTydne, sablonaTydne,
  motiv, nahodnyMotiv, porovnejOzvenu,
} from '../static/lib/extras.js';

const n = (t, d, s = '', extra = {}) => ({ t, d, lig: false, s, ...extra });
const q = (t, s = '') => n(t, '1/4', s);
const ak = (...a) => a.map(([doba, znacka]) => ({ doba, znacka }));

/**
 * artificial song in D major (9 bars): bars 5–6 repeat 1–2 with different lyrics, an octave leap in bar 3,
 * a dotted quarter in bar 7, an accidental G# + sixteenths + a natural in bar 8
 */
function pisnicka() {
  return {
    nazev: 'Testovací', autor: 'Jan Novák', klic: 'houslovy', predznamenani: 2, takt: '4/4', tempo: 96, takty: [
      { akordy: ak([0, 'D']), noty: [q('D4', 'Ve-'), q('F#4', 'čer'), q('A4', 'pa-'), q('F#4', 'dá')] },
      { akordy: ak([0, 'G']), noty: [q('G4', 'na'), q('B4', 'tmavý'), n('A4', '1/2', 'les,')] },
      { akordy: ak([0, 'A7']), noty: [q('A4', 'hvěz-'), q('A5', 'dy'), q('G5', 'svítí'), q('E5', 'nám.')] },
      { akordy: ak([0, 'D']), noty: [n('D5', '1/2', 'Hej!'), n('r', '1/2')] },
      { akordy: ak([0, 'D']), noty: [q('D4', 'Ráno'), q('F#4', 'je'), q('A4', 'ti-'), q('F#4', 'cho')] },
      { akordy: ak([0, 'G']), noty: [q('G4', 'jen'), q('B4', 'ptáci'), n('A4', '1/2', 'zpívají,')] },
      { akordy: ak([0, 'Bm']), noty: [n('B4', '3/8'), n('C#5', '1/8'), q('D5'), q('B4')] },
      { akordy: ak([0, 'E7'], [2, 'A7']), noty: [n('G#4', '1/16'), n('A4', '1/16'), n('B4', '1/16'), n('G#4', '1/16'), q('A4'),
        n('E4', '1/8'), n('F#4', '1/8'), n('G4', '1/8'), n('A4', '1/8')] },
      { akordy: ak([0, 'D']), noty: [n('D4', '1/1')] },
    ],
  };
}
const valcik = () => ({
  nazev: 'Valčík', autor: '', klic: 'houslovy', predznamenani: 0, takt: '3/4', tempo: 120, takty: [
    { akordy: ak([0, 'C']), noty: [n('E4', '1/2'), q('G4')] },
    { akordy: ak([0, 'G7']), noty: [q('F4'), q('D4'), q('B3')] },
    { akordy: ak([0, 'G']), noty: [n('D4', '1/2'), q('G4')] },
    { akordy: ak([0, 'C']), noty: [n('C4', '3/4')] },
  ],
});
const sestOsmin = () => ({
  nazev: 'Kolébka', autor: '', klic: 'houslovy', predznamenani: -1, takt: '6/8', tempo: 80, takty: [
    { akordy: ak([0, 'F']), noty: [q('A4'), n('G4', '1/8'), q('F4'), n('A4', '1/8')] },
    { akordy: ak([0, 'C7']), noty: [n('G4', '3/8'), n('E4', '3/8')] },
    { akordy: ak([0, 'F']), noty: [n('F4', '3/4')] },
  ],
});
const bezAkordu = () => {
  const p = pisnicka();
  for (const t of p.takty) t.akordy = [];
  return p;
};

const soukrome = () => {
  const d = new URL('../private/songs/', import.meta.url);
  if (!existsSync(d)) return [];
  return readdirSync(d).filter(f => f.endsWith('.musicxml')).map(f => ({ f, p: zMusicXml(readFileSync(new URL(f, d), 'utf8')) }));
};
const levaJako = p => p.takty.map(t => (t.leva || []).map(x => [x.t, x.d, !!x.lig]));
function roundTrip(p) {
  const z = zMusicXml(naMusicXml(p));
  assert.deepEqual(levaJako(z), levaJako(p), 'left hand unchanged after MusicXML');
  assert.deepEqual(z.takty.map(t => t.noty.map(x => [x.t, x.d, x.s])), p.takty.map(t => t.noty.map(x => [x.t, x.d, x.s])));
  assert.deepEqual(kontrola(z), []);
}
let tk = null;
async function verovio() {
  if (tk) return tk;
  const { default: createVerovioModule } = await import('verovio/wasm');
  const { VerovioToolkit } = await import('verovio/esm');
  tk = new VerovioToolkit(await createVerovioModule());
  return tk;
}

// ================================================================ song guide
test('test songs are valid', () => {
  for (const p of [pisnicka(), valcik(), sestOsmin()]) assert.deepEqual(kontrola(p), []);
});

test('faktaPisne: key, time signature, tempo, range, leaps, repetition, chords, hard spots', () => {
  const p = pisnicka(), puvodni = kopie(p);
  const F = faktaPisne(p, { pasmo: 'dospely' });
  assert.deepEqual(p, puvodni, 'input is not modified');
  assert.equal(F.tonina.nazev, 'D dur');
  assert.deepEqual(F.tonina.predznamenani.tony.map(t => t.jmeno), ['fis', 'cis']);
  assert.equal(F.takt.popis, 'čtyři čtvrťové doby v taktu');
  assert.equal(F.tempo.nazev, 'Andante');
  assert.equal(F.rozsah.nejnizsi.cesky, 'd1');
  assert.equal(F.rozsah.nejvyssi.cesky, 'a2');
  assert.equal(F.rozsah.presne, 'čistá duodecima');
  assert.deepEqual([F.skoky[0].takt, F.skoky[0].interval, F.skoky[0].smer, F.skoky[0].z.cesky, F.skoky[0].na.cesky],
    [3, 'oktáva', 'nahoru', 'a1', 'a2']);
  assert.deepEqual(F.opakovani[0], { takty: '1–2', znovu: ['5–6'], delka: 2, kolikrat: 2 });
  assert.equal(F.akordy.pocet, 5);
  assert.deepEqual([F.akordy.nejcastejsi[0].znacka, F.akordy.nejcastejsi[0].funkce, F.akordy.nejcastejsi[0].kolikrat], ['D', 'tónika', 4]);
  assert.equal(F.akordy.vsechny.find(a => a.znacka === 'Bm').cesky, 'Hmi');
  assert.equal(F.akordy.vsechny.find(a => a.znacka === 'Bm').stupen, 'vi');
  assert.equal(F.akordy.vsechny.find(a => a.znacka === 'A7').stupen, 'V7');
  const t8 = F.tezkaMista.find(m => m.takt === 8);
  assert.ok(t8, 'bar 8 is hard');
  assert.deepEqual(t8.duvody.find(d => d.typ === 'posuvka').tony.map(t => t.jmeno), ['gis']);
  assert.ok(t8.duvody.some(d => d.typ === 'rychle'));
  assert.ok(F.tezkaMista.some(m => m.takt === 3 && m.duvody.some(d => d.typ === 'skok' && d.interval === 'oktáva')));
  assert.equal(F.nazev, 'Testovací');
  assert.equal(F.zacatekTextu, 'Večer padá na tmavý…');
  assert.ok(!JSON.stringify(F).includes('Novák'), 'the author (a person\'s name) is not included in the facts');
  const bez = faktaPisne(p, { text: false });
  assert.equal(bez.nazev, undefined);
  assert.equal(bez.zacatekTextu, undefined);
  assert.equal(bez.pasmo, 'dite', 'the default age band is child');
});

test('faktaPisne: structure – the same melody with different lyrics = verse, with the same lyrics = chorus', () => {
  const p = pisnicka();
  const F = faktaPisne(p);
  assert.ok(F.struktura.casti.length >= 2);
  assert.match(F.struktura.schema, /^[A-Z]/);
  // chorus: repeat the first four bars including lyrics
  const r = pisnicka();
  r.takty.splice(4, 0, ...kopie(r.takty.slice(0, 4)));
  const R = faktaPisne(r);
  assert.ok(R.struktura.refren.includes('1–4') || R.struktura.casti.some(c => c.text === 'stejny'), JSON.stringify(R.struktura));
  assert.match(R.struktura.odhad, /refrén/);
});

test('sablonaPruvodce passes validation (child and adult) and mentions the facts', () => {
  const F = faktaPisne(pisnicka(), { pasmo: 'dospely' });
  const s = sablonaPruvodce(F);
  assert.ok(s.odstavce.length >= 3);
  assert.match(s.odstavce[0], /D dur/);
  assert.match(s.odstavce[1], /taktu 3/);
  assert.ok(s.tipy.some(t => /Takt 8/.test(t)));
  const D = faktaPisne(pisnicka(), { pasmo: 'dite' });
  const sd = sablonaPruvodce(D);
  for (const veta of [...sd.odstavce, ...sd.tipy].join(' ').split(/(?<=[.!?])\s+/)) assert.ok(veta.split(/\s+/).length <= 14, veta);
});

test('guide on real songs: facts and templates (only when available)', () => {
  for (const { f, p } of soukrome()) {
    for (const pasmo of ['dite', 'dospely']) {
      const F = faktaPisne(p, { pasmo });
      assert.ok(F.tonina.nazev && F.rozsah, f);
      assert.ok(sablonaPruvodce(F).odstavce.length >= 2, `${f} ${pasmo}`);
    }
  }
});

// ================================================================ ask about a note
test('faktaNoty: tone, duration, accidental from the key signature, chord and interval', () => {
  const p = pisnicka(), puvodni = kopie(p);
  const F = faktaNoty(p, 0, 1, 'prava', { pasmo: 'dospely' });
  assert.deepEqual(p, puvodni);
  assert.equal(F.takt, 1);
  assert.deepEqual([F.tony[0].jmeno, F.tony[0].cesky, F.tony[0].klavesa], ['fis', 'fis1', 'černá']);
  assert.deepEqual(F.tony[0].posuvka, { zdroj: 'predznamenani', znamenko: 'křížek', napsana: false });
  assert.deepEqual([F.delka.nazev, F.delka.text], ['čtvrťová', 'jednu dobu']);
  assert.deepEqual([F.akord.znacka, F.akord.funkce, F.akord.patri, F.akord.role], ['D', 'tónika', true, 'tercie']);
  assert.deepEqual([F.odPredchozi.presne, F.odPredchozi.smer], ['velká tercie', 'nahoru']);
  assert.deepEqual(F.doba, { cislo: 2, naDobu: true, dobVTaktu: 4 });
  // octave leap
  assert.equal(faktaNoty(p, 2, 1).odPredchozi.presne, 'čistá oktáva');
  // dotted quarter, chord Bm
  const t7 = faktaNoty(p, 6, 0);
  assert.deepEqual([t7.delka.nazev, t7.delka.text, t7.akord.cesky], ['čtvrťová s tečkou', 'jednu a půl doby', 'Hmi']);
  assert.equal(faktaNoty(p, 6, 1).doba.naDobu, false);
  // accidental, valid until the end of the bar, natural
  assert.equal(faktaNoty(p, 7, 0).tony[0].posuvka.zdroj, 'nahodna');
  assert.equal(faktaNoty(p, 7, 0).delka.text, 'čtvrt doby');
  assert.equal(faktaNoty(p, 7, 3).tony[0].posuvka.zdroj, 'plati-v-taktu');
  assert.deepEqual(faktaNoty(p, 7, 7).tony[0].posuvka, { zdroj: 'nahodna', znamenko: 'odrážka', napsana: true });
  // the chord changes mid-bar
  assert.equal(faktaNoty(p, 7, 4).akord.znacka, 'E7');
  assert.equal(faktaNoty(p, 7, 5).akord.znacka, 'A7');
  // a rest and a non-existent note
  const r = faktaNoty(p, 3, 1);
  assert.deepEqual([r.pomlka, r.delka.nazev, r.tony.length], [true, 'půlová pomlka', 0]);
  assert.equal(faktaNoty(p, 3, 5), null);
  assert.equal(faktaNoty(p, 99, 0), null);
});

test('faktaNoty: tie and fingering', () => {
  const p = valcik();
  p.takty[2].noty = [n('D4', '1/2', '', { prst: 2 }), n('G4', '1/4', '', { lig: true })];
  p.takty[3].noty = [n('G4', '1/4'), n('E4', '1/2')];
  const F = faktaNoty(p, 2, 1);
  assert.equal(F.ligatura, true);
  assert.equal(F.drzetCelkem.text, 'dvě doby');
  assert.equal(faktaNoty(p, 2, 0).prst, 2);
  assert.match(odpovedSablonou(F, 'delka'), /s ligaturou celkem dvě doby/);
});

test('questions for children and template answers', () => {
  const p = pisnicka();
  assert.ok(OTAZKY.length >= 4);
  const F = faktaNoty(p, 0, 1);
  const ot = otazkyProNotu(F);
  assert.ok(ot.some(o => o.text === 'Proč je tu křížek?'));
  assert.ok(!ot.some(o => o.id === 'prst'), 'without fingering it does not ask about the finger');
  assert.match(odpovedSablonou(F, 'co'), /fis1/);
  assert.match(odpovedSablonou(F, 'posuvka'), /předznamenání/);
  assert.match(odpovedSablonou(F, { id: 'akord' }), /D: d, fis, a – tvůj tón do něj patří, je to tercie/);
  assert.match(odpovedSablonou(faktaNoty(p, 7, 0), 'posuvka'), /náhodná posuvka/);
  assert.match(odpovedSablonou(faktaNoty(p, 7, 7), 'posuvka'), /Odrážka/);
  for (const pasmo of ['dite', 'dospely']) {
    p.takty.forEach((t, ti) => t.noty.forEach((_, i) => {
      const f = faktaNoty(p, ti, i, 'prava', { pasmo });
      for (const o of [...OTAZKY.map(x => x.id), 'vse', 'neznámá otázka']) {
        assert.ok(odpovedSablonou(f, o).length > 10, `${ti}/${i} ${o}`);
      }
    }));
  }
});

// ================================================================ expression
function zaznam(p, silaFn, drzeniFn) {
  const fr = fraze(p);
  const dobaMs = 60000 / p.tempo;
  const noty = [];
  let ms = 0, index = 0;
  p.takty.forEach((t, ti) => t.noty.forEach(x => {
    const delka = (zlomek(x.d) || 0) * dobaMs;
    if (x.t !== 'r') {
      const f = fr.findIndex(y => y.od <= ti && y.do >= ti);
      const k = noty.filter(y => fr.findIndex(z => z.od <= y.takt && z.do >= y.takt) === f).length;
      const nota = { takt: ti, index, pitch: vysky(x.t)[0].midi, ocekavanoMs: ms, zahranoMs: ms, vysledek: 'ok', odchylkaMs: 0,
        ocekavanaDelkaMs: delka, drzenoMs: drzeniFn ? drzeniFn(f, k) * delka : null };
      const s = silaFn ? silaFn(f, k, fr[f]) : null;
      if (s != null) nota.sila = s;
      noty.push(nota);
    }
    ms += delka; index++;
  }));
  return { rezim: 'tempo', rychlost: 100, od: 0, do: p.takty.length - 1, dobaMs, noty, chybneStisky: [] };
}

test('faktaPrednesu: crescendo, strong phrase ending, staccato by phrase', () => {
  const p = pisnicka();
  const fr = fraze(p);
  assert.ok(fr.length >= 2);
  const z = zaznam(p, (f, k) => (f === 0 ? 40 + 6 * k : f === 1 ? (k >= 7 ? 115 : 70) : 60), f => (f === 1 ? 0.3 : 0.95));
  const F = faktaPrednesu(z, p, { pasmo: 'dospely' });
  assert.equal(F.maSilu, true);
  assert.equal(F.fraze[0].smer, 'graduje');
  assert.equal(F.fraze[0].legatoProcent, 100);
  assert.equal(F.fraze[1].posledniTissi, false);
  assert.equal(F.fraze[1].staccatoProcent, 100);
  assert.equal(F.fraze[0].takty, `${fr[0].od + 1}–${fr[0].do + 1}`);
  assert.equal(F.celkem.jednotvarne, false);
  const s = sablonaPrednesu(F);
  assert.equal(s.takty, F.fraze[1].takty);
});

test('expression: monotonous dynamics, missing dynamics, templates for a child', () => {
  const p = pisnicka();
  const J = faktaPrednesu(zaznam(p, () => 64, () => 0.9), p);
  assert.equal(J.celkem.jednotvarne, true);
  assert.equal(J.celkem.dynamika, 'mp');
  const sj = sablonaPrednesu(J);
  assert.match(sj.veta, /potichu/);
  const N = faktaPrednesu(zaznam(p, null, null), p);
  assert.equal(N.maSilu, false);
  assert.equal(N.maDrzeni, false);
  const sn = sablonaPrednesu(N);
  assert.equal(sn.takty, null);
});

// ================================================================ accompaniment style
test('accompaniment in every style passes the check and a MusicXML round trip (4/4, 3/4, 6/8, no chords)', () => {
  for (const p of [pisnicka(), valcik(), sestOsmin(), bezAkordu()]) {
    const puvodni = kopie(p);
    for (const s of STYLY) {
      const d = doprovodVeStylu(p, s.id);
      assert.deepEqual(kontrola(d), [], `${s.id} ${p.takt}`);
      assert.ok(d.takty.every(t => t.leva && t.leva.length), s.id);
      assert.ok(d.takty.some(t => t.leva.some(x => x.t !== 'r')), `${s.id}: left hand plays`);
      roundTrip(d);
      // left hand below the simultaneously sounding melody, no semitone clash
      const intervaly = noty => { let pos = 0; return noty.map(x => { const o = { od: pos, do: pos + zlomek(x.d), m: vysky(x.t).map(v => v.midi) }; pos = o.do; return o; }); };
      d.takty.forEach(t => {
        const mel = intervaly(t.noty);
        for (const l of intervaly(t.leva)) {
          const nad = mel.filter(x => x.od < l.do - 1e-6 && x.do > l.od + 1e-6).flatMap(x => x.m);
          for (const m of l.m) assert.ok(nad.every(x => m < x && x - m !== 1), `${s.id}: left ${m} below melody ${nad}`);
        }
      });
    }
    assert.deepEqual(p, puvodni, 'input is not modified');
  }
});

test('styles: waltz bass–chord–chord, tango with a dotted eighth, polka with alternating bass', () => {
  const v = doprovodVeStylu(valcik(), 'valcik');
  assert.deepEqual(v.takty[0].leva.map(x => [x.t, x.d]), [['C3', '1/4'], ['G2 C3 E3', '1/4'], ['G2 C3 E3', '1/4']]);
  const t = doprovodVeStylu(pisnicka(), 'tango');
  assert.deepEqual(t.takty[0].leva.map(x => x.d), ['3/16', '1/16', '1/4', '3/16', '1/16', '1/4']);
  assert.deepEqual(t.takty[0].leva.slice(0, 2).map(x => x.t), ['D3', 'A3']);
  const pk = doprovodVeStylu(pisnicka(), 'polka');
  assert.deepEqual(pk.takty[0].leva.map(x => x.t), ['D3', 'A2 D3 F#3', 'A3', 'A2 D3 F#3']);
  // the chord changes mid-bar (E7 → A7)
  const b = doprovodVeStylu(pisnicka(), 'basy');
  assert.deepEqual(b.takty[7].leva.map(x => [x.t, x.d]), [['E2', '1/2'], ['A2', '1/2']]);
  // a waltz in 4/4 adapts beat by beat
  assert.equal(vzorProTakt('valcik', '4/4').prizpusobeno, true);
  assert.equal(vzorProTakt('polka', '2/4').prizpusobeno, false);
  // a 2/4 polka in 4/4 would repeat; a 6/8 waltz splits into two 3/8 bars
  assert.equal(vzorProTakt('valcik', '3/8').prizpusobeno, false);
});

test('styled accompaniment renders in Verovio', async () => {
  const t = await verovio();
  for (const [p, s] of [[pisnicka(), 'tango'], [valcik(), 'valcik'], [sestOsmin(), 'ukolebavka']]) {
    assert.ok(t.loadData(naMusicXml(doprovodVeStylu(p, s))), s);
  }
});

// ================================================================ new song
test('sablonaNovePisne: deterministic, valid, only allowed tones and durations, ends on the tonic', () => {
  const omezeni = [
    { tema: 'zima', tony: ['C', 'D', 'E', 'F', 'G'], takt: '4/4', taktu: 8, pasmo: 'dite' },
    { tema: 'les', tony: ['C', 'D', 'E', 'F', 'G'], takt: '3/4', taktu: 8, pasmo: 'dite' },
    { tony: ['G', 'A', 'H', 'C', 'D'], takt: '2/4', taktu: 6, pasmo: 'dite' },
    { tema: 'moře', rozsah: { od: 'D4', do: 'D5' }, takt: '6/8', taktu: 8, pasmo: 'dospely', predznamenani: 2 },
    { rozsah: { od: 'A3', do: 'E5' }, takt: '4/4', taktu: 12, pasmo: 'dospely', dur: false },
  ];
  for (const o of omezeni) {
    const a = sablonaNovePisne(o, 7), b = sablonaNovePisne(o, 7), c = sablonaNovePisne(o, 8);
    assert.deepEqual(a, b, 'same seed → same song');
    assert.notDeepEqual(a.takty.map(t => t.noty), c.takty.map(t => t.noty), 'different seed → different melody');
    assert.equal(a.takty.length, o.taktu);
    assert.deepEqual(kontrola(a), []);
    roundTrip(a);
    const posledni = [...a.takty[a.takty.length - 1].noty].reverse().find(x => x.t !== 'r');
    const ton = (o.dur === false ? 'A' : o.predznamenani === 2 ? 'D' : o.tony?.[0] === 'G' ? 'G' : 'C');
    assert.equal(posledni.t[0], ton, 'ends on the tonic');
    assert.ok(a.takty[0].akordy.length, 'chord from the start');
    const posledniAkord = [...a.takty].reverse().find(t => t.akordy.length).akordy.at(-1).znacka;
    assert.equal(posledniAkord, ton + (o.dur === false ? 'm' : ''), 'final chord is the tonic');
  }
  const deti = sablonaNovePisne({ tony: ['C', 'D', 'E', 'F', 'G'], pasmo: 'dite' }, 3);
  const vsechny = deti.takty.flatMap(t => t.noty);
  assert.ok(vsechny.every(x => x.t === 'r' || ['C4', 'D4', 'E4', 'F4', 'G4'].includes(x.t)));
  assert.ok(vsechny.every(x => ['1/8', '1/4', '1/2', '1/1'].includes(x.d)));
  assert.equal(deti.tempo, 90);
  // stepwise motion: at most a third
  const midi = vsechny.filter(x => x.t !== 'r').map(x => vysky(x.t)[0].midi);
  for (let seed = 1; seed <= 40; seed++) {
    const m = sablonaNovePisne({ tony: ['C', 'D', 'E', 'F', 'G'], pasmo: 'dite', taktu: 8 + (seed % 3) * 4 }, seed)
      .takty.flatMap(t => t.noty).filter(x => x.t !== 'r').map(x => vysky(x.t)[0].midi);
    assert.ok(m.slice(1).every((x, i) => Math.abs(x - m[i]) <= 4), `seed ${seed}: for children only steps and thirds`);
  }
  assert.ok(midi.length > 8);
});

test('a generated song renders in Verovio', async () => {
  const t = await verovio();
  assert.ok(t.loadData(naMusicXml(sablonaNovePisne({ tema: 'vláček' }, 1))));
});

/** model response: 4 bars of C major 4/4 with lyrics */
const odpovedModelu = () => ({
  nazev: 'Zimní písnička',
  takty: [
    { akordy: [{ doba: 0, znacka: 'C' }], noty: [{ t: 'C4', d: '1/4', s: 'Pa-', lig: false }, { t: 'D4', d: '1/4', s: 'dá', lig: false }, { t: 'E4', d: '1/2', s: 'sníh,', lig: false }] },
    { akordy: [{ doba: 0, znacka: 'G' }], noty: [{ t: 'D4', d: '1/4', s: 'bí-', lig: false }, { t: 'E4', d: '1/4', s: 'lý', lig: false }, { t: 'F4', d: '1/2', s: 'svět.', lig: false }] },
    { akordy: [{ doba: 0, znacka: 'F' }], noty: [{ t: 'G4', d: '1/4', s: 'Sáň-', lig: false }, { t: 'F4', d: '1/4', s: 'ky', lig: false }, { t: 'E4', d: '1/4', s: 'jedou', lig: false }, { t: 'D4', d: '1/4', s: 'z ko-', lig: false }] },
    { akordy: [{ doba: 0, znacka: 'C' }], noty: [{ t: 'C4', d: '1/1', s: 'pce.', lig: false }] },
  ],
});
const OMEZENI = { tema: 'zima', tony: ['C', 'D', 'E', 'F', 'G'], takt: '4/4', taktu: 4, pasmo: 'dite' };

// ================================================================ weekly summary
const den = (d, h = 17) => new Date(2026, 10, d, h, 0).getTime();
function statistika(historie, takty = {}) {
  return { verze: 1, pokusu: historie.length, posledni: historie[historie.length - 1]?.kdy ?? null, takty, vzorce: {}, historie };
}
const pokus = (kdy, presnost, rychlost, cisty = false) => ({ kdy, rezim: 'tempo', rychlost, od: 0, do: 8, presnost, cisty, spech: 'presne' });

test('faktaTydne: days, minutes, attempts, accuracy and tempo improvement, hard spots, recommendation', () => {
  const p = pisnicka();
  const st = statistika([
    pokus(den(2), 0.6, 70), pokus(den(3), 0.6, 70),
    pokus(den(9), 0.7, 70), pokus(den(9, 18), 0.75, 70), pokus(den(11), 0.85, 80), pokus(den(13), 0.9, 80, true),
  ], { 6: { noty: 10, chyby: 4, tony: 4, vynechane: 0, posun: 0, mereno: 0 } });
  const st2 = statistika([pokus(den(10), 0.95, 100, true), pokus(den(12), 0.97, 100, true)]);
  const F = faktaTydne([{ klic: 'a', nazev: 'Testovací', statistika: st, pisen: p }, { klic: 'b', nazev: 'Valčík', statistika: st2 }],
    [{ kdy: den(9), dobaMs: 20 * 60000 }, { kdy: den(11), minut: 15 }, { kdy: den(1), minut: 99 }], den(9, 0), den(16, 0), { pasmo: 'dite' });
  assert.deepEqual([F.dniCviceni, F.pokusu, F.cistych, F.minut], [5, 6, 3, 35]);
  const a = F.pisne[0];
  assert.equal(a.nazev, 'Testovací');
  assert.deepEqual(a.presnost, { zacatek: 77, konec: 83, zmena: 6, predTydnem: 60, oprotiMinule: 23 });
  assert.deepEqual([a.rychlost.max, a.rychlost.predTydnem, a.rychlost.zmena], [80, 70, 10]);
  assert.deepEqual(a.tezkaMista[0].takty, '7');
  assert.equal(F.zlepseni, true);
  assert.deepEqual(F.doporuceni, { nazev: 'Testovací', klic: 'a', proc: 'tezke-misto', takty: '7' });
  assert.equal(F.obdobi.od, '2026-11-09');
  assert.equal(F.obdobi.do, '2026-11-15');
  const s = sablonaTydne(F);
  assert.match(s.shrnuti, /5 dní cvičení, 6 pokusů, 35 minut, z toho 3 čisté/);
  assert.match(s.pisne[0], /přesnost 60 % → 83 %/);
  assert.match(s.priste, /takty 7/);
  // object { klic: statistika } without names and without minutes
  const G = faktaTydne({ x: st }, null, den(9, 0), den(16, 0));
  assert.equal(G.minut, null);
  assert.equal(G.pisne[0].tezkaMista[0].takty, '7');
  assert.ok(sablonaTydne(G).shrnuti);
});

// ================================================================ Echo
test('motif from a song: length by level, consecutive notes, times by tempo', () => {
  const p = pisnicka();
  const m = motiv(p, { uroven: 1 });
  assert.equal(m.noty.length, 3);
  assert.deepEqual(m.noty.map(x => x.cesky), ['d1', 'fis1', 'a1']);
  assert.equal(m.takt, 1);
  assert.deepEqual(m.noty.map(x => x.ms), [0, 625, 1250]);
  for (let d = 3; d <= 6; d++) assert.equal(motiv(p, { delka: d, uroven: 4 }).noty.length, d);
  assert.notEqual(motiv(p, { uroven: 2, seed: 1 }).takt, motiv(p, { uroven: 2, seed: 0 }).takt, 'seed picks a different motif');
  assert.deepEqual(motiv(p, { uroven: 2, seed: 1 }), motiv(p, { uroven: 2, seed: 1 }));
  for (const { f, p: s } of soukrome()) {
    const x = motiv(s, { uroven: 1 });
    assert.ok(x && x.noty.length === 3, f);
  }
});

test('nahodnyMotiv: deterministic, in the key, difficulty controls length', () => {
  assert.deepEqual(nahodnyMotiv('G', 5, 2), nahodnyMotiv('G', 5, 2));
  for (let ob = 1; ob <= 4; ob++) {
    const m = nahodnyMotiv('D', 11, ob);
    assert.equal(m.noty.length, ob + 2);
    assert.ok(m.noty.every(x => !/^(F|C)\d/.test(x.t)), 'in D major only F# and C#');
  }
  const m1 = nahodnyMotiv('C', 3, 1);
  assert.equal(m1.noty[0].t, 'C4');
  assert.ok(m1.noty.every(x => x.q === 1));
  assert.ok(m1.noty.slice(1).every((x, i) => Math.abs(x.midi - m1.noty[i].midi) <= 2));
  assert.equal(nahodnyMotiv('Am', 1, 1).noty[0].t, 'A3');
  assert.equal(nahodnyMotiv('Bb', 1, 1).noty[0].t, 'Bb3');
});

test('porovnejOzvenu: right and wrong tone, rhythm independent of tempo, octave, missing tone', () => {
  const p = { nazev: '', autor: '', klic: 'houslovy', predznamenani: 0, takt: '4/4', tempo: 120, takty: [
    { akordy: [], noty: [q('C4'), n('D4', '1/8'), n('E4', '1/8'), n('F4', '1/2')] }] };
  const m = motiv(p, { delka: 4, uroven: 2 });
  assert.deepEqual(m.noty.map(x => x.ms), [0, 500, 750, 1000]);
  const hraj = (vysky, casy) => vysky.map((midi, i) => ({ midi, ms: 3000 + casy[i] }));
  // slower (×1.6), but the rhythm is right
  const dobre = porovnejOzvenu(m, hraj([60, 62, 64, 65], [0, 800, 1200, 1600]));
  assert.deepEqual([dobre.trefa, dobre.spravneTony, dobre.spravnyRytmus, dobre.popis], [true, true, true, 'Tóny i rytmus sedí.']);
  assert.equal(dobre.msNaDobu, 800);
  const ton = porovnejOzvenu(m, hraj([60, 63, 64, 65], [0, 500, 750, 1000]));
  assert.deepEqual([ton.trefa, ton.spravneTony, ton.spravnyRytmus], [false, false, true]);
  assert.match(ton.popis, /Druhý tón měl být d1, zaznělo dis1/);
  const rytmus = porovnejOzvenu(m, hraj([60, 62, 64, 65], [0, 400, 800, 1200]));
  assert.deepEqual([rytmus.trefa, rytmus.spravneTony, rytmus.spravnyRytmus], [false, true, false]);
  assert.match(rytmus.popis, /Rytmus/);
  const okt = hraj([72, 74, 76, 77], [0, 500, 750, 1000]);
  assert.equal(porovnejOzvenu(m, okt).spravneTony, false);
  assert.equal(porovnejOzvenu(m, okt, { oktava: true }).trefa, true);
  const chybi = porovnejOzvenu(m, hraj([60, 62, 64], [0, 500, 750]));
  assert.deepEqual([chybi.trefa, chybi.spravneTony], [false, false]);
  assert.match(chybi.popis, /4 tóny, zaznělo 3/);
  assert.equal(porovnejOzvenu(m, []).popis, 'Nezazněl žádný tón.');
  // tolerance
  const mirne = hraj([60, 62, 64, 65], [0, 560, 800, 1000]);
  assert.equal(porovnejOzvenu(m, mirne).spravnyRytmus, true);
  assert.equal(porovnejOzvenu(m, mirne, { tolerance: 0.05 }).spravnyRytmus, false);
});

test('real songs: accompaniment in every style, note answers and motifs (only when available)', () => {
  for (const { f, p } of soukrome()) {
    for (const s of STYLY) {
      const d = doprovodVeStylu(p, s.id);
      assert.deepEqual(kontrola(d), [], `${f} ${s.id}`);
      assert.deepEqual(levaJako(zMusicXml(naMusicXml(d))), levaJako(d), `${f} ${s.id}`);
    }
    p.takty.slice(0, 12).forEach((t, ti) => t.noty.forEach((_, i) => {
      const F = faktaNoty(p, ti, i, 'prava', { pasmo: ti % 2 ? 'dite' : 'dospely' });
      for (const o of [...OTAZKY.map(x => x.id), 'vse']) {
        assert.ok(odpovedSablonou(F, o).length > 10, `${f} ${ti}/${i} ${o}`);
      }
    }));
    for (let u = 1; u <= 4; u++) assert.ok(motiv(p, { uroven: u }), `${f} level ${u}`);
  }
});

test('expression by the score dynamics: missing contrast, dynamics followed, nothing without marks', () => {
  const p = pisnicka();
  const sDyn = (sila) => {
    const z = zaznam(p, () => 60);
    z.noty.forEach(n => { n.dynamika = n.takt < 4 ? 'p' : 'f'; n.sila = sila(n); });
    return faktaPrednesu(z, p);
  };
  const stejne = sDyn(() => 70);
  assert.equal(stejne.podleNot.chyba.druh, 'kontrast');
  assert.equal(stejne.podleNot.chyba.znacka, 'f');
  assert.match(sablonaPrednesu(stejne).veta, /je v notách f, máš zesílit/);
  const dobre = sDyn(n => (n.takt < 4 ? 45 : 95));
  assert.equal(dobre.podleNot.chyba, null);
  assert.equal(dobre.podleNot.zmen, 1);
  assert.match(sablonaPrednesu(dobre).veta, /Dynamiku z not dodržuješ/);
  assert.match(sablonaPrednesu({ ...dobre, pasmo: 'dospely' }).veta, /p → f/);
  const bez = faktaPrednesu(zaznam(p, () => 60), p);
  assert.equal(bez.podleNot, null);
});
