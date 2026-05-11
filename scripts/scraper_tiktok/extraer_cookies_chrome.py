"""
Extrae las cookies de TikTok directamente de tu Chrome real (donde ya estas logueada).
No necesita que inicies sesion de nuevo.

Uso: python extraer_cookies_chrome.py
Requiere tener Chrome cerrado.
"""
import json
import os
import browser_cookie3

COOKIES_FILE = os.path.join(os.path.dirname(__file__), "tiktok_cookies.json")


def extraer():
    print("\nExtrayendo cookies de TikTok desde Chrome...")
    print("IMPORTANTE: Chrome debe estar completamente cerrado.\n")

    try:
        jar = browser_cookie3.chrome(domain_name=".tiktok.com")
        cookies = []
        for c in jar:
            cookies.append({
                "name": c.name,
                "value": c.value,
                "domain": c.domain,
                "path": c.path or "/",
                "expires": c.expires or -1,
                "httpOnly": bool(getattr(c, "has_nonstandard_attr", lambda x: False)("HttpOnly")),
                "secure": bool(c.secure),
                "sameSite": "None",
            })

        if not cookies:
            print("No se encontraron cookies de TikTok en Chrome.")
            print("Asegurate de estar logueada en tiktok.com en Chrome.")
            return

        sesion_ok = any(c["name"] in ("sessionid", "sid_tt") for c in cookies)

        with open(COOKIES_FILE, "w", encoding="utf-8") as f:
            json.dump(cookies, f, indent=2)

        print(f"{'OK' if sesion_ok else 'ADVERTENCIA'}: {len(cookies)} cookies extraidas.")
        if sesion_ok:
            print("Sesion activa encontrada. Ya puedes enviar DMs.")
            print("  python enviar_dms.py --dry-run")
        else:
            names = [c["name"] for c in cookies]
            print(f"Cookies encontradas: {names}")
            print("No se detecto sesion activa (sessionid/sid_tt).")
            print("Asegurate de estar logueada en tiktok.com en Chrome.")

    except Exception as e:
        print(f"Error: {e}")
        print("Asegurate de cerrar Chrome completamente e intentar de nuevo.")


if __name__ == "__main__":
    extraer()
