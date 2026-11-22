// Comparison of two transcriptions of the same song (model "Pisen" from ./song.js). No DOM.
//
//  (a) porovnej(vzor, test) – accuracy of a conversion (e.g. sheet music via AI) against a verified reference: bars,
//      pitches, durations, chords, syllables + a localized list of differences.
//  (b) rozdilyCteni(a, b) / slucCteni(a, b, rozhodnuti) – "two independent readings": where they differ and how to merge them.
//
// Method: each hand of a bar is turned into "events" (note/chord/rest with a position in the bar in quarter beats);
// tied notes of the same pitch and adjacent rests are merged (1/4~1/8 = 3/8). Pitches are compared by MIDI as
// sets (F#4 = Gb4, chord regardless of order). Events within a bar are aligned by dynamic programming
// by position and pitch (not by index), and so are the bars themselves (Needleman–Wunsch with bar similarity), so
// a missing or extra bar doesn't push everything else into errors.
//
// Bar indexes are 0-based (as in the model); in the "popis" texts bar numbers start at 1, as a person sees them.

import { t } from './texts.js';
import { zlomek, naZlomek, metrum, vysky, tonyAkordu, rozvin, kopie } from './song.js';

const EPS = 1e-6;
const rovno = (x, y) => Math.abs(x - y) < EPS;
const MEZERA_TAKT = -0.3;               // cost of a missing / extra bar in the alignment
// score of a bar pair for alignment: exact match 1, otherwise half the similarity (max 0.5). A shifted alignment (bar
// against its neighbour) thus never beats exact matches over a longer stretch, and a completely different bar (0) is
// still cheaper to pair than to skip twice (2 × −0.3).
const skoreTaktu = sim => (sim >= 1 - EPS ? 1 : 0.5 * sim);

// ---------------------------------------------------------------- events
const midiNoty = t => [...new Set(vysky(t).map(v => v.midi))].sort((x, y) => x - y);
const stejneMidi = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
const cistaSlabika = s => String(s ?? '').trim().normalize('NFC');

/**
 * notes of one hand → events [{ pos, d, midi: [..], t, s, i }] (pos and d in quarter beats, i = index of the first note);
 * ties of the same pitch and adjacent rests are merged
 */
export function udalosti(noty) {
  const out = [];
  let pos = 0, lig = false;
  (noty || []).forEach((n, i) => {
    const q = zlomek(n.d) || 0;
    const pomlka = String(n.t ?? 'r').trim() === 'r';
    const midi = pomlka ? [] : midiNoty(n.t);
    const s = cistaSlabika(n.s);
    const pred = out[out.length - 1];
    if (pred && ((lig && midi.length && stejneMidi(pred.midi, midi)) || (!midi.length && !pred.midi.length))) {
      pred.d += q;
      if (!pred.s) pred.s = s;
    } else {
      out.push({ pos, d: q, midi, t: midi.length ? String(n.t).trim().split(/\s+/).join(' ') : 'r', s, i });
    }
    lig = !!n.lig && midi.length > 0;
    pos += q;
  });
  return out;
}

/** generic alignment of two sequences (Needleman–Wunsch); skore(i, j) → number | null (cannot be paired) */
function zarovnej(n, m, skore, mezera) {
  const S = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const Z = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));     // 1 pair, 2 only A, 3 only B
  for (let i = 1; i <= n; i++) { S[i][0] = i * mezera; Z[i][0] = 2; }
  for (let j = 1; j <= m; j++) { S[0][j] = j * mezera; Z[0][j] = 3; }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      let best = S[i - 1][j] + mezera, z = 2;
      if (S[i][j - 1] + mezera > best + EPS) { best = S[i][j - 1] + mezera; z = 3; }
      const s = skore(i - 1, j - 1);
      if (s != null && S[i - 1][j - 1] + s >= best - EPS) { best = S[i - 1][j - 1] + s; z = 1; }
      S[i][j] = best; Z[i][j] = z;
    }
  }
  const out = [];
  for (let i = n, j = m; i > 0 || j > 0;) {
    const z = Z[i][j];
    if (z === 1) { out.push([i - 1, j - 1]); i--; j--; } else if (z === 2) { out.push([i - 1, null]); i--; } else { out.push([null, j - 1]); j--; }
  }
  return out.reverse();
}

