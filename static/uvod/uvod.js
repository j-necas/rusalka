// The introduction pages: the app recordings play (muted, in a loop) while they are on screen; a click pauses them.
// With reduced motion they wait for a click and show their controls.
const klid = matchMedia('(prefers-reduced-motion: reduce)').matches;
const videa = [...document.querySelectorAll('video[data-src]')];
const nacti = v => { if (!v.src) { v.src = v.dataset.src; v.load(); } };
for (const v of videa) {
  v.addEventListener('click', () => { nacti(v); v.paused ? v.play().catch(() => {}) : v.pause(); v.dataset.stop = v.paused ? '1' : ''; });
  if (klid) { v.controls = true; v.preload = 'none'; nacti(v); }
}
if (!klid && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver(zaznamy => {
    for (const z of zaznamy) {
      const v = z.target;
      if (z.isIntersecting && !v.dataset.stop) { nacti(v); v.play().catch(() => {}); }
      else if (!z.isIntersecting) v.pause();
    }
  }, { threshold: .35 });
  videa.forEach(v => io.observe(v));
} else if (!klid) videa.forEach(v => { nacti(v); v.play().catch(() => {}); });
// Open Rusalka stays in the app in this tab. The guest links use #guest, which already skips the introduction.
for (const a of document.querySelectorAll('a[href="../"]')) {
  a.addEventListener('click', () => { try { sessionStorage.setItem('rusalka-uvod', '1'); } catch { /* private window */ } });
}
// the language menu closes on a click outside it or on Escape
const menu = document.querySelector('.jazyk-menu');
if (menu) {
  document.addEventListener('click', e => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); } });
}
