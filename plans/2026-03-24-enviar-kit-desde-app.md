# Plan: Botón "Enviar Kit" en App Creadoras

**Created:** 2026-03-24
**Status:** Implemented
**Request:** Agregar funcionalidad "Enviar Kit" en el detalle de influencer de la app: modal de selección de productos, orden Shopify $0, registro en Siigo y actualización de Supabase.

---

## Overview

### What This Plan Accomplishes

Desde el detalle de cualquier influencer en la app, el equipo puede hacer clic en "Enviar Kit", seleccionar los productos a enviar (con sugerencia por tier como guía), confirmar y crear automáticamente la orden $0 en Shopify + el documento de salida de inventario en Siigo. Supabase se actualiza con `status="Producto Enviado"`, `fecha_envio` y `skus_pedidos`. Todo desde el navegador, sin tocar la terminal.

### Why This Matters

Hoy el envío requiere editar `skus_pedidos` manualmente en Supabase y correr `crear_envio.py` desde la terminal. Con este botón, cualquier miembro del equipo puede gestionar envíos desde la app sin acceso técnico a la base de datos ni a scripts Python.

---

## Current State

### Relevant Existing Structure

- `apps/creadoras/index.js` — servidor Express, agregar endpoint `POST /api/influencers/:id/enviar`
- `apps/creadoras/shopify.js` — tiene `getToken()` y `shopifyGet()` — extender con `createGiftingOrder()`
- `apps/creadoras/supabase.js` — tiene `updateInfluencer()` y `getInfluencerById()` — agregar `insertEnvioLog()`
- `apps/creadoras/public/index.html` — componente `DetalleInfluencer` — agregar modal de selección
- `scripts/influencers/shopify_client.py` — lógica completa de draft order (ya portada parcialmente), incluye mapa ciudad→provincia
- `scripts/influencers/siigo_client.py` — lógica completa: auth, get_product_price, registrar_salida_gifting
- `scripts/influencers/config_influencers.json` — `productos_disponibles` (nombre→SKU), `tier_rules`, `kits`

### Datos clave del config

**productos_disponibles:**
```json
{
  "Termoprotector Capilar": "BRTP0001",
  "Mascarilla Hechizo Total": "BRMA0001",
  "Crema Para Rizos 3en1": "BRPROTR01",
  "Shampoo Ultra": "BRSHN001",
  "Varita Mágica": "BRVA0001",
  "Mantequilla Corporal Vainilla": "BRCR0001",
  "Mantequilla Corporal Strawberry": "BRCR0002",
  "Mantequilla Corporal Watermelon": "BRCR0003"
}
```

**Sugerencia por tier:** Nano=1 producto, Micro=2, Macro=3+

### Gaps o Problemas que este Plan Resuelve

- No hay forma de enviar desde la UI — requiere terminal + edición manual de BD
- `shopify.js` solo tiene `getVentas()` — no tiene lógica de creación de órdenes
- No existe `siigo.js` en la app — la lógica de inventario solo vive en Python
- El mapa ciudad→provincia está en `shopify_client.py` pero no en el cliente JS

---

## Proposed Changes

### Summary of Changes

- Extender `apps/creadoras/shopify.js` con `createGiftingOrder()` + mapa ciudad→provincia
- Crear `apps/creadoras/siigo.js` portando la lógica de `siigo_client.py`
- Agregar endpoint `POST /api/influencers/:id/enviar` y `GET /api/config/productos` en `index.js`
- Agregar `insertEnvioLog()` en `supabase.js` (actualiza `skus_pedidos`, `status`, `fecha_envio`, `shopify_order_id`)
- Agregar modal "Enviar Kit" en el componente `DetalleInfluencer` de `public/index.html`

### New Files to Create

| File Path | Purpose |
|---|---|
| `apps/creadoras/siigo.js` | Cliente Siigo en JS — auth, get_product_price, registrar_salida_gifting |

### Files to Modify

