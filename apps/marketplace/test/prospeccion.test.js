// Las reglas del agente de prospección.
//
// Lo que se vigila acá no es que mande mensajes: es que NO los mande cuando no
// debe. Escribirle a alguien que ya dijo que no, o cinco veces a quien no
// contesta, es lo que quema un dominio y un número de WhatsApp.

process.env.MK_SKIP_CONFIG_CHECK = '1';

const test = require('node:test');
const assert = require('node:assert');
const p = require('../prospeccion');

const HOY = new Date('2026-09-15T12:00:00Z');
const haceDias = (n) => new Date(HOY.getTime() - n * 86400000).toISOString();

const base = (extra = {}) => ({
  estado: 'investigado', canal: 'correo', toques_enviados: 0, ...extra,
});

// ── Cuándo toca y cuándo no ────────────────────────────────────────────────

test('a un prospecto investigado le toca el primer mensaje de una', () => {
  const t = p.toqueQueToca(base(), HOY);
  assert.equal(t.toca, true);
  assert.equal(t.toque, 1);
});

test('uno recién encontrado no recibe nada hasta investigarlo', () => {
  const t = p.toqueQueToca(base({ estado: 'nuevo' }), HOY);
  assert.equal(t.toca, false);
  assert.match(t.motivo, /investigarlo/);
});

test('el segundo toque espera los tres días', () => {
  const ayer = p.toqueQueToca(
    base({ toques_enviados: 1, primer_toque_at: haceDias(1) }), HOY);
  assert.equal(ayer.toca, false);

  const alTercero = p.toqueQueToca(
    base({ toques_enviados: 1, primer_toque_at: haceDias(3) }), HOY);
  assert.equal(alTercero.toca, true);
  assert.equal(alTercero.toque, 2);
});

test('después del cuarto toque no hay quinto', () => {
  const t = p.toqueQueToca(
    base({ toques_enviados: 4, primer_toque_at: haceDias(30) }), HOY);
  assert.equal(t.toca, false);
  assert.match(t.motivo, /cadencia/);
});

// ── Lo que nunca puede pasar ───────────────────────────────────────────────

test('a quien pidió que no le escribamos NO se le escribe, pase lo que pase', () => {
  const t = p.toqueQueToca(
    base({ no_contactar: true, toques_enviados: 1, primer_toque_at: haceDias(90) }), HOY);
  assert.equal(t.toca, false);
});

test('quien ya contestó sale de la cadencia automática', () => {
  // Seguir mandando recordatorios a alguien que respondió es la forma más
  // rápida de perder a un cliente que ya estaba interesado.
  const t = p.toqueQueToca(
    base({ estado: 'respondio', toques_enviados: 1, primer_toque_at: haceDias(10) }), HOY);
  assert.equal(t.toca, false);
  assert.match(t.motivo, /contest/);
});

test('con reunión agendada tampoco se le insiste', () => {
  const t = p.toqueQueToca(base({ estado: 'reunion', toques_enviados: 2 }), HOY);
  assert.equal(t.toca, false);
});

test('a un cliente no se le prospecta', () => {
  const t = p.toqueQueToca(base({ estado: 'cliente', toques_enviados: 1 }), HOY);
  assert.equal(t.toca, false);
});

// ── La tanda del día ───────────────────────────────────────────────────────

test('el cupo diario se respeta por canal', () => {
  const muchos = Array.from({ length: 60 }, (_, i) =>
    base({ id: i, canal: 'correo', puntaje: i }));
  const r = p.tandaDelDia(muchos, { hoy: HOY, topes: { correo: 10 } });
  assert.equal(r.salen.length, 10);
  assert.equal(r.aplazados.length, 50);
});

test('lo que no cupo se dice, no se calla', () => {
  const muchos = Array.from({ length: 5 }, (_, i) => base({ id: i, puntaje: 1 }));
  const r = p.tandaDelDia(muchos, { hoy: HOY, topes: { correo: 2 } });
  assert.equal(r.aplazados.length, 3);
  assert.match(r.aplazados[0].razon, /cupo/);
});

