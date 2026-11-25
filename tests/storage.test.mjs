import './setup.mjs';
import 'fake-indexeddb/auto';
import { forceCloseDatabase, IDBFactory } from 'fake-indexeddb';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProhlizecUloziste, SlozkaUloziste, kopiruj, zaloha, obnov, KLICE_DAT, _resetDb, snimekUloziste, presunDoSlozky, vyprazdniPoPresunu } from '../static/lib/storage.js';
import { zabalZip, rozbalZip } from '../static/lib/zip.js';
import { sluc } from '../static/lib/merge.js';
import { FakeSlozka } from './fake_folder.mjs';
import { fsSlozka } from './fs_folder.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const tmp = () => fsSlozka(mkdtempSync(join(tmpdir(), 'rusalka-fs-')));

const en = new TextEncoder(), de = new TextDecoder();
const XML = en.encode('<score-partwise/>');

for (const [jm, vyrob] of [['browser', () => new ProhlizecUloziste()], ['folder', async () => { const s = new SlozkaUloziste(new FakeSlozka()); await s.pripravit(); return s; }],
  ['folder on disk', async () => { const s = new SlozkaUloziste(tmp()); await s.pripravit(); return s; }]]) {
  test(`${jm}: songs, name collisions, data`, async () => {
    const u = await vyrob();
    for (const { soubor } of await u.seznam()) await u.smaz(soubor);
    assert.equal(await u.zapis('A.musicxml', XML), 'A.musicxml');
    assert.equal(await u.zapis('A.musicxml', XML), 'A (2).musicxml');
    assert.equal(await u.zapis('A.musicxml', en.encode('<x/>'), { prepsat: true }), 'A.musicxml');
    assert.deepEqual((await u.seznam()).map(x => x.soubor), ['A (2).musicxml', 'A.musicxml']);
    assert.equal(de.decode(await u.cti('A.musicxml')), '<x/>');
    await u.zalohuj('A.musicxml');
    await u.zapis('A.musicxml', en.encode('<y/>'), { prepsat: true });
    await u.zalohuj('A.musicxml');                       // the second backup does not overwrite the first
    await u.smaz('A (2).musicxml');
    assert.deepEqual((await u.seznam()).map(x => x.soubor), ['A.musicxml']);
    assert.equal(await u.ctiData('profily'), null);
    await u.zapisData('profily', [{ id: 'e', jmeno: 'Ema' }]);
    assert.deepEqual(await u.ctiData('profily'), [{ id: 'e', jmeno: 'Ema' }]);
  });
}

test('folder: no permission after restart → prompt, grant; marker and layout', async () => {
  const h = new FakeSlozka('Rusalka', 'prompt'), s = new SlozkaUloziste(h);
  assert.equal(await s.stav(), 'prompt');
  assert.equal(await s.povol(), 'granted');
  assert.equal(await s.jeRusalky(), false);
  await s.pripravit();
  assert.equal(await s.jeRusalky(), true);
  assert.deepEqual([...h.deti.keys()].sort(), ['data', 'pisne', 'rusalka.json']);
  assert.equal(await s.maData(), false);
  await s.zapisData('profil', 'e');
  assert.equal(await s.maData(), true);
});

test('folder: an unanswered permission check falls back to asking again', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = new FakeSlozka();
  h.queryPermission = () => new Promise(() => {});
  const s = new SlozkaUloziste(h);
  const stav = s.stav();
  t.mock.timers.tick(750);
  const vysledek = await Promise.race([stav, new Promise(ok => setImmediate(() => ok(null)))]);
  assert.equal(vysledek, 'prompt');
  assert.equal(await s.povol(), 'granted');
});

