// Pruebas de las campañas abiertas.
//
// Dos cosas se protegen acá y las dos duelen si fallan: a quién se le manda un
// correo —quemar el canal con las creadoras no se deshace— y cuántas propuestas
// del plan se consumen, que es plata.

process.env.MK_SKIP_CONFIG_CHECK = '1';

const test = require('node:test');
const assert = require('node:assert');

const {
  aQuienLeLlega, puedePublicar, puedePostularse, estadoDeConvocatoria, alCerrar,
  MAX_DESTINATARIAS,
} = require('../campanas-publicas');

const creadora = (extra = {}) => ({
  id: 'c' + Math.random().toString(36).slice(2, 8),
  nicho: ['rizos'], categorias: ['belleza'], ciudad: 'Medellín',
  ...extra,
});

const campanaOk = (extra = {}) => ({
  cupos: 6, brief_base: 'Queremos un reel mostrando la crema', monto_creadora: 300000,
  publica: true, estado: 'activa',
  ...extra,
});

// ── A quién le llega ────────────────────────────────────────────────────────

test('filtra por nicho', () => {
  const lista = [creadora({ nicho: ['rizos'] }), creadora({ nicho: ['gaming'] })];
  const r = aQuienLeLlega(lista, { busca_nicho: ['rizos'] });
  assert.equal(r.cuantas, 1);
});

test('filtra por ciudad', () => {
  const lista = [creadora({ ciudad: 'Medellín' }), creadora({ ciudad: 'Bogotá' })];
  const r = aQuienLeLlega(lista, { busca_ciudades: ['Medellín'] });
  assert.equal(r.cuantas, 1);
});

test('"Toda Colombia" no filtra por ciudad', () => {
  const lista = [creadora({ ciudad: 'Medellín' }), creadora({ ciudad: 'Cali' })];
  const r = aQuienLeLlega(lista, { busca_ciudades: ['Toda Colombia'] });
  assert.equal(r.cuantas, 2);
});

test('un dato que falta NO deja a nadie por fuera', () => {
  // Que su perfil esté a medias es culpa nuestra, no de ella. Dejarla fuera de
  // las ofertas por eso la castiga dos veces.
  const pelada = creadora({ nicho: [], categorias: [], ciudad: null });
  const r = aQuienLeLlega([pelada], { busca_nicho: ['rizos'], busca_ciudades: ['Bogotá'] });
  assert.equal(r.cuantas, 1);
});

test('sin filtros le llega a todas', () => {
  const lista = [creadora(), creadora(), creadora()];
  assert.equal(aQuienLeLlega(lista, {}).cuantas, 3);
});

test('se recorta el envío y se dice cuántas quedaron fuera', () => {
  // Una creadora que recibe cinco campañas que no le sirven deja de abrir la
  // sexta, y ahí se perdió el canal.
  const lista = Array.from({ length: MAX_DESTINATARIAS + 15 }, () => creadora());
  const r = aQuienLeLlega(lista, {});
  assert.equal(r.destinatarias.length, MAX_DESTINATARIAS);
  assert.equal(r.recortadas, 15);
});

// ── Qué cuesta publicar ─────────────────────────────────────────────────────

test('publicar consume una propuesta por cupo', () => {
  const r = puedePublicar({
    campana: campanaOk({ cupos: 6 }),
    plan: { propuestas_tope: 12, propuestas_enviadas: 0 },
  });
  assert.equal(r.ok, true);
  assert.equal(r.consume, 6);
});

test('no se publica una campaña que el plan no aguanta', () => {
  // Con 3 propuestas no se puede abrir una convocatoria de 20 cupos: se estaría
  // prometiendo a 20 creadoras algo que no se puede pagar.
  const r = puedePublicar({
    campana: campanaOk({ cupos: 20 }),
    plan: { propuestas_tope: 3, propuestas_enviadas: 0 },
  });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /propuestas/i);
});

test('un plan sin tope publica lo que quiera', () => {
  const r = puedePublicar({
    campana: campanaOk({ cupos: 50 }),
    plan: { propuestas_tope: null },
  });
  assert.equal(r.ok, true);
});

test('sin brief no se publica', () => {
  const r = puedePublicar({
    campana: campanaOk({ brief_base: '   ' }),
    plan: { propuestas_tope: null },
  });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /brief/i);
});

test('sin monto no se publica', () => {
  // Una convocatoria sin plata dicha no se responde, y las que responden lo
  // hacen esperando otra cosa.
  const r = puedePublicar({
    campana: campanaOk({ monto_creadora: 0 }),
    plan: { propuestas_tope: null },
  });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /monto/i);
});

