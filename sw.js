// Service worker: l'app funziona anche senza rete (nell'orto).
// I file dell'app vengono serviti dalla cache e aggiornati in background;
// le richieste ai servizi esterni (meteo, clima, terreno) vanno sempre in rete.
// Ogni download salta la cache HTTP del browser (GitHub Pages la tiene 10
// minuti): altrimenti una versione nuova potrebbe partire coi file vecchi.
const VERSIONE = "orto-v20";
// Modello delle malattie e motore (~17 MB): cache a parte, che non si svuota a
// ogni versione; si riempie al primo uso del riconoscimento da foto.
const MODELLO = "orto-modello-v1";
const FILE = [
  "./", "index.html", "style.css", "data.js", "app.js", "riconosci.js", "manifest.webmanifest",
  "icone/icona.svg", "icone/icona-192.png", "icone/icona-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSIONE)
      .then((c) => c.addAll(FILE.map((f) => new Request(f, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomi) => Promise.all(nomi.filter((n) => n !== VERSIONE && n !== MODELLO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.includes("/modello/")) {
    // File grandi che non cambiano: prima la cache, la rete solo se mancano.
    e.respondWith(caches.open(MODELLO).then(async (cache) => {
      const inCache = await cache.match(e.request, { ignoreSearch: true });
      if (inCache) return inCache;
      const r = await fetch(e.request);
      if (r.ok) cache.put(e.request, r.clone());
      return r;
    }));
    return;
  }
  e.respondWith(
    caches.open(VERSIONE).then(async (cache) => {
      const inCache = await cache.match(e.request, { ignoreSearch: true });
      const dallaRete = fetch(e.request.url, { cache: "no-cache" })
        .then((r) => { if (r.ok) cache.put(e.request, r.clone()); return r; })
        .catch(() => inCache);
      return inCache || dallaRete;
    }),
  );
});
