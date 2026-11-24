// =============================================================================
// Riconoscimento da foto (modello delle malattie v1, in prova)
//
// Classificatore YOLO11n-cls (224 px, 15 classi) addestrato sulle foto di
// iNaturalist e PlantDoc (script in tools/malattie/), esportato in ONNX e
// fatto girare sul telefono con onnxruntime-web (file in modello/). Tutto
// resta sul telefono: la foto non viene mandata da nessuna parte.
// Il modello e il motore (~17 MB) si scaricano solo al primo uso; poi il
// service worker li tiene in cache e funziona anche senza rete.
// =============================================================================

const MODELLO_URL = "modello/malattie_v1.onnx";
// Ordine delle uscite del modello (names dell'export Ultralytics).
const CLASSI_MODELLO = ["afidi", "aleurodidi", "alternaria", "altica", "botrite", "bruchi", "cimici",
  "coccinella", "dorifora", "lumache", "oidio", "peronospora", "sana", "septoria", "virus"];
// Classe del modello -> nome da mostrare e schede della guida (PROBLEMI in data.js).
const CLASSI_INFO = {
  afidi: { nome: "Afidi", problemi: ["afidi"] },
  aleurodidi: { nome: "Mosca bianca", problemi: ["aleurodidi"] },
  alternaria: { nome: "Alternaria", problemi: ["alternaria"] },
  altica: { nome: "Altica", problemi: ["altica"] },
  botrite: { nome: "Botrite (muffa grigia)", problemi: ["botrite"] },
  bruchi: { nome: "Bruchi", problemi: ["cavolaia", "nottue"] },
  cimici: { nome: "Cimici", problemi: ["cimici"] },
  coccinella: { nome: "Coccinella", problemi: [], nota: "È un'amica dell'orto: mangia gli afidi. Lasciala dov'è." },
  dorifora: { nome: "Dorifora", problemi: ["dorifora"] },
  lumache: { nome: "Lumache o limacce", problemi: ["lumache"] },
  oidio: { nome: "Oidio (mal bianco)", problemi: ["oidio"] },
  peronospora: { nome: "Peronospora", problemi: ["peronospora-pomodoro", "peronospora"] },
  sana: { nome: "Pianta sana", problemi: [], nota: "Non vede malattie né parassiti." },
  septoria: { nome: "Septoria", problemi: ["septoria"] },
  virus: { nome: "Virus (mosaico)", problemi: ["virus"] },
};
const SICURO = 0.7; // sotto questa soglia mostra anche la seconda ipotesi
const NON_SO = 0.4; // sotto questa soglia dice che non riesce a capire

let sessioneModello = null;

function caricaScript(src) {
  return new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = ok;
    s.onerror = () => ko(new Error("non riesco a caricare " + src));
    document.head.appendChild(s);
  });
}

async function modelloMalattie() {
  if (sessioneModello) return sessioneModello;
  if (!window.ort) await caricaScript("modello/ort.wasm.min.js");
  ort.env.wasm.wasmPaths = new URL("modello/", location.href).href;
  ort.env.wasm.numThreads = 1; // GitHub Pages non permette i thread
  sessioneModello = await ort.InferenceSession.create(MODELLO_URL, { executionProviders: ["wasm"] });
  return sessioneModello;
}


// -----------------------------------------------------------------------------
// Dalla foto al tensore. Come Ultralytics: ritaglio quadrato, 224 px, valori 0–1.
// "sorgente" è una foto (ImageBitmap) o il video della fotocamera.
// vista: zoom (1 = quadrato più grande possibile), sx/sy (-1…1: spostamento del
// ritaglio nello spazio che resta), specchio (ribaltata a destra-sinistra).
// -----------------------------------------------------------------------------
function tensoreDa(sorgente, larghezza, altezza, { zoom = 1, sx = 0, sy = 0, specchio = false } = {}) {
  const lato = Math.min(larghezza, altezza) * zoom;
  const x0 = (larghezza - lato) / 2 * (1 + sx), y0 = (altezza - lato) / 2 * (1 + sy);
  const c = document.createElement("canvas");
  c.width = c.height = 224;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  if (specchio) { g.translate(224, 0); g.scale(-1, 1); }
  g.drawImage(sorgente, x0, y0, lato, lato, 0, 0, 224, 224);
  const px = g.getImageData(0, 0, 224, 224).data;
  const n = 224 * 224;
  const dati = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    dati[i] = px[i * 4] / 255;
    dati[n + i] = px[i * 4 + 1] / 255;
    dati[2 * n + i] = px[i * 4 + 2] / 255;
  }
  return { tensore: new ort.Tensor("float32", dati, [1, 3, 224, 224]), tela: c };
}

