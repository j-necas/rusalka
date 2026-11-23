// What to recommend to a player: which step, how fast, when a song counts as "known", the order in For me and what to
// offer after finishing. vys = vysledky[player][file] ({ cekam, pockej, tempo: { hvezdy } }); stat = statistiky[player]
// ({ 'file#level': { posledni, historie: [{ kdy, rezim, rychlost, cisty }] } }).

import { REZIM } from './game.js';

export const KROKY = [REZIM.CEKAM, REZIM.POCKEJ, REZIM.TEMPO];
export const RYCHLOSTI = [60, 80, 100];

export const hotovy = (vys, k) => (vys?.[k]?.hvezdy || 0) >= 3;
const zaznamy = (stat, soubor) => Object.entries(stat || {}).filter(([k]) => k.startsWith(soubor + '#')).map(([, v]) => v);
const historie = (stat, soubor) => zaznamy(stat, soubor).flatMap(z => z?.historie || []);
// step of a history record: new records have "krok"; an old "tempo" record without a step may be either With backing or In rhythm
const krokZaznamu = h => h.krok || (h.rezim === REZIM.CEKAM ? REZIM.CEKAM : null);
const dolu = r => [...RYCHLOSTI].reverse().find(x => x <= r) ?? RYCHLOSTI[0];

/** state of the three steps: hotovo (3 stars), ted (first unfinished), nezacato */
export function stavKroku(vys) {
  const prvni = KROKY.findIndex(k => !hotovy(vys, k));
  return KROKY.map((k, i) => (hotovy(vys, k) ? 'hotovo' : i === prvni ? 'ted' : 'nezacato'));
}

/** steps played at least once but without three stars yet (the tile shows them hatched) */
export const rozehraneKroky = vys => KROKY.map(k => !!vys?.[k] && !hotovy(vys, k));

/** a history record of the whole song (not a section in the loop): older records without od/do count as whole */
const celaPisen = z => {
  const h = z?.historie || [], konec = Math.max(...h.map(x => x.do ?? -Infinity));
  return h.filter(x => x.od == null || (x.od === 0 && x.do === konec));
};
/**
 * highest speed (%) at which the player played the whole song In rhythm cleanly; 0 = never. It is kept in the results
 * (vys.tempo.cistaRychlost); the history (last 30 attempts) is read as well for results saved before that.
 */
export function nejrychlejsiCisty(stat, soubor, vys = null) {
  const zHistorie = zaznamy(stat, soubor).flatMap(celaPisen).filter(h => krokZaznamu(h) === REZIM.TEMPO && h.cisty).map(h => Number(h.rychlost) || 0);
  return Math.max(0, Number(vys?.tempo?.cistaRychlost) || 0, ...zHistorie);
}

export function umim(vys, stat, soubor) {
  return KROKY.every(k => hotovy(vys, k)) && nejrychlejsiCisty(stat, soubor, vys) >= 100;
}

/** { krok, rychlost, umim }: the first unfinished step at the last used speed, otherwise In rhythm one notch faster */
export function doporuceni(vys, stat, soubor) {
  const krok = KROKY.find(k => !hotovy(vys, k));
  if (krok) {
    const posledni = historie(stat, soubor).filter(h => krokZaznamu(h) === krok).sort((a, b) => b.kdy - a.kdy)[0];
    return { krok, rychlost: posledni ? dolu(Number(posledni.rychlost) || 0) : RYCHLOSTI[0], umim: false };
  }
  const n = nejrychlejsiCisty(stat, soubor, vys);
  return n >= 100 ? { krok: REZIM.TEMPO, rychlost: 100, umim: true } : { krok: REZIM.TEMPO, rychlost: RYCHLOSTI.find(r => r > n), umim: false };
}

const posledniHrani = (stat, soubor) => Math.max(0, ...zaznamy(stat, soubor).map(z => z?.posledni || 0));
const stupen = (info, soubor) => info?.[soubor]?.obtiznost?.stupen ?? 99;

/** For me: in progress (most recently played first), not started up to the mastered difficulty + 1, the rest, "I know it" last */
export function proMe(seznam, vysHrace, stat, info) {
  const vys = s => vysHrace?.[s.soubor];
  const umi = s => umim(vys(s), stat, s.soubor);
  const rozehrana = s => !umi(s) && KROKY.some(k => (vys(s)?.[k]?.hvezdy || 0) > 0);
  const zvladnuto = Math.max(0, ...seznam.filter(s => KROKY.some(k => hotovy(vys(s), k))).map(s => stupen(info, s.soubor)));
  const podleObtiznosti = (a, b) => stupen(info, a.soubor) - stupen(info, b.soubor);
  const roz = seznam.filter(rozehrana).sort((a, b) => posledniHrani(stat, b.soubor) - posledniHrani(stat, a.soubor));
  const zbytek = seznam.filter(s => !umi(s) && !rozehrana(s));
  return [
    ...roz,
    ...zbytek.filter(s => stupen(info, s.soubor) <= zvladnuto + 1).sort(podleObtiznosti),
    ...zbytek.filter(s => stupen(info, s.soubor) > zvladnuto + 1).sort(podleObtiznosti),
    ...seznam.filter(umi),
  ];
}

/** "new" label: the song first appeared less than 7 days ago and the player hasn't played it yet */
export function jeNova(prvniVyskyt, hrano, ted = Date.now()) {
  return !hrano && prvniVyskyt != null && ted - prvniVyskyt < 7 * 864e5;
}

/**
 * Main action on the result screen. vys and stat already include this attempt; mistoSlabe = { od, do } (bar indexes)
 * of the hardest spot, taktu = number of bars in the song; dalsi = the song to offer after "I know it";
 * rychlost = speed of the attempt just finished (%).
 */
export function akcePoVysledku({ hvezdy, vys, stat, soubor, dalsi, mistoSlabe, taktu, rychlost = 0 }) {
  if (hvezdy >= 3) {
    const d = doporuceni(vys, stat, soubor);
    if (KROKY.some(k => !hotovy(vys, k))) return { druh: 'krok', krok: d.krok };
    if (!d.umim) {
      // 3 stars is not a clean run: offer at least one notch more than what was just played; at 100 % try cleanly again
      const r = Math.max(d.rychlost, RYCHLOSTI.find(x => x > rychlost) ?? 0);
      return r > rychlost ? { druh: 'rychleji', krok: REZIM.TEMPO, rychlost: r } : { druh: 'znovu' };
    }
    return dalsi ? { druh: 'dalsi', pisen: dalsi } : { druh: 'znovu' };
  }
  if (mistoSlabe && taktu && mistoSlabe.do - mistoSlabe.od + 1 < taktu) return { druh: 'procvicit', misto: mistoSlabe };
  return { druh: 'znovu' };
}

/** the player's last 7 days: how many days played, how many different songs and how many attempts (from the statistics history) */
export function tydenHrace(stat, ted = Date.now()) {
  const od = ted - 7 * 864e5, dny = new Set(), pisne = new Set();
  let pokusu = 0;
  for (const [klic, z] of Object.entries(stat || {})) {
    for (const h of z?.historie || []) {
      if (!(h.kdy >= od && h.kdy <= ted)) continue;
      pokusu++; pisne.add(klic.slice(0, klic.lastIndexOf('#')));
      const d = new Date(h.kdy); dny.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    }
  }
  return { dny: dny.size, pisni: pisne.size, pokusu };
}
