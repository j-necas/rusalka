// The skills as zips for Claude and ChatGPT (Settings → Skills → Upload): one top-level folder named like the skill, without node_modules.
// node tools/skills.mjs   → build/rusalka-sheet-music.zip, build/rusalka-progress.zip   (npm run web also puts them in web/helper/)
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zip } from './zip.mjs';

export const SKILLY = ['rusalka-sheet-music', 'rusalka-progress'];
const KOREN = fileURLToPath(new URL('../plugin/skills/', import.meta.url));
const VYNECHAT = new Set(['node_modules', 'package-lock.json', '.DS_Store']);

/** skill folder → Buffer of a zip with `<name>/…` */
export const zabalSkill = jmeno => zip(rozbalSkill(jmeno));

function rozbalSkill(jmeno) {
  const out = {};
  const projdi = (d, pred) => {
    for (const f of readdirSync(d).sort()) {
      if (VYNECHAT.has(f)) continue;
      const c = join(d, f);
      if (statSync(c).isDirectory()) projdi(c, `${pred}${f}/`); else out[`${pred}${f}`] = readFileSync(c);
    }
  };
  projdi(join(KOREN, jmeno), `${jmeno}/`);
  return out;
}

/** writes all skill zips into a folder */
export function zabalVse(cil) {
  mkdirSync(cil, { recursive: true });
  for (const jm of SKILLY) writeFileSync(join(cil, `${jm}.zip`), zabalSkill(jm));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  zabalVse(fileURLToPath(new URL('../build/', import.meta.url)));
  console.log(`build/: ${SKILLY.map(s => s + '.zip').join(', ')}`);
}
