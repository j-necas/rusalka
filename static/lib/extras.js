// Educational extras: song guide, "Ask about a note", expression, accompaniment in a style, new song,
// weekly summary and the Echo game. Pure functions without DOM, network or state; everything runs on the computer.
//
// Each extra has two parts: fakta…() is computed by the code (key, bars, intervals, statistics) and sablona…()
// composes a short text from it in the UI language (templates are in the doplnky dictionary area, static/lang/*/extras.js).
// Verbal descriptions in the facts (interval, note length, tempo…) are also in the UI language; note names follow the
// system from the settings (note_names.js: Czech c1, fis1, H; English C4, F#4, B). Children (pasmo 'dite', the default) get
// shorter sentences and only preset questions (OTAZKY) and topics (temata()).
//
// BAR NUMBERING: the song guide and the note question work with bars as written (`takt` = bar index in
// pisen.takty from 0, in text the number = index + 1). Expression takes the attempt record from practice.js, and therefore
// indexes of the expanded song (`od`/`do`), and in text the bar numbers in the score (same as the trainer).

import {
  DIV, DRUHY, zlomek, naZlomek, typNoty, metrum, vyska, vysky, zMidi, alterVTonine, kontrola, rozvin, akordZnacky,
  tonyAkordu, kopie,
} from './song.js';
import { fraze, tezkaMista } from './practice.js';
import { jakaTonina, harmonizuj, rozdel } from './levels.js';
import { t as preklad, jazyk } from './texts.js';
import { TEMATA_JAZYKU } from '../lang/temata.js';
import { nazevKroku, soustava } from './note_names.js';

// ---------------------------------------------------------------- texts
/** text from the doplnky dictionary area */
const tx = (klic, parametry) => preklad('doplnky.' + klic, parametry);
/** list of words from the dictionary (string separated by '|') */
const tsez = klic => tx(klic).split('|');
/** n for templates with "bar/bars": a range ('5–8') = several bars, a single number = one bar (takt/takty in Czech) */
const pocetTaktu = takty => (String(takty ?? '').includes('–') ? 2 : 1);
const cestina = () => jazyk() === 'cs';
/** English indefinite article (a fifth, an octave, an F#4); Czech unchanged */
const sClenem = s => (jazyk() !== 'en' || !s ? s
  : `${/^(?:[aeio]|u(?!ni)|[fhlmnrsx](?:\d|#|b\b|b\d|\s|$))/i.test(s) ? 'an' : 'a'} ${s}`);
// ---------------------------------------------------------------- small helpers
const EPS = 1e-6;
const KROKY = 'CDEFGAB';
const KROK_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const CERNE = new Set([1, 3, 6, 8, 10]);
const mod = (a, n) => ((a % n) + n) % n;
const zaokr = (x, k = 0) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** k) / 10 ** k);
const prumer = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const smerodatna = a => {
  if (!a.length) return null;
  const m = prumer(a);
  return Math.sqrt(prumer(a.map(x => (x - m) ** 2)));
};
const tiky = d => Math.round((zlomek(d) || 0) * DIV);
const naD = t => naZlomek(t / DIV);
const rozsahText = (a, b) => (a === b ? String(a) : `${a}–${b}`);
const velke = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
const bezDiakritiky = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** 'dite' | 'dospely' from a string or a profile { pasmo?, vek? }; default 'dite' (the app is mainly for children) */
function urciPasmo(x) {
  if (x === 'dite' || x === 'dospely') return x;
  if (x && typeof x === 'object') {
    if (x.pasmo === 'dite' || x.pasmo === 'dospely') return x.pasmo;
    if (Number.isFinite(x.vek)) return x.vek < 15 ? 'dite' : 'dospely';
  }
  return 'dite';
}


/** deterministic random number generator 0–1 (mulberry32) */
function prng(seed) {
  let a = (Math.floor(Number(seed) || 0) * 2654435761) >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- note names, intervals, chords
/** Czech note name without octave, lower case: ('F', 1) → 'fis', ('B', -1) → 'b', ('B', 0) → 'h', ('E', -1) → 'es' */
function jmenoCesky(krok, alter) {
  if (krok === 'B') return { 0: 'h', '-1': 'b', 1: 'his', 2: 'hisis', '-2': 'heses' }[alter] ?? 'h';
  const z = krok.toLowerCase(), samohlaska = z === 'e' || z === 'a';
  if (alter === 1) return z + 'is';
  if (alter === 2) return z + 'isis';
  if (alter === -1) return z + (samohlaska ? 's' : 'es');
  if (alter === -2) return z + (samohlaska ? 'ses' : 'eses');
  return z;
}
/** Czech notation with octave: c1 (one-line), c (small), C (great), C₁ (contra) */
function ceskyZapis(krok, alter, okt) {
  const j = jmenoCesky(krok, alter);
  if (okt >= 4) return j + (okt - 3);
  if (okt === 3) return j;
  return velke(j) + (okt === 2 ? '' : okt === 1 ? '₁' : '₂');
}
const anglickeTony = () => soustava() !== 'cs';   // letters with # and b, or Do–Re–Mi
/** note name without octave in the system from the settings: Czech lower case (fis, b, h), English F#, Bb, B */
const jmenoTonu = (krok, alter) => (anglickeTony() ? nazevKroku(krok, alter) : jmenoCesky(krok, alter));
/** note name with octave in the chosen system: Czech c1, fis, C₁; English C4, F#3 */
const zapisTonu = (krok, alter, okt) => (anglickeTony() ? nazevKroku(krok, alter) + okt : ceskyZapis(krok, alter, okt));
/** key name: with the Czech system and Czech language as before from jakaTonina ('D dur', 'fis moll'), otherwise from the dictionary */
const nazevToniny = ton => (cestina() && !anglickeTony() ? ton.nazev
  : tx(ton.dur ? 'tonina.dur' : 'tonina.moll', { ton: nazevKroku(ton.krok, ton.alter) }));
const zapisVysky = (krok, alter, okt) => krok + ({ 1: '#', 2: '##', '-1': 'b', '-2': 'bb' }[alter] || '') + okt;
/** step with an accidental to a specific MIDI pitch (octave is computed), otherwise spelling from MIDI */
function vyskaZKroku(krok, alter, midi) {
  const okt = (midi - KROK_PC[krok] - alter) / 12 - 1;
  return Number.isInteger(okt) ? zapisVysky(krok, alter, okt) : zMidi(midi);
}

/** facts about a note (from vyska()) – the shape by which validation recognises allowed notes */
function tonF(v) {
  return {
    t: zapisVysky(v.krok, v.alter, v.okt), jmeno: jmenoTonu(v.krok, v.alter), cesky: zapisTonu(v.krok, v.alter, v.okt),
    oktava: tsez('oktavy')[v.okt] ?? '', klavesa: tx(CERNE.has(mod(v.midi, 12)) ? 'klavesa.cerna' : 'klavesa.bila'),
    midi: v.midi, pc: mod(v.midi, 12), okt: v.okt,
  };
}
const tonBezOktavy = (krok, alter) => ({ jmeno: jmenoTonu(krok, alter), pc: mod(KROK_PC[krok] + alter, 12) });

const CISTE = { 0: 0, 3: 5, 4: 7 }, VELKE = { 1: 2, 2: 4, 5: 9, 6: 11 };

/** interval between two pitches (from vyska()) in the UI language: { pultonu, interval: 'kvinta', presne: 'čistá kvinta', smer } */
function interval(a, b) {
  const ka = KROKY.indexOf(a.krok) + 7 * a.okt, kb = KROKY.indexOf(b.krok) + 7 * b.okt;
  const pul = b.midi - a.midi;
  const smer = tx(pul > 0 ? 'smer.nahoru' : pul < 0 ? 'smer.dolu' : 'smer.stejny');
  const k = Math.abs(kb - ka), p = Math.abs(pul);
  const zakl = k % 7, okt = Math.floor(k / 7), pz = p - 12 * okt;
  let kvalita;
  if (zakl in CISTE) {
    const r = pz - CISTE[zakl];
    kvalita = r === 0 ? 'cista' : r === 1 ? 'zvetsena' : r === -1 ? 'zmensena' : r > 0 ? 'dvakratZvetsena' : 'dvakratZmensena';
  } else {
    const r = pz - VELKE[zakl];
    kvalita = r === 0 ? 'velka' : r === -1 ? 'mala' : r === 1 ? 'zvetsena' : r === -2 ? 'zmensena' : r > 0 ? 'dvakratZvetsena' : 'dvakratZmensena';
  }
  const nazvy = tsez('intervaly');                          // 0 = unison … 14 = double octave
  const nazev = k < nazvy.length ? nazvy[k] : tx('interval.presOktavy', { nazev: nazvy[zakl], okt });
  return { pultonu: p, interval: nazev, presne: k === 14 ? nazev : tx('interval.presne', { kvalita: tx('kvalita.' + kvalita), nazev }), smer };
}
/** interval after a preposition: Czech accusative (skok o kvintu, o tercii), English with an article (a leap of an octave) */
const intervalPoPredlozce = s => (cestina() ? s.replace(/a$/, 'u').replace(/e$/, 'i') : sClenem(s));

const RIM_DUR = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII'];
const RIM_MOLL = ['I', 'bII', 'II', 'III', '#III', 'IV', '#IV', 'V', 'VI', '#VI', 'VII', '#VII'];
const PRIPONA_STUPNE = { dominant: '7', 'major-seventh': 'maj7', 'minor-seventh': '7', diminished: '°',
  'diminished-seventh': '°7', 'half-diminished': 'ø7', augmented: '+', 'dominant-ninth': '9', 'minor-ninth': '9' };
const PRIPONA_CESKY = { minor: 'mi', dominant: '7', 'major-seventh': 'maj7', 'minor-seventh': 'mi7', diminished: 'dim',
  'diminished-seventh': 'dim7', augmented: '+', 'half-diminished': 'm7b5', 'major-sixth': '6', 'minor-sixth': 'mi6',
  'dominant-ninth': '9', 'minor-ninth': 'mi9', 'suspended-fourth': 'sus4', 'suspended-second': 'sus2' };
const jeMollAkord = druh => /minor|diminished/.test(druh) || druh === 'half-diminished';

/** chord symbol in the chosen system: Czech 'Bm' → 'Hmi', 'Bb' → 'B', 'F#7' → 'Fis7'; English unchanged */
function ceskaZnacka(znacka) {
  const a = akordZnacky(znacka);
  if (!a || anglickeTony()) return String(znacka);
  const bas = a.bas ? '/' + velke(jmenoCesky(a.bas.krok, a.bas.alter)) : '';
  return velke(jmenoCesky(a.koren, a.alter)) + (PRIPONA_CESKY[a.druh] ?? '') + bas;
}
/** facts about a chord in a key: { znacka, cesky, stupen: 'V7', funkce: 'dominanta' | null } */
function akordF(znacka, ton) {
  const a = akordZnacky(znacka), ta = tonyAkordu(znacka);
  if (!a || !ta) return null;
  const iv = mod(ta.koren - ton.pc, 12);
  const zaklad = (ton.dur ? RIM_DUR : RIM_MOLL)[iv];
  const stupen = (jeMollAkord(a.druh) ? zaklad.toLowerCase() : zaklad) + (PRIPONA_STUPNE[a.druh] ?? '');
  const funkce = { I: 'tonika', IV: 'subdominanta', V: 'dominanta' }[zaklad];
  return { znacka, cesky: ceskaZnacka(znacka), stupen, funkce: funkce ? tx('funkce.' + funkce) : null };
}
/** chord breakdown with spelling: { bas: {krok, alter, pc}, tony: [{krok, alter, pc, interval}] } */
function rozepisAkord(znacka) {
  const a = akordZnacky(znacka), ta = tonyAkordu(znacka);
  if (!a || !ta) return null;
  const KR = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 4, 9: 5, 10: 6, 11: 6, 14: 1 };
  const ki = KROKY.indexOf(a.koren);
  const tony = (DRUHY[a.druh] || [0, 4, 7]).map(iv => {
    const krok = KROKY[(ki + (KR[iv] ?? 0)) % 7];
    const pc = mod(ta.koren + iv, 12);
    let alter = mod(pc - KROK_PC[krok], 12);
    if (alter > 6) alter -= 12;
    if (Math.abs(alter) > 2) { const v = vyska(zMidi(60 + pc)); return { krok: v.krok, alter: v.alter, pc, interval: iv }; }
    return { krok, alter, pc, interval: iv };
  });
  const bas = a.bas ? { krok: a.bas.krok, alter: a.bas.alter, pc: ta.bas } : { krok: tony[0].krok, alter: tony[0].alter, pc: ta.koren };
  return { bas, tony };
}
/** role of a note in a chord by its interval from the root (dictionary keys doplnky.role.*) */
const ROLE_V_AKORDU = { 0: 'zaklad', 3: 'tercie', 4: 'tercie', 6: 'kvinta', 7: 'kvinta', 8: 'kvinta', 9: 'sexta',
  10: 'septima', 11: 'septima', 2: 'nona', 5: 'kvarta' };

