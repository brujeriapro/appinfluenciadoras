// Pruebas del guion que le dice a cada creadora qué le falta.
//
// Lo que se prueba aquí es sobre todo que NO sugiera lo que ya está hecho.
// Un correo que le pide una foto a quien la subió ayer no es un error visible
// —nada se rompe— pero enseña a no abrir los siguientes, y entonces deja de
// servir el canal entero.

process.env.MK_SKIP_CONFIG_CHECK = '1';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://ejemplo.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'clave-de-prueba';

const test = require('node:test');
const assert = require('node:assert');
const { queLeFalta } = require('../ranking');

const claves = (creadora, piezas) => queLeFalta(creadora, piezas).map(f => f.clave);

const COMPLETA = {
  foto_perfil_path: 'foto.jpg',
  bio_corta: 'Grabo rutinas de skincare',
  tarifa_min: 200000,
  metricas_estado: 'verificado',
};

test('a un perfil completo no se le pide nada', () => {
  assert.deepStrictEqual(claves(COMPLETA, 6), []);
});

test('sin piezas, eso va de primero', () => {
  // Es lo que más pesa en el orden real del catálogo, así que encabeza el
  // correo aunque le falten otras cosas más fáciles de hacer.
  const r = claves({ metricas_estado: 'verificado' }, 0);
  assert.strictEqual(r[0], 'piezas');
});

test('con menos de cuatro piezas se dice cuántas faltan', () => {
  const f = queLeFalta(COMPLETA, 2);
  assert.strictEqual(f.length, 1);
  assert.match(f[0].titulo, /2 piezas/, 'debe decir el número exacto que falta');
});

test('con cuatro o más piezas ya no se insiste', () => {
  assert.deepStrictEqual(claves(COMPLETA, 4), []);
  assert.deepStrictEqual(claves(COMPLETA, 12), []);
});

test('no se le pide la foto a quien ya la tiene', () => {
  assert.ok(!claves(COMPLETA, 5).includes('foto'));
  assert.ok(claves({ ...COMPLETA, foto_perfil_path: null }, 5).includes('foto'));
});

test('la tarifa abierta cuenta como tarifa puesta', () => {
  // Es una decisión de producto: quien marca "abierta a negociación" ya hizo lo
  // que se le pedía, y volver a pedírselo es no haber entendido su respuesta.
  const abierta = { ...COMPLETA, tarifa_min: null, tarifa_abierta: true };
  assert.ok(!claves(abierta, 5).includes('tarifa'));

  const sinNada = { ...COMPLETA, tarifa_min: null, tarifa_abierta: false };
  assert.ok(claves(sinNada, 5).includes('tarifa'));
});

test('las métricas verificadas o conectadas no se vuelven a pedir', () => {
  assert.ok(!claves({ ...COMPLETA, metricas_estado: 'verificado' }, 5).includes('metricas'));
  assert.ok(!claves({ ...COMPLETA, metricas_estado: 'conectado' }, 5).includes('metricas'));
  assert.ok(claves({ ...COMPLETA, metricas_estado: 'declarado' }, 5).includes('metricas'));
});

test('un perfil vacío recibe todo, en orden de impacto', () => {
  const r = claves({}, 0);
  assert.deepStrictEqual(r, ['piezas', 'foto', 'tarifa', 'bio', 'metricas'],
    'el orden importa: es el del peso real en el catálogo, no el de dificultad');
});

test('cada consejo trae título y texto, nunca uno vacío', () => {
  // El correo los pinta tal cual: uno a medias saldría como un bloque en blanco.
  for (const f of queLeFalta({}, 0)) {
    assert.ok(f.titulo && f.titulo.length > 5, `${f.clave} sin título`);
    assert.ok(f.texto && f.texto.length > 20, `${f.clave} sin texto`);
  }
});

test('no se rompe si llega un perfil incompleto o raro', () => {
  assert.doesNotThrow(() => queLeFalta(undefined, 0));
  assert.doesNotThrow(() => queLeFalta({}, undefined));
  assert.doesNotThrow(() => queLeFalta(null, null));
});
