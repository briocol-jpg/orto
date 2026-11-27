// =============================================================================
// Il mio orto: calendario su misura, aiuole e diario.
// Tutti i dati restano sul telefono (localStorage). Servizi esterni usati solo
// con la posizione dell'orto: Open-Meteo (meteo, clima, altitudine),
// BigDataCloud (nome del luogo), ISRIC SoilGrids (terreno).
// =============================================================================
"use strict";

// Nell'orto di prova (prova.js) i dati stanno in un'altra chiave: quelli veri non si toccano.
const IN_PROVA = (() => { try { return sessionStorage.getItem("ilmioorto.inProva") === "1"; } catch { return false; } })();
// Orto di prova, oppure l'orto della persona scelta (profili.js; il primo è "ilmioorto.v1").
const CHIAVE = IN_PROVA ? "ilmioorto.prova" : profiloAttivo().chiave;
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const MESI_LUNGHI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio",
  "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
const FASI = {
  sem: { nome: "Semina in semenzaio", breve: "semenzaio", verbo: "Semina in semenzaio" },
  dir: { nome: "Semina a terra", breve: "a terra", verbo: "Semina a terra" },
  tra: { nome: "Trapianto", breve: "trapianto", verbo: "Trapianta" },
  rac: { nome: "Raccolta", breve: "raccolta", verbo: "Raccogli" },
};
const MODI = { sem: "Semina in semenzaio", dir: "Semina a terra", tra: "Trapianto (piantine)", acq: "Piantine comprate" };
// Piantine comprate (modo "acq", solo nel semenzaio): i.acquisto = { vasetti, perVasetto,
// costo, marca, negozio, luogoNegozio }; si trapiantano come quelle seminate.
const PIANTINE_PER_VASETTO = [1, 4, 6, 9, 12, 15, 20];
function piantineAcquisto(q) { return (Number(q?.vasetti) || 0) * (Number(q?.perVasetto) || 0); }
function testoAcquisto(i) {
  const q = i.acquisto || {};
  const n = piantineAcquisto(q);
  return [n ? `${q.vasetti} ${q.vasetti == 1 ? "vasetto" : "vasetti"} da ${q.perVasetto} = ${n} ${n === 1 ? "piantina" : "piantine"}` : "",
    q.costo ? `€ ${fmtEuro(q.costo)}` : "", q.marca, [q.negozio, q.luogoNegozio].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
}
function fmtEuro(n) { return (Math.round(Number(n) * 100) / 100).toFixed(2).replace(".", ","); }
const TIPI_EVENTO = {
  raccolto: "🧺 Raccolto",
  annaffiatura: "💧 Annaffiatura",
  concimazione: "🟤 Concimazione",
  trattamento: "🧴 Trattamento",
  lavoro: "🛠️ Lavoro",
  terra: "🪣 Terra cambiata",
  malattia: "🦠 Malattia del terreno",
  nota: "📝 Nota",
};
// Malattie che restano nella terra (annotazione «🦠 Malattia del terreno»):
// per «anni» anni le famiglie colpite non tornano in quell'aiuola.
// altre = famiglie che la stessa malattia attacca oltre a quella segnata.
const MALATTIE_TERRENO = {
  nonso: { nome: "Non so", anni: 5 },
  fusariosi: { nome: "Fusariosi (fusto marrone dentro)", anni: 5 },
  verticillosi: { nome: "Verticillosi (strisce marroni, foglie gialle da un lato)", anni: 5, altre: ["solanacee", "cucurbitacee", "rosacee"] },
  nematodi: { nome: "Nematodi (palline sulle radici)", anni: 4 },
  colletto: { nome: "Marciume del colletto (base molle e marcia)", anni: 3 },
};
const SOGLIA_BRINATA = 2; // °C di minima dell'aria: sotto, a terra può brinare
const ANNI_ROTAZIONE = 3;
const ORIZZONTE = 21; // giorni guardati in "Oggi"
const ANTICIPO_PROMEMORIA = 7; // giorni prima di un'attività segnata nel diario con una data futura

const PER_ID = Object.fromEntries(ORTAGGI.map((o) => [o.id, o]));
const ZONA_PREDEFINITA = "Orto";
const CORRIDOIO = 0.4; // metri tra un'aiuola e l'altra nel disegno
const PX_PER_METRO = 90; // scala massima del disegno: una serra piccola non diventa enorme

function numeroMisura(t) {
  const n = Number(String(t ?? "").replace(",", "."));
  return n > 0 ? n : null;
}
function fmtM(n) {
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

// -----------------------------------------------------------------------------
// Errori visibili (utile senza console sul telefono)
// -----------------------------------------------------------------------------
function mostraErrore(testo) {
  const box = document.getElementById("errori");
  box.hidden = false;
  box.textContent = "Errore: " + testo;
}
window.addEventListener("error", (e) => mostraErrore(e.message));
window.addEventListener("unhandledrejection", (e) => mostraErrore(String(e.reason)));

// -----------------------------------------------------------------------------
// Stato
// -----------------------------------------------------------------------------
function statoVuoto() {
  return {
    versione: 1,
    impostazioni: {
      ultimaBrinata: BASE_ULTIMA_BRINATA,
      primaBrinata: BASE_PRIMA_BRINATA,
      lat: null, lon: null, altitudine: null, luogo: "",
      preferiti: [],
      soloPreferiti: false,
    },
    aiuole: [{ id: "semenzaio", nome: "Semenzaio", semenzaio: true, note: "" }],
    zone: {}, // per nome di zona: { corridoio: metri tra le aiuole }
    impianti: [],
    eventi: [],
    clima: null,
    terreno: null,
    meteo: null,
  };
}

function carica() {
  try {
    const testo = localStorage.getItem(CHIAVE);
    if (testo) {
      const s = JSON.parse(testo);
      const vuoto = statoVuoto();
      s.impostazioni = Object.assign(vuoto.impostazioni, s.impostazioni || {});
      for (const k of ["aiuole", "impianti", "eventi"]) if (!Array.isArray(s[k])) s[k] = vuoto[k];
      if (!s.aiuole.some((a) => a.semenzaio)) s.aiuole.unshift(vuoto.aiuole[0]);
      if (!s.zone || typeof s.zone !== "object") s.zone = {};
      migraAiuole(s.aiuole);
      allineaSerre(s.aiuole);
      allineaParti(s.aiuole);
      return s;
    }
  } catch (e) {
    console.warn(e);
  }
  return statoVuoto();
}

// Aiuole delle versioni precedenti: zona, numero e misure in metri.
function migraAiuole(aiuole) {
  let n = 0;
  for (const a of aiuole) {
    if (a.semenzaio) continue;
    if (!a.zona) a.zona = ZONA_PREDEFINITA;
    n = Math.max(n, Number(a.numero) || 0);
  }
  for (const a of aiuole) {
    if (a.semenzaio) continue;
    if (a.numero == null || a.numero === "") a.numero = ++n;
    if (a.misure && a.larghezza == null) {
      const m = String(a.misure).match(/(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+(?:[.,]\d+)?)/i);
      if (m) {
        a.larghezza = numeroMisura(m[1]);
        a.lunghezza = numeroMisura(m[2]);
      }
    }
  }
}

let S = carica();

function salva() {
  allineaParti(S.aiuole);
  timbraScacchiere();
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(S));
  } catch (e) {
    mostraErrore("non riesco a salvare i dati sul telefono (" + e.message + ")");
  }
}

function nuovoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// -----------------------------------------------------------------------------
// Date
// -----------------------------------------------------------------------------
function aISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daISO(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}
function oggi() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
}
function piuGiorni(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
}
function giorniTra(a, b) {
  return Math.round((b - a) / 86400000);
}
function fmt(d) {
  return `${d.getDate()} ${MESI[d.getMonth()]}`;
}
function fmtLungo(d) {
  return `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI_LUNGHI[d.getMonth()]} ${d.getFullYear()}`;
}
function fmtMmdd(mmdd) {
  const [m, d] = mmdd.split("-").map(Number);
  return `${d} ${MESI_LUNGHI[m - 1]}`;
}
function giornoAnno(mmdd) {
  const [m, d] = mmdd.split("-").map(Number);
  return giorniTra(new Date(2025, 0, 1, 12), new Date(2025, m - 1, d, 12));
}
function mmddDaGiorno(n) {
  const d = piuGiorni(new Date(2025, 0, 1, 12), Math.round(n));
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Spostamento delle finestre in base alle brinate del luogo.
function sposta(mmdd, anno) {
  const [m, d] = mmdd.split("-").map(Number);
  const delta = m <= 7
    ? giornoAnno(S.impostazioni.ultimaBrinata) - giornoAnno(BASE_ULTIMA_BRINATA)
    : giornoAnno(S.impostazioni.primaBrinata) - giornoAnno(BASE_PRIMA_BRINATA);
  return new Date(anno, m - 1, d + delta, 12);
}

function finestreAnno(o, fase, anno) {
  return (o[fase] || []).map(([a, b]) => {
    const inizio = sposta(a, anno);
    const fine = b < a ? sposta(b, anno + 1) : sposta(b, anno);
    return { inizio, fine };
  });
}

// Finestre che toccano l'intervallo [da, a].
function finestreTra(o, fase, da, a) {
  const out = [];
  for (const anno of [da.getFullYear() - 1, da.getFullYear(), da.getFullYear() + 1]) {
    for (const f of finestreAnno(o, fase, anno)) {
      if (f.fine >= da && f.inizio <= a) out.push(f);
    }
  }
  return out;
}

// -----------------------------------------------------------------------------
// Utilità
// -----------------------------------------------------------------------------
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function el(id) { return document.getElementById(id); }
function nomeOrtaggio(id) {
  const o = PER_ID[id];
  return o ? `${icona(o)} ${o.nome}` : id;
}
// Per i menu a tendina e i testi semplici: solo emoji (le icone disegnate sono HTML).
function nomeOrtaggioTesto(id) {
  const o = PER_ID[id];
  return o ? `${o.emoji} ${o.nome}` : id;
}
function aiuola(id) { return S.aiuole.find((a) => a.id === id); }
// Aiuola divisa in parti (es. una serra con aglio e cipolle, ognuna con la sua
// scacchiera): le parti sono aiuole vere con dentro = id dell'aiuola grande e
// parte = "a", "b"… L'aiuola grande resta per la pianta, la serra e la porta, ma
// non si coltiva più (la sua storia vale per tutte le parti). a.divisa = "lato"
// (parti affiancate da sinistra a destra) o "fondo" (una dietro l'altra).
function partiDi(a) { return a ? S.aiuole.filter((x) => x.dentro === a.id).sort((p, q) => (p.parte || "").localeCompare(q.parte || "")) : []; }
function padreDi(a) { return a?.dentro ? aiuola(a.dentro) : null; }
// Stesso pezzo di terra: l'aiuola stessa o l'aiuola grande di cui è una parte.
function stessoTerreno(idX, aiuolaId) { return idX === aiuolaId || (Boolean(idX) && idX === aiuola(aiuolaId)?.dentro); }
// Le parti prendono dall'aiuola grande zona, numero, fila e serra.
function allineaParti(aiuole) {
  for (const c of aiuole) {
    if (!c.dentro) continue;
    const p = aiuole.find((x) => x.id === c.dentro);
    if (!p) { delete c.dentro; delete c.parte; continue; }
    Object.assign(c, { zona: p.zona, numero: p.numero, fila: p.fila, inizio: null, copertura: p.copertura, giroSerra: false, porta: "", capanno: false, vaso: "" });
    if (p.serraAnni) c.serraAnni = { ...p.serraAnni }; else delete c.serraAnni;
    if (p.divisa === "fondo") c.larghezza = p.larghezza; else c.lunghezza = p.lunghezza;
  }
}
const COPERTURE = { "": "All'aperto", serra: "In serra o tunnel" };
const PACCIAMATURE = { "": "Terra nuda", telo: "Telo di pacciamatura", organica: "Paglia, foglie o erba" };
const ANTICIPO_SERRA = 21; // giorni: in serra si semina prima e si raccoglie più a lungo
// Serre spostabili: le aiuole con giroSerra sono i posti dove l'orticoltore
// sposta le serre da un anno all'altro. serraAnni = { "2027": true, ... } dice
// dove stava la serra in ogni anno (lo scrive il piano della stagione);
// copertura resta la situazione di adesso. Senza voce per l'anno vale copertura.
function serraNel(a, anno) {
  const v = a?.serraAnni?.[String(anno)];
  return v == null ? a?.copertura === "serra" : !!v;
}
// All'apertura: se per l'anno in corso c'è una posizione decisa, la serra è lì.
function allineaSerre(aiuole) {
  const anno = String(oggi().getFullYear());
  for (const a of aiuole) {
    const v = a.serraAnni?.[anno];
    if (v != null) a.copertura = v ? "serra" : "";
  }
}
// Porta della serra: lato da cui si entra (la serra si può girare).
const PORTE = { "": "— non indicata —", sinistra: "A sinistra", destra: "A destra", dietro: "Dietro (verso il fondo)", davanti: "Davanti (verso di te)" };
// Capanno o deposito degli attrezzi: si disegna nella pianta ma non si coltiva.
// Vasi: a.vaso = "tondo" (larghezza = lunghezza = diametro), "quadrato"
// (larghezza = lunghezza = lato) o "rettangolare".
const VASI = { tondo: "Vaso tondo", quadrato: "Vaso quadrato", rettangolare: "Vaso rettangolare" };
// Etichetta del campo larghezza e lunghezza nascosta secondo il tipo di vaso.
// Forma dei vasi di una scacchiera fatta di vasi ("" = terra; il vecchio true = tondi).
function formaVasiCaselle(a) { return a?.caselleVasi === true ? "tondo" : a?.caselleVasi || ""; }
function campiMisureVaso(form, cosa, ognuno) {
  form.querySelector("#w_lunghezza").hidden = cosa === "tondo" || cosa === "quadrato";
  form.querySelector("label[for=m_larghezza]").textContent = cosa === "tondo" ? `Diametro${ognuno ? " di ognuno" : ""} in metri (es. 0,30 per 30 cm)`
    : cosa === "quadrato" ? `Lato${ognuno ? " di ognuno" : ""} in metri (es. 0,30 per 30 cm)`
    : `Larghezza${ognuno ? " di ognuna" : ""} in metri (da sinistra a destra)`;
}
// Superficie in m² (0 senza misure): il vaso tondo è un cerchio.
function mqAiuola(a) {
  if (!a?.larghezza || !a?.lunghezza) return 0;
  return a.vaso === "tondo" ? Math.PI * (a.larghezza / 2) ** 2 : a.larghezza * a.lunghezza;
}
function iconaAiuola(a, serra = a.copertura === "serra") {
  return a.semenzaio ? "🪴" : a.capanno ? "" : serra ? "🏠" : a.vaso ? "🏺" : "🟫";
}
function coltivabile(a) { return Boolean(a) && !a.semenzaio && !a.capanno && !S.aiuole.some((x) => x.dentro === a.id); }
function inSerra(aiuolaId, anno) { return serraNel(aiuola(aiuolaId), anno ?? oggi().getFullYear()); }
// Protezione di una singola coltura (si mette e si toglie). Il tessuto non tessuto
// (appoggiato o su archetti) tiene 2–3 °C in più e ripara dalle brinate leggere:
// circa 2 settimane di vantaggio. La miniserra (tunnel basso) in PVC trasparente scalda di
// più di giorno (effetto serra): circa 3 settimane, ma va aperto col sole e annaffiato.
const PROTEZIONI = { "": "Nessuna", tnt: "🧣 TNT (tessuto non tessuto appoggiato)", tunnelTnt: "⛺ Miniserra in TNT (su archetti)", tunnelTelo: "⛺ Miniserra in PVC trasparente (su archetti)" };
const ANTICIPI_PROTEZIONE = { tnt: 14, tunnelTnt: 14, tunnelTelo: 21 };
const PROTEZIONE_BREVE = { tnt: "🧣 TNT", tunnelTnt: "⛺ miniserra in TNT", tunnelTelo: "⛺ miniserra in PVC" };
const VANTAGGIO_PROTEZIONE = { tnt: "del tessuto non tessuto", tunnelTnt: "della miniserra in TNT", tunnelTelo: "della miniserra in PVC" };
function anticipo(aiuolaId, protezione, anno) {
  return (inSerra(aiuolaId, anno) ? ANTICIPO_SERRA : 0) + (ANTICIPI_PROTEZIONE[protezione] || 0);
}
function testoVantaggio(aiuolaId, protezione, anno) {
  const v = [inSerra(aiuolaId, anno) ? "della serra" : "", VANTAGGIO_PROTEZIONE[protezione] || ""].filter(Boolean);
  return v.length ? ` (contando il vantaggio ${v.join(" e ")})` : "";
}
const CONSIGLIO_TNT = "🧣 Tessuto non tessuto: stendilo appena seminato o trapiantato, appoggiato sulle piante o su archetti, coi bordi fermati da terra o sassi. Si annaffia anche attraverso. Nelle giornate calde (sopra 20 °C) aprilo, e toglilo quando le minime restano sopra 8–10 °C o quando la pianta fiorisce (servono gli insetti).";
const CONSIGLI_PROTEZIONE = {
  tnt: CONSIGLIO_TNT,
  tunnelTnt: "⛺ Miniserra in TNT: archetti ogni 70–100 cm, il tessuto sopra coi bordi interrati o fermati da sassi. Come il TNT appoggiato (2–3 °C in più, ripara dalle brinate leggere fino a −3/−4 °C), ma non schiaccia le foglie e le piante hanno più aria. Pioggia e aria passano: non va aperto. Col gelo forte metti due strati.",
  tunnelTelo: "⛺ Miniserra in PVC trasparente: di giorno col sole dentro fa molto più caldo che fuori (anche 10–15 °C in più), di notte tiene solo 1–3 °C. Nelle giornate di sole sopra 12–15 °C apri le testate o solleva un lato, e richiudi nel pomeriggio: il caldo e la condensa fanno marcire lattughe e finocchi (muffa grigia, peronospora). La pioggia non entra: annaffia. Toglilo quando le minime restano sopra 8–10 °C.",
};
// Fila dell'aiuola nella pianta: 0 = principale, positivi dietro (verso il fondo), negativi davanti.
function filaAiuola(a) {
  if (a.fila === "dietro") return 1; // versione precedente: una sola fila dietro
  return Number(a.fila) || 0;
}
const OPZIONI_FILA = [
  ["3", "3ª fila dietro (verso il fondo)"], ["2", "2ª fila dietro"], ["1", "1ª fila dietro"],
  ["0", "Fila principale"],
  ["-1", "1ª fila davanti (verso di te)"], ["-2", "2ª fila davanti"], ["-3", "3ª fila davanti"],
];
function corridoioZona(zona) {
  const c = S.zone?.[zona]?.corridoio;
  return c == null ? CORRIDOIO : c;
}
function tipoAiuola(a) {
  if (padreDi(a)) return [`parte ${a.parte} di ${nomeAiuola(padreDi(a)).toLowerCase()}`, a.copertura === "serra" ? "in serra" : "", a.pacciamatura ? PACCIAMATURE[a.pacciamatura].toLowerCase() : ""].filter(Boolean).join(" · ");
  if (partiDi(a).length) return [`divisa in ${partiDi(a).length} parti`, a.copertura === "serra" ? "in serra" : "", a.porta && (a.copertura === "serra") ? `porta ${PORTE[a.porta].split(" (")[0].toLowerCase()}` : "", a.giroSerra ? "🔁 giro delle serre spostabili" : ""].filter(Boolean).join(" · ");
  if (a.capanno) return `${a.copertura === "serra" ? "serra usata come capanno degli attrezzi" : "capanno degli attrezzi"}${PORTE[a.porta] && a.porta ? `, porta ${PORTE[a.porta].split(" (")[0].toLowerCase()}` : ""}, non si coltiva`;
  return [a.copertura === "serra" && a.porta ? `porta ${PORTE[a.porta].split(" (")[0].toLowerCase()}` : "", a.copertura === "serra" ? "in serra" : "", a.giroSerra ? "🔁 giro delle serre spostabili" : "", a.pacciamatura ? PACCIAMATURE[a.pacciamatura].toLowerCase() : ""].filter(Boolean).join(" · ");
}
function zone() {
  return [...new Set(S.aiuole.filter((a) => !a.semenzaio).map((a) => a.zona || ZONA_PREDEFINITA))];
}
// Semenzaio, poi per zona e per numero (da sinistra a destra).
function aiuoleOrdinate() {
  const z = zone();
  return [...S.aiuole].sort((x, y) => (y.semenzaio ? 1 : 0) - (x.semenzaio ? 1 : 0)
    || z.indexOf(x.zona || ZONA_PREDEFINITA) - z.indexOf(y.zona || ZONA_PREDEFINITA)
    || (Number(x.numero) || 0) - (Number(y.numero) || 0)
    || (x.dentro ? 1 : 0) - (y.dentro ? 1 : 0) || (x.parte || "").localeCompare(y.parte || ""));
}
// Orto scelto coi bottoni in cima alla scheda Orto ("" = tutti).
function zonaScelta() {
  const z = S.impostazioni.zonaVista;
  return z && zone().includes(z) ? z : "";
}
function nomeAiuola(a) {
  if (!a) return "";
  if (a.semenzaio) return a.nome;
const n = `${a.numero}${a.parte || ""}`;
  const base = a.capanno ? `🧰 ${a.nome || "Capanno"}` : a.vaso && !a.nome ? `${VASI[a.vaso] || "Vaso"} ${n}` : a.nome ? `${n} · ${a.nome}` : `Aiuola ${n}`;
  return zone().length > 1 ? `${base} (${a.zona || ZONA_PREDEFINITA})` : base;
}
function nomeAiuolaId(id) { return nomeAiuola(aiuola(id)); }
function misureAiuola(a) {
  if (a.vaso === "tondo" && a.larghezza) return `Ø ${Math.round(a.larghezza * 100)} cm · ${fmtM(mqAiuola(a))} m²`;
  if (a.vaso === "quadrato" && a.larghezza) return `lato ${Math.round(a.larghezza * 100)} cm · ${fmtM(mqAiuola(a))} m²`;
  if (a.larghezza && a.lunghezza) return `${fmtM(a.larghezza)} × ${fmtM(a.lunghezza)} m · ${fmtM(mqAiuola(a))} m²`;
  return a.misure || "";
}
function preferito(id) { return S.impostazioni.preferiti.includes(id); }
function elencoOrtaggi() {
  const tutti = [...ORTAGGI].sort((a, b) => a.nome.localeCompare(b.nome, "it"));
  return [...tutti.filter((o) => preferito(o.id)), ...tutti.filter((o) => !preferito(o.id))];
}
function amiciDi(id) {
  return AMICI.filter((p) => p.includes(id)).map((p) => (p[0] === id ? p[1] : p[0]));
}
// Colture intercalari adatte alla data: niente cattivi vicini, e solo quelle che
// si possono seminare o trapiantare nei giorni in cui c'è ancora spazio.
function intercalari(ortaggioId, dataISO) {
  const x = INTERCALARI[ortaggioId];
  if (!x) return null;
  const da = daISO(dataISO || aISO(oggi())), a = piuGiorni(da, Math.min(x.giorni, 60));
  const nemici = nemiciDi(ortaggioId);
  const ok = x.tra.filter((id) => PER_ID[id] && !nemici.includes(id) && ["dir", "tra"].some((f) => finestreTra(PER_ID[id], f, da, a).length));
  return { ...x, ok };
}
function testoIntercalari(ortaggioId, dataISO) {
  const x = intercalari(ortaggioId, dataISO), o = PER_ID[ortaggioId];
  if (!x?.ok.length) return "";
  return `🌱 <b>Sfrutta lo spazio</b>: finché ${esc(o.nome.toLowerCase())} è piccolo (circa ${x.giorni} giorni), ${esc(x.dove)} puoi mettere colture veloci: <b>${x.ok.map((id) => esc(PER_ID[id].nome.split(" (")[0].toLowerCase())).join(", ")}</b>. Tienile a 25–30 cm dal piede e raccoglile prima che faccia ombra.`;
}
function nemiciDi(id) {
  return NEMICI.filter((p) => p.includes(id)).map((p) => (p[0] === id ? p[1] : p[0]));
}
function linkGoogleCalendar(titolo, data, dettagli) {
  const d1 = aISO(data).replaceAll("-", "");
  const d2 = aISO(piuGiorni(data, 1)).replaceAll("-", "");
  const q = new URLSearchParams({ action: "TEMPLATE", text: titolo, dates: `${d1}/${d2}`, details: dettagli || "" });
  return "https://calendar.google.com/calendar/render?" + q.toString();
}
async function scaricaJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`il servizio ha risposto ${r.status}`);
  return r.json();
}
function scaricaFile(nome, testo, tipo) {
  const blob = new Blob([testo], { type: tipo });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// -----------------------------------------------------------------------------
// Impianti: stime e controlli
// -----------------------------------------------------------------------------
function impiantiAttivi(aiuolaId) {
  return S.impianti.filter((i) => !i.finito && (aiuolaId === undefined || i.aiuolaId === aiuolaId));
}

// Prossimi passi previsti per un impianto attivo.
// Una raccolta stimata che cade fuori stagione (es. cipolle piantate in
// autunno: d'inverno non crescono) si sposta all'inizio del periodo di raccolta successivo.
function inStagioneDiRaccolta(o, d) {
  if (!o.rac?.length || finestreTra(o, "rac", d, d).length) return d;
  const prossime = finestreTra(o, "rac", d, piuGiorni(d, 366)).filter((w) => w.inizio >= d).sort((x, y) => x.inizio - y.inizio);
  return prossime.length ? prossime[0].inizio : d;
}

function stimeImpianto(i) {
  const o = PER_ID[i.ortaggioId];
  const out = [];
  if (!o) return out;
  const data = daISO(i.data);
  if ((i.modo === "sem" || i.modo === "acq") && aiuola(i.aiuolaId)?.semenzaio) {
    // Piantine comprate: si trapiantano dopo pochi giorni, ma non prima della stagione giusta.
    let trap = piuGiorni(data, i.modo === "acq" ? 3 : (o.semTrap || 6) * 7);
    if (i.modo === "acq") {
      const u = primaDataUtile(o.id, "tra", null, "");
      if (u && u.data > trap && giorniTra(trap, u.data) < 300) trap = u.data;
    }
    out.push({ tipo: "tra", data: trap, testo: `Trapianto di ${o.nome}` });
    if (o.gg) out.push({ tipo: "rac", data: inStagioneDiRaccolta(o, piuGiorni(trap, o.gg)), testo: `Prima raccolta di ${o.nome}` });
  } else if (o.gg) {
    out.push({ tipo: "rac", data: inStagioneDiRaccolta(o, piuGiorni(data, o.gg)), testo: `Prima raccolta di ${o.nome}` });
  }
  return out;
}

// Rotazione: stessa famiglia nella stessa aiuola negli ultimi anni.
// Con la scacchiera conta solo chi stava nelle stesse caselle (o su tutta l'aiuola).
// Aiuola riservata a un ortaggio che non si sposta: la terra va rinnovata.
function consiglioFissa(a) {
  const o = PER_ID[a.fissa];
  return `📌 Qui ogni anno ${esc(o.nome.toLowerCase())}, senza rotazione: la terra va rinnovata. Ogni autunno interra letame maturo (4–5 kg/m²${mqAiuola(a) ? `, ${fmtKg(4.5 * mqAiuola(a))} per questa aiuola` : ""}) o stallatico pellettato; ogni 3–4 anni, o se la pianta deperisce presto, togli i primi 20–30 cm di terra e mettine di nuova mescolata a compost.`;
}

// Terra cambiata (annotazione «🪣 Terra cambiata»): la data dell'ultima volta,
// fino al giorno dato. Le colture messe prima non contano più per la rotazione.
function terraCambiata(aiuolaId, finoAISO) {
  let t = "";
  for (const e of S.eventi) if (e.tipo === "terra" && stessoTerreno(e.aiuolaId, aiuolaId) && e.data <= finoAISO && e.data > t) t = e.data;
  return t;
}
// Malattie del terreno ancora valide in quell'aiuola, per quella famiglia, alla data.
// Terra cambiata dopo la malattia = malattia tolta.
function famiglieMalattia(e) { return [...new Set([e.fam, ...(MALATTIE_TERRENO[e.malattia]?.altre || [])])].filter(Boolean); }
function anniMalattia(e) { return MALATTIE_TERRENO[e.malattia]?.anni ?? 5; }
function malattieTerreno(aiuolaId, fam, dataISO) {
  const nuova = terraCambiata(aiuolaId, dataISO);
  return S.eventi.filter((e) => e.tipo === "malattia" && stessoTerreno(e.aiuolaId, aiuolaId) && e.data <= dataISO && !(nuova > e.data)
    && Number(dataISO.slice(0, 4)) < Number(e.data.slice(0, 4)) + anniMalattia(e)
    && (!fam || famiglieMalattia(e).includes(fam)));
}
function testoMalattia(e, fam) {
  const m = MALATTIE_TERRENO[e.malattia], anno = Number(e.data.slice(0, 4));
  const quale = m && e.malattia !== "nonso" ? m.nome.replace(/ \(.*/, "").toLowerCase() : "una malattia del terreno";
  const fams = fam ? [fam] : famiglieMalattia(e);
  return `🦠 Nel ${anno} qui c'è stata ${quale} (${FAMIGLIE[e.fam]?.toLowerCase() ?? "?"}): niente ${fams.map((f) => FAMIGLIE[f]?.toLowerCase()).join(", ")} in questa aiuola fino al ${anno + anniMalattia(e)}, e non portare la sua terra in altre aiuole.`;
}
function avvisiRotazione(aiuolaId, ortaggioId, dataISO, escludiId, celle) {
  const o = PER_ID[ortaggioId];
  if (!o || aiuola(aiuolaId)?.semenzaio) return [];
  const malati = malattieTerreno(aiuolaId, o.fam, dataISO).map((e) => testoMalattia(e, o.fam));
  if (aiuola(aiuolaId)?.fissa === ortaggioId) return malati;
  const data = daISO(dataISO);
  const nuova = terraCambiata(aiuolaId, dataISO);
  const avvisi = [...malati];
  for (const i of S.impianti) {
    if (i.id === escludiId || !stessoTerreno(i.aiuolaId, aiuolaId)) continue;
    if (nuova && i.data < nuova) continue; // c'era sulla terra di prima
    const altro = PER_ID[i.ortaggioId];
    if (!altro || altro.fam !== o.fam) continue;
    // Le caselle contano solo nella stessa aiuola (l'aiuola grande ha un'altra scacchiera).
    if (i.aiuolaId === aiuolaId && celle?.length && i.celle?.length && !celleSuAiuola(i).some((c) => celle.includes(c))) continue;
    const d = daISO(i.data);
    const anni = data.getFullYear() - d.getFullYear();
    if (anni >= 1 && anni < ANNI_ROTAZIONE) {
      avvisi.push(formaVasiCaselle(aiuola(aiuolaId))
        ? `Nel ${d.getFullYear()} in questi vasi c'era ${altro.nome.toLowerCase()} (${FAMIGLIE[o.fam].toLowerCase()}): rinnova la terra (almeno metà, con compost e concime) oppure scambia con vasi di un'altra famiglia.`
        : `Nel ${d.getFullYear()} qui c'era ${altro.nome.toLowerCase()} (${FAMIGLIE[o.fam].toLowerCase()}): meglio aspettare ${ANNI_ROTAZIONE} anni prima di rimettere la stessa famiglia.`);
    }
  }
  return [...new Set(avvisi)];
}

// -----------------------------------------------------------------------------
// Scacchiera dell'aiuola: righe a, b, c… dal fondo verso di te, colonne 1, 2, 3…
// da sinistra a destra. Una coltura occupa delle caselle (es. ["a1", "a2"]);
// senza caselle occupa tutta l'aiuola.
// -----------------------------------------------------------------------------
const MAX_RIGHE = 100, MAX_COLONNE = 100;
function grigliaAiuola(a) {
  return {
    righe: Math.min(MAX_RIGHE, Math.max(1, Math.round(Number(a?.righe) || 1))),
    colonne: Math.min(MAX_COLONNE, Math.max(1, Math.round(Number(a?.colonne) || 1))),
  };
}
function haGriglia(a) {
  const g = grigliaAiuola(a);
  return !a?.semenzaio && g.righe * g.colonne > 1;
}
// Righe a…z, poi aa, ab… az, ba… (come le colonne di un foglio di calcolo).
function nomeRiga(r) {
  let s = "";
  for (let n = r + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(97 + ((n - 1) % 26)) + s;
  return s;
}
function nomeCella(r, c) { return nomeRiga(r) + (c + 1); }
function cellaRC(nome) {
  const m = /^([a-z]+)(\d+)$/.exec(nome || "");
  if (!m) return { r: -1, c: -1 };
  let r = 0;
  for (const ch of m[1]) r = r * 26 + ch.charCodeAt(0) - 96;
  return { r: r - 1, c: Number(m[2]) - 1 };
}
// Scacchiera fitta: caselle piccole, si scorre col dito.
function grigliaFitta(g) { return g.colonne > 8 || g.righe > 12; }
// Misura di una casella, se l'aiuola ha le misure.
function misuraCasella(a) {
  if (!a?.larghezza || !a?.lunghezza) return "";
  const g = grigliaAiuola(a);
  const cm = (m) => `${Math.round(m * 100)}`;
  return `caselle di ${cm(a.larghezza / g.colonne)} × ${cm(a.lunghezza / g.righe)} cm`;
}
function intestazioneGriglia(g) {
  const fitta = grigliaFitta(g);
  const larg = fitta ? "2.6em" : "minmax(0, 1fr)";
  let h = `<div class="scacchiera${fitta ? " fitta" : ""}" style="grid-template-columns:${fitta ? "2.2em" : "1.4em"} repeat(${g.colonne}, ${larg})"><span class="intest angolo"></span>`;
  for (let c = 0; c < g.colonne; c++) h += `<span class="intest col">${c + 1}</span>`;
  return h;
}
// Caselle che non esistono (aiuola non rettangolare, es. vasi a piramide): a.celleMancanti.
function celleMancanti(a) { return new Set(a?.celleMancanti || []); }
function celleValide(a, celle) {
  const g = grigliaAiuola(a), via = celleMancanti(a);
  return haGriglia(a) ? (celle || []).filter((x) => { const q = cellaRC(x); return q.r >= 0 && q.r < g.righe && q.c >= 0 && q.c < g.colonne && !via.has(x); }) : [];
}
// Scacchiera di una coltura: quella che aveva quando l'aiuola ha cambiato
// scacchiera (i.griglia, con i.grigliaManca = caselle che allora non esistevano),
// altrimenti quella attuale. Così la storia resta com'era.
function grigliaDi(i, a = aiuola(i.aiuolaId)) { return i.griglia || grigliaAiuola(a); }
function stessaGriglia(g, h) { return g.righe === h.righe && g.colonne === h.colonne; }
// Caselle riportate da una scacchiera a un'altra, in proporzione (centro della casella nuova).
function riportaCelle(celle, go, g) {
  const src = new Set(celle), out = [];
  for (let r = 0; r < g.righe; r++) for (let c = 0; c < g.colonne; c++) {
    if (src.has(nomeCella(Math.floor((r + 0.5) * go.righe / g.righe), Math.floor((c + 0.5) * go.colonne / g.colonne)))) out.push(nomeCella(r, c));
  }
  if (!out.length) for (const x of celle) { // scacchiera nuova più grossa: almeno la casella che la contiene
    const q = cellaRC(x); out.push(nomeCella(Math.floor(q.r * g.righe / go.righe), Math.floor(q.c * g.colonne / go.colonne)));
  }
  return ordinaCelle([...new Set(out)]);
}
// Caselle di una coltura sulla scacchiera attuale dell'aiuola (per rotazione e piano).
function celleSuAiuola(i, a = aiuola(i.aiuolaId)) {
  if (!i.celle?.length || !haGriglia(a)) return [];
  const go = grigliaDi(i, a);
  return celleValide(a, stessaGriglia(go, grigliaAiuola(a)) ? i.celle : riportaCelle(i.celle, go, grigliaAiuola(a)));
}
// La scacchiera è della coltura (i.griglia, con i.grigliaManca = caselle che
// non esistono): quella dell'aiuola è solo la proposta per le colture nuove.
// Le colture che non ce l'hanno ancora prendono quella dell'aiuola.
function timbraScacchiere() {
  for (const i of S.impianti) {
    if (i.griglia || !i.celle?.length) continue;
    const a = aiuola(i.aiuolaId);
    if (!a || !haGriglia(a)) continue;
    i.griglia = grigliaAiuola(a);
    if (a.celleMancanti?.length) i.grigliaManca = [...a.celleMancanti];
  }
}
// Prima di cambiare la scacchiera di un'aiuola: le colture tengono la loro.
function cambiaScacchiera() { timbraScacchiere(); }
// Misure dell'aiuola in un anno: le misure cambiate tengono quelle di prima
// negli anni passati (a.misurePrima = [{ fino: "2026", larghezza, lunghezza }]).
function misureAnno(a, anno) {
  const m = (a.misurePrima || []).filter((x) => x.fino >= anno).sort((x, y) => x.fino.localeCompare(y.fino))[0];
  return m ? { larghezza: m.larghezza, lunghezza: m.lunghezza } : { larghezza: a.larghezza, lunghezza: a.lunghezza };
}
// Caselle di una coltura riportate sulla scacchiera g.
function celleSu(i, g, a = aiuola(i.aiuolaId)) {
  if (!i.celle?.length) return [];
  const gi = grigliaDi(i, a);
  return stessaGriglia(gi, g) ? i.celle : riportaCelle(i.celle, gi, g);
}
// Si può dare una scacchiera propria a una coltura (passata o in programma)?
function puoScacchiera(a) { return Boolean(a && !a.semenzaio && !a.vaso && !a.capanno && !partiDi(a).length); }
// Scacchiera piccola di sola lettura: celleIcone = { a1: "🍅", … }.
function htmlScacchieraComEra(g, manca, celleIcone) {
  let h = `<div class="scorri-scacchiera">${intestazioneGriglia(g).replace('class="scacchiera', 'class="scacchiera mini')}`;
  for (let r = 0; r < g.righe; r++) {
    h += `<span class="intest riga">${nomeRiga(r)}</span>`;
    for (let c = 0; c < g.colonne; c++) {
      const n = nomeCella(r, c), ic = celleIcone[n];
      h += manca.has(n) ? `<span class="cella mancante"></span>` : `<span class="cella${ic ? " piena" : ""}" title="${n}">${ic || ""}</span>`;
    }
  }
  return h + `</div></div>`;
}
// Com'era l'aiuola per un gruppo di colture (stessa scacchiera): una mini scacchiera per scacchiera.
function htmlComEra(a, imps) {
  const gruppi = new Map();
  for (const i of imps) {
    if (!i.celle?.length || (!haGriglia(a) && !i.griglia)) continue;
    const g = grigliaDi(i, a), k = `${g.righe}x${g.colonne}`;
    if (!gruppi.has(k)) gruppi.set(k, { g, manca: new Set(i.griglia ? i.grigliaManca || [] : a.celleMancanti || []), ic: {} });
    for (const c of i.celle) gruppi.get(k).ic[c] = (gruppi.get(k).ic[c] || "") + icona(PER_ID[i.ortaggioId]);
  }
  const ora = grigliaAiuola(a);
  return [...gruppi.values()].map(({ g, manca, ic }) => `<div class="com-era"><p class="tenue piccolo" style="margin:4px 0 0">Scacchiera ${g.righe} × ${g.colonne}${stessaGriglia(g, ora) ? "" : " (com'era allora)"}</p>${htmlScacchieraComEra(g, manca, ic)}</div>`).join("");
}
function moduloCelleMancanti(a) {
  const g = grigliaAiuola(a);
  const via = celleMancanti(a);
  const disegnaGriglia = () => {
    let h = `<div class="scorri-scacchiera">${intestazioneGriglia(g)}`;
    for (let r = 0; r < g.righe; r++) {
      h += `<span class="intest riga">${nomeRiga(r)}</span>`;
      for (let c = 0; c < g.colonne; c++) {
        const n = nomeCella(r, c);
        h += `<button type="button" class="cella${via.has(n) ? " mancante" : ""}" data-manca="${n}" title="${n}">${via.has(n) ? "✕" : n}</button>`;
      }
    }
    return h + `</div></div><p class="tenue piccolo">Caselle vere: <b>${g.righe * g.colonne - via.size}</b> su ${g.righe * g.colonne}.</p>`;
  };
  apriFinestra(`<h2>Caselle che non esistono</h2>
    <p class="tenue piccolo">Tocca le caselle della scacchiera che nell'aiuola non ci sono (per esempio vasi disposti a piramide): diventano ✕ e l'app non ci propone niente. Tocca di nuovo per rimetterle.</p>
    <div id="g_manca">${disegnaGriglia()}</div>
    <div class="riga-bottoni"><button type="button" id="manca-salva">Salva</button><button type="button" class="secondario" data-chiudi>Annulla</button></div>`, (f) => {
    f.querySelector("#g_manca").addEventListener("click", (e) => {
      const b = e.target.closest("[data-manca]");
      if (!b) return;
      const n = b.dataset.manca;
      if (via.has(n)) via.delete(n); else via.add(n);
      f.querySelector("#g_manca").innerHTML = disegnaGriglia();
    });
    f.querySelector("#manca-salva").addEventListener("click", () => {
      a.celleMancanti = ordinaCelle([...via]);
      if (via.size >= g.righe * g.colonne) a.celleMancanti = [];
      // Le colture in corso con la stessa scacchiera dell'aiuola: anche per loro quelle caselle non ci sono.
      for (const i of S.impianti) if (i.aiuolaId === a.id && i.celle?.length && !i.finito && stessaGriglia(grigliaDi(i, a), g)) {
        i.grigliaManca = [...a.celleMancanti]; i.celle = i.celle.filter((x) => !via.has(x));
      }
      salva_e_ridisegna();
      chiudiFinestra();
    });
  });
}
function ordinaCelle(celle) {
  return [...celle].sort((x, y) => { const p = cellaRC(x), q = cellaRC(y); return p.r - q.r || p.c - q.c; });
}
// Caselle in breve: i blocchi rettangolari diventano "a1–c20" (dall'angolo in alto a sinistra a quello in basso a destra).
function testoListaCelle(celle) {
  const perRiga = new Map();
  for (const n of ordinaCelle(celle)) {
    const q = cellaRC(n);
    if (!perRiga.has(q.r)) perRiga.set(q.r, []);
    perRiga.get(q.r).push(q.c);
  }
  const blocchi = [], aperti = new Map();
  for (const [r, cs] of perRiga) {
    for (let i = 0; i < cs.length;) {
      let j = i;
      while (j + 1 < cs.length && cs[j + 1] === cs[j] + 1) j++;
      const k = `${cs[i]}-${cs[j]}`, b = aperti.get(k);
      if (b && b.r1 === r - 1) b.r1 = r;
      else { const nuovo = { r0: r, r1: r, c0: cs[i], c1: cs[j] }; blocchi.push(nuovo); aperti.set(k, nuovo); }
      i = j + 1;
    }
  }
  const pezzi = blocchi.map((b) => (b.r0 === b.r1 && b.c0 === b.c1)
    ? nomeCella(b.r0, b.c0) : `${nomeCella(b.r0, b.c0)}–${nomeCella(b.r1, b.c1)}`);
  if (pezzi.length > 8) return `${pezzi.slice(0, 6).join(" ")} … (${celle.length} caselle)`;
  return pezzi.join(" ") + (celle.length > 1 && pezzi.length < celle.length ? ` (${celle.length} caselle)` : "");
}
function testoCelle(i) { return i.celle?.length ? testoListaCelle(i.celle) : ""; }
// Due colture sono vicine se una occupa tutta l'aiuola o se hanno caselle confinanti (anche in diagonale).
function confinanti(c1, c2) {
  if (!c1?.length || !c2?.length) return true;
  const altre = new Set(c2);
  return c1.some((x) => {
    const p = cellaRC(x);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (p.r + dr >= 0 && p.c + dc >= 0 && altre.has(nomeCella(p.r + dr, p.c + dc))) return true;
    }
    return false;
  });
}
// Chi occupa ogni casella dell'aiuola (colture in corso).
// g: scacchiera su cui riportarle (quella della coltura che stai scegliendo).
function occupazione(aiuolaId, escludiId, g) {
  const mappa = {}, a = aiuola(aiuolaId);
  for (const i of impiantiAttivi(aiuolaId)) {
    if (i.id === escludiId) continue;
    for (const c of g ? celleSu(i, g, a) : celleSuAiuola(i, a)) (mappa[c] ??= []).push(i);
  }
  return mappa;
}

// Scacchiera cliccabile nei moduli: scrive le caselle scelte nel campo nascosto "celle".
// Chi occupa le caselle il giorno dataISO: colture già messe (o in programma
// prima di quel giorno) che non saranno ancora finite (fineImpianto, in piano.js).
// g: scacchiera su cui riportarle (quella propria della coltura che stai scegliendo).
function occupazioneAl(aiuolaId, dataISO, escludiId, g) {
  if (!dataISO || dataISO <= aISO(oggi())) return occupazione(aiuolaId, escludiId, g);
  const a = aiuola(aiuolaId), d = daISO(dataISO), mappa = {};
  for (const i of impiantiAttivi(aiuolaId)) {
    if (i.id === escludiId || i.data > dataISO || fineImpianto(i) < d) continue;
    for (const c of g ? celleSu(i, g, a) : celleSuAiuola(i, a)) (mappa[c] ??= []).push(i);
  }
  return mappa;
}
function aggiornaSceltaCelle(form, aiuolaId, escludiId, gForza, mancaForza, passata) {
  const contenitore = form.querySelector("#w_celle");
  const a = aiuola(aiuolaId);
  if (gForza ? gForza.righe * gForza.colonne <= 1 : !haGriglia(a)) {
    contenitore.hidden = true;
    form.elements.celle.value = "";
    return "";
  }
  contenitore.hidden = false;
  // gForza: la scacchiera della coltura; passata = coltura finita (senza chi c'è adesso).
  const g = gForza || grigliaAiuola(a);
  const manca = gForza ? new Set(mancaForza || []) : celleMancanti(a);
  const dentro = (x) => { const q = cellaRC(x); return q.r >= 0 && q.r < g.righe && q.c >= 0 && q.c < g.colonne && !manca.has(x); };
  const scelte = new Set(form.elements.celle.value.split(",").filter(Boolean).filter(dentro));
  form.elements.celle.value = [...scelte].join(",");
  const dataISO = form.elements.data?.value || "";
  // Chi c'è (o ci sarà quel giorno), riportato sulla scacchiera della coltura.
  const occ = passata ? {} : occupazioneAl(aiuolaId, dataISO, escludiId, gForza);
  const adesso = passata ? {} : occupazione(aiuolaId, escludiId, gForza);
  const rett = form.dataset.rettangolo === "1", angolo = form.dataset.angolo || "";
  let h = `<div class="comandi-celle">
    <div class="campo-check"><input type="checkbox" id="m_rett" ${rett ? "checked" : ""}><label for="m_rett" style="margin:0">Rettangolo: tocca due angoli</label></div>
    <button type="button" class="piccolo" data-celle-nessuna>Nessuna casella</button></div>
    <p class="tenue piccolo" style="margin:2px 0">${scelte.size ? `Scelte: <b>${esc(testoListaCelle([...scelte]))}</b>` : "Nessuna casella scelta: la coltura occupa tutta l'aiuola."}${angolo ? ` · Primo angolo: <b>${angolo}</b>, ora tocca l'angolo opposto.` : ""}${misuraCasella({ ...a, ...misureAnno(a, (dataISO || aISO(oggi())).slice(0, 4)), ...g }) ? ` · ${misuraCasella({ ...a, ...misureAnno(a, (dataISO || aISO(oggi())).slice(0, 4)), ...g })}` : ""}</p>
    <div class="scorri-scacchiera">${intestazioneGriglia(g)}`;
  for (let r = 0; r < g.righe; r++) {
    h += `<span class="intest riga">${nomeRiga(r)}</span>`;
    for (let c = 0; c < g.colonne; c++) {
      const n = nomeCella(r, c);
      if (manca.has(n)) { h += `<span class="cella mancante" title="${n}: non esiste"></span>`; continue; }
      const chi = (occ[n] || []).map((i) => icona(PER_ID[i.ortaggioId])).join("");
      h += `<button type="button" class="cella${scelte.has(n) ? " scelta" : ""}${n === angolo ? " angolo" : ""}" data-cella="${n}" title="${n}">${scelte.has(n) ? "✓" : chi || n}</button>`;
    }
  }
  h += `</div></div>`;
  // Ridisegnando la scacchiera, resta dove l'avevi fatta scorrere.
  const vecchia = form.querySelector("#g_celle .scorri-scacchiera");
  const scorri = vecchia ? [vecchia.scrollLeft, vecchia.scrollTop] : null;
  form.querySelector("#g_celle").innerHTML = h;
  if (scorri) [form.querySelector("#g_celle .scorri-scacchiera").scrollLeft, form.querySelector("#g_celle .scorri-scacchiera").scrollTop] = scorri;
  if (!form.dataset.celleCollegate) {
    form.dataset.celleCollegate = "1";
    const scrivi = (insieme) => {
      form.elements.celle.value = ordinaCelle([...insieme]).join(",");
      form.dispatchEvent(new Event("input"));
    };
    form.querySelector("#g_celle").addEventListener("click", (e) => {
      // Il clic arriva prima del ridisegno del modulo: qui la scelta è già aggiornata.
      if (e.target.id === "m_rett") { form.dataset.rettangolo = e.target.checked ? "1" : ""; form.dataset.angolo = ""; return; }
      if (e.target.closest("[data-celle-nessuna]")) { form.dataset.angolo = ""; scrivi([]); return; }
      const b = e.target.closest("[data-cella]");
      if (!b) return;
      const attuali = new Set(form.elements.celle.value.split(",").filter(Boolean));
      const n = b.dataset.cella;
      if (form.dataset.rettangolo === "1") {
        if (!form.dataset.angolo) { form.dataset.angolo = n; form.dispatchEvent(new Event("input")); return; }
        const p = cellaRC(form.dataset.angolo), q = cellaRC(n);
        form.dataset.angolo = "";
        for (let r = Math.min(p.r, q.r); r <= Math.max(p.r, q.r); r++) {
          for (let c = Math.min(p.c, q.c); c <= Math.max(p.c, q.c); c++) attuali.add(nomeCella(r, c));
        }
      } else if (attuali.has(n)) attuali.delete(n); else attuali.add(n);
      scrivi(attuali);
    });
  }
  const sovrapposte = ordinaCelle([...scelte].filter((n) => occ[n]));
  const nomi = [...new Set(sovrapposte.flatMap((n) => occ[n].map((i) => PER_ID[i.ortaggioId]?.nome.toLowerCase() ?? "")))];
  // Caselle occupate adesso ma libere per quella data: la coltura di prima si chiude quando la raccogli.
  const prima = [...new Set([...scelte].filter((n) => !occ[n] && adesso[n]).flatMap((n) => adesso[n]))];
  const liberano = prima.length
    ? `<div class="bene piccolo">🔄 Adesso qui ${prima.length > 1 ? "ci sono" : "c'è"} ${prima.map((i) => `${esc(PER_ID[i.ortaggioId]?.nome.toLowerCase() ?? "")} (raccolta fino a circa ${fmtAnno(fineImpianto(i))})`).join(", ")}: per quella data il posto sarà libero. Va bene così: quando ${prima.length > 1 ? "le raccogli, segnale" : "la raccogli, segnala"} come finita.</div>`
    : "";
  return (sovrapposte.length
    ? `<div class="avviso">Caselle già occupate${dataISO > aISO(oggi()) ? " in quella data" : ""}: ${esc(testoListaCelle(sovrapposte))} (${nomi.map(esc).join(", ")}).</div>`
    : "") + liberano;
}
function campoCelle(valore) {
  return { id: "celle", etichetta: "Caselle dell'aiuola (tocca per scegliere; nessuna = tutta l'aiuola)", tipo: "celle", valore: (valore || []).join(","), nascosto: true };
}

function avvisiVicini(aiuolaId, ortaggioId, escludiId, celle) {
  if (aiuola(aiuolaId)?.semenzaio) return { buoni: [], cattivi: [] };
  const vicini = impiantiAttivi(aiuolaId).filter((i) => i.id !== escludiId && confinanti(celle, celleSuAiuola(i))).map((i) => i.ortaggioId);
  const amici = amiciDi(ortaggioId), nemici = nemiciDi(ortaggioId);
  return {
    buoni: [...new Set(vicini.filter((v) => amici.includes(v)))],
    cattivi: [...new Set(vicini.filter((v) => nemici.includes(v)))],
  };
}

function htmlAvvisi(aiuolaId, ortaggioId, dataISO, escludiId, celle, protezione) {
  if (!aiuolaId || !ortaggioId || !dataISO) return "";
  const o = PER_ID[ortaggioId];
  let h = "";
  if (aiuola(aiuolaId)?.fissa === ortaggioId) h += `<div class="bene">${consiglioFissa(aiuola(aiuolaId))}</div>`;
  for (const t of avvisiRotazione(aiuolaId, ortaggioId, dataISO, escludiId, celle)) h += `<div class="${t.startsWith("🦠") ? "pericolo" : "avviso"}">${t.startsWith("🦠") ? "" : "🔄 "}${esc(t)}</div>`;
  const v = avvisiVicini(aiuolaId, ortaggioId, escludiId, celle);
  if (v.cattivi.length) h += `<div class="pericolo">⚠️ ${esc(o.nome)} non sta bene vicino a: ${v.cattivi.map((x) => esc(PER_ID[x].nome.toLowerCase())).join(", ")}.</div>`;
  if (v.buoni.length) h += `<div class="bene">🤝 Buoni vicini: ${v.buoni.map((x) => esc(PER_ID[x].nome.toLowerCase())).join(", ")}.</div>`;
  // Finestra di stagione
  const d = daISO(dataISO);
  const modo = aiuola(aiuolaId)?.semenzaio ? "sem" : null;
  const fasiOk = modo ? ["sem"] : ["dir", "tra"];
  // In serra si può partire qualche settimana prima e finire dopo.
  const margine = anticipo(aiuolaId, protezione, d.getFullYear());
  const dentro = fasiOk.some((f) => finestreTra(o, f, piuGiorni(d, -margine), piuGiorni(d, margine)).length);
  if (!dentro && fasiOk.some((f) => (o[f] || []).length)) {
    h += `<div class="avviso">📅 Questa data è fuori dal periodo consigliato per ${esc(o.nome.toLowerCase())}${margine ? `, anche contando ${Math.round(margine / 7)} settimane di vantaggio${testoVantaggio(aiuolaId, protezione, d.getFullYear()).replace(" (contando il vantaggio", "").replace(")", "")}` : ""} (guarda il calendario).</div>`;
  }
  return h;
}

// -----------------------------------------------------------------------------
// Finestra di dialogo con modulo
// -----------------------------------------------------------------------------
function apriFinestra(html, dopo) {
  const f = el("finestra");
  // La finestra parte con il fuoco sul contenitore e non sul primo campo:
  // su iPad un menu a tendina col fuoco si apre da solo.
  f.innerHTML = `<div class="contenuto" tabindex="-1" autofocus>${html}</div>`;
  f.querySelectorAll("[data-chiudi]").forEach((b) => b.addEventListener("click", () => f.close()));
  if (dopo) dopo(f);
  if (!f.open) f.showModal();
  return f;
}
function chiudiFinestra() {
  const f = el("finestra");
  if (f.open) f.close();
}

// campi: [{id, etichetta, tipo, valore, opzioni:[[valore, testo]], richiesto, passo}]
// elimina: se presente compare il bottone "Elimina"; restituisce false per annullare.
// Ogni campo sta in <div id="w_<id>">: con nascosto: true parte nascosto e i
// campi nascosti non sono obbligatori.
function modulo({ titolo, campi, testoSalva = "Salva", salva, aggiorna, elimina, extra = "" }) {
  const htmlCampi = campi.map((c) => `<div class="campo" id="w_${c.id}" ${c.nascosto ? "hidden" : ""}>${htmlCampo(c)}</div>`).join("");
  function htmlCampo(c) {
    const req = c.richiesto ? "required" : "";
    const val = c.valore ?? "";
    if (c.tipo === "select") {
      // mappa: true = sotto il menu c'è la pianta dell'orto, si sceglie toccando l'aiuola.
      const mappa = c.mappa ? htmlPianta(null, true) : "";
      return `<label for="m_${c.id}">${esc(c.etichetta)}</label><select id="m_${c.id}" name="${c.id}" ${req}>
        ${c.opzioni.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(val) ? "selected" : ""}>${esc(t)}</option>`).join("")}
      </select>${mappa ? `<details class="mappa-scelta" open><summary>🗺️ Oppure tocca l'aiuola sulla mappa</summary>${mappa}</details>` : ""}`;
    }
    if (c.tipo === "textarea") {
      return `<label for="m_${c.id}">${esc(c.etichetta)}</label><textarea id="m_${c.id}" name="${c.id}" ${req}>${esc(val)}</textarea>`;
    }
    if (c.tipo === "celle") {
      return `<label>${esc(c.etichetta)}</label><input type="hidden" name="${c.id}" value="${esc(val)}"><div id="g_${c.id}"></div>`;
    }
    if (c.tipo === "check") {
      return `<div class="campo-check"><input type="checkbox" id="m_${c.id}" name="${c.id}" ${val ? "checked" : ""}><label for="m_${c.id}" style="margin:0">${esc(c.etichetta)}</label></div>`;
    }
    const passo = c.passo ? `step="${c.passo}"` : "";
    const lista = c.lista ? `list="l_${c.id}"` : "";
    const datalist = c.lista ? `<datalist id="l_${c.id}">${c.lista.map((x) => `<option value="${esc(x)}">`).join("")}</datalist>` : "";
    return `<label for="m_${c.id}">${esc(c.etichetta)}</label><input id="m_${c.id}" name="${c.id}" type="${c.tipo || "text"}" value="${esc(val)}" ${passo} ${lista} ${req}>${datalist}`;
  }

  apriFinestra(`
    <h2>${esc(titolo)}</h2>
    <form id="modulo" novalidate>
      ${htmlCampi}
      <div id="m_avvisi"></div>
      ${extra}
      <div class="riga-bottoni">
        <button type="submit">${esc(testoSalva)}</button>
        <button type="button" class="secondario" data-chiudi>Annulla</button>
        ${elimina ? `<button type="button" class="elimina" id="m_elimina">🗑️ Elimina</button>` : ""}
      </div>
    </form>`, (f) => {
    const form = f.querySelector("#modulo");
    f.querySelector("#m_elimina")?.addEventListener("click", () => {
      if (elimina() !== false) {
        salva_e_ridisegna();
        chiudiFinestra();
      }
    });
    const valori = () => {
      const v = {};
      for (const c of campi) {
        const e = form.elements[c.id];
        v[c.id] = c.tipo === "check" ? e.checked : e.value.trim();
      }
      return v;
    };
    const ricalcola = () => { if (aggiorna) f.querySelector("#m_avvisi").innerHTML = aggiorna(valori(), form) || ""; };
    // Menu con la mappa: toccare un'aiuola la sceglie; quella scelta è evidenziata.
    for (const c of campi.filter((c) => c.mappa)) {
      const sel = form.elements[c.id], w = f.querySelector(`#w_${c.id}`);
      const evidenzia = () => w.querySelectorAll("[data-scegli]").forEach((a) => a.classList.toggle("scelta", a.dataset.scegli === sel.value));
      w.querySelectorAll("[data-scegli]").forEach((a) => a.addEventListener("click", (e) => {
        e.preventDefault();
        if (![...sel.options].some((o) => o.value === a.dataset.scegli)) return;
        sel.value = a.dataset.scegli;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }));
      sel.addEventListener("change", evidenzia);
      evidenzia();
    }
    form.addEventListener("input", ricalcola);
    form.addEventListener("change", ricalcola);
    ricalcola();
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = valori();
      const manca = campi.find((c) => c.richiesto && !v[c.id] && !f.querySelector(`#w_${c.id}`).hidden);
      if (manca) {
        f.querySelector("#m_avvisi").innerHTML = `<div class="pericolo">Manca: ${esc(manca.etichetta)}</div>`;
        return;
      }
      if (salva(v) !== false) {
        salva_e_ridisegna();
        chiudiFinestra();
      }
    });
  });
}