// ---------------------------------------------------------------- key
const DUR_TONIKY = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
function tonikaDur(f) {
  const s = DUR_TONIKY[Math.max(-7, Math.min(7, f)) + 7];
  const krok = s[0], alter = s[1] === '#' ? 1 : s[1] === 'b' ? -1 : 0;
  return { krok, alter, pc: mod(KROK_PC[krok] + alter, 12) };
}
function tonikaMoll(f) {
  const d = tonikaDur(f);
  const krok = KROKY[(KROKY.indexOf(d.krok) + 5) % 7];
  const alter = alterVTonine(krok, f);
  return { krok, alter, pc: mod(KROK_PC[krok] + alter, 12) };
}
/** key signature notes: [{ jmeno, pc }] */
function tonyPredznamenani(f) {
  if (f > 0) return [...'FCGDAEB'.slice(0, f)].map(k => tonBezOktavy(k, 1));
  if (f < 0) return [...'BEADGCF'.slice(0, -f)].map(k => tonBezOktavy(k, -1));
  return [];
}

const KONTAKT = /([\w.+-]+@[\w-]+\.\w+|https?:\/\/|www\.)/i;
/** shape check against a subset of JSON schema (type, required, additionalProperties, properties, items, enum, anyOf) */
function podleSchematu(x, s, cesta = 'odpověď') {
  if (s.anyOf) return s.anyOf.some(a => !podleSchematu(x, a, cesta)) ? '' : `${cesta}: neodpovídá schématu`;
  if (s.enum && !s.enum.includes(x)) return `${cesta}: nepovolená hodnota`;
  switch (s.type) {
    case 'null': return x === null ? '' : `${cesta}: má být null`;
    case 'string': return typeof x === 'string' ? '' : `${cesta}: má být text`;
    case 'integer': return Number.isInteger(x) ? '' : `${cesta}: má být celé číslo`;
    case 'number': return typeof x === 'number' && Number.isFinite(x) ? '' : `${cesta}: má být číslo`;
    case 'boolean': return typeof x === 'boolean' ? '' : `${cesta}: má být ano/ne`;
    case 'array': {
      if (!Array.isArray(x)) return `${cesta}: má být pole`;
      for (let i = 0; i < x.length; i++) {
        const e = s.items ? podleSchematu(x[i], s.items, `${cesta}[${i}]`) : '';
        if (e) return e;
      }
      return '';
    }
    case 'object': {
      if (!x || typeof x !== 'object' || Array.isArray(x)) return `${cesta}: má být objekt`;
      for (const k of s.required || []) if (!(k in x)) return `${cesta}: chybí ${k}`;
      if (s.additionalProperties === false) {
        const navic = Object.keys(x).filter(k => !(k in (s.properties || {})));
        if (navic.length) return `${cesta}: nečekaná pole ${navic.join(', ')}`;
      }
      for (const [k, sub] of Object.entries(s.properties || {})) {
        if (!(k in x)) continue;
        const e = podleSchematu(x[k], sub, `${cesta}.${k}`);
        if (e) return e;
      }
      return '';
    }
  }
  return '';
}
const ne = duvod => ({ ok: false, vysledek: null, duvod });
/** shared rules for the system prompt */
function pravidla(pasmo, { pochvala = false } = {}) {
  return [
    'Pravidla:',
    '- Vycházej jen z faktů v JSON. Nic si nedomýšlej; když něco ve faktech není, neříkej to.',
    '- Čísla taktů, tóny, akordy, intervaly a jiná čísla uváděj jen ta, která jsou ve faktech (tóny česky jako ve',
    '  faktech – pole `jmeno`/`cesky`, akordy z polí `znacka`/`cesky`).',
    '- Žádné superlativy. Neoslovuj hráče jménem a nepiš o sobě.',
    pochvala ? '- Pochval jen konkrétní zlepšení uvedené ve faktech, jinak nechval.' : '- Nechval a nehodnoť hráče.',
    pasmo === 'dite'
      ? '- Hráč je dítě: tykej, piš krátké jednoduché věty (nejvýš 14 slov), vlídně, odborná slova hned vysvětli.'
      : '- Hráč je dospělý: piš věcně a stručně, tykej.',
    '- Odpověz jen JSON podle schématu.',
  ].join('\n');
}

// ---------------------------------------------------------------- melody and bars
/** notes of a hand in written order: [{ ti, i, pos, q, vs, v (top note | null for a rest), n }] */
function notyRuky(takty, ruka = 'noty') {
  const out = [];
  takty.forEach((t, ti) => {
    let pos = 0;
    (t[ruka] || []).forEach((n, i) => {
      const q = zlomek(n.d) || 0;
      const vs = vysky(n.t);
      out.push({ ti, i, pos, q, vs, v: vs.length ? vs.reduce((a, b) => (b.midi > a.midi ? b : a)) : null, n });
      pos += q;
    });
  });
  return out;
}
const podpisTaktu = t => (t.noty || []).map(n => `${vysky(n.t).map(v => v.midi).join('.') || 'r'}:${zlomek(n.d)}`).join(' ');
const prazdnyTakt = t => !(t.noty || []).some(n => n.t !== 'r');
const textTaktu = t => (t.noty || []).map(n => String(n.s || '').trim()).filter(Boolean).join(' ');

/** first words of the song lyrics ('Večer padá jak…'); without lyrics '' */
function zacatekTextu(takty, slov = 4) {
  const slova = [];
  let slovo = '', vic = false;
  for (const t of takty) for (const n of t.noty || []) {
    const s = String(n.s || '').trim();
    if (!s) continue;
    if (slova.length >= slov) { vic = true; break; }
    slovo += s.replace(/-+$/, '');
    if (!s.endsWith('-')) { slova.push(slovo); slovo = ''; }
  }
  if (!slova.length) return '';
  return slova.join(' ').replace(/[.,!?;:…]+$/, '') + (vic || slovo ? '…' : '');
}

/** time signature description: { oznaceni, dob, popis } */
function popisTaktu(takt) {
  const m = metrum(takt);
  const slovy = tsez('slovy');
  const p = { n: m.beats, slovy: slovy[m.beats] ?? m.beats };
  let popis = [2, 4, 8, 16].includes(m.beatType)
    ? tx('takt.popis', { ...p, druh: tx('takt.druh' + m.beatType, { n: m.beats }) }) : tx('takt.popisBezDruhu', p);
  if (m.beatType === 8 && m.beats % 3 === 0 && m.beats > 3) popis += tx('takt.pocita', { slovy: slovy[m.beats / 3] });
  return { oznaceni: takt, dob: m.beats, popis };
}
function popisTempa(bpm) {
  if (!(bpm > 0)) return null;
  const nazev = bpm <= 60 ? 'Largo' : bpm <= 76 ? 'Adagio' : bpm <= 108 ? 'Andante' : bpm <= 120 ? 'Moderato' : bpm <= 168 ? 'Allegro' : 'Presto';
  return { bpm, nazev, popis: tx('tempo.' + nazev.toLowerCase()) };
}

// ================================================================ 1. SONG GUIDE
/** longest repeated melody sections (identical bars in different places), at most 4 groups */
function opakovaneUseky(T) {
  const n = T.length;
  const sig = T.map(podpisTaktu), prazdne = T.map(prazdnyTakt);
  const behy = [];
  for (let k = 1; k < n; k++) {
    let i = 0;
    while (i + k < n) {
      if (sig[i] !== sig[i + k] || prazdne[i]) { i++; continue; }
      let j = i;
      while (j + k < n && sig[j] === sig[j + k] && !prazdne[j]) j++;
      const delka = Math.min(j - i, k);
      if (delka >= 2) behy.push({ a: i, b: i + k, delka });
      i = j;
    }
  }
  behy.sort((x, y) => y.delka - x.delka || x.a - y.a || x.b - y.b);
  const skupiny = [];
  const pokryto = (s, d) => skupiny.some(g => g.vyskyty.some(v => s >= v && s + d <= v + g.delka));
  for (const { a, b, delka } of behy) {
    const klic = sig.slice(a, a + delka).join('|');
    let g = skupiny.find(x => x.klic === klic);
    if (!g) {
      if (pokryto(a, delka) && pokryto(b, delka)) continue;
      g = { klic, delka, vyskyty: [] };
      skupiny.push(g);
    }
    for (const s of [a, b]) if (!g.vyskyty.some(v => Math.abs(v - s) < delka)) g.vyskyty.push(s);
  }
  return skupiny.filter(g => g.vyskyty.length >= 2)
    .sort((x, y) => y.delka * y.vyskyty.length - x.delka * x.vyskyty.length || Math.min(...x.vyskyty) - Math.min(...y.vyskyty))
    .slice(0, 4)
    .map(g => {
      const v = [...g.vyskyty].sort((x, y) => x - y);
      return { takty: rozsahText(v[0] + 1, v[0] + g.delka), znovu: v.slice(1).map(s => rozsahText(s + 1, s + g.delka)),
        delka: g.delka, kolikrat: v.length };
    });
}

/** structure from phrases: letters by melodic similarity, verse/chorus guess from the lyrics */
function strukturaPisne(T) {
  const lin = { takt: '4/4', takty: T.map(t => { const x = { ...t }; delete x.znacky; return x; }) };
  const fr = fraze(lin);
  const sig = T.map(podpisTaktu);
  const skupiny = [];                                     // { pismeno, vzor: phrase }
  const casti = fr.map(f => {
    const delka = f.do - f.od + 1;
    let pismeno = null, presne = true;
    for (const g of skupiny) {
      if (g.delka !== delka) continue;
      let shody = 0;
      for (let k = 0; k < delka; k++) if (sig[g.od + k] === sig[f.od + k]) shody++;
      if (shody === delka || (delka >= 3 && shody >= delka - 1)) { pismeno = g.pismeno; presne = shody === delka; break; }
    }
    if (!pismeno) {
      pismeno = String.fromCharCode(65 + Math.min(25, skupiny.length));
      skupiny.push({ pismeno, od: f.od, delka });
    }
    const text = T.slice(f.od, f.do + 1).map(textTaktu).join(' ');
    return { pismeno, presne, od: f.od, do: f.do, takty: rozsahText(f.od + 1, f.do + 1), _text: text };
  });
  for (const c of casti) {
    const stejne = casti.filter(x => x.pismeno === c.pismeno && x !== c);
    if (!stejne.length || !c._text) c.text = null;
    else c.text = stejne.some(x => x._text && x._text === c._text) ? 'stejny' : 'jiny';
  }
  const refren = casti.filter(c => c.text === 'stejny'), sloka = casti.filter(c => c.text === 'jiny');
  const opakuje = casti.some(c => casti.some(x => x !== c && x.pismeno === c.pismeno));
  const odhad = tx('struktura.' + (refren.length && sloka.length ? 'slokaRefren' : refren.length ? 'refren'
    : sloka.length ? 'sloky' : opakuje ? 'opakuje' : 'nova'));
  return {
    schema: casti.map(c => c.pismeno + (c.presne ? '' : '′')).join(' '),
    casti: casti.map(c => ({ pismeno: c.pismeno + (c.presne ? '' : '′'), takty: c.takty, text: c.text })),
    odhad,
    refren: refren.map(c => c.takty),
    sloka: sloka.map(c => c.takty),
  };
}

/** hard spots from the score (without playing): fast notes, leaps, accidentals outside the key signature, chords, triplets, dots */
function tezkaMistaStaticky(T, f, tempo) {
  const mel = notyRuky(T);
  const sp = 60 / (tempo > 0 ? tempo : 100);              // seconds per quarter note
  const takty = T.map(() => ({ duvody: {}, skore: 0 }));
  const pridej = (ti, typ, vaha, data = {}) => {
    const t = takty[ti];
    const d = (t.duvody[typ] ||= { typ, pocet: 0, ...data });
    d.pocet++;
    t.skore += vaha;
  };
  let pred = null;
  const stav = new Map();                                 // accidentals valid in the bar
  let ti0 = -1;
  for (const x of mel) {
    if (x.ti !== ti0) { stav.clear(); ti0 = x.ti; }
    if (!x.v) continue;
    if (x.q * sp < 0.22 || x.q <= 0.25 + EPS) pridej(x.ti, 'rychle', 1);
    const ty = typNoty(x.q);
    if (ty?.trioly) pridej(x.ti, 'triola', 0.7);
    else if (ty?.tecky && x.q < 1 - EPS) pridej(x.ti, 'tecka', 0.5);
    if (x.vs.length > 1) pridej(x.ti, 'souzvuk', 1);
    for (const v of x.vs) {
      const klic = v.krok + v.okt;
      const ocek = stav.has(klic) ? stav.get(klic) : alterVTonine(v.krok, f);
      if (v.alter !== ocek) {
        const vychozi = alterVTonine(v.krok, f);
        if (v.alter !== vychozi) {
          const t = takty[x.ti];
          if (!t.duvody.posuvka) t.duvody.posuvka = { typ: 'posuvka', pocet: 0, tony: [] };
          if (!t.duvody.posuvka.tony.some(y => y.jmeno === jmenoTonu(v.krok, v.alter))) t.duvody.posuvka.tony.push(tonBezOktavy(v.krok, v.alter));
          t.duvody.posuvka.pocet++;
          t.skore += 1.5;
        }
        stav.set(klic, v.alter);
      }
    }
    if (pred && Math.abs(x.v.midi - pred.midi) >= 7) {
      const i = interval(pred, x.v);
      const t = takty[x.ti];
      if (!t.duvody.skok || t.duvody.skok.pultonu < i.pultonu) t.duvody.skok = { typ: 'skok', pocet: (t.duvody.skok?.pocet || 0), interval: i.interval, pultonu: i.pultonu };
      t.duvody.skok.pocet++;
      t.skore += 2;
    }
    pred = x.v;
  }
  return takty.map((t, i) => ({ i, ...t })).filter(t => t.skore >= 1.5)
    .sort((a, b) => b.skore - a.skore || a.i - b.i).slice(0, 3)
    .map(t => ({ takt: t.i + 1, duvody: Object.values(t.duvody).map(d => { const o = { ...d }; delete o.pultonu; return o; }) }));
}

