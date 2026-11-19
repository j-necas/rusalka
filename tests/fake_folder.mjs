// In-memory folder with the same interface as FileSystemDirectoryHandle (for storage and migration tests).
let hodiny = 1000;
export const tik = () => ++hodiny;
class FakeSoubor {
  kind = 'file';
  constructor(name) { this.name = name; this.data = new Uint8Array(); this.lastModified = tik(); }
  async getFile() { const d = this.data, lm = this.lastModified; return { name: this.name, lastModified: lm, size: d.length, arrayBuffer: async () => d.slice().buffer }; }
  async createWritable() {
    const kusy = [];
    return { write: async b => { kusy.push(typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(b)); },
      close: async () => { const n = kusy.reduce((a, k) => a + k.length, 0), d = new Uint8Array(n); let o = 0; for (const k of kusy) { d.set(k, o); o += k.length; } this.data = d; this.lastModified = tik(); } };
  }
}
export class FakeSlozka {
  kind = 'directory';
  constructor(name = 'Rusalka', povoleni = 'granted') { this.name = name; this.deti = new Map(); this.povoleni = povoleni; }
  async getDirectoryHandle(n, { create = false } = {}) {
    let d = this.deti.get(n);
    if (!d) { if (!create) throw Object.assign(new Error('NotFound'), { name: 'NotFoundError' }); d = new FakeSlozka(n); this.deti.set(n, d); }
    if (d.kind !== 'directory') throw new Error('TypeMismatch');
    return d;
  }
  async getFileHandle(n, { create = false } = {}) {
    let f = this.deti.get(n);
    if (!f) { if (!create) throw Object.assign(new Error('NotFound'), { name: 'NotFoundError' }); f = new FakeSoubor(n); this.deti.set(n, f); }
    return f;
  }
  async removeEntry(n) { if (!this.deti.delete(n)) throw new Error('NotFound'); }
  async *entries() { for (const e of this.deti) yield e; }
  async queryPermission() { return this.povoleni; }
  async requestPermission() { this.povoleni = 'granted'; return 'granted'; }
}
