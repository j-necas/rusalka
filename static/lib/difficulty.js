// Estimate of a song's difficulty from its notes (for sorting the library). A pure function over the model from song.js.
import { zlomek, vysky, alterVTonine, metrum } from './song.js';
import { t } from './texts.js';

/**
 * → { stupen: 1|2|3, nazev: 'snadná'|'střední'|'těžší', body, duvody: string[] } (nazev and duvody in the app language)
 * Points add up: melody range, shortest notes and dotted rhythm, accidentals outside the key signature, large leaps,
 * tempo, key signature, chords and left hand, song length.
 */
export function obtiznost(pisen) {
  const noty = pisen.takty.flatMap(t => t.noty || []);
  const tony = noty.flatMap(n => vysky(n.t));
  const duvody = [];
  let body = 0;
  if (!tony.length) return { stupen: 1, nazev: t('cviceni.obtiznost.1'), body: 0, duvody: [] };
  const midi = tony.map(v => v.midi);
  const rozsah = Math.max(...midi) - Math.min(...midi);
  if (rozsah > 12) { body += 2; duvody.push(t('cviceni.obtiznost.velkyRozsah')); } else if (rozsah > 7) body += 1;
  const delky = noty.map(n => zlomek(n.d)).filter(Boolean);
  const nejkratsi = Math.min(...delky);
  if (nejkratsi <= 0.25 + 1e-9) { body += 2; duvody.push(t('cviceni.obtiznost.sestnactiny')); } else if (nejkratsi <= 0.5 + 1e-9) body += 1;
  if (delky.some(q => Math.abs(q * 1.5 - Math.round(q * 1.5)) > 1e-6 && Math.abs(q / 0.75 - Math.round(q / 0.75)) < 1e-6)) {
    body += 1; duvody.push(t('cviceni.obtiznost.tecky'));
  }
  if (delky.some(q => Math.abs(q * 3 - Math.round(q * 3)) < 1e-6 && Math.abs(q * 2 - Math.round(q * 2)) > 1e-6)) {
    body += 1; duvody.push(t('cviceni.obtiznost.trioly'));
  }
  const posuvky = tony.filter(v => v.alter !== alterVTonine(v.krok, pisen.predznamenani || 0)).length;
  if (posuvky > 2) { body += 2; duvody.push(t('cviceni.obtiznost.posuvky')); } else if (posuvky) body += 1;
  const jednohlas = noty.filter(n => vysky(n.t).length === 1).map(n => vysky(n.t)[0].midi);
  let skoky = 0;
  for (let i = 1; i < jednohlas.length; i++) if (Math.abs(jednohlas[i] - jednohlas[i - 1]) > 7) skoky++;
  if (skoky > 3) { body += 2; duvody.push(t('cviceni.obtiznost.skoky')); } else if (skoky) body += 1;
  if (Math.abs(pisen.predznamenani || 0) >= 3) { body += 1; duvody.push(t('cviceni.obtiznost.predznamenani')); }
  if ((pisen.tempo || 0) >= 130) { body += 1; duvody.push(t('cviceni.obtiznost.tempo')); }
  if (noty.some(n => vysky(n.t).length > 1)) { body += 1; duvody.push(t('cviceni.obtiznost.souzvuky')); }
  if (pisen.takty.some(tk => (tk.leva || []).length)) { body += 2; duvody.push(t('cviceni.obtiznost.oberuce')); }
  const met = metrum(pisen.takt);
  const delka = pisen.takty.length * met.delka;
  if (delka > 160) { body += 1; duvody.push(t('cviceni.obtiznost.dlouha')); }
  const stupen = body <= 3 ? 1 : body <= 6 ? 2 : 3;
  return { stupen, nazev: t(`cviceni.obtiznost.${stupen}`), body, duvody };
}
