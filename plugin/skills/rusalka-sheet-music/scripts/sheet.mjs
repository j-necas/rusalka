#!/usr/bin/env node
// Helper for the „rusalka-sheet-music“ skill: text notation (one bar per line) → check → MusicXML → picture
// to compare with the original → adding to the Rusalka app. The notation format is in ../references/format.md.
//
//   node sheet.mjs rozrez noty.pdf|foto.jpg  finds the staves and saves enlarged lines with helper lines
//   node sheet.mjs kontrola pisen.txt      checks bar lengths, writes pisen.trener.musicxml and pisen.kontrola-1.png …
//   node sheet.mjs text pisen.musicxml     MusicXML (e.g. from Audiveris or MuseScore) → pisen.txt for corrections
//   node sheet.mjs pridat pisen.txt        after the check, writes the song into the Rusalka folder (without one, next to the notation for import)
//   node sheet.mjs slozka                  prints the Rusalka folder
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, basename, extname } from 'node:path';
import { homedir, platform } from 'node:os';
import { naMusicXml, zMusicXml, kontrola } from './lib/song.js';
import { zTextu, naText } from './lib/notation.js';


// ---------------------------------------------------------------- rendering for the check
async function vykresli(xml, zaklad) {
  let createVerovioModule, VerovioToolkit, Resvg, PISMO;
  try {
    ({ default: createVerovioModule } = await import('verovio/wasm'));
    ({ VerovioToolkit } = await import('verovio/esm'));
    ({ Resvg } = await import('@resvg/resvg-js'));
    ({ PISMO } = await import('./lib/staves.mjs'));
  } catch {
    console.log(`(obrázek ke kontrole se nevytvořil: chybí knihovny – spusť jednou: npm install --prefix "${dirname(dirname(new URL(import.meta.url).pathname))}")`);
    return [];
  }
  const tk = new VerovioToolkit(await createVerovioModule());
  tk.setOptions({ pageWidth: 2100, pageHeight: 2970, scale: 45, adjustPageHeight: true, mnumInterval: 1, header: 'none', footer: 'none', breaks: 'auto' });
  if (!tk.loadData(xml)) throw new Error('Verovio MusicXML nenačetlo');
  const soubory = [];
  for (const f of readdirSync(dirname(zaklad))) {          // old pictures from the previous check
    if (f.startsWith(basename(zaklad) + '.kontrola-') && f.endsWith('.png')) unlinkSync(join(dirname(zaklad), f));
  }
  for (let s = 1; s <= tk.getPageCount(); s++) {
    const png = new Resvg(tk.renderToSVG(s), { background: 'white', fitTo: { mode: 'width', value: 1800 }, font: PISMO }).render().asPng();
    const cesta = `${zaklad}.kontrola-${s}.png`;
    writeFileSync(cesta, png);
    soubory.push(cesta);
  }
  return soubory;
}

// ---------------------------------------------------------------- Rusalka folder
// The one the parent chose in Rusalka with the „Ukládat do složky…“ (Save to folder…) button (default ~/Rusalka, otherwise RUSALKA_SLOZKA).
const slozkaRusalky = () => process.env.RUSALKA_SLOZKA || join(homedir(), 'Rusalka');
const jeSlozkaRusalky = d => existsSync(join(d, 'rusalka.json')) || existsSync(join(d, 'pisne'));

// ---------------------------------------------------------------- commands
function nactiPisen(cesta) {
  const obsah = readFileSync(cesta, 'utf8');
  if (/\.(musicxml|xml)$/i.test(cesta)) return { pisen: zMusicXml(obsah), chyby: [] };
  return zTextu(obsah);
}
async function domParser() {
  if (globalThis.DOMParser) return;
  try { globalThis.DOMParser = (await import('@xmldom/xmldom')).DOMParser; }
  catch { throw new Error(`chybí knihovna @xmldom/xmldom – spusť jednou: npm install --prefix "${dirname(dirname(new URL(import.meta.url).pathname))}"`); }
}
const zaklad = cesta => join(dirname(cesta), basename(cesta, extname(cesta)));

