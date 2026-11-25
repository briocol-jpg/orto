// =============================================================================
// Orto di prova: un orto finto, con un anno di storia, per imparare l'app
// passo passo senza toccare i dati veri.
// I dati di prova stanno in un'altra chiave di localStorage ("ilmioorto.prova",
// vedi CHIAVE in app.js); la prova vale solo finché l'app resta aperta
// (sessionStorage): riaprendo l'app si torna all'orto vero.
// =============================================================================

const CHIAVE_PROVA = "ilmioorto.prova";
const SESSIONE_PROVA = "ilmioorto.inProva";
const SESSIONE_PASSO = "ilmioorto.passoProva";

// I passi della guida: dove andare, cosa guardare, cosa provare.
// "evidenzia" = elemento della pagina da far lampeggiare.
const PASSI_PROVA = [
  { vai: "#orto", titolo: "🌱 Questo è l'orto di prova", evidenzia: "svg.pianta",
    testo: "Qui vedi le aiuole dall'alto: una fila in fondo (verso nord) e una davanti. Marrone = terra nuda, nero = telo, azzurro con 🏠 = serra. Puoi toccare e cambiare tutto: il tuo orto vero non cambia." },
  { vai: "#orto/e2", titolo: "🟫 Dentro un'aiuola", evidenzia: ".scacchiera",
    testo: "L'aiuola è divisa in quadretti (la scacchiera): ogni ortaggio occupa i suoi. Sotto vedi cosa c'è adesso e, più giù, cosa c'era gli anni passati." },
  { vai: "#orto/e3", titolo: "🔄 Gli avvisi", evidenzia: ".avviso, .pericolo",
    testo: "In questa aiuola l'anno scorso c'erano le cipolle: rimettere la stessa famiglia stanca la terra, e l'app lo dice in arancione 🔄. In rosso ⚠️ i vicini che non vanno d'accordo, in verde 🤝 quelli buoni." },
  { vai: "#orto/e5", titolo: "🌱 Prova a seminare", evidenzia: "#coltura-qui",
    testo: "Tocca «＋ Nuova coltura» e scegli un ortaggio: l'app propone la prima data utile. Se scegli 🧣 tessuto non tessuto, la data si anticipa di 2 settimane. Poi tocca Salva: qui non si rompe niente." },
  { vai: "#oggi", titolo: "☀️ Oggi", evidenzia: null,
    testo: "La pagina di tutti i giorni: le cose da fare 🔔, i lavori del mese, il meteo, i prossimi raccolti e cosa si può seminare adesso." },
  { vai: "#calendario", titolo: "📅 Calendario", evidenzia: ".legenda",
    testo: "Una riga per ortaggio: i colori dicono quando seminare, trapiantare e raccogliere nel tuo clima. Tocca un ortaggio per leggere la sua scheda." },
  { vai: "#diario", titolo: "📓 Diario", evidenzia: null,
    testo: "Tutto quello che è stato fatto, giorno per giorno, con i kg raccolti. In alto scegli l'anno: guarda l'anno scorso per vedere un orto intero." },
  { vai: "#piano", titolo: "📋 L'orto dell'anno nuovo", evidenzia: null,
    testo: "Da settembre l'app prepara l'orto dell'anno dopo, partendo da quello che hai coltivato. Tocca «Comincia» (o «🧮 Calcola il piano») e guarda dove andrebbe ogni ortaggio." },
  { vai: "#luogo", titolo: "📍 Luogo e copia dei dati", evidenzia: null,
    testo: "Nel tuo orto vero qui metti la posizione col GPS (le date si adattano al tuo clima) e ogni tanto fai «📤 Invia copia» per non perdere i dati." },
  { vai: "#aiuto", titolo: "🎉 Fatto!", evidenzia: null,
    testo: "Adesso prova da solo a toccare quello che vuoi. Quando hai finito tocca «Esci dalla prova» in alto: torni al tuo orto e quello di prova si cancella." },
];

function inProva() { return IN_PROVA; }

function passoProva() {
  try { return Math.max(0, Math.min(PASSI_PROVA.length - 1, Number(sessionStorage.getItem(SESSIONE_PASSO)) || 0)); } catch { return 0; }
}

