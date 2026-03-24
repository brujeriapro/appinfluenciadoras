"""
crear_envio.py — Script principal Fase 1: Registrada → Orden Shopify → "Producto Enviado"

Uso:
  python crear_envio.py               # Lista todas las Registradas, pide confirmación por cada una
  python crear_envio.py --id UUID     # Procesa una influencer específica
  python crear_envio.py --dry-run     # Preview completo sin crear órdenes ni actualizar BD
  python crear_envio.py --auto        # Sin confirmación manual (procesa todas automáticamente)

Flujo:
  1. Consultar Supabase: influencers con status = "Registrada"
  2. Para cada una: calcular tier si no tiene, determinar kit
  3. Mostrar tabla resumen
  4. Pedir confirmación (skip con 's', procesar con Enter, salir con 'q')
  5. Crear orden Shopify $0 → dispara Effi + Siigo
  6. Actualizar Supabase: status, shopify_order_id, fecha_envio, tier, kit_asignado
  7. Agregar fila a outputs/influencers/envios_log.csv
  8. Imprimir resumen final
"""

import argparse
import csv
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

# Asegurar que el directorio padre esté en el path
sys.path.insert(0, str(Path(__file__).parent))

from supabase_client import SupabaseClient
from shopify_client import ShopifyClient
from siigo_client import SiigoClient
from tier_calculator import calcular_tier

CONFIG_PATH = Path(__file__).parent / "config_influencers.json"
ENVIOS_LOG = Path(__file__).parent.parent.parent / "outputs" / "influencers" / "envios_log.csv"

LOG_HEADERS = [
    "fecha_proceso", "influencer_id", "nombre", "instagram_handle",
    "email", "tier", "kit_asignado", "shopify_order_id",
    "shopify_order_number", "ciudad", "status"
]


def cargar_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def _tabla_influencer(inf: dict) -> str:
    """Formatea una fila de resumen para mostrar en terminal."""
    return (
        f"  {'Nombre':<20} {inf.get('nombre', 'N/A')}\n"
        f"  {'Instagram':<20} @{inf.get('instagram_handle', 'N/A')}\n"
        f"  {'Email':<20} {inf.get('email', 'N/A')}\n"
        f"  {'Teléfono':<20} {inf.get('telefono', 'N/A')}\n"
        f"  {'Seguidores IG':<20} {inf.get('seguidores_instagram', 'N/A'):,}\n"
        f"  {'Tier':<20} {inf.get('tier', '(calculando...)')}\n"
        f"  {'Kit asignado':<20} {inf.get('kit_asignado', '(calculando...)')}\n"
        f"  {'Ciudad':<20} {inf.get('ciudad', 'N/A')}\n"
        f"  {'Dirección':<20} {inf.get('direccion_envio', 'N/A')}\n"
    )


def _append_log(row: dict):
    """Agrega una fila al CSV de log de envíos."""
    ENVIOS_LOG.parent.mkdir(parents=True, exist_ok=True)
    file_exists = ENVIOS_LOG.exists()
    with open(ENVIOS_LOG, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=LOG_HEADERS)
        if not file_exists:
            writer.writeheader()
        writer.writerow(row)