test('folder: a file changed elsewhere is merged before writing, not overwritten', async () => {
  const h = new FakeSlozka(), s = new SlozkaUloziste(h);
  await s.pripravit();
  await s.zapisData('vysledky', { e: { 'A.musicxml': { cekam: { hvezdy: 1, procent: 60, pocet: 1 } } } });
  await s.ctiData('vysledky');
  // another tab wrote the tempo in the meantime
  const jinde = new SlozkaUloziste(h);
  await jinde.zapisData('vysledky', { e: { 'A.musicxml': { cekam: { hvezdy: 1, procent: 60, pocet: 1 }, tempo: { hvezdy: 2, procent: 85, pocet: 1 } } } });
  const vysledek = await s.zapisData('vysledky', { e: { 'A.musicxml': { cekam: { hvezdy: 3, procent: 100, pocet: 2 } } } });
  assert.deepEqual(vysledek.e['A.musicxml'], { cekam: { hvezdy: 3, procent: 100, pocet: 2 }, tempo: { hvezdy: 2, procent: 85, pocet: 1 } });
  assert.deepEqual((await s.ctiData('vysledky')).e['A.musicxml'].tempo.hvezdy, 2);
});

test('merge: newer statistics win, profiles and favourites are united', () => {
  assert.deepEqual(sluc('statistiky', { e: { 'A#2': { posledni: 5, x: 'stara' }, 'B#2': { posledni: 1 } } }, { e: { 'A#2': { posledni: 9, x: 'nova' } } }),
    { e: { 'A#2': { posledni: 9, x: 'nova' }, 'B#2': { posledni: 1 } } });
  assert.deepEqual(sluc('profily', [{ id: 'e', jmeno: 'E' }, { id: 'f', jmeno: 'F' }], [{ id: 'e', jmeno: 'Ema' }]).map(p => p.jmeno), ['Ema', 'F']);
  assert.deepEqual(sluc('oblibene', { e: ['A'] }, { e: ['B'], f: ['C'] }), { e: ['A', 'B'], f: ['C'] });
  assert.equal(sluc('profil', 'e', 'f'), 'f');
});

test('merge: library songs hidden from home keep the later time per player and song', () => {
  const jejich = { e: { 'library/a.musicxml': 100, 'library/b.musicxml': 300 }, f: { 'library/a.musicxml': 50 } };
  const nase = { e: { 'library/a.musicxml': 200, 'library/b.musicxml': 150 }, j: { 'library/c.musicxml': 7 } };
  const cekane = { e: { 'library/a.musicxml': 200, 'library/b.musicxml': 300 }, f: { 'library/a.musicxml': 50 }, j: { 'library/c.musicxml': 7 } };
  assert.deepEqual(sluc('knihovnaSkryte', jejich, nase), cekane);
  assert.deepEqual(sluc('knihovnaSkryte', nase, jejich), cekane);
  assert.ok(KLICE_DAT.includes('knihovnaSkryte'), 'backup, restore and folder copy include the key');
});

test('players\' settings are data: in the folder and the backup, merged per player', () => {
  assert.ok(KLICE_DAT.includes('nastaveni'));
  assert.deepEqual(sluc('nastaveni', { e: { klaviatura: true }, f: { pismena: false } }, { e: { klaviatura: false } }),
    { e: { klaviatura: false }, f: { pismena: false } });
});

test('copy browser → folder and backup/restore', async () => {
  const p = new ProhlizecUloziste();
  for (const { soubor } of await p.seznam()) await p.smaz(soubor);
  await p.zapis('Óda.musicxml', XML, { prepsat: true });
  await p.zapisData('profily', [{ id: 'f', jmeno: 'Ota' }]);
  const s = new SlozkaUloziste(new FakeSlozka()); await s.pripravit();
  await kopiruj(p, s);
  assert.deepEqual((await s.seznam()).map(x => x.soubor), ['Óda.musicxml']);
  assert.equal((await s.ctiData('profily'))[0].jmeno, 'Ota');
  const zip = await zaloha(s);
  const s2 = new SlozkaUloziste(new FakeSlozka()); await s2.pripravit();
  assert.deepEqual(await obnov(s2, zip), { pisni: 1, dat: 1 });
  assert.equal(de.decode(await s2.cti('Óda.musicxml')), '<score-partwise/>');
  await assert.rejects(obnov(s2, (await import('../static/lib/zip.js')).zabalZip(new Map([['x.txt', XML]]))), /není záloha/);
});

