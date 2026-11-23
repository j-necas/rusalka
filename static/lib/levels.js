// "The song grows with you": deterministically (no AI) builds a ladder of difficulty levels from one song,
// plus right-hand fingering. Pure functions on the "Pisen" model from ./song.js – the input is never changed, a new
// model is returned.
//
// Levels:
//   1 Melody with easy rhythm  – right hand only, chord → top note, sixteenths/triplets/dotted rhythms to eighths
//   2 Full melody              – right hand only, unchanged
//   3 Melody and bass          – left hand holds the chord root (no chords → simple I/IV/V… harmonization)
//   4 Melody with accompaniment – left hand bass + chord by metre (waltz, polka, 6/8)
//   5 Original                 – as written (available only with its own left hand)
// Options: transpozice 'ne' | 'C' | 'snadna', prstoklad true/false, vek 'dite' | 'dospely'.

import {
  DIV, DRUHY, zlomek, naZlomek, typNoty, metrum, soucetTaktu, vyska, vysky, zMidi, alterVTonine, akordZnacky,
  tonyAkordu, kopie, rozvin,
} from './song.js';
import { t } from './texts.js';

const EPS = 1e-6;
const KROKY = 'CDEFGAB';
const KROK_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const mod = (a, n) => ((a % n) + n) % n;
const tiky = d => Math.round((zlomek(d) || 0) * DIV);             // note length in ticks (DIV per quarter)
const naD = t => naZlomek(t / DIV);                                // ticks → '1/8'

// ---------------------------------------------------------------- pitches and keys
/** step + accidental + octave → 'F#4' / 'Bb3' / 'C##5' */
function zapisVysky(krok, alter, okt) {
  return krok + ({ 1: '#', 2: '##', '-1': 'b', '-2': 'bb' }[alter] || '') + okt;
}
/** step with an accidental to a specific MIDI pitch (octave computed so the pitch matches even for Cb / B#) */
function vyskaZKroku(krok, alter, midi) {
  const okt = (midi - KROK_PC[krok] - alter) / 12 - 1;
  return Number.isInteger(okt) ? zapisVysky(krok, alter, okt) : zMidi(midi);
}
/** pitch class → nearest spelling with the given step (accidental −2..2), otherwise null */
function posuvka(pc, krok) {
  let a = mod(pc - KROK_PC[krok], 12);
  if (a > 6) a -= 12;
  return Math.abs(a) <= 2 ? a : null;
}

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
/** Czech note name: B → H, Bb → B, F# → Fis, Eb → Es */
function ceskyTon(krok, alter) {
  if (krok === 'B') return alter === 0 ? 'H' : alter === -1 ? 'B' : alter === 1 ? 'His' : 'H' + (alter > 0 ? 'isis' : 'eses');
  if (alter === 1) return krok + 'is';
  if (alter === 2) return krok + 'isis';
  if (alter === -1) return krok + ('EA'.includes(krok) ? 's' : 'es');
  if (alter === -2) return krok + ('EA'.includes(krok) ? 'ses' : 'eses');
  return krok;
}
const anglickyTon = (krok, alter) => krok + ({ 1: '#', 2: '##', '-1': 'b', '-2': 'bb' }[alter] || '');

/** melody (right hand) in written order: [{ t (top note), midi, pos, q, takt }] without rests */
function tonyMelodie(pisen) {
  const out = [];
  pisen.takty.forEach((t, ti) => {
    let pos = 0;
    for (const n of t.noty || []) {
      const q = zlomek(n.d) || 0;
      const vs = vysky(n.t);
      if (vs.length) {
        const h = vs.reduce((a, b) => (b.midi > a.midi ? b : a));
        out.push({ v: h, midi: h.midi, vsechny: vs, pos, q, takt: ti });
      }
      pos += q;
    }
  });
  return out;
}

/**
 * Key of the song from the key signature and the ending (last chord / note, opening chord, minor leading tone).
 * → { dur: bool, predznamenani, krok, alter, pc, tonika: 'D' | 'F#' (English), nazev: 'D dur' | 'h moll' }
 */
export function jakaTonina(pisen) {
  const f = Math.max(-7, Math.min(7, Number(pisen.predznamenani) || 0));
  const D = tonikaDur(f), M = tonikaMoll(f);
  let dur = 0, moll = 0;
  const akordy = pisen.takty.flatMap(t => (t.akordy || []).map(a => ({ a: akordZnacky(a.znacka), t: tonyAkordu(a.znacka) })))
    .filter(x => x.a && x.t);
  const hodnot = (x, vaha) => {
    if (!x) return;
    const minor = /minor|diminished/.test(x.a.druh) || x.a.druh === 'half-diminished';
    if (x.t.koren === M.pc && minor) moll += vaha;
    if (x.t.koren === D.pc && !minor) dur += vaha;
  };
  hodnot(akordy[akordy.length - 1], 3);
  hodnot(akordy[0], 2);
  const mel = tonyMelodie(pisen);
  if (mel.length) {
    const pc = mel[mel.length - 1].midi % 12;
    if (pc === M.pc) moll += 2;
    if (pc === D.pc) dur += 2;
    const p0 = mel[0].midi % 12;
    if (p0 === M.pc) moll += 0.5;
    if (p0 === D.pc) dur += 0.5;
    const citlivy = mod(M.pc + 11, 12);                 // raised 7th degree of minor (G♯ in A minor)
    if (mel.some(x => x.midi % 12 === citlivy)) moll += 1;
  }
  const leva = pisen.takty.flatMap(t => (t.leva || []).flatMap(n => vysky(n.t)));
  if (leva.length) {
    const pc = leva[leva.length - 1].midi % 12;
    if (pc === M.pc) moll += 1;
    if (pc === D.pc) dur += 1;
  }
  const jeDur = dur >= moll;
  const T = jeDur ? D : M;
  const cesky = ceskyTon(T.krok, T.alter);
  return {
    dur: jeDur, predznamenani: f, krok: T.krok, alter: T.alter, pc: T.pc, tonika: anglickyTon(T.krok, T.alter),
    nazev: jeDur ? `${cesky} dur` : `${cesky.toLowerCase()} moll`,
  };
}

