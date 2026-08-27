// La lista de columnas que se leen de cada tabla.
//
// Existe porque el fallo de esta lista es SILENCIOSO: si falta una columna, la
// propiedad llega como undefined y el código sigue como si el dato no
// existiera. No hay error, no hay log, y el síntoma aparece lejos.
//
// Pasó de verdad: sin `plan` ni `plan_vence_at`, toda marca se leía como plan
// gratuito, así que quien pagara Agencia por $299.900 habría tenido el tope de
// Explora. Nadie lo notó porque nadie ha pagado todavía.

process.env.MK_SKIP_CONFIG_CHECK = '1';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://ejemplo.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'clave';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const fuente = fs.readFileSync(path.join(__dirname, '..', 'db.js'), 'utf8');

/**
 * Saca la lista de una constante COLS_* del código.
 *
 * Se lee el archivo en vez de importar db.js porque la constante no se
 * exporta, y exportarla solo para poder probarla ensancharía la superficie del
 * módulo para nada.
 */
function columnasDe(nombre) {
  const desde = fuente.indexOf(`const ${nombre} =`);
  assert.ok(desde >= 0, `no se encontró ${nombre} en db.js`);
  const hasta = fuente.indexOf(';', desde);
  const trozo = fuente.slice(desde, hasta);
  const entrecomilladas = trozo.match(/'[a-z_0-9,]+'/g) || [];
  return entrecomilladas.flatMap(x => x.replace(/'/g, '').split(',')).filter(Boolean);
}

test('la marca trae su plan', () => {
  // Sin esto todo el mundo es plan gratuito, incluido quien acaba de pagar.
  const cols = columnasDe('COLS_MARCA');
  for (const c of ['plan', 'plan_vence_at']) {
    assert.ok(cols.includes(c), `COLS_MARCA no trae "${c}"`);
  }
});

test('la marca trae lo que respondió en el registro', () => {
  // Alimenta la selección curada. Sin esto, quien la arma no ve qué pidió.
  const cols = columnasDe('COLS_MARCA');
  for (const c of ['busca_que_vende', 'busca_canal', 'busca_tipo', 'busca_presupuesto']) {
    assert.ok(cols.includes(c), `COLS_MARCA no trae "${c}"`);
  }
});

test('nunca se lee el hash de la contraseña', () => {
  // La razón por la que esta lista existe en vez de un select *.
  assert.ok(!columnasDe('COLS_MARCA').includes('password_hash'));
});
