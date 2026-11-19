// Educational extras (lib/extras.js) in the UI: song guide, question about a note, expression, new song,
// weekly summary and the Echo game. The code composes the texts from facts about the song and the practice.
import * as D from '../lib/extras.js';
import { jakaTonina } from '../lib/levels.js';
import { t } from '../lib/texts.js';
import { nazevKroku } from '../lib/note_names.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let CTX = null;
/** ctx: { S, audio, hlas, toast, profil(), pridejPisen(pisen) } */
export function nastav(ctx) { CTX = ctx; }

// ---------------------------------------------------------------- extra's window
function okno(nadpis) {
  zavri();
  const el = document.createElement('div');
  el.className = 'modal doplnek';
  el.innerHTML = `<div class="karta siroka"><h2>${esc(nadpis)}</h2><div class="obsah"></div>
    <div class="tlacitka"><button class="tlacitko sekundarni" data-zavrit>${esc(t('doplnky.ui.zavrit'))}</button></div></div>`;
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-zavrit]')) zavri(); });
  document.body.appendChild(el);
  return el;
}
export function zavri() { document.querySelector('.modal.doplnek')?.remove(); }

/** text from a template/model result (string, {odstavce, tipy}, {veta}, {odpoved}) */
function html(v) {
  if (v == null) return '';
  if (typeof v === 'string') return `<p>${esc(v)}</p>`;
  const casti = [];
  for (const k of ['odstavce', 'body']) if (Array.isArray(v[k])) casti.push(...v[k].map(x => `<p>${esc(x)}</p>`));
  for (const k of ['veta', 'odpoved', 'text', 'shrnuti']) if (typeof v[k] === 'string' && v[k]) casti.push(`<p>${esc(v[k])}</p>`);
  for (const k of ['tipy', 'priste', 'doporuceni']) if (Array.isArray(v[k]) && v[k].length) casti.push(`<ul>${v[k].map(x => `<li>${esc(x)}</li>`).join('')}</ul>`);
  return casti.join('') || `<p>${esc(JSON.stringify(v))}</p>`;
}
const ukaz = (el, vysledek) => { el.querySelector('.obsah').innerHTML = html(vysledek); };
const pasmo = () => CTX.profil()?.vek || 'dite';

// ---------------------------------------------------------------- song guide
export function pruvodcePisne() {
  const S = CTX.S;
  const F = D.faktaPisne(S.model, { pasmo: pasmo(), text: true });
  const el = okno(t('doplnky.ui.oPisnicce', { nazev: S.model.nazev || '' }));
  ukaz(el, D.sablonaPruvodce(F, pasmo()));
}

// ---------------------------------------------------------------- question about a note
/** note in the expanded model from a Verovio element (id) → { takt, index, ruka } */
export function notaModelu(n) {
  const S = CTX.S;
  const t = S.model.takty[n.takt];
  if (!t) return null;
  const ruka = n.staff === 2 ? 'leva' : 'prava';
  const noty = (ruka === 'leva' ? t.leva : t.noty) || [];
  const pos = n.q - (S.data.takty[n.takt] || 0);
  let q = 0;
  for (let i = 0; i < noty.length; i++) {
    if (Math.abs(q - pos) < 1e-3) return { takt: n.takt, index: i, ruka };
    const m = String(noty[i].d).match(/^(\d+)\/(\d+)$/);
    q += m ? 4 * m[1] / m[2] : 0;
  }
  return null;
}
export function otazkaNaNotu(kde) {
  const S = CTX.S;
  const F = D.faktaNoty(S.model, kde.takt, kde.index, kde.ruka, { pasmo: pasmo() });
  if (!F) return;
  const el = okno(t('doplnky.ui.otazky'));
  const otazky = D.otazkyProNotu(F);
  const obsah = el.querySelector('.obsah');
  const odpoved = document.createElement('div');
  obsah.innerHTML = `<div class="otazky">${otazky.map(o => `<button class="prepinac" data-o="${o.id}">${esc(o.text)}</button>`).join('')}</div>`;
  obsah.appendChild(odpoved);
  const zeptej = otazka => { odpoved.innerHTML = html(D.odpovedSablonou(F, otazka)); };
  obsah.querySelectorAll('[data-o]').forEach(b => b.onclick = () => zeptej(otazky.find(o => o.id === b.dataset.o)));
  zeptej(otazky[0]);
}

// ---------------------------------------------------------------- expression
export function prednes(zaznam) {
  const S = CTX.S;
  const F = D.faktaPrednesu(zaznam, S.model, { pasmo: pasmo() });
  const el = okno(t('doplnky.ui.prednes'));
  ukaz(el, D.sablonaPrednesu(F));
}

// ---------------------------------------------------------------- weekly summary
export function tydenniSouhrn() {
  const S = CTX.S, pid = S.profil || 'host', p = CTX.profil();
  const doK = Date.now(), od = doK - 7 * 24 * 3600 * 1000;
  // stats per song with a readable name (the key is "file#level"); practice minutes are not measured yet
  const nazvy = Object.fromEntries((S.seznam || []).map(x => [x.soubor, x.nazev]));
  const stat = Object.entries(S.statistiky?.[pid] || {}).map(([klic, statistika]) => ({
    klic, nazev: nazvy[klic.split('#')[0]] || klic.split('#')[0].replace(/\.[^.]+$/, ''), statistika }));
  const F = D.faktaTydne(stat, [], od, doK, { pasmo: pasmo() });
  const el = okno(p ? t('doplnky.ui.tydenJmeno', { jmeno: p.jmeno }) : t('doplnky.ui.tyden'));
  ukaz(el, D.sablonaTydne(F));
}

