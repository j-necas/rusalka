// sw.js is generated for the published website. A missing worker on the dev server is harmless.
export async function zapnoutOffline({ serviceWorker, aktualizace, obnovit, setritData = false }) {
  if (!serviceWorker) return null;
  let registrace;
  try { registrace = await serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' }); }
  catch { return null; }

  // a new version only exists when this page already runs under a worker: on the first visit the worker installs
  // (and is briefly `waiting`) without anything to update
  const melKontroler = !!serviceWorker.controller;
  let spustilaTato = false;
  const sleduj = () => {
    const cekajici = registrace.waiting;
    if (!cekajici || !aktualizace || !melKontroler) return;
    aktualizace(() => {
      if (cekajici.state === 'activated' || cekajici.state === 'redundant') return obnovit();
      spustilaTato = true;
      serviceWorker.addEventListener('controllerchange', obnovit, { once: true });
      cekajici.postMessage('obnovit');
    });
  };
  // another tab started the update: this one still runs the old files, so it offers a reload (never reloads by itself)
  serviceWorker.addEventListener?.('controllerchange', () => {
    if (melKontroler && !spustilaTato && aktualizace) aktualizace(obnovit);
  });
  const priInstalaci = () => {
    const worker = registrace.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') sleduj();
    });
  };
  registrace.addEventListener?.('updatefound', priInstalaci);
  priInstalaci();
  sleduj();
  if (!setritData && serviceWorker.ready) {
    serviceWorker.ready.then(r => setTimeout(() => r.active?.postMessage('prednacti'), 5000));
  }
  return registrace;
}
