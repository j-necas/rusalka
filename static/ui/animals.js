// Motion of the animals (set C).
// - V13 (static/lib/natural.js): where WebGL works and the animal is at least LOUTKA_MIN px wide, a canvas over the
//   picture shows the original drawing in motion – the eyes look first and the head follows, ears, fur and feathers
//   settle, the lids close, the mouth opens in joy. One shared WebGL canvas draws every animal and each frame is copied
//   into the animal's own 2D canvas.
// - Otherwise (small pictures, no WebGL) the whole picture moves by CSS (shift, rotation, stretch from vzorek() in
//   lib/animals.js; the origin is at 90 % of the height) and data-vyraz switches the expression in the atlas.
// Where: Who is playing, New player and the result live in a loop; elsewhere they now and then blink, at home they
// greet; on hover they look curiously, after finishing they rejoice. While reading notes (the game screen) they stay
// still; nothing moves on a hidden page or with reduced motion.
import { dalsiMrknuti, delkaRadosti, vzorek, DELKA_POHYBU } from '../lib/animals.js';
import { kreslic, nacti, sample, smichej, duration, OKRAJ } from '../lib/natural.js';
import { RIG } from '../animals/v13.js';

const ZIVE = '#kdo, #novy, #vysledek';                  // where the animals live in a loop
const LOUTKA_MIN = 64;                                  // smaller pictures (lists, the top bar) move by CSS
const SNIMEK_LOUTKY = 1000 / 30;                        // the puppets are drawn at most 30× a second
const PRECHOD = 0.4;                                    // s: cross-fade between the loop and a gesture
/** app gesture → motion of the drawing */
const LOUTKA_GESTA = { happy: 'happy', wink: 'wave', curious: 'curious', blink: 'blink' };
const omezeni = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const viditelne = el => el.getClientRects().length > 0 && !el.closest('#hra');

const gesta = new Map();                                // element → { druh, start, loutka } of a one-off gesture
const faze = new WeakMap();                             // element → phase shift of its loop (s), so they don't move in sync
const prechody = new WeakMap();                         // element → { kind, cas, pevny, start } the motion it fades from
let snimekId = null, posledniLoutky = 0;

/** expression for a while (ms), then back to idle – also used without motion (reduced motion) */
export function vyraz(el, v, ms) {
  if (!el) return;
  el.dataset.vyraz = v;
  clearTimeout(el._zpet);
  el._zpet = setTimeout(() => { el.dataset.vyraz = 'idle'; }, ms);
}

// ---------------------------------------------------------------- the original drawing in motion (V13, WebGL)
let kreslicLoutek = null, bezWebGL = false;
const podklady = new Map();                             // animal id → loaded drawing and clean plate, or 'nacita'

/** the shared WebGL renderer; null when WebGL isn't available (then everything moves by CSS) */
function renderer() {
  if (kreslicLoutek || bezWebGL) return kreslicLoutek;
  try {
    kreslicLoutek = kreslic();
    kreslicLoutek.surface.addEventListener('webglcontextlost', () => { bezWebGL = true; kreslicLoutek = null; for (const el of document.querySelectorAll('.zvire.s-loutkou')) sundej(el); });
  } catch { bezWebGL = true; kreslicLoutek = null; }
  return kreslicLoutek;
}

/** the loaded drawing of an animal; null until loaded (starts loading) */
function podklad(id) {
  const o = podklady.get(id);
  if (o) return o === 'nacita' ? null : o;
  const ukol = nacti(id);
  if (!ukol) return null;
  podklady.set(id, 'nacita');
  ukol.then(a => podklady.set(id, a), () => podklady.delete(id));
  return null;
}

/** can this element show the moving drawing now? (starts loading it if needed) */
function muzeLoutka(el) {
  const id = el.dataset.zvire;
  if (!RIG[id] || el.clientWidth < LOUTKA_MIN) return false;
  return !!(renderer() && podklad(id));
}

/** back to the CSS picture */
function sundej(el) {
  el.querySelector(':scope > canvas.loutka')?.remove();
  el.classList.remove('s-loutkou');
  prechody.delete(el);
}

/** draws the animal of el: motion kind at time t (s); returns false when it can't (then CSS takes over) */
function kresliLoutku(el, kind, t, ted) {
  const id = el.dataset.zvire, obr = podklad(id), r = renderer();
  if (!obr || !r) return false;
  let cv = el.querySelector(':scope > canvas.loutka');
  if (!cv) {
    cv = document.createElement('canvas');
    cv.className = 'loutka';
    cv.setAttribute('aria-hidden', 'true');
    el.append(cv);
    el.classList.add('s-loutkou');
    el.style.transform = '';
  }
  const w = Math.min(512, Math.round(el.clientWidth * (1 + 2 * OKRAJ) * (globalThis.devicePixelRatio || 1)));
  if (cv.width !== w) cv.width = cv.height = w;
  let poza = sample(id, kind, t);
  const pr = prechody.get(el);
  if (pr) {                                            // cross-fade from the motion it was in
    const uplynulo = (ted - pr.start) / 1000;
    if (uplynulo >= PRECHOD) prechody.delete(el);
    else poza = smichej(poza, sample(id, pr.kind, pr.pevny ? pr.cas : pr.cas + uplynulo), 1 - uplynulo / PRECHOD);
  }
  r.kresli(cv.getContext('2d'), obr, poza);
  el.dataset.vyraz = poza.lids.every(l => l > 0.5) ? 'blink' : poza.smile > 0.5 ? 'happy' : 'idle';   // as the CSS picture
  return true;
}

