// Text notation (one bar per line, see plugin/skills/rusalka-sheet-music/references/format.md) ↔ song model from song.js.
// Used by the app (Paste notes from the helper, .txt import) and, as a copy, by the rusalka-sheet-music skill (npm run skill).
// Errors come twice: Czech strings in `chyby` (the skill prints them) and structured items in `polozky` for the app,
// which shows them in its language (textChybZapisu in practice.js).
import { naZlomek, zlomek } from './song.js';

// ---------------------------------------------------------------- text notation → model
const HLAVICKA = {
  title: 'nazev', author: 'autor', time: 'takt', key: 'predznamenani', clef: 'klic',
  nazev: 'nazev', 'název': 'nazev', autor: 'autor', takt: 'takt', tempo: 'tempo', klic: 'klic', 'klíč': 'klic',
  predznamenani: 'predznamenani', 'předznamenání': 'predznamenani',
};
/** Czech text of a structured error (the skill prints these) */
const CESKY = {
  neznamaHlavicka: p => `řádek ${p.radek}: neznámá položka hlavičky „${p.text}“ (hlavičku ukonči řádkem ---)`,
  chybiOddelovac: () => 'chybí řádek --- mezi hlavičkou a takty',
  spatnyTakt: p => `takt „${p.takt}“ má být ve tvaru 3/4`,
  neznamaZnacka: p => `řádek ${p.radek}: neznámá značka „${p.znacka}“`,
  chybiSvislice: p => `řádek ${p.radek}: chybí „|“ mezi akordy a notami`,
  spatnyAkord: p => `řádek ${p.radek}: akord „${p.akord}“ (tvar C, Am@2, G7@1.5)`,
  spatnaNota: p => `řádek ${p.radek}${p.leva ? ' (levá ruka)' : ''}: nota „${p.nota}“ (tvar G4/4, F#4/8., C4+E4/2, r/4, A4/8t, E4/4~, C4/4^1, G4/4=sla-)`,
  zadneTakty: () => 'nejsou tu žádné takty',
  spatnaHodnota: p => `řádek ${p.radek}: „${p.hodnota}“ má být číslo`,
};

/** bars marked {?} as 0-based indexes (the editor's `nejiste`) */
export const nejisteTakty = pisen => (pisen.nejistoty || []).map(s => Number(String(s).match(/\d+/)?.[0]) - 1).filter(i => i >= 0);

/**
 * The notation out of a pasted chat answer: the first code block containing a --- line (fences and the prose around it
 * dropped), otherwise from the first header line to the last bar line. Clean notation comes back unchanged.
 */
