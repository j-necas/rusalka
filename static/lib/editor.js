// Score editor: pure operations on the "Pisen" model (see the header of song.js) for fixes after importing from a
// PDF/photo and for editing any song. No DOM or state – the UI just calls the functions and stores the result.
//
// SELECTION: vyber = { takt, index, ruka: 'p' | 'l' } – index of the note in the bar's `noty` (right hand) or `leva`
// (left hand). RESULT: every operation returns { pisen, vyber } (new model, new selection); on error also `chyba`
// (a Czech sentence for the user), and `pisen` is then the SAME object as the input (so the UI can tell nothing
// changed; zapis() skips it). The input is never mutated. Operations on a bar/header (without a selection) take an
// optional last argument `vyber` and return it (shifted if needed) so the UI doesn't lose the selection.
//
// Ties: changing the pitch of a tied note changes the whole chain of tied notes (like MuseScore); ties that after
// the edit lead into a rest or into a note of a different pitch are removed around the edit.

import {
  zlomek, naZlomek, typNoty, metrum, soucetTaktu, vyska, vysky, diatonickyKrok, alterVTonine, kontrola,
  akordZnacky, kopie,
} from './song.js';
import { t as tx } from './texts.js';
import { kontrolaPolozky } from './song.js';
import { popisKontroly } from './practice.js';

const EPS = 1e-6;
const KROK_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const ROZSAH = { min: 21, max: 108 };             // piano A0–C8
export const MAX_HISTORIE = 200;                         // undo steps

// ---------------------------------------------------------------- helpers
const pole = (takt, ruka) => (ruka === 'l' ? takt.leva : takt.noty);
const mod12 = x => ((x % 12) + 12) % 12;
const jePomlka = n => !n || String(n.t).trim() === 'r';
const midiNoty = n => vysky(n.t).map(v => v.midi);
const vysledek = (pisen, vyber, chyba) => (chyba ? { pisen, vyber, chyba } : { pisen, vyber });
const novaNota = (t, q) => ({ t, d: naZlomek(q), lig: false, s: '' });

/** note under the selection, or null (invalid selection) */
export function vybranaNota(pisen, vyber) {
  if (!vyber || !pisen?.takty) return null;
  const t = pisen.takty[vyber.takt];
  if (!t) return null;
  return (pole(t, vyber.ruka) || [])[vyber.index] ?? null;
}

/** neighbouring position in the same hand (smer +1/−1), across bar boundaries, skipping empty bars; otherwise null */
function sousedni(pisen, v, smer) {
  const r = v.ruka === 'l' ? 'l' : 'p';
  let ti = v.takt, i = v.index + smer;
  while (ti >= 0 && ti < pisen.takty.length) {
    const a = pole(pisen.takty[ti], r) || [];
    if (i >= 0 && i < a.length) return { takt: ti, index: i, ruka: r };
    ti += smer;
    if (ti < 0 || ti >= pisen.takty.length) break;
    i = smer > 0 ? 0 : (pole(pisen.takty[ti], r) || []).length - 1;
  }
  return null;
}

/**
 * MIDI → pitch spelled by key signature: a scale note gets the key's spelling (in G♭ major even C♭), other notes the
 * simplest spelling (natural first, then an accidental in the direction `smer`, without it by key signature;
 * C major = sharps).
 */
export function pravopis(midi, predznamenani = 0, smer = 0) {
  const pc = mod12(midi);
  const pref = Math.sign(smer) || Math.sign(predznamenani) || 1;
  let nej = null;
  for (const krok of 'CDEFGAB') {
    for (const alter of [-1, 0, 1]) {
      if (mod12(KROK_PC[krok] + alter) !== pc) continue;
      const skore = alter === alterVTonine(krok, predznamenani) ? -1
        : 10 * Math.abs(alter) + (alter && Math.sign(alter) !== pref ? 5 : 0);
      if (!nej || skore < nej.skore) nej = { krok, alter, skore };
    }
  }
  const okt = (midi - KROK_PC[nej.krok] - nej.alter) / 12 - 1;
  return nej.krok + (nej.alter === 1 ? '#' : nej.alter === -1 ? 'b' : '') + okt;
}

/** length (in quarter beats) → lengths writable as single notes that add up to q (no triplets first); otherwise null */
export function rozloz(q) {
  const bezTriol = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25, 0.1875, 0.125];
  const sTriolami = [...bezTriol, 8 / 3, 4 / 3, 2 / 3, 1 / 3, 1 / 6, 1 / 12].sort((a, b) => b - a);
  for (const sada of [bezTriol, sTriolami]) {
    const out = [];
    let zbyva = q;
    for (const x of sada) {
      while (zbyva >= x - EPS) { out.push(x); zbyva -= x; }
    }
    if (zbyva < EPS && out.length) return out;
  }
  return null;
}

