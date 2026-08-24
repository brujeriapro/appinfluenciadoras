// referidos.js arrastra db.js -> config.js, que exige secretos. Aquí solo se
// prueban funciones puras, así que se le dice a config que no los reclame.
process.env.MK_SKIP_CONFIG_CHECK = '1';

const test = require('node:test');
const assert = require('node:assert');
const { nuevoCodigo, normalizar } = require('../referidos');

// Los códigos se dictan por WhatsApp y se copian a mano. Todo lo que se prueba
// aquí es que eso no se rompa por una mayúscula, un guion o un cero mal leído.

test('el código no usa caracteres que se confundan al transcribir', () => {
  const prohibidos = /[01OIL]/;
  for (let i = 0; i < 300; i++) {
    assert.ok(!prohibidos.test(nuevoCodigo()), 'salió un carácter ambiguo');
  }
});

test('el código no forma palabras: no lleva vocales', () => {
  for (let i = 0; i < 200; i++) {
    assert.ok(!/[AEIOU]/.test(nuevoCodigo()), 'un código con vocales puede formar algo indeseado');
  }
});

test('el código tiene el largo pedido', () => {
  assert.strictEqual(nuevoCodigo().length, 7);
  assert.strictEqual(nuevoCodigo(10).length, 10);
});

test('dos códigos seguidos no son iguales', () => {
  const vistos = new Set();
  for (let i = 0; i < 500; i++) vistos.add(nuevoCodigo());
  // Con 29^7 combinaciones, 500 repetidos sería señal de que no hay azar real.
  assert.strictEqual(vistos.size, 500);
});

test('al comparar, el código tolera minúsculas, espacios y guiones', () => {
  const canon = 'B7K2XQZ';
  ['b7k2xqz', ' B7K2XQZ ', 'B7K2-XQZ', 'b7k2 xqz'].forEach(variante => {
    assert.strictEqual(normalizar(variante), canon, `falló con ${JSON.stringify(variante)}`);
  });
});

test('normalizar aguanta vacíos sin reventar', () => {
  [null, undefined, '', '   '].forEach(v => assert.strictEqual(normalizar(v), ''));
});