test('folder on disk: a change elsewhere (another process) is merged', async () => {
  const h = tmp(), s = new SlozkaUloziste(h);
  await s.pripravit();
  await s.zapisData('oblibene', { e: ['A'] });
  await s.ctiData('oblibene');
  await new Promise(r => setTimeout(r, 20));
  await new SlozkaUloziste(fsSlozka(h.cesta)).zapisData('oblibene', { e: ['A', 'B'] });
  assert.deepEqual(await s.zapisData('oblibene', { e: ['A', 'C'] }), { e: ['A', 'B', 'C'] });
  await assert.rejects(h.getFileHandle('../x', { create: true }), /neplatné/);
});

test('restore accepts a zip of the Rusalka folder itself (one wrapping folder, as Finder makes it)', async () => {
  const { zabalZip } = await import('../static/lib/zip.js');
  const s = new SlozkaUloziste(new FakeSlozka()); await s.pripravit();
  const zip = zabalZip(new Map([['Rusalka/rusalka.json', en.encode('{ "verze": 1 }')], ['Rusalka/pisne/A.musicxml', XML],
    ['Rusalka/data/profily.json', en.encode('[{"id":"e","jmeno":"Ema"}]')]]));
  assert.deepEqual(await obnov(s, zip), { pisni: 1, dat: 1 });
  assert.deepEqual((await s.seznam()).map(x => x.soubor), ['A.musicxml']);
  assert.equal((await s.ctiData('profily'))[0].jmeno, 'Ema');
  await assert.rejects(obnov(s, zabalZip(new Map([['A/pisne/x.musicxml', XML], ['B/data/profily.json', en.encode('[]')]]))), /není záloha/);
  await assert.rejects(obnov(s, zabalZip(new Map([['Rusalka/notes.txt', XML]]))), /není záloha/);
});

test('folder: repeated writes from a stale view keep external additions and tombstones', async () => {
  const h = new FakeSlozka(), a = new SlozkaUloziste(h), b = new SlozkaUloziste(h);
  const ema = { id: 'e', jmeno: 'Ema' }, ota = { id: 'o', jmeno: 'Ota' };
  await a.zapisData('profily', [ema, ota]);
  await b.zapisData('profily', [{ id: 'e', smazano: 10 }, ota, { id: 'a' }]);
  await a.zapisData('profily', [ema, { ...ota, jmeno: 'Otík' }]);
  const dalsi = await a.zapisData('profily', [ema, { ...ota, jmeno: 'Otíček' }]);
  assert.deepEqual(dalsi, [{ id: 'e', smazano: 10 }, { id: 'o', jmeno: 'Otíček' }, { id: 'a' }]);
});

test('browser: concurrent tabs keep both changes and repeated writes preserve a removed favourite', async () => {
  globalThis.indexedDB = new IDBFactory(); _resetDb();
  const a = new ProhlizecUloziste(), { ProhlizecUloziste: DruhaZalozka } = await import('../static/lib/storage.js?druha-zalozka');
  const b = new DruhaZalozka();
  await a.zapisData('oblibene', { e: ['A'] });
  await b.ctiData('oblibene');
  await Promise.all([a.zapisData('oblibene', { e: [], f: ['B'] }), b.zapisData('oblibene', { e: ['A'], j: ['C'] })]);
  assert.deepEqual(await a.zapisData('oblibene', { e: [], f: ['B', 'D'] }), { e: [], f: ['B', 'D'], j: ['C'] });
  const c = new ProhlizecUloziste();
  assert.deepEqual(await c.ctiData('oblibene'), { e: [], f: ['B', 'D'], j: ['C'] });
});

test('browser: a closed connection is reopened for the next read and write', async () => {
  const skutecna = new IDBFactory(); let spojeni;
  globalThis.indexedDB = { open(...args) {
    const r = skutecna.open(...args);
    r.addEventListener('success', () => { spojeni = r.result; });
    return r;
  } };
  _resetDb();
  const u = new ProhlizecUloziste();
  await u.zapisData('profil', 'e');
  spojeni.close();
  assert.equal(await u.ctiData('profil'), 'e');
  forceCloseDatabase(spojeni);
  await u.zapisData('profil', 'f');
  assert.equal(await u.ctiData('profil'), 'f');
});