// ---------------------------------------------------------------- transposition
function posunTon(t, diat, semi, cilF) {
  const v = vyska(t);
  if (!v) return t;
  const i = KROKY.indexOf(v.krok) + diat;
  const krok = KROKY[mod(i, 7)], okt = v.okt + Math.floor(i / 7);
  const midi = v.midi + semi;
  const alter = midi - (12 * (okt + 1) + KROK_PC[krok]);
  return Math.abs(alter) <= 2 ? zapisVysky(krok, alter, okt) : zMidi(midi, cilF);
}
const posunNotu = (n, diat, semi, cilF) => (n.t === 'r' ? n : { ...n, t: n.t.trim().split(/\s+/).map(x => posunTon(x, diat, semi, cilF)).join(' ') });

function posunKrok(krok, alter, diat, semi, cilF) {
  const k = KROKY[mod(KROKY.indexOf(krok) + diat, 7)];
  const pc = mod(KROK_PC[krok] + alter + semi, 12);
  const a = posuvka(pc, k);
  if (a != null && Math.abs(a) <= 1) return anglickyTon(k, a);
  const z = zMidi(60 + pc, cilF);
  return z.slice(0, -1);
}
function posunZnacku(znacka, diat, semi, cilF) {
  const a = akordZnacky(znacka);
  if (!a) return znacka;
  const bas = a.bas ? '/' + posunKrok(a.bas.krok, a.bas.alter, diat, semi, cilF) : '';
  return posunKrok(a.koren, a.alter, diat, semi, cilF) + a.text + bas;
}

/** octave shift so the notes lie as much as possible within [dole, nahore] (weighted by length) */
function nejlepsiOktava(tony, semi, dole, nahore, rozsah = 2) {
  let nej = 0, nejCena = Infinity;
  const celkem = tony.reduce((a, x) => a + (x.q || 1), 0);
  for (let k = -rozsah; k <= rozsah; k++) {
    // moving by an octave "costs" as much as a third of the song a semitone out of range – one note isn't worth a move
    const cena = 0.35 * celkem * Math.abs(k) + tony.reduce((a, x) => {
      const m = x.midi + semi + 12 * k;
      return a + (x.q || 1) * (m < dole ? dole - m : m > nahore ? m - nahore : 0);
    }, 0);
    const lepsi = cena < nejCena - EPS || (Math.abs(cena - nejCena) < EPS && Math.abs(semi + 12 * k) < Math.abs(semi + 12 * nej));
    if (lepsi) { nej = k; nejCena = cena; }
  }
  return nej;
}

/** Additional octaves the left hand can move up relative to the right without introducing a crossing. */
function odstupRukou(takty) {
  let odstup = Infinity;
  for (const t of takty) {
    const prave = znejiciMelodie(t.noty, zlomek), leve = znejiciMelodie(t.leva, zlomek);
    for (const l of leve) for (const p of prave) {
      if (l.od < p.do - EPS && p.od < l.do - EPS) odstup = Math.min(odstup, p.midi - l.midi);
    }
  }
  return Math.max(0, Math.floor(odstup / 12));
}

/**
 * Transposes the song (notes, left hand, chords, key signature). cil: 'ne' | 'C' (C major / A minor) |
 * 'snadna' (nearest of C/G/F/D major, or A/E/D minor). The melody moves by an octave into C4–C6 if needed.
 */
