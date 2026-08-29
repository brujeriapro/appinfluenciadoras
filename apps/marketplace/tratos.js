// Máquina de estados del trato.
//
// TODA escritura de `mk_tratos.estado` pasa por aquí. Ningún router modifica el
// estado directamente: si lo hiciera, se saltaría el historial de eventos, las
// guardas de pago y la revelación de contacto.
//
// El ciclo feliz es:
//   solicitado -> aceptado -> pago_retenido -> entregado -> aprobado -> pagado -> cerrado
// y en cualquier punto temprano puede desviarse a rechazado o cancelado.

const db = require('./db');
const { calcularTrato, calcularCanje } = require('./comisiones');

const ESTADOS = [
  'solicitado', 'aceptado', 'pago_retenido', 'entregado',
  'aprobado', 'pagado', 'cerrado', 'rechazado', 'cancelado',
];

// Etiquetas para la interfaz — el vocabulario que ve la usuaria, en un solo lugar.
const ETIQUETAS = {
  solicitado:    'Solicitado',
  aceptado:      'Aceptado, pendiente de pago',
  pago_retenido: 'Pago retenido',
  entregado:     'Contenido entregado',
  aprobado:      'Aprobado',
  pagado:        'Pagado a la creadora',
  cerrado:       'Cerrado',
  rechazado:     'Rechazado',
  cancelado:     'Cancelado',
};

// Los 7 estados del camino feliz, en orden, para dibujar la línea de tiempo.
const LINEA_TIEMPO = ['solicitado', 'aceptado', 'pago_retenido', 'entregado', 'aprobado', 'pagado', 'cerrado'];

// Grafo de transiciones como DATO, no como una cadena de ifs repartidos por los
// routers. Cada entrada dice a qué estados se puede ir y quién puede hacerlo.
const TRANSICIONES = {
  solicitado: {
    aceptado:  ['creadora'],
    rechazado: ['creadora'],
    // 'sistema' cierra las propuestas que la creadora nunca contestó. El portal
    // le promete a la marca que tiene respuesta en 72 horas; sin esto la
    // propuesta se queda ahí para siempre y la promesa es falsa.
    // No hay dinero en juego todavía: el pago ocurre después de aceptar.
    cancelado: ['marca', 'admin', 'sistema'],
  },
  aceptado: {
    pago_retenido: ['admin'],           // solo admin, al confirmar la transferencia
    cancelado:     ['marca', 'admin'],
  },
  pago_retenido: {
    entregado: ['creadora'],
    cancelado: ['admin'],               // devolver la plata es decisión de admin
  },
  entregado: {
    // 'sistema' solo entra aquí con auto_aprobar_entrega encendido: aprobar
    // libera el dinero de la creadora, y eso no puede pasar por descuido de
    // configuración. Ver plazos.js.
    aprobado:      ['marca', 'admin', 'sistema'],
    pago_retenido: ['marca', 'admin'],  // pedir cambios: vuelve un paso atrás
  },
  aprobado: {
    pagado: ['admin'],
    // Solo para canjes: no hay plata que girarle, así que "pagado" no aplica y
    // el trato se quedaría atascado en "aprobado" para siempre. La guarda de
    // aplicarTransicion es la que impide que un trato en dinero use esta
    // salida para saltarse el pago a la creadora.
    cerrado: ['admin'],
  },
  pagado: {
    cerrado: ['admin', 'sistema'],
  },
  cerrado:   {},
  rechazado: {},
  cancelado: {},
};

// Qué fecha se sella al entrar a cada estado.
const CAMPO_FECHA = {
  aceptado:      'fecha_respuesta',
  rechazado:     'fecha_respuesta',
  pago_retenido: 'fecha_pago_marca',
  entregado:     'fecha_entrega',
  aprobado:      'fecha_aprobacion',
  pagado:        'fecha_pago_creadora',
  cerrado:       'fecha_cierre',
};

class TransicionInvalida extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'TransicionInvalida';
    this.status = 409;   // conflicto de estado, no error del servidor
  }
}

/** ¿Existe la transición y el actor tiene permiso para ejecutarla? */
function puedeTransicionar(estadoActual, estadoNuevo, actor) {
  const salidas = TRANSICIONES[estadoActual];
  if (!salidas) return false;
  const actores = salidas[estadoNuevo];
  if (!actores) return false;
  return actores.includes(actor);
}

