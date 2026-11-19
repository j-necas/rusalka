// The accompaniment the app plays (the computer or the piano over MIDI) when a song has no written left hand: from chord
// symbols according to time signature and tempo – a waltz in 3/4, oom-pah in 2/4, a broken chord in slow songs, a held
// chord at the end. The rhythm patterns are the same as the left-hand styles (STYLY in extras.js), but here they are only
// played, not written into the notes.
import { metrum } from './song.js';
import { STYLY, vzorProTakt } from './extras.js';
import { t } from './texts.js';

const EPS = 1e-6;
/** accompaniment options in settings: auto, original chords on strong beats and all left-hand styles */
// names are read only when rendering (getters) so they are in the app language
export const VZORY_DOPROVODU = [
  { id: 'auto', get nazev() { return t('app.vzor.auto'); } },
  { id: 'jenAkordy', get nazev() { return t('app.vzor.jenAkordy'); } },
  ...STYLY.map(s => ({ id: s.id, get nazev() { return s.nazev; } })),
];

/**
 * Style for a time signature and tempo (quarter beats per minute): slow songs a broken chord, 3/4 and 6/8 a waltz,
 * 2/4 a polka, 4/4 a ballad or polka depending on tempo; other time signatures bass on beat one and chords on the rest.
 */
export function stylPodleTaktu(takt, tempo = 100) {
  const m = metrum(takt);
  const dobaZaMin = tempo / (m.doba || 1);               // 6/8: dotted quarters per minute
  const slozeny = m.beatType === 8 && m.beats % 3 === 0;
  if (slozeny) return dobaZaMin < 56 ? 'ukolebavka' : 'valcik';
  if (m.beats === 3) return dobaZaMin < 88 ? 'ukolebavka' : 'valcik';
  if (m.beats === 2) return dobaZaMin < 66 ? 'ukolebavka' : 'polka';
  if (m.beats === 4) return dobaZaMin < 72 ? 'ukolebavka' : dobaZaMin < 104 ? 'popBalada' : 'polka';
  return 'valcik';                                       // 5/4, 7/8…: vzorProTakt gives bass and chords per beat
}

const BAS_OD = 36, SOUZVUK_OD = 48;                      // bass C2–B2, chord C3–B3 (entirely below the melody from C4)
const nad = (m, pc) => m + (((pc - m) % 12 + 12) % 12 || 12);
/** pitches for a tone's role in the chord (ROLE_TONU from extras.js) */
export function tonyProRoli(role, a) {
  if (!a || role === 'pomlka') return [];
  const bas = BAS_OD + (((a.bas - BAS_OD) % 12) + 12) % 12;
  const interval = d => a.tony.find(pc => (((pc - a.pc) % 12) + 12) % 12 === d);
  const kvinta = [7, 6, 8].map(interval).find(x => x != null);
  const tercie = [4, 3, 2, 5].map(interval).find(x => x != null);
  let souzvuk = [...new Set(a.tony)];
  if (souzvuk.length > 3 && kvinta != null) souzvuk = souzvuk.filter(pc => pc !== kvinta);
  const akord = souzvuk.map(pc => SOUZVUK_OD + (((pc - SOUZVUK_OD) % 12) + 12) % 12).sort((x, y) => x - y);
  switch (role) {
    case 'bas': return [bas];
    case 'kvinta': return [kvinta != null ? nad(bas, kvinta) : bas + 12];
    case 'oktava': return [bas + 12];
    case 'tercie': return [tercie != null ? nad(bas, tercie) : bas];
    case 'souzvuk': return akord;
    case 'akord': return [bas, ...akord];
    default: return [];
  }
}

