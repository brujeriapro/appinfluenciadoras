"""
Importa creadoras antiguas desde Excel a la app de Creadoras (Supabase via Railway).

Uso:
    python importar_creadoras_antiguas.py --dry-run    # solo muestra lo que importaría
    python importar_creadoras_antiguas.py              # importa en Railway
"""

import re
import sys
import json
import argparse
import requests
import openpyxl

# Evitar UnicodeEncodeError en consola Windows con emojis
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

EXCEL_PATH = r"C:\Users\maria\Downloads\creadoras brujeria antiguas.xlsx"
APP_URL = "https://appinfluenciadoras-production.up.railway.app"

# Credenciales admin — las mismas que usas para entrar al dashboard
IMPORT_TOKEN = "brujeria-import-2026"


def normalizar_telefono(tel):
    if not tel:
        return None
    # Si hay múltiples teléfonos separados por guión o espacio doble, tomar solo el primero
    texto = str(tel).strip()
    partes = re.split(r"\s*[-/]\s*|\s{2,}", texto)
    texto = partes[0].strip()

    digits = re.sub(r"\D", "", texto)
    if not digits:
        return None
    if digits.startswith("57") and len(digits) == 12:
        return digits
    if digits.startswith("58") and len(digits) == 12:
        return digits  # Venezuela — importar igual, sin normalizar
    if len(digits) == 10:
        return "57" + digits
    return None  # número inválido


def parse_seguidores(texto) -> int:
    if not texto:
        return 0
    texto = str(texto).lower().strip()
    texto = texto.replace("seguidores", "").replace("suscriptores", "").strip()
    # Si hay varios valores (ej: "8.390 y 17k en tiktok"), tomar el primero
    texto = re.split(r'\s+y\s+|\s+and\s+', texto)[0].strip()
    texto_limpio = texto.replace(",", ".").replace(" ", "").replace("\xa0", "")
    try:
        if re.search(r'millon', texto_limpio):
            num = float(re.sub(r"[^0-9.]", "", re.sub(r"millon\w*", "", texto_limpio)))
            return int(num * 1_000_000)
        if "mil" in texto_limpio:
            num = float(re.sub(r"[^0-9.]", "", texto_limpio.replace("mil", "")))
            return int(num * 1000)
        m = re.search(r'([\d.]+)\s*k', texto_limpio)
        if m:
            return int(float(m.group(1)) * 1000)
        if "m" in texto_limpio:
            m2 = re.search(r'([\d.]+)\s*m\b', texto_limpio)
            if m2:
                return int(float(m2.group(1)) * 1_000_000)
        digits_only = re.sub(r"[^0-9]", "", texto_limpio)
        return int(digits_only) if digits_only else 0
    except Exception:
        return 0


def calcular_tier(seg: int) -> str:
    if seg >= 100_000:
        return "Macro"
    if seg >= 10_000:
        return "Micro"
    return "Nano"


def limpiar_handle(handle, red_social):
    if not handle:
        return None, None
    h = str(handle).strip()
    # Si es una URL de Instagram, extraer el usuario
    m = re.search(r"instagram\.com/([^/?&\s]+)", h)
    if m:
        h = m.group(1)
    h = h.lstrip("@").lower().strip()
    if not h or h in ("none", "n/a", "-", ""):
        return None, None

    red = (red_social or "").upper()
    if "INSTA" in red or "IG" in red:
        return None, h   # instagram_handle
    else:
        return h, None   # tiktok_handle (default)


def cargar_excel(path):
    wb = openpyxl.load_workbook(path)
    ws = wb.active
    influencers = []
    vistos = set()

    for i, row in enumerate(ws.iter_rows(values_only=True), 1):
        if i == 1:
            continue  # skip header
        nombre, cel, email, ciudad, direccion, red, seg, usuario, cabello = row

        if not nombre or str(nombre).strip() in ("", "None"):
            continue

        nombre = str(nombre).strip()
        telefono = normalizar_telefono(cel)
        email = str(email).strip().lower() if email else None
        ciudad = str(ciudad).strip() if ciudad else None
        direccion = str(direccion).strip() if direccion else None
        seguidores = parse_seguidores(seg)
        tiktok_handle, instagram_handle = limpiar_handle(usuario, red)
        tier = calcular_tier(seguidores)

        # Dedup local por teléfono
        key = telefono or email or nombre
        if key in vistos:
            print(f"  [skip local] {nombre} — duplicado en el Excel")
            continue
        vistos.add(key)

        influencers.append({
            "nombre": nombre,
            "telefono": telefono,
            "email": email,
            "ciudad": ciudad,
            "direccion": direccion,
            "tiktok_handle": tiktok_handle,
            "instagram_handle": instagram_handle,
            "seguidores": seguidores,
            "tier": tier,
        })

    return influencers


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    influencers = cargar_excel(EXCEL_PATH)
    print(f"\n{'='*55}")
    print(f"  IMPORTACIÓN CREADORAS ANTIGUAS")
    print(f"{'='*55}")
    print(f"  Total en Excel     : {len(influencers)}")
    print(f"  Modo               : {'DRY RUN' if args.dry_run else 'PRODUCCIÓN'}")
    print(f"{'='*55}\n")

    for inf in influencers:
        print(f"  {inf['nombre']:<40} | {inf['tier']:<6} | {inf['seguidores']:>7,} seg | tel={inf['telefono']}")

    if args.dry_run:
        print(f"\n[DRY RUN] No se guardó nada. Corre sin --dry-run para importar.")
        return

    BATCH = 25
    total_creadas, total_omitidas, total_errores = [], [], []

    for i in range(0, len(influencers), BATCH):
        lote = influencers[i:i + BATCH]
        print(f"  Lote {i//BATCH + 1}/{(len(influencers)-1)//BATCH + 1} ({len(lote)} registros)...")
        try:
            resp = requests.post(
                f"{APP_URL}/api/admin/influencers/bulk-import",
                json={"influencers": lote, "token": IMPORT_TOKEN},
                timeout=90,
            )
            if not resp.ok:
                print(f"  ERROR {resp.status_code}: {resp.text[:300]}")
                continue
            data = resp.json()
            total_creadas.extend(data.get("creadas", []))
            total_omitidas.extend(data.get("omitidas", []))
            total_errores.extend(data.get("errores", []))
            print(f"    ✓ {len(data.get('creadas',[]))} creadas | {len(data.get('omitidas',[]))} omitidas | {len(data.get('errores',[]))} errores")
        except Exception as e:
            print(f"  ERROR en lote: {e}")

    print(f"\n{'='*55}")
    print(f"  RESULTADO FINAL")
    print(f"{'='*55}")
    print(f"  Creadas  : {len(total_creadas)}")
    print(f"  Omitidas : {len(total_omitidas)}")
    print(f"  Errores  : {len(total_errores)}")

    if total_omitidas:
        print("\nOMITIDAS (ya existían):")
        for o in total_omitidas:
            print(f"  - {o['nombre']}: {o['razon']}")

    if total_errores:
        print("\nERRORES:")
        for e in total_errores:
            print(f"  - {e['nombre']}: {e['error']}")

    print(f"\n✓ Listo. Verifica en: {APP_URL}")


if __name__ == "__main__":
    main()
