# =============================================================================
# Malattie dell'orto - revisione delle foto scaricate, a fogli di miniature
#
# Mostra le foto di ~/OrtoMalattie/sorgenti/inat/<classe>/ 36 alla volta.
#   clic sinistro  = segna / togli "scarta" (croce rossa)
#   clic destro    = vedi la foto in grande
#   →  o  Invio    = foglio fatto: le foto non segnate sono tenute, avanti
#   ←              = foglio precedente (si può correggere)
#   ESC            = esci (il lavoro è già salvato)
#
# Le foto non vengono spostate: l'esito va in ~/OrtoMalattie/revisione.csv
# (file, tieni/scarta). Rilanciando si riparte dal primo foglio non fatto.
#
#   python3 -I tools/malattie/rivedi_foto.py            tutte le classi
#   python3 -I tools/malattie/rivedi_foto.py afidi      solo una classe
#   python3 -I tools/malattie/rivedi_foto.py --grandi sana
#       miniature grandi il doppio (8 per foglio invece di 36)
#   python3 -I tools/malattie/rivedi_foto.py --da plantdoc_classi
#       foto di un'altra sorgente (~/OrtoMalattie/sorgenti/<nome>); nel
#       file degli esiti il nome comincia con "<nome>/"
# =============================================================================

import csv
import sys
import tkinter as tk
from pathlib import Path

from PIL import Image, ImageOps, ImageTk

BASE = Path.home() / "OrtoMalattie"
SORGENTI = BASE / "sorgenti"
FOTO = SORGENTI / "inat"
PREFISSO = ""  # "" per inat (esiti già salvati così), "<sorgente>/" per le altre
ESITI = BASE / "revisione.csv"

COLONNE, RIGHE, LATO = 9, 4, 200

# Cosa tenere per ogni classe (scritto in cima al foglio).
ISTRUZIONI = {
    "afidi": "AFIDI: tieni colonie o singoli afidi su piante. Scarta formiche da sole, afidi alati in volo lontani.",
    "altica": "ALTICA (pulce dei cavoli): tieni i coleotteri piccoli o le foglie bucherellate. Scarta se non si vedono.",
    "botrite": "BOTRITE (muffa grigia): tieni frutti, fiori o foglie con muffa grigia. Scarta piante selvatiche non riconoscibili.",
    "bruchi_cavoli": "BRUCHI DEI CAVOLI: tieni i bruchi (anche su altre piante). Scarta farfalle adulte, crisalidi, bozzoli.",
    "cimici": "CIMICI: tieni cimici adulte, ninfe e uova. Scarta se l'insetto è minuscolo o è un altro insetto.",
    "coccinella": "COCCINELLE (amiche): tieni adulti, larve e pupe. Scarta se è un altro insetto.",
    "dorifora": "DORIFORA: tieni adulti, larve rosse e uova. Scarta se non si vede l'insetto.",
    "lumache": "LUMACHE E CHIOCCIOLE: tieni lumache su terra, foglie, orto. Scarta conchiglie vuote.",
    "mosca_bianca": "MOSCA BIANCA: tieni moscerini bianchi e le loro uova/ninfe sotto le foglie. Scarta se non si vedono.",
    "oidio": "OIDIO (mal bianco): tieni foglie con polvere bianca. Scarta foto al microscopio e foglie senza macchie visibili.",
    "peronospora": "PERONOSPORA del pomodoro e della patata: tieni foglie (o frutti) con macchie brune grandi e irregolari. Scarta disegni, schemi, foto non di foglie.",
    "alternaria": "ALTERNARIA: tieni foglie con macchie brune ad anelli concentrici. Scarta disegni, schemi, foto non di foglie.",
    "septoria": "SEPTORIA: tieni foglie con tante macchioline chiare bordate di scuro. Scarta disegni, schemi, foto non di foglie.",
    "virus": "VIRUS (mosaico, foglie gialle accartocciate): tieni foglie a mosaico chiaro/scuro o gialle e arricciate. Scarta il resto.",
    "sana": "FOGLIE SANE: tieni piante dell'orto (anche in vaso) con foglie sane ben visibili. Scarta ortaggi al mercato o in cucina, semi, fiori da soli, piante con insetti o macchie.",
}
COMUNE = "Scarta sempre: foto sfocate, al microscopio, disegni, collage, scritte, insetto in mano senza pianta, dubbi."


def leggi_esiti() -> dict:
    if not ESITI.exists():
        return {}
    with open(ESITI, newline="", encoding="utf-8") as f:
        return {r["file"]: r["esito"] for r in csv.DictReader(f)}


def scrivi_esiti(esiti: dict) -> None:
    tmp = ESITI.with_suffix(".tmp")
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["file", "esito"])
        for k in sorted(esiti):
            w.writerow([k, esiti[k]])
    tmp.replace(ESITI)