async function probabilita(tensore) {
  const s = await modelloMalattie();
  const uscita = await s.run({ [s.inputNames[0]]: tensore });
  return Array.from(uscita[s.outputNames[0]].data);
}

// Classi possibili per un ortaggio: quelle con almeno un problema che lo colpisce
// (problemiDi in app.js), più "sana" e "coccinella" che valgono per tutti.
function classiPossibili(ortaggioId) {
  if (!ortaggioId) return null;
  const ids = new Set(problemiDi(ortaggioId).map((p) => p.id));
  return new Set(CLASSI_MODELLO.filter((c) => !CLASSI_INFO[c].problemi.length || CLASSI_INFO[c].problemi.some((id) => ids.has(id))));
}
// Ordina le probabilità; con l'ortaggio scelto toglie le classi impossibili e
// riproporziona le altre. Se però il modello vedeva soprattutto una classe
// impossibile (le altre insieme sotto metà), non le gonfio: la risposta resta
// incerta, invece di far diventare sicura una classe quasi a zero.
function ordina(p, ortaggioId = "") {
  const ok = classiPossibili(ortaggioId);
  const q = p.map((v, i) => (ok && !ok.has(CLASSI_MODELLO[i]) ? 0 : v));
  const somma = q.reduce((a, b) => a + b, 0);
  const div = Math.max(somma, 0.5) || 1;
  return q.map((v, i) => ({ classe: CLASSI_MODELLO[i], prob: v / div })).sort((a, b) => b.prob - a.prob);
}
// Classe che il modello vedeva di più ma che non riguarda l'ortaggio scelto.
function esclusaPrincipale(p, ortaggioId) {
  const ok = classiPossibili(ortaggioId);
  if (!ok) return null;
  const i = p.indexOf(Math.max(...p));
  return !ok.has(CLASSI_MODELLO[i]) && p[i] >= 0.5 ? CLASSI_MODELLO[i] : null;
}

// Una foto è guardata 7 volte (intera, ribaltata, più da vicino al centro e nei
// quattro angoli) e si fa la media: un dettaglio storto pesa meno.
const VISTE = [
  {}, { specchio: true }, { zoom: 0.75 },
  { zoom: 0.75, sx: -1, sy: -1 }, { zoom: 0.75, sx: 1, sy: -1 }, { zoom: 0.75, sx: -1, sy: 1 }, { zoom: 0.75, sx: 1, sy: 1 },
];
async function mediaViste(sorgente, larghezza, altezza) {
  let media = null, anteprima = null;
  for (const v of VISTE) {
    const { tensore, tela } = tensoreDa(sorgente, larghezza, altezza, v);
    anteprima ??= tela.toDataURL("image/jpeg", 0.8);
    const p = await probabilita(tensore);
    media = media ? media.map((x, i) => x + p[i] / VISTE.length) : p.map((x) => x / VISTE.length);
  }
  return { media, anteprima };
}

// Copia ridotta della foto (lato lungo al massimo 1280 px), da salvare se
// l'utente corregge la risposta.
async function fotoRidotta(sorgente, larghezza, altezza) {
  const k = Math.min(1, 1280 / Math.max(larghezza, altezza));
  const c = document.createElement("canvas");
  c.width = Math.round(larghezza * k);
  c.height = Math.round(altezza * k);
  c.getContext("2d").drawImage(sorgente, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.85));
}

async function riconosciFoto(file, ortaggioId) {
  await modelloMalattie();
  const img = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { media, anteprima } = await mediaViste(img, img.width, img.height);
  const foto = await fotoRidotta(img, img.width, img.height);
  img.close?.();
  return { grezze: media, ordinate: ordina(media, ortaggioId), anteprima, foto, ortaggioId, modo: "foto" };
}

