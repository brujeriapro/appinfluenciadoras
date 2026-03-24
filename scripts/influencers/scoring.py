"""
scoring.py — Fórmula de score por pieza de contenido

Score 0-100 basado en cuatro componentes ponderados:
  - Reach ratio (vistas / seguidores):        peso 40
  - Engagement rate del contenido (likes/vistas): peso 25
  - Save rate (guardados / vistas):           peso 20
  - Calificación del equipo (1-5 → 0-100):   peso 15

Se aplica un multiplicador final según plataforma y tipo de contenido.

Si calificacion_equipo es None (equipo no revisó aún), el peso del 15
se redistribuye proporcionalmente entre las otras tres métricas.
"""


def _componente_reach(vistas: int, seguidores: int) -> float:
    """
    Score 0-100 del reach ratio.
    Ratio 1.0 (100% de seguidores = views) → 100 puntos.
    Crece linealmente hasta 1.0; por encima de 1.0 sigue en 100.
    """
    if seguidores <= 0 or vistas <= 0:
        return 0.0
    ratio = vistas / seguidores
    return min(ratio * 100, 100.0)


def _componente_engagement(likes: int, vistas: int) -> float:
    """
    Score 0-100 del engagement rate del contenido (likes/vistas).
    5% engagement → 100 puntos (umbral máximo empírico para contenido de marca).
    """
    if vistas <= 0 or likes < 0:
        return 0.0
    rate = likes / vistas
    return min(rate / 0.05 * 100, 100.0)


def _componente_guardados(guardados: int, vistas: int) -> float:
    """
    Score 0-100 del save rate (guardados/vistas).
    2% save rate → 100 puntos (muy alto en beauty/haircare).
    """
    if vistas <= 0 or guardados < 0:
        return 0.0
    rate = guardados / vistas
    return min(rate / 0.02 * 100, 100.0)


def _componente_equipo(calificacion_equipo: int) -> float:
    """Normaliza calificación 1-5 a 0-100."""
    return max(0.0, min((calificacion_equipo - 1) / 4 * 100, 100.0))


def _multiplicador(plataforma: str, tipo_contenido: str, config: dict) -> float:
    """Retorna el multiplicador según plataforma y tipo."""
    scoring_cfg = config.get("scoring", {})
    mult = 1.0
    if plataforma.lower() == "tiktok":
        mult *= scoring_cfg.get("mult_tiktok", 1.2)
    tipo_key = f"mult_{tipo_contenido.lower()}"
    mult *= scoring_cfg.get(tipo_key, 1.0)
    return mult


def calcular_score_contenido(
    vistas: int,
    likes: int,
    alcance: int,
    guardados: int | None,
    seguidores_influencer: int,
    plataforma: str,
    tipo_contenido: str,
    calificacion_equipo: int | None,
    config: dict,
) -> float:
    """
    Calcula el score de una pieza de contenido. Retorna float 0-100.

    Args:
        vistas: número de reproducciones/vistas reportadas
        likes: número de likes reportados
        alcance: alcance real (personas únicas) — se usa como referencia pero
                 el cálculo principal usa vistas para consistencia entre plataformas
        guardados: guardados/saves reportados, o None si no fue reportado
        seguidores_influencer: seguidores de la plataforma relevante
        plataforma: "Instagram" | "TikTok"
        tipo_contenido: "Reel" | "Story" | "Post" | "Video"
        calificacion_equipo: 1-5 asignado por el equipo, o None si no revisó
        config: dict con clave 'scoring'

    Returns:
        Score 0-100 (puede superar 100 con multiplicadores pero se cappea al final).
        Si guardados o calificacion_equipo son None, su peso se redistribuye
        proporcionalmente entre los componentes disponibles.
    """
    scoring_cfg = config.get("scoring", {})

    peso_reach = scoring_cfg.get("peso_reach_ratio", 40)
    peso_engagement = scoring_cfg.get("peso_engagement", 25)
    peso_guardados = scoring_cfg.get("peso_guardados", 20)
    peso_equipo = scoring_cfg.get("peso_equipo", 15)

    # Construir lista de (valor_componente, peso) solo para métricas disponibles.
    # Los componentes ausentes (None) no penalizan — su peso se redistribuye.
    componentes = [
        (_componente_reach(vistas, seguidores_influencer), peso_reach),
        (_componente_engagement(likes, vistas), peso_engagement),
    ]
    if guardados is not None:
        componentes.append((_componente_guardados(guardados, vistas), peso_guardados))
    if calificacion_equipo is not None:
        componentes.append((_componente_equipo(calificacion_equipo), peso_equipo))

    total_peso = sum(w for _, w in componentes)
    score_base = sum(v * w for v, w in componentes) / total_peso if total_peso > 0 else 0.0

    mult = _multiplicador(plataforma, tipo_contenido, config)
    score_final = min(score_base * mult, 100.0)

    return round(score_final, 2)
