// The original MusicXML for the "Original" level: notes are drawn and played from the original file (all voices,
// dynamics, slurs, pedal, grace notes, key, time and clef changes), not from the simplified model. Repeats are unrolled
// the same way as in the model (order from rozvin() in song.js) so that bars match the statistics and sections.
// Needs globalThis.DOMParser and XMLSerializer (the browser has them, tests supply them from @xmldom/xmldom).
import { t } from './texts.js';

const deti = (el, jmeno) => [...el.childNodes].filter(n => n.nodeType === 1 && n.nodeName === jmeno);
const dite = (el, jmeno) => deti(el, jmeno)[0] || null;

/** attribute state valid at a given point: divisions, key signature, time, clefs per staff, number of staves */
function prectiAtributy(attr, stav) {
  const s = { ...stav, klice: { ...stav.klice } };
  for (const el of [...attr.childNodes].filter(n => n.nodeType === 1)) {
    if (el.nodeName === 'divisions') s.divisions = el.textContent.trim();
    else if (el.nodeName === 'key' && !el.getAttribute('number')) s.key = el;
    else if (el.nodeName === 'time' && !el.getAttribute('number')) s.time = el;
    else if (el.nodeName === 'staves') s.staves = el.textContent.trim();
    else if (el.nodeName === 'clef') s.klice[el.getAttribute('number') || '1'] = el;
  }
  return s;
}
const podpis = el => (el ? new XMLSerializer().serializeToString(el) : '');
const stejne = (a, b) => a.divisions === b.divisions && podpis(a.key) === podpis(b.key) && podpis(a.time) === podpis(b.time)
  && a.staves === b.staves && Object.keys({ ...a.klice, ...b.klice }).every(k => podpis(a.klice[k]) === podpis(b.klice[k]));

/**
 * Original MusicXML → MusicXML with only the first part, bars in the order `poradi` (indexes of the original bars as
 * returned by rozvin()), without repeat barlines, voltas and jumps. Where the state changed after a jump (key, time,
 * clef, divisions), the attributes valid there are inserted at the start of the bar. Part names are not drawn.
 */
export function pripravOriginal(xml, poradi) {
  let doc;
  try { doc = new DOMParser().parseFromString(xml, 'application/xml'); }
  catch (e) { throw new Error(t('cviceni.chyba.necitelneXml'), { cause: e }); }
  const koren = doc.documentElement;
  if (!koren || koren.nodeName === 'parsererror' || doc.getElementsByTagName('parsererror').length) throw new Error(t('cviceni.chyba.necitelneXml'));
  if (koren.nodeName !== 'score-partwise') throw new Error(t('cviceni.chyba.jenPartwise'));
  const party = deti(koren, 'part');
  if (!party.length) throw new Error(t('cviceni.chyba.zadneNoty'));
  const part = party[0], id = part.getAttribute('id');
  party.slice(1).forEach(p => koren.removeChild(p));
  const seznam = dite(koren, 'part-list');
  if (seznam) {
    for (const sp of deti(seznam, 'score-part')) if (sp.getAttribute('id') !== id) seznam.removeChild(sp);
    for (const g of deti(seznam, 'part-group')) seznam.removeChild(g);
    for (const sp of deti(seznam, 'score-part')) {
      for (const jm of ['part-name', 'part-abbreviation']) {
        const el = dite(sp, jm);
        if (el) { el.textContent = ''; el.setAttribute('print-object', 'no'); }
      }
      for (const jm of ['part-name-display', 'part-abbreviation-display']) { const el = dite(sp, jm); if (el) sp.removeChild(el); }
    }
  }
  for (const c of deti(koren, 'credit')) koren.removeChild(c);

  const takty = deti(part, 'measure');
  // state at the start and at the end of each original bar
  const zacatek = [], konec = [];
  let stav = { klice: {} };
  for (const m of takty) {
    zacatek.push(stav);
    for (const a of deti(m, 'attributes')) stav = prectiAtributy(a, stav);
    konec.push(stav);
  }
  const poradiOk = (poradi && poradi.length ? poradi : takty.map((_, i) => i)).filter(i => i >= 0 && i < takty.length);
  takty.forEach(m => part.removeChild(m));
  let posledni = null;
  poradiOk.forEach((i, j) => {
    const m = takty[i].cloneNode(true);
    m.setAttribute('number', String(j + 1));
    m.removeAttribute('implicit');
    if (i === 0 && j === 0 && takty[0].getAttribute('implicit') === 'yes') m.setAttribute('implicit', 'yes');
    // repeats, voltas and jumps are unrolled – Verovio would draw the marks needlessly (and might use them for timing)
    for (const b of deti(m, 'barline')) {
      for (const jm of ['repeat', 'ending', 'segno', 'coda']) for (const x of deti(b, jm)) b.removeChild(x);
      if (!deti(b, 'bar-style').length && ![...b.childNodes].some(n => n.nodeType === 1)) m.removeChild(b);
    }
    for (const d of deti(m, 'direction')) {
      const typ = dite(d, 'direction-type');
      const slova = typ ? deti(typ, 'words').map(w => w.textContent.trim().toLowerCase()) : [];
      const skok = typ && (deti(typ, 'segno').length || deti(typ, 'coda').length
        || slova.some(w => /^(d\.?\s?c\.?|d\.?\s?s\.?|da capo|dal segno|fine|to coda|al coda|al fine)/.test(w)));
      if (skok) m.removeChild(d);
    }
    for (const s of [...m.getElementsByTagName('sound')]) {
      for (const a of ['dacapo', 'dalsegno', 'segno', 'coda', 'tocoda', 'fine', 'forward-repeat']) s.removeAttribute(a);
    }
    for (const pr of deti(m, 'print')) m.removeChild(pr);            // line and page breaks from the original
    // after a jump, restore the attributes valid at the start of this bar
    if (posledni ? !stejne(posledni, zacatek[i]) : i !== 0) {
      const z = zacatek[i];
      const a = doc.createElement('attributes');
      const pridej = (jm, text) => { const e = doc.createElement(jm); e.textContent = text; a.appendChild(e); };
      if (z.divisions) pridej('divisions', z.divisions);
      if (z.key) a.appendChild(z.key.cloneNode(true));
      if (z.time) a.appendChild(z.time.cloneNode(true));
      if (z.staves) pridej('staves', z.staves);
      for (const k of Object.keys(z.klice).sort()) a.appendChild(z.klice[k].cloneNode(true));
      m.insertBefore(a, m.firstChild);
    }
    part.appendChild(m);
    posledni = konec[i];
  });
  return new XMLSerializer().serializeToString(doc);
}

