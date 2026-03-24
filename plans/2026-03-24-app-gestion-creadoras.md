# Plan: App de Gestión — Programa Creadoras Brujería Capilar

**Created:** 2026-03-24
**Status:** Implemented
**Request:** Construir una app web (Node.js + Express + React CDN) para gestionar el Programa Creadoras, con panel admin para ver influencers, estadísticas, costo de kits enviados, ventas Shopify y ROI global del programa.

---

## Overview

### What This Plan Accomplishes

Una app web que corre localmente (y puede subirse a Railway/Render) con un panel de administración para gestionar todas las influencers del Programa Creadoras: ver su status, contenidos entregados, scores, y una vista de ROI que compara el costo de los kits enviados contra las ventas reales de Shopify en un período. Los datos viven en Supabase (ya configurado) y las ventas se traen de Shopify Admin API.

### Why This Matters

El programa está automatizado a nivel de datos (Tally → Make → Supabase), pero no hay visibilidad centralizada para el equipo. Para evaluar si el programa genera retorno, hay que cruzar manualmente el costo de los kits con las ventas — esta app hace ese cálculo automáticamente y presenta todo en una interfaz limpia.

---

## Current State

### Relevant Existing Structure

- `scripts/influencers/config_influencers.json` — credenciales Supabase y Shopify ya configuradas
- `scripts/influencers/supabase_client.py` — patrón de consultas a Supabase REST API (a replicar en JS)
- Supabase URL: `https://szhuvrscbuqqoeglubbz.supabase.co`
- Tablas existentes: `influencers`, `contenidos`, `kits`
- Shopify shop: `brujeriacapilar`, credenciales OAuth en config
- Kits con `valor_retail_cop`: Kit Básico $80k, Kit Estándar $130k, Kit Premium $220k
- Tiers: Nano (<10k seguidores), Micro (10k-100k), Macro (>100k)
- Niveles Bruja: Semilla → Aprendiz → Practicante → Experta → Gran Bruja

### Gaps o Problemas que este Plan Resuelve

- No hay interfaz visual para ver el estado del programa
- Para calcular ROI hay que cruzar datos manualmente entre Supabase y Shopify
- No hay forma de asignar/ver códigos de descuento por influencer desde una UI
- No hay dashboard con métricas agregadas del programa

---

## Proposed Changes

### Summary of Changes

- Crear `apps/creadoras/` con la app completa (backend + frontend)
- Backend Node.js/Express con endpoints API que consultan Supabase REST y Shopify Admin API
- Frontend React 18 CDN con 4 vistas: Dashboard, Influencers, Contenidos, ROI
- Agregar columna `codigo_descuento` a tabla `influencers` en Supabase (SQL migration)
- Actualizar `CLAUDE.md` con la nueva sección de la app

### New Files to Create

| File Path | Purpose |
|---|---|
| `apps/creadoras/index.js` | Servidor Express — API REST + sirve el frontend |
| `apps/creadoras/supabase.js` | Cliente Supabase en JS (fetch a REST API) |
| `apps/creadoras/shopify.js` | Cliente Shopify — OAuth token + consulta de órdenes |
| `apps/creadoras/public/index.html` | Frontend React CDN completo — todas las vistas |
| `apps/creadoras/package.json` | Dependencias Node: express, node-fetch, dotenv |
| `apps/creadoras/.env.example` | Ejemplo de variables de entorno |
| `apps/creadoras/README.md` | Instrucciones de instalación y uso |

### Files to Modify

| File Path | Changes |
|---|---|
| `CLAUDE.md` | Agregar sección "App de Gestión Creadoras" con estructura y quick start |

---

## Design Decisions

### Key Decisions Made

1. **`apps/creadoras/` separado de `scripts/`**: Los scripts Python son automatización de pipeline. La app es una herramienta de visualización/gestión. Directorios distintos evitan confusión.

2. **Leer credenciales del `config_influencers.json` existente**: No duplicar credenciales. El `index.js` importa directamente el JSON que ya tiene todo configurado. No se necesita `.env` para credenciales — ya existen.

3. **Supabase vía fetch directo (sin SDK)**: Mismo patrón que `supabase_client.py` — REST API con headers `apikey` + `Authorization`. Más simple, sin dependencias extra.

4. **Shopify: OAuth client_credentials para token**: Igual que `shopify_client.py` — POST a `/admin/oauth/access_token` con client_id + client_secret para obtener `shpat_` token. El token dura 24h, se renueva automáticamente.

