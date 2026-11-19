// Animals (drawn set C): a 2×2 atlas of expressions and motion timing according to the approved set.
import { POHYB } from '../animals/motion.js';

/** position of an expression in the atlas (background-position with background-size 200 %) */
export const VYRAZY = { idle: '0% 0%', blink: '100% 0%', happy: '0% 100%', wink: '100% 100%' };

/** in how many ms the animal should blink again (random 0–1 within an interval by temperament; sloth and capybara slower) */
export function dalsiMrknuti(id, nahoda = Math.random()) {
  const [od, do_] = POHYB[id]?.interval || [5000, 5000];
  return Math.round(od + (do_ - od) * nahoda);
}

/** how long it keeps its eyes closed and the joy expression */
export const delkaMrknuti = id => POHYB[id]?.mrknuti || 160;
export const delkaRadosti = id => POHYB[id]?.radost || 1100;

// ---------------------------------------------------------------- livelier motion (set v2)
// Port of the set's motion.js: for a species, a kind of motion and a time it returns the shift (px on a 512 px
// canvas), rotation (degrees), stretch and expression. The origin is the centre at 90 % of the height. Unlike the
// gallery there is no base scale of 0.92, so the animals keep the size they have in the app.

/** how long the one-off gestures last (s); 'alive' loops with the species' cycle */
export const DELKA_POHYBU = { happy: 2.2, curious: 1.8, wink: 1.5, blink: 1 };

const mix = (a, b, t) => a + (b - a) * t;
/** smooth (cosine) interpolation between key points [time, value] */
function krivka(body, t) {
  if (t <= body[0][0]) return body[0][1];
  for (let i = 1; i < body.length; i++) {
    if (t <= body[i][0]) {
      const [at, av] = body[i - 1], [bt, bv] = body[i];
      return mix(av, bv, (1 - Math.cos(Math.PI * (t - at) / (bt - at))) / 2);
    }
  }
  return body.at(-1)[1];
}

/** pose of the animal: druh 'alive' | 'blink' | 'wink' | 'curious' | 'happy' | anything else = still */
export function vzorek(id, druh, cas, intenzita = 1) {
  const p = POHYB[id]?.v2;
  let x = 0, y = 0, r = 0, sx = 1, sy = 1, state = 'idle';
  if (p && druh === 'alive') {
    const t = ((cas % p.cycle) + p.cycle) % p.cycle, w = 2 * Math.PI * t / p.cycle;
    y = -p.breathe * (1 - Math.cos(w)); r = p.sway * Math.sin(w); x = p.sway * 0.9 * Math.sin(2 * w);
    sx = 1 + 0.008 * (1 - Math.cos(w)); sy = 1 + 0.012 * (1 - Math.cos(w));
    const b = p.cycle * 0.18;
    if (t >= b && t < b + p.blink) state = 'blink';
    if (p.double && t >= b + p.blink + 0.11 && t < b + p.blink * 2 + 0.11) state = 'blink';
    const q = t / p.cycle;
    if (q > 0.46 && q < 0.64) { const a = Math.sin((q - 0.46) / 0.18 * Math.PI); r += p.tilt * 0.32 * a; x += 3 * a; }
    if (q > 0.75 && q < 0.83) state = p.double ? 'wink' : 'blink';
    if (id === 'tucnak') x += 3.5 * Math.sin(2 * w);
    if (id === 'axolotl') { r += 1.1 * Math.sin(2 * w); y -= 2 * Math.sin(w) ** 2; }
  } else if (p && druh === 'blink') {
    if ((cas >= 0.08 && cas < 0.08 + p.blink) || (cas >= 0.30 + p.blink && cas < 0.30 + p.blink * 2)) state = 'blink';
    y = krivka([[0, 0], [0.18, 3], [0.48, -2], [0.85, 0]], cas); r = krivka([[0, 0], [0.20, -1.5], [0.54, 1], [0.85, 0]], cas);
  } else if (p && druh === 'wink') {
    if (cas >= 0.15 && cas < 1.05) state = 'wink';
    if (cas >= 1.16 && cas < 1.16 + p.blink) state = 'blink';
    r = krivka([[0, 0], [0.14, -p.tilt * 0.25], [0.48, p.tilt * 0.65], [0.9, p.tilt * 0.45], [1.4, 0]], cas);
    x = krivka([[0, 0], [0.45, 6], [0.85, 4], [1.4, 0]], cas); y = krivka([[0, 0], [0.45, -5], [1.4, 0]], cas);
    sx = krivka([[0, 1], [0.5, 1.025], [1.4, 1]], cas); sy = krivka([[0, 1], [0.5, 1.025], [1.4, 1]], cas);
  } else if (p && druh === 'curious') {
    r = krivka([[0, 0], [0.20, -p.tilt * 0.3], [0.62, p.tilt], [1.04, p.tilt], [1.40, -p.tilt * 0.28], [1.8, 0]], cas);
    x = krivka([[0, 0], [0.60, 5], [1.08, 5], [1.8, 0]], cas); y = krivka([[0, 0], [0.6, -4], [1.1, -4], [1.8, 0]], cas);
    sy = krivka([[0, 1], [0.65, 1.035], [1.8, 1]], cas); sx = krivka([[0, 1], [0.65, 0.985], [1.8, 1]], cas);
    if (cas >= 1.13 && cas < 1.13 + p.blink) state = 'blink';
  } else if (p && druh === 'happy') {
    y = krivka([[0, 0], [0.18, 9], [0.46, -p.hop], [0.78, 5], [1.07, -p.hop * 0.55], [1.38, 2], [1.65, 0], [2.2, 0]], cas);
    r = krivka([[0, 0], [0.18, -2], [0.48, -p.tilt * 0.55], [0.8, 2], [1.1, p.tilt * 0.45], [1.5, -1], [1.85, 0]], cas);
    sx = krivka([[0, 1], [0.18, 1 + (1 - p.squash) * 0.7], [0.46, 0.978], [0.78, 1 + (1 - p.squash) * 0.6], [1.07, 0.987], [1.4, 1.015], [1.8, 1]], cas);
    sy = krivka([[0, 1], [0.18, p.squash], [0.46, 1.035], [0.78, p.squash + 0.015], [1.07, 1.02], [1.4, 0.992], [1.8, 1]], cas);
    if (cas >= 0.18 && cas < 1.68) state = 'happy'; else if (cas >= 1.68 && cas < 1.97) state = 'wink'; else if (cas >= 1.99 && cas < 2.1) state = 'blink';
  }
  const k = v => v * intenzita + 0;                 // + 0 turns -0 into 0
  return { x: k(x), y: k(y), rotation: k(r), sx: 1 + (sx - 1) * intenzita, sy: 1 + (sy - 1) * intenzita, state };
}
