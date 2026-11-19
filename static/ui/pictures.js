// Player pictures: cartoon animals (set C, with expressions for blinking and joy) and six illustrations meant for
// adults (static/pictures/<id>.webp), both offered to everybody.
import { OBRAZKY, obrazekProfilu } from '../lib/profiles.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// animals: raster atlas of expressions (static/animals/<id>.webp); the picture and expression are set by CSS (data-zvire, data-vyraz)
const ZVIRATA = new Set(OBRAZKY.dite);

const OBRAZKY_DOSPELI = new Set(OBRAZKY.dospely);
// unknown picture → the initial of the name in the player's colour
const inicial = (c, jmeno) => `<svg viewBox="0 0 100 100" aria-hidden="true"><text x="50" y="54" text-anchor="middle" dominant-baseline="central" font-family="'Atkinson Hyperlegible Next', sans-serif" font-weight="800" font-size="70" fill="${c}">${esc((String(jmeno || '').trim()[0] || '?').toUpperCase())}</text></svg>`;

/**
 * player picture (HTML): an animal from its atlas, an illustration in an SVG (so every avatar size rule for svg applies),
 * or the initial; paleta = { tmava, ... } from profiles.js
 */
export function obrazekHrace(profil, paleta) {
  const o = obrazekProfilu(profil?.obrazek);
  if (ZVIRATA.has(o)) return `<span class="zvire" data-zvire="${esc(o)}" data-vyraz="idle" aria-hidden="true"></span>`;
  if (OBRAZKY_DOSPELI.has(o)) return `<svg viewBox="0 0 100 100" aria-hidden="true"><image href="pictures/${o}.webp" width="100" height="100"/></svg>`;
  return inicial(paleta?.tmava || '#24476B', profil?.jmeno);
}
