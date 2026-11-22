// How this device plays: a piano over MIDI, an ordinary piano through the microphone, or only the on-screen keys.
// One mode at a time, remembered per device (localStorage “kt-vstup”); the accompaniment is on or off per mode
// (off with the microphone, which would otherwise hear it as the player's notes).

export const REZIMY = ['midi', 'mikrofon', 'obrazovka'];
const DOPROVOD = { midi: true, mikrofon: false, obrazovka: true };

/** the stored choice with defaults filled in; MIDI without Web MIDI (Safari) falls back to the on-screen keys */
export function nactiVstup(ulozeno, { midiUmi }) {
  let rezim = REZIMY.includes(ulozeno?.rezim) ? ulozeno.rezim : (midiUmi ? 'midi' : 'obrazovka');
  if (rezim === 'midi' && !midiUmi) rezim = 'obrazovka';
  const doprovod = { ...DOPROVOD };
  for (const r of REZIMY) if (typeof ulozeno?.doprovod?.[r] === 'boolean') doprovod[r] = ulozeno.doprovod[r];
  return { rezim, doprovod };
}

export const doprovodZapnuty = v => !!v.doprovod[v.rezim];

export const sDoprovodem = (v, zap) => ({ ...v, doprovod: { ...v.doprovod, [v.rezim]: !!zap } });

/** a piano connected during the visit (no MIDI inputs → some) switches to MIDI */
export const poZmeneKlaviru = (v, predtim, ted) => (predtim === 0 && ted > 0 && v.rezim !== 'midi' ? { ...v, rezim: 'midi' } : v);

/** does a note from this source count? touching the on-screen keys always does */
export const prijimaZdroj = (rezim, zdroj) => zdroj === 'dotyk' || zdroj === rezim;

/** MIDIAccess.inputs/outputs as an array: forEach works everywhere, but the Web MIDI Browser app (iPad, iPhone)
 *  returns from values() an object with only next(), which can't be spread or iterated with for…of */
export const seznamPortu = mapa => { const a = []; mapa?.forEach(p => a.push(p)); return a; };

/** names of the MIDI inputs that are plugged in (Chrome keeps unplugged ones in the list as “disconnected”) */
export const pripojeneVstupy = vstupy => [...vstupy].filter(i => i.state !== 'disconnected').map(i => i.name);

/** the on-screen keys show when the player wants them, in on-screen mode, and whenever the chosen input does not work
 *  (no piano connected, microphone refused or not started) – a player is never left with nothing to play on */
export const klavesyViditelne = ({ klaviatura, rezim, vstupFunguje }) => !!klaviatura || rezim === 'obrazovka' || !vstupFunguje;

/** Keep note-off times per input and MIDI channel, and extend released notes until sustain is lifted. */
export function vytvorMereniDrzeni() {
  const pedaly = new Map(), drzeno = new Map();
  const zmer = (d, kdy) => { d.zaznam.drzenoMs = Math.round((kdy - d.od) * 1000 * d.sp); };
  return {
    stisk(zdroj, pitch, zaznam, od, sp) {
      if (!drzeno.has(zdroj)) drzeno.set(zdroj, new Map());
      drzeno.get(zdroj).set(pitch, { zaznam, od, sp });
    },
    pust(zdroj, pitch, kdy) {
      const klavesy = drzeno.get(zdroj), d = klavesy?.get(pitch);
      if (!d) return;
      klavesy.delete(pitch);
      if (pedaly.has(zdroj)) pedaly.get(zdroj).push(d);
      else zmer(d, kdy);
    },
    pedal(zdroj, zap, kdy) {
      if (zap) { if (!pedaly.has(zdroj)) pedaly.set(zdroj, []); }
      else if (pedaly.has(zdroj)) {
        for (const d of pedaly.get(zdroj)) zmer(d, kdy);
        pedaly.delete(zdroj);
      }
    },
    zrusPokus() {
      drzeno.clear();
      for (const p of pedaly.values()) p.length = 0;
    },
    odpoj(zdroj) { pedaly.delete(zdroj); drzeno.delete(zdroj); },
  };
}
