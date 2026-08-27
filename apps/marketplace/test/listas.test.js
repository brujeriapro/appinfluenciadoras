const test = require('node:test');
const assert = require('node:assert');

// listas.js cuelga de whatsapp.js, que cuelga de config.js, que lanza si le
// faltan secretos. Aquí no se manda nada: solo se prueban funciones puras.
process.env.MK_SKIP_CONFIG_CHECK = '1';

const {
  limpiarNombre, separarCampos, partirLinea, leerPegado, quitarRepetidos,
  conjuntoDeTelefonos, pendientesPorTelefono, saludoDe, normalizarFuente,
} = require('../listas');

// Lo que se protege aquí son dos cosas, y las dos le pasan a una persona real:
// que nadie reciba dos veces el mismo mensaje, y que no se le escriba "estás
// invitada" a alguien que ya tiene perfil.

// ── Limpiar el nombre ───────────────────────────────────────────────────────

test('quita la basura de codificación que trae la lista', () => {
  // Los dos casos reales del archivo de Ettos. El '?' es lo que quedó de un
  // emoji que no sobrevivió a la exportación.
  assert.strictEqual(limpiarNombre('ali?trujillo 002'), 'alitrujillo 002');
  assert.strictEqual(limpiarNombre('emakeup?cools'), 'emakeupcools');
});

test('un salto de línea en el nombre no viaja a Meta', () => {
  // Meta rechaza el envío entero si un parámetro trae un carácter de control.
  assert.strictEqual(limpiarNombre('Sara\nOspina'), 'Sara Ospina');
  assert.strictEqual(limpiarNombre('Ana\t\tMaría'), 'Ana María');
});

test('un nombre normal no se toca', () => {
  assert.strictEqual(limpiarNombre('María José Grisales'), 'María José Grisales');
});

// ── Partir la línea ─────────────────────────────────────────────────────────

test('la tabulación gana sobre la coma: los nombres llevan comas', () => {
  assert.deepStrictEqual(
    separarCampos('Restrepo, Laura\t3164309055'),
    ['Restrepo, Laura', '3164309055'],
  );
});

test('lee el formato real de la lista: @usuario y celular separados por tabulación', () => {
  assert.deepStrictEqual(
    partirLinea('sgreymakeup\t3156886805'),
    { nombre: 'sgreymakeup', telefono: '573156886805' },
  );
});

test('encuentra el teléfono esté en la columna que esté', () => {
  const alDerecho = partirLinea('Sara Ospina\t3164309055');
  const alReves = partirLinea('3164309055\tSara Ospina');
  assert.strictEqual(alDerecho.telefono, '573164309055');
  assert.deepStrictEqual(alDerecho, alReves, 'el orden de las columnas no debería importar');
});

test('acepta punto y coma y coma como separadores', () => {
  assert.strictEqual(partirLinea('Sara Ospina;3164309055').telefono, '573164309055');
  assert.strictEqual(partirLinea('Sara Ospina,3164309055').telefono, '573164309055');
});

test('con una sola columna, el nombre no se pierde', () => {
  // Este es el caso que muerde: normalizarTelefono() borra las letras, así que
  // sin la guarda de SOLO_TELEFONO la celda entera pasaría por un teléfono y
  // el mensaje saldría con "Hola creadora".
  assert.deepStrictEqual(
    partirLinea('Laura Montoya 3164309055'),
    { nombre: 'Laura Montoya', telefono: '573164309055' },
  );
});

test('junta el nombre repartido en varias columnas', () => {
  assert.strictEqual(
    partirLinea('Laura\tMontoya\t3164309055').nombre,
    'Laura Montoya',
  );
});

test('una columna de números que no son celulares no se confunde con el teléfono', () => {
  // '002' es dígitos puros pero no es un celular; el teléfono está en la otra.
  assert.deepStrictEqual(
    partirLinea('trujillo\t002\t3164309055'),
    { nombre: 'trujillo 002', telefono: '573164309055' },
  );
});

test('normaliza los formatos con que la gente escribe su número', () => {
  ['3164309055', '+57 316 430 9055', '573164309055', '316-430-9055', '03164309055']
    .forEach(crudo => {
      assert.strictEqual(
        partirLinea(`Sara\t${crudo}`).telefono, '573164309055',
        `no normalizó ${crudo}`,
      );
    });
});

test('una línea sin celular colombiano no se parte', () => {
  // El número mal digitado que trae la lista de verdad (fila 106).
  assert.strictEqual(partirLinea('Valentina Burgos\t1152471105'), null);
  assert.strictEqual(partirLinea('Nombre\tCelular'), null, 'la fila de encabezado tampoco');
  assert.strictEqual(partirLinea('Sara Ospina'), null);
});

test('no muerde un trozo de un número más largo', () => {
  // Peor que no encontrarlo: mandaría el mensaje a otra persona.
  assert.strictEqual(partirLinea('pedido\t9003164309055123'), null);
});

// ── Leer el pegado entero ───────────────────────────────────────────────────