/**
 * Facts about the song for the guide (without playing). Bar numbers are the numbers in the score (index + 1).
 * volby: { pasmo | profil, text: true = title and first words of the lyrics }
 */
export function faktaPisne(pisen, volby = {}) {
  const T = pisen?.takty || [];
  const pasmo = urciPasmo(volby.pasmo ?? volby.profil);
  const ton = jakaTonina(pisen);
  const f = ton.predznamenani;
  const met = metrum(pisen.takt);
  const mel = notyRuky(T).filter(x => x.v);
  const vsechny = mel.flatMap(x => x.vs);
  // range
  let rozsah = null;
  if (vsechny.length) {
    const lo = vsechny.reduce((a, b) => (b.midi < a.midi ? b : a)), hi = vsechny.reduce((a, b) => (b.midi > a.midi ? b : a));
    const i = interval(lo, hi);
    const kroku = (KROKY.indexOf(hi.krok) + 7 * hi.okt) - (KROKY.indexOf(lo.krok) + 7 * lo.okt);
    rozsah = { nejnizsi: tonF(lo), nejvyssi: tonF(hi), pultonu: i.pultonu, interval: i.interval, presne: i.presne, petPrstu: kroku <= 4 };
  }
  // largest leaps
  const skoky = [];
  for (let k = 1; k < mel.length; k++) {
    const a = mel[k - 1].v, b = mel[k].v;
    if (Math.abs(b.midi - a.midi) < 5) continue;
    const i = interval(a, b);
    const s = skoky.find(x => x.z.midi === a.midi && x.na.midi === b.midi);
    if (s) { s.kolikrat++; continue; }
    skoky.push({ takt: mel[k].ti + 1, z: tonF(a), na: tonF(b), pultonu: i.pultonu, interval: i.interval, presne: i.presne, smer: i.smer, kolikrat: 1 });
  }
  skoky.sort((x, y) => y.pultonu - x.pultonu || x.takt - y.takt);
  // chords
  const pocty = new Map();
  for (const t of T) for (const a of t.akordy || []) {
    const ta = tonyAkordu(a.znacka);
    if (!ta) continue;
    const klic = `${ta.koren}:${ta.tony.join('.')}:${ta.bas}`;
    const z = pocty.get(klic) || { znacka: a.znacka, kolikrat: 0 };
    z.kolikrat++;
    pocty.set(klic, z);
  }
  const akordyS = [...pocty.values()].sort((a, b) => b.kolikrat - a.kolikrat);
  const akordy = akordyS.length ? {
    pocet: akordyS.length,
    nejcastejsi: akordyS.slice(0, 3).map(a => ({ ...akordF(a.znacka, ton), kolikrat: a.kolikrat })),
    vsechny: akordyS.map(a => akordF(a.znacka, ton)),
  } : null;
  // repeats and jumps in the score
  const repetice = [];
  let zac = 0;
  T.forEach((t, i) => {
    const z = t.znacky || {};
    if (z.zacatekRepetice) zac = i;
    if (z.konecRepetice) { repetice.push({ takty: rozsahText(zac + 1, i + 1) }); zac = i + 1; }
  });
  const navigace = [];
  for (const [k, znacka] of [['dc', 'D.C.'], ['ds', 'D.S.'], ['fine', 'Fine'], ['coda', 'Coda'], ['volta', tx('navigace.volty')]]) {
    if (T.some(t => t.znacky?.[k])) navigace.push(znacka);
  }
  const prvni = T[0]?.noty || [];
  const out = {
    pasmo,
    tonina: {
      nazev: nazevToniny(ton), dur: ton.dur, tonika: tonBezOktavy(ton.krok, ton.alter),
      predznamenani: { pocet: Math.abs(f), druh: f > 0 ? 'křížky' : f < 0 ? 'béčka' : null, tony: tonyPredznamenani(f) },
    },
    takt: popisTaktu(pisen.takt),
    tempo: popisTempa(Number(pisen.tempo) || 0),
    pocetTaktu: T.length,
    predtakti: T.length > 1 && prvni.reduce((a, n) => a + (zlomek(n.d) || 0), 0) < met.delka - EPS,
    rozsah,
    skoky: skoky.slice(0, 3),
    opakovani: opakovaneUseky(T),
    struktura: strukturaPisne(T),
    akordy,
    tezkaMista: tezkaMistaStaticky(T, f, Number(pisen.tempo) || 0),
    repetice,
    navigace,
  };
  if (volby.text !== false) {
    out.nazev = String(pisen.nazev || '').trim();
    out.zacatekTextu = zacatekTextu(T);
  }
  return out;
}

/** reasons for a hard spot */
function popisDuvodu(d, dite) {
  switch (d.typ) {
    case 'rychle': return dite ? tx('duvod.rychle') : tx('duvod.rychlePocet', { n: d.pocet });
    case 'skok': return dite ? tx('duvod.velkySkok') : tx('duvod.skok', { interval: intervalPoPredlozce(d.interval) });
    case 'posuvka': return tx('duvod.posuvka', { tony: d.tony.map(t => t.jmeno).join(', ') });
    case 'souzvuk': return tx(dite ? 'duvod.souzvukDite' : 'duvod.souzvuk');
    case 'triola': return tx('duvod.triola');
    case 'tecka': return tx('duvod.tecka');
  }
  return d.typ;
}

/** song guide: { odstavce: string[], tipy: string[] } */
export function sablonaPruvodce(fakta, pasmo = fakta?.pasmo) {
  const F = fakta, dite = urciPasmo(pasmo) === 'dite';
  const odstavce = [], tipy = [];
  const pz = F.tonina.predznamenani;
  const tonyPz = pz.tony.map(t => t.jmeno).join(', ');
  const krizky = pz.druh === 'křížky';
  const beats = F.takt.dob;
  const spojka = tx('a');
  if (dite) {
    const v = [tx('pruvodce.dite.tonina', { tonina: F.tonina.nazev })];
    if (pz.pocet) {
      const slovy = tsez(krizky ? 'slovy.krizky' : 'slovy.becka')[pz.pocet] ?? pz.pocet;
      v.push(tx(krizky ? 'pruvodce.dite.krizky' : 'pruvodce.dite.becka', { n: pz.pocet, slovy, tony: tonyPz }));
    }
    const doSlovy = tsez('doSlovy')[beats];
    if (doSlovy) v.push(tx('pruvodce.dite.pocitame', { n: doSlovy }));
    if (F.tempo) v.push(tx('pruvodce.dite.tempo', { tempo: F.tempo.popis }));
    odstavce.push(v.join(' '));
    if (F.rozsah) {
      const r = [tx('pruvodce.dite.rozsah', { od: F.rozsah.nejnizsi.cesky, do: F.rozsah.nejvyssi.cesky })];
      if (F.rozsah.petPrstu) r.push(tx('pruvodce.dite.petPrstu'));
      if (F.skoky[0]) r.push(tx('pruvodce.dite.skok', { takt: F.skoky[0].takt }));
      odstavce.push(r.join(' '));
    }
    if (F.opakovani[0]) {
      const o = F.opakovani[0];
      odstavce.push(tx('pruvodce.dite.vrati', { takty: o.takty, znovu: o.znovu.map(x => tx('pruvodce.takty', { takty: x })).join(spojka) }));
    }
    if (F.akordy) odstavce.push(tx('pruvodce.dite.akord', { akord: F.akordy.nejcastejsi[0].cesky }));
  } else {
    const predznamenani = pz.pocet ? tx(krizky ? 'pruvodce.krizky' : 'pruvodce.becka', { n: pz.pocet, tony: tonyPz })
      : tx('pruvodce.bezPredznamenani');
    odstavce.push(tx('pruvodce.uvod', {
      tonina: F.tonina.nazev, predznamenani, takt: F.takt.oznaceni, popis: F.takt.popis,
      tempo: F.tempo ? tx('pruvodce.tempo', { nazev: F.tempo.nazev, bpm: F.tempo.bpm }) : '',
      taktu: tx(F.predtakti ? 'pruvodce.taktuPredtakti' : 'pruvodce.taktu', { n: F.pocetTaktu }),
    }));
    if (F.rozsah) {
      let r = tx(F.rozsah.petPrstu ? 'pruvodce.rozsahPetPrstu' : 'pruvodce.rozsah',
        { od: F.rozsah.nejnizsi.cesky, do: F.rozsah.nejvyssi.cesky, interval: F.rozsah.presne });
      const s = F.skoky[0];
      if (s) r += ' ' + tx('pruvodce.skok', { takt: s.takt, z: s.z.cesky, na: s.na.cesky, interval: s.presne, smer: s.smer });
      else r += ' ' + tx('pruvodce.kroky');
      odstavce.push(r);
    }
    const o = [];
    for (const x of F.opakovani.slice(0, 2)) o.push(tx('pruvodce.vraceji', { takty: x.takty, znovu: x.znovu.join(spojka) }));
    o.push(tx('pruvodce.stavba', { schema: F.struktura.schema, odhad: F.struktura.odhad }));
    odstavce.push(o.join(' '));
    if (F.akordy) {
      const ak = F.akordy.nejcastejsi.map(a => a.cesky + (a.funkce ? ` (${a.funkce})` : ` (${a.stupen})`)).join(', ');
      odstavce.push(tx('pruvodce.akordy', { n: F.akordy.pocet, akordy: ak }));
    }
  }
  for (const m of F.tezkaMista.slice(0, 2)) {
    const d = m.duvody.slice(0, 2).map(x => popisDuvodu(x, dite)).join(', ');
    tipy.push(tx(dite ? 'pruvodce.tip.tezkyDite' : 'pruvodce.tip.tezky', { takt: m.takt, duvody: d }));
  }
  if (F.opakovani[0] && F.opakovani[0].kolikrat >= 2) {
    const o = F.opakovani[0];
    tipy.push(dite ? tx('pruvodce.tip.naucDite', { takty: o.takty }) : tx('pruvodce.tip.zacni', { takty: o.takty, kolikrat: o.kolikrat }));
  }
  return { odstavce, tipy };
}

// ================================================================ 2. ASK ABOUT A NOTE
const TYPY_NOT = ['whole', 'half', 'quarter', 'eighth', '16th', '32nd'];      // order as in doplnky.delka.typy
/** length of a note or rest: 'čtvrťová s tečkou', 'osminová (v triole)', 'půlová pomlka' (dotted quarter, eighth in a triplet, half rest) */
function nazevDelky(q, pomlka = false) {
  const ty = typNoty(q);
  if (!ty) return tx(pomlka ? 'delka.neznamaPomlka' : 'delka.neznama', { n: zaokr(q, 3) });
  return tx(pomlka ? 'delka.pomlka' : 'delka.nota', {
    typ: tsez('delka.typy')[TYPY_NOT.indexOf(ty.typ)],
    tecky: ty.tecky === 1 ? tx('delka.tecka1') : ty.tecky === 2 ? tx('delka.tecka2') : '',
    triola: ty.trioly ? tx('delka.triola') : '',
  });
}
/** number of beats in words: 1 → 'jednu dobu', 1.5 → 'jednu a půl doby', 0.5 → 'půl doby' */
function dobyText(x) {
  const r = Math.round(x * 4) / 4;
  if (Math.abs(r - x) > EPS) return tx('doby.cislo', { n: zaokr(x, 2) });
  const cele = Math.floor(r), zbytek = r - cele;
  const zl = zbytek === 0.5 ? 'Pul' : zbytek === 0.25 ? 'Ctvrt' : zbytek === 0.75 ? 'TriCtvrte' : '';
  if (!cele) return zl ? tx('doby.' + zl[0].toLowerCase() + zl.slice(1)) : tx('doby.cislo', { n: '' });
  const c = tsez('doby.slovy')[cele] ?? String(cele);
  if (zl) return tx('doby.a' + zl, { c });
  return tx('doby.cele', { n: cele, c });
}

/** chord in effect in bar ti at position pos (quarter beats), also carried over from earlier bars */
function akordNaMiste(T, ti, pos) {
  let znacka = null;
  for (let i = 0; i <= ti; i++) {
    for (const a of [...(T[i].akordy || [])].sort((x, y) => (Number(x.doba) || 0) - (Number(y.doba) || 0))) {
      if (i === ti && (Number(a.doba) || 0) > pos + EPS) break;
      if (tonyAkordu(a.znacka)) znacka = a.znacka;
    }
  }
  return znacka;
}

/**
 * Facts about one note (takt = bar index from 0, index = order of the note in the bar, ruka 'prava' | 'leva').
 * Without the lyric syllable. Non-existent note → null.
 */
