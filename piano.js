// =============================================================================
// Piano dell'orto per la stagione nuova (#piano, dalla scheda Orto).
//
// 1. Parte dalle colture dell'anno scorso: stesso spazio, stesse date spostate
//    di un anno (e rimesse nel periodo giusto). Si possono togliere, aggiungere
//    o cambiare. Le perenni (fragole, asparagi, aromatiche) restano dove sono.
// 2. Le mette nelle aiuole con un punteggio: rotazione (niente stessa famiglia
//    negli ultimi 2 anni), successione per esigenza (dopo le leguminose gli
//    ortaggi esigenti), buoni e cattivi vicini, serra, aiuole di misura simile
//    a quella dell'anno scorso, posto libero nel tempo (le colture che passano
//    l'inverno occupano il posto finché non si raccolgono).
// 3. Nelle aiuole con la scacchiera sceglie le caselle a blocchi, lontano da
//    dove c'era la stessa famiglia e dai cattivi vicini.
// 4. «Accetta» crea le colture in programma (e le semine in semenzaio, con
//    aiuola e caselle già pronte per «Trapianta») e una concimazione per
//    aiuola nel diario, tutte segnate con piano: <anno>. «Annulla il piano»
//    toglie quelle non ancora fatte.
// La bozza sta in S.piano finché non si accetta.
// =============================================================================

const PERENNI = new Set(["fragola", "asparago", "carciofo", "rosmarino", "salvia", "rafano", "menta", "timo",
  "origano", "melissa", "erbacipollina", "dragoncello", "alloro", "lavanda"]);
// Ortaggi che producono a lungo: restano fino alla fine del periodo di raccolta.
const RACCOLTA_LUNGA = new Set(["fagiolino", "fagiolo", "bietola", "porro", "prezzemolo", "basilico", "cavolonero",
  "sedano", "peperoncino", "radicchio", "cicoria"]);
const GIORNI_RACCOLTA = 30; // gli altri: un mese di raccolta
const RIPOSO_CONCIME = 21; // concimare 3 settimane prima di piantare

// Da settembre si prepara l'anno dopo.
function annoPiano() {
  const o = oggi();
  return S.piano?.anno ?? (o.getMonth() >= 8 ? o.getFullYear() + 1 : o.getFullYear());
}
function aiuoleVere() { return aiuoleOrdinate().filter((a) => !a.semenzaio); }
function areaMediana() {
  const note = S.aiuole.filter((x) => !x.semenzaio && x.larghezza && x.lunghezza).map((x) => x.larghezza * x.lunghezza).sort((p, q) => p - q);
  return note.length ? note[Math.floor(note.length / 2)] : 1;
}
function areaAiuola(a) { return a?.larghezza && a?.lunghezza ? a.larghezza * a.lunghezza : areaMediana(); }
function celleTotali(a) { return Math.max(1, tutteLeCelle(a).length); }
function tutteLeCelle(a) {
  const g = grigliaAiuola(a), out = [], via = celleMancanti(a);
  for (let r = 0; r < g.righe; r++) for (let c = 0; c < g.colonne; c++) if (!via.has(nomeCella(r, c))) out.push(nomeCella(r, c));
  return out;
}
// Parte dell'aiuola occupata da una coltura (1 = tutta).
function frazione(i, a) {
  if (!haGriglia(a) || !i.celle?.length) return 1;
  return Math.min(1, celleValide(a, i.celle).length / celleTotali(a));
}
function spostaAnni(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y + n, m - 1, d, 12);
}
function fmtArea(m2) { return `${fmtM(Math.round(m2 * 10) / 10 || 0.1)} m²`; }

// Fine stimata dell'occupazione dell'aiuola, partendo dalla semina o dal trapianto.
function fineStimata(o, inizio) {
  const primo = inStagioneDiRaccolta(o, piuGiorni(inizio, o.gg || 60));
  const w = finestreTra(o, "rac", primo, primo).sort((x, y) => y.fine - x.fine)[0];
  const lunga = RACCOLTA_LUNGA.has(o.id) || ["solanacee", "cucurbitacee"].includes(o.fam);
  let fine = w ? (lunga ? w.fine : new Date(Math.min(w.fine, piuGiorni(primo, GIORNI_RACCOLTA)))) : piuGiorni(primo, GIORNI_RACCOLTA);
  if (giorniTra(inizio, fine) > 330) fine = piuGiorni(inizio, 330);
  return fine;
}
function fineImpianto(i) {
  if (PERENNI.has(i.ortaggioId)) return new Date(9999, 0, 1);
  if (i.dataFine) return daISO(i.dataFine);
  const o = PER_ID[i.ortaggioId];
  return o ? fineStimata(o, daISO(i.data)) : piuGiorni(daISO(i.data), 90);
}

// Data dentro il periodo consigliato (con il margine della serra): se è fuori,
// la più vicina dentro.
function nelPeriodo(o, modo, d, margine) {
  const fin = finestreTra(o, modo, piuGiorni(d, -200), piuGiorni(d, 200))
    .map((f) => ({ inizio: piuGiorni(f.inizio, -margine), fine: piuGiorni(f.fine, margine) }));
  if (!fin.length || fin.some((f) => f.inizio <= d && d <= f.fine)) return d;
  let meglio = d, dist = Infinity;
  for (const f of fin) {
    const x = d < f.inizio ? f.inizio : f.fine;
    const dd = Math.abs(giorniTra(d, x));
    if (dd < dist) { dist = dd; meglio = x; }
  }
  return meglio;
}

// -----------------------------------------------------------------------------
// 1. Elenco di partenza: le colture dell'anno scorso
// -----------------------------------------------------------------------------
function vociAnnoScorso(anno) {
  const prima = String(anno - 1);
  const voci = [];
  for (const i of S.impianti) {
    const a = aiuola(i.aiuolaId), o = PER_ID[i.ortaggioId];
    if (!a || a.semenzaio || !o || !i.data.startsWith(prima) || PERENNI.has(o.id) || i.piano === anno) continue;
    const serra = a.copertura === "serra", margine = serra ? ANTICIPO_SERRA : 0;
    const modo = i.modo === "tra" ? "tra" : "dir";
    const inizio = nelPeriodo(o, modo, spostaAnni(i.data, 1), margine);
    const origine = i.daSemenzaio && S.impianti.find((x) => x.id === i.daSemenzaio);
    let semenzaio = null;
    if (origine) semenzaio = aISO(nelPeriodo(o, "sem", spostaAnni(origine.data, 1), 0));
    // Durata vera dell'anno scorso, se la coltura è stata chiusa.
    let fine = fineStimata(o, inizio);
    if (i.dataFine && i.esito !== "trapiantato") {
      const giorni = giorniTra(daISO(i.data), daISO(i.dataFine));
      if (giorni > 20 && giorni < 360) fine = piuGiorni(inizio, giorni);
    }
    const fr = frazione(i, a);
    voci.push({
      k: nuovoId(), ortaggioId: o.id, area: Math.round(fr * areaAiuola(a) * 100) / 100,
      inizio: aISO(inizio), fine: aISO(fine), modo, semenzaio, serra,
      origine: a.id, frazioneOrigine: fr, varieta: i.varieta || "", quantita: i.quantita || "",
      // Caselle dell'anno scorso: nell'aiuola nuova si riprende la stessa disposizione.
      ...(haGriglia(a) && i.celle?.length ? { celleOrigine: celleValide(a, i.celle), grigliaOrigine: grigliaAiuola(a) } : {}),
    });
  }
  return voci.sort((x, y) => x.inizio.localeCompare(y.inizio) || PER_ID[x.ortaggioId].nome.localeCompare(PER_ID[y.ortaggioId].nome, "it"));
}

