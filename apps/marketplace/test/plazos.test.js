// Pruebas de los plazos automáticos.
//
// Esto cancela tratos y aprueba entregas sin que nadie lo mire, así que un
// error de un signo aquí le quita un trabajo a una creadora o le libera el
// dinero a la marca antes de tiempo. Es de los sitios donde vale la pena
// probar con horas concretas y no con aproximaciones.

process.env.MK_SKIP_CONFIG_CHECK = '1';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://ejemplo.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'clave-de-prueba';

const test = require('node:test');
const assert = require('node:assert');
const { clasificarPendientes, clasificarEntregas } = require('../plazos');

const AHORA = new Date('2026-08-26T12:00:00Z').getTime();
const haceHoras = (h) => new Date(AHORA - h * 36e5).toISOString();

const propuesta = (horas, extra = {}) => ({
  id: 'x', codigo: 'T-1', estado: 'solicitado',
  fecha_solicitud: haceHoras(horas), ...extra,
});

test('una propuesta recién enviada no se toca', () => {
  const r = clasificarPendientes([propuesta(2)], 72, AHORA);
  assert.strictEqual(r.esperar.length, 1);
  assert.strictEqual(r.avisar.length, 0);
  assert.strictEqual(r.expirar.length, 0);
});

test('a las 48 de 72 horas se avisa, no se cierra', () => {
  // El aviso entra cuando queda un tercio del plazo.
  const r = clasificarPendientes([propuesta(48)], 72, AHORA);
  assert.strictEqual(r.avisar.length, 1);
  assert.strictEqual(r.expirar.length, 0, 'todavía tiene 24 horas: cerrarla sería injusto');
});

test('cumplido el plazo se cierra', () => {
  const r = clasificarPendientes([propuesta(72)], 72, AHORA);
  assert.strictEqual(r.expirar.length, 1);
});

test('no se avisa dos veces a la misma persona', () => {
  // Sin esto, cada corrida del cron le mandaría el mismo correo otra vez.
  const yaAvisada = propuesta(50, { aviso_plazo_at: haceHoras(1) });
  const r = clasificarPendientes([yaAvisada], 72, AHORA);
  assert.strictEqual(r.avisar.length, 0);
  assert.strictEqual(r.esperar.length, 1);
});

test('a quien ya se le avisó igual se le cierra al vencer', () => {
  const yaAvisada = propuesta(80, { aviso_plazo_at: haceHoras(10) });
  const r = clasificarPendientes([yaAvisada], 72, AHORA);
  assert.strictEqual(r.expirar.length, 1);
});

test('solo se miran las propuestas sin responder', () => {
  // Un trato aceptado o ya pagado no se puede cancelar por tiempo: hay dinero
  // de por medio y esa decisión es de una persona.
  const otros = [
    { estado: 'aceptado', fecha_solicitud: haceHoras(500) },
    { estado: 'pago_retenido', fecha_solicitud: haceHoras(500) },
    { estado: 'cerrado', fecha_solicitud: haceHoras(500) },
  ];
  const r = clasificarPendientes(otros, 72, AHORA);
  assert.strictEqual(r.expirar.length, 0);
  assert.strictEqual(r.avisar.length, 0);
  assert.strictEqual(r.esperar.length, 0);
});

test('una propuesta sin fecha no se cierra por accidente', () => {
  // Sin fecha, el cálculo daría 0 horas y quedaría en espera. Lo que no puede
  // pasar es que se lea como infinitamente vieja y se cancele.
  const r = clasificarPendientes([{ estado: 'solicitado', fecha_solicitud: null }], 72, AHORA);
  assert.strictEqual(r.expirar.length, 0);
});

test('el plazo es configurable y se respeta', () => {
  const t = [propuesta(30)];
  assert.strictEqual(clasificarPendientes(t, 72, AHORA).expirar.length, 0);
  assert.strictEqual(clasificarPendientes(t, 24, AHORA).expirar.length, 1,
    'con un plazo de 24 horas, algo de hace 30 ya venció');
});

// ── Entregas por aprobar ──

test('una entrega reciente no se aprueba sola', () => {
  const t = [{ estado: 'entregado', fecha_entrega: haceHoras(10) }];
  assert.strictEqual(clasificarEntregas(t, 48, AHORA).length, 0);
});

test('una entrega vencida sí entra a auto-aprobación', () => {
  const t = [{ estado: 'entregado', fecha_entrega: haceHoras(49) }];
  assert.strictEqual(clasificarEntregas(t, 48, AHORA).length, 1);
});

test('solo se auto-aprueba lo que está entregado', () => {
  const t = [
    { estado: 'pago_retenido', fecha_entrega: haceHoras(500) },
    { estado: 'aprobado', fecha_entrega: haceHoras(500) },
  ];
  assert.strictEqual(clasificarEntregas(t, 48, AHORA).length, 0);
});

test('una entrega sin fecha nunca se aprueba sola', () => {
  // Aprobar libera el dinero. Ante la duda, que lo mire una persona.
  const t = [{ estado: 'entregado', fecha_entrega: null }];
  assert.strictEqual(clasificarEntregas(t, 48, AHORA).length, 0);
});

test('las listas vacías no rompen nada', () => {
  const r = clasificarPendientes([], 72, AHORA);
  assert.deepStrictEqual(r, { expirar: [], avisar: [], esperar: [] });
  assert.deepStrictEqual(clasificarEntregas([], 48, AHORA), []);
});
