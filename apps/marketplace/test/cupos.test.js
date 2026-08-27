// Pruebas de las campañas con cupos.
//
// Cada caso de acá decide una de dos cosas: si a una marca se le cobra una
// propuesta, o si a una creadora le queda o no un trabajo. Ninguna de las dos
// se arregla pidiendo disculpas después.

process.env.MK_SKIP_CONFIG_CHECK = '1';

const test = require('node:test');
const assert = require('node:assert');

const {
  alcanzaElPlan, puedeInvitar, estadoDeCampana, puedeConfirmar,
  puedeResponder, alVencerse, MAX_POR_TANDA,
} = require('../cupos');

const campana = (extra = {}) => ({
  id: 'camp-1', estado: 'activa', cupos: 3,
  monto_creadora: 300_000,
  fecha_limite_respuesta: new Date(Date.now() + 48 * 3600_000).toISOString(),
  ...extra,
});

const inv = (creadora_id, estado = 'invitada') => ({ id: 'i-' + creadora_id, creadora_id, estado });

// ── El plan ─────────────────────────────────────────────────────────────────

test('cada creadora invitada consume una propuesta', () => {
  // La regla que sostiene el modelo: sin ella el plan gratuito se vuelve
  // ilimitado — bastaría una campaña e invitar a doscientas.
  assert.equal(alcanzaElPlan({ tope: 12, enviadas: 4, cuantas: 8 }).alcanza, true);
  assert.equal(alcanzaElPlan({ tope: 12, enviadas: 5, cuantas: 8 }).alcanza, false);
});

test('sin tope de plan, siempre alcanza', () => {
  assert.equal(alcanzaElPlan({ tope: null, enviadas: 999, cuantas: 10 }).alcanza, true);
});

test('es todo o nada: no se invita a la mitad', () => {
  // Mandar cinco de las ocho que pidió deja a la marca creyendo que invitó a
  // ocho, y se entera cuando le falten creadoras.
  const r = alcanzaElPlan({ tope: 12, enviadas: 7, cuantas: 8 });
  assert.equal(r.alcanza, false);
  assert.equal(r.restantes, 5);
  assert.match(r.mensaje, /te quedan 5/i);
});

test('sin propuestas restantes lo dice distinto', () => {
  const r = alcanzaElPlan({ tope: 3, enviadas: 3, cuantas: 1 });
  assert.match(r.mensaje, /ya usaste las 3/i);
});

// ── Invitar ─────────────────────────────────────────────────────────────────

test('no se invita desde una campaña plantilla', () => {
  const r = puedeInvitar({ campana: campana({ cupos: null }), nuevas: ['a'] });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /plantilla/i);
});

test('no se invita desde una campaña cerrada', () => {
  const r = puedeInvitar({ campana: campana({ estado: 'cerrada' }), nuevas: ['a'] });
  assert.equal(r.ok, false);
});

test('las ya invitadas se filtran en silencio', () => {
  // Es un clic repetido, no un error de la marca.
  const r = puedeInvitar({
    campana: campana(),
    yaInvitadas: [inv('a')],
    nuevas: ['a', 'b'],
    plan: { tope: 12, enviadas: 0 },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.porInvitar, ['b']);
  assert.equal(r.consume, 1);
});

test('si todas ya estaban invitadas, se avisa', () => {
  const r = puedeInvitar({
    campana: campana(), yaInvitadas: [inv('a')], nuevas: ['a'], plan: { tope: 12, enviadas: 0 },
  });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /ya estaban invitadas/i);
});

test('los ids repetidos en la misma tanda cuentan una vez', () => {
  const r = puedeInvitar({
    campana: campana(), nuevas: ['a', 'a', 'b'], plan: { tope: 12, enviadas: 0 },
  });
  assert.equal(r.consume, 2);
});

test('hay un tope por tanda', () => {
  const muchas = Array.from({ length: MAX_POR_TANDA + 1 }, (_, i) => 'c' + i);
  const r = puedeInvitar({ campana: campana(), nuevas: muchas, plan: { tope: null } });
  assert.equal(r.ok, false);
  assert.match(r.motivo, new RegExp(String(MAX_POR_TANDA)));
});

test('sin propuestas suficientes no se invita, y se marca por qué', () => {
  const r = puedeInvitar({
    campana: campana(), nuevas: ['a', 'b', 'c'], plan: { tope: 3, enviadas: 2 },
  });
  assert.equal(r.ok, false);
  assert.equal(r.sinPropuestas, true);
});

// ── Estado de la campaña ────────────────────────────────────────────────────

test('los cupos libres se calculan, no se guardan', () => {
  const e = estadoDeCampana(campana(), [
    inv('a', 'confirmada'), inv('b', 'confirmada'), inv('c', 'acepto'), inv('d'),
  ]);
  assert.equal(e.cupos, 3);
  assert.equal(e.confirmadas, 2);
  assert.equal(e.libres, 1);
  assert.equal(e.aceptaron, 1);
  assert.equal(e.esperando, 1);
  assert.equal(e.llena, false);
});

