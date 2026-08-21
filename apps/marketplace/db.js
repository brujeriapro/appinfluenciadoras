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

const COLS_MARCA = 'id,nombre_empresa,nombre_contacto,email,whatsapp,nit,pais,departamento,ciudad,sitio_web,estado,logo_path,bio,categoria,instagram,tiktok,que_espera,libertad_creativa,contacto_creadoras,terminos_version,terminos_aceptados_at,created_at';

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
  'id', 'codigo', 'nombre_publico', 'foto_perfil_path', 'pais', 'departamento', 'ciudad',
  'categorias', 'nicho', 'rango_alcance', 'rango_instagram', 'rango_tiktok',
  'engagement_pct', 'dias_entrega', 'audiencia_mujeres', 'audiencia_pais',
  'nivel_tarifa', 'tarifa_min', 'tarifa_max',
  'entregable_tipico', 'bio_corta', 'colaboraciones_completadas',
].join(',');

async function getCatalogo({ categoria, nicho, rango_alcance, nivel_tarifa, pais, departamento, ciudad, presupuesto_max } = {}) {
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
  if (pais)          params.pais = `eq.${pais}`;
  if (departamento)  params.departamento = `eq.${departamento}`;
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

/** Perfiles esperando revisión, los que llevan más tiempo esperando primero. */
const getCreadorasPorRevisar = () =>
  get('mk_creadoras', {
    select: '*',
    estado_perfil: 'in.(nueva,en_revision)',
    order: 'created_at.asc',
  });

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

  // Dos orígenes posibles, según cómo entró la creadora al sistema:
  //   - vino del Programa Creadoras  -> sus handles están en `influencers`
  //   - se registró sola             -> están en mk_creadora_privado
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
  } else {
    const priv = await getUno('mk_creadora_privado', {
      creadora_id: `eq.${creadora_id}`,
      select: 'nombre_real,instagram_handle,tiktok_handle',
    });
    if (priv) {
      handles = {
        nombre_real: priv.nombre_real,
        instagram: priv.instagram_handle,
        tiktok: priv.tiktok_handle,
        telefono: c.whatsapp,
        email: c.email,
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

// ── Datos privados de la creadora ───────────────────────────────────────────
// Tabla aparte a propósito: el catálogo consulta mk_creadoras y ahí no hay
// nada sensible que pueda filtrarse por accidente.

const getPrivadoDeCreadora = (creadora_id) =>
  getUno('mk_creadora_privado', { creadora_id: `eq.${creadora_id}`, select: '*' });

async function guardarPrivadoDeCreadora(creadora_id, datos) {
  const existe = await getPrivadoDeCreadora(creadora_id);
  const fila = { ...datos, updated_at: new Date().toISOString() };
  return existe
    ? patch('mk_creadora_privado', { creadora_id }, fila)
    : post('mk_creadora_privado', { creadora_id, ...fila });
}

/** ¿Ya hay alguien con ese @usuario? Evita perfiles duplicados. */
async function getCreadoraPorHandle(handle) {
  if (!handle) return null;
  const limpio = String(handle).replace('@', '').toLowerCase().trim();
  const r = await getUno('mk_creadora_privado', {
    instagram_handle: `eq.${limpio}`,
    select: 'creadora_id',
  });
  return r ? r.creadora_id : null;
}

// ── Tokens de recuperación de contraseña ────────────────────────────────────

const crearTokenReset = (data) => post('mk_tokens_reset', data);

const getTokenReset = (token) =>
  getUno('mk_tokens_reset', { token: `eq.${token}`, select: '*' });

const marcarTokenUsado = (token) =>
  patch('mk_tokens_reset', { token }, { usado_at: new Date().toISOString() });

// ── Triage: lo que cada marca preseleccionó o descartó ──────────────────────
// Vive en la base y no en el navegador: una marca que compara veinte perfiles
// no puede perder su trabajo al recargar la página.

const getTriageDeMarca = (marca_id) =>
  get('mk_triage', { marca_id: `eq.${marca_id}`, select: 'creadora_id,decision' });

async function guardarTriage(marca_id, creadora_id, decision) {
  const previa = await getUno('mk_triage', {
    marca_id: `eq.${marca_id}`, creadora_id: `eq.${creadora_id}`, select: 'decision',
  });
  // Tocar dos veces la misma decisión la deshace: el triage es reversible.
  if (previa && previa.decision === decision) {
    return borrarTriage(marca_id, creadora_id);
  }
  if (previa) {
    return patch('mk_triage', { marca_id, creadora_id }, { decision });
  }
  return post('mk_triage', { marca_id, creadora_id, decision });
}

async function borrarTriage(marca_id, creadora_id) {
  const url = new URL(`${BASE_URL}/mk_triage`);
  url.searchParams.set('marca_id', `eq.${marca_id}`);
  url.searchParams.set('creadora_id', `eq.${creadora_id}`);
  const res = await fetch(url.toString(), { method: 'DELETE', headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase DELETE mk_triage: ${res.status}`);
  return null;
}

// ── Campañas ────────────────────────────────────────────────────────────────

const getCampanasDeMarca = (marca_id, { estado } = {}) => {
  const params = { marca_id: `eq.${marca_id}`, select: '*', order: 'created_at.desc' };
  if (estado) params.estado = `eq.${estado}`;
  return get('mk_campanas', params);
};

const getCampana = (id) => getUno('mk_campanas', { id: `eq.${id}`, select: '*' });

const insertCampana = (data) => post('mk_campanas', data);

const updateCampana = (id, data) =>
  patch('mk_campanas', { id }, { ...data, updated_at: new Date().toISOString() });

/** Cuántas propuestas ya salieron de cada campaña. */
async function contarTratosPorCampana(marca_id) {
  const filas = await get('mk_tratos', {
    marca_id: `eq.${marca_id}`,
    campana_id: 'not.is.null',
    select: 'campana_id',
  });
  const cuenta = {};
  filas.forEach(t => { cuenta[t.campana_id] = (cuenta[t.campana_id] || 0) + 1; });
  return cuenta;
}

// ── Productos de la marca ───────────────────────────────────────────────────

const getProductosDeMarca = (marca_id) =>
  get('mk_marca_productos', {
    marca_id: `eq.${marca_id}`, select: 'id,titulo,orden', order: 'orden.asc',
  });

const getProductoMarca = (id) =>
  getUno('mk_marca_productos', { id: `eq.${id}`, select: '*' });

const insertProductoMarca = (data) => post('mk_marca_productos', data);

async function borrarProductoMarca(id) {
  const url = new URL(`${BASE_URL}/mk_marca_productos`);
  url.searchParams.set('id', `eq.${id}`);
  const res = await fetch(url.toString(), { method: 'DELETE', headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase DELETE mk_marca_productos: ${res.status}`);
  return true;
}

/** Código legible de creadora: C-0412. Identifica sin nombrar. */
async function siguienteCodigoCreadora() {
  try {
    const n = await rpc('mk_siguiente_codigo_creadora');
    const num = Array.isArray(n) ? n[0] : n;
    return 'C-' + String(num).padStart(4, '0');
  } catch (e) {
    const filas = await get('mk_creadoras', { select: 'id' });
    return 'C-' + String(300 + filas.length + 1).padStart(4, '0');
  }
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
    select: 'id,tipo,orden,titulo,subida_por',
    order: 'orden.asc',
  });

const getMuestra = (id) =>
  getUno('mk_muestras', { id: `eq.${id}`, select: '*' });

const insertMuestra = (data) => post('mk_muestras', data);

async function borrarMuestra(id) {
  const url = new URL(`${BASE_URL}/mk_muestras`);
  url.searchParams.set('id', `eq.${id}`);
  const res = await fetch(url.toString(), { method: 'DELETE', headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase DELETE mk_muestras: ${res.status}`);
  return true;
}

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

/**
 * Cuántas colaboraciones cerradas lleva esta marca con esta creadora.
 * El portal lo muestra como "4 campañas previas" / "primera campaña": saber
 * que la marca ya la contrató antes cambia la decisión de aceptar.
 */
async function contarTratosPrevios(marca_id, creadora_id) {
  const filas = await get('mk_tratos', {
    marca_id: `eq.${marca_id}`,
    creadora_id: `eq.${creadora_id}`,
    estado: 'in.(pagado,cerrado)',
    select: 'id',
  });
  return filas.length;
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

// ── Transacciones de Wompi ──────────────────────────────────────────────────

const insertTransaccion = (data) => post('mk_transacciones', data);

const getTransaccionPorReferencia = (referencia) =>
  getUno('mk_transacciones', { referencia: `eq.${referencia}`, select: '*' });

const getTransaccionesDeTrato = (trato_id) =>
  get('mk_transacciones', { trato_id: `eq.${trato_id}`, select: '*', order: 'created_at.desc' });

const actualizarTransaccion = (referencia, data) =>
  patch('mk_transacciones', { referencia }, data);

// ── Planes y límites ────────────────────────────────────────────────────────

const getPlanes = () =>
  get('mk_planes', { select: '*', activo: 'eq.true', order: 'orden.asc' });

const getPlan = (clave) =>
  getUno('mk_planes', { clave: `eq.${clave}`, select: '*' });

/**
 * Registra que una marca abrió una ficha y devuelve cuántas lleva este mes.
 *
 * Se cuentan fichas DISTINTAS, no visitas: la llave primaria de la tabla es
 * (marca, creadora, mes), así que volver a abrir la misma no suma. Si sumara,
 * la marca navegaría con miedo justo cuando está por contratar.
 */
async function registrarFichaVista(marca_id, creadora_id) {
  const mes = new Date().toISOString().slice(0, 7);
  const yaVista = await getUno('mk_fichas_vistas', {
    marca_id: `eq.${marca_id}`, creadora_id: `eq.${creadora_id}`, mes: `eq.${mes}`, select: 'mes',
  });
  if (!yaVista) {
    try {
      await post('mk_fichas_vistas', { marca_id, creadora_id, mes });
    } catch (e) {
      // Carrera entre dos pestañas: la llave primaria ya la protege.
      if (!/duplicate|23505/.test(e.message)) throw e;
    }
  }
  const todas = await get('mk_fichas_vistas', {
    marca_id: `eq.${marca_id}`, mes: `eq.${mes}`, select: 'creadora_id',
  });
  return { vistas: todas.length, yaVista: Boolean(yaVista) };
}

const contarFichasDelMes = async (marca_id) => {
  const mes = new Date().toISOString().slice(0, 7);
  const filas = await get('mk_fichas_vistas', {
    marca_id: `eq.${marca_id}`, mes: `eq.${mes}`, select: 'creadora_id',
  });
  return filas.length;
};

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
  getCreadorasPorRevisar,
  getContactoCreadora, getPrivadoDeCreadora, guardarPrivadoDeCreadora, getCreadoraPorHandle,
  crearTokenReset, getTokenReset, marcarTokenUsado,
  getTarifasDeCreadora, getTarifasDeVarias, guardarTarifas,
  getTriageDeMarca, guardarTriage, borrarTriage,
  getCampanasDeMarca, getCampana, insertCampana, updateCampana, contarTratosPorCampana,
  getProductosDeMarca, getProductoMarca, insertProductoMarca, borrarProductoMarca,
  siguienteCodigoCreadora,
  getMuestrasDeCreadora, getMuestra, insertMuestra, borrarMuestra, getMuestrasDeVarias,
  insertTrato, getTratoById, updateTrato, getTratosDeMarca, getTratosDeCreadora,
  getTratosAdmin, siguienteCodigoTrato, contarTratosPrevios,
  insertEvento, getEventosDeTrato,
  insertPago, getPagosDeTrato, getTodosLosPagos,
  insertEntrega, getEntregasDeTrato, updateEntrega,
  insertTransaccion, getTransaccionPorReferencia, getTransaccionesDeTrato, actualizarTransaccion,
  getPlanes, getPlan, registrarFichaVista, contarFichasDelMes,
  getInfluencersElegibles, contarContenidosDeInfluencer,
};
