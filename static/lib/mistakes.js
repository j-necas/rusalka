// Mistakes shown in the score: which note a wrong press belongs to, where its "ghost" goes on the staff,
// and the grouped list for the review.
import { zMidi, alterVTonine } from './song.js';

const PISMENA = 'CDEFGAB';
const PC = [0, 2, 4, 5, 7, 9, 11];
const MAX_POLOHA = 10; // three ledger lines beyond the staff
const MAX_VYSEK = 3;

/** The note of a step a wrong press belongs to: nearest pitch, a tie goes to the lower one. */
export function notaProChybu(noty, pitch) {
  let nej = null;
  for (const n of noty) {
    const d = Math.abs(n.pitch - pitch);
    if (!nej || d < nej.d || (d === nej.d && n.pitch < nej.n.pitch)) nej = { n, d };
  }
  return nej.n;
}

/**
 * Diatonic step (C0 = 0, one per letter) of a note written with the letter pname ('c'…'b') that sounds as pitch:
 * the octave comes from the pitch, so B#3 and Cb4 get their own letter's step. null when the letter is unknown.
 */
export function stupenNoty(pname, pitch) {
  const i = typeof pname === 'string' && pname.length === 1 ? PISMENA.indexOf(pname.toUpperCase()) : -1;
  if (i < 0 || !Number.isFinite(pitch)) return null;
  return i + 7 * (Math.round((pitch - PC[i]) / 12) - 1);
}

/**
 * Staff position of a wrong pitch (diatonic steps from the middle line, + = up), measured from the note it belongs
 * to: cil = { stupen: the target's diatonic step (stupenNoty), poloha: the target's own staff position }, so the clef
 * never matters. predznamenani = the key valid at the target (fifths); null/undefined = unknown → spelt with sharps,
 * ♯/♭ shown when altered, never ♮. Clamped to three ledger lines (mimo 'nahoru'/'dolu').
 */
export function polohaDucha(pitch, predznamenani, cil) {
  const znama = predznamenani != null;
  const nazev = zMidi(pitch, predznamenani || 0); // e.g. 'F#4', 'Bb4'
  const krok = nazev[0];
  const alter = nazev[1] === '#' ? 1 : nazev[1] === 'b' ? -1 : 0;
  const okt = parseInt(nazev.slice(alter ? 2 : 1), 10);
  const surova = cil.poloha + PISMENA.indexOf(krok) + 7 * okt - cil.stupen;
  const poloha = Math.max(-MAX_POLOHA, Math.min(MAX_POLOHA, surova));
  const vKlici = znama ? alterVTonine(krok, predznamenani) : 0;
  const posuvka = alter === vKlici || (!znama && !alter) ? null : alter === 1 ? '♯' : alter === -1 ? '♭' : '♮';
  const mimo = poloha !== surova ? (surova > 0 ? 'nahoru' : 'dolu') : null;
  return { poloha, posuvka, mimo };
}

/** Wrong presses grouped per note (with the note's bar): distinct pitches in press order (max 3), sorted by the note's time. */
export function chybyKPrehledu(chybneStisky, noty) {
  const podleId = new Map(noty.map(n => [n.id, n]));
  const skupiny = new Map();
  for (const s of chybneStisky) {
    const n = podleId.get(s.nota);
    if (!n) continue;
    let g = skupiny.get(s.nota);
    if (!g) skupiny.set(s.nota, g = { nota: s.nota, takt: n.takt, staff: n.staff, vysky: [], ms: n.ms });
    if (!g.vysky.includes(s.pitch) && g.vysky.length < MAX_VYSEK) g.vysky.push(s.pitch);
  }
  return [...skupiny.values()].sort((a, b) => a.ms - b.ms)
    .map(({ nota, takt, staff, vysky }) => ({ nota, takt, staff, vysky }));
}