// ---------------------------------------------------------------- CSS motion (fallback)
/** pose → CSS transform (the pose is in px of a 512 px canvas) and expression; null = still */
function poza(el, p) {
  if (!p) { el.style.transform = ''; el.dataset.vyraz = 'idle'; return; }
  const k = (el.clientWidth || 0) / 512;
  el.style.transform = `translate(${(p.x * k).toFixed(2)}px, ${(p.y * k).toFixed(2)}px) rotate(${p.rotation.toFixed(2)}deg)`
    + ` scale(${p.sx.toFixed(4)}, ${p.sy.toFixed(4)})`;
  el.dataset.vyraz = p.state;
}

/** everything still: no loops or gestures (reduced motion) */
function vKlidu() {
  for (const el of gesta.keys()) delete el.dataset.pohyb;
  gesta.clear();
  for (const el of document.querySelectorAll('.zvire')) {
    if (el.classList.contains('s-loutkou')) sundej(el);
    if (el.style.transform) poza(el, null);
  }
}

const zije = el => !!el.closest(ZIVE) && viditelne(el);
/** time in the element's own idle loop (s) */
const casSmycky = (el, ted) => { if (!faze.has(el)) faze.set(el, Math.random() * 8); return ted / 1000 + faze.get(el); };

function snimek(ted) {
  snimekId = null;
  if (document.hidden) return;
  if (omezeni()) { vKlidu(); return; }
  const loutky = ted - posledniLoutky >= SNIMEK_LOUTKY;
  if (loutky) posledniLoutky = ted;
  let dal = false;
  for (const [el, g] of gesta) {
    const t = (ted - g.start) / 1000;
    const delka = g.loutka ? duration(el.dataset.zvire, LOUTKA_GESTA[g.druh]) : DELKA_POHYBU[g.druh];
    if (!el.isConnected || t >= delka) {
      gesta.delete(el); delete el.dataset.pohyb;
      if (!el.isConnected) continue;
      if (g.loutka && zije(el)) prechody.set(el, { kind: LOUTKA_GESTA[g.druh], cas: delka, pevny: true, start: ted });   // back into the loop smoothly
      else if (g.loutka) { sundej(el); el.dataset.vyraz = 'idle'; }
      else poza(el, null);
      continue;
    }
    if (g.loutka) { if (loutky && !kresliLoutku(el, LOUTKA_GESTA[g.druh], t, ted)) g.loutka = false; }
    else poza(el, vzorek(el.dataset.zvire, g.druh, t));
    dal = true;
  }
  for (const el of document.querySelectorAll(`:is(${ZIVE}) .zvire`)) {
    if (gesta.has(el) || !viditelne(el)) continue;
    const t = casSmycky(el, ted);
    // puppet: drawn at most 30× a second (in between the canvas keeps its frame); CSS if it can't be drawn
    if ((el.classList.contains('s-loutkou') || muzeLoutka(el)) && (!loutky || kresliLoutku(el, 'alive', t, ted))) { dal = true; continue; }
    poza(el, vzorek(el.dataset.zvire, 'alive', t));
    dal = true;
  }
  if (dal) snimekId = requestAnimationFrame(snimek);
}
const rozhyb = () => { if (snimekId == null && !document.hidden && !omezeni()) snimekId = requestAnimationFrame(snimek); };

function gesto(el, druh) {
  if (!el?.dataset.zvire || omezeni()) return;
  const ted = performance.now(), loutka = muzeLoutka(el);
  // a gesture on a living animal starts from where its loop is, not with a jump to the rest pose
  if (loutka && el.classList.contains('s-loutkou') && !gesta.has(el) && zije(el)) prechody.set(el, { kind: 'alive', cas: casSmycky(el, ted), pevny: false, start: ted });
  if (!loutka && el.classList.contains('s-loutkou')) sundej(el);
  gesta.set(el, { druh, start: ted, loutka });
  el.dataset.pohyb = druh;
  rozhyb();
}

/** joy after finishing: a happy face, a nod and bouncing ears; with reduced motion just the happy face */
export function radost(el) {
  if (!el?.dataset.zvire) return;
  if (omezeni()) vyraz(el, 'happy', delkaRadosti(el.dataset.zvire));
  else gesto(el, 'happy');
}
/** greeting: a nod towards the player and a wink */
export const pozdrav = el => gesto(el, 'wink');
/** curiosity: the head turns and tilts, the ears follow (not restarted while it is running) */
export const zvedavost = el => { if (el && gesta.get(el)?.druh !== 'curious') gesto(el, 'curious'); };

/** starts the motion: loops where the animals live, occasional blinks elsewhere; returns a function that stops it */
export function spustMrkani(koren = document) {
  const kdy = new WeakMap();
  const krok = () => {
    if (document.hidden) return;
    if (omezeni()) { vKlidu(); return; }
    if (koren.querySelector(`:is(${ZIVE}) .zvire`)) rozhyb();     // loops (rozhyb checks visibility per frame)
    const ted = performance.now();
    for (const el of koren.querySelectorAll('.zvire')) {
      if (el.closest(ZIVE) || gesta.has(el) || !viditelne(el)) { kdy.delete(el); continue; }
      const t = kdy.get(el);
      if (t == null) { kdy.set(el, ted + dalsiMrknuti(el.dataset.zvire)); continue; }
      if (ted >= t) { gesto(el, 'blink'); kdy.set(el, ted + dalsiMrknuti(el.dataset.zvire)); }
    }
    // a puppet canvas left on an animal that no longer lives here (e.g. the screen changed) goes back to CSS
    for (const el of koren.querySelectorAll('.zvire.s-loutkou')) if (!gesta.has(el) && !zije(el)) sundej(el);
  };
  const id = setInterval(krok, 250);
  document.addEventListener('visibilitychange', rozhyb);
  return () => { clearInterval(id); document.removeEventListener('visibilitychange', rozhyb); };
}
