const test = require('node:test');
const assert = require('node:assert');
const {
  OLAS, normalizar, correoUsable, filtrarCandidatas, pendientesDe, filtroDeEstados,
} = require('../invitaciones');

// Lo que se protege aquí es una sola cosa: que ninguna persona reciba dos veces
// la misma invitación, y que nadie con correo válido se quede por fuera.

test('las cuatro olas cubren todos los estados del programa, sin repetir', () => {
  const todos = Object.values(OLAS).flatMap(o => o.estados);
  assert.strictEqual(new Set(todos).size, todos.length, 'un estado quedó en dos olas');

  // "Contactada" queda fuera a propósito: en la base ninguna tiene correo.
  const esperados = [
    'Contenido Entregado', 'Calificada', 'Producto Enviado',
    'Registrada', 'Descartada', 'Pausada',
  ];
  esperados.forEach(e => assert.ok(todos.includes(e), `falta el estado ${e}`));
});

test('un correo con mayúsculas y espacios es el mismo correo', () => {
  assert.strictEqual(normalizar('  SARA@Correo.COM '), 'sara@correo.com');
});

test('descarta lo que no es un correo', () => {
  ['', null, undefined, 'sincorreo', '@suelto.com', 'termina@', '   '].forEach(malo => {
    assert.strictEqual(correoUsable(malo), false, `debió rechazar ${JSON.stringify(malo)}`);
  });
  assert.strictEqual(correoUsable('ana@correo.com'), true);
});

test('la misma persona registrada dos veces recibe una sola invitación', () => {
  const filas = [
    { id: '1', email: 'sara@correo.com', status: 'Registrada' },
    { id: '2', email: 'SARA@Correo.com', status: 'Producto Enviado' },
    { id: '3', email: '  sara@correo.com  ', status: 'Descartada' },
    { id: '4', email: 'ana@correo.com', status: 'Registrada' },
  ];
  const r = filtrarCandidatas(filas);
  assert.strictEqual(r.length, 2);
  assert.deepStrictEqual(r.map(x => x.id), ['1', '4'], 'debe quedarse con la primera aparición');
});

test('quien no tiene correo no entra en la lista', () => {
  const r = filtrarCandidatas([
    { id: '1', email: null },
    { id: '2', email: '' },
    { id: '3', email: 'vale@correo.com' },
  ]);
  assert.deepStrictEqual(r.map(x => x.id), ['3']);
});

test('no se le vuelve a escribir a quien ya recibió', () => {
  const candidatas = [
    { email: 'ya@correo.com' },
    { email: 'nueva@correo.com' },
  ];
  // Como vienen de la base: filas con .email, y en otra capitalización
  const previas = [{ email: 'YA@correo.com' }];
  const r = pendientesDe(candidatas, previas);
  assert.deepStrictEqual(r.map(x => x.email), ['nueva@correo.com']);
});

test('pendientesDe acepta también un Set de correos sueltos', () => {
  const r = pendientesDe(
    [{ email: 'a@x.com' }, { email: 'b@x.com' }],
    new Set(['  A@X.com ']),
  );
  assert.deepStrictEqual(r.map(x => x.email), ['b@x.com']);
});

test('sin nadie invitado antes, todas están pendientes', () => {
  const c = [{ email: 'a@x.com' }, { email: 'b@x.com' }];
  assert.strictEqual(pendientesDe(c, []).length, 2);
});

test('el filtro de estados va entrecomillado: los nombres llevan espacios', () => {
  assert.strictEqual(
    filtroDeEstados(['Contenido Entregado', 'Calificada']),
    'in.("Contenido Entregado","Calificada")',
  );
});
