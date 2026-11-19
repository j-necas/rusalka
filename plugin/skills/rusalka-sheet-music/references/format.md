# Text notation for sheet music

One `.txt` file (or one block of text): a header at the top, then a line `---`, and below it **one bar per line**.

```
title: Kočka leze dírou
author: traditional
time: 2/4
key: 0
tempo: 100
clef: treble
---
# comment (whole line only)
1) C | C4/8=Ko- E4/8=čka G4/4=le-
2) C | G4/8=ze C5/8=dí- G4/4=rou,
3) {|:} G7 | F4/8=pes D4/8=o- B3/4=knem
4) {:| ?} C | C4/2=…
```

## Header
Any other key is an error. (Older Czech keys are accepted too: `název`, `autor`, `takt`, `předznamenání`, `klíč`.)

- `title`: as printed in the score, without a subtitle.
- `author`: the composer, and the lyricist if there is one ("music by Karel Svoboda, lyrics by Jiří Štaidl").
  Someone who only wrote down or arranged the music doesn't belong here. If the score names no author, leave the
  field empty.
- `time` (time signature): e.g. `3/4`, `4/4`, `6/8`, `2/2`.
- `key` (key signature): the number of sharps as a positive number (`2` = D major / B minor), the number of flats as
  a negative one (`-1` = F major / D minor).
- `tempo`: quarter-note beats per minute; `0` if the score doesn't give one.
- `clef`: `treble` or `bass` – the clef of the melody.

## Bar line
```
[number)] [{markers}] [chords] | right-hand notes [|| left-hand notes]
```
- `number)` at the start is optional, just for orientation. Count from 1 including the pickup bar – the check and
  the comparison image count the same way.
- **Chords** (symbols above the staff) use English names: `C`, `Dm`, `F#m`, `Bb`, `B7` (Czech H7), `Bm` (Czech
  Hmi). After the at sign comes the position in the bar, in quarter-note beats from the start of the bar:
  `G7@2` = on the 3rd quarter. Without `@` the chord starts at the beginning of the bar.
  Only write chords that are printed in the score; a chord lasts until the next one.
- The vertical bar `|` is required, even when the bar has no chords (`| C4/4 D4/4 …`).

### Note
`pitch/length[dots][t][~][=syllable]`

| part | notation | meaning |
|---|---|---|
| pitch | `C4`, `F#4`, `Bb3`, `C#5` | English letter name with octave (C4 = middle C, `B` = Czech H, `Bb` = Czech B) |
| rest | `r` | in place of the pitch |
| chord | `C4+E4+G4` | notes joined with a plus |
| length | `1` `2` `4` `8` `16` `32` | whole, half, quarter, eighth, sixteenth, thirty-second |
| dot | `4.` `8.` `2..` | one or two dots |
| triplet | `8t` | eighth-note triplet (three `8t` = one quarter) |
| tie | `~` | the note is tied to the next one (across the bar line too) |
| fingering | `^3` | finger number above the note (1–5), only when printed in the score |
| syllable | `=Hvěz-` | lyric syllable under the note; a trailing `-` = the word continues; write a space as `_` |

The order of suffixes is fixed: `D5/4.~^3=nám!` (length, dot, triplet, tie, fingering, syllable).

**Syllables** follow the notes, not the print: as many syllables as notes („Hvěz-di-čky“ on three notes). Keep
punctuation with the syllable (`=ček,`). A one-letter Czech preposition sung together with the next syllable is
joined with an underscore (`=v_je-`, `=z_těch`). Copy diacritics carefully. Leave out dashes in the lyrics that
don't split a word.

The pitch is the **actual sounding pitch**: apply the key signature and accidentals (an accidental lasts until the
end of the bar, and for a tied note also across the bar line). In a piece with one sharp (F#) you therefore write
every F as `F#4` unless it has a natural sign.

### Bar markers
In curly braces at the start of the line, separated by spaces. Write repeats and jumps **as they are printed**,
don't write them out – the app unrolls them.

| marker | meaning |
|---|---|
| `\|:` | start of a repeat (the bar starts with a repeat bar line) |
| `:\|` | end of a repeat (the bar ends with a repeat bar line) |
| `1.` `2.` | the bar belongs to the 1st / 2nd ending (volta) – on every bar of the volta |
| `segno` `coda` | segno sign / start of the coda in this bar |
| `tocoda` `fine` `dc` `ds` | "To Coda", "Fine", "D.C.", "D.S." at the end of the bar |
| `?` | the bar is uncertain – the check lists it and you report it to the user |

### Whole-bar rests
Write a single rest as long as the whole bar (`r/1` in 4/4, `r/2.` in 3/4, `r/4.` in 3/8). In the image it is
drawn as a rest of that length, not as a whole-bar rest – that's fine, it plays the same.

### Left hand
After `||` on the same line. If at least one bar has a left hand, the other bars get an empty one (fill in rests
yourself).

## Bar lengths
The note lengths in a bar must add up to the time signature. The check tolerates these exceptions: the pickup
(first bar), the last bar, and bars at repeats and voltas. Write the pickup and a short last bar with only the
notes that are in them – don't pad them with rests or lengthen the last note.

## Note examples
- `G4/4.=Hap- G4/8=py` – dotted quarter and an eighth.
- `E5/16 D#5/16 E5/16` – sixteenths, D# is an accidental.
- `A4/8t B4/8t C5/8t D5/4 r/4` – an eighth-note triplet, a quarter, a quarter rest.
- `F4/2~` at the end of a bar and `F4/4` at the start of the next – a note across the bar line.
- `C4+E4+G4/2.` – a chord lasting three beats.
