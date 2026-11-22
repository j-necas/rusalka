// Where Rusalka keeps songs and data (profiles, results, statistics, favourites, hidden samples and library songs):
//  - ProhlizecUloziste: IndexedDB of this browser (default, works everywhere),
//  - SlozkaUloziste: a folder chosen by the parent (File System Access, Chrome/Edge only). An AI agent with the skill
//    may add songs to the same folder. Layout: rusalka.json, pisne/*.musicxml|xml|mxl, data/<key>.json.
// Both have the same interface: seznam(), cti(soubor), zapis(soubor, bajty, { prepsat }), smaz(soubor), ctiData(klic),
// zapisData(klic, hodnota).
import { slucZmeny, stejnaData } from './merge.js';
import { t } from './texts.js';
import { jeNota, volneJmeno, MAX_VELIKOST } from './files.js';
import { zabalZip, rozbalZip } from './zip.js';

export const KLICE_DAT = ['profily', 'profil', 'vysledky', 'statistiky', 'oblibene', 'skryte', 'knihovnaSkryte', 'zaloha_pred_smazanim', 'denik', 'nastaveni'];
const en = new TextEncoder(), de = new TextDecoder('utf-8', { fatal: true });
const VERZE = 1;
const znacka = () => en.encode(`{ "verze": ${VERZE} }\n`);
const chybaDat = (klic, parametry, cause) => new Error(t(klic, parametry), { cause });
function overData(klic, v) {
  let platne = v == null;
  if (klic === 'profil') platne ||= typeof v === 'string';
  else if (klic === 'profily') platne ||= Array.isArray(v) && v.every(p => typeof p?.id === 'string');
  else if (klic === 'skryte' || klic === 'zaloha_pred_smazanim') platne ||= Array.isArray(v);
  else platne ||= typeof v === 'object' && !Array.isArray(v);
  if (!platne) throw chybaDat('app.dataPoskozeny', { soubor: `data/${klic}.json` });
  return v;
}
function ctiJson(bajty, soubor) {
  try { return JSON.parse(de.decode(bajty)); }
  catch (e) { throw chybaDat('app.dataPoskozeny', { soubor }, e); }
}
function overVerzi(bajty) {
  if (ctiJson(bajty, 'rusalka.json')?.verze > VERZE) throw chybaDat('app.dataVerze');
}
async function pokudExistuje(fn) {
  try { return await fn(); }
  catch (e) { if (e.name !== 'NotFoundError') throw e; return null; }
}
const ctiSoubor = (dir, jm) => pokudExistuje(async () => new Uint8Array(await (await (await dir.getFileHandle(jm)).getFile()).arrayBuffer()));
const podZamkem = (klic, fn) => globalThis.navigator?.locks?.request ? navigator.locks.request(`rusalka-data-${klic}`, fn) : fn();

