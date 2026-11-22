// Built by tools/web.mjs, with VERZE (the URL version) and SOUBORY (hashes of the final bytes).
// The shell and dictionaries are installed first. Scores, samples and the renderer are cached on demand.
const CACHE = 'rusalka-v2';
const ZAKLAD = new URL('./', self.location.href);       // also works below /rusalka/ on a project site
const STAV = new URL('.offline-verze', ZAKLAD).href;
const probihaji = new Map();

function klic(cesta, verze) {
  const url = new URL(cesta.split('/').map(encodeURIComponent).join('/'), ZAKLAD);
  url.searchParams.set('v', verze);
  return url.href;
}

function cestaVCache(url, mode) {
  if (url.origin !== ZAKLAD.origin || !url.pathname.startsWith(ZAKLAD.pathname)) return null;
  let cesta;
  try { cesta = decodeURIComponent(url.pathname.slice(ZAKLAD.pathname.length)); } catch { return null; }
  if (!cesta || (mode === 'navigate' && cesta.endsWith('/'))) cesta += 'index.html';
  return Object.hasOwn(SOUBORY, cesta) ? cesta : null;
}

function jadro(cesta) {
  return cesta !== 'vendor/verovio-toolkit-wasm.js'
    && (!/^(songs|library|sounds)\//.test(cesta) || cesta.endsWith('/index.json'));
}

async function stahni(cesta, hash, verze) {
  // A CDN can still serve an older deployment. Retry once and only cache bytes matching the manifest.
  for (const cache of ['default', 'reload']) {
    const odp = await fetch(klic(cesta, verze), { cache }).catch(() => null);
    if (!odp?.ok) continue;
    const digest = await crypto.subtle.digest('SHA-256', await odp.clone().arrayBuffer());
    const skutecny = Array.from(new Uint8Array(digest).slice(0, 6), b => b.toString(16).padStart(2, '0')).join('');
    if (skutecny === hash) return odp;
  }
  throw new Error(`Offline: ${cesta} (${verze})`);
}

async function ziskej(cache, cesta, hash, verze, ulozitNutne = false) {
  const adresa = klic(cesta, hash);
  const ulozeno = await cache.match(adresa);
  if (ulozeno) return ulozeno;
  if (!probihaji.has(adresa)) {
    const p = (async () => {
      const odp = await stahni(cesta, hash, verze);
      try { await cache.put(adresa, odp.clone()); }
      catch (e) { if (ulozitNutne) throw e; }
      return odp;
    })().finally(() => probihaji.delete(adresa));
    probihaji.set(adresa, p);
  }
  return (await probihaji.get(adresa)).clone();
}

async function napln(jenJadro) {
  const cache = await caches.open(CACHE);
  const soubory = Object.entries(SOUBORY).filter(([cesta]) => jadro(cesta) === jenJadro);
  for (let i = 0; i < soubory.length; i += 6) {
    const skupina = soubory.slice(i, i + 6).map(([cesta, hash]) => ziskej(cache, cesta, hash, VERZE, jenJadro));
    await (jenJadro ? Promise.all(skupina) : Promise.allSettled(skupina));
  }
}

self.addEventListener('install', e => e.waitUntil(napln(true)));

async function manifesty(cache) {
  return (await (await cache.match(STAV))?.json()) || [];
}

self.addEventListener('activate', e => e.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  // Keep the previous build's files for tabs still running it after an explicit update.
  const [predchozi] = await manifesty(cache);
  const verze = [{ id: VERZE, soubory: SOUBORY }];
  if (predchozi && predchozi.id !== VERZE) verze.push(predchozi);
  await cache.put(STAV, new Response(JSON.stringify(verze)));
  const platne = new Set(verze.flatMap(v => Object.entries(v.soubory).map(([cesta, hash]) => klic(cesta, hash))));
  for (const r of await cache.keys()) if (r.url !== STAV && !platne.has(r.url)) await cache.delete(r);
  await self.clients.claim();
  await caches.delete('rusalka');                    // the original precache included unverified responses
})()));

self.addEventListener('message', e => {
  if (e.data === 'obnovit') e.waitUntil(self.skipWaiting());
  if (e.data === 'prednacti') e.waitUntil(napln(false));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url), cesta = cestaVCache(url, e.request.mode);
  if (!cesta) return;
  const verze = e.request.mode === 'navigate' ? VERZE : url.searchParams.get('v') || VERZE;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const manifest = verze === VERZE ? SOUBORY : (await manifesty(cache)).find(v => v.id === verze)?.soubory;
    if (!manifest || !Object.hasOwn(manifest, cesta)) return fetch(e.request);
    return await ziskej(cache, cesta, manifest[cesta], verze);
  })().catch(() => Response.error()));
});
