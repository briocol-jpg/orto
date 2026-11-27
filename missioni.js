// =============================================================================
// Missioni dell'orto di prova (pagina #missioni): piccole sfide che si
// spuntano da sole quando chi prova le compie, con una medaglia ciascuna, un
// quiz sugli ortaggi e la «macchina del tempo» per vedere crescere le piante.
// Esistono solo nell'orto di prova: l'orto vero non ha missioni né punti.
// Contano solo le cose fatte da chi prova: colture ed eventi dell'esempio
// (completaOrto in prova.js) hanno es: true.
// Lo stato del gioco sta nei dati di prova: S.gioco = { fatte: { id: data }, quiz }.
// =============================================================================

const PUNTI_MISSIONE = 10;

function gioco() {
  S.gioco ??= { fatte: {}, quiz: { giuste: 0, risposte: 0, d: null } };
  S.gioco.quiz ??= { giuste: 0, risposte: 0, d: null };
  return S.gioco;
}
// Colture messe da chi prova: non dell'esempio, non nel semenzaio, non create
// dal piano (sono copie delle colture dell'esempio: valgono solo per la missione del piano).
function coltureMie() {
  return S.impianti.filter((i) => !i.es && !i.piano && coltivabile(aiuola(i.aiuolaId)) && PER_ID[i.ortaggioId]);
}
function eventiMiei(tipo) { return S.eventi.filter((e) => !e.es && !e.piano && (!tipo || e.tipo === tipo)); }

const MISSIONI = [
  { id: "famiglie", ico: "🌈", titolo: "Tre famiglie",
    testo: "Metti nell'orto tre ortaggi di <b>tre famiglie diverse</b> (per esempio un'insalata, un fagiolo e un cavolo). La famiglia la trovi nella scheda dell'ortaggio: 📅 Calendario → tocca il nome.",
    fatto: () => new Set(coltureMie().map((i) => PER_ID[i.ortaggioId].fam)).size >= 3 },
  { id: "amici", ico: "🤝", titolo: "Buoni vicini",
    testo: "Metti un ortaggio accanto a un suo <b>buon vicino</b>, senza cattivi vicini: quando lo aggiungi l'app lo scrive in verde 🤝.",
    fatto: () => coltureMie().some((i) => { const v = avvisiVicini(i.aiuolaId, i.ortaggioId, i.id, i.celle); return v.buoni.length && !v.cattivi.length; }) },
  { id: "pomodoro", ico: "🍅", titolo: "Pomodoro e basilico",
    testo: "La coppia più famosa dell'orto: metti un <b>pomodoro</b> e un <b>basilico</b> vicini, nella stessa aiuola (con la scacchiera in quadretti che si toccano).",
    fatto: () => coltureMie().some((i) => i.ortaggioId === "pomodoro" && avvisiVicini(i.aiuolaId, "pomodoro", i.id, i.celle).buoni.includes("basilico")
      && coltureMie().some((b) => b.ortaggioId === "basilico" && b.aiuolaId === i.aiuolaId)) },
  { id: "rotazione", ico: "🔄", titolo: "Rotazione giusta",
    testo: "In un'aiuola dell'esempio che l'anno scorso era coltivata metti un ortaggio di <b>un'altra famiglia</b>, senza l'avviso arancione 🔄. Per esempio «Lungo la rete» aveva i pomodori: lì vanno bene i fagioli.",
    fatto: () => coltureMie().some((i) => String(i.aiuolaId).startsWith("es-")
      && S.impianti.some((x) => x.aiuolaId === i.aiuolaId && x.finito && x.es)
      && !avvisiRotazione(i.aiuolaId, i.ortaggioId, i.data, i.id, i.celle).length) },
  { id: "tnt", ico: "🧣", titolo: "Al riparo dal freddo",
    testo: "Semina o trapianta qualcosa con il <b>tessuto non tessuto</b>: in «Protezione all'inizio» scegli 🧣. L'app ti fa partire circa due settimane prima.",
    fatto: () => coltureMie().some((i) => i.protezione) },
  { id: "api", ico: "🐝", titolo: "Amici delle api",
    testo: "Senza api niente zucchine né fragole: pianta la <b>lavanda</b> (o il rosmarino) in un'aiuola. I suoi fiori chiamano gli impollinatori.",
    fatto: () => coltureMie().some((i) => i.ortaggioId === "lavanda" || i.ortaggioId === "rosmarino") },
  { id: "raccolto", ico: "🧺", titolo: "Cinque chili",
    testo: "Raccogli in tutto <b>5 kg</b> di verdura: usa ⏩ qui sotto per far crescere le piante, poi tocca 🧺 Raccolto sotto ogni coltura.",
    fatto: () => eventiMiei("raccolto").reduce((n, e) => n + (Number(e.kg) || 0), 0) >= 5 },
  { id: "cura", ico: "🩺", titolo: "Dottore delle piante",
    testo: "Sotto una coltura tocca <b>🩺 Problema?</b>, guarda cosa può essere, poi segna la cura: <b>＋ Nota</b> → «🧴 Trattamento».",
    fatto: () => eventiMiei("trattamento").length > 0 },
  { id: "piano", ico: "📋", titolo: "L'orto dell'anno nuovo",
    testo: "In 🌱 Orto tocca <b>📋 Prepara l'orto</b>, poi <b>🧮 Calcola il piano</b> e <b>✅ Accetta il piano</b>: l'app sposta ogni aiuola e scrive tutto nel diario.",
    fatto: () => S.impianti.some((i) => i.piano) },
  { id: "quiz", ico: "🧠", titolo: "Esperto dell'orto",
    testo: "Rispondi giusto a <b>5 domande</b> del quiz qui sotto: famiglie, buoni vicini, ortaggi esigenti.",
    fatto: () => gioco().quiz.giuste >= 5 },
];

