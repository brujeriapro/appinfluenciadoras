// Router del lado creadora: sesión, perfil propio y respuesta a los tratos.
//
// La cuenta es propia de Creadores.app, separada de la del portal de Brujas
// Embajadoras: mismo ser humano, credenciales distintas, secretos distintos.

const express = require('express');
const bcrypt = require('bcrypt');
const db = require('./db');
const maquina = require('./tratos');
const { resumirTarifas } = require('./comisiones');
const { creadoraAuth, firmarToken, rateLimit } = require('./auth');
const notificaciones = require('./notificaciones');

const router = express.Router();

// ── Sesión ──────────────────────────────────────────────────────────────────

/** Primer ingreso: la creadora define su contraseña si aún no tiene una. */
router.post('/set-password', rateLimit({ max: 5 }), async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Faltan datos' });
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const creadora = await db.getCreadoraPorEmail(email);
    if (!creadora) return res.status(404).json({ error: 'No encontramos tu perfil' });
    if (creadora.password_hash) {
      return res.status(409).json({ error: 'Ya tienes contraseña. Inicia sesión.' });
    }

    await db.updateCreadora(creadora.id, {
      password_hash: await bcrypt.hash(String(password), 10),
    });
    res.json({ ok: true, token: firmarToken(creadora.id, 'creadora') });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/login', rateLimit({ max: 10 }), async (req, res) => {
  try {
    const { email, password } = req.body;
    const creadora = await db.getCreadoraPorEmail(email || '');
    if (!creadora || !creadora.password_hash) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }
    if (!(await bcrypt.compare(String(password || ''), creadora.password_hash))) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
    }
    res.json({ ok: true, token: firmarToken(creadora.id, 'creadora') });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── A partir de aquí, todo exige sesión de creadora ─────────────────────────

router.use(creadoraAuth);

