import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Hra from '../static/lib/game.js';
import { metrum } from '../static/lib/song.js';

test('paused transitions retain their remaining time; stopping discards them', () => {
  let ted = 0, id = 0;
  const fronta = new Map(), kroky = [];
  const casovace = Hra.vytvorCasovace({ ted: () => ted, nastav: (fn, ms) => { fronta.set(++id, { fn, kdy: ted + ms }); return id; },
    zrus: id => fronta.delete(id) });
  const prejdiNa = ms => {
    ted = ms;
    for (const [id, u] of fronta) if (u.kdy <= ted) { fronta.delete(id); u.fn(); }
  };
  casovace.pridej(() => kroky.push('finish'), 1200);
  prejdiNa(400);
  casovace.pozastav();
  prejdiNa(4000);
  assert.deepEqual(kroky, []);
  casovace.pokracuj();
  prejdiNa(4799);
  assert.deepEqual(kroky, []);
  prejdiNa(4800);
  assert.deepEqual(kroky, ['finish']);
  casovace.pridej(() => kroky.push('listen'), 1200);
  casovace.pozastav();
  casovace.zrus();
  casovace.pokracuj();
  prejdiNa(7000);
  assert.deepEqual(kroky, ['finish']);
  assert.equal(casovace.ceka, false);
});

test('a delayed song load cannot publish or enable playback after another selection', async () => {
  const zmeny = [];
  const vyber = Hra.vytvorVyberPisne(pripravena => zmeny.push(pripravena));
  let dokoncit;
  const pomalu = new Promise(r => { dokoncit = r; });
  const prvni = vyber.nacti('A', async plati => { await pomalu; return plati(); });
  assert.equal(vyber.pripravena('A'), false);
  await vyber.nacti('B', async plati => plati());
  dokoncit();
  assert.equal(await prvni, false);
  assert.equal(vyber.pripravena('B'), true);
  assert.equal(vyber.pripravena('A'), false);
  vyber.zrus();
  assert.equal(vyber.pripravena('B'), false);
  assert.deepEqual(zmeny, [false, false, true, false]);
});

test('audio waits for an interrupted context to resume', async () => {
  let obnov, hotovo = false;
  const ac = { state: 'interrupted', resume: () => new Promise(r => { obnov = () => { ac.state = 'running'; r(); }; }) };
  const pokus = Hra.obnovAudio(ac).then(ac => { hotovo = true; return ac; });
  await Promise.resolve();
  assert.equal(hotovo, false);
  obnov();
  assert.equal(await pokus, ac);
});

test('resize may reflow an idle score but preserves a partial chord and a completed game', () => {
  const klid = { bezi: false, idx: 0, stisk: new Set(), chyby: 0 };
  assert.equal(Hra.lzePrekreslit(klid), true);
  assert.equal(Hra.lzePrekreslit({ ...klid, stisk: new Set([60]) }), false);
  assert.equal(Hra.lzePrekreslit({ ...klid, idx: 2 }), false);
  assert.equal(Hra.lzePrekreslit({ ...klid, ukoncen: true }), false);
  assert.equal(Hra.lzePrekreslit({ ...klid, kalibrace: {} }), false);
});

