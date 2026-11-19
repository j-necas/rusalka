// Internal song model and MusicXML ↔ model conversion. Pure functions without DOM (except zMusicXml, which needs
// globalThis.DOMParser – the browser has it, tests supply it from @xmldom/xmldom).
//
// MODEL "Pisen" (shared contract of all modules):
// {
//   nazev: string, autor: string,
//   klic: 'houslovy' | 'basovy',            // clef of the melody (right hand); the left hand is always in bass clef
//   predznamenani: int,                       // number of sharps (+) / flats (−)
//   takt: '3/4',                              // time signature
//   tempo: int,                               // quarter beats per minute, 0 = not given
//   takty: [{
//     akordy: [{ doba: number, znacka: string }],   // doba = position in the bar in quarter beats from the bar start
//     noty:  [Nota],                                  // melody (right hand)
//     leva?: [Nota],                                  // left hand (optional)
//     znacky?: { zacatekRepetice?, konecRepetice?, volta?: number[], segno?, coda?, doCody?, fine?, dc?, ds? }
//   }],
//   nejistoty?: string[]
// }
// Nota = { t: 'F#4' | 'Bb3' | 'C4 E4 G4' (chord, space-separated) | 'r' (rest),
//          d: '1/4' (fraction of a whole note; '3/8' = dotted quarter; '1/12' = eighth-note triplet),
//          lig: bool (tie to the next note), s: string (syllable; trailing '-' = the word continues), prst?: 1..5 }
import { soustava } from './note_names.js';

export const DIV = 24;                                   // divisions per quarter (32nds and triplets too)
const KROK_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const KROKY = 'CDEFGAB';

// ---------------------------------------------------------------- durations
/** '3/8' → duration in quarter beats (1.5); invalid → null */
export function zlomek(d) {
  const m = String(d ?? '').trim().match(/^(\d+)(?:\/(\d+))?$/);
  if (!m || Number(m[2] || 1) === 0) return null;
  return 4 * Number(m[1]) / Number(m[2] || 1);
}
/** duration in quarter beats → simplest fraction of a whole note ('3/8'); null if that fails */
export function naZlomek(q) {
  for (const den of [1, 2, 4, 8, 16, 32, 64, 3, 6, 12, 24, 48, 96]) {
    const num = q / 4 * den;
    if (Math.abs(num - Math.round(num)) < 1e-6 && Math.round(num) > 0) {
      let a = Math.round(num), b = den;
      const g = gcd(a, b);
      return `${a / g}/${b / g}`;
    }
  }
  return null;
}
function gcd(a, b) { return b ? gcd(b, a % b) : a; }

const TYPY = [[4, 'whole'], [2, 'half'], [1, 'quarter'], [0.5, 'eighth'], [0.25, '16th'], [0.125, '32nd']];
/** duration in quarter beats → { typ, tecky, trioly } for writing as a single note, otherwise null */
export function typNoty(q) {
  for (const trioly of [false, true]) {
    const qq = trioly ? q * 1.5 : q;
    for (const [z, typ] of TYPY) {
      for (let tecky = 0; tecky <= 2; tecky++) {
        if (Math.abs(z * (2 - 1 / 2 ** tecky) - qq) < 1e-6) return { typ, tecky, trioly };
      }
    }
  }
  return null;
}
/** '3/4' → { beats, beatType, delka (in quarter beats), doba (beaming) } */
export function metrum(takt) {
  const m = String(takt || '4/4').match(/^(\d+)\/(\d+)$/) || [0, 4, 4];
  const beats = Number(m[1]), beatType = Number(m[2]);
  const slozeny = beatType === 8 && beats % 3 === 0;
  return { beats, beatType, delka: beats * 4 / beatType, doba: beatType === 8 ? (slozeny || beats === 3 ? 1.5 : 0.5) : 1 };
}
export const soucetTaktu = noty => (noty || []).reduce((a, n) => a + (zlomek(n.d) || 0), 0);

