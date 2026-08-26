// Pruebas del motor de comisión.
//
// Este es uno de los dos módulos donde un bug cuesta plata real, así que se
// prueba con números concretos y no con aproximaciones.

process.env.MK_SKIP_CONFIG_CHECK = '1';

const test = require('node:test');
const assert = require('node:assert');
const { calcularTrato, nivelPorTarifa, rangoAlcance, formatearCOP } = require('../comisiones');

test('reparto 12/8 sobre un millón', () => {
  const r = calcularTrato({ monto: 1_000_000, comision_marca_pct: 12, comision_creadora_pct: 8 });

  assert.strictEqual(r.comision_marca_valor, 120_000);
  assert.strictEqual(r.comision_creadora_valor, 80_000);
  assert.strictEqual(r.total_a_pagar_marca, 1_120_000);
  assert.strictEqual(r.neto_a_recibir_creadora, 920_000);
  // La comisión total es el 20% acordado del modelo de negocio.
  assert.strictEqual(r.comision_total_valor, 200_000);
});

test('una bruja embajadora no paga ni le cobran', () => {
  const r = calcularTrato({
    monto: 800_000,
    comision_marca_pct: 12,
    comision_creadora_pct: 8,
    es_bruja_embajadora: true,
  });

  // La marca paga exactamente lo acordado y la creadora recibe exactamente eso.
  assert.strictEqual(r.total_a_pagar_marca, 800_000);
  assert.strictEqual(r.neto_a_recibir_creadora, 800_000);
  assert.strictEqual(r.comision_total_valor, 0);
  assert.strictEqual(r.comision_marca_pct, 0);
  assert.strictEqual(r.comision_creadora_pct, 0);
});

test('el total siempre cierra exacto con montos que no dividen bien', () => {
  // Si se redondeara el total en vez de la comisión, aquí aparecerían
  // diferencias de un peso al conciliar con el banco.
  for (const monto of [333_333, 1, 7, 99_999, 1_234_567, 450_001]) {
    const r = calcularTrato({ monto, comision_marca_pct: 12, comision_creadora_pct: 8 });
    assert.strictEqual(
      r.total_a_pagar_marca - r.monto_creadora,
      r.comision_marca_valor,
      `total no cierra para ${monto}`
    );
    assert.strictEqual(
      r.monto_creadora - r.neto_a_recibir_creadora,
      r.comision_creadora_valor,
      `neto no cierra para ${monto}`
    );
    assert.ok(Number.isInteger(r.total_a_pagar_marca), `total no entero para ${monto}`);
    assert.ok(Number.isInteger(r.neto_a_recibir_creadora), `neto no entero para ${monto}`);
  }
});

test('los porcentajes congelados mandan sobre los vigentes', () => {
  // Un trato creado con 12/8 debe seguir dando lo mismo aunque la config del
  // marketplace ya esté en 25/10: quien llama pasa los pct del trato.
  const viejo = calcularTrato({ monto: 500_000, comision_marca_pct: 12, comision_creadora_pct: 8 });
  const nuevo = calcularTrato({ monto: 500_000, comision_marca_pct: 25, comision_creadora_pct: 10 });

  assert.strictEqual(viejo.total_a_pagar_marca, 560_000);
  assert.strictEqual(nuevo.total_a_pagar_marca, 625_000);
  assert.notStrictEqual(viejo.total_a_pagar_marca, nuevo.total_a_pagar_marca);
});

test('comisión en cero se comporta como bruja embajadora', () => {
  const r = calcularTrato({ monto: 300_000, comision_marca_pct: 0, comision_creadora_pct: 0 });
  assert.strictEqual(r.total_a_pagar_marca, 300_000);
  assert.strictEqual(r.neto_a_recibir_creadora, 300_000);
});

test('rechaza montos inválidos', () => {
  assert.throws(() => calcularTrato({ monto: 0, comision_marca_pct: 12, comision_creadora_pct: 8 }));
  assert.throws(() => calcularTrato({ monto: -100, comision_marca_pct: 12, comision_creadora_pct: 8 }));
  assert.throws(() => calcularTrato({ monto: 'mucho', comision_marca_pct: 12, comision_creadora_pct: 8 }));
});

test('rechaza porcentajes fuera de rango', () => {
  assert.throws(() => calcularTrato({ monto: 100_000, comision_marca_pct: 150, comision_creadora_pct: 8 }));
  assert.throws(() => calcularTrato({ monto: 100_000, comision_marca_pct: 12, comision_creadora_pct: -5 }));
});

