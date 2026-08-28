// El orden con el que la marca ve el catálogo.
//
// Se prueba porque es fácil de romper sin que nadie lo note: no hay error ni
// log, solo perfiles en otro sitio. Y lo que decide es qué ve primero quien
// está a punto de gastarse la plata.

process.env.MK_SKIP_CONFIG_CHECK = '1';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://ejemplo.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'clave';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { ordenDelCatalogo } = require('../catalogo');

/** Un perfil completo: 4 piezas, redes, tarifas, foto, bio, verificada. */
const completa = (extra = {}) => ({
  id: 'completa',
  muestras: [1, 2, 3, 4], redes: [1], tarifas: [1],
  foto_perfil_path: 'x.jpg', bio_corta: 'hola', metricas_estado: 'verificado',
  cumplimiento: { entregas: 3 },
  ...extra,
});

/** Un perfil recién creado: nada llenado. */
const pelada = (extra = {}) => ({
  id: 'pelada',
  muestras: [], redes: [], tarifas: [],
  foto_perfil_path: null, bio_corta: null, metricas_estado: 'declarado',
  cumplimiento: {},
  ...extra,
});

const ordenar = (lista) => [...lista].sort(ordenDelCatalogo).map(c => c.id);

test('sin fijar, manda qué tan completo está el perfil', () => {
  assert.deepEqual(ordenar([pelada(), completa()]), ['completa', 'pelada']);
});

test('una creadora fijada gana aunque su perfil esté vacío', () => {
  // Es el punto entero de fijar: el equipo la miró y decidió mostrarla. Si el
  // puntaje pudiera ganarle, fijar no serviría para nada — y justamente las
  // que uno quiere mostrar a veces son las nuevas, que no tienen puntaje.
  const fijada = pelada({ id: 'fijada', orden_fijo: 1 });
  assert.deepEqual(ordenar([completa(), fijada]), ['fijada', 'completa']);
});

test('las fijadas salen en el puesto que se les puso', () => {
  const a = pelada({ id: 'primera', orden_fijo: 1 });
  const b = pelada({ id: 'segunda', orden_fijo: 2 });
  const c = pelada({ id: 'tercera', orden_fijo: 3 });
  assert.deepEqual(ordenar([c, a, b]), ['primera', 'segunda', 'tercera']);
});

test('quien no está fijada no se mueve por culpa de las fijadas', () => {
  const fijada = pelada({ id: 'fijada', orden_fijo: 1 });
  const orden = ordenar([pelada(), completa(), fijada]);
  assert.deepEqual(orden, ['fijada', 'completa', 'pelada']);
});

test('orden_fijo 0 es un puesto válido, no "sin fijar"', () => {
  // Por eso la columna es nullable y no `default 0`: si 0 significara las dos
  // cosas, fijar a alguien de primera sería indistinguible de no fijarla.
  const cero = pelada({ id: 'cero', orden_fijo: 0 });
  assert.deepEqual(ordenar([completa(), cero]), ['cero', 'completa']);
});

test('el comparador no revienta con perfiles a medio llenar', () => {
  const rota = { id: 'rota' };  // sin muestras, sin redes, sin cumplimiento
  assert.doesNotThrow(() => ordenar([rota, completa(), pelada()]));
});

// ── La columna tiene que viajar ─────────────────────────────────────────────

test('orden_fijo está en las columnas que se le piden a la base', () => {
  // Sin esto llega `undefined`, todas quedan en Infinity y el orden fijo no
  // hace nada. Sin error, sin log: exactamente el fallo silencioso que ya
  // costó una vez con `plan` y `plan_vence_at`.
  const fuente = fs.readFileSync(path.join(__dirname, '..', 'db.js'), 'utf8');
  const desde = fuente.indexOf('const COLS_CATALOGO =');
  const trozo = fuente.slice(desde, fuente.indexOf(';', desde));
  assert.ok(trozo.includes("'orden_fijo'"), 'COLS_CATALOGO no trae orden_fijo');
});
