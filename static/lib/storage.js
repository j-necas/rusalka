// Where Rusalka keeps songs and data (profiles, results, statistics, favourites, hidden samples and library songs):
//  - ProhlizecUloziste: IndexedDB of this browser (default, works everywhere),
//  - SlozkaUloziste: a folder chosen by the parent (File System Access, Chrome/Edge only). An AI agent with the skill
//    may add songs to the same folder. Layout: rusalka.json, pisne/*.musicxml|xml|mxl, data/<key>.json.
// Both have the same interface: seznam(), cti(soubor), zapis(soubor, bajty, { prepsat }), smaz(soubor), ctiData(klic),
// zapisData(klic, hodnota).
import { sluc } from './merge.js';
import { jeNota, volneJmeno, MAX_VELIKOST } from './files.js';
import { zabalZip, rozbalZip } from './zip.js';

export const KLICE_DAT = ['profily', 'profil', 'vysledky', 'statistiky', 'oblibene', 'skryte', 'knihovnaSkryte', 'zaloha_pred_smazanim', 'denik', 'nastaveni'];
const en = new TextEncoder(), de = new TextDecoder();

// ---------------------------------------------------------------- IndexedDB
let DB = null;
function db(idb = globalThis.indexedDB) {
  if (DB) return DB;
  DB = new Promise((ok, chyba) => {
    const r = idb.open('rusalka', 1);
    r.onupgradeneeded = () => { for (const s of ['pisne', 'data', 'nastaveni']) r.result.createObjectStore(s); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => chyba(r.error);
  });
  return DB;
}
async function idb(store, rezim, fn) {
  const d = await db();
  return new Promise((ok, chyba) => {
    const tx = d.transaction(store, rezim), s = tx.objectStore(store);
    const r = fn(s);
    tx.oncomplete = () => ok(r?.result);
    tx.onerror = () => chyba(tx.error);
    tx.onabort = () => chyba(tx.error);
  });
}
/** tests only: forget the open connection */
export function _resetDb() { DB = null; }

/** small things remembered in the browser (the chosen folder) */
export const nastaveniProhlizece = {
  cti: klic => idb('nastaveni', 'readonly', s => s.get(klic)),
  zapis: (klic, hodnota) => idb('nastaveni', 'readwrite', s => s.put(hodnota, klic)),
  smaz: klic => idb('nastaveni', 'readwrite', s => s.delete(klic)),
};

export class ProhlizecUloziste {
  druh = 'prohlizec';
  async seznam() {
    const klice = await idb('pisne', 'readonly', s => s.getAllKeys());
    return klice.filter(k => jeNota(k) && !k.includes('/')).sort().map(soubor => ({ soubor }));
  }
  async cti(soubor) {
    const b = await idb('pisne', 'readonly', s => s.get(soubor));
    if (!b) throw new Error(`písnička ${soubor} neexistuje`);
    return new Uint8Array(b);
  }
  async zapis(soubor, bajty, { prepsat = false } = {}) {
    if (bajty.length > MAX_VELIKOST) throw new Error('soubor je moc velký');
    const je = new Set(await idb('pisne', 'readonly', s => s.getAllKeys()));
    const jm = prepsat ? soubor : volneJmeno(soubor, x => je.has(x));
    await idb('pisne', 'readwrite', s => s.put(new Uint8Array(bajty), jm));
    return jm;
  }
  smaz(soubor) { return idb('pisne', 'readwrite', s => s.delete(soubor)); }
  /** before the first overwrite from the editor: the original file goes to zalohy/ (only once) */
  async zalohuj(soubor) {
    const k = `zalohy/${soubor}`;
    if (await idb('pisne', 'readonly', s => s.getKey(k))) return;
    const b = await idb('pisne', 'readonly', s => s.get(soubor));
    if (b) await idb('pisne', 'readwrite', s => s.put(b, k));
  }
  async ctiData(klic) { return (await idb('data', 'readonly', s => s.get(klic))) ?? null; }
  zapisData(klic, hodnota) { return idb('data', 'readwrite', s => s.put(hodnota, klic)); }
}

// ---------------------------------------------------------------- folder
export class SlozkaUloziste {
  druh = 'slozka';
  constructor(handle) { this.h = handle; this.cteno = {}; }
  get nazev() { return this.h.name; }
  /** 'granted' | 'prompt' | 'denied' – after a browser restart permission usually has to be granted again */
  async stav() { return this.h.queryPermission ? this.h.queryPermission({ mode: 'readwrite' }) : 'granted'; }
  async povol() { return this.h.requestPermission ? this.h.requestPermission({ mode: 'readwrite' }) : 'granted'; }
  /** a Rusalka folder? (marker rusalka.json, or at least pisne/ or data/) */
  async jeRusalky() {
    for await (const [jm] of this.h.entries()) if (['rusalka.json', 'pisne', 'data'].includes(jm)) return true;
    return false;
  }
  async maData() {
    try {
      const d = await this.h.getDirectoryHandle('data');
      for await (const [jm] of d.entries()) if (jm.endsWith('.json')) return true;
    } catch { /* no data/ */ }
    return false;
  }
  async pripravit() {
    await this.h.getDirectoryHandle('pisne', { create: true });
    await this.h.getDirectoryHandle('data', { create: true });
    try { await this.h.getFileHandle('rusalka.json'); } catch { await zapisSoubor(this.h, 'rusalka.json', en.encode('{ "verze": 1 }\n')); }
  }
  async seznam() {
    const d = await this.h.getDirectoryHandle('pisne', { create: true }), out = [];
    for await (const [jm, h] of d.entries()) if (h.kind === 'file' && jeNota(jm) && !jm.startsWith('.')) out.push({ soubor: jm });
    return out.sort((a, b) => (a.soubor < b.soubor ? -1 : 1));
  }
  async cti(soubor) {
    const d = await this.h.getDirectoryHandle('pisne');
    return new Uint8Array(await (await (await d.getFileHandle(soubor)).getFile()).arrayBuffer());
  }
  async zapis(soubor, bajty, { prepsat = false } = {}) {
    if (bajty.length > MAX_VELIKOST) throw new Error('soubor je moc velký');
    const d = await this.h.getDirectoryHandle('pisne', { create: true });
    const je = new Set((await this.seznam()).map(x => x.soubor));
    const jm = prepsat ? soubor : volneJmeno(soubor, x => je.has(x));
    await zapisSoubor(d, jm, bajty);
    return jm;
  }
  async smaz(soubor) { await (await this.h.getDirectoryHandle('pisne')).removeEntry(soubor); }
  /** before the first overwrite from the editor: the original file goes to zalohy/ (only once) */
  async zalohuj(soubor) {
    const z = await this.h.getDirectoryHandle('zalohy', { create: true });
    try { await z.getFileHandle(soubor); return; } catch { /* not there yet */ }
    await zapisSoubor(z, soubor, await this.cti(soubor));
  }
  async ctiData(klic) {
    try {
      const d = await this.h.getDirectoryHandle('data');
      const f = await (await d.getFileHandle(`${klic}.json`)).getFile();
      this.cteno[klic] = f.lastModified;
      return JSON.parse(de.decode(await f.arrayBuffer()));
    } catch (e) {
      if (e instanceof SyntaxError) throw new Error(`soubor data/${klic}.json je poškozený`);
      return null;
    }
  }
  /** write; if the file is newer than when we read it (changed elsewhere), merge it first */
  async zapisData(klic, hodnota) {
    const d = await this.h.getDirectoryHandle('data', { create: true });
    let co = hodnota;
    try {
      const f = await (await d.getFileHandle(`${klic}.json`)).getFile();
      if (this.cteno[klic] == null || f.lastModified > this.cteno[klic]) co = sluc(klic, JSON.parse(de.decode(await f.arrayBuffer())), hodnota);
    } catch { /* file doesn't exist yet */ }
    const f = await zapisSoubor(d, `${klic}.json`, en.encode(JSON.stringify(co, null, 1)));
    this.cteno[klic] = f?.lastModified ?? Date.now();
    return co;
  }
}
async function zapisSoubor(dir, jm, bajty) {
  const fh = await dir.getFileHandle(jm, { create: true });
  const w = await fh.createWritable();
  await w.write(bajty);
  await w.close();
  return fh.getFile ? fh.getFile() : null;
}

// ---------------------------------------------------------------- transfer, backup
/** copies songs and data from one storage to another (overwrites identical names) */
export async function kopiruj(z, kam) {
  for (const { soubor } of await z.seznam()) await kam.zapis(soubor, await z.cti(soubor), { prepsat: true });
  for (const k of KLICE_DAT) {
    const v = await z.ctiData(k);
    if (v != null) await kam.zapisData(k, v);
  }
}
/** backup: a ZIP with the same layout as the folder */
export async function zaloha(ul) {
  const m = new Map([['rusalka.json', en.encode('{ "verze": 1 }\n')]]);
  for (const { soubor } of await ul.seznam()) m.set(`pisne/${soubor}`, await ul.cti(soubor));
  for (const k of KLICE_DAT) {
    const v = await ul.ctiData(k);
    if (v != null) m.set(`data/${k}.json`, en.encode(JSON.stringify(v, null, 1)));
  }
  return zabalZip(m);
}
/** restore from backup: songs and data from the ZIP (overwrites identical names) → { pisni, dat } */
export async function obnov(ul, zipBajty) {
  let m = await rozbalZip(zipBajty);
  const jeZaloha = mm => [...mm.keys()].some(k => k.startsWith('pisne/') || k.startsWith('data/'));
  if (!jeZaloha(m)) {                     // a zip of the Rusalka folder itself (Finder): one wrapping folder, Mac extras aside
    const klice = [...m.keys()].filter(k => !k.startsWith('__MACOSX/'));
    const obal = new Set(klice.map(k => k.split('/')[0]));
    if (obal.size === 1 && klice.every(k => k.includes('/'))) {
      const o = [...obal][0] + '/';
      m = new Map(klice.map(k => [k.slice(o.length), m.get(k)]));
    }
  }
  if (!jeZaloha(m)) throw new Error('tohle není záloha Rusalky');
  let pisni = 0, dat = 0;
  for (const [jm, b] of m) {
    const [slozka, soubor] = [jm.split('/')[0], jm.split('/').slice(1).join('/')];
    if (slozka === 'pisne' && jeNota(soubor) && !soubor.includes('/')) { await ul.zapis(soubor, b, { prepsat: true }); pisni++; }
    const k = slozka === 'data' && soubor.replace(/\.json$/, '');
    if (k && KLICE_DAT.includes(k)) { await ul.zapisData(k, JSON.parse(de.decode(b))); dat++; }
  }
  return { pisni, dat };
}