function salva_e_ridisegna() {
  salva();
  disegna();
}

// -----------------------------------------------------------------------------
// Moduli: aiuole, colture, eventi
// -----------------------------------------------------------------------------
function opzioniOrtaggi() {
  return [["", "— scegli —"], ...elencoOrtaggi().map((o) => [o.id, `${preferito(o.id) ? "★ " : ""}${o.emoji} ${o.nome}`])];
}
function opzioniAiuole(conSemenzaio = true) {
  return aiuoleOrdinate().filter((a) => a.semenzaio ? conSemenzaio : coltivabile(a)).map((a) => [a.id, nomeAiuola(a)]);
}

function prossimoNumero(zona) {
  return Math.max(0, ...S.aiuole.filter((x) => !x.semenzaio && !x.dentro && (x.zona || ZONA_PREDEFINITA) === zona).map((x) => Number(x.numero) || 0)) + 1;
}

// Per mettere un'aiuola al numero n di una zona: le altre scalano di uno.
// Aiuola nuova (o che arriva da un'altra zona): quelle da n in poi fanno +1.
// Aiuola che si sposta nella stessa zona: solo quelle tra il vecchio e il nuovo
// posto, così non restano buchi. Lo storico è legato all'id, non al numero.
function spostamentiAiuole(zona, n, a) {
  const vecchio = a && (a.zona || ZONA_PREDEFINITA) === zona ? Number(a.numero) : null;
  const out = [];
  for (const x of S.aiuole) {
    if (x === a || x.semenzaio || x.dentro || (x.zona || ZONA_PREDEFINITA) !== zona) continue;
    const k = Number(x.numero);
    if (vecchio == null || Number.isNaN(vecchio)) { if (k >= n) out.push([x, k + 1]); }
    else if (n < vecchio && k >= n && k < vecchio) out.push([x, k + 1]);
    else if (n > vecchio && k > vecchio && k <= n) out.push([x, k - 1]);
  }
  return out.sort((p, q) => Number(p[0].numero) - Number(q[0].numero));
}
function testoSpostamenti(lista) {
  const voci = lista.map(([x, nuovo]) => `${x.numero}${x.nome ? ` (${x.nome})` : ""} → ${nuovo}`);
  return voci.length > 6 ? `${voci.slice(0, 5).join(", ")} … (${voci.length} aiuole)` : voci.join(", ");
}

function moduloAiuola(a) {
  if (a?.semenzaio) {
    modulo({
      titolo: "Modifica semenzaio",
      campi: [{ id: "note", etichetta: "Note (dove tieni le semine: casa, serra, davanzale…)", tipo: "textarea", valore: a.note }],
      salva: (v) => { a.note = v.note; },
    });
    return;
  }
  const zonaIniziale = a?.zona || zonaScelta() || zone()[0] || ZONA_PREDEFINITA;
  modulo({
    titolo: a ? (a.capanno ? "Modifica capanno" : a.vaso ? "Modifica vaso" : "Modifica aiuola") : "Nuova aiuola",
    campi: [
      { id: "cosa", etichetta: "Che cos'è", tipo: "select", opzioni: [["", "🟫 Un'aiuola da coltivare"], ["tondo", "🏺 Un vaso tondo"], ["quadrato", "🏺 Un vaso quadrato"], ["rettangolare", "🏺 Un vaso rettangolare (o una cassetta)"],
        ["capanno", "🧰 Un capanno o deposito degli attrezzi (si disegna, non si coltiva)"]], valore: a?.capanno ? "capanno" : a?.vaso || "" },
      { id: "zona", etichetta: "Zona (es. Orto, Serra)", valore: zonaIniziale, lista: [...new Set([...zone(), "Orto", "Serra"])], richiesto: true },
      { id: "numero", etichetta: "Numero (da sinistra a destra: 1, 2, 3…; anche 0 o negativi)", tipo: "number", passo: "1", valore: a?.numero ?? prossimoNumero(zonaIniziale), richiesto: true },
      { id: "faiPosto", etichetta: "Fai posto: le altre aiuole cambiano numero (la loro storia resta)", tipo: "check", valore: true, nascosto: true },
      { id: "nome", etichetta: "Nome (facoltativo, es. Lungo il muro)", valore: a?.nome },
      { id: "larghezza", etichetta: "Larghezza in metri (da sinistra a destra)", tipo: "number", passo: "0.05", valore: a?.larghezza },
      { id: "lunghezza", etichetta: "Lunghezza in metri (dal fondo verso di te)", tipo: "number", passo: "0.05", valore: a?.lunghezza },
      { id: "misureDal", etichetta: "Le misure nuove valgono", tipo: "select", nascosto: true, valore: String(oggi().getFullYear() + 1),
        opzioni: [[String(oggi().getFullYear() + 1), `dal ${oggi().getFullYear() + 1} (negli anni prima l'aiuola resta com'era)`],
          [String(oggi().getFullYear()), `da quest'anno, ${oggi().getFullYear()} (prima restava com'era)`], ["", "da sempre: correggo un errore"]] },
      { id: "fila", etichetta: "In quale fila sta", tipo: "select", opzioni: OPZIONI_FILA, valore: String(filaAiuola(a || {})) },
      { id: "inizio", etichetta: "Distanza dal bordo sinistro dell'orto, in metri (facoltativo)", tipo: "number", passo: "0.05", valore: a?.inizio },
      { id: "copertura", etichetta: "All'aperto o in serra", tipo: "select", opzioni: Object.entries(COPERTURE), valore: a?.copertura ?? "" },
      { id: "giroSerra", etichetta: "🔁 Serra spostabile: questa aiuola è uno dei posti dove sposti le serre da un anno all'altro (anche se adesso è all'aperto)", tipo: "check", valore: !!a?.giroSerra },
      { id: "porta", etichetta: "🚪 Porta (serra o capanno): da che lato si entra", tipo: "select", opzioni: Object.entries(PORTE), valore: a?.porta ?? "" },
      { id: "pacciamatura", etichetta: "Pacciamatura proposta per le colture nuove (ogni coltura poi può avere la sua)", tipo: "select", opzioni: Object.entries(PACCIAMATURE), valore: a?.pacciamatura ?? "" },
      { id: "fissa", etichetta: "Sempre lo stesso ortaggio, ogni anno (non si ruota: es. zucca che sale sul tetto)", tipo: "select",
        opzioni: [["", "— no, si ruota —"], ...elencoOrtaggi().map((o) => [o.id, `${o.emoji} ${o.nome}`])], valore: a?.fissa ?? "" },
      { id: "righe", etichetta: "Scacchiera proposta per le colture nuove: righe a, b, c… (dal fondo verso di te; ogni coltura poi può avere la sua)", tipo: "number", passo: "1", valore: grigliaAiuola(a).righe },
      { id: "colonne", etichetta: "… e colonne 1, 2, 3… (da sinistra a destra)", tipo: "number", passo: "1", valore: grigliaAiuola(a).colonne },
      { id: "caselleVasi", etichetta: "🏺 Le caselle sono vasi? (sulla mappa ogni casella diventa un vaso e ogni fila è centrata, come i vasi a piramide)", tipo: "select",
        opzioni: [["", "No, è terra"], ["tondo", "Sì, vasi tondi"], ["quadrato", "Sì, vasi quadrati"], ["rettangolare", "Sì, vasi rettangolari"]], valore: formaVasiCaselle(a) },
      { id: "vasoL", etichetta: "Misure di ogni vaso: larghezza in metri (da sinistra a destra; facoltativa)", tipo: "number", passo: "0.01", valore: a?.vasoL },
      { id: "vasoP", etichetta: "Misure di ogni vaso: profondità in metri (dal fondo verso di te; facoltativa)", tipo: "number", passo: "0.01", valore: a?.vasoP },
      { id: "note", etichetta: "Note (esposizione, terreno…)", tipo: "textarea", valore: a?.note },
    ],
    extra: `<p class="tenue piccolo">Con le misure l'app disegna l'orto visto dall'alto, con le aiuole affiancate in ordine di numero.</p>`,
    aggiorna: (v, form) => {
      if (!a && v.zona && form.dataset.zona !== v.zona) {
        form.dataset.zona = v.zona;
        form.elements.numero.value = prossimoNumero(v.zona);
      }
      // Capanno: può essere una serra (con la porta) ma niente giro delle serre,
      // pacciamatura, ortaggio fisso, scacchiera. Vaso: niente giro delle serre,
      // pacciamatura, scacchiera; il vaso tondo ha solo il diametro.
      const capanno = v.cosa === "capanno", vaso = Boolean(VASI[v.cosa]);
      for (const id of ["giroSerra", "pacciamatura", "righe", "colonne", "caselleVasi"]) {
        const w = form.querySelector(`#w_${id}`);
        if (w) w.hidden = capanno || vaso;
      }
      // Misure dei vasi della scacchiera: solo se le caselle sono vasi (il tondo e il quadrato hanno una misura sola).
      const cv = !capanno && !vaso && v.caselleVasi;
      form.querySelector("#w_vasoL").hidden = !cv;
      form.querySelector("#w_vasoP").hidden = !cv || v.caselleVasi !== "rettangolare";
      form.querySelector("label[for=m_vasoL]").textContent = v.caselleVasi === "tondo" ? "Diametro di ogni vaso in metri (facoltativo)"
        : v.caselleVasi === "quadrato" ? "Lato di ogni vaso in metri (facoltativo)" : "Misure di ogni vaso: larghezza in metri (da sinistra a destra; facoltativa)";
      form.querySelector("#w_fissa").hidden = capanno;
      campiMisureVaso(form, v.cosa, false);
      // Misure cambiate: da quando valgono (gli anni prima si disegnano con quelle vecchie).
      form.querySelector("#w_misureDal").hidden = !(a?.larghezza && a?.lunghezza && !capanno
        && (numeroMisura(v.larghezza) !== a.larghezza || numeroMisura(v.lunghezza) !== a.lunghezza));
      if (partiDi(a).length) for (const id of ["cosa", "righe", "colonne", "caselleVasi", "vasoL", "vasoP", "fissa", "pacciamatura"]) form.querySelector(`#w_${id}`).hidden = true;
      const wp = form.querySelector("#w_porta");
      if (wp) wp.hidden = !(capanno || v.copertura === "serra" || v.giroSerra);
      const doppia = S.aiuole.find((x) => x !== a && !x.semenzaio && !x.dentro && (x.zona || ZONA_PREDEFINITA) === v.zona && String(x.numero) === v.numero);
      form.querySelector("#w_faiPosto").hidden = !doppia;
      if (!doppia) return "";
      if (v.faiPosto) return `<div class="bene">Faccio posto in «${esc(v.zona)}»: ${esc(testoSpostamenti(spostamentiAiuole(v.zona, Number(v.numero), a)))}. Colture e diario restano legati alle loro aiuole.</div>`;
      return `<div class="avviso">C'è già l'aiuola ${esc(v.numero)} in «${esc(v.zona)}»: spunta «Fai posto» oppure cambia numero.</div>`;
    },
    salva: (v) => {
      const dati = {
        zona: v.zona, numero: Number(v.numero), nome: v.nome, note: v.note,
        larghezza: numeroMisura(v.larghezza), lunghezza: numeroMisura(v.lunghezza),
        copertura: v.copertura, giroSerra: !!v.giroSerra, porta: v.porta, pacciamatura: v.pacciamatura, fissa: v.fissa,
        capanno: v.cosa === "capanno", vaso: VASI[v.cosa] ? v.cosa : "", caselleVasi: v.cosa ? "" : v.caselleVasi,
        vasoL: v.cosa || !v.caselleVasi ? null : numeroMisura(v.vasoL), vasoP: v.cosa || v.caselleVasi !== "rettangolare" ? null : numeroMisura(v.vasoP),
        fila: Number(v.fila) || 0, inizio: numeroMisura(v.inizio),
        ...grigliaAiuola({ righe: v.righe, colonne: v.colonne }),
      };
      if (dati.capanno) Object.assign(dati, { giroSerra: false, pacciamatura: "", fissa: "", righe: 1, colonne: 1 });
      if (dati.vaso) Object.assign(dati, { giroSerra: false, pacciamatura: "", righe: 1, colonne: 1 });
      if (dati.vaso === "tondo" || dati.vaso === "quadrato") dati.lunghezza = dati.larghezza;
      const doppia = S.aiuole.some((x) => x !== a && !x.semenzaio && !x.dentro && (x.zona || ZONA_PREDEFINITA) === v.zona && String(x.numero) === v.numero);
      if (doppia && v.faiPosto) for (const [x, nuovo] of spostamentiAiuole(v.zona, dati.numero, a)) x.numero = nuovo;
      if (a) {
        cambiaScacchiera(a, dati);
        // Misure cambiate da un anno in poi: quelle vecchie restano per gli anni prima.
        if (v.misureDal && a.larghezza && a.lunghezza && (dati.larghezza !== a.larghezza || dati.lunghezza !== a.lunghezza)) {
          const fino = String(Number(v.misureDal) - 1);
          a.misurePrima = [...(a.misurePrima || []).filter((m) => m.fino < fino), { fino, larghezza: a.larghezza, lunghezza: a.lunghezza }];
        }
        Object.assign(a, dati);
        delete a.misure;
        // Cambiata a mano la serra di quest'anno: vale anche per la posizione decisa dal piano.
        const quest = String(oggi().getFullYear());
        if (a.serraAnni?.[quest] != null) a.serraAnni[quest] = v.copertura === "serra";
        // Caselle che non esistono più dopo aver ridotto la scacchiera.
        for (const i of S.impianti) if (i.aiuolaId === a.id && i.celle && !i.griglia) i.celle = celleValide(a, i.celle);
      }
      else S.aiuole.push({ id: nuovoId(), ...dati });
    },
  });
}

