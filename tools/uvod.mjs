// The introduction pages rusalkapiano.com/<language>/ (static/prvni.js sends a first visit there): one template, the texts
// in tools/uvod/<code>.json. Built into web/ by tools/web.mjs, served on the fly by tools/server.mjs.
// Czech and Slovak show the Czech recordings and the Czech folk song, the others the English ones and Twinkle, Twinkle.
import { readFileSync } from 'node:fs';
import { NAZVY_JAZYKU } from '../static/lib/texts.js';
import { JAZYKY_PISNI, pisne, adresyPisni } from './pisne.mjs';

const WEB = 'https://rusalkapiano.com/';
const OG = { en: 'en_GB', es: 'es_ES', fr: 'fr_FR', pt: 'pt_PT', 'pt-BR': 'pt_BR', de: 'de_DE', it: 'it_IT', pl: 'pl_PL', uk: 'uk_UA',
  cs: 'cs_CZ', sk: 'sk_SK', ru: 'ru_RU', 'zh-CN': 'zh_CN', hi: 'hi_IN', ar: 'ar_AR', ja: 'ja_JP' };
/** every language of the app, in the order of its language select: { kod, slug (the folder), media ('cs' | 'en') } */
export const UVODY = Object.keys(NAZVY_JAZYKU).map(kod => ({ kod, slug: kod.toLowerCase(), media: ['cs', 'sk'].includes(kod) ? 'cs' : 'en' }));
const PISEN = { cs: 'Černé oči jděte spát', en: 'Twinkle, Twinkle, Little Star' };

const texty = kod => JSON.parse(readFileSync(new URL(`uvod/${kod}.json`, import.meta.url), 'utf8'));
/** songs ready to play without AI (the library and the starter songs), rounded down to fifty: "more than 350" */
const json = cesta => JSON.parse(readFileSync(new URL('../' + cesta, import.meta.url), 'utf8'));
export const POCET_PISNI = Math.floor((json('library/catalog.json').length + json('songs/index.json').length) / 50) * 50;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** structured data of the app (schema.org), in the page's language; '<' escaped so the JSON cannot close the script */
const strukturovana = (kod, t) => JSON.stringify({
  '@context': 'https://schema.org', '@type': 'WebApplication', '@id': WEB + '#app', name: 'Rusalka', url: WEB,
  description: t.description, inLanguage: kod, availableLanguage: Object.keys(NAZVY_JAZYKU),
  applicationCategory: 'EducationalApplication', operatingSystem: 'Any', browserRequirements: 'Chrome or Edge for a MIDI piano',
  isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  image: WEB + 'icons/og.png', author: { '@type': 'Person', name: 'Jiří Nečas' },
}).replace(/</g, '\\u003c');
const SIPKA = '<svg viewBox="0 0 48 24" width="48" height="24" aria-hidden="true"><path d="M2 12h40M32 3l10 9-10 9" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** a link from an introduction page to the sheet music of its language (tools/pisne.mjs), when it has some */
function odkazNaNoty(kod) {
  if (!JAZYKY_PISNI.includes(kod)) return '';
  const t = JSON.parse(readFileSync(new URL(`uvod/pisne-${kod}.json`, import.meta.url), 'utf8'));
  const pocet = pisne().filter(p => p.stranka === kod).length;
  return `  <p><a href="${t.folder}/">${esc(t.landingLink.replace('{count}', pocet))}</a></p>\n`;
}