test('lee un pegado de Excel y reporta lo que descartó, con su línea', () => {
  const pegado = [
    'lauradvega\t3164309055',
    'sgreymakeup\t3156886805',
    'Valentina Burgos\t1152471105',
    '',
    'Sara Ospina\t3146968940',
  ].join('\r\n');

  const r = leerPegado(pegado);

  assert.strictEqual(r.filas.length, 3);
  assert.strictEqual(r.vacias, 1, 'la línea en blanco se cuenta aparte, no como error');
  assert.strictEqual(r.descartadas.length, 1);
  assert.strictEqual(r.descartadas[0].numero, 3, 'debe decir en qué línea estaba');
  assert.match(r.descartadas[0].linea, /Valentina Burgos/, 'y mostrarla tal como venía');
});

test('los saltos de línea de Windows no dejan filas fantasma', () => {
  const r = leerPegado('Sara\t3164309055\r\nAna\t3156886805\r\n');
  assert.strictEqual(r.filas.length, 2);
  assert.strictEqual(r.descartadas.length, 0);
});

test('un pegado vacío no revienta', () => {
  [null, undefined, '', '   '].forEach(v => {
    const r = leerPegado(v);
    assert.strictEqual(r.filas.length, 0);
    assert.strictEqual(r.descartadas.length, 0);
  });
});

// ── Los tres frentes del dedup ──────────────────────────────────────────────

test('el mismo número escrito de tres formas es una sola persona', () => {
  const { unicas, repetidas } = quitarRepetidos([
    { nombre: 'Sara', telefono: '573164309055' },
    { nombre: 'sarita', telefono: '573164309055' },
    { nombre: 'Ana', telefono: '573156886805' },
  ]);
  assert.strictEqual(unicas.length, 2);
  assert.strictEqual(repetidas.length, 1);
  assert.strictEqual(unicas[0].nombre, 'Sara', 'se queda con la primera aparición');
});

test('el conjunto de teléfonos normaliza venga como venga', () => {
  const s = conjuntoDeTelefonos([
    { telefono: '3164309055' },        // como viene de mk_invitaciones
    { whatsapp: '+57 315 688 6805' },  // como viene de mk_creadoras
    '316 493 0055',                    // suelto
    { whatsapp: null },                // el campo es opcional en el registro
    { whatsapp: 'no tiene' },
  ]);
  assert.ok(s.has('573164309055'));
  assert.ok(s.has('573156886805'));
  assert.ok(s.has('573164930055'));
  assert.strictEqual(s.size, 3, 'lo que no es un celular no entra');
});

test('a quien ya tiene perfil no se le escribe, aunque además se le hubiera invitado', () => {
  const filas = [
    { nombre: 'Nueva', telefono: '573001111111' },
    { nombre: 'YaInvitada', telefono: '573002222222' },
    { nombre: 'YaRegistrada', telefono: '573003333333' },
    { nombre: 'Las dos cosas', telefono: '573004444444' },
  ];
  const r = pendientesPorTelefono(
    filas,
    [{ telefono: '300 222 2222' }, { telefono: '3004444444' }],
    // Escrito distinto a propósito: en la base cada una lo puso a su manera.
    [{ whatsapp: '+57 300 333 3333' }, { whatsapp: '573004444444' }],
  );

  assert.deepStrictEqual(r.nuevas.map(f => f.nombre), ['Nueva']);
  assert.deepStrictEqual(r.ya_invitadas.map(f => f.nombre), ['YaInvitada']);
  assert.deepStrictEqual(
    r.ya_registradas.map(f => f.nombre), ['YaRegistrada', 'Las dos cosas'],
    'estar registrada pesa más que estar invitada: es el hecho que decide si se le escribe',
  );
});

test('sin nadie invitado ni registrado, todas son nuevas', () => {
  const filas = [{ telefono: '573001111111' }, { telefono: '573002222222' }];
  assert.strictEqual(pendientesPorTelefono(filas, [], []).nuevas.length, 2);
});

// ── El saludo que ve la persona ─────────────────────────────────────────────

test('el saludo toma la primera palabra del nombre', () => {
  assert.strictEqual(saludoDe('Sara Ospina'), 'Sara');
  assert.strictEqual(saludoDe('  Laura   Montoya  '), 'Laura');
});

test('un @usuario se saluda por su @usuario, sin la arroba', () => {
  assert.strictEqual(saludoDe('sgreymakeup'), 'sgreymakeup');
  assert.strictEqual(saludoDe('@marianalenisc'), 'marianalenisc');
});

test('el saludo nunca queda vacío: Meta rechaza la plantilla si la variable llega en blanco', () => {
  [null, undefined, '', '   ', '@'].forEach(v => {
    assert.strictEqual(saludoDe(v), 'creadora', `falló con ${JSON.stringify(v)}`);
  });
});

// ── El nombre de la lista ───────────────────────────────────────────────────

test('el nombre de la fuente queda comparable', () => {
  assert.strictEqual(normalizarFuente('  Ettos Beauty Market '), 'ettos-beauty-market');
  assert.strictEqual(normalizarFuente(''), '');
  assert.strictEqual(normalizarFuente(null), '');
});