export function transponuj(pisen, cil = 'C') {
  const p = kopie(pisen);
  if (!cil || cil === 'ne') return p;
  const ton = jakaTonina(p);
  const kandidati = cil === 'snadna' ? (ton.dur ? [0, 1, -1, 2] : [0, 1, -1]) : [0];
  let cilF = 0, semi = 0, nejlepsi = Infinity;
  for (const f of kandidati) {
    const T = ton.dur ? tonikaDur(f) : tonikaMoll(f);
    let s = mod(T.pc - ton.pc, 12);
    if (s > 6) s -= 12;
    if (Math.abs(s) < nejlepsi) { nejlepsi = Math.abs(s); cilF = f; semi = s; }
  }
  const T = ton.dur ? tonikaDur(cilF) : tonikaMoll(cilF);
  let diat = mod(KROKY.indexOf(T.krok) - KROKY.indexOf(ton.krok), 7);   // by how many steps (C → D = 1)
  if ((semi < 0 && diat > 0) || (semi === 0 && diat > 3)) diat -= 7;

  let k = nejlepsiOktava(tonyMelodie(p), semi, 57, 86);     // C4–C6 with a tolerance of a minor third / second
  const levaTony = p.takty.flatMap(t => (t.leva || []).flatMap(n => vysky(n.t).map(v => ({ midi: v.midi, q: zlomek(n.d) }))));
  let kl = levaTony.length ? nejlepsiOktava(levaTony, semi, 36, 62, 1) : 0;
  if (levaTony.length && kl > k) {
    const odstup = odstupRukou(p.takty);
    if (kl - k > odstup) {
      kl = Math.max(-1, k + odstup);
      k = Math.max(k, kl - odstup);
    }
  }
  for (const t of p.takty) {
    t.noty = (t.noty || []).map(n => posunNotu(n, diat + 7 * k, semi + 12 * k, cilF));
    if (t.leva) t.leva = t.leva.map(n => posunNotu(n, diat + 7 * kl, semi + 12 * kl, cilF));
    t.akordy = (t.akordy || []).map(a => ({ ...a, znacka: posunZnacku(a.znacka, diat, semi, cilF) }));
  }
  p.predznamenani = cilF;
  const mel = tonyMelodie(p).map(x => x.midi).sort((a, b) => a - b);
  if (mel.length && mel[Math.floor(mel.length / 2)] >= 57) p.klic = 'houslovy';
  return p;
}

// ---------------------------------------------------------------- lengths
// writable lengths in ticks (no double dots), descending; triplets last as a fallback
const DELKY = [144, 96, 72, 48, 36, 24, 18, 12, 9, 6, 3];
const DELKY_TRIOL = [32, 16, 8, 4];
/** length in ticks → pieces writable as single notes (joined by ties); null if not possible */
export function rozdel(t) {
  if (t <= 0) return [];
  if (typNoty(t / DIV) && !(typNoty(t / DIV).tecky > 1)) return [t];
  const out = [];
  let zbyva = t;
  for (const sada of [DELKY, DELKY_TRIOL]) {
    for (const d of sada) while (zbyva >= d) { out.push(d); zbyva -= d; }
  }
  return zbyva === 0 ? out : null;
}

// ---------------------------------------------------------------- ties
/** a tie only applies to the following note of the same pitch (also across a barline) */
function opravLigatury(takty, ruka) {
  const rada = takty.flatMap(t => t[ruka] || []);
  rada.forEach((n, i) => {
    if (!n.lig) return;
    const d = rada[i + 1];
    if (n.t === 'r' || !d || d.t !== n.t) n.lig = false;
  });
}
/** within a bar merges a tied note with the following same-pitch note without a syllable, if writable as one note */
function slucLigatury(noty) {
  const out = [];
  for (const n of noty) {
    const p = out[out.length - 1];
    if (p && p.lig && p.t === n.t && n.t !== 'r' && !String(n.s || '').trim()) {
      const d = tiky(p.d) + tiky(n.d);
      const ty = typNoty(d / DIV);
      if (ty && ty.tecky <= 1 && !ty.trioly) { out[out.length - 1] = { ...p, d: naD(d), lig: !!n.lig }; continue; }
    }
    out.push({ ...n });
  }
  return out;
}

// ---------------------------------------------------------------- level 1: simplified rhythm
const horniTon = n => {
  const vs = vysky(n.t);
  if (vs.length < 2) return { ...n };
  const parts = n.t.trim().split(/\s+/);
  let nej = 0;
  vs.forEach((v, i) => { if (v.midi > vs[nej].midi) nej = i; });
  return { ...n, t: parts[nej] };
};

/** items of one beat → slot positions (null = note dropped), or null if not possible without losing a syllable */
function prirad(polozky, sloty, noty, posun, U) {
  const k = polozky.length, S = sloty.length;
  if (!S) return null;
  const cenaZahozeni = polozky.map((x, idx) => {
    if (x.i === 0) return Infinity;                              // the bar's first note stays
    if (String(x.n.s || '').trim()) return Infinity;             // a syllable must not be lost
    const pred = noty[x.i - 1];
    const q = tiky(x.n.d) / DIV;
    let c = x.n.t === 'r' ? 0.5 + q : (pred && pred.lig && pred.t === x.n.t ? 0.1 : 1 + 2 * q);
    if ((posun + x.on) % U === 0) c += 2;                          // note on the beat
    return c + idx * 1e-3;
  });
  // dp[i][j] = lowest cost after i items, j = first free slot
  const dp = Array.from({ length: k + 1 }, () => new Array(S + 1).fill(Infinity));
  const volba = Array.from({ length: k + 1 }, () => new Array(S + 1).fill(null));
  dp[0][0] = 0;
  for (let i = 0; i < k; i++) {
    for (let j = 0; j <= S; j++) {
      if (dp[i][j] === Infinity) continue;
      const z = dp[i][j] + cenaZahozeni[i];
      if (z < dp[i + 1][j] - EPS) { dp[i + 1][j] = z; volba[i + 1][j] = { j, slot: -1 }; }
      for (let jj = j; jj < S; jj++) {
        const c = dp[i][j] + 4 * Math.abs(polozky[i].on - sloty[jj]) / DIV;
        if (c < dp[i + 1][jj + 1] - EPS) { dp[i + 1][jj + 1] = c; volba[i + 1][jj + 1] = { j, slot: jj }; }
      }
    }
  }
  let jNej = -1;
  for (let j = 0; j <= S; j++) if (dp[k][j] < Infinity && (jNej < 0 || dp[k][j] < dp[k][jNej] - EPS)) jNej = j;
  if (jNej < 0) return null;
  const out = new Array(k);
  for (let i = k, j = jNej; i > 0; i--) {
    const v = volba[i][j];
    out[i - 1] = v.slot >= 0 ? sloty[v.slot] : null;
    j = v.j;
  }
  return out;
}

