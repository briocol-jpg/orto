# CLAUDE.md

App web installabile (PWA) per l'orto: calendario di semina, trapianto e raccolta tarato sul luogo, aiuole con rotazioni e consociazioni, diario dei lavori e dei raccolti, meteo, clima e stima del terreno dalla posizione GPS. Codice, testi e commenti in italiano. L'utente la usa sul telefono Android.

## Com'è fatta
- HTML, CSS e JavaScript semplici, senza build né dipendenze: `index.html`, `style.css`, `data.js` (ortaggi, consociazioni, lavori del mese), `app.js` (tutto il resto), `sw.js` (funziona senza rete), `manifest.webmanifest`, `icone/`.
- Riconoscimento da foto (in prova) nella guida "Malattie e parassiti": `riconosci.js` fa girare sul telefono il classificatore `modello/malattie_v1.onnx` (YOLO11n-cls, 224 px, 15 classi, da `tools/malattie/` e `~/OrtoMalattie/runs/malattie_v1`) con onnxruntime-web 1.20.1 (`modello/ort.wasm.min.js` + `.wasm` + `.mjs`, un solo thread). Preprocessing come Ultralytics: ritaglio centrale quadrato a 224, valori 0–1. Ogni foto è guardata 7 volte (intera, ribaltata, zoom 0.75 al centro e nei 4 angoli) e si fa la media; con l'ortaggio scelto nel campo «Ortaggio» della guida le classi che non lo riguardano (`problemiDi`) sono tolte (senza gonfiare le altre se il modello vedeva soprattutto una classe tolta). Sopra 0.7 una risposta, tra 0.4 e 0.7 due, sotto 0.4 «non riesco a capirlo». Tre modi: dal vivo (fotocamera nella pagina, 3 volte al secondo, media mobile), «Scatta» (`capture`), galleria. Sotto il risultato 👍/👎 salvano la foto (lato max 1280 px) con la classe giusta in IndexedDB (`orto-foto-modello`); «Invia le foto» le condivide in un .txt JSON, che `tools/malattie/importa_correzioni.py` scompatta in `~/OrtoMalattie/correzioni/<classe>/`. I file di `modello/` (~17 MB) stanno in una cache a parte del service worker (`MODELLO` in `sw.js`), riempita al primo uso: per un modello nuovo cambiare nome al file `.onnx` e a `MODELLO`.
- Dati solo sul telefono, in `localStorage` (chiave `ilmioorto.v1`); copia di sicurezza ed esportazione `.ics` dalla scheda Luogo.
- Servizi esterni gratuiti senza chiave, chiamati dal telefono solo con la posizione dell'orto: Open-Meteo (previsioni, archivio ERA5 per il clima, altitudine), BigDataCloud (nome del luogo), ISRIC SoilGrids (terreno, poche richieste al minuto, niente dati in città).
- Le finestre in `data.js` sono scritte per ultima brinata 20 aprile e prima brinata 10 novembre (430 m, lago di Lecco). L'app le sposta con le date del luogo: gennaio–luglio seguono l'ultima brinata, agosto–dicembre la prima. Le date vengono dall'analisi di 10 anni di minime (≤ 2 °C, "4 anni su 5").

## Lavorarci
- Provare in locale: `python3 -m http.server 8765` nella cartella e aprire `http://127.0.0.1:8765` (GPS e service worker vanno solo su https o localhost).
- Per far arrivare una modifica ai telefoni: cambiare `VERSIONE` in `sw.js` (l'app mostra "c'è una versione nuova").
- Prove con Chrome senza finestra: `google-chrome --headless=new --user-data-dir=<profilo nuovo> --window-size=412,2000 --screenshot=...`. Usare ogni volta un profilo nuovo: il service worker serve la versione in cache.
- Le pagine di prova si chiamano `prova*.html` (ignorate da git) e vanno cancellate dopo.

## Pubblicazione
Online su GitHub Pages: https://briocol-jpg.github.io/orto/ (repository pubblico `briocol-jpg/orto`, ramo `main`, cartella root). Il computer non ha credenziali GitHub: l'utente carica i file cambiati dal sito (Add file → Upload files). Il repository git locale non ha remote.
