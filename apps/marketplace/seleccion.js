// Las reglas de la selección curada: qué se pregunta, qué califica y cuándo se
// puede enviar.
//
// La selección curada es lo que la marca está comprando. La diferencia entre
// esto y un buscador con filtros es que una persona revisó y escribió por qué.
// Ese es el producto — por eso las razones son obligatorias y por eso el rango
// 6–8 se valida también acá y no solo en la pantalla.
//
// Todo lo de este archivo es puro: recibe estado y devuelve qué pasa. Son las
// reglas que deciden qué ve una marca que está pagando y a qué creadoras se les
// ofrece trabajo, así que tienen que poder probarse con casos concretos.

/** Las quince categorías. "Otra cosa" abre un campo libre. */
const CATEGORIAS = [
  'Cuidado del cabello', 'Skincare y rostro', 'Maquillaje', 'Cuidado corporal',
  'Uñas', 'Perfumería', 'Suplementos y bienestar', 'Comida y bebida',
  'Moda y accesorios', 'Hogar y decoración', 'Servicios y lugares',
  'Tecnología', 'Mascotas', 'Bebés y maternidad', 'Otra cosa',
];

const CANALES = ['tiktok', 'instagram', 'ambas', 'no_publicado'];
const AUDIENCIAS = ['mujeres_18_24', 'mujeres_25_34', 'mujeres_35_mas', 'mixta'];
const CIUDADES = ['Bogotá', 'Medellín', 'Cali y el Pacífico', 'Barranquilla y la costa', 'Toda Colombia'];
const TAMANOS = ['nano', 'micro', 'media', 'cualquiera'];
/**
 * "Depende, tengo campañas de distinto presupuesto."
 *
 * Va como número negativo y no como texto porque `busca_presupuesto` es `int`
 * en la base (mk_045), y migrar el tipo por una opción sería mover una columna
 * que ya usa media aplicación. Es el mismo truco del centinela que ya existe
 * con 999.999.999 para "más de dos millones".
 *
 * ⚠️ Es un valor VÁLIDO pero NO filtra. Si `califica` lo tratara como un tope
 * de verdad, `tarifa_min > -1` sería cierto siempre y descartaría el catálogo
 * entero.
 */
const TOPE_DEPENDE = -1;

const TOPES = [300_000, 900_000, 2_000_000, 999_999_999, TOPE_DEPENDE];

/** Cuántas creadoras lleva una selección. Los dos extremos tienen motivo. */
const MINIMO = 6;   // menos se siente pobre y la marca vuelve al catálogo,
const MAXIMO = 8;   // más deja de ser selección y vuelve a ser una lista
const MAX_RAZON = 140;

/** Lo prometido al terminar el registro, en horas. */
const HORAS_PROMESA = 24;

/**
 * Limpia y valida las respuestas del registro.
 *
 * "Toda Colombia" es mutuamente exclusiva con las ciudades específicas. Sin esa
 * regla se puede quedar en un estado contradictorio —Bogotá + Toda Colombia—
 * que el filtro no sabe interpretar: ¿la quiere solo de Bogotá o de todo el
 * país? Como no hay respuesta, se resuelve al entrar y no al filtrar.
 */
