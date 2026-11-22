import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { ProhlizecUloziste } from '../static/lib/storage.js';
import { naMusicXml } from '../static/lib/song.js';
import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';

// The app runs with the real score renderer and storage. Only browser I/O and the clock are substituted.
async function prohlizec(t) {
  const prvek = () => {
    const e = new EventTarget(), tridy = new Set(['skryta']), vnitrni = new Map(), atributy = new Map();
    let html = '';
    Object.defineProperty(e, 'innerHTML', { get: () => html, set: h => { html = h; e.children = []; } });
    return Object.assign(e, {
      children: [], dataset: {}, style: { setProperty() {} }, clientWidth: 800, clientHeight: 400, value: '',
      classList: { contains: x => tridy.has(x), add: (...xs) => xs.forEach(x => tridy.add(x)), remove: (...xs) => xs.forEach(x => tridy.delete(x)),
        toggle(x, zap = !tridy.has(x)) { if (zap) tridy.add(x); else tridy.delete(x); return zap; } },
      setAttribute: (k, v) => atributy.set(k, v), getAttribute: k => atributy.get(k), removeAttribute: k => atributy.delete(k),
      appendChild(dite) { this.children.push(dite); }, focus() {}, scrollTo() {}, insertAdjacentHTML() {},
      before() {}, prepend() {}, append() {}, cloneNode: () => prvek(),
      ownerDocument: dok, hasAttribute: k => atributy.has(k), contains: () => false, closest: () => null, isConnected: true,
      content: { get firstElementChild() { return prvek(); } },
      querySelector(s) {
        if (s.includes('.zvire')) return null;
        if (!vnitrni.has(s)) vnitrni.set(s, prvek());
        return vnitrni.get(s);
      },
      querySelectorAll: () => [], getBoundingClientRect: () => ({ left: 0, top: 0 }),
      viewBox: { baseVal: { width: 800, height: 200 } },
      click() { if (!this.disabled) { this.onclick?.(); this.dispatchEvent(new Event('click')); } },
    });
  };
  const dok = new EventTarget(), okno = new EventTarget(), tagy = new Map();
  const $ = s => { if (!tagy.has(s)) tagy.set(s, prvek()); return tagy.get(s); };
  const rezimy = ['cekam', 'pockej', 'tempo', 'poslech'].map(rezim => Object.assign($(`[data-rezim="${rezim}"]`), { dataset: { rezim } }));
  Object.assign(dok, { querySelector: $, querySelectorAll: s => s === '[data-rezim]' ? rezimy : [], getElementById: () => null,
    createElement: prvek, documentElement: prvek(), body: prvek(), activeElement: null, readyState: 'complete', hidden: false, visibilityState: 'visible' });
  const modul = await createVerovioModule();
  let tk;
  Object.assign(okno, { scrollTo() {}, nactiVerovio: async () => (tk ??= new VerovioToolkit(modul)), prednactiVerovio() {} });
  let ted = 0, id = 0;
  const casovace = new Map(), snimky = new Map();
  const hlasitost = { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} };
  const uzel = () => ({ gain: Object.create(hlasitost), frequency: Object.create(hlasitost), playbackRate: {},
    connect() {}, disconnect() {}, start() {}, stop() {} });
  class AudioContext {
    state = 'running';
    get currentTime() { return ted / 1000; }
    createDynamicsCompressor = uzel;
    createGain = uzel;
    createOscillator = uzel;
    createBufferSource = uzel;
    createBiquadFilter = uzel;
    decodeAudioData(_, ok) { ok({}); }
  }
  okno.AudioContext = AudioContext;
  const soubor = 'Cviceni.musicxml';
  let nacti;
  const zpozdeni = new Promise(r => { nacti = r; });
  const nota = { t: 'C4', d: '1/1', lig: false, s: '' };
  const xml = naMusicXml({ nazev: 'Cvičení', takt: '4/4', tempo: 120, predznamenani: 0, klic: 'houslovy',
    takty: [{ noty: [nota], leva: [{ ...nota, t: 'C3' }], akordy: [] }] });
  const nastaveni = new Map([['kt-jazyk', JSON.stringify('cs')], ['kt-nastaveni', JSON.stringify({ rychlost: 70, stranka: true })]]);
  const globaly = {
    window: okno, document: dok, navigator: { language: 'cs', languages: ['cs'] }, indexedDB: new IDBFactory(),
    localStorage: { getItem: k => nastaveni.get(k), setItem: (k, v) => nastaveni.set(k, v) },
    location: { protocol: 'http:', hostname: 'localhost', hash: '#pisen=' + soubor, pathname: '/', search: '' },
    history: { replaceState() { location.hash = ''; } }, verovio: { toolkit: function () { return new VerovioToolkit(modul); } },
    addEventListener: okno.addEventListener.bind(okno), MutationObserver: class { observe() {} },
    performance: { now: () => ted }, setInterval: () => 0,
    setTimeout: (fn, ms) => { casovace.set(++id, { fn, kdy: ted + ms }); return id; }, clearTimeout: id => casovace.delete(id),
    requestAnimationFrame: fn => { snimky.set(++id, fn); return id; }, cancelAnimationFrame: id => snimky.delete(id),
    fetch: async url => url === 'songs/index.json' ? { json: async () => [{ soubor, nazev: 'Cvičení', police: 'klasika', stupen: 1 }] }
      : url === 'songs/' + soubor ? (await zpozdeni, { ok: true, arrayBuffer: async () => new TextEncoder().encode(xml).buffer })
        : { ok: url.startsWith('sounds/'), arrayBuffer: async () => new ArrayBuffer(0) },
  };
  const pred = Object.fromEntries(Object.keys(globaly).map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  for (const [k, value] of Object.entries(globaly)) Object.defineProperty(globalThis, k, { configurable: true, value });
  const uloziste = new ProhlizecUloziste();
  t.after(async () => {
    await uloziste.ctiData('profil');
    for (const [k, vlastnost] of Object.entries(pred)) {
      if (vlastnost) Object.defineProperty(globalThis, k, vlastnost); else delete globalThis[k];
    }
  });
  await uloziste.zapisData('profily', [{ id: 'p', jmeno: 'Anna', vek: 'dite' }, { id: 'd', jmeno: 'Petr', vek: 'dospely' }]);
  await import('../static/app.js');
  function posun(ms) {
    ted += ms;
    for (const [id, u] of [...casovace]) if (u.kdy <= ted && casovace.delete(id)) u.fn();
    for (const [id, fn] of [...snimky]) if (snimky.delete(id)) fn(ted);
  }
  async function cekejNa(splneno) {
    for (let i = 0; i < 100; i++) {
      const v = await splneno();
      if (v) return v;
      await new Promise(r => setImmediate(r));
    }
    assert.fail('Expected game state did not arrive');
  }
  const videt = s => !$(s).classList.contains('skryta');
  const klavesa = p => $('#klavesy').children.find(k => k.dataset.p === p);
  const stisk = p => klavesa(p).dispatchEvent(new Event('pointerdown', { cancelable: true }));
  return { $, dok, okno, posun, cekejNa, videt, klavesa, stisk, nacti, uloziste };
}

