// Small dependency-free zip (for the skill and ChatGPT plugin zips): deflate from node:zlib, UTF-8 names, fixed date for reproducibility.
import zlib from 'node:zlib';

const TAB = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = b => {
  if (zlib.crc32) return zlib.crc32(b) >>> 0;
  let c = 0xffffffff;
  for (const x of b) c = TAB[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const CAS = 0, DATUM = ((2026 - 1980) << 9) | (1 << 5) | 1;   // 2026-01-01 00:00

/** { 'path/in/zip': Buffer } → zip Buffer */
export function zip(soubory) {
  const lokalni = [], centralni = [];
  let posun = 0;
  for (const [jmeno, obsah] of Object.entries(soubory)) {
    const data = Buffer.from(obsah), j = Buffer.from(jmeno, 'utf8');
    const def = zlib.deflateRawSync(data, { level: 9 });
    const [metoda, ulozeno] = def.length < data.length ? [8, def] : [0, data];
    const crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(metoda, 8);
    h.writeUInt16LE(CAS, 10); h.writeUInt16LE(DATUM, 12); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(ulozeno.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(j.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(metoda, 10);
    c.writeUInt16LE(CAS, 12); c.writeUInt16LE(DATUM, 14); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(ulozeno.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(j.length, 28);
    c.writeUInt32LE(0o100644 << 16 >>> 0, 38); c.writeUInt32LE(posun, 42);
    lokalni.push(h, j, ulozeno); centralni.push(c, j);
    posun += h.length + j.length + ulozeno.length;
  }
  const cd = Buffer.concat(centralni), n = Object.keys(soubory).length;
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(n, 8); e.writeUInt16LE(n, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(posun, 16);
  return Buffer.concat([...lokalni, cd, e]);
}

/** zip Buffer → { name: Buffer } (only for tests and checks; handles store and deflate) */
export function rozbal(z) {
  let e = z.length - 22;
  while (e >= 0 && z.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip');
  const out = {};
  let p = z.readUInt32LE(e + 16);
  for (let i = 0; i < z.readUInt16LE(e + 10); i++) {
    const metoda = z.readUInt16LE(p + 10), csize = z.readUInt32LE(p + 20), nlen = z.readUInt16LE(p + 28);
    const xlen = z.readUInt16LE(p + 30), klen = z.readUInt16LE(p + 32), lh = z.readUInt32LE(p + 42);
    const jmeno = z.toString('utf8', p + 46, p + 46 + nlen);
    const od = lh + 30 + z.readUInt16LE(lh + 26) + z.readUInt16LE(lh + 28);
    const data = z.subarray(od, od + csize);
    out[jmeno] = metoda === 8 ? zlib.inflateRawSync(data) : Buffer.from(data);
    if (crc32(out[jmeno]) !== z.readUInt32LE(p + 16)) throw new Error(`${jmeno}: CRC mismatch`);
    p += 46 + nlen + xlen + klen;
  }
  return out;
}