5. **React 18 CDN + Babel standalone**: Sin build step. Un solo `index.html`. Mismo patrón probado en la otra app del workspace.

6. **ROI: costo vs ventas totales en período (no atribución directa)**: La atribución directa requiere UTM o códigos de descuento. El ROI global es siempre visible. La atribución por código de descuento es adicional cuando está configurado.

7. **Columna `codigo_descuento` en Supabase**: Agregar como campo opcional. El equipo lo ingresa desde el detalle de la influencer en la app. Shopify filtra órdenes con ese código para atribución individual.

### Alternatives Considered

- **Supabase SDK para JS**: Descartado — agrega dependencia innecesaria cuando fetch directo es suficiente y más transparente.
- **Next.js**: Descartado — overkill para una app interna, requiere build step.
- **Retool/Softr**: Descartado — el usuario prefiere control total con código propio.

### Open Questions

Ninguna — suficiente contexto para implementar sin input adicional.

---

## Step-by-Step Tasks

### Step 1: Crear estructura de directorios y package.json

Crear el directorio `apps/creadoras/` con `apps/creadoras/public/` adentro.

**Actions:**
- Crear `apps/creadoras/package.json` con dependencias: `express`, `node-fetch`, `cors`
- No se necesita dotenv ya que las credenciales vienen del config JSON existente

**`apps/creadoras/package.json`:**
```json
{
  "name": "creadoras-app",
  "version": "1.0.0",
  "description": "App de gestión — Programa Creadoras Brujería Capilar",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "node-fetch": "^2.7.0",
    "cors": "^2.8.5"
  }
}
```

**Files affected:** `apps/creadoras/package.json`

---

### Step 2: Crear cliente Supabase en JS

Módulo que expone funciones para consultar las tablas `influencers`, `contenidos` y `kits`.

**`apps/creadoras/supabase.js`:**

```javascript
const fetch = require('node-fetch');
const config = require('../../scripts/influencers/config_influencers.json');

const BASE_URL = config.supabase.url.replace(/\/$/, '') + '/rest/v1';
const KEY = config.supabase.service_role_key;

const HEADERS = {
  'apikey': KEY,
  'Authorization': `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

async function supabaseGet(table, params = {}) {
  const url = new URL(`${BASE_URL}/${table}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase GET ${table} error: ${res.status} ${await res.text()}`);
  return res.json();
}

async function supabasePatch(table, filters, data) {
  const url = new URL(`${BASE_URL}/${table}`);
  Object.entries(filters).forEach(([k, v]) => url.searchParams.set(k, `eq.${v}`));
  const res = await fetch(url.toString(), {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${table} error: ${res.status} ${await res.text()}`);
  return res.json();
}

// Influencers
async function getInfluencers(filters = {}) {
  const params = { select: '*', order: 'fecha_registro.desc' };
  if (filters.status) params.status = `eq.${filters.status}`;
  if (filters.tier) params.tier = `eq.${filters.tier}`;
  if (filters.nivel_bruja) params.nivel_bruja = `eq.${filters.nivel_bruja}`;
  return supabaseGet('influencers', params);
}

async function getInfluencerById(id) {
  const results = await supabaseGet('influencers', { id: `eq.${id}`, limit: 1, select: '*' });
  return results[0] || null;
}

async function updateInfluencer(id, data) {
  return supabasePatch('influencers', { id }, data);
}

// Contenidos
async function getContenidos(influencer_id = null) {
  const params = {
    select: '*,influencers(nombre,instagram_handle,tier)',
    order: 'fecha_submision.desc',
  };
  if (influencer_id) params.influencer_id = `eq.${influencer_id}`;
  return supabaseGet('contenidos', params);
}

// Kits
async function getKits() {
  return supabaseGet('kits', { select: '*' });
}

// Stats agregadas
async function getStats() {
  const influencers = await getInfluencers();
  const contenidos = await getContenidos();
  const kits = await getKits();

  // Mapa de valor por kit
  const kitValor = {};
  kits.forEach(k => { kitValor[k.nombre] = k.valor_retail_cop || 0; });

  // Conteo por status
  const porStatus = {};
  influencers.forEach(inf => {
    porStatus[inf.status] = (porStatus[inf.status] || 0) + 1;
  });

  // Costo total de kits enviados (influencers con status != Registrada, != Prospectada, != Contactada)
  const enviadas = influencers.filter(i =>
    ['Producto Enviado', 'Contenido Entregado', 'Calificada'].includes(i.status)
  );
  const costoTotal = enviadas.reduce((sum, inf) => {
    return sum + (kitValor[inf.kit_asignado] || 0);
  }, 0);

  // Score promedio
  const contenidosConScore = contenidos.filter(c => c.score_contenido != null);
  const scorePromedio = contenidosConScore.length > 0
    ? contenidosConScore.reduce((s, c) => s + c.score_contenido, 0) / contenidosConScore.length
    : 0;

  return {
    total: influencers.length,
    porStatus,
    enviadas: enviadas.length,
    costoTotalKits: costoTotal,
    totalContenidos: contenidos.length,
    scorePromedio: Math.round(scorePromedio * 10) / 10,
  };
}

module.exports = { getInfluencers, getInfluencerById, updateInfluencer, getContenidos, getKits, getStats };
```

**Files affected:** `apps/creadoras/supabase.js`

---

### Step 3: Crear cliente Shopify en JS

Módulo para obtener ventas de Shopify por período, con soporte para filtrar por código de descuento.

**`apps/creadoras/shopify.js`:**

```javascript
const fetch = require('node-fetch');
const config = require('../../scripts/influencers/config_influencers.json');

const SHOP = config.shopify.shop_name;
const CLIENT_ID = config.shopify.client_id;
const CLIENT_SECRET = config.shopify.client_secret;

let _token = null;
let _tokenExpiry = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;
  const res = await fetch(`https://${SHOP}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'client_credentials' }),
  });
  if (!res.ok) throw new Error(`Shopify auth error: ${res.status}`);
  const data = await res.json();
  _token = data.access_token;
  _tokenExpiry = Date.now() + 23 * 60 * 60 * 1000; // 23 horas
  return _token;
}

