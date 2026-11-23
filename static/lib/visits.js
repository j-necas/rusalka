// The anonymous visit counter of the published website (GoatCounter: no cookies, no personal data; it counts page
// loads with the country and the referring site). Not on a local development server. The script is GoatCounter's
// official count.js hosted by the website itself (static/goatcounter/, ISC licence), so no third-party script runs;
// only the count itself goes to rusalka.goatcounter.com.
export const POCITADLO = { src: 'goatcounter/count.js', data: 'https://rusalka.goatcounter.com/count' };

/** count visits here? only on the published https website */
export function pocitatNavstevy({ protocol, hostname }) {
  return protocol === 'https:' && !/^(localhost|127\.|\[::1\])/.test(hostname);
}
