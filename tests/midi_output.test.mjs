import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vytvorVystup, vyberVystup } from '../static/lib/midi_output.js';

function prostredi() {
  let cas = 0, tiky = [];
  const port = { name: 'FP-10_75 Bluetooth', zpravy: [], send(b, ts) { this.zpravy.push([...b, ts]); } };
  const V = vytvorVystup({ ted: () => cas, interval: f => { tiky.push(f); return tiky.length; }, zrusInterval: () => { tiky = []; } });
  const posun = ms => { for (let i = 0; i < ms; i += 25) { cas += 25; tiky.forEach(f => f()); } };
  return { V, port, posun };
}

test('output only to the connected piano', () => {
  const o = [{ name: 'IAC Driver Bus 1' }, { name: 'FP-10_75 Bluetooth' }];
  assert.equal(vyberVystup(o, ['FP-10_75 Bluetooth']).name, 'FP-10_75 Bluetooth');
  assert.equal(vyberVystup(o, ['FP-10']).name, 'FP-10_75 Bluetooth');
  assert.equal(vyberVystup(o, []), null);
  assert.equal(vyberVystup([{ name: 'Network Session 1' }], ['FP-10']), null);
});

test('no piano, nothing; with a piano notes on time on channel 2; an overlap of the same pitch does not mute the newer keystroke', () => {
  const { V, port, posun } = prostredi();
  assert.equal(V.hraj([{ ms: 0, p: 60, v: 50 }]), false);
  V.pripoj(port);
  // C4 0–300, E4 100–200, C4 again 250–500
  V.hraj([{ ms: 0, p: 60, v: 50 }, { ms: 300, p: 60, v: 0 }, { ms: 100, p: 64, v: 60 }, { ms: 200, p: 64, v: 0 }, { ms: 250, p: 60, v: 70 }, { ms: 500, p: 60, v: 0 }]);
  posun(600);
  assert.deepEqual(port.zpravy, [
    [0x91, 60, 50, 0], [0x91, 64, 60, 100], [0x81, 64, 0, 200],
    [0x81, 60, 0, 250], [0x91, 60, 70, 250],
    [0x81, 60, 0, 500],
  ]);
  assert.ok(V.pouzivaSe);
});

test('sends at most 100 ms ahead', () => {
  const { V, port, posun } = prostredi();
  V.pripoj(port);
  V.hraj([{ ms: 50, p: 60, v: 40 }, { ms: 400, p: 62, v: 40 }]);
  assert.deepEqual(port.zpravy.map(z => z[1]), [60]);
  posun(275);
  assert.deepEqual(port.zpravy.map(z => z[1]), [60]);
  posun(50);
  assert.deepEqual(port.zpravy.map(z => z[1]), [60, 62]);
});

test('ticho: the rest of the queue is dropped, sounding notes are released at once even after the look-ahead was sent', () => {
  const { V, port, posun } = prostredi();
  V.pripoj(port);
  V.hraj([{ ms: 0, p: 67, v: 40 }, { ms: 1000, p: 67, v: 0 }, { ms: 500, p: 72, v: 40 }]);
  posun(50);
  V.ticho();
  posun(1000);
  assert.deepEqual(port.zpravy, [[0x91, 67, 40, 0], [0x81, 67, 0, 50], [0x81, 67, 0, 155], [0xB1, 123, 0, 50], [0xB1, 123, 0, 155]]);
});