// -----------------------------------------------------------------------------
// L'orto finto. Le date sono calcolate da oggi: "l'anno scorso" è l'anno che
// il piano della stagione legge, e le colture in corso dipendono dalla stagione.
// -----------------------------------------------------------------------------
function ortoDiProva() {
  const ora = oggi();
  const A = annoPiano() - 1; // stagione completa da mostrare
  const ieri = aISO(piuGiorni(ora, -1));
  const g = (mmdd) => { const d = `${A}-${mmdd}`; return d > ieri ? ieri : d; }; // mai nel futuro
  const fa = (n) => aISO(piuGiorni(ora, -n));
  const tra = (n) => aISO(piuGiorni(ora, n));
  let n = 0;
  const id = () => "p" + ++n;

  // Posizione e clima: quelli del tuo orto vero, così date e meteo sono giusti.
  let vero = null;
  try { vero = JSON.parse(localStorage.getItem("ilmioorto.v1")); } catch { /* niente */ }
  const s = statoVuoto();
  if (vero?.impostazioni) {
    const v = vero.impostazioni;
    Object.assign(s.impostazioni, { ultimaBrinata: v.ultimaBrinata || s.impostazioni.ultimaBrinata, primaBrinata: v.primaBrinata || s.impostazioni.primaBrinata,
      lat: v.lat ?? null, lon: v.lon ?? null, altitudine: v.altitudine ?? null, luogo: v.luogo || "" });
    s.clima = vero.clima || null;
  }
  s.impostazioni.preferiti = ["pomodoro", "zucchino", "lattuga", "fagiolino"];

  const Z = "Orto di prova";
  s.zone[Z] = { corridoio: 0.3, direzione: 90 };
  const aiuola = (num, nome, w, h, altro = {}) => ({ id: "e" + num, zona: Z, numero: num, nome, larghezza: w, lunghezza: h, righe: 1, colonne: 1, ...altro });
  s.aiuole.push(
    aiuola(1, "Lungo la rete", 4, 1, { fila: 1, righe: 1, colonne: 8, note: "Rete in fondo: qui vanno le piante alte." }),
    aiuola(2, "", 2, 2, { righe: 4, colonne: 4 }),
    aiuola(3, "", 2, 2, { pacciamatura: "telo" }),
    aiuola(4, "Serra", 3, 2, { copertura: "serra" }),
    aiuola(5, "", 2, 1.5, { fila: -1 }),
    aiuola(6, "Aromatiche", 1, 1, { fila: -1 }),
    aiuola(7, "Fragole", 2, 1, { fila: -1, righe: 2, colonne: 6 }),
  );

  const imp = (ortaggioId, aiuolaId, data, modo, altro = {}) => {
    const i = { id: id(), ortaggioId, aiuolaId, data, modo, finito: false, celle: [], ...altro };
    s.impianti.push(i);
    return i;
  };
  const fine = (i, dataFine) => Object.assign(i, { finito: true, dataFine: dataFine > ieri ? ieri : dataFine, esito: "raccolto" });
  const ev = (tipo, data, aiuolaId, impiantoId, testo, kg = null) => s.eventi.push({ id: id(), tipo, data, aiuolaId, impiantoId: impiantoId || "", testo, kg });
  const celle = (righe, colonne) => righe.flatMap((r) => colonne.map((c) => r + c));

  // L'anno scorso: una stagione intera, già finita.
  const pom = fine(imp("pomodoro", "e1", g("05-10"), "tra", { varieta: "Cuore di bue", quantita: "8 piante", celle: celle(["a"], [1, 2, 3, 4, 5, 6, 7, 8]) }), g("09-30"));
  const lat = fine(imp("lattuga", "e2", g("04-01"), "tra", { celle: celle(["a", "b"], [1, 2, 3, 4]) }), g("05-31"));
  const fag = fine(imp("fagiolino", "e2", g("05-20"), "dir", { celle: celle(["c", "d"], [1, 2, 3, 4]) }), g("08-31"));
  // Le cipolle stanno nell'anno solare prima della coltura di adesso nella stessa
  // aiuola (aglio o porro): così compare l'avviso di rotazione 🔄.
  const annoCip = Number(fa(35).slice(0, 4)) - 1;
  const cip = fine(imp("cipolla", "e3", `${annoCip}-03-25`, "tra", { varieta: "Dorata" }), `${annoCip}-07-20`);
  const pep = fine(imp("peperone", "e4", g("05-01"), "tra", { quantita: "6 piante" }), g("10-15"));
  const zuc = fine(imp("zucchino", "e5", g("05-05"), "tra", { quantita: "3 piante" }), g("09-10"));
  imp("rosmarino", "e6", `${A - 2}-04-10`, "tra");
  imp("fragola", "e7", `${A - 1}-09-15`, "tra", { celle: celle(["a", "b"], [1, 2, 3, 4, 5, 6]) });

  ev("concimazione", `${annoCip}-03-10`, "e3", "", "Stallatico pellettato, 0,3 kg/m²");
  ev("concimazione", g("04-25"), "e1", "", "Pollina pellettata, 0,2 kg/m²");
  ev("raccolto", g("05-20"), "e2", lat.id, "Prime insalate", 1.5);
  ev("trattamento", g("07-01"), "e1", pom.id, "Rame contro la peronospora, dopo le piogge");
  ev("raccolto", g("07-12"), "e5", zuc.id, "", 3);
  ev("raccolto", `${annoCip}-07-15`, "e3", cip.id, "Cipolle messe ad asciugare", 4);
  ev("raccolto", g("07-25"), "e2", fag.id, "", 2.2);
  ev("raccolto", g("08-05"), "e1", pom.id, "", 4.5);
  ev("raccolto", g("08-25"), "e1", pom.id, "Tante: fatta la passata", 6);
  ev("raccolto", g("08-30"), "e4", pep.id, "", 2.5);

  // Adesso: colture in corso secondo la stagione.
  const mese = ora.getMonth();
  if (mese >= 4 && mese <= 7) { // da maggio ad agosto
    imp("fagiolo", "e1", fa(35), "dir", { celle: celle(["a"], [1, 2, 3, 4, 5, 6, 7, 8]) });
    const p = imp("pomodoro", "e2", fa(45), "tra", { varieta: "San Marzano", celle: celle(["a", "b", "c", "d"], [1, 2, 3, 4]) });
    imp("porro", "e3", fa(30), "tra"); // dopo le cipolle: avviso di rotazione
    imp("melanzana", "e4", fa(50), "tra");
    const l = imp("lattuga", "e5", fa(40), "dir");
    ev("raccolto", fa(3), "e5", l.id, "Prima lattuga", 0.4);
    ev("trattamento", fa(10), "e2", p.id, "Rame dopo il temporale");
  } else {
    imp("cavolonero", "e1", fa(60), "tra", { celle: celle(["a"], [1, 2, 3, 4, 5, 6, 7, 8]) });
    imp("valerianella", "e2", fa(40), "dir", { protezione: "tnt", celle: celle(["a", "b"], [1, 2, 3, 4]) });
    const sp = imp("spinacio", "e2", fa(45), "dir", { celle: celle(["c", "d"], [1, 2, 3, 4]) });
    imp("aglio", "e3", fa(35), "tra"); // dopo le cipolle: avviso di rotazione
    imp("lattughino", "e4", fa(20), "dir", { protezione: "tnt" });
    ev("raccolto", fa(3), "e2", sp.id, "Prime foglie", 0.3);
  }
  ev("nota", tra(3), "", "", "Comprare il tessuto non tessuto");
  ev("lavoro", tra(5), "e4", "", "Aprire la serra nelle giornate di sole");
  return s;
}

