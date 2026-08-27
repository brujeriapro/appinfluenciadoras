// Qué tan completo está un perfil, en qué nivel está, y qué se ganó.
//
// Es el único sitio donde se define qué hace bueno a un perfil. Lo usan dos
// consumidores que TIENEN que decir lo mismo:
//
//   · El catálogo, para ordenar.
//   · El portal de la creadora, para mostrarle el círculo y qué le falta.
//
// Si el círculo le pide algo que el orden del catálogo no premia, la promesa
// "los perfiles completos reciben más solicitudes" es mentira. Y si el catálogo
// premia algo que el círculo no nombra, ella no tiene cómo saberlo. Por eso los
// pesos viven acá y no en cada lado.

/**
 * Los bloques que componen un perfil, con su peso.
 *
 * Tener trabajo publicado pesa más que todo lo demás junto, y es a propósito:
 * la marca contrata por lo que ve. Un perfil sin una sola pieza no es un perfil
 * a medias, es un perfil que no sirve.
 */
/**
 * Los bloques que componen un perfil, con su peso y con lo que ELLA gana.
 *
 * La regla de escritura viene del handoff y es lo que hace funcionar la
 * pantalla: ningún bloque vacío dice qué falta, dice **qué gana**. Pedirle
 * datos "para mejorar tu perfil" es pedirle trabajo a cambio de una promesa
 * vaga, y por eso los perfiles quedan a medias en todas las plataformas.
 *
 *   Cómo NO                            Cómo SÍ
 *   "Te faltan tus vistas"             "Las marcas te encuentran por lo que
 *                                       logras, no por seguidores"
 *   "Sube 3 piezas más"                "Cuatro piezas es lo que mira una marca
 *                                       antes de escribirte"
 *
 * El copy vive acá, en el servidor, y no en el navegador: es la pieza que hace
 * funcionar la pantalla y tiene que poder cambiarse sin desplegar la app.
 *
 * `devuelve` ordena los pendientes por lo que más le sirve a ella, que no es lo
 * mismo que lo que más suma al porcentaje. Una lista ordenada por porcentaje se
 * lee como deuda.
 */
const BLOQUES = [
  {
    clave: 'piezas',
    titulo: 'Tu trabajo',
    peso: 100,
    devuelve: 90,
    // Se mide de 0 a 4 porque el catálogo muestra cuatro por creadora: la
    // quinta no cambia lo que la marca ve.
    medir: (p) => Math.min(Number(p.piezas) || 0, 4) / 4,
    beneficio: 'Cuatro piezas es lo que mira una marca antes de escribirte',
    pide: (p) => {
      const faltan = 4 - Math.min(Number(p.piezas) || 0, 4);
      return faltan === 4 ? 'sube tu primera pieza' : `te ${faltan === 1 ? 'falta' : 'faltan'} ${faltan}`;
    },
    accion: 'Subir una pieza',
    porQue: 'Es lo que más pesa. La marca contrata por lo que ve, no por lo que dice el perfil.',
  },
  {
    clave: 'metricas',
    titulo: 'Métricas verificadas',
    peso: 30,
    devuelve: 80,
    medir: (p) => (p.metricas_estado === 'verificado' || p.metricas_estado === 'conectado') ? 1 : 0,
    beneficio: 'Las marcas te encuentran por lo que logras, no por seguidores',
    pide: () => 'pide que verifiquemos tus vistas',
    accion: 'Pedir verificación',
    porQue: 'Un perfil verificado se ve distinto en el catálogo. Sin eso, tus números '
          + 'son solo lo que dijiste.',
  },
  {
    clave: 'tarifas',
    titulo: 'Tus precios',
    peso: 20,
    devuelve: 70,
    // Dejarlos abiertos a negociación cuenta: es una decisión, no un vacío. El
    // copy tiene que decirlo, porque si parece obligatorio poner número, quien
    // no quiere publicarlo abandona el bloque entero.
    medir: (p) => (Number(p.tarifas) > 0 || p.tarifa_abierta) ? 1 : 0,
    beneficio: 'Sin precio, la marca asume el más bajo que ha pagado',
    pide: () => 'carga tus tarifas o déjalas abiertas',
    accion: 'Poner mis tarifas',
    porQue: 'Sin precio no apareces cuando una marca filtra por presupuesto, '
          + 'que es lo primero que hacen.',
  },
  {
    clave: 'foto',
    titulo: 'Tu foto',
    peso: 12,
    devuelve: 40,
    medir: (p) => p.foto_perfil_path ? 1 : 0,
    beneficio: 'Tu cara o tu trabajo: lo primero que ve una marca',
    pide: () => 'sube una foto de perfil',
    accion: 'Subir mi foto',
    porQue: 'Es lo primero que ve una marca. Si prefieres no mostrar la cara, sirve una '
          + 'foto de tu trabajo — un espacio en gris no.',
  },
  {
    clave: 'redes',
    titulo: 'Tus redes',
    peso: 10,
    devuelve: 50,
    medir: (p) => Number(p.redes) > 0 ? 1 : 0,
    beneficio: 'Sales cuando una marca busca por Instagram o TikTok',
    pide: () => 'dinos en qué redes trabajas',
    accion: 'Agregar mis redes',
    porQue: 'Sin redes declaradas no sales cuando una marca busca por Instagram o TikTok.',
  },
  {
    clave: 'bio',
    titulo: 'Tu descripción',
    peso: 6,
    devuelve: 20,
    medir: (p) => p.bio_corta ? 1 : 0,
    beneficio: 'Dos líneas que te separan de otra con los mismos números',
    pide: () => 'escribe tu descripción',
    accion: 'Escribir mi descripción',
    porQue: 'Dos líneas contando qué haces. Es lo que te distingue de otra con los mismos números.',
  },
];