/** original accompaniment: a chord with bass at the start of the bar, in a long bar also in the middle (without bass) */
function jenAkordy(akordy, takty, konecQ) {
  const udery = [];
  takty.forEach((q, i) => {
    const delka = (takty[i + 1] ?? konecQ) - q;
    udery.push(q);
    if (delka >= 4) udery.push(q + delka / 2);
  });
  const out = [];
  akordy.forEach((a, i) => {
    const doQ = i + 1 < akordy.length ? akordy[i + 1].q : Math.max(konecQ, a.q + 1);
    const body = [a.q, ...udery.filter(u => u > a.q + 0.01 && u < doQ - 0.01)];
    body.forEach((q, k) => {
      const q2 = Math.min(body[k + 1] ?? doQ, doQ);
      out.push({ q, dq: q2 - q, p: tonyProRoli(k % 2 === 0 ? 'akord' : 'souzvuk', a), sila: k % 2 === 0 ? 0.42 : 0.3 });
    });
  });
  return out;
}

/**
 * Chords from notes → accompaniment events [{ q, dq, p: [midi], sila }] (q in quarter beats from the start).
 * akordy: [{ q, pc, bas, tony }] sorted (from render.js), takty: q of bar starts, konecQ: end of the song.
 * The pattern repeats bar by bar, a pickup bar gets the end of the pattern, a tone is split at a chord change, the last
 * bar is one held chord. Nothing plays before the first chord. bezBasu: chords only (the second child plays the bass).
 */
export function doprovodZAkordu({ akordy, takty, konecQ, takt = '4/4', tempo = 100, styl = 'auto', bezBasu = false }) {
  if (!akordy?.length || !takty?.length) return [];
  // in duet mode a child plays the bass: only the chords remain from the accompaniment (bass, fifth and octave gone, chord without bass)
  if (bezBasu) {
    return doprovodZAkordu({ akordy, takty, konecQ, takt, tempo, styl })
      .map(e => ({ ...e, p: e.p.filter(p => p >= SOUZVUK_OD) })).filter(e => e.p.length);
  }
  if (styl === 'jenAkordy') return jenAkordy(akordy, takty, konecQ);
  const id = styl === 'auto' || !STYLY.some(s => s.id === styl) ? stylPodleTaktu(takt, tempo) : styl;
  const vzor = vzorProTakt(id, takt);
  const plna = metrum(takt).delka, P = vzor.delka || plna;
  const akordV = q => { let a = null; for (const x of akordy) { if (x.q <= q + EPS) a = x; else break; } return a; };
  const out = [];
  const pridej = (q, dq, role, sila) => {
    // at a chord change inside a tone the tone is split: the second part already uses the new chord
    const zmeny = akordy.map(a => a.q).filter(x => x > q + EPS && x < q + dq - EPS);
    const body = [q, ...zmeny, q + dq];
    for (let k = 0; k + 1 < body.length; k++) {
      const a = akordV(body[k]);
      const p = tonyProRoli(role, a);
      if (p.length) out.push({ q: body[k], dq: body[k + 1] - body[k], p, sila: k ? sila * 0.85 : sila });
    }
  };
  const posledni = takty.length - 1;
  takty.forEach((q0, ti) => {
    const L = (takty[ti + 1] ?? konecQ) - q0;
    if (L <= EPS) return;
    if (ti === posledni && ti > 0) { pridej(q0, L, 'akord', 0.4); return; }
    const posun = ti === 0 && L < plna - EPS && takty.length > 1 ? plna - L : 0;   // pickup bar: end of the pattern
    const start = ti * plna;
    for (let k = Math.floor(start / P); k * P < start + plna - EPS; k++) {
      for (const e of vzor.udalosti) {
        const a = Math.max(k * P + e.doba, start), b = Math.min(k * P + e.doba + e.delka, start + plna);
        if (b <= a + EPS) continue;
        const od = a - start - posun, doo = Math.min(b - start - posun, L);
        if (od < -EPS || doo <= od + EPS) continue;
        const tezka = Math.abs(od) < EPS;
        const basova = ['bas', 'kvinta', 'oktava', 'akord'].includes(e.tony);
        pridej(q0 + od, doo - od, e.tony, (basova ? 0.4 : 0.3) + (tezka ? 0.05 : 0));
      }
    }
  });
  const prvni = akordy[0].q - EPS;
  return out.filter(e => e.q >= prvni).sort((x, y) => x.q - y.q);
}
