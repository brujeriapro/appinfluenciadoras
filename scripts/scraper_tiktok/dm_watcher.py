"""
Corre en segundo plano y envia DMs de TikTok automaticamente
cuando se aprueba una candidata en el dashboard.

Revisa Supabase cada 20 segundos. Si encuentra candidatas aprobadas
sin DM enviado, abre TikTok y manda el mensaje.

Uso: python dm_watcher.py
Dejar corriendo mientras trabajas en el dashboard.
Ctrl+C para detener.
"""
import json
import os
import time
import random
import logging
from datetime import datetime
from playwright.sync_api import sync_playwright

from supabase_client import get_candidatas

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

COOKIES_FILE = os.path.join(os.path.dirname(__file__), "tiktok_cookies.json")
DMS_LOG_FILE = os.path.join(os.path.dirname(__file__), "dms_enviados.json")
INTERVALO_SEGUNDOS = 20   # revisar cada 20 segundos
MAX_DMS_POR_SESION = 10

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


def _load_log():
    if os.path.exists(DMS_LOG_FILE):
        with open(DMS_LOG_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_log(log):
    with open(DMS_LOG_FILE, "w", encoding="utf-8") as f:
        json.dump(log, f, indent=2, ensure_ascii=False)


def _delay(min_s, max_s):
    time.sleep(random.uniform(min_s, max_s))


def _cerrar_overlays(page):
    for sel in ['button:has-text("Got it")', 'button:has-text("OK")', 'button[aria-label*="lose"]']:
        try:
            btn = page.locator(sel).first
            if btn.count() > 0 and btn.is_visible(timeout=1500):
                btn.click()
                _delay(0.5, 1)
        except Exception:
            pass


SCREENSHOT_DIR = os.path.dirname(__file__)

def _buscar_editor(target_page):
    """Busca el campo de texto en la página y en todos sus frames."""
    selectors = [
        'div[contenteditable="true"]',
        '[data-e2e="message-input"]',
        'div[role="textbox"]',
    ]

    # 1. Buscar en la página principal
    for sel in selectors:
        try:
            els = target_page.locator(sel)
            if els.count() > 0 and els.last.is_visible(timeout=3000):
                logger.info(f"  Editor en página principal: {sel} (count={els.count()})")
                return els.last
        except Exception:
            continue

    # 2. Buscar en cada frame
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


def _enviar_en_pagina_business_suite(target_page, handle, nombre):
    """Envía DM desde la página de mensajes de TikTok."""
    _delay(4, 6)

    editor = _buscar_editor(target_page)

    if not editor:
        try:
            shot_path = os.path.join(SCREENSHOT_DIR, "debug_ultimo_error.png")
            target_page.screenshot(path=shot_path)
            logger.info(f"  Screenshot: {shot_path}")
        except Exception:
            pass
        return False, "sin_editor"

    # Copiar mensaje al portapapeles de Windows y pegarlo con Ctrl+V
    # Así el texto llega completo en un solo mensaje sin que Enter corte párrafos
    import subprocess
    subprocess.run('clip', input=MENSAJE_TEMPLATE.encode('utf-16le'), shell=True, check=True)

    editor.click(force=True)
    _delay(0.5, 1)
    target_page.keyboard.press("Control+v")
    _delay(1, 2)
    target_page.keyboard.press("Enter")
    _delay(3, 4)
    return True, "enviado"


def _seguir_perfil(page):
    """Sigue el perfil si no lo está siguiendo ya."""
    try:
        # data-e2e es el selector más confiable en TikTok
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
        # Fallback por texto
        btn = page.get_by_role("button", name="Follow")
        if btn.count() > 0 and btn.first.is_visible(timeout=2000):
            btn.first.click(force=True)
            _delay(2, 3)
            logger.info("  Follow enviado (fallback)")
    except Exception as e:
        logger.info(f"  No se pudo seguir: {e}")


def _enviar_dm(context, page, handle, nombre):
    try:
        page.goto(f"https://www.tiktok.com/@{handle}", timeout=30000, wait_until="domcontentloaded")
        _delay(3, 5)
        _cerrar_overlays(page)
        _delay(1, 2)

        # Seguir el perfil antes de enviar el DM
        _seguir_perfil(page)
        _delay(2, 3)

        # Buscar botón Message
        btn = None
        try:
            b = page.get_by_role("button", name="Message")
            if b.count() > 0 and b.first.is_visible(timeout=3000):
                btn = b.first
        except Exception:
            pass

        if not btn:
            for sel in [
                '[data-e2e="user-page-message-btn"]',
                '[data-e2e="message-icon"]',
                'button:has-text("Message")',
                '[aria-label="Send message"]',
            ]:
                try:
                    b = page.locator(sel).first
                    if b.count() > 0 and b.is_visible(timeout=2000):
                        btn = b
                        break
                except Exception:
                    continue

        if not btn:
            return False, "sin_boton_mensaje"

        # Cerrar overlays que puedan bloquear el click
        _cerrar_overlays(page)
        _delay(0.5, 1)

        # Intentar capturar nueva pestaña
        try:
            with context.expect_page(timeout=6000) as new_page_info:
                btn.click(force=True)
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

    except Exception as e:
        return False, str(e)


def procesar_pendientes(pendientes):
    if not pendientes:
        return

    logger.info(f"Enviando DMs a {len(pendientes)} candidata(s)...")
    log = _load_log()

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
        )
        ctx = browser.new_context(
            user_agent=TIKTOK_UA,
            viewport={"width": 1280, "height": 800},
            locale="es-CO",
        )
        with open(COOKIES_FILE, encoding="utf-8") as f:
            ctx.add_cookies(json.load(f))
        page = ctx.new_page()
        page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

        for c in pendientes[:MAX_DMS_POR_SESION]:
            handle = c["tiktok_handle"]
            nombre = c.get("nombre_display") or handle
            logger.info(f"  DM a @{handle}...")
            ok, razon = _enviar_dm(ctx, page, handle, nombre)
            log[handle] = {"fecha": datetime.now().isoformat(), "estado": razon, "nombre": nombre}
            _save_log(log)
            if ok:
                logger.info(f"  OK: DM enviado a @{handle}")
            else:
                logger.info(f"  Error en @{handle}: {razon}")
            _delay(20, 40)

        browser.close()


def main():
    if not os.path.exists(COOKIES_FILE):
        print("ERROR: No hay sesion de TikTok. Exporta las cookies con Cookie-Editor primero.")
        return

    print("\n" + "=" * 50)
    print("  DM WATCHER — Brujeria Capilar")
    print("=" * 50)
    print(f"Revisando cada {INTERVALO_SEGUNDOS} segundos.")
    print("Cuando apruebes una candidata en el dashboard,")
    print("el DM se enviara automaticamente.")
    print("Ctrl+C para detener.\n")

    while True:
        try:
            log = _load_log()
            candidatas = get_candidatas(status="registrada", limit=500)
            pendientes = [c for c in candidatas if c["tiktok_handle"] not in log]

            if pendientes:
                logger.info(f"Nueva(s) aprobada(s): {[c['tiktok_handle'] for c in pendientes]}")
                procesar_pendientes(pendientes)
            else:
                logger.info(f"Sin pendientes. Proxima revision en {INTERVALO_SEGUNDOS}s...")

            time.sleep(INTERVALO_SEGUNDOS)

        except KeyboardInterrupt:
            print("\nWatcher detenido.")
            break
        except Exception as e:
            logger.error(f"Error: {e}")
            time.sleep(30)


if __name__ == "__main__":
    main()
