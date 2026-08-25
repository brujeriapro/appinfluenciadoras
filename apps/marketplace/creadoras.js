// Router del lado creadora: sesión, perfil propio y respuesta a los tratos.
//
// La cuenta es propia de Creators Manager, separada de la del portal de Brujas
// Embajadoras: mismo ser humano, credenciales distintas, secretos distintos.

const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('./db');
const config = require('./config');
const referidos = require('./referidos');
const maquina = require('./tratos');
const { resumirTarifas, rangoAlcance, resumirAlcance } = require('./comisiones');
const { creadoraAuth, firmarToken, rateLimit } = require('./auth');
const notificaciones = require('./notificaciones');
const { subirMuestra, borrarMuestra, subirArchivo, borrarArchivo } = require('./muestras');

const router = express.Router();

// ── Registro ────────────────────────────────────────────────────────────────

/**
 * Registro abierto de creadoras.
 *
 * Nadie entra al catálogo por registrarse: el perfil nace con visible=false y
 * estado 'nueva'. Primero pone sus tarifas, luego el equipo lo revisa. Ese
 * filtro humano es lo que sostiene la promesa de "banco curado" — sin él, el
 * catálogo se llena de perfiles sin verificar y deja de valer para las marcas.
 */
/** ¿Este enlace de invitación todavía sirve? Público: se consulta sin sesión. */
router.get('/referido/:codigo', async (req, res) => {
  try {
    const r = await referidos.validar(req.params.codigo);
    res.json({ vale: r.vale, restantes: r.restantes || 0, invita: r.invita || null, motivo: r.motivo });
  } catch (e) {
    res.json({ vale: false, motivo: 'error' });
  }
});