/**
 * Estados a los que un actor puede llevar el trato desde donde está.
 *
 * Recibe el tipo de pago porque hay dos salidas que dependen de él: un canje se
 * cierra desde "aprobado" y un trato en dinero pasa por "pagado". Ofrecer las
 * dos en el panel sería ofrecer un botón que la guarda va a rechazar.
 */
function transicionesDisponibles(estadoActual, actor, tipo_pago = 'dinero') {
  const esCanje = tipo_pago === 'canje';
  const salidas = TRANSICIONES[estadoActual] || {};
  return Object.entries(salidas)
    .filter(([, actores]) => actores.includes(actor))
    .filter(([estado]) => {
      if (estadoActual !== 'aprobado') return true;
      return esCanje ? estado !== 'pagado' : estado !== 'cerrado';
    })
    .map(([estado]) => estado);
}

/** Un trato deja de estar vivo cuando llega a un estado terminal. */
function esTerminal(estado) {
  return ['cerrado', 'rechazado', 'cancelado'].includes(estado);
}

/**
 * Aplica una transición: valida, verifica las guardas de dinero, escribe el
 * nuevo estado, sella la fecha, revela el contacto si corresponde y deja el
 * evento en el historial.
 *
 * @param {object} trato        Fila completa de mk_tratos
 * @param {string} estadoNuevo
 * @param {string} actor        marca | creadora | admin | sistema
 * @param {object} [datos]      { actor_id, nota, motivo_rechazo, motivo_cancelacion }
 */
async function aplicarTransicion(trato, estadoNuevo, actor, datos = {}) {
  const estadoActual = trato.estado;

  if (!ESTADOS.includes(estadoNuevo)) {
    throw new TransicionInvalida(`Estado desconocido: ${estadoNuevo}`);
  }
  if (estadoActual === estadoNuevo) {
    throw new TransicionInvalida(`El trato ya está en estado "${estadoActual}"`);
  }
  if (!puedeTransicionar(estadoActual, estadoNuevo, actor)) {
    throw new TransicionInvalida(
      `No se puede pasar de "${estadoActual}" a "${estadoNuevo}" como ${actor}`
    );
  }

  // Guardas de dinero: el estado no puede adelantarse al movimiento real de plata.
  if (estadoNuevo === 'pago_retenido' && estadoActual === 'aceptado') {
    const pagos = await db.getPagosDeTrato(trato.id);
    if (!pagos.some(p => p.direccion === 'entrada')) {
      throw new TransicionInvalida(
        'Falta registrar el pago de la marca antes de marcar el dinero como retenido'
      );
    }
  }
  if (estadoNuevo === 'pagado') {
    if (trato.tipo_pago === 'canje') {
      throw new TransicionInvalida(
        'Un canje no se paga en dinero: se cierra directo desde "aprobado"'
      );
    }
    const pagos = await db.getPagosDeTrato(trato.id);
    if (!pagos.some(p => p.direccion === 'salida')) {
      throw new TransicionInvalida(
        'Falta registrar el pago a la creadora antes de marcar el trato como pagado'
      );
    }
  }
  // El atajo de "aprobado" a "cerrado" existe solo porque en un canje no hay
  // qué girar. Sin esta guarda sería la forma de cerrar un trato en dinero sin
  // haberle pagado nunca a la creadora.
  if (estadoNuevo === 'cerrado' && estadoActual === 'aprobado' && trato.tipo_pago !== 'canje') {
    throw new TransicionInvalida(
      'Este trato se paga en dinero: hay que registrar el pago a la creadora antes de cerrarlo'
    );
  }

  const ahora = new Date().toISOString();
  const cambios = { estado: estadoNuevo };

  const campoFecha = CAMPO_FECHA[estadoNuevo];
  // Al volver de "entregado" a "pago_retenido" por cambios solicitados no se
  // reescribe fecha_pago_marca: esa plata entró una sola vez.
  if (campoFecha && !trato[campoFecha]) cambios[campoFecha] = ahora;

  if (datos.motivo_rechazo)     cambios.motivo_rechazo = datos.motivo_rechazo;
  if (datos.motivo_cancelacion) cambios.motivo_cancelacion = datos.motivo_cancelacion;

  // Revelación de contacto. El momento es configurable, pero por defecto ocurre
  // cuando el dinero ya está retenido: es lo que hace exigible la cláusula de
  // no-circunvalación. Se sella una sola vez.
  const cfg = await db.getConfig();
  const momento = cfg.revelar_contacto_en || 'pago_retenido';
  if (estadoNuevo === momento && !trato.contacto_revelado_at) {
    cambios.contacto_revelado_at = ahora;
  }

  const actualizado = await db.updateTrato(trato.id, cambios);

  await db.insertEvento({
    trato_id: trato.id,
    estado_anterior: estadoActual,
    estado_nuevo: estadoNuevo,
    actor,
    actor_id: datos.actor_id || null,
    nota: datos.nota || null,
  });

  return actualizado;
}

