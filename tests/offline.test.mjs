import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { zapnoutOffline } from '../static/lib/offline.js';

const koren = new URL('../', import.meta.url);

/** the generated service worker in a sandbox: its top-level functions and the registered event handlers */
function nactiSW(text, zaklad = 'https://rusalkapiano.com/', prostredi = {}) {
  const handlery = {};
  const ctx = vm.createContext({ URL, Response, crypto, ...prostredi, self: { location: { href: zaklad + 'sw.js' },
    addEventListener: (k, f) => { handlery[k] = f; }, clients: { claim: async () => {} }, skipWaiting: async () => {} } });
  vm.runInContext(text, ctx);
  // top-level const (VERZE, SOUBORY) are not properties of the context, but later scripts in it see them
  const hodnota = jmeno => vm.runInContext(jmeno, ctx);
  return { ctx, handlery, hodnota };
}

test('offline: registered on the website, not without service worker support', async () => {
  const volani = [];
  const sw = { register: async (u, o) => { volani.push([u, o]); return 'ok'; } };
  assert.equal(await zapnoutOffline({ serviceWorker: sw }), 'ok');
  assert.deepEqual(volani, [['sw.js', { scope: './', updateViaCache: 'none' }]]);
  assert.equal(await zapnoutOffline({ serviceWorker: undefined }), null);
  // the dev server has no sw.js: the failed registration is quiet
  const chybi = { register: async () => { throw new Error('404'); } };
  assert.equal(await zapnoutOffline({ serviceWorker: chybi }), null);
});

