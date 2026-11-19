// Notes for playing from Verovio: from MusicXML (the simplified model, or the original file for the "Original" level)
// we get an SVG on a single line and a list of notes with times, staff and bar. The caller supplies the Verovio toolkit
// (in the browser and in tests).
import { tonyAkordu } from './song.js';
import { nazevKroku } from './note_names.js';
import { t } from './texts.js';
import { stupenNoty } from './mistakes.js';

const ALTER = { s: 1, f: -1, ss: 2, x: 2, ff: -2 };
/** note name from MEI (pname, accidental) in the naming system chosen in the app (Cis / C#) */
export function jmenoNoty(pname, acc) {
  return nazevKroku(pname, ALTER[acc] || 0);
}

/** Verovio options for notes on a single line (set every time – the toolkit is shared with the editor) */
export const VOLBY_RADKU = { breaks: 'none', adjustPageHeight: true, adjustPageWidth: true, header: 'none', footer: 'none',
  svgViewBox: true, pageMarginLeft: 60, pageMarginRight: 400, pageMarginTop: 20, pageMarginBottom: 20,
  lyricSize: 3.4, spacingLinear: 0.35, spacingNonLinear: 0.62, scale: 100, pageWidth: 2100, pageHeight: 2970 };

/** MEI key signature ('0', '2s', '3f') → fifths; null when it can't be read ('mixed' …) */
function kvinty(sig) {
  const m = /^(\d+)([sf]?)$/.exec(String(sig ?? '').trim());
  return m ? (m[2] === 'f' ? -1 : 1) * Number(m[1]) : null;
}
const nadrazeny = (el, jmena) => {
  for (let p = el.parentNode; p && p.nodeType === 1; p = p.parentNode) if (jmena.includes(p.localName || p.nodeName)) return p;
  return null;
};
/**
 * The key valid at each note (fifths, null = unknown), walking the MEI in order: a key in a scoreDef applies to all
 * staves, one in a staffDef or inside a staff only to that staff.
 */
function toninyNot(mei) {
  const out = {}, podleOsnovy = {};
  let vse = null;
  for (const el of [...mei.getElementsByTagName('*')]) {
    const jm = el.localName || el.nodeName;
    const sig = jm === 'keySig' ? el.getAttribute('sig')
      : (jm === 'scoreDef' || jm === 'staffDef') ? (el.getAttribute('keysig') || el.getAttribute('key.sig') || null) : null;
    if (sig != null) {
      const v = kvinty(sig);
      const vlastnik = jm === 'keySig' ? nadrazeny(el, ['scoreDef', 'staffDef', 'staff']) : el;
      if (!vlastnik) continue;
      if ((vlastnik.localName || vlastnik.nodeName) === 'scoreDef') { vse = v; for (const k in podleOsnovy) delete podleOsnovy[k]; }
      else podleOsnovy[vlastnik.getAttribute('n') || '1'] = v;
    } else if (jm === 'note') {
      const n = nadrazeny(el, ['staff'])?.getAttribute('n') || '1';
      out[el.getAttribute('xml:id')] = n in podleOsnovy ? podleOsnovy[n] : vse;
    }
  }
  return out;
}

const UROVNE_DYN = { ppp: 'pp', pp: 'pp', p: 'p', mp: 'mp', mf: 'mf', f: 'f', ff: 'ff', fff: 'ff' };
/**
 * Dynamics from the notes (pp…ff marks in MEI) → n.dyn on each note: the last mark before the note. A piano mark
 * applies to both hands (it is usually only on one staff). sf, fp and hairpins are ignored – they aren't lasting levels.
 */
function priradDynamiku(mei, noty, zacatkyTaktu) {
  const qPodleId = Object.fromEntries(noty.map(n => [n.id, n.q]));
  const znacky = [];
  let jednotka = 4, takt = -1;
  for (const el of [...mei.getElementsByTagName('*')]) {
    const jm = el.localName || el.nodeName;
    if (jm === 'meterSig' && el.getAttribute('unit')) jednotka = Number(el.getAttribute('unit')) || 4;
    else if ((jm === 'scoreDef' || jm === 'staffDef') && el.getAttribute('meter.unit')) jednotka = Number(el.getAttribute('meter.unit')) || 4;
    else if (jm === 'measure') takt++;
    else if (jm === 'dynam' && takt >= 0) {
      const uroven = UROVNE_DYN[(el.textContent || '').trim().toLowerCase()];
      if (!uroven) continue;
      const start = (el.getAttribute('startid') || '').replace('#', '');
      const q = start in qPodleId ? qPodleId[start]
        : (zacatkyTaktu[takt] ?? 0) + (Number(el.getAttribute('tstamp') || 1) - 1) * 4 / jednotka;
      znacky.push({ q, uroven });
    }
  }
  if (!znacky.length) return;
  znacky.sort((a, b) => a.q - b.q);
  for (const n of noty) {
    let d = null;
    for (const z of znacky) { if (z.q <= n.q + 1e-6) d = z.uroven; else break; }
    if (d) n.dyn = d;
  }
}