// ---------------------------------------------------------------- new song made to measure
export function novaPisen() {
  const el = okno(t('doplnky.ui.vymysli'));
  const dite = pasmo() === 'dite';
  const temata = D.temata();
  const petTonu = ['c', 'd', 'e', 'f', 'g'].map(k => nazevKroku(k)).join(' ');
  el.querySelector('.obsah').innerHTML = `
    <label class="popis-pole">${esc(t('doplnky.ui.oCem'))}
      ${dite ? `<select class="pole np-tema">${temata.map(x => `<option>${esc(x)}</option>`).join('')}</select>`
        : `<input class="pole np-tema" maxlength="60" placeholder="${esc(t('doplnky.ui.oCemPriklad'))}" list="np-temata">
           <datalist id="np-temata">${temata.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`}
    </label>
    <label class="popis-pole">${esc(t('doplnky.ui.tony'))}
      <select class="pole np-tony"><option value="5">${esc(t('doplnky.ui.tonyPet', { tony: petTonu }))}</option><option value="8">${esc(t('doplnky.ui.tonyStupnice', { ton: nazevKroku('c') }))}</option></select>
    </label>
    <label class="popis-pole">${esc(t('doplnky.ui.takt'))}
      <select class="pole np-takt"><option>4/4</option><option>3/4</option><option>2/4</option></select>
    </label>
    <div class="tlacitka"><button class="tlacitko np-vytvor">${esc(t('doplnky.ui.vytvorit'))}</button></div>
    <p class="napoveda np-stav"></p>`;
  el.querySelector('.np-vytvor').onclick = async () => {
    const tony = el.querySelector('.np-tony').value === '5' ? ['C', 'D', 'E', 'F', 'G'] : ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const omezeni = { tema: el.querySelector('.np-tema').value, tony, takt: el.querySelector('.np-takt').value, taktu: 8,
      pasmo: pasmo(), zakazanaSlova: (CTX.S.profily || []).map(p => p.jmeno) };
    const stav = el.querySelector('.np-stav');
    const pisen = D.sablonaNovePisne(omezeni, Date.now() % 100000);
    if (!pisen.nazev) pisen.nazev = t('doplnky.ui.pisnickaTema', { tema: omezeni.tema });
    stav.textContent = t('doplnky.ui.ukladam');
    try {
      await CTX.pridejPisen(pisen);
      zavri();
      CTX.toast(t('doplnky.ui.ulozeno', { nazev: pisen.nazev }), 5000);
    } catch (e) { stav.textContent = t('doplnky.ui.chybaUlozeni', { chyba: e.message || e }); }
  };
}

// ---------------------------------------------------------------- Echo (Ozvěna)
const OZ = { aktivni: false, motiv: null, zahrane: [], t0: 0, casovac: 0 };
export const ozvenaAktivni = () => OZ.aktivni;
export function ozvena() {
  const S = CTX.S;
  const el = okno(t('doplnky.ui.ozvena'));
  el.querySelector('.obsah').innerHTML = `<p>${esc(t('doplnky.ui.ozvenaPopis'))}</p>
    <div class="tlacitka"><button class="tlacitko oz-hraj">${esc(t('doplnky.ui.zahrajMi'))}</button><button class="tlacitko sekundarni oz-dalsi">${esc(t('doplnky.ui.jinyKousek'))}</button></div>
    <p class="oz-stav hlaska"></p>`;
  const novy = () => {
    OZ.motiv = D.motiv(S.model, { uroven: Math.min(4, Math.max(1, S.uroven - 1)), seed: Math.floor(Math.random() * 1e6) })
      || D.nahodnyMotiv(jakaTonina(S.model), Math.floor(Math.random() * 1e6), 1);
  };
  const stav = h => { el.querySelector('.oz-stav').innerHTML = h; };
  const prehraj = () => {
    if (!OZ.motiv) novy();
    const ac = CTX.audio(), t0 = ac.currentTime + 0.2;
    OZ.motiv.noty.forEach(n => CTX.hlas(n.midi, t0 + n.ms / 1000, n.delkaMs / 1000 * 0.9, 0.7));
    const konec = Math.max(...OZ.motiv.noty.map(n => n.ms + n.delkaMs));
    stav(esc(t('doplnky.ui.poslouchej')));
    OZ.aktivni = false;
    setTimeout(() => { OZ.aktivni = true; OZ.zahrane = []; stav(esc(t('doplnky.ui.tedTy'))); }, konec + 400);
  };
  el.querySelector('.oz-hraj').onclick = prehraj;
  el.querySelector('.oz-dalsi').onclick = () => { novy(); prehraj(); };
  const puvodniZavri = el.querySelector('[data-zavrit]');
  puvodniZavri.addEventListener('click', () => { OZ.aktivni = false; });
  OZ.vyhodnot = () => {
    OZ.aktivni = false;
    const r = D.porovnejOzvenu(OZ.motiv, OZ.zahrane, { oktava: true });
    stav(`${r.trefa ? '🎉 ' : ''}${esc(r.popis)}`);
  };
  novy();
}
/** a note from the player during Echo (from the piano, the screen or the microphone) */
export function ozvenaTon(midi) {
  if (!OZ.aktivni) return false;
  const ted = performance.now();
  if (!OZ.zahrane.length) OZ.t0 = ted;
  OZ.zahrane.push({ midi, ms: ted - OZ.t0 });
  clearTimeout(OZ.casovac);
  if (OZ.zahrane.length >= OZ.motiv.noty.length) OZ.casovac = setTimeout(OZ.vyhodnot, 300);
  else OZ.casovac = setTimeout(OZ.vyhodnot, 3000);         // long pause = end of the attempt
  return true;
}
