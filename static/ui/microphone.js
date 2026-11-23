// Microphone as a replacement for MIDI: sound from the microphone → lib/microphone.js (Rozpoznavac) → the same vstupOn as the piano.
// The app always knows which notes it expects (`ocekavane()`), so it only has to verify them – more reliable than general transcription.
import { Rozpoznavac, zVlastnichTonu } from '../lib/microphone.js';
import { t } from '../lib/texts.js';

const RAMEC = 4096;              // ~85 ms
const RAMEC_BAS = 8192;          // resolve nearby fundamentals in low chords
const KROK_MS = 20;              // how often a frame is processed (~75 % overlap)
const KALIBRACE_RAMCU = 25;      // ~0.5 s of silence to estimate the noise

/**
 * @param {{ audio: () => AudioContext, ocekavane: () => number[]|null, trefa: (midi:number) => void,
 *           vedle: (midi:number) => void, stav: (text:string, aktivni:boolean) => void,
 *           vlastni?: () => {p:number, od:number, do:number}[] }} volby   vlastni = notes the app itself plays now
 */
export function vytvorMikrofon(volby) {
  let proud = null, zdroj = null, analyzer = null, casovac = 0, rozpoznavac = null;
  const kalibrace = [];
  let posledniOcekavane = '';

  async function zapni() {
    if (proud) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error(t('editor.mikrofon.nepodporuje'));
    proud = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const ac = volby.audio();
    zdroj = ac.createMediaStreamSource(proud);
    analyzer = ac.createAnalyser();
    analyzer.fftSize = RAMEC_BAS;
    analyzer.smoothingTimeConstant = 0;
    zdroj.connect(analyzer);                              // not sent to the speakers
    rozpoznavac = new Rozpoznavac();
    rozpoznavac.nastav({ vzorkovani: ac.sampleRate, ladeni: 440 });
    kalibrace.length = 0; posledniOcekavane = '';
    volby.stav(t('editor.mikrofon.kalibrace'), true);
    const dlouhy = new Float32Array(RAMEC_BAS);
    const kratky = dlouhy.subarray(RAMEC_BAS - RAMEC);
    casovac = setInterval(() => {
      analyzer.getFloatTimeDomainData(dlouhy);
      if (kalibrace.length < KALIBRACE_RAMCU) {
        kalibrace.push(kratky.slice());
        if (kalibrace.length === KALIBRACE_RAMCU) {
          rozpoznavac.kalibruj(kalibrace);
          volby.stav(t('editor.mikrofon.posloucha'), true);
        }
        return;
      }
      const cile = volby.ocekavane() || [];
      const klic = cile.join(',');
      if (klic !== posledniOcekavane) { rozpoznavac.ocekavej(cile); posledniOcekavane = klic; }
      if (!cile.length) return;
      const basovyAkord = cile.filter(m => m < 48).length >= 2;
      const u = rozpoznavac.zpracuj(basovyAkord ? dlouhy : kratky, ac.currentTime);
      if (u?.typ === 'trefa') u.midi.forEach(m => volby.trefa(m));
      // the accompaniment from the speakers is not the player's wrong key
      else if (u?.typ === 'vedle' && !zVlastnichTonu(u.midi, volby.vlastni?.() || [], ac.currentTime)) volby.vedle(u.midi);
    }, KROK_MS);
  }

  function vypni() {
    clearInterval(casovac); casovac = 0;
    try { zdroj?.disconnect(); } catch { /* */ }
    proud?.getTracks().forEach(t => t.stop());
    proud = zdroj = analyzer = rozpoznavac = null;
    volby.stav('', false);
  }

  return { zapni, vypni, get aktivni() { return !!proud; } };
}
