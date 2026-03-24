const fetch = require('node-fetch');
const config = require('./config');

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
async function createGiftingOrder(influencer, skus, kitNombre) {
  // Resolver SKUs a variant IDs
  const skuMap = {};
  for (const sku of skus) {
    const variantId = await getVariantIdForSku(sku);
    if (!variantId) throw new Error(`SKU no encontrado en Shopify: ${sku}`);
    skuMap[sku] = variantId;
  }

  const nombreParts = (influencer.nombre || 'Influencer').split(' ');
  const firstName = nombreParts[0];
  const lastName = nombreParts.slice(1).join(' ');

  const lineItems = Object.entries(skuMap).map(([, variantId]) => ({
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