/** takes length `kolik` away from the following notes (rests first, then notes from the nearest); returns a new array or null */
function uber(za, kolik) {
  if (kolik < EPS) return za;
  const delky = za.map(n => zlomek(n.d) || 0);
  if (delky.reduce((a, b) => a + b, 0) < kolik - EPS) return null;
  let zbyva = kolik;
  for (const pomlky of [true, false]) {
    za.forEach((n, i) => {
      if (zbyva < EPS || jePomlka(n) !== pomlky) return;
      const vzit = Math.min(delky[i], zbyva);
      delky[i] -= vzit; zbyva -= vzit;
    });
  }
  const out = [];
  for (let i = 0; i < za.length; i++) {
    const n = za[i], q0 = zlomek(n.d) || 0;
    if (delky[i] < EPS) continue;
    if (Math.abs(delky[i] - q0) < EPS) { out.push(n); continue; }
    const casti = rozloz(delky[i]);
    if (!casti) return null;
    casti.forEach((q, k) => {
      const m = { ...n, d: naZlomek(q) };
      if (!jePomlka(n)) {
        m.lig = k < casti.length - 1 ? true : n.lig;      // the rest of the note as tied notes
        if (k > 0) { m.s = ''; delete m.prst; }
      }
      out.push(m);
    });
  }
  return out;
}

/** removes ties in bars od..do that lead into a rest or into a note with no common pitch */
function opravLigatury(p, ruka, od, doo) {
  for (let ti = Math.max(0, od); ti <= Math.min(p.takty.length - 1, doo); ti++) {
    (pole(p.takty[ti], ruka) || []).forEach((n, i) => {
      if (!n.lig) return;
      if (jePomlka(n)) { n.lig = false; return; }
      const s = sousedni(p, { takt: ti, index: i, ruka }, 1);
      if (!s) return;                                      // a tie at the end of the piece is fine
      const dalsi = vybranaNota(p, s), m = midiNoty(dalsi);
      if (jePomlka(dalsi) || !midiNoty(n).some(x => m.includes(x))) n.lig = false;
    });
  }
}

/** positions of notes tied to the selected note (same pitches), including it, in order */
function retez(pisen, v) {
  const klic = n => midiNoty(n).sort((a, b) => a - b).join(',');
  const k = klic(vybranaNota(pisen, v));
  const out = [v];
  for (let cur = v; ;) {
    const pr = sousedni(pisen, cur, -1);
    const np = pr && vybranaNota(pisen, pr);
    if (!np || !np.lig || jePomlka(np) || klic(np) !== k) break;
    out.unshift(pr); cur = pr;
  }
  for (let cur = v; ;) {
    if (!vybranaNota(pisen, cur).lig) break;
    const nx = sousedni(pisen, cur, 1);
    const nn = nx && vybranaNota(pisen, nx);
    if (!nn || jePomlka(nn) || klic(nn) !== k) break;
    out.push(nx); cur = nx;
  }
  return out;
}

function mimoRozsah(t) {
  return vysky(t).some(v => v.midi < ROZSAH.min || v.midi > ROZSAH.max);
}

/** shared core of pitch changes: fn(note) → new t; changes the whole tie chain */
function zmenVysku(pisen, vyber, fn, { pomlky = false } = {}) {
  const n = vybranaNota(pisen, vyber);
  if (!n) return vysledek(pisen, vyber, tx('editor.chyba.zadnaNota'));
  if (jePomlka(n) && !pomlky) return vysledek(pisen, vyber, tx('editor.chyba.pomlkaVyska'));
  const nove = fn(n);
  if (!nove || !vysky(nove).length) return vysledek(pisen, vyber, tx('editor.chyba.neplatnaVyska'));
  if (mimoRozsah(nove)) return vysledek(pisen, vyber, tx('editor.chyba.mimoRozsah'));
  const p = kopie(pisen);
  const pozice = jePomlka(n) ? [vyber] : retez(pisen, vyber);
  for (const poz of pozice) vybranaNota(p, poz).t = nove;
  opravLigatury(p, vyber.ruka, pozice[0].takt - 1, pozice[pozice.length - 1].takt + 1);
  return vysledek(p, vyber);
}

