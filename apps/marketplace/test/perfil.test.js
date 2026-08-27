// Pruebas del perfil de la creadora: completitud, niveles y logros.
//
// Lo que se prueba acá es una promesa: "los perfiles completos reciben más
// solicitudes". Si el círculo le pide algo que el orden del catálogo no premia,
// la promesa es falsa — y una creadora que llena su perfil y no ve diferencia
// no vuelve a llenar nada.

process.env.MK_SKIP_CONFIG_CHECK = '1';

const test = require('node:test');
const assert = require('node:assert');

const {
  completitud, puntajeDePerfil, nivelDe, logrosDe, desbloqueos,
  BLOQUES, NIVELES_POR_DEFECTO,
} = require('../perfil');

const perfil = (extra = {}) => ({
  piezas: 0, redes: 0, tarifas: 0,
  foto_perfil_path: null, bio_corta: null,
  metricas_estado: 'declarado', tarifa_abierta: false,
  ...extra,
});

const lleno = perfil({
  piezas: 4, redes: 2, tarifas: 3,
  foto_perfil_path: 'x.jpg', bio_corta: 'Hago contenido de cabello',
  metricas_estado: 'verificado',
});

// ── Completitud ─────────────────────────────────────────────────────────────

test('un perfil vacío está en cero', () => {
  assert.equal(completitud(perfil()).pct, 0);
});

test('un perfil lleno llega a cien', () => {
  const r = completitud(lleno);
  assert.equal(r.pct, 100);
  assert.equal(r.completo, true);
  assert.equal(r.pendientes.length, 0);
});

test('el trabajo publicado pesa más que todo lo demás junto', () => {
  // La marca contrata por lo que ve. Si esto deja de ser cierto, el consejo
  // que se le da a la creadora deja de servirle.
  const soloPiezas = completitud(perfil({ piezas: 4 }));
  const todoMenosPiezas = completitud(perfil({
    redes: 2, tarifas: 3, foto_perfil_path: 'x.jpg',
    bio_corta: 'algo', metricas_estado: 'verificado',
  }));
  assert.ok(soloPiezas.pct > todoMenosPiezas.pct,
    `piezas ${soloPiezas.pct}% vs todo lo demás ${todoMenosPiezas.pct}%`);
});

test('las piezas suben de a poco, no de golpe', () => {
  // El catálogo muestra cuatro; llegar a dos ya vale algo.
  const uno = completitud(perfil({ piezas: 1 })).pct;
  const dos = completitud(perfil({ piezas: 2 })).pct;
  assert.ok(dos > uno && uno > 0);
});

test('la quinta pieza ya no suma: el catálogo muestra cuatro', () => {
  assert.equal(completitud(perfil({ piezas: 4 })).pct, completitud(perfil({ piezas: 9 })).pct);
});

test('dejar la tarifa abierta cuenta como decisión, no como vacío', () => {
  assert.ok(completitud(perfil({ tarifa_abierta: true })).pct > 0);
});

test('los pendientes van ordenados por lo que de verdad suman', () => {
  // No por lo fácil que sea hacerlos: alguien que sigue el orden tiene que
  // estar gastando su tiempo en lo que más le cambia la posición.
  const p = completitud(perfil());
  const sumas = p.pendientes.map(x => x.suma);
  assert.deepEqual(sumas, [...sumas].sort((a, b) => b - a));
  assert.equal(p.pendientes[0].clave, 'piezas');
});

test('nunca se sugiere algo ya hecho', () => {
  // Pedirle una foto a quien ya la subió convierte el consejo en ruido.
  const p = completitud(perfil({ foto_perfil_path: 'x.jpg' }));
  assert.ok(!p.pendientes.some(x => x.clave === 'foto'));
});

test('cada pendiente explica por qué importa', () => {
  for (const x of completitud(perfil()).pendientes) {
    assert.ok(x.porQue && x.porQue.length > 30, `"${x.clave}" no explica por qué`);
  }
});

test('el puntaje del catálogo y el círculo salen de lo mismo', () => {
  // Es la prueba que sostiene la promesa. Si divergen, subir el círculo deja
  // de subir la posición y le estamos mintiendo a la creadora.
  const a = perfil({ piezas: 2, foto_perfil_path: 'x.jpg' });
  const b = perfil({ piezas: 4, foto_perfil_path: 'x.jpg', metricas_estado: 'verificado' });
  assert.ok(completitud(b).pct > completitud(a).pct);
  assert.ok(puntajeDePerfil(b) > puntajeDePerfil(a));
});

test('valores raros no revientan el cálculo', () => {
  assert.equal(completitud().pct, 0);
  assert.equal(completitud({ piezas: -5 }).pct, 0);
  assert.ok(completitud({ piezas: 'muchas' }).pct >= 0);
});

// ── Niveles ─────────────────────────────────────────────────────────────────

