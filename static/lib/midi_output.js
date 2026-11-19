// Sound to the piano via Web MIDI: accompaniment and listening notes go to channel 2 of the connected piano instead of
// the synthesizer. Queue in JS: every 25 ms whatever should sound within 100 ms is sent with a timestamp
// (MIDIOutput.send(bytes, time)), so the rest of the queue can be dropped (browsers can't reliably MIDIOutput.clear()).
// Overlapping notes of the same pitch: the key is released only with the last one (a counter), a new strike releases
// it and strikes again.

export const KANAL = 1;                               // 0 = channel 1; the piano sends the child's playing on channel 1

/** the output belonging to the connected piano: same name as the input (or one contains the other); not other ports */
export function vyberVystup(vystupy, nazvyVstupu) {
  const patri = n => !!n && nazvyVstupu.some(v => v && (v === n || v.includes(n) || n.includes(v)));
  return [...vystupy].find(o => patri(o.name)) || null;
}

export function vytvorVystup({ ted = () => performance.now(), interval = (f, ms) => setInterval(f, ms),
  zrusInterval = id => clearInterval(id), tikMs = 25, dopredu = 100 } = {}) {
  let port = null, fronta = [], poradi = 0, casovac = null;
  const zni = new Map();                              // pitch → how many times it is sounding right now
  const posli = (b, ts) => { try { port.send(b, ts); } catch { /* the piano was disconnected */ } };
  function tik() {
    const hranice = ted() + dopredu;
    while (fronta.length && fronta[0].t <= hranice) {
      const u = fronta.shift();
      if (!port) continue;
      if (u.v > 0) {
        const n = zni.get(u.p) || 0;
        if (n > 0) posli([0x80 | KANAL, u.p, 0], u.t);
        zni.set(u.p, n + 1);
        posli([0x90 | KANAL, u.p, u.v], u.t);
      } else if (zni.has(u.p)) {
        const n = zni.get(u.p) - 1;
        if (n > 0) zni.set(u.p, n);
        else { zni.delete(u.p); posli([0x80 | KANAL, u.p, 0], u.t); }
      }
    }
    if (!fronta.length && casovac != null) { zrusInterval(casovac); casovac = null; }
  }
  const V = {
    pouzivaSe: false,
    get nazev() { return port?.name || null; },
    pripoj(p) {
      if (p === port) return;
      if (port) V.ticho();
      port = p; zni.clear();
    },
    /** udalosti: [{ ms: in how many ms from now, p: pitch, v: velocity 1–127 (0 = release) }] → false without a piano */
    hraj(udalosti) {
      if (!port) return false;
      V.pouzivaSe = true;
      const t0 = ted();
      for (const u of udalosti) fronta.push({ t: t0 + Math.max(0, u.ms), i: poradi++, p: u.p & 0x7f, v: Math.max(0, Math.min(127, u.v | 0)) });
      fronta.sort((a, b) => a.t - b.t || a.i - b.i);
      if (casovac == null) casovac = interval(tik, tikMs);
      tik();
      return true;
    },
    /** drop the queue and silence what is sounding – including notes already sent with a time up to 100 ms ahead */
    ticho() {
      fronta = [];
      if (casovac != null) { zrusInterval(casovac); casovac = null; }
      if (port) {
        const t = ted(), pozdeji = t + dopredu + 5;
        for (const p of zni.keys()) { posli([0x80 | KANAL, p, 0], t); posli([0x80 | KANAL, p, 0], pozdeji); }
        posli([0xB0 | KANAL, 123, 0], t); posli([0xB0 | KANAL, 123, 0], pozdeji);
      }
      zni.clear();
    },
  };
  return V;
}
