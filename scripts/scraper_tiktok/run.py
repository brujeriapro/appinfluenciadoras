"""
Scraper TikTok — Candidatas Influencers Brujería Capilar

Uso:
  python run.py --grupo hair_care
  python run.py --grupo grwm_lifestyle --max-hashtags 3 --dry-run
  python run.py --grupo todos --max-hashtags 2

Grupos disponibles: hair_care, grwm_lifestyle, makeup_skincare, gym_deportes,
                    ugc_emprendedoras, mamas_universitarias, moda, ciudades, baile, todos
"""

import argparse
import logging
import uuid
from datetime import datetime

from dotenv import load_dotenv
load_dotenv()

from hashtags import GRUPOS
from scraper import scrapear_hashtag
from supabase_client import insertar_candidata
from exportar_csv import exportar_csv

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="Scraper TikTok — Candidatas Brujería Capilar")
    parser.add_argument("--grupo", required=True, help="Nombre del grupo de hashtags o 'todos'")
    parser.add_argument("--max-hashtags", type=int, default=3, help="Máx hashtags a procesar (default: 3)")
    parser.add_argument("--max-perfiles", type=int, default=40, help="Máx perfiles por hashtag (default: 40)")
    parser.add_argument("--dry-run", action="store_true", help="No escribe en Supabase ni CSV")
    args = parser.parse_args()

    if args.grupo == "todos":
        grupos_a_procesar = list(GRUPOS.keys())
    elif args.grupo in GRUPOS:
        grupos_a_procesar = [args.grupo]
    else:
        logger.error(f"Grupo '{args.grupo}' no existe. Disponibles: {', '.join(GRUPOS.keys())}, todos")
        return

    run_id = f"{datetime.now().strftime('%Y%m%d_%H%M')}_{args.grupo}"
    todas_candidatas = []
    total_nuevas = 0

    for grupo in grupos_a_procesar:
        hashtags = GRUPOS[grupo][: args.max_hashtags]
        logger.info(f"\n{'='*50}")
        logger.info(f"GRUPO: {grupo} — procesando {len(hashtags)} hashtags")
        logger.info(f"{'='*50}")

        for hashtag in hashtags:
            logger.info(f"\nHashtag: #{hashtag}")
            try:
                candidatas = scrapear_hashtag(
                    hashtag,
                    max_perfiles=args.max_perfiles,
                    dry_run=args.dry_run,
                )
            except Exception as e:
                logger.error(f"  Error scrapeando #{hashtag}: {e}")
                continue

            for c in candidatas:
                c["hashtags_origen"] = [hashtag]
                c["scrape_run_id"] = run_id
                todas_candidatas.append(c)

                if not args.dry_run:
                    try:
                        es_nueva = insertar_candidata(c)
                        if es_nueva:
                            total_nuevas += 1
                            logger.info(f"  ✅ Nueva candidata guardada: @{c['tiktok_handle']}")
                        else:
                            logger.info(f"  — Ya existe: @{c['tiktok_handle']}")
                    except Exception as e:
                        logger.error(f"  Error guardando @{c['tiktok_handle']}: {e}")

    # Resumen
    logger.info(f"\n{'='*50}")
    logger.info(f"RESUMEN CORRIDA {run_id}")
    logger.info(f"  Candidatas encontradas: {len(todas_candidatas)}")
    if not args.dry_run:
        logger.info(f"  Nuevas guardadas en Supabase: {total_nuevas}")
    else:
        logger.info(f"  [DRY RUN] No se guardó nada")
    logger.info(f"{'='*50}")

    if todas_candidatas:
        csv_path = exportar_csv(todas_candidatas, args.grupo) if not args.dry_run else None
        if csv_path:
            logger.info(f"  CSV exportado: {csv_path}")

    if args.dry_run and todas_candidatas:
        logger.info("\nMuestra de candidatas encontradas:")
        for c in todas_candidatas[:5]:
            logger.info(
                f"  @{c['tiktok_handle']} | {c['seguidores']:,} seg | "
                f"{c['vistas_promedio']:,} vistas | Colombia: {c['colombia_score']} | {c['tier_estimado']}"
            )


if __name__ == "__main__":
    main()
