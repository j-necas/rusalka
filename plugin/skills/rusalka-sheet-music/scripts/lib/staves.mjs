// Finds staves in a page image and makes enlarged crops of the lines with helper lines and note names.
// resvg both decodes and draws the image (embedded in SVG), so no other library is needed.
import { Resvg } from '@resvg/resvg-js';
import { existsSync } from 'node:fs';

// Loading all system fonts takes several seconds on every render – one font with Czech characters is enough.
const PISMA = ['/System/Library/Fonts/Supplemental/Arial.ttf', '/Library/Fonts/Arial.ttf', 'C:\\Windows\\Fonts\\arial.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/TTF/DejaVuSans.ttf', '/usr/share/fonts/dejavu/DejaVuSans.ttf'];
const soubor = PISMA.find(f => existsSync(f));
/** font options for resvg: one font if we find it, otherwise the system fonts (slower) */
export const PISMO = soubor ? { loadSystemFonts: false, fontFiles: [soubor], defaultFontFamily: soubor.includes('DejaVu') ? 'DejaVu Sans' : 'Arial' }
  : { loadSystemFonts: true };

/** image size and type from the file header (PNG, JPEG, GIF; sheet.mjs converts WebP and HEIC beforehand) */
export function rozmery(b) {
  const u32be = i => b.readUInt32BE(i), u16be = i => b.readUInt16BE(i);
  if (b.length > 24 && b.toString('ascii', 1, 4) === 'PNG') return { w: u32be(16), h: u32be(20), mime: 'image/png' };
  if (b.length > 10 && b.toString('ascii', 0, 3) === 'GIF') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8), mime: 'image/gif' };
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: u16be(i + 7), h: u16be(i + 5), mime: 'image/jpeg' };
      i += 2 + u16be(i + 2);
    }
  }
  throw new Error('neznámý formát obrázku (umím PNG, JPEG a GIF)');
}

const obrazekSvg = (b, r, sirka, vyska, viewBox, navic = '', uhel = 0) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${sirka}" height="${vyska}"`
  + ` viewBox="${viewBox}"><rect x="-1e5" y="-1e5" width="2e5" height="2e5" fill="#fff"/>`
  + `<g transform="rotate(${-uhel})"><image width="${r.w}" height="${r.h}" xlink:href="data:${r.mime};base64,${b.toString('base64')}"/></g>${navic}</svg>`;

/** image → RGBA pixels scaled down to at most `max` px */
function pixely(b, r, max = 2400) {
  const k = Math.min(1, max / Math.max(r.w, r.h));
  const sirka = Math.round(r.w * k), vyska = Math.round(r.h * k);
  const img = new Resvg(obrazekSvg(b, r, sirka, vyska, `0 0 ${r.w} ${r.h}`), { font: { loadSystemFonts: false } }).render();
  return { w: img.width, h: img.height, data: img.pixels, k: r.w / img.width };
}

/**
 * Staves on a page → [{ linky: [y × 5], s: spacing, uhel }] in original coordinates; `linky` holds for x = 0
 * (on a tilted page a line drops by tan(uhel) per pixel). Method: thin horizontal strokes (a dark pixel with a dark
 * neighbour left or right and light above and below – not a frame, text or notes), the tilt with the sharpest row
 * profile, the share of strokes along the tilted rows, peaks = lines, five lines with equal spacing = a staff.
 */
