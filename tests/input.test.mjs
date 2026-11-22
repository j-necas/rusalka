// How this device plays: piano over MIDI, microphone, or only the on-screen keys (one at a time, remembered per device).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Vstup from '../static/lib/input.js';
import { REZIMY, nactiVstup, doprovodZapnuty, sDoprovodem, poZmeneKlaviru, prijimaZdroj, pripojeneVstupy, seznamPortu, klavesyViditelne } from '../static/lib/input.js';

test('three modes', () => {
  assert.deepEqual(REZIMY, ['midi', 'mikrofon', 'obrazovka']);
});

test('defaults: MIDI where the browser can, otherwise the on-screen keys; accompaniment off only with the microphone', () => {
  assert.deepEqual(nactiVstup(null, { midiUmi: true }), { rezim: 'midi', doprovod: { midi: true, mikrofon: false, obrazovka: true } });
  assert.equal(nactiVstup(null, { midiUmi: false }).rezim, 'obrazovka');
  assert.equal(nactiVstup({ rezim: 'midi' }, { midiUmi: false }).rezim, 'obrazovka');
  assert.equal(nactiVstup({ rezim: 'kytara' }, { midiUmi: true }).rezim, 'midi');
});

test('a stored choice is kept and missing accompaniment values get their defaults', () => {
  const v = nactiVstup({ rezim: 'mikrofon', doprovod: { midi: false } }, { midiUmi: true });
  assert.deepEqual(v, { rezim: 'mikrofon', doprovod: { midi: false, mikrofon: false, obrazovka: true } });
});

test('accompaniment follows the current mode and switching it changes only that mode', () => {
  const v = nactiVstup({ rezim: 'mikrofon' }, { midiUmi: true });
  assert.equal(doprovodZapnuty(v), false);
  assert.equal(doprovodZapnuty({ ...v, rezim: 'midi' }), true);
  const z = sDoprovodem(v, true);
  assert.deepEqual(z.doprovod, { midi: true, mikrofon: true, obrazovka: true });
  assert.equal(v.doprovod.mikrofon, false, 'the original is not changed');
  assert.equal(sDoprovodem({ ...v, rezim: 'obrazovka' }, false).doprovod.obrazovka, false);
});

test('a newly connected piano switches to MIDI; other changes keep the mode', () => {
  const v = nactiVstup({ rezim: 'mikrofon' }, { midiUmi: true });
  assert.equal(poZmeneKlaviru(v, 0, 1).rezim, 'midi');
  assert.equal(poZmeneKlaviru(v, 1, 2).rezim, 'mikrofon');
  assert.equal(poZmeneKlaviru(v, 1, 0).rezim, 'mikrofon');
  assert.equal(poZmeneKlaviru(v, 0, 0), v);
});

test('only the chosen source plays; touching the on-screen keys always does', () => {
  const m = r => ['midi', 'mikrofon', 'dotyk'].filter(z => prijimaZdroj(r, z)).join();
  assert.equal(m('midi'), 'midi,dotyk');
  assert.equal(m('mikrofon'), 'mikrofon,dotyk');
  assert.equal(m('obrazovka'), 'dotyk');
});

test('only connected MIDI inputs count (Chrome keeps unplugged ones as disconnected)', () => {
  const vstupy = [{ name: 'FP-10', state: 'connected' }, { name: 'Staré', state: 'disconnected' }, { name: 'Bez stavu' }];
  assert.deepEqual(pripojeneVstupy(vstupy), ['FP-10', 'Bez stavu']);
});

test('the on-screen keys show whenever nothing else can play', () => {
  assert.equal(klavesyViditelne({ klaviatura: false, rezim: 'midi', vstupFunguje: true }), false);
  assert.equal(klavesyViditelne({ klaviatura: false, rezim: 'midi', vstupFunguje: false }), true, 'no piano connected');
  assert.equal(klavesyViditelne({ klaviatura: false, rezim: 'mikrofon', vstupFunguje: false }), true, 'microphone refused or not started');
  assert.equal(klavesyViditelne({ klaviatura: false, rezim: 'obrazovka', vstupFunguje: false }), true);
  assert.equal(klavesyViditelne({ klaviatura: true, rezim: 'mikrofon', vstupFunguje: true }), true);
});

test('MIDI ports from the Web MIDI Browser app on an iPad (its values() is not iterable) are read like a Map', () => {
  // the app's port list: forEach(cb) calls cb(port); values() returns an object with only next(), no Symbol.iterator
  const ipad = porty => ({ size: porty.length, forEach: cb => porty.forEach(p => cb(p)), values: () => ({ next: () => ({ done: true }) }) });
  const porty = [{ name: 'Network Session 1', state: 'connected' }, { name: 'FP-10', state: 'connected' }];
  assert.deepEqual(pripojeneVstupy(seznamPortu(ipad(porty))), ['Network Session 1', 'FP-10']);
  assert.deepEqual(seznamPortu(new Map([['a', porty[1]]])), [porty[1]], 'Chrome: a real Map');
  assert.deepEqual(seznamPortu(null), []);
});

test('sustain measures both repeated touches of the same key until the pedal is lifted', () => {
  const mereni = Vstup.vytvorMereniDrzeni();
  const a = { drzenoMs: null }, b = { drzenoMs: null }, dotyk = { drzenoMs: null };
  mereni.pedal('klavir:0', true, 0);
  mereni.stisk('klavir:0', 60, a, 0, 0.5);
  mereni.pust('klavir:0', 60, 0.1);
  mereni.stisk('klavir:0', 60, b, 0.2, 0.5);
  mereni.pust('klavir:0', 60, 0.3);
  mereni.stisk('dotyk', 60, dotyk, 0.2, 0.5);
  mereni.pust('dotyk', 60, 0.4);
  assert.deepEqual([a.drzenoMs, b.drzenoMs, dotyk.drzenoMs], [null, null, 100]);
  mereni.pedal('klavir:1', false, 0.8);
  assert.equal(a.drzenoMs, null);
  mereni.pedal('klavir:0', false, 1);
  assert.deepEqual([a.drzenoMs, b.drzenoMs], [500, 400]);
});

test('an interrupted attempt cannot be altered by subsequent pedal releases', () => {
  const mereni = Vstup.vytvorMereniDrzeni(), zaznam = { drzenoMs: null };
  mereni.pedal('klavir:0', true, 0);
  mereni.stisk('klavir:0', 60, zaznam, 0, 1);
  mereni.pust('klavir:0', 60, 0.1);
  mereni.zrusPokus();
  mereni.pedal('klavir:0', false, 1);
  assert.equal(zaznam.drzenoMs, null);
});
