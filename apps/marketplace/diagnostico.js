// El diagnóstico: cinco preguntas que terminan en una receta concreta.
//
// Es una pauta de captación con forma de encuesta. La marca contesta, recibe un
// diagnóstico que reconoce su situación, y deja sus datos para llevárselo.
//
// ── Por qué funciona y por qué podría no funcionar ─────────────────────────
//
// Funciona porque nadie quiere «una plataforma» pero todo el mundo quiere
// saber qué está haciendo mal. La encuesta da algo antes de pedir algo.
//
// Se rompe si los cinco caminos llegan al mismo párrafo. Si el resultado da
// igual lo que contestes, la marca se da cuenta —y con razón— de que era un
// formulario disfrazado. Por eso cada perfil dice algo distinto, con números
// distintos, y NOMBRA el problema que esa marca sí tiene.
//
// Todos terminan en contenido de creadoras porque es lo que vendemos, sí, pero
// la receta cambia: a quien nunca ha probado no se le dice lo mismo que a quien
// probó y le fue mal.
//
// ── Lo que no dice ─────────────────────────────────────────────────────────
//
// No promete ventas, ni múltiplos, ni «millones». Además de que no se puede
// respaldar, Meta rechaza anuncios con promesas de ingresos y una pauta
// rechazada no le sirve a nadie.

/** Las cinco preguntas. El orden importa: va de lo fácil a lo que duele. */
const PREGUNTAS = [
  {
    clave: 'vende',
    pregunta: '¿Qué vende tu marca?',
    ayuda: 'Lo que se pueda mostrar en video cambia toda la estrategia.',
    opciones: [
      { v: 'producto',  t: 'Un producto que se puede tocar', sub: 'Ropa, comida, cosmética, accesorios' },
      { v: 'servicio',  t: 'Un servicio',                    sub: 'Consultoría, salón, taller, salud' },
      { v: 'digital',   t: 'Algo digital',                   sub: 'Cursos, software, suscripciones' },
      { v: 'local',     t: 'Un negocio con local',           sub: 'Restaurante, tienda, gimnasio' },
    ],
  },
  {
    clave: 'canal',
    pregunta: '¿De dónde salen tus clientes hoy?',
    ayuda: 'La respuesta honesta, no la que te gustaría.',
    opciones: [
      { v: 'pauta',     t: 'De la pauta',            sub: 'Pago anuncios en Meta o Google' },
      { v: 'organico',  t: 'De mis redes',           sub: 'Publico y llega gente, sin pagar' },
      { v: 'referidos', t: 'De boca en boca',        sub: 'Me recomiendan entre conocidos' },
      { v: 'no_se',     t: 'La verdad, no sé',       sub: 'Llegan, pero no sé por dónde' },
    ],
  },
  {
    clave: 'creadoras',
    pregunta: '¿Has trabajado con creadoras de contenido?',
    ayuda: '',
    opciones: [
      { v: 'nunca',     t: 'Nunca',                        sub: 'No sé por dónde empezar' },
      { v: 'fallo',     t: 'Probé y no funcionó',          sub: 'Gasté y no vi resultados' },
      { v: 'a_veces',   t: 'De vez en cuando',             sub: 'Sin un plan claro' },
      { v: 'seguido',   t: 'Sí, seguido',                  sub: 'Es parte de lo que hacemos' },
    ],
  },
  {
    clave: 'volumen',
    pregunta: '¿Cuántos videos nuevos de tu marca salen al mes?',
    ayuda: 'Contando todo: los tuyos y los de terceros.',
    opciones: [
      { v: 'casi_nada', t: 'Menos de 4',      sub: 'Uno por semana o menos' },
      { v: 'poco',      t: 'Entre 4 y 12',    sub: 'Publicamos, pero sin ritmo fijo' },
      { v: 'bastante',  t: 'Más de 12',       sub: 'Tenemos una rutina' },
    ],
  },
  {
    clave: 'freno',
    pregunta: '¿Qué es lo que más te frena?',
    ayuda: 'Escoge el que más pesa.',
    opciones: [
      { v: 'a_quien',   t: 'No sé a quién contratar',      sub: 'Hay miles y no sé cuál sirve' },
      { v: 'tiempo',    t: 'No tengo tiempo',              sub: 'Coordinar a varias es un trabajo' },
      { v: 'caro',      t: 'Me parece caro',               sub: 'Lo que cobran no me cuadra' },
      { v: 'que_pedir', t: 'No sé qué pedirles',           sub: 'Ni cómo saber si funcionó' },
    ],
  },
];

