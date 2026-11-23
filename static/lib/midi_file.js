// Reading MIDI files (Standard MIDI File, format 0 and 1) and converting selected tracks to the song model (see song.js).
// Pure functions without DOM. The conversion is deterministic: quantisation to a grid, the top voice as the melody,
// splitting into bars with ties, guessing the key signature, the pickup bar and lyric syllables (karaoke files).
import { naZlomek, naPresnyZlomek, metrum, rozlozDelku, zMidi } from './song.js';
import { t as tx } from './texts.js';
import { nazevTonu } from './note_names.js';
import { jakaTonina } from './levels.js';

// General MIDI instrument families, eight programs each (text keys editor.midi.rodina.*)
const RODINY = ['klavir', 'zvonkohra', 'varhany', 'kytara', 'baskytara', 'smycce', 'soubor', 'zeste', 'saxofon',
  'fletna', 'syntezator', 'syntezator', 'syntezator', 'lidovy', 'perkuse', 'efekty'];
const NAZVY_MELODIE = /melod|lead|vocal|voice|zp[eě]v|sing|solo|right|prav|r\.?\s*h\b|melody/i;
const NAZVY_LEVE = /left|lev[aá]|l\.?\s*h\b|bass|bas[ay]?\b|doprovod|accomp/i;

/** Use one encoding for all the file's text events. For ambiguous legacy bytes prefer Windows-1252. */
function dekoderTextu(bajty) {
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  try {
    for (const b of bajty) utf8.decode(b);
    return utf8;
  } catch { /* compare the same bytes in both legacy encodings */ }
  const stredni = new TextDecoder('windows-1250'), zapadni = new TextDecoder('windows-1252');
  const cetnost = (s, vzor) => (s.match(vzor) || []).length;
  let skore = 0;
  for (const b of bajty) {
    const a = stredni.decode(b), z = zapadni.decode(b);
    if (a === z) continue;
    skore += 3 * cetnost(a, /[ěščřžůďťňĺľąłńźśżęćűő]/gi) - 2 * cetnost(a, /[čšž]/gi)
      - 3 * cetnost(z, /[œæñßðþ]/gi) - cetnost(z, /[èàùòì]/gi)
      + 4 * (cetnost(z, /[\u0080-\u009f\ufffd]/g) - cetnost(a, /[\u0080-\u009f\ufffd]/g));
  }
  return skore > 0 ? stredni : zapadni;
}

/**
 * MIDI file bytes → { format, ppq, tempo (quarters per minute), takt: '3/4', predznamenani: int|null, moll: bool|null,
 *   zmenyTaktu: bool, zmenyTempa: bool, nazev, stopy: [{ id, nazev, kanal, program, bici, noty: [{ midi, zac, kon, sila }] }],
 *   slova: [{ tick, text }] }. Times are in ticks (ppq ticks = a quarter).
 */
