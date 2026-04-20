from pymodbus.client import ModbusSerialClient
from pymodbus.exceptions import ModbusException
import time
import os
from dotenv import load_dotenv

load_dotenv()



PORT     = os.getenv("PORT_SERIE", "COM14")
BAUDRATE = 19200    
PARITY   = "E"      
STOPBITS = 1
BYTESIZE = 8
SLAVE_ID = 1        
TIMEOUT  = 3        



REGISTRES = {
    "tension_u12"        : (50514, 100,  "V"),
    "tension_u23"        : (50516, 100,  "V"),
    "tension_u31"        : (50518, 100,  "V"),
    "tension_v1"         : (50520, 100,  "V"),
    "tension_v2"         : (50522, 100,  "V"),
    "tension_v3"         : (50524, 100,  "V"),
    "frequence"          : (50526, 100,  "Hz"),
    "courant_i1"         : (50528, 1000, "A"),
    "courant_i2"         : (50530, 1000, "A"),
    "courant_i3"         : (50532, 1000, "A"),
    "courant_in"         : (50534, 1000, "A"),
    "puissance_active"   : (50536, 100,  "kW"),
    "puissance_reactive" : (50538, 100,  "kVAR"),
    "puissance_apparente": (50540, 100,  "kVA"),
    "cos_phi"            : (50542, 1000, ""),
    "energie_active"     : (50770, 100,  "kWh"),
}


def creer_client():
    """
    Crée et connecte un client Modbus RTU.
    Retourne le client si succès, None si échec.
    """
    print(f"  Connexion Modbus RTU → {PORT} ({BAUDRATE} bauds)...")

    client = ModbusSerialClient(
        port     = PORT,
        baudrate = BAUDRATE,
        parity   = PARITY,
        stopbits = STOPBITS,
        bytesize = BYTESIZE,
        timeout  = TIMEOUT
    )

    ok = client.connect()

    if not ok:
        print(f"  ✗ Impossible de se connecter au port {PORT}")
        print("  → Vérifiez que le convertisseur USB-RS485 est branché")
        print("  → Vérifiez le numéro de port dans le Gestionnaire de périphériques")
        return None

    print(f"  ✓ Connecté au port {PORT} !")
    return client



def convertion_32bits(registre_haut, registre_bas, est_signe=False):
    """
    Assemble 2 registres 16 bits en un entier 32 bits.
    Gère les valeurs signées (puissances, cos phi).
    """
    valeur_brute = (registre_haut << 16) | registre_bas

    if est_signe and (valeur_brute >= 0x80000000):
        valeur_brute -= 0x100000000

    return valeur_brute




def lire_toutes_mesures(client):
    """
    Lit tous les registres du Diris A40.
    - Bloc 1 (C550) : tensions + fréquence
    - Bloc 2 (C550) : courants + puissances + cos_phi
    - Bloc 3 (C650) : énergie active +
    Retourne un dictionnaire avec toutes les mesures.
    Retourne None en cas d'erreur.
    """
    mesures = {}
    mesures["timestamp"] = time.time()

    try:
        # Le Diris A40 limite le nombre de registres par requête.
        # On découpe en 2 blocs de 14 registres max.
        BLOC1_DEBUT = 50514  # tensions + fréquence  (50514..50527 → 14 regs)
        BLOC2_DEBUT = 50528  # courants + puissances + cos_phi (50528..50543 → 16 regs)

        rep1 = client.read_holding_registers(address=BLOC1_DEBUT, count=14, slave=SLAVE_ID)
        if rep1.isError():
            print(f"  ✗ Erreur bloc 1 (tensions) : {rep1}")
            return None

        rep2 = client.read_holding_registers(address=BLOC2_DEBUT, count=16, slave=SLAVE_ID)
        if rep2.isError():
            print(f"  ✗ Erreur bloc 2 (courants/puissances) : {rep2}")
            return None

        regs1 = rep1.registers  # indices 0..13  → adresses 50514..50527
        regs2 = rep2.registers  # indices 0..15  → adresses 50528..50543

        def decode(adresse, diviseur, est_signe=False):
            if adresse < BLOC2_DEBUT:
                offset = adresse - BLOC1_DEBUT
                regs = regs1
            else:
                offset = adresse - BLOC2_DEBUT
                regs = regs2
            if offset < 0 or offset + 1 >= len(regs):
                return None
            valeur_brute = convertion_32bits(regs[offset], regs[offset + 1], est_signe)
            return round(valeur_brute / diviseur, 3)

        # Tensions (non signées)
        mesures["tension_u12"]         = decode(50514, 100)
        mesures["tension_u23"]         = decode(50516, 100)
        mesures["tension_u31"]         = decode(50518, 100)
        mesures["tension_v1"]          = decode(50520, 100)
        mesures["tension_v2"]          = decode(50522, 100)
        mesures["tension_v3"]          = decode(50524, 100)

        # Fréquence (non signée)
        mesures["frequence"]           = decode(50526, 100)

        # Courants (non signés, en mA → A)
        mesures["courant_i1"]          = decode(50528, 1000)
        mesures["courant_i2"]          = decode(50530, 1000)
        mesures["courant_i3"]          = decode(50532, 1000)
        mesures["courant_in"]          = decode(50534, 1000)

        # Puissances (signées)
        mesures["puissance_active"]    = decode(50536, 100,  est_signe=True)
        mesures["puissance_reactive"]  = decode(50538, 100,  est_signe=True)
        mesures["puissance_apparente"] = decode(50540, 100)

        # Facteur de puissance (signé)
        mesures["cos_phi"]             = decode(50542, 1000, est_signe=True)

        # ─── Bloc 3 : Énergie active + (table C650, adresse 50770) ───
        BLOC3_DEBUT = 50770
        rep3 = client.read_holding_registers(address=BLOC3_DEBUT, count=2, slave=SLAVE_ID)
        if rep3.isError():
            print(f"  ⚠ Erreur bloc 3 (énergie) : {rep3}")
            mesures["energie_active"] = None
        else:
            regs3 = rep3.registers
            valeur_brute = convertion_32bits(regs3[0], regs3[1], est_signe=False)
            mesures["energie_active"] = round(valeur_brute / 100, 3)

        return mesures

    except Exception as e:
        print(f"  ✗ Exception lors de la lecture : {e}")
        return None




