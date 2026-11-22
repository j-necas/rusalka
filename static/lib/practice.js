// Practice logic: sections (phrases), attempt records, mistake statistics, tempo plan and facts for the
// "coach after playing" (template text). Pure functions with no DOM, timers or network.
//
// BAR NUMBERING: all `takt`, `od`, `do`, `index` fields are bar indexes of the EXPANDED song, starting at 0 (play
// order after expanding repeats, `rozvin(pisen).pisen.takty`). Human-readable text ("bars 5–8") uses bar numbers
// as the player sees them in the score: number = original bar index + 1 (`rozvin(...).poradi[i] + 1`). Without
// repeats the two differ only by 1. Functions that take `pisen` expand it themselves (expanding an already
// expanded song changes nothing).
//
// TIME: ms in an attempt record are in "song time" (ms at 100 % tempo, same as note `ms`/`dur` in the game). The
// actual deviation the player feels is deviation / (speed / 100); the summary reports it in real ms.

import { zlomek, metrum, rozvin, soucetTaktu, kontrolaPolozky } from './song.js';
import { nazevTonu } from './note_names.js';
import { t, jazyk } from './texts.js';
import { MAX_HISTORIE } from './stats.js';

// ---------------------------------------------------------------- constants
const UTLUM_POKUS = 0.8;                 // weight of older data in bars the new attempt played
const POLOCAS_DNU = 30;                  // time decay of statistics (half-life in days)
const PRAH_SPECH_MS = 40;                // average shift (real ms) from which it counts as "early" / "late"
const MIN_RYCHLOST = 40, MAX_RYCHLOST = 100;
const INTERP = /[.,!?;:…]$/;


const CERNE = new Set([1, 3, 6, 8, 10]);

/** Czech note name without octave (66 → 'Fis'); becka = spelling with flats */
export function jmenoTonu(pitch, becka = false) {
  return nazevTonu(pitch, becka);
}

const zaokr = (x, k = 0) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** k) / 10 ** k);
const prumer = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const median = a => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---------------------------------------------------------------- bar numbers and section labels
function rozvinuta(pisen) {
  if (!pisen || !Array.isArray(pisen.takty)) return { takty: [], poradi: [], takt: '4/4' };
  const r = rozvin(pisen);
  return { takty: r.pisen.takty, poradi: r.poradi, takt: pisen.takt };
}
/** bar number as the player sees it in the score (expanded song index → original bar + 1) */
export function cisloTaktu(pisen, i) {
  return cislo(rozvinuta(pisen).poradi, i);
}
const cislo = (poradi, i) => (poradi[i] ?? i) + 1;

/** ordinal number in the app language ('2.' / '2nd') */
const radova = n => t('cviceni.radova.' + new Intl.PluralRules(jazyk(), { type: 'ordinal' }).select(n), { n });

/** 'takty 5–8' / 'takt 5' (+ ' (2. průchod)' when the section is played again after a repeat); in English 'bars 5–8' / 'bar 5' */
function popisCisel(poradi, od, dok) {
  const a = cislo(poradi, od), b = cislo(poradi, dok);
  let s = a === b ? t('cviceni.takt', { a }) : t('cviceni.takty', { a, b });
  const k = poradi.slice(0, od).filter(x => x === poradi[od]).length;
  if (k > 0) s += t('cviceni.pruchod', { k: radova(k + 1) });
  return s;
}
/** number range without the pass suffix ('5–8' / '5') – for the coach facts */
function rozsahCisel(poradi, od, dok) {
  const a = cislo(poradi, od), b = cislo(poradi, dok);
  return a === b ? String(a) : `${a}–${b}`;
}

/** first few words of the lyrics in bars od..do ('Večer padá…'); '' when there are no lyrics */
function zacatekTextu(takty, od, dok, slov = 3) {
  let pokracuje = false;                        // previous syllable ended with '-' → the first syllable is the rest of a word
  for (let i = 0; i < od; i++) for (const n of takty[i].noty || []) {
    const s = String(n.s || '').trim();
    if (s) pokracuje = s.endsWith('-');
  }
  const slova = [];
  let slovo = '', vic = false;
  for (let i = od; i <= dok; i++) for (const n of takty[i].noty || []) {
    const s = String(n.s || '').trim();
    if (!s) continue;
    if (slova.length >= slov + 3) { vic = true; continue; }
    const tx = s.replace(/-+$/, '');
    if (pokracuje && !slovo && !slova.length) { pokracuje = s.endsWith('-'); continue; }   // cut-off end of a word
    slovo += tx;
    pokracuje = s.endsWith('-');
    if (!pokracuje) { slova.push(...slovo.split(/\s+/).filter(Boolean)); slovo = ''; }
  }
  if (slovo) vic = true;                        // an unfinished word at the end of the section is left out of the label
  // skip the end of the previous sentence at the start of the section ("sám. Už zbývá…")
  while (slova.length > 1 && INTERP.test(slova[0])) slova.shift();
  if (slova.length > slov) { slova.length = slov; vic = true; }
  if (!slova.length) return '';
  let text = slova.join(' ');
  text = vic ? text.replace(/[.,!?;:…]+$/, '') + '…' : text.replace(/[,;:]+$/, '');
  return text;
}

