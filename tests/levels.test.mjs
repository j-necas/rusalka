import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { zlomek, vyska, vysky, typNoty, kontrola, naMusicXml, zMusicXml, soucetTaktu, tonyAkordu } from '../static/lib/song.js';
import {
  seznamUrovni, vytvorUroven, vytvorHranouUroven, prstoklad, jakaTonina, transponuj, harmonizuj, hratelnePrstoklad,
} from '../static/lib/levels.js';

const n = (t, d, extra = {}) => ({ t, d, lig: false, s: '', ...extra });
const zaklad = (takty, extra = {}) => ({ nazev: 'Test', autor: '', klic: 'houslovy', predznamenani: 2, takt: '3/4', tempo: 90, takty, ...extra });
const slabiky = p => p.takty.flatMap(t => t.noty.map(x => String(x.s || '').trim()).filter(Boolean));
const midi = t => vyska(t).midi;
const delky = noty => noty.map(x => [x.t, zlomek(x.d)]);
/** a short song "do mi sol | do" in the given key */
const kratka = (f, tony) => zaklad([
  { akordy: [], noty: tony.slice(0, 3).map(t => n(t, '1/4')) },
  { akordy: [], noty: [n(tony[3], '3/4')] },
], { predznamenani: f });

// song in D major 4/4 with everything that should be simplified: pickup, sixteenths, dotted rhythm, triplet, dyad, ties
function pisenD() {
  return zaklad([
    { akordy: [], noty: [n('A4', '1/4', { s: 'Na' })] },                                                   // pickup
    { akordy: [{ doba: 0, znacka: 'D' }],
      noty: [n('F#4', '3/16', { s: 'ho-' }), n('E4', '1/16'), n('D4', '1/4', { s: 'ře' }), n('F#4', '1/16', { s: 'je' }),
        n('G4', '1/16'), n('A4', '1/16'), n('B4', '1/16'), n('A4', '1/4', { s: 'den' })] },
    { akordy: [{ doba: 0, znacka: 'G' }, { doba: 2, znacka: 'A7' }],
      noty: [n('B4', '1/12', { s: 'tří' }), n('A4', '1/12', { s: 'sla-' }), n('G4', '1/12', { s: 'bi-' }), n('D5 F#5', '1/4', { s: 'ky,' }),
        n('E5', '1/4', { lig: true }), n('E5', '1/4')] },
    { akordy: [{ doba: 0, znacka: 'Hmi' }],
      noty: [n('F#4', '1/12', { s: 'a' }), n('G4', '1/12'), n('A4', '1/12'), n('B4', '1/4', { s: 'tri-' }), n('A4', '1/2', { s: 'o-' })] },
    { akordy: [{ doba: 0, znacka: 'D' }],
      noty: [n('D4', '1/2', { s: 'la', lig: true }), n('D4', '1/4'), n('r', '1/4')] },
  ], { takt: '4/4' });
}
// a simple song in C major 3/4 without chords
function pisenC() {
  const t = s => s.split(' ').map(x => { const [v, d, sl] = x.split(':'); return n(v, d, { s: sl || '' }); });
  return zaklad([
    { akordy: [], noty: t('C4:1/4:Kdo E4:1/4:si G4:1/4:hra-') },
    { akordy: [], noty: t('E4:1/2:je C4:1/4:ten') },
    { akordy: [], noty: t('F4:1/4:ne- A4:1/4:zlo- F4:1/4:bí,') },
    { akordy: [], noty: t('G4:1/4:kdo B4:1/4:si D5:1/4:zpí-') },
    { akordy: [], noty: t('B4:1/4:vá, G4:1/4:ten F4:1/4:se') },
    { akordy: [], noty: t('E4:3/4:smí-') },
    { akordy: [], noty: t('D4:1/4:je D4:1/4:a G4:1/4:hra-') },
    { akordy: [], noty: t('C4:3/4:je') },
  ], { predznamenani: 0 });
}

