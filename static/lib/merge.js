// Merging data when the file in the folder changed elsewhere meanwhile (another tab, another computer, iCloud).
// Rules: results – for numbers the maximum (stars, percentages, counts), otherwise ours; statistics – the newer attempt;
// profiles – union by id (our version wins); favourites and hidden – union; library songs removed from home – the later
// time per player and song; everything else – ours.
// A deleted player doesn't come back (record { id, smazano }); a deleted favourite may come back on a concurrent write.

const jeObjekt = x => x && typeof x === 'object' && !Array.isArray(x);

/** deep merge: numbers take the maximum, objects key by key, otherwise our value */
function maxSlouceni(jejich, nase) {
  if (typeof jejich === 'number' && typeof nase === 'number') return Math.max(jejich, nase);
  if (jeObjekt(jejich) && jeObjekt(nase)) {
    const out = { ...jejich };
    for (const [k, v] of Object.entries(nase)) out[k] = k in jejich ? maxSlouceni(jejich[k], v) : v;
    return out;
  }
  return nase === undefined ? jejich : nase;
}

/** statistiky[profile][song#level]: for each item the one with the later last attempt */
function novejsiStatistiky(jejich, nase) {
  const out = {};
  for (const pid of new Set([...Object.keys(jejich || {}), ...Object.keys(nase || {})])) {
    const a = jejich?.[pid] || {}, b = nase?.[pid] || {};
    out[pid] = { ...a };
    for (const [k, v] of Object.entries(b)) out[pid][k] = !a[k] || (v?.posledni ?? 0) >= (a[k]?.posledni ?? 0) ? v : a[k];
  }
  return out;
}

const sjednot = (a, b) => [...new Set([...(a || []), ...(b || [])])];

export function sluc(klic, jejich, nase) {
  if (jejich == null) return nase;
  if (nase == null) return jejich;
  switch (klic) {
    case 'vysledky': return maxSlouceni(jejich, nase);
    case 'statistiky': return novejsiStatistiky(jejich, nase);
    case 'profily': {
      // a deleted player ({ id, smazano }) stays deleted, whichever side the deletion is on
      const smazani = new Map([...jejich, ...nase].filter(p => p.smazano).map(p => [p.id, p]));
      const nasi = new Map(nase.map(p => [p.id, p]));
      return [...nase, ...jejich.filter(p => !nasi.has(p.id))].map(p => smazani.get(p.id) || p);
    }
    case 'oblibene': {
      const out = { ...jejich };
      for (const [pid, s] of Object.entries(nase)) out[pid] = sjednot(jejich[pid], s);
      return out;
    }
    case 'skryte': return sjednot(jejich, nase);
    case 'knihovnaSkryte': return maxSlouceni(jejich, nase);   // { [pid]: { [soubor]: ms } }
    default: return nase;
  }
}
