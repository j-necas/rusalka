// Player pictures: animated animals and Rusalka, plus five musical illustrations, all offered to everybody.
import { OBRAZKY, obrazekProfilu } from '../lib/profiles.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The picture and expression in the atlas are set by CSS (data-zvire, data-vyraz).
const ANIMOVANE = new Set([...OBRAZKY.dite, 'rusalka']);

const OBRAZKY_DOSPELI = new Set(OBRAZKY.dospely);
// unknown picture → the initial of the name in the player's colour
const inicial = (c, jmeno) => `<svg viewBox="0 0 100 100" aria-hidden="true"><text x="50" y="54" text-anchor="middle" dominant-baseline="central" font-family="'Atkinson Hyperlegible Next', sans-serif" font-weight="800" font-size="70" fill="${c}">${esc((String(jmeno || '').trim()[0] || '?').toUpperCase())}</text></svg>`;

/**
 * player picture (HTML): an animated avatar from its atlas, an illustration in an SVG (so the avatar size rules apply),
 * or the initial; paleta = { tmava, ... } from profiles.js
 */
export function obrazekHrace(profil, paleta) {
  const o = obrazekProfilu(profil?.obrazek);
  if (ANIMOVANE.has(o)) return `<span class="zvire" data-zvire="${esc(o)}" data-vyraz="idle" aria-hidden="true"></span>`;
  if (OBRAZKY_DOSPELI.has(o)) return `<svg viewBox="0 0 100 100" aria-hidden="true"><image href="pictures/${o}.webp" width="100" height="100"/></svg>`;
  return inicial(paleta?.tmava || '#24476B', profil?.jmeno);
}