/** a level must pass the check and a lossless MusicXML round trip, and keep the syllables */
function overUroven(puvodni, q, popis) {
  assert.deepEqual(kontrola(q), [], `${popis}: check`);
  assert.equal(q.takty.length, puvodni.takty.length, `${popis}: bar count`);
  assert.deepEqual(slabiky(q), slabiky(puvodni), `${popis}: syllables`);
  q.takty.forEach((t, i) => {
    const s = soucetTaktu(puvodni.takty[i].noty);
    assert.ok(Math.abs(soucetTaktu(t.noty) - s) < 1e-6, `${popis}: length of bar ${i + 1}`);
    if (t.leva) assert.ok(Math.abs(soucetTaktu(t.leva) - s) < 1e-6, `${popis}: left hand length in bar ${i + 1}`);
  });
  const z = zMusicXml(naMusicXml(q));
  const ruka = (p, r) => p.takty.map(t => (t[r] || []).map(x => [x.t, x.d, !!x.lig, String(x.s || ''), x.prst || 0]));
  assert.deepEqual(ruka(z, 'noty'), ruka(q, 'noty'), `${popis}: right hand round trip`);
  if (q.takty.some(t => t.leva)) assert.deepEqual(ruka(z, 'leva'), ruka(q, 'leva'), `${popis}: left hand round trip`);
  const ak = p => p.takty.map(t => t.akordy.map(a => [a.doba, JSON.stringify(tonyAkordu(a.znacka))]));
  assert.deepEqual(ak(z), ak(q), `${popis}: chord round trip`);
  assert.equal(z.predznamenani, q.predznamenani);
}

test('level list: five levels, the original always', () => {
  const s = seznamUrovni(pisenD());
  assert.deepEqual(s.map(u => u.id), [1, 2, 3, 4, 5]);
  assert.ok(s.every(u => u.nazev && u.popis));
  assert.deepEqual(s.map(u => u.dostupna), [true, true, true, true, true]);
  const p = pisenD();
  p.takty[1].leva = [n('D3', '1')];
  assert.match(seznamUrovni(p)[4].popis, /Obě ruce/);
  assert.equal(seznamUrovni(p)[4].nazev, 'Všechny noty');
  // a song with only a melody: the hardest is the melody with a broken accompaniment, not "all the notes" (= the melody)
  assert.equal(seznamUrovni(pisenC())[4].nazev, 'Melodie s doprovodem');
  assert.match(seznamUrovni(pisenC())[4].popis, /valčík/);
  assert.match(seznamUrovni(pisenC())[3].popis, /celými akordy/);
});

test('every level passes the check and a MusicXML round trip, also with transposition and fingering', () => {
  for (const p of [pisenD(), pisenC()]) {
    const snimek = JSON.stringify(p);
    for (const transpozice of ['ne', 'C', 'snadna']) {
      for (const id of [1, 2, 3, 4, 5]) {
        for (const prst of [false, true]) {
          overUroven(p, vytvorUroven(p, id, { transpozice, prstoklad: prst }), `level ${id} ${transpozice} prst=${prst}`);
        }
      }
    }
    assert.equal(JSON.stringify(p), snimek, 'input must not change');
  }
});

