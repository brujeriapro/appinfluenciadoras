// Script temporal: verifica guías Effi en órdenes Shopify desde el viernes pasado
// Uso: node check-guias.js
// Eliminar después de usar

const fetch = require('node-fetch');
const config = require('./config');

const SHOP = config.shopify.shop_name;
const CLIENT_ID = config.shopify.client_id;
const CLIENT_SECRET = config.shopify.client_secret;

const FECHA_DESDE = '2026-04-17T00:00:00-05:00'; // Hoy 17 de abril, hora Colombia

async function getToken() {
  const res = await fetch(`https://${SHOP}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'client_credentials' }),
  });
  if (!res.ok) throw new Error(`Auth error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function shopifyGet(token, path, params = {}) {
  const url = new URL(`https://${SHOP}.myshopify.com/admin/api/2024-01/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { 'X-Shopify-Access-Token': token },
  });
  if (!res.ok) throw new Error(`GET error: ${res.status} ${await res.text()}`);
  return res.json();
}

async function getFulfillments(token, orderId) {
  const data = await shopifyGet(token, `orders/${orderId}/fulfillments.json`);
  return data.fulfillments || [];
}

async function main() {
  console.log(`\nVerificando órdenes Shopify de hoy (17 de abril 2026)...\n`);

  const token = await getToken();

  // Traer órdenes desde el viernes (excluir gifting)
  const data = await shopifyGet(token, 'orders.json', {
    status: 'open',
    created_at_min: FECHA_DESDE,
    limit: 250,
    fields: 'id,order_number,name,created_at,fulfillment_status,customer,shipping_address,tags,total_price',
  });

  // También traer órdenes cerradas del período
  const dataClosed = await shopifyGet(token, 'orders.json', {
    status: 'closed',
    created_at_min: FECHA_DESDE,
    limit: 250,
    fields: 'id,order_number,name,created_at,fulfillment_status,customer,shipping_address,tags,total_price',
  });

  const todasOrdenes = [...(data.orders || []), ...(dataClosed.orders || [])];

  // Filtrar órdenes de gifting (tag influencer-gifting)
  const ordenesReales = todasOrdenes.filter(o => {
    const tags = (o.tags || '').toLowerCase();
    return !tags.includes('influencer-gifting');
  });

  console.log(`Total órdenes encontradas (sin gifting): ${ordenesReales.length}`);
  console.log(`─────────────────────────────────────────────────────────\n`);

  const sinGuia = [];
  const conGuia = [];

  for (const orden of ordenesReales) {
    const fulfillments = await getFulfillments(token, orden.id);
    const tracking = fulfillments
      .flatMap(f => f.tracking_numbers || [])
      .filter(Boolean);

    const fecha = new Date(orden.created_at).toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });

    const nombre = orden.shipping_address
      ? `${orden.shipping_address.first_name || ''} ${orden.shipping_address.last_name || ''}`.trim()
      : orden.customer?.first_name || 'Sin nombre';

    const info = {
      numero: orden.name,
      fecha,
      nombre,
      total: `$${parseFloat(orden.total_price).toLocaleString('es-CO')}`,
      fulfillment_status: orden.fulfillment_status || 'unfulfilled',
      tracking: tracking.length > 0 ? tracking.join(', ') : null,
    };

    if (tracking.length > 0) {
      conGuia.push(info);
    } else {
      sinGuia.push(info);
    }
  }

  // Mostrar resultados
  console.log(`✅  CON GUÍA (${conGuia.length} órdenes):`);
  if (conGuia.length === 0) {
    console.log('   Ninguna');
  } else {
    conGuia.forEach(o => {
      console.log(`   ${o.numero} | ${o.fecha} | ${o.nombre} | ${o.total} | Guía: ${o.tracking}`);
    });
  }

  console.log(`\n❌  SIN GUÍA (${sinGuia.length} órdenes):`);
  if (sinGuia.length === 0) {
    console.log('   ¡Todas las órdenes tienen guía! 🎉');
  } else {
    sinGuia.forEach(o => {
      console.log(`   ${o.numero} | ${o.fecha} | ${o.nombre} | ${o.total} | Status: ${o.fulfillment_status}`);
    });
  }

  console.log(`\n─────────────────────────────────────────────────────────`);
  console.log(`Resumen: ${conGuia.length} con guía / ${sinGuia.length} sin guía / ${ordenesReales.length} total`);
  console.log(`Período: Hoy 17 de abril 2026\n`);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
