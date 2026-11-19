---
name: rusalka-sheet-music
description: Turns a photo, scan or PDF of sheet music into text notation for the Rusalka piano app, or adapts a Rusalka song (easier, five fingers, left hand). Use for "add this to Rusalka".
---

# Sheet music for Rusalka

Reply in the user's language; use Czech note names (H, Cis) when you talk to Czech users and English ones (B, C#)
otherwise. The notation itself always uses English note names.

Rusalka is a piano trainer for children that runs in the browser. It can't read photos or PDFs – you do that: read
the sheet music and write it in the simple text notation described in `references/format.md`. The parent pastes
your notation into Rusalka (**AI → Paste notes from the AI chat**, top right), which checks it, renders it and adds the
song. So **always finish with one code block containing the whole notation**, nothing else in that block.

## Can you run code?

- **Yes** (code execution in Claude or ChatGPT, or Claude Code / Codex): use `scripts/sheet.mjs` (Node.js 18+,
  paths relative to this skill's folder) to check bar lengths and render a picture to compare with the original –
  the best safeguard against mistakes. Uploaded skills may be read-only: copy the skill folder to a temporary folder
  first and work there. Rendering and `text` (MusicXML → notation) need `npm install` in that copy (Verovio, resvg,
  xmldom); if installing isn't possible, the check of bar lengths still works.
  Also offer the user the files to download: `song.txt` and `song.trener.musicxml` (Rusalka's **Add song** accepts
  both).
- **No**: work carefully and count every bar by hand (step 4). Rusalka checks the bar lengths after pasting and the
  parent will tell you which bars don't fit.

## Procedure

### 1. Look through the sheet music
- Go through a PDF page by page. If you can run code and can't read the PDF directly, convert pages to PNG
  (`node scripts/sheet.mjs slice notes.pdf` needs `pdftoppm`; otherwise e.g. Python with `pymupdf`).
- Find the header details: title, composer (and lyricist), clef, key signature, time signature, tempo (`0` if not
  given).
- Work out how many staves make up one line (system) and which is the melody: melody only = 1 staff; piano = 2
  staves (the upper one is the right hand); voice and piano = 3 staves (the melody is the voice). Only transcribe
  the left hand if the user wants it or the score is piano music for both hands – otherwise Rusalka adds a left
  hand itself from the chords.
- Lyrics: only the first verse under the notes (syllables to notes).
- Copy fingering (numbers above the notes) if the score has it. Leave out teacher's notes and chord charts and
  mention them at the end.
- If the user gives you **MusicXML** (from Audiveris, MuseScore…) and you can run code with the packages installed,
  `node scripts/sheet.mjs text file.musicxml` turns it into the notation; continue with step 3. Otherwise transcribe
  it like a picture.

### 2. Transcribe bar by bar
Read `references/format.md` before writing. The key principles:
- **Transcribe what is written, not what you remember.** Songbooks differ in key, rhythm and details, and the child
  plays from the notes in front of them.
- **Zoom in.** If you can run code, `node scripts/sheet.mjs slice notes.pdf` (or a photo) finds the staves,
  straightens a skewed scan and saves each staff enlarged into `notes.radky/`, with ledger lines and note names
  (Czech names: `H` is B). Zoom in even more on doubtful spots (notes on ledger lines, accidentals, dots).
  In the treble clef the bottom line is E4 and the top line F5; in the bass clef G2 and A3.
- Write **sounding** pitches, with the key signature and accidentals applied (an accidental lasts until the end of
  the bar).
- Write repeats, voltas and D.C./D.S. as markers; don't write them out.
- Write a pickup (anacrusis) as a short first bar without padding rests. Keep bar numbers as in the original.
- Where you aren't sure, write the most likely reading and mark the bar with `{?}`.

### 3. Check
With code: `node scripts/sheet.mjs check song.txt` lists notation errors, bars whose note lengths don't add up and
uncertain bars, creates `song.trener.musicxml` and (if rendering is installed) images `song.kontrola-N.png` with bar
numbers. Fix every length error, then **compare the image with the original line by line** (number of bars,
pitches, rhythm, syllables) and fix until it matches.

Without code: for every bar, add up the note lengths and compare with the time signature (the first and last bar
may be shorter).

### 4. Answer
- One code block with the whole notation.
- Below it, briefly: title, number of bars, key, lyrics/left hand yes or no, uncertain bars, what was illegible.
- Tell the parent: in Rusalka, **AI → Paste notes from the AI chat**, paste, and check the rendered notes
  against the original; small things can be fixed in the editor. If they tell you a bar doesn't fit, send the whole
  corrected notation again.
- In Claude Code / Codex with access to the user's Rusalka folder (`node scripts/sheet.mjs folder`), you may add the
  song directly: `node scripts/sheet.mjs add song.txt` (it never overwrites; it appends " (2)").

## Adapting a song that is already in Rusalka

The parent copies the song from Rusalka (**My songs → the song → Easier version**);
it arrives as notation with a request. First check whether Rusalka can do it by itself – for every song it lets you
choose a **level** (1 Melody – easy rhythm, 2 Full melody, 3 Melody and bass, 4 Melody with accompaniment,
5 Original), a **key** (original, C major or the nearest easy key) and shows **fingering**. If that's enough, say so.

Make your own version when the levels can't do it:
- the melody in one hand position (within five fingers): pick the transposition where it fits five neighbouring
  white keys best; move a whole phrase by an octave or replace a distant note with a nearby chord tone; add
  fingering,
- shortening (only the chorus, only the first verse),
- a harder version: a different left hand (bass on beat one, broken chords, alternating bass),
- a simpler rhythm where level 1 can't simplify sensibly.

Keep the melody recognisable: change as few notes as possible, keep syllables on the same notes. Give the version a
title that says who it is for and how it differs (e.g. "Silent Night – five fingers"). Answer as in step 4; the
version is added as a new song next to the original (the original and its stars don't change).

## Copyright and privacy
The user's sheet music is their own business – the transcription is for their practice. Don't use the skill to
transcribe other people's collections in bulk for distribution.
