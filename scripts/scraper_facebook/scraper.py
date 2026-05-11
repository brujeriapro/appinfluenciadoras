"""
Scraper de Facebook para candidatas al Programa Creadoras de Brujería Capilar.

Busca creadoras de contenido de cabello/belleza en Colombia buscando
en Reels de Facebook por palabras clave y hashtags.

Uso:
    python run.py              # scrape completo
    python run.py --dry-run    # solo imprime, no guarda en Supabase
    python run.py --max 20     # máximo 20 perfiles por término de búsqueda
"""

import json
import os
import re
import time
import random
import logging
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

from filtros import calcular_colombia_score, detectar_nichos, calcular_tier, aplica_filtros

logger = logging.getLogger(__name__)

FB_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

COOKIES_FILE = os.path.join(os.path.dirname(__file__), "facebook_cookies.json")


def _load_cookies(context):
    if not os.path.exists(COOKIES_FILE):
        logger.warning("Sin cookies de Facebook — exporta con Cookie-Editor primero")
        return False
    with open(COOKIES_FILE, encoding="utf-8") as f:
        cookies = json.load(f)
    context.add_cookies(cookies)
    logger.info(f"  Sesión cargada ({len(cookies)} cookies)")
    return True


def _delay(min_s=2, max_s=5):
    time.sleep(random.uniform(min_s, max_s))


def _scroll(page, veces=3):
    for _ in range(veces):
        page.evaluate("window.scrollBy(0, window.innerHeight * 1.5)")
        _delay(1.5, 3)


def _parse_seguidores(texto: str) -> int:
    """Convierte '12,3 mil' o '1.2M' o '45 000' en int."""
    if not texto:
        return 0
    texto = texto.lower().replace(",", ".").replace("\xa0", "").replace(" ", "")
    try:
        if "mil" in texto or "k" in texto:
            num = float(re.sub(r"[^0-9.]", "", texto))
            return int(num * 1000)
        if "m" in texto:
            num = float(re.sub(r"[^0-9.]", "", texto))
            return int(num * 1_000_000)
        return int(re.sub(r"[^0-9]", "", texto))
    except Exception:
        return 0


def _extraer_handle(url: str) -> str:
    """Extrae el username de una URL de Facebook."""
    if not url:
        return ""
    url = url.split("?")[0].rstrip("/")
    # facebook.com/username o facebook.com/profile.php?id=123
    parts = url.split("/")
    if "profile.php" in url:
        return url  # usamos la URL completa como identificador
    if len(parts) >= 4:
        handle = parts[-1] or parts[-2]
        if handle and handle not in ("about", "videos", "reels", "posts", "photos"):
            return handle
    return url


def _scrape_perfil(page, profile_url: str) -> dict | None:
    """Visita el perfil de una página/persona y extrae métricas."""
    try:
        page.goto(profile_url, timeout=25000, wait_until="domcontentloaded")
        _delay(3, 5)

        # Cerrar popups
        for sel in ['[aria-label="Cerrar"]', '[aria-label="Close"]', 'div[role="dialog"] [role="button"]']:
            try:
                btn = page.locator(sel).first
                if btn.count() > 0 and btn.is_visible(timeout=1500):
                    btn.click()
                    _delay(0.5, 1)
                    break
            except Exception:
                pass

        html = page.content()

        # Nombre
        nombre = None
        try:
            nombre = page.locator('h1').first.inner_text(timeout=3000).strip()
        except Exception:
            pass

        # Seguidores — buscar en texto de la página
        seguidores = 0
        for pat in [
            r"([\d\s.,]+(?:mil|k|M)?)\s*(?:seguidores|followers)",
            r"(?:seguidores|followers)[:\s]*([\d\s.,]+(?:mil|k|M)?)",
        ]:
            m = re.search(pat, html, re.IGNORECASE)
            if m:
                seguidores = _parse_seguidores(m.group(1))
                if seguidores > 0:
                    break

        # Bio / descripción
        bio = ""
        for sel in [
            '[data-ad-rendering-role="profile_intro_card"]',
            'div[data-pagelet="ProfileTilesFeed"] span',
            'div[data-key="intro_card"] span',
        ]:
            try:
                el = page.locator(sel).first
                if el.count() > 0:
                    bio = el.inner_text(timeout=2000).strip()
                    if bio:
                        break
            except Exception:
                pass

        # También buscar en el HTML
        if not bio:
            m = re.search(r'"bio":"([^"]{10,200})"', html)
            if m:
                bio = m.group(1)

        handle = _extraer_handle(profile_url)
        colombia_score, signals = calcular_colombia_score(bio)
        nichos = detectar_nichos(bio)
        tier = calcular_tier(seguidores)

        return {
            "handle": handle,
            "nombre_display": nombre or handle,
            "profile_url": profile_url,
            "bio": bio[:300] if bio else "",
            "seguidores": seguidores,
            "colombia_score": colombia_score,
            "colombia_signals": signals,
            "nichos": nichos,
            "tier_estimado": tier,
            "plataforma": "facebook",
        }

    except Exception as e:
        logger.debug(f"Error scrapeando {profile_url}: {e}")
        return None


