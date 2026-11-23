// Builds the song library for the website: library/<shelf>/<name>.txt (Rusalka text notation) + library/catalog.json
// → build/library/<shelf>/<name>.musicxml, build/library/index.json (Polozka[], see static/lib/library.js) and
// build/library/review.html (every song with its score and a play button, for the parent's review by listening).
// Checks every song: notation parses, bar lengths, no uncertain bars, renders with Verovio, catalog fields present,
// known shelf, no duplicate titles and none equal to a starter song in songs/.
//   npm run library        (exits 1 and lists the errors when there are any)
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { zTextu } from '../static/lib/notation.js';
import { kontrola, naMusicXml, zMusicXml, rozvin, vysky, zlomek, soucetTaktu, tonyAkordu, metrum } from '../static/lib/song.js';
import { obtiznost } from '../static/lib/difficulty.js';
import { POLICE } from '../static/lib/library.js';

export { POLICE };
/** Keep the original song addresses (and the results stored under them) when a shelf is split from folk/. */
const SLOZKA = { czech: 'folk', anthems: 'folk' };
export const slozkaPolice = police => SLOZKA[police] || police;
const POVINNE = ['txt', 'police', 'jazyk', 'zdroj', 'volne'];
const JMENO = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UKAZKY = new URL('../songs/index.json', import.meta.url);
const klic = t => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const radkyTextu = s => Array.isArray(s) && s.length && s.every(r => typeof r === 'string' && r.trim());

let verovio = null;                                      // one toolkit for the whole process (WASM start ~0.3 s)
async function toolkit() {
  if (!verovio) {
    const { default: createVerovioModule } = await import('verovio/wasm');
    const { VerovioToolkit } = await import('verovio/esm');
    verovio = new VerovioToolkit(await createVerovioModule());
  }
  return verovio;
}

/** titles of the starter songs (songs/index.json: title and file name) – library titles must differ */
function nazvyUkazek(cesta) {
  if (!existsSync(cesta)) return new Set();
  const seznam = JSON.parse(readFileSync(cesta, 'utf8'));
  return new Set(seznam.flatMap(s => [s.nazev, String(s.soubor || '').replace(/\.[^.]+$/, '')]).filter(Boolean).map(klic));
}

/** all .txt files as 'shelf/name.txt'; a .txt outside a shelf folder is reported */
function najdiTxt(zdroj, chyby) {
  const out = [];
  for (const f of readdirSync(zdroj)) {
    const plna = new URL(encodeURIComponent(f), zdroj);
    if (statSync(plna).isDirectory()) {
      for (const g of readdirSync(plna)) if (g.endsWith('.txt')) out.push(`${f}/${g}`);
    } else if (f.endsWith('.txt')) chyby.push(`${f}: not in a shelf folder (${POLICE.join(', ')})`);
  }
  return out.sort();
}

/**
 * Builds the library from zdroj (folder URL with catalog.json and shelf folders) into cil (folder URL, emptied first).
 * → Promise<{ index: Polozka[], chyby: string[] }>; songs with errors are left out of the index.
 */
