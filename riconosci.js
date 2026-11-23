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

// Come Ultralytics: lato corto a 224 px, ritaglio centrale 224×224, valori 0–1.
// "sorgente" è una foto (ImageBitmap) o il video della fotocamera.
function tensoreDa(sorgente, larghezza, altezza) {
  const lato = Math.min(larghezza, altezza);
  const c = document.createElement("canvas");
  c.width = c.height = 224;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(sorgente, (larghezza - lato) / 2, (altezza - lato) / 2, lato, lato, 0, 0, 224, 224);
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
function ordina(p) {
  return p.map((v, i) => ({ classe: CLASSI_MODELLO[i], prob: v })).sort((a, b) => b.prob - a.prob);
}

async function riconosciFoto(file) {
  await modelloMalattie();
  const img = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { tensore, tela } = tensoreDa(img, img.width, img.height);
  img.close?.();
  return { ordinate: ordina(await probabilita(tensore)), anteprima: tela.toDataURL("image/jpeg", 0.8) };
}

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

function htmlRisultato({ ordinate, anteprima }) {
  const [a, b] = ordinate;
  const ipotesi = a.prob >= SICURO ? [a] : [a, b];
  const titolo = a.prob >= SICURO
    ? `Sembra: <b>${esc(CLASSI_INFO[a.classe].nome)}</b> (${Math.round(a.prob * 100)}%)`
    : `Non sono sicuro: <b>${esc(CLASSI_INFO[a.classe].nome)}</b> ${Math.round(a.prob * 100)}% o <b>${esc(CLASSI_INFO[b.classe].nome)}</b> ${Math.round(b.prob * 100)}%`;
  const schede = ipotesi.map(({ classe }) => {
    const info = CLASSI_INFO[classe];
    return (info.nota ? `<p class="bene">${esc(info.nome)}: ${esc(info.nota)}</p>` : "") + info.problemi.map(htmlSchedaProblema).join("");
  }).join("");
  return `<div class="riconosci-esito">
      <img src="${anteprima}" alt="Parte della foto esaminata">
      <p>${titolo}</p>
    </div>
    ${schede}
    <p class="tenue piccolo">Il modello ha guardato il quadrato centrale della foto (quello qui sopra). È in prova: può sbagliare, soprattutto se l'insetto è piccolo o la foto è presa da lontano.</p>`;
}

// Riquadro in cima alla guida delle malattie.
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
    <p class="tenue piccolo">Inquadra <b>da vicino una foglia sola</b> o l'insetto, al centro. <span class="chip-futuro">in prova</span></p>
    <div id="vivo" hidden>
      <div class="vivo-video"><video playsinline muted autoplay></video></div>
      <p class="vivo-esito" aria-live="polite">Accendo la fotocamera…</p>
      <div class="riga-bottoni" style="margin:6px 0 0">
        <button type="button" id="vivo-usa" disabled>✓ Usa questa</button>
        <button type="button" class="secondario" id="vivo-chiudi">✕ Chiudi la fotocamera</button>
      </div>
    </div>
    <div id="esito-foto"></div>
  </div>`;
}

// -----------------------------------------------------------------------------
// Dal vivo: la fotocamera resta accesa e il modello guarda il quadrato centrale
// circa 3 volte al secondo. La risposta è la media degli ultimi fotogrammi, così
// non salta da una malattia all'altra a ogni movimento.
// -----------------------------------------------------------------------------
function collegaVivo(f, mostraRisultato) {
  const box = f.querySelector("#vivo");
  const avvia = f.querySelector("#vivo-avvia");
  if (!box || !avvia) return;
  const video = box.querySelector("video");
  const testo = box.querySelector(".vivo-esito");
  const usa = box.querySelector("#vivo-usa");
  let flusso = null, attivo = false, media = null, ultimo = null;

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
      const { tensore, tela } = tensoreDa(video, video.videoWidth, video.videoHeight);
      const p = await probabilita(tensore);
      if (!attivo) return;
      media = media ? media.map((v, i) => v * 0.5 + p[i] * 0.5) : p;
      const [a, b] = ordina(media);
      ultimo = { ordinate: ordina(media), tela };
      const pc = (x) => Math.round(x.prob * 100);
      testo.innerHTML = a.prob >= SICURO
        ? `<b>${esc(CLASSI_INFO[a.classe].nome)}</b> ${pc(a)}%`
        : `<span class="tenue">Forse</span> <b>${esc(CLASSI_INFO[a.classe].nome)}</b> ${pc(a)}% <span class="tenue">o ${esc(CLASSI_INFO[b.classe].nome)} ${pc(b)}%</span>`;
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
  usa.addEventListener("click", () => {
    if (!ultimo) return;
    const r = { ordinate: ultimo.ordinate, anteprima: ultimo.tela.toDataURL("image/jpeg", 0.8) };
    ferma();
    mostraRisultato(r);
  });
  box.querySelector("#vivo-chiudi").addEventListener("click", ferma);
  // La fotocamera si spegne sempre quando si chiude la finestra o si esce dall'app.
  f.addEventListener("close", ferma, { once: true });
}

function collegaRiconosci(f, { aiuolaId = "", impiantoId = "" } = {}) {
  const esito = f.querySelector("#esito-foto");
  if (!esito) return;
  const mostra = (r) => { esito.innerHTML = htmlRisultato(r); };
  f.querySelectorAll(".foto-malattia").forEach((input) => input.addEventListener("change", async () => {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    esito.innerHTML = `<p class="tenue">${sessioneModello ? "Guardo la foto…" : "Preparo il riconoscimento (la prima volta scarica circa 17 MB, poi funziona anche senza rete)…"}</p>`;
    try {
      mostra(await riconosciFoto(file));
    } catch (e) {
      console.error(e);
      esito.innerHTML = `<p class="avviso">Non sono riuscito a riconoscere la foto: ${esc(e.message || e)}. La prima volta serve la rete.</p>`;
    }
  }));
  collegaVivo(f, mostra);
  esito.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tratta]");
    if (!t) return;
    const p = PROBLEMI.find((x) => x.id === t.dataset.tratta);
    moduloEvento({ tipo: "trattamento", aiuolaId, impiantoId: impiantoId || undefined, testo: `${p.nome}: ` });
  });
}