test('con los cupos llenos, la campaña se marca llena', () => {
  const e = estadoDeCampana(campana({ cupos: 2 }), [inv('a', 'confirmada'), inv('b', 'confirmada')]);
  assert.equal(e.llena, true);
  assert.equal(e.puedeInvitarMas, false);
});

test('el plazo vencido se detecta contra la hora dada', () => {
  const c = campana({ fecha_limite_respuesta: new Date(Date.now() - 1000).toISOString() });
  assert.equal(estadoDeCampana(c, []).vencida, true);
});

// ── Confirmar ───────────────────────────────────────────────────────────────

test('solo se confirma a quien aceptó', () => {
  // Confirmar a alguien que no respondió es contratarla sin su sí.
  const e = estadoDeCampana(campana(), []);
  assert.equal(puedeConfirmar({ invitacion: inv('a', 'invitada'), estado: e }).ok, false);
  assert.equal(puedeConfirmar({ invitacion: inv('a', 'acepto'), estado: e }).ok, true);
});

test('cada estado explica por qué no se puede confirmar', () => {
  const e = estadoDeCampana(campana(), []);
  for (const est of ['invitada', 'paso', 'cupos_llenos', 'vencida']) {
    const r = puedeConfirmar({ invitacion: inv('a', est), estado: e });
    assert.equal(r.ok, false);
    assert.ok(r.motivo.length > 15, `el motivo de "${est}" no explica nada`);
  }
});

test('no se confirma por encima de los cupos', () => {
  const e = estadoDeCampana(campana({ cupos: 1 }), [inv('a', 'confirmada')]);
  const r = puedeConfirmar({ invitacion: inv('b', 'acepto'), estado: e });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /llenaste/i);
});

test('confirmar dos veces lo dice sin drama', () => {
  const e = estadoDeCampana(campana(), []);
  assert.match(puedeConfirmar({ invitacion: inv('a', 'confirmada'), estado: e }).motivo, /ya la habías/i);
});

// ── Responder ───────────────────────────────────────────────────────────────

test('no se responde después del plazo', () => {
  const c = campana({ fecha_limite_respuesta: new Date(Date.now() - 1000).toISOString() });
  const r = puedeResponder({ invitacion: inv('a'), campana: c, estado: estadoDeCampana(c, []) });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /plazo/i);
});

test('se puede aceptar aunque los cupos estén llenos', () => {
  // Bloquearla acá la deja sin opción por haberse demorado unas horas, y la
  // marca todavía puede ampliar los cupos. Si al final no la eligen ve
  // "cupos completos", que no es un no.
  const c = campana({ cupos: 1 });
  const e = estadoDeCampana(c, [inv('x', 'confirmada')]);
  const r = puedeResponder({ invitacion: inv('a'), campana: c, estado: e });
  assert.equal(r.ok, true);
  assert.equal(r.avisoCuposLlenos, true);
});

test('no se responde dos veces', () => {
  const c = campana();
  const r = puedeResponder({ invitacion: inv('a', 'acepto'), campana: c, estado: estadoDeCampana(c, []) });
  assert.equal(r.ok, false);
});

// ── Vencimiento ─────────────────────────────────────────────────────────────

test('al vencerse, las que no respondieron quedan vencidas', () => {
  const c = campana();
  const invs = [inv('a'), inv('b'), inv('c', 'paso')];
  const r = alVencerse({ campana: c, invitaciones: invs, estado: estadoDeCampana(c, invs) });
  const vencidas = r.cambios.filter(x => x.estado === 'vencida').map(x => x.creadora_id);
  assert.deepEqual(vencidas.sort(), ['a', 'b']);
});

test('quien aceptó y no fue elegida NO queda como vencida', () => {
  // Decirle "se te venció" a alguien que respondió a tiempo es echarle la
  // culpa de una decisión ajena. Queda en cupos_llenos, que es lo que pasó.
  const c = campana({ cupos: 1 });
  const invs = [inv('x', 'confirmada'), inv('a', 'acepto')];
  const r = alVencerse({ campana: c, invitaciones: invs, estado: estadoDeCampana(c, invs) });
  const cambio = r.cambios.find(x => x.creadora_id === 'a');
  assert.equal(cambio.estado, 'cupos_llenos');
});

test('con cupos libres, quien aceptó sigue esperando', () => {
  // La marca todavía puede elegirla: no se le cierra la puerta por que se
  // haya vencido el plazo de OTRAS.
  const c = campana({ cupos: 3 });
  const invs = [inv('a', 'acepto'), inv('b')];
  const r = alVencerse({ campana: c, invitaciones: invs, estado: estadoDeCampana(c, invs) });
  assert.ok(!r.cambios.some(x => x.creadora_id === 'a'));
  assert.equal(r.cerrar, false);
});

test('la campaña se cierra sola cuando ya no le sirve a nadie', () => {
  const c = campana({ cupos: 1 });
  const invs = [inv('x', 'confirmada'), inv('b')];
  const r = alVencerse({ campana: c, invitaciones: invs, estado: estadoDeCampana(c, invs) });
  assert.equal(r.cerrar, true);
});
