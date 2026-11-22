// Lifetimes of game callbacks and of the pending song selection.

export function vytvorCasovace({ ted = () => performance.now(), nastav = setTimeout, zrus = clearTimeout } = {}) {
  const ukoly = new Set();
  let pauza = false;
  const naplanuj = u => {
    u.kdy = ted() + u.zbyva;
    u.id = nastav(() => { ukoly.delete(u); u.fn(); }, u.zbyva);
  };
  return {
    get ceka() { return ukoly.size > 0; },
    pridej(fn, ms) {
      const u = { fn, zbyva: Math.max(0, ms) };
      ukoly.add(u);
      if (!pauza) naplanuj(u);
      return () => { if (ukoly.delete(u)) zrus(u.id); };
    },
    pozastav() {
      if (pauza) return;
      pauza = true;
      const kdy = ted();
      for (const u of ukoly) { zrus(u.id); u.zbyva = Math.max(0, u.kdy - kdy); }
    },
    pokracuj() {
      if (!pauza) return;
      pauza = false;
      for (const u of ukoly) naplanuj(u);
    },
    zrus() {
      for (const u of ukoly) zrus(u.id);
      ukoly.clear(); pauza = false;
    },
  };
}

export function vytvorVyberPisne(priZmene) {
  let vyber = null;
  return {
    async nacti(soubor, nactiPisen) {
      const stav = { soubor, hotovo: false }, plati = () => vyber === stav;
      vyber = stav; priZmene(false);
      if (!await nactiPisen(plati) || !plati()) return false;
      stav.hotovo = true; priZmene(true);
      return true;
    },
    pripravena: soubor => !!vyber?.hotovo && vyber.soubor === soubor,
    zrus() { vyber = null; priZmene(false); },
  };
}

export async function obnovAudio(ac) {
  if (ac.state === 'suspended' || ac.state === 'interrupted') await ac.resume();
  return ac;
}

export const lzePrekreslit = h => !h.bezi && !h.spousti && !h.ukoncen && !h.kalibrace && !h.idx && !h.chyby && !h.stisk.size;
