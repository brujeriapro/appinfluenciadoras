import csv
import os
from datetime import date


def exportar_csv(candidatas: list[dict], grupo: str) -> str:
    os.makedirs("outputs/influencers", exist_ok=True)
    nombre = f"outputs/influencers/candidatas_tiktok_{grupo}_{date.today()}.csv"

    campos = [
        "tiktok_handle", "nombre_display", "seguidores", "vistas_promedio",
        "colombia_score", "tier_estimado", "nichos", "hashtags_origen",
        "bio", "colombia_signals",
    ]

    with open(nombre, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=campos, extrasaction="ignore")
        writer.writeheader()
        for c in candidatas:
            row = dict(c)
            row["nichos"] = ", ".join(c.get("nichos") or [])
            row["hashtags_origen"] = ", ".join(c.get("hashtags_origen") or [])
            row["colombia_signals"] = ", ".join(
                s if isinstance(s, str) else str(s)
                for s in (c.get("colombia_signals") or [])
            )
            writer.writerow(row)

    return nombre