export function faktaNoty(pisen, takt, index, ruka = 'prava', volby = {}) {
  const T = pisen?.takty || [];
  const r = ruka === 'leva' || ruka === 'l' ? 'leva' : 'prava';
  const pole = r === 'leva' ? 'leva' : 'noty';
  const noty = T[takt]?.[pole];
  const n = noty?.[index];
  if (!n) return null;
  const f = Math.max(-7, Math.min(7, Number(pisen.predznamenani) || 0));
  const ton = jakaTonina(pisen);
  const met = metrum(pisen.takt);
  const jednotka = 4 / met.beatType;
  let pos = 0;
  for (let i = 0; i < index; i++) pos += zlomek(noty[i].d) || 0;
  const L = noty.reduce((a, x) => a + (zlomek(x.d) || 0), 0);
  const posun = takt === 0 && T.length > 1 && L < met.delka - EPS ? met.delka - L : 0;
  const misto = (pos + posun) / jednotka;
  const q = zlomek(n.d) || 0;
  const vs = vysky(n.t);
  // accidentals: state in the bar before the note
  const stav = new Map();
  for (let i = 0; i < index; i++) for (const v of vysky(noty[i].t)) stav.set(v.krok + v.okt, v.alter);
  const tony = vs.map(v => {
    const klic = v.krok + v.okt;
    const vychozi = alterVTonine(v.krok, f);
    const platna = stav.has(klic) ? stav.get(klic) : vychozi;
    const napsana = v.alter !== platna;
    let zdroj = null;
    if (napsana) zdroj = 'nahodna';
    else if (stav.has(klic) && v.alter !== vychozi) zdroj = 'plati-v-taktu';
    else if (v.alter !== 0) zdroj = 'predznamenani';
    const zn = { 1: 'krizek', '-1': 'becko', 2: 'dvojityKrizek', '-2': 'dvojiteBecko' }[v.alter] ?? (napsana ? 'odrazka' : null);
    return { ...tonF(v), posuvka: { zdroj, znamenko: zn ? tx('znamenko.' + zn) : null, napsana } };
  });
  // tie: how long to hold in total
  let drzet = q;
  if (n.lig && vs.length) {
    const rada = notyRuky(T, pole);
    let k = rada.findIndex(x => x.ti === takt && x.i === index);
    while (k >= 0 && rada[k].n.lig && rada[k + 1] && rada[k + 1].n.t === n.t) { drzet += rada[k + 1].q; k++; }
  }
  // chord
  const znacka = akordNaMiste(T, takt, pos);
  let akord = null;
  if (znacka) {
    const ta = tonyAkordu(znacka), rz = rozepisAkord(znacka);
    const patri = vs.length > 0 && vs.every(v => ta.tony.includes(mod(v.midi, 12)));
    const idRole = vs.length === 1 && ta.tony.includes(mod(vs[0].midi, 12)) ? ROLE_V_AKORDU[mod(vs[0].midi - ta.koren, 12)] : null;
    const role = idRole ? tx('role.' + idRole) : null;
    akord = { ...akordF(znacka, ton), tony: rz.tony.map(x => tonBezOktavy(x.krok, x.alter)), patri, role };
  }
  // interval from the previous sounding note of the same hand
  let odPredchozi = null;
  if (vs.length) {
    const rada = notyRuky(T, pole).filter(x => x.v);
    const k = rada.findIndex(x => x.ti === takt && x.i === index);
    const p = rada[k - 1];
    if (p) {
      const horni = vs.reduce((a, b) => (b.midi > a.midi ? b : a));
      odPredchozi = { predchozi: tonF(p.v), takt: p.ti + 1, ...interval(p.v, horni) };
    }
  }
  return {
    pasmo: urciPasmo(volby.pasmo ?? volby.profil),
    takt: takt + 1,
    ruka: r,
    klic: r === 'leva' ? 'basovy' : pisen.klic === 'basovy' ? 'basovy' : 'houslovy',
    pomlka: !vs.length,
    souzvuk: vs.length > 1,
    tony,
    delka: { d: n.d, nazev: nazevDelky(q, !vs.length), doby: zaokr(q / jednotka, 3), text: dobyText(q / jednotka) },
    ligatura: !!(n.lig && vs.length && drzet > q + EPS),
    drzetCelkem: n.lig && drzet > q + EPS ? { doby: zaokr(drzet / jednotka, 3), text: dobyText(drzet / jednotka) } : null,
    doba: { cislo: Math.floor(misto + EPS) + 1, naDobu: Math.abs(misto - Math.round(misto)) < EPS, dobVTaktu: met.beats },
    tonina: { nazev: nazevToniny(ton), predznamenani: tonyPredznamenani(f) },
    akord,
    odPredchozi,
    prst: Number.isInteger(n.prst) ? n.prst : null,
  };
}

/** preset questions (the only ones allowed for children) */
export const OTAZKY = ['co', 'posuvka', 'delka', 'akord', 'skok', 'doba', 'prst']
  .map(id => ({ id, get text() { return tx('otazka.' + id); } }));    // text in the UI language on every read
const ID_OTAZEK = new Set([...OTAZKY.map(o => o.id), 'vse']);

/** questions that make sense for the given note (text adjusted to the note: „Proč je tu křížek?“ – "Why is there a sharp?") */
export function otazkyProNotu(fakta) {
  if (!fakta) return [];
  const posuvka = fakta.tony.find(t => t.posuvka.zdroj);
  return OTAZKY.filter(o => {
    if (o.id === 'posuvka') return !!posuvka;
    if (o.id === 'akord') return !!fakta.akord;
    if (o.id === 'skok') return !!fakta.odPredchozi;
    if (o.id === 'prst') return fakta.prst != null;
    if (o.id === 'co') return true;
    return true;
  }).map(o => (o.id === 'posuvka' && posuvka.posuvka.znamenko
    ? { id: o.id, text: tx('otazka.posuvkaZnamenko', { znamenko: sClenem(posuvka.posuvka.znamenko) }) }
    : o.id === 'co' && fakta.pomlka ? { id: o.id, text: tx('otazka.coZnak') } : { ...o }));
}
const idOtazky = o => (typeof o === 'string' ? o : o?.id);

/** answer to a preset question (id or an OTAZKY element; unknown → 'vse' = summary) */
export function odpovedSablonou(fakta, otazka) {
  const F = fakta, dite = F.pasmo === 'dite';
  const id = ID_OTAZEK.has(idOtazky(otazka)) ? idOtazky(otazka) : 'vse';
  const jm = F.tony.map(t => t.cesky).join(', ');
  const casti = {
    co: () => (F.pomlka ? tx('odp.pomlka', { nazev: sClenem(F.delka.nazev) })
      : F.souzvuk ? tx('odp.souzvuk', { tony: jm })
        : tx(dite ? 'odp.tonDite' : 'odp.ton', { ton: F.tony[0].cesky, klavesa: F.tony[0].klavesa, oktava: F.tony[0].oktava })),
    posuvka: () => {
      const t = F.tony.find(x => x.posuvka.zdroj);
      if (!t) return tx('odp.bezPosuvky');
      const p = t.posuvka;
      if (p.zdroj === 'predznamenani') return tx('odp.predznamenani', { Znamenko: velke(p.znamenko), znamenko: p.znamenko, ton: t.jmeno });
      if (p.zdroj === 'plati-v-taktu') return tx('odp.platiVTaktu', { ton: t.jmeno });
      if (p.znamenko === tx('znamenko.odrazka')) return tx('odp.odrazka', { ton: t.jmeno });
      return tx('odp.nahodna', { ton: t.jmeno });
    },
    delka: () => tx(F.drzetCelkem ? 'odp.delkaLigatura' : 'odp.delka',
      { nazev: sClenem(F.delka.nazev), doby: F.delka.text, celkem: F.drzetCelkem?.text }),
    akord: () => {
      if (!F.akord) return tx('odp.bezAkordu');
      const a = F.akord;
      const p = { akord: a.cesky, funkce: !dite && a.funkce ? tx('odp.akordFunkce', { funkce: a.funkce }) : '',
        tony: a.tony.map(t => t.jmeno).join(', '), role: a.role };
      if (F.pomlka) return tx('odp.akord', p);
      return tx(a.patri ? (a.role ? 'odp.akordPatriRole' : 'odp.akordPatri') : 'odp.akordNepatri', p);
    },
    skok: () => {
      const o = F.odPredchozi;
      if (!o) return tx('odp.bezPredchozi');
      if (o.pultonu === 0) return tx('odp.stejnyTon', { ton: o.predchozi.cesky });
      return dite ? tx('odp.skokDite', { z: o.predchozi.cesky, smer: o.smer, interval: sClenem(o.interval) })
        : tx('odp.skok', { z: o.predchozi.cesky, interval: sClenem(o.presne), smer: o.smer });
    },
    doba: () => tx(F.doba.naDobu ? 'odp.naDobu' : 'odp.meziDoby', { n: F.doba.cislo }),
    prst: () => (F.prst != null ? tx('odp.prst', { n: F.prst }) : tx('odp.bezPrstu')),
  };
  if (id !== 'vse') return casti[id]();
  const vety = [casti.co(), casti.delka()];
  if (F.tony.some(t => t.posuvka.zdroj)) vety.push(casti.posuvka());
  if (F.akord) vety.push(casti.akord());
  return vety.join(' ');
}

// ================================================================ 3. EXPRESSION
// The attempt record from practice.js is extended with an optional field `sila` (MIDI velocity 1–127) on notes.
const DYNAMIKA = [[32, 'pp'], [52, 'p'], [68, 'mp'], [84, 'mf'], [100, 'f'], [128, 'ff']];
const POREDI_DYN = ['pp', 'p', 'mp', 'mf', 'f', 'ff'];
/**
 * Keystroke strength against the dynamics in the score (n.dynamika from the Original level). Sections with the same marking; where
 * the marking changes (p → f), the average strength must change too (by at least 8 of 127) – absolute loudness differs from piano to piano.
 * Without marking changes, only a large deviation (two levels) is flagged. → { useky, zmen, chyba } or null.
 */
function dynamikaPodleNot(hrane, C) {
  const noty = hrane.filter(n => n.dynamika && Number.isFinite(n.sila) && n.sila > 0).sort((a, b) => a.index - b.index);
  if (noty.length < 4) return null;
  const useky = [];
  for (const n of noty) {
    const u = useky[useky.length - 1];
    if (u && u.znacka === n.dynamika) u.noty.push(n); else useky.push({ znacka: n.dynamika, noty: [n] });
  }
  const U = useky.filter(u => u.noty.length >= 2).map(u => {
    const m = prumer(u.noty.map(n => n.sila));
    const od = Math.min(...u.noty.map(n => n.takt)), dok = Math.max(...u.noty.map(n => n.takt));
    return { znacka: u.znacka, prumerSila: zaokr(m), zahrano: dynamika(m), takty: rozsahText(C(od), C(dok)) };
  });
  if (!U.length) return null;
  let chyba = null, zmen = 0;
  for (let i = 1; i < U.length && !chyba; i++) {
    const a = U[i - 1], b = U[i], ma = POREDI_DYN.indexOf(b.znacka) - POREDI_DYN.indexOf(a.znacka);
    if (!ma) continue;
    zmen++;
    const je = b.prumerSila - a.prumerSila;
    if ((ma > 0 && je < 8) || (ma < 0 && je > -8)) {
      chyba = { druh: 'kontrast', znacka: b.znacka, predtim: a.znacka, takty: b.takty, ma: ma > 0 ? 'silneji' : 'slabeji' };
    }
  }
  if (!chyba && !zmen) {
    const u = U.find(x => Math.abs(POREDI_DYN.indexOf(x.zahrano) - POREDI_DYN.indexOf(x.znacka)) >= 2);
    if (u) chyba = { druh: 'uroven', znacka: u.znacka, zahrano: u.zahrano, takty: u.takty };
  }
  return { useky: U.map(({ znacka, prumerSila, zahrano, takty }) => ({ znacka, prumerSila, zahrano, takty })), zmen, chyba };
}
const dynamika = s => (s == null ? null : DYNAMIKA.find(([h]) => s < h)[1]);
/** dynamics in words for children ('p' → 'potichu', quietly) */
const dynamikaDite = z => (POREDI_DYN.includes(z) ? tx('dyn.' + z) : undefined);

/**
 * Expression facts from one attempt: keystroke strength (velocity) and holding length by phrases.
 * Phrases = fraze(pisen) within the attempt's section; od/do are indexes of the expanded song, `takty` = numbers in the score ('5–8').
 */