// ---------------------------------------------------------------- movement
/** first note/rest of the given hand in the song ({ pisen, vyber }; vyber = null when the hand has no notes) */
export function prvni(pisen, ruka = 'p') {
  const v = sousedni(pisen, { takt: 0, index: -1, ruka }, 1);
  return vysledek(pisen, v);
}
/** next note in the same hand (across bars); at the end the selection stays */
export function dalsi(pisen, vyber) {
  if (!vybranaNota(pisen, vyber)) return prvni(pisen, vyber?.ruka || 'p');
  return vysledek(pisen, sousedni(pisen, vyber, 1) || vyber);
}
/** previous note in the same hand (across bars); at the start the selection stays */
export function predchozi(pisen, vyber) {
  if (!vybranaNota(pisen, vyber)) return prvni(pisen, vyber?.ruka || 'p');
  return vysledek(pisen, sousedni(pisen, vyber, -1) || vyber);
}

// ---------------------------------------------------------------- pitch
/**
 * Step shift (smer +1/−1): diatonic in the song's key, with { chromaticky: true } by a semitone (spelled by key,
 * outside the scale a sharp going up / a flat going down). A chord moves as a whole.
 */
export function posunVysku(pisen, vyber, smer, { chromaticky = false } = {}) {
  const pz = Number(pisen.predznamenani) || 0;
  return zmenVysku(pisen, vyber, n => String(n.t).trim().split(/\s+/).map(t => {
    const v = vyska(t);
    if (!v) return null;
    return chromaticky ? pravopis(v.midi + Math.sign(smer), pz, smer) : diatonickyKrok(t, Math.sign(smer), pz);
  }).join(' '));
}

/** octave shift (smer +1/−1), spelling stays; the whole chord */
export function posunOktavu(pisen, vyber, smer) {
  return zmenVysku(pisen, vyber, n => String(n.t).trim().split(/\s+/)
    .map(t => (vyska(t) ? t.replace(/-?\d$/, o => String(Number(o) + Math.sign(smer))) : null)).join(' '));
}

/**
 * Sets the pitch from MIDI (a played note): keeps the length, syllable and tie, spelled by key.
 * midi = number: replaces a single note; in a CHORD replaces only the HIGHEST note (the melody); turns a rest into a note.
 * midi = array of numbers: sets the whole chord (a played chord); [x] turns a chord into a single note.
 */
export function nastavVysku(pisen, vyber, midi) {
  const pz = Number(pisen.predznamenani) || 0;
  return zmenVysku(pisen, vyber, n => {
    let tony;
    if (Array.isArray(midi)) tony = midi.map(Number);
    else {
      const m = Number(midi);
      tony = jePomlka(n) ? [m] : midiNoty(n).sort((a, b) => a - b);
      tony[tony.length - 1] = m;
    }
    if (!tony.length || tony.some(x => !Number.isInteger(x))) return null;
    return [...new Set(tony)].sort((a, b) => a - b).map(x => pravopis(x, pz)).join(' ');
  }, { pomlky: true });
}

// ---------------------------------------------------------------- length
/** whole…32nd note lengths for buttons 1–6 */
export const DELKY = ['1/1', '1/2', '1/4', '1/8', '1/16', '1/32'];

/**
 * Changes the selected note's length to d ('1/8', '3/8', '1/12'…). With { doplnit: true } (default) it keeps the bar
 * at the metre length: shortening fills a rest after the note (only up to the metre length – this also removes the
 * excess of an overfull bar), lengthening first uses missing space in the bar, then takes from the following
 * notes/rests in the bar (rests first; the rest of a shortened note is written out as tied notes). When that's not
 * possible, it returns the model unchanged plus `chyba`.
 */
export function nastavDelku(pisen, vyber, d, { doplnit = true } = {}) {
  const n = vybranaNota(pisen, vyber);
  if (!n) return vysledek(pisen, vyber, tx('editor.chyba.zadnaNota'));
  const q1 = zlomek(d);
  if (q1 == null || !typNoty(q1)) return vysledek(pisen, vyber, tx('editor.chyba.delkaJednouNotou', { delka: d }));
  const q0 = zlomek(n.d);
  const p = kopie(pisen);
  const a = pole(p.takty[vyber.takt], vyber.ruka);
  const i = vyber.index;
  a[i].d = naZlomek(q1);
  if (doplnit && q0 != null) {
    const delka = metrum(pisen.takt).delka, soucet = soucetTaktu(pole(pisen.takty[vyber.takt], vyber.ruka));
    if (q1 < q0 - EPS) {
      const pomlka = Math.min(q0 - q1, Math.max(0, delka - (soucet - (q0 - q1))));
      if (pomlka > EPS) {
        const casti = rozloz(pomlka);
        if (!casti) return vysledek(pisen, vyber, tx('editor.chyba.zbytekPomlkami'));
        a.splice(i + 1, 0, ...casti.map(q => novaNota('r', q)));
      }
    } else if (q1 > q0 + EPS) {
      const potreba = q1 - q0 - Math.max(0, delka - soucet);
      const zbytek = uber(a.slice(i + 1), potreba);
      if (!zbytek) return vysledek(pisen, vyber, tx('editor.chyba.neniMisto'));
      a.splice(i + 1, a.length, ...zbytek);
    }
  }
  opravLigatury(p, vyber.ruka, vyber.takt - 1, vyber.takt + 1);
  return vysledek(p, vyber);
}

