// Qué busca cada marca, aprendido de lo que marca con ✓ y con ✕.
//
// El problema que resuelve: la selección curada necesita una línea de "por qué
// ella", y con los datos del perfil solo se puede escribir la ficha en voz alta
// —"trabaja cabello en Medellín, desde $180.000"— que es justo lo que la marca
// ya está viendo. El triage, en cambio, dice algo que la marca NO ve sola: el
// patrón de sus propias decisiones.
//
// Es aritmética, no aprendizaje automático. Se cuenta cuántas veces la marca
// dijo que sí y cuántas que no a cada característica, y de ahí sale una
// afinidad. Se eligió así por tres razones y ninguna es el costo:
//
//   1. Se puede EXPLICAR. "Porque marcaste cuatro perfiles de cabello en
//      Medellín" es una frase que se puede mostrar y que la marca reconoce
//      como cierta. Un vector de un modelo no se puede mostrar.
//   2. Funciona con veinte decisiones. Cualquier cosa que necesite cientos de
//      ejemplos no sirve para el primer mes de una plataforma nueva.
//   3. Se puede auditar cuando se equivoque, que va a pasar.
//
// ⚠️ Tres reglas que este archivo no rompe:
//
//   · Lo aprendido es PRIVADO de cada marca. Que una marca descarte a alguien
//     no la baja para las demás, ni se le dice a nadie. Descartar es ordenar la
//     propia lista, no calificar a una persona.
//   · No existe explicación negativa. Nunca se dice "no te la propusimos
//     porque…" ni se muestra por qué alguien quedó abajo.
//   · Con poca evidencia se dice que no se sabe. Un sistema que finge saber a
//     las tres decisiones enseña a desconfiar de él justo cuando empieza.

/**
 * Cuántas decisiones hacen falta antes de afirmar algo.
 *
 * Por debajo de esto, la selección se ordena por qué tan completo está el
 * perfil —lo que ya hacía— y se dice explícitamente que todavía no se conoce a
 * la marca. Ocho es aproximadamente una pantalla de catálogo triada: pedir
 * menos es adivinar, pedir más deja la función inútil el primer mes.
 */
const MINIMO_PARA_OPINAR = 8;

/**
 * Amortiguador de la afinidad.
 *
 * Sin esto, una característica marcada una sola vez con ✓ daría afinidad 1.0 —
 * la máxima posible— y dominaría el orden con un solo dato. Con k = 2, un ✓
 * solo da 0.33, y hacen falta varios para acercarse a 1.
 */
const AMORTIGUA = 2;

/** Las bandas de tarifa con que se aprende. Un precio exacto nunca se repite. */
const BANDAS = [
  { clave: 'economica', hasta: 200_000,   nombre: 'hasta $200.000' },
  { clave: 'media',     hasta: 500_000,   nombre: 'entre $200.000 y $500.000' },
  { clave: 'alta',      hasta: 1_500_000, nombre: 'entre $500.000 y $1.5M' },
  { clave: 'premium',   hasta: Infinity,  nombre: 'de más de $1.5M' },
];

const bandaDe = (precio) =>
  precio ? BANDAS.find(b => Number(precio) <= b.hasta).clave : null;

/**
 * Las características de una creadora, como pares tipo/valor.
 *
 * Es el único sitio donde se decide de qué se aprende. Deliberadamente NO
 * entra el alias ni el código: aprender de un identificador no generaliza a
 * nadie más, solo memoriza a esa persona.
 */
function rasgosDe(c) {
  const rasgos = [];
  const agregar = (tipo, valor) => {
    if (valor !== null && valor !== undefined && valor !== '') {
      rasgos.push({ tipo, valor: String(valor) });
    }
  };

  (c.nicho || []).forEach(n => agregar('nicho', n));
  // La categoría madre generaliza donde el subnicho no llega: quien marca
  // "rizos" y "coloración" está diciendo belleza, y eso alcanza a perfiles
  // cuyo subnicho exacto la marca nunca vio.
  (c.categorias || []).forEach(x => agregar('categoria', x));
  agregar('ciudad', c.ciudad);

  // La red principal y su nivel, no todas: alguien con Instagram macro y un
  // Kwai vacío no es "una creadora de Kwai", y aprender de la red vacía
  // ensucia el patrón.
  const principal = (c.redes || []).find(r => r.principal) || (c.redes || [])[0];
  if (principal) {
    agregar('red', principal.red);
    agregar('tier', principal.tier);
  }

  agregar('tarifa', bandaDe(c.tarifa_min));

  // Tener historial comprobado sí es un rasgo; NO tenerlo no lo es. Aprender
  // de la ausencia convertiría "es nueva" en una marca negativa que arrastra
  // a todas las que están empezando.
  if (Number(c.cumplimiento?.entregas || 0) > 0) agregar('historial', 'comprobado');

  (c.tarifas || []).forEach(t => agregar('entregable', t.entregable));

  return rasgos;
}

/**
 * Qué tan común es cada rasgo en el catálogo entero.
 *
 * Hace falta para no explicar nada con un rasgo que tiene casi todo el mundo.
 * "Es de belleza" en un catálogo donde nueve de cada diez son de belleza suena
 * a razón y no lo es: no distingue a esta creadora de ninguna otra, y una
 * marca que lee eso aprende a no leer las razones.
 */