// -----------------------------------------------------------------------------
// Entrare, uscire, andare avanti
// -----------------------------------------------------------------------------
function iniziaProva() {
  try {
    localStorage.setItem(CHIAVE_PROVA, JSON.stringify(ortoDiProva()));
    sessionStorage.setItem(SESSIONE_PROVA, "1");
    sessionStorage.setItem(SESSIONE_PASSO, "0");
  } catch (e) {
    alert("Non riesco a preparare l'orto di prova: " + e.message);
    return;
  }
  location.hash = PASSI_PROVA[0].vai;
  location.reload();
}

function esciProva() {
  if (!confirm("Uscire dalla prova? L'orto di prova si cancella e torni al tuo orto.")) return;
  try {
    localStorage.removeItem(CHIAVE_PROVA);
    sessionStorage.removeItem(SESSIONE_PROVA);
    sessionStorage.removeItem(SESSIONE_PASSO);
  } catch { /* niente */ }
  location.hash = "#orto";
  location.reload();
}

function vaiAlPasso(k) {
  try { sessionStorage.setItem(SESSIONE_PASSO, String(k)); } catch { /* niente */ }
  const vai = PASSI_PROVA[k].vai;
  if (location.hash === vai) disegnaGuidaProva();
  else location.hash = vai; // hashchange ridisegna la pagina e la guida
}