function voceNuova(ortaggioId, anno) {
  const o = PER_ID[ortaggioId];
  const modo = modoPredefinito(ortaggioId, null) === "tra" ? "tra" : "dir";
  const w = finestreAnno(o, modo, anno)[0] || finestreAnno(o, modo === "tra" ? "dir" : "tra", anno)[0];
  const inizio = w ? w.inizio : new Date(anno, 3, 15, 12);
  const semenzaio = modo === "tra" && o.sem.length ? aISO(piuGiorni(inizio, -(o.semTrap || 6) * 7)) : null;
  return {
    k: nuovoId(), ortaggioId, area: 1, inizio: aISO(inizio), fine: aISO(fineStimata(o, inizio)), modo, semenzaio,
    serra: false, origine: "", frazioneOrigine: 0, varieta: "", quantita: "",
  };
}

function nuovaBozza() {
  const anno = annoPiano();
  const lista = vociAnnoScorso(anno);
  // Aiuole riservate a un ortaggio fisso: la sua voce parte da lì (se l'anno
  // scorso era altrove la sposto, se non c'era la aggiungo).
  for (const a of aiuoleVere()) {
    if (!PER_ID[a.fissa] || lista.some((v) => v.origine === a.id && v.ortaggioId === a.fissa)) continue;
    let v = lista.find((x) => x.ortaggioId === a.fissa && !aiuola(x.origine)?.fissa);
    if (!v) lista.push(v = voceNuova(a.fissa, anno));
    Object.assign(v, { origine: a.id, frazioneOrigine: 1, area: Math.round(areaAiuola(a) * 100) / 100, serra: a.copertura === "serra" });
  }
  S.piano = { anno, creato: aISO(oggi()), lista, proposte: null };
}
// Voci che vanno per forza nella loro aiuola riservata: chiave -> id aiuola.
function vociRiservate(ctx) {
  const out = new Map();
  for (const a of ctx.aiuole) {
    if (!PER_ID[a.fissa]) continue;
    const v = [...ctx.voci.values()].find((x) => x.ortaggioId === a.fissa && x.origine === a.id && !out.has(x.k));
    if (v) out.set(v.k, a.id);
  }
  return out;
}

// -----------------------------------------------------------------------------
// 2. Distribuzione nelle aiuole
// -----------------------------------------------------------------------------
// Storia di ogni aiuola: cosa c'era negli anni prima del piano.
function storiaAiuole(anno) {
  const st = {};
  for (const i of S.impianti) {
    const a = aiuola(i.aiuolaId), o = PER_ID[i.ortaggioId];
    if (!a || a.semenzaio || !o) continue;
    const y = Number(i.data.slice(0, 4));
    if (y >= anno || anno - y > 2) continue;
    (st[a.id] ??= []).push({ distanza: anno - y, anno: y, fam: o.fam, ortaggioId: o.id, esig: o.esig, fr: frazione(i, a), celle: i.celle?.length ? new Set(celleValide(a, i.celle)) : null });
  }
  return st;
}
// Colture che occupano già il posto: quelle che passano l'inverno, le perenni,
// quelle già in programma per l'anno del piano (fuori dal piano).
function occupazioniFisse(anno) {
  const inizioAnno = new Date(anno, 0, 1, 12);
  const fisse = {};
  for (const i of S.impianti) {
    const a = aiuola(i.aiuolaId), o = PER_ID[i.ortaggioId];
    if (!a || a.semenzaio || !o || i.piano === anno) continue;
    const s = daISO(i.data);
    const fine = i.finito ? (i.dataFine ? daISO(i.dataFine) : s) : fineImpianto(i);
    if (fine < inizioAnno || s.getFullYear() > anno) continue;
    (fisse[a.id] ??= []).push({ fisso: true, i, ortaggioId: o.id, s, e: fine, celle: i.celle?.length ? celleValide(a, i.celle) : null, fr: frazione(i, a) });
  }
  return fisse;
}

// Le caselle che la coltura aveva l'anno scorso, riportate sulla scacchiera di
// quest'aiuola (stessi nomi se le scacchiere sono uguali, altrimenti in proporzione).
// variante: 1 = girata sopra/sotto, 2 = destra/sinistra, 3 = entrambe (per la rotazione nella stessa aiuola).
function celleRiportate(v, a, variante = 0) {
  if (!v.celleOrigine?.length || !haGriglia(a)) return null;
  const g = grigliaAiuola(a), go = v.grigliaOrigine;
  const src = new Set(v.celleOrigine), out = [], via = celleMancanti(a);
  for (let r = 0; r < g.righe; r++) for (let c = 0; c < g.colonne; c++) {
    const rr = variante & 1 ? g.righe - 1 - r : r, cc = variante & 2 ? g.colonne - 1 - c : c;
    if (!via.has(nomeCella(r, c)) && src.has(nomeCella(Math.floor(rr * go.righe / g.righe), Math.floor(cc * go.colonne / g.colonne)))) out.push(nomeCella(r, c));
  }
  return out.length ? ordinaCelle(out) : null;
}
function stesseCelle(x, y) { return x?.length === y?.length && x.every((c, k) => c === y[k]); }

// Quanto spazio prende una voce in un'aiuola: caselle (con scacchiera) o m².
function bisogno(v, a) {
  if (haGriglia(a)) return Math.max(1, Math.min(celleTotali(a), Math.round(v.area / (areaAiuola(a) / celleTotali(a)))));
  return v.area;
}
function capienza(a) { return haGriglia(a) ? celleTotali(a) : areaAiuola(a); }
function quantoOccupa(x, a) {
  if (x.fisso) return haGriglia(a) ? (x.celle ? x.celle.length : celleTotali(a)) : x.fr * areaAiuola(a);
  return bisogno(x.v, a);
}
function siSovrappone(x, s, e) { return x.s <= e && x.e >= s; }

// Carico massimo dell'aiuola tra s ed e (contando le colture già messe).
function caricoMassimo(a, s, e, presenti) {
  const dentro = presenti.filter((x) => siSovrappone(x, s, e));
  let massimo = 0;
  for (const t of [s, ...dentro.map((x) => x.s).filter((d) => d > s && d <= e)]) {
    const c = dentro.filter((x) => x.s <= t && x.e >= t).reduce((n, x) => n + quantoOccupa(x, a), 0);
    massimo = Math.max(massimo, c);
  }
  return massimo;
}

// Caselle senza la stessa famiglia negli ultimi 2 anni.
function celleSenzaFamiglia(a, fam, storia, ctx) {
  const chiave = `${a.id}|${fam}`;
  if (ctx.pulite.has(chiave)) return ctx.pulite.get(chiave);
  const n = contaCellePulite(a, fam, storia);
  ctx.pulite.set(chiave, n);
  return n;
}
function contaCellePulite(a, fam, storia) {
  const tutte = tutteLeCelle(a);
  const brutte = new Set();
  for (const h of storia || []) {
    if (h.fam !== fam) continue;
    if (!h.celle) return 0;
    for (const c of h.celle) brutte.add(c);
  }
  return tutte.length - brutte.size;
}

