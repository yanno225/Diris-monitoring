"""
Econersys Afrique — Création du premier administrateur
Lance ce script UNE SEULE FOIS pour créer le compte admin.

Usage :
    python creer_admin.py
"""

import sys
import os
sys.path.append(os.path.dirname(__file__))

from auth import creer_utilisateur, _get_collection_utilisateurs
from dotenv import load_dotenv

load_dotenv()

print("=" * 55)
print("  Econersys — Création d'un utilisateur")
print("=" * 55)

# Demander les informations
print()
nom           = input("  Nom complet     : ")
email         = input("  Email           : ")
mot_de_passe  = input("  Mot de passe    : ")

print()
print("  Choisir le rôle :")
print("    1 — Opérateur (visualisation uniquement)")
print("    2 — Administrateur (visualisation + téléchargement Excel)")
choix_role = input("  Votre choix (1 ou 2) : ")

role = "admin" if choix_role == "2" else "operateur"

print()
print(f"  Création de l'utilisateur...")
print(f"    Nom    : {nom}")
print(f"    Email  : {email}")
print(f"    Rôle   : {role}")
print()

try:
    resultat = creer_utilisateur(email, mot_de_passe, nom, role)
    
    if resultat is None:
        print(f"  ✗ L'email '{email}' existe déjà dans la base !")
        sys.exit(1)
    
    print(f"  ✓ Utilisateur créé avec succès !")
    print(f"    ID    : {resultat['id']}")
    print(f"    Email : {resultat['email']}")
    print(f"    Rôle  : {resultat['role']}")
    
except Exception as e:
    print(f"  ✗ Erreur : {e}")
    sys.exit(1)

# Afficher le nombre total d'utilisateurs
try:
    collection = _get_collection_utilisateurs()
    total = collection.count_documents({})
    print(f"\n  Total utilisateurs dans la base : {total}")
except:
    pass

print("\n  ✓ Terminé !")