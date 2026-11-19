// Duet mode: one child plays the melody (staff 1), the other a bass line from the chords (staff 2), both with the right
// hand at one piano. The piano sends a single stream of notes, so who played what is told by the note's staff, and for
// a wrong key by the part of the keyboard (the boundary between bass and melody).
import { tonyAkordu } from './song.js';
import { doprovodVeStylu } from './extras.js';

/** can a bass be made? (at least one chord symbol the app understands) */
export const maAkordyProDvojici = pisen => (pisen?.takty || []).some(t => (t.akordy || []).some(a => tonyAkordu(a.znacka)));

/** melody unchanged + left hand "Long bass notes": the chord root for the whole bar, split at a chord change */
export const modelProDvojici = pisen => doprovodVeStylu(pisen, 'basy');

/** keyboard boundary: halfway between the highest bass note and the lowest melody note (C4 if one of the staves is missing) */
export function hraniceDvojice(noty) {
  const m = noty.filter(n => n.staff === 1).map(n => n.pitch), b = noty.filter(n => n.staff === 2).map(n => n.pitch);
  if (!m.length || !b.length) return 60;
  return (Math.max(...b) + Math.min(...m)) / 2;
}

/** stars the same as for a single player; in Find the notes at least one */
export function hvezdyZPodilu(podil, rezim) {
  const hv = podil >= 0.95 ? 3 : podil >= 0.8 ? 2 : podil >= 0.5 ? 1 : 0;
  return rezim === 'cekam' ? Math.max(1, hv) : hv;
}

/**
 * One player's result from their staff: in Find the notes the ratio of notes to notes + mistakes, otherwise hit notes
 * (with a record) out of all. A wrong key at the boundary and above belongs to the melody. Player without notes on the staff → null.
 */
export function vysledekHrace({ noty, zaznam, chybneStisky, rezim, staff, hranice }) {
  const moje = noty.filter(n => n.staff === staff);
  if (!moje.length) return null;
  const chyby = (chybneStisky || []).filter(c => (staff === 1 ? c.pitch >= hranice : c.pitch < hranice)).length;
  const pocet = moje.length;
  const trefy = rezim === 'cekam' ? pocet : moje.filter(n => zaznam.has(n.id)).length;
  const podil = rezim === 'cekam' ? pocet / (pocet + chyby) : trefy / pocet;
  return { pocet, trefy, chyby, podil, hvezdy: hvezdyZPodilu(podil, rezim) };
}
