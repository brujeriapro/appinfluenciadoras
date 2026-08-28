// Pruebas de la selección curada.
//
// La selección es lo que la marca está comprando: la diferencia con un buscador
// es que una persona revisó y escribió por qué. Todo lo que se prueba acá
// protege eso — que no salga vacía de razones, que no sea una lista larga, y
// que el mensaje diga qué arreglar.

process.env.MK_SKIP_CONFIG_CHECK = '1';

const test = require('node:test');
const assert = require('node:assert');

const {
  normalizarBusqueda, califica, puedeEnviar, tiempoRestante,
  MINIMO, MAXIMO, MAX_RAZON,
} = require('../seleccion');

const conRazon = (n) => Array.from({ length: n }, (_, i) => ({
  creadora_id: 'c' + i, razon: 'Su audiencia es 92% mujeres y ya trabajó con dos marcas.',
}));
const sinRazon = (n) => Array.from({ length: n }, (_, i) => ({ creadora_id: 'x' + i, razon: '' }));

// ── El registro ─────────────────────────────────────────────────────────────

test('"Toda Colombia" no convive con una ciudad específica', () => {
  // Juntas dejan un filtro que nadie sabe interpretar: ¿solo Bogotá, o todo el
  // país? Se resuelve al entrar, no al filtrar.
  const r = normalizarBusqueda({ ciudades: ['Bogotá', 'Toda Colombia'], ultima: 'Bogotá' });
  assert.deepEqual(r.busca_ciudades, ['Bogotá']);

  const r2 = normalizarBusqueda({ ciudades: ['Bogotá', 'Toda Colombia'], ultima: 'Toda Colombia' });
  assert.deepEqual(r2.busca_ciudades, ['Toda Colombia']);
});

test('el texto libre solo se guarda si eligió "Otra cosa"', () => {
  // Si no, queda un dato que nadie va a volver a mirar y confunde a quien arme.
  const con = normalizarBusqueda({ categorias: ['Otra cosa'], otra: 'Velas artesanales' });
  assert.equal(con.busca_otra, 'Velas artesanales');

  const sin = normalizarBusqueda({ categorias: ['Maquillaje'], otra: 'Velas artesanales' });
  assert.equal(sin.busca_otra, null);
});

test('se ignora lo que no está en las listas', () => {
  const r = normalizarBusqueda({
    categorias: ['Maquillaje', 'Criptomonedas'],
    canal: ['telepatía', 'tiktok'], tamano: 'gigante', presupuesto: 77,
  });
  assert.deepEqual(r.busca_categorias, ['Maquillaje']);
  assert.deepEqual(r.busca_canal, ['tiktok']);
  assert.equal(r.busca_tamano, null);
  assert.equal(r.busca_presupuesto, null);
});

test('no se repiten categorías ni ciudades', () => {
  const r = normalizarBusqueda({ categorias: ['Uñas', 'Uñas'], ciudades: ['Bogotá', 'Bogotá'] });
  assert.deepEqual(r.busca_categorias, ['Uñas']);
  assert.deepEqual(r.busca_ciudades, ['Bogotá']);
});

test('un registro vacío no revienta', () => {
  const r = normalizarBusqueda();
  assert.deepEqual(r.busca_categorias, []);
  assert.deepEqual(r.busca_canal, []);
});

// ── Quién califica ──────────────────────────────────────────────────────────

const creadora = (extra = {}) => ({
  nicho: ['maquillaje'], categorias: ['belleza'],
  redes: [{ red: 'instagram', tier: 'micro', principal: true }],
  tarifa_min: 250_000,
  ...extra,
});

test('un dato que falta NO descarta a nadie', () => {
  // Hoy 273 de 299 no tienen vistas y ninguna tiene audiencia conectada. Un
  // filtro estricto dejaría la selección vacía, y faltar el dato es culpa
  // nuestra, no de ella.
  const pelada = { nicho: [], categorias: [], redes: [], tarifa_min: null };
  const r = califica(pelada, {
    busca_categorias: ['Maquillaje'], busca_tamano: 'micro',
    busca_canal: ['tiktok'], busca_presupuesto: 300_000,
  });
  assert.equal(r.califica, true);
});

test('descarta a quien cobra por encima del tope', () => {
  const r = califica(creadora({ tarifa_min: 900_000 }), { busca_presupuesto: 300_000 });
  assert.equal(r.califica, false);
  assert.match(r.motivos.join(), /presupuesto/);
});