// ---------------------------------------------------------------- IndexedDB
let DB = null;
function db() {
  if (DB) return DB;
  const spojeni = new Promise((ok, chyba) => {
    const r = indexedDB.open('rusalka', 1);
    r.onupgradeneeded = () => { for (const s of ['pisne', 'data', 'nastaveni']) r.result.createObjectStore(s); };
    r.onsuccess = () => {
      const d = r.result;
      d.onclose = () => { if (DB === spojeni) DB = null; };
      d.onversionchange = () => { d.onclose(); d.close(); };
      ok(d);
    };
    r.onerror = () => chyba(r.error);
  });
  DB = spojeni;
  spojeni.catch(() => { if (DB === spojeni) DB = null; });
  return spojeni;
}
async function idb(store, rezim, fn) {
  for (let pokus = 0; ; pokus++) {
    const spojeni = db();
    try {
      const d = await spojeni;
      return await new Promise((ok, chyba) => {
        const tx = d.transaction(store, rezim);
        const r = fn(tx.objectStore(store));
        tx.oncomplete = () => ok(typeof r === 'function' ? r() : r?.result);
        tx.onabort = () => chyba(tx.error || new DOMException('Transaction aborted', 'AbortError'));
      });
    } catch (e) {
      const odpojeno = e.name === 'InvalidStateError' || /connection.*(?:lost|clos)/i.test(e.message);
      if (odpojeno && DB === spojeni) DB = null;
      if (!odpojeno || pokus) throw e;
    }
  }
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
  cteno = new Map();
  async seznam() {
    const klice = await idb('pisne', 'readonly', s => s.getAllKeys());
    return klice.filter(k => jeNota(k) && !k.includes('/')).sort().map(soubor => ({ soubor }));
  }
  async cti(soubor) {
    const b = await idb('pisne', 'readonly', s => s.get(soubor));
    if (!b) throw chybaDat('app.dataPisenChybi', { soubor });
    return new Uint8Array(b);
  }
  async zapis(soubor, bajty, { prepsat = false } = {}) {
    if (bajty.length > MAX_VELIKOST) throw chybaDat('app.dataVelky');
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
  async ctiData(klic) {
    const hodnota = overData(klic, (await idb('data', 'readonly', s => s.get(klic))) ?? null);
    this.cteno.set(klic, structuredClone(hodnota));
    return hodnota;
  }
  async zapisData(klic, hodnota, { zaklad = this.cteno.get(klic), prepsat = false, prenos = false } = {}) {
    const co = await idb('data', 'readwrite', s => {
      let vysledek;
      const r = s.get(klic);
      r.onsuccess = () => {
        const jejich = r.result ?? null;
        vysledek = prepsat ? hodnota : slucZmeny(klic, jejich, hodnota, zaklad, { prenos });
        s.put(vysledek, klic);
      };
      return () => vysledek;
    });
    this.cteno.set(klic, structuredClone(hodnota));
    return co;
  }
}

// ---------------------------------------------------------------- folder
export class SlozkaUloziste {
  druh = 'slozka';
  constructor(handle, hlasit = console.warn) { this.h = handle; this.cteno = new Map(); this.hlasit = hlasit; }
  async overVerzi() {
    const b = await ctiSoubor(this.h, 'rusalka.json');
    if (b) overVerzi(b);
    return !!b;
  }
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
    const d = await pokudExistuje(() => this.h.getDirectoryHandle('data'));
    if (d) for await (const [jm] of d.entries()) if (jm.endsWith('.json')) return true;
    return false;
  }
  async pripravit() {
    const maZnacku = await this.overVerzi();
    await this.h.getDirectoryHandle('pisne', { create: true });
    await this.h.getDirectoryHandle('data', { create: true });
    if (!maZnacku) await zapisSoubor(this.h, 'rusalka.json', znacka());
  }
  async seznam() {
    const d = await pokudExistuje(() => this.h.getDirectoryHandle('pisne')), out = [];
    if (!d) return out;
    for await (const [jm, h] of d.entries()) if (h.kind === 'file' && jeNota(jm) && !jm.startsWith('.')) out.push({ soubor: jm });
    return out.sort((a, b) => (a.soubor < b.soubor ? -1 : 1));
  }
  async cti(soubor) {
    const d = await this.h.getDirectoryHandle('pisne');
    return new Uint8Array(await (await (await d.getFileHandle(soubor)).getFile()).arrayBuffer());
  }
  async zapis(soubor, bajty, { prepsat = false } = {}) {
    if (bajty.length > MAX_VELIKOST) throw chybaDat('app.dataVelky');
    await this.overVerzi();
    const d = await this.h.getDirectoryHandle('pisne', { create: true });
    const je = new Set((await this.seznam()).map(x => x.soubor));
    const jm = prepsat ? soubor : volneJmeno(soubor, x => je.has(x));
    await zapisSoubor(d, jm, bajty);
    return jm;
  }
  async smaz(soubor) { await this.overVerzi(); await (await this.h.getDirectoryHandle('pisne')).removeEntry(soubor); }
  /** before the first overwrite from the editor: the original file goes to zalohy/ (only once) */
  async zalohuj(soubor) {
    await this.overVerzi();
    const z = await this.h.getDirectoryHandle('zalohy', { create: true });
    if (await pokudExistuje(() => z.getFileHandle(soubor))) return;
    await zapisSoubor(z, soubor, await this.cti(soubor));
  }
  async ctiData(klic) {
    await this.overVerzi();
    const jm = `${klic}.json`, d = await pokudExistuje(() => this.h.getDirectoryHandle('data'));
    const b = d && await ctiSoubor(d, jm);
    const hodnota = b ? overData(klic, ctiJson(b, `data/${jm}`)) : null;
    this.cteno.set(klic, structuredClone(hodnota));
    return hodnota;
  }
  /** Compare the contents: sync tools may keep the mtime and file size unchanged. */
  zapisData(klic, hodnota, { zaklad = this.cteno.get(klic), prepsat = false, prenos = false } = {}) {
    return podZamkem(klic, async () => {
      await this.overVerzi();
      const jm = `${klic}.json`, d = await this.h.getDirectoryHandle('data', { create: true });
      const b = await ctiSoubor(d, jm);
      let jejich = null, poskozeny = null;
      if (b) {
        try { jejich = overData(klic, ctiJson(b, `data/${jm}`)); }
        catch {
          const kopie = `${jm}.poskozeny-${Date.now()}-${crypto.randomUUID()}`;
          await zapisSoubor(d, kopie, b);
          poskozeny = chybaDat('app.dataZachraneno', { soubor: `data/${kopie}` });
        }
      }
      const co = prepsat || poskozeny ? hodnota : slucZmeny(klic, jejich, hodnota, zaklad, { prenos });
      if (!b || poskozeny || !stejnaData(jejich, co)) await zapisSoubor(d, jm, en.encode(JSON.stringify(co, null, 1)));
      if (poskozeny) this.hlasit(poskozeny, klic);
      this.cteno.set(klic, structuredClone(hodnota));
      return co;
    });
  }
}
async function zapisSoubor(dir, jm, bajty) {
  const fh = await dir.getFileHandle(jm, { create: true });
  const w = await fh.createWritable();
  try { await w.write(bajty); await w.close(); }
  catch (e) { await w.abort?.().catch(() => {}); throw e; }
}

