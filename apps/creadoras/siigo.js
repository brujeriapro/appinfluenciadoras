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
