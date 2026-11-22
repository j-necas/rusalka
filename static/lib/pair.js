// Duet mode: one child plays the melody (staff 1), the other a bass line from the chords (staff 2), both with the right
// hand at one piano. The piano sends a single stream of notes, so who played what is told by the note's staff, and for
// a wrong key by the part of the keyboard (the boundary between bass and melody).
import { tonyAkordu } from './song.js';
import { doprovodVeStylu } from './extras.js';
import { hvezdyZPodilu, podilZasahu } from './practice.js';
import { REZIM, zlepsiVysledek } from './game.js';
import { t } from './texts.js';

export { hvezdyZPodilu };

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

/**
 * One player's result from their staff. A wrong key at the boundary and above belongs to the melody.
 * A shared note counts for both staves. Player without notes on the staff → null.
 */
export function vysledekHrace({ noty, zaznam, chybneStisky, rezim, staff, hranice }) {
  const moje = noty.filter(n => n.staff === staff || n.souzvuk?.some(x => x.staff === staff));
  if (!moje.length) return null;
  const chyby = (chybneStisky || []).filter(c => (staff === 1 ? c.pitch >= hranice : c.pitch < hranice)).length;
  const pocet = moje.length;
  const trefy = rezim === REZIM.CEKAM ? pocet : moje.filter(n => zaznam.has(n.id)).length;
  const podil = podilZasahu(trefy, pocet, chyby);
  return { pocet, trefy, chyby, podil, hvezdy: hvezdyZPodilu(podil, rezim) };
}

/** one player's sentence after a duet ('Melodie: všech 8 not bez chyby!') */
function vetaHrace(part, v, rezim) {
  const Part = part === 'bas' ? 'Bas' : 'Melodie';
  if (!v) return t('app.dvojice.nehrajes', { part: Part });
  if (rezim !== REZIM.TEMPO) return t(v.chyby ? 'app.dvojice.vedle' : 'app.dvojice.bezChyby', { part: Part, n: v.pocet, chyby: v.chyby });
  return t(v.chyby ? 'app.dvojice.vcasVedle' : 'app.dvojice.vcas', { part: Part, a: v.trefy, n: v.pocet, chyby: v.chyby });
}

/**
 * Both players' results after a duet; each child's own stars (vysledekHrace) are stored per mode under the song's
 * `dvojice`, the solo stars stay. A section is not stored. dvojice = { melodie, bas } player ids; vysledky = { [id]:
 * that player's results for the song }. → { hraci: [{ part, id, v, tr, veta }] (bass first), cisti (nobody erred),
 * zapisy: { [id]: the player's new results for the song } }
 */
export function vyhodnotDvojici({ noty, zaznam, chybneStisky, rezim, hranice, dvojice, usek = null, vysledky = {} }) {
  const zapisy = {};
  const hraci = [['bas', 2, dvojice.bas, dvojice.melodie, 'b'], ['melodie', 1, dvojice.melodie, dvojice.bas, 'a']]
    .map(([part, staff, id, s, tr]) => {
      const v = vysledekHrace({ noty, zaznam, chybneStisky, rezim, staff, hranice });
      if (v && !usek) {
        const vs = zapisy[id] || vysledky[id] || {};
        const { vysledek } = zlepsiVysledek(vs.dvojice?.[rezim], v.hvezdy, v.podil);
        zapisy[id] = { ...vs, dvojice: { ...vs.dvojice, [rezim]: { ...vysledek, part, s } } };
      }
      return { part, id, v, tr, veta: vetaHrace(part, v, rezim) };
    });
  return { hraci, zapisy, cisti: hraci.every(x => !x.v || (!x.v.chyby && x.v.trefy === x.v.pocet)) };
}
