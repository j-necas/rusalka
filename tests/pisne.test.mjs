// The song pages (tools/pisne.mjs): every library and starter song has a page, texts complete, the notes coloured.
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JAZYKY_PISNI, pisne, strankaPisne, seznamPisni, autorText, adresyPisni } from '../tools/pisne.mjs';
import { stranka, mapaWebu, UVODY } from '../tools/uvod.mjs';

const nacti = cesta => JSON.parse(readFileSync(new URL(cesta, import.meta.url), 'utf8'));
const en = nacti('../tools/uvod/pisne-en.json');

test('every song language has the same texts as English, and an introduction page', () => {
  for (const kod of JAZYKY_PISNI) {
    assert.ok(UVODY.some(u => u.kod === kod), kod);
    const t = nacti(`../tools/uvod/pisne-${kod}.json`);
    assert.deepEqual(Object.keys(t), Object.keys(en), kod);
    for (const [k, v] of Object.entries(t)) {
      assert.ok(!v.includes('—'), `${kod}.${k}: no em dash`);
      for (const z of ['{song}', '{chords}', '{lyrics}', '{notes}', '{count}']) assert.equal(v.includes(z), en[k].includes(z), `${kod}.${k}: ${z}`);
    }
    assert.match(t.folder, /^[a-z-]+$/);
  }
});

test('every library and starter song has exactly one page, Slovak songs with the Czech ones', () => {
  const v = pisne();
  assert.equal(v.length, nacti('../library/catalog.json').length + nacti('../songs/index.json').length);
  assert.equal(new Set(v.map(p => p.cesta)).size, v.length);
  for (const p of v) {
    assert.ok(JAZYKY_PISNI.includes(p.stranka), p.cesta);
    assert.match(p.cesta, /^[a-z]{2}\/[a-z-]+\/[a-z0-9-]+\/$/);
  }
  assert.equal(v.find(p => p.jmeno === 'skakal-pes').cesta, 'cs/noty/skakal-pes/');
  assert.ok(v.filter(p => p.jazyk === 'sk').every(p => p.stranka === 'cs'));
  assert.ok(v.filter(p => p.jazyk === 'ja').every(p => p.stranka === 'en'));
});

test('a song page: canonical, the notes in coloured circles with Czech names, lyrics, chords, structured data', async () => {
  const p = pisne().find(q => q.jmeno === 'skakal-pes');
  const { html } = await strankaPisne(p);
  assert.match(html, /<html lang="cs">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/rusalkapiano.com\/cs\/noty\/skakal-pes\/">/);
  assert.match(html, /<title>Skákal pes – noty pro klavír s písmeny<\/title>/);
  // 24 melody notes, drawn twice (the wide and the narrow sheet), and the five keys D–A on the keyboard
  assert.equal((html.match(/<g class="ovl">/g) || []).length, 2 * 24 + 5);
  assert.match(html, /class="pismeno tmave"[^>]*>E</);
  assert.match(html, /Skákal pes přes oves,<br>/);
  assert.match(html, /<b>G7<\/b>/);
  assert.match(html, /<a class="hrat" href="\.\.\/\.\.\/\.\.\/#pisen=library%2Fchildren%2Fskakal-pes\.musicxml">/, 'the button opens this song in the app');
  assert.ok(!html.includes('>Melodie<'), 'no part name on the staff');
  for (const blok of html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s).slice(1)) JSON.parse(blok);
  // H, not B, on the Czech pages; Do-Re-Mi on the French ones
  const cs = await strankaPisne(pisne().find(q => q.stranka === 'cs' && /B4|B3|B5/.test(readFileSync(new URL(`../library/${q.txt}`, import.meta.url), 'utf8'))));
  assert.match(cs.html, />H<\/text>/);
  const fr = await strankaPisne(pisne().find(q => q.jmeno === 'a-la-claire-fontaine'));
  assert.match(fr.html, />Fa<\/text>/);
});

test('the author line in the page language', () => {
  assert.equal(autorText('traditional', 'cs'), 'lidová');
  assert.equal(autorText('traditional, lyrics by Robert Burns', 'cs'), 'lidová, text: Robert Burns');
  assert.equal(autorText('music by Georges Bizet, lyrics by Henri Meilhac and Ludovic Halévy', 'de'), 'Musik: Georges Bizet, Text: Henri Meilhac and Ludovic Halévy');
  assert.equal(autorText('Wolfgang Amadeus Mozart', 'fr'), 'Wolfgang Amadeus Mozart');
  assert.equal(autorText('traditional, lyrics by Robert Burns', 'en'), 'traditional, lyrics by Robert Burns');
});

test('the lists, the sitemap and the links from the introduction pages', () => {
  for (const kod of JAZYKY_PISNI) {
    const { cesta, html } = seznamPisni(kod);
    for (const p of pisne().filter(q => q.stranka === kod)) assert.ok(html.includes(`href="${p.jmeno}/"`), `${cesta}: ${p.jmeno}`);
    assert.match(stranka(kod), new RegExp(`<a href="${cesta.split('/')[1]}/">`), `${kod} links to its sheet music`);
  }
  assert.ok(!stranka('pl').includes('pisne'), 'no list for a language without songs');
  const mapa = mapaWebu();
  assert.equal(mapa.match(/<loc>/g).length, UVODY.length + adresyPisni().length);
  assert.ok(mapa.includes('<loc>https://rusalkapiano.com/cs/noty/skakal-pes/</loc>'));
});

test('the published page lazy-loads just one layout for a large score and preserves its accessible name', async () => {
  const p = pisne().find(q => q.jmeno === 'jingle-bells');
  const puvodni = await strankaPisne(p);
  const hotova = await strankaPisne(p, { externe: true });
  assert.ok(Buffer.byteLength(puvodni.html) > 150000);
  assert.ok(Buffer.byteLength(hotova.html) < 150000);
  assert.match(hotova.html, /<picture>\s*<source media="\(max-width: 600px\)" srcset="noty-uzke\.svg"/);
  assert.match(hotova.html, /<img src="noty-siroke\.svg" loading="lazy"[^>]+alt="Sheet music of Jingle Bells/);
  for (const f of ['noty-uzke.svg', 'noty-siroke.svg']) {
    assert.match(hotova.soubory[f], /^<svg viewBox="0 0 \d+ \d+"/);
    assert.match(hotova.soubory[f], /<style>[^<]+\.pismeno/);
    assert.match(hotova.soubory[f], /<g class="ovl">/);
  }
});

test('introduction and song pages set CSP before scripts and preserve structured data', () => {
  for (const html of [stranka('cs'), seznamPisni('cs').html]) {
    const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
    assert.ok(csp);
    assert.ok(html.indexOf(csp) < html.indexOf('<script'));
    assert.match(csp, /script-src 'self';/);
    assert.match(html, /<script type="application\/ld\+json">/);
  }
});
