import json
import time
import random
import logging
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

from filtros import calcular_colombia_score, detectar_nichos, calcular_tier, aplica_filtros

logger = logging.getLogger(__name__)

TIKTOK_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


def _delay(min_s=2, max_s=5):
    time.sleep(random.uniform(min_s, max_s))


def _extraer_autor(item: dict) -> dict | None:
    """Extrae datos de autor desde un item de la API interna de TikTok."""
    try:
        author = item.get("author") or item.get("authorInfo") or {}
        stats = item.get("authorStats") or item.get("stats") or {}
        video = item.get("video") or item.get("itemInfo", {}).get("itemStruct", {}).get("video", {})

        handle = author.get("uniqueId") or author.get("id")
        if not handle:
            return None

        seguidores = (
            author.get("followerCount") or
            stats.get("followerCount") or
            author.get("fans") or 0
        )
        bio = author.get("signature") or author.get("bioLink", {}).get("link") or ""
        vistas_video = (
            item.get("stats", {}).get("playCount") or
            item.get("statsV2", {}).get("playCount") or
            video.get("playCount") or 0
        )

        return {
            "handle": handle,
            "nombre_display": author.get("nickname") or handle,
            "bio": bio,
            "seguidores": int(seguidores),
            "likes_totales": int(author.get("heartCount") or author.get("diggCount") or 0),
            "videos_count": int(author.get("videoCount") or 0),
            "vistas_video_actual": int(vistas_video),
        }
    except Exception as e:
        logger.debug(f"Error extrayendo autor: {e}")
        return None


def scrapear_hashtag(hashtag: str, max_perfiles: int = 40, dry_run: bool = False) -> list[dict]:
    """
    Navega tiktok.com/tag/{hashtag}, intercepta la API interna y extrae perfiles.
    Retorna lista de candidatas que pasan los filtros mínimos.
    """
    candidatas = []
    perfiles_vistos = set()
    captcha_count = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,  # False para evitar detección; cambiar a True en producción estable
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            user_agent=TIKTOK_UA,
            viewport={"width": 1280, "height": 800},
            locale="es-CO",
        )
        page = context.new_page()
        page.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

        interceptados = []

        def handle_response(response):
            try:
                url = response.url
                if any(x in url for x in [
                    "/api/recommend/item_list",
                    "/api/post/item_list",
                    "/api/search/",
                    "item_list",
                    "aweme/v1/feed",
                ]):
                    data = response.json()
                    items = (
                        data.get("itemList") or
                        data.get("data", {}).get("videos") or
                        data.get("aweme_list") or
                        []
                    )
                    interceptados.extend(items)
            except Exception:
                pass

        page.on("response", handle_response)

        url = f"https://www.tiktok.com/tag/{hashtag}"
        logger.info(f"  → Navegando a {url}")
        try:
            page.goto(url, timeout=30000, wait_until="domcontentloaded")
        except PWTimeout:
            logger.warning(f"  Timeout cargando {url}")
            browser.close()
            return []

        _delay(3, 6)

        # Detectar CAPTCHA
        if page.locator('[class*="captcha"], [id*="captcha"]').count() > 0:
            captcha_count += 1
            logger.warning("  ⚠ CAPTCHA detectado — esperando 5 minutos...")
            time.sleep(300)
            if captcha_count >= 2:
                logger.error("  Demasiados CAPTCHAs — abortando")
                browser.close()
                return []

        # Scrollear para cargar más videos
        for scroll_i in range(6):
            page.evaluate("window.scrollBy(0, window.innerHeight * 2)")
            _delay(2, 4)
            logger.debug(f"  Scroll {scroll_i + 1}/6 — interceptados: {len(interceptados)}")
            if len(interceptados) > 80:
                break

        browser.close()

    # Procesar items interceptados
    vistas_por_handle: dict[str, list] = {}
    autores_raw: dict[str, dict] = {}

    for item in interceptados:
        autor = _extraer_autor(item)
        if not autor or not autor["handle"]:
            continue
        h = autor["handle"]
        if h not in autores_raw:
            autores_raw[h] = autor
        if autor["vistas_video_actual"] > 0:
            vistas_por_handle.setdefault(h, []).append(autor["vistas_video_actual"])

    logger.info(f"  Perfiles únicos encontrados: {len(autores_raw)}")

    for handle, autor in autores_raw.items():
        if handle in perfiles_vistos:
            continue
        perfiles_vistos.add(handle)

        vistas_list = vistas_por_handle.get(handle, [])
        vistas_promedio = int(sum(vistas_list) / len(vistas_list)) if vistas_list else 0

        colombia_score, colombia_signals = calcular_colombia_score(autor["bio"], hashtag)
        nichos = detectar_nichos(autor["bio"])
        tier = calcular_tier(autor["seguidores"])

        perfil = {
            "tiktok_handle": handle,
            "nombre_display": autor["nombre_display"],
            "bio": autor["bio"],
            "seguidores": autor["seguidores"],
            "likes_totales": autor["likes_totales"],
            "videos_count": autor["videos_count"],
            "vistas_promedio": vistas_promedio,
            "colombia_score": colombia_score,
            "colombia_signals": colombia_signals,
            "nichos": nichos,
            "hashtags_origen": [hashtag],
            "tier_estimado": tier,
        }

        pasa, razon = aplica_filtros(perfil)
        if not pasa:
            logger.debug(f"  ✗ @{handle} ({autor['seguidores']} seg, {vistas_promedio} vistas, col:{colombia_score}) — {razon}")
            continue

        logger.info(f"  ✓ @{handle} | {autor['seguidores']:,} seg | {vistas_promedio:,} vistas | Colombia: {colombia_score} | {tier}")
        candidatas.append(perfil)

        if len(candidatas) >= max_perfiles:
            break

    return candidatas
