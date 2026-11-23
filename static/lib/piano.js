// The recorded piano: Salamander Grand Piano (Alexander Holm, CC BY 3.0), a subset with one sample every three
// semitones in static/sounds/piano/. A note between samples plays the nearest one retuned (at most 1.5 semitones).
// Decoded, one sample takes ~5 MB, so the app decodes only the samples of the keys in use (vzorkyPro) and the rest
// when a note first needs it.

export const VZORKY = ['A0', 'C1', 'Ds1', 'Fs1', 'A1', 'C2', 'Ds2', 'Fs2', 'A2', 'C3', 'Ds3', 'Fs3', 'A3', 'C4', 'Ds4', 'Fs4',
  'A4', 'C5', 'Ds5', 'Fs5', 'A5', 'C6', 'Ds6', 'Fs6', 'A6', 'C7', 'Ds7', 'Fs7', 'A7', 'C8'];
const TRIDA = { C: 0, Ds: 3, Fs: 6, A: 9 };

/** 'Ds4' → 63 */
export function naMidi(nazev) {
  const m = /^(C|Ds|Fs|A)(\d)$/.exec(nazev);
  return 12 * (Number(m[2]) + 1) + TRIDA[m[1]];
}

/** the nearest loaded sample and the playback rate that tunes it to the note; null when none is loaded */
export function nejblizsiVzorek(p, dostupne) {
  let vzorek = null;
  for (const s of dostupne) if (vzorek == null || Math.abs(s - p) < Math.abs(vzorek - p)) vzorek = s;
  return vzorek == null ? null : { vzorek, rychlost: Math.pow(2, (p - vzorek) / 12) };
}

/** names of the samples the keys od..doo (MIDI) need: the nearest sample of every key */
export function vzorkyPro(od, doo) {
  const vse = VZORKY.map(naMidi), treba = new Set();
  for (let p = Math.max(21, od); p <= Math.min(108, doo); p++) treba.add(nejblizsiVzorek(p, vse).vzorek);
  if (od < 21) treba.add(21);
  if (doo > 108) treba.add(108);
  return VZORKY.filter(n => treba.has(naMidi(n)));
}
