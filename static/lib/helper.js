// Helper (any chat AI: Claude, ChatGPT, …): Rusalka itself has no AI. The parent copies ready-made instructions (and,
// for a summary, the players' results) into a chat, and pastes the helper's text notation back into Rusalka.
// Only the pure logic is here; the window is in app.js.
import { t } from './texts.js';
import { FORMAT } from './format.js';
import { naText } from './notation.js';
import { faktaTydne } from './extras.js';
import { viditelni } from './profiles.js';

/** a short demo video (video/<nazev>.mp4): Czech UI and captions for Czech and Slovak, English otherwise */
export function videoUkazky(kod, nazev = 'ai') {
  const z = `video/${nazev}${['cs', 'sk'].includes(String(kod).toLowerCase().split('-')[0]) ? '.cs' : ''}`;
  return { src: z + '.mp4', poster: z + '.jpg' };
}

/**
 * Instructions to copy into a chat:
 * - 'noty': turn a photo / PDF of sheet music into the text notation,
 * - 'uprava': an easier version of a song (pisen = model; its notation is appended),
 * - 'tyden': write a summary of the week from the results that follow (see vysledkyText).
 */
export function pokyny(druh, { pisen } = {}) {
  if (druh === 'tyden') return t('pomocnik.pokyny.tyden');
  const uvod = t(druh === 'uprava' ? 'pomocnik.pokyny.uprava' : 'pomocnik.pokyny.noty');
  const zapis = druh === 'uprava' && pisen ? `\n\n${t('pomocnik.pokyny.pisen')}\n\n\`\`\`\n${naText(pisen)}\`\`\`` : '';
  return `${uvod}\n\n---\n\n${FORMAT}${zapis}`;
}

/**
 * The players' playing over the last 7 days as compact text for a chat, with instructions for a summary.
 * stav = { profily, statistiky, seznam: [{ soubor, nazev }] }; deleted players are left out.
 */
export function vysledkyText({ profily, statistiky, vysledky, seznam }, ted = Date.now()) {
  const od = ted - 7 * 864e5;
  const nazvy = Object.fromEntries((seznam || []).map(x => [x.soubor, x.nazev]));
  const hvezdicky = n => '★'.repeat(n) + '☆'.repeat(3 - n);
  const bloky = viditelni(profily).map(p => {
    const hlava = t('pomocnik.vysledky.hrac', { jmeno: p.jmeno, kdo: t(p.vek === 'dospely' ? 'pomocnik.vysledky.dospely' : 'pomocnik.vysledky.dite') });
    const radky = [];
    let dny = new Set(), pokusu = 0;
    const polozky = Object.entries(statistiky?.[p.id] || {}).map(([klic, statistika]) => {
      const [soubor, uroven] = [klic.slice(0, klic.lastIndexOf('#')) || klic, klic.slice(klic.lastIndexOf('#') + 1)];
      const F = faktaTydne([{ klic, nazev: nazvy[soubor] || soubor.replace(/\.[^.]+$/, ''), statistika }], [], od, ted + 1, {});
      return { F, soubor, uroven, statistika };
    }).filter(x => x.F.pisne.length).sort((a, b) => b.F.pisne[0].pokusu - a.F.pisne[0].pokusu);
    for (const { F, soubor, uroven, statistika } of polozky) {
      const s = F.pisne[0];
      pokusu += F.pokusu;
      for (const h of statistika.historie || []) if (h.kdy >= od && h.kdy <= ted) dny.add(new Date(h.kdy).toDateString());
      const posledni = (statistika.historie || []).filter(h => h.kdy >= od && h.kdy <= ted).at(-1);
      const hv = vysledky?.[p.id]?.[soubor] || {};
      const kroky = ['cekam', 'pockej', 'tempo'].filter(k => hv[k]?.hvezdy).map(k => `${t('krok.' + k)} ${hvezdicky(hv[k].hvezdy)}`);
      radky.push('- ' + t('pomocnik.vysledky.pisen', {
        nazev: s.nazev, uroven: /^\d+$/.test(uroven) ? t('pomocnik.vysledky.uroven', { n: uroven }) : '',
        pokusu: s.pokusu, cistych: s.cistych, od: s.presnost.zacatek, do: s.presnost.konec, rychlost: s.rychlost.max,
        pred: s.presnost.predTydnem != null ? t('pomocnik.vysledky.pred', { n: s.presnost.predTydnem }) : '',
        krok: posledni?.krok ? t('krok.' + posledni.krok) : '?',
      }) + (kroky.length ? '; ' + t('pomocnik.vysledky.hvezdy', { kroky: kroky.join(', ') }) : '')
        + (s.tezkaMista.length ? '; ' + t('pomocnik.vysledky.tezke', { takty: s.tezkaMista.map(x => x.takty).join(', ') }) : ''));
    }
    if (!radky.length) return `${hlava}\n${t('pomocnik.vysledky.nehral')}`;
    return `${hlava}\n${t('pomocnik.vysledky.dny', { n: dny.size, pokusu })}\n${radky.join('\n')}`;
  });
  return `${t('pomocnik.pokyny.tyden')}\n\n${bloky.join('\n\n')}\n`;
}