test('folder: changes with an older mtime or the same mtime and size survive a write', async () => {
  const h = new FakeSlozka(), a = new SlozkaUloziste(h), b = new SlozkaUloziste(h);
  await a.zapisData('vysledky', { e: { a: 1 } });
  const f = (await h.getDirectoryHandle('data')).deti.get('vysledky.json');
  const cas = f.lastModified;
  await b.zapisData('vysledky', { e: { b: 2 } }, { prepsat: true });
  f.lastModified = cas - 1;
  assert.deepEqual(await a.zapisData('vysledky', { e: { a: 3 } }), { e: { a: 3, b: 2 } });
  await a.ctiData('vysledky');
  const novyCas = f.lastModified, velikost = f.data.length;
  await b.zapisData('vysledky', { e: { a: 3, c: 4 } }, { prepsat: true });
  assert.equal(f.data.length, velikost);
  f.lastModified = novyCas;
  assert.deepEqual(await a.zapisData('vysledky', { e: { a: 5, b: 2 } }), { e: { a: 5, c: 4 } });
});

test('folder: corrupt JSON is copied and reported before replacement', async () => {
  const h = new FakeSlozka(), hlaseni = [], u = new SlozkaUloziste(h, e => hlaseni.push(e.message));
  const d = await h.getDirectoryHandle('data', { create: true });
  const w = await (await d.getFileHandle('profily.json', { create: true })).createWritable();
  await w.write('{broken'); await w.close();
  await assert.rejects(u.ctiData('profily'), /poškozený/);
  await u.zapisData('profily', [{ id: 'e' }]);
  const kopie = [...d.deti.keys()].find(jm => jm.startsWith('profily.json.poskozeny-'));
  assert.ok(kopie);
  assert.equal(de.decode(d.deti.get(kopie).data), '{broken');
  assert.equal(hlaseni.length, 1);
  assert.deepEqual(await u.ctiData('profily'), [{ id: 'e' }]);
});

test('folder: a read failure is surfaced and the unreadable original is left alone', async () => {
  const h = new FakeSlozka(), u = new SlozkaUloziste(h);
  await u.zapisData('profil', 'e');
  const f = (await h.getDirectoryHandle('data')).deti.get('profil.json');
  f.getFile = async () => { throw new DOMException('permission lost', 'NotAllowedError'); };
  await assert.rejects(u.ctiData('profil'), { name: 'NotAllowedError' });
  await assert.rejects(u.zapisData('profil', 'f'), { name: 'NotAllowedError' });
  assert.equal(de.decode(f.data), '"e"');
  f.getFile = async () => { throw new DOMException('file was removed', 'NotFoundError'); };
  assert.equal(await u.ctiData('profil'), null);
});

test('folder: a newer marker prevents creating, overwriting or deleting files', async () => {
  const h = new FakeSlozka(), u = new SlozkaUloziste(h);
  await u.pripravit();
  await u.zapis('A.musicxml', XML);
  const w = await (await h.getFileHandle('rusalka.json')).createWritable();
  await w.write('{"verze":2}'); await w.close();
  const chyba = /novější/;
  await assert.rejects(u.pripravit(), chyba);
  await assert.rejects(u.ctiData('profily'), chyba);
  await assert.rejects(u.zapisData('profily', []), chyba);
  await assert.rejects(u.zapis('A.musicxml', XML, { prepsat: true }), chyba);
  await assert.rejects(u.smaz('A.musicxml'), chyba);
});

test('restore validates JSON before changing songs and replaces the keys present in the archive', async () => {
  const u = new SlozkaUloziste(new FakeSlozka()); await u.pripravit();
  await u.zapis('A.musicxml', XML); await u.zapisData('profily', [{ id: 'e' }]);
  const jinde = new SlozkaUloziste(u.h);
  for (const profily of ['{broken', '{}']) {
    await assert.rejects(obnov(jinde, zabalZip({ 'pisne/A.musicxml': '<new/>', 'data/profily.json': profily })), /poškozený/);
  }
  assert.equal(de.decode(await u.cti('A.musicxml')), '<score-partwise/>');
  await obnov(jinde, zabalZip({ 'data/profily.json': '[{"id":"f"}]' }));
  assert.deepEqual(await u.ctiData('profily'), [{ id: 'f' }]);
});