test('offline: the web build lists every file of the website with its content hash, except the AI skill zips',
  { skip: !existsSync(new URL('static/vendor/verovio-toolkit-wasm.js', koren)) && 'no static/vendor' }, async t => {
  const ven = mkdtempSync(join(tmpdir(), 'rusalka-web-'));
  t.after(() => rmSync(ven, { recursive: true, force: true }));
  execFileSync('node', ['tools/web.mjs'], { cwd: fileURLToPath(koren), stdio: 'ignore', env: { ...process.env, RUSALKA_WEB_OUT: ven } });
  const { hodnota } = nactiSW(readFileSync(join(ven, 'sw.js'), 'utf8'));
  const S = hodnota('SOUBORY');
  const hash = cesta => createHash('sha256').update(readFileSync(join(ven, cesta))).digest('hex').slice(0, 12);
  for (const f of ['index.html', 'app.js', 'start.js', 'style.css', 'manifest.webmanifest', 'vendor/verovio-toolkit-wasm.js',
    'songs/index.json', 'songs/Ode to Joy.musicxml', 'sounds/piano/A0.mp3']) {
    assert.equal(S[f], hash(f), f);
  }
  if (existsSync(join(ven, 'library/index.json'))) assert.equal(S['library/index.json'], hash('library/index.json'));   // only after npm run library
  assert.ok(!Object.keys(S).some(f => f.startsWith('helper/')), 'the AI skill zips are not needed offline');
  assert.ok(!Object.keys(S).some(f => f.startsWith('video/')), 'videos are not kept offline (too big)');
  assert.ok(!Object.keys(S).some(f => /^(uvod|en|cs)\//.test(f)), 'the introduction pages are not kept offline');
  assert.ok(!('en/index.html' in S) && 'index.html' in S);
  assert.ok(!('sw.js' in S));
  const v = hodnota('VERZE');
  assert.match(v, /^[0-9a-f]{12}$/);
  const html = readFileSync(join(ven, 'index.html'), 'utf8');
  for (const f of ['app.js', 'start.js', 'prvni.js', 'fonts.css', 'style.css']) assert.ok(html.includes(`${f}?v=${v}`), f);
  for (const f of ['app.js', 'lib/texts.js', 'lang/cs.js', 'ui/editor.js']) {
    const imports = [...readFileSync(join(ven, f), 'utf8').matchAll(/from ['"](\.[^'"]+\.js)([^'"]*)['"]/g)];
    assert.ok(imports.length, f);
    for (const [, , query] of imports) assert.equal(query, '?v=' + v, f);
  }
  const { nactiSlovnik } = await import(pathToFileURL(join(ven, 'lib/texts.js')).href + '?v=' + v);
  assert.equal((await nactiSlovnik('ja')).zpet, '戻る');
});

test('offline: which request is answered from the cache', () => {
  const sw = readFileSync(new URL('tools/service-worker.js', koren), 'utf8');
  const { ctx, handlery } = nactiSW('const VERZE = "x"; const SOUBORY = { "index.html": "a", "app.js": "b", "songs/Ode to Joy.musicxml": "c", '
    + '"songs/Für Elise (opening).musicxml": "d", "helper/x.zip": "e" };\n' + sw, 'https://rusalkapiano.com/');
  const c = (url, mode = 'cors') => ctx.cestaVCache(new URL(url), mode);
  assert.equal(c('https://rusalkapiano.com/'), 'index.html');
  assert.equal(c('https://rusalkapiano.com/?zaloha=1', 'navigate'), 'index.html');
  assert.equal(c('https://rusalkapiano.com/index.html'), 'index.html');
  assert.equal(c('https://rusalkapiano.com/app.js?v=3'), 'app.js');
  assert.equal(c('https://rusalkapiano.com/songs/Ode%20to%20Joy.musicxml'), 'songs/Ode to Joy.musicxml');
  assert.equal(c('https://rusalkapiano.com/songs/F%C3%BCr%20Elise%20(opening).musicxml'), 'songs/Für Elise (opening).musicxml');
  assert.equal(c('https://rusalkapiano.com/neni.js'), null, 'unknown files go to the network');
  assert.equal(c('https://gc.zgo.at/count.js'), null, 'other websites (the visit counter) go to the network');
  // a project page under a path (github.io/rusalka/) works the same way
  const pod = nactiSW('const VERZE = "x"; const SOUBORY = { "index.html": "a", "app.js": "b" };\n' + sw, 'https://j-necas.github.io/rusalka/');
  assert.equal(pod.ctx.cestaVCache(new URL('https://j-necas.github.io/rusalka/app.js'), 'cors'), 'app.js');
  assert.equal(pod.ctx.cestaVCache(new URL('https://j-necas.github.io/jiny/app.js'), 'cors'), null);
  assert.deepEqual(Object.keys(handlery).sort(), ['activate', 'fetch', 'install', 'message']);
});

test('offline update: announces a waiting worker and reloads after it takes control', async () => {
  const sw = new EventTarget(), registrace = new EventTarget(), cekajici = new EventTarget();
  const zpravy = [];
  cekajici.postMessage = data => zpravy.push(data);
  sw.controller = {};
  sw.register = async () => registrace;
  let obnovit, obnoveno = 0;
  await zapnoutOffline({ serviceWorker: sw, aktualizace: f => { obnovit = f; }, obnovit: () => obnoveno++ });
  assert.equal(obnovit, undefined);
  registrace.installing = cekajici;
  registrace.dispatchEvent(new Event('updatefound'));
  cekajici.state = 'installed'; registrace.waiting = cekajici;
  cekajici.dispatchEvent(new Event('statechange'));
  assert.equal(typeof obnovit, 'function');
  obnovit();
  assert.deepEqual(zpravy, ['obnovit']);
  assert.equal(obnoveno, 0);
  sw.dispatchEvent(new Event('controllerchange'));
  sw.dispatchEvent(new Event('controllerchange'));
  assert.equal(obnoveno, 1);
});

test('offline: install caches dictionaries and the shell, rejects stale bytes, and caches the engine on demand', async () => {
  const soubory = { 'index.html': 'new HTML', 'lang/ja.js': 'dictionary', 'vendor/verovio-toolkit-wasm.js': 'renderer',
    'songs/Für Elise.musicxml': 'sheet music' };
  const hash = s => createHash('sha256').update(s).digest('hex').slice(0, 12);
  const obsah = new Map(), pozadavky = [];
  const cache = {
    match: async u => obsah.get(String(u))?.clone(),
    put: async (u, odp) => { obsah.set(String(u), odp.clone()); },
  };
  let zastarale = true;
  const fetch = async (u, volby) => {
    const url = new URL(u); pozadavky.push(url);
    const cesta = decodeURIComponent(url.pathname.slice(1));
    const stary = zastarale && cesta === 'index.html' && volby?.cache !== 'reload';
    return new Response(stary ? 'old HTML' : soubory[cesta]);
  };
  const sw = readFileSync(new URL('tools/service-worker.js', koren), 'utf8');
  const manifest = Object.fromEntries(Object.entries(soubory).map(([f, s]) => [f, hash(s)]));
  const { handlery } = nactiSW('const VERZE = "abc"; const SOUBORY = ' + JSON.stringify(manifest) + ';\n' + sw,
    'https://rusalkapiano.com/', { fetch, caches: { open: async () => cache } });
  let instalace;
  handlery.install({ waitUntil: p => { instalace = p; } });
  await instalace;
  assert.deepEqual(new Set(pozadavky.map(u => u.pathname)), new Set(['/index.html', '/lang/ja.js']));
  assert.ok(pozadavky.every(u => u.searchParams.has('v')), 'all CDN downloads use a versioned URL');
  assert.ok(![...obsah.keys()].some(u => u.includes('verovio')));
  assert.equal(await (await cache.match('https://rusalkapiano.com/index.html?v=' + manifest['index.html'])).text(), 'new HTML');
  assert.equal(pozadavky.filter(u => u.pathname === '/index.html').length, 2);
  zastarale = false;
  const adresa = 'https://rusalkapiano.com/vendor/verovio-toolkit-wasm.js?v=abc';
  const vyzadej = () => {
    let vysledek;
    handlery.fetch({ request: { url: adresa, method: 'GET', mode: 'cors' }, respondWith: p => { vysledek = p; } });
    return vysledek;
  };
  assert.equal(await (await vyzadej()).text(), 'renderer');
  assert.equal(await (await vyzadej()).text(), 'renderer');
  assert.equal(pozadavky.filter(u => u.href === adresa).length, 1);
});
