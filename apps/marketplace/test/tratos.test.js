// Pruebas de la máquina de estados del trato.
//
// El otro módulo donde un bug cuesta plata: una transición inválida podría
// liberar un pago que no se ha recibido, o revelar el contacto antes de tiempo
// y dejar la comisión sin cobrar.
//
// La capa de datos se sustituye por dobles en memoria: estas pruebas no tocan
// Supabase ni la red.

process.env.MK_SKIP_CONFIG_CHECK = '1';

const test = require('node:test');
const assert = require('node:assert');

const db = require('../db');
const maquina = require('../tratos');

// ── Dobles de la capa de datos ──────────────────────────────────────────────

let _pagos = [];
let _config = { revelar_contacto_en: 'pago_retenido' };
let _eventos = [];
let _ultimoUpdate = null;

db.getPagosDeTrato = async () => _pagos;
db.getConfig = async () => _config;
db.insertEvento = async (e) => { _eventos.push(e); return e; };
db.updateTrato = async (id, cambios) => {
  _ultimoUpdate = cambios;
  return { id, ...cambios };
};

function reset({ pagos = [], config = { revelar_contacto_en: 'pago_retenido' } } = {}) {
  _pagos = pagos;
  _config = config;
  _eventos = [];
  _ultimoUpdate = null;
}

const trato = (props = {}) => ({
  id: 'trato-1',
  estado: 'solicitado',
  contacto_revelado_at: null,
  ...props,
});

// ── Transiciones permitidas ─────────────────────────────────────────────────

test('el camino feliz completo es transitable', () => {
  const pasos = [
    ['solicitado', 'aceptado', 'creadora'],
    ['aceptado', 'pago_retenido', 'admin'],
    ['pago_retenido', 'entregado', 'creadora'],
    ['entregado', 'aprobado', 'marca'],
    ['aprobado', 'pagado', 'admin'],
    ['pagado', 'cerrado', 'admin'],
  ];
  for (const [desde, hacia, actor] of pasos) {
    assert.ok(
      maquina.puedeTransicionar(desde, hacia, actor),
      `${actor} debería poder pasar de ${desde} a ${hacia}`
    );
  }
});

test('cada quien hace lo suyo y nada más', () => {
  // La marca no puede aceptar por la creadora.
  assert.ok(!maquina.puedeTransicionar('solicitado', 'aceptado', 'marca'));
  // La creadora no puede aprobar su propia entrega.
  assert.ok(!maquina.puedeTransicionar('entregado', 'aprobado', 'creadora'));
  // La marca no puede declarar que se pagó a la creadora.
  assert.ok(!maquina.puedeTransicionar('aprobado', 'pagado', 'marca'));
  // Solo admin confirma que el dinero entró.
  assert.ok(!maquina.puedeTransicionar('aceptado', 'pago_retenido', 'marca'));
  assert.ok(!maquina.puedeTransicionar('aceptado', 'pago_retenido', 'creadora'));
});

test('no se puede saltar pasos', () => {
  assert.ok(!maquina.puedeTransicionar('solicitado', 'pagado', 'admin'));
  assert.ok(!maquina.puedeTransicionar('aceptado', 'entregado', 'creadora'));
  assert.ok(!maquina.puedeTransicionar('pago_retenido', 'aprobado', 'marca'));
});

test('los estados terminales no tienen salida', () => {
  for (const terminal of ['cerrado', 'rechazado', 'cancelado']) {
    assert.ok(maquina.esTerminal(terminal));
    for (const actor of ['marca', 'creadora', 'admin', 'sistema']) {
      assert.deepStrictEqual(maquina.transicionesDisponibles(terminal, actor), []);
    }
  }
});

test('la marca puede pedir cambios y el trato retrocede un paso', () => {
  assert.ok(maquina.puedeTransicionar('entregado', 'pago_retenido', 'marca'));
});

// ── Guardas de dinero ───────────────────────────────────────────────────────

test('no se marca el dinero como retenido sin registrar el pago de la marca', async () => {
  reset({ pagos: [] });
  await assert.rejects(
    () => maquina.aplicarTransicion(trato({ estado: 'aceptado' }), 'pago_retenido', 'admin'),
    (e) => e.name === 'TransicionInvalida' && e.status === 409
  );
});

test('con el pago de entrada registrado sí se retiene', async () => {
  reset({ pagos: [{ direccion: 'entrada', monto: 1_120_000 }] });
  const r = await maquina.aplicarTransicion(trato({ estado: 'aceptado' }), 'pago_retenido', 'admin');
  assert.strictEqual(r.estado, 'pago_retenido');
});