// ── Postularse ──────────────────────────────────────────────────────────────

test('una creadora se postula una sola vez', () => {
  const r = puedePostularse({ campana: campanaOk(), yaPostulada: true });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /ya te postulaste/i);
});

test('no se puede postular a una campaña que no es pública', () => {
  const r = puedePostularse({ campana: campanaOk({ publica: false }) });
  assert.equal(r.ok, false);
});

test('no se puede postular con los cupos llenos', () => {
  const inv = Array.from({ length: 6 }, () => ({ estado: 'confirmada' }));
  const r = puedePostularse({ campana: campanaOk({ cupos: 6 }), invitaciones: inv });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /cupos/i);
});

test('no se puede postular pasado el plazo', () => {
  const r = puedePostularse({
    campana: campanaOk({ postulaciones_hasta: new Date(Date.now() - 3600_000).toISOString() }),
  });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /cerraron/i);
});

test('con cupos libres y plazo vigente, se postula', () => {
  const r = puedePostularse({
    campana: campanaOk({ postulaciones_hasta: new Date(Date.now() + 86_400_000).toISOString() }),
    invitaciones: [{ estado: 'confirmada' }],
  });
  assert.equal(r.ok, true);
});

// ── Cómo va ─────────────────────────────────────────────────────────────────

test('sin postulaciones lo dice sin dramatizar', () => {
  const r = estadoDeConvocatoria(campanaOk(), []);
  assert.equal(r.postuladas, 0);
  assert.match(r.resumen, /todavía no/i);
  assert.equal(r.cerrada, false);
});

test('cuenta postuladas, confirmadas y cupos libres', () => {
  const inv = [
    { origen: 'postulacion', estado: 'postulada' },
    { origen: 'postulacion', estado: 'postulada' },
    { origen: 'postulacion', estado: 'confirmada' },
    { origen: 'marca', estado: 'confirmada' },
  ];
  const r = estadoDeConvocatoria(campanaOk({ cupos: 6 }), inv);
  assert.equal(r.postuladas, 3);
  assert.equal(r.esperando, 2);
  assert.equal(r.confirmadas, 2);
  assert.equal(r.libres, 4);
});

test('con los cupos llenos queda cerrada', () => {
  const inv = Array.from({ length: 6 }, () => ({ estado: 'confirmada', origen: 'postulacion' }));
  assert.equal(estadoDeConvocatoria(campanaOk({ cupos: 6 }), inv).cerrada, true);
});

// ── Al cerrar ───────────────────────────────────────────────────────────────

test('se devuelven los cupos que nadie ocupó', () => {
  // Se cobró por adelantado sobre una expectativa. Quedarse con la plata de un
  // cupo vacío sería cobrar por algo que no se prestó.
  const inv = [{ estado: 'confirmada', origen: 'postulacion' }];
  const r = alCerrar({ campana: campanaOk({ cupos: 6 }), invitaciones: inv });
  assert.equal(r.devolver, 5);
  assert.match(r.mensaje, /devolvemos/i);
});

test('si se llenaron todos, no se devuelve nada', () => {
  const inv = Array.from({ length: 6 }, () => ({ estado: 'confirmada', origen: 'postulacion' }));
  const r = alCerrar({ campana: campanaOk({ cupos: 6 }), invitaciones: inv });
  assert.equal(r.devolver, 0);
});

test('a quien se postuló y no quedó se le avisa', () => {
  const inv = [
    { estado: 'confirmada', origen: 'postulacion', creadora_id: 'a' },
    { estado: 'postulada', origen: 'postulacion', creadora_id: 'b' },
    { estado: 'postulada', origen: 'postulacion', creadora_id: 'c' },
  ];
  const r = alCerrar({ campana: campanaOk({ cupos: 6 }), invitaciones: inv });
  assert.deepEqual(r.avisar, ['b', 'c']);
});

test('a quien la marca invitó y no respondió no se le avisa de cupos llenos', () => {
  // Ese aviso es para quien levantó la mano. A quien nunca respondió una
  // invitación, decirle "se llenaron los cupos" es ruido.
  const inv = [{ estado: 'invitada', origen: 'marca', creadora_id: 'z' }];
  assert.deepEqual(alCerrar({ campana: campanaOk(), invitaciones: inv }).avisar, []);
});

test('publicar y cerrar sin nadie devuelve todo lo cobrado', () => {
  const r = alCerrar({ campana: campanaOk({ cupos: 4 }), invitaciones: [] });
  assert.equal(r.devolver, 4);
});
