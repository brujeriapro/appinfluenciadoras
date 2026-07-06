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
async function getStats(preciosPorSku = {}) {
  const influencers = await getInfluencers();
  const contenidos = await getContenidos();

  // Conteo por status
  const porStatus = {};
  influencers.forEach(inf => {
    porStatus[inf.status] = (porStatus[inf.status] || 0) + 1;
  });

  // Costo total: suma de precios Shopify de los SKUs realmente enviados
  const enviadas = influencers.filter(i =>
    ['Producto Enviado', 'Contenido Entregado', 'Calificada'].includes(i.status)
  );
  const costoTotal = enviadas.reduce((sum, inf) => {
    const skus = Array.isArray(inf.skus_pedidos) ? inf.skus_pedidos : [];
    return sum + skus.reduce((s, sku) => s + (preciosPorSku[sku] || 0), 0);
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

async function getContenidoById(id) {
  const results = await supabaseGet('contenidos', { id: `eq.${id}`, limit: 1, select: '*' });
  return results[0] || null;
}

async function updateContenido(id, data) {
  return supabasePatch('contenidos', { id }, data);
}

async function getInfluencersPendingSeguimiento() {
  const hace6dias = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  return supabaseGet('influencers', {
    select: '*',
    status: 'eq.Producto Enviado',
    fecha_envio: `lte.${hace6dias}`,
  });
}

async function getInfluencersPendingIdeas() {
  // Influencers con kit enviado hace exactamente 4 días (±1 día de margen)
  const hace3dias = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const hace5dias = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  return supabaseGet('influencers', {
    select: '*',
    status: 'eq.Producto Enviado',
    fecha_envio: `gte.${hace5dias}`,
    'fecha_envio.lte': hace3dias,
    telefono: 'not.is.null',
  });
}

async function getInfluencersConTelefono() {
  return supabaseGet('influencers', {
    select: '*',
    telefono: 'not.is.null',
    order: 'fecha_registro.desc',
  });
}

async function getInfluencerByEmail(email) {
  const results = await supabaseGet('influencers', {
    email: `ilike.${email}`,
    limit: 1,
    select: '*',
  });
  return results[0] || null;
}

function _normTel(t) {
  if (!t) return '';
  return String(t).replace(/\D/g, '').slice(-10);
}

async function getInfluencerByTelefono(telefono) {
  if (!telefono) return null;
  const buscar = _normTel(telefono);
  if (!buscar) return null;
  // Cargar todas con teléfono y comparar últimos 10 dígitos en Node
  // (evita problemas de formato: +57, espacios, con/sin código país)
  const todas = await supabaseGet('influencers', { select: 'id,nombre,telefono,status,tier,nivel_bruja,fecha_envio,fecha_confirmacion_recibo,instagram_handle,score_total', telefono: 'not.is.null' });
  return todas.find(i => _normTel(i.telefono) === buscar) || null;
}

async function getInfluencerByTikTok(handle) {
  if (!handle) return null;
  const clean = handle.replace('@', '').toLowerCase().trim();
  const results = await supabaseGet('influencers', {
    tiktok_handle: `eq.${clean}`,
    limit: 1,
    select: '*',
  });
  return results[0] || null;
}

async function getInfluencerByInstagram(handle) {
  if (!handle) return null;
  const clean = handle.replace('@', '').toLowerCase().trim();
  const results = await supabaseGet('influencers', {
    instagram_handle: `eq.${clean}`,
    limit: 1,
    select: '*',
  });
  return results[0] || null;
}

async function updatePasswordHash(id, password_hash) {
  return supabasePatch('influencers', { id }, { password_hash });
}

// Notificaciones enviadas
async function registrarNotificacion(influencer_id, template_name, enviado_por = 'admin') {
  return supabasePost('notificaciones_enviadas', { influencer_id, template_name, enviado_por });
}

async function getNotificacionesDeInfluencer(influencer_id) {
  return supabaseGet('notificaciones_enviadas', {
    influencer_id: `eq.${influencer_id}`,
    select: 'template_name,fecha_envio,enviado_por',
    order: 'fecha_envio.desc',
  });
}

async function yaEnviadoTemplate(influencer_id, template_name) {
  const results = await supabaseGet('notificaciones_enviadas', {
    influencer_id: `eq.${influencer_id}`,
    template_name: `eq.${template_name}`,
    limit: 1,
    select: 'id',
  });
  return results.length > 0;
}

// Candidatas TikTok
async function getCandidatas({ status, min_colombia_score, tier, limit = 200 } = {}) {
  const params = { select: '*', order: 'fecha_scrape.desc', limit };
  if (status) params.status = `eq.${status}`;
  if (min_colombia_score) params.colombia_score = `gte.${min_colombia_score}`;
  if (tier) params.tier_estimado = `eq.${tier}`;
  return supabaseGet('candidatas_influencer', params);
}

async function getCandidataById(id) {
  const res = await supabaseGet('candidatas_influencer', { id: `eq.${id}`, limit: 1, select: '*' });
  return res[0] || null;
}

async function updateCandidataStatus(id, status, notas_equipo) {
  const data = { status, fecha_actualizacion: new Date().toISOString() };
  if (notas_equipo !== undefined) data.notas_equipo = notas_equipo;
  return supabasePatch('candidatas_influencer', { id }, data);
}

async function aprobarCandidataComoInfluencer(id) {
  const candidata = await getCandidataById(id);
  if (!candidata) throw new Error('Candidata no encontrada');

  // Insertar en tabla influencers
  const nuevaInfluencer = await supabasePost('influencers', {
    nombre: candidata.nombre_display || candidata.tiktok_handle,
    tiktok_handle: candidata.tiktok_handle,
    seguidores_tiktok: candidata.seguidores,
    tier: candidata.tier_estimado || 'Nano',
    status: 'Prospectada',
  });
  const inf = Array.isArray(nuevaInfluencer) ? nuevaInfluencer[0] : nuevaInfluencer;

  // Vincular candidata con la influencer creada
  await supabasePatch('candidatas_influencer', { id }, {
    status: 'registrada',
    influencer_id: inf.id,
    fecha_actualizacion: new Date().toISOString(),
  });

  return inf;
}

// Solicitudes de reenvío
async function insertSolicitudReenvio(influencer_id, productos, mensaje, direccion) {
  const results = await supabasePost('solicitudes_reenvio', {
    influencer_id,
    productos,
    mensaje: mensaje || null,
    direccion_envio: direccion?.direccion_envio || null,
    ciudad: direccion?.ciudad || null,
    departamento: direccion?.departamento || null,
    codigo_postal: direccion?.codigo_postal || null,
  });
  return Array.isArray(results) ? results[0] : results;
}

async function getSolicitudesReenvio() {
  return supabaseGet('solicitudes_reenvio', {
    select: '*,influencers(nombre,instagram_handle,tier)',
    order: 'fecha_solicitud.desc',
  });
}

async function updateSolicitudReenvio(id, data) {
  return supabasePatch('solicitudes_reenvio', { id }, { ...data, fecha_actualizacion: new Date().toISOString() });
}

// ── UGC ──────────────────────────────────────────────────────────────────────

async function enrollUGC(influencer_id, codigo_ugc) {
  return supabasePatch('influencers', { id: influencer_id }, {
    codigo_ugc,
    ugc_activa: true,
    ugc_fecha_inicio: new Date().toISOString(),
  });
}

async function getUGCCreadoras() {
  return supabaseGet('influencers', {
    select: '*',
    ugc_activa: 'eq.true',
    order: 'ugc_fecha_inicio.desc',
  });
}

async function insertUGCVenta(data) {
  const url = new URL(`${BASE_URL}/ugc_ventas`);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { ...HEADERS, 'Prefer': 'return=representation,resolution=ignore-duplicates' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    if (text.includes('duplicate') || text.includes('23505')) return null;
    throw new Error(`Supabase POST ugc_ventas: ${res.status} ${text}`);
  }
  const result = await res.json();
  return Array.isArray(result) ? result[0] : result;
}

async function getUGCVentas(influencer_id, mes = null) {
  const params = { influencer_id: `eq.${influencer_id}`, order: 'fecha.desc' };
  if (mes) params.mes = `eq.${mes}`;
  return supabaseGet('ugc_ventas', params);
}

async function getUGCVentasTotales(influencer_id) {
  const ventas = await supabaseGet('ugc_ventas', {
    influencer_id: `eq.${influencer_id}`,
    select: 'total_orden',
  });
  return ventas.reduce((s, v) => s + parseFloat(v.total_orden || 0), 0);
}

async function insertUGCPago(data) {
  return supabasePost('ugc_pagos', data);
}

async function getUGCPagos(influencer_id) {
  return supabaseGet('ugc_pagos', { influencer_id: `eq.${influencer_id}`, order: 'mes.desc' });
}

async function insertUGCRegalo(data) {
  const url = new URL(`${BASE_URL}/ugc_regalos`);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { ...HEADERS, 'Prefer': 'return=representation,resolution=ignore-duplicates' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    if (text.includes('duplicate') || text.includes('23505')) return null;
    throw new Error(`Supabase POST ugc_regalos: ${res.status} ${text}`);
  }
  const result = await res.json();
  return Array.isArray(result) ? result[0] : result;
}

async function getUGCRegalos(influencer_id) {
  return supabaseGet('ugc_regalos', { influencer_id: `eq.${influencer_id}`, order: 'numero_regalo.asc' });
}

async function getUGCRegaloById(id) {
  const r = await supabaseGet('ugc_regalos', { id: `eq.${id}`, limit: 1 });
  return r[0] || null;
}

async function updateUGCRegalo(id, data) {
  return supabasePatch('ugc_regalos', { id }, data);
}

async function getUGCRegalosAllPendientes() {
  return supabaseGet('ugc_regalos', {
    select: '*,influencers(nombre,instagram_handle,telefono,ciudad,direccion_envio)',
    estado: 'eq.pendiente',
    order: 'created_at.asc',
  });
}

// ── ACUERDOS DE COLABORACIÓN ──────────────────────────────────────────────
async function insertAcuerdo(data) {
  const r = await supabasePost('ugc_acuerdos', data);
  return Array.isArray(r) ? r[0] : r;
}
async function getAcuerdoByInfluencer(influencer_id) {
  const r = await supabaseGet('ugc_acuerdos', { influencer_id: `eq.${influencer_id}`, order: 'created_at.desc', limit: 1 });
  return r[0] || null;
}
async function getAcuerdosFirmados() {
  // Solo los ids de creadoras con acuerdo firmado (para el dashboard)
  return supabaseGet('ugc_acuerdos', { select: 'id,influencer_id,fecha_firma', estado: 'eq.firmado' });
}

module.exports = { getCandidatas, getCandidataById, updateCandidataStatus, aprobarCandidataComoInfluencer, getInfluencers, getInfluencerById, updateInfluencer, updateEnvio, getContenidos, getKits, getStats, getInfluencerByEmail, getInfluencerByTelefono, getInfluencerByTikTok, getInfluencerByInstagram, updatePasswordHash, insertInfluencer, insertContenido, getContenidoById, updateContenido, getInfluencersPendingSeguimiento, getInfluencersPendingIdeas, getInfluencersConTelefono, registrarNotificacion, getNotificacionesDeInfluencer, yaEnviadoTemplate, insertSolicitudReenvio, getSolicitudesReenvio, updateSolicitudReenvio, enrollUGC, getUGCCreadoras, insertUGCVenta, getUGCVentas, getUGCVentasTotales, insertUGCPago, getUGCPagos, insertUGCRegalo, getUGCRegalos, getUGCRegaloById, updateUGCRegalo, getUGCRegalosAllPendientes, insertAcuerdo, getAcuerdoByInfluencer, getAcuerdosFirmados };