// -----------------------------------------------------------------------------
// Foto corrette dall'utente, per addestrare i prossimi modelli. Restano sul
// telefono (IndexedDB) finché l'utente non le invia con «Invia le foto».
// -----------------------------------------------------------------------------
const CORREZIONI_EXTRA = {
  mangiate: "Foglie mangiate o bucate (non so da cosa)",
  ruggine: "Ruggine (pustole arancio o marroni)",
  carenza: "Foglie gialle o carenza",
  altro: "Altro (lo scrivo nella nota)",
};
function dbCorrezioni() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open("orto-foto-modello", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("correzioni", { keyPath: "id", autoIncrement: true });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}
async function operazione(modo, fn) {
  const db = await dbCorrezioni();
  return new Promise((ok, ko) => {
    const tx = db.transaction("correzioni", modo);
    const r = fn(tx.objectStore("correzioni"));
    tx.oncomplete = () => { db.close(); ok(r?.result); };
    tx.onerror = () => { db.close(); ko(tx.error); };
  });
}
const salvaCorrezione = (voce) => operazione("readwrite", (s) => s.add(voce));
const contaCorrezioni = () => operazione("readonly", (s) => s.count());
const tutteCorrezioni = () => operazione("readonly", (s) => s.getAll());
const svuotaCorrezioni = () => operazione("readwrite", (s) => s.clear());

function base64(blob) {
  return new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.readAsDataURL(blob); });
}
// Un solo file .txt (JSON con le foto in base64): passa da WhatsApp, email, Drive.
async function inviaCorrezioni() {
  const voci = await tutteCorrezioni();
  if (!voci.length) return;
  const dati = { tipo: "orto-foto-modello", versione: 1, creato: new Date().toISOString(), foto: [] };
  for (const v of voci) {
    const { foto, ...resto } = v;
    dati.foto.push({ ...resto, jpeg: foto ? await base64(foto) : null });
  }
  const testo = JSON.stringify(dati);
  const nome = `orto-foto-modello-${aISO(oggi())}.txt`;
  const file = new File([testo], nome, { type: "text/plain" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Foto per il modello", text: `${voci.length} foto corrette per migliorare il riconoscimento` });
      return true;
    } catch (e) {
      if (e.name !== "AbortError") alert("Invio non riuscito: " + e.message);
      return false;
    }
  }
  scaricaFile(nome, testo, "text/plain");
  alert("Questo browser non può inviare file direttamente: il file è stato scaricato nella cartella Download.");
  return true;
}

// -----------------------------------------------------------------------------
// Risultato
// -----------------------------------------------------------------------------
function htmlSchedaProblema(id) {
  const p = PROBLEMI.find((x) => x.id === id);
  if (!p) return "";
  return `<details class="problema">
    <summary><b>${esc(p.nome)}</b> <span class="tenue piccolo">· ${esc(p.tipo)}</span></summary>
    <p><b>Come riconoscerlo.</b> ${esc(p.riconosci)}</p>
    <p><b>🌿 Cosa fare (biologico).</b> ${esc(p.cura)}</p>
    ${p.nonBio ? `<p><b>⚗️ Non biologico.</b> ${esc(p.nonBio)}</p>` : ""}
    <p><b>Per prevenire.</b> ${esc(p.previeni)}</p>
    <button type="button" class="piccolo secondario" data-tratta="${p.id}">＋ Segna nel diario</button>
  </details>`;
}

function htmlCorreggi() {
  const opzioni = [...CLASSI_MODELLO.map((c) => [c, CLASSI_INFO[c].nome]), ...Object.entries(CORREZIONI_EXTRA)];
  return `<div class="correggi">
    <p class="piccolo" style="margin:10px 0 4px"><b>Ti aiuta a migliorarlo:</b> la risposta era giusta?</p>
    <div class="riga-bottoni" style="margin:0">
      <button type="button" class="piccolo secondario" data-giudizio="giusto">👍 Giusto</button>
      <button type="button" class="piccolo secondario" data-giudizio="sbagliato">👎 Sbagliato</button>
    </div>
    <div class="correggi-modulo" hidden>
      <label for="c_giusta">Cos'era davvero?</label>
      <select id="c_giusta"><option value="">— scegli —</option>${opzioni.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join("")}</select>
      <label for="c_nota">Nota (facoltativa: ortaggio, cosa vedi)</label>
      <input id="c_nota" type="text">
      <div class="riga-bottoni"><button type="button" class="piccolo" data-salva-correzione>Salva la foto per il modello</button></div>
    </div>
    <p class="tenue piccolo correggi-fatto" hidden></p>
  </div>`;
}