def procesar_influencer(
    inf: dict,
    config: dict,
    shopify: ShopifyClient,
    supabase: SupabaseClient,
    siigo: SiigoClient,
    dry_run: bool,
) -> bool:
    """
    Procesa una influencer: calcula tier, crea orden Shopify, actualiza Supabase.
    Retorna True si fue exitoso, False si hubo error.
    """
    nombre = inf.get("nombre", "N/A")
    influencer_id = inf["id"]

    # Calcular tier si no está asignado
    tier = inf.get("tier")
    kit_nombre = inf.get("kit_asignado")

    if not tier or not kit_nombre:
        seguidores = inf.get("seguidores_instagram", 0) or 0
        engagement = inf.get("engagement_rate_pct", 2.0) or 2.0
        tier, kit_nombre = calcular_tier(seguidores, engagement, config)
        print(f"  Tier calculado: {tier} - {kit_nombre}")

    # Obtener SKUs — usa los productos elegidos por la influencer, limitados por el tier
    kits_config = config.get("kits", {})
    if kit_nombre not in kits_config:
        print(f"  ERROR: Kit '{kit_nombre}' no encontrado en config_influencers.json")
        return False

    max_productos = kits_config[kit_nombre]["productos"]
    skus_pedidos = inf.get("skus_pedidos") or []

    if not skus_pedidos:
        print(f"  ERROR: {nombre} no tiene productos seleccionados (skus_pedidos vacío)")
        print(f"  Agregar los SKUs en Supabase → tabla influencers → columna skus_pedidos")
        print(f"  Productos disponibles: {list(config.get('productos_disponibles', {}).values())}")
        return False

    skus = skus_pedidos[:max_productos]
    if len(skus_pedidos) > max_productos:
        print(f"  AVISO: Tier {tier} permite {max_productos} producto(s). "
              f"Se usarán los primeros {max_productos} de {len(skus_pedidos)} seleccionados.")

    try:
        order_result = shopify.create_gifting_order(
            influencer=inf,
            skus=skus,
            kit_nombre=kit_nombre,
            dry_run=dry_run,
        )
    except Exception as e:
        print(f"  ERROR al crear orden Shopify: {e}")
        return False

    today = date.today().isoformat()
    update_fields = {
        "status": "Producto Enviado",
        "shopify_order_id": order_result["shopify_order_id"],
        "fecha_envio": today,
        "tier": tier,
        "kit_asignado": kit_nombre,
    }

    # Registrar salida de inventario en Siigo (sin factura electrónica)
    siigo_doc_name = "N/A"
    try:
        siigo_result = siigo.registrar_salida_gifting(
            skus=skus,
            influencer_nombre=nombre,
            influencer_instagram=inf.get("instagram_handle", ""),
            shopify_order_id=order_result["shopify_order_id"],
            dry_run=dry_run,
        )
        siigo_doc_name = siigo_result.get("name", "OK")
    except Exception as e:
        print(f"  AVISO: No se pudo registrar en Siigo: {e}")
        print(f"  La orden Shopify fue creada correctamente. Ajustar inventario Siigo manualmente.")

    if not dry_run:
        supabase.update_influencer(influencer_id, update_fields)

    # Log CSV
    log_row = {
        "fecha_proceso": datetime.now(timezone.utc).isoformat(),
        "influencer_id": influencer_id,
        "nombre": nombre,
        "instagram_handle": inf.get("instagram_handle", ""),
        "email": inf.get("email", ""),
        "tier": tier,
        "kit_asignado": kit_nombre,
        "shopify_order_id": order_result["shopify_order_id"],
        "shopify_order_number": order_result.get("shopify_order_number", ""),
        "ciudad": inf.get("ciudad", ""),
        "status": "DRY_RUN" if dry_run else "Producto Enviado",
    }

    if not dry_run:
        _append_log(log_row)

    if dry_run:
        print(f"  [DRY RUN] Orden simulada para {nombre} — sin cambios en BD ni Shopify")
    else:
        print(f"  Orden #{order_result.get('shopify_order_number')} creada para {nombre}")

    return True


def main():
    parser = argparse.ArgumentParser(
        description="Procesar envíos de gifting para influencers registradas"
    )
    parser.add_argument("--id", help="UUID de una influencer específica a procesar")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview sin crear órdenes ni actualizar BD")
    parser.add_argument("--auto", action="store_true",
                        help="Procesar todas sin confirmación manual")
    args = parser.parse_args()

    config = cargar_config()
    supabase = SupabaseClient()
    shopify = ShopifyClient()
    siigo = SiigoClient()

    if args.id:
        influencers = []
        inf = supabase.get_influencer_by_id(args.id)
        if not inf:
            print(f"ERROR: No se encontró influencer con ID {args.id}")
            sys.exit(1)
        influencers = [inf]
    else:
        influencers = supabase.get_influencers_by_status("Registrada")

    if not influencers:
        print("No hay influencers con status 'Registrada' para procesar.")
        sys.exit(0)

    mode_label = "[DRY RUN] " if args.dry_run else ""
    print(f"\n{mode_label}Influencers listas para envío: {len(influencers)}\n")
    print("=" * 60)

    procesadas = 0
    saltadas = 0
    errores = 0

    for i, inf in enumerate(influencers, 1):
        nombre = inf.get("nombre", "N/A")
        print(f"\n[{i}/{len(influencers)}] {nombre}")
        print(_tabla_influencer(inf))

        if not args.auto and not args.dry_run:
            resp = input("  ¿Procesar? [Enter=sí / s=saltar / q=salir]: ").strip().lower()
            if resp == "q":
                print("Saliendo.")
                break
            if resp == "s":
                print(f"  Saltando {nombre}.")
                saltadas += 1
                continue

        print(f"  Procesando {nombre}...")
        ok = procesar_influencer(inf, config, shopify, supabase, siigo, args.dry_run)
        if ok:
            procesadas += 1
        else:
            errores += 1

    print("\n" + "=" * 60)
    print(f"Resumen {mode_label}:")
    print(f"  Procesadas exitosamente: {procesadas}")
    print(f"  Saltadas:                {saltadas}")
    print(f"  Errores:                 {errores}")
    if not args.dry_run:
        print(f"\nLog guardado en: {ENVIOS_LOG}")
    print()


if __name__ == "__main__":
    main()