async function prikazKontrola(cesta) {
  if (/\.(musicxml|xml)$/i.test(cesta)) await domParser();
  const { pisen, chyby } = nactiPisen(cesta);
  if (chyby.length) { console.log('CHYBY ZÁPISU:\n- ' + chyby.join('\n- ')); return 1; }
  const delky = kontrola(pisen);
  const xml = naMusicXml(pisen);
  const vystup = zaklad(cesta) + '.trener.musicxml';              // does not overwrite the original MusicXML (e.g. from Audiveris)
  if (!/\.(musicxml|xml)$/i.test(cesta)) writeFileSync(vystup, xml);
  const obrazky = await vykresli(xml, zaklad(cesta));
  console.log(`${pisen.nazev || '(bez názvu)'}: ${pisen.takty.length} taktů, takt ${pisen.takt}, předznamenání ${pisen.predznamenani}`
    + `; akordů ${pisen.takty.reduce((a, t) => a + t.akordy.length, 0)}`
    + `, slabik ${pisen.takty.reduce((a, t) => a + t.noty.filter(n => n.s).length, 0)}`
    + (pisen.takty.some(t => t.leva?.length) ? ', s levou rukou' : ', bez levé ruky'));
  if (delky.length) console.log('DÉLKY TAKTŮ NESEDÍ:\n- ' + delky.join('\n- '));
  else console.log('Délky taktů sedí.');
  if (pisen.nejistoty.length) console.log('Nejisté: ' + pisen.nejistoty.join(', '));
  if (!/\.(musicxml|xml)$/i.test(cesta)) console.log('MusicXML: ' + vystup);
  if (obrazky.length) console.log('Obrázek ke srovnání s originálem (čísla taktů nad osnovou):\n' + obrazky.map(o => '  ' + o).join('\n'));
  return delky.length ? 2 : 0;
}

async function prikazText(cesta) {
  await domParser();
  const p = zMusicXml(readFileSync(cesta, 'utf8'));
  const cil = zaklad(cesta) + '.txt';
  if (existsSync(cil)) throw new Error(`${cil} už existuje, nepřepisuji ho`);
  writeFileSync(cil, naText(p));
  console.log(`Zápis k opravám: ${cil} (${p.takty.length} taktů)`);
  return 0;
}

async function prikazPridat(cesta, volby) {
  if (/\.(musicxml|xml)$/i.test(cesta)) await domParser();
  const { pisen, chyby } = nactiPisen(cesta);
  if (chyby.length) { console.log('CHYBY ZÁPISU:\n- ' + chyby.join('\n- ')); return 1; }
  const delky = kontrola(pisen);
  if (delky.length && !volby.includes('--i-s-chybami')) {
    console.log('Nepřidáno, délky taktů nesedí (oprav je, nebo přidej --i-s-chybami a oprav je v editoru aplikace):\n- ' + delky.join('\n- '));
    return 2;
  }
  const kmen = (pisen.nazev || basename(cesta, extname(cesta))).replace(/[^\p{L}\p{N} \-_()]/gu, ' ').replace(/\s+/g, ' ').trim() || 'pisnicka';
  const R = slozkaRusalky();
  if (!jeSlozkaRusalky(R)) {                       // data only in the browser: a file to add by hand
    const cil = join(dirname(cesta), `${kmen}.musicxml`);
    writeFileSync(cil, naMusicXml(pisen));
    console.log(`Složka Rusalky (${R}) neexistuje, písnička je v souboru: ${cil}\n`
      + 'V Rusalce ji přidej tlačítkem „Přidat písničku“. (Nebo v Rusalce zvol „Ukládat do složky…“ a pak spusť pridat znovu.)');
    return 0;
  }
  const slozka = join(R, 'pisne');
  mkdirSync(slozka, { recursive: true });
  let cil = join(slozka, `${kmen}.musicxml`);
  for (let k = 2; existsSync(cil); k++) cil = join(slozka, `${kmen} (${k}).musicxml`);
  writeFileSync(cil, naMusicXml(pisen));
  console.log(`Přidáno: ${cil}\nV Rusalce se písnička ukáže po návratu na úvodní obrazovku.`);
  return 0;
}

