"""
nivel_bruja.py — Asignar nivel Bruja según score_total acumulado

Niveles:
  Bruja Semilla      (0–20)
  Bruja Aprendiz     (21–50)
  Bruja Practicante  (51–100)
  Bruja Experta      (101–200)
  Gran Bruja         (201+)
"""


def calcular_nivel(score_total: float, config: dict) -> str:
    """
    Retorna el nivel Bruja correspondiente al score_total acumulado.

    Args:
        score_total: suma de todos los scores de contenido de la influencer
        config: dict con clave 'niveles_bruja'

    Returns:
        Nombre del nivel como string
    """
    niveles = config.get("niveles_bruja", {})

    # Ordenar niveles por min ascendente para iterar correctamente
    niveles_ordenados = sorted(niveles.items(), key=lambda kv: kv[1]["min"])

    nivel_asignado = None
    for nombre, rango in niveles_ordenados:
        min_score = rango["min"]
        max_score = rango["max"]

        if max_score is None:
            # Nivel más alto — sin techo
            if score_total >= min_score:
                nivel_asignado = nombre
        else:
            if min_score <= score_total <= max_score:
                nivel_asignado = nombre
                break

    return nivel_asignado or "Bruja Semilla"


def siguiente_nivel(nivel_actual: str, config: dict) -> tuple[str | None, float | None]:
    """
    Retorna (nombre_siguiente_nivel, score_necesario) o (None, None) si ya es Gran Bruja.

    Útil para mensajes motivacionales en recordatorios.
    """
    niveles = config.get("niveles_bruja", {})
    niveles_ordenados = sorted(niveles.items(), key=lambda kv: kv[1]["min"])
    nombres = [n for n, _ in niveles_ordenados]

    if nivel_actual not in nombres:
        return None, None

    idx = nombres.index(nivel_actual)
    if idx >= len(nombres) - 1:
        return None, None  # Ya es Gran Bruja

    siguiente = nombres[idx + 1]
    score_min = niveles[siguiente]["min"]
    return siguiente, float(score_min)


def descripcion_nivel(nivel: str) -> str:
    """Retorna una descripción motivacional del nivel para usar en emails."""
    descripciones = {
        "Bruja Semilla": "Estás dando tus primeros pasos en el mundo de la magia capilar. ✨",
        "Bruja Aprendiz": "Ya conoces los secretos básicos del cabello. ¡Sigue conjurando! 🌙",
        "Bruja Practicante": "Tu magia capilar está floreciendo. La comunidad te nota. 🔮",
        "Bruja Experta": "Eres una referente del cabello en tu comunidad. ¡Tu influencia es real! ⭐",
        "Gran Bruja": "Eres la máxima hechicera capilar. ¡Tu voz mueve comunidades! 👑",
    }
    return descripciones.get(nivel, "Continúa creando contenido para subir de nivel. ✨")