| File Path | Changes |
|---|---|
| `apps/creadoras/shopify.js` | Agregar mapa ciudad→provincia + función `createGiftingOrder()` |
| `apps/creadoras/supabase.js` | Agregar función `updateEnvio()` que actualiza skus_pedidos, status, fecha_envio, shopify_order_id |
| `apps/creadoras/index.js` | Agregar `GET /api/config/productos` y `POST /api/influencers/:id/enviar` |
| `apps/creadoras/public/index.html` | Agregar modal de selección de productos y botón "Enviar Kit" en `DetalleInfluencer` |

---

## Design Decisions

### Key Decisions Made

1. **Tier como sugerencia, no restricción**: El equipo puede enviar cualquier cantidad de productos independientemente del tier. El modal muestra la sugerencia pero no bloquea. Esto es intencional — el usuario lo pidió explícitamente.

2. **Siigo se intenta pero no bloquea el envío**: Si Siigo falla (token expirado, SKU no encontrado), la orden Shopify ya está creada y Supabase actualizado. El error de Siigo se loguea pero no revierte el proceso. Es mejor tener el envío creado sin el documento Siigo que perder la orden completa.

3. **El endpoint devuelve resultado parcial en error de Siigo**: `{ shopify: {...}, siigo: null, siigo_error: "..." }` — el frontend muestra warning pero no error fatal.

4. **`GET /api/config/productos`**: Expone los productos del config al frontend sin hardcodear nada en el HTML. Si se agrega un producto al config JSON, aparece automáticamente en el modal.

5. **Log de envíos en Supabase no en CSV**: El `envios_log.csv` lo sigue generando `crear_envio.py` para compatibilidad. Desde la app, el log es simplemente la actualización de campos en la tabla `influencers` (shopify_order_id, fecha_envio, skus_pedidos). Agregar una tabla `envios_log` en Supabase queda para una fase posterior.

### Alternatives Considered

- **Llamar `crear_envio.py` con child_process desde Node**: Descartado — frágil, depende del venv Python, difícil de manejar errores y timeouts desde la UI.
- **Bloquear si Siigo falla antes de crear Shopify**: Descartado — Siigo puede tener fallos temporales y no debe impedir envíos.

### Open Questions

Ninguna — contexto suficiente para implementar.

---

## Step-by-Step Tasks

### Step 1: Extender shopify.js con createGiftingOrder()

Agregar el mapa ciudad→provincia (mismo que en `shopify_client.py`) y la función que crea la draft order y la completa.

**Actions:**

Reemplazar el contenido de `apps/creadoras/shopify.js` con la versión extendida:

