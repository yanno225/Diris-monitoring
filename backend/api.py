

from fastapi import FastAPI , WebSocket , WebSocketDisconnect , HTTPException

from fastapi.middleware.cors import CORSMiddleware

from fastapi.staticfiles import StaticFiles

from fastapi.responses import FileResponse

from contextlib import asynccontextmanager
import asyncio
import json 
import time 
import os 
import sys


sys.path.append(os.path.dirname(__file__))
 
from database  import GestionnaireDB

try:
    from simulator import get_mesures_simulees
except ImportError:
    def get_mesures_simulees():
        return None
from dotenv    import load_dotenv

load_dotenv()

# configuration 

SIMULATEUR = os.getenv("SIMULATEUR", "false").lower() == "true"

INTERVALLE_LECTURE = 10


db = GestionnaireDB()
clients_ws = []
derniere_mesure = {}


# tache lecture du compteur 

async def tache_lecture_compteur():
    """
    Sur le PC bureau : on ne lit plus le compteur.
    Le Raspberry Pi s'en charge.
    On lit juste Atlas pour mettre à jour les clients WebSocket.
    """
    global derniere_mesure

    print(f"\n  ▶ Mode BUREAU — lecture depuis Atlas uniquement")
    print(f"  ▶ Le Raspberry Pi collecte les données sur le terrain")
    print(f"  ▶ Intervalle de vérification : {INTERVALLE_LECTURE}s\n")

    while True:
        try:
            mesure = db.get_derniere_mesure()

            if mesure and mesure != derniere_mesure:
                derniere_mesure = mesure

                if clients_ws:
                    message = json.dumps({
                        "type": "mesure",
                        "donnees": mesure
                    })

                    clients_a_supprimer = []
                    for client in list(clients_ws):
                        try:
                            await client.send_text(message)
                        except:
                            clients_a_supprimer.append(client)
                    for client in clients_a_supprimer:
                        if client in clients_ws:
                            clients_ws.remove(client)

        except Exception as e:
            print(f"  ✗ Erreur : {e}")

        await asyncio.sleep(INTERVALLE_LECTURE)


#  demarrage et arret de l'app 
async def lifespan(app : FastAPI):
    """
    Ce bloc s'exécute au démarrage et à l'arrêt du serveur.
    C'est ici qu'on connecte MongoDB et qu'on lance la tâche de lecture.
    """

    print("\n" + "=" * 50)
    print("Démarrage du serveur")
    print("=" * 50)

    if not db.connecter():
        print("  ✗ ERREUR CRITIQUE : impossible de se connecter à Atlas")
        print("  → Vérifiez votre .env et votre connexion internet")

    else :

        asyncio.create_task(tache_lecture_compteur()) 

    yield

    print("\n  Arrêt du serveur...")
    db.fermer()
    print("  ✓ Serveur arrêté proprement.")



# creation app fastapi 

app = FastAPI(
    title = "API Diris A40 - Econersys Afrique" ,
    description = "API temps réel pour la surveillance électrique",
    version = "1.0.0" ,
    lifespan = lifespan 
)

app.add_middleware(
    CORSMiddleware,
    allow_origins = ["*"],
    allow_credentials = True,
    allow_methods = ["*"],
    allow_headers = ["*"],
)

# routes HTTP 

@app.get("/")
async def acceuil():
    """
    Route d'accueil — vérifie que l'API fonctionne.
    Accessible sur : http://localhost:8000/
    """
    return {
        "application" : "Econersys — Monitoring Diris A40",
        "statut"      : "en ligne",
        "mode"        : "simulateur" if SIMULATEUR else "compteur réel",
        "mongodb"     : "connecté" if db.connecte else "déconnecté",
        "clients_ws"  : len(clients_ws)
    }

@app.get("/mesure/live")
async def get_mesure_live():
    """
    Retourne la dernière mesure lue.
 
    Exemple de réponse :
    {
      "tensions"  : { "u12": 395.1, ... },
      "courants"  : { "i1": 142.3,  ... },
      "puissances": { "active": 85.4, ... },
      "cos_phi"   : 0.944,
      "frequence" : 50.02
    }
 
    Accessible sur : http://localhost:8000/mesure/live
    """

    if not db.connecte:
        raise HTTPException(status_code=503, detail="Base de données non connectée")
 
    mesure = db.get_derniere_mesure()

    if not mesure:
        if derniere_mesure:
            return _serialiser_mesures(derniere_mesure)
        else:
            raise HTTPException(status_code=404, detail="Aucune mesure disponible")

    return mesure 