def _buscar_reels(page, termino: str, max_perfiles: int = 15) -> list:
    """Busca Reels en Facebook por un término y devuelve URLs de perfil de autores."""
    perfiles_urls = set()
    url_busqueda = f"https://www.facebook.com/search/videos/?q={termino.replace(' ', '+')}"

    logger.info(f"  Buscando: {termino}")
    try:
        page.goto(url_busqueda, timeout=30000, wait_until="domcontentloaded")
        _delay(4, 6)
    except Exception as e:
        logger.warning(f"  Error navegando a búsqueda: {e}")
        return []

    # Cerrar login popup si aparece
    for sel in ['[aria-label="Cerrar"]', '[aria-label="Close"]', 'div[role="dialog"] a[role="button"]']:
        try:
            btn = page.locator(sel).first
            if btn.count() > 0 and btn.is_visible(timeout=2000):
                btn.click()
                _delay(1, 2)
                break
        except Exception:
            pass

    # Scroll para cargar más resultados
    _scroll(page, veces=4)

    # Extraer links a perfiles de autores desde el HTML
    html = page.content()

    # Buscar URLs de perfil de Facebook en el HTML
    patron_perfil = re.compile(
        r'href="(https://www\.facebook\.com/(?!search|hashtag|watch|groups|events|pages|marketplace|gaming|help|legal|policies|about|sharer|dialog|share|plugins|video)([a-zA-Z0-9._\-]{3,}))(?:/(?:videos|reels|posts|photos))?[/?"]'
    )

    for m in patron_perfil.finditer(html):
        url = m.group(1).split("?")[0].rstrip("/")
        if url not in perfiles_urls:
            perfiles_urls.add(url)
        if len(perfiles_urls) >= max_perfiles:
            break

    logger.info(f"  {len(perfiles_urls)} perfiles encontrados")
    return list(perfiles_urls)


def _buscar_hashtag(page, hashtag: str, max_perfiles: int = 10) -> list:
    """Busca posts bajo un hashtag de Facebook."""
    url = f"https://www.facebook.com/hashtag/{hashtag}"
    logger.info(f"  Hashtag: #{hashtag}")
    try:
        page.goto(url, timeout=30000, wait_until="domcontentloaded")
        _delay(3, 5)
    except Exception as e:
        logger.warning(f"  Error navegando a #{hashtag}: {e}")
        return []

    _scroll(page, veces=3)

    html = page.content()
    perfiles_urls = set()
    patron_perfil = re.compile(
        r'href="(https://www\.facebook\.com/(?!search|hashtag|watch|groups|events|pages|marketplace|gaming|help|legal|policies|about|sharer|dialog|share|plugins|video)([a-zA-Z0-9._\-]{3,}))(?:/(?:videos|reels|posts|photos))?[/?"]'
    )
    for m in patron_perfil.finditer(html):
        url_perfil = m.group(1).split("?")[0].rstrip("/")
        perfiles_urls.add(url_perfil)
        if len(perfiles_urls) >= max_perfiles:
            break

    logger.info(f"  {len(perfiles_urls)} perfiles encontrados en #{hashtag}")
    return list(perfiles_urls)


def correr_scraper(busquedas: list, hashtags: list, max_por_termino: int = 15) -> list:
    """Ejecuta el scraper completo y devuelve lista de perfiles."""
    candidatas = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            user_agent=FB_UA,
            viewport={"width": 1280, "height": 800},
            locale="es-CO",
        )
        context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )
        _load_cookies(context)
        page = context.new_page()

        # 1. Búsquedas por término
        for termino in busquedas:
            urls = _buscar_reels(page, termino, max_por_termino)
            for url in urls:
                if url not in candidatas:
                    _delay(2, 4)
                    perfil = _scrape_perfil(page, url)
                    if perfil:
                        candidatas[url] = perfil
                        ok, razon = aplica_filtros(perfil)
                        status = "✓" if ok else f"✗ {razon}"
                        logger.info(
                            f"  {perfil['nombre_display']} | {perfil['seguidores']:,} seg | "
                            f"score {perfil['colombia_score']} | {status}"
                        )
            _delay(3, 6)

        # 2. Hashtags
        for tag in hashtags:
            urls = _buscar_hashtag(page, tag, max_por_termino)
            for url in urls:
                if url not in candidatas:
                    _delay(2, 4)
                    perfil = _scrape_perfil(page, url)
                    if perfil:
                        candidatas[url] = perfil
                        ok, razon = aplica_filtros(perfil)
                        status = "✓" if ok else f"✗ {razon}"
                        logger.info(
                            f"  {perfil['nombre_display']} | {perfil['seguidores']:,} seg | "
                            f"score {perfil['colombia_score']} | {status}"
                        )
            _delay(3, 6)

        browser.close()

    # Filtrar solo aptas
    aptas = [p for p in candidatas.values() if aplica_filtros(p)[0]]
    logger.info(f"\nTotal scrapeadas: {len(candidatas)} | Aptas: {len(aptas)}")
    return aptas
