// =============================================================================
// Orti di più persone sullo stesso telefono (es. il tuo e la copia di quello del
// vicino). Ogni orto ha la sua chiave in localStorage: il primo resta
// "ilmioorto.v1" (i dati di sempre), gli altri "ilmioorto.p.<id>".
// Elenco in localStorage "ilmioorto.profili" = [{ id, nome, chiave }]; l'orto
// aperto in sessionStorage (così all'apertura dell'app, se gli orti sono più di
// uno, si sceglie di nuovo) e l'ultimo usato in localStorage.
// Caricato prima di app.js: CHIAVE in app.js usa profiloAttivo().
// =============================================================================

const CHIAVE_PROFILI = "ilmioorto.profili";
const SESSIONE_PROFILO = "ilmioorto.profilo";
const ULTIMO_PROFILO = "ilmioorto.ultimoProfilo";
const PROFILO_PRINCIPALE = { id: "principale", nome: "", chiave: "ilmioorto.v1" };

function leggiLocale(k) { try { return localStorage.getItem(k); } catch { return null; } }
function leggiSessioneProfilo() { try { return sessionStorage.getItem(SESSIONE_PROFILO); } catch { return null; } }
function profili() {
  try {
    const l = JSON.parse(leggiLocale(CHIAVE_PROFILI));
    if (Array.isArray(l) && l.length) return l;
  } catch { /* niente */ }
  return [{ ...PROFILO_PRINCIPALE }];
}
function salvaProfili(l) {
  try { localStorage.setItem(CHIAVE_PROFILI, JSON.stringify(l)); return true; } catch (e) { alert("Non riesco a salvare l'elenco degli orti: " + e.message); return false; }
}
function profiloAttivo() {
  const l = profili(), id = leggiSessioneProfilo() || leggiLocale(ULTIMO_PROFILO);
  return l.find((p) => p.id === id) || l[0];
}
function nomeProfilo(p) { return p.nome || (p.id === "principale" ? "Il mio orto" : "Senza nome"); }

// Apre l'orto di una persona (ricaricando l'app se è un altro).
function apriProfilo(id) {
  const prima = profiloAttivo().id;
  try { sessionStorage.setItem(SESSIONE_PROFILO, id); localStorage.setItem(ULTIMO_PROFILO, id); } catch { /* niente */ }
  if (id === prima) { chiudiFinestra(); return; }
  location.hash = "#oggi";
  location.reload();
}

// All'apertura: se gli orti sono più di uno, «Di chi è l'orto?».
function chiediProfilo() {
  const l = profili();
  if (IN_PROVA || l.length < 2 || leggiSessioneProfilo()) return;
  apriFinestra(`<h2>👤 Di chi è l'orto?</h2>
    <p class="tenue piccolo">Su questo telefono ci sono gli orti di più persone: scegli quale aprire. Gli orti sono separati: quello che fai in uno non tocca gli altri.</p>
    <div class="riga-bottoni" style="flex-direction:column;align-items:stretch">
      ${l.map((p) => `<button class="${p.id === profiloAttivo().id ? "" : "secondario"}" data-profilo="${esc(p.id)}">👤 ${esc(nomeProfilo(p))}</button>`).join("")}
    </div>`, (f) => {
    f.querySelectorAll("[data-profilo]").forEach((b) => b.addEventListener("click", () => apriProfilo(b.dataset.profilo)));
    // Chiusa senza scegliere: resta aperto l'ultimo orto usato.
    f.addEventListener("close", () => { try { sessionStorage.setItem(SESSIONE_PROFILO, profiloAttivo().id); } catch { /* niente */ } }, { once: true });
  });
}