@app.get("/historique/{champ}")
async def get_historique( champ:str , heures:int = 24 , limite: int = 500):
    """
    Retourne l'évolution d'un paramètre sur une période.
 
    Paramètres URL :
    - champ  : le paramètre (ex: cos_phi, tensions.u12, puissances.active)
    - heures : nombre d'heures (défaut: 24)
    - limite : nombre max de points (défaut: 500)
 
    Exemples d'URLs :
      /historique/cos_phi
      /historique/tensions.u12?heures=48
      /historique/puissances.active?heures=168&limite=1000
    """
    if not db.connecte:
        raise HTTPException(status_code=503, detail="Base de données non connectée")
 
    # Remplacer le point dans l'URL par un vrai point
    # (les navigateurs encodent parfois les points différemment)
    champ = champ.replace("%2E", ".")
 
    donnees = db.get_historique(champ, periodes_heures=heures, limite=limite)
 
    return {
        "champ"   : champ,
        "heures"  : heures,
        "nb_points": len(donnees),
        "donnees" : donnees
    }
 
 
@app.get("/stats/{champ}")
async def get_stats(champ: str, heures: int = 24):
    """
    Retourne Min, Max et Moyenne d'un paramètre.
 
    Exemples d'URLs :
      /stats/cos_phi
      /stats/tensions.u12?heures=48
      /stats/puissances.active
    """
    if not db.connecte:
        raise HTTPException(status_code=503, detail="Base de données non connectée")
 
    champ = champ.replace("%2E", ".")
    stats = db.get_stats(champ, periode_heures=heures)
 
    return {
        "champ" : champ,
        "heures": heures,
        **stats   # Décompacter le dict : min, max, moyenne, nb_points
    }
 
 
# ─────────────────────────────────────────────
# WEBSOCKET — Temps réel
# ─────────────────────────────────────────────
 
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Point de connexion WebSocket.
 
    Le frontend se connecte une seule fois à ws://localhost:8000/ws
    et reçoit automatiquement chaque nouvelle mesure sans avoir
    à redemander.
 
    C'est comme un abonnement : une fois connecté, les données
    arrivent toutes seules toutes les N secondes.
    """
    # Accepter la connexion du client
    await websocket.accept()
    clients_ws.append(websocket)
    print(f"  ✓ Client WebSocket connecté ({len(clients_ws)} total)")
 
    try:
        # Envoyer immédiatement la dernière mesure dès la connexion
        if derniere_mesure:
            await websocket.send_text(json.dumps({
                "type"   : "mesure",
                "donnees": _serialiser_mesures(derniere_mesure)
            }))
 
        # Garder la connexion ouverte et attendre les messages du client
        # (le client peut envoyer "ping" pour vérifier la connexion)
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
 
    except WebSocketDisconnect:
        # Le client a fermé la page ou perdu la connexion
        if websocket in clients_ws:
            clients_ws.remove(websocket)
        print(f"  Client WebSocket déconnecté ({len(clients_ws)} restants)")
 
    except Exception as e:
        if websocket in clients_ws:
            clients_ws.remove(websocket)
        print(f"  ✗ Erreur WebSocket : {e}")
 
 
# ─────────────────────────────────────────────
# FONCTION UTILITAIRE
# ─────────────────────────────────────────────
 
def _serialiser_mesures(mesures: dict) -> dict:
    """
    Convertit le dictionnaire brut du simulateur/compteur
    en format propre pour le JSON de l'API.
 
    Le simulateur renvoie : { "tension_u12": 395.1, "courant_i1": 142.3, ... }
    On renvoie au frontend : { "tensions": { "u12": 395.1 }, "courants": { "i1": 142.3 }, ... }
    """
    return {
        "timestamp"    : mesures.get("timestamp", time.time()),
        "tensions"     : {
            "u12": mesures.get("tension_u12"),
            "u23": mesures.get("tension_u23"),
            "u31": mesures.get("tension_u31"),
            "v1" : mesures.get("tension_v1"),
            "v2" : mesures.get("tension_v2"),
            "v3" : mesures.get("tension_v3"),
        },
        "courants"     : {
            "i1": mesures.get("courant_i1"),
            "i2": mesures.get("courant_i2"),
            "i3": mesures.get("courant_i3"),
            "in": mesures.get("courant_in"),
        },
        "puissances"   : {
            "active"    : mesures.get("puissance_active"),
            "reactive"  : mesures.get("puissance_reactive"),
            "apparente" : mesures.get("puissance_apparente"),
        },
        "cos_phi"      : mesures.get("cos_phi"),
        "frequence"    : mesures.get("frequence"),
    }
 
 
# ─────────────────────────────────────────────
# LANCEMENT DU SERVEUR
# ─────────────────────────────────────────────
 
if __name__ == "__main__":
    import uvicorn
    print("\n  Lancement du serveur sur http://localhost:8000")
    print("  Documentation API : http://localhost:8000/docs")
    print("  Arrêt : Ctrl+C\n")
    uvicorn.run("api:app", host="0.0.0.0", port=8080, reload=True)