test('quien empieza está en Nueva, sin señal negativa', () => {
  const n = nivelDe({ cumplimiento: { entregas: 0 } });
  assert.equal(n.clave, 'nueva');
  assert.equal(n.cuadros, 1);
  // Ni advertencias ni castigos: solo se destaca lo positivo.
  assert.ok(!/no |falla|incumpl/i.test(n.nombre));
});

test('para subir hay que entregar A TIEMPO, no solo entregar', () => {
  // Si subiera por volumen, premiaría a quien entrega tarde diez veces por
  // encima de quien entregó bien tres.
  const tarde = nivelDe({
    cumplimiento: { entregas: 5, entregas_a_tiempo: 0 }, metricas_estado: 'verificado',
  });
  assert.equal(tarde.clave, 'nueva');
});

test('verificar métricas es requisito para subir', () => {
  const sinVerificar = nivelDe({ cumplimiento: { entregas: 5, entregas_a_tiempo: 5 } });
  assert.equal(sinVerificar.clave, 'nueva');
  const conVerificar = nivelDe({
    cumplimiento: { entregas: 5, entregas_a_tiempo: 5 }, metricas_estado: 'verificado',
  });
  assert.equal(conVerificar.clave, 'confiable');
});

test('dice qué falta para el siguiente nivel', () => {
  const n = nivelDe({
    cumplimiento: { entregas: 1, entregas_a_tiempo: 1 }, metricas_estado: 'verificado',
  });
  assert.equal(n.clave, 'verificada');
  assert.equal(n.siguiente.nombre, 'Confiable');
  assert.equal(n.siguiente.faltan_entregas, 2);
});

test('los cortes se pueden cambiar desde configuración', () => {
  // Con el catálogo recién arrancado casi nadie tiene tratos: exigir diez deja
  // los niveles de arriba vacíos durante meses.
  const bajos = NIVELES_POR_DEFECTO.map(n => ({ ...n, entregas: Math.min(n.entregas, 2) }));
  const n = nivelDe({
    cumplimiento: { entregas: 2, entregas_a_tiempo: 2 }, metricas_estado: 'verificado',
  }, bajos);
  assert.equal(n.clave, 'elite');
});

test('el nivel más alto no promete un siguiente que no existe', () => {
  const n = nivelDe({
    cumplimiento: { entregas: 50, entregas_a_tiempo: 50 }, metricas_estado: 'verificado',
  });
  assert.equal(n.clave, 'elite');
  assert.equal(n.siguiente, null);
});

// ── Logros ──────────────────────────────────────────────────────────────────

test('los logros salen solo de trabajo entregado', () => {
  // Nunca por actividad vacía: un logro por abrir la app no dice nada de nadie
  // y devalúa los que sí cuestan.
  const ninguno = logrosDe({});
  assert.ok(ninguno.every(l => !l.ganado));
});

test('la primera entrega se gana con una', () => {
  const l = logrosDe({ entregas: 1, entregas_a_tiempo: 1 });
  assert.equal(l.find(x => x.clave === 'primera').ganado, true);
});

test('"siempre a tiempo" pide al menos tres', () => {
  // 100% sobre una sola entrega suena a más de lo que es, y un logro que se
  // regala deja de significar algo.
  const una = logrosDe({ entregas: 1, entregas_a_tiempo: 1 });
  assert.equal(una.find(x => x.clave === 'puntual').ganado, false);
  const tres = logrosDe({ entregas: 3, entregas_a_tiempo: 3 });
  assert.equal(tres.find(x => x.clave === 'puntual').ganado, true);
});

test('"siempre a tiempo" se pierde con una tarde', () => {
  const l = logrosDe({ entregas: 4, entregas_a_tiempo: 3 });
  assert.equal(l.find(x => x.clave === 'puntual').ganado, false);
});

test('los no ganados se ven igual, para saber qué se puede lograr', () => {
  const l = logrosDe({ entregas: 1, entregas_a_tiempo: 1 });
  assert.equal(l.length, 4);
  assert.ok(l.every(x => x.nombre && x.texto));
});

// ── Reciprocidad ────────────────────────────────────────────────────────────

test('llenar tarifas abre el comparador de precios', () => {
  const cerrado = desbloqueos(completitud(perfil()));
  assert.equal(cerrado.find(d => d.clave === 'benchmark').abierto, false);

  const abierto = desbloqueos(completitud(perfil({ tarifas: 2 })));
  assert.equal(abierto.find(d => d.clave === 'benchmark').abierto, true);
});

test('lo cerrado dice qué hay que hacer para abrirlo', () => {
  const d = desbloqueos(completitud(perfil())).find(x => x.clave === 'sello');
  assert.equal(d.abierto, false);
  assert.ok(d.falta, 'no dice qué falta');
});

test('el coach queda a la vista pero apagado', () => {
  // La arquitectura lista y el gancho visible, sin construirlo todavía.
  const d = desbloqueos(completitud(lleno)).find(x => x.clave === 'coach');
  assert.equal(d.proximamente, true);
  assert.equal(d.abierto, false);
});
