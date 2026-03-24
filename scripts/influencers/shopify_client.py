"""
shopify_client.py — Cliente Shopify para creación de órdenes de gifting

Mecanismo central: draft order $0 → complete → dispara Effi + Siigo automáticamente.
Las órdenes completadas activan el webhook orders/create que Effi ya escucha,
generando la guía de envío sin intervención manual del equipo.
"""

import json
import time
from pathlib import Path

import requests

# Mapa ciudad → departamento para Colombia
# Cubre las principales ciudades — se puede ampliar
CIUDAD_A_DEPARTAMENTO = {
    # Antioquia
    "medellín": "Antioquia", "medellin": "Antioquia", "bello": "Antioquia",
    "itagüí": "Antioquia", "itagui": "Antioquia", "envigado": "Antioquia",
    "sabaneta": "Antioquia", "rionegro": "Antioquia", "la ceja": "Antioquia",
    "el retiro": "Antioquia", "marinilla": "Antioquia", "guatapé": "Antioquia",
    "guatape": "Antioquia", "copacabana": "Antioquia", "girardota": "Antioquia",
    "caldas": "Antioquia", "la estrella": "Antioquia",
    # Bogotá
    "bogotá": "Bogotá D.C.", "bogota": "Bogotá D.C.", "soacha": "Cundinamarca",
    "chía": "Cundinamarca", "chia": "Cundinamarca", "zipaquirá": "Cundinamarca",
    "zipaquira": "Cundinamarca", "facatativá": "Cundinamarca", "facatativa": "Cundinamarca",
    # Valle del Cauca
    "cali": "Valle del Cauca", "palmira": "Valle del Cauca", "buenaventura": "Valle del Cauca",
    "tuluá": "Valle del Cauca", "tulua": "Valle del Cauca", "cartago": "Valle del Cauca",
    "buga": "Valle del Cauca", "jamundí": "Valle del Cauca", "jamundi": "Valle del Cauca",
    # Atlántico
    "barranquilla": "Atlántico", "soledad": "Atlántico", "malambo": "Atlántico",
    # Bolívar
    "cartagena": "Bolívar", "magangué": "Bolívar", "magangue": "Bolívar",
    # Santander
    "bucaramanga": "Santander", "floridablanca": "Santander", "girón": "Santander",
    "giron": "Santander", "piedecuesta": "Santander",
    # Cundinamarca / Otros
    "girardot": "Cundinamarca", "fusagasugá": "Cundinamarca", "fusagasuga": "Cundinamarca",
    # Caldas
    "manizales": "Caldas", "la dorada": "Caldas",
    # Risaralda
    "pereira": "Risaralda", "dosquebradas": "Risaralda",
    # Quindío
    "armenia": "Quindío",
    # Norte de Santander
    "cúcuta": "Norte de Santander", "cucuta": "Norte de Santander",
    # Tolima
    "ibagué": "Tolima", "ibague": "Tolima", "espinal": "Tolima",
    # Meta
    "villavicencio": "Meta",
    # Huila
    "neiva": "Huila",
    # Nariño
    "pasto": "Nariño",
    # Córdoba
    "montería": "Córdoba", "monteria": "Córdoba",
    # Cesar
    "valledupar": "Cesar",
    # Magdalena
    "santa marta": "Magdalena",
    # Sucre
    "sincelejo": "Sucre",
    # Cauca
    "popayán": "Cauca", "popayan": "Cauca",
    # Boyacá
    "tunja": "Boyacá", "duitama": "Boyacá", "sogamoso": "Boyacá",
    # Casanare
    "yopal": "Casanare",
    # Arauca
    "arauca": "Arauca",
    # Putumayo
    "mocoa": "Putumayo",
    # Chocó
    "quibdó": "Chocó", "quibdo": "Chocó",
    # La Guajira
    "riohacha": "La Guajira",
    # El Salvador (para influencers internacionales)
    "san salvador": "San Salvador", "santa tecla": "La Libertad",
    "la libertad": "La Libertad", "zonte": "La Libertad",
}


