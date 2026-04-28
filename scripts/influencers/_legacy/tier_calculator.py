"""
tier_calculator.py — Asignar tier (Nano/Micro/Macro) y kit a una influencer

Regla base: basada en seguidores de Instagram.
Regla especial: si el engagement rate es muy alto (>6%) y la influencer
está cerca del límite superior de su tier (<10% de margen), sube un tier.
"""


def calcular_tier(
    seguidores: int,
    engagement_rate_pct: float,
    config: dict,
) -> tuple[str, str]:
    """
    Determina el tier y kit para una influencer.

    Args:
        seguidores: número de seguidores de Instagram
        engagement_rate_pct: tasa de engagement en porcentaje (ej: 3.5 para 3.5%)
        config: dict con clave 'tier_rules'

    Returns:
        tuple (tier, kit_nombre) — ej: ("Micro", "Kit Estándar")
    """
    rules = config["tier_rules"]

    # Asignación base por seguidores
    if seguidores < rules["nano"]["max_followers"]:
        tier_base = "Nano"
    elif seguidores < rules["micro"]["max_followers"]:
        tier_base = "Micro"
    else:
        tier_base = "Macro"

    # Regla especial: engagement muy alto cerca del límite superior → sube un tier
    if engagement_rate_pct > 6.0 and tier_base != "Macro":
        if tier_base == "Nano":
            # Cerca del límite: 9,000+ seguidores con engagement >6% → Micro
            if seguidores >= rules["nano"]["max_followers"] * 0.9:
                tier_base = "Micro"
        elif tier_base == "Micro":
            # Cerca del límite: 90,000+ seguidores con engagement >6% → Macro
            if seguidores >= rules["micro"]["max_followers"] * 0.9:
                tier_base = "Macro"

    kit_nombre = rules[tier_base.lower()]["kit"]
    return tier_base, kit_nombre


def calcular_tier_desde_form(
    seguidores_str: str,
    engagement_dropdown: str,
    config: dict,
) -> tuple[str, str]:
    """
    Variante para cuando los datos vienen del formulario Tally.
    El formulario usa un dropdown de engagement en lugar de número exacto.

    Args:
        seguidores_str: string del campo de seguidores (puede tener comas)
        engagement_dropdown: "<1%" | "1-3%" | "3-6%" | ">6%"
        config: dict con clave 'tier_rules'

    Returns:
        tuple (tier, kit_nombre)
    """
    # Parsear seguidores (remover comas, puntos de miles, espacios)
    seguidores_clean = seguidores_str.replace(",", "").replace(".", "").strip()
    try:
        seguidores = int(seguidores_clean)
    except ValueError:
        seguidores = 0

    # Convertir dropdown a valor numérico (usar punto medio del rango)
    engagement_map = {
        "<1%": 0.5,
        "1-3%": 2.0,
        "3-6%": 4.5,
        ">6%": 7.0,
    }
    engagement_rate_pct = engagement_map.get(engagement_dropdown, 2.0)

    return calcular_tier(seguidores, engagement_rate_pct, config)