/** section label for the player: 'takty 5–8: ‚Večer padá…‘' (with lyrics if any) */
export function nazevUseku(pisen, od, dok) {
  const r = rozvinuta(pisen);
  return nazevZRozvinute(r, od, dok);
}
function nazevZRozvinute(r, od, dok) {
  const text = zacatekTextu(r.takty, od, dok);
  const cisla = popisCisel(r.poradi, od, dok);
  return text ? t('cviceni.usekSTextem', { cisla, text }) : cisla;
}

// ---------------------------------------------------------------- bar length check in the app language
/** just the problem description without the bar number ('součet délek 3/8 místo 3/4' / 'note lengths add up to 3/8 instead of 3/4') */
export function popisKontroly(p) {
  return t('cviceni.kontrola.' + p.druh, p);
}
/** item from kontrolaPolozky() → 'takt 5 (levá ruka): …' / 'bar 5 (left hand): …' */
export function textKontroly(p) {
  return t(p.leva ? 'cviceni.kontrola.taktLeva' : 'cviceni.kontrola.takt', { takt: p.takt, zprava: popisKontroly(p) });
}
/** like kontrola() from song.js, but in the app language (in Czech identical to kontrola()) */
export function kontrolaTexty(pisen) {
  return kontrolaPolozky(pisen).map(textKontroly);
}

// ---------------------------------------------------------------- phrases
const CENA_DELKY = { 1: 20, 2: 0.8, 3: 1.2, 4: 0 };

/** cost of a phrase ending after bar i (0 = clear boundary, 5 = no sign of an ending) */
function cenaKonce(takty, poradi, i, met) {
  if (i === takty.length - 1) return 0;
  const noty = takty[i].noty || [];
  const posledniZnejici = [...noty].reverse().find(n => n.t !== 'r');
  if (noty.length && noty[noty.length - 1].t !== 'r' && noty[noty.length - 1].lig) return 8;   // tie across the barline
  // rest ≥ a quarter inside / at the end of the bar, or at the start of the next bar
  const behyPomlk = noty2 => {
    const out = [];
    let pos = 0, beh = null;
    for (const n of noty2 || []) {
      const q = zlomek(n.d) || 0;
      if (n.t === 'r') { if (beh) beh.delka += q; else beh = { od: pos, delka: q }; } else if (beh) { out.push(beh); beh = null; }
      pos += q;
    }
    if (beh) out.push(beh);
    return out;
  };
  if (behyPomlk(noty).some(b => b.delka >= 1 - 1e-6 && (b.od > 1e-6 || b.delka >= met.delka - 1e-6))) return 0;
  const dalsiBehy = behyPomlk(takty[i + 1].noty);
  if (dalsiBehy.some(b => b.od < 1e-6 && b.delka >= 1 - 1e-6)) return 0;
  // syllable with punctuation
  const slabiky = noty.map(n => String(n.s || '').trim()).filter(Boolean);
  if (slabiky.some(s => INTERP.test(s.replace(/-+$/, '')) && !s.endsWith('-'))) return 0;
  // long note at the end of the bar (also with a tie inside the bar)
  let k = noty.length - 1;
  while (k >= 0 && noty[k].t === 'r') k--;                      // short rest at the end (≥ a quarter already handled)
  let delkaKonce = k >= 0 ? zlomek(noty[k].d) || 0 : 0;
  for (let j = k - 1; j >= 0 && noty[j].t !== 'r' && noty[j].lig; j--) delkaKonce += zlomek(noty[j].d) || 0;
  if (delkaKonce >= Math.max(1.5, met.delka / 2) - 1e-6) return 0;
  // jump in play order (end of a repeat, volta)
  if (poradi.length > i + 1 && poradi[i + 1] !== poradi[i] + 1) return 0.5;
  const posledniSlabika = slabiky[slabiky.length - 1];
  const dlouhaPosledni = posledniZnejici && (zlomek(posledniZnejici.d) || 0) >= 1 - 1e-6
    && noty.indexOf(posledniZnejici) >= noty.length - 2;
  if (dlouhaPosledni && posledniSlabika && !posledniSlabika.endsWith('-')) return 2.5;
  if (dlouhaPosledni) return 3.5;
  return 5;
}

/**
 * Splits the (expanded) song into phrases of 2–4 bars.
 * Phrase end: rest ≥ a quarter, syllable ending in . , ! ? ; :, long note at the end of a bar, end of a repeat; a
 * phrase never ends across a tie. A short pickup does not count towards the length. Boundaries are chosen by dynamic
 * programming (smallest sum of ending and length costs), so longer sections get split and shorter ones merged.
 * @returns {{od:number, do:number, nazev:string}[]} bar indexes of the expanded song (inclusive), nazev
 *   e.g. 'takty 5–8: ‚Večer padá…‘'
 */