async function shopifyGet(path, params = {}) {
  const token = await getToken();
  const url = new URL(`https://${SHOP}.myshopify.com/admin/api/2024-01/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Shopify GET error: ${res.status} ${await res.text()}`);
  return res.json();
}

// Obtener ventas totales en un período
// Retorna: { totalVentas, totalOrdenes, ordenes }
async function getVentas(fechaDesde, fechaHasta, codigoDescuento = null) {
  const params = {
    status: 'any',
    financial_status: 'paid',
    created_at_min: fechaDesde,
    created_at_max: fechaHasta,
    limit: 250,
    fields: 'id,created_at,total_price,discount_codes,line_items',
  };

  let ordenes = [];
  let url = null;

  // Primera página
  const data = await shopifyGet('orders.json', params);
  ordenes = data.orders || [];

  // Paginación si hay más de 250
  // (simplificado — para volúmenes pequeños iniciales es suficiente)

  // Filtrar por código de descuento si se especifica
  if (codigoDescuento) {
    ordenes = ordenes.filter(o =>
      (o.discount_codes || []).some(d =>
        d.code.toLowerCase() === codigoDescuento.toLowerCase()
      )
    );
  }

  const totalVentas = ordenes.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);

  return {
    totalVentas: Math.round(totalVentas),
    totalOrdenes: ordenes.length,
  };
}

module.exports = { getVentas };
```

**Files affected:** `apps/creadoras/shopify.js`

---

### Step 4: Crear servidor Express (index.js)

Servidor principal que expone la API REST y sirve el frontend.

**`apps/creadoras/index.js`:**

```javascript
const express = require('express');
const cors = require('cors');
const path = require('path');
const supabase = require('./supabase');
const shopify = require('./shopify');

