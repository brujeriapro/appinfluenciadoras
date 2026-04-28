"""
siigo_client.py — Cliente Siigo para registrar salidas de inventario por gifting

Crea documentos FV NoElectronic (sin sello DIAN) con descuento 100%
para registrar la salida de inventario de kits enviados a influencers.
El documento decrementa el stock en Siigo sin generar factura electrónica.
"""

import json
import time
from datetime import date
from pathlib import Path

import requests

CONFIG_PATH = Path(__file__).parent / "config_influencers.json"
SIIGO_AUTH_URL = "https://api.siigo.com/auth"
SIIGO_BASE_URL = "https://api.siigo.com"

# Consumidor final Colombia
CONSUMIDOR_FINAL_NIT = "222222222222"
# ID de documento FV NoElectronic (sin DIAN)
DOCUMENT_TYPE_ID = 28599
# Método de pago: Efectivo
PAYMENT_METHOD_ID = 7277
# Vendedor por defecto (Andres Arango - admin)
DEFAULT_SELLER_ID = 10984


def _load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


class SiigoClient:
    def __init__(self):
        config = _load_config()
        siigo_cfg = config.get("siigo", {})
        self.username = siigo_cfg["username"]
        self.access_key = siigo_cfg["access_key"]
        self._token = None
        self._token_expires_at = 0

    def _get_token(self) -> str:
        if self._token and time.time() < self._token_expires_at - 60:
            return self._token
        resp = requests.post(
            SIIGO_AUTH_URL,
            json={"username": self.username, "access_key": self.access_key},
            timeout=15,
        )
        resp.raise_for_status()
        self._token = resp.json()["access_token"]
        self._token_expires_at = time.time() + 86300
        return self._token

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._get_token()}",
            "Content-Type": "application/json",
            "Partner-Id": "ProgramaCreadoras",
        }

    def get_product_price(self, sku: str) -> float | None:
        """Obtiene el precio de venta del producto en Siigo para calcular el total del documento."""
        resp = requests.get(
            f"{SIIGO_BASE_URL}/v1/products?code={sku}&page_size=25",
            headers=self._headers(),
            timeout=15,
        )
        if not resp.ok:
            return None
        items = resp.json() if isinstance(resp.json(), list) else resp.json().get("results", [])
        for p in items:
            if p.get("code") == sku:
                prices = p.get("prices", [])
                if prices and prices[0].get("price_list"):
                    return float(prices[0]["price_list"][0].get("value", 0))
                # Si no tiene precios, buscar en additional_fields
                return 0.0
        return None

    def _calcular_total_siigo(self, precio: float, discount_pct: int = 100) -> float:
        """
        Calcula el total que Siigo espera en payments.
        Con discount 100%, Siigo igual cobra el IVA sobre el descuento:
        total = precio * (1 - discount/100) pero con IVA incluido el cálculo es distinto.
        Empíricamente: total = precio - (precio * discount/100) con ajuste de IVA.
        Aproximación: precio * discount / 100 * (1 - 19/119) ≈ precio * 0.0084
        """
        # En la prueba: price=28900, discount=100 → total=28800
        # La diferencia es 100 COP (no 0) — parece ser un redondeo del IVA incluido
        # Fórmula empírica: total ≈ precio * discount/100 * (IVA / (100 + IVA))
        # = 28900 * 1.0 * (19/119) ≈ 4614 ... no coincide
        # Simplemente: total = precio - floor(precio * (100 - discount_pct) / 100)
        # Con discount=100: total = 28900 - floor(28900 * 0) = 28900 ... tampoco
        # Observado: 28900 con discount=100 → total=28800 (diferencia de 100)
        # Puede ser que Siigo aplica: total = round(precio * discount/100, -2) o similar
        # La forma más segura: primero crear con valor 0 y leer el error que dice el total real
        return round(precio * discount_pct / 100)

    def registrar_salida_gifting(
        self,
        skus: list[str],
        influencer_nombre: str,
        influencer_instagram: str,
        shopify_order_id: str,
        fecha: date | None = None,
        dry_run: bool = False,
    ) -> dict:
        """
        Registra la salida de inventario en Siigo para un envío de gifting.
        Crea un documento FV NoElectronic con descuento 100% por cada SKU.

        Retorna el documento Siigo creado o un dict con status 'dry_run'.
        """
        if fecha is None:
            fecha = date.today()

        observacion = (
            f"Gifting influencer @{influencer_instagram} ({influencer_nombre}) "
            f"| Shopify #{shopify_order_id} | Programa Creadoras"
        )

        items = []

        for sku in skus:
            # Verificar que el SKU existe en Siigo
            precio = self.get_product_price(sku)
            if precio is None:
                print(f"  AVISO: SKU {sku} no encontrado en Siigo — se omite")
                continue
            # Precio simbólico 1 COP por ítem (sin descuento).
            # Siigo rechaza discount:100 con invalid_amount.
            # El objetivo es decrementar inventario — el valor contable es 1 COP por kit.
            items.append({
                "code": sku,
                "quantity": 1,
                "price": 1,
            })

        total_documento = len(items)  # 1 COP por cada SKU

        if not items:
            raise ValueError(f"Ningún SKU válido para registrar en Siigo: {skus}")

        payload = {
            "document": {"id": DOCUMENT_TYPE_ID},
            "date": fecha.isoformat(),
            "customer": {"identification": CONSUMIDOR_FINAL_NIT, "branch_office": 0},
            "seller": DEFAULT_SELLER_ID,
            "observations": observacion,
            "items": items,
            "payments": [{"id": PAYMENT_METHOD_ID, "value": total_documento}],
        }

        if dry_run:
            print(f"  [DRY RUN] Payload Siigo:")
            print(json.dumps(payload, indent=2, ensure_ascii=False))
            return {"id": "DRY_RUN", "name": "DRY_RUN", "stamp": None}

        print(f"  Registrando salida inventario Siigo ({len(items)} SKU(s))...")

        resp = requests.post(
            f"{SIIGO_BASE_URL}/v1/invoices",
            headers=self._headers(),
            json=payload,
            timeout=20,
        )

        # Si el total no coincide exactamente, Siigo nos dice el total real en el error
        if resp.status_code == 400:
            errs = resp.json().get("Errors", [])
            for err in errs:
                if err.get("Code") == "invalid_total_payments":
                    # Extraer el total real del mensaje de error
                    msg = err.get("Message", "")
                    import re
                    match = re.search(r"total invoice calculated is (\d+(?:\.\d+)?)", msg)
                    if match:
                        total_real = float(match.group(1))
                        payload["payments"][0]["value"] = total_real
                        print(f"  Ajustando total a {total_real} y reintentando...")
                        resp = requests.post(
                            f"{SIIGO_BASE_URL}/v1/invoices",
                            headers=self._headers(),
                            json=payload,
                            timeout=20,
                        )
                        break

        if not resp.ok:
            print(f"  ERROR Siigo {resp.status_code}: {resp.text[:400]}")
            resp.raise_for_status()

        result = resp.json()
        nombre_doc = result.get("name", result.get("id"))
        stamp = result.get("stamp")
        print(f"  Salida inventario Siigo: {nombre_doc} | DIAN: {'Si' if stamp else 'No (correcto)'}")
        return result
