import './setup.mjs';
import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProhlizecUloziste, SlozkaUloziste, kopiruj, zaloha, obnov, KLICE_DAT } from '../static/lib/storage.js';
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