test('primero salen los de mayor puntaje', () => {
  const lista = [
    base({ id: 'bajo', puntaje: 10 }),
    base({ id: 'alto', puntaje: 90 }),
    base({ id: 'medio', puntaje: 50 }),
  ];
  const r = p.tandaDelDia(lista, { hoy: HOY, topes: { correo: 2 } });
  assert.deepStrictEqual(r.salen.map(x => x.prospecto.id), ['alto', 'medio']);
});

test('Instagram y LinkedIn van a cola, no salen solos', () => {
  const lista = [
    base({ id: 'ig', canal: 'instagram', puntaje: 99 }),
    base({ id: 'li', canal: 'linkedin', puntaje: 98 }),
    base({ id: 'em', canal: 'correo', puntaje: 97 }),
  ];
  const r = p.tandaDelDia(lista, { hoy: HOY });
  assert.deepStrictEqual(r.salen.map(x => x.prospecto.id), ['em']);
  assert.deepStrictEqual(r.enCola.map(x => x.prospecto.id), ['ig', 'li']);
});

test('solo correo y WhatsApp se mandan solos', () => {
  assert.deepStrictEqual(p.canalesAutomaticos().sort(), ['correo', 'whatsapp']);
});

// ── El puntaje ─────────────────────────────────────────────────────────────

test('que una creadora ya la conozca es lo que más pesa', () => {
  const conocida = p.puntuar({ creadora_que_la_conoce: true });
  const sola     = p.puntuar({ trabaja_con_creadoras: true, vende_producto_fisico: true, pais: 'CO' });
  assert.ok(conocida.puntaje > sola.puntaje);
});

test('el puntaje explica de dónde salió cada punto', () => {
  const r = p.puntuar({ creadora_que_la_conoce: true, pais: 'CO' });
  assert.equal(r.porque.length, 2);
  assert.match(r.porque[0], /creadora/);
});

test('una marca demasiado grande puntúa menos', () => {
  const normal = p.puntuar({ trabaja_con_creadoras: true, pais: 'CO' });
  const gigante = p.puntuar({ trabaja_con_creadoras: true, pais: 'CO', demasiado_grande: true });
  assert.ok(gigante.puntaje < normal.puntaje);
});

test('quien pidió que no lo contacten queda en cero, sume lo que sume', () => {
  const r = p.puntuar({
    creadora_que_la_conoce: true, trabaja_con_creadoras: true,
    vende_producto_fisico: true, pais: 'CO', no_contactar: true,
  });
  assert.equal(r.puntaje, 0);
});

// ── Las respuestas ─────────────────────────────────────────────────────────

test('un "no me interesa" lo saca para siempre', () => {
  const r = p.alResponder('Hola, no me interesa gracias');
  assert.equal(r.estado, 'no_interesa');
  assert.equal(r.no_contactar, true);
});

test('pedir la baja se respeta igual que un no', () => {
  for (const texto of ['STOP', 'quiero dar de baja', 'no escriban más por favor']) {
    assert.equal(p.alResponder(texto).no_contactar, true, texto);
  }
});

test('cualquier otra respuesta solo lo saca de la cadencia', () => {
  const r = p.alResponder('Hola, cuéntame más de qué se trata');
  assert.equal(r.estado, 'respondio');
  assert.equal(r.no_contactar, false);
});

// ── Cerrar los que no contestaron ──────────────────────────────────────────

test('se agota una semana después del último toque, no de inmediato', () => {
  const recien = base({ toques_enviados: 4, ultimo_toque_at: haceDias(2) });
  assert.equal(p.seAgoto(recien, HOY), false);

  const viejo = base({ toques_enviados: 4, ultimo_toque_at: haceDias(8) });
  assert.equal(p.seAgoto(viejo, HOY), true);
});

test('quien respondió nunca se marca como agotado', () => {
  const r = base({ estado: 'respondio', toques_enviados: 4, ultimo_toque_at: haceDias(30) });
  assert.equal(p.seAgoto(r, HOY), false);
});