const app = express();
const PORT = process.env.PORT || 3030;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── STATS DASHBOARD ──────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await supabase.getStats();
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── INFLUENCERS ───────────────────────────────────────────────────
app.get('/api/influencers', async (req, res) => {
  try {
    const { status, tier, nivel_bruja } = req.query;
    const influencers = await supabase.getInfluencers({ status, tier, nivel_bruja });
    res.json(influencers);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/influencers/:id', async (req, res) => {
  try {
    const influencer = await supabase.getInfluencerById(req.params.id);
    if (!influencer) return res.status(404).json({ error: 'No encontrada' });
    const contenidos = await supabase.getContenidos(req.params.id);
    res.json({ ...influencer, contenidos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/influencers/:id', async (req, res) => {
  try {
    const allowed = ['status', 'codigo_descuento', 'notas_equipo', 'calificacion_equipo'];
    const data = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });
    await supabase.updateInfluencer(req.params.id, data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── CONTENIDOS ────────────────────────────────────────────────────
app.get('/api/contenidos', async (req, res) => {
  try {
    const contenidos = await supabase.getContenidos();
    res.json(contenidos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── ROI / VENTAS SHOPIFY ──────────────────────────────────────────
app.get('/api/roi', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) return res.status(400).json({ error: 'Parámetros desde y hasta requeridos' });

    // Ventas totales del período
    const ventas = await shopify.getVentas(desde, hasta);

    // Costo de kits enviados en ese período (influencers con fecha_envio en rango)
    const influencers = await supabase.getInfluencers();
    const kits = await supabase.getKits();
    const kitValor = {};
    kits.forEach(k => { kitValor[k.nombre] = k.valor_retail_cop || 0; });

    const enviadasEnPeriodo = influencers.filter(inf => {
      if (!inf.fecha_envio) return false;
      return inf.fecha_envio >= desde.split('T')[0] && inf.fecha_envio <= hasta.split('T')[0];
    });

    const costoKits = enviadasEnPeriodo.reduce((sum, inf) => sum + (kitValor[inf.kit_asignado] || 0), 0);
    const roi = costoKits > 0 ? ((ventas.totalVentas / costoKits) * 100).toFixed(1) : null;

    res.json({
      periodo: { desde, hasta },
      ventas: ventas.totalVentas,
      totalOrdenes: ventas.totalOrdenes,
      costoKits,
      influenciasEnviadas: enviadasEnPeriodo.length,
      roi: roi ? `${roi}%` : 'N/A',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Ventas atribuidas a una influencer por código de descuento
app.get('/api/roi/influencer/:id', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const influencer = await supabase.getInfluencerById(req.params.id);
    if (!influencer) return res.status(404).json({ error: 'No encontrada' });
    if (!influencer.codigo_descuento) return res.json({ atribuido: 0, mensaje: 'Sin código de descuento asignado' });

    const ventas = await shopify.getVentas(desde, hasta, influencer.codigo_descuento);
    res.json({
      influencer: influencer.nombre,
      codigo_descuento: influencer.codigo_descuento,
      ventasAtribuidas: ventas.totalVentas,
      ordenesAtribuidas: ventas.totalOrdenes,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Servir frontend para cualquier ruta no-API
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\nApp Creadoras corriendo en http://localhost:${PORT}`);
  console.log('Ctrl+C para detener\n');
});
```

**Files affected:** `apps/creadoras/index.js`

---

### Step 5: Agregar columna `codigo_descuento` en Supabase

Antes de crear el frontend, agregar la columna a la tabla `influencers`.

**Actions:**
- Ir a Supabase → SQL Editor → New Query → ejecutar:

```sql
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS codigo_descuento text;
```

**Files affected:** Supabase tabla `influencers` (cambio en BD, no en archivos locales)

---

### Step 6: Crear el frontend (index.html)

Single-page app React 18 CDN con 4 vistas: Dashboard, Influencers, Detalle Influencer, Contenidos, ROI.

El archivo es largo pero sigue el patrón exacto de la otra app del workspace. Estructura:

```
public/index.html
  ├── <head> — React 18 CDN + ReactDOM + Babel + estilos CSS inline
  └── <body>
       └── #root → App React
            ├── Navbar (Dashboard | Influencers | Contenidos | ROI)
            ├── <Dashboard> — tarjetas de stats + tabla rápida de últimas registradas
            ├── <Influencers> — tabla con filtros, click → detalle
            ├── <DetalleInfluencer> — datos, contenidos, score, código descuento, cambio status
            ├── <Contenidos> — tabla completa de contenidos con scores
            └── <ROI> — selector de período, tarjetas ventas/costo/ROI, tabla enviadas
```

**Paleta de colores** (acorde a Brujería Capilar): morado oscuro `#2D1B69`, lila `#7C3AED`, blanco, gris claro. Fondo oscuro tipo dashboard.

**Componentes principales:**

- `StatCard` — tarjeta con número grande y label
- `Table` — tabla reutilizable con columnas configurables
- `Badge` — chip de color por status/tier/nivel
- `FilterBar` — dropdowns de status, tier, nivel Bruja
- `PeriodPicker` — inputs de fecha desde/hasta para ROI

**Colores de badges:**
- Status: Registrada=azul, Producto Enviado=amarillo, Contenido Entregado=naranja, Calificada=verde
- Tier: Nano=gris, Micro=lila, Macro=morado
- Nivel: Semilla=verde claro, Aprendiz=azul, Practicante=lila, Experta=morado, Gran Bruja=dorado

**Files affected:** `apps/creadoras/public/index.html`

---

### Step 7: Crear README de la app

**`apps/creadoras/README.md`:**

```markdown
# App Creadoras — Brujería Capilar

Panel de gestión del Programa Creadoras.

## Instalación

```bash
cd apps/creadoras/
npm install
```

## Correr

```bash
node index.js
# Abre http://localhost:3030
```

## Requisitos

- Las credenciales se leen automáticamente de `scripts/influencers/config_influencers.json`
- Asegurarse de que Supabase y Shopify estén configurados en ese archivo

## Para subir a Railway/Render

1. Subir el repo
2. Configurar el start command: `node apps/creadoras/index.js`
3. No se necesitan variables de entorno adicionales
```

**Files affected:** `apps/creadoras/README.md`

---

### Step 8: Actualizar CLAUDE.md

Agregar sección "App de Gestión Creadoras" al CLAUDE.md después de la sección del Sistema de Influencers.

**Actions:**
- Agregar al workspace structure la carpeta `apps/creadoras/`
- Agregar sección con descripción, estructura y quick start

**Files affected:** `CLAUDE.md`

---

## Connections & Dependencies

### Files That Reference This Area

- `scripts/influencers/config_influencers.json` — la app lee credenciales de aquí directamente
- `CLAUDE.md` — debe actualizarse para reflejar la nueva app

### Updates Needed for Consistency

- `CLAUDE.md` → agregar sección App y entrada en Workspace Structure

### Impact on Existing Workflows

- Ningún script Python existente se modifica
- La app es lectura/escritura de los mismos datos que usan los scripts — conviven sin conflicto
- Si la app actualiza `status` de una influencer, los scripts Python lo respetan igual

---

## Validation Checklist

- [ ] `npm install` en `apps/creadoras/` sin errores
- [ ] `node index.js` inicia sin errores y muestra URL en consola
- [ ] Dashboard carga y muestra stats reales de Supabase
- [ ] Lista de influencers muestra todos los registros
- [ ] Filtros por status/tier/nivel funcionan
- [ ] Detalle de influencer muestra contenidos y permite editar código de descuento
- [ ] Vista ROI retorna ventas de Shopify para un período de prueba
- [ ] Cambio de status desde la UI se refleja en Supabase
- [ ] Columna `codigo_descuento` existe en Supabase (SQL ejecutado)
- [ ] `CLAUDE.md` actualizado con la nueva sección

---

## Success Criteria

1. El equipo puede abrir `http://localhost:3030` y ver en tiempo real el estado de todas las influencers con sus stats
2. La vista ROI muestra ventas de Shopify vs costo de kits para cualquier período seleccionado
3. Se puede asignar un código de descuento a una influencer y ver las ventas atribuidas a ese código

---

## Notes

- **Fase 2 (portal influencer):** Requiere autenticación. Las influencers acceden con su email, ven solo sus datos. Agregar en un plan separado cuando la fase 1 esté estable.
- **Paginación Shopify:** El cliente actual trae máximo 250 órdenes. Si el volumen crece, agregar cursor-based pagination con el header `Link` de Shopify.
- **Columna `valor_retail_cop` en kits:** Ya existe en la tabla según el SQL de setup. Verificar que tenga los valores correctos antes de correr el cálculo de costo (Kit Básico: 80000, Kit Estándar: 130000, Kit Premium: 220000).
- **Deploy:** La app puede subirse a Railway o Render sin cambios. El `config_influencers.json` debe estar presente en el servidor o las credenciales deben pasarse como variables de entorno en producción.

---

## Implementation Notes

**Implemented:** 2026-03-24

### Summary

- Creados todos los archivos de `apps/creadoras/`: `package.json`, `index.js`, `supabase.js`, `shopify.js`, `public/index.html`, `README.md`
- Frontend completo con 4 vistas: Dashboard, Influencers (con filtros + detalle), Contenidos, ROI
- `CLAUDE.md` actualizado con estructura `apps/creadoras/` y sección de la app

### Deviations from Plan

- Se eliminó `.env.example` (no aplica — credenciales vienen del JSON existente, no de .env)
- La tabla de directorios en CLAUDE.md tenía una fila duplicada de `scripts/influencers/` — corregida al agregar la fila de `apps/creadoras/`

### Issues Encountered

- Ninguno
