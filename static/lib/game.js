// Game flow without the DOM: the play modes, lifetimes of game callbacks and of the pending song selection, one frame
// of a running game, Find the notes key presses, the stored best results and the steps of the Learn bit by bit guide.

/** Play modes. The values are stored in results, statistics and history – never change them. */
export const REZIM = Object.freeze({ CEKAM: 'cekam', POCKEJ: 'pockej', TEMPO: 'tempo', POSLECH: 'poslech' });

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

// ---------------------------------------------------------------- count-in and metronome
/**
 * Count-in before In rhythm, With backing and Listen. met = metrum(takt), delkaTaktu = length of the first bar played
 * in quarters, odZacatku = the game starts at the song's first bar (only there is a short bar a pickup).
 * The count-in is whole bars (at least three beats before the first note); a pickup starts that many quarters before
 * the end of the last bar counted in, without rounding, so even an eighth pickup in 4/4 or 6/8 stays on the beat.
 * Beats are counted from the first click: beat k sounds at k·doba from the count-in's start.
 * → { dobaQ (one beat in quarters), naTakt (beats per bar), kliku (clicks before the first note),
 *     startDob (the first note in beats from the first click, may be fractional), prvniKlik (the first metronome beat
 *     at or after the first note) }
 */
export function odpocetHry(met, { delkaTaktu, odZacatku }) {
  const dobaQ = met.beatType === 8 && met.beats % 3 === 0 ? 1.5 : 4 / met.beatType;
  const naTakt = Math.max(1, Math.round(met.delka / dobaQ));
  const predtakt = odZacatku && delkaTaktu > 1e-6 && delkaTaktu < met.delka - 1e-6 ? delkaTaktu : 0;
  let takty = 1;
  while (takty * met.delka - predtakt < 3 * dobaQ - 1e-6) takty++;
  const startDob = (takty * met.delka - predtakt) / dobaQ;
  const kliku = Math.ceil(startDob - 1e-6);
  return { dobaQ, naTakt, kliku, startDob, prvniKlik: kliku };
}
/** beat k of the count-in (and of the metronome that goes on after it) is beat 1 of a bar */
export const prizvuk = (o, k) => Math.round(k * o.dobaQ * 1e6) % Math.round(o.naTakt * o.dobaQ * 1e6) === 0;

// ---------------------------------------------------------------- latency compensation (In rhythm)
/** the microphone's own delay: frames of 85 ms every 20 ms and two confirming frames; measured on synthetic piano
 *  tones (tests/microphone.test.mjs helpers) as 30–85 ms from the attack to the hit, median 60 ms */
export const MIKROFON_ZPOZDENI_MS = 60;
/**
 * How many ms a press is moved back before it is scored. kalibrace = { midi?, mikrofon?, obrazovka? } measured per
 * input (older settings: one number for all inputs, 0 = never measured); vstup = the input mode; vystupMs = the sound
 * output latency (AudioContext.outputLatency): the player hears the beat that much later. Without a measurement:
 * the output latency, plus the microphone's detection delay for the microphone.
 */
export function kompenzace({ kalibrace, vstup, vystupMs = 0 }) {
  const zmereno = typeof kalibrace === 'number' ? (kalibrace && vstup !== 'mikrofon' ? kalibrace : null) : kalibrace?.[vstup];
  if (Number.isFinite(zmereno)) return zmereno;
  return Math.round(vystupMs || 0) + (vstup === 'mikrofon' ? MIKROFON_ZPOZDENI_MS : 0);
}
/** a new measurement for one input; an older single number stays for the piano and the on-screen keys */
export function ulozKalibraci(kalibrace, vstup, ms) {
  const z = typeof kalibrace === 'number' ? (kalibrace ? { midi: kalibrace, obrazovka: kalibrace } : {}) : { ...kalibrace };
  return { ...z, [vstup]: ms };
}

// ---------------------------------------------------------------- one frame of a running game
/**
 * What changed in one frame of In rhythm, With backing or Listen (the app marks the notes and moves the cursor).
 * K = game steps, tc = song time, tZasahu = tc corrected by the latency (In rhythm), okno = the hit window in song
 * ms, sp = speed (0–1), konec = end of the last note; kontrola, aktivni, hotovo, zastaveno come from the game state.
 * → { kontrola, aktivni, minule (notes whose window passed in this frame), zastavit (With backing: the song time
 *   stops at this ms; null = keeps running), zhasnout (Listen: the current note has ended), konec (game over) }
 */
