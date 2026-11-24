# =============================================================================
# Malattie dell'orto - importa le foto corrette dall'app
#
# Nell'app, sotto il risultato del riconoscimento, 👍/👎 salvano la foto con la
# risposta giusta; «Invia le foto» le manda in un file orto-foto-modello-*.txt
# (JSON con le foto in base64). Questo script le scompatta in
#   ~/OrtoMalattie/correzioni/<classe giusta>/<data>_<n>.jpg
# e aggiunge una riga per foto a ~/OrtoMalattie/correzioni/correzioni.csv
# (risposta del modello, ortaggio, nota). Le foto già importate (stessa data e
# stessa risposta) vengono saltate, quindi si può rilanciare sullo stesso file.
#
#   python3 -I tools/malattie/importa_correzioni.py <file.txt> [altri file...]
# =============================================================================

import base64
import csv
import json
import sys
from pathlib import Path

USCITA = Path.home() / "OrtoMalattie" / "correzioni"
ELENCO = USCITA / "correzioni.csv"
CAMPI = ["file", "giusta", "risposta", "ortaggio", "modo", "nota", "data", "modello"]


def main(files: list[str]) -> None:
    USCITA.mkdir(parents=True, exist_ok=True)
    gia = set()
    if ELENCO.exists():
        with open(ELENCO, newline="", encoding="utf-8") as f:
            gia = {(r["data"], r["risposta"]) for r in csv.DictReader(f)}
    nuove = []
    for nome in files:
        dati = json.loads(Path(nome).read_text(encoding="utf-8"))
        if dati.get("tipo") != "orto-foto-modello":
            print(f"{nome}: non è un file di foto per il modello, salto")
            continue
        for v in dati["foto"]:
            if (v["data"], v["risposta"]) in gia or not v.get("jpeg"):
                continue
            cartella = USCITA / v["giusta"]
            cartella.mkdir(exist_ok=True)
            base = v["data"][:19].replace(":", "").replace("-", "").replace("T", "_")
            dest = cartella / f"{base}.jpg"
            k = 1
            while dest.exists():
                dest = cartella / f"{base}_{k}.jpg"
                k += 1
            dest.write_bytes(base64.b64decode(v["jpeg"]))
            gia.add((v["data"], v["risposta"]))
            nuove.append({"file": str(dest.relative_to(USCITA)), **{c: v.get(c, "") for c in CAMPI[1:]}})
    scrivi_intestazione = not ELENCO.exists()
    with open(ELENCO, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CAMPI)
        if scrivi_intestazione:
            w.writeheader()
        w.writerows(nuove)
    giuste = sum(1 for r in nuove if r["giusta"] == r["risposta"])
    print(f"Importate {len(nuove)} foto ({giuste} giuste, {len(nuove) - giuste} sbagliate) in {USCITA}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__ or "uso: importa_correzioni.py <file.txt>")
    main(sys.argv[1:])