export function faktaPrednesu(zaznam, pisen, profil) {
  const r = rozvin(pisen);
  const C = i => (r.poradi[i] ?? i) + 1;
  const od = Math.max(0, zaznam?.od ?? 0), dok = Math.min(r.pisen.takty.length - 1, zaznam?.do ?? r.pisen.takty.length - 1);
  const hrane = (zaznam?.noty || []).filter(n => n.vysledek !== 'vynechana' && n.zahranoMs !== null);
  const maSilu = hrane.some(n => Number.isFinite(n.sila) && n.sila > 0);
  const maDrzeni = hrane.some(n => n.drzenoMs != null && n.ocekavanaDelkaMs > 0);
  const rozbor = noty => {
    const sily = noty.filter(n => Number.isFinite(n.sila) && n.sila > 0).sort((a, b) => a.index - b.index || a.pitch - b.pitch);
    const o = {};
    if (sily.length >= 3) {
      const s = sily.map(n => n.sila);
      // gradation without the last note (that one is evaluated separately)
      const g = s.length >= 4 ? s.slice(0, -1) : s;
      const m = prumer(s), tretina = Math.max(1, Math.floor(g.length / 3));
      const zmena = prumer(g.slice(-tretina)) - prumer(g.slice(0, tretina));
      const posledniIndex = sily[sily.length - 1].index;
      const posledni = Math.max(...sily.filter(n => n.index === posledniIndex).map(n => n.sila));
      const ostatni = sily.filter(n => n.index !== posledniIndex).map(n => n.sila);
      Object.assign(o, {
        prumerSila: zaokr(m), dynamika: dynamika(m), rozptyl: zaokr(smerodatna(s)),
        smer: zmena >= 8 ? 'graduje' : zmena <= -8 ? 'klesa' : 'drzi', zmenaSily: zaokr(zmena),
        posledniTissi: ostatni.length ? posledni < prumer(ostatni) - 6 : null,
      });
    }
    const dr = noty.filter(n => n.drzenoMs != null && n.ocekavanaDelkaMs > 0).map(n => n.drzenoMs / n.ocekavanaDelkaMs);
    if (dr.length >= 2) {
      Object.assign(o, {
        drzeniProcent: zaokr(100 * prumer(dr)),
        staccatoProcent: zaokr(100 * dr.filter(x => x < 0.5).length / dr.length),
        legatoProcent: zaokr(100 * dr.filter(x => x >= 0.9).length / dr.length),
      });
    }
    return o;
  };
  const fr = fraze(pisen).filter(x => x.do >= od && x.od <= dok).map(x => {
    const a = Math.max(x.od, od), b = Math.min(x.do, dok);
    const noty = hrane.filter(n => n.takt >= a && n.takt <= b);
    return { od: a, do: b, takty: rozsahText(C(a), C(b)), pocetNot: noty.length, ...rozbor(noty) };
  }).filter(x => x.pocetNot > 0);
  const celkem = rozbor(hrane);
  const prumery = fr.map(x => x.prumerSila).filter(x => x != null);
  if (prumery.length >= 2) celkem.rozsahDynamiky = Math.max(...prumery) - Math.min(...prumery);
  celkem.jednotvarne = celkem.rozptyl != null ? celkem.rozptyl < 6 && (celkem.rozsahDynamiky ?? 0) < 8 : null;
  return {
    podleNot: dynamikaPodleNot(hrane, C),
    pasmo: urciPasmo(profil),
    usek: { od, do: dok, takty: rozsahText(C(od), C(dok)) },
    maSilu, maDrzeni, pocetNot: hrane.length,
    celkem,
    fraze: fr,
  };
}

/** expression advice: { veta, takty: '5–8' | null } (takty = the phrase from the facts the advice refers to) */
export function sablonaPrednesu(fakta) {
  const F = fakta, dite = F.pasmo === 'dite';
  const rada = (klic, p = {}, takty = p.takty ?? null) => ({ veta: tx(`prednes.${klic}${dite ? 'Dite' : ''}`, { n: pocetTaktu(p.takty), ...p }), takty });
  if (!F.maSilu && !F.maDrzeni) return rada('bezDat', {}, null);
  // dynamics prescribed in the score take precedence over general advice
  const pn = F.podleNot;
  if (pn?.chyba) {
    const c = pn.chyba, slovo = z => (dite ? dynamikaDite(z) : z);
    if (c.druh === 'kontrast') {
      const smer = tx(c.ma === 'silneji' ? 'prednes.zesilit' : 'prednes.ztisit');
      return rada('kontrast', { takt: c.takty.split('–')[0], takty: c.takty, znacka: c.znacka, predtim: c.predtim, smer });
    }
    return rada('uroven', { takty: c.takty, ma: slovo(c.znacka), hrajes: slovo(c.zahrano) });
  }
  if (pn?.zmen > 0) return rada('dodrzujes', { useky: pn.useky.map(u => u.znacka).join(' → ') }, null);
  const fr = F.fraze;
  const prvni = fr[0];
  if (F.maSilu && F.celkem.jednotvarne && prvni) {
    const dyn = dite ? dynamikaDite(F.celkem.dynamika) : F.celkem.dynamika;
    return rada('jednotvarne', { dyn, takty: prvni.takty });
  }
  const silnyKonec = fr.find(x => x.posledniTissi === false && x.smer !== 'graduje');
  if (silnyKonec) return rada('silnyKonec', { takty: silnyKonec.takty });
  const odsekane = fr.find(x => x.drzeniProcent != null && x.drzeniProcent < 60);
  if (odsekane) return rada('odsekane', { takty: odsekane.takty, procent: odsekane.drzeniProcent });
  const graduje = fr.find(x => x.smer === 'graduje') || fr.find(x => x.smer === 'klesa');
  if (graduje) {
    const co = tx((graduje.smer === 'graduje' ? 'prednes.zesilujes' : 'prednes.zeslabujes') + (dite ? 'Dite' : ''));   // ty for children
    return rada('graduje', { takty: graduje.takty, co });
  }
  return rada('obecne', {}, prvni?.takty ?? null);
}

// ================================================================ 4. ACCOMPANIMENT STYLE
// Pattern = one bar of the left hand: { nazev?, delka? (quarter beats, default bar length), udalosti: [{ doba, delka, tony }] }
// doba and delka in quarter beats (multiples of a sixteenth, 0.25); tony = role of the note in the chord (ROLE_TONU):
//   bas (root or bass of a slash chord, E2–D#3), kvinta (fifth above the bass), oktava (bass an octave higher),
//   tercie (third above the bass), souzvuk (chord notes G2–F#3), akord (bass + chord notes above it), pomlka (rest).
export const ROLE_TONU = ['bas', 'kvinta', 'oktava', 'tercie', 'souzvuk', 'akord', 'pomlka'];
const u = (doba, delka, tony) => ({ doba, delka, tony });
const B = 'bas', K = 'kvinta', O = 'oktava', S = 'souzvuk', A = 'akord', R = 'pomlka';

/** style with a name and description from the dictionary (doplnky.styl.<id>.nazev/popis), read in the UI language */
const styl = (id, vlastnosti) => ({
  id, get nazev() { return tx(`styl.${id}.nazev`); }, get popis() { return tx(`styl.${id}.popis`); }, ...vlastnosti,
});
/** deterministic left-hand styles; patterns by time signature, `obecny` = pattern for any metre */
export const STYLY = [
  styl('basy', { obecny: 'basy', vzory: {} }),
  styl('akordy', { obecny: 'akordy', vzory: {} }),
  styl('valcik', { vzory: {
    '3/4': [u(0, 1, B), u(1, 1, S), u(2, 1, S)], '3/8': [u(0, 0.5, B), u(0.5, 0.5, S), u(1, 0.5, S)],
    '6/8': [u(0, 0.5, B), u(0.5, 0.5, S), u(1, 0.5, S), u(1.5, 0.5, B), u(2, 0.5, S), u(2.5, 0.5, S)] } }),
  styl('polka', { vzory: {
    '2/4': [u(0, 0.5, B), u(0.5, 0.5, S), u(1, 0.5, K), u(1.5, 0.5, S)],
    '4/4': [u(0, 1, B), u(1, 1, S), u(2, 1, K), u(3, 1, S)] } }),
  styl('pochod', { vzory: {
    '2/4': [u(0, 1, B), u(1, 0.5, S), u(1.5, 0.5, R)],
    '4/4': [u(0, 1, B), u(1, 0.5, S), u(1.5, 0.5, R), u(2, 1, K), u(3, 0.5, S), u(3.5, 0.5, R)],
    '6/8': [u(0, 1, B), u(1, 0.5, S), u(1.5, 1, K), u(2.5, 0.5, S)] } }),
  styl('ukolebavka', { vzory: {
    '2/4': [u(0, 1, B), u(1, 1, K)], '3/4': [u(0, 1, B), u(1, 1, K), u(2, 1, O)], '3/8': [u(0, 0.5, B), u(0.5, 0.5, K), u(1, 0.5, O)],
    '4/4': [u(0, 1, B), u(1, 1, K), u(2, 1, O), u(3, 1, K)],
    '6/8': [u(0, 0.5, B), u(0.5, 0.5, K), u(1, 0.5, O), u(1.5, 0.5, K), u(2, 0.5, O), u(2.5, 0.5, K)] } }),
  styl('tango', { vzory: {
    '2/4': [u(0, 0.75, B), u(0.75, 0.25, K), u(1, 0.5, S), u(1.5, 0.5, S)],
    '4/4': [u(0, 0.75, B), u(0.75, 0.25, K), u(1, 1, S), u(2, 0.75, B), u(2.75, 0.25, K), u(3, 1, S)] } }),
  styl('popBalada', { vzory: {
    '2/4': [u(0, 1, B), u(1, 1, S)], '3/4': [u(0, 1, B), u(1, 2, S)],
    '4/4': [u(0, 1.5, B), u(1.5, 0.5, K), u(2, 2, S)], '6/8': [u(0, 1.5, B), u(1.5, 1.5, S)] } }),
];

const skupinaDob = met => (met.beatType === 8 ? met.doba : 4 / met.beatType);
/** style pattern for a given metre: { udalosti, delka, prizpusobeno } (if not directly possible, a beat-by-beat pattern) */
export function vzorProTakt(styl, takt) {
  const s = typeof styl === 'string' ? STYLY.find(x => x.id === styl) : styl;
  if (!s) throw new Error(`neznámý styl ${styl}`);
  const met = metrum(takt);
  const L = met.delka, g = skupinaDob(met);
  if (s.vzory?.[takt]) return { udalosti: s.vzory[takt], delka: L, prizpusobeno: false };
  const dob = Math.max(1, Math.round(L / g));
  if (s.obecny === 'basy') return { udalosti: [u(0, L, B)], delka: L, prizpusobeno: false };
  if (s.obecny === 'akordy') return { udalosti: Array.from({ length: dob }, (_, i) => u(i * g, g, A)), delka: L, prizpusobeno: false };
  // another pattern of the same style whose length divides the bar or that the bar divides (2/4 in 4/4, 6/8 in 3/8)
  for (const [k, v] of Object.entries(s.vzory || {})) {
    const P = metrum(k).delka;
    if (metrum(k).beatType === met.beatType && (Math.abs(L / P - Math.round(L / P)) < EPS || Math.abs(P / L - Math.round(P / L)) < EPS)) {
      return { udalosti: v, delka: P, prizpusobeno: true };
    }
  }
  return { udalosti: Array.from({ length: dob }, (_, i) => u(i * g, g, i ? S : B)), delka: L, prizpusobeno: true };
}

const BAS_DOLE = 40, SOUZVUK_DOLE = 43, NEJNIZ = 28;
const maAkordy = p => p.takty.some(t => (t.akordy || []).some(a => tonyAkordu(a.znacka)));
function doplnAkordy(p) {
  const h = harmonizuj(p);
  let pred = null;
  p.takty.forEach((t, i) => {
    if (h[i] && (h[i] !== pred || i === 0)) t.akordy = [{ doba: 0, znacka: h[i] }];
    else t.akordy = [];
    if (h[i]) pred = h[i];
  });
}
/** chords per bar in ticks: [{ pos, znacka }] – at the start of a bar, the chord carried over from earlier */
function akordyPoTaktech(p) {
  let posledni = null;
  return p.takty.map(t => {
    const vlastni = (t.akordy || []).map(a => ({ pos: Math.round((Number(a.doba) || 0) * DIV / 6) * 6, znacka: a.znacka }))
      .filter(a => tonyAkordu(a.znacka)).sort((a, b) => a.pos - b.pos);
    const out = [];
    if (posledni && !(vlastni[0] && vlastni[0].pos === 0)) out.push({ pos: 0, znacka: posledni });
    for (const a of vlastni) {
      if (out.length && out[out.length - 1].pos === a.pos) out[out.length - 1] = a; else out.push(a);
    }
    if (vlastni.length) posledni = vlastni[vlastni.length - 1].znacka;
    return out;
  });
}
const akordV = (seznam, pos) => {
  let a = null;
  for (const x of seznam) if (x.pos <= pos) a = x;
  return a ? a.znacka : null;
};
function znejiciMelodie(noty) {
  const out = [];
  let pos = 0;
  for (const n of noty || []) {
    const d = tiky(n.d);
    for (const v of vysky(n.t)) out.push({ od: pos, do: pos + d, midi: v.midi });
    pos += d;
  }
  return out;
}

/** left-hand pitch(es) for a chord-note role; the melody above the left hand doesn't cross it and no semitone clash arises */
function tonyRole(role, znacka, mel, od, doo) {
  if (role === 'pomlka' || !znacka) return 'r';
  const rz = rozepisAkord(znacka);
  if (!rz) return 'r';
  const znejici = mel.filter(x => x.od < doo && x.do > od).map(x => x.midi);
  const koliduje = m => znejici.some(x => Math.abs(x - m) === 1 || m >= x);
  const umisti = (ton, m) => {
    let mm = m;
    while (koliduje(mm) && mm - 12 >= NEJNIZ) mm -= 12;
    return koliduje(mm) ? null : { s: vyskaZKroku(ton.krok, ton.alter, mm), m: mm };
  };
  const basM = BAS_DOLE + mod(rz.bas.pc - BAS_DOLE, 12);
  const bas = umisti(rz.bas, basM) || { s: vyskaZKroku(rz.bas.krok, rz.bas.alter, basM), m: basM };
  const nad = ton => bas.m + (mod(ton.pc - bas.m, 12) || 12);
  const tercie = rz.tony.find(x => [3, 4, 2, 5].includes(x.interval));
  const kvinta = rz.tony.find(x => [7, 6, 8].includes(x.interval)) || rz.tony[0];
  switch (role) {
    case 'bas': return bas.s;
    case 'kvinta': return (umisti(kvinta, nad(kvinta)) || bas).s;
    case 'oktava': return (umisti(rz.bas, bas.m + 12) || bas).s;
    case 'tercie': return (tercie && umisti(tercie, nad(tercie)) || bas).s;
    case 'souzvuk': {
      let tony = rz.tony.filter(x => x.interval < 12);
      if (tony.length > 3) tony = tony.filter(x => x.interval !== 7);
      const out = [];
      for (const ton of tony) {
        let m = SOUZVUK_DOLE + mod(ton.pc - SOUZVUK_DOLE, 12);
        if (koliduje(m)) m -= 12;
        if (!koliduje(m) && m >= 36) out.push({ s: vyskaZKroku(ton.krok, ton.alter, m), m });
      }
      out.sort((a, b) => a.m - b.m);
      return out.length ? [...new Set(out.map(x => x.s))].join(' ') : bas.s;
    }
    case 'akord': {
      let tony = rz.tony.filter(x => x.interval < 12 && x.pc !== rz.bas.pc);
      if (tony.length > 3) tony = tony.filter(x => x.interval !== 7);
      const out = [bas];
      for (const ton of tony) {
        const m = nad(ton);
        if (!koliduje(m)) out.push({ s: vyskaZKroku(ton.krok, ton.alter, m), m });
      }
      out.sort((a, b) => a.m - b.m);
      return [...new Set(out.map(x => x.s))].join(' ');
    }
  }
  return 'r';
}