const ZAKLAD = { whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25, '32nd': 0.125 };
/** adds / removes a dot (a double dot is removed entirely); triplets can't be dotted */
export function prepniTecku(pisen, vyber, volby = {}) {
  const n = vybranaNota(pisen, vyber);
  if (!n) return vysledek(pisen, vyber, tx('editor.chyba.zadnaNota'));
  const ty = typNoty(zlomek(n.d));
  if (!ty) return vysledek(pisen, vyber, tx('editor.chyba.neznamaDelka'));
  if (ty.trioly) return vysledek(pisen, vyber, tx('editor.chyba.teckaTriola'));
  const q = ty.tecky ? ZAKLAD[ty.typ] : ZAKLAD[ty.typ] * 1.5;
  if (!typNoty(q) || typNoty(q).trioly) return vysledek(pisen, vyber, tx('editor.chyba.tecka'));
  return nastavDelku(pisen, vyber, naZlomek(q), volby);
}

/**
 * Triplet: turns an undotted note into a triplet (note + 2 rests of a third of the length, the bar keeps its length);
 * on a note in a triplet it removes the triplet – merges the whole group into one note with the selected note's
 * pitch (on a rest: the group's first note).
 */
export function prepniTriolu(pisen, vyber) {
  const n = vybranaNota(pisen, vyber);
  if (!n) return vysledek(pisen, vyber, tx('editor.chyba.zadnaNota'));
  const q = zlomek(n.d), ty = typNoty(q);
  if (!ty) return vysledek(pisen, vyber, tx('editor.chyba.neznamaDelka'));
  const p = kopie(pisen);
  const a = pole(p.takty[vyber.takt], vyber.ruka);
  if (!ty.trioly) {
    if (ty.tecky) return vysledek(pisen, vyber, tx('editor.chyba.triolaTeckovana'));
    if (!typNoty(q / 3)?.trioly) return vysledek(pisen, vyber, tx('editor.chyba.triolaKratka'));
    a.splice(vyber.index, 1, { ...a[vyber.index], d: naZlomek(q / 3) }, novaNota('r', q / 3), novaNota('r', q / 3));
    opravLigatury(p, vyber.ruka, vyber.takt - 1, vyber.takt + 1);
    return vysledek(p, vyber);
  }
  // find the group: a run of triplet notes, split where the sum gives a plain undotted value
  const jeTriola = x => !!typNoty(zlomek(x.d) || 0)?.trioly;
  let start = vyber.index;
  while (start > 0 && jeTriola(a[start - 1])) start--;
  let od = start, s = 0;
  for (let i = start; i < a.length && jeTriola(a[i]); i++) {
    s += zlomek(a[i].d);
    const t = typNoty(s);
    if (t && !t.trioly && !t.tecky) {
      if (i >= vyber.index) {
        const skupina = a.slice(od, i + 1);
        const zaklad = jePomlka(a[vyber.index]) ? (skupina.find(x => !jePomlka(x)) || a[vyber.index]) : a[vyber.index];
        const slabika = skupina.find(x => x.s)?.s || '';
        a.splice(od, i - od + 1, { ...zaklad, d: naZlomek(s), s: jePomlka(zaklad) ? '' : slabika, lig: !jePomlka(zaklad) && !!a[i].lig });
        opravLigatury(p, vyber.ruka, vyber.takt - 1, vyber.takt + 1);
        return vysledek(p, { ...vyber, index: od });
      }
      od = i + 1; s = 0;
    }
  }
  return vysledek(pisen, vyber, tx('editor.chyba.triolaNeuplna'));
}

// ---------------------------------------------------------------- notes and rests
/** note → rest of the same length (removes the syllable, fingering and ties into it) */
export function naPomlku(pisen, vyber) {
  const n = vybranaNota(pisen, vyber);
  if (!n) return vysledek(pisen, vyber, tx('editor.chyba.zadnaNota'));
  const p = kopie(pisen);
  const a = pole(p.takty[vyber.takt], vyber.ruka);
  a[vyber.index] = { t: 'r', d: n.d, lig: false, s: '' };
  opravLigatury(p, vyber.ruka, vyber.takt - 1, vyber.takt + 1);
  return vysledek(p, vyber);
}
/** delete = the note turns into a rest of the same length (the bar stays full) */
export const smaz = naPomlku;