test('nivel de tarifa por monto', () => {
  const niveles = {
    inicial: { min: 200_000, max: 500_000 },
    medio:   { min: 500_000, max: 1_000_000 },
    top:     { min: 1_000_000, max: 3_000_000 },
  };
  assert.strictEqual(nivelPorTarifa(300_000, niveles), 'inicial');
  assert.strictEqual(nivelPorTarifa(750_000, niveles), 'medio');
  assert.strictEqual(nivelPorTarifa(2_000_000, niveles), 'top');
  assert.strictEqual(nivelPorTarifa(9_000_000, niveles), 'top');
});

test('el alcance se traduce a rango, nunca a la cifra exacta', () => {
  const rangos = [
    { clave: '1K-10K', min: 1000, max: 10000 },
    { clave: '10K-50K', min: 10000, max: 50000 },
    { clave: '50K-100K', min: 50000, max: 100000 },
    { clave: '100K+', min: 100000, max: null },
  ];
  assert.strictEqual(rangoAlcance(4800, rangos), '1K-10K');
  assert.strictEqual(rangoAlcance(48000, rangos), '10K-50K');
  assert.strictEqual(rangoAlcance(50000, rangos), '50K-100K');
  assert.strictEqual(rangoAlcance(154000, rangos), '100K+');
});

test('formato de pesos colombianos', () => {
  assert.strictEqual(formatearCOP(1_250_000), '$1.250.000');
  assert.strictEqual(formatearCOP(0), '$0');
});

// ── Costo de desembolso ──
//
// Lo que la pasarela cobra por pasarle la plata a la creadora. Es el descuento
// que ella ve al decidir si acepta, así que un error aquí le promete un número
// y le paga otro.

test('el desembolso se calcula sobre lo que ella recibe, no sobre el bruto', () => {
  // 3% de $184.000 —ya descontada su comisión— son $5.520.
  // Si se calculara sobre los $200.000 serían $6.000: 480 pesos de más por trato.
  const r = calcularTrato({
    monto: 200_000, comision_marca_pct: 12, comision_creadora_pct: 8,
    costo_desembolso_pct: 3,
  });
  assert.strictEqual(r.comision_creadora_valor, 16_000);
  assert.strictEqual(r.costo_desembolso_valor, 5_520);
  assert.strictEqual(r.neto_a_recibir_creadora, 178_480);
});

test('sin costo de desembolso, el neto no cambia', () => {
  // Los tratos creados antes de esta función tienen 0 y deben seguir cuadrando.
  const r = calcularTrato({ monto: 200_000, comision_marca_pct: 12, comision_creadora_pct: 8 });
  assert.strictEqual(r.costo_desembolso_valor, 0);
  assert.strictEqual(r.neto_a_recibir_creadora, 184_000);
});

test('el desembolso no toca lo que paga la marca', () => {
  // Es un costo de ella, no de la marca: el total a pagar tiene que ser igual
  // con y sin desembolso, o la marca estaría cubriendo algo que no le dijeron.
  const con = calcularTrato({ monto: 200_000, comision_marca_pct: 12, comision_creadora_pct: 8, costo_desembolso_pct: 3 });
  const sin = calcularTrato({ monto: 200_000, comision_marca_pct: 12, comision_creadora_pct: 8 });
  assert.strictEqual(con.total_a_pagar_marca, sin.total_a_pagar_marca);
  assert.strictEqual(con.comision_total_valor, sin.comision_total_valor);
});

test('la embajadora no paga desembolso, igual que no paga comisión', () => {
  const r = calcularTrato({
    monto: 500_000, comision_marca_pct: 12, comision_creadora_pct: 8,
    costo_desembolso_pct: 3, es_bruja_embajadora: true,
  });
  assert.strictEqual(r.costo_desembolso_valor, 0);
  assert.strictEqual(r.neto_a_recibir_creadora, 500_000, 'recibe todo lo acordado');
});

test('un porcentaje de desembolso imposible se rechaza', () => {
  assert.throws(() => calcularTrato({
    monto: 100_000, comision_marca_pct: 12, comision_creadora_pct: 8, costo_desembolso_pct: 120,
  }), /desembolso/);
  assert.throws(() => calcularTrato({
    monto: 100_000, comision_marca_pct: 12, comision_creadora_pct: 8, costo_desembolso_pct: -5,
  }), /desembolso/);
});

test('las cuentas cierran sin pesos sueltos', () => {
  // Con un monto que no divide bonito, la suma de las partes tiene que dar
  // exactamente el monto: un peso perdido aquí es un descuadre en el banco.
  const r = calcularTrato({
    monto: 333_333, comision_marca_pct: 12, comision_creadora_pct: 8, costo_desembolso_pct: 3,
  });
  assert.strictEqual(
    r.neto_a_recibir_creadora + r.comision_creadora_valor + r.costo_desembolso_valor,
    r.monto_creadora
  );
});