// Punteggio di una voce in un'aiuola, con le ragioni (per la spiegazione).
function punteggio(v, a, presenti, ctx, conMotivi) {
  const o = PER_ID[v.ortaggioId];
  const motivi = [];
  const dice = (tipo, testo) => { if (conMotivi) motivi.push({ tipo, testo }); };
  let p = 0;
  if (a.fissa === o.id) {
    dice("bene", consiglioFissa(a));
    return conMotivi ? { p, motivi } : p;
  }
  const storia = ctx.storia[a.id] || [];
  const anno = ctx.anno;

  // Rotazione
  const stessa = storia.filter((h) => h.fam === o.fam);
  if (stessa.length) {
    if (haGriglia(a) && !v.celle) {
      // Le caselle si scelgono dopo: conta se ce ne sono abbastanza "pulite".
      const serve = bisogno(v, a), pulite = celleSenzaFamiglia(a, o.fam, storia, ctx);
      if (pulite < serve) p -= 60 * (serve - pulite) / serve;
    } else if (haGriglia(a) && v.celle) {
      const peso = { 1: 0, 2: 0 };
      for (const c of v.celle) {
        const d = Math.min(...stessa.filter((h) => !h.celle || h.celle.has(c)).map((h) => h.distanza), 9);
        if (d <= 2) peso[d]++;
      }
      p -= (60 * peso[1] + 30 * peso[2]) / v.celle.length;
      if (peso[1] || peso[2]) {
        const h = stessa.sort((x, y) => x.distanza - y.distanza)[0];
        dice("avviso", `🔄 In ${peso[1] + peso[2]} caselle su ${v.celle.length} nel ${h.anno} c'era ${PER_ID[h.ortaggioId].nome.toLowerCase()}, della stessa famiglia (${FAMIGLIE[o.fam].toLowerCase()}).`);
      }
    } else {
      const d1 = Math.max(0, ...stessa.filter((h) => h.distanza === 1).map((h) => h.fr));
      const d2 = Math.max(0, ...stessa.filter((h) => h.distanza === 2).map((h) => h.fr));
      p -= 60 * d1 + 30 * d2;
      const h = stessa.sort((x, y) => x.distanza - y.distanza)[0];
      dice("avviso", `🔄 Nel ${h.anno} qui c'era ${PER_ID[h.ortaggioId].nome.toLowerCase()}, della stessa famiglia (${FAMIGLIE[o.fam].toLowerCase()}): meglio aspettare ${ANNI_ROTAZIONE} anni.`);
    }
  }
  // Successione: cosa c'era l'anno scorso (parte dell'aiuola)
  const scorso = storia.filter((h) => h.distanza === 1);
  const leg = Math.min(1, scorso.filter((h) => h.fam === "leguminose").reduce((n, h) => n + h.fr, 0));
  const alta = Math.min(1, scorso.filter((h) => h.esig === "alta" && h.fam !== "leguminose").reduce((n, h) => n + h.fr, 0));
  const nomiScorso = (f) => [...new Set(scorso.filter(f).map((h) => PER_ID[h.ortaggioId].nome.toLowerCase()))].join(", ");
  const cera = (f) => `${new Set(scorso.filter(f).map((h) => h.ortaggioId)).size > 1 ? "c'erano" : "c'era"} ${nomiScorso(f)}`;
  if (o.esig === "alta" && o.fam !== "leguminose") {
    p += 12 * leg - 6 * alta;
    if (leg >= 0.3) dice("bene", `🌱 Nel ${anno - 1} qui ${cera((h) => h.fam === "leguminose")}: le leguminose lasciano il terreno ricco di azoto, ottimo per ${o.nome.toLowerCase()}.`);
    else if (alta >= 0.5) dice("avviso", `🟤 Anche l'anno scorso qui c'era un ortaggio esigente (${nomiScorso((h) => h.esig === "alta")}): concima bene.`);
  } else if (o.esig === "bassa" || o.fam === "leguminose") {
    p += 6 * alta;
    if (alta >= 0.5) dice("bene", `🌱 Dopo ${nomiScorso((h) => h.esig === "alta")} (esigenti) va bene un ortaggio che chiede poco.`);
  }
  if (!stessa.length && scorso.length && conMotivi && !motivi.length) {
    dice("bene", `🔄 Rotazione a posto: nel ${anno - 1} qui ${cera(() => true)}.`);
  }

  // Colture che l'anno scorso stavano insieme: meglio che si spostino insieme,
  // così l'aiuola tiene la stessa disposizione.
  if (v.origine && haGriglia(a)) {
    const mie = celleRiportate(v, a);
    for (const x of presenti) {
      if (x.fisso || x.v === v || !siSovrappone(x, daISO(v.inizio), daISO(v.fine))) continue;
      if (x.v.origine === v.origine) p += 6;
      const sue = celleRiportate(x.v, a);
      if (mie && sue && mie.some((c) => sue.includes(c))) p -= 15;
    }
  } else if (v.origine) {
    p += 3 * presenti.filter((x) => !x.fisso && x.v !== v && x.v.origine === v.origine).length;
  }

  // Vicini nello stesso periodo
  const vicini = presenti.filter((x) => x.v !== v && siSovrappone(x, daISO(v.inizio), daISO(v.fine))
    && (!x.celle || !v.celle || confinanti(v.celle, x.celle)));
  const amici = amiciDi(o.id), nemici = nemiciDi(o.id);
  const buoni = [...new Set(vicini.map((x) => x.ortaggioId).filter((id) => amici.includes(id)))];
  const cattivi = [...new Set(vicini.map((x) => x.ortaggioId).filter((id) => nemici.includes(id)))];
  p += 4 * buoni.length - (haGriglia(a) && !v.celle ? 20 : 40) * cattivi.length;
  if (buoni.length) dice("bene", `🤝 Buoni vicini: ${buoni.map((id) => PER_ID[id].nome.toLowerCase()).join(", ")}.`);
  if (cattivi.length) dice("pericolo", `⚠️ Vicino a ${cattivi.map((id) => PER_ID[id].nome.toLowerCase()).join(", ")}, che non vanno d'accordo con ${o.nome.toLowerCase()}.`);

  // Serra
  const serra = a.copertura === "serra";
  if (v.serra && serra) { p += 20; dice("bene", "🏠 In serra, come l'anno scorso."); }
  else if (v.serra && !serra) { p -= 20; dice("avviso", "🏠 L'anno scorso era in serra, qui è all'aperto."); }
  else if (!v.serra && serra) p -= 15; // la serra a chi ne ha bisogno

  // Aiuola di misura simile a quella dell'anno scorso (se la occupava quasi tutta)
  const orig = aiuola(v.origine);
  if (orig && v.frazioneOrigine >= 0.6) {
    const A = areaAiuola(orig), B = areaAiuola(a);
    const sim = Math.min(A, B) / Math.max(A, B);
    p += 8 * sim;
  }
  return conMotivi ? { p, motivi } : p;
}

