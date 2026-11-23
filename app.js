// =============================================================================
// Il mio orto: calendario su misura, aiuole e diario.
// Tutti i dati restano sul telefono (localStorage). Servizi esterni usati solo
// con la posizione dell'orto: Open-Meteo (meteo, clima, altitudine),
// BigDataCloud (nome del luogo), ISRIC SoilGrids (terreno).
// =============================================================================
"use strict";

const CHIAVE = "ilmioorto.v1";
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
const MODI = { sem: "Semina in semenzaio", dir: "Semina a terra", tra: "Trapianto (piantine)" };
const TIPI_EVENTO = {
  raccolto: "🧺 Raccolto",
  annaffiatura: "💧 Annaffiatura",
  concimazione: "🟤 Concimazione",
  trattamento: "🧴 Trattamento",
  lavoro: "🛠️ Lavoro",
  nota: "📝 Nota",
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
  return o ? `${o.emoji} ${o.nome}` : id;
}
function aiuola(id) { return S.aiuole.find((a) => a.id === id); }
const COPERTURE = { "": "All'aperto", serra: "In serra o tunnel" };
const PACCIAMATURE = { "": "Terra nuda", telo: "Telo di pacciamatura", organica: "Paglia, foglie o erba" };
const ANTICIPO_SERRA = 21; // giorni: in serra si semina prima e si raccoglie più a lungo
function inSerra(aiuolaId) { return aiuola(aiuolaId)?.copertura === "serra"; }
function corridoioZona(zona) {
  const c = S.zone?.[zona]?.corridoio;
  return c == null ? CORRIDOIO : c;
}
function tipoAiuola(a) {
  return [a.copertura === "serra" ? "in serra" : "", a.pacciamatura ? PACCIAMATURE[a.pacciamatura].toLowerCase() : ""].filter(Boolean).join(" · ");
}
function zone() {
  return [...new Set(S.aiuole.filter((a) => !a.semenzaio).map((a) => a.zona || ZONA_PREDEFINITA))];
}
// Semenzaio, poi per zona e per numero (da sinistra a destra).
function aiuoleOrdinate() {
  const z = zone();
  return [...S.aiuole].sort((x, y) => (y.semenzaio ? 1 : 0) - (x.semenzaio ? 1 : 0)
    || z.indexOf(x.zona || ZONA_PREDEFINITA) - z.indexOf(y.zona || ZONA_PREDEFINITA)
    || (Number(x.numero) || 0) - (Number(y.numero) || 0));
}
// Orto scelto coi bottoni in cima alla scheda Orto ("" = tutti).
function zonaScelta() {
  const z = S.impostazioni.zonaVista;
  return z && zone().includes(z) ? z : "";
}
function nomeAiuola(a) {
  if (!a) return "";
  if (a.semenzaio) return a.nome;
  const base = a.nome ? `${a.numero} · ${a.nome}` : `Aiuola ${a.numero}`;
  return zone().length > 1 ? `${base} (${a.zona || ZONA_PREDEFINITA})` : base;
}
function nomeAiuolaId(id) { return nomeAiuola(aiuola(id)); }
function misureAiuola(a) {
  if (a.larghezza && a.lunghezza) return `${fmtM(a.larghezza)} × ${fmtM(a.lunghezza)} m · ${fmtM(a.larghezza * a.lunghezza)} m²`;
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
  if (i.modo === "sem" && aiuola(i.aiuolaId)?.semenzaio) {
    const trap = piuGiorni(data, (o.semTrap || 6) * 7);
    out.push({ tipo: "tra", data: trap, testo: `Trapianto di ${o.nome}` });
    if (o.gg) out.push({ tipo: "rac", data: inStagioneDiRaccolta(o, piuGiorni(trap, o.gg)), testo: `Prima raccolta di ${o.nome}` });
  } else if (o.gg) {
    out.push({ tipo: "rac", data: inStagioneDiRaccolta(o, piuGiorni(data, o.gg)), testo: `Prima raccolta di ${o.nome}` });
  }
  return out;
}

