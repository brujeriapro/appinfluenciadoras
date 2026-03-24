# Plan: Automatización del Proceso Logístico Shopify → Effi → Guía

**Created:** 2026-03-20
**Status:** Draft
**Request:** Automatizar el proceso manual de convertir órdenes de venta en Effi a remisiones y luego a guías, aplicando una política de selección de transportadora según destino y costo.

---

## Overview

### What This Plan Accomplishes

Construir un sistema de automatización que, ante cada nuevo pedido recibido en Effi desde Shopify, ejecute automáticamente los pasos de conversión: orden de venta → remisión → guía, seleccionando la transportadora óptima según una política de transporte predefinida — eliminando completamente la intervención manual en el proceso logístico.

### Why This Matters

Hoy el proceso logístico requiere que la dueña haga clics manuales por cada pedido en Effi. Con el volumen actual y la meta de crecimiento ($30M → $100M COP), este cuello de botella escala linealmente con las ventas y consume tiempo que debería estar en mercadeo y desarrollo de producto. La automatización es el paso más prioritario de la estrategia 2026.

---

## Current State

### Relevant Existing Structure

- `context/business-info.md` — Descripción del negocio, canales (Shopify B2C, Shopify B2B, Amazon) y sistemas (Effi, Siigo, Shopify)
- `context/strategy.md` — Automatización logística como prioridad #1
- `scripts/` — Solo tiene `SETUP.md`; sin scripts de automatización activos para este negocio

### Proceso manual actual (paso a paso)

1. Pedido entra en Shopify (B2C o B2B)
2. Pedido llega a Effi como **Orden de Venta**
3. Usuario abre Effi manualmente, entra a la orden
4. Usuario hace clic para convertirla en **Remisión**
5. Usuario decide qué transportadora usar (según política de transporte propia)
6. Usuario hace clic para generar la **Guía** con esa transportadora

### Gaps o Problemas que este Plan Resuelve

- **Proceso 100% manual:** Cada pedido requiere múltiples clics en Effi
- **Sin política de transportadora codificada:** La decisión vive en la cabeza de la dueña
- **No escalable:** A mayor volumen, más tiempo manual dedicado a logística
- **Sin visibilidad:** No hay registro automático de qué guía se generó, con qué transportadora y por qué

---

## Proposed Changes

### Summary of Changes

- Documentar y codificar la política de selección de transportadora (paso previo obligatorio)
- Investigar las capacidades de la API de Effi (determina el enfoque técnico)
- Diseñar e implementar el script de automatización (Python)
- Configurar el trigger: webhook de Shopify o polling a Effi
- Agregar registro de guías generadas (log CSV o similar)
- Documentar el sistema en `scripts/SETUP.md` y actualizar `CLAUDE.md`

### New Files to Create

| File Path | Purpose |
|---|---|
| `scripts/config_transporte.json` | Política de transportadoras: reglas por departamento/ciudad con transportadora preferida y fallback |
| `scripts/automatizacion_logistica.py` | Script principal: detecta órdenes nuevas y ejecuta el flujo completo |
| `scripts/effi_client.py` | Cliente para interactuar con Effi (API o automatización web) |
| `scripts/shopify_client.py` | Cliente para leer órdenes de Shopify y estado de pedidos |
| `scripts/transportadora_selector.py` | Lógica de selección de transportadora según política |
| `scripts/logger.py` | Registro de guías generadas con timestamp, transportadora elegida y motivo |
| `outputs/logistica/guias_generadas.csv` | Log acumulativo de todas las guías generadas automáticamente |
| `context/politica-transporte.md` | Documento con la política de transporte en lenguaje claro |
| `scripts/SETUP_LOGISTICA.md` | Instrucciones de configuración del sistema de automatización |

### Files to Modify

| File Path | Changes |
|---|---|
| `CLAUDE.md` | Agregar sección del sistema de automatización logística, actualizar estructura de workspace |
| `scripts/SETUP.md` | Agregar referencia al nuevo sistema logístico |
| `context/strategy.md` | Actualizar cuando el sistema esté implementado (marcar como completado) |

### Files to Delete

Ninguno.

---

## Design Decisions

### Key Decisions Made

1. **Python como lenguaje de implementación**: Ya es el lenguaje del workspace, el equipo lo conoce, y hay librerías robustas para APIs REST y automatización web.