// Divide un'aiuola in parti, ognuna con la sua scacchiera (es. aglio a 21 per
// fila e cipolle a 14). Le colture in corso vanno nella parte scelta; le loro
// caselle si riportano sulla scacchiera della parte (una sola coltura = tutte le caselle).
const LETTERE_PARTI = "abcdefghij";
const MAX_PARTI = 4;
function moduloDividi(a) {
  const attivi = impiantiAttivi(a.id);
  const gP = grigliaAiuola(a);
  // Proposta per ogni coltura: la parte dove sta il centro delle sue caselle (2 parti uguali).
  const proposta = (i) => {
    const cc = celleValide(a, i.celle || []).map((n) => cellaRC(n).c);
    return cc.length && cc.reduce((t, c) => t + c + 0.5, 0) / cc.length / gP.colonne >= 0.5 ? "b" : "a";
  };
  const campi = [
    { id: "divisa", etichetta: "Come sono le parti", tipo: "select", opzioni: [["lato", "Affiancate, da sinistra a destra"], ["fondo", "Una dietro l'altra, dal fondo verso di te"]], valore: "lato" },
    { id: "quante", etichetta: "Quante parti", tipo: "select", opzioni: [["2", "2"], ["3", "3"], ["4", "4"]], valore: "2" },
  ];
  for (let k = 0; k < MAX_PARTI; k++) {
    const L = LETTERE_PARTI[k];
    campi.push(
      { id: `nome${k}`, etichetta: `Parte ${L}: nome (facoltativo, es. Aglio)`, valore: "" },
      { id: `misura${k}`, etichetta: `Parte ${L}: larghezza in metri`, tipo: "number", passo: "0.05", valore: "" },
      { id: `righe${k}`, etichetta: `Parte ${L}: scacchiera, righe a, b, c… (dal fondo verso di te)`, tipo: "number", passo: "1", valore: 1 },
      { id: `colonne${k}`, etichetta: `Parte ${L}: scacchiera, colonne 1, 2, 3… (da sinistra a destra)`, tipo: "number", passo: "1", valore: 1 },
    );
  }
  for (const i of attivi) campi.push({ id: `imp_${i.id}`, etichetta: `In quale parte va ${nomeOrtaggioTesto(i.ortaggioId)}${i.celle?.length ? ` (adesso in ${testoCelle(i)})` : ""}`,
    tipo: "select", opzioni: [...LETTERE_PARTI.slice(0, MAX_PARTI)].map((L) => [L, `Parte ${L}`]), valore: proposta(i) });
  modulo({
    titolo: `Dividi ${nomeAiuola(a)} in parti`,
    campi,
    testoSalva: "✂️ Dividi",
    extra: `<p class="tenue piccolo">Ogni parte diventa come un'aiuola: ha la sua scacchiera, le sue colture e la sua storia. Sulla mappa resta una sola aiuola${a.copertura === "serra" ? ", con una sola serra e una sola porta" : ""}. Quello che hai coltivato qui finora conta per la rotazione di tutte le parti.</p>`,
    aggiorna: (v, form) => {
      const n = Number(v.quante), fondo = v.divisa === "fondo";
      for (let k = 0; k < MAX_PARTI; k++) {
        for (const c of ["nome", "misura", "righe", "colonne"]) form.querySelector(`#w_${c}${k}`).hidden = k >= n;
        form.querySelector(`label[for=m_misura${k}]`).textContent = `Parte ${LETTERE_PARTI[k]}: ${fondo ? "profondità in metri (dal fondo verso di te)" : "larghezza in metri (da sinistra a destra)"}`;
      }
      const dim = Number(fondo ? a.lunghezza : a.larghezza) || 0;
      const somma = [...Array(n).keys()].reduce((t, k) => t + (Number(String(v[`misura${k}`]).replace(",", ".")) || 0), 0);
      const fuori = attivi.filter((i) => LETTERE_PARTI.indexOf(v[`imp_${i.id}`]) >= n);
      return (dim && somma ? `<div class="${Math.abs(somma - dim) > 0.05 ? "avviso" : "bene"} piccolo">Parti: ${fmtM(somma)} m su ${fmtM(dim)} m ${fondo ? "di profondità" : "di larghezza"} dell'aiuola${Math.abs(somma - dim) > 0.05 ? ": sulla mappa le parti si allargano o si stringono per riempirla" : ""}.</div>` : "")
        + (fuori.length ? `<div class="avviso">Ci sono solo ${n} parti: scegli una parte che esiste per ${fuori.map((i) => esc(nomeOrtaggioTesto(i.ortaggioId))).join(", ")}.</div>` : "");
    },
    salva: (v) => {
      const n = Number(v.quante), fondo = v.divisa === "fondo";
      if (attivi.some((i) => LETTERE_PARTI.indexOf(v[`imp_${i.id}`]) >= n)) return false;
      const parti = [...Array(n).keys()].map((k) => ({
        id: nuovoId() + k, dentro: a.id, parte: LETTERE_PARTI[k], nome: v[`nome${k}`], note: "", pacciamatura: a.pacciamatura || "",
        larghezza: fondo ? a.larghezza : numeroMisura(v[`misura${k}`]), lunghezza: fondo ? numeroMisura(v[`misura${k}`]) : a.lunghezza,
        ...grigliaAiuola({ righe: v[`righe${k}`], colonne: v[`colonne${k}`] }),
      }));
      // Dove sta ogni parte, da 0 a 1 lungo la divisione (uguali se mancano le misure).
      const m = parti.map((b) => Number(fondo ? b.lunghezza : b.larghezza) || 0);
      const tot = m.reduce((t, x) => t + x, 0), misurate = m.every((x) => x > 0);
      let pos = 0;
      const tratti = m.map((x) => { const q = misurate ? x / tot : 1 / n; const t = [pos, pos + q]; pos += q; return t; });
      const quante = {};
      for (const i of attivi) quante[v[`imp_${i.id}`]] = (quante[v[`imp_${i.id}`]] || 0) + 1;
      for (const i of attivi) {
        const k = LETTERE_PARTI.indexOf(v[`imp_${i.id}`]), b = parti[k], [s0, s1] = tratti[k], gB = grigliaAiuola(b);
        const celle = [];
        for (const nome of celleSuAiuola(i, a)) {
          const { r, c } = cellaRC(nome);
          const fx = (c + 0.5) / gP.colonne, fy = (r + 0.5) / gP.righe, f = fondo ? fy : fx;
          if (f < s0 || f >= s1) continue;
          const rel = (f - s0) / (s1 - s0);
          celle.push(nomeCella(Math.floor((fondo ? rel : fy) * gB.righe), Math.floor((fondo ? fx : rel) * gB.colonne)));
        }
        i.aiuolaId = b.id;
        // Da sola nella parte: tutte le caselle; con altre: le caselle riportate.
        i.celle = !haGriglia(b) ? [] : quante[b.parte] > 1 && celle.length ? ordinaCelle([...new Set(celle)]) : tutteLeCelle(b);
        delete i.griglia; delete i.grigliaManca; // prende quella della parte (timbraScacchiere)
      }
      a.divisa = v.divisa;
      S.aiuole.push(...parti);
    },
  });
}
function moduloParte(b, p) {
  const fondo = p.divisa === "fondo";
  modulo({
    titolo: b ? `Modifica ${nomeAiuola(b)}` : `Nuova parte di ${nomeAiuola(p)}`,
    campi: [
      { id: "nome", etichetta: "Nome (facoltativo, es. Aglio)", valore: b?.nome },
      { id: "misura", etichetta: fondo ? "Profondità in metri (dal fondo verso di te)" : "Larghezza in metri (da sinistra a destra)", tipo: "number", passo: "0.05", valore: b ? (fondo ? b.lunghezza : b.larghezza) : "" },
      { id: "righe", etichetta: "Scacchiera: righe a, b, c… (dal fondo verso di te)", tipo: "number", passo: "1", valore: grigliaAiuola(b).righe },
      { id: "colonne", etichetta: "Scacchiera: colonne 1, 2, 3… (da sinistra a destra)", tipo: "number", passo: "1", valore: grigliaAiuola(b).colonne },
      { id: "pacciamatura", etichetta: "Pacciamatura", tipo: "select", opzioni: Object.entries(PACCIAMATURE), valore: b?.pacciamatura ?? p.pacciamatura ?? "" },
      { id: "fissa", etichetta: "Sempre lo stesso ortaggio, ogni anno (non si ruota)", tipo: "select",
        opzioni: [["", "— no, si ruota —"], ...elencoOrtaggi().map((o) => [o.id, `${o.emoji} ${o.nome}`])], valore: b?.fissa ?? "" },
      { id: "note", etichetta: "Note", tipo: "textarea", valore: b?.note },
    ],
    extra: `<p class="tenue piccolo">Zona, numero, fila, serra e porta sono quelli di ${esc(nomeAiuola(p))}: si cambiano lì.</p>`,
    salva: (v) => {
      const dati = { nome: v.nome, note: v.note, pacciamatura: v.pacciamatura, fissa: v.fissa, ...grigliaAiuola({ righe: v.righe, colonne: v.colonne }) };
      dati[fondo ? "lunghezza" : "larghezza"] = numeroMisura(v.misura);
      if (b) {
        cambiaScacchiera(b, dati);
        Object.assign(b, dati);
        for (const i of S.impianti) if (i.aiuolaId === b.id && i.celle && !i.griglia) i.celle = celleValide(b, i.celle);
      } else {
        const usate = partiDi(p).map((x) => x.parte);
        S.aiuole.push({ id: nuovoId(), dentro: p.id, parte: [...LETTERE_PARTI].find((l) => !usate.includes(l)) || "z", ...dati });
      }
    },
  });
}

// Crea in un colpo solo più aiuole uguali, numerate di seguito.
function moduloPiuAiuole() {
  const zonaIniziale = zonaScelta() || zone()[0] || ZONA_PREDEFINITA;
  modulo({
    titolo: "Più aiuole o vasi insieme",
    campi: [
      { id: "cosa", etichetta: "Che cosa", tipo: "select", opzioni: [["", "🟫 Aiuole"], ["tondo", "🏺 Vasi tondi"], ["quadrato", "🏺 Vasi quadrati"], ["rettangolare", "🏺 Vasi rettangolari (o cassette)"]], valore: "" },
      { id: "zona", etichetta: "Zona (es. Orto principale, Serre)", valore: zonaIniziale, lista: [...new Set([...zone(), "Orto", "Serra"])], richiesto: true },
      { id: "quante", etichetta: "Quante (aiuole o vasi)", tipo: "number", passo: "1", valore: 4, richiesto: true },
      { id: "da", etichetta: "Numero della prima (le altre di seguito)", tipo: "number", passo: "1", valore: prossimoNumero(zonaIniziale), richiesto: true },
      { id: "larghezza", etichetta: "Larghezza di ognuna in metri (da sinistra a destra)", tipo: "number", passo: "0.05" },
      { id: "lunghezza", etichetta: "Lunghezza di ognuna in metri (dal fondo verso di te)", tipo: "number", passo: "0.05" },
      { id: "corridoio", etichetta: "Vialetto tra un'aiuola e l'altra, in cm", tipo: "number", passo: "1", valore: Math.round(corridoioZona(zonaIniziale) * 100) },
      { id: "copertura", etichetta: "All'aperto o in serra", tipo: "select", opzioni: Object.entries(COPERTURE), valore: "" },
      { id: "giroSerra", etichetta: "🔁 Serre spostabili: sono i posti dove sposti le serre da un anno all'altro", tipo: "check", valore: false },
      { id: "pacciamatura", etichetta: "Pacciamatura", tipo: "select", opzioni: Object.entries(PACCIAMATURE), valore: "" },
      { id: "righe", etichetta: "Scacchiera di ognuna: righe a, b, c…", tipo: "number", passo: "1", valore: 1 },
      { id: "colonne", etichetta: "Scacchiera di ognuna: colonne 1, 2, 3…", tipo: "number", passo: "1", valore: 1 },
    ],
    testoSalva: "Crea le aiuole",
    aggiorna: (v, form) => {
      if (v.zona && form.dataset.zona !== v.zona) {
        form.dataset.zona = v.zona;
        form.elements.da.value = prossimoNumero(v.zona);
        form.elements.corridoio.value = Math.round(corridoioZona(v.zona) * 100);
      }
      // Vasi: niente giro delle serre, pacciamatura, scacchiera; il tondo ha solo il diametro.
      const vaso = Boolean(VASI[v.cosa]);
      for (const id of ["giroSerra", "pacciamatura", "righe", "colonne"]) form.querySelector(`#w_${id}`).hidden = vaso;
      campiMisureVaso(form, v.cosa, true);
      const n = Math.max(0, Math.min(50, Number(form.elements.quante.value) || 0)), da = Number(form.elements.da.value) || 1;
      const usati = S.aiuole.filter((x) => !x.semenzaio && (x.zona || ZONA_PREDEFINITA) === v.zona && x.numero >= da && x.numero < da + n);
      return (n ? `<div class="bene">Verranno ${vaso ? "creati i vasi" : "create le aiuole"} da ${da} a ${da + n - 1} in «${esc(v.zona)}».</div>` : "")
        + (usati.length ? `<div class="pericolo">Numeri già usati in questa zona: ${usati.map((x) => x.numero).join(", ")}. Comincia dal ${prossimoNumero(v.zona)}: due aiuole con lo stesso numero si confondono.</div>` : "");
    },
    salva: (v) => {
      const n = Math.max(0, Math.min(50, Number(v.quante) || 0));
      if (!n) return false;
      const da = Number(v.da) || prossimoNumero(v.zona);
      if (S.aiuole.some((x) => !x.semenzaio && (x.zona || ZONA_PREDEFINITA) === v.zona && x.numero >= da && x.numero < da + n)) return false;
      for (let k = 0; k < n; k++) {
        const vaso = VASI[v.cosa] ? v.cosa : "";
        S.aiuole.push({
          id: nuovoId(), zona: v.zona, numero: da + k, nome: "", note: "",
          larghezza: numeroMisura(v.larghezza), lunghezza: numeroMisura(vaso === "tondo" || vaso === "quadrato" ? v.larghezza : v.lunghezza),
          copertura: v.copertura, giroSerra: !vaso && !!v.giroSerra, pacciamatura: vaso ? "" : v.pacciamatura, vaso,
          ...grigliaAiuola(vaso ? { righe: 1, colonne: 1 } : { righe: v.righe, colonne: v.colonne }),
        });
      }
      const cm = Number(v.corridoio);
      if (v.corridoio !== "" && cm >= 0) (S.zone[v.zona] ??= {}).corridoio = cm / 100;
    },
  });
}

// Nome della zona e vialetto tra le aiuole.
function moduloZona(zona) {
  const z = S.zone[zona] || {};
  const dir = z.direzione == null || z.direzione === "" ? "" : Number(z.direzione);
  const inElenco = dir === "" || DIREZIONI.some(([g]) => g === dir);
  modulo({
    titolo: `Zona «${zona}»`,
    campi: [
      { id: "nome", etichetta: "Nome della zona", valore: zona, richiesto: true },
      { id: "corridoio", etichetta: "Vialetto tra un'aiuola e l'altra, in cm (0 se sono attaccate)", tipo: "number", passo: "1", valore: Math.round(corridoioZona(zona) * 100) },
      { id: "direzione", etichetta: "Orientamento: dalla prima all'ultima aiuola la fila va…", tipo: "select",
        opzioni: [["", "non indicato (disegno dritto)"], ...DIREZIONI.map(([g, t]) => [g, t])], valore: inElenco ? dir : "" },
      { id: "gradi", etichetta: "…oppure in gradi di bussola, se lo sai preciso (0 = nord, 90 = est)", tipo: "number", passo: "1", valore: inElenco ? "" : dir },
      { id: "specchia", etichetta: "Fondo e davanti delle aiuole sono invertiti nel disegno", tipo: "check", valore: z.specchia },
      { id: "rinumera", etichetta: "Rinumera le aiuole 1, 2, 3… come si legge: dalla fila in fondo a quella davanti, ognuna da sinistra a destra (la loro storia resta)", tipo: "check", valore: false },
    ],
    aggiorna: (v) => {
      if (!v.rinumera) return "";
      const lista = ordineLettura(zona);
      const cambi = lista.map((a, k) => [a, k + 1]).filter(([a, n]) => Number(a.numero) !== n);
      return cambi.length ? `<div class="bene">Nuovi numeri: ${esc(testoSpostamenti(cambi))}. Colture e diario restano legati alle loro aiuole.</div>`
        : `<div class="tenue piccolo">Le aiuole sono già numerate 1, 2, 3…</div>`;
    },
    extra: `<p class="tenue piccolo">Guarda la zona su una mappa (per esempio Google Maps, col nord in alto) e scegli la direzione che va dall'aiuola 1 all'ultima. L'app gira il disegno, mette la freccia del Nord e ti dice dove mettere le piante alte.</p>`,
    salva: (v) => {
      const cm = Number(v.corridoio);
      const g = v.gradi !== "" ? ((Math.round(Number(v.gradi)) % 360) + 360) % 360 : v.direzione === "" ? null : Number(v.direzione);
      const dati = {
        ...z,
        corridoio: v.corridoio === "" || !(cm >= 0) ? CORRIDOIO : cm / 100,
        direzione: Number.isFinite(g) ? g : null,
        specchia: v.specchia,
      };
      if (v.rinumera) {
        ordineLettura(zona).forEach((a, k) => { a.numero = k + 1; });
      }
      if (v.nome !== zona) {
        for (const a of S.aiuole) if (!a.semenzaio && (a.zona || ZONA_PREDEFINITA) === zona) a.zona = v.nome;
        delete S.zone[zona];
        if (S.impostazioni.zonaVista === zona) S.impostazioni.zonaVista = v.nome;
      }
      S.zone[v.nome] = dati;
    },
  });
}

// Aiuole di una zona nell'ordine in cui si leggono sulla mappa: dalla fila in
// fondo a quella davanti, in ogni fila da sinistra a destra (posizione come in
// htmlPianta: «inizio» se c'è, altrimenti una dopo l'altra in ordine di numero).
function ordineLettura(zona) {
  const lista = aiuoleOrdinate().filter((a) => !a.semenzaio && !a.dentro && (a.zona || ZONA_PREDEFINITA) === zona);
  const fine = {}, x = new Map();
  for (const a of lista) {
    const f = filaAiuola(a);
    const px = a.inizio != null && a.inizio !== "" ? Math.max(0, Number(a.inizio)) : (fine[f] || 0);
    fine[f] = px + (a.larghezza || 1) + corridoioZona(zona);
    x.set(a, px);
  }
  return lista.map((a, k) => ({ a, k })).sort((p, q) => filaAiuola(q.a) - filaAiuola(p.a) || x.get(p.a) - x.get(q.a) || p.k - q.k).map((p) => p.a);
}

// "＋ Nuova aiuola…" nel campo Dove: questi campi compaiono solo se scelta.
const NUOVA_AIUOLA = "__nuova";
function campiNuovaAiuola() {
  const zona = zonaScelta() || zone()[0] || ZONA_PREDEFINITA;
  return [
    { id: "nz_zona", etichetta: "Zona della nuova aiuola (es. Orto, Serra)", valore: zona, lista: [...new Set([...zone(), "Orto", "Serra"])], richiesto: true, nascosto: true },
    { id: "nz_numero", etichetta: "Numero dell'aiuola (da sinistra a destra)", tipo: "number", passo: "1", valore: prossimoNumero(zona), richiesto: true, nascosto: true },
    { id: "nz_larghezza", etichetta: "Larghezza in metri (facoltativo)", tipo: "number", passo: "0.05", nascosto: true },
    { id: "nz_lunghezza", etichetta: "Lunghezza in metri (facoltativo)", tipo: "number", passo: "0.05", nascosto: true },
  ];
}
// Mostra o nasconde i campi della nuova aiuola; restituisce un avviso se il numero è già usato.
function aggiornaNuovaAiuola(v, form) {
  const nuova = v.aiuolaId === NUOVA_AIUOLA;
  for (const id of ["nz_zona", "nz_numero", "nz_larghezza", "nz_lunghezza"]) form.querySelector(`#w_${id}`).hidden = !nuova;
  if (!nuova) return "";
  if (form.dataset.zona !== v.nz_zona) {
    form.dataset.zona = v.nz_zona;
    form.elements.nz_numero.value = prossimoNumero(v.nz_zona);
  }
  const doppia = S.aiuole.find((x) => !x.semenzaio && !x.dentro && (x.zona || ZONA_PREDEFINITA) === v.nz_zona && String(x.numero) === form.elements.nz_numero.value);
  return doppia ? `<div class="avviso">C'è già l'aiuola ${esc(doppia.numero)} in «${esc(v.nz_zona)}»: scegli un altro numero, oppure sceglila dall'elenco «Dove».</div>` : "";
}
// Crea l'aiuola se è stata scelta "Nuova aiuola"; restituisce l'id da usare.
function aiuolaDaModulo(v) {
  if (v.aiuolaId !== NUOVA_AIUOLA) return v.aiuolaId;
  const a = {
    id: nuovoId(), zona: v.nz_zona || ZONA_PREDEFINITA, numero: Number(v.nz_numero) || prossimoNumero(v.nz_zona), nome: "", note: "",
    larghezza: numeroMisura(v.nz_larghezza), lunghezza: numeroMisura(v.nz_lunghezza),
  };
  S.aiuole.push(a);
  return a.id;
}
function togliCampiNuovaAiuola(v) {
  for (const k of ["nz_zona", "nz_numero", "nz_larghezza", "nz_lunghezza"]) delete v[k];
}

// Modo più probabile per un ortaggio: a terra se si può, altrimenti trapianto.
function modoPredefinito(ortaggioId, aiuolaId) {
  if (aiuola(aiuolaId)?.semenzaio) return "sem";
  const o = PER_ID[ortaggioId];
  return o && !o.dir.length && o.tra.length ? "tra" : "dir";
}

// Prima data utile, da oggi in poi, per seminare o trapiantare un ortaggio in un modo
// ("sem", "dir", "tra"). In serra il periodo si allarga di 3 settimane per parte.
function primaDataUtile(ortaggioId, modo, aiuolaId, protezione) {
  const o = PER_ID[ortaggioId];
  if (!o || !(o[modo] || []).length) return null;
  const ora = oggi(), m = modo === "sem" ? 0 : anticipo(aiuolaId, protezione);
  const fin = finestreTra(o, modo, piuGiorni(ora, -m), piuGiorni(ora, 400))
    .map((f) => ({ inizio: piuGiorni(f.inizio, -m), fine: piuGiorni(f.fine, m) }))
    .filter((f) => f.fine >= ora)
    .sort((a, b) => a.inizio - b.inizio)[0];
  if (!fin) return null;
  return { data: fin.inizio > ora ? fin.inizio : ora, fine: fin.fine, serra: m > 0 };
}
function fmtAnno(d) { return d.getFullYear() === oggi().getFullYear() ? fmt(d) : `${fmt(d)} ${d.getFullYear()}`; }

function moduloImpianto({ aiuolaId, ortaggioId, impianto, celle, griglia } = {}) {
  const i = impianto;
  if (i?.modo === "acq") { moduloAcquisto(i); return; }
  let ultimoOrtaggio = i?.ortaggioId ?? ortaggioId ?? "";
  // Proposta: la prima aiuola vera; se non ce ne sono, "Nuova aiuola".
  const aiuolaIniziale = i?.aiuolaId ?? aiuolaId ?? aiuoleOrdinate().find(coltivabile)?.id ?? NUOVA_AIUOLA;
  let ultimaAiuola = aiuolaIniziale;
  // Coltura nuova: la data proposta segue ortaggio, modo e aiuola finché non la cambi tu.
  let dataProposta = i ? null : aISO(oggi()), ultimaChiave = "";
  // Scacchiera e pacciamatura sono della coltura: per una coltura nuova si
  // propongono quelle dell'aiuola, poi si cambiano qui senza toccare le altre.
  const aiuolaG = aiuola(aiuolaIniziale);
  // griglia "4x1": la scacchiera su cui hai toccato la casella (quella della coltura di adesso).
  const gAllora = i ? grigliaDi(i) : griglia ? grigliaAiuola({ righe: griglia.split("x")[0], colonne: griglia.split("x")[1] }) : grigliaAiuola(aiuolaG);
  let aiuolaGriglia = aiuolaIniziale;
  // Caselle che non esistono sulla scacchiera g (vasi a piramide…).
  const mancaPer = (aiuolaId, g) => i?.griglia && i.aiuolaId === aiuolaId && stessaGriglia(i.griglia, g) ? i.grigliaManca || []
    : stessaGriglia(g, grigliaAiuola(aiuola(aiuolaId))) ? aiuola(aiuolaId)?.celleMancanti || [] : [];
  modulo({
    titolo: i ? "Modifica coltura" : "Nuova coltura",
    campi: [
      { id: "ortaggioId", etichetta: "Ortaggio", tipo: "select", opzioni: opzioniOrtaggi(), valore: i?.ortaggioId ?? ortaggioId ?? "", richiesto: true },
      { id: "aiuolaId", etichetta: "Dove (aiuola)", tipo: "select", opzioni: [...opzioniAiuole(), [NUOVA_AIUOLA, "＋ Nuova aiuola…"]], valore: aiuolaIniziale, richiesto: true, mappa: !i },
      ...campiNuovaAiuola(),
      { id: "pacciamatura", etichetta: "Pacciamatura di questa coltura", tipo: "select", opzioni: Object.entries(PACCIAMATURE), valore: i ? i.pacciamatura ?? aiuolaG?.pacciamatura ?? "" : aiuolaG?.pacciamatura ?? "", nascosto: true },
      { id: "grigliaRighe", etichetta: "Scacchiera di questa coltura: righe a, b, c… (dal fondo verso di te)", tipo: "number", passo: "1", valore: gAllora.righe, nascosto: true },
      { id: "grigliaColonne", etichetta: "… e colonne 1, 2, 3… (da sinistra a destra; una coltura per fila: 1 riga e tante colonne quante file)", tipo: "number", passo: "1", valore: gAllora.colonne, nascosto: true },
      campoCelle(i?.celle ?? celle),
      { id: "modo", etichetta: "Come", tipo: "select", opzioni: Object.entries(MODI).filter(([k]) => k !== "acq"), valore: i?.modo ?? modoPredefinito(ultimoOrtaggio, aiuolaIniziale) },
      { id: "protezione", etichetta: "Protezione all'inizio", tipo: "select", opzioni: Object.entries(PROTEZIONI), valore: i?.protezione ?? "" },
      { id: "data", etichetta: "Data", tipo: "date", valore: i?.data ?? aISO(oggi()), richiesto: true },
      { id: "varieta", etichetta: "Varietà (facoltativo)", valore: i?.varieta },
      { id: "quantita", etichetta: "Quante piante / file (facoltativo)", valore: i?.quantita },
      { id: "note", etichetta: "Note", tipo: "textarea", valore: i?.note },
      ...(i ? [{ id: "finito", etichetta: "Coltura finita (non più nell'orto)", tipo: "check", valore: i.finito }] : []),
    ],
    elimina: i ? () => eliminaImpianto(i) : null,
    aggiorna: (v, form) => {
      if (aiuola(v.aiuolaId)?.semenzaio && v.modo !== "sem") form.elements.modo.value = "sem";
      if (v.ortaggioId !== ultimoOrtaggio || v.aiuolaId !== ultimaAiuola) {
        // Cambiato ortaggio o aiuola: ripropongo il modo (semenzaio, a terra, trapianto).
        if (v.ortaggioId !== ultimoOrtaggio || aiuola(ultimaAiuola)?.semenzaio || aiuola(v.aiuolaId)?.semenzaio) {
          form.elements.modo.value = modoPredefinito(v.ortaggioId, v.aiuolaId);
        }
        ultimoOrtaggio = v.ortaggioId;
        ultimaAiuola = v.aiuolaId;
      }
      let proposta = "";
      const modoOra = form.elements.modo.value;
      const protezione = aiuola(v.aiuolaId)?.semenzaio ? "" : v.protezione;
      form.querySelector("#w_protezione").hidden = Boolean(aiuola(v.aiuolaId)?.semenzaio);
      const utile = v.ortaggioId ? primaDataUtile(v.ortaggioId, modoOra, v.aiuolaId, protezione) : null;
      if (dataProposta !== null) {
        const chiave = `${v.ortaggioId}|${modoOra}|${v.aiuolaId}|${protezione}`;
        if (v.data !== dataProposta) dataProposta = null; // l'hai cambiata tu: non la tocco più
        else if (chiave !== ultimaChiave && utile) form.elements.data.value = dataProposta = aISO(utile.data);
        ultimaChiave = chiave;
      }
      if (utile) {
        const nome = esc(MODI[modoOra].toLowerCase());
        proposta = `<div class="bene">📅 Prima data utile per ${nome}: <b>${giorniTra(oggi(), utile.data) === 0 ? "da oggi" : "dal " + fmtAnno(utile.data)}</b> fino al ${fmtAnno(utile.fine)}${modoOra === "sem" ? "" : esc(testoVantaggio(v.aiuolaId, protezione))}.</div>`;
      } else if (v.ortaggioId) {
        proposta = `<div class="avviso">📅 Per ${esc(PER_ID[v.ortaggioId].nome.toLowerCase())} il calendario non prevede ${esc(MODI[modoOra].toLowerCase())}: prova un altro "Come".</div>`;
      }
      const v2 = { ...v, data: form.elements.data.value };
      // Cambiata aiuola: scacchiera e pacciamatura proposte sono le sue.
      if (v2.aiuolaId !== aiuolaGriglia) {
        aiuolaGriglia = v2.aiuolaId;
        const gn = i && v2.aiuolaId === i.aiuolaId ? grigliaDi(i) : grigliaAiuola(aiuola(v2.aiuolaId));
        form.elements.grigliaRighe.value = v.grigliaRighe = gn.righe; form.elements.grigliaColonne.value = v.grigliaColonne = gn.colonne;
        if (!(i && v2.aiuolaId === i.aiuolaId)) form.elements.pacciamatura.value = aiuola(v2.aiuolaId)?.pacciamatura || "";
      }
      const conG = puoScacchiera(aiuola(v2.aiuolaId));
      for (const id of ["grigliaRighe", "grigliaColonne", "pacciamatura"]) form.querySelector(`#w_${id}`).hidden = !conG;
      const gScelta = conG ? grigliaAiuola({ righe: v.grigliaRighe, colonne: v.grigliaColonne }) : null;
      const avvisoCelle = aggiornaSceltaCelle(form, v2.aiuolaId, i?.id, gScelta, gScelta ? mancaPer(v2.aiuolaId, gScelta) : null, v.finito);
      // Avvisi sui vicini: caselle riportate sulla scacchiera dell'aiuola.
      const scelte = form.elements.celle.value.split(",").filter(Boolean);
      const celleScelte = gScelta && scelte.length ? celleSu({ celle: scelte, griglia: gScelta, aiuolaId: v2.aiuolaId }, grigliaAiuola(aiuola(v2.aiuolaId))) : scelte;
      return aggiornaNuovaAiuola(v2, form) + avvisoCelle + proposta + htmlAvvisi(v2.aiuolaId, v2.ortaggioId, v2.data, i?.id, celleScelte, protezione)
        + (CONSIGLI_PROTEZIONE[protezione] ? `<div class="bene piccolo">${CONSIGLI_PROTEZIONE[protezione]}</div>` : "")
        + (v2.ortaggioId && !v.finito && !aiuola(v2.aiuolaId)?.semenzaio && testoIntercalari(v2.ortaggioId, v2.data) ? `<div class="bene piccolo">${testoIntercalari(v2.ortaggioId, v2.data)}</div>` : "");
    },
    salva: (v) => {
      v.aiuolaId = aiuolaDaModulo(v);
      togliCampiNuovaAiuola(v);
      const conG = puoScacchiera(aiuola(v.aiuolaId));
      const gScelta = conG ? grigliaAiuola({ righe: v.grigliaRighe, colonne: v.grigliaColonne }) : null;
      delete v.grigliaRighe; delete v.grigliaColonne;
      if (!conG) delete v.pacciamatura;
      if (gScelta) {
        const manca = mancaPer(v.aiuolaId, gScelta), via = new Set(manca);
        v.celle = ordinaCelle(v.celle.split(",").filter(Boolean).filter((x) => { const q = cellaRC(x); return q.r >= 0 && q.r < gScelta.righe && q.c >= 0 && q.c < gScelta.colonne && !via.has(x); }));
        v.griglia = { righe: gScelta.righe, colonne: gScelta.colonne };
        v.grigliaManca = manca.length ? [...manca] : undefined;
      } else {
        v.celle = celleValide(aiuola(v.aiuolaId), v.celle.split(",").filter(Boolean));
        if (i) { delete i.griglia; delete i.grigliaManca; }
      }
      if (aiuola(v.aiuolaId)?.semenzaio) { v.modo = "sem"; v.protezione = ""; }
      if (i) {
        // Riaperta: non è più finita, via esito e data di fine.
        if (i.finito && !v.finito) { delete i.esito; delete i.dataFine; }
        Object.assign(i, v);
      } else S.impianti.push({ id: nuovoId(), finito: false, ...v });
    },
  });
}

