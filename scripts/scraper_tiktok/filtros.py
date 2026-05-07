import re
from hashtags import CIUDADES_COLOMBIA

BANDERA_CO = "\U0001f1e8\U0001f1f4"  # 🇨🇴

NICHOS_KEYWORDS = {
    "hair_care":       ["cabello", "pelo", "rizo", "capilar", "shampoo", "mascarilla", "afro", "ondulad"],
    "grwm":            ["grwm", "arreglando", "rutina", "preparando"],
    "makeup":          ["makeup", "maquill", "labial", "sombra", "delineador"],
    "skincare":        ["skincare", "piel", "serum", "hidratante", "acne"],
    "gym":             ["gym", "fitness", "ejercicio", "entrena", "fit"],
    "lifestyle":       ["lifestyle", "vlog", "diaria", "dia a dia"],
    "dance":           ["baile", "dance", "bailar", "coreografia"],
    "ugc":             ["ugc", "creador", "contenido"],
    "moda":            ["outfit", "moda", "fashion", "estilo", "ropa"],
    "mamas":           ["mama", "madre", "hijo", "bebe", "maternidad"],
    "emprendedoras":   ["emprendedor", "negocio", "marca", "empresa"],
}


def calcular_colombia_score(bio: str, hashtag_origen: str = "") -> tuple[int, list]:
    """Devuelve (score 0-100, lista de señales detectadas)."""
    bio_lower = (bio or "").lower()
    score = 0
    signals = []

    if BANDERA_CO in (bio or ""):
        score += 30
        signals.append("bandera_co")

    for ciudad in CIUDADES_COLOMBIA:
        if ciudad in bio_lower:
            score += 25
            signals.append(f"ciudad_bio:{ciudad}")
            break

    if re.search(r"#colombia(na)?", bio_lower):
        score += 15
        signals.append("hashtag_colombia_bio")

    for ciudad in CIUDADES_COLOMBIA:
        if re.search(rf"#{ciudad.replace(' ', '')}", bio_lower):
            score += 15
            signals.append(f"hashtag_ciudad_bio:{ciudad}")
            break

    palabras_es = ["de", "en", "la", "el", "con", "para", "por", "una", "que", "mi"]
    if sum(1 for p in palabras_es if f" {p} " in f" {bio_lower} ") >= 2:
        score += 10
        signals.append("idioma_es")

    if hashtag_origen in CIUDADES_COLOMBIA:
        score += 5
        signals.append(f"hashtag_origen_ciudad:{hashtag_origen}")

    return min(score, 100), signals


def detectar_nichos(bio: str, hashtags_video: list = None) -> list:
    texto = ((bio or "") + " " + " ".join(hashtags_video or [])).lower()
    nichos = []
    for nicho, keywords in NICHOS_KEYWORDS.items():
        if any(kw in texto for kw in keywords):
            nichos.append(nicho)
    return nichos


def calcular_tier(seguidores: int) -> str:
    if seguidores >= 100_000:
        return "Macro"
    if seguidores >= 10_000:
        return "Micro"
    return "Nano"


def aplica_filtros(perfil: dict) -> tuple[bool, str | None]:
    if not perfil.get("seguidores") or perfil["seguidores"] < 2000:
        return False, "seguidores_insuficientes"
    if not perfil.get("vistas_promedio") or perfil["vistas_promedio"] < 2000:
        return False, "vistas_insuficientes"
    if perfil.get("colombia_score", 0) < 20:
        return False, "no_colombia"
    return True, None