function htmlRisultato(r) {
  const { ordinate, anteprima, ortaggioId } = r;
  const [a, b, c] = ordinate;
  const pc = (x) => `${Math.round(x.prob * 100)}%`;
  const nome = (x) => esc(CLASSI_INFO[x.classe].nome);
  let titolo, ipotesi;
  if (a.prob >= SICURO) {
    titolo = `Sembra: <b>${nome(a)}</b> (${pc(a)})`;
    ipotesi = [a];
  } else if (a.prob >= NON_SO) {
    titolo = `Non sono sicuro: <b>${nome(a)}</b> ${pc(a)} o <b>${nome(b)}</b> ${pc(b)}`;
    ipotesi = [a, b];
  } else {
    const forse = [a, b, c].filter((x) => x.prob >= 0.1).map((x) => `${nome(x)} ${pc(x)}`);
    titolo = `<b>Non riesco a capirlo.</b>${forse.length ? ` <span class="tenue">Forse ${forse.join(", ")}.</span>` : ""}`;
    ipotesi = [];
  }
  const schede = ipotesi.map(({ classe }) => {
    const info = CLASSI_INFO[classe];
    return (info.nota ? `<p class="bene">${esc(info.nome)}: ${esc(info.nota)}</p>` : "") + info.problemi.map(htmlSchedaProblema).join("");
  }).join("");
  const o = PER_ID[ortaggioId];
  const esclusa = r.grezze ? esclusaPrincipale(r.grezze, ortaggioId) : null;
  return `<div class="riconosci-esito">
      <img src="${anteprima}" alt="Parte della foto esaminata">
      <p>${titolo}</p>
    </div>
    ${esclusa ? `<p class="avviso">La foto somiglia a questo: <b>${esc(CLASSI_INFO[esclusa].nome)}</b>, che però di solito non colpisce ${esc(o.nome.toLowerCase())}: controlla l'ortaggio scelto qui sotto.</p>` : ""}
    ${ipotesi.length ? "" : `<p class="piccolo">Prova più da vicino, con la parte malata al centro e la luce del giorno, oppure usa i sintomi qui sotto.</p>`}
    ${schede}
    <p class="tenue piccolo">${o ? `Ho considerato solo i problemi di ${icona(o)} ${esc(o.nome.toLowerCase())} (lo cambi nel campo «Ortaggio» qui sotto). ` : "Se scegli l'ortaggio nel campo «Ortaggio» qui sotto, sbaglio di meno. "}Il modello ha guardato soprattutto il quadrato centrale (quello qui sopra). È in prova: può sbagliare, soprattutto se l'insetto è piccolo o la foto è presa da lontano.</p>
    ${r.foto ? htmlCorreggi() : ""}`;
}

// -----------------------------------------------------------------------------
// Riquadro in cima alla guida delle malattie
// -----------------------------------------------------------------------------
function htmlRiconosci() {
  const vivo = !!navigator.mediaDevices?.getUserMedia;
  return `<div class="riconosci">
    <div class="riga-bottoni" style="margin:0">
      ${vivo ? `<button type="button" class="bottone-foto" id="vivo-avvia">🎥 Inquadra dal vivo</button>` : ""}
      <label class="bottone-foto secondario">📷 Scatta
        <input type="file" accept="image/*" capture="environment" class="foto-malattia" hidden>
      </label>
      <label class="bottone-foto secondario">🖼️ Dalla galleria
        <input type="file" accept="image/*" class="foto-malattia" hidden>
      </label>
    </div>
    <p class="tenue piccolo">Inquadra <b>da vicino una foglia sola</b> o l'insetto, al centro. Prima scegli l'ortaggio qui sotto: sbaglia di meno. <span class="chip-futuro">in prova</span></p>
    <div id="vivo" hidden>
      <div class="vivo-video"><video playsinline muted autoplay></video></div>
      <p class="vivo-esito" aria-live="polite">Accendo la fotocamera…</p>
      <div class="riga-bottoni" style="margin:6px 0 0">
        <button type="button" id="vivo-usa" disabled>✓ Usa questa</button>
        <button type="button" class="secondario" id="vivo-chiudi">✕ Chiudi la fotocamera</button>
      </div>
    </div>
    <div id="esito-foto"></div>
    <div id="foto-raccolte" class="piccolo"></div>
  </div>`;
}

// -----------------------------------------------------------------------------
// Dal vivo: la fotocamera resta accesa e il modello guarda il quadrato centrale
// circa 3 volte al secondo. La risposta è la media degli ultimi fotogrammi, così
// non salta da una malattia all'altra a ogni movimento. Con «Usa questa» il
// fotogramma viene guardato meglio (7 viste, come una foto).
// -----------------------------------------------------------------------------
function collegaVivo(f, mostraRisultato, ortaggioAttuale) {
  const box = f.querySelector("#vivo");
  const avvia = f.querySelector("#vivo-avvia");
  if (!box || !avvia) return;
  const video = box.querySelector("video");
  const testo = box.querySelector(".vivo-esito");
  const usa = box.querySelector("#vivo-usa");
  let flusso = null, attivo = false, media = null;

  const nascosta = () => { if (document.hidden) ferma(); };
  const ferma = () => {
    attivo = false;
    document.removeEventListener("visibilitychange", nascosta);
    flusso?.getTracks().forEach((t) => t.stop());
    flusso = null;
    video.srcObject = null;
    box.hidden = true;
    avvia.hidden = false;
  };
  const giro = async () => {
    if (!attivo) return;
    // Finestra chiusa o contenuto cambiato: spengo la fotocamera.
    if (!video.isConnected || !f.open) { ferma(); return; }
    if (video.readyState >= 2 && video.videoWidth) {
      const { tensore } = tensoreDa(video, video.videoWidth, video.videoHeight);
      const p = await probabilita(tensore);
      if (!attivo) return;
      media = media ? media.map((v, i) => v * 0.5 + p[i] * 0.5) : p;
      const [a, b] = ordina(media, ortaggioAttuale());
      const pc = (x) => Math.round(x.prob * 100);
      testo.innerHTML = a.prob >= SICURO
        ? `<b>${esc(CLASSI_INFO[a.classe].nome)}</b> ${pc(a)}%`
        : a.prob >= NON_SO
          ? `<span class="tenue">Forse</span> <b>${esc(CLASSI_INFO[a.classe].nome)}</b> ${pc(a)}% <span class="tenue">o ${esc(CLASSI_INFO[b.classe].nome)} ${pc(b)}%</span>`
          : `<span class="tenue">Non capisco: avvicinati, parte malata al centro…</span>`;
      testo.classList.toggle("sicuro", a.prob >= SICURO);
      usa.disabled = false;
    }
    setTimeout(giro, 300);
  };

  avvia.addEventListener("click", async () => {
    avvia.hidden = true;
    box.hidden = false;
    usa.disabled = true;
    media = null;
    testo.textContent = sessioneModello ? "Accendo la fotocamera…" : "Preparo il riconoscimento (la prima volta scarica circa 17 MB)…";
    try {
      await modelloMalattie();
      flusso = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false,
      });
      if (!video.isConnected || !f.open) { ferma(); return; }
      video.srcObject = flusso;
      document.addEventListener("visibilitychange", nascosta);
      await video.play().catch(() => {});
      testo.textContent = "Inquadra la foglia dentro il quadrato…";
      attivo = true;
      giro();
    } catch (e) {
      console.error(e);
      ferma();
      f.querySelector("#esito-foto").innerHTML = `<p class="avviso">Non riesco ad aprire la fotocamera${e.name === "NotAllowedError" ? ": devi permettere all'app di usarla (impostazioni del browser, permessi del sito)" : ""}. Puoi usare «📷 Scatta».</p>`;
    }
  });
  usa.addEventListener("click", async () => {
    if (!attivo || !video.videoWidth) return;
    attivo = false; // ferma il giro, la fotocamera la spengo dopo aver preso il fotogramma
    const w = video.videoWidth, h = video.videoHeight;
    const fermo = document.createElement("canvas");
    fermo.width = w;
    fermo.height = h;
    fermo.getContext("2d").drawImage(video, 0, 0, w, h);
    ferma();
    const ortaggioId = ortaggioAttuale();
    const { media: m, anteprima } = await mediaViste(fermo, w, h);
    const foto = await fotoRidotta(fermo, w, h);
    mostraRisultato({ grezze: m, ordinate: ordina(m, ortaggioId), anteprima, foto, ortaggioId, modo: "vivo" });
  });
  box.querySelector("#vivo-chiudi").addEventListener("click", ferma);
  // La fotocamera si spegne sempre quando si chiude la finestra o si esce dall'app.
  f.addEventListener("close", ferma, { once: true });
}

// Riga in fondo al riquadro: quante foto corrette sono pronte da inviare.
async function aggiornaRaccolte(f) {
  const box = f.querySelector("#foto-raccolte");
  if (!box || !window.indexedDB) return;
  let n = 0;
  try { n = await contaCorrezioni(); } catch (e) { console.warn(e); return; }
  box.innerHTML = n ? `<p class="tenue" style="margin:10px 0 4px">📦 Foto raccolte per migliorare il modello: <b>${n}</b></p>
    <div class="riga-bottoni" style="margin:0">
      <button type="button" class="piccolo secondario" data-invia-foto>📤 Invia le foto</button>
      <button type="button" class="piccolo secondario" data-svuota-foto>🗑️ Svuota</button>
    </div>` : "";
}

function collegaRiconosci(f, { aiuolaId = "", impiantoId = "" } = {}) {
  const esito = f.querySelector("#esito-foto");
  if (!esito) return;
  // L'ortaggio è quello scelto nel campo «Ortaggio» della guida (se c'è).
  const ortaggioAttuale = () => f.querySelector("#d_ortaggio")?.value || "";
  let ultimo = null;
  const mostra = (r) => { ultimo = r; esito.innerHTML = htmlRisultato(r); };
  f.querySelectorAll(".foto-malattia").forEach((input) => input.addEventListener("change", async () => {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    esito.innerHTML = `<p class="tenue">${sessioneModello ? "Guardo la foto…" : "Preparo il riconoscimento (la prima volta scarica circa 17 MB, poi funziona anche senza rete)…"}</p>`;
    try {
      mostra(await riconosciFoto(file, ortaggioAttuale()));
    } catch (e) {
      console.error(e);
      esito.innerHTML = `<p class="avviso">Non sono riuscito a riconoscere la foto: ${esc(e.message || e)}. La prima volta serve la rete.</p>`;
    }
  }));
  collegaVivo(f, mostra, ortaggioAttuale);
  aggiornaRaccolte(f);

  const registra = async (giusta, nota) => {
    const r = ultimo;
    const fatto = esito.querySelector(".correggi-fatto");
    try {
      await salvaCorrezione({
        data: new Date().toISOString(), modello: MODELLO_URL, modo: r.modo,
        ortaggio: r.ortaggioId || "", risposta: r.ordinate[0].classe,
        probabilita: Object.fromEntries(CLASSI_MODELLO.map((c, i) => [c, Math.round(r.grezze[i] * 1000) / 1000])),
        giusta, nota, foto: r.foto,
      });
      esito.querySelectorAll(".correggi .riga-bottoni, .correggi-modulo").forEach((x) => { x.hidden = true; });
      fatto.hidden = false;
      fatto.textContent = "Grazie: foto salvata sul telefono. Quando ne hai raccolte un po', premi «Invia le foto».";
      aggiornaRaccolte(f);
    } catch (e) {
      console.error(e);
      fatto.hidden = false;
      fatto.textContent = "Non sono riuscito a salvare la foto: " + (e.message || e);
    }
  };

  esito.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tratta]");
    if (t) {
      const p = PROBLEMI.find((x) => x.id === t.dataset.tratta);
      moduloEvento({ tipo: "trattamento", aiuolaId, impiantoId: impiantoId || undefined, testo: `${p.nome}: ` });
      return;
    }
    const g = e.target.closest("[data-giudizio]");
    if (g && ultimo) {
      if (g.dataset.giudizio === "giusto") registra(ultimo.ordinate[0].classe, "");
      else esito.querySelector(".correggi-modulo").hidden = false;
      return;
    }
    if (e.target.closest("[data-salva-correzione]") && ultimo) {
      const giusta = esito.querySelector("#c_giusta").value;
      if (!giusta) { esito.querySelector("#c_giusta").focus(); return; }
      registra(giusta, esito.querySelector("#c_nota").value.trim());
    }
  });
  f.querySelector("#foto-raccolte")?.addEventListener("click", async (e) => {
    if (e.target.closest("[data-invia-foto]")) {
      if (await inviaCorrezioni() && confirm("Hai inviato le foto? Se sì, le tolgo dal telefono per liberare spazio.")) {
        await svuotaCorrezioni();
        aggiornaRaccolte(f);
      }
    } else if (e.target.closest("[data-svuota-foto]")) {
      if (confirm("Cancellare dal telefono tutte le foto raccolte per il modello? Non le potrai più inviare.")) {
        await svuotaCorrezioni();
        aggiornaRaccolte(f);
      }
    }
  });
}
