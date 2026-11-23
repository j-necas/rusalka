// Animals (drawn set C): 12 species with an expression atlas, names in both languages and motion timing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { OBRAZKY, prevedProfil } from '../static/lib/profiles.js';
import { obrazekHrace } from '../static/ui/pictures.js';
import { dalsiMrknuti, VYRAZY } from '../static/lib/animals.js';
import { POHYB } from '../static/animals/motion.js';
import cs from '../static/lang/cs.js';
import en from '../static/lang/en.js';

const DRUHY = ['lenochod', 'kralik', 'liska', 'sova', 'jezek', 'kocka', 'pejsek', 'panda-cervena', 'vydra', 'tucnak', 'kapybara', 'axolotl', 'veverka', 'myval', 'medvidek', 'koala', 'zabka', 'ovecka'];

test('18 animals: the first twelve in the same place and six new ones at the end', () => {
  assert.deepEqual(OBRAZKY.dite, DRUHY);
  for (const id of DRUHY) {
    assert.ok(existsSync(new URL(`../static/animals/${id}.webp`, import.meta.url)), id);
    assert.ok(POHYB[id]?.interval?.length === 2, id);
    assert.ok(cs[`obrazek.${id}`] && en[`obrazek.${id}`], `name ${id}`);
  }
});

test('an animal picture is an expression atlas with the idle expression; musical illustrations stay SVG', () => {
  const h = obrazekHrace({ obrazek: 'panda-cervena', jmeno: 'Ema' }, { tmava: '#000' });
  assert.match(h, /class="zvire"/);
  assert.match(h, /data-zvire="panda-cervena"/);
  assert.match(h, /data-vyraz="idle"/);
  const css = readFileSync(new URL('../static/style.css', import.meta.url), 'utf8');
  for (const id of DRUHY) assert.ok(css.includes(`.zvire[data-zvire="${id}"] { background-image: url("animals/${id}.webp"); }`), `CSS ${id}`);
  assert.match(obrazekHrace({ obrazek: 'metronom' }, { tmava: '#123456' }), /^<svg[^>]*><image href="pictures\/metronom.webp"/);
  assert.match(obrazekHrace({ obrazek: 'nesmysl', jmeno: 'Ota' }, { tmava: '#000' }), /O/);
});

test('expressions in the atlas: idle, blink on top, happy, wink at the bottom', () => {
  assert.deepEqual(VYRAZY, { idle: '0% 0%', blink: '100% 0%', happy: '0% 100%', wink: '100% 100%' });
});

test('blinking within an interval by temperament (sloth slower than rabbit)', () => {
  for (const id of DRUHY) {
    const [od, do_] = POHYB[id].interval;
    assert.equal(dalsiMrknuti(id, 0), od);
    assert.equal(dalsiMrknuti(id, 0.999999), Math.round(od + (do_ - od) * 0.999999));
  }
  assert.ok(POHYB.lenochod.interval[0] > POHYB.kralik.interval[0]);
  assert.equal(dalsiMrknuti('neznamy', 0), 5000);
});

test('an old profile with an animal gets a picture; new species are offered as free', () => {
  assert.equal(prevedProfil({ id: 'a', jmeno: 'A', zvire: 'kralik' }).obrazek, 'kralik');
  const vsichni = DRUHY.slice(0, 6).map((o, i) => ({ id: 'x' + i, obrazek: o }));
  assert.equal(prevedProfil({ id: 'n', jmeno: 'N' }, vsichni).obrazek, 'pejsek');
});

// ---------------------------------------------------------------- livelier motion (set v2)
import { vzorek, DELKA_POHYBU } from '../static/lib/animals.js';

test('every species has v2 motion parameters (tempo and amplitude)', () => {
  for (const id of DRUHY) {
    const p = POHYB[id].v2;
    assert.ok(p && p.cycle >= 6 && p.cycle <= 8 && p.hop > 0 && p.blink > 0, id);
  }
  assert.ok(POHYB.kralik.v2.hop > POHYB.lenochod.v2.hop, 'the rabbit jumps higher than the sloth');
});

test('alive loop: still at the start, blinks at 18 % of the cycle, the rabbit blinks twice', () => {
  const s0 = vzorek('kralik', 'alive', 0);
  assert.deepEqual([s0.x, s0.y, s0.rotation, s0.sx, s0.sy, s0.state], [0, 0, 0, 1, 1, 'idle']);
  const p = POHYB.kralik.v2, b = p.cycle * 0.18;
  assert.equal(vzorek('kralik', 'alive', b + 0.01).state, 'blink');
  assert.equal(vzorek('kralik', 'alive', b + p.blink + 0.11 + 0.01).state, 'blink', 'second blink');
  assert.equal(vzorek('lenochod', 'alive', POHYB.lenochod.v2.cycle * 0.18 + POHYB.lenochod.v2.blink + 0.11 + 0.01).state, 'idle', 'sloth blinks once');
  assert.deepEqual(vzorek('kralik', 'alive', 1.234), vzorek('kralik', 'alive', 1.234 + p.cycle), 'loops');
});

test('happy: crouch, jump up with a happy face, settle back still', () => {
  const dole = vzorek('kralik', 'happy', 0.18), nahore = vzorek('kralik', 'happy', 0.46), konec = vzorek('kralik', 'happy', DELKA_POHYBU.happy);
  assert.ok(dole.y > 0 && dole.sy < 1, 'crouch');
  assert.ok(nahore.y < -30 && nahore.state === 'happy', `jump ${nahore.y}`);
  assert.equal(konec.y, 0); assert.equal(konec.rotation, 0); assert.equal(konec.state, 'idle');
  assert.ok(Math.abs(vzorek('lenochod', 'happy', 0.46).y) < Math.abs(nahore.y), 'the sloth jumps less');
});

test('greeting winks, curiosity tilts; intensity scales the motion', () => {
  assert.equal(vzorek('liska', 'wink', 0.5).state, 'wink');
  assert.ok(vzorek('liska', 'curious', 0.8).rotation > 5);
  assert.equal(vzorek('rusalka', 'wink', 0.5).state, 'wink');
  assert.equal(vzorek('rusalka', 'blink', 0.1).state, 'blink');
  assert.equal(vzorek('rusalka', 'happy', 0.5).state, 'happy');
  const a = vzorek('pejsek', 'happy', 0.46, 1), b = vzorek('pejsek', 'happy', 0.46, 0.55);
  assert.ok(Math.abs(b.y) < Math.abs(a.y));
  assert.deepEqual(Object.keys(DELKA_POHYBU).sort(), ['blink', 'curious', 'happy', 'wink']);
});
