import os
import json
import urllib.request
import urllib.parse

from dotenv import load_dotenv
load_dotenv()

BASE_URL = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

HEADERS = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def _request(method, path, data=None, params=None):
    url = f"{BASE_URL}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Supabase {method} {path}: {e.status} {e.read().decode()}")


def existe_candidata(tiktok_handle: str) -> bool:
    res = _request("GET", "candidatas_influencer", params={
        "tiktok_handle": f"eq.{tiktok_handle}",
        "select": "id",
        "limit": 1,
    })
    return len(res) > 0


def insertar_candidata(candidata: dict) -> bool:
    """Inserta si no existe. Retorna True si fue nueva."""
    if existe_candidata(candidata["tiktok_handle"]):
        return False
    _request("POST", "candidatas_influencer", data=candidata)
    return True


def get_candidatas(status=None, min_colombia_score=0, limit=200):
    params = {
        "select": "*",
        "order": "fecha_scrape.desc",
        "limit": limit,
    }
    if status:
        params["status"] = f"eq.{status}"
    if min_colombia_score > 0:
        params["colombia_score"] = f"gte.{min_colombia_score}"
    return _request("GET", "candidatas_influencer", params=params)


def actualizar_candidata(candidata_id: str, data: dict):
    url = f"{BASE_URL}/candidatas_influencer"
    params = urllib.parse.urlencode({"id": f"eq.{candidata_id}"})
    full_url = f"{url}?{params}"
    body = json.dumps(data).encode()
    req = urllib.request.Request(full_url, data=body, headers=HEADERS, method="PATCH")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())
