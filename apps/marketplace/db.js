// Capa de acceso a Supabase para Creators Manager.
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
  Object.entries(params).forEach(([k, v]) => {
    // Un arreglo son varios filtros sobre la MISMA columna, que es como
    // PostgREST expresa un rango: `fecha=gte.X&fecha=lte.Y`. Con `set` los dos
    // se juntarían en "gte.X,lte.Y" y la consulta traería lo que le diera la
    // gana, sin error.
    if (Array.isArray(v)) v.forEach(uno => url.searchParams.append(k, uno));
    else url.searchParams.set(k, v);
  });
  const res = await fetch(url.toString(), { headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase GET ${tabla}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function getUno(tabla, params = {}) {
  const filas = await get(tabla, { ...params, limit: 1 });
  return filas[0] || null;
}

// `extra` permite cabeceras por llamada, como el Prefer que convierte este
// POST en un upsert. Sin argumento se comporta igual que siempre.
async function post(tabla, data, extra = null) {
  const res = await fetch(`${BASE_URL}/${tabla}`, {
    method: 'POST',
    headers: extra ? { ...HEADERS, ...extra } : HEADERS,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase POST ${tabla}: ${res.status} ${await res.text()}`);
  // Con `return=minimal` la respuesta viene vacía y res.json() reventaría.
  const cuerpo = await res.text();
  if (!cuerpo) return null;
  const filas = JSON.parse(cuerpo);
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
  'nivel_tarifa', 'tarifa_min', 'tarifa_max', 'tarifa_abierta', 'prioridad',
  'entregable_tipico', 'bio_corta', 'colaboraciones_completadas',
  // De dónde salen sus números: declarados por ella, verificados por el equipo
  // contra una captura, o traídos de la API. La marca merece saberlo antes de
  // pagar, y es lo que hace que verificarse valga la pena.
  'metricas_estado',
].join(',');

async function getCatalogo({ categoria, nicho, rango_alcance, nivel_tarifa, pais, departamento, ciudad, presupuesto_max } = {}) {
  const params = {
    select: COLS_CATALOGO,
    visible: 'eq.true',
    // Primero lo que le importa a la marca —quién ha cumplido más—; la
    // prioridad solo desempata entre perfiles equivalentes. Al revés le
    // estaríamos mostrando peores opciones primero, que es exactamente lo que
    // no puede pasar con quien paga.
    order: 'colaboraciones_completadas.desc,prioridad.desc,created_at.desc',
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
  //
  // Quien no publicó precio entra igual: su tarifa se acuerda, así que podría
  // caber perfectamente. Filtrarla la volvería invisible para toda marca que
  // use el filtro, que es justo lo contrario de lo que queremos ahora que la
  // tarifa dejó de ser obligatoria.
  if (presupuesto_max) params.or = `(tarifa_min.lte.${presupuesto_max},tarifa_min.is.null)`;
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
    select: 'id,tipo,orden,titulo,subida_por,poster_path',
    order: 'orden.asc',
  });

const getMuestra = (id) =>
  getUno('mk_muestras', { id: `eq.${id}`, select: '*' });

const insertMuestra = (data) => post('mk_muestras', data);

const actualizarMuestra = (id, data) => patch('mk_muestras', { id }, data);

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
    // poster_path solo para saber SI hay portada. El nombre del archivo no
    // viaja: se pide por /media/:id/poster, igual que la pieza.
    select: 'id,creadora_id,tipo,orden,poster_path',
    order: 'orden.asc',
  });
  const porCreadora = {};
  filas.forEach(m => {
    (porCreadora[m.creadora_id] = porCreadora[m.creadora_id] || []).push(m);
  });
  return porCreadora;
}

// ── Cumplimiento ────────────────────────────────────────────────────────────

// Historial real de entregas, calculado por la vista `mk_cumplimiento` a partir
// del Programa Creadoras y de los tratos del marketplace.
//
// Es la mitad de la promesa que le hacemos a la marca —"te decimos si cumple"—
// así que lo que se muestre aquí tiene que salir de hechos, nunca de una
// estimación. La vista solo devuelve conteos y el id de la creadora: no hay
// nada que pueda identificarla, y por eso puede viajar al catálogo público.
const COLS_CUMPLIMIENTO =
  'creadora_id,entregas,entregas_a_tiempo,incumplidas,dias_primera_entrega,piezas_publicadas,confianza';

async function getCumplimientoDeVarias(ids = []) {
  if (!ids.length) return {};
  const filas = await get('mk_cumplimiento', {
    creadora_id: `in.(${ids.join(',')})`,
    select: COLS_CUMPLIMIENTO,
  });
  const porCreadora = {};
  filas.forEach(f => { porCreadora[f.creadora_id] = f; });
  return porCreadora;
}

const getCumplimientoDeUna = (id) =>
  getUno('mk_cumplimiento', { creadora_id: `eq.${id}`, select: COLS_CUMPLIMIENTO });

// ── Paquetes ────────────────────────────────────────────────────────────────

const COLS_PAQUETE = 'id,creadora_id,nombre,descripcion,precio,incluye,activo,orden';

const getPaquetesDeCreadora = (creadora_id, { soloActivos = false } = {}) => {
  const p = { creadora_id: `eq.${creadora_id}`, select: COLS_PAQUETE, order: 'orden.asc,precio.asc' };
  if (soloActivos) p.activo = 'eq.true';
  return get('mk_paquetes', p);
};

async function getPaquetesDeVarias(ids = []) {
  if (!ids.length) return {};
  const filas = await get('mk_paquetes', {
    creadora_id: `in.(${ids.join(',')})`,
    select: COLS_PAQUETE, activo: 'eq.true', order: 'precio.asc',
  });
  const porCreadora = {};
  filas.forEach(f => { (porCreadora[f.creadora_id] = porCreadora[f.creadora_id] || []).push(f); });
  return porCreadora;
}

const getPaquete = (id) => getUno('mk_paquetes', { id: `eq.${id}`, select: '*' });
const insertPaquete = (data) => post('mk_paquetes', data);
const updatePaquete = (id, data) => patch('mk_paquetes', { id }, data);

async function borrarPaquete(id) {
  const url = new URL(`${BASE_URL}/mk_paquetes`);
  url.searchParams.set('id', `eq.${id}`);
  const res = await fetch(url.toString(), { method: 'DELETE', headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase DELETE mk_paquetes: ${res.status}`);
  return null;
}

// ── Redes de la creadora ────────────────────────────────────────────────────

// Se lee de mk_redes_publicas, NO de mk_creadora_redes. La diferencia es que la
// vista no tiene la columna `handle`, que es lo único de esa tabla capaz de
// romper la identidad oculta del catálogo. Es la misma protección estructural
// que mantiene instagram_handle fuera de mk_creadoras: si algún día se cuela un
// select ancho, aquí no hay nada que filtrar.
const COLS_REDES = 'creadora_id,red,es_principal,tier,seguidores,vistas_promedio';

async function getRedesDeVarias(ids = []) {
  if (!ids.length) return {};
  const filas = await get('mk_redes_publicas', {
    creadora_id: `in.(${ids.join(',')})`,
    // Sin `seguidores`: el número exacto la vuelve buscable —"12.483
    // seguidores" lleva a su perfil— y eso derrota el catálogo ciego.
    //
    // Las vistas sí van: son el dato que de verdad decide una contratación y no
    // sirven para encontrar a nadie, porque no aparecen escritas en su perfil.
    select: 'creadora_id,red,es_principal,tier,vistas_promedio',
    order: 'es_principal.desc',
  });
  const porCreadora = {};
  filas.forEach(f => { (porCreadora[f.creadora_id] = porCreadora[f.creadora_id] || []).push(f); });
  return porCreadora;
}

const getRedesDeCreadora = (creadora_id) =>
  get('mk_redes_publicas', {
    creadora_id: `eq.${creadora_id}`, select: COLS_REDES, order: 'es_principal.desc',
  });

/** Con handle: SOLO para la propia creadora y para el panel admin. */
const getRedesPrivadas = (creadora_id) =>
  get('mk_creadora_redes', { creadora_id: `eq.${creadora_id}`, select: '*', order: 'es_principal.desc' });

/**
 * Reemplaza las redes de una creadora por la lista que envió.
 *
 * Se borra y se vuelve a insertar en vez de ir fila por fila porque la lista es
 * la verdad completa: si quitó YouTube de su perfil, la fila de YouTube tiene
 * que desaparecer, y un upsert por elemento la dejaría ahí para siempre.
 *
 * El borrado va primero por el índice único de "una sola principal": al mover
 * la principal de Instagram a TikTok, insertar antes de borrar chocaría con la
 * fila vieja.
 */
async function guardarRedesDeCreadora(creadora_id, redes = []) {
  const url = new URL(`${BASE_URL}/mk_creadora_redes`);
  url.searchParams.set('creadora_id', `eq.${creadora_id}`);
  const borrado = await fetch(url.toString(), { method: 'DELETE', headers: HEADERS });
  if (!borrado.ok) throw new Error(`Supabase DELETE mk_creadora_redes: ${borrado.status}`);

  if (!redes.length) return [];
  return post('mk_creadora_redes', redes.map(r => ({ ...r, creadora_id })));
}

// ── Análisis de contenido ───────────────────────────────────────────────────

// Guarda el análisis de una pieza. Es upsert porque re-analizar una pieza —al
// cambiar de modelo o de vocabulario— tiene que pisar el resultado viejo, no
// acumular dos verdades para el mismo archivo.
const guardarAnalisis = (fila) =>
  post('mk_analisis_pieza', fila, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });

/** Piezas que todavía no se han analizado, las más recientes primero. */
async function getMuestrasSinAnalizar(limite = 50) {
  const filas = await get('mk_muestras', {
    select: 'id,creadora_id,tipo,mime,storage_path',
    order: 'created_at.desc',
    limit: String(limite * 4),
  });
  const yaHechas = new Set(
    (await get('mk_analisis_pieza', { select: 'muestra_id' })).map(a => a.muestra_id)
  );
  return filas.filter(m => !yaHechas.has(m.id)).slice(0, limite);
}

const COLS_PERFIL =
  'creadora_id,piezas_analizadas,calidad_tecnica,con_producto,con_subtitulos,formatos,escenarios,produccion,luz';

async function getPerfilContenidoDeVarias(ids = []) {
  if (!ids.length) return {};
  const filas = await get('mk_perfil_contenido', {
    creadora_id: `in.(${ids.join(',')})`,
    select: COLS_PERFIL,
  });
  const porCreadora = {};
  filas.forEach(f => { porCreadora[f.creadora_id] = f; });
  return porCreadora;
}

const getPerfilContenidoDeUna = (id) =>
  getUno('mk_perfil_contenido', { creadora_id: `eq.${id}`, select: COLS_PERFIL });

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

/**
 * Tratos en cualquiera de varios estados. Lo usa el proceso de plazos, que
 * necesita mirar de una todo lo que está esperando respuesta o revisión.
 */
const getTratosPorEstados = (estados = []) =>
  get('mk_tratos', {
    select: '*',
    estado: `in.(${estados.join(',')})`,
    order: 'fecha_solicitud.asc',
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

/**
 * Transacciones que quedaron pendientes desde antes del corte.
 *
 * Las más viejas primero: si algo lleva días colgado es más urgente que lo de
 * hace un cuarto de hora, que probablemente solo sea alguien tecleando su
 * tarjeta.
 */
/** Marcas con plan de pago vigente que se vence dentro de la ventana. */
const getMarcasPorVencer = (desde, hasta) =>
  get('mk_marcas', {
    select: 'id,email,nombre_empresa,nombre_contacto,plan,plan_vence_at,plan_aviso_at',
    plan_vence_at: [`gte.${desde}`, `lte.${hasta}`],
    order: 'plan_vence_at.asc',
  });

const getTransaccionesPendientes = (creadaAntesDe, limite = 50) =>
  get('mk_transacciones', {
    select: '*',
    estado: 'eq.pendiente',
    created_at: `lt.${creadaAntesDe}`,
    order: 'created_at.asc',
    limit: String(limite),
  });

// ── Home editorial: colecciones y destacado ─────────────────────────────────

/**
 * Las colecciones activas con sus creadoras, en orden.
 *
 * Dos consultas y un cruce en memoria, en vez de un join anidado de PostgREST:
 * son tres o cuatro colecciones con diez perfiles cada una, y el join anidado
 * complica el filtro por `activa` sin ahorrar nada a esta escala.
 */
async function getColecciones({ soloActivas = true } = {}) {
  const filtro = { select: '*', order: 'orden.asc' };
  if (soloActivas) filtro.activa = 'eq.true';
  const cols = await get('mk_coleccion', filtro);
  if (!cols.length) return [];

  const items = await get('mk_coleccion_item', {
    select: 'coleccion_id,creadora_id,orden',
    coleccion_id: `in.(${cols.map(c => c.id).join(',')})`,
    order: 'orden.asc',
  });

  return cols.map(c => ({
    ...c,
    creadora_ids: items.filter(i => i.coleccion_id === c.id).map(i => i.creadora_id),
  }));
}

const getColeccion = (id) => getUno('mk_coleccion', { id: `eq.${id}`, select: '*' });
const insertColeccion = (data) => post('mk_coleccion', data);
const updateColeccion = (id, data) => patch('mk_coleccion', { id }, data);

async function borrarColeccion(id) {
  const url = new URL(`${BASE_URL}/mk_coleccion`);
  url.searchParams.set('id', `eq.${id}`);
  const res = await fetch(url.toString(), { method: 'DELETE', headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase DELETE mk_coleccion: ${res.status}`);
  return true;
}

/**
 * Reemplaza las creadoras de una colección por la lista dada, en ese orden.
 *
 * Se borra y se vuelve a insertar en vez de calcular diferencias: el orden es
 * parte del contenido —la colección es una lista curada, no un conjunto— y
 * reordenar con altas y bajas parciales es más código para el mismo resultado.
 */
async function ponerCreadorasEnColeccion(coleccion_id, ids = []) {
  const url = new URL(`${BASE_URL}/mk_coleccion_item`);
  url.searchParams.set('coleccion_id', `eq.${coleccion_id}`);
  const res = await fetch(url.toString(), { method: 'DELETE', headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase DELETE mk_coleccion_item: ${res.status}`);
  if (!ids.length) return [];
  return post('mk_coleccion_item',
    ids.map((creadora_id, orden) => ({ coleccion_id, creadora_id, orden })));
}

const getDestacado = () =>
  getUno('mk_destacado', { select: '*', activo: 'eq.true' });

/**
 * Cambia la pieza del hero.
 *
 * Apaga la anterior antes de encender la nueva: hay un índice único sobre las
 * activas, así que insertar sin apagar falla — a propósito, para que no puedan
 * quedar dos heroes y nadie sepa cuál manda.
 */
async function ponerDestacado({ muestra_id, titulo, creado_por }) {
  await patch('mk_destacado', { activo: true }, { activo: false }).catch(() => {});
  return post('mk_destacado', { muestra_id, titulo, activo: true, creado_por });
}

// ── Selección curada ────────────────────────────────────────────────────────

const getSeleccionDeMarca = (marca_id, estado = 'publicada') =>
  getUno('mk_seleccion', { marca_id: `eq.${marca_id}`, estado: `eq.${estado}`, select: '*' });

const getItemsDeSeleccion = (seleccion_id) =>
  get('mk_seleccion_item', { seleccion_id: `eq.${seleccion_id}`, select: '*', order: 'orden.asc' });

const insertSeleccion = (data) => post('mk_seleccion', data);
const updateSeleccion = (id, data) => patch('mk_seleccion', { id }, data);

async function ponerItemsDeSeleccion(seleccion_id, items = []) {
  const url = new URL(`${BASE_URL}/mk_seleccion_item`);
  url.searchParams.set('seleccion_id', `eq.${seleccion_id}`);
  const res = await fetch(url.toString(), { method: 'DELETE', headers: HEADERS });
  if (!res.ok) throw new Error(`Supabase DELETE mk_seleccion_item: ${res.status}`);
  if (!items.length) return [];
  return post('mk_seleccion_item', items.map((it, orden) => ({ ...it, seleccion_id, orden })));
}

// ── Planes y límites ────────────────────────────────────────────────────────

const getPlanes = () =>
  get('mk_planes', { select: '*', activo: 'eq.true', order: 'orden.asc' });

/**
 * Cuántas propuestas ha enviado una marca este mes.
 *
 * Cuenta los tratos creados, no los aceptados: el cupo se gasta al proponer.
 * Que la creadora diga que no es riesgo del negocio, no un reembolso.
 */
async function contarPropuestasDelMes(marca_id) {
  const desde = new Date();
  desde.setUTCDate(1); desde.setUTCHours(0, 0, 0, 0);

  const filas = await get('mk_tratos', {
    marca_id: `eq.${marca_id}`,
    created_at: `gte.${desde.toISOString()}`,
    select: 'id',
  });
  return filas.length;
}

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
  getMuestrasDeCreadora, getMuestra, insertMuestra, actualizarMuestra, borrarMuestra,
  getMuestrasDeVarias,
  getCumplimientoDeVarias, getCumplimientoDeUna,
  getRedesDeVarias, getRedesDeCreadora, getRedesPrivadas, guardarRedesDeCreadora,
  getPaquetesDeCreadora, getPaquetesDeVarias, getPaquete,
  insertPaquete, updatePaquete, borrarPaquete,
  guardarAnalisis, getMuestrasSinAnalizar,
  getPerfilContenidoDeVarias, getPerfilContenidoDeUna,
  insertTrato, getTratoById, updateTrato, getTratosDeMarca, getTratosDeCreadora,
  getTratosAdmin, getTratosPorEstados, siguienteCodigoTrato, contarTratosPrevios,
  insertEvento, getEventosDeTrato,
  insertPago, getPagosDeTrato, getTodosLosPagos,
  insertEntrega, getEntregasDeTrato, updateEntrega,
  insertTransaccion, getTransaccionPorReferencia, getTransaccionesDeTrato, actualizarTransaccion,
  getTransaccionesPendientes, getMarcasPorVencer,
  getColecciones, getColeccion, insertColeccion, updateColeccion, borrarColeccion,
  ponerCreadorasEnColeccion, getDestacado, ponerDestacado,
  getSeleccionDeMarca, getItemsDeSeleccion, insertSeleccion, updateSeleccion,
  ponerItemsDeSeleccion,
  getPlanes, getPlan, registrarFichaVista, contarFichasDelMes, contarPropuestasDelMes,
  getInfluencersElegibles, contarContenidosDeInfluencer,
};