export function fraze(pisen) {
  const r = rozvinuta(pisen);
  const n = r.takty.length;
  if (!n) return [];
  const met = metrum(r.takt);
  const kratkyPrvni = n > 1 && soucetTaktu(r.takty[0].noty) < met.delka - 1e-6;
  const ceny = r.takty.map((_, i) => cenaKonce(r.takty, r.poradi, i, met));
  const best = new Array(n + 1).fill(Infinity), odkud = new Array(n + 1).fill(-1);
  best[0] = 0;                                         // best[k] = best split of the first k bars
  for (let e = 1; e <= n; e++) {
    for (let delka = 1; delka <= 5 && delka <= e; delka++) {
      const s = e - delka;
      const ef = delka - (s === 0 && kratkyPrvni && delka > 1 ? 1 : 0);
      if (ef < 1 || ef > 4 || best[s] === Infinity) continue;
      const c = best[s] + ceny[e - 1] + CENA_DELKY[ef];
      if (c < best[e] - 1e-9) { best[e] = c; odkud[e] = s; }
    }
  }
  const out = [];
  for (let e = n; e > 0; e = odkud[e]) out.unshift({ od: odkud[e], do: e - 1 });
  return out.map(f => ({ ...f, nazev: nazevZRozvinute(r, f.od, f.do) }));
}

// ---------------------------------------------------------------- attempt record and summary
/**
 * ATTEMPT RECORD (filled in by the app while playing; all ms are in song time = ms at 100 % tempo):
 * @typedef {Object} ZaznamPokusu
 * @property {'cekam'|'tempo'} rezim       Step by step / In rhythm (timing is not scored for 'cekam')
 * @property {number} rychlost             speed in % (40–100)
 * @property {number} od                   first bar of the section (expanded song index)
 * @property {number} do                   last bar of the section (inclusive)
 * @property {'prava'|'leva'|'obe'} [ruka] which hand was played
 * @property {number} [dobaMs]             length of a quarter beat at 100 % (= 60000 / tempo); estimated if missing
 * @property {number} [predznamenani]      for spelling note names (negative = flats)
 * @property {Array<{takt:number, index:number, pitch:number, ocekavanoMs:number, zahranoMs:(number|null),
 *   vysledek:('ok'|'vedle'|'vynechana'), odchylkaMs:(number|null), drzenoMs:(number|null),
 *   ocekavanaDelkaMs:number}>} noty
 *   index = game step order (notes with the same index sound together); odchylkaMs = zahranoMs − ocekavanoMs
 *   (negative = early; computed if missing); drzenoMs = how long the key was held (null = not measured);
 *   vysledek: 'ok' hit, 'vedle' = a wrong key was pressed while waiting for the note (Step by step) / a different
 *   pitch was played, 'vynechana' = not played in time (In rhythm)
 * @property {Array<{pitch:number, ms:number, takt:number, index?:number, nota?:string}>} chybneStisky
 *   presses that belonged to no note; index = the step being waited for (recommended for 'cekam',
 *   otherwise the nearest note by time in the given bar is looked up); nota = id of the note the press belongs to
 *   (lib/mistakes.js notaProChybu, for Show mistakes)
 */

/** finds the expected note for a wrong press (step by index, otherwise nearest in time within the same bar) */
function ocekavanaNota(noty, st) {
  let kandidati = st.index != null ? noty.filter(n => n.index === st.index) : [];
  if (!kandidati.length) {
    const vTaktu = noty.filter(n => n.takt === st.takt);
    const zdroj = vTaktu.length ? vTaktu : noty;
    if (!zdroj.length) return null;
    const nej = Math.min(...zdroj.map(n => Math.abs(n.ocekavanoMs - st.ms)));
    kandidati = zdroj.filter(n => Math.abs(n.ocekavanoMs - st.ms) <= nej + 1);
  }
  return kandidati.reduce((a, n) => (!a || Math.abs(n.pitch - st.pitch) < Math.abs(a.pitch - st.pitch) ? n : a), null);
}

/** estimate of the quarter-beat length (ms at 100 %) when the record doesn't give it */
function odhadDoby(zaznam) {
  if (zaznam.dobaMs > 0) return zaznam.dobaMs;
  if (zaznam.tempo > 0) return 60000 / zaznam.tempo;
  return median(zaznam.noty.map(n => n.ocekavanaDelkaMs).filter(x => x > 0)) || 500;
}

/**
 * Summary of one attempt.
 * presnost = ok / (number of notes + wrong presses not explained by a 'vedle' note), 0–1.
 * cisty = no note missed or wrong and accuracy ≥ 95 %.
 * prumernaOdchylkaMs = average absolute onset deviation in real ms (only 'tempo', otherwise null),
 * prumernyPosunMs = signed average (negative = early), spech 'brzy'|'pozde'|'presne' (null for 'cekam').
 * takty[i] = { chyby, noty, odchylka (average shift, real ms | null), tony (confused pitches), vynechane }.
 * nejhorsiTakty = [{ takt, chyby, noty, druh: 'tony'|'vynechane' }] (at most 3).
 * vzorce = deterministically found causes: [{ typ: 'pulton'|'skok'|'spech'|'drzeni', klic, pocet, takty, popis, … }]
 */