/** score of an event pair: the same pitch may be shifted by up to 2 beats, a different pitch only by a sixteenth */
function skorePary(a, b) {
  const v = stejneMidi(a.midi, b.midi), dt = Math.abs(a.pos - b.pos);
  if (v ? dt > 2 + EPS : dt > 0.25 + EPS) return null;
  return (v ? 0.6 : 0) + 0.4 * Math.max(0, 1 - dt) + (rovno(a.d, b.d) ? 0.05 : 0);
}

function stejnyAkord(x, y) {
  const a = tonyAkordu(x), b = tonyAkordu(y);
  if (a && b) {
    const ta = [...new Set(a.tony)].sort((p, q) => p - q), tb = [...new Set(b.tony)].sort((p, q) => p - q);
    return a.koren === b.koren && a.bas === b.bas && stejneMidi(ta, tb);
  }
  return String(x ?? '').trim() === String(y ?? '').trim();
}

const normZnacky = z => JSON.stringify(Object.entries(z || {})
  .filter(([, v]) => v && !(Array.isArray(v) && !v.length)).sort(([p], [q]) => (p < q ? -1 : 1)));

/** bar → input for comparison */
function priprav(t, ruce) {
  const p = { akordy: [...((t && t.akordy) || [])].sort((x, y) => (Number(x.doba) || 0) - (Number(y.doba) || 0)), znacky: t?.znacky };
  for (const r of ruce) p[r] = udalosti(r === 'l' ? t?.leva : t?.noty);
  return p;
}

const prazdnaStat = () => ({ udA: 0, udB: 0, pary: 0, vysky: 0, delky: 0, shoda: 0, slabA: 0, slabB: 0, slabU: 0, slabS: 0, akA: 0, akB: 0, akU: 0, akS: 0 });

/**
 * compares two prepared bars → { sim (0..1), stat, rozdily: [{ druh, ruka, pos, a, b }] }
 * druh: vyska | delka | vyskaDelka | chybi (only in A) | navic (only in B) | slabika | akord
 */
function porovnejTakt(A, B, ruce) {
  const stat = prazdnaStat(), rozdily = [];
  let body = 0, polozek = 0;
  for (const ruka of ruce) {
    const ea = A[ruka], eb = B[ruka];
    const pary = zarovnej(ea.length, eb.length, (i, j) => skorePary(ea[i], eb[j]), 0);
    stat.udA += ea.length; stat.udB += eb.length;
    for (const [i, j] of pary) {
      const a = i == null ? null : ea[i], b = j == null ? null : eb[j];
      polozek++;
      if (a && a.s) stat.slabA++;
      if (b && b.s) stat.slabB++;
      if (a?.s || b?.s) stat.slabU++;
      if (!a || !b) {
        rozdily.push({ druh: a ? 'chybi' : 'navic', ruka, pos: (a || b).pos, a, b });
        continue;
      }
      stat.pary++;
      const v = stejneMidi(a.midi, b.midi), d = rovno(a.d, b.d), s = a.s === b.s;
      if (v) stat.vysky++;
      if (d) stat.delky++;
      if (v && d) stat.shoda++;
      if ((a.s || b.s) && s) stat.slabS++;
      body += 0.5 * v + 0.3 * d + 0.2 * s;
      if (!v || !d) rozdily.push({ druh: !v && !d ? 'vyskaDelka' : !v ? 'vyska' : 'delka', ruka, pos: a.pos, a, b });
      if (!s) rozdily.push({ druh: 'slabika', ruka, pos: a.pos, a, b });
    }
  }
  // chords: paired by beat
  const pouzite = new Set();
  stat.akA = A.akordy.length; stat.akB = B.akordy.length;
  for (const ca of A.akordy) {
    const k = B.akordy.findIndex((cb, x) => !pouzite.has(x) && rovno(Number(cb.doba) || 0, Number(ca.doba) || 0));
    stat.akU++;
    if (k < 0) { rozdily.push({ druh: 'akord', pos: Number(ca.doba) || 0, a: ca, b: null }); continue; }
    pouzite.add(k);
    if (stejnyAkord(ca.znacka, B.akordy[k].znacka)) stat.akS++;
    else rozdily.push({ druh: 'akord', pos: Number(ca.doba) || 0, a: ca, b: B.akordy[k] });
  }
  B.akordy.forEach((cb, x) => {
    if (pouzite.has(x)) return;
    stat.akU++;
    rozdily.push({ druh: 'akord', pos: Number(cb.doba) || 0, a: null, b: cb });
  });
  const simNot = polozek ? body / polozek : 1;
  const simAk = stat.akU ? stat.akS / stat.akU : 1;
  return { sim: 0.9 * simNot + 0.1 * simAk, stat, rozdily };
}

