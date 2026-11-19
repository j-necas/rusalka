// Builds the static web into web/: static/ (including vendor/), the songs/ samples with their list and the song library
// from build/library/ (npm run library, run by npm run web). No private songs.
import { cpSync, rmSync, mkdirSync, readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { jeNota } from '../static/lib/files.js';
import { zabalVse } from './skills.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { UVODY, stranka, mapaWebu } from './uvod.mjs';

// RUSALKA_WEB_OUT: a different output folder (tests build into a temp folder, so parallel test files don't collide)
const K = new URL('../', import.meta.url);
const W = process.env.RUSALKA_WEB_OUT ? pathToFileURL(process.env.RUSALKA_WEB_OUT.replace(/\/?$/, '/')) : new URL('web/', K);
if (!existsSync(new URL('static/vendor/verovio-toolkit-wasm.js', K))) throw new Error('static/vendor missing – run npm run vendor');
rmSync(W, { recursive: true, force: true });
cpSync(new URL('static/', K), W, { recursive: true });
mkdirSync(new URL('songs/', W));
for (const f of readdirSync(new URL('songs/', K))) {
  if (jeNota(f) || f === 'index.json') cpSync(new URL(`songs/${encodeURIComponent(f)}`, K), new URL(`songs/${encodeURIComponent(f)}`, W));
}
// the library without review.html: that page (sources, internal notes) stays on the dev server
if (existsSync(new URL('build/library/index.json', K))) {
  cpSync(new URL('build/library/', K), new URL('library/', W), { recursive: true, filter: f => !f.endsWith('/review.html') });
}
else console.warn('build/library missing – run npm run library; the website has no song library');
// the optional skills for web Claude / ChatGPT, linked from the AI window
zabalVse(fileURLToPath(new URL('helper/', W)));
// the introduction pages /<language>/ and the sitemap (tools/uvod.mjs)
for (const u of UVODY) {
  mkdirSync(new URL(`${u.slug}/`, W), { recursive: true });
  writeFileSync(new URL(`${u.slug}/index.html`, W), stranka(u.kod));
}
writeFileSync(new URL('sitemap.xml', W), mapaWebu());
// offline: sw.js = every file of the website with its content hash (except the skill zips and videos) + tools/service-worker.js
napisServiceWorker(fileURLToPath(W));
console.log(`${fileURLToPath(W)} done`);

function napisServiceWorker(web) {
  const soubory = {};
  for (const f of readdirSync(web, { recursive: true, withFileTypes: true })) {
    if (!f.isFile() || f.name === '.DS_Store') continue;
    const cesta = relative(web, join(f.parentPath, f.name)).split(sep).join('/');
    if (cesta === 'sw.js' || cesta === 'sitemap.xml' || /^(helper|video|uvod)\//.test(cesta) || UVODY.some(u => cesta.startsWith(u.slug + '/'))) continue;   // videos and the introduction pages: online only
    soubory[cesta] = createHash('sha256').update(readFileSync(join(web, cesta))).digest('hex').slice(0, 12);
  }
  const serazene = Object.fromEntries(Object.keys(soubory).sort().map(k => [k, soubory[k]]));
  const verze = createHash('sha256').update(JSON.stringify(serazene)).digest('hex').slice(0, 12);
  const sablona = readFileSync(new URL('service-worker.js', import.meta.url), 'utf8');
  writeFileSync(join(web, 'sw.js'), `const VERZE = '${verze}';\nconst SOUBORY = ${JSON.stringify(serazene)};\n\n${sablona}`);
}
