// De dónde salen las marcas a las que hay que escribirles.
//
// Cuatro motores, ordenados por lo que rinde de verdad y no por lo que suena
// impresionante. El primero vale más que los otros tres juntos.
//
//   1. Las creadoras         · las que ya trabajaron con marcas. Es la mejor
//                              fuente que existe y es gratis: la marca ya
//                              contrata creadoras (probado, no supuesto) y hay
//                              alguien que puede presentarnos.
//   2. El contenido subido   · las 1000 piezas del catálogo tienen productos
//                              con etiqueta visible. Cada etiqueta legible es
//                              una marca que paga por contenido.
//   3. Los multiplicadores   · una maquila de cosméticos tiene entre 50 y 200
//                              marcas pequeñas de cliente. Un solo contacto
//                              bien hecho vale más que cien correos fríos.
//   4. Búsqueda y listas     · lo de siempre, y lo que menos rinde.
//
// ⚠️ Nada de esto rastrea redes sociales de forma automatizada. No es squeamish:
// hacerlo va contra los términos de Instagram y la cuenta en riesgo sería la de
// Brujería Capilar. Lo que sí hacemos es leer datos que ya son nuestros y
// preguntarle a la gente.

const db = require('./db');
const { puntuar } = require('./prospeccion');

/** Normaliza un nombre para comparar: sin tildes, sin S.A.S., sin dobles espacios. */
function clave(nombre = '') {
  return String(nombre).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(s\.?a\.?s\.?|ltda|s\.?a\.?|e\.?u\.?|sas)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Junta prospectos de varias fuentes sin repetir.
 *
 * Dedupe por nombre normalizado y por correo. Importa más de lo que parece:
 * la misma marca puede llegar por una creadora Y por una búsqueda, y
 * escribirle dos veces el mismo día es la forma más rápida de que reporten.
 *
 * Cuando una marca llega por dos caminos se queda con la mejor versión: la que
 * trae creadora que la conoce gana siempre, porque es la que permite llegar
 * presentada.
 */
function fusionar(listas = []) {
  const porClave = new Map();
  const porEmail = new Map();

  for (const p of listas.flat()) {
    if (!p || !p.nombre) continue;
    const k = clave(p.nombre);
    const e = p.email ? String(p.email).toLowerCase().trim() : null;

    const yaEsta = porClave.get(k) || (e ? porEmail.get(e) : null);

    if (!yaEsta) {
      const nuevo = { ...p };
      porClave.set(k, nuevo);
      if (e) porEmail.set(e, nuevo);
      continue;
    }

    // Se completa lo que falte y se prefiere lo que abre puertas.
    for (const campo of ['email', 'telefono', 'instagram', 'sitio_web', 'ciudad', 'categoria', 'razon']) {
      if (!yaEsta[campo] && p[campo]) yaEsta[campo] = p[campo];
    }
    if (p.creadora_id && !yaEsta.creadora_id) {
      yaEsta.creadora_id = p.creadora_id;
      yaEsta.creadora_nombre = p.creadora_nombre;
      yaEsta.creadora_que_la_conoce = true;
      yaEsta.fuente = 'creadora';
    }
  }

  return [...porClave.values()];
}

/** Le pone puntaje y explicación a cada prospecto antes de guardarlo. */
function calificar(prospectos = []) {
  return prospectos.map((p) => {
    const señales = {
      creadora_que_la_conoce: Boolean(p.creadora_id),
      trabaja_con_creadoras: Boolean(p.creadora_id || p.fuente === 'contenido'),
      vende_producto_fisico: p.vende_producto_fisico !== false,
      tiene_tienda_online: Boolean(p.sitio_web),
      pais: p.pais || 'CO',
      email: p.email,
      instagram: p.instagram,
      demasiado_grande: Boolean(p.demasiado_grande),
      no_contactar: Boolean(p.no_contactar),
    };
    const { puntaje, porque } = puntuar(señales);
    return { ...p, puntaje, puntaje_porque: porque };
  });
}

/**
 * Motor 1 · Las marcas que nuestras creadoras ya conocen.
 *
 * Lee lo que las creadoras respondieron cuando les preguntamos con qué marcas
 * han trabajado. Cada una entra con `creadora_id`, que es lo que después
 * permite escribir «Valentina, que ya trabajó con ustedes, está en nuestro
 * catálogo» en vez de un correo frío.
 *
 * Es el motor más valioso y el único que crece solo: cada creadora nueva trae
 * sus marcas.
 */
async function desdeCreadoras() {
  const filas = await db.get('mk_creadora_marcas', {
    select: 'marca_nombre,marca_instagram,marca_sitio,creadora_id,mk_creadoras(nombre_publico)',
  }).catch(() => []);

  return filas.map(f => ({
    nombre: f.marca_nombre,
    instagram: f.marca_instagram || null,
    sitio_web: f.marca_sitio || null,
    creadora_id: f.creadora_id,
    creadora_nombre: f.mk_creadoras?.nombre_publico || null,
    creadora_que_la_conoce: true,
    fuente: 'creadora',
    razon: f.mk_creadoras?.nombre_publico
      ? `${f.mk_creadoras.nombre_publico}, que está en nuestro catálogo, ya trabajó con ustedes y me habló bien de la marca`
      : null,
  }));
}

/**
 * Motor 2 · Las marcas visibles en el contenido que ya tenemos.
 *
 * `mk_analisis_pieza` marca si la etiqueta del producto era legible. Cuando lo
 * es, ahí hay una marca que ya paga por contenido de creadoras — y la creadora
 * que grabó esa pieza está en el catálogo.
 *
 * ⚠️ Hoy el análisis guarda SI la etiqueta era legible, pero no DE QUÉ marca.
 * Para que este motor sirva hay que ampliar el análisis y volver a correrlo.
 * Mientras tanto devuelve vacío en vez de inventar.
 */
async function desdeContenido() {
  const filas = await db.get('mk_analisis_pieza', {
    select: 'creadora_id,marca_detectada,mk_creadoras(nombre_publico)',
    marca_detectada: 'not.is.null',
  }).catch(() => null);

  if (!filas) return [];   // la columna todavía no existe

  return filas.map(f => ({
    nombre: f.marca_detectada,
    creadora_id: f.creadora_id,
    creadora_nombre: f.mk_creadoras?.nombre_publico || null,
    creadora_que_la_conoce: true,
    fuente: 'contenido',
    razon: 'vi que ya han trabajado con creadoras y que el contenido les funciona',
  }));
}

/**
 * Motor 3 · Los multiplicadores.
 *
 * Una maquila de cosméticos como TERA LAB o Nova Makers tiene entre 50 y 200
 * marcas pequeñas de cliente: todas colombianas, todas necesitando contenido,
 * y ninguna con equipo de mercadeo. Lo mismo un evento como Beauty Fest, o una
 * tienda que agrupa marcas.
 *
 * No son prospectos: son puertas. Un solo acuerdo bien hecho trae más marcas
 * que mil correos, y llega con la recomendación de alguien en quien ya confían.
 *
 * Esto NO se automatiza: se guarda como pendiente para que una persona hable
 * con ellos. Automatizar una alianza es la mejor forma de no conseguirla.
 */
const MULTIPLICADORES = [
  { nombre: 'TERA LAB S.A.S.', tipo: 'maquila', nota: 'Ya fabrica para Brujería Capilar: la relación existe y es la puerta más fácil de abrir.' },
  { nombre: 'Nova Makers',     tipo: 'maquila', nota: 'Maquila de cosméticos en Medellín, 13 años. Sus clientes son exactamente el perfil.' },
  { nombre: 'Beauty Fest',     tipo: 'evento',  nota: 'Reúne marcas emergentes de Cali, Pereira, Bogotá y Medellín.' },
  { nombre: 'Ettos Beauty Market', tipo: 'aliado', nota: 'Ya compartió su lista de creadoras: hay relación previa.' },
];

/**
 * Motor 4 · Una lista pegada a mano.
 *
 * El mismo patrón que ya usa `listas.js` para las creadoras: se pega desde
 * Excel, se revisa antes de escribir nada, y luego se importa.
 */
function desdeTexto(texto = '') {
  const filas = String(texto).split('\n').map(l => l.trim()).filter(Boolean);

  return filas.map((linea) => {
    const partes = linea.split(/\t|;|,(?=\s*[a-zA-Z@])/).map(x => x.trim());
    const email = partes.find(x => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(x)) || null;
    const sitio = partes.find(x => /^(https?:\/\/|www\.)/i.test(x)) || null;
    const insta = partes.find(x => /^@/.test(x)) || null;
    // El nombre es lo primero que no sea ninguna de las tres cosas de arriba.
    const nombre = partes.find(x => x && x !== email && x !== sitio && x !== insta) || partes[0];

    return { nombre, email, sitio_web: sitio, instagram: insta, fuente: 'lista' };
  }).filter(p => p.nombre);
}

/**
 * Reúne todo, quita repetidos y califica.
 *
 * Devuelve además de dónde salió cada cosa, porque saber qué fuente rinde es
 * lo que evita seguir gastando esfuerzo en la que no.
 */
async function buscar({ texto = '' } = {}) {
  const [creadoras, contenido] = await Promise.all([
    desdeCreadoras().catch(() => []),
    desdeContenido().catch(() => []),
  ]);
  const lista = desdeTexto(texto);

  const todos = calificar(fusionar([creadoras, contenido, lista]));
  todos.sort((a, b) => b.puntaje - a.puntaje);

  return {
    prospectos: todos,
    porFuente: {
      creadora: creadoras.length,
      contenido: contenido.length,
      lista: lista.length,
      total_sin_repetir: todos.length,
    },
    multiplicadores: MULTIPLICADORES,
  };
}

module.exports = {
  buscar, desdeCreadoras, desdeContenido, desdeTexto,
  fusionar, calificar, clave, MULTIPLICADORES,
};
