"""
calcular_scores.py — Script Fase 2: Puntuar contenido entregado

Lee contenidos sin score de Supabase, calcula el score de cada uno,
actualiza score_total del influencer y asigna el nivel Bruja correspondiente.

Uso:
  python calcular_scores.py               # Puntúa todos los contenidos pendientes
  python calcular_scores.py --id UUID     # Puntúa contenidos de una influencer específica
  python calcular_scores.py --preview     # Muestra cálculos sin actualizar BD
"""

import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from supabase_client import SupabaseClient
from scoring import calcular_score_contenido
from nivel_bruja import calcular_nivel

CONFIG_PATH = Path(__file__).parent / "config_influencers.json"
SCORES_LOG = Path(__file__).parent.parent.parent / "outputs" / "influencers" / "scores_log.csv"

LOG_HEADERS = [
    "fecha_calculo", "contenido_id", "influencer_id", "nombre_influencer",
    "plataforma", "tipo_contenido", "url_contenido",
    "vistas", "likes", "guardados", "seguidores",
    "score_contenido", "score_total_nuevo", "nivel_bruja_nuevo"
]


def cargar_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def _append_log(rows: list[dict]):
    SCORES_LOG.parent.mkdir(parents=True, exist_ok=True)
    file_exists = SCORES_LOG.exists()
    with open(SCORES_LOG, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=LOG_HEADERS)
        if not file_exists:
            writer.writeheader()
        writer.writerows(rows)


def puntuar_contenido(contenido: dict, config: dict) -> float:
    """Extrae datos del contenido y calcula el score."""
    # La query incluye el join con influencers
    influencer_data = contenido.get("influencers") or {}
    plataforma = contenido.get("plataforma", "Instagram")

    if plataforma.lower() == "tiktok":
        seguidores = influencer_data.get("seguidores_tiktok") or \
                     influencer_data.get("seguidores_instagram") or 1000
    else:
        seguidores = influencer_data.get("seguidores_instagram") or 1000

    score = calcular_score_contenido(
        vistas=contenido.get("vistas") or 0,
        likes=contenido.get("likes") or 0,
        alcance=contenido.get("alcance") or 0,
        guardados=contenido.get("guardados"),  # None si la influencer no lo reportó
        seguidores_influencer=seguidores,
        plataforma=plataforma,
        tipo_contenido=contenido.get("tipo_contenido", "Reel"),
        calificacion_equipo=contenido.get("calificacion_equipo"),
        config=config,
    )
    return score


def main():
    parser = argparse.ArgumentParser(
        description="Calcular scores de contenido entregado"
    )
    parser.add_argument("--id", help="UUID de una influencer específica")
    parser.add_argument("--preview", action="store_true",
                        help="Mostrar cálculos sin actualizar BD")
    args = parser.parse_args()

    config = cargar_config()
    supabase = SupabaseClient()

    # Obtener contenidos pendientes de score
    if args.id:
        # Todos los contenidos de esa influencer sin score
        contenidos_all = supabase.get_contenidos_sin_score()
        contenidos = [c for c in contenidos_all if c.get("influencer_id") == args.id]
    else:
        contenidos = supabase.get_contenidos_sin_score()

    if not contenidos:
        print("No hay contenidos pendientes de calificación.")
        sys.exit(0)

    mode_label = "[PREVIEW] " if args.preview else ""
    print(f"\n{mode_label}Contenidos a calificar: {len(contenidos)}\n")

    log_rows = []
    influencers_actualizados = set()

    for contenido in contenidos:
        influencer_data = contenido.get("influencers") or {}
        nombre_inf = influencer_data.get("nombre", "N/A")
        influencer_id = contenido.get("influencer_id")
        contenido_id = contenido["id"]
        url = contenido.get("url_contenido", "N/A")

        score = puntuar_contenido(contenido, config)

        print(f"  {nombre_inf} | {contenido.get('plataforma')} {contenido.get('tipo_contenido')}")
        print(f"    URL: {url}")
        print(f"    Vistas: {contenido.get('vistas', 0):,}  Likes: {contenido.get('likes', 0):,}  "
              f"Guardados: {contenido.get('guardados', 0):,}")
        print(f"    Score: {score:.1f} / 100")
        print()

        if not args.preview:
            supabase.update_contenido(contenido_id, {"score_contenido": score})
            influencers_actualizados.add(influencer_id)

        log_rows.append({
            "fecha_calculo": datetime.now(timezone.utc).isoformat(),
            "contenido_id": contenido_id,
            "influencer_id": influencer_id,
            "nombre_influencer": nombre_inf,
            "plataforma": contenido.get("plataforma", ""),
            "tipo_contenido": contenido.get("tipo_contenido", ""),
            "url_contenido": url,
            "vistas": contenido.get("vistas", 0),
            "likes": contenido.get("likes", 0),
            "guardados": contenido.get("guardados", 0),
            "seguidores": (contenido.get("influencers") or {}).get("seguidores_instagram", 0),
            "score_contenido": score,
            "score_total_nuevo": "",  # Se llena abajo
            "nivel_bruja_nuevo": "",
        })

    # Actualizar score_total y nivel Bruja para cada influencer afectada
    if not args.preview and influencers_actualizados:
        print(f"Actualizando {len(influencers_actualizados)} influencer(s)...")
        for influencer_id in influencers_actualizados:
            score_total = supabase.get_score_total_influencer(influencer_id)
            nivel = calcular_nivel(score_total, config)

            supabase.update_influencer(influencer_id, {
                "score_total": score_total,
                "nivel_bruja": nivel,
                "status": "Calificada",
            })

            # Actualizar el log con los valores finales
            for row in log_rows:
                if row["influencer_id"] == influencer_id:
                    row["score_total_nuevo"] = score_total
                    row["nivel_bruja_nuevo"] = nivel

            inf = supabase.get_influencer_by_id(influencer_id)
            nombre = inf.get("nombre", influencer_id) if inf else influencer_id
            print(f"  {nombre}: score_total={score_total:.1f} → Nivel: {nivel}")

    elif args.preview:
        # Para preview, calcular proyección
        print("Proyecciones de score_total:")
        influencer_ids = list({c.get("influencer_id") for c in contenidos})
        for iid in influencer_ids:
            scores_existentes = supabase.get_score_total_influencer(iid)
            scores_nuevos = sum(
                r["score_contenido"]
                for r in log_rows
                if r["influencer_id"] == iid
            )
            total_proyectado = scores_existentes + scores_nuevos
            nivel = calcular_nivel(total_proyectado, config)
            inf = supabase.get_influencer_by_id(iid)
            nombre = inf.get("nombre", iid) if inf else iid
            print(f"  {nombre}: {scores_existentes:.1f} + {scores_nuevos:.1f} = {total_proyectado:.1f} → {nivel}")

    if not args.preview:
        _append_log(log_rows)
        print(f"\nLog guardado en: {SCORES_LOG}")

    print(f"\nListo. {len(contenidos)} contenido(s) procesado(s).")


if __name__ == "__main__":
    main()