function presentiIn(a, ctx, assegna, escludi) {
  const out = [...(ctx.fisse[a.id] || [])];
  for (const [k, x] of assegna) {
    if (x.aiuolaId !== a.id || k === escludi) continue;
    const v = ctx.voci.get(k);
    out.push({ v, ortaggioId: v.ortaggioId, s: daISO(v.inizio), e: daISO(v.fine), celle: x.celle || null });
  }
  return out;
}
function entra(v, a, ctx, assegna) {
  const s = daISO(v.inizio), e = daISO(v.fine);
  return caricoMassimo(a, s, e, presentiIn(a, ctx, assegna, v.k)) + bisogno(v, a) <= capienza(a) * 1.02;
}
function totale(ctx, assegna) {
  let t = 0;
  for (const [k, x] of assegna) {
    const a = aiuola(x.aiuolaId), v = ctx.voci.get(k);
    t += punteggio(conCelle(v, a, x.variante), a, presentiIn(a, ctx, assegna, k), ctx, false);
  }
  return t;
}

function distribuisci(ctx) {
  const aiuole = ctx.aiuole;
  const assegna = new Map(); // k -> { aiuolaId, variante }
  const fuori = [];
  const bloccate = vociRiservate(ctx);
  for (const [k, id] of bloccate) assegna.set(k, { aiuolaId: id });
  const libere = aiuole.filter((a) => !PER_ID[a.fissa]); // le aiuole riservate non si danno ad altri

  // Blocchi: le colture che l'anno scorso stavano nella stessa aiuola si
  // spostano insieme, con la stessa disposizione (eventualmente girata).
  const perOrigine = new Map();
  for (const v of ctx.voci.values()) {
    const o = aiuola(v.origine);
    if (bloccate.has(v.k) || !o || PER_ID[o.fissa]) continue;
    if (!perOrigine.has(o.id)) perOrigine.set(o.id, []);
    perOrigine.get(o.id).push(v);
  }
  const areaBlocco = (b) => b.reduce((n, v) => n + v.area, 0);
  const blocchi = [...perOrigine.values()].sort((x, y) => areaBlocco(y) - areaBlocco(x));
  const togli = (b) => { for (const v of b) assegna.delete(v.k); };
  const metti = (b, a, variante) => { for (const v of b) assegna.set(v.k, { aiuolaId: a.id, variante }); };
  // Migliore variante del blocco nell'aiuola a (null se non entra).
  const prova = (b, a) => {
    let meglio = null;
    for (const variante of haGriglia(a) ? [0, 1, 2, 3] : [0]) {
      metti(b, a, variante);
      if (b.every((v) => entra(v, a, ctx, assegna))) {
        const p = b.reduce((n, v) => n + punteggio(conCelle(v, a, variante), a, presentiIn(a, ctx, assegna, v.k), ctx, false), 0) + (variante ? 0 : 0.5);
        if (!meglio || p > meglio.p) meglio = { p, variante };
      }
      togli(b);
    }
    return meglio;
  };
  const dove = new Map(); // blocco -> aiuola
  const singole = [];
  for (const b of blocchi) {
    let scelta = null;
    for (const a of libere) {
      if ([...dove.values()].includes(a)) continue;
      const r = prova(b, a);
      if (r && (!scelta || r.p > scelta.p)) scelta = { ...r, a };
    }
    if (scelta) { metti(b, scelta.a, scelta.variante); dove.set(b, scelta.a); } else singole.push(...b);
  }
  // Miglioramenti: scambiare due blocchi o spostarne uno in un'aiuola libera.
  const rimetti = (b, a) => { const r = prova(b, a); if (!r) return false; metti(b, a, r.variante); return true; };
  for (let giro = 0; giro < 4; giro++) {
    let meglio = false;
    let base = totale(ctx, assegna);
    const lista = [...dove.keys()];
    for (let x = 0; x < lista.length; x++) {
      for (let y = x + 1; y < lista.length; y++) {
        const bx = lista[x], by = lista[y], ax = dove.get(bx), ay = dove.get(by);
        togli(bx); togli(by);
        if (rimetti(bx, ay) && rimetti(by, ax)) {
          const t = totale(ctx, assegna);
          if (t > base + 0.01) { base = t; dove.set(bx, ay); dove.set(by, ax); meglio = true; continue; }
        }
        togli(bx); togli(by); rimetti(bx, ax); rimetti(by, ay);
      }
    }
    for (const b of lista) {
      const da = dove.get(b);
      for (const a of libere) {
        if ([...dove.values()].includes(a)) continue;
        togli(b);
        if (rimetti(b, a)) {
          const t = totale(ctx, assegna);
          if (t > base + 0.01) { base = t; dove.set(b, a); meglio = true; break; }
          togli(b);
        }
        rimetti(b, da);
      }
    }
    if (!meglio) break;
  }

  // Le altre colture (aggiunte a mano, o blocchi che non entrano da nessuna parte), una per una.
  singole.push(...[...ctx.voci.values()].filter((v) => !bloccate.has(v.k) && !assegna.has(v.k) && !singole.includes(v)));
  singole.sort((x, y) => y.area - x.area || x.inizio.localeCompare(y.inizio));
  for (const v of singole) {
    let meglio = null, pm = -Infinity;
    for (const a of libere) {
      assegna.set(v.k, { aiuolaId: a.id });
      const ok = entra(v, a, ctx, assegna);
      assegna.delete(v.k);
      if (!ok) continue;
      const p = punteggio(v, a, presentiIn(a, ctx, assegna, v.k), ctx, false);
      if (p > pm) { pm = p; meglio = a; }
    }
    if (meglio) assegna.set(v.k, { aiuolaId: meglio.id });
    else fuori.push(v.k);
  }
  for (let giro = 0; giro < 3; giro++) {
    let meglio = false;
    let base = totale(ctx, assegna);
    for (const v of singole) {
      if (!assegna.has(v.k)) continue;
      const da = assegna.get(v.k).aiuolaId;
      for (const a of libere) {
        if (a.id === da) continue;
        assegna.set(v.k, { aiuolaId: a.id });
        if (entra(v, a, ctx, assegna)) {
          const t = totale(ctx, assegna);
          if (t > base + 0.01) { base = t; meglio = true; break; }
        }
        assegna.set(v.k, { aiuolaId: da });
      }
    }
    if (!meglio) break;
  }
  return { assegna, fuori };
}
// La voce con le caselle che avrebbe nell'aiuola a (per il punteggio).
function conCelle(v, a, variante) {
  const c = variante == null ? null : celleRiportate(v, a, variante);
  return c ? { ...v, celle: c } : v;
}

