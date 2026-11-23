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
//     znacky?: { zacatekRepetice?, konecRepetice?, pocetPruchodu?, volta?: number[], segno?, coda?, doCody?, fine?, dc?, ds? }
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
      return kracenyZlomek(Math.round(num), den);
    }
  }
  return null;
}
function gcd(a, b) { return b ? gcd(b, a % b) : a; }
const kracenyZlomek = (a, b) => { const g = gcd(a, b); return `${a / g}/${b / g}`; };
/** Recover a fraction from a MusicXML cursor, also when divisions change within a bar. */
export function naPresnyZlomek(q) {
  const cil = q / 4;
  if (!(cil > 0) || !Number.isFinite(cil)) return null;
  let a = 0, b = 1, c = 1, d = 0, x = cil;
  while (true) {
    const k = Math.floor(x), n = k * c + a, j = k * d + b;
    if (j > 1000000 || !Number.isSafeInteger(n)) return c && d ? `${c}/${d}` : null;
    if (n && Math.abs(n / j - cil) < 1e-10) return `${n}/${j}`;
    [a, b, c, d] = [c, d, n, j];
    x = 1 / (x - k);
  }
}

const TYPY = [[4, 'whole'], [2, 'half'], [1, 'quarter'], [0.5, 'eighth'], [0.25, '16th'], [0.125, '32nd'], [0.0625, '64th']];
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
/** Recover common tuplets from a reduced sounding duration; the original score keeps its printed grouping. */
function zapisDelky(d) {
  const q = zlomek(d);
  const typ = typNoty(q);
  if (typ) return typ.trioly ? { ...typ, skutecne: 3, normalni: 2 } : typ;
  let skutecne = Number(String(d).split('/')[1]);
  while (skutecne > 0 && skutecne % 2 === 0) skutecne /= 2;
  if (!(skutecne > 1)) return null;
  const normalni = 2 ** Math.floor(Math.log2(skutecne));
  const psany = typNoty(q * skutecne / normalni);
  return psany && !psany.trioly ? { ...psany, skutecne, normalni } : null;
}
const DELKY_PO_CASTECH = [4, 3, 2, 1.5, 1, 0.75, 2 / 3, 0.5, 0.375, 1 / 3, 0.25, 1 / 6, 0.125, 1 / 12];
/** Split a duration into writable notes, keeping any remainder outside the common grid. */
export function rozlozDelku(q) {
  const out = [];
  if (!Number.isFinite(q)) return out;
  let zbyva = q;
  while (zbyva > 1e-8) {
    // Every integer number of ticks >= 2 can be written with 2- and 3-tick notes.
    const d = DELKY_PO_CASTECH.find(x => x <= zbyva + 1e-8 && Math.abs((zbyva - x) * DIV - 1) > 1e-8) || zbyva;
    out.push(d);
    zbyva -= d;
  }
  return out;
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
export function zMidi(midi, predznamenani = 0, moll) {
  if (typeof moll === 'boolean') {
    const pc = m => ((m % 12) + 12) % 12;
    const nazev = (krok, alter) => krok + ({ '-2': 'bb', '-1': 'b', 1: '#', 2: '##' }[alter] || '')
      + ((midi - KROK_PC[krok] - alter) / 12 - 1);
    const diatonicky = [...KROKY].find(k => pc(KROK_PC[k] + alterVTonine(k, predznamenani)) === pc(midi));
    if (diatonicky) return nazev(diatonicky, alterVTonine(diatonicky, predznamenani));
    const dur = ((4 * predznamenani) % 7 + 7) % 7;
    const tonika = KROKY[moll ? (dur + 5) % 7 : dur];
    const odToniky = pc(midi - KROK_PC[tonika] - alterVTonine(tonika, predznamenani));
    // Chromatic degrees relative to the tonic: borrowed thirds/sixths/sevenths in major and raised sixth/seventh in minor.
    const stupen = (moll ? { 1: 1, 4: 2, 6: 3, 9: 5, 11: 6 } : { 1: 0, 3: 2, 6: 3, 8: 5, 10: 6 })[odToniky];
    if (stupen != null) {
      const krok = KROKY[(KROKY.indexOf(tonika) + stupen) % 7];
      const alter = pc(midi - KROK_PC[krok] + 6) - 6;
      if (Math.abs(alter) <= 2) return nazev(krok, alter);
    }
  }
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
        else if (!zapisDelky(nota.d)) out.push({ takt, leva, druh: 'nezapisovatelna', d: nota.d });
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
 * the index of the original bar (for mapping mistakes back and for the editor). Nested repeats are not supported.
 */
export function rozvin(pisen) {
  const T = pisen.takty, poradi = [];
  const znacky = T.map(t => t.znacky || {});
  const repetice = [];
  let zacatek = 0;
  for (let i = 0; i < T.length; i++) {
    if (znacky[i].zacatekRepetice) zacatek = i;
    if (!znacky[i].konecRepetice) continue;
    let konec = i;
    while (znacky[konec + 1]?.volta?.length && !znacky[konec + 1].zacatekRepetice) konec++;
    const usek = znacky.slice(zacatek, konec + 1);
    const pocet = Math.max(0, ...usek.map(z => z.pocetPruchodu || 0))
      || Math.max(2, ...usek.flatMap(z => z.volta || []));
    const rep = { zacatek, konec, pocet, pruchod: 1 };
    for (let j = zacatek; j <= konec; j++) repetice[j] = rep;
    zacatek = konec + 1;
    i = konec;
  }
  let i = 0, skok = false, poSkoku = false, ochrana = 0;
  while (i < T.length && ochrana++ < Math.max(10000, T.length * 2)) {
    const zi = znacky[i], rep = repetice[i];
    const pruchod = rep ? (poSkoku ? rep.pocet : rep.pruchod) : 1;
    const hraje = !zi.volta?.length || zi.volta.includes(pruchod);
    if (hraje) {
      poradi.push(i);
      if (poSkoku && zi.fine) break;
      if (poSkoku && zi.doCody) {
        const c = znacky.findIndex((z, j) => j > i && z.coda && !z.doCody);
        if (c >= 0) { i = c; poSkoku = false; continue; }
      }
    }
    if (rep && pruchod < rep.pocet && ((hraje && zi.konecRepetice) || i === rep.konec)) {
      rep.pruchod++;
      i = rep.zacatek;
      continue;
    }
    if (hraje && (zi.dc || zi.ds) && !skok) {
      skok = true; poSkoku = true;
      i = zi.ds ? Math.max(0, znacky.findIndex(z => z.segno)) : 0;
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
  const m = String(znacka ?? '').trim().match(/^([A-Ha-h])(##|#|bb|b|isis|is|eses|ses|es|s(?!us))?([^/]*)(?:\/([A-Ha-h])(##|#|bb|b|isis|is|eses|ses|es|s)?)?$/i);
  if (!m) return null;
  const krok = s => s.toUpperCase().replace('H', 'B');
  const posuvka = (k, s) => k.toUpperCase() === 'B' && s?.toLowerCase() === 'es' ? -2
    : ({ '#': 1, is: 1, '##': 2, isis: 2, b: -1, es: -1, s: -1, bb: -2, eses: -2, ses: -2 }[s?.toLowerCase()] || 0);
  const koren = krok(m[1]), alter = posuvka(m[1], m[2]);
  const q = (m[3] || '').trim();
  const ql = q.replace(/^min/i, 'm').replace(/^mi(?=$|\d)/i, 'm').toLowerCase();
  const druh = /^(M9|maj9|ma9)/.test(q) || /^(maj9|ma9)/.test(ql) ? 'major-ninth'
    : /^(M7|Δ)/.test(q) || /^(maj7|ma7)/.test(ql) ? 'major-seventh'
    : q === 'M' ? 'major' : q === '5' ? 'power' : /^m7b5|ø/.test(ql) ? 'half-diminished'
    : /^(dim7|°7)/.test(ql) ? 'diminished-seventh' : /^(dim|°)/.test(ql) ? 'diminished'
      : /^(aug7|\+7)/.test(ql) ? 'augmented-seventh' : /^(aug|\+)/.test(ql) ? 'augmented'
      : /^mmaj7/.test(ql) ? 'major-minor' : /^m7/.test(ql) ? 'minor-seventh' : /^m6/.test(ql) ? 'minor-sixth'
        : /^m9/.test(ql) ? 'minor-ninth' : /^m(?!aj)/.test(ql) ? 'minor' : /^sus2/.test(ql) ? 'suspended-second'
          : /^sus/.test(ql) ? 'suspended-fourth' : /^9/.test(ql) ? 'dominant-ninth' : /^7/.test(ql) ? 'dominant'
            : /^6/.test(ql) ? 'major-sixth' : 'major';
  const bas = m[4] ? { krok: krok(m[4]), alter: posuvka(m[4], m[5]) } : null;
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

/** beams by beats: for each note a list of [number, type]; a beam starts and ends with a tuplet (typy from
 *  skupinyTuplet), otherwise Verovio would read the bar shorter */
function tramce(noty, doba, typy = []) {
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
    const tuplet = !!typy[i]?.skutecne, predtim = !!typy[i - 1]?.skutecne;
    if (Math.abs(pos / doba - Math.round(pos / doba)) < 1e-6 || typy[i]?.zacatek || tuplet !== predtim) uzavri();
    if (n.t !== 'r' && q[i] && q[i] < 1 - 1e-6) skupina.push(i); else uzavri();
    if (typy[i]?.konec) uzavri();
    pos += q[i];
  });
  uzavri();
  return tram;
}

const POSUVKY = { '-2': 'flat-flat', '-1': 'flat', 0: 'natural', 1: 'sharp', 2: 'double-sharp' };

/** A mixed tuplet is complete when its lengths add up to a full group of the shortest written unit. */
function skupinyTuplet(noty, typy) {
  let prvni = 0, soucet = 0, jednotka = Infinity;
  const uzavri = i => {
    if (soucet) typy[prvni].zacatek = typy[i].konec = true;
    soucet = 0;
  };
  for (let i = 0; i < noty.length; i++) {
    const ty = typy[i];
    if (soucet && typy[prvni].skutecne !== ty?.skutecne) uzavri(i - 1);
    if (!ty?.skutecne) continue;
    if (!soucet) { prvni = i; jednotka = Infinity; }
    const q = zlomek(noty[i].d);
    soucet += q;
    jednotka = Math.min(jednotka, q / (2 - 1 / 2 ** ty.tecky));
    const skupin = soucet / (jednotka * ty.skutecne);
    if (Math.round(skupin) > 0 && Math.abs(skupin - Math.round(skupin)) < 1e-6) uzavri(i);
  }
  uzavri(noty.length - 1);
}

/** one staff of a bar → note XML; stav = { lig: Set midi, slovo } carried across bars */
function notyXml(noty, staff, stav, sAkordy, doba, predznamenani, div) {
  const x = [];
  // accidentals valid in this bar and staff: step+octave → alter (otherwise the key signature applies)
  const platne = new Map();
  const typy = noty.map(n => zapisDelky(n.d));
  skupinyTuplet(noty, typy);
  const tram = tramce(noty, doba, typy);
  let pos = 0;
  const akordy = [...(sAkordy || [])];
  noty.forEach((n, i) => {
    const q = zlomek(n.d) || 0;
    const dalsi = pos + q;
    const tady = akordy.filter(a => { const dd = Number(a.doba) || 0; return dd >= pos - 1e-6 && (dd < dalsi - 1e-6 || i === noty.length - 1); })
      .sort((a, b) => (Number(a.doba) || 0) - (Number(b.doba) || 0));
    for (const a of tady) {
      x.push(harmonyXml(a.znacka, Math.round(((Number(a.doba) || 0) - pos) * div)));
      akordy.splice(akordy.indexOf(a), 1);
    }
    const ty = typy[i] || { typ: 'quarter', tecky: 0 };
    const dur = Math.max(1, Math.round(q * div));
    const vs = vysky(n.t);
    const notations = [];
    let tupl = '';
    if (ty.skutecne) {
      if (ty.zacatek) notations.push('<tuplet type="start" bracket="yes"/>');
      if (ty.konec) notations.push('<tuplet type="stop"/>');
      tupl = `<time-modification><actual-notes>${ty.skutecne}</actual-notes><normal-notes>${ty.normalni}</normal-notes></time-modification>`;
    }
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
  let div = DIV;
  for (const t of pisen.takty) for (const n of [...(t.noty || []), ...(t.leva || [])]) {
    const [, a, b] = /^(\d+)\/(\d+)$/.exec(String(n.d).trim()) || [];
    if (!Number.isSafeInteger(+b) || !Number.isSafeInteger(+a * 4) || +b === 0) continue;
    const d = +b / gcd(+a * 4, +b);
    const nove = div / gcd(div, d) * d;
    if (nove <= 1000000) div = nove;
  }
  const stavP = { lig: new Set(), slovo: false }, stavL = { lig: new Set(), slovo: false };
  const takty = pisen.takty.map((t, ti) => {
    const x = [`<measure number="${ti + 1}">`];
    const z = t.znacky || {};
    const pred = pisen.takty[ti - 1]?.znacky || {}, dalsi = pisen.takty[ti + 1]?.znacky || {};
    const volta = z.volta?.join(',') || '';
    const voltaZac = volta && (volta !== pred.volta?.join(',') || pred.konecRepetice || z.zacatekRepetice);
    const voltaKon = volta && (volta !== dalsi.volta?.join(',') || z.konecRepetice || dalsi.zacatekRepetice);
    if (z.zacatekRepetice || voltaZac || z.segno || z.coda) {
      x.push('<barline location="left">' + (z.zacatekRepetice ? '<bar-style>heavy-light</bar-style><repeat direction="forward"/>' : '')
        + (voltaZac ? `<ending number="${volta}" type="start">${z.volta.join('., ')}.</ending>` : '')
        + (z.segno ? '<segno/>' : '') + (z.coda ? '<coda/>' : '') + '</barline>');
    }
    if (ti === 0) {
      const klic = pisen.klic === 'basovy' ? '<sign>F</sign><line>4</line>' : '<sign>G</sign><line>2</line>';
      x.push(`<attributes><divisions>${div}</divisions><key><fifths>${fifths}</fifths></key>`
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
    const prava = notyXml(t.noty || [], 1, stavP, t.akordy, met.doba, fifths, div);
    x.push(prava.xml);
    if (dveOsnovy) {
      x.push(`<backup><duration>${Math.round(prava.delka * div)}</duration></backup>`);
      const lv = t.leva && t.leva.length ? t.leva
        : rozlozDelku(prava.delka || met.delka).map(q => ({ t: 'r', d: naPresnyZlomek(q) || '1/1' }));   // 5/4: no single rest
      x.push(notyXml(lv, 2, stavL, [], met.doba, fifths, div).xml);
    }
    if (slova.length) x.push(`<direction placement="above"><direction-type><words>${slova.join(' ')}</words></direction-type></direction>`);
    const posledni = ti === pisen.takty.length - 1;
    if (z.konecRepetice || voltaKon || posledni) {
      x.push('<barline location="right">'
        + (z.konecRepetice ? '<bar-style>light-heavy</bar-style>' : posledni ? '<bar-style>light-heavy</bar-style>' : '')
        + (voltaKon ? `<ending number="${volta}" type="${z.konecRepetice ? 'stop' : 'discontinue'}"/>` : '')
        + (z.konecRepetice ? `<repeat direction="backward"${z.pocetPruchodu ? ` times="${z.pocetPruchodu}"` : ''}/>` : '') + '</barline>');
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
const ZKRATKY_AKORDU = {
  major: '', minor: 'm', dominant: '7', 'major-seventh': 'maj7', 'minor-seventh': 'm7',
  diminished: 'dim', 'diminished-seventh': 'dim7', augmented: 'aug', 'half-diminished': 'm7b5',
  'augmented-seventh': 'aug7', 'major-minor': 'mMaj7', 'major-sixth': '6', 'minor-sixth': 'm6',
  'dominant-ninth': '9', 'minor-ninth': 'm9', 'major-ninth': 'maj9', 'suspended-fourth': 'sus4',
  'suspended-second': 'sus2', power: '5',
};
const znackaKroku = (el, tag) => text(el, tag + '-step')
  + ({ 1: '#', 2: '##', '-1': 'b', '-2': 'bb' }[Math.round(Number(text(el, tag + '-alter')))] || '');

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
  let div = 1, volta = null;
  let maToninu = false, maTakt = false, maKlic = false;
  const minulyHlas = {};
  for (const m of deti(part, 'measure')) {
    const takt = { akordy: [], noty: [], znacky: volta ? { volta } : {} };
    const leva = [];
    let pos = 0, posledniOsnova = 1;
    // the voice read for each staff: of the voices living on that staff (a cross-staff note stays with its own voice's
    // staff), the one sounding longest in this bar; a dropped voice with notes is reported
    const hlas = {}, domov = {}, zni = {}, pocty = {};
    for (const el of deti(m, 'note')) {
      if (dite(el, 'grace') || dite(el, 'cue')) continue;
      const v = text(el, 'voice') || '1', st = Number(text(el, 'staff') || 1);
      ((pocty[v] ||= {})[st] = (pocty[v][st] || 0) + 1);
      if (!dite(el, 'chord') && dite(el, 'pitch')) zni[v] = (zni[v] || 0) + Number(text(el, 'duration') || 0);
      zni[v] ||= 0;
    }
    for (const [v, po] of Object.entries(pocty)) domov[v] = Number(Object.entries(po).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]);
    for (const v of Object.keys(pocty)) {
      const st = domov[v];
      if (hlas[st] == null || zni[v] > zni[hlas[st]]) hlas[st] = v;
    }
    for (const v of Object.keys(pocty)) {
      if ((domov[v] === 1 || domov[v] === 2) && hlas[domov[v]] !== v && zni[v] > 0) pisen.nejistoty.push(`takt ${pisen.takty.length + 1}: vynechán hlas ${v}`);
    }
    const posledniNota = {}, konecHlasu = { 1: 0, 2: 0 }, vyplnitDo = { 1: 0, 2: 0 };
    const doplnPauzu = (staff, konec) => {
      const mezera = konec - konecHlasu[staff];
      if (mezera <= 1e-8) return;
      const d = naPresnyZlomek(mezera);
      const cil = staff === 1 ? takt.noty : leva;
      for (const delka of zapisDelky(d) ? [d] : rozlozDelku(mezera).map(naPresnyZlomek)) {
        if (delka) cil.push({ t: 'r', d: delka, lig: false, s: '' });
      }
      konecHlasu[staff] = konec;
      posledniNota[staff] = null;
    };
    const osnovaHlasu = (staff, v) => domov[v] ?? staff;
    const patriDoHlasu = (staff, v) => (staff === 1 || staff === 2)
      && (hlas[staff] || minulyHlas[staff] || '1') === v;
    const nactiZvuk = snd => {
      if (!snd) return;
      if (snd.getAttribute('tempo') && !pisen.tempo) pisen.tempo = Math.round(Number(snd.getAttribute('tempo')));
      if (snd.getAttribute('dacapo') === 'yes') takt.znacky.dc = true;
      for (const [attr, klic] of [['dalsegno', 'ds'], ['segno', 'segno'], ['coda', 'coda'], ['tocoda', 'doCody'], ['fine', 'fine']]) {
        if (snd.getAttribute(attr)) takt.znacky[klic] = true;
      }
    };
    for (const el of [...m.childNodes].filter(c => c.nodeType === 1)) {
      const tag = el.tagName;
      if (tag === 'attributes') {
        const deleni = Number(text(el, 'divisions'));
        if (deleni > 0) div = deleni;
        // the model has one time, key and clef: the first ones are used, a later change is reported
        const cislo = pisen.takty.length + 1, nejiste = co => { if (!pisen.nejistoty.includes(`takt ${cislo}: ${co}`)) pisen.nejistoty.push(`takt ${cislo}: ${co}`); };
        const key = dite(el, 'key');
        if (text(key, 'fifths') !== '') {
          const f = Number(text(key, 'fifths'));
          if (!maToninu) { pisen.predznamenani = f; maToninu = true; } else if (f !== pisen.predznamenani) nejiste(`změna tóniny (${f})`);
        }
        const time = dite(el, 'time');
        if (text(time, 'beats') && text(time, 'beat-type')) {
          const beats = text(time, 'beats').split('+').reduce((a, x) => a + (Number(x) || 0), 0);   // 3+2 → 5
          const tk = `${beats}/${text(time, 'beat-type')}`;
          if (!maTakt) { pisen.takt = tk; maTakt = true; } else if (tk !== pisen.takt) nejiste(`změna taktu na ${tk}`);
        }
        for (const clef of deti(el, 'clef')) {
          const num = clef.getAttribute('number') || '1';
          if (num !== '1' || !text(clef, 'sign')) continue;
          const klic = text(clef, 'sign') === 'F' ? 'basovy' : 'houslovy';
          if (!maKlic) { pisen.klic = klic; maKlic = true; } else if (klic !== pisen.klic) nejiste('změna klíče');
        }
        const tr = dite(el, 'transpose');
        if (tr && Number(text(tr, 'chromatic') || 0)) nejiste(`transponující nástroj (${text(tr, 'chromatic')} půltónů), noty jsou v zapsané výšce`);
      } else if (tag === 'sound') {
        nactiZvuk(el);
      } else if (tag === 'direction') {
        nactiZvuk(dite(el, 'sound'));
        for (const w of el.getElementsByTagName('words')) Object.assign(takt.znacky, skokySlovy(w.textContent.trim().toLowerCase()));
        if (el.getElementsByTagName('segno').length) takt.znacky.segno = true;
        if (el.getElementsByTagName('coda').length) takt.znacky.coda = true;
      } else if (tag === 'harmony') {
        const r = dite(el, 'root');
        if (r) {
          const koren = znackaKroku(r, 'root');
          const k = dite(el, 'kind');
          const druh = k?.textContent?.trim() || 'major';
          const popisek = k?.getAttribute('text') || '';
          const zk = akordZnacky(koren + popisek)?.druh === druh ? popisek : (ZKRATKY_AKORDU[druh] ?? popisek);
          const b = dite(el, 'bass');
          const znacka = koren + zk + (b ? '/' + znackaKroku(b, 'bass') : '');
          takt.akordy.push({ doba: pos + Number(text(el, 'offset') || 0) / div, znacka });
        }
      } else if (tag === 'backup') {
        pos -= Number(text(el, 'duration') || 0) / div;
        posledniOsnova = null;
      } else if (tag === 'forward') {
        pos += Number(text(el, 'duration') || 0) / div;
        const v0 = text(el, 'voice');
        const staff = v0 ? osnovaHlasu(Number(text(el, 'staff')) || posledniOsnova, v0) : Number(text(el, 'staff')) || posledniOsnova;
        const v = v0 || hlas[staff] || minulyHlas[staff] || '1';
        if (patriDoHlasu(staff, v)) vyplnitDo[staff] = Math.max(vyplnitDo[staff], pos);
      } else if (tag === 'barline') {
        const rep = dite(el, 'repeat');
        if (rep?.getAttribute('direction') === 'forward') takt.znacky.zacatekRepetice = true;
        if (rep?.getAttribute('direction') === 'backward') {
          takt.znacky.konecRepetice = true;
          const times = Number(rep.getAttribute('times'));
          if (Number.isSafeInteger(times) && times > 0) takt.znacky.pocetPruchodu = times;
        }
        const end = dite(el, 'ending');
        const typ = end?.getAttribute('type'), poloha = el.getAttribute('location');
        if (typ === 'start') {
          volta = (end.getAttribute('number') || '1').split(/[,\s]+/).map(Number).filter(n => Number.isSafeInteger(n) && n > 0);
          if (poloha !== 'right') takt.znacky.volta = volta;
        } else if (typ === 'stop' || typ === 'discontinue') {
          volta = null;
          if (poloha === 'left') delete takt.znacky.volta;
        }
        if (dite(el, 'segno')) takt.znacky.segno = true;
        if (dite(el, 'coda')) takt.znacky.coda = true;
      } else if (tag === 'note') {
        if (dite(el, 'grace')) continue;
        const v = text(el, 'voice') || '1';
        const staff = osnovaHlasu(Number(text(el, 'staff') || 1), v);
        const jeAkord = !!dite(el, 'chord');
        const dur = Number(text(el, 'duration') || 0) / div;
        const zacatek = pos;
        if (!jeAkord) pos += dur;
        posledniOsnova = staff;
        if (!patriDoHlasu(staff, v)) continue;
        if (dite(el, 'cue')) {
          if (!jeAkord) {
            vyplnitDo[staff] = Math.max(vyplnitDo[staff], pos);
            posledniNota[staff] = null;
          }
          continue;
        }
        const p = dite(el, 'pitch');
        let t = 'r';
        if (p) {
          const krok = text(p, 'step'), alt = Math.round(Number(text(p, 'alter') || 0)), okt = text(p, 'octave');
          t = krok + (alt === 1 ? '#' : alt === 2 ? '##' : alt === -1 ? 'b' : alt === -2 ? 'bb' : '') + okt;
        }
        const ties = deti(el, 'tie').map(x => x.getAttribute('type'));
        if (jeAkord && posledniNota[staff]) {
          const kusy = posledniNota[staff].kusy || [posledniNota[staff]];
          for (const k of kusy) k.t += ' ' + t;
          if (ties.includes('start')) kusy.at(-1).lig = true;
          continue;
        }
        doplnPauzu(staff, zacatek);
        const d = naPresnyZlomek(dur) || '1/4';
        const nota = { t, d, lig: ties.includes('start'), s: '' };
        // a tie continuation without a new attack is kept as a separate note with the same pitch (the model supports that)
        const lyr = deti(el, 'lyric').find(l => (l.getAttribute('number') || '1') === '1') || deti(el, 'lyric')[0];
        if (lyr && staff === 1) {
          const syl = text(lyr, 'syllabic'), tx = text(lyr, 'text');
          if (tx) nota.s = tx + (syl === 'begin' || syl === 'middle' ? '-' : '');
        }
        const fing = el.getElementsByTagName('fingering')[0]?.textContent?.trim();
        if (fing && /^[1-5]$/.test(fing)) nota.prst = Number(fing);
        const cil = staff === 1 ? takt.noty : leva;
        if (zapisDelky(d) || !(dur > 0)) {
          cil.push(nota);
          posledniNota[staff] = nota;
        } else {
          // a length no single note can show (a whole bar in 5/4, 9/8, 7/8…): writable pieces, a note tied across them
          const kusy = rozlozDelku(dur).map(naPresnyZlomek).filter(Boolean)
            .map((dd, k, a) => ({ ...nota, d: dd, lig: t !== 'r' && (k < a.length - 1 || nota.lig), s: k ? '' : nota.s }));
          for (const k of kusy.slice(1)) delete k.prst;
          cil.push(...kusy);
          posledniNota[staff] = kusy[0];
          Object.defineProperty(kusy[0], 'kusy', { value: kusy, enumerable: false });
        }
        konecHlasu[staff] = Math.max(konecHlasu[staff], pos);
      }
    }
    for (const staff of [1, 2]) doplnPauzu(staff, vyplnitDo[staff]);
    Object.assign(minulyHlas, hlas);
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

/** jumps written only as words (also used by original.js): D.C., DC, Da Capo; D.S., Dal Segno; Fine (not the "al
 *  Fine" of a D.C. instruction); To Coda. w = the words of one direction, lower case */
export const SKOKY_SLOVY = { dc: /\bd\.?\s*c\.?(?![a-z])|da capo/, ds: /\bd\.?\s*s\.?(?![a-z])|dal segno/, doCody: /to coda/ };
export function skokySlovy(w) {
  const z = Object.fromEntries(Object.entries(SKOKY_SLOVY).filter(([, re]) => re.test(w)).map(([k]) => [k, true]));
  if (/\bfine\b/.test(w.replace(/\bal\s+fine\b/g, ''))) z.fine = true;
  return z;
}

/** deep copy of the model */
export const kopie = pisen => JSON.parse(JSON.stringify(pisen));
