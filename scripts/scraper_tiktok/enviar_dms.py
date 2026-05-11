"""
Script local para enviar DMs de TikTok a candidatas aprobadas.

La cuenta @brujeriacapilar es una cuenta Business de TikTok.
Cuando se hace click en "Message" desde un perfil, puede abrir
/business-suite/messages en la misma pestaña o en una nueva.

Uso:
    python enviar_dms.py              # Enviar DMs pendientes (max 20)
    python enviar_dms.py --max 5      # Solo 5 DMs esta vez
    python enviar_dms.py --dry-run    # Simular sin enviar nada
"""

import json
import os
import time
import random
import argparse
import logging
from datetime import datetime
from playwright.sync_api import sync_playwright

from supabase_client import get_candidatas

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

COOKIES_FILE = os.path.join(os.path.dirname(__file__), "tiktok_cookies.json")
DMS_LOG_FILE = os.path.join(os.path.dirname(__file__), "dms_enviados.json")

TIKTOK_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

MENSAJE_TEMPLATE = (
    "Hello!! Hablas con Isa del equipo de creadoras de Brujeria Capilar.\n\n"
    "Bby te cuento que en BRUJERIA CAPILAR tenemos un club de content creators y tengo dos cupos disponibles para este mes.\n"
    "En el Club de Creadoras se registran creadoras que nos encantan para acceder a PR boxes y oportunidades de co-creacion.\n\n"
    "Nos encantaria poder contar contigo!! Te dejo el link donde puedes ver mas informacion y registrarte:\n"
    "https://tally.so/r/9qlKZ1"
)


