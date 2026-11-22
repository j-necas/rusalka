// Score editor: corrections after conversion from a PDF/photo and edits of any song. The editing logic is in
// lib/editor.js; this file only does the display (Verovio), tap selection, keyboard, pitch input from the piano and saving.
import { naMusicXml, zMusicXml, akordZnacky, metrum, kopie } from '../lib/song.js';
import * as E from '../lib/editor.js';
import { porovnej, souhrnText } from '../lib/compare.js';
import { t } from '../lib/texts.js';
import { nazevKroku, soustava } from '../lib/note_names.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DELKY_KLIC = { '1/1': 'cela', '1/2': 'pulova', '1/4': 'ctvrtova', '1/8': 'osminova', '1/16': 'sestnactinova', '1/32': 'dvaatricetinova' };
const tt = (klic, parametry) => esc(t(klic, parametry));     // text for HTML (attributes and content)

let STAV = null;               // the open editor (only one)

/**
 * Opens the editor full screen.
 * volby: { pisen, nazevSouboru?, nejiste?: number[], poznamky?: string[], varovani?: string, stranky?: dataURL[] (original alongside),
 *          verovioTk: async () => toolkit, zahraj?: (midi[], s) => void, vzory?: [{nazev, nacti: async () => pisen}],
 *          onUloz: async (pisen) => void, onZavrit?: () => void }
 */