/**
 * Inserts a note after the selection (vyber.index = −1 inserts at the start of the bar; that's also how to start an
 * empty left hand). nota = { t: 'F#4' | 'r' | MIDI number, d: '1/4', s?, lig? }. With { doplnit: true } (default) it
 * first fills missing space in the bar and takes the rest from the following notes/rests (rests first); if that's
 * not possible, it returns `chyba`.
 */
export function vlozZa(pisen, vyber, nota, { doplnit = true } = {}) {
  const takt = pisen.takty?.[vyber?.takt];
  const ruka = vyber?.ruka === 'l' ? 'l' : 'p';
  if (!takt) return vysledek(pisen, vyber, tx('editor.chyba.zadnyTakt'));
  const a0 = pole(takt, ruka) || [];
  if (!(vyber.index >= -1 && vyber.index < a0.length)) return vysledek(pisen, vyber, tx('editor.chyba.neplatnyVyber'));
  const q = zlomek(nota?.d);
  if (q == null || !typNoty(q)) return vysledek(pisen, vyber, tx('editor.chyba.delkaJednouNotou', { delka: nota?.d }));
  let t = typeof nota.t === 'number' ? pravopis(nota.t, Number(pisen.predznamenani) || 0) : String(nota.t ?? '').trim();
  if (t !== 'r' && !vysky(t).length) return vysledek(pisen, vyber, tx('editor.chyba.neplatnaVyska'));
  if (t !== 'r' && mimoRozsah(t)) return vysledek(pisen, vyber, tx('editor.chyba.mimoRozsah'));
  const nova = { t, d: naZlomek(q), lig: t !== 'r' && !!nota.lig, s: ruka === 'p' && t !== 'r' ? String(nota.s || '') : '' };
  const p = kopie(pisen);
  const tk = p.takty[vyber.takt];
  if (ruka === 'l' && !tk.leva) tk.leva = [];
  const a = pole(tk, ruka);
  const kam = vyber.index + 1;
  if (doplnit) {
    const potreba = q - Math.max(0, metrum(pisen.takt).delka - soucetTaktu(a));
    const zbytek = uber(a.slice(kam), potreba);
    if (!zbytek) return vysledek(pisen, vyber, tx('editor.chyba.neniMisto'));
    a.splice(kam, a.length, nova, ...zbytek);
  } else a.splice(kam, 0, nova);
  opravLigatury(p, ruka, vyber.takt - 1, vyber.takt + 1);
  return vysledek(p, { takt: vyber.takt, index: kam, ruka });
}

/** toggles a tie to the next note; it can only be turned on to a note with the same pitch */
export function prepniLigaturu(pisen, vyber) {
  const n = vybranaNota(pisen, vyber);
  if (!n) return vysledek(pisen, vyber, tx('editor.chyba.zadnaNota'));
  if (jePomlka(n)) return vysledek(pisen, vyber, tx('editor.chyba.ligaturaPomlka'));
  if (!n.lig) {
    const s = sousedni(pisen, vyber, 1);
    const dalsiN = s && vybranaNota(pisen, s);
    const ser = x => midiNoty(x).sort((a, b) => a - b).join();
    const m = ser(n), md = dalsiN ? ser(dalsiN) : '';
    if (!dalsiN || m !== md) return vysledek(pisen, vyber, tx('editor.chyba.ligaturaVyska'));
  }
  const p = kopie(pisen);
  vybranaNota(p, vyber).lig = !n.lig;
  return vysledek(p, vyber);
}

// ---------------------------------------------------------------- lyrics and chords
/** syllable under a right-hand note ('lá-' = the word continues; '' deletes) */
export function nastavSlabiku(pisen, vyber, text) {
  const n = vybranaNota(pisen, vyber);
  if (!n) return vysledek(pisen, vyber, tx('editor.chyba.zadnaNota'));
  if (vyber.ruka === 'l') return vysledek(pisen, vyber, tx('editor.chyba.textLeva'));
  if (jePomlka(n)) return vysledek(pisen, vyber, tx('editor.chyba.textPomlka'));
  const p = kopie(pisen);
  vybranaNota(p, vyber).s = String(text ?? '').trim();
  return vysledek(p, vyber);
}

/**
 * Chord symbol in a bar at beat `doba` (quarter beats from the start of the bar, rounded to 1/24); replaces an
 * existing symbol on the same beat; znacka = null / '' deletes it. The symbol text stays as the user wrote it ('Hmi').
 */
