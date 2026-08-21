// Cobros con Wompi: escrow del trato y suscripción a un plan.
//
// El webhook es la pieza delicada de todo el sistema: es la única ruta pública
// que mueve dinero y cambia estados. Por eso hace tres cosas antes de tocar
// nada — verifica la firma, vuelve a consultar la transacción en Wompi, y
// comprueba que el monto coincida con lo que la base dice que se debía cobrar.

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

    const fila = await db.getTransaccionPorReferencia(t.reference);
    if (!fila) {
      console.warn(`[wompi] referencia desconocida: ${t.reference}`);
      return;
    }
    if (fila.estado === 'aprobada') return;   // ya se procesó

    // No se confía en el estado que llegó por el mensaje: se pregunta a Wompi.
    let real = t;
    try {
      real = await wompi.consultarTransaccion(t.id);
    } catch (e) {
      console.error('[wompi] no se pudo confirmar contra la API:', e.message);
      return;   // sin confirmación no se mueve nada
    }

    const estado = wompi.ESTADOS[real.status] || 'error';
    await db.actualizarTransaccion(fila.referencia, {
      wompi_id: real.id,
      estado,
      metodo: real.payment_method_type,
      datos: real,
      actualizada_at: new Date().toISOString(),
    });

    if (estado !== 'aprobada') {
      console.log(`[wompi] ${t.reference} quedó ${estado}`);
      return;
    }

    // El monto tiene que coincidir con lo que la base dice que se debía cobrar.
    const pagado = Number(real.amount_in_cents) / 100;
    if (Math.abs(pagado - Number(fila.monto)) > 1) {
      console.error(
        `[wompi] monto distinto en ${t.reference}: se esperaban ${fila.monto} y llegaron ${pagado}`
      );
      return;
    }

    if (fila.concepto === 'trato') await aplicarPagoDeTrato(fila, real);
    if (fila.concepto === 'suscripcion') await aplicarSuscripcion(fila);
  } catch (e) {
    console.error('[wompi] error procesando evento:', e.message);
  }
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
async function aplicarSuscripcion(fila) {
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
}

// ── Consulta del estado de un pago ──────────────────────────────────────────

/** Lo usa el panel al volver del checkout, para saber si ya entró. */
router.get('/estado/:referencia', marcaAuth, async (req, res) => {
  try {
    const fila = await db.getTransaccionPorReferencia(req.params.referencia);
    if (!fila || fila.marca_id !== req.usuarioId) {
      return res.status(404).json({ error: 'No encontrada' });
    }
    res.json({ estado: fila.estado, concepto: fila.concepto, monto: fila.monto });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.manejarEvento = manejarEvento;