function frecuencias(catalogo = []) {
  const f = new Map();
  for (const c of catalogo) {
    // Set: un rasgo repetido dentro del mismo perfil cuenta una vez.
    for (const llave of new Set(rasgosDe(c).map(r => `${r.tipo}:${r.valor}`))) {
      f.set(llave, (f.get(llave) || 0) + 1);
    }
  }
  const total = catalogo.length || 1;
  const prop = new Map();
  for (const [k, n] of f) prop.set(k, n / total);
  return prop;
}

/** Por encima de esto, el rasgo describe al catálogo y no a la creadora. */
const DEMASIADO_COMUN = 0.5;

/**
 * Cuenta síes y noes por rasgo, a partir del triage de UNA marca.
 *
 * @param {Array} decisiones  [{ creadora_id, decision: 'pre'|'desc' }]
 * @param {Array} catalogo    las creadoras, para poder leer sus rasgos
 */
function perfilDeMarca(decisiones = [], catalogo = []) {
  const porId = new Map(catalogo.map(c => [c.id, c]));
  const conteo = new Map();   // "tipo:valor" → { si, no }
  let evaluadas = 0;

  for (const d of decisiones) {
    const c = porId.get(d.creadora_id);
    if (!c) continue;   // ya no está en el catálogo visible
    const lado = d.decision === 'pre' ? 'si' : d.decision === 'desc' ? 'no' : null;
    if (!lado) continue;

    evaluadas++;
    for (const r of rasgosDe(c)) {
      const llave = `${r.tipo}:${r.valor}`;
      const n = conteo.get(llave) || { si: 0, no: 0, tipo: r.tipo, valor: r.valor };
      n[lado]++;
      conteo.set(llave, n);
    }
  }

  // Afinidad en [-1, 1]. Cero es "no sé": ni gusta ni disgusta.
  const afinidad = new Map();
  for (const [llave, n] of conteo) {
    afinidad.set(llave, {
      ...n,
      peso: (n.si - n.no) / (n.si + n.no + AMORTIGUA),
    });
  }

  return {
    evaluadas,
    sabe: evaluadas >= MINIMO_PARA_OPINAR,
    faltan: Math.max(0, MINIMO_PARA_OPINAR - evaluadas),
    afinidad,
  };
}

/**
 * Qué tanto encaja una creadora con lo que la marca ha venido marcando.
 *
 * Devuelve el puntaje y los rasgos que más aportaron, para poder explicarlo.
 * El promedio va sobre los rasgos CON evidencia: si la marca nunca marcó nada
 * de Cartagena, que la creadora sea de Cartagena no debería bajarla — no se
 * sabe nada de eso, y tratar el desconocimiento como rechazo encierra a la
 * marca en lo que ya vio.
 */
function puntuar(creadora, perfil) {
  const aportes = [];
  for (const r of rasgosDe(creadora)) {
    const n = perfil.afinidad.get(`${r.tipo}:${r.valor}`);
    if (n && (n.si + n.no) > 0) aportes.push({ ...r, ...n });
  }
  if (!aportes.length) return { puntaje: 0, aportes: [] };

  const puntaje = aportes.reduce((a, x) => a + x.peso, 0) / aportes.length;
  aportes.sort((a, b) => b.peso - a.peso);
  return { puntaje, aportes };
}

const COMO_SE_DICE = {
  nicho:      (v) => `trabaja ${v.toLowerCase()}`,
  categoria:  (v) => `es de ${v.toLowerCase()}`,
  ciudad:     (v) => `está en ${v}`,
  red:        (v) => `su fuerte es ${v}`,
  tier:       (v) => `es del tamaño que has venido eligiendo (${v})`,
  tarifa:     (v) => `cobra ${(BANDAS.find(b => b.clave === v) || {}).nombre || v}`,
  historial:  ()  => 'ya entregó a tiempo en la plataforma',
  entregable: (v) => `ofrece ${v.toLowerCase()}`,
};

/**
 * La línea de "por qué ella".
 *
 * Habla del comportamiento de la marca, no del perfil: "se parece a las que
 * marcaste" es información nueva; "trabaja cabello en Medellín" es leerle en
 * voz alta lo que ya tiene en pantalla.
 *
 * Es un BORRADOR. La persona que arma la selección lo edita antes de
 * publicarlo — de ahí que el panel lo muestre en un campo de texto y no como
 * texto fijo. El sistema propone; el equipo firma.
 *
 * Solo se nombran rasgos con afinidad positiva y evidencia real. Nunca se
 * menciona lo que la marca descartó: la frase tiene que poder mostrarse tal
 * cual, y "no te gustan las de Bogotá" no es algo que nadie pidió que le
 * dijeran.
 */
