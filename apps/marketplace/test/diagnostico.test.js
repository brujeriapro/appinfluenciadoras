// El diagnóstico de la pauta de captación.
//
// Lo que se vigila: que los cinco caminos NO lleguen al mismo sitio. Si el
// resultado da igual lo que contestes, la marca se da cuenta —con razón— de
// que era un formulario disfrazado, y ahí se pierde la confianza y el correo.

process.env.MK_SKIP_CONFIG_CHECK = '1';

const test = require('node:test');
const assert = require('node:assert');
const d = require('../diagnostico');

test('son cinco preguntas y todas tienen opciones', () => {
  assert.equal(d.PREGUNTAS.length, 5);
  for (const q of d.PREGUNTAS) {
    assert.ok(q.opciones.length >= 3, `${q.clave} tiene muy pocas opciones`);
    assert.ok(q.pregunta && q.clave);
  }
});

test('"probé y no funcionó" manda sobre todo lo demás', () => {
  // Es la objeción que hay que responder antes que nada: si no se la
  // respondes, lo demás no lo lee.
  const casos = [
    { creadoras: 'fallo', canal: 'pauta', volumen: 'casi_nada' },
    { creadoras: 'fallo', vende: 'producto', volumen: 'bastante' },
    { creadoras: 'fallo' },
  ];
  for (const c of casos) assert.equal(d.perfilDe(c), 'eligio_mal', JSON.stringify(c));
});

test('quien ya pauta y publica poco es el que se queda sin material', () => {
  assert.equal(d.perfilDe({ canal: 'pauta', volumen: 'casi_nada' }), 'sin_materia');
  assert.equal(d.perfilDe({ canal: 'pauta', volumen: 'poco' }), 'sin_materia');
});

test('quien ya trabaja seguido con creadoras necesita escalar, no empezar', () => {
  assert.equal(d.perfilDe({ creadoras: 'seguido', volumen: 'bastante' }), 'escalar');
});

test('un producto físico sin contenido necesita que lo muestren', () => {
  assert.equal(d.perfilDe({ vende: 'producto', volumen: 'casi_nada' }), 'mostrar');
  assert.equal(d.perfilDe({ vende: 'local', volumen: 'poco' }), 'mostrar');
});

test('sin respuestas todavía da un diagnóstico, no un error', () => {
  const r = d.diagnosticar({});
  assert.ok(r.titulo && r.diagnostico);
});

test('los cinco perfiles dicen cosas distintas', () => {
  // Si dos comparten texto, el diagnóstico es decorativo.
  const titulos = Object.values(d.PERFILES).map(p => p.titulo);
  const textos = Object.values(d.PERFILES).map(p => p.diagnostico);
  assert.equal(new Set(titulos).size, 5);
  assert.equal(new Set(textos).size, 5);
});

test('ningún perfil promete ventas ni múltiplos', () => {
  // Además de que no se puede respaldar, Meta rechaza anuncios con promesas
  // de ingresos, y una pauta rechazada no le sirve a nadie.
  const todo = JSON.stringify(d.PERFILES).toLowerCase();
  for (const prohibido of ['millones', 'x más', 'duplica', 'triplica', 'garantiz', '% más ventas']) {
    assert.ok(!todo.includes(prohibido), `dice "${prohibido}"`);
  }
});

test('cada perfil trae una receta con pasos concretos', () => {
  for (const [clave, p] of Object.entries(d.PERFILES)) {
    assert.ok(p.receta.length >= 3, `${clave} tiene una receta muy corta`);
    assert.ok(p.empezar, `${clave} no dice por dónde empezar`);
  }
});

test('la razón se arma con lo que la marca contestó', () => {
  // Es lo que después le permite al agente escribirle sin sonar a plantilla.
  const r = d.diagnosticar({ canal: 'pauta', volumen: 'casi_nada', freno: 'a_quien' });
  assert.match(r.razon, /pauta/);
  assert.match(r.razon, /menos de 4/);
});