export function souhrnPokusu(zaznam) {
  const noty = (zaznam.noty || []).map(n => ({
    ...n,
    odchylkaMs: n.odchylkaMs ?? (n.zahranoMs != null && n.ocekavanoMs != null ? n.zahranoMs - n.ocekavanoMs : null),
  }));
  const stisky = zaznam.chybneStisky || [];
  const sp = Math.max(0.05, (Number(zaznam.rychlost) || 100) / 100);
  const vRytmu = zaznam.rezim === 'tempo';
  const becka = (zaznam.predznamenani ?? 0) < 0;
  const ok = noty.filter(n => n.vysledek === 'ok').length;
  const vedle = noty.filter(n => n.vysledek === 'vedle').length;
  const vynechane = noty.filter(n => n.vysledek === 'vynechana').length;
  const navic = Math.max(0, stisky.length - vedle);
  const presnost = noty.length ? ok / (noty.length + navic) : (stisky.length ? 0 : 1);

  // timing (In rhythm only, hit notes only), real ms
  const posun = n => n.odchylkaMs / sp;
  const merene = vRytmu ? noty.filter(n => n.vysledek === 'ok' && n.odchylkaMs != null) : [];
  const prumPosun = merene.length >= 3 ? prumer(merene.map(posun)) : null;
  const prumAbs = merene.length ? prumer(merene.map(n => Math.abs(posun(n)))) : null;
  const spech = !vRytmu ? null : prumPosun == null ? 'presne'
    : prumPosun < -PRAH_SPECH_MS ? 'brzy' : prumPosun > PRAH_SPECH_MS ? 'pozde' : 'presne';

  // per bar
  const takty = {};
  const T = i => (takty[i] ||= { chyby: 0, noty: 0, odchylka: null, tony: 0, vynechane: 0, _p: [] });
  for (const n of noty) {
    const t = T(n.takt);
    t.noty++;
    if (n.vysledek === 'vedle') { t.chyby++; t.tony++; }
    if (n.vysledek === 'vynechana') { t.chyby++; t.vynechane++; }
    if (merene.includes(n)) t._p.push(posun(n));
  }
  const vedlePoTaktech = {};
  for (const n of noty) if (n.vysledek === 'vedle') vedlePoTaktech[n.takt] = (vedlePoTaktech[n.takt] || 0) + 1;
  const stiskyPoTaktech = {};
  for (const s of stisky) stiskyPoTaktech[s.takt] = (stiskyPoTaktech[s.takt] || 0) + 1;
  for (const [k, pocet] of Object.entries(stiskyPoTaktech)) {
    const navicT = Math.max(0, pocet - (vedlePoTaktech[k] || 0));
    if (navicT) { const t = T(Number(k)); t.chyby += navicT; t.tony += navicT; }
  }
  for (const t of Object.values(takty)) { t.odchylka = t._p.length ? zaokr(prumer(t._p)) : null; delete t._p; }
  const nejhorsiTakty = Object.entries(takty).filter(([, t]) => t.chyby > 0)
    .map(([k, t]) => ({ takt: Number(k), chyby: t.chyby, noty: t.noty, druh: t.vynechane > t.tony ? 'vynechane' : 'tony' }))
    .sort((a, b) => b.chyby - a.chyby || b.chyby / Math.max(1, b.noty) - a.chyby / Math.max(1, a.noty) || a.takt - b.takt)
    .slice(0, 3);

  return {
    rezim: zaznam.rezim, ...(zaznam.krok ? { krok: zaznam.krok } : {}), rychlost: Number(zaznam.rychlost) || 100, od: zaznam.od, do: zaznam.do,
    ruka: zaznam.ruka || null,
    pocetNot: noty.length, ok, vedle, vynechane, chybnychStisku: stisky.length,
    presnost: zaokr(presnost, 3), cisty: vedle === 0 && vynechane === 0 && presnost >= 0.95 && noty.length > 0,
    prumernaOdchylkaMs: zaokr(prumAbs), prumernyPosunMs: zaokr(prumPosun), spech,
    takty, nejhorsiTakty,
    vzorce: najdiVzorce(noty, stisky, { sp, vRytmu, becka, doba: odhadDoby({ ...zaznam, noty }) }),
  };
}

const unikatni = a => [...new Set(a)].sort((x, y) => x - y);

