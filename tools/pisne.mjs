// Song pages rusalkapiano.com/<language>/<folder>/<song>/ (e.g. /cs/noty/skakal-pes/): the sheet music of a library
// or starter song with Rusalka's coloured letters, the keys it needs, its chords and lyrics, and a button into the app;
// and per language a list of them (/cs/noty/). Built into web/ by tools/web.mjs, served on the fly by tools/server.mjs.
// The notes are engraved here by Verovio (as in the app) and coloured in the SVG, so the pages need no script.
// Texts in tools/uvod/pisne-<code>.json; the header and the three steps come from the introduction page texts.
// A song gets a page in its own language; languages with only a few songs go to a neighbour (JAZYK_STRANKY).
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { readFileSync } from 'node:fs';
import { zTextu } from '../static/lib/notation.js';
import { naMusicXml, zMusicXml, vysky } from '../static/lib/song.js';
import { zpracujVerovio } from '../static/lib/render.js';
import { nastavSoustavu, vychoziSoustava, nazevTonu } from '../static/lib/note_names.js';
import { obtiznost } from '../static/lib/difficulty.js';
import { POLICE } from '../static/lib/library.js';

globalThis.DOMParser ??= DOMParser;
const WEB = 'https://rusalkapiano.com/';
const KOREN = new URL('../', import.meta.url);
const SVG = 'http://www.w3.org/2000/svg';
// the note colours of the app (BARVY in static/app.js, by pitch class); E's yellow takes a dark letter
const BARVY = ['#E53935', '#E53935', '#F57C00', '#F57C00', '#F2C200', '#43A047', '#43A047', '#00A3B8', '#00A3B8', '#3F51B5', '#3F51B5', '#8E24AA'];
const TMAVE = new Set([4]);
/** the languages with song pages; a song in another language is listed on the page of its neighbour */
export const JAZYKY_PISNI = ['cs', 'en', 'de', 'fr', 'it'];
const JAZYK_STRANKY = { sk: 'cs' };   // Slovak songs with the Czech ones; the rest of the few (es, ru, ja, no …) in English

const json = cesta => JSON.parse(readFileSync(new URL(cesta, KOREN), 'utf8'));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const idTextu = v => `text-${slug(v.nazev) || v.jazyk}`;
const texty = kod => json(`tools/uvod/pisne-${kod}.json`);
const ld = data => JSON.stringify(data).replace(/</g, '\\u003c');

