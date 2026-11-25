// Tests offline in headless Chrome against the built website (npm run web first): the first visit installs sw.js,
// then without the internet a reload still opens Rusalka, with Verovio, the samples and the piano sounds. Then a new
// version of the website: only the changed file is downloaded, and it is used once the window has been closed.
// Not part of npm test (needs Chrome and playwright-core):
//   PLAYWRIGHT_CORE=/path/to/playwright-core node tools/check-offline.mjs
import { createServer } from 'node:http';
import { readFile, writeFile, stat, cp, rm, mkdtemp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PW = process.env.PLAYWRIGHT_CORE;
if (!PW) throw new Error('set PLAYWRIGHT_CORE to the playwright-core folder');
const { chromium } = await import(pathToFileURL(PW + '/index.mjs'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.CHECK_OFFLINE_PORT || 8774);

// a copy of web/, because the test changes a file in it
const WEB = await mkdtemp(join(tmpdir(), 'rusalka-offline-'));
await cp(fileURLToPath(new URL('../web/', import.meta.url)), WEB, { recursive: true });
const TYPY = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };
const stazene = [];
const server = createServer(async (req, res) => {
  try {
    let cesta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (cesta.endsWith('/')) cesta += 'index.html';
    const soubor = normalize(join(WEB, cesta));
    if (!soubor.startsWith(WEB) || !(await stat(soubor)).isFile()) throw new Error('404');
    stazene.push(cesta);
    res.writeHead(200, { 'Content-Type': TYPY[extname(soubor)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' });
    res.end(await readFile(soubor));
  } catch { res.writeHead(404); res.end(); }
}).listen(PORT, '127.0.0.1');

let chyby = 0;
const kontrola = (co, ok) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${co}`); if (!ok) chyby++; };
const URL0 = `http://localhost:${PORT}/`;
const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext();
try {
  let page = await ctx.newPage();
  await page.goto(URL0);
  await page.waitForSelector('main:not(.skryta)');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
  });
  const sw = await readFile(join(WEB, 'sw.js'), 'utf8');
  const vSW = Object.keys(JSON.parse(sw.match(/const SOUBORY = (\{.*\});/)[1])).length;
  // the shell is installed first, the rest (scores, samples, Verovio) follows in the background: wait for it
  const pocet = await page.evaluate(async cil => {
    const soubory = async () => (await (await caches.open('rusalka-v2')).keys()).filter(r => !r.url.endsWith('/.offline-verze')).length;
    let n = 0;
    for (let i = 0; i < 300 && (n = await soubory()) < cil; i++) await new Promise(r => setTimeout(r, 100));
    return n;
  }, vSW);
  kontrola(`the first visit keeps every file of the website (${pocet} of ${vSW})`, pocet === vSW);

  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('main:not(.skryta)', { timeout: 15000 }).catch(() => {});
  kontrola('without the internet a reload opens Rusalka', await page.locator('main:not(.skryta)').count() > 0);
  kontrola('… with no startup error', await page.locator('#chybaStartu').count() === 0);
  const offline = await page.evaluate(async () => {
    // like verovioTk() in app.js: Verovio is loaded when the first score needs it
    const verovioOk = await window.nactiVerovio().then(tk => !!tk, () => false);
    const r = await Promise.all(['songs/index.json', 'songs/Ode%20to%20Joy.musicxml', 'sounds/piano/C4.mp3', 'library/index.json']
      .map(u => fetch(u).then(x => x.ok, () => false)));
    return { verovio: verovioOk, soubory: r };
  });
  kontrola('… Verovio starts', offline.verovio);
  kontrola('… samples, the song library and piano sounds load', offline.soubory.every(Boolean));
  await ctx.setOffline(false);

  // a new version of the website: style.css changed, a new sw.js
  const css = (await readFile(join(WEB, 'style.css'), 'utf8')) + '\n/* new version */\n';
  await writeFile(join(WEB, 'style.css'), css);
  const novy = createHash('sha256').update(css).digest('hex').slice(0, 12);
  await writeFile(join(WEB, 'sw.js'), sw.replace(/"style\.css":"[0-9a-f]+"/, `"style.css":"${novy}"`).replace(/const VERZE = '[0-9a-f]+'/, "const VERZE = 'novaverze00'"));
  stazene.length = 0;
  await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update();
    const w = r.installing || r.waiting; if (w && w.state !== 'installed') await new Promise(ok => w.addEventListener('statechange', () => w.state === 'installed' && ok())); });
  const obsah = stazene.filter(c => c !== '/sw.js');
  kontrola(`the update downloads only the changed file (${obsah.join(', ') || 'nothing'})`, obsah.length === 1 && obsah[0] === '/style.css');
  const stareCss = await page.evaluate(() => fetch('style.css').then(r => r.text()));
  kontrola('… an open window keeps the old version', !stareCss.includes('new version'));
  await page.close();
  page = await ctx.newPage();
  await page.goto(URL0);
  await page.waitForSelector('main:not(.skryta)');
  const noveCss = await page.evaluate(() => fetch('style.css').then(r => r.text()));
  kontrola('… after closing the window the new version is used', noveCss.includes('new version'));

  const slozky = await browser.newContext({ serviceWorkers: 'block', locale: 'en-US' });
  await slozky.addInitScript(() => {
    FileSystemDirectoryHandle.prototype.queryPermission = () => new Promise(() => {});
    FileSystemDirectoryHandle.prototype.requestPermission = () => new Promise(() => {});
    const isSameEntry = FileSystemDirectoryHandle.prototype.isSameEntry;
    FileSystemDirectoryHandle.prototype.isSameEntry = function (jina) {
      if (window.testStaryOdkaz) return Promise.reject(new DOMException('The user aborted a request.', 'AbortError'));
      return isSameEntry.call(this, jina);
    };
    window.showDirectoryPicker = async ({ mode }) => {
      if (mode !== 'readwrite') throw new Error('Expected a writable picker');
      if (!window.testVyber) throw new DOMException('Cancelled', 'AbortError');
      return (await navigator.storage.getDirectory()).getDirectoryHandle(window.testVyber, { create: true });
    };
  });
  page = await slozky.newPage();
  await page.goto(URL0);
  await page.waitForSelector('main:not(.skryta)');
  await page.evaluate(async () => {
    const { nastaveniProhlizece } = await import('/lib/storage.js');
    const koren = await navigator.storage.getDirectory();
    await nastaveniProhlizece.zapis('slozka', await koren.getDirectoryHandle('Rusalka', { create: true }));
  });
  let povolNacteni;
  const cekani = new Promise(ok => { povolNacteni = ok; });
  await page.route('**/app.js?*', async route => { await cekani; await route.continue(); });
  await page.reload({ waitUntil: 'commit' });
  await page.locator('#nacitani').waitFor({ state: 'visible' });
  kontrola('startup shows a status while the app is loading', true);
  povolNacteni();
  const znovu = page.locator('main:not(.skryta) .data-povolit');
  await znovu.waitFor({ timeout: 4000 });
  kontrola('a pending folder permission still opens the app without the loading status', !await page.locator('#nacitani').isVisible());
  await znovu.click();    // cancelling leaves the original folder connected but waiting
  await page.evaluate(() => { window.testVyber = 'Jina'; });
  await znovu.click();
  const upozorneni = page.locator('#toast').filter({ hasText: 'Select the original folder' });
  await upozorneni.waitFor({ timeout: 4000 }).catch(async e => {
    console.error('Storage feedback:', await page.locator('#toast, main:not(.skryta) .data-chyba').allTextContents());
    throw e;
  });
  await page.evaluate(() => {
    window.testVyber = 'Rusalka'; window.testStaryOdkaz = true;
    document.getElementById('toast').textContent = '';
  });
  await znovu.click();
  await upozorneni.waitFor({ timeout: 4000 }); // same name without a Rusalka marker is insufficient
  await page.evaluate(async () => {
    const { ProhlizecUloziste, SlozkaUloziste } = await import('/lib/storage.js');
    const koren = await navigator.storage.getDirectory();
    await new SlozkaUloziste(await koren.getDirectoryHandle('Rusalka')).pripravit();
    await new ProhlizecUloziste().zapisData('oblibene', { host: ['Ode to Joy.musicxml'] });
  });
  await znovu.click();
  const potvrzeni = page.locator('#potvrzeni');
  await potvrzeni.waitFor({ timeout: 4000 });
  await page.locator('#potvrzeniNe').click();
  await znovu.waitFor({ state: 'visible', timeout: 4000 });
  const oblibeneVeSlozce = () => page.evaluate(async () => {
    const { SlozkaUloziste } = await import('/lib/storage.js');
    const koren = await navigator.storage.getDirectory();
    return new SlozkaUloziste(await koren.getDirectoryHandle('Rusalka')).ctiData('oblibene');
  });
  kontrola('cancelling confirmation leaves browser progress out of the folder', await oblibeneVeSlozce() === null);
  await znovu.click();
  await page.locator('#potvrzeniAno').click({ timeout: 4000 });
  await znovu.waitFor({ state: 'hidden', timeout: 4000 });
  kontrola('confirmation reconnects the marked folder and merges browser progress', (await oblibeneVeSlozce())?.host?.[0] === 'Ode to Joy.musicxml');
  await slozky.close();
} finally {
  await browser.close();
  server.close();
  await rm(WEB, { recursive: true, force: true });
}
console.log(chyby ? `${chyby} FAIL` : 'all OK');
process.exit(chyby ? 1 : 0);
