// A visitor of rusalkapiano.com who does not play yet goes to the introduction page in their language (/cs/, /de/ …,
// tools/uvod.mjs); its "Start playing" button comes back here and lets this tab stay in the app (sessionStorage
// "rusalka-uvod"), so Home follows. A new visit shows the introduction again until the browser has player or guest data.
// Checked twice: here before the app loads (nothing of Rusalka in this browser = a brand new visitor), and by the app
// once its data is read (window.naUvodniStranku: e.g. someone who once looked and left).
// An installed app, a link with a hash or query, Tauri and the dev server are never redirected.
// A separate file because of the security policy (CSP without inline scripts).
(() => {
  // the folders of the introduction pages (= the app's languages, lowercase)
  const UVODY = ['en', 'es', 'fr', 'pt', 'pt-br', 'de', 'it', 'pl', 'uk', 'cs', 'sk', 'ru', 'zh-cn', 'hi', 'ar', 'ja'];
  /** a language tag (cs-CZ, pt-BR, zh-Hans-CN …) → the folder of its introduction page, English when there is none */
  function slozka(tag) {
    const t = String(tag || '').toLowerCase(), zaklad = t.split('-')[0];
    if (zaklad === 'zh') return 'zh-cn';
    if (zaklad === 'pt') return t === 'pt-br' || t.startsWith('pt-br') ? 'pt-br' : 'pt';
    return UVODY.includes(zaklad) ? zaklad : 'en';
  }
  /** kod: the language; uzHraje: this browser already has data or a link to a song → stay in the app */
  function naUvodniStranku(kod, uzHraje) {
    try {
      if (uzHraje || !/^(www\.)?rusalkapiano\.com$/.test(location.hostname) || location.pathname !== '/' || location.search || location.hash) return false;
      localStorage.removeItem('rusalka-uvod');          // the old lasting mark of a visit: from now on only for the tab
      if (matchMedia('(display-mode: standalone)').matches || navigator.standalone || sessionStorage.getItem('rusalka-uvod')) return false;
      location.replace('/' + slozka(kod) + '/');
      return true;
    } catch { return false; }   // no localStorage (private window settings): stay in the app
  }
  window.naUvodniStranku = naUvodniStranku;
  window.slozkaUvodu = slozka;
  let znamy = false;
  try { znamy = Object.keys(localStorage).some(k => k.startsWith('kt-')); } catch { /* see above */ }
  naUvodniStranku((navigator.languages && navigator.languages[0]) || navigator.language || '', znamy);
})();
