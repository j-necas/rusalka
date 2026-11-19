// Helper (any chat AI): prompts to copy and the results text – pure logic, no window.
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nastavJazyk } from '../static/lib/texts.js';
import cs from '../static/lang/cs.js';
import en from '../static/lang/en.js';
import { pokyny, vysledkyText, videoUkazky } from '../static/lib/helper.js';
import { FORMAT } from '../static/lib/format.js';
import { zMusicXml } from '../static/lib/song.js';
import { formatJs } from '../tools/format-js.mjs';

const CESKE = /[ěščřžýáíéůúňťď]/i;
const KUBO = zMusicXml(readFileSync(new URL('../songs/Frère Jacques.musicxml', import.meta.url), 'utf8'));
const DEN = 864e5, TED = Date.UTC(2026, 10, 16, 12);

test('the format reference in the app is up to date with the skill (tools/format-js.mjs)', () => {
  assert.equal(readFileSync(new URL('../static/lib/format.js', import.meta.url), 'utf8'), formatJs());
  assert.match(FORMAT, /one bar per line/i);
});

test('instructions for sheet music: steps, the format and the answer as one copyable block, in the user language', () => {
  nastavJazyk('en', en);
  const p = pokyny('noty');
  assert.ok(p.includes(FORMAT));
  assert.match(p, /photo|PDF/); assert.match(p, /code block/i);
  // the answer in the language of the instructions (not "my language": the AI guessed it from the browser), a title if missing
  assert.match(p, /Reply in English\./); assert.match(p, /no title.*file name/);
  assert.ok(!CESKE.test(p.replace(FORMAT, '')), 'English instructions');
  nastavJazyk('cs', cs);
  assert.match(pokyny('noty'), /fotk/); assert.match(pokyny('noty'), /Odpovídej česky\./);
});

test('instructions for an easier version contain the song notation', () => {
  nastavJazyk('en', en);
  const p = pokyny('uprava', { pisen: KUBO });
  assert.match(p, /title: Frère Jacques/);
  assert.match(p, /easier|five fingers/i);
  nastavJazyk('cs', cs);
});

test('results text: visible players only, songs with accuracy, speed and hard bars, no Czech in English', () => {
  nastavJazyk('en', en);
  const hist = (k, presnost, rychlost) => ({ kdy: TED - k * DEN, presnost, rychlost, krok: 'tempo', cisty: presnost === 1 });
  const stav = {
    profily: [{ id: 'e', jmeno: 'Ema', vek: 'dite' }, { id: 'o', jmeno: 'Ota' }, { id: 'x', smazano: 5 }],
    seznam: [{ soubor: 'Frère Jacques.musicxml', nazev: 'Frère Jacques' }],
    statistiky: {
      e: { 'Frère Jacques.musicxml#2': { historie: [hist(6, 0.6, 80), hist(5, 0.6, 80), hist(4, 0.6, 80), hist(3, 1, 90), hist(2, 1, 100), hist(1, 1, 100)], takty: { 4: { noty: 10, chyby: 4 } } } },
      x: { 'Frère Jacques.musicxml#2': { historie: [hist(1, 0.5, 60)] } },
    },
  };
  stav.vysledky = { e: { 'Frère Jacques.musicxml': { cekam: { hvezdy: 3 }, pockej: { hvezdy: 2 } } } };
  stav.statistiky.e['Frère Jacques.musicxml#2'].historie.unshift({ kdy: TED - 20 * DEN, presnost: 0.5, rychlost: 60, krok: 'cekam' });
  const s = vysledkyText(stav, TED);
  assert.match(s, /level 2/i, 'level of the statistics');
  assert.match(s, /In rhythm/, 'last step played');
  assert.match(s, /Find the notes ★★★/, 'stars per step');
  assert.match(s, /before: 50\s*%|50% before/i, 'accuracy before the week');
  assert.match(s, /Ema/); assert.match(s, /Ota/); assert.match(s, /Frère Jacques/);
  assert.match(s, /60\s*%.*100\s*%|60%.*100%/s);
  assert.ok(!/smazano|\bx\b/.test(s));
  assert.ok(!CESKE.test(s.replace(/Frère/g, '')), s);
  assert.match(s, /summary/i);
  nastavJazyk('cs', cs);
  assert.match(vysledkyText(stav, TED), /Ema/);
});

test('demo videos are Czech for Czech and Slovak, English otherwise', () => {
  assert.deepEqual(videoUkazky('cs'), { src: 'video/ai.cs.mp4', poster: 'video/ai.cs.jpg' });
  assert.equal(videoUkazky('sk', 'playing').src, 'video/playing.cs.mp4');
  for (const k of ['en', 'de', 'pt-BR', 'zh-CN']) assert.equal(videoUkazky(k, 'playing').src, 'video/playing.mp4');
});
