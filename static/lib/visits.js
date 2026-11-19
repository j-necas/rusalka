// The anonymous visit counter of the published website (GoatCounter: no cookies, no personal data; it counts page
// loads with the country and the referring site). Not on a local development server.
export const POCITADLO = { src: 'https://gc.zgo.at/count.js', data: 'https://rusalka.goatcounter.com/count' };

/** count visits here? only on the published https website */
export function pocitatNavstevy({ protocol, hostname }) {
  return protocol === 'https:' && !/^(localhost|127\.|\[::1\])/.test(hostname);
}