/**
 * Bar rhythm onto an eighth-note grid: splits each beat into eighth positions and assigns notes (and rests) to them
 * by dynamic programming (smallest shift, only notes without a syllable are dropped). Returns null if not possible.
 */
function kvantizujTakt(noty, delkaTiky, posun, doba) {
  const OSMINA = DIV / 2, U = Math.round(doba * DIV);
  const pol = [];
  let pos = 0;
  noty.forEach((n, i) => { pol.push({ n, on: pos, i }); pos += tiky(n.d); });
  if (pos !== delkaTiky) return null;
  const skupiny = new Map();
  for (const x of pol) {
    const b = Math.floor((posun + x.on) / U);
    if (!skupiny.has(b)) skupiny.set(b, []);
    skupiny.get(b).push(x);
  }
  const ponechane = [];                                        // [{ x, on }]
  for (const [b, polozky] of skupiny) {
    const zacatek = b * U - posun;
    const sloty = krok => {
      const out = [];
      for (let j = 0; j * krok < U; j++) if (zacatek + j * krok >= 0 && zacatek + j * krok < delkaTiky) out.push(zacatek + j * krok);
      return out;
    };
    const posledni = polozky[polozky.length - 1];
    const samostatna = polozky[0].on === zacatek && posledni.on + tiky(posledni.n.d) <= zacatek + U;
    // 1) eighths; 2) a standalone beat (e.g. a triplet with three syllables) stays as is; 3) sixteenths
    const pozice = prirad(polozky, sloty(OSMINA), noty, posun, U)
      || (samostatna ? polozky.map(x => x.on) : null)
      || prirad(polozky, sloty(OSMINA / 2), noty, posun, U);
    if (!pozice) return null;
    polozky.forEach((x, i) => ponechane.push({ x, on: pozice[i] }));
  }
  // assembly: a dropped note lengthens the previous kept one
  const vysledek = [];
  let akt = null;
  for (const p of ponechane) {
    if (p.on == null) {
      if (akt && p.x.n.t === akt.n.t) akt.n.lig = !!p.x.n.lig;
      continue;
    }
    akt = { n: { ...p.x.n }, on: p.on };
    vysledek.push(akt);
  }
  if (!vysledek.length || vysledek[0].on !== 0) return null;
  const out = [];
  vysledek.forEach((v, i) => {
    const konec = i + 1 < vysledek.length ? vysledek[i + 1].on : delkaTiky;
    const kusy = rozdel(konec - v.on);
    if (!kusy || !kusy.length) throw new Error('kvantizace');
    kusy.forEach((d, k) => {
      const posledni = k === kusy.length - 1;
      const n = { ...v.n, d: naD(d) };
      if (k > 0) { n.s = ''; delete n.prst; }
      if (n.t !== 'r') n.lig = posledni ? !!v.n.lig : true;
      else n.lig = false;
      out.push(n);
    });
  });
  return out;
}

function zjednodusRytmus(p) {
  const met = metrum(p.takt);
  p.takty.forEach((t, ti) => {
    const noty = slucLigatury((t.noty || []).map(horniTon));
    const L = noty.reduce((a, n) => a + tiky(n.d), 0);
    const plna = Math.round(met.delka * DIV);
    const posun = ti === 0 && L < plna ? plna - L : 0;
    let nove = null;
    try { nove = L > 0 ? kvantizujTakt(noty, L, posun, met.doba) : null; } catch { nove = null; }
    if (nove && nove.some(n => !typNoty(zlomek(n.d)))) nove = null;
    t.noty = nove ? slucLigatury(nove) : noty;
  });
  opravLigatury(p.takty, 'noty');
}

// ---------------------------------------------------------------- harmonization
// degrees: [offset from the tonic in semitones, steps from the tonic, minor?]
const STUPNE_DUR = { I: [0, 0, false], IV: [5, 3, false], V: [7, 4, false], vi: [9, 5, true], ii: [2, 1, true] };
const STUPNE_MOLL = { i: [0, 0, true], iv: [5, 3, true], V: [7, 4, false], VI: [8, 5, false], III: [3, 2, false] };
const PRIOR = { I: 0.15, i: 0.15, V: 0.1, IV: 0.08, iv: 0.08, vi: 0, VI: 0, ii: -0.05, III: -0.05 };

/**
 * Simple per-bar harmonization from the melody (I/IV/V, vi, ii; in minor i/iv/V/VI/III). Returns an array of
 * symbols (one per bar, null = bar without notes → the previous chord holds).
 */