const POSUVKY = { '-2': 'flat-flat', '-1': 'flat', 0: 'natural', 1: 'sharp', 2: 'double-sharp' };
const ZA_POSUVKOU = ['time-modification', 'stem', 'notehead', 'notehead-text', 'staff', 'beam', 'notations', 'lyric', 'play', 'listen'];
const alterVTonine = (krok, fifths) => fifths > 0 && 'FCGDAEB'.slice(0, fifths).includes(krok) ? 1
  : fifths < 0 && 'BEADGCF'.slice(0, -fifths).includes(krok) ? -1 : 0;

/**
 * Adds <accidental> marks when the file has none at all (older export of Rusalka and the skill). Otherwise Verovio
 * draws accidentals only from the key signature and would show E sharp as E. An accidental applies until the end of
 * the bar in its octave and staff; a tied note doesn't repeat it. Files with the marks (MuseScore, Audiveris) are unchanged.
 */
export function doplnPosuvky(xml) {
  if (/<accidental[\s>]/.test(xml)) return xml;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  let fifths = 0, zmena = false;
  for (const part of doc.getElementsByTagName('part')) {
    fifths = 0;
    for (const m of deti(part, 'measure')) {
      const platne = new Map();
      for (const el of [...m.childNodes].filter(n => n.nodeType === 1)) {
        if (el.nodeName === 'attributes') {
          const f = dite(el, 'key') && dite(dite(el, 'key'), 'fifths');
          if (f) fifths = Number(f.textContent) || 0;
          continue;
        }
        if (el.nodeName !== 'note') continue;
        const pitch = dite(el, 'pitch');
        if (!pitch) continue;
        const krok = dite(pitch, 'step')?.textContent.trim(), okt = dite(pitch, 'octave')?.textContent.trim();
        const alter = Math.round(Number(dite(pitch, 'alter')?.textContent || 0));
        if (deti(el, 'tie').some(t => t.getAttribute('type') === 'stop')) continue;
        const klic = (dite(el, 'staff')?.textContent.trim() || '1') + krok + okt;
        const plati = platne.has(klic) ? platne.get(klic) : alterVTonine(krok, fifths);
        platne.set(klic, alter);
        if (alter === plati || !POSUVKY[alter]) continue;
        const a = doc.createElement('accidental');
        a.textContent = POSUVKY[alter];
        el.insertBefore(a, [...el.childNodes].find(n => n.nodeType === 1 && ZA_POSUVKOU.includes(n.nodeName)) || null);
        zmena = true;
      }
    }
  }
  return zmena ? new XMLSerializer().serializeToString(doc) : xml;
}

/** in the English naming system, a B chord without the Czech label H (files from the Czech system have it on root-step/bass-step) */
export function bezCeskehoH(xml, soustava) {
  return soustava === 'cs' ? xml : xml.replace(/(<(?:root|bass)-step)\s+text="H"/g, '$1');
}

/** adds a tempo mark to the start of the MusicXML when the file has none (Verovio would play at 120 otherwise) */
export function doplnTempo(xml, tempo) {
  if (!(tempo > 0) || /<sound[^>]*\btempo=/.test(xml)) return xml;
  return xml.replace(/(<measure\b[^>]*>)/, `$1<sound tempo="${tempo}"/>`);
}