export function najdiOsnovy(b, r = rozmery(b)) {
  const { w, h, data: d, k } = pixely(b, r);
  const jas = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) jas[i] = (d[4 * i] + d[4 * i + 1] + d[4 * i + 2]) / 3;
  const vzorek = [];
  for (let i = 0; i < jas.length; i += 53) vzorek.push(jas[i]);
  vzorek.sort((a, c) => a - c);
  const prah = vzorek[Math.floor(vzorek.length * 0.6)] - 25;          // a bit darker than the paper (grey lines too)
  const tmave = i => jas[i] < prah;
  const tah = new Uint8Array(w * h), o = 3;
  for (let y = o; y < h - o; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (tmave(i) && (tmave(i - 1) || tmave(i + 1)) && !tmave(i - o * w) && !tmave(i + o * w)) tah[i] = 1;
  }
  let uhel = 0, nej = -1;
  const okraj = Math.ceil(w * 0.05) + 2;
  for (let a = -2.5; a <= 2.501; a += 0.1) {
    const t = Math.tan(a * Math.PI / 180), prof = new Float64Array(h + 2 * okraj);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x += 2) if (tah[y * w + x]) prof[Math.round(y - x * t) + okraj]++;
    let skore = 0;
    for (const v of prof) skore += v * v;
    if (skore > nej + 1e-9) { nej = skore; uhel = a; }
  }
  const t = Math.tan(uhel * Math.PI / 180);
  const p = new Float32Array(h);
  for (let y0 = 0; y0 < h; y0++) {
    let n = 0;
    for (let x = 0; x < w; x++) { const y = Math.round(y0 + x * t); if (y >= 0 && y < h && tah[y * w + x]) n++; }
    p[y0] = n / w;
  }
  const hledej = minPodil => {
    const linky = [];
    for (let y = 0; y < h; y++) {
      if (p[y] < minPodil) continue;
      const posl = linky[linky.length - 1];
      if (posl && y - posl.y1 <= 1) { posl.y1 = y; posl.v = Math.max(posl.v, p[y]); } else linky.push({ y0: y, y1: y, v: p[y] });
    }
    linky.forEach(l => { l.y = (l.y0 + l.y1) / 2; });
    const najdi = (y, tol) => linky.findIndex(l => Math.abs(l.y - y) <= tol);
    const osnovy = [];
    for (let i = 0; i < linky.length; i++) {
      let nalez = null;
      // spacing from the outer lines (i and l), the inner three are looked up – stray peaks between them are skipped
      for (let l = i + 4; l <= i + 8 && l < linky.length && !nalez; l++) {
        const m = (linky[l].y - linky[i].y) / 4;
        if (m < 3 || m > h / 15) continue;
        const tol = Math.max(1.2, m * 0.2);
        const idx = [i];
        for (let kk = 1; kk <= 3; kk++) {
          const n = najdi(linky[i].y + kk * m, tol);
          if (n < 0 || n <= idx[idx.length - 1] || n >= l) break;
          idx.push(n);
        }
        if (idx.length === 4) nalez = [...idx, l];
      }
      if (!nalez) continue;
      const ys = nalez.map(n => linky[n].y);
      osnovy.push({ linky: ys.map(y => y * k), s: (ys[4] - ys[0]) / 4 * k, uhel });
      while (i + 1 < linky.length && linky[i + 1].y <= ys[4]) i++;
    }
    return osnovy;
  };
  let osnovy = hledej(0.1);
  if (!osnovy.length) osnovy = hledej(0.06);
  // staves on one page have similar spacing; this rules out five lines of text with equal gaps
  if (osnovy.length >= 3) {
    const med = [...osnovy].map(x => x.s).sort((a, c) => a - c)[Math.floor(osnovy.length / 2)];
    osnovy = osnovy.filter(x => Math.abs(x.s - med) <= med * 0.3);
  }
  return osnovy;
}

const NAZVY = ['C', 'D', 'E', 'F', 'G', 'A', 'H'];
/** note name at step `st` above the bottom line (0 = bottom line); treble clef E4, bass clef G2 */
function nazevStupne(st, klic) {
  const i = st + (klic === 'basovy' ? 4 + 2 * 7 : 2 + 4 * 7);
  return NAZVY[((i % 7) + 7) % 7] + Math.floor(i / 7);
}

/**
 * Enlarged crops of one staff (line spacing ~26 px, wide lines split into overlapping parts) with dashed
 * helper lines and note names. → [{ png: Buffer, cast, casti }]
 */
export function vyrezy(b, osnova, { r = rozmery(b), klic = 'houslovy', linky = true } = {}) {
  const c = Math.cos((osnova.uhel || 0) * Math.PI / 180);
  const spod = osnova.linky[4] * c, vrch = osnova.linky[0] * c, s = osnova.s * c;
  const y0 = Math.max(0, vrch - 5 * s), y1 = Math.min(r.h, spod + 6.5 * s);
  const k = Math.min(5, Math.max(0.6, 26 / s));
  const sirka = 1500 / k, prekryv = sirka * 0.07;
  const dilu = Math.max(1, Math.ceil((r.w - prekryv) / (sirka - prekryv)));
  const krok = (r.w - sirka) / Math.max(1, dilu - 1);
  const out = [];
  for (let j = 0; j < dilu; j++) {
    const sx = dilu === 1 ? 0 : Math.round(j * krok), sw = dilu === 1 ? r.w : Math.round(sirka);
    let navic = '';
    if (linky) {
      for (let st = -6; st <= 14; st++) {
        const y = spod - st * s / 2;
        if (y < y0 || y > y1) continue;
        const barva = st % 2 === 0 ? 'rgb(220,0,0)' : 'rgb(0,110,255)';
        const v = 7 / k;                                          // ~14 px tall label after scaling
        navic += `<line x1="${sx}" x2="${sx + sw}" y1="${y}" y2="${y}" stroke="${barva}" stroke-opacity="0.55"`
          + ` stroke-width="${1 / k}" stroke-dasharray="${6 / k} ${10 / k}"/>`
          + `<rect x="${sx}" y="${y - v}" width="${30 / k}" height="${2 * v}" fill="#fff" fill-opacity="0.85"/>`
          + `<text x="${sx + 3 / k}" y="${y + 4.5 / k}" font-family="${PISMO.defaultFontFamily || 'Arial'}" font-weight="bold"`
          + ` font-size="${13 / k}" fill="${barva}">${nazevStupne(st, klic)}</text>`;
      }
    }
    const svg = obrazekSvg(b, r, Math.round(sw * k), Math.round((y1 - y0) * k), `${sx} ${y0} ${sw} ${y1 - y0}`, navic, osnova.uhel || 0);
    out.push({ png: new Resvg(svg, { font: PISMO }).render().asPng(), cast: j + 1, casti: dilu });
  }
  return out;
}
