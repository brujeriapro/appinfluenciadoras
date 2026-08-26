// Hace que se cumplan los plazos que la interfaz promete.
//
// El portal le dice a la creadora "tienes 72 horas para responder" y a la marca
// "48 horas para aprobar". Hasta ahora eso solo se mostraba: nada los ejecutaba.
// Una propuesta sin responder se quedaba ahí para siempre, y la marca esperaba
// por algo que nunca iba a pasar.
//
// Prometer un plazo que no se cumple es peor que no prometerlo, sobre todo
// cuando del otro lado hay dinero.
//
// Tres cosas que definen cómo está escrito:
//
//   1. Avisa antes de actuar. A nadie se le cierra una propuesta sin haberle
//      recordado que la tiene pendiente. El recordatorio sale cuando queda un
//      tercio del plazo.
//   2. Auto-aprobar está apagado por defecto. Aprobar libera el dinero de la
//      creadora, y eso no puede ocurrir por un descuido de configuración: hay
//      que encender `auto_aprobar_entrega` a propósito.
//   3. Un trato que falla no detiene a los demás. Se procesan uno por uno y se
//      reporta el conteo: en una tanda nocturna, un error suelto no puede
//      dejar sin procesar a todo lo que venía detrás.

const db = require('./db');
const { aplicarTransicion } = require('./tratos');
const notificaciones = require('./notificaciones');

const HORAS_RESPONDER_DEFAULT = 72;
const HORAS_APROBAR_DEFAULT = 48;

const horasDesde = (fecha) =>
  fecha ? (Date.now() - new Date(fecha).getTime()) / 36e5 : 0;

/**
 * Propuestas que la creadora no ha contestado.
 *
 * Devuelve qué hacer con cada una en vez de actuar de una: separar la decisión
 * de la acción es lo que hace que esto se pueda probar sin una base de datos.
 */
function clasificarPendientes(tratos = [], horasTope = HORAS_RESPONDER_DEFAULT, ahora = Date.now()) {
  const avisarDesde = horasTope * (2 / 3);   // aviso cuando queda un tercio
  const salida = { expirar: [], avisar: [], esperar: [] };

  for (const t of tratos) {
    if (t.estado !== 'solicitado') continue;
    const horas = t.fecha_solicitud
      ? (ahora - new Date(t.fecha_solicitud).getTime()) / 36e5
      : 0;

    if (horas >= horasTope) salida.expirar.push(t);
    // Solo un aviso por trato: `aviso_plazo_at` es lo que impide que la
    // creadora reciba el mismo recordatorio en cada corrida del cron.
    else if (horas >= avisarDesde && !t.aviso_plazo_at) salida.avisar.push(t);
    else salida.esperar.push(t);
  }
  return salida;
}

/** Entregas que la marca no ha revisado. */
function clasificarEntregas(tratos = [], horasTope = HORAS_APROBAR_DEFAULT, ahora = Date.now()) {
  return (tratos || []).filter(t =>
    t.estado === 'entregado'
    && t.fecha_entrega
    && (ahora - new Date(t.fecha_entrega).getTime()) / 36e5 >= horasTope
  );
}

/**
 * Corre una pasada completa de plazos.
 *
 * Es idempotente: correrla dos veces seguidas no hace nada la segunda vez,
 * porque lo que ya cambió de estado deja de cumplir las condiciones.
 */
async function ejecutar({ simulacro = false } = {}) {
  const cfg = await db.getConfig();
  const horasResponder = Number(cfg.horas_responder ?? HORAS_RESPONDER_DEFAULT);
  const horasAprobar   = Number(cfg.horas_aprobar ?? HORAS_APROBAR_DEFAULT);
  const autoAprobar    = cfg.auto_aprobar_entrega === true;

  const abiertos = await db.getTratosPorEstados(['solicitado', 'entregado']);
  const { expirar, avisar } = clasificarPendientes(abiertos, horasResponder);
  const porAprobar = autoAprobar ? clasificarEntregas(abiertos, horasAprobar) : [];

  const resumen = {
    revisados: abiertos.length,
    avisadas: 0, expiradas: 0, aprobadas: 0,
    errores: [],
    auto_aprobar_activo: autoAprobar,
    simulacro,
  };

  if (simulacro) {
    return { ...resumen, avisadas: avisar.length, expiradas: expirar.length, aprobadas: porAprobar.length };
  }

  // 1. Recordar antes de cerrar.
  for (const t of avisar) {
    try {
      const creadora = await db.getCreadoraCompleta(t.creadora_id);
      const marca = await db.getMarcaById(t.marca_id);
      await notificaciones.propuestaPorVencer({
        trato: t, creadora, marca,
        horasRestantes: Math.max(1, Math.round(horasResponder - horasDesde(t.fecha_solicitud))),
      });
      await db.updateTrato(t.id, { aviso_plazo_at: new Date().toISOString() });
      resumen.avisadas++;
    } catch (e) {
      resumen.errores.push(`aviso ${t.codigo || t.id}: ${e.message}`);
    }
  }

  // 2. Cerrar lo que nunca se contestó.
  for (const t of expirar) {
    try {
      await aplicarTransicion(t, 'cancelado', 'sistema', {
        motivo_cancelacion: `Sin respuesta en ${horasResponder} horas`,
      });
      const marca = await db.getMarcaById(t.marca_id);
      await notificaciones.propuestaExpirada({ trato: t, marca }).catch(() => {});
      resumen.expiradas++;
    } catch (e) {
      resumen.errores.push(`expirar ${t.codigo || t.id}: ${e.message}`);
    }
  }

  // 3. Aprobar entregas que la marca no revisó, solo si está encendido.
  for (const t of porAprobar) {
    try {
      await aplicarTransicion(t, 'aprobado', 'sistema', {});
      resumen.aprobadas++;
    } catch (e) {
      resumen.errores.push(`aprobar ${t.codigo || t.id}: ${e.message}`);
    }
  }

  return resumen;
}

module.exports = { ejecutar, clasificarPendientes, clasificarEntregas };
