// =============================================================================
// Orto di prova: si parte da un orto vuoto e una guida passo passo fa fare le
// cose (creare le aiuole, seminare, annaffiare, raccogliere, il semenzaio e il
// trapianto), poi mostra le altre schede.
// I dati di prova stanno in un'altra chiave di localStorage ("ilmioorto.prova",
// vedi CHIAVE in app.js); la prova vale solo finché l'app resta aperta
// (sessionStorage): riaprendo l'app si torna all'orto vero.
// Le aiuole aggiunte dall'esempio hanno id "es-…"; quelle fatte da chi prova no.
// Colture ed eventi dell'esempio hanno es: true (le missioni contano solo i tuoi).
// =============================================================================

const CHIAVE_PROVA = "ilmioorto.prova";
const SESSIONE_PROVA = "ilmioorto.inProva";
const SESSIONE_PASSO = "ilmioorto.passoProva";
const SESSIONE_CHIUSA = "ilmioorto.guidaChiusa";

function inProva() { return IN_PROVA; }
function leggiSessione(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function scriviSessione(k, v) { try { sessionStorage.setItem(k, v); } catch { /* niente */ } }

// --- Cosa ha fatto chi prova -------------------------------------------------
function aiuoleMie() { return aiuoleOrdinate().filter((a) => coltivabile(a) && !String(a.id).startsWith("es-")); }
function esempioPresente() { return S.aiuole.some((a) => String(a.id).startsWith("es-")); }
function aiuolaMia() { return aiuoleMie()[0] || null; }
function serraMia() { return aiuoleMie().find((a) => a.copertura === "serra") || aiuoleMie()[1] || null; }
function colturaMia() {
  const a = aiuolaMia();
  return a ? [...S.impianti].reverse().find((i) => i.aiuolaId === a.id && !i.daSemenzaio) || null : null;
}
function semenzaioMio() { return S.impianti.find((i) => i.aiuolaId === "semenzaio") || null; }

// Un ortaggio che si può seminare a terra oggi (o il più vicino), e uno da semenzaio.
function ortaggioPerOggi(lista, modo, aiuolaId, protezione) {
  const ora = oggi();
  const prove = lista.map((id) => ({ id, u: primaDataUtile(id, modo, aiuolaId, protezione) })).filter((x) => x.u);
  return (prove.find((x) => giorniTra(ora, x.u.data) <= 0) || prove.sort((x, y) => x.u.data - y.u.data)[0] || { id: lista[0] }).id;
}
function sceltaSemina() {
  const a = aiuolaMia()?.id;
  const subito = ortaggioPerOggi(["lattuga", "ravanello", "lattughino", "valerianella", "spinacio", "rucola"], "dir", a, "");
  if (giorniTra(oggi(), primaDataUtile(subito, "dir", a, "")?.data ?? oggi()) <= 0) return { id: subito, tnt: false };
  return { id: ortaggioPerOggi(["lattughino", "valerianella", "spinacio", "ravanello", "lattuga"], "dir", a, "tnt"), tnt: true };
}
function sceltaSemenzaio() { return ortaggioPerOggi(["pomodoro", "lattuga", "cavolonero", "verza", "porro", "cipolla", "peperone"], "sem", "semenzaio", ""); }
const nomeO = (id) => esc(PER_ID[id]?.nome ?? id);

// "Far passare il tempo": la coltura (e le sue note) tornano indietro finché sono
// passati "giorni" dalla semina (o dal trapianto) a oggi.
function anticipaColtura(i, giorni) {
  if (!i) return;
  const sposta = giorniTra(piuGiorni(oggi(), -giorni), daISO(i.data));
  if (sposta <= 0) return;
  const indietro = (d) => aISO(piuGiorni(daISO(d), -sposta));
  i.data = indietro(i.data);
  for (const e of S.eventi) if (e.impiantoId === i.id) e.data = indietro(e.data);
  salva_e_ridisegna();
}

// --- I passi -------------------------------------------------------------------
// vai, testo, evidenzia possono essere funzioni (dipendono da cosa ha fatto chi prova).
// fatto() = il passo è compiuto; azione = bottone in più nella scheda della guida.
const PASSI_PROVA = [
  { vai: "#orto", titolo: "🟫 La prima aiuola", evidenzia: "#nuova-aiuola",
    testo: "Partiamo da un orto vuoto. Tocca <b>＋ Nuova aiuola</b> e scrivi: numero <b>1</b>, larghezza <b>2</b>, lunghezza <b>2</b>; più giù righe <b>4</b> e colonne <b>4</b> (la scacchiera). Poi tocca <b>Salva</b>.",
    fatto: () => aiuoleMie().length >= 1 },
  { vai: "#orto", titolo: "🏠 Una serra", evidenzia: "#nuova-aiuola",
    testo: "Di nuovo <b>＋ Nuova aiuola</b>: numero <b>2</b>, larghezza <b>3</b>, lunghezza <b>2</b>, e in «All'aperto o in serra» scegli <b>In serra o tunnel</b>. Salva.",
    fatto: () => aiuoleMie().length >= 2 },
  { vai: "#orto", titolo: "✨ Le altre le metto io", evidenzia: null,
    testo: "Hai capito come si fa! Le altre aiuole dell'esempio, con un anno di storia (raccolti, concimi, trattamenti), le aggiungo io: tocca il bottone qui sotto.",
    azione: { testo: "✨ Aggiungi le altre aiuole", fai: () => completaOrto() },
    fatto: () => esempioPresente() },
  { vai: "#orto", titolo: "🗺️ La mappa", evidenzia: "svg.pianta",
    testo: "Ecco l'orto visto dall'alto: le tue aiuole 1 e 2 e quelle dell'esempio, su tre file (in fondo = verso nord). Marrone = terra nuda, nero = telo, azzurro con 🏠 = serra." },
  { vai: "#orto", titolo: "👆 Apri l'aiuola 1", evidenzia: "svg.pianta",
    testo: () => `Tocca l'aiuola <b>${esc(aiuolaMia()?.numero ?? 1)}</b> nel disegno (o il suo riquadro più sotto): si apre la sua pagina.`,
    fatto: () => aiuolaMia() && location.hash === `#orto/${aiuolaMia().id}` },
  { vai: () => `#orto/${aiuolaMia()?.id ?? ""}`, titolo: "🌱 Semina", evidenzia: "#coltura-qui",
    testo: () => {
      const s = sceltaSemina();
      const u = primaDataUtile(s.id, "dir", aiuolaMia()?.id, s.tnt ? "tnt" : "");
      const dopo = u && giorniTra(oggi(), u.data) > 0
        ? ` Adesso non è il periodo: l'app mette da sola la data giusta più avanti (<b>${fmtAnno(u.data)}</b>). Va bene così: è una semina in programma.`
        : " La data la mette l'app: è la <b>prima data utile</b>.";
      return `Tocca <b>＋ Nuova coltura</b>. Ortaggio: <b>${nomeO(s.id)}</b>; Come: <b>Semina a terra</b>. ${s.tnt ? "Fa freddo: in «Protezione all'inizio» scegli <b>🧣 Tessuto non tessuto</b>." : ""}${dopo} Se vuoi, tocca dei quadretti per scegliere dove. Poi Salva.`;
    },
    fatto: () => Boolean(colturaMia()) },
  { vai: () => `#orto/${aiuolaMia()?.id ?? ""}`, titolo: "💧 Annaffia", evidenzia: "[data-evento-imp]",
    testo: "Sotto la coltura tocca <b>＋ Nota</b>, in «Che cosa» scegli <b>💧 Annaffiatura</b> e Salva. Il diario si ricorda tutto quello che fai.",
    fatto: () => { const c = colturaMia(); return Boolean(c && S.eventi.some((e) => e.impiantoId === c.id && e.tipo !== "raccolto")); } },
  { vai: () => `#orto/${aiuolaMia()?.id ?? ""}`, titolo: "🧺 Il raccolto", evidenzia: "[data-raccolto]",
    testo: "Le piante devono crescere: tocca <b>⏩ Fai passare il tempo</b> qui sotto. Poi tocca <b>🧺 Raccolto</b>, scrivi quanti kg (per esempio 0,5) e Salva.",
    azione: { testo: "⏩ Fai passare il tempo", fai: () => { const c = colturaMia(); anticipaColtura(c, PER_ID[c?.ortaggioId]?.gg || 50); } },
    fatto: () => { const c = colturaMia(); return Boolean(c && S.eventi.some((e) => e.impiantoId === c.id && e.tipo === "raccolto")); } },
  { vai: () => `#orto/${aiuolaMia()?.id ?? ""}`, titolo: "✅ Fine coltura", evidenzia: "[data-fine]",
    testo: "Quando la pianta ha finito tocca <b>Fine coltura</b>: scegli com'è andata e scrivi un commento per l'anno prossimo. La coltura non sparisce: resta nella storia dell'aiuola.",
    fatto: () => Boolean(colturaMia()?.finito) },
  { vai: "#orto/semenzaio", titolo: "🪴 Il semenzaio", evidenzia: "#coltura-qui",
    testo: () => `Certe piante si seminano prima in vasetti, al caldo: è il <b>semenzaio</b>. Tocca <b>＋ Nuova semina</b>, scegli <b>${nomeO(sceltaSemenzaio())}</b> e Salva.`,
    fatto: () => Boolean(semenzaioMio()) },
  { vai: "#orto/semenzaio", titolo: "🚜 Il trapianto", evidenzia: "[data-trapianta]",
    testo: () => `Quando le piantine sono grandi vanno nell'orto. Tocca <b>⏩ Fai passare il tempo</b>, poi <b>Trapianta</b>: tocca l'aiuola <b>${esc(serraMia()?.numero ?? 2)}</b> sulla mappa e premi Trapianta. L'app controlla vicini e rotazione anche lì.`,
    azione: { testo: "⏩ Fai passare il tempo", fai: () => { const i = semenzaioMio(); anticipaColtura(i, (PER_ID[i?.ortaggioId]?.semTrap || 6) * 7); } },
    fatto: () => S.impianti.some((i) => i.daSemenzaio) },
  { vai: "#orto/es-3", titolo: "🔄 Gli avvisi", evidenzia: ".avviso, .pericolo",
    testo: "In questa aiuola dell'esempio l'anno scorso c'erano le cipolle: rimettere la stessa famiglia stanca la terra, e l'app lo dice in arancione 🔄. In rosso ⚠️ i vicini che non vanno d'accordo, in verde 🤝 quelli buoni." },
  { vai: "#oggi", titolo: "☀️ Oggi", evidenzia: null,
    testo: "La pagina di tutti i giorni: le cose da fare 🔔, i lavori del mese, il meteo, i prossimi raccolti e cosa si può seminare adesso." },
  { vai: "#calendario", titolo: "📅 Calendario", evidenzia: ".legenda",
    testo: "Una riga per ortaggio: i colori dicono quando seminare, trapiantare e raccogliere nel tuo clima. Tocca un ortaggio per leggere la sua scheda." },
  { vai: "#diario", titolo: "📓 Diario", evidenzia: null,
    testo: "Qui c'è tutto: anche la tua semina, l'annaffiatura e il raccolto di prima, con i kg. In alto scegli l'anno: guarda l'anno scorso per vedere un orto intero." },
  { vai: "#piano", titolo: "📋 L'orto dell'anno nuovo", evidenzia: null,
    testo: "Da settembre l'app prepara l'orto dell'anno dopo partendo da quello che hai coltivato: ogni aiuola passa all'altra con le sue piante. Prova a toccare «Comincia» e poi «🧮 Calcola il piano»." },
  { vai: "#luogo", titolo: "📍 Luogo e copia dei dati", evidenzia: null,
    testo: "Nel tuo orto vero qui metti la posizione col GPS (le date si adattano al tuo clima) e ogni tanto fai «📤 Invia copia» per non perdere i dati." },
  { vai: "#aiuto", titolo: "🎉 Bravo, hai finito!", evidenzia: null,
    testo: "Adesso sai fare tutto. Vuoi metterti alla prova? Tocca <b>🏅 Missioni</b>: dieci sfide con le medaglie, un quiz e la macchina del tempo. Quando hai finito tocca «Esci dalla prova»: torni al tuo orto e quello di prova si cancella.",
    azione: { testo: "🏅 Vai alle missioni", fai: () => { location.hash = "#missioni"; } } },
];
const val = (x) => (typeof x === "function" ? x() : x);

function passoProva() {
  return Math.max(0, Math.min(PASSI_PROVA.length - 1, Number(leggiSessione(SESSIONE_PASSO)) || 0));
}

// -----------------------------------------------------------------------------
// L'esempio da aggiungere alle aiuole fatte da chi prova. Le date sono calcolate
// da oggi: "l'anno scorso" è l'anno che il piano della stagione legge, e le
// colture in corso dipendono dalla stagione.
// -----------------------------------------------------------------------------
function completaOrto() {
  if (esempioPresente()) return;
  const ora = oggi();
  const A = annoPiano() - 1;
  const ieri = aISO(piuGiorni(ora, -1));
  const g = (mmdd) => { const d = `${A}-${mmdd}`; return d > ieri ? ieri : d; }; // mai nel futuro
  const fa = (n) => aISO(piuGiorni(ora, -n));
  const tra = (n) => aISO(piuGiorni(ora, n));

  // Se chi prova ha saltato i primi passi, le sue due aiuole le faccio io.
  const zona = aiuolaMia()?.zona || zonaScelta() || zone()[0] || "Orto di prova";
  if (!aiuoleMie().length) S.aiuole.push({ id: nuovoId(), zona, numero: 1, larghezza: 2, lunghezza: 2, righe: 4, colonne: 4 });
  if (aiuoleMie().length < 2) S.aiuole.push({ id: nuovoId(), zona, numero: 2, larghezza: 3, lunghezza: 2, copertura: "serra", righe: 1, colonne: 1 });
  S.zone[zona] = { corridoio: 0.3, direzione: 90, ...(S.zone[zona] || {}) };

  let num = Math.max(0, ...S.aiuole.filter((a) => !a.semenzaio && a.zona === zona).map((a) => Number(a.numero) || 0));
  const aiuola = (k, nome, w, h, altro = {}) => S.aiuole.push({ id: "es-" + k, zona, numero: ++num, nome, larghezza: w, lunghezza: h, righe: 1, colonne: 1, ...altro });
  aiuola(1, "Lungo la rete", 4, 1, { fila: 1, righe: 1, colonne: 8, note: "Rete in fondo: qui vanno le piante alte." });
  aiuola(2, "", 2, 2, { righe: 4, colonne: 4 });
  aiuola(3, "", 2, 2, { pacciamatura: "telo" });
  aiuola(4, "Fragole", 2, 1, { fila: -1, righe: 2, colonne: 6 });
  aiuola(5, "Aromatiche", 1, 1, { fila: -1 });
  aiuola(6, "", 2, 1.5, { fila: -1 });

  const imp = (ortaggioId, aiuolaId, data, modo, altro = {}) => {
    const i = { id: nuovoId(), ortaggioId, aiuolaId, data, modo, finito: false, celle: [], es: true, ...altro };
    S.impianti.push(i);
    return i;
  };
  const fine = (i, dataFine) => Object.assign(i, { finito: true, dataFine: dataFine > ieri ? ieri : dataFine, esito: "raccolto" });
  const ev = (tipo, data, aiuolaId, impiantoId, testo, kg = null) => S.eventi.push({ id: nuovoId(), tipo, data, aiuolaId, impiantoId: impiantoId || "", testo, kg, es: true });
  const celle = (righe, colonne) => righe.flatMap((r) => colonne.map((c) => r + c));

  // L'anno scorso: una stagione intera, già finita (il peperone nella serra di chi prova).
  const pom = fine(imp("pomodoro", "es-1", g("05-10"), "tra", { varieta: "Cuore di bue", quantita: "8 piante", celle: celle(["a"], [1, 2, 3, 4, 5, 6, 7, 8]) }), g("09-30"));
  const lat = fine(imp("lattuga", "es-2", g("04-01"), "tra", { celle: celle(["a", "b"], [1, 2, 3, 4]) }), g("05-31"));
  const fag = fine(imp("fagiolino", "es-2", g("05-20"), "dir", { celle: celle(["c", "d"], [1, 2, 3, 4]) }), g("08-31"));
  const serra = serraMia();
  const pep = serra ? fine(imp("peperone", serra.id, g("05-01"), "tra", { quantita: "6 piante" }), g("10-15")) : null;
  const zuc = fine(imp("zucchino", "es-6", g("05-05"), "tra", { quantita: "3 piante" }), g("09-10"));
  imp("fragola", "es-4", `${A - 1}-09-15`, "tra", { celle: celle(["a", "b"], [1, 2, 3, 4, 5, 6]) });
  imp("rosmarino", "es-5", `${A - 2}-04-10`, "tra");
  // Le cipolle stanno nell'anno solare prima della coltura di adesso nella stessa
  // aiuola (aglio o porro): così compare l'avviso di rotazione 🔄.
  const annoCip = Number(fa(35).slice(0, 4)) - 1;
  const cip = fine(imp("cipolla", "es-3", `${annoCip}-03-25`, "tra", { varieta: "Dorata" }), `${annoCip}-07-20`);

  ev("concimazione", `${annoCip}-03-10`, "es-3", "", "Stallatico pellettato, 0,3 kg/m²");
  ev("concimazione", g("04-25"), "es-1", "", "Pollina pellettata, 0,2 kg/m²");
  ev("raccolto", g("05-20"), "es-2", lat.id, "Prime insalate", 1.5);
  ev("trattamento", g("07-01"), "es-1", pom.id, "Rame contro la peronospora, dopo le piogge");
  ev("raccolto", g("07-12"), "es-6", zuc.id, "", 3);
  ev("raccolto", `${annoCip}-07-15`, "es-3", cip.id, "Cipolle messe ad asciugare", 4);
  ev("raccolto", g("07-25"), "es-2", fag.id, "", 2.2);
  ev("raccolto", g("08-05"), "es-1", pom.id, "", 4.5);
  ev("raccolto", g("08-25"), "es-1", pom.id, "Tante: fatta la passata", 6);
  if (pep) ev("raccolto", g("08-30"), serra.id, pep.id, "", 2.5);

  // Adesso: colture in corso secondo la stagione.
  const mese = ora.getMonth();
  if (mese >= 4 && mese <= 7) { // da maggio ad agosto
    imp("fagiolo", "es-1", fa(35), "dir", { celle: celle(["a"], [1, 2, 3, 4, 5, 6, 7, 8]) });
    const p = imp("pomodoro", "es-2", fa(45), "tra", { varieta: "San Marzano", celle: celle(["a", "b", "c", "d"], [1, 2, 3, 4]) });
    imp("porro", "es-3", fa(30), "tra");
    const l = imp("lattuga", "es-6", fa(40), "dir");
    ev("raccolto", fa(3), "es-6", l.id, "Prima lattuga", 0.4);
    ev("trattamento", fa(10), "es-2", p.id, "Rame dopo il temporale");
  } else {
    imp("cavolonero", "es-1", fa(60), "tra", { celle: celle(["a"], [1, 2, 3, 4, 5, 6, 7, 8]) });
    imp("valerianella", "es-2", fa(40), "dir", { protezione: "tnt", celle: celle(["a", "b"], [1, 2, 3, 4]) });
    const sp = imp("spinacio", "es-2", fa(45), "dir", { celle: celle(["c", "d"], [1, 2, 3, 4]) });
    imp("aglio", "es-3", fa(35), "tra");
    ev("raccolto", fa(3), "es-2", sp.id, "Prime foglie", 0.3);
  }
  ev("nota", tra(3), "", "", "Comprare il tessuto non tessuto");
  ev("lavoro", tra(5), "es-1", "", "Legare le piante alla rete");
  salva_e_ridisegna();
}

// Orto di partenza: vuoto, con posizione e clima del tuo orto vero (date e meteo giusti).
function ortoVuotoDiProva() {
  const s = statoVuoto();
  let vero = null;
  try { vero = JSON.parse(localStorage.getItem(profiloAttivo().chiave)); } catch { /* niente */ }
  if (vero?.impostazioni) {
    const v = vero.impostazioni;
    Object.assign(s.impostazioni, { ultimaBrinata: v.ultimaBrinata || s.impostazioni.ultimaBrinata, primaBrinata: v.primaBrinata || s.impostazioni.primaBrinata,
      lat: v.lat ?? null, lon: v.lon ?? null, altitudine: v.altitudine ?? null, luogo: v.luogo || "" });
    s.clima = vero.clima || null;
  }
  s.impostazioni.preferiti = ["pomodoro", "zucchino", "lattuga", "fagiolino"];
  return s;
}

// -----------------------------------------------------------------------------
// Entrare, uscire, andare avanti
// -----------------------------------------------------------------------------
function iniziaProva() {
  try {
    localStorage.setItem(CHIAVE_PROVA, JSON.stringify(ortoVuotoDiProva()));
    sessionStorage.setItem(SESSIONE_PROVA, "1");
    sessionStorage.setItem(SESSIONE_PASSO, "0");
    sessionStorage.setItem(SESSIONE_CHIUSA, "0");
  } catch (e) {
    alert("Non riesco a preparare l'orto di prova: " + e.message);
    return;
  }
  location.hash = "#orto";
  location.reload();
}

function esciProva() {
  if (!confirm("Uscire dalla prova? L'orto di prova si cancella e torni al tuo orto.")) return;
  try {
    localStorage.removeItem(CHIAVE_PROVA);
    for (const k of [SESSIONE_PROVA, SESSIONE_PASSO, SESSIONE_CHIUSA]) sessionStorage.removeItem(k);
  } catch { /* niente */ }
  location.hash = "#orto";
  location.reload();
}

function vaiAlPasso(k) {
  scriviSessione(SESSIONE_PASSO, String(k));
  const vai = val(PASSI_PROVA[k].vai);
  if (location.hash === vai) disegnaGuidaProva();
  else location.hash = vai; // hashchange ridisegna la pagina e la guida
}

// Striscia in alto e scheda della guida in basso (fuori da #app, così restano
// quando la pagina si ridisegna).
let ultimoScroll = "";
function disegnaGuidaProva() {
  if (!inProva()) return;
  document.body.classList.add("in-prova");
  if (!el("striscia-prova")) {
    const striscia = document.createElement("div");
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
  const chiusa = leggiSessione(SESSIONE_CHIUSA) === "1";
  const fatto = p.fatto ? Boolean(p.fatto()) : null;
  const vai = val(p.vai);
  document.body.classList.toggle("guida-aperta", !chiusa);
  box.innerHTML = chiusa
    ? `<button class="piccolo" id="guida-apri">🎓 Guida ${k + 1} di ${PASSI_PROVA.length}${fatto ? " ✅" : ""} ▴</button>`
    : `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <b>${p.titolo}</b>
        <span class="tenue piccolo" style="white-space:nowrap">${k + 1} di ${PASSI_PROVA.length} <button class="piccolo secondario" id="guida-chiudi" title="Rimpicciolisci" aria-label="Rimpicciolisci la guida">▾</button></span>
      </div>
      <p style="margin:6px 0 10px">${val(p.testo)}</p>
      ${fatto ? `<p class="bene" style="margin:0 0 10px">✅ Fatto, bravo! Tocca «Avanti».</p>` : ""}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${k > 0 ? `<button class="secondario" id="guida-indietro">◀</button>` : ""}
        ${location.hash !== vai ? `<button class="secondario" id="guida-qui">↩︎ Torna qui</button>` : ""}
        ${p.azione && !fatto ? `<button id="guida-azione">${p.azione.testo}</button>` : ""}
        ${k < PASSI_PROVA.length - 1
          ? (fatto === false ? `<button class="secondario" id="guida-avanti">Salta ▶</button>` : `<button id="guida-avanti">Avanti ▶</button>`)
          : `<button id="guida-esci">Esci dalla prova</button>`}
      </div>`;
  const su = (sel, fn) => box.querySelector(sel)?.addEventListener("click", fn);
  const chiudi = (v) => { scriviSessione(SESSIONE_CHIUSA, v ? "1" : "0"); disegnaGuidaProva(); };
  su("#guida-apri", () => chiudi(false));
  su("#guida-chiudi", () => chiudi(true));
  su("#guida-avanti", () => vaiAlPasso(k + 1));
  su("#guida-indietro", () => vaiAlPasso(k - 1));
  su("#guida-qui", () => vaiAlPasso(k));
  su("#guida-azione", () => p.azione.fai());
  su("#guida-esci", esciProva);
  // Faccio lampeggiare la cosa da fare (solo nella pagina del passo e finché non è fatta).
  document.querySelectorAll(".evidenziato").forEach((x) => x.classList.remove("evidenziato"));
  if (!chiusa && !fatto && p.evidenzia && location.hash === vai) {
    const x = document.querySelector(p.evidenzia);
    if (x) {
      x.classList.add("evidenziato");
      const chiave = `${k}|${location.hash}`;
      if (ultimoScroll !== chiave) { ultimoScroll = chiave; x.scrollIntoView({ block: "center", behavior: "smooth" }); }
    }
  }
}

// Riquadro nella pagina Aiuto (e nell'orto ancora vuoto) per cominciare o uscire.
function htmlInvitoProva() {
  if (inProva()) {
    return `<section class="carta invito-prova">
      <b>🎓 Sei nell'orto di prova.</b>
      <p class="tenue piccolo" style="margin:4px 0 8px">Puoi ricominciare da capo o tornare al tuo orto.</p>
      <button id="inizia-prova" class="secondario">↺ Ricomincia la prova</button> <button id="esci-prova">Esci dalla prova</button>
    </section>`;
  }
  return `<section class="carta invito-prova">
    <b>🎓 Impara con un orto di prova</b>
    <p class="tenue piccolo" style="margin:4px 0 8px">Si parte da un orto vuoto: una guida passo passo ti fa creare le aiuole, seminare, annaffiare, raccogliere e trapiantare. Puoi sbagliare quanto vuoi: il tuo orto vero non cambia.</p>
    <button id="inizia-prova">🎓 Prova con un orto di esempio</button>
  </section>`;
}

// Ogni volta che l'app ridisegna (cambio pagina o dati salvati) aggiorno la guida:
// così il passo si spunta ✅ appena chi prova l'ha fatto.
if (inProva()) {
  const disegnaApp = disegna;
  disegna = function () { disegnaApp(); disegnaGuidaProva(); };
  disegnaGuidaProva();
}
