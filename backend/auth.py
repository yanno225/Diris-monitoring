"""
Econersys Afrique — Module d'authentification
Gère les utilisateurs, mots de passe hashés, tokens JWT et rôles.

Rôles :
  - "operateur"  : accès au dashboard, visualisation des données
  - "admin"      : accès complet + téléchargement Excel
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pymongo import MongoClient
from dotenv import load_dotenv
import os

load_dotenv()

# ─────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────

JWT_SECRET     = os.getenv("JWT_SECRET", "econersys_secret_key_2026_change_moi")
JWT_ALGORITHM  = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRATION = int(os.getenv("JWT_EXPIRATION_HEURES", "24"))

MONGO_URL  = os.getenv("MONGO_URL")
NOM_BASE   = os.getenv("NOM_BASE")

# ─────────────────────────────────────────────
# HASHAGE DES MOTS DE PASSE
# ─────────────────────────────────────────────

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hasher_mot_de_passe(mot_de_passe: str) -> str:
    """Hash un mot de passe en clair avec bcrypt."""
    return pwd_context.hash(mot_de_passe)

def verifier_mot_de_passe(mot_de_passe: str, mot_de_passe_hash: str) -> bool:
    """Vérifie qu'un mot de passe en clair correspond au hash."""
    return pwd_context.verify(mot_de_passe, mot_de_passe_hash)

# ─────────────────────────────────────────────
# TOKENS JWT
# ─────────────────────────────────────────────

def creer_token(donnees: dict) -> str:
    """
    Crée un token JWT contenant les données de l'utilisateur.
    Le token expire après JWT_EXPIRATION heures.
    """
    a_encoder = donnees.copy()
    expiration = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION)
    a_encoder.update({"exp": expiration})
    token = jwt.encode(a_encoder, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token

def decoder_token(token: str) -> Optional[dict]:
    """
    Décode un token JWT et retourne les données.
    Retourne None si le token est invalide ou expiré.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        return None

# ─────────────────────────────────────────────
# COLLECTION UTILISATEURS (MongoDB)
# ─────────────────────────────────────────────

def _get_collection_utilisateurs():
    """Retourne la collection 'utilisateurs' de MongoDB."""
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=10000)
    base = client[NOM_BASE]
    return base["utilisateurs"]

def creer_utilisateur(email: str, mot_de_passe: str, nom: str, role: str = "operateur") -> dict:
    """
    Crée un nouvel utilisateur dans MongoDB.
    
    Paramètres :
      - email       : identifiant unique
      - mot_de_passe: en clair (sera hashé)
      - nom         : nom complet
      - role        : "operateur" ou "admin"
    
    Retourne le document créé ou None si l'email existe déjà.
    """
    collection = _get_collection_utilisateurs()
    
    # Vérifier si l'email existe déjà
    if collection.find_one({"email": email.lower()}):
        return None
    
    # Valider le rôle
    if role not in ["operateur", "admin"]:
        raise ValueError("Le rôle doit être 'operateur' ou 'admin'")
    
    document = {
        "email"          : email.lower(),
        "mot_de_passe"   : hasher_mot_de_passe(mot_de_passe),
        "nom"            : nom,
        "role"           : role,
        "date_creation"  : datetime.now(timezone.utc),
        "actif"          : True,
    }
    
    resultat = collection.insert_one(document)
    document["_id"] = str(resultat.inserted_id)
    del document["mot_de_passe"]  # Ne jamais retourner le hash
    return document

def authentifier_utilisateur(email: str, mot_de_passe: str) -> Optional[dict]:
    """
    Vérifie les identifiants d'un utilisateur.
    Retourne les infos de l'utilisateur si valide, None sinon.
    """
    collection = _get_collection_utilisateurs()
    utilisateur = collection.find_one({"email": email.lower(), "actif": True})
    
    if not utilisateur:
        return None
    
    if not verifier_mot_de_passe(mot_de_passe, utilisateur["mot_de_passe"]):
        return None
    
    return {
        "id"    : str(utilisateur["_id"]),
        "email" : utilisateur["email"],
        "nom"   : utilisateur["nom"],
        "role"  : utilisateur["role"],
    }

def get_utilisateur_par_email(email: str) -> Optional[dict]:
    """Retourne un utilisateur par son email (sans le mot de passe)."""
    collection = _get_collection_utilisateurs()
    utilisateur = collection.find_one({"email": email.lower()})
    
    if not utilisateur:
        return None
    
    return {
        "id"    : str(utilisateur["_id"]),
        "email" : utilisateur["email"],
        "nom"   : utilisateur["nom"],
        "role"  : utilisateur["role"],
        "actif" : utilisateur["actif"],
    }

# ─────────────────────────────────────────────
# DÉPENDANCES FASTAPI (protection des routes)
# ─────────────────────────────────────────────

security = HTTPBearer()

async def get_utilisateur_courant(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    Dépendance FastAPI : extrait et vérifie le token JWT.
    Retourne les infos de l'utilisateur connecté.
    
    Utilisation dans une route :
        @app.get("/ma-route")
        async def ma_route(utilisateur = Depends(get_utilisateur_courant)):
            print(utilisateur["role"])  # "operateur" ou "admin"
    """
    token = credentials.credentials
    payload = decoder_token(token)
    
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide ou expiré",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    email = payload.get("email")
    if email is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide",
        )
    
    utilisateur = get_utilisateur_par_email(email)
    if utilisateur is None or not utilisateur.get("actif", False):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Utilisateur introuvable ou désactivé",
        )
    
    return utilisateur

async def exiger_admin(utilisateur: dict = Depends(get_utilisateur_courant)) -> dict:
    """
    Dépendance FastAPI : vérifie que l'utilisateur est admin.
    
    Utilisation :
        @app.get("/route-admin")
        async def route_admin(utilisateur = Depends(exiger_admin)):
            # Seuls les admins arrivent ici
    """
    if utilisateur["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux administrateurs",
        )
    return utilisateur