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
    cancelado: ['marca', 'admin'],
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
    aprobado:      ['marca', 'admin'],
    pago_retenido: ['marca', 'admin'],  // pedir cambios: vuelve un paso atrás
  },
  aprobado: {
    pagado: ['admin'],
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

/** Estados a los que un actor puede llevar el trato desde donde está. */
function transicionesDisponibles(estadoActual, actor) {
  const salidas = TRANSICIONES[estadoActual] || {};
  return Object.entries(salidas)
    .filter(([, actores]) => actores.includes(actor))
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
    const pagos = await db.getPagosDeTrato(trato.id);
    if (!pagos.some(p => p.direccion === 'salida')) {
      throw new TransicionInvalida(
        'Falta registrar el pago a la creadora antes de marcar el trato como pagado'
      );
    }
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

module.exports = {
  ESTADOS, ETIQUETAS, LINEA_TIEMPO, TRANSICIONES,
  puedeTransicionar, transicionesDisponibles, esTerminal,
  aplicarTransicion, contactoVisible, TransicionInvalida,
};