// Rotazione: stessa famiglia nella stessa aiuola negli ultimi anni.
// Con la scacchiera conta solo chi stava nelle stesse caselle (o su tutta l'aiuola).
function avvisiRotazione(aiuolaId, ortaggioId, dataISO, escludiId, celle) {
  const o = PER_ID[ortaggioId];
  if (!o || aiuola(aiuolaId)?.semenzaio) return [];
  const data = daISO(dataISO);
  const avvisi = [];
  for (const i of S.impianti) {
    if (i.id === escludiId || i.aiuolaId !== aiuolaId) continue;
    const altro = PER_ID[i.ortaggioId];
    if (!altro || altro.fam !== o.fam) continue;
    if (celle?.length && i.celle?.length && !i.celle.some((c) => celle.includes(c))) continue;
    const d = daISO(i.data);
    const anni = data.getFullYear() - d.getFullYear();
    if (anni >= 1 && anni < ANNI_ROTAZIONE) {
      avvisi.push(`Nel ${d.getFullYear()} qui c'era ${altro.nome.toLowerCase()} (${FAMIGLIE[o.fam].toLowerCase()}): meglio aspettare ${ANNI_ROTAZIONE} anni prima di rimettere la stessa famiglia.`);
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
function celleValide(a, celle) {
  const g = grigliaAiuola(a);
  return haGriglia(a) ? (celle || []).filter((x) => { const q = cellaRC(x); return q.r >= 0 && q.r < g.righe && q.c >= 0 && q.c < g.colonne; }) : [];
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
function occupazione(aiuolaId, escludiId) {
  const mappa = {};
  for (const i of impiantiAttivi(aiuolaId)) {
    if (i.id === escludiId) continue;
    for (const c of i.celle || []) (mappa[c] ??= []).push(i);
  }
  return mappa;
}

// Scacchiera cliccabile nei moduli: scrive le caselle scelte nel campo nascosto "celle".
function aggiornaSceltaCelle(form, aiuolaId, escludiId) {
  const contenitore = form.querySelector("#w_celle");
  const a = aiuola(aiuolaId);
  if (!haGriglia(a)) {
    contenitore.hidden = true;
    form.elements.celle.value = "";
    return "";
  }
  contenitore.hidden = false;
  const g = grigliaAiuola(a);
  const scelte = new Set(celleValide(a, form.elements.celle.value.split(",").filter(Boolean)));
  form.elements.celle.value = [...scelte].join(",");
  const occ = occupazione(aiuolaId, escludiId);
  const rett = form.dataset.rettangolo === "1", angolo = form.dataset.angolo || "";
  let h = `<div class="comandi-celle">
    <div class="campo-check"><input type="checkbox" id="m_rett" ${rett ? "checked" : ""}><label for="m_rett" style="margin:0">Rettangolo: tocca due angoli</label></div>
    <button type="button" class="piccolo" data-celle-nessuna>Nessuna casella</button></div>
    <p class="tenue piccolo" style="margin:2px 0">${scelte.size ? `Scelte: <b>${esc(testoListaCelle([...scelte]))}</b>` : "Nessuna casella scelta: la coltura occupa tutta l'aiuola."}${angolo ? ` · Primo angolo: <b>${angolo}</b>, ora tocca l'angolo opposto.` : ""}${misuraCasella(a) ? ` · ${misuraCasella(a)}` : ""}</p>
    <div class="scorri-scacchiera">${intestazioneGriglia(g)}`;
  for (let r = 0; r < g.righe; r++) {
    h += `<span class="intest riga">${nomeRiga(r)}</span>`;
    for (let c = 0; c < g.colonne; c++) {
      const n = nomeCella(r, c);
      const chi = (occ[n] || []).map((i) => PER_ID[i.ortaggioId]?.emoji ?? "🌱").join("");
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
  return sovrapposte.length
    ? `<div class="avviso">Caselle già occupate: ${esc(testoListaCelle(sovrapposte))} (${nomi.map(esc).join(", ")}).</div>`
    : "";
}
function campoCelle(valore) {
  return { id: "celle", etichetta: "Caselle dell'aiuola (tocca per scegliere; nessuna = tutta l'aiuola)", tipo: "celle", valore: (valore || []).join(","), nascosto: true };
}

function avvisiVicini(aiuolaId, ortaggioId, escludiId, celle) {
  if (aiuola(aiuolaId)?.semenzaio) return { buoni: [], cattivi: [] };
  const vicini = impiantiAttivi(aiuolaId).filter((i) => i.id !== escludiId && confinanti(celle, i.celle)).map((i) => i.ortaggioId);
  const amici = amiciDi(ortaggioId), nemici = nemiciDi(ortaggioId);
  return {
    buoni: [...new Set(vicini.filter((v) => amici.includes(v)))],
    cattivi: [...new Set(vicini.filter((v) => nemici.includes(v)))],
  };
}

function htmlAvvisi(aiuolaId, ortaggioId, dataISO, escludiId, celle) {
  if (!aiuolaId || !ortaggioId || !dataISO) return "";
  const o = PER_ID[ortaggioId];
  let h = "";
  for (const t of avvisiRotazione(aiuolaId, ortaggioId, dataISO, escludiId, celle)) h += `<div class="avviso">🔄 ${esc(t)}</div>`;
  const v = avvisiVicini(aiuolaId, ortaggioId, escludiId, celle);
  if (v.cattivi.length) h += `<div class="pericolo">⚠️ ${esc(o.nome)} non sta bene vicino a: ${v.cattivi.map((x) => esc(PER_ID[x].nome.toLowerCase())).join(", ")}.</div>`;
  if (v.buoni.length) h += `<div class="bene">🤝 Buoni vicini: ${v.buoni.map((x) => esc(PER_ID[x].nome.toLowerCase())).join(", ")}.</div>`;
  // Finestra di stagione
  const d = daISO(dataISO);
  const modo = aiuola(aiuolaId)?.semenzaio ? "sem" : null;
  const fasiOk = modo ? ["sem"] : ["dir", "tra"];
  // In serra si può partire qualche settimana prima e finire dopo.
  const margine = inSerra(aiuolaId) ? ANTICIPO_SERRA : 0;
  const dentro = fasiOk.some((f) => finestreTra(o, f, piuGiorni(d, -margine), piuGiorni(d, margine)).length);
  if (!dentro && fasiOk.some((f) => (o[f] || []).length)) {
    h += `<div class="avviso">📅 Questa data è fuori dal periodo consigliato per ${esc(o.nome.toLowerCase())}${margine ? ", anche contando 3 settimane di vantaggio della serra" : ""} (guarda il calendario).</div>`;
  }
  return h;
}

// -----------------------------------------------------------------------------
// Finestra di dialogo con modulo
// -----------------------------------------------------------------------------
function apriFinestra(html, dopo) {
  const f = el("finestra");
  f.innerHTML = `<div class="contenuto">${html}</div>`;
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
      return `<label for="m_${c.id}">${esc(c.etichetta)}</label><select id="m_${c.id}" name="${c.id}" ${req}>
        ${c.opzioni.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(val) ? "selected" : ""}>${esc(t)}</option>`).join("")}
      </select>`;
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
  return aiuoleOrdinate().filter((a) => conSemenzaio || !a.semenzaio).map((a) => [a.id, nomeAiuola(a)]);
}

function prossimoNumero(zona) {
  return Math.max(0, ...S.aiuole.filter((x) => !x.semenzaio && (x.zona || ZONA_PREDEFINITA) === zona).map((x) => Number(x.numero) || 0)) + 1;
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
    titolo: a ? "Modifica aiuola" : "Nuova aiuola",
    campi: [
      { id: "zona", etichetta: "Zona (es. Orto, Serra)", valore: zonaIniziale, lista: [...new Set([...zone(), "Orto", "Serra"])], richiesto: true },
      { id: "numero", etichetta: "Numero (da sinistra a destra: 1, 2, 3…)", tipo: "number", passo: "1", valore: a?.numero ?? prossimoNumero(zonaIniziale), richiesto: true },
      { id: "nome", etichetta: "Nome (facoltativo, es. Lungo il muro)", valore: a?.nome },
      { id: "larghezza", etichetta: "Larghezza in metri (da sinistra a destra)", tipo: "number", passo: "0.05", valore: a?.larghezza },
      { id: "lunghezza", etichetta: "Lunghezza in metri (dal fondo verso di te)", tipo: "number", passo: "0.05", valore: a?.lunghezza },
      { id: "copertura", etichetta: "All'aperto o in serra", tipo: "select", opzioni: Object.entries(COPERTURE), valore: a?.copertura ?? "" },
      { id: "pacciamatura", etichetta: "Pacciamatura", tipo: "select", opzioni: Object.entries(PACCIAMATURE), valore: a?.pacciamatura ?? "" },
      { id: "righe", etichetta: "Scacchiera: righe a, b, c… (dal fondo verso di te)", tipo: "number", passo: "1", valore: grigliaAiuola(a).righe },
      { id: "colonne", etichetta: "Scacchiera: colonne 1, 2, 3… (da sinistra a destra)", tipo: "number", passo: "1", valore: grigliaAiuola(a).colonne },
      { id: "note", etichetta: "Note (esposizione, terreno…)", tipo: "textarea", valore: a?.note },
    ],
    extra: `<p class="tenue piccolo">Con le misure l'app disegna l'orto visto dall'alto, con le aiuole affiancate in ordine di numero.</p>`,
    aggiorna: (v, form) => {
      if (!a && v.zona && form.dataset.zona !== v.zona) {
        form.dataset.zona = v.zona;
        form.elements.numero.value = prossimoNumero(v.zona);
      }
      const doppia = S.aiuole.find((x) => x !== a && !x.semenzaio && (x.zona || ZONA_PREDEFINITA) === v.zona && String(x.numero) === v.numero);
      return doppia ? `<div class="avviso">C'è già l'aiuola ${esc(v.numero)} in «${esc(v.zona)}»: cambia numero, oppure lascialo e cambia numero all'altra.</div>` : "";
    },
    salva: (v) => {
      const dati = {
        zona: v.zona, numero: Number(v.numero), nome: v.nome, note: v.note,
        larghezza: numeroMisura(v.larghezza), lunghezza: numeroMisura(v.lunghezza),
        copertura: v.copertura, pacciamatura: v.pacciamatura,
        ...grigliaAiuola({ righe: v.righe, colonne: v.colonne }),
      };
      if (a) {
        Object.assign(a, dati);
        delete a.misure;
        // Caselle che non esistono più dopo aver ridotto la scacchiera.
        for (const i of S.impianti) if (i.aiuolaId === a.id && i.celle) i.celle = celleValide(a, i.celle);
      }
      else S.aiuole.push({ id: nuovoId(), ...dati });
    },
  });
}

// Crea in un colpo solo più aiuole uguali, numerate di seguito.
function moduloPiuAiuole() {
  const zonaIniziale = zonaScelta() || zone()[0] || ZONA_PREDEFINITA;
  modulo({
    titolo: "Più aiuole insieme",
    campi: [
      { id: "zona", etichetta: "Zona (es. Orto principale, Serre)", valore: zonaIniziale, lista: [...new Set([...zone(), "Orto", "Serra"])], richiesto: true },
      { id: "quante", etichetta: "Quante aiuole", tipo: "number", passo: "1", valore: 4, richiesto: true },
      { id: "da", etichetta: "Numero della prima (le altre di seguito)", tipo: "number", passo: "1", valore: prossimoNumero(zonaIniziale), richiesto: true },
      { id: "larghezza", etichetta: "Larghezza di ognuna in metri (da sinistra a destra)", tipo: "number", passo: "0.05" },
      { id: "lunghezza", etichetta: "Lunghezza di ognuna in metri (dal fondo verso di te)", tipo: "number", passo: "0.05" },
      { id: "corridoio", etichetta: "Vialetto tra un'aiuola e l'altra, in cm", tipo: "number", passo: "1", valore: Math.round(corridoioZona(zonaIniziale) * 100) },
      { id: "copertura", etichetta: "All'aperto o in serra", tipo: "select", opzioni: Object.entries(COPERTURE), valore: "" },
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
      const n = Math.max(0, Math.min(50, Number(form.elements.quante.value) || 0)), da = Number(form.elements.da.value) || 1;
      const usati = S.aiuole.filter((x) => !x.semenzaio && (x.zona || ZONA_PREDEFINITA) === v.zona && x.numero >= da && x.numero < da + n);
      return (n ? `<div class="bene">Verranno create le aiuole da ${da} a ${da + n - 1} in «${esc(v.zona)}».</div>` : "")
        + (usati.length ? `<div class="avviso">Numeri già usati in questa zona: ${usati.map((x) => x.numero).join(", ")}.</div>` : "");
    },
    salva: (v) => {
      const n = Math.max(0, Math.min(50, Number(v.quante) || 0));
      if (!n) return false;
      const da = Number(v.da) || prossimoNumero(v.zona);
      for (let k = 0; k < n; k++) {
        S.aiuole.push({
          id: nuovoId(), zona: v.zona, numero: da + k, nome: "", note: "",
          larghezza: numeroMisura(v.larghezza), lunghezza: numeroMisura(v.lunghezza),
          copertura: v.copertura, pacciamatura: v.pacciamatura,
          ...grigliaAiuola({ righe: v.righe, colonne: v.colonne }),
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
    ],
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
      if (v.nome !== zona) {
        for (const a of S.aiuole) if (!a.semenzaio && (a.zona || ZONA_PREDEFINITA) === zona) a.zona = v.nome;
        delete S.zone[zona];
        if (S.impostazioni.zonaVista === zona) S.impostazioni.zonaVista = v.nome;
      }
      S.zone[v.nome] = dati;
    },
  });
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
  const doppia = S.aiuole.find((x) => !x.semenzaio && (x.zona || ZONA_PREDEFINITA) === v.nz_zona && String(x.numero) === form.elements.nz_numero.value);
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
function primaDataUtile(ortaggioId, modo, aiuolaId) {
  const o = PER_ID[ortaggioId];
  if (!o || !(o[modo] || []).length) return null;
  const ora = oggi(), m = inSerra(aiuolaId) ? ANTICIPO_SERRA : 0;
  const fin = finestreTra(o, modo, piuGiorni(ora, -m), piuGiorni(ora, 400))
    .map((f) => ({ inizio: piuGiorni(f.inizio, -m), fine: piuGiorni(f.fine, m) }))
    .filter((f) => f.fine >= ora)
    .sort((a, b) => a.inizio - b.inizio)[0];
  if (!fin) return null;
  return { data: fin.inizio > ora ? fin.inizio : ora, fine: fin.fine, serra: m > 0 };
}
function fmtAnno(d) { return d.getFullYear() === oggi().getFullYear() ? fmt(d) : `${fmt(d)} ${d.getFullYear()}`; }

function moduloImpianto({ aiuolaId, ortaggioId, impianto, celle } = {}) {
  const i = impianto;
  let ultimoOrtaggio = i?.ortaggioId ?? ortaggioId ?? "";
  // Proposta: la prima aiuola vera; se non ce ne sono, "Nuova aiuola".
  const aiuolaIniziale = i?.aiuolaId ?? aiuolaId ?? aiuoleOrdinate().find((a) => !a.semenzaio)?.id ?? NUOVA_AIUOLA;
  let ultimaAiuola = aiuolaIniziale;
  // Coltura nuova: la data proposta segue ortaggio, modo e aiuola finché non la cambi tu.
  let dataProposta = i ? null : aISO(oggi()), ultimaChiave = "";
  modulo({
    titolo: i ? "Modifica coltura" : "Nuova coltura",
    campi: [
      { id: "ortaggioId", etichetta: "Ortaggio", tipo: "select", opzioni: opzioniOrtaggi(), valore: i?.ortaggioId ?? ortaggioId ?? "", richiesto: true },
      { id: "aiuolaId", etichetta: "Dove (aiuola)", tipo: "select", opzioni: [...opzioniAiuole(), [NUOVA_AIUOLA, "＋ Nuova aiuola…"]], valore: aiuolaIniziale, richiesto: true },
      ...campiNuovaAiuola(),
      campoCelle(i?.celle ?? celle),
      { id: "modo", etichetta: "Come", tipo: "select", opzioni: Object.entries(MODI), valore: i?.modo ?? modoPredefinito(ultimoOrtaggio, aiuolaIniziale) },
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
      const utile = v.ortaggioId ? primaDataUtile(v.ortaggioId, modoOra, v.aiuolaId) : null;
      if (dataProposta !== null) {
        const chiave = `${v.ortaggioId}|${modoOra}|${v.aiuolaId}`;
        if (v.data !== dataProposta) dataProposta = null; // l'hai cambiata tu: non la tocco più
        else if (chiave !== ultimaChiave && utile) form.elements.data.value = dataProposta = aISO(utile.data);
        ultimaChiave = chiave;
      }
      if (utile) {
        const nome = esc(MODI[modoOra].toLowerCase());
        proposta = `<div class="bene">📅 Prima data utile per ${nome}: <b>${giorniTra(oggi(), utile.data) === 0 ? "da oggi" : "dal " + fmtAnno(utile.data)}</b> fino al ${fmtAnno(utile.fine)}${utile.serra ? " (contando il vantaggio della serra)" : ""}.</div>`;
      } else if (v.ortaggioId) {
        proposta = `<div class="avviso">📅 Per ${esc(PER_ID[v.ortaggioId].nome.toLowerCase())} il calendario non prevede ${esc(MODI[modoOra].toLowerCase())}: prova un altro "Come".</div>`;
      }
      const v2 = { ...v, data: form.elements.data.value };
      const avvisoCelle = aggiornaSceltaCelle(form, v2.aiuolaId, i?.id);
      const celleScelte = form.elements.celle.value.split(",").filter(Boolean);
      return aggiornaNuovaAiuola(v2, form) + avvisoCelle + proposta + htmlAvvisi(v2.aiuolaId, v2.ortaggioId, v2.data, i?.id, celleScelte);
    },
    salva: (v) => {
      v.aiuolaId = aiuolaDaModulo(v);
      togliCampiNuovaAiuola(v);
      v.celle = celleValide(aiuola(v.aiuolaId), v.celle.split(",").filter(Boolean));
      if (aiuola(v.aiuolaId)?.semenzaio) v.modo = "sem";
      if (i) {
        // Riaperta: non è più finita, via esito e data di fine.
        if (i.finito && !v.finito) { delete i.esito; delete i.dataFine; }
        Object.assign(i, v);
      } else S.impianti.push({ id: nuovoId(), finito: false, ...v });
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
  if (origine && origine.esito === "trapiantato") {
    origine.finito = false;
    delete origine.esito;
    delete origine.dataFine;
  }
  for (const x of S.impianti) if (x.daSemenzaio === i.id) delete x.daSemenzaio;
  return true;
}

function moduloTrapianto(i) {
  const o = PER_ID[i.ortaggioId];
  modulo({
    titolo: `Trapianta ${o.nome.toLowerCase()}`,
    campi: [
      { id: "aiuolaId", etichetta: "In quale aiuola", tipo: "select", opzioni: [...opzioniAiuole(false), [NUOVA_AIUOLA, "＋ Nuova aiuola…"]], richiesto: true },
      ...campiNuovaAiuola(),
      campoCelle([]),
      { id: "data", etichetta: "Data del trapianto", tipo: "date", valore: aISO(oggi()), richiesto: true },
      { id: "quantita", etichetta: "Quante piantine", valore: i.quantita },
    ],
    testoSalva: "Trapianta",
    aggiorna: (v, form) => {
      const avvisoCelle = aggiornaSceltaCelle(form, v.aiuolaId, null);
      return aggiornaNuovaAiuola(v, form) + avvisoCelle
        + htmlAvvisi(v.aiuolaId, i.ortaggioId, v.data, null, form.elements.celle.value.split(",").filter(Boolean));
    },
    salva: (v) => {
      if (!v.aiuolaId) return false;
      v.aiuolaId = aiuolaDaModulo(v);
      const celleTrapianto = celleValide(aiuola(v.aiuolaId), v.celle.split(",").filter(Boolean));
      i.finito = true;
      i.dataFine = v.data;
      i.esito = "trapiantato";
      S.impianti.push({
        id: nuovoId(), finito: false, ortaggioId: i.ortaggioId, aiuolaId: v.aiuolaId, modo: "tra",
        data: v.data, varieta: i.varieta, quantita: v.quantita, note: "", daSemenzaio: i.id, celle: celleTrapianto,
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
      { id: "aiuolaId", etichetta: "Aiuola (facoltativo)", tipo: "select", opzioni: [["", "— tutto l'orto —"], ...opzioniAiuole()], valore: ev?.aiuolaId ?? aiuolaId ?? "" },
      { id: "impiantoId", etichetta: "Coltura (facoltativo)", tipo: "select",
        opzioni: [["", "—"], ...attivi.map((x) => [x.id, `${nomeOrtaggio(x.ortaggioId)} — ${nomeAiuolaId(x.aiuolaId)}`])],
        valore: ev?.impiantoId ?? impiantoId ?? "" },
      { id: "kg", etichetta: "Quantità raccolta in kg (solo raccolto)", tipo: "number", passo: "0.1", valore: ev?.kg },
      { id: "testo", etichetta: "Descrizione (es. prodotto usato, osservazioni)", tipo: "textarea", valore: ev?.testo ?? testo },
    ],
    elimina: ev ? () => {
      if (!confirm(`Eliminare questa annotazione (${TIPI_EVENTO[ev.tipo] ?? ev.tipo}, ${fmt(daISO(ev.data))})?`)) return false;
      S.eventi = S.eventi.filter((x) => x.id !== ev.id);
    } : null,
    salva: (v) => {
      if (v.impiantoId && !v.aiuolaId) v.aiuolaId = S.impianti.find((x) => x.id === v.impiantoId)?.aiuolaId ?? "";
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
  { id: "pollina", nome: "Pollina pellettata (tipo Biorex)", dose: { alta: 0.2, media: 0.15, bassa: 0.08 } },
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
  const mq = a.larghezza && a.lunghezza ? a.larghezza * a.lunghezza : 0;
  const fatta = ultimaConcimazione(a);

  const passi = [];
  if (a.pacciamatura === "telo") passi.push("Togli o arrotola il <b>telo di pacciamatura</b>: così puoi concimare e lavorare la terra. Rimettilo prima di piantare, tiene a bada le erbacce.");
  if (a.pacciamatura === "organica") passi.push("Sposta ai lati <b>paglia o foglie</b> (se sono già ben decomposte puoi interrarle).");
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
  const mq = a.larghezza && a.lunghezza ? a.larghezza * a.lunghezza : 0;
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
      <h3>${scelti.size ? "Può essere" : `Problemi più comuni${o ? ` ${o.emoji} ${esc(o.nome.toLowerCase())}` : ""}`}</h3>
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
      <h2>${o.emoji} ${esc(o.nome)}</h2>
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
  if (primi3 >= 10) avvisi.push(`<div class="bene">🌧️ Nei prossimi 3 giorni sono previsti ${Math.round(primi3)} mm di pioggia: puoi saltare le annaffiature.</div>`);
  else if (pioggia < 3 && g.temperature_2m_max.slice(0, 3).some((x) => x >= 22)) avvisi.push(`<div class="avviso">💧 Settimana asciutta: ricordati di annaffiare.</div>`);
  const agg = new Date(m.quando);
  return `<div class="meteo">${celle}</div>${avvisi.join("")}
    <p class="tenue piccolo">Previsioni Open-Meteo, aggiornate alle ${agg.getHours()}:${String(agg.getMinutes()).padStart(2, "0")}.</p>`;
}

// -----------------------------------------------------------------------------
// Vista: Oggi
// -----------------------------------------------------------------------------
// Attività segnate nel diario con una data da oggi in poi (annotazioni e colture), entro "giorni".
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
      titolo: `${o?.emoji ?? "🌱"} ${MODI[i.modo] ?? ""} · ${o?.nome ?? ""}`,
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
      voci.push(`<button class="chip" data-ortaggio="${o.id}">${preferito(o.id) ? "★ " : ""}${o.emoji} ${esc(o.nome)} <span class="tenue">${quando}</span></button>`);
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
      <span>${PER_ID[i.ortaggioId].emoji} <b>${esc(s.testo)}</b> <span class="tenue">· ${esc(nomeAiuolaId(i.aiuolaId))}</span><br>
      <span class="tenue piccolo">${dd < 0 ? `previsto ${-dd} giorni fa` : dd === 0 ? "previsto oggi" : `verso il ${fmt(s.data)}`} (stima)</span></span>
      <span>
        ${s.tipo === "tra" ? `<button class="piccolo" data-trapianta="${i.id}">Trapianta</button>` : `<button class="piccolo" data-raccolto="${i.id}">Raccolto</button>`}
        <a class="bottone secondario piccolo" style="min-height:34px;padding:4px 10px" target="_blank" rel="noopener" href="${esc(linkGoogleCalendar(s.testo, s.data, "Dal diario dell'orto"))}" title="Aggiungi al calendario">📅</a>
      </span>
    </div></li>`).join("")}</ul>` : `<p class="tenue">Nessun trapianto o raccolta previsti nelle prossime 3 settimane. Le colture si aggiungono nella scheda Orto.</p>`;

  const meteo = imp.lat == null
    ? `<p class="tenue">Imposta la posizione dell'orto nella scheda <a href="#luogo">Luogo</a> per vedere le previsioni e il rischio di brinate.</p>`
    : `<div id="box-meteo"><p class="tenue">Carico le previsioni…</p></div>`;

  const programma = attivitaInProgramma(ANTICIPO_PROMEMORIA);
  const htmlProgramma = programma.length ? `<section class="carta promemoria">
      <h2 style="margin-top:0">🔔 Da fare nei prossimi ${ANTICIPO_PROMEMORIA} giorni</h2>
      <ul class="elenco">${programma.map((v) => `<li><div class="riga">
        <span><b>${esc(v.titolo)}</b> <span class="tenue">· ${quandoTesto(v.data)}</span>
          ${v.dove || v.testo ? `<br><span class="tenue piccolo">${esc([v.dove, v.testo].filter(Boolean).join(" · "))}</span>` : ""}</span>
        <span style="white-space:nowrap">
          <button class="piccolo secondario" ${v.tipo === "ev" ? `data-modifica-ev="${v.id}"` : `data-modifica-imp="${v.id}"`}>✏️</button>
          <a class="bottone secondario piccolo" style="min-height:34px;padding:4px 10px" target="_blank" rel="noopener" href="${esc(linkGoogleCalendar(v.titolo, v.data, [v.dove, v.testo].filter(Boolean).join(" · ")))}" title="Aggiungi al calendario">📅</a>
        </span></div></li>`).join("")}</ul>
    </section>` : "";

  return `${htmlProgramma}
    <section class="carta">
      <h2 style="margin-top:0">${MESI_LUNGHI[ora.getMonth()][0].toUpperCase() + MESI_LUNGHI[ora.getMonth()].slice(1)}: lavori del mese</h2>
      <p style="margin:0">${esc(LAVORI_MESE[ora.getMonth()])}</p>
    </section>
    <section class="carta"><h2 style="margin-top:0">Meteo dei prossimi 7 giorni</h2>${meteo}</section>
    <section class="carta">
      <h2 style="margin-top:0">Dal tuo orto</h2>${htmlPassi}
      ${(() => {
        const libere = aiuoleOrdinate().filter((a) => aiuolaVuota(a) && !ultimaConcimazione(a));
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
      <div class="nome">${preferito(o.id) ? "★ " : ""}${o.emoji} ${esc(o.nome)}</div>
      <div class="cal-barre">${barre}<div class="oggi" style="left:${pos(ora)}%"></div></div>
    </div>`;
  }).join("");

  return `
    <h2>Calendario ${anno}</h2>
    <p class="tenue piccolo">Calcolato per il tuo luogo: ultima brinata ${fmtMmdd(S.impostazioni.ultimaBrinata)}, prima brinata ${fmtMmdd(S.impostazioni.primaBrinata)}. Tocca un ortaggio per la scheda.</p>
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
function vistaOrto(idAiuola) {
  if (idAiuola && aiuola(idAiuola)) return vistaAiuola(aiuola(idAiuola));
  const scelta = zonaScelta();
  const bottoni = zone().length > 1 ? `<div class="scelta-orto">${[["", "Tutti"], ...zone().map((z) => [z, z])].map(([z, t]) =>
    `<button class="chip${z === scelta ? " attiva" : ""}" data-zona-vista="${esc(z)}">${esc(t)}</button>`).join("")}</div>` : "";
  const carte = aiuoleOrdinate().filter((a) => a.semenzaio || !scelta || (a.zona || ZONA_PREDEFINITA) === scelta).map((a) => {
    const attivi = impiantiAttivi(a.id);
    const problemi = attivi.reduce((n, i) => n + avvisiRotazione(a.id, i.ortaggioId, i.data, i.id, i.celle).length
      + avvisiVicini(a.id, i.ortaggioId, i.id, i.celle).cattivi.length, 0);
    return `<a class="carta" href="#orto/${a.id}" style="display:block;color:inherit;text-decoration:none">
      <div class="riga" style="display:flex;justify-content:space-between;gap:8px"><b>${a.semenzaio ? "🪴" : a.copertura === "serra" ? "🏠" : "🟫"} ${esc(nomeAiuola(a))}</b>
      <span class="tenue piccolo">${esc([misureAiuola(a), tipoAiuola(a)].filter(Boolean).join(" · "))}</span></div>
      <div>${attivi.length ? attivi.map((i) => `<span class="chip">${nomeOrtaggio(i.ortaggioId)}${i.celle?.length ? ` <span class="tenue">${esc(testoCelle(i))}</span>` : ""}</span>`).join("") : `<span class="tenue">vuota</span>`}</div>
      ${problemi ? `<div class="avviso piccolo">⚠️ ${problemi} ${problemi === 1 ? "avviso" : "avvisi"} su rotazione o vicini</div>` : ""}
    </a>`;
  }).join("");
  return `
    <h2>${scelta ? esc(scelta) : "Le mie aiuole"}</h2>
    ${bottoni}
    ${htmlPianta(scelta)}
    ${S.aiuole.length <= 1 ? `<p class="tenue">Crea un'aiuola per ogni pezzo dell'orto: l'app ricorda cosa ci hai coltivato ogni anno e ti avvisa se ripeti la stessa famiglia (rotazione) o metti vicini ortaggi che non vanno d'accordo.</p>` : ""}
    ${carte}
    <div class="riga-bottoni">
      <button id="nuova-aiuola">＋ Nuova aiuola</button>
      <button class="secondario" id="piu-aiuole">＋ Più aiuole insieme</button>
      <button class="secondario" id="nuova-coltura">＋ Nuova coltura</button>
      <button class="secondario" id="diagnosi">🩺 Malattie e parassiti</button>
    </div>`;
}

// Pianta vista dall'alto: per ogni zona le aiuole affiancate da sinistra a
// destra in ordine di numero, in scala, con le colture in corso.
function htmlPianta(soloZona) {
  const blocchi = zone().filter((z) => !soloZona || z === soloZona).map((zona) => {
    const lista = aiuoleOrdinate().filter((a) => !a.semenzaio && (a.zona || ZONA_PREDEFINITA) === zona);
    if (!lista.length) return "";
    const misurate = lista.filter((a) => a.larghezza && a.lunghezza);
    const mediaL = misurate.length ? misurate.reduce((s, a) => s + a.larghezza, 0) / misurate.length : 1;
    const mediaH = misurate.length ? misurate.reduce((s, a) => s + a.lunghezza, 0) / misurate.length : 2;
    const corridoio = corridoioZona(zona);
    // Coordinate locali: x lungo la fila (aiuola 1 a sinistra), y dal fondo (0) verso il davanti.
    let x = 0;
    const pezzi = lista.map((a) => {
      const w = a.larghezza || mediaL, h = a.lunghezza || mediaH;
      const p = { a, x, w, h, misurata: Boolean(a.larghezza && a.lunghezza) };
      x += w + corridoio;
      return p;
    });
    const larghezzaTot = x - corridoio;

    // Orientamento: la fila va nella direzione della bussola "direzione" (gradi).
    const or = orientamentoZona(zona);
    const T = (px, py) => [px * or.cos - py * or.s * or.sin, px * or.sin + py * or.s * or.cos];
    const angoli = (px, py, w, h) => [T(px, py), T(px + w, py), T(px + w, py + h), T(px, py + h)];
    const tutti = pezzi.flatMap((q) => angoli(q.x, 0, q.w, q.h));
    const box0 = limiti(tutti);

    // Scala in pixel per metro: il disegno occupa la larghezza disponibile (circa 360 px
    // sul telefono, di più sul PC); testo tra 10 e 15 px, non più di un quarto dell'aiuola tipica.
    const disponibile = Math.max(340, (el("app")?.clientWidth || 400) - 70);
    const scala = Math.min(PX_PER_METRO, disponibile / Math.max(box0.w, 0.5));
    const lati = pezzi.map((q) => Math.min(q.w, q.h)).sort((m, n) => m - n);
    const fs = Math.min(15 / scala, Math.max(10 / scala, lati[Math.floor(lati.length / 2)] / 4)); // testo in metri
    const testo = (px, py, contenuto, classe, size) => {
      const [tx, ty] = T(px, py);
      return `<text class="${classe}" x="${tx}" y="${ty}" font-size="${size}" text-anchor="middle" dominant-baseline="central">${contenuto}</text>`;
    };
    const punti = (l) => l.map(([px, py]) => `${px},${py}`).join(" ");

    const etichette = [];
    const disegno = pezzi.map(({ a, x, w, h, misurata }) => {
      const attivi = impiantiAttivi(a.id);
      const problemi = attivi.some((i) => avvisiRotazione(a.id, i.ortaggioId, i.data, i.id, i.celle).length
        || avvisiVicini(a.id, i.ortaggioId, i.id, i.celle).cattivi.length);
      const e = fs * 1.25; // lato di un'emoji
      const perRiga = Math.max(1, Math.floor((w - fs * 0.3) / e));
      const righe = Math.max(0, Math.floor((h - fs * 2.2) / e));
      const tutte = attivi.map((i) => PER_ID[i.ortaggioId]?.emoji ?? "🌱");
      const posti = perRiga * righe;
      const emoji = tutte.length > posti ? [...tutte.slice(0, Math.max(0, posti - 1)), `+${tutte.length - Math.max(0, posti - 1)}`] : tutte;
      const cx = x + w / 2;
      const griglia = haGriglia(a);
      let testi = "", linee = "";
      if (griglia) {
        // Scacchiera: linee e, in ogni casella, l'emoji di chi la occupa.
        const g = grigliaAiuola(a);
        const cw = w / g.colonne, ch = h / g.righe;
        const seg = (x1, y1, x2, y2) => { const [p1, p2] = [T(x1, y1), T(x2, y2)]; return `<line class="p-griglia" x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke-width="${fs * 0.06}"/>`; };
        // Linee solo se le caselle sono abbastanza grandi da vederle (almeno 5 px).
        if (cw * scala >= 5) for (let c = 1; c < g.colonne; c++) linee += seg(x + c * cw, 0, x + c * cw, h);
        if (ch * scala >= 5) for (let r = 1; r < g.righe; r++) linee += seg(x, r * ch, x + w, r * ch);
        const occ = occupazione(a.id);
        const libere = [];
        const dim = Math.min(e * 0.85, Math.min(cw, ch) * 0.7);
        for (let r = 0; r < g.righe; r++) for (let c = 0; c < g.colonne; c++) {
          const n = nomeCella(r, c);
          if (occ[n]) testi += testo(x + (c + 0.5) * cw, (r + 0.5) * ch, PER_ID[occ[n][0].ortaggioId]?.emoji ?? "🌱", "p-emoji", dim);
          else libere.push([r, c]);
        }
        // Colture su tutta l'aiuola: nelle caselle libere.
        impiantiAttivi(a.id).filter((i) => !i.celle?.length).forEach((i, k) => {
          if (!libere[k]) return;
          const [r, c] = libere[k];
          testi += testo(x + (c + 0.5) * cw, (r + 0.5) * ch, PER_ID[i.ortaggioId]?.emoji ?? "🌱", "p-emoji", dim);
        });
      } else {
        testi = (posti ? emoji : []).map((em, k) => testo(
          cx + ((k % perRiga) - (Math.min(perRiga, emoji.length) - 1) / 2) * e,
          fs * 2.3 + Math.floor(k / perRiga) * e + e * 0.5, em, "p-emoji", e * 0.85)).join("");
      }
      // Con la scacchiera il numero va fuori, oltre il fondo, per non coprire le caselle.
      const yNumero = griglia ? -fs * 0.9 : fs * 1.1;
      if (griglia) etichette.push(T(cx, yNumero - fs * 0.6));
      const pos = T(cx, h + fs * 1.1);
      etichette.push(pos);
      const d = fs * 0.15;
      return `<a href="#orto/${a.id}">
        <title>${esc(nomeAiuola(a))}${misurata ? " · " + esc(misureAiuola(a)) : ""}</title>
        <polygon class="p-aiuola${misurata ? "" : " p-senza"}${a.pacciamatura ? " p-" + a.pacciamatura : ""}" points="${punti(angoli(x, 0, w, h))}"/>
        ${a.copertura === "serra" ? `<polygon class="p-serra" points="${punti(angoli(x + d, d, Math.max(0, w - 2 * d), Math.max(0, h - 2 * d)))}"/>` : ""}
        ${linee}
        ${testo(cx, yNumero, `${a.copertura === "serra" ? "🏠" : ""}${esc(a.numero)}${problemi ? " ⚠️" : ""}`, `p-numero${a.pacciamatura === "telo" && !griglia ? " p-chiaro" : ""}`, fs * 1.3)}
        ${testi}
        ${testo(cx, h + fs * 1.1, misurata ? `${fmtM(a.larghezza)}×${fmtM(a.lunghezza)}` : "misure?", "p-misura", fs * 0.8)}
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
    const superficie = misurate.reduce((s, a) => s + a.larghezza * a.lunghezza, 0);
    return `<section class="carta">
      <h3 style="margin-top:0">${esc(zona)} · vista dall'alto</h3>
      <svg class="pianta" style="max-width:${Math.round(larghezzaBox * scala * (scala < PX_PER_METRO ? 1.2 : 1))}px" viewBox="${minX} ${minY} ${larghezzaBox} ${altezzaBox}" role="img" aria-label="Pianta di ${esc(zona)}">${disegno}${nord}</svg>
      ${legendaPianta(lista)}
      ${consiglioSole(zona, lista)}
      <p class="tenue piccolo">${or.attivo ? `La fila va ${esc(DIREZIONI_TESTO(or.gradi))}.` : "Disegno dritto: l'orientamento della zona non è indicato."}
      Aiuole in ordine di numero, ${corridoio ? `con vialetti di ${Math.round(corridoio * 100)} cm` : "senza vialetti"}. Lunghezza totale circa ${fmtM(larghezzaTot)} m${superficie ? ` · ${fmtM(superficie)} m² coltivati` : ""}.
      ${misurate.length < lista.length ? "Le aiuole tratteggiate non hanno ancora le misure: toccale e premi «Modifica aiuola» per inserirle." : ""} Tocca un'aiuola per aprirla.</p>
      <button class="piccolo secondario" data-zona="${esc(zona)}">⚙️ Nome, vialetti e orientamento</button>
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
  if (lista.some((a) => !a.pacciamatura && a.copertura !== "serra")) voci.push(`<span><i class="l-terra"></i>terra nuda</span>`);
  if (lista.some((a) => a.pacciamatura === "telo")) voci.push(`<span><i class="l-telo"></i>telo</span>`);
  if (lista.some((a) => a.pacciamatura === "organica")) voci.push(`<span><i class="l-organica"></i>paglia, foglie</span>`);
  if (lista.some((a) => a.copertura === "serra")) voci.push(`<span><i class="l-serra"></i>🏠 serra</span>`);
  return voci.length > 1 || lista.some((a) => a.copertura === "serra" || a.pacciamatura) ? `<div class="legenda">${voci.join("")}</div>` : "";
}

function suggerimentiAiuola(a) {
  if (a.semenzaio) return "";
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
    ${cand.slice(0, 10).map(({ o }) => `<button class="chip" data-ortaggio="${o.id}">${o.emoji} ${esc(o.nome)}</button>`).join("")}
  </section>`;
}

// Scacchiera della scheda aiuola: tocca una casella vuota per piantarci, una piena per modificarla.
function htmlScacchiera(a) {
  if (!haGriglia(a)) return "";
  const g = grigliaAiuola(a);
  const occ = occupazione(a.id);
  const tutta = impiantiAttivi(a.id).filter((i) => !i.celle?.length);
  const fitta = grigliaFitta(g);
  let h = `<div class="scorri-scacchiera">${intestazioneGriglia(g).replace('class="scacchiera', 'class="scacchiera grande')}`;
  for (let r = 0; r < g.righe; r++) {
    h += `<span class="intest riga">${nomeRiga(r)}</span>`;
    for (let c = 0; c < g.colonne; c++) {
      const n = nomeCella(r, c);
      const chi = occ[n] || [];
      h += chi.length
        ? `<button type="button" class="cella piena" data-modifica-imp="${chi[0].id}" title="${n} · ${esc(chi.map((i) => PER_ID[i.ortaggioId]?.nome ?? "").join(", "))}"><span class="em">${chi.map((i) => PER_ID[i.ortaggioId]?.emoji ?? "🌱").join("")}</span>${fitta ? "" : `<span class="nome">${esc(chi.map((i) => PER_ID[i.ortaggioId]?.nome ?? "").join(", "))}</span>`}</button>`
        : `<button type="button" class="cella" data-cella-nuova="${n}" title="${n}"><span class="nome tenue">${n}</span></button>`;
    }
  }
  h += `</div></div>`;
  const misura = misuraCasella(a);
  return `<section class="carta"><h3 style="margin-top:0">Scacchiera ${g.righe} × ${g.colonne}${misura ? ` <span class="tenue piccolo">· ${misura}</span>` : ""}</h3>${h}
    <p class="tenue piccolo">Righe a, b, c… dal fondo verso di te; colonne 1, 2, 3… da sinistra a destra. Tocca una casella vuota per piantarci, una piena per modificarla.
    ${tutta.length ? `Su tutta l'aiuola: ${tutta.map((i) => nomeOrtaggio(i.ortaggioId)).join(", ")}.` : ""}</p></section>`;
}

function vistaAiuola(a) {
  const attivi = impiantiAttivi(a.id).sort((x, y) => x.data.localeCompare(y.data));
  const storici = S.impianti.filter((i) => i.finito && i.aiuolaId === a.id).sort((x, y) => y.data.localeCompare(x.data));
  const eventi = S.eventi.filter((e) => e.aiuolaId === a.id).sort((x, y) => y.data.localeCompare(x.data)).slice(0, 15);

  const htmlAttivi = attivi.length ? `<ul class="elenco">${attivi.map((i) => {
    const o = PER_ID[i.ortaggioId];
    const stime = stimeImpianto(i).map((s) => `${FASI[s.tipo].breve} ~${fmt(s.data)}`).join(" · ");
    const avv = htmlAvvisi(a.id, i.ortaggioId, i.data, i.id, i.celle).replace(/<div class="avviso">📅[^<]*<\/div>/, "");
    return `<li>
      <div><b>${o.emoji} ${esc(o.nome)}</b>${i.varieta ? ` <span class="tenue">${esc(i.varieta)}</span>` : ""}${i.celle?.length ? ` · <b>${esc(testoCelle(i))}</b>` : ""}</div>
      <div class="tenue piccolo">${esc(MODI[i.modo] ?? "")} il ${fmt(daISO(i.data))}${i.quantita ? " · " + esc(i.quantita) : ""}${stime ? " · previsti: " + stime : ""}</div>
      ${i.note ? `<div class="piccolo">${esc(i.note)}</div>` : ""}
      ${avv}
      <div class="riga-bottoni">
        ${a.semenzaio ? `<button class="piccolo" data-trapianta="${i.id}">Trapianta</button>` : `<button class="piccolo" data-raccolto="${i.id}">🧺 Raccolto</button>`}
        <button class="piccolo secondario" data-evento-imp="${i.id}">＋ Nota</button>
        <button class="piccolo secondario" data-modifica-imp="${i.id}">✏️ Modifica</button>
        <button class="piccolo secondario" data-diagnosi-imp="${i.id}">🩺 Problema?</button>
        <button class="piccolo secondario" data-fine="${i.id}">Fine coltura</button>
      </div>
    </li>`;
  }).join("")}</ul>` : `<p class="tenue">Niente in coltivazione.</p>`;

  const perAnno = {};
  for (const i of storici) (perAnno[i.data.slice(0, 4)] ??= []).push(i);
  const htmlStorici = Object.keys(perAnno).length ? Object.entries(perAnno).sort((x, y) => y[0].localeCompare(x[0])).map(([anno, l]) =>
    `<p><b>${anno}:</b> ${l.map((i) => `<button type="button" class="voce-storico" data-modifica-imp="${i.id}" title="Tocca per modificare o eliminare">${nomeOrtaggio(i.ortaggioId)}${i.esito === "fallito" ? " ✗" : ""}</button>${i.commento ? ` <span class="tenue">(${esc(i.commento)})</span>` : ""}`).join(", ")}</p>`).join("") + `<p class="tenue piccolo">Tocca un ortaggio per modificarlo o eliminarlo.</p>`
    : `<p class="tenue">Ancora niente: qui comparirà cosa hai coltivato negli anni passati.</p>`;

  return `
    <p><a href="#orto">← Tutte le aiuole</a></p>
    <h2>${a.semenzaio ? "🪴" : a.copertura === "serra" ? "🏠" : "🟫"} ${esc(nomeAiuola(a))}</h2>
    ${misureAiuola(a) || tipoAiuola(a) ? `<p class="tenue">${esc([misureAiuola(a), tipoAiuola(a)].filter(Boolean).join(" · "))}</p>` : ""}
    ${a.note ? `<p>${esc(a.note)}</p>` : ""}
    ${a.semenzaio ? `<p class="tenue piccolo">Qui segni le semine al riparo (in casa, in serra, in vasetti). Quando le piantine sono pronte premi «Trapianta» e scegli l'aiuola.</p>` : ""}
    ${consiglioAiuolaVuota(a)}
    ${htmlScacchiera(a)}
    <section class="carta"><h3 style="margin-top:0">In coltivazione</h3>${htmlAttivi}
      <div class="riga-bottoni"><button id="coltura-qui">＋ ${a.semenzaio ? "Nuova semina" : "Nuova coltura"}</button>
      <button class="secondario" id="evento-qui">＋ Annotazione</button></div>
    </section>
    ${suggerimentiAiuola(a)}
    ${a.semenzaio ? "" : `<section class="carta"><h3 style="margin-top:0">Negli anni passati</h3>${htmlStorici}</section>`}
    ${eventi.length ? `<section class="carta"><h3 style="margin-top:0">Ultime annotazioni</h3>${htmlEventi(eventi)}</section>` : ""}
    <div class="riga-bottoni">
      <button class="secondario" id="modifica-aiuola">✏️ Modifica ${a.semenzaio ? "semenzaio" : "aiuola"}</button>
      ${a.semenzaio ? "" : `<button class="secondario" id="elimina-aiuola">Elimina aiuola</button>`}
    </div>`;
}

function htmlEventi(eventi) {
  return `<ul class="elenco">${eventi.map((e) => {
    const imp = S.impianti.find((i) => i.id === e.impiantoId);
    return `<li><div class="riga"><span><b>${TIPI_EVENTO[e.tipo] ?? e.tipo}</b>
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
      html: `<li><div class="riga"><span><b>🌱 ${esc(MODI[i.modo] ?? "")}</b> · ${nomeOrtaggio(i.ortaggioId)}${i.varieta ? ` (${esc(i.varieta)})` : ""}
        ${daISO(i.data) > oggi() ? ` <span class="chip-futuro">🔔 in programma</span>` : ""}
        <br><span class="tenue piccolo">${fmt(daISO(i.data))} · ${esc(nomeAiuolaId(i.aiuolaId))}${i.finito ? " · finita" : ""}</span></span>
        <button class="piccolo secondario" data-modifica-imp="${i.id}">✏️ Modifica</button></div></li>`,
    })),
  ].sort((a, b) => b.data.localeCompare(a.data));

  return `
    <div class="riga" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <h2>Diario</h2>
      <select id="anno-diario" style="width:auto">${elencoAnni.map((a) => `<option ${a === anno ? "selected" : ""}>${a}</option>`).join("")}</select>
    </div>
    <div class="riga-bottoni"><button id="nuovo-evento">＋ Annotazione</button><button class="secondario" id="nuova-coltura">＋ Coltura</button></div>
    <section class="carta"><h3 style="margin-top:0">Raccolti ${anno}</h3>${tabKg}</section>
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
      <p class="tenue piccolo">Promemoria: scarica un file di calendario (.ics) con le attività segnate nel diario con una data futura (con un avviso una settimana prima), i trapianti e le raccolte previsti e l'inizio delle semine dei tuoi ortaggi ★ per i prossimi 12 mesi. Aprilo con l'app Calendario o importalo in Google Calendar dal computer.</p>
      <div class="riga-bottoni"><button class="secondario" id="ics">📅 Scarica promemoria (.ics)</button></div>
    </section>`;
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

// --- Copia di sicurezza e promemoria -----------------------------------------
function esportaDati() {
  scaricaFile(`orto-copia-${aISO(oggi())}.json`, JSON.stringify(S, null, 1), "application/json");
}

// Invia la copia col menu di condivisione del telefono. Chrome su Android non
// condivide file .json: la copia parte come .txt (il contenuto è lo stesso).
async function inviaCopia() {
  const nome = `orto-copia-${aISO(oggi())}.txt`;
  const file = new File([JSON.stringify(S, null, 1)], nome, { type: "text/plain" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Copia dell'orto", text: "Copia di sicurezza dell'app Il mio orto" });
    } catch (e) {
      if (e.name !== "AbortError") alert("Invio non riuscito: " + e.message);
    }
    return;
  }
  scaricaFile(nome, JSON.stringify(S, null, 1), "text/plain");
  alert("Questo browser non può inviare file direttamente: la copia è stata scaricata nella cartella Download.");
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
  return { vista: ["oggi", "calendario", "orto", "diario", "luogo"].includes(vista) ? vista : "oggi", param };
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
  const { vista, param } = rotta();
  const app = el("app");
  const imp = S.impostazioni;
  el("sottotitolo").textContent = imp.luogo ? `${imp.luogo}${imp.altitudine != null ? ` · ${Math.round(imp.altitudine)} m` : ""}` : fmtLungo(oggi());
  document.querySelectorAll(".schede a").forEach((a) => a.classList.toggle("attiva", a.dataset.vista === vista));

  document.body.dataset.vista = vista; // sul PC la scheda Orto è più larga (vedi style.css)
  const viste = { oggi: vistaOggi, calendario: vistaCalendario, orto: () => vistaOrto(param), diario: vistaDiario, luogo: vistaLuogo };
  const scroll = window.scrollY;
  app.innerHTML = viste[vista]();
  if (disegna.ultima === location.hash) window.scrollTo(0, scroll);
  disegna.ultima = location.hash;

  if (vista === "oggi") dopoOggi();
  collega(app);
}

// Collega i bottoni della vista corrente.
function collega(root) {
  const su = (sel, fn) => root.querySelectorAll(sel).forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); fn(b, e); }));
  const imp = (id) => S.impianti.find((i) => i.id === id);
  su("[data-ortaggio]", (b) => schedaOrtaggio(b.dataset.ortaggio));
  su("[data-trapianta]", (b) => moduloTrapianto(imp(b.dataset.trapianta)));
  su("[data-raccolto]", (b) => moduloEvento({ tipo: "raccolto", impiantoId: b.dataset.raccolto, aiuolaId: imp(b.dataset.raccolto)?.aiuolaId }));
  su("[data-evento-imp]", (b) => moduloEvento({ tipo: "nota", impiantoId: b.dataset.eventoImp, aiuolaId: imp(b.dataset.eventoImp)?.aiuolaId }));
  su("[data-modifica-imp]", (b) => moduloImpianto({ impianto: imp(b.dataset.modificaImp) }));
  su("[data-fine]", (b) => chiudiImpianto(imp(b.dataset.fine)));
  su("[data-modifica-ev]", (b) => moduloEvento({ evento: S.eventi.find((e) => e.id === b.dataset.modificaEv) }));
  su("#nuova-aiuola", () => moduloAiuola());
  su("#piu-aiuole", () => moduloPiuAiuole());
  su("[data-zona-vista]", (b) => { S.impostazioni.zonaVista = b.dataset.zonaVista; salva_e_ridisegna(); });
  su("[data-zona]", (b) => moduloZona(b.dataset.zona));
  su("#nuova-coltura", () => moduloImpianto({}));
  su("#diagnosi", () => apriDiagnosi());
  su("[data-diagnosi-imp]", (b) => { const i = imp(b.dataset.diagnosiImp); apriDiagnosi({ ortaggioId: i?.ortaggioId, aiuolaId: i?.aiuolaId, impiantoId: i?.id }); });
  su("[data-concima]", (b) => { const a = aiuola(b.dataset.concima); moduloEvento({ tipo: "concimazione", aiuolaId: a.id, testo: testoConcimazione(a) }); });
  su("#nuovo-evento", () => moduloEvento({}));

  const { param } = rotta();
  const a = param && aiuola(param);
  if (a) {
    su("#coltura-qui", () => moduloImpianto({ aiuolaId: a.id }));
    su("[data-cella-nuova]", (b) => moduloImpianto({ aiuolaId: a.id, celle: [b.dataset.cellaNuova] }));
    su("#evento-qui", () => moduloEvento({ tipo: "lavoro", aiuolaId: a.id }));
    su("#modifica-aiuola", () => moduloAiuola(a));
    su("#elimina-aiuola", () => {
      const n = S.impianti.filter((i) => i.aiuolaId === a.id).length;
      if (!confirm(`Eliminare l'aiuola «${nomeAiuola(a)}»${n ? ` e tutta la sua storia (${n} colture)` : ""}?`)) return;
      S.aiuole = S.aiuole.filter((x) => x.id !== a.id);
      S.impianti = S.impianti.filter((i) => i.aiuolaId !== a.id);
      S.eventi = S.eventi.filter((e) => e.aiuolaId !== a.id);
      salva();
      location.hash = "#orto";
    });
  }

  el("anno-diario")?.addEventListener("change", (e) => { annoDiario = e.target.value; disegna(); });
  su("#gps", prendiGPS);
  su("#manuale", posizioneManuale);
  su("#analizza-clima", () => analizzaClima(true));
  su("#analizza-terreno", analizzaTerreno);
  su("#date-brinate", modificaDateBrinate);
  su("#invia", inviaCopia);
  su("#esporta", esportaDati);
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
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("service worker", e));
}
navigator.storage?.persist?.();

disegna();