// --- Aggiungere, rinominare, eliminare ------------------------------------------
function campoNomeMio() {
  const io = profili().find((p) => p.id === "principale");
  return io && !io.nome ? [{ id: "mio", etichetta: "E il tuo nome? (per distinguere il tuo orto da quello dell'altra persona)", valore: "", richiesto: true }] : [];
}
function aggiungiProfilo(nome, dati, mio) {
  const l = profili();
  if (mio) { const io = l.find((p) => p.id === "principale"); if (io) io.nome = mio; }
  const id = "p" + Date.now().toString(36);
  const p = { id, nome, chiave: "ilmioorto.p." + id };
  try { localStorage.setItem(p.chiave, JSON.stringify(dati)); } catch (e) { alert("Non c'è abbastanza spazio sul telefono per un altro orto: " + e.message); return null; }
  l.push(p);
  return salvaProfili(l) ? p : null;
}
function dopoAggiunta(p) {
  if (!p) return;
  if (confirm(`Fatto: c'è l'orto di ${nomeProfilo(p)}. Vuoi aprirlo adesso?\n(Il tuo resta com'è: lo riapri da 📍 Luogo o quando riapri l'app.)`)) apriProfilo(p.id);
  else disegna();
}
function contaOrto(s) {
  const n = s.aiuole.filter((a) => !a.semenzaio).length, c = (s.impianti || []).length;
  return `${n} ${n === 1 ? "aiuola" : "aiuole"}, ${c} ${c === 1 ? "coltura" : "colture"}`;
}
// Legge una copia dell'orto (testo del file); null se non è valida.
function leggiCopiaOrto(testo) {
  try {
    const s = JSON.parse(testo);
    if (!s.impostazioni || !Array.isArray(s.aiuole)) throw new Error("non è una copia di questa app");
    return s;
  } catch (e) { alert("File non valido: " + e.message); return null; }
}
// La copia ricevuta da un'altra persona (📤 Invia copia) diventa un orto in più.
function aggiungiOrtoDaFile(file) {
  const r = new FileReader();
  r.onload = () => { const s = leggiCopiaOrto(r.result); if (s) aggiungiOrtoDaDati(s); };
  r.readAsText(file);
}
function aggiungiOrtoDaDati(s) {
  {
    modulo({
      titolo: "📥 L'orto di un'altra persona",
      campi: [
        { id: "nome", etichetta: "Di chi è questo orto?", valore: s.impostazioni.proprietario || "", richiesto: true },
        ...campoNomeMio(),
      ],
      extra: `<p class="tenue piccolo">${contaOrto(s)}. Diventa un orto in più su questo telefono: il tuo non cambia.</p>`,
      testoSalva: "Aggiungi",
      salva: (v) => { setTimeout(() => dopoAggiunta(aggiungiProfilo(v.nome, s, v.mio)), 0); },
    });
  }
}

// Copia arrivata da «Condividi → Il mio orto» (WhatsApp, email…): il service
// worker l'ha messa nella cache e ha aperto l'app su #ricevuto.
async function riceviCopiaCondivisa() {
  if (location.hash !== "#ricevuto") return;
  history.replaceState(null, "", "#luogo");
  disegna();
  let testo = null;
  try {
    const cache = await caches.open("orto-condivisi");
    const r = await cache.match("ricevuto");
    if (r) { testo = await r.text(); await cache.delete("ricevuto"); }
  } catch { /* niente */ }
  if (!testo) { alert("Non ho trovato il file condiviso. Riprova, oppure in 📍 Luogo scegli il file a mano."); return; }
  if (IN_PROVA) { alert("Sei nell'orto di prova: esci dalla prova e condividi di nuovo il file."); return; }
  const s = leggiCopiaOrto(testo);
  if (!s) return;
  const att = profiloAttivo();
  const di = s.impostazioni.proprietario ? `di <b>${esc(s.impostazioni.proprietario)}</b>` : "";
  apriFinestra(`<h2>📥 Hai ricevuto un orto</h2>
    <p>Un orto ${di}: ${contaOrto(s)}. Cosa vuoi fare?</p>
    <div class="riga-bottoni" style="flex-direction:column;align-items:stretch">
      <button id="ric-altro">👥 È l'orto di un'altra persona: aggiungilo (il mio non cambia)</button>
      <button class="secondario" id="ric-mio">🔄 È il mio orto: sostituisci quello aperto (${esc(nomeProfilo(att))})</button>
      <button class="secondario" data-chiudi>Annulla</button>
    </div>`, (f) => {
    f.querySelector("#ric-altro").addEventListener("click", () => { chiudiFinestra(); aggiungiOrtoDaDati(s); });
    f.querySelector("#ric-mio").addEventListener("click", () => {
      if (!confirm(`Sostituire tutto l'orto «${nomeProfilo(att)}» con quello ricevuto? Aiuole, colture e diario di adesso si perdono.`)) return;
      localStorage.setItem(CHIAVE, JSON.stringify(s));
      S = carica();
      chiudiFinestra();
      disegna();
      alert("Fatto: l'orto è stato sostituito.");
    });
  });
}
function nuovoOrtoVuoto() {
  modulo({
    titolo: "＋ Un orto nuovo per un'altra persona",
    campi: [{ id: "nome", etichetta: "Di chi è?", valore: "", richiesto: true }, ...campoNomeMio()],
    extra: `<p class="tenue piccolo">Parte vuoto, con il luogo e il clima di questo orto. Gli orti sono separati.</p>`,
    testoSalva: "Crea",
    salva: (v) => {
      const s = statoVuoto();
      Object.assign(s.impostazioni, { ultimaBrinata: S.impostazioni.ultimaBrinata, primaBrinata: S.impostazioni.primaBrinata,
        lat: S.impostazioni.lat ?? null, lon: S.impostazioni.lon ?? null, altitudine: S.impostazioni.altitudine ?? null, luogo: S.impostazioni.luogo || "" });
      s.clima = S.clima || null;
      setTimeout(() => dopoAggiunta(aggiungiProfilo(v.nome, s, v.mio)), 0);
    },
  });
}
function rinominaProfilo(id) {
  const l = profili(), p = l.find((x) => x.id === id);
  if (!p) return;
  modulo({
    titolo: "✏️ Nome dell'orto",
    campi: [{ id: "nome", etichetta: "Di chi è?", valore: p.nome, richiesto: true }],
    salva: (v) => { p.nome = v.nome; salvaProfili(l); },
  });
}
function eliminaProfilo(id) {
  const l = profili(), p = l.find((x) => x.id === id);
  if (!p || p.id === "principale" || p.id === profiloAttivo().id) return;
  if (!confirm(`Eliminare da questo telefono l'orto di ${nomeProfilo(p)}? Si cancellano aiuole, colture e diario di quell'orto (gli altri non cambiano).`)) return;
  try { localStorage.removeItem(p.chiave); } catch { /* niente */ }
  salvaProfili(l.filter((x) => x.id !== id));
  disegna();
}

