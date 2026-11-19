// static/lib/format.js: the text notation reference (plugin/skills/rusalka-sheet-music/references/format.md) as a string, so
// the app can put it into the prompt for the helper. One source for the skill and the app; a test checks it is current.
// node tools/format-js.mjs   (also run by npm run skill)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const formatJs = () => '// Generated from plugin/skills/rusalka-sheet-music/references/format.md (tools/format-js.mjs) – do not edit by hand.\n'
  + `export const FORMAT = ${JSON.stringify(readFileSync(new URL('../plugin/skills/rusalka-sheet-music/references/format.md', import.meta.url), 'utf8'))};\n`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(new URL('../static/lib/format.js', import.meta.url), formatJs());
  console.log('static/lib/format.js');
}