// Segna le missioni appena compiute e festeggia la medaglia.
function controllaMissioni() {
  const g = gioco(), nuove = [];
  for (const m of MISSIONI) {
    if (g.fatte[m.id]) continue;
    let ok = false;
    try { ok = Boolean(m.fatto()); } catch { ok = false; }
    if (ok) { g.fatte[m.id] = aISO(oggi()); nuove.push(m); }
  }
  if (nuove.length) { salva(); festeggia(nuove); }
  aggiornaStrisciaMissioni();
}
function festeggia(nuove) {
  const tutte = MISSIONI.every((m) => gioco().fatte[m.id]);
  let t = el("medaglia-nuova");
  if (!t) { t = document.createElement("div"); t.id = "medaglia-nuova"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.innerHTML = nuove.map((m) => `<div>🏅 Medaglia: <b>${m.ico} ${m.titolo}</b>! +${PUNTI_MISSIONE} punti</div>`).join("")
    + (tutte ? `<div>🏆 Tutte le missioni: sei un <b>ortolano esperto</b>!</div>` : "");
  t.classList.add("visibile");
  clearTimeout(festeggia.t);
  festeggia.t = setTimeout(() => t.classList.remove("visibile"), 4000);
}
function aggiornaStrisciaMissioni() {
  const s = el("striscia-prova");
  if (!s) return;
  let b = el("vai-missioni");
  if (!b) {
    b = document.createElement("a");
    b.id = "vai-missioni";
    b.className = "bottone piccolo";
    b.href = "#missioni";
    s.querySelector("span").after(b);
  }
  const n = MISSIONI.filter((m) => gioco().fatte[m.id]).length;
  b.textContent = `🏅 Missioni ${n}/${MISSIONI.length}`;
}

// «Macchina del tempo»: le colture di chi prova (non finite) e le loro note
// tornano indietro di n giorni, come se fossero passati n giorni.
function faiPassareGiorni(n) {
  for (const i of coltureMie().filter((x) => !x.finito)) {
    i.data = aISO(piuGiorni(daISO(i.data), -n));
    for (const e of S.eventi) if (e.impiantoId === i.id) e.data = aISO(piuGiorni(daISO(e.data), -n));
  }
  salva_e_ridisegna();
}

// -----------------------------------------------------------------------------
// Quiz: domande fatte con i dati dell'app (famiglie, buoni vicini, esigenze).
// -----------------------------------------------------------------------------
function aCaso(lista) { return lista[Math.floor(Math.random() * lista.length)]; }
function mescola(lista) { return [...lista].sort(() => Math.random() - 0.5); }
function nuovaDomanda() {
  const ortaggi = ORTAGGI.filter((o) => FAMIGLIE[o.fam] && !PERENNI.has(o.id));
  const tipo = aCaso(["famiglia", "famiglia", "vicino", "esigenza"]);
  if (tipo === "vicino") {
    const o = aCaso(ortaggi.filter((x) => amiciDi(x.id).length));
    const giusta = aCaso(amiciDi(o.id));
    const altri = mescola(ortaggi.filter((x) => x.id !== o.id && !amiciDi(o.id).includes(x.id))).slice(0, 2).map((x) => x.id);
    return { testo: `Quale di questi è un <b>buon vicino</b> di ${icona(o)} ${esc(o.nome.toLowerCase())}?`,
      scelte: mescola([giusta, ...altri]).map((id) => [id, `${icona(PER_ID[id])} ${esc(PER_ID[id].nome)}`]), giusta,
      spiega: `${esc(PER_ID[giusta].nome)} sta bene vicino a ${esc(o.nome.toLowerCase())}.${nemiciDi(o.id).length ? ` Da tenere lontani: ${nemiciDi(o.id).map((id) => esc(PER_ID[id]?.nome.toLowerCase() ?? id)).join(", ")}.` : ""}` };
  }
  if (tipo === "esigenza") {
    const o = aCaso(ortaggi);
    const nomi = { alta: "Tanto (terra ricca, letame o compost)", media: "Un po' (basta un po' di compost)", bassa: "Poco (niente concime fresco)" };
    return { testo: `Quanto concime vuole ${icona(o)} <b>${esc(o.nome.toLowerCase())}</b>?`,
      scelte: Object.entries(nomi), giusta: o.esig, spiega: esc(ESIGENZE[o.esig]) + "." };
  }
  const o = aCaso(ortaggi);
  const altre = mescola(Object.keys(FAMIGLIE).filter((f) => f !== o.fam && ortaggi.some((x) => x.fam === f))).slice(0, 2);
  const esempi = ortaggi.filter((x) => x.fam === o.fam && x.id !== o.id).slice(0, 3).map((x) => x.nome.toLowerCase());
  return { testo: `Di quale <b>famiglia</b> è ${icona(o)} ${esc(o.nome.toLowerCase())}?`,
    scelte: mescola([o.fam, ...altre]).map((f) => [f, esc(FAMIGLIE[f])]), giusta: o.fam,
    spiega: `${esc(o.nome)}: ${esc(FAMIGLIE[o.fam].toLowerCase())}${esempi.length ? `, come ${esc(esempi.join(", "))}` : ""}. Nella stessa aiuola non rimettere la stessa famiglia per ${ANNI_ROTAZIONE} anni.` };
}
function htmlQuiz() {
  const q = gioco().quiz;
  q.d ??= nuovaDomanda();
  const d = q.d;
  const risposta = d.risposta != null;
  return `<section class="carta">
    <h3 style="margin-top:0">🧠 Quiz <span class="tenue piccolo">· ${q.giuste} giuste su ${q.risposte}</span></h3>
    <p>${d.testo}</p>
    <div class="riga-bottoni">${d.scelte.map(([v, t]) => `<button class="${risposta ? (v === d.giusta ? "" : "secondario") : "secondario"}" data-quiz="${esc(v)}" ${risposta ? "disabled" : ""}>${risposta && v === d.giusta ? "✅ " : risposta && v === d.risposta ? "❌ " : ""}${t}</button>`).join("")}</div>
    ${risposta ? `<div class="${d.risposta === d.giusta ? "bene" : "avviso"}">${d.risposta === d.giusta ? "Giusto! " : "Non proprio. "}${d.spiega}</div>
      <div class="riga-bottoni"><button id="quiz-prossima">Prossima domanda ▶</button></div>` : ""}
  </section>`;
}

// -----------------------------------------------------------------------------
// Pagina
// -----------------------------------------------------------------------------
function vistaMissioni() {
  if (!inProva()) {
    return `<h2>🏅 Missioni</h2>
      <p>Le missioni sono un gioco per imparare: si fanno nell'<b>orto didattico</b>, così il tuo orto vero non cambia.</p>
      ${htmlInvitoProva()}`;
  }
  const g = gioco();
  const fatte = MISSIONI.filter((m) => g.fatte[m.id]).length;
  const tutte = fatte === MISSIONI.length;
  const prima = MISSIONI.find((m) => !g.fatte[m.id]);
  return `<h2>🏅 Missioni</h2>
    <section class="carta">
      <div class="medaglie">${MISSIONI.map((m) => `<span class="medaglia${g.fatte[m.id] ? " vinta" : ""}" title="${esc(m.titolo)}">${m.ico}</span>`).join("")}</div>
      <p style="margin:8px 0 0"><b>${fatte} su ${MISSIONI.length}</b> · ${fatte * PUNTI_MISSIONE} punti${tutte ? " · 🏆 <b>Ortolano esperto!</b>" : ""}</p>
      <p class="tenue piccolo" style="margin:4px 0 0">Ogni missione si spunta da sola quando l'hai fatta. Le cose si fanno nelle pagine dell'app: 🌱 Orto, 📅 Calendario… poi torna qui col bottone giallo in alto.</p>
    </section>
    <section class="carta">
      <h3 style="margin-top:0">⏩ La macchina del tempo</h3>
      <p class="tenue piccolo" style="margin:0 0 8px">Le piante crescono in fretta: le tue colture vanno avanti come se fosse passato del tempo. Serve per raccogliere e per vedere tutta la stagione.</p>
      <div class="riga-bottoni"><button class="secondario" data-tempo="14">⏩ 2 settimane</button><button class="secondario" data-tempo="30">⏩ 1 mese</button></div>
    </section>
    ${MISSIONI.map((m) => `<section class="carta missione${g.fatte[m.id] ? " fatta" : ""}${m === prima ? " prossima" : ""}">
      <div style="display:flex;justify-content:space-between;gap:8px"><b>${m.ico} ${m.titolo}</b><span>${g.fatte[m.id] ? "✅ +" + PUNTI_MISSIONE : ""}</span></div>
      <p style="margin:4px 0 0">${m.testo}</p>
    </section>${m.id === "raccolto" && !g.fatte.raccolto ? `<p class="tenue piccolo" style="margin:-4px 4px 12px">Raccolti finora: ${fmtKg(eventiMiei("raccolto").reduce((n, e) => n + (Number(e.kg) || 0), 0))}.</p>` : ""}`).join("")}
    ${htmlQuiz()}`;
}

function collegaMissioni(root) {
  root.querySelectorAll("[data-tempo]").forEach((b) => b.addEventListener("click", () => faiPassareGiorni(Number(b.dataset.tempo))));
  root.querySelectorAll("[data-quiz]").forEach((b) => b.addEventListener("click", () => {
    const q = gioco().quiz;
    if (!q.d || q.d.risposta != null) return;
    q.d.risposta = b.dataset.quiz;
    q.risposte++;
    if (q.d.risposta === q.d.giusta) q.giuste++;
    salva_e_ridisegna();
  }));
  root.querySelector("#quiz-prossima")?.addEventListener("click", () => { gioco().quiz.d = nuovaDomanda(); salva_e_ridisegna(); });
}

// =============================================================================
// Medaglie dell'orto vero (pagina #medaglie, bottone nel Diario): traguardi, non
// compiti. Guardano quello che si fa già (colture, raccolti, diario) e restano
// vinte anche se poi i dati cambiano. Niente punti. S.medaglie = { id: data }.
// =============================================================================
// Colture vere nelle aiuole (non nel semenzaio, non capanni).
function coltureOrto() { return S.impianti.filter((i) => coltivabile(aiuola(i.aiuolaId)) && PER_ID[i.ortaggioId]); }
function perAnno(lista) {
  const out = {};
  for (const x of lista) (out[x.data.slice(0, 4)] ??= []).push(x);
  return out;
}
function kgMassimoAnno() {
  const anni = perAnno(S.eventi.filter((e) => e.tipo === "raccolto" && e.kg));
  return Math.max(0, ...Object.values(anni).map((l) => l.reduce((n, e) => n + (Number(e.kg) || 0), 0)));
}
const MEDAGLIE_ORTO = [
  { id: "prima", ico: "🌱", titolo: "Prima semina", come: "Segna la tua prima coltura in un'aiuola.",
    fatto: () => coltureOrto().length > 0 },
  { id: "varieta", ico: "🌈", titolo: "Orto vario", come: "Coltiva nello stesso anno ortaggi di almeno 5 famiglie diverse: la terra si stanca meno e i parassiti si spargono meno.",
    fatto: () => Object.values(perAnno(coltureOrto())).some((l) => new Set(l.map((i) => PER_ID[i.ortaggioId].fam)).size >= 5) },
  { id: "vicinato", ico: "🤝", titolo: "Buon vicinato", come: "Abbi in orto, tutte insieme, 5 colture con buoni vicini e nessun cattivo vicino.",
    fatto: () => coltureOrto().filter((i) => !i.finito).filter((i) => { const v = avvisiVicini(i.aiuolaId, i.ortaggioId, i.id, i.celle); return v.buoni.length && !v.cattivi.length; }).length >= 5 },
  { id: "rotazione", ico: "🔄", titolo: "Rotazione da maestro", come: "Un anno con almeno 5 colture e nessun avviso di rotazione 🔄.",
    fatto: () => Object.values(perAnno(coltureOrto().filter((i) => !PERENNI.has(i.ortaggioId) && !aiuola(i.aiuolaId).fissa)))
      .some((l) => l.length >= 5 && l.every((i) => !avvisiRotazione(i.aiuolaId, i.ortaggioId, i.data, i.id, i.celle).length)) },
  { id: "kg10", ico: "🧺", titolo: "10 kg di raccolto", come: "Raccogli 10 kg in un anno (segna i kg quando tocchi 🧺 Raccolto).", fatto: () => kgMassimoAnno() >= 10 },
  { id: "kg50", ico: "🥕", titolo: "50 kg di raccolto", come: "Raccogli 50 kg in un anno.", fatto: () => kgMassimoAnno() >= 50 },
  { id: "kg100", ico: "🏆", titolo: "100 kg di raccolto", come: "Raccogli 100 kg in un anno: un orto da campioni.", fatto: () => kgMassimoAnno() >= 100 },
  { id: "diario", ico: "📓", titolo: "Diario fedele", come: "Scrivi nel diario (annaffiature, concimi, raccolti, note) in almeno 6 mesi diversi dello stesso anno.",
    fatto: () => Object.values(perAnno(S.eventi)).some((l) => new Set(l.map((e) => e.data.slice(5, 7))).size >= 6) },
  { id: "semenzaio", ico: "🪴", titolo: "Dal semenzaio all'orto", come: "Trapianta nell'orto 5 colture partite dal tuo semenzaio.",
    fatto: () => S.impianti.filter((i) => i.daSemenzaio && S.impianti.find((x) => x.id === i.daSemenzaio)?.modo !== "acq").length >= 5 },
  { id: "piano", ico: "📋", titolo: "Orto pianificato", come: "Prepara e accetta il piano dell'anno nuovo (🌱 Orto → 📋 Prepara l'orto).",
    fatto: () => S.impianti.some((i) => i.piano) },
  { id: "api", ico: "🐝", titolo: "Amico delle api", come: "Pianta lavanda o rosmarino: i fiori chiamano gli impollinatori.",
    fatto: () => coltureOrto().some((i) => i.ortaggioId === "lavanda" || i.ortaggioId === "rosmarino") },
  { id: "tnt", ico: "🧣", titolo: "Contro il freddo", come: "Usa il tessuto non tessuto o una miniserra per partire prima (🧣 o ⛺ in «Protezione all'inizio»).",
    fatto: () => coltureOrto().some((i) => i.protezione) },
  { id: "cura", ico: "🩺", titolo: "Medico dell'orto", come: "Segna 3 trattamenti contro malattie o parassiti (＋ Nota → 🧴 Trattamento).",
    fatto: () => S.eventi.filter((e) => e.tipo === "trattamento").length >= 3 },
  { id: "copia", ico: "💾", titolo: "Dati al sicuro", come: "Fai una copia dei dati: 📍 Luogo → 📤 Invia copia.",
    fatto: () => Boolean(S.impostazioni.ultimaCopia) },
];

function controllaMedaglie() {
  S.medaglie ??= {};
  const nuove = [];
  for (const m of MEDAGLIE_ORTO) {
    if (S.medaglie[m.id]) continue;
    let ok = false;
    try { ok = Boolean(m.fatto()); } catch { ok = false; }
    if (ok) { S.medaglie[m.id] = aISO(oggi()); nuove.push(m); }
  }
  if (!nuove.length) return;
  salva();
  let t = el("medaglia-nuova");
  if (!t) { t = document.createElement("div"); t.id = "medaglia-nuova"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.innerHTML = nuove.slice(0, 3).map((m) => `<div>🏅 Nuova medaglia: <b>${m.ico} ${m.titolo}</b></div>`).join("")
    + (nuove.length > 3 ? `<div>…${nuove.length === 4 ? "e un'altra: guardala" : `e altre ${nuove.length - 3}: guardale`} nel 📓 Diario.</div>` : "");
  t.classList.add("visibile");
  clearTimeout(controllaMedaglie.t);
  controllaMedaglie.t = setTimeout(() => t.classList.remove("visibile"), 5000);
}
function htmlBottoneMedaglie() {
  if (inProva()) return `<a class="bottone secondario" href="#missioni">🏅 Missioni</a>`;
  controllaMedaglie(); // il numero giusto già in questo disegno
  const n = MEDAGLIE_ORTO.filter((m) => S.medaglie?.[m.id]).length;
  return `<a class="bottone secondario" href="#medaglie">🏅 Medaglie ${n}/${MEDAGLIE_ORTO.length}</a>`;
}
function vistaMedaglie() {
  if (inProva()) return vistaMissioni();
  controllaMedaglie();
  const vinte = S.medaglie || {};
  const n = MEDAGLIE_ORTO.filter((m) => vinte[m.id]).length;
  return `<p><a href="#diario">← Diario</a></p>
    <h2>🏅 Le medaglie del tuo orto</h2>
    <section class="carta">
      <div class="medaglie">${MEDAGLIE_ORTO.map((m) => `<span class="medaglia${vinte[m.id] ? " vinta" : ""}" title="${esc(m.titolo)}">${m.ico}</span>`).join("")}</div>
      <p style="margin:8px 0 0"><b>${n} su ${MEDAGLIE_ORTO.length}</b></p>
      <p class="tenue piccolo" style="margin:4px 0 0">Arrivano da sole, mentre usi l'app come sempre. Una medaglia vinta resta tua.</p>
    </section>
    ${MEDAGLIE_ORTO.map((m) => `<section class="carta missione${vinte[m.id] ? " fatta" : ""}">
      <div style="display:flex;justify-content:space-between;gap:8px"><b>${m.ico} ${m.titolo}</b><span class="tenue piccolo">${vinte[m.id] ? "✅ " + fmt(daISO(vinte[m.id])) + " " + vinte[m.id].slice(0, 4) : ""}</span></div>
      <p style="margin:4px 0 0">${m.come}</p>
    </section>`).join("")}
    <p class="tenue piccolo">Vuoi giocare con le missioni e il quiz? Si fanno nell'orto didattico, in ❓ → 🎓 Entra nell'orto didattico.</p>`;
}

// Dopo ogni disegno: missioni nell'orto di prova, medaglie nell'orto vero.
{
  const disegnaPrima = disegna;
  disegna = function () { disegnaPrima(); if (inProva()) controllaMissioni(); else controllaMedaglie(); };
}