test('game controls survive loading, calibration, pausing, rotation, and a change of player', async t => {
  const { $, dok, okno, posun, cekejNa, videt, klavesa, stisk, nacti, uloziste } = await prohlizec(t);
  await cekejNa(() => videt('#kdo'));
  $('#kdoHraci').children[0].children[0].click();
  await cekejNa(() => videt('#pred'));
  assert.equal($('#predHrat').disabled, true);
  $('#predHrat').click();
  assert.equal(videt('#hra'), false);
  nacti();
  await cekejNa(() => !$('#predHrat').disabled);
  $('#predHrat').click();
  assert.equal($('#hraNazev').textContent, 'Cvičení');

  $('[data-rezim="tempo"]').click();
  $('#pauza').click();
  $('#pauzaZobrazeni').click();
  $('#kalibrace').click();
  await Promise.resolve();
  assert.equal(videt('#zobrazeni'), false);
  assert.equal(videt('#pauzaPrekryv'), false);
  assert.match($('#hlaska').innerHTML, /Kalibrace:/);
  $('#pauza').click();
  $('#znovu').click();
  $('[data-rezim="cekam"]').click();
  stisk(60);
  assert.equal($('#prubeh').style.width, '100%');

  posun(500);
  $('#pauza').click();
  posun(5000);
  assert.equal(videt('#vysledek'), false);
  $('#pauzaPokracovat').click();
  posun(699);
  assert.equal(videt('#vysledek'), false);
  posun(1);
  assert.equal(videt('#vysledek'), true);
  const vysledky = await cekejNa(() => uloziste.ctiData('vysledky'));
  assert.equal(vysledky.p['Cviceni.musicxml'].cekam.hvezdy, 3);
  okno.dispatchEvent(new Event('resize'));
  posun(1000);
  assert.equal(videt('#vysledek'), true);

  $('[data-rezim="pockej"]').click();
  $('#start').click();
  await Promise.resolve();
  posun(500);
  assert.equal(videt('#odpocet'), true);
  dok.hidden = true;
  dok.visibilityState = 'hidden';
  dok.dispatchEvent(new Event('visibilitychange'));
  assert.equal(videt('#pauzaPrekryv'), true);
  assert.equal(videt('#pauzaPokracovat'), false);
  dok.hidden = false;
  dok.visibilityState = 'visible';
  dok.dispatchEvent(new Event('visibilitychange'));
  $('#pauzaKonec').click();
  await cekejNa(() => !$('#predHrat').disabled);

  $('#pruvodce').click();
  $('#pauza').click();
  posun(2000);
  assert.equal(videt('#start'), true);
  $('#pauzaPokracovat').click();
  posun(1200);
  assert.equal(videt('#start'), false);
  $('#zpet').click();
  $('#pokracujHrat').click();
  await cekejNa(() => !$('#predHrat').disabled);

  $('#predPoslech').click();
  await Promise.resolve();
  await Promise.resolve();
  posun(10000);
  assert.equal(videt('#vysledek'), true);
  $('#vysDomu').click();
  $('#zmenitHrace').click();
  $('#kdoHraci').children[1].children[0].click();
  $('#pokracujHrat').click();
  await cekejNa(() => !$('#predHrat').disabled);
  $('#predHrat').click();
  assert.equal(klavesa(48).classList.contains('cil'), true, 'the adult player uses both hands');
  assert.equal(klavesa(60).classList.contains('cil'), true);
  stisk(60);
  stisk(61);
  okno.dispatchEvent(new Event('resize'));
  posun(500);
  stisk(48);
  assert.equal($('#prubeh').style.width, '100%', 'the first half of the chord survived the resize');
  posun(1200);
  const druhyVysledek = await cekejNa(async () => (await uloziste.ctiData('vysledky'))?.d?.['Cviceni.musicxml']?.cekam);
  assert.equal(druhyVysledek.procent, 67);
  assert.equal(druhyVysledek.hvezdy, 1);
  $('#zpet').click();
  await cekejNa(() => !$('#predHrat').disabled);
});