export function ctiMidi(data) {
  let b = data instanceof Uint8Array ? data : new Uint8Array(data);
  const u32 = i => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const u16 = i => (b[i] << 8) | b[i + 1];
  const tag = i => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
  if (b.length >= 12 && tag(0) === 'RIFF' && tag(8) === 'RMID') {         // MIDI wrapped in RIFF (.rmi)
    for (let i = 12; i + 8 <= b.length; i += 8 + u32le(b, i + 4) + (u32le(b, i + 4) & 1)) {
      if (tag(i) === 'data') { b = b.subarray(i + 8, i + 8 + u32le(b, i + 4)); break; }
    }
  }
  if (b.length < 14 || tag(0) !== 'MThd') throw new Error(tx('editor.midi.neniMidi'));
  const format = u16(8), pocet = u16(10), ppq = u16(12);
  if (ppq & 0x8000) throw new Error(tx('editor.midi.smpte'));
  if (!ppq) throw new Error(tx('editor.midi.poskozeny'));
  let i = 8 + u32(4);
  const tempa = [], takty = [], toniny = [], slova = [], texty = [], nazvy = [], textoveUdalosti = [];
  const stopy = new Map();                         // `${stopa}:${kanal}` → track
  for (let s = 0; s < pocet && i + 8 <= b.length; i += 8 + u32(i + 4)) {
    if (tag(i) !== 'MTrk') continue;               // skip unknown chunks
    const konecBloku = Math.min(b.length, i + 8 + u32(i + 4));
    let p = i + 8, tick = 0, status = 0;
    const programy = {}, zapnute = new Map();
    // a variable-length number has at most 4 bytes (SMF); a longer one is a damaged file, not 2^35 ticks of silence
    const vlq = () => {
      let v = 0, c, n = 0;
      do { c = b[p++]; v = v * 128 + (c & 0x7f); if (++n > 4) throw new Error(tx('editor.midi.poskozeny')); } while (c & 0x80 && p < konecBloku);
      return v;
    };
    const stopa = kanal => {
      const k = `${s}:${kanal}`;
      if (!stopy.has(k)) stopy.set(k, { stopa: s, kanal, program: programy[kanal] ?? 0, noty: [] });
      return stopy.get(k);
    };
    const vypni = (kanal, vys, kdy) => {
      const fronta = zapnute.get(kanal * 128 + vys);
      if (!fronta?.length) return;
      const z = fronta.shift();
      if (kdy > z.zac) stopa(kanal).noty.push({ midi: vys, zac: z.zac, kon: kdy, sila: z.sila });
    };
    while (p < konecBloku) {
      tick += vlq();
      let st = b[p];
      if (st & 0x80) { p++; if (st < 0xf0) status = st; } else if (status) st = status; else break;
      if (st === 0xff) {
        const typ = b[p++], delka = vlq(), d = b.subarray(p, p + delka);
        p += delka;
        if (typ === 0x2f) break;
        if (typ === 0x51 && delka >= 3) tempa.push({ tick, bpm: 60e6 / ((d[0] << 16) | (d[1] << 8) | d[2]) });
        else if (typ === 0x58 && delka >= 2) {
          if (!d[0] || d[1] > 6) throw new Error(tx('editor.midi.poskozeny'));   // 0/4 or a note value below 1/64
          takty.push({ tick, takt: `${d[0]}/${2 ** d[1]}` });
        }
        else if (typ === 0x59 && delka >= 2) toniny.push({ tick, sf: d[0] > 127 ? d[0] - 256 : d[0], moll: d[1] <= 1 ? !!d[1] : null });
        else if (typ >= 0x01 && typ <= 0x09) textoveUdalosti.push({ s, tick, typ, d });
        continue;
      }
      if (st === 0xf0 || st === 0xf7) { p += vlq(); continue; }
      const druh = st & 0xf0, kanal = st & 0x0f;
      const d1 = b[p++], d2 = druh === 0xc0 || druh === 0xd0 ? 0 : b[p++];
      if (druh === 0x90 && d2 > 0) {
        const k = kanal * 128 + d1;
        if (!zapnute.has(k)) zapnute.set(k, []);
        zapnute.get(k).push({ zac: tick, sila: d2 });
        stopa(kanal);
      } else if (druh === 0x80 || druh === 0x90) vypni(kanal, d1, tick);
      else if (druh === 0xc0) { programy[kanal] = d1; if (stopy.has(`${s}:${kanal}`) && !stopy.get(`${s}:${kanal}`).noty.length) stopy.get(`${s}:${kanal}`).program = d1; }
    }
    for (const [k, fronta] of zapnute) while (fronta.length) vypni(Math.floor(k / 128), k % 128, tick);
    s++;
  }
  const dekoder = dekoderTextu(textoveUdalosti.map(u => u.d));
  for (const { s, tick, typ, d } of textoveUdalosti) {
    if (typ === 0x03 && !nazvy[s]) nazvy[s] = dekoder.decode(d).trim();
    else if (typ === 0x05) slova.push({ tick, text: dekoder.decode(d) });
    else if (typ === 0x01) texty.push({ tick, text: dekoder.decode(d) });
  }
  const seznam = [...stopy.values()].filter(x => x.noty.length).map((x, id) => ({
    id, nazev: nazvy[x.stopa] || '', kanal: x.kanal, program: x.program, bici: x.kanal === 9,
    noty: x.noty.sort((a, c) => a.zac - c.zac || a.midi - c.midi),
  }));
  // song title: name of the first track without notes (in format 1 that's the header), else in format 0 the name of the only track
  const nazev = (nazvy.find((n, s) => n && ![...stopy.values()].some(x => x.stopa === s && x.noty.length)) || (format === 0 ? nazvy[0] : '') || '').trim();
  // karaoke (.kar) stores syllables as text events; headers start with '@'
  const slabiky = slova.length ? slova : texty.filter(t => !t.text.startsWith('@'));
  const prvni = arr => arr.sort((a, c) => a.tick - c.tick)[0];
  // pickup written as a short first bar (MuseScore: 1/4 and then 3/4) → the time signature is the second one
  const casyTaktu = new Set();
  const jedinecneTakty = takty.sort((a, c) => a.tick - c.tick).filter(t => {
    if (casyTaktu.has(t.tick)) return false;
    casyTaktu.add(t.tick);
    return true;
  });
  let predtakti = 0;
  const [prvniTakt, druhyTakt] = jedinecneTakty;
  if (prvniTakt?.tick === 0 && druhyTakt && druhyTakt.takt !== prvniTakt.takt) {
    const q = druhyTakt.tick / ppq;
    if (Math.abs(q - metrum(prvniTakt.takt).delka) < 1e-6 && q < metrum(druhyTakt.takt).delka - 1e-6) {
      predtakti = q; jedinecneTakty.shift();
    }
  }
  const tonina = prvni(toniny);
  return {
    format, ppq,
    tempo: prvni(tempa)?.bpm || 120,
    zmenyTempa: new Set(tempa.map(t => Math.round(t.bpm))).size > 1,
    takt: jedinecneTakty[0]?.takt || '4/4',
    zmenyTaktu: new Set(jedinecneTakty.map(t => t.takt)).size > 1,
    predtakti,                                     // pickup length in quarters (0 = bar lines from the start)
    predznamenani: tonina?.sf ?? null,
    moll: tonina?.moll ?? null,
    nazev, stopy: seznam,
    slova: slabiky.sort((a, c) => a.tick - c.tick),
  };
}
function u32le(b, i) { return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0; }