test('ZIP rejects truncated payload, central and local records, and bad CRC', async () => {
  for (const zmena of [
    (v, cd) => v.setUint32(cd + 20, v.byteLength, true),
    (v, cd) => v.setUint16(cd + 28, v.byteLength, true),
    (v, cd) => v.setUint32(cd + 42, cd - 1, true),
    (v, cd) => v.setUint8(cd - 1, 0),
  ]) {
    const z = zabalZip({ 'a.txt': 'hello' }), v = new DataView(z.buffer);
    zmena(v, v.getUint32(z.length - 6, true));
    await assert.rejects(rozbalZip(z), /poškozený ZIP/i);
  }
});

test('ZIP bounds the total size and number of entries', async () => {
  const velky = new Uint8Array(20 * 1024 * 1024);
  assert.throws(() => zabalZip({ a: velky, b: velky, c: velky, d: velky, e: velky, f: velky }), /příliš/);
  const z = zabalZip({ a: '' }), v = new DataView(z.buffer);
  v.setUint16(z.length - 12, 10001, true);
  await assert.rejects(rozbalZip(z), /příliš/);
  assert.throws(() => zabalZip(new Map(Array.from({ length: 10001 }, (_, i) => [String(i), '']))), /příliš/);
  const archiv = zabalZip({ a: '', b: '', c: '', d: '', e: '', f: '' }), adresar = new DataView(archiv.buffer);
  const start = adresar.getUint32(archiv.length - 6, true);
  for (let p = start; p < archiv.length - 22; p += 47) adresar.setUint32(p + 24, velky.length, true);
  await assert.rejects(rozbalZip(archiv), /příliš/);
});

test('ZIP decodes CP437 names when the UTF-8 flag is clear', async () => {
  const z = zabalZip({ 'X.txt': 'hello' }), v = new DataView(z.buffer), cd = v.getUint32(z.length - 6, true);
  v.setUint16(6, 0, true); v.setUint16(cd + 8, 0, true);
  z[30] = z[cd + 46] = 0x82;
  assert.deepEqual([...await rozbalZip(z)].map(([jm]) => jm), ['é.txt']);
});

test('write queue flushes both edits and feeds the latest merged result back to the application', async () => {
  const { datoveZapisy } = await import('../static/lib/storage.js');
  const h = new FakeSlozka(), a = new SlozkaUloziste(h), b = new SlozkaUloziste(h);
  let stav = { e: ['A'] };
  await a.zapisData('oblibene', stav);
  const fronta = datoveZapisy(a, (k, v) => { stav = v; }, (k, e) => { throw e; });
  fronta.cteno('oblibene', stav);
  await b.zapisData('oblibene', { e: ['A', 'B'] });
  stav = { e: ['A', 'C'] }; fronta.pis('oblibene', stav);
  stav = { e: ['C', 'D'] }; fronta.pis('oblibene', stav);
  await fronta.dokonci();
  assert.deepEqual(stav, { e: ['B', 'C', 'D'] });
  assert.deepEqual(await a.ctiData('oblibene'), stav);
});

test('resuming folder storage transfers only changes made in the browser while permission was missing', async () => {
  globalThis.indexedDB = new IDBFactory(); _resetDb();
  const p = new ProhlizecUloziste(), s = new SlozkaUloziste(new FakeSlozka());
  const zaklad = { profily: [{ id: 'e', jmeno: 'staré' }], vysledky: { e: { A: 1 } } };
  await p.zapisData('profily', zaklad.profily);
  await p.zapisData('vysledky', { e: { A: 1, B: 2 } });
  await s.zapisData('profily', [{ id: 'e', jmeno: 'nové' }]);
  await s.zapisData('vysledky', { e: { A: 3, C: 4 } });
  await kopiruj(p, s, { zaklad });
  assert.deepEqual(await s.ctiData('profily'), [{ id: 'e', jmeno: 'nové' }]);
  assert.deepEqual(await s.ctiData('vysledky'), { e: { A: 3, B: 2, C: 4 } });
});

