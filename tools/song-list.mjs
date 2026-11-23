// List of sample songs for the web: songs/index.json = [{ soubor, nazev, police, stupen, autor }] (the web has no server to
// list the folder). The app shows the samples as part of the library: on their shelf, with their difficulty.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { xmlZBajtu, nazevZXml, jeNota } from '../static/lib/files.js';
import { zMusicXml } from '../static/lib/song.js';
import { obtiznost } from '../static/lib/difficulty.js';
import { policeSouboru } from '../static/lib/library.js';

globalThis.DOMParser ??= DOMParser;                      // zMusicXml needs it (built into the browser)
const D = new URL('../songs/', import.meta.url);
const texty = JSON.parse(readFileSync(new URL('lyrics.json', D), 'utf8'));
const seznam = [];
for (const soubor of readdirSync(D).filter(jeNota).sort((a, b) => a.localeCompare(b, 'cs'))) {
  const xml = await xmlZBajtu(soubor, readFileSync(new URL(encodeURIComponent(soubor), D)));
  const police = policeSouboru(soubor);
  if (!police) throw new Error(`${soubor}: no shelf in POLICE_UKAZEK (static/lib/library.js)`);
  const model = zMusicXml(xml);
  const polozka = { soubor, nazev: nazevZXml(xml, soubor), police, stupen: obtiznost(model).stupen, autor: model.autor || '' };
  const text = texty[soubor];
  if (text) Object.assign(polozka, { jazyk: text.jazyk, slova: text.slova, variantyTextu: text.variantyTextu });
  seznam.push(polozka);
}
writeFileSync(new URL('index.json', D), JSON.stringify(seznam, null, 1) + '\n');
console.log(`songs/index.json: ${seznam.length} songs`);