export function harmonizuj(pisen) {
  const ton = jakaTonina(pisen);
  const met = metrum(pisen.takt);
  const stupne = ton.dur ? STUPNE_DUR : STUPNE_MOLL;
  const akordy = Object.entries(stupne).map(([jm, [pul, kr, moll]]) => {
    const krok = KROKY[(KROKY.indexOf(ton.krok) + kr) % 7];
    const pc = mod(ton.pc + pul, 12);
    const alter = posuvka(pc, krok) ?? 0;
    const znacka = anglickyTon(krok, alter) + (moll ? 'm' : '');
    return { jm, znacka, tony: tonyAkordu(znacka).tony };
  });
  const sNotami = pisen.takty.map((t, i) => ((t.noty || []).some(n => n.t !== 'r') ? i : -1)).filter(i => i >= 0);
  const prvni = sNotami[0], posledni = sNotami[sNotami.length - 1], predposledni = sNotami[sNotami.length - 2];
  const out = [];
  let pred = null;
  pisen.takty.forEach((t, ti) => {
    const noty = t.noty || [];
    if (!noty.some(n => n.t !== 'r')) { out.push(null); return; }
    const L = soucetTaktu(noty) || met.delka;
    const posun = ti === 0 && L < met.delka - EPS ? met.delka - L : 0;
    let nej = null, nejSkore = -Infinity;
    for (const a of akordy) {
      let skore = (PRIOR[a.jm] || 0) * met.delka;
      let pos = 0;
      for (const n of noty) {
        const q = zlomek(n.d) || 0;
        const m = posun + pos;
        const w = q * (Math.abs(m) < EPS ? 2 : Math.abs(m / met.doba - Math.round(m / met.doba)) < EPS ? 1.3 : 0.8);
        for (const v of vysky(n.t)) skore += a.tony.includes(v.midi % 12) ? w : -0.6 * w;
        pos += q;
      }
      const tonika = a.jm === 'I' || a.jm === 'i';
      if (ti === prvni && tonika) skore += 0.3 * met.delka;
      if (ti === posledni && tonika) skore += 0.5 * met.delka;
      if (ti === predposledni && a.jm === 'V') skore += 0.15 * met.delka;
      if (pred && a.znacka === pred) skore += 0.05 * met.delka;
      if (skore > nejSkore + EPS) { nejSkore = skore; nej = a.znacka; }
    }
    out.push(nej);
    pred = nej;
  });
  return out;
}

/** writes the harmonization into the chords (only changes and starts of sections a repeat jumps to) */
function doplnAkordy(p) {
  const h = harmonizuj(p);
  let pred = null;
  p.takty.forEach((t, i) => {
    const z = t.znacky || {};
    const skok = z.zacatekRepetice || (z.volta && z.volta.length) || z.segno || z.coda;
    if (h[i] && (h[i] !== pred || skok || i === 0)) t.akordy = [{ doba: 0, znacka: h[i] }];
    else t.akordy = [];
    if (h[i]) pred = h[i];
  });
}