test('sin tarifa publicada no se descarta: puede estar abierta a negociar', () => {
  const r = califica(creadora({ tarifa_min: null }), { busca_presupuesto: 300_000 });
  assert.equal(r.califica, true);
});

test('"cualquiera" no filtra por tamaño', () => {
  // Existe porque muchas marcas no saben, y forzarlas a elegir produce un
  // filtro falso.
  const r = califica(creadora({ redes: [{ red: 'instagram', tier: 'macro', principal: true }] }),
    { busca_tamano: 'cualquiera' });
  assert.equal(r.califica, true);
});

test('el tamaño se mide sobre la red principal', () => {
  const r = califica(creadora({ redes: [{ red: 'instagram', tier: 'macro', principal: true }] }),
    { busca_tamano: 'micro' });
  assert.equal(r.califica, false);
});

test('descarta a quien no trabaja el canal pedido', () => {
  const r = califica(creadora(), { busca_canal: ['tiktok'] });
  assert.equal(r.califica, false);
  const ok = califica(creadora(), { busca_canal: ['instagram'] });
  assert.equal(ok.califica, true);
});

test('basta con que sirva para UNO de los canales marcados', () => {
  // Si la marca pide TikTok e Instagram, quien solo hace Instagram le sirve.
  // Exigir las dos dejaría fuera justo a las especialistas.
  const soloInstagram = creadora({ redes: [{ red: 'instagram', principal: true }] });
  assert.equal(califica(soloInstagram, { busca_canal: ['tiktok', 'instagram'] }).califica, true);
});

test('"no publicado" y "otra" no filtran por canal', () => {
  // No hay contra qué cruzarlos. Si filtraran, una marca que marcó solo esos
  // no vería a nadie.
  for (const canal of ['no_publicado', 'otra']) {
    assert.equal(califica(creadora(), { busca_canal: [canal] }).califica, true);
  }
});

test('un canal que no filtra no anula a uno que sí', () => {
  // Marcar "otra" además de TikTok no puede volver el filtro inservible.
  const soloInstagram = creadora({ redes: [{ red: 'instagram', principal: true }] });
  assert.equal(califica(soloInstagram, { busca_canal: ['tiktok', 'otra'] }).califica, false);
});

test('modelaje se cruza contra sus tarifas, no contra sus redes', () => {
  // Es un entregable, no una red: la creadora lo ofrece con precio desde su
  // pantalla de tarifas.
  const conModelaje = creadora({ tarifas: [{ entregable: 'modelaje', precio: 400000 }] });
  const sinModelaje = creadora({ tarifas: [{ entregable: 'reel', precio: 400000 }] });
  assert.equal(califica(conModelaje, { busca_canal: ['modelaje'] }).califica, true);
  assert.equal(califica(sinModelaje, { busca_canal: ['modelaje'] }).califica, false);
});

test('el texto libre del canal solo se guarda si marcó "otra"', () => {
  const con = normalizarBusqueda({ canal: ['otra'], canalOtra: 'Para pauta' });
  assert.equal(con.busca_canal_otra, 'Para pauta');

  const sin = normalizarBusqueda({ canal: ['tiktok'], canalOtra: 'Para pauta' });
  assert.equal(sin.busca_canal_otra, null);
});

test('no se repiten canales', () => {
  const r = normalizarBusqueda({ canal: ['tiktok', 'tiktok', 'youtube'] });
  assert.deepEqual(r.busca_canal, ['tiktok', 'youtube']);
});

test('"Otra cosa" no filtra por nicho', () => {
  // Es texto libre: no hay contra qué cruzarlo.
  const r = califica(creadora({ nicho: ['mascotas'] }), { busca_categorias: ['Otra cosa'] });
  assert.equal(r.califica, true);
});

// ── Cuándo se puede enviar ──────────────────────────────────────────────────

test('con menos del mínimo, dice cuántas faltan', () => {
  const r = puedeEnviar(conRazon(3));
  assert.equal(r.ok, false);
  assert.match(r.boton, /Faltan 3 creadoras/);
});

test('concuerda en singular', () => {
  // Es el botón más visible de la pantalla y la app está en español.
  const r = puedeEnviar(conRazon(MINIMO - 1));
  assert.match(r.boton, /Falta 1 creadora$/);
  assert.match(r.aviso, /Te falta 1 creadora/);

  const conUnaSin = [...conRazon(MINIMO - 1), ...sinRazon(1)];
  const r2 = puedeEnviar(conUnaSin);
  assert.match(r2.boton, /Falta 1 razón$/);
});