/**
 * Los perfiles. Cada uno nombra un problema distinto y da una receta con
 * números concretos.
 *
 * `titulo` tiene que sonar a diagnóstico, no a halago: «vas bien» no hace que
 * nadie deje su correo.
 */
const PERFILES = {
  sin_materia: {
    titulo: 'Tu pauta se está quedando sin material',
    // Las cifras de referencia van por perfil y son del sector, no de la marca:
    // decirle "tú estás en 3 y el que crece está en 25" es un espejo, no una
    // promesa. Todas salen de fuentes citables — nada de múltiplos inventados.
    cifras: [
      { n: '20-30', q: 'piezas al mes que produce una marca que escala su pauta' },
      { n: '+20%', q: 'sube al año lo que cuesta mostrarle tu anuncio a mil personas' },
      { n: '1 de 3', q: 'anuncios que el sistema descarta antes de gastarte plata: por eso necesita opciones' },
    ],
    diagnostico:
      'Estás pagando por anuncios pero produces menos de un video por semana. Hoy Instagram y ' +
      'TikTok deciden a quién mostrarle tu anuncio mirando el video, así que con tres piezas el ' +
      'sistema se queda sin nada con qué probar. Subir el presupuesto sin subir el contenido ' +
      'empeora el resultado en vez de mejorarlo.',
    receta: [
      'Diez creadoras pequeñas grabando el mismo producto, cada una a su manera',
      'Diez versiones distintas del mismo mensaje: eso es lo que el sistema necesita para encontrar a quién le habla',
      'Pones pauta solo detrás de las dos o tres que mejor funcionen',
    ],
    empezar: 'Con diez creadoras al mes tienes de qué alimentar la pauta sin repetirte.',
  },

  eligio_mal: {
    titulo: 'El problema no fue el canal, fue a quién elegiste',
    cifras: [
      { n: '88%', q: 'confía más en una persona que en cualquier anuncio (Nielsen)' },
      { n: '75%', q: 'de las creadoras en Instagram tienen cuentas pequeñas: ahí está la oferta' },
      { n: '48%', q: 'de las marcas dice que su mayor dolor es saber a quién contratar' },
    ],
    diagnostico:
      'Probaste con creadoras y no funcionó. Pasa casi siempre por lo mismo: se elige por número ' +
      'de seguidores, y los seguidores dejaron de decidir quién ve un video. Hoy el contenido se ' +
      'gana su alcance por cuánto lo ven, no por cuánta gente sigue a quien lo hizo. Una creadora ' +
      'de dos mil seguidores puede llegarle a más gente que una de cien mil.',
    receta: [
      'Elige por cómo produce y por si ha cumplido antes, no por el tamaño de su cuenta',
      'Varias pequeñas en vez de una grande: mismo dinero, muchas más versiones',
      'Acuerda desde el principio qué se entrega y para cuándo',
    ],
    empezar: 'Lo que cambia el resultado es el criterio para elegir, no el presupuesto.',
  },

  invisible: {
    titulo: 'Tu producto es bueno, pero casi nadie lo ha visto',
    cifras: [
      { n: '80%', q: 'busca la opinión de otra persona antes de comprar, no la de la marca (Edelman)' },
      { n: '+60%', q: 'subió en cinco años lo que cuesta conseguir un cliente nuevo pagando' },
      { n: '0', q: 'seguidores necesita hoy un video para llegar lejos: el alcance ya no depende de la cuenta' },
    ],
    diagnostico:
      'Vendes de boca en boca o sin saber bien de dónde llegan los clientes, y produces muy poco ' +
      'contenido. Eso significa que tu crecimiento depende de que alguien se acuerde de ' +
      'recomendarte. Es el modelo más frágil que hay: funciona hasta que deja de funcionar, y ' +
      'cuando pasa no hay de dónde agarrarse.',
    receta: [
      'Empieza con cinco creadoras mostrando el producto en uso, no posando con él',
      'Pídeles que cuenten el problema que resuelve, no las características',
      'Con eso ya tienes material propio para redes y para pauta cuando quieras',
    ],
    empezar: 'Cinco videos reales valen más que un mes de publicaciones de producto.',
  },

  escalar: {
    titulo: 'Ya te funciona. El problema es sostenerlo',
    cifras: [
      { n: '171%', q: 'creció en 2025 lo que las marcas gastan trabajando con creadoras' },
      { n: '2 de 3', q: 'marcas movieron para acá plata que antes iba a otros canales' },
      { n: '10+', q: 'horas al mes se van coordinando, persiguiendo entregas y pagando a mano' },
    ],
    diagnostico:
      'Trabajas con creadoras y publicas seguido, así que el modelo ya te sirve. Lo que se te ' +
      'está volviendo cuello de botella es la coordinación: encontrar, negociar, perseguir ' +
      'entregas y pagar a diez personas es un trabajo de tiempo completo que hoy alguien de tu ' +
      'equipo está haciendo a mano.',
    receta: [
      'Un solo sitio donde contratas, pagas y haces seguimiento a todas',
      'El pago protegido: ellas saben que van a cobrar, tú no pagas por lo que no aprobaste',
      'Historial de cumplimiento para no repetir con quien te dejó esperando',
    ],
    empezar: 'No necesitas más creadoras: necesitas dejar de perseguirlas.',
  },

  mostrar: {
    titulo: 'Lo tuyo se vende mostrándolo, y no lo estás mostrando',
    cifras: [
      { n: '88%', q: 'confía más en alguien como ellos que en el anuncio de la marca (Nielsen)' },
      { n: '3 seg', q: 'tienes para que alguien decida si sigue viendo tu video' },
      { n: '20-30', q: 'piezas al mes produce una marca que hoy está creciendo en tu categoría' },
    ],
    diagnostico:
      'Vendes algo que se entiende viéndolo funcionar —una textura, un antes y después, un ' +
      'sabor— y eso no cabe en una foto de producto ni en una descripción. La gente compra ' +
      'cuando ve a alguien parecido a ella usándolo, no cuando lee de qué está hecho.',
    receta: [
      'Creadoras usando el producto de verdad, en su casa, sin producción de estudio',
      'Varias personas distintas: cada una le habla a alguien que no se identifica con las otras',
      'Los videos te sirven en tu perfil, en la ficha de producto y en pauta',
    ],
    empezar: 'Un video de alguien usándolo vende más que diez fotos del empaque.',
  },
};

