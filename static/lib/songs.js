// My songs (Songs window): which of the user's own songs to list and in what order. Pure, no DOM.

export const bezDiakritiky = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * The user's own songs by title (Czech order); `hledat` matches the title or the author (from `info[soubor].autor`)
 * ignoring case and diacritics.
 * seznam: [{ soubor, nazev }]
 */
export function filtrujPisne(seznam, hledat = '', info = {}) {
  const dotaz = bezDiakritiky(String(hledat).trim());
  const hodi = p => !dotaz || bezDiakritiky(`${p.nazev} ${info[p.soubor]?.autor || ''}`).includes(dotaz);
  return seznam.filter(hodi).sort((a, b) => a.nazev.localeCompare(b.nazev, 'cs'));
}
