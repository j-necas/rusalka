// Tests the new look in headless Chrome: goes through the screens with prepared data in the browser storage, prints
// OK/FAIL checks and saves screenshots. Not part of npm test (needs Chrome and playwright-core):
//   PLAYWRIGHT_CORE=/path/to/playwright-core node tools/check-ui.mjs [screenshot folder]
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { zabalZip } from '../static/lib/zip.js';
import { pripravStranku, ulozenaData, ulozPisne } from './test-page.mjs';

const PW = process.env.PLAYWRIGHT_CORE;
if (!PW) throw new Error('set PLAYWRIGHT_CORE to the playwright-core folder');
const { chromium } = await import(pathToFileURL(PW + '/index.mjs'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SNIMKY = process.argv[2] || null;
if (SNIMKY) mkdirSync(SNIMKY, { recursive: true });
const PORT = Number(process.env.CHECK_UI_PORT || 8773);
const koren = new URL('../', import.meta.url);
const pisen = f => readFileSync(new URL('songs/' + f, koren), 'utf8');

// the song library is served from build/library/: build it first so /library/ is always current
const { postavKnihovnu } = await import('./library.mjs');
const knihovna = await postavKnihovnu({ zdroj: new URL('library/', koren), cil: new URL('build/library/', koren) });
if (knihovna.chyby.length) throw new Error('library: ' + knihovna.chyby.join('; '));
const server = spawn(process.execPath, [new URL('tools/server.mjs', koren).pathname], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));

const DEN = 864e5, ted = Date.now();
const PROFILY = [
  { id: 'e', jmeno: 'Ela', zvire: 'lenochod', vek: 'dite' },
  { id: 'f', jmeno: 'Fík', zvire: 'kralik', vek: 'dite' },
  { id: 'j', jmeno: 'Jan', vek: 'dospely' },
  { id: 'x', smazano: 1 },
];
const DATA = (profily = PROFILY) => ({
  data: {
    profily: JSON.stringify(profily), profil: JSON.stringify(profily[0]?.id ?? null),
    vysledky: JSON.stringify({ f: { 'Frère Jacques.musicxml': { cekam: { hvezdy: 3, procent: 100, pocet: 2 }, pockej: { hvezdy: 1, procent: 70, pocet: 1 } } } }),
    statistiky: JSON.stringify({ f: { 'Frère Jacques.musicxml#2': { verze: 1, pokusu: 3, posledni: ted - DEN, takty: {},
      historie: [{ kdy: ted - DEN, rezim: 'tempo', krok: 'pockej', rychlost: 80, presnost: 0.7 }] } } }),
  },
  pisne: Object.fromEntries(['Frère Jacques.musicxml', 'Happy Birthday.musicxml', 'Ode to Joy.musicxml', 'Silent Night.musicxml'].map(f => [f, pisen(f)])),
});

const vysledky = [];
const kontrola = (nazev, ok, detail = '') => { vysledky.push(ok); console.log(`${ok ? 'OK ' : 'FAIL'} ${nazev}${detail ? ' – ' + detail : ''}`); };
const zkus = async (nazev, f) => { try { await f(); } catch (e) { kontrola(nazev, false, String(e.message || e).split('\n')[0]); } };

const b = await chromium.launch({ executablePath: CHROME, headless: true });
// vlastni: only the prepared songs and data (no samples, no library) and a fake Web MIDI; otherwise an empty browser
// with the website's samples and library
async function stranka(data, sirka = Number(process.env.SIRKA || 1280), vyska = Number(process.env.VYSKA || 860), jazyk = 'cs', vlastni = true, locale = 'en-US', predNactenim = null) {
  const p = await b.newPage({ viewport: { width: sirka, height: vyska }, locale });
  p.setDefaultTimeout(5000);
  p.chyby = [];
  p.on('pageerror', e => p.chyby.push(e.message));
  await p.addInitScript(jazyk => {
    if (!sessionStorage.getItem('zkouska')) { localStorage.clear(); sessionStorage.setItem('zkouska', '1'); if (jazyk) localStorage.setItem('kt-jazyk', JSON.stringify(jazyk)); }
  }, jazyk);
  if (BEZ_WEBGL) await p.addInitScript(() => {          // a browser without WebGL: the animals fall back to the CSS motion
    const puvodni = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (druh, ...x) { return /webgl/.test(druh) ? null : puvodni.call(this, druh, ...x); };
  });
  if (vlastni) await pripravStranku(p, `http://127.0.0.1:${PORT}/`, data);
  if (predNactenim) await predNactenim(p);
  await p.goto(`http://127.0.0.1:${PORT}/`);
  await p.waitForTimeout(1500);
  return p;
}
let BEZ_WEBGL = false;
const snimek = async (p, jm) => { if (SNIMKY) await p.screenshot({ path: `${SNIMKY}/${jm}.png` }); };
const viditelna = async (p, sel) => (await p.locator(sel).count()) > 0 && p.locator(sel).first().isVisible();
// a menu link: directly when the bar shows it, otherwise through Menu (narrow screens)
const menu = async (pg, scr, k) => {
  const primo = pg.locator(`#${scr} .horni-menu .menu-${k}`);
  if (await primo.isVisible()) return primo.click();
  await pg.locator(`#${scr} .menu-vse`).click();
  await pg.locator(`#menuOkno .menu-${k}`).click();
};
const vMenu = async (pg, scr, k) => (await viditelna(pg, `#${scr} .horni-menu .menu-${k}`))
  || ((await viditelna(pg, `#${scr} .menu-vse`)) && (await pg.locator(`#menuOkno .menu-${k}`).count()) === 1);
// a window option (Songs, Settings, AI tools): a button and one line on what it does, side by side, visible
const radek = (pg, sel) => pg.evaluate(s => {
  const b = document.querySelector(s), r = b?.closest('.okno-krok');
  return !!r && b.classList.contains('tlacitko') && !!r.querySelector('p')?.textContent.trim() && r.getClientRects().length > 0;
}, sel);
const bloky = (pg, okno) => pg.locator(okno + ' .okno-blok h3:visible').allInnerTexts();
// the player's menu on Home: Edit (#upravitHrace) or Change player (#zmenitHrace)
const hrac = async (pg, polozka) => { await pg.locator('#mujProfilOtevrit').click(); await pg.locator(polozka).click(); };
const ulozeno = ulozenaData;
// Show mistakes: each ghost group clear of the clef, key and time signature drawn before its note on its staff line
// (a clef change sits at the end of the previous bar),
// and never on top of its own notehead
const duchyZaKlicem = p => p.evaluate(() => [...document.querySelectorAll('#pas g.duchove')].map(g => {
  const nota = document.getElementById(g.dataset.nota).getBoundingClientRect();
  const linky = [...g.closest('g.staff').querySelectorAll(':scope > path')].map(x => x.getBoundingClientRect());
  const horni = Math.min(...linky.map(r => r.top)), dolni = Math.max(...linky.map(r => r.bottom));
  const pred = [...document.querySelectorAll('#pas g.clef, #pas g.keySig, #pas g.meterSig')].map(e => e.getBoundingClientRect())
    .filter(r => r.width && r.left < nota.left && r.top < dolni && r.bottom > horni);
  const r = g.getBoundingClientRect(), hlava = document.getElementById(g.dataset.nota).querySelector('.notehead').getBoundingClientRect();
  return { vlevo: Math.round(r.left), hrana: Math.round(Math.max(-1e9, ...pred.map(r => r.right))),
    mimoNotu: [...g.querySelectorAll('ellipse:not(.halo), text')].map(e => e.getBoundingClientRect())
      .every(b => b.right <= hlava.left || b.left >= hlava.right || b.bottom <= hlava.top || b.top >= hlava.bottom) };
}));
const volneOdKlice = d => d.length > 0 && d.every(x => x.vlevo >= x.hrana && x.mimoNotu);
// … and where each ghost sits: diatonic steps above its target notehead (half line spacings), with its accidental
const polohyDuchu = p => p.evaluate(() => [...document.querySelectorAll('#pas g.duchove')].map(g => {
  const ys = [...g.closest('g.staff').querySelectorAll(':scope > path')]
    .map(x => Number(/^M\s*[-\d.]+\s+([-\d.]+)/.exec(x.getAttribute('d') || '')?.[1])).filter(Number.isFinite).slice(0, 5).sort((a, b) => a - b);
  const pul = (ys[4] - ys[0]) / 8, hb = document.getElementById(g.dataset.nota).querySelector('.notehead').getBBox();
  return [...g.querySelectorAll('g.duch')].map(d => [Number(d.dataset.pitch),
    Math.round((hb.y + hb.height / 2 - Number(d.querySelector('ellipse:not(.halo)').getAttribute('cy'))) / pul * 10) / 10,
    d.querySelector('text')?.textContent || '']);
}));
const aktivni = p => p.evaluate(() => document.activeElement?.id || '');
// web mode: data and songs in this browser's IndexedDB (values, not JSON text); the page is reloaded to read them
const doProhlizece = async (p, data, pisne = {}) => {
  await p.evaluate(async ([data, pisne]) => {
    const db = await new Promise((ok, chyba) => {
      const r = indexedDB.open('rusalka', 1);
      r.onupgradeneeded = () => { for (const s of ['pisne', 'data', 'nastaveni']) r.result.createObjectStore(s); };
      r.onsuccess = () => ok(r.result); r.onerror = () => chyba(r.error);
    });
    await new Promise((ok, chyba) => {
      const tx = db.transaction(['data', 'pisne'], 'readwrite');
      for (const [k, v] of Object.entries(data)) tx.objectStore('data').put(v, k);
      for (const [k, v] of Object.entries(pisne)) tx.objectStore('pisne').put(new TextEncoder().encode(v), k);
      tx.oncomplete = ok; tx.onerror = () => chyba(tx.error);
    });
    db.close();
  }, [data, pisne]);
  await p.reload();
  await p.waitForTimeout(1500);
};
const zProhlizece = (p, klic) => p.evaluate(k => new Promise((ok, chyba) => {
  const r = indexedDB.open('rusalka', 1);
  r.onsuccess = () => { const g = r.result.transaction('data').objectStore('data').get(k); g.onsuccess = () => { ok(g.result ?? null); r.result.close(); }; };
  r.onerror = () => chyba(r.error);
}), klic);

try {
  // ---------------------------------------------------------------- Task 5: Who is playing, New player, My profile
  const p = await stranka(DATA());
  await zkus('Who is playing', async () => {
    kontrola('starts on Who is playing with three players', await viditelna(p, '#kdo') && (await p.locator('#kdo .dlazdice-hrace').count()) === 3);
    await snimek(p, 'kdo');
    const barvy = await p.locator('#kdo .dlazdice-hrace').evaluateAll(el => el.map(e => getComputedStyle(e).backgroundColor));
    kontrola('tiles in player colours (mech, mrkev, inkoust)', barvy.join() === 'rgb(226, 240, 232),rgb(252, 235, 221),rgb(228, 236, 245)', barvy.join(' | '));
    // set C animals: picture from the atlas, they blink now and then on their own, tilt curiously on hover
    // (the CSS picture of an animal drawn by the puppet is hidden: read the atlas from a copy without the puppet class)
    const obr = await p.locator('#kdo .zvire').evaluateAll(el => el.map(e => {
      const c = e.cloneNode(false); c.classList.remove('s-loutkou'); document.body.append(c);
      const bg = getComputedStyle(c).backgroundImage; c.remove(); return bg;
    }));
    kontrola('animals from the set C atlas', obr.length >= 2 && obr.every(b => /animals\/[a-z-]+\.webp/.test(b)), obr.join(' | ').slice(0, 160));
    // a blink lasts only 120–200 ms: catch the attribute change, not the state at one moment
    await p.evaluate(() => { window.__mrkl = false; new MutationObserver(z => { if (z.some(x => x.target.dataset?.vyraz === 'blink')) window.__mrkl = true; })
      .observe(document.querySelector('#kdo'), { subtree: true, attributes: true, attributeFilter: ['data-vyraz'] }); });
    let mrkl = false;
    for (let i = 0; i < 60 && !mrkl; i++) { await p.waitForTimeout(250); mrkl = await p.evaluate(() => window.__mrkl); }
    kontrola('animal on Who is playing blinks on its own', mrkl);
    // V13: on Who is playing the original drawing itself moves (eyes, head, ears) on a canvas over the picture
    const otisk = () => p.locator('#kdo .zvire > canvas.loutka').evaluateAll(el => el.map(c => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0, h = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) { n++; h = (h * 31 + d[i - 3] + i) % 1e9; }
      return { n, h, w: c.width };
    }));
    const prvni = await otisk();
    await p.waitForTimeout(700);
    const druhy = await otisk();
    kontrola('animals on Who is playing are drawn in motion (one canvas each, drawing visible)',
      prvni.length === (await p.locator('#kdo .zvire').count()) && prvni.every(x => x.n > x.w * x.w * 0.1), JSON.stringify(prvni).slice(0, 160));
    kontrola('the drawings move in a loop (the drawing changes)', druhy.some((x, i) => x.h !== prvni[i]?.h), JSON.stringify(druhy).slice(0, 160));
    kontrola('the rabbit (Fík) is drawn in motion too, like the others', await p.evaluate(() => {
      const c = document.querySelector('#kdo .zvire[data-zvire="kralik"] canvas.loutka'); if (!c) return false;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) n++;
      return n > c.width * c.width * 0.15; }));
    kontrola('an animal in motion keeps its place: no CSS transform on it', (await p.locator('#kdo .zvire.s-loutkou').evaluateAll(el => el.map(e => e.style.transform))).every(t => !t));
    await p.locator('#kdo .dlazdice-hrace').first().hover();
    await p.waitForTimeout(100);
    kontrola('animal tilts curiously on hover', await p.locator('#kdo .dlazdice-hrace').first().locator('.zvire[data-pohyb="curious"]').count() === 1);
  });
  await zkus('Without WebGL the animals move by CSS', async () => {
    BEZ_WEBGL = true;
    const q = await stranka(DATA());
    BEZ_WEBGL = false;
    await q.waitForTimeout(800);
    const t = await q.locator('#kdo .zvire[data-zvire="lenochod"]').evaluateAll(el => el.map(e => e.style.transform));
    kontrola('without WebGL: the animals move by CSS (no canvas)', (await q.locator('#kdo .zvire canvas.loutka').count()) === 0
      && t.some(x => /rotate\((?!0deg)/.test(x)), t.join(' | ').slice(0, 160));
    kontrola('no page errors without WebGL', q.chyby.length === 0, q.chyby.join(' | '));
    await q.close();
  });
  await zkus('About Rusalka', async () => {
    const q = await stranka(DATA());
    kontrola('About link on Who is playing (directly or in Menu)', await vMenu(q, 'kdo', 'about'));
    await menu(q, 'kdo', 'about');
    const text = await q.locator('#oRusalceOkno').innerText().catch(() => '');
    kontrola('About opens with the story and the sections', await viditelna(q, '#oRusalceOkno') && /táta dvou báječných dětí/.test(text)
      && /Knihovn/.test(text) && /Chrome/.test(text) && /vaše data nikam neodesílá/.test(text) && !/počítá návštěvy/.test(text)
      && /Zdarma a open source/.test(text) && !/nic neodesílá/.test(text), text.slice(0, 120));
    kontrola('no visit counter locally (only the published website counts)', (await q.locator('script[data-goatcounter]').count()) === 0);
    kontrola('About is a labelled dialog with focus inside', await q.evaluate(() => {
      const o = document.querySelector('#oRusalceOkno');
      return o.getAttribute('role') === 'dialog' && !!document.getElementById(o.getAttribute('aria-labelledby')) && o.contains(document.activeElement);
    }));
    kontrola('Close in About is visible without scrolling the window (long text scrolls above it)', await q.evaluate(() => {
      const k = document.querySelector('#oRusalceOkno .karta'), z = document.querySelector('#oRusalceZavrit');
      const rk = k.getBoundingClientRect(), rz = z.getBoundingClientRect();
      return k.scrollHeight > k.clientHeight ? rz.bottom <= rk.bottom + 1 && rz.top >= rk.top && rk.bottom <= innerHeight + 1 : rk.bottom <= innerHeight + 1;
    }));
    kontrola('About credits the piano recording (Salamander, CC BY 3.0)', /Salamander Grand Piano/.test(text) && /Alexander Holm/.test(text) && /CC BY 3\.0/.test(text));
    kontrola('About has no AI tools and no button to them', (await q.locator('#oRusalceOkno #pomocnik, #oRusalceOkno #oRusalceAI').count()) === 0);
    const tyka = text.match(/najdeš|potřebuješ|můžeš|Přidej |vyber si|Tvoje|s tebou|na tebe|nepoužíváš|stáhneš|vybereš|naučíš|hraješ|přidáš|Data a zálohy/g);
    kontrola('About speaks to the reader formally (vykání) and names Settings, not Data and backups', !tyka && /najdete/.test(text) && /Nastavení/.test(text), String(tyka));
    await q.keyboard.press('Escape');
    kontrola('Escape closes About', !(await viditelna(q, '#oRusalceOkno')) && await viditelna(q, '#kdo'));
    // the top menu: Songs, Players, AI, Settings (with data and backups), About; For parents is gone
    kontrola('top menu on Who is playing: Songs, Players, AI, Settings, About (in this order)', await q.evaluate(() => {
      const m = document.querySelector('#kdo .horni-menu'), poradi = ['.menu-songs', '.menu-players', '.menu-ai', '.menu-settings', '.menu-about'];
      const btn = m ? [...m.querySelectorAll('button:not(.menu-vse)')].map(b => poradi.findIndex(s => b.matches(s))) : [];
      return btn.join() === '0,1,2,3,4' && !document.querySelector('#rodice, .menu-rodice, #kdoRodice, #domuRodice, .menu-data, #dataOkno');
    }));
    const pata = async (str, sel) => { const t = await str.locator(sel).innerText().catch(() => ''); return await viditelna(str, sel) && /open source klavírní aplikace zdarma pro děti a začátečníky/.test(t) && /zůstávají plně ve Vašem zařízení/.test(t) && /Více o Rusalce/.test(t); };
    kontrola('Who is playing says: free, open source, data stay on the device', await pata(q, '#kdo .pata'));
    kontrola('the footer line is one line on a wide screen', await q.evaluate(() => {
      const p = document.querySelector('#kdo .pata'); return innerWidth < 1100 || (() => { const c = getComputedStyle(p); return p.getBoundingClientRect().height - parseFloat(c.paddingTop) - parseFloat(c.paddingBottom) < parseFloat(c.lineHeight) * 1.5; })();
    }));
    await q.locator('#kdo .pata .odkaz').click();
    kontrola('More about Rusalka opens About', await viditelna(q, '#oRusalceOkno'));
    await q.keyboard.press('Escape');
    // the menu fits the screen and covers neither the logo nor the heading (also on a phone)
    const prekryv = await q.evaluate(() => {
      const r = s => document.querySelector(s).getBoundingClientRect(), m = r('#kdo .horni-menu');
      const pres = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      return { logo: pres(m, r('#kdo .logo-kdo')), nadpis: pres(m, r('#kdo h1')), mimo: m.right > innerWidth + 1 || m.left < -1 };
    });
    kontrola('top menu on Who is playing fits and overlaps nothing', !prekryv.logo && !prekryv.nadpis && !prekryv.mimo, JSON.stringify(prekryv));
    await q.locator('#kdo .menu-ai').click();
    const ai = await q.locator('#aiOkno').innerText().catch(() => '');
    const ukoly = await bloky(q, '#aiOkno');
    kontrola('AI tools: three tasks, each with its own buttons', await viditelna(q, '#aiOkno') && /AI nástroje/.test(ai)
      && ukoly.join('|') === 'Noty z fotky|Přehled týdne|Lehčí verze písničky'
      && await radek(q, '#pomocnikPokyny') && await radek(q, '#pomocnikVlozit') && await radek(q, '#pomocnikVysledky') && await radek(q, '#pomocnikUprava'), ukoly.join('|') + ' / ' + ai.slice(0, 100));
    kontrola('skills are folded away for the curious', (await q.locator('#aiOkno details.pomocnik-skill:not([open])').count()) === 1
      && (await q.locator('#aiOkno details a[href="helper/rusalka-sheet-music.zip"]').count()) === 1
      && !(await q.locator('#aiOkno a[href="helper/rusalka-sheet-music.zip"]').isVisible()));
    kontrola('no "pomocník" anywhere in the page', !/pomocn/i.test(await q.evaluate(() => document.body.textContent)));
    kontrola('AI is a labelled dialog with focus inside', await q.evaluate(() => {
      const o = document.querySelector('#aiOkno');
      return o.getAttribute('role') === 'dialog' && !!document.getElementById(o.getAttribute('aria-labelledby')) && o.contains(document.activeElement);
    }));
    await q.locator('#pomocnikUprava').click();
    kontrola('Easier version: Choose a song opens Songs on the Manage list', !(await viditelna(q, '#aiOkno')) && await viditelna(q, '#pisnickyOkno #spravaHledat'));
    await q.keyboard.press('Escape');
    await menu(q, 'kdo', 'about');
    await q.keyboard.press('Escape');
    kontrola('Escape closes About, Who is playing stays', !(await viditelna(q, '#oRusalceOkno')) && await viditelna(q, '#kdo'));
    await q.evaluate(() => { location.hash = '#about'; });
    await q.waitForTimeout(300);
    kontrola('#about in the address opens About', await viditelna(q, '#oRusalceOkno'));
    await q.close();
    const n = await stranka(DATA([]));                     // first visit: no players → New player
    kontrola('top menu on New player (first visit): AI, Songs, Settings, About', await viditelna(n, '#novy') && await vMenu(n, 'novy', 'about')
      && await viditelna(n, '#novy .menu-ai') && await vMenu(n, 'novy', 'songs') && await vMenu(n, 'novy', 'settings'));
    kontrola('first visit: the promise is right under the New player heading, above the name, and not twice', await pata(n, '#novyUvod')
      && await n.evaluate(() => {
        const u = document.querySelector('#novyUvod').getBoundingClientRect(), h = document.querySelector('#novyNadpis').getBoundingClientRect();
        const j = document.querySelector('#novyJmeno').getBoundingClientRect();
        return u.top >= h.bottom - 1 && u.bottom <= j.top + 1 && parseFloat(getComputedStyle(document.querySelector('#novyUvod')).fontSize) >= 16;
      }) && !(await viditelna(n, '#novy .pata')));
    await n.locator('#novyUvod .odkaz').click();
    kontrola('first visit: More about Rusalka in the strip opens About', await viditelna(n, '#oRusalceOkno'));
    await n.keyboard.press('Escape');
    await n.close();
    const e = await stranka(DATA(), undefined, undefined, 'en');
    await e.goto(`http://127.0.0.1:${PORT}/#about`);
    await e.waitForTimeout(1500);
    const en = await e.locator('#oRusalceOkno').innerText().catch(() => '');
    const enPata = await e.locator('#kdo .pata').innerText().catch(() => '');
    kontrola('the line in English', /free, open-source piano app for children and beginners/.test(enPata) && /More about Rusalka/.test(enPata) && /stay entirely on your device/.test(enPata), enPata);
    kontrola('About in English: opened from #about on load, no Czech', await viditelna(e, '#oRusalceOkno') && /dad of two/.test(en)
      && !/[ěščřžýáíéůú]/i.test(en.replace('Jiří Nečas', '')), en.slice(0, 120));   // the author's name is the same in every language
    kontrola('no page errors (About)', e.chyby.length === 0, e.chyby.join(' | '));
    await e.close();
  });
  await zkus('New player', async () => {
    await p.locator('#kdoNovy').click();
    kontrola('adding another player: no promise strip (only on the first visit)', !(await viditelna(p, '#novyUvod')));
    kontrola('adding another player: Back is there, no logo', await viditelna(p, '#novyZpet') && !(await viditelna(p, '#novy .logo-novy')));
    kontrola('+ New player opens New player', await viditelna(p, '#novy'));
    kontrola('New player fits the screen width (one column on a phone, nothing sticks out)', await p.evaluate(() => {
      const v = innerWidth, ven = [...document.querySelectorAll('#novy *')].filter(e => e.getClientRects().length && e.getBoundingClientRect().right > v + 1);
      return document.documentElement.scrollWidth <= v + 1 && !ven.length;
    }));
    const poradi = () => p.locator('#novyObrazky .obrazek').evaluateAll(el => el.map(e => e.dataset.obrazek));
    const pred = await poradi();
    await snimek(p, 'novy-dite');
    await p.locator('#novy [data-vek="dospely"]').click();
    const po = await poradi();
    kontrola('one picture choice for everybody: 18 animals, then 6 pictures for adults; Child / Adult keeps it', pred.length === 24
      && pred.slice(18).join() === 'rusalka,klic,klavir,metronom,lyra,ladicka' && po.join() === pred.join(), pred.slice(16).join());
    kontrola('the pictures for adults are illustrations', await p.locator('#novyObrazky [data-obrazek="lyra"] image').getAttribute('href') === 'pictures/lyra.webp'
      && await p.evaluate(() => new Promise(ok => { const i = new Image(); i.onload = () => ok(i.naturalWidth > 100); i.onerror = () => ok(false); i.src = 'pictures/lyra.webp'; })));
    await p.locator('#novyObrazky [data-obrazek="metronom"]').click();
    await p.locator('#novyBarvy [data-barva="malina"]').click();
    await p.fill('#novyJmeno', 'Marta');
    const nahled = await p.locator('#novyNahled').evaluate(e => getComputedStyle(e).backgroundColor);
    kontrola('colour recolours the preview', nahled === 'rgb(251, 228, 232)', nahled);
    await snimek(p, 'novy');
    await p.locator('#novyHotovo').click();
    await p.waitForTimeout(300);
    const pr = await ulozeno(p, 'profily');
    const m = pr.find(x => x.jmeno === 'Marta');
    kontrola('Done saves the profile with colour, picture and age', m?.barva === 'malina' && m?.obrazek === 'metronom' && m?.vek === 'dospely', JSON.stringify(m));
    kontrola('old profiles get a colour and picture filled in', pr.find(x => x.id === 'e')?.barva === 'mech' && pr.find(x => x.id === 'f')?.obrazek === 'kralik');
  });
  await zkus('My profile', async () => {
    kontrola('after Done the new player is selected and home is shown', await viditelna(p, '#domu'));
    kontrola('the player menu is closed at first', !(await viditelna(p, '#jaMenu'))
      && (await p.locator('#mujProfilOtevrit').getAttribute('aria-expanded')) === 'false');
    await p.locator('#mujProfilOtevrit').click();
    kontrola('clicking the player opens a menu: Edit, Change player', await viditelna(p, '#jaMenu #upravitHrace')
      && await viditelna(p, '#jaMenu #zmenitHrace') && (await p.locator('#mujProfilOtevrit').getAttribute('aria-expanded')) === 'true'
      && (await p.locator('#jaMenu').textContent()).includes('Upravit') && (await p.locator('#jaMenu').textContent()).includes('Změnit hráče')
      && await p.evaluate(() => document.activeElement?.id === 'upravitHrace'));
    await p.keyboard.press('ArrowDown');
    kontrola('arrow keys move in the player menu', await p.evaluate(() => document.activeElement?.id === 'zmenitHrace'));
    await p.keyboard.press('Escape');
    kontrola('Escape closes the player menu and returns focus', !(await viditelna(p, '#jaMenu'))
      && await p.evaluate(() => document.activeElement?.id === 'mujProfilOtevrit') && await viditelna(p, '#domu'));
    await p.locator('#mujProfilOtevrit').click();
    await p.mouse.click(8, 400);
    kontrola('a click outside closes the player menu', !(await viditelna(p, '#jaMenu')));
    await hrac(p, '#upravitHrace');
    kontrola('player picture opens My profile without delete', await viditelna(p, '#novy') && (await p.locator('#novy').textContent()).includes('Marta')
      && !(await p.locator('#novy').textContent()).includes('Smazat'));
    kontrola('My profile has no Display (it is in Settings)', (await p.locator('#profilZobrazeni').count()) === 0);
    await p.locator('#novyZpet').click();
    await menu(p, 'domu', 'settings');
    kontrola('Settings → Display for the chosen player', await viditelna(p, '#nastaveniZobrazeni #prepPismena')
      && /Marta/.test(await p.locator('#nastaveniZobrazeni').innerText()) && !(await viditelna(p, '#nastaveniZobrazeni #prepDoprovod')));
    const prepinac = () => p.evaluate(() => {
      const b = document.querySelector('#nastaveniZobrazeni #prepPismena'), z = getComputedStyle(b, '::after');
      return { role: b.getAttribute('role'), checked: b.getAttribute('aria-checked'), w: parseFloat(z.width), h: parseFloat(z.height), poloha: z.backgroundPosition, tucne: getComputedStyle(b).fontWeight };
    });
    const zap = await prepinac();
    await p.locator('#nastaveniZobrazeni #prepPismena').click();   // Marta: no letters in the notes
    await p.waitForTimeout(300);                                         // the knob slides
    const vyp = await prepinac();
    kontrola('toggles are switches: role switch, aria-checked follows, a wide track whose knob moves, the label keeps its weight',
      zap.role === 'switch' && zap.checked === 'true' && vyp.checked === 'false' && zap.w > zap.h && zap.poloha !== vyp.poloha && zap.tucne === vyp.tucne,
      JSON.stringify([zap, vyp]));
    await p.keyboard.press('Escape');
    await hrac(p, '#zmenitHrace');
    await p.locator('#kdo .dlazdice-hrace', { hasText: 'Fík' }).click();
    const fik = await p.evaluate(() => [document.body.classList.contains('bez-pismen'), document.querySelector('#prepPismena').classList.contains('zap')]);
    await hrac(p, '#zmenitHrace');
    await p.locator('#kdo .dlazdice-hrace', { hasText: 'Marta' }).click();
    const marta = await p.evaluate(() => [document.body.classList.contains('bez-pismen'), document.querySelector('#prepPismena').classList.contains('zap')]);
    kontrola('per-player settings apply after switching', fik.join() === 'false,true' && marta.join() === 'true,false', `Fík ${fik} | Marta ${marta}`);
  });
  kontrola('no page errors (Task 5)', p.chyby.length === 0, p.chyby.join(' | '));
  await p.close();

  // ---------------------------------------------------------------- Task 6: Player home
  const d = await stranka(DATA());
  await zkus('Player home', async () => {
    await d.locator('#kdo .dlazdice-hrace', { hasText: 'Fík' }).click();
    await d.waitForTimeout(1200);
    kontrola('Keep going shows the last played song', (await d.locator('#pokracujNazev').textContent()).includes('Frère Jacques'));
    const cesta = await d.locator('#pokracujCesta > div').evaluateAll(el => el.map(e => e.className));
    kontrola('step bars by stars', cesta.join() === 'hotovo,ted,nezacato', cesta.join());
    kontrola('no song is „new“ after an update', (await d.locator('#pisne .stitek-nova').count()) === 0);
    const kubo = await d.locator('#pisne .dl', { hasText: 'Frère Jacques' }).locator('.kroky3 i').evaluateAll(el => el.map(e => e.className));
    kontrola('tile has three step bars', kubo.join() === 'ano,,', kubo.join());
    await snimek(d, 'domu');
    await d.fill('#hledat', 'frere');
    await d.waitForTimeout(200);
    kontrola('search ignores diacritics', (await d.locator('#pisne .dl:not(.dl-vymysli)').count()) === 1);
    await d.fill('#hledat', '');
    const zal = await d.locator('#zalozky button:visible').allInnerTexts();
    kontrola('tabs: For me, Favourites and the shelves that have songs (no difficulty tabs, no Mine without own songs)',
      zal.join() === 'Pro mě,Oblíbené,Dětské,Vánoční,Klasika', zal.join());
    kontrola('every tile shows its difficulty', (await d.locator('#pisne .dl[data-soubor]').count()) > 0
      && (await d.locator('#pisne .dl[data-soubor]:not(:has(.obtiznost))').count()) === 0);
    await d.locator('#zalozky [data-zalozka="oblibene"]').click();
    kontrola('Favourites with no favourites are empty', (await d.locator('#pisne .dl:not(.dl-vymysli)').count()) === 0);
    await d.locator('#zalozky [data-zalozka="pro-me"]').click();
    await d.locator('#pisne .dl', { hasText: 'Silent Night' }).locator('.oblibena').click();
    const obl = await ulozeno(d, 'oblibene');
    kontrola('star on a tile adds a favourite and the song does not open', obl?.f?.includes('Silent Night.musicxml') && await viditelna(d, '#domu')
      && (await d.locator('#pisne .dl', { hasText: 'Silent Night' }).locator('.oblibena.ano').count()) === 1);
    await d.locator('#zalozky [data-zalozka="oblibene"]').click();
    kontrola('Favourites show the marked one', (await d.locator('#pisne .dl:not(.dl-vymysli)').count()) === 1);
    await d.locator('#pisne .dl', { hasText: 'Silent Night' }).locator('.oblibena').click();
    kontrola('second tap removes the favourite', !(await ulozeno(d, 'oblibene'))?.f?.includes('Silent Night.musicxml'));
    await d.locator('#zalozky [data-zalozka="pro-me"]').click();
    await d.locator('#pisne .dl-vymysli').click();
    kontrola('Make up a song opens the dialog', await viditelna(d, '.modal.doplnek'));
    await d.locator('.modal.doplnek .zavrit, .modal.doplnek [data-zavrit]').first().click().catch(() => d.evaluate(() => document.querySelector('.modal.doplnek')?.remove()));
    await d.locator('#domu .menu-ai').click();
    await snimek(d, 'pomocnik-aplikace');
    kontrola('AI in the Home menu opens the AI window', await viditelna(d, '#aiOkno #pomocnikPokyny'));
    kontrola('Home says: free, open source, data stay on the device', await d.evaluate(() => {
      const p = document.querySelector('#domu .pata'); return !!p && /zdarma/.test(p.textContent) && /zařízení/.test(p.textContent) && !!p.querySelector('.odkaz'); }));
    kontrola('top menu on Home: every link within the screen (or collapsed into Menu)', await d.evaluate(() => ['.menu-songs', '.menu-players', '.menu-ai', '.menu-settings', '.menu-about']
      .every(s => { const e = document.querySelector('#domu .horni ' + s); if (!e) return false; const r = e.getBoundingClientRect();
        return r.width === 0 ? !!document.querySelector('#domu .horni-menu.sbalene') : r.right <= innerWidth + 1 && r.left >= -1; })));
    await d.locator('#pomocnikVysledky').click();
    await d.waitForTimeout(1800);
    const zkopirovano = /Zkopírováno/.test(await d.locator('#toast').textContent()) ? 'toast' : await d.locator('#pomocnikText').inputValue().catch(() => '');
    kontrola('Copy results for the helper', zkopirovano === 'toast' || /Fík/.test(zkopirovano), String(zkopirovano).slice(0, 80));
    // paste notes from the helper: mistakes are listed and no song is made; a valid notation opens the new-song editor
    await d.locator('#pomocnikVlozit').click();
    await d.locator('#vlozitText').fill('title: Zkouška\ntime: 2/4\n---\n1) C | C4/4 X9/4\n2) C4/2\n');
    await d.locator('#vlozitOtevrit').click();
    await snimek(d, 'vlozit-chyby');
    const chyby = await d.locator('#vlozitChyby').innerText().catch(() => '');
    kontrola('pasted notation with mistakes: listed with line numbers, no editor', /řádek 4/.test(chyby) && /řádek 5/.test(chyby) && !(await viditelna(d, '.editor')), chyby.slice(0, 120));
    await d.keyboard.press('Escape');
    kontrola('Escape closes the paste dialog, not the AI window under it', !(await viditelna(d, '#vlozitOkno')) && await viditelna(d, '#aiOkno'));
    await d.locator('#pomocnikVlozit').click();
    // a whole chat answer as the copy button gives it: prose, a fenced block, a note below
    await d.locator('#vlozitText').fill('Tady jsou noty:\n\n```\ntitle: Zkouška ze schránky\ntime: 2/4\n---\n1) C | C4/4 E4/4\n2) {?} G7 | G4/2\n```\n\nNejistý je takt 2.\n');
    await d.locator('#vlozitOtevrit').click();
    await d.waitForTimeout(600);
    kontrola('a whole pasted chat answer opens the editor with its title and the uncertain bar marked', await viditelna(d, '.editor')
      && (await d.locator('.editor .editor-nazev').inputValue()) === 'Zkouška ze schránky' && !(await viditelna(d, '#vlozitOkno')) && !(await viditelna(d, '#aiOkno'))
      && (await d.locator('.editor .nejisty').count()) > 0);
    await d.evaluate(() => document.querySelector('.editor [data-akce="zavrit"], .editor .zavrit')?.click());
    await d.evaluate(() => document.querySelector('.editor')?.remove());
    await d.locator('#pokracujHrat').click();
    await d.waitForTimeout(800);
    kontrola('Play leads to Before playing with the recommended step and speed',
      await viditelna(d, '#pred') && (await d.locator('#pred .volba.ted').getAttribute('data-krok')) === 'pockej'
      && (await d.locator('#pred .volba.ted').textContent()).includes('doporučuju')
      && (await d.locator('#predRychlost .ted').getAttribute('data-rychlost')) === '80');
    await d.locator('#predZpet').click();
    await hrac(d, '#zmenitHrace');
    kontrola('change leads to Who is playing', await viditelna(d, '#kdo'));
  });
  kontrola('no page errors (Task 6)', d.chyby.length === 0, d.chyby.join(' | '));
  await d.close();

  // how this device plays: piano over MIDI, microphone or on-screen keys – one button on Home, remembered per device
  const vs = await stranka(DATA());
  const mp3 = [];
  vs.on('request', r => { if (r.url().endsWith('.mp3')) mp3.push(r.url()); });
  await zkus('How you play', async () => {
    await vs.locator('#kdo .dlazdice-hrace', { hasText: 'Fík' }).click();
    await vs.waitForTimeout(600);
    kontrola('the piano recordings are not downloaded when the page opens', mp3.length === 0, mp3.join());
    const tl = '#domu #vstupTlacitko', text = () => vs.locator(tl).innerText();
    // no piano: Before playing says what you play on and offers the microphone right under Play
    await vs.locator('#pokracujHrat').click();
    await vs.waitForTimeout(600);
    kontrola('no piano: under Play a line says why (no piano connected), the on-screen keys, and offers the microphone', await viditelna(vs, '#predVstup')
      && /Klavír není připojený, hrajete na klávesách na obrazovce/.test(await vs.locator('#predVstup').innerText()) && await viditelna(vs, '#predMikrofon'),
      await vs.locator('#predVstup').innerText().catch(() => ''));
    await vs.locator('#predMikrofon').click();
    kontrola('Turn on the microphone switches the mode and the line goes away', !(await viditelna(vs, '#predVstup'))
      && await vs.evaluate(() => JSON.parse(localStorage.getItem('kt-vstup'))?.rezim === 'mikrofon'));
    await vs.evaluate(() => localStorage.removeItem('kt-vstup'));
    await vs.reload(); await vs.waitForTimeout(1500);
    await vs.locator('#kdo .dlazdice-hrace', { hasText: 'Fík' }).click();
    await vs.waitForTimeout(600);
    kontrola('Home has the input button: no piano yet, and it says so', await viditelna(vs, tl) && /Hraje se na: klávesy na obrazovce \(klavír nepřipojen\)/.test(await text())
      && (await vs.locator(tl).getAttribute('aria-expanded')) === 'false', await text());
    await vs.locator(tl).click();
    const polozky = await vs.locator('#vstupMenu [role="menuitemradio"]').evaluateAll(el => el.map(e => [e.dataset.vstup, e.getAttribute('aria-checked'), e.innerText.replace(/\s+/g, ' ')]));
    kontrola('the menu offers MIDI, Microphone, On-screen keys, each with a line; MIDI is checked', await viditelna(vs, '#vstupMenu')
      && polozky.map(x => x[0]).join() === 'midi,mikrofon,obrazovka' && polozky.map(x => x[1]).join() === 'true,false,false'
      && /USB/.test(polozky[0][2]) && /Žádný klavír není připojený/.test(polozky[0][2]) && /poslouchá/.test(polozky[1][2]) && /obrazovce/.test(polozky[2][2]), JSON.stringify(polozky));
    await vs.evaluate(() => { const md = navigator.mediaDevices; if (md) md.getUserMedia = async () => { window.__mikrofonZadan = true; throw new Error('test'); }; });
    await vs.locator('#vstupMenu [data-vstup="mikrofon"]').click();
    const ulozenyVstup = () => vs.evaluate(() => JSON.parse(localStorage.getItem('kt-vstup') || 'null'));
    kontrola('choosing Microphone closes the menu, the button says so, stored for the device', !(await viditelna(vs, '#vstupMenu'))
      && /Hraje se na: mikrofon/.test(await text()) && (await ulozenyVstup())?.rezim === 'mikrofon', await text());
    kontrola('no microphone permission asked before Play', await vs.evaluate(() => !window.__mikrofonZadan));
    await vs.reload(); await vs.waitForTimeout(1500);
    await vs.locator('#kdo .dlazdice-hrace', { hasText: 'Fík' }).click();
    await vs.waitForTimeout(400);
    kontrola('the choice survives a reload', /Hraje se na: mikrofon/.test(await text()));
    await vs.locator(tl).click();
    await vs.keyboard.press('Escape');
    kontrola('Escape closes the input menu and returns focus', !(await viditelna(vs, '#vstupMenu'))
      && await vs.evaluate(() => document.activeElement?.id === 'vstupTlacitko'));
    await vs.locator(tl).click();
    await vs.locator('#vstupMenu [data-vstup="obrazovka"]').click();
    kontrola('On-screen keys', /Hraje se na: klávesy na obrazovce/.test(await text()) && (await ulozenyVstup())?.rezim === 'obrazovka');
    await vs.evaluate(() => window.__pripojKlavir(['FP-10']));
    await vs.waitForTimeout(300);
    kontrola('a piano connected during the visit switches to MIDI', /Hraje se na: klavír FP-10/.test(await text()) && (await ulozenyVstup())?.rezim === 'midi', await text());
    kontrola('the menu names the connected piano', /Připojeno: FP-10/.test(await vs.locator('#vstupMenu [data-vstup="midi"]').textContent()));
    kontrola('the button fits next to the menu on this width', await vs.evaluate(() => {
      const r = document.querySelector('#vstupTlacitko').getBoundingClientRect(); return r.right <= innerWidth + 1 && r.left >= -1 && r.height >= 44;
    }));
    await snimek(vs, 'vstup');
    await menu(vs, 'domu', 'settings');
    const volby = () => vs.locator('#nastaveniOkno [data-vstup]').evaluateAll(el => el.map(e => e.getAttribute('aria-checked')).join());
    const dopr = () => vs.locator('#nastaveniDoprovod').evaluate(e => e.classList.contains('zap'));
    kontrola('Settings → Piano shows the same choice as Home (MIDI) with the accompaniment on', (await volby()) === 'true,false,false' && await dopr());
    await vs.locator('#nastaveniOkno [data-vstup="mikrofon"]').click();
    kontrola('Microphone in Settings: accompaniment off, Home follows', (await volby()) === 'false,true,false' && !(await dopr())
      && /Hraje se na: mikrofon/.test(await text()));
    await vs.locator('#nastaveniDoprovod').click();
    kontrola('the accompaniment can be turned on with the microphone, MIDI keeps its own', await dopr()
      && (await vs.evaluate(() => JSON.parse(localStorage.getItem('kt-vstup')).doprovod)).midi === true);
    await vs.locator('#nastaveniOkno [data-vstup="midi"]').click();
    kontrola('Settings → Display is there for Fík', /Fík/.test(await vs.locator('#nastaveniZobrazeni').innerText()));
    kontrola('Settings → Display has no Fingering or Loop (they belong to a song and to one game)', await viditelna(vs, '#nastaveniZobrazeni #prepPismena')
      && !(await viditelna(vs, '#nastaveniZobrazeni #prepPrstoklad')) && !(await viditelna(vs, '#nastaveniZobrazeni #prepSmycka')));
    kontrola('nothing in Settings sticks out of the window', await vs.evaluate(() => {
      const k = document.querySelector('#nastaveniOkno .karta').getBoundingClientRect();
      return ![...document.querySelectorAll('#nastaveniOkno .karta *')].some(e => e.getClientRects().length && e.getBoundingClientRect().right > k.right + 1);
    }));
    await vs.keyboard.press('Escape');
  });
    // microphone refused and the on-screen keys turned off: the keys show anyway, so the player can still play
    await menu(vs, 'domu', 'settings');
    await vs.locator('#nastaveniOkno [data-vstup="mikrofon"]').click();
    if (await vs.locator('#nastaveniZobrazeni #prepKlaviatura').evaluate(e => e.classList.contains('zap'))) await vs.locator('#nastaveniZobrazeni #prepKlaviatura').click();
    await vs.keyboard.press('Escape');
    await vs.locator('#pokracujHrat').click();
    await vs.waitForTimeout(800);
    await vs.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { window.__mikrofonZadan = true; throw new Error('test'); }; });   // the reload dropped the stub
    await vs.evaluate(() => {                              // count notes played from a recording (the AudioContext does not exist yet)
      const C = window.AudioContext || window.webkitAudioContext, puvodni = C.prototype.createBufferSource;
      window.__nahravky = 0; C.prototype.createBufferSource = function (...a) { window.__nahravky++; return puvodni.apply(this, a); };
    });
    await vs.locator('#predHrat').click();
    await vs.waitForTimeout(1500);
    kontrola('microphone refused with the on-screen keys off: Play asked for it, the keys still show', await vs.evaluate(() => !!window.__mikrofonZadan)
      && await viditelna(vs, '#hra') && !(await vs.locator('#hra').evaluate(e => e.classList.contains('bez-klaviatury'))) && await viditelna(vs, '#klavesy'));
    await vs.waitForTimeout(1500);
    await vs.locator('#klavesy .klavesa[data-p="60"]').click();
    await vs.waitForTimeout(300);
    kontrola('the 30 piano recordings are loaded and an on-screen key plays one', new Set(mp3.filter(u => /\/sounds\/piano\//.test(u))).size === 30
      && await vs.evaluate(() => window.__nahravky > 0), `${mp3.length} mp3, ${await vs.evaluate(() => window.__nahravky)} played`);
  kontrola('no page errors (How you play)', vs.chyby.length === 0, vs.chyby.join(' | '));
  // restoring a backup on the first visit (New player): Settings close and Who is playing shows the restored players
  const ob = await stranka(DATA([]), undefined, undefined, 'cs', false);
  await zkus('Restore from a backup', async () => {
    kontrola('a new browser starts on New player', await viditelna(ob, '#novy'));
    await menu(ob, 'novy', 'settings');
    const en = new TextEncoder(), zip = zabalZip(new Map([['rusalka.json', en.encode('{ "verze": 1 }')],
      ['data/profily.json', en.encode(JSON.stringify(PROFILY.slice(0, 2)))]]));
    await ob.locator('#ulozisteObnova').setInputFiles({ name: 'zaloha.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) });
    await ob.waitForSelector('#kdo .dlazdice-hrace', { timeout: 5000 }).catch(() => {});
    const hraci = await ob.locator('#kdo .dlazdice-hrace b').allInnerTexts();
    kontrola('after a restore Settings close and Who is playing shows the restored players', !(await viditelna(ob, '#nastaveniOkno'))
      && await viditelna(ob, '#kdo') && !(await viditelna(ob, '#novy')) && hraci.join() === 'Ela,Fík', hraci.join());
  });
  kontrola('no page errors (Restore)', ob.chyby.length === 0, ob.chyby.join(' | '));
  await ob.close();
  // iPhone/iPad: the picker would grey out .musicxml with an accept filter, so there it shows every file
  kontrola('on a computer the song picker offers music files only', (await vs.locator('#soubor').getAttribute('accept'))?.includes('.musicxml'));
  const ios = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  await ios.addInitScript(() => { delete Navigator.prototype.requestMIDIAccess; });   // Safari: no Web MIDI
  await ios.goto(`http://127.0.0.1:${PORT}/`); await ios.waitForTimeout(1200);
  kontrola('on an iPhone the song picker has no type filter (so .musicxml can be chosen)', (await ios.locator('#soubor').getAttribute('accept')) === null);
  const APP_STORE = 'https://apps.apple.com/app/web-midi-browser/id953846217';
  await ios.goto(`http://127.0.0.1:${PORT}/#about`); await ios.waitForTimeout(1000);
  kontrola('About links Web MIDI Browser to the App Store', (await ios.locator(`#oRusalceOkno a[href="${APP_STORE}"]`).textContent().catch(() => '')) === 'Web MIDI Browser');
  await ios.keyboard.press('Escape');
  await ios.fill('#novyJmeno', 'Iva'); await ios.locator('#novyHotovo').click(); await ios.waitForTimeout(600);
  await ios.locator('#vstupTlacitko').click();
  kontrola('without Web MIDI the input menu links Web MIDI Browser on the App Store', await viditelna(ios, `#vstupMenu a[href="${APP_STORE}"]`)
    && (await ios.locator('#vstupMenu [data-vstup="midi"]').isDisabled()));
  await ios.close();
  // iPad in the Web MIDI Browser app: its port lists have forEach, but values() is not iterable, and setting
  // onmidimessage opens the port and fires statechange; Rusalka must still see the piano and hear its notes
  const wmb = await b.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  await wmb.addInitScript(() => {
    delete Navigator.prototype.requestMIDIAccess;
    const mapa = porty => ({ size: porty.length, forEach: cb => porty.forEach(x => cb(x)), values: () => ({ next: () => ({ done: true }) }) });
    const acc = { onstatechange: null };
    const vstup = { name: 'FP-10', state: 'connected', connection: 'closed', _h: null,
      get onmidimessage() { return this._h; },
      set onmidimessage(f) { this._h = f; if (this.connection === 'closed') { this.connection = 'open'; acc.onstatechange?.({ port: this }); } } };
    acc.inputs = mapa([vstup]); acc.outputs = mapa([{ name: 'FP-10', state: 'connected', send() {} }]);
    window.__wmbNota = p => (vstup._h ? (vstup._h({ data: [0x90, p, 90] }), vstup._h({ data: [0x80, p, 0] }), true) : null);
    navigator.requestMIDIAccess = () => ({ then: ok => setTimeout(() => ok(acc), 30) });   // the app's own thenable
  });
  await wmb.goto(`http://127.0.0.1:${PORT}/`); await wmb.waitForTimeout(1200);
  await wmb.fill('#novyJmeno', 'Iva'); await wmb.locator('#novyHotovo').click(); await wmb.waitForTimeout(600);
  kontrola('Web MIDI Browser (iPad): Home says it plays on the connected piano', /Hraje se na: klavír FP-10/.test(await wmb.locator('#vstupTlacitko').innerText()),
    await wmb.locator('#vstupTlacitko').innerText());
  kontrola('Web MIDI Browser (iPad): the piano input has a note handler and a note goes through without an error',
    await wmb.evaluate(() => { try { return window.__wmbNota(60) !== null && (window.__wmbNota(60), true); } catch { return false; } }));
  await wmb.close();
  await vs.close();

  // ---------------------------------------------------------------- Task 7: Before playing and Playing
  const h = await stranka(DATA());
  // the language right on the first screen, in every language's own name
  const lj = await stranka(DATA());
  await zkus('Language on the first screen', async () => {
    const volby = await lj.locator('#kdo .jazyk-volba option').evaluateAll(el => el.map(o => [o.value, o.textContent]));
    kontrola('Who is playing has a language select with 16 languages in their own names, Czech chosen', await viditelna(lj, '#kdo .jazyk-volba')
      && volby.length === 16 && volby.some(([v, x]) => v === 'de' && x === 'Deutsch') && volby.some(([v, x]) => v === 'ja' && x === '日本語')
      && (await lj.locator('#kdo .jazyk-volba').inputValue()) === 'cs' && (await lj.locator('#novy .jazyk-volba').count()) === 1
      && (await lj.locator('#volbaJazyka option').count()) === 16, JSON.stringify(volby).slice(0, 200));
    await Promise.all([lj.waitForEvent('load'), lj.locator('#kdo .jazyk-volba').selectOption('fr')]);
    await lj.waitForSelector('#kdo:not(.skryta)');
    kontrola('choosing Français reloads in French with Do Ré Mi note names', await lj.evaluate(() => document.documentElement.lang) === 'fr'
      && (await lj.locator('#kdo .jazyk-volba').inputValue()) === 'fr' && await lj.evaluate(() => JSON.parse(localStorage.getItem('kt-soustava'))) === 'do');
    await Promise.all([lj.waitForEvent('load'), lj.locator('#kdo .jazyk-volba').selectOption('cs')]);
  });
  kontrola('no page errors (language)', lj.chyby.length === 0, lj.chyby.join(' | '));
  await lj.close();

  // review fixes: the hand by age after a change of player, 44 px targets, the help line only while Rusalka plays a hand
  const r2 = await stranka(DATA());
  await zkus('What will you play: hand per player and targets', async () => {
    await r2.locator('#kdo .dlazdice-hrace', { hasText: 'Fík' }).click();
    await r2.waitForTimeout(600);
    await r2.locator('#pisne .dl', { hasText: 'Frère Jacques' }).click();
    await r2.waitForSelector('#predNoty svg', { timeout: 15000 });
    const vyska = sel => r2.locator(sel).first().evaluate(e => e.getBoundingClientRect().height);
    kontrola('change, exactly and About the song are 44 px targets', (await vyska('#predZmenit')) >= 44 && (await vyska('#predPresne')) >= 44 && (await vyska('#oPisni')) >= 44,
      `${await vyska('#predZmenit')} ${await vyska('#predPresne')} ${await vyska('#oPisni')}`);
    await r2.locator('#predZmenit').click();
    await r2.locator('#predCo [data-uroven="4"]').click();
    await r2.waitForTimeout(500);
    kontrola('the hand buttons are 44 px; with Both the line "Rusalka plays the other hand" is hidden', (await vyska('#predRuce [data-ruka]')) >= 44
      && !(await r2.locator('#predRuce small').isVisible()));
    await r2.locator('#predRuce [data-ruka="1"]').click();
    kontrola('with the right hand the line says Rusalka plays the other one', await r2.locator('#predRuce small').isVisible());
    await r2.locator('#predRuce [data-ruka="vse"]').click();
    await r2.locator('#predZpet').click();
    await hrac(r2, '#zmenitHrace');
    await r2.locator('#kdo .dlazdice-hrace', { hasText: 'Ela' }).click();
    await r2.waitForTimeout(600);
    await r2.locator('#pisne .dl', { hasText: 'Frère Jacques' }).click();
    await r2.waitForSelector('#predNoty svg', { timeout: 15000 });
    kontrola('another child gets the right hand, not the previous player\'s Both', /pravou rukou/.test(await r2.locator('#predSouhrn').innerText()), await r2.locator('#predSouhrn').innerText());
  });
  kontrola('no page errors (hand per player)', r2.chyby.length === 0, r2.chyby.join(' | '));
  await r2.close();

  await zkus('Before playing and playing', async () => {
    await h.locator('#kdo .dlazdice-hrace', { hasText: 'Fík' }).click();
    await h.waitForTimeout(600);
    await h.locator('#pisne .dl', { hasText: 'Frère Jacques' }).click();
    await h.waitForSelector('#predNoty svg', { timeout: 15000 });
    kontrola('Before playing shows the start of the notes', true);
    // What will you play: a summary line opens the version cards and the hand choice
    const souhrnText = async () => (await h.locator('#predSouhrn').innerText()).replace(/\s+/g, ' ');
    kontrola('Before playing: a summary of what you play with a change button, closed', /Hrajete: Celá melodie/.test(await souhrnText())
      && (await h.locator('#predZmenit').getAttribute('aria-expanded')) === 'false' && !(await h.locator('#vicPanel').isVisible()), await souhrnText());
    await h.locator('#predZmenit').click();
    const karty = await h.locator('#predCo [data-uroven]').evaluateAll(el => el.map(e => [e.dataset.uroven, e.querySelector('b')?.textContent, !!e.querySelector('small')?.textContent.trim(), e.getAttribute('aria-pressed')]));
    kontrola('What will you play: five cards in order, one line each, the chosen one pressed', await h.locator('#vicPanel').isVisible()
      && karty.map(k => k[1]).join('|') === 'Melodie, snadný rytmus|Celá melodie|Melodie a basy|Melodie a akordy|Všechny noty'
      && karty.every(k => k[2]) && karty.find(k => k[3] === 'true')?.[0] === '2', JSON.stringify(karty));
    kontrola('the old level and hand selects are gone; the style only with Melody and chords', (await h.locator('select#uroven, select#ruka').count()) === 0
      && !(await h.locator('#styl').isVisible()));
    const ma = async sel => (await h.locator('#vicPanel ' + sel).count()) === 1;
    kontrola('the opened section keeps section, key, Learn in pieces, Together, About the song, Echo, favourite, exact speed',
      await ma('#usek') && await ma('#tonina') && await ma('#pruvodce') && await ma('#dvojice')
      && (await h.locator('#pred #oPisni').count()) === 1 && await ma('#ozvena') && (await h.locator('#pred #predOblibena').count()) === 1 && (await h.locator('#pred #rychlost').count()) === 1);
    // the favourite is a star by the title, About the song a link under the author, the actions rows under More to do
    const hvezda = () => h.locator('#predOblibena').getAttribute('aria-pressed');
    kontrola('a favourite star next to the title, labelled, not pressed', await h.evaluate(() => document.querySelector('#predOblibena')?.closest('.pred-titul')?.contains(document.querySelector('#predNazev')))
      && (await hvezda()) === 'false' && /oblíbených/.test(await h.locator('#predOblibena').getAttribute('aria-label')));
    await h.locator('#predOblibena').click();
    kontrola('the star toggles the favourite', (await hvezda()) === 'true' && /Odebrat/.test(await h.locator('#predOblibena').getAttribute('aria-label')));
    await h.locator('#predOblibena').click();
    kontrola('About the song is a link under the author, outside the section', await viditelna(h, '#pred .autor-radek #oPisni')
      && (await h.locator('#vicPanel #oPisni').count()) === 0);
    kontrola('More to do: Learn in pieces, Play as a pair and Echo as a button with one line each', /Další možnosti/.test(await h.locator('#vicPanel').innerText())
      && await radek(h, '#pruvodce') && await radek(h, '#dvojice') && await radek(h, '#ozvena'));
    kontrola('Before playing has no Edit or Delete', (await h.locator('#pred #upravit, #pred #smazatPisen').count()) === 0);
    // Copy for the helper: an easier version sends the song as written, not the played version (here: generated left hand)
    if (await h.locator('#predCo [data-uroven="4"]:not([disabled])').count()) {
      await h.locator('#predCo [data-uroven="4"]').click();
      await h.waitForTimeout(500);
      kontrola('a card with a left hand (Melody and chords) sets both hands and shows the style', (await h.locator('#predRuce [data-ruka="vse"]').getAttribute('aria-pressed')) === 'true'
        && await h.locator('#styl').isVisible() && /Melodie a akordy, oběma rukama/.test(await souhrnText()), await souhrnText());
      await h.locator('#predRuce [data-ruka="1"]').click();
      await h.waitForTimeout(300);
      kontrola('the hand can be changed: right hand, Rusalka plays the left', /pravou rukou/.test(await souhrnText()) && /levou hraje Rusalka/.test(await souhrnText()), await souhrnText());
      kontrola('Rusalka plays along is hidden while she plays the written left hand', (await h.locator('#vzorPole.skryta').count()) === 1);
      const kopie = await h.evaluate(async () => {          // Songs → Manage → Frère Jacques → easier version
        let text = '';
        navigator.clipboard.writeText = async x => { text = x; };
        location.hash = '#songs';
        await new Promise(r => setTimeout(r, 400));
        document.querySelector('#spravaSeznam [data-soubor="Frère Jacques.musicxml"]')?.click();
        await new Promise(r => setTimeout(r, 300));
        document.querySelector('#spravaJednodussi')?.click();
        await new Promise(r => setTimeout(r, 300));
        return text;
      });
      await h.keyboard.press('Escape');
      const blok = (kopie.match(/```\n(title: Frère Jacques[\s\S]*?)```/) || [])[1] || '';
      kontrola('easier version: the song as written (no generated left hand at level 4)', blok.includes('---') && !/\|\|/.test(blok), blok.slice(0, 200) || kopie.slice(0, 120));
      await h.locator('#predCo [data-uroven="2"]').click();
      await h.waitForTimeout(400);
      kontrola('a one-hand card sets the right hand and hides the hand choice for one staff', /Hrajete: Celá melodie/.test(await souhrnText()) && !(await h.locator('#predRuce').isVisible())
        && !(await h.locator('#styl').isVisible()), await souhrnText());
      kontrola('one staff with chords: "Rusalka plays along" for all songs is shown', await h.locator('#vzorPole').isVisible()
        && /Rusalka hraje s vámi/.test(await h.locator('#vzorPole').innerText()) && /pro všechny písničky/.test(await h.locator('#vzorPole').innerText()));
      await h.locator('#predCo [data-uroven="5"]').click();
      await h.waitForTimeout(400);
      await h.selectOption('#tonina', 'C');
      await h.waitForTimeout(500);
      kontrola('All the notes in another key says the notes get simplified', /zjednoduš/.test(await h.locator('#predCo [data-uroven="5"]').innerText()), await h.locator('#predCo [data-uroven="5"]').innerText());
      await h.selectOption('#tonina', 'ne');
      await h.locator('#predCo [data-uroven="2"]').click();
      await h.waitForTimeout(400);
    } else kontrola('level 4 offered for Frère Jacques', false);
    // exact speed under How fast
    kontrola('exact speed sits under How fast, closed', await viditelna(h, '#predPresne') && !(await h.locator('#rychlost').isVisible())
      && /60 %|80 %|100 %/.test(await h.locator('#predPresne').innerText()));
    await h.locator('#predPresne').click();
    await h.locator('#rychlost').evaluate(e => { e.value = '70'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    kontrola('the exact speed slider sets 70 %', await h.locator('#rychlost').isVisible() && /70 %/.test(await h.locator('#predPresne').innerText())
      && (await h.locator('#predRychlost .ted').count()) === 0, await h.locator('#predPresne').innerText());
    await h.locator('#predRychlost [data-rychlost="80"]').click();
    await snimek(h, 'pred');
    await h.locator('#predHrat').click();
    await h.waitForSelector('#pas svg', { timeout: 15000 });
    await h.waitForTimeout(500);
    kontrola('game: header only Quit, title, description, progress, Pause', await viditelna(h, '#hra #zpet') && await viditelna(h, '#hraNazev')
      && (await h.locator('#hraJak').textContent()).includes('S doprovodem') && await viditelna(h, '#pauza')
      && !(await h.locator('#rezimy').isVisible()) && (await h.locator('#hra #uroven').count()) === 0);
    await snimek(h, 'hra');
    await h.locator('#pauza').click();
    kontrola('Pause: Continue, Again, Display, Quit', await viditelna(h, '#pauzaPrekryv') && await viditelna(h, '#znovu')
      && await viditelna(h, '#pauzaZobrazeni') && await viditelna(h, '#pauzaKonec'));
    await snimek(h, 'pauza');
    await h.locator('#pauzaZobrazeni').click();
    kontrola('Display with toggles, the accompaniment, no microphone', await viditelna(h, '#zobrazeni') && await viditelna(h, '#zobrazeni #prepPismena')
      && await viditelna(h, '#zobrazeni #prepZvukKlavir') && await viditelna(h, '#zobrazeni #prepDoprovod') && (await h.locator('#prepMikrofon').count()) === 0);
    await h.locator('#zobrazeniZavrit').click();
    await h.locator('#pauzaKonec').click();
    await h.waitForTimeout(300);
    kontrola('Quit leads back to Before playing of the same song', await viditelna(h, '#pred')
      && (await h.locator('#predNazev').textContent()).includes('Frère Jacques'), await h.locator('#predNazev').textContent());
    // listening and pause: progress stops
    await h.waitForSelector('#predNoty svg', { timeout: 15000 });
    const rychlosti = await h.locator('#predRychlost button').evaluateAll(el => el.map(b => b.innerText.replace(/\s+/g, ' ').trim()).join('|'));
    kontrola('speeds: Slow, A bit slower, Normal (100 % is the song\'s own tempo)', rychlosti === 'Pomalu 60 %|Trochu pomaleji 80 %|Normálně 100 %', rychlosti);
    await h.locator('#predRychlost [data-rychlost="60"]').click();
    const predVolby = () => h.evaluate(() => [document.querySelector('#predRychlost .ted')?.dataset.rychlost,
      document.querySelector('#predCo [aria-pressed="true"]')?.dataset.uroven].join());
    const predPoslechem = await predVolby();
    await h.locator('#predPoslech').click();
    await h.waitForTimeout(800);
    kontrola('Listen plays the whole song at full speed', /celá písnička v plném tempu/.test(await h.locator('#hraJak').textContent()), await h.locator('#hraJak').textContent());
    const osnovy = await h.evaluate(() => [...document.querySelectorAll('#pas svg g.measure')].map(m => m.querySelectorAll(':scope > g.staff').length));
    kontrola('Listen shows the hardest version in full: a melody-and-chords song gets the left hand on a second staff', osnovy.length > 0 && osnovy.every(n => n === 2), osnovy.join());
    await h.waitForTimeout(4000);                       // count-in
    const sirka = () => h.evaluate(() => parseFloat(document.querySelector('#prubeh').style.width) || 0);
    const a1 = await sirka();
    await h.locator('#pauza').click();
    const a2 = await sirka(); await h.waitForTimeout(1000); const a3 = await sirka();
    kontrola('listening runs and pause stops it', a1 > 0 && a2 === a3, `${a1} → ${a2} → ${a3}`);
    await h.locator('#pauzaKonec').click();
    // together (two players)
    await h.waitForSelector('#pred #predNoty svg', { timeout: 15000 });
    kontrola('after listening Before playing keeps the player\'s choice and speed', (await predVolby()) === predPoslechem, `${predPoslechem} → ${await predVolby()}`);
    await h.locator('#predKroky [data-krok="cekam"]').click();
    await h.locator('#predZmenit').click();
    await h.locator('#vicPanel #dvojice').click();
    kontrola('partner list without the deleted player', !(await h.locator('#dvojiceHraci').textContent()).includes('undefined'));
    await h.locator('#dvojiceHraci .profil, #dvojiceHraci button', { hasText: 'Ela' }).first().click();
    await h.waitForTimeout(800);
    kontrola('in a pair: no hand choice and no "Rusalka plays along"; the summary says the pair', (await h.locator('#vzorPole.skryta').count()) === 1
      && (await h.locator('#predRuce.skryta').count()) === 1 && /ve dvou/.test(await h.locator('#predSouhrn').innerText()), await h.locator('#predSouhrn').innerText());
    await h.locator('#predHrat').click();
    await h.waitForSelector('#pas svg', { timeout: 15000 });
    kontrola('together: role bar in the game', await viditelna(h, '#dvojiceLista'));
    await h.waitForTimeout(400);
    const akord = await h.$$('.klavesa.cil');
    if (akord.length >= 2) {
      await akord[0].dispatchEvent('pointerdown'); await akord[0].dispatchEvent('pointerup');
      await h.waitForTimeout(60);
      kontrola('chord: a correctly pressed note turns green before the whole chord is held',
        await h.locator('#pas g.note.ok').count() === 1 && (await h.$$('.klavesa.cil')).length === akord.length);
    } else kontrola('chord: the first step together is a chord', false, String(akord.length));
    // the bass player (lowest keys, below the boundary) presses a wrong key in the chord step …
    const vedleDvojice = await h.$('.klavesa:not(.cil)');
    await vedleDvojice.dispatchEvent('pointerdown'); await vedleDvojice.dispatchEvent('pointerup');
    for (const x of await h.$$('.klavesa.cil')) { await x.dispatchEvent('pointerdown'); await x.dispatchEvent('pointerup'); }
    await h.waitForTimeout(150);
    const barvyKroku = await h.evaluate(() => ({ vedle: document.querySelectorAll('#pas g.note.vedle').length, ok: document.querySelectorAll('#pas g.note.ok').length }));
    kontrola('together: only the erring part\'s note turns orange, the partner\'s stays green', barvyKroku.vedle === 1 && barvyKroku.ok === 1, JSON.stringify(barvyKroku));
    // … and two wrong keys in a melody-only step: they belong to the bass part, not to the melody note
    const kroku1 = (await h.$$('.klavesa.cil')).length;
    for (const x of (await h.$$('.klavesa:not(.cil)')).slice(0, 2)) { await x.dispatchEvent('pointerdown'); await x.dispatchEvent('pointerup'); }
    await h.waitForTimeout(60);
    kontrola('together: the melody note of that step is not orange', await h.locator('#pas g.note.vedle').count() === 1, `step keys ${kroku1}`);
    for (let i = 0; i < 600 && !(await h.locator('#vysledek').isVisible()); i++) {
      const c = await h.$$('.klavesa.cil');
      if (!c.length) { await h.waitForTimeout(80); continue; }
      for (const x of c) { await x.dispatchEvent('pointerdown'); await x.dispatchEvent('pointerup'); }
      await h.waitForTimeout(30);
    }
    await h.waitForTimeout(600);
    kontrola('together result without the main button, with Once more', await viditelna(h, '#vysledek') && !(await viditelna(h, '#vysHlavni')) && await viditelna(h, '#vysZnovu'));
    kontrola('together with a wrong key: Show mistakes offered', await viditelna(h, '#vysChyby'));
    await h.locator('#vysChyby').click();
    await h.waitForTimeout(500);
    const duchyDvojice = await h.evaluate(() => [...document.querySelectorAll('#pas g.duchove')].map(g => {
      const st = g.parentNode, staffy = [...st.parentNode.querySelectorAll(':scope > g.staff')];
      return { osnova: staffy.indexOf(st) + 1, duchu: g.querySelectorAll('g.duch').length };
    }));
    kontrola('together: each mistake on the staff of the part that made it (bass)', await viditelna(h, '#prehledChyb')
      && duchyDvojice.length === 1 && duchyDvojice[0].osnova === 2 && duchyDvojice[0].duchu === 2, JSON.stringify(duchyDvojice));
    const zaKlicemD = await duchyZaKlicem(h);
    kontrola('together: ghosts clear of the clef and time signature', volneOdKlice(zaKlicemD), JSON.stringify(zaKlicemD));
    await snimek(h, 'chyby-dvojice');
    await h.locator('#chybaZpet').click();
    kontrola('together: Back returns to the result', await viditelna(h, '#vysledek') && await h.locator('#pas g.duchove').count() === 0);
  });
  kontrola('no page errors (Task 7)', h.chyby.length === 0, h.chyby.join(' | '));
  await h.close();

  // ---------------------------------------------------------------- Task 8: Result
  const v = await stranka(DATA());
  await zkus('Result', async () => {
    await v.locator('#kdo .dlazdice-hrace', { hasText: 'Ela' }).click();
    await v.waitForTimeout(600);
    await v.locator('#pisne .dl', { hasText: 'Happy Birthday' }).click();
    await v.waitForSelector('#predNoty svg', { timeout: 15000 });
    await v.locator('#predKroky [data-krok="cekam"]').click();
    await v.locator('#predHrat').click();
    await v.waitForSelector('#pas svg', { timeout: 15000 });
    await v.waitForTimeout(500);
    for (let i = 0; i < 400 && !(await v.locator('#vysledek').isVisible()); i++) {
      const c = await v.$$('.klavesa.cil');
      if (!c.length) { await v.waitForTimeout(80); continue; }
      for (const x of c) { await x.dispatchEvent('pointerdown'); await x.dispatchEvent('pointerup'); }
      await v.waitForTimeout(30);
    }
    await v.waitForTimeout(600);
    const bg = await v.locator('#vysledek').evaluate(e => getComputedStyle(e).backgroundColor);
    kontrola('full-screen result in the player colour', await viditelna(v, '#vysledek') && bg === 'rgb(34, 80, 74)', bg);
    kontrola('after finishing the animal rejoices (happy face and a jump)', await v.locator('#vysAvatar .zvire[data-pohyb="happy"]').count() === 1);
    kontrola('picture, stars, heading, sentence', await viditelna(v, '#vysAvatar .zvire') && (await v.locator('#vysHvezdy .ano').count()) === 3
      && (await v.locator('#vysNadpis').textContent()).length > 0);
    kontrola('main button: next step', (await v.locator('#vysHlavni').textContent()).includes('S doprovodem'));
    kontrola('Once more and Another song', await viditelna(v, '#vysZnovu') && await viditelna(v, '#vysDomu'));
    const denik = await ulozeno(v, 'denik'), dnes = new Date(), klic = `${dnes.getFullYear()}-${String(dnes.getMonth() + 1).padStart(2, '0')}-${String(dnes.getDate()).padStart(2, '0')}`;
    kontrola('the practice diary counts today\'s play with its accuracy', Object.values(denik || {}).some(d => d?.[klic]?.[0] === 1 && d[klic][2] === 1), JSON.stringify(denik));
    kontrola('a clean run offers no Show mistakes', (await v.locator('#vysChyby').count()) === 1 && !(await v.locator('#vysChyby').isVisible()));
    await snimek(v, 'vysledek');
    await v.locator('#vysHlavni').click();
    await v.waitForTimeout(800);
    kontrola('next step leads to Before playing with that step', await viditelna(v, '#pred') && (await v.locator('#pred .volba.ted').getAttribute('data-krok')) === 'pockej');
  });
  kontrola('no page errors (Task 8)', v.chyby.length === 0, v.chyby.join(' | '));
  await v.close();

  // ---------------------------------------------------------------- Mistakes in the score: orange note
  const o = await stranka(DATA());
  await zkus('Orange note', async () => {
    await o.locator('#kdo .dlazdice-hrace', { hasText: 'Ela' }).click();
    await o.waitForTimeout(600);
    await o.locator('#pisne .dl', { hasText: 'Happy Birthday' }).click();
    await o.waitForSelector('#predNoty svg', { timeout: 15000 });
    await o.locator('#predKroky [data-krok="cekam"]').click();
    await o.locator('#predHrat').click();
    await o.waitForSelector('#pas svg', { timeout: 15000 });
    await o.waitForTimeout(500);
    const spatna = await o.$('.klavesa:not(.cil)');
    await spatna.dispatchEvent('pointerdown'); await spatna.dispatchEvent('pointerup');
    for (let i = 0; i < 400 && !(await o.locator('#vysledek').isVisible()); i++) {
      const c = await o.$$('.klavesa.cil');
      if (!c.length) { await o.waitForTimeout(80); continue; }
      for (const x of c) { await x.dispatchEvent('pointerdown'); await x.dispatchEvent('pointerup'); }
      await o.waitForTimeout(30);
    }
    const oranz = await o.evaluate(() => {
      const n = document.querySelectorAll('#pas g.note.vedle');
      const sonda = document.createElement('i');
      sonda.style.color = getComputedStyle(document.documentElement).getPropertyValue('--oranzova').trim();
      document.body.appendChild(sonda);
      const cil = getComputedStyle(sonda).color;
      sonda.remove();
      const hlava = n[0]?.querySelector('.notehead path, .notehead');
      const kruh = document.querySelector('#pas .ovl.vedle .kruh');
      return { pocet: n.length, cil, fill: hlava ? getComputedStyle(hlava).fill : null,
        znacka: kruh ? getComputedStyle(kruh).strokeDasharray : null, obrys: kruh ? getComputedStyle(kruh).stroke : null };
    });
    kontrola('a note found after a wrong key is orange with a mark', oranz.pocet === 1 && oranz.fill === oranz.cil && oranz.znacka && oranz.znacka !== 'none'
      && oranz.obrys !== oranz.cil, JSON.stringify(oranz));
    await o.waitForTimeout(600);
    kontrola('Show mistakes offered after a wrong key', await viditelna(o, '#vysChyby'));
    await o.locator('#vysChyby').click();
    await o.waitForTimeout(600);
    const duch = await o.evaluate(() => {
      const d = document.querySelectorAll('#pas svg g.duch');
      const el = d[0]?.querySelector('ellipse:not(.halo)');
      const sonda = document.createElement('i');
      sonda.style.color = getComputedStyle(document.documentElement).getPropertyValue('--cervena').trim();
      document.body.appendChild(sonda);
      const cil = getComputedStyle(sonda).color;
      sonda.remove();
      const skup = document.querySelector('#pas g.duchove');
      return { pocet: d.length, stroke: el ? getComputedStyle(el).stroke : null, fill: el ? getComputedStyle(el).fill : null, cil,
        ted: !!skup?.classList.contains('ted'), text: document.querySelector('#chybaPocet')?.textContent || '' };
    });
    kontrola('review: result hidden, bar with the mistake count', !(await o.locator('#vysledek').isVisible()) && await viditelna(o, '#prehledChyb')
      && /1/.test(duch.text), duch.text);
    kontrola('review: one red hollow notehead, highlighted', duch.pocet === 1 && duch.stroke === duch.cil && duch.fill === 'none' && duch.ted, JSON.stringify(duch));
    kontrola('review: Practise bar 1', /1/.test(await o.locator('#chybaProcvicit').textContent()));
    kontrola('review with one mistake: focus on Back', await aktivni(o) === 'chybaZpet', await aktivni(o));
    const zaKlicem = await duchyZaKlicem(o);
    kontrola('review: the ghost of the first note is clear of the clef and time signature', volneOdKlice(zaKlicem), JSON.stringify(zaKlicem));
    const halo = await o.evaluate(() => {
      const e = document.querySelector('#pas g.duch ellipse.halo'), x = document.querySelector('#pas g.duch ellipse:not(.halo)');
      return { stroke: e ? getComputedStyle(e).stroke : null, siroka: e && x ? Number(e.getAttribute('stroke-width')) > Number(x.getAttribute('stroke-width')) : false };
    });
    kontrola('review: a ghost has a halo in the card colour under its red ring', halo.stroke === 'rgb(255, 255, 255)' && halo.siroka, JSON.stringify(halo));
    await snimek(o, 'chyby-prehled');
    await o.locator('#chybaZpet').click();
    kontrola('review: Back returns to the result without ghosts', await viditelna(o, '#vysledek') && !(await o.locator('#prehledChyb').isVisible())
      && await o.locator('#pas g.duchove').count() === 0);
    kontrola('review: Back returns focus to Show mistakes', await aktivni(o) === 'vysChyby', await aktivni(o));
  });
  kontrola('no page errors (orange note)', o.chyby.length === 0, o.chyby.join(' | '));
  await o.close();

  // ---------------------------------------------------------------- Mistakes in the score: Original level with clefs and keys
  // a test piece (tests/data): left hand in treble clef, right hand changes to bass clef, key change to D major
  const KLICE = DATA();
  KLICE.pisne['Clef and key test.musicxml'] = readFileSync(new URL('tests/data/clefs_and_keys.musicxml', koren), 'utf8');
  const kl = await stranka(KLICE);
  await zkus('Ghosts at the Original level', async () => {
    await kl.locator('#kdo .dlazdice-hrace', { hasText: 'Jan' }).click();          // an adult: both hands
    await kl.waitForTimeout(600);
    await kl.locator('#pisne .dl', { hasText: 'Clef and key test' }).click();
    await kl.waitForSelector('#predNoty svg', { timeout: 15000 });
    await kl.locator('#predKroky [data-krok="cekam"]').click();
    await kl.locator('#predHrat').click();
    await kl.waitForSelector('#pas svg', { timeout: 15000 });
    await kl.waitForTimeout(500);
    // letters off (Display), so the orange notes show only their non-colour mark
    await kl.locator('#pauza').click();
    await kl.locator('#pauzaZobrazeni').click();
    await kl.locator('#prepPismena').click();
    await kl.locator('#zobrazeniZavrit').click();
    await kl.locator('#pauzaPokracovat').click();
    const stisk = async pp => { const k = kl.locator(`.klavesa[data-p="${pp}"]`); await k.dispatchEvent('pointerdown'); await k.dispatchEvent('pointerup'); await kl.waitForTimeout(40); };
    const cil = async () => { for (const x of await kl.$$('.klavesa.cil')) { await x.dispatchEvent('pointerdown'); await x.dispatchEvent('pointerup'); } await kl.waitForTimeout(80); };
    await stisk(67); await cil();                 // E4, left hand in treble clef: wrong G4
    await stisk(53); await cil();                 // D3, right hand now in bass clef: wrong F3
    await stisk(53); await stisk(61); await cil(); // F#3 in D major: wrong F3 (natural) and C#4 (in the key)
    for (let i = 0; i < 40 && !(await kl.locator('#vysledek').isVisible()); i++) await kl.waitForTimeout(100);
    await kl.waitForTimeout(400);
    const kruh = await kl.evaluate(() => {
      const k = document.querySelector('#pas .ovl.vedle .kruh');
      const c = k && getComputedStyle(k);
      return { pocet: document.querySelectorAll('#pas g.note.vedle').length, display: c?.display, fill: c?.fill, stroke: c?.stroke, dash: c?.strokeDasharray };
    });
    kontrola('letters off: an orange note keeps a dark dashed ring', kruh.pocet === 3 && kruh.display !== 'none' && kruh.fill === 'none'
      && kruh.stroke === 'rgb(31, 37, 51)' && kruh.dash && kruh.dash !== 'none', JSON.stringify(kruh));
    await kl.locator('#vysChyby').click();
    await kl.waitForTimeout(500);
    kontrola('review with several mistakes: focus on Next', await aktivni(kl) === 'chybaDalsi', await aktivni(kl));
    const polohy = await polohyDuchu(kl);
    const cekane = [[[67, 2, '']], [[53, 2, '']], [[53, 0, '♮'], [61, 4, '']]];
    kontrola('ghosts measured from their note: treble-clef left hand, clef change, key change', JSON.stringify(polohy) === JSON.stringify(cekane), JSON.stringify(polohy));
    const zaKlicemK = await duchyZaKlicem(kl);
    kontrola('ghosts clear of the clef, key and time signature (start of the line, key change)', volneOdKlice(zaKlicemK), JSON.stringify(zaKlicemK));
    await snimek(kl, 'chyby-bez-pismen');
    await kl.locator('#chybaDalsi').click();
    await kl.locator('#chybaDalsi').click();
    await kl.waitForTimeout(400);                       // the highlight fades in
    await snimek(kl, 'chyby-tonina');
  });
  kontrola('no page errors (Original level ghosts)', kl.chyby.length === 0, kl.chyby.join(' | '));
  await kl.close();

  // ---------------------------------------------------------------- Mistakes in the score: With backing and In rhythm
  const pk = await stranka(DATA());
  await zkus('With backing: a wrong key belongs to the awaited note', async () => {
    await pk.locator('#kdo .dlazdice-hrace', { hasText: 'Ela' }).click();
    await pk.waitForTimeout(600);
    await pk.locator('#pisne .dl', { hasText: 'Happy Birthday' }).click();
    await pk.waitForSelector('#predNoty svg', { timeout: 15000 });
    await pk.locator('#predKroky [data-krok="pockej"]').click();
    await pk.locator('#predRychlost [data-rychlost]').last().click();
    await pk.locator('#predHrat').click();
    await pk.waitForSelector('#pas svg', { timeout: 15000 });
    for (let i = 0; i < 300 && !/Čekám/.test(await pk.locator('#hlaska').textContent()); i++) await pk.waitForTimeout(50);
    const zmackni = async x => { await x.dispatchEvent('pointerdown'); await x.dispatchEvent('pointerup'); };
    for (const x of await pk.$$('.klavesa.cil')) await zmackni(x);     // the first note, on time
    await pk.waitForTimeout(40);
    await zmackni(await pk.$('.klavesa'));                              // a wrong key right after it, while the clock is still near it
    await pk.waitForTimeout(40);
    for (const x of await pk.$$('.klavesa.cil')) await zmackni(x);     // then the awaited second note
    await pk.waitForTimeout(100);
    const stavy = await pk.evaluate(() => [...document.querySelectorAll('#pas g.note:not(.cizi)')].slice(0, 2)
      .map(g => ({ id: g.id, ok: g.classList.contains('ok'), vedle: g.classList.contains('vedle') })));
    kontrola('With backing: a wrong key before an awaited note makes that note orange, the one played stays green',
      stavy[0]?.ok && stavy[1]?.vedle && (await pk.locator('#pas g.note.vedle').count()) === 1, JSON.stringify(stavy));
    for (let i = 0; i < 900 && !(await pk.locator('#vysledek').isVisible()); i++) {
      const c = await pk.$$('.klavesa.cil');
      for (const x of c) await zmackni(x);
      await pk.waitForTimeout(c.length ? 40 : 80);
    }
    await pk.waitForTimeout(600);
    await pk.locator('#vysChyby').click();
    await pk.waitForTimeout(500);
    const duchP = await pk.evaluate(([a, b]) => {
      const g = document.querySelector('#pas g.duchove'), r = g?.getBoundingClientRect();
      const st = id => { const x = document.getElementById(id).getBoundingClientRect(); return x.left + x.width / 2; };
      const sx = r ? r.left + r.width / 2 : null;
      return { nota: g?.dataset.nota, uDruhe: r ? Math.abs(sx - st(b)) < Math.abs(sx - st(a)) : false };
    }, [stavy[0]?.id, stavy[1]?.id]);
    kontrola('With backing: the ghost sits at the awaited note', duchP.nota === stavy[1]?.id && duchP.uDruhe, JSON.stringify(duchP));
  });
  kontrola('no page errors (With backing)', pk.chyby.length === 0, pk.chyby.join(' | '));
  await pk.close();
  const rt = await stranka(DATA());
  await zkus('In rhythm: green and red only', async () => {
    await rt.locator('#kdo .dlazdice-hrace', { hasText: 'Ela' }).click();
    await rt.waitForTimeout(600);
    await rt.locator('#pisne .dl', { hasText: 'Happy Birthday' }).click();
    await rt.waitForSelector('#predNoty svg', { timeout: 15000 });
    await rt.locator('#predKroky [data-krok="tempo"]').click();
    await rt.locator('#predRychlost [data-rychlost]').last().click();
    await rt.locator('#predHrat').click();
    await rt.waitForSelector('#pas svg', { timeout: 15000 });
    const zmackni = async x => { await x.dispatchEvent('pointerdown'); await x.dispatchEvent('pointerup'); };
    for (let i = 0; i < 200 && !(await rt.$('.klavesa.cil')); i++) await rt.waitForTimeout(50);
    let spatne = false;
    for (let i = 0; i < 120; i++) {
      if (!spatne && (await rt.locator('#pas g.note.ok, #pas g.note.minul').count())) { await zmackni(await rt.$('.klavesa')); spatne = true; }
      for (const x of await rt.$$('.klavesa.cil')) await zmackni(x);
      await rt.waitForTimeout(50);
    }
    const barvy = await rt.evaluate(() => ({ ok: document.querySelectorAll('#pas g.note.ok').length,
      minul: document.querySelectorAll('#pas g.note.minul').length, vedle: document.querySelectorAll('#pas g.note.vedle').length }));
    kontrola('In rhythm: after a wrong key notes stay green or red, never orange', spatne && barvy.vedle === 0 && barvy.ok + barvy.minul > 1, JSON.stringify(barvy));
    await rt.locator('#pauza').click();
    await rt.locator('#pauzaKonec').click();
  });
  kontrola('no page errors (In rhythm)', rt.chyby.length === 0, rt.chyby.join(' | '));
  await rt.close();

  // ---------------------------------------------------------------- Task 9: the menu windows (Players, Songs, Data, Settings)
  const r = await stranka(DATA());
  await zkus('Menu windows', async () => {
    const dialog = sel => r.evaluate(s => { const o = document.querySelector(s);
      return !!o && o.getAttribute('role') === 'dialog' && !!document.getElementById(o.getAttribute('aria-labelledby')) && o.contains(document.activeElement); }, sel);
    kontrola('the menu says Statistiky (not Players)', (await r.locator('#kdo .menu-players').textContent()) === 'Statistiky');
    await menu(r, 'kdo', 'players');
    const hraciStat = await r.locator('#statHraci button').allInnerTexts();
    kontrola('Statistics: a labelled dialog with a switch of the players, the first chosen', await viditelna(r, '#hraciOkno') && await dialog('#hraciOkno')
      && hraciStat.map(x => x.trim()).join() === 'Ela,Fík,Jan' && (await r.locator('#statHraci [aria-pressed="true"]').textContent()).includes('Ela'), hraciStat.join());
    kontrola('Statistics: four parts – practice, improving, songs, where it gets stuck', (await bloky(r, '#hraciOkno')).join('|') === 'Cvičení|Zlepšování|Písničky|Kde to drhne',
      (await bloky(r, '#hraciOkno')).join('|'));
    kontrola('a player who has not played: a calendar of 12 weeks and sentences instead of empty charts', (await r.locator('#statKalendar .c').count()) === 84
      && await viditelna(r, '#statGraf .prazdne') && await viditelna(r, '#statPisne .prazdne') && await viditelna(r, '#statMista .prazdne'));
    kontrola('no player management in Statistics', (await r.locator('#hraciOkno [data-smazat], #hraciOkno [data-upravit], #hraciPridat').count()) === 0);
    await r.locator('#statHraci button', { hasText: 'Fík' }).click();
    const fikPisne = await r.locator('#statPisne').innerText();
    kontrola('Fík: this week 1 day, 1 play; Frère Jacques with the next step', /1 den, 1 zahrání/.test(await r.locator('#statTyden').innerText())
      && /Frère Jacques/.test(fikPisne) && /S doprovodem/.test(fikPisne), `${await r.locator('#statTyden').innerText()} | ${fikPisne}`);
    kontrola('the calendar shows the day Fík played', (await r.locator('#statKalendar .c[data-n="1"]').count()) === 1);
    kontrola('Statistics fit the screen width', await r.evaluate(() => {
      const k = document.querySelector('#hraciOkno .karta').getBoundingClientRect();
      return ![...document.querySelectorAll('#hraciOkno .karta *')].some(e => e.getClientRects().length && e.getBoundingClientRect().right > k.right + 1);
    }));
    await snimek(r, 'statistiky');
    await r.keyboard.press('Escape');
    kontrola('Escape closes Statistics', !(await viditelna(r, '#hraciOkno')));
    await menu(r, 'kdo', 'songs');
    kontrola('Songs: add from a file, paste notes, where to get sheet music, make up a song', await dialog('#pisnickyOkno')
      && await viditelna(r, '#pisnickyOkno label.tlacitko') && await viditelna(r, '#pisnickyVlozit') && await viditelna(r, '#zdroje') && await viditelna(r, '#pisnickyVymysli'));
    await snimek(r, 'pisnicky');
    const pb = await bloky(r, '#pisnickyOkno');
    kontrola('My songs: the menu item and the title say My songs; Add a song, then the list, each option a button with a line on what it does',
      pb.join('|') === 'Přidat písničku|Moje písničky' && (await r.locator('#pisnickyNadpis').textContent()) === 'Moje písničky'
      && (await r.locator('#kdo .horni-menu .menu-songs').textContent()) === 'Moje písničky'
      && await radek(r, '#pisnickySoubor') && await radek(r, '#pisnickyVlozit') && await radek(r, '#zdroje') && await radek(r, '#pisnickyVymysli'), pb.join('|'));
    await r.locator('#pisnickyVlozit').click();
    kontrola('Songs → Paste notes opens the paste dialog above', await viditelna(r, '#vlozitOkno'));
    await r.keyboard.press('Escape'); await r.keyboard.press('Escape');
    await menu(r, 'kdo', 'settings');
    const soustavy = await r.locator('#volbaSoustavy option').allInnerTexts();
    kontrola('three note-name systems named by how they look', soustavy.join('|') === 'C D E F G A H (Cis, Es, B)|C D E F G A B (C#, Eb, Bb)|Do Re Mi Fa Sol La Si (Do#, Sib)', soustavy.join('|'));
    kontrola('Settings: language, note names, the piano', await dialog('#nastaveniOkno') && await viditelna(r, '#volbaJazyka') && await viditelna(r, '#volbaSoustavy')
      && /Bluetooth/.test(await r.locator('#nastaveniPiano').textContent()));
    kontrola('Settings also hold data and backups: where data are kept', await viditelna(r, '#nastaveniOkno #uloziste #ulozisteText')
      && (await r.locator('#nastaveniOkno').textContent()).includes('Data a zálohy'));
    kontrola('data in the browser: Download a backup and Save to folder', await viditelna(r, '#ulozisteZaloha') && await viditelna(r, '#ulozisteSlozka'));
    kontrola('Settings on Who is playing: no Display (no player chosen), the piano offers the three ways to play',
      !(await viditelna(r, '#nastaveniZobrazeni')) && (await r.locator('#nastaveniOkno [role="radio"][data-vstup]').count()) === 3
      && await viditelna(r, '#nastaveniDoprovod'));
    const nb = await bloky(r, '#nastaveniOkno');
    kontrola('Settings: three blocks; Download a backup is a button with a line, hidden options take no row', nb.join('|') === 'Jazyk a názvy tónů|Klavír|Data a zálohy'
      && await radek(r, '#ulozisteZaloha') && !(await r.locator('#nastaveniOkno .okno-krok').evaluateAll(el => el.some(e => e.getClientRects().length && e.querySelector('.skryta')))), nb.join('|'));
    kontrola('no word about a desktop app anywhere in the page', !/desktop/i.test(await r.evaluate(() => document.body.textContent)));
    await snimek(r, 'nastaveni');
    await r.keyboard.press('Escape');
    kontrola('Who is playing: tiles without Edit and Delete until Edit players', (await r.locator('#kdo [data-smazat]').count()) === 0 && await viditelna(r, '#kdoUpravit'));
    await r.locator('#kdoUpravit').click();
    kontrola('Edit players: each tile gets Edit and Delete', (await r.locator('#kdo [data-upravit]').count()) === 3 && (await r.locator('#kdo [data-smazat]').count()) === 3
      && (await r.locator('#kdoUpravit').getAttribute('aria-pressed')) === 'true');
    await r.locator('#kdo [data-smazat="j"]').click();
    kontrola('confirmation with the name', await viditelna(r, '#potvrzeni') && (await r.locator('#potvrzeniText').textContent()).includes('Jan'));
    await r.locator('#potvrzeniNe').click();
    kontrola('Cancel deletes nothing', (await ulozeno(r, 'profily')).some(x => x.id === 'j' && !x.smazano));
    await r.locator('#kdo [data-smazat="f"]').click();
    await r.locator('#potvrzeniAno').click();
    await r.waitForTimeout(500);
    const pr = await ulozeno(r, 'profily'), zal = await ulozeno(r, 'zaloha_pred_smazanim'), vys = await ulozeno(r, 'vysledky');
    kontrola('deleted player becomes a deletion record', pr.some(x => x.id === 'f' && x.smazano) && !pr.find(x => x.id === 'f').jmeno);
    kontrola('backup of their data before deletion', zal?.at(-1)?.profil?.jmeno === 'Fík' && !!zal.at(-1).vysledky?.['Frère Jacques.musicxml']);
    kontrola('their results are gone', !vys?.f);
    kontrola('Who is playing without the deleted player', !(await r.locator('#kdo').textContent()).includes('Fík'));
    await r.locator('#kdoUpravit').click();
    await r.locator('#kdo .dlazdice-hrace', { hasText: 'Jan' }).click();
    await menu(r, 'domu', 'players');
    kontrola('with a chosen player Statistics open on that player', (await r.locator('#statHraci [aria-pressed="true"]').textContent()).includes('Jan'));
    await r.keyboard.press('Escape');
    await hrac(r, '#zmenitHrace');
    await r.locator('#kdoUpravit').click();
    await r.locator('#kdo [data-smazat="j"]').click();
    await r.locator('#potvrzeniAno').click();
    await r.waitForTimeout(500);
    kontrola('after deleting the selected player, home of the remaining player', await viditelna(r, '#domu') && (await r.locator('#mujProfilOtevrit').textContent()).includes('Ela')
      && !(await viditelna(r, '#hraciOkno')));
    await r.goto(`http://127.0.0.1:${PORT}/#settings`);
    await r.waitForTimeout(1500);
    kontrola('#settings in the address opens Settings', await viditelna(r, '#nastaveniOkno'));
  });
  kontrola('no page errors (Task 9)', r.chyby.length === 0, r.chyby.join(' | '));
  await r.close();

  // ---------------------------------------------------------------- narrow screens: AI + Menu
  await zkus('Narrow screens', async () => {
    const ven = pg => pg.evaluate(() => [...document.querySelectorAll('.horni-menu')].filter(n => n.getClientRects().length)
      .some(n => [...n.children].some(c => { const r = c.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); })));
    const sirka = await stranka(DATA(), 1280, 860);
    kontrola('1280 px: the full menu, nothing collapsed', (await sirka.locator('#kdo .horni-menu.sbalene').count()) === 0 && await viditelna(sirka, '#kdo .menu-settings')
      && !(await viditelna(sirka, '#kdo .menu-vse')));
    await sirka.close();
    const tel = await stranka(DATA(), 390, 844);
    kontrola('390 px: the language, AI and Menu, nothing outside the screen', await viditelna(tel, '#kdo .jazyk-volba') && await viditelna(tel, '#kdo .menu-ai') && await viditelna(tel, '#kdo .menu-vse')
      && !(await viditelna(tel, '#kdo .menu-songs')) && !(await viditelna(tel, '#kdo .menu-settings')) && !(await ven(tel)));
    await tel.locator('#kdo .menu-vse').click();
    const polozky = await tel.locator('#menuOkno button[class*="menu-"]').evaluateAll(el => el.filter(e => e.getClientRects().length).map(e => e.className));
    kontrola('Menu lists Songs, Players, Settings, About (44 px rows)', await viditelna(tel, '#menuOkno')
      && ['songs', 'players', 'settings', 'about'].every(k => polozky.some(c => c.includes('menu-' + k))) && !polozky.some(c => c.includes('menu-data'))
      && await tel.evaluate(() => [...document.querySelectorAll('#menuOkno .polozka')].every(b => b.getBoundingClientRect().height >= 44)), polozky.join(' | '));
    await tel.locator('#menuOkno .menu-settings').click();
    kontrola('a Menu item opens its window and closes the Menu', await viditelna(tel, '#nastaveniOkno') && !(await viditelna(tel, '#menuOkno')));
    await tel.keyboard.press('Escape');
    await tel.locator('#kdo .dlazdice-hrace', { hasText: 'Fík' }).click();
    await tel.waitForTimeout(500);
    kontrola('390 px Home: AI and Menu, nothing outside the screen', await viditelna(tel, '#domu .menu-vse') && !(await ven(tel)));
    kontrola('no page errors (390 px)', tel.chyby.length === 0, tel.chyby.join(' | '));
    await tel.close();
    const tab = await stranka(DATA(), 900, 700);
    await tab.locator('#kdo .dlazdice-hrace', { hasText: 'Fík' }).click();
    await tab.waitForTimeout(500);
    kontrola('900 px Home with the long piano status: nothing outside the screen', !(await ven(tab)));
    await tab.close();
  });

  // ---------------------------------------------------------------- Players → Edit doesn't switch who is playing
  const u = await stranka(DATA());
  await zkus('Edit a player from Who is playing', async () => {
    await u.locator('#kdoUpravit').click();
    await u.locator('#kdo [data-upravit="e"]').click();
    kontrola('Edit opens the profile of that player', await viditelna(u, '#novy') && (await u.locator('#novyJmeno').inputValue()) === 'Ela');
    await u.locator('#novyJmeno').fill('Ela2');
    await u.locator('#novyHotovo').click();
    await u.waitForTimeout(400);
    kontrola('Done: back on Who is playing (still editing) with the new name, nobody chosen to play', await viditelna(u, '#kdo')
      && (await u.locator('#kdo').textContent()).includes('Ela2') && (await u.locator('#kdo [data-upravit]').count()) === 3);
    kontrola('the new name is saved', (await ulozeno(u, 'profily')).some(x => x.id === 'e' && x.jmeno === 'Ela2'));
    await u.locator('#kdo [data-upravit="j"]').click();
    await u.locator('#novyZpet').click();
    await u.waitForTimeout(300);
    kontrola('Back returns to Who is playing', await viditelna(u, '#kdo') && !(await viditelna(u, '#novy')));
    await u.locator('#kdoUpravit').click();
    kontrola('Done editing: the tiles choose a player again', (await u.locator('#kdo [data-upravit]').count()) === 0);
    await u.locator('#kdo .dlazdice-hrace', { hasText: 'Fík' }).click();
    await u.waitForTimeout(500);
    kontrola('a tile then opens that player\'s home', await viditelna(u, '#domu') && (await u.locator('#mujProfilOtevrit').textContent()).includes('Fík'));
    await hrac(u, '#zmenitHrace');
    await u.locator('#kdoUpravit').click();
    await u.locator('#kdoNovy').click();
    await u.locator('#novyJmeno').fill('Zed');
    await u.locator('#novyHotovo').click();
    await u.waitForTimeout(400);
    await hrac(u, '#zmenitHrace');
    kontrola('leaving Who is playing ends Edit players (a child\'s tile chooses them again)', (await u.locator('#kdo [data-upravit]').count()) === 0
      && (await u.locator('#kdoUpravit').getAttribute('aria-pressed')) === 'false');
  });
  kontrola('no page errors (Edit a player)', u.chyby.length === 0, u.chyby.join(' | '));
  await u.close();

  // ---------------------------------------------------------------- My songs (Songs window): the web, first visit (no player)
  const m = await stranka(DATA(), undefined, undefined, 'cs', false);
  await zkus('My songs', async () => {
    const urovne = () => m.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('kt-pisen-')).map(k => k + localStorage.getItem(k)).sort().join());
    const pred = await urovne();
    kontrola('the old selected-song actions are gone', (await m.locator('#rodicePisen, #upravit, #smazatPisen, #pomocnikJednodussi').count()) === 0);
    await menu(m, 'novy', 'songs');
    await m.waitForTimeout(300);
    kontrola('My songs without own songs: no samples, no search, a line on where added songs appear', (await m.locator('#spravaNadpis').textContent()) === 'Moje písničky'
      && (await m.locator('#spravaSeznam [data-soubor]').count()) === 0 && /Písničky, které přidáte, najdete tady/.test(await m.locator('#spravaSeznam').innerText())
      && !(await viditelna(m, '#spravaHledat')) && !/ukázk/i.test(await m.locator('#pisnickyOkno').innerText()), await m.locator('#spravaSeznam').innerText());
    await m.keyboard.press('Escape');
    await ulozPisne(m, { 'Tichá noc.musicxml': pisen('Silent Night.musicxml'), 'Óda.musicxml': pisen('Ode to Joy.musicxml') });
    await m.reload();
    await m.waitForTimeout(1500);
    await menu(m, 'novy', 'songs');
    await m.locator('#spravaHledat').fill('silent');
    await m.waitForTimeout(200);
    const polozky = await m.locator('#spravaSeznam [data-soubor]').allInnerTexts();
    kontrola('My songs: search finds Silent Night only', polozky.length === 1 && /Silent Night/.test(polozky[0]), polozky.join(' | '));
    await m.locator('#spravaSeznam [data-soubor="Tichá noc.musicxml"]').click();
    await m.waitForTimeout(300);
    kontrola('choosing a title shows its actions (Delete)', await viditelna(m, '#spravaAkce') && (await m.locator('#spravaNazev').textContent()) === 'Silent Night'
      && await viditelna(m, '#spravaUpravit') && await viditelna(m, '#spravaJednodussi') && /Smazat/.test(await m.locator('#spravaSmazat').textContent()));
    kontrola('the song actions are buttons with a line each', await radek(m, '#spravaUpravit') && await radek(m, '#spravaJednodussi') && await radek(m, '#spravaSmazat'));
    const kopie = await m.evaluate(async () => {
      let text = ''; navigator.clipboard.writeText = async x => { text = x; };
      document.querySelector('#spravaJednodussi').click(); await new Promise(r => setTimeout(r, 400)); return text;
    });
    kontrola('easier version copies that song', /title: Silent Night/.test(kopie), kopie.slice(0, 80));
    await m.locator('#spravaUpravit').click();
    await m.waitForTimeout(800);
    kontrola('Edit notes opens the editor for that song', await viditelna(m, '.editor') && /Silent Night/.test(await m.locator('.editor .editor-nazev').inputValue())
      && !(await viditelna(m, '#pisnickyOkno')));
    await m.locator('.editor [data-akce="zavrit"]').click();
    await m.waitForTimeout(300);
    kontrola('closing the editor returns to Songs on the same title', await viditelna(m, '#pisnickyOkno') && (await m.locator('#spravaNazev').textContent()) === 'Silent Night');
    await m.locator('#spravaSmazat').click();
    kontrola('the confirmation is an alert dialog with focus inside', await m.evaluate(() => {
      const o = document.querySelector('#potvrzeni'); return o.getAttribute('role') === 'alertdialog' && o.contains(document.activeElement); }));
    await m.keyboard.press('Escape');
    await m.waitForTimeout(300);
    kontrola('Escape cancels the confirmation only: Songs stays, the song stays', !(await viditelna(m, '#potvrzeni')) && await viditelna(m, '#pisnickyOkno')
      && (await m.locator('#spravaNazev').textContent()) === 'Silent Night');
    await m.locator('#spravaSmazat').click();
    kontrola('Delete asks with the title', await viditelna(m, '#potvrzeni') && (await m.locator('#potvrzeniText').textContent()).includes('Silent Night'));
    await m.locator('#potvrzeniAno').click();
    await m.waitForTimeout(600);
    await m.locator('#spravaHledat').fill('');
    await m.waitForTimeout(300);
    const zbyle = await m.locator('#spravaSeznam [data-soubor]').evaluateAll(el => el.map(e => e.dataset.soubor));
    kontrola('after deleting: Songs stays open, the song is gone from the list', await viditelna(m, '#pisnickyOkno') && !zbyle.includes('Tichá noc.musicxml') && zbyle.length > 0,
      zbyle.join(' | ').slice(0, 120));
    kontrola('managing songs changes no player\'s song settings', (await urovne()) === pred);
    await m.locator('#spravaHledat').fill('ode');
    await m.keyboard.press('Escape');
    await menu(m, 'novy', 'songs');
    kontrola('reopening Songs starts with an empty search and no chosen song', (await m.locator('#spravaHledat').inputValue()) === '' && !(await viditelna(m, '#spravaAkce')));
    await m.keyboard.press('Escape');
    await m.evaluate(() => { location.hash = '#songs'; });
    await m.waitForTimeout(300);
    await m.goBack();
    await m.waitForTimeout(400);
    kontrola('the browser Back button closes a window opened from its address', !(await viditelna(m, '#pisnickyOkno')));
    await menu(m, 'novy', 'settings');
    kontrola('on the web Settings offer backup, restore and the folder', await viditelna(m, '#ulozisteZaloha') && await viditelna(m, '#ulozisteSlozka'));
    kontrola('on the web backup, restore and the folder are buttons with a line each', await radek(m, '#ulozisteZaloha') && await radek(m, '#ulozisteObnovit')
      && await radek(m, '#ulozisteSlozka') && !(await viditelna(m, '#ulozisteOtevrit')));
    kontrola('no word about a desktop app on the web', !/desktop/i.test(await m.evaluate(() => document.body.textContent)));
    await m.keyboard.press('Escape');
  });
  kontrola('no page errors (My songs)', m.chyby.length === 0, m.chyby.join(' | '));
  await m.close();

  // ---------------------------------------------------------------- English
  // the helper works by copy and paste
  const w = await stranka(DATA(), undefined, undefined, 'cs', false);
  await zkus('assistant on the web', async () => {
    await w.evaluate(() => [...document.querySelectorAll('.menu-ai')].find(b => b.getClientRects().length)?.click());
    await w.waitForTimeout(300);
    kontrola('AI tools on the web: copy and paste, no folder or Claude Desktop needed', await viditelna(w, '#pomocnikPokyny') && await viditelna(w, '#pomocnikVlozit')
      && (await w.locator('#pomocnikClaude, #pomocnikPozor, #pomocnikKod').count()) === 0);
    await snimek(w, 'pomocnik-web');
    await w.keyboard.press('Escape');
  });
  await zkus('reduced motion', async () => {
    await w.emulateMedia({ reducedMotion: 'reduce' });
    await w.evaluate(() => { window.__mrkl = false; new MutationObserver(z => { if (z.some(x => x.target.dataset?.vyraz === 'blink')) window.__mrkl = true; })
      .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-vyraz'] }); });
    await w.waitForTimeout(11000);
    kontrola('with reduced motion animals do not blink on their own', (await w.locator('.zvire').count()) > 0 && !(await w.evaluate(() => window.__mrkl)));
    const t = await w.locator('.zvire').evaluateAll(el => el.map(e => e.style.transform).filter(Boolean));
    kontrola('with reduced motion animals stay still', t.length === 0, t.join(' | ').slice(0, 120));
  });
  kontrola('no page errors (web)', w.chyby.length === 0, w.chyby.join(' | '));

  // ---------------------------------------------------------------- Library songs on the home screen (web)
  // Ela played Skákal pes and Pásla ovečky from the library, Fík only Pásla ovečky; one own song in the browser
  const SKAKAL = 'library/children/skakal-pes.musicxml', PASLA = 'library/folk/pasla-ovecky.musicxml';
  const hrano = kdy => ({ verze: 1, pokusu: 1, posledni: kdy, takty: {}, historie: [{ kdy, rezim: 'cekam', krok: 'cekam', rychlost: 60, presnost: 0.6 }] });
  const KNIHOVNA_DATA = {
    profily: PROFILY, profil: 'e',
    vysledky: { e: { [SKAKAL]: { cekam: { hvezdy: 1, procent: 60, pocet: 1 } } } },
    statistiky: { e: { [SKAKAL + '#2']: hrano(ted - DEN), [PASLA + '#2']: hrano(ted - 2 * DEN) }, f: { [PASLA + '#2']: hrano(ted - DEN) } },
  };
  const MOJE = { 'Moje.musicxml': pisen('Ode to Joy.musicxml').replace('<work-title>Ode to Joy</work-title>', '<work-title>Moje písnička</work-title>') };
  const dlazdice = (p, nazev) => p.locator('#pisne .dl', { hasText: nazev });
  const vyberHrace = async (p, jmeno) => {
    if (!(await viditelna(p, '#kdo'))) await hrac(p, '#zmenitHrace');
    await p.locator('#kdo .dlazdice-hrace', { hasText: jmeno }).click();
    await dlazdice(p, 'Moje písnička').waitFor({ timeout: 10000 });
    await p.waitForTimeout(300);
  };
  const zalozka = (p, id) => p.locator(`#zalozky [data-zalozka="${id}"]`).click();
  const k = await stranka(DATA(), undefined, undefined, 'cs', false);
  await zkus('library songs at home', async () => {
    await doProhlizece(k, KNIHOVNA_DATA, MOJE);
    await vyberHrace(k, 'Ela');
    kontrola('For me: the library songs Ela played (with the author from the index)', (await dlazdice(k, 'Skákal pes').count()) === 1
      && (await dlazdice(k, 'Pásla ovečky').count()) === 1 && (await dlazdice(k, 'Skákal pes').locator('small').first().textContent()) === 'traditional');
    const navrhy = await k.locator('#pisne .dl[data-soubor^="library/"]').evaluateAll(el => el.map(e => e.dataset.soubor));
    kontrola('For me also suggests a few library songs she has not played (up to 4)', navrhy.length >= 3 && navrhy.length <= 6, navrhy.join());
    const zal = await k.locator('#zalozky button:visible').allInnerTexts();
    kontrola('tabs: For me, Favourites, the four shelves and Mine (there is an own song)',
      zal.join() === 'Pro mě,Oblíbené,Dětské,Lidové ze světa,Vánoční,Klasika,Moje', zal.join());
    await snimek(k, 'domu-knihovna');
    await zalozka(k, 'moje');
    kontrola('Mine: only the own song', (await k.locator('#pisne .dl[data-soubor]').allInnerTexts()).length === 1 && (await dlazdice(k, 'Moje písnička').count()) === 1);
    await zalozka(k, 'pro-me');
    await vyberHrace(k, 'Fík');
    kontrola('Fík: the library song he played is in his For me', (await dlazdice(k, 'Pásla ovečky').count()) === 1);
    await vyberHrace(k, 'Ela');
    await dlazdice(k, 'Pásla ovečky').locator('.oblibena').click();
    await k.waitForTimeout(300);
    kontrola('star on a library song stores it in Ela\'s favourites', ((await zProhlizece(k, 'oblibene'))?.e || []).includes(PASLA));
    await dlazdice(k, 'Pásla ovečky').click();
    await k.waitForSelector('#predNoty svg', { timeout: 15000 });
    kontrola('a library song opens on Before playing, with no Remove from home', (await k.locator('#predNazev').textContent()) === 'Pásla ovečky'
      && (await k.locator('#predOdebrat').count()) === 0);
    await k.locator('#predZpet').click();
    kontrola('Before playing goes back home', await viditelna(k, '#domu'));
    kontrola('no More songs screen or button any more', (await k.locator('#knihovna, #domuKnihovna, #pisnickyKnihovna').count()) === 0);
    await zalozka(k, 'children');
    await dlazdice(k, 'Twinkle, Twinkle').waitFor({ timeout: 5000 }).catch(() => {});
    const ukazka = dlazdice(k, 'Twinkle, Twinkle');
    kontrola('a sample is a library song on its shelf (Children), with its difficulty and composer', (await ukazka.count()) === 1
      && (await ukazka.getAttribute('data-stupen')) === '1' && /traditional/.test(await ukazka.locator('small').first().textContent()));
    await zalozka(k, 'pro-me');
    await menu(k, 'domu', 'songs');
    await k.locator('#spravaSeznam .sprava-polozka').first().waitFor({ timeout: 5000 });
    const sprava = await k.locator('#spravaSeznam').innerText();
    kontrola('My songs lists only own songs: no library songs, no samples', sprava.includes('Moje písnička') && !sprava.includes('Pásla ovečky') && !sprava.includes('Skákal pes')
      && !sprava.includes('Twinkle'), sprava);
    await k.keyboard.press('Escape');
  });
  kontrola('no page errors (library at home)', k.chyby.length === 0, k.chyby.join(' | '));
  await k.close();
  // the library index cannot be loaded (offline, 404): home still lists own songs and samples, shelves hold the samples
  const bez = await stranka(DATA(), undefined, undefined, 'cs', false, undefined, p => p.route('**/library/index.json', r => r.fulfill({ status: 404, body: 'not found' })));
  await zkus('library index missing', async () => {
    await doProhlizece(bez, KNIHOVNA_DATA, MOJE);
    await vyberHrace(bez, 'Ela');
    kontrola('without the library index: own songs and samples on home, no library songs', (await dlazdice(bez, 'Moje písnička').count()) === 1
      && (await dlazdice(bez, 'Frère Jacques').count()) === 1 && (await bez.locator('#pisne .dl[data-soubor^="library/"]').count()) === 0);
    await zalozka(bez, 'children');
    kontrola('without the library index: the Children\'s shelf holds the sample songs', (await dlazdice(bez, 'Frère Jacques').count()) === 1
      && (await bez.locator('#pisne .dl[data-soubor^="library/"]').count()) === 0);
  });
  kontrola('no page errors (library index missing)', bez.chyby.length === 0, bez.chyby.join(' | '));
  await bez.close();

  // ---------------------------------------------------------------- Suggestions from the library (web)
  // Ela masters all the sample songs on her home (3 stars in every step, a clean run at 100 %): Keep going and the result's main
  // button offer a library song at her level instead of repeating a known one
  const UMI = { cekam: { hvezdy: 3, procent: 100, pocet: 2 }, pockej: { hvezdy: 3, procent: 100, pocet: 2 }, tempo: { hvezdy: 3, procent: 100, pocet: 2 } };
  const VZORKY = JSON.parse(readFileSync(new URL('songs/index.json', koren), 'utf8')).map(p => p.soubor);   // every sample song of the web home
  const cisty = f => [f + '#2', { verze: 1, pokusu: 3, posledni: ted - DEN, takty: {}, vzorce: {},
    historie: [{ kdy: ted - DEN, rezim: 'tempo', krok: 'tempo', rychlost: 100, presnost: 1, cisty: true }] }];
  const ZNA = { profily: PROFILY, profil: 'e',
    vysledky: { e: Object.fromEntries(VZORKY.map(f => [f, UMI])) },
    statistiky: { e: Object.fromEntries(VZORKY.map(cisty)) } };
  const KNIHOVNA_INDEX = JSON.parse(readFileSync(new URL('build/library/index.json', koren), 'utf8'));
  const NAZVY_KNIHOVNY = KNIHOVNA_INDEX.map(p => p.nazev);
  // plays the song to the result screen in Find the notes at 60 %
  const dohrajPisen = async (p, nazev) => {
    await dlazdice(p, nazev).click();
    await p.waitForSelector('#predNoty svg', { timeout: 15000 });
    await p.locator('#predKroky [data-krok="cekam"]').click();
    await p.locator('#predRychlost [data-rychlost="60"]').click();   // a mastered song is offered at 100 %: play it slowly
    await p.locator('#predHrat').click();
    await p.waitForSelector('#pas svg', { timeout: 15000 });
    await p.waitForTimeout(500);
    for (let i = 0; i < 400 && !(await p.locator('#vysledek').isVisible()); i++) {
      const c = await p.$$('.klavesa.cil');
      if (!c.length) { await p.waitForTimeout(80); continue; }
      for (const x of c) { await x.dispatchEvent('pointerdown'); await x.dispatchEvent('pointerup'); }
      await p.waitForTimeout(30);
    }
    await p.waitForTimeout(600);
  };
  const nv = await stranka(DATA(), undefined, undefined, 'cs', false);
  await zkus('Suggestions from the library', async () => {
    await doProhlizece(nv, ZNA);
    await nv.locator('#kdo .dlazdice-hrace', { hasText: 'Ela' }).click();
    await dlazdice(nv, 'Happy Birthday').waitFor({ timeout: 10000 });
    await nv.waitForTimeout(800);
    const pokr = (await nv.locator('#pokracujNazev').textContent()).trim();
    const vKnihovne = KNIHOVNA_INDEX.find(p => p.nazev === pokr);
    kontrola('Keep going names a library song when the player knows all home songs', await viditelna(nv, '#pokracuj') && !!vKnihovne, pokr);
    // the level is the app's own: its shelf dims songs above it
    await zalozka(nv, vKnihovne.police);
    await nv.locator('#pisne .vic-pisni').click().catch(() => {});
    const dl = nv.locator(`#pisne .dl[data-soubor="${vKnihovne.soubor}"]`);
    kontrola('the suggested library song is within the player\'s level (not dimmed on its shelf)', (await dl.count()) === 1
      && !(await dl.evaluate(e => e.classList.contains('tezsi'))) && Number(await dl.getAttribute('data-stupen')) === vKnihovne?.stupen);
    await zalozka(nv, 'pro-me');
    await dlazdice(nv, 'Happy Birthday').waitFor({ timeout: 10000 });
    await dohrajPisen(nv, 'Happy Birthday');
    const hl = (await nv.locator('#vysHlavni').textContent()).trim();
    const nazev = NAZVY_KNIHOVNY.find(n => hl.includes(n));
    kontrola('result main button: next song from the library', !!nazev, hl);
    await nv.locator('#vysHlavni').click();
    await nv.waitForSelector('#predNoty svg', { timeout: 15000 });
    kontrola('the suggestion opens Before playing for that library song', await viditelna(nv, '#pred') && (await nv.locator('#predNazev').textContent()) === nazev,
      await nv.locator('#predNazev').textContent());
  });
  kontrola('no page errors (library suggestions)', nv.chyby.length === 0, nv.chyby.join(' | '));
  await nv.close();

  // a song the player has started stays first, also above the level; only not-yet-started ones are filtered by level
  // (Frère Jacques is difficulty 1 and mastered, so the level is 2; Für Elise is difficulty 3 and was started)
  const ZACATA = { profily: PROFILY, profil: 'e',
    vysledky: { e: { 'Frère Jacques.musicxml': UMI, 'Für Elise (opening).musicxml': { cekam: { hvezdy: 1, procent: 60, pocet: 1 } } } },
    statistiky: { e: { ...Object.fromEntries(['Frère Jacques.musicxml'].map(cisty)), 'Für Elise (opening).musicxml#2': hrano(ted - DEN) } } };
  const nz = await stranka(DATA(), undefined, undefined, 'cs', false);
  await zkus('Started song above the level stays the suggestion', async () => {
    await doProhlizece(nz, ZACATA);
    await nz.locator('#kdo .dlazdice-hrace', { hasText: 'Ela' }).click();
    await dlazdice(nz, 'Frère Jacques').waitFor({ timeout: 10000 });
    await nz.waitForTimeout(800);
    await dohrajPisen(nz, 'Frère Jacques');
    const hl = (await nz.locator('#vysHlavni').textContent()).trim();
    kontrola('result main button: a started song above the level is still offered before unstarted easier ones', hl.includes('Für Elise'), hl);
  });
  kontrola('no page errors (started song above level)', nz.chyby.length === 0, nz.chyby.join(' | '));
  await nz.close();

  // no library (offline, or it did not load): with every home song mastered there is nothing to suggest
  const DOMA = ['Frère Jacques.musicxml', 'Happy Birthday.musicxml', 'Ode to Joy.musicxml', 'Silent Night.musicxml'];
  const dt = DATA();
  dt.data.vysledky = JSON.stringify({ e: Object.fromEntries(DOMA.map(f => [f, UMI])) });
  dt.data.statistiky = JSON.stringify({ e: Object.fromEntries(DOMA.map(cisty)) });
  const nt = await stranka(dt);
  await zkus('No library suggestion without the library', async () => {
    await nt.locator('#kdo .dlazdice-hrace', { hasText: 'Ela' }).click();
    await nt.locator('#pisne .dl', { hasText: 'Happy Birthday' }).waitFor({ timeout: 10000 });
    await nt.waitForTimeout(800);
    const pokr = (await nt.locator('#pokracujNazev').textContent()).trim();
    kontrola('without the library: Keep going does not name a library song', !NAZVY_KNIHOVNY.includes(pokr), pokr);
    await nt.locator('#pisne .dl', { hasText: 'Happy Birthday' }).click();
    await nt.waitForSelector('#predNoty svg', { timeout: 15000 });
    await nt.locator('#predKroky [data-krok="cekam"]').click();
    await nt.locator('#predRychlost [data-rychlost="60"]').click();
    await nt.locator('#predHrat').click();
    await nt.waitForSelector('#pas svg', { timeout: 15000 });
    await nt.waitForTimeout(500);
    for (let i = 0; i < 400 && !(await nt.locator('#vysledek').isVisible()); i++) {
      const c = await nt.$$('.klavesa.cil');
      if (!c.length) { await nt.waitForTimeout(80); continue; }
      for (const x of c) { await x.dispatchEvent('pointerdown'); await x.dispatchEvent('pointerup'); }
      await nt.waitForTimeout(30);
    }
    await nt.waitForTimeout(600);
    const hl = (await nt.locator('#vysHlavni').textContent()).trim();
    kontrola('without the library: result main button is not a library song (Once more)', await viditelna(nt, '#vysledek') && !NAZVY_KNIHOVNY.some(n => hl.includes(n)) && !hl.includes('Další písnička'), hl);
  });
  kontrola('no page errors (suggestions without the library)', nt.chyby.length === 0, nt.chyby.join(' | '));
  await nt.close();

  // ---------------------------------------------------------------- Shelves on Home (web)
  // Ela has no results at all: level 1, so on each shelf difficulty-1 songs come first and harder ones are dimmed
  const INDEX = JSON.parse(readFileSync(new URL('build/library/index.json', koren), 'utf8'));
  const sPrekladem = INDEX.find(p => p.preklad?.cs);
  const bezDiakritiky = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const NOVACEK = { profily: PROFILY, profil: 'e' };
  const UKAZKY_POLICE = { children: 6, folk: 0, christmas: 2, classics: 4 };   // the sample songs on each shelf
  const kn = await stranka(DATA(), 1280, 860, 'cs', false);
  const naPolici = p => p.locator('#pisne .dl[data-soubor]').evaluateAll(el => el.map(d => ({ soubor: d.dataset.soubor,
    nazev: d.querySelector('b').innerText.trim(), stupen: Number(d.dataset.stupen), tezsi: d.classList.contains('tezsi'),
    preklad: d.querySelector('.preklad')?.innerText.trim() || '' })));
  const ukazVse = async p => { if (await viditelna(p, '#pisne .vic-pisni')) await p.locator('#pisne .vic-pisni').click(); };
  await zkus('Shelves on Home', async () => {
    await doProhlizece(kn, NOVACEK, MOJE);
    await vyberHrace(kn, 'Ela');
    await zalozka(kn, 'children');
    const prvni = await naPolici(kn), vse = INDEX.filter(p => p.police === 'children').length + UKAZKY_POLICE.children;
    kontrola('a shelf shows all its songs at once (no Show all)', prvni.length === vse && (await kn.locator('#pisne .vic-pisni').count()) === 0, `${prvni.length} of ${vse}`);
    await snimek(kn, 'domu-police');
    await ukazVse(kn);
    const deti = await naPolici(kn), prvniTezsi = deti.findIndex(d => d.tezsi);
    kontrola('the shelf: level 1 first, exactly the harder ones dimmed after them', deti.length === vse && deti[0].stupen === 1
      && deti.every(d => d.tezsi === d.stupen > 1) && (prvniTezsi < 0 || deti.slice(prvniTezsi).every(d => d.tezsi)),
      JSON.stringify(deti.map(d => d.stupen + (d.tezsi ? 't' : ''))));
    kontrola('library and sample songs side by side on the shelf', deti.some(d => d.soubor.startsWith('library/')) && deti.some(d => d.nazev === 'Frère Jacques'));
    // difficulty filter under the tabs: for the chosen tab (and the search), Vše by default
    const obt = await kn.locator('#obtiznost button').allInnerTexts();
    kontrola('difficulty filter: All, Easy, Medium, Hard; All chosen', obt.join() === 'Vše,Snadné,Střední,Těžší'
      && (await kn.locator('#obtiznost [aria-pressed="true"]').textContent()) === 'Vše', obt.join());
    await kn.locator('#obtiznost [data-obtiznost="2"]').click();
    await ukazVse(kn);
    const stredni = await naPolici(kn);
    kontrola('Medium: only difficulty-2 songs of the shelf', stredni.length > 0 && stredni.every(d => d.stupen === 2), stredni.map(d => d.stupen).join());
    await zalozka(kn, 'christmas');
    kontrola('the filter stays on another tab', (await naPolici(kn)).every(d => d.stupen === 2));
    await kn.locator('#obtiznost [data-obtiznost="1"]').click();
    await zalozka(kn, 'pro-me');
    kontrola('For me with Easy: only easy songs', (await naPolici(kn)).every(d => d.stupen === 1));
    await kn.locator('#obtiznost [data-obtiznost=""]').click();
    await zalozka(kn, 'children');
    await zalozka(kn, sPrekladem.police); await ukazVse(kn);
    const pol = await naPolici(kn);
    kontrola('translation line only for songs in another language', pol.find(d => d.soubor === sPrekladem.soubor)?.preklad === sPrekladem.preklad.cs
      && pol.filter(d => !d.soubor.startsWith('library/')).every(d => !d.preklad), JSON.stringify(pol.map(d => d.preklad)));
    await kn.setViewportSize({ width: 820, height: 1180 });
    await kn.waitForTimeout(200);
    kontrola('shelves at iPad width: no sideways scrolling of the page', await kn.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await kn.setViewportSize({ width: 1280, height: 860 });
    // search covers every song: the Czech translation without diacritics finds a library song
    await kn.fill('#hledat', bezDiakritiky(sPrekladem.preklad.cs));
    await kn.waitForTimeout(200);
    const nalez = await naPolici(kn);
    kontrola('search by the Czech translation without diacritics finds the library song', nalez.some(d => d.soubor === sPrekladem.soubor), nalez.map(d => d.nazev).join());
    await snimek(kn, 'domu-hledani');
    await kn.fill('#hledat', 'xyzzy');
    await kn.waitForTimeout(200);
    kontrola('search with no match says so', (await kn.locator('#pisne').innerText()).includes('Nic tu není.'));
    await kn.fill('#hledat', '');
    await kn.waitForTimeout(200);
    await zalozka(kn, sPrekladem.police); await ukazVse(kn);
    const dl = kn.locator(`#pisne .dl[data-soubor="${sPrekladem.soubor}"]`);
    await dl.locator('.oblibena').click();
    await kn.waitForTimeout(300);
    kontrola('star on a shelf tile stores it in Ela\'s favourites', ((await zProhlizece(kn, 'oblibene'))?.e || []).includes(sPrekladem.soubor));
    await zalozka(kn, 'oblibene');
    kontrola('Favourites show it', (await kn.locator(`#pisne .dl[data-soubor="${sPrekladem.soubor}"]`).count()) === 1);
    await kn.locator(`#pisne .dl[data-soubor="${sPrekladem.soubor}"]`).click();
    await kn.waitForSelector('#predNoty svg', { timeout: 15000 });
    kontrola('the tile opens Before playing for that song', (await kn.locator('#predNazev').textContent()) === sPrekladem.nazev);
    await kn.locator('#predZpet').click();
    kontrola('back home', await viditelna(kn, '#domu'));
  });
  kontrola('no page errors (shelves)', kn.chyby.length === 0, kn.chyby.join(' | '));
  await kn.close();
  // English: shelf names in English, the translation line in English
  const kne = await stranka(DATA(), 1280, 860, 'en', false);
  await zkus('Shelves in English', async () => {
    await doProhlizece(kne, NOVACEK, MOJE);
    await vyberHrace(kne, 'Ela');
    const zal = await kne.locator('#zalozky button:visible').allInnerTexts();
    kontrola('English tabs', zal.join() === "For me,Favourites,Children's songs,Folk songs of the world,Christmas,Classics,Mine", zal.join());
    await zalozka(kne, sPrekladem.police); await ukazVse(kne);
    kontrola('English translation line', (await naPolici(kne)).find(d => d.soubor === sPrekladem.soubor)?.preklad === sPrekladem.preklad.en);
  });
  kontrola('no page errors (shelves in English)', kne.chyby.length === 0, kne.chyby.join(' | '));
  await kne.close();
  // a long shelf (a temporary index with 46 extra children's songs whose files do not exist); Ela knows Skákal pes
  const DLOUHY = [...INDEX, ...Array.from({ length: 46 }, (_, i) => ({ soubor: `library/children/zkouska-${i + 1}.musicxml`,
    nazev: `Zkušební písnička ${i + 1}`, police: 'children', stupen: 1 + (i % 3), autor: 'traditional', jazyk: 'cs' }))];
  const UMI_SKAKAL = { profily: PROFILY, profil: 'e', vysledky: { e: { [SKAKAL]: UMI } }, statistiky: { e: Object.fromEntries([cisty(SKAKAL)]) } };
  const kd = await stranka(DATA(), 1280, 860, 'cs', false, undefined, p => p.route('**/library/index.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(DLOUHY) })));
  await zkus('Shelves: a long shelf', async () => {
    await doProhlizece(kd, UMI_SKAKAL, MOJE);
    await vyberHrace(kd, 'Ela');
    await zalozka(kd, 'children');
    kontrola('a long shelf shows all its songs too', (await naPolici(kd)).length > 60 && (await kd.locator('#pisne .vic-pisni').count()) === 0);
    kontrola('a known song says so on its tile', (await kd.locator(`#pisne .dl[data-soubor="${SKAKAL}"] .stitek-umim`).textContent()) === 'umím');
    const kontrast = await kd.evaluate(() => {
      const d = document.querySelector('#pisne .dl.tezsi small');
      if (!d) return 'no dimmed tile';
      const rgb = c => { const x = document.createElement('canvas').getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3); };
      const L = c => { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      let pruhlednost = 1;
      for (let e = d; e && e.id !== 'pisne'; e = e.parentElement) pruhlednost *= Number(getComputedStyle(e).opacity);
      const [a, b] = [L(getComputedStyle(d).color), L(getComputedStyle(d.closest('.dl')).backgroundColor)].sort((x, y) => y - x);
      return { pruhlednost, pomer: Math.round((a + 0.05) / (b + 0.05) * 100) / 100 };
    });
    kontrola('a dimmed tile stays legible (not faded, contrast ≥ 4.5:1)', kontrast.pruhlednost === 1 && kontrast.pomer >= 4.5, JSON.stringify(kontrast));
    await kd.locator('#pisne .dl', { hasText: 'Zkušební písnička 1' }).first().click();
    await kd.waitForTimeout(1500);
    kontrola('a library song that fails to load: a message and back home', await viditelna(kd, '#domu') && !(await viditelna(kd, '#pred'))
      && await viditelna(kd, '#toast'), await kd.locator('#toast').textContent());
  });
  kontrola('no page errors (long shelf)', kd.chyby.length === 0, kd.chyby.join(' | '));
  await kd.close();
  // a clean install with no saved language starts in the browser's language (English when Rusalka doesn't speak it)
  const nova = await stranka(DATA(), undefined, undefined, null);
  kontrola('the page title follows the language (English)', (await nova.title()) === 'Rusalka – learn piano with the songs you choose', await nova.title());
  kontrola('a clean install in an English browser starts in English', (await nova.locator('#kdo h1').textContent()) === 'Who is playing?'
    && await nova.evaluate(() => localStorage.getItem('kt-jazyk')) === '"en"', await nova.locator('#kdo h1').textContent());
  await nova.close();
  const nemecky = await stranka(DATA(), undefined, undefined, null, true, 'de-DE');
  kontrola('the page title follows the language (German)', /^Rusalka – Klavier lernen/.test(await nemecky.title()), await nemecky.title());
  const ceskyTitulek = await stranka(DATA());
  kontrola('the page title follows the language (Czech)', (await ceskyTitulek.title()) === 'Rusalka – naučte se na klavír písničky, které si vyberete', await ceskyTitulek.title());
  await ceskyTitulek.close();
  kontrola('a clean install in a German browser starts in German', (await nemecky.locator('#kdo h1').textContent()) === 'Wer spielt?'
    && await nemecky.evaluate(() => localStorage.getItem('kt-jazyk')) === '"de"', await nemecky.locator('#kdo h1').textContent());
  await nemecky.close();
  const en = await stranka(DATA(), undefined, undefined, 'en');
  // screen text without song titles, authors and player names
  const cesky = async sel => en.evaluate(sel => {
    const el = document.querySelector(sel)?.cloneNode(true);
    if (!el) return 'missing ' + sel;
    el.querySelectorAll('.dl b, .dl small, #pokracujNazev, #predNazev, #predAutor, .dlazdice-hrace b, #hraNazev, .ja b, #statHraci, #statPisne b, #statMista b, #predNoty, #noty, #klavesy, select, #vysText, #vysZvire, #vysTrener, #rodicePisenNazev, #ulozisteText, #nastaveniZobrazeniPro').forEach(x => x.remove());
    return (el.innerText.match(/[^\s]*[ěščřžýáíéůúťďňĚŠČŘŽÝÁÍÉŮÚŤĎŇ][^\s]*/g) || []).join(' ');
  }, sel);
  await zkus('English', async () => {
    kontrola('English: Who is playing', (await en.locator('#kdo h1').textContent()) === 'Who is playing?' && !(await cesky('#kdo')), await cesky('#kdo'));
    await en.locator('#kdo .dlazdice-hrace', { hasText: 'Fík' }).click();
    await en.waitForTimeout(1200);
    kontrola('English: home', !(await cesky('#domu')), await cesky('#domu'));
    await snimek(en, 'en-domu');
    await en.locator('#pisne .dl', { hasText: 'Frère Jacques' }).click();
    await en.waitForSelector('#predNoty svg', { timeout: 15000 });
    await en.locator('#predZmenit').click();
    kontrola('English: Before playing', !(await cesky('#pred')), await cesky('#pred'));
    await snimek(en, 'en-pred');
    await en.locator('#predHrat').click();
    await en.waitForSelector('#pas svg', { timeout: 15000 });
    await en.waitForTimeout(800);
    const klavesy = await en.locator('#klavesy').innerText();
    kontrola('English: game and English key names', !(await cesky('#hra')) && !/\bH\b|Fis|Cis/.test(klavesy), await cesky('#hra'));
    kontrola('English: in-game prompt', !/Zahraj|Čekám/.test(await en.locator('#hlaska').innerText()), await en.locator('#hlaska').innerText());
    await en.locator('#pauza').click();
    kontrola('English: pause', !(await cesky('#pauzaPrekryv')), await cesky('#pauzaPrekryv'));
    await en.locator('#pauzaKonec').click();
    await en.locator('#predZpet').click();
    await en.locator('#domu .menu-ai').click();
    kontrola('English: the AI window', !(await cesky('#aiOkno')), await cesky('#aiOkno'));
    kontrola('English: no "helper" anywhere in the page', !/helper/i.test(await en.evaluate(() => document.body.textContent)));
    await en.keyboard.press('Escape');
    for (const [m, o] of [['songs', '#pisnickyOkno'], ['players', '#hraciOkno'], ['settings', '#nastaveniOkno']]) {
      await menu(en, 'domu', m);
      kontrola('English: ' + m, !(await cesky(o)), await cesky(o));
      if (m !== 'settings') await en.keyboard.press('Escape');
    }
    await snimek(en, 'en-nastaveni');
    await en.selectOption('#volbaJazyka', 'cs');
    await en.waitForTimeout(1500);
    kontrola('switching back to Czech', (await en.locator('#kdo h1').textContent()) === 'Kdo jde hrát?');
  });
  kontrola('no page errors (English)', en.chyby.length === 0, en.chyby.join(' | '));
  await en.close();

  const jeden = await stranka(DATA([PROFILY[1]]));
  await zkus('one player', async () => {
    kontrola('with one player straight to home', await viditelna(jeden, '#domu') && !(await viditelna(jeden, '#kdo')));
    await jeden.locator('#mujProfilOtevrit').click();
    kontrola('even with one player, change lets you add another', await viditelna(jeden, '#zmenitHrace'));
  });
  await jeden.close();
  const nikdo = await stranka(DATA([]));
  await zkus('no player', async () => {
    kontrola('with no players straight to New player', await viditelna(nikdo, '#novy'));
    kontrola('first visit: no Back (there is nowhere to go), the Rusalka logo instead', !(await viditelna(nikdo, '#novyZpet')) && await viditelna(nikdo, '#novy .logo-novy'));
  });
  await nikdo.close();
  // a file of the app that fails to download (a dropped connection, a server error): one automatic reload, then the
  // startup error names the file and its status
  let pokusu = 0;
  const jednou = await stranka(DATA(), undefined, undefined, 'cs', true, 'en-US', p => p.route('**/lib/stats.js', r => (pokusu++ ? r.continue() : r.abort('connectionreset'))));
  await zkus('a file fails once', async () => {
    await jednou.waitForTimeout(1500);
    kontrola('a file of the app fails to download once: Rusalka reloads itself and starts', pokusu >= 2
      && (await jednou.locator('#chybaStartu').count()) === 0 && await jednou.evaluate(() => !!document.querySelector('main:not(.skryta)')), 'requests ' + pokusu);
  });
  await jednou.close();
  let pokusu503 = 0;
  const vzdy = await stranka(DATA(), undefined, undefined, 'cs', true, 'en-US', p => p.route('**/lib/stats.js', r => { pokusu503++; return r.fulfill({ status: 503, body: '' }); }));
  await zkus('a file always fails', async () => {
    await vzdy.waitForTimeout(1500);
    const text = (await vzdy.locator('#chybaStartu').textContent()) || '';
    kontrola('a file that keeps failing: one reload, then the error names the file and its status', pokusu503 === 2 && /lib\/stats\.js \(503\)/.test(text), text.slice(0, 300));
  });
  await vzdy.close();
} finally {
  await b.close();
  server.kill();
}
console.log(vysledky.every(Boolean) ? 'ALL OK' : 'SOMETHING FAILED');
process.exit(vysledky.every(Boolean) ? 0 : 1);