/** statistics of a bar that is only in one transcription */
function statSamotny(P, ruce, strana) {
  const st = prazdnaStat();
  for (const r of ruce) {
    st[strana === 'a' ? 'udA' : 'udB'] += P[r].length;
    const sl = P[r].filter(e => e.s).length;
    st[strana === 'a' ? 'slabA' : 'slabB'] += sl;
    st.slabU += sl;
  }
  st[strana === 'a' ? 'akA' : 'akB'] += P.akordy.length;
  st.akU += P.akordy.length;
  return st;
}

/** shared core: aligns the bars and compares the paired ones */
function jadro(a, b, { rozvinout, ruka }) {
  const maLevou = x => x.takty.some(t => t.leva && t.leva.length);
  const ruce = ruka === 'obe' ? (maLevou(a) || maLevou(b) ? ['p', 'l'] : ['p']) : [ruka === 'l' ? 'l' : 'p'];
  const ra = rozvinout ? rozvin(a) : { pisen: a, poradi: a.takty.map((_, i) => i) };
  const rb = rozvinout ? rozvin(b) : { pisen: b, poradi: b.takty.map((_, i) => i) };
  const A = ra.pisen.takty.map(t => priprav(t, ruce)), B = rb.pisen.takty.map(t => priprav(t, ruce));
  const cache = new Map();
  const srovnej = (i, j) => {
    const k = i * (B.length + 1) + j;
    if (!cache.has(k)) cache.set(k, porovnejTakt(A[i], B[j], ruce));
    return cache.get(k);
  };
  const zar = zarovnej(A.length, B.length, (i, j) => skoreTaktu(srovnej(i, j).sim), MEZERA_TAKT);
  const polozky = zar.map(([i, j]) => {
    if (i != null && j != null) return { i, j, ...srovnej(i, j) };
    return { i, j, stat: i != null ? statSamotny(A[i], ruce, 'a') : statSamotny(B[j], ruce, 'b'), rozdily: [] };
  });
  return { ruce, A, B, poradiA: ra.poradi, poradiB: rb.poradi, zar, polozky, doba: metrum(a.takt).doba };
}

// ---------------------------------------------------------------- texts
const porovnani = (klic, hodnoty) => t('editor.porovnani.' + klic, hodnoty);
const delkaText = (q, lokalni = false) => {
  const n = Math.round(q * 1000) / 1000;
  return naZlomek(q) || (lokalni ? porovnani('doby', { n }) : `${n} dob`);
};
const vyskaText = (e, lokalni = false) => e.t === 'r' ? (lokalni ? t('editor.pomlka') : 'pomlka') : e.t;
function naDobe(pos, doba, lokalni = false) {
  const k = Math.floor(pos / doba + EPS), zb = pos - k * doba;
  const zaklad = lokalni ? porovnani('doba', { n: k + 1 }) : `na ${k + 1}. době`;
  return zaklad + (zb > EPS ? ` + ${delkaText(zb, lokalni)}` : '');
}
const prefixRuky = (r, ruce) => (ruce.length > 1 && r === 'l' ? 'levá ruka – ' : ruce.length > 1 && r === 'p' ? 'pravá ruka – ' : '');

