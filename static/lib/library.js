// Song library selection logic: the player's level, shelf order, the "At home" rule, the next song to offer, search.
// Polozka = { soubor, nazev, police, stupen: 1|2|3, autor, jazyk, preklad?: { en?, cs? } }.
import { KROKY, hotovy } from './recommend.js';
import { t } from './texts.js';

/** the library's author line in the app's language for the common folk-song forms ("traditional", "traditional
 *  (Czech)", "traditional, lyrics by …"); other authors stay as written */
export function autorTextem(autor) {
  const a = String(autor || '').trim();
  if (/^traditional$/i.test(a)) return t('autor.lidova');
  if (/^traditional \(czech\)$/i.test(a)) return t('autor.lidovaCeska');
  const m = /^traditional, lyrics by (.+)$/i.exec(a);
  return m ? t('autor.lidovaSlova', { jmeno: m[1] }) : a;
}

export const POLICE = ['children', 'czech', 'folk', 'anthems', 'christmas', 'classics'];
const cs = (a, b) => String(a).localeCompare(String(b), 'cs');
const klice = (stat, soubor) => Object.entries(stat || {}).filter(([k]) => k.startsWith(soubor + '#'));
const bezDiakritiky = t => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const klicNazvu = t => String(t ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

/** Group public copies with their local song for display. Their file IDs and data stay separate. */
export function slucPisne(soukrome, verejne) {
  const podleSouboru = new Map(soukrome.map(p => [p.soubor, p]));
  const podleNazvu = new Map();
  for (const p of soukrome) {
    const klic = klicNazvu(p.nazev);
    if (!p.chyba && klic && !podleNazvu.has(klic)) podleNazvu.set(klic, p);
  }
  const kopie = new Map();
  const knihovna = verejne.filter(p => {
    const shoda = podleSouboru.get(p.soubor) || podleNazvu.get(klicNazvu(p.nazev))
      || p.variantyTextu?.map(v => podleNazvu.get(klicNazvu(v.nazev))).find(Boolean);
    if (!shoda) return true;
    if (!kopie.has(shoda.soubor)) kopie.set(shoda.soubor, p);
    return false;
  });
  const vlastni = soukrome.map(p => {
    const verejna = kopie.get(p.soubor);
    return verejna ? { ...p, police: verejna.police, verejna } : p;
  });
  return { vlastni, knihovna };
}

/**
 * highest difficulty among songs with a finished step (same rule as proMe) + 1, clamped to 1..3;
 * a song whose difficulty is not known (not read yet, unreadable) does not count
 */
export function urovenHrace(seznam, vysHrace, stat, info) {
  const stupen = s => info?.[s.soubor]?.obtiznost?.stupen;
  const zvladnuto = Math.max(0, ...(seznam || [])
    .filter(s => stupen(s) != null && KROKY.some(k => hotovy(vysHrace?.[s.soubor], k))).map(stupen));
  return Math.min(3, Math.max(1, zvladnuto + 1));
}

/** songs up to the level first, then harder ones (tezsi: true); each group by stupen, then nazev */
export function seradPolici(polozky, uroven) {
  const razeni = (a, b) => a.stupen - b.stupen || cs(a.nazev, b.nazev);
  const lehke = polozky.filter(p => p.stupen <= uroven).sort(razeni);
  const tezke = polozky.filter(p => p.stupen > uroven).sort(razeni);
  return [...lehke.map(polozka => ({ polozka, tezsi: false })), ...tezke.map(polozka => ({ polozka, tezsi: true }))];
}

/**
 * At home: starred, or played after the song was last hidden. "Played" here means a practice record with a time
 * (statistiky … posledni), because it is compared with the time of hiding; dalsiZKnihovny counts any trace instead.
 */
export function naDomove(polozka, pid, { statistiky, oblibene, knihovnaSkryte } = {}) {
  const { soubor } = polozka;
  if ((oblibene?.[pid] || []).includes(soubor)) return true;
  const posledni = Math.max(0, ...klice(statistiky?.[pid], soubor).map(([, v]) => v?.posledni || 0));
  return posledni > 0 && posledni > (knihovnaSkryte?.[pid]?.[soubor] || 0);
}

/**
 * the next library song to offer: not yet played, level exactly, else up to it, else the easiest.
 * "Played" here is any trace (a practice record or a star in results), so a song once tried is never offered as new.
 */
export function dalsiZKnihovny(index, uroven, vysHrace, stat) {
  const hrano = p => klice(stat, p.soubor).length > 0 || KROKY.some(k => (vysHrace?.[p.soubor]?.[k]?.hvezdy || 0) > 0);
  const poradi = (a, b) => POLICE.indexOf(a.police) - POLICE.indexOf(b.police) || cs(a.nazev, b.nazev);
  const nove = (index || []).filter(p => !hrano(p)).sort(poradi);
  return nove.find(p => p.stupen === uroven) || nove.find(p => p.stupen <= uroven)
    || [...nove].sort((a, b) => a.stupen - b.stupen || poradi(a, b))[0] || null;
}

/** diacritics- and case-insensitive search in titles, authors and translations */
export function hledej(index, dotaz) {
  const q = bezDiakritiky(dotaz).trim();
  if (!q) return [...(index || [])];
  return (index || []).filter(p => [p.nazev, p.autor, p.preklad?.en, p.preklad?.cs, ...(p.variantyTextu || []).map(v => v.nazev)]
    .some(t => bezDiakritiky(t).includes(q)));
}

/** A lyric variant can also place the same song on a second shelf. */
export const jeNaPolici = (p, police) => p.police === police || (p.verejna || p).variantyTextu?.some(v => v.police === police) === true;

/** shelves of the sample songs bundled with the app (songs/) */
const POLICE_UKAZEK = {
  'Frère Jacques.musicxml': 'children', 'Happy Birthday.musicxml': 'children', 'London Bridge.musicxml': 'children',
  'Mary Had a Little Lamb.musicxml': 'children', 'Row, Row, Row Your Boat.musicxml': 'children',
  'Twinkle, Twinkle, Little Star.musicxml': 'children', 'Jingle Bells (chorus).musicxml': 'christmas',
  'Silent Night.musicxml': 'christmas', 'Für Elise (opening).musicxml': 'classics', 'Lullaby (Brahms).musicxml': 'classics',
  'Minuet in G.musicxml': 'classics', 'Ode to Joy.musicxml': 'classics',
};
/** the shelf of a sample song; null for the user's own songs */
export const policeSouboru = soubor => POLICE_UKAZEK[soubor] || null;

/** up to n library songs nobody in this player's results has touched: the player's level first, then easier ones;
 *  within a level by shelf order and title (the suggestions mixed into For me) */
export function navrhyZKnihovny(index, uroven, vysHrace, stat, n = 4) {
  const hrano = p => klice(stat, p.soubor).length > 0 || KROKY.some(k => (vysHrace?.[p.soubor]?.[k]?.hvezdy || 0) > 0);
  const poradi = (a, b) => b.stupen - a.stupen || POLICE.indexOf(a.police) - POLICE.indexOf(b.police) || cs(a.nazev, b.nazev);
  return (index || []).filter(p => !hrano(p) && p.stupen <= uroven).sort(poradi).slice(0, n);
}
