"""
Scraper de Facebook para candidatas al Programa Creadoras de Brujería Capilar.
Busca creadoras de contenido de cabello/belleza en Colombia por palabras clave y hashtags.

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
from playwright.sync_api import sync_playwright

from filtros import calcular_colombia_score, detectar_nichos, calcular_tier, aplica_filtros

logger = logging.getLogger(__name__)

FB_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

COOKIES_FILE = os.path.join(os.path.dirname(__file__), "facebook_cookies.json")

# URLs internas de Facebook a ignorar
FB_BLACKLIST = {
    "messages", "chats", "notifications", "watch", "gaming", "marketplace",
    "groups", "events", "pages", "help", "legal", "policies", "about",
    "sharer", "dialog", "share", "plugins", "ads", "business", "login",
    "recover", "photo", "reel", "video", "story", "friends", "find-friends",
    "people", "memory", "saved", "settings", "privacy", "bookmarks",
    "fundraisers", "jobs", "news", "climate",
}


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
        _delay(1.5, 2.5)


def _parse_seguidores(texto: str) -> int:
    if not texto:
        return 0
    texto = texto.lower().replace(",", ".").replace("\xa0", "").replace(" ", "").replace(".", "")
    try:
        if "mil" in texto:
            num = float(re.sub(r"[^0-9.]", "", texto.replace("mil", "")))
            return int(num * 1000)
        if "k" in texto:
            num = float(re.sub(r"[^0-9.]", "", texto))
            return int(num * 1000)
        if "m" in texto and not "mil" in texto:
            num = float(re.sub(r"[^0-9.]", "", texto))
            return int(num * 1_000_000)
        digits = re.sub(r"[^0-9]", "", texto)
        return int(digits) if digits else 0
    except Exception:
        return 0


def _extraer_urls_de_pagina(page, max_perfiles: int) -> list:
    """Extrae URLs de perfil de los resultados visibles en la página usando JS."""
    urls = page.evaluate("""({blacklist, maxPerfiles}) => {
        const results = new Set();
        const links = document.querySelectorAll('a[href]');
        for (const a of links) {
            const href = a.href || '';
            if (!href.includes('facebook.com')) continue;
            const match = href.match(/facebook\\.com\\/([a-zA-Z0-9._\\-]{3,})(?:\\/|\\?|$)/);
            if (!match) continue;
            const segment = match[1].toLowerCase();
            if (blacklist.includes(segment)) continue;
            if (segment.startsWith('pg') || segment === 'home') continue;
            const slug = match[1].split('?')[0].split('#')[0];
            // Descartar páginas con ID numérico al final (p.ej. Colombia-107808062582712)
            if (/[A-Za-z]+-\\d{6,}$/.test(slug)) continue;
            const clean = 'https://www.facebook.com/' + slug;
            results.add(clean);
            if (results.size >= maxPerfiles) break;
        }
        return Array.from(results);
    }""", {"blacklist": list(FB_BLACKLIST), "maxPerfiles": max_perfiles})
    return urls


def _extraer_seguidores_json(page) -> int:
    """Busca follower/fan count en scripts JSON embebidos y meta tags."""
    try:
        resultado = page.evaluate("""() => {
            // 1. Scripts JSON embebidos (Relay data)
            const scripts = document.querySelectorAll('script[type="application/json"], script:not([src])');
            for (const s of scripts) {
                const txt = s.textContent || '';
                let m = txt.match(/"fan_count"\\s*:\\s*(\\d+)/);
                if (m) return parseInt(m[1]);
                m = txt.match(/"follower_count"\\s*:\\s*(\\d+)/);
                if (m) return parseInt(m[1]);
                m = txt.match(/"subscriber_count"\\s*:\\s*(\\d+)/);
                if (m) return parseInt(m[1]);
                m = txt.match(/"page_likers"\\s*:\\s*\\{[^}]*"count"\\s*:\\s*(\\d+)/);
                if (m) return parseInt(m[1]);
            }
            // 2. Meta description (muy fiable en páginas de Facebook)
            for (const sel of ['meta[name="description"]', 'meta[property="og:description"]']) {
                const el = document.querySelector(sel);
                if (!el) continue;
                const content = el.getAttribute('content') || '';
                if (/(Me gusta|seguidores|followers|fans)/i.test(content)) {
                    return '__meta__' + content;
                }
            }
            return 0;
        }""")
        if isinstance(resultado, str) and resultado.startswith('__meta__'):
            texto = resultado[8:]
            m = re.search(
                r'([\d\s.,]+(?:\s*(?:mil|K|M))?)\s*(?:Me gusta|seguidores|followers|fans)',
                texto, re.IGNORECASE
            )
            if m:
                return _parse_seguidores(m.group(1))
        return int(resultado or 0)
    except Exception:
        return 0


def _extraer_seguidores_texto(page) -> int:
    """Busca el texto visible de seguidores en la página."""
    try:
        resultado = page.evaluate("""() => {
            // Buscar en spans/divs con texto numérico + keyword
            const all = document.querySelectorAll('span, div, a');
            for (const el of all) {
                const txt = (el.textContent || '').trim();
                if (txt.length > 60) continue;
                if (/\\d/.test(txt) && /(seguidores|followers|fans|Me gusta)/i.test(txt)) {
                    return txt;
                }
            }
            // Fallback: walker de nodos de texto
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
                const txt = node.textContent.trim();
                if (/\\d/.test(txt) && /(seguidores|followers|fans)/i.test(txt)) {
                    return txt;
                }
            }
            return '';
        }""")
        if resultado:
            m = re.search(
                r'([\d\s.,]+(?:\s*(?:mil|K|M))?)\s*(?:Me gusta|seguidores|followers|fans)',
                resultado, re.IGNORECASE
            )
            if m:
                return _parse_seguidores(m.group(1))
    except Exception:
        pass
    return 0


def _scrape_perfil(page, profile_url: str) -> dict | None:
    """Visita el perfil y extrae métricas."""
    try:
        page.goto(profile_url, timeout=25000, wait_until="domcontentloaded")
        _delay(3, 5)

        # Si redirigió a login, chats u otra página interna, descartar
        current_url = page.url
        if any(x in current_url for x in ["/login", "/messages", "/chats", "checkpoint"]):
            logger.debug(f"  Redirigido a {current_url[:60]}, descartando")
            return None

        # Cerrar popups
        for sel in ['[aria-label="Cerrar"]', '[aria-label="Close"]']:
            try:
                btn = page.locator(sel).first
                if btn.count() > 0 and btn.is_visible(timeout=1500):
                    btn.click()
                    _delay(0.5, 1)
                    break
            except Exception:
                pass

        # Nombre — h1 o title
        nombre = None
        try:
            nombre = page.locator('h1').first.inner_text(timeout=3000).strip()
            if nombre in ("Chats", "Inicio", "Home", "Facebook", ""):
                nombre = None
        except Exception:
            pass
        if not nombre:
            try:
                title = page.title()
                if title and "|" in title:
                    nombre = title.split("|")[0].strip()
            except Exception:
                pass

        # Si el nombre sigue siendo genérico, no es un perfil válido
        if not nombre or nombre in ("Chats", "Inicio", "Home", "Facebook"):
            return None

        # Seguidores — primero JSON embebido (más preciso), luego texto visible
        seguidores = _extraer_seguidores_json(page)
        if seguidores == 0:
            seguidores = _extraer_seguidores_texto(page)

        # Bio
        bio = ""
        for sel in [
            '[data-ad-rendering-role="profile_intro_card"]',
            'div[data-pagelet="ProfileTilesFeed"]',
            'section[aria-label*="Información"]',
            'div[data-key="intro_card"]',
        ]:
            try:
                el = page.locator(sel).first
                if el.count() > 0:
                    bio = el.inner_text(timeout=2000).strip()
                    if bio and len(bio) > 5:
                        break
            except Exception:
                pass

        handle = profile_url.rstrip("/").split("/")[-1]
        texto_score = f"{bio} {nombre} {handle}"
        colombia_score, signals = calcular_colombia_score(texto_score)
        nichos = detectar_nichos(f"{bio} {nombre}")
        tier = calcular_tier(seguidores)

        return {
            "handle": handle,
            "nombre_display": nombre,
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


def _buscar_videos(page, termino: str, max_perfiles: int = 15) -> list:
    """Busca videos en Facebook por término y extrae URLs de autores."""
    url_busqueda = f"https://www.facebook.com/search/videos/?q={termino.replace(' ', '+')}"
    logger.info(f"  Buscando: {termino}")
    try:
        page.goto(url_busqueda, timeout=30000, wait_until="domcontentloaded")
        _delay(4, 6)
    except Exception as e:
        logger.warning(f"  Error: {e}")
        return []

    _scroll(page, veces=4)
    urls = _extraer_urls_de_pagina(page, max_perfiles)
    logger.info(f"  {len(urls)} perfiles encontrados")
    return urls


def _buscar_hashtag(page, hashtag: str, max_perfiles: int = 10) -> list:
    """Busca posts bajo un hashtag y extrae URLs de autores."""
    logger.info(f"  Hashtag: #{hashtag}")
    try:
        page.goto(f"https://www.facebook.com/hashtag/{hashtag}", timeout=30000, wait_until="domcontentloaded")
        _delay(3, 5)
    except Exception as e:
        logger.warning(f"  Error: {e}")
        return []

    _scroll(page, veces=3)
    urls = _extraer_urls_de_pagina(page, max_perfiles)
    logger.info(f"  {len(urls)} perfiles encontrados en #{hashtag}")
    return urls


def correr_scraper(busquedas: list, hashtags: list, max_por_termino: int = 15) -> list:
    """Ejecuta el scraper completo y devuelve lista de perfiles aptos."""
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

        # Verificar sesión
        page.goto("https://www.facebook.com", timeout=30000, wait_until="domcontentloaded")
        _delay(2, 3)
        if "login" in page.url or page.locator('[name="login"]').count() > 0:
            logger.info("  Facebook pide login — inicia sesión en el browser (90s)...")
            try:
                page.wait_for_url(lambda url: "login" not in url and "facebook.com" in url, timeout=90000)
                _delay(3, 4)
            except Exception:
                logger.warning("  No se detectó login, continuando...")
        else:
            logger.info("  Sesión activa")

        todas_urls = set()

        for termino in busquedas:
            urls = _buscar_videos(page, termino, max_por_termino)
            todas_urls.update(urls)
            _delay(3, 5)

        for tag in hashtags:
            urls = _buscar_hashtag(page, tag, max_por_termino)
            todas_urls.update(urls)
            _delay(3, 5)

        logger.info(f"\nTotal URLs únicas a visitar: {len(todas_urls)}")

        for url in todas_urls:
            if url in candidatas:
                continue
            _delay(2, 4)
            perfil = _scrape_perfil(page, url)
            if not perfil:
                continue
            candidatas[url] = perfil
            ok, razon = aplica_filtros(perfil)
            status = "✓" if ok else f"✗ {razon}"
            logger.info(
                f"  {perfil['nombre_display']:<35} | {perfil['seguidores']:>8,} seg | "
                f"score {perfil['colombia_score']:>3} | {status}"
            )

        browser.close()

    aptas = [p for p in candidatas.values() if aplica_filtros(p)[0]]
    logger.info(f"\nTotal visitadas: {len(candidatas)} | Aptas: {len(aptas)}")
    return aptas
