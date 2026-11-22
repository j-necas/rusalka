// Builds the static web into web/: static/ (including vendor/), the songs/ samples with their list and the song library
// from build/library/ (npm run library, run by npm run web). No private songs.
import { cpSync, rmSync, mkdirSync, readdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { jeNota } from '../static/lib/files.js';
import { zabalVse } from './skills.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { UVODY, stranka, mapaWebu } from './uvod.mjs';
import { JAZYKY_PISNI, pisne, strankaPisne, seznamPisni } from './pisne.mjs';

// RUSALKA_WEB_OUT: a different output folder (tests build into a temp folder, so parallel test files don't collide)
const K = new URL('../', import.meta.url);
const W = process.env.RUSALKA_WEB_OUT ? pathToFileURL(process.env.RUSALKA_WEB_OUT.replace(/\/?$/, '/')) : new URL('web/', K);
if (!existsSync(new URL('static/vendor/verovio-toolkit-wasm.js', K))) throw new Error('static/vendor missing – run npm run vendor');
rmSync(W, { recursive: true, force: true });
cpSync(new URL('static/', K), W, { recursive: true, dereference: true });
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
// the song pages /<language>/<folder>/<song>/ and their lists (tools/pisne.mjs)
const zapis = ({ cesta, html, soubory = {} }) => {
  const adresar = new URL(cesta, W);
  mkdirSync(adresar, { recursive: true });
  writeFileSync(new URL('index.html', adresar), html);
  for (const [nazev, obsah] of Object.entries(soubory)) writeFileSync(new URL(nazev, adresar), obsah);
};
for (const kod of JAZYKY_PISNI) zapis(seznamPisni(kod));
for (const p of pisne()) zapis(await strankaPisne(p, { externe: true }));
writeFileSync(new URL('sitemap.xml', W), mapaWebu());
const web = fileURLToPath(W);
const cesty = readdirSync(web, { recursive: true, withFileTypes: true })
  .filter(f => f.isFile() && f.name !== '.DS_Store')
  .map(f => relative(web, join(f.parentPath, f.name)).split(sep).join('/'))
  .filter(cesta => cesta !== 'sitemap.xml' && !/^(helper|video|uvod)\//.test(cesta) && !UVODY.some(u => cesta.startsWith(u.slug + '/')))
  .sort();

const hash = data => createHash('sha256').update(data).digest('hex').slice(0, 12);
const otisky = () => Object.fromEntries(cesty.map(c => [c, hash(readFileSync(join(web, c)))]));
const sablona = readFileSync(new URL('service-worker.js', import.meta.url), 'utf8');
// One version for the ES module graph, avoiding recursive hashes across imports.
// Derive it before rewriting URLs; then verify downloads against the hashes of the final files.
const verze = hash(JSON.stringify(otisky()) + sablona + readFileSync(new URL(import.meta.url), 'utf8'));
const dotaz = '?v=' + verze;
function prepis(cesta, vzor, nahrada) {
  const soubor = join(web, cesta), obsah = readFileSync(soubor, 'utf8');
  writeFileSync(soubor, obsah.replace(vzor, nahrada));
}
prepis('index.html', /(\b(?:src|href)=")([\w/.-]+\.(?:js|css))"/g, '$1$2' + dotaz + '"');
for (const cesta of cesty.filter(c => /^(app\.js$|(?:lib|ui|lang)\/.*\.js$)/.test(c))) {
  prepis(cesta, /^((?:import|export)\s+(?:[\w\s{},*$]+?\s+from\s+)?)(['"])(\.{1,2}\/[^'"\r\n]+\.js)\2/gm, '$1$2$3' + dotaz + '$2');
}
prepis('fonts.css', /(url\(\s*['"]?)(vendor\/[^'")]+\.woff2)/g, '$1$2' + dotaz);
writeFileSync(join(web, 'sw.js'), `const VERZE = '${verze}';\nconst SOUBORY = ${JSON.stringify(otisky())};\n\n${sablona}`);
console.log(`${web} done`);