/** pattern events in ticks, sorted, without overlaps */
function udalostiVDilcich(udalosti) {
  const out = (udalosti || []).map(x => ({ od: Math.round(x.doba * DIV), do: Math.round((x.doba + x.delka) * DIV), role: x.tony }))
    .filter(x => x.do > x.od).sort((a, b) => a.od - b.od);
  for (let i = 1; i < out.length; i++) if (out[i].od < out[i - 1].do) out[i - 1].do = out[i].od;
  return out.filter(x => x.do > x.od);
}

/**
 * Left hand from a pattern (a style from STYLY via vzorProTakt, or a custom pattern). Chords are taken
 * from the song (if missing entirely, harmonizuj from levels.js fills them in). The pattern repeats periodically across bars
 * (a pattern longer than a bar spreads over several bars), the pickup bar gets the end of the pattern. Returns a new model;
 * the input is unchanged.
 */
export function vzorNaDoprovod(pisen, vzor) {
  const p = kopie(pisen);
  const met = metrum(p.takt);
  const plna = Math.round(met.delka * DIV);
  const ud = udalostiVDilcich(vzor.udalosti);
  const P = Math.max(6, Math.round((vzor.delka ?? met.delka) * DIV));
  if (!maAkordy(p)) doplnAkordy(p);
  const akordy = akordyPoTaktech(p);
  p.takty.forEach((t, ti) => {
    const noty = t.noty || [];
    const L = noty.reduce((a, n) => a + tiky(n.d), 0);
    if (!L) { delete t.leva; return; }
    const posun = ti === 0 && L < plna && p.takty.length > 1 ? plna - L : 0;
    // window of the periodic pattern for this bar
    const start = ti * plna;
    const useky = [];
    for (let k = Math.floor(start / P); k * P < start + plna; k++) {
      for (const e of ud) {
        const a = Math.max(k * P + e.od, start), b = Math.min(k * P + e.do, start + plna);
        if (b > a) useky.push({ od: a - start - posun, do: b - start - posun, role: e.role });
      }
    }
    let us = useky.map(x => ({ ...x, od: Math.max(0, x.od), do: Math.min(L, x.do) })).filter(x => x.do > x.od);
    // split at chord changes
    for (const z of akordy[ti].map(a => a.pos).filter(x => x > 0 && x < L)) {
      us = us.flatMap(x => (x.od < z && x.do > z ? [{ ...x, do: z }, { ...x, od: z }] : [x]));
    }
    const mel = znejiciMelodie(noty);
    const leva = [];
    let kurzor = 0;
    const pridej = (delka, tt) => {
      const kusy = rozdel(delka);
      if (!kusy) return false;
      kusy.forEach((d, k) => leva.push({ t: tt, d: naD(d), lig: tt !== 'r' && k < kusy.length - 1, s: '' }));
      return true;
    };
    let ok = true;
    for (const x of us.sort((a, b) => a.od - b.od)) {
      if (x.od > kurzor) ok = pridej(x.od - kurzor, 'r') && ok;
      const tt = tonyRole(x.role, akordV(akordy[ti], x.od), mel, x.od, x.do);
      ok = pridej(x.do - Math.max(x.od, kurzor), tt) && ok;
      kurzor = x.do;
    }
    if (kurzor < L) ok = pridej(L - kurzor, 'r') && ok;
    t.leva = ok ? leva : noty.map(n => ({ t: 'r', d: n.d, lig: false, s: '' }));
  });
  return p;
}

/** accompaniment in a preset style (id from STYLY or a style object) → new model with the left hand */
export function doprovodVeStylu(pisen, styl) {
  const v = vzorProTakt(styl, pisen.takt);
  return vzorNaDoprovod(pisen, { udalosti: v.udalosti, delka: v.delka });
}

// ================================================================ 5. NEW SONG MADE TO MEASURE
/** topics for children in the UI language (a child doesn't type free text) */
export const temata = () => tsez('temata');
/** Czech topics (fixed list for older callers; the UI uses temata()) */
export const TEMATA = TEMATA_JAZYKU.cs.split('|');
/** the child's topic must be one of the preset ones (in any language) */
const predvoleneTema = tema => Object.values(TEMATA_JAZYKU).flatMap(s => s.split('|'))
  .find(x => x.toLowerCase() === tema.toLowerCase());

const VULGARNI = /(?<![a-z])(kurv|prdel|hovn|srac|sracka|zmrd|kokot|pic[aeiu](?![a-z])|curak|kreten|debil|idiot|hajzl|mrd|jeb|fuck|shit|bitch|cunt|chcip|buzn|buzerant|ser(?:e|u|ou)(?![a-z]))/;
const jeVulgarni = s => VULGARNI.test(bezDiakritiky(s));

/** key signature guess from notes: fewest accidentals where all notes are diatonic (preferably with the tonic = 1st note) */
function odhadPredznamenani(tony) {
  const kandidati = [];
  for (let f = -7; f <= 7; f++) if (tony.every(v => alterVTonine(v.krok, f) === v.alter)) kandidati.push(f);
  if (!kandidati.length) return 0;
  const prvni = tony[0] ? mod(tony[0].midi, 12) : null;
  return [...kandidati].sort((a, b) => (tonikaDur(b).pc === prvni) - (tonikaDur(a).pc === prvni) || Math.abs(a) - Math.abs(b))[0];
}

/** unified constraints of a new song (default: child, 4/4, 8 bars, notes C D E F G) */
function normalizujOmezeni(o = {}) {
  const pasmo = urciPasmo(o.pasmo ?? o.profil);
  const takt = /^\d+\/(2|4|8)$/.test(o.takt || '') ? o.takt : '4/4';
  const met = metrum(takt);
  const taktu = Math.max(2, Math.min(32, Math.round(Number(o.taktu) || 8)));
  let tony = null;
  if (Array.isArray(o.tony) && o.tony.length) {
    tony = [];
    let pred = null;
    for (const x of o.tony) {
      const s = String(x).trim();
      let v = vyska(/\d$/.test(s) ? s : s + '4');
      if (!v) continue;
      if (!/\d$/.test(s) && pred) while (v.midi <= pred.midi) v = vyska(s + (v.okt + 1));
      tony.push(v);
      pred = v;
    }
    if (!tony.length) tony = null;
  }
  const f = Number.isInteger(o.predznamenani) ? Math.max(-7, Math.min(7, o.predznamenani)) : tony ? odhadPredznamenani(tony) : 0;
  const dur = o.dur !== false;
  let povolene;                                              // [{ midi, t }]
  if (tony) povolene = tony.map(v => ({ midi: v.midi, t: zapisVysky(v.krok, v.alter, v.okt) }));
  else {
    const vychozi = pasmo === 'dite' ? ['C4', 'G4'] : ['C4', 'C5'];
    const lo = vyska(o.rozsah?.od) || vyska(vychozi[0]), hi = vyska(o.rozsah?.do) || vyska(vychozi[1]);
    povolene = [];
    for (let okt = lo.okt; okt <= hi.okt; okt++) for (const krok of KROKY) {
      const alter = alterVTonine(krok, f);
      const m = 12 * (okt + 1) + KROK_PC[krok] + alter;
      if (m >= lo.midi && m <= hi.midi) povolene.push({ midi: m, t: zapisVysky(krok, alter, okt) });
    }
  }
  povolene = povolene.filter((x, i, a) => a.findIndex(y => y.midi === x.midi) === i).sort((a, b) => a.midi - b.midi);
  const delkyVychozi = pasmo === 'dite' ? ['1/8', '1/4', '1/2'] : ['1/16', '1/8', '3/16', '1/4', '3/8', '1/2', '3/4', '1/1'];
  if (pasmo === 'dite' && Math.abs(met.delka - 3) < EPS) delkyVychozi.push('3/4');
  if (pasmo === 'dite' && Math.abs(met.delka - 4) < EPS) delkyVychozi.push('1/1');
  if (pasmo === 'dite' && Math.abs(met.delka - 1.5) < EPS) delkyVychozi.push('3/8');
  if (pasmo === 'dite' && met.beatType === 8 && met.beats % 3 === 0) delkyVychozi.push('3/8');
  const delky = (Array.isArray(o.delky) && o.delky.length ? o.delky : delkyVychozi)
    .map(d => naZlomek(zlomek(d))).filter(d => d && typNoty(zlomek(d))).filter((d, i, a) => a.indexOf(d) === i)
    .filter(d => zlomek(d) <= met.delka + EPS);
  const T0 = dur ? tonikaDur(f) : tonikaMoll(f);
  let tema = typeof o.tema === 'string' ? o.tema.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  if (pasmo === 'dite') tema = predvoleneTema(tema) || '';
  if (tema && (jeVulgarni(tema) || KONTAKT.test(tema))) tema = '';
  return {
    pasmo, takt, met, taktu, predznamenani: f, dur, tonika: T0, povolene, delky, tema: tema || null,
    tempo: pasmo === 'dite' ? 90 : 100,
    zakazanaSlova: (o.zakazanaSlova || []).map(s => bezDiakritiky(String(s).trim())).filter(Boolean),
  };
}

/** diatonic chords of the key: [{ znacka, stupen }] (no diminished; V major in minor) */
function diatonickeAkordy(O) {
  const ki = KROKY.indexOf(O.tonika.krok);
  const stupne = Array.from({ length: 7 }, (_, i) => {
    const krok = KROKY[(ki + i) % 7];
    let alter = alterVTonine(krok, O.predznamenani);
    if (!O.dur && i === 6) alter += 1;                       // leading tone in minor
    return { krok, alter, pc: mod(KROK_PC[krok] + alter, 12) };
  });
  const out = [];
  for (let i = 0; i < 7; i++) {
    const r = stupne[i], t = stupne[(i + 2) % 7], k = stupne[(i + 4) % 7];
    const tr = mod(t.pc - r.pc, 12), kv = mod(k.pc - r.pc, 12);
    if (kv !== 7) continue;
    const zn = zapisVysky(r.krok, r.alter, '').replace(/\d/g, '') + (tr === 3 ? 'm' : '');
    out.push({ znacka: zn, stupen: i });
    if (i === 4 && tr === 4) out.push({ znacka: zn + '7', stupen: i });
  }
  return out;
}
const klicAkordu = t => `${t.koren}:${[...t.tony].sort((a, b) => a - b).join('.')}`;
function jeDiatonicky(znacka, dia) {
  const t = tonyAkordu(znacka);
  if (!t || !t.tony.includes(t.bas)) return false;
  return dia.some(d => klicAkordu(tonyAkordu(d.znacka)) === klicAkordu(t));
}

/** fills rests up to the remaining length zbyva (ticks) from allowed lengths; if impossible, null */
function pomlkyZ(zbyva, povoleneDilky) {
  const out = [];
  for (const d of [...povoleneDilky].sort((a, b) => b - a)) while (zbyva >= d) { out.push(d); zbyva -= d; }
  return zbyva === 0 ? out : null;
}

/** rhythmic cells of one beat (groups) from allowed lengths: array of arrays of ticks */
function bunkyRytmu(g, delky, maxNot) {
  const out = [];
  const zkus = (zbyva, akt) => {
    if (zbyva === 0) { out.push(akt); return; }
    if (akt.length >= maxNot) return;
    const pos = g - zbyva;
    // a note of an eighth or longer starts on the eighth grid (no syncopation across the beat)
    for (const d of delky) if (d <= zbyva && pos % Math.min(d, DIV / 2) === 0) zkus(zbyva - d, [...akt, d]);
  };
  zkus(g, []);
  return out;
}

/**
 * Simple melody (deterministic by seed): stepwise motion, repeated motif (bars 5–6 = 1–2),
 * half cadence on the dominant, ending 2nd degree → tonic, chords from harmonizuj (last bar tonic). Passes the bar length check.
 */
