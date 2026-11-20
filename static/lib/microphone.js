// Pitch recognition from the microphone – a replacement for MIDI input for acoustic instruments (piano, flute, voice).
// Pure DSP over frames of samples (Float32Array or an array of numbers, mono, range −1..1). No Web Audio or getUserMedia:
// the UI passes frames from AnalyserNode.getFloatTimeDomainData() or from an AudioWorklet (ring buffer).
//
// Key idea: the app KNOWS which note (chord) the player should play, so it does not transcribe notes in general, it only
// verifies the expected ones (obsahujeTony). The general pitch estimate (vyska, monophonic) is only used for the "wrong note" message.
//
// Recommended parameters for the UI (48 kHz and 44.1 kHz):
//   frame 4096 samples (~85 ms – needed to resolve the bass), hop 1024 samples (75 % overlap, ~21 ms),
//   time `cas` = time of the frame's last sample in seconds (e.g. AudioContext.currentTime); Rozpoznavac
//   uses only the last 2048 samples for onset detection and for `vyska`, so the onset latency is ~25–50 ms.
//   For a melody from C3 up, a 2048 frame / 512 hop is enough.
//
// The module's only "state" is a cache of FFT tables and windows by size (constants, they don't affect results).

// ---------------------------------------------------------------- conversion helpers
/** MIDI number → frequency in Hz for a given tuning (A4 = `ladeni` Hz) */
export const midiNaHz = (midi, ladeni = 440) => ladeni * 2 ** ((midi - 69) / 12);
/** frequency in Hz → MIDI number with a fractional part (69.3 = A4 plus 30 cents) */
export const hzNaMidi = (f, ladeni = 440) => 69 + 12 * Math.log2(f / ladeni);
/** distance of two frequencies in cents (a relative to b) */
const centy = (a, b) => 1200 * Math.log2(a / b);
const omez = (x, lo = 0, hi = 1) => (x < lo ? lo : x > hi ? hi : x);
const mocnina2 = n => { let m = 1; while (m < n) m <<= 1; return m; };

// ---------------------------------------------------------------- FFT
const TABULKY = new Map();
function tabulka(n) {
  let t = TABULKY.get(n);
  if (!t) {
    const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2), obr = new Uint32Array(n);
    for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = -Math.sin(2 * Math.PI * i / n); }
    const bity = Math.round(Math.log2(n));
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bity; b++) r |= ((i >> b) & 1) << (bity - 1 - b);
      obr[i] = r;
    }
    t = { cos, sin, obr };
    TABULKY.set(n, t);
  }
  return t;
}

/**
 * In-place radix-2 FFT (re, im are Float64Arrays of length 2^k). `inverzni` = inverse transform including division by n.
 * Forward: X[k] = Σ x[j]·e^(−2πijk/n).
 */
