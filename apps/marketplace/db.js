// Capa de acceso a Supabase para Creadores.app.
//
// Mismo patrón que apps/creadoras/supabase.js: REST API directa con la
// service_role_key, sin ORM. Comparte instancia con el Programa Creadoras, pero
// solo escribe en tablas mk_*; de `influencers` únicamente lee.
//
// REGLA DEL MÓDULO: las funciones que alimentan el catálogo enumeran sus
// columnas una por una y NUNCA usan select=*. El handle de la creadora vive en
// `influencers`, y la única función autorizada a traerlo es
// getContactoCreadora(), que solo debe llamarse desde el panel admin o desde un
// trato con el contacto ya revelado.

const fetch = require('node-fetch');
const config = require('./config');

const BASE_URL = String(config.supabase.url || '').replace(/\/$/, '') + '/rest/v1';
const KEY = config.supabase.service_role_key;

const HEADERS = {
  'apikey': KEY,
  'Authorization': `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

// ── Helpers genéricos ───────────────────────────────────────────────────────

async function get(tabla, params = {}) {
  const url = new URL(`${BASE_URL}/${tabla}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase GET ${tabla}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function getUno(tabla, params = {}) {
  const filas = await get(tabla, { ...params, limit: 1 });
  return filas[0] || null;
}

async function post(tabla, data) {
  const res = await fetch(`${BASE_URL}/${tabla}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase POST ${tabla}: ${res.status} ${await res.text()}`);
  const filas = await res.json();
  return Array.isArray(filas) ? filas[0] : filas;
}

async function patch(tabla, filtros, data) {
  const url = new URL(`${BASE_URL}/${tabla}`);
  Object.entries(filtros).forEach(([k, v]) => url.searchParams.set(k, `eq.${v}`));
  const res = await fetch(url.toString(), {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${tabla}: ${res.status} ${await res.text()}`);
  const filas = await res.json();
  return Array.isArray(filas) ? filas[0] : filas;
}

async function rpc(funcion, args = {}) {
  const res = await fetch(`${BASE_URL}/rpc/${funcion}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`Supabase RPC ${funcion}: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Configuración ───────────────────────────────────────────────────────────

// Caché corto: la config se lee en casi todas las peticiones y cambia muy poco.
let _cacheConfig = null;
let _cacheConfigAt = 0;
const CACHE_MS = 60_000;

async function getConfig({ forzar = false } = {}) {
  if (!forzar && _cacheConfig && Date.now() - _cacheConfigAt < CACHE_MS) {
    return _cacheConfig;
  }
  const filas = await get('mk_config', { select: 'clave,valor' });
  const cfg = {};
  filas.forEach(f => { cfg[f.clave] = f.valor; });
  _cacheConfig = cfg;
  _cacheConfigAt = Date.now();
  return cfg;
}

async function setConfig(clave, valor) {
  const existe = await getUno('mk_config', { clave: `eq.${clave}`, select: 'clave' });
  if (existe) {
    await patch('mk_config', { clave }, { valor, updated_at: new Date().toISOString() });
  } else {
    await post('mk_config', { clave, valor });
  }
  invalidarCacheConfig();
}

function invalidarCacheConfig() {
  _cacheConfig = null;
  _cacheConfigAt = 0;
}

// ── Marcas ──────────────────────────────────────────────────────────────────

const COLS_MARCA = 'id,nombre_empresa,nombre_contacto,email,whatsapp,nit,ciudad,sitio_web,estado,terminos_version,terminos_aceptados_at,created_at';

const getMarcaPorEmail = (email) =>
  getUno('mk_marcas', { email: `eq.${String(email).toLowerCase().trim()}`, select: '*' });

const getMarcaById = (id) =>
  getUno('mk_marcas', { id: `eq.${id}`, select: COLS_MARCA });

const insertMarca = (data) => post('mk_marcas', data);

const updateMarca = (id, data) => patch('mk_marcas', { id }, data);

const getMarcas = () =>
  get('mk_marcas', { select: COLS_MARCA, order: 'created_at.desc' });

// ── Creadoras ───────────────────────────────────────────────────────────────

// Columnas que puede ver una marca. Sin influencer_id, sin email, sin whatsapp:
// nada que permita contactar o identificar a la creadora por fuera del trato.
const COLS_CATALOGO = [
  'id', 'nombre_publico', 'ciudad', 'categorias', 'nicho', 'rango_alcance',
  'engagement_pct', 'nivel_tarifa', 'tarifa_min', 'tarifa_max',
  'entregable_tipico', 'bio_corta', 'colaboraciones_completadas',
].join(',');

async function getCatalogo({ categoria, nicho, rango_alcance, nivel_tarifa, ciudad, presupuesto_max } = {}) {
  const params = {
    select: COLS_CATALOGO,
    visible: 'eq.true',
    order: 'colaboraciones_completadas.desc',
  };
  // categorias y nicho son arrays en Postgres: "cs" = contains
  if (categoria)     params.categorias = `cs.{${categoria}}`;
  if (nicho)         params.nicho = `cs.{${nicho}}`;
  if (rango_alcance) params.rango_alcance = `eq.${rango_alcance}`;
  if (nivel_tarifa)  params.nivel_tarifa = `eq.${nivel_tarifa}`;
  if (ciudad)        params.ciudad = `eq.${ciudad}`;
  // "Muéstrame quién cabe en mi presupuesto": basta con que su entregable más
  // barato quepa, aunque tenga otros más caros.
  if (presupuesto_max) params.tarifa_min = `lte.${presupuesto_max}`;
  return get('mk_creadoras', params);
}

const getCreadoraCatalogo = (id) =>
  getUno('mk_creadoras', { id: `eq.${id}`, visible: 'eq.true', select: COLS_CATALOGO });

// Vista completa: SOLO para el panel admin y para la propia creadora.
const getCreadoraCompleta = (id) =>
  getUno('mk_creadoras', { id: `eq.${id}`, select: '*' });

const getCreadoraPorEmail = (email) =>
  getUno('mk_creadoras', { email: `eq.${String(email).toLowerCase().trim()}`, select: '*' });

const getCreadoraPorInfluencer = (influencer_id) =>
  getUno('mk_creadoras', { influencer_id: `eq.${influencer_id}`, select: '*' });

const insertCreadora = (data) => post('mk_creadoras', data);

const updateCreadora = (id, data) => patch('mk_creadoras', { id }, data);

const getCreadorasAdmin = () =>
  get('mk_creadoras', { select: '*', order: 'created_at.desc' });

/**
 * Datos de contacto reales de una creadora.
 *
 * ÚNICA función que cruza hacia `influencers` para traer el handle. Llamarla
 * solo desde admin.js o desde un trato cuyo contacto_revelado_at no sea nulo.
 * Cualquier otro uso rompe la promesa de identidad oculta del marketplace.
 */
async function getContactoCreadora(creadora_id) {
  const c = await getUno('mk_creadoras', {
    id: `eq.${creadora_id}`,
    select: 'id,nombre_publico,email,whatsapp,ciudad,influencer_id',
  });
  if (!c) return null;

  let handles = {};
  if (c.influencer_id) {
    const inf = await getUno('influencers', {
      id: `eq.${c.influencer_id}`,
      select: 'nombre,instagram_handle,tiktok_handle,telefono,email',
    });
    if (inf) {
      handles = {
        nombre_real: inf.nombre,
        instagram: inf.instagram_handle,
        tiktok: inf.tiktok_handle,
        telefono: c.whatsapp || inf.telefono,
        email: c.email || inf.email,
      };
    }
  }
  return {
    nombre_publico: c.nombre_publico,
    email: c.email,
    whatsapp: c.whatsapp,
    ciudad: c.ciudad,
    ...handles,
  };
}

// ── Tarifas ─────────────────────────────────────────────────────────────────
// Cada creadora publica cuánto cobra por cada tipo de entregable. La plataforma
// no le asigna precio a nadie: solo sugiere un rango en el control deslizante.

const getTarifasDeCreadora = (creadora_id) =>
  get('mk_tarifas', {
    creadora_id: `eq.${creadora_id}`,
    select: 'id,entregable,precio,activo',
    order: 'precio.asc',
  });

async function getTarifasDeVarias(ids = []) {
  if (!ids.length) return {};
  const filas = await get('mk_tarifas', {
    creadora_id: `in.(${ids.join(',')})`,
    activo: 'eq.true',
    select: 'creadora_id,entregable,precio',
    order: 'precio.asc',
  });
  const porCreadora = {};
  filas.forEach(t => {
    (porCreadora[t.creadora_id] = porCreadora[t.creadora_id] || []).push(t);
  });
  return porCreadora;
}

/**
 * Reemplaza el set completo de tarifas de una creadora.
 *
 * Se hace por reemplazo y no por merge para que la creadora pueda quitar un
 * entregable simplemente no incluyéndolo: lo que manda es lo que queda.
 */
async function guardarTarifas(creadora_id, tarifas = []) {
  const existentes = await getTarifasDeCreadora(creadora_id);
  const porEntregable = new Map(existentes.map(t => [t.entregable, t]));

  for (const t of tarifas) {
    const previa = porEntregable.get(t.entregable);
    const fila = {
      precio: Number(t.precio),
      activo: t.activo !== false,
      updated_at: new Date().toISOString(),
    };
    if (previa) {
      await patch('mk_tarifas', { id: previa.id }, fila);
      porEntregable.delete(t.entregable);
    } else {
      await post('mk_tarifas', { creadora_id, entregable: t.entregable, ...fila });
    }
  }
  // Lo que ya no viene en la lista se desactiva (no se borra: conserva el
  // histórico de a qué precio se cerró en su momento).
  for (const sobrante of porEntregable.values()) {
    if (sobrante.activo) {
      await patch('mk_tarifas', { id: sobrante.id }, { activo: false, updated_at: new Date().toISOString() });
    }
  }
  return getTarifasDeCreadora(creadora_id);
}

// ── Muestras ────────────────────────────────────────────────────────────────

const getMuestrasDeCreadora = (creadora_id) =>
  get('mk_muestras', {
    creadora_id: `eq.${creadora_id}`,
    select: 'id,tipo,orden',
    order: 'orden.asc',
  });

const getMuestra = (id) =>
  getUno('mk_muestras', { id: `eq.${id}`, select: '*' });

const insertMuestra = (data) => post('mk_muestras', data);

async function getMuestrasDeVarias(ids = []) {
  if (!ids.length) return {};
  const filas = await get('mk_muestras', {
    creadora_id: `in.(${ids.join(',')})`,
    select: 'id,creadora_id,tipo,orden',
    order: 'orden.asc',
  });
  const porCreadora = {};
  filas.forEach(m => {
    (porCreadora[m.creadora_id] = porCreadora[m.creadora_id] || []).push(m);
  });
  return porCreadora;
}

// ── Tratos ──────────────────────────────────────────────────────────────────

const insertTrato = (data) => post('mk_tratos', data);

const getTratoById = (id) =>
  getUno('mk_tratos', { id: `eq.${id}`, select: '*' });

const updateTrato = (id, data) =>
  patch('mk_tratos', { id }, { ...data, updated_at: new Date().toISOString() });

const getTratosDeMarca = (marca_id) =>
  get('mk_tratos', {
    marca_id: `eq.${marca_id}`,
    select: '*,mk_creadoras(nombre_publico,nicho,rango_alcance)',
    order: 'created_at.desc',
  });

const getTratosDeCreadora = (creadora_id) =>
  get('mk_tratos', {
    creadora_id: `eq.${creadora_id}`,
    select: '*,mk_marcas(nombre_empresa)',
    order: 'created_at.desc',
  });

function getTratosAdmin({ estado } = {}) {
  const params = {
    select: '*,mk_marcas(nombre_empresa,email,nit),mk_creadoras(nombre_publico,es_bruja_embajadora)',
    order: 'created_at.desc',
  };
  if (estado) params.estado = `eq.${estado}`;
  return get('mk_tratos', params);
}

/** Código legible incremental: CR-000001. Se apoya en una secuencia de Postgres. */
async function siguienteCodigoTrato() {
  try {
    const n = await rpc('mk_siguiente_codigo');
    const num = Array.isArray(n) ? n[0] : n;
    return 'CR-' + String(num).padStart(6, '0');
  } catch (e) {
    // Si la función RPC no existe, se cae a un conteo. Colisiona solo si dos
    // tratos se crean en el mismo milisegundo, y el UNIQUE de la columna lo
    // atraparía; suficiente para el volumen de la Fase 1.
    const filas = await get('mk_tratos', { select: 'id' });
    return 'CR-' + String(filas.length + 1).padStart(6, '0');
  }
}

// ── Eventos ─────────────────────────────────────────────────────────────────

const insertEvento = (data) => post('mk_trato_eventos', data);

const getEventosDeTrato = (trato_id) =>
  get('mk_trato_eventos', {
    trato_id: `eq.${trato_id}`,
    select: 'estado_anterior,estado_nuevo,actor,nota,created_at',
    order: 'created_at.asc',
  });

// ── Pagos ───────────────────────────────────────────────────────────────────

const insertPago = (data) => post('mk_pagos', data);

const getPagosDeTrato = (trato_id) =>
  get('mk_pagos', { trato_id: `eq.${trato_id}`, select: '*', order: 'created_at.asc' });

const getTodosLosPagos = () =>
  get('mk_pagos', { select: '*', order: 'created_at.desc' });

// ── Entregas ────────────────────────────────────────────────────────────────

const insertEntrega = (data) => post('mk_entregas', data);

const getEntregasDeTrato = (trato_id) =>
  get('mk_entregas', { trato_id: `eq.${trato_id}`, select: '*', order: 'created_at.desc' });

const updateEntrega = (id, data) => patch('mk_entregas', { id }, data);

// ── Lectura del Programa Creadoras (solo lectura) ───────────────────────────

/** Brujas Embajadoras elegibles para entrar al catálogo del marketplace. */
async function getInfluencersElegibles() {
  const porStatus = await get('influencers', {
    select: 'id,nombre,email,telefono,instagram_handle,tiktok_handle,seguidores_instagram,seguidores_tiktok,ciudad,status,ugc_activa',
    status: 'in.(Calificada,Contenido Entregado)',
  });
  const porUGC = await get('influencers', {
    select: 'id,nombre,email,telefono,instagram_handle,tiktok_handle,seguidores_instagram,seguidores_tiktok,ciudad,status,ugc_activa',
    ugc_activa: 'eq.true',
  });
  const porId = new Map();
  [...porStatus, ...porUGC].forEach(i => porId.set(i.id, i));
  return [...porId.values()];
}

/** Cuántas piezas con score entregó una creadora en el Programa Creadoras. */
async function contarContenidosDeInfluencer(influencer_id) {
  const filas = await get('contenidos', {
    influencer_id: `eq.${influencer_id}`,
    select: 'id',
    score_contenido: 'not.is.null',
  });
  return filas.length;
}

module.exports = {
  get, getUno, post, patch, rpc,
  getConfig, setConfig, invalidarCacheConfig,
  getMarcaPorEmail, getMarcaById, insertMarca, updateMarca, getMarcas,
  getCatalogo, getCreadoraCatalogo, getCreadoraCompleta, getCreadoraPorEmail,
  getCreadoraPorInfluencer, insertCreadora, updateCreadora, getCreadorasAdmin,
  getContactoCreadora,
  getTarifasDeCreadora, getTarifasDeVarias, guardarTarifas,
  getMuestrasDeCreadora, getMuestra, insertMuestra, getMuestrasDeVarias,
  insertTrato, getTratoById, updateTrato, getTratosDeMarca, getTratosDeCreadora,
  getTratosAdmin, siguienteCodigoTrato,
  insertEvento, getEventosDeTrato,
  insertPago, getPagosDeTrato, getTodosLosPagos,
  insertEntrega, getEntregasDeTrato, updateEntrega,
  getInfluencersElegibles, contarContenidosDeInfluencer,
};