def afficher_mesures(mesures):
    """Affiche toutes les mesures dans le terminal."""
    print(f"  {'Paramètre':<25} {'Valeur':>12}  Unité")
    print("  " + "─" * 45)

    params = [
        ("Tension U12",          "tension_u12",          "V"),
        ("Tension U23",          "tension_u23",          "V"),
        ("Tension U31",          "tension_u31",          "V"),
        ("Tension V1",           "tension_v1",           "V"),
        ("Tension V2",           "tension_v2",           "V"),
        ("Tension V3",           "tension_v3",           "V"),
        ("Fréquence",            "frequence",            "Hz"),
        ("Courant I1",           "courant_i1",           "A"),
        ("Courant I2",           "courant_i2",           "A"),
        ("Courant I3",           "courant_i3",           "A"),
        ("Courant In",           "courant_in",           "A"),
        ("Puissance active",     "puissance_active",     "kW"),
        ("Puissance réactive",   "puissance_reactive",   "kVAR"),
        ("Puissance apparente",  "puissance_apparente",  "kVA"),
        ("Facteur de puissance", "cos_phi",              ""),
        ("Énergie active",       "energie_active",       "kWh"),
    ]

    for label, cle, unite in params:
        valeur = mesures.get(cle)
        if valeur is not None:
            print(f"  {label:<25} {valeur:>12.3f}  {unite}")
        else:
            print(f"  {label:<25} {'N/A':>12}  {unite}")



def demarrer_lecture(intervalle_secondes=5):
    """
    Boucle de lecture infinie pour tester le script directement.
    En production, c'est api.py qui appelle lire_toutes_mesures().
    """
    print("=" * 55)
    print("  Econersys Afrique — Monitoring Socomec Diris A40")
    print("  MODE : Modbus RTU (USB-RS485)")
    print("=" * 55)
    print(f"  Port série  : {PORT}")
    print(f"  Vitesse     : {BAUDRATE} bauds")
    print(f"  Parité      : {PARITY} (Even)")
    print(f"  Stop bits   : {STOPBITS}")
    print(f"  Adresse     : {SLAVE_ID}")
    print("=" * 55)

    # Créer le client
    client = creer_client()

    if client is None:
        print("  ✗ Arrêt — connexion impossible.")
        return

    print("\n  ✓ Connexion réussie ! Début des lectures...\n")

    try:
        compteur = 0
        while True:
            compteur += 1
            print(f"── Lecture #{compteur} " + "─" * 30)

            mesures = lire_toutes_mesures(client)

            if mesures:
                afficher_mesures(mesures)
            else:
                print("  ✗ Aucune mesure — tentative de reconnexion...")
                client.close()
                client = creer_client()
                if client is None:
                    print("  ✗ Reconnexion impossible, arrêt.")
                    break

            print(f"\n  [Prochaine lecture dans {intervalle_secondes}s...]")
            time.sleep(intervalle_secondes)

    except KeyboardInterrupt:
        print("\n\n  ⏹ Arrêt demandé (Ctrl+C)")

    finally:
        client.close()
        print("  ✓ Connexion fermée proprement.")



if __name__ == "__main__":
    demarrer_lecture(intervalle_secondes=5)

                

    


