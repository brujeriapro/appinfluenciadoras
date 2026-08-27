// Pruebas de la suscripción.
//
// Cada caso decide cuánto se le COBRA a alguien. Un error de redondeo en una
// pantalla se ve feo; acá es plata cobrada de más o de menos, y ninguna de las
// dos se arregla sola.

process.env.MK_SKIP_CONFIG_CHECK = '1';

const test = require('node:test');
const assert = require('node:assert');

const {
  prorrateo, cambioDePlan, propuestasTrasSubir, opcionesDelTope, DIAS_CICLO,
} = require('../suscripcion');

const IMPULSA = { clave: 'emprende', nombre: 'Impulsa', precio_mes: 39900, propuestas_mes: 12 };
const ESCALA  = { clave: 'marca',    nombre: 'Escala',  precio_mes: 119900, propuestas_mes: 40 };
const ARRANCA = { clave: 'arranca',  nombre: 'Arranca', precio_mes: 19900, propuestas_mes: 4 };
const EXPLORA = { clave: 'demo',     nombre: 'Explora', precio_mes: 0, propuestas_mes: 1 };

const enDias = (d) => new Date(Date.now() + d * 86_400_000).toISOString();

// ── Prorrateo ───────────────────────────────────────────────────────────────

test('sin plan vigente se cobra el precio completo', () => {
  const r = prorrateo({ precioNuevo: 119900, precioActual: 0, venceAt: null });
  assert.equal(r.aPagar, 119900);
  assert.equal(r.credito, 0);
});

test('se descuenta lo que ya pagó y no alcanzó a usar', () => {
  // Sin este descuento, quien sube al día siguiente de renovar paga dos meses
  // casi completos — y lo nota.
  const r = prorrateo({ precioNuevo: 119900, precioActual: 39900, venceAt: enDias(14) });
  assert.ok(r.credito > 0, 'debería haber crédito');
  assert.equal(r.aPagar, 119900 - r.credito);
  assert.ok(r.diasRestantes >= 13 && r.diasRestantes <= 15, r.diasRestantes);
});

test('a más días restantes, más descuento', () => {
  const poco = prorrateo({ precioNuevo: 119900, precioActual: 39900, venceAt: enDias(2) });
  const mucho = prorrateo({ precioNuevo: 119900, precioActual: 39900, venceAt: enDias(28) });
  assert.ok(mucho.credito > poco.credito);
});

test('el crédito nunca supera el precio del plan nuevo', () => {
  // Si lo superara, la plataforma terminaría DEVOLVIENDO plata por subir.
  const r = prorrateo({ precioNuevo: 19900, precioActual: 299900, venceAt: enDias(29) });
  assert.ok(r.credito <= 19900);
  assert.ok(r.aPagar >= 0);
});

test('un ciclo ya vencido no da crédito', () => {
  const r = prorrateo({ precioNuevo: 119900, precioActual: 39900, venceAt: enDias(-3) });
  assert.equal(r.credito, 0);
  assert.equal(r.aPagar, 119900);
});

test('el cobro siempre es un entero de pesos', () => {
  // Wompi cobra en centavos y un decimal suelto acá se convierte en un peso de
  // diferencia en la pasarela.
  const r = prorrateo({ precioNuevo: 119900, precioActual: 39900, venceAt: enDias(7) });
  assert.equal(r.aPagar, Math.round(r.aPagar));
  assert.equal(r.credito, Math.round(r.credito));
});

test('un mes entero restante descuenta el plan completo', () => {
  const r = prorrateo({ precioNuevo: 119900, precioActual: 39900, venceAt: enDias(DIAS_CICLO) });
  assert.equal(r.credito, 39900);
  assert.equal(r.aPagar, 80000);
});

// ── Cambiar de plan ─────────────────────────────────────────────────────────

test('subir es inmediato y se cobra hoy', () => {
  // Lo está pidiendo para mandar algo HOY: es la pantalla del tope.
  const r = cambioDePlan({ actual: IMPULSA, destino: ESCALA, venceAt: enDias(14) });
  assert.equal(r.tipo, 'subida');
  assert.equal(r.inmediato, true);
  assert.ok(r.aPagar > 0);
});

