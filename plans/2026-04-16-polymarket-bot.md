# Plan: Polymarket Trading Bot — Weather Markets

**Fecha:** 2026-04-16  
**Estado:** En progreso  
**Ubicación del proyecto:** `C:\Users\andre\Documents\polymarket-bot`

---

## Objetivo

Automatización en Python que cada 30 minutos escanea los mercados de **Weather** en Polymarket, compra posiciones YES según una tabla de inversión basada en probabilidad, y gestiona las posiciones con reglas de toma de ganancia y stop loss.

---

## Reglas de negocio

### Tabla de inversión (% del capital disponible)

| Prob mínima | Prob máxima | % máx inversión |
|-------------|-------------|-----------------|
| 86%         | 88%         | 10%             |
| 88%         | 91%         | 15%             |
| 91%         | 93%         | 20%             |
| 93%         | 95%         | 30%             |
| 95%         | 97%         | 40%             |
| 97%         | 98%         | 45%             |
| 98%         | 99%         | 50%             |

### Reglas de ejecución

1. **Prioridad de compra:** De más riesgosas (86%) a menos riesgosas (99%)
2. **Prioridad de tiempo:** Dentro del mismo rango, priorizar mercados más cercanos a vencer
3. **Rango operativo:** Solo operar entre 86% y 99% de probabilidad
4. **Take profit:** Vender posiciones cuando el precio suba a ≥ 99.8%
5. **Stop loss / margin call:** Vender posiciones cuando el precio caiga a ≤ 70%

---

## Arquitectura técnica

### Stack
- **Python 3.10+**
- `py-clob-client` — SDK oficial de Polymarket para operar en el CLOB
- `requests` — Gamma API para buscar/filtrar mercados Weather
- `schedule` — ejecutar el ciclo cada 30 minutos
- `sqlite3` (built-in) — tracking de posiciones abiertas
- `python-dotenv` — credenciales en `.env`

### APIs utilizadas
- **Gamma Markets API** (`https://gamma-api.polymarket.com`) — para buscar mercados por categoría, obtener precios y metadatos
- **CLOB API** (`https://clob.polymarket.com`) vía `py-clob-client` — para ejecutar órdenes de compra/venta

### Autenticación
- Requiere wallet Polygon con USDC
- Private key en `.env` (nunca hardcodeada)

---

## Estructura de archivos

```
polymarket-bot/
├── .env                    # PRIVATE_KEY, WALLET_ADDRESS (no commitear)
├── .env.example            # Template vacío para referencia
├── config.py               # Tabla de inversión, umbrales, parámetros
├── main.py                 # Entry point + loop scheduler 30 min
├── scanner.py              # Busca mercados Weather en rango 86-99%
├── rules.py                # Aplica tabla de inversión + prioridades
├── trader.py               # Ejecuta compras/ventas via py-clob-client
├── portfolio.py            # SQLite: registra y consulta posiciones abiertas
├── requirements.txt
└── README.md
```

---

## Flujo de ejecución (cada 30 min)

```
main.py
  └─ scanner.py → busca mercados Weather con prob 86-99%
       └─ rules.py → filtra, ordena por prioridad (riesgo ↑, tiempo ↑), calcula tamaño
            └─ portfolio.py → verifica qué mercados ya tiene posición abierta
                 ├─ trader.py → compra() en nuevos mercados elegibles
                 └─ trader.py → vende() posiciones en take profit (≥99.8%) o stop loss (≤70%)
```

---

## Pasos de implementación

- [ ] 1. Crear carpeta y estructura base del proyecto
- [ ] 2. `requirements.txt` y `.env.example`
- [ ] 3. `config.py` — tabla de inversión, umbrales, parámetros configurables
- [ ] 4. `portfolio.py` — SQLite schema + CRUD para posiciones abiertas
- [ ] 5. `scanner.py` — llamada a Gamma API, filtro por tag Weather y rango de probabilidad
- [ ] 6. `rules.py` — lógica de priorización y cálculo de tamaño de posición
- [ ] 7. `trader.py` — integración con py-clob-client, compra y venta
- [ ] 8. `main.py` — orquestador + loop `schedule` cada 30 min + logging
- [ ] 9. `README.md` — instrucciones de setup y uso
- [ ] 10. Prueba en dry-run mode (sin ejecutar órdenes reales)

---

## Consideraciones

- El bot opera solo en mercados **Weather** inicialmente; se puede extender con una variable de config
- El capital disponible es la cantidad de USDC en la wallet menos lo invertido en posiciones abiertas
- Las posiciones se registran localmente en SQLite para no depender de consultas de estado al CLOB en cada ciclo
- Se incluye modo `--dry-run` para simular sin ejecutar órdenes reales
- Logging detallado en consola y archivo `bot.log`