test('level 1: dyad → top tone, sixteenths and dotted rhythm to eighths, ties merged', () => {
  const q = vytvorUroven(pisenD(), 1);
  assert.ok(q.takty.every(t => !t.leva));
  const t2 = q.takty[1].noty;
  // F#4 3/16 + E4 1/16 → F#4 eighth + E4 eighth; F#4 G4 A4 B4 sixteenths without syllables → eighths (some are dropped)
  assert.deepEqual(t2.map(x => x.d).filter(d => ['1/16', '3/16'].includes(d)), []);
  assert.deepEqual(t2.slice(0, 3).map(x => [x.t, x.d]), [['F#4', '1/8'], ['E4', '1/8'], ['D4', '1/4']]);
  // a triplet with three syllables must not be broken (it stays), dyad D5 F#5 → F#5, E5~E5 → half
  const t3 = q.takty[2].noty;
  assert.deepEqual(t3.map(x => [x.t, x.d]), [['B4', '1/12'], ['A4', '1/12'], ['G4', '1/12'], ['F#5', '1/4'], ['E5', '1/2']]);
  // a triplet with a single syllable → eighths
  assert.ok(q.takty[3].noty.every(x => !typNoty(zlomek(x.d)).trioly));
  assert.deepEqual(q.takty[3].noty.map(x => x.s), ['a', '', 'tri-', 'o-']);
  // D4 1/2 ~ D4 1/4 → dotted half
  assert.deepEqual(q.takty[4].noty.map(x => [x.t, x.d, x.lig]), [['D4', '3/4', false], ['r', '1/4', false]]);
  assert.ok(q.takty.every(t => t.noty.every(x => vysky(x.t).length <= 1)));
});

test('level 2: melody unchanged, no left hand', () => {
  const p = pisenD();
  p.takty[1].leva = [n('D3', '1')];
  const q = vytvorUroven(p, 2);
  assert.deepEqual(q.takty.map(t => t.noty), p.takty.map(t => t.noty));
  assert.ok(q.takty.every(t => !t.leva));
});

test('level 3: chord roots in the bass, lasting until the chord changes', () => {
  const q = vytvorUroven(pisenD(), 3);
  assert.deepEqual(q.takty[0].leva.map(x => x.t), ['r']);                    // pickup without a chord
  assert.deepEqual(delky(q.takty[1].leva), [['D3', 4]]);
  assert.deepEqual(delky(q.takty[2].leva), [['G2', 2], ['A2', 2]]);
  assert.deepEqual(delky(q.takty[3].leva), [['B2', 4]]);
  for (const t of q.takty) for (const x of t.leva) for (const v of vysky(x.t)) assert.ok(v.midi >= 40 && v.midi <= 51, x.t);
  // chord with a bass note
  const p = pisenD();
  p.takty[4].akordy = [{ doba: 0, znacka: 'D/F#' }];
  assert.equal(vytvorUroven(p, 3).takty[4].leva[0].t, 'F#2');
});

test('level 3 without chords: I/IV/V harmonisation from the melody is written into the chords', () => {
  const p = pisenC();
  assert.deepEqual(harmonizuj(p), ['C', 'C', 'F', 'G', 'G', 'C', 'G', 'C']);
  const q = vytvorUroven(p, 3);
  assert.deepEqual(q.takty.map(t => t.akordy.map(a => a.znacka).join()), ['C', '', 'F', 'G', '', 'C', 'G', 'C']);
  assert.deepEqual(q.takty.map(t => t.leva[0].t), ['C3', 'C3', 'F2', 'G2', 'G2', 'C3', 'G2', 'C3']);
  assert.ok(p.takty.every(t => !t.akordy.length), 'input without chords stays so');
});

test('level 4: whole chords, each held while it lasts, without a semitone clash with the melody', () => {
  for (const p of [pisenC(), pisenD()]) {
    const q = vytvorUroven(p, 4);
    for (const [i, t] of q.takty.entries()) {
      const zmeny = new Set((p.takty[i].akordy || []).map(a => a.doba).filter(d => d > 0)).size;
      const uhozy = t.leva.filter((x, j) => x.t !== 'r' && !(j > 0 && t.leva[j - 1].lig));
      assert.ok(uhozy.length <= zmeny + 1, `bar ${i + 1}: ${t.leva.map(x => x.t + ':' + x.d).join(' ')}`);
      for (const x of t.leva.filter(x => x.t !== 'r')) assert.ok(vysky(x.t).length >= 2, `bar ${i + 1}: a chord, not one note (${x.t})`);
    }
  }
  assert.deepEqual(vytvorUroven(pisenC(), 4).takty[0].leva.filter(x => !x.lig).length, 1);
});