test('count-in: whole bars, the song starts on the right beat and the metronome accents beat 1 (also after a pickup)', () => {
  // no pickup: one bar of 4/4, the song starts after 4 clicks, the metronome's first click is beat 1 of the song
  let o = Hra.odpocetHry(metrum('4/4'), { delkaTaktu: 4, odZacatku: true });
  assert.deepEqual(o, { dobaQ: 1, naTakt: 4, kliku: 4, startDob: 4, prvniKlik: 4 });
  assert.equal(Hra.prizvuk(o, o.prvniKlik), true);
  // a quarter pickup in 4/4: count "1 2 3", the pickup on 4, the metronome accent falls on the next downbeat
  o = Hra.odpocetHry(metrum('4/4'), { delkaTaktu: 1, odZacatku: true });
  assert.equal(o.startDob, 3);
  assert.equal(o.kliku, 3);
  assert.equal(o.prvniKlik, 3);
  assert.equal(Hra.prizvuk(o, 3), false, 'the pickup beat is not accented');
  assert.equal(Hra.prizvuk(o, 4), true, 'beat 1 of the first full bar is');
  // an eighth pickup in 4/4: the song starts half a beat before the bar, no click falls off the beat
  o = Hra.odpocetHry(metrum('4/4'), { delkaTaktu: 0.5, odZacatku: true });
  assert.equal(o.startDob, 3.5);
  assert.equal(o.kliku, 4);
  assert.equal(o.prvniKlik, 4);
  assert.equal(Hra.prizvuk(o, 4), true);
  // 6/8 with an eighth pickup: beats are dotted quarters
  o = Hra.odpocetHry(metrum('6/8'), { delkaTaktu: 0.5, odZacatku: true });
  assert.equal(o.dobaQ, 1.5);
  assert.equal(o.naTakt, 2);
  assert.equal(o.startDob * o.dobaQ, 2 * 3 - 0.5, 'two bars of count-in minus the pickup');
  assert.equal(Hra.prizvuk(o, o.prvniKlik), true);
  // 3/4 with a two-beat pickup: at least three beats are counted before the first note
  o = Hra.odpocetHry(metrum('3/4'), { delkaTaktu: 2, odZacatku: true });
  assert.equal(o.startDob, 4);
  assert.equal(Hra.prizvuk(o, 6), true);
  assert.equal(Hra.prizvuk(o, 4), false);
  // a section in the middle of the song: a short first bar there is not a pickup
  o = Hra.odpocetHry(metrum('4/4'), { delkaTaktu: 1, odZacatku: false });
  assert.equal(o.startDob, 4);
  // 3/8: one beat per bar, three bars
  o = Hra.odpocetHry(metrum('3/8'), { delkaTaktu: 1.5, odZacatku: true });
  assert.deepEqual([o.dobaQ, o.naTakt, o.kliku, o.startDob], [1.5, 1, 3, 3]);
});

test('latency compensation: the measured value for this input, otherwise output latency (+ the microphone\'s detection delay)', () => {
  assert.equal(Hra.kompenzace({ kalibrace: { midi: 35 }, vstup: 'midi', vystupMs: 20 }), 35);
  assert.equal(Hra.kompenzace({ kalibrace: { midi: 35 }, vstup: 'mikrofon', vystupMs: 20 }), 20 + Hra.MIKROFON_ZPOZDENI_MS);
  assert.equal(Hra.kompenzace({ kalibrace: {}, vstup: 'obrazovka', vystupMs: 12.4 }), 12);
  assert.equal(Hra.kompenzace({ kalibrace: { mikrofon: 0 }, vstup: 'mikrofon', vystupMs: 40 }), 0, 'a measured 0 is kept');
  // older settings: one number for every input (0 = never calibrated)
  assert.equal(Hra.kompenzace({ kalibrace: 80, vstup: 'midi', vystupMs: 10 }), 80);
  assert.equal(Hra.kompenzace({ kalibrace: 80, vstup: 'mikrofon', vystupMs: 10 }), 10 + Hra.MIKROFON_ZPOZDENI_MS);
  assert.equal(Hra.kompenzace({ kalibrace: 0, vstup: 'midi', vystupMs: 10 }), 10);
  assert.deepEqual(Hra.ulozKalibraci(80, 'mikrofon', 95), { midi: 80, obrazovka: 80, mikrofon: 95 });
  assert.deepEqual(Hra.ulozKalibraci(0, 'midi', 30), { midi: 30 });
});

test('Find the notes: the backing of a step starts with that step; before the first note only what still sounds plays', () => {
  const K = [{ ms: 1000 }, { ms: 1500 }, { ms: 2500 }];
  const D = [
    { ms: 0, p: [48], dur: 500, sila: 0.4 }, { ms: 500, p: [52], dur: 500, sila: 0.4 },   // an intro before the melody
    { ms: 0, p: [36], dur: 2000, sila: 0.4 },                                              // a bass held into the first note
    { ms: 1000, p: [55], dur: 500, sila: 0.4 }, { ms: 1200, p: [57], dur: 300, sila: 0.4 }, { ms: 1500, p: [59], dur: 1000, sila: 0.4 },
  ];
  const plan = i => Hra.doprovodKroku(D, K, i).map(e => [e.p[0], e.za, e.dur]);
  assert.deepEqual(plan(0), [[36, 0, 1000], [55, 0, 500], [57, 200, 300]], 'not the intro all at once');
  assert.deepEqual(plan(1), [[59, 0, 1000]]);
  assert.deepEqual(plan(2), []);
});

test('on-screen keys: a phone shows fewer white keys so each stays about a finger wide', () => {
  assert.equal(Hra.minBilychKlaves(1200), 15);
  assert.equal(Hra.minBilychKlaves(600), 15);
  assert.equal(Hra.minBilychKlaves(390), 8);
  assert.equal(Hra.minBilychKlaves(560), 10);
  assert.ok(390 / Hra.minBilychKlaves(390) >= 44);
});
