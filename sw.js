// Service worker: l'app funziona anche senza rete (nell'orto).
// I file dell'app vengono serviti dalla cache e aggiornati in background;
// le richieste ai servizi esterni (meteo, clima, terreno) vanno sempre in rete.
// Ogni download salta la cache HTTP del browser (GitHub Pages la tiene 10
// minuti): altrimenti una versione nuova potrebbe partire coi file vecchi.
importScripts("versione.js"); // VERSIONE_APP e DATA_VERSIONE
const VERSIONE = "orto-v" + VERSIONE_APP;
// Modello delle malattie e motore (~17 MB): cache a parte, che non si svuota a
// ogni versione; si riempie al primo uso del riconoscimento da foto.
const MODELLO = "orto-modello-v1";
// File ricevuti con «Condividi → Il mio orto» (copia dell'orto da WhatsApp):
// il service worker lo tiene qui e apre l'app su #ricevuto, che lo legge e lo toglie.
const CONDIVISI = "orto-condivisi";
const FILE = [
  "./", "index.html", "versione.js", "style.css", "data.js", "icone.js", "piano.js", "aiuto.js", "profili.js", "app.js", "prova.js", "missioni.js", "riconosci.js", "manifest.webmanifest",
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
      .then((nomi) => Promise.all(nomi.filter((n) => n !== VERSIONE && n !== MODELLO && n !== CONDIVISI).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === "POST" && url.origin === self.location.origin && url.pathname.endsWith("/condividi")) {
    e.respondWith((async () => {
      try {
        const dati = await e.request.formData();
        const file = dati.getAll("file").find((f) => f && typeof f.text === "function");
        const testo = file ? await file.text() : String(dati.get("text") || "");
        const cache = await caches.open(CONDIVISI);
        await cache.put("ricevuto", new Response(testo, { headers: { "content-type": "text/plain; charset=utf-8" } }));
      } catch { /* l'app dirà che non ha trovato il file */ }
      return Response.redirect(new URL("./#ricevuto", self.registration.scope).href, 303);
    })());
    return;
  }
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  // «Controlla aggiornamenti»: versione.js chiesto alla rete, senza cache.
  if (url.searchParams.has("controlla")) return;
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
      // Prima la cache: i file nuovi arrivano tutti insieme con la versione nuova
      // (install), così non si mescolano file vecchi e nuovi.
      const inCache = await cache.match(e.request, { ignoreSearch: true });
      if (inCache) return inCache;
      const r = await fetch(e.request.url, { cache: "no-cache" });
      if (r.ok) cache.put(e.request, r.clone());
      return r;
    }),
  );
});
