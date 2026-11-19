// The anonymous visit counter (GoatCounter, no cookies) runs only on the published website.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pocitatNavstevy, POCITADLO } from '../static/lib/visits.js';

test('visits are counted only on the published website, not locally', () => {
  assert.equal(pocitatNavstevy({ protocol: 'https:', hostname: 'rusalkapiano.com' }), true);
  assert.equal(pocitatNavstevy({ protocol: 'https:', hostname: 'user.github.io' }), true);
  assert.equal(pocitatNavstevy({ protocol: 'http:', hostname: '127.0.0.1' }), false);
  assert.equal(pocitatNavstevy({ protocol: 'https:', hostname: 'localhost' }), false);
  assert.deepEqual(POCITADLO, { src: 'https://gc.zgo.at/count.js', data: 'https://rusalka.goatcounter.com/count' });
});
