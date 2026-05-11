import json
import os
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

COOKIES_FILE = os.path.join(os.path.dirname(__file__), "tiktok_cookies.json")


def _load_cookies(context):
    if os.path.exists(COOKIES_FILE):
        with open(COOKIES_FILE, encoding="utf-8") as f:
            cookies = json.load(f)
        context.add_cookies(cookies)
        logger.info(f"  Sesión cargada ({len(cookies)} cookies)")
        return True
    logger.warning("  Sin cookies de sesión — ejecuta login.py primero para mayor efectividad")
    return False


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


def _scrape_perfil(page, handle: str) -> dict | None:
    """Visita el perfil de un usuario y extrae sus métricas."""
    try:
        page.goto(f"https://www.tiktok.com/@{handle}", timeout=20000, wait_until="domcontentloaded")
        _delay(2, 3)
        data = page.evaluate("""() => {
            const scripts = Array.from(document.querySelectorAll('script[id="__UNIVERSAL_DATA_FOR_REHYDRATION__"]'));
            if (scripts.length > 0) {
                try {
                    const d = JSON.parse(scripts[0].textContent);
                    const user = d?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo?.user;
                    const stats = d?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo?.stats;
                    if (user && stats) {
                        return {
                            uniqueId: user.uniqueId,
                            nickname: user.nickname,
                            signature: user.signature || '',
                            followerCount: stats.followerCount || 0,
                            videoCount: stats.videoCount || 0,
                            heartCount: stats.heartCount || 0,
                        };
                    }
                } catch(e) {}
            }
            // Fallback: extraer desde meta tags
            const desc = document.querySelector('meta[name="description"]')?.content || '';
            const followersMatch = desc.match(/([0-9.,]+[KkMm]?)\s*Followers/i);
            return followersMatch ? { followerCount_text: followersMatch[1] } : null;
        }""")
        return data
    except Exception as e:
        logger.debug(f"  Error scrapeando perfil @{handle}: {e}")
        return None


