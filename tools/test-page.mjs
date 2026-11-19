// For tools/check-ui.mjs and tools/readme-images.mjs: a page whose songs and data are prepared in the browser's storage
// (IndexedDB, as ProhlizecUloziste in static/lib/storage.js keeps them), without the samples and the library (only
// the prepared songs), and with a fake Web MIDI without a piano; window.__pripojKlavir(['FP-10']) plugs one in.

/** fills the IndexedDB “rusalka” in the page: data = { key: JSON text }, pisne = { file name: MusicXML text } */
const zasej = ({ data, pisne }) => new Promise((ok, chyba) => {
  const r = indexedDB.open('rusalka', 1);
  r.onupgradeneeded = () => { for (const s of ['pisne', 'data', 'nastaveni']) r.result.createObjectStore(s); };
  r.onerror = () => chyba(r.error);
  r.onsuccess = () => {
    const d = r.result, tx = d.transaction(['pisne', 'data'], 'readwrite'), en = new TextEncoder();
    for (const [k, v] of Object.entries(data || {})) tx.objectStore('data').put(JSON.parse(v), k);
    for (const [f, x] of Object.entries(pisne || {})) tx.objectStore('pisne').put(en.encode(x), f);
    tx.oncomplete = () => { d.close(); ok(); };
    tx.onerror = () => chyba(tx.error);
  };
});

function falesneMidi() {
  const acc = { onstatechange: null, inputs: new Map(), outputs: new Map() };
  window.__pripojKlavir = nazvy => {
    acc.inputs = new Map(nazvy.map((name, i) => [String(i), { name, state: 'connected', onmidimessage: null }]));
    acc.onstatechange?.({});
  };
  Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { configurable: true, value: async () => acc });
}

/** call before the page loads the app: then p.goto(adresa) opens it with the prepared data */
export async function pripravStranku(p, adresa, { data = {}, pisne = {} } = {}) {
  await p.addInitScript(falesneMidi);
  for (const s of ['songs/index.json', 'library/index.json'])
    await p.route('**/' + s, r => r.fulfill({ contentType: 'application/json', body: '[]' }));
  await p.goto(new URL('songs/index.json', adresa).href);   // the same origin, without starting the app
  await p.evaluate(zasej, { data, pisne });
}

/** adds own songs ({ file name: MusicXML text }) to the page's storage; the app sees them after a reload */
export const ulozPisne = (p, pisne) => p.evaluate(zasej, { pisne });

/** what the app has saved under a data key (null if nothing) */
export const ulozenaData = (p, klic) => p.evaluate(k => new Promise((ok, chyba) => {
  const r = indexedDB.open('rusalka', 1);
  r.onerror = () => chyba(r.error);
  r.onsuccess = () => {
    const g = r.result.transaction('data').objectStore('data').get(k);
    g.onsuccess = () => { r.result.close(); ok(g.result ?? null); };
    g.onerror = () => chyba(g.error);
  };
}), klic);