// ---------------------------------------------------------------- writes from the application
export function datoveZapisy(ul, ulozeno, chyba) {
  const fronty = new Map(), cteno = new Map();
  let revize = 0;
  return {
    get revize() { return revize; },
    cteno(k, v) { cteno.set(k, structuredClone(v)); },
    pis(k, v) {
      const hodnota = structuredClone(v);
      const zapis = async () => {
        try {
          const co = await ul.zapisData(k, hodnota, { zaklad: cteno.get(k) });
          const posledni = fronty.get(k) === p;
          cteno.set(k, structuredClone(posledni ? co : hodnota));
          if (posledni && !stejnaData(co, hodnota)) ulozeno(k, co);
        } catch (e) { chyba(k, e); }
        finally { if (fronty.get(k) === p) fronty.delete(k); }
      };
      const p = (fronty.get(k) || Promise.resolve()).then(zapis);
      fronty.set(k, p); revize++;
    },
    async dokonci() {
      while (fronty.size) await Promise.all([...fronty.values()]);
    },
  };
}

// ---------------------------------------------------------------- transfer, backup
export async function snimekDat(ul) {
  return Object.fromEntries(await Promise.all(KLICE_DAT.map(async k => [k, await ul.ctiData(k)])));
}
/** Move changes made without folder access, or copy the full contents on request. */
export async function kopiruj(z, kam, { zaklad } = {}) {
  const snimek = await snimekDat(z);
  if (!zaklad) for (const { soubor } of await z.seznam()) await kam.zapis(soubor, await z.cti(soubor), { prepsat: true });
  for (const [k, v] of Object.entries(snimek)) {
    if (zaklad ? !stejnaData(v, zaklad[k] ?? null) : v != null) {
      await kam.zapisData(k, v, { zaklad: zaklad?.[k] ?? null, prenos: true });
    }
  }
  return snimek;
}
/** backup: a ZIP with the same layout as the folder */
export async function zaloha(ul) {
  const m = new Map([['rusalka.json', znacka()]]);
  for (const { soubor } of await ul.seznam()) m.set(`pisne/${soubor}`, await ul.cti(soubor));
  for (const k of KLICE_DAT) {
    const v = await ul.ctiData(k);
    if (v != null) m.set(`data/${k}.json`, en.encode(JSON.stringify(v, null, 1)));
  }
  return zabalZip(m);
}
/** Restore recognised entries after validating the archive and saving the optional safety copy. */
export async function obnov(ul, zipBajty, { predObnovou } = {}) {
  let m = await rozbalZip(zipBajty);
  const jeZaloha = mm => [...mm.keys()].some(k => k === 'rusalka.json' || k.startsWith('pisne/') || k.startsWith('data/'));
  if (!jeZaloha(m)) {                     // a zip of the Rusalka folder itself (Finder): one wrapping folder, Mac extras aside
    const klice = [...m.keys()].filter(k => !k.startsWith('__MACOSX/'));
    const obal = new Set(klice.map(k => k.split('/')[0]));
    if (obal.size === 1 && klice.every(k => k.includes('/'))) {
      const o = [...obal][0] + '/';
      m = new Map(klice.map(k => [k.slice(o.length), m.get(k)]));
    }
  }
  if (m.has('rusalka.json')) overVerzi(m.get('rusalka.json'));
  const pisne = [], data = [];
  for (const [jm, b] of m) {
    const [slozka, soubor, dalsi] = jm.split('/');
    if (!soubor || dalsi !== undefined || /[\\\0]/.test(soubor)) continue;
    if (slozka === 'pisne' && jeNota(soubor)) {
      if (b.length > MAX_VELIKOST) throw chybaDat('app.dataVelky');
      pisne.push([soubor, b]);
    }
    const k = slozka === 'data' && soubor.endsWith('.json') && soubor.slice(0, -5);
    if (k && KLICE_DAT.includes(k)) data.push([k, overData(k, ctiJson(b, jm))]);
  }
  if (!(pisne.length || data.length || m.has('rusalka.json'))) throw chybaDat('app.dataNeniZaloha');
  if (predObnovou) await predObnovou(await zaloha(ul));
  for (const [soubor, b] of pisne) await ul.zapis(soubor, b, { prepsat: true });
  for (const [k, v] of data) await ul.zapisData(k, v, { prepsat: true });
  return { pisni: pisne.length, dat: data.length };
}