```javascript
const fetch = require('node-fetch');
const config = require('../../scripts/influencers/config_influencers.json');

const SHOP = config.shopify.shop_name;
const CLIENT_ID = config.shopify.client_id;
const CLIENT_SECRET = config.shopify.client_secret;

let _token = null;
let _tokenExpiry = 0;

// Mapa ciudad → departamento Colombia
const CIUDAD_A_DEPARTAMENTO = {
  'medellín': 'Antioquia', 'medellin': 'Antioquia', 'bello': 'Antioquia',
  'itagüí': 'Antioquia', 'itagui': 'Antioquia', 'envigado': 'Antioquia',
  'sabaneta': 'Antioquia', 'rionegro': 'Antioquia', 'la ceja': 'Antioquia',
  'el retiro': 'Antioquia', 'guatapé': 'Antioquia', 'guatape': 'Antioquia',
  'copacabana': 'Antioquia', 'caldas': 'Antioquia', 'la estrella': 'Antioquia',
  'bogotá': 'Bogotá D.C.', 'bogota': 'Bogotá D.C.',
  'soacha': 'Cundinamarca', 'chía': 'Cundinamarca', 'chia': 'Cundinamarca',
  'zipaquirá': 'Cundinamarca', 'zipaquira': 'Cundinamarca',
  'cali': 'Valle del Cauca', 'palmira': 'Valle del Cauca', 'buenaventura': 'Valle del Cauca',
  'tuluá': 'Valle del Cauca', 'tulua': 'Valle del Cauca', 'buga': 'Valle del Cauca',
  'barranquilla': 'Atlántico', 'soledad': 'Atlántico',
  'cartagena': 'Bolívar',
  'bucaramanga': 'Santander', 'floridablanca': 'Santander', 'girón': 'Santander', 'giron': 'Santander',
  'manizales': 'Caldas',
  'pereira': 'Risaralda', 'dosquebradas': 'Risaralda',
  'armenia': 'Quindío',
  'cúcuta': 'Norte de Santander', 'cucuta': 'Norte de Santander',
  'ibagué': 'Tolima', 'ibague': 'Tolima',
  'villavicencio': 'Meta',
  'neiva': 'Huila',
  'pasto': 'Nariño',
  'montería': 'Córdoba', 'monteria': 'Córdoba',
  'valledupar': 'Cesar',
  'santa marta': 'Magdalena',
  'sincelejo': 'Sucre',
  'popayán': 'Cauca', 'popayan': 'Cauca',
  'tunja': 'Boyacá', 'duitama': 'Boyacá', 'sogamoso': 'Boyacá',
  'yopal': 'Casanare',
  'riohacha': 'La Guajira',
};

function inferirDepartamento(ciudad) {
  if (!ciudad) return '';
  return CIUDAD_A_DEPARTAMENTO[ciudad.toLowerCase().trim()] || '';
}

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
  _tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
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

async function shopifyPost(path, body) {
  const token = await getToken();
  const res = await fetch(`https://${SHOP}.myshopify.com/admin/api/2024-01/${path}`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Shopify POST error: ${res.status} ${await res.text()}`);
  return res.json();
}