function najdiVzorce(noty, stisky, { sp, vRytmu, becka, doba }) {
  const out = [];
  // 1) note a semitone off, the same pair repeatedly (F instead of F♯ → forgets the sharp)
  const pultony = {};
  for (const st of stisky) {
    const o = ocekavanaNota(noty, st);
    if (!o || Math.abs(o.pitch - st.pitch) !== 1) continue;
    const k = `${((o.pitch % 12) + 12) % 12}>${((st.pitch % 12) + 12) % 12}`;
    (pultony[k] ||= { o, z: st.pitch, takty: [], pocet: 0 });
    pultony[k].pocet++;
    pultony[k].takty.push(st.takt ?? o.takt);
  }
  for (const [k, p] of Object.entries(pultony)) {
    if (p.pocet < 2) continue;
    const opc = ((p.o.pitch % 12) + 12) % 12;
    const druh = CERNE.has(opc) && p.z < p.o.pitch ? 'krizek' : CERNE.has(opc) && p.z > p.o.pitch ? 'becko' : 'pulton';
    // spelling: sharp → expected note with a sharp; flat → with a flat; otherwise by key signature
    const bk = druh === 'becko' ? true : druh === 'krizek' ? false : becka;
    const ocekavano = jmenoTonu(p.o.pitch, bk), zahrano = jmenoTonu(p.z, bk);
    out.push({
      typ: 'pulton', klic: 'pulton:' + k, druh, pocet: p.pocet, takty: unikatni(p.takty), ocekavano, zahrano,
      popis: t('cviceni.vzorec.' + druh, { zahrano, ocekavano }),
    });
  }
  // 2) missed / wrong note after a leap (≥ 5 semitones from the previous step)
  const kroky = new Map();
  for (const n of noty) { if (!kroky.has(n.index)) kroky.set(n.index, []); kroky.get(n.index).push(n); }
  const poradiKroku = [...kroky.keys()].sort((a, b) => a - b);
  const poSkoku = [];
  poradiKroku.forEach((ix, j) => {
    if (!j) return;
    const pred = kroky.get(poradiKroku[j - 1]);
    for (const n of kroky.get(ix)) {
      if (n.vysledek === 'ok') continue;
      const skok = Math.min(...pred.map(p => Math.abs(p.pitch - n.pitch)));
      if (skok >= 5) poSkoku.push(n);
    }
  });
  if (poSkoku.length >= 2) {
    out.push({ typ: 'skok', klic: 'skok', pocet: poSkoku.length, takty: unikatni(poSkoku.map(n => n.takt)),
      popis: t('cviceni.vzorec.skok') });
  }
  // 3) systematic rushing on eighths (and shorter notes)
  if (vRytmu) {
    const merene = noty.filter(n => n.vysledek === 'ok' && n.odchylkaMs != null);
    const kratke = merene.filter(n => n.ocekavanaDelkaMs <= 0.55 * doba && n.ocekavanaDelkaMs >= 0.2 * doba);
    const ostatni = merene.filter(n => !kratke.includes(n));
    if (kratke.length >= 4) {
      const pk = prumer(kratke.map(n => n.odchylkaMs / sp));
      const podilBrzy = kratke.filter(n => n.odchylkaMs < 0).length / kratke.length;
      const po = ostatni.length >= 3 ? prumer(ostatni.map(n => n.odchylkaMs / sp)) : null;
      if (pk <= -35 && podilBrzy >= 0.7 && (po == null || pk < po - 20)) {
        out.push({ typ: 'spech', klic: 'spech', pocet: kratke.length, takty: unikatni(kratke.map(n => n.takt)),
          posunMs: zaokr(pk), popis: t('cviceni.vzorec.spech', { ms: Math.round(-pk) }) });
      }
    }
  }
  // 4) long notes held too short (< 60 % of their length)
  const dlouhe = noty.filter(n => n.drzenoMs != null && n.vysledek !== 'vynechana' && n.ocekavanaDelkaMs >= 1.9 * doba);
  const kratce = dlouhe.filter(n => n.drzenoMs < 0.6 * n.ocekavanaDelkaMs);
  if (kratce.length >= 2 && kratce.length >= dlouhe.length / 2) {
    const proc = Math.round(100 * prumer(kratce.map(n => n.drzenoMs / n.ocekavanaDelkaMs)));
    out.push({ typ: 'drzeni', klic: 'drzeni', pocet: kratce.length, takty: unikatni(kratce.map(n => n.takt)),
      drzenoProcent: proc, popis: t('cviceni.vzorec.drzeni', { proc }) });
  }
  return out;
}

// ---------------------------------------------------------------- song statistics
/**
 * Merges an attempt summary into the player's song statistics (plain JSON, storable). Older data fades: bars played
 * in the new attempt ×0.8 and everything with a 30-day half-life. Structure:
 * { verze: 1, pokusu, posledni: ms, takty: { [takt]: { noty, chyby, tony, vynechane, posun, mereno } },
 *   vzorce: { [klic]: { typ, vaha, takty, popis, ocekavano?, zahrano? } },
 *   historie: [{ kdy, rezim, rychlost, od, do, presnost, cisty, spech }] (last 30) }
 * takty[i].posun / mereno = average onset shift (real ms). kdy = Date | ms | ISO string.
 */