/** options for a whole page: lines (systems) stacked to the window width, everything on one long page */
export function volbyStranky(sirkaPx = 1200) {
  const meritko = 55;                                  // note size; the page width is converted to Verovio units
  return { ...VOLBY_RADKU, breaks: 'auto', adjustPageWidth: false, scale: meritko,
    pageWidth: Math.max(800, Math.round(sirkaPx * 100 / meritko)), pageHeight: 60000,
    pageMarginLeft: 40, pageMarginRight: 40, pageMarginTop: 30, pageMarginBottom: 30, spacingSystem: 14 };
}

/**
 * MusicXML → { svg, noty: [{ id, q, ms, pitch, dur, staff, takt, jmeno, stupen, predznamenani }], akordy, takty (q of
 * bar starts), konecQ, mapa, tempo, osnovy }. stupen = diatonic step of the written note, predznamenani = the key valid
 * at it (fifths, null = unknown) – Show mistakes places wrong keys from them, whatever the clef. Grace notes and tie continuations are not played; notes of all voices are. `model` (unrolled,
 * with the same number of bars) supplies chord symbols for the accompaniment, and the tempo when the file has none.
 */
export function zpracujVerovio(tk, xml, model, volby = {}) {
  tk.setOptions(volby.stranka ? volbyStranky(volby.sirka) : VOLBY_RADKU);
  if (!tk.loadData(xml)) throw new Error(t('cviceni.chyba.vykresleni'));
  const svg = tk.renderToSVG(1);
  const tm = tk.renderToTimemap({ includeMeasures: true });
  const mei = new DOMParser().parseFromString(tk.getMEI(), 'application/xml');
  const ligatury = [...mei.getElementsByTagName('tie')].map(t => [(t.getAttribute('startid') || '').replace('#', ''), (t.getAttribute('endid') || '').replace('#', '')]);
  const konceLigatur = new Set(ligatury.map(l => l[1]));
  const dalsiVLigature = Object.fromEntries(ligatury);
  const delkaSLigaturou = id => {                        // note duration including tied continuations
    let d = 0, x = id, ochrana = 0;
    while (x && ochrana++ < 32) { d += tk.getMIDIValuesForElement(x)?.duration || 0; x = dalsiVLigature[x]; }
    return d;
  };
  const info = {}, taktId = {};
  [...mei.getElementsByTagName('measure')].forEach((m, ti) => {
    taktId[m.getAttribute('xml:id')] = ti;
    for (const st of m.getElementsByTagName('staff')) {
      const n = Number(st.getAttribute('n') || 1);
      for (const nt of st.getElementsByTagName('note')) {
        let acc = nt.getAttribute('accid') || nt.getAttribute('accid.ges');
        for (const a of nt.getElementsByTagName('accid')) acc = acc || a.getAttribute('accid') || a.getAttribute('accid.ges');
        info[nt.getAttribute('xml:id')] = { staff: n, pname: nt.getAttribute('pname'), acc, takt: ti,
          grace: nt.hasAttribute('grace'), tie: nt.getAttribute('tie') };
      }
    }
  });
  const tonina = toninyNot(mei);
  const tempo = model?.tempo > 0 ? model.tempo : (tm.find(e => 'tempo' in e)?.tempo || 100);
  const noty = [], mapa = [], zacatkyTaktu = [];
  for (const e of tm) {
    mapa.push([e.qstamp, e.tstamp]);
    if (e.measureOn && taktId[e.measureOn] != null) zacatkyTaktu[taktId[e.measureOn]] = e.qstamp;
    for (const id of e.on || []) {
      const nf = info[id];
      if (!nf || nf.grace || konceLigatur.has(id) || nf.tie === 'm' || nf.tie === 't') continue;
      const mv = tk.getMIDIValuesForElement(id);
      if (!mv || mv.pitch == null) continue;
      noty.push({ id, q: e.qstamp, ms: e.tstamp, pitch: mv.pitch, dur: Math.max(delkaSLigaturou(id) || mv.duration || 300, 60),
        staff: nf.staff, takt: nf.takt, jmeno: jmenoNoty(nf.pname, nf.acc), stupen: stupenNoty(nf.pname, mv.pitch),
        predznamenani: tonina[id] ?? null });
    }
  }
  if (!noty.length) throw new Error(t('cviceni.chyba.prazdnaPisen'));
  const konecQ = tm.length ? tm[tm.length - 1].qstamp : 0;
  const pocetTaktu = Math.max(model?.takty?.length || 0, Object.keys(taktId).length);
  for (let i = 0; i < pocetTaktu; i++) if (zacatkyTaktu[i] == null) zacatkyTaktu[i] = zacatkyTaktu[i - 1] ?? 0;
  priradDynamiku(mei, noty, zacatkyTaktu);
  const akordy = [];
  (model?.takty || []).forEach((t, i) => (t.akordy || []).forEach(a => {
    const ta = tonyAkordu(a.znacka);
    if (ta) akordy.push({ q: zacatkyTaktu[i] + (Number(a.doba) || 0), pc: ta.koren, bas: ta.bas, tony: ta.tony, takt: i });
  }));
  akordy.sort((x, y) => x.q - y.q);
  return { nazev: model?.nazev || '', stranka: !!volby.stranka, svg, noty, akordy, takty: zacatkyTaktu, konecQ, mapa, tempo,
    osnovy: [...new Set(noty.map(n => n.staff))].sort((a, b) => a - b) };
}
