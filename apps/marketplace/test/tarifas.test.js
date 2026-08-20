// Pruebas del modelo de tarifas.
//
// La regla que sostiene estas pruebas: la plataforma NO le pone precio a nadie.
// Cada creadora publica cuánto cobra por cada entregable, y todo lo que el
// catálogo usa para filtrar (tarifa mínima, máxima, nivel de presupuesto) se
// deriva de eso.

process.env.MK_SKIP_CONFIG_CHECK = '1';

const test = require('node:test');
const assert = require('node:assert');
const { resumirTarifas, nivelPorTarifa } = require('../comisiones');

// Los niveles ya no son tarifas asignadas: son rangos de presupuesto.
const NIVELES = {
  inicial: { min: 0,       max: 500000 },
  medio:   { min: 500000,  max: 1500000 },
  top:     { min: 1500000, max: null },
};

test('el resumen sale de lo que la creadora publicó', () => {
  const r = resumirTarifas([
    { entregable: 'story',  precio: 180000,  activo: true },
    { entregable: 'reel',   precio: 650000,  activo: true },
    { entregable: 'combo',  precio: 1200000, activo: true },
  ], NIVELES);

  assert.strictEqual(r.tarifa_min, 180000);
  assert.strictEqual(r.tarifa_max, 1200000);
  // El nivel se calcula sobre el precio de entrada: es lo que la marca compara
  // con su presupuesto.
  assert.strictEqual(r.nivel_tarifa, 'inicial');
  assert.strictEqual(r.entregable_tipico, 'story');
});

test('las tarifas desactivadas no cuentan', () => {
  const r = resumirTarifas([
    { entregable: 'story', precio: 100000,  activo: false },
    { entregable: 'reel',  precio: 900000,  activo: true },
  ], NIVELES);

  // Si contara la desactivada, la creadora aparecería más barata de lo que
  // realmente ofrece y recibiría propuestas que no puede tomar.
  assert.strictEqual(r.tarifa_min, 900000);
  assert.strictEqual(r.nivel_tarifa, 'medio');
  assert.strictEqual(r.entregable_tipico, 'reel');
});

test('una creadora sin tarifas no tiene nivel ni precio', () => {
  const r = resumirTarifas([], NIVELES);
  assert.deepStrictEqual(r, {
    tarifa_min: null, tarifa_max: null, nivel_tarifa: null, entregable_tipico: null,
  });
});

test('precio en cero se ignora', () => {
  const r = resumirTarifas([
    { entregable: 'story', precio: 0,      activo: true },
    { entregable: 'reel',  precio: 400000, activo: true },
  ], NIVELES);
  assert.strictEqual(r.tarifa_min, 400000);
});

test('con un solo entregable, mínimo y máximo coinciden', () => {
  const r = resumirTarifas([{ entregable: 'ugc', precio: 350000, activo: true }], NIVELES);
  assert.strictEqual(r.tarifa_min, 350000);
  assert.strictEqual(r.tarifa_max, 350000);
});

test('los rangos de presupuesto son semiabiertos: nadie cae en dos niveles', () => {
  // Un valor justo en el corte pertenece al nivel de arriba, nunca a los dos.
  assert.strictEqual(nivelPorTarifa(499_999, NIVELES), 'inicial');
  assert.strictEqual(nivelPorTarifa(500_000, NIVELES), 'medio');
  assert.strictEqual(nivelPorTarifa(1_499_999, NIVELES), 'medio');
  assert.strictEqual(nivelPorTarifa(1_500_000, NIVELES), 'top');
  assert.strictEqual(nivelPorTarifa(20_000_000, NIVELES), 'top');
});

test('la creadora puede cobrar lo que quiera dentro del slider', () => {
  // No hay tope impuesto por nivel: quien cobra 8 millones sigue siendo válida.
  const r = resumirTarifas([{ entregable: 'embajadora', precio: 8_000_000, activo: true }], NIVELES);
  assert.strictEqual(r.tarifa_min, 8_000_000);
  assert.strictEqual(r.nivel_tarifa, 'top');
});
