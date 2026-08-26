// Pruebas de los paquetes que arma la creadora.
//
// Lo que se decide aquí es un precio que alguien va a pagar y un "ahorro" que
// se le muestra a la marca para convencerla. Un error no rompe nada visible:
// solo hace que la plataforma prometa un descuento que no existe.

process.env.MK_SKIP_CONFIG_CHECK = '1';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://ejemplo.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'clave-de-prueba';

const test = require('node:test');
const assert = require('node:assert');
const { normalizarIncluye, precioSuelto, conAhorro, totalPiezas } = require('../paquetes');

const ENTREGABLES = ['reel', 'story', 'tiktok', 'ugc', 'post'];
const TARIFAS = [
  { entregable: 'reel',  precio: 195000 },
  { entregable: 'story', precio: 100000 },
  { entregable: 'ugc',   precio: 175000, activo: false },   // desactivada
];

// ── Qué incluye ──

test('un paquete normal se acepta tal cual', () => {
  const r = normalizarIncluye(
    [{ entregable: 'reel', cantidad: 2 }, { entregable: 'story', cantidad: 4 }], ENTREGABLES);
  assert.strictEqual(r.error, undefined);
  assert.deepStrictEqual(r.incluye, [
    { entregable: 'reel', cantidad: 2 },
    { entregable: 'story', cantidad: 4 },
  ]);
});

test('dos líneas del mismo entregable se suman, no se duplican', () => {
  // "2 reels" y "1 reel" es un paquete de 3 reels. Dejarlas separadas mostraría
  // dos renglones que dicen lo mismo y confundiría el conteo de piezas.
  const r = normalizarIncluye(
    [{ entregable: 'reel', cantidad: 2 }, { entregable: 'reel', cantidad: 1 }], ENTREGABLES);
  assert.deepStrictEqual(r.incluye, [{ entregable: 'reel', cantidad: 3 }]);
});

test('un entregable inventado se descarta sin tumbar el paquete', () => {
  const r = normalizarIncluye(
    [{ entregable: 'reel', cantidad: 1 }, { entregable: 'podcast', cantidad: 2 }], ENTREGABLES);
  assert.deepStrictEqual(r.incluye, [{ entregable: 'reel', cantidad: 1 }]);
});

test('un paquete sin nada válido se rechaza con explicación', () => {
  assert.match(normalizarIncluye([{ entregable: 'podcast', cantidad: 1 }], ENTREGABLES).error, /válido/);
  assert.match(normalizarIncluye([], ENTREGABLES).error, /al menos un/);
  assert.match(normalizarIncluye(null, ENTREGABLES).error, /al menos un/);
});

test('las cantidades absurdas se recortan o se ignoran', () => {
  assert.deepStrictEqual(
    normalizarIncluye([{ entregable: 'reel', cantidad: 999 }], ENTREGABLES).incluye,
    [{ entregable: 'reel', cantidad: 30 }]);
  assert.match(normalizarIncluye([{ entregable: 'reel', cantidad: 0 }], ENTREGABLES).error, /válido/);
  assert.match(normalizarIncluye([{ entregable: 'reel', cantidad: -3 }], ENTREGABLES).error, /válido/);
  assert.deepStrictEqual(
    normalizarIncluye([{ entregable: 'reel', cantidad: 2.7 }], ENTREGABLES).incluye,
    [{ entregable: 'reel', cantidad: 2 }], 'las fracciones se truncan');
});

// ── Cuánto costaría suelto ──

test('el suelto suma las tarifas de ella por cantidad', () => {
  // 2 reels a 195.000 + 4 historias a 100.000
  const suelto = precioSuelto(
    [{ entregable: 'reel', cantidad: 2 }, { entregable: 'story', cantidad: 4 }], TARIFAS);
  assert.strictEqual(suelto, 790000);
});

test('sin la tarifa de algún entregable no se inventa el suelto', () => {
  // Es preferible no mostrar ahorro a mostrar uno calculado a medias.
  const suelto = precioSuelto(
    [{ entregable: 'reel', cantidad: 1 }, { entregable: 'tiktok', cantidad: 1 }], TARIFAS);
  assert.strictEqual(suelto, null);
});

test('una tarifa desactivada no cuenta como precio', () => {
  const suelto = precioSuelto([{ entregable: 'ugc', cantidad: 1 }], TARIFAS);
  assert.strictEqual(suelto, null);
});

// ── El ahorro que ve la marca ──

test('el ahorro se calcula y se redondea en porcentaje', () => {
  const p = conAhorro(
    { precio: 650000, incluye: [{ entregable: 'reel', cantidad: 2 }, { entregable: 'story', cantidad: 4 }] },
    TARIFAS);
  assert.strictEqual(p.precio_suelto, 790000);
  assert.strictEqual(p.ahorro, 140000);
  assert.strictEqual(p.ahorro_pct, 18);
});

test('un paquete más caro que la suma no muestra ahorro negativo', () => {
  // Está en su derecho de cobrarlo más caro —puede incluir trabajo que no cabe
  // en una tarifa suelta— pero anunciar un "ahorro" de -$50.000 sería absurdo.
  const p = conAhorro(
    { precio: 900000, incluye: [{ entregable: 'reel', cantidad: 2 }, { entregable: 'story', cantidad: 4 }] },
    TARIFAS);
  assert.strictEqual(p.ahorro, null);
  assert.strictEqual(p.precio_suelto, null);
});

test('un paquete al mismo precio que la suma tampoco anuncia ahorro', () => {
  const p = conAhorro({ precio: 790000, incluye: [
    { entregable: 'reel', cantidad: 2 }, { entregable: 'story', cantidad: 4 }] }, TARIFAS);
  assert.strictEqual(p.ahorro, null);
});

test('sin tarifas publicadas el paquete sigue siendo válido, solo sin ahorro', () => {
  const p = conAhorro({ precio: 650000, incluye: [{ entregable: 'reel', cantidad: 2 }] }, []);
  assert.strictEqual(p.precio, 650000);
  assert.strictEqual(p.ahorro, null);
});

test('el total de piezas suma las cantidades', () => {
  assert.strictEqual(totalPiezas([
    { entregable: 'reel', cantidad: 2 }, { entregable: 'story', cantidad: 4 }]), 6);
  assert.strictEqual(totalPiezas([]), 0);
  assert.strictEqual(totalPiezas(), 0);
});
