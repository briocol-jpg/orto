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
async function tensoreDaFoto(file) {
  const img = await createImageBitmap(file, { imageOrientation: "from-image" });
  const lato = Math.min(img.width, img.height);
  const c = document.createElement("canvas");
  c.width = c.height = 224;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(img, (img.width - lato) / 2, (img.height - lato) / 2, lato, lato, 0, 0, 224, 224);
  img.close?.();
  const px = g.getImageData(0, 0, 224, 224).data;
  const n = 224 * 224;
  const dati = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    dati[i] = px[i * 4] / 255;
    dati[n + i] = px[i * 4 + 1] / 255;
    dati[2 * n + i] = px[i * 4 + 2] / 255;
  }
  return { tensore: new ort.Tensor("float32", dati, [1, 3, 224, 224]), anteprima: c.toDataURL("image/jpeg", 0.8) };
}

async function riconosciFoto(file) {
  const s = await modelloMalattie();
  const { tensore, anteprima } = await tensoreDaFoto(file);
  const uscita = await s.run({ [s.inputNames[0]]: tensore });
  const p = Array.from(uscita[s.outputNames[0]].data);
  const ordinate = p.map((v, i) => ({ classe: CLASSI_MODELLO[i], prob: v })).sort((a, b) => b.prob - a.prob);
  return { ordinate, anteprima };
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
  return `<div class="riconosci">
    <label class="bottone-foto">📷 Riconosci da una foto
      <input type="file" accept="image/*" id="foto-malattia" hidden>
    </label>
    <p class="tenue piccolo">Fotografa <b>da vicino una foglia sola</b> o l'insetto, al centro della foto. <span class="chip-futuro">in prova</span></p>
    <div id="esito-foto"></div>
  </div>`;
}

function collegaRiconosci(f, { aiuolaId = "", impiantoId = "" } = {}) {
  const input = f.querySelector("#foto-malattia");
  const esito = f.querySelector("#esito-foto");
  if (!input) return;
  input.addEventListener("change", async () => {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    esito.innerHTML = `<p class="tenue">${sessioneModello ? "Guardo la foto…" : "Preparo il riconoscimento (la prima volta scarica circa 17 MB, poi funziona anche senza rete)…"}</p>`;
    try {
      esito.innerHTML = htmlRisultato(await riconosciFoto(file));
    } catch (e) {
      console.error(e);
      esito.innerHTML = `<p class="avviso">Non sono riuscito a riconoscere la foto: ${esc(e.message || e)}. La prima volta serve la rete.</p>`;
    }
  });
  esito.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tratta]");
    if (!t) return;
    const p = PROBLEMI.find((x) => x.id === t.dataset.tratta);
    moduloEvento({ tipo: "trattamento", aiuolaId, impiantoId: impiantoId || undefined, testo: `${p.nome}: ` });
  });
}
