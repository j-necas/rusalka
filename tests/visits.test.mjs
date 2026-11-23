// The anonymous visit counter (GoatCounter, no cookies) runs only on the published website.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pocitatNavstevy, POCITADLO } from '../static/lib/visits.js';

test('visits are counted only on the published website, not locally', () => {
  assert.equal(pocitatNavstevy({ protocol: 'https:', hostname: 'rusalkapiano.com' }), true);
  assert.equal(pocitatNavstevy({ protocol: 'https:', hostname: 'user.github.io' }), true);
  assert.equal(pocitatNavstevy({ protocol: 'http:', hostname: '127.0.0.1' }), false);
  assert.equal(pocitatNavstevy({ protocol: 'https:', hostname: 'localhost' }), false);
  assert.deepEqual(POCITADLO, { src: 'goatcounter/count.js', data: 'https://rusalka.goatcounter.com/count' });
});

test('the GoatCounter script is hosted by the website itself (the official file, ISC licence, noted for third parties)', async () => {
  const { readFileSync } = await import('node:fs');
  const js = readFileSync(new URL('../static/goatcounter/count.js', import.meta.url), 'utf8');
  assert.match(js, /^\/\/ GoatCounter: https:\/\/www\.goatcounter\.com\n\/\/ This file is released under the ISC license/);
  assert.match(readFileSync(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8'), /GoatCounter[^\n]*static\/goatcounter\/count\.js[^\n]*ISC/);
});