/** Cuántos pendientes se muestran a la vez. Una lista de seis se lee como deuda. */
const MAX_PENDIENTES = 3;

const PESO_TOTAL = BLOQUES.reduce((a, b) => a + b.peso, 0);

/**
 * Qué tan completo está, de 0 a 100, y qué bloque falta.
 *
 * @param {object} p  piezas, redes, tarifas (cuentas), y los campos del perfil
 */
function completitud(p = {}) {
  const bloques = BLOQUES.map(b => {
    const avance = Math.max(0, Math.min(1, b.medir(p) || 0));
    return {
      clave: b.clave, titulo: b.titulo, porQue: b.porQue,
      // El beneficio es el titular; lo que pide va debajo, en secundario; el
      // porcentaje NUNCA es el titular. Ese orden es la pantalla entera.
      beneficio: b.beneficio,
      pide: typeof b.pide === 'function' ? b.pide(p) : b.pide,
      accion: b.accion,
      avance, completo: avance >= 1,
      // Un decimal: cada pieza vale 14,05% y redondear a entero hace que cuatro
      // piezas sumen 56% en un sitio y 56,2% en otro.
      suma: Math.round((1 - avance) * b.peso / PESO_TOTAL * 1000) / 10,
      // Cuánto vale el bloque entero. Va en la respuesta porque la pantalla lo
      // dice en palabras ("es el 56,2% de tu perfil"): escrito a mano en el
      // HTML, cambiar un peso acá haría que ese texto mintiera en silencio.
      peso_pct: Math.round(b.peso / PESO_TOTAL * 1000) / 10,
      devuelve: b.devuelve,
    };
  });

  const pct = Math.round(
    bloques.reduce((a, b, i) => a + b.avance * BLOQUES[i].peso, 0) / PESO_TOTAL * 100
  );

  // Los pendientes se ordenan por lo que MÁS LE DEVUELVE a ella, no por lo que
  // más suma al porcentaje. Ordenado por porcentaje, la lista se lee como
  // deuda; ordenado por beneficio, se lee como oportunidad. Y se cortan en
  // tres: una lista de seis desanima a cualquiera.
  const pendientes = bloques
    .filter(b => !b.completo)
    .sort((a, b) => (b.devuelve - a.devuelve) || (b.suma - a.suma))
    .slice(0, MAX_PENDIENTES);

  return { pct, completo: pct >= 100, bloques, pendientes };
}

/**
 * El estado de la verificación de métricas, con lo que ve ella en cada uno.
 *
 * Son tres y el del medio es el que faltaba. Sin él, ella pide la revisión y
 * no pasa nada visible, así que vuelve a entrar a ver si tiene que hacer algo.
 * Por eso el texto de "en revisión" dice explícitamente que no tiene que hacer
 * nada: esa línea es la mitad del trabajo de ese estado.
 *
 * NO hay estado "rechazada". En este producto no existe señalamiento negativo:
 * si los números no cuadran, vuelve a "sin verificar" con qué reconectar.
 */