def _load_dms_log() -> dict:
    if os.path.exists(DMS_LOG_FILE):
        with open(DMS_LOG_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_dms_log(log: dict):
    with open(DMS_LOG_FILE, "w", encoding="utf-8") as f:
        json.dump(log, f, indent=2, ensure_ascii=False)


def _delay(min_s=2, max_s=5):
    time.sleep(random.uniform(min_s, max_s))


def _cerrar_captcha(page):
    try:
        close_btn = page.locator(
            '[class*="captcha"] button, [id*="captcha"] button, '
            'div[role="dialog"] button[aria-label*="lose"], '
            'div[role="dialog"] button:has(svg)'
        ).first
        if close_btn.count() > 0 and close_btn.is_visible(timeout=2000):
            close_btn.click()
            _delay(1, 2)
    except Exception:
        pass


def _buscar_editor(target_page):
    """Busca el campo de texto en la página y en todos sus frames."""
    selectors = [
        'div[contenteditable="true"]',
        '[data-e2e="message-input"]',
        'div[role="textbox"]',
    ]
    for sel in selectors:
        try:
            els = target_page.locator(sel)
            if els.count() > 0 and els.last.is_visible(timeout=3000):
                logger.info(f"  Editor en página principal: {sel} (count={els.count()})")
                return els.last
        except Exception:
            continue
    for frame in target_page.frames:
        logger.info(f"  Revisando frame: {frame.url[:70]}")
        for sel in selectors:
            try:
                els = frame.locator(sel)
                if els.count() > 0 and els.last.is_visible(timeout=2000):
                    logger.info(f"  Editor en frame: {sel} (count={els.count()})")
                    return els.last
            except Exception:
                continue
    return None


def _enviar_en_pagina_business_suite(target_page, handle: str, nombre: str):
    """Envía DM desde la página de mensajes de TikTok."""
    _delay(4, 6)

    editor = _buscar_editor(target_page)

    if not editor:
        return False, "sin_editor"

    import subprocess
    subprocess.run('clip', input=MENSAJE_TEMPLATE.encode('utf-16le'), shell=True, check=True)

    editor.click(force=True)
    _delay(0.5, 1)
    target_page.keyboard.press("Control+v")
    _delay(1, 2)
    target_page.keyboard.press("Enter")
    _delay(3, 4)
    logger.info(f"  DM enviado a @{handle}")
    return True, "enviado"


def _seguir_perfil(page):
    """Sigue el perfil si no lo está siguiendo ya."""
    try:
        for sel in ['[data-e2e="follow-button"]', '[data-e2e="user-page-follow-button"]']:
            btn = page.locator(sel).first
            if btn.count() > 0 and btn.is_visible(timeout=2000):
                texto = btn.inner_text().strip()
                if "Following" in texto or "Friends" in texto:
                    logger.info(f"  Ya siguiendo ({texto})")
                    return
                btn.click(force=True)
                _delay(2, 3)
                logger.info("  Follow enviado")
                return
        btn = page.get_by_role("button", name="Follow")
        if btn.count() > 0 and btn.first.is_visible(timeout=2000):
            btn.first.click(force=True)
            _delay(2, 3)
            logger.info("  Follow enviado (fallback)")
    except Exception as e:
        logger.info(f"  No se pudo seguir: {e}")


def _enviar_dm(context, page, handle: str, nombre: str, dry_run: bool = False):
    """Navega al perfil y envía DM. Retorna (ok, razon)."""
    url = f"https://www.tiktok.com/@{handle}"
    logger.info(f"  Navegando a {url}")

    try:
        page.goto(url, timeout=30000, wait_until="domcontentloaded")
        _delay(3, 5)
    except Exception as e:
        return False, f"error_navegacion: {e}"

    # Cerrar banner "Got it"
    try:
        got_it = page.locator('button:has-text("Got it")').first
        if got_it.count() > 0 and got_it.is_visible(timeout=2000):
            got_it.click()
            _delay(1, 2)
    except Exception:
        pass

    _cerrar_captcha(page)
    _delay(2, 3)

    # Seguir el perfil antes de enviar el DM
    _seguir_perfil(page)
    _delay(2, 3)

    # Buscar botón Message
    selectors_boton = [
        '[data-e2e="message-icon"]',
        '[data-e2e="user-page-message-btn"]',
        'button:has-text("Message")',
        '[aria-label="Send message"]',
        'button[data-e2e*="message"]',
    ]

    message_btn = None
    for sel in selectors_boton:
        try:
            btn = page.locator(sel).first
            if btn.count() > 0 and btn.is_visible(timeout=2000):
                message_btn = btn
                logger.info(f"  Boton mensaje encontrado: {sel}")
                break
        except Exception:
            continue

    if not message_btn:
        logger.warning(f"  Sin boton de mensaje para @{handle}")
        return False, "sin_boton_mensaje"

    if dry_run:
        logger.info(f"  [DRY RUN] Enviaria DM a @{handle}")
        return True, "dry_run"

    try:
        # Intentar capturar nueva pestaña
        try:
            with context.expect_page(timeout=6000) as new_page_info:
                message_btn.click()
            new_page = new_page_info.value
            new_page.wait_for_load_state("domcontentloaded")
            logger.info(f"  Nueva pestaña: {new_page.url[:80]}")
        except Exception:
            # No abrió nueva pestaña — la navegación ocurrió en la misma pestaña
            # No hacer click de nuevo, el primero ya funcionó
            _delay(4, 6)
            new_page = None

        # Buscar Business Suite en TODAS las pestañas del contexto
        business_page = None
        _delay(2, 3)
        for ctx_page in context.pages:
            if "business-suite" in ctx_page.url or (
                "messages" in ctx_page.url and "tiktok.com" in ctx_page.url
            ):
                business_page = ctx_page
                logger.info(f"  Business Suite en pestaña: {ctx_page.url[:80]}")
                break

        if not business_page and new_page:
            business_page = new_page

        if business_page:
            resultado = _enviar_en_pagina_business_suite(business_page, handle, nombre)
            # Cerrar solo si es una pestaña distinta a la principal (page)
            if business_page != page:
                try:
                    business_page.close()
                except Exception:
                    pass
            return resultado

        # Fallback: misma página
        current_url = page.url
        logger.info(f"  URL: {current_url[:80]}")
        if "business-suite" in current_url or "messages" in current_url:
            return _enviar_en_pagina_business_suite(page, handle, nombre)

        return False, "sin_campo_texto"


def main():
    parser = argparse.ArgumentParser(description="Enviar DMs TikTok a candidatas aprobadas")
    parser.add_argument("--max", type=int, default=20, help="Maximo de DMs a enviar (default 20)")
    parser.add_argument("--dry-run", action="store_true", help="Simular sin enviar")
    args = parser.parse_args()

    if not os.path.exists(COOKIES_FILE):
        print("\nERROR: No hay sesion guardada.")
        print("Exporta las cookies con Cookie-Editor desde Chrome y guarda como tiktok_cookies.json\n")
        return

    dms_log = _load_dms_log()
    candidatas = get_candidatas(status="registrada", limit=500)
    pendientes = [c for c in candidatas if c["tiktok_handle"] not in dms_log]

    logger.info(f"Aprobadas: {len(candidatas)} | Pendientes de DM: {len(pendientes)}")

    if not pendientes:
        logger.info("No hay candidatas pendientes de DM.")
        return

    enviados = 0
    errores = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            user_agent=TIKTOK_UA,
            viewport={"width": 1280, "height": 800},
            locale="es-CO",
        )
        with open(COOKIES_FILE, encoding="utf-8") as f:
            cookies = json.load(f)
        context.add_cookies(cookies)

        page = context.new_page()
        page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

        for candidata in pendientes[: args.max]:
            handle = candidata["tiktok_handle"]
            nombre = candidata.get("nombre_display") or handle

            logger.info(f"\n>>> @{handle} ({nombre})")
            ok, razon = _enviar_dm(context, page, handle, nombre, dry_run=args.dry_run)

            if ok:
                enviados += 1
            else:
                errores += 1

            if not args.dry_run:
                dms_log[handle] = {
                    "fecha": datetime.now().isoformat(),
                    "estado": razon,
                    "nombre": nombre,
                }
                _save_dms_log(dms_log)

            if not args.dry_run and (enviados + errores) < args.max:
                pausa = random.uniform(20, 45)
                logger.info(f"  Pausa {pausa:.0f}s...")
                time.sleep(pausa)

        browser.close()

    print(f"\n{'[DRY RUN] ' if args.dry_run else ''}Resultado: {enviados} enviados | {errores} sin boton/error")
    print(f"Log: {DMS_LOG_FILE}")


if __name__ == "__main__":
    main()
