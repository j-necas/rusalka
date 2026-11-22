import './setup.mjs';
import { test } from 'node:test';
import { nastavJazyk } from '../static/lib/texts.js';

import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { rozbalZip, zabalZip } from '../static/lib/zip.js';
import { xmlZBajtu, nazevZXml, jmenoSouboru, volneJmeno, jeNota, vyberBezFiltru } from '../static/lib/files.js';

const en = new TextEncoder();
const XML = '<?xml version="1.0"?><score-partwise><work><work-title>Silent Night &amp; spol.</work-title></work></score-partwise>';

test('zip: pack and unpack (UTF-8 names)', async () => {
  const z = zabalZip(new Map([['pisne/Óda.musicxml', en.encode(XML)], ['data/profily.json', en.encode('[]')]]));
  const r = await rozbalZip(z);
  assert.deepEqual([...r.keys()], ['pisne/Óda.musicxml', 'data/profily.json']);
  assert.equal(new TextDecoder().decode(r.get('pisne/Óda.musicxml')), XML);
});

/** mxl as from MuseScore: deflate, container.xml points to the score */
function mxl({ deflate = true, container = true } = {}) {
  const soubory = [];
  if (container) soubory.push(['META-INF/container.xml', en.encode('<container><rootfiles><rootfile full-path="noty.xml"/></rootfiles></container>')]);
  soubory.push(['noty.xml', en.encode(XML)]);
  // hand-built ZIP with deflate (zabalZip only writes stored entries)
  const lok = [], cen = [];
  let off = 0;
  for (const [jm, data] of soubory) {
    const komp = deflate ? deflateRawSync(data) : data, j = en.encode(jm);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(deflate ? 8 : 0, 8);
    h.writeUInt32LE(komp.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(j.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(deflate ? 8 : 0, 10);
    c.writeUInt32LE(komp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(j.length, 28); c.writeUInt32LE(off, 42);
    lok.push(h, j, komp); cen.push(c, j);
    off += 30 + j.length + komp.length;
  }
  const cd = Buffer.concat(cen), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(soubory.length, 8); e.writeUInt16LE(soubory.length, 10);
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...lok, cd, e]));
}

test('mxl: deflate with and without container.xml', async () => {
  assert.equal(await xmlZBajtu('a.mxl', mxl()), XML);
  assert.equal(await xmlZBajtu('a.mxl', mxl({ container: false, deflate: false })), XML);
  await assert.rejects(xmlZBajtu('a.mxl', en.encode('x')), /není ZIP/);
});

test('text: UTF-8 with BOM and UTF-16', async () => {
  assert.equal(await xmlZBajtu('a.xml', new Uint8Array([0xEF, 0xBB, 0xBF, ...en.encode('<a/>')])), '<a/>');
  const u16 = new Uint8Array([0xFF, 0xFE, ...[...'<b/>'].flatMap(c => [c.charCodeAt(0), 0])]);
  assert.equal(await xmlZBajtu('a.xml', u16), '<b/>');
});

test('song title and file names', () => {
  assert.equal(nazevZXml(XML, 'x.musicxml'), 'Silent Night & spol.');
  assert.equal(nazevZXml('<movement-title>Menuet</movement-title>', 'x.xml'), 'Menuet');
  assert.equal(nazevZXml('<score-partwise/>', 'Moje píseň.mxl'), 'Moje píseň');
  assert.equal(jmenoSouboru('a/b: c?'), 'a b c.musicxml');
  assert.equal(jmenoSouboru('Hotovo.mxl'), 'Hotovo.mxl');
  const je = new Set(['A.musicxml', 'A (2).musicxml']);
  assert.equal(volneJmeno('A.musicxml', s => je.has(s)), 'A (3).musicxml');
  assert.ok(jeNota('x.MXL') && !jeNota('x.pdf'));
});

test('mxl: plain XML text named .mxl (already unpacked) is read, garbage is not', async () => {
  const t = s => new TextEncoder().encode(s);
  assert.equal(await xmlZBajtu('B.mxl', t('﻿  <?xml version="1.0"?><score-partwise/>')), '  <?xml version="1.0"?><score-partwise/>');
  await assert.rejects(xmlZBajtu('B.mxl', t('ahoj')), /není ZIP/);
});

test('iPhone and iPad (also an iPad that says it is a Mac) grey out .musicxml in the file picker – no accept filter there', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
  assert.equal(vyberBezFiltru({ userAgent: iphone, maxTouchPoints: 5 }), true);
  assert.equal(vyberBezFiltru({ userAgent: mac, maxTouchPoints: 5 }), true, 'iPadOS Safari reports a Mac');
  assert.equal(vyberBezFiltru({ userAgent: mac, maxTouchPoints: 0 }), false, 'a real Mac keeps the filter');
  assert.equal(vyberBezFiltru({ userAgent: android, maxTouchPoints: 5 }), false);
});

test('MusicXML honors Windows-1250, ISO-8859-1 and UTF-16 without a BOM', async () => {
  const xml = k => `<?xml version="1.0" encoding="${k}"?><score-partwise><work><work-title>`;
  const konec = '</work-title></work></score-partwise>';
  const okna = Buffer.concat([Buffer.from(xml('windows-1250')), Buffer.from([0x8e, 0x6c, 0x75, 0x9d, 0x6f, 0x75, 0xe8, 0x6b, 0xfd]), Buffer.from(konec)]);
  assert.equal(nazevZXml(await xmlZBajtu('a.xml', okna), 'a.xml'), 'Žluťoučký');
  const latin = Buffer.from(xml('ISO-8859-1') + 'Noël' + konec, 'latin1');
  const archiv = zabalZip(new Map([['a.musicxml', latin]]));
  assert.equal(nazevZXml(await xmlZBajtu('a.mxl', archiv), 'a.mxl'), 'Noël');
  const utf16 = Buffer.from(xml('UTF-16') + 'Píseň' + konec, 'utf16le');
  assert.equal(nazevZXml(await xmlZBajtu('a.xml', utf16), 'a.xml'), 'Píseň');
  assert.equal(nazevZXml(await xmlZBajtu('a.xml', Buffer.from(utf16).swap16()), 'a.xml'), 'Píseň');
});

test('MusicXML file errors are translated in the active language', async () => {
  nastavJazyk('en');
  try {
    await assert.rejects(xmlZBajtu('a.mxl', en.encode('x')), /not a ZIP archive/);
    const archiv = zabalZip(new Map([['readme.txt', en.encode('x')]]));
    await assert.rejects(xmlZBajtu('a.mxl', archiv), /no sheet music in the archive/);
  } finally { nastavJazyk('cs'); }
});