export function slucStatistiky(stare, souhrn, kdy) {
  const st = stare && stare.verze === 1 ? JSON.parse(JSON.stringify(stare))
    : { verze: 1, pokusu: 0, posledni: null, takty: {}, vzorce: {}, historie: [] };
  let ted = kdy instanceof Date ? kdy.getTime() : typeof kdy === 'number' ? kdy : Date.parse(kdy);
  if (!Number.isFinite(ted)) ted = st.posledni ?? 0;
  const dnu = st.posledni != null ? Math.max(0, (ted - st.posledni) / 86400000) : 0;
  const fCas = 0.5 ** (dnu / POLOCAS_DNU);
  const tlum = (o, f) => { for (const k of ['noty', 'chyby', 'tony', 'vynechane', 'posun', 'mereno']) o[k] = (o[k] || 0) * f; };
  for (const t of Object.values(st.takty)) tlum(t, fCas);
  for (const [k, v] of Object.entries(st.vzorce)) {
    v.vaha *= fCas * UTLUM_POKUS;
    if (v.vaha < 0.1) delete st.vzorce[k];
  }
  for (const [k, s] of Object.entries(souhrn.takty || {})) {
    const t = (st.takty[k] ||= { noty: 0, chyby: 0, tony: 0, vynechane: 0, posun: 0, mereno: 0 });
    tlum(t, UTLUM_POKUS);
    t.noty += s.noty; t.chyby += s.chyby; t.tony += s.tony || 0; t.vynechane += s.vynechane || 0;
    if (s.odchylka != null) { t.posun += s.odchylka * s.noty; t.mereno += s.noty; }
  }
  for (const t of Object.values(st.takty)) for (const k of Object.keys(t)) t[k] = zaokr(t[k], 3);
  for (const v of souhrn.vzorce || []) {
    const o = (st.vzorce[v.klic] ||= { typ: v.typ, vaha: 0, takty: [], popis: v.popis });
    o.vaha = zaokr(o.vaha + 1, 3); o.takty = v.takty; o.popis = v.popis;
    if (v.ocekavano) { o.ocekavano = v.ocekavano; o.zahrano = v.zahrano; }
  }
  st.historie.push({ kdy: ted, rezim: souhrn.rezim, ...(souhrn.krok ? { krok: souhrn.krok } : {}), rychlost: souhrn.rychlost, od: souhrn.od, do: souhrn.do,
    presnost: souhrn.presnost, cisty: souhrn.cisty, spech: souhrn.spech });
  if (st.historie.length > MAX_HISTORIE) st.historie = st.historie.slice(-MAX_HISTORIE);
  st.pokusu++;
  st.posledni = ted;
  return st;
}

/** bar difficulty score from statistics (smoothed mistake ratio + a surcharge for inaccurate rhythm) */
function skoreTaktu(t) {
  if (!t || !t.noty) return 0;
  const rytmus = t.mereno > 0.5 && Math.abs(t.posun / t.mereno) > 80 ? 0.15 : 0;
  return t.chyby / (t.noty + 1) + rytmus;
}
function druhTaktu(t) {
  if (t.chyby >= 0.5) return t.vynechane > t.tony ? 'vynechane' : 'tony';
  return t.mereno > 0.5 && t.posun < 0 ? 'brzy' : 'pozde';
}

/**
 * Hardest spots of the song by statistics: adjacent difficult bars are merged (at most 4), sorted by total score.
 * @returns {{od, do, takty: '5–6', skore, druh: 'tony'|'vynechane'|'brzy'|'pozde', nazev, popis}[]}
 */
export function tezkaMista(statistika, pisen, n = 3) {
  const r = rozvinuta(pisen);
  const st = statistika?.takty || {};
  const tezke = Object.keys(st).map(Number).filter(i => i >= 0 && i < r.takty.length)
    .filter(i => { const s = skoreTaktu(st[i]); return s >= 0.12 && (st[i].chyby >= 0.5 || s >= 0.15); })
    .sort((a, b) => a - b);
  const useky = [];
  for (const i of tezke) {
    const u = useky[useky.length - 1];
    if (u && u.do === i - 1 && i - u.od < 4) u.do = i; else useky.push({ od: i, do: i });
  }
  return useky.map(u => {
    const tk = [];
    for (let i = u.od; i <= u.do; i++) tk.push(st[i]);
    const soucet = { chyby: 0, tony: 0, vynechane: 0, posun: 0, mereno: 0 };
    for (const t of tk) for (const k of Object.keys(soucet)) soucet[k] += t[k] || 0;
    const druh = druhTaktu(soucet);
    const nazev = nazevZRozvinute(r, u.od, u.do);
    return { od: u.od, do: u.do, takty: rozsahCisel(r.poradi, u.od, u.do), skore: zaokr(tk.reduce((a, t) => a + skoreTaktu(t), 0), 3),
      druh, nazev, popis: t('cviceni.tezkeMisto', { nazev, druh: t('cviceni.druh.' + druh) }) };
  }).sort((a, b) => b.skore - a.skore || a.od - b.od).slice(0, n);
}

// ---------------------------------------------------------------- tempo plan
/**
 * Tempo plan for a section loop: 3 clean passes in a row → +5 % (max 100), accuracy < 70 % → −10 % (min 40),
 * otherwise unchanged. stavSmycky = { rychlost, cisteVRade }; returns the new state + { zmena, zprava, hotovo }.
 * hotovo = 3 clean passes at full tempo.
 */
export function dalsiTempo(stavSmycky, souhrn) {
  const r0 = Number(stavSmycky?.rychlost ?? souhrn?.rychlost ?? 70);
  let cisteVRade = (souhrn?.cisty ? (stavSmycky?.cisteVRade || 0) + 1 : 0);
  let rychlost = r0, zmena = 0, zprava, hotovo = false;
  if ((souhrn?.presnost ?? 1) < 0.7) {
    rychlost = Math.max(MIN_RYCHLOST, r0 - 10); zmena = rychlost - r0; cisteVRade = 0;
    zprava = t(zmena ? 'cviceni.tempo.zpomalime' : 'cviceni.tempo.zustaneme', { r: rychlost });
  } else if (cisteVRade >= 3) {
    rychlost = Math.min(MAX_RYCHLOST, r0 + 5); zmena = rychlost - r0; cisteVRade = 0;
    if (zmena) zprava = t('cviceni.tempo.zrychlime', { r: rychlost });
    else { hotovo = true; zprava = t('cviceni.tempo.hotovo'); }
  } else if (souhrn?.cisty) {
    zprava = t('cviceni.tempo.cisty', { n: cisteVRade });
  } else zprava = t('cviceni.tempo.znovu', { r: rychlost });
  return { rychlost, cisteVRade, zmena, zprava, hotovo };
}