/** note name for the overview according to the naming system ('C4', 'Fis4' / 'F#4') */
const jmenoTonu = m => nazevTonu(m) + (Math.floor(m / 12) - 1);

/** track overview for selection in the app: [{ id, popis, pocet, rozsah, prumer, souzvuky (share), bici }] */
export function prehledStop(midi) {
  return midi.stopy.map(s => {
    const vysky = s.noty.map(n => n.midi);
    const prumer = vysky.reduce((a, v) => a + v, 0) / vysky.length;
    const rodina = RODINY[Math.floor(s.program / 8)];
    const nastroj = tx(s.bici ? 'editor.midi.bici' : rodina ? `editor.midi.rodina.${rodina}` : 'editor.midi.nastroj');
    return {
      id: s.id,
      popis: `${s.id + 1}. ` + (s.nazev ? `${s.nazev} (${nastroj.toLowerCase()})` : tx('editor.midi.stopaKanal', { nastroj, kanal: s.kanal + 1 })),
      pocet: s.noty.length,
      rozsah: `${jmenoTonu(Math.min(...vysky))}–${jmenoTonu(Math.max(...vysky))}`,
      prumer, souzvuky: podilSouzvuku(s.noty, midi.ppq), bici: s.bici,
    };
  });
}
function podilSouzvuku(noty, ppq) {
  const tol = ppq / 16, nastupy = [];
  for (const n of noty) {
    const posl = nastupy[nastupy.length - 1];
    if (posl && n.zac - posl.zac <= tol) posl.pocet++; else nastupy.push({ zac: n.zac, pocet: 1 });
  }
  return nastupy.length ? nastupy.filter(x => x.pocet > 1).length / nastupy.length : 0;
}

/**
 * Suggested tracks: { melodie: id, leva: id|null }. The melody by track name, otherwise the highest mostly monophonic
 * track with enough notes. A left hand only for piano files (a second, lower piano track, or the only piano track
 * split at C4 – then the melody and the left hand have the same id).
 */
