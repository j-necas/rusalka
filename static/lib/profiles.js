// Player profiles: colour (palette) and picture (18 animals, Rusalka and five musical illustrations), migration of old profiles
// (only "zvire") and deletion that merging writes won't undo (the profile stays as { id, smazano }).

export const PALETY = [
  { id: 'mech', tmava: '#22504A', svetla: '#E2F0E8', stredni: '#C3E1D1' },
  { id: 'mrkev', tmava: '#7A3418', svetla: '#FCEBDD', stredni: '#F5D3B9' },
  { id: 'inkoust', tmava: '#24476B', svetla: '#E4ECF5', stredni: '#C9D8EA' },
  { id: 'svestka', tmava: '#5A2E57', svetla: '#F2E5F0', stredni: '#E2C9DE' },
  { id: 'horcice', tmava: '#6A5410', svetla: '#F7EED0', stredni: '#EBDBA6' },
  { id: 'malina', tmava: '#8A2338', svetla: '#FBE4E8', stredni: '#F2C3CC' },
];
export const OBRAZKY = {
  dite: ['lenochod', 'kralik', 'liska', 'sova', 'jezek', 'kocka', 'pejsek', 'panda-cervena', 'vydra', 'tucnak', 'kapybara', 'axolotl', 'veverka', 'myval', 'medvidek', 'koala', 'zabka', 'ovecka'],
  dospely: ['rusalka', 'klic', 'klavir', 'metronom', 'lyra', 'ladicka'],
};
/** one choice for everybody (child or adult): the animals, then Rusalka and the musical illustrations */
export const VSECHNY_OBRAZKY = [...OBRAZKY.dite, ...OBRAZKY.dospely];
/** symbols of the first adult set (until November 2026) → the illustration with the same motif */
const STARE_OBRAZKY = { inicial: 'rusalka', nota: 'lyra', klavesy: 'klavir' };
export const obrazekProfilu = o => STARE_OBRAZKY[o] || o;
export const paleta = id => PALETY.find(p => p.id === id) || PALETY.find(p => p.id === 'inkoust');

const BARVA_ZVIRETE = { lenochod: 'mech', kralik: 'mrkev' };

/** fills in a picture and colour for an old profile; a profile that has them is unchanged */
export function prevedProfil(p, vsechny = []) {
  if (p.smazano || (p.obrazek && p.barva && !STARE_OBRAZKY[p.obrazek])) return p;
  const dospely = p.vek === 'dospely';
  let obrazek = obrazekProfilu(p.obrazek);
  if (!obrazek) {
    if (dospely) obrazek = 'rusalka';
    else if (OBRAZKY.dite.includes(p.zvire)) obrazek = p.zvire;
    else {
      const obsazene = new Set(vsechny.filter(q => q.id !== p.id).map(q => q.obrazek || q.zvire));
      obrazek = OBRAZKY.dite.find(o => !obsazene.has(o)) || OBRAZKY.dite[0];
    }
  }
  return { ...p, obrazek, barva: p.barva || BARVA_ZVIRETE[obrazek] || 'inkoust' };
}

export const viditelni = profily => (profily || []).filter(p => !p.smazano);

/** deletes a player: replaces the profile with a deletion record, removes their results, statistics, favourites and library songs removed from home */
export function smazHrace(stav, pid, ted = Date.now()) {
  const bez = o => Object.fromEntries(Object.entries(o || {}).filter(([k]) => k !== pid));
  const profily = stav.profily.map(p => (p.id === pid ? { id: pid, smazano: ted } : p));
  const profil = stav.profil === pid ? viditelni(profily)[0]?.id ?? null : stav.profil;
  return { ...stav, profily, profil, vysledky: bez(stav.vysledky), statistiky: bez(stav.statistiky), oblibene: bez(stav.oblibene), denik: bez(stav.denik),
    knihovnaSkryte: bez(stav.knihovnaSkryte) };
}
