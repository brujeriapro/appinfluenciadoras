// Router del lado marca: registro por invitación, sesión y gestión de tratos.

const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
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

// ── Recuperar contraseña ────────────────────────────────────────────────────

/**
 * Igual que del lado creadora: responde ok aunque el correo no exista. Decir
 * "ese correo no está registrado" le confirmaría a un competidor qué marcas
 * están usando la plataforma.
 */
router.post('/olvide-clave', rateLimit({ windowMs: 600_000, max: 5 }), async (req, res) => {
  try {
    const marca = await db.getMarcaPorEmail(req.body.email || '');
    if (marca) {
      const token = crypto.randomBytes(32).toString('hex');
      await db.crearTokenReset({
        token,
        tipo: 'marca',
        usuario_id: marca.id,
        expira_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      });
      notificaciones.resetClave({ email: marca.email, token, lado: 'marca' })
        .catch(e => console.error('[notif] resetClave:', e.message));
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/nueva-clave', rateLimit({ max: 10 }), async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Faltan datos' });
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const t = await db.getTokenReset(token);
    if (!t || t.tipo !== 'marca' || t.usado_at || new Date(t.expira_at) < new Date()) {
      return res.status(400).json({ error: 'Ese enlace ya no sirve. Pide uno nuevo.' });
    }

    await db.updateMarca(t.usuario_id, { password_hash: await bcrypt.hash(String(password), 10) });
    await db.marcarTokenUsado(token);

    res.json({ ok: true, token: firmarToken(t.usuario_id, 'marca') });
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

/** Perfil editable de la marca: lo que ve la creadora antes de decidir. */
router.put('/me', async (req, res) => {
  try {
    const permitidos = [
      'nombre_empresa', 'nombre_contacto', 'whatsapp', 'nit', 'sitio_web',
      'pais', 'departamento', 'ciudad', 'bio', 'categoria', 'instagram', 'tiktok',
      'que_espera', 'libertad_creativa', 'contacto_creadoras',
    ];
    const data = {};
    permitidos.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });

    // La bio se corta en el servidor, no solo en el contador del formulario.
    if (data.bio) data.bio = String(data.bio).slice(0, 400);

    const limpio = (h) => h ? String(h).replace('@', '').toLowerCase().trim() : null;
    if (data.instagram !== undefined) data.instagram = limpio(data.instagram);
    if (data.tiktok !== undefined)    data.tiktok = limpio(data.tiktok);

    res.json({ ok: true, marca: await db.updateMarca(req.usuarioId, data) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Reputación de la marca: lo que le da confianza a la creadora.
 * Se calcula, no se edita — por eso vive acá y no en el PUT de arriba.
 */
router.get('/reputacion', async (req, res) => {
  try {
    const tratos = await db.getTratosDeMarca(req.usuarioId);
    const cerrados = tratos.filter(t => ['pagado', 'cerrado'].includes(t.estado));

    // Cuánto tarda en aprobar, en horas. Es el número que más le importa a una
    // creadora: si la marca se demora, ella cobra tarde.
    const conAprobacion = cerrados.filter(t => t.fecha_entrega && t.fecha_aprobacion);
    const horas = conAprobacion.map(t =>
      (new Date(t.fecha_aprobacion) - new Date(t.fecha_entrega)) / 3600_000
    );
    const promedio = horas.length
      ? Math.round(horas.reduce((a, b) => a + b, 0) / horas.length)
      : null;

    res.json({
      tratos_cerrados: cerrados.length,
      horas_aprobacion_promedio: promedio,
      pagado_en_plataforma: cerrados.reduce((s, t) => s + Number(t.total_a_pagar_marca || 0), 0),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Su plan, lo que lleva consumido y qué otros planes hay. */
router.get('/plan', async (req, res) => {
  try {
    const [marca, planes, vistas, cfg] = await Promise.all([
      db.getMarcaById(req.usuarioId),
      db.getPlanes(),
      db.contarFichasDelMes(req.usuarioId),
      db.getConfig(),
    ]);

    const vigente = marca?.plan_vence_at && new Date(marca.plan_vence_at) > new Date();
    const clave = vigente ? (marca.plan || 'demo') : 'demo';
    const actual = planes.find(p => p.clave === clave) || null;

    res.json({
      activo: cfg.planes_activos === true,
      plan: clave,
      nombre: actual?.nombre || 'Demo',
      vence_at: vigente ? marca.plan_vence_at : null,
      fichas_vistas: vistas,
      fichas_tope: actual?.fichas_mes ?? null,
      planes,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Triage: preseleccionar y descartar ──────────────────────────────────────

router.get('/triage', async (req, res) => {
  try {
    const filas = await db.getTriageDeMarca(req.usuarioId);
    res.json({
      preseleccionadas: filas.filter(f => f.decision === 'preseleccionada').map(f => f.creadora_id),
      descartadas: filas.filter(f => f.decision === 'descartada').map(f => f.creadora_id),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Volver a marcar lo mismo deshace la decisión: el triage es reversible. */
router.post('/triage', async (req, res) => {
  try {
    const { creadora_id, decision } = req.body;
    if (!['preseleccionada', 'descartada'].includes(decision)) {
      return res.status(400).json({ error: 'Decisión no válida' });
    }
    await db.guardarTriage(req.usuarioId, creadora_id, decision);
    const filas = await db.getTriageDeMarca(req.usuarioId);
    res.json({
      ok: true,
      preseleccionadas: filas.filter(f => f.decision === 'preseleccionada').map(f => f.creadora_id),
      descartadas: filas.filter(f => f.decision === 'descartada').map(f => f.creadora_id),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Campañas ────────────────────────────────────────────────────────────────

router.get('/campanas', async (req, res) => {
  try {
    const [campanas, cuenta] = await Promise.all([
      db.getCampanasDeMarca(req.usuarioId, { estado: req.query.estado }),
      db.contarTratosPorCampana(req.usuarioId),
    ]);
    res.json(campanas.map(c => ({ ...c, propuestas_enviadas: cuenta[c.id] || 0 })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/campanas', async (req, res) => {
  try {
    const { nombre, tope_total, tope_por_creadora, entregables } = req.body;
    if (!nombre) return res.status(400).json({ error: 'La campaña necesita un nombre' });
    if (!Array.isArray(entregables) || !entregables.length) {
      return res.status(400).json({ error: 'Marca al menos un entregable que buscas' });
    }
    if (!tope_total || !tope_por_creadora) {
      return res.status(400).json({ error: 'Faltan los topes de presupuesto' });
    }
    if (Number(tope_por_creadora) > Number(tope_total)) {
      return res.status(400).json({ error: 'El tope por creadora no puede superar el total' });
    }

    const permitidos = [
      'nombre', 'objetivo', 'brief_base', 'entregables', 'fecha_inicio', 'fecha_fin',
      'producto', 'exclusividad', 'tope_total', 'tope_por_creadora',
    ];
    const data = { marca_id: req.usuarioId };
    permitidos.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });

    res.json({ ok: true, campana: await db.insertCampana(data) });
  } catch (e) {
    console.error('[marcas/campanas]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/campanas/:id', async (req, res) => {
  try {
    const campana = await db.getCampana(req.params.id);
    if (!campana || campana.marca_id !== req.usuarioId) {
      return res.status(404).json({ error: 'Campaña no encontrada' });
    }
    const permitidos = [
      'nombre', 'objetivo', 'brief_base', 'entregables', 'fecha_inicio', 'fecha_fin',
      'producto', 'exclusividad', 'tope_total', 'tope_por_creadora', 'estado',
    ];
    const data = {};
    permitidos.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });
    res.json({ ok: true, campana: await db.updateCampana(req.params.id, data) });
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
    const { creadora_id, campana_id, brief, entregables, monto,
            fecha_entrega_esperada, producto, exclusividad } = req.body;

    if (!creadora_id || !monto) {
      return res.status(400).json({ error: 'Faltan la creadora o el monto' });
    }

    // Si la propuesta sale de una campaña, lo que no venga en el cuerpo se
    // hereda de ella: el brief se escribe una vez y sirve para veinte
    // propuestas. El monto nunca se hereda, porque cada creadora tiene su
    // tarifa.
    let base = { brief, entregables, fecha_entrega_esperada, producto, exclusividad };
    if (campana_id) {
      const campana = await db.getCampana(campana_id);
      if (!campana || campana.marca_id !== req.usuarioId) {
        return res.status(404).json({ error: 'Campaña no encontrada' });
      }
      base = {
        brief: brief || campana.brief_base,
        entregables: entregables || (campana.entregables || []).join(', '),
        fecha_entrega_esperada: fecha_entrega_esperada || campana.fecha_fin,
        producto: producto ?? campana.producto,
        exclusividad: exclusividad ?? campana.exclusividad,
      };
      if (campana.tope_por_creadora && Number(monto) > Number(campana.tope_por_creadora)) {
        return res.status(400).json({
          error: `Ese monto supera el tope por creadora de la campaña (${Math.round(campana.tope_por_creadora).toLocaleString('es-CO')}).`,
        });
      }
    }

    if (!base.brief) {
      return res.status(400).json({ error: 'Falta el brief' });
    }

    // Solo se puede contratar a una creadora que esté publicada en el catálogo.
    const creadoraPublica = await db.getCreadoraCatalogo(creadora_id);
    if (!creadoraPublica) {
      return res.status(404).json({ error: 'Creadora no disponible' });
    }

    // Dos propuestas abiertas a la misma creadora la confunden y hacen ver
    // desordenada a la marca.
    const abiertos = (await db.getTratosDeMarca(req.usuarioId))
      .filter(t => t.creadora_id === creadora_id)
      .filter(t => ['solicitado', 'aceptado', 'pago_retenido', 'entregado'].includes(t.estado));
    if (abiertos.length) {
      return res.status(409).json({
        error: `Ya tienes una propuesta abierta con esa creadora (${abiertos[0].codigo}).`,
      });
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
      campana_id: campana_id || null,
      brief: base.brief,
      entregables: base.entregables || null,
      fecha_entrega_esperada: base.fecha_entrega_esperada || null,
      producto: base.producto || null,
      exclusividad: base.exclusividad || null,
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
