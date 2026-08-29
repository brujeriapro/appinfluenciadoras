// Un canje recorre la misma máquina que un trato en dinero salvo en el final:
// no hay plata que girarle a la creadora, así que se cierra desde "aprobado".
// Ese atajo es también la forma de cerrar un trato en dinero sin haberle pagado
// nunca, y por eso la mitad de estas pruebas vigilan que NO se pueda.

process.env.MK_SKIP_CONFIG_CHECK = '1';

const test = require('node:test');
const assert = require('node:assert');
const maquina = require('../tratos');

test('un canje puede cerrarse desde aprobado', () => {
  assert.ok(maquina.puedeTransicionar('aprobado', 'cerrado', 'admin'));
});

test('en aprobado, a un canje se le ofrece cerrar y no pagar', () => {
  const opciones = maquina.transicionesDisponibles('aprobado', 'admin', 'canje');
  assert.deepStrictEqual(opciones, ['cerrado']);
});

test('en aprobado, a un trato en dinero se le ofrece pagar y no cerrar', () => {
  const opciones = maquina.transicionesDisponibles('aprobado', 'admin', 'dinero');
  assert.deepStrictEqual(opciones, ['pagado']);
});

test('sin decir el tipo de pago se asume dinero', () => {
  // Hay tres consumidores que llaman sin el argumento. Que el silencio
  // signifique "dinero" es lo que hace que ninguno abra el atajo del canje.
  assert.deepStrictEqual(maquina.transicionesDisponibles('aprobado', 'admin'), ['pagado']);
});

test('un trato en dinero NO se puede cerrar sin pagarle a la creadora', async () => {
  await assert.rejects(
    () => maquina.aplicarTransicion(
      { id: 'x', estado: 'aprobado', tipo_pago: 'dinero' }, 'cerrado', 'admin'),
    /pago a la creadora antes de cerrarlo/
  );
});

test('un trato sin tipo_pago se trata como dinero', async () => {
  // Los tratos anteriores a mk_058 no tienen la columna llena en memoria. Si
  // el ausente se leyera como canje, cualquiera de ellos se cerraría sin pago.
  await assert.rejects(
    () => maquina.aplicarTransicion({ id: 'x', estado: 'aprobado' }, 'cerrado', 'admin'),
    /pago a la creadora antes de cerrarlo/
  );
});

test('un canje no puede marcarse como pagado', async () => {
  await assert.rejects(
    () => maquina.aplicarTransicion(
      { id: 'x', estado: 'aprobado', tipo_pago: 'canje' }, 'pagado', 'admin'),
    /no se paga en dinero/
  );
});

test('la marca no puede cerrar un trato por su cuenta', () => {
  assert.ok(!maquina.puedeTransicionar('aprobado', 'cerrado', 'marca'));
  assert.ok(!maquina.puedeTransicionar('aprobado', 'cerrado', 'sistema'));
});
