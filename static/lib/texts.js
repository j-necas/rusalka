// UI texts: t('klic', { params }). The dictionary is an object of keys; a value is a string with {params}, or for
// plurals an object { one, few, many, other } chosen by params.n (Intl.PluralRules of the language).
import cs from '../lang/cs.js';
import en from '../lang/en.js';
/** the languages in their own names, in the order of the selects: European by number of speakers, then Russian and
 * the Asian ones (Arabic with them) */
export const NAZVY_JAZYKU = {
  en: 'English', es: 'Español', fr: 'Français', pt: 'Português', 'pt-BR': 'Português (Brasil)', de: 'Deutsch', it: 'Italiano',
  pl: 'Polski', uk: 'Українська', cs: 'Čeština', sk: 'Slovenčina', ru: 'Русский', 'zh-CN': '中文', hi: 'हिन्दी', ar: 'العربية', ja: '日本語',
};
const slovniky = new Map([['cs', cs], ['en', en]]);

export async function nactiSlovnik(kod) {
  if (!Object.hasOwn(NAZVY_JAZYKU, kod)) return en;
  if (!slovniky.has(kod)) {
    const url = new URL(`../lang/${kod}.js`, import.meta.url);
    url.search = new URL(import.meta.url).search;    // keep the build version when loading a language on demand
    slovniky.set(kod, (await import(url.href)).default);
  }
  return slovniky.get(kod);
}
let JAZYK = 'cs', SLOVNIK = cs, PRAVIDLA = new Intl.PluralRules('cs');
const chybi = new Set();

export function nastavJazyk(kod, slovnik) {
  JAZYK = kod;
  SLOVNIK = slovnik || slovniky.get(kod) || cs;
  PRAVIDLA = new Intl.PluralRules(kod);
}
/** a browser language tag → a language Rusalka speaks (pt-BR exactly, zh-* → zh-CN, else the base language), or null */
function podporovany(tag) {
  const t = String(tag || '').toLowerCase(), zaklad = t.split('-')[0];
  const presne = Object.keys(NAZVY_JAZYKU).find(k => k.toLowerCase() === t);
  if (presne) return presne;
  if (zaklad === 'zh') return 'zh-CN';
  return Object.hasOwn(NAZVY_JAZYKU, zaklad) ? zaklad : null;
}
/**
 * default language of a new install: the first of the browser's languages (navigator.languages) Rusalka speaks,
 * else English; an existing install without a saved language stays Czech (it was Czech before languages were chosen)
 */
export function vychoziJazyk(jazykyProhlizece, uzPouzivana = false) {
  if (uzPouzivana) return 'cs';
  for (const tag of [].concat(jazykyProhlizece ?? [])) { const j = podporovany(tag); if (j) return j; }
  return 'en';
}
export const jazyk = () => JAZYK;
export const smerJazyka = kod => String(kod).toLowerCase().split('-')[0] === 'ar' ? 'rtl' : 'ltr';

export function t(klic, parametry = {}) {
  let v = SLOVNIK[klic] ?? en[klic] ?? cs[klic];     // missing translation: English, then Czech
  if (v == null) {
    if (!chybi.has(klic)) { chybi.add(klic); console.warn(`chybí text ${klic}`); }
    return klic;
  }
  if (typeof v === 'object') v = v[PRAVIDLA.select(Number(parametry.n) || 0)] ?? v.other;
  return v.replace(/\{(\w+)\}/g, (m, k) => (k in parametry ? String(parametry[k]) : m));
}