test('restore stops if saving the automatic backup fails', async () => {
  const u = new SlozkaUloziste(new FakeSlozka());
  await u.zapisData('profily', [{ id: 'e' }]);
  await assert.rejects(obnov(u, zabalZip({ 'data/profily.json': '[{"id":"f"}]' }), { predObnovou: async zip => {
    assert.equal(de.decode((await rozbalZip(zip)).get('data/profily.json')).includes('"e"'), true);
    throw new Error('backup failed');
  } }), /backup failed/);
  assert.deepEqual(await u.ctiData('profily'), [{ id: 'e' }]);
});

test('browser: concurrent plays on the same day each count in the diary', async () => {
  globalThis.indexedDB = new IDBFactory(); _resetDb();
  const a = new ProhlizecUloziste(), b = new ProhlizecUloziste();
  const den = '2026-11-22';
  await a.zapisData('denik', { e: { [den]: [1, .5, 1] } });
  await b.ctiData('denik');
  await Promise.all([a.zapisData('denik', { e: { [den]: [2, 1, 2] } }), b.zapisData('denik', { e: { [den]: [2, 1, 2] } })]);
  assert.deepEqual(await a.ctiData('denik'), { e: { [den]: [3, 1.5, 3] } });
});

test('resuming the folder also moves songs added or changed in the browser while permission was missing', async () => {
  globalThis.indexedDB = new IDBFactory(); _resetDb();
  const p = new ProhlizecUloziste(), s = new SlozkaUloziste(new FakeSlozka());
  await s.pripravit();
  await p.zapis('Stará.musicxml', XML, { prepsat: true });
  await p.zapis('Upravená.musicxml', XML, { prepsat: true });
  await s.zapis('Stará.musicxml', en.encode('<novejsi-ve-slozce/>'), { prepsat: true });
  const zaklad = await snimekUloziste(p);                         // the snapshot when the folder started waiting
  await p.zapis('Nová.musicxml', en.encode('<nova/>'), { prepsat: true });
  await p.zapis('Upravená.musicxml', en.encode('<upravena/>'), { prepsat: true });
  await kopiruj(p, s, { zaklad });
  assert.deepEqual((await s.seznam()).map(x => x.soubor), ['Nová.musicxml', 'Stará.musicxml', 'Upravená.musicxml']);
  assert.equal(de.decode(await s.cti('Nová.musicxml')), '<nova/>');
  assert.equal(de.decode(await s.cti('Upravená.musicxml')), '<upravena/>');
  assert.equal(de.decode(await s.cti('Stará.musicxml')), '<novejsi-ve-slozce/>', 'an unchanged browser song does not overwrite the folder');
  // an older snapshot without the songs' fingerprints: only songs the folder does not have yet
  const s2 = new SlozkaUloziste(new FakeSlozka());
  await s2.pripravit();
  await s2.zapis('Upravená.musicxml', XML, { prepsat: true });
  const { pisne: _, ...stary } = zaklad;
  await kopiruj(p, s2, { zaklad: stary });
  assert.deepEqual((await s2.seznam()).map(x => x.soubor), ['Nová.musicxml', 'Stará.musicxml', 'Upravená.musicxml']);
  assert.equal(de.decode(await s2.cti('Upravená.musicxml')), '<score-partwise/>');
});

test('after a full, checked copy into the folder the browser copy is emptied; back to the browser overwrites', async () => {
  globalThis.indexedDB = new IDBFactory(); _resetDb();
  const p = new ProhlizecUloziste(), s = new SlozkaUloziste(new FakeSlozka());
  await s.pripravit();
  await p.zapis('A.musicxml', XML, { prepsat: true });
  await p.zapis('zalohy/A.musicxml', XML, { prepsat: true });
  await p.zapisData('profily', [{ id: 'e', jmeno: 'Ema' }]);
  await p.zapisData('oblibene', { e: ['A.musicxml'] });
  const zaklad = await presunDoSlozky(p, s);
  await p.zapisData('denik', { e: { '2026-11-23': [1, 1, 1] } });          // a write still landing in the browser
  assert.equal(await vyprazdniPoPresunu(p, zaklad), false, 'not emptied: the browser changed after the copy');
  await p.zapisData('denik', null, { prepsat: true });
  assert.equal(await vyprazdniPoPresunu(p, zaklad), true);
  assert.deepEqual((await s.seznam()).map(x => x.soubor), ['A.musicxml']);
  assert.deepEqual(await s.ctiData('oblibene'), { e: ['A.musicxml'] });
  assert.deepEqual(await p.seznam(), [], 'no stale copy left in the browser');
  assert.equal(await p.ctiData('profily'), null);
  assert.equal(de.decode(await p.cti('zalohy/A.musicxml')), '<score-partwise/>', 'editor backups stay');
  // in the folder the song is deleted and the favourite removed; back to the browser nothing old comes back
  await s.smaz('A.musicxml');
  await s.zapisData('oblibene', { e: [] });
  await p.zapis('B.musicxml', XML, { prepsat: true });               // left in the browser from a waiting period
  await p.zapisData('oblibene', { e: ['A.musicxml'] }, { zaklad: null });
  await kopiruj(s, p, { prepsat: true });
  assert.deepEqual(await p.seznam(), []);
  assert.deepEqual(await p.ctiData('oblibene'), { e: [] });
});

