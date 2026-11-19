// Screenshots for README.md / README.cs.md: made-up players (no real children), the free sample songs and ten weeks of
// made-up practice, in English and Czech, into docs/images/<lang>/. Re-run after a visible change:
//   PLAYWRIGHT_CORE=/path/to/playwright-core node tools/readme-images.mjs
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { pripravStranku } from './test-page.mjs';

const PW = process.env.PLAYWRIGHT_CORE;
if (!PW) throw new Error('set PLAYWRIGHT_CORE to the playwright-core folder');
const { chromium } = await import(pathToFileURL(PW + '/index.mjs'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8774;
const koren = new URL('../', import.meta.url);
const pisen = f => readFileSync(new URL('songs/' + f, koren), 'utf8');
const server = spawn(process.execPath, [fileURLToPath(new URL('tools/server.mjs', koren))], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));

// ten weeks of a child practising 3–5 days a week and getting better; a few stuck bars
const DEN = 864e5, ted = Date.now();
const PISNE = ['Twinkle, Twinkle, Little Star.musicxml', 'Mary Had a Little Lamb.musicxml', 'Ode to Joy.musicxml', 'Frère Jacques.musicxml',
  'London Bridge.musicxml', 'Jingle Bells (chorus).musicxml', 'Silent Night.musicxml', 'Minuet in G.musicxml'];
const KROKY = ['cekam', 'pockej', 'tempo'];
function cviceni() {
  const statistiky = {}, denik = {}, vysledky = {};
  const klicDne = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  for (let d = 69; d >= 0; d--) {
    if ([1, 4].includes(d % 7) || d % 11 === 5) continue;                    // not every day
    const zahrani = 2 + ((d * 7) % 4);
    for (let i = 0; i < zahrani; i++) {
      const p = PISNE[Math.min(PISNE.length - 1, Math.floor((69 - d) / 12) + (i % 2))], k = p + '#2';
      const presnost = Math.min(1, 0.7 + (69 - d) / 300 + ((i * 5 + d) % 7) / 100);
      const kdy = ted - d * DEN - (3 - i) * 9e5;
      const s = (statistiky[k] ||= { verze: 1, pokusu: 0, posledni: kdy, takty: {}, vzorce: {}, historie: [] });
      s.historie.push({ kdy, rezim: 'tempo', krok: KROKY[Math.min(2, i)], rychlost: [60, 80, 100][Math.min(2, i)], presnost, cisty: presnost >= 0.95 });
      s.pokusu++; s.posledni = kdy;
      const dn = (denik[klicDne(kdy)] ||= [0, 0, 0]); dn[0]++; dn[1] += presnost; dn[2]++;
    }
  }
  for (const [k, s] of Object.entries(statistiky)) {
    s.historie = s.historie.slice(-30);
    for (let t = 0; t < 12; t++) s.takty[t] = { noty: 8, chyby: 0.2, tony: 0, vynechane: 0, posun: 0, mereno: 0 };
    if (k.startsWith('Ode')) { s.takty[5].chyby = 3.4; s.takty[6].chyby = 2.6; }
    if (k.startsWith('Jingle')) s.takty[9].chyby = 2.4;
  }
  const prvni = statistiky[PISNE[0] + '#2'];                                    // the first song is learnt: clean In rhythm at 100 %
  prvni.historie.push({ kdy: ted - 40 * DEN, rezim: 'tempo', krok: 'tempo', rychlost: 100, presnost: 1, cisty: true });
  PISNE.forEach((p, i) => { vysledky[p] = Object.fromEntries(KROKY.map((k, j) => [k, { hvezdy: Math.max(0, Math.min(3, 5 - i - j)), procent: 90, pocet: 3 }])); });
  return { statistiky, denik, vysledky };
}
const A = cviceni();
const PROFILY = [{ id: 'a', jmeno: 'Anna', obrazek: 'vydra', zvire: 'vydra', barva: 'mech', vek: 'dite' },
  { id: 't', jmeno: 'Tom', obrazek: 'liska', zvire: 'liska', barva: 'mrkev', vek: 'dite' }];
const DATA = {
  data: { profily: JSON.stringify(PROFILY), profil: JSON.stringify('a'), vysledky: JSON.stringify({ a: A.vysledky }),
    statistiky: JSON.stringify({ a: A.statistiky }), denik: JSON.stringify({ a: A.denik }) },
  pisne: Object.fromEntries(PISNE.map(f => [f, pisen(f)])),
};

const b = await chromium.launch({ executablePath: CHROME, headless: true });
async function snimky(jazyk) {
  const cil = new URL(`docs/images/${jazyk}/`, koren);
  mkdirSync(cil, { recursive: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 780 }, deviceScaleFactor: 1, locale: jazyk === 'cs' ? 'cs-CZ' : 'en-US' });
  await p.addInitScript(jazyk => { localStorage.clear(); localStorage.setItem('kt-jazyk', JSON.stringify(jazyk)); }, jazyk);
  await pripravStranku(p, `http://127.0.0.1:${PORT}/`, DATA);   // only the prepared songs and data, in the browser storage
  const ulozit = async jm => { await p.waitForTimeout(500); await p.screenshot({ path: fileURLToPath(new URL(jm + '.png', cil)) }); };
  await p.goto(`http://127.0.0.1:${PORT}/`); await p.waitForTimeout(1500);
  await p.locator('#kdo .dlazdice-hrace', { hasText: 'Anna' }).click(); await p.waitForTimeout(1200);
  await ulozit('home');
  await p.locator('#pisne .dl', { hasText: 'Ode to Joy' }).click(); await p.waitForSelector('#predNoty svg', { timeout: 15000 });
  await ulozit('before-playing');
  await p.locator('#predKroky [data-krok="cekam"]').click();
  await p.locator('#predHrat').click(); await p.waitForSelector('#klavesy .klavesa', { timeout: 15000 }); await p.waitForTimeout(1500);
  for (const n of [64, 64]) { await p.locator(`#klavesy .klavesa[data-p="${n}"]`).click(); await p.waitForTimeout(250); }   // a few notes in
  await ulozit('playing');
  await p.locator('#zpet').click(); await p.waitForTimeout(600);
  await p.locator('#predZpet').click(); await p.waitForTimeout(400);
  await p.locator('#domu .menu-players').click(); await p.waitForTimeout(800);
  await p.setViewportSize({ width: 1280, height: 1500 }); await p.waitForTimeout(600);
  await p.locator('#hraciOkno .karta').screenshot({ path: fileURLToPath(new URL('statistics.png', cil)) });
  await p.close();
}
try {
  for (const j of ['en', 'cs']) await snimky(j);
  console.log('docs/images/{en,cs}/ done');
} finally { await b.close(); server.kill(); }
