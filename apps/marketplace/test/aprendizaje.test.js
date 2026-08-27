// Pruebas del aprendizaje desde el triage.
//
// Lo que se prueba acá decide a quién ve una marca y qué frase se le muestra
// sobre una persona real. Dos cosas tienen que aguantar sí o sí: que no afirme
// nada con poca evidencia, y que nunca salga una explicación negativa sobre
// una creadora.

process.env.MK_SKIP_CONFIG_CHECK = '1';

const test = require('node:test');
const assert = require('node:assert');

const {
  perfilDeMarca, puntuar, porQueElla, proponerSeleccion,
  rasgosDe, bandaDe, conVariedad, frecuencias, MINIMO_PARA_OPINAR,
} = require('../aprendizaje');

/** Una creadora de mentira, con lo mínimo que el módulo mira. */
const creadora = (id, extra = {}) => ({
  id,
  nombre_publico: 'PERFIL ' + id,
  codigo: 'C-' + id,
  nicho: ['cabello'],
  categorias: ['belleza'],
  ciudad: 'Medellín',
  tarifa_min: 180_000,
  redes: [{ red: 'instagram', tier: 'micro', principal: true }],
  tarifas: [],
  cumplimiento: { entregas: 0 },
  ...extra,
});

const decisiones = (pre = [], desc = []) => [
  ...pre.map(id => ({ creadora_id: id, decision: 'pre' })),
  ...desc.map(id => ({ creadora_id: id, decision: 'desc' })),
];

// ── Rasgos ──────────────────────────────────────────────────────────────────

test('no se aprende del identificador de la creadora', () => {
  // Aprender del alias o el código memoriza a una persona en vez de
  // generalizar a nadie más, y hace que la selección nunca descubra a otra.
  const tipos = rasgosDe(creadora('a')).map(r => r.tipo);
  assert.ok(!tipos.includes('id'));
  assert.ok(!tipos.includes('alias'));
  assert.ok(!tipos.includes('codigo'));
});

test('tener historial es un rasgo; no tenerlo no lo es', () => {
  // Aprender de la ausencia convertiría "es nueva" en una marca negativa que
  // arrastra a todas las que están empezando.
  const con = rasgosDe(creadora('a', { cumplimiento: { entregas: 2 } }));
  const sin = rasgosDe(creadora('b', { cumplimiento: { entregas: 0 } }));
  assert.ok(con.some(r => r.tipo === 'historial'));
  assert.ok(!sin.some(r => r.tipo === 'historial'));
});

test('solo se aprende de la red principal', () => {
  // Alguien con Instagram macro y un Kwai vacío no es "de Kwai".
  const rasgos = rasgosDe(creadora('a', {
    redes: [
      { red: 'instagram', tier: 'macro', principal: true },
      { red: 'kwai', tier: 'ugc' },
    ],
  }));
  const redes = rasgos.filter(r => r.tipo === 'red').map(r => r.valor);
  assert.deepEqual(redes, ['instagram']);
});

test('la tarifa se aprende por banda, no por peso exacto', () => {
  assert.equal(bandaDe(150_000), 'economica');
  assert.equal(bandaDe(200_000), 'economica');
  assert.equal(bandaDe(200_001), 'media');
  assert.equal(bandaDe(9_000_000), 'premium');
  assert.equal(bandaDe(null), null);
});

// ── Cuándo se atreve a opinar ───────────────────────────────────────────────

test('con pocas decisiones dice que no sabe', () => {
  const cat = [1, 2, 3].map(n => creadora(String(n)));
  const p = perfilDeMarca(decisiones(['1', '2'], ['3']), cat);
  assert.equal(p.sabe, false);
  assert.equal(p.evaluadas, 3);
  assert.equal(p.faltan, MINIMO_PARA_OPINAR - 3);
});

test('al llegar al mínimo, opina', () => {
  const ids = Array.from({ length: MINIMO_PARA_OPINAR }, (_, i) => String(i));
  const cat = ids.map(id => creadora(id));
  const p = perfilDeMarca(decisiones(ids), cat);
  assert.equal(p.sabe, true);
  assert.equal(p.faltan, 0);
});

test('una decisión sobre alguien que ya no está en el catálogo se ignora', () => {
  const p = perfilDeMarca(decisiones(['fantasma']), [creadora('a')]);
  assert.equal(p.evaluadas, 0);
});