function normalizarBusqueda(datos = {}) {
  const enLista = (v, lista) => lista.includes(v) ? v : null;

  const categorias = [...new Set((datos.categorias || []).filter(c => CATEGORIAS.includes(c)))];

  let ciudades = [...new Set((datos.ciudades || []).filter(c => CIUDADES.includes(c)))];
  // La última elección manda: si marcó "Toda Colombia" queda solo esa; si
  // después marcó una ciudad, "Toda Colombia" se cae.
  if (ciudades.includes('Toda Colombia')) {
    ciudades = ciudades.length > 1 && datos.ultima !== 'Toda Colombia'
      ? ciudades.filter(c => c !== 'Toda Colombia')
      : ['Toda Colombia'];
  }

  return {
    busca_categorias: categorias,
    // El texto libre solo tiene sentido si eligió "Otra cosa"; si no, guardarlo
    // deja un dato que nadie va a volver a mirar y confunde a quien arme.
    busca_otra: categorias.includes('Otra cosa')
      ? String(datos.otra || '').trim().slice(0, 120) || null
      : null,
    busca_canal: enLista(datos.canal, CANALES),
    busca_audiencia: enLista(datos.audiencia, AUDIENCIAS),
    busca_ciudades: ciudades,
    busca_tamano: enLista(datos.tamano, TAMANOS),
    busca_presupuesto: TOPES.includes(Number(datos.presupuesto)) ? Number(datos.presupuesto) : null,
  };
}

/**
 * ¿Esta creadora califica para lo que la marca pidió?
 *
 * Cada filtro que no se puede evaluar NO descarta. Es deliberado: hoy 273 de
 * 299 creadoras no tienen vistas cargadas y ninguna tiene audiencia conectada,
 * así que un filtro estricto dejaría la selección vacía y el equipo sin nada
 * que armar. Faltar un dato es culpa nuestra, no de ella.
 */
function califica(creadora, busca = {}) {
  const motivos = [];

  // Categoría: se cruza contra sus nichos y su categoría madre.
  const cats = (busca.busca_categorias || []).filter(c => c !== 'Otra cosa');
  if (cats.length) {
    const suyo = [...(creadora.nicho || []), ...(creadora.categorias || [])]
      .join(' ').toLowerCase();
    const pega = cats.some(c => {
      const palabras = c.toLowerCase().split(/\s+y\s+|\s+/).filter(p => p.length > 3);
      return palabras.some(p => suyo.includes(p));
    });
    if (!pega && suyo) motivos.push('otro nicho');
  }

  // Tamaño: contra el tier de su red principal.
  if (busca.busca_tamano && busca.busca_tamano !== 'cualquiera') {
    const principal = (creadora.redes || []).find(r => r.principal) || (creadora.redes || [])[0];
    if (principal?.tier && principal.tier !== busca.busca_tamano) motivos.push('otro tamaño');
  }

  // Canal: que trabaje la red que la marca quiere.
  if (busca.busca_canal && !['ambas', 'no_publicado'].includes(busca.busca_canal)) {
    const redes = (creadora.redes || []).map(r => r.red);
    if (redes.length && !redes.includes(busca.busca_canal)) motivos.push('no trabaja ese canal');
  }

  // Presupuesto: contra su tarifa más baja publicada. Sin tarifa NO se descarta
  // —puede estar abierta a negociar— pero se anota para que quien arme lo sepa.
  // "Depende" no es un tope: es la marca diciendo que no tiene uno. Se guarda
  // —le sirve a quien arma la selección— pero no descarta a nadie, igual que
  // "cualquiera" en el tamaño.
  if (busca.busca_presupuesto !== TOPE_DEPENDE && busca.busca_presupuesto && creadora.tarifa_min) {
    if (Number(creadora.tarifa_min) > Number(busca.busca_presupuesto)) {
      motivos.push('sobre el presupuesto');
    }
  }

  return { califica: motivos.length === 0, motivos };
}

/**
 * ¿Se puede enviar esta selección?
 *
 * Devuelve UN solo bloqueo, el más importante, porque el botón y el aviso
 * tienen que nombrar el mismo: dos mensajes distintos a la vez dejan a quien
 * arma sin saber qué arreglar primero.
 *
 * La concordancia en singular importa más de lo que parece — "FALTA 1 RAZÓN",
 * no "FALTAN 1 RAZONES". Es el botón más visible de la pantalla y está en
 * español.
 */