// ---------------------------------------------------------------- facts for the coach
function vekovePasmo(profil) {
  if (profil?.pasmo === 'dite' || profil?.pasmo === 'dospely') return profil.pasmo;
  if (Number.isFinite(profil?.vek)) return profil.vek < 15 ? 'dite' : 'dospely';
  return 'dite';                                           // the app is mainly for children
}
const stejnyPokus = (h, s) => h && h.rezim === s.rezim && h.rychlost === s.rychlost && h.od === s.od && h.do === s.do
  && h.presnost === s.presnost && h.cisty === s.cisty;

/**
 * Compact facts about an attempt for the coach. No names and no song lyrics.
 * Bar numbers for text are `cislo` / `takty` strings ('5–8'), indexes for the task are `od`/`do`/`index`.
 * statistika may be the state before or after the attempt (an identical last history entry is left out of the trend).
 * profil = { pasmo?: 'dite'|'dospely', vek?: number } (no name); default band 'dite'.
 */
export function faktaProTrenera(souhrn, statistika, pisen, profil) {
  const r = rozvinuta(pisen);
  const C = i => cislo(r.poradi, i);
  const od = Math.max(0, souhrn.od ?? 0), dok = Math.min(r.takty.length - 1, souhrn.do ?? r.takty.length - 1);
  // trend: same mode, overlapping section, previous attempts (at most 3)
  let hist = [...(statistika?.historie || [])];
  if (stejnyPokus(hist[hist.length - 1], souhrn)) hist.pop();
  const predchozi = hist.filter(h => h.rezim === souhrn.rezim && h.od <= dok && h.do >= od).slice(-3);
  const ted = Math.round(100 * (souhrn.presnost ?? 0));
  let trend = null;
  if (predchozi.length) {
    const minule = predchozi.map(h => Math.round(100 * h.presnost));
    const rozdil = Math.round(ted - prumer(minule));
    trend = { predchozi: minule, rozdil, smer: rozdil >= 5 ? 'lepsi' : rozdil <= -5 ? 'horsi' : 'stejne' };
  }
  // bars that used to be hard and are now error-free
  const zlepseneTakty = Object.entries(souhrn.takty || {})
    .filter(([k, t]) => t.chyby === 0 && t.noty > 0 && skoreTaktu(statistika?.takty?.[k]) >= 0.2)
    .map(([k]) => C(Number(k)));
  const tm = tezkaMista(statistika, pisen, 3).filter(u => u.od <= dok && u.do >= od);
  const fr = fraze(pisen);
  const useky = [];
  const pridej = (a, b, proc) => {
    if (a < 0 || b >= r.takty.length || a > b) return;
    if (!useky.some(u => u.od === a && u.do === b)) useky.push({ od: a, do: b, takty: rozsahCisel(r.poradi, a, b), proc });
  };
  for (const u of tm) pridej(u.od, u.do, 'tezke misto');
  for (const t of souhrn.nejhorsiTakty || []) {
    const f = fr.find(x => x.od <= t.takt && x.do >= t.takt);
    if (f) pridej(f.od, f.do, 'fraze s chybou');
  }
  pridej(od, dok, 'cely usek');
  return {
    pasmo: vekovePasmo(profil),
    rezim: souhrn.rezim,
    ruka: souhrn.ruka || 'obe',
    rychlost: souhrn.rychlost,
    usek: { od, do: dok, takty: rozsahCisel(r.poradi, od, dok) },
    presnost: ted,
    cisty: !!souhrn.cisty,
    spech: souhrn.spech ?? null,
    posunMs: souhrn.prumernyPosunMs ?? null,
    nejhorsiTakty: (souhrn.nejhorsiTakty || []).map(t => ({ cislo: C(t.takt), index: t.takt, chyby: t.chyby, druh: t.druh })),
    vzorce: (souhrn.vzorce || []).map(v => {
      const o = { typ: v.typ, pocet: v.pocet, takty: unikatni(v.takty.map(C)), indexy: v.takty };
      if (v.typ === 'pulton') Object.assign(o, { druh: v.druh, ocekavano: v.ocekavano, zahrano: v.zahrano });
      if (v.posunMs != null) o.posunMs = v.posunMs;
      if (v.drzenoProcent != null) o.drzenoProcent = v.drzenoProcent;
      return o;
    }),
    trend,
    zlepseneTakty: unikatni(zlepseneTakty),
    tezkaMista: tm.map(u => ({ od: u.od, do: u.do, takty: u.takty, druh: u.druh })),
    useky,
  };
}