test('con más del máximo, dice cuántas quitar', () => {
  const r = puedeEnviar(conRazon(MAXIMO + 1));
  assert.equal(r.ok, false);
  assert.match(r.boton, /Quita 1/);
  assert.match(r.aviso, /deja de ser una selección/);
});

test('el exceso manda sobre las razones que falten', () => {
  // El botón y el aviso tienen que nombrar el MISMO bloqueo: dos mensajes a la
  // vez dejan a quien arma sin saber qué arreglar primero.
  const r = puedeEnviar([...conRazon(MAXIMO), ...sinRazon(2)]);
  assert.match(r.boton, /Quita/);
});

test('sin razones no se envía, y dice por qué importa', () => {
  const r = puedeEnviar([...conRazon(4), ...sinRazon(2)]);
  assert.equal(r.ok, false);
  assert.match(r.boton, /Faltan 2 razones/);
  assert.match(r.aviso, /filtro automático/);
});

test('una razón demasiado larga bloquea', () => {
  const larga = [{ creadora_id: 'a', razon: 'x'.repeat(MAX_RAZON + 1) }, ...conRazon(MINIMO - 1)];
  const r = puedeEnviar(larga);
  assert.equal(r.ok, false);
  assert.match(r.aviso, new RegExp(String(MAX_RAZON)));
});

test('con todo en orden, se envía', () => {
  const r = puedeEnviar(conRazon(MINIMO));
  assert.equal(r.ok, true);
  assert.match(r.boton, /Enviar/);
  assert.match(r.aviso, /correo/);
});

test('una razón en blanco no cuenta como escrita', () => {
  const r = puedeEnviar([...conRazon(MINIMO - 1), { creadora_id: 'z', razon: '   ' }]);
  assert.equal(r.ok, false);
  assert.match(r.boton, /razón/i);
});

// ── El reloj de las 24 horas ────────────────────────────────────────────────

test('cuenta las horas Y los minutos que faltan', () => {
  // Solo la hora entera diría "4 h" cuando faltan 4 h 59 m: casi una hora
  // menos, en la pantalla donde alguien decide si le alcanza el tiempo.
  const r = tiempoRestante(new Date(Date.now() + 5 * 3600_000 - 60_000).toISOString());
  assert.equal(r.vencida, false);
  assert.match(r.texto, /4 h 5\d m/);
});

test('vencida se dice, pero no bloquea', () => {
  // Bloquear el envío por tarde sería castigar a la marca por un retraso
  // nuestro.
  const r = tiempoRestante(new Date(Date.now() - 3 * 3600_000).toISOString());
  assert.equal(r.vencida, true);
  assert.match(r.texto, /vencida/i);
  assert.equal(puedeEnviar(conRazon(MINIMO)).ok, true);
});

test('sin plazo no inventa uno', () => {
  assert.equal(tiempoRestante(null).vencida, false);
});

// ── "Depende" del presupuesto ───────────────────────────────────────────────

test('"depende" se guarda como respuesta válida', () => {
  const { TOPE_DEPENDE } = require('../seleccion');
  const r = normalizarBusqueda({ presupuesto: TOPE_DEPENDE });
  assert.equal(r.busca_presupuesto, TOPE_DEPENDE);
});

test('"depende" NO descarta a nadie por precio', () => {
  // Es la marca diciendo que no tiene un tope, no un tope de cero. Si se
  // tratara como cifra, "tarifa_min > -1" sería cierto siempre y se caería el
  // catálogo entero.
  const { TOPE_DEPENDE } = require('../seleccion');
  const cara = creadora({ tarifa_min: 8_000_000 });
  const r = califica(cara, { busca_presupuesto: TOPE_DEPENDE });
  assert.equal(r.califica, true);
  assert.ok(!r.motivos.join().includes('presupuesto'), r.motivos.join());
});

test('un tope de verdad sigue descartando', () => {
  // La red de seguridad de la prueba de arriba: que "depende" no filtre no
  // puede significar que ningún presupuesto filtre.
  const r = califica(creadora({ tarifa_min: 900_000 }), { busca_presupuesto: 300_000 });
  assert.equal(r.califica, false);
});
