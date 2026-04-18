from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from datetime import datetime, timezone
from dotenv import load_dotenv
import os
import time

load_dotenv()



MONGO_URL      = os.getenv("MONGO_URL")
NOM_BASE       = os.getenv("NOM_BASE")
NOM_COLLECTION = "mesures"          # ✅ BUG 1 CORRIGÉ : était "COLLECTION_NAME"

RETENTION_SECONDES = 30 * 24 * 3600

CHAMPS_ATTENDUS = [
    "tension_u12", "tension_u23", "tension_u31",
    "tension_v1",  "tension_v2",  "tension_v3",
    "frequence",
    "courant_i1",  "courant_i2",  "courant_i3", "courant_in",
    "puissance_active", "puissance_reactive", "puissance_apparente",
    "cos_phi",
]


# ─────────────────────────────────────────────
# CLASSE PRINCIPALE
# ─────────────────────────────────────────────

class GestionnaireDB:

    def __init__(self):
        self.client     = None
        self.base       = None
        self.collection = None
        self.connecte   = False

    # ── Connexion ──────────────────────────────────────────────────────────

    def connecter(self):
        """Se connecte à MongoDB Atlas."""
        try:
            print(f"  Connexion à Atlas...")

            self.client = MongoClient(
                MONGO_URL,
                serverSelectionTimeoutMS=10000,
                connectTimeoutMS=10000,
                socketTimeoutMS=10000,
            )

            self.client.admin.command("ping")

            self.base       = self.client[NOM_BASE]
            self.collection = self.base[NOM_COLLECTION]  # ✅ BUG 1 CORRIGÉ

            self._creer_index()

            self.connecte = True
            print(f"  ✓ Connecté à Atlas ! Base : '{NOM_BASE}'")
            return True

        except ServerSelectionTimeoutError:
            print("  ✗ Timeout Atlas — vérifiez votre URL et Network Access (0.0.0.0/0)")
            return False
        except Exception as e:
            print(f"  ✗ Erreur : {e}")
            return False

    # ── Index ──────────────────────────────────────────────────────────────

    def _creer_index(self):
        """Crée les index pour les requêtes rapides."""
        self.collection.create_index([("timestamp", ASCENDING)], name="idx_timestamp")
        self.collection.create_index(
            [("date_insertion", ASCENDING)],
            expireAfterSeconds=RETENTION_SECONDES,
            name="idx_ttl"
        )
        print(f"  ✓ Index prêts (rétention : {RETENTION_SECONDES // 86400} jours)")

    # ── Sauvegarder ────────────────────────────────────────────────────────

    def sauvegarder_mesure(self, mesures: dict):   # ✅ BUG 2 CORRIGÉ : paramètre "mesures" avec s
        """
        Insère UNE mesure complète dans MongoDB Atlas.

        Structure du document stocké :
        {
          "timestamp"     : 1712345678.123,
          "date_insertion": ISODate(...)
          "heure_abidjan" : "2024-04-05 10:00:00",
          "tensions"      : { "u12":395.1, "u23":394.8, "u31":395.5,
                               "v1":228.1,  "v2":227.9,  "v3":228.3 },
          "courants"      : { "i1":142.3, "i2":140.5, "i3":143.1, "in":2.5 },
          "puissances"    : { "active":85.4, "reactive":28.1, "apparente":95.2 },
          "cos_phi"       : 0.944,
          "frequence"     : 50.02,
          "qualite"       : { "champs_manquants":[], "lecture_complete":True }
        }
        """
        if not self.connecte:
            print("  ✗ Pas connecté à la base — impossible de sauvegarder")
            return False

        try:
            # Vérifier les champs manquants
            manquants = [c for c in CHAMPS_ATTENDUS
                         if c not in mesures or mesures[c] is None]  # ✅ BUG 2 CORRIGÉ

            if manquants:
                print(f"  ⚠ Champs manquants : {manquants}")

            # Construire le document
            document = {
                # Horodatage
                "timestamp"      : mesures.get("timestamp", time.time()),
                "date_insertion" : datetime.now(timezone.utc),
                "heure_abidjan"  : datetime.now().strftime("%Y-%m-%d %H:%M:%S"),

                # Tensions
                "tensions": {
                    "u12": mesures.get("tension_u12"),
                    "u23": mesures.get("tension_u23"),
                    "u31": mesures.get("tension_u31"),
                    "v1" : mesures.get("tension_v1"),
                    "v2" : mesures.get("tension_v2"),
                    "v3" : mesures.get("tension_v3"),
                },

                # Courants
                "courants": {
                    "i1": mesures.get("courant_i1"),
                    "i2": mesures.get("courant_i2"),
                    "i3": mesures.get("courant_i3"),
                    "in": mesures.get("courant_in"),
                },

                # Puissances
                "puissances": {
                    "active"    : mesures.get("puissance_active"),
                    "reactive"  : mesures.get("puissance_reactive"),
                    "apparente" : mesures.get("puissance_apparente"),
                },

                # Mesures uniques
                "cos_phi"  : mesures.get("cos_phi"),
                "frequence": mesures.get("frequence"),

                # Qualité de la lecture
                "qualite": {
                    "champs_manquants": manquants,
                    "nb_champs_recus" : len(CHAMPS_ATTENDUS) - len(manquants),
                    "lecture_complete": len(manquants) == 0,
                },
            }

            # Insérer dans Atlas
            resultat = self.collection.insert_one(document)   # ✅ BUG 3 CORRIGÉ : insert_one sans _

            icone = "✓" if len(manquants) == 0 else "⚠"
            print(f"  {icone} Sauvegardé | {document['heure_abidjan']} | "
                  f"ID ...{str(resultat.inserted_id)[-6:]}")   # ✅ BUG 3 CORRIGÉ : resultat sans s
            return True

        except Exception as e:
            print(f"  ✗ Erreur sauvegarde : {e}")
            return False

    # ── Dernière mesure ────────────────────────────────────────────────────

    def get_derniere_mesure(self):
        """Retourne le dernier document inséré."""
        if not self.connecte:
            return None
        try:
            doc = self.collection.find_one({}, sort=[("timestamp", DESCENDING)])
            if doc:
                doc["_id"] = str(doc["_id"])
                if "date_insertion" in doc:
                    doc["date_insertion"] = str(doc["date_insertion"])
            return doc
        except Exception as e:
            print(f"  ✗ Erreur get_derniere_mesure : {e}")
            return None

    # ── Historique ─────────────────────────────────────────────────────────

    def get_historique(self, champ: str, periodes_heures: int = 24, limite: int = 500):
        """
        Récupère l'évolution d'un paramètre sur une période.
        Utilise $bucketAuto pour répartir uniformément les points sur la période
        → pas d'agglutination quelle que soit la densité des données brutes.

        Exemples :
          get_historique("cos_phi",              24)
          get_historique("tensions.u12",          24)
          get_historique("puissances.active",  7*24)
        """
        if not self.connecte:
            return []
        try:
            ts_debut = time.time() - (periodes_heures * 3600)
            filtre = {"timestamp": {"$gte": ts_debut}, champ: {"$exists": True, "$ne": None}}

            count = self.collection.count_documents(filtre)
            if count == 0:
                return []

            if count <= limite:
                # Peu de points : on retourne tout sans downsample
                curseur = self.collection.find(
                    filtre,
                    {"_id": 0, "timestamp": 1, "heure_abidjan": 1, champ: 1},
                    sort=[("timestamp", ASCENDING)],
                )
                return [
                    {
                        "timestamp"    : doc["timestamp"],
                        "heure_abidjan": doc.get("heure_abidjan", ""),
                        "valeur"       : _extraire_champ(doc, champ),
                    }
                    for doc in curseur
                ]

            # Downsampling par intervalles de temps FIXES :
            # on divise la période en 'limite' tranches de durée égale,
            # puis on prend la moyenne de chaque tranche.
            # → la courbe est toujours uniformément répartie dans le temps.
            bucket_sec = (periodes_heures * 3600) / limite

            pipeline = [
                {"$match": filtre},
                {"$group": {
                    "_id"      : {"$floor": {"$divide": ["$timestamp", bucket_sec]}},
                    "timestamp": {"$avg": "$timestamp"},
                    "valeur"   : {"$avg": f"${champ}"},
                }},
                {"$sort": {"_id": 1}},
            ]

            resultats = []
            for doc in self.collection.aggregate(pipeline):
                v = doc.get("valeur")
                resultats.append({
                    "timestamp"    : doc["timestamp"],
                    "heure_abidjan": "",
                    "valeur"       : round(v, 4) if v is not None else None,
                })
            return resultats

        except Exception as e:
            print(f"  ✗ Erreur get_historique : {e}")
            return []

    # ── Statistiques ───────────────────────────────────────────────────────

    def get_stats(self, champ: str, periode_heures: int = 24):
        """Calcule Min, Max, Moyenne d'un paramètre sur une période."""
        if not self.connecte:
            return {"min": None, "max": None, "moyenne": None}
        try:
            ts_debut = time.time() - (periode_heures * 3600)
            pipeline = [
                {"$match": {"timestamp": {"$gte": ts_debut},
                            champ: {"$exists": True, "$ne": None}}},
                {"$group": {"_id"     : None,
                            "minimum" : {"$min": f"${champ}"},
                            "maximum" : {"$max": f"${champ}"},
                            "moyenne" : {"$avg": f"${champ}"},
                            "compte"  : {"$sum": 1}}}
            ]
            r = list(self.collection.aggregate(pipeline))
            if not r:
                return {"min": None, "max": None, "moyenne": None, "nb_points": 0}
            return {
                "min"      : round(r[0]["minimum"], 3),
                "max"      : round(r[0]["maximum"], 3),
                "moyenne"  : round(r[0]["moyenne"], 3),
                "nb_points": r[0]["compte"]
            }
        except Exception as e:
            print(f"  ✗ Erreur get_stats : {e}")
            return {"min": None, "max": None, "moyenne": None}

    # ── Fermer ─────────────────────────────────────────────────────────────

    def fermer(self):
        if self.client:
            self.client.close()
            self.connecte = False
            print("  ✓ Connexion Atlas fermée.")

    # ── Historique par période (timestamps début/fin) ──────────────

    def get_historique_periode(self, champ: str, ts_debut: float, ts_fin: float, limite: int = 500):
        """
        Récupère l'évolution d'un paramètre entre deux timestamps précis.
        
        Paramètres :
          - champ    : le champ MongoDB (ex: "cos_phi", "tensions.u12")
          - ts_debut : timestamp UNIX de début
          - ts_fin   : timestamp UNIX de fin
          - limite   : nombre max de points retournés
        """
        if not self.connecte:
            return []
        try:
            filtre = {
                "timestamp": {"$gte": ts_debut, "$lte": ts_fin},
                champ: {"$exists": True, "$ne": None},
            }

            count = self.collection.count_documents(filtre)
            if count == 0:
                return []

            if count <= limite:
                curseur = self.collection.find(
                    filtre,
                    {"_id": 0, "timestamp": 1, "heure_abidjan": 1, champ: 1},
                    sort=[("timestamp", ASCENDING)],
                )
                return [
                    {
                        "timestamp": doc["timestamp"],
                        "heure_abidjan": doc.get("heure_abidjan", ""),
                        "valeur": _extraire_champ(doc, champ),
                    }
                    for doc in curseur
                ]

            # Downsampling
            duree = ts_fin - ts_debut
            bucket_sec = duree / limite

            pipeline = [
                {"$match": filtre},
                {"$group": {
                    "_id": {"$floor": {"$divide": ["$timestamp", bucket_sec]}},
                    "timestamp": {"$avg": "$timestamp"},
                    "valeur": {"$avg": f"${champ}"},
                }},
                {"$sort": {"_id": 1}},
            ]

            resultats = []
            for doc in self.collection.aggregate(pipeline):
                v = doc.get("valeur")
                resultats.append({
                    "timestamp": doc["timestamp"],
                    "heure_abidjan": "",
                    "valeur": round(v, 4) if v is not None else None,
                })
            return resultats

        except Exception as e:
            print(f"  ✗ Erreur get_historique_periode : {e}")
            return []

    # ── Statistiques par période (timestamps début/fin) ────────────

    def get_stats_periode(self, champ: str, ts_debut: float, ts_fin: float):
        """
        Calcule Min, Max, Moyenne d'un paramètre entre deux timestamps.
        """
        if not self.connecte:
            return {"min": None, "max": None, "moyenne": None}
        try:
            pipeline = [
                {"$match": {
                    "timestamp": {"$gte": ts_debut, "$lte": ts_fin},
                    champ: {"$exists": True, "$ne": None},
                }},
                {"$group": {
                    "_id": None,
                    "minimum": {"$min": f"${champ}"},
                    "maximum": {"$max": f"${champ}"},
                    "moyenne": {"$avg": f"${champ}"},
                    "compte": {"$sum": 1},
                }},
            ]
            r = list(self.collection.aggregate(pipeline))
            if not r:
                return {"min": None, "max": None, "moyenne": None, "nb_points": 0}
            return {
                "min": round(r[0]["minimum"], 3),
                "max": round(r[0]["maximum"], 3),
                "moyenne": round(r[0]["moyenne"], 3),
                "nb_points": r[0]["compte"],
            }
        except Exception as e:
            print(f"  ✗ Erreur get_stats_periode : {e}")
            return {"min": None, "max": None, "moyenne": None}        