function puedeEnviar(items = []) {
  const n = items.length;
  const plural = (cuantos, uno, varios) => cuantos === 1 ? uno : varios;

  if (n > MAXIMO) {
    const sobran = n - MAXIMO;
    return {
      ok: false,
      boton: `Quita ${sobran}`,
      aviso: `Son ${n} elegidas. Más de ${MAXIMO} deja de ser una selección: `
           + `quita ${sobran} para poder enviar.`,
    };
  }

  const sinRazon = items.filter(i => !String(i.razon || '').trim()).length;

  if (n < MINIMO) {
    const faltan = MINIMO - n;
    return {
      ok: false,
      boton: `${plural(faltan, 'Falta', 'Faltan')} ${faltan} ${plural(faltan, 'creadora', 'creadoras')}`,
      aviso: `Te ${plural(faltan, 'falta', 'faltan')} ${faltan} `
           + `${plural(faltan, 'creadora', 'creadoras')} para el mínimo de ${MINIMO}`
           + (sinRazon ? `, y ${plural(sinRazon, 'falta', 'faltan')} ${sinRazon} `
                       + `${plural(sinRazon, 'razón', 'razones')} por escribir.` : '.'),
    };
  }

  if (sinRazon) {
    return {
      ok: false,
      boton: `${plural(sinRazon, 'Falta', 'Faltan')} ${sinRazon} ${plural(sinRazon, 'razón', 'razones')}`,
      aviso: `${plural(sinRazon, 'Falta', 'Faltan')} ${sinRazon} `
           + `${plural(sinRazon, 'razón', 'razones')} por escribir. Sin `
           + `${plural(sinRazon, 'ella', 'ellas')} la selección se ve igual que un filtro automático.`,
    };
  }

  const largas = items.filter(i => String(i.razon).trim().length > MAX_RAZON);
  if (largas.length) {
    return {
      ok: false,
      boton: 'Hay razones muy largas',
      aviso: `${largas.length} ${plural(largas.length, 'razón pasa', 'razones pasan')} `
           + `de ${MAX_RAZON} caracteres.`,
    };
  }

  return {
    ok: true,
    boton: 'Enviar la selección →',
    aviso: 'Al enviar, la marca recibe un correo y las ve en su home con tu razón '
         + 'bajo cada una.',
  };
}

/**
 * Cuánto queda de las 24 horas prometidas.
 *
 * Vencida no significa que no se pueda enviar: significa que ya se incumplió y
 * hay que verlo. Bloquear el envío por tarde sería castigar a la marca por un
 * retraso nuestro.
 */
function tiempoRestante(vence_at, ahora = new Date()) {
  if (!vence_at) return { texto: 'Sin plazo', vencida: false, horas: null };
  const ms = new Date(vence_at) - ahora;
  if (ms <= 0) {
    const h = Math.floor(-ms / 3600_000);
    return { texto: h < 1 ? 'Vencida' : `Vencida hace ${h} h`, vencida: true, horas: 0 };
  }
  // Horas Y minutos, como la cuenta regresiva de las campañas. Solo la hora
  // entera diría "4 h" cuando faltan 4 h 59 m: casi una hora menos de la que
  // hay, en la pantalla donde alguien decide si le alcanza el tiempo.
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60000);
  return {
    texto: h >= 1 ? `Vence en ${h} h ${m} m` : `Vence en ${m} min`,
    vencida: false,
    horas: h,
  };
}

/** Los tres esqueletos que se insertan. No escriben la razón: obligan a completarla. */
const ATAJOS = [
  'Su audiencia es __% mujeres y ',
  'Ya trabajó con __ marcas de ',
  'Entrega en __ días, ',
];

module.exports = {
  normalizarBusqueda, califica, puedeEnviar, tiempoRestante,
  CATEGORIAS, CANALES, AUDIENCIAS, CIUDADES, TAMANOS, TOPES, TOPE_DEPENDE, ATAJOS,
  MINIMO, MAXIMO, MAX_RAZON, HORAS_PROMESA,
};