// Striscia in alto e scheda della guida in basso (fuori da #app, così restano
// quando la pagina si ridisegna).
function disegnaGuidaProva() {
  if (!inProva()) return;
  document.body.classList.add("in-prova");
  let striscia = el("striscia-prova");
  if (!striscia) {
    striscia = document.createElement("div");
    striscia.id = "striscia-prova";
    striscia.innerHTML = `<span>🎓 <b>Orto di prova</b>: tocca e prova tutto, il tuo orto vero non cambia.</span>
      <button class="piccolo secondario" id="esci-prova-su">Esci dalla prova</button>`;
    document.querySelector(".testata").after(striscia);
    el("esci-prova-su").addEventListener("click", esciProva);
  }
  let box = el("guida-prova");
  if (!box) {
    box = document.createElement("section");
    box.id = "guida-prova";
    box.setAttribute("aria-live", "polite");
    document.body.appendChild(box);
  }
  const k = passoProva(), p = PASSI_PROVA[k];
  let chiusa = false;
  try { chiusa = sessionStorage.getItem("ilmioorto.guidaChiusa") === "1"; } catch { /* niente */ }
  document.body.classList.toggle("guida-aperta", !chiusa);
  box.innerHTML = chiusa
    ? `<button class="piccolo" id="guida-apri">🎓 Guida ${k + 1} di ${PASSI_PROVA.length} ▴</button>`
    : `<div class="riga" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <b>${p.titolo}</b>
        <span class="tenue piccolo" style="white-space:nowrap">${k + 1} di ${PASSI_PROVA.length} <button class="piccolo secondario" id="guida-chiudi" title="Rimpicciolisci" aria-label="Rimpicciolisci la guida">▾</button></span>
      </div>
      <p style="margin:6px 0 10px">${p.testo}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${k > 0 ? `<button class="secondario" id="guida-indietro">◀ Indietro</button>` : ""}
        ${location.hash !== p.vai ? `<button class="secondario" id="guida-qui">↩︎ Torna qui</button>` : ""}
        ${k < PASSI_PROVA.length - 1 ? `<button id="guida-avanti">Avanti ▶</button>` : `<button id="guida-esci">Esci dalla prova</button>`}
      </div>`;
  const su = (sel, fn) => box.querySelector(sel)?.addEventListener("click", fn);
  const chiudi = (v) => { try { sessionStorage.setItem("ilmioorto.guidaChiusa", v ? "1" : "0"); } catch { /* niente */ } disegnaGuidaProva(); };
  su("#guida-apri", () => chiudi(false));
  su("#guida-chiudi", () => chiudi(true));
  su("#guida-avanti", () => vaiAlPasso(k + 1));
  su("#guida-indietro", () => vaiAlPasso(k - 1));
  su("#guida-qui", () => vaiAlPasso(k));
  su("#guida-esci", esciProva);
  // Faccio lampeggiare la cosa da guardare (solo nella pagina del passo).
  document.querySelectorAll(".evidenziato").forEach((x) => x.classList.remove("evidenziato"));
  if (!chiusa && p.evidenzia && location.hash === p.vai) {
    const x = document.querySelector(p.evidenzia);
    if (x) { x.classList.add("evidenziato"); x.scrollIntoView({ block: "center", behavior: "smooth" }); }
  }
}

// Riquadro nella pagina Aiuto (e nell'orto ancora vuoto) per cominciare o uscire.
function htmlInvitoProva() {
  if (inProva()) {
    return `<section class="carta invito-prova">
      <b>🎓 Sei nell'orto di prova.</b>
      <p class="tenue piccolo" style="margin:4px 0 8px">Puoi ricominciare la guida da capo o tornare al tuo orto.</p>
      <button id="inizia-prova" class="secondario">↺ Ricomincia la prova</button> <button id="esci-prova">Esci dalla prova</button>
    </section>`;
  }
  return `<section class="carta invito-prova">
    <b>🎓 Impara con un orto di prova</b>
    <p class="tenue piccolo" style="margin:4px 0 8px">Un orto finto già pieno di aiuole, ortaggi e raccolti, con una guida passo passo. Puoi toccare e sbagliare: il tuo orto vero non cambia.</p>
    <button id="inizia-prova">🎓 Prova con un orto di esempio</button>
  </section>`;
}

window.addEventListener("hashchange", disegnaGuidaProva);
disegnaGuidaProva();
