"""
limpiar_supabase.py -- Utilidad de limpieza para pruebas

Muestra todos los registros en la tabla influencers, permite borrar los de prueba,
e inserta un registro limpio listo para la prueba real del pipeline.

Uso:
  python limpiar_supabase.py --listar          # Ver todos los registros actuales
  python limpiar_supabase.py --borrar-todos    # Borrar TODOS los registros de influencers
  python limpiar_supabase.py --insertar-prueba # Insertar registro de prueba limpio
"""

import argparse
import json
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent))
from supabase_client import SupabaseClient

CONFIG_PATH = Path(__file__).parent / "config_influencers.json"


def listar_influencers(sb: SupabaseClient):
    resp = requests.get(
        f"{sb.base_url}/influencers",
        headers=sb.headers,
        params={"select": "id,nombre,email,status,skus_pedidos,created_at", "order": "created_at.asc"},
    )
    resp.raise_for_status()
    registros = resp.json()
    if not registros:
        print("No hay registros en la tabla influencers.")
        return registros
    print(f"\n{'#':<4} {'Nombre':<25} {'Email':<30} {'Status':<20} {'SKUs pedidos'}")
    print("-" * 100)
    for i, r in enumerate(registros, 1):
        skus = r.get("skus_pedidos") or []
        print(f"{i:<4} {r.get('nombre',''):<25} {r.get('email',''):<30} {r.get('status',''):<20} {skus}")
    print(f"\nTotal: {len(registros)} registro(s)\n")
    return registros


def borrar_todos(sb: SupabaseClient):
    # Primero listar para confirmar
    registros = listar_influencers(sb)
    if not registros:
        return
    confirm = input(f"ATENCION: Se borraran {len(registros)} registro(s). Escribir 'si' para confirmar: ").strip().lower()
    if confirm != "si":
        print("Cancelado.")
        return
    # Borrar contenidos primero (FK constraint)
    resp = requests.delete(
        f"{sb.base_url}/contenidos",
        headers=sb.headers,
        params={"id": "neq.00000000-0000-0000-0000-000000000000"},  # borrar todos
    )
    if resp.ok:
        print("  Contenidos borrados.")
    # Borrar influencers
    resp = requests.delete(
        f"{sb.base_url}/influencers",
        headers=sb.headers,
        params={"id": "neq.00000000-0000-0000-0000-000000000000"},  # borrar todos
    )
    resp.raise_for_status()
    print(f"  {len(registros)} influencer(s) borrada(s).\n")


def insertar_prueba(sb: SupabaseClient):
    with open(CONFIG_PATH, encoding="utf-8") as f:
        config = json.load(f)

    productos = config.get("productos_disponibles", {})
    skus = list(productos.values())
    if not skus:
        print("ERROR: No hay productos en config_influencers.json -> productos_disponibles")
        sys.exit(1)

    # Usar los primeros 2 SKUs disponibles para probar Kit Estandar (Micro tier)
    skus_prueba = skus[:2]

    registro = {
        "nombre": "Influencer Prueba",
        "email": "prueba@test.com",
        "telefono": "3001234567",
        "instagram_handle": "influencer_prueba",
        "seguidores_instagram": 25000,      # Micro tier (10K-100K)
        "engagement_rate_pct": 3.5,
        "ciudad": "Medellin",
        "departamento": "Antioquia",
        "direccion_envio": "Calle 5f #53, El Poblado, Medellin",
        "status": "Registrada",
        "skus_pedidos": skus_prueba,
    }

    result = sb.insert_influencer(registro)
    print(f"Registro de prueba insertado:")
    print(f"  ID:           {result.get('id')}")
    print(f"  Nombre:       {result.get('nombre')}")
    print(f"  Email:        {result.get('email')}")
    print(f"  Instagram:    @{result.get('instagram_handle')}")
    print(f"  Seguidores:   {result.get('seguidores_instagram'):,}")
    print(f"  Status:       {result.get('status')}")
    print(f"  SKUs pedidos: {result.get('skus_pedidos')}")
    print(f"\nListo para correr: python crear_envio.py --dry-run")
    print(f"Y luego la prueba real: python crear_envio.py --auto\n")


def main():
    parser = argparse.ArgumentParser(description="Utilidad de limpieza Supabase para pruebas")
    parser.add_argument("--listar",          action="store_true", help="Listar todos los registros")
    parser.add_argument("--borrar-todos",    action="store_true", help="Borrar TODOS los registros")
    parser.add_argument("--insertar-prueba", action="store_true", help="Insertar registro de prueba limpio")
    args = parser.parse_args()

    if not any([args.listar, args.borrar_todos, args.insertar_prueba]):
        parser.print_help()
        sys.exit(0)

    sb = SupabaseClient()

    if args.listar:
        listar_influencers(sb)
    if args.borrar_todos:
        borrar_todos(sb)
    if args.insertar_prueba:
        insertar_prueba(sb)


if __name__ == "__main__":
    main()