export async function postavKnihovnu({ zdroj, cil, ukazky = UKAZKY }) {
  const chyby = [];
  let katalog = [];
  try { katalog = JSON.parse(readFileSync(new URL('catalog.json', zdroj), 'utf8')); }
  catch (e) { chyby.push(`catalog.json: ${e.message}`); }
  if (!Array.isArray(katalog)) { chyby.push('catalog.json: must be an array of entries'); katalog = []; }

  const soubory = najdiTxt(zdroj, chyby);
  const zaznamy = new Map();
  const vadne = new Set();                               // txt whose catalog entry has an error: left out of the index
  for (const z of katalog) {
    const txt = typeof z?.txt === 'string' ? z.txt : '(entry without txt)';
    const pred = chyby.length;
    if (zaznamy.has(txt)) { chyby.push(`catalog.json: ${txt}: listed twice`); vadne.add(txt); continue; }
    zaznamy.set(txt, z);
    const chybi = POVINNE.filter(k => typeof z?.[k] !== 'string' || !z[k].trim());
    if (chybi.length) chyby.push(`catalog.json: ${txt}: missing ${chybi.join(', ')}`);
    if (z?.police && !POLICE.includes(z.police)) chyby.push(`catalog.json: ${txt}: unknown shelf "${z.police}" (${POLICE.join(', ')})`);
    else if (z?.police && typeof z.txt === 'string' && z.txt.split('/')[0] !== slozkaPolice(z.police)) chyby.push(`catalog.json: ${txt}: shelf "${z.police}" but the file is in ${z.txt.split('/')[0]}/, not ${slozkaPolice(z.police)}/`);
    if (z?.preklad != null && (typeof z.preklad !== 'object' || Object.entries(z.preklad).some(([k, v]) => !['en', 'cs'].includes(k) || typeof v !== 'string')))
      chyby.push(`catalog.json: ${txt}: preklad must be { en?, cs? } with text`);
    if (z?.slova != null && !radkyTextu(z.slova))
      chyby.push(`catalog.json: ${txt}: slova must be a list of non-empty lyric lines`);
    if (z?.variantyTextu != null && (!Array.isArray(z.variantyTextu) || z.variantyTextu.some(v =>
      typeof v?.nazev !== 'string' || !v.nazev.trim() || typeof v.jazyk !== 'string' || !/^[a-z]{2}$/.test(v.jazyk)
      || !radkyTextu(v.slova) || (v.police != null && !POLICE.includes(v.police)))))
      chyby.push(`catalog.json: ${txt}: variantyTextu must contain nazev, jazyk, slova and optionally a known police`);
    if (typeof z?.txt === 'string' && !soubory.includes(z.txt)) chyby.push(`catalog.json: ${z.txt}: file missing`);
    if (chyby.length > pred) vadne.add(txt);
  }

  globalThis.DOMParser ??= DOMParser;                    // zMusicXml needs it (built into the browser)
  const ukazkove = nazvyUkazek(ukazky);
  const nazvy = new Map();                               // title key → txt
  const hotove = [];
  for (const txt of soubory) {
    const [police, soubor] = txt.split('/');
    const jmeno = soubor.replace(/\.txt$/, '');
    const z = zaznamy.get(txt);
    const pred = chyby.length;
    if (!z) chyby.push(`${txt}: no entry in catalog.json`);
    if (!POLICE.some(p => slozkaPolice(p) === police)) chyby.push(`${txt}: unknown shelf "${police}" (${POLICE.join(', ')})`);
    if (!JMENO.test(jmeno)) chyby.push(`${txt}: file name must be lowercase letters, digits and hyphens`);
    if (chyby.length > pred) continue;                   // a bad name may not even form a valid URL
    const cesta = new URL(`${encodeURIComponent(police)}/${encodeURIComponent(soubor)}`, zdroj);
    const { pisen, chyby: zapis } = zTextu(readFileSync(cesta, 'utf8'));
    for (const c of zapis) chyby.push(`${txt}: ${c}`);
    if (!zapis.length) {
      for (const c of kontrola(pisen)) chyby.push(`${txt}: ${c}`);
      if (pisen.nejistoty.length) chyby.push(`${txt}: uncertain ${pisen.nejistoty.join(', ')} – check against the source and remove "?"`);
      const k = klic(pisen.nazev);
      if (!k) chyby.push(`${txt}: title missing`);
      else if (ukazkove.has(k)) chyby.push(`${txt}: title "${pisen.nazev}" is a starter song in songs/`);
      else if (nazvy.has(k)) chyby.push(`${txt}: duplicate title "${pisen.nazev}" (also ${nazvy.get(k)})`);
      else nazvy.set(k, txt);
    }
    if (chyby.length > pred || !z || vadne.has(txt)) continue;
    const xml = naMusicXml(pisen);
    const tk = await toolkit();
    if (!tk.loadData(xml) || tk.getPageCount() < 1 || !tk.renderToSVG(1).includes('<svg')) { chyby.push(`${txt}: Verovio cannot render it`); continue; }
    const model = zMusicXml(xml);                        // difficulty from the file as the app reads it
    const polozka = { soubor: `library/${police}/${jmeno}.musicxml`, nazev: pisen.nazev, police: z.police || police, stupen: obtiznost(model).stupen,
      autor: pisen.autor || '', jazyk: z.jazyk };
    if (z.preklad && Object.keys(z.preklad).length) polozka.preklad = z.preklad;
    if (z.slova) polozka.slova = z.slova;
    if (z.variantyTextu?.length) polozka.variantyTextu = z.variantyTextu;
    hotove.push({ polozka, xml, pisen, zaznam: z });
  }

  const poradi = (a, b) => POLICE.indexOf(a.polozka.police) - POLICE.indexOf(b.polozka.police)
    || a.polozka.nazev.localeCompare(b.polozka.nazev, 'cs');
  hotove.sort(poradi);
  rmSync(cil, { recursive: true, force: true });
  mkdirSync(cil, { recursive: true });
  for (const { polozka, xml } of hotove) {
    const cesta = new URL(polozka.soubor.replace(/^library\//, ''), cil);
    mkdirSync(new URL('./', cesta), { recursive: true });
    writeFileSync(cesta, xml);
  }
  const index = hotove.map(h => h.polozka);
  writeFileSync(new URL('index.json', cil), JSON.stringify(index, null, 1) + '\n');
  writeFileSync(new URL('review.html', cil), stranka(hotove));
  return { index, chyby };
}

// ---------------------------------------------------------------- review page
/** what the ▶ button plays: melody notes and chord tones in quarter beats, repeats unrolled, ties joined */
export function prehravani(pisen) {
  const { pisen: p } = rozvin(pisen);
  const delkaTaktu = metrum(p.takt).delka;
  const noty = [], akordy = [];
  let pos = 0, otevrena = null;                          // otevrena: the note a tie continues
  for (const t of p.takty) {
    let x = pos;
    for (const n of t.noty || []) {
      const d = zlomek(n.d) || 0;
      const m = vysky(n.t).map(v => v.midi);
      let nota = null;
      if (otevrena && m.length === 1 && m[0] === otevrena.m[0]) { otevrena.d += d; nota = otevrena; }
      else if (m.length) { nota = { t: x, d, m }; noty.push(nota); }
      otevrena = n.lig ? nota : null;
      x += d;
    }
    for (const a of t.akordy || []) {
      const ton = tonyAkordu(a.znacka);
      if (ton) akordy.push({ t: pos + a.doba, m: ton.tony.map(pc => 48 + ((pc - ton.koren + 12) % 12) + ton.koren) });
    }
    pos += Math.max(soucetTaktu(t.noty), soucetTaktu(t.leva)) || delkaTaktu;
  }
  akordy.forEach((a, i) => { a.d = (akordy[i + 1]?.t ?? pos) - a.t; });
  return { tempo: p.tempo > 0 ? p.tempo : 100, noty, akordy: akordy.filter(a => a.d > 0) };
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function stranka(hotove) {
  const data = hotove.map(({ polozka, pisen, zaznam }) => ({ soubor: polozka.soubor.replace(/^library\//, ''), ...prehravani(pisen) }));
  const radky = hotove.map(({ polozka: p, zaznam: z }, i) => `
<section>
  <h2>${esc(p.nazev)}${p.preklad ? ` <small>(${esc(Object.values(p.preklad).join(' / '))})</small>` : ''}</h2>
  <p class="meta">${esc(p.police)} · difficulty ${p.stupen} · ${esc(p.autor || 'no author')} · language ${esc(p.jazyk)}</p>
  <p class="meta">Source: ${esc(z.zdroj)}<br>Free because: ${esc(z.volne)}</p>
  <button data-i="${i}">▶ Play</button>
  <div class="noty" id="noty-${i}">loading…</div>
</section>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rusalka library review</title>
<link rel="icon" href="../icons/32.png" sizes="32x32">
<style>
  body { font: 16px/1.4 system-ui, sans-serif; margin: 0 auto; max-width: 1100px; padding: 16px; background: #fff; color: #222; }
  section { border-top: 1px solid #ccc; padding: 12px 0; }
  h2 { margin: 0 0 4px; } small { font-weight: normal; color: #666; }
  .meta { margin: 2px 0; color: #444; font-size: 14px; }
  button { font-size: 16px; padding: 4px 14px; margin: 6px 0; }
  .noty svg { max-width: 100%; height: auto; }
</style>
</head>
<body>
<h1>Library review – ${hotove.length} songs</h1>
<p>Listen to each song (melody with quiet chords) and compare it with the score. Generated by <code>npm run library</code>.</p>
${radky}
<script src="../vendor/verovio-toolkit-wasm.js"></script>
<script>
const PISNE = ${JSON.stringify(data)};
let ctx = null, hraje = null;
function stop() {
  if (!hraje) return;
  for (const o of hraje.osc) try { o.stop(); } catch {}
  hraje.tlacitko.textContent = '▶ Play'; clearTimeout(hraje.konec); hraje = null;
}
function ton(midi, start, delka, hlasitost, typ) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = typ; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
  g.gain.setValueAtTime(0, start); g.gain.linearRampToValueAtTime(hlasitost, start + 0.02);
  g.gain.setTargetAtTime(0, start + Math.max(0.05, delka - 0.05), 0.03);
  o.connect(g).connect(ctx.destination); o.start(start); o.stop(start + delka + 0.3);
  return o;
}
function hraj(i, tlacitko) {
  const byla = hraje && hraje.i === i;
  stop();
  if (byla) return;
  ctx ||= new AudioContext();
  const p = PISNE[i], q = 60 / p.tempo, t0 = ctx.currentTime + 0.1, osc = [];
  for (const n of p.noty) for (const m of n.m) osc.push(ton(m, t0 + n.t * q, n.d * q, 0.18, 'triangle'));
  for (const a of p.akordy) for (const m of a.m) osc.push(ton(m, t0 + a.t * q, a.d * q, 0.035, 'sine'));
  const konec = Math.max(0, ...p.noty.map(n => n.t + n.d), ...p.akordy.map(a => a.t + a.d)) * q;
  hraje = { i, tlacitko, osc, konec: setTimeout(stop, konec * 1000 + 400) };
  tlacitko.textContent = '■ Stop';
}
document.addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) hraj(Number(b.dataset.i), b); });
async function vykresli() {
  let tk;
  try { tk = new verovio.toolkit(); } catch { setTimeout(vykresli, 100); return; }   // WASM not ready yet
  tk.setOptions({ pageWidth: 2100, scale: 40, adjustPageHeight: true, breaks: 'auto', header: 'none', footer: 'none', mnumInterval: 1 });
  for (const [i, p] of PISNE.entries()) {
    const el = document.getElementById('noty-' + i);
    try {
      const xml = await (await fetch(p.soubor)).text();
      tk.loadData(xml);
      el.innerHTML = Array.from({ length: tk.getPageCount() }, (_, s) => tk.renderToSVG(s + 1)).join('');
    } catch (e) { el.textContent = 'cannot render: ' + e.message; }
  }
}
vykresli();
</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------- CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const koren = new URL('../', import.meta.url);
  const { index, chyby } = await postavKnihovnu({ zdroj: new URL('library/', koren), cil: new URL('build/library/', koren) });
  for (const c of chyby) console.log('- ' + c);
  console.log(`build/library: ${index.length} songs, ${chyby.length} errors`);
  if (chyby.length) process.exit(1);
}