export function otevriEditor(volby) {
  zavri();
  const el = document.createElement('div');
  el.className = 'editor';
  el.innerHTML = `
    <header class="editor-lista">
      <input class="editor-nazev" value="${esc(volby.pisen.nazev)}" aria-label="${tt('editor.nazevPisne')}">
      <button data-akce="zpet" class="kulate" title="${tt('editor.zpet')}">↶</button>
      <button data-akce="znovu" class="kulate" title="${tt('editor.znovu')}">↷</button>
      <span class="editor-stav"></span>
      ${volby.vzory?.length ? `<select class="vyber editor-vzor" title="${tt('editor.vzorTitul')}">
        <option value="">${tt('editor.vzorVolba')}</option>${volby.vzory.map((v, i) => `<option value="${i}">${esc(v.nazev)}</option>`).join('')}</select>` : ''}
      <button data-akce="ulozit" class="tlacitko">${tt('editor.ulozit')}</button>
      <button data-akce="zavrit" class="tlacitko sekundarni">${tt('editor.zavrit')}</button>
    </header>
    <div class="editor-telo ${volby.stranky?.length ? 's-originalem' : ''}">
      ${volby.stranky?.length ? `<div class="editor-original">${volby.stranky.map(s => `<img src="${s}" alt="${tt('editor.original')}">`).join('')}</div>` : ''}
      <div class="editor-noty" tabindex="0"><div class="nacitam">${tt('editor.kreslim')}</div></div>
    </div>
    <div class="editor-info"></div>
    <footer class="editor-nastroje">
      <div class="skupina">${E.DELKY.map((d, i) => `<button data-delka="${d}" title="${tt(`editor.delka.${DELKY_KLIC[d]}`)} (${i + 1})">${['𝅝', '𝅗𝅥', '♩', '♪', '𝅘𝅥𝅯', '𝅘𝅥𝅰'][i]}</button>`).join('')}
        <button data-akce="tecka" title="${tt('editor.tecka')}">•</button><button data-akce="triola" title="${tt('editor.triola')}">3</button></div>
      <div class="skupina"><button data-akce="vyskaNahoru" title="${tt('editor.vys')}">▲</button>
        <button data-akce="vyskaDolu" title="${tt('editor.niz')}">▼</button><button data-akce="oktavaNahoru" title="${tt('editor.oktavaVys')}">8va</button>
        <button data-akce="oktavaDolu" title="${tt('editor.oktavaNiz')}">8vb</button></div>
      <div class="skupina"><button data-akce="pomlka" title="${tt('editor.pomlkaTitul')}">𝄽</button><button data-akce="ligatura" title="${tt('editor.ligaturaTitul')}">⁀</button>
        <button data-akce="vlozit" title="${tt('editor.vlozitTitul')}">${tt('editor.vlozit')}</button></div>
      <label class="skupina">${tt('editor.slabika')} <input class="editor-slabika" size="6"></label>
      <label class="skupina">${tt('editor.akord')} <input class="editor-akord" size="5" placeholder="C, Dm, G7"></label>
      <div class="skupina"><button data-akce="taktPridat">${tt('editor.taktPridat')}</button><button data-akce="taktSmazat">${tt('editor.taktSmazat')}</button>
        <select class="vyber editor-znacky" title="${tt('editor.znackyTitul')}">
          <option value="">${tt('editor.znacky')}</option><option value="zacatekRepetice">${tt('editor.znacka.zacatekRepetice')}</option>
          <option value="konecRepetice">${tt('editor.znacka.konecRepetice')}</option><option value="volta1">${tt('editor.znacka.volta1')}</option><option value="volta2">${tt('editor.znacka.volta2')}</option>
          <option value="segno">segno</option><option value="coda">coda</option><option value="doCody">To Coda</option>
          <option value="fine">Fine</option><option value="dc">D.C.</option><option value="ds">D.S.</option><option value="zrusit">${tt('editor.znacka.zrusit')}</option>
        </select></div>
      <div class="skupina hlavicka">
        <label>${tt('editor.takt')} <input class="editor-takt" size="4" value="${esc(volby.pisen.takt)}"></label>
        <label>${tt('editor.predznamenani')} <input class="editor-predzn" type="number" min="-7" max="7" value="${esc(volby.pisen.predznamenani)}"></label>
        <label>${tt('editor.tempo')} <input class="editor-tempo" type="number" min="0" max="300" value="${esc(volby.pisen.tempo || 0)}"></label>
      </div>
      <p class="napoveda">${tt('editor.napoveda')}</p>
    </footer>`;
  document.body.appendChild(el);
  STAV = { el, volby, pisen: kopie(volby.pisen), historie: null, vyber: null, mapa: {}, nejiste: new Set(volby.nejiste || []),
    zmeneno: false, porovnani: '' };
  STAV.historie = E.novaHistorie(STAV.pisen).historie;
  STAV.vyber = E.prvni(STAV.pisen, 'p').vyber;
  el.addEventListener('click', klik);
  el.querySelector('.editor-noty').addEventListener('click', klikNaNoty);
  document.addEventListener('keydown', klavesa, true);
  el.querySelector('.editor-slabika').addEventListener('change', e => uprav(E.nastavSlabiku(STAV.pisen, STAV.vyber, e.target.value), 'slabika'));
  el.querySelector('.editor-akord').addEventListener('change', e => {
    const n = E.vybranaNota(STAV.pisen, STAV.vyber);
    uprav(E.nastavAkord(STAV.pisen, STAV.vyber.takt, n ? polohaNoty(STAV.vyber) : 0, e.target.value.trim() || null, STAV.vyber), 'akord');
  });
  el.querySelector('.editor-znacky').addEventListener('change', e => {
    const v = e.target.value; e.target.value = '';
    if (!v || !STAV.vyber) return;
    const z = { ...(STAV.pisen.takty[STAV.vyber.takt].znacky || {}) };
    if (v === 'zrusit') Object.keys(z).forEach(k => delete z[k]);
    else if (v.startsWith('volta')) z.volta = [Number(v.slice(5))];
    else z[v] = !z[v];
    uprav(E.nastavZnacky(STAV.pisen, STAV.vyber.takt, z, STAV.vyber), 'značky');
  });
  for (const [sel, pole] of [['.editor-takt', 'takt'], ['.editor-predzn', 'predznamenani'], ['.editor-tempo', 'tempo']]) {
    el.querySelector(sel).addEventListener('change', e => {
      const v = pole === 'takt' ? e.target.value.trim() : Number(e.target.value);
      uprav(E.nastavHlavicku(STAV.pisen, { [pole]: v }, STAV.vyber), 'hlavička');
    });
  }
  el.querySelector('.editor-nazev').addEventListener('change', e => uprav(E.nastavHlavicku(STAV.pisen, { nazev: e.target.value.trim() }, STAV.vyber), 'název'));
  el.querySelector('.editor-vzor')?.addEventListener('change', async e => {
    const v = volby.vzory[Number(e.target.value)];
    if (!v) { STAV.porovnani = ''; return info(); }
    try { STAV.porovnani = souhrnText(porovnej(await v.nacti(), STAV.pisen)); } catch (err) { STAV.porovnani = t('editor.porovnaniSelhalo', { chyba: err.message }); }
    info();
  });
  vykresli();
}

export const jeOtevreny = () => !!STAV;