// ── Afinidad ────────────────────────────────────────────────────────────────

test('un solo ✓ no vuelve absoluta una característica', () => {
  // Sin amortiguar, un ✓ daría afinidad 1.0 y dominaría el orden con un dato.
  const p = perfilDeMarca(decisiones(['a']), [creadora('a')]);
  const peso = p.afinidad.get('ciudad:Medellín').peso;
  assert.ok(peso > 0 && peso < 0.5, `esperaba una afinidad tibia, dio ${peso}`);
});

test('lo marcado con ✕ da afinidad negativa', () => {
  const p = perfilDeMarca(decisiones([], ['a', 'b']), [creadora('a'), creadora('b')]);
  assert.ok(p.afinidad.get('ciudad:Medellín').peso < 0);
});

test('lo que la marca nunca vio no baja a nadie', () => {
  // Tratar el desconocimiento como rechazo encierra a la marca en lo que ya
  // vio y mata el descubrimiento, que es para lo que sirve el catálogo.
  const cat = Array.from({ length: 10 }, (_, i) => creadora(String(i)));
  const p = perfilDeMarca(decisiones(cat.map(c => c.id)), cat);

  // Ajena de verdad: ni el subnicho, ni la categoría madre, ni la ciudad, ni
  // la red, ni la banda de tarifa coinciden con nada que la marca haya visto.
  const forastera = creadora('z', {
    ciudad: 'Cartagena', nicho: ['gaming'], categorias: ['videojuegos'],
    redes: [{ red: 'twitch', tier: 'nano', principal: true }], tarifa_min: 9_000_000,
  });
  assert.equal(puntuar(forastera, p).puntaje, 0);
});

// ── La frase de "por qué ella" ──────────────────────────────────────────────

test('sin criterio aprendido no se inventa una razón', () => {
  const p = perfilDeMarca(decisiones(['a']), [creadora('a')]);
  assert.equal(porQueElla(creadora('b'), p), null);
});

test('la razón habla de lo que la marca marcó, no de la ficha', () => {
  const ids = Array.from({ length: MINIMO_PARA_OPINAR }, (_, i) => String(i));
  const cat = ids.map(id => creadora(id));
  const p = perfilDeMarca(decisiones(ids), cat);

  const razon = porQueElla(creadora('nueva'), p);
  assert.ok(razon, 'debería haber razón con criterio aprendido');
  assert.match(razon, /preseleccionaste/i);
});

test('la razón nunca menciona lo descartado', () => {
  // Tiene que poder mostrarse tal cual a la marca. "No te gustan las de
  // Bogotá" no es algo que nadie pidió que le dijeran.
  const cat = [
    ...Array.from({ length: 6 }, (_, i) => creadora('si' + i)),
    ...Array.from({ length: 6 }, (_, i) => creadora('no' + i, { ciudad: 'Bogotá' })),
  ];
  const p = perfilDeMarca(
    decisiones(cat.slice(0, 6).map(c => c.id), cat.slice(6).map(c => c.id)),
    cat
  );
  const razon = porQueElla(creadora('nueva'), p) || '';
  assert.ok(!/bogotá/i.test(razon), `la razón menciona lo descartado: ${razon}`);
  assert.ok(!/\bno\b|nunca|evita|rechaz/i.test(razon), `la razón suena negativa: ${razon}`);
});

test('no se repite el mismo tipo de rasgo en la frase', () => {
  // "trabaja cabello y trabaja rizos" gasta toda la frase diciendo lo mismo.
  const cat = Array.from({ length: 10 }, (_, i) =>
    creadora(String(i), { nicho: ['cabello', 'rizos', 'cuidado capilar'] }));
  const p = perfilDeMarca(decisiones(cat.map(c => c.id)), cat);
  const razon = porQueElla(creadora('nueva', { nicho: ['cabello', 'rizos'] }), p) || '';
  assert.ok(!/trabaja .* y trabaja/i.test(razon), razon);
});

// ── La selección propuesta ──────────────────────────────────────────────────

