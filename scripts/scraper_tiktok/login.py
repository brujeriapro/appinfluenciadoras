"""
Guarda la sesion de TikTok para el scraper.
Abre un browser, inicia sesion ahi, y guarda las cookies automaticamente.
"""
import json
import os
import time
from playwright.sync_api import sync_playwright

COOKIES_FILE = os.path.join(os.path.dirname(__file__), "tiktok_cookies.json")

TIKTOK_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


def save_login():
    print("\n============================================================")
    print("  GUARDAR SESION DE TIKTOK")
    print("============================================================")
    print("\nSe abre un browser con TikTok.")
    print("Inicia sesion ahi con la cuenta de la marca.")
    print("Las cookies se guardan automaticamente cuando detecte tu sesion.")
    print("Tienes hasta 5 minutos.\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled", "--start-maximized"],
        )
        context = browser.new_context(
            user_agent=TIKTOK_UA,
            viewport=None,  # usar la ventana maximizada
            locale="es-CO",
            no_viewport=True,
        )
        page = context.new_page()
        page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

        # Ir a la pagina de login con todas las opciones (QR, Google, email, etc.)
        page.goto("https://www.tiktok.com/login", wait_until="domcontentloaded")

        print("Browser abierto. Inicia sesion en la ventana que se abrio...")
        print("Esperando hasta 5 minutos...\n")

        # Esperar hasta 5 minutos a que aparezca sessionid
        for i in range(300):
            time.sleep(1)
            if i % 15 == 0 and i > 0:
                mins = (300 - i) // 60
                segs = (300 - i) % 60
                print(f"  {mins}m {segs}s restantes...")
            cookies = context.cookies()
            cookie_names = [c["name"] for c in cookies]
            if "sessionid" in cookie_names or "sid_tt" in cookie_names:
                print("\nSesion detectada!")
                break
        else:
            print("\nTiempo agotado.")

        time.sleep(3)
        cookies = context.cookies()

        with open(COOKIES_FILE, "w", encoding="utf-8") as f:
            json.dump(cookies, f, indent=2)

        sesion_ok = any(c["name"] in ("sessionid", "sid_tt") for c in cookies)
        if sesion_ok:
            print(f"OK: {len(cookies)} cookies guardadas con sesion activa.")
            print("Ya puedes enviar DMs: python enviar_dms.py --dry-run")
        else:
            print(f"ADVERTENCIA: {len(cookies)} cookies guardadas pero SIN sesion activa.")
            print("Intenta de nuevo e inicia sesion antes de que se acabe el tiempo.")

        browser.close()


if __name__ == "__main__":
    save_login()