export function nastavAkord(pisen, takt, doba, znacka, vyber = null) {
  const t = pisen.takty?.[takt];
  if (!t) return vysledek(pisen, vyber, tx('editor.chyba.taktNeexistuje'));
  const dd = Math.round(Number(doba) * 24) / 24;
  const delka = Math.max(metrum(pisen.takt).delka, soucetTaktu(t.noty));
  if (!(dd >= 0 && dd < delka - EPS)) return vysledek(pisen, vyber, tx('editor.chyba.dobaMimoTakt'));
  const z = String(znacka ?? '').trim();
  if (z && !akordZnacky(z)) return vysledek(pisen, vyber, tx('editor.chyba.akordZnacka', { znacka: z }));
  const p = kopie(pisen);
  const tk = p.takty[takt];
  tk.akordy = (tk.akordy || []).filter(a => Math.abs(Number(a.doba) - dd) > EPS);
  if (z) tk.akordy.push({ doba: dd, znacka: z });
  tk.akordy.sort((a, b) => a.doba - b.doba);
  return vysledek(p, vyber);
}

// ---------------------------------------------------------------- bars
const posunVyberTaktu = (vyber, od, o) => (vyber && vyber.takt >= od ? { ...vyber, takt: vyber.takt + o } : vyber);
const pomlkyTaktu = delka => (rozloz(delka) || [delka]).map(q => novaNota('r', q));

/**
 * Inserts a bar after bar `za` (−1 = at the start). typ 'pomlky' = whole-bar rest (also in the left hand if the song
 * has one), 'kopie' = copy of bar `za` without repeat marks. The selection moves to the new bar.
 */
export function vlozTakt(pisen, za, typ = 'pomlky') {
  if (!(Number.isInteger(za) && za >= -1 && za < pisen.takty.length)) return vysledek(pisen, null, tx('editor.chyba.polohaTaktu'));
  const p = kopie(pisen);
  let novy;
  if (typ === 'kopie' && za >= 0) {
    novy = kopie(pisen.takty[za]);
    delete novy.znacky;
  } else {
    const delka = metrum(pisen.takt).delka;
    novy = { akordy: [], noty: pomlkyTaktu(delka) };
    if (pisen.takty.some(t => t.leva && t.leva.length)) novy.leva = pomlkyTaktu(delka);
  }
  p.takty.splice(za + 1, 0, novy);
  for (const r of ['p', 'l']) opravLigatury(p, r, za, za + 2);
  return vysledek(p, { takt: za + 1, index: 0, ruka: 'p' });
}

/** deletes a bar (not the last remaining one); a selection in it moves to the bar that took its place */
export function smazTakt(pisen, takt, vyber = null) {
  if (!pisen.takty?.[takt]) return vysledek(pisen, vyber, tx('editor.chyba.taktNeexistuje'));
  if (pisen.takty.length < 2) return vysledek(pisen, vyber, tx('editor.chyba.posledniTakt'));
  const p = kopie(pisen);
  p.takty.splice(takt, 1);
  for (const r of ['p', 'l']) opravLigatury(p, r, takt - 1, takt);
  let v = vyber;
  if (v && v.takt === takt) {
    const ti = Math.min(takt, p.takty.length - 1);
    v = (pole(p.takty[ti], v.ruka) || []).length ? { takt: ti, index: 0, ruka: v.ruka } : null;
  } else v = posunVyberTaktu(v, takt + 1, -1);
  return vysledek(p, v);
}

const ZNACKY = ['zacatekRepetice', 'konecRepetice', 'volta', 'segno', 'coda', 'doCody', 'fine', 'dc', 'ds'];
/** replaces the bar's repeat marks ({ zacatekRepetice: true, volta: [1] … }; {} = none) */
export function nastavZnacky(pisen, takt, znacky, vyber = null) {
  if (!pisen.takty?.[takt]) return vysledek(pisen, vyber, tx('editor.chyba.taktNeexistuje'));
  const z = {};
  for (const [k, h] of Object.entries(znacky || {})) {
    if (!ZNACKY.includes(k)) return vysledek(pisen, vyber, tx('editor.chyba.znacka', { znacka: k }));
    if (k === 'volta') {
      const v = (Array.isArray(h) ? h : h ? [h] : []).map(Number);
      if (v.some(x => !Number.isInteger(x) || x < 1)) return vysledek(pisen, vyber, tx('editor.chyba.volta'));
      if (v.length) z.volta = [...new Set(v)].sort((a, b) => a - b);
    } else if (h) z[k] = true;
  }
  const p = kopie(pisen);
  if (Object.keys(z).length) p.takty[takt].znacky = z;
  else delete p.takty[takt].znacky;
  return vysledek(p, vyber);
}