function estadoVerificacion({ metricas_estado, metricas_solicitada_at, metricas_captura_path } = {}) {
  if (metricas_estado === 'verificado' || metricas_estado === 'conectado') {
    return { clave: 'verificada', pildora: 'Listo', suma: false };
  }
  if (metricas_estado === 'solicitada') {
    return {
      clave: 'en_revision',
      pildora: 'En revisión',
      // El acento pasa a azul: en todo el sistema el azul es información en
      // curso, así que se lee sin explicarlo.
      acento: 'azul',
      titulo: 'Estamos revisando tus vistas. Te avisamos en menos de 48 horas.',
      pide: 'nada que hacer de tu lado',
      accion: 'Pedida · en revisión',
      bloqueado: true,
      // El porcentaje NO sube al pedir. Si subiera, pedir sería gratis y el
      // sello dejaría de valer.
      suma: false,
      desde: metricas_solicitada_at || null,
    };
  }
  // Sin captura no se puede pedir: el equipo no tendría contra qué comparar, y
  // el endpoint la rechaza. Si el botón dijera igual "pedir verificación",
  // estaría ofreciendo algo que va a fallar — así que dice el paso que sí
  // puede dar. Es la diferencia entre guiarla y hacerla chocar contra un error.
  if (!metricas_captura_path) {
    return {
      clave: 'sin_captura',
      pildora: 'Pendiente',
      suma: false,
      tiene_captura: false,
      pide: 'sube la captura de tus estadísticas',
      accion: 'Subir mi captura',
    };
  }

  return { clave: 'sin_verificar', pildora: 'Pendiente', suma: false, tiene_captura: true };
}

/**
 * El puntaje con que el catálogo ordena.
 *
 * Es la misma medida que el círculo, en su escala cruda. Que salgan de la
 * misma función es lo que garantiza que subir el círculo suba de verdad la
 * posición — que es lo que se le promete a la creadora.
 */
const puntajeDePerfil = (p) =>
  BLOQUES.reduce((a, b) => a + Math.max(0, Math.min(1, b.medir(p) || 0)) * b.peso, 0);

// ── Niveles ─────────────────────────────────────────────────────────────────

/**
 * Los cuatro niveles, y qué hace falta para cada uno.
 *
 * Los cortes son configurables desde admin (`mk_config.niveles_creadora`)
 * porque con el catálogo recién arrancado casi nadie tiene tratos: exigir diez
 * para el nivel más alto deja los dos de arriba vacíos durante meses, y un
 * sistema de niveles donde nadie sube no motiva a nadie.
 *
 * NUNCA hay nivel negativo. Quien está en Nueva simplemente está empezando: no
 * hay advertencia, ni estrellas, ni "no cumplió". Solo se destaca lo positivo.
 */
const NIVELES_POR_DEFECTO = [
  { clave: 'nueva',      nombre: 'Nueva',      entregas: 0,  requiere_metricas: false, cuadros: 1 },
  { clave: 'verificada', nombre: 'Verificada', entregas: 1,  requiere_metricas: true,  cuadros: 2 },
  { clave: 'confiable',  nombre: 'Confiable',  entregas: 3,  requiere_metricas: true,  cuadros: 3 },
  { clave: 'elite',      nombre: 'Elite',      entregas: 10, requiere_metricas: true,  cuadros: 4 },
];

/**
 * En qué nivel está, y qué le falta para el siguiente.
 *
 * Se exige que las entregas sean A TIEMPO para subir: un nivel que sube solo
 * por volumen premiaría a quien entrega tarde diez veces por encima de quien
 * entregó bien tres.
 */
function nivelDe({ cumplimiento = {}, metricas_estado } = {}, niveles = NIVELES_POR_DEFECTO) {
  const aTiempo = Number(cumplimiento.entregas_a_tiempo || 0);
  const verificada = metricas_estado === 'verificado' || metricas_estado === 'conectado';

  const alcanza = (n) => aTiempo >= n.entregas && (!n.requiere_metricas || verificada);

  // Se recorre de mayor a menor y se toma el primero que alcance. Los empates
  // se rompen por el orden en que están declarados —el último es el más alto—
  // porque si dos niveles piden lo mismo, cuál gana no puede quedar al azar
  // del ordenamiento: sería un nivel distinto en cada consulta.
  const conIndice = niveles.map((n, i) => ({ ...n, _i: i }));
  const orden = conIndice.sort((a, b) => (b.entregas - a.entregas) || (b._i - a._i));
  const actual = orden.find(alcanza) || niveles[0];
  const siguiente = [...niveles]
    .sort((a, b) => a.entregas - b.entregas)
    .find(n => n.entregas > actual.entregas || (n.requiere_metricas && !verificada && n.clave !== actual.clave));

  const { _i, ...limpio } = actual;
  return {
    ...limpio,
    siguiente: siguiente ? {
      nombre: siguiente.nombre,
      faltan_entregas: Math.max(0, siguiente.entregas - aTiempo),
      falta_verificar: Boolean(siguiente.requiere_metricas && !verificada),
    } : null,
  };
}

