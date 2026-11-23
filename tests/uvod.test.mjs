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
    assert.deepEqual([...h.matchAll(/<a class="hrat" href="\.\.\/#guest">([^<]+)<\/a>/g)].map(m => m[1]),
      [t.startGuest, t.startGuest], kod);
    assert.ok(!/\{(song|webmidi|app|languages)\}/.test(h), kod);
    for (const v of UVODY) assert.ok(h.includes(`hreflang="${v.kod}" href="https://rusalkapiano.com/${v.slug}/"`), `${kod} → ${v.kod}`);
  }
  assert.match(stranka('ar'), /dir="rtl"/);
  assert.match(stranka('sk'), /noty-cs\.webp/);
  assert.match(stranka('de'), /noty-en\.webp/);
  assert.ok(mapaWebu().match(/<loc>/g).length > UVODY.length);   // + the song pages (tests/pisne.test.mjs)
  assert.ok(!mapaWebu().includes('<loc>https://rusalkapiano.com/</loc>'), 'the app at / redirects crawlers, not in the sitemap');
  for (const kod of ['cs', 'ja', 'ar']) {
    const ld = JSON.parse(stranka(kod).match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    assert.equal(ld['@type'], 'WebApplication'); assert.equal(ld.inLanguage, kod);
    assert.equal(ld.description, JSON.parse(readFileSync(new URL(`../tools/uvod/${kod}.json`, import.meta.url), 'utf8')).description);
  }
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

test('rusalkapiano.com without a player redirects to the introduction unless opened from it or with a link', () => {
  const zkus = ({ lokalni = {}, relace = {}, hraci = false, hash = '' } = {}) => {
    let kam = null;
    const ulozka = m => Object.defineProperties(m, {     // like Storage: Object.keys lists the stored keys only
      getItem: { value: k => (Object.hasOwn(m, k) ? m[k] : null) }, setItem: { value: (k, v) => { m[k] = String(v); } },
      removeItem: { value: k => { delete m[k]; } } });
    const okno = { location: { hostname: 'rusalkapiano.com', pathname: '/', search: '', hash, replace: u => { kam = u; } },
      navigator: { languages: ['cs-CZ'] }, localStorage: ulozka(lokalni), sessionStorage: ulozka(relace), matchMedia: () => ({ matches: false }) };
    okno.window = okno;
    vm.runInNewContext(readFileSync(new URL('../static/prvni.js', import.meta.url), 'utf8'), Object.assign(okno, { Object, String }));
    if (!kam) okno.naUvodniStranku('cs', hraci);           // the app's own check once its data is read
    return { kam, lokalni };
  };
  assert.equal(zkus().kam, '/cs/');
  const stara = zkus({ lokalni: { 'rusalka-uvod': '1', 'kt-nastaveni': '{}' } });   // looked once, no player made
  assert.equal(stara.kam, '/cs/');
  assert.ok(!('rusalka-uvod' in stara.lokalni));
  assert.equal(zkus({ relace: { 'rusalka-uvod': '1' } }).kam, null);                // Start playing → Home
  assert.equal(zkus({ hash: '#guest' }).kam, null);
  assert.equal(zkus({ lokalni: { 'kt-profily': '[]' }, hraci: true }).kam, null);   // a player → the app
});
