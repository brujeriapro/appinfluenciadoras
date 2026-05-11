"""Cliente Supabase — reutiliza las mismas credenciales del scraper de TikTok."""
import os
import sys

# Apuntar al cliente del scraper de TikTok para no duplicar credenciales
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scraper_tiktok'))
from supabase_client import insertar_candidata, existe_candidata, get_candidatas


def guardar_candidata_facebook(perfil: dict) -> bool:
    """Convierte el perfil de Facebook al formato de candidatas_influencer y lo guarda."""
    handle = perfil.get("handle", "")
    if not handle:
        return False

    # Usar facebook_handle como identificador único — lo guardamos en tiktok_handle
    # con prefijo "fb:" para distinguirlo de TikTok
    fb_id = f"fb:{handle}"

    if existe_candidata(fb_id):
        return False  # ya existe

    url = perfil.get("profile_url", "")
    bio = perfil.get("bio", "")
    # Incluir URL de Facebook en la bio para referencia
    bio_completa = f"[FB: {url}] {bio}".strip() if url else bio

    candidata = {
        "tiktok_handle": fb_id,
        "nombre_display": perfil.get("nombre_display", handle),
        "bio": bio_completa[:500],
        "seguidores": perfil.get("seguidores", 0),
        "colombia_score": perfil.get("colombia_score", 0),
        "colombia_signals": perfil.get("colombia_signals", []),
        "nichos": perfil.get("nichos", []),
        "tier_estimado": perfil.get("tier_estimado", "Nano"),
        "plataforma": "facebook",
        "status": "candidata",
    }

    return insertar_candidata(candidata)
