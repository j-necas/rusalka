// A small ZIP: unpacking (.mxl from MuseScore, restoring a backup) and packing without compression (data backup).
// Deflate is unpacked by the browser (DecompressionStream 'deflate-raw'); Node has the same API too.

import { t } from './texts.js';

const MAX_POLOZKA = 20 * 1024 * 1024, MAX_ROZBALENO = 100 * 1024 * 1024, MAX_POLOZEK = 10000;
export const MAX_ZIP = MAX_ROZBALENO + 5 * 1024 * 1024;
const CP437 = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
const zipChyba = (klic, parametry) => new Error(t(klic, parametry));

let TABULKA = null;
export function crc32(b) {
  if (!TABULKA) {
    TABULKA = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      TABULKA[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = TABULKA[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

async function inflateRaw(b, limit) {
  const s = new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const r = s.getReader(), kusy = [];
  let delka = 0;
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    delka += value.length;
    if (delka > limit) { await r.cancel().catch(() => {}); throw zipChyba('zip.poskozeny'); }
    kusy.push(value);
  }
  const out = new Uint8Array(delka);
  let o = 0;
  for (const k of kusy) { out.set(k, o); o += k.length; }
  return out;
}

/** ZIP → Map(name → bytes). Reads the central directory; handles stored (0) and deflate (8) entries. */
export async function rozbalZip(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length > MAX_ZIP) throw zipChyba('zip.limit');
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054b50 && i + 22 + v.getUint16(i + 20, true) === b.length) { eocd = i; break; }
  }
  if (eocd < 0) throw zipChyba('zip.neniZip');
  const pocet = v.getUint16(eocd + 10, true), cd = v.getUint32(eocd + 16, true), konec = cd + v.getUint32(eocd + 12, true);
  if (pocet > MAX_POLOZEK) throw zipChyba('zip.limit');
  if (konec !== eocd || v.getUint32(eocd + 4, true) || v.getUint16(eocd + 8, true) !== pocet) throw zipChyba('zip.poskozeny');
  const dek = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const polozky = [];
  let p = cd, celkem = 0;
  for (let i = 0; i < pocet; i++) {
    if (p + 46 > konec || v.getUint32(p, true) !== 0x02014b50) throw zipChyba('zip.poskozeny');
    const priznaky = v.getUint16(p + 8, true), metoda = v.getUint16(p + 10, true), crc = v.getUint32(p + 16, true);
    const komp = v.getUint32(p + 20, true), velikost = v.getUint32(p + 24, true);
    const dJm = v.getUint16(p + 28, true), dEx = v.getUint16(p + 30, true), dKom = v.getUint16(p + 32, true);
    const lokal = v.getUint32(p + 42, true), zacJm = p + 46;
    p = zacJm + dJm + dEx + dKom;
    if (p > konec || lokal + 30 > cd || v.getUint32(lokal, true) !== 0x04034b50 || (priznaky & 1)) throw zipChyba('zip.poskozeny');
    const zac = lokal + 30 + v.getUint16(lokal + 26, true) + v.getUint16(lokal + 28, true);
    if (zac + komp > cd) throw zipChyba('zip.poskozeny');
    celkem += velikost;
    if (velikost > MAX_POLOZKA || celkem > MAX_ROZBALENO) throw zipChyba('zip.limit');
    polozky.push({ priznaky, metoda, crc, velikost, jm: b.subarray(zacJm, zacJm + dJm), data: b.subarray(zac, zac + komp) });
  }
  if (p !== konec) throw zipChyba('zip.poskozeny');
  const out = new Map();
  for (const { priznaky, metoda, crc, velikost, jm, data } of polozky) {
    let jmeno, polozka;
    try {
      jmeno = priznaky & 0x0800 ? dek.decode(jm) : jmenoBezPriznaku(jm);
      if (metoda === 0) polozka = data;
      else if (metoda === 8) polozka = await inflateRaw(data, velikost);
    } catch { throw zipChyba('zip.poskozeny'); }
    if (!polozka) throw zipChyba('zip.komprese', { metoda });
    if (!jmeno || out.has(jmeno) || polozka.length !== velikost || crc32(polozka) !== crc) throw zipChyba('zip.poskozeny');
    if (!jmeno.endsWith('/')) out.set(jmeno, metoda === 0 ? polozka.slice() : polozka);
  }
  return out;
}

// A name without the UTF-8 flag (bit 11): the macOS Finder (ditto) writes UTF-8 without setting it, old Windows zips
// write CP437. Valid UTF-8 is taken as UTF-8 (CP437 accented names are almost never valid UTF-8), otherwise CP437.
const utf8Strikt = new TextDecoder('utf-8', { fatal: true });
function jmenoBezPriznaku(jm) {
  try { return utf8Strikt.decode(jm); } catch { return Array.from(jm, x => x < 128 ? String.fromCharCode(x) : CP437[x - 128]).join(''); }
}

/** Map/object (name → bytes) → ZIP without compression (names in UTF-8) */
export function zabalZip(soubory) {
  const en = new TextEncoder();
  const polozky = [...(soubory instanceof Map ? soubory : Object.entries(soubory))]
    .map(([jm, data]) => ({ jm: en.encode(jm), data: data instanceof Uint8Array ? data : en.encode(String(data)) }));
  let velikost = 22, celkem = 0;
  if (polozky.length > MAX_POLOZEK) throw zipChyba('zip.limit');
  for (const x of polozky) {
    celkem += x.data.length;
    if (x.jm.length > 65535 || x.data.length > MAX_POLOZKA || celkem > MAX_ROZBALENO) throw zipChyba('zip.limit');
    velikost += 30 + x.jm.length + x.data.length + 46 + x.jm.length;
  }
  if (velikost > MAX_ZIP) throw zipChyba('zip.limit');
  const b = new Uint8Array(velikost), v = new DataView(b.buffer);
  let p = 0;
  for (const x of polozky) {
    x.crc = crc32(x.data); x.off = p;
    v.setUint32(p, 0x04034b50, true); v.setUint16(p + 4, 20, true); v.setUint16(p + 6, 0x0800, true);
    v.setUint32(p + 14, x.crc, true); v.setUint32(p + 18, x.data.length, true); v.setUint32(p + 22, x.data.length, true);
    v.setUint16(p + 26, x.jm.length, true);
    b.set(x.jm, p + 30); b.set(x.data, p + 30 + x.jm.length);
    p += 30 + x.jm.length + x.data.length;
  }
  const cd = p;
  for (const x of polozky) {
    v.setUint32(p, 0x02014b50, true); v.setUint16(p + 4, 20, true); v.setUint16(p + 6, 20, true); v.setUint16(p + 8, 0x0800, true);
    v.setUint32(p + 16, x.crc, true); v.setUint32(p + 20, x.data.length, true); v.setUint32(p + 24, x.data.length, true);
    v.setUint16(p + 28, x.jm.length, true); v.setUint32(p + 42, x.off, true);
    b.set(x.jm, p + 46);
    p += 46 + x.jm.length;
  }
  v.setUint32(p, 0x06054b50, true); v.setUint16(p + 8, polozky.length, true); v.setUint16(p + 10, polozky.length, true);
  v.setUint32(p + 12, p - cd, true); v.setUint32(p + 16, cd, true);
  return b;
}