// ---------------------------------------------------------------- left hand
/** chords in effect in each bar: [{ pos (ticks), znacka }] – at the start of the bar possibly a carried-over chord */
function akordyPoTaktech(p) {
  let posledni = null;
  return p.takty.map(t => {
    const L = Math.round(soucetTaktu(t.noty) * DIV);
    const vlastni = (t.akordy || [])
      .map(a => ({ pos: Math.round((Number(a.doba) || 0) * DIV / 6) * 6, znacka: a.znacka }))   // to sixteenths
      .filter(a => tonyAkordu(a.znacka) && a.pos < Math.max(L, 1))
      .sort((a, b) => a.pos - b.pos);
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

/** chord notes with spelling: { bas: {krok, alter, pc}, tony: [{krok, alter, pc, interval}], kvinta } */
function rozepisAkord(znacka) {
  const a = akordZnacky(znacka), ta = tonyAkordu(znacka);
  if (!a || !ta) return null;
  const KR = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 4, 9: 5, 10: 6, 11: 6, 14: 1 };
  const ki = KROKY.indexOf(a.koren);
  const tony = (DRUHY[a.druh] || [0, 4, 7]).map(iv => {
    const krok = KROKY[(ki + (KR[iv] ?? 0)) % 7];
    const pc = mod(ta.koren + iv, 12);
    const alter = posuvka(pc, krok);
    return alter == null ? { ...rozepisPc(pc), interval: iv } : { krok, alter, pc, interval: iv };
  });
  const bas = a.bas ? { krok: a.bas.krok, alter: a.bas.alter, pc: ta.bas } : { krok: tony[0].krok, alter: tony[0].alter, pc: ta.koren };
  return { bas, tony, kvinta: tony.find(x => x.interval === 7 || x.interval === 6 || x.interval === 8) || tony[0] };
}
function rozepisPc(pc) {
  const z = zMidi(60 + pc);
  const v = vyska(z);
  return { krok: v.krok, alter: v.alter, pc };
}
/** note into the range [dole, dole + 11] */
const doRozsahu = (ton, dole) => vyskaZKroku(ton.krok, ton.alter, dole + mod(ton.pc - dole, 12));

const BAS_DOLE = 40;          // E2 … D#3
const SOUZVUK_DOLE = 43;      // G2 … F#3
/** the melody's lowest pitch (every note of a chord counts); Infinity without notes */
export const nejnizsiMelodie = p => Math.min(...p.takty.flatMap(t => (t.noty || []).flatMap(n => vysky(n.t).map(v => v.midi))));
/** octaves the generated left hand goes down: a melody below G3 (in the bass clef) would cross the usual position;
 *  null = the melody is too low for a left hand below it (below E2) */
export function oktavyLeve(p) {
  const m = nejnizsiMelodie(p);
  return m >= 55 ? 0 : m >= 40 ? 1 : null;
}

/** accompaniment pattern by metre: [{ pos, delka (ticks), druh: 'bas' | 'kvinta' | 'souzvuk' }] across the whole bar */
function vzorDoprovodu(takt) {
  const m = metrum(takt);
  const slozeny = m.beatType === 8 && m.beats % 3 === 0 && m.beats > 3;
  const pocet = slozeny ? m.beats / 3 : m.beats;
  const delka = Math.round((slozeny ? 1.5 : 4 / m.beatType) * DIV);
  const druhy = pocet === 1 ? ['bas'] : pocet === 2 ? ['bas', 'souzvuk'] : pocet === 3 ? ['bas', 'souzvuk', 'souzvuk']
    : pocet === 4 ? ['bas', 'souzvuk', 'kvinta', 'souzvuk'] : ['bas', ...new Array(pocet - 1).fill('souzvuk')];
  return druhy.map((druh, i) => ({ pos: i * delka, delka, druh }));
}

/** the bar's melody as intervals [od, do) with MIDI pitches */
function znejiciMelodie(noty, delka = d => zlomek(d) * DIV) {
  const out = [];
  let pos = 0;
  for (const n of noty || []) {
    const d = delka(n.d) || 0;
    for (const v of vysky(n.t)) out.push({ od: pos, do: pos + d, midi: v.midi });
    pos += d;
  }
  return out;
}

/** chord voicing in the G2–F#3 position with no semitone clash with the melody and no crossing it */
function souzvuk(rozpis, melodie, od, doo, dolu = 0) {
  let tony = rozpis.tony.filter(x => x.interval < 12);
  if (tony.length > 3) tony = tony.filter(x => x.interval !== 7);
  const znejici = melodie.filter(x => x.od < doo && x.do > od).map(x => x.midi);
  const spatne = m => znejici.some(x => Math.abs(x - m) === 1 || m > x);
  const out = [];
  for (const ton of tony) {
    let s = doRozsahu(ton, SOUZVUK_DOLE - dolu);
    let m = vyska(s).midi;
    if (spatne(m)) { s = doRozsahu(ton, SOUZVUK_DOLE - dolu - 12); m = vyska(s).midi; }
    if (!spatne(m) && m >= 36 - dolu) out.push({ s, m });
  }
  out.sort((a, b) => a.m - b.m);
  return [...new Set(out.map(x => x.s))].join(' ');
}

/** builds one bar of the left hand from events [{ od, do, t }] (t = pitch/chord or 'r') */
function sestavLevou(udalosti) {
  const out = [];
  for (const u of udalosti) {
    const kusy = rozdel(u.do - u.od);
    if (!kusy) return null;
    kusy.forEach((d, k) => out.push({ t: u.t, d: naD(d), lig: u.t !== 'r' && k < kusy.length - 1, s: '' }));
  }
  return out;
}

/** druh: 'bas' one long bass note, 'akord' one whole chord held, 'doprovod' the pattern of vzorDoprovodu; split by chord changes */
function levaRuka(p, druh) {
  const doprovod = druh === 'doprovod';
  const met = metrum(p.takt);
  const plna = Math.round(met.delka * DIV);
  const akordy = akordyPoTaktech(p);
  const dolu = 12 * (oktavyLeve(p) ?? 1);
  p.takty.forEach((t, ti) => {
    const noty = t.noty || [];
    const delka = soucetTaktu(noty) * DIV, L = Math.round(delka);
    if (!L) { delete t.leva; return; }
    const seznam = akordy[ti];
    const zmeny = seznam.map(a => a.pos).filter(x => x > 0 && x < L);
    // sections: accompaniment pattern (level 4) or one long note (level 3), split by chord changes
    let useky;
    if (doprovod) {
      const posun = ti === 0 && L < plna ? plna - L : 0;
      useky = vzorDoprovodu(p.takt)
        .map(u => ({ od: Math.max(0, u.pos - posun), do: Math.min(L, u.pos + u.delka - posun), druh: u.druh }))
        .filter(u => u.do > u.od);
    } else useky = [{ od: 0, do: L, druh: druh === 'akord' ? 'akord' : 'bas' }];
    for (const z of zmeny) {
      const i = useky.findIndex(u => u.od < z && u.do > z);
      const novy = druh === 'akord' ? 'akord' : 'bas';      // a new chord starts with its bass (its whole chord on level 4)
      if (i >= 0) useky.splice(i, 1, { ...useky[i], do: z }, { od: z, do: useky[i].do, druh: novy });
      else {
        const j = useky.findIndex(u => u.od === z);
        if (j >= 0) useky[j] = { ...useky[j], druh: novy };
      }
    }
    const mel = znejiciMelodie(noty);
    let predBas = null;
    const udalosti = useky.map(u => {
      const znacka = akordV(seznam, u.od);
      const r = znacka ? rozepisAkord(znacka) : null;
      if (!r) return { ...u, t: 'r' };
      if (u.druh === 'souzvuk' || u.druh === 'akord') {
        const s = souzvuk(r, mel, u.od, u.do, dolu);
        return { ...u, t: s || doRozsahu(r.bas, BAS_DOLE - dolu) };
      }
      // fifth only as an alternating bass within the same chord, otherwise the root
      const ton = u.druh === 'kvinta' && predBas === znacka && !akordZnacky(znacka).bas ? r.kvinta : r.bas;
      predBas = znacka;
      return { ...u, t: doRozsahu(ton, BAS_DOLE - dolu) };
    });
    let leva = Math.abs(delka - L) < EPS ? sestavLevou(udalosti) : null;
    if (!leva) leva = noty.map(n => ({ t: 'r', d: n.d, lig: false, s: '' }));   // fallback: rests in the melody's rhythm
    t.leva = leva;
  });
}

// ---------------------------------------------------------------- fingering
// right-hand finger pair spans in semitones (Parncutt et al. 1997):
// [minPrakt, minPohodl, minUvoln, maxUvoln, maxPohodl, maxPrakt]; d = pitch of higher finger − pitch of lower finger
const ROZPETI = {
  12: [-5, -3, 1, 5, 8, 10], 13: [-4, -2, 3, 7, 10, 12], 14: [-3, -1, 5, 9, 12, 14], 15: [-1, 1, 7, 10, 13, 15],
  23: [1, 1, 1, 2, 3, 5], 24: [1, 1, 3, 4, 5, 7], 25: [2, 2, 5, 6, 8, 10],
  34: [1, 1, 1, 2, 2, 4], 35: [1, 1, 3, 4, 5, 7], 45: [1, 1, 1, 2, 3, 5],
};
const ROZPETI_DITE = Object.fromEntries(Object.entries(ROZPETI).map(([par, delky]) =>
  [par, delky.map(d => Math.round(d * 0.6))]));
const KRIZENI = { 2: 2.5, 3: 1, 4: 1.5, 5: 6 };            // thumb under / crossing over the thumb
const CERNE = new Set([1, 3, 6, 8, 10]);
const NEMOZNE = 100;

/** is the finger pair span playable? (for tests and checks) */
export function hratelnePrstoklad(f1, m1, f2, m2, vek) {
  if (f1 === f2 || Math.abs(m2 - m1) > 12) return true;
  const lo = Math.min(f1, f2), hi = Math.max(f1, f2);
  const d = f1 < f2 ? m2 - m1 : m1 - m2;
  const [minP, , , , , maxP] = (vek === 'dite' ? ROZPETI_DITE : ROZPETI)[lo * 10 + hi];
  return d >= minP && d <= maxP;
}

function cenaPrechodu(f1, a, f2, b, rozpeti) {
  const i = b.midi - a.midi;
  if (i === 0) return f1 === f2 ? 0 : 2;                      // repeated note with the same finger
  if (f1 === f2) return 6;                                     // same finger on a different note = hand shift
  if (Math.abs(i) > 12) return 3 + (f2 === 1 || f2 === 5 ? 0 : 0.5);   // leap: the hand moves
  const lo = Math.min(f1, f2), hi = Math.max(f1, f2);
  const d = f1 < f2 ? i : -i;
  const [minP, minC, minR, maxR, maxC, maxP] = rozpeti[lo * 10 + hi];
  if (d < minP || d > maxP) return NEMOZNE;
  if (d < 0) return KRIZENI[hi] + Math.max(0, -d - 2);         // crossing over the thumb (only the thumb can)
  let c = 0;
  if (d < minC) c += 2 * (minC - d);
  if (d > maxC) c += 2 * (d - maxC);
  if (d < minR) c += minR - d;
  if (d > maxR) c += d - maxR;
  // five-finger position: the finger difference matches the number of steps
  c += 0.5 * Math.abs((f2 - f1) - (b.stupen - a.stupen));
  return c;
}
function cenaTonu(f, x) {
  if (!CERNE.has(x.midi % 12)) return 0;
  return f === 1 ? 2 : f === 5 ? 1 : 0;
}

/**
 * Fingering of a single-voice right-hand melody (dynamic programming over the cost of finger transitions).
 * noty: array of Notes ({t, d}), pitches ('E4') or MIDI numbers. Returns an array of the same length: 1–5, null for rests.
 * For a chord it uses the top note. Deterministic.
 */
export function prstoklad(noty, vek) {
  const rozpeti = vek === 'dite' ? ROZPETI_DITE : ROZPETI;
  const body = [];
  let pauza = 0;
  (noty || []).forEach((n, idx) => {
    let v = null;
    if (typeof n === 'number') v = vyska(zMidi(n));
    else {
      const t = typeof n === 'string' ? n : n && n.t;
      const vs = t && t !== 'r' ? vysky(t) : [];
      if (vs.length) v = vs.reduce((a, b) => (b.midi > a.midi ? b : a));
    }
    if (!v) { pauza += (n && typeof n === 'object' ? zlomek(n.d) : 0) || 0; return; }
    body.push({ idx, midi: v.midi, stupen: KROKY.indexOf(v.krok) + 7 * v.okt, pauza });
    pauza = 0;
  });
  const out = new Array((noty || []).length).fill(null);
  if (!body.length) return out;
  const N = body.length;
  const cena = Array.from({ length: N }, () => new Array(6).fill(Infinity));
  const zpet = Array.from({ length: N }, () => new Array(6).fill(0));
  for (let f = 1; f <= 5; f++) cena[0][f] = cenaTonu(f, body[0]);
  for (let k = 1; k < N; k++) {
    const a = body[k - 1], b = body[k];
    const volno = b.pauza >= 1 - EPS;                            // after a rest of at least a quarter the hand has time to move
    for (let f2 = 1; f2 <= 5; f2++) {
      for (let f1 = 1; f1 <= 5; f1++) {
        let c = cenaPrechodu(f1, a, f2, b, rozpeti);
        if (volno) c = Math.min(c, 4) * 0.5;
        const celk = cena[k - 1][f1] + c + cenaTonu(f2, b);
        if (celk < cena[k][f2] - EPS) { cena[k][f2] = celk; zpet[k][f2] = f1; }
      }
    }
  }
  let f = 1;
  for (let g = 2; g <= 5; g++) if (cena[N - 1][g] < cena[N - 1][f] - EPS) f = g;
  for (let k = N - 1; k >= 0; k--) {
    out[body[k].idx] = f;
    f = zpet[k][f];
  }
  return out;
}

/** fills in fingers for right-hand notes (only where missing; not for chords or tie continuations) */
function doplnPrstoklad(p, vek) {
  const rada = p.takty.flatMap(t => t.noty || []);
  const prsty = prstoklad(rada, vek);
  rada.forEach((n, i) => {
    const predchozi = rada[i - 1];
    const pokracovani = predchozi && predchozi.lig && predchozi.t === n.t;
    if (prsty[i] && !n.prst && !pokracovani && vysky(n.t).length === 1) n.prst = prsty[i];
  });
}

// ---------------------------------------------------------------- levels
const maMelodii = p => p.takty.some(t => (t.noty || []).some(n => n.t !== 'r'));
const maLevou = p => p.takty.some(t => (t.leva || []).some(n => n.t !== 'r'));
const maAkordy = p => p.takty.some(t => (t.akordy || []).some(a => tonyAkordu(a.znacka)));
/** does the score have its own left hand? Then level 5 is the original; otherwise the melody with a broken accompaniment */
export const maVlastniLevou = maLevou;
/** the level whose left hand a backing style (Before playing: Left-hand pattern) replaces */
export const urovenStylu = pisen => (maLevou(pisen) ? 4 : 5);

function popisDoprovodu(takt) {
  const m = metrum(takt);
  if (m.beats === 3) return t('cviceni.doprovod.valcik');
  if (m.beatType === 8 && m.beats % 3 === 0) return t('cviceni.doprovod.kolebavy');
  if (m.beats === 4) return t('cviceni.doprovod.ctyri');
  return t('cviceni.doprovod.zaklad');
}

/** ladder of levels for the given song: [{ id, nazev, popis, dostupna }] (texts in the app language) */
export function seznamUrovni(pisen) {
  const mel = maMelodii(pisen), akordy = maAkordy(pisen);
  const levaPod = mel && oktavyLeve(pisen) != null;              // a melody too low has no left hand under it
  const sAkordy = popis => (akordy ? popis : popis + ' ' + t('cviceni.uroven.doplnimeAkordy'));
  const u = (id, popis, dostupna) => ({ id, nazev: t(`cviceni.uroven.${id}.nazev`), popis, dostupna });
  return [
    u(1, t('cviceni.uroven.1.popis'), mel),
    u(2, t('cviceni.uroven.2.popis'), mel),
    u(3, sAkordy(t('cviceni.uroven.3.popis')), levaPod),
    u(4, sAkordy(t('cviceni.uroven.4.popis')), levaPod),
    maLevou(pisen) ? u(5, t('cviceni.uroven.5.popisObe'), true)
      : { id: 5, nazev: t('cviceni.uroven.5.doprovod.nazev'), popis: sAkordy(t('cviceni.uroven.5.doprovod.popis', { doprovod: popisDoprovodu(pisen.takt) })), dostupna: levaPod },
  ];
}

/**
 * Song level as a new model. volby: { transpozice: 'ne' | 'C' | 'snadna', prstoklad: bool, vek }.
 * Bars stay 1:1 with the original (same count, same repeat marks), only their content changes.
 * An unavailable level 5 returns the song unchanged (without a left hand).
 */
export function vytvorUroven(pisen, id, volby = {}) {
  return sestavUroven(pisen, id, volby, false).pisen;
}

/** Playback version: accompaniment follows the chords in the played order. */
export function vytvorHranouUroven(pisen, id, volby = {}) {
  return sestavUroven(pisen, id, volby, true);
}

function sestavUroven(pisen, id, volby, hrana) {
  const p = transponuj(pisen, volby.transpozice || 'ne');
  const u = Number(id);
  // the left hand made from the chords: 3 one long bass note, 4 a whole chord held, 5 (a song without its own left
  // hand) a broken accompaniment in the song's rhythm; level 5 of a song with its own left hand is the original
  const leva = { 3: 'bas', 4: 'akord', 5: maLevou(pisen) ? null : 'doprovod' }[u] || null;
  if (u <= 4 || leva) for (const t of p.takty) delete t.leva;
  if (u === 1) zjednodusRytmus(p);
  if (leva && !maAkordy(p)) doplnAkordy(p);
  if (volby.prstoklad) doplnPrstoklad(p, volby.vek);
  const r = hrana ? rozvin(p) : { pisen: p };
  if (leva) levaRuka(r.pisen, leva);
  return r;
}