/** ¿Ya se puede mostrar el contacto de la contraparte en este trato? */
function contactoVisible(trato) {
  return Boolean(trato && trato.contacto_revelado_at);
}

/**
 * Crea un trato en estado `solicitado`, con su evento inicial.
 *
 * Vive acá y no en el router porque hay dos caminos que llegan al mismo sitio
 * —la propuesta individual y la confirmación de una campaña con cupos— y dos
 * copias de esto son dos sitios donde el escrow se puede romper distinto.
 *
 * Lo que hace y no se puede saltar:
 *   · COPIA los porcentajes vigentes al trato. Si mañana cambia la comisión,
 *     este trato conserva la suya. Es lo que hace que un acuerdo sea un
 *     acuerdo y no una variable de configuración.
 *   · Deja el evento en el historial. Un trato sin su primer evento aparece
 *     después como si hubiera nacido de la nada.
 *
 * No valida el tope del plan ni si hay otra propuesta abierta: eso depende de
 * por dónde se entró, y cada camino tiene sus propias reglas.
 */
async function crearTrato({
  marca_id, creadora_id, campana_id = null, invitacion_id = null,
  brief, entregables = null, monto, tipo_pago = 'dinero',
  fecha_entrega_esperada = null, producto = null, exclusividad = null,
  producto_detalle = null, exclusividad_detalle = null,
  nota = 'Solicitud enviada',
}) {
  const [creadora, cfg] = await Promise.all([
    db.getCreadoraCompleta(creadora_id),
    db.getConfig(),
  ]);

  const esCanje = tipo_pago === 'canje';
  const embajadora = creadora?.es_bruja_embajadora === true;

  // Un canje no tiene monto sobre el cual sacar porcentaje, así que cobra una
  // comisión fija. Se congela dentro del trato por la misma razón que los
  // porcentajes: subir el precio mañana no puede encarecer un trato de hoy.
  const calculo = esCanje
    ? calcularCanje({
        comision_fija: Number(cfg.canje_comision_fija ?? 4900),
        es_bruja_embajadora: embajadora,
      })
    : calcularTrato({
        monto: Number(monto),
        comision_marca_pct: Number(cfg.comision_marca_pct ?? 12),
        comision_creadora_pct: Number(cfg.comision_creadora_pct ?? 8),
        // Lo que cobra la pasarela por dispersar. Se congela igual que las
        // comisiones: subirlo mañana no puede cambiar lo que ya se le prometió a
        // alguien que aceptó hoy.
        costo_desembolso_pct: Number(cfg.costo_desembolso_pct ?? 0),
        es_bruja_embajadora: embajadora,
      });

  const trato = await db.insertTrato({
    codigo: await db.siguienteCodigoTrato(),
    marca_id, creadora_id,
    estado: 'solicitado',
    campana_id, invitacion_id,
    brief,
    entregables: entregables || null,
    fecha_entrega_esperada: fecha_entrega_esperada || null,
    producto: producto || null,
    exclusividad: exclusividad || null,
    producto_detalle, exclusividad_detalle,
    tipo_pago: esCanje ? 'canje' : 'dinero',
    ...calculo,
  });

  await db.insertEvento({
    trato_id: trato.id,
    estado_anterior: null,
    estado_nuevo: 'solicitado',
    actor: 'marca',
    actor_id: marca_id,
    nota,
  });

  return { trato, creadora };
}

module.exports = {
  ESTADOS, ETIQUETAS, LINEA_TIEMPO, TRANSICIONES,
  puedeTransicionar, transicionesDisponibles, esTerminal,
  aplicarTransicion, contactoVisible, TransicionInvalida, crearTrato,
};