export function vyberZapis(text) {
  const radky = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  const plot = /^\s*(```|~~~)/;
  const bloky = [];
  let blok = null;
  for (const r of radky) {
    if (plot.test(r)) { if (blok) { bloky.push(blok); blok = null; } else blok = []; continue; }
    if (blok) blok.push(r);
  }
  let rr = bloky.find(b => b.some(l => l.trim() === '---')) || radky.filter(l => !plot.test(l));
  const jeHlavicka = l => { const m = l.trim().match(/^([^:]+):/); return !!(m && HLAVICKA[m[1].trim().toLowerCase()]); };
  let od = rr.findIndex(jeHlavicka);
  if (od < 0) od = Math.max(0, rr.findIndex(l => l.trim() === '---'));
  rr = rr.slice(od);
  const oddelovac = rr.findIndex(l => l.trim() === '---');
  if (oddelovac >= 0) {
    let posledni = -1;
    rr.forEach((l, i) => { if (i > oddelovac && (l.includes('|') || /^\s*\d+\)/.test(l))) posledni = i; });
    if (posledni >= 0) rr = rr.slice(0, posledni + 1);
  }
  return rr.join('\n').replace(/\s+$/, '') + '\n';
}
const ZNACKY = { '|:': 'zacatekRepetice', ':|': 'konecRepetice', segno: 'segno', coda: 'coda', tocoda: 'doCody', fine: 'fine', dc: 'dc', ds: 'ds' };
const VYSKA = '[A-G](?:##|#|bb|b)?-?\\d';
const NOTA = new RegExp(`^(r|${VYSKA}(?:\\+${VYSKA})*)\\/(1|2|4|8|16|32)(\\.{0,2})(t?)(~?)(?:\\^([1-5]))?(?:=(.*))?$`);

/** text → { pisen, chyby: string[] (Czech), polozky: [{ radek?, druh, … }] } */
export function zTextu(text) {
  const polozky = [];
  const chyba = p => polozky.push(p);
  const pisen = { nazev: '', autor: '', klic: 'houslovy', predznamenani: 0, takt: '4/4', tempo: 0, takty: [], nejistoty: [] };
  const radky = text.split(/\r?\n/);
  let i = 0, telo = false;
  for (; i < radky.length; i++) {
    const r = radky[i].trim();
    if (r === '---') { telo = true; i++; break; }
    if (!r || r.startsWith('#')) continue;
    const m = r.match(/^([^:]+):\s*(.*)$/);
    const k = m && HLAVICKA[m[1].trim().toLowerCase()];
    if (!k) { chyba({ radek: i + 1, druh: 'neznamaHlavicka', text: r }); continue; }
    const v = m[2].trim();
    if (k === 'predznamenani' || k === 'tempo') {              // a leading number counts ("1 (G major)"), words are an error
      const c = v.match(/^[+-]?\d+/);
      if (c) pisen[k] = Number(c[0]); else if (v) chyba({ radek: i + 1, druh: 'spatnaHodnota', hodnota: v });
    }
    else if (k === 'klic') pisen.klic = /^bas/i.test(v) ? 'basovy' : 'houslovy';   // basový / bass
    else pisen[k] = v;
  }
  if (!telo) chyba({ druh: 'chybiOddelovac' });
  if (!/^\d+\/\d+$/.test(pisen.takt)) chyba({ druh: 'spatnyTakt', takt: pisen.takt });
  for (; i < radky.length; i++) {
    let r = radky[i].trim();
    if (!r || r.startsWith('#')) continue;                 // comments only on a whole line (# is also a sharp)
    const radek = i + 1;
    const cislo = pisen.takty.length + 1;
    r = r.replace(/^\d+\)\s*/, '');
    const takt = { akordy: [], noty: [] };
    const zn = r.match(/^\{([^}]*)\}\s*/);
    if (zn) {
      r = r.slice(zn[0].length);
      for (const z of zn[1].trim().split(/\s+/).filter(Boolean)) {
        const zl = z.toLowerCase();
        if (zl === '?') pisen.nejistoty.push(`takt ${cislo}`);
        else if (/^\d+\.$/.test(zl)) ((takt.znacky ||= {}).volta ||= []).push(Number(zl.slice(0, -1)));
        else if (ZNACKY[zl]) (takt.znacky ||= {})[ZNACKY[zl]] = true;
        else chyba({ radek, druh: 'neznamaZnacka', znacka: z });
      }
    }
    const [prava, leva] = r.split('||');
    const svislice = prava.indexOf('|');
    if (svislice < 0) { chyba({ radek, druh: 'chybiSvislice' }); continue; }
    for (const a of prava.slice(0, svislice).trim().split(/\s+/).filter(Boolean)) {
      const [znacka, doba = '0'] = a.split('@');
      if (!/^[A-G]/.test(znacka) || !Number.isFinite(Number(doba))) chyba({ radek, druh: 'spatnyAkord', akord: a });
      else takt.akordy.push({ doba: Number(doba), znacka });
    }
    takt.noty = noty(prava.slice(svislice + 1), { radek, leva: false }, chyba);
    if (leva != null) takt.leva = noty(leva, { radek, leva: true }, chyba);
    pisen.takty.push(takt);
  }
  if (!pisen.takty.length) chyba({ druh: 'zadneTakty' });
  if (pisen.takty.some(t => t.leva) && pisen.takty.some(t => !t.leva)) {
    for (const t of pisen.takty) t.leva ||= [];
  }
  return { pisen, chyby: polozky.map(p => CESKY[p.druh](p)), polozky };
}
function noty(text, kde, chyba) {
  const out = [];
  for (const tok of text.trim().split(/\s+/).filter(Boolean)) {
    const m = tok.match(NOTA);
    if (!m) { chyba({ ...kde, druh: 'spatnaNota', nota: tok }); continue; }
    let q = 4 / Number(m[2]);
    q *= m[3] === '..' ? 1.75 : m[3] === '.' ? 1.5 : 1;
    if (m[4]) q *= 2 / 3;
    const nota = { t: m[1].replace(/\+/g, ' '), d: naZlomek(q), lig: !!m[5] && m[1] !== 'r', s: (m[7] || '').replace(/_/g, ' ') };
    if (m[6]) nota.prst = Number(m[6]);
    out.push(nota);
  }
  return out;
}

// ---------------------------------------------------------------- model → text notation
const DELKY_TEXT = [];
for (const den of [1, 2, 4, 8, 16, 32]) for (const tecky of ['', '.', '..']) for (const t of ['', 't']) {
  const q = 4 / den * (tecky === '..' ? 1.75 : tecky ? 1.5 : 1) * (t ? 2 / 3 : 1);
  DELKY_TEXT.push([q, `${den}${tecky}${t}`]);
}
const delkaTextem = d => { const q = zlomek(d); return DELKY_TEXT.find(([x]) => Math.abs(x - q) < 1e-6)?.[1] || `?${d}`; };
const notaTextem = n => `${n.t.trim().split(/\s+/).join('+')}/${delkaTextem(n.d)}${n.lig ? '~' : ''}${n.prst ? '^' + n.prst : ''}${n.s ? '=' + n.s.replace(/\s/g, '_') : ''}`;

export function naText(p) {
  const zpet = Object.fromEntries(Object.entries(ZNACKY).map(([k, v]) => [v, k]));
  const radky = [`title: ${p.nazev || ''}`, `author: ${p.autor || ''}`, `time: ${p.takt}`, `key: ${p.predznamenani || 0}`,
    `tempo: ${p.tempo || 0}`, `clef: ${p.klic === 'basovy' ? 'bass' : 'treble'}`, '---'];
  p.takty.forEach((t, i) => {
    const z = [];
    for (const [k, v] of Object.entries(t.znacky || {})) {
      if (k === 'volta') z.push(...v.map(c => `${c}.`)); else if (v && zpet[k]) z.push(zpet[k]);
    }
    const akordy = (t.akordy || []).map(a => a.znacka + (a.doba ? `@${a.doba}` : '')).join(' ');
    radky.push(`${i + 1}) ${z.length ? `{${z.join(' ')}} ` : ''}${akordy}${akordy ? ' ' : ''}| ${(t.noty || []).map(notaTextem).join(' ')}`
      + (t.leva?.length ? ` || ${t.leva.map(notaTextem).join(' ')}` : ''));
  });
  return radky.join('\n') + '\n';
}
