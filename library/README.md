# Song library

Songs offered on the website's Home, on the shelf tabs (Children's songs, Folk songs of the world, Christmas, Classics). Each song is a small text file in Rusalka's text notation
(one bar per line, see [the format](../plugin/skills/rusalka-sheet-music/references/format.md)) in a shelf folder:

| Folder | Shelf |
|---|---|
| `children/` | Children's songs |
| `folk/` | Folk songs of the world |
| `christmas/` | Christmas |
| `classics/` | Classics |

`npm run library` checks every song and builds `build/library/`: a MusicXML file per song, `index.json` (title,
shelf, precomputed difficulty, author, language, translation of the title) and `review.html`, a page with every
song's score and a ▶ button to check it by listening (`/library/review.html` on the dev server). `npm run web`
copies the library into the website.

## Adding a song

1. **Check that it is free** (see below). If in doubt, leave it out.
2. Write the melody as `library/<shelf>/<name>.txt`; the name uses lowercase letters, digits and hyphens
   (`skakal-pes.txt`). Header: `title` as the song is known in its original language, `author` (composer, and the
   lyricist if any; `traditional` for folk songs), `time`, `key`, `tempo`, `clef: treble`.
   - Our own transcription, checked against a free source (a 19th-century songbook such as Erben's *Prostonárodní
     české písně a říkadla*, IMSLP, Mutopia, Wikisource, Wikipedia score excerpts). Don't copy someone else's
     arrangement.
   - Folk songs: the version commonly sung today wins when it differs from an old print; say so in `zdroj`.
   - Chord symbols are our own and simple. Lyrics only in the original language or in a free translation;
     otherwise no lyrics. A left hand only where it belongs to the piece (mainly classics).
   - No `?` (uncertain bars): a library song is checked before it goes in.
3. Add an entry to `catalog.json`:
   ```json
   { "txt": "children/alle-meine-entchen.txt", "police": "children", "jazyk": "de",
     "zdroj": "what the melody was compared with", "volne": "traditional",
     "preklad": { "en": "All My Little Ducklings", "cs": "Všechny moje kachničky" } }
   ```
   `police` is the shelf, `jazyk` the language of the title and lyrics, `zdroj` the source you actually compared
   the melody with (name only sources you really checked), `volne` why the song is free (`traditional`,
   `J. Brahms †1897`, …), `preklad` an optional translation of the title.
4. Run `npm run library` (it must report 0 errors) and listen to the song on `/library/review.html`.

The build fails when a song has no catalog entry or the reverse, when a bar has the wrong length, a field is
missing, the shelf is unknown, the title repeats another library song or one of the starter songs in `songs/`.
These checks compare **titles only**: the same tune under another title (e.g. "Bruder Jakob" or "Panie Janie" for
the starter song Frère Jacques, "Baa, Baa, Black Sheep" for Twinkle, Twinkle) is not caught – the author and the
reviewer must check that a new song is not a starter song in disguise.

## Changing a published song

- **Never rename or move a published song** (its file or shelf folder). Its id in the app is its path
  (`library/<shelf>/<name>.musicxml`): children's stars, statistics, favourites and home visibility are stored under
  it, so a new path loses all of them. Fix the title, notes or catalog entry in place instead.
- Fixing notes is fine, but treat a change in the **number of bars** as a reset of the song's hard-spot statistics:
  they are stored per bar number, so after bars are added or removed they point to the wrong bars (bars past the
  new end are ignored) and the hard spots the app offers for that song are wrong until the child has played it
  again for a while. The app does not detect this. Keep the bar count when you can, and correct the bar count of a
  published song only when the song is really wrong.

## What counts as free

- **Traditional** (anonymous folk songs and carols), or
- composer **and** lyricist died before 1 January 1956 (70 years after death; the year moves on each January).
- Lyrics only in their original language or in a translation that is itself free; otherwise the song goes in
  without lyrics.
- No pop or film music, nothing still under copyright, and no arrangement or edition copied from a modern score.

## Licence

The transcriptions in this folder and the generated `index.json` are dedicated to the public domain under
[CC0 1.0](../LICENSES/CC0-1.0.txt). By contributing a song you agree to release your transcription under CC0.
