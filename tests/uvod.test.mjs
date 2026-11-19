// The introduction pages (tools/uvod.mjs): every language of the app has its texts, and the redirect knows every page.
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { UVODY, stranka, mapaWebu } from '../tools/uvod.mjs';
import { NAZVY_JAZYKU } from '../static/lib/texts.js';

const en = JSON.parse(readFileSync(new URL('../tools/uvod/en.json', import.meta.url), 'utf8'));

test('every app language has an introduction page with the same texts as English', () => {
  assert.deepEqual(UVODY.map(u => u.kod).sort(), Object.keys(NAZVY_JAZYKU).sort());
  for (const { kod } of UVODY) {
    const t = JSON.parse(readFileSync(new URL(`../tools/uvod/${kod}.json`, import.meta.url), 'utf8'));
    assert.deepEqual(Object.keys(t), Object.keys(en), kod);
    for (const [k, v] of Object.entries(t)) {
      if (typeof v !== 'string') continue;
      assert.ok(!v.includes('—'), `${kod}.${k}: no em dash`);
      for (const z of ['{song}', '{webmidi}', '{app}', '{languages}', '<b>']) assert.equal(v.includes(z), en[k].includes(z), `${kod}.${k}: ${z}`);
    }
    const h = stranka(kod);
    assert.match(h, new RegExp(`<html lang="${kod}"`));
    assert.ok(!/\{(song|webmidi|app|languages)\}/.test(h), kod);
    for (const v of UVODY) assert.ok(h.includes(`hreflang="${v.kod}" href="https://rusalkapiano.com/${v.slug}/"`), `${kod} → ${v.kod}`);
  }
  assert.match(stranka('ar'), /dir="rtl"/);
  assert.match(stranka('sk'), /noty-cs\.webp/);
  assert.match(stranka('de'), /noty-en\.webp/);
  assert.equal(mapaWebu().match(/<loc>/g).length, UVODY.length + 1);
});

test('the first-visit redirect (static/prvni.js) knows every page and maps browser languages', () => {
  const okno = { location: { hostname: 'localhost', pathname: '/', search: '', hash: '' }, navigator: { languages: ['de-DE'] },
    localStorage: { getItem: () => null }, matchMedia: () => ({ matches: false }) };
  okno.window = okno;
  vm.runInNewContext(readFileSync(new URL('../static/prvni.js', import.meta.url), 'utf8'), Object.assign(okno, { Object, String }));
  const slozka = okno.slozkaUvodu;
  for (const u of UVODY) assert.equal(slozka(u.kod), u.slug);
  assert.equal(slozka('cs-CZ'), 'cs'); assert.equal(slozka('pt-BR'), 'pt-br'); assert.equal(slozka('pt-PT'), 'pt');
  assert.equal(slozka('zh-Hans-CN'), 'zh-cn'); assert.equal(slozka('nl-NL'), 'en'); assert.equal(slozka(''), 'en');
});
