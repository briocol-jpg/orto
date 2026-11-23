# =============================================================================
# Malattie dell'orto - classi prese da PlantDoc (CC BY 4.0)
#
# PlantDoc (github.com/pratikkayal/PlantDoc-Dataset) ha cartelle per pianta e
# malattia, divise in train/test con molti doppioni. Qui si prendono solo le
# cartelle utili per l'orto, unendo train e test, si tolgono i doppioni
# (dHash) e si copiano in
#   ~/OrtoMalattie/sorgenti/plantdoc_classi/<classe>/pd_<cartella>_<file>.jpg
# pronte per la revisione (rivedi_foto.py plantdoc_classi).
# La divisione train/val/test si rifà dopo, in crea_dataset.py.
#
#   python3 -I tools/malattie/prepara_plantdoc.py
# =============================================================================

import re
import shutil
from pathlib import Path

from PIL import Image, ImageOps

SORGENTE = Path.home() / "OrtoMalattie" / "sorgenti" / "plantdoc"
USCITA = Path.home() / "OrtoMalattie" / "sorgenti" / "plantdoc_classi"

# classe dell'app <- cartelle PlantDoc
MAPPA = {
    "peronospora": ["Tomato leaf late blight", "Potato leaf late blight"],
    "alternaria": ["Tomato Early blight leaf", "Potato leaf early blight"],
    "septoria": ["Tomato Septoria leaf spot"],
    "virus": ["Tomato leaf mosaic virus", "Tomato leaf yellow virus"],
    "oidio": ["Squash Powdery mildew leaf"],
    "sana": ["Tomato leaf", "Bell_pepper leaf", "Strawberry leaf", "Raspberry leaf", "Soyabean leaf"],
}
DOPPIONE = 4  # bit su 64
ESTENSIONI = {".jpg", ".jpeg", ".png", ".webp"}


def dhash(path: Path) -> int:
    with Image.open(path) as im:
        g = ImageOps.exif_transpose(im).convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    px = list(g.getdata())
    v = 0
    for r in range(8):
        for c in range(8):
            v = (v << 1) | (px[r * 9 + c] > px[r * 9 + c + 1])
    return v


def main() -> None:
    if USCITA.exists():
        shutil.rmtree(USCITA)
    visti: list[int] = []
    for classe, cartelle in MAPPA.items():
        (USCITA / classe).mkdir(parents=True)
        tenute = doppie = rotte = 0
        for cartella in cartelle:
            sigla = re.sub(r"[^a-z0-9]+", "-", cartella.lower()).strip("-")
            for parte in ("train", "test"):
                for p in sorted((SORGENTE / parte / cartella).glob("*")):
                    if p.suffix.lower() not in ESTENSIONI:
                        continue
                    try:
                        h = dhash(p)
                    except Exception:
                        rotte += 1
                        continue
                    if any(bin(h ^ x).count("1") <= DOPPIONE for x in visti):
                        doppie += 1
                        continue
                    visti.append(h)
                    nome = re.sub(r"[^A-Za-z0-9]+", "_", p.stem)[:60]
                    dest = USCITA / classe / f"pd_{sigla}_{nome}.jpg"
                    n = 2
                    while dest.exists():
                        dest = USCITA / classe / f"pd_{sigla}_{nome}_{n}.jpg"
                        n += 1
                    with Image.open(p) as im:
                        im = ImageOps.exif_transpose(im).convert("RGB")
                        im.thumbnail((800, 800))
                        im.save(dest, quality=90)
                    tenute += 1
        print(f"{classe}: {tenute} tenute, {doppie} doppioni, {rotte} illeggibili", flush=True)


if __name__ == "__main__":
    main()