// Riquadro in 📍 Luogo.
function htmlProfili() {
  if (IN_PROVA) return "";
  const l = profili(), att = profiloAttivo();
  return `<section class="carta">
    <h3 style="margin-top:0">👥 Gli orti su questo telefono</h3>
    ${l.length > 1 ? `<ul class="elenco">${l.map((p) => `<li><div class="riga" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <span>👤 <b>${esc(nomeProfilo(p))}</b>${p.id === att.id ? ` <span class="tenue piccolo">· aperto adesso</span>` : ""}</span>
        <span style="white-space:nowrap">${p.id === att.id ? "" : `<button class="piccolo" data-apri-profilo="${esc(p.id)}">Apri</button>`}
          <button class="piccolo secondario" data-rinomina-profilo="${esc(p.id)}" title="Cambia nome">✏️</button>
          ${p.id === "principale" || p.id === att.id ? "" : `<button class="piccolo secondario" data-elimina-profilo="${esc(p.id)}" title="Elimina">🗑️</button>`}</span>
      </div></li>`).join("")}</ul>`
      : `<p class="tenue piccolo" style="margin-top:0">C'è solo il tuo orto${att.nome ? ` (${esc(att.nome)})` : ""}. Vuoi far vedere il tuo orto a un vicino? Fai «📤 Invia copia» qui sopra e mandagliela: lui la apre qui con «📥 Aggiungi l'orto di un'altra persona», e il suo orto non cambia.</p>`}
    <div class="riga-bottoni">
      <button class="secondario" id="aggiungi-profilo">📥 Aggiungi l'orto di un'altra persona</button>
      <button class="secondario" id="nuovo-profilo">＋ Orto nuovo vuoto</button>
      ${l.length < 2 ? `<button class="secondario" data-rinomina-profilo="${esc(att.id)}">✏️ Il tuo nome</button>` : ""}
      <input type="file" id="file-profilo" accept="application/json,text/plain,.json,.txt" hidden>
    </div>
    <p class="tenue piccolo">Ogni orto ha aiuole, colture, diario e medaglie suoi. Quando gli orti sono più di uno, all'apertura l'app chiede di chi è l'orto.</p>
  </section>`;
}
function collegaProfili(root) {
  root.querySelectorAll("[data-apri-profilo]").forEach((b) => b.addEventListener("click", () => apriProfilo(b.dataset.apriProfilo)));
  root.querySelectorAll("[data-rinomina-profilo]").forEach((b) => b.addEventListener("click", () => rinominaProfilo(b.dataset.rinominaProfilo)));
  root.querySelectorAll("[data-elimina-profilo]").forEach((b) => b.addEventListener("click", () => eliminaProfilo(b.dataset.eliminaProfilo)));
  root.querySelector("#aggiungi-profilo")?.addEventListener("click", () => el("file-profilo").click());
  root.querySelector("#nuovo-profilo")?.addEventListener("click", nuovoOrtoVuoto);
  el("file-profilo")?.addEventListener("change", (e) => { if (e.target.files[0]) aggiungiOrtoDaFile(e.target.files[0]); e.target.value = ""; });
}

document.addEventListener("DOMContentLoaded", () => setTimeout(() => {
  // File condiviso: prima quello (la scelta dell'orto resta all'ultimo usato).
  if (location.hash === "#ricevuto") {
    try { sessionStorage.setItem(SESSIONE_PROFILO, profiloAttivo().id); } catch { /* niente */ }
    riceviCopiaCondivisa();
  } else chiediProfilo();
}, 0));