2. **Separar la política de transporte en un archivo JSON**: Permite actualizar la lógica de selección de transportadora sin tocar el código. La dueña puede modificar `config_transporte.json` directamente cuando cambien los costos o acuerdos comerciales.

3. **Logging obligatorio**: Cada guía generada queda registrada con transportadora, costo estimado y motivo de selección. Esto permite auditoría y mejora continua de la política.

4. **Arquitectura modular**: Separar el cliente de Effi, el cliente de Shopify, la lógica de selección de transportadora y el script principal. Si Effi cambia su API o Shopify cambia webhooks, solo se modifica el módulo afectado.

### Alternatives Considered

1. **Usar Zapier o Make (no-code):** Más rápido de configurar pero limitado en lógica de selección de transportadora y sin control sobre el proceso. Además, costo mensual recurrente y dependencia de plataforma tercera.

2. **Automatizar el navegador (Playwright/Selenium) si Effi no tiene API:** Opción válida si Effi no expone API. Es más frágil (se rompe si Effi cambia su UI) pero completamente funcional. Se contempla como fallback en este plan.

3. **Delegar todo a Effi (configurar reglas dentro de Effi):** Depende de si Effi tiene capacidad de reglas de negocio configurables. Debe verificarse — podría ser la solución más simple.

### Open Questions — Requieren Respuesta Antes de Implementar

> **IMPORTANTE:** Estas preguntas deben responderse antes de ejecutar `/implement`. Definen el enfoque técnico fundamental.

1. **¿Effi tiene API?**
   - Si sí: ¿Cuál es la documentación? ¿Qué endpoints existen para crear remisiones y guías?
   - Si no: ¿Están dispuestos a automatizar vía clicks en el navegador (Playwright)?
   - Acción: Contactar a soporte de Effi o revisar la documentación de la plataforma.

2. **¿Effi tiene funcionalidad nativa de reglas/automatización?**
   - Algunas plataformas de fulfillment permiten configurar reglas internas (ej: "si destino = Bogotá, usar transportadora X")
   - Acción: Preguntar al equipo de Effi si esto es posible sin código.

3. **¿Cuál es la política de transportadoras?**
   - Necesitamos codificarla en `config_transporte.json`
   - Preguntas específicas: ¿Por qué criterio se elige transportadora? (¿departamento? ¿ciudad? ¿peso? ¿valor del pedido?), ¿cuáles transportadoras están disponibles en Effi?, ¿hay tarifas fijas o varían?

4. **¿Shopify ya tiene webhooks configurados hacia Effi?**
   - Si el pedido ya llega automáticamente a Effi, ¿el trigger de nuestra automatización debe ser un webhook de Shopify o un polling a Effi buscando órdenes de venta sin procesar?

5. **¿El canal B2B (Shopify privado) sigue el mismo proceso o es diferente?**
   - ¿Los pedidos mayoristas también van a Effi o tienen flujo distinto?

---

## Step-by-Step Tasks

### Step 1: Documentar la política de transportadora

Antes de escribir una línea de código, la política debe estar escrita y validada.

**Acciones:**

- Crear `context/politica-transporte.md` con la política en lenguaje claro
- Entrevistar a la dueña (o pedirle que llene el documento) con preguntas: ¿Qué transportadoras usas?, ¿cuándo usas cada una?, ¿cuál es la regla para elegir?
- Traducir la política a `scripts/config_transporte.json` con estructura:
  ```json
  {
    "reglas": [
      {
        "condicion": { "departamento": ["Antioquia"] },
        "transportadora_preferida": "Coordinadora",
        "fallback": "Servientrega",
        "razon": "Costo más bajo en zona local"
      },
      {
        "condicion": { "departamento": ["Bogotá D.C.", "Cundinamarca"] },
        "transportadora_preferida": "TCC",
        "fallback": "Envía",
        "razon": "Mejor cobertura y precio"
      }
    ],
    "default": {
      "transportadora": "Servientrega",
      "razon": "Transportadora con cobertura nacional como fallback"
    }
  }
  ```

**Files affected:**
- `context/politica-transporte.md` (crear)
- `scripts/config_transporte.json` (crear)

---

### Step 2: Investigar y documentar la API de Effi

**Acciones:**

