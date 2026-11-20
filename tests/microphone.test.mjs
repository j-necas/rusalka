// Tests of microphone pitch recognition on synthetic signals (sine waves, "piano" tones, noise, chords).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fft, midiNaHz, hzNaMidi, energie, vyska, obsahujeTony, DetektorNastupu, Rozpoznavac, kalibraceLadeni, zVlastnichTonu,
} from '../static/lib/microphone.js';

const VZ = 48000;

// ---------------------------------------------------------------- signal generators
/** deterministic noise (mulberry32) */
function nahoda(semeno = 1) {
  let a = semeno >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ticho = (n) => new Float32Array(n);
function sum(n, amp = 0.1, semeno = 7) {
  const r = nahoda(semeno), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * (2 * r() - 1);
  return x;
}
function sinus(f, n, amp = 0.5, vz = VZ, faze = 0.3) {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * Math.sin(2 * Math.PI * f * i / vz + faze);
  return x;
}
/**
 * "Piano" tone: harmonics with decreasing amplitude, slight inharmonicity f_h = h·f0·√(1 + B·h²),
 * exponential decay (higher harmonics faster), short attack; `slabyZaklad` = bass with a weak fundamental.
 */
function klavir(f0, n, { amp = 0.3, slabyZaklad = false, B = 0.0003, harmonickych = 10, utlum = 0.8, vz = VZ, od = 0 } = {}) {
  const x = new Float32Array(n);
  const nabeh = Math.round(0.004 * vz);
  for (let h = 1; h <= harmonickych; h++) {
    const fh = h * f0 * Math.sqrt(1 + B * h * h);
    if (fh > vz * 0.45) break;
    let a = amp / h ** 0.9;
    if (h === 1 && slabyZaklad) a *= 0.12;
    const tau = utlum / (1 + 0.3 * (h - 1)), faze = 0.7 * h;
    for (let i = od; i < n; i++) {
      const t = (i - od) / vz;
      const obal = Math.min(1, (i - od) / nabeh) * Math.exp(-t / tau);
      x[i] += a * obal * Math.sin(2 * Math.PI * fh * t + faze);
    }
  }
  return x;
}
const smichej = (...signaly) => {
  const n = Math.max(...signaly.map(s => s.length)), x = new Float32Array(n);
  for (const s of signaly) for (let i = 0; i < s.length; i++) x[i] += s[i];
  return x;
};
const centyOd = (f, cil) => 1200 * Math.log2(f / cil);
/** a slice of a longer signal (frame ending at sample `konec`) */
const ramecKonci = (x, konec, n) => x.subarray(konec - n, konec);
/** walks the signal in frames (size, hop) and returns [{ cas, ramec }]; cas = time of the last sample */
function* ramce(x, velikost = 4096, posun = 1024) {
  for (let konec = velikost; konec <= x.length; konec += posun) yield { cas: konec / VZ, ramec: x.subarray(konec - velikost, konec) };
}

// ---------------------------------------------------------------- FFT and conversions
test('FFT: a sine wave peaks in the right bin, the inverse transform restores the signal', () => {
  const n = 1024, re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.cos(2 * Math.PI * 37 * i / n);
  const kopie = re.slice();
  fft(re, im);
  const mag = Array.from(re, (r, i) => Math.hypot(r, im[i]));
  assert.ok(Math.abs(mag[37] - n / 2) < 1e-6);
  assert.ok(mag[36] < 1e-6 && mag[100] < 1e-6);
  fft(re, im, true);
  for (let i = 0; i < n; i++) assert.ok(Math.abs(re[i] - kopie[i]) < 1e-9);
  assert.throws(() => fft(new Float64Array(100), new Float64Array(100)));
});

test('MIDI ↔ Hz conversions', () => {
  assert.equal(midiNaHz(69), 440);
  assert.ok(Math.abs(midiNaHz(60) - 261.6256) < 1e-3);
  assert.ok(Math.abs(hzNaMidi(445, 445) - 69) < 1e-12);
  assert.ok(Math.abs(hzNaMidi(midiNaHz(60.3)) - 60.3) < 1e-9);
});

test('energy: RMS in dB', () => {
  assert.ok(Math.abs(energie(sinus(1000, 4800, 1)) + 3.01) < 0.05);
  assert.ok(Math.abs(energie(sinus(1000, 4800, 0.1)) + 23.01) < 0.05);
  assert.equal(energie(ticho(2048)), -120);
});

// ---------------------------------------------------------------- vyska
test('vyska: pure sine waves 55 Hz – 1760 Hz within ±10 cents', () => {
  for (const f of [55, 65.41, 82.41, 110, 196, 261.63, 440, 659.26, 880, 1318.5, 1760]) {
    const v = vyska(sinus(f, 2048), VZ);
    assert.ok(v, `${f} Hz nothing`);
    assert.ok(Math.abs(centyOd(v.f0, f)) <= 10, `${f} Hz → ${v.f0} (${centyOd(v.f0, f).toFixed(1)} c)`);
    assert.equal(v.midi, Math.round(hzNaMidi(f)));
    assert.ok(v.jistota > 0.9, `${f} Hz confidence ${v.jistota}`);
  }
  // also at 44.1 kHz and 1024 samples (higher tones)
  const v = vyska(sinus(523.25, 1024, 0.5, 44100), 44100);
  assert.ok(Math.abs(centyOd(v.f0, 523.25)) <= 10);
});

test('vyska: piano tones including bass with a weak fundamental – no octave error', () => {
  for (const [m, slabyZaklad] of [[36, true], [40, true], [48, false], [60, false], [69, false], [76, false], [84, false]]) {
    const f = midiNaHz(m);
    const x = klavir(f, 4096 + 2400, { slabyZaklad });
    const v = vyska(ramecKonci(x, 4096 + 2400, 2048), VZ);
    assert.ok(v, `MIDI ${m} nothing`);
    assert.equal(v.midi, m, `MIDI ${m} → ${v.midi} (${v.f0.toFixed(2)} Hz)`);
    assert.ok(Math.abs(v.cents) < 15, `MIDI ${m}: ${v.cents} c`);
  }
});

test('vyska: detuning ±30 cents and a different tuning', () => {
  for (const c of [-30, 30]) {
    const v = vyska(sinus(440 * 2 ** (c / 1200), 2048), VZ);
    assert.equal(v.midi, 69);
    assert.ok(Math.abs(v.cents - c) <= 3, `${c} → ${v.cents}`);
  }
  const v = vyska(sinus(445, 2048), VZ, { ladeni: 445 });
  assert.equal(v.midi, 69);
  assert.ok(Math.abs(v.cents) <= 3);
});

test('vyska: silence and noise → null, min/max range', () => {
  assert.equal(vyska(ticho(2048), VZ), null);
  assert.equal(vyska(sinus(440, 2048, 0.0005), VZ), null);          // below the silence threshold (−69 dB)
  for (const s of [1, 2, 3, 4, 5]) assert.equal(vyska(sum(2048, 0.2, s), VZ), null, `noise ${s}`);
  assert.equal(vyska(sinus(3000, 2048), VZ), null);                  // above max
  assert.ok(vyska(sinus(3000, 2048), VZ, { max: 4000 }));
});

// ---------------------------------------------------------------- obsahujeTony
const C4 = 60, Cis4 = 61, E4 = 64, G4 = 67;
const ton = (m, n = 4096, volby = {}) => klavir(midiNaHz(m), n, volby);
const okno = (x, n = 4096) => x.subarray(x.length - n);

test('obsahujeTony: tells C4 from C#4 (piano and sine, frame 2048 and 4096)', () => {
  for (const n of [2048, 4096]) {
    for (const gen of [m => ton(m, n + 1000), m => sinus(midiNaHz(m), n + 1000)]) {
      const c = okno(gen(C4), n), cis = okno(gen(Cis4), n);
      const a = obsahujeTony(c, VZ, [C4]), b = obsahujeTony(c, VZ, [Cis4]);
      assert.ok(a.ok && !a.navic, `C4 in C4 (${n}): ${JSON.stringify(a)}`);
      assert.ok(!b.ok && b.skore[Cis4] < 0.2 && b.navic, `C#4 in C4 (${n}): ${JSON.stringify(b)}`);
      assert.ok(obsahujeTony(cis, VZ, [Cis4]).ok);
      assert.ok(!obsahujeTony(cis, VZ, [C4]).ok);
    }
  }
});

test('obsahujeTony: recognises a C major triad, detects a missing tone, reports a foreign tone as extra', () => {
  const n = 4096;
  const trojzvuk = okno(smichej(ton(C4, n + 2000), ton(E4, n + 2000), ton(G4, n + 2000)), n);
  const r = obsahujeTony(trojzvuk, VZ, [C4, E4, G4]);
  assert.ok(r.ok && !r.navic, JSON.stringify(r));
  // without E: E4 missing
  const kvinta = okno(smichej(ton(C4, n + 2000), ton(G4, n + 2000)), n);
  const r2 = obsahujeTony(kvinta, VZ, [C4, E4, G4]);
  assert.ok(!r2.ok && r2.skore[E4] < 0.3 && r2.skore[C4] >= 0.5 && r2.skore[G4] >= 0.5, JSON.stringify(r2));
  // minor instead of major (Eb instead of E)
  const moll = okno(smichej(ton(C4, n + 2000), ton(63, n + 2000), ton(G4, n + 2000)), n);
  assert.ok(!obsahujeTony(moll, VZ, [C4, E4, G4]).ok);
  // only C4 expected, a triad sounds → C4 ok, but extra
  const r3 = obsahujeTony(trojzvuk, VZ, [C4]);
  assert.ok(r3.ok && r3.navic, JSON.stringify(r3));
  // also with a 2048 frame
  assert.ok(obsahujeTony(okno(smichej(ton(C4, 4096), ton(E4, 4096), ton(G4, 4096)), 2048), VZ, [C4, E4, G4]).ok);
  // C4 + F#4 when C4 is expected → extra
  const r4 = obsahujeTony(okno(smichej(ton(C4, n + 1000), ton(66, n + 1000)), n), VZ, [C4]);
  assert.ok(r4.ok && r4.navic);
});

test('obsahujeTony: octave confusion (an octave higher / lower) and bass with a weak fundamental', () => {
  const n = 4096;
  // expects C4, C5 sounds → no (odd harmonics missing); C3 sounds → no (component at f0/2)
  assert.ok(!obsahujeTony(okno(ton(72, n + 1000)), VZ, [C4]).ok);
  assert.ok(!obsahujeTony(okno(ton(48, n + 1000)), VZ, [C4]).ok);
  assert.ok(obsahujeTony(okno(ton(48, n + 1000)), VZ, [C4]).navic);
  assert.ok(!obsahujeTony(okno(sinus(midiNaHz(72), n)), VZ, [C4]).ok);
  // bass C2 with a weak fundamental: recognised, but not as C3 or C1
  for (const m of [36, 38, 40, 43]) {
    const bas = okno(ton(m, n + 1500, { slabyZaklad: true }));
    const r = obsahujeTony(bas, VZ, [m]);
    assert.ok(r.ok && !r.navic, `bass ${m}: ${JSON.stringify(r)}`);
    assert.ok(!obsahujeTony(bas, VZ, [m + 12]).ok, `bass ${m} as ${m + 12}`);
    assert.ok(!obsahujeTony(bas, VZ, [m + 1]).ok, `bass ${m} as ${m + 1}`);
    assert.ok(!obsahujeTony(bas, VZ, [m - 1]).ok, `bass ${m} as ${m - 1}`);
  }
  // expects C3 + C4 (octave in the left hand) → ok
  assert.ok(obsahujeTony(okno(smichej(ton(48, n + 1000), ton(60, n + 1000))), VZ, [48, 60]).ok);
});

test('obsahujeTony: detuning ±30 cents passes with tolerance 50, and with calibrated tuning even with tolerance 20', () => {
  const n = 4096;
  for (const c of [-30, 30]) {
    const x = okno(klavir(midiNaHz(C4) * 2 ** (c / 1200), n + 1000), n);
    assert.ok(obsahujeTony(x, VZ, [C4]).ok, `${c} c`);
    assert.ok(!obsahujeTony(x, VZ, [C4], { tolerance: 20 }).ok, `${c} c with tolerance 20`);
    assert.ok(!obsahujeTony(x, VZ, [c > 0 ? Cis4 : 59]).ok, `${c} c is not the neighbouring semitone`);
    const ladeni = 440 * 2 ** (c / 1200);
    assert.ok(obsahujeTony(x, VZ, [C4], { ladeni, tolerance: 20 }).ok, `${c} c with tuning ${ladeni}`);
  }
});

test('obsahujeTony: silence and noise → nothing sounds, nothing extra', () => {
  const r = obsahujeTony(ticho(4096), VZ, [C4]);
  assert.deepEqual(r, { ok: false, skore: { 60: 0 }, navic: false });
  for (const s of [1, 2, 3]) {
    const q = obsahujeTony(sum(4096, 0.1, s), VZ, [C4, E4, G4]);
    assert.ok(!q.ok && !q.navic, `noise ${s}: ${JSON.stringify(q)}`);
  }
  // a tone in noise (SNR ~ 20 dB) is recognised
  const x = smichej(okno(ton(C4, 5000)), sum(4096, 0.01, 9));
  assert.ok(obsahujeTony(x, VZ, [C4]).ok);
});

// ---------------------------------------------------------------- DetektorNastupu
/** onsets (times) in the signal */
function nastupy(x, volby = {}, velikost = 4096, posun = 1024, kalibrace = null) {
  const d = new DetektorNastupu(volby), out = [];
  if (kalibrace) d.kalibruj(kalibrace);
  for (const { cas, ramec } of ramce(x, velikost, posun)) if (d.zpracuj(ramec, cas).nastup) out.push(cas);
  return out;
}
const sekund = s => Math.round(s * VZ);

test('DetektorNastupu: silence → tone gives one onset at the right time, the decay gives no more', () => {
  const x = new Float32Array(sekund(2));
  x.set(klavir(midiNaHz(C4), sekund(1.5)), sekund(0.5));
  const t = nastupy(x);
  assert.equal(t.length, 1, JSON.stringify(t));
  assert.ok(t[0] >= 0.5 && t[0] <= 0.5 + 0.045, `onset at ${t[0]}`);
});

test('DetektorNastupu: repeated strike of the same pitch, a tone decaying under a new one, minimum gap', () => {
  const n = sekund(2.5);
  // C4 at 0.3 s and again at 0.8 s (the first still sounding), then E4 at 1.4 s over the decaying C4
  const x = smichej(
    klavir(midiNaHz(C4), n, { od: sekund(0.3) }),
    klavir(midiNaHz(C4), n, { od: sekund(0.8) }),
    klavir(midiNaHz(E4), n, { od: sekund(1.4), amp: 0.2 }),
  );
  const t = nastupy(x);
  assert.equal(t.length, 3, JSON.stringify(t));
  [0.3, 0.8, 1.4].forEach((c, i) => assert.ok(t[i] >= c && t[i] <= c + 0.045, `${c} → ${t[i]}`));
  // two strikes 40 ms apart → one onset (minOdstup 80 ms)
  const y = smichej(klavir(midiNaHz(C4), sekund(1), { od: sekund(0.3) }), klavir(midiNaHz(G4), sekund(1), { od: sekund(0.34) }));
  assert.equal(nastupy(y).length, 1);
  // strikes 120 ms apart → two onsets (frame 2048, hop 512)
  const z = smichej(klavir(midiNaHz(C4), sekund(1), { od: sekund(0.3) }), klavir(midiNaHz(G4), sekund(1), { od: sekund(0.42) }));
  const tz = nastupy(z, {}, 2048, 512);
  assert.equal(tz.length, 2, JSON.stringify(tz));
  assert.ok(tz[1] >= 0.42 && tz[1] < 0.45);
});

test('DetektorNastupu: noise without a tone gives no onset (with or without calibration), a tone in noise does; sila grows with loudness', () => {
  const s = sum(sekund(2), 0.01, 3);
  assert.equal(nastupy(s, {}, 4096, 1024, [sum(4096, 0.01, 11), sum(4096, 0.01, 12)]).length, 0);
  assert.equal(nastupy(s).length, 0);
  const x = smichej(s, klavir(midiNaHz(G4), sekund(2), { od: sekund(1) }));
  const t = nastupy(x, {}, 4096, 1024, [sum(4096, 0.01, 11)]);
  assert.equal(t.length, 1);
  assert.ok(t[0] >= 1 && t[0] - 1 < 0.045);
  const sila = amp => {
    const d = new DetektorNastupu();
    const y = new Float32Array(sekund(1)); y.set(klavir(440, sekund(0.5), { amp }), sekund(0.5));
    for (const { cas, ramec } of ramce(y)) { const r = d.zpracuj(ramec, cas); if (r.nastup) return r.sila; }
    return null;
  };
  assert.ok(sila(0.3) > sila(0.03) && sila(0.03) > 0);
});

test('DetektorNastupu: flute – soft attack and legato to another note', () => {
  // sine with a 30 ms attack, after 0.5 s smoothly another pitch (legato without an energy dip)
  const n = sekund(1.5), x = new Float32Array(n);
  let faze = 0;
  for (let i = sekund(0.2); i < n; i++) {
    const t = (i - sekund(0.2)) / VZ, f = t < 0.5 ? midiNaHz(72) : midiNaHz(76);
    faze += 2 * Math.PI * f / VZ;
    x[i] = 0.3 * Math.min(1, t / 0.03) * (Math.sin(faze) + 0.3 * Math.sin(2 * faze));
  }
  const t = nastupy(x);
  assert.equal(t.length, 2, JSON.stringify(t));
  assert.ok(Math.abs(t[0] - 0.2) < 0.04 && Math.abs(t[1] - 0.7) < 0.04, JSON.stringify(t));
});

// ---------------------------------------------------------------- Rozpoznavac
/** runs the signal through the recogniser; `plan` = [[cas, tony]] – when the UI switches the expectation; returns events with times */
function prehraj(x, plan, volby = {}, velikost = 4096, posun = 1024) {
  const r = new Rozpoznavac({ vzorkovani: VZ, ...volby }), out = [];
  const kroky = [...plan];
  for (const { cas, ramec } of ramce(x, velikost, posun)) {
    while (kroky.length && kroky[0][0] <= cas) r.ocekavej(kroky.shift()[1]);
    const u = r.zpracuj(ramec, cas);
    if (u) out.push({ cas: Math.round(cas * 1000) / 1000, ...u });
  }
  return out;
}

test('Rozpoznavac: hit C4, then a repeated C4 only after a new strike, then E4 over the decaying C4', () => {
  const n = sekund(3);
  const x = smichej(
    klavir(midiNaHz(C4), n, { od: sekund(0.3) }),
    klavir(midiNaHz(C4), n, { od: sekund(1.2) }),
    klavir(midiNaHz(E4), n, { od: sekund(2.0) }),
  );
  // after a hit the UI switches to the next note right away (at the first hit + 10 ms → a plan with times "after" the strikes is enough)
  const u = prehraj(x, [[0, [C4]], [0.5, [C4]], [1.5, [E4]]]);
  assert.deepEqual(u.map(e => [e.typ, e.midi]), [['trefa', [C4]], ['trefa', [C4]], ['trefa', [E4]]], JSON.stringify(u));
  assert.ok(u[0].cas - 0.3 < 0.08, `latency ${u[0].cas - 0.3}`);
  assert.ok(u[1].cas >= 1.2 && u[1].cas - 1.2 < 0.08, `repeated ${u[1].cas}`);   // not before the new strike
  assert.ok(u[2].cas >= 2.0 && u[2].cas - 2.0 < 0.1, `E4 ${u[2].cas}`);
});

test('Rozpoznavac: E4 played over the decaying expected C4 is not a hit but a miss', () => {
  const n = sekund(2.5);
  const x = smichej(klavir(midiNaHz(C4), n, { od: sekund(0.3) }), klavir(midiNaHz(E4), n, { od: sekund(1.0), amp: 0.4 }));
  const u = prehraj(x, [[0, [C4]], [0.6, [C4]]]);    // after the first hit a repeated C4 is expected
  assert.deepEqual(u.map(e => [e.typ, e.midi]), [['trefa', [C4]], ['vedle', E4]], JSON.stringify(u));
});

test('Rozpoznavac: miss on another tone, triad hit, nothing in silence and noise', () => {
  const n = sekund(1.5);
  const d4 = klavir(midiNaHz(62), n, { od: sekund(0.3) });
  assert.deepEqual(prehraj(d4, [[0, [C4]]]).map(e => [e.typ, e.midi]), [['vedle', 62]]);
  // triad
  const akord = smichej(...[C4, E4, G4].map(m => klavir(midiNaHz(m), n, { od: sekund(0.3), amp: 0.2 })));
  assert.deepEqual(prehraj(akord, [[0, [C4, E4, G4]]]).map(e => [e.typ, e.midi]), [['trefa', [C4, E4, G4]]]);
  // incomplete chord (no E) → no hit; vyska is uncertain on a chord → no miss either
  const neuplny = smichej(...[C4, G4].map(m => klavir(midiNaHz(m), n, { od: sekund(0.3), amp: 0.2 })));
  assert.ok(!prehraj(neuplny, [[0, [C4, E4, G4]]]).some(e => e.typ === 'trefa'));
  // silence, noise
  assert.deepEqual(prehraj(ticho(n), [[0, [C4]]]), []);
  assert.deepEqual(prehraj(sum(n, 0.01, 5), [[0, [C4]]]), []);
  // with no expectation: every confident tone is a miss
  assert.deepEqual(prehraj(d4, [[0, []]]).map(e => [e.typ, e.midi]), [['vedle', 62]]);
});

test('Rozpoznavac: softly attacked flute (no clear onset) and a detuned piano with calibrated tuning', () => {
  const n = sekund(1.5), x = new Float32Array(n), f = midiNaHz(72);
  for (let i = sekund(0.2); i < n; i++) {
    const t = (i - sekund(0.2)) / VZ;
    x[i] = 0.2 * Math.min(1, t / 0.25) * (Math.sin(2 * Math.PI * f * t) + 0.2 * Math.sin(4 * Math.PI * f * t));
  }
  assert.deepEqual(prehraj(x, [[0, [72]]]).map(e => [e.typ, e.midi]), [['trefa', [72]]]);
  // piano tuned 40 cents low: with 440 tuning A4 is off (tolerance 30), with calibration a hit
  const posun = 2 ** (-40 / 1200);
  const a4 = klavir(440 * posun, sekund(1.5), { od: sekund(0.3) });
  const ladeni = kalibraceLadeni([...ramce(a4, 4096, 4096)].slice(2, 8).map(r => r.ramec), VZ, 69);
  assert.ok(Math.abs(ladeni - 440 * posun) < 1, `tuning ${ladeni}`);
  assert.ok(!prehraj(a4, [[0, [69]]], { tolerance: 30 }).some(e => e.typ === 'trefa'));
  assert.deepEqual(prehraj(a4, [[0, [69]]], { tolerance: 30, ladeni }).map(e => [e.typ, e.midi]), [['trefa', [69]]]);
});

test('Rozpoznavac: scale, octave confusions, bass, chord with bass and fast repetition (44.1 and 48 kHz, both frames)', () => {
  for (const vz of [44100, 48000]) {
    const s = c => Math.round(c * vz), n = s(2.5);
    const p = (m, od, o = {}) => klavir(midiNaHz(m), n, { vz, od: s(od), ...o });
    const hraj = (x, plan, velikost = 4096, posun = 1024) => {
      const r = new Rozpoznavac({ vzorkovani: vz }), out = [], kroky = [...plan];
      for (let konec = velikost; konec <= x.length; konec += posun) {
        const cas = konec / vz;
        while (kroky.length && kroky[0][0] <= cas) r.ocekavej(kroky.shift()[1]);
        const u = r.zpracuj(x.subarray(konec - velikost, konec), cas);
        if (u) out.push([u.typ, u.midi, cas]);
      }
      return out;
    };
    const jen = u => u.map(([typ, midi]) => [typ, midi]);
    // scale C D E F G (legato, previous tones decaying), the UI switches after every hit
    const stupnice = smichej(...[60, 62, 64, 65, 67].map((m, i) => p(m, 0.3 + 0.35 * i, { utlum: 0.5 })));
    const plan = [[0, [60]], [0.45, [62]], [0.8, [64]], [1.15, [65]], [1.5, [67]]];
    for (const [vel, pos] of [[4096, 1024], [2048, 512]]) {
      const u = hraj(stupnice, plan, vel, pos);
      assert.deepEqual(jen(u), [60, 62, 64, 65, 67].map(m => ['trefa', [m]]), `${vz} ${vel}: ${JSON.stringify(u)}`);
      u.forEach(([, , cas], i) => assert.ok(cas - (0.3 + 0.35 * i) < 0.1, `${vz} ${vel} latence ${cas}`));
    }
    // octave confusions → miss with the actual pitch
    assert.deepEqual(jen(hraj(p(72, 0.3), [[0, [60]]])), [['vedle', 72]]);
    assert.deepEqual(jen(hraj(p(48, 0.3), [[0, [60]]])), [['vedle', 48]]);
    assert.deepEqual(jen(hraj(p(36, 0.3, { slabyZaklad: true }), [[0, [48]]])), [['vedle', 36]]);
    // bass with a weak fundamental and a chord with bass in the left hand
    assert.deepEqual(jen(hraj(p(36, 0.3, { slabyZaklad: true }), [[0, [36]]])), [['trefa', [36]]]);
    const akord = smichej(p(48, 0.3, { amp: 0.25 }), ...[60, 64, 67].map(m => p(m, 0.3, { amp: 0.15 })));
    assert.deepEqual(jen(hraj(akord, [[0, [48, 60, 64, 67]]])), [['trefa', [48, 60, 64, 67]]]);
    // fast repetition of the same tone every 150 ms without switching the expectation → 4 hits
    const opak = smichej(...[0, 1, 2, 3].map(i => p(67, 0.3 + 0.15 * i, { utlum: 0.4 })));
    assert.equal(hraj(opak, [[0, [67]]]).filter(([typ]) => typ === 'trefa').length, 4);
  }
});

// ---------------------------------------------------------------- kalibraceLadeni
test('kalibraceLadeni: piano detuned ±30 cents and 445 Hz, various tones, unusable frames', () => {
  for (const ladeni of [440 * 2 ** (-30 / 1200), 440 * 2 ** (30 / 1200), 445, 432]) {
    const tony = [57, 60, 64, 69, 72];
    const r = tony.map(m => okno(klavir(ladeni * 2 ** ((m - 69) / 12), 6000)));
    const odhad = kalibraceLadeni(r, VZ, tony);
    assert.ok(Math.abs(odhad - ladeni) < 0.6, `${ladeni.toFixed(2)} → ${odhad}`);
  }
  assert.equal(kalibraceLadeni([ticho(4096), sum(4096)], VZ, 69), null);
  // no risk of an octave error: bass with a weak fundamental
  const bas = okno(klavir(midiNaHz(36, 442), 6000, { slabyZaklad: true, B: 0.0001 }));
  assert.ok(Math.abs(kalibraceLadeni([bas], VZ, 36) - 442) < 2);
});

// ---------------------------------------------------------------- the app's own notes (accompaniment from the speakers)
test('Rozpoznavac: accompaniment from the speakers after a hit is heard as a wrong note – zVlastnichTonu recognises it', () => {
  const n = sekund(3), C3 = 48, F4 = 65;
  // “Find the notes” with backing: C4 is hit, the app plays the step's bass C3 at once, the player then plays F4
  const x = smichej(klavir(midiNaHz(C4), n, { od: sekund(0.3) }), klavir(midiNaHz(C3), n, { od: sekund(0.6), amp: 0.25 }),
    klavir(midiNaHz(F4), n, { od: sekund(1.6) }));
  const u = prehraj(x, [[0, [C4]], [0.45, [F4]]]);
  assert.deepEqual(u.map(e => [e.typ, e.midi]), [['trefa', [C4]], ['vedle', C3], ['trefa', [F4]]], JSON.stringify(u));
  const G2 = 43, vlastni = [{ p: G2, od: 0.6, do: 1.4 }];
  assert.ok(zVlastnichTonu(C3, [{ p: C3, od: 0.6, do: 1.4 }], u[1].cas), 'the bass the app plays');
  assert.ok(zVlastnichTonu(G2, vlastni, 0.7), 'G2 too');
  assert.ok(zVlastnichTonu(G2 + 12, vlastni, 0.7), 'heard an octave higher');
  assert.ok(zVlastnichTonu(G2 + 19, vlastni, 0.7), 'its 3rd harmonic');
  assert.ok(zVlastnichTonu(G2, vlastni, 1.9), 'still ringing shortly after release');
  assert.ok(!zVlastnichTonu(G2 + 1, vlastni, 0.7), 'a different note is the player\'s');
  assert.ok(!zVlastnichTonu(G2, vlastni, 0.3), 'not before the app plays it');
  assert.ok(!zVlastnichTonu(G2, vlastni, 2.5), 'nor long after');
  assert.ok(!zVlastnichTonu(G2, [], 0.7), 'nothing played by the app');
});

// ---------------------------------------------------------------- performance
test('performance: 2048 samples at 48 kHz under 2 ms (vyska, obsahujeTony, DetektorNastupu, Rozpoznavac)', () => {
  const x = smichej(klavir(midiNaHz(C4), sekund(1)), klavir(midiNaHz(E4), sekund(1)), sum(sekund(1), 0.005));
  const mer = (nazev, f, opak = 200) => {
    for (let i = 0; i < 20; i++) f(i);
    const t0 = performance.now();
    for (let i = 0; i < opak; i++) f(i);
    const ms = (performance.now() - t0) / opak;
    assert.ok(ms < 2, `${nazev}: ${ms.toFixed(3)} ms`);
    return ms;
  };
  const r2048 = i => x.subarray(i * 64, i * 64 + 2048);
  mer('vyska', i => vyska(r2048(i), VZ));
  mer('obsahujeTony', i => obsahujeTony(r2048(i), VZ, [C4, E4, G4]));
  const d = new DetektorNastupu();
  mer('DetektorNastupu', i => d.zpracuj(r2048(i), i * 0.01));
  const r = new Rozpoznavac({ vzorkovani: VZ }); r.ocekavej([C4, E4]);
  mer('Rozpoznavac 2048', i => r.zpracuj(r2048(i), i * 0.01));
  const r4 = new Rozpoznavac({ vzorkovani: VZ }); r4.ocekavej([C4, E4]);
  mer('Rozpoznavac 4096', i => r4.zpracuj(x.subarray(i * 64, i * 64 + 4096), i * 0.01), 100);
});