test('level 5 of a song with only a melody: waltz in 3/4, chord within G2–G3 without a semitone clash with the melody', () => {
  const p = pisenC();
  const q = vytvorUroven(p, 5);
  for (const [i, t] of q.takty.entries()) {
    assert.deepEqual(t.leva.map(x => x.d), ['1/4', '1/4', '1/4'], `bar ${i + 1}`);
    assert.equal(vysky(t.leva[0].t).length, 1);
    let pos = 0;
    for (const x of t.leva) {
      const q4 = zlomek(x.d);
      if (pos > 0) {
        const vs = vysky(x.t);
        assert.ok(vs.length >= 2, `bar ${i + 1}: chord ${x.t}`);
        // sounding melody
        let mp = 0;
        for (const m of t.noty) {
          const md = zlomek(m.d);
          if (mp < pos + q4 && mp + md > pos) for (const mv of vysky(m.t)) for (const v of vs) {
            assert.notEqual(Math.abs(mv.midi - v.midi), 1, `bar ${i + 1}: clash ${m.t} × ${x.t}`);
            assert.ok(v.midi <= mv.midi);
          }
          mp += md;
        }
        for (const v of vs) assert.ok(v.midi >= 43 && v.midi <= 55, x.t);
      }
      pos += q4;
    }
  }
  assert.deepEqual(q.takty[0].leva.map(x => x.t), ['C3', 'G2 C3 E3', 'G2 C3 E3']);
  // 4/4: bass, chord, fifth, chord; a chord change on beat 3 → the bass of the new chord
  const d = vytvorUroven(pisenD(), 5);
  assert.deepEqual(d.takty[1].leva.map(x => x.t), ['D3', 'A2 D3 F#3', 'A2', 'A2 D3 F#3']);
  assert.deepEqual(d.takty[2].leva.map(x => x.t).slice(0, 3), ['G2', 'G2 B2 D3', 'A2']);
  // 6/8: bass, chord in dotted quarters
  const s = zaklad([{ akordy: [{ doba: 0, znacka: 'C' }], noty: [n('E4', '3/8', { s: 'hou' }), n('G4', '3/8', { s: 'pá' })] }], { takt: '6/8', predznamenani: 0 });
  assert.deepEqual(vytvorUroven(s, 5).takty[0].leva.map(x => [x.t, x.d]), [['C3', '3/8'], ['G2 C3 E3', '3/8']]);
});

test('level 5: the original with the left hand', () => {
  const p = pisenD();
  for (const t of p.takty) t.leva = [n('r', naD(soucetTaktu(t.noty)))];
  p.takty[1].leva = [n('D3', '1/2'), n('A2', '1/2')];
  const q = vytvorUroven(p, 5);
  assert.deepEqual(q, p);
  assert.notEqual(q, p);
});
function naD(q) { return { 1: '1/4', 4: '1', 3: '3/4', 2: '1/2' }[q]; }

test('key: major/minor and Czech names', () => {
  assert.deepEqual([jakaTonina(pisenD()).nazev, jakaTonina(pisenD()).dur], ['D dur', true]);
  const h = pisenD();
  h.takty[4].akordy = [{ doba: 0, znacka: 'Hmi' }];
  h.takty[4].noty[0].t = 'B3'; h.takty[4].noty[1].t = 'B3';
  assert.equal(jakaTonina(h).nazev, 'h moll');
  assert.equal(jakaTonina(kratka(-3, ['Eb4', 'G4', 'Bb4', 'Eb4'])).nazev, 'Es dur');
  assert.equal(jakaTonina(kratka(-2, ['Bb3', 'D4', 'F4', 'Bb3'])).nazev, 'B dur');
  assert.equal(jakaTonina(kratka(-2, ['G4', 'Bb4', 'D5', 'G4'])).nazev, 'g moll');
  assert.equal(jakaTonina(kratka(0, ['A4', 'C5', 'G#4', 'A4'])).nazev, 'a moll');
  const fis = zaklad([{ akordy: [{ doba: 0, znacka: 'F#m' }], noty: [n('F#4', '3/4')] }], { predznamenani: 3 });
  assert.equal(jakaTonina(fis).nazev, 'fis moll');
});