router.post('/registro', rateLimit({ windowMs: 600_000, max: 5 }), async (req, res) => {
  try {
    const {
      nombre_publico, nombre_real, email, password, whatsapp, pais, departamento, ciudad,
      instagram, tiktok, seguidores_instagram, seguidores_tiktok, acepta_terminos,
      codigo_ref,
    } = req.body;

    if (!nombre_publico || !email || !password) {
      return res.status(400).json({ error: 'Faltan tu nombre, correo o contraseña' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }
    if (!instagram && !tiktok) {
      return res.status(400).json({ error: 'Necesitamos al menos una red para poder verificarte' });
    }
    if (acepta_terminos !== true) {
      return res.status(400).json({ error: 'Debes aceptar los términos' });
    }

    // Un código de referida inválido o agotado NO impide registrarse: se entra
    // igual, solo que sin quedar atribuida a nadie. Perder una creadora por un
    // enlace mal copiado sería absurdo.
    let referidaPor = null;
    if (codigo_ref) {
      const r = await referidos.validar(codigo_ref).catch(() => ({ vale: false }));
      if (r.vale) referidaPor = r.codigo;
    }

    const cfg = await db.getConfig();
    if (cfg.registro_creadoras_abierto === false) {
      return res.status(403).json({
        error: 'El registro está cerrado por ahora. Escríbenos y te avisamos cuando abra.',
      });
    }

    const alcance = resumirAlcance(
      { instagram: seguidores_instagram, tiktok: seguidores_tiktok },
      cfg.rangos_alcance || []
    );
    // El minimo se mide sobre la suma: quien tiene 600 en cada red igual tiene
    // 1.200 personas que la escuchan.
    const minimo = Number(cfg.alcance_minimo_registro ?? 1000);
    if ((alcance.alcance_total || 0) < minimo) {
      return res.status(400).json({
        error: `Por ahora trabajamos con cuentas desde ${minimo.toLocaleString('es-CO')} seguidores entre tus redes.`,
      });
    }

    const emailNorm = String(email).toLowerCase().trim();
    if (await db.getCreadoraPorEmail(emailNorm)) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo. Inicia sesión.' });
    }

    // Dos personas no pueden reclamar el mismo @usuario.
    const limpio = (h) => h ? String(h).replace('@', '').toLowerCase().trim() : null;
    const ig = limpio(instagram);
    const tk = limpio(tiktok);
    if (ig && await db.getCreadoraPorHandle(ig)) {
      return res.status(409).json({ error: 'Ese usuario de Instagram ya está registrado.' });
    }

    const creadora = await db.insertCreadora({
      nombre_publico: String(nombre_publico).trim(),
      email: emailNorm,
      password_hash: await bcrypt.hash(String(password), 10),
      whatsapp: whatsapp || null,
      codigo: await db.siguienteCodigoCreadora(),
      pais: (pais || 'CO').toUpperCase(),
      departamento: departamento || null,
      ciudad: ciudad || null,
      ...alcance,
      visible: false,
      estado_perfil: 'nueva',
      origen: referidaPor ? 'referida' : 'registro',
      referida_por: referidaPor,
    });

    // Lo sensible va a la tabla aparte: el catálogo consulta mk_creadoras y ahí
    // no hay nada que pueda filtrar por accidente.
    await db.guardarPrivadoDeCreadora(creadora.id, {
      nombre_real: nombre_real || null,
      instagram_handle: ig,
      tiktok_handle: tk,
    });

    notificaciones.bienvenidaCreadora({ creadora }).catch(e =>
      console.error('[notif] bienvenidaCreadora:', e.message));
    notificaciones.avisoPerfilNuevo({ creadora, instagram: ig, tiktok: tk, alcance: alcance.alcance_total }).catch(e =>
      console.error('[notif] avisoPerfilNuevo:', e.message));

    console.log(`[registro] Nueva creadora: ${creadora.nombre_publico} (${ig || tk}) — pendiente de revisión`);
    res.json({ ok: true, token: firmarToken(creadora.id, 'creadora') });
  } catch (e) {
    console.error('[creadoras/registro]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Países disponibles. Público, porque el formulario de registro lo necesita
 * antes de que exista una sesión.
 */
router.get('/paises', async (req, res) => {
  try {
    const cfg = await db.getConfig();
    res.json({
      paises: cfg.paises || [{ codigo: 'CO', nombre: 'Colombia' }],
      // Solo Colombia tiene lista cerrada de departamentos y ciudades. En los
      // demas paises el campo es libre: una lista incompleta seria peor.
      departamentos_co: cfg.departamentos_co || [],
      // Todas las tarifas son en pesos colombianos, viva donde viva. La
      // interfaz tiene que decirlo: sin eso, alguien en México pone "500.000"
      // pensando en pesos mexicanos.
      moneda_unica: cfg.moneda_unica !== false,
      moneda: cfg.moneda || 'COP',
    });
  } catch (e) {
    res.json({ paises: [{ codigo: 'CO', nombre: 'Colombia' }], moneda_unica: true, moneda: 'COP' });
  }
});

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

// ── Recuperar contraseña ────────────────────────────────────────────────────

/**
 * Pide el enlace de recuperación.
 *
 * Responde ok aunque el correo no exista: decir "ese correo no está registrado"
 * le confirmaría a un extraño qué creadoras hay en la plataforma.
 */
router.post('/olvide-clave', rateLimit({ windowMs: 600_000, max: 5 }), async (req, res) => {
  try {
    const creadora = await db.getCreadoraPorEmail(req.body.email || '');
    if (creadora) {
      const token = crypto.randomBytes(32).toString('hex');
      await db.crearTokenReset({
        token,
        tipo: 'creadora',
        usuario_id: creadora.id,
        expira_at: new Date(Date.now() + 60 * 60_000).toISOString(),   // una hora
      });
      notificaciones.resetClave({ email: creadora.email, token, lado: 'creadora' })
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
    if (!t || t.tipo !== 'creadora' || t.usado_at || new Date(t.expira_at) < new Date()) {
      return res.status(400).json({ error: 'Ese enlace ya no sirve. Pide uno nuevo.' });
    }

    await db.updateCreadora(t.usuario_id, { password_hash: await bcrypt.hash(String(password), 10) });
    await db.marcarTokenUsado(token);

    res.json({ ok: true, token: firmarToken(t.usuario_id, 'creadora') });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── A partir de aquí, todo exige sesión de creadora ─────────────────────────

router.use(creadoraAuth);

/**
 * En qué punto va su perfil y qué le falta para salir en el catálogo.
 *
 * Existe para que nadie quede esperando sin saber por qué no le llegan
 * propuestas: el portal se lo dice con todas las letras.
 */
router.get('/estado', async (req, res) => {
  try {
    const [c, tarifas, muestras, priv] = await Promise.all([
      db.getCreadoraCompleta(req.usuarioId),
      db.getTarifasDeCreadora(req.usuarioId),
      db.getMuestrasDeCreadora(req.usuarioId),
      db.getPrivadoDeCreadora(req.usuarioId),
    ]);
    if (!c) return res.status(404).json({ error: 'Perfil no encontrado' });

    const conTarifas = tarifas.some(t => t.activo !== false);
    const conRedes = Boolean(priv?.instagram_handle || priv?.tiktok_handle);

    // Lo que le falta para poder ser revisada, en el orden en que lo va a hacer.
    const faltantes = [];
    if (!(c.nicho || []).length) faltantes.push('nicho');
    if (!conRedes)               faltantes.push('redes');
    if (!muestras.length)        faltantes.push('trabajo');
    // La tarifa ya no bloquea nada, pero sigue valiendo la pena sugerirla: una
    // ficha con precio le ahorra a la marca tener que preguntar.
    const sugerencias = [];
    if (!conTarifas && !c.tarifa_abierta) sugerencias.push('tarifas');

    // Lo que le decimos, según lo que le falte. Concreto y en su idioma: nadie
    // debería quedarse esperando sin saber por qué no le llegan propuestas.
    const QUE_FALTA = {
      nicho:   'elegir tu nicho',
      redes:   'poner tus redes',
      tarifas: 'poner tus tarifas',
      trabajo: 'subir al menos una pieza de tu trabajo',
    };

    let mensaje, tono;
    if (c.estado_perfil === 'rechazada') {
      tono = 'malo';
      mensaje = c.motivo_rechazo
        ? `Tu perfil no fue aprobado: ${c.motivo_rechazo}`
        : 'Tu perfil no fue aprobado. Escríbenos si quieres saber más.';
    } else if (c.visible && !muestras.length) {
      tono = 'accion';
      mensaje = 'Tu perfil está publicado, pero sin una sola pieza de tu trabajo las '
              + 'marcas no tienen qué mirar. Sube al menos una: es lo que más te va a '
              + 'traer propuestas.';
    } else if (c.visible) {
      tono = 'bueno';
      mensaje = sugerencias.includes('tarifas')
        ? 'Tu perfil está publicado. Si pones tus tarifas, las marcas llegan sabiendo cuánto cobras.'
        : 'Tu perfil está publicado. Las marcas ya te pueden encontrar.';
    } else if (faltantes.length) {
      tono = 'accion';
      const lista = faltantes.map(f => QUE_FALTA[f]).filter(Boolean);
      const texto = lista.length === 1
        ? lista[0]
        : lista.slice(0, -1).join(', ') + ' y ' + lista[lista.length - 1];
      mensaje = `Para que revisemos tu perfil te falta ${texto}.`;
    } else {
      tono = 'espera';
      mensaje = 'Ya tenemos todo. Estamos revisando tu perfil y te avisamos por correo.';
    }

    res.json({
      estado_perfil: c.estado_perfil,
      visible: c.visible,
      nicho: c.nicho || [],
      fuente_metricas: c.fuente_metricas || 'declarado',
      faltantes,
      sugerencias,
      mensaje,
      tono,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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

// ── Su perfil: lo completa ella ─────────────────────────────────────────────

/**
 * Datos editables del perfil, incluidas sus redes.
 *
 * Las redes se guardan en mk_creadora_privado, nunca en mk_creadoras: el
 * catálogo consulta esa segunda tabla y no debe tener por dónde filtrarlas.
 */
router.put('/perfil', async (req, res) => {
  try {
    const { nombre_publico, bio_corta, pais, departamento, ciudad, whatsapp,
            instagram, tiktok, seguidores_instagram, seguidores_tiktok } = req.body;

    const datos = {};
    if (nombre_publico !== undefined) {
      const n = String(nombre_publico).trim();
      if (!n) return res.status(400).json({ error: 'El nombre no puede quedar vacío' });
      datos.nombre_publico = n;
    }
    if (bio_corta !== undefined) datos.bio_corta = String(bio_corta).slice(0, 240);
    if (pais !== undefined)         datos.pais = String(pais || 'CO').toUpperCase();
    if (departamento !== undefined) datos.departamento = departamento || null;
    if (ciudad !== undefined)    datos.ciudad = ciudad || null;
    if (whatsapp !== undefined)  datos.whatsapp = whatsapp || null;

    const actual = await db.getCreadoraCompleta(req.usuarioId);
    if (!actual) return res.status(404).json({ error: 'Perfil no encontrado' });

    // Mientras las métricas sean declaradas, ella puede corregir su alcance.
    // Cuando vengan verificadas de Meta, el número lo manda la API y este
    // campo deja de aceptarse: sería absurdo dejarla sobrescribir un dato
    // verificado con uno inventado.
    if ((seguidores_instagram !== undefined || seguidores_tiktok !== undefined)
        && actual.fuente_metricas !== 'verificado') {
      const cfg = await db.getConfig();
      Object.assign(datos, resumirAlcance({
        instagram: seguidores_instagram ?? actual.seguidores_instagram,
        tiktok: seguidores_tiktok ?? actual.seguidores_tiktok,
      }, cfg.rangos_alcance || []));
    }

    const actualizada = await db.updateCreadora(req.usuarioId, datos);

    if (instagram !== undefined || tiktok !== undefined) {
      const limpio = (h) => h ? String(h).replace('@', '').toLowerCase().trim() : null;
      const ig = limpio(instagram);

      // Que no reclame un @usuario que ya tiene otra.
      if (ig) {
        const dueno = await db.getCreadoraPorHandle(ig);
        if (dueno && dueno !== req.usuarioId) {
          return res.status(409).json({ error: 'Ese usuario de Instagram ya está registrado por otra creadora.' });
        }
      }
      const cambios = {};
      if (instagram !== undefined) cambios.instagram_handle = ig;
      if (tiktok !== undefined)    cambios.tiktok_handle = limpio(tiktok);
      await db.guardarPrivadoDeCreadora(req.usuarioId, cambios);
    }

    res.json({ ok: true, creadora: actualizada });
  } catch (e) {
    console.error('[creadoras/perfil]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/** Sus redes, para poder mostrárselas en el formulario. */
router.get('/redes', async (req, res) => {
  try {
    const [priv, c] = await Promise.all([
      db.getPrivadoDeCreadora(req.usuarioId),
      db.getCreadoraCompleta(req.usuarioId),
    ]);
    res.json({
      instagram: priv?.instagram_handle || null,
      tiktok: priv?.tiktok_handle || null,
      fuente_metricas: c?.fuente_metricas || 'declarado',
      seguidores_instagram: c?.seguidores_instagram || null,
      seguidores_tiktok: c?.seguidores_tiktok || null,
      alcance_total: c?.alcance_total || null,
      // La conexión con Meta todavía no existe: el portal usa esto para
      // mostrar el botón o un "próximamente".
      conexion_disponible: (await db.getConfig()).instagram_conexion_activa === true,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Su foto de perfil ───────────────────────────────────────────────────────

router.put('/foto', async (req, res) => {
  try {
    const actual = await db.getCreadoraCompleta(req.usuarioId);
    if (!actual) return res.status(404).json({ error: 'Perfil no encontrado' });

    const { storage_path, mime } = await subirArchivo(req.body);
    await db.updateCreadora(req.usuarioId, {
      foto_perfil_path: storage_path,
      foto_perfil_mime: mime,
    });

    // La anterior se borra después de guardar la nueva: si se borrara antes y
    // fallara la subida, quedaría sin foto.
    if (actual.foto_perfil_path) borrarArchivo(actual.foto_perfil_path);

    res.json({ ok: true });
  } catch (e) {
    console.error('[creadoras/foto]', e.message);
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.delete('/foto', async (req, res) => {
  try {
    const actual = await db.getCreadoraCompleta(req.usuarioId);
    if (actual?.foto_perfil_path) borrarArchivo(actual.foto_perfil_path);
    await db.updateCreadora(req.usuarioId, { foto_perfil_path: null, foto_perfil_mime: null });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Su trabajo ──────────────────────────────────────────────────────────────

router.get('/muestras', async (req, res) => {
  try {
    const [muestras, cfg] = await Promise.all([
      db.getMuestrasDeCreadora(req.usuarioId),
      db.getConfig(),
    ]);
    res.json({ muestras, maximo: Number(cfg.max_muestras_por_creadora ?? 6) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/muestras', rateLimit({ windowMs: 300_000, max: 20 }), async (req, res) => {
  try {
    const muestra = await subirMuestra(req.usuarioId, { ...req.body, subida_por: 'creadora' });
    res.json({ ok: true, muestra: { id: muestra.id, tipo: muestra.tipo, titulo: muestra.titulo } });
  } catch (e) {
    console.error('[creadoras/muestras]', e.message);
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.delete('/muestras/:id', async (req, res) => {
  try {
    // Solo puede borrar lo suyo.
    const muestra = await db.getMuestra(req.params.id);
    if (!muestra || muestra.creadora_id !== req.usuarioId) {
      return res.status(404).json({ error: 'Pieza no encontrada' });
    }
    await borrarMuestra(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
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
      moneda_unica: cfg.moneda_unica !== false,
      tarifa_abierta: (await db.getCreadoraCompleta(req.usuarioId))?.tarifa_abierta === true,
      entregables: cfg.entregables || [],
      rango: cfg.rango_tarifa || { min: 50000, max: 8000000, paso: 10000 },
      // La comisión viaja al front para que el neto se actualice mientras ella
      // mueve el deslizador. La fuente de verdad sigue siendo el backend: al
      // crear un trato se congela el porcentaje y se recalcula allá.
      comision_creadora_pct: Number(cfg.comision_creadora_pct ?? 8),
      horas_pago_tras_aprobar: Number(cfg.horas_pago_tras_aprobar ?? 48),
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

    // Poner tarifas es lo que la mueve de "recién registrada" a la cola de
    // revisión. Si ya está aprobada, no se toca su estado.
    const actual = await db.getCreadoraCompleta(req.usuarioId);
    const cambios = { ...resumen };

    // El perfil entra a la cola cuando tiene lo que una marca necesita para
    // decidir: nicho, una red y algo de su trabajo. La tarifa no está en esa
    // lista a propósito — se puede acordar después, y exigirla dejaba fuera a
    // quien no sabía qué cobrar.
    if (actual?.estado_perfil === 'nueva') {
      const [muestras, priv] = await Promise.all([
        db.getMuestrasDeCreadora(req.usuarioId),
        db.getPrivadoDeCreadora(req.usuarioId),
      ]);
      const completo = (actual.nicho || []).length
        && (priv?.instagram_handle || priv?.tiktok_handle)
        && muestras.length;
      if (completo) {
        cambios.estado_perfil = 'en_revision';
        cambios.perfil_completo_at = new Date().toISOString();
        notificaciones.avisoListaParaRevisar({ creadora: actual }).catch(e =>
          console.error('[notif] avisoListaParaRevisar:', e.message));
      }
    }
    await db.updateCreadora(req.usuarioId, cambios);

    res.json({ ok: true, tarifas: guardadas, ...resumen, estado_perfil: cambios.estado_perfil || actual?.estado_perfil });
  } catch (e) {
    console.error('[creadoras/tarifas]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/** Nichos que la creadora puede elegir para su perfil. */
router.get('/nichos', async (req, res) => {
  try {
    const cfg = await db.getConfig();
    res.json({
      categorias: cfg.nichos || [],
      paises: cfg.paises || [],
      departamentos_co: cfg.departamentos_co || [],
      max_subnichos: 3,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** La creadora elige sus nichos (hasta 3 subnichos). */
/**
 * "Prefiero conversar el precio". Es la salida para quien no sabe cuánto
 * cobrar: sin esto se quedaba con el perfil a medias, fuera del catálogo.
 */
router.put('/tarifa-abierta', async (req, res) => {
  try {
    const abierta = req.body.abierta === true;
    await db.updateCreadora(req.usuarioId, { tarifa_abierta: abierta });

    // Si ya no le falta nada más, esto es lo que la manda a revisión.
    const c = await db.getCreadoraCompleta(req.usuarioId);
    if (abierta && c?.estado_perfil === 'nueva') {
      const [muestras, priv] = await Promise.all([
        db.getMuestrasDeCreadora(req.usuarioId),
        db.getPrivadoDeCreadora(req.usuarioId),
      ]);
      if ((c.nicho || []).length && (priv?.instagram_handle || priv?.tiktok_handle) && muestras.length) {
        await db.updateCreadora(req.usuarioId, { estado_perfil: 'en_revision' });
      }
    }
    res.json({ ok: true, tarifa_abierta: abierta });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Su enlace de invitaciones y cuántas ha traído.
 *
 * Solo tiene sentido con el perfil ya publicado: invitar a otras antes de
 * estar ella misma adentro es pedirle que recomiende algo que aún no conoce.
 */
router.get('/mis-invitaciones', async (req, res) => {
  try {
    const c = await db.getCreadoraCompleta(req.usuarioId);
    if (!c) return res.status(404).json({ error: 'Perfil no encontrado' });
    if (!c.visible) return res.json({ disponible: false });

    const codigo = await referidos.asegurarCodigoDeCreadora(c);
    const usados = await referidos.contarUsos(codigo);
    const cupos = c.cupos_ref || 2;

    // Quiénes entraron por ella: le da algo que mirar, y saber que sirvió es
    // lo que hace que vuelva a invitar.
    const traidas = await db.get('mk_creadoras', {
      referida_por: `eq.${codigo}`,
      select: 'nombre_publico,visible,created_at',
      order: 'created_at.desc',
    });

    res.json({
      disponible: true,
      codigo,
      enlace: `${config.base_url}/invitacion.html?ref=${encodeURIComponent(codigo)}`,
      cupos,
      usados,
      prioridad: c.prioridad || 0,
      restantes: Math.max(0, cupos - usados),
      traidas: traidas.map(t => ({ nombre: t.nombre_publico, publicada: t.visible })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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
    const [eventos, entregas, marcaCompleta, cfg, previos] = await Promise.all([
      db.getEventosDeTrato(trato.id),
      db.getEntregasDeTrato(trato.id),
      db.getMarcaById(trato.marca_id),
      db.getConfig(),
      db.contarTratosPrevios(trato.marca_id, req.usuarioId),
    ]);

    // Antes de que se revele el contacto, la creadora ve el nombre de la marca
    // y su ciudad —lo necesita para decidir— pero no el correo ni el teléfono.
    const marca = maquina.contactoVisible(trato)
      ? marcaCompleta
      : {
          nombre_empresa: marcaCompleta?.nombre_empresa,
          ciudad: marcaCompleta?.ciudad,
        };

    // Ventana para responder. Por ahora es informativa: se muestra, pero
    // todavía no hay proceso que expire la propuesta al vencerse.
    const horas = Number(cfg.horas_responder_propuesta ?? 72);
    const vence = trato.fecha_solicitud
      ? new Date(new Date(trato.fecha_solicitud).getTime() + horas * 3600_000).toISOString()
      : null;

    res.json({
      ...trato,
      marca,
      campanas_previas: previos,
      contacto_visible: maquina.contactoVisible(trato),
      responder_antes_de: vence,
      horas_responder: horas,
      horas_aprobar: Number(cfg.horas_aprobar_entrega ?? 48),
      horas_pago_tras_aprobar: Number(cfg.horas_pago_tras_aprobar ?? 48),
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
