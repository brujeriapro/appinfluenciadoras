"""
seguimiento.py — Script Fase 3: Detección de contenido tardío y recordatorios

Detecta influencers que recibieron su producto pero no han publicado contenido
pasado el plazo definido en config, y les envía un email de recordatorio.

Uso:
  python seguimiento.py               # Envía recordatorios a quienes corresponde
  python seguimiento.py --preview     # Muestra quién recibiría recordatorio sin enviar
  python seguimiento.py --dias 20     # Override del plazo (default: del config)

Configuración necesaria:
  - Cuenta Gmail con contraseña de aplicación (Gmail → Seguridad → Contraseñas de aplicación)
  - Llenar sección "email" en config_influencers.json
"""

import argparse
import json
import smtplib
import sys
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from supabase_client import SupabaseClient
from nivel_bruja import descripcion_nivel, siguiente_nivel

CONFIG_PATH = Path(__file__).parent / "config_influencers.json"


def cargar_config() -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def _nombre_de_pila(nombre_completo: str) -> str:
    """Extrae solo el primer nombre."""
    return nombre_completo.strip().split()[0].capitalize() if nombre_completo else "Creadora"


def _construir_email(inf: dict, config: dict) -> tuple[str, str]:
    """
    Construye asunto y cuerpo HTML del email de recordatorio.
    Retorna (asunto, cuerpo_html).
    """
    nombre = _nombre_de_pila(inf.get("nombre", "Creadora"))
    nivel_actual = inf.get("nivel_bruja", "Bruja Semilla")
    score_total = inf.get("score_total", 0)
    plazo_dias = config.get("plazo_contenido_dias", 30)
    form_url = config.get("email", {}).get("tally_form_contenido_url", "#")

    siguiente, score_necesario = siguiente_nivel(nivel_actual, config)

    asunto = f"¡{nombre}! ¿Ya probaste tu kit de Brujería Capilar? ✨"

    puntos_para_subir = ""
    if siguiente and score_necesario is not None:
        faltan = max(0, score_necesario - score_total)
        puntos_para_subir = f"""
        <p style="background:#fff3e0;padding:12px;border-radius:8px;margin:16px 0;">
          ⬆️ <strong>¡Estás a {faltan:.0f} puntos de convertirte en {siguiente}!</strong>
          Publica tu contenido y califícalo para subir de nivel.
        </p>
        """

    cuerpo = f"""
    <html><body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;">
      <div style="background:#1a1a2e;padding:24px;border-radius:12px 12px 0 0;text-align:center;">
        <h1 style="color:#e0aaff;margin:0;">✨ Brujería Capilar</h1>
        <p style="color:#c77dff;margin:8px 0 0;">Programa Creadoras</p>
      </div>

      <div style="background:#f9f5ff;padding:24px;border-radius:0 0 12px 12px;">
        <p>¡Hola <strong>{nombre}</strong>! 👋</p>

        <p>Hace {plazo_dias} días te enviamos tu kit de <strong>Brujería Capilar</strong> y
        queremos saber cómo te fue. ¿Ya transformaste tu cabello con nuestra magia? 🔮</p>

        <p>Recuerda que como parte del programa, acordamos que publicarías contenido
        en tus redes mostrando los resultados. ¡Es el momento! 💫</p>

        <div style="text-align:center;margin:24px 0;">
          <a href="{form_url}"
             style="background:#7b2d8b;color:white;padding:14px 28px;border-radius:8px;
                    text-decoration:none;font-weight:bold;font-size:16px;">
            📸 Entregar mi Contenido
          </a>
        </div>

        <div style="background:#f3e8ff;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:0;"><strong>Tu nivel actual:</strong> {nivel_actual}</p>
          <p style="margin:4px 0 0;font-size:14px;color:#666;">{descripcion_nivel(nivel_actual)}</p>
        </div>

        {puntos_para_subir}

        <p style="font-size:14px;color:#666;">
          ¿Tuviste algún problema con el kit o necesitas más tiempo?
          Escríbenos y con gusto te ayudamos. 💜
        </p>

        <hr style="border:none;border-top:1px solid #e0d0ff;margin:20px 0;">
        <p style="font-size:12px;color:#999;text-align:center;">
          Brujería Capilar — Programa Creadoras<br>
          Para no recibir más correos del programa, responde a este email.
        </p>
      </div>
    </body></html>
    """

    return asunto, cuerpo