test('transposition D major → C major: notes, chords, key signature', () => {
  const q = vytvorUroven(pisenD(), 2, { transpozice: 'C' });
  assert.equal(q.predznamenani, 0);
  assert.deepEqual(q.takty[1].noty.map(x => x.t), ['E4', 'D4', 'C4', 'E4', 'F4', 'G4', 'A4', 'G4']);
  assert.equal(q.takty[2].noty[3].t, 'C5 E5');
  assert.deepEqual(q.takty[2].akordy.map(a => a.znacka), ['F', 'G7']);
  assert.equal(q.takty[3].akordy[0].znacka, 'Ami');
  assert.ok(q.takty.every(t => t.noty.every(x => !/[#b]\d/.test(x.t))), 'no accidentals in C major');
  // the accompaniment in C: the left hand is transposed too (level 5: bass first; level 4: the whole C chord)
  assert.equal(vytvorUroven(pisenD(), 5, { transpozice: 'C' }).takty[1].leva[0].t, 'C3');
  assert.deepEqual(vysky(vytvorUroven(pisenD(), 4, { transpozice: 'C' }).takty[1].leva[0].t).map(v => v.midi % 12).sort(), [0, 4, 7]);
  // B minor → A minor
  const h = pisenD();
  h.takty[4].akordy = [{ doba: 0, znacka: 'Bm' }];
  h.takty[4].noty[0].t = 'B3'; h.takty[4].noty[1].t = 'B3';
  const a = transponuj(h, 'C');
  assert.equal(jakaTonina(a).nazev, 'a moll');
  assert.equal(a.takty[4].noty[0].t, 'A3');
});

test('"easy" transposition: the nearest easy key, melody within C4–C6', () => {
  const cil = (p, c = 'snadna') => {
    const q = transponuj(p, c);
    return [jakaTonina(q).nazev, ...q.takty.flatMap(t => t.noty.map(x => x.t))].join(' ');
  };
  assert.equal(cil(kratka(4, ['E4', 'G#4', 'B4', 'E4'])), 'F dur F4 A4 C5 F4');          // E → F (+1)
  assert.equal(cil(kratka(3, ['A4', 'C#5', 'E5', 'A4'])), 'G dur G4 B4 D5 G4');          // A → G (−2)
  assert.equal(cil(kratka(-3, ['Eb4', 'G4', 'Bb4', 'Eb4'])), 'D dur D4 F#4 A4 D4');      // Eb → D (−1)
  assert.equal(cil(kratka(-2, ['Bb3', 'D4', 'F4', 'Bb3'])), 'C dur C4 E4 G4 C4');        // Bb → C (+2)
  assert.equal(cil(kratka(2, ['D4', 'F#4', 'A4', 'D4'])), 'D dur D4 F#4 A4 D4');         // D stays
  assert.equal(cil(kratka(5, ['B3', 'D#4', 'F#4', 'B3']), 'C'), 'C dur C4 E4 G4 C4');     // B → C
  assert.equal(cil(kratka(-1, ['D4', 'F4', 'C#4', 'D4']), 'C'), 'a moll A3 C4 G#3 A3');   // D minor → A minor
  assert.equal(cil(kratka(3, ['F#4', 'A4', 'E#4', 'F#4'])), 'e moll E4 G4 D#4 E4');       // F# minor → E minor (−2)
  // spelling after transposition: E major → F major has Bb, not A#
  const e = kratka(4, ['E4', 'G#4', 'B4', 'E4']);
  e.takty[0].noty[0].t = 'D#4';
  assert.equal(transponuj(e, 'snadna').takty[0].noty[0].t, 'E4');
  e.takty[0].noty[0].t = 'A4';
  assert.equal(transponuj(e, 'snadna').takty[0].noty[0].t, 'Bb4');
  // melody too high → an octave down
  const vysoko = pisenC();
  for (const t of vysoko.takty) for (const x of t.noty) x.t = x.t.replace(/\d/, c => String(Number(c) + 2));
  const v = transponuj(vysoko, 'C').takty.flatMap(t => t.noty.map(x => midi(x.t)));
  assert.ok(v.every(m => m >= 57 && m <= 86), String(v));                    // C4–C6 with a small tolerance
  assert.ok(v.filter(m => m >= 60 && m <= 84).length > v.length * 0.8, String(v));
  assert.deepEqual(transponuj(pisenC(), 'ne'), pisenC());
});

test('fingering: C major scale 1-2-3-1-2-3-4-5, a repeated tone with the same finger, deterministic', () => {
  const stupnice = 'C4 D4 E4 F4 G4 A4 B4 C5'.split(' ');
  assert.deepEqual(prstoklad(stupnice), [1, 2, 3, 1, 2, 3, 4, 5]);
  assert.deepEqual(prstoklad(stupnice.map(t => n(t, '1/8'))), [1, 2, 3, 1, 2, 3, 4, 5]);
  assert.deepEqual(prstoklad([...stupnice].reverse()), [5, 4, 3, 2, 1, 3, 2, 1]);
  assert.deepEqual(prstoklad([60, 62, 64, 65, 67]), [1, 2, 3, 4, 5]);
  const opak = prstoklad(['E4', 'E4', 'E4', 'D4']);
  assert.equal(new Set(opak.slice(0, 3)).size, 1);
  assert.deepEqual(prstoklad([n('C4', '1/4'), n('r', '1/4'), n('D4', '1/4')]).map(x => x === null), [false, true, false]);
  const melodie = 'G4 E4 E4 F4 D4 D4 C4 E4 G4 G4 E4 E4 F4 D4 D4 C4 E4 C4 C5 B4 A4 G4 F#4 G4 D5 C5 A4 F4 E4'.split(' ');
  assert.deepEqual(prstoklad(melodie), prstoklad(melodie));
});

test('fingering creates no impossible stretch and no crossing without the thumb', () => {
  // a deterministic "random" walk: steps, leaps, black keys
  let x = 64, seed = 7;
  const rada = [];
  for (let i = 0; i < 400; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const krok = [-12, -7, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 7, 9, 12, 14][seed % 17];
    x = Math.max(55, Math.min(88, x + krok));
    rada.push(x);
  }
  const p = prstoklad(rada);
  assert.ok(p.every(f => f >= 1 && f <= 5));
  for (let i = 1; i < rada.length; i++) {
    assert.ok(hratelnePrstoklad(p[i - 1], rada[i - 1], p[i], rada[i]), `${i}: ${p[i - 1]}@${rada[i - 1]} → ${p[i]}@${rada[i]}`);
  }
});

test('the prstoklad option adds fingers to the right hand, not the left', () => {
  const q = vytvorUroven(pisenC(), 3, { prstoklad: true });
  assert.ok(q.takty.every(t => t.noty.every(x => x.t === 'r' || (x.prst >= 1 && x.prst <= 5))));
  assert.ok(q.takty.every(t => t.leva.every(x => !x.prst)));
  assert.deepEqual(q.takty[0].noty.map(x => x.prst), [1, 3, 5]);           // C E G
  assert.ok(!vytvorUroven(pisenC(), 3).takty[0].noty[0].prst);
});

test('levels render in Verovio', async () => {
  const { default: createVerovioModule } = await import('verovio/wasm');
  const { VerovioToolkit } = await import('verovio/esm');
  const tk = new VerovioToolkit(await createVerovioModule());
  for (const id of [1, 3, 4]) {
    assert.ok(tk.loadData(naMusicXml(vytvorUroven(pisenD(), id, { transpozice: 'C', prstoklad: true }))), `level ${id}`);
    assert.ok(tk.getPageCount() >= 1);
  }
});

test('real songs: all levels and transpositions pass (private, only when available)', () => {
  const d = new URL('../private/songs/', import.meta.url);
  if (!existsSync(d)) return;
  for (const f of readdirSync(d).filter(x => x.endsWith('.musicxml'))) {
    const p = zMusicXml(readFileSync(new URL(f, d), 'utf8'));
    const snimek = JSON.stringify(p);
    for (const transpozice of ['ne', 'C', 'snadna']) {
      for (const id of [1, 2, 3, 4, 5]) {
        const q = vytvorUroven(p, id, { transpozice, prstoklad: true });
        overUroven(p, q, `${f} level ${id} ${transpozice}`);
        for (const t of q.takty) for (const x of t.leva || []) for (const v of vysky(x.t)) assert.ok(v.midi >= 36 && v.midi <= 60, `${f}: ${x.t}`);
        if (transpozice === 'C') assert.equal(q.predznamenani, 0);
      }
    }
    // level 1 really is simpler: sixteenths and triplets only where a syllable would otherwise be lost
    const q1 = vytvorUroven(p, 1);
    for (const t of q1.takty) for (const x of t.noty) {
      if (zlomek(x.d) < 0.5 - 1e-6 || typNoty(zlomek(x.d)).trioly) assert.ok(String(x.s || '').trim(), `${f}: ${x.t} ${x.d}`);
    }
    assert.equal(JSON.stringify(p), snimek);
  }
});

test('child fingering uses a hand shift for intervals wider than nine semitones', () => {
  const rada = ['C4', 'A4', 'C4', 'C5'];
  const p = zaklad([{ noty: rada.map(t => n(t, '1/4')) }], { takt: '4/4' });
  const prsty = vek => vytvorUroven(p, 2, { prstoklad: true, vek }).takty[0].noty.map(n => n.prst);
  assert.deepEqual(prsty('dospely'), [1, 5, 1, 5]);
  const detske = prsty('dite');
  assert.equal(detske[2], detske[3], 'the octave requires moving the hand');
});

test('transposition does not introduce crossing between simultaneous hands', () => {
  const p = zaklad([{ noty: [n('C7', '1/1')], leva: [n('B6', '1/4'), n('C2', '3/4')] },
    { noty: [n('C7', '1/1')], leva: [n('C2', '1/1')] }], { predznamenani: 0, takt: '4/4' });
  const [t] = transponuj(p, 'C').takty;
  assert.ok(midi(t.noty[0].t) >= midi(t.leva[0].t));
});

test('accompaniment of the second ending inherits the chord from the played predecessor', () => {
  const p = zaklad([
    { noty: [n('C4', '3/4')], akordy: [{ doba: 0, znacka: 'C' }], znacky: { zacatekRepetice: true } },
    { noty: [n('D4', '3/4')], akordy: [{ doba: 0, znacka: 'G' }], znacky: { volta: [1], konecRepetice: true } },
    { noty: [n('E4', '3/4')], znacky: { volta: [2] } },
  ]);
  for (const id of [3, 4, 5]) {
    const { pisen, poradi } = vytvorHranouUroven(p, id);
    assert.deepEqual(poradi, [0, 1, 0, 2]);
    assert.ok(vysky(pisen.takty.at(-1).leva[0].t).some(v => v.midi % 12 === 0), `level ${id}`);
  }
});

test('generated left hand ends on the barline after five sixteenth-note quintuplets', () => {
  const p = zaklad([{ akordy: [{ doba: 0, znacka: 'C' }], noty: [...'CDEFG'].map(k => n(k + '4', '1/20')) }], { takt: '1/4' });
  for (const id of [3, 4, 5]) {
    const { pisen } = vytvorHranouUroven(p, id);
    const bar = pisen.takty[0];
    assert.equal(soucetTaktu(bar.noty), soucetTaktu(bar.leva), `level ${id}`);
    assert.ok(vysky(bar.leva[0].t).some(v => v.midi % 12 === 0), `level ${id}`);
  }
});