// ---------------------------------------------------------------- header
/**
 * Changes the header: { nazev, autor, takt: '3/4', predznamenani: −7…7, tempo: 0…400, klic: 'houslovy'|'basovy' }.
 * Changing the key signature does NOT change sounding pitches – it only respells all notes via MIDI for the new key.
 * Changing the time signature recalculates nothing (stavTaktu then shows bars with a wrong sum).
 */
export function nastavHlavicku(pisen, zmeny = {}, vyber = null) {
  const z = { ...zmeny };
  if ('takt' in z) {
    const m = String(z.takt).trim().match(/^(\d{1,2})\/(1|2|4|8|16|32)$/);
    if (!m || Number(m[1]) < 1) return vysledek(pisen, vyber, tx('editor.chyba.metrum', { takt: z.takt }));
    z.takt = `${Number(m[1])}/${m[2]}`;
  }
  if ('predznamenani' in z && !(Number.isInteger(Number(z.predznamenani)) && Math.abs(z.predznamenani) <= 7)) {
    return vysledek(pisen, vyber, tx('editor.chyba.predznamenani'));
  }
  if ('tempo' in z && !(Number.isFinite(Number(z.tempo)) && z.tempo >= 0 && z.tempo <= 400)) {
    return vysledek(pisen, vyber, tx('editor.chyba.tempo'));
  }
  if ('klic' in z && !['houslovy', 'basovy'].includes(z.klic)) return vysledek(pisen, vyber, tx('editor.chyba.klic'));
  const p = kopie(pisen);
  if ('nazev' in z) p.nazev = String(z.nazev ?? '').trim();
  if ('autor' in z) p.autor = String(z.autor ?? '').trim();
  if ('takt' in z) p.takt = z.takt;
  if ('tempo' in z) p.tempo = Math.round(Number(z.tempo));
  if ('klic' in z) p.klic = z.klic;
  if ('predznamenani' in z && Number(z.predznamenani) !== (Number(pisen.predznamenani) || 0)) {
    const pz = Number(z.predznamenani);
    p.predznamenani = pz;
    for (const t of p.takty) {
      for (const a of [t.noty, t.leva]) {
        for (const n of a || []) {
          if (!jePomlka(n) && vysky(n.t).length) n.t = vysky(n.t).map(v => pravopis(v.midi, pz)).join(' ');
        }
      }
    }
  }
  return vysledek(p, vyber);
}

// ---------------------------------------------------------------- bar status
/**
 * For each bar { ok, soucet, soucetLeva, ocekavano, zprava } – sums in quarter beats (soucetLeva = null without a
 * left hand), ocekavano = metre length, zprava = problems from kontrola() joined with '; ' (pickup, short bars at
 * repeats and the last bar are not errors).
 */
export function stavTaktu(pisen) {
  const ocekavano = metrum(pisen.takt).delka;
  const zpravy = pisen.takty.map(() => []);
  // problems as data (bar number, hand, kind) and text in the app language
  for (const p of kontrolaPolozky(pisen)) {
    const z = popisKontroly(p);
    if (zpravy[p.takt - 1]) zpravy[p.takt - 1].push(p.leva ? tx('editor.levaRukaZprava', { zprava: z }) : z);
  }
  return pisen.takty.map((t, i) => ({
    ok: !zpravy[i].length,
    soucet: soucetTaktu(t.noty),
    soucetLeva: t.leva && t.leva.length ? soucetTaktu(t.leva) : null,
    ocekavano,
    zprava: zpravy[i].join('; '),
  }));
}

// ---------------------------------------------------------------- history
// historie = { kroky: [{ json, popis }], pozice } – models stored as JSON (immutable, comparable); zpet/znovu
// always return a fresh copy, so even a mutation in the UI can't corrupt the history.
const zKroku = k => JSON.parse(k.json);

