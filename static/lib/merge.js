// Merging data when the file in the folder changed elsewhere meanwhile (another tab, another computer, iCloud).
// Rules: results – for numbers the maximum (stars, percentages, counts), otherwise ours; statistics – the newer attempt;
// profiles – union by id (our version wins); favourites and hidden – union; library songs removed from home – the later
// time per player and song; diary – the fuller entry per day; everything else – ours.
// A deleted player stays deleted (record { id, smazano }). With a snapshot, unrelated writes retain removals.

import { MAX_HISTORIE } from './stats.js';

const jeObjekt = x => x && typeof x === 'object' && !Array.isArray(x);
const vlastni = (o, k) => o && Object.hasOwn(o, k) ? o[k] : undefined;

/** deep merge: numbers take the maximum, objects key by key, otherwise our value */
function maxSlouceni(jejich, nase) {
  if (typeof jejich === 'number' && typeof nase === 'number') return Math.max(jejich, nase);
  if (jeObjekt(jejich) && jeObjekt(nase)) {
    return { ...jejich, ...Object.fromEntries(Object.entries(nase).map(([k, v]) => [k, maxSlouceni(vlastni(jejich, k), v)])) };
  }
  return nase === undefined ? jejich : nase;
}

function slucStatistiku(a, b) {
  const nova = (b.posledni ?? 0) >= (a.posledni ?? 0) ? b : a;
  if (!a.historie && !b.historie) return nova;
  const historie = new Map([...(a.historie || []), ...(b.historie || [])].map(h => [h.kdy, h]));
  return { ...nova, historie: [...historie.values()].sort((x, y) => x.kdy - y.kdy).slice(-MAX_HISTORIE) };
}
const slucDen = (a, b) => b[0] >= a[0] ? b : a;

function poHracich(jejich, nase, slucPolozku) {
  return { ...jejich, ...Object.fromEntries(Object.entries(nase).map(([pid, b]) => {
    const a = vlastni(jejich, pid);
    return [pid, { ...a, ...Object.fromEntries(Object.entries(b).map(([k, v]) => {
      const p = vlastni(a, k);
      return [k, p == null || v == null ? v : slucPolozku(p, v)];
    })) }];
  })) };
}

const sjednot = (a, b) => [...new Set([...(a || []), ...(b || [])])];

export function sluc(klic, jejich, nase) {
  if (jejich == null) return nase;
  if (nase == null) return jejich;
  switch (klic) {
    case 'vysledky': return maxSlouceni(jejich, nase);
    case 'statistiky': return poHracich(jejich, nase, slucStatistiku);
    case 'denik': return poHracich(jejich, nase, slucDen);
    case 'profily': {
      // a deleted player ({ id, smazano }) stays deleted, whichever side the deletion is on
      const smazani = new Map([...jejich, ...nase].filter(p => p.smazano).map(p => [p.id, p]));
      const nasi = new Map(nase.map(p => [p.id, p]));
      return [...nase, ...jejich.filter(p => !nasi.has(p.id))].map(p => smazani.get(p.id) || p);
    }
    case 'oblibene': {
      return { ...jejich, ...Object.fromEntries(Object.entries(nase).map(([pid, s]) => [pid, sjednot(vlastni(jejich, pid), s)])) };
    }
    case 'skryte': return sjednot(jejich, nase);
    case 'knihovnaSkryte': return maxSlouceni(jejich, nase);   // { [pid]: { [soubor]: ms } }
    case 'nastaveni': return { ...jejich, ...nase };            // { [pid]: settings }: ours per player, the others kept
    default: return nase;
  }
}

/** Compare JSON data, including when the keys of an object have moved. */
export function stejnaData(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const klice = Object.keys(a);
  return klice.length === Object.keys(b).length && klice.every(k => Object.hasOwn(b, k) && stejnaData(a[k], b[k]));
}

/** Apply just the edits since the caller's snapshot to the current data. */
export function slucZmeny(klic, jejich, nase, zaklad, { prenos = false } = {}) {
  if (klic === 'profil') return nase;
  if (zaklad === undefined) return sluc(klic, jejich, nase);
  function zmeny(a, b, puvodni, hloubka) {
    if (klic === 'profily' && hloubka === 1 && (a?.smazano || b?.smazano)) {
      return (a?.smazano || 0) > (b?.smazano || 0) ? a : b;
    }
    if (stejnaData(b, puvodni)) return a;
    if ((klic !== 'profily' || hloubka !== 0) && stejnaData(a, puvodni)) return b;
    if (b == null) return b;
    if (a == null) return b;
    if (klic === 'statistiky' && hloubka === 2) return slucStatistiku(a, b);
    if (klic === 'denik' && hloubka === 2) {
      const [n, s, c] = puvodni || [0, 0, 0];
      // In the same store we know the shared count. Copying between stores can be retried.
      if (!prenos && a[0] > n && b[0] > n) return [a[0] + b[0] - n, Math.round((a[1] + b[1] - s) * 1000) / 1000, a[2] + b[2] - c];
      return slucDen(a, b);
    }
    if (klic === 'profily' && hloubka === 0) {
      const podleId = profily => Object.fromEntries((profily || []).map(p => [p.id, p]));
      return Object.values(podleKlicu(podleId(a), podleId(b), podleId(puvodni), hloubka));
    }
    if (Array.isArray(a) && Array.isArray(b) && ['oblibene', 'skryte'].includes(klic)) {
      const p = puvodni || [];
      return sjednot(a.filter(x => !p.includes(x) || b.includes(x)), b.filter(x => !p.includes(x)));
    }
    if (jeObjekt(a) && jeObjekt(b)) return podleKlicu(a, b, puvodni, hloubka);
    return klic === 'vysledky' || klic === 'knihovnaSkryte' ? maxSlouceni(a, b) : b;
  }
  function podleKlicu(a, b, puvodni, hloubka) {
    const klice = new Set([...Object.keys(b), ...Object.keys(a)]);
    return Object.fromEntries([...klice].map(k => [k, zmeny(vlastni(a, k), vlastni(b, k), vlastni(puvodni, k), hloubka + 1)])
      .filter(([, v]) => v !== undefined));
  }
  return zmeny(jejich, nase, zaklad, 0);
}