export function fft(re, im, inverzni = false) {
  const n = re.length;
  if (n !== im.length || n < 2 || (n & (n - 1))) throw new Error('fft: délka musí být mocnina dvou');
  const { cos, sin, obr } = tabulka(n);
  for (let i = 0; i < n; i++) {
    const j = obr[i];
    if (j > i) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  const znam = inverzni ? -1 : 1;
  for (let vel = 2; vel <= n; vel <<= 1) {
    const pul = vel >> 1, krok = n / vel;
    for (let i = 0; i < n; i += vel) {
      for (let j = 0, k = 0; j < pul; j++, k += krok) {
        const wr = cos[k], wi = znam * sin[k];
        const a = i + j, b = a + pul;
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
      }
    }
  }
  if (inverzni) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

const OKNA = new Map();
/** Hann window of length n (cached) */
function hann(n) {
  let w = OKNA.get(n);
  if (!w) {
    w = new Float64Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
    OKNA.set(n, w);
  }
  return w;
}

/**
 * Amplitude spectrum of a frame with a Hann window, zero-padded to 2× (finer peak interpolation).
 * The amplitude is normalised so that a sine with amplitude A peaks at ≈ A. → { mag, krok (Hz per bin), zvetseni }
 */
function spektrum(ramec, vzorkovani, zvetseni = 2) {
  const n = ramec.length, M = mocnina2(n) * zvetseni, w = hann(n);
  const re = new Float64Array(M), im = new Float64Array(M);
  let prumer = 0;
  for (let i = 0; i < n; i++) prumer += ramec[i];
  prumer /= n;
  let suma = 0;
  for (let i = 0; i < n; i++) { re[i] = (ramec[i] - prumer) * w[i]; suma += w[i]; }
  fft(re, im);
  const pol = M / 2, mag = new Float64Array(pol + 1), k = 2 / suma;
  for (let i = 0; i <= pol; i++) mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) * k;
  return { mag, krok: vzorkovani / M, zvetseni };
}
const naDb = mag => { const db = new Float64Array(mag.length); for (let i = 0; i < mag.length; i++) db[i] = 20 * Math.log10(mag[i] + 1e-12); return db; };

/**
 * Prominent spectral peaks (tonal components): local maxima with parabolic interpolation (in dB), at most `dynamika` dB
 * below the strongest, standing at least `vyraznost` dB above the 25th percentile of the neighbourhood (noise has low peaks),
 * and not a window side lobe of a stronger peak. Each peak gets `vaha` 0..1 (1 = within 18 dB of the maximum).
 */
function vrcholy(db, krok, zvetseni, { dynamika = 45, vyraznost = 18, fMin = 25, fMax = 5000 } = {}) {
  const kMin = Math.max(2, Math.floor(fMin / krok)), kMax = Math.min(db.length - 2, Math.ceil(fMax / krok));
  let maxDb = -Infinity;
  for (let k = kMin; k <= kMax; k++) if (db[k] > maxDb) maxDb = db[k];
  const dno = maxDb - dynamika, kandidati = [];
  for (let k = kMin; k <= kMax; k++) {
    const b = db[k];
    if (b <= dno || !(b > db[k - 1] && b >= db[k + 1])) continue;
    const a = db[k - 1], c = db[k + 1], jm = a - 2 * b + c;
    const d = jm < 0 ? omez(0.5 * (a - c) / jm, -0.5, 0.5) : 0;
    kandidati.push({ k, f: (k + d) * krok, db: b - 0.25 * (a - c) * d });
  }
  const lalok = 3 * zvetseni, vysledek = [];
  const okoli = new Float64Array(2 * Math.ceil(0.12 * fMax / krok + 8 * zvetseni) + 3);
  for (const p of kandidati) {
    // side lobe: a peak within 3 bins is stronger by ≥ 20 dB
    if (kandidati.some(q => q !== p && Math.abs(q.k - p.k) <= lalok && q.db - p.db >= 20)) continue;
    // prominence above the 25th percentile of the neighbourhood (±12 % of frequency, at least ±8 bins)
    const w = Math.max(8 * zvetseni, Math.round(0.12 * p.f / krok));
    const od = Math.max(0, p.k - w), po = Math.min(db.length - 1, p.k + w);
    let m = 0;
    for (let i = od; i <= po; i++) okoli[m++] = db[i];
    const serazene = okoli.subarray(0, m).sort();
    if (p.db - serazene[Math.floor(m * 0.25)] < vyraznost) continue;
    p.vaha = omez((p.db - dno) / (dynamika - 18));
    vysledek.push(p);
  }
  return { seznam: vysledek, maxDb };
}

/** strongest peak weight in the band f −dolu..+nahoru cents (0 = none) */
function vahaU(seznam, f, dolu, nahoru = dolu) {
  let v = 0;
  for (const p of seznam) {
    const c = centy(p.f, f);
    if (c >= -dolu && c <= nahoru && p.vaha > v) v = p.vaha;
  }
  return v;
}
/** upper tolerance for the h-th harmonic (string inharmonicity shifts higher partials only upwards) */
const tolH = (tol, h) => tol * (1 + 0.15 * (h - 1));
/** is frequency f explained by some harmonic (1..12) of one of the notes? */
function vysvetleno(f, zaklady, tol) {
  for (const f0 of zaklady) {
    const h = Math.round(f / f0), c = h >= 1 ? centy(f, h * f0) : 0;
    if (h >= 1 && h <= 12 && c >= -tol && c <= tolH(tol, h)) return true;
  }
  return false;
}

/**
 * Core of obsahujeTony over a list of peaks. Score of note m:
 *  - harmonics h = 1..6 → weights p[h]; zaklad = max(p1, (p1 + p2 + p3 + p4) / 2.5) – a bass with a weak fundamental
 *    gets by with the 2nd–4th harmonics,
 *  - odd partials (1, 3, 5) must be at least somewhat present, otherwise the sound is the note an octave higher (only even ones),
 *  - if the signal contains f0/2, or 1.5·f0, 2.5·f0 and 3.5·f0 together (± 25 c), the sound is the note an octave lower
 *    (unless those frequencies are explained by other expected notes).
 */
function hodnot(seznam, midiTony, { ladeni = 440, tolerance = 50, prah = 0.5, fMax = 5000, oktavaNiz = true } = {}) {
  const tony = [...new Set(midiTony.map(Number))];
  const zaklady = tony.map(m => midiNaHz(m, ladeni));
  const skore = {};
  tony.forEach((m, i) => {
    const f0 = zaklady[i], jine = zaklady.filter((_, j) => j !== i);
    const p = [0];
    for (let h = 1; h <= 6; h++) p[h] = h * f0 < fMax ? vahaU(seznam, h * f0, tolerance, tolH(tolerance, h)) : 0;
    const zaklad = Math.max(p[1], Math.min(1, (p[1] + p[2] + p[3] + p[4]) / 2.5));
    const liche = Math.max(p[1], p[3], p[5]);
    // partials of the note an octave lower lie exactly on harmonic positions – tighter tolerance (25 c, more upwards)
    const tp = Math.min(tolerance, 25);
    const pod = q => (vysvetleno(q * f0, jine, tolerance) ? 0 : vahaU(seznam, q * f0, tp, tp * (1 + 0.05 * (2 * q - 1))));
    const niz = oktavaNiz ? Math.max(pod(0.5), Math.min(pod(1.5), pod(2.5), pod(3.5))) : 0;
    skore[m] = Math.round(1000 * zaklad * omez(liche / 0.4) * (1 - niz)) / 1000;
  });
  const ok = tony.length > 0 && tony.every(m => skore[m] >= prah);
  const navic = seznam.some(v => v.vaha >= 0.5 && v.f <= Math.min(fMax, 4000) && !vysvetleno(v.f, zaklady, tolerance));
  return { ok, skore, navic };
}

// ---------------------------------------------------------------- energy and pitch
/** RMS of a frame in dB relative to full scale (sine with amplitude 1 = −3 dB); silence → −120 */
export function energie(ramec) {
  let s = 0;
  for (let i = 0; i < ramec.length; i++) s += ramec[i] * ramec[i];
  const rms = Math.sqrt(s / Math.max(1, ramec.length));
  return rms > 1e-6 ? Math.max(-120, 20 * Math.log10(rms)) : -120;
}

/**
 * Fundamental frequency estimate of a monophonic note using MPM (McLeod: normalised square difference function, NSDF,
 * autocorrelation via FFT) with parabolic interpolation of the peak.
 * @param {Float32Array|number[]} ramec samples (at least 2 periods of the lowest note sought; 2048 at 48 kHz → from ~47 Hz)
 * @param {number} vzorkovani sample rate in Hz
 * @param {{min?:number, max?:number, ladeni?:number, prah?:number, prahTicha?:number}} [volby]
 *   min/max = search range in Hz, ladeni = A4 in Hz, prah = minimum confidence (below it null),
 *   prahTicha = frame quieter than this many dBFS → null
 * @returns {{f0:number, midi:number, cents:number, jistota:number}|null} midi = nearest semitone,
 *   cents = deviation from it (−50..50), jistota = NSDF peak height 0..1 (clean periodic tone ≈ 1, noise < 0.5)
 */
export function vyska(ramec, vzorkovani, { min = 50, max = 2000, ladeni = 440, prah = 0.6, prahTicha = -60 } = {}) {
  const n = ramec.length;
  if (n < 32 || energie(ramec) < prahTicha) return null;
  const tauMin = Math.max(2, Math.floor(vzorkovani / max) - 1);
  const tauMax = Math.min(Math.ceil(vzorkovani / min) + 1, Math.floor(n / 2));
  if (tauMax <= tauMin + 2) return null;
  // autocorrelation r(τ) via FFT (zero padding → no circular overlap)
  const M = mocnina2(n + tauMax + 1);
  const re = new Float64Array(M), im = new Float64Array(M);
  let prumer = 0;
  for (let i = 0; i < n; i++) prumer += ramec[i];
  prumer /= n;
  for (let i = 0; i < n; i++) re[i] = ramec[i] - prumer;
  const x = re.slice(0, n);
  fft(re, im);
  for (let i = 0; i < M; i++) { re[i] = re[i] * re[i] + im[i] * im[i]; im[i] = 0; }
  fft(re, im, true);
  // NSDF n(τ) = 2 r(τ) / m(τ), m(τ) = Σ x_j² + x_{j+τ}²
  const nsdf = new Float64Array(tauMax + 2);
  let m = 2 * re[0];
  for (let t = 0; t <= tauMax + 1; t++) {
    if (t > 0) m -= x[t - 1] * x[t - 1] + x[n - t] * x[n - t];
    nsdf[t] = m > 1e-12 ? 2 * re[t] / m : 0;
  }
  // key maxima: the highest point of each positive segment (after the first zero crossing)
  const delka = tauMax + 1;
  let t = 0;
  while (t < delka && nsdf[t] > 0) t++;
  const klicova = [], kratsi = [];      // kratsi = maxima below tauMin (pitch above the upper limit)
  let nejvic = 0;
  while (t < delka) {
    while (t < delka && nsdf[t] <= 0) t++;
    let nej = -1, mimo = -1;
    while (t < delka && nsdf[t] > 0) {
      if (t >= tauMin) { if (nej < 0 || nsdf[t] > nsdf[nej]) nej = t; } else if (mimo < 0 || nsdf[t] > nsdf[mimo]) mimo = t;
      t++;
    }
    if (mimo > 0) kratsi.push(nsdf[mimo]);
    if (nej > 0 && nej < delka) { klicova.push(nej); if (nsdf[nej] > nejvic) nejvic = nsdf[nej]; }
  }
  if (!klicova.length) return null;
  const vybrany = klicova.find(k => nsdf[k] >= 0.9 * nejvic);
  if (kratsi.some(v => v >= 0.9 * nsdf[vybrany])) return null;   // the real period is shorter than 1/max
  const a = nsdf[vybrany - 1], b = nsdf[vybrany], c = nsdf[vybrany + 1], jm = a - 2 * b + c;
  const d = jm < 0 ? omez(0.5 * (a - c) / jm, -0.5, 0.5) : 0;
  const tau = vybrany + d, jistota = omez(b - 0.25 * (a - c) * d);
  const f0 = vzorkovani / tau;
  if (jistota < prah || f0 < min * 0.97 || f0 > max * 1.03) return null;
  const mf = hzNaMidi(f0, ladeni), midi = Math.round(mf);
  return { f0, midi, cents: Math.round((mf - midi) * 1000) / 10, jistota: Math.round(jistota * 1000) / 1000 };
}

// ---------------------------------------------------------------- expected notes
/**
 * Do the expected notes (also a chord) sound in the frame? In the spectrum (Hann, own FFT) it looks for peaks at the
 * fundamental and the 2nd–6th harmonics of each note relative to the neighbourhood; a bass with a weak fundamental is
 * recognised by its higher harmonics, and octave confusion is guarded against (the note an octave higher has no odd
 * harmonics, the note an octave lower has a partial at f0/2).
 * Frame: 4096 samples at 44.1/48 kHz (bass from C2 up); 2048 is enough from ~C3 (resolves C4 / C#4, and a triad).
 * @param {Float32Array|number[]} ramec
 * @param {number} vzorkovani
 * @param {number[]|number} midiTony expected MIDI notes
 * @param {{ladeni?:number, tolerance?:number, prah?:number, prahTicha?:number, dynamika?:number}} [volby]
 *   tolerance = allowed deviation in cents (for higher harmonics it widens upwards because of string
 *   inharmonicity: the h-th harmonic may be up to tolerance·(1 + 0.15·(h − 1)) higher),
 *   prah = minimum score for "ok" (0.5), prahTicha = quieter frame (dBFS) → nothing sounds
 * @returns {{ok:boolean, skore:Object<number,number>, navic:boolean}} ok = all expected notes have score ≥ prah;
 *   skore[midi] 0..1; navic = a prominent peak (within ~22 dB of the strongest) not explained by any expected note
 */
export function obsahujeTony(ramec, vzorkovani, midiTony, { ladeni = 440, tolerance = 50, prah = 0.5, prahTicha = -65, dynamika = 45 } = {}) {
  const tony = Array.isArray(midiTony) ? midiTony : [midiTony];
  const fMax = Math.min(5000, vzorkovani * 0.45);
  if (energie(ramec) < prahTicha) {
    const skore = {};
    for (const m of tony) skore[m] = 0;
    return { ok: false, skore, navic: false };
  }
  const { mag, krok, zvetseni } = spektrum(ramec, vzorkovani);
  const { seznam } = vrcholy(naDb(mag), krok, zvetseni, { dynamika, fMax });
  return hodnot(seznam, tony, { ladeni, tolerance, prah, fMax });
}

// ---------------------------------------------------------------- onsets
/**
 * Note onset detector (keystroke, attack) based on a sudden rise in energy and relative spectral flux
 * (share of new amplitude compared with frames t−1 and t−2). Adaptive threshold: noise floor (falls fast, rises slowly,
 * or is set by `kalibruj` from silence) and mean + 4σ of the flux at rest. The onset is the first frame of a continuous
 * run of candidates (so a gradual attack gives a single onset); at least `minOdstup` s between onsets.
 * Frames may have any length; the last `velikost` samples are analysed.
 */
export class DetektorNastupu {
  /**
   * @param {{minOdstup?:number, prahNadSumem?:number, prahToku?:number, prahSkoku?:number, rustSumu?:number,
   *   sumPocatecni?:number, velikost?:number}} [volby]
   *   minOdstup s; prahNadSumem dB (energy must be above the noise); prahToku 0..1 (minimum relative flux);
   *   prahSkoku dB (energy rise over the previous frame that is enough on its own); rustSumu dB/s (how fast the
   *   noise floor may rise); sumPocatecni dBFS = initial and also lowest noise floor; velikost = how many last samples of the frame to analyse
   */
  constructor({ minOdstup = 0.08, prahNadSumem = 10, prahToku = 0.3, prahSkoku = 6, rustSumu = 4, sumPocatecni = -70, velikost = 2048 } = {}) {
    Object.assign(this, { minOdstup, prahNadSumem, prahToku, prahSkoku, rustSumu, sumPocatecni, velikost });
    this.reset();
  }
  /** forgets the history (resets the noise floor to the initial value) */
  reset() {
    this.sum = this.sumPocatecni;
    this.tokPrumer = 0; this.tokRozptyl = 0;
    this.spektra = [];
    this.predE = null; this.predCas = null; this.posledni = null; this.kalibrovano = false; this.predKandidat = false;
  }
  /** silence calibration: frames without playing → noise floor (median energy) and flux statistics */
  kalibruj(ramce) {
    const e = ramce.map(r => energie(this.vyrez(r))).sort((a, b) => a - b);
    if (!e.length) return this.sum;
    let cas = 0;
    for (const r of ramce) { this.zpracuj(r, cas, true); cas += 0.01; }
    this.sum = Math.max(this.sumPocatecni, e[Math.floor(e.length / 2)]);
    this.kalibrovano = true;
    this.spektra = []; this.predE = null; this.predCas = null;
    return this.sum;
  }
  vyrez(r) { return r.length > this.velikost ? (r.subarray ? r.subarray(r.length - this.velikost) : r.slice(-this.velikost)) : r; }
  /**
   * @param {Float32Array|number[]} ramec
   * @param {number} cas frame time in seconds (monotonic)
   * @returns {{nastup:boolean, sila:number, energie:number, tok:number, sum:number}} sila 0..1 ≈ loudness above
   *   noise (0 dB → 0, 60 dB → 1; rough velocity – the onset frame holds only the start of the note), tok = relative spectral flux 0..1
   */
  zpracuj(ramec, cas, _kalibrace = false) {
    const x = this.vyrez(ramec), e = energie(x);
    const { mag } = spektrum(x, 1, 1);
    let tok = 0;
    if (this.spektra.length) {
      let suma = 0;
      for (let i = 1; i < mag.length; i++) suma += mag[i];
      for (const pred of this.spektra) {
        if (pred.length !== mag.length) continue;
        let kladny = 0;
        for (let i = 1; i < mag.length; i++) { const d = mag[i] - pred[i]; if (d > 0) kladny += d; }
        tok = Math.max(tok, suma > 1e-12 ? kladny / suma : 0);
      }
    }
    this.spektra.unshift(mag);
    if (this.spektra.length > 2) this.spektra.pop();
    // first frame: noise floor = its energy (assuming listening starts in silence; at least sumPocatecni)
    if (this.predE === null && !this.kalibrovano) this.sum = Math.max(this.sumPocatecni, e);
    const skok = this.predE === null ? 0 : e - this.predE;
    const dt = this.predCas === null ? 0 : Math.max(0, cas - this.predCas);
    const nadSumem = e >= this.sum + this.prahNadSumem;
    const prahT = Math.max(this.prahToku, this.tokPrumer + 4 * Math.sqrt(this.tokRozptyl));
    const kandidat = !_kalibrace && this.predE !== null && nadSumem && (tok >= prahT || skok >= this.prahSkoku);
    // onset = start of a run of candidates (an attack or crescendo over several frames gives one onset)
    const nastup = kandidat && !this.predKandidat && (this.posledni === null || cas - this.posledni >= this.minOdstup);
    if (nastup) this.posledni = cas;
    this.predKandidat = kandidat;
    // adaptation: flux only at rest (no candidate), noise down fast, up slowly and only with steady energy
    if (!kandidat) {
      const a = 0.05, d = tok - this.tokPrumer;
      this.tokPrumer += a * d;
      this.tokRozptyl = (1 - a) * (this.tokRozptyl + a * d * d);
      if (e < this.sum) this.sum = Math.max(this.sumPocatecni, this.sum + 0.5 * (e - this.sum));
      else if (Math.abs(skok) < 3) this.sum = Math.min(e, this.sum + this.rustSumu * dt);
    }
    this.predE = e; this.predCas = cas;
    return { nastup, sila: omez((e - this.sum) / 60), energie: e, tok, sum: this.sum };
  }
}

// ---------------------------------------------------------------- recogniser
/**
 * Stateful recogniser: replaces MIDI input. The UI calls `ocekavej(tony)` for the next note/chord and `zpracuj(ramec, cas)`
 * for each frame from the microphone; on the 'trefa' event it calls the same vstupOn(midi) as with MIDI.
 *  - 'trefa' (hit) { midi[] }: all expected notes sound (in `potvrzeni` consecutive frames), the new energy in the spectrum
 *    (difference from frame t−2) belongs to them AND either a new onset came, or the notes started sounding from silence
 *    without a clear onset (softly attacked flute). A note ringing on from earlier (repeated note) does not count until a
 *    new keystroke comes; neither does a different note played over a ringing expected one.
 *  - 'vedle' (wrong note) { midi }: after an onset, a different note than expected sounds confidently (monophonic, in two consecutive frames).
 * One event per onset.
 */
export class Rozpoznavac {
  /** @param {object} [volby] see nastav() */
  constructor(volby = {}) {
    this.volby = { vzorkovani: 48000, ladeni: 440, tolerance: 50, prah: 0.5, oknoTrefy: 0.2, jistotaVedle: 0.85, potvrzeni: 2, detektor: {} };
    this.ocekavane = [];
    this.nastav(volby);
  }
  /**
   * @param {{vzorkovani?:number, ladeni?:number, tolerance?:number, prah?:number, oknoTrefy?:number,
   *   jistotaVedle?:number, potvrzeni?:number, detektor?:object}} volby ladeni from kalibraceLadeni; oknoTrefy = seconds after
   *   an onset during which it still waits for the note to be confirmed; jistotaVedle = min. `vyska` confidence for the wrong-note message;
   *   potvrzeni = how many consecutive frames the notes must sound (2: a transitional frame with a smeared spectrum does not decide);
   *   detektor = DetektorNastupu options
   */
  nastav(volby = {}) {
    Object.assign(this.volby, volby);
    if (!this.detektor || volby.detektor) this.detektor = new DetektorNastupu(this.volby.detektor);
    this.reset();
    return this;
  }
  /** forgets the state (onsets, spectra); keeps the expected notes */
  reset() {
    this.detektor.reset();
    this.spektra = [];
    this.nastupCas = null; this.vyrizeno = true; this.novota = false; this.kandidatVedle = null;
    this.zni = null; this.neOk = 0; this.okPocet = 0; this.zTicha = false; this.behVyrizen = false;
  }
  /** silence calibration for the onset detector (frames without playing) */
  kalibruj(ramce) { return this.detektor.kalibruj(ramce); }
  /** next expected note / chord (MIDI number or array; empty = nothing, every onset is then "wrong") */
  ocekavej(midiTony) {
    this.ocekavane = [...new Set((Array.isArray(midiTony) ? midiTony : midiTony == null ? [] : [midiTony]).map(Number))];
    this.zni = null; this.neOk = 0; this.novota = false; this.okPocet = 0; this.zTicha = false; this.behVyrizen = false;
  }
  /**
   * @param {Float32Array|number[]} ramec frame of samples (recommended 4096, hop 1024)
   * @param {number} cas time of the frame's last sample in s
   * @returns {{typ:'trefa', midi:number[]}|{typ:'vedle', midi:number}|null}
   */
  zpracuj(ramec, cas) {
    const { vzorkovani, ladeni, tolerance, prah, oknoTrefy, jistotaVedle, potvrzeni } = this.volby;
    const fMax = Math.min(5000, vzorkovani * 0.45);
    const n = this.detektor.zpracuj(ramec, cas);
    if (n.nastup) { this.nastupCas = cas; this.vyrizeno = false; this.novota = false; this.behVyrizen = false; this.kandidatVedle = null; }
    const vOkne = !this.vyrizeno && this.nastupCas !== null && cas - this.nastupCas <= oknoTrefy;

    // spectrum of the whole frame + spectrum of the "new energy" (positive difference from frame t−2)
    const ticho = energie(ramec) < -65;
    const { mag, krok, zvetseni } = spektrum(ramec, vzorkovani);
    const stare = this.spektra.length === 2 && this.spektra[1].length === mag.length ? this.spektra[1] : null;
    this.spektra.unshift(mag);
    if (this.spektra.length > 2) this.spektra.pop();
    const tony = this.ocekavane;
    let ok = false;
    if (tony.length && !ticho) {
      // whole frame: do they sound? (without the octave-lower check – ringing previous notes would confuse it; the new energy guards it)
      const { seznam } = vrcholy(naDb(mag), krok, zvetseni, { fMax });
      ok = hodnot(seznam, tony, { ladeni, tolerance, prah, fMax, oktavaNiz: false }).ok;
      if (ok && !stare) this.novota = hodnot(seznam, tony, { ladeni, tolerance, prah, fMax }).ok;
      else if (ok) {
        const nove = new Float64Array(mag.length);
        for (let i = 0; i < mag.length; i++) nove[i] = Math.max(0, mag[i] - stare[i]);
        const nv = vrcholy(naDb(nove), krok, zvetseni, { fMax }).seznam;
        if (hodnot(nv, tony, { ladeni, tolerance, prah, fMax }).ok) this.novota = true;
      }
    }
    // continuous run of "ok" frames: how many there are and whether it started in silence (the note began sounding), not from a decay
    if (ok) {
      if (this.okPocet === 0) { this.zTicha = this.zni === false; this.behVyrizen = false; }
      this.okPocet++;
      this.zni = true; this.neOk = 0;
    } else {
      this.okPocet = 0;
      if (this.zni === null || ++this.neOk >= 3) { this.zni = false; this.novota = false; }
    }
    if (ok && this.okPocet >= potvrzeni && this.novota && !this.behVyrizen && (vOkne || this.zTicha)) {
      this.vyrizeno = true; this.behVyrizen = true; this.novota = false;
      return { typ: 'trefa', midi: [...tony] };
    }
    // wrong note: only a confident different note after an onset (monophonic), confirmed in two frames
    if (vOkne && !ticho) {
      const posledni = ramec.length > 2048 ? (ramec.subarray ? ramec.subarray(ramec.length - 2048) : ramec.slice(-2048)) : ramec;
      const v = vyska(posledni, vzorkovani, { ladeni, prah: jistotaVedle, min: 40 });
      if (v && !tony.includes(v.midi) && !(this.novota && ok)) {
        if (this.kandidatVedle === v.midi) {
          this.vyrizeno = true; this.behVyrizen = true;      // no hit will come later from the same sounding either
          return { typ: 'vedle', midi: v.midi };
        }
        this.kandidatVedle = v.midi;
      } else this.kandidatVedle = null;
    }
    return null;
  }
}

// ---------------------------------------------------------------- the app's own notes
/**
 * Is a "wrong note" the microphone heard really a note the app itself is playing (accompaniment, listening) from the
 * speakers or the piano? With backing on, the step's accompaniment sounds right after a hit, and its onset would
 * otherwise count as the player's wrong key (the next note then turns orange).
 * Counts the same pitch class (the monophonic estimate may be an octave off) and the 3rd harmonic, from the note's
 * start until `dozvuk` s after its end (input latency, ringing).
 * @param {number} midi heard note
 * @param {{p:number, od:number, do:number}[]} vlastni the app's notes: pitch, start and end in s (the AudioContext clock)
 * @param {number} cas now, the same clock
 */
export function zVlastnichTonu(midi, vlastni, cas, dozvuk = 0.6) {
  return vlastni.some(v => v.od <= cas + 0.05 && cas <= v.do + dozvuk && ((midi - v.p) % 12 === 0 || midi === v.p + 19));
}

// ---------------------------------------------------------------- tuning
/**
 * Estimates the instrument's tuning (A4 in Hz) from frames where a known note sounds – e.g. an out-of-tune acoustic piano.
 * For each frame it measures f0 (vyska within ±6 semitones of the expected note, to avoid an octave error),
 * refines it by the spectral peak of the 1st harmonic (if prominent) and returns
 * the median of f0 / 2^((m − 69)/12). Middle register works best (A4, C5): in the bass, string inharmonicity skews the estimate.
 * @param {Array<Float32Array|number[]>} ramce
 * @param {number} vzorkovani
 * @param {number|number[]} ocekavanyMidi one note for all frames, or an array per frame
 * @param {{jistota?:number}} [volby] minimum frame confidence (0.8)
 * @returns {number|null} tuning in Hz (to 0.1 Hz), null = no usable frame
 */
export function kalibraceLadeni(ramce, vzorkovani, ocekavanyMidi, { jistota = 0.8 } = {}) {
  const odhady = [];
  ramce.forEach((r, i) => {
    const m = Array.isArray(ocekavanyMidi) ? ocekavanyMidi[i] : ocekavanyMidi;
    if (m == null) return;
    const f = midiNaHz(m, 440);
    const v = vyska(r, vzorkovani, { min: f * 2 ** (-0.5), max: f * 2 ** 0.5, prah: jistota });
    if (!v) return;
    // refinement by the 1st harmonic peak in the spectrum (autocorrelation drifts upwards for inharmonic strings);
    // without a prominent fundamental (bass) the estimate from the period remains
    let f0 = v.f0;
    if (energie(r) >= -65) {
      const { mag, krok, zvetseni } = spektrum(r, vzorkovani);
      const { seznam } = vrcholy(naDb(mag), krok, zvetseni, { fMax: Math.min(5000, vzorkovani * 0.45) });
      let nej = null;
      for (const p of seznam) if (Math.abs(centy(p.f, v.f0)) <= 35 && p.vaha >= 0.5 && (!nej || p.db > nej.db)) nej = p;
      if (nej) f0 = nej.f;
    }
    odhady.push(f0 / 2 ** ((m - 69) / 12));
  });
  if (!odhady.length) return null;
  odhady.sort((a, b) => a - b);
  const k = odhady.length >> 1;
  const med = odhady.length % 2 ? odhady[k] : (odhady[k - 1] + odhady[k]) / 2;
  return Math.round(med * 10) / 10;
}
