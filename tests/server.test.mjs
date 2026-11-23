// The development server (tools/server.mjs) serves only its own folders and only to this computer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cestaKSouboru, povolenyHost } from '../tools/server.mjs';

const KOREN = fileURLToPath(new URL('..', import.meta.url));

test('dev server: a path never leaves songs/, static/, build/library/ or build/ (helper)', () => {
  assert.equal(cestaKSouboru('/songs/Ode to Joy.musicxml'), join(KOREN, 'songs', 'Ode to Joy.musicxml'));
  assert.equal(cestaKSouboru('/app.js'), join(KOREN, 'static', 'app.js'));
  assert.equal(cestaKSouboru('/library/index.json'), join(KOREN, 'build', 'library', 'index.json'));
  assert.equal(cestaKSouboru('/helper/rusalka-progress.zip'), join(KOREN, 'build', 'rusalka-progress.zip'));
  for (const zle of ['/songs/../.git/config', '/songs/../package.json', '/library/../rusalka-progress.zip', '/../.git/config',
    '/helper/../../.git/config', '/staticx/../../etc/passwd']) {
    assert.equal(cestaKSouboru(zle), null, zle);
  }
});

test('dev server: only requests for localhost or 127.0.0.1 (no DNS rebinding)', () => {
  for (const h of ['localhost:8765', '127.0.0.1:8765', 'localhost', '[::1]:8765']) assert.equal(povolenyHost(h), true, h);
  for (const h of ['evil.example:8765', 'localhost.evil.example', '', undefined]) assert.equal(povolenyHost(h), false, String(h));
});