export function sablonaNovePisne(omezeni = {}, seed = 1) {
  const O = normalizujOmezeni(omezeni);
  const rnd = prng(seed);
  const L = Math.round(O.met.delka * DIV);
  const g = Math.round(skupinaDob(O.met) * DIV);
  const dl = O.delky.map(tiky).filter(x => x > 0).sort((a, b) => b - a);
  const dite = O.pasmo === 'dite';
  // cells: one beat (group) or one long note across several beats
  const bunky = bunkyRytmu(g, dl, dite ? 2 : 3).map(b => ({ b, w: b.length === 1 ? 3 : b.length === 2 ? (dite ? 1.5 : 2) : 1 }));
  for (const d of dl) if (d > g && d % g === 0 && d <= L) bunky.push({ b: [d], w: 0.5 });
  if (!bunky.length) throw new Error('z povolených délek nejde složit dobu');
  const vazeny = moznosti => {
    const s = moznosti.reduce((a, x) => a + x.w, 0);
    let r = rnd() * s;
    for (const x of moznosti) { r -= x.w; if (r <= 0) return x; }
    return moznosti[moznosti.length - 1];
  };
  const rytmusTaktu = () => {
    const out = [];
    let pos = 0;
    while (pos < L) {
      const m = bunky.filter(x => x.b.reduce((a, y) => a + y, 0) <= L - pos);
      if (!m.length) break;
      const c = vazeny(m);
      out.push(...c.b);
      pos += c.b.reduce((a, y) => a + y, 0);
    }
    return pos === L ? out : null;
  };
  const zaver = () => {                                          // long note + possibly rests
    for (const d of dl) {
      if (d > L) continue;
      const p = pomlkyZ(L - d, dl);
      if (p) return [d, ...p.map(x => -x)];
    }
    return null;
  };
  const ryt = [];
  for (let k = 0; k < O.taktu; k++) {
    if (k === O.taktu - 1) ryt.push(zaver());
    else if (k >= 4 && k < O.taktu - 2 && ryt[k - 4] && k - 4 < O.taktu - 1) ryt.push(ryt[k - 4]);
    else ryt.push(rytmusTaktu());
    if (!ryt[k]) throw new Error('z povolených délek nejde složit takt');
  }
  // melody by degrees of the allowed notes
  const S = O.povolene;
  const stred = (S[0].midi + S[S.length - 1].midi) / 2;
  const indexyPc = pc => S.map((x, i) => (mod(x.midi, 12) === pc ? i : -1)).filter(i => i >= 0);
  const nejblizsi = (pc, k0) => {
    const ix = indexyPc(pc);
    return ix.length ? ix.reduce((a, b) => (Math.abs(b - k0) < Math.abs(a - k0) ? b : a)) : null;
  };
  const tonikaIx = (() => { const ix = indexyPc(O.tonika.pc); return ix.length ? ix.reduce((a, b) => (Math.abs(S[b].midi - stred) < Math.abs(S[a].midi - stred) ? b : a)) : 0; })();
  // half cadence: the note of the dominant chord closest to the tonic (so the motif can return stepwise)
  const dominantaIx = [7, 2, 11].map(iv => nejblizsi(mod(O.tonika.pc + iv, 12), tonikaIx)).filter(x => x != null)
    .sort((a, b) => Math.abs(a - tonikaIx) - Math.abs(b - tonikaIx))[0] ?? null;
  const maxKrok = dite ? 2 : 3;
  // fixed points: phrase targets and the repeated motif (bars 5–6 = 1–2); between them the melody moves by steps ≤ maxKrok
  const pocty = ryt.map(r => r.filter(x => x > 0).length);
  const zacatky = pocty.map((_, k) => pocty.slice(0, k).reduce((a, x) => a + x, 0));
  const celkem = pocty.reduce((a, x) => a + x, 0);
  const kopieTaktu = k => k >= 4 && k <= 5 && O.taktu >= 8 && k < O.taktu - 2;
  const cile = new Map();
  for (let k = 0; k < O.taktu; k++) {
    if (kopieTaktu(k) || !pocty[k]) continue;
    let cil = null;
    if (k === O.taktu - 1) cil = tonikaIx;
    else if (k === O.taktu - 2) cil = tonikaIx + 1 < S.length ? tonikaIx + 1 : tonikaIx - 1;
    else if ((k + 1) % 4 === 0 && dominantaIx != null) cil = dominantaIx;
    if (cil != null) cile.set(zacatky[k] + pocty[k] - 1, Math.max(0, Math.min(S.length - 1, cil)));
  }
  const taktNoty = g => { let k = 0; while (k + 1 < O.taktu && zacatky[k + 1] <= g) k++; return k; };
  const hodnoty = [];
  const pevnaHodnota = g => {
    const k = taktNoty(g);
    if (kopieTaktu(k)) return hodnoty[zacatky[k - 4] + (g - zacatky[k])];
    return cile.get(g);
  };
  let cur = tonikaIx;
  for (let g = 0; g < celkem; g++) {
    const pevna = g === 0 ? tonikaIx : pevnaHodnota(g);
    if (pevna != null) { cur = pevna; hodnoty.push(cur); continue; }
    const r = rnd();
    let krok = r < 0.6 ? 1 : r < 0.85 ? 2 : 0;
    if (!dite && r > 0.95) krok = 3;
    krok = Math.min(krok, maxKrok);
    let smer = rnd() < 0.5 ? 1 : -1;
    if (cur + smer * krok < 0 || cur + smer * krok >= S.length) smer = -smer;
    let dalsi = Math.max(0, Math.min(S.length - 1, cur + smer * krok));
    // the nearest fixed point must remain reachable by steps
    for (let j = g + 1; j < celkem; j++) {
      const c = pevnaHodnota(j);
      if (c == null) continue;
      if (Math.abs(dalsi - c) > maxKrok * (j - g)) dalsi = cur + Math.sign(c - cur) * Math.min(maxKrok, Math.abs(c - cur));
      break;
    }
    cur = dalsi;
    hodnoty.push(cur);
  }
  const vysky = ryt.map((_, k) => hodnoty.slice(zacatky[k], zacatky[k] + pocty[k]));
  const takty = ryt.map((r, k) => {
    let i = 0;
    return { akordy: [], noty: r.map(x => (x > 0 ? { t: S[vysky[k][i++]].t, d: naD(x), lig: false, s: '' } : { t: 'r', d: naD(-x), lig: false, s: '' })) };
  });
  const nazev = O.tema ? tx('nova.nazevTema', { tema: O.tema }) : tx('nova.nazev');
  const pisen = { nazev, autor: '', klic: 'houslovy', predznamenani: O.predznamenani, takt: O.takt, tempo: O.tempo, takty };
  const h = harmonizuj(pisen);
  const dia = diatonickeAkordy(O);
  const tonikaZn = dia.find(d => d.stupen === 0)?.znacka;
  if (tonikaZn) { h[0] = tonikaZn; h[h.length - 1] = tonikaZn; }       // starts and ends on the tonic (the 1st note is the tonic)
  let pred = null;
  takty.forEach((t, i) => {
    const z = h[i] && jeDiatonicky(h[i], dia) ? h[i] : null;
    if (z && (z !== pred || i === 0)) t.akordy = [{ doba: 0, znacka: z }];
    if (z) pred = z;
  });
  return pisen;
}

// ================================================================ 6. WEEKLY SUMMARY
const casMs = k => (k instanceof Date ? k.getTime() : typeof k === 'number' ? k : Date.parse(k));
const den = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** statistics → [{ klic, nazev, statistika, pisen }] (array of records or an object { klic: statistika | record }) */
function seznamStatistik(statistiky) {
  if (Array.isArray(statistiky)) return statistiky.map((x, i) => ({ klic: x.klic ?? String(i), nazev: x.nazev ?? '', statistika: x.statistika ?? x, pisen: x.pisen ?? null }));
  return Object.entries(statistiky || {}).map(([klic, x]) => (x && x.verze === 1
    ? { klic, nazev: '', statistika: x, pisen: null }
    : { klic, nazev: x?.nazev ?? '', statistika: x?.statistika ?? {}, pisen: x?.pisen ?? null }));
}

/**
 * Facts for a week (or another period od ≤ kdy < do). statistiky = song statistics (slucStatistiky from practice.js),
 * as an array [{ klic, nazev?, statistika, pisen? }] or an object { klic: statistika }; vysledky = optional session
 * records [{ kdy, klic?, dobaMs | minut }] for practice minutes (without them minut = null).
 */
export function faktaTydne(statistiky, vysledky, od, dok, profil) {
  const a = casMs(od), b = casMs(dok);
  const vObdobi = k => { const t = casMs(k); return Number.isFinite(t) && t >= a && t < b; };
  const dny = new Set();
  let pokusu = 0, cistych = 0;
  const pisne = [];
  for (const z of seznamStatistik(statistiky)) {
    const hist = (z.statistika?.historie || []).filter(h => Number.isFinite(casMs(h.kdy))).sort((x, y) => casMs(x.kdy) - casMs(y.kdy));
    const H = hist.filter(h => vObdobi(h.kdy));
    if (!H.length) continue;
    const pred = hist.filter(h => casMs(h.kdy) < a);
    H.forEach(h => dny.add(den(casMs(h.kdy))));
    pokusu += H.length;
    const c = H.filter(h => h.cisty).length;
    cistych += c;
    const pr = x => Math.round(100 * (x.presnost ?? 0));
    const n3 = Math.min(3, H.length);
    const zacatek = Math.round(prumer(H.slice(0, n3).map(pr))), konec = Math.round(prumer(H.slice(-n3).map(pr)));
    const predTydnem = pred.length ? Math.round(prumer(pred.slice(-3).map(pr))) : null;
    const maxR = Math.max(...H.map(h => Number(h.rychlost) || 0));
    const maxPred = pred.length ? Math.max(...pred.map(h => Number(h.rychlost) || 0)) : null;
    let tm = [];
    if (z.pisen) tm = tezkaMista(z.statistika, z.pisen, 2).map(x => ({ takty: x.takty, druh: x.druh }));
    else {
      tm = Object.entries(z.statistika?.takty || {}).map(([k, t]) => ({ k: Number(k), s: t.noty ? t.chyby / (t.noty + 1) : 0 }))
        .filter(x => x.s >= 0.15).sort((x, y) => y.s - x.s || x.k - y.k).slice(0, 2)
        .map(x => ({ takty: String(x.k + 1), druh: 'chyby' }));
    }
    pisne.push({
      nazev: z.nazev || '', pokusu: H.length, cistych: c,
      presnost: { zacatek, konec, zmena: H.length >= 2 ? konec - zacatek : null, predTydnem, oprotiMinule: predTydnem != null ? konec - predTydnem : null },
      rychlost: { max: maxR, predTydnem: maxPred, zmena: maxPred != null ? maxR - maxPred : null, plnaCista: H.some(h => h.cisty && Number(h.rychlost) >= 100) },
      tezkaMista: tm,
      _klic: z.klic,
    });
  }
  pisne.sort((x, y) => y.pokusu - x.pokusu);
  let minut = null;
  for (const v of vysledky || []) {
    if (!vObdobi(v.kdy)) continue;
    const m = Number.isFinite(v.minut) ? v.minut : Number.isFinite(v.dobaMs) ? v.dobaMs / 60000 : null;
    if (m != null) minut = (minut || 0) + m;
    dny.add(den(casMs(v.kdy)));
  }
  const zlepseni = pisne.some(p => (p.presnost.zmena ?? 0) >= 5 || (p.presnost.oprotiMinule ?? 0) >= 5 || (p.rychlost.zmena ?? 0) > 0);
  // what to try next time
  let doporuceni = null;
  const sTezkym = pisne.find(p => p.tezkaMista.length && !p.rychlost.plnaCista);
  const kZrychleni = pisne.find(p => p.presnost.konec >= 90 && p.rychlost.max < 100);
  if (sTezkym) doporuceni = { nazev: sTezkym.nazev, klic: sTezkym._klic, proc: 'tezke-misto', takty: sTezkym.tezkaMista[0].takty };
  else if (kZrychleni) doporuceni = { nazev: kZrychleni.nazev, klic: kZrychleni._klic, proc: 'zrychlit', rychlost: Math.min(100, kZrychleni.rychlost.max + 5) };
  else if (pisne.length && pisne.every(p => p.rychlost.plnaCista)) doporuceni = { nazev: null, klic: null, proc: 'nova-pisen' };
  else if (pisne.length) doporuceni = { nazev: pisne[0].nazev, klic: pisne[0]._klic, proc: 'opakovat' };
  return {
    pasmo: urciPasmo(profil),
    obdobi: { od: den(a), do: den(b - 1) },
    dniCviceni: dny.size,
    minut: minut != null ? Math.round(minut) : null,
    pokusu, cistych,
    pisne: pisne.map(p => { const o = { ...p }; delete o._klic; return o; }),
    zlepseni,
    doporuceni,
  };
}