function porQueElla(creadora, perfil, { tope = 2, comunes } = {}) {
  if (!perfil.sabe) return null;

  const { aportes } = puntuar(creadora, perfil);
  const buenos = aportes
    .filter(a => a.peso > 0.15 && a.si >= 2)
    // Fuera lo que describe al catálogo en vez de a la creadora.
    .filter(a => !comunes || (comunes.get(`${a.tipo}:${a.valor}`) || 0) <= DEMASIADO_COMUN)
    // Un rasgo por tipo: "trabaja cabello, trabaja rizos, trabaja cuidado
    // capilar" son tres formas de decir lo mismo y gastan toda la frase.
    .filter((a, i, arr) => arr.findIndex(o => o.tipo === a.tipo) === i)
    .slice(0, tope);

  if (!buenos.length) return null;

  const partes = buenos.map(a => (COMO_SE_DICE[a.tipo] || ((v) => v))(a.valor));
  const cuantas = Math.max(...buenos.map(a => a.si));
  const frase = partes.length === 1 ? partes[0] : `${partes[0]} y ${partes[1]}`;

  return `Como las ${cuantas} que preseleccionaste: ${frase}.`;
}

/**
 * Propone una selección para una marca.
 *
 * Es un BORRADOR para que una persona lo revise, no una selección publicada.
 * Esa distinción es el producto entero: la marca recibe "seleccionadas por
 * nuestro equipo" y eso tiene que ser verdad — alguien miró y firmó. Lo que se
 * automatiza es la parte tediosa (encontrar ocho entre doscientas), no el
 * criterio.
 *
 * Sin evidencia suficiente devuelve las más completas y lo dice, en vez de
 * fingir un criterio que no tiene.
 */
function proponerSeleccion({ catalogo = [], decisiones = [], cuantas = 8, queTanCompleto } = {}) {
  const perfil = perfilDeMarca(decisiones, catalogo);
  const comunes = frecuencias(catalogo);
  const yaVistas = new Set(decisiones.map(d => d.creadora_id));

  // No se repiten las que la marca ya triaje: proponerle otra vez una que
  // descartó es no haber escuchado, y una que ya preseleccionó no le agrega
  // nada — ya la tiene.
  const candidatas = catalogo.filter(c => !yaVistas.has(c.id));

  const puntuadas = candidatas.map(c => {
    const { puntaje, aportes } = perfil.sabe
      ? puntuar(c, perfil)
      : { puntaje: 0, aportes: [] };
    const completo = queTanCompleto ? queTanCompleto(c) : 0;
    return { creadora: c, puntaje, aportes, completo };
  });

  // Qué tan completo está el perfil siempre pesa, aunque haya criterio
  // aprendido: proponerle a una marca a alguien sin una sola pieza publicada
  // es hacerle perder el clic, por muy bien que encaje en el papel.
  puntuadas.sort((a, b) => {
    const d = (b.puntaje * 100 + b.completo / 10) - (a.puntaje * 100 + a.completo / 10);
    return d !== 0 ? d : b.completo - a.completo;
  });

  const elegidas = conVariedad(puntuadas, cuantas);

  return {
    sabe: perfil.sabe,
    evaluadas: perfil.evaluadas,
    faltan: perfil.faltan,
    // El panel lo muestra tal cual: quien arma la selección tiene que saber si
    // el sistema está proponiendo con criterio o solo ordenando por completitud.
    nota: perfil.sabe
      ? `Basado en las ${perfil.evaluadas} decisiones de triage de esta marca.`
      : `Todavía no hay criterio aprendido: esta marca ha triado ${perfil.evaluadas} perfiles y hacen falta ${MINIMO_PARA_OPINAR}. Por ahora van los perfiles más completos.`,
    seleccion: elegidas.map(p => ({
      creadora_id: p.creadora.id,
      nombre_publico: p.creadora.nombre_publico,
      codigo: p.creadora.codigo,
      puntaje: Math.round(p.puntaje * 100) / 100,
      razon: porQueElla(p.creadora, perfil, { comunes }),
    })),
  };
}

/**
 * Evita que la selección sean ocho versiones del mismo perfil.
 *
 * Sin esto, una marca que marcó tres de cabello en Medellín recibe ocho de
 * cabello en Medellín y deja de descubrir a alguien por quien valdría la pena
 * pagar. Se admiten hasta tres del mismo nicho; el resto entra igual si no hay
 * con qué llenar, porque devolver cinco cuando se pidieron ocho es peor.
 */
function conVariedad(puntuadas, cuantas, topePorNicho = 3) {
  const elegidas = [];
  const porNicho = new Map();
  const sobrantes = [];

  for (const p of puntuadas) {
    if (elegidas.length >= cuantas) break;
    const nicho = (p.creadora.nicho || [])[0] || '—';
    const n = porNicho.get(nicho) || 0;
    if (n >= topePorNicho) { sobrantes.push(p); continue; }
    porNicho.set(nicho, n + 1);
    elegidas.push(p);
  }

  for (const p of sobrantes) {
    if (elegidas.length >= cuantas) break;
    elegidas.push(p);
  }
  return elegidas;
}

module.exports = {
  perfilDeMarca, puntuar, porQueElla, proponerSeleccion,
  rasgosDe, bandaDe, conVariedad, frecuencias,
  MINIMO_PARA_OPINAR, DEMASIADO_COMUN, BANDAS,
};
