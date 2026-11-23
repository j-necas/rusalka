import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const staticky = cesta => readFileSync(new URL('../static/' + cesta, import.meta.url), 'utf8');
const casovacStartu = (f, ms) => ms === 8000 ? 0 : setTimeout(f, ms);

test('the HTML starts the app without the notation engine and permits zoom', () => {
  const html = staticky('index.html');
  assert.doesNotMatch(html, /<script\b[^>]*verovio|user-scalable=no/);
  const css = staticky('style.css');
  assert.match(css, /\.klavesy\s*\{[^}]*touch-action: none/);
  assert.match(css, /\.klavesa \.jm\s*\{[^}]*max-width: 100%/);
  for (const vzor of [/\.vyber/, /\.obtiznost-filtr button/, /\.editor-nastroje button/]) {
    assert.match(css, new RegExp(vzor.source + String.raw` \{[^}]*min-height: 44px`));
  }
  assert.match(css, /\.editor-nastroje \.skupina \{[^}]*flex-wrap: wrap/);
});

test('the app has a CSP for its actual script, media and counter sources', () => {
  const html = staticky('index.html');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp);
  assert.ok(html.indexOf(csp) < html.indexOf('<script'));
  assert.match(csp, /script-src 'self' 'wasm-unsafe-eval';/);
  assert.doesNotMatch(csp, /gc\.zgo\.at/, 'the counter script comes from the website itself');
  assert.doesNotMatch(csp.match(/script-src [^;]+/)[0], /'unsafe-inline'|'unsafe-eval'/);
  assert.match(csp, /img-src [^;]*https:\/\/rusalka\.goatcounter\.com/);
  assert.match(csp, /connect-src [^;]*https:\/\/rusalka\.goatcounter\.com/);
});

test('dialogs have labelled headings and the toast has a persistent live region', () => {
  const html = staticky('index.html');
  for (const id of ['vysledek', 'dvojiceOkno', 'midiOkno', 'zdrojeOkno']) {
    const tag = html.match(new RegExp('<div id="' + id + '"[^>]+>'))[0];
    assert.match(tag, /role="dialog"/);
    assert.match(tag, /aria-modal="true"/);
    const label = tag.match(/aria-labelledby="([^"]+)"/)[1];
    assert.match(html, new RegExp('<h2 id="' + label + '"'));
  }
  assert.match(html, /id="toast"[^>]+role="status"/);
});

test('the notation engine loads lazily, shares concurrent attempts and retries a download failure', async () => {
  const scripts = [], prefetch = [];
  const ctx = vm.createContext({ URL, setTimeout: casovacStartu, clearTimeout, window: { addEventListener() {} },
    document: { currentScript: { src: 'https://app.test/start.js?v=abc' }, createElement: tag => ({ tag, remove() {} }),
      head: { append: el => (el.tag === 'link' ? prefetch : scripts).push(el) } } });
  vm.runInContext(staticky('start.js'), ctx);
  assert.equal(scripts.length, 0);
  ctx.window.prednactiVerovio();
  ctx.window.prednactiVerovio();
  assert.equal(scripts.length, 0);
  assert.equal(prefetch.length, 1);
  assert.equal(prefetch[0].rel, 'prefetch');
  const nacti = ctx.window.nactiVerovio;
  const prvni = nacti();
  assert.equal(nacti(), prvni);
  assert.equal(scripts[0].src, 'https://app.test/vendor/verovio-toolkit-wasm.js?v=abc');
  scripts[0].onerror();
  await assert.rejects(prvni);
  const dalsi = nacti();
  const toolkit = {};
  ctx.window.verovio = { module: {}, toolkit: function () { return toolkit; } };
  scripts[1].onload();
  ctx.window.verovio.module.onRuntimeInitialized();
  assert.equal(await dalsi, toolkit);
  assert.equal(nacti(), dalsi);
});

