"""Debug: visita un perfil de Facebook y muestra qué texto contiene seguidores."""
import json, re, time
from playwright.sync_api import sync_playwright

COOKIES_FILE = "facebook_cookies.json"
# Perfil de prueba — una página de belleza colombiana pública
TEST_URL = "https://www.facebook.com/trenzasafrocolombia"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False, args=["--no-sandbox"])
    ctx = browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        viewport={"width": 1280, "height": 800},
        locale="es-CO",
    )
    with open(COOKIES_FILE, encoding="utf-8") as f:
        ctx.add_cookies(json.load(f))

    page = ctx.new_page()
    page.goto(TEST_URL, timeout=30000, wait_until="domcontentloaded")
    time.sleep(5)

    html = page.content()

    # Buscar todas las líneas que contienen "seguidor" o "follower"
    print("\n=== LÍNEAS CON 'SEGUIDOR' O 'FOLLOWER' ===")
    for line in html.split("\n"):
        if re.search(r"seguidor|follower|likes", line, re.IGNORECASE):
            clean = re.sub(r"<[^>]+>", " ", line).strip()
            if clean and len(clean) < 200:
                print(repr(clean))

    # Buscar en JSON embebido
    print("\n=== DATOS JSON CON SEGUIDORES ===")
    matches = re.findall(r'"follower_count"\s*:\s*(\d+)', html)
    print("follower_count:", matches)
    matches2 = re.findall(r'"fan_count"\s*:\s*(\d+)', html)
    print("fan_count:", matches2)
    matches3 = re.findall(r'"subscriber_count"\s*:\s*(\d+)', html)
    print("subscriber_count:", matches3)

    # Texto visible de la página
    print("\n=== TEXTO VISIBLE DE H1 Y SECCIONES ===")
    try:
        print("H1:", page.locator("h1").first.inner_text())
    except:
        pass
    for sel in ["[data-key='intro_card']", "div[data-pagelet] span", "section span"]:
        try:
            texts = page.locator(sel).all_inner_texts()
            for t in texts[:5]:
                if t.strip():
                    print(f"  [{sel}]:", repr(t.strip()[:100]))
        except:
            pass

    browser.close()
    print("\nDone.")
