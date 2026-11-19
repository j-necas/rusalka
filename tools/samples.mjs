// Sample songs in the public domain (traditional / copyright expired). Generates songs/*.musicxml.
// Usage: node tools/samples.mjs
// Bar notation: 'CHORD@beat CHORD@beat | note/length note/length …' – length: 4 = quarter, 2 = half, 8 = eighth,
// 2. = dotted half, 1 = whole, 16 = sixteenth; 'r' = rest; lyric syllable after '=' ('E4/4=Ma-').
// Public domain: folk songs, composers who died more than 70 years ago; lyrics only where they are free as well.
import { writeFileSync } from 'node:fs';
import { naMusicXml, naZlomek, kontrola } from '../static/lib/song.js';

const DELKY = { 1: 4, 2: 2, '2.': 3, 4: 1, '4.': 1.5, 8: 0.5, '8.': 0.75, 16: 0.25 };
function takt(zapis) {
  const [ak, nt] = zapis.split('|').map(s => s.trim());
  const akordy = ak ? ak.split(/\s+/).map(a => { const [znacka, doba] = a.split('@'); return { doba: Number(doba || 0), znacka }; }) : [];
  const noty = nt.split(/\s+/).map(x => {
    const [nota, slabika = ''] = x.split('=');
    const [t, d] = nota.split('/');
    if (!(d in DELKY)) throw new Error(`unknown length in „${x}“`);
    return { t, d: naZlomek(DELKY[d]), lig: false, s: slabika.replace(/_/g, ' ') };
  });
  return { akordy, noty };
}
function pisen(nazev, autor, takt_, predznamenani, tempo, zapisy) {
  return { nazev, autor, klic: 'houslovy', predznamenani, takt: takt_, tempo, takty: zapisy.map(takt) };
}

const twinkle = [
  'C | C4/4 C4/4 G4/4 G4/4', 'F C@2 | A4/4 A4/4 G4/2', 'F C@2 | F4/4 F4/4 E4/4 E4/4', 'G C@2 | D4/4 D4/4 C4/2',
  'C F@2 | G4/4 G4/4 F4/4 F4/4', 'C G@2 | E4/4 E4/4 D4/2', 'C F@2 | G4/4 G4/4 F4/4 F4/4', 'C G@2 | E4/4 E4/4 D4/2',
  'C | C4/4 C4/4 G4/4 G4/4', 'F C@2 | A4/4 A4/4 G4/2', 'F C@2 | F4/4 F4/4 E4/4 E4/4', 'G C@2 | D4/4 D4/4 C4/2',
];
const kubo = [
  'C | C4/4 D4/4 E4/4 C4/4', 'C | C4/4 D4/4 E4/4 C4/4', 'C | E4/4 F4/4 G4/2', 'C | E4/4 F4/4 G4/2',
  'C | G4/8 A4/8 G4/8 F4/8 E4/4 C4/4', 'C | G4/8 A4/8 G4/8 F4/8 E4/4 C4/4', 'C G@1 C@2 | C4/4 G3/4 C4/2', 'C G@1 C@2 | C4/4 G3/4 C4/2',
];
const oda = [
  'C | E4/4 E4/4 F4/4 G4/4', 'G | G4/4 F4/4 E4/4 D4/4', 'C | C4/4 C4/4 D4/4 E4/4', 'G | E4/4. D4/8 D4/2',
  'C | E4/4 E4/4 F4/4 G4/4', 'G | G4/4 F4/4 E4/4 D4/4', 'C | C4/4 C4/4 D4/4 E4/4', 'G C@2 | D4/4. C4/8 C4/2',
  'G C@3 | D4/4 D4/4 E4/4 C4/4', 'G C@3 | D4/4 E4/8 F4/8 E4/4 C4/4', 'G | D4/4 E4/8 F4/8 E4/4 D4/4', 'C G@2 | C4/4 D4/4 G3/2',
  'C | E4/4 E4/4 F4/4 G4/4', 'G | G4/4 F4/4 E4/4 D4/4', 'C | C4/4 C4/4 D4/4 E4/4', 'G C@2 | D4/4. C4/8 C4/2',
];

