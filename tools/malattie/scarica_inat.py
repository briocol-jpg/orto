# =============================================================================
# Malattie dell'orto - download da iNaturalist
#
# Scarica foto di parassiti e malattie (osservazioni research-grade, una foto
# per osservazione, formato "medium" ~500 px) in
#   ~/OrtoMalattie/sorgenti/inat/<classe>/<classe>_<taxon>_obs_<id>_photo_<id>.jpg
# con manifest.csv (licenza e autore di ogni foto).
#
# Si può interrompere e rilanciare: riparte da dove era arrivato.
# Le foto dell'orto dell'utente (test) non c'entrano: stanno in ~/OrtoMalattie/test_orto.
#
#   python3 -I tools/malattie/scarica_inat.py
# =============================================================================

import csv
import json
import random
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

API_URL = "https://api.inaturalist.org/v1/observations"
OUT = Path.home() / "OrtoMalattie" / "sorgenti" / "inat"
MANIFEST = OUT / "manifest.csv"
USER_AGENT = "OrtoMalattie/0.1 (dataset per uso personale)"

EUROPA = 97391
LARVA = {"term_id": 1, "term_value_id": 6}  # annotazione "Life Stage = Larva"

# classe -> [(taxon, filtri extra, luogo o None = mondo, quante osservazioni)]
CLASSI = {
    "dorifora": [("Leptinotarsa decemlineata", {}, EUROPA, 500)],
    "bruchi_cavoli": [
        ("Pieris brassicae", LARVA, None, 220),
        ("Pieris rapae", LARVA, None, 160),
        ("Mamestra brassicae", LARVA, None, 80),
        ("Plutella xylostella", LARVA, None, 60),
    ],
    "afidi": [("Brevicoryne brassicae", {}, None, 150), ("Aphididae", {}, EUROPA, 400)],
    "mosca_bianca": [("Aleyrodes proletella", {}, None, 250), ("Aleyrodidae", {}, None, 300)],
    "lumache": [
        ("Arion vulgaris", {}, EUROPA, 150),
        ("Deroceras reticulatum", {}, EUROPA, 150),
        ("Limax maximus", {}, EUROPA, 100),
        ("Cornu aspersum", {}, EUROPA, 120),
    ],
    "cimici": [("Halyomorpha halys", {}, EUROPA, 250), ("Nezara viridula", {}, EUROPA, 250)],
    "altica": [("Phyllotreta", {}, None, 350), ("Psylliodes", {}, None, 100)],
    "coccinella": [("Coccinellidae", {}, EUROPA, 350), ("Coccinellidae", LARVA, EUROPA, 150)],
    "oidio": [
        ("Podosphaera xanthii", {}, None, 250),
        ("Erysiphe pisi", {}, None, 150),
        ("Golovinomyces orontii", {}, None, 150),
    ],
    "botrite": [("Botrytis cinerea", {}, None, 250)],
}

PER_PAGE = 100
MAX_PAGE = 100  # l'API non va oltre 10000 risultati
DELAY = 1.0
SEED = 2026


def api(params: dict) -> dict:
    req = urllib.request.Request(API_URL + "?" + urllib.parse.urlencode(params),
                                 headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def scarica(url: str, dest: Path) -> bool:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=30) as r:
            dati = r.read()
        if len(dati) < 2000:
            return False
        tmp = dest.with_suffix(".part")
        tmp.write_bytes(dati)
        tmp.rename(dest)
        return True
    except Exception as e:
        print(f"  errore {dest.name}: {e}", flush=True)
        return False


def obs_id(p: Path):
    parti = p.stem.split("_")
    try:
        return int(parti[parti.index("obs") + 1])
    except (ValueError, IndexError):
        return None


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    gia = {obs_id(p) for p in OUT.rglob("*.jpg")}
    rng = random.Random(SEED)
    nuovo = not MANIFEST.exists()
    man = open(MANIFEST, "a", newline="", encoding="utf-8")
    w = csv.writer(man)
    if nuovo:
        w.writerow(["file", "classe", "taxon", "obs_id", "photo_id", "licenza", "attribuzione", "luogo"])

    solo = sys.argv[1:]  # facoltativo: solo alcune classi
    for classe, voci in CLASSI.items():
        if solo and classe not in solo:
            continue
        cartella = OUT / classe
        cartella.mkdir(exist_ok=True)
        for p in cartella.glob("*.part"):
            p.unlink()
        for taxon, filtri, luogo, quanti in voci:
            sigla = taxon.lower().replace(" ", "-") + ("-larva" if filtri is LARVA else "")
            fatti = len(list(cartella.glob(f"{classe}_{sigla}_obs_*.jpg")))
            print(f"\n{classe} · {taxon}{' (larve)' if filtri is LARVA else ''}: {fatti}/{quanti}", flush=True)
            if fatti >= quanti:
                continue
            base = {"taxon_name": taxon, "quality_grade": "research", "photos": "true",
                    "per_page": PER_PAGE, "order_by": "id", "order": "desc", **filtri}
            if luogo:
                base["place_id"] = luogo
            try:
                totale = api({**base, "page": 1, "per_page": 1})["total_results"]
            except Exception as e:
                print(f"  errore API: {e}", flush=True)
                continue
            pagine = list(range(1, min(MAX_PAGE, (totale + PER_PAGE - 1) // PER_PAGE) + 1))
            rng.shuffle(pagine)  # anni, paesi e fotografi diversi
            limite_pagina = max(10, quanti // 6)
            print(f"  {totale} osservazioni disponibili", flush=True)
            for pagina in pagine:
                if fatti >= quanti:
                    break
                try:
                    risultati = api({**base, "page": pagina}).get("results", [])
                except Exception as e:
                    print(f"  errore API pagina {pagina}: {e}", flush=True)
                    time.sleep(10)
                    continue
                time.sleep(DELAY)
                rng.shuffle(risultati)
                presi = 0
                for o in risultati:
                    if fatti >= quanti or presi >= limite_pagina:
                        break
                    if o["id"] in gia or not o.get("photos"):
                        continue
                    foto = o["photos"][0]
                    url = foto["url"].replace("square", "medium")
                    nome = f"{classe}_{sigla}_obs_{o['id']}_photo_{foto['id']}.jpg"
                    if scarica(url, cartella / nome):
                        gia.add(o["id"])
                        fatti += 1
                        presi += 1
                        w.writerow([f"{classe}/{nome}", classe, taxon, o["id"], foto["id"],
                                    foto.get("license_code") or "", foto.get("attribution", ""), o.get("place_guess") or ""])
                        man.flush()
                    time.sleep(DELAY)
                print(f"  pagina {pagina}: {fatti}/{quanti}", flush=True)
    man.close()
    print("\nFINITO", flush=True)


if __name__ == "__main__":
    main()
