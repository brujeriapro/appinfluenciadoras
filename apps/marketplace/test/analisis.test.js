// Pruebas de la frontera entre el modelo de visión y la base de datos.
//
// Lo que se prueba aquí no es si el modelo acierta —eso se juzga mirando
// resultados— sino que nada de lo que devuelva pueda ensuciar la tabla. Un
// valor fuera del vocabulario no rompería nada visible: simplemente no lo
// encontraría ningún filtro, y la marca vería un catálogo con huecos sin que
// nadie sepa por qué.

process.env.MK_SKIP_CONFIG_CHECK = '1';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://ejemplo.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'clave-de-prueba';

const test = require('node:test');
const assert = require('node:assert');
const { interpretarRespuesta, VOCAB } = require('../analisis');

const COMPLETA = JSON.stringify({
  escenario: 'baño', luz: 'natural', plano: 'medio', produccion: 'casera',
  formato: 'habla_camara', energia: 'conversacional',
  producto_visible: true, etiqueta_legible: false, subtitulos: true,
  calidad_tecnica: 4, descripcion: 'Graba frente al espejo con luz de ventana.',
});

test('una respuesta correcta se interpreta entera', () => {
  const r = interpretarRespuesta(COMPLETA);

  assert.strictEqual(r.escenario, 'baño');
  assert.strictEqual(r.formato, 'habla_camara');
  assert.strictEqual(r.produccion, 'casera');
  assert.strictEqual(r.producto_visible, true);
  assert.strictEqual(r.etiqueta_legible, false);
  assert.strictEqual(r.calidad_tecnica, 4);
  assert.match(r.descripcion, /espejo/);
});

test('un valor inventado se descarta en vez de guardarse', () => {
  const r = interpretarRespuesta(JSON.stringify({
    escenario: 'el baño de su casa',   // no está en el vocabulario
    formato: 'reel bonito',            // tampoco
    luz: 'natural',                    // esta sí
  }));

  assert.strictEqual(r.escenario, null);
  assert.strictEqual(r.formato, null);
  assert.strictEqual(r.luz, 'natural', 'lo válido debe sobrevivir al descarte');
});

test('el JSON envuelto en un bloque de código se rescata', () => {
  const r = interpretarRespuesta('Claro, aquí tienes:\n```json\n' + COMPLETA + '\n```\n');
  assert.strictEqual(r.escenario, 'baño');
  assert.strictEqual(r.calidad_tecnica, 4);
});

test('una respuesta sin JSON falla fuerte y no devuelve una fila vacía', () => {
  assert.throws(() => interpretarRespuesta('No puedo analizar esta imagen.'), /JSON/);
  assert.throws(() => interpretarRespuesta(''), /JSON/);
});

test('la calidad fuera de rango no se guarda', () => {
  assert.strictEqual(interpretarRespuesta('{"calidad_tecnica": 9}').calidad_tecnica, null);
  assert.strictEqual(interpretarRespuesta('{"calidad_tecnica": 0}').calidad_tecnica, null);
  assert.strictEqual(interpretarRespuesta('{"calidad_tecnica": 3.5}').calidad_tecnica, null);
  assert.strictEqual(interpretarRespuesta('{"calidad_tecnica": 3}').calidad_tecnica, 3);
});

test('un booleano que llega como texto se descarta', () => {
  // El modelo a veces responde "true" en vez de true. Guardarlo como verdadero
  // le diría a la marca que el producto se ve cuando nadie lo comprobó.
  const r = interpretarRespuesta('{"producto_visible": "true", "subtitulos": "no"}');
  assert.strictEqual(r.producto_visible, null);
  assert.strictEqual(r.subtitulos, null);
});

test('los campos ausentes quedan en null, no en cadena vacía', () => {
  const r = interpretarRespuesta('{}');
  for (const campo of Object.keys(VOCAB)) {
    assert.strictEqual(r[campo], null, `${campo} debería ser null`);
  }
  assert.strictEqual(r.descripcion, null);
});

test('una descripción larguísima se recorta antes de llegar a la base', () => {
  const r = interpretarRespuesta(JSON.stringify({ descripcion: 'a'.repeat(900) }));
  assert.strictEqual(r.descripcion.length, 500);
});

test('el vocabulario no tiene valores repetidos', () => {
  // Un duplicado haría que dos categorías compitan por las mismas piezas y que
  // los porcentajes de "qué domina" no sumen lo que deben.
  for (const [campo, lista] of Object.entries(VOCAB)) {
    assert.strictEqual(new Set(lista).size, lista.length, `${campo} tiene duplicados`);
  }
});
