// sw.js is generated for the published website. A missing worker on the dev server is harmless.
export async function zapnoutOffline({ serviceWorker, aktualizace, obnovit, setritData = false }) {
  if (!serviceWorker) return null;
  let registrace;
  try { registrace = await serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' }); }
  catch { return null; }

  const sleduj = () => {
    const cekajici = registrace.waiting;
    if (!cekajici || !aktualizace) return;
    aktualizace(() => {
      if (cekajici.state === 'activated' || cekajici.state === 'redundant') return obnovit();
      serviceWorker.addEventListener('controllerchange', obnovit, { once: true });
      cekajici.postMessage('obnovit');
    });
  };
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