/** difference → text in the style "test instead of reference" */
function textVzor(r, doba) {
  const kde = naDobe(r.pos, doba, true);
  const { a, b } = r;
  const vyska = e => vyskaText(e, true), delka = e => delkaText(e.d, true);
  switch (r.druh) {
    case 'vyska': return porovnani('vyska', { a: vyska(a), b: vyska(b), kde });
    case 'delka': {
      const klic = rovno(a.d, b.d * 1.5) ? 'chybiTecka' : rovno(b.d, a.d * 1.5) ? 'teckaNavic' : 'delka';
      return porovnani(klic, { a: delka(a), b: delka(b), nota: vyska(a), kde });
    }
    case 'vyskaDelka': return porovnani('vyska', { a: `${vyska(a)} ${delka(a)}`, b: `${vyska(b)} ${delka(b)}`, kde });
    case 'chybi': return porovnani('chybi', { nota: `${vyska(a)} ${delka(a)}`, kde });
    case 'navic': return porovnani('navic', { nota: `${vyska(b)} ${delka(b)}`, kde });
    case 'slabika': return porovnani(!a.s ? 'slabikaNavic' : !b.s ? 'chybiSlabika' : 'slabika',
      { a: a.s, b: b.s, nota: vyska(a), kde });
    case 'akord': return porovnani(!b ? 'chybiAkord' : !a ? 'akordNavic' : 'akord', { a: a?.znacka, b: b?.znacka, kde });
    default: return r.druh;
  }
}

/** difference → neutral text for two readings ("A: …, B: …") */
function textCteni(r, doba, ruce) {
  const kde = naDobe(r.pos, doba), pre = prefixRuky(r.ruka, ruce);
  const { a, b } = r;
  switch (r.druh) {
    case 'vyska': return `${pre}výška ${kde}: A ${vyskaText(a)}, B ${vyskaText(b)}`;
    case 'delka': return `${pre}délka ${vyskaText(a)} ${kde}: A ${delkaText(a.d)}, B ${delkaText(b.d)}`;
    case 'vyskaDelka': return `${pre}nota ${kde}: A ${vyskaText(a)} ${delkaText(a.d)}, B ${vyskaText(b)} ${delkaText(b.d)}`;
    case 'chybi': return `${pre}jen v A: ${vyskaText(a)} ${delkaText(a.d)} ${kde}`;
    case 'navic': return `${pre}jen v B: ${vyskaText(b)} ${delkaText(b.d)} ${kde}`;
    case 'slabika': return `${pre}slabika ${kde}: A „${a.s}“, B „${b.s}“`;
    case 'akord': return `akord ${kde}: A ${a ? a.znacka : '–'}, B ${b ? b.znacka : '–'}`;
    case 'znacky': return 'značky repetic se liší';
    default: return r.druh;
  }
}

const DRUH_SKUPINA = { vyska: ['vysky'], delka: ['delky'], vyskaDelka: ['vysky', 'delky'], chybi: ['noty'], navic: ['noty'],
  slabika: ['slabiky'], akord: ['akordy'], znacky: ['znacky'] };

// ---------------------------------------------------------------- (a) accuracy against a reference
/**
 * Compares the transcription `test` with the verified `vzor`. Options: rozvinout (unroll repeats/voltas/D.C. before
 * comparing), ruka 'p' | 'l' | 'obe'. Accuracies are ratios 0..1 relative to the union (paired + unpaired from both
 * sides), so both missing and extra notes are penalised; akordy/slabiky are null when neither transcription has them.
 * zarovnani: index pairs into the (possibly unrolled) bars; poradiVzor/poradiTest map them to the original bars.
 * rozdily: [{ taktVzor, taktTest (original 0-based indexes | null), druh, popis }] – identical texts are not repeated.
 */
