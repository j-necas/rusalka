import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { zMusicXml, kontrola } from '../static/lib/song.js';
import { zTextu, naText } from '../plugin/skills/rusalka-sheet-music/scripts/lib/notation.js';

const cti = f => readFileSync(new URL(f, import.meta.url), 'utf8');

test('the skill has up-to-date copies of song.js, note_names.js and notation.js (npm run skill)', () => {
  assert.equal(cti('../plugin/skills/rusalka-sheet-music/scripts/lib/song.js'), cti('../static/lib/song.js'));
  assert.equal(cti('../plugin/skills/rusalka-sheet-music/scripts/lib/note_names.js'), cti('../static/lib/note_names.js'));
  assert.equal(cti('../plugin/skills/rusalka-sheet-music/scripts/lib/notation.js'), cti('../static/lib/notation.js'));
});

test('every sample survives a round trip through the text format unchanged', () => {
  for (const f of readdirSync(new URL('../songs/', import.meta.url)).filter(x => x.endsWith('.musicxml'))) {
    const p = zMusicXml(cti(`../songs/${f}`));
    const { pisen, chyby } = zTextu(naText(p));
    assert.deepEqual(chyby, [], f);
    assert.deepEqual(pisen.takty, p.takty, f);
    assert.equal(pisen.takt, p.takt); assert.equal(pisen.predznamenani, p.predznamenani); assert.equal(pisen.nazev, p.nazev);
  }
});

test('text format: chords, dyads, triplets, dots, ties, syllables, markings, left hand and uncertainties', () => {
  const { pisen, chyby } = zTextu(`název: Zkouška
takt: 3/4
předznamenání: -1
tempo: 90
---
# komentář
1) {|: ?} F C7@2 | A4/4.^3=Ka- G4/8=če- F4/4~ || F3+A3+C4/2.
2) {1. :|} | F4/8t G4/8t A4/8t Bb4/2 || r/4 C3/2
3) {2.} | F4/2. || F2/2.
`);
  assert.deepEqual(chyby, []);
  assert.deepEqual(pisen.takty[0].akordy, [{ doba: 0, znacka: 'F' }, { doba: 2, znacka: 'C7' }]);
  assert.deepEqual(pisen.takty[0].noty.map(n => [n.t, n.d, n.lig, n.s]), [['A4', '3/8', false, 'Ka-'], ['G4', '1/8', false, 'če-'], ['F4', '1/4', true, '']]);
  assert.equal(pisen.takty[0].leva[0].t, 'F3 A3 C4');
  assert.equal(pisen.takty[0].noty[0].prst, 3);
  assert.equal(zTextu(naText(pisen)).pisen.takty[0].noty[0].prst, 3);
  assert.deepEqual(pisen.takty[1].noty.slice(0, 3).map(n => n.d), ['1/12', '1/12', '1/12']);
  assert.deepEqual(pisen.takty[0].znacky, { zacatekRepetice: true });
  assert.deepEqual(pisen.takty[1].znacky, { volta: [1], konecRepetice: true });
  assert.deepEqual(pisen.nejistoty, ['takt 1']);
  assert.deepEqual(kontrola(pisen), []);
});

test('text format: clear errors with a line number', () => {
  const { chyby } = zTextu('takt: 4/4\n---\n| C4/4 D4/3\nC4/4 D4/4\n');
  assert.ok(chyby.some(c => c.startsWith('řádek 3: nota „D4/3“')));
  assert.ok(chyby.some(c => c.startsWith('řádek 4: chybí „|“')));
});

test('rozrez: finds staves even on a tilted page with lyrics and straightens the crops (only with the skill libraries)', async t => {
  let O, Resvg;
  try {
    O = await import('../plugin/skills/rusalka-sheet-music/scripts/lib/staves.mjs');
    ({ Resvg } = await import('../plugin/skills/rusalka-sheet-music/node_modules/@resvg/resvg-js/index.js'));
  } catch { t.skip('npm install missing in the skill folder'); return; }
  // 1200×1600 page: three staves with 12 px line spacing, tilted 1.2°, with "lyrics" lines of the same spacing below them
  const linky = [], uhel = 1.2;
  for (const y0 of [300, 650, 1000]) for (let l = 0; l < 5; l++) linky.push(`<line x1="100" x2="1100" y1="${y0 + 12 * l}" y2="${y0 + 12 * l}" stroke="#555" stroke-width="1.5"/>`);
  for (let r = 0; r < 5; r++) for (let x = 120; x < 1050; x += 70) linky.push(`<rect x="${x}" y="${1300 + 30 * r}" width="40" height="9" fill="#222"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><rect width="1200" height="1600" fill="#fff"/>`
    + `<g transform="rotate(${uhel} 600 800)">${linky.join('')}</g></svg>`;
  const png = new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
  const osnovy = O.najdiOsnovy(png);
  assert.equal(osnovy.length, 3);
  for (const o of osnovy) {
    assert.ok(Math.abs(o.s - 12) < 1, `spacing ${o.s}`);
    assert.ok(Math.abs(o.uhel - uhel) < 0.25, `tilt ${o.uhel}`);
  }
  const v = O.vyrezy(png, osnovy[1], { linky: false });
  assert.ok(v.length >= 1 && v[0].png.length > 1000);
});