// ---------------------------------------------------------------- pitches
/** 'F#4' → { krok: 'F', alter: 1, okt: 4, midi: 66 }; Czech H = B; invalid → null */
export function vyska(t) {
  const m = String(t ?? '').trim().match(/^([A-Ha-h])(##|#|bb|b|is|es)?(-?\d)$/);
  if (!m) return null;
  let krok = m[1].toUpperCase();
  if (krok === 'H') krok = 'B';
  const alter = { '#': 1, '##': 2, b: -1, bb: -2, is: 1, es: -1 }[m[2]] || 0;
  const okt = Number(m[3]);
  return { krok, alter, okt, midi: 12 * (okt + 1) + KROK_PC[krok] + alter };
}
/** pitches of a note as an array (chord 'C4 E4 G4'); rest → [] */
export function vysky(t) {
  if (String(t).trim() === 'r') return [];
  return String(t).trim().split(/\s+/).map(vyska).filter(Boolean);
}
/** MIDI → pitch spelled according to the key signature ('F#4' in D major, 'Gb4' in D-flat major) */
export function zMidi(midi, predznamenani = 0) {
  const pc = ((midi % 12) + 12) % 12, okt = Math.floor(midi / 12) - 1;
  const krizky = ['C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const becka = ['Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const nazev = pc === 0 ? 'C' : (predznamenani < 0 ? becka : krizky)[pc - 1];
  // B# / Cb would need an octave shift – we don't use them
  return nazev + okt;
}
/** step by one degree in the key (diatonically): smer +1 / −1 */
export function diatonickyKrok(t, smer, predznamenani = 0) {
  const v = vyska(t);
  if (!v) return t;
  let i = KROKY.indexOf(v.krok) + smer, okt = v.okt;
  if (i > 6) { i = 0; okt++; }
  if (i < 0) { i = 6; okt--; }
  const krok = KROKY[i];
  const alter = alterVTonine(krok, predznamenani);
  return krok + (alter === 1 ? '#' : alter === -1 ? 'b' : '') + okt;
}
/** accidental of a step in the given key (F in D major → 1) */
export function alterVTonine(krok, predznamenani) {
  const krizky = 'FCGDAEB', becka = 'BEADGCF';
  if (predznamenani > 0 && krizky.slice(0, predznamenani).includes(krok)) return 1;
  if (predznamenani < 0 && becka.slice(0, -predznamenani).includes(krok)) return -1;
  return 0;
}

// ---------------------------------------------------------------- checks and repeats
/**
 * Bar-length problems as data (no text): [{ takt (number from 1), leva: bool, druh, … }], druh
 * 'neznamaDelka' { d } | 'nezapisovatelna' { d } | 'neznamaVyska' { t } | 'soucet' { soucet: '3/4', metrum: '4/4' }.
 * Accounts for a pickup bar, a short last bar and bars at repeats and voltas. The text in the app language is
 * produced by textKontroly() in practice.js, the Czech one by kontrola().
 */
export function kontrolaPolozky(pisen) {
  const { delka, beats, beatType } = metrum(pisen.takt);
  const out = [];
  const n = pisen.takty.length;
  pisen.takty.forEach((t, i) => {
    for (const [leva, noty] of [[false, t.noty], [true, t.leva]]) {
      if (!noty || (leva && !noty.length)) continue;
      const takt = i + 1;
      for (const nota of noty) {
        if (zlomek(nota.d) == null) out.push({ takt, leva, druh: 'neznamaDelka', d: nota.d });
        else if (!typNoty(zlomek(nota.d))) out.push({ takt, leva, druh: 'nezapisovatelna', d: nota.d });
        if (nota.t !== 'r' && !vysky(nota.t).length) out.push({ takt, leva, druh: 'neznamaVyska', t: nota.t });
      }
      const s = soucetTaktu(noty);
      if (Math.abs(s - delka) < 1e-6) continue;
      const z = t.znacky || {}, dalsi = (pisen.takty[i + 1] || {}).znacky || {};
      const smiBytKratky = i === 0 || i === n - 1 || z.konecRepetice || z.volta || dalsi.zacatekRepetice || dalsi.volta
        || z.fine || z.dc || z.ds || z.doCody || dalsi.coda || dalsi.segno;
      if (s < delka && smiBytKratky) continue;
      const fmt = q => `${Math.round(q / 4 * beatType * 1000) / 1000}/${beatType}`;
      out.push({ takt, leva, druh: 'soucet', soucet: fmt(s), metrum: `${beats}/${beatType}` });
    }
  });
  return out;
}

const KONTROLA_CESKY = {
  neznamaDelka: p => `neznámá délka "${p.d}"`,
  nezapisovatelna: p => `délka ${p.d} se nedá zapsat jednou notou`,
  neznamaVyska: p => `neznámá výška "${p.t}"`,
  soucet: p => `součet délek ${p.soucet} místo ${p.metrum}`,
};
/** bar-length problems in Czech ('takt 5 (levá ruka): součet délek 3/4 místo 4/4'); see kontrolaPolozky */
export function kontrola(pisen) {
  return kontrolaPolozky(pisen).map(p => `takt ${p.takt}${p.leva ? ' (levá ruka)' : ''}: ${KONTROLA_CESKY[p.druh](p)}`);
}

/**
 * Unrolls repeats, voltas, D.C./D.S. al Fine/Coda into a linear order. Returns { pisen, poradi }, where poradi[i] is
 * the index of the original bar (for mapping mistakes back and for the editor). Nested repeats are not supported
 * (the outer one is used).
 */
export function rozvin(pisen) {
  const T = pisen.takty, poradi = [];
  const z = i => T[i].znacky || {};
  let i = 0, pruchod = 1, zacatek = 0, skok = false, poSkoku = false, ochrana = 0;
  const hrano = new Set();                                   // pairs "end of repeat already repeated"
  while (i < T.length && ochrana++ < 10000) {
    const zi = z(i);
    if (zi.zacatekRepetice && !hrano.has('start' + i)) { zacatek = i; hrano.add('start' + i); pruchod = 1; }
    if (zi.volta && zi.volta.length && !zi.volta.includes(pruchod)) {   // skip a volta of a different pass
      i++; continue;
    }
    if (poSkoku && zi.doCody) {                               // "To Coda" after D.S./D.C. → jump to the Coda
      const c = T.findIndex(t => (t.znacky || {}).coda);
      poradi.push(i);
      if (c >= 0) { i = c; poSkoku = false; continue; }
    } else poradi.push(i);
    if (poSkoku && zi.fine) break;
    if (zi.konecRepetice && hrano.has('konec' + i)) {         // repeat played → the next one without a start begins here
      zacatek = i + 1; pruchod = 1;
    }
    if (zi.konecRepetice && !hrano.has('konec' + i)) {
      hrano.add('konec' + i);
      pruchod++;
      i = zacatek;
      hrano.delete('start' + zacatek); hrano.add('start' + zacatek);   // a start does not reset the pass
      continue;
    }
    if ((zi.dc || zi.ds) && !skok) {
      skok = true; poSkoku = true; pruchod = 1;
      i = zi.ds ? Math.max(0, T.findIndex(t => (t.znacky || {}).segno)) : 0;
      continue;
    }
    i++;
  }
  const takty = poradi.map(k => {
    const t = { ...T[k], znacky: undefined };
    delete t.znacky;
    return t;
  });
  return { pisen: { ...pisen, takty }, poradi };
}

// ---------------------------------------------------------------- chord symbols
/** 'Hmi' / 'Bm' / 'F#7/C#' → { koren: 'B', alter, druh (MusicXML kind), text, bas: {krok, alter} | null } */
export function akordZnacky(znacka) {
  const m = String(znacka ?? '').trim().match(/^([A-Ha-h])(#|b|is|es)?([^/]*)(?:\/([A-Ha-h])(#|b)?)?$/);
  if (!m) return null;
  const koren = m[1].toUpperCase() === 'H' ? 'B' : m[1].toUpperCase();
  const alter = { '#': 1, is: 1, b: -1, es: -1 }[m[2]] || 0;
  const q = (m[3] || '').trim();
  const ql = q.toLowerCase().replace(/^mi(?=$|\d|n)/, 'm').replace(/^min/, 'm');
  const druh = /^(maj7|Δ|ma7)/i.test(q) ? 'major-seventh' : /^m7b5|ø/.test(ql) ? 'half-diminished'
    : /^(dim7|°7)/.test(ql) ? 'diminished-seventh' : /^(dim|°)/.test(ql) ? 'diminished'
      : /^(aug|\+)/.test(ql) ? 'augmented' : /^m7/.test(ql) ? 'minor-seventh' : /^m6/.test(ql) ? 'minor-sixth'
        : /^m9/.test(ql) ? 'minor-ninth' : /^m(?!aj)/.test(ql) ? 'minor' : /^sus2/.test(ql) ? 'suspended-second'
          : /^sus/.test(ql) ? 'suspended-fourth' : /^9/.test(ql) ? 'dominant-ninth' : /^7/.test(ql) ? 'dominant'
            : /^6/.test(ql) ? 'major-sixth' : 'major';
  const bas = m[4] ? { krok: m[4].toUpperCase() === 'H' ? 'B' : m[4].toUpperCase(), alter: m[5] === '#' ? 1 : m[5] === 'b' ? -1 : 0 } : null;
  return { koren, alter, druh, text: q, bas };
}
export const DRUHY = {
  major: [0, 4, 7], minor: [0, 3, 7], augmented: [0, 4, 8], diminished: [0, 3, 6], dominant: [0, 4, 7, 10],
  'major-seventh': [0, 4, 7, 11], 'minor-seventh': [0, 3, 7, 10], 'diminished-seventh': [0, 3, 6, 9],
  'augmented-seventh': [0, 4, 8, 10], 'half-diminished': [0, 3, 6, 10], 'major-minor': [0, 3, 7, 11],
  'major-sixth': [0, 4, 7, 9], 'minor-sixth': [0, 3, 7, 9], 'dominant-ninth': [0, 4, 7, 10, 14],
  'major-ninth': [0, 4, 7, 11, 14], 'minor-ninth': [0, 3, 7, 10, 14], 'suspended-second': [0, 2, 7],
  'suspended-fourth': [0, 5, 7], power: [0, 7],
};
/** chord tones as pitch classes: { koren: pc, bas: pc, tony: [pc…] } */
export function tonyAkordu(znacka) {
  const a = akordZnacky(znacka);
  if (!a) return null;
  const koren = (KROK_PC[a.koren] + a.alter + 12) % 12;
  const bas = a.bas ? (KROK_PC[a.bas.krok] + a.bas.alter + 12) % 12 : koren;
  return { koren, bas, tony: (DRUHY[a.druh] || [0, 4, 7]).map(x => (koren + x) % 12) };
}

// ---------------------------------------------------------------- model → MusicXML
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function harmonyXml(znacka, offset) {
  const a = akordZnacky(znacka);
  if (!a) return '';
  const h = a.koren === 'B' && !a.alter && soustava() === 'cs' ? ' text="H"' : '';
  const bas = a.bas ? `<bass><bass-step${a.bas.krok === 'B' && !a.bas.alter && soustava() === 'cs' ? ' text="H"' : ''}>${a.bas.krok}</bass-step>`
    + `${a.bas.alter ? `<bass-alter>${a.bas.alter}</bass-alter>` : ''}</bass>` : '';
  return `<harmony print-frame="no"><root><root-step${h}>${a.koren}</root-step>${a.alter ? `<root-alter>${a.alter}</root-alter>` : ''}</root>`
    + `<kind text="${esc(a.text)}">${a.druh}</kind>${bas}${offset ? `<offset>${offset}</offset>` : ''}</harmony>`;
}

/** beams by beats: for each note a list of [number, type] */
function tramce(noty, doba) {
  const tram = noty.map(() => []);
  let skupina = [], pos = 0;
  const q = noty.map(n => zlomek(n.d) || 0);
  const uzavri = () => {
    if (skupina.length >= 2) {
      skupina.forEach((i, k) => tram[i].push([1, k === 0 ? 'begin' : k === skupina.length - 1 ? 'end' : 'continue']));
      for (let k = 0; k < skupina.length;) {
        if (q[skupina[k]] > 0.25 + 1e-6) { k++; continue; }
        let e = k;
        while (e + 1 < skupina.length && q[skupina[e + 1]] <= 0.25 + 1e-6) e++;
        if (e === k) tram[skupina[k]].push([2, k === 0 ? 'forward hook' : 'backward hook']);
        else for (let x = k; x <= e; x++) tram[skupina[x]].push([2, x === k ? 'begin' : x === e ? 'end' : 'continue']);
        k = e + 1;
      }
    }
    skupina = [];
  };
  noty.forEach((n, i) => {
    if (Math.abs(pos / doba - Math.round(pos / doba)) < 1e-6) uzavri();
    if (n.t !== 'r' && q[i] && q[i] < 1 - 1e-6) skupina.push(i); else uzavri();
    pos += q[i];
  });
  uzavri();
  return tram;
}

const POSUVKY = { '-2': 'flat-flat', '-1': 'flat', 0: 'natural', 1: 'sharp', 2: 'double-sharp' };

/** one staff of a bar → note XML; stav = { lig: Set midi, slovo, trioly } carried across bars */
function notyXml(noty, staff, stav, sAkordy, doba, predznamenani = 0) {
  const x = [];
  // accidentals valid in this bar and staff: step+octave → alter (otherwise the key signature applies)
  const platne = new Map();
  const tram = tramce(noty, doba);
  let pos = 0;
  const akordy = [...(sAkordy || [])];
  noty.forEach((n, i) => {
    const q = zlomek(n.d) || 0;
    const dalsi = pos + q;
    const tady = akordy.filter(a => { const dd = Number(a.doba) || 0; return dd >= pos - 1e-6 && (dd < dalsi - 1e-6 || i === noty.length - 1); })
      .sort((a, b) => (Number(a.doba) || 0) - (Number(b.doba) || 0));
    for (const a of tady) {
      x.push(harmonyXml(a.znacka, Math.round(((Number(a.doba) || 0) - pos) * DIV)));
      akordy.splice(akordy.indexOf(a), 1);
    }
    const ty = typNoty(q) || { typ: 'quarter', tecky: 0, trioly: false };
    const dur = Math.max(1, Math.round(q * DIV));
    const vs = vysky(n.t);
    const notations = [];
    let tupl = '';
    if (ty.trioly) {
      stav.trioly = (stav.trioly + 1) % 3;
      if (stav.trioly === 1) notations.push('<tuplet type="start" bracket="yes"/>');
      if (stav.trioly === 0) notations.push('<tuplet type="stop"/>');
      tupl = '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>';
    } else stav.trioly = 0;
    if (!vs.length) {
      x.push(`<note><rest/><duration>${dur}</duration><voice>${staff}</voice><type>${ty.typ}</type>${'<dot/>'.repeat(ty.tecky)}${tupl}`
        + `${staff > 1 ? `<staff>${staff}</staff>` : ''}${notations.length ? `<notations>${notations.join('')}</notations>` : ''}</note>`);
      stav.lig = new Set();
    } else {
      const noveLig = new Set();
      vs.forEach((v, k) => {
        const stop = stav.lig.has(v.midi), start = !!n.lig;
        if (start) noveLig.add(v.midi);
        const nt = [...(k === 0 ? notations : [])];
        if (stop) nt.push('<tied type="stop"/>');        // stop before start: a note inside a chain of ties
        if (start) nt.push('<tied type="start"/>');
        if (k === 0 && n.prst) nt.push(`<technical><fingering>${n.prst}</fingering></technical>`);
        // an accidental is drawn when it differs from the key signature or from an earlier accidental in the bar; a tied note doesn't repeat it
        const klicVysky = v.krok + v.okt;
        const plati = platne.has(klicVysky) ? platne.get(klicVysky) : alterVTonine(v.krok, predznamenani);
        const posuvka = !stop && v.alter !== plati ? POSUVKY[v.alter] : '';
        if (!stop) platne.set(klicVysky, v.alter);
        let telo = `<note>${k > 0 ? '<chord/>' : ''}<pitch><step>${v.krok}</step>${v.alter ? `<alter>${v.alter}</alter>` : ''}<octave>${v.okt}</octave></pitch>`
          + `<duration>${dur}</duration>${stop ? '<tie type="stop"/>' : ''}${start ? '<tie type="start"/>' : ''}`
          + `<voice>${staff}</voice><type>${ty.typ}</type>${'<dot/>'.repeat(ty.tecky)}${posuvka ? `<accidental>${posuvka}</accidental>` : ''}${tupl}${staff > 1 ? `<staff>${staff}</staff>` : ''}`;
        if (k === 0) telo += tram[i].map(([c, typB]) => `<beam number="${c}">${typB}</beam>`).join('');
        if (nt.length) telo += `<notations>${nt.join('')}</notations>`;
        const sl = String(n.s || '').trim();
        if (k === 0 && sl && staff === 1) {
          const pokracuje = sl.endsWith('-');
          const syl = stav.slovo ? (pokracuje ? 'middle' : 'end') : (pokracuje ? 'begin' : 'single');
          stav.slovo = pokracuje;
          telo += `<lyric number="1"><syllabic>${syl}</syllabic><text>${esc(sl.replace(/-+$/, ''))}</text></lyric>`;
        }
        x.push(telo + '</note>');
      });
      stav.lig = noveLig;
    }
    pos = dalsi;
  });
  return { xml: x.join(''), delka: pos };
}

/** model → MusicXML (one staff, or two when some bar has a left hand); repeats are written as marks */
export function naMusicXml(pisen) {
  const met = metrum(pisen.takt);
  const fifths = Math.max(-7, Math.min(7, Number(pisen.predznamenani) || 0));
  const dveOsnovy = pisen.takty.some(t => t.leva && t.leva.length);
  const stavP = { lig: new Set(), slovo: false, trioly: 0 }, stavL = { lig: new Set(), slovo: false, trioly: 0 };
  const takty = pisen.takty.map((t, ti) => {
    const x = [`<measure number="${ti + 1}">`];
    const z = t.znacky || {};
    if (z.zacatekRepetice || (z.volta && z.volta.length) || z.segno || z.coda) {
      x.push('<barline location="left">' + (z.zacatekRepetice ? '<bar-style>heavy-light</bar-style><repeat direction="forward"/>' : '')
        + (z.volta && z.volta.length ? `<ending number="${z.volta.join(',')}" type="start">${z.volta.join('., ')}.</ending>` : '')
        + (z.segno ? '<segno/>' : '') + (z.coda ? '<coda/>' : '') + '</barline>');
    }
    if (ti === 0) {
      const klic = pisen.klic === 'basovy' ? '<sign>F</sign><line>4</line>' : '<sign>G</sign><line>2</line>';
      x.push(`<attributes><divisions>${DIV}</divisions><key><fifths>${fifths}</fifths></key>`
        + `<time><beats>${met.beats}</beats><beat-type>${met.beatType}</beat-type></time>`
        + (dveOsnovy ? `<staves>2</staves><clef number="1">${klic}</clef><clef number="2"><sign>F</sign><line>4</line></clef>`
          : `<clef>${klic}</clef>`) + '</attributes>');
      if (pisen.tempo > 0) x.push(`<sound tempo="${pisen.tempo}"/>`);
    }
    const slova = [];
    if (z.fine) slova.push('Fine');
    if (z.dc) slova.push('D.C.');
    if (z.ds) slova.push('D.S.');
    if (z.doCody) slova.push('To Coda');
    const prava = notyXml(t.noty || [], 1, stavP, t.akordy, met.doba, fifths);
    x.push(prava.xml);
    if (dveOsnovy) {
      x.push(`<backup><duration>${Math.round(prava.delka * DIV)}</duration></backup>`);
      const lv = t.leva && t.leva.length ? t.leva : [{ t: 'r', d: naZlomek(prava.delka > 0 ? prava.delka : met.delka) || '1/1' }];
      x.push(notyXml(lv, 2, stavL, [], met.doba, fifths).xml);
    }
    if (slova.length) x.push(`<direction placement="above"><direction-type><words>${slova.join(' ')}</words></direction-type></direction>`);
    const posledni = ti === pisen.takty.length - 1;
    if (z.konecRepetice || (z.volta && z.volta.length) || posledni) {
      x.push('<barline location="right">'
        + (z.konecRepetice ? '<bar-style>light-heavy</bar-style>' : posledni ? '<bar-style>light-heavy</bar-style>' : '')
        + (z.volta && z.volta.length ? `<ending number="${z.volta.join(',')}" type="${z.konecRepetice ? 'stop' : 'discontinue'}"/>` : '')
        + (z.konecRepetice ? '<repeat direction="backward"/>' : '') + '</barline>');
    }
    x.push('</measure>');
    return x.join('');
  });
  const nazev = String(pisen.nazev || 'Nová písnička').trim();
  return '<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0">'
    + `<work><work-title>${esc(nazev)}</work-title></work>`
    + (pisen.autor ? `<identification><creator type="composer">${esc(pisen.autor)}</creator></identification>` : '')
    + `<part-list><score-part id="P1"><part-name>${dveOsnovy ? 'Klavír' : 'Melodie'}</part-name></score-part></part-list>`
    + `<part id="P1">${takty.join('')}</part></score-partwise>\n`;
}

// ---------------------------------------------------------------- MusicXML → model
const deti = (el, tag) => [...(el?.childNodes || [])].filter(c => c.nodeType === 1 && c.tagName === tag);
const dite = (el, tag) => deti(el, tag)[0] || null;
const text = (el, tag) => (dite(el, tag)?.textContent || '').trim();

/** "no notes in the file" error; klic = text in the app language (t(e.klic) from texts.js), message stays Czech */
const bezNot = () => Object.assign(new Error('v souboru nejsou noty'), { klic: 'cviceni.chyba.zadneNoty' });

/** MusicXML (text) → model. Takes the 1st part: staff 1 = melody (voice 1), staff 2 = left hand (voice 1 of that staff). */
export function zMusicXml(xml) {
  const P = globalThis.DOMParser;
  if (!P) throw new Error('chybí DOMParser');
  const doc = new P().parseFromString(xml, 'application/xml');
  const koren = doc.documentElement;
  const nazev = (doc.getElementsByTagName('work-title')[0]?.textContent
    || doc.getElementsByTagName('movement-title')[0]?.textContent || '').trim();
  const autor = ([...doc.getElementsByTagName('creator')].find(c => c.getAttribute('type') === 'composer')?.textContent || '').trim();
  const part = deti(koren, 'part')[0];
  if (!part) throw bezNot();
  const pisen = { nazev, autor, klic: 'houslovy', predznamenani: 0, takt: '4/4', tempo: 0, takty: [], nejistoty: [] };
  let div = 1, prvniAttr = true;
  const lig = { 1: new Set(), 2: new Set() };
  for (const m of deti(part, 'measure')) {
    const takt = { akordy: [], noty: [], znacky: {} };
    const leva = [];
    let pos = 0;
    const hlas = {};                                      // the first voice that appears on the staff
    let posledniNota = { 1: null, 2: null };
    for (const el of [...m.childNodes].filter(c => c.nodeType === 1)) {
      const tag = el.tagName;
      if (tag === 'attributes') {
        if (text(el, 'divisions')) div = Number(text(el, 'divisions'));
        const key = dite(el, 'key');
        if (key && text(key, 'fifths') !== '' && prvniAttr) pisen.predznamenani = Number(text(key, 'fifths'));
        const time = dite(el, 'time');
        if (time && text(time, 'beats') && prvniAttr) pisen.takt = `${text(time, 'beats')}/${text(time, 'beat-type')}`;
        for (const clef of deti(el, 'clef')) {
          const num = clef.getAttribute('number') || '1';
          if (num === '1' && prvniAttr) pisen.klic = text(clef, 'sign') === 'F' ? 'basovy' : 'houslovy';
        }
        prvniAttr = false;
      } else if (tag === 'sound' && el.getAttribute('tempo') && !pisen.tempo) {
        pisen.tempo = Math.round(Number(el.getAttribute('tempo')));
      } else if (tag === 'direction') {
        const snd = dite(el, 'sound');
        if (snd && snd.getAttribute('tempo') && !pisen.tempo) pisen.tempo = Math.round(Number(snd.getAttribute('tempo')));
        const w = (el.getElementsByTagName('words')[0]?.textContent || '').trim().toLowerCase();
        if (/^fine/.test(w)) takt.znacky.fine = true;
        if (/d\.\s*c\./.test(w)) takt.znacky.dc = true;
        if (/d\.\s*s\./.test(w)) takt.znacky.ds = true;
        if (/to coda/.test(w)) takt.znacky.doCody = true;
        if (el.getElementsByTagName('segno').length) takt.znacky.segno = true;
        if (el.getElementsByTagName('coda').length) takt.znacky.coda = true;
      } else if (tag === 'harmony') {
        const r = dite(el, 'root');
        if (r) {
          const krok = text(r, 'root-step'), alt = Number(text(r, 'root-alter') || 0);
          const k = dite(el, 'kind');
          const druh = k?.textContent?.trim() || 'major';
          const zkratky = { major: '', minor: 'm', dominant: '7', 'major-seventh': 'maj7', 'minor-seventh': 'm7',
            diminished: 'dim', 'diminished-seventh': 'dim7', augmented: 'aug', 'half-diminished': 'm7b5',
            'major-sixth': '6', 'minor-sixth': 'm6', 'dominant-ninth': '9', 'minor-ninth': 'm9',
            'suspended-fourth': 'sus4', 'suspended-second': 'sus2' };
          const zk = k && k.getAttribute('text') != null ? k.getAttribute('text') : (zkratky[druh] ?? '');
          const b = dite(el, 'bass');
          const bas = b ? '/' + text(b, 'bass-step') + (Number(text(b, 'bass-alter') || 0) > 0 ? '#' : Number(text(b, 'bass-alter') || 0) < 0 ? 'b' : '') : '';
          const znacka = krok + (alt > 0 ? '#' : alt < 0 ? 'b' : '') + zk + bas;
          takt.akordy.push({ doba: (pos + Number(text(el, 'offset') || 0)) / div, znacka });
        }
      } else if (tag === 'backup') pos -= Number(text(el, 'duration') || 0);
      else if (tag === 'forward') pos += Number(text(el, 'duration') || 0);
      else if (tag === 'barline') {
        const rep = dite(el, 'repeat');
        if (rep?.getAttribute('direction') === 'forward') takt.znacky.zacatekRepetice = true;
        if (rep?.getAttribute('direction') === 'backward') takt.znacky.konecRepetice = true;
        const end = dite(el, 'ending');
        if (end && end.getAttribute('type') === 'start') {
          takt.znacky.volta = String(end.getAttribute('number') || '1').split(/[,\s]+/).map(Number).filter(Boolean);
        }
        if (dite(el, 'segno')) takt.znacky.segno = true;
        if (dite(el, 'coda')) takt.znacky.coda = true;
      } else if (tag === 'note') {
        if (dite(el, 'grace') || dite(el, 'cue')) continue;
        const staff = Number(text(el, 'staff') || 1);
        const v = text(el, 'voice') || '1';
        const jeAkord = !!dite(el, 'chord');
        const dur = Number(text(el, 'duration') || 0);
        if (staff > 2) { if (!jeAkord) pos += dur; continue; }
        if (!(staff in hlas)) hlas[staff] = v;
        if (hlas[staff] !== v) { if (!jeAkord) pos += dur; continue; }
        const cil = staff === 1 ? takt.noty : leva;
        const p = dite(el, 'pitch');
        let t = 'r';
        let midi = null;
        if (p) {
          const krok = text(p, 'step'), alt = Math.round(Number(text(p, 'alter') || 0)), okt = text(p, 'octave');
          t = krok + (alt === 1 ? '#' : alt === 2 ? '##' : alt === -1 ? 'b' : alt === -2 ? 'bb' : '') + okt;
          midi = vyska(t)?.midi ?? null;
        }
        const ties = deti(el, 'tie').map(x => x.getAttribute('type'));
        if (jeAkord && posledniNota[staff]) {
          posledniNota[staff].t += ' ' + t;
          if (ties.includes('start')) posledniNota[staff].lig = true;
          continue;
        }
        const d = naZlomek(dur / div) || '1/4';
        const nota = { t, d, lig: ties.includes('start'), s: '' };
        // a tie continuation without a new attack is kept as a separate note with the same pitch (the model supports that)
        const lyr = deti(el, 'lyric').find(l => (l.getAttribute('number') || '1') === '1') || deti(el, 'lyric')[0];
        if (lyr && staff === 1) {
          const syl = text(lyr, 'syllabic'), tx = text(lyr, 'text');
          if (tx) nota.s = tx + (syl === 'begin' || syl === 'middle' ? '-' : '');
        }
        const fing = el.getElementsByTagName('fingering')[0]?.textContent?.trim();
        if (fing && /^[1-5]$/.test(fing)) nota.prst = Number(fing);
        cil.push(nota);
        posledniNota[staff] = nota;
        if (midi != null) lig[staff] = new Set(ties.includes('start') ? [midi] : []);
        pos += dur;
      }
    }
    if (leva.length) takt.leva = leva;
    if (!Object.keys(takt.znacky).length) delete takt.znacky;
    pisen.takty.push(takt);
  }
  if (!pisen.takty.some(t => t.noty.length || (t.leva || []).length)) throw bezNot();
  if (!pisen.takty.some(t => t.noty.some(n => n.t !== 'r')) && pisen.takty.some(t => (t.leva || []).length)) {
    for (const t of pisen.takty) { t.noty = t.leva || []; delete t.leva; }        // only one staff, in bass
    pisen.klic = 'basovy';
  }
  return pisen;
}

/** deep copy of the model */
export const kopie = pisen => JSON.parse(JSON.stringify(pisen));
