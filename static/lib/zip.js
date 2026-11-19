// A small ZIP: unpacking (.mxl from MuseScore, restoring a backup) and packing without compression (data backup).
// Deflate is unpacked by the browser (DecompressionStream 'deflate-raw'); Node has the same API too.

const MAX_ROZBALENO = 20 * 1024 * 1024;              // protection against a "zip bomb"

let TABULKA = null;
function crc32(b) {
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

async function inflateRaw(b) {
  const s = new Blob([b]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const r = s.getReader(), kusy = [];
  let delka = 0;
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    delka += value.length;
    if (delka > MAX_ROZBALENO) { r.cancel(); throw new Error('soubor v archivu je příliš velký'); }
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
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('není to ZIP');
  const pocet = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dek = new TextDecoder();
  const out = new Map();
  for (let i = 0; i < pocet; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('poškozený ZIP');
    const metoda = v.getUint16(p + 10, true), komp = v.getUint32(p + 20, true);
    const dJm = v.getUint16(p + 28, true), dEx = v.getUint16(p + 30, true), dKom = v.getUint16(p + 32, true);
    const lokal = v.getUint32(p + 42, true);
    const jmeno = dek.decode(b.subarray(p + 46, p + 46 + dJm));
    p += 46 + dJm + dEx + dKom;
    if (jmeno.endsWith('/')) continue;
    const zac = lokal + 30 + v.getUint16(lokal + 26, true) + v.getUint16(lokal + 28, true);
    const data = b.subarray(zac, zac + komp);
    if (metoda === 0) out.set(jmeno, data.slice());
    else if (metoda === 8) out.set(jmeno, await inflateRaw(data));
    else throw new Error(`nepodporovaná komprese ZIP (${metoda})`);
  }
  return out;
}

/** Map/object (name → bytes) → ZIP without compression (names in UTF-8) */
export function zabalZip(soubory) {
  const en = new TextEncoder();
  const polozky = [...(soubory instanceof Map ? soubory : Object.entries(soubory))]
    .map(([jm, data]) => ({ jm: en.encode(jm), data: data instanceof Uint8Array ? data : en.encode(String(data)) }));
  let velikost = 22;
  for (const x of polozky) velikost += 30 + x.jm.length + x.data.length + 46 + x.jm.length;
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