export function porovnej(vzor, test, { rozvinout = true, ruka = 'p' } = {}) {
  const J = jadro(vzor, test, { rozvinout, ruka });
  const tot = prazdnaStat();
  let shodnych = 0, chybejicich = 0, navic = 0;
  const rozdily = [], videno = new Set();
  const pridej = (taktVzor, taktTest, druh, popis) => {
    if (videno.has(popis)) return;
    videno.add(popis);
    rozdily.push({ taktVzor, taktTest, druh, popis });
  };
  let posledniVzor = null;
  for (const p of J.polozky) {
    for (const k in tot) tot[k] += p.stat[k];
    const tv = p.i != null ? J.poradiA[p.i] : null, tt = p.j != null ? J.poradiB[p.j] : null;
    if (p.i != null && p.j != null) {
      if (!p.rozdily.length) shodnych++;
      for (const r of p.rozdily) {
        let text = textVzor(r, J.doba);
        if (J.ruce.length > 1 && (r.ruka === 'l' || r.ruka === 'p')) text = porovnani(r.ruka === 'l' ? 'leva' : 'prava', { text });
        pridej(tv, tt, r.druh, porovnani('takt', { n: tv + 1, text }));
      }
    } else if (p.i != null) {
      chybejicich++;
      pridej(tv, null, 'chybiTakt', porovnani('chybiTakt', { n: tv + 1 }));
    } else {
      navic++;
      pridej(null, tt, 'taktNavic', porovnani(posledniVzor == null ? 'navicNaZacatku' : 'navicZaTaktem',
        { n: tt + 1, za: posledniVzor + 1 }));
    }
    if (tv != null) posledniVzor = tv;
  }
  const U = tot.udA + tot.udB - tot.pary;
  const podil = (x, z) => (z ? x / z : 1);
  return {
    taktuVzor: J.A.length, taktuTest: J.B.length,
    zarovnani: J.zar, poradiVzor: J.poradiA, poradiTest: J.poradiB,
    shodnychTaktu: shodnych, chybejicichTaktu: chybejicich, taktuNavic: navic,
    presnostTaktu: podil(shodnych, J.zar.length),
    noty: { vzor: tot.udA, test: tot.udB, sparovano: tot.pary, shoda: tot.shoda },
    presnostVysek: podil(tot.vysky, U), presnostDelek: podil(tot.delky, U), presnostNot: podil(tot.shoda, U),
    akordy: { vzor: tot.akA, test: tot.akB, shoda: tot.akS }, presnostAkordu: tot.akU ? tot.akS / tot.akU : null,
    slabiky: { vzor: tot.slabA, test: tot.slabB, shoda: tot.slabS }, presnostSlabik: tot.slabU ? tot.slabS / tot.slabU : null,
    rozdily,
  };
}

const procenta = x => `${x >= 1 - EPS ? 100 : Math.min(99, Math.round(x * 100))} %`;

/** porovnej result → three localized lines */
export function souhrnText(v) {
  const celkem = v.zarovnani ? v.zarovnani.length : v.taktuVzor;
  const casti = [porovnani('takty', { a: v.shodnychTaktu, b: celkem, p: procenta(v.presnostTaktu) })];
  for (const [klic, podil] of [['vysky', v.presnostVysek], ['delky', v.presnostDelek], ['akordy', v.presnostAkordu], ['slabiky', v.presnostSlabik]]) {
    if (podil != null) casti.push(porovnani(klic, { p: procenta(podil) }));
  }
  const radky = [casti.join(', ')];
  let r2 = porovnani('noty', { a: v.noty.shoda, b: v.noty.vzor, p: procenta(v.presnostNot) });
  if (v.chybejicichTaktu || v.taktuNavic) {
    r2 += '; ' + porovnani('poctyTaktu', { a: v.taktuVzor, b: v.taktuTest });
    if (v.chybejicichTaktu) r2 += ', ' + porovnani('chybiCelkem', { n: v.chybejicichTaktu });
    if (v.taktuNavic) r2 += ', ' + porovnani('navicCelkem', { n: v.taktuNavic });
  }
  radky.push(r2 + '.');
  if (!v.rozdily.length) radky.push(porovnani('shoda'));
  else {
    const uk = v.rozdily.slice(0, 3).map(r => r.popis).join('; ');
    radky.push(porovnani('rozdily', { n: v.rozdily.length, text: uk + (v.rozdily.length > 3 ? '; …' : '') }));
  }
  return radky.join('\n');
}

// ---------------------------------------------------------------- (b) two independent readings
/**
 * Bars where the two readings differ (repeats not unrolled, both hands, repeat marks too).
 * → [{ takt (index in a | null), taktB (index in b | null), zaTaktem? (for a bar only in b: index of the preceding bar
 *      in a, −1 at the start), druhy: ['vysky'|'delky'|'noty'|'akordy'|'slabiky'|'znacky'|'takt'], detaily: [text], popis }]
 */
