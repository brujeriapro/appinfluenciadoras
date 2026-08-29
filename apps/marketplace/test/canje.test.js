process.env.MK_SKIP_CONFIG_CHECK = '1';
const test = require('node:test');
const assert = require('node:assert');
const { calcularCanje, calcularTrato } = require('../comisiones');

test('en un canje la creadora recibe cero pesos', () => {
  const r = calcularCanje({ comision_fija: 4900 });
  assert.equal(r.monto_creadora, 0);
  assert.equal(r.neto_a_recibir_creadora, 0);
});

test('la marca paga solo la comisión fija', () => {
  const r = calcularCanje({ comision_fija: 4900 });
  assert.equal(r.total_a_pagar_marca, 4900);
  assert.equal(r.comision_marca_valor, 4900);
});

test('la creadora no paga nada por recibir un regalo', () => {
  const r = calcularCanje({ comision_fija: 4900 });
  assert.equal(r.comision_creadora_valor, 0);
  assert.equal(r.costo_desembolso_valor, 0);
});

test('una embajadora no paga comisión, tampoco en canje', () => {
  const r = calcularCanje({ comision_fija: 4900, es_bruja_embajadora: true });
  assert.equal(r.total_a_pagar_marca, 0);
});

test('el valor del producto NO entra en la cuenta', () => {
  // No lo cobramos ni lo retenemos: meterlo sería inventar un movimiento de
  // plata que no existe, y la marca vería un total que no va a pagar.
  const r = calcularCanje({ comision_fija: 4900, valor_producto: 180000 });
  assert.equal(r.total_a_pagar_marca, 4900);
});

test('un trato en dinero por cero pesos sigue siendo un error', () => {
  // Es lo que separa un canje de un monto mal escrito.
  assert.throws(() => calcularTrato({ monto: 0, comision_marca_pct: 12, comision_creadora_pct: 8 }));
});
