"""
Punto de entrada del scraper de Facebook para candidatas de Brujería Capilar.

Uso:
    python run.py                 # scrape completo, guarda en Supabase
    python run.py --dry-run       # muestra resultados sin guardar
    python run.py --max 10        # máximo 10 perfiles por término de búsqueda
    python run.py --solo-hashtags # solo busca por hashtags, no por términos
"""

import argparse
import logging
import sys

from scraper import correr_scraper
from hashtags import BUSQUEDAS_FACEBOOK, HASHTAGS_FACEBOOK

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="Scraper Facebook — Brujería Capilar")
    parser.add_argument("--dry-run", action="store_true", help="No guardar en Supabase")
    parser.add_argument("--max", type=int, default=15, help="Máx perfiles por término (default 15)")
    parser.add_argument("--solo-hashtags", action="store_true", help="Solo buscar por hashtags")
    args = parser.parse_args()

    busquedas = [] if args.solo_hashtags else BUSQUEDAS_FACEBOOK
    hashtags  = HASHTAGS_FACEBOOK

    print("\n" + "=" * 55)
    print("  SCRAPER FACEBOOK — Programa Creadoras BC")
    print("=" * 55)
    print(f"  Términos de búsqueda : {len(busquedas)}")
    print(f"  Hashtags             : {len(hashtags)}")
    print(f"  Máx perfiles/término : {args.max}")
    print(f"  Modo                 : {'DRY RUN (sin guardar)' if args.dry_run else 'PRODUCCIÓN'}")
    print("=" * 55 + "\n")

    if not args.dry_run:
        try:
            from supabase_client import guardar_candidata_facebook
        except Exception as e:
            print(f"ERROR importando Supabase: {e}")
            print("Corre con --dry-run para probar sin Supabase")
            sys.exit(1)

    candidatas = correr_scraper(busquedas, hashtags, max_por_termino=args.max)

    print(f"\n{'='*55}")
    print(f"  RESULTADO: {len(candidatas)} candidatas aptas")
    print("=" * 55)

    guardadas = 0
    for c in candidatas:
        print(
            f"  {c['nombre_display']:<30} | {c['seguidores']:>8,} seg | "
            f"score {c['colombia_score']:>3} | {c['tier_estimado']} | {c['profile_url']}"
        )
        if not args.dry_run:
            nueva = guardar_candidata_facebook(c)
            if nueva:
                guardadas += 1

    if not args.dry_run:
        print(f"\n  Guardadas en Supabase: {guardadas} nuevas")
    print()


if __name__ == "__main__":
    main()