async function shopifyPut(path, body) {
  const token = await getToken();
  const res = await fetch(`https://${SHOP}.myshopify.com/admin/api/2024-01/${path}`, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Shopify PUT error: ${res.status} ${await res.text()}`);
  return res.json();
}

// Resolver SKU → variant_id
async function getVariantIdForSku(sku) {
  const data = await shopifyGet('products.json', { limit: 250, fields: 'id,variants' });
  for (const product of data.products || []) {
    for (const variant of product.variants || []) {
      if ((variant.sku || '').trim() === sku.trim()) return String(variant.id);
    }
  }
  return null;
}

// Crear orden gifting $0 en Shopify
// influencer: dict de Supabase, skus: array de SKUs, kitNombre: string
async function createGiftingOrder(influencer, skus, kitNombre) {
  // Resolver SKUs
  const skuMap = {};
  for (const sku of skus) {
    const variantId = await getVariantIdForSku(sku);
    if (!variantId) throw new Error(`SKU no encontrado en Shopify: ${sku}`);
    skuMap[sku] = variantId;
  }

  const nombreParts = (influencer.nombre || 'Influencer').split(' ');
  const firstName = nombreParts[0];
  const lastName = nombreParts.slice(1).join(' ');

  const lineItems = Object.entries(skuMap).map(([sku, variantId]) => ({
    variant_id: variantId,
    quantity: 1,
    price: '0.00',
    applied_discount: {
      description: 'Gifting Influencer Programa Creadoras',
      value_type: 'percentage',
      value: '100.0',
      amount: '0.00',
      title: 'GIFTING100',
    },
  }));

  const province = influencer.departamento || inferirDepartamento(influencer.ciudad || '');

  const draftPayload = {
    draft_order: {
      line_items: lineItems,
      customer: { email: influencer.email },
      shipping_address: {
        first_name: firstName,
        last_name: lastName,
        address1: influencer.direccion_envio || '',
        city: influencer.ciudad || '',
        province,
        country: 'CO',
        phone: influencer.telefono || '',
      },
      note: `Gifting Influencer | ${kitNombre} | @${influencer.instagram_handle || 'N/A'} | Tier: ${influencer.tier || 'N/A'}`,
      tags: 'influencer-gifting,programa-creadoras',
      send_receipt: false,
      send_fulfillment_receipt: false,
      use_customer_default_address: false,
    },
  };

  // Crear draft order
  const draftResp = await shopifyPost('draft_orders.json', draftPayload);
  const draftId = draftResp.draft_order.id;

  // Completar draft order → orden real
  const completeResp = await shopifyPut(`draft_orders/${draftId}/complete.json`, { payment_pending: false });
  const order = completeResp.draft_order;
  const orderId = order.order_id || order.id;
  const orderNumber = order.order_number || '';

  return {
    shopify_order_id: String(orderId),
    shopify_order_number: String(orderNumber),
    shopify_draft_id: String(draftId),
  };
}

// Obtener ventas totales en un período
async function getVentas(fechaDesde, fechaHasta, codigoDescuento = null) {
  const params = {
    status: 'any',
    financial_status: 'paid',
    created_at_min: fechaDesde,
    created_at_max: fechaHasta,
    limit: 250,
    fields: 'id,created_at,total_price,discount_codes',
  };

  const data = await shopifyGet('orders.json', params);
  let ordenes = data.orders || [];

  if (codigoDescuento) {
    ordenes = ordenes.filter(o =>
      (o.discount_codes || []).some(d =>
        d.code.toLowerCase() === codigoDescuento.toLowerCase()
      )
    );
  }

  const totalVentas = ordenes.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
  return { totalVentas: Math.round(totalVentas), totalOrdenes: ordenes.length };
}

module.exports = { getVentas, createGiftingOrder };
```

**Files affected:** `apps/creadoras/shopify.js`

---

### Step 2: Crear siigo.js

Portar `siigo_client.py` a JS con las funciones: auth, get_product_price, registrar_salida_gifting.

**`apps/creadoras/siigo.js`:**

```javascript
const fetch = require('node-fetch');
const config = require('../../scripts/influencers/config_influencers.json');

const SIIGO_AUTH_URL = 'https://api.siigo.com/auth';
const SIIGO_BASE_URL = 'https://api.siigo.com';
const CONSUMIDOR_FINAL_NIT = '222222222222';
const DOCUMENT_TYPE_ID = 28599;
const PAYMENT_METHOD_ID = 7277;
const DEFAULT_SELLER_ID = 10984;

let _token = null;
let _tokenExpiry = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;
  const siigo = config.siigo;
  const res = await fetch(SIIGO_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: siigo.username, access_key: siigo.access_key }),
  });
  if (!res.ok) throw new Error(`Siigo auth error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  _token = data.access_token;
  _tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
  return _token;
}

function siigoHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Partner-Id': 'ProgramaCreadoras',
  };
}