/** the Do–Re–Mi syllables of a language as the app names notes in it (tony.solmizace in its dictionary) */
function slabiky(kod) {
  for (const f of [`static/lang/${kod}.js`, `static/lang/${kod}/app.js`]) {
    try {
      const m = /tony\.solmizace['"]\s*:\s*["']([^"']+)/.exec(readFileSync(new URL(f, KOREN), 'utf8'));
      if (m) return m[1].split('|');
    } catch { /* no such file */ }
  }
  return null;
}

/** song → { model, xml } (library: its text notation; a starter song: its MusicXML) */
function nacti(p) {
  if (p.txt) {
    const { pisen, chyby } = zTextu(readFileSync(new URL(`library/${p.txt}`, KOREN), 'utf8'));
    if (chyby.length) throw new Error(`library/${p.txt}: ${chyby.join('; ')}`);
    return { model: pisen, xml: naMusicXml(pisen) };
  }
  const xml = readFileSync(new URL(`songs/${p.soubor}`, KOREN), 'utf8');
  return { model: zMusicXml(xml), xml };
}

let seznam = null;
/**
 * every song with a page: { jmeno (URL), jazyk (of the song), stranka (language of its page), police, nazev, preklad?,
 * txt | soubor, cesta (from the web root) }, sorted by page language, shelf and title
 */
export function pisne() {
  if (seznam) return seznam;
  const knihovna = json('library/catalog.json').map(z => ({ ...z, jmeno: z.txt.split('/')[1].replace(/\.txt$/, '') }));
  const ukazky = json('songs/index.json').map(u => ({ jazyk: 'en', ...u, jmeno: slug(u.nazev) }));
  seznam = [...knihovna, ...ukazky].map(p => {
    const stranka = JAZYK_STRANKY[p.jazyk] || (JAZYKY_PISNI.includes(p.jazyk) ? p.jazyk : 'en');
    return { ...p, stranka, nazev: nacti(p).model.nazev, cesta: `${stranka}/${texty(stranka).folder}/${p.jmeno}/` };
  }).sort((a, b) => JAZYKY_PISNI.indexOf(a.stranka) - JAZYKY_PISNI.indexOf(b.stranka)
    || POLICE.indexOf(a.police) - POLICE.indexOf(b.police) || a.nazev.localeCompare(b.nazev, a.stranka));
  const dvakrat = seznam.map(p => p.cesta).filter((c, i, v) => v.indexOf(c) !== i);
  if (dvakrat.length) throw new Error(`two songs at ${dvakrat.join(', ')}`);
  return seznam;
}

let tk = null;
async function toolkit() {
  if (!tk) {
    const { default: createVerovioModule } = await import('verovio/wasm');
    const { VerovioToolkit, enableLog, LOG_ERROR } = await import('verovio/esm');
    const modul = await createVerovioModule();
    enableLog(LOG_ERROR, modul);                          // no warnings about ties and justification in the build log
    tk = new VerovioToolkit(modul);
  }
  return tk;
}

/** a note name in a circle of its colour (SVG), the letter smaller for longer names (as in the app) */
function kolecko(doc, cx, cy, r, midi, jmeno) {
  const pc = ((midi % 12) + 12) % 12;
  const g = doc.createElementNS(SVG, 'g');
  g.setAttribute('class', 'ovl');
  const kruh = doc.createElementNS(SVG, 'circle');
  for (const [a, v] of Object.entries({ cx, cy, r })) kruh.setAttribute(a, String(Math.round(v * 10) / 10));
  kruh.setAttribute('fill', BARVY[pc]);
  const txt = doc.createElementNS(SVG, 'text');
  const vel = r * (jmeno.length > 3 ? 0.75 : jmeno.length > 2 ? 0.9 : jmeno.length > 1 ? 1.05 : 1.3);
  for (const [a, v] of Object.entries({ x: Math.round(cx), y: Math.round(cy), dy: '0.36em', 'text-anchor': 'middle',
    'font-size': Math.round(vel), class: 'pismeno' + (TMAVE.has(pc) ? ' tmave' : '') })) txt.setAttribute(a, String(v));
  txt.textContent = jmeno;
  g.appendChild(kruh); g.appendChild(txt);
  return g;
}

/**
 * the engraved notes as SVG, every note in a circle of its colour with its name (as the app draws them);
 * sirka = the width in px the lines are broken for, meritko = the note size
 */
async function notySvg(xml, model, sirka, meritko, popis) {
  const { svg, noty } = zpracujVerovio(await toolkit(), xml.replace(/<part-name>[^<]*<\/part-name>/g, '<part-name></part-name>'), model,
    { stranka: true, sirka, meritko, verovio: { spacingLinear: 0.25, spacingNonLinear: 0.6, spacingSystem: 8, pageWidth: Math.round(sirka * 100 / meritko) } });
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const podleId = {};
  for (const g of [...doc.getElementsByTagName('g')]) {
    if (/^label/.test(g.getAttribute('class') || '')) { g.parentNode.removeChild(g); continue; }   // a part name left over
    if (g.getAttribute('id')) podleId[g.getAttribute('id')] = g;
  }
  for (const n of noty) {
    const g = podleId[n.id];
    const use = g && [...g.getElementsByTagName('use')].find(u => u.parentNode.getAttribute('class') === 'notehead');
    const m = use && /translate\(([-\d.]+),\s*([-\d.]+)\)\s*scale\(([\d.]+)/.exec(use.getAttribute('transform') || '');
    if (!m) continue;
    // a notehead glyph is 226 units wide at scale 0.72 (a whole note about 1.4 times more), centred on its line or space
    const k = Number(m[3]) / 0.72, cela = /E0A2/.test(use.getAttribute('xlink:href') || '');
    g.parentNode.appendChild(kolecko(doc, Number(m[1]) + 113 * k * (cela ? 1.4 : 1), Number(m[2]), 140 * k, n.pitch, n.jmeno));
  }
  const koren = doc.documentElement;
  koren.setAttribute('role', 'img');
  koren.setAttribute('aria-label', popis);
  return new XMLSerializer().serializeToString(koren);
}

/** a keyboard from C to B of every octave the melody touches, its notes marked with their colour and name */
function klaviaturaSvg(midi) {
  const od = Math.floor(Math.min(...midi) / 12) * 12, po = Math.floor(Math.max(...midi) / 12) * 12 + 11;
  const bile = [], cerne = [], W = 52, H = 180, pouzite = new Set(midi);
  for (let m = od, x = 0; m <= po; m++) {
    if ([1, 3, 6, 8, 10].includes(m % 12)) cerne.push({ m, x: x * W - 15 });
    else bile.push({ m, x: x++ * W });
  }
  const doc = new DOMParser().parseFromString(`<svg xmlns="${SVG}"/>`, 'image/svg+xml');
  const znacka = (m, x, y) => pouzite.has(m) ? new XMLSerializer().serializeToString(kolecko(doc, x, y, 17, m, nazevTonu(m)))
    .replace(/ xmlns="[^"]+"/, '') : '';
  const sirka = bile.length * W + 2;
  return `<svg class="klavesy" viewBox="-1 -1 ${sirka} ${H + 2}" width="${sirka}" height="${H + 2}" aria-hidden="true">
${bile.map(b => `<rect x="${b.x}" y="0" width="${W}" height="${H}" rx="4" class="bila${pouzite.has(b.m) ? ' hraje' : ''}"/>${znacka(b.m, b.x + W / 2, H - 28)}`).join('')}
${cerne.map(c => `<rect x="${c.x}" y="0" width="30" height="110" rx="3" class="cerna"/>${znacka(c.m, c.x + 15, 86)}`).join('')}
</svg>`;
}

/** lyrics from the syllables of the melody: a trailing '-' joins the word, a line ends after , . ; ! ? */
function textPisne(model) {
  let out = '';
  for (const n of model.takty.flatMap(t => t.noty || [])) {
    if (!n.s) continue;
    const s = n.s.trim();
    out += s.endsWith('-') ? s.slice(0, -1) : s + (/[,.;!?]$/.test(s) ? '\n' : ' ');
  }
  return out.split('\n').map(r => r.trim()).filter(Boolean);
}

/**
 * the author line of the song header in the page language: "traditional" and "music by / lyrics by" translated,
 * names kept; a part it does not recognise stays as written (English)
 */
export function autorText(autor, kod, t = texty(kod)) {
  const a = String(autor || '').trim();
  if (!a || /^traditional$/i.test(a)) return t.traditional;
  if (kod === 'en') return a;
  return a.split(/,\s*(?=(?:English )?lyrics\b|music by\b)/).map(cast => {
    let m;
    if (/^traditional\b/i.test(cast)) return t.traditional;
    if ((m = /^music by (.+?)(?: \([^)]*\))?$/.exec(cast))) return `${t.music}: ${m[1]}`;
    if ((m = /^(?:English )?lyrics by (.+)$/.exec(cast))) return `${t.lyrics}: ${m[1]}`;
    if (/^lyrics anonymous$/.test(cast)) return '';
    return cast;
  }).filter(Boolean).join(', ');
}

const hlavicka = (u, koren, uvod) => `<header class="hlava sirka">
  <a class="logo" href="${uvod}"><img src="${koren}icons/logo.svg" alt="Rusalka" width="126" height="44"></a>
  <nav aria-label="${esc(u.navPages)}"><a href="${koren}">${esc(u.openApp)}</a></nav>
</header>`;
const hlava = ({ kod, titulek, popis, url, koren, data }) => `<!doctype html>
<html lang="${kod}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulek)}</title>
<meta name="description" content="${esc(popis)}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#FFFFFF">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Rusalka">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(titulek)}">
<meta property="og:description" content="${esc(popis)}">
<meta property="og:image" content="${WEB}icons/og.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${ld(data)}</script>
<link rel="icon" href="${koren}icons/32.png" sizes="32x32">
<link rel="apple-touch-icon" href="${koren}icons/192.png">
<link rel="stylesheet" href="${koren}fonts.css">
<link rel="stylesheet" href="${koren}uvod/uvod.css">
<link rel="stylesheet" href="${koren}uvod/pisen.css">
</head>`;
const pata = (u, uvod) => `<footer class="pata sirka">
  <p><a href="${uvod}">rusalkapiano.com</a></p>
  <p>${esc(u.creditPiano)}</p>
</footer>
</body>
</html>
`;

/** the page of one song: { cesta (from the web root), html } */
export async function strankaPisne(p, { externe = false } = {}) {
  const kod = p.stranka, t = texty(kod), u = json(`tools/uvod/${kod}.json`);
  nastavSoustavu(vychoziSoustava(kod), slabiky(kod));
  const { model, xml } = nacti(p);
  const nazev = p.nazev, preklad = p.jazyk !== kod ? p.preklad?.[kod] : null;
  const r = s => String(s).replace(/\{song\}/g, preklad ? `${nazev} (${preklad})` : nazev);
  const melodie = model.takty.flatMap(x => x.noty || []).flatMap(n => vysky(n.t)).map(v => v.midi);
  const nazvyTonu = [...new Set([...new Set(melodie)].sort((a, b) => a - b).map(m => nazevTonu(m)))].join(', ');
  const akordy = [...new Set(model.takty.flatMap(x => (x.akordy || []).map(a => a.znacka)))];
  const text = p.slova || textPisne(model);
  const varianty = p.variantyTextu || [];
  const stupen = obtiznost(zMusicXml(xml)).stupen;               // as the app rates the song
  const obeRuce = model.takty.some(x => (x.leva || []).length) || /<staves>2<\/staves>/.test(xml);
  const autor = autorText(model.autor, kod, t);
  const popisNot = r(t.sheetAlt);
  const [siroke, uzke] = [await notySvg(xml, model, 900, 75, popisNot), await notySvg(xml, model, 340, 50, popisNot)];
  const noty = `<div class="noty-siroke">${siroke}</div>
    <div class="noty-uzke">${uzke}</div>`;
  const vsechny = pisne().filter(q => q.stranka === kod && q !== p);
  const dalsi = [...vsechny.filter(q => q.police === p.police), ...vsechny.filter(q => q.police !== p.police)].slice(0, 8);
  const popis = r(t.description).replace('{chords}', akordy.length ? t.withChords : '').replace('{lyrics}', text.length || varianty.length ? t.withLyrics : '');
  const titulek = r(t.title), url = WEB + p.cesta, seznamUrl = `${WEB}${kod}/${t.folder}/`;
  // into the app straight to this song (static/app.js, #pisen=): the library file, or the starter song's
  const hrat = `../../../#pisen=${encodeURIComponent(p.txt ? `library/${p.txt.replace(/\.txt$/, '.musicxml')}` : p.soubor)}`;
  const jakoPisen = p.jazyk !== kod ? ` lang="${p.jazyk}"` : '';
  const slozeni = { '@type': 'MusicComposition', name: nazev, url, inLanguage: p.jazyk, isAccessibleForFree: true };
  if (!/traditional|\bby\b|,/.test(model.autor || '') && model.autor) slozeni.composer = { '@type': 'Person', name: model.autor };
  const data = [{ '@context': 'https://schema.org', ...slozeni },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Rusalka', item: `${WEB}${kod}/` },
      { '@type': 'ListItem', position: 2, name: t.crumbSongs, item: seznamUrl },
      { '@type': 'ListItem', position: 3, name: nazev, item: url }] }];
  const html = `${hlava({ kod, titulek, popis, url, koren: '../../../', data })}
<body>
${hlavicka(u, '../../../', '../../')}

<main class="pisen">
<div class="sirka">
  <nav class="drobky" aria-label="${esc(t.crumbSongs)}"><a href="../../">Rusalka</a> › <a href="../">${esc(t.crumbSongs)}</a> › <a href="../#${p.police}">${esc(t['shelf_' + p.police])}</a></nav>
  <h1><span${jakoPisen}>${esc(nazev)}</span><span class="pod">${preklad ? `${esc(preklad)} · ` : ''}${esc(t.sub)}</span></h1>
  <dl class="fakta">
    <div><dt>${esc(t.author)}</dt><dd>${esc(autor)}</dd></div>
    <div><dt>${esc(t.level)}</dt><dd>${esc(t['level' + stupen])}</dd></div>
    <div><dt>${esc(t.hands)}</dt><dd>${esc(obeRuce ? t.handsBoth : t.handRight)}</dd></div>
    <div><dt>${esc(t.time)}</dt><dd>${esc(model.takt)}</dd></div>
    <div><dt>${esc(t.bars)}</dt><dd>${model.takty.length}</dd></div>
  </dl>
  <p class="akce"><a class="hrat" href="${hrat}">${esc(t.play)}</a><span class="drobne">${esc(t.playSmall)}</span></p>
</div>

<section class="sirka" aria-labelledby="noty">
  <h2 id="noty">${esc(t.sheetH2)}</h2>
  <figure class="list-not"${jakoPisen}>
    ${noty}
  </figure>
</section>

<section class="sirka dvojice">
  <div>
    <h2>${esc(t.keysH2)}</h2>
    <p>${esc(t.keysP.replace('{notes}', nazvyTonu))}</p>
    <div class="klaviatura" role="img" aria-label="${esc(t.keysAlt.replace('{notes}', nazvyTonu))}">${klaviaturaSvg(melodie)}</div>
  </div>
${akordy.length ? `  <div>
    <h2>${esc(t.chordsH2)}</h2>
    <p class="akordy">${akordy.map(a => `<b>${esc(a)}</b>`).join(' ')}</p>
    <p>${esc(t.chordsP.replace('{chords}', akordy.join(', ')))}</p>
  </div>
` : ''}</section>
${text.length ? `
<section class="sirka" aria-labelledby="text">
  <h2 id="text">${esc(t.lyricsH2)}</h2>
  <p class="text-pisne"${jakoPisen}>${text.map(esc).join('<br>\n')}</p>
</section>
` : ''}
${varianty.map(v => `
<section class="sirka" id="${idTextu(v)}" lang="${esc(v.jazyk)}">
  <h2>${esc(v.nazev)}</h2>
  <p class="text-pisne">${v.slova.map(esc).join('<br>\n')}</p>
</section>`).join('')}
<section class="sirka" aria-labelledby="jak">
  <h2 id="jak">${esc(t.howH2)}</h2>
  <ol class="kroky">
${[1, 2, 3].map(i => `    <li><h3><span class="cislo">${i}</span>${esc(u[`step${i}h`])}</h3>
      <p>${esc(u[`step${i}p`])}</p></li>`).join('\n')}
  </ol>
  <p class="akce"><a class="hrat" href="${hrat}">${esc(t.play)}</a></p>
</section>

<section class="sirka" aria-labelledby="dalsi">
  <h2 id="dalsi">${esc(t.moreH2)}</h2>
  <ul class="dalsi">
${dalsi.map(q => `    <li><a href="../${q.jmeno}/"${q.jazyk !== kod ? ` hreflang="${q.jazyk}"` : ''}>${esc(q.nazev)}</a></li>`).join('\n')}
  </ul>
  <p><a href="../">${esc(t.allSongs)}</a></p>
</section>
</main>

${pata(u, '../../')}`;
  if (!externe || Buffer.byteLength(html) <= 150000) return { cesta: p.cesta, html };
  // An SVG image cannot inherit the page CSS. The circles keep their colours and the text uses a system font.
  const styl = '<style>.pismeno { fill: white; font-family: sans-serif; font-weight: 800; } .pismeno.tmave { fill: #3A2E00; } .harm text { font-family: sans-serif; font-weight: 700; }</style>';
  const soubory = {};
  const rozmer = (jmeno, svg) => {
    soubory[jmeno] = svg.replace(/^(<svg[^>]*>)/, '$1' + styl);
    const [, w, h] = svg.match(/^<svg viewBox="0 0 (\d+) (\d+)"/);
    return `width="${w}" height="${h}"`;
  };
  const velky = rozmer('noty-siroke.svg', siroke), maly = rozmer('noty-uzke.svg', uzke);
  const obrazek = `<picture>
      <source media="(max-width: 600px)" srcset="noty-uzke.svg" ${maly}>
      <img src="noty-siroke.svg" loading="lazy" ${velky} alt="${esc(popisNot)}" style="display:block;width:100%;height:auto">
    </picture>`;
  return { cesta: p.cesta, html: html.replace(noty, () => obrazek), soubory };
}

