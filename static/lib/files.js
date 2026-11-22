// Music files: bytes → MusicXML text (including zipped .mxl) and the song title. This used to be done by Rust in the Mac app.
import { rozbalZip } from './zip.js';
import { t } from './texts.js';

export const PRIPONY = ['musicxml', 'xml', 'mxl'];
export const MAX_VELIKOST = 5 * 1024 * 1024;
export const jeNota = soubor => PRIPONY.includes((soubor.split('.').pop() || '').toLowerCase());
/** iPhone and iPad (iPadOS Safari says it is a Mac, but has touch) grey out .musicxml files when the picker has an
 *  accept filter – there the picker shows every file and the app checks the type itself */
export const vyberBezFiltru = ({ userAgent = '', maxTouchPoints = 0 }) =>
  /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);

function dekoduj(b) {
  if ((b[0] === 0xFF && b[1] === 0xFE) || (b[0] === 0x3C && b[1] === 0)) return new TextDecoder('utf-16le').decode(b);
  if ((b[0] === 0xFE && b[1] === 0xFF) || (b[0] === 0 && b[1] === 0x3C)) return new TextDecoder('utf-16be').decode(b);
  const utf8 = new TextDecoder();
  if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return utf8.decode(b);
  const hlavicka = utf8.decode(b.subarray(0, 512)).match(/^\s*<\?xml\s+([^?]*)\?>/i)?.[1];
  const kod = hlavicka?.match(/\bencoding\s*=\s*(['"])([^'"]+)\1/i)?.[2];
  try { return (kod ? new TextDecoder(kod) : utf8).decode(b); }
  catch (e) { throw new Error(t('cviceni.chyba.necitelneXml'), { cause: e }); }
}

/** file bytes → MusicXML text; .mxl (ZIP) via META-INF/container.xml, otherwise the first .musicxml/.xml */
export async function xmlZBajtu(soubor, bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const zip = b[0] === 0x50 && b[1] === 0x4B;
  if (!zip) {
    const text = dekoduj(b);
    // a .mxl that isn't a ZIP: only when it's already unpacked XML text (an .mxl someone already unpacked)
    if (/\.mxl$/i.test(soubor) && !text.trimStart().startsWith('<')) throw new Error(t('cviceni.chyba.mxlNeniZip'));
    return text;
  }
  const s = await rozbalZip(b);
  let koren = null;
  const c = s.get('META-INF/container.xml');
  if (c) koren = (dekoduj(c).match(/full-path="([^"]+)"/) || [])[1] || null;
  if (!koren || !s.has(koren)) koren = [...s.keys()].find(n => !n.startsWith('META') && /\.(xml|musicxml)$/i.test(n));
  if (!koren) throw new Error(t('cviceni.chyba.mxlBezNot'));
  return dekoduj(s.get(koren));
}

const mezi = (s, od, po) => {
  const i = s.indexOf(od);
  if (i < 0) return null;
  const j = s.indexOf(po, i + od.length);
  const t = j < 0 ? '' : s.slice(i + od.length, j).trim();
  return t || null;
};
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
/** song title: work-title, then movement-title, otherwise the file name without extension */
export function nazevZXml(xml, soubor) {
  const t = mezi(xml || '', '<work-title>', '</work-title>') || mezi(xml || '', '<movement-title>', '</movement-title>');
  if (t) return t.replace(/&(amp|lt|gt|quot|apos);/g, m => ENT[m]);
  const i = soubor.lastIndexOf('.');
  return i > 0 ? soubor.slice(0, i) : soubor;
}

/** safe file name for a song (no slashes or control characters), with extension */
export function jmenoSouboru(nazev, pripona = 'musicxml') {
  const z = String(nazev || '').replace(/[\/\\:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Písnička';
  return jeNota(z) ? z : `${z}.${pripona}`;
}

/** a free name: "Title.musicxml", otherwise "Title (2).musicxml"… */
export function volneJmeno(soubor, existuje) {
  if (!existuje(soubor)) return soubor;
  const i = soubor.lastIndexOf('.');
  const z = i > 0 ? soubor.slice(0, i) : soubor, p = i > 0 ? soubor.slice(i) : '';
  for (let n = 2; ; n++) if (!existuje(`${z} (${n})${p}`)) return `${z} (${n})${p}`;
}