export function postupHry(K, { rezim, tc, tZasahu = tc, okno, sp, konec, kontrola, aktivni, hotovo, zastaveno = null }) {
  const out = { kontrola, aktivni, minule: [], zastavit: null, zhasnout: false, konec: false };
  if (rezim === REZIM.POCKEJ) {
    if (zastaveno == null && K[kontrola] && tc >= K[kontrola].ms) out.zastavit = K[kontrola].ms;
    out.aktivni = kontrola;
  } else if (rezim === REZIM.TEMPO) {
    while (out.kontrola < K.length && K[out.kontrola].ms + okno < tZasahu) {
      for (const n of K[out.kontrola].noty) if (!hotovo.has(n.id)) out.minule.push(n);
      out.kontrola++;
    }
    let a = out.kontrola;
    while (a < K.length && K[a].noty.every(n => hotovo.has(n.id))) a++;
    out.aktivni = a;
  } else {
    let i = aktivni;
    while (i + 1 < K.length && K[i + 1].ms <= tc) i++;
    out.aktivni = i;
    out.zhasnout = i === aktivni && i >= 0 && tc > K[i].konec - 30 * sp;
  }
  out.konec = tc > konec + 700 * sp && (rezim !== REZIM.POCKEJ || out.kontrola === K.length);
  return out;
}

// ---------------------------------------------------------------- Find the notes
/**
 * A key pressed while Find the notes waits for step k; stisknute = keys of the step already down (a chord is pressed
 * key by key). → { druh: 'znovu' (this key is already down) | 'nota' (part of a chord) | 'krok' (the step is
 * complete) | 'vedle' (wrong key), nota, stisknute (a new set), jinaOktava (wrong key with a right note name) }
 */
export function stiskVKroku(k, stisknute, pitch) {
  if (!k.vyska.has(pitch)) return { druh: 'vedle', nota: null, stisknute, jinaOktava: k.noty.some(n => n.pitch % 12 === pitch % 12) };
  if (stisknute.has(pitch)) return { druh: 'znovu', nota: null, stisknute, jinaOktava: false };
  const nove = new Set(stisknute).add(pitch);
  return { druh: nove.size < k.vyska.size ? 'nota' : 'krok', nota: k.noty.find(n => n.pitch === pitch), stisknute: nove, jinaOktava: false };
}

/**
 * The backing played when step i of Find the notes is found: the events from that step until the next one, each
 * `za` song ms after the key. Before the first step only what still sounds at its note (shortened), never the whole
 * intro at once. D = backing events { ms, p, dur, sila } sorted by time, K = game steps.
 */
export function doprovodKroku(D, K, i) {
  const k = K[i], dalsi = K[i + 1], dok = dalsi ? dalsi.ms - 1 : Infinity, out = [];
  for (const e of D) {
    if (e.ms >= dok) continue;
    if (e.ms >= k.ms - 1) out.push({ ...e, za: Math.max(0, e.ms - k.ms) });
    else if (i === 0 && e.ms + e.dur > k.ms) out.push({ ...e, za: 0, dur: e.ms + e.dur - k.ms });
  }
  return out;
}

// ---------------------------------------------------------------- best results
/** a song result of one mode { hvezdy, procent, pocet, cistaRychlost? } after an attempt; rekord = more stars than
 *  ever before; cistaRychlost = the best speed (%) of a clean whole-song run In rhythm ("I can play it" at 100 %) */
export function zlepsiVysledek(r, hvezdy, podil, cistaRychlost = 0) {
  const s = r || { hvezdy: 0, procent: 0, pocet: 0 };
  const v = { ...s, hvezdy: Math.max(s.hvezdy, hvezdy), procent: Math.max(s.procent, Math.round(podil * 100)), pocet: s.pocet + 1 };
  if (cistaRychlost > (s.cistaRychlost || 0)) v.cistaRychlost = cistaRychlost;
  return { vysledek: v, rekord: hvezdy > s.hvezdy };
}
/** section stars: the best per section and level in vysPisne.useky['od-do#uroven'] (the whole song's stars stay) */
export function zapisUseku(vysPisne, usek, uroven, hvezdy) {
  const kl = `${usek.od}-${usek.do}#${uroven}`, useky = { ...vysPisne?.useky };
  useky[kl] = Math.max(useky[kl] || 0, hvezdy);
  return { ...vysPisne, useky };
}

// ---------------------------------------------------------------- Learn bit by bit guide
/**
 * After a guide step ends: move on after a clean run (listening always counts), or after 3 attempts with accuracy
 * ≥ 85 %. P = { plan, i, pokusu }, souhrn = attempt summary (null after listening).
 * → { akce: 'opakuj' (the same step again, the attempt counted) | 'dalsi' (next step of the plan) | 'hotovo' (the
 *   last step is done), pruvodce: the state to continue with (null when done), toast: text key or null }
 */
export function dalsiKrokPruvodce(P, souhrn) {
  const pokusu = P.pokusu + 1;
  const splneno = !souhrn || souhrn.cisty || (pokusu >= 3 && souhrn.presnost >= 0.85);
  if (!splneno) return { akce: 'opakuj', pruvodce: { ...P, pokusu }, toast: souhrn.presnost >= 0.85 ? 'app.skoro' : 'app.klidne' };
  if (P.plan[P.i].posledni) return { akce: 'hotovo', pruvodce: null, toast: null };
  return { akce: 'dalsi', pruvodce: { ...P, i: P.i + 1, pokusu: 0 }, toast: souhrn ? 'app.jdemeDal' : 'app.tedTy' };
}