test('no se marca como pagado sin registrar la salida', async () => {
  reset({ pagos: [{ direccion: 'entrada', monto: 1_120_000 }] });
  await assert.rejects(
    () => maquina.aplicarTransicion(trato({ estado: 'aprobado' }), 'pagado', 'admin'),
    (e) => e.name === 'TransicionInvalida' && e.status === 409
  );
});

test('con el pago de salida registrado sí se marca como pagado', async () => {
  reset({ pagos: [{ direccion: 'entrada', monto: 1_120_000 }, { direccion: 'salida', monto: 920_000 }] });
  const r = await maquina.aplicarTransicion(trato({ estado: 'aprobado' }), 'pagado', 'admin');
  assert.strictEqual(r.estado, 'pagado');
});

// ── Revelación del contacto ─────────────────────────────────────────────────

test('el contacto sigue oculto al aceptar', async () => {
  reset();
  const r = await maquina.aplicarTransicion(trato({ estado: 'solicitado' }), 'aceptado', 'creadora');
  assert.ok(!r.contacto_revelado_at, 'no debería revelarse contacto al aceptar');
  assert.ok(!maquina.contactoVisible(r));
});

test('el contacto se revela cuando el dinero queda retenido', async () => {
  reset({ pagos: [{ direccion: 'entrada', monto: 1_120_000 }] });
  const r = await maquina.aplicarTransicion(trato({ estado: 'aceptado' }), 'pago_retenido', 'admin');
  assert.ok(r.contacto_revelado_at, 'debería sellarse contacto_revelado_at');
  assert.ok(maquina.contactoVisible(r));
});

test('si la config lo pide, el contacto se revela al aceptar', async () => {
  reset({ config: { revelar_contacto_en: 'aceptado' } });
  const r = await maquina.aplicarTransicion(trato({ estado: 'solicitado' }), 'aceptado', 'creadora');
  assert.ok(r.contacto_revelado_at);
});

test('el contacto no se re-sella si ya estaba revelado', async () => {
  reset({ pagos: [{ direccion: 'entrada', monto: 1 }] });
  const antes = '2026-08-01T10:00:00.000Z';
  await maquina.aplicarTransicion(
    trato({ estado: 'entregado', contacto_revelado_at: antes, fecha_pago_marca: antes }),
    'pago_retenido',
    'marca',
    { nota: 'cambios' }
  );
  assert.ok(!('contacto_revelado_at' in _ultimoUpdate), 'no debería reescribirse la fecha de revelación');
});

test('pedir cambios no reescribe la fecha del pago de la marca', async () => {
  reset({ pagos: [{ direccion: 'entrada', monto: 1 }] });
  const fechaPago = '2026-08-01T10:00:00.000Z';
  await maquina.aplicarTransicion(
    trato({ estado: 'entregado', fecha_pago_marca: fechaPago, contacto_revelado_at: fechaPago }),
    'pago_retenido',
    'marca'
  );
  assert.ok(!('fecha_pago_marca' in _ultimoUpdate), 'esa plata entró una sola vez');
});

// ── Historial ───────────────────────────────────────────────────────────────

test('toda transición deja evento con actor y estados', async () => {
  reset();
  await maquina.aplicarTransicion(trato({ estado: 'solicitado' }), 'rechazado', 'creadora', {
    actor_id: 'creadora-1',
    motivo_rechazo: 'agenda llena',
  });
  assert.strictEqual(_eventos.length, 1);
  assert.deepStrictEqual(
    { anterior: _eventos[0].estado_anterior, nuevo: _eventos[0].estado_nuevo, actor: _eventos[0].actor },
    { anterior: 'solicitado', nuevo: 'rechazado', actor: 'creadora' }
  );
  assert.strictEqual(_ultimoUpdate.motivo_rechazo, 'agenda llena');
});

test('rechaza estados inexistentes y transiciones al mismo estado', async () => {
  reset();
  await assert.rejects(
    () => maquina.aplicarTransicion(trato(), 'inventado', 'admin'),
    (e) => e.name === 'TransicionInvalida'
  );
  await assert.rejects(
    () => maquina.aplicarTransicion(trato({ estado: 'aceptado' }), 'aceptado', 'creadora'),
    (e) => e.name === 'TransicionInvalida'
  );
});

test('la línea de tiempo tiene los 7 estados del camino feliz', () => {
  assert.deepStrictEqual(maquina.LINEA_TIEMPO, [
    'solicitado', 'aceptado', 'pago_retenido', 'entregado', 'aprobado', 'pagado', 'cerrado',
  ]);
  maquina.LINEA_TIEMPO.forEach(e => assert.ok(maquina.ETIQUETAS[e], `falta etiqueta de ${e}`));
});
