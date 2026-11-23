// Before playing, "What will you play?": the rules of the version cards (levels 1–5) and the hand choice.
// Hand values as in the app: '1' right (upper staff), '2' left (lower staff), 'vse' both.

/** the hand a tapped card sets: a version with a left hand (bass, chords, all the notes) on two staves → both hands */
export function rukaPoKarte(uroven, osnovy) {
  return osnovy > 1 && Number(uroven) >= 3 ? 'vse' : '1';
}

/** a left-hand style belongs to one level only (urovenStylu in levels.js: 5 for a song with only a melody, 4 for one
 *  with its own left hand); elsewhere it is dropped when the song opens */
export function stylPriOtevreni(uroven, styl, urovenStylu = 4) {
  return Number(uroven) === Number(urovenStylu) && styl ? styl : '';
}

/** text keys of the summary "You play: <version>, <hand>"; ruka is null for one staff or a pair (no hand to choose) */
export function souhrn({ uroven, ruka, osnovy, dvojice = false, doprovod = false }) {
  // doprovod: level 5 of a song without its own left hand is Melody with accompaniment, not All the notes
  const verze = Number(uroven) === 5 && doprovod ? 'cviceni.uroven.5.doprovod.nazev' : `cviceni.uroven.${uroven}.nazev`;
  if (dvojice || osnovy < 2) return { verze, ruka: null };
  return { verze, ruka: ruka === 'vse' ? 'verze.ruka.obe' : ruka === '2' ? 'verze.ruka.leva' : 'verze.ruka.prava' };
}

/** Listen: the hardest version (level 5), shown in full and played with both hands at full speed, so the player hears
 *  and sees where they are heading – all the notes when the score has a left hand, otherwise the melody with its
 *  accompaniment from the chord symbols on its own staff; original key, no fingering or style, whole song */
export const poslechCelePisne = () => ({ uroven: 5, tonina: 'ne', prstoklad: false, styl: '', usek: null,
  rukaVolba: 'vse', rychlost: 100, doprovod: false });
