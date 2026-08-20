// Router del lado creadora: sesión, perfil propio y respuesta a los tratos.
//
// La cuenta es propia de Creadores.app, separada de la del portal de Brujas
// Embajadoras: mismo ser humano, credenciales distintas, secretos distintos.

const express = require('express');
const bcrypt = require('bcrypt');
const db = require('./db');
const maquina = require('./tratos');
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
    const muestras = await db.getMuestrasDeCreadora(creadora.id);
    const { password_hash, ...perfil } = creadora;
    res.json({ ...perfil, muestras });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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