test('no se propone a quien la marca ya triajo', () => {
  // Volver a proponer una descartada es no haber escuchado.
  const cat = Array.from({ length: 12 }, (_, i) => creadora(String(i)));
  const r = proponerSeleccion({
    catalogo: cat,
    decisiones: decisiones(['0', '1'], ['2']),
    cuantas: 8,
  });
  const ids = r.seleccion.map(s => s.creadora_id);
  assert.ok(!ids.includes('0'));
  assert.ok(!ids.includes('2'));
});

test('sin criterio aprendido lo dice en la nota', () => {
  const cat = Array.from({ length: 12 }, (_, i) => creadora(String(i)));
  const r = proponerSeleccion({ catalogo: cat, decisiones: [], cuantas: 8 });
  assert.equal(r.sabe, false);
  assert.match(r.nota, /todavía no hay criterio/i);
});

test('con criterio aprendido la nota lo dice y da la cuenta', () => {
  const cat = Array.from({ length: 20 }, (_, i) => creadora(String(i)));
  const r = proponerSeleccion({
    catalogo: cat,
    decisiones: decisiones(cat.slice(0, 10).map(c => c.id)),
    cuantas: 5,
  });
  assert.equal(r.sabe, true);
  assert.match(r.nota, /10 decisiones/);
});

test('devuelve las que se piden, no menos', () => {
  const cat = Array.from({ length: 30 }, (_, i) => creadora(String(i)));
  const r = proponerSeleccion({ catalogo: cat, decisiones: [], cuantas: 8 });
  assert.equal(r.seleccion.length, 8);
});

test('con catálogo corto devuelve lo que hay sin reventar', () => {
  const r = proponerSeleccion({ catalogo: [creadora('a')], decisiones: [], cuantas: 8 });
  assert.equal(r.seleccion.length, 1);
});

// ── Variedad ────────────────────────────────────────────────────────────────

test('no se llena la selección con un solo nicho', () => {
  // Ocho versiones del mismo perfil es dejar de descubrir a alguien por quien
  // valdría la pena pagar.
  const cat = [
    ...Array.from({ length: 10 }, (_, i) => creadora('pelo' + i, { nicho: ['cabello'] })),
    ...Array.from({ length: 10 }, (_, i) => creadora('piel' + i, { nicho: ['skincare'] })),
  ];
  const puntuadas = cat.map(c => ({ creadora: c, puntaje: 0, aportes: [], completo: 0 }));
  const elegidas = conVariedad(puntuadas, 6);
  const dePelo = elegidas.filter(p => p.creadora.nicho[0] === 'cabello').length;
  assert.ok(dePelo <= 3, `${dePelo} de un mismo nicho en 6`);
});

test('si no hay con qué variar, se completa igual', () => {
  // Devolver cinco cuando se pidieron ocho es peor que repetir nicho.
  const cat = Array.from({ length: 10 }, (_, i) => creadora(String(i)));
  const puntuadas = cat.map(c => ({ creadora: c, puntaje: 0, aportes: [], completo: 0 }));
  assert.equal(conVariedad(puntuadas, 8).length, 8);
});

test('no se explica nada con un rasgo que tiene casi todo el catálogo', () => {
  // "Es de belleza" en un catálogo de belleza suena a razón y no distingue a
  // nadie. Una marca que lee eso aprende a no leer las razones.
  const cat = Array.from({ length: 20 }, (_, i) => creadora(String(i)));
  const p = perfilDeMarca(decisiones(cat.slice(0, 10).map(c => c.id)), cat);
  const comunes = frecuencias(cat);

  assert.equal(comunes.get('categoria:belleza'), 1);
  const razon = porQueElla(creadora('nueva'), p, { comunes });
  assert.ok(!razon || !/belleza/i.test(razon), `usó un rasgo universal: ${razon}`);
});

test('un rasgo poco común sí sirve para explicar', () => {
  const cat = [
    ...Array.from({ length: 16 }, (_, i) => creadora('otra' + i, { ciudad: 'Bogotá' })),
    ...Array.from({ length: 4 }, (_, i) => creadora('med' + i, { ciudad: 'Medellín' })),
  ];
  const p = perfilDeMarca(decisiones(
    ['med0', 'med1', 'med2', 'med3', 'otra0', 'otra1', 'otra2', 'otra3']), cat);
  const comunes = frecuencias(cat);
  assert.ok(comunes.get('ciudad:Medellín') < 0.5);
  assert.ok(porQueElla(creadora('n', { ciudad: 'Medellín' }), p, { comunes }));
});
