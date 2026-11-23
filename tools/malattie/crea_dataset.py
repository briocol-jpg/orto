# =============================================================================
# Malattie dell'orto - dataset di classificazione (formato YOLO-cls)
#
# Prende le foto segnate "tieni" in ~/OrtoMalattie/revisione.csv (da
# rivedi_foto.py) da iNaturalist e da PlantDoc, toglie i doppioni tra le
# sorgenti (dHash) e qualsiasi cosa somigli alle foto di prova dell'utente
# (~/OrtoMalattie/test_orto: mai nel training), e le divide per classe in
#   ~/OrtoMalattie/dataset_v1/{train,val,test}/<classe>/   (hard link)
# 80/10/10 con seed fisso. Le foto non ancora riviste non entrano.
#
#   python3 -I tools/malattie/crea_dataset.py
# =============================================================================

import csv
import os
import random
import shutil
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image, ImageOps

BASE = Path.home() / "OrtoMalattie"
SORGENTI = BASE / "sorgenti"
ESITI = BASE / "revisione.csv"
TEST_ORTO = BASE / "test_orto"
USCITA = BASE / "dataset_v1"

# cartella di revisione -> classe del modello (stessi nomi dell'app dove c'è)
CLASSE = {
    "afidi": "afidi", "mosca_bianca": "aleurodidi", "altica": "altica",
    "bruchi_cavoli": "bruchi", "cimici": "cimici", "coccinella": "coccinella",
    "dorifora": "dorifora", "lumache": "lumache", "oidio": "oidio",
    "botrite": "botrite", "peronospora": "peronospora", "alternaria": "alternaria",
    "septoria": "septoria", "virus": "virus", "sana": "sana",
}
QUOTE = {"train": 0.8, "val": 0.1, "test": 0.1}
SEED = 2026
DOPPIONE = 4
MIN_PER_CLASSE = 60


def dhash(path: Path) -> int:
    with Image.open(path) as im:
        g = ImageOps.exif_transpose(im).convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    px = list(g.get_flattened_data()) if hasattr(g, "get_flattened_data") else list(g.getdata())
    v = 0
    for r in range(8):
        for c in range(8):
            v = (v << 1) | (px[r * 9 + c] > px[r * 9 + c + 1])
    return v


def percorso(chiave: str) -> Path:
    # "afidi/x.jpg" = inat; "plantdoc_classi/oidio/x.jpg" = altra sorgente
    parti = chiave.split("/")
    return SORGENTI / ("inat" if len(parti) == 2 else parti[0]) / "/".join(parti[-2:])


def main() -> None:
    with open(ESITI, newline="", encoding="utf-8") as f:
        tenute = [r["file"] for r in csv.DictReader(f) if r["esito"] == "tieni"]

    prova = [dhash(p) for p in TEST_ORTO.rglob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}] \
        if TEST_ORTO.exists() else []
    print(f"Foto di prova dell'utente da evitare: {len(prova)}")

    per_classe = defaultdict(list)
    visti: list[int] = []
    scarti = Counter()
    for chiave in sorted(tenute):
        cartella = chiave.split("/")[-2]
        classe = CLASSE.get(cartella)
        p = percorso(chiave)
        if classe is None or not p.exists():
            scarti["mancante o classe sconosciuta"] += 1
            continue
        h = dhash(p)
        if any(bin(h ^ x).count("1") <= 6 for x in prova):
            scarti["simile a una foto di prova"] += 1
            continue
        if any(bin(h ^ x).count("1") <= DOPPIONE for x in visti):
            scarti["doppione"] += 1
            continue
        visti.append(h)
        per_classe[classe].append(p)

    if USCITA.exists():
        shutil.rmtree(USCITA)
    rng = random.Random(SEED)
    print(f"\n{'classe':12s} {'train':>6s} {'val':>5s} {'test':>5s}")
    for classe in sorted(per_classe):
        foto = sorted(per_classe[classe])
        if len(foto) < MIN_PER_CLASSE:
            print(f"{classe:12s} solo {len(foto)} foto: classe lasciata fuori")
            continue
        rng.shuffle(foto)
        n_val = round(len(foto) * QUOTE["val"])
        n_test = round(len(foto) * QUOTE["test"])
        parti = {"val": foto[:n_val], "test": foto[n_val:n_val + n_test], "train": foto[n_val + n_test:]}
        for parte, elenco in parti.items():
            d = USCITA / parte / classe
            d.mkdir(parents=True, exist_ok=True)
            for p in elenco:
                fonte = "pd" if p.name.startswith("pd_") else "inat"
                dest = d / (p.name if fonte == "pd" else f"inat_{p.name}")
                try:
                    os.link(p, dest)
                except OSError:
                    shutil.copy2(p, dest)
        print(f"{classe:12s} {len(parti['train']):6d} {len(parti['val']):5d} {len(parti['test']):5d}")
    for k, n in scarti.items():
        print(f"Tolte ({k}): {n}")
    print(f"\nDataset in {USCITA}")


if __name__ == "__main__":
    main()