// -----------------------------------------------------------------------------
// 3. Caselle nelle aiuole con la scacchiera
// -----------------------------------------------------------------------------
function piazzaCelle(a, v, ctx, assegna) {
  const g = grigliaAiuola(a), o = PER_ID[v.ortaggioId];
  const serve = bisogno(v, a);
  const s = daISO(v.inizio), e = daISO(v.fine);
  // Contano le colture fisse e quelle che hanno già le loro caselle.
  const altri = presentiIn(a, ctx, assegna, v.k).filter((x) => (x.fisso || x.celle) && siSovrappone(x, s, e));
  const occupate = new Set(), chi = {};
  for (const x of altri) {
    for (const c of x.celle || tutteLeCelle(a)) { occupate.add(c); (chi[c] ??= []).push(x.ortaggioId); }
  }
  for (const c of celleMancanti(a)) occupate.add(c); // caselle che non esistono
  const riportate = celleRiportate(v, a, assegna.get(v.k)?.variante || 0);
  if (riportate && !riportate.some((c) => occupate.has(c))) return riportate;
  // Costo di ogni casella: stessa famiglia negli anni scorsi, cattivi e buoni vicini attorno.
  const storia = (ctx.storia[a.id] || []).filter((h) => h.fam === o.fam);
  const amici = amiciDi(o.id), nemici = nemiciDi(o.id);
  const costo = (c) => {
    let k = 0;
    for (const h of storia) if (!h.celle || h.celle.has(c)) k = Math.max(k, h.distanza === 1 ? 6 : 3);
    const q = cellaRC(c);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      for (const id of chi[nomeCella(q.r + dr, q.c + dc)] || []) {
        if (nemici.includes(id)) k += 4;
        else if (amici.includes(id)) k -= 0.5;
      }
    }
    return k;
  };
  const costi = {};
  for (const c of tutteLeCelle(a)) if (!occupate.has(c)) costi[c] = costo(c);

  // Blocchi rettangolari: file intere, quasi quadrati, strisce corte.
  const larghezze = new Set([g.colonne, Math.ceil(Math.sqrt(serve))]);
  for (let h = 1; h <= Math.min(g.righe, 8); h++) larghezze.add(Math.ceil(serve / h));
  let meglio = null, cm = Infinity;
  for (const w of larghezze) {
    if (w < 1 || w > g.colonne) continue;
    const h = Math.ceil(serve / w);
    if (h > g.righe) continue;
    for (let r0 = 0; r0 + h <= g.righe; r0++) {
      for (let c0 = 0; c0 + w <= g.colonne; c0++) {
        const celle = [];
        let k = 0, ok = true;
        for (let r = r0; r < r0 + h && ok; r++) {
          for (let c = c0; c < c0 + w && celle.length < serve; c++) {
            const n = nomeCella(r, c);
            if (occupate.has(n)) { ok = false; break; }
            celle.push(n);
            k += costi[n];
          }
        }
        if (!ok) continue;
        k += 0.05 * (h + w) + (w === g.colonne ? -0.5 : 0) + 0.002 * (r0 * g.colonne + c0);
        if (k < cm) { cm = k; meglio = celle; }
      }
    }
  }
  if (meglio) return meglio;
  // Nessun blocco intero libero: le caselle libere migliori.
  return ordinaCelle(Object.keys(costi).sort((x, y) => costi[x] - costi[y] || (() => { const p = cellaRC(x), q = cellaRC(y); return p.r - q.r || p.c - q.c; })())
    .slice(0, serve));
}

function contesto(P) {
  return {
    anno: P.anno, aiuole: aiuoleVere(), pulite: new Map(), storia: storiaAiuole(P.anno), fisse: occupazioniFisse(P.anno),
    voci: new Map(P.lista.filter((v) => PER_ID[v.ortaggioId]).map((v) => [v.k, v])),
  };
}
// Mette nelle caselle tutte le voci delle aiuole con scacchiera, in ordine di data.
function piazzaTutte(ctx, assegna, soloAiuola) {
  for (const a of ctx.aiuole) {
    if (!haGriglia(a) || (soloAiuola && a.id !== soloAiuola)) continue;
    const qui = [...assegna.entries()].filter(([, x]) => x.aiuolaId === a.id)
      .map(([k]) => ctx.voci.get(k))
      .sort((x, y) => (celleRiportate(y, a) ? 1 : 0) - (celleRiportate(x, a) ? 1 : 0) || x.inizio.localeCompare(y.inizio) || bisogno(y, a) - bisogno(x, a));
    for (const v of qui) delete assegna.get(v.k).celle;
    for (const v of qui) assegna.get(v.k).celle = piazzaCelle(a, v, ctx, assegna);
  }
}

function calcolaPiano() {
  const P = S.piano;
  const ctx = contesto(P);
  for (const v of ctx.voci.values()) delete v.celle;
  const { assegna, fuori } = distribuisci(ctx);
  piazzaTutte(ctx, assegna);
  P.proposte = Object.fromEntries([...assegna].map(([k, x]) => [k, { aiuolaId: x.aiuolaId, celle: x.celle || [], variante: x.variante || 0 }]));
  P.fuori = fuori;
}

// Assegnazioni della bozza come Map, con le caselle.
function assegnaDaBozza(P) {
  return new Map(Object.entries(P.proposte || {}).filter(([k, x]) => aiuola(x.aiuolaId) && P.lista.some((v) => v.k === k))
    .map(([k, x]) => [k, { aiuolaId: x.aiuolaId, celle: x.celle?.length ? x.celle : null, variante: x.variante || 0 }]));
}

// -----------------------------------------------------------------------------
// Vista
// -----------------------------------------------------------------------------
function testoDate(v) {
  const d = fmt(daISO(v.inizio));
  const q = v.modo === "tra" ? `trapianto ~${d}` : `semina a terra ~${d}`;
  return `${v.semenzaio ? `semenzaio ~${fmt(daISO(v.semenzaio))} → ` : ""}${q} · fino a ~${fmt(daISO(v.fine))}${daISO(v.fine).getFullYear() > S.piano.anno ? " " + daISO(v.fine).getFullYear() : ""}`
}

function vistaPiano() {
  const anno = annoPiano();
  const accettate = S.impianti.filter((i) => i.piano === anno);
  const intestazione = `<p><a href="#orto">← Le aiuole</a></p><h2>📋 L'orto del ${anno}</h2>`;
  if (!S.piano && accettate.length) {
    const fatte = accettate.filter((i) => daISO(i.data) <= oggi() || i.finito).length;
    return `${intestazione}
      <section class="carta"><p style="margin-top:0">✅ Il piano del ${anno} è stato accettato: <b>${accettate.length}</b> colture in programma${fatte ? ` (${fatte} già iniziate)` : ""}.
        Le trovi nel <a href="#diario" data-diario-anno="${anno}">diario del ${anno}</a> e nelle aiuole, con 🔔 «in programma»: ognuna si può modificare o eliminare.</p>
        <div class="riga-bottoni"><button class="secondario" id="piano-annulla">🗑️ Annulla il piano</button></div>
        <p class="tenue piccolo">«Annulla il piano» toglie le colture e le concimazioni del piano non ancora fatte, poi puoi rifarlo.</p>
      </section>`;
  }
  if (!S.piano) {
    const scorse = vociAnnoScorso(anno).length;
    return `${intestazione}
      <section class="carta">
        <p style="margin-top:0">L'app guarda cosa hai coltivato nel ${anno - 1} e ti propone dove mettere ogni ortaggio nel ${anno}, aiuola per aiuola:</p>
        <ul>
          <li><b>rotazione</b>: niente stessa famiglia dove c'era negli ultimi 2 anni;</li>
          <li><b>successione</b>: gli ortaggi esigenti (pomodori, zucchine, cavoli) dopo le leguminose, quelli che chiedono poco dopo gli esigenti;</li>
          <li><b>vicini</b>: buoni vicini insieme, cattivi vicini lontani;</li>
          <li><b>spazio</b>: aiuole di misura simile, serra per chi era in serra, posto libero per tutta la stagione;</li>
          <li><b>caselle</b>: nelle aiuole con la scacchiera sceglie anche le caselle.</li>
        </ul>
        <p>Alla fine prepara il diario del ${anno} con date, semine e concimazioni: lo accetti, lo modifichi o lo annulli.</p>
        ${scorse ? `<p class="bene">Nel ${anno - 1} hai segnato <b>${scorse}</b> colture: si parte da quelle.</p>`
          : `<p class="avviso">Nel ${anno - 1} non trovo colture nelle aiuole: potrai aggiungere gli ortaggi a mano.</p>`}
        <div class="riga-bottoni"><button id="piano-inizia">Inizia il piano del ${anno}</button></div>
      </section>`;
  }
  const P = S.piano;
  return `${intestazione}${htmlListaPiano(P)}${P.proposte ? htmlProposte(P) : ""}`;
}

