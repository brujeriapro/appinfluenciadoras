"""
supabase_client.py — Cliente Supabase para el Sistema de Gestión de Influencers

Usa la API REST de Supabase directamente con requests (sin supabase-py),
compatible con el nuevo formato de keys sb_secret_ / sb_publishable_.
"""

import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests

CONFIG_PATH = Path(__file__).parent / "config_influencers.json"


def _load_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


class SupabaseClient:
    def __init__(self):
        config = _load_config()
        sb = config["supabase"]
        self.base_url = sb["url"].rstrip("/") + "/rest/v1"
        self.key = sb["service_role_key"]
        self.headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    def _get(self, table: str, params: dict = None) -> list[dict]:
        resp = requests.get(
            f"{self.base_url}/{table}",
            headers=self.headers,
            params=params or {},
        )
        resp.raise_for_status()
        return resp.json()

    def _post(self, table: str, data: dict) -> dict:
        resp = requests.post(
            f"{self.base_url}/{table}",
            headers=self.headers,
            json=data,
        )
        resp.raise_for_status()
        result = resp.json()
        return result[0] if isinstance(result, list) else result

    def _patch(self, table: str, filters: dict, data: dict) -> dict:
        params = {k: f"eq.{v}" for k, v in filters.items()}
        resp = requests.patch(
            f"{self.base_url}/{table}",
            headers=self.headers,
            params=params,
            json=data,
        )
        resp.raise_for_status()
        result = resp.json()
        return result[0] if isinstance(result, list) and result else {}

    # ------------------------------------------------------------------ #
    # Influencers
    # ------------------------------------------------------------------ #

    def get_influencers_by_status(self, status: str) -> list[dict]:
        return self._get("influencers", {
            "status": f"eq.{status}",
            "order": "fecha_registro.asc",
            "select": "*",
        })

    def get_influencer_by_email(self, email: str) -> dict | None:
        results = self._get("influencers", {
            "email": f"eq.{email.lower().strip()}",
            "limit": "1",
            "select": "*",
        })
        return results[0] if results else None

    def get_influencer_by_id(self, influencer_id: str) -> dict | None:
        results = self._get("influencers", {
            "id": f"eq.{influencer_id}",
            "limit": "1",
            "select": "*",
        })
        return results[0] if results else None

    def insert_influencer(self, fields: dict) -> dict:
        if "email" in fields:
            fields["email"] = fields["email"].lower().strip()
        fields.setdefault("status", "Registrada")
        fields.setdefault("score_total", 0)
        fields.setdefault("nivel_bruja", "Bruja Semilla")
        return self._post("influencers", fields)

    def update_influencer(self, influencer_id: str, fields: dict) -> dict:
        return self._patch("influencers", {"id": influencer_id}, fields)

    def get_influencers_sin_contenido_tardios(self, dias: int) -> list[dict]:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=dias)).date().isoformat()
        return self._get("influencers", {
            "status": "eq.Producto Enviado",
            "fecha_envio": f"lt.{cutoff}",
            "select": "*",
        })

    # ------------------------------------------------------------------ #
    # Contenidos
    # ------------------------------------------------------------------ #

    def insert_contenido(self, fields: dict) -> dict:
        fields.setdefault("fecha_submision", datetime.now(timezone.utc).isoformat())
        return self._post("contenidos", fields)

    def get_contenidos_sin_score(self) -> list[dict]:
        return self._get("contenidos", {
            "score_contenido": "is.null",
            "select": "*,influencers(seguidores_instagram,seguidores_tiktok,nombre)",
        })

    def update_contenido(self, contenido_id: str, fields: dict) -> dict:
        return self._patch("contenidos", {"id": contenido_id}, fields)

    def get_contenidos_by_influencer(self, influencer_id: str) -> list[dict]:
        return self._get("contenidos", {
            "influencer_id": f"eq.{influencer_id}",
            "order": "fecha_submision.asc",
            "select": "*",
        })

    def get_score_total_influencer(self, influencer_id: str) -> float:
        contenidos = self.get_contenidos_by_influencer(influencer_id)
        return sum(c.get("score_contenido") or 0 for c in contenidos)

    # ------------------------------------------------------------------ #
    # Kits
    # ------------------------------------------------------------------ #

    def get_kit_by_nombre(self, nombre_kit: str) -> dict | None:
        results = self._get("kits", {
            "nombre": f"eq.{nombre_kit}",
            "limit": "1",
            "select": "*",
        })
        return results[0] if results else None