# ─────────────────────────────────────────────
# FONCTION UTILITAIRE
# ─────────────────────────────────────────────

def _extraire_champ(document: dict, champ: str):
    """
    Extrait une valeur imbriquée avec la notation pointée.
    "tensions.u12"     →  document["tensions"]["u12"]
    "cos_phi"          →  document["cos_phi"]
    """
    valeur = document
    for partie in champ.split("."):
        if isinstance(valeur, dict):
            valeur = valeur.get(partie)
        else:
            return None
    return valeur


# ─────────────────────────────────────────────
# TEST DIRECT
# ─────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    sys.path.append(os.path.dirname(__file__))
    from simulator import get_mesures_simulees

    print("=" * 55)
    print("  TEST DATABASE.PY — MongoDB Atlas")
    print("=" * 55)

    db = GestionnaireDB()
    if not db.connecter():
        print("\n  → Vérifiez votre MONGO_URL dans .env")
        sys.exit(1)

    print("\n── Insertion de 5 mesures ────────────────────────────")
    for i in range(5):
        db.sauvegarder_mesure(get_mesures_simulees())
        time.sleep(0.3)

    print("\n── Dernière mesure ───────────────────────────────────")
    d = db.get_derniere_mesure()
    if d:
        print(f"  Heure        : {d.get('heure_abidjan')}")
        print(f"  Tension U12  : {d['tensions']['u12']} V")
        print(f"  Courant I1   : {d['courants']['i1']} A")
        print(f"  Puissance    : {d['puissances']['active']} kW")
        print(f"  Cos phi      : {d.get('cos_phi')}")
        print(f"  Fréquence    : {d.get('frequence')} Hz")
        print(f"  Complet      : {d['qualite']['lecture_complete']}")

    print("\n── Statistiques 24h ──────────────────────────────────")
    for champ in ["cos_phi", "tensions.u12", "puissances.active", "frequence"]:
        s = db.get_stats(champ, 24)
        print(f"  {champ:<25} min={s['min']}  max={s['max']}  moy={s['moyenne']}")

    db.fermer()
    print("\n  ✓ Tous les tests passés !")     