export function navrhniStopy(midi) {
  const pr = prehledStop(midi).filter(s => !s.bici);
  if (!pr.length) throw new Error(tx('editor.midi.zadneNoty'));
  const stopa = id => midi.stopy[id];
  const maxPocet = Math.max(...pr.map(s => s.pocet));
  const skore = s => (NAZVY_MELODIE.test(stopa(s.id).nazev) && !NAZVY_LEVE.test(stopa(s.id).nazev) ? 100 : 0)
    + s.prumer - (s.souzvuky > 0.6 ? 30 : 10 * s.souzvuky) + (s.pocet >= 0.25 * maxPocet ? 10 : -30) + (s.pocet < 8 ? -50 : 0);
  const melodie = [...pr].sort((a, c) => skore(c) - skore(a))[0];
  const klavir = s => stopa(s.id).program < 8;
  let leva = null;
  const nizsi = pr.filter(s => s.id !== melodie.id && klavir(s) && s.prumer < melodie.prumer - 5);
  if (klavir(melodie) && nizsi.length) leva = nizsi.sort((a, c) => (NAZVY_LEVE.test(stopa(c.id).nazev) - NAZVY_LEVE.test(stopa(a.id).nazev)) || c.pocet - a.pocet)[0].id;
  else if (pr.length === 1 && klavir(melodie) && stopa(melodie.id).noty.some(n => n.midi < 60) && stopa(melodie.id).noty.some(n => n.midi >= 60)
    && melodie.souzvuky > 0.2) leva = melodie.id;
  return { melodie: melodie.id, leva };
}

// ---------------------------------------------------------------- conversion to the song model
const MRIZKY = [0.5, 1 / 3, 0.25, 1 / 6, 1 / 12, 0.125];
const MAX_TAKTU = 2000;

/** how many different onsets (more than a little apart: not one chord played unevenly) land on one point of grid g */
function slite(nastupy, g) {
  const body = new Map();
  for (const x of [...nastupy].sort((a, c) => a - c)) {
    const k = Math.round(x / g);
    if (!body.has(k)) body.set(k, []);
    body.get(k).push(x);
  }
  let n = 0;
  for (const xs of body.values()) for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > 0.06) n++;
  return n;
}
/**
 * The grid for the onsets (in quarters). A file written from a score has every onset exactly on some grid: the
 * coarsest such grid is used, so a few sixteenths or one triplet are kept. A played recording: the coarsest grid that
 * at least 90 % of onsets fit and on which no two different onsets merge; if every grid merges some, the one that
 * merges the fewest. → { g, slito: onsets merged into another }
 */
function zvolMrizku(nastupy, ppq = 480) {
  if (!nastupy.length) return { g: 0.25, slito: 0 };
  const presne = Math.max(1 / ppq, 1e-3) + 1e-9;
  for (const g of MRIZKY) if (nastupy.every(x => Math.abs(x - Math.round(x / g) * g) <= presne)) return { g, slito: 0 };
  let nej = null;
  for (const g of MRIZKY) {
    const tol = Math.min(0.06, g * 0.2);
    const sedi = nastupy.filter(x => Math.abs(x - Math.round(x / g) * g) <= tol).length;
    const s = slite(nastupy, g);
    if (sedi >= 0.9 * nastupy.length && !s) return { g, slito: 0 };
    if (!nej || s < nej.slito) nej = { g, slito: s };
  }
  return nej;
}
/** key signature with the smallest total duration of out-of-scale notes (on a tie, fewer sharps/flats) */
function odhadPredznamenani(noty) {
  let nej = 0, nejChyba = Infinity;
  for (const sf of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
    const tonika = ((sf * 7) % 12 + 12) % 12;
    const stupnice = new Set([0, 2, 4, 5, 7, 9, 11].map(x => (x + tonika) % 12));
    const chyba = noty.reduce((a, n) => a + (stupnice.has(((n.midi % 12) + 12) % 12) ? 0 : n.kon - n.zac), 0);
    if (chyba < nejChyba - 1e-9) { nej = sf; nejChyba = chyba; }
  }
  return nej;
}

/**
 * Voice from a track's notes: quantised onsets, chords (or just the top note), ends trimmed to the next onset
 * and short gaps extended (legato). → [{ zac, kon, vysky: int[], zdroj: tick }]
 */