/** note from the piano (MIDI): sets the pitch of the selected note and moves the selection to the next note */
export function midi(p) {
  if (!STAV || !STAV.vyber) return false;
  const r = E.nastavVysku(STAV.pisen, STAV.vyber, p);
  if (r.chyba) { info(r.chyba); return true; }
  uprav(r, 'výška z klavíru', true);
  uprav(E.dalsi(STAV.pisen, STAV.vyber), null);
  return true;
}

function zavri() {
  if (!STAV) return;
  document.removeEventListener('keydown', klavesa, true);
  STAV.el.remove();
  const z = STAV.volby.onZavrit;
  STAV = null;
  z?.();
}

// ---------------------------------------------------------------- edits and history
function uprav(r, popis, tise = false) {
  if (!r) return;
  if (r.chyba) { info(r.chyba); return; }
  const zmena = r.pisen !== STAV.pisen;
  STAV.pisen = r.pisen;
  if (r.vyber !== undefined) STAV.vyber = r.vyber;
  if (zmena && popis) {
    STAV.historie = E.zapis(STAV.historie, STAV.pisen, popis).historie;
    STAV.zmeneno = true;
    if (!tise) zahrajVybranou();
  }
  zmena ? vykresli() : zvyrazni();
}
function historie(smer) {
  const r = smer < 0 ? E.zpet(STAV.historie) : E.znovu(STAV.historie);
  if (!r.popis) return;
  STAV.historie = r.historie; STAV.pisen = r.pisen;
  if (!E.vybranaNota(STAV.pisen, STAV.vyber)) STAV.vyber = E.prvni(STAV.pisen, 'p').vyber;
  vykresli();
}
function zahrajVybranou() {
  const n = E.vybranaNota(STAV.pisen, STAV.vyber);
  if (!n || n.t === 'r' || !STAV.volby.zahraj) return;
  const midi = String(n.t).split(/\s+/).map(t => {
    const m = t.match(/^([A-H])(#{1,2}|b{1,2})?(-?\d)$/); if (!m) return null;
    const pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 }[m[1]] + ({ '#': 1, '##': 2, b: -1, bb: -2 }[m[2]] || 0);
    return 12 * (Number(m[3]) + 1) + pc;
  }).filter(x => x != null);
  STAV.volby.zahraj(midi, 0.5);
}
function polohaNoty(v) {
  const noty = STAV.pisen.takty[v.takt][v.ruka === 'l' ? 'leva' : 'noty'] || [];
  let q = 0;
  for (let i = 0; i < v.index; i++) { const m = String(noty[i].d).match(/^(\d+)\/(\d+)$/); q += m ? 4 * m[1] / m[2] : 0; }
  return Math.round(q * 1000) / 1000;
}

// ---------------------------------------------------------------- controls
async function klik(e) {
  const b = e.target.closest('button');
  if (!b || !STAV) return;
  const { pisen, vyber } = STAV;
  if (b.dataset.delka) return uprav(E.nastavDelku(pisen, vyber, b.dataset.delka), 'délka');
  switch (b.dataset.akce) {
    case 'zpet': return historie(-1);
    case 'znovu': return historie(1);
    case 'zavrit':
      if (STAV.zmeneno && !confirmZavrit()) return;
      return zavri();
    case 'ulozit': {
      try {
        await STAV.volby.onUloz(kopie(STAV.pisen));
        STAV.zmeneno = false;
        info(t('editor.ulozeno'));
        // the button itself says it for a moment (the line under the notes is easy to miss)
        clearTimeout(b._ulozeno);
        b.textContent = t('editor.ulozeno').replace(/[.。।]$/u, '') + ' ✓';
        b._ulozeno = setTimeout(() => { b.textContent = t('editor.ulozit'); }, 2000);
      } catch (err) { info(t('editor.ulozeniSelhalo', { chyba: err.message || err })); }
      return;
    }
    case 'vlozit': {
      const n = E.vybranaNota(pisen, vyber);
      return uprav(E.vlozZa(pisen, vyber, { t: n && n.t !== 'r' ? n.t : 'C4', d: n?.d || '1/4' }), 'vložit notu');
    }
    case 'taktPridat': {
      const za = vyber ? vyber.takt : pisen.takty.length - 1;
      const r = E.vlozTakt(pisen, za, 'pomlky');
      if (!r.chyba) STAV.nejiste = new Set([...STAV.nejiste].map(t => (t > za ? t + 1 : t)));    // the selection moves with the bars
      return uprav(r, 'přidat takt');
    }
    case 'taktSmazat': {
      if (!vyber) return;
      const r = E.smazTakt(pisen, vyber.takt, vyber);
      if (!r.chyba) STAV.nejiste = new Set([...STAV.nejiste].filter(t => t !== vyber.takt).map(t => (t > vyber.takt ? t - 1 : t)));
      return uprav(r, 'smazat takt');
    }
    case 'triola': return uprav(E.proved('triola', pisen, vyber), 'triola');
    default:
      if (b.dataset.akce) return uprav(E.proved(b.dataset.akce, pisen, vyber), b.dataset.akce);
  }
}
// confirmation without a blocking dialog: a second tap on Close within 3 s closes without saving
let zavritCas = 0;
function confirmZavrit() {
  if (Date.now() - zavritCas < 3000) return true;
  zavritCas = Date.now();
  info(t('editor.neulozeneZmeny'));
  return false;
}
function klavesa(e) {
  if (!STAV) return;
  if (e.target instanceof Element && e.target.matches('input, select, textarea')) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  const nazev = E.klavesovaZkratka(e.key, { shift: e.shiftKey, alt: e.altKey, meta: e.metaKey, ctrl: e.ctrlKey, kod: e.code });
  if (!nazev) return;
  e.preventDefault(); e.stopPropagation();
  if (nazev === 'zpet') return historie(-1);
  if (nazev === 'znovu') return historie(1);
  uprav(E.proved(nazev, STAV.pisen, STAV.vyber), ['dalsi', 'predchozi'].includes(nazev) ? null : nazev);
  if (['dalsi', 'predchozi'].includes(nazev)) zahrajVybranou();
}
function klikNaNoty(e) {
  const g = e.target.closest('g.note, g.chord, g.rest, g.mRest');
  if (!g) return;
  const v = STAV.mapa[g.id] || STAV.mapa[g.closest('g.chord')?.id];
  if (!v) return;
  STAV.vyber = v;
  zvyrazni();
  zahrajVybranou();
}

// ---------------------------------------------------------------- rendering
async function vykresli() {
  const s = STAV;
  const gen = s.gen = (s.gen || 0) + 1;                   // only the latest render may overwrite the score and the map
  const box = s.el.querySelector('.editor-noty');
  const tk = await s.volby.verovioTk();
  if (STAV !== s || s.gen !== gen) return;
  const sirka = Math.max(600, box.clientWidth - 24);
  tk.setOptions({ pageWidth: Math.round(sirka * 100 / 45), pageHeight: 60000, scale: 45, breaks: 'auto', header: 'none',
    footer: 'none', adjustPageHeight: true, svgViewBox: true, pageMarginLeft: 40, pageMarginRight: 40, pageMarginTop: 30,
    adjustPageWidth: false, spacingLinear: 0.25, spacingNonLinear: 0.6, lyricSize: 4 });
  // the part name (Melodie/Klavír in the MusicXML) is not shown, as in the game: it would be Czech in every language
  const xml = naMusicXml(s.pisen).replace(/<part-name>[^<]*<\/part-name>/g, '<part-name print-object="no"></part-name>');
  if (!tk.loadData(xml)) { box.innerHTML = `<p class="chyba">${tt('editor.nejdeVykreslit')}</p>`; return; }
  const svgs = [];
  for (let i = 1; i <= tk.getPageCount(); i++) svgs.push(tk.renderToSVG(i));
  if (STAV !== s) return;
  box.innerHTML = svgs.join('');
  s.mapa = mapaUdalosti(new DOMParser().parseFromString(tk.getMEI(), 'application/xml'));
  zvyrazni();
}
/** MEI → { element id: { takt, index, ruka } } (order of events in the layer = order of notes in the model) */
function mapaUdalosti(mei) {
  const mapa = {};
  [...mei.getElementsByTagName('measure')].forEach((m, takt) => {
    for (const st of m.getElementsByTagName('staff')) {
      const ruka = st.getAttribute('n') === '2' ? 'l' : 'p';
      const layer = st.getElementsByTagName('layer')[0];
      if (!layer) continue;
      let index = -1;
      const projdi = el => {
        for (const c of el.children) {
          const tag = c.localName;
          if (tag === 'chord') { index++; mapa[c.getAttribute('xml:id')] = { takt, index, ruka };
            for (const n of c.getElementsByTagName('note')) mapa[n.getAttribute('xml:id')] = { takt, index, ruka }; }
          else if (tag === 'note' || tag === 'rest' || tag === 'mRest') { index++; mapa[c.getAttribute('xml:id')] = { takt, index, ruka }; }
          else projdi(c);                                   // beam, tuplet …
        }
      };
      projdi(layer);
    }
  });
  return mapa;
}
function zvyrazni() {
  const s = STAV;
  const box = s.el.querySelector('.editor-noty');
  box.querySelectorAll('.vybrana, .nejisty, .spatny').forEach(x => x.classList.remove('vybrana', 'nejisty', 'spatny'));
  const stav = E.stavTaktu(s.pisen);
  for (const [id, v] of Object.entries(s.mapa)) {
    const g = document.getElementById(id);
    if (!g || g.closest('g.chord') && g.matches('g.note')) continue;
    if (s.vyber && v.takt === s.vyber.takt && v.index === s.vyber.index && v.ruka === s.vyber.ruka) g.classList.add('vybrana');
    if (s.nejiste.has(v.takt)) g.classList.add('nejisty');
    if (!stav[v.takt]?.ok) g.classList.add('spatny');
  }
  box.querySelector('.vybrana')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const n = E.vybranaNota(s.pisen, s.vyber);
  s.el.querySelector('.editor-slabika').value = n?.s || '';
  const ak = s.vyber ? (s.pisen.takty[s.vyber.takt].akordy || []).find(a => Math.abs(a.doba - polohaNoty(s.vyber)) < 1e-3) : null;
  s.el.querySelector('.editor-akord').value = ak ? znackaAkordu(ak.znacka) : '';
  s.el.querySelector('[data-akce="zpet"]').disabled = !E.muzeZpet(s.historie);
  s.el.querySelector('[data-akce="znovu"]').disabled = !E.muzeZnovu(s.historie);
  const spatne = stav.filter(x => !x.ok).length;
  s.el.querySelector('.editor-stav').textContent = (spatne ? t('editor.spatneTakty', { n: spatne }) : t('editor.taktySedi'))
    + (s.nejiste.size ? ' · ' + t('editor.nejisteTakty', { n: s.nejiste.size }) : '');
  info();
}
/** chord symbol in the chosen note-name system: root H/B (without accidental) is H in Czech, B in English */
function znackaAkordu(z) {
  const a = akordZnacky(z);
  return a && a.koren === 'B' && !a.alter ? (soustava() === 'cs' ? 'H' : 'B') + z.slice(1) : z;
}
/** note pitch ('F#4', chord 'C4 E4') in the chosen system: Czech Fis4, H4, B4; English F#4, B4, Bb4 */
function nazevVysky(vyska) {
  return String(vyska).split(/\s+/).map(x => {
    const m = x.match(/^([A-H])(#{1,2}|b{1,2})?(-?\d)$/);
    if (!m) return x;
    const krok = m[1] === 'H' ? 'b' : m[1].toLowerCase();
    return nazevKroku(krok, { '#': 1, '##': 2, b: -1, bb: -2 }[m[2]] || 0) + m[3];
  }).join(' ');
}
function info(zprava = '') {
  const s = STAV;
  if (!s) return;
  const n = E.vybranaNota(s.pisen, s.vyber);
  const st = s.vyber ? E.stavTaktu(s.pisen)[s.vyber.takt] : null;
  // bar notes only for the selected bar, general ones (without a bar number) always
  const pozn = (s.volby.poznamky || []).filter(p => !/(?:takt|bar) \d/.test(p)
    || (s.vyber && new RegExp(`(?:takt|bar) ${s.vyber.takt + 1}\\b`).test(p)));
  s.el.querySelector('.editor-info').innerHTML = [
    zprava && `<b>${esc(zprava)}</b>`,
    s.volby.varovani && `<span class="nejisty-text">${esc(s.volby.varovani)}</span>`,
    n && tt('editor.infoNota', { takt: s.vyber.takt + 1, ruka: s.vyber.ruka === 'l' ? t('editor.infoLevaRuka') : '',
      nota: s.vyber.index + 1, vyska: n.t === 'r' ? t('editor.pomlka') : nazevVysky(n.t), delka: n.d,
      slabika: n.s ? t('editor.infoSlabika', { slabika: n.s }) : '' }),
    st && !st.ok && `<span class="chyba">${esc(st.zprava)}</span>`,
    s.nejiste.has(s.vyber?.takt) && `<span class="nejisty-text">${tt('editor.nejistyTakt')}</span>`,
    ...pozn.map(p => `<span class="nejisty-text">${esc(p)}</span>`),
    s.porovnani && `<span class="porovnani">${esc(s.porovnani).replace(/\n/g, '<br>')}</span>`,
  ].filter(Boolean).join(' · ');
}
