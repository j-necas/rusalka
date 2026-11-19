// Waits for Verovio (WASM) to initialise. A separate file because of the security policy (CSP without inline scripts).
window.VEROVIO_PRIPRAVENO = new Promise(r => { verovio.module.onRuntimeInitialized = r; });

// A startup error (broken module, bad data) must not end in a blank window: it is written into the page.
(() => {
  const ukaz = text => {
    if (document.querySelector('main:not(.skryta)')) return;           // the app is already running and shows the error itself
    let el = document.getElementById('chybaStartu');
    if (!el) {
      el = document.createElement('pre'); el.id = 'chybaStartu';
      el.style.cssText = 'white-space:pre-wrap;font:15px/1.4 system-ui,sans-serif;padding:24px;margin:0;color:#8A2338';
      (document.body || document.documentElement).appendChild(el);
    }
    el.textContent += 'Rusalka se nespustila / Rusalka failed to start:\n' + text + '\n\n';
  };
  /** files of this website that did not download: "/lib/stats.js (503)", "(spojení selhalo)" = no response at all */
  const selhane = () => performance.getEntriesByType('resource')
    .filter(r => r.name.startsWith(location.origin) && r.responseStatus !== undefined && ![200, 204, 206, 304].includes(r.responseStatus))
    .map(r => `${r.name.replace(location.origin, '')} (${r.responseStatus || 'spojení selhalo / connection failed'})`);
  /** a script (app.js or a file it imports) failed to download: reload once, a passing network error then goes unnoticed */
  const znovu = () => {
    try {
      const posledne = Number(sessionStorage.getItem('rusalka-znovu')) || 0;
      if (Date.now() - posledne < 60000) return false;                // already tried a moment ago: show the error
      sessionStorage.setItem('rusalka-znovu', String(Date.now()));
      location.reload();
      return true;
    } catch { return false; }                                         // no sessionStorage: no retry, no loop
  };
  window.addEventListener('error', e => {
    if (e.message) return ukaz(`${e.message} (${e.filename || ''}:${e.lineno || ''})`);
    if (e.target?.tagName === 'SCRIPT' && znovu()) return;
    const f = selhane();
    ukaz(`nenačetl se soubor ${e.target?.src || e.target?.href || ''}` + (e.target?.type === 'module' ? ' (nebo soubor, který potřebuje)' : '')
      + (f.length ? '\nnestažené soubory / failed downloads:\n' + f.join('\n') : ''));
  }, true);
  window.addEventListener('unhandledrejection', e => ukaz(String(e.reason?.stack || e.reason)));
  // safety net independent of the load event (which never fires if some file fails to load)
  setTimeout(() => {
    if (document.querySelector('main:not(.skryta)')) return;
    const f = selhane();
    const nactene = performance.getEntriesByType('resource').map(r => r.name.replace(location.origin, '')).join('\n');
    const text = 'žádná obrazovka se neukázala; stav dokumentu: ' + document.readyState
      + (f.length ? '\nnestažené soubory / failed downloads:\n' + f.join('\n') : '') + '\nnačtené soubory:\n' + nactene;
    ukaz(text);
  }, 8000);
})();
