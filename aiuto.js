// =============================================================================
// Aiuto: mini guida all'app (pagina #aiuto, bottone ❓ in alto).
// Frasi corte, parole semplici, le stesse icone dei bottoni dell'app.
// DA TENERE AGGIORNATA: ogni volta che l'app cambia in qualcosa che si vede
// (bottoni, schede, funzioni nuove), cambiare anche qui.
// =============================================================================

const GUIDA = [
  { ico: "🧭", titolo: "Le 5 schede in basso", righe: [
    "☀️ <b>Oggi</b>: cosa fare adesso, il meteo e le cose in programma.",
    "📅 <b>Calendario</b>: quando seminare, trapiantare e raccogliere ogni ortaggio.",
    "🌱 <b>Orto</b>: le tue aiuole e cosa c'è dentro.",
    "📓 <b>Diario</b>: tutto quello che hai fatto, anno per anno.",
    "📍 <b>Luogo</b>: dov'è l'orto, il clima e la copia dei dati.",
  ] },
  { ico: "🟫", titolo: "Fare le aiuole", righe: [
    "Vai in 🌱 Orto e tocca <b>＋ Nuova aiuola</b>.",
    "Scrivi il numero (da sinistra a destra) e le misure in metri.",
    "Vuoi dividerla in quadretti? Metti righe e colonne: è la <b>scacchiera</b>.",
    "Aiuole su più file, una davanti all'altra? In ✏️ Modifica aiuola scegli <b>In quale fila sta</b> (dietro = verso il fondo, davanti = verso di te) e scrivi a quanti metri dal bordo sinistro comincia.",
    "Qualche quadretto non c'è davvero (vasi a piramide)? Sotto la scacchiera tocca <b>✕ Caselle che non esistono</b>.",
    "Ogni quadretto è un vaso? In ✏️ Modifica aiuola in <b>🏺 Le caselle sono vasi?</b> scegli tondi, quadrati o rettangolari e scrivi le misure di un vaso: sulla mappa vedi i vasi a piramide, e la storia dell'aiuola resta.",
    "Un'aiuola dove metti sempre la stessa pianta (la zucca sul tetto)? In ✏️ Modifica aiuola scegli <b>Sempre lo stesso ortaggio</b> 📌.",
    "Una serra? In ✏️ Modifica aiuola scegli <b>In serra o tunnel</b> 🏠 e il lato della <b>🚪 Porta</b>: sulla mappa è il tratto marrone.",
    "Sposti le serre da un anno all'altro? Spunta <b>🔁 Serra spostabile</b> in tutte le aiuole dove possono andare, anche in quelle all'aperto.",
    "Vasi sparsi in giardino (peperoncini, basilico)? Tocca <b>＋ Nuova aiuola</b> e in <b>Che cos'è</b> scegli 🏺 <b>vaso tondo</b> (scrivi il diametro), <b>vaso quadrato</b> (scrivi il lato) o <b>vaso rettangolare</b>. Mettili tutti nella zona «Vasi». Tanti vasi uguali? <b>＋ Più aiuole insieme</b> e in <b>Che cosa</b> scegli i vasi.",
    "Il capanno degli attrezzi? Tocca <b>＋ Nuova aiuola</b> e in <b>Che cos'è</b> scegli 🧰 <b>capanno</b>: si vede sulla mappa ma non si coltiva. Se è una serra usata per gli attrezzi, scegli anche <b>In serra o tunnel</b> e la porta.",
  ] },
  { ico: "🔢", titolo: "Cambiare i numeri delle aiuole", righe: [
    "Dai un numero già usato e lascia la spunta <b>Fai posto</b>: le altre aiuole si spostano di uno.",
    "Per rifare 1, 2, 3…: tocca <b>⚙️</b> sotto il disegno dell'orto e spunta <b>Rinumera</b>. Si numera come si legge: dalla fila in fondo a quella davanti, ognuna da sinistra a destra.",
    "Non si perde niente: ogni aiuola si porta dietro la sua storia.",
  ] },
  { ico: "🌱", titolo: "Seminare e piantare", righe: [
    "Apri l'aiuola e tocca <b>＋ Nuova coltura</b>, oppure tocca un quadretto vuoto della scacchiera.",
    "Scegli l'ortaggio: l'app ti dice la <b>prima data utile</b>.",
    "Copri con il <b>tessuto non tessuto</b>? Scegli 🧣 in <b>Protezione all'inizio</b>: puoi seminare circa 2 settimane prima.",
    "Semi in casa o in vasetti? Mettili nel 🪴 <b>Semenzaio</b>. Quando sono grandi tocca <b>Trapianta</b>.",
    "Piantine comprate al vivaio? Nel 🪴 Semenzaio tocca <b>🛒 Piantine comprate</b>: vasetti, piantine per vasetto, prezzo, marca, negozio. Poi <b>Trapianta</b>. Nel 📓 Diario vedi quante ne hai comprate e quanto hai speso.",
    "⚠️ in rosso = vicini che non vanno d'accordo. 🔄 = la stessa famiglia c'era da poco. 🤝 = buoni vicini.",
  ] },
  { ico: "🧺", titolo: "Raccogliere e scrivere nel diario", righe: [
    "Tocca <b>🧺 Raccolto</b> e scrivi quanti kg: a fine anno vedi cosa ha reso di più.",
    "<b>＋ Nota</b> o <b>＋ Annotazione</b> per annaffiature, concime, trattamenti.",
    "Una data futura diventa un promemoria 🔔 che vedi in ☀️ Oggi.",
    "Quando la pianta è finita tocca <b>Fine coltura</b>: resta nella storia dell'aiuola.",
    "Nel 📓 Diario c'è <b>🏅 Medaglie</b>: arrivano da sole mentre usi l'app (primo raccolto da 10 kg, un anno senza avvisi di rotazione, la copia dei dati…).",
    "Per correggere o cancellare qualcosa tocca <b>✏️</b> (anche nel diario e negli anni passati).",
  ] },
  { ico: "📋", titolo: "Preparare l'orto dell'anno nuovo", righe: [
    "In 🌱 Orto tocca <b>📋 Prepara l'orto</b>.",
    "L'app parte da quello che hai coltivato l'anno scorso: togli ✕, cambia i m², aggiungi.",
    "Hai serre spostabili 🔁? Prima di calcolare spunta dove vanno quest'anno: l'app propone dove l'anno scorso c'era terra nuda.",
    "Tocca <b>🧮 Calcola il piano</b>: ogni aiuola passa all'altra con le sue piante e i suoi quadretti, così la terra cambia ortaggio ogni anno.",
    "Verde = va bene. Arancio = da guardare. Rosso = problema. Con ✏️ cambi aiuola o date.",
    "Tocca <b>✅ Accetta il piano</b>: semine, trapianti e concimi vanno nel 📓 Diario. Non ti va bene? <b>🗑️ Annulla il piano</b>.",
  ] },
  { ico: "🩺", titolo: "Una pianta sta male", righe: [
    "In 🌱 Orto tocca <b>🩺 Malattie e parassiti</b>, oppure <b>🩺 Problema?</b> sotto la pianta.",
    "Tocca i segni che vedi (macchie, buchi, insetti…) e leggi cosa può essere e cosa fare.",
    "Oppure fai una foto: <b>🎥 Inquadra dal vivo</b>, <b>📷 Scatta</b> o <b>🖼️ Dalla galleria</b>. Avvicinati alla foglia malata.",
    "Ha indovinato? 👍. Ha sbagliato? 👎 e scegli quella giusta: così l'app impara. Poi <b>📤 Invia le foto</b>.",
  ] },
  { ico: "📍", titolo: "La prima volta", righe: [
    "Vuoi imparare senza paura di sbagliare? Qui sopra tocca <b>🎓 Prova con un orto di esempio</b>: un orto finto con una guida passo passo. Per tornare al tuo tocca <b>Esci dalla prova</b>.",
    "Nell'orto di prova ci sono anche le <b>🏅 Missioni</b> (bottone giallo in alto): dieci sfide con le medaglie, un quiz e ⏩ la macchina del tempo. È un gioco per imparare, anche a scuola: il tuo orto vero non cambia.",
    "Vai nell'orto e in 📍 Luogo tocca <b>📍 Prendi la posizione col GPS</b>: l'app sistema le date per il tuo clima.",
    "Tocca un ortaggio e poi <b>☆</b> per segnarlo tra i tuoi ★: in ☀️ Oggi puoi vedere solo quelli.",
  ] },
  { ico: "💾", titolo: "Non perdere i dati", righe: [
    "I dati stanno solo su questo telefono.",
    "Ogni tanto, in 📍 Luogo, tocca <b>📤 Invia copia</b> e mandala a te stesso (WhatsApp o email).",
    "Telefono nuovo? <b>📂 Ripristina da file</b> e scegli la copia.",
    "Compare <b>🔄 C'è una versione nuova</b>? Toccalo: l'app si aggiorna.",
  ] },
  { ico: "👥", titolo: "Più persone, più orti", righe: [
    "Vuoi far vedere il tuo orto a un vicino? Tocca <b>📤 Invia copia</b> in 📍 Luogo e mandagliela su WhatsApp.",
    "Lui, nel suo telefono, in 📍 Luogo tocca <b>📥 Aggiungi l'orto di un'altra persona</b> e sceglie il file: il tuo orto si aggiunge al suo, il suo non cambia.",
    "Quando sul telefono ci sono più orti, all'apertura l'app chiede <b>Di chi è l'orto?</b>. In alto vedi 👤 e il nome.",
    "In 📍 Luogo puoi aprire un altro orto, cambiargli nome ✏️ o eliminare una copia che non serve più 🗑️.",
  ] },
];

function vistaAiuto() {
  return `<h2>❓ Come si usa</h2>
    ${htmlInvitoProva()}
    <p class="tenue">Una pagina per ogni cosa. Tocca un titolo per aprirlo.</p>
    ${GUIDA.map((g, k) => `<details class="carta guida"${k === 0 ? " open" : ""}>
      <summary><span class="guida-ico">${g.ico}</span> ${g.titolo}</summary>
      <ol>${g.righe.map((r) => `<li>${r}</li>`).join("")}</ol>
    </details>`).join("")}
    <p class="tenue piccolo">Ti sei perso? Tocca 🌱 Orto in basso e riparti da lì. Niente si rompe: quasi tutto si può correggere con ✏️.</p>`;
}