// ── Logros ──────────────────────────────────────────────────────────────────

/**
 * Los logros, y por qué son solo de tratos reales.
 *
 * Nunca por actividad vacía —entrar a la app, editar el perfil, subir una
 * foto—. Un logro por abrir la aplicación no dice nada de nadie y devalúa los
 * que sí cuestan. Todos estos salen de trabajo entregado.
 */
const LOGROS = [
  {
    clave: 'primera',
    nombre: 'Primera entrega',
    texto: 'Entregaste tu primer trabajo por la plataforma.',
    gana: (d) => d.entregas >= 1,
  },
  {
    clave: 'cinco',
    nombre: '5 entregas',
    texto: 'Cinco trabajos entregados.',
    gana: (d) => d.entregas >= 5,
  },
  {
    clave: 'puntual',
    nombre: 'Siempre a tiempo',
    texto: 'Todas tus entregas dentro del plazo.',
    // Tres como mínimo: "100% a tiempo" sobre una sola entrega suena a más de
    // lo que es, y un logro que se regala deja de significar algo.
    gana: (d) => d.entregas >= 3 && d.entregas_a_tiempo === d.entregas,
  },
  {
    clave: 'repitieron',
    nombre: 'Te volvieron a contratar',
    texto: 'Una marca trabajó contigo más de una vez. Es la mejor señal que existe.',
    gana: (d) => d.marcas_que_repitieron >= 1,
  },
];

/** Qué logros tiene, y cuáles están a la vista sin haberse ganado todavía. */
function logrosDe(datos = {}) {
  const d = {
    entregas: Number(datos.entregas || 0),
    entregas_a_tiempo: Number(datos.entregas_a_tiempo || 0),
    marcas_que_repitieron: Number(datos.marcas_que_repitieron || 0),
  };
  return LOGROS.map(l => ({
    clave: l.clave, nombre: l.nombre, texto: l.texto, ganado: Boolean(l.gana(d)),
  }));
}

// ── Reciprocidad ────────────────────────────────────────────────────────────

/**
 * Qué se desbloquea al llenar cada bloque.
 *
 * La idea: cada dato que ella entrega le devuelve algo. Pedirle información
 * "para mejorar su perfil" sin darle nada a cambio es la razón por la que los
 * perfiles quedan a medias en todas las plataformas.
 *
 * El coach de contenido está declarado pero apagado: la arquitectura queda
 * lista y el gancho a la vista, sin construirlo todavía.
 */
const DESBLOQUEOS = [
  {
    clave: 'benchmark',
    requiere: 'tarifas',
    nombre: 'Cómo están tus precios',
    texto: 'Compará tus tarifas contra las de creadoras parecidas a vos.',
  },
  {
    clave: 'sello',
    requiere: 'metricas',
    nombre: 'Sello de verificada',
    texto: 'Tus números dejan de ser "lo que dijiste" y pasan a estar comprobados.',
  },
  {
    clave: 'coach',
    requiere: 'piezas',
    nombre: 'Análisis de tu contenido',
    texto: 'Qué formatos te funcionan mejor, según tus propias piezas.',
    proximamente: true,
  },
];

function desbloqueos(estado) {
  const porClave = new Map(estado.bloques.map(b => [b.clave, b]));
  return DESBLOQUEOS.map(d => ({
    ...d,
    abierto: Boolean(porClave.get(d.requiere)?.completo) && !d.proximamente,
    // Qué tiene que hacer para abrirlo, dicho con el nombre del bloque.
    falta: porClave.get(d.requiere)?.completo ? null : porClave.get(d.requiere)?.titulo,
  }));
}

module.exports = {
  completitud, puntajeDePerfil, nivelDe, logrosDe, desbloqueos, estadoVerificacion,
  BLOQUES, LOGROS, DESBLOQUEOS, NIVELES_POR_DEFECTO, PESO_TOTAL, MAX_PENDIENTES,
};