/** new history with the initial state → { pisen, historie } */
export function novaHistorie(pisen) {
  return { pisen, historie: { kroky: [{ json: JSON.stringify(pisen), popis: 'začátek' }], pozice: 0 } };
}
/** records a new state (drops the "redo" steps); a state equal to the current one isn't recorded; at most MAX_HISTORIE undo steps */
export function zapis(historie, pisen, popis = '') {
  const json = JSON.stringify(pisen);
  if (historie.kroky[historie.pozice]?.json === json) return { pisen, historie };
  let kroky = [...historie.kroky.slice(0, historie.pozice + 1), { json, popis: String(popis) }];
  if (kroky.length > MAX_HISTORIE + 1) kroky = kroky.slice(kroky.length - MAX_HISTORIE - 1);
  return { pisen, historie: { kroky, pozice: kroky.length - 1 } };
}
/** undo → { pisen, historie, popis (what was undone), or popis null when there's nothing to undo } */
export function zpet(historie) {
  if (historie.pozice <= 0) return { pisen: zKroku(historie.kroky[historie.pozice]), historie, popis: null };
  const h = { ...historie, pozice: historie.pozice - 1 };
  return { pisen: zKroku(h.kroky[h.pozice]), historie: h, popis: historie.kroky[historie.pozice].popis };
}
/** redo → { pisen, historie, popis | null } */
export function znovu(historie) {
  if (historie.pozice >= historie.kroky.length - 1) return { pisen: zKroku(historie.kroky[historie.pozice]), historie, popis: null };
  const h = { ...historie, pozice: historie.pozice + 1 };
  return { pisen: zKroku(h.kroky[h.pozice]), historie: h, popis: h.kroky[h.pozice].popis };
}
export const muzeZpet = h => h.pozice > 0;
export const muzeZnovu = h => h.pozice < h.kroky.length - 1;

// ---------------------------------------------------------------- keyboard shortcuts
/**
 * Key (KeyboardEvent.key) + modifiers → operation name, or null. Names: vyskaNahoru/Dolu,
 * chromatickyNahoru/Dolu, oktavaNahoru/Dolu, dalsi, predchozi, delka1|delka2|delka4|delka8|delka16|delka32,
 * tecka, pomlka, smazat, ligatura, zpet, znovu (triplet has no key, but proved('triola') works). Digits are accepted
 * with Shift too and from the Czech keyboard (+ěščřž, é = 0); passing { kod: event.code } ('Digit3', 'Numpad3') as
 * well is more reliable. ctrl counts as meta (Windows/Linux). Run it via proved(nazev, pisen, vyber).
 */
export function klavesovaZkratka(klavesa, { shift = false, alt = false, meta = false, ctrl = false, kod = '' } = {}) {
  const k = String(klavesa || '');
  const cmd = meta || ctrl;
  if (cmd) {
    if (k.toLowerCase() === 'z' && !alt) return shift ? 'znovu' : 'zpet';
    if (k.toLowerCase() === 'y' && !alt && !shift) return 'znovu';
    return null;
  }
  if (k === 'ArrowUp' || k === 'ArrowDown') {
    const s = k === 'ArrowUp' ? 'Nahoru' : 'Dolu';
    return alt ? 'oktava' + s : shift ? 'chromaticky' + s : 'vyska' + s;
  }
  if (alt) return null;
  if (k === 'ArrowRight') return 'dalsi';
  if (k === 'ArrowLeft') return 'predchozi';
  const cz = { '+': '1', 'ě': '2', 'š': '3', 'č': '4', 'ř': '5', 'ž': '6', 'é': '0' };
  const kodCislo = String(kod).match(/^(?:Digit|Numpad)(\d)$/)?.[1];
  const cislo = kodCislo ?? (/^\d$/.test(k) ? k : cz[k]);
  if (cislo && cislo >= '1' && cislo <= '6') return 'delka' + DELKY[cislo - 1].split('/').pop();
  if (cislo === '0') return 'pomlka';
  if (k === '.') return 'tecka';
  if (k === 'Delete' || k === 'Backspace') return 'smazat';
  if (shift) return null;
  if (k === 'r') return 'pomlka';
  if (k === 't') return 'ligatura';
  return null;
}

/** performs an editing operation by name from klavesovaZkratka (not zpet/znovu – those belong to the history) → { pisen, vyber, chyba? } */
export function proved(nazev, pisen, vyber) {
  const m = String(nazev).match(/^delka(\d+)$/);
  if (m) return nastavDelku(pisen, vyber, `1/${m[1]}`);
  const ops = {
    vyskaNahoru: () => posunVysku(pisen, vyber, 1), vyskaDolu: () => posunVysku(pisen, vyber, -1),
    chromatickyNahoru: () => posunVysku(pisen, vyber, 1, { chromaticky: true }),
    chromatickyDolu: () => posunVysku(pisen, vyber, -1, { chromaticky: true }),
    oktavaNahoru: () => posunOktavu(pisen, vyber, 1), oktavaDolu: () => posunOktavu(pisen, vyber, -1),
    dalsi: () => dalsi(pisen, vyber), predchozi: () => predchozi(pisen, vyber),
    tecka: () => prepniTecku(pisen, vyber), pomlka: () => naPomlku(pisen, vyber), smazat: () => smaz(pisen, vyber),
    ligatura: () => prepniLigaturu(pisen, vyber), triola: () => prepniTriolu(pisen, vyber),
  };
  return ops[nazev] ? ops[nazev]() : vysledek(pisen, vyber, tx('editor.chyba.operace', { nazev }));
}
