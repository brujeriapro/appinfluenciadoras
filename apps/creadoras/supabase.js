const fetch = require('node-fetch');
const config = require('./config');

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

  // Costo total de kits enviados
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

async function supabasePost(table, data) {
  const url = `${BASE_URL}/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase POST ${table} error: ${res.status} ${await res.text()}`);
  return res.json();
}

async function insertInfluencer(data) {
  const results = await supabasePost('influencers', data);
  return Array.isArray(results) ? results[0] : results;
}

async function insertContenido(data) {
  const results = await supabasePost('contenidos', data);
  return Array.isArray(results) ? results[0] : results;
}

async function getInfluencersPendingSeguimiento() {
  const hace30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  return supabaseGet('influencers', {
    select: '*',
    status: 'eq.Producto Enviado',
    fecha_envio: `lte.${hace30dias}`,
  });
}

async function getInfluencerByEmail(email) {
  const results = await supabaseGet('influencers', {
    email: `eq.${email}`,
    limit: 1,
    select: '*',
  });
  return results[0] || null;
}

async function updatePasswordHash(id, password_hash) {
  return supabasePatch('influencers', { id }, { password_hash });
}

module.exports = { getInfluencers, getInfluencerById, updateInfluencer, updateEnvio, getContenidos, getKits, getStats, getInfluencerByEmail, updatePasswordHash, insertInfluencer, insertContenido, getInfluencersPendingSeguimiento };