- Revisar si Effi tiene documentación de API disponible (portal de desarrolladores, o preguntar al soporte)
- Identificar los endpoints necesarios:
  - Listar órdenes de venta pendientes
  - Convertir orden de venta a remisión
  - Generar guía con transportadora específica
  - Consultar estado de una guía
- Si no hay API: evaluar si Effi tiene webhooks de salida o si se debe usar Playwright para automatizar los clics

**Resultado esperado:** Un documento breve en `reference/effi-api.md` con los endpoints encontrados o la decisión de usar automatización web.

**Files affected:**
- `reference/effi-api.md` (crear — solo si hay API documentada)

---

### Step 3: Crear el cliente de Effi (`effi_client.py`)

Dependiendo del resultado del Step 2:

**Opción A — Effi tiene API REST:**
```python
# effi_client.py
class EffiClient:
    def get_ordenes_pendientes(self) -> list[dict]
    def convertir_a_remision(self, orden_id: str) -> dict
    def generar_guia(self, remision_id: str, transportadora: str) -> dict
    def get_estado_guia(self, guia_id: str) -> dict
```

**Opción B — No hay API (automatización web con Playwright):**
```python
# effi_client.py usando Playwright
class EffiWebClient:
    def login(self)
    def get_ordenes_pendientes(self) -> list[dict]
    def procesar_orden(self, orden_id: str, transportadora: str) -> dict
    # Automatiza los clics: orden → remisión → guía
```

**Files affected:**
- `scripts/effi_client.py` (crear)

---

### Step 4: Crear el módulo de selección de transportadora

```python
# transportadora_selector.py
class TransportadoraSelector:
    def __init__(self, config_path: str):
        # Carga config_transporte.json

    def seleccionar(self, orden: dict) -> tuple[str, str]:
        # Retorna (transportadora, razon)
        # Evalúa reglas en orden hasta encontrar match
        # Usa default si ninguna regla aplica
```

**Files affected:**
- `scripts/transportadora_selector.py` (crear)

---

### Step 5: Crear el cliente de Shopify (opcional, si se usa como trigger)

Solo necesario si el trigger es un webhook de Shopify. Si el trigger es polling a Effi, este módulo es opcional.

```python
# shopify_client.py
class ShopifyClient:
    def get_ordenes_recientes(self, desde: datetime) -> list[dict]
    def get_orden(self, order_id: str) -> dict
```

**Files affected:**
- `scripts/shopify_client.py` (crear — solo si necesario)

---

### Step 6: Crear el script principal de automatización

```python
# automatizacion_logistica.py
def procesar_ordenes_pendientes():
    effi = EffiClient()
    selector = TransportadoraSelector("config_transporte.json")
    logger = LoggerGuias("../outputs/logistica/guias_generadas.csv")

    ordenes = effi.get_ordenes_pendientes()

    for orden in ordenes:
        transportadora, razon = selector.seleccionar(orden)
        guia = effi.convertir_y_generar_guia(orden["id"], transportadora)
        logger.registrar(orden, guia, transportadora, razon)
        print(f"✓ Guía {guia['numero']} generada — {transportadora} — {orden['destino']}")

if __name__ == "__main__":
    procesar_ordenes_pendientes()
```

**Files affected:**
- `scripts/automatizacion_logistica.py` (crear)

---

### Step 7: Crear el logger y estructura de outputs

```python
# logger.py — registra cada guía generada
# Columnas: timestamp, orden_id, cliente, destino_ciudad, destino_departamento,
#           transportadora_elegida, razon, numero_guia, estado
```

Crear carpeta `outputs/logistica/` y archivo CSV inicial.

**Files affected:**
- `scripts/logger.py` (crear)
- `outputs/logistica/guias_generadas.csv` (crear — cabeceras solamente)

---

### Step 8: Configurar el trigger de ejecución automática

**Opción A — Webhook de Shopify:**
- Configurar en el panel de Shopify Admin un webhook en el evento `orders/create` que llame a un endpoint del script
- Requiere que el script esté corriendo como servidor (FastAPI o Flask) o en un servicio cloud

**Opción B — Cron / Schedule:**
- Ejecutar `automatizacion_logistica.py` cada N minutos (ej. cada 5 minutos) buscando órdenes pendientes en Effi
- Más simple de implementar; latencia máxima = intervalo del cron
- Se puede configurar con el Cron de Claude Code para pruebas, o con cron de sistema / Task Scheduler de Windows para producción

