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
const BLOQUES = [
  {
    clave: 'piezas',
    titulo: 'Tu trabajo',
    peso: 100,
    // Se mide de 0 a 4 porque el catálogo muestra cuatro por creadora: la
    // quinta no cambia lo que la marca ve.
    medir: (p) => Math.min(Number(p.piezas) || 0, 4) / 4,
    porQue: 'Es lo que más pesa. La marca contrata por lo que ve, no por lo que dice el perfil.',
  },
  {
    clave: 'metricas',
    titulo: 'Métricas verificadas',
    peso: 30,
    medir: (p) => (p.metricas_estado === 'verificado' || p.metricas_estado === 'conectado') ? 1 : 0,
    porQue: 'Un perfil verificado se ve distinto en el catálogo. Sin eso, tus números '
          + 'son solo lo que dijiste.',
  },
  {
    clave: 'tarifas',
    titulo: 'Tus precios',
    peso: 20,
    // Dejarlos abiertos a negociación cuenta: es una decisión, no un vacío.
    medir: (p) => (Number(p.tarifas) > 0 || p.tarifa_abierta) ? 1 : 0,
    porQue: 'Sin precio no apareces cuando una marca filtra por presupuesto, '
          + 'que es lo primero que hacen.',
  },
  {
    clave: 'foto',
    titulo: 'Tu foto',
    peso: 12,
    medir: (p) => p.foto_perfil_path ? 1 : 0,
    porQue: 'Es lo primero que ve una marca. Si prefieres no mostrar la cara, sirve una '
          + 'foto de tu trabajo — un espacio en gris no.',
  },
  {
    clave: 'redes',
    titulo: 'Tus redes',
    peso: 10,
    medir: (p) => Number(p.redes) > 0 ? 1 : 0,
    porQue: 'Sin redes declaradas no sales cuando una marca busca por Instagram o TikTok.',
  },
  {
    clave: 'bio',
    titulo: 'Tu descripción',
    peso: 6,
    medir: (p) => p.bio_corta ? 1 : 0,
    porQue: 'Dos líneas contando qué haces. Es lo que te distingue de otra con los mismos números.',
  },
];

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
      avance, completo: avance >= 1,
      // Cuánto sube el círculo si lo termina. Es lo que permite ordenar los
      // pendientes por lo que de verdad le sirve, y no por lo fácil.
      suma: Math.round((1 - avance) * b.peso / PESO_TOTAL * 100),
    };
  });

  const pct = Math.round(
    bloques.reduce((a, b, i) => a + b.avance * BLOQUES[i].peso, 0) / PESO_TOTAL * 100
  );

  return {
    pct,
    completo: pct >= 100,
    bloques,
    // Lo que falta, ordenado por cuánto suma. Nunca incluye lo ya hecho:
    // pedirle una foto a quien ya la subió convierte el consejo en ruido.
    pendientes: bloques.filter(b => !b.completo).sort((a, b) => b.suma - a.suma),
  };
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
  completitud, puntajeDePerfil, nivelDe, logrosDe, desbloqueos,
  BLOQUES, LOGROS, DESBLOQUEOS, NIVELES_POR_DEFECTO, PESO_TOTAL,
};