// ---------------------------------------------------------------- template coach
const vTaktech = cisla => {
  const c = unikatni(cisla).slice(0, 3);
  if (c.length === 1) return t('cviceni.vTaktu', { c: c[0] });
  return t('cviceni.vTaktech', { seznam: c.slice(0, -1).join(', '), posledni: c[c.length - 1] });
};
const velkym = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** main problem of the attempt (priority order: semitone off, leap, rushing on eighths, holding, worst bar, rhythm) */
function hlavniProblem(f) {
  const v = typ => f.vzorce.find(x => x.typ === typ);
  if (v('pulton')) return { druh: 'pulton', v: v('pulton') };
  if (v('skok')) return { druh: 'skok', v: v('skok') };
  if (v('spech')) return { druh: 'spech', v: v('spech') };
  if (v('drzeni')) return { druh: 'drzeni', v: v('drzeni') };
  if (f.nejhorsiTakty.length) return { druh: 'takt', t: f.nejhorsiTakty[0] };
  if (f.spech === 'brzy' || f.spech === 'pozde') return { druh: 'rytmus' };
  return null;
}

function vetaProblemu(p, f) {
  const k = 'cviceni.trener.' + (f.pasmo === 'dite' ? 'dite.' : 'dospely.');
  switch (p.druh) {
    case 'pulton': {
      const { ocekavano: o, zahrano: z, druh } = p.v, kde = vTaktech(p.v.takty);
      return t(k + 'pulton.' + (druh === 'krizek' || druh === 'becko' ? druh : 'pulton'), { Kde: velkym(kde), kde, z, o });
    }
    case 'skok': {
      const kde = vTaktech(p.v.takty);
      return t(k + 'skok', { kde, Kde: velkym(kde) });
    }
    case 'spech':
      return t(k + 'spech', { ms: Math.round(-p.v.posunMs) });
    case 'drzeni': {
      const kde = vTaktech(p.v.takty);
      return t(k + 'drzeni', { kde, Kde: velkym(kde), proc: p.v.drzenoProcent });
    }
    case 'takt':
      return t(k + 'takt.' + (p.t.druh === 'vynechane' ? 'vynechane' : 'tony'), { c: p.t.cislo, chyby: p.t.chyby, n: p.t.chyby });
    case 'rytmus': {
      const ms = Math.round(Math.abs(f.posunMs || 0));
      return t(k + (f.spech === 'brzy' ? 'brzy' : 'pozde'), { ms });
    }
  }
  return '';
}

/**
 * Coach: 1–2 sentences in the app language (specific, praise only for improvement, no superlatives) and one task.
 * @returns {{veta: string, ukol: {od, do, rychlost, ruka: 'prava'|'leva'|'obe', opakovani} | null}}
 */
export function textTrenera(fakta) {
  const f = fakta, dite = f.pasmo === 'dite';
  const k = 'cviceni.trener.' + (dite ? 'dite.' : 'dospely.');
  const vety = [];
  // praise only for improvement
  if (f.zlepseneTakty?.length) {
    const c = f.zlepseneTakty.slice(0, 2);
    vety.push(c.length === 1 ? t(k + 'zlepsenyTakt', { a: c[0] }) : t(k + 'zlepseneTakty', { a: c[0], b: c[1] }));
  } else if (f.trend?.smer === 'lepsi') {
    vety.push(t(k + 'lepsi', { r: f.trend.rozdil, n: f.trend.rozdil }));
  }
  const p = f.cisty ? null : hlavniProblem(f);
  if (p) vety.push(vetaProblemu(p, f));
  else if (f.cisty) {
    vety.push(f.rychlost >= 100 ? t(k + 'cistyPlne') : t(k + 'cisty', { r: f.rychlost }));
  } else if (f.presnost < 70) {
    vety.push(t(k + 'tezke', { p: f.presnost }));
  } else vety.push(t(k + 'presnost', { p: f.presnost }));

  // task
  let ukol = null;
  if (!(f.cisty && f.rychlost >= 100)) {
    const cil = p?.v?.indexy?.[0] ?? p?.t?.index;
    const u = (cil != null && f.useky.find(x => x.od <= cil && x.do >= cil && x.proc !== 'cely usek'))
      || (cil != null && f.useky.find(x => x.od <= cil && x.do >= cil)) || f.usek;
    const mensi = u.do - u.od < f.usek.do - f.usek.od;
    const zpomal = f.presnost < 70 || (mensi && p);
    ukol = {
      od: u.od, do: u.do,
      rychlost: zpomal ? Math.max(MIN_RYCHLOST, f.rychlost - 10) : f.rychlost,
      ruka: ['prava', 'leva', 'obe'].includes(f.ruka) ? f.ruka : 'obe',
      opakovani: f.cisty ? 3 : dite ? 3 : 5,
    };
  }
  return { veta: vety.slice(0, 2).join(' '), ukol };
}

/** errors of the text notation (polozky from zTextu in notation.js) in the app's language */
export function textChybZapisu(polozky) {
  return (polozky || []).map(p => t(`cviceni.zapis.${p.druh}`, { ...p, leva: p.leva ? t('cviceni.zapis.levaRuka') : '' }));
}