class Revisione:
    def __init__(self, root: tk.Tk, classi: list[str]):
        self.root = root
        self.esiti = leggi_esiti()
        self.foto = []  # (classe, path)
        for c in classi:
            self.foto += [(c, p) for p in sorted((FOTO / c).glob("*.jpg"))]
        if not self.foto:
            raise SystemExit("Nessuna foto da rivedere.")
        self.per_foglio = COLONNE * RIGHE
        # Un foglio non mescola classi diverse.
        self.fogli = []
        for c in classi:
            idx = [i for i, (cc, _) in enumerate(self.foto) if cc == c]
            self.fogli += [idx[i:i + self.per_foglio] for i in range(0, len(idx), self.per_foglio)]
        self.n = next((i for i, f in enumerate(self.fogli)
                       if any(self.chiave(j) not in self.esiti for j in f)), len(self.fogli) - 1)

        root.title("Orto - revisione foto malattie")
        self.titolo = tk.Label(root, font=("Arial", 13, "bold"), wraplength=1800, justify="left")
        self.titolo.pack(anchor="w", padx=8, pady=(6, 0))
        tk.Label(root, text=COMUNE + "     Clic = scarta/tieni · destro = ingrandisci · → = avanti · ← = indietro · ESC = esci",
                 font=("Arial", 10), fg="#555").pack(anchor="w", padx=8)
        self.canvas = tk.Canvas(root, width=COLONNE * LATO, height=RIGHE * LATO, bg="#222", highlightthickness=0)
        self.canvas.pack(padx=8, pady=6)
        self.canvas.bind("<Button-1>", self.clic)
        self.canvas.bind("<Button-3>", self.ingrandisci)
        for k in ("<Right>", "<Return>"):
            root.bind(k, self.avanti)
        root.bind("<Left>", self.indietro)
        root.bind("<Escape>", lambda e: root.destroy())
        self.mostra()

    def chiave(self, i: int) -> str:
        c, p = self.foto[i]
        return f"{PREFISSO}{c}/{p.name}"

    def mostra(self):
        foglio = self.fogli[self.n]
        classe = self.foto[foglio[0]][0]
        fatti = sum(1 for i in range(len(self.foto)) if self.chiave(i) in self.esiti)
        scartate = sum(1 for v in self.esiti.values() if v == "scarta")
        self.titolo.config(text=f"{ISTRUZIONI.get(classe, classe)}\nFoglio {self.n + 1}/{len(self.fogli)}  ·  "
                                f"foto riviste {fatti}/{len(self.foto)}  ·  scartate finora {scartate}")
        # Foglio nuovo: tutte "tieni" finché non si cliccano.
        self.scarta = {i for i in foglio if self.esiti.get(self.chiave(i)) == "scarta"}
        self.canvas.delete("all")
        self.immagini = []
        for pos, i in enumerate(foglio):
            x, y = (pos % COLONNE) * LATO, (pos // COLONNE) * LATO
            try:
                with Image.open(self.foto[i][1]) as im:
                    im = ImageOps.exif_transpose(im).convert("RGB")
                    im.thumbnail((LATO - 6, LATO - 6))
            except Exception:
                im = Image.new("RGB", (LATO - 6, LATO - 6), "gray")
            ph = ImageTk.PhotoImage(im)
            self.immagini.append(ph)
            self.canvas.create_image(x + LATO // 2, y + LATO // 2, image=ph)
        self.disegna_segni()

    def disegna_segni(self):
        self.canvas.delete("segno")
        for pos, i in enumerate(self.fogli[self.n]):
            x, y = (pos % COLONNE) * LATO, (pos // COLONNE) * LATO
            gia = self.chiave(i) in self.esiti
            if i in self.scarta:
                self.canvas.create_rectangle(x + 3, y + 3, x + LATO - 3, y + LATO - 3, outline="red", width=5, tags="segno")
                self.canvas.create_line(x + 20, y + 20, x + LATO - 20, y + LATO - 20, fill="red", width=6, tags="segno")
                self.canvas.create_line(x + LATO - 20, y + 20, x + 20, y + LATO - 20, fill="red", width=6, tags="segno")
            elif gia:
                self.canvas.create_text(x + 12, y + 12, text="✓", fill="#3c3", font=("Arial", 16, "bold"), tags="segno")

    def posizione(self, event):
        pos = (event.y // LATO) * COLONNE + event.x // LATO
        foglio = self.fogli[self.n]
        return foglio[pos] if 0 <= pos < len(foglio) and event.x < COLONNE * LATO else None

    def clic(self, event):
        i = self.posizione(event)
        if i is None:
            return
        self.scarta ^= {i}
        self.disegna_segni()

    def ingrandisci(self, event):
        i = self.posizione(event)
        if i is None:
            return
        w = tk.Toplevel(self.root)
        w.title(self.chiave(i))
        with Image.open(self.foto[i][1]) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            im.thumbnail((1000, 900))
        w.ph = ImageTk.PhotoImage(im)
        tk.Label(w, image=w.ph).pack()
        w.bind("<Button-1>", lambda e: w.destroy())
        w.bind("<Escape>", lambda e: w.destroy())
        w.focus_set()

    def salva_foglio(self):
        for i in self.fogli[self.n]:
            self.esiti[self.chiave(i)] = "scarta" if i in self.scarta else "tieni"
        scrivi_esiti(self.esiti)

    def avanti(self, event=None):
        self.salva_foglio()
        if self.n < len(self.fogli) - 1:
            self.n += 1
            self.mostra()
        else:
            self.mostra()
            self.titolo.config(text=self.titolo.cget("text") + "   —   FINITO, ultimo foglio salvato")

    def indietro(self, event=None):
        if self.n > 0:
            self.n -= 1
            self.mostra()


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--grandi" in args:
        args.remove("--grandi")
        COLONNE, RIGHE, LATO = 4, 2, 420
    if args[:1] == ["--da"] and len(args) >= 2:
        FOTO = SORGENTI / args[1]
        PREFISSO = f"{args[1]}/"
        args = args[2:]
    classi = args or sorted(p.name for p in FOTO.iterdir() if p.is_dir())
    root = tk.Tk()
    Revisione(root, classi)
    root.mainloop()
