// Dev server: static files from static/, samples from songs/, the song library from build/library/ (npm run library)
// under library/ and the skill zips from build/ (npm run skills) under helper/, as on the website, at
// http://localhost:8765 (Web MIDI and the folder need a secure context – localhost counts).
// ./run_dev.sh picks a free port, builds what is missing and opens the browser. Does nothing else; data live in the browser or in the chosen folder.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UVODY, stranka, mapaWebu } from './uvod.mjs';

const KOREN = fileURLToPath(new URL('..', import.meta.url));
const TYPY = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.musicxml': 'application/vnd.recordare.musicxml+xml', '.xml': 'application/xml',
  '.mxl': 'application/vnd.recordare.musicxml', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.zip': 'application/zip', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const port = Number(process.env.PORT || 8765);

createServer(async (req, res) => {
  try {
    let cesta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    // the introduction pages and the sitemap are generated (tools/uvod.mjs), fresh on every request
    const uvod = UVODY.find(u => cesta === `/${u.slug}/` || cesta === `/${u.slug}/index.html`);
    if (uvod || cesta === '/sitemap.xml') {
      res.writeHead(200, { 'Content-Type': uvod ? TYPY['.html'] : TYPY['.xml'], 'Cache-Control': 'no-store' });
      res.end(uvod ? stranka(uvod.kod) : mapaWebu());
      return;
    }
    if (cesta.endsWith('/')) cesta += 'index.html';
    const helper = cesta.startsWith('/helper/');
    const zaklad = cesta.startsWith('/songs/') ? KOREN : helper || cesta.startsWith('/library/') ? join(KOREN, 'build') : join(KOREN, 'static');
    const soubor = normalize(join(zaklad, helper ? cesta.slice('/helper'.length) : cesta));
    if (!soubor.startsWith(zaklad)) throw Object.assign(new Error('outside'), { code: 'ENOENT' });
    if (!(await stat(soubor)).isFile()) throw Object.assign(new Error('not a file'), { code: 'ENOENT' });
    res.writeHead(200, { 'Content-Type': TYPY[extname(soubor).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(soubor));
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(e.code === 'ENOENT' ? 'not found' : 'error');
  }
}).listen(port, '127.0.0.1', () => console.log(`Rusalka: http://localhost:${port}`));
