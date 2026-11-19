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
  const pocet = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    return (await (await caches.open('rusalka')).keys()).length;
  });
  const sw = await readFile(join(WEB, 'sw.js'), 'utf8');
  const vSW = Object.keys(JSON.parse(sw.match(/const SOUBORY = (\{.*\});/)[1])).length;
  kontrola(`the first visit keeps every file of the website (${pocet} of ${vSW})`, pocet === vSW);

  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('main:not(.skryta)', { timeout: 15000 }).catch(() => {});
  kontrola('without the internet a reload opens Rusalka', await page.locator('main:not(.skryta)').count() > 0);
  kontrola('… with no startup error', await page.locator('#chybaStartu').count() === 0);
  const offline = await page.evaluate(async () => {
    // like verovioTk() in app.js: WASM may be ready before VEROVIO_PRIPRAVENO is set up, so try until it works
    let verovioOk = false;
    for (let i = 0; i < 100 && !verovioOk; i++) {
      try { new verovio.toolkit(); verovioOk = true; } catch { await new Promise(r => setTimeout(r, 100)); }
    }
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
} finally {
  await browser.close();
  server.close();
  await rm(WEB, { recursive: true, force: true });
}
console.log(chyby ? `${chyby} FAIL` : 'all OK');
process.exit(chyby ? 1 : 0);
