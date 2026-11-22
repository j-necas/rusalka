import { test } from 'node:test';
import assert from 'node:assert/strict';
import { t, nastavJazyk, jazyk, nactiSlovnik } from '../static/lib/texts.js';
import cs from '../static/lang/cs.js';
import en from '../static/lang/en.js';
import { vychoziJazyk, NAZVY_JAZYKU } from '../static/lib/texts.js';

test('t: substitution and plurals in Czech', () => {
  nastavJazyk('cs', { pisni: { one: '{n} písnička', few: '{n} písničky', other: '{n} písniček' }, ahoj: 'Ahoj, {jmeno}!' });
  assert.equal(jazyk(), 'cs');
  assert.equal(t('ahoj', { jmeno: 'Ema' }), 'Ahoj, Ema!');
  assert.deepEqual([1, 2, 5].map(n => t('pisni', { n })), ['1 písnička', '2 písničky', '5 písniček']);
  assert.equal(t('neni'), 'neni');
});

test('default Czech dictionary: strings and plural forms are complete', () => {
  nastavJazyk('cs');
  for (const [k, v] of Object.entries(cs)) {
    if (typeof v === 'object') for (const tvar of ['one', 'few', 'other']) assert.ok(v[tvar], `${k}.${tvar}`);
    else assert.equal(typeof v, 'string', k);
  }
});

test('English: plurals and the same keys as Czech', () => {
  nastavJazyk('en');
  assert.deepEqual([1, 2, 5].map(n => t('pisni', { n })), ['1 song', '2 songs', '5 songs']);
  assert.deepEqual(Object.keys(en).filter(k => !(k in cs)), [], 'extra keys in en');
  assert.deepEqual(Object.keys(cs).filter(k => !(k in en)), [], 'missing in en');
  nastavJazyk('cs');
});

test('a new install starts in the first browser language Rusalka speaks, else English', () => {
  assert.deepEqual(['cs-CZ', 'sk', 'en-US', 'de-DE', 'pt-BR', 'pt-PT', 'zh-TW', 'zh-Hans-CN', 'fr-CA', 'nl-NL', undefined].map(l => vychoziJazyk(l)),
    ['cs', 'sk', 'en', 'de', 'pt-BR', 'pt', 'zh-CN', 'zh-CN', 'fr', 'en', 'en']);
  assert.equal(vychoziJazyk(['nl-NL', 'de-AT', 'en']), 'de');   // the first language of the list Rusalka speaks
  assert.equal(vychoziJazyk([]), 'en');
});

test('the language selects: the most spoken European languages first, then Russian and Asian ones', () => {
  assert.deepEqual(Object.keys(NAZVY_JAZYKU), ['en', 'es', 'fr', 'pt', 'pt-BR', 'de', 'it', 'pl', 'uk', 'cs', 'sk', 'ru', 'zh-CN', 'hi', 'ar', 'ja']);
  assert.deepEqual(Object.keys(NAZVY_JAZYKU).sort(), ['ar', 'cs', 'de', 'en', 'es', 'fr', 'hi', 'it', 'ja', 'pl', 'pt', 'pt-BR', 'ru', 'sk', 'uk', 'zh-CN']);
});

test('an existing installation without a saved language stays in Czech', () => {
  assert.equal(vychoziJazyk('en-US', true), 'cs');
  assert.equal(vychoziJazyk('en-US', false), 'en');
});

test('German, French and Spanish dictionaries provide every text and preserve placeholders', async () => {
  for (const [code, greeting] of [['de', 'Zurück'], ['fr', 'Retour'], ['es', 'Volver']]) {
    nastavJazyk(code, await nactiSlovnik(code));
    assert.equal(t('zpet'), greeting);
    for (const [key, value] of Object.entries(en)) {
      const source = typeof value === 'string' ? value : value.other;
      const params = Object.fromEntries([...source.matchAll(/\{(\w+)\}/g)].map(m => [m[1], `VALUE_${m[1]}`]));
      params.n = 2;
      const translated = t(key, params);
      assert.notEqual(translated, key, `${code}: ${key}`);
      for (const [name, marker] of Object.entries(params)) if (name !== 'n') assert.ok(translated.includes(marker), `${code}: ${key} {${name}}`);
    }
  }
  nastavJazyk('cs');
});

test('new dictionaries cover the original keys and preserve placeholders in all plural forms', async () => {
  for (const code of ['uk', 'sk', 'pl', 'it', 'pt', 'ru', 'zh-CN', 'ja', 'pt-BR', 'hi', 'ar']) {
    const dict = await nactiSlovnik(code);
    assert.ok(dict, `${code} dictionary`);
    assert.deepEqual(Object.keys(en).filter(key => !(key in dict)), [], `${code} missing keys`);
    const ordinalKeys = new Intl.PluralRules(code, { type: 'ordinal' }).resolvedOptions().pluralCategories
      .map(form => `cviceni.radova.${form}`);
    assert.deepEqual(Object.keys(dict).filter(key => !(key in en) && !ordinalKeys.includes(key)), [], `${code} extra keys`);
    for (const key of ordinalKeys) {
      assert.equal(typeof dict[key], 'string', `${code} missing ordinal ${key}`);
      assert.deepEqual([...dict[key].matchAll(/\{(\w+)\}/g)].map(m => m[1]), ['n'], `${code} ordinal placeholder ${key}`);
    }
    for (const [key, original] of Object.entries(en)) {
      const sourceForms = typeof original === 'string' ? [original] : Object.values(original);
      const translatedForms = typeof dict[key] === 'string' ? [dict[key]] : Object.values(dict[key]);
      const czech = cs[key];
      const czechForms = typeof czech === 'string' ? [czech] : Object.values(czech);
      const sourceSets = [...sourceForms, ...czechForms].map(s => new Set([...s.matchAll(/\{(\w+)\}/g)].map(m => m[1])));
      const expected = new Set(sourceSets.flatMap(set => [...set]));
      const required = new Set([...sourceSets[0]].filter(name => sourceSets.every(set => set.has(name))));
      for (const form of translatedForms) {
        if (sourceForms.every(s => s.includes('|'))) assert.equal(form.split('|').length, sourceForms[0].split('|').length, `${code} ${key}: list length`);
        const actual = new Set([...form.matchAll(/\{(\w+)\}/g)].map(m => m[1]));
        for (const name of actual) assert.ok(expected.has(name), `${code} ${key}: unexpected {${name}}`);
        for (const constName of required) assert.ok(actual.has(constName), `${code} ${key}: missing {${constName}}`);
      }
    }
  }
});

