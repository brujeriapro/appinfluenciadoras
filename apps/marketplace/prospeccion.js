// Motor de prospección: a quién contactar, por dónde, cuándo y cuántas veces.
//
// Funciones puras, sin base de datos ni red, como comisiones.js y canvas.js.
// Acá vive lo que decide si un mensaje sale o no, y equivocarse tiene costos
// que no se deshacen: quemar un número de WhatsApp, que reporten el dominio,
// escribirle tres veces a alguien que ya dijo que no.
//
// ── Lo que este agente NO hace, y por qué ──────────────────────────────────
//
// No manda DMs de Instagram ni de LinkedIn solo. No es una limitación técnica:
// automatizarlos va contra las reglas de esas plataformas y la cuenta que se
// arriesga es la de Brujería Capilar, que es el negocio principal. Para esos
// dos canales el agente investiga, redacta y deja el mensaje en cola; una
// persona aprieta enviar. Todo lo demás sí sale solo.

// ── Estados ────────────────────────────────────────────────────────────────
//
// Un prospecto entra en `nuevo` y sale por uno de tres finales: se volvió
// cliente, dijo que no, o se agotó la cadencia sin responder. Los tres son
// finales legítimos; el que no existe es "quedó ahí".
const ESTADOS = [
  'nuevo',        // recién encontrado, sin investigar
  'investigado',  // ya sabemos quién es y por qué le escribiríamos
  'contactado',   // salió el primer mensaje
  'respondio',    // contestó algo, sea lo que sea
  'reunion',      // hay reunión agendada
  'cliente',      // se registró en la plataforma
  'no_interesa',  // dijo que no, o pidió que no le escribamos
  'agotado',      // se acabó la cadencia sin respuesta
];

const TERMINALES = ['cliente', 'no_interesa', 'agotado'];

/**
 * La cadencia: cuándo toca cada toque, contando desde el primero.
 *
 * Cuatro toques en dos semanas y se acabó. No es timidez: a partir del quinto
 * la tasa de respuesta no sube y la de reportes sí. Y quien no contestó cuatro
 * veces no está ocupado, no le interesa.
 *
 * El día 3 es el que más rinde de todos —la mayoría de las respuestas salen
 * del segundo toque, no del primero— y es justo el que se pierde cuando esto
 * se hace a mano.
 */
const CADENCIA = [
  { toque: 1, dia: 0,  tipo: 'presentacion' },
  { toque: 2, dia: 3,  tipo: 'recordatorio' },
  { toque: 3, dia: 7,  tipo: 'valor' },        // algo útil, no "¿viste mi mensaje?"
  { toque: 4, dia: 14, tipo: 'cierre' },       // el último, y se dice que es el último
];

// Qué puede salir solo y qué necesita una mano humana.
const CANALES = {
  correo:    { automatico: true,  tope_dia: 40 },
  whatsapp:  { automatico: true,  tope_dia: 25 },
  instagram: { automatico: false, tope_dia: 20 },
  linkedin:  { automatico: false, tope_dia: 15 },
};

/** Los canales que el agente puede usar sin que nadie apruebe. */
function canalesAutomaticos() {
  return Object.keys(CANALES).filter(c => CANALES[c].automatico);
}

/**
 * ¿A este prospecto le toca mensaje hoy?
 *
 * Devuelve el toque que corresponde, o null si no toca. Las razones de que no
 * toque importan tanto como el sí, así que van explicadas en `motivo` para que
 * se pueda auditar por qué el agente no le escribió a alguien.
 */
function toqueQueToca(prospecto, hoy = new Date()) {
  const no = (motivo) => ({ toca: false, motivo });

  if (TERMINALES.includes(prospecto.estado)) return no('ya terminó su recorrido');
  if (prospecto.estado === 'respondio')      return no('contestó: lo sigue una persona');
  if (prospecto.estado === 'reunion')        return no('ya hay reunión');
  if (prospecto.estado === 'nuevo')          return no('falta investigarlo');
  if (prospecto.no_contactar)                return no('pidió que no le escribamos');
  if (!prospecto.canal)                      return no('sin canal definido');

  const hechos = Number(prospecto.toques_enviados) || 0;
  const siguiente = CADENCIA.find(c => c.toque === hechos + 1);
  if (!siguiente) return no('se agotó la cadencia');

  // El primero sale apenas está investigado.
  if (hechos === 0) return { toca: true, ...siguiente };

  const primero = prospecto.primer_toque_at ? new Date(prospecto.primer_toque_at) : null;
  if (!primero) return no('falta la fecha del primer toque');

  const dias = Math.floor((hoy - primero) / 86400000);
  if (dias < siguiente.dia) {
    return no(`el toque ${siguiente.toque} es el día ${siguiente.dia}, van ${dias}`);
  }

  return { toca: true, ...siguiente };
}

/**
 * Un prospecto que ya agotó la cadencia sin contestar.
 *
 * Se marca `agotado` y no se borra: dentro de seis meses puede volver a tener
 * sentido escribirle, y saber que ya se le escribió —y qué se le dijo— es lo
 * que evita repetir el mismo mensaje palabra por palabra.
 */
function seAgoto(prospecto, hoy = new Date()) {
  const hechos = Number(prospecto.toques_enviados) || 0;
  if (hechos < CADENCIA.length) return false;
  if (TERMINALES.includes(prospecto.estado)) return false;
  if (['respondio', 'reunion'].includes(prospecto.estado)) return false;

  const ultimo = prospecto.ultimo_toque_at ? new Date(prospecto.ultimo_toque_at) : null;
  if (!ultimo) return false;
  // Se le da una semana de gracia después del último toque antes de cerrarlo.
  return Math.floor((hoy - ultimo) / 86400000) >= 7;
}