async function getProductPrice(sku) {
  const token = await getToken();
  const res = await fetch(`${SIIGO_BASE_URL}/v1/products?code=${sku}&page_size=25`, {
    headers: siigoHeaders(token),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const items = Array.isArray(data) ? data : (data.results || []);
  for (const p of items) {
    if (p.code === sku) {
      const prices = p.prices || [];
      if (prices.length && prices[0].price_list && prices[0].price_list.length) {
        return parseFloat(prices[0].price_list[0].value || 0);
      }
      return 0;
    }
  }
  return null;
}

// Registrar salida de inventario gifting en Siigo
async function registrarSalidaGifting(skus, influencerNombre, influencerInstagram, shopifyOrderId) {
  const token = await getToken();
  const hoy = new Date().toISOString().split('T')[0];

  const observacion = `Gifting influencer @${influencerInstagram} (${influencerNombre}) | Shopify #${shopifyOrderId} | Programa Creadoras`;

  const items = [];
  for (const sku of skus) {
    const precio = await getProductPrice(sku);
    if (precio === null) {
      console.warn(`  Siigo: SKU ${sku} no encontrado — se omite`);
      continue;
    }
    items.push({ code: sku, quantity: 1, price: 1 });
  }

  if (items.length === 0) throw new Error(`Ningún SKU válido para Siigo: ${skus}`);

  const totalDocumento = items.length; // 1 COP por SKU

  const payload = {
    document: { id: DOCUMENT_TYPE_ID },
    date: hoy,
    customer: { identification: CONSUMIDOR_FINAL_NIT, branch_office: 0 },
    seller: DEFAULT_SELLER_ID,
    observations: observacion,
    items,
    payments: [{ id: PAYMENT_METHOD_ID, value: totalDocumento }],
  };

  let res = await fetch(`${SIIGO_BASE_URL}/v1/invoices`, {
    method: 'POST',
    headers: siigoHeaders(token),
    body: JSON.stringify(payload),
  });

  // Si el total no coincide, Siigo nos dice el real en el error
  if (res.status === 400) {
    const errData = await res.json();
    const errs = errData.Errors || [];
    for (const err of errs) {
      if (err.Code === 'invalid_total_payments') {
        const match = (err.Message || '').match(/total invoice calculated is (\d+(?:\.\d+)?)/);
        if (match) {
          payload.payments[0].value = parseFloat(match[1]);
          res = await fetch(`${SIIGO_BASE_URL}/v1/invoices`, {
            method: 'POST',
            headers: siigoHeaders(token),
            body: JSON.stringify(payload),
          });
        }
        break;
      }
    }
  }

  if (!res.ok) throw new Error(`Siigo error ${res.status}: ${await res.text()}`);

  const result = await res.json();
  return { id: result.id, name: result.name };
}

module.exports = { registrarSalidaGifting };
```

**Files affected:** `apps/creadoras/siigo.js`

---

### Step 3: Agregar updateEnvio() en supabase.js

Función que actualiza todos los campos de un envío en una sola llamada PATCH.

**Action:** agregar al final de `apps/creadoras/supabase.js`, antes del `module.exports`:

```javascript
async function updateEnvio(influencer_id, { skus, shopify_order_id, kit_asignado, tier }) {
  const hoy = new Date().toISOString().split('T')[0];
  const data = {
    status: 'Producto Enviado',
    fecha_envio: hoy,
    skus_pedidos: skus,
    shopify_order_id,
  };
  if (kit_asignado) data.kit_asignado = kit_asignado;
  if (tier) data.tier = tier;
  return supabasePatch('influencers', { id: influencer_id }, data);
}
```

Y actualizar `module.exports` para incluirla:
```javascript
module.exports = { getInfluencers, getInfluencerById, updateInfluencer, updateEnvio, getContenidos, getKits, getStats };
```

**Files affected:** `apps/creadoras/supabase.js`

---

### Step 4: Agregar endpoints en index.js

Dos endpoints nuevos:

**`GET /api/config/productos`** — expone productos disponibles del config:
```javascript
app.get('/api/config/productos', (req, res) => {
  const productos = config.productos_disponibles || {};
  const kits = config.kits || {};
  res.json({ productos, kits });
});
```
Requiere `const config = require('../../scripts/influencers/config_influencers.json');` al inicio del archivo.

**`POST /api/influencers/:id/enviar`** — flujo completo:
```javascript
app.post('/api/influencers/:id/enviar', async (req, res) => {
  const { skus, kit_nombre } = req.body;
  if (!skus || !Array.isArray(skus) || skus.length === 0) {
    return res.status(400).json({ error: 'Se requiere al menos un SKU' });
  }

  try {
    const influencer = await supabase.getInfluencerById(req.params.id);
    if (!influencer) return res.status(404).json({ error: 'Influencer no encontrada' });

    // 1. Crear orden Shopify
    const kitLabel = kit_nombre || `${skus.length} producto(s)`;
    const shopifyResult = await shopify.createGiftingOrder(influencer, skus, kitLabel);

    // 2. Actualizar Supabase
    await supabase.updateEnvio(req.params.id, {
      skus,
      shopify_order_id: shopifyResult.shopify_order_id,
      kit_asignado: kit_nombre || null,
    });

    // 3. Intentar Siigo (no bloquea si falla)
    let siigoResult = null;
    let siigoError = null;
    try {
      siigoResult = await siigo.registrarSalidaGifting(
        skus,
        influencer.nombre,
        influencer.instagram_handle || '',
        shopifyResult.shopify_order_id
      );
    } catch (e) {
      siigoError = e.message;
      console.error('Siigo error (no fatal):', e.message);
    }

    res.json({
      ok: true,
      shopify: shopifyResult,
      siigo: siigoResult,
      siigo_error: siigoError,
    });
  } catch (e) {
    console.error('Error en enviar kit:', e.message);
    res.status(500).json({ error: e.message });
  }
});
```

También agregar al inicio de `index.js`:
```javascript
const config = require('../../scripts/influencers/config_influencers.json');
const siigo = require('./siigo');
```

**Files affected:** `apps/creadoras/index.js`

---

### Step 5: Agregar modal en el frontend (index.html)

En el componente `DetalleInfluencer`, agregar:

1. **Estado del modal:**
```javascript
const [modalEnvio, setModalEnvio] = useState(false);
const [productos, setProductos] = useState({});
const [skusSeleccionados, setSkusSeleccionados] = useState([]);
const [enviando, setEnviando] = useState(false);
const [envioResult, setEnvioResult] = useState(null);
```

2. **Cargar productos al abrir el modal:**
```javascript
const abrirModal = async () => {
  const cfg = await API('/api/config/productos');
  setProductos(cfg.productos || {});
  setSkusSeleccionados([]);
  setEnvioResult(null);
  setModalEnvio(true);
};
```

3. **Función de envío:**
```javascript
const confirmarEnvio = async () => {
  if (skusSeleccionados.length === 0) return;
  setEnviando(true);
  try {
    const result = await fetch(`/api/influencers/${id}/enviar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skus: skusSeleccionados, kit_nombre: `${skusSeleccionados.length} producto(s)` }),
    });
    const data = await result.json();
    if (!result.ok) throw new Error(data.error);
    setEnvioResult(data);
    load(); // Refrescar datos de la influencer
  } catch(e) {
    setError(e.message);
    setModalEnvio(false);
  } finally {
    setEnviando(false);
  }
};
```

4. **Botón "Enviar Kit"** — agregar junto al título del detalle, visible solo si `status !== 'Producto Enviado'` y `status !== 'Contenido Entregado'` y `status !== 'Calificada'`:
```jsx
{!['Producto Enviado','Contenido Entregado','Calificada'].includes(data.status) && (
  <button className="btn btn-primary" onClick={abrirModal}>Enviar Kit</button>
)}
```

5. **Modal** — overlay con fondo semitransparente, lista de checkboxes de productos, sugerencia de tier, botón confirmar:

El modal muestra:
- Título "Seleccionar productos para [nombre]"
- Subtítulo con el tier y la sugerencia de cantidad (informativo, no restricción)
- Lista de checkboxes con nombre del producto + SKU
- Contador "X productos seleccionados"
- Botón "Confirmar y enviar" (deshabilitado si 0 seleccionados)
- Botón "Cancelar"

Si `envioResult` está presente (éxito), el modal muestra:
- ✓ Orden Shopify creada: #{order_number}
- ✓ Siigo registrado (o ⚠ Siigo no registrado: [error] si falló)
- Botón "Cerrar"

**Estilos del modal** — agregar al `<style>`:
```css
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center;
  z-index: 200;
}
.modal {
  background: var(--bg2); border: 1px solid var(--border);
  border-radius: 16px; padding: 28px; width: 480px; max-width: 95vw;
  max-height: 80vh; overflow-y: auto;
}
.modal h2 { font-size: 16px; margin-bottom: 4px; }
.modal-subtitle { color: var(--text-muted); font-size: 13px; margin-bottom: 20px; }
.producto-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px; border-radius: 8px; cursor: pointer;
  border: 1px solid transparent; margin-bottom: 6px; transition: all 0.1s;
}
.producto-item:hover { background: var(--bg3); }
.producto-item.selected { border-color: var(--purple); background: rgba(124,58,237,0.1); }
.producto-item input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--purple); }
.producto-nombre { font-size: 13px; font-weight: 500; flex: 1; }
.producto-sku { font-size: 11px; color: var(--text-muted); font-family: monospace; }
.modal-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); }
.envio-success { background: var(--bg3); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
.envio-success .line { font-size: 13px; padding: 4px 0; }
.envio-success .line.ok { color: var(--green); }
.envio-success .line.warn { color: var(--yellow); }
```

**Files affected:** `apps/creadoras/public/index.html`

---

## Connections & Dependencies

### Files That Reference This Area

- `scripts/influencers/shopify_client.py` — lógica original portada, no se modifica
- `scripts/influencers/siigo_client.py` — lógica original portada, no se modifica
- `scripts/influencers/config_influencers.json` — fuente de verdad de productos, leída por ambas versiones

### Updates Needed for Consistency

- Ninguna actualización de CLAUDE.md necesaria — la funcionalidad es una extensión de la app ya documentada

### Impact on Existing Workflows

- `crear_envio.py` sigue funcionando igual — la app y el script son independientes
- Si alguien usa la app para enviar, el script Python saltará esa influencer (ya tiene status "Producto Enviado")

---

## Validation Checklist

- [ ] `GET /api/config/productos` retorna la lista de productos del config
- [ ] Modal se abre al hacer clic en "Enviar Kit" desde el detalle
- [ ] Checkboxes seleccionan/deseleccionan productos correctamente
- [ ] Botón "Confirmar" deshabilitado con 0 productos seleccionados
- [ ] `POST /api/influencers/:id/enviar` crea orden en Shopify
- [ ] Orden aparece en Shopify Admin con tag `influencer-gifting`
- [ ] Supabase actualiza `status`, `fecha_envio`, `skus_pedidos`, `shopify_order_id`
- [ ] Modal muestra número de orden Shopify tras éxito
- [ ] Si Siigo falla, la orden Shopify igual se completa y el modal muestra warning
- [ ] Botón "Enviar Kit" desaparece una vez que status es "Producto Enviado"

---

## Success Criteria

1. El equipo puede enviar un kit desde la app sin tocar la terminal ni Supabase manualmente
2. La orden aparece en Shopify Admin y el status en Supabase cambia a "Producto Enviado" automáticamente
3. El inventario se registra en Siigo (o se muestra un warning claro si Siigo falla)

---

## Notes

- **Restricción de tier**: No se implementa — es intencional. El tier es solo una guía visual en el modal.
- **skus_pedidos en Supabase**: Es un array de texto (`text[]`). La API de Supabase acepta el array JSON directamente en el PATCH.
- **Múltiples envíos a la misma influencer**: Si se envía un segundo kit (status vuelve a "Registrada" manualmente), el flujo funciona igual — sobreescribe `shopify_order_id` con el más reciente.

---

## Implementation Notes

**Implemented:** 2026-03-24

### Summary

- `shopify.js` reemplazado con versión extendida: mapa ciudad→provincia + `createGiftingOrder()` + helpers `shopifyPost()`/`shopifyPut()`
- `siigo.js` creado con auth, `getProductPrice()` y `registrarSalidaGifting()`
- `supabase.js` extendido con `updateEnvio()`
- `index.js` actualizado: imports de config + siigo, nuevos endpoints `GET /api/config/productos` y `POST /api/influencers/:id/enviar`
- `public/index.html` actualizado: estilos del modal + estados del modal en `DetalleInfluencer` + botón "Enviar Kit" + modal completo con checkboxes, sugerencia de tier, confirmación y pantalla de resultado

### Deviations from Plan

- None

### Issues Encountered

- None
