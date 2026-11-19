// Microphone as a replacement for MIDI: sound from the microphone → lib/microphone.js (Rozpoznavac) → the same vstupOn as the piano.
// The app always knows which notes it expects (`ocekavane()`), so it only has to verify them – more reliable than general transcription.
import { Rozpoznavac } from '../lib/microphone.js';
import { t } from '../lib/texts.js';

const RAMEC = 4096;              // ~85 ms – needed for bass notes below C3
const KROK_MS = 20;              // how often a frame is processed (~75 % overlap)
const KALIBRACE_RAMCU = 25;      // ~0.5 s of silence to estimate the noise

/**
 * @param {{ audio: () => AudioContext, ocekavane: () => number[]|null, trefa: (midi:number) => void,
 *           vedle: (midi:number) => void, stav: (text:string, aktivni:boolean) => void }} volby
 */
export function vytvorMikrofon(volby) {
  let proud = null, zdroj = null, analyzer = null, casovac = 0, rozpoznavac = null;
  const kalibrace = [];
  let posledniOcekavane = '', posledniTrefa = { midi: [], cas: -1 };

  async function zapni() {
    if (proud) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error(t('editor.mikrofon.nepodporuje'));
    proud = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const ac = volby.audio();
    zdroj = ac.createMediaStreamSource(proud);
    analyzer = ac.createAnalyser();
    analyzer.fftSize = RAMEC;
    analyzer.smoothingTimeConstant = 0;
    zdroj.connect(analyzer);                              // not sent to the speakers
    rozpoznavac = new Rozpoznavac();
    rozpoznavac.nastav({ vzorkovani: ac.sampleRate, ladeni: 440 });
    kalibrace.length = 0; posledniOcekavane = '';
    volby.stav(t('editor.mikrofon.kalibrace'), true);
    const ramec = new Float32Array(RAMEC);
    casovac = setInterval(() => {
      analyzer.getFloatTimeDomainData(ramec);
      if (kalibrace.length < KALIBRACE_RAMCU) {
        kalibrace.push(ramec.slice());
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
      const u = rozpoznavac.zpracuj(ramec, ac.currentTime);
      if (u?.typ === 'trefa') {
        // safeguard: the same note within 250 ms is the decay of the same keystroke, not a new one (otherwise repeated notes would be skipped)
        const nove = u.midi.filter(m => !(posledniTrefa.midi.includes(m) && ac.currentTime - posledniTrefa.cas < 0.25));
        if (nove.length) { posledniTrefa = { midi: u.midi, cas: ac.currentTime }; nove.forEach(m => volby.trefa(m)); }
      }
      else if (u?.typ === 'vedle') volby.vedle(u.midi);
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