test('a copy that fails or does not check out leaves the browser data untouched', async () => {
  globalThis.indexedDB = new IDBFactory(); _resetDb();
  const p = new ProhlizecUloziste(), h = new FakeSlozka(), s = new SlozkaUloziste(h);
  await s.pripravit();
  await p.zapis('A.musicxml', XML, { prepsat: true });
  await p.zapisData('profily', [{ id: 'e', jmeno: 'Ema' }]);
  const pisne = await h.getDirectoryHandle('pisne');
  const puvodni = pisne.getFileHandle.bind(pisne);
  pisne.getFileHandle = async (n, o) => { const f = await puvodni(n, o); if (o?.create) f.createWritable = async () => ({ write: async () => {}, close: async () => {} }); return f; };
  await assert.rejects(presunDoSlozky(p, s));
  assert.deepEqual((await p.seznam()).map(x => x.soubor), ['A.musicxml']);
  assert.deepEqual(await p.ctiData('profily'), [{ id: 'e', jmeno: 'Ema' }]);
});

test('folder: an unreadable marker is rewritten instead of locking the folder; a newer one still stops it', async () => {
  const h = new FakeSlozka(), u = new SlozkaUloziste(h);
  await u.pripravit();
  await u.zapisData('profily', [{ id: 'e', jmeno: 'Ema' }]);
  const w = await (await h.getFileHandle('rusalka.json')).createWritable();
  await w.write('{"verze":'); await w.close();
  assert.deepEqual(await u.ctiData('profily'), [{ id: 'e', jmeno: 'Ema' }]);
  assert.deepEqual(JSON.parse(de.decode(new Uint8Array(await (await (await h.getFileHandle('rusalka.json')).getFile()).arrayBuffer()))), { verze: 1 });
  const w2 = await (await h.getFileHandle('rusalka.json')).createWritable();
  await w2.write('{"verze":2}'); await w2.close();
  await assert.rejects(u.ctiData('profily'), /novější/);
});

test('stored data are checked one level deeper: per-player values and dangerous keys', async () => {
  const s = new SlozkaUloziste(new FakeSlozka());
  await s.pripravit();
  const d = await s.h.getDirectoryHandle('data');
  const zapis = async (klic, text) => { const w = await (await d.getFileHandle(klic + '.json', { create: true })).createWritable(); await w.write(text); await w.close(); };
  for (const [klic, text] of [['vysledky', '{"p1": 5}'], ['statistiky', '{"p1": [1]}'], ['oblibene', '{"p1": {"a": 1}}'],
    ['vysledky', '{"__proto__": {"x": 1}}'], ['denik', '{"p1": {"constructor": [1, 1, 1]}}'], ['nastaveni', '{"p1": null}']]) {
    await zapis(klic, text);
    await assert.rejects(s.ctiData(klic), /poškozen/, `${klic}: ${text}`);
  }
  await zapis('vysledky', '{"p1": {"A.musicxml": {"tempo": {"hvezdy": 3}}}}');
  assert.deepEqual(await s.ctiData('vysledky'), { p1: { 'A.musicxml': { tempo: { hvezdy: 3 } } } });
  await zapis('oblibene', '{"p1": ["A.musicxml"]}');
  assert.deepEqual(await s.ctiData('oblibene'), { p1: ['A.musicxml'] });
});