/** National anthems are linked from every language while each score keeps its own page. */
export const pisneProSeznam = kod => pisne().filter(p => p.stranka === kod || p.police === 'anthems');

/** the list of the songs of a page language, by shelf: { cesta, html } */
export function seznamPisni(kod) {
  const t = texty(kod), u = json(`tools/uvod/${kod}.json`), vsechny = pisneProSeznam(kod);
  const varianty = pisne().flatMap(p => (p.variantyTextu || [])
    .filter(v => v.jazyk === kod && (p.stranka !== kod || (v.police && v.police !== p.police)))
    .map(v => ({ nazev: v.nazev, police: v.police || p.police, stranka: p.stranka, cesta: p.cesta, odkaz: `/${p.cesta}#${idTextu(v)}` })));
  const zakladni = vsechny.filter(p => !varianty.some(v => v.cesta === p.cesta && v.police === p.police))
    .map(p => ({ ...p, odkaz: p.stranka === kod ? `${p.jmeno}/` : `/${p.cesta}` }));
  const polozky = [...zakladni, ...varianty].sort((a, b) => a.nazev.localeCompare(b.nazev, kod));
  const cesta = `${kod}/${t.folder}/`, url = WEB + cesta;
  const r = s => String(s).replace(/\{count\}/g, vsechny.length);
  const data = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: t.indexH1, url, inLanguage: kod,
    hasPart: vsechny.map(p => ({ '@type': 'MusicComposition', name: p.nazev, url: WEB + p.cesta })) };
  const html = `${hlava({ kod, titulek: r(t.indexTitle), popis: r(t.indexDescription), url, koren: '../../', data })}
<body>
${hlavicka(u, '../../', '../')}

<main class="pisen">
<div class="sirka">
  <nav class="drobky" aria-label="${esc(t.crumbSongs)}"><a href="../">Rusalka</a> › <span>${esc(t.crumbSongs)}</span></nav>
  <h1>${esc(t.indexH1)}</h1>
  <p class="perex">${esc(r(t.indexLead))}</p>
  <p class="akce"><a class="hrat" href="../../">${esc(u.start)}</a></p>
</div>
${POLICE.filter(pol => polozky.some(p => p.police === pol)).map(pol => `
<section class="sirka" aria-labelledby="${pol}">
  <h2 id="${pol}">${esc(t['shelf_' + pol])}</h2>
  <ul class="dalsi">
${polozky.filter(p => p.police === pol).map(p => `    <li><a href="${p.odkaz}"${p.stranka !== kod ? ` hreflang="${p.stranka}"` : ''}>${esc(p.nazev)}</a></li>`).join('\n')}
  </ul>
</section>`).join('\n')}
</main>

${pata(u, '../')}`;
  return { cesta, html };
}

/** the URLs of the song pages and lists, for the sitemap */
export const adresyPisni = () => [...JAZYKY_PISNI.map(k => `${WEB}${k}/${texty(k).folder}/`), ...pisne().map(p => WEB + p.cesta)];
