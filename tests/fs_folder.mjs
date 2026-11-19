// A folder on disk with the FileSystemDirectoryHandle interface (the subset lib/storage.js uses), so the app server
// shares one folder logic with the browser (name clashes, data merging, backups).
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const nenalezeno = jm => Object.assign(new Error(`${jm} neexistuje`), { name: 'NotFoundError' });

function souborHandle(cesta, name) {
  return {
    kind: 'file', name,
    async getFile() {
      const [b, s] = await Promise.all([readFile(cesta), stat(cesta)]);
      return { name, size: b.length, lastModified: s.mtimeMs, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) };
    },
    async createWritable() {
      const kusy = [];
      return {
        write: async d => { kusy.push(typeof d === 'string' ? Buffer.from(d) : Buffer.from(d instanceof ArrayBuffer ? new Uint8Array(d) : d)); },
        close: async () => {                          // whole file at once: temp file and rename
          const tmp = `${cesta}.${process.pid}.${Date.now()}.tmp`;
          await writeFile(tmp, Buffer.concat(kusy));
          await rename(tmp, cesta);
        },
      };
    },
  };
}

export function fsSlozka(cesta, name = cesta.split(/[\\/]/).filter(Boolean).pop() || cesta) {
  const ok = jm => { if (!jm || jm.includes('/') || jm.includes('\\') || jm === '.' || jm === '..') throw new TypeError(`neplatné jméno: ${jm}`); };
  return {
    kind: 'directory', name, cesta,
    async getDirectoryHandle(jm, { create = false } = {}) {
      ok(jm);
      const c = join(cesta, jm);
      try { if (!(await stat(c)).isDirectory()) throw new TypeError(`${jm} není složka`); }
      catch (e) { if (e instanceof TypeError) throw e; if (!create) throw nenalezeno(jm); await mkdir(c, { recursive: true }); }
      return fsSlozka(c, jm);
    },
    async getFileHandle(jm, { create = false } = {}) {
      ok(jm);
      const c = join(cesta, jm);
      try { if (!(await stat(c)).isFile()) throw new TypeError(`${jm} není soubor`); }
      catch (e) { if (e instanceof TypeError) throw e; if (!create) throw nenalezeno(jm); await writeFile(c, ''); }
      return souborHandle(c, jm);
    },
    async removeEntry(jm) { ok(jm); await rm(join(cesta, jm)); },
    async *entries() {
      for (const d of await readdir(cesta, { withFileTypes: true })) {
        if (d.name.endsWith('.tmp')) continue;
        yield [d.name, d.isDirectory() ? fsSlozka(join(cesta, d.name), d.name) : souborHandle(join(cesta, d.name), d.name)];
      }
    },
    async queryPermission() { return 'granted'; },
    async requestPermission() { return 'granted'; },
  };
}
