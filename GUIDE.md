# Rusalka – user guide and architecture

Česky: [GUIDE.cs.md](GUIDE.cs.md)

## Using Rusalka
The menu in the top right (Who is playing, Home, New player): **My songs** (add a song, paste notes from the AI chat,
where to get sheet music, make up a song, and the list of your own songs: edit notes, an easier version, delete), **Players**
(the week, edit, delete, add), **AI** (AI tools), **Settings** (language, note names, the
piano, data and backups) and **About**. Where the links don't fit, the bar shows **AI** and **Menu**.

1. **Player:** start playing right away. You can create a profile on Home under **Guest → + New player** (an animal picture, child or adult).
   If Rusalka has several players, choose one when you open the app.
2. **Song:** tap a song. To add a new one, use **Add a song**:
   - MusicXML (`.musicxml`, `.xml`, `.mxl`) loads directly,
   - MIDI (`.mid`, `.midi`, `.kar`) is converted by the app itself: you choose the track with the melody (and
     optionally the left hand), the notes are snapped to a grid and split into bars, the key signature and any
     pickup bar are guessed, and syllables from karaoke files are matched to the notes. The result opens in the
     editor,
   - the app does not convert PDFs or photos of sheet music – see **Sheet music on paper** below.

   **Where to get sheet music** lists free sources (Mutopia, OpenScore, MuseScore.com, IMSLP) and free programs
   (MuseScore Studio, and Audiveris for converting PDFs). The app only opens links from a fixed list.

   **The song library** (website only) is right on Home: the tabs Children's songs, Folk songs of the world,
   Christmas and Classics show the library songs (the samples are among them), the songs up to the player's level first
   and harder ones after them, dimmed. **For me** adds a few library
   songs at the player's level to the songs in progress. Open **All songs** to filter by difficulty across the library,
   samples and your own songs. **Mine** shows the songs you added yourself. Search covers everything. Every tile shows
   its difficulty (1–3 keys). My songs lists only the songs you added.