function htmlDaChiudere(anno) {
  const inizio = new Date(anno, 0, 1, 12);
  const aperte = S.impianti.filter((i) => !i.finito && !PERENNI.has(i.ortaggioId) && aiuola(i.aiuolaId) && !aiuola(i.aiuolaId).semenzaio
    && daISO(i.data) < inizio && fineImpianto(i) < oggi());
  if (!aperte.length) return "";
  return `<div class="avviso">🧺 Ancora segnate «in coltivazione», ma il raccolto dovrebbe essere finito:
    ${aperte.map((i) => `${esc(PER_ID[i.ortaggioId]?.nome ?? "")} (${esc(nomeAiuolaId(i.aiuolaId))})`).join(", ")}.
    <div class="riga-bottoni" style="margin-bottom:0"><button class="piccolo" id="piano-chiudi">Segna come finite</button></div></div>`;
}
function htmlRestano(anno) {
  const ctx = { fisse: occupazioniFisse(anno) };
  const voci = [];
  for (const a of aiuoleVere()) {
    for (const x of ctx.fisse[a.id] || []) {
      const fine = x.e.getFullYear() > 9000 ? "sempre (perenne)" : `fino a ~${fmt(x.e)}${x.e.getFullYear() !== anno ? " " + x.e.getFullYear() : ""}`;
      voci.push(`${nomeOrtaggio(x.ortaggioId)} <span class="tenue">· ${esc(nomeAiuola(a))}${x.celle ? " " + esc(testoListaCelle(x.celle)) : ""} · ${fine}</span>`);
    }
  }
  return voci.length ? `<p style="margin-bottom:4px"><b>Restano dove sono</b> (perenni, colture che passano l'inverno, già in programma):</p>
    <ul class="piccolo" style="margin-top:0">${voci.map((x) => `<li>${x}</li>`).join("")}</ul>` : "";
}

function htmlListaPiano(P) {
  const righe = P.lista.filter((v) => PER_ID[v.ortaggioId]).map((v) => `<li><div class="riga">
      <span><b>${nomeOrtaggio(v.ortaggioId)}</b>${v.varieta ? ` <span class="tenue">${esc(v.varieta)}</span>` : ""}
        <br><span class="tenue piccolo">${esc(testoDate(v))}${v.origine && aiuola(v.origine) ? ` · nel ${P.anno - 1} in ${esc(nomeAiuolaId(v.origine))}` : " · aggiunto"}${v.serra ? " · serra" : ""}</span></span>
      <span style="white-space:nowrap;display:flex;align-items:center;gap:4px">
        <input type="number" min="0.1" step="0.5" value="${String(v.area)}" data-piano-area="${v.k}" style="width:5.2em" aria-label="Spazio in metri quadri"> m²
        <button class="piccolo secondario" data-piano-togli="${v.k}" title="Togli">✕</button>
      </span></div></li>`).join("");
  return `<section class="carta">
      <h3 style="margin-top:0">1. Cosa coltivare nel ${P.anno}</h3>
      <p class="tenue piccolo">Le colture del ${P.anno - 1} con lo stesso spazio (m²) e le stesse date. Togli quello che non vuoi più, cambia lo spazio, aggiungi ortaggi nuovi. Poi premi «Calcola».</p>
      ${htmlDaChiudere(P.anno)}
      ${righe ? `<ul class="elenco">${righe}</ul>` : `<p class="tenue">Nessun ortaggio: aggiungili qui sotto.</p>`}
      <div class="riga-bottoni" style="align-items:center">
        <select id="piano-nuovo" style="width:auto;flex:1;min-width:10em">${opzioniOrtaggi().map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("")}</select>
        <button class="secondario" id="piano-aggiungi">＋ Aggiungi</button>
      </div>
      ${htmlRestano(P.anno)}
      <div class="riga-bottoni">
        <button id="piano-calcola">${P.proposte ? "🔄 Ricalcola il piano" : "🧮 Calcola il piano"}</button>
        <button class="secondario" id="piano-scarta">Lascia perdere la bozza</button>
      </div>
    </section>`;
}

function htmlMiniScacchiera(a, qui, ctx) {
  const g = grigliaAiuola(a), fitta = grigliaFitta(g);
  const chi = {};
  for (const x of ctx.fisse[a.id] || []) for (const c of x.celle || tutteLeCelle(a)) (chi[c] ??= new Set()).add(x.ortaggioId);
  for (const { v, x } of qui) for (const c of x.celle || []) (chi[c] ??= new Set()).add(v.ortaggioId);
  let h = `<div class="scorri-scacchiera">${intestazioneGriglia(g)}`;
  for (let r = 0; r < g.righe; r++) {
    h += `<span class="intest riga">${nomeRiga(r)}</span>`;
    for (let c = 0; c < g.colonne; c++) {
      const n = nomeCella(r, c), ids = [...(chi[n] || [])];
      if (celleMancanti(a).has(n)) { h += `<span class="cella mancante"></span>`; continue; }
      h += `<span class="cella${ids.length ? " piena" : ""}" title="${n}${ids.length ? " · " + esc(ids.map((id) => PER_ID[id]?.nome).join(", ")) : ""}"><span class="em">${ids.map((id) => icona(PER_ID[id])).join("")}</span></span>`;
    }
  }
  return h + `</div></div>`;
}