def enviar_email(destinatario: str, asunto: str, cuerpo_html: str, config: dict) -> bool:
    """
    Envía el email vía Gmail SMTP.
    Retorna True si fue exitoso.
    """
    email_cfg = config.get("email", {})
    sender = email_cfg.get("sender")
    app_password = email_cfg.get("app_password")

    if not sender or not app_password or sender == "YOUR_GMAIL@gmail.com":
        print("  ADVERTENCIA: Email no configurado en config_influencers.json")
        print("  Ver SETUP_INFLUENCERS.md → Sección 5 para configurar Gmail")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = asunto
    msg["From"] = f"Brujería Capilar <{sender}>"
    msg["To"] = destinatario
    msg.attach(MIMEText(cuerpo_html, "html", "utf-8"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(sender, app_password)
            server.send_message(msg)
        return True
    except Exception as e:
        print(f"  ERROR al enviar email a {destinatario}: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Enviar recordatorios de contenido pendiente a influencers"
    )
    parser.add_argument("--preview", action="store_true",
                        help="Mostrar lista sin enviar emails")
    parser.add_argument("--dias", type=int, default=None,
                        help="Override del plazo en días (default: config)")
    args = parser.parse_args()

    config = cargar_config()
    supabase = SupabaseClient()

    plazo_dias = args.dias if args.dias is not None else config.get("plazo_contenido_dias", 30)

    influencers = supabase.get_influencers_sin_contenido_tardios(plazo_dias)

    if not influencers:
        print(f"No hay influencers con más de {plazo_dias} días sin entregar contenido.")
        sys.exit(0)

    mode_label = "[PREVIEW] " if args.preview else ""
    print(f"\n{mode_label}Influencers con contenido pendiente ({plazo_dias}+ días): {len(influencers)}\n")
    print("-" * 60)

    enviados = 0
    fallidos = 0

    for inf in influencers:
        nombre = inf.get("nombre", "N/A")
        email = inf.get("email", "")
        fecha_envio = inf.get("fecha_envio", "N/A")
        nivel = inf.get("nivel_bruja", "Bruja Semilla")

        print(f"  {nombre}")
        print(f"    Email:        {email}")
        print(f"    Fecha envío:  {fecha_envio}")
        print(f"    Nivel:        {nivel}")

        if args.preview:
            print(f"    [PREVIEW] Se enviaría recordatorio a {email}")
        else:
            asunto, cuerpo = _construir_email(inf, config)
            ok = enviar_email(email, asunto, cuerpo, config)

            if ok:
                # Registrar que se envió el recordatorio para no duplicar
                supabase.update_influencer(inf["id"], {
                    "notas_equipo": (
                        (inf.get("notas_equipo") or "") +
                        f"\n[{datetime.now(timezone.utc).strftime('%Y-%m-%d')}] Recordatorio automático enviado."
                    ).strip()
                })
                print(f"    Recordatorio enviado ✓")
                enviados += 1
            else:
                print(f"    ERROR al enviar recordatorio ✗")
                fallidos += 1

        print()

    print("-" * 60)
    if args.preview:
        print(f"Total que recibirían recordatorio: {len(influencers)}")
        print("Ejecuta sin --preview para enviar los emails.")
    else:
        print(f"Enviados: {enviados}  |  Fallidos: {fallidos}")
    print()


if __name__ == "__main__":
    main()
