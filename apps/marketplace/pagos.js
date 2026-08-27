// Cobros con Wompi: escrow del trato y suscripción a un plan.
//
// El webhook es la pieza delicada de todo el sistema: es la única ruta pública
// que mueve dinero y cambia estados. Por eso hace tres cosas antes de tocar
// nada — verifica la firma, vuelve a consultar la transacción en Wompi, y
// comprueba que el monto coincida con lo que la base dice que se debía cobrar.
//
// Un webhook, sin embargo, es un mensaje que puede perderse: Railway
// reiniciando, un secreto mal puesto, una caída de Wompi. Si ese mensaje es lo
// único que confirma un pago, la marca queda con la plata debitada y el trato
// quieto, y nadie se entera hasta que reclama. Por eso hay TRES caminos hacia
// el mismo sitio, y todos pasan por `sincronizar()`:
//
//   1. El webhook, cuando llega.
//   2. El navegador de la marca al volver del checkout (`GET /estado/:ref`).
//   3. El conciliador (`POST /api/cron/pagos`), que barre lo que quedó colgado.
//
// Que los tres compartan una sola función es lo que hace que no puedan
// divergir: un pago no se aplica distinto según por dónde se enteró el sistema.

const express = require('express');
const db = require('./db');
const config = require('./config');
const wompi = require('./wompi');
const maquina = require('./tratos');
const notificaciones = require('./notificaciones');
const { marcaAuth } = require('./auth');

const router = express.Router();

// ── Iniciar un pago (requiere sesión de marca) ──────────────────────────────

/**
 * Genera el enlace para pagar un trato.
 *
 * El monto sale de la base, no del cuerpo de la petición: un monto que viaje
 * por el navegador es un monto que se puede editar.
 */
