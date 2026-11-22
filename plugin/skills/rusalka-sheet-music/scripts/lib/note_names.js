// Note names by naming system: 'cs' C D E F G A H (Cis, Es, B = B flat), 'en' C D E F G A B (C#, Eb, Bb) or 'do'
// Do Re Mi Fa Sol La Si (Do#, Sib; the syllables of the app language). Chosen in Settings, default by the language.

let SOUSTAVA = 'cs';
const LATINSKE = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
/** s: 'cs' | 'en' | 'do'; slabiky: the seven Do–Re–Mi syllables of the language (Latin when missing) */
export const nastavSoustavu = (s, slabiky) => {
  SOUSTAVA = s === 'en' || s === 'do' ? s : 'cs';
  if (s === 'do') ZAKLAD.do = Object.fromEntries('cdefgab'.split('').map((k, i) => [k, (slabiky?.length === 7 ? slabiky : LATINSKE)[i]]));
};
export const soustava = () => SOUSTAVA;
const H = ['cs', 'sk', 'de', 'pl'], DO = ['fr', 'es', 'it', 'pt', 'pt-BR', 'ru', 'uk', 'ar'];
/** the note names people learn with a language: H (Central Europe), Do–Re–Mi (Romance, Slavic East, Arabic), else B */
export const vychoziSoustava = jazyk => (H.includes(jazyk) ? 'cs' : DO.includes(jazyk) ? 'do' : 'en');

const ZAKLAD = { cs: { c: 'C', d: 'D', e: 'E', f: 'F', g: 'G', a: 'A', b: 'H' }, en: { c: 'C', d: 'D', e: 'E', f: 'F', g: 'G', a: 'A', b: 'B' },
  do: { c: 'Do', d: 'Re', e: 'Mi', f: 'Fa', g: 'Sol', a: 'La', b: 'Si' } };
const CS_BECKO = { c: 'Ces', d: 'Des', e: 'Es', f: 'Fes', g: 'Ges', a: 'As', b: 'B' };

/** step 'c'..'b' (English letter, as in MusicXML and MEI; b = Czech H) and accidental −2..2 */
export function nazevKroku(krok, alter = 0, s = SOUSTAVA) {
  const k = String(krok || '').toLowerCase(), z = ZAKLAD[s][k];
  if (!z) return '?';
  if (s === 'en' || s === 'do') return z + (alter > 0 ? '#'.repeat(alter) : 'b'.repeat(-alter));
  if (alter === 1) return z + 'is';
  if (alter === 2) return z + 'isis';
  if (alter === -1) return CS_BECKO[k];
  if (alter === -2) return z + ('ea'.includes(k) ? 'ses' : 'eses');
  return z;
}

const PC_KRIZKY = [['c', 0], ['c', 1], ['d', 0], ['d', 1], ['e', 0], ['f', 0], ['f', 1], ['g', 0], ['g', 1], ['a', 0], ['a', 1], ['b', 0]];
const PC_BECKA = [['c', 0], ['d', -1], ['d', 0], ['e', -1], ['e', 0], ['f', 0], ['g', -1], ['g', 0], ['a', -1], ['a', 0], ['b', -1], ['b', 0]];
/** note name from a MIDI pitch (without octave), with sharps or with flats */
export function nazevTonu(midi, becka = false, s = SOUSTAVA) {
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  return nazevKroku(...(becka ? PC_BECKA : PC_KRIZKY)[pc], s);
}

/** labels of the on-screen keys (black keys with sharps, only Ais/A# as B/Bb) */
export function jmenaKlaves(s = SOUSTAVA) {
  return Array.from({ length: 12 }, (_, pc) => nazevTonu(pc, pc === 10, s));
}
