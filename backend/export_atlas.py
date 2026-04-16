"""
export_atlas.py
===============
Exporte les mesures de MongoDB Atlas vers un fichier JSON ou CSV local.

Usage :
  python export_atlas.py              -> JSON, toutes les données
  python export_atlas.py --csv        -> CSV
  python export_atlas.py --heures 24  -> dernières 24h seulement
  python export_atlas.py --heures 168 --csv  -> 7 derniers jours en CSV
"""

import json
import csv
import time
import argparse
import os
from datetime import datetime
from pymongo import MongoClient, ASCENDING
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL")
NOM_BASE  = os.getenv("NOM_BASE", "diris_monitoring")


def connecter():
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=10000)
    client.admin.command("ping")
    return client[NOM_BASE]["mesures"]


def aplatir(doc):
    """Convertit un document imbriqué en ligne plate pour CSV/JSON."""
    return {
        "timestamp"          : doc.get("timestamp"),
        "heure_abidjan"      : doc.get("heure_abidjan", ""),
        "tension_u12"        : doc.get("tensions", {}).get("u12"),
        "tension_u23"        : doc.get("tensions", {}).get("u23"),
        "tension_u31"        : doc.get("tensions", {}).get("u31"),
        "tension_v1"         : doc.get("tensions", {}).get("v1"),
        "tension_v2"         : doc.get("tensions", {}).get("v2"),
        "tension_v3"         : doc.get("tensions", {}).get("v3"),
        "frequence"          : doc.get("frequence"),
        "courant_i1"         : doc.get("courants", {}).get("i1"),
        "courant_i2"         : doc.get("courants", {}).get("i2"),
        "courant_i3"         : doc.get("courants", {}).get("i3"),
        "courant_in"         : doc.get("courants", {}).get("in"),
        "puissance_active"   : doc.get("puissances", {}).get("active"),
        "puissance_reactive" : doc.get("puissances", {}).get("reactive"),
        "puissance_apparente": doc.get("puissances", {}).get("apparente"),
        "cos_phi"            : doc.get("cos_phi"),
        "lecture_complete"   : doc.get("qualite", {}).get("lecture_complete"),
    }


def exporter(heures=None, format_csv=False):
    print("  Connexion a Atlas...")
    try:
        col = connecter()
        print(f"  OK Connecte — base : '{NOM_BASE}'")
    except Exception as e:
        print(f"  ERREUR connexion : {e}")
        return

    filtre = {}
    if heures:
        ts_debut = time.time() - (heures * 3600)
        filtre = {"timestamp": {"$gte": ts_debut}}
        print(f"  Periode : dernieres {heures}h")
    else:
        print("  Periode : toutes les donnees")

    total = col.count_documents(filtre)
    print(f"  Documents trouves : {total}")

    if total == 0:
        print("  Aucune donnee a exporter.")
        return

    curseur   = col.find(filtre, {"_id": 0}, sort=[("timestamp", ASCENDING)])
    documents = [aplatir(doc) for doc in curseur]

    maintenant  = datetime.now().strftime("%Y%m%d_%H%M%S")
    suffixe     = f"_{heures}h" if heures else "_complet"

    if format_csv:
        nom_fichier = f"export_diris{suffixe}_{maintenant}.csv"
        with open(nom_fichier, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=documents[0].keys())
            writer.writeheader()
            writer.writerows(documents)
    else:
        nom_fichier = f"export_diris{suffixe}_{maintenant}.json"
        with open(nom_fichier, "w", encoding="utf-8") as f:
            json.dump(documents, f, ensure_ascii=False, indent=2)

    print(f"\n  Export termine !")
    print(f"  Fichier : {os.path.abspath(nom_fichier)}")
    print(f"  Lignes  : {len(documents)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export MongoDB Atlas -> JSON/CSV")
    parser.add_argument("--csv",    action="store_true", help="Exporter en CSV (defaut : JSON)")
    parser.add_argument("--heures", type=int, default=None, help="Exporter les N dernieres heures")
    args = parser.parse_args()

    print("=" * 50)
    print("  Export MongoDB Atlas — Diris A40")
    print("=" * 50)
    exporter(heures=args.heures, format_csv=args.csv)