function hlas(noty, ppq, g, { jenHorni, maxTonu = 4 }) {
  const kv = x => Math.round(x / ppq / g) * g;
  const skupiny = new Map();
  for (const n of noty) {
    const zac = kv(n.zac);
    if (!skupiny.has(zac)) skupiny.set(zac, []);
    skupiny.get(zac).push({ ...n, kz: zac, kk: Math.max(zac + g, kv(n.kon)) });
  }
  const udalosti = [...skupiny.entries()].sort((a, c) => a[0] - c[0]).map(([zac, sk]) => {
    sk.sort((a, c) => c.midi - a.midi);
    const vybrane = jenHorni ? [sk[0]] : [...new Map(sk.map(n => [n.midi, n])).values()].slice(-maxTonu);
    return { zac, kon: Math.max(...vybrane.map(n => n.kk)), vysky: vybrane.map(n => n.midi).sort((a, c) => a - c), zdroj: sk[0].zac };
  });
  for (let k = 0; k < udalosti.length - 1; k++) {
    const u = udalosti[k], dalsi = udalosti[k + 1].zac;
    if (u.kon > dalsi) u.kon = dalsi;
    const mezera = dalsi - u.kon;
    // a gap of one grid step after a long note is articulation, not a rest (rests from the notes are kept)
    if (mezera > 1e-9 && mezera <= g + 1e-9 && u.kon - u.zac >= 3 * mezera - 1e-9) u.kon = dalsi;
  }
  return udalosti;
}

/** voice → notes per bar (rests in gaps, splitting across bar lines with a tie) */
function doTaktu(udalosti, { start, delkaTaktu, prvniTakt, pocetTaktu, predzn, moll }) {
  const takty = Array.from({ length: pocetTaktu }, () => []);
  const hranice = k => k === 0 ? start : start + prvniTakt + (k - 1) * delkaTaktu;   // start of bar k
  const konecVsech = hranice(pocetTaktu);
  const pridej = (od, doo, u) => {
    for (let k = 0; k < pocetTaktu && od < doo - 1e-9; k++) {
      const z = hranice(k + 1);
      if (od >= z - 1e-9) continue;
      const kus = Math.min(doo, z) - od;
      const casti = rozlozDelku(kus);
      casti.forEach((d, j) => {
        const posledni = j === casti.length - 1 && doo <= z + 1e-9;
        takty[k].push({
          t: u ? u.vysky.map(m => zMidi(m, predzn, moll)).join(' ') : 'r', d: naZlomek(d) || naPresnyZlomek(d),
          lig: !!u && !posledni, s: '', _zdroj: u && od === u.zac && j === 0 ? u : null,
        });
      });
      od = Math.min(doo, z);
    }
  };
  let cas = start;
  for (const u of udalosti) {
    if (u.zac > cas + 1e-9) pridej(cas, u.zac, null);
    pridej(Math.max(u.zac, cas), Math.min(u.kon, konecVsech), u);
    cas = Math.max(cas, u.kon);
  }
  if (cas < konecVsech - 1e-9) pridej(cas, konecVsech, null);
  return takty;
}

/** syllables from the file → onto melody notes by the nearest onset (within 1/4 beat); '-' = the word continues */
function prirad(slova, udalosti, ppq) {
  const cisti = t => t.replace(/[\r\n/\\]/g, '').trim();
  const sl = slova.filter(x => cisti(x.text) || /^\s+$/.test(x.text));
  for (let k = 0; k < sl.length; k++) {
    const raw = sl[k].text, s = cisti(raw);
    if (!s) continue;
    const dalsi = sl[k + 1]?.text;
    const pokracuje = !/\s$/.test(raw) && dalsi != null && !/^[\s/\\]/.test(dalsi) && !/[,.!?;:]$/.test(s);
    let nej = null, vzd = ppq / 4 + 1;
    for (const u of udalosti) {
      const v = Math.abs(u.zdroj - sl[k].tick);
      if (v < vzd && !u.slabika) { nej = u; vzd = v; }
    }
    if (nej) nej.slabika = s + (pokracuje && !s.endsWith('-') ? '-' : '');
  }
}

/**
 * Conversion to the song model. volby: { melodie: id, leva?: id|null, nazev?: string }. If the melody and the left hand
 * are the same track, it is split at C4 (MIDI 60). → { pisen, mrizka, poznamky: string[] }
 */