/** weekly summary: { shrnuti, pisne: string[], priste } */
export function sablonaTydne(fakta) {
  const F = fakta, dite = F.pasmo === 'dite';
  if (!F.pokusu) {
    return { shrnuti: tx(dite ? 'tyden.prazdnoDite' : 'tyden.prazdno'), pisne: [], priste: tx(dite ? 'tyden.prazdnoPristeDite' : 'tyden.prazdnoPriste') };
  }
  const casti = [tx('tyden.dni', { n: F.dniCviceni }), tx('tyden.pokusu', { n: F.pokusu })];
  if (F.minut != null) casti.push(tx('tyden.minut', { n: F.minut }));
  if (F.cistych) casti.push(tx('tyden.cistych', { n: F.cistych }));
  const shrnuti = casti.join(', ') + '.';
  const pisne = F.pisne.slice(0, 4).map(p => {
    const jm = p.nazev ? `${p.nazev}: ` : '';
    const v = [];
    const pr = p.presnost;
    if (pr.oprotiMinule != null && pr.oprotiMinule >= 5) v.push(tx('tyden.presnostZmena', { od: pr.predTydnem, do: pr.konec }));
    else if (pr.zmena != null && pr.zmena >= 5) v.push(tx('tyden.presnostZmena', { od: pr.zacatek, do: pr.konec }));
    else v.push(tx('tyden.presnost', { do: pr.konec }));
    if (p.rychlost.zmena != null && p.rychlost.zmena > 0) v.push(tx('tyden.tempoZmena', { od: p.rychlost.predTydnem, do: p.rychlost.max }));
    else v.push(tx('tyden.tempoDo', { do: p.rychlost.max }));
    if (p.tezkaMista[0]) v.push(tx(dite ? 'tyden.tezkeMistoDite' : 'tyden.tezkeMisto', { takty: p.tezkaMista[0].takty, n: pocetTaktu(p.tezkaMista[0].takty) }));
    return jm + v.join(', ') + '.';
  });
  const d = F.doporuceni;
  const sPisni = d?.nazev ? 'Pisen' : '';                     // template variant with the song name
  const par = { takty: d?.takty, n: pocetTaktu(d?.takty), nazev: d?.nazev, rychlost: d?.rychlost };
  const priste = !d ? '' : d.proc === 'tezke-misto' ? tx((dite ? 'tyden.priste.tezkeDite' : 'tyden.priste.tezke') + sPisni, par)
    : d.proc === 'zrychlit' ? tx('tyden.priste.zrychlit' + sPisni, par)
      : d.proc === 'nova-pisen' ? tx(dite ? 'tyden.priste.novaDite' : 'tyden.priste.nova')
        : tx('tyden.priste.opakovat' + sPisni, par);
  return { shrnuti, pisne, priste };
}

// ================================================================ 7. ECHO GAME
const DELKA_PODLE_UROVNE = { 1: 3, 2: 4, 3: 5, 4: 6 };
const LIMITY = { 1: { skok: 4, minQ: 0.5, maxQ: 2, tecky: false }, 2: { skok: 7, minQ: 0.5, maxQ: 2, tecky: false },
  3: { skok: 12, minQ: 0.25, maxQ: 3, tecky: true }, 4: { skok: 24, minQ: 0.125, maxQ: 4, tecky: true } };
const motivNota = (v, q, msNaDobu, start) => ({ midi: v.midi, t: zapisVysky(v.krok, v.alter, v.okt), jmeno: jmenoTonu(v.krok, v.alter), cesky: zapisTonu(v.krok, v.alter, v.okt), q, d: naZlomek(q), ms: Math.round(start * msNaDobu), delkaMs: Math.round(q * msNaDobu) });

/**
 * Short motif from a song to repeat. volby: { delka 3–6 (default by level), uroven 1–4, seed }.
 * Picks consecutive single-voice notes without rests and ties within one phrase; the level limits leaps and rhythm.
 * → { zdroj: 'pisen', takt (number in the score), noty: [{ midi, t, jmeno, cesky, q, d, ms, delkaMs }], tempo } | null
 */
export function motiv(pisen, { delka, uroven = 1, seed = 0 } = {}) {
  const ur = Math.max(1, Math.min(4, Math.round(uroven) || 1));
  const n = Math.max(3, Math.min(6, Math.round(delka || DELKA_PODLE_UROVNE[ur])));
  const T = pisen?.takty || [];
  const mel = notyRuky(T);
  const lin = { takt: pisen.takt, takty: T.map(t => { const x = { ...t }; delete x.znacky; return x; }) };
  const fr = fraze(lin);
  const fraze0 = new Set(fr.map(f => f.od));
  const tempo = Number(pisen.tempo) > 0 ? Number(pisen.tempo) : 90;
  const kandidati = [];
  for (let s = 0; s + n <= mel.length; s++) {
    const w = mel.slice(s, s + n);
    if (w.some(x => !x.v || x.vs.length > 1)) continue;
    if (w.slice(0, -1).some(x => x.n.lig)) continue;
    const f = fr.find(x => x.od <= w[0].ti && x.do >= w[0].ti);
    if (!f || w[n - 1].ti > f.do) continue;
    const skok = Math.max(...w.slice(1).map((x, i) => Math.abs(x.v.midi - w[i].v.midi)));
    const minQ = Math.min(...w.map(x => x.q)), maxQ = Math.max(...w.map(x => x.q));
    if (new Set(w.map(x => x.v.midi)).size < 2) continue;
    const tecky = w.some(x => (typNoty(x.q)?.tecky || 0) > 0 || typNoty(x.q)?.trioly);
    const zacatek = fraze0.has(w[0].ti) && w[0].i === (T[w[0].ti].noty || []).findIndex(y => y.t !== 'r');
    kandidati.push({ s, w, skok, minQ, maxQ, tecky, zacatek });
  }
  let vhodne = [];
  for (let u = ur; u <= 4 && !vhodne.length; u++) {
    const lim = LIMITY[u];
    vhodne = kandidati.filter(k => k.skok <= lim.skok && k.minQ >= lim.minQ - EPS && k.maxQ <= lim.maxQ + EPS && (lim.tecky || !k.tecky));
  }
  if (!vhodne.length) vhodne = kandidati;
  if (!vhodne.length) return null;
  vhodne.sort((a, b) => (b.zacatek - a.zacatek) || a.s - b.s);
  const k = vhodne[mod(Math.round(seed) || 0, vhodne.length)];
  const msNaDobu = 60000 / tempo;
  let start = 0;
  const noty = k.w.map(x => { const o = motivNota(x.v, x.q, msNaDobu, start); start += x.q; return o; });
  return { zdroj: 'pisen', takt: k.w[0].ti + 1, noty, tempo, uroven: ur };
}

/** key from text ('C', 'G', 'Bb', 'Fis', 'Am', 'a moll') or from a jakaTonina object → { krok, alter, pc, dur, predznamenani } */
function parsujToninu(tonina) {
  if (tonina && typeof tonina === 'object' && Number.isFinite(tonina.pc)) {
    return { krok: tonina.krok, alter: tonina.alter ?? 0, pc: tonina.pc, dur: tonina.dur !== false, predznamenani: tonina.predznamenani ?? 0 };
  }
  const m = String(tonina ?? 'C').trim().match(/^([A-Ha-h])(is|es|s|#|b)?\s*(m(?:i|oll)?)?/);
  if (!m) return parsujToninu('C');
  const pis = m[1].toUpperCase();
  let krok = pis === 'H' ? 'B' : pis, alter = { is: 1, '#': 1, es: -1, s: -1, b: -1 }[m[2]] || 0;
  const dur = !m[3] && !/moll/i.test(String(tonina));
  const pc = mod(KROK_PC[krok] + alter, 12);
  let f = 0;
  for (let x = -7; x <= 7; x++) {
    const t = dur ? tonikaDur(x) : tonikaMoll(x);
    if (t.krok === krok && t.alter === alter) { f = x; break; }
  }
  return { krok, alter, pc, dur, predznamenani: f };
}

/**
 * Random (deterministic by seed) motif in a key for Echo. obtiznost 1–4: length 3–6 notes, 1 = steps within five
 * notes and quarters, 2 = also thirds and a half note at the end, 3 = leaps up to a fifth and eighths, 4 = up to an octave and dotted rhythm.
 */
export function nahodnyMotiv(tonina, seed = 1, obtiznost = 1) {
  const T = parsujToninu(tonina);
  const ob = Math.max(1, Math.min(4, Math.round(obtiznost) || 1));
  const rnd = prng(seed);
  const n = DELKA_PODLE_UROVNE[ob];
  const krokTon = KROKY.indexOf(T.krok);
  const zakladOkt = mod(T.pc, 12) > 7 ? 3 : 4;                  // tonic around C4 (c1)
  const stupen = s => {                                          // degree (from 0) → vyska
    const ks = krokTon + s;
    const krok = KROKY[mod(ks, 7)];
    let alter = alterVTonine(krok, T.predznamenani);
    if (!T.dur && mod(s, 7) === 6) alter += 1;
    return vyska(zapisVysky(krok, alter, zakladOkt + Math.floor(ks / 7)));
  };
  const rozsah = { 1: [0, 4], 2: [0, 5], 3: [-1, 7], 4: [-3, 9] }[ob];
  const maxKrok = { 1: 1, 2: 2, 3: 4, 4: 7 }[ob];
  let s = 0;
  const stupne = [0];
  for (let i = 1; i < n; i++) {
    const r = rnd();
    let k = ob === 1 ? (r < 0.8 ? 1 : 0) : Math.max(1, Math.ceil(r * r * maxKrok));
    let smer = rnd() < 0.5 ? 1 : -1;
    if (s + smer * k < rozsah[0] || s + smer * k > rozsah[1]) smer = -smer;
    s = Math.max(rozsah[0], Math.min(rozsah[1], s + smer * k));
    stupne.push(s);
  }
  // rhythm in quarter beats
  const q = new Array(n).fill(1);
  if (ob >= 2) q[n - 1] = 2;
  if (ob >= 3) { const i = 1 + Math.floor(rnd() * (n - 2)); q[i] = 0.5; q[i + 1 < n - 1 ? i + 1 : i] = 0.5; }
  if (ob >= 4) { const i = Math.floor(rnd() * (n - 2)); if (q[i] === 1 && q[i + 1] === 1) { q[i] = 1.5; q[i + 1] = 0.5; } }
  const tempo = 90, msNaDobu = 60000 / tempo;
  let start = 0;
  const noty = stupne.map((st, i) => { const o = motivNota(stupen(st), q[i], msNaDobu, start); start += q[i]; return o; });
  return { zdroj: 'nahodny', takt: null, noty, tempo, uroven: ob };
}

/**
 * Compares the played echo with the motif. zahrane = [{ midi, ms }] (onsets), volby { tolerance: 0.3 = allowed
 * relative deviation between onsets, oktava: false = notes an octave off count as correct }.
 * Rhythm is evaluated relatively: the player's tempo is normalised (sum of the gaps between onsets).
 * → { trefa, spravneTony, spravnyRytmus, popis, detail: [{ ocekavano, zahrano, ok }], msNaDobu }
 */
export function porovnejOzvenu(motivx, zahrane, { tolerance = 0.3, oktava = false } = {}) {
  const cil = motivx?.noty || [];
  const hra = [...(zahrane || [])].filter(x => Number.isFinite(x.midi) && Number.isFinite(x.ms)).sort((a, b) => a.ms - b.ms);
  const stejny = (a, b) => (oktava ? mod(a, 12) === mod(b, 12) : a === b);
  const detail = cil.map((c, i) => ({ ocekavano: c.cesky, zahrano: hra[i] ? ceskyZMidi(hra[i].midi, c) : null, ok: !!hra[i] && stejny(hra[i].midi, c.midi) }));
  const spravnyPocet = hra.length === cil.length;
  const spravneTony = spravnyPocet && detail.every(d => d.ok);
  // rhythm: gaps between onsets (in quarter beats vs. ms)
  let spravnyRytmus = false, msNaDobu = null, nejhorsi = null;
  if (spravnyPocet && cil.length >= 2) {
    const ocek = cil.slice(0, -1).map((c, i) => cil[i + 1].ms - c.ms);
    const zahr = hra.slice(0, -1).map((h, i) => hra[i + 1].ms - h.ms);
    const so = ocek.reduce((a, x) => a + x, 0), sz = zahr.reduce((a, x) => a + x, 0);
    if (so > 0 && sz > 0) {
      const k = sz / so;
      msNaDobu = Math.round(k * (cil[0].delkaMs / cil[0].q));
      const odch = ocek.map((o, i) => (zahr[i] / k - o) / o);
      spravnyRytmus = odch.every(x => Math.abs(x) <= tolerance);
      const i = odch.reduce((a, x, j) => (Math.abs(x) > Math.abs(odch[a]) ? j : a), 0);
      nejhorsi = { i, odchylka: odch[i] };
    }
  } else if (spravnyPocet) spravnyRytmus = true;
  const poradi = i => tsez('radove')[i] ?? tx('radove.cislo', { n: i + 1 });      // i from 0: 'první', 'druhý'… (first, second)
  let popis;
  if (!hra.length) popis = tx('ozvena.nic');
  else if (!spravnyPocet) popis = tx('ozvena.pocet', { n: cil.length, m: hra.length });
  else if (!spravneTony) {
    const i = detail.findIndex(d => !d.ok);
    popis = tx('ozvena.ton', { Poradi: velke(poradi(i)), poradi: poradi(i), ma: detail[i].ocekavano, je: detail[i].zahrano });
  } else if (!spravnyRytmus && nejhorsi) {
    popis = tx(nejhorsi.odchylka < 0 ? 'ozvena.brzy' : 'ozvena.pozde', { poradi: poradi(nejhorsi.i + 1) });
  } else popis = tx('ozvena.trefa');
  return { trefa: spravneTony && spravnyRytmus, spravneTony, spravnyRytmus, popis, detail, msNaDobu };
}
function ceskyZMidi(midi, vzor) {
  const pc = mod(midi, 12);
  const v = vzor && mod(vzor.midi, 12) === pc ? vyska(vzor.t.replace(/-?\d+$/, '') + (Math.floor(midi / 12) - 1)) : vyska(zMidi(midi));
  return zapisTonu(v.krok, v.alter, v.okt);
}