**Recomendación:** Empezar con Opción B (polling cada 5-10 min) para simplificar. Migrar a webhook si el volumen justifica latencia mínima.

**Files affected:**
- Configuración de Task Scheduler (Windows) o cron job

---

### Step 9: Documentar el sistema

- Crear `scripts/SETUP_LOGISTICA.md` con:
  - Requisitos: credenciales de Effi, credenciales de Shopify, Python 3.x, dependencias
  - Cómo configurar `config_transporte.json`
  - Cómo ejecutar manualmente
  - Cómo configurar ejecución automática
  - Cómo leer el log de guías generadas

**Files affected:**
- `scripts/SETUP_LOGISTICA.md` (crear)

---

### Step 10: Actualizar CLAUDE.md

Actualizar las secciones del workspace para reflejar el nuevo sistema:
- Agregar descripción del sistema de automatización logística
- Actualizar la estructura de carpetas (agregar `outputs/logistica/`)
- Eliminar referencias al sistema anterior de análisis competidor de hoteles

**Files affected:**
- `CLAUDE.md`

---

## Connections & Dependencies

### Sistemas Externos Involucrados

- **Effi:** Sistema de fulfillment — punto central del proceso. La integración depende de si tiene API.
- **Shopify:** Fuente de órdenes. Ya integrado con Effi según la dueña; puede usarse como trigger vía webhook.
- **Transportadoras:** Coordinadora, Servientrega, TCC, Envía (u otras que use Brujería Capilar) — la integración con estos es a través de Effi, no directa.

### Updates Needed for Consistency

- `CLAUDE.md` — Actualizar para reflejar nuevo sistema
- `context/strategy.md` — Marcar automatización logística como implementada una vez completa

### Impact on Existing Workflows

- El proceso manual en Effi queda eliminado para pedidos B2C
- El canal B2B puede requerir configuración separada (pendiente confirmar)
- No impacta el proceso de compra en Shopify ni la experiencia del cliente

---

## Validation Checklist

- [ ] Política de transportadoras documentada en `context/politica-transporte.md`
- [ ] `config_transporte.json` refleja fielmente la política
- [ ] API de Effi investigada y resultado documentado
- [ ] `effi_client.py` puede autenticarse y listar órdenes pendientes
- [ ] `transportadora_selector.py` devuelve la transportadora correcta para casos de prueba conocidos
- [ ] Script principal procesa una orden de prueba de forma exitosa
- [ ] Guía generada aparece en Effi con la transportadora correcta
- [ ] Log `outputs/logistica/guias_generadas.csv` registra la operación
- [ ] Ejecución automática configurada y probada
- [ ] `SETUP_LOGISTICA.md` permite a alguien nuevo configurar el sistema desde cero
- [ ] `CLAUDE.md` actualizado

---

## Success Criteria

La implementación es completa cuando:

1. Un pedido nuevo en Shopify se convierte en guía en Effi en menos de 10 minutos **sin ningún clic manual**
2. La transportadora asignada coincide con la política de transporte en el 100% de los casos
3. Cada guía generada queda registrada en `outputs/logistica/guias_generadas.csv`
4. El sistema puede correr sin supervisión por al menos 1 semana sin errores

---

## Notes

**Riesgo principal:** Si Effi no tiene API, se debe usar automatización web (Playwright) que es más frágil ante cambios de UI. En ese caso, valdría la pena presionar a Effi para que exponga una API, o evaluar si la automatización web es suficientemente estable.

**Siguiente evolución posible:** Una vez automatizado el flujo de guías, el siguiente paso natural es agregar notificaciones automáticas al cliente (WhatsApp o email) con el número de guía cuando se genere — sin intervención manual.

**Canal B2B:** Los pedidos de clientes mayoristas probablemente tienen reglas de logística diferentes (volúmenes, condiciones de entrega). Considerar si deben procesarse con el mismo flujo o tener su propia rama de automatización.

**Consideración de costos:** Si Effi cobra por guía/integración API, validar que el costo no supere el ahorro en tiempo. Estimado: si se procesan 50+ pedidos/semana, la automatización se justifica ampliamente.