/** Perfil propio: la creadora ve exactamente cómo la están mostrando. */
router.get('/me', async (req, res) => {
  try {
    const creadora = await db.getCreadoraCompleta(req.usuarioId);
    if (!creadora) return res.status(404).json({ error: 'Perfil no encontrado' });
    const [muestras, tarifas] = await Promise.all([
      db.getMuestrasDeCreadora(creadora.id),
      db.getTarifasDeCreadora(creadora.id),
    ]);
    const { password_hash, ...perfil } = creadora;
    res.json({ ...perfil, muestras, tarifas });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Tarifas: las pone la creadora, no la plataforma ─────────────────────────

/**
 * Lo que necesita la pantalla del control deslizante: los entregables
 * disponibles, los límites del slider y lo que ella ya tiene publicado.
 */
router.get('/tarifas', async (req, res) => {
  try {
    const [cfg, tarifas] = await Promise.all([
      db.getConfig(),
      db.getTarifasDeCreadora(req.usuarioId),
    ]);
    res.json({
      entregables: cfg.entregables || [],
      rango: cfg.rango_tarifa || { min: 50000, max: 8000000, paso: 10000 },
      tarifas,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Guarda el set completo de tarifas. Manda lo que quede publicado: lo que no
 * venga en la lista se desactiva.
 */
router.put('/tarifas', async (req, res) => {
  try {
    const { tarifas } = req.body;
    if (!Array.isArray(tarifas)) {
      return res.status(400).json({ error: 'Falta la lista de tarifas' });
    }

    const cfg = await db.getConfig();
    const rango = cfg.rango_tarifa || { min: 50000, max: 8000000 };
    const clavesValidas = new Set((cfg.entregables || []).map(e => e.clave));

    for (const t of tarifas) {
      if (!clavesValidas.has(t.entregable)) {
        return res.status(400).json({ error: `Entregable desconocido: ${t.entregable}` });
      }
      const precio = Number(t.precio);
      if (!Number.isFinite(precio) || precio < rango.min || precio > rango.max) {
        return res.status(400).json({
          error: `El precio de "${t.entregable}" debe estar entre ${rango.min} y ${rango.max}`,
        });
      }
    }

    const guardadas = await db.guardarTarifas(req.usuarioId, tarifas);

    // El catálogo filtra por tarifa sin cruzar tablas, así que el resumen se
    // recalcula cada vez que ella cambia sus precios.
    const resumen = resumirTarifas(guardadas, cfg.niveles_tarifa || {});
    await db.updateCreadora(req.usuarioId, resumen);

    res.json({ ok: true, tarifas: guardadas, ...resumen });
  } catch (e) {
    console.error('[creadoras/tarifas]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/** Nichos que la creadora puede elegir para su perfil. */
router.get('/nichos', async (req, res) => {
  try {
    const cfg = await db.getConfig();
    res.json({ categorias: cfg.nichos || [], max_subnichos: 3 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** La creadora elige sus nichos (hasta 3 subnichos). */
router.put('/nichos', async (req, res) => {
  try {
    const { nicho } = req.body;
    if (!Array.isArray(nicho) || !nicho.length) {
      return res.status(400).json({ error: 'Elige al menos un nicho' });
    }
    if (nicho.length > 3) {
      return res.status(400).json({ error: 'Máximo 3 nichos: un perfil enfocado se contrata más' });
    }

    const cfg = await db.getConfig();
    const taxonomia = cfg.nichos || [];
    const validos = new Set(taxonomia.flatMap(c => c.subnichos || []));
    const desconocido = nicho.find(n => !validos.has(n));
    if (desconocido) {
      return res.status(400).json({ error: `Nicho desconocido: ${desconocido}` });
    }

    // La categoría madre se deduce de los subnichos: la marca filtra primero
    // por categoría y luego afina, así que no hace falta pedirla dos veces.
    const categorias = [...new Set(
      taxonomia
        .filter(c => (c.subnichos || []).some(s => nicho.includes(s)))
        .map(c => c.clave)
    )];

    await db.updateCreadora(req.usuarioId, { nicho, categorias });
    res.json({ ok: true, nicho, categorias });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Tratos ──────────────────────────────────────────────────────────────────

router.get('/tratos', async (req, res) => {
  try {
    const tratos = await db.getTratosDeCreadora(req.usuarioId);
    // El neto va explícito en cada fila: nadie debería aceptar un trato sin ver
    // cuánto le queda después de la comisión.
    res.json(tratos.map(t => ({
      ...t,
      acciones: maquina.transicionesDisponibles(t.estado, 'creadora'),
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/tratos/:id', async (req, res) => {
  try {
    const trato = await db.getTratoById(req.params.id);
    if (!trato || trato.creadora_id !== req.usuarioId) {
      return res.status(404).json({ error: 'Trato no encontrado' });
    }
    const [eventos, entregas] = await Promise.all([
      db.getEventosDeTrato(trato.id),
      db.getEntregasDeTrato(trato.id),
    ]);
    const marca = maquina.contactoVisible(trato)
      ? await db.getMarcaById(trato.marca_id)
      : { nombre_empresa: (await db.getMarcaById(trato.marca_id))?.nombre_empresa };

    res.json({
      ...trato,
      marca,
      contacto_visible: maquina.contactoVisible(trato),
      eventos,
      entregas,
      acciones: maquina.transicionesDisponibles(trato.estado, 'creadora'),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/tratos/:id/aceptar', async (req, res) => {
  try {
    const trato = await db.getTratoById(req.params.id);
    if (!trato || trato.creadora_id !== req.usuarioId) {
      return res.status(404).json({ error: 'Trato no encontrado' });
    }
    const actualizado = await maquina.aplicarTransicion(trato, 'aceptado', 'creadora', {
      actor_id: req.usuarioId,
      nota: 'Aceptado por la creadora',
    });

    const marca = await db.getMarcaById(trato.marca_id);
    notificaciones.tratoAceptado({ trato: actualizado, marca }).catch(e =>
      console.error('[notif] tratoAceptado:', e.message)
    );

    res.json({ ok: true, trato: actualizado });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/tratos/:id/rechazar', async (req, res) => {
  try {
    const trato = await db.getTratoById(req.params.id);
    if (!trato || trato.creadora_id !== req.usuarioId) {
      return res.status(404).json({ error: 'Trato no encontrado' });
    }
    const actualizado = await maquina.aplicarTransicion(trato, 'rechazado', 'creadora', {
      actor_id: req.usuarioId,
      motivo_rechazo: req.body.motivo || null,
      nota: 'Rechazado por la creadora',
    });

    const marca = await db.getMarcaById(trato.marca_id);
    notificaciones.tratoRechazado({ trato: actualizado, marca }).catch(e =>
      console.error('[notif] tratoRechazado:', e.message)
    );

    res.json({ ok: true, trato: actualizado });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/** Entrega del contenido publicado. */
router.post('/tratos/:id/entregar', async (req, res) => {
  try {
    const { url_contenido, notas } = req.body;
    if (!url_contenido) {
      return res.status(400).json({ error: 'Falta el link del contenido publicado' });
    }

    const trato = await db.getTratoById(req.params.id);
    if (!trato || trato.creadora_id !== req.usuarioId) {
      return res.status(404).json({ error: 'Trato no encontrado' });
    }

    await db.insertEntrega({
      trato_id: trato.id,
      url_contenido,
      notas_creadora: notas || null,
      estado: 'en_revision',
    });

    const actualizado = await maquina.aplicarTransicion(trato, 'entregado', 'creadora', {
      actor_id: req.usuarioId,
      nota: 'Contenido entregado',
    });

    const marca = await db.getMarcaById(trato.marca_id);
    notificaciones.contenidoEntregado({ trato: actualizado, marca }).catch(e =>
      console.error('[notif] contenidoEntregado:', e.message)
    );

    res.json({ ok: true, trato: actualizado });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

module.exports = router;