export function rozdilyCteni(a, b, { ruka = 'obe' } = {}) {
  const J = jadro(a, b, { rozvinout: false, ruka });
  const out = [];
  let posledniA = -1;
  for (const p of J.polozky) {
    if (p.i != null && p.j != null) {
      const rozdily = [...p.rozdily];
      if (normZnacky(J.A[p.i].znacky) !== normZnacky(J.B[p.j].znacky)) rozdily.push({ druh: 'znacky', pos: 0 });
      if (rozdily.length) {
        const detaily = rozdily.map(r => textCteni(r, J.doba, J.ruce));
        out.push({ takt: p.i, taktB: p.j, druhy: [...new Set(rozdily.flatMap(r => DRUH_SKUPINA[r.druh] || [r.druh]))],
          detaily, popis: `takt ${p.i + 1}: ${detaily.join('; ')}` });
      }
    } else if (p.i != null) {
      out.push({ takt: p.i, taktB: null, druhy: ['takt'], detaily: ['takt je jen v čtení A'], popis: `takt ${p.i + 1} je jen v čtení A` });
    } else {
      out.push({ takt: null, taktB: p.j, zaTaktem: posledniA, druhy: ['takt'], detaily: ['takt je jen v čtení B'],
        popis: posledniA < 0 ? `čtení B má navíc takt na začátku (B ${p.j + 1})` : `čtení B má navíc takt za taktem ${posledniA + 1} (B ${p.j + 1})` });
    }
    if (p.i != null) posledniA = p.i;
  }
  return out;
}

/**
 * Merges two readings: takes identical bars as they are; for differing ones follows rozhodnuti[indexInA] = 'a' | 'b' |
 * barObject, otherwise takes `a` and marks the bar as uncertain. A bar only in `a`: 'b' = omit it. A bar only in `b`
 * (key 'b' + indexInB, e.g. rozhodnuti.b12 = 'b' or barObject) is not inserted without a decision.
 * → { pisen (new model; texts of unresolved differences are added to pisen.nejistoty), nejiste: [indexes in pisen],
 *     navicB: [indexes in b of unresolved extra bars] }
 */
export function slucCteni(a, b, rozhodnuti = {}, { ruka = 'obe' } = {}) {
  const roz = rozhodnutiMapa(rozhodnuti);
  const J = jadro(a, b, { rozvinout: false, ruka });
  const rozdilne = new Map(rozdilyCteni(a, b, { ruka }).map(r => [r.takt != null ? `a${r.takt}` : `b${r.taktB}`, r]));
  const pisen = kopie(a);
  const takty = [], nejiste = [], navicB = [];
  const nejistoty = [...(a.nejistoty || [])];
  for (const [i, j] of J.zar) {
    if (i == null) {                                                     // bar only in b
      const r = roz.get('b' + j);
      if (r === 'b') takty.push(kopie(b.takty[j]));
      else if (r && typeof r === 'object') takty.push(kopie(r));
      else if (r !== 'a') {
        navicB.push(j);
        nejistoty.push(`za taktem ${takty.length}: čtení B má navíc takt (B ${j + 1})`);
      }
      continue;
    }
    const rozdil = rozdilne.get(`a${i}`);
    if (!rozdil) { takty.push(kopie(a.takty[i])); continue; }
    const r = roz.get(String(i));
    if (r === 'b') { if (j != null) takty.push(kopie(b.takty[j])); continue; }   // bar only in a + 'b' = omit
    if (r && typeof r === 'object') { takty.push(kopie(r)); continue; }
    takty.push(kopie(a.takty[i]));
    if (r !== 'a') {
      nejiste.push(takty.length - 1);
      nejistoty.push(`takt ${takty.length}: čtení se liší – ${rozdil.detaily.join('; ')}`);
    }
  }
  pisen.takty = takty;
  if (nejistoty.length) pisen.nejistoty = nejistoty;
  return { pisen, nejiste, navicB };
}

const rozhodnutiMapa = r => new Map(Object.entries(r || {}).map(([k, v]) => [String(k), v]));
