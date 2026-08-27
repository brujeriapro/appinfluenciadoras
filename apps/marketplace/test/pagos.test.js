// Pruebas de la recuperación de pagos.
//
// El escenario que estas pruebas cubren es el que más caro sale: la marca pasó
// la tarjeta, el banco debitó, y el webhook de Wompi nunca llegó. Sin
// recuperación, el trato se queda quieto y nadie se entera hasta que la marca
// reclama — si reclama.

process.env.MK_SKIP_CONFIG_CHECK = '1';
process.env.WOMPI_LLAVE_PUBLICA = 'pub_test_abc';
process.env.WOMPI_SECRETO_INTEGRIDAD = 'secreto_integridad_de_prueba';
process.env.WOMPI_SECRETO_EVENTOS = 'secreto_eventos_de_prueba';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://ejemplo.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'clave-de-prueba';

const test = require('node:test');
const assert = require('node:assert');

const { elegirTransaccion } = require('../wompi');
const { MENSAJES, yaSeAviso } = require('../pagos');

// ── Cuál de varios intentos cuenta ──────────────────────────────────────────

test('gana la aprobada aunque sea el intento más viejo', () => {
  // El caso caro: la marca falló con una tarjeta, pagó con otra, y luego un
  // tercer intento quedó pendiente. Quedarse con "la última" daría por no
  // pagado un trato que sí se pagó.
  const elegida = elegirTransaccion([
    { id: 'a', status: 'APPROVED', created_at: '2026-08-26T10:00:00Z' },
    { id: 'b', status: 'DECLINED', created_at: '2026-08-26T10:05:00Z' },
    { id: 'c', status: 'PENDING', created_at: '2026-08-26T10:09:00Z' },
  ]);
  assert.equal(elegida.id, 'a');
});

test('sin ninguna aprobada, gana la más reciente', () => {
  const elegida = elegirTransaccion([
    { id: 'a', status: 'DECLINED', created_at: '2026-08-26T10:00:00Z' },
    { id: 'b', status: 'ERROR', created_at: '2026-08-26T10:05:00Z' },
  ]);
  assert.equal(elegida.id, 'b');
});

test('sin intentos devuelve null, no revienta', () => {
  // Es el caso normal de un enlace de pago que la marca abrió y abandonó.
  assert.equal(elegirTransaccion([]), null);
  assert.equal(elegirTransaccion(null), null);
  assert.equal(elegirTransaccion(undefined), null);
});

test('un solo intento se devuelve tal cual', () => {
  const elegida = elegirTransaccion([{ id: 'unico', status: 'PENDING' }]);
  assert.equal(elegida.id, 'unico');
});

test('no reordena el arreglo que le pasan', () => {
  // Wompi devuelve su propia lista; mutarla es la clase de efecto secundario
  // que aparece meses después en otro sitio.
  const filas = [
    { id: 'a', status: 'DECLINED', created_at: '2026-08-26T10:00:00Z' },
    { id: 'b', status: 'ERROR', created_at: '2026-08-26T10:05:00Z' },
  ];
  elegirTransaccion(filas);
  assert.equal(filas[0].id, 'a');
});

// ── Lo que se le dice a la marca ────────────────────────────────────────────

test('cada estado de pago tiene un mensaje para la marca', () => {
  // Un "rechazada" a secas deja a quien lo lee sin saber qué hacer.
  for (const estado of ['aprobada', 'pendiente', 'rechazada', 'anulada', 'error']) {
    assert.ok(MENSAJES[estado], `falta el mensaje de "${estado}"`);
    assert.ok(MENSAJES[estado].length > 20, `el mensaje de "${estado}" no explica nada`);
  }
});

test('los mensajes de fallo dicen si se debitó o no', () => {
  // Es lo primero que quiere saber alguien cuyo pago no pasó.
  assert.match(MENSAJES.anulada, /no se debitó/i);
  assert.match(MENSAJES.error, /no se debitó/i);
});

// ── Aviso de plan por vencer ────────────────────────────────────────────────

const DIA = 24 * 3600_000;
const enFecha = (ms) => new Date(ms).toISOString();

test('sin aviso previo, se avisa', () => {
  assert.equal(yaSeAviso({ plan_vence_at: enFecha(Date.now() + 2 * DIA), plan_aviso_at: null }), false);
});

test('no se repite el aviso del mismo ciclo', () => {
  // Le avisamos ayer del vencimiento de pasado mañana: no se le escribe otra
  // vez en cada pasada del reloj, que son cuatro al día.
  const vence = Date.now() + 2 * DIA;
  assert.equal(yaSeAviso({ plan_vence_at: enFecha(vence), plan_aviso_at: enFecha(Date.now() - DIA) }), true);
});

test('tras renovar, el aviso viejo no bloquea el nuevo ciclo', () => {
  // Es el caso que un booleano se comería: le avisamos el mes pasado, renovó,
  // y el vencimiento nuevo está a dos días. Tiene que volver a recibir aviso.
  const vence = Date.now() + 2 * DIA;
  const avisoDelCicloAnterior = enFecha(Date.now() - 33 * DIA);
  assert.equal(yaSeAviso({ plan_vence_at: enFecha(vence), plan_aviso_at: avisoDelCicloAnterior }), false);
});

test('un aviso justo en el límite del mes pertenece al ciclo anterior', () => {
  const vence = Date.now() + 2 * DIA;
  const limite = enFecha(vence - 31 * DIA - 1000);
  assert.equal(yaSeAviso({ plan_vence_at: enFecha(vence), plan_aviso_at: limite }), false);
});