def _parse_count(val) -> int:
    if isinstance(val, (int, float)):
        return int(val)
    if isinstance(val, str):
        val = val.replace(",", "").strip().upper()
        if val.endswith("K"):
            return int(float(val[:-1]) * 1000)
        if val.endswith("M"):
            return int(float(val[:-1]) * 1_000_000)
        try:
            return int(val)
        except Exception:
            return 0
    return 0


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
        _load_cookies(context)
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

        # Primero visitar TikTok home para parecer más humano
        try:
            page.goto("https://www.tiktok.com", timeout=20000, wait_until="domcontentloaded")
            _delay(2, 3)
        except Exception:
            pass

        url = f"https://www.tiktok.com/tag/{hashtag}"
        logger.info(f"  → Navegando a {url}")
        try:
            page.goto(url, timeout=50000, wait_until="domcontentloaded")
        except PWTimeout:
            logger.warning(f"  Timeout cargando {url}")
            browser.close()
            return []

        _delay(5, 8)

        # Info de diagnóstico
        title = page.title()
        current_url = page.url
        logger.info(f"  Título: {title} | URL: {current_url}")

        # Detectar CAPTCHA
        if page.locator('[class*="captcha"], [id*="captcha"]').count() > 0:
            captcha_count += 1
            logger.warning("  ⚠ CAPTCHA detectado — esperando 30s para resolución manual...")
            time.sleep(30)

        # Detectar login wall / age gate
        body_text = page.evaluate("() => document.body?.innerText?.slice(0, 200) || ''")
        logger.info(f"  Body preview: {body_text[:100]}")

        # Esperar a que aparezcan videos en la página
        try:
            page.wait_for_selector('a[href*="/@"], [data-e2e="challenge-item"], video', timeout=15000)
            logger.info("  Contenido detectado en página")
        except Exception:
            logger.warning("  No se detectó contenido de videos — TikTok puede estar bloqueando")

        # Scrollear para cargar más videos
        for scroll_i in range(10):
            page.evaluate("window.scrollBy(0, window.innerHeight * 2)")
            _delay(1.5, 3)
            logger.debug(f"  Scroll {scroll_i + 1}/10 — interceptados: {len(interceptados)}")
            if len(interceptados) > 80:
                break

        # Fallback DOM: extraer handles de links @usuario si la intercepción no funcionó
        if not interceptados:
            logger.info("  Intercepción vacía — intentando extracción DOM...")
            handles_dom = page.evaluate(r"""() => {
                const links = Array.from(document.querySelectorAll('a[href*="/@"]'));
                const handles = links
                    .map(a => { const m = a.href.match(/\/@([^/?&#]+)/); return m ? m[1] : null; })
                    .filter(Boolean)
                    .filter((v, i, arr) => arr.indexOf(v) === i);
                return handles;
            }""")
            logger.info(f"  Handles encontrados en DOM: {len(handles_dom)}")

            # Si aún no hay nada, intentar extraer desde JSON embebido en la página
            if not handles_dom:
                logger.info("  Intentando extracción desde __NEXT_DATA__ / SIGI_STATE...")
                json_data = page.evaluate(r"""() => {
                    const scripts = [
                        ...Array.from(document.querySelectorAll('script[id="__UNIVERSAL_DATA_FOR_REHYDRATION__"]')),
                        ...Array.from(document.querySelectorAll('script[id="SIGI_STATE"]')),
                        ...Array.from(document.querySelectorAll('script[id="__NEXT_DATA__"]')),
                    ];
                    for (const s of scripts) {
                        try { return JSON.parse(s.textContent); } catch(e) {}
                    }
                    return null;
                }""")
                if json_data:
                    logger.info(f"  JSON embebido encontrado — keys: {list(json_data.keys())[:5] if isinstance(json_data, dict) else 'array'}")
                    # Intentar extraer items del JSON
                    items_from_json = []
                    try:
                        scope = json_data.get("__DEFAULT_SCOPE__", {})
                        challenge = scope.get("webapp.challenge-detail", {})
                        item_list = challenge.get("itemList", [])
                        items_from_json = item_list
                        logger.info(f"  Items en JSON: {len(items_from_json)}")
                    except Exception:
                        pass
                    interceptados.extend(items_from_json)

            # Convertir handles DOM a items mínimos
            for h in handles_dom[:max_perfiles]:
                interceptados.append({"author": {"uniqueId": h, "nickname": h, "followerCount": 0, "signature": ""}})

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

    # Segunda fase: visitar perfiles individuales si no se capturaron datos por intercepción
    handles_sin_datos = [h for h, a in autores_raw.items() if a["seguidores"] == 0]
    if handles_sin_datos:
        logger.info(f"  Visitando {len(handles_sin_datos)} perfiles individuales para obtener métricas...")
        with sync_playwright() as p2:
            b2 = p2.chromium.launch(headless=True, args=["--no-sandbox"])
            ctx2 = b2.new_context(user_agent=TIKTOK_UA, locale="es-CO")
            pg2 = ctx2.new_page()
            pg2.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            for h in handles_sin_datos[:max_perfiles]:
                datos = _scrape_perfil(pg2, h)
                if datos:
                    autores_raw[h]["seguidores"] = _parse_count(datos.get("followerCount") or datos.get("follower_count") or 0)
                    autores_raw[h]["bio"] = datos.get("signature") or autores_raw[h]["bio"]
                    autores_raw[h]["nombre_display"] = datos.get("nickname") or h
                    autores_raw[h]["videos_count"] = _parse_count(datos.get("videoCount") or 0)
                    autores_raw[h]["likes_totales"] = _parse_count(datos.get("heartCount") or 0)
                    logger.debug(f"  @{h}: {autores_raw[h]['seguidores']:,} seguidores")
                _delay(2, 4)
            b2.close()

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