3. **Three learning steps** (plus listening on its own):
   1. *Find the notes*: no tempo, waits for the right key.
   2. *With backing*: the accompaniment keeps the tempo but waits at each note until it is played.
   3. *In rhythm*: a count-in based on the time signature, accompaniment, and feedback on timing.

   *Listen* (the button next to the steps): the app plays the song and shows the keys.

   Each step has its own stars on the song's card.

   Open **Piano and sound** next to **Play**, from **Settings**, or from **Pause**. Choose MIDI, the microphone,
   or the on-screen keys and set the backing and metronome. **Sound from the piano** routes backing, playback and
   on-screen notes to the connected MIDI piano on channel 2. The metronome plays through this device.

   **Play as a pair** (button in the second toolbar): two children at one piano, both using their right hand. One
   plays the melody (on the right, upper staff), the other a bass line built from the chords (on the left, lower
   staff: the chord's root note held for the whole bar). Each child's keys light up in the colour of their animal,
   and a wrong key counts against whoever's half of the keyboard it landed in. Each child gets their own results,
   kept apart from the solo stars (shown as "Play as a pair" on the song's card). **Swap parts** switches melody
   and bass, **Play alone** goes back to playing solo. Pair mode has no Learn bit by bit, loop or microphone, and a
   song without chord symbols has no bass part. The accompaniment then plays only chords, without a bass.

   **Chord backing style** (under Piano and sound, for all songs): when Rusalka doesn't play a written left hand, the accompaniment is built from
   the chord symbols to fit the time signature and tempo – a waltz in 3/4 and 6/8, oom-pah in 2/4, a ballad or a
   polka in 4/4, broken chords for slow songs, and a held chord at the end. You can also choose a specific style,
   or "Chords only" (a chord on the strong beats). Songs with a written left hand use that as the accompaniment.

   The **metronome** clicks while you play. **Learn bit by bit** is a guide that takes the song phrase by phrase:
   1. listen,
   2. find the notes,
   3. with backing at 70 %.

   After two phrases it joins them, and finally comes the whole song. It moves on after one clean run, or after
   three attempts with at least 85 % accuracy.
4. **What will you play?** (before playing, the line "You play: … · change"; "the song grows with you"):
   1. Melody, easy rhythm,
   2. Whole melody,
   3. Melody and bass (the left hand holds one note),
   4. Melody and chords (the left hand plays chords; the left-hand style is chosen only here),
   5. All the notes: the notes exactly as written in the file. They are drawn and played from the original MusicXML,
      so every voice in both hands is kept, along with dynamics, slurs, pedal, grace notes and changes of key,
      time signature and clef. From files with several parts (voice and piano and so on) the first part is used.
      In a different key, with your own fingering or with a different accompaniment style, a simplified version
      is played (one voice per hand); the card says so.

   Under the cards, **Which hand you play** (Right · Left · Both; Rusalka plays the other hand). A card with a left
   hand (3–5) switches to Both, cards 1–2 to Right. Opening a song keeps the saved level and the hand by age
   (children the right, adults both). So the full score is one tap on "All the notes".

   Levels 3–4 are built from the chord symbols; when the score has no chords, the app works them out itself.
   **Key:** original / easy (C, G, F, D major; A, E, D minor) / transposed to C major. **Fingering:** finger
   numbers above the notes.
5. **Section and loop:**
   - You can practise the whole song, single phrases (2–4 bars) or the "tricky spots" taken from the player's
     mistake statistics. Sections have their own stars.
   - **Loop** repeats the section. In rhythm, it speeds up by 5 % after 3 clean runs and slows down when accuracy
     drops below 70 %. Find the notes finishes after 3 clean runs.
   - The left-hand **accompaniment** can also be set to a style: long bass notes, chords, waltz, polka, march,
     lullaby, tango or pop ballad.
6. **Coach after each run:** one specific tip and task ("Practise bars 5–8 at 60 %"), put together from the
   numbers about mistakes (which bars, what kind of mistake, speed, improvement since last time).
   **Full page of notes** (Settings → Notes): lines of music one below the other instead of one long line. The
   page scrolls to the current line as you play, and in In rhythm a marker moves along the line.
   **The on-screen keyboard** can be turned off when a piano is connected, so the notes get the full height (most
   room together with the full page). Adult players have both hands selected straight away for two-handed pieces.
7. **Edit notes:** an editor for any song (tap a note; arrow keys change the pitch, ←→ next note, 1–6 length, `.`
   dot, `R` rest, `T` tie, Cmd+Z undo). A note played on the piano is written into the selected note.
8. **Calibration** (Pause → Piano and sound in In rhythm mode): measures the delay of the piano or sound (Bluetooth) and subtracts it.
9. **Microphone:** playing without MIDI (acoustic piano, recorder, singing).
   - It needs a moment of silence at the start to measure the background noise.
   - The app knows which note it is waiting for and only listens for that one.
   - Play the accompaniment through headphones, otherwise the microphone hears it.
   - So far only tested on synthetic signals.
10. **Extras:**
    - *About the song* describes the key, range, repeats and tricky spots.
    - *Tapping a note* offers questions about it (which note it is, how long it lasts, which chord it belongs to…).
    - *How did it sound?* in the results gives feedback on expression, based on how hard the keys were struck and
      on phrasing. With "All the notes" it compares key velocity with the dynamics in the score: where the
      marking changes (p → f), the playing has to change too.
    - *Make up a song* writes a new song on a chosen topic, using only the notes C–G or the C major scale.
    - *Week* is a summary of the player's practice.
    - *Echo* is a game: the app plays a bit of the song and the player repeats it.

    The texts are put together by code from facts about the song and the practice; for children in shorter
    sentences.

## Piano over MIDI
Only **Chrome and Edge** support MIDI in the browser (Mac, Windows, Linux, Android); the browser asks for
permission once. Bluetooth on a Mac: Audio MIDI Setup → Window → Show MIDI Studio → Bluetooth icon → **Connect**
next to the piano (the piano must be on and not connected to another device, e.g. a phone; if it shows as
“offline”, turn it off and on). Rusalka finds the piano by itself (green dot in the top right corner). Safari and the browsers on
an iPad don't support MIDI: there you play on the on-screen keys or with the microphone.

## Where the data lives
- **In the browser** (default, IndexedDB): songs, players, their settings, results, statistics. **Download a backup** downloads them as a
  `.zip`, **Restore from a backup** loads them back (into another browser too), also a zip of the whole `Rusalka` folder. Both are in **Settings → Data and backups**.
- **In a folder** (Chrome, Edge): **Save to folder…** and pick a folder, ideally `~/Rusalka` (Documents is often
  synced through iCloud, which makes duplicate files when two programs write at once). For an empty folder, the
  app offers to fill it with the data from the browser. After a browser restart it may ask again (**Allow folder
  access**). Layout: `rusalka.json`, `pisne/` (songs), `data/*.json`, `zalohy/` (original files from before an
  edit in the editor). If a data file has changed elsewhere in the meantime (another tab, another computer), the
  app merges it before writing.
- **Samples** (public-domain works, `songs/`) are part of the website and are shown as library songs on their
  shelves. Your own song with the same file name takes priority. Library songs a player removed from home are remembered per
  player in `data/knihovnaSkryte.json`.

## Sheet music on paper
- **Audiveris** (free) converts a clean PDF of sheet music to MusicXML; check the result in the editor.
- **An AI chat** (Claude, ChatGPT…): **AI** (top right) **→ Sheet music from a photo → Copy instructions**, paste
  them into the chat with the photo or PDF, then paste the answer back with **Paste notes from the AI chat**. The
  answer is the text notation (`plugin/skills/rusalka-sheet-music/references/format.md`, one bar per line; the app has the
  parser in `static/lib/notation.js` and the prompt text in `static/lib/helper.js`, the format reference is generated
  into `static/lib/format.js`). Rusalka lists notation mistakes with line numbers; a valid notation opens in the
  new-song editor (bar lengths, rendering, saving). **Add song** also accepts a `.txt` file with the notation.
- **Week overview → Copy results** puts the players' last 7 days (songs, attempts, accuracy, speed, hard bars) and
  instructions for a summary on the clipboard; **Easier version** (at the selected song) adds
  the song's notation to instructions for an easier version.
- **Skills** (optional, `plugin/skills/`): `rusalka-sheet-music` (transcription; with code execution it uses
  `scripts/sheet.mjs`: `slice` – staves enlarged to read from, `check` – notation errors, bar lengths, MusicXML and
  a picture with bar numbers, `text` – MusicXML to notation, `add` – into the Rusalka folder) and `rusalka-progress`
  (summary from the copied results). `npm run skills` builds `build/rusalka-sheet-music.zip` and `rusalka-progress.zip`; `npm run web` serves the skill zips under `helper/`.

The skill has its own copies of `static/lib/song.js`, `note_names.js` and `notation.js` (refreshed by
`npm run skill`; a test checks they are up to date).

## Songs and copyright
The repository contains only public-domain and freely licensed works (`songs/`, generated by
`tools/samples.mjs`). Your own and copyrighted songs belong in `private/` (listed in `.gitignore`) or only in
the Rusalka folder.

## Development
```
npm install && npm run vendor      # Verovio into static/vendor
npm test                           # tests of the modules in static/lib (node --test)
npm run dev                        # development server http://localhost:8765 (static files + songs/)
npm run library                    # checks the song library (library/) and builds build/library/ (index.json, review page)
npm run web                        # static website into web/ (vendor, samples, songs/index.json, the library)
npm run skill                      # the skill's copies of song.js / note_names.js / notation.js and static/lib/format.js
npm run skills                     # skill zips into build/
node tools/samples.mjs             # regenerates the sample songs (public domain) in songs/; then npm run song-list
```
Release: a `v*` tag runs `.github/workflows/release.yml` – it builds the skill zips and
prepares a draft release; a person publishes it.

Requirements: Node.js 18+. The GitHub Pages website is built and deployed by `.github/workflows/pages.yml`
(enable it in the repository settings: Pages → Source: GitHub Actions).

## Architecture
- **`static/lib/`** – pure modules without the DOM, covered by tests:
  - `song.js` – the song model, MusicXML ↔ model, bar checks, unrolling repeats;
  - `levels.js` – levels, transposition, harmonisation, fingering;
  - `practice.js` – phrases, attempt summary and scoring (stars, best results), statistics, tempo plan and section
    loop, guide plan, coach;
  - `game.js` – play modes (`REZIM`), game timers, one frame of a running game, Find the notes key presses, guide steps;
  - `editor.js` – editor operations and history;
  - `compare.js` – compares a transcription with a verified song (conversion accuracy);
  - `microphone.js` – pitch detection from the microphone (MPM, spectrum, onsets);
  - `natural.js` – the animals in motion (set V13, 18 animals): the original drawing bent on a WebGL mesh (the eyes look
    first and the head follows, soft ears, fur and feathers, lids over a clean plate, the mouth opens in joy; the paws
    stay fixed); drawings in `static/animals/v13/`, rig data in `static/animals/v13.js` (generated by
    `node tools/animals.mjs <set folder>`);
  - `extras.js` – facts and texts for the extras, accompaniment styles, new song, Echo;
  - `midi_file.js` – reading MIDI files and turning tracks into notes;
  - `original.js` – the original MusicXML for "All the notes" (first part, unrolled repeats, attributes after
    jumps);
  - `render.js` – notes for playing from Verovio (line or page, timings, staves, dynamics from the score);
  - `difficulty.js` – difficulty estimate for the library;
  - `library.js` – the song library: the player's level, shelf order, which library songs are at home, the next song
    to suggest, search;
  - `storage.js` + `merge.js` – data in IndexedDB or in a folder (File System Access), merging, backup;
  - `files.js` + `zip.js` – reading MusicXML and `.mxl`, song titles, file names, ZIP;
  - `midi_output.js` – sound to the piano over Web MIDI (channel 2, a queue scheduled 100 ms ahead);
  - `accompaniment.js`, `pair.js` – accompaniment by time signature, playing as a pair.
- **`static/app.js`** – the game:
  - Verovio draws the notes on a single line from the unrolled model;
  - modes and sound (Web Audio);
  - MIDI: Web MIDI (input, and output to the piano), data through `lib/storage.js`, samples from
    `songs/index.json`.
- **`static/ui/`** – the interface:
  - `editor.js` – the note editor;
  - `microphone.js` – the microphone as a stand-in for MIDI;
  - `animals.js` – animal motion: the drawing in motion where WebGL works and the picture is big enough, otherwise the CSS motion;
  - `extras.js` – the extras windows.
- **`plugin/`** – the skills (`skills/rusalka-sheet-music`, `skills/rusalka-progress`); Rusalka is not published as a
  plugin, only the skills are (zips, and links for Claude Code and Codex in `INSTALL-AGENT.md`).
- **`tools/`** – development server, building the website and the skill packages, the list of samples;
  `library.mjs` checks and builds the song library (`npm run library`, see `library/README.md`).
