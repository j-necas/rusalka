// The service worker of the published website. tools/web.mjs writes web/sw.js = the list of files with their content
// hashes (const VERZE, const SOUBORY) + this file. Not served by the dev server, so development is never cached.
//
// Installing it downloads every file of the website into one cache (a file whose hash has not changed is kept, not
// downloaded again). Then all requests for these files are answered from the cache, also without the internet.
// A new version of the website brings a new sw.js: it downloads the changed files in the background and takes over
// once every Rusalka window is closed, so an open window never mixes old and new files.

const CACHE = 'rusalka';
const ZAKLAD = new URL('./', self.location.href);          // https://rusalkapiano.com/ or https://…github.io/rusalka/

/** the cache key of a file version: its address + the content hash */
const klic = (cesta, hash) => new URL(cesta, ZAKLAD).href + '?v=' + hash;

/** the website file a request asks for (a key of SOUBORY), or null = leave it to the network */
function cestaVCache(url, mode) {
  if (url.origin !== ZAKLAD.origin || !url.pathname.startsWith(ZAKLAD.pathname)) return null;
  let cesta;
  try { cesta = decodeURIComponent(url.pathname.slice(ZAKLAD.pathname.length)); } catch { return null; }
  if (cesta === '' || (mode === 'navigate' && cesta.endsWith('/'))) cesta += 'index.html';
  return cesta in SOUBORY ? cesta : null;
}

self.addEventListener('install', e => e.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  const mame = new Set((await cache.keys()).map(r => r.url));
  const chybi = Object.entries(SOUBORY).filter(([cesta, hash]) => !mame.has(klic(cesta, hash)));
  // a few downloads at a time; no-cache = the browser revalidates its HTTP cache (cheap 304 for unchanged files)
  for (let i = 0; i < chybi.length; i += 6) {
    await Promise.all(chybi.slice(i, i + 6).map(async ([cesta, hash]) => {
      const odp = await fetch(new URL(cesta, ZAKLAD), { cache: 'no-cache' });
      if (!odp.ok) throw new Error(`${cesta}: ${odp.status}`);   // the installation fails and is tried again next time
      await cache.put(klic(cesta, hash), odp);
    }));
  }
})()));

self.addEventListener('activate', e => e.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  const platne = new Set(Object.entries(SOUBORY).map(([cesta, hash]) => klic(cesta, hash)));
  for (const r of await cache.keys()) if (!platne.has(r.url)) await cache.delete(r);   // files of older versions
  await self.clients.claim();                       // the first installation also serves the window that installed it
})()));

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const cesta = cestaVCache(new URL(e.request.url), e.request.mode);
  if (!cesta) return;
  e.respondWith((async () => (await caches.match(klic(cesta, SOUBORY[cesta]))) || fetch(e.request))());
});
