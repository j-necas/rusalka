// The skills as zips for web Claude / ChatGPT (npm run skills → build/*.zip, served by the website under helper/):
// one top-level folder named like the skill, frontmatter within the platforms' limits, the check runs offline.
import './setup.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { rozbal } from '../tools/zip.mjs';
import { zabalSkill, SKILLY } from '../tools/skills.mjs';

const frontmatter = text => Object.fromEntries((text.match(/^---\n([\s\S]*?)\n---/)?.[1] || '').split('\n')
  .map(l => l.match(/^(\w[\w-]*):\s*(.*)$/)).filter(Boolean).map(m => [m[1], m[2]]));

test('both skills: one folder named like the skill, SKILL.md with a short description, no node_modules', () => {
  assert.deepEqual(SKILLY, ['rusalka-sheet-music', 'rusalka-progress']);
  for (const jm of SKILLY) {
    const soubory = rozbal(zabalSkill(jm));
    const cesty = Object.keys(soubory);
    assert.ok(cesty.every(c => c.startsWith(jm + '/')), cesty.join(', '));
    assert.ok(!cesty.some(c => c.includes('node_modules') || c.includes('package-lock')), 'no node_modules');
    const f = frontmatter(String(soubory[`${jm}/SKILL.md`]));
    assert.equal(f.name, jm);
    assert.ok(/^[a-z0-9-]{1,64}$/.test(f.name) && !/claude|anthropic/.test(f.name));
    assert.ok(f.description && f.description.length <= 200, `${jm}: description ${f.description?.length} characters`);
  }
});

test('rusalka-sheet-music from the zip: the check runs offline without node_modules and writes MusicXML', () => {
  const d = mkdtempSync(join(tmpdir(), 'rusalka-skill-'));
  for (const [c, b] of Object.entries(rozbal(zabalSkill('rusalka-sheet-music')))) { mkdirSync(dirname(join(d, c)), { recursive: true }); writeFileSync(join(d, c), b); }
  const pisen = join(d, 'song.txt');
  writeFileSync(pisen, 'title: Test\ntime: 2/4\n---\n1) C | C4/4 E4/4\n2) G7 | G4/4 F4/8\n');
  const out = execFileSync(process.execPath, ['rusalka-sheet-music/scripts/sheet.mjs', 'check', pisen], { cwd: d, encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.match(out, /2\/4/);
  assert.match(out, /takt 2|bar 2/i, out);
  assert.ok(existsSync(join(d, 'song.trener.musicxml')));
  assert.match(readFileSync(join(d, 'song.trener.musicxml'), 'utf8'), /score-partwise/);
});

test('the website serves the skills next to the app (npm run web → web/helper/*.zip)',
  { skip: !existsSync(new URL('../static/vendor/verovio-toolkit-wasm.js', import.meta.url)) && 'no static/vendor' }, () => {
    // a temp output folder, so the test never overwrites web/
    const ven = mkdtempSync(join(tmpdir(), 'rusalka-web-'));
    try {
      execFileSync('node', ['tools/web.mjs'], { cwd: new URL('../', import.meta.url).pathname, stdio: 'ignore', env: { ...process.env, RUSALKA_WEB_OUT: ven } });
      for (const jm of SKILLY) assert.ok(existsSync(join(ven, 'helper', `${jm}.zip`)), jm);
    } finally { rmSync(ven, { recursive: true, force: true }); }
  });

test('only the skills are published, no plugin packaging', () => {
  for (const f of ['../.claude-plugin', '../plugin/.claude-plugin', '../plugin/chatgpt']) assert.ok(!existsSync(new URL(f, import.meta.url)), f);
});
