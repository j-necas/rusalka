// The dialogs are siblings in body. Make only the front dialog interactive and restore the previous focus on close.
const okna = [];
const inertni = new Set();

function nastavPozadi(doc) {
  const vrchni = okna.at(-1)?.el;
  for (const el of inertni) el.inert = false;
  inertni.clear();
  if (!vrchni) return;
  for (const el of doc.body.children) {
    if (el === vrchni || el.inert || el.hasAttribute('data-zive')) continue;
    el.inert = true;
    inertni.add(el);
  }
}

function escape(e) {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  okna.at(-1).zavrit();
}

function zaostri(okno) {
  const cil = okno.fokus || okno.el.querySelector('[tabindex="-1"], h2') || okno.el;
  if (!cil.hasAttribute('tabindex') && !okno.fokus) cil.setAttribute('tabindex', '-1');
  cil.focus();
}

export function otevriDialog(el, { zavrit = () => zavriDialog(el), fokus, navrat } = {}) {
  if (okna.some(o => o.el === el)) return false;
  const doc = el.ownerDocument;
  if (!okna.length) doc.addEventListener('keydown', escape, true);
  okna.push({ el, zavrit, fokus, navrat, odkud: doc.activeElement });
  el.classList.remove('skryta');
  nastavPozadi(doc);
  zaostri(okna.at(-1));
  return true;
}

export function zavriDialog(el) {
  const i = okna.findIndex(o => o.el === el);
  if (i < 0) return false;
  const doc = el.ownerDocument;
  const vrchni = i === okna.length - 1;
  const [okno] = okna.splice(i, 1);
  el.classList.add('skryta');
  nastavPozadi(doc);
  if (!okna.length) doc.removeEventListener('keydown', escape, true);
  if (vrchni) {
    const dalsi = okna.at(-1);
    const odkud = okno.navrat || okno.odkud;
    if (odkud?.isConnected && !odkud.closest('[inert], .skryta')) odkud.focus();
    if (dalsi && !dalsi.el.contains(doc.activeElement)) zaostri(dalsi);
  }
  return true;
}