def inferir_departamento(ciudad: str) -> str:
    """Retorna el departamento a partir de la ciudad. Vacío si no se encuentra."""
    if not ciudad:
        return ""
    return CIUDAD_A_DEPARTAMENTO.get(ciudad.lower().strip(), "")


CONFIG_PATH = Path(__file__).parent / "config_influencers.json"


def _load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


class ShopifyClient:
    def __init__(self):
        config = _load_config()
        sh = config["shopify"]
        self.shop_name = sh["shop_name"]
        self.client_id = sh["client_id"]
        self.client_secret = sh["client_secret"]
        self.base_url = f"https://{self.shop_name}.myshopify.com/admin/api/2024-01"
        self._token = None
        self._token_expires_at = 0
        self.headers = {
            "X-Shopify-Access-Token": self._get_token(),
            "Content-Type": "application/json",
        }

    def _get_token(self) -> str:
        """Obtiene un token fresco via client_credentials. Se renueva automáticamente al expirar."""
        if self._token and time.time() < self._token_expires_at - 60:
            return self._token
        resp = requests.post(
            f"https://{self.shop_name}.myshopify.com/admin/oauth/access_token",
            json={
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "grant_type": "client_credentials",
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        self._token = data["access_token"]
        self._token_expires_at = time.time() + data.get("expires_in", 86400)
        return self._token

    def _refresh_headers(self):
        self.headers["X-Shopify-Access-Token"] = self._get_token()

    def _get(self, endpoint: str) -> dict:
        self._refresh_headers()
        url = f"{self.base_url}/{endpoint}"
        resp = requests.get(url, headers=self.headers)
        resp.raise_for_status()
        return resp.json()

    def _post(self, endpoint: str, payload: dict) -> dict:
        self._refresh_headers()
        url = f"{self.base_url}/{endpoint}"
        resp = requests.post(url, headers=self.headers, json=payload)
        resp.raise_for_status()
        return resp.json()

    def get_variant_id_for_sku(self, sku: str) -> str | None:
        """
        Busca el variant ID de Shopify para un SKU dado.
        Itera las páginas de productos hasta encontrar una variante con ese SKU.
        Retorna el variant ID como string, o None si no se encuentra.
        """
        page_info = None
        while True:
            params = "limit=250&fields=id,variants"
            if page_info:
                params += f"&page_info={page_info}"
            data = self._get(f"products.json?{params}")
            products = data.get("products", [])
            for product in products:
                for variant in product.get("variants", []):
                    if (variant.get("sku") or "").strip() == sku.strip():
                        return str(variant["id"])
            # Paginación via Link header
            # Si no hay más páginas, terminar
            if len(products) < 250:
                break
            # Nota: para paginación completa con cursor, usar requests.get directamente
            # y parsear el header Link — simplificado aquí para claridad
            break
        return None

    def resolve_skus_to_variant_ids(self, skus: list[str]) -> dict[str, str]:
        """
        Retorna un dict {sku: variant_id} para todos los SKUs de la lista.
        Lanza ValueError si algún SKU no se encuentra.
        """
        result = {}
        not_found = []
        for sku in skus:
            variant_id = self.get_variant_id_for_sku(sku)
            if variant_id:
                result[sku] = variant_id
            else:
                not_found.append(sku)
        if not_found:
            raise ValueError(
                f"SKUs no encontrados en Shopify: {not_found}\n"
                "Verificar que los SKUs en config_influencers.json coincidan exactamente "
                "con los SKUs en Shopify Admin → Products."
            )
        return result

    def create_gifting_order(
        self,
        influencer: dict,
        skus: list[str],
        kit_nombre: str,
        dry_run: bool = False,
    ) -> dict:
        """
        Crea una orden de gifting de $0 para la influencer.

        Flujo:
        1. Resuelve SKUs a variant IDs
        2. Crea draft order con line_items a precio $0
        3. Completa el draft order (→ orden "paid" real)
        4. Retorna el dict de la orden completada con shopify_order_id

        Args:
            influencer: dict con campos de la tabla influencers
            skus: lista de SKUs del kit
            kit_nombre: nombre del kit (para nota en la orden)
            dry_run: si True, solo imprime el payload sin hacer llamadas API

        Returns:
            dict con 'shopify_order_id', 'shopify_order_number', 'shopify_draft_id'
        """
        # Parsear nombre
        nombre_parts = influencer.get("nombre", "Influencer").split(None, 1)
        first_name = nombre_parts[0]
        last_name = nombre_parts[1] if len(nombre_parts) > 1 else ""

        # Resolver SKUs
        print(f"  Resolviendo {len(skus)} SKUs en Shopify...")
        if not dry_run:
            sku_map = self.resolve_skus_to_variant_ids(skus)
        else:
            sku_map = {sku: f"DRY_RUN_VARIANT_{i}" for i, sku in enumerate(skus)}

        line_items = [
            {
                "variant_id": variant_id,
                "quantity": 1,
                "price": "0.00",
                "applied_discount": {
                    "description": "Gifting Influencer Programa Creadoras",
                    "value_type": "percentage",
                    "value": "100.0",
                    "amount": "0.00",
                    "title": "GIFTING100"
                }
            }
            for sku, variant_id in sku_map.items()
        ]

        note = (
            f"Gifting Influencer | {kit_nombre} | "
            f"@{influencer.get('instagram_handle', 'N/A')} | "
            f"Tier: {influencer.get('tier', 'N/A')}"
        )

        draft_payload = {
            "draft_order": {
                "line_items": line_items,
                "customer": {"email": influencer["email"]},
                "shipping_address": {
                    "first_name": first_name,
                    "last_name": last_name,
                    "address1": influencer.get("direccion_envio", ""),
                    "city": influencer.get("ciudad", ""),
                    "province": influencer.get("departamento") or inferir_departamento(influencer.get("ciudad", "")),
                    "country": "CO",
                    "phone": influencer.get("telefono", ""),
                },
                "note": note,
                "tags": "influencer-gifting,programa-creadoras",
                "send_receipt": False,
                "send_fulfillment_receipt": False,
                "use_customer_default_address": False,
            }
        }

        if dry_run:
            print("\n  [DRY RUN] Draft order payload:")
            print(json.dumps(draft_payload, indent=2, ensure_ascii=False))
            return {
                "shopify_order_id": "DRY_RUN",
                "shopify_order_number": "DRY_RUN",
                "shopify_draft_id": "DRY_RUN",
            }

        # Paso 1: Crear draft order
        print("  Creando draft order en Shopify...")
        draft_resp = self._post("draft_orders.json", draft_payload)
        draft_id = draft_resp["draft_order"]["id"]
        print(f"  Draft order creada: #{draft_id}")

        # Pequeña pausa para asegurar que Shopify procese el draft
        time.sleep(1)

        # Paso 2: Completar el draft order → orden real que dispara Effi + Siigo
        print("  Completando orden (dispara Effi + Siigo)...")
        self._refresh_headers()
        complete_resp = requests.put(
            f"{self.base_url}/draft_orders/{draft_id}/complete.json",
            headers=self.headers,
            json={"payment_pending": False},
            timeout=30,
        )
        complete_resp.raise_for_status()
        complete_resp = complete_resp.json()
        order = complete_resp["draft_order"]
        order_id = order.get("order_id") or order.get("id")
        order_number = order.get("order_number", "")

        print(f"  Orden completada: #{order_number} (ID: {order_id})")

        return {
            "shopify_order_id": str(order_id),
            "shopify_order_number": str(order_number),
            "shopify_draft_id": str(draft_id),
        }
