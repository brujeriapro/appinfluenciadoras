"""
webhook_receiver.py — Receptor de webhooks de Tally.so

Corre un servidor HTTP local que recibe las submissions de dos formularios Tally:
  1. Formulario de REGISTRO de influencers → inserta en tabla `influencers`
  2. Formulario de ENTREGA de contenido → inserta en tabla `contenidos`

Uso:
  python webhook_receiver.py                    # Corre en puerto 8765
  python webhook_receiver.py --port 9000        # Puerto personalizado
  python webhook_receiver.py --test             # Procesa datos de prueba sin HTTP

Para exponer a internet (necesario para que Tally envíe webhooks):
  Opción A — ngrok (recomendado para testing):
    ngrok http 8765
    → Copiar la URL https://xxx.ngrok.io → pegar en Tally webhook URL

  Opción B — Para producción continua:
    Configurar el script como servicio en Windows o correr en una VPS.
    Alternativamente: usar Tally → Make.com (plan gratuito) → Supabase directamente.

Tally envía los datos como JSON con la estructura:
  {
    "eventId": "...",
    "eventType": "FORM_RESPONSE",
    "formId": "...",
    "formName": "...",
    "createdAt": "...",
    "data": {
      "responseId": "...",
      "fields": [
        {"key": "...", "label": "...", "value": "..."},
        ...
      ]
    }
  }
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from supabase_client import SupabaseClient
from tier_calculator import calcular_tier_desde_form

CONFIG_PATH = Path(__file__).parent / "config_influencers.json"


def cargar_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


# ------------------------------------------------------------------ #
# Mapeo de campos Tally → columnas Supabase
# Ajustar los labels según cómo se llamen en el formulario Tally real
# ------------------------------------------------------------------ #

CAMPO_REGISTRO = {
    "nombre": ["nombre completo", "nombre", "name"],
    "email": ["email", "correo", "e-mail"],
    "telefono": ["teléfono", "telefono", "whatsapp", "celular"],
    "instagram_handle": ["instagram", "handle instagram", "@instagram"],
    "tiktok_handle": ["tiktok", "handle tiktok", "@tiktok"],
    "seguidores_instagram": ["seguidores instagram", "seguidores", "followers"],
    "seguidores_tiktok": ["seguidores tiktok", "tiktok followers"],
    "engagement_dropdown": ["engagement rate", "engagement", "tasa de engagement"],
    "ciudad": ["ciudad", "city"],
    "departamento": ["departamento", "department"],
    "direccion_envio": ["dirección", "dirección de envío", "dirección envío", "address"],
}

CAMPO_CONTENIDO = {
    "email": ["email", "correo", "e-mail"],
    "url_contenido": ["url del contenido", "link del post", "url", "link"],
    "plataforma": ["plataforma", "platform"],
    "tipo_contenido": ["tipo de contenido", "tipo", "tipo contenido"],
    "fecha_publicacion": ["fecha de publicación", "fecha publicacion", "fecha de publicacion", "fecha publicación", "fecha"],
    "vistas": ["vistas", "views", "reproducciones"],
    "likes": ["likes", "me gusta"],
    "alcance": ["alcance", "reach"],
    "guardados": ["guardados", "saves"],
    "screenshot_url": ["screenshot", "captura de pantalla", "screenshot url", "screenshot de métricas", "screenshot de metricas"],
}


def _extraer_campo(fields: list[dict], posibles_labels: list[str]) -> str | None:
    """Busca un campo en la lista de fields de Tally por label (case-insensitive).

    Maneja correctamente los campos de tipo File Upload: Tally envía el valor
    como una lista de objetos [{url, name, mimeType, size}] — se extrae la URL
    del primer archivo en lugar de convertir el objeto a string.
    """
    for field in fields:
        label = field.get("label", "").lower().strip()
        if any(label == pl.lower() for pl in posibles_labels):
            value = field.get("value")
            if value is None:
                return None
            # File upload: Tally envía lista de objetos con 'url'
            if isinstance(value, list):
                if value and isinstance(value[0], dict) and "url" in value[0]:
                    return value[0]["url"]
                return None
            return str(value).strip()
    return None


def _parsear_int(valor: str | None) -> int | None:
    if not valor:
        return None
    try:
        clean = valor.replace(",", "").replace(".", "").replace(" ", "")
        return int(clean)
    except ValueError:
        return None


def procesar_registro(fields: list[dict], config: dict) -> dict:
    """
    Parsea los fields de Tally del formulario de registro
    y retorna un dict listo para insertar en la tabla `influencers`.
    """
    datos = {}
    for columna, labels in CAMPO_REGISTRO.items():
        datos[columna] = _extraer_campo(fields, labels)

    # Calcular tier automáticamente
    seguidores_str = datos.get("seguidores_instagram") or "0"
    engagement_str = datos.get("engagement_dropdown") or "1-3%"
    tier, kit = calcular_tier_desde_form(seguidores_str, engagement_str, config)

    # Convertir seguidores a int
    seguidores_int = _parsear_int(seguidores_str)
    seguidores_tiktok_int = _parsear_int(datos.get("seguidores_tiktok"))

    # Limpiar handle de Instagram (remover @)
    ig_handle = (datos.get("instagram_handle") or "").lstrip("@").strip()
    tiktok_handle = (datos.get("tiktok_handle") or "").lstrip("@").strip()

    registro = {
        "nombre": datos.get("nombre"),
        "email": (datos.get("email") or "").lower().strip(),
        "telefono": datos.get("telefono"),
        "instagram_handle": ig_handle or None,
        "tiktok_handle": tiktok_handle or None,
        "seguidores_instagram": seguidores_int,
        "seguidores_tiktok": seguidores_tiktok_int,
        "engagement_rate_pct": None,  # Se puede calcular más tarde si se conoce el número exacto
        "ciudad": datos.get("ciudad"),
        "departamento": datos.get("departamento"),
        "direccion_envio": datos.get("direccion_envio"),
        "tier": tier,
        "kit_asignado": kit,
        "status": "Registrada",
        "fecha_registro": datetime.now(timezone.utc).isoformat(),
        "score_total": 0,
        "nivel_bruja": "Bruja Semilla",
    }

    # Remover claves con valor None para no sobreescribir defaults
    return {k: v for k, v in registro.items() if v is not None or k in ("score_total",)}


def procesar_contenido(fields: list[dict], supabase: SupabaseClient) -> dict | None:
    """
    Parsea los fields de Tally del formulario de contenido
    y retorna un dict listo para insertar en la tabla `contenidos`.
    """
    datos = {}
    for columna, labels in CAMPO_CONTENIDO.items():
        datos[columna] = _extraer_campo(fields, labels)

    email = (datos.get("email") or "").lower().strip()
    if not email:
        print("  ERROR: Email no encontrado en submission de contenido")
        return None

    # Buscar influencer por email
    influencer = supabase.get_influencer_by_email(email)
    if not influencer:
        print(f"  ERROR: No se encontró influencer con email {email}")
        return None

    contenido = {
        "influencer_id": influencer["id"],
        "url_contenido": datos.get("url_contenido"),
        "plataforma": datos.get("plataforma", "Instagram"),
        "tipo_contenido": datos.get("tipo_contenido", "Reel"),
        "fecha_publicacion": datos.get("fecha_publicacion"),
        "vistas": _parsear_int(datos.get("vistas")),
        "likes": _parsear_int(datos.get("likes")),
        "alcance": _parsear_int(datos.get("alcance")),
        "guardados": _parsear_int(datos.get("guardados")),
        "screenshot_url": datos.get("screenshot_url"),
        "fecha_submision": datetime.now(timezone.utc).isoformat(),
    }

    return {k: v for k, v in contenido.items() if v is not None}


class TallyWebhookHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Silenciar logs de request para salida más limpia
        pass

    def do_POST(self):
        config = cargar_config()
        supabase = SupabaseClient()

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            print(f"  ERROR: JSON inválido recibido")
            self.send_response(400)
            self.end_headers()
            return

        form_name = payload.get("formName", "").lower()
        fields = payload.get("data", {}).get("fields", [])

        print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Webhook recibido: '{form_name}'")

        try:
            if "registro" in form_name or "creadoras" in form_name:
                # Formulario de registro de influencer
                datos = procesar_registro(fields, config)

                # Verificar si ya existe (por email)
                email = datos.get("email", "")
                existente = supabase.get_influencer_by_email(email) if email else None

                if existente:
                    print(f"  Influencer ya existe: {email} — actualizando datos")
                    supabase.update_influencer(existente["id"], datos)
                    print(f"  Actualizado: {datos.get('nombre')} | Tier: {datos.get('tier')}")
                else:
                    resultado = supabase.insert_influencer(datos)
                    print(f"  Nueva influencer registrada: {datos.get('nombre')}")
                    print(f"  Tier: {datos.get('tier')} | Kit: {datos.get('kit_asignado')}")
                    print(f"  ID: {resultado.get('id')}")

            elif "contenido" in form_name or "entrega" in form_name:
                # Formulario de entrega de contenido
                datos = procesar_contenido(fields, supabase)
                if datos:
                    contenido = supabase.insert_contenido(datos)
                    # Actualizar status de influencer
                    supabase.update_influencer(datos["influencer_id"], {
                        "status": "Contenido Entregado"
                    })
                    print(f"  Contenido registrado: {datos.get('url_contenido')}")
                    print(f"  ID: {contenido.get('id')}")
            else:
                print(f"  ADVERTENCIA: Formulario no reconocido: '{form_name}'")
                print(f"  Asegurarse que el nombre del formulario Tally contenga 'registro' o 'contenido'")

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode())

        except Exception as e:
            print(f"  ERROR procesando webhook: {e}")
            import traceback
            traceback.print_exc()
            self.send_response(500)
            self.end_headers()


def test_mode():
    """Procesa datos de prueba sin levantar un servidor HTTP."""
    config = cargar_config()
    supabase = SupabaseClient()

    print("=== Modo de prueba ===\n")

    # Simular un registro de influencer
    fields_registro = [
        {"label": "Nombre Completo", "value": "María García"},
        {"label": "Email", "value": "maria.test@email.com"},
        {"label": "Teléfono", "value": "+57 310 000 0001"},
        {"label": "Instagram", "value": "@mariatest"},
        {"label": "Seguidores Instagram", "value": "8500"},
        {"label": "Engagement Rate", "value": ">6%"},
        {"label": "Ciudad", "value": "Medellín"},
        {"label": "Departamento", "value": "Antioquia"},
        {"label": "Dirección", "value": "Cra 50 #10-20, Laureles"},
    ]

    print("Procesando registro de prueba...")
    datos = procesar_registro(fields_registro, config)
    print(f"  Resultado: {json.dumps(datos, indent=2, ensure_ascii=False)}")
    print("\nPara insertar en Supabase, remover el flag --test")


def main():
    parser = argparse.ArgumentParser(description="Receptor de webhooks de Tally.so")
    parser.add_argument("--port", type=int, default=8765, help="Puerto HTTP (default: 8765)")
    parser.add_argument("--test", action="store_true", help="Modo prueba sin servidor HTTP")
    args = parser.parse_args()

    if args.test:
        test_mode()
        return

    print(f"Iniciando servidor webhook en puerto {args.port}...")
    print(f"URL local: http://localhost:{args.port}")
    print("Para exponer a internet: ngrok http {args.port}")
    print("Ctrl+C para detener\n")

    server = HTTPServer(("", args.port), TallyWebhookHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")


if __name__ == "__main__":
    main()