export function midiNaPisen(midi, { melodie, leva = null, nazev = '' } = {}) {
  const st = id => midi.stopy.find(s => s.id === id);
  if (!st(melodie)) throw new Error(tx('editor.midi.stopaNeexistuje'));
  const rozdelit = leva != null && leva === melodie;
  let notyM = st(melodie).noty, notyL = leva != null && st(leva) ? st(leva).noty : [];
  if (rozdelit) { notyL = notyM.filter(n => n.midi < 60); notyM = notyM.filter(n => n.midi >= 60); }
  if (!notyM.length) throw new Error(tx('editor.midi.stopaBezNot'));
  const ppq = midi.ppq;
  const poznamky = [];
  const mM = zvolMrizku(notyM.map(n => n.zac / ppq), ppq), g = mM.g;
  const mL = notyL.length ? zvolMrizku(notyL.map(n => n.zac / ppq), ppq) : { g, slito: 0 };
  const hM = hlas(notyM, ppq, g, { jenHorni: true });
  const hL = notyL.length ? hlas(notyL, ppq, mL.g, { jenHorni: false, maxTonu: 3 }) : [];
  if (mM.slito + mL.slito) poznamky.push(tx('editor.midi.slito', { n: mM.slito + mL.slito }));
  if (midi.slova.length) prirad(midi.slova, hM, ppq);

  const met = metrum(midi.takt);
  const L = met.delka;
  const prvniNastup = Math.min(hM[0].zac, hL[0]?.zac ?? Infinity);
  const faze = (midi.predtakti || 0) % L;                       // where the bar lines lie
  const prazdne = Math.floor((prvniNastup - faze) / L + 1e-9) * L + faze;   // whole empty bars at the start are dropped
  const posun = prvniNastup - prazdne;
  const predtakti = posun > 1e-9;
  const start = predtakti ? prvniNastup : prazdne;
  const prvniTakt = predtakti ? L - posun : L;
  const konec = Math.max(...hM.map(u => u.kon), ...hL.map(u => u.kon));
  const pocetTaktu = 1 + Math.max(0, Math.ceil((konec - start - prvniTakt) / L - 1e-9));
  if (pocetTaktu > MAX_TAKTU) throw new Error(tx('editor.midi.dlouhy', { n: MAX_TAKTU }));
  const predzn = midi.predznamenani ?? odhadPredznamenani([...notyM, ...notyL]);
  const moll = midi.moll ?? !jakaTonina({ predznamenani: predzn,
    takty: [{ noty: hM.map(u => ({ t: zMidi(u.vysky[0]), d: '1/4' })) }] }).dur;
  const opt = { start, delkaTaktu: L, prvniTakt, pocetTaktu, predzn, moll };
  const taktyM = doTaktu(hM, opt);
  const taktyL = hL.length ? doTaktu(hL, opt) : null;
  for (const t of taktyM) for (const n of t) { if (n._zdroj?.slabika) n.s = n._zdroj.slabika; delete n._zdroj; }
  if (taktyL) for (const t of taktyL) for (const n of t) delete n._zdroj;

  if (midi.zmenyTaktu) poznamky.push(tx('editor.midi.zmenyTaktu', { takt: midi.takt }));
  if (midi.zmenyTempa) poznamky.push(tx('editor.midi.zmenyTempa', { tempo: Math.round(midi.tempo) }));
  if (midi.predznamenani == null) poznamky.push(tx('editor.midi.odhadPredznamenani'));
  if (st(melodie).noty.length > notyM.length && !rozdelit) { /* nothing */ }
  const souzvuky = podilSouzvuku(notyM, ppq);
  if (souzvuky > 0.1) poznamky.push(tx('editor.midi.souzvuky'));

  const prumer = notyM.reduce((a, n) => a + n.midi, 0) / notyM.length;
  return {
    mrizka: g, poznamky,
    pisen: {
      nazev: nazev || midi.nazev || tx('editor.midi.nazevPisne'), autor: '',
      klic: prumer < 57 ? 'basovy' : 'houslovy',
      predznamenani: predzn, takt: midi.takt, tempo: Math.round(midi.tempo),
      takty: taktyM.map((noty, k) => ({ akordy: [], noty, ...(taktyL ? { leva: taktyL[k] } : {}) })),
    },
  };
}