async function prikazRozrez(cesta, volby) {
  let najdiOsnovy, vyrezy;
  try { ({ najdiOsnovy, vyrezy } = await import('./lib/staves.mjs')); }
  catch { throw new Error(`chybí knihovna @resvg/resvg-js – spusť jednou: npm install --prefix "${dirname(dirname(new URL(import.meta.url).pathname))}"`); }
  const cil = zaklad(cesta) + '.radky';
  mkdirSync(cil, { recursive: true });
  let stranky = [cesta];
  if (/\.(webp|heic|heif|tiff?|bmp)$/i.test(cesta)) {             // resvg can't read them – convert to PNG (macOS sips)
    const png = join(cil, basename(cesta, extname(cesta)) + '.png');
    const r = spawnSync('sips', ['-s', 'format', 'png', cesta, '--out', png], { encoding: 'utf8' });
    if (r.error || r.status !== 0) throw new Error(`obrázek ${extname(cesta)} převeď nejdřív na PNG nebo JPEG`);
    stranky = [png];
  } else if (/\.pdf$/i.test(cesta)) {
    const r = spawnSync('pdftoppm', ['-r', '200', '-png', cesta, join(cil, 'strana')], { encoding: 'utf8' });
    if (r.error || r.status !== 0) {
      throw new Error('na převod PDF na obrázky chybí pdftoppm (poppler) – převeď stránky na PNG jinak'
        + ' (např. Python s pymupdf) a spusť rozrez na každý obrázek');
    }
    stranky = readdirSync(cil).filter(f => /^strana-\d+\.png$/.test(f)).sort().map(f => join(cil, f));
  }
  const klic = volby.includes('--basovy') ? 'basovy' : 'houslovy';
  const linky = !volby.includes('--bez-linek');
  stranky.forEach((st, si) => {
    const b = readFileSync(st);
    const osnovy = najdiOsnovy(b);
    console.log(`strana ${si + 1}${stranky.length > 1 || st !== cesta ? ` (${st})` : ''}: ${osnovy.length} osnov`
      + (osnovy.length ? `, rozestup linek ${osnovy[0].s.toFixed(1)} px, náklon ${osnovy[0].uhel.toFixed(1)}° (výřezy jsou narovnané)`
        : ' – osnovy jsem nenašel, řež řádky ručně'));
    osnovy.forEach((o, oi) => {
      for (const v of vyrezy(b, o, { klic, linky })) {
        const f = join(cil, `s${si + 1}-osnova${String(oi + 1).padStart(2, '0')}${v.casti > 1 ? `-cast${v.cast}` : ''}.png`);
        writeFileSync(f, v.png);
        console.log('  ' + f);
      }
    });
  });
  console.log('Pomocné linky: červeně linky, modře mezery; názvy tónů platí pro ' + (klic === 'basovy' ? 'basový' : 'houslový')
    + ' klíč' + (klic === 'basovy' ? '.' : ' (pro basový spusť znovu s --basovy).') + ' Osnovy jsou shora dolů; u klavíru'
    + ' tvoří systém dvě po sobě jdoucí osnovy.');
  return 0;
}

const [prikaz, cesta, ...volby] = process.argv.slice(2);
const PRIKAZY = { rozrez: prikazRozrez, kontrola: prikazKontrola, text: prikazText, pridat: prikazPridat,
  slice: prikazRozrez, check: prikazKontrola, add: prikazPridat };   // English aliases
try {
  if (prikaz === 'slozka' || prikaz === 'folder') { const R = slozkaRusalky(); console.log(R + (jeSlozkaRusalky(R) ? '' : '  (zatím neexistuje)')); process.exit(0); }
  if (!PRIKAZY[prikaz] || !cesta) {
    console.log('Usage: node sheet.mjs slice|check|text|add <file> [--basovy] [--bez-linek] [--i-s-chybami]  |  node sheet.mjs folder');
    process.exit(prikaz ? 1 : 0);
  }
  if (!existsSync(cesta)) throw new Error(`soubor ${cesta} neexistuje`);
  process.exit(await PRIKAZY[prikaz](cesta, volby));
} catch (e) {
  console.error('Chyba: ' + (e.message || e));
  process.exit(1);
}
