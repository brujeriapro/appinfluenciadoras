// De dónde salen las marcas a las que hay que escribirles.
//
// ⚠️ Esto NO es un buscador de marcas de belleza. El catálogo tiene creadoras
// en las 15 categorías —moda, fitness, comida, hogar, familia, mascotas,
// viajes, tecnología, gaming, finanzas, educación, entretenimiento, movilidad,
// lifestyle y sí, también belleza— y el prospecto sirve igual si vende comida
// para perros o cursos de inglés. Cualquier sesgo hacia belleza acá deja por
// fuera catorce quinceavos del mercado.
//
// Tres motores:
//
//   1. Los multiplicadores · quien ya agrupa muchas marcas pequeñas: maquilas,
//                            ferias, gremios, plataformas de comercio. Un solo
//                            acuerdo trae decenas de marcas y llega con la
//                            recomendación de alguien en quien ya confían.
//   2. Búsqueda por categoría · barrer las 15 categorías, no una.
//   3. Listas pegadas       · lo que ya se hace con las creadoras.
//
// ⚠️ Nada de esto rastrea redes sociales de forma automatizada: va contra los
// términos de Instagram y la cuenta en riesgo sería la de Brujería Capilar.
//
// Y una decisión de María (1-sep-2026): las creadoras NO sugieren marcas. Se
// consideró y se descartó — conseguir clientes no es trabajo de ellas.

const db = require('./db');
const { puntuar } = require('./prospeccion');

/**
 * Las 15 categorías del catálogo. El barrido de prospectos las recorre todas:
 * hay creadoras de mascotas, de gaming y de finanzas esperando trabajo, y sus
 * marcas no van a aparecer buscando cosméticos.
 */
const CATEGORIAS = [
  'belleza', 'moda', 'fitness', 'comida', 'hogar', 'familia', 'mascotas',
  'viajes', 'tecnologia', 'gaming', 'finanzas', 'educacion',
  'entretenimiento', 'movilidad', 'lifestyle',
];

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
 * Dedupe por nombre normalizado y por correo. Importa más de lo que parece: la
 * misma marca puede llegar por el contenido Y por una lista pegada, y
 * escribirle dos veces el mismo día es la forma más rápida de que reporten.
 *
 * Cuando llega por dos caminos se completa lo que falte y se conserva la señal
 * más valiosa: que ya trabaje con creadoras.
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

    // Se completa lo que falte, sin pisar lo que ya había.
    for (const campo of ['email', 'telefono', 'instagram', 'sitio_web', 'ciudad', 'categoria', 'razon']) {
      if (!yaEsta[campo] && p[campo]) yaEsta[campo] = p[campo];
    }
    // Que ya trabaje con creadoras es la señal que más vale: si cualquiera de
    // las dos versiones la trae, se conserva.
    if (p.trabaja_con_creadoras && !yaEsta.trabaja_con_creadoras) {
      yaEsta.trabaja_con_creadoras = true;
      yaEsta.fuente = p.fuente || yaEsta.fuente;
      if (!yaEsta.razon && p.razon) yaEsta.razon = p.razon;
    }
  }

  return [...porClave.values()];
}

/** Le pone puntaje y explicación a cada prospecto antes de guardarlo. */
function calificar(prospectos = []) {
  return prospectos.map((p) => {
    const señales = {
      trabaja_con_creadoras: Boolean(p.trabaja_con_creadoras || p.fuente === 'contenido'),
      vende_producto_fisico: p.vende_producto_fisico !== false,
      categoria: p.categoria,
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
 * Motor 1 · Marcas visibles en el contenido que ya tenemos.
 *
 * `mk_analisis_pieza` marca si la etiqueta del producto era legible. Cuando lo
 * es, ahí hay una marca que YA paga por contenido de creadoras — la señal más
 * fuerte que existe de que el modelo le sirve, y no hay que explicárselo.
 *
 * Vale para cualquier categoría: una etiqueta de comida para perros dice lo
 * mismo que una de skincare.
 *
 * ⚠️ Hoy el análisis guarda SI la etiqueta era legible, pero no DE QUÉ marca.
 * Para que este motor sirva hay que ampliar el análisis y volver a correrlo.
 * Mientras tanto devuelve vacío en vez de inventar nombres.
 */
async function desdeContenido() {
  const filas = await db.get('mk_analisis_pieza', {
    select: 'marca_detectada',
    marca_detectada: 'not.is.null',
  }).catch(() => null);

  if (!filas) return [];   // la columna todavía no existe

  // Una misma marca aparece en muchas piezas; acá interesa la marca, no
  // cuántas veces salió.
  const vistas = new Map();
  for (const f of filas) {
    const k = clave(f.marca_detectada);
    if (!k || vistas.has(k)) continue;
    vistas.set(k, {
      nombre: f.marca_detectada,
      fuente: 'contenido',
      trabaja_con_creadoras: true,
      razon: 'vi que ya trabajan con creadoras y que les está funcionando',
    });
  }
  return [...vistas.values()];
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
  // Belleza — donde la relación ya existe y por eso es la puerta más fácil
  { nombre: 'TERA LAB S.A.S.', categoria: 'belleza', tipo: 'maquila',
    nota: 'Ya fabrica para Brujería Capilar. La relación existe: es la llamada más fácil de todas.' },
  { nombre: 'Ettos Beauty Market', categoria: 'belleza', tipo: 'aliado',
    nota: 'Ya compartió su lista de creadoras. Hay relación previa.' },

  // Transversales — sirven para las 15 categorías, no para una
  { nombre: 'Cámara de Comercio de Medellín', categoria: 'todas', tipo: 'gremio',
    nota: 'Programas de emprendimiento con cientos de marcas pequeñas de todo tipo.' },
  { nombre: 'Agencias de comercio electrónico (socios de Shopify en Colombia)', categoria: 'todas', tipo: 'agencia',
    nota: 'Cada una maneja entre 10 y 50 tiendas. Les resuelve un problema que sus clientes les piden y ellas no saben resolver.' },
  { nombre: 'Ferias de emprendimiento y mercados de diseño', categoria: 'todas', tipo: 'evento',
    nota: 'Un fin de semana concentra decenas de marcas de moda, hogar, comida y accesorios.' },
  { nombre: 'Maquilas y fabricantes por contrato', categoria: 'todas', tipo: 'maquila',
    nota: 'Alimentos, suplementos, cosmética, textil: cada fábrica tiene entre 50 y 200 marcas de cliente.' },
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
  const contenido = await desdeContenido().catch(() => []);
  const lista = desdeTexto(texto);

  const todos = calificar(fusionar([contenido, lista]));
  todos.sort((a, b) => b.puntaje - a.puntaje);

  return {
    prospectos: todos,
    porFuente: {
      contenido: contenido.length,
      lista: lista.length,
      total_sin_repetir: todos.length,
    },
    multiplicadores: MULTIPLICADORES,
  };
}

module.exports = {
  buscar, desdeContenido, desdeTexto,
  fusionar, calificar, clave, MULTIPLICADORES, CATEGORIAS,
};