/**
 * Qué perfil le corresponde a lo que contestó.
 *
 * Las reglas van de la más específica a la más general, y la primera que
 * calza gana. El orden importa: «probé y no funcionó» pesa más que cualquier
 * otra cosa, porque es la objeción que hay que responder antes que nada — si
 * no se la respondes, lo demás no lo lee.
 */
function perfilDe(r = {}) {
  if (r.creadoras === 'fallo') return 'eligio_mal';

  if (r.canal === 'pauta' && (r.volumen === 'casi_nada' || r.volumen === 'poco')) {
    return 'sin_materia';
  }

  if (r.creadoras === 'seguido' || (r.creadoras === 'a_veces' && r.volumen === 'bastante')) {
    return 'escalar';
  }

  if ((r.vende === 'producto' || r.vende === 'local') && r.volumen !== 'bastante') {
    return 'mostrar';
  }

  return 'invisible';
}

/**
 * El diagnóstico completo, listo para pintar.
 *
 * Devuelve además `razon`: una frase escrita con sus propias respuestas, que
 * es exactamente lo que el agente de prospección necesita para escribirle
 * después sin sonar a plantilla. El quiz alimenta la máquina que ya existe.
 */
function diagnosticar(respuestas = {}) {
  const clave = perfilDe(respuestas);
  const perfil = PERFILES[clave];

  const dice = (p, v) => (PREGUNTAS.find(q => q.clave === p)?.opciones || [])
    .find(o => o.v === v)?.t?.toLowerCase();

  const partes = [];
  if (respuestas.canal)    partes.push(`sus clientes llegan ${dice('canal', respuestas.canal)}`);
  if (respuestas.volumen)  partes.push(`publican ${dice('volumen', respuestas.volumen)} videos al mes`);
  if (respuestas.freno)    partes.push(`y lo que más los frena es que ${dice('freno', respuestas.freno)}`);

  return {
    perfil: clave,
    ...perfil,
    razon: partes.length
      ? `contestaron el diagnóstico y dijeron que ${partes.join(', ')}`
      : 'contestaron el diagnóstico en la página',
  };
}

module.exports = { PREGUNTAS, PERFILES, perfilDe, diagnosticar };
