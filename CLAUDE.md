# CLAUDE.md

App web installabile (PWA) per l'orto: calendario di semina, trapianto e raccolta tarato sul luogo, aiuole con rotazioni e consociazioni, diario dei lavori e dei raccolti, meteo, clima e stima del terreno dalla posizione GPS. Codice, testi e commenti in italiano. L'utente la usa sul telefono Android.

## Com'è fatta
- HTML, CSS e JavaScript semplici, senza build né dipendenze: `index.html`, `style.css`, `data.js` (ortaggi, consociazioni, lavori del mese), `app.js` (tutto il resto), `sw.js` (funziona senza rete), `manifest.webmanifest`, `icone/`.
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