/** the page of one language as HTML */
export function stranka(kod) {
  const u = UVODY.find(x => x.kod === kod);
  if (!u) throw new Error(`no introduction page for ${kod}`);
  const t = texty(kod), m = u.media, mc = m === 'cs' ? '.cs' : '';
  // a text with HTML allowed (only <b>), or plain text escaped
  const h = k => { if (t[k] == null) throw new Error(`${kod}.json: ${k} missing`); return t[k]; };
  const x = k => esc(h(k));
  const alternativy = UVODY.map(v => `<link rel="alternate" hreflang="${v.kod}" href="${WEB}${v.slug}/">`).join('\n')
    + `\n<link rel="alternate" hreflang="x-default" href="${WEB}en/">`;
  const jazyky = UVODY.map(v => v.kod === kod ? `<b aria-current="page">${NAZVY_JAZYKU[v.kod]}</b>`
    : `<a href="../${v.slug}/" hreflang="${v.kod}" lang="${v.kod}">${NAZVY_JAZYKU[v.kod]}</a>`).join(' · ');
  const sekce = (id, nadpis, telo) => `<section class="sirka" aria-labelledby="${id}">\n  <h2 id="${id}">${nadpis}</h2>\n${telo}\n</section>`;
  const dvojice = (...ks) => `  <div class="otazky">\n${ks.map(k => `    <div><h3>${x(k + 'h')}</h3>\n      <p>${h(k + 'p')
    .replace('{webmidi}', '<a href="https://apps.apple.com/app/web-midi-browser/id953846217">Web MIDI Browser</a>')
    .replace('{app}', '<a href="../">rusalkapiano.com</a>')
    .replace('{languages}', Object.values(NAZVY_JAZYKU).join(', '))}</p></div>`).join('\n')}\n  </div>`;
  return `<!doctype html>
<html lang="${kod}"${kod === 'ar' ? ' dir="rtl"' : ''}>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${x('title')}</title>
<meta name="description" content="${x('description')}">
<link rel="canonical" href="${WEB}${u.slug}/">
${alternativy}
<meta name="theme-color" content="#FFFFFF">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Rusalka">
<meta property="og:locale" content="${OG[kod]}">
<meta property="og:url" content="${WEB}${u.slug}/">
<meta property="og:title" content="${x('ogTitle')}">
<meta property="og:description" content="${x('ogDescription')}">
<meta property="og:image" content="${WEB}icons/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${strukturovana(kod, t)}</script>
<link rel="icon" href="../icons/32.png" sizes="32x32">
<link rel="apple-touch-icon" href="../icons/192.png">
<link rel="stylesheet" href="../fonts.css">
<link rel="stylesheet" href="../uvod/uvod.css">
<script src="../uvod/uvod.js" defer></script>
</head>
<body>
<header class="hlava sirka">
  <a class="logo" href="./"><img src="../icons/logo.svg" alt="Rusalka" width="126" height="44"></a>
  <nav aria-label="${x('navPages')}">
    <details class="jazyk-menu">
      <summary aria-label="${x('language')}: ${NAZVY_JAZYKU[kod]}">${NAZVY_JAZYKU[kod]}<svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true"><path d="M1.5 1.5 6 6l4.5-4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></summary>
      <ul>
${UVODY.map(v => `        <li><a href="../${v.slug}/" hreflang="${v.kod}" lang="${v.kod}"${v.kod === kod ? ' aria-current="page"' : ''}>${NAZVY_JAZYKU[v.kod]}</a></li>`).join('\n')}
      </ul>
    </details>
    <a href="../">${x('openApp')}</a>
  </nav>
</header>

<main>
<div class="uvod sirka">
  <h1>${x('h1')}</h1>
  <p class="perex">${x('lead')}</p>
  <p class="perex knihovna">${h('library').replace('{count}', POCET_PISNI)}</p>
  <a class="hrat" href="../">${x('startApp')}</a>
  <p class="drobne">${x('small')}</p>
  <figure class="pred-po">
    <div class="pred"><img src="../uvod/noty-${m}.webp" width="1100" height="${m === 'cs' ? 557 : 833}" alt="${esc(h('sheetAlt').replace('{song}', PISEN[m]))}">
      <p>${x('sheetLabel')}</p></div>
    <div class="most">${SIPKA}<span>${x('bridge')}</span></div>
    <div class="po"><div class="zaber"><video data-src="../video/playing${mc}.mp4" poster="../video/playing${mc}.jpg" width="1200" height="840" muted loop playsinline preload="none"
      aria-label="${x('playAria')}"></video></div>
      <p>${x('playLabel')}</p></div>
  </figure>
</div>

<section class="sirka" aria-labelledby="ai">
  <div class="vedle">
    <div>
      <h2 id="ai">${x('aiH2')}</h2>
      <ol class="postup">
${['ai1', 'ai2', 'ai3'].map(k => `        <li><span>${h(k)}</span></li>`).join('\n')}
      </ol>
    </div>
    <figure class="zaber">
      <video data-src="../video/ai${mc}.mp4" poster="../video/ai${mc}.jpg" width="1200" height="840" muted loop playsinline preload="none"
        aria-label="${x('aiAria')}"></video>
    </figure>
  </div>
</section>

${sekce('proc', x('whyH2'), `  <p class="siroky">${x('whyLead')}</p>
${dvojice('why1', 'why2', 'why3', 'why4')}
  <p class="siroky" style="margin-top:22px">${x('noAi')}</p>`)}

${sekce('kroky', x('stepsH2'), `  <p>${x('stepsLead')}</p>
  <ol class="kroky">
${[1, 2, 3].map(i => `    <li><h3><span class="cislo">${i}</span>${x(`step${i}h`)}</h3>
      <p>${x(`step${i}p`)}</p></li>`).join('\n')}
  </ol>
  <div class="vedle obracene" style="margin-top:34px">
    <figure class="zaber vysledek">
      <img src="../uvod/vysledek-${m}.webp" width="882" height="900" loading="lazy" alt="${x('resultAlt')}">
    </figure>
    <div>
      <h3>${x('starsH3')}</h3>
      <p>${x('starsP')}</p>
    </div>
  </div>`)}

${sekce('rodina', x('familyH2'), `  <p>${x('familyLead')}</p>
  <div class="rodina">
    <figure class="zaber">
      <img src="../uvod/hraci-${m}.webp" width="1000" height="357" loading="lazy" alt="${x('playersAlt')}">
    </figure>
    <figure class="zaber">
      <img src="../uvod/statistiky-${m}.webp" width="1000" height="646" loading="lazy" alt="${x('statsAlt')}">
      <figcaption>${x('statsCaption')}</figcaption>
    </figure>
  </div>
  <ul class="seznam">
${['family1', 'family2', 'family3'].map(k => `    <li>${x(k)}</li>`).join('\n')}
  </ul>`)}

${sekce('potreba', x('needH2'), dvojice('need1', 'need2', 'need3', 'need4'))}

${sekce('otazky', x('faqH2'), dvojice('faq1', 'faq2', 'faq3', 'faq4', 'faq5', 'faq6'))}

<div class="zaver sirka">
  <h2>${x('endH2')}</h2>
  <p>${x('endP')}</p>
  <a class="hrat" href="../">${x('startApp')}</a>
</div>
</main>

<footer class="pata sirka">
  <p id="jazyky" class="jazyky">${jazyky}</p>
${odkazNaNoty(kod)}  <p><a href="../">rusalkapiano.com</a></p>
  <p>${x('creditPiano')} ${x(m === 'cs' ? 'creditSheetCs' : 'creditSheetEn')}</p>
</footer>
</body>
</html>
`;
}

/**
 * the sitemap: every introduction page with its language versions, then the song pages and their lists (tools/pisne.mjs). Not the app at /: for a crawler (a visitor without
 * players) static/prvni.js redirects it to an introduction page, so it is not a page of its own in search.
 */
export function mapaWebu() {
  const alt = UVODY.map(v => `    <xhtml:link rel="alternate" hreflang="${v.kod}" href="${WEB}${v.slug}/"/>`).join('\n')
    + `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${WEB}en/"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${UVODY.map(u => `  <url><loc>${WEB}${u.slug}/</loc>\n${alt}\n  </url>`).join('\n')}
${adresyPisni().map(a => `  <url><loc>${a}</loc></url>`).join('\n')}
</urlset>
`;
}