test('Ukrainian selects the right song plural forms', async () => {
  const slovnik = await nactiSlovnik('uk');
  nastavJazyk('uk', slovnik);
  const forms = slovnik.pisni;
  assert.deepEqual([1, 2, 5, 21].map(n => t('pisni', { n })), [forms.one, forms.few, forms.many, forms.one].map((s, i) => s.replace('{n}', [1, 2, 5, 21][i])));
  nastavJazyk('cs');
});

test('Arabic is right-to-left while other application languages are left-to-right', async () => {
  const { smerJazyka } = await import('../static/lib/texts.js');
  assert.equal(smerJazyka('ar'), 'rtl');
  assert.equal(smerJazyka('ar-EG'), 'rtl');
  for (const code of ['cs', 'uk', 'zh-CN', 'ja', 'hi', 'pt-BR']) assert.equal(smerJazyka(code), 'ltr');
});

test('Arabic uses the full cardinal plural categories', () => {
  const rules = new Intl.PluralRules('ar');
  assert.deepEqual([0, 1, 2, 3, 11, 100].map(n => rules.select(n)), ['zero', 'one', 'two', 'few', 'many', 'other']);
});

test('Arabic plurals provide every form selected by the runtime', async () => {
  const categories = new Intl.PluralRules('ar').resolvedOptions().pluralCategories;
  for (const [key, value] of Object.entries(await nactiSlovnik('ar'))) {
    if (typeof value !== 'object') continue;
    for (const form of categories) assert.equal(typeof value[form], 'string', `${key}.${form}`);
  }
});

test('a text missing in another language falls back to English, then to Czech', () => {
  nastavJazyk('de', { zpet: 'Zurück' });
  assert.equal(t('zpet'), 'Zurück');
  assert.equal(t('hrat'), en.hrat);                   // missing in German → English
  nastavJazyk('cs');
  assert.equal(t('hrat'), cs.hrat);
});

test('Czech texts for parents and adults use the formal address (vykání); children keep ty while playing', () => {
  const ty = /(?<![\p{L}])(tvoje|tvůj|tvá|tvé|tebe|tobě|tebou|zkus|vyber|vlož|zkopíruj|oprav|napiš|zvol|klepni|připoj|máš|hraješ|zahraješ|budeš|jmenuješ)(?![\p{L}])/iu;
  const dospeli = ['menu.', 'novy.', 'pred.', 'verze.', 'vic.', 'editor.', 'html.', 'about.', 'pomocnik.uvod', 'pomocnik.kopiePopis', 'pomocnik.zkopirovano', 'krok.popis.'];
  const tykaji = Object.entries(cs).filter(([k, v]) => dospeli.some(p => k.startsWith(p)) && typeof v === 'string' && ty.test(v)).map(([k]) => k);
  assert.deepEqual(tykaji, []);
  assert.match(cs['cviceni.trener.dite.zlepsenyTakt'], /ti už jde/);   // the coach for children still says ty
});

test('fetching a dictionary does not switch the language until applied', async () => {
  nastavJazyk('cs');
  const de = await nactiSlovnik('de');
  assert.equal(jazyk(), 'cs');
  assert.equal(await nactiSlovnik('de'), de);
  nastavJazyk('de', de);
  assert.equal(t('zpet'), 'Zurück');
  nastavJazyk('cs');
});

test('editor and song guide select the right Slavic plurals', async () => {
  for (const [kod, texty] of Object.entries({
    cs: ['1 nejistý takt z převodu', '2 nejisté takty z převodu', '5 nejistých taktů z převodu'],
    sk: ['1 neistý takt z prevodu', '2 neisté takty z prevodu', '5 neistých taktov z prevodu'],
    pl: ['1 niepewny takt po konwersji', '2 niepewne takty po konwersji', '5 niepewnych taktów po konwersji'],
    ru: ['1 неточный такт', '2 неточных такта', '5 неточных тактов'],
    uk: ['1 такт', '2 такти', '5 тактів'],
  })) {
    const slovnik = await nactiSlovnik(kod);
    nastavJazyk(kod, slovnik);
    const n = [1, 2, 5];
    assert.deepEqual(n.map(n => t('editor.nejisteTakty', { n }).split(' ').slice(0, kod === 'ru' ? 3 : kod === 'uk' ? 2 : undefined).join(' ')), texty, kod);
    assert.equal(new Set(n.map(n => t('doplnky.pruvodce.akordy', { n, akordy: 'C' }).replace(String(n), ''))).size, 3, kod);
  }
  nastavJazyk('cs');
});