// Piantine comprate in vasetti: restano nel semenzaio qualche ora o qualche giorno,
// poi «Trapianta» come le semine.
function moduloAcquisto(i) {
  const q = i?.acquisto || {};
  const altro = q.perVasetto && !PIANTINE_PER_VASETTO.includes(Number(q.perVasetto));
  modulo({
    titolo: i ? "Modifica piantine comprate" : "🛒 Piantine comprate",
    campi: [
      { id: "ortaggioId", etichetta: "Ortaggio", tipo: "select", opzioni: opzioniOrtaggi(), valore: i?.ortaggioId ?? "", richiesto: true },
      { id: "varieta", etichetta: "Varietà (facoltativo)", valore: i?.varieta },
      { id: "vasetti", etichetta: "Quanti vasetti (o confezioni)", tipo: "number", passo: "1", valore: q.vasetti ?? 1, richiesto: true },
      { id: "perVasetto", etichetta: "Piantine in ogni vasetto", tipo: "select",
        opzioni: [...PIANTINE_PER_VASETTO.map((n) => [String(n), String(n)]), ["altro", "altro numero…"]], valore: altro ? "altro" : String(q.perVasetto ?? 1) },
      { id: "perVasettoAltro", etichetta: "Quante piantine in ogni vasetto", tipo: "number", passo: "1", valore: altro ? q.perVasetto : "", nascosto: !altro },
      { id: "data", etichetta: "Data dell'acquisto", tipo: "date", valore: i?.data ?? aISO(oggi()), richiesto: true },
      { id: "costo", etichetta: "Quanto hai speso in tutto, in € (facoltativo)", tipo: "number", passo: "0.01", valore: q.costo },
      { id: "marca", etichetta: "Marca o vivaio che le ha prodotte (facoltativo)", valore: q.marca },
      { id: "negozio", etichetta: "Negozio (facoltativo)", valore: q.negozio, lista: [...new Set(S.impianti.map((x) => x.acquisto?.negozio).filter(Boolean))] },
      { id: "luogoNegozio", etichetta: "Dove si trova il negozio (facoltativo)", valore: q.luogoNegozio, lista: [...new Set(S.impianti.map((x) => x.acquisto?.luogoNegozio).filter(Boolean))] },
      { id: "note", etichetta: "Note (es. F1 ibrido, innestata, resistente a…)", tipo: "textarea", valore: i?.note },
      ...(i ? [{ id: "finito", etichetta: "Già trapiantate o finite (non più nel semenzaio)", tipo: "check", valore: i.finito }] : []),
    ],
    elimina: i ? () => eliminaImpianto(i) : null,
    aggiorna: (v, form) => {
      form.querySelector("#w_perVasettoAltro").hidden = v.perVasetto !== "altro";
      const per = v.perVasetto === "altro" ? Number(v.perVasettoAltro) : Number(v.perVasetto);
      const n = (Number(v.vasetti) || 0) * (per || 0);
      const o = PER_ID[v.ortaggioId];
      const utile = o ? primaDataUtile(v.ortaggioId, "tra", null, "") : null;
      return (n ? `<div class="bene">🌱 In tutto <b>${n} ${n === 1 ? "piantina" : "piantine"}</b>${Number(v.costo) > 0 ? ` · circa € ${fmtEuro(Number(v.costo) / n)} l'una` : ""}.</div>` : "")
        + (o && utile ? `<div class="${giorniTra(oggi(), utile.data) > 0 ? "avviso" : "bene"}">📅 Trapianto all'aperto ${giorniTra(oggi(), utile.data) > 0 ? `dal <b>${fmtAnno(utile.data)}</b>: fino ad allora tienile al riparo` : "<b>da subito</b>"}. Annaffiale appena arrivate e, se puoi, lasciale qualche giorno fuori all'ombra prima di trapiantarle.</div>` : "");
    },
    salva: (v) => {
      const per = v.perVasetto === "altro" ? Number(v.perVasettoAltro) || 1 : Number(v.perVasetto) || 1;
      const vasetti = Math.max(1, Number(v.vasetti) || 1);
      const dati = {
        ortaggioId: v.ortaggioId, aiuolaId: "semenzaio", modo: "acq", data: v.data, varieta: v.varieta, note: v.note, celle: [],
        quantita: `${vasetti * per} piantine`,
        acquisto: { vasetti, perVasetto: per, costo: v.costo === "" ? null : Number(String(v.costo).replace(",", ".")),
          marca: v.marca, negozio: v.negozio, luogoNegozio: v.luogoNegozio },
      };
      if (i) {
        if (i.finito && !v.finito) { delete i.esito; delete i.dataFine; }
        Object.assign(i, dati, { finito: v.finito });
      } else S.impianti.push({ id: nuovoId(), finito: false, ...dati });
    },
  });
}

function eliminaImpianto(i) {
  const o = PER_ID[i.ortaggioId];
  const collegate = S.eventi.filter((e) => e.impiantoId === i.id).length;
  if (!confirm(`Eliminare ${o?.nome.toLowerCase() ?? "questa coltura"} del ${fmt(daISO(i.data))} ${i.data.slice(0, 4)} (${nomeAiuolaId(i.aiuolaId)})?`
    + (collegate ? `\n\nLe ${collegate} annotazioni collegate restano nel diario.` : ""))) return false;
  S.impianti = S.impianti.filter((x) => x.id !== i.id);
  for (const e of S.eventi) if (e.impiantoId === i.id) e.impiantoId = "";
  // Se era un trapianto dal semenzaio, la semina torna in semenzaio.
  const origine = i.daSemenzaio && S.impianti.find((x) => x.id === i.daSemenzaio);
  if (origine) origine.trapiantate = Math.max(0, (Number(origine.trapiantate) || 0) - (Number(i.piantine) || 0));
  if (origine && origine.esito === "trapiantato") {
    origine.finito = false;
    delete origine.esito;
    delete origine.dataFine;
  }
  for (const x of S.impianti) if (x.daSemenzaio === i.id) delete x.daSemenzaio;
  return true;
}

// Piantine nel semenzaio: totale (dai vasetti comprati, o dal numero scritto in
// «Quante»; null se non si sa) e quante restano dopo i trapianti già fatti.
function piantineTotali(i) {
  if (i.modo === "acq") return piantineAcquisto(i.acquisto) || null;
  const n = parseInt(String(i.quantita || "").trim(), 10);
  return n > 0 ? n : null;
}
function piantineRimaste(i) {
  const tot = piantineTotali(i);
  return tot == null ? null : Math.max(0, tot - (Number(i.trapiantate) || 0));
}

function moduloTrapianto(i) {
  const o = PER_ID[i.ortaggioId];
  const rimaste = piantineRimaste(i);
  modulo({
    titolo: `Trapianta ${o.nome.toLowerCase()}`,
    campi: [
      { id: "aiuolaId", etichetta: "In quale aiuola", tipo: "select", opzioni: [["", "— scegli —"], ...opzioniAiuole(false), [NUOVA_AIUOLA, "＋ Nuova aiuola…"]], valore: aiuola(i.pianoAiuola) ? i.pianoAiuola : "", richiesto: true, mappa: true },
      ...campiNuovaAiuola(),
      campoCelle(aiuola(i.pianoAiuola) ? i.pianoCelle : []),
      { id: "data", etichetta: "Data del trapianto", tipo: "date", valore: aISO(oggi()), richiesto: true },
      { id: "protezione", etichetta: "Protezione all'inizio", tipo: "select", opzioni: Object.entries(PROTEZIONI), valore: i.protezione ?? "" },
      { id: "piantine", etichetta: rimaste != null ? `Quante piantine trapianti (nel semenzaio ce ne sono ${rimaste})` : "Quante piantine trapianti", tipo: "number", passo: "1", valore: rimaste ?? "" },
      { id: "restano", etichetta: "Nel semenzaio ne restano altre: le trapianto dopo", tipo: "check", valore: false, nascosto: rimaste != null },
    ],
    testoSalva: "Trapianta",
    aggiorna: (v, form) => {
      const avvisoCelle = aggiornaSceltaCelle(form, v.aiuolaId, null);
      const n = Number(v.piantine) || 0;
      const resto = rimaste != null && n > 0 && n < rimaste
        ? `<div class="bene">🪴 Nel semenzaio ne restano <b>${rimaste - n}</b>: le trapianti dopo con un altro «Trapianta».</div>`
        : rimaste != null && n > rimaste ? `<div class="avviso">Nel semenzaio ce ne sono solo ${rimaste}.</div>` : "";
      return aggiornaNuovaAiuola(v, form) + avvisoCelle + resto
        + htmlAvvisi(v.aiuolaId, i.ortaggioId, v.data, null, form.elements.celle.value.split(",").filter(Boolean), v.protezione)
        + (CONSIGLI_PROTEZIONE[v.protezione] ? `<div class="bene piccolo">${CONSIGLI_PROTEZIONE[v.protezione]}</div>` : "")
        + (testoIntercalari(i.ortaggioId, v.data) ? `<div class="bene piccolo">${testoIntercalari(i.ortaggioId, v.data)}</div>` : "");
    },
    salva: (v) => {
      if (!v.aiuolaId) return false;
      v.aiuolaId = aiuolaDaModulo(v);
      const celleTrapianto = celleValide(aiuola(v.aiuolaId), v.celle.split(",").filter(Boolean));
      const n = Math.max(0, Math.round(Number(v.piantine) || 0));
      i.trapiantate = (Number(i.trapiantate) || 0) + n;
      // Restano piantine nel semenzaio? Allora la semina (o l'acquisto) resta aperta.
      const restano = rimaste != null ? n > 0 && n < rimaste : v.restano;
      if (!restano) {
        i.finito = true;
        i.dataFine = v.data;
        i.esito = "trapiantato";
      }
      S.impianti.push({
        id: nuovoId(), finito: false, ortaggioId: i.ortaggioId, aiuolaId: v.aiuolaId, modo: "tra",
        data: v.data, varieta: i.varieta, quantita: n ? `${n} ${n === 1 ? "piantina" : "piantine"}` : "", piantine: n || null, note: i.modo === "acq" ? `Piantine comprate il ${fmt(daISO(i.data))}: ${testoAcquisto(i)}${i.note ? ". " + i.note : ""}` : "",
        daSemenzaio: i.id, celle: celleTrapianto, protezione: v.protezione,
        ...(i.piano ? { piano: i.piano } : {}),
      });
    },
  });
}

function moduloEvento({ tipo = "raccolto", aiuolaId, impiantoId, evento, testo } = {}) {
  const ev = evento;
  const attivi = S.impianti.filter((x) => !x.finito || x.id === (ev?.impiantoId ?? impiantoId));
  modulo({
    titolo: ev ? "Modifica annotazione" : "Nuova annotazione",
    campi: [
      { id: "tipo", etichetta: "Che cosa", tipo: "select", opzioni: Object.entries(TIPI_EVENTO), valore: ev?.tipo ?? tipo },
      { id: "data", etichetta: "Data", tipo: "date", valore: ev?.data ?? aISO(oggi()), richiesto: true },
      { id: "aiuolaId", etichetta: "Aiuola (facoltativo)", tipo: "select", opzioni: [["", "— tutto l'orto —"], ...aiuoleOrdinate().filter((x) => !x.capanno).map((x) => [x.id, nomeAiuola(x)])], valore: ev?.aiuolaId ?? aiuolaId ?? "" },
      { id: "impiantoId", etichetta: "Coltura (facoltativo)", tipo: "select",
        opzioni: [["", "—"], ...attivi.map((x) => [x.id, `${nomeOrtaggioTesto(x.ortaggioId)} — ${nomeAiuolaId(x.aiuolaId)}`])],
        valore: ev?.impiantoId ?? impiantoId ?? "" },
      { id: "kg", etichetta: "Quantità raccolta in kg (solo raccolto)", tipo: "number", passo: "0.1", valore: ev?.kg },
      { id: "malattia", etichetta: "Quale malattia (se non lo sai: «Non so»)", tipo: "select", opzioni: Object.entries(MALATTIE_TERRENO).map(([k, m]) => [k, m.nome]), valore: ev?.malattia ?? "nonso", nascosto: (ev?.tipo ?? tipo) !== "malattia" },
      { id: "fam", etichetta: "Su quale famiglia di piante", tipo: "select", opzioni: [["", "— scegli —"], ...Object.entries(FAMIGLIE)], valore: ev?.fam ?? "", nascosto: (ev?.tipo ?? tipo) !== "malattia" },
      { id: "testo", etichetta: "Descrizione (es. prodotto usato, osservazioni)", tipo: "textarea", valore: ev?.testo ?? testo },
    ],
    elimina: ev ? () => {
      if (!confirm(`Eliminare questa annotazione (${TIPI_EVENTO[ev.tipo] ?? ev.tipo}, ${fmt(daISO(ev.data))})?`)) return false;
      S.eventi = S.eventi.filter((x) => x.id !== ev.id);
    } : null,
    aggiorna: (v, form) => {
      const mal = v.tipo === "malattia";
      form.querySelector("#w_malattia").hidden = !mal;
      form.querySelector("#w_fam").hidden = !mal;
      if (mal && !v.fam) {
        // Proposta: la famiglia della coltura scelta, o dell'ultima coltura dell'aiuola.
        const ult = S.impianti.find((x) => x.id === v.impiantoId)
          ?? S.impianti.filter((x) => x.aiuolaId === v.aiuolaId && x.data <= v.data).sort((x, y) => y.data.localeCompare(x.data))[0];
        if (PER_ID[ult?.ortaggioId]) form.elements.fam.value = PER_ID[ult.ortaggioId].fam;
      }
      if (mal) return `<div class="bene">🦠 Piante avvizzite o marce per colpa della terra? Per ${anniMalattia({ malattia: v.malattia })} anni l'app ti avvisa se rimetti ${form.elements.fam.value ? FAMIGLIE[form.elements.fam.value].toLowerCase() : "quella famiglia"}${MALATTIE_TERRENO[v.malattia]?.altre ? ` (con la verticillosi anche ${MALATTIE_TERRENO.verticillosi.altre.filter((f) => f !== form.elements.fam.value).map((f) => FAMIGLIE[f].toLowerCase()).join(", ")})` : ""} in quell'aiuola, e il piano dell'anno nuovo la evita.${v.aiuolaId ? "" : "<br><b>Scegli l'aiuola.</b>"}</div>`;
      return v.tipo === "terra"
      ? `<div class="bene">🪣 Hai tolto la terra vecchia e messo terra nuova (o presa da un'altra aiuola)? Da questa data l'app tratta l'aiuola come nuova: le colture di prima non contano più per la rotazione.${v.aiuolaId ? "" : "<br><b>Scegli l'aiuola.</b>"}</div>` : "";
    },
    salva: (v) => {
      if (v.impiantoId && !v.aiuolaId) v.aiuolaId = S.impianti.find((x) => x.id === v.impiantoId)?.aiuolaId ?? "";
      if ((v.tipo === "terra" || v.tipo === "malattia") && !aiuola(v.aiuolaId)) { document.querySelector("#m_avvisi").innerHTML = `<div class="pericolo">Per «${TIPI_EVENTO[v.tipo].slice(3)}» scegli l'aiuola.</div>`; return false; }
      if (v.tipo === "malattia" && !v.fam) { document.querySelector("#m_avvisi").innerHTML = `<div class="pericolo">Scegli la famiglia di piante colpita.</div>`; return false; }
      if (v.tipo !== "malattia") { delete v.malattia; delete v.fam; }
      v.kg = v.kg ? Number(v.kg.replace(",", ".")) : null;
      if (ev) Object.assign(ev, v);
      else S.eventi.push({ id: nuovoId(), ...v });
    },
  });
}

function chiudiImpianto(i) {
  modulo({
    titolo: `Fine coltura: ${PER_ID[i.ortaggioId]?.nome ?? ""}`,
    campi: [
      { id: "dataFine", etichetta: "Data di fine", tipo: "date", valore: aISO(oggi()), richiesto: true },
      { id: "esito", etichetta: "Com'è andata", tipo: "select", opzioni: [["raccolto", "Raccolta finita"], ["fallito", "Non è venuta / malattia"], ["altro", "Altro"]] },
      { id: "commento", etichetta: "Commento per l'anno prossimo", tipo: "textarea", valore: i.commento },
    ],
    testoSalva: "Chiudi coltura",
    salva: (v) => { Object.assign(i, v, { finito: true }); },
  });
}


// -----------------------------------------------------------------------------
// Aiuola vuota: togliere la pacciamatura e concimare per la prossima coltura.
// Dosi di fondo in kg per m², secondo l'esigenza dell'ortaggio che verrà.
// -----------------------------------------------------------------------------
const CONCIMI = [
  // Pollina: dosi dall'etichetta di Fruttorto Italpollina (NPK 4-4-4, orticole 200–300 g/m²), il concime preferito dell'utente.
  { id: "pollina", nome: "Pollina pellettata (Fruttorto / Biorex)", dose: { alta: 0.3, media: 0.25, bassa: 0.15 } },
  { id: "stallatico", nome: "Stallatico pellettato", dose: { alta: 0.4, media: 0.3, bassa: 0.15 } },
  { id: "letame", nome: "Letame maturo (sfuso)", dose: { alta: 4, media: 3, bassa: 1.5 } },
];
const GIORNI_CONCIMAZIONE = 120; // una concimazione più recente vale ancora
function fmtKg(kg) {
  return kg < 1 ? `${Math.round(kg * 1000 / 10) * 10} g` : `${(Math.round(kg * 10) / 10).toString().replace(".", ",")} kg`;
}
// L'aiuola è vuota se non c'è niente di già seminato o trapiantato (le colture in programma non contano).
function aiuolaVuota(a) {
  return !a.semenzaio && !impiantiAttivi(a.id).some((i) => daISO(i.data) <= oggi());
}
function ultimaConcimazione(a) {
  const limite = piuGiorni(oggi(), -GIORNI_CONCIMAZIONE);
  return S.eventi.filter((e) => e.aiuolaId === a.id && e.tipo === "concimazione" && daISO(e.data) >= limite && daISO(e.data) <= oggi())
    .sort((x, y) => y.data.localeCompare(x.data))[0];
}
function consiglioAiuolaVuota(a) {
  if (!aiuolaVuota(a)) return "";
  const ora = oggi(), mese = ora.getMonth();
  const prossima = impiantiAttivi(a.id).sort((x, y) => x.data.localeCompare(y.data))[0];
  const op = prossima && PER_ID[prossima.ortaggioId];
  const esig = op?.esig ?? "media";
  const mq = mqAiuola(a);
  const fatta = ultimaConcimazione(a);

  const passi = [];
  // Pacciamatura: quella dell'ultima coltura (se l'avevi scritta), altrimenti quella dell'aiuola.
  const ultima = S.impianti.filter((i) => i.aiuolaId === a.id && i.finito).sort((x, y) => (y.dataFine || y.data).localeCompare(x.dataFine || x.data))[0];
  const pac = ultima?.pacciamatura ?? a.pacciamatura;
  if (pac === "telo") passi.push("Togli o arrotola il <b>telo di pacciamatura</b>: così puoi concimare e lavorare la terra. Rimettilo prima di piantare, tiene a bada le erbacce.");
  if (pac === "organica") passi.push("Sposta ai lati <b>paglia o foglie</b> (se sono già ben decomposte puoi interrarle).");
  if (fatta) {
    passi.push(`Concimata il ${fmt(daISO(fatta.data))}${fatta.testo ? ` (${esc(fatta.testo)})` : ""}: per ora basta così.`);
  } else {
    // Stagione: d'inverno letame e stallatico (lenti); la pollina, ricca di azoto, meglio a fine inverno.
    let quando;
    if (mese >= 10 || mese === 0) quando = "Adesso è il momento di <b>letame maturo o stallatico</b>, che si decompongono durante l'inverno. La pollina tienila per fine febbraio–marzo, 2–3 settimane prima di seminare: d'inverno la pioggia porterebbe via il suo azoto.";
    else if (mese <= 3) quando = "Spargi il concime <b>2–3 settimane prima</b> di seminare o trapiantare e interralo con una zappatura leggera (10–15 cm).";
    else if (mese <= 8) quando = "Tra una coltura e l'altra basta <b>metà dose</b>, se in primavera l'aiuola era già stata concimata. Aspetta una settimana prima di piantare.";
    else quando = "In autunno <b>letame maturo o stallatico</b>; se non semini nulla, copri la terra con pacciamatura o un sovescio.";
    passi.push(quando);
    const righe = CONCIMI.map((c) => `<tr><td>${c.nome}</td><td class="num">${fmtKg(c.dose[esig])}/m²</td>${mq ? `<td class="num"><b>${fmtKg(c.dose[esig] * mq)}</b></td>` : ""}</tr>`).join("");
    passi.push(`Uno solo dei tre${op ? `, dosato per <b>${esc(op.nome.toLowerCase())}</b> (${esc(ESIGENZE[esig].split(":")[0].toLowerCase())})` : " (dose media)"}:
      <div class="scorri"><table><tr><th>Concime</th><th class="num">Dose</th>${mq ? `<th class="num">Per ${fmtM(mq)} m²</th>` : ""}</tr>${righe}</table></div>
      ${mq ? "" : `<span class="tenue piccolo">Metti le misure dell'aiuola (✏️ Modifica aiuola) per sapere quanti kg servono.</span>`}`);
  }
  return `<section class="carta consiglio-vuota"><h3 style="margin-top:0">🧺 Aiuola libera: preparala</h3>
    <ol>${passi.map((p) => `<li>${p}</li>`).join("")}</ol>
    <div class="riga-bottoni"><button class="piccolo" data-concima="${a.id}">＋ Segna concimazione</button></div>
  </section>`;
}
// Testo proposto quando segni la concimazione.
function testoConcimazione(a) {
  const prossima = impiantiAttivi(a.id).sort((x, y) => x.data.localeCompare(y.data))[0];
  const esig = PER_ID[prossima?.ortaggioId]?.esig ?? "media";
  const mq = mqAiuola(a);
  return mq ? `Pollina pellettata ${fmtKg(CONCIMI[0].dose[esig] * mq)}` : "Pollina pellettata";
}

// -----------------------------------------------------------------------------
// Malattie e parassiti: guida per sintomi (dati in data.js).
// -----------------------------------------------------------------------------
function problemiDi(ortaggioId) {
  const o = PER_ID[ortaggioId];
  return PROBLEMI.filter((p) => !ortaggioId || p.colpisce.some((c) => c === "*" || c === ortaggioId || (o && c === "fam:" + o.fam)));
}
function apriDiagnosi({ ortaggioId = "", aiuolaId = "", impiantoId = "" } = {}) {
  let ortaggio = ortaggioId;
  const scelti = new Set();
  const corpo = () => {
    const tutti = problemiDi(ortaggio);
    const sintomi = Object.keys(SINTOMI).filter((k) => tutti.some((p) => p.sintomi.includes(k)));
    for (const k of [...scelti]) if (!sintomi.includes(k)) scelti.delete(k);
    const generico = (p) => p.colpisce.includes("*") ? 1 : 0;
    const trovati = tutti
      .map((p) => ({ p, n: p.sintomi.filter((k) => scelti.has(k)).length }))
      .filter((x) => !scelti.size || x.n > 0)
      .sort((x, y) => y.n - x.n || generico(x.p) - generico(y.p));
    const o = PER_ID[ortaggio];
    return `
      <label for="d_ortaggio">Ortaggio</label>
      <select id="d_ortaggio">${[["", "— tutti —"], ...opzioniOrtaggi().slice(1)].map(([v, t]) => `<option value="${v}" ${v === ortaggio ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
      <p style="margin:12px 0 4px"><b>Cosa vedi?</b> <span class="tenue piccolo">Tocca uno o più sintomi.</span></p>
      <div class="sintomi">${sintomi.map((k) => `<button type="button" class="chip${scelti.has(k) ? " attiva" : ""}" data-sintomo="${k}">${esc(SINTOMI[k])}</button>`).join("")}</div>
      <h3>${scelti.size ? "Può essere" : `Problemi più comuni${o ? ` ${icona(o)} ${esc(o.nome.toLowerCase())}` : ""}`}</h3>
      ${trovati.length ? trovati.map(({ p, n }, k) => `<details class="problema" ${scelti.size && k === 0 ? "open" : ""}>
        <summary><b>${esc(p.nome)}</b> <span class="tenue piccolo">· ${esc(p.tipo)}${scelti.size ? ` · ${n} sintom${n === 1 ? "o" : "i"} su ${scelti.size}` : ""}</span></summary>
        <p><b>Come riconoscerlo.</b> ${esc(p.riconosci)}</p>
        <p><b>🌿 Cosa fare (biologico).</b> ${esc(p.cura)}</p>
        ${p.nonBio ? `<p><b>⚗️ Non biologico.</b> ${esc(p.nonBio)}</p>` : ""}
        <p><b>Per prevenire.</b> ${esc(p.previeni)}</p>
        <button type="button" class="piccolo secondario" data-tratta="${p.id}">＋ Segna nel diario</button>
      </details>`).join("") : `<p class="tenue">Nessun problema noto con questi sintomi per questo ortaggio: prova a togliere qualche sintomo.</p>`}
      <p class="tenue piccolo">È una guida per orientarsi, non una diagnosi sicura. Nel dubbio porta un rametto in un vivaio o al consorzio agrario. Prova prima i rimedi biologici. Per i prodotti di sintesi compra solo quelli autorizzati per l'orto di casa («uso non professionale») e per quell'ortaggio: sono i nomi dei principi attivi, li trovi scritti sull'etichetta. Usa sempre le dosi dell'etichetta e rispetta i giorni di attesa prima della raccolta.</p>
      <div class="riga-bottoni"><button class="secondario" data-chiudi>Chiudi</button></div>`;
  };
  apriFinestra(`<h2>🩺 Malattie e parassiti</h2>${htmlRiconosci()}<div id="diagnosi"></div>`, (f) => {
    collegaRiconosci(f, { aiuolaId, impiantoId });
    const box = f.querySelector("#diagnosi");
    const ridisegna = () => {
      box.innerHTML = corpo();
      box.querySelectorAll("[data-chiudi]").forEach((b) => b.addEventListener("click", () => f.close()));
    };
    box.addEventListener("change", (e) => { if (e.target.id === "d_ortaggio") { ortaggio = e.target.value; ridisegna(); } });
    box.addEventListener("click", (e) => {
      const s = e.target.closest("[data-sintomo]");
      if (s) { const k = s.dataset.sintomo; if (scelti.has(k)) scelti.delete(k); else scelti.add(k); ridisegna(); return; }
      const t = e.target.closest("[data-tratta]");
      if (t) {
        const p = PROBLEMI.find((x) => x.id === t.dataset.tratta);
        moduloEvento({ tipo: "trattamento", aiuolaId, impiantoId: impiantoId || undefined, testo: `${p.nome}: ` });
      }
    });
    ridisegna();
  });
}

// -----------------------------------------------------------------------------
// Scheda ortaggio
// -----------------------------------------------------------------------------
function schedaOrtaggio(id) {
  const o = PER_ID[id];
  const anno = oggi().getFullYear();
  const righeFasi = Object.keys(FASI).map((f) => {
    const fin = finestreAnno(o, f, anno);
    if (!fin.length) return "";
    return `<tr><th>${FASI[f].nome}</th><td>${fin.map((x) => `${fmt(x.inizio)} – ${fmt(x.fine)}`).join("<br>")}</td></tr>`;
  }).join("");
  const amici = amiciDi(id).map((x) => PER_ID[x].nome.toLowerCase());
  const nemici = nemiciDi(id).map((x) => PER_ID[x].nome.toLowerCase());
  apriFinestra(`
    <div class="riga" style="display:flex;justify-content:space-between;align-items:center">
      <h2>${icona(o)} ${esc(o.nome)}</h2>
      <button class="stella" id="stella" aria-label="Preferito">${preferito(id) ? "★" : "☆"}</button>
    </div>
    <p class="tenue">${esc(FAMIGLIE[o.fam])} · ${esc(ESIGENZE[o.esig])}</p>
    <table>${righeFasi}
      ${o.gg ? `<tr><th>Alla raccolta</th><td>circa ${o.gg} giorni dalla semina a terra o dal trapianto</td></tr>` : ""}
      ${o.semTrap ? `<tr><th>In semenzaio</th><td>circa ${o.semTrap} settimane prima del trapianto</td></tr>` : ""}
      <tr><th>Distanze</th><td>${esc(o.dist)}</td></tr>
    </table>
    <p>${esc(o.note)}</p>
    ${amici.length ? `<p><b>Buoni vicini:</b> ${esc(amici.join(", "))}</p>` : ""}
    ${nemici.length ? `<p><b>Da tenere lontano:</b> ${esc(nemici.join(", "))}</p>` : ""}
    ${!PERENNI.has(id) && o.fam !== "rutacee" ? `<p><b>🔄 Dopo, nella stessa aiuola:</b> ${esc(dopoDi(id).ideali.map((x) => x.nome.split(" (")[0].toLowerCase()).join(", "))}. Non ${esc(FAMIGLIE[o.fam].split(" (")[0].toLowerCase())} per ${ANNI_ROTAZIONE} anni. <a href="#dopo">Tabella</a></p>` : ""}
    ${INTERCALARI[id] ? `<p><b>🌱 Colture veloci da mettere ${esc(INTERCALARI[id].dove)}</b> (nei primi ${INTERCALARI[id].giorni} giorni, finché è piccolo): ${esc(INTERCALARI[id].tra.map((x) => PER_ID[x].nome.split(" (")[0].toLowerCase()).join(", "))}.</p>` : ""}
    <p class="tenue piccolo">Date calcolate per il tuo luogo (ultima brinata ${fmtMmdd(S.impostazioni.ultimaBrinata)}, prima brinata ${fmtMmdd(S.impostazioni.primaBrinata)}).</p>
    <div class="riga-bottoni">
      <button id="aggiungi">＋ Aggiungi all'orto</button>
      <button class="secondario" id="malattie-ortaggio">🩺 Malattie</button>
      <button class="secondario" data-chiudi>Chiudi</button>
    </div>`, (f) => {
    f.querySelector("#stella").addEventListener("click", (e) => {
      const p = S.impostazioni.preferiti;
      if (preferito(id)) p.splice(p.indexOf(id), 1); else p.push(id);
      e.target.textContent = preferito(id) ? "★" : "☆";
      salva_e_ridisegna();
    });
    f.querySelector("#malattie-ortaggio").addEventListener("click", () => apriDiagnosi({ ortaggioId: id }));
    f.querySelector("#aggiungi").addEventListener("click", () => {
      const ora = oggi();
      const inSem = finestreTra(o, "sem", ora, ora).length && !finestreTra(o, "dir", ora, ora).length && !finestreTra(o, "tra", ora, ora).length;
      moduloImpianto({ ortaggioId: id, aiuolaId: inSem ? "semenzaio" : undefined });
    });
  });
}

// -----------------------------------------------------------------------------
// Meteo
// -----------------------------------------------------------------------------
const ICONE_METEO = (c) => (c === 0 ? "☀️" : c <= 2 ? "🌤️" : c === 3 ? "☁️" : c <= 48 ? "🌫️" : c <= 57 ? "🌦️"
  : c <= 67 ? "🌧️" : c <= 77 ? "🌨️" : c <= 82 ? "🌧️" : c <= 86 ? "🌨️" : "⛈️");

async function aggiornaMeteo(forza = false) {
  const { lat, lon, altitudine } = S.impostazioni;
  if (lat == null) return null;
  const m = S.meteo;
  if (!forza && m && m.lat === lat && m.lon === lon && Date.now() - m.quando < 2 * 3600 * 1000) return m;
  const q = new URLSearchParams({
    latitude: lat, longitude: lon, timezone: "Europe/Rome", forecast_days: "7",
    daily: "weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max",
  });
  if (altitudine != null) q.set("elevation", altitudine);
  const dati = await scaricaJSON("https://api.open-meteo.com/v1/forecast?" + q);
  S.meteo = { quando: Date.now(), lat, lon, giorni: dati.daily };
  salva();
  return S.meteo;
}

function htmlMeteo(m) {
  const g = m.giorni;
  // Colture sotto una miniserra in PVC trasparente: col sole vanno arieggiate.
  const sottoTelo = [...new Set(S.impianti.filter((i) => !i.finito && i.protezione === "tunnelTelo" && coltivabile(aiuola(i.aiuolaId)))
    .map((i) => PER_ID[i.ortaggioId]?.nome.toLowerCase()).filter(Boolean))];
  // Agrumi in vaso non ancora al riparo (o già riportati fuori): avviso col freddo.
  const sa = agrumiNellOrto().length ? statoAgrumi() : null;
  const agrumiFuori = Boolean(sa && (!sa.riparo || sa.uscita));
  let avvisoAgrumi = false;
  let celle = "";
  const avvisi = [];
  let pioggia = 0;
  g.time.forEach((t, k) => {
    const d = daISO(t);
    const min = g.temperature_2m_min[k], max = g.temperature_2m_max[k];
    const mm = g.precipitation_sum[k] ?? 0;
    pioggia += mm;
    const freddo = min <= SOGLIA_BRINATA;
    if (freddo) avvisi.push(`<div class="pericolo">🥶 ${k === 0 ? "Oggi" : GIORNI[d.getDay()] + " " + d.getDate()}: minima ${Math.round(min)} °C, rischio brinata. Copri le piantine con il tessuto non tessuto.</div>`);
    if (agrumiFuori && min <= 4 && !avvisoAgrumi) {
      avvisoAgrumi = true;
      avvisi.push(`<div class="pericolo">🍋 ${k === 0 ? "Oggi" : GIORNI[d.getDay()] + " " + d.getDate()}: minima ${Math.round(min)} °C. Metti al riparo gli agrumi in vaso o coprili con il tessuto non tessuto.</div>`);
    }
    if (k <= 1 && max >= 13 && sottoTelo.length) avvisi.push(`<div class="avviso">⛺ ${k === 0 ? "Oggi" : "Domani"} massima ${Math.round(max)} °C: nelle ore di sole apri le testate delle miniserre in PVC (${esc(sottoTelo.join(", "))}) e richiudi nel pomeriggio.</div>`);
    if (max >= 32) avvisi.push(`<div class="avviso">🔥 ${GIORNI[d.getDay()]} ${d.getDate()}: massima ${Math.round(max)} °C. Annaffia la sera e ombreggia le insalate.</div>`);
    celle += `<div class="giorno ${freddo ? "freddo" : ""}">
      <div>${k === 0 ? "oggi" : GIORNI[d.getDay()]}</div>
      <div class="icona">${ICONE_METEO(g.weathercode[k])}</div>
      <div class="max">${Math.round(max)}°</div>
      <div class="min ${freddo ? "freddo" : ""}">${Math.round(min)}°</div>
      <div class="tenue">${mm >= 0.5 ? Math.round(mm) + " mm" : ""}</div>
    </div>`;
  });
  const primi3 = g.precipitation_sum.slice(0, 3).reduce((a, b) => a + (b ?? 0), 0);
  if (primi3 >= 10) avvisi.push(`<div class="bene">🌧️ Nei prossimi 3 giorni sono previsti ${Math.round(primi3)} mm di pioggia: puoi saltare le annaffiature${sottoTelo.length || S.aiuole.some((a) => a.copertura === "serra" && coltivabile(a)) ? " (non in serra e sotto le miniserre in PVC, dove la pioggia non arriva)" : ""}.</div>`);
  else if (pioggia < 3 && g.temperature_2m_max.slice(0, 3).some((x) => x >= 22)) avvisi.push(`<div class="avviso">💧 Settimana asciutta: ricordati di annaffiare.</div>`);
  const agg = new Date(m.quando);
  return `<div class="meteo">${celle}</div>${avvisi.join("")}
    <p class="tenue piccolo">Previsioni Open-Meteo, aggiornate alle ${agg.getHours()}:${String(agg.getMinutes()).padStart(2, "0")}.</p>`;
}

// -----------------------------------------------------------------------------
// Vista: Oggi
// -----------------------------------------------------------------------------
// Attività segnate nel diario con una data da oggi in poi (annotazioni e colture), entro "giorni".
// Agrumi in vaso (famiglia rutacee) nell'orto: in autunno, da 3 settimane prima
// della prima brinata, «mettili al riparo» finché non tocchi ✅ Fatto (evento
// lavoro con agrumi: "riparo"); in primavera, dopo l'ultima brinata, «riportali
// fuori» (agrumi: "fuori"). Le voci vanno in «Da fare» di Oggi.
function agrumiNellOrto() {
  return S.impianti.filter((i) => !i.finito && PER_ID[i.ortaggioId]?.fam === "rutacee" && !aiuola(i.aiuolaId)?.semenzaio);
}
function statoAgrumi() {
  const ora = oggi(), imp = S.impostazioni;
  const y = ora.getMonth() >= 6 ? ora.getFullYear() : ora.getFullYear() - 1; // inverno che comincia nell'anno y
  const inizio = piuGiorni(daISO(`${y}-${imp.primaBrinata || BASE_PRIMA_BRINATA}`), -21);
  const fuori = daISO(`${y + 1}-${imp.ultimaBrinata || "04-20"}`);
  const ev = (tipo) => S.eventi.filter((e) => e.agrumi === tipo && e.data >= aISO(inizio)).sort((p, q) => q.data.localeCompare(p.data))[0];
  const riparo = ev("riparo"), uscita = ev("fuori");
  return { ora, y, inizio, fuori, riparo, uscita };
}
function promemoriaAgrumi() {
  const agrumi = agrumiNellOrto();
  if (!agrumi.length) return [];
  const { ora, y, inizio, fuori, riparo, uscita } = statoAgrumi();
  const nomi = [...new Set(agrumi.map((i) => PER_ID[i.ortaggioId].nome.split(" (")[0].toLowerCase()))].join(", ");
  const dove = [...new Set(agrumi.map((i) => nomeAiuolaId(i.aiuolaId)))].join(", ");
  if (!riparo && ora >= inizio && ora <= daISO(`${y + 1}-03-31`)) return [{ data: ora, agrumi: "riparo", ico: "🍋", dove,
    titolo: `Metti al riparo gli agrumi in vaso (${nomi})`,
    testo: "Quando di notte si scende sotto i 3–5 °C: in serra fredda, veranda o scale luminose (5–12 °C, non in casa al caldo). Se restano fuori, coprili con il tessuto non tessuto (anche due strati) e avvolgi il vaso. Il limone è il più delicato, il kumquat il più robusto." }];
  if (riparo && !uscita && ora >= fuori && ora <= daISO(`${y + 1}-06-30`)) return [{ data: ora, agrumi: "fuori", ico: "🍋", dove,
    titolo: `Riporta fuori gli agrumi (${nomi})`,
    testo: "Le gelate sono finite: riportali all'aperto, i primi giorni all'ombra, poi al sole. È il momento del rinvaso (ogni 2–3 anni) e del concime per agrumi." }];
  return [];
}
// Vasi con la stessa coltura («Rinnova i vasi con la stessa coltura», in «Da fare»).
// Fragole: rinnovo di terra e piante ogni anno (in piena terra ogni 3 anni);
// rifiorenti («4 stagioni», «rifiorente») dal 15 febbraio al 15 aprile, prima
// che riprendano a vegetare; le altre dal 10 agosto al 30 settembre.
// Altri ortaggi in un'aiuola con le caselle a vasi (basilico, peperoncino…): se
// c'erano l'anno scorso (o sono ancora lì), da 3 settimane prima dell'inizio
// del trapianto a un mese dopo: terra da rinnovare, o vasi da scambiare con
// un'altra famiglia. ✅ Fatto = evento lavoro con vasi: <ortaggio> e l'aiuola.
// Concime per vaso: pollina circa 3 g per litro di terra (stallatico il doppio);
// litri stimati dalle misure del vaso, se ci sono (profondità ≈ 0.85 × lato).
function concimeVaso(a) {
  const L = Number(a?.vasoL) || 0, P = Number(a?.vasoP) || L;
  const litri = L ? Math.round((formaVasiCaselle(a) === "tondo" ? Math.PI * (L / 2) ** 2 : L * P) * Math.min(L, P) * 0.85 * 1000) : 0;
  return litri ? `pollina pellettata (Fruttorto) circa ${Math.round(litri * 3 / 5) * 5 || 5} g per vaso (vaso da circa ${litri} litri: 3 g per litro), oppure stallatico pellettato il doppio`
    : "pollina pellettata (Fruttorto) circa 3 g per litro di terra (una manciata, 30 g, per un vaso da 10 litri), oppure stallatico pellettato il doppio";
}
const RIFIORENTE = /4 stagioni|quattro stagioni|rifior/i;
function finestraFragole(i) {
  const ora = oggi(), y = ora.getFullYear();
  return RIFIORENTE.test(i.varieta || "") ? { da: daISO(`${y}-02-15`), a: daISO(`${y}-04-15`), quando: "a fine inverno, prima che riprendano a vegetare" }
    : { da: daISO(`${y}-08-10`), a: daISO(`${y}-09-30`), quando: "dopo la raccolta, entro settembre, così radicano prima dell'inverno" };
}
const fattoVasi = (aiuolaId, ortaggioId, daData) => S.eventi.some((e) => e.vasi === ortaggioId && e.aiuolaId === aiuolaId && e.data >= aISO(daData));
function promemoriaVasi() {
  const ora = oggi(), y = ora.getFullYear(), voci = [];
  const titolo = (o) => `Rinnova i vasi con la stessa coltura · ${o.nome.split(" (")[0].toLowerCase()}`;
  // Fragole
  for (const i of S.impianti) {
    if (i.finito || i.ortaggioId !== "fragola" || aiuola(i.aiuolaId)?.semenzaio) continue;
    const a = aiuola(i.aiuolaId), vasi = Boolean(formaVasiCaselle(a));
    const f = finestraFragole(i);
    if (ora < piuGiorni(f.da, -7) || ora > f.a || daISO(i.data) > piuGiorni(f.da, -30)) continue;
    if (!vasi) { // piena terra: ogni 3 anni
      const anni = y - daISO(i.data).getFullYear();
      const ultimo = S.eventi.filter((e) => e.vasi === "fragola" && e.aiuolaId === i.aiuolaId).map((e) => e.data).sort().pop();
      if (anni < 3 || (ultimo && y - daISO(ultimo).getFullYear() < 3)) continue;
    }
    if (fattoVasi(i.aiuolaId, "fragola", piuGiorni(f.da, -7)) || voci.some((v) => v.aiuolaId === i.aiuolaId && v.vasi === "fragola")) continue;
    const nv = i.celle?.length || 0, n = Number(i.quantita) || 0;
    const perVaso = nv && n ? Math.round(n / nv) : 0;
    const testo = vasi
      ? `${f.quando[0].toUpperCase() + f.quando.slice(1)}. 1) Togli le piante dai vasi${nv ? ` (${nv})` : ""} e tienile all'ombra con le radici coperte. 2) Svuota tutta la terra in un mucchio e togli radici vecchie e sassi. 3) Aggiungi circa 1 parte di compost maturo ogni 3–4 di terra (20–25%) e il concime: ${concimeVaso(a)}; mescola bene. 4) Riempi i vasi, bagna e stendi il telo di pacciamatura con i fori${perVaso ? ` (${perVaso} per vaso)` : ""}. 5) Rimetti le piantine migliori: giovani, con il cuore verde e radici chiare; scarta quelle con il colletto legnoso e scuro, di 3 anni o più. Taglia le foglie secche, non interrare il cuore. 6) Annaffia.${n ? ` Ne servono ${n}: compra le mancanti (o usa gli stoloni radicati dell'estate).` : ""}`
      : `${f.quando[0].toUpperCase() + f.quando.slice(1)}. Dopo 3 anni le piante producono poco: rifai l'impianto in un'altra aiuola (non dopo pomodori o patate) con gli stoloni radicati o piante nuove, e interra letame maturo o compost.`;
    voci.push({ data: ora, vasi: "fragola", aiuolaId: i.aiuolaId, ico: "🍓", dove: nomeAiuolaId(i.aiuolaId),
      titolo: vasi ? titolo(PER_ID.fragola) : "Rinnova l'impianto di fragole", testo });
  }
  // Altri ortaggi in vaso: cosa c'era l'anno scorso (o c'è ancora) in ogni aiuola a vasi
  const inVaso = S.impianti.filter((i) => i.ortaggioId !== "fragola" && formaVasiCaselle(aiuola(i.aiuolaId)) && !aiuola(i.aiuolaId)?.semenzaio
    && PER_ID[i.ortaggioId] && !PERENNI.has(i.ortaggioId) && (i.data.startsWith(String(y - 1)) || (!i.finito && i.data < `${y}`)));
  const famInVaso = new Map(inVaso.map((i) => [i.ortaggioId, PER_ID[i.ortaggioId]]));
  const gruppi = new Map();
  for (const i of inVaso) { const k = `${i.aiuolaId}|${i.ortaggioId}`; if (!gruppi.has(k)) gruppi.set(k, []); gruppi.get(k).push(i); }
  for (const [k, imps] of gruppi) {
    const [aiuolaId, id] = k.split("|"), o = PER_ID[id];
    const w = [...finestreAnno(o, "tra", y), ...finestreAnno(o, "dir", y)].sort((p, q) => p.inizio - q.inizio)[0];
    if (!w || ora < piuGiorni(w.inizio, -21) || ora > piuGiorni(w.inizio, 30)) continue;
    if (fattoVasi(aiuolaId, id, piuGiorni(w.inizio, -21))) continue;
    // Già rimesso quest'anno in quei vasi? Allora non serve più ricordarlo.
    if (S.impianti.some((i) => i.ortaggioId === id && i.aiuolaId === aiuolaId && i.data.startsWith(String(y)) && daISO(i.data) <= ora)) continue;
    const celle = new Set(imps.flatMap((i) => i.celle || []));
    const vivo = imps.some((i) => !i.finito);
    const altri = [...famInVaso.values()].filter((x) => x.fam !== o.fam).map((x) => x.nome.split(" (")[0].toLowerCase());
    const testo = `Prima di rimettere ${o.nome.toLowerCase()} negli stessi vasi${celle.size ? ` (${celle.size})` : ""}: svuota la terra (almeno la metà di sopra, meglio tutta), togli le radici vecchie, mescola 1 parte di compost maturo ogni 3–4 di terra e ${concimeVaso(aiuola(aiuolaId))}, riempi e bagna. La stessa coltura nello stesso vaso va bene se rinnovi la terra.`
      + (altri.length ? ` Se vuoi, scambia qualche vaso con ${altri.join(", ")} (un'altra famiglia): nei vasi scambiati basta rimescolare la terra con un po' di compost; quelli che restano con la stessa coltura vanno rinnovati.` : "")
      + (vivo ? ` Se ${o.nome.split(" (")[0].toLowerCase()} ha passato l'inverno, rinvasalo con terra nuova e accorcia i rami di un terzo.` : "");
    voci.push({ data: ora, vasi: id, aiuolaId, ico: icona(o), dove: nomeAiuolaId(aiuolaId), titolo: titolo(o), testo });
  }
  return voci;
}
function attivitaInProgramma(giorni) {
  const ora = oggi(), fino = piuGiorni(ora, giorni);
  const voci = [];
  for (const e of S.eventi) {
    const d = daISO(e.data);
    if (d < ora || d > fino) continue;
    const imp = S.impianti.find((i) => i.id === e.impiantoId);
    voci.push({
      data: d, tipo: "ev", id: e.id,
      titolo: `${TIPI_EVENTO[e.tipo] ?? e.tipo}${imp ? ` · ${PER_ID[imp.ortaggioId]?.nome ?? ""}` : ""}`,
      dove: e.aiuolaId && aiuola(e.aiuolaId) ? nomeAiuolaId(e.aiuolaId) : "", testo: e.testo || "",
    });
  }
  for (const i of S.impianti) {
    const d = daISO(i.data);
    if (i.finito || d < ora || d > fino) continue;
    const o = PER_ID[i.ortaggioId];
    voci.push({
      data: d, tipo: "imp", id: i.id,
      titolo: `${MODI[i.modo] ?? ""} · ${o?.nome ?? ""}`, ico: icona(o),
      dove: nomeAiuolaId(i.aiuolaId), testo: i.varieta || "",
    });
  }
  return voci.sort((a, b) => a.data - b.data);
}
function quandoTesto(d) {
  const n = giorniTra(oggi(), d);
  return n === 0 ? "oggi" : n === 1 ? "domani" : `tra ${n} giorni, ${fmt(d)}`;
}

function vistaOggi() {
  const ora = oggi();
  const fino = piuGiorni(ora, ORIZZONTE);
  const imp = S.impostazioni;
  const lista = imp.soloPreferiti && imp.preferiti.length
    ? elencoOrtaggi().filter((o) => preferito(o.id)) : elencoOrtaggi();

  const blocchi = ["sem", "dir", "tra"].map((f) => {
    const voci = [];
    for (const o of lista) {
      const fin = finestreTra(o, f, ora, fino);
      if (!fin.length) continue;
      const w = fin[0];
      const quando = w.inizio > ora ? `dal ${fmt(w.inizio)}` : `fino al ${fmt(w.fine)}`;
      voci.push(`<button class="chip" data-ortaggio="${o.id}">${preferito(o.id) ? "★ " : ""}${icona(o)} ${esc(o.nome)} <span class="tenue">${quando}</span></button>`);
    }
    if (!voci.length) return "";
    return `<h3>${FASI[f].nome}</h3><div>${voci.join("")}</div>`;
  }).join("");

  // Prossimi passi delle colture dell'orto
  const passi = [];
  for (const i of impiantiAttivi()) {
    for (const s of stimeImpianto(i)) {
      const dd = giorniTra(ora, s.data);
      if (dd >= -10 && dd <= ORIZZONTE) passi.push({ i, s, dd });
    }
  }
  passi.sort((a, b) => a.s.data - b.s.data);
  const htmlPassi = passi.length ? `<ul class="elenco">${passi.map(({ i, s, dd }) => `
    <li><div class="riga">
      <span>${icona(PER_ID[i.ortaggioId])} <b>${esc(s.testo)}</b> <span class="tenue">· ${esc(nomeAiuolaId(i.aiuolaId))}</span><br>
      <span class="tenue piccolo">${dd < 0 ? `previsto ${-dd} giorni fa` : dd === 0 ? "previsto oggi" : `verso il ${fmt(s.data)}`} (stima)</span></span>
      <span>
        ${s.tipo === "tra" ? `<button class="piccolo" data-trapianta="${i.id}">Trapianta</button>` : `<button class="piccolo" data-raccolto="${i.id}">Raccolto</button>`}
        <a class="bottone secondario piccolo" style="min-height:34px;padding:4px 10px" target="_blank" rel="noopener" href="${esc(linkGoogleCalendar(s.testo, s.data, "Dal diario dell'orto"))}" title="Aggiungi al calendario">📅</a>
      </span>
    </div></li>`).join("")}</ul>` : `<p class="tenue">Nessun trapianto o raccolta previsti nelle prossime 3 settimane. Le colture si aggiungono nella scheda Orto.</p>`;

  const meteo = imp.lat == null
    ? `<p class="tenue">Imposta la posizione dell'orto nella scheda <a href="#luogo">Luogo</a> per vedere le previsioni e il rischio di brinate.</p>`
    : `<div id="box-meteo"><p class="tenue">Carico le previsioni…</p></div>`;

  const programma = [...promemoriaAgrumi(), ...promemoriaVasi(), ...attivitaInProgramma(ANTICIPO_PROMEMORIA)];
  const htmlProgramma = programma.length ? `<section class="carta promemoria">
      <h2 style="margin-top:0">🔔 Da fare nei prossimi ${ANTICIPO_PROMEMORIA} giorni</h2>
      <ul class="elenco">${programma.map((v) => `<li><div class="riga">
        <span><b>${v.ico ? v.ico + " " : ""}${esc(v.titolo)}</b> <span class="tenue">· ${quandoTesto(v.data)}</span>
          ${v.dove || v.testo ? `<br><span class="tenue piccolo">${esc([v.dove, v.testo].filter(Boolean).join(" · "))}</span>` : ""}</span>
        <span style="white-space:nowrap">
          ${v.agrumi ? `<button class="piccolo" data-agrumi="${v.agrumi}">✅ Fatto</button>` : v.vasi ? `<button class="piccolo" data-vasi="${v.vasi}" data-aiuola="${v.aiuolaId}">✅ Fatto</button>` : `<button class="piccolo secondario" ${v.tipo === "ev" ? `data-modifica-ev="${v.id}"` : `data-modifica-imp="${v.id}"`}>✏️</button>`}
          <a class="bottone secondario piccolo" style="min-height:34px;padding:4px 10px" target="_blank" rel="noopener" href="${esc(linkGoogleCalendar(v.titolo, v.data, [v.dove, v.testo].filter(Boolean).join(" · ")))}" title="Aggiungi al calendario">📅</a>
        </span></div></li>`).join("")}</ul>
    </section>` : "";

  return `${htmlPromemoriaCopia()}${htmlProgramma}
    ${htmlInvitoPiano(false)}
    <section class="carta">
      <h2 style="margin-top:0">${MESI_LUNGHI[ora.getMonth()][0].toUpperCase() + MESI_LUNGHI[ora.getMonth()].slice(1)}: lavori del mese</h2>
      <p style="margin:0">${esc(LAVORI_MESE[ora.getMonth()])}</p>
    </section>
    <section class="carta"><h2 style="margin-top:0">Meteo dei prossimi 7 giorni</h2>${meteo}</section>
    <section class="carta">
      <h2 style="margin-top:0">Dal tuo orto</h2>${htmlPassi}
      ${(() => {
        const libere = aiuoleOrdinate().filter((a) => !a.capanno && aiuolaVuota(a) && !ultimaConcimazione(a));
        return libere.length ? `<p style="margin-bottom:4px">🧺 <b>Aiuole libere da preparare</b> (togliere la pacciamatura, concimare):</p>
          <div>${libere.map((a) => `<a class="chip" href="#orto/${a.id}">${esc(nomeAiuola(a))}</a>`).join("")}</div>` : "";
      })()}
    </section>
    <section class="carta">
      <h2 style="margin-top:0">Si può fare nelle prossime 3 settimane</h2>
      ${imp.preferiti.length ? `<div class="campo-check"><input type="checkbox" id="solo-pref" ${imp.soloPreferiti ? "checked" : ""}><label for="solo-pref" style="margin:0">Solo i miei ortaggi (★)</label></div>`
        : `<p class="tenue piccolo">Tocca un ortaggio e premi ☆ per segnarlo tra i tuoi: potrai vedere solo quelli.</p>`}
      ${blocchi || `<p class="tenue">Niente da seminare o trapiantare in questo periodo.</p>`}
    </section>`;
}

function dopoOggi() {
  const box = el("box-meteo");
  if (box) {
    if (S.meteo && S.meteo.lat === S.impostazioni.lat) box.innerHTML = htmlMeteo(S.meteo);
    aggiornaMeteo().then((m) => { if (m && el("box-meteo")) el("box-meteo").innerHTML = htmlMeteo(m); })
      .catch((e) => {
        if (el("box-meteo") && !S.meteo) el("box-meteo").innerHTML = `<p class="avviso">Previsioni non disponibili (${esc(e.message)}). Serve la connessione.</p>`;
      });
  }
  el("solo-pref")?.addEventListener("change", (e) => {
    S.impostazioni.soloPreferiti = e.target.checked;
    salva_e_ridisegna();
  });
}

// -----------------------------------------------------------------------------
// Vista: Calendario
// -----------------------------------------------------------------------------
// Tabella dei vicini: per ogni ortaggio del calendario i buoni e i cattivi vicini
// (AMICI e NEMICI in data.js, consociazioni della tradizione). Sul telefono ogni
// riga diventa una scheda; il campo in alto filtra le righe.
function vistaVicini() {
  const nomi = (l) => l.map((x) => PER_ID[x]).filter(Boolean).sort((p, q) => p.nome.localeCompare(q.nome, "it"))
    .map((o) => `<span class="chip">${icona(o)} ${esc(o.nome)}</span>`).join(" ") || `<span class="tenue">—</span>`;
  const righe = [...ORTAGGI].sort((p, q) => p.nome.localeCompare(q.nome, "it")).map((o) => {
    const amici = amiciDi(o.id), nemici = nemiciDi(o.id);
    const cerca = [o.nome, ...amici, ...nemici].map((x) => (PER_ID[x]?.nome ?? x).toLowerCase()).join(" ");
    return `<tr data-cerca="${esc(cerca)}">
      <td data-titolo="Ortaggio"><button class="voce-storico" data-ortaggio="${o.id}"><b>${icona(o)} ${esc(o.nome)}</b></button></td>
      <td data-titolo="🤝 Buoni vicini">${nomi(amici)}</td>
      <td data-titolo="⚠️ Cattivi vicini">${nomi(nemici)}</td></tr>`;
  }).join("");
  return `<p><a href="#calendario">← Calendario</a></p>
    <h2>🤝 Buoni e cattivi vicini</h2>
    <p class="tenue piccolo">Le consociazioni della tradizione degli orticoltori: quali ortaggi stanno bene vicini (si aiutano contro parassiti e malattie, o usano il terreno in modo diverso) e quali è meglio tenere lontani. Sono consigli, non regole: molte coppie vengono dall'esperienza più che dagli studi. L'app li usa negli avvisi ⚠️ e 🤝 quando semini e nel piano dell'anno nuovo. Tocca un ortaggio per la sua scheda.</p>
    <input type="search" id="cerca-vicini" placeholder="🔎 Cerca un ortaggio (es. pomodoro)" style="width:100%;margin:6px 0 10px">
    <table class="vicini"><thead><tr><th>Ortaggio</th><th>🤝 Buoni vicini</th><th>⚠️ Cattivi vicini</th></tr></thead><tbody>${righe}</tbody></table>
    <p class="tenue piccolo">Gli agrumi, l'alloro e la canapa non hanno consociazioni note; il lattughino ha gli stessi vicini della lattuga.</p>`;
}

// Cosa mettere dopo (rotazione): stesse regole del piano (piano.js, punteggio):
// niente stessa famiglia per ANNI_ROTAZIONE anni; dopo un ortaggio esigente uno
// che chiede poco o una leguminosa; dopo le leguminose gli esigenti.
// DOPO_EVITA: famiglie diverse che hanno le stesse malattie del terreno.
const DOPO_EVITA = [
  { a: "fam:solanacee", b: "fragola", perche: "verticillosi" },
];
function inDopo(x, o) { return x.startsWith("fam:") ? o.fam === x.slice(4) : o.id === x; }
function dopoDi(id) {
  const o = PER_ID[id];
  const annuali = ORTAGGI.filter((x) => x.id !== id && !PERENNI.has(x.id) && x.fam !== "rutacee" && x.id !== "canapa");
  const malattia = (x) => DOPO_EVITA.find((r) => (inDopo(r.a, o) && inDopo(r.b, x)) || (inDopo(r.b, o) && inDopo(r.a, x)));
  const nellAiuola = (x) => !["rutacee", "lauracee"].includes(x.fam) && (!PERENNI.has(x.id) || ["fragola", "asparago", "carciofo"].includes(x.id));
  const evita = ORTAGGI.filter((x) => x.id !== id && nellAiuola(x) && (x.fam === o.fam || malattia(x)));
  const ok = (x) => x.fam !== o.fam && !malattia(x);
  let ideali, perche;
  if (o.fam === "leguminose") {
    ideali = annuali.filter((x) => ok(x) && x.esig === "alta");
    perche = "Lascia il terreno ricco di azoto: ideale per un ortaggio esigente.";
  } else if (o.esig === "alta") {
    ideali = annuali.filter((x) => ok(x) && (x.esig === "bassa" || x.fam === "leguminose"));
    perche = "Ha consumato molto: ora un ortaggio che chiede poco o una leguminosa, che arricchisce il terreno.";
  } else if (o.esig === "media") {
    ideali = annuali.filter((x) => ok(x) && (x.fam === "leguminose" || x.esig === "media"));
    perche = "Ha consumato il giusto: una leguminosa o un ortaggio di esigenza media; per uno esigente concima.";
  } else {
    ideali = annuali.filter((x) => ok(x) && x.esig === "alta");
    perche = "Ha consumato poco: il terreno è pronto per un ortaggio esigente (con compost o letame maturo).";
  }
  return { ideali, evita, perche, malattia, nellAiuola };
}

// Finestra di una coltura degli anni passati (pagina dell'aiuola): cosa mettere
// dopo (chip = nuova coltura qui), da evitare fino a quando, vicini, modifica.
function finestraStorico(i) {
  const o = PER_ID[i.ortaggioId]; if (!o) return moduloImpianto({ impianto: i });
  const a = aiuola(i.aiuolaId), anno = Number(i.data.slice(0, 4));
  const { ideali, evita, perche } = dopoDi(o.id);
  const vasi = Boolean(formaVasiCaselle(a));
  const chip = (x, nuovo) => nuovo ? `<button type="button" class="chip" data-nuova-qui="${x.id}">＋ ${icona(x)} ${esc(x.nome.split(" (")[0])}</button>` : `<span class="chip">${icona(x)} ${esc(x.nome.split(" (")[0])}</span>`;
  const lista = (l, nuovo) => l.length ? [...l].sort((p, q) => p.nome.localeCompare(q.nome, "it")).map((x) => chip(x, nuovo)).join(" ") : `<span class="tenue">—</span>`;
  const amici = amiciDi(o.id).map((x) => PER_ID[x]).filter(Boolean), nemici = nemiciDi(o.id).map((x) => PER_ID[x]).filter(Boolean);
  const fino = anno + ANNI_ROTAZIONE;
  apriFinestra(`
    <h2>${icona(o)} ${esc(o.nome)} · ${anno}</h2>
    <p class="tenue">${esc(nomeAiuolaId(i.aiuolaId))} · ${esc(FAMIGLIE[o.fam])}${i.varieta ? ` · ${esc(i.varieta)}` : ""}</p>
    ${a ? htmlComEra(a, [i]) : ""}
    ${PERENNI.has(o.id) || a?.fissa === o.id ? `<p class="tenue piccolo">Coltura che resta nello stesso posto: la rotazione vale quando la togli.</p>` : ""}
    <h3>🔄 Cosa mettere dopo, qui</h3>
    <p class="piccolo">${esc(perche)} Tocca per una nuova coltura in quest'aiuola.</p>
    <p>${lista(ideali, !a?.semenzaio)}</p>
    <p class="piccolo"><b>⚠️ Da evitare qui fino al ${fino}</b>${vasi ? " (o rinnova la terra dei vasi)" : ""}: stessa famiglia${evita.some((x) => x.fam !== o.fam) ? " e chi ha le stesse malattie del terreno" : ""}.</p>
    <p>${lista(evita, false)}</p>
    <h3>🤝 Vicini</h3>
    <p class="piccolo"><b>Buoni:</b></p><p>${lista(amici, false)}</p>
    <p class="piccolo"><b>Cattivi:</b></p><p>${lista(nemici, false)}</p>
    <p class="tenue piccolo"><a href="#dopo" data-chiudi>Tabella completa: cosa mettere dopo</a> · <a href="#vicini" data-chiudi>buoni e cattivi vicini</a></p>
    <div class="riga-bottoni">
      <button type="button" class="secondario" id="storico-modifica">✏️ Modifica o elimina</button>
      <button type="button" class="secondario" id="storico-scheda">📖 Scheda</button>
      <button type="button" data-chiudi>Chiudi</button>
    </div>`, (f) => {
    f.querySelector("#storico-modifica").addEventListener("click", () => moduloImpianto({ impianto: i }));
    f.querySelector("#storico-scheda").addEventListener("click", () => schedaOrtaggio(o.id));
    f.querySelectorAll("[data-nuova-qui]").forEach((b) => b.addEventListener("click", () => moduloImpianto({ aiuolaId: i.aiuolaId, ortaggioId: b.dataset.nuovaQui })));
  });
}

function vistaDopo() {
  const chip = (x) => `<span class="chip">${icona(x)} ${esc(x.nome)}</span>`;
  const nomi = (l) => [...l].sort((p, q) => p.nome.localeCompare(q.nome, "it")).map(chip).join(" ") || `<span class="tenue">—</span>`;
  const elenco = ORTAGGI.filter((o) => dopoDi(o.id).nellAiuola(o));
  const righe = [...elenco].sort((p, q) => p.nome.localeCompare(q.nome, "it")).map((o) => {
    const { ideali, evita, perche, malattia } = dopoDi(o.id);
    const conMal = evita.filter((x) => malattia(x));
    const cerca = [o.nome, ...ideali.map((x) => x.nome), ...evita.map((x) => x.nome)].join(" ").toLowerCase();
    return `<tr data-cerca="${esc(cerca)}">
      <td data-titolo="Prima"><button class="voce-storico" data-ortaggio="${o.id}"><b>${icona(o)} ${esc(o.nome)}</b></button>
        <div class="tenue piccolo">${esc(FAMIGLIE[o.fam])}${PERENNI.has(o.id) ? " · perenne: vale per quando la togli" : ""}</div></td>
      <td data-titolo="🌱 Ideali dopo"><div class="piccolo tenue">${esc(perche)}</div>${nomi(ideali)}</td>
      <td data-titolo="⚠️ Da evitare per ${ANNI_ROTAZIONE} anni">${nomi(evita)}${conMal.length ? `<div class="piccolo tenue">${esc(conMal.map((x) => x.nome).join(", "))}: hanno la stessa malattia del terreno (${esc(malattia(conMal[0]).perche)}).</div>` : ""}</td></tr>`;
  }).join("");
  return `<p><a href="#calendario">← Calendario</a> · <a href="#vicini">🤝 Buoni e cattivi vicini</a></p>
    <h2>🔄 Cosa mettere dopo</h2>
    <p class="tenue piccolo">La rotazione: cosa mettere in un'aiuola la stagione o l'anno dopo, al posto di quello che c'era. Non è la stessa cosa dei buoni vicini (che crescono insieme, nello stesso momento). Due regole: <b>mai la stessa famiglia per ${ANNI_ROTAZIONE} anni</b> (ha gli stessi parassiti e le stesse malattie, che restano nel terreno), e <b>alternare</b> chi consuma molto con chi consuma poco o arricchisce il terreno (fagioli, piselli, fave). L'app usa queste regole negli avvisi 🔄 quando semini e nel piano dell'anno nuovo. Se in un'aiuola hai cambiato la terra (🪣) si riparte da zero.</p>
    <input type="search" id="cerca-dopo" placeholder="🔎 Cerca un ortaggio (es. pomodoro)" style="width:100%;margin:6px 0 10px">
    <table class="vicini"><thead><tr><th>Prima c'era</th><th>🌱 Ideali dopo</th><th>⚠️ Da evitare per ${ANNI_ROTAZIONE} anni</th></tr></thead><tbody>${righe}</tbody></table>
    <p class="tenue piccolo">Mancano gli agrumi, l'alloro e le aromatiche perenni, che restano anni nello stesso posto. Nella stessa stagione vale lo stesso: dopo l'aglio raccolto a giugno vanno bene cavoli, finocchi o insalate, non porri o cipolle.</p>`;
}

function vistaCalendario() {
  const ora = oggi();
  const anno = ora.getFullYear();
  const inizioAnno = new Date(anno, 0, 1, 12);
  const durata = giorniTra(inizioAnno, new Date(anno + 1, 0, 1, 12));
  const pos = (d) => Math.min(100, Math.max(0, (giorniTra(inizioAnno, d) / durata) * 100));

  const righe = elencoOrtaggi().map((o) => {
    let barre = "";
    for (const f of Object.keys(FASI)) {
      // Le finestre dell'anno e quelle dell'anno prima che scavalcano a gennaio.
      for (const w of [...finestreAnno(o, f, anno - 1), ...finestreAnno(o, f, anno)]) {
        if (w.fine < inizioAnno || w.inizio.getFullYear() > anno) continue;
        const a = pos(w.inizio < inizioAnno ? inizioAnno : w.inizio);
        const b = pos(w.fine);
        barre += `<div class="b ${f}" style="left:${a}%;width:${Math.max(0.8, b - a)}%"></div>`;
      }
    }
    return `<div class="cal-riga" data-ortaggio="${o.id}">
      <div class="nome">${preferito(o.id) ? "★ " : ""}${icona(o)} ${esc(o.nome)}</div>
      <div class="cal-barre">${barre}<div class="oggi" style="left:${pos(ora)}%"></div></div>
    </div>`;
  }).join("");

  return `
    <h2>Calendario ${anno}</h2>
    <p class="tenue piccolo">Calcolato per il tuo luogo: ultima brinata ${fmtMmdd(S.impostazioni.ultimaBrinata)}, prima brinata ${fmtMmdd(S.impostazioni.primaBrinata)}. Tocca un ortaggio per la scheda.</p>
    <p><a class="chip" href="#vicini">🤝 Tabella dei buoni e cattivi vicini</a> <a class="chip" href="#dopo">🔄 Cosa mettere dopo</a></p>
    <div class="legenda">
      <span><i style="background:var(--f-sem)"></i>Semenzaio</span>
      <span><i style="background:var(--f-dir)"></i>Semina a terra</span>
      <span><i style="background:var(--f-tra)"></i>Trapianto</span>
      <span><i style="background:var(--f-rac)"></i>Raccolta</span>
    </div>
    <div class="cal">
      <div class="cal-mesi"><div></div><div class="mesi">${MESI.map((m) => `<span>${m[0].toUpperCase()}</span>`).join("")}</div></div>
      ${righe}
    </div>`;
}

// -----------------------------------------------------------------------------
// Vista: Orto (aiuole)
// -----------------------------------------------------------------------------
// Anno della pianta dell'orto (selettore come nel Diario): null = adesso (colture
// in corso e in programma); "2027" = le colture di quell'anno: messe quell'anno,
// più quelle messe prima e ancora lì (perenni, colture che passano l'inverno).
let annoPianta = null;
// Colture già messe e non finite (senza quelle in programma).
function inCorso(aiuolaId) { const oggiISO = aISO(oggi()); return impiantiAttivi(aiuolaId).filter((i) => i.data <= oggiISO); }
function coltureAnno(aiuolaId, anno) {
  return S.impianti.filter((i) => i.aiuolaId === aiuolaId && i.modo !== "acq" && PER_ID[i.ortaggioId]
    && (i.data.startsWith(anno) || (i.data < anno && (i.finito ? (i.dataFine || "") >= anno : fineImpianto(i) >= new Date(Number(anno), 0, 1)))));
}
// Selettore dell'anno (pianta dell'orto e scheda aiuola: stesso anno).
function htmlSelettoreAnno() {
  return `<select id="anno-pianta" style="width:auto" aria-label="Anno">
    <option value="">Adesso (colture in corso)</option>
    ${anniPianta().map((y) => `<option value="${y}" ${y === annoPianta ? "selected" : ""}>${y}${y === String(oggi().getFullYear()) ? " (quest'anno)" : y === String(oggi().getFullYear() + 1) ? " (prossima stagione)" : ""}</option>`).join("")}
  </select>`;
}
// Come si vede un'aiuola in un anno (null = adesso, solo colture già messe):
// la coltura principale (nell'anno quella rimasta più a lungo, adesso l'ultima
// messa) dà scacchiera e pacciamatura; le caselle delle altre si riportano su
// quella; se in una casella si sono succedute più colture si vede la principale
// con quelle presenti nello stesso periodo.
function vistaScacchiera(a, anno) {
  const colture = anno ? coltureAnno(a.id, anno) : inCorso(a.id);
  const ia = anno && new Date(Number(anno), 0, 1), fa = anno && new Date(Number(anno), 11, 31);
  const fineCol = (i) => i.finito ? daISO(i.dataFine || i.data) : fineImpianto(i);
  const da = (i) => { const d = daISO(i.data); return d < ia ? ia : d; }, a_ = (i) => { const f = fineCol(i); return f > fa ? fa : f; };
  const durata = (i) => a_(i) - da(i);
  const l = colture.filter((i) => i.celle?.length || i.pacciamatura != null);
  const princ = (anno ? l.sort((x, y) => durata(y) - durata(x)) : l.sort((x, y) => y.data.localeCompare(x.data)))[0] || null;
  const g = princ?.griglia || grigliaAiuola(a);
  const manca = princ?.griglia ? new Set(princ.grigliaManca || []) : celleMancanti(a);
  const occ = {};
  for (const i of colture) for (const c of celleSu(i, g, a)) (occ[c] ??= []).push(i);
  if (anno) for (const c of Object.keys(occ)) {
    const lc = occ[c], p = [...lc].sort((x, y) => durata(y) - durata(x))[0];
    occ[c] = lc.filter((i) => i === p || (da(i) <= a_(p) && a_(i) >= da(p)));
  }
  return { colture, princ, g, manca, occ };
}
function anniPianta() {
  const anni = new Set([String(oggi().getFullYear()), String(oggi().getFullYear() + 1)]);
  for (const i of S.impianti) if (!aiuola(i.aiuolaId)?.semenzaio) anni.add(i.data.slice(0, 4));
  return [...anni].sort().reverse();
}
function vistaOrto(idAiuola) {
  if (idAiuola && aiuola(idAiuola)) return vistaAiuola(aiuola(idAiuola));
  const scelta = zonaScelta();
  const bottoni = zone().length > 1 ? `<div class="scelta-orto">${[["", "Tutti"], ...zone().map((z) => [z, z])].map(([z, t]) =>
    `<button class="chip${z === scelta ? " attiva" : ""}" data-zona-vista="${esc(z)}">${esc(t)}</button>`).join("")}</div>` : "";
  const carte = aiuoleOrdinate().filter((a) => a.semenzaio || !scelta || (a.zona || ZONA_PREDEFINITA) === scelta).map((a) => {
    if (a.capanno) return `<a class="carta" href="#orto/${a.id}" style="display:block;color:inherit;text-decoration:none">
      <div class="riga" style="display:flex;justify-content:space-between;gap:8px"><b>${esc(nomeAiuola(a))}</b>
      <span class="tenue piccolo">${esc([misureAiuola(a), tipoAiuola(a)].filter(Boolean).join(" · "))}</span></div></a>`;
    if (partiDi(a).length) return `<a class="carta" href="#orto/${a.id}" style="display:block;color:inherit;text-decoration:none">
      <div class="riga" style="display:flex;justify-content:space-between;gap:8px"><b>${iconaAiuola(a)} ${esc(nomeAiuola(a))}</b>
      <span class="tenue piccolo">${esc([misureAiuola(a), tipoAiuola(a)].filter(Boolean).join(" · "))}</span></div></a>`;
    const attivi = annoPianta ? coltureAnno(a.id, annoPianta) : inCorso(a.id);
    const programma = annoPianta ? [] : impiantiAttivi(a.id).filter((i) => !attivi.includes(i));
    const problemi = annoPianta ? 0 : attivi.reduce((n, i) => n + avvisiRotazione(a.id, i.ortaggioId, i.data, i.id, i.celle).length
      + avvisiVicini(a.id, i.ortaggioId, i.id, i.celle).cattivi.length, 0);
    return `<a class="carta" href="#orto/${a.id}" style="display:block;color:inherit;text-decoration:none${a.dentro ? ";margin-left:20px" : ""}">
      <div class="riga" style="display:flex;justify-content:space-between;gap:8px"><b>${iconaAiuola(a)} ${esc(nomeAiuola(a))}</b>
      <span class="tenue piccolo">${esc([misureAiuola(a), tipoAiuola(a)].filter(Boolean).join(" · "))}</span></div>
      <div>${attivi.length ? attivi.map((i) => `<span class="chip">${nomeOrtaggio(i.ortaggioId)}${i.celle?.length ? ` <span class="tenue">${esc(testoCelle(i))}</span>` : ""}</span>`).join("") : `<span class="tenue">vuota</span>`}${programma.length ? ` <span class="tenue piccolo">· 🔔 in programma: ${programma.map((i) => `${esc(PER_ID[i.ortaggioId]?.nome.split(" (")[0].toLowerCase() ?? "")} (${fmtAnno(daISO(i.data))})`).join(", ")}</span>` : ""}</div>
      ${problemi ? `<div class="avviso piccolo">⚠️ ${problemi} ${problemi === 1 ? "avviso" : "avvisi"} su rotazione o vicini</div>` : ""}
    </a>`;
  }).join("");
  return `
    <div class="riga" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <h2>${scelta ? esc(scelta) : "Le mie aiuole"}</h2>
      ${htmlSelettoreAnno()}
    </div>
    ${bottoni}
    ${annoPianta ? `<p class="tenue piccolo">🗓️ Le colture del <b>${annoPianta}</b>${annoPianta > String(oggi().getFullYear()) ? " (in programma: aggiungile con ＋ Nuova coltura con una data futura, o accetta il piano della stagione nuova)" : ""}. Ogni aiuola con le misure di quell'anno e con scacchiera e pacciamatura della sua coltura.</p>` : ""}
    ${htmlPianta(scelta)}
    ${S.aiuole.length <= 1 && !IN_PROVA ? htmlInvitoProva() : ""}
    ${S.aiuole.length <= 1 ? `<p class="tenue">Crea un'aiuola per ogni pezzo dell'orto: l'app ricorda cosa ci hai coltivato ogni anno e ti avvisa se ripeti la stessa famiglia (rotazione) o metti vicini ortaggi che non vanno d'accordo.</p>` : ""}
    ${carte}
    <div class="riga-bottoni">
      <button id="nuova-aiuola">＋ Nuova aiuola</button>
      <button class="secondario" id="piu-aiuole">＋ Più aiuole insieme</button>
      <button class="secondario" id="nuova-coltura">＋ Nuova coltura</button>
      <button class="secondario" id="diagnosi">🩺 Malattie e parassiti</button>
      ${htmlInvitoPiano(true)}
    </div>`;
}

// Pianta vista dall'alto: per ogni zona le aiuole affiancate da sinistra a
// destra in ordine di numero, in scala, con le colture in corso.
// perScelta: solo il disegno, dentro un modulo (le aiuole si toccano per sceglierle).
function htmlPianta(soloZona, perScelta = false) {
  // Colture da disegnare: adesso, o quelle dell'anno scelto (annoPianta).
  const anno = perScelta ? null : annoPianta;
  // Adesso: solo le colture già messe (le aiuole con solo colture in programma
  // risultano libere, da concimare); nei moduli anche quelle in programma.
  const coltureDi = (id) => anno ? coltureAnno(id, anno) : perScelta ? impiantiAttivi(id) : inCorso(id);
  // Scacchiera, caselle e pacciamatura: come si vedevano nell'anno (vistaScacchiera); nei moduli quelle dell'aiuola.
  const vista_ = (a) => vistaScacchiera(a, anno);
  const principale = (a) => perScelta ? null : vista_(a).princ;
  const grigliaVista = (a) => perScelta ? { g: grigliaAiuola(a), manca: celleMancanti(a) } : vista_(a);
  const occupazioneDi = (a) => perScelta ? occupazione(a.id) : vista_(a).occ;
  // Ogni aiuola come era nell'anno: misure di quell'anno e pacciamatura della coltura principale.
  const annoMisure = anno || String(oggi().getFullYear());
  const comeNellAnno = (a) => {
    const v = principale(a);
    return { ...a, ...misureAnno(a, annoMisure), pacciamatura: v?.pacciamatura ?? a.pacciamatura };
  };
  const blocchi = zone().filter((z) => !soloZona || z === soloZona).map((zona) => {
    const lista = aiuoleOrdinate().filter((a) => !a.semenzaio && !a.dentro && (a.zona || ZONA_PREDEFINITA) === zona).map(comeNellAnno);
    if (!lista.length) return "";
    const misurate = lista.filter((a) => a.larghezza && a.lunghezza && !a.capanno);
    const mediaL = misurate.length ? misurate.reduce((s, a) => s + a.larghezza, 0) / misurate.length : 1;
    const mediaH = misurate.length ? misurate.reduce((s, a) => s + a.lunghezza, 0) / misurate.length : 2;
    const corridoio = corridoioZona(zona);
    // Coordinate locali: x lungo la fila (aiuola 1 a sinistra), y dal fondo (0) verso il davanti.
    // Più file: 0 = principale, 1, 2… dietro (verso il fondo), -1, -2… davanti (verso di te).
    // "inizio" (metri dal bordo sinistro) mette l'aiuola in un punto preciso della sua fila.
    const file = [...new Set(lista.map(filaAiuola))].sort((m, n) => n - m); // dal fondo al davanti
    const dietro = file.length > 1;
    // extra(q): spazio in più sotto q (scritte fuori dalle aiuole piccole delle file in mezzo).
    const posiziona = (spazio, extra = () => 0) => {
      const fine = {};
      const righe = lista.map((a) => {
        const f = filaAiuola(a);
        const w = a.larghezza || mediaL, h = a.lunghezza || mediaH;
        const x = a.inizio != null && a.inizio !== "" ? Math.max(0, Number(a.inizio)) : (fine[f] || 0);
        fine[f] = x + w + corridoio;
        return { a, f, x, w, h, misurata: Boolean(a.larghezza && a.lunghezza) };
      });
      // Ogni aiuola va subito davanti a quelle della fila dietro che ha di fronte
      // (non sotto la più lunga di tutta la fila); se di fronte non c'è niente,
      // si allinea alla più corta della fila dietro.
      let prima = [];
      for (const f of file) {
        const questa = righe.filter((q) => q.f === f);
        const base = prima.length ? Math.min(...prima.map((p) => p.y + p.h + spazio + extra(p))) : 0;
        const fatte = righe.filter((q) => q.y != null);
        for (const q of questa) {
          const davanti = fatte.filter((p) => p.x < q.x + q.w - 0.01 && q.x < p.x + p.w - 0.01);
          q.y = davanti.length ? Math.max(...davanti.map((p) => p.y + p.h + spazio + extra(p))) : base;
        }
        prima = questa;
      }
      return righe;
    };
    let pezzi = posiziona(corridoio);
    const larghezzaTot = Math.max(...pezzi.map((q) => q.x + q.w));

    // Orientamento: la fila va nella direzione della bussola "direzione" (gradi).
    const or = orientamentoZona(zona);
    const T = (px, py) => [px * or.cos - py * or.s * or.sin, px * or.sin + py * or.s * or.cos];
    const angoli = (px, py, w, h) => [T(px, py), T(px + w, py), T(px + w, py + h), T(px, py + h)];
    let tutti = pezzi.flatMap((q) => angoli(q.x, q.y, q.w, q.h));
    const box0 = limiti(tutti);

    // Scala in pixel per metro: il disegno occupa la larghezza disponibile (circa 360 px
    // sul telefono, di più sul PC); testo tra 10 e 15 px, non più di un quarto dell'aiuola tipica.
    const disponibile = Math.max(340, (el("app")?.clientWidth || 400) - 70);
    // Una zona di soli vasi si può ingrandire di più: i vasi sono piccoli.
    const scalaMax = lista.every((a) => a.vaso || a.capanno) ? PX_PER_METRO * 3 : PX_PER_METRO;
    const scala = Math.min(scalaMax, disponibile / Math.max(box0.w, 0.5));
    const lati = pezzi.map((q) => Math.min(q.w, q.h)).sort((m, n) => m - n);
    const fs = Math.min(15 / scala, Math.max(10 / scala, lati[Math.floor(lati.length / 2)] / 4)); // testo in metri
    // Scritte: con una fila sola numero sopra e misure sotto; con più file la fila
    // in fondo le ha sopra, quella davanti sotto, quelle in mezzo dentro l'aiuola.
    // Le aiuole e i vasi delle file in mezzo troppo piccoli per contenerle le hanno
    // sotto, e la fila davanti si sposta per far posto.
    const doveScritte = (q) => {
      if (file.length === 1) return "solo";
      if (q.f === file[0]) return "sopra";
      if (q.f === file[file.length - 1]) return "sotto";
      return q.h < fs * 3 || q.w < fs * 3.2 ? "sotto" : "dentro";
    };
    const spazioSotto = (q) => q.f !== file[file.length - 1] && doveScritte(q) === "sotto"
      ? fs * (2.8 + (q.a.vaso && coltureDi(q.a.id).length ? 1.4 : 0)) : 0;
    if (pezzi.some(spazioSotto)) {
      pezzi = posiziona(corridoio, spazioSotto);
      tutti = pezzi.flatMap((q) => angoli(q.x, q.y, q.w, q.h));
    }
    const testo = (px, py, contenuto, classe, size) => {
      const [tx, ty] = T(px, py);
      return `<text class="${classe}" x="${tx}" y="${ty}" font-size="${size}" text-anchor="middle" dominant-baseline="central">${contenuto}</text>`;
    };
    // Icona di un ortaggio in un punto dell'aiuola (le coordinate ruotano con la zona).
    const iconaPianta = (px, py, o, lato) => { const [tx, ty] = T(px, py); return iconaSvg(o, tx, ty, lato); };
    const punti = (l) => l.map(([px, py]) => `${px},${py}`).join(" ");

    const etichette = [];
    const disegno = pezzi.map(({ a, f, x, y, w, h, misurata }) => {
      // Scritte: con una fila sola numero sopra e misure sotto; con più file la fila
      // in fondo le ha sopra, quella davanti sotto, quelle in mezzo dentro l'aiuola.
      // Così tra le file resta solo il vialetto vero.
      const dove = doveScritte({ f, w, h });
      const parti = partiDi(a).map(comeNellAnno);
      const problemi = !anno && [a, ...parti].some((b) => (b.capanno ? [] : coltureDi(b.id)).some((i) => avvisiRotazione(b.id, i.ortaggioId, i.data, i.id, i.celle).length
        || avvisiVicini(b.id, i.ortaggioId, i.id, i.celle).cattivi.length));
      const e = fs * 1.25; // lato di un'emoji
      const cx = x + w / 2;
      const tutte = (a.capanno ? [] : coltureDi(a.id)).map((i) => PER_ID[i.ortaggioId]);
      const posti = Math.max(1, Math.floor((w - fs * 0.3) / e)) * Math.max(0, Math.floor((h - fs * 0.6) / e));
      // Il disegno dentro un rettangolo (l'aiuola o una sua parte): scacchiera, oppure le icone in fila.
      const riempi = (a, x, y, w, h, dove) => {
        const attivi = a.capanno ? [] : coltureDi(a.id);
        const perRiga = Math.max(1, Math.floor((w - fs * 0.3) / e));
        const righe = Math.max(0, Math.floor((h - fs * (dove === "parte" ? 1.4 : 0.6)) / e));
        const tutte = attivi.map((i) => PER_ID[i.ortaggioId]);
        const posti = perRiga * righe;
        const emoji = tutte.length > posti ? [...tutte.slice(0, Math.max(0, posti - 1)), `+${tutte.length - Math.max(0, posti - 1)}`] : tutte;
        const cx = x + w / 2;
        const vista = grigliaVista(a);
        const griglia = !a.capanno && !a.semenzaio && vista.g.righe * vista.g.colonne > 1;
        let testi = "", linee = "";
        if (griglia) {
          // Scacchiera: linee e, in ogni casella, l'emoji di chi la occupa.
          const g = vista.g;
          const cw = w / g.colonne, ch = h / g.righe;
          const manca = vista.manca;
          // Caselle che sono vasi: un cerchio per casella, ogni fila centrata.
          const vasi = formaVasiCaselle(a);
          const colonneFila = (r) => [...Array(g.colonne).keys()].filter((c) => !manca.has(nomeCella(r, c)));
          const xCella = (r, c) => {
            if (!vasi) return x + (c + 0.5) * cw;
            const qui = colonneFila(r);
            return x + ((g.colonne - qui.length) / 2 + qui.indexOf(c) + 0.5) * cw;
          };
          if (vasi) {
            // Misura del vaso: quella scritta (al massimo la casella), altrimenti quasi tutta la casella.
            const misura = (m, lato) => Math.min(lato * 0.96, m > 0 ? m : lato * 0.9);
            const tondo = vasi === "tondo";
            const vw = vasi === "rettangolare" ? misura(a.vasoL, cw) : misura(a.vasoL, Math.min(cw, ch));
            const vh = vasi === "rettangolare" ? misura(a.vasoP, ch) : vw;
            for (let r = 0; r < g.righe; r++) for (const c of colonneFila(r)) {
              const mx = xCella(r, c), my = y + (r + 0.5) * ch;
              if (tondo) {
                const [px, py] = T(mx, my);
                linee += `<circle class="p-aiuola p-vaso" cx="${px}" cy="${py}" r="${vw / 2}"/>`;
              } else linee += `<polygon class="p-aiuola p-vaso" points="${punti(angoli(mx - vw / 2, my - vh / 2, vw, vh))}"/>`;
            }
          }
          const seg = (x1, y1, x2, y2) => { const [p1, p2] = [T(x1, y1), T(x2, y2)]; return `<line class="p-griglia" x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke-width="${fs * 0.06}"/>`; };
          // Linee solo se le caselle sono abbastanza grandi da vederle (almeno 5 px).
          if (!vasi && cw * scala >= 5) for (let c = 1; c < g.colonne; c++) linee += seg(x + c * cw, y, x + c * cw, y + h);
          if (!vasi && ch * scala >= 5) for (let r = 1; r < g.righe; r++) linee += seg(x, y + r * ch, x + w, y + r * ch);
          const occ = occupazioneDi(a);
          const libere = [];
          const dim = Math.min(e * 0.85, Math.min(cw, ch) * 0.7);
          // Una casella lunga e stretta è una fila: icone in fila per tutta la
          // lunghezza (alternate se nella fila ci sono più colture); nei vasi una sola.
          const lunga = !vasi && Math.max(cw, ch) >= 2 * Math.min(cw, ch);
          const inCella = (r, c, orti) => {
            const mx = xCella(r, c), my = y + (r + 0.5) * ch;
            if (!lunga) return iconaPianta(mx, my, orti[0], dim);
            const lungo = Math.max(cw, ch), passo = dim * 1.15;
            const quante = Math.max(1, Math.min(60, Math.floor(lungo / passo)));
            const verticale = ch > cw, spazio = lungo / quante;
            let h = "";
            for (let k = 0; k < quante; k++) {
              const d = -lungo / 2 + spazio * (k + 0.5);
              h += iconaPianta(verticale ? mx : mx + d, verticale ? my + d : my, orti[k % orti.length], dim);
            }
            return h;
          };
          for (let r = 0; r < g.righe; r++) for (let c = 0; c < g.colonne; c++) {
            const n = nomeCella(r, c);
            if (manca.has(n)) continue;
            if (occ[n]) testi += inCella(r, c, [...new Set(occ[n].map((i) => i.ortaggioId))].map((id) => PER_ID[id]));
            else libere.push([r, c]);
          }
          // Colture su tutta l'aiuola: nelle caselle libere.
          coltureDi(a.id).filter((i) => !i.celle?.length).forEach((i, k) => {
            if (!libere[k]) return;
            const [r, c] = libere[k];
            testi += inCella(r, c, [PER_ID[i.ortaggioId]]);
          });
        } else {
          testi = (posti ? emoji : []).map((em, k) => {
            const px = cx + ((k % perRiga) - (Math.min(perRiga, emoji.length) - 1) / 2) * e;
            // Nel vaso le piantine stanno al centro.
            const su = a.vaso ? (h - Math.min(righe, Math.ceil(emoji.length / perRiga)) * e) / 2 : dove === "dentro" ? fs * 2.4 : dove === "parte" ? fs * 1.1 : fs * 0.3;
            const py = y + su + Math.floor(k / perRiga) * e + e * 0.5;
            return typeof em === "string" ? testo(px, py, em, "p-emoji", e * 0.85) : iconaPianta(px, py, em, e * 0.85);
          }).join("");
        }
        return [linee, testi];
      };
      let [linee, testi] = parti.length ? ["", ""] : riempi(a, x, y, w, h, dove);
      // Aiuola divisa: le parti affiancate (o una dietro l'altra), ognuna col suo disegno e la sua lettera.
      let partiSvg = "";
      if (parti.length) {
        const fondo = a.divisa === "fondo";
        const misura = (b) => Number(fondo ? b.lunghezza : b.larghezza) || 0;
        const tot = parti.reduce((t, b) => t + misura(b), 0);
        const tutteMisurate = parti.every((b) => misura(b) > 0);
        let pos = 0;
        partiSvg = parti.map((b) => {
          const q = tutteMisurate ? misura(b) / tot : 1 / parti.length;
          const [bx, by, bw, bh] = fondo ? [x, y + pos * h, w, q * h] : [x + pos * w, y, q * w, h];
          pos += q;
          const [li, te] = riempi(b, bx, by, bw, bh, "parte");
          return `<a href="#orto/${b.id}"${perScelta && coltivabile(b) ? ` data-scegli="${b.id}"` : ""}><title>${esc(nomeAiuola(b))}${b.larghezza && b.lunghezza ? " · " + esc(misureAiuola(b)) : ""}</title>
            <polygon class="p-aiuola p-parte${b.pacciamatura ? " p-" + b.pacciamatura : ""}" points="${punti(angoli(bx, by, bw, bh))}"/>${li}${te}
            ${testo(bx + bw / 2, by + fs * 0.55, esc(b.parte || ""), "p-lettera", fs * 0.8)}</a>`;
        }).join("");
      }
      if (a.capanno) testi = testo(cx, y + h / 2, "🧰", "p-emoji", Math.min(fs * 2, h * 0.6, w * 0.6));
      const [yNumero, yMisura] = {
        solo: [y - fs * 0.9, y + h + fs * 1.1],
        sopra: [y - fs * 1.8, y - fs * 0.6],
        sotto: [y + h + fs * 1.0, y + h + fs * 2.2],
        dentro: [y + fs * 0.9, y + fs * 1.9],
      }[dove];
      etichette.push(T(cx, Math.min(yNumero, yMisura) - fs * 0.7), T(cx, Math.max(yNumero, yMisura) + fs * 0.6));
      // Vaso troppo piccolo per le icone delle piante: vanno in una riga accanto
      // alle scritte (sotto le misure; sopra il numero nella fila in fondo;
      // a destra del vaso nelle file in mezzo).
      if (a.vaso && tutte.length && posti < tutte.length) {
        const lato = e * 0.85;
        if (dove === "dentro") {
          testi = tutte.map((o, k) => iconaPianta(x + w + lato * (0.7 + k), y + h / 2, o, lato)).join("");
          etichette.push(T(x + w + lato * (0.7 + tutte.length), y + h / 2));
        } else {
          const yIcone = dove === "sopra" ? Math.min(yNumero, yMisura) - fs * 1.3 : Math.max(yNumero, yMisura) + fs * 1.2;
          testi = tutte.map((o, k) => iconaPianta(cx + (k - (tutte.length - 1) / 2) * lato * 1.05, yIcone, o, lato)).join("");
          etichette.push(T(cx, yIcone + (dove === "sopra" ? -1 : 1) * fs * 0.7));
        }
      }
      const chiaro = dove === "dentro" && a.pacciamatura === "telo" ? " p-chiaro" : "";
      const d = fs * 0.15;
      return `<a href="#orto/${a.id}"${perScelta && coltivabile(a) ? ` data-scegli="${a.id}"` : ""}>
        <title>${esc(nomeAiuola(a))}${misurata ? " · " + esc(misureAiuola(a)) : ""}</title>
        ${a.vaso === "tondo" ? `<circle class="p-aiuola p-vaso${misurata ? "" : " p-senza"}" cx="${T(cx, y + h / 2)[0]}" cy="${T(cx, y + h / 2)[1]}" r="${w / 2}"/>`
          : `<polygon class="p-aiuola${misurata ? "" : " p-senza"}${a.capanno ? " p-capanno" : ""}${a.vaso ? " p-vaso" : ""}${formaVasiCaselle(a) && haGriglia(a) ? " p-base-vasi" : ""}${a.pacciamatura ? " p-" + a.pacciamatura : ""}" points="${punti(angoli(x, y, w, h))}"/>`}
        ${partiSvg ? `</a>${partiSvg}<a href="#orto/${a.id}">` : ""}
        ${a.copertura === "serra" ? `<polygon class="p-serra" points="${punti(angoli(x + d, y + d, Math.max(0, w - 2 * d), Math.max(0, h - 2 * d)))}"/>` : ""}
        ${(a.copertura === "serra" || a.capanno) && PORTE[a.porta] && a.porta ? (() => {
          // Porta: un tratto marrone a metà del lato da cui si entra.
          const lp = Math.min(0.8, (a.porta === "sinistra" || a.porta === "destra" ? h : w) * 0.4);
          const [p1, p2] = {
            sinistra: [[x, y + h / 2 - lp / 2], [x, y + h / 2 + lp / 2]],
            destra: [[x + w, y + h / 2 - lp / 2], [x + w, y + h / 2 + lp / 2]],
            dietro: [[cx - lp / 2, y], [cx + lp / 2, y]],
            davanti: [[cx - lp / 2, y + h], [cx + lp / 2, y + h]],
          }[a.porta].map(([px, py]) => T(px, py));
          return `<line class="p-porta" x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke-width="${fs * 0.45}"><title>Porta</title></line>`;
        })() : ""}
        ${linee}
        ${testi}
        ${testo(cx, yNumero, a.capanno ? esc(a.nome || "Capanno") : `${a.copertura === "serra" ? "🏠" : ""}${esc(a.numero)}${problemi ? " ⚠️" : ""}`, "p-numero" + chiaro, fs * (a.capanno ? 0.9 : 1.3))}
        ${testo(cx, yMisura, misurata ? (a.vaso === "tondo" ? `Ø${Math.round(a.larghezza * 100)} cm` : `${fmtM(a.larghezza)}×${fmtM(a.lunghezza)}`) : "misure?", "p-misura" + chiaro, fs * 0.8)}
      </a>`;
    }).join("");

    // Riquadro finale con le scritte e, se c'è l'orientamento, la freccia del Nord.
    const box = limiti([...tutti, ...etichette]);
    let nord = "";
    let { minX, minY, maxX, maxY } = { minX: box.minX - fs, minY: box.minY - fs, maxX: box.maxX + fs, maxY: box.maxY + fs };
    if (or.attivo) {
      const ax = maxX + fs * 1.2, ay = minY + fs * 0.4;
      nord = `<g class="p-nord"><text x="${ax}" y="${ay + fs * 0.5}" font-size="${fs * 1.1}" text-anchor="middle" dominant-baseline="central">N</text>
        <polygon points="${ax},${ay + fs * 1.2} ${ax - fs * 0.45},${ay + fs * 2.1} ${ax + fs * 0.45},${ay + fs * 2.1}"/>
        <line x1="${ax}" y1="${ay + fs * 2}" x2="${ax}" y2="${ay + fs * 3.4}" stroke-width="${fs * 0.18}"/></g>`;
      maxX = ax + fs * 1.2;
      maxY = Math.max(maxY, ay + fs * 3.6);
    }
    const larghezzaBox = maxX - minX, altezzaBox = maxY - minY;
    const superficie = misurate.reduce((s, a) => s + mqAiuola(a), 0);
    const svg = `<svg class="pianta" style="max-width:${Math.round(larghezzaBox * scala * (scala < scalaMax ? 1.2 : 1))}px" viewBox="${minX} ${minY} ${larghezzaBox} ${altezzaBox}" role="img" aria-label="Pianta di ${esc(zona)}">${disegno}${nord}</svg>`;
    if (perScelta) return `<div class="mappa-zona">${zone().length > 1 ? `<b class="piccolo">${esc(zona)}</b>` : ""}${svg}</div>`;
    return `<section class="carta">
      <h3 style="margin-top:0">${esc(zona)} · vista dall'alto</h3>
      ${svg}
      ${legendaPianta(lista)}
      ${consiglioSole(zona, lista)}
      <p class="tenue piccolo">${or.attivo ? `La fila va ${esc(DIREZIONI_TESTO(or.gradi))}.` : "Disegno dritto: l'orientamento della zona non è indicato."}
      Aiuole in ordine di numero${dietro ? `, in ${file.length} file` : ""}, ${corridoio ? `con vialetti di ${Math.round(corridoio * 100)} cm` : "senza vialetti"}. Lunghezza totale circa ${fmtM(larghezzaTot)} m${superficie ? ` · ${fmtM(superficie)} m² coltivati` : ""}.
      ${lista.some((a) => !(a.larghezza && a.lunghezza)) ? "Le aiuole tratteggiate non hanno ancora le misure: toccale e premi «Modifica aiuola» per inserirle." : ""} Tocca un'aiuola per aprirla.</p>
      <button class="piccolo secondario" data-zona="${esc(zona)}">⚙️ Nome, vialetti, orientamento, numeri</button>
    </section>`;
  }).join("");
  return blocchi;
}

function limiti(punti) {
  const xs = punti.map((q) => q[0]), ys = punti.map((q) => q[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

// Direzione della fila (dalla prima all'ultima aiuola) in gradi di bussola.
const DIREZIONI = [
  [0, "da sud verso nord"], [45, "da sud-ovest verso nord-est"], [90, "da ovest verso est"],
  [135, "da nord-ovest verso sud-est"], [180, "da nord verso sud"], [225, "da nord-est verso sud-ovest"],
  [270, "da est verso ovest"], [315, "da sud-est verso nord-ovest"],
];
const PUNTI_CARDINALI = ["nord", "nord-est", "est", "sud-est", "sud", "sud-ovest", "ovest", "nord-ovest"];
function puntoCardinale(gradi) { return PUNTI_CARDINALI[Math.round((((gradi % 360) + 360) % 360) / 45) % 8]; }
function DIREZIONI_TESTO(gradi) {
  const esatta = DIREZIONI.find(([g]) => g === gradi);
  return esatta ? esatta[1] : `verso ${puntoCardinale(gradi)} (${gradi}°)`;
}

function orientamentoZona(zona) {
  const z = S.zone?.[zona] || {};
  const attivo = z.direzione != null && z.direzione !== "";
  const gradi = attivo ? Number(z.direzione) : 90;
  // Senza orientamento la fila va da sinistra a destra (= verso est, 90°).
  const rad = ((gradi - 90) * Math.PI) / 180;
  return { attivo, gradi, cos: Math.cos(rad), sin: Math.sin(rad), s: z.specchia ? -1 : 1 };
}

// Dove sta il nord rispetto alle aiuole e dove mettere le piante alte.
function consiglioSole(zona, lista) {
  const or = orientamentoZona(zona);
  if (!or.attivo) return "";
  // Nord nelle coordinate locali (x lungo la fila, y dal fondo verso il davanti).
  const nx = -or.sin, ny = -or.cos * or.s;
  const lati = [];
  if (ny < -0.38) lati.push("il fondo");
  if (ny > 0.38) lati.push("il davanti");
  if (nx > 0.38) lati.push(`l'estremità dell'aiuola ${lista[lista.length - 1].numero}`);
  if (nx < -0.38) lati.push(`l'estremità dell'aiuola ${lista[0].numero}`);
  // Direzione verso cui guarda il davanti delle aiuole.
  const dx = -or.s * or.sin, dy = or.s * or.cos;
  const davanti = puntoCardinale((Math.atan2(dx, -dy) * 180) / Math.PI);
  return `<div class="bene piccolo">☀️ Il davanti delle aiuole guarda a ${davanti}; il nord è verso ${lati.join(" e ")}.
    Metti lì le piante alte (pomodori, mais, fagioli e piselli rampicanti, cetrioli su rete), così non fanno ombra alle più basse.</div>`;
}

function legendaPianta(lista) {
  const voci = [];
  if (lista.some((a) => !a.capanno && !a.vaso && !a.pacciamatura && a.copertura !== "serra")) voci.push(`<span><i class="l-terra"></i>terra nuda</span>`);
  if (lista.some((a) => a.pacciamatura === "telo")) voci.push(`<span><i class="l-telo"></i>telo</span>`);
  if (lista.some((a) => a.pacciamatura === "organica")) voci.push(`<span><i class="l-organica"></i>paglia, foglie</span>`);
  if (lista.some((a) => a.copertura === "serra")) voci.push(`<span><i class="l-serra"></i>🏠 serra</span>`);
  if (lista.some((a) => (a.copertura === "serra" || a.capanno) && a.porta)) voci.push(`<span><i class="l-porta"></i>porta</span>`);
  if (lista.some((a) => a.capanno)) voci.push(`<span><i class="l-capanno"></i>🧰 attrezzi</span>`);
  if (lista.some((a) => a.vaso || formaVasiCaselle(a))) voci.push(`<span><i class="l-vaso"></i>🏺 vaso</span>`);
  return voci.length > 1 || lista.some((a) => a.copertura === "serra" || a.pacciamatura || a.capanno || a.vaso) ? `<div class="legenda">${voci.join("")}</div>` : "";
}

function suggerimentiAiuola(a) {
  if (a.semenzaio || PER_ID[a.fissa]) return "";
  const ora = oggi();
  const margine = a.copertura === "serra" ? ANTICIPO_SERRA : 0;
  const da = piuGiorni(ora, -margine);
  const fino = piuGiorni(ora, ORIZZONTE + margine);
  const dataISO = aISO(ora);
  const cand = [];
  for (const o of ORTAGGI) {
    if (!["dir", "tra"].some((f) => finestreTra(o, f, da, fino).length)) continue;
    if (impiantiAttivi(a.id).some((i) => i.ortaggioId === o.id)) continue;
    const rot = avvisiRotazione(a.id, o.id, dataISO).length;
    const v = avvisiVicini(a.id, o.id);
    if (rot || v.cattivi.length) continue;
    cand.push({ o, punti: v.buoni.length * 2 + (preferito(o.id) ? 1 : 0) });
  }
  if (!cand.length) return "";
  cand.sort((x, y) => y.punti - x.punti || x.o.nome.localeCompare(y.o.nome, "it"));
  return `<section class="carta"><h3 style="margin-top:0">Cosa potresti mettere qui adesso</h3>
    <p class="tenue piccolo">Ortaggi di stagione${margine ? " (in serra con 3 settimane di margine)" : ""} che rispettano la rotazione e vanno d'accordo con quelli già presenti.</p>
    ${cand.slice(0, 10).map(({ o }) => `<button class="chip" data-ortaggio="${o.id}">${icona(o)} ${esc(o.nome)}</button>`).join("")}
  </section>`;
}

// Scacchiera della scheda aiuola: tocca una casella vuota per piantarci, una piena per modificarla.
// La scacchiera è quella della coltura messa per ultima (ognuna ha la sua), altrimenti quella proposta dall'aiuola.
function htmlScacchiera(a) {
  if (a.semenzaio) return "";
  // Come nella pianta: l'anno scelto in alto (annoPianta), oppure adesso.
  const { colture, princ, g, manca, occ } = vistaScacchiera(a, annoPianta);
  if (g.righe * g.colonne <= 1) return "";
  const diversa = !stessaGriglia(g, grigliaAiuola(a));
  const tutta = colture.filter((i) => !i.celle?.length);
  const fitta = grigliaFitta(g);
  let h = `<div class="scorri-scacchiera">${intestazioneGriglia(g).replace('class="scacchiera', 'class="scacchiera grande')}`;
  for (let r = 0; r < g.righe; r++) {
    h += `<span class="intest riga">${nomeRiga(r)}</span>`;
    for (let c = 0; c < g.colonne; c++) {
      const n = nomeCella(r, c);
      if (manca.has(n)) { h += `<span class="cella mancante" title="${n}: non esiste"></span>`; continue; }
      const chi = occ[n] || [];
      h += chi.length
        ? `<button type="button" class="cella piena" data-modifica-imp="${chi[0].id}" title="${n} · ${esc(chi.map((i) => PER_ID[i.ortaggioId]?.nome ?? "").join(", "))}"><span class="em">${chi.map((i) => icona(PER_ID[i.ortaggioId])).join("")}</span>${fitta ? "" : `<span class="nome">${esc(chi.map((i) => PER_ID[i.ortaggioId]?.nome ?? "").join(", "))}</span>`}</button>`
        : `<button type="button" class="cella" data-cella-nuova="${n}"${diversa ? ` data-griglia="${g.righe}x${g.colonne}"` : ""} title="${n}"><span class="nome tenue">${n}</span></button>`;
    }
  }
  h += `</div></div>`;
  const misura = misuraCasella({ ...a, ...misureAnno(a, annoPianta || String(oggi().getFullYear())), ...g });
  return `<section class="carta"><h3 style="margin-top:0">${annoPianta ? `${annoPianta} · ` : ""}Scacchiera ${g.righe} × ${g.colonne}${princ ? ` <span class="tenue piccolo">· di ${esc(PER_ID[princ.ortaggioId]?.nome.split(" (")[0].toLowerCase() ?? "")}</span>` : ""}${manca.size ? ` <span class="tenue piccolo">· ${g.righe * g.colonne - manca.size} caselle vere</span>` : ""}${misura ? ` <span class="tenue piccolo">· ${misura}</span>` : ""}</h3>${h}
    <p class="tenue piccolo">Righe a, b, c… dal fondo verso di te; colonne 1, 2, 3… da sinistra a destra. Tocca una casella vuota per piantarci, una piena per modificarla.
    ${tutta.length ? `Su tutta l'aiuola: ${tutta.map((i) => nomeOrtaggio(i.ortaggioId)).join(", ")}.` : ""}</p>
    ${diversa || annoPianta ? "" : `<div class="riga-bottoni"><button type="button" class="piccolo secondario" data-celle-mancanti="${a.id}">✕ Caselle che non esistono${manca.size ? ` (${manca.size})` : ""}</button></div>`}</section>`;
}

function vistaAiuola(a) {
  if (a.capanno) return `<p><a href="#orto">← Le aiuole</a></p>
    <h2>${esc(nomeAiuola(a))}</h2>
    <p class="tenue">${esc([misureAiuola(a), tipoAiuola(a)].filter(Boolean).join(" · "))}</p>
    ${a.note ? `<p>${esc(a.note)}</p>` : ""}
    <p class="tenue piccolo">Serve solo a disegnare l'orto com'è davvero: qui non si semina e non conta nei m² coltivati.</p>
    <div class="riga-bottoni"><button class="secondario" id="modifica-aiuola">✏️ Modifica</button>
      <button class="secondario" id="elimina-aiuola">🗑️ Elimina</button></div>`;
  // Con un anno scelto in alto: le colture di quell'anno; adesso: quelle in corso, poi quelle in programma.
  const anno = a.semenzaio ? null : annoPianta;
  const tutteAttive = impiantiAttivi(a.id).sort((x, y) => x.data.localeCompare(y.data));
  const attivi = anno ? coltureAnno(a.id, anno).sort((x, y) => x.data.localeCompare(y.data))
    : a.semenzaio ? tutteAttive : tutteAttive.filter((i) => i.data <= aISO(oggi()));
  const inProgramma = anno || a.semenzaio ? [] : tutteAttive.filter((i) => i.data > aISO(oggi()));
  const storici = S.impianti.filter((i) => i.finito && i.aiuolaId === a.id).sort((x, y) => y.data.localeCompare(x.data));
  const eventi = S.eventi.filter((e) => e.aiuolaId === a.id).sort((x, y) => y.data.localeCompare(x.data)).slice(0, 15);

  const voce = (i) => {
    const o = PER_ID[i.ortaggioId];
    if (i.finito) return `<li><div><b>${icona(o)} ${esc(o.nome)}</b>${i.varieta ? ` <span class="tenue">${esc(i.varieta)}</span>` : ""}${i.celle?.length ? ` · <b>${esc(testoCelle(i))}</b>` : ""}</div>
      <div class="tenue piccolo">${esc(MODI[i.modo] ?? "")} il ${fmtAnno(daISO(i.data))} · finita${i.dataFine ? " il " + fmtAnno(daISO(i.dataFine)) : ""}</div>
      <div class="riga-bottoni"><button class="piccolo secondario" data-modifica-imp="${i.id}">✏️ Modifica</button></div></li>`;
    const stime = stimeImpianto(i).map((s) => `${FASI[s.tipo].breve} ~${fmt(s.data)}`).join(" · ");
    const avv = htmlAvvisi(a.id, i.ortaggioId, i.data, i.id, i.celle, i.protezione).replace(/<div class="avviso">📅[^<]*<\/div>/, "");
    return `<li>
      <div><b>${icona(o)} ${esc(o.nome)}</b>${i.varieta ? ` <span class="tenue">${esc(i.varieta)}</span>` : ""}${i.celle?.length ? ` · <b>${esc(testoCelle(i))}</b>` : ""}${PROTEZIONE_BREVE[i.protezione] ? ` · ${PROTEZIONE_BREVE[i.protezione]}` : ""}</div>
      <div class="tenue piccolo">${i.modo === "acq" ? "🛒 " : ""}${esc(MODI[i.modo] ?? "")} il ${fmt(daISO(i.data))}${i.modo === "acq" ? (testoAcquisto(i) ? " · " + esc(testoAcquisto(i)) : "") : i.quantita ? " · " + esc(i.quantita) : ""}${stime ? " · previsti: " + stime : ""}</div>
      ${a.semenzaio && Number(i.trapiantate) > 0 ? `<div class="bene piccolo">🚜 Trapiantate ${i.trapiantate}${piantineRimaste(i) != null ? `, nel semenzaio ne restano <b>${piantineRimaste(i)}</b>` : ""}.</div>` : ""}
      ${i.note ? `<div class="piccolo">${esc(i.note)}</div>` : ""}
      ${avv}
      ${(() => {
        // Coltura a sesto largo messa da poco: proposta delle intercalari, con un bottone per ognuna.
        const x = !a.semenzaio && intercalari(i.ortaggioId, aISO(oggi()) > i.data ? aISO(oggi()) : i.data);
        const eta = giorniTra(daISO(i.data), oggi());
        const gia = new Set(impiantiAttivi(a.id).map((y) => y.ortaggioId));
        const ok = x ? x.ok.filter((id) => !gia.has(id)) : [];
        return x && eta < x.giorni && ok.length ? `<div class="bene piccolo">🌱 <b>Sfrutta lo spazio</b> ${esc(x.dove)} finché ${esc(o.nome.toLowerCase())} è piccolo:
          ${ok.map((id) => `<button class="chip" data-intercalare="${id}" data-intercalare-di="${i.id}">＋ ${icona(PER_ID[id])} ${esc(PER_ID[id].nome)}</button>`).join(" ")}</div>` : "";
      })()}
      <div class="riga-bottoni">
        ${a.semenzaio ? `<button class="piccolo" data-trapianta="${i.id}">Trapianta</button>` : `<button class="piccolo" data-raccolto="${i.id}">🧺 Raccolto</button>`}
        <button class="piccolo secondario" data-evento-imp="${i.id}">＋ Nota</button>
        <button class="piccolo secondario" data-modifica-imp="${i.id}">✏️ Modifica</button>
        <button class="piccolo secondario" data-diagnosi-imp="${i.id}">🩺 Problema?</button>
        <button class="piccolo secondario" data-fine="${i.id}">Fine coltura</button>
      </div>
    </li>`;
  };
  const htmlAttivi = (attivi.length ? `<ul class="elenco">${attivi.map(voce).join("")}</ul>` : `<p class="tenue">${anno ? `Niente nel ${anno}.` : "Niente in coltivazione."}</p>`)
    + (inProgramma.length ? `<h4 style="margin:12px 0 0">🔔 In programma</h4><ul class="elenco">${inProgramma.map(voce).join("")}</ul>` : "");

  const perAnno = {};
  for (const i of storici) (perAnno[i.data.slice(0, 4)] ??= []).push(i);
  const htmlStorici = Object.keys(perAnno).length ? Object.entries(perAnno).sort((x, y) => y[0].localeCompare(x[0])).map(([anno, l]) =>
    `<p style="margin-bottom:2px"><b>${anno}:</b> ${l.map((i) => `<button type="button" class="voce-storico" data-modifica-imp="${i.id}" title="Tocca per modificare o eliminare">${nomeOrtaggio(i.ortaggioId)}${i.esito === "fallito" ? " ✗" : ""}</button> <button type="button" class="chip piccolo" data-storico="${i.id}" title="Cosa mettere dopo e vicini">🔄 dopo e vicini</button>${i.commento ? ` <span class="tenue">(${esc(i.commento)})</span>` : ""}`).join(", ")}</p>${htmlComEra(a, l)}`).join("") + `<p class="tenue piccolo">Tocca un ortaggio per modificarlo o eliminarlo; tocca <b>🔄 dopo e vicini</b> per vedere cosa mettere dopo lì e i suoi vicini.</p>`
    : `<p class="tenue">Ancora niente: qui comparirà cosa hai coltivato negli anni passati.</p>`;

  const parti = partiDi(a);
  if (parti.length) return `<p><a href="#orto">← Tutte le aiuole</a></p>
    <h2>${iconaAiuola(a)} ${esc(nomeAiuola(a))}</h2>
    <p class="tenue">${esc([misureAiuola(a), tipoAiuola(a)].filter(Boolean).join(" · "))}</p>
    ${a.note ? `<p>${esc(a.note)}</p>` : ""}
    ${malattieTerreno(a.id, null, aISO(oggi())).map((e) => `<div class="pericolo">${esc(testoMalattia(e))}</div>`).join("")}
    <section class="carta"><h3 style="margin-top:0">✂️ Le parti</h3>
      <ul class="elenco">${parti.map((b) => {
        const g = grigliaAiuola(b), att = impiantiAttivi(b.id);
        return `<li><a href="#orto/${b.id}"><b>${iconaAiuola(b)} ${esc(nomeAiuola(b))}</b></a>
          <span class="tenue piccolo">${esc([misureAiuola(b), g.righe * g.colonne > 1 ? `scacchiera ${g.righe} × ${g.colonne}` : ""].filter(Boolean).join(" · "))}</span>
          <div>${att.length ? att.map((i) => `<span class="chip">${nomeOrtaggio(i.ortaggioId)}</span>`).join("") : `<span class="tenue">vuota</span>`}</div></li>`;
      }).join("")}</ul>
      <div class="riga-bottoni"><button class="secondario" id="nuova-parte">＋ Aggiungi una parte</button></div>
      <p class="tenue piccolo">Ogni parte ha la sua scacchiera e la sua storia: tocca una parte per seminare o trapiantare. Quello che è stato coltivato qui prima di dividere conta per la rotazione di tutte le parti.</p>
    </section>
    ${storici.length ? `<section class="carta"><h3 style="margin-top:0">Prima della divisione</h3>${htmlStorici}</section>` : ""}
    ${eventi.length ? `<section class="carta"><h3 style="margin-top:0">Ultime annotazioni</h3>${htmlEventi(eventi)}</section>` : ""}
    <div class="riga-bottoni">
      <button class="secondario" id="evento-qui">＋ Annotazione</button>
      <button class="secondario" id="modifica-aiuola">✏️ Modifica aiuola</button>
      <button class="secondario" id="elimina-aiuola">Elimina aiuola</button>
    </div>`;
  const padre = padreDi(a);
  // Misure e pacciamatura dell'anno scelto (come nella pianta).
  const princA = anno !== undefined && !a.semenzaio ? vistaScacchiera(a, anno).princ : null;
  const aA = { ...a, ...misureAnno(a, anno || String(oggi().getFullYear())), pacciamatura: princA?.pacciamatura ?? a.pacciamatura };
  return `
    <p>${padre ? `<a href="#orto/${padre.id}">← ${esc(nomeAiuola(padre))} (tutte le parti)</a>` : `<a href="#orto">← Tutte le aiuole</a>`}</p>
    <div class="riga" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <h2>${iconaAiuola(a)} ${esc(nomeAiuola(a))}</h2>${a.semenzaio ? "" : htmlSelettoreAnno()}</div>
    ${misureAiuola(aA) || tipoAiuola(aA) ? `<p class="tenue">${esc([misureAiuola(aA), tipoAiuola(aA)].filter(Boolean).join(" · "))}</p>` : ""}
    ${a.note ? `<p>${esc(a.note)}</p>` : ""}
    ${PER_ID[a.fissa] ? `<div class="bene">${consiglioFissa(a)}</div>` : ""}
    ${a.semenzaio ? "" : malattieTerreno(a.id, null, aISO(oggi())).map((e) => `<div class="pericolo">${esc(testoMalattia(e))}</div>`).join("")}
    ${a.semenzaio ? `<p class="tenue piccolo">Qui segni le semine al riparo (in casa, in serra, in vasetti). Quando le piantine sono pronte premi «Trapianta» e scegli l'aiuola.</p>` : ""}
    ${anno ? "" : consiglioAiuolaVuota(a)}
    ${htmlScacchiera(a)}
    <section class="carta"><h3 style="margin-top:0">${anno ? `Colture del ${anno}` : "In coltivazione"}</h3>${htmlAttivi}
      <div class="riga-bottoni"><button id="coltura-qui">＋ ${a.semenzaio ? "Nuova semina" : "Nuova coltura"}</button>
      ${a.semenzaio ? `<button id="piantine-comprate">🛒 Piantine comprate</button>` : ""}
      <button class="secondario" id="evento-qui">＋ Annotazione</button></div>
    </section>
    ${anno ? "" : suggerimentiAiuola(a)}
    ${a.semenzaio ? "" : `<section class="carta"><h3 style="margin-top:0">Negli anni passati</h3>${htmlTerraCambiata(a)}${htmlStorici}</section>`}
    ${eventi.length ? `<section class="carta"><h3 style="margin-top:0">Ultime annotazioni</h3>${htmlEventi(eventi)}</section>` : ""}
    <div class="riga-bottoni">
      <button class="secondario" id="modifica-aiuola">✏️ Modifica ${a.semenzaio ? "semenzaio" : padre ? "parte" : "aiuola"}</button>
      ${a.semenzaio || padre || a.vaso ? "" : `<button class="secondario" id="dividi">✂️ Dividi in parti</button>`}
      ${a.semenzaio ? "" : `<button class="secondario" id="elimina-aiuola">Elimina ${padre ? "parte" : "aiuola"}</button>`}
    </div>`;
}

function htmlTerraCambiata(a) {
  const t = terraCambiata(a.id, aISO(oggi()));
  return t ? `<p class="bene piccolo">🪣 Terra cambiata il ${fmt(daISO(t))} ${t.slice(0, 4)}: le colture di prima non contano più per la rotazione.</p>` : "";
}
function htmlEventi(eventi) {
  return `<ul class="elenco">${eventi.map((e) => {
    const imp = S.impianti.find((i) => i.id === e.impiantoId);
    return `<li><div class="riga"><span><b>${TIPI_EVENTO[e.tipo] ?? e.tipo}</b>${e.tipo === "malattia" ? ` · ${esc((MALATTIE_TERRENO[e.malattia]?.nome ?? "").replace(/ \(.*/, ""))} su ${esc(FAMIGLIE[e.fam]?.toLowerCase() ?? "")}` : ""}
      ${imp ? ` · ${nomeOrtaggio(imp.ortaggioId)}` : ""}${e.kg ? ` · <b>${String(e.kg).replace(".", ",")} kg</b>` : ""}
      ${daISO(e.data) > oggi() ? ` <span class="chip-futuro">🔔 in programma</span>` : ""}
      <br><span class="tenue piccolo">${fmt(daISO(e.data))} ${e.data.slice(0, 4)}${e.aiuolaId && aiuola(e.aiuolaId) ? " · " + esc(nomeAiuolaId(e.aiuolaId)) : ""}</span>
      ${e.testo ? `<br><span class="piccolo">${esc(e.testo)}</span>` : ""}</span>
      <button class="piccolo secondario" data-modifica-ev="${e.id}">✏️ Modifica</button></div></li>`;
  }).join("")}</ul>`;
}

// -----------------------------------------------------------------------------
// Vista: Diario
// -----------------------------------------------------------------------------
let annoDiario = null;
function vistaDiario() {
  const anni = new Set([String(oggi().getFullYear())]);
  for (const x of [...S.eventi, ...S.impianti]) anni.add(x.data.slice(0, 4));
  const elencoAnni = [...anni].sort().reverse();
  // Si apre sull'anno in corso (anche se ci sono già voci per l'anno prossimo).
  const anno = annoDiario && anni.has(annoDiario) ? annoDiario : String(oggi().getFullYear());

  const eventi = S.eventi.filter((e) => e.data.startsWith(anno));
  const kg = {};
  for (const e of eventi) {
    if (e.tipo !== "raccolto" || !e.kg) continue;
    const imp = S.impianti.find((i) => i.id === e.impiantoId);
    const chiave = imp ? imp.ortaggioId : "altro";
    kg[chiave] = (kg[chiave] ?? 0) + e.kg;
  }
  const totale = Object.values(kg).reduce((a, b) => a + b, 0);
  const tabKg = totale ? `<table>${Object.entries(kg).sort((a, b) => b[1] - a[1]).map(([id, v]) =>
    `<tr><td>${id === "altro" ? "Altro" : nomeOrtaggio(id)}</td><td class="num">${v.toFixed(1).replace(".", ",")} kg</td></tr>`).join("")}
    <tr><th>Totale</th><th class="num">${totale.toFixed(1).replace(".", ",")} kg</th></tr></table>`
    : `<p class="tenue">Nessun raccolto pesato. Quando raccogli, segna i kg: a fine anno vedrai cosa ha reso di più.</p>`;

  // Semine e trapianti dell'anno, con gli eventi, in ordine di data
  const voci = [
    ...S.impianti.filter((i) => i.data.startsWith(anno)).map((i) => ({
      data: i.data,
      html: `<li><div class="riga"><span><b>${i.modo === "acq" ? "🛒" : "🌱"} ${esc(MODI[i.modo] ?? "")}</b> · ${nomeOrtaggio(i.ortaggioId)}${i.varieta ? ` (${esc(i.varieta)})` : ""}
        ${daISO(i.data) > oggi() ? ` <span class="chip-futuro">🔔 in programma</span>` : ""}
        <br><span class="tenue piccolo">${fmt(daISO(i.data))} ${i.data.slice(0, 4)} · ${esc(nomeAiuolaId(i.aiuolaId))}${i.finito ? " · finita" : ""}</span></span>
        <button class="piccolo secondario" data-modifica-imp="${i.id}">✏️ Modifica</button></div></li>`,
    })),
  ].sort((a, b) => b.data.localeCompare(a.data));

  return `
    <div class="riga" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <h2>Diario</h2>
      <select id="anno-diario" style="width:auto">${elencoAnni.map((a) => `<option ${a === anno ? "selected" : ""}>${a}</option>`).join("")}</select>
    </div>
    <div class="riga-bottoni"><button id="nuovo-evento">＋ Annotazione</button><button class="secondario" id="nuova-coltura">＋ Coltura</button>${htmlBottoneMedaglie()}</div>
    <section class="carta"><h3 style="margin-top:0">Raccolti ${anno}</h3>${tabKg}${(() => {
      const comprate = S.impianti.filter((i) => i.modo === "acq" && i.data.startsWith(anno));
      if (!comprate.length) return "";
      const n = comprate.reduce((t, i) => t + piantineAcquisto(i.acquisto), 0), euro = comprate.reduce((t, i) => t + (Number(i.acquisto?.costo) || 0), 0);
      return `<p class="piccolo" style="margin-bottom:0">🛒 Piantine comprate nel ${anno}: <b>${n}</b>${euro ? ` · spesa <b>€ ${fmtEuro(euro)}</b>` : ""}.</p>`;
    })()}</section>
    <section class="carta"><h3 style="margin-top:0">Annotazioni</h3>
      ${eventi.length ? htmlEventi([...eventi].sort((a, b) => b.data.localeCompare(a.data))) : `<p class="tenue">Nessuna annotazione nel ${anno}.</p>`}
    </section>
    <section class="carta"><h3 style="margin-top:0">Semine e trapianti</h3>
      ${voci.length ? `<ul class="elenco">${voci.map((v) => v.html).join("")}</ul>` : `<p class="tenue">Nessuna semina nel ${anno}.</p>`}
    </section>`;
}

// -----------------------------------------------------------------------------
// Vista: Luogo (GPS, clima, terreno, impostazioni)
// -----------------------------------------------------------------------------
function vistaLuogo() {
  const imp = S.impostazioni;
  const pos = imp.lat == null
    ? `<p>L'app non sa ancora dov'è l'orto. Il modo migliore: vai nell'orto e premi il bottone, così prende la posizione col GPS.</p>`
    : `<p><b>${esc(imp.luogo || "Posizione impostata")}</b><br>
       <span class="tenue">${imp.lat.toFixed(5)}, ${imp.lon.toFixed(5)}${imp.altitudine != null ? ` · ${Math.round(imp.altitudine)} m di altitudine` : ""}${imp.precisione ? ` · precisione GPS ${Math.round(imp.precisione)} m` : ""}</span></p>`;

  return `
    <h2>Posizione dell'orto</h2>
    <section class="carta">
      ${pos}
      <div class="riga-bottoni">
        <button id="gps">📍 ${imp.lat == null ? "Prendi la posizione col GPS" : "Aggiorna col GPS"}</button>
        <button class="secondario" id="manuale">Inserisci a mano</button>
      </div>
      <div id="stato-luogo"></div>
      <p class="tenue piccolo">Le coordinate restano sul telefono; vengono mandate solo ai servizi gratuiti che danno meteo e clima (Open-Meteo), nome del luogo (BigDataCloud) e terreno (ISRIC SoilGrids).</p>
    </section>

    <h2>Clima del luogo</h2>
    <section class="carta" id="box-clima">${htmlClima()}</section>

    <h2>Terreno</h2>
    <section class="carta" id="box-terreno">${htmlTerreno()}</section>

    <h2>Date per il calendario</h2>
    <section class="carta">
      <p>Ultima brinata di primavera: <b>${fmtMmdd(imp.ultimaBrinata)}</b><br>Prima brinata d'autunno: <b>${fmtMmdd(imp.primaBrinata)}</b></p>
      <p class="tenue piccolo">Tutto il calendario si sposta con queste due date. Le calcola l'analisi del clima; puoi correggerle se conosci il tuo orto meglio delle statistiche.</p>
      <button class="secondario" id="date-brinate">Modifica le date</button>
    </section>

    <h2>Dati e promemoria</h2>
    <section class="carta">
      <p class="tenue piccolo">I dati stanno solo su questo telefono: fai ogni tanto una copia di sicurezza. «Invia copia» la manda direttamente con WhatsApp, email o Drive (anche per passarla al computer); «Ripristina da file» la carica su questo dispositivo.</p>
      <div class="riga-bottoni">
        <button id="invia">📤 Invia copia</button>
        <button class="secondario" id="esporta">💾 Scarica copia</button>
        <button class="secondario" id="importa">📂 Ripristina da file</button>
        <input type="file" id="file-importa" accept="application/json,text/plain,.json,.txt" hidden>
      </div>
      <p class="tenue piccolo">🕘 Ogni volta che apri l'app, se l'orto è cambiato, ne tengo anche una copia automatica sul telefono (le ultime ${MAX_COPIE}): ti salva se cancelli qualcosa per sbaglio.</p>
      <div class="riga-bottoni"><button class="secondario" id="copie-automatiche">🕘 Copie automatiche</button></div>
      <p class="tenue piccolo">Promemoria: scarica un file di calendario (.ics) con le attività segnate nel diario con una data futura (con un avviso una settimana prima), i trapianti e le raccolte previsti e l'inizio delle semine dei tuoi ortaggi ★ per i prossimi 12 mesi. Aprilo con l'app Calendario o importalo in Google Calendar dal computer.</p>
      <div class="riga-bottoni"><button class="secondario" id="ics">📅 Scarica promemoria (.ics)</button></div>
    </section>
    ${htmlProfili()}
    <p><a class="bottone secondario" href="#aiuto">❓ Come si usa l'app</a></p>`;
}

function statoLuogo(html) {
  const b = el("stato-luogo");
  if (b) b.innerHTML = html;
}

function prendiGPS() {
  if (!navigator.geolocation) {
    statoLuogo(`<div class="pericolo">Questo browser non dà accesso al GPS.</div>`);
    return;
  }
  statoLuogo(`<p class="tenue">Cerco la posizione… (concedi il permesso se te lo chiede)</p>`);
  navigator.geolocation.getCurrentPosition(
    (p) => impostaPosizione(p.coords.latitude, p.coords.longitude, p.coords.accuracy),
    (e) => statoLuogo(`<div class="pericolo">Posizione non disponibile: ${esc(e.message)}. Controlla che la localizzazione sia attiva e che il sito abbia il permesso.</div>`),
    { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 },
  );
}

function posizioneManuale() {
  const imp = S.impostazioni;
  modulo({
    titolo: "Posizione a mano",
    campi: [
      { id: "lat", etichetta: "Latitudine (es. 45.8566)", valore: imp.lat ?? "", richiesto: true },
      { id: "lon", etichetta: "Longitudine (es. 9.3977)", valore: imp.lon ?? "", richiesto: true },
    ],
    extra: `<p class="tenue piccolo">Su Google Maps tieni premuto sul punto dell'orto: in alto compaiono le coordinate da copiare.</p>`,
    testoSalva: "Usa questa posizione",
    salva: (v) => {
      const lat = Number(v.lat.replace(",", ".")), lon = Number(v.lon.replace(",", "."));
      if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return false;
      setTimeout(() => impostaPosizione(lat, lon, null), 0);
    },
  });
}

async function impostaPosizione(lat, lon, precisione) {
  const imp = S.impostazioni;
  imp.lat = Math.round(lat * 1e5) / 1e5;
  imp.lon = Math.round(lon * 1e5) / 1e5;
  imp.precisione = precisione;
  S.meteo = null;
  salva_e_ridisegna();
  statoLuogo(`<p class="tenue">Cerco altitudine e nome del luogo…</p>`);
  try {
    const [alt, nome] = await Promise.allSettled([
      scaricaJSON(`https://api.open-meteo.com/v1/elevation?latitude=${imp.lat}&longitude=${imp.lon}`),
      scaricaJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${imp.lat}&longitude=${imp.lon}&localityLanguage=it`),
    ]);
    if (alt.status === "fulfilled") imp.altitudine = alt.value.elevation?.[0] ?? null;
    if (nome.status === "fulfilled") {
      const n = nome.value;
      imp.luogo = [n.locality || n.city, n.principalSubdivision].filter(Boolean).join(", ");
    }
    salva_e_ridisegna();
    await analizzaClima(true);
  } catch (e) {
    statoLuogo(`<div class="pericolo">Errore: ${esc(e.message)}</div>`);
  }
}

// --- Clima: 10 anni di dati giornalieri (Open-Meteo, archivio ERA5) ----------
async function analizzaClima(applica) {
  const imp = S.impostazioni;
  if (imp.lat == null) return;
  const box = el("box-clima");
  if (box) box.innerHTML = `<p class="tenue">Analizzo il clima degli ultimi 10 anni… (qualche secondo)</p>`;
  const annoFine = oggi().getFullYear() - 1;
  const q = new URLSearchParams({
    latitude: imp.lat, longitude: imp.lon, timezone: "Europe/Rome",
    start_date: `${annoFine - 9}-01-01`, end_date: `${annoFine}-12-31`,
    daily: "temperature_2m_min,temperature_2m_max,precipitation_sum",
  });
  if (imp.altitudine != null) q.set("elevation", imp.altitudine);
  try {
    const d = (await scaricaJSON("https://archive-api.open-meteo.com/v1/archive?" + q)).daily;
    const perAnno = {};
    const mese = Array.from({ length: 12 }, () => ({ min: 0, max: 0, n: 0, mm: 0 }));
    let minimaAssoluta = { t: 99, data: "" };
    d.time.forEach((t, k) => {
      const tmin = d.temperature_2m_min[k], tmax = d.temperature_2m_max[k], mm = d.precipitation_sum[k];
      if (tmin == null || tmax == null) return;
      const a = t.slice(0, 4), m = Number(t.slice(5, 7)) - 1;
      const g = giornoAnno(t.slice(5));
      const pa = (perAnno[a] ??= { primavera: null, autunno: null, gelo: 0 });
      if (tmin <= SOGLIA_BRINATA && m < 6) pa.primavera = Math.max(pa.primavera ?? 0, g);
      if (tmin <= SOGLIA_BRINATA && m >= 7 && pa.autunno == null) pa.autunno = g;
      if (tmin < 0) pa.gelo++;
      if (tmin < minimaAssoluta.t) minimaAssoluta = { t: tmin, data: t };
      mese[m].min += tmin; mese[m].max += tmax; mese[m].mm += mm ?? 0; mese[m].n++;
    });
    const anni = Object.keys(perAnno).length;
    const prim = Object.values(perAnno).map((x) => x.primavera).filter((x) => x != null).sort((a, b) => a - b);
    const aut = Object.values(perAnno).map((x) => x.autunno).filter((x) => x != null).sort((a, b) => a - b);
    const mediana = (l) => l[Math.floor((l.length - 1) / 2)];
    const quantile = (l, q) => l[Math.min(l.length - 1, Math.max(0, Math.ceil(q * l.length) - 1))];
    S.clima = {
      quando: Date.now(), lat: imp.lat, lon: imp.lon, anni: `${annoFine - 9}–${annoFine}`,
      primaveraMediana: prim.length ? mmddDaGiorno(mediana(prim)) : null,
      primaveraSicura: prim.length ? mmddDaGiorno(quantile(prim, 0.8)) : null,
      autunnoMediana: aut.length ? mmddDaGiorno(mediana(aut)) : null,
      autunnoSicuro: aut.length ? mmddDaGiorno(quantile(aut, 0.2)) : null,
      giorniGelo: Math.round(Object.values(perAnno).reduce((s, x) => s + x.gelo, 0) / anni),
      minimaAssoluta,
      mesi: mese.map((x) => ({ min: x.min / x.n, max: x.max / x.n, mm: x.mm / anni })),
    };
    if (applica) {
      if (S.clima.primaveraSicura) imp.ultimaBrinata = S.clima.primaveraSicura;
      if (S.clima.autunnoSicuro) imp.primaBrinata = S.clima.autunnoSicuro;
    }
    salva_e_ridisegna();
    statoLuogo(applica ? `<div class="bene">Fatto: il calendario ora usa le brinate del tuo luogo.</div>` : "");
  } catch (e) {
    if (el("box-clima")) el("box-clima").innerHTML = `<div class="pericolo">Analisi del clima non riuscita: ${esc(e.message)}</div>${htmlClima(true)}`;
  }
}

function htmlClima(soloBottone) {
  const c = S.clima;
  const imp = S.impostazioni;
  if (imp.lat == null) return `<p class="tenue">Imposta prima la posizione.</p>`;
  const bottone = `<div class="riga-bottoni"><button class="secondario" id="analizza-clima">🌡️ ${c ? "Rifai l'analisi" : "Analizza il clima"}</button></div>`;
  if (!c || soloBottone) return `<p class="tenue">Con 10 anni di temperature giornaliere del tuo punto calcolo quando cadono davvero l'ultima e la prima brinata.</p>${bottone}`;
  const righe = c.mesi.map((m, k) => `<tr><td>${MESI[k]}</td><td class="num">${m.min.toFixed(1)}</td><td class="num">${m.max.toFixed(1)}</td><td class="num">${Math.round(m.mm)}</td></tr>`).join("");
  return `
    <p>Dati giornalieri ${esc(c.anni)} (rianalisi ERA5, corretti per l'altitudine). Brinata = minima dell'aria ≤ ${SOGLIA_BRINATA} °C.</p>
    <table>
      <tr><th>Ultima brinata di primavera</th><td>di solito il <b>${c.primaveraMediana ? fmtMmdd(c.primaveraMediana) : "—"}</b>; in 4 anni su 5 entro il <b>${c.primaveraSicura ? fmtMmdd(c.primaveraSicura) : "—"}</b></td></tr>
      <tr><th>Prima brinata d'autunno</th><td>di solito il <b>${c.autunnoMediana ? fmtMmdd(c.autunnoMediana) : "—"}</b>; in 4 anni su 5 non prima del <b>${c.autunnoSicuro ? fmtMmdd(c.autunnoSicuro) : "—"}</b></td></tr>
      <tr><th>Giorni di gelo</th><td>${c.giorniGelo} all'anno (minima sotto 0 °C)</td></tr>
      <tr><th>Minima più bassa</th><td>${c.minimaAssoluta.t.toFixed(1)} °C il ${fmt(daISO(c.minimaAssoluta.data))} ${c.minimaAssoluta.data.slice(0, 4)}</td></tr>
    </table>
    <h3>Medie mensili</h3>
    <div class="scorri"><table><tr><th>Mese</th><th class="num">Min °C</th><th class="num">Max °C</th><th class="num">Pioggia mm</th></tr>${righe}</table></div>
    <p class="tenue piccolo">Il calendario usa le date «4 anni su 5»: più prudenti della media. Nelle conche e vicino al suolo può brinare anche qualche giorno dopo; vicino al lago spesso qualche giorno prima.</p>
    ${bottone}`;
}

// --- Terreno: ISRIC SoilGrids (stime a 250 m) ---------------------------------
const PROPRIETA_SUOLO = ["clay", "sand", "silt", "phh2o", "soc", "nitrogen", "cec"];

async function analizzaTerreno() {
  const imp = S.impostazioni;
  if (imp.lat == null) return;
  const box = el("box-terreno");
  const scostamenti = [[0, 0], [0.003, 0], [-0.003, 0], [0, 0.004], [0, -0.004]];
  for (const [dlat, dlon] of scostamenti) {
    if (box) box.innerHTML = `<p class="tenue">Interrogo la mappa dei suoli ISRIC SoilGrids${dlat || dlon ? " (provo un punto vicino)" : ""}…</p>`;
    const lat = imp.lat + dlat, lon = imp.lon + dlon;
    const q = PROPRIETA_SUOLO.map((p) => `property=${p}`).join("&")
      + "&depth=0-5cm&depth=5-15cm&depth=15-30cm&value=mean";
    let dati;
    try {
      dati = await scaricaJSON(`https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon}&lat=${lat}&${q}`);
    } catch (e) {
      if (box) box.innerHTML = `<div class="pericolo">Il servizio dei suoli non risponde (${esc(e.message)}). Riprova tra qualche minuto: accetta poche richieste al minuto.</div>${htmlTerreno(true)}`;
      return;
    }
    const valori = {};
    for (const l of dati.properties.layers) {
      const f = l.unit_measure.d_factor;
      valori[l.name] = l.depths.map((d) => (d.values.mean == null ? null : d.values.mean / f));
    }
    if (valori.clay?.some((v) => v != null)) {
      // Media pesata 0–30 cm (spessori 5, 10, 15 cm)
      const pesi = [5, 10, 15];
      const media = (arr) => {
        let s = 0, p = 0;
        arr.forEach((v, k) => { if (v != null) { s += v * pesi[k]; p += pesi[k]; } });
        return p ? s / p : null;
      };
      S.terreno = {
        quando: Date.now(), lat, lon, spostato: Boolean(dlat || dlon),
        strati: valori,
        media: Object.fromEntries(Object.entries(valori).map(([k, v]) => [k, media(v)])),
      };
      salva_e_ridisegna();
      return;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (box) box.innerHTML = `<div class="avviso">La mappa non ha dati per questa zona (succede nelle aree urbane o coperte da edifici).</div>${htmlTerreno(true)}`;
}

function classeTessitura(sabbia, limo, argilla) {
  const s = sabbia, l = limo, a = argilla;
  if (l + 1.5 * a < 15) return "sabbioso";
  if (l + 2 * a < 30) return "sabbioso-franco";
  if ((a >= 7 && a < 20 && s > 52) || (a < 7 && l < 50)) return "franco-sabbioso";
  if (a >= 7 && a < 27 && l >= 28 && l < 50 && s <= 52) return "franco";
  if ((l >= 50 && a >= 12 && a < 27) || (l >= 50 && l < 80 && a < 12)) return "franco-limoso";
  if (l >= 80 && a < 12) return "limoso";
  if (a >= 20 && a < 35 && l < 28 && s > 45) return "franco-sabbioso-argilloso";
  if (a >= 27 && a < 40 && s > 20 && s <= 45) return "franco-argilloso";
  if (a >= 27 && a < 40 && s <= 20) return "franco-limoso-argilloso";
  if (a >= 35 && s > 45) return "argilloso-sabbioso";
  if (a >= 40 && l >= 40) return "argilloso-limoso";
  return "argilloso";
}

const CONSIGLI_TESSITURA = {
  sabbioso: "Drena benissimo e si scalda presto in primavera, ma trattiene poca acqua e pochi nutrienti. Tanto compost ogni anno, pacciamatura e annaffiature frequenti. Ottimo per carote, patate, asparagi e meloni.",
  franco: "La tessitura ideale per l'orto: equilibrio tra drenaggio e riserva d'acqua. Basta mantenere la sostanza organica con compost o letame maturo.",
  limoso: "Fertile ma tende a fare la crosta in superficie dopo la pioggia e a compattarsi. Pacciama, non lavorarlo bagnato e aggiungi compost per dargli struttura.",
  argilloso: "Ricco e trattiene acqua e nutrienti, ma è freddo in primavera, si compatta e ristagna. Lavoralo solo in tempera, aggiungi molto compost, valuta aiuole rialzate e non calpestare le aiuole. Bene per cavoli, zucche e fagioli; difficile per le carote.",
};
function consiglioTessitura(classe) {
  if (classe.startsWith("argill") || classe.endsWith("argilloso")) return CONSIGLI_TESSITURA.argilloso;
  if (classe.startsWith("sabbioso")) return CONSIGLI_TESSITURA.sabbioso;
  if (classe.includes("limoso")) return CONSIGLI_TESSITURA.limoso;
  return CONSIGLI_TESSITURA.franco;
}
function consiglioPh(ph) {
  if (ph < 5.5) return "Acido: molti ortaggi soffrono. Correggi in autunno con calce agricola o cenere di legna (poca e ogni anno), e misura di nuovo.";
  if (ph < 6.5) return "Leggermente acido: va bene per quasi tutto l'orto (patate e fragole lo preferiscono). I cavoli gradiscono un po' di cenere o calce.";
  if (ph <= 7.5) return "Neutro: ideale per la maggior parte degli ortaggi.";
  return "Alcalino (calcareo): possibili carenze di ferro (foglie gialle con nervature verdi). Usa molta sostanza organica, evita la cenere.";
}

function htmlTerreno(soloBottone) {
  const t = S.terreno;
  const imp = S.impostazioni;
  if (imp.lat == null) return `<p class="tenue">Imposta prima la posizione.</p>`;
  const bottone = `<div class="riga-bottoni"><button class="secondario" id="analizza-terreno">🟤 ${t ? "Rifai la stima" : "Stima il terreno dalla mappa"}</button></div>`;
  const avvertenza = `<p class="tenue piccolo">Attenzione: è una stima della mappa mondiale ISRIC SoilGrids (celle di 250 m, ricavata da modelli), non un'analisi del tuo orto. Un orto lavorato e concimato per anni è spesso diverso, soprattutto in sostanza organica e pH. Per dati veri: un'analisi di laboratorio (30–60 €, per esempio presso un consorzio agrario) oppure da te la prova del barattolo per la tessitura e un kit per il pH.</p>`;
  if (!t || soloBottone) return `<p class="tenue">Ricava tessitura (sabbia, limo, argilla), pH e sostanza organica dalla mappa dei suoli.</p>${bottone}${avvertenza}`;
  const m = t.media;
  const classe = classeTessitura(m.sand, m.silt, m.clay);
  const so = m.soc != null ? (m.soc * 1.72) / 10 : null; // sostanza organica %
  const giudizioSo = so == null ? "" : so < 1.5 ? "bassa: aggiungi compost ogni anno" : so < 3 ? "media" : "buona";
  const cec = m.cec;
  const giudizioCec = cec == null ? "" : cec < 10 ? "bassa (trattiene pochi nutrienti: concima poco e spesso)" : cec <= 25 ? "media" : "alta (trattiene bene i nutrienti)";
  const strati = ["0–5 cm", "5–15 cm", "15–30 cm"];
  const riga = (nome, k, cifre = 0, mult = 1) => `<tr><td>${nome}</td>${t.strati[k].map((v) => `<td class="num">${v == null ? "—" : (v * mult).toFixed(cifre)}</td>`).join("")}</tr>`;
  return `
    <p><b>Terreno ${classe}</b>${t.spostato ? ` <span class="tenue">(dato di un punto a qualche centinaio di metri)</span>` : ""}</p>
    <p>Sabbia ${Math.round(m.sand)}% · limo ${Math.round(m.silt)}% · argilla ${Math.round(m.clay)}%</p>
    <p>${esc(consiglioTessitura(classe))}</p>
    <p><b>pH ${m.phh2o.toFixed(1)}</b>: ${esc(consiglioPh(m.phh2o))}</p>
    ${so != null ? `<p><b>Sostanza organica circa ${so.toFixed(1)}%</b> nei primi 30 cm: ${giudizioSo}.</p>` : ""}
    ${cec != null ? `<p><b>Capacità di scambio ${cec.toFixed(0)} cmol/kg</b>: ${giudizioCec}.</p>` : ""}
    <h3>Per profondità</h3>
    <div class="scorri"><table>
      <tr><th></th>${strati.map((s) => `<th class="num">${s}</th>`).join("")}</tr>
      ${riga("Sabbia %", "sand")}${riga("Limo %", "silt")}${riga("Argilla %", "clay")}
      ${riga("pH", "phh2o", 1)}${riga("Carbonio org. g/kg", "soc")}${riga("Azoto g/kg", "nitrogen", 1)}${riga("CSC cmol/kg", "cec")}
    </table></div>
    ${avvertenza}
    ${bottone}`;
}

function modificaDateBrinate() {
  const imp = S.impostazioni;
  const anno = oggi().getFullYear();
  modulo({
    titolo: "Date delle brinate",
    campi: [
      { id: "u", etichetta: "Ultima brinata di primavera", tipo: "date", valore: `${anno}-${imp.ultimaBrinata}`, richiesto: true },
      { id: "p", etichetta: "Prima brinata d'autunno", tipo: "date", valore: `${anno}-${imp.primaBrinata}`, richiesto: true },
    ],
    extra: `<p class="tenue piccolo">Conta solo giorno e mese. Valori iniziali per 430 m vicino al lago di Lecco: 20 aprile e 10 novembre.</p>`,
    salva: (v) => {
      imp.ultimaBrinata = v.u.slice(5);
      imp.primaBrinata = v.p.slice(5);
    },
  });
}

// --- Copie automatiche ----------------------------------------------------------
// A ogni apertura dell'app (non nell'orto didattico), se l'orto è cambiato dall'ultima
// copia, ne tengo una in IndexedDB (database «orto-copie», una lista per ogni orto =
// CHIAVE), le ultime MAX_COPIE. Servono contro gli errori (cancellato per sbaglio,
// piano accettato male); se si perde il telefono spariscono: per quello c'è «Invia copia».
const DB_COPIE = "orto-copie", MAX_COPIE = 20;
function apriDbCopie() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(DB_COPIE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("copie", { keyPath: "id", autoIncrement: true }).createIndex("chiave", "chiave");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}
async function copieAutomatiche() {
  if (!window.indexedDB) return [];
  const db = await apriDbCopie();
  return new Promise((ok, ko) => {
    const q = db.transaction("copie").objectStore("copie").index("chiave").getAll(CHIAVE);
    q.onsuccess = () => ok(q.result.sort((x, y) => y.id - x.id));
    q.onerror = () => ko(q.error);
  });
}
async function eliminaCopiaAutomatica(id) {
  const db = await apriDbCopie();
  return new Promise((ok, ko) => {
    const t = db.transaction("copie", "readwrite");
    t.objectStore("copie").delete(id);
    t.oncomplete = () => ok();
    t.onerror = () => ko(t.error);
  });
}
async function copiaAutomatica() {
  if (IN_PROVA || !window.indexedDB) return;
  if (S.aiuole.filter((a) => !a.semenzaio).length === 0 && !S.impianti.length) return; // orto ancora vuoto
  try {
    const testo = JSON.stringify(S);
    const copie = await copieAutomatiche();
    if (copie[0]?.testo === testo) return; // niente di nuovo dall'ultima copia
    const db = await apriDbCopie();
    const tx = db.transaction("copie", "readwrite"), st = tx.objectStore("copie");
    st.add({ chiave: CHIAVE, quando: new Date().toISOString(), testo, riassunto: contaOrto(S) });
    for (const c of copie.slice(MAX_COPIE - 1)) st.delete(c.id);
    await new Promise((ok, ko) => { tx.oncomplete = ok; tx.onerror = () => ko(tx.error); });
  } catch (e) {
    console.warn("copia automatica", e);
  }
}
async function finestraCopieAutomatiche() {
  const copie = await copieAutomatiche().catch(() => []);
  const ora = (iso) => { const d = new Date(iso); return `${fmtLungo(d)}, ore ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };
  apriFinestra(`<h2>🕘 Copie automatiche</h2>
    <p class="tenue piccolo">Ogni volta che apri l'app, se l'orto è cambiato, l'app ne tiene una copia qui sul telefono (le ultime ${MAX_COPIE}). Servono se cancelli o cambi qualcosa per sbaglio. Se perdi o cambi telefono spariscono anche loro: per quello c'è «📤 Invia copia».</p>
    ${copie.length ? `<ul class="elenco">${copie.map((c, k) => `<li><div class="riga" style="display:flex;justify-content:space-between;gap:8px;align-items:center">
      <span><b>${ora(c.quando)}</b>${k === 0 ? " <span class=\"chip\">la più recente</span>" : ""}<br><span class="tenue piccolo">${esc(c.riassunto || "")}</span></span>
      <span style="white-space:nowrap"><button class="piccolo" data-ripristina-copia="${c.id}">↩️ Ripristina</button>
      <button class="piccolo secondario" data-scarica-copia="${c.id}" title="Scarica il file">💾</button>
      <button class="piccolo secondario" data-elimina-copia="${c.id}" title="Elimina questa copia">🗑️</button></span></div></li>`).join("")}</ul>`
      : `<p>Ancora nessuna copia: la prima arriva la prossima volta che apri l'app.</p>`}
    <div class="riga-bottoni"><button class="secondario" data-chiudi>Chiudi</button></div>`, (f) => {
    f.querySelectorAll("[data-scarica-copia]").forEach((b) => b.addEventListener("click", () => {
      const c = copie.find((x) => x.id === Number(b.dataset.scaricaCopia));
      if (c) scaricaFile(`orto-copia-${c.quando.slice(0, 10)}.json`, JSON.stringify(JSON.parse(c.testo), null, 1), "application/json");
    }));
    f.querySelectorAll("[data-elimina-copia]").forEach((b) => b.addEventListener("click", async () => {
      const c = copie.find((x) => x.id === Number(b.dataset.eliminaCopia));
      if (!c || !confirm(`Eliminare la copia del ${ora(c.quando)} (${c.riassunto})?`)) return;
      try { await eliminaCopiaAutomatica(c.id); } catch (e) { alert("Non riesco a eliminarla: " + e.message); return; }
      finestraCopieAutomatiche();
    }));
    f.querySelectorAll("[data-ripristina-copia]").forEach((b) => b.addEventListener("click", async () => {
      const c = copie.find((x) => x.id === Number(b.dataset.ripristinaCopia));
      if (!c || !confirm(`Tornare all'orto com'era il ${ora(c.quando)} (${c.riassunto})?\nQuello di adesso resta tra le copie automatiche.`)) return;
      await copiaAutomatica(); // prima tengo da parte l'orto di adesso
      localStorage.setItem(CHIAVE, c.testo);
      S = carica();
      chiudiFinestra();
      disegna();
      alert("Orto ripristinato.");
    }));
  });
}
// Promemoria in Oggi: nessuna copia mandata fuori dal telefono da più di 30 giorni.
function htmlPromemoriaCopia() {
  if (IN_PROVA || S.impianti.length < 3) return "";
  const u = S.impostazioni.ultimaCopia;
  if (u && giorniTra(daISO(u), oggi()) < 30) return "";
  return `<div class="avviso">💾 ${u ? `L'ultima copia dell'orto mandata fuori dal telefono è del ${fmtLungo(daISO(u))}` : "Non hai ancora mandato una copia dell'orto fuori dal telefono"}: se il telefono si rompe i dati si perdono. In 📍 Luogo tocca <b>📤 Invia copia</b> e mandala a te stesso.</div>`;
}

// --- Copia di sicurezza e promemoria -----------------------------------------
function esportaDati() {
  S.impostazioni.ultimaCopia = aISO(oggi());
  S.impostazioni.proprietario = profiloAttivo().nome || "";
  salva();
  scaricaFile(`orto-copia-${aISO(oggi())}.json`, JSON.stringify(S, null, 1), "application/json");
}

// «Invia copia»: una finestrella con le scelte. Sul telefono il menu Condividi
// (WhatsApp, email, Drive…: lì si sceglie l'app); sul computer, dove i siti non
// possono allegare file, la copia si scarica e si apre WhatsApp Web o la posta,
// con le istruzioni per allegarla. Chrome su Android non condivide file .json:
// la copia parte come .txt (il contenuto è lo stesso).
function fileCopia() {
  S.impostazioni.ultimaCopia = aISO(oggi());
  S.impostazioni.proprietario = profiloAttivo().nome || ""; // chi la riceve sa di chi è l'orto
  salva();
  const nome = `orto-copia-${aISO(oggi())}.txt`;
  return { nome, testo: JSON.stringify(S, null, 1) };
}
async function condividiCopia() {
  const { nome, testo } = fileCopia();
  const file = new File([testo], nome, { type: "text/plain" });
  try {
    await navigator.share({ files: [file], title: "Copia dell'orto", text: "Copia di sicurezza dell'app Il mio orto" });
    chiudiFinestra();
  } catch (e) {
    if (e.name !== "AbortError") alert("Invio non riuscito: " + e.message);
  }
}
function scaricaCopia() {
  const { nome, testo } = fileCopia();
  scaricaFile(nome, testo, "text/plain");
  return nome;
}
function inviaCopia() {
  const telefono = Boolean(navigator.canShare && navigator.canShare({ files: [new File(["x"], "x.txt", { type: "text/plain" })] }));
  const chi = profiloAttivo().nome ? ` di ${profiloAttivo().nome}` : "";
  apriFinestra(`<h2>📤 Invia la copia dell'orto${esc(chi)}</h2>
    <p class="tenue piccolo">È un file con tutto l'orto: aiuole, colture, diario. Serve come copia di sicurezza o per farlo vedere a qualcuno.</p>
    <div class="riga-bottoni" style="flex-direction:column;align-items:stretch">
      ${telefono
        ? `<button id="copia-condividi">📤 WhatsApp, email, Drive… (scegli l'app)</button>`
        : `<button id="copia-whatsapp">💬 WhatsApp</button><button id="copia-email">✉️ Email</button>`}
      <button class="secondario" id="copia-scarica">💾 Scarica il file</button>
      <button class="secondario" data-chiudi>Annulla</button>
    </div>
    <div id="copia-come"></div>`, (f) => {
    const come = (html) => { f.querySelector("#copia-come").innerHTML = html; };
    f.querySelector("#copia-condividi")?.addEventListener("click", condividiCopia);
    f.querySelector("#copia-scarica").addEventListener("click", () => {
      const nome = scaricaCopia();
      come(`<div class="bene">💾 Scaricato: <b>${esc(nome)}</b>, nella cartella <b>Download</b>.</div>`);
    });
    f.querySelector("#copia-whatsapp")?.addEventListener("click", () => {
      const nome = scaricaCopia();
      window.open("https://web.whatsapp.com/", "_blank", "noopener");
      come(`<div class="bene">💬 Ho scaricato <b>${esc(nome)}</b> nella cartella <b>Download</b> e aperto WhatsApp Web.
        Lì apri la chat, tocca <b>📎</b> (o ＋) → <b>Documento</b> e scegli il file dalla cartella Download.</div>`);
    });
    f.querySelector("#copia-email")?.addEventListener("click", () => {
      const nome = scaricaCopia();
      const corpo = `Ciao, ti mando la copia del mio orto (file ${nome}, allegato).\n\nPer aprirla: app «Il mio orto» → 📍 Luogo → 📥 Aggiungi l'orto di un'altra persona, e scegli il file.`;
      location.href = `mailto:?subject=${encodeURIComponent("Copia dell'orto" + chi)}&body=${encodeURIComponent(corpo)}`;
      come(`<div class="bene">✉️ Ho scaricato <b>${esc(nome)}</b> nella cartella <b>Download</b> e preparato l'email.
        Aggiungi il destinatario, poi <b>📎 Allega</b> il file dalla cartella Download e invia.</div>`);
    });
  });
}

function importaDati(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const s = JSON.parse(r.result);
      if (!s.impostazioni || !Array.isArray(s.aiuole)) throw new Error("non è una copia di questa app");
      if (!confirm("Sostituire tutti i dati attuali con quelli del file?")) return;
      localStorage.setItem(CHIAVE, JSON.stringify(s));
      S = carica();
      disegna();
      alert("Dati ripristinati.");
    } catch (e) {
      alert("File non valido: " + e.message);
    }
  };
  r.readAsText(file);
}

function esportaIcs() {
  const ora = oggi();
  const fino = piuGiorni(ora, 365);
  const voci = [];
  for (const i of impiantiAttivi()) {
    for (const s of stimeImpianto(i)) {
      if (s.data >= ora) voci.push({ data: s.data, titolo: `🌱 ${s.testo}`, desc: `Stima dal diario dell'orto (${nomeAiuolaId(i.aiuolaId)}).` });
    }
  }
  for (const v of attivitaInProgramma(365)) {
    voci.push({ data: v.data, titolo: `🔔 ${v.titolo}`, desc: [v.dove, v.testo, "Dal diario dell'orto."].filter(Boolean).join(" · "), settimanaPrima: true });
  }
  for (const id of S.impostazioni.preferiti) {
    const o = PER_ID[id];
    for (const f of ["sem", "dir", "tra"]) {
      for (const w of finestreTra(o, f, ora, fino)) {
        if (w.inizio >= ora && w.inizio <= fino) {
          voci.push({ data: w.inizio, titolo: `${o.emoji} ${FASI[f].verbo}: ${o.nome}`, desc: `Periodo consigliato fino al ${fmt(w.fine)}.` });
        }
      }
    }
  }
  if (!voci.length) {
    alert("Non c'è niente da mettere in calendario: aggiungi colture nell'orto o segna con ★ i tuoi ortaggi.");
    return;
  }
  const d = (x) => aISO(x).replaceAll("-", "");
  const testoIcs = (s) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const righe = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Il mio orto//IT", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Orto"];
  voci.forEach((v, k) => {
    righe.push("BEGIN:VEVENT", `UID:orto-${d(v.data)}-${k}@ilmioorto`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d(v.data)}`, `DTEND;VALUE=DATE:${d(piuGiorni(v.data, 1))}`,
      `SUMMARY:${testoIcs(v.titolo)}`, `DESCRIPTION:${testoIcs(v.desc)}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${testoIcs(v.titolo)}`, "TRIGGER:PT8H", "END:VALARM",
      // Per le attività del diario anche un avviso una settimana prima, alle 8.
      ...(v.settimanaPrima ? ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${testoIcs("Tra una settimana: " + v.titolo)}`, "TRIGGER:-P6DT16H", "END:VALARM"] : []),
      "END:VEVENT");
  });
  righe.push("END:VCALENDAR");
  scaricaFile(`orto-promemoria-${aISO(ora)}.ics`, righe.join("\r\n"), "text/calendar");
}

// -----------------------------------------------------------------------------
// Disegno e navigazione
// -----------------------------------------------------------------------------
function rotta() {
  const h = location.hash.replace(/^#/, "") || "oggi";
  const [vista, param] = h.split("/");
  return { vista: ["oggi", "calendario", "orto", "diario", "luogo", "piano", "aiuto", "missioni", "medaglie", "vicini", "dopo"].includes(vista) ? vista : "oggi", param };
}

// Se la finestra cambia molto di larghezza (PC, telefono girato), ridisegno la pianta.
let larghezzaDisegno = window.innerWidth;
window.addEventListener("resize", () => {
  clearTimeout(window.attesaResize);
  window.attesaResize = setTimeout(() => {
    if (Math.abs(window.innerWidth - larghezzaDisegno) < 80 || rotta().vista !== "orto") return;
    larghezzaDisegno = window.innerWidth;
    disegna();
  }, 300);
});

function disegna() {
  timbraScacchiere();
  const { vista, param } = rotta();
  const app = el("app");
  const imp = S.impostazioni;
  el("sottotitolo").textContent = (!IN_PROVA && profili().length > 1 ? `👤 ${nomeProfilo(profiloAttivo())} · ` : "")
    + (imp.luogo ? `${imp.luogo}${imp.altitudine != null ? ` · ${Math.round(imp.altitudine)} m` : ""}` : fmtLungo(oggi()));
  document.querySelectorAll(".schede a").forEach((a) => a.classList.toggle("attiva", a.dataset.vista === (vista === "piano" ? "orto" : vista === "medaglie" ? "diario" : ["vicini", "dopo"].includes(vista) ? "calendario" : vista)));

  document.body.dataset.vista = vista; // sul PC la scheda Orto è più larga (vedi style.css)
  const viste = { oggi: vistaOggi, calendario: vistaCalendario, orto: () => vistaOrto(param), diario: vistaDiario, luogo: vistaLuogo, piano: vistaPiano, aiuto: vistaAiuto, missioni: () => vistaMissioni(), medaglie: () => vistaMedaglie(), vicini: vistaVicini, dopo: vistaDopo };
  const scroll = window.scrollY;
  app.innerHTML = viste[vista]();
  if (disegna.ultima === location.hash) window.scrollTo(0, scroll);
  disegna.ultima = location.hash;

  if (vista === "oggi") dopoOggi();
  collega(app);
  if (vista === "piano") collegaPiano(app);
  if (vista === "luogo") collegaProfili(app);
  if (vista === "missioni" || (vista === "medaglie" && IN_PROVA)) collegaMissioni(app);
}

// Collega i bottoni della vista corrente.
function collega(root) {
  const su = (sel, fn) => root.querySelectorAll(sel).forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); fn(b, e); }));
  const imp = (id) => S.impianti.find((i) => i.id === id);
  su("[data-ortaggio]", (b) => schedaOrtaggio(b.dataset.ortaggio));
  su("[data-vasi]", (b) => {
    const o = PER_ID[b.dataset.vasi];
    S.eventi.push({ id: nuovoId(), tipo: "lavoro", data: aISO(oggi()), aiuolaId: b.dataset.aiuola, impiantoId: "", kg: null, vasi: b.dataset.vasi,
      testo: `Vasi rinnovati (${o.nome.split(" (")[0].toLowerCase()}): terra rimescolata con compost e concime` });
    salva_e_ridisegna();
  });
  su("[data-agrumi]", (b) => {
    const riparo = b.dataset.agrumi === "riparo";
    S.eventi.push({ id: nuovoId(), tipo: "lavoro", data: aISO(oggi()), aiuolaId: "", impiantoId: "", kg: null, agrumi: b.dataset.agrumi,
      testo: riparo ? "Agrumi in vaso messi al riparo per l'inverno" : "Agrumi in vaso riportati fuori" });
    salva_e_ridisegna();
  });
  ["cerca-vicini", "cerca-dopo"].forEach((c) => el(c)?.addEventListener("input", (e) => {
    const t = e.target.value.trim().toLowerCase();
    document.querySelectorAll("table.vicini tbody tr").forEach((tr) => { tr.hidden = Boolean(t) && !tr.dataset.cerca.includes(t); });
  }));
  su("[data-storico]", (b) => finestraStorico(imp(b.dataset.storico)));
  su("[data-trapianta]", (b) => moduloTrapianto(imp(b.dataset.trapianta)));
  su("[data-raccolto]", (b) => moduloEvento({ tipo: "raccolto", impiantoId: b.dataset.raccolto, aiuolaId: imp(b.dataset.raccolto)?.aiuolaId }));
  su("[data-evento-imp]", (b) => moduloEvento({ tipo: "nota", impiantoId: b.dataset.eventoImp, aiuolaId: imp(b.dataset.eventoImp)?.aiuolaId }));
  su("[data-modifica-imp]", (b) => moduloImpianto({ impianto: imp(b.dataset.modificaImp) }));
  su("[data-fine]", (b) => chiudiImpianto(imp(b.dataset.fine)));
  su("[data-modifica-ev]", (b) => moduloEvento({ evento: S.eventi.find((e) => e.id === b.dataset.modificaEv) }));
  su("#nuova-aiuola", () => moduloAiuola());
  su("[data-celle-mancanti]", (b) => moduloCelleMancanti(aiuola(b.dataset.celleMancanti)));
  su("#piu-aiuole", () => moduloPiuAiuole());
  su("[data-zona-vista]", (b) => { S.impostazioni.zonaVista = b.dataset.zonaVista; salva_e_ridisegna(); });
  su("[data-zona]", (b) => moduloZona(b.dataset.zona));
  su("#nuova-coltura", () => moduloImpianto({}));
  su("#diagnosi", () => apriDiagnosi());
  su("[data-diagnosi-imp]", (b) => { const i = imp(b.dataset.diagnosiImp); apriDiagnosi({ ortaggioId: i?.ortaggioId, aiuolaId: i?.aiuolaId, impiantoId: i?.id }); });
  su("[data-concima]", (b) => { const a = aiuola(b.dataset.concima); moduloEvento({ tipo: "concimazione", aiuolaId: a.id, testo: testoConcimazione(a) }); });
  su("#nuovo-evento", () => moduloEvento({}));
  su("#inizia-prova", () => iniziaProva());
  su("#esci-prova", () => esciProva());

  const { param } = rotta();
  const a = param && aiuola(param);
  if (a) {
    su("#coltura-qui", () => moduloImpianto({ aiuolaId: a.id }));
    su("[data-intercalare]", (b) => moduloImpianto({ aiuolaId: a.id, ortaggioId: b.dataset.intercalare, celle: S.impianti.find((x) => x.id === b.dataset.intercalareDi)?.celle }));
    su("#piantine-comprate", () => moduloAcquisto());
    su("[data-cella-nuova]", (b) => moduloImpianto({ aiuolaId: a.id, celle: [b.dataset.cellaNuova], griglia: b.dataset.griglia }));
    su("#evento-qui", () => moduloEvento({ tipo: "lavoro", aiuolaId: a.id }));
    su("#modifica-aiuola", () => padreDi(a) ? moduloParte(a, padreDi(a)) : moduloAiuola(a));
    su("#dividi", () => moduloDividi(a));
    su("#nuova-parte", () => moduloParte(null, a));
    su("#elimina-aiuola", () => {
      // Aiuola divisa: se ne vanno anche le sue parti.
      const via = new Set([a.id, ...partiDi(a).map((b) => b.id)]);
      const n = S.impianti.filter((i) => via.has(i.aiuolaId)).length;
      const padre = padreDi(a);
      if (!confirm(`Eliminare ${padre ? "la parte" : "l'aiuola"} «${nomeAiuola(a)}»${via.size > 1 ? ` con le sue ${via.size - 1} parti` : ""}${n ? ` e tutta la sua storia (${n} colture)` : ""}?`)) return;
      S.aiuole = S.aiuole.filter((x) => !via.has(x.id));
      S.impianti = S.impianti.filter((i) => !via.has(i.aiuolaId));
      S.eventi = S.eventi.filter((e) => !via.has(e.aiuolaId));
      salva();
      location.hash = padre ? `#orto/${padre.id}` : "#orto";
    });
  }

  el("anno-diario")?.addEventListener("change", (e) => { annoDiario = e.target.value; disegna(); });
  el("anno-pianta")?.addEventListener("change", (e) => { annoPianta = e.target.value || null; disegna(); });
  su("#gps", prendiGPS);
  su("#manuale", posizioneManuale);
  su("#analizza-clima", () => analizzaClima(true));
  su("#analizza-terreno", analizzaTerreno);
  su("#date-brinate", modificaDateBrinate);
  su("#invia", inviaCopia);
  su("#esporta", esportaDati);
  su("#copie-automatiche", finestraCopieAutomatiche);
  su("#importa", () => el("file-importa").click());
  el("file-importa")?.addEventListener("change", (e) => { if (e.target.files[0]) importaDati(e.target.files[0]); });
  su("#ics", esportaIcs);
}

window.addEventListener("hashchange", () => { chiudiFinestra(); disegna(); });

// Il meteo si aggiorna quando si torna sull'app.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && rotta().vista === "oggi") dopoOggi();
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  // Quando arriva una versione nuova dell'app (nuovo sw.js) la propongo.
  const giaControllata = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!giaControllata || el("aggiornamento")) return;
    const b = document.createElement("button");
    b.id = "aggiornamento";
    b.textContent = "🔄 C'è una versione nuova dell'app: tocca per aggiornare";
    b.style.cssText = "position:fixed;left:12px;right:12px;bottom:84px;z-index:30;justify-content:center";
    b.addEventListener("click", () => location.reload());
    document.body.appendChild(b);
  });
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch((e) => console.warn("service worker", e));
}
navigator.storage?.persist?.();

// Primo disegno quando sono caricati tutti i file (prova.js e riconosci.js vengono dopo).
// Poi la copia automatica dell'orto (se è cambiato dall'ultima).
document.addEventListener("DOMContentLoaded", () => { disegna(); setTimeout(copiaAutomatica, 1500); });
