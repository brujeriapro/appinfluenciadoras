import re
from hashtags import CIUDADES_COLOMBIA

BANDERA_CO = "\U0001f1e8\U0001f1f4"  # 🇨🇴

NICHOS_KEYWORDS = {
    "hair_care":     ["cabello", "pelo", "rizo", "capilar", "shampoo", "mascarilla", "afro", "ondulad"],
    "grwm":          ["grwm", "arreglando", "rutina", "preparando"],
    "makeup":        ["makeup", "maquill", "labial", "sombra"],
    "skincare":      ["skincare", "piel", "serum", "hidratante"],
    "moda":          ["outfit", "moda", "fashion", "estilo", "ropa"],
    "mamas":         ["mama", "madre", "hijo", "bebe", "maternidad"],
    "emprendedoras": ["emprendedor", "negocio", "marca", "empresa"],
}


def calcular_colombia_score(bio: str, ciudad_detectada: str = "") -> tuple:
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

    palabras_es = ["de", "en", "la", "el", "con", "para", "por", "una", "que", "mi"]
    if sum(1 for p in palabras_es if f" {p} " in f" {bio_lower} ") >= 2:
        score += 10
        signals.append("idioma_es")

    if ciudad_detectada:
        score += 5
        signals.append(f"busqueda_ciudad:{ciudad_detectada}")

    return min(score, 100), signals


def detectar_nichos(bio: str) -> list:
    texto = (bio or "").lower()
    return [n for n, kws in NICHOS_KEYWORDS.items() if any(kw in texto for kw in kws)]


def calcular_tier(seguidores: int) -> str:
    if seguidores >= 100_000:
        return "Macro"
    if seguidores >= 10_000:
        return "Micro"
    return "Nano"


def aplica_filtros(perfil: dict) -> tuple:
    if not perfil.get("seguidores") or perfil["seguidores"] < 1000:
        return False, "seguidores_insuficientes"
    if perfil.get("colombia_score", 0) < 10:
        return False, "no_colombia"
    return True, None