/**
 * Arma la tanda del día, respetando los topes de cada canal.
 *
 * Ordena por puntaje: si hay más candidatos que cupo, se escribe primero a los
 * que más pinta tienen. Y devuelve lo que quedó por fuera, porque una tanda que
 * calla lo que no alcanzó a mandar se lee como "no había más".
 */
function tandaDelDia(prospectos = [], { hoy = new Date(), topes = {} } = {}) {
  const cupo = {};
  for (const canal of Object.keys(CANALES)) {
    cupo[canal] = topes[canal] ?? CANALES[canal].tope_dia;
  }

  const candidatos = [];
  for (const p of prospectos) {
    const t = toqueQueToca(p, hoy);
    if (t.toca) candidatos.push({ prospecto: p, ...t });
  }

  // Mayor puntaje primero. A puntaje igual, el que lleva más esperando: quien
  // recibió el primer toque hace nueve días necesita el suyo antes que quien
  // lo recibió ayer.
  candidatos.sort((a, b) => {
    const pa = Number(a.prospecto.puntaje) || 0;
    const pb = Number(b.prospecto.puntaje) || 0;
    if (pa !== pb) return pb - pa;
    const fa = new Date(a.prospecto.ultimo_toque_at || a.prospecto.created_at || 0);
    const fb = new Date(b.prospecto.ultimo_toque_at || b.prospecto.created_at || 0);
    return fa - fb;
  });

  const salen = [];
  const enCola = [];   // canales que necesitan que una persona apriete
  const aplazados = [];

  for (const c of candidatos) {
    const canal = c.prospecto.canal;
    if (!CANALES[canal]) { aplazados.push({ ...c, razon: 'canal desconocido' }); continue; }
    if (cupo[canal] <= 0) { aplazados.push({ ...c, razon: `se llenó el cupo de ${canal}` }); continue; }

    cupo[canal] -= 1;
    if (CANALES[canal].automatico) salen.push(c);
    else                           enCola.push(c);
  }

  return { salen, enCola, aplazados, cupoRestante: cupo };
}

/**
 * Puntaje de un prospecto: qué tan probable es que le sirva.
 *
 * Suma señales, y cada una vale lo que aporta a la decisión. La más pesada de
 * lejos es que una creadora del catálogo ya haya trabajado con esa marca: no
 * es una señal de encaje, es una puerta abierta — se puede llegar presentado
 * en vez de en frío, que es otra conversación completamente distinta.
 */
function puntuar(prospecto = {}) {
  let puntos = 0;
  const porque = [];

  const sumar = (n, razon) => { puntos += n; porque.push(razon); };

  // Vale más que las otras tres juntas, y es a propósito: no es una señal de
  // que encaje, es una puerta abierta. Llegar presentada por alguien que ya
  // trabajó con ellos es otra conversación, no la misma con más puntos.
  if (prospecto.creadora_que_la_conoce) sumar(50, 'una creadora del catálogo ya trabajó con ella');
  if (prospecto.trabaja_con_creadoras)  sumar(18, 'ya trabaja con creadoras: no hay que explicarle el modelo');
  if (prospecto.vende_producto_fisico)  sumar(12, 'vende producto físico, que es lo que se muestra en video');
  if (prospecto.pais === 'CO')          sumar(8,  'está en Colombia');
  if (prospecto.tiene_tienda_online)    sumar(5,  'vende en línea: puede medir lo que pasa');
  if (prospecto.email)                  sumar(3,  'tenemos por dónde escribirle');
  if (prospecto.instagram)              sumar(2,  'tiene Instagram');

  // Restas. Una marca enorme no es mejor prospecto: tiene agencia, procesos y
  // seis meses de ciclo de compra. Las primeras clientas deciden rápido.
  if (prospecto.demasiado_grande) { puntos -= 25; porque.push('muy grande: decide lento y ya tiene agencia'); }
  if (prospecto.no_contactar)     { puntos = 0;   porque.push('pidió que no le escribamos'); }

  return { puntaje: Math.max(0, puntos), porque };
}

/**
 * Lo que una respuesta significa para el estado.
 *
 * Cualquier respuesta saca al prospecto de la cadencia automática. Un agente
 * que sigue mandando recordatorios después de que alguien contestó es la forma
 * más rápida de perder a un cliente que ya estaba interesado.
 */
function alResponder(texto = '') {
  const t = String(texto).toLowerCase()
    // Sin tildes: nadie las pone cuando está molesto.
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Ante la duda, se saca. El costo de sacar a alguien que sí estaba
  // interesado es que vuelva a escribir; el de seguirle escribiendo a quien
  // pidió parar es un reporte de spam, y esos no se deshacen.
  //
  // Ojo con los límites de palabra: `\bno escrib\b` NO capturaba "no
  // escriban", porque una b seguida de vocal no es un límite. Lo encontró la
  // prueba, y es justo el error que no puede pasar.
  const rechaza = [
    /no me interesa/, /no,? gracias/, /no estamos interesad/,
    /no (me |nos )?(vuelvan? a )?escrib/, /dejen? de escrib/, /deja de escrib/,
    /no (me |nos )?contact/, /no (me |nos )?vuelvan?/,
    /dar de baja/, /darme de baja/, /remover/, /eliminar mis datos/,
    /borrar mis datos/, /quitar de la lista/,
    /\bunsubscribe\b/, /\bstop\b/, /\bremove\b/, /\bopt.?out\b/,
  ].some(re => re.test(t));
  if (rechaza) return { estado: 'no_interesa', no_contactar: true };
  return { estado: 'respondio', no_contactar: false };
}

module.exports = {
  ESTADOS, TERMINALES, CADENCIA, CANALES,
  canalesAutomaticos, toqueQueToca, seAgoto, tandaDelDia, puntuar, alResponder,
};
