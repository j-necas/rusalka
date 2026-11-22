// Statistics for a parent, from what Rusalka already stores per player: `statistiky` ({ 'file#level': { historie, takty } })
// and `vysledky` ({ file: { cekam|pockej|tempo: { hvezdy } } }). Three questions: practising regularly? improving? stuck where?
import { umim, doporuceni, nejrychlejsiCisty } from './recommend.js';

export const MAX_HISTORIE = 30;

const pulnoc = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const denKlic = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const denZpet = (t, n) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n).getTime(); };   // midnight n days back (DST-safe)

/** the practice diary, one entry a day per player: 'YYYY-MM-DD' → [plays, sum of accuracy, attempts with accuracy];
 *  unlike the song history (last 30 per song) it keeps every day. Returns a new object. */
export function zapisDoDeniku(denik, kdy, presnost) {
  const k = denKlic(kdy), [n, s, c] = denik?.[k] || [0, 0, 0], ma = typeof presnost === 'number';
  return { ...denik, [k]: [n + 1, Math.round((s + (ma ? presnost : 0)) * 1000) / 1000, c + (ma ? 1 : 0)] };
}
const pisenZKlice = k => k.slice(0, k.lastIndexOf('#') < 0 ? k.length : k.lastIndexOf('#'));

/** every attempt of a player with its song (the file without '#level') */
export function pokusyHrace(stat) {
  return Object.entries(stat || {}).flatMap(([k, z]) => (z?.historie || []).map(h => ({ ...h, pisen: pisenZKlice(k) })));
}

/** last 12 weeks (Monday first), one entry a day: n plays, level 0 (none) / 1 (1–2) / 2 (3–5) / 3 (6+); plus this week
 *  (Monday to today). Plays a day = the bigger of the diary and the song history (days before the diary existed). */
export function kalendar(pokusy, ted = Date.now(), denik = {}) {
  const dnes = pulnoc(ted), poDnech = new Map();
  for (const h of pokusy) poDnech.set(denKlic(h.kdy), (poDnech.get(denKlic(h.kdy)) || 0) + 1);
  for (const [k, [n]] of Object.entries(denik || {})) poDnech.set(k, Math.max(n, poDnech.get(k) || 0));
  const den0 = new Date(dnes), pondeli = new Date(den0.getFullYear(), den0.getMonth(), den0.getDate() - ((den0.getDay() + 6) % 7));
  const tydny = [];
  for (let w = 0; w < 12; w++) {
    const tyden = [];
    for (let r = 0; r < 7; r++) {
      const t = new Date(pondeli.getFullYear(), pondeli.getMonth(), pondeli.getDate() - (11 - w) * 7 + r).getTime();
      const n = poDnech.get(denKlic(t)) || 0;
      tyden.push({ t, n, uroven: n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : 3, budouci: t > dnes, dnes: t === dnes });
    }
    tydny.push(tyden);
  }
  const tento = tydny[11].filter(d => !d.budouci && d.n);
  return { tydny, tyden: { dny: tento.length, zahrani: tento.reduce((a, d) => a + d.n, 0) } };
}

/** mean accuracy (0–1) per day over the last `dni` days, oldest first; a day in the diary uses the diary (all plays) */
export function presnostPoDnech(pokusy, ted = Date.now(), dni = 30, denik = {}) {
  const od = denZpet(ted, dni - 1), dny = new Map();
  for (const h of pokusy) {
    if (!(h.kdy >= od && h.kdy <= ted) || typeof h.presnost !== 'number') continue;
    const k = pulnoc(h.kdy), d = dny.get(k) || { s: 0, n: 0, c: 0 };
    d.s += h.presnost; d.n++; d.c++; dny.set(k, d);
  }
  for (const [klic, [n, s, c]] of Object.entries(denik || {})) {
    const [r, m, d] = klic.split('-').map(Number), t = new Date(r, m - 1, d).getTime();
    if (t >= od && t <= ted && c > 0) dny.set(t, { s, n, c });
  }
  return [...dny].sort((a, b) => a[0] - b[0]).map(([t, d]) => ({ t, v: Math.round(d.s / d.c * 1000) / 1000, n: d.n }));
}

/** songs by last play: stars of the three steps and what comes next (as on Home: a step is done with 3 stars) */
export function stavPisni(stat, vys) {
  const posledni = new Map();
  for (const h of pokusyHrace(stat)) posledni.set(h.pisen, Math.max(posledni.get(h.pisen) || 0, h.kdy));
  const soubory = [...new Set([...posledni.keys(), ...Object.keys(vys || {})])];
  return soubory.map(soubor => {
    const v = vys?.[soubor] || {};
    const stav = umim(v, stat, soubor) ? { druh: 'naucena' }
      : { druh: 'krok', krok: doporuceni(v, stat, soubor).krok, rychlost: nejrychlejsiCisty(stat, soubor) };
    return { soubor, hvezdy: ['cekam', 'pockej', 'tempo'].map(k => v[k]?.hvezdy || 0), stav, posledni: posledni.get(soubor) || 0 };
  }).sort((a, b) => b.posledni - a.posledni);
}

/** where it gets stuck: bars with ≥ 3 notes and ≥ 15 % mistakes, neighbouring bars joined, the worst `max` places */
export function mistaKdeDrhne(stat, max = 3) {
  const mista = [];
  for (const [k, z] of Object.entries(stat || {})) {
    const soubor = pisenZKlice(k), uroven = Number(k.slice(k.lastIndexOf('#') + 1)) || null;
    const spatne = Object.entries(z?.takty || {}).map(([n, t]) => ({ n: Number(n), noty: t.noty || 0, chyby: t.chyby || 0 }))
      .filter(t => t.noty >= 3 && t.chyby / t.noty >= 0.15).sort((a, b) => a.n - b.n);
    let m = null;
    for (const t of spatne) {
      if (m && t.n === m.do + 1) { m.do = t.n; m.noty += t.noty; m.chyby += t.chyby; continue; }
      m = { soubor, uroven, od: t.n, do: t.n, noty: t.noty, chyby: t.chyby }; mista.push(m);
    }
  }
  return mista.map(({ noty, chyby, ...m }) => ({ ...m, podil: chyby / noty })).sort((a, b) => b.podil - a.podil).slice(0, max);
}

// ---------------------------------------------------------------- backup reminder on Home
/** the earliest day anyone played (diary of every player and the song histories); null = nobody has played yet */
export function prvniHrani(denik, statistiky) {
  const dny = Object.values(denik || {}).flatMap(d => Object.keys(d || {}))
    .map(k => { const [r, m, d] = k.split('-').map(Number); return new Date(r, m - 1, d).getTime(); });
  const pokusy = Object.values(statistiky || {}).flatMap(s => pokusyHrace(s).map(h => h.kdy));
  const vse = [...dny, ...pokusy].filter(Number.isFinite);
  return vse.length ? Math.min(...vse) : null;
}
/**
 * Remind on Home to download a backup: the data are only in this browser (no folder), someone has been playing for a week
 * and the last backup is missing or older than 30 days. "Later" (odlozeno) silences it for 14 days.
 */
export function pripomenoutZalohu({ slozka, posledniZaloha, odlozeno, prvni, ted = Date.now() }) {
  const den = 864e5;
  if (slozka || prvni == null || ted - prvni < 7 * den) return false;
  if (odlozeno && ted - odlozeno < 14 * den) return false;
  return !posledniZaloha || ted - posledniZaloha >= 30 * den;
}