function htmlProposte(P) {
  const ctx = contesto(P);
  const assegna = assegnaDaBozza(P);
  let avvisi = 0;
  const carte = ctx.aiuole.map((a) => {
    const qui = [...assegna].filter(([, x]) => x.aiuolaId === a.id).map(([k, x]) => ({ v: ctx.voci.get(k), x }))
      .sort((p, q) => p.v.inizio.localeCompare(q.v.inizio));
    const storia = (ctx.storia[a.id] || []).filter((h) => h.distanza === 1);
    const prima = [...new Set(storia.map((h) => h.ortaggioId))];
    const fisse = ctx.fisse[a.id] || [];
    const presenti = presentiIn(a, ctx, assegna);
    const voci = qui.map(({ v, x }) => {
      const { motivi } = punteggio({ ...v, celle: x.celle }, a, presenti.filter((y) => y.v !== v), ctx, true);
      avvisi += motivi.filter((m) => m.tipo !== "bene").length;
      return `<li>
        <div class="riga"><span><b>${nomeOrtaggio(v.ortaggioId)}</b>${x.celle?.length ? ` · <b>${esc(testoListaCelle(x.celle))}</b>` : ""}
          <br><span class="tenue piccolo">${esc(testoDate(v))} · ${haGriglia(a) ? `${x.celle?.length || 0} caselle` : fmtArea(v.area)}</span></span>
          <span style="white-space:nowrap"><button class="piccolo secondario" data-piano-modifica="${v.k}">✏️</button>
          <button class="piccolo secondario" data-piano-togli="${v.k}" title="Togli">✕</button></span></div>
        ${(() => {
          const r = celleRiportate(v, a, x.variante || 0);
          if (!r) return "";
          return stesseCelle(r, x.celle) ? `<div class="bene piccolo" style="margin:4px 0">▦ ${x.variante ? "Stessa disposizione dell'anno scorso, girata (" + ["", "sopra ↔ sotto", "destra ↔ sinistra", "sopra ↔ sotto e destra ↔ sinistra"][x.variante] + ") per la rotazione." : "Stesse caselle dell'anno scorso."}</div>`
            : `<div class="avviso piccolo" style="margin:4px 0">▦ Caselle diverse dall'anno scorso (${esc(testoListaCelle(r))}): erano già occupate.</div>`;
        })()}
        ${haGriglia(a) && !celleRiportate(v, a) && (x.celle?.length || 0) < bisogno(v, a) ? `<div class="pericolo piccolo" style="margin:4px 0">Qui ci sono solo ${x.celle?.length || 0} caselle libere in quel periodo: ne servirebbero ${bisogno(v, a)}.</div>` : ""}
        ${motivi.map((m) => `<div class="${m.tipo} piccolo" style="margin:4px 0">${m.testo}</div>`).join("")}
      </li>`;
    }).join("");
    return `<section class="carta">
      <div class="riga" style="display:flex;justify-content:space-between;gap:8px"><b>${a.copertura === "serra" ? "🏠" : "🟫"} ${esc(nomeAiuola(a))}</b>
        <span class="tenue piccolo">${esc(misureAiuola(a))}</span></div>
      <p class="tenue piccolo" style="margin:4px 0">Nel ${P.anno - 1}: ${prima.length ? prima.map((id) => esc(PER_ID[id].nome.toLowerCase())).join(", ") : "niente di segnato"}.
        ${fisse.length ? `Restano: ${[...new Set(fisse.map((f) => PER_ID[f.ortaggioId].nome.toLowerCase()))].map(esc).join(", ")}.` : ""}</p>
      ${haGriglia(a) && (qui.length || fisse.length) ? htmlMiniScacchiera(a, qui, ctx) : ""}
      ${voci ? `<ul class="elenco">${voci}</ul>` : `<p class="tenue">A riposo: niente in programma. Puoi seminare un sovescio (favino, trifoglio, senape) o coprirla con paglia.</p>`}
    </section>`;
  }).join("");
  const fuori = (P.fuori || []).map((k) => ctx.voci.get(k)).filter(Boolean);
  const nPiantine = [...assegna.keys()].length;
  return `<h3>2. La proposta</h3>
    <p class="tenue piccolo">${nPiantine} colture in ${new Set([...assegna.values()].map((x) => x.aiuolaId)).size} aiuole${avvisi ? ` · ${avvisi} ${avvisi === 1 ? "avviso" : "avvisi"} da guardare` : " · nessun avviso"}. Con ✏️ cambi aiuola, date o spazio; con ✕ togli.</p>
    ${fuori.length ? `<div class="pericolo">Non c'è posto per: ${fuori.map((v) => `${nomeOrtaggio(v.ortaggioId)} (${fmtArea(v.area)})`).join(", ")}. Riduci lo spazio di qualche ortaggio o aggiungi un'aiuola, poi ricalcola.</div>` : ""}
    ${carte}
    <section class="carta">
      <p style="margin-top:0">Accettando, nel diario del ${P.anno} trovi:</p>
      <ul class="piccolo"><li>ogni coltura in programma, con la data e le caselle (🔔 «in programma»);</li>
        <li>le semine in semenzaio, con l'aiuola e le caselle già pronte per «Trapianta»;</li>
        <li>una concimazione per aiuola, 3 settimane prima della prima coltura, con la dose.</li></ul>
      <div class="riga-bottoni"><button id="piano-accetta">✅ Accetta il piano</button></div>
    </section>`;
}

// -----------------------------------------------------------------------------
// Modifiche e accettazione
// -----------------------------------------------------------------------------
function modificaProposta(k) {
  const P = S.piano;
  const v = P.lista.find((x) => x.k === k);
  if (!v) return;
  const prop = P.proposte?.[k] || {};
  modulo({
    titolo: `${PER_ID[v.ortaggioId].nome} nel ${P.anno}`,
    campi: [
      { id: "aiuolaId", etichetta: "Aiuola", tipo: "select", opzioni: opzioniAiuole(false), valore: prop.aiuolaId || "" },
      { id: "modo", etichetta: "Come", tipo: "select", opzioni: [["dir", MODI.dir], ["tra", MODI.tra]], valore: v.modo },
      { id: "semenzaio", etichetta: "Semina in semenzaio (vuoto = compro le piantine)", tipo: "date", valore: v.semenzaio || "" },
      { id: "inizio", etichetta: "Data di semina a terra o trapianto", tipo: "date", valore: v.inizio, richiesto: true },
      { id: "fine", etichetta: "Fino a (fine della raccolta, circa)", tipo: "date", valore: v.fine, richiesto: true },
      { id: "area", etichetta: "Spazio in m²", tipo: "number", passo: "0.5", valore: v.area },
    ],
    aggiorna: (x) => {
      const a = aiuola(x.aiuolaId);
      return a && haGriglia(a) ? `<p class="tenue piccolo">Le caselle le sceglie di nuovo l'app (${bisogno({ area: Number(x.area.replace(",", ".")) || v.area }, a)} caselle); dopo aver accettato puoi spostarle a mano dall'aiuola.</p>` : "";
    },
    salva: (x) => {
      v.modo = x.modo;
      v.semenzaio = x.modo === "tra" && x.semenzaio ? x.semenzaio : null;
      v.inizio = x.inizio;
      v.fine = x.fine < x.inizio ? aISO(piuGiorni(daISO(x.inizio), 30)) : x.fine;
      v.area = Number(String(x.area).replace(",", ".")) || v.area;
      P.proposte ??= {};
      P.proposte[k] = { aiuolaId: x.aiuolaId, celle: [] };
      P.fuori = (P.fuori || []).filter((y) => y !== k);
      // Ricalcolo le caselle delle aiuole toccate, tenendo le altre colture dove sono.
      const ctx = contesto(P), assegna = assegnaDaBozza(P);
      const a = aiuola(x.aiuolaId);
      if (haGriglia(a)) {
        assegna.get(k).celle = null;
        P.proposte[k].celle = piazzaCelle(a, v, ctx, assegna);
      }
    },
  });
}

function accettaPiano() {
  const P = S.piano;
  const ctx = contesto(P), assegna = assegnaDaBozza(P);
  if (!assegna.size) { alert("Il piano è vuoto."); return; }
  const semenzaio = S.aiuole.find((a) => a.semenzaio);
  const perAiuola = {};
  for (const [k, x] of assegna) (perAiuola[x.aiuolaId] ??= []).push(ctx.voci.get(k));
  const nConcimi = Object.keys(perAiuola).length;
  const nSem = [...assegna.keys()].filter((k) => ctx.voci.get(k).semenzaio).length;
  const fuori = (P.fuori || []).length;
  if (!confirm(`Scrivo nel diario del ${P.anno}:\n• ${assegna.size} colture in programma${nSem ? ` (${nSem} partono dal semenzaio)` : ""}\n• ${nConcimi} concimazioni${fuori ? `\n\n${fuori} ortaggi senza posto restano fuori.` : ""}\n\nPotrai modificarle o eliminarle una per una.`)) return;
  for (const [k, x] of assegna) {
    const v = ctx.voci.get(k);
    const base = { finito: false, ortaggioId: v.ortaggioId, varieta: v.varieta, quantita: v.quantita, piano: P.anno };
    if (v.semenzaio && semenzaio) {
      S.impianti.push({ id: nuovoId(), ...base, aiuolaId: semenzaio.id, modo: "sem", data: v.semenzaio, celle: [],
        note: `Dal piano ${P.anno}: trapianto verso il ${fmt(daISO(v.inizio))} in ${nomeAiuolaId(x.aiuolaId)}${x.celle?.length ? " " + testoListaCelle(x.celle) : ""}.`,
        pianoAiuola: x.aiuolaId, pianoCelle: x.celle || [], pianoData: v.inizio });
    } else {
      S.impianti.push({ id: nuovoId(), ...base, aiuolaId: x.aiuolaId, modo: v.modo, data: v.inizio, celle: x.celle || [], note: `Dal piano ${P.anno}.` });
    }
  }
  // Una concimazione per aiuola, 3 settimane prima della prima coltura, dosata per la più esigente dei primi 2 mesi.
  const ordineEsig = { bassa: 0, media: 1, alta: 2 };
  for (const [id, voci] of Object.entries(perAiuola)) {
    const a = aiuola(id);
    const primo = voci.map((v) => daISO(v.inizio)).sort((p, q) => p - q)[0];
    const presto = voci.filter((v) => giorniTra(primo, daISO(v.inizio)) <= 60);
    const piu = presto.sort((p, q) => ordineEsig[PER_ID[q.ortaggioId].esig] - ordineEsig[PER_ID[p.ortaggioId].esig])[0];
    const esig = PER_ID[piu.ortaggioId].esig;
    let data = piuGiorni(primo, -RIPOSO_CONCIME);
    if (data < oggi()) data = oggi();
    const mq = areaAiuola(a);
    const dosi = CONCIMI.filter((c) => c.id !== "letame").map((c) => `${c.nome.split(" (")[0].toLowerCase()} ${fmtKg(c.dose[esig] * mq)}`).join(" oppure ");
    S.eventi.push({ id: nuovoId(), tipo: "concimazione", data: aISO(data), aiuolaId: id, impiantoId: "", kg: null, piano: P.anno,
      testo: `Dal piano ${P.anno}, prima di ${[...new Set(presto.map((v) => PER_ID[v.ortaggioId].nome.toLowerCase()))].join(", ")}: ${dosi}${a.larghezza ? "" : " (dose per un'aiuola media: metti le misure per averla giusta)"}.` });
  }
  const anno = P.anno;
  S.piano = null;
  annoDiario = String(anno);
  salva();
  location.hash = "#diario";
}

function annullaPiano() {
  const anno = annoPiano();
  const ora = oggi();
  const imp = S.impianti.filter((i) => i.piano === anno && !i.finito && daISO(i.data) >= ora);
  const ev = S.eventi.filter((e) => e.piano === anno && daISO(e.data) >= ora);
  const fatte = S.impianti.filter((i) => i.piano === anno).length - imp.length;
  if (!confirm(`Tolgo dal diario ${imp.length} colture e ${ev.length} concimazioni del piano ${anno} non ancora fatte.${fatte ? `\n${fatte} colture già iniziate restano.` : ""}`)) return;
  const via = new Set(imp.map((i) => i.id));
  S.impianti = S.impianti.filter((i) => !via.has(i.id));
  for (const i of S.impianti) if (i.piano === anno) delete i.piano; // quelle già iniziate escono dal piano
  S.eventi = S.eventi.filter((e) => !ev.includes(e));
  salva_e_ridisegna();
}

function chiudiColtureFinite() {
  const anno = annoPiano(), inizio = new Date(anno, 0, 1, 12);
  const aperte = S.impianti.filter((i) => !i.finito && !PERENNI.has(i.ortaggioId) && aiuola(i.aiuolaId) && !aiuola(i.aiuolaId).semenzaio
    && daISO(i.data) < inizio && fineImpianto(i) < oggi());
  if (!confirm(`Segno come finite ${aperte.length} colture, con la data di fine stimata. Restano nella storia delle aiuole.`)) return;
  for (const i of aperte) {
    i.finito = true;
    i.dataFine = aISO(fineImpianto(i));
    i.esito = i.esito || "raccolto";
  }
  salva_e_ridisegna();
}

function collegaPiano(root) {
  const su = (sel, fn) => root.querySelectorAll(sel).forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); fn(b, e); }));
  su("#piano-inizia", () => { nuovaBozza(); salva_e_ridisegna(); });
  su("#piano-scarta", () => { if (confirm("Butto via la bozza del piano?")) { S.piano = null; salva_e_ridisegna(); } });
  su("#piano-calcola", () => {
    if (S.piano.proposte && !confirm("Ricalcolo tutto: le modifiche fatte con ✏️ si perdono. Vado?")) return;
    calcolaPiano();
    salva_e_ridisegna();
  });
  su("#piano-aggiungi", () => {
    const id = el("piano-nuovo").value;
    if (!id) return;
    S.piano.lista.push(voceNuova(id, S.piano.anno));
    salva_e_ridisegna();
  });
  su("[data-piano-togli]", (b) => {
    const k = b.dataset.pianoTogli;
    S.piano.lista = S.piano.lista.filter((v) => v.k !== k);
    if (S.piano.proposte) delete S.piano.proposte[k];
    S.piano.fuori = (S.piano.fuori || []).filter((x) => x !== k);
    salva_e_ridisegna();
  });
  su("[data-piano-modifica]", (b) => modificaProposta(b.dataset.pianoModifica));
  su("#piano-accetta", accettaPiano);
  su("#piano-annulla", annullaPiano);
  su("#piano-chiudi", chiudiColtureFinite);
  su("[data-diario-anno]", (b) => { annoDiario = b.dataset.diarioAnno; location.hash = "#diario"; });
  root.querySelectorAll("[data-piano-area]").forEach((inp) => inp.addEventListener("change", () => {
    const v = S.piano.lista.find((x) => x.k === inp.dataset.pianoArea);
    const n = Number(inp.value.replace(",", "."));
    if (v && n > 0) { v.area = n; salva(); }
  }));
}

// Invito nella scheda Oggi e nella scheda Orto (da settembre a febbraio).
function htmlInvitoPiano(breve) {
  const anno = annoPiano(), mese = oggi().getMonth();
  if (S.impianti.some((i) => i.piano === anno)) return breve ? `<a class="bottone secondario" href="#piano">📋 Piano ${anno}</a>` : "";
  if (breve) return `<a class="bottone secondario" href="#piano">📋 Prepara l'orto ${anno}</a>`;
  if (!(mese >= 8 || mese <= 1) || !vociAnnoScorso(anno).length) return "";
  return `<section class="carta"><h2 style="margin-top:0">📋 Prepara l'orto del ${anno}</h2>
    <p style="margin:0 0 8px">${S.piano ? "La bozza del piano ti aspetta." : `L'app ti propone dove mettere ogni ortaggio, con la rotazione e i buoni vicini, partendo da quello che hai coltivato nel ${anno - 1}.`}</p>
    <a class="bottone" href="#piano">${S.piano ? "Continua il piano" : "Prepara il piano"}</a></section>`;
}
