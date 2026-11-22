import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Hra from '../static/lib/game.js';

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