router.post('/trato/:id', marcaAuth, async (req, res) => {
  try {
    if (!wompi.disponible()) {
      return res.status(503).json({
        error: 'El pago con tarjeta no está habilitado. Escríbenos para coordinar la transferencia.',
      });
    }

    const trato = await db.getTratoById(req.params.id);
    if (!trato || trato.marca_id !== req.usuarioId) {
      return res.status(404).json({ error: 'Trato no encontrado' });
    }
    if (trato.estado !== 'aceptado') {
      return res.status(409).json({
        error: `Este trato no está esperando pago (está en "${trato.estado}").`,
      });
    }

    // Si ya hay un intento pendiente, se reutiliza en vez de crear otro: dos
    // referencias vivas para el mismo trato terminan en un cobro doble.
    const previas = await db.getTransaccionesDeTrato(trato.id);
    const pendiente = previas.find(t => t.estado === 'pendiente');
    const referencia = pendiente ? pendiente.referencia : wompi.nuevaReferencia(trato.codigo || 'CR');

    if (!pendiente) {
      await db.insertTransaccion({
        referencia,
        concepto: 'trato',
        trato_id: trato.id,
        marca_id: req.usuarioId,
        monto: trato.total_a_pagar_marca,
        estado: 'pendiente',
      });
    }

    const marca = await db.getMarcaById(req.usuarioId);
    res.json({
      ok: true,
      url: wompi.linkDePago({
        referencia,
        monto: trato.total_a_pagar_marca,
        email: marca?.email,
        urlRetorno: `${config.base_url}/panel.html#pago=${referencia}`,
      }),
      monto: trato.total_a_pagar_marca,
      prueba: wompi.ES_PRUEBA,
    });
  } catch (e) {
    console.error('[pagos/trato]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/** Genera el enlace para pagar un mes de suscripción. */
router.post('/plan/:clave', marcaAuth, async (req, res) => {
  try {
    if (!wompi.disponible()) {
      return res.status(503).json({ error: 'El cobro de planes no está habilitado todavía.' });
    }

    const plan = await db.getPlan(req.params.clave);
    if (!plan || !plan.activo) return res.status(404).json({ error: 'Plan no encontrado' });
    if (Number(plan.precio_mes) <= 0) {
      return res.status(400).json({ error: 'El plan demo no se paga.' });
    }

    const referencia = wompi.nuevaReferencia('SUB');
    await db.insertTransaccion({
      referencia,
      concepto: 'suscripcion',
      marca_id: req.usuarioId,
      monto: plan.precio_mes,
      estado: 'pendiente',
      datos: { plan: plan.clave },
    });

    const marca = await db.getMarcaById(req.usuarioId);
    res.json({
      ok: true,
      url: wompi.linkDePago({
        referencia,
        monto: plan.precio_mes,
        email: marca?.email,
        urlRetorno: `${config.base_url}/panel.html#plan=${plan.clave}`,
      }),
      plan: plan.nombre,
      monto: plan.precio_mes,
      prueba: wompi.ES_PRUEBA,
    });
  } catch (e) {
    console.error('[pagos/plan]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Webhook (público) ───────────────────────────────────────────────────────

/**
 * Recibe los eventos de Wompi.
 *
 * Responde 200 siempre que el evento sea auténtico, incluso si el
 * procesamiento falla: Wompi reintenta ante un error, y un reintento sobre un
 * evento ya aplicado es peor que perderlo. La idempotencia la da el estado de
 * la transacción en nuestra base.
 */
async function manejarEvento(req, res) {
  const evento = req.body;

  if (!wompi.eventoEsAutentico(evento)) {
    console.warn('[wompi] evento con firma inválida — descartado');
    return res.status(401).json({ error: 'Firma inválida' });
  }

  res.json({ ok: true });   // Wompi exige respuesta rápida

  try {
    if (evento.event !== 'transaction.updated') return;

    const t = evento.data?.transaction;
    if (!t?.reference) return;

    await sincronizar(t.reference, t.id);
  } catch (e) {
    console.error('[wompi] error procesando evento:', e.message);
  }
}

/**
 * Pone al día una transacción contra lo que diga Wompi, y aplica sus efectos.
 *
 * Es el único sitio donde un pago cambia de estado. Da igual si el disparo vino
 * del webhook, del navegador de la marca o del conciliador: lo que se hace es
 * lo mismo, porque lo que se cree no es el mensaje sino la respuesta de Wompi.
 *
 * Es idempotente: si la transacción ya está aprobada, sale de una. Llamarla
 * cien veces sobre el mismo pago aplica el efecto una sola vez.
 *
 * @param {string} referencia  La nuestra, la que viaja en el checkout.
 * @param {string} [wompiId]   Si se conoce, ahorra una búsqueda.
 * @returns {Promise<{estado: string, cambio: boolean, motivo?: string}>}
 */
async function sincronizar(referencia, wompiId) {
  const fila = await db.getTransaccionPorReferencia(referencia);
  if (!fila) {
    console.warn(`[wompi] referencia desconocida: ${referencia}`);
    return { estado: 'desconocida', cambio: false };
  }
  if (fila.estado === 'aprobada') return { estado: 'aprobada', cambio: false };

  // No se confía en el estado que llegó por el mensaje: se pregunta a la fuente.
  let real;
  try {
    real = wompiId
      ? await wompi.consultarTransaccion(wompiId)
      : await wompi.buscarPorReferencia(referencia);
  } catch (e) {
    console.error(`[wompi] no se pudo confirmar ${referencia}:`, e.message);
    return { estado: fila.estado, cambio: false, motivo: 'wompi no respondió' };
  }

  // Sin transacción en Wompi, la marca abrió el checkout y no pagó. Es el caso
  // normal de un enlace abandonado, no un error.
  if (!real) return { estado: fila.estado, cambio: false, motivo: 'sin intento de pago' };

  const estado = wompi.ESTADOS[real.status] || 'error';
  await db.actualizarTransaccion(fila.referencia, {
    wompi_id: real.id,
    estado,
    metodo: real.payment_method_type,
    datos: real,
    actualizada_at: new Date().toISOString(),
  });

  if (estado !== 'aprobada') {
    console.log(`[wompi] ${referencia} quedó ${estado}`);
    return { estado, cambio: estado !== fila.estado };
  }

  // El monto tiene que coincidir con lo que la base dice que se debía cobrar.
  const pagado = Number(real.amount_in_cents) / 100;
  if (Math.abs(pagado - Number(fila.monto)) > 1) {
    // No se aplica nada y queda a la vista: cobrar de menos y entregar igual, o
    // cobrar de más y no devolver, son los dos errores que no se pueden
    // arreglar solos.
    console.error(
      `[wompi] monto distinto en ${referencia}: se esperaban ${fila.monto} y llegaron ${pagado}`
    );
    return { estado: 'aprobada', cambio: false, motivo: 'el monto no coincide' };
  }

  if (fila.concepto === 'trato') await aplicarPagoDeTrato(fila, real);
  if (fila.concepto === 'suscripcion') await aplicarSuscripcion(fila, real);
  return { estado: 'aprobada', cambio: true };
}

/** Pago del trato aprobado: queda en escrow y se revela el contacto. */
async function aplicarPagoDeTrato(fila, transaccion) {
  const trato = await db.getTratoById(fila.trato_id);
  if (!trato) return;
  if (trato.estado !== 'aceptado') {
    console.warn(`[wompi] el trato ${trato.codigo} ya no esperaba pago (${trato.estado})`);
    return;
  }

  await db.insertPago({
    trato_id: trato.id,
    direccion: 'entrada',
    monto: fila.monto,
    metodo: transaccion.payment_method_type || 'wompi',
    referencia: fila.referencia,
    fecha: new Date().toISOString().split('T')[0],
    registrado_por: 'wompi',
    notas: `Transacción ${transaccion.id}`,
  });

  const actualizado = await maquina.aplicarTransicion(trato, 'pago_retenido', 'sistema', {
    nota: `Pago confirmado por Wompi (${transaccion.id})`,
  });

  const [marca, contacto] = await Promise.all([
    db.getMarcaById(trato.marca_id),
    db.getContactoCreadora(trato.creadora_id),
  ]);
  notificaciones.pagoRetenido({ trato: actualizado, marca, contacto })
    .catch(e => console.error('[notif] pagoRetenido:', e.message));

  console.log(`[wompi] ${trato.codigo} pagado y en escrow`);
}

/** Suscripción aprobada: se activa el plan por 30 días. */
async function aplicarSuscripcion(fila, transaccion) {
  const clave = fila.datos?.plan;
  if (!clave) return;

  const marca = await db.getMarcaById(fila.marca_id);
  // Si renueva antes de vencerse, el tiempo se suma en vez de perderse.
  const desde = marca?.plan_vence_at && new Date(marca.plan_vence_at) > new Date()
    ? new Date(marca.plan_vence_at)
    : new Date();
  const vence = new Date(desde.getTime() + 30 * 24 * 3600_000);

  await db.updateMarca(fila.marca_id, {
    plan: clave,
    plan_vence_at: vence.toISOString(),
  });
  console.log(`[wompi] marca ${fila.marca_id} activó el plan ${clave} hasta ${vence.toISOString()}`);

  // El recibo va después de activar, y su fallo no revierte nada: es peor
  // dejar a alguien pagando sin plan por un correo caído que dejarlo con el
  // plan activo y sin recibo, que se puede reenviar.
  const plan = await db.getPlan(clave);
  notificaciones.reciboSuscripcion({
    marca, plan, monto: fila.monto, referencia: fila.referencia,
    vence, metodo: transaccion?.payment_method_type,
  }).catch(e => console.error('[notif] reciboSuscripcion:', e.message));
}

// ── Consulta del estado de un pago ──────────────────────────────────────────

/**
 * Lo usa el panel al volver del checkout, para saber si ya entró.
 *
 * Si sigue pendiente, le pregunta a Wompi en vez de responder lo que hay
 * guardado. Así el propio regreso de la marca completa el pago cuando el
 * webhook se perdió — que es el caso que dejaría a alguien pagando sin recibir
 * nada. Solo se consulta si está pendiente: una ya resuelta no cambia.
 */
router.get('/estado/:referencia', marcaAuth, async (req, res) => {
  try {
    let fila = await db.getTransaccionPorReferencia(req.params.referencia);
    if (!fila || fila.marca_id !== req.usuarioId) {
      return res.status(404).json({ error: 'No encontrada' });
    }

    if (fila.estado === 'pendiente' && wompi.disponible()) {
      await sincronizar(fila.referencia).catch(e =>
        console.error('[pagos/estado]', e.message));
      fila = await db.getTransaccionPorReferencia(req.params.referencia) || fila;
    }

    res.json({
      estado: fila.estado,
      concepto: fila.concepto,
      monto: fila.monto,
      mensaje: MENSAJES[fila.estado] || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Qué se le dice a la marca según cómo quedó el cobro.
 *
 * Un "rechazada" a secas deja a quien lo lee sin saber si reintentar, cambiar
 * de tarjeta o llamar al banco. Wompi no dice por qué rechazó un cargo —el
 * banco no se lo cuenta— así que lo honesto es nombrar las causas comunes en
 * vez de inventar una.
 */
const MENSAJES = {
  aprobada: 'Pago confirmado. El dinero queda retenido hasta que apruebes la entrega.',
  pendiente: 'Todavía estamos esperando la confirmación del banco. Puede tardar unos minutos.',
  rechazada: 'El banco rechazó el cobro. Suele ser cupo, un tope de compras por internet '
           + 'o datos que no coinciden. Puedes reintentar con otra tarjeta.',
  anulada: 'El cobro se anuló y no se debitó nada.',
  error: 'Hubo un problema procesando el pago y no se debitó nada. Reintenta en unos minutos.',
};

// ── Conciliación ────────────────────────────────────────────────────────────

/**
 * Barre las transacciones que quedaron pendientes y les pregunta a Wompi.
 *
 * Existe porque un webhook es un mensaje que puede perderse, y perder el que
 * confirma un pago significa que alguien pagó y no recibió nada. Esto lo
 * detecta sin que la marca tenga que reclamar.
 *
 * Se deja un margen antes de mirar una transacción: recién creada, lo normal es
 * que esté pendiente porque la marca todavía está escribiendo el número de la
 * tarjeta. Preguntar en ese momento no aporta y gasta una llamada.
 *
 * @returns {Promise<{revisadas: number, resueltas: number, detalle: object[]}>}
 */
async function conciliarPendientes({ margenMinutos = 10, tope = 50 } = {}) {
  if (!wompi.disponible()) return { revisadas: 0, resueltas: 0, detalle: [] };

  const corte = new Date(Date.now() - margenMinutos * 60_000).toISOString();
  const pendientes = await db.getTransaccionesPendientes(corte, tope);

  const detalle = [];
  for (const fila of pendientes) {
    try {
      const r = await sincronizar(fila.referencia);
      if (r.cambio || r.motivo) {
        detalle.push({ referencia: fila.referencia, ...r });
      }
    } catch (e) {
      detalle.push({ referencia: fila.referencia, estado: 'error', motivo: e.message });
    }
  }

  const resueltas = detalle.filter(d => d.cambio).length;
  if (resueltas) console.log(`[wompi] conciliación: ${resueltas} de ${pendientes.length} resueltas`);
  return { revisadas: pendientes.length, resueltas, detalle };
}

/**
 * ¿Ya se le avisó de ESTE vencimiento?
 *
 * El aviso cuenta si cae dentro del ciclo actual, o sea después del
 * vencimiento anterior. Se resta un mes porque los planes son mensuales: un
 * aviso más viejo que eso pertenece a un ciclo ya pagado y no dice nada del
 * que está por vencerse.
 *
 * Se mira así en vez de con un booleano porque un booleano habría que
 * acordarse de apagarlo en cada renovación, y ese olvido deja a la marca sin
 * aviso para siempre sin que nada falle a la vista.
 */
function yaSeAviso(marca, unMes = 31 * 24 * 3600_000) {
  if (!marca.plan_aviso_at) return false;
  const vence = new Date(marca.plan_vence_at).getTime();
  return new Date(marca.plan_aviso_at).getTime() > vence - unMes;
}

/**
 * Avisa a las marcas cuyo plan se vence pronto.
 *
 * El recibo promete este aviso; sin esto sería una promesa falsa. Y un plan
 * que se apaga sin advertencia, en mitad de una campaña, se lee como una falla
 * de la plataforma y no como un cobro que venció.
 *
 * Se avisa una vez por ciclo: `plan_aviso_at` se compara contra el
 * vencimiento vigente, así que al renovar el aviso vuelve a habilitarse solo
 * sin tener que acordarse de apagar nada.
 */
async function avisarPlanesPorVencer({ diasAntes = 3 } = {}) {
  const ahora = Date.now();
  const corte = new Date(ahora + diasAntes * 24 * 3600_000).toISOString();
  const marcas = await db.getMarcasPorVencer(new Date(ahora).toISOString(), corte);

  let avisadas = 0;
  for (const marca of marcas) {
    if (yaSeAviso(marca)) continue;

    const vence = new Date(marca.plan_vence_at).getTime();
    const plan = await db.getPlan(marca.plan).catch(() => null);
    const dias = Math.max(1, Math.ceil((vence - ahora) / (24 * 3600_000)));

    const ok = await notificaciones.planPorVencer({
      marca, plan, vence: marca.plan_vence_at, dias,
    });
    // Solo se marca si salió. Si el correo falló, que lo reintente la próxima
    // pasada en vez de dar por avisada a una marca que no supo nada.
    if (ok) {
      await db.updateMarca(marca.id, { plan_aviso_at: new Date(ahora).toISOString() });
      avisadas++;
    }
  }

  if (avisadas) console.log(`[planes] ${avisadas} marcas avisadas de vencimiento`);
  return { revisadas: marcas.length, avisadas };
}

module.exports = router;
module.exports.manejarEvento = manejarEvento;
module.exports.sincronizar = sincronizar;
module.exports.conciliarPendientes = conciliarPendientes;
module.exports.MENSAJES = MENSAJES;
module.exports.avisarPlanesPorVencer = avisarPlanesPorVencer;
module.exports.yaSeAviso = yaSeAviso;