// ---------------------------------------------------------------- more public-domain pieces
const mary = [
  'C | E4/4=Ma- D4/4=ry C4/4=had D4/4=a', 'C | E4/4=lit- E4/4=tle E4/2=lamb,', 'G | D4/4=lit- D4/4=tle D4/2=lamb,',
  'C | E4/4=lit- G4/4=tle G4/2=lamb,', 'C | E4/4=Ma- D4/4=ry C4/4=had D4/4=a', 'C | E4/4=lit- E4/4=tle E4/4=lamb, E4/4=its',
  'G | D4/4=fleece D4/4=was E4/4=white D4/4=as', 'C | C4/1=snow.',
];
const london = [
  'C | G4/4.=Lon- A4/8=don G4/4=Bridge F4/4=is', 'C | E4/4=fall- F4/4=ing G4/2=down,', 'G7 | D4/4=fall- E4/4=ing F4/2=down,',
  'C | E4/4=fall- F4/4=ing G4/2=down,', 'C | G4/4.=Lon- A4/8=don G4/4=Bridge F4/4=is', 'C | E4/4=fall- F4/4=ing G4/2=down,',
  'G7 | D4/2=my G4/2=fair', 'C | E4/4=la- C4/2.=dy.',
];
const row = [
  'C | C4/4.=Row, C4/4.=row,', 'C | C4/4=row D4/8=your E4/4.=boat,', 'C | E4/4=gent- D4/8=ly E4/4=down F4/8=the', 'C | G4/2.=stream.',
  'C | C5/8=Mer- C5/8=ri- C5/8=ly, G4/8=mer- G4/8=ri- G4/8=ly,', 'C | E4/8=mer- E4/8=ri- E4/8=ly, C4/8=mer- C4/8=ri- C4/8=ly,',
  'G7 | G4/4=life F4/8=is E4/4=but D4/8=a', 'C | C4/2.=dream.',
];
const narozeniny = [
  ' | G4/8.=Hap- G4/16=py', 'C | A4/4=birth- G4/4=day C5/4=to', 'G7 | B4/2=you, G4/8.=hap- G4/16=py', 'G7 | A4/4=birth- G4/4=day D5/4=to',
  'C | C5/2=you, G4/8.=hap- G4/16=py', 'C | G5/4=birth- E5/4=day C5/4=dear', 'F | B4/4=Ma- A4/4=ry, F5/8.=hap- F5/16=py',
  'C G7@2 | E5/4=birth- C5/4=day D5/4=to', 'C | C5/2.=you!',
];
const jingle = [
  'C | E4/4=Jin- E4/4=gle E4/2=bells,', 'C | E4/4=jin- E4/4=gle E4/2=bells,', 'C | E4/4=jin- G4/4=gle C4/4.=all D4/8=the', 'C | E4/1=way!',
  'F | F4/4=Oh F4/4=what F4/4.=fun F4/8=it', 'C | F4/4=is E4/4=to E4/4=ride E4/8=in E4/8=a', 'G7 | E4/4=one D4/4=horse D4/4=o- E4/4=pen',
  'G7 | D4/2=sleigh, G4/2=hey!', 'C | E4/4=Jin- E4/4=gle E4/2=bells,', 'C | E4/4=jin- E4/4=gle E4/2=bells,', 'C | E4/4=jin- G4/4=gle C4/4.=all D4/8=the',
  'C | E4/1=way!', 'F | F4/4=Oh F4/4=what F4/4=fun F4/4=it', 'C | F4/4=is E4/4=to E4/4=ride E4/8=in E4/8=a', 'G7 | G4/4=one G4/4=horse F4/4=o- D4/4=pen',
  'C | C4/1=sleigh!',
];
const ticha = [
  'C | G4/4. A4/8 G4/4', 'C | E4/2.', 'C | G4/4. A4/8 G4/4', 'C | E4/2.', 'G7 | D5/2 D5/4', 'G7 | B4/2.', 'C | C5/2 C5/4', 'C | G4/2.',
  'F | A4/2 A4/4', 'F | C5/4. B4/8 A4/4', 'C | G4/4. A4/8 G4/4', 'C | E4/2.', 'F | A4/2 A4/4', 'F | C5/4. B4/8 A4/4', 'C | G4/4. A4/8 G4/4',
  'C | E4/2.', 'G7 | D5/2 D5/4', 'G7 | F5/4. D5/8 B4/4', 'C | C5/2.', 'C | E5/2.', 'C | C5/4 G4/4 E4/4', 'G7 | G4/4. F4/8 D4/4', 'C | C4/2.',
];
const ukolebavka = [
  ' | E4/8 E4/8', 'C | G4/2 E4/8 E4/8', 'C | G4/2 E4/8 G4/8', 'G7 | C5/4 B4/4. A4/8', 'G7 | A4/4 G4/4 D4/8 E4/8', 'G7 | F4/4 D4/4 D4/8 E4/8',
  'G7 | F4/2 D4/8 F4/8', 'G7 | B4/8 A4/8 G4/4 B4/4', 'C | C5/2 C4/8 C4/8', 'F | C5/2 A4/8 F4/8', 'C | G4/2 E4/8 C4/8', 'G7 | F4/4 G4/4 A4/4',
  'C | G4/2 C4/8 C4/8', 'F | C5/2 A4/8 F4/8', 'C | G4/2 E4/8 C4/8', 'G7 | F4/4 E4/4 D4/4', 'C | C4/2.',
];
const eliska = [
  ' | E5/16 D#5/16', ' | E5/16 D#5/16 E5/16 B4/16 D5/16 C5/16', 'Am | A4/8 r/16 C4/16 E4/16 A4/16', 'E | B4/8 r/16 E4/16 G#4/16 B4/16',
  'Am | C5/8 r/16 E4/16 E5/16 D#5/16', ' | E5/16 D#5/16 E5/16 B4/16 D5/16 C5/16', 'Am | A4/8 r/16 C4/16 E4/16 A4/16',
  'E | B4/8 r/16 E4/16 C5/16 B4/16', 'Am | A4/4.',
];
const menuet = [
  'G | D5/4 G4/8 A4/8 B4/8 C5/8', 'G | D5/4 G4/4 G4/4', 'C | E5/4 C5/8 D5/8 E5/8 F#5/8', 'G | G5/4 G4/4 G4/4',
  'C | C5/4 D5/8 C5/8 B4/8 A4/8', 'G | B4/4 C5/8 B4/8 A4/8 G4/8', 'D | F#4/4 G4/8 A4/8 B4/8 G4/8', 'D | A4/2.',
  'G | D5/4 G4/8 A4/8 B4/8 C5/8', 'G | D5/4 G4/4 G4/4', 'C | E5/4 C5/8 D5/8 E5/8 F#5/8', 'G | G5/4 G4/4 G4/4',
  'C | C5/4 D5/8 C5/8 B4/8 A4/8', 'G | B4/4 C5/8 B4/8 A4/8 G4/8', 'D7 | A4/4 B4/8 A4/8 G4/8 F#4/8', 'G | G4/2.',
];