test('bajar espera al final del ciclo y no cobra', () => {
  // Ya pagó ese mes: cortarle propuestas que pagó sería quedarse con su plata.
  const vence = enDias(14);
  const r = cambioDePlan({ actual: ESCALA, destino: ARRANCA, venceAt: vence });
  assert.equal(r.tipo, 'bajada');
  assert.equal(r.inmediato, false);
  assert.equal(r.aPagar, 0);
  assert.equal(r.efectivoDesde, vence);
});

test('cancelar deja el plan activo hasta el final del mes pagado', () => {
  const r = cambioDePlan({ actual: ESCALA, destino: EXPLORA, venceAt: enDias(9) });
  assert.equal(r.tipo, 'cancelacion');
  assert.match(r.mensaje, /hasta el final/i);
});

test('no se cambia al plan en el que ya está', () => {
  const r = cambioDePlan({ actual: ESCALA, destino: ESCALA, venceAt: enDias(9) });
  assert.equal(r.ok, false);
});

// ── Las propuestas al subir ─────────────────────────────────────────────────

test('las propuestas se SUMAN a las que le quedaban', () => {
  // Si el plan nuevo reiniciara el contador, quien sube el día 28 con dos sin
  // usar las perdería: estaría pagando para tener menos.
  const r = propuestasTrasSubir({ topeNuevo: 40, topeActual: 12, usadas: 10 });
  assert.equal(r.quedaban, 2);
  assert.equal(r.sumadas, 28);
  assert.equal(r.disponibles, 30);
});

test('quien ya gastó todo recibe solo la diferencia', () => {
  const r = propuestasTrasSubir({ topeNuevo: 40, topeActual: 12, usadas: 12 });
  assert.equal(r.disponibles, 28);
});

test('un plan sin tope no devuelve número', () => {
  assert.equal(propuestasTrasSubir({ topeNuevo: null, topeActual: 12, usadas: 5 }), null);
});

// ── La pantalla del tope ────────────────────────────────────────────────────

test('SIEMPRE hay una salida gratis', () => {
  // Una pantalla sin salida gratis hace que la marca cierre y no vuelva.
  const r = opcionesDelTope({
    quiereInvitar: 7, disponibles: 0,
    planActual: IMPULSA, planSugerido: ESCALA, venceAt: enDias(14),
  });
  assert.ok(r.salidas.some(s => s.monto === 0), 'no hay salida gratis');
});

test('hay salida gratis aunque no exista un plan al que subir', () => {
  const r = opcionesDelTope({ quiereInvitar: 3, disponibles: 0, planActual: null, planSugerido: null });
  assert.equal(r.salidas.length, 1);
  assert.equal(r.salidas[0].monto, 0);
});

test('lo primero que se dice es que no pierde el trabajo hecho', () => {
  // Antes de cualquier precio: ya escribió el brief y eligió creadoras.
  const r = opcionesDelTope({ quiereInvitar: 7, disponibles: 0, planActual: IMPULSA, planSugerido: ESCALA });
  assert.match(r.protegido, /no pierdes nada/i);
  assert.ok(!/\$|precio|pag/i.test(r.protegido), 'el mensaje de protección habla de plata');
});

test('el precio de subir va con el descuento aplicado', () => {
  // Nunca el precio de lista: ya pagó parte del mes.
  const r = opcionesDelTope({
    quiereInvitar: 7, disponibles: 0,
    planActual: IMPULSA, planSugerido: ESCALA, venceAt: enDias(14),
  });
  const subir = r.salidas.find(s => s.clave === 'subir');
  assert.ok(subir.monto < ESCALA.precio_mes, 'está mostrando el precio de lista');
  assert.equal(subir.conDescuento, true);
});

test('dice cuántas propuestas le faltan', () => {
  const r = opcionesDelTope({ quiereInvitar: 7, disponibles: 2, planActual: IMPULSA, planSugerido: ESCALA });
  assert.equal(r.faltan, 5);
});

test('no se ofrecen propuestas sueltas', () => {
  // Con paquetes sueltos el plan gratuito se vuelve pago por uso y nadie sube.
  const r = opcionesDelTope({ quiereInvitar: 7, disponibles: 0, planActual: IMPULSA, planSugerido: ESCALA });
  assert.equal(r.hay_paquetes_sueltos, false);
  assert.ok(!r.salidas.some(s => /suelta|paquete|extra/i.test(s.titulo)));
});