test('a nested dialog makes only its own controls available and Escape returns focus', async () => {
  const { otevriDialog, zavriDialog } = await import('../static/ui/dialog.js');
  const doc = new EventTarget();
  const uzel = () => ({
    ownerDocument: doc, inert: false, isConnected: true,
    classList: { add() {}, remove() {} }, setAttribute() {}, hasAttribute: () => false,
    closest: () => null, focus() { doc.activeElement = this; },
  });
  const pozadi = uzel(), prvni = uzel(), druhy = uzel();
  const tlacitko = uzel(), nadpis = uzel(), volba = uzel();
  prvni.querySelector = () => nadpis;
  prvni.contains = el => el === nadpis;
  druhy.querySelector = () => volba;
  doc.body = { children: [pozadi, prvni, druhy] };
  tlacitko.focus();
  otevriDialog(prvni);
  assert.equal(doc.activeElement, nadpis);
  assert.equal(pozadi.inert, true);
  otevriDialog(druhy, { zavrit: () => zavriDialog(druhy) });
  assert.equal(doc.activeElement, volba);
  assert.equal(prvni.inert, true);
  const escape = new Event('keydown', { cancelable: true });
  Object.defineProperty(escape, 'key', { value: 'Escape' });
  doc.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented, true);
  assert.equal(doc.activeElement, nadpis);
  assert.equal(prvni.inert, false);
  assert.equal(pozadi.inert, true);
  zavriDialog(prvni);
  assert.equal(doc.activeElement, tlacitko);
  assert.equal(pozadi.inert, false);
});

test('piano labels and note-name text keep their contrast', () => {
  const app = staticky('app.js'), css = staticky('style.css');
  const barvy = id => app.match(new RegExp('const ' + id + ' = \\[(.*?)\\]'))[1].match(/#[a-f0-9]{6}/gi);
  const tmave = new Set(app.match(/const TMAVE = new Set\(\[(.*)\]/)[1].split(',').map(Number));
  const tmavyText = css.match(/\.klavesa \.jm\.tmave \{ color: (#[a-f0-9]{6})/i)[1];
  const jas = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
  const kontrast = (a, b) => (Math.max(jas(a), jas(b)) + 0.05) / (Math.min(jas(a), jas(b)) + 0.05);
  barvy('BARVY').forEach((b, i) => assert.ok(kontrast(b, tmave.has(i) ? tmavyText : '#ffffff') >= 4.5, b));
  for (const b of barvy('BARVY_TEXT')) assert.ok(kontrast(b, '#e2e9ea') >= 4.5, b);
});

test('editor escapes header values in HTML attributes', async () => {
  const { otevriEditor } = await import('../static/ui/editor.js');
  const ukoncit = new Error('HTML captured');
  let html;
  globalThis.document = { createElement: () => ({ set innerHTML(s) { html = s; throw ukoncit; } }) };
  try {
    const hodnota = `"'&<>`;
    assert.throws(() => otevriEditor({ pisen: { nazev: hodnota, takt: hodnota, predznamenani: hodnota, tempo: hodnota } }), ukoncit);
    for (const trida of ['editor-nazev', 'editor-takt', 'editor-predzn', 'editor-tempo']) {
      assert.match(html, new RegExp(`class="${trida}"[^>]*value="&quot;&#39;&amp;&lt;&gt;"`));
    }
  } finally {
    delete globalThis.document;
  }
});

test('the lazy loader initializes the published Verovio bundle',
  { skip: !existsSync(new URL('../static/vendor/verovio-toolkit-wasm.js', import.meta.url)) && 'no static/vendor' }, async () => {
  let skript;
  const document = { currentScript: { src: 'https://app.test/start.js' },
    createElement: () => ({ remove() {} }), head: { append: el => { skript = el; } } };
  const ctx = vm.createContext({ URL, document, console, crypto, TextEncoder, TextDecoder, atob, setTimeout: casovacStartu, clearTimeout,
    location: new URL('https://app.test/'), addEventListener() {} });
  vm.runInContext('window = self = globalThis;', ctx);
  vm.runInContext(staticky('start.js'), ctx);
  const nacteni = ctx.nactiVerovio();
  document.currentScript = skript;
  vm.runInContext(staticky('vendor/verovio-toolkit-wasm.js'), ctx);
  skript.onload();
  assert.match((await nacteni).getVersion(), /^\d+\.\d+/);
});
