// Router del lado marca: registro por invitación, sesión y gestión de tratos.

const express = require('express');
const bcrypt = require('bcrypt');
const db = require('./db');
const config = require('./config');
const { calcularTrato } = require('./comisiones');
const maquina = require('./tratos');
const { marcaAuth, firmarToken, rateLimit, ipDe } = require('./auth');
const { TERMINOS_VERSION } = require('./terminos');
const notificaciones = require('./notificaciones');

const router = express.Router();

// ── Registro y sesión ───────────────────────────────────────────────────────

router.post('/registro', rateLimit({ max: 5 }), async (req, res) => {
  try {
    const {
      nombre_empresa, nombre_contacto, email, whatsapp,
      password, codigo_invitacion, nit, pais, departamento, ciudad, sitio_web, acepta_terminos,
    } = req.body;

    if (!nombre_empresa || !nombre_contacto || !email || !password) {
      return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }
    // Sin esto, la cláusula de no-circunvalación no es exigible más adelante.
    if (acepta_terminos !== true) {
      return res.status(400).json({ error: 'Debes aceptar los términos y condiciones' });
    }

    // Fase 1: acceso por invitación, no registro público abierto.
    const codigo = String(codigo_invitacion || '').trim().toUpperCase();
    if (!config.codigos_invitacion.includes(codigo)) {
      return res.status(403).json({ error: 'Código de invitación no válido' });
    }

    const emailNorm = String(email).toLowerCase().trim();
    if (await db.getMarcaPorEmail(emailNorm)) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
    }

    const marca = await db.insertMarca({
      nombre_empresa,
      nombre_contacto,
      email: emailNorm,
      password_hash: await bcrypt.hash(String(password), 10),
      whatsapp: whatsapp || null,
      nit: nit || null,
      pais: (pais || 'CO').toUpperCase(),
      departamento: departamento || null,
      ciudad: ciudad || null,
      sitio_web: sitio_web || null,
      codigo_invitacion: codigo,
      terminos_version: TERMINOS_VERSION,
      terminos_aceptados_at: new Date().toISOString(),
      terminos_ip: ipDe(req),
    });

    res.json({ ok: true, token: firmarToken(marca.id, 'marca'), marca_id: marca.id });
  } catch (e) {
    console.error('[marcas/registro]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/login', rateLimit({ max: 10 }), async (req, res) => {
  try {
    const { email, password } = req.body;
    const marca = await db.getMarcaPorEmail(email || '');
    if (!marca || !marca.password_hash) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }
    if (!(await bcrypt.compare(String(password || ''), marca.password_hash))) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }
    if (marca.estado === 'suspendida') {
      return res.status(403).json({ error: 'Cuenta suspendida. Escríbenos para reactivarla.' });
    }
    res.json({ ok: true, token: firmarToken(marca.id, 'marca') });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── A partir de aquí, todo exige sesión de marca ────────────────────────────

router.use(marcaAuth);

router.get('/me', async (req, res) => {
  try {
    const marca = await db.getMarcaById(req.usuarioId);
    if (!marca) return res.status(404).json({ error: 'Cuenta no encontrada' });
    res.json(marca);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Tratos ──────────────────────────────────────────────────────────────────

router.get('/tratos', async (req, res) => {
  try {
    res.json(await db.getTratosDeMarca(req.usuarioId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Crea una solicitud de colaboración. */
router.post('/tratos', rateLimit({ max: 20 }), async (req, res) => {
  try {
    const { creadora_id, brief, entregables, monto, fecha_entrega_esperada, producto, exclusividad } = req.body;

    if (!creadora_id || !brief || !monto) {
      return res.status(400).json({ error: 'Faltan creadora, brief o monto' });
    }

    // Solo se puede contratar a una creadora que esté publicada en el catálogo.
    const creadoraPublica = await db.getCreadoraCatalogo(creadora_id);
    if (!creadoraPublica) {
      return res.status(404).json({ error: 'Creadora no disponible' });
    }

    // El flag de comisión 0% vive en la fila completa, no en la vista pública.
    const creadora = await db.getCreadoraCompleta(creadora_id);
    const cfg = await db.getConfig();

    // Los porcentajes vigentes se COPIAN al trato y ya no vuelven a leerse:
    // si mañana cambia la comisión, este trato conserva la suya.
    const calculo = calcularTrato({
      monto: Number(monto),
      comision_marca_pct: Number(cfg.comision_marca_pct ?? 12),
      comision_creadora_pct: Number(cfg.comision_creadora_pct ?? 8),
      es_bruja_embajadora: creadora.es_bruja_embajadora === true,
    });

    const trato = await db.insertTrato({
      codigo: await db.siguienteCodigoTrato(),
      marca_id: req.usuarioId,
      creadora_id,
      estado: 'solicitado',
      brief,
      entregables: entregables || null,
      fecha_entrega_esperada: fecha_entrega_esperada || null,
      producto: producto || null,
      exclusividad: exclusividad || null,
      ...calculo,
    });

    await db.insertEvento({
      trato_id: trato.id,
      estado_anterior: null,
      estado_nuevo: 'solicitado',
      actor: 'marca',
      actor_id: req.usuarioId,
      nota: 'Solicitud enviada',
    });

    const marca = await db.getMarcaById(req.usuarioId);
    notificaciones.nuevaSolicitud({ trato, creadora, marca }).catch(e =>
      console.error('[notif] nuevaSolicitud:', e.message)
    );

    res.json({ ok: true, trato });
  } catch (e) {
    console.error('[marcas/tratos]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/tratos/:id', async (req, res) => {
  try {
    const trato = await db.getTratoById(req.params.id);
    if (!trato || trato.marca_id !== req.usuarioId) {
      return res.status(404).json({ error: 'Trato no encontrado' });
    }

    const [eventos, entregas, creadora] = await Promise.all([
      db.getEventosDeTrato(trato.id),
      db.getEntregasDeTrato(trato.id),
      db.getCreadoraCatalogo(trato.creadora_id),
    ]);

    // El contacto real solo se adjunta si el trato ya lo reveló.
    const contacto = maquina.contactoVisible(trato)
      ? await db.getContactoCreadora(trato.creadora_id)
      : null;

    res.json({
      ...trato,
      creadora,
      contacto,
      eventos,
      entregas,
      acciones: maquina.transicionesDisponibles(trato.estado, 'marca'),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Aprueba el contenido entregado. */
router.post('/tratos/:id/aprobar', async (req, res) => {
  try {
    const trato = await db.getTratoById(req.params.id);
    if (!trato || trato.marca_id !== req.usuarioId) {
      return res.status(404).json({ error: 'Trato no encontrado' });
    }

    const actualizado = await maquina.aplicarTransicion(trato, 'aprobado', 'marca', {
      actor_id: req.usuarioId,
      nota: req.body.nota || 'Contenido aprobado por la marca',
    });

    const entregas = await db.getEntregasDeTrato(trato.id);
    if (entregas[0]) await db.updateEntrega(entregas[0].id, { estado: 'aprobada' });

    const creadora = await db.getCreadoraCompleta(trato.creadora_id);
    notificaciones.contenidoAprobado({ trato: actualizado, creadora }).catch(e =>
      console.error('[notif] contenidoAprobado:', e.message)
    );

    res.json({ ok: true, trato: actualizado });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/** Pide cambios: devuelve el trato a pago_retenido para que vuelva a entregar. */
router.post('/tratos/:id/cambios', async (req, res) => {
  try {
    const { feedback } = req.body;
    if (!feedback) return res.status(400).json({ error: 'Escribe qué cambios necesitas' });

    const trato = await db.getTratoById(req.params.id);
    if (!trato || trato.marca_id !== req.usuarioId) {
      return res.status(404).json({ error: 'Trato no encontrado' });
    }

    const actualizado = await maquina.aplicarTransicion(trato, 'pago_retenido', 'marca', {
      actor_id: req.usuarioId,
      nota: `Cambios solicitados: ${feedback}`,
    });

    const entregas = await db.getEntregasDeTrato(trato.id);
    if (entregas[0]) {
      await db.updateEntrega(entregas[0].id, {
        estado: 'cambios_solicitados',
        feedback_marca: feedback,
      });
    }

    res.json({ ok: true, trato: actualizado });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/tratos/:id/cancelar', async (req, res) => {
  try {
    const trato = await db.getTratoById(req.params.id);
    if (!trato || trato.marca_id !== req.usuarioId) {
      return res.status(404).json({ error: 'Trato no encontrado' });
    }
    const actualizado = await maquina.aplicarTransicion(trato, 'cancelado', 'marca', {
      actor_id: req.usuarioId,
      motivo_cancelacion: req.body.motivo || null,
      nota: 'Cancelado por la marca',
    });
    res.json({ ok: true, trato: actualizado });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

module.exports = router;