const pisne = [
  ['Twinkle, Twinkle, Little Star', pisen('Twinkle, Twinkle, Little Star', 'traditional (France, 18th century: Ah, vous dirai-je, maman)', '4/4', 0, 100, twinkle)],
  ['Frère Jacques', pisen('Frère Jacques', 'traditional (France)', '4/4', 0, 100, kubo)],
  ['Ode to Joy', pisen('Ode to Joy', 'Ludwig van Beethoven (1824)', '4/4', 0, 96, oda)],
  ['Mary Had a Little Lamb', pisen('Mary Had a Little Lamb', 'traditional (USA, 19th century)', '4/4', 0, 100, mary)],
  ['London Bridge', pisen('London Bridge Is Falling Down', 'traditional (England)', '4/4', 0, 100, london)],
  ['Row, Row, Row Your Boat', pisen('Row, Row, Row Your Boat', 'traditional (England, 19th century)', '6/8', 0, 90, row)],
  ['Happy Birthday', pisen('Happy Birthday to You', 'Mildred and Patty Hill (1893)', '3/4', 0, 100, narozeniny)],
  ['Jingle Bells (chorus)', pisen('Jingle Bells', 'James Lord Pierpont (1857)', '4/4', 0, 120, jingle)],
  ['Silent Night', pisen('Silent Night', 'Franz Xaver Gruber (1818)', '6/8', 0, 80, ticha)],
  ['Lullaby (Brahms)', pisen('Lullaby', 'Johannes Brahms (1868)', '3/4', 0, 80, ukolebavka)],
  ['Für Elise (opening)', pisen('Für Elise', 'Ludwig van Beethoven (1810)', '3/8', 0, 66, eliska)],
  ['Minuet in G', pisen('Minuet in G', 'Christian Petzold (formerly attributed to J. S. Bach)', '3/4', 1, 110, menuet)],
];
for (const [soubor, p] of pisne) {
  const k = kontrola(p);
  if (k.length) throw new Error(`${soubor}: ${k.join('; ')}`);
  writeFileSync(new URL(`../songs/${soubor}.musicxml`, import.meta.url), naMusicXml(p));
  console.log('ok', soubor, p.takty.length, 'bars');
}
