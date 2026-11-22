/* Rusalka (piano coach) – playing from sheet music on a piano connected over MIDI (or on the on-screen keys). ES module. */
import { zMusicXml, naMusicXml, rozvin, tonyAkordu, kopie, metrum } from './lib/song.js';
import * as Editor from './ui/editor.js';
import { otevriDialog, zavriDialog } from './ui/dialog.js';
import * as Cviceni from './lib/practice.js';
import { vytvorCasovace, vytvorVyberPisne, obnovAudio, lzePrekreslit } from './lib/game.js';
import { vytvorMikrofon } from './ui/microphone.js';
import { obtiznost } from './lib/difficulty.js';
import * as MidiSoubor from './lib/midi_file.js';
import { pripravOriginal, doplnTempo, doplnPosuvky, bezCeskehoH } from './lib/original.js';
import { zpracujVerovio } from './lib/render.js';
import * as Doplnky from './ui/extras.js';
import { doprovodVeStylu, STYLY } from './lib/extras.js';
import { doprovodZAkordu, VZORY_DOPROVODU } from './lib/accompaniment.js';
import { maAkordyProDvojici, modelProDvojici, hraniceDvojice, vysledekHrace } from './lib/pair.js';
import { seznamUrovni, vytvorHranouUroven } from './lib/levels.js';
import { ProhlizecUloziste, SlozkaUloziste, nastaveniProhlizece, datoveZapisy, snimekDat, kopiruj, zaloha as zalohaDat, obnov as obnovDat } from './lib/storage.js';
import { MAX_ZIP } from './lib/zip.js';
import { stejnaData } from './lib/merge.js';
import { xmlZBajtu, nazevZXml, jmenoSouboru, vyberBezFiltru } from './lib/files.js';
import { vytvorVystup, vyberVystup, KANAL as KANAL_VYSTUPU } from './lib/midi_output.js';
import { obrazekHrace } from './ui/pictures.js';
import { spustMrkani, radost as radostZvirete, pozdrav, zvedavost } from './ui/animals.js';
import { PALETY, OBRAZKY, VSECHNY_OBRAZKY, paleta, prevedProfil, viditelni, smazHrace } from './lib/profiles.js';
import { t, jazyk, nastavJazyk, nactiSlovnik, vychoziJazyk, smerJazyka, NAZVY_JAZYKU } from './lib/texts.js';
import { nastavSoustavu, soustava, jmenaKlaves, vychoziSoustava } from './lib/note_names.js';
import { pokyny, vysledkyText, videoUkazky } from './lib/helper.js';
import { notaProChybu, chybyKPrehledu, polohaDucha } from './lib/mistakes.js';
import { zTextu, vyberZapis, nejisteTakty } from './lib/notation.js';
import { filtrujPisne } from './lib/songs.js';
import { pocitatNavstevy, POCITADLO } from './lib/visits.js';
import { zapnoutOffline } from './lib/offline.js';
import { rukaPoKarte, stylPriOtevreni, souhrn, poslechCelePisne } from './lib/version.js';
import { VZORKY, naMidi, nejblizsiVzorek } from './lib/piano.js';
import { pokusyHrace, kalendar, presnostPoDnech, stavPisni, mistaKdeDrhne, zapisDoDeniku } from './lib/stats.js';
import { nactiVstup, doprovodZapnuty, sDoprovodem, poZmeneKlaviru, prijimaZdroj, pripojeneVstupy, seznamPortu, klavesyViditelne, vytvorMereniDrzeni } from './lib/input.js';
import { KROKY, RYCHLOSTI, stavKroku, umim, doporuceni, proMe, jeNova, akcePoVysledku } from './lib/recommend.js';
import { naDomove, urovenHrace, dalsiZKnihovny, seradPolici, hledej, POLICE, policeSouboru, navrhyZKnihovny } from './lib/library.js';
{
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const SVGNS = 'http://www.w3.org/2000/svg';
  // colour by note name (C red … B violet); an accidental takes the colour of its natural note
  const BARVY = ['#E53935', '#E53935', '#F57C00', '#F57C00', '#F2C200', '#43A047', '#43A047', '#00A3B8', '#00A3B8', '#3F51B5', '#3F51B5', '#8E24AA'];
  const BARVY_TEXT = ['#B51F20', '#B51F20', '#9B4800', '#9B4800', '#785B00', '#286631', '#286631', '#006574', '#006574', '#3F51B5', '#3F51B5', '#8E24AA'];
  const TMAVE = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const CERNE = new Set([1, 3, 6, 8, 10]);
  const OKNO = 220;          // ms of real time: how far a note may drift in “In rhythm” mode

  // ------------------------------------------------------------ animals
  const ZVIRATA = {
    lenochod: { get vety() { return [0, 1, 2, 3].map(i => t('zvire.lenochod.' + i)); } },
    kralik: { get vety() { return [0, 1, 2, 3].map(i => t('zvire.kralik.' + i)); } },
  };
  // player profile: { id, jmeno, zvire: 'lenochod'|'kralik'|null, vek: 'dite'|'dospely' }

  // ------------------------------------------------------------ storage (this browser only)
  const uloz = {
    cti(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
    pis(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } },
  };
  // language and note names (Settings); default language from the browser, default note names from the language
  const uzPouzivana = (() => { try { return Object.keys(localStorage).some(k => k.startsWith('kt-')); } catch { return false; } })();
  const ulozenyJazyk = uloz.cti('kt-jazyk', null);
  const zadanyJazyk = Object.hasOwn(NAZVY_JAZYKU, ulozenyJazyk) ? ulozenyJazyk
    : vychoziJazyk(navigator.languages?.length ? navigator.languages : navigator.language, uzPouzivana);
  const slovnik = await nactiSlovnik(zadanyJazyk).catch(() => null);
  const JAZYK = slovnik ? zadanyJazyk : 'en';
  if (!ulozenyJazyk) uloz.pis('kt-jazyk', zadanyJazyk);   // preserve the choice when browser defaults or connectivity change
  nastavJazyk(JAZYK, slovnik);
  nastavSoustavu(uloz.cti('kt-soustava', null) || vychoziSoustava(JAZYK), t('tony.solmizace').split('|'));
  document.documentElement.lang = JAZYK;
  document.documentElement.dir = smerJazyka(JAZYK);
  const S = {
    profily: [], profil: null, vysledky: {}, knihovna: [], knihovnaSkryte: {}, nastaveniHracu: {},
    nastaveni: Object.assign({ rychlost: 70, pismena: true, barvy: true, doprovod: true, kalibrace: 0, klaviatura: true, zvukKlavir: true }, uloz.cti('kt-nastaveni', {})),
    seznam: [], pisen: null, data: null, rezim: 'cekam', ruka: new Set([1]),
    uroven: 2, tonina: 'ne', prstoklad: false, usek: null, smycka: { zapnuto: false, cisteVRade: 0 },
    kroky: [], doprovod: [], el: {}, klavesy: {}, svg: null, vb: null,
  };
  let H = novyStav();
  const PREHLED = { polozky: [], i: 0 };              // Show mistakes: groups of ghosts and the current one
  function novyStav() {
    return { idx: 0, chyby: 0, trefy: 0, rada: 0, stisk: new Set(), hotovo: new Set(),
      aktivni: -1, kontrola: 0, xi: 0, bezi: false, spousti: false, ukoncen: false, kalibrace: null,
      timery: vytvorCasovace(), raf: 0, hlaska: '', zaznam: new Map(), chybneStisky: [], chybneNoty: new Set() };
  }
  /** error text: translated if the error carries a key (e.klic), otherwise its message */
  const chybaText = e => (e?.klic ? t(e.klic) : e?.message || String(e));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const aktualniProfil = () => S.profily.find(p => p.id === S.profil) || null;
  function svetla(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  function avatarSvg(p) {
    const q = prevedProfil(p || { jmeno: '?' }, S.profily);
    return obrazekHrace(q, paleta(q.barva));
  }
  let toastTimer = 0;
  function toast(t, ms = 2600) {
    if (!$('#vysledek').classList.contains('skryta')) return;     // results take precedence over messages
    const el = $('#toast'); el.textContent = t;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.textContent = ''; }, ms);
  }
  const OBRAZOVKY = ['kdo', 'domu', 'pred', 'hra', 'novy'];
  function ukaz(id) {
    const bylo = OBRAZOVKY.find(o => !$('#' + o)?.classList.contains('skryta'));
    if (bylo === 'pred' && id !== 'pred') VYBER_PISNE.zrus();
    if (bylo === 'hra' && id !== 'hra') {
      stopVse(); konecPoslechu();
      if (S.pruvodce) ukonciPruvodce();
      $('#pauzaPrekryv').classList.add('skryta');
    }
    for (const o of OBRAZOVKY) $('#' + o)?.classList.toggle('skryta', id !== o);
    if (id !== 'domu') jaMenu(false);
    window.scrollTo(0, 0);
    // arriving home: the player's animal greets with a wink
    if (id === 'domu' && bylo !== 'domu') setTimeout(() => pozdrav($('#mujProfilOtevrit .zvire')), 350);
    prizpusobMenu();
  }
  spustMrkani();
  // curious tilt on hovering over an animal (player tiles, picture choice)
  document.addEventListener('pointerover', e => {
    const b = e.target.closest?.('.dlazdice-hrace, .obrazek, .profil');
    if (b && !b.contains(e.relatedTarget)) zvedavost(b.querySelector('.zvire'));
  });
  /** texts from data-t / data-t-placeholder (static parts of the page) */
  function prelozStranku() {
    $$('[data-t]').forEach(e => { e.textContent = t(e.dataset.t); });
    $$('[data-t-placeholder]').forEach(e => { e.placeholder = t(e.dataset.tPlaceholder); });
    $$('[data-t-title]').forEach(e => { e.title = t(e.dataset.tTitle); });
    $$('[data-t-aria]').forEach(e => { e.setAttribute('aria-label', t(e.dataset.tAria)); });
    $$('[data-t-html]').forEach(e => { e.innerHTML = t(e.dataset.tHtml); });   // only texts from the dictionary (with <b>)
    document.title = t('html.titulek');                // the browser tab in the app's language
    // the logo leads to the introduction page in the app's language (static/prvni.js knows the pages)
    $$('a.logo-odkaz').forEach(a => { a.setAttribute('href', (window.slozkaUvodu?.(jazyk()) || 'en') + '/'); });
    for (const video of $$('video[data-video]')) {                       // demo loops in the app's language (cs/sk Czech, else English)
      const v = videoUkazky(jazyk(), video.dataset.video);
      if (video.getAttribute('src') !== v.src) { video.setAttribute('src', v.src); video.setAttribute('poster', v.poster); }
    }
  }

  // ------------------------------------------------------------ data: storage (this browser, or a chosen folder)
  // Sample songs (public domain, songs/index.json) belong to the library: on their shelves, not among the user's own
  // songs (My songs). The user's own song with the same file name takes precedence.
  if (pocitatNavstevy({ protocol: location.protocol, hostname: location.hostname })) {   // anonymous visits, no cookies
    const s = document.createElement('script');
    s.async = true; s.src = POCITADLO.src; s.dataset.goatcounter = POCITADLO.data;
    document.head.append(s);
  }
  // offline: the website keeps itself in the browser (sw.js); after loading, so it does not slow down the start
  const offline = () => zapnoutOffline({
    serviceWorker: navigator.serviceWorker,
    setritData: navigator.connection?.saveData,
    aktualizace: obnov => {
      $('#aktualizace').classList.remove('skryta');
      $('#aktualizaceText').textContent = t('app.novaVerze');
      $('#aktualizaceObnovit').onclick = obnov;
    },
    obnovit: () => location.reload(),
  });
  if (document.readyState === 'complete') offline();
  else addEventListener('load', offline, { once: true });
  const UL = { prohlizec: new ProhlizecUloziste(), slozka: null, aktivni: null, trvale: false, chybaSlozky: '', predObnovou: null };
  UL.aktivni = UL.prohlizec;
  const LZE_SLOZKU = typeof window.showDirectoryPicker === 'function';
  const CEKA_SLOZKA = 'slozkaCeka';
  const POLE_DAT = { profily: 'profily', profil: 'profil', vysledky: 'vysledky', statistiky: 'statistiky', oblibene: 'oblibene',
    denik: 'denik', skryte: 'skryte', knihovnaSkryte: 'knihovnaSkryte', nastaveni: 'nastaveniHracu' };
  const cteniChyby = new Map();
  let zapisChyba = '';
  const pruhyDat = ['#kdo .kdo-in', '#domu .obsah', '#novy .novy'].map(sel => {
    const cil = $(sel), pruh = $('#ulozistePruh').content.firstElementChild.cloneNode(true);
    if (sel.startsWith('#novy')) cil.before(pruh); else cil.prepend(pruh);
    return pruh;
  });
  function hlasData(zprava) {
    zapisChyba = zprava;
    stavUloziste(); toast(zprava, 6000);
  }
  const novaSlozka = h => new SlozkaUloziste(h, (e, k) => {
    cteniChyby.delete(k); hlasData(chybaText(e));
  });
  /** Keep a browser snapshot while the chosen folder is unavailable, even across restarts. */
  async function obnovSlozku(ul) {
    const presun = async () => {
      await ul.overVerzi();
      let zaklad = await nastaveniProhlizece.cti(CEKA_SLOZKA);
      if (zaklad) {
        let revize;
        do {
          await frontaDat.dokonci();
          revize = frontaDat.revize;
          zaklad = await kopiruj(UL.prohlizec, ul, { zaklad });
          await nastaveniProhlizece.zapis(CEKA_SLOZKA, zaklad);
        } while (revize !== frontaDat.revize);
      }
    };
    if (navigator.locks?.request) await navigator.locks.request('rusalka-prechod-uloziste', presun);
    else await presun();
  }
  async function pripravUloziste() {
    UL.predObnovou = await nastaveniProhlizece.cti('zaloha_pred_obnovou');
    if (!LZE_SLOZKU) return;
    const h = await nastaveniProhlizece.cti('slozka');
    if (!h) return;
    UL.slozka = novaSlozka(h);
    try {
      if (await UL.slozka.stav() === 'granted') {
        await obnovSlozku(UL.slozka);
        UL.aktivni = UL.slozka; frontaDat = novaFronta(UL.aktivni);
        return;
      }
    } catch (e) { UL.chybaSlozky = chybaText(e); }
    if (!(await nastaveniProhlizece.cti(CEKA_SLOZKA))) {
      await nastaveniProhlizece.zapis(CEKA_SLOZKA, await snimekDat(UL.prohlizec));
    }
  }
  async function pozadejTrvaleUloziste() {
    try { UL.trvale = await navigator.storage?.persist?.(); } catch { /* The backup reminder still applies. */ }
    stavUloziste();
  }
  function novaFronta(ul) {
    return datoveZapisy(ul, (k, v) => {
      if (UL.aktivni !== ul || !Object.hasOwn(POLE_DAT, k)) return;
      S[POLE_DAT[k]] = k === 'profily' ? prevedProfily(v) : v ?? (k === 'profil' ? null : k === 'skryte' ? [] : {});
      obnovDatoveUI([k]);
    }, (k, e) => hlasData(t('app.ulozeniChyba', { chyba: chybaText(e) })));
  }
  let frontaDat = novaFronta(UL.aktivni);
  const data = {
    async cti(klic, vychozi) {
      try { return (await UL.aktivni.ctiData(klic)) ?? vychozi; }
      catch (e) { hlasData(t('app.dataCteni', { chyba: chybaText(e) })); return vychozi; }
    },
    pis(klic, hodnota) { frontaDat.pis(klic, hodnota); },
  };
  function prevedProfily(profily) {
    const vcetneStarych = (profily || []).map(({ ai, ...p }) => ({ vek: 'dite', ...p }));
    return vcetneStarych.map(p => prevedProfil(p, vcetneStarych));
  }
  async function nactiTrvalaData({ noveUloziste = false, prvni = false, obnova = false } = {}) {
    const ul = UL.aktivni, fronta = frontaDat;
    await fronta.dokonci();
    const revize = fronta.revize;
    const prectene = await Promise.all(Object.keys(POLE_DAT).map(async k => {
      try { return { k, v: await ul.ctiData(k) }; }
      catch (chyba) { return { k, chyba }; }
    }));
    if (fronta !== frontaDat || revize !== fronta.revize) return false;
    const zmeny = [];
    for (const { k, v, chyba } of prectene) {
      if (chyba) {
        cteniChyby.set(k, chybaText(chyba));
        if (!noveUloziste && !prvni) continue;
      } else {
        cteniChyby.delete(k);
        fronta.cteno(k, v);
      }
      const pole = POLE_DAT[k], pred = S[pole];
      if (k === 'profily') {
        S.profily = prevedProfily(v);
        if (v && (prvni || noveUloziste) && v.some(p => !p.smazano && (!p.obrazek || !p.barva || prevedProfil(p) !== p))) {
          data.pis('profily', S.profily);
        }
      } else if (k === 'profil') {
        if (prvni || noveUloziste || obnova) S.profil = v ?? null;
      } else if (k === 'nastaveni' && v == null && !chyba) {
        S.nastaveniHracu = Object.fromEntries(S.profily.map(p => [p.id, uloz.cti('kt-nastaveni-' + p.id, null)]).filter(([, hodnota]) => hodnota));
        if (Object.keys(S.nastaveniHracu).length) data.pis('nastaveni', S.nastaveniHracu);
      } else S[pole] = v ?? (k === 'skryte' ? [] : {});
      if (!stejnaData(pred, S[pole])) zmeny.push(k);
    }
    if (prvni || noveUloziste || obnova) {
      const hraci = viditelni(S.profily);
      if (!hraci.some(p => p.id === S.profil)) S.profil = hraci[0]?.id || null;
    } else obnovDatoveUI(zmeny);
    stavUloziste();
    return true;
  }
  function obnovDatoveUI(zmeny) {
    if (!zmeny.length) return;
    const doma = !$('#domu').classList.contains('skryta');
    if (zmeny.includes('profily')) {
      if (S.profil && !viditelni(S.profily).some(p => p.id === S.profil) && doma) {
        S.profil = null; uvodniObrazovka();
      }
      if (!$('#kdo').classList.contains('skryta')) vykresliKdo();
      vykresliProfily();
    }
    if (doma && zmeny.includes('nastaveni')) nactiNastaveniHrace();
    if (doma) vykresliPisne();
    if (otevreno('#hraciOkno')) vykresliHrace();
  }
  let UKAZKY = null;
  /** the samples as library entries (Polozka[], see static/lib/library.js): their shelf, difficulty and composer */
  async function ukazky() {
    if (!UKAZKY) {
      try { UKAZKY = await (await fetch('songs/index.json', { cache: 'no-cache' })).json(); } catch { UKAZKY = []; }
    }
    return UKAZKY;
  }
  // The song library (website only, like samples): library/index.json lists the songs with their difficulty; a song file
  // (library/<shelf>/<name>.musicxml, which is also its id) is fetched only when opened. Own file names cannot contain '/'.
  let KNIHOVNA = null;
  const jeKnihovni = soubor => String(soubor || '').startsWith('library/');
  /** library index (Polozka[]); [] when it cannot be loaded (tried again next time) */
  async function knihovna() {
    if (!KNIHOVNA) {
      try {
        const r = await fetch('library/index.json', { cache: 'no-cache' });
        const index = r.ok ? await r.json() : null;
        if (Array.isArray(index)) KNIHOVNA = [...index, ...await ukazky()];
      } catch { /* offline: no library this time */ }
    }
    return KNIHOVNA || ukazky();
  }
  // a song page of the website (rusalkapiano.com/cs/noty/…, tools/pisne.mjs) links here with #pisen=<file>: the song
  // opens in Before playing as soon as somebody plays (chosen or created); the address loses the hash right away
  let CEKA_PISEN = (() => {
    const m = /^#pisen=(.+)$/.exec(location.hash);
    if (!m) return null;
    history.replaceState(null, '', location.pathname + location.search);
    try { return decodeURIComponent(m[1]); } catch { return null; }
  })();
  /** the song from the address, once there is a player; false when there is none (or it is not known) */
  async function otevriPisenZAdresy() {
    if (!CEKA_PISEN || !S.profil) return false;
    const soubor = CEKA_PISEN;
    CEKA_PISEN = null;
    if (!pisenSouboru(soubor)) prijmiKnihovnu(await knihovna());
    if (!pisenSouboru(soubor)) return false;
    otevriPred(soubor);
    return true;
  }
  /** a song by its file: own, or from the library (samples included); undefined if neither has it */
  const pisenSouboru = soubor => S.seznam.find(p => p.soubor === soubor) || S.knihovna.find(p => p.soubor === soubor);
  /** a sample, unless the user has an own song with the same file name */
  const jeUkazka = async soubor => ZDROJ.get(soubor) !== 'vlastni' && (await ukazky()).some(u => u.soubor === soubor);
  const XML = new Map(), NAZVY = new Map(), ZDROJ = new Map();   // cache of text and titles; where each song comes from
  const zapomen = soubor => { XML.delete(soubor); NAZVY.delete(soubor); };
  const api = {
    /** the user's own songs (the samples and the library come from knihovna()) */
    async seznam() {
      const out = [];
      for (const { soubor } of await UL.aktivni.seznam()) {
        ZDROJ.set(soubor, 'vlastni');
        let nazev = NAZVY.get(soubor), chyba = false;
        if (!nazev) {
          try { nazev = nazevZXml(await api.xml(soubor), soubor); NAZVY.set(soubor, nazev); }
          catch { nazev = soubor.replace(/\.[^.]+$/, ''); chyba = true; }
        }
        out.push({ soubor, nazev, chyba });
      }
      return out;
    },
    async xml(soubor) {
      if (XML.has(soubor)) return XML.get(soubor);
      let bajty;
      if (jeKnihovni(soubor)) {
        const r = await fetch(soubor.split('/').map(encodeURIComponent).join('/'));
        if (!r.ok) throw new Error(t('app.knihovnaChyba'));
        bajty = new Uint8Array(await r.arrayBuffer());
      } else if (await jeUkazka(soubor)) {
        const r = await fetch('songs/' + encodeURIComponent(soubor));
        if (!r.ok) throw new Error(t('app.knihovnaChyba'));
        bajty = new Uint8Array(await r.arrayBuffer());
      } else bajty = await UL.aktivni.cti(soubor);
      const xml = await xmlZBajtu(soubor, bajty);
      XML.set(soubor, xml);
      return xml;
    },
    /** saving an edited song (editor): a sample is saved as the user's own with the same name, .mxl as .musicxml,
     *  a library song as a new own song (its name without the shelf) */
    async prepis(soubor, xml) {
      const bajty = new TextEncoder().encode(xml);
      if (jeKnihovni(soubor)) {
        const novy = await UL.aktivni.zapis(soubor.split('/').pop(), bajty);
        ZDROJ.set(novy, 'vlastni');
        return novy;
      }
      if (await jeUkazka(soubor)) {
        await UL.aktivni.zapis(soubor, bajty, { prepsat: true });
      } else {
        await UL.aktivni.zalohuj(soubor);
        if (/\.mxl$/i.test(soubor)) {
          const novy = await UL.aktivni.zapis(soubor.replace(/\.mxl$/i, '.musicxml'), bajty);
          await UL.aktivni.smaz(soubor); zapomen(soubor);
          soubor = novy;
        } else await UL.aktivni.zapis(soubor, bajty, { prepsat: true });
      }
      zapomen(soubor); ZDROJ.set(soubor, 'vlastni');
      return soubor;
    },
    /** new song from a file; first checks that it can be read and rendered */
    async pridej(f) {
      const bajty = new Uint8Array(await f.arrayBuffer());
      let p;
      try {
        p = zMusicXml(await xmlZBajtu(f.name, bajty));
        await zpracujModel(rozvin(p).pisen);
      } catch (e) { throw new Error(t('app.necitelne', { chyba: chybaText(e) })); }
      const soubor = await UL.aktivni.zapis(jmenoSouboru(f.name), bajty);
      ZDROJ.set(soubor, 'vlastni');
      return { soubor, nazev: p.nazev || soubor.replace(/\.[^.]+$/, '') };
    },
    /** deletion of the user's own song */
    async smaz(soubor) {
      await UL.aktivni.smaz(soubor); zapomen(soubor);
    },
  };

  // ------------------------------------------------------------ storage choice: browser / folder, backup and restore
  function stavUloziste() {
    const slozka = UL.aktivni === UL.slozka;
    const ceka = UL.slozka && !slozka;
    const chybaCteni = cteniChyby.values().next().value;
    const chyba = [UL.chybaSlozky, chybaCteni && t('app.dataCteni', { chyba: chybaCteni }), zapisChyba].filter(Boolean).join(' ');
    const hlaska = ceka ? t('app.dataCeka', { slozka: UL.slozka.nazev }) : '';
    for (const p of pruhyDat) {
      p.classList.toggle('skryta', !hlaska && !chyba);
      p.querySelector('.data-slozka').textContent = hlaska;
      p.querySelector('.data-chyba').textContent = chyba;
      p.querySelector('button').classList.toggle('skryta', !ceka);
    }
    $('#ulozisteText').textContent = [slozka ? t('app.dataSlozkaVybrana', { slozka: UL.slozka.nazev }) : t('app.dataProhlizec'), chyba].filter(Boolean).join(' · ');
    $('#ulozisteSlozka').textContent = t(slozka ? 'app.zmenitSlozku' : 'app.ukladatDoSlozky');
    $('#ulozisteSlozka').classList.toggle('skryta', !LZE_SLOZKU);
    $('#ulozisteProhlizec').classList.toggle('skryta', !UL.slozka);
    $('#ulozistePovolit').classList.toggle('skryta', !ceka);
    $('#ulozistePredObnovou').classList.toggle('skryta', !UL.predObnovou);
    const pripominka = $('#ulozistePripominka'), kdy = uloz.cti('kt-zaloha', null);
    pripominka.classList.toggle('skryta', slozka || UL.trvale);
    pripominka.textContent = kdy ? t('app.dataPosledniZaloha', { datum: new Date(kdy).toLocaleDateString(JAZYK) }) : t('app.dataPripominka');
  }
  async function prepniNa(ul, { obnova = false } = {}) {
    await frontaDat.dokonci();
    const jina = UL.aktivni !== ul;
    if (jina) {
      UL.aktivni = ul; frontaDat = novaFronta(ul);
      cteniChyby.clear(); zapisChyba = '';
    }
    stopVse();
    XML.clear(); NAZVY.clear(); ZDROJ.clear(); S.infoPisni = {};
    await nactiTrvalaData({ noveUloziste: jina, obnova });
    vykresliProfily(); nactiPisne();
    if (viditelni(S.profily).length) { vykresliKdo(); ukaz('kdo'); } else otevriProfil(null);
    if (!obnova) zavriOkno('settings');
  }
  let meniData = false;
  function priZmeneDat(fn) {
    return async (...args) => {
      if (meniData) return;
      meniData = true;
      try { await fn(...args); }
      catch (e) { hlasData(t('app.ulozeniChyba', { chyba: chybaText(e) })); }
      finally { meniData = false; }
    };
  }
  async function povolSlozku() {
    if (!UL.slozka || UL.aktivni === UL.slozka) return;
    if (await UL.slozka.povol() !== 'granted') { toast(t('app.bezPovoleni'), 5000); return; }
    await obnovSlozku(UL.slozka);
    UL.chybaSlozky = '';
    await prepniNa(UL.slozka);
  }
  $('#ulozistePovolit').onclick = priZmeneDat(povolSlozku);
  for (const p of pruhyDat) p.querySelector('button').onclick = $('#ulozistePovolit').onclick;
  $('#ulozisteSlozka').onclick = priZmeneDat(async () => {
    let h;
    try { h = await window.showDirectoryPicker({ id: 'rusalka', mode: 'readwrite' }); }
    catch (e) { if (e.name === 'AbortError') return; throw e; }
    const s = novaSlozka(h);
    if (await s.povol() !== 'granted') { toast(t('app.slozkaNelze'), 5000); return; }
    await s.overVerzi();
    if (UL.slozka && await h.isSameEntry(UL.slozka.h)) {
      await obnovSlozku(s);
    } else {
      let kopie = false;
      if (!await s.maData()) {
        kopie = await potvrd(t('app.slozkaPrazdna'), t('app.dataPrevzitAno'), t('app.dataBezPrevzeti'));
        if (kopie === false) return;
      }
      await s.pripravit();
      if (kopie) { await frontaDat.dokonci(); await kopiruj(UL.aktivni, s); }
      await nastaveniProhlizece.smaz(CEKA_SLOZKA);
    }
    await nastaveniProhlizece.zapis('slozka', h);
    UL.slozka = s; UL.chybaSlozky = '';
    await prepniNa(s);
    toast(t('app.ukladaDo', { slozka: h.name }), 5000);
  });
  $('#ulozisteProhlizec').onclick = priZmeneDat(async () => {
    const kopie = await potvrd(t('app.dataPrevzit'), t('app.dataPrevzitAno'), t('app.dataBezPrevzeti'));
    if (kopie === false) return;
    if (kopie) {
      if (await UL.slozka.povol() !== 'granted') { toast(t('app.bezPovoleni'), 5000); return; }
      await frontaDat.dokonci();
      if (UL.aktivni !== UL.slozka) await obnovSlozku(UL.slozka);
      await kopiruj(UL.slozka, UL.prohlizec);
    }
    await nastaveniProhlizece.smaz('slozka');
    await nastaveniProhlizece.smaz(CEKA_SLOZKA);
    UL.slozka = null; UL.chybaSlozky = ''; zapisChyba = '';
    await prepniNa(UL.prohlizec);
    toast(t('app.zpetProhlizec'), 5000);
  });
  function stahniZalohu(zip, kdy, nazev) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
    a.download = `${nazev} ${new Date(kdy).toISOString().slice(0, 10)}.zip`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  $('#ulozisteZaloha').onclick = priZmeneDat(async () => {
    try {
      await frontaDat.dokonci();
      const kdy = Date.now();
      stahniZalohu(await zalohaDat(UL.aktivni), kdy, t('app.zalohaSoubor'));
      uloz.pis('kt-zaloha', kdy); stavUloziste();
    } catch (e) { hlasData(t('app.dataZalohaChyba', { chyba: chybaText(e) })); }
  });
  $('#ulozistePredObnovou').onclick = () => {
    try { stahniZalohu(UL.predObnovou.zip, UL.predObnovou.kdy, t('app.dataPredObnovou')); }
    catch (e) { hlasData(t('app.dataZalohaChyba', { chyba: chybaText(e) })); }
  };
  const obnovZeSouboru = priZmeneDat(async f => {
    // nothing to lose on a first visit (no players yet): no question then
    if (viditelni(S.profily).length && !await potvrd(t('app.dataPotvrditObnovu'), t('html.obnovit'))) return;
    const ul = UL.aktivni;
    let zprava, chyba;
    try {
      stopVse(); await frontaDat.dokonci();
      if (f.size > MAX_ZIP) throw new Error(t('zip.limit'));
      const r = await obnovDat(ul, new Uint8Array(await f.arrayBuffer()), { predObnovou: async zip => {
        const zaloha = { kdy: Date.now(), zip };
        await nastaveniProhlizece.zapis('zaloha_pred_obnovou', zaloha);
        UL.predObnovou = zaloha;
      } });
      zprava = t('app.obnoveno', { pisni: t('pisni', { n: r.pisni }), dat: r.dat });
    } catch (e) { chyba = t('app.obnovaChyba', { chyba: chybaText(e) }); }
    finally { await prepniNa(ul, { obnova: true }); }
    if (chyba) hlasData(chyba);
    else { zapisChyba = ''; stavUloziste(); zavriOkno('settings'); toast(zprava, 5000); }
  });
  $('#ulozisteObnova').onchange = e => {
    const f = e.target.files[0]; e.target.value = '';
    if (f) obnovZeSouboru(f);
  };

  /** editor for a new song (from conversion or MIDI); the first save adds it to the library, later saves overwrite it */
  function editorNovePisne(pisen, volby = {}) {
    let soubor = null;
    Editor.otevriEditor({
      pisen, verovioTk, zahraj: zahrajTony, ...volby,
      onUloz: async p => {
        if (!p.nazev) p.nazev = t('app.novaPisnicka');           // a song without a title (e.g. from an AI chat) gets one in the app's language
        const xml = naMusicXml(p);
        const jmeno = p.nazev.replace(/[\/\\:]/g, ' ') + '.musicxml';
        soubor = soubor ? await api.prepis(soubor, xml) : (await api.pridej(new File([xml], jmeno))).soubor;
        nactiPisne();
      },
    });
  }

  // ------------------------------------------------------------ song from MIDI (no AI)
  let MIDI = null;
  async function otevriMidi(f) {
    const m = MidiSoubor.ctiMidi(new Uint8Array(await f.arrayBuffer()));
    const navrh = MidiSoubor.navrhniStopy(m);
    const pr = MidiSoubor.prehledStop(m);
    MIDI = { m };
    const opt = s => `<option value="${s.id}" ${s.bici ? 'disabled' : ''}>${esc(s.popis)} – ${esc(t('app.midiStopa', { noty: t('not', { n: s.pocet }), rozsah: s.rozsah }))}`
      + `${s.souzvuky > 0.5 ? esc(t('app.midiAkordy')) : ''}</option>`;
    $('#midiMelodie').innerHTML = pr.map(opt).join('');
    $('#midiLeva').innerHTML = `<option value="">${esc(t('app.bezLeve'))}</option>` + pr.map(opt).join('');
    $('#midiMelodie').value = String(navrh.melodie);
    $('#midiLeva').value = navrh.leva == null ? '' : String(navrh.leva);
    $('#midiNazev').value = m.nazev || f.name.replace(/\.[^.]+$/, '');
    $('#midiInfo').textContent = t('app.midiInfo', { takt: m.takt, tempo: Math.round(m.tempo),
      stopy: t('app.midiStopy', { stopy: t('stop', { n: pr.length }) }) });
    otevriDialog($('#midiOkno'), { fokus: $('#midiNazev') });
  }
  $('#midiZrusit').onclick = () => zavriDialog($('#midiOkno'));
  $('#midiPoslech').onclick = () => {                     // first ~10 s of the chosen track (for a split track only above middle C)
    if (!MIDI) return;
    const { m } = MIDI, id = Number($('#midiMelodie').value);
    const s = m.stopy.find(x => x.id === id);
    const deli = $('#midiLeva').value === String(id);
    const ac = audio(), t0 = ac.currentTime + 0.1, sek = t => t / m.ppq * 60 / m.tempo;
    const prvni = s.noty.find(n => !deli || n.midi >= 60)?.zac || 0;
    for (const n of s.noty) {
      if (deli && n.midi < 60) continue;
      const kdy = sek(n.zac - prvni);
      if (kdy < 0 || kdy > 10) continue;
      hlas(n.midi, t0 + kdy, Math.max(0.1, sek(n.kon - n.zac)), 0.5);
    }
  };
  $('#midiForm').onsubmit = e => {
    e.preventDefault();
    try {
      const leva = $('#midiLeva').value;
      const v = MidiSoubor.midiNaPisen(MIDI.m, { melodie: Number($('#midiMelodie').value),
        leva: leva === '' ? null : Number(leva), nazev: $('#midiNazev').value.trim() });
      zavriDialog($('#midiOkno'));
      editorNovePisne(v.pisen, { poznamky: v.poznamky });
      toast(t('app.zkontrolujUloz'), 5000);
    } catch (err) { toast('MIDI: ' + chybaText(err), 6000); }
  };

  // ------------------------------------------------------------ where to get sheet music
  let zdrojeZPisnicek = false;
  $('#zdroje').onclick = () => { zavriOkno('songs'); zdrojeZPisnicek = true; otevriDialog($('#zdrojeOkno'), { zavrit: () => $('#zdrojeZavrit').click() }); };
  $('#zdrojeZavrit').onclick = () => {
    zavriDialog($('#zdrojeOkno'));
    if (zdrojeZPisnicek) { zdrojeZPisnicek = false; navratDoPisnicek = true; otevriOkno('songs'); $('#zdroje').focus(); }   // back to Songs where it was opened
  };
  // About Rusalka: a window over the current screen; #about in the address opens it (also on start, see the end)
  const ZDROJOVY_KOD = 'https://github.com/j-necas/rusalka';   // the public repository
  const APP_STORE_MIDI = 'https://apps.apple.com/app/web-midi-browser/id953846217';   // Web MIDI Browser: a MIDI piano on an iPad/iPhone
  /** "Web MIDI Browser" in a translated text becomes a link to the App Store (the name is the same in every language) */
  function odkazAppStore(el) {
    if (!el || el.querySelector('a')) return;
    const i = el.textContent.indexOf('Web MIDI Browser');
    if (i < 0) return;
    const text = el.textContent, a = document.createElement('a');
    a.href = APP_STORE_MIDI; a.target = '_blank'; a.rel = 'noopener'; a.className = 'odkaz-ven'; a.textContent = 'Web MIDI Browser';
    el.replaceChildren(text.slice(0, i), a, text.slice(i + 'Web MIDI Browser'.length));
  }
  $$('.vstup-appstore').forEach(a => { a.href = APP_STORE_MIDI; });
  const otevreno = sel => !$(sel).classList.contains('skryta');
  // the top menu: one window per item, each also opens from its address (#songs, #players, #ai, #settings, #about)
  let navratDoPisnicek = false;                         // Songs reopens from the editor or the sources: keep the search and the title
  /** a demo loop plays only while it can be seen: from now until its window is hidden again */
  function hrajUkazku(video, okno) {
    if (!video) return;
    video.play().catch(() => {});
    const o = $(okno), sleduj = new MutationObserver(() => { if (o.classList.contains('skryta')) { video.pause(); sleduj.disconnect(); } });
    sleduj.observe(o, { attributes: true, attributeFilter: ['class'] });
  }
  $('.pomocnik-video')?.addEventListener('toggle', e => { const v = e.currentTarget.querySelector('video'); if (e.currentTarget.open) hrajUkazku(v, '#aiOkno'); else v.pause(); });
  const OKNA = { menu: '#menuOkno', songs: '#pisnickyOkno', players: '#hraciOkno', ai: '#aiOkno', settings: '#nastaveniOkno', about: '#oRusalceOkno' };
  const PRED_OTEVRENIM = {
    songs: () => {
      if (!navratDoPisnicek) { $('#spravaHledat').value = ''; SPRAVA = null; }   // a fresh start unless coming back from the editor/sources
      navratDoPisnicek = false;
      vykresliSpravu();
    },
    players: () => { STAT.hrac = null; STAT.vse = false; vykresliHrace(); },
    ai: () => $('#pomocnikKopie').classList.add('skryta'),
    settings: () => {
      $('#nastaveniStav').textContent = $('.midi-stav .text')?.textContent || ''; stavUloziste();
      const p = $('#kdo').classList.contains('skryta') ? aktualniProfil() : null;   // Display only for a chosen player
      $('#nastaveniZobrazeni').classList.toggle('skryta', !p);
      if (p) {
        $('#nastaveniZobrazeniPro').textContent = t('rodice.zobrazeniPro', { jmeno: p.jmeno });
        $('#nastaveniZobrazeni').append($('#zobrazeni .prepinace') || $('#nastaveniZobrazeni .prepinace'));
      }
    },
    about: () => { $('#oRusalceKod').classList.toggle('skryta', !ZDROJOVY_KOD); odkazAppStore($('#oRusalceOkno [data-t="about.potrebujesText"]')); $$('.o-rusalce-video').forEach(v => hrajUkazku(v, '#oRusalceOkno')); },
  };
  /** opens a menu window (another open one closes first) */
  function otevriOkno(klic, navrat) {
    for (const [k, sel] of Object.entries(OKNA)) if (k !== klic && otevreno(sel)) zavriOkno(k);
    PRED_OTEVRENIM[klic]?.();
    otevriDialog($(OKNA[klic]), { zavrit: () => zavriOkno(klic), navrat });
  }
  function zavriOkno(klic) {
    if (zavriDialog($(OKNA[klic])) && location.hash === '#' + klic) history.replaceState(null, '', location.pathname + location.search);
  }
  const otevreneOkno = () => Object.keys(OKNA).find(k => otevreno(OKNA[k]));
  const ai = otevrit => (otevrit ? otevriOkno('ai') : zavriOkno('ai'));
  for (const k of Object.keys(OKNA)) {
    $$('.menu-' + k).forEach(b => b.onclick = () => otevriOkno(k, b));
    $(OKNA[k]).addEventListener('click', e => { if (e.target === e.currentTarget || e.target.closest('[data-zavrit]')) zavriOkno(k); });
  }
  $$('.pata .odkaz, #novyUvod .odkaz').forEach(b => b.onclick = () => otevriOkno('about'));   // More about Rusalka
  $$('.menu-vse').forEach(b => b.onclick = () => otevriOkno('menu'));
  // narrow screens: when the links don't fit (measured), the bar keeps AI and Menu; Menu lists the rest
  const SOUSEDE = { kdo: '#kdo .logo-kdo, #kdo h1', domu: '#domu .ja, #domu .midi-stav', novy: '#novyZpet, #novyNadpis', pred: '#predZpet' };
  function prizpusobMenu() {
    const pres = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    for (const nav of $$('.horni-menu')) {
      const scr = nav.closest('main');
      if (!scr || scr.classList.contains('skryta')) continue;
      nav.classList.remove('sbalene');                  // measure the full bar
      const r = nav.getBoundingClientRect(), tlac = [...nav.children].filter(c => c.getClientRects().length);
      const radky = new Set(tlac.map(c => Math.round(c.getBoundingClientRect().top)));
      const sousede = [...document.querySelectorAll(SOUSEDE[scr.id] || '#_')].filter(e => e.getClientRects().length);
      const stav = scr.querySelector('.midi-stav .text');
      const nevejde = r.right > innerWidth + 1 || r.left < -1 || radky.size > 1
        || tlac.some(c => c.getBoundingClientRect().right > innerWidth + 1)
        || sousede.some(e => pres(r, e.getBoundingClientRect()))
        || (stav && stav.getClientRects().length > 1);   // the piano status would have to wrap
      nav.classList.toggle('sbalene', nevejde);
    }
  }
  let menuRAF = 0;
  addEventListener('resize', () => { cancelAnimationFrame(menuRAF); menuRAF = requestAnimationFrame(prizpusobMenu); });
  document.fonts?.ready?.then(prizpusobMenu);
  $('#oRusalceZavrit').onclick = () => zavriOkno('about');
  $('#aiZavrit').onclick = () => zavriOkno('ai');
  const oknoZAdresy = () => {
    const k = location.hash.slice(1);
    if (OKNA[k]) otevriOkno(k);
    else if (otevreneOkno()) zavriOkno(otevreneOkno());  // e.g. the browser's Back after opening #songs
  };
  addEventListener('hashchange', oknoZAdresy);
  $('#oRusalceKod .odkaz').onclick = () => window.open(ZDROJOVY_KOD, '_blank', 'noopener');
  $$('#zdrojeOkno .odkaz').forEach(b => b.onclick = () => window.open(b.dataset.url, '_blank', 'noopener'));
  function zahrajTony(midi, delka = 0.5) {
    const ac = audio();
    midi.forEach(p => hlas(p, ac.currentTime + 0.01, delka, 0.6));
  }
  // ------------------------------------------------------------ My songs: the user's own songs (not the library and its
  // samples); actions on a file, not on the song being played (choosing a title doesn't load it into the game: level, key,
  // pair mode and loop stay; works without a chosen player)
  let SPRAVA = null;                                    // the chosen file in My songs
  async function vykresliSpravu() {
    let seznam = [];
    try { seznam = await api.seznam(); } catch { /* the list stays empty */ }
    $('#spravaHledat').classList.toggle('skryta', !seznam.length);
    const vybrane = filtrujPisne(seznam, $('#spravaHledat').value, S.infoPisni || {});
    $('#spravaSeznam').innerHTML = vybrane.map(p => `<button class="polozka sprava-polozka${p.soubor === SPRAVA ? ' ted' : ''}" data-soubor="${esc(p.soubor)}"
      aria-pressed="${p.soubor === SPRAVA}"><span>${esc(p.nazev)}</span></button>`).join('')
      || `<p class="napoveda">${esc(t(seznam.length ? 'domu.nic' : 'menu.mojeNic'))}</p>`;
    const vyb = seznam.find(p => p.soubor === SPRAVA);
    if (!vyb) SPRAVA = null;
    $('#spravaAkce').classList.toggle('skryta', !vyb);
    if (vyb) $('#spravaNazev').textContent = vyb.nazev;
  }
  $('#spravaHledat').oninput = () => vykresliSpravu();
  $('#spravaSeznam').onclick = e => {
    const b = e.target.closest('[data-soubor]');
    if (b) { SPRAVA = b.dataset.soubor; vykresliSpravu().then(() => $('#spravaUpravit').focus()); }
  };
  /** the editor for a file; saving overwrites it (and refreshes the game if it is the song being played) */
  async function upravSoubor(soubor) {
    let xml;
    try { xml = await api.xml(soubor); } catch (e) { toast(chybaText(e), 5000); return; }
    const pisen = zMusicXml(xml);
    if (!pisen.nazev) pisen.nazev = soubor.replace(/\.[^.]+$/, '');
    zavriOkno('songs');
    if (soubor === S.pisen) stopVse();
    const bohatsi = /<backup>|<dynamics>|<slur |<pedal |<grace|<wedge |<articulations>|<\/part>\s*<part /.test(xml);
    let aktualni = soubor, puvodni = pisen;
    Editor.otevriEditor({
      pisen, verovioTk, zahraj: zahrajTony,
      varovani: bohatsi ? t('app.editorVarovani') : '',
      onUloz: async p => {
        const novy = await api.prepis(aktualni, naMusicXml(p));
        if (p.takty.length !== puvodni.takty.length) {     // statistics would point to different bars
          for (const st of Object.values(S.statistiky || {})) for (const k of Object.keys(st || {})) if (k.startsWith(aktualni + '#')) delete st[k];
          data.pis('statistiky', S.statistiky);
        }
        const hraje = aktualni === S.pisen;
        if (PRED.soubor === aktualni) { PRED.soubor = novy || aktualni; $('#predNazev').textContent = p.nazev || PRED.soubor; }
        if (novy && novy !== aktualni) aktualni = novy;
        puvodni = p;
        if (hraje) {
          S.pisen = aktualni; S.puvodniXml = naMusicXml(p); S.puvodni = p; S.usek = null;
          await pripravVerzi(); ovladaniPisne(); nastavRuku();
        }
        nactiPisne();
      },
      onZavrit: () => { SPRAVA = aktualni; navratDoPisnicek = true; otevriOkno('songs'); },
    });
  }
  /** instructions for an easier version of a file (the song as written) */
  async function jednodussiSoubor(soubor) {
    try {
      const pisen = zMusicXml(await api.xml(soubor));
      if (!pisen.nazev) pisen.nazev = soubor.replace(/\.[^.]+$/, '');
      await zkopiruj(pokyny('uprava', { pisen }));
    } catch (e) { toast(chybaText(e), 5000); }
  }
  /** delete an own song; asks with the title, the list stays open */
  async function smazSoubor(soubor) {
    const nazev = $('#spravaNazev').textContent || soubor;
    if (!(await potvrd(t('rodice.smazatPisenOtazka', { nazev }), t('rodice.smazatPisenAno', { nazev })))) return;
    try {
      await api.smaz(soubor);
      if (soubor === S.pisen) { stopVse(); S.pisen = null; S.data = null; }
      if (soubor === PRED.soubor && !$('#pred').classList.contains('skryta')) ukaz('domu');   // it was open on Before playing
      SPRAVA = null;
      nactiPisne(); await vykresliSpravu();
      toast(t('app.pisenSmazana'));
    } catch (e) { toast(t('app.smazatChyba', { chyba: chybaText(e) }), 5000); }
  }
  $('#spravaUpravit').onclick = () => SPRAVA && upravSoubor(SPRAVA);
  $('#spravaJednodussi').onclick = () => SPRAVA && jednodussiSoubor(SPRAVA);
  $('#spravaSmazat').onclick = () => SPRAVA && smazSoubor(SPRAVA);

  // ------------------------------------------------------------ notes: model → Verovio (single-line SVG, note times, chords)
  let VTK = null;                                     // the loaded toolkit, for synchronous re-rendering once a song is open
  async function verovioTk() {
    try { return (VTK = await window.nactiVerovio()); }
    catch { throw new Error(t('app.verovioChyba')); }
  }
  /**
   * Unrolled song model → everything the game needs: single-line SVG, notes with times (and bar), chords, bar starts.
   * Verovio options are set again every time (the toolkit is shared with conversion and the editor).
   */
  async function zpracujModel(model) {
    return vykresliModel(await verovioTk(), model);
  }
  function vykresliModel(tk, model) {
    const xml = naMusicXml(model).replace(/<part-name>[^<]*<\/part-name>/g, '<part-name print-object="no"></part-name>');
    return zpracujVerovio(tk, xml, model, volbyVykresleni());
  }
  /** a single line (scrolls sideways) or a whole page (lines stacked, scrolls down) */
  const volbyVykresleni = () => (S.nastaveni.stranka ? { stranka: true, sirka: $('#noty').clientWidth || 1200 } : {});


  // ------------------------------------------------------------ sound (simple piano synthesizer)
  let AC = null, MASTER = null;
  function audio() {
    if (!AC) {
      const C = window.AudioContext || window.webkitAudioContext;
      AC = new C();
      const comp = AC.createDynamicsCompressor();
      MASTER = AC.createGain(); MASTER.gain.value = 0.8;
      MASTER.connect(comp); comp.connect(AC.destination);
      nactiNahravky(AC);
    }
    return AC;
  }
  const zvukPripraven = () => obnovAudio(audio());
  function odemkniZvuk() { zvukPripraven().catch(e => console.warn('AudioContext', e)); }
  // the recorded piano (static/lib/piano.js): loaded after the first sound, until then (or if it fails) the synthesised voice
  const NAHRAVKY = new Map();
  function nactiNahravky(ac) {
    for (const n of VZORKY) {
      fetch(`sounds/piano/${n}.mp3`).then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
        .then(data => new Promise((ok, chyba) => ac.decodeAudioData(data, ok, chyba)))
        .then(b => NAHRAVKY.set(naMidi(n), b), e => console.warn('nahrávka klavíru', n, e));
    }
  }
  function hlasNahravka(p, kdy, delka, sila, vz) {
    const ac = AC, src = ac.createBufferSource(), g = ac.createGain(), lp = ac.createBiquadFilter();
    src.buffer = NAHRAVKY.get(vz.vzorek); src.playbackRate.value = vz.rychlost;
    lp.type = 'lowpass'; lp.frequency.value = 1800 + sila * 9000;      // softer notes are darker, as on a real piano
    g.gain.value = 0.2 + sila * 0.6;
    src.connect(lp); lp.connect(g); g.connect(MASTER); src.start(kdy);
    let pusteno = false;
    const v = {
      naplanovany: delka != null,
      pust(t) {
        if (pusteno) return;
        pusteno = true; t = Math.max(t, kdy + 0.05);
        g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.setTargetAtTime(0, t, 0.12);
        try { src.stop(t + 1.2); } catch { /* already stopped */ }
      },
      zrus() {
        try { g.gain.cancelScheduledValues(0); g.gain.setValueAtTime(0, ac.currentTime); src.stop(); g.disconnect(); } catch { /* */ }
        NAPLANOVANE.delete(v);
      },
    };
    NAPLANOVANE.add(v); src.onended = () => NAPLANOVANE.delete(v);
    if (delka != null) v.pust(kdy + delka);
    return v;
  }
  const NAPLANOVANE = new Set();
  /** notes the app itself plays (accompaniment, listening): the microphone must not take them for the player's keys */
  let VLASTNI_TONY = [];
  function hlas(p, kdy, delka, sila = 0.6) {
    if (VLASTNI_TONY.length > 256) VLASTNI_TONY = VLASTNI_TONY.filter(v => v.do > kdy - 2);
    VLASTNI_TONY.push({ p, od: kdy, do: kdy + (delka ?? 1.5) });
    if (doKlaviru()) return hlasKlavir(p, kdy, delka, sila);
    const ac = audio();
    const vz = NAHRAVKY.size === VZORKY.length ? nejblizsiVzorek(p, NAHRAVKY.keys()) : null;   // all loaded, or none used
    if (vz) return hlasNahravka(p, kdy, delka, sila, vz);
    const f = 440 * Math.pow(2, (p - 69) / 12);
    const g = ac.createGain(), lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(9000, f * 7), kdy);
    lp.frequency.setTargetAtTime(Math.min(5000, f * 3), kdy, 0.25);
    g.gain.setValueAtTime(0.0001, kdy);
    g.gain.linearRampToValueAtTime(sila * 0.22, kdy + 0.008);
    g.gain.setTargetAtTime(0, kdy + 0.008, 0.4 + 1.4 * Math.max(0, 84 - p) / 48);
    g.connect(lp); lp.connect(MASTER);
    const osc = [];
    for (const [h, a] of [[1, 1], [2, 0.5], [3, 0.22], [4, 0.12], [5, 0.06], [6, 0.03]]) {
      const o = ac.createOscillator(), og = ac.createGain();
      o.frequency.value = f * h * (1 + (h - 1) * 0.0007);
      og.gain.value = a; o.connect(og); og.connect(g); o.start(kdy); osc.push(o);
    }
    let pusteno = false;
    const v = {
      naplanovany: delka != null,
      pust(t) {
        if (pusteno) return;
        pusteno = true; t = Math.max(t, kdy + 0.03);
        g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0, t, 0.08);
        osc.forEach(o => { try { o.stop(t + 0.7); } catch { /* already stopped */ } });
      },
      zrus() {
        try { g.gain.cancelScheduledValues(0); g.gain.setValueAtTime(0, ac.currentTime); g.disconnect(); } catch { /* */ }
        osc.forEach(o => { try { o.stop(); } catch { /* */ } });
        NAPLANOVANE.delete(v);
      },
    };
    NAPLANOVANE.add(v); osc[0].onended = () => NAPLANOVANE.delete(v);
    if (delka != null) v.pust(kdy + delka);
    return v;
  }

  // ------------------------------------------------------------ sound from the piano: notes go over Web MIDI to the connected piano
  // The scheduler is in lib/midi_output.js (channel 2, queue 100 ms ahead); time comes from the AudioContext clock.
  const VYSTUP = vytvorVystup();
  const doKlaviru = () => !!(S.nastaveni.zvukKlavir && VYSTUP.nazev);
  function doVystupu(p, v, kdy) {
    VYSTUP.hraj([{ ms: Math.max(0, kdy - audio().currentTime) * 1000, p, v }]);
  }
  function tichoVKlaviru() { VYSTUP.ticho(); }
  /** same interface as a synthesizer voice; strength 0.45 (backing) ≈ 50, 0.8 (listening) ≈ 88 out of 127 */
  function hlasKlavir(p, kdy, delka, sila) {
    doVystupu(p, Math.max(20, Math.min(120, Math.round(sila * 110))), kdy);
    let pusteno = false;
    const v = {
      naplanovany: delka != null,
      pust(t) { if (!pusteno) { pusteno = true; doVystupu(p, 0, Math.max(t, kdy + 0.03)); } },
      zrus() { pusteno = true; },                  // the piano's queue is emptied by tichoVKlaviru() in stopVse
    };
    if (delka != null) v.pust(kdy + delka);
    return v;
  }

  function klik(kdy, silny, hlasitost = 0.25) {
    const ac = audio(), o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = silny ? 1760 : 1320;
    g.gain.setValueAtTime(0.0001, kdy); g.gain.linearRampToValueAtTime(hlasitost, kdy + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, kdy + 0.06);
    o.connect(g); g.connect(MASTER); o.start(kdy); o.stop(kdy + 0.08);
    // metronome clicks are scheduled ahead – stopVse (Pause, Quit) must be able to cancel them
    const v = { naplanovany: true, zrus() { try { o.stop(); } catch { /* already finished */ } NAPLANOVANE.delete(v); } };
    NAPLANOVANE.add(v); o.onended = () => NAPLANOVANE.delete(v);
  }
  ['pointerdown', 'touchend', 'click'].forEach(t => document.addEventListener(t, () => { if (AC) odemkniZvuk(); }, { passive: true }));

  // ------------------------------------------------------------ MIDI: Web MIDI (Chrome, Edge); input from and output to the piano
  const Midi = { web: [], zname: false };
  const MERENI_DRZENI = vytvorMereniDrzeni();
  function midiZprava(d, port) {
    const kanal = d[0] & 0x0f;
    if (VYSTUP.pouzivaSe && kanal === KANAL_VYSTUPU) return;   // what the app plays is not the child's playing
    const zdroj = `${port}:${kanal}`;
    const st = d[0] & 0xf0;
    if (st === 0x90 && d[2] > 0) vstupOn(d[1], d[2], 'midi', zdroj);
    else if (st === 0x80 || st === 0x90) vstupOff(d[1], 'midi', zdroj);
    else if (st === 0xb0 && d[1] === 64) MERENI_DRZENI.pedal(zdroj, d[2] >= 64, AC?.currentTime ?? 0);
  }
  async function midiStart() {
    midiStav();
    if (!navigator.requestMIDIAccess) return;
    try {
      const acc = await navigator.requestMIDIAccess();
      const naZpravu = e => midiZprava(e.data, e.currentTarget?.id ?? e.target?.id ?? 'midi');
      let pripojene = new Set();
      const napoj = () => {
        const vstupy = seznamPortu(acc.inputs);   // not .values(): in Web MIDI Browser (iPad) it is not iterable
        // set only once: in Web MIDI Browser setting the handler opens the port and fires statechange (napoj again)
        vstupy.forEach(i => { if (i.onmidimessage !== naZpravu) i.onmidimessage = naZpravu; });
        const ted = new Set(vstupy.filter(i => i.state !== 'disconnected').map(i => i.id ?? 'midi'));
        for (const id of pripojene) if (!ted.has(id)) for (let k = 0; k < 16; k++) MERENI_DRZENI.odpoj(`${id}:${k}`);
        pripojene = ted;
        const n = pripojeneVstupy(vstupy);
        VYSTUP.pripoj(vyberVystup(seznamPortu(acc.outputs), n));
        noveVstupy(n); stavZvukuKlaviru();
      };
      acc.onstatechange = napoj; napoj();
    } catch (e) { console.warn('Web MIDI', e); }   // the browser did not allow MIDI
  }
  /** the MIDI inputs changed; the first report is the starting state, a piano connected later switches to MIDI */
  function noveVstupy(n) {
    const predtim = Midi.web.length;
    Midi.web = n;
    if (Midi.zname) {
      const v = poZmeneKlaviru(S.vstup, predtim, n.length);
      if (v !== S.vstup) { nastavVstup(v.rezim); toast(t('vstup.prepnuto', { nazev: n.join(', ') }), 5000); }
    }
    Midi.zname = true;
    midiStav();
  }
  // ------------------------------------------------------------ how this device plays (static/lib/input.js): one button on Home
  const MIDI_UMI = !!navigator.requestMIDIAccess;
  S.vstup = nactiVstup(uloz.cti('kt-vstup', null), { midiUmi: MIDI_UMI });
  function textVstupu() {
    // what is really played on: without a connected piano it is the on-screen keys
    const r = S.vstup.rezim, nazvy = Midi.web;
    const co = r === 'mikrofon' ? t('vstup.naMikrofon') : r === 'midi' && nazvy.length ? t('vstup.naKlaviru', { nazev: nazvy.join(', ') })
      : r === 'midi' && MIDI_UMI ? t('vstup.naKlavesachBezKlaviru') : t('vstup.naKlavesach');   // MIDI chosen, no piano: say why
    return t('vstup.hrajeNa', { co });
  }
  /** does the chosen input work right now (a piano connected, the microphone listening)? */
  const vstupFunguje = () => (S.vstup.rezim === 'midi' ? Midi.web.length > 0 : S.vstup.rezim === 'mikrofon' ? !!MIKROFON?.aktivni : false);
  const klavesyVidet = () => klavesyViditelne({ klaviatura: S.nastaveni.klaviatura, rezim: S.vstup.rezim, vstupFunguje: vstupFunguje() });
  /** shows or hides the on-screen keys; during a game the notes are laid out again */
  function ukazKlavesy() {
    const bez = !klavesyVidet(), hra = $('#hra');
    if (!hra || hra.classList.contains('bez-klaviatury') === bez) return;
    hra.classList.toggle('bez-klaviatury', bez);
    if (hra.classList.contains('skryta') || !S.svg) return;
    requestAnimationFrame(() => {
      velikostNot(); spocitejPozice(); S.radek = null;
      if (S.kroky[H.idx]) posunKrok(H.idx, true);
    });
  }
  function midiStav() {
    const r = S.vstup.rezim, ok = vstupFunguje();
    $$('.midi-stav').forEach(el => {
      el.classList.toggle('ok', !!ok);
      el.classList.toggle('obrazovka', r === 'obrazovka');
      el.title = textVstupu();
      const tx = el.querySelector('.text');
      if (tx) tx.textContent = textVstupu();
    });
    $$('[data-vstup]').forEach(b => {
      const zvolen = b.dataset.vstup === r;
      b.setAttribute('aria-checked', String(zvolen));
      b.classList.toggle('ted', zvolen);
      if (b.dataset.vstup === 'midi') b.disabled = !MIDI_UMI;
    });
    const popisMidi = !MIDI_UMI ? t('vstup.midiNeumi') : Midi.web.length ? t('vstup.midiPripojeno', { nazev: Midi.web.join(', ') }) : t('vstup.midiNepripojen');
    $$('.vstup-midi-popis').forEach(p => { p.textContent = popisMidi; });
    $$('.vstup-appstore').forEach(a => a.classList.toggle('skryta', MIDI_UMI));   // no Web MIDI here: the iPad/iPhone way
    $('#predVstupText').textContent = t(r === 'midi' ? 'vstup.napovedaBezKlaviru' : 'vstup.napoveda');
    // Before playing: no piano → under Play, what you play on and the microphone (not after choosing the on-screen keys)
    const vybrano = uloz.cti('kt-vstup', null)?.rezim;
    $('#predVstup')?.classList.toggle('skryta', !((r === 'midi' && !Midi.web.length) || (r === 'obrazovka' && vybrano !== 'obrazovka')));
    $$('.prep-doprovod').forEach(b => b.classList.toggle('zap', doprovodZapnuty(S.vstup)));
    $('#prepKlaviatura')?.classList.toggle('skryta', r === 'obrazovka');
    ukazKlavesy();
    prizpusobMenu();
  }
  function nastavVstup(rezim) {
    S.vstup = { ...S.vstup, rezim };
    uloz.pis('kt-vstup', S.vstup);
    if (rezim !== 'mikrofon' && MIKROFON.aktivni) MIKROFON.vypni();
    midiStav();
  }
  /** Play and Again are a tap: the moment the browser lets the microphone start (no prompt when the page opens) */
  async function zapniMikrofonPriHre() {
    if (S.vstup.rezim !== 'mikrofon' || MIKROFON.aktivni || S.dvojice) return;
    try { await MIKROFON.zapni(); midiStav(); } catch (e) { toast(t('app.mikrofonChyba', { chyba: chybaText(e) }), 6000); }
  }
  function vstupMenu(otevrit, { fokus } = {}) {
    $('#vstupMenu').classList.toggle('skryta', !otevrit);
    $('#vstupTlacitko').setAttribute('aria-expanded', String(otevrit));
    if (otevrit) ($('#vstupMenu [aria-checked="true"]:not(:disabled)') || $('#vstupMenu button:not(:disabled)'))?.focus();
    else if (fokus) $('#vstupTlacitko').focus();
  }
  const vstupMenuOtevrene = () => !$('#vstupMenu').classList.contains('skryta');
  $('#predMikrofon').onclick = () => { nastavVstup('mikrofon'); toast(t('vstup.mikrofonPriHre'), 5000); };
  $('#vstupTlacitko').onclick = () => vstupMenu(!vstupMenuOtevrene());
  $$('[data-vstup]').forEach(b => b.addEventListener('click', () => {
    nastavVstup(b.dataset.vstup);
    if (b.closest('#vstupMenu')) vstupMenu(false, { fokus: true });
  }));
  $('#vstupMenu').addEventListener('keydown', e => {
    const polozky = [...document.querySelectorAll('#vstupMenu button:not(:disabled)')], i = polozky.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      polozky[(i + (e.key === 'ArrowDown' ? 1 : polozky.length - 1)) % polozky.length]?.focus();
    } else if (e.key === 'Tab') vstupMenu(false);
  });
  document.addEventListener('click', e => { if (vstupMenuOtevrene() && !e.target.closest('.vstup-obal')) vstupMenu(false); });

  // ------------------------------------------------------------ microphone (for players without MIDI)
  const hraPozastavena = () => !$('#pauzaPrekryv').classList.contains('skryta');
  /** notes the game is currently waiting for (for microphone recognition); null = none */
  function ocekavaneTony() {
    if (Editor.jeOtevreny() || !lzeHrat() || !S.kroky.length || H.kalibrace) return null;
    if (S.rezim === 'cekam') {
      const k = S.kroky[H.idx];
      return k ? [...k.vyska].filter(p => !H.stisk.has(p)) : null;
    }
    if ((S.rezim === 'tempo' || S.rezim === 'pockej') && H.bezi) {
      const dok = casProZasah(cas()) + OKNO * H.sp;
      for (let i = H.kontrola; S.kroky[i]?.ms <= dok; i++) {
        const vysky = S.kroky[i].noty.filter(n => !H.hotovo.has(n.id)).map(n => n.pitch);
        if (vysky.length) return vysky;
      }
    }
    return null;
  }
  function tonZMikrofonu(m) {
    vstupOn(m, 80, 'mikrofon');
    const k = S.klavesy[m];
    if (k) H.timery.pridej(() => k.classList.remove('stisk'), 150);
  }
  const MIKROFON = vytvorMikrofon({
    audio,
    ocekavane: ocekavaneTony,
    trefa: tonZMikrofonu,
    vedle: tonZMikrofonu,
    vlastni: () => VLASTNI_TONY,
    stav: text => {
      midiStav();
      if (text) hlaska(esc(text));
    },
  });

  // ------------------------------------------------------------ input (piano and touch)
  const zive = new Map();
  const lzeHrat = () => !document.hidden && !hraPozastavena() && !H.ukoncen && S.data
    && $('#hra').classList.contains('skryta') === false && $('#vysledek').classList.contains('skryta');
  function vstupOn(p, v, zdroj, kanal = zdroj) {
    if (!prijimaZdroj(S.vstup.rezim, zdroj)) return;    // MIDI only in MIDI mode, the microphone only in microphone mode
    if (zdroj === 'dotyk') {
      if (hraPozastavena()) return;
      const ac = audio();
      zive.get(p)?.pust(ac.currentTime);
      zive.set(p, hlas(p, ac.currentTime, null, 0.5 + v / 300));
    }
    S.klavesy[p]?.classList.add('stisk');
    if (Doplnky.ozvenaAktivni()) { Doplnky.ozvenaTon(p); return; }
    if (Editor.jeOtevreny()) { if (zdroj === 'midi') Editor.midi(p); return; }
    if (!lzeHrat()) return;
    if (H.kalibrace) { if (H.kalibrace.kliky.length) H.kalibrace.stisky.push(audio().currentTime); return; }
    H.posledniSila = v;
    if (zdroj === 'midi') H.silaZMidi = true;              // on-screen keys and the microphone have no key velocity
    if (S.rezim === 'cekam') onCekam(p);
    else if ((S.rezim === 'tempo' || S.rezim === 'pockej') && H.bezi) onTempo(p, kanal);
  }
  function vstupOff(p, zdroj, kanal = zdroj) {
    if (zdroj === 'dotyk') {
      const z = zive.get(p);
      if (z) { z.pust(audio().currentTime); zive.delete(p); }
    }
    S.klavesy[p]?.classList.remove('stisk');
    MERENI_DRZENI.pust(kanal, p, AC?.currentTime ?? 0);
  }

  // ------------------------------------------------------------ home screen
  /** app colour by the player's animal (sloth, rabbit; others default) */
  /** app colour by the player's palette (new screens --hl/--sv/--sv-2, old ones --akcent/--pozadi) */
  function nastavAkcent() {
    const p = aktualniProfil(), pal = paleta(p ? prevedProfil(p, S.profily).barva : 'inkoust');
    const st = document.body.style;
    st.setProperty('--hl', pal.tmava); st.setProperty('--sv', pal.svetla); st.setProperty('--sv-2', pal.stredni);
    st.setProperty('--akcent', pal.tmava); st.setProperty('--akcent-svetla', pal.stredni); st.setProperty('--pozadi', pal.svetla);
  }
  // each player has their own display and sound settings (the formerly shared “kt-nastaveni” is the default)
  const VYCHOZI_NASTAVENI = { rychlost: 70, pismena: true, barvy: true, doprovod: true, kalibrace: 0, klaviatura: true, zvukKlavir: true };
  /** Listen plays the whole song at full speed (poslechCelePisne); the player's own choices wait here until it ends */
  let POSLECH = null;
  /** a player's settings go to the data (the folder, the backup); without a player to this browser */
  function ulozNastaveni() {
    const v = POSLECH ? { ...S.nastaveni, rychlost: POSLECH.zaloha.rychlost } : { ...S.nastaveni };
    if (!S.profil) { uloz.pis('kt-nastaveni', v); return; }
    S.nastaveniHracu = { ...S.nastaveniHracu, [S.profil]: v };
    data.pis('nastaveni', S.nastaveniHracu);
  }
  const PREPINACE = [];
  function nactiNastaveniHrace() {
    VYBER_PISNE.zrus(); konecPoslechu();
    S.rukaVolba = null;                                 // a new player: the hand by their age again
    S.nastaveni = Object.assign({}, VYCHOZI_NASTAVENI, uloz.cti('kt-nastaveni', {}),
      S.profil ? S.nastaveniHracu?.[S.profil] || uloz.cti('kt-nastaveni-' + S.profil, {}) : {});
    PREPINACE.forEach(f => f());                       // including the toggles' effects (letters, colours, keyboard…)
    $('#prepMetronom').classList.toggle('zap', !!S.nastaveni.metronom);
    $('#vzorDoprovodu').value = S.nastaveni.vzorDoprovodu || 'auto';
    $('#rychlost').value = S.nastaveni.rychlost; $('#rychlostText').textContent = rychlostText(S.nastaveni.rychlost);
  }
  // ------------------------------------------------------------ Who is playing?
  function zvolHrace(id) {
    UPRAVY_HRACU = false;                                // a chosen player: Who is playing chooses again next time
    S.profil = id; data.pis('profil', id);
    nactiNastaveniHrace();
    vykresliProfily(); vykresliPisne(); ukaz('domu');
    otevriPisenZAdresy();
  }
  // Who is playing: a tile chooses the player; Edit players adds Edit and Delete under each tile
  let UPRAVY_HRACU = false;
  function vykresliKdo() {
    const el = $('#kdoHraci'); el.innerHTML = '';
    const hraci = viditelni(S.profily);
    if (!hraci.length) UPRAVY_HRACU = false;
    for (const p of hraci) {
      const q = prevedProfil(p, S.profily), obal = document.createElement('div'), b = document.createElement('button');
      obal.className = 'hrac-obal';
      b.className = 'dlazdice-hrace';
      b.style.background = paleta(q.barva).svetla;
      b.innerHTML = `${avatarSvg(q)}<b>${esc(q.jmeno)}</b>`;
      b.onclick = () => (UPRAVY_HRACU ? otevriProfil(p.id, { odkud: 'kdo' }) : zvolHrace(p.id));
      obal.appendChild(b);
      if (UPRAVY_HRACU) {
        const akce = document.createElement('div');
        akce.className = 'hrac-akce';
        akce.innerHTML = `<button type="button" class="text-tl" data-upravit="${esc(p.id)}">${esc(t('menu.upravit'))}</button>
          <button type="button" class="text-tl" data-smazat="${esc(p.id)}">${esc(t('smazat'))}</button>`;
        obal.appendChild(akce);
      }
      el.appendChild(obal);
    }
    $('#kdoUpravit').classList.toggle('skryta', !hraci.length);
    $('#kdoUpravit').setAttribute('aria-pressed', String(UPRAVY_HRACU));
    $('#kdoUpravit').textContent = t(UPRAVY_HRACU ? 'kdo.hotovo' : 'kdo.upravit');
  }
  $('#kdoUpravit').onclick = () => { UPRAVY_HRACU = !UPRAVY_HRACU; vykresliKdo(); };
  $('#kdoHraci').addEventListener('click', async e => {
    const upravit = e.target.closest('[data-upravit]')?.dataset.upravit;
    if (upravit) { otevriProfil(upravit, { odkud: 'kdo' }); return; }
    const id = e.target.closest('[data-smazat]')?.dataset.smazat;
    if (id) await smazHraceSPotvrzenim(id);
  });
  function uvodniObrazovka() {
    const hraci = viditelni(S.profily);
    if (hraci.length === 1) { S.profil = hraci[0].id; nactiNastaveniHrace(); vykresliProfily(); vykresliPisne(); ukaz('domu'); otevriPisenZAdresy(); }
    else if (!hraci.length) otevriProfil(null);           // first launch: create a player straight away
    else { vykresliKdo(); ukaz('kdo'); }
  }
  $('#kdoNovy').onclick = () => otevriProfil(null);
  // the player on Home opens a small menu: Edit (My profile) and Change player (Who is playing)
  function jaMenu(otevrit, { fokus } = {}) {
    $('#jaMenu').classList.toggle('skryta', !otevrit);
    $('#mujProfilOtevrit').setAttribute('aria-expanded', String(otevrit));
    if (otevrit) $('#jaMenu button:not(.skryta)')?.focus();
    else if (fokus) $('#mujProfilOtevrit').focus();
  }
  const jaMenuOtevrene = () => !$('#jaMenu').classList.contains('skryta');
  $('#mujProfilOtevrit').onclick = () => aktualniProfil() && jaMenu(!jaMenuOtevrene());
  $('#upravitHrace').onclick = () => { jaMenu(false); if (aktualniProfil()) otevriProfil(aktualniProfil().id); };
  $('#jaMenu').addEventListener('keydown', e => {
    const polozky = [...document.querySelectorAll('#jaMenu button:not(.skryta)')], i = polozky.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      polozky[(i + (e.key === 'ArrowDown' ? 1 : polozky.length - 1)) % polozky.length]?.focus();
    } else if (e.key === 'Tab') jaMenu(false);
  });
  document.addEventListener('click', e => { if (jaMenuOtevrene() && !e.target.closest('.ja-obal')) jaMenu(false); });

  // ------------------------------------------------------------ New player / My profile
  const NP = { id: null, vek: 'dite', obrazek: null, barva: null, zpet: 'kdo', zHracu: null };
  /** odkud: 'kdo' = Edit on Who is playing: Done/Back return there without switching who plays */
  function otevriProfil(id, { odkud } = {}) {
    const p = id ? prevedProfil(S.profily.find(x => x.id === id), S.profily) : null;
    const vidi = viditelni(S.profily).map(q => prevedProfil(q, S.profily));
    Object.assign(NP, p ? { id, vek: p.vek, obrazek: p.obrazek, barva: p.barva, zpet: 'domu' }
      : { id: null, vek: 'dite', obrazek: OBRAZKY.dite.find(o => !vidi.some(q => q.obrazek === o)) || OBRAZKY.dite[0],
        barva: PALETY.find(x => !vidi.some(q => q.barva === x.id))?.id || 'inkoust', zpet: $('#kdo').classList.contains('skryta') ? 'domu' : 'kdo' });
    NP.zHracu = odkud === 'kdo' ? 'kdo' : null;
    $('#novyNadpis').textContent = t(p ? 'novy.profil' : 'novy.nadpis');
    // the first visit (no players yet): free, open source, data stay on the device – right under the heading
    const prvni = !p && !vidi.length;
    $('#novyUvod').classList.toggle('skryta', !prvni);
    $('#novyZpet').classList.toggle('skryta', prvni);              // nowhere to go back to yet: the logo instead
    $('#novy .logo-novy').classList.toggle('skryta', !prvni);
    $('#novy .pata').classList.toggle('skryta', prvni);
    $('#novyJmeno').value = p ? p.jmeno : '';
    vykresliNovy();
    ukaz('novy');
    if (!p) $('#novyJmeno').focus();
  }
  function vykresliNovy() {
    const pal = paleta(NP.barva), sek = $('#novy');
    sek.style.setProperty('--hl', pal.tmava); sek.style.setProperty('--sv', pal.svetla); sek.style.setProperty('--sv-2', pal.stredni);
    if (!VSECHNY_OBRAZKY.includes(NP.obrazek)) NP.obrazek = VSECHNY_OBRAZKY[0];   // child or adult: one choice of pictures
    const jmeno = $('#novyJmeno').value.trim();
    const obr = o => obrazekHrace({ jmeno: jmeno || '?', obrazek: o }, pal);
    $('#novyObrazky').innerHTML = VSECHNY_OBRAZKY.map(o =>
      `<button class="obrazek ${o === NP.obrazek ? 'ted' : ''}" data-obrazek="${o}" aria-label="${esc(t('obrazek.' + o))}">${obr(o)}</button>`).join('');
    $('#novyBarvy').innerHTML = PALETY.map(x =>
      `<button class="barva ${x.id === NP.barva ? 'ted' : ''}" data-barva="${x.id}" aria-label="${esc(t('barva.' + x.id))}" style="background:${x.tmava}"></button>`).join('');
    $('#novyObr').innerHTML = obr(NP.obrazek);
    $('#novyNahled').style.background = pal.svetla;
    $('#novyNahledJmeno').textContent = jmeno || t('novy.jmeno');
    $$('#novy [data-vek]').forEach(b => b.classList.toggle('ted', b.dataset.vek === NP.vek));
  }
  $('#novy').addEventListener('click', e => {
    const o = e.target.closest('[data-obrazek]'), b = e.target.closest('[data-barva]'), v = e.target.closest('[data-vek]');
    if (o) NP.obrazek = o.dataset.obrazek;
    if (b) NP.barva = b.dataset.barva;
    if (v) NP.vek = v.dataset.vek;
    if (o || b || v) vykresliNovy();
  });
  $('#novyJmeno').oninput = () => vykresliNovy();
  /** back to Who is playing after editing a player there (still in Edit players) */
  function zpetDoHracu() {
    NP.zHracu = null;
    vykresliProfily(); vykresliKdo(); vykresliPisne();
    ukaz('kdo');
  }
  $('#novyZpet').onclick = () => {
    if (NP.zHracu) { zpetDoHracu(); return; }
    if (NP.zpet === 'kdo') vykresliKdo();
    ukaz(NP.zpet);
  };
  $('#novyHotovo').onclick = () => {
    const jmeno = $('#novyJmeno').value.trim();
    if (!jmeno) { toast(t('novy.bezJmena')); $('#novyJmeno').focus(); return; }
    const udaje = { jmeno, vek: NP.vek, obrazek: NP.obrazek, barva: NP.barva, zvire: OBRAZKY.dite.includes(NP.obrazek) ? NP.obrazek : null };
    if (NP.id) S.profily = S.profily.map(p => (p.id === NP.id ? { ...p, ...udaje } : p));
    else { NP.id = 'p' + Date.now(); S.profily.push({ id: NP.id, ...udaje }); }
    data.pis('profily', S.profily);
    if (NP.zHracu) { zpetDoHracu(); return; }            // edited on Who is playing: who plays doesn't change
    zvolHrace(NP.id);
  };
  function vykresliProfily() {
    nastavAkcent();
    const p = aktualniProfil();
    $('#mujProfilOtevrit').innerHTML = p ? `${avatarSvg(p)}<b>${esc(p.jmeno)}</b><svg class="sipka" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 5.5 7 9.5l4-4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>` : '';
    $('#zmenitHrace').classList.toggle('skryta', !viditelni(S.profily).length);   // even with one player: the way to New player
  }

  // settles once the difficulty of every listed song is known; pending until the first nactiPisne has read them
  // (the Library must not compute the player's level from songs whose difficulty is not known yet)
  let prvniInfo;
  let INFO_PISNI = new Promise(r => { prvniInfo = r; });
  /** the library index arrived: keep it and take difficulty and composer straight from it (the file is fetched only when opened) */
  function prijmiKnihovnu(index) {
    S.knihovna = index;
    S.infoPisni ||= {};
    for (const p of index) S.infoPisni[p.soubor] ||= { obtiznost: { stupen: p.stupen }, autor: p.autor || '' };
  }
  async function nactiPisne() {
    let hotovo;
    INFO_PISNI = new Promise(r => { hotovo = r; });
    try {
      // own songs and the library index load side by side; home does not wait for the index (drawn again when it comes)
      let seznamHotov = false;
      const indexP = knihovna().then(index => { prijmiKnihovnu(index); if (seznamHotov) vykresliPisne(); });
      try { S.seznam = await api.seznam(); }
      catch (e) { S.seznam = []; toast(t('app.pisneChyba', { chyba: e.message || e })); }
      seznamHotov = true;
      vykresliPisne();
      // own songs: difficulty and composer from the notes (gradually; the result is remembered per file)
      S.infoPisni ||= {};
      for (const p of S.seznam) {
        if (p.chyba || S.infoPisni[p.soubor]) continue;
        try {
          const m = zMusicXml(await api.xml(p.soubor));
          S.infoPisni[p.soubor] = { obtiznost: obtiznost(m), autor: m.autor || '' };
        } catch { S.infoPisni[p.soubor] = { obtiznost: null, autor: '' }; }
      }
      await indexP;
      vykresliPisne();
    } finally { hotovo(); prvniInfo(); }
  }
  /** the player's level for the library (1–3); waits until the difficulty of the own songs has been read (by the
   *  latest nactiPisne, also when one started meanwhile), so a half-read list does not give a level that is too low */
  async function urovenKnihovny() {
    for (let p; p !== INFO_PISNI;) { p = INFO_PISNI; await p; }
    return urovenTed();
  }
  /** synchronous twin of urovenKnihovny for the result screen and Keep going (the difficulties are read by then) */
  const urovenTed = () => urovenHrace([...S.seznam.filter(p => !p.chyba), ...S.knihovna], vysHrace(), statHrace(), S.infoPisni || {});
  /**
   * the song to suggest next ({ soubor, nazev }): the first home song from For me that is not mastered; one not yet
   * started must also be within the player's level (a started one stays first whatever its difficulty), otherwise one from the library; nothing is added to home
   */
  function dalsiPisen(hratelne) {
    const vys = vysHrace(), stat = statHrace(), info = S.infoPisni || {}, uroven = urovenTed();
    const zacata = p => KROKY.some(k => (vys[p.soubor]?.[k]?.hvezdy || 0) > 0);
    const doma = proMe(hratelne, vys, stat, info).find(p => !umim(vys[p.soubor], stat, p.soubor)
      && (zacata(p) || (info[p.soubor]?.obtiznost?.stupen ?? S.knihovna.find(k => k.soubor === p.soubor)?.stupen ?? 1) <= uroven));
    if (doma) return doma;
    const k = dalsiZKnihovny(S.knihovna, uroven, vys, stat);
    return k ? { soubor: k.soubor, nazev: k.nazev } : null;
  }
  /** this player's home: own songs, plus library songs (the samples too) they played or starred (and did not remove since) */
  function domaciPisne() {
    const jmena = new Set(S.seznam.map(p => p.soubor));
    return [...S.seznam, ...S.knihovna.filter(p => !jmena.has(p.soubor) && naDomoveHrace(p.soubor))
      .map(p => ({ soubor: p.soubor, nazev: p.nazev, knihovna: true }))];
  }
  /** a library song is on the current player's home */
  const naDomoveHrace = soubor => naDomove({ soubor }, S.profil || 'host',
    { statistiky: S.statistiky, oblibene: S.oblibene, knihovnaSkryte: S.knihovnaSkryte });
  /** the title's translation for a library song in another language than the app's (shown under the title) */
  const prekladNazvu = soubor => {
    const p = S.knihovna.find(k => k.soubor === soubor);
    return (p && p.jazyk !== JAZYK && p.preklad?.[JAZYK]) || '';
  };
  /** when the player last played the song (ms) – from practice statistics */
  function naposledyHrano(soubor) {
    const st = S.statistiky?.[S.profil || 'host'] || {};
    let max = 0;
    for (const [k, v] of Object.entries(st)) if (k.startsWith(soubor + '#')) max = Math.max(max, v?.posledni || 0);
    return max;
  }
  const jeOblibena = soubor => (S.oblibene?.[S.profil || 'host'] || []).includes(soubor);
  /** the star in a tile's corner (favourite); a tile is a div with the button role so it can hold this button */
  const tlacitkoOblibene = () => `<button class="oblibena" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true">`
    + `<path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9z"/></svg></button>`;
  /** the star shows whether the song is this player's favourite */
  function nastavHvezdu(tl, soubor) {
    const ano = jeOblibena(soubor);
    tl.classList.toggle('ano', ano); tl.setAttribute('aria-pressed', String(ano));
    tl.setAttribute('aria-label', t(ano ? 'pred.neniOblibena' : 'pred.oblibena'));
  }
  function prepniOblibenou(soubor) {
    const pid = S.profil || 'host';
    const sez = new Set(S.oblibene[pid] || []);
    sez.has(soubor) ? sez.delete(soubor) : sez.add(soubor);
    S.oblibene[pid] = [...sez];
    data.pis('oblibene', S.oblibene);
    vykresliPisne();
  }
  const bezDiakritiky = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  /** difficulty as 1–3 black keys out of three (the rest outlined only) */
  const klavesyObtiznosti = n => `<svg viewBox="0 0 22 14" aria-hidden="true">${[0, 1, 2].map(i =>
    `<path d="M${1 + i * 7} 1h5v9.5a2.5 2.5 0 0 1-2.5 2.5a2.5 2.5 0 0 1-2.5-2.5z" ${i < n ? 'fill="currentColor"'
      : 'fill="none" stroke="currentColor" stroke-width="1.2" opacity=".45"'}/>`).join('')}</svg>`;
  /** the song appeared in the library for the first time (“new” label); on first launch all songs count as old */
  function prvniVyskyty() {
    const m = uloz.cti('kt-prvni-vyskyt', null) || {}, prazdna = !Object.keys(m).length;
    let zmena = false;
    for (const p of S.seznam) if (!(p.soubor in m)) { m[p.soubor] = prazdna ? 0 : Date.now(); zmena = true; }
    if (zmena) uloz.pis('kt-prvni-vyskyt', m);
    return m;
  }
  const vysHrace = () => S.vysledky[S.profil || 'host'] || {};
  const statHrace = () => S.statistiky?.[S.profil || 'host'] || {};
  /** player's home: Keep going, tabs (For me, difficulty, favourites), search and tiles with steps */
  function vykresliPisne() {
    const el = $('#pisne');
    if (!el) return;
    const vys = vysHrace(), stat = statHrace(), info = S.infoPisni || {};
    const hratelne = domaciPisne().filter(p => !p.chyba);
    const prvni = prvniVyskyty();
    // Keep going: the last played song; if the player knows it or has played nothing, the first from For me
    const poradi = proMe(hratelne, vys, stat, info);
    const posledni = [...hratelne].sort((a, b) => naposledyHrano(b.soubor) - naposledyHrano(a.soubor))[0];
    const hral = posledni && naposledyHrano(posledni.soubor) > 0;
    let pokr = hral && !umim(vys[posledni.soubor], stat, posledni.soubor) ? posledni : poradi[0];
    let zNovych = false;
    if (!pokr || umim(vys[pokr.soubor], stat, pokr.soubor)) { pokr = dalsiPisen(hratelne); zNovych = !!pokr; }
    $('#pokracuj').classList.toggle('skryta', !pokr);
    if (pokr) {
      S.pokracuj = pokr.soubor;
      $('#pokracujCo').textContent = t(hral && !zNovych ? 'domu.pokracuj' : 'domu.zacni');
      $('#pokracujNazev').textContent = pokr.nazev;
      const stav = stavKroku(vys[pokr.soubor]);
      $('#pokracujCesta').innerHTML = KROKY.map((k, i) => `<div class="${stav[i]}"><i></i><span>${esc(t('krok.' + k))}${
        stav[i] === 'ted' ? ` <b>${esc(t('domu.tedTy'))}</b>` : ''}</span></div>`).join('');
    }
    // tiles: one list of every song – own, samples and the library; tabs For me, Favourites, the shelves, Mine
    const vsechny = vsechnyPisne(), dotaz = $('#hledat').value.trim(), uroven = urovenTed();
    for (const b of $$('#zalozky button')) {
      const z = b.dataset.zalozka;
      b.classList.toggle('skryta', POLICE.includes(z) ? !vsechny.some(p => p.police === z) : z === 'moje' ? !vsechny.some(p => p.moje) : false);
    }
    if ($('#zalozky .ted')?.classList.contains('skryta')) $$('#zalozky button').forEach(x => x.classList.toggle('ted', x.dataset.zalozka === 'pro-me'));
    const zal = $('#zalozky .ted')?.dataset.zalozka || 'pro-me';
    const podleNazvu = (a, b) => a.nazev.localeCompare(b.nazev, 'cs');
    let vybrane;                                            // [{ p, tezsi }]
    if (dotaz) {
      const q = bezDiakritiky(dotaz), zKnihovny = new Set(hledej(S.knihovna, dotaz).map(p => p.soubor));
      vybrane = vsechny.filter(p => zKnihovny.has(p.soubor) || bezDiakritiky(p.nazev + ' ' + (info[p.soubor]?.autor || '')).includes(q)).map(p => ({ p }));
    } else if (zal === 'pro-me') {
      const doma = new Set(poradi.map(p => p.soubor));
      vybrane = [...poradi, ...navrhyZKnihovny(S.knihovna, uroven, vys, stat, 4).filter(p => !doma.has(p.soubor))]
        .map(p => ({ p: vsechny.find(x => x.soubor === p.soubor) || p }));
    } else if (zal === 'oblibene') vybrane = vsechny.filter(p => jeOblibena(p.soubor)).sort(podleNazvu).map(p => ({ p }));
    else if (zal === 'moje') vybrane = vsechny.filter(p => p.moje).sort(podleNazvu).map(p => ({ p }));
    else vybrane = seradPolici(vsechny.filter(p => p.police === zal), uroven).map(({ polozka, tezsi }) => ({ p: polozka, tezsi }));
    if (OBTIZNOST) vybrane = vybrane.filter(({ p }) => String(p.stupen || info[p.soubor]?.obtiznost?.stupen || '') === OBTIZNOST);
    $$('#obtiznost button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.obtiznost === OBTIZNOST)));
    el.innerHTML = '';
    if (!vsechny.length) { el.innerHTML = `<p class="napoveda">${esc(t('domu.nacitam'))}</p>`; return; }   // nothing yet: neither own songs nor the library
    for (const { p, tezsi } of vybrane) el.appendChild(dlazdicePisne(p, { tezsi, nova: jeNova(prvni[p.soubor], naposledyHrano(p.soubor) > 0) }));
    if (!vybrane.length) el.insertAdjacentHTML('beforeend', `<p class="napoveda prazdne">${esc(t('domu.nic'))}</p>`);
    if (!dotaz) {
      const v = document.createElement('button');
      v.className = 'dl dl-vymysli';
      v.innerHTML = `<b>${esc(t('domu.vymysli'))}</b><small>${esc(t('domu.vymysliPopis'))}</small>`;
      v.onclick = () => Doplnky.novaPisen();
      el.appendChild(v);
    }
  }
  let OBTIZNOST = '';                                     // '' = all, '1'–'3' = only that difficulty (any tab, the search too)
  $('#obtiznost').onclick = e => {
    const b = e.target.closest('[data-obtiznost]');
    if (!b) return;
    OBTIZNOST = b.dataset.obtiznost; vykresliPisne();
  };
  /** every song once: own songs (one that replaced a sample keeps the sample's shelf), then the library with the samples
   *  (its shelf, difficulty) */
  function vsechnyPisne() {
    const info = S.infoPisni || {}, vlastni = new Set(S.seznam.map(p => p.soubor));
    const stupen = soubor => info[soubor]?.obtiznost?.stupen || null;
    return [...S.seznam.filter(p => !p.chyba).map(p => ({ ...p, police: policeSouboru(p.soubor), moje: !policeSouboru(p.soubor), stupen: stupen(p.soubor) })),
      ...S.knihovna.filter(p => !vlastni.has(p.soubor)).map(p => ({ soubor: p.soubor, nazev: p.nazev, police: p.police, stupen: p.stupen, knihovna: true }))];
  }
  /** a song tile: title (and its translation for a library song in another language), author, difficulty, steps, star */
  function dlazdicePisne(p, { tezsi = false, nova = false } = {}) {
    const vys = vysHrace(), stat = statHrace(), info = S.infoPisni || {};
    const b = document.createElement('div'), stav = stavKroku(vys[p.soubor]);
    b.tabIndex = 0; b.setAttribute('role', 'button');                 // a div so it can hold its own star button
    b.className = 'dl' + (tezsi ? ' tezsi' : '');
    b.dataset.soubor = p.soubor;
    const st = p.stupen || info[p.soubor]?.obtiznost?.stupen;
    if (st) b.dataset.stupen = st;
    const umi = umim(vys[p.soubor], stat, p.soubor), preklad = jeKnihovni(p.soubor) ? prekladNazvu(p.soubor) : '';
    const nazevStupne = st ? t(['domu.snadne', 'domu.stredni', 'domu.tezsi'][st - 1]) : '';
    b.innerHTML = `<b>${esc(p.nazev)}${nova ? ` <span class="stitek-nova">${esc(t('domu.nova'))}</span>` : ''}${
      umi ? ` <span class="stitek-umim">${esc(t('domu.umim'))}</span>` : ''}</b>${preklad ? `<small class="preklad">${esc(preklad)}</small>` : ''}`
      + `<small>${esc(info[p.soubor]?.autor || '')}</small>`
      + `<span class="dl-spodek">${st ? `<span class="obtiznost" role="img" aria-label="${esc(nazevStupne)}">${klavesyObtiznosti(st)}</span>` : ''}`
      + `<span class="kroky3">${stav.map(x => `<i class="${x === 'hotovo' ? 'ano' : ''}"></i>`).join('')}</span></span>` + tlacitkoOblibene();
    nastavHvezdu(b.querySelector('.oblibena'), p.soubor);
    b.querySelector('.oblibena').onclick = e => { e.stopPropagation(); prepniOblibenou(p.soubor); };
    b.onclick = () => otevriPred(p.soubor);
    b.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === b) { e.preventDefault(); otevriPred(p.soubor); } };
    return b;
  }
  $('#hledat').oninput = () => vykresliPisne();
  $$('#zalozky button').forEach(b => b.onclick = () => {
    $$('#zalozky button').forEach(x => x.classList.toggle('ted', x === b));
    vykresliPisne();
  });
    $('#zmenitHrace').onclick = () => { jaMenu(false); vykresliKdo(); ukaz('kdo'); };

  /** in-app confirmation dialog instead of the system confirm (which some in-app browsers, e.g. Web MIDI Browser, do not show) */
  function potvrd(text, ano, preskocit) {
    return new Promise(hotovo => {
      $('#potvrzeniText').textContent = text; $('#potvrzeniAno').textContent = ano;
      const dalsi = $('#potvrzeniPreskocit');
      dalsi.textContent = preskocit || ''; dalsi.classList.toggle('skryta', !preskocit);
      const konec = v => { zavriDialog($('#potvrzeni')); hotovo(v); };
      $('#potvrzeniAno').onclick = () => konec(true);
      dalsi.onclick = () => konec(null);
      $('#potvrzeniNe').onclick = () => konec(false);
      otevriDialog($('#potvrzeni'), { fokus: $('#potvrzeniNe'), zavrit: () => konec(false) });
    });
  }
  /** the Players window: the week per player, the players with Edit and Delete, Change player when one is chosen */
  // ------------------------------------------------------------ Statistics (static/lib/stats.js): practising, improving, songs, stuck
  const STAT = { hrac: null, vse: false };
  const datum = t0 => new Date(t0).toLocaleDateString(JAZYK, { day: 'numeric', month: 'numeric' });
  function vykresliHrace() {
    const hraci = viditelni(S.profily);
    const naDomu = !$('#domu').classList.contains('skryta') && aktualniProfil();
    if (!hraci.some(p => p.id === STAT.hrac)) STAT.hrac = (naDomu ? aktualniProfil().id : hraci[0]?.id) || null;
    const p = hraci.find(x => x.id === STAT.hrac);
    $('#statZadny').classList.toggle('skryta', !!p);
    $$('#hraciOkno .okno-blok').forEach(b => b.classList.toggle('skryta', !p));
    $('#statHraci').innerHTML = hraci.map(q => `<button type="button" aria-pressed="${q.id === STAT.hrac}" data-hrac="${esc(q.id)}">${avatarSvg(prevedProfil(q, S.profily))}<span>${esc(q.jmeno)}</span></button>`).join('');
    if (!p) return;
    const pal = paleta(prevedProfil(p, S.profily).barva), k = $('#hraciOkno .karta');
    k.style.setProperty('--hl', pal.tmava); k.style.setProperty('--sv', pal.svetla); k.style.setProperty('--sv-2', pal.stredni);
    const stat = S.statistiky?.[p.id] || {}, vys = S.vysledky?.[p.id] || {}, pokusy = pokusyHrace(stat);
    const denik = S.denik?.[p.id] || {};
    statKalendar(pokusy, denik); statGraf(pokusy, denik); statPisne(stat, vys); statMista(stat);
  }
  function statKalendar(pokusy, denik) {
    const k = kalendar(pokusy, Date.now(), denik);
    $('#statTyden').textContent = t('stat.tyden', { dny: t('dni', { n: k.tyden.dny }), zahrani: t('stat.zahrani', { n: k.tyden.zahrani }) });
    const nazev = r => (r % 2 ? '' : new Date(k.tydny[0][r].t).toLocaleDateString(JAZYK, { weekday: 'short' }));
    let html = '';
    for (let r = 0; r < 7; r++) {
      html += `<span class="den">${esc(nazev(r))}</span>`;
      for (const tyden of k.tydny) {
        const d = tyden[r], popis = d.n ? t('stat.kalDen', { datum: datum(d.t), zahrani: t('stat.zahrani', { n: d.n }) }) : t('stat.kalNic', { datum: datum(d.t) });
        html += `<span class="c${d.budouci ? ' budouci' : ''}${d.dnes ? ' dnes' : ''}" data-n="${d.uroven}"${d.budouci ? '' : ` title="${esc(popis)}"`}></span>`;
      }
    }
    $('#statKalendar').innerHTML = html;
  }
  function statGraf(pokusy, denik) {
    const el = $('#statGraf'), body = presnostPoDnech(pokusy, Date.now(), 30, denik);
    if (body.length < 2) { el.innerHTML = `<p class="prazdne">${esc(t('stat.grafPrazdny'))}</p>`; return; }
    if (!el.clientWidth) requestAnimationFrame(() => { if (el.clientWidth) statGraf(pokusy, denik); });   // drawn at its real width once the window shows
    const dnes = new Date(); dnes.setHours(0, 0, 0, 0);
    const od = new Date(dnes.getFullYear(), dnes.getMonth(), dnes.getDate() - 29).getTime();
    const W = Math.max(280, el.clientWidth || 600), H = W < 500 ? 170 : 190, L = 44, R = 10, T = 12, B = 26, min = 0.5;
    const x = t0 => L + (t0 - od) / (29 * 864e5) * (W - L - R), y = v => T + (1 - (Math.max(min, v) - min) / (1 - min)) * (H - T - B);
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(t('stat.zlepsovaniPopis'))}">`;
    for (const v of [0.5, 0.75, 1]) s += `<line class="mrizka" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="osa" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v * 100} %</text>`;
    for (const d of [29, 14, 0]) {
      const t0 = dnes.getTime() - d * 864e5;
      s += `<text class="osa" x="${x(t0)}" y="${H - 6}" text-anchor="${d === 29 ? 'start' : d === 0 ? 'end' : 'middle'}">${esc(d === 0 ? t('stat.dnes') : datum(t0))}</text>`;
    }
    s += `<polyline class="cara" points="${body.map(b => `${x(b.t)},${y(b.v)}`).join(' ')}"/>`;
    s += body.map(b => `<circle class="bod" cx="${x(b.t)}" cy="${y(b.v)}" r="4.5"/>`).join('');
    s += `<line class="kriz skryta" y1="${T}" y2="${H - B}"/><rect class="plocha" x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent"/></svg><div class="tip skryta"></div>`;
    el.innerHTML = s;
    const svg = el.querySelector('svg'), kriz = svg.querySelector('.kriz'), tip = el.querySelector('.tip'), plocha = svg.querySelector('.plocha');
    plocha.addEventListener('pointermove', e => {
      const r = svg.getBoundingClientRect(), mx = (e.clientX - r.left) / r.width * W;
      const b = body.reduce((a, c) => (Math.abs(x(c.t) - mx) < Math.abs(x(a.t) - mx) ? c : a));
      kriz.setAttribute('x1', x(b.t)); kriz.setAttribute('x2', x(b.t)); kriz.classList.remove('skryta');
      tip.textContent = t('stat.den', { datum: datum(b.t), v: Math.round(b.v * 100), zahrani: t('stat.zahrani', { n: b.n }) });
      tip.style.left = x(b.t) / W * r.width + 'px'; tip.style.top = y(b.v) / H * r.height + 'px'; tip.classList.remove('skryta');
    });
    plocha.addEventListener('pointerleave', () => { kriz.classList.add('skryta'); tip.classList.add('skryta'); });
  }
  function statPisne(stat, vys) {
    const pisne = stavPisni(stat, vys), jmeno = s => pisenSouboru(s)?.nazev || s.replace(/\.(musicxml|xml|mxl)$/i, '');
    $('#statNauceno').textContent = pisne.length ? t('stat.nauceno', { n: pisne.filter(p => p.stav.druh === 'naucena').length, z: pisne.length }) : '';
    const stav = s => (s.druh === 'naucena' ? t('stat.naucena') : s.krok === 'tempo' && s.rychlost ? t('stat.cisteNa', { v: s.rychlost }) : t('stat.ted', { krok: t('krok.' + s.krok) }));
    const radky = pisne.map(p => `<div class="stat-pisen"><b>${esc(jmeno(p.soubor))}</b>
      <span class="kroky3" role="img" aria-label="${esc(KROKY.map((k, i) => `${t('krok.' + k)} ${p.hvezdy[i]}/3`).join(', '))}">${p.hvezdy.map(h => `<i><span style="width:${h / 3 * 100}%"></span></i>`).join('')}</span>
      <small>${esc(stav(p.stav))}</small></div>`);
    $('#statPisne').innerHTML = radky.length ? (STAT.vse ? radky : radky.slice(0, 6)).join('') : `<p class="prazdne">${esc(t('stat.pisnePrazdne'))}</p>`;
    $('#statVic').classList.toggle('skryta', radky.length <= 6);
    $('#statVic').textContent = STAT.vse ? t('stat.ukazatMene') : t('stat.ukazatVse', { n: radky.length });
  }
  let MISTA = [];
  function statMista(stat) {
    MISTA = mistaKdeDrhne(stat);
    const jmeno = s => pisenSouboru(s)?.nazev || s.replace(/\.(musicxml|xml|mxl)$/i, '');
    $('#statMista').innerHTML = MISTA.map((m, i) => `<div class="stat-misto"><div><b>${esc(jmeno(m.soubor))}, ${esc(m.od === m.do ? t('stat.takt', { n: m.od + 1 }) : t('stat.takty', { od: m.od + 1, do: m.do + 1 }))}</b>
      <small>${esc(t('stat.chyby', { n: Math.max(1, Math.round(m.podil * 10)) }))}</small></div><button type="button" class="tlacitko" data-misto="${i}">${esc(t('stat.procvicit'))}</button></div>`).join('')
      || `<p class="prazdne">${esc(t('stat.mistaPrazdne'))}</p>`;
  }
  $('#statHraci').onclick = e => { const b = e.target.closest('[data-hrac]'); if (b) { STAT.hrac = b.dataset.hrac; STAT.vse = false; vykresliHrace(); } };
  $('#statVic').onclick = () => { STAT.vse = !STAT.vse; vykresliHrace(); };
  // Practise: that song, the section in a loop, Find the notes, slowly (like the coach's task after a result)
  $('#statMista').onclick = async e => {
    const m = MISTA[e.target.closest('[data-misto]')?.dataset.misto];
    if (!m) return;
    zapniMikrofonPriHre();                               // the tap is the moment the browser lets the microphone start
    zavriOkno('players');
    if (!pisenSouboru(m.soubor)) { toast(t('stat.pisenNeni'), 5000); return; }
    if (STAT.hrac && STAT.hrac !== S.profil) zvolHrace(STAT.hrac);
    await otevriPred(m.soubor);
    if (!S.data || PRED.soubor !== m.soubor) return;
    Object.assign(PRED, { krok: 'cekam', rychlost: 60 });
    if (m.uroven && Number(S.uroven) !== m.uroven) { S.uroven = m.uroven; S.styl = ''; }   // the version the mistakes were made in
    if (S.data.osnovy.length > 1 || m.uroven >= 3) S.rukaVolba = 'vse';
    S.usek = { od: m.od, do: m.do };
    nabidkaUseku();
    S.smycka.zapnuto = true; S.smycka.cisteVRade = 0; $('#prepSmycka').classList.add('zap');
    await hrajZPred('cekam', true);
  };
  /** delete a player after a confirmation; their data are backed up first (last 5 deletions) */
  async function smazHraceSPotvrzenim(id) {
    const p = S.profily.find(x => x.id === id);
    if (!p || !(await potvrd(t('rodice.smazatHrace', { jmeno: p.jmeno }), t('rodice.smazatHraceAno', { jmeno: p.jmeno })))) return;
    const zal = (await data.cti('zaloha_pred_smazanim', [])) || [];
    zal.push({ kdy: Date.now(), profil: p, vysledky: S.vysledky[id] || {}, statistiky: S.statistiky?.[id] || {}, oblibene: S.oblibene?.[id] || [], denik: S.denik?.[id] || {},
      knihovnaSkryte: S.knihovnaSkryte?.[id] || {}, nastaveni: S.nastaveniHracu?.[id] || {} });
    data.pis('zaloha_pred_smazanim', zal.slice(-5));
    const byl = S.profil === id;
    const n = smazHrace({ profily: S.profily, profil: S.profil, vysledky: S.vysledky, statistiky: S.statistiky, oblibene: S.oblibene, denik: S.denik,
      knihovnaSkryte: S.knihovnaSkryte }, id, Date.now());
    Object.assign(S, n);
    uloz.pis('kt-nastaveni-' + id, null);
    if (S.nastaveniHracu?.[id]) { const { [id]: _, ...ostatni } = S.nastaveniHracu; S.nastaveniHracu = ostatni; data.pis('nastaveni', ostatni); }
    for (const k of ['profily', 'profil', 'vysledky', 'statistiky', 'oblibene', 'denik', 'knihovnaSkryte']) data.pis(k, S[k]);
    toast(t('rodice.smazanoHrac', { jmeno: p.jmeno }));
    vykresliKdo(); vykresliProfily(); vykresliPisne();
    if (byl) { UPRAVY_HRACU = false; uvodniObrazovka(); }   // another player: their settings, Who is playing? (or straight to the only player's home)
  }
  // ------------------------------------------------------------ helper (any chat AI): copy instructions, paste notes back
  // The app itself has no AI. The parent copies ready-made instructions (and, for a summary, the results) into a chat
  // and pastes the helper's text notation back; it becomes a song in the new-song editor (check, render, save).
  // odkud: the button pressed in the AI window; the fallback text box goes right under its task
  async function zkopiruj(text, odkud) {
    $('#pomocnikKopie').classList.add('skryta');
    try {                                                 // the clipboard may wait for permission forever → 1.5 s limit
      await Promise.race([navigator.clipboard.writeText(text), new Promise((_, ne) => setTimeout(() => ne(new Error('clipboard')), 1500))]);
      toast(t('pomocnik.zkopirovano'), 4000); return;
    } catch { /* WebView without clipboard */ }
    if (!otevreno('#aiOkno')) ai(true);                    // the fallback text box lives in the AI window
    const kde = odkud?.closest?.('.okno-blok');
    if (kde) kde.append($('#pomocnikKopie')); else $('#pomocnik').prepend($('#pomocnikKopie'));
    $('#pomocnikText').value = text;                      // fallback: text for manual copying
    $('#pomocnikKopie').classList.remove('skryta');
    $('#pomocnikKopie').scrollIntoView?.({ block: 'nearest' });
    $('#pomocnikText').select();
    try { if (document.execCommand('copy')) toast(t('pomocnik.zkopirovano'), 4000); } catch { /* the text stays selected */ }
  }
  /** text notation (pasted or from a .txt file) → errors in the paste window, or the new-song editor */
  function otevriZapis(text) {
    if (!String(text || '').trim()) { ukazChybyZapisu([t('pomocnik.vlozitPrazdne')]); return false; }
    const { pisen, polozky } = zTextu(vyberZapis(text));    // a whole chat answer: code block or header..last bar
    if (polozky.length) { ukazChybyZapisu(Cviceni.textChybZapisu(polozky)); return false; }
    zavriVlozit();
    const k = otevreneOkno();
    if (k) zavriOkno(k);
    editorNovePisne(pisen, { nejiste: nejisteTakty(pisen) });
    return true;
  }
  function ukazChybyZapisu(chyby) {
    otevriDialog($('#vlozitOkno'), { fokus: $('#vlozitText') });
    $('#vlozitChyby').innerHTML = `<p>${esc(t('pomocnik.vlozitChyby'))}</p><ul>${chyby.map(c => `<li>${esc(c)}</li>`).join('')}</ul>`;
    $('#vlozitChyby').classList.remove('skryta');
  }
  for (const l of $$('label.tlacitko[tabindex]')) l.onkeydown = e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); l.querySelector('input[type=file]')?.click(); }
  };
  $('#pomocnikPokyny').onclick = e => zkopiruj(pokyny('noty'), e.currentTarget);
  $('#pomocnikVysledky').onclick = e => zkopiruj(vysledkyText({ profily: S.profily, statistiky: S.statistiky, vysledky: S.vysledky, seznam: [...S.seznam, ...S.knihovna] }), e.currentTarget);
  $('#pomocnikUprava').onclick = () => { otevriOkno('songs'); $('#spravaHledat').focus(); };   // the easier version is per song
  const zavriVlozit = () => zavriDialog($('#vlozitOkno'));
  $('#pomocnikVlozit').onclick = $('#pisnickyVlozit').onclick = e => {
    $('#vlozitText').value = ''; $('#vlozitChyby').classList.add('skryta');
    otevriDialog($('#vlozitOkno'), { fokus: $('#vlozitText'), navrat: e.currentTarget });
  };
  $('#vlozitOtevrit').onclick = () => otevriZapis($('#vlozitText').value);
  $('#vlozitZrusit').onclick = zavriVlozit;

  $('#pisnickyVymysli').onclick = () => { zavriOkno('songs'); Doplnky.novaPisen(); };
  // every language select (Settings and the first screens) from one list, in the languages' own names
  for (const sel of $$('.jazyk-volba')) {
    sel.innerHTML = Object.entries(NAZVY_JAZYKU).map(([k, n]) => `<option value="${k}" lang="${k}">${esc(n)}</option>`).join('');
    sel.value = JAZYK;
  }
  $('#volbaSoustavy').value = soustava();
  $$('.jazyk-volba').forEach(sel => sel.onchange = async () => {
    const kod = sel.value;
    sel.disabled = true;
    try {
      await nactiSlovnik(kod);
      uloz.pis('kt-jazyk', kod); uloz.pis('kt-soustava', vychoziSoustava(kod)); location.reload();
    } catch {
      sel.value = JAZYK;
      toast(t('app.jazykChyba'), 5000);
    } finally { sel.disabled = false; }
  });
  $('#volbaSoustavy').onchange = e => { uloz.pis('kt-soustava', e.target.value); location.reload(); };
  $('#pokracujHrat').onclick = () => S.pokracuj && otevriPred(S.pokracuj);

  // ------------------------------------------------------------ Before playing
  const PRED = { soubor: null, krok: 'cekam', rychlost: 60 };
  const VYBER_PISNE = vytvorVyberPisne(pripravena => {
    for (const sel of ['#predHrat', '#predPoslech', '#predZmenit', '#oPisni']) $(sel).disabled = !pripravena;
  });
  const pripravenaPisen = () => S.data && S.pisen === PRED.soubor && VYBER_PISNE.pripravena(S.pisen);
  /** Before playing; odkud = the screen its back button returns to (home, or the Library the song was picked in) */
  async function otevriPred(soubor, odkud = 'domu') {
    stopVse(); konecPoslechu(); odemkniZvuk();
    PRED.odkud = odkud;
    const p = pisenSouboru(soubor);
    const d = doporuceni(vysHrace()[soubor], statHrace(), soubor);
    Object.assign(PRED, { soubor, krok: d.krok, rychlost: d.rychlost, doporuceny: d.krok });
    $('#predNazev').textContent = p?.nazev || soubor;
    $('#predAutor').textContent = S.infoPisni?.[soubor]?.autor || '';
    vykresliOblibenou();
    $('#predNoty').innerHTML = '';
    $('#vicPanel').classList.add('skryta'); $('#predZmenit').setAttribute('aria-expanded', 'false');
    $('#presnePole').classList.add('skryta'); $('#predPresne').setAttribute('aria-expanded', 'false');
    $('#predSouhrnText').textContent = '';
    vykresliPred();
    ukaz('pred');
    // the song loads right away (notes preview, More options); after Play the notes are rendered again in the visible game
    if (!await VYBER_PISNE.nacti(soubor, plati => otevriPisen(soubor, plati, odkud))) return;
    $('#predNoty').innerHTML = S.data.svg;
    vykresliOblibenou();
  }
  function vykresliOblibenou() {
    const o = jeOblibena(PRED.soubor);
    $('#predOblibena').setAttribute('aria-pressed', String(o));
    $('#predOblibena').setAttribute('aria-label', t(o ? 'pred.neniOblibena' : 'pred.oblibena'));
    $('#predOblibena').title = t(o ? 'pred.neniOblibena' : 'pred.oblibena');
  }
  $('#predOblibena').onclick = () => { prepniOblibenou(PRED.soubor); vykresliOblibenou(); };
  $('#predPresne').onclick = () => {
    const o = $('#presnePole').classList.toggle('skryta');
    $('#predPresne').setAttribute('aria-expanded', String(!o));
    if (!o) $('#rychlost').focus();
  };
  $('#predZmenit').onclick = () => {
    const o = $('#vicPanel').classList.toggle('skryta');
    $('#predZmenit').setAttribute('aria-expanded', String(!o));
    if (!o) $('#predCo [aria-pressed="true"]')?.focus();
  };
  /** game in the visible window: notes are rendered again (note positions cannot be measured on a hidden screen) */
  function zobrazHru() {
    ukaz('hra');
    $('#hraJak').textContent = '';
    vykresliVerziHry(VTK); nastavRuku(); listaDvojice();
  }
  function zacniPoslech() {
    const v = poslechCelePisne({ osnovy: S.puvodni?.takty.some(t => (t.leva || []).length) ? 2 : 1 });
    POSLECH = { doprovod: v.doprovod, zaloha: { uroven: S.uroven, tonina: S.tonina, prstoklad: S.prstoklad, styl: S.styl, usek: S.usek,
      rukaVolba: S.rukaVolba, rychlost: S.nastaveni.rychlost } };
    Object.assign(S, { uroven: v.uroven, tonina: v.tonina, prstoklad: v.prstoklad, styl: v.styl, usek: v.usek, rukaVolba: v.rukaVolba });
    S.nastaveni.rychlost = v.rychlost;
  }
  /** back to the player's own version and speed (before playing again or on Before playing) */
  function konecPoslechu() {
    if (!POSLECH) return;
    const { rychlost, ...z } = POSLECH.zaloha;
    POSLECH = null;
    Object.assign(S, z); S.nastaveni.rychlost = rychlost;
  }
  function hrajZPred(rezim) {
    if (!pripravenaPisen()) return;
    if (rezim !== 'poslech') zapniMikrofonPriHre();
    konecPoslechu();
    if (rezim === 'poslech' && !S.dvojice) zacniPoslech();
    zobrazHru();
    if (!POSLECH) nastavRychlost(PRED.rychlost);
    $(`[data-rezim="${rezim}"]`)?.click();
    const r = RYCHLOSTI.includes(PRED.rychlost) ? t('rychlost.' + PRED.rychlost).toLowerCase() : PRED.rychlost + ' %';
    $('#hraJak').textContent = rezim === 'poslech' ? t(POSLECH ? 'pred.poslechCela' : 'pred.poslech') : `${t('krok.' + rezim)}, ${r}`;
    if (!$('#start').classList.contains('skryta')) spust();
  }
  function vykresliPred() {
    const vys = vysHrace()[PRED.soubor] || {};
    const hv = n => [0, 1, 2].map(i => `<i class="${i < n ? 'ano' : ''}"></i>`).join('');
    $('#predKroky').innerHTML = KROKY.map((k, i) => `<button class="volba ${k === PRED.krok ? 'ted' : ''}" data-krok="${k}">
      <span class="c">${i + 1}</span><b>${esc(t('krok.' + k))}${k === PRED.doporuceny ? ` <span class="tip">${esc(t('pred.doporucuju'))}</span>` : ''}</b>
      <span class="popis">${esc(t('krok.popis.' + k))}</span><span class="hv">${hv(vys[k]?.hvezdy || 0)}</span></button>`).join('');
    $('#rychlost').value = PRED.rychlost; $('#rychlostText').textContent = rychlostText(PRED.rychlost);
    $('#predPresne').textContent = t('pred.presne', { v: PRED.rychlost });
    $('#predRychlost').innerHTML = RYCHLOSTI.map(r => `<button class="${r === PRED.rychlost ? 'ted' : ''}" data-rychlost="${r}">
      ${esc(t('rychlost.' + r))}<small>${r} %</small></button>`).join('');
  }
  $('#predKroky').onclick = e => { const b = e.target.closest('[data-krok]'); if (b) { PRED.krok = b.dataset.krok; vykresliPred(); } };
  $('#rychlost').addEventListener('input', e => { PRED.rychlost = Number(e.target.value); vykresliPred(); });
  $('#predRychlost').onclick = e => { const b = e.target.closest('[data-rychlost]'); if (b) { PRED.rychlost = Number(b.dataset.rychlost); vykresliPred(); } };
  $('#predZpet').onclick = () => {
    vykresliPisne(); ukaz('domu');
  };
  $('#predHrat').onclick = () => hrajZPred(PRED.krok);   // Find the notes has no start; the other steps begin with a count-in
  $('#predPoslech').onclick = () => hrajZPred('poslech');
  if (vyberBezFiltru(navigator)) $('#soubor').removeAttribute('accept');   // iOS would grey out .musicxml
  $('#soubor').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    zavriOkno('songs');
    if (/\.(mid|midi|kar)$/i.test(f.name)) {             // MIDI is converted by code (no AI)
      e.target.value = '';
      otevriMidi(f).catch(err => toast('MIDI: ' + chybaText(err), 6000));
      return;
    }
    if (/\.txt$/i.test(f.name)) {                        // text notation from the helper → errors or the new-song editor
      e.target.value = '';
      const text = await f.text();
      if (!otevriZapis(text)) $('#vlozitText').value = text;
      return;
    }
    if (/\.(pdf|png|jpe?g|webp|heic)$/i.test(f.name)) {  // the app does not convert sheet music from an image / PDF
      e.target.value = '';
      otevriDialog($('#zdrojeOkno'), { zavrit: () => $('#zdrojeZavrit').click() });
      toast(t('app.pdfNejde'), 6000);
      return;
    }
    toast(t('app.pridavam'));
    try {
      const d = await api.pridej(f);
      toast(t('app.pridano', { nazev: d.nazev })); nactiPisne();
    } catch (err) { toast(t('app.nepovedlo', { chyba: chybaText(err) }), 5000); }
    e.target.value = '';
  };

  // ------------------------------------------------------------ song preparation
  /** zpet = the screen to return to when the song cannot be loaded (home, or the Library it was picked in) */
  async function otevriPisen(soubor, plati, zpet) {
    $('#pas').innerHTML = `<div class="nacitam">${esc(t('app.nacitamNoty'))}</div>`;
    $('#klavesy').innerHTML = '';
    $('#hracAvatar').innerHTML = avatarSvg(aktualniProfil());
    $('#predCo').innerHTML = '';
    $('#predRuce').classList.add('skryta');
    try {
      const [xml, tk] = await Promise.all([api.xml(soubor), verovioTk()]);
      if (!plati()) return false;
      const pisen = zMusicXml(xml);
      S.puvodniXml = xml; S.puvodni = pisen;
      if (!S.puvodni.nazev) S.puvodni.nazev = soubor.replace(/\.[^.]+$/, '');
      S.pisen = soubor;
      const np = uloz.cti('kt-pisen-' + soubor, {});
      S.uroven = np.uroven || (S.puvodni.takty.some(t => (t.leva || []).length) ? 5 : 2);
      S.tonina = np.tonina || 'ne'; S.prstoklad = !!np.prstoklad; S.styl = stylPriOtevreni(S.uroven, np.styl || ''); S.usek = null;
      S.smycka = { zapnuto: false, cisteVRade: 0 };
      S.dvojice = null;
      vykresliVerziHry(tk);
    } catch (e) {
      if (plati()) { toast(t('app.notyChyba', { chyba: chybaText(e) }), 5000); S.data = null; ukaz(zpet); }
      return false;
    }
    $('#hraNazev').textContent = S.data.nazev;
    ovladaniPisne();
    nastavRuku();
    listaDvojice();
    return true;
  }
  /** choice of hand, level, key and sections for the current version of the song */
  function ovladaniPisne() {
    // the hand: carried from song to song; after a one-staff song (or the first one) by age – adults both hands
    if (S.data.osnovy.length > 1) { if (!['1', '2', 'vse'].includes(S.rukaVolba)) S.rukaVolba = aktualniProfil()?.vek === 'dospely' ? 'vse' : '1'; }
    else S.rukaVolba = null;
    vykresliVerzi();
    $('#tonina').value = S.tonina;
    $('#styl').value = S.styl || '';
    $('#prepPrstoklad').classList.toggle('zap', S.prstoklad);
    $('#prepSmycka').classList.toggle('zap', S.smycka.zapnuto);
    nabidkaUseku();
  }
  /** What will you play: the version cards (levels 1–5), the left-hand style, the hand choice and the summary line */
  function vykresliVerzi() {
    if (!S.puvodni || !S.data) return;
    const dve = S.data.osnovy.length > 1 && !S.dvojice;
    const zjednodusi = (S.tonina || 'ne') !== 'ne' || !!S.prstoklad;  // the Original only in its own key, without fingering
    $('#predCo').innerHTML = seznamUrovni(S.puvodni).map(u => `<button type="button" class="verze-karta" data-uroven="${u.id}" aria-pressed="${u.id === Number(S.uroven)}" ${u.dostupna ? '' : 'disabled'}>
      <b>${esc(u.nazev)}</b><small>${esc(u.popis)}${u.id === 5 && zjednodusi ? ' ' + esc(t('verze.zjednodusi')) : ''}</small></button>`).join('');
    const vsechny = S.data.osnovy.length < 2 || S.rukaVolba === 'vse';  // she has no written staff to play → backing from chords
    $('#vzorPole').classList.toggle('skryta', !!S.dvojice || !vsechny || !(S.data.akordy || []).length);
    $('#stylPole').classList.toggle('skryta', Number(S.uroven) !== 4 || !!S.dvojice);
    $('#predRuce').classList.toggle('skryta', !dve);
    for (const b of $$('#predRuce [data-ruka]')) b.setAttribute('aria-pressed', String(dve && b.dataset.ruka === S.rukaVolba));
    $('#predRuce small').classList.toggle('skryta', S.rukaVolba === 'vse');   // with both hands Rusalka plays no hand
    const s = souhrn({ uroven: S.uroven, ruka: S.rukaVolba, osnovy: S.data.osnovy.length, dvojice: !!S.dvojice });
    $('#predSouhrnText').innerHTML = `${esc(t('verze.hrajes'))} <b>${esc(t(s.verze))}</b>${s.ruka ? ', ' + esc(t(s.ruka)) : ''}${S.dvojice ? ', ' + esc(t('verze.veDvou')) : ''}`;
  }
  $('#predCo').onclick = async e => {
    const b = e.target.closest('[data-uroven]');
    if (!b || b.disabled) return;
    S.uroven = Number(b.dataset.uroven);
    if (S.uroven !== 4) S.styl = '';                   // the left-hand style belongs to Melody and chords only
    await zmenVerzi();
    if (S.data.osnovy.length > 1) S.rukaVolba = rukaPoKarte(S.uroven, S.data.osnovy.length);
    nastavRuku(); vykresliVerzi();
    $(`#predCo [data-uroven="${S.uroven}"]`)?.focus();
  };
  $('#predRuce').onclick = e => {
    const b = e.target.closest('[data-ruka]');
    if (!b) return;
    S.rukaVolba = b.dataset.ruka;
    nastavRuku(); vykresliVerzi();
  };
  function statistikaPisne() {
    return S.statistiky?.[S.profil || 'host']?.[S.pisen + '#' + S.uroven] || null;
  }
  function nabidkaUseku() {
    const fr = Cviceni.fraze(S.model);
    const tezka = statistikaPisne() ? Cviceni.tezkaMista(statistikaPisne(), S.model, 3) : [];
    const hvezdy = S.vysledky?.[S.profil || 'host']?.[S.pisen]?.useky || {};
    const opt = (od, dok, text) => {
      const h = hvezdy[`${od}-${dok}#${S.uroven}`] || 0;
      return `<option value="${od}-${dok}">${esc(text)}${h ? ' ' + '★'.repeat(h) + '☆'.repeat(3 - h) : ''}</option>`;
    };
    $('#usek').innerHTML = `<option value="">${esc(t('app.celaPisnicka'))}</option>`
      + (tezka.length ? `<optgroup label="${esc(t('app.tezkaMista'))}">${tezka.map(x => opt(x.od, x.do, x.nazev)).join('')}</optgroup>` : '')
      + `<optgroup label="${esc(t('app.useky'))}">${fr.map(f => opt(f.od, f.do, f.nazev)).join('')}</optgroup>`;
    $('#usek').value = S.usek ? `${S.usek.od}-${S.usek.do}` : '';
    if (S.usek && $('#usek').value === '') {                 // a section from a coach task that is not in the menu
      $('#usek').insertAdjacentHTML('beforeend', opt(S.usek.od, S.usek.do, Cviceni.nazevUseku(S.model, S.usek.od, S.usek.do)));
      $('#usek').value = `${S.usek.od}-${S.usek.do}`;
    }
  }
  function ulozNastaveniPisne() {
    uloz.pis('kt-pisen-' + S.pisen, { uroven: S.uroven, tonina: S.tonina, prstoklad: S.prstoklad, styl: S.styl || '' });
  }
  async function zmenVerzi() {
    stopVse(); ulozNastaveniPisne(); S.usek = null;
    try { await pripravVerzi(); } catch (e) { toast(t('app.verzeChyba', { chyba: e.message || e }), 5000); return; }
    ovladaniPisne(); nastavRuku();
  }
  $('#tonina').onchange = () => { S.tonina = $('#tonina').value; zmenVerzi(); };
  $('#prepPrstoklad').onclick = () => { S.prstoklad = !S.prstoklad; zmenVerzi(); };
  $('#usek').onchange = () => {
    const v = $('#usek').value;
    S.usek = v ? { od: Number(v.split('-')[0]), do: Number(v.split('-')[1]) } : null;
    S.smycka.cisteVRade = 0;
    nastavRuku();
  };
  $('#prepSmycka').onclick = () => {
    S.smycka.zapnuto = !S.smycka.zapnuto; S.smycka.cisteVRade = 0;
    $('#prepSmycka').classList.toggle('zap', S.smycka.zapnuto);
    toast(t(S.smycka.zapnuto ? 'app.smyckaZap' : 'app.smyckaVyp'));
  };
  /** builds the playable version from the original model (chosen level and transposition, unrolled repeats) and renders it */
  /** Original level in the original key with no custom fingering or backing style → the original file is rendered */
  const hrajOriginal = () => !S.dvojice && Number(S.uroven) === 5 && (S.tonina || 'ne') === 'ne' && !S.prstoklad && !S.styl && !!S.puvodniXml;
  async function pripravVerzi() { vykresliVerziHry(await verovioTk()); }
  function vykresliVerziHry(tk) {
    if (hrajOriginal()) {
      try {
        const r = rozvin(kopie(S.puvodni));
        const xml = bezCeskehoH(doplnTempo(doplnPosuvky(pripravOriginal(S.puvodniXml, r.poradi)), S.puvodni.tempo), soustava());
        S.data = zpracujVerovio(tk, xml, r.pisen, volbyVykresleni());
        S.model = r.pisen; S.poradi = r.poradi; S.original = true;
        nahledPred();
        return;
      } catch (e) { console.warn('originál nejde vykreslit, hraju zjednodušené noty', e); }
    }
    S.original = false;
    if (!S.dvojice && Number(S.uroven) === 5 && S.puvodniXml && ((S.tonina || 'ne') !== 'ne' || S.prstoklad || S.styl)) {
      toast(t('app.zjednoduseno'), 5000);
    }
    const r = vytvorHranouUroven(S.puvodni, S.uroven || 2,
      { transpozice: S.tonina || 'ne', prstoklad: !!S.prstoklad, vek: aktualniProfil()?.vek || 'dite' });
    S.model = S.dvojice ? modelProDvojici(r.pisen) : S.styl ? doprovodVeStylu(r.pisen, S.styl) : r.pisen;
    S.poradi = r.poradi;
    S.data = vykresliModel(tk, S.model);
    nahledPred();
  }
  /** Before playing shows the notes of the current version (it may change there: More options, Settings → Display) */
  function nahledPred() {
    if (!$('#pred').classList.contains('skryta') && S.data && S.pisen === PRED.soubor) $('#predNoty').innerHTML = S.data.svg;
  }
  function nastavRuku() {
    const v = S.dvojice || S.data.osnovy.length < 2 ? 'vse' : (S.rukaVolba || '1');
    S.ruka = new Set(v === 'vse' ? S.data.osnovy : [Number(v)]);
    S.hranice = S.dvojice ? hraniceDvojice(S.data.noty) : null;
    pripravKroky();
    if (!S.kroky.length && S.usek) {                       // the chosen hand plays nothing in the section → whole song
      toast(t('app.rukaNehraje'));
      S.usek = null; nabidkaUseku(); pripravKroky();
    }
    pripravNoty(); pripravKlavesy();
    spocitejPozice(); reset();
  }

  function qNaMs(q) {
    const m = S.data.mapa, doba = 60000 / S.data.tempo;
    if (!m.length) return q * doba;
    let i = 0;
    while (i < m.length - 1 && m[i + 1][0] <= q) i++;
    const [q0, t0] = m[i], dalsi = m[i + 1];
    if (!dalsi || dalsi[0] === q0) return t0 + (q - q0) * doba;
    return t0 + (q - q0) * (dalsi[1] - t0) / (dalsi[0] - q0);
  }
  function pripravKroky() {
    const vUseku = t => !S.usek || (t >= S.usek.od && t <= S.usek.do);
    const kroky = S.kroky = Cviceni.herniKroky(S.data.noty.filter(n => S.ruka.has(n.staff) && vUseku(n.takt)));
    const jine = S.data.noty.filter(n => !S.ruka.has(n.staff));
    S.doprovod = jine.length ? jine.map(n => ({ ms: n.ms, p: [n.pitch], dur: n.dur, sila: 0.45 })) : akordyNaUdalosti();
    S.doprovod.sort((a, b) => a.ms - b.ms);
    if (S.usek && kroky.length) {
      const od = Cviceni.zacatekHry(kroky, S.data.takty, qNaMs, S.usek.od), dok = Math.max(...kroky.map(k => k.konec));
      S.doprovod = Cviceni.doprovodUseku(S.doprovod, od, dok);
    }
  }
  /** a song without a written left hand: backing from chord symbols by time signature and tempo (lib/accompaniment.js) */
  function akordyNaUdalosti() {
    const konecQ = S.data.konecQ || Math.max(...S.data.noty.map(n => n.q)) + 1;
    return doprovodZAkordu({ akordy: S.data.akordy, takty: S.data.takty || [], konecQ, takt: S.model?.takt || '4/4',
      tempo: S.data.tempo, styl: S.nastaveni.vzorDoprovodu || 'auto', bezBasu: !!S.dvojice })
      .map(e => ({ ms: qNaMs(e.q), p: e.p, dur: Math.max(60, qNaMs(e.q + e.dq) - qNaMs(e.q) - 15), sila: e.sila }));
  }
  function pripravNoty() {
    const pas = $('#pas');
    pas.innerHTML = S.data.svg;
    $('#noty').classList.toggle('stranka', !!S.data.stranka);
    $('#noty').scrollTop = 0; S.radek = null;
    $('.kurzor').style.cssText = '';                    // the page cursor sets its own position
    const svg = pas.querySelector('svg');
    S.svg = svg;
    const vb = svg.viewBox.baseVal;
    S.vb = { w: vb.width, h: vb.height };
    svg.removeAttribute('width'); svg.removeAttribute('height');
    velikostNot();
    S.el = {};
    for (const n of S.data.noty) {
      const g = document.getElementById(n.id);
      if (!g) continue;
      const z = { g, ovl: null };
      S.el[n.id] = z;
      if (!S.ruka.has(n.staff)) { g.classList.add('cizi'); continue; }
      const hlava = g.querySelector('.notehead') || g;
      let bb;
      try { bb = hlava.getBBox(); } catch { continue; }
      const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2, r = Math.max(bb.width, bb.height) * 0.62;
      const pc = n.pitch % 12, barva = BARVY[pc];
      const o = document.createElementNS(SVGNS, 'g');
      o.setAttribute('class', 'ovl');
      o.setAttribute('data-nota', n.id);
      const halo = document.createElementNS(SVGNS, 'circle');
      halo.setAttribute('class', 'halo');
      Object.entries({ cx, cy, r: r * 2, fill: barva }).forEach(([k, v]) => halo.setAttribute(k, v));
      const kruh = document.createElementNS(SVGNS, 'circle');
      kruh.setAttribute('class', 'kruh');
      Object.entries({ cx, cy, r, fill: barva }).forEach(([k, v]) => kruh.setAttribute(k, v));
      const t = document.createElementNS(SVGNS, 'text');
      t.setAttribute('class', 'pismeno' + (TMAVE.has(pc) ? ' tmave' : ''));
      Object.entries({ x: cx, y: cy, dy: '0.36em', 'text-anchor': 'middle',
        'font-size': r * (n.jmeno.length > 3 ? 0.75 : n.jmeno.length > 2 ? 0.9 : n.jmeno.length > 1 ? 1.05 : 1.3) }).forEach(([k, v]) => t.setAttribute(k, v));
      t.textContent = n.jmeno;
      o.append(halo, kruh, t);
      g.parentNode.appendChild(o);
      z.ovl = o;
    }
  }
  function velikostNot() {
    if (!S.svg) return;
    if (S.data?.stranka) { S.svg.style.width = '100%'; S.svg.style.height = 'auto'; S.svg.style.marginTop = ''; return; }
    // without the keyboard the line of notes would stretch to a huge size – limit the height and centre the line
    const vyskaBoxu = $('#noty').clientHeight;
    const h = klavesyVidet() ? vyskaBoxu : Math.min(vyskaBoxu, 420);
    S.svg.style.marginTop = Math.max(0, (vyskaBoxu - h) / 2) + 'px';
    S.svg.style.height = h + 'px';
    S.svg.style.width = (h * S.vb.w / S.vb.h) + 'px';
  }
  function spocitejPozice() {
    const box = $('#pas').getBoundingClientRect();
    const systemy = S.svg ? [...S.svg.querySelectorAll('g.system')] : [];
    for (const k of S.kroky) {
      const g = S.el[k.noty[0].id]?.g;
      const r = g?.querySelector('.notehead')?.getBoundingClientRect() || g?.getBoundingClientRect();
      k.x = r ? r.left + r.width / 2 - box.left : 0;
      // for a whole page also the line (system) holding the note, and its vertical position
      const sys = g?.closest('g.system');
      k.radek = sys ? systemy.indexOf(sys) : 0;
      const rs = sys?.getBoundingClientRect();
      k.yRadku = rs ? rs.top - box.top : 0; k.vyskaRadku = rs ? rs.height : 0;
    }
  }
  /** scroll to a step: sideways for a line, down to its line for a page (only when the line changes) */
  function posunKrok(i, hned) {
    const k = S.kroky[i];
    if (!k) return;
    if (!S.data?.stranka) { posunNa(k.x, hned); return; }
    if (S.radek === k.radek) return;
    S.radek = k.radek;
    $('#noty').scrollTo({ top: Math.max(0, k.yRadku - 16), behavior: hned ? 'auto' : 'smooth' });
  }
  /** time cursor on a whole page: smooth between two steps on the same line, otherwise at the last step */
  function kurzorStranky(t) {
    const K = S.kroky;
    xVCase(t);
    const a = K[H.xi], b = K[H.xi + 1];
    if (!a) return;
    const x = b && b.radek === a.radek && b.ms > a.ms ? a.x + (b.x - a.x) * Math.min(1, Math.max(0, (t - a.ms) / (b.ms - a.ms))) : a.x;
    const kz = $('.kurzor');
    kz.style.left = x + 'px'; kz.style.top = (a.yRadku - 4) + 'px'; kz.style.height = (a.vyskaRadku + 8) + 'px';
    posunKrok(H.xi, false);
  }
  function pripravKlavesy() {
    const el = $('#klavesy'); el.innerHTML = ''; S.klavesy = {};
    const vys = S.kroky.flatMap(k => [...k.vyska]);
    if (!vys.length) vys.push(60, 72);                     // no notes (empty section): at least an octave from middle C
    const cerna = p => CERNE.has(((p % 12) + 12) % 12);
    let lo = Math.min(...vys) - 2, hi = Math.max(...vys) + 2;
    while (cerna(lo)) lo--;
    while (cerna(hi)) hi++;
    const bile = () => { let c = 0; for (let p = lo; p <= hi; p++) if (!cerna(p)) c++; return c; };
    for (let s = 0; bile() < 15; s++) {
      if (s % 2) { lo--; while (cerna(lo)) lo--; } else { hi++; while (cerna(hi)) hi++; }
    }
    const jmena = {};
    S.data.noty.forEach(n => { if (!(n.pitch in jmena)) jmena[n.pitch] = n.jmeno; });
    const pouzite = new Set(vys);
    const w = 100 / bile();
    let i = 0;
    for (let p = lo; p <= hi; p++) {
      const pc = p % 12, je_cerna = CERNE.has(pc);
      const k = document.createElement('div');
      k.className = 'klavesa ' + (je_cerna ? 'cerna' : 'bila') + (pouzite.has(p) ? '' : ' nepouzita');
      k.dataset.p = p;
      k.style.setProperty('--barva', BARVY[pc]);
      k.style.setProperty('--svetla', svetla(BARVY[pc], 0.32));
      if (je_cerna) { k.style.left = `${i * w - w * 0.3}%`; k.style.width = `${w * 0.6}%`; }
      else { k.style.left = `${i * w}%`; k.style.width = `${w}%`; i++; }
      if (!je_cerna || pouzite.has(p)) {
        const j = document.createElement('span');
        j.className = 'jm' + (TMAVE.has(pc) ? ' tmave' : '');
        j.textContent = jmena[p] || jmenaKlaves()[pc];
        k.appendChild(j);
      }
      if (p === 60) { const s = document.createElement('span'); s.className = 'stred'; s.title = t('app.prostredniC'); k.appendChild(s); }
      const pust = () => vstupOff(p, 'dotyk');
      k.addEventListener('pointerdown', e => {
        e.preventDefault();
        try { k.setPointerCapture(e.pointerId); } catch { /* */ }
        vstupOn(p, 90, 'dotyk');
      });
      k.addEventListener('pointerup', pust);
      k.addEventListener('pointercancel', pust);
      k.addEventListener('lostpointercapture', pust);
      el.appendChild(k);
      S.klavesy[p] = k;
    }
  }

  // ------------------------------------------------------------ display during the game
  function nastavStav(id, stav) {
    const z = S.el[id];
    if (!z) return;
    for (const e of [z.g, z.ovl]) {
      if (!e) continue;
      e.classList.remove('aktivni', 'ok', 'vedle', 'minul');
      if (stav) e.classList.add(stav);
    }
  }
  function nastavStavNoty(n, stav) {
    nastavStav(n.id, stav);
    n.souzvuk?.forEach(x => nastavStav(x.id, stav));
  }
  const patriKNote = (n, id) => n.id === id || n.souzvuk?.some(x => x.id === id);
  function oznacCil(vysky) {
    Object.values(S.klavesy).forEach(k => k.classList.remove('cil', 'hrac-b'));
    if (vysky) for (const p of vysky) S.klavesy[p]?.classList.add('cil', ...(S.dvojice && p < S.hranice ? ['hrac-b'] : []));
  }
  function blikni(p, cls) {
    const k = S.klavesy[p];
    if (!k) return;
    k.classList.remove(cls); void k.offsetWidth; k.classList.add(cls);
    H.timery.pridej(() => k.classList.remove(cls), 400);
  }
  function posunNa(x, hned) {
    const pas = $('#pas');
    pas.style.transition = hned ? 'none' : 'transform .35s ease';
    pas.style.transform = `translateX(${$('#noty').clientWidth * 0.3 - x}px)`;
  }
  function hlaska(html) {
    if (H.hlaska === html) return;
    H.hlaska = html; $('#hlaska').innerHTML = html;
  }
  const jmenoHtml = n => `<b style="color:${S.nastaveni.barvy ? BARVY_TEXT[n.pitch % 12] : 'var(--modra)'}">${esc(n.jmeno)}</b>`;
  function radost() {
    const a = $('#hracAvatar');
    a.classList.remove('hop'); void a.offsetWidth; a.classList.add('hop');
  }
  function prubeh(podil) { $('#prubeh').style.width = Math.max(0, Math.min(100, podil * 100)) + '%'; }

  function stopVse({ pozastavit = false } = {}) {
    const kalibroval = !!H.kalibrace;
    H.bezi = false; H.spousti = false; H.kalibrace = null;
    cancelAnimationFrame(H.raf);
    if (pozastavit && !kalibroval) H.timery.pozastav(); else H.timery.zrus();
    MERENI_DRZENI.zrusPokus();
    if (kalibroval) hlaska(esc(t('app.hlaska.' + S.rezim)));
    odpocet(0);
    Object.values(S.klavesy).forEach(k => k.classList.remove('stisk', 'dobre', 'spatne'));
    const ted = AC?.currentTime ?? 0;
    for (const v of zive.values()) v.pust(ted);
    zive.clear();
    [...NAPLANOVANE].filter(v => v.naplanovany).forEach(v => v.zrus());
    tichoVKlaviru();
    VLASTNI_TONY = VLASTNI_TONY.filter(v => v.od <= ted).map(v => ({ ...v, do: Math.min(v.do, ted) }));   // cancelled notes will not sound
  }
  function reset() {
    stopVse();
    H = novyStav();
    for (const id in S.el) nastavStav(id, '');
    zavriPrehled();
    zavriDialog($('#vysledek'));
    $('#odpocet').classList.add('skryta');
    $('.kurzor').classList.toggle('skryta', S.rezim === 'cekam');
    $('#kalibrace').classList.toggle('skryta', S.rezim !== 'tempo');
    $('#hlaska').innerHTML = '';
    prubeh(0);
    if (!S.kroky.length) { $('#start').classList.add('skryta'); return; }
    if (S.rezim === 'cekam') {
      $('#start').classList.add('skryta');
      oznacKrok(0);
    } else {
      $('#start').classList.remove('skryta');
      $('#start').textContent = '▶ ' + t('app.start.' + S.rezim);
      oznacCil(null);
      posunKrok(0, true);
      hlaska(esc(t('app.hlaska.' + S.rezim)));
    }
  }

  // ------------------------------------------------------------ “Find the notes” mode (waits for the right key)
  function oznacKrok(i) {
    const k = S.kroky[i];
    if (!k) return;
    k.noty.forEach(n => nastavStavNoty(n, 'aktivni'));
    oznacCil(k.vyska);
    posunKrok(i, false);
    hlaska(esc(t('app.zahraj')) + ' ' + k.noty.map(jmenoHtml).join(' + '));
  }
  /** duet: the part a key belongs to by the keyboard boundary (1 melody, 2 bass, as in lib/pair.js); null alone */
  const castKlavesy = p => (S.dvojice ? (p >= S.hranice ? 1 : 2) : null);
  /**
   * The note a wrong key belongs to: nearest pitch among the notes of step i. In a duet only the notes of the part
   * whose side of the keyboard was pressed – if the step has none, that part's latest note before it (or the next one).
   */
  function notaChyby(i, p) {
    const k = S.kroky[i], st = castKlavesy(p);
    if (st == null) return notaProChybu(k.noty, p);
    const jeho = j => S.kroky[j].noty.flatMap(n => [n, ...(n.souzvuk || [])]).filter(n => n.staff === st);
    for (let j = i; j >= 0; j--) if (jeho(j).length) return notaProChybu(jeho(j), p);
    for (let j = i + 1; j < S.kroky.length; j++) if (jeho(j).length) return notaProChybu(jeho(j), p);
    return null;
  }
  function zaznamChyby(p, ms, index) {
    const k = S.kroky[index], n = notaChyby(index, p);
    H.chyby++; H.rada = 0;
    H.chybneStisky.push({ pitch: p, ms: Math.round(ms), takt: n?.takt ?? k.noty[0].takt, index, nota: n?.id });
    if (n && S.rezim !== 'tempo') {
      const cil = k.noty.find(x => patriKNote(x, n.id));
      if (cil) {
        H.chybneNoty.add(cil.id);
        if (H.zaznam.has(cil.id)) nastavStavNoty(cil, 'vedle');
      }
    }
  }
  function zaznamNoty(n, index, zahranoMs) {
    return { takt: n.takt, index, pitch: n.pitch, ocekavanoMs: n.ms, zahranoMs, dynamika: n.dyn || null,
      vysledek: 'ok', odchylkaMs: S.rezim === 'tempo' ? Math.round(zahranoMs - n.ms) : null,
      drzenoMs: null, ocekavanaDelkaMs: n.dur, sila: H.posledniSila };
  }
  function onCekam(p) {
    const k = S.kroky[H.idx];
    if (!k) return;
    if (k.vyska.has(p)) {
      if (H.stisk.has(p)) return;
      H.stisk.add(p);
      const n = k.noty.find(n => n.pitch === p);
      nastavStavNoty(n, H.chybneNoty.has(n.id) ? 'vedle' : 'ok');
      H.zaznam.set(n.id, zaznamNoty(n, H.idx, null));
      if (H.stisk.size < k.vyska.size) return;
      H.trefy++; H.rada++;
      radost();
      if (H.rada > 0 && H.rada % 10 === 0) toast(t('app.radaBezChyby', { n: H.rada }));
      zahrajDoprovodKroku(H.idx);
      H.stisk.clear(); H.idx++;
      prubeh(H.idx / S.kroky.length);
      if (H.idx >= S.kroky.length) { oznacCil(null); H.timery.pridej(konec, 1200); }
      else oznacKrok(H.idx);
    } else {
      zaznamChyby(p, k.ms, H.idx);
      blikni(p, 'spatne');
      if (k.noty.some(n => n.pitch % 12 === p % 12)) toast(t('app.jinaOktava'));
    }
  }
  function zahrajDoprovodKroku(i) {
    if (!doprovodZapnuty(S.vstup)) return;
    const k = S.kroky[i], dalsi = S.kroky[i + 1];
    const ted = audio().currentTime + 0.01, sp = S.nastaveni.rychlost / 100;
    const od = i === 0 ? -Infinity : k.ms - 1, dok = dalsi ? dalsi.ms - 1 : Infinity;
    for (const e of S.doprovod) {
      if (e.ms < od || e.ms >= dok) continue;
      const kdy = ted + Math.max(0, e.ms - k.ms) / 1000 / sp;
      e.p.forEach(p => hlas(p, kdy, e.dur / 1000 / sp, e.sila));
    }
  }

  // ------------------------------------------------------------ “In rhythm” and “Listen” modes
  $('#start').onclick = () => spust();
  async function spust() {
    if (!otevreno('#hra') || hraPozastavena() || document.hidden || H.bezi || H.spousti || !S.kroky.length) return;
    reset();
    const stav = H;
    H.spousti = true;
    $('#start').classList.add('skryta');
    let ac;
    try { ac = await zvukPripraven(); } catch (e) {
      if (H === stav && H.spousti) reset();
      console.warn('AudioContext', e);
      return;
    }
    if (H !== stav || !H.spousti) return;
    H.spousti = false;
    const sp = S.nastaveni.rychlost / 100;
    // count-in by time signature: x/4 in quarters, compound x/8 in dotted quarters; starts from the beginning of the bar
    const met = metrum(S.model.takt);
    const dobaQ = met.beatType === 8 && met.beats % 3 === 0 ? 1.5 : 4 / met.beatType;
    const doba = dobaQ * 60 / (S.data.tempo * sp);
    const takt0 = S.usek?.od ?? S.kroky[0].noty[0].takt;
    const zacatekQ = S.data.takty[takt0] ?? S.kroky[0].q;
    const prvni = Cviceni.zacatekHry(S.kroky, S.data.takty, qNaMs, takt0);
    const delkaTaktu = (S.data.takty[takt0 + 1] ?? S.data.konecQ) - zacatekQ;
    const chybi = takt0 === 0 && delkaTaktu < met.delka - 1e-6 ? Math.round((met.delka - delkaTaktu) / dobaQ) : 0;   // pickup bar
    const naTakt = Math.max(1, Math.round(met.delka / dobaQ));
    const kliku = naTakt * Math.ceil(3 / naTakt) + chybi;          // at least 3 beats (3/8 → three bars of one beat)
    const t0 = ac.currentTime + 0.3;
    Object.assign(H, { start: t0 + kliku * doba, prvni, sp, konec: Math.max(...S.kroky.map(k => k.konec)),
      celkem: S.kroky.reduce((a, k) => a + k.noty.length, 0) });
    for (let i = 0; i < kliku; i++) {
      klik(t0 + i * doba, i % naTakt === 0);
      H.timery.pridej(() => odpocet(kliku - i), (t0 + i * doba - ac.currentTime) * 1000);
    }
    H.timery.pridej(() => odpocet(0), (H.start - ac.currentTime) * 1000);
    if (S.nastaveni.metronom && S.rezim !== 'pockej') H.metronom = { doba, naTakt, dalsi: 0 };
    if (POSLECH ? POSLECH.doprovod : doprovodZapnuty(S.vstup)) {
      H.doprovodPlan = Cviceni.vytvorPlanZvuku(S.doprovod.filter(e => e.ms >= prvni - 1 && e.ms < H.konec));
    }
    if (S.rezim === 'poslech') H.poslechPlan = Cviceni.vytvorPlanZvuku(S.kroky.flatMap(k => k.noty));
    H.bezi = true;
    H.raf = requestAnimationFrame(smycka);
  }
  function odpocet(n) {
    const el = $('#odpocet');
    el.textContent = n; el.classList.toggle('skryta', !n);
  }
  // song time in ms; in “With backing” it stops until the player plays the awaited note
  const cas = () => (H.zastaveno != null ? H.zastaveno : H.prvni + (AC.currentTime - H.start) * 1000 * H.sp - (H.pauza || 0));
  const casProZasah = tc => S.rezim === 'tempo' ? tc - (S.nastaveni.kalibrace || 0) * H.sp : tc;
  function naplanujZvuk(tc) {
    const ceka = S.rezim === 'pockej', ted = AC.currentTime, mer = 1000 * H.sp;
    const dopredu = ceka ? Math.min(tc + 120 * H.sp, S.kroky[H.kontrola]?.ms ?? H.konec) : tc + 2500 * H.sp;
    const kdy = ms => Math.max(ted, H.start + (ms - H.prvni + (H.pauza || 0)) / mer);
    H.doprovodPlan?.(dopredu, e => e.p.forEach(p => hlas(p, kdy(e.ms), e.dur / mer, e.sila)));
    H.poslechPlan?.(dopredu, n => hlas(n.pitch, kdy(n.ms), n.dur / mer * 0.95, 0.8));
    const m = H.metronom;
    if (m) {
      const doby = Math.ceil((H.konec - H.prvni) / mer / m.doba) + 1;
      while (m.dalsi < doby && H.start + m.dalsi * m.doba <= ted + 2.5) {
        klik(H.start + m.dalsi * m.doba, m.dalsi % m.naTakt === 0, 0.12);
        m.dalsi++;
      }
    }
  }
  function xVCase(t) {
    const K = S.kroky, posl = K[K.length - 1];
    const pxms = K.length > 1 && posl.ms > K[0].ms ? (posl.x - K[0].x) / (posl.ms - K[0].ms) : 0.2;
    if (t <= K[0].ms) return K[0].x - (K[0].ms - t) * pxms;
    while (H.xi + 1 < K.length && K[H.xi + 1].ms <= t) H.xi++;
    const a = K[H.xi], b = K[H.xi + 1];
    if (!b) return a.x + (t - a.ms) * pxms;
    return a.x + (b.x - a.x) * (t - a.ms) / (b.ms - a.ms);
  }
  function smycka() {
    if (!H.bezi) return;
    const tc = cas(), W = OKNO * H.sp, K = S.kroky;
    naplanujZvuk(tc);
    if (S.data.stranka) kurzorStranky(tc); else posunNa(xVCase(tc), true);
    if (S.rezim === 'pockej') {
      const a = H.kontrola;
      if (H.zastaveno == null && K[a] && tc >= K[a].ms) {
        H.zastaveno = K[a].ms; H.zastavenoOd = AC.currentTime - (tc - K[a].ms) / (1000 * H.sp);
      }
      if (a !== H.aktivni) {
        H.aktivni = a;
        const k = K[a];
        if (k) { k.noty.forEach(n => { if (!H.hotovo.has(n.id)) nastavStavNoty(n, 'aktivni'); }); oznacCil(new Set(k.noty.filter(n => !H.hotovo.has(n.id)).map(n => n.pitch))); }
        else oznacCil(null);
      }
      hlaska(H.zastaveno != null && K[a] ? esc(t('app.cekamNa')) + ' ' + K[a].noty.filter(n => !H.hotovo.has(n.id)).map(jmenoHtml).join(' + ') : t('app.zahranoZ', { a: `<b>${H.trefy}</b>`, b: H.celkem }));
    } else if (S.rezim === 'tempo') {
      const tZasahu = casProZasah(tc);
      while (H.kontrola < K.length && K[H.kontrola].ms + W < tZasahu) {
        for (const n of K[H.kontrola].noty) {
          if (!H.hotovo.has(n.id)) { nastavStavNoty(n, 'minul'); H.rada = 0; }
        }
        H.kontrola++;
      }
      let a = H.kontrola;
      while (a < K.length && K[a].noty.every(n => H.hotovo.has(n.id))) a++;
      if (a !== H.aktivni) {
        H.aktivni = a;
        const k = K[a];
        if (k) { k.noty.forEach(n => { if (!H.hotovo.has(n.id)) nastavStavNoty(n, 'aktivni'); }); oznacCil(new Set(k.noty.filter(n => !H.hotovo.has(n.id)).map(n => n.pitch))); }
        else oznacCil(null);
      }
      hlaska(t('app.vcasZ', { a: `<b>${H.trefy}</b>`, b: H.celkem }));
    } else {
      let i = H.aktivni;
      while (i + 1 < K.length && K[i + 1].ms <= tc) i++;
      if (i !== H.aktivni) {
        if (H.aktivni >= 0) K[H.aktivni].noty.forEach(n => nastavStavNoty(n, 'ok'));
        H.aktivni = i;
        K[i].noty.forEach(n => nastavStavNoty(n, 'aktivni'));
        oznacCil(K[i].vyska);
        hlaska(K[i].noty.map(jmenoHtml).join(' + '));
      } else if (i >= 0 && tc > K[i].konec - 30 * H.sp) oznacCil(null);
    }
    prubeh((tc - H.prvni) / (H.konec - H.prvni));
    if (tc > H.konec + 700 * H.sp && (S.rezim !== 'pockej' || H.kontrola === K.length)) { konec(); return; }
    H.raf = requestAnimationFrame(smycka);
  }
  function onTempo(p, kanal) {
    const tc = casProZasah(cas()), okno = OKNO * H.sp, pockej = S.rezim === 'pockej';
    if (tc < H.prvni - okno) return;
    const zasah = Cviceni.najdiZasah(S.kroky, { pitch: p, cas: tc, okno, hotovo: H.hotovo, od: H.kontrola, pockej });
    if (zasah) {
      const { nota: n, index } = zasah, z = zaznamNoty(n, index, Math.round(tc));
      H.zaznam.set(n.id, z);
      if (kanal !== 'mikrofon') MERENI_DRZENI.stisk(kanal, p, z, AC.currentTime, H.sp);
      H.hotovo.add(n.id); H.trefy++; H.rada++;
      if (pockej && S.kroky[index].noty.every(x => H.hotovo.has(x.id))) {
        H.kontrola++;
        if (H.zastaveno != null) {
          H.pauza = (H.pauza || 0) + (AC.currentTime - H.zastavenoOd) * 1000 * H.sp;
          H.zastaveno = null;
        }
      }
      nastavStavNoty(n, H.chybneNoty.has(n.id) ? 'vedle' : 'ok'); blikni(p, 'dobre'); radost();
      if (H.rada % 10 === 0) toast(t('app.rada', { n: H.rada }));
      return;
    }
    // In a duet a wrong key belongs to the step the erring part waits for.
    let bi = pockej && H.kontrola < S.kroky.length ? H.kontrola : -1;
    if (bi >= 0 && S.dvojice) {
      const st = castKlavesy(p);
      const i = S.kroky.findIndex((k, i) => i >= bi && k.noty.some(n => !H.hotovo.has(n.id)
        && (n.staff === st || n.souzvuk?.some(x => x.staff === st))));
      if (i >= 0) bi = i;
    }
    if (bi < 0) bi = S.kroky.reduce((b, k, i) => Math.abs(k.ms - tc) < Math.abs(S.kroky[b].ms - tc) ? i : b, 0);
    zaznamChyby(p, tc, bi); blikni(p, 'spatne');
  }

  // ------------------------------------------------------------ latency calibration (for In rhythm mode)
  $('#kalibrace').onclick = async () => {
    if (document.hidden || S.rezim !== 'tempo' || !otevreno('#hra') || otevreno('#vysledek') || H.kalibrace) return;
    // Calibration starts from Pause → Display. The player needs to see the instructions and reach the keys.
    prekryv('#zobrazeni', false); prekryv('#pauzaPrekryv', false);
    reset();
    const k = H.kalibrace = { kliky: [], stisky: [] };
    let ac;
    try { ac = await zvukPripraven(); } catch (e) {
      if (H.kalibrace === k) stopVse();
      console.warn('AudioContext', e);
      return;
    }
    if (H.kalibrace !== k) return;
    const doba = 60 / 90, t0 = ac.currentTime + 0.4;
    hlaska(esc(t('app.kalibrace')));
    for (let i = 0; i < 12; i++) { klik(t0 + i * doba, i % 4 === 0); if (i >= 4) k.kliky.push(t0 + i * doba); }
    H.timery.pridej(() => {
      H.kalibrace = null;
      const odch = k.kliky.map(kdy => {
        const s = k.stisky.reduce((b, x) => Math.abs(x - kdy) < Math.abs(b - kdy) ? x : b, Infinity);
        return Math.abs(s - kdy) < doba / 2 ? (s - kdy) * 1000 : null;
      }).filter(x => x != null).sort((a, b) => a - b);
      if (odch.length < 5) { hlaska(esc(t('app.kalibraceChyba'))); return; }
      const median = Math.round(odch[Math.floor(odch.length / 2)]);
      S.nastaveni.kalibrace = Math.max(-150, Math.min(400, median));
      ulozNastaveni();
      hlaska(esc(t('app.kalibraceHotova', { ms: S.nastaveni.kalibrace })));
    }, (t0 + 12 * doba - ac.currentTime + 0.6) * 1000);
  };

  // ------------------------------------------------------------ as a pair: melody (staff 1) and bass (staff 2), one child each
  const profilPodleId = id => S.profily.find(p => p.id === id) || null;
  const BARVY_HRACE = { lenochod: ['#2E5C4F', '#DCE8E1'], kralik: ['#8F421A', '#F5E0D1'], '': ['#1F4C78', '#CFE2F2'] };
  /** player colours (by animal); same colours → the bass gets a different one */
  function barvyDvojice() {
    $('#klavesy').classList.toggle('dvojice', !!S.dvojice);
    if (!S.dvojice) return;
    const a = profilPodleId(S.dvojice.melodie)?.zvire || '', b = profilPodleId(S.dvojice.bas)?.zvire || '';
    const [ab, as] = BARVY_HRACE[a] || BARVY_HRACE[''];
    let [bb, bs] = BARVY_HRACE[b] || BARVY_HRACE[''];
    if (bb === ab) [bb, bs] = a === 'kralik' ? BARVY_HRACE.lenochod : BARVY_HRACE.kralik;
    const st = document.documentElement.style;
    st.setProperty('--a-barva', ab); st.setProperty('--a-svetla', as); st.setProperty('--b-barva', bb); st.setProperty('--b-svetla', bs);
  }
  /** player selection dialog → profile, or null (Cancel) */
  function vyberHrace(nadpis, text, seznam) {
    return new Promise(hotovo => {
      const zavri = p => { zavriDialog($('#dvojiceOkno')); hotovo(p); };
      $('#dvojiceNadpis').textContent = nadpis; $('#dvojiceText').textContent = seznam.length ? text : t('app.dvojiceBezHrace');
      const el = $('#dvojiceHraci'); el.innerHTML = '';
      for (const p of seznam) {
        const b = document.createElement('button');
        b.className = 'profil';
        b.innerHTML = `<div class="avatar">${avatarSvg(p)}</div><div class="jmeno">${esc(p.jmeno)}</div>`;
        b.onclick = () => zavri(p);
        el.appendChild(b);
      }
      $('#dvojiceZrusit').onclick = () => zavri(null);
      otevriDialog($('#dvojiceOkno'), { zavrit: () => zavri(null), navrat: $('#dvojice') });
    });
  }
  $('#dvojice').onclick = async () => {
    if (!pripravenaPisen()) return;
    const soubor = S.pisen;
    if (S.vstup.rezim === 'mikrofon') { toast(t('app.dvojiceMikrofonVypni'), 5000); return; }
    let a = aktualniProfil();
    if (!a) {
      a = await vyberHrace(t('app.ktoMelodii'), t('app.melodieVpravo'), viditelni(S.profily));
      if (!a) return;
    }
    const b = await vyberHrace(t('app.ktoBas'), t('app.basVlevo', { jmeno: a.jmeno }),
      viditelni(S.profily).filter(p => p.id !== a.id));
    if (!b || S.pisen !== soubor || !pripravenaPisen()) return;
    S.dvojice = { melodie: a.id, bas: b.id };
    zmenaDvojice();
  };
  async function zmenaDvojice() {
    stopVse(); zavriDialog($('#vysledek'));
    if (S.pruvodce) ukonciPruvodce();
    S.smycka.zapnuto = false; $('#prepSmycka').classList.remove('zap');
    try { await pripravVerzi(); } catch (e) {
      toast(t('app.dvojiceChyba', { chyba: e.message || e }), 5000);
      S.dvojice = null; await pripravVerzi();
    }
    ovladaniPisne(); nastavRuku(); listaDvojice();
  }
  /** bar in place of the hand choice: who plays melody and who bass, swapping roles, back to playing alone */
  function listaDvojice() {
    const L = $('#dvojiceLista');
    const lze = !!S.puvodni && maAkordyProDvojici(S.puvodni);
    $('#dvojice').disabled = !lze;
    $('#dvojice').title = t(lze ? 'app.dvojiceTitul' : 'app.dvojiceBezAkordu');
    $('#dvojice').classList.toggle('skryta', !!S.dvojice);
    $('#pruvodce').classList.toggle('skryta', !!S.dvojice);
    $('#prepSmycka').classList.toggle('skryta', !!S.dvojice);
    L.classList.toggle('skryta', !S.dvojice);
    barvyDvojice();
    if (!S.dvojice) { L.innerHTML = ''; return; }
    const hrac = (id, part, tr) => {
      const p = profilPodleId(id);
      return `<span class="hrac-part ${tr}"><span class="avatar maly">${avatarSvg(p)}</span><span><b>${esc(p?.jmeno || '?')}</b> ${part}</span></span>`;
    };
    L.innerHTML = hrac(S.dvojice.bas, 'bas', 'b') + `<button id="vymenitRole" class="tlacitko sekundarni">${esc(t('vys.vymenit'))}</button>`
      + hrac(S.dvojice.melodie, 'melodie', 'a') + `<button id="hratSam" class="tlacitko sekundarni">${esc(t('app.hratSam'))}</button>`;
    $('#vymenitRole').onclick = vymenRole;
    $('#hratSam').onclick = () => { S.dvojice = null; zmenaDvojice(); };
  }
  function vymenRole() {
    S.dvojice = { melodie: S.dvojice.bas, bas: S.dvojice.melodie };
    zmenaDvojice();
  }
  $('#vysVymenit').onclick = () => vymenRole();
  /** each child's result from their staff; stored separately (dvojice), solo stars and coach advice stay unchanged */
  function konecDvojice() {
    const spol = { noty: S.kroky.flatMap(k => k.noty), zaznam: H.zaznam, chybneStisky: H.chybneStisky, rezim: S.rezim, hranice: S.hranice };
    const hraci = [['bas', 2, S.dvojice.bas, S.dvojice.melodie, 'b'], ['melodie', 1, S.dvojice.melodie, S.dvojice.bas, 'a']]
      .map(([part, staff, id, s, tr]) => {
        const v = vysledekHrace({ ...spol, staff });
        if (v && !S.usek) {
          const vs = ((S.vysledky[id] ||= {})[S.pisen] ||= {});
          const r = ((vs.dvojice ||= {})[S.rezim] ||= { hvezdy: 0, procent: 0, pocet: 0 });
          r.hvezdy = Math.max(r.hvezdy, v.hvezdy); r.procent = Math.max(r.procent, Math.round(v.podil * 100)); r.pocet++;
          r.part = part; r.s = s;
        }
        return { part, p: profilPodleId(id), v, tr };
      });
    data.pis('vysledky', S.vysledky);
    const Part = x => (x.part === 'bas' ? 'Bas' : 'Melodie');
    const veta = x => {
      const v = x.v;
      if (!v) return t('app.dvojice.nehrajes', { part: Part(x) });
      if (S.rezim !== 'tempo') return t(v.chyby ? 'app.dvojice.vedle' : 'app.dvojice.bezChyby', { part: Part(x), n: v.pocet, chyby: v.chyby });
      return t(v.chyby ? 'app.dvojice.vcasVedle' : 'app.dvojice.vcas', { part: Part(x), a: v.trefy, n: v.pocet, chyby: v.chyby });
    };
    $('#vysDvojice').innerHTML = hraci.map(x => `<div class="vys-hrac ${x.tr}">
      <div class="avatar">${avatarSvg(x.p)}</div><div class="jmeno">${esc(x.p?.jmeno || '?')}</div>
      <div class="hvezdy">${x.v ? [0, 1, 2].map(i => `<span class="${i < x.v.hvezdy ? 'plna' : ''}">★</span>`).join('') : ''}</div>
      <p>${esc(veta(x))}</p><p class="zvire-veta">${x.v ? esc(ZVIRATA[x.p?.zvire]?.vety[x.v.hvezdy] || '') : ''}</p></div>`).join('');
    const cisti = hraci.every(x => !x.v || (!x.v.chyby && x.v.trefy === x.v.pocet));
    $('#vysNadpis').textContent = t(cisti ? 'app.spoluBezChyby' : 'app.spolu');
    $('#vysUkol').classList.add('skryta'); $('#vysPrednes').classList.add('skryta'); $('#vysTrener').textContent = '';
    $('#vysChyby').classList.toggle('skryta', !chybyPokusu().length);
    $('#toast').textContent = '';
    AKCE = null; $('#vysHlavni').classList.add('skryta'); $('#vysZnovu').classList.remove('skryta');   // as a pair, no main action
    hlavniTlacitko();
    $('#vysledek').classList.add('ve-dvou');
    otevriVysledek();
  }

  // ------------------------------------------------------------ result
  const otevriVysledek = () => otevriDialog($('#vysledek'), { navrat: $('#zpet') });
  function konec() {
    H.ukoncen = true; stopVse(); oznacCil(null); prubeh(1);
    const zv = ZVIRATA[aktualniProfil()?.zvire];
    if (S.rezim === 'poslech') {
      if (S.pruvodce) return pruvodceDalsi(null);
      ukazVysledek(null, t('app.dohrano'), t('app.dohranoText'), '');
      return;
    }
    if (S.dvojice) return konecDvojice();
    S.posledniZaznam = sestavZaznam();
    const souhrn = Cviceni.souhrnPokusu(S.posledniZaznam);
    const pid = S.profil || 'host', klicStat = S.pisen + '#' + S.uroven;
    const pS = (S.statistiky[pid] ||= {});
    pS[klicStat] = Cviceni.slucStatistiky(pS[klicStat] || null, souhrn, Date.now());
    data.pis('statistiky', S.statistiky);
    S.denik = { ...S.denik, [pid]: zapisDoDeniku(S.denik?.[pid], Date.now(), souhrn.presnost) };
    data.pis('denik', S.denik);
    if (S.pruvodce) return pruvodceDalsi(souhrn);
    if (S.smycka.zapnuto) {
      const r = Cviceni.dalsiTempo({ rychlost: S.nastaveni.rychlost, cisteVRade: S.smycka.cisteVRade }, souhrn);
      S.smycka.cisteVRade = r.cisteVRade;
      if (r.zmena) nastavRychlost(r.rychlost);
      if (!r.hotovo) {
        toast(t('app.smyckaStav', { zprava: r.zprava || t('app.dalsiPruchod'), n: S.smycka.cisteVRade, r: S.nastaveni.rychlost }), 2500);
        H.timery.pridej(() => (S.rezim === 'cekam' ? reset() : spust()), 1800);
        return;
      }
      S.smycka.zapnuto = false; $('#prepSmycka').classList.remove('zap');
      toast(t(S.rezim === 'cekam' ? 'app.usekCisty' : 'app.usekPlneTempo'), 5000);
    }
    const n = souhrn.pocetNot, podil = Cviceni.podilZasahu(souhrn.ok, n, H.chyby);
    const hv = Cviceni.hvezdyZPodilu(podil, S.rezim);
    let text;
    if (S.rezim !== 'tempo') {
      text = H.chyby ? t('app.vsechVedle', { n, chyby: H.chyby }) : t('app.vsechBezChyby', { n });
    } else {
      text = t(H.chyby ? 'app.vcasTextVedle' : 'app.vcasText', { a: H.trefy, n: H.celkem, chyby: H.chyby, r: S.nastaveni.rychlost });
    }
    if (S.usek) {                                        // section: stars for the section only, not for the whole song
      const vpU = ((S.vysledky[pid] ||= {})[S.pisen] ||= {});
      const kl = `${S.usek.od}-${S.usek.do}#${S.uroven}`;
      (vpU.useky ||= {})[kl] = Math.max(vpU.useky[kl] || 0, hv);
      data.pis('vysledky', S.vysledky); nabidkaUseku();
      ukazVysledek(hv, t(souhrn.cisty ? 'app.usekCiste' : 'app.usekDohran'), text, '');
      trener(souhrn, pS[klicStat]);
      return;
    }
    const vp = (S.vysledky[pid] ||= {});
    const vs = (vp[S.pisen] ||= {});
    const r = (vs[S.rezim] ||= { hvezdy: 0, procent: 0, pocet: 0 });
    const rekord = hv > r.hvezdy;
    r.hvezdy = Math.max(r.hvezdy, hv); r.procent = Math.max(r.procent, Math.round(podil * 100)); r.pocet++;
    data.pis('vysledky', S.vysledky);
    ukazVysledek(hv, t(['app.hv0', 'app.hv1', 'app.hv2', souhrn.cisty ? 'app.hv3bezChyby' : 'app.hv3'][hv]),
      text + (rekord && r.pocet > 1 ? ' ' + t('app.rekord') : ''), zv ? zv.vety[hv] : '');
    trener(souhrn, pS[klicStat]);
  }
  /** attempt record in the lib/practice.js format (ZaznamPokusu) */
  function sestavZaznam() {
    const noty = [];
    S.kroky.forEach((k, i) => k.noty.forEach(n => noty.push(H.zaznam.get(n.id) || { takt: n.takt, index: i, pitch: n.pitch,
      ocekavanoMs: n.ms, zahranoMs: null, vysledek: 'vynechana', odchylkaMs: null, drzenoMs: null,
      ocekavanaDelkaMs: n.dur })));
    const ruka = S.ruka.has(1) && S.ruka.has(2) ? 'obe' : S.ruka.has(2) ? 'leva' : 'prava';
    return { rezim: S.rezim, krok: S.rezim, rychlost: S.nastaveni.rychlost, od: S.usek ? S.usek.od : 0,
      do: S.usek ? S.usek.do : S.model.takty.length - 1, ruka, dobaMs: 60000 / S.data.tempo,
      predznamenani: S.model.predznamenani, noty, chybneStisky: H.chybneStisky };
  }
  function nastavRychlost(v) {
    S.nastaveni.rychlost = v; ulozNastaveni();
    $('#rychlost').value = v; $('#rychlostText').textContent = rychlostText(v);
  }
  // ------------------------------------------------------------ “Learn bit by bit” practice guide
  // phrase by phrase: listen → find the notes → with backing at 70 %; join every two phrases; finally the whole song
  function zacniPruvodce() {
    const fr = Cviceni.fraze(S.model);
    const plan = [];
    fr.forEach((f, i) => {
      const jm = f.nazev.split(':')[0];
      plan.push({ rezim: 'poslech', od: f.od, do: f.do, text: t('app.pruvodce.poslechni', { usek: jm }) });
      plan.push({ rezim: 'cekam', od: f.od, do: f.do, text: t('app.pruvodce.najdi', { usek: jm }) });
      plan.push({ rezim: 'pockej', od: f.od, do: f.do, rychlost: 70, text: t('app.pruvodce.sDoprovodem', { usek: jm }) });
      if (i % 2 === 1) plan.push({ rezim: 'pockej', od: fr[i - 1].od, do: f.do, rychlost: 70,
        text: t('app.pruvodce.spoj', { usek: Cviceni.nazevUseku(S.model, fr[i - 1].od, f.do).split(':')[0] }) });
    });
    plan.push({ rezim: 'pockej', od: null, rychlost: 70, text: t('app.pruvodce.celaSDoprovodem') });
    plan.push({ rezim: 'tempo', od: null, rychlost: 70, text: t('app.pruvodce.celaVRytmu'), posledni: true });
    S.pruvodce = { plan, i: 0, pokusu: 0 };
    S.smycka.zapnuto = false; $('#prepSmycka').classList.remove('zap');
    $('#pruvodce').textContent = t('app.pruvodce.ukoncit');
    spustKrokPruvodce();
  }
  function ukonciPruvodce(zprava) {
    S.pruvodce = null;
    $('#pruvodce').textContent = t('vic.naucit');
    $('#pruvodceText').classList.add('skryta');
    if (zprava) toast(zprava, 5000);
  }
  function spustKrokPruvodce() {
    const P = S.pruvodce, k = P.plan[P.i];
    S.rezim = k.rezim;
    $$('[data-rezim]').forEach(x => x.classList.toggle('zvoleno', x.dataset.rezim === k.rezim));
    S.usek = k.od == null ? null : { od: k.od, do: k.do };
    if (k.rychlost) nastavRychlost(k.rychlost);
    nabidkaUseku();
    $('#pruvodceText').innerHTML = `<b>${esc(t('app.pruvodce.krok', { i: P.i + 1, n: P.plan.length }))}</b> ${esc(k.text)}`
      + (P.pokusu ? ` <span class="napoveda">${esc(t('app.pruvodce.pokus', { n: P.pokusu + 1 }))}</span>` : '');
    $('#pruvodceText').classList.remove('skryta');
    nastavRuku();
    if (k.rezim === 'poslech') H.timery.pridej(spust, 1200);
  }
  /** after a step ends: move on after a clean run (listening always), or after 3 attempts with accuracy ≥ 85 % */
  function pruvodceDalsi(souhrn) {
    const P = S.pruvodce, k = P.plan[P.i];
    P.pokusu++;
    const splneno = !souhrn || souhrn.cisty || (P.pokusu >= 3 && souhrn.presnost >= 0.85);
    if (!splneno) {
      toast(t(souhrn.presnost >= 0.85 ? 'app.skoro' : 'app.klidne'), 2500);
      H.timery.pridej(spustKrokPruvodce, 1500);
      return;
    }
    radost();
    if (k.posledni) {
      ukonciPruvodce();
      ukazVysledek(3, t('app.pruvodce.umis'), t('app.pruvodce.umisText'), '');
      return;
    }
    toast(t(souhrn ? 'app.jdemeDal' : 'app.tedTy'), 2000);
    H.timery.pridej(() => { P.i++; P.pokusu = 0; spustKrokPruvodce(); }, 1500);
  }
  $('#pruvodce').onclick = () => {
    if (S.pruvodce) { ukonciPruvodce(t('app.pruvodce.ukoncen')); reset(); return; }
    if (!pripravenaPisen()) return;
    zobrazHru();
    zacniPruvodce();
  };
  $('#prepMetronom').onclick = () => {
    S.nastaveni.metronom = !S.nastaveni.metronom; ulozNastaveni();
    $('#prepMetronom').classList.toggle('zap', S.nastaveni.metronom);
  };
  $('#prepMetronom').classList.toggle('zap', !!S.nastaveni.metronom);

  // ------------------------------------------------------------ coach after playing
  let TRENER_UKOL = null;
  async function pridejPisen(pisen) {
    if (!pisen.nazev) pisen.nazev = t('app.novaPisnicka');
    const xml = naMusicXml(pisen);
    const nazev = pisen.nazev.replace(/[\/\\:]/g, ' ') + '.musicxml';
    await UL.aktivni.zapis(jmenoSouboru(nazev), new TextEncoder().encode(xml));
    nactiPisne();
  }
  Doplnky.nastav({ S, audio, hlas, toast, pridejPisen, profil: () => aktualniProfil() });

  async function trener(souhrn, statistika) {
    const prof = aktualniProfil();
    const fakta = Cviceni.faktaProTrenera(souhrn, statistika, S.model, { pasmo: prof?.vek || 'dite' });
    ukazRadu(Cviceni.textTrenera(fakta));
  }
  function ukazRadu(rada) {
    TRENER_UKOL = rada?.ukol || null;
    $('#vysTrener').textContent = rada?.veta || '';
    const b = $('#vysUkol');
    // after 3 stars the main button moves on; practice would be redundant there (often across the whole song)
    const dal = AKCE && ['krok', 'rychleji', 'dalsi'].includes(AKCE.druh);
    b.classList.toggle('skryta', !TRENER_UKOL || dal);
    if (TRENER_UKOL) {
      b.textContent = t('app.procvicitNa', { usek: Cviceni.nazevUseku(S.model, TRENER_UKOL.od, TRENER_UKOL.do).split(':')[0], r: TRENER_UKOL.rychlost });
    }
    hlavniTlacitko();
  }
  /** the results show the coach's main task, otherwise “Once more” */
  function hlavniTlacitko() {
    const ukol = !$('#vysUkol').classList.contains('skryta');
    $('#vysUkol').classList.toggle('sekundarni', false);
    $('#vysZnovu').classList.toggle('sekundarni', ukol);
  }
  $('#vysUkol').onclick = () => {
    const u = TRENER_UKOL;
    if (!u) return;
    S.usek = { od: u.od, do: u.do };
    nastavRychlost(u.rychlost);
    S.smycka.zapnuto = true; S.smycka.cisteVRade = 0;
    if (u.ruka && S.data.osnovy.length > 1 && !S.dvojice) S.rukaVolba = u.ruka === 'leva' ? '2' : u.ruka === 'obe' ? 'vse' : '1';
    zavriDialog($('#vysledek'));
    nabidkaUseku(); $('#prepSmycka').classList.add('zap');
    nastavRuku();
  };
  /** main result button: one recommended action (next step, faster, next song, practise, again) */
  let AKCE = null;
  function akceVysledku(hv) {
    const vys = vysHrace()[S.pisen] || {}, stat = statHrace();
    if (S.usek) return { druh: 'znovu' };
    if (hv == null) return { druh: 'krok', krok: doporuceni(vys, stat, S.pisen).krok };
    const misto = Cviceni.tezkaMista(statistikaPisne(), S.puvodni, 1)[0];
    const hratelne = domaciPisne().filter(p => !p.chyba && p.soubor !== S.pisen);
    return akcePoVysledku({ hvezdy: hv, vys, stat, soubor: S.pisen, dalsi: dalsiPisen(hratelne),
      mistoSlabe: misto, taktu: rozvin(S.puvodni).pisen.takty.length, rychlost: S.nastaveni.rychlost });
  }
  function popisAkce(a) {
    if (a.druh === 'krok') return t('vys.krok', { krok: t('krok.' + a.krok) });
    if (a.druh === 'rychleji') return t('vys.rychleji', { r: a.rychlost });
    if (a.druh === 'dalsi') return t('vys.dalsi', { nazev: a.pisen.nazev });
    if (a.druh === 'procvicit') return t('vys.procvicit', { takty: a.misto.takty });
    return t('vys.znovu');
  }
  /** part of the song (bars od..dok of the expanded song) in a loop, like a coach task */
  function procvicUsek(od, dok) {
    S.usek = { od, do: dok };
    nastavRychlost(Math.min(80, S.nastaveni.rychlost));
    S.smycka.zapnuto = true; S.smycka.cisteVRade = 0;
    zavriDialog($('#vysledek'));
    nabidkaUseku(); $('#prepSmycka').classList.add('zap');
    nastavRuku();
  }
  $('#vysHlavni').onclick = async () => {
    const a = AKCE;
    if (!a || a.druh === 'znovu') { reset(); return; }
    if (a.druh === 'procvicit') { procvicUsek(a.misto.od, a.misto.do); return; }
    zavriDialog($('#vysledek')); stopVse();
    await otevriPred(a.druh === 'dalsi' ? a.pisen.soubor : S.pisen);
    if (a.druh !== 'dalsi') { PRED.krok = a.krok; if (a.rychlost) PRED.rychlost = a.rychlost; vykresliPred(); }
  };
  function ukazVysledek(hv, nadpis, text, veta) {
    $('#vysledek').classList.remove('ve-dvou');
    AKCE = S.dvojice ? null : akceVysledku(hv);
    $('#vysHlavni').classList.toggle('skryta', !AKCE);
    if (AKCE) $('#vysHlavni span').textContent = popisAkce(AKCE);
    $('#vysZnovu').classList.toggle('skryta', AKCE?.druh === 'znovu');
    $('#vysPrednes').classList.toggle('skryta', !(S.posledniZaznam && S.rezim !== 'poslech' && hv != null && H.silaZMidi));
    $('#vysChyby').classList.toggle('skryta', !chybyPokusu().length);
    $('#toast').textContent = '';
    hlavniTlacitko();
    $('#vysAvatar').innerHTML = avatarSvg(aktualniProfil());
    H.timery.pridej(() => radostZvirete($('#vysAvatar .zvire')), 150);   // joy after playing
    $('#vysHvezdy').innerHTML = hv == null ? '' : [0, 1, 2].map(i => `<i class="${i < hv ? 'ano' : ''}"></i>`).join('');
    $('#vysNadpis').textContent = nadpis;
    $('#vysText').textContent = text;
    $('#vysZvire').textContent = veta;
    otevriVysledek();
  }
  $('#vysZnovu').onclick = () => reset();

  // ------------------------------------------------------------ Show mistakes: wrong keys in the score after the song
  /** wrong presses of the last attempt grouped per note (only notes drawn in the score); none when listening */
  function chybyPokusu() {
    if (S.rezim === 'poslech' || !S.data) return [];
    return chybyKPrehledu(H.chybneStisky, S.data.noty).filter(c => S.el[c.nota]);
  }
  function svgPrvek(jm, atr, text) {
    const e = document.createElementNS(SVGNS, jm);
    for (const [k, v] of Object.entries(atr)) e.setAttribute(k, v);
    if (text) e.textContent = text;
    return e;
  }
  /**
   * Red hollow noteheads of a note's wrong pitches, just left of the note (and of its accidental) on its staff.
   * Placed from the target note itself, so clef changes and a treble-clef left hand don't matter: y = the target's
   * notehead centre − (ghost step − target step) × half the line spacing; the key is the one valid at the target's bar.
   * The staff's five lines give the spacing and ledger lines (from ±6), a small accidental goes left of the ghost, an
   * arrow too when the pitch lies beyond three ledger lines. Never over the clef, key or time signature before the note.
   */
  function nakresliDuchy(c) {
    const nota = S.data.noty.find(n => n.id === c.nota);
    const g = S.el[c.nota]?.g, osnova = g?.closest('g.staff');
    if (!osnova || nota?.stupen == null) return null;
    const linky = [...osnova.querySelectorAll(':scope > path')]
      .map(p => Number(/^M\s*[-\d.]+\s+([-\d.]+)/.exec(p.getAttribute('d') || '')?.[1]))
      .filter(Number.isFinite).slice(0, 5).sort((a, b) => a - b);
    if (linky.length < 5) return null;
    const yStred = linky[2], mezera = (linky[4] - linky[0]) / 4;
    const bbox = e => { try { return e.getBBox(); } catch { return null; } };
    const bb = bbox(g.querySelector('.notehead') || g);
    if (!bb) return null;
    const yNota = bb.y + bb.height / 2;
    let vlevo = bb.x, vpravo = bb.x + bb.width;
    for (const e of (g.closest('g.chord') || g).querySelectorAll('.notehead, .accid, .dots')) {
      const b = bbox(e);
      if (!b?.width) continue;                                // a key-implied accidental is an empty group at x = 0
      if (!e.matches('.dots')) vlevo = Math.min(vlevo, b.x);
      if (!e.matches('.accid')) vpravo = Math.max(vpravo, b.x + b.width);
    }
    // the clef, key and time signature drawn before the note on this staff's line (start of a line, or a change – a
    // clef change sits at the end of the previous bar); the score shares one coordinate space
    let zaKlicem = -Infinity;
    for (const e of (osnova.ownerSVGElement || osnova).querySelectorAll('g.clef, g.keySig, g.meterSig')) {
      const b = bbox(e);
      if (b?.width && b.x < vlevo && b.y < linky[4] && b.y + b.height > linky[0]) zaKlicem = Math.max(zaKlicem, b.x + b.width);
    }
    const cil = { stupen: nota.stupen, poloha: Math.round((yStred - yNota) / (mezera / 2)) };
    const rx = bb.width * 0.46, ry = mezera * 0.42, tl = mezera * 0.17, odstup = mezera * 0.45;
    const duchy = c.vysky.map(p => {
      const d = polohaDucha(p, nota.predznamenani, cil);
      return { p, ...d, znacka: (d.mimo === 'nahoru' ? '↑' : d.mimo === 'dolu' ? '↓' : '') + (d.posuvka || '') };
    });
    // columns leftwards: ghosts a third or more apart share one; marks (accidental, arrow) only where they can't collide
    const sloupce = [];
    for (const d of duchy) {
      let s = sloupce.find(s => s.every(e => Math.abs(e.poloha - d.poloha) >= 2 && !(e.znacka && d.znacka && Math.abs(e.poloha - d.poloha) < 6)));
      if (!s) sloupce.push(s = []);
      s.push(d);
    }
    const skupina = svgPrvek('g', { class: 'duchove', 'data-nota': c.nota });
    let x = vlevo - odstup;
    for (const s of sloupce) {
      const cx = x - rx;
      for (const { p, poloha, mimo, znacka } of s) {
        // off the staff's range: at the clamp; otherwise measured from the target notehead
        const cy = mimo ? yStred - poloha * mezera / 2 : yNota - (poloha - cil.poloha) * mezera / 2;
        const d = svgPrvek('g', { class: 'duch', 'data-pitch': p });
        for (let l = 6; l <= Math.abs(poloha); l += 2) {
          const y = yStred - Math.sign(poloha) * l * mezera / 2;
          d.append(svgPrvek('line', { x1: cx - rx * 1.3, x2: cx + rx * 1.3, y1: y, y2: y, 'stroke-width': tl * 0.75 }));
        }
        const elipsa = { cx, cy, rx: rx - tl / 2, ry: ry - tl / 2, transform: `rotate(-20 ${cx} ${cy})` };
        d.append(svgPrvek('ellipse', { ...elipsa, class: 'halo', 'stroke-width': tl * 2.6 }));   // card colour under the red ring
        d.append(svgPrvek('ellipse', { ...elipsa, 'stroke-width': tl }));
        if (znacka) d.append(svgPrvek('text', { x: cx - rx - mezera * 0.15, y: cy + mezera * 0.5, 'text-anchor': 'end', 'font-size': mezera * 1.5,
          'stroke-width': tl * 1.6 }, znacka));
        skupina.append(d);
      }
      x = cx - rx - Math.max(0, ...s.map(d => d.znacka.length)) * mezera * 1.05 - odstup;
    }
    osnova.appendChild(skupina);
    // not enough room after the clef/key/time signature: nudge right; if a ghost or mark would then cover the note's
    // own head (with its letter circle), the whole group goes right of the note instead
    const vse = bbox(skupina);
    if (vse && vse.x < zaKlicem + odstup) {
      let dx = zaKlicem + odstup - vse.x;
      const r = Math.max(bb.width, bb.height) * 0.62 + tl, sx = bb.x + bb.width / 2;
      const kryje = [...skupina.querySelectorAll('ellipse:not(.halo), text')].map(bbox)
        .some(b => b && b.x + dx < sx + r && b.x + b.width + dx > sx - r && b.y < yNota + r && b.y + b.height > yNota - r);
      if (kryje) dx = vpravo + odstup - vse.x;
      skupina.setAttribute('transform', `translate(${dx} 0)`);
    }
    return skupina;
  }
  function ukazChyby() {
    zavriPrehled();
    PREHLED.polozky = chybyPokusu().map(c => ({ ...c, g: nakresliDuchy(c) }));
    if (!PREHLED.polozky.length) return;
    zavriDialog($('#vysledek'));
    $('#hra').classList.add('prehled');
    $('#prehledChyb').classList.remove('skryta');
    $('#chybaProcvicit').classList.toggle('skryta', !!S.dvojice);   // loop practice is for one player
    ukazChybu(0);
    $(PREHLED.polozky.length > 1 ? '#chybaDalsi' : '#chybaZpet').focus();
  }
  /** the i-th mistake: highlighted, scrolled into view, with its bar for practice */
  function ukazChybu(i) {
    const P = PREHLED, n = P.polozky.length;
    if (!n) return;
    P.i = Math.max(0, Math.min(n - 1, i));
    P.polozky.forEach((c, j) => c.g?.classList.toggle('ted', j === P.i));
    const c = P.polozky[P.i];
    $('#chybaPocet').textContent = t('app.chyby.pocet', { i: P.i + 1, n });
    $('#chybaPredchozi').disabled = P.i === 0;
    $('#chybaDalsi').disabled = P.i === n - 1;
    const b = $('#chybaProcvicit');
    b.textContent = t('app.chyby.procvicit', { takty: Cviceni.cisloTaktu(S.model, c.takt) });
    b.title = Cviceni.nazevUseku(S.model, c.takt, c.takt);
    const k = S.kroky.findIndex(k => k.noty.some(x => patriKNote(x, c.nota)));
    if (k >= 0) posunKrok(k, false);
  }
  function zavriPrehled() {
    $$('#pas g.duchove').forEach(g => g.remove());
    PREHLED.polozky = []; PREHLED.i = 0;
    $('#prehledChyb').classList.add('skryta');
    $('#hra').classList.remove('prehled');
  }
  $('#vysChyby').onclick = () => ukazChyby();
  $('#chybaPredchozi').onclick = () => ukazChybu(PREHLED.i - 1);
  $('#chybaDalsi').onclick = () => ukazChybu(PREHLED.i + 1);
  $('#chybaProcvicit').onclick = () => {
    const c = PREHLED.polozky[PREHLED.i];
    if (!c) return;
    zavriPrehled();
    procvicUsek(c.takt, c.takt);
  };
  $('#chybaZpet').onclick = () => { zavriPrehled(); otevriVysledek(); $('#vysChyby').focus(); };
  $('#vysPrednes').onclick = () => Doplnky.prednes(S.posledniZaznam);
  $('#oPisni').onclick = () => { stopVse(); Doplnky.pruvodcePisne(); };
  $('#ozvena').onclick = () => { stopVse(); Doplnky.ozvena(); };
  // tapping a note (outside the game) → questions about it
  $('#pas').addEventListener('click', e => {
    if (H.bezi || H.spousti || H.kalibrace) return;
    const id = e.target.closest('g.note')?.id || e.target.closest('.ovl')?.getAttribute('data-nota');
    const n = id && S.data?.noty.find(x => x.id === id);
    const kde = n && Doplnky.notaModelu(n);
    if (kde) Doplnky.otazkaNaNotu(kde);
  });
  // left-hand backing style
  $('#styl').innerHTML = `<option value="">${esc(t('app.stylPodleUrovne'))}</option>` + STYLY.map(st => `<option value="${st.id}">${esc(st.nazev)}</option>`).join('');
  $('#styl').onchange = () => { S.styl = $('#styl').value; zmenVerzi(); };
  $('#vzorDoprovodu').innerHTML = VZORY_DOPROVODU.map(v => `<option value="${v.id}">${esc(v.nazev)}</option>`).join('');
  $('#vzorDoprovodu').value = S.nastaveni.vzorDoprovodu || 'auto';
  $('#vzorDoprovodu').onchange = () => {
    S.nastaveni.vzorDoprovodu = $('#vzorDoprovodu').value; ulozNastaveni();
    if (S.data && !$('#hra').classList.contains('skryta')) { stopVse(); nastavRuku(); }
  };
  $('#vysDomu').onclick = () => { reset(); ukaz('domu'); nactiPisne(); };

  // ------------------------------------------------------------ controls
  // Quit goes back to Before playing of the same song, with the step and speed that were being played; the guide and a
  // song that isn't in the list (e.g. pasted and never saved) go home
  $('#zpet').onclick = () => {
    stopVse(); oznacCil(null);
    const pruvodce = !!S.pruvodce;
    if (pruvodce) ukonciPruvodce();
    if (pruvodce || !pisenSouboru(S.pisen)) { ukaz('domu'); nactiPisne(); return; }
    const { soubor, krok, rychlost } = PRED;
    otevriPred(S.pisen);                              // its synchronous part sets PRED to the recommendation
    if (soubor === S.pisen) { Object.assign(PRED, { krok, rychlost }); vykresliPred(); }
  };
  $('#znovu').onclick = () => { zapniMikrofonPriHre(); reset(); };

  // ------------------------------------------------------------ pause and display
  const prekryv = (sel, otevrit) => $(sel).classList.toggle('skryta', !otevrit);
  function pozastavHru() {
    if (hraPozastavena()) return;
    const navazat = !H.bezi && !H.spousti;        // active timed playback restarts; between runs the queued transition can resume
    stopVse({ pozastavit: navazat });
    $('#pauzaPokracovat').classList.toggle('skryta', !navazat);
    prekryv('#pauzaPrekryv', true);
  }
  $('#pauza').onclick = pozastavHru;
  $('#pauzaPokracovat').onclick = () => {
    prekryv('#pauzaPrekryv', false);
    H.timery.pokracuj();
  };
  $('#pauzaZobrazeni').onclick = () => {                // the same toggles as Settings → Display, plus the accompaniment and calibration
    if (!$('#zobrazeni .prepinace')) $('#zobrazeni aside').append($('#nastaveniZobrazeni .prepinace'));
    prekryv('#zobrazeni', true);
  };
  $('#zobrazeniZavrit').onclick = () => prekryv('#zobrazeni', false);
  $('#zobrazeni').onclick = e => { if (e.target.id === 'zobrazeni') prekryv('#zobrazeni', false); };
  $('#pauzaKonec').onclick = () => { prekryv('#pauzaPrekryv', false); $('#zpet').click(); };
  $('#znovu').addEventListener('click', () => prekryv('#pauzaPrekryv', false));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (jaMenuOtevrene()) { jaMenu(false, { fokus: true }); return; }
      if (vstupMenuOtevrene()) { vstupMenu(false, { fokus: true }); return; }
      prekryv('#zobrazeni', false);
    }
  });
  $$('[data-rezim]').forEach(b => b.onclick = () => {
    if (S.pruvodce) ukonciPruvodce();
    if (S.rezim !== b.dataset.rezim) S.smycka.cisteVRade = 0;
    S.rezim = b.dataset.rezim;
    $$('[data-rezim]').forEach(x => x.classList.toggle('zvoleno', x === b));
    reset();
  });
  function rychlostText(v) {
    return v <= 50 ? t('app.rychlostPomala', { v }) : v >= 90 ? t('app.rychlostRychla', { v }) : `${v} %`;
  }
  $('#rychlost').value = S.nastaveni.rychlost;
  $('#rychlostText').textContent = rychlostText(S.nastaveni.rychlost);
  $('#rychlost').oninput = e => {
    S.nastaveni.rychlost = Number(e.target.value);
    $('#rychlostText').textContent = rychlostText(S.nastaveni.rychlost);
    ulozNastaveni();
    if (S.rezim !== 'cekam' && H.bezi) reset();
  };
  // the toggles are switches for assistive tech too: aria-checked follows the 'zap' class (set in several places)
  for (const b of $$('.prepinac:not(#kalibrace)')) {
    const stav = () => b.setAttribute('aria-checked', String(b.classList.contains('zap')));
    b.setAttribute('role', 'switch'); stav();
    new MutationObserver(stav).observe(b, { attributes: true, attributeFilter: ['class'] });
  }
  function prepinac(id, klic, priZmene) {
    const b = $(id);
    const ukazStav = () => { b.classList.toggle('zap', S.nastaveni[klic]); priZmene?.(); };
    PREPINACE.push(ukazStav);
    b.onclick = () => { S.nastaveni[klic] = !S.nastaveni[klic]; ulozNastaveni(); ukazStav(); };
    ukazStav();
  }
  prepinac('#prepZvukKlavir', 'zvukKlavir', () => { if (!hraPozastavena()) stopVse(); stavZvukuKlaviru(); });
  function stavZvukuKlaviru() {
    const b = $('#prepZvukKlavir');
    b.classList.toggle('skryta', !MIDI_UMI);
    b.title = VYSTUP.nazev ? t('app.zvukKlavir', { nazev: VYSTUP.nazev }) : t('app.zvukKlavirNe');
  }
  prepinac('#prepPismena', 'pismena', () => document.body.classList.toggle('bez-pismen', !S.nastaveni.pismena));
  prepinac('#prepBarvy', 'barvy', () => {
    document.body.classList.toggle('bez-barev', !S.nastaveni.barvy);
    if (S.rezim === 'cekam' && S.kroky[H.idx] && !$('#hra').classList.contains('skryta')) oznacKrok(H.idx);
  });
  $$('.prep-doprovod').forEach(b => b.onclick = () => {   // per device and mode (off with the microphone), not per player
    S.vstup = sDoprovodem(S.vstup, !doprovodZapnuty(S.vstup)); uloz.pis('kt-vstup', S.vstup); midiStav();
  });
  let zrusPrekresleni = null;
  window.addEventListener('resize', () => {
    if ($('#hra').classList.contains('skryta') || !S.svg) return;
    const lze = () => lzePrekreslit(H) && !S.pruvodce && !hraPozastavena();
    zrusPrekresleni?.();
    if (S.data?.stranka && lze()) {
      zrusPrekresleni = H.timery.pridej(() => {
        if (lze()) { vykresliVerziHry(VTK); nastavRuku(); }
      }, 350);
    }
    velikostNot(); spocitejPozice(); S.radek = null;
    if (S.rezim === 'cekam') posunKrok(H.idx, true);
  });
  prepinac('#prepKlaviatura', 'klaviatura', () => {
    ukazKlavesy();                                     // without a working piano or microphone the keys stay
  });
  prepinac('#prepStranka', 'stranka', async () => {
    if ($('#hra').classList.contains('skryta') || !S.puvodni) return;
    stopVse(); await pripravVerzi(); nastavRuku();
  });

  prelozStranku();
  pozadejTrvaleUloziste();
  let dataNactena = false, obnovujeData = false;
  pripravUloziste().catch(e => hlasData(t('app.dataCteni', { chyba: chybaText(e) }))).then(() => nactiTrvalaData({ prvni: true })).finally(() => {
    // nobody plays here yet (no player, no folder): on rusalkapiano.com the introduction page first (static/prvni.js),
    // unless a song page sent them here to play its song
    dataNactena = true;
    if (window.naUvodniStranku?.(jazyk(), viditelni(S.profily).length > 0 || !!UL.slozka || !!CEKA_PISEN || !!zapisChyba || cteniChyby.size > 0)) return;
    vykresliProfily(); stavUloziste(); nactiPisne(); uvodniObrazovka(); oknoZAdresy();
    if (!navigator.connection?.saveData) setTimeout(window.prednactiVerovio, 1000);
  });
  // Refresh data and songs after a switch from another app, tab or window (songs added to the folder meanwhile appear too).
  async function obnovDataPoNavratu() {
    if (!dataNactena || obnovujeData || meniData || !$('#hra').classList.contains('skryta') || document.visibilityState !== 'visible') return;
    obnovujeData = true;
    try {
      await nactiTrvalaData();
      if (!$('#domu').classList.contains('skryta')) nactiPisne();
    } finally { obnovujeData = false; }
  }
  window.addEventListener('focus', obnovDataPoNavratu);
  window.addEventListener('pagehide', () => { void frontaDat.dokonci(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && otevreno('#hra') && !otevreno('#vysledek')
      && (H.bezi || H.spousti || H.kalibrace || (H.timery.ceka && (S.pruvodce || H.ukoncen || H.idx >= S.kroky.length)))) pozastavHru();
    if (document.visibilityState === 'hidden') void frontaDat.dokonci();
    else obnovDataPoNavratu();
  });
  midiStart();
}
