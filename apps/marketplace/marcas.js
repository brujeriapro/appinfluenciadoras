// Router del lado marca: registro por invitación, sesión y gestión de tratos.

const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('./db');
const config = require('./config');
const { calcularTrato } = require('./comisiones');
const maquina = require('./tratos');
const seleccion = require('./seleccion');
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

    // Solo cuatro campos. NIT, ciudad y persona de contacto se piden en el
    // perfil, cuando ya hay una cuenta que perder: cada campo de más en el
    // registro es gente que no termina de registrarse.
    if (!nombre_empresa || !email || !password) {
      return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }
    // Sin esto, la cláusula de no-circunvalación no es exigible más adelante.
    if (acepta_terminos !== true) {
      return res.status(400).json({ error: 'Debes aceptar los términos y condiciones' });
    }

    // El registro es abierto: lo que sostiene la calidad ya no es un código
    // sino el plan. Quien entra ve 3 fichas del demo, y para ver más tiene que
    // poner tarjeta y datos de empresa — mejor filtro que un código que se
    // reenvía por WhatsApp.
    //
    // El código sigue existiendo por si hay que cerrar el registro: se apaga
    // `registro_marcas_abierto` y vuelve a exigirse, sin desplegar nada.
    const cfgReg = await db.getConfig();
    const codigo = String(codigo_invitacion || '').trim().toUpperCase();

    if (cfgReg.registro_marcas_abierto === false) {
      if (!config.codigos_invitacion.includes(codigo)) {
        return res.status(403).json({ error: 'Código de invitación no válido' });
      }
    }

    const emailNorm = String(email).toLowerCase().trim();
    if (await db.getMarcaPorEmail(emailNorm)) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
    }

    // La promo de apertura, si está viva. Se resuelve antes del insert para que
    // el plan quede puesto desde el primer segundo: si se hiciera después, una
    // marca que entra y manda su primera propuesta de inmediato la mandaría
    // contra el tope de Explora.
    const promo = await planDeLanzamiento().catch(() => null);

    const marca = await db.insertMarca({
      nombre_empresa,
      nombre_contacto: nombre_contacto || null,
      email: emailNorm,
      password_hash: await bcrypt.hash(String(password), 10),
      whatsapp: whatsapp || null,
      nit: nit || null,
      pais: (pais || 'CO').toUpperCase(),
      departamento: departamento || null,
      ciudad: ciudad || null,
      sitio_web: sitio_web || null,
      codigo_invitacion: codigo || null,
      terminos_version: TERMINOS_VERSION,
      terminos_aceptados_at: new Date().toISOString(),
      terminos_ip: ipDe(req),
      ...(promo ? { plan: promo.clave, plan_vence_at: promo.vence_at } : {}),
    });

    // Sin await: un correo caído no puede tumbar un registro. Con 300
    // creadoras y un puñado de marcas, cada registro de marca es el cuello de
    // botella del negocio moviéndose — vale la pena enterarse el mismo día.
    notificaciones.marcaNueva({ marca })
      .catch(e => console.error('[notif] marcaNueva:', e.message));

    res.json({ ok: true, token: firmarToken(marca.id, 'marca'), marca_id: marca.id });
  } catch (e) {
    console.error('[marcas/registro]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * ¿Hace falta código de invitación? Público, porque el formulario lo consulta
 * antes de que exista sesión.
 */
router.get('/registro-abierto', async (req, res) => {
  try {
    const cfg = await db.getConfig();
    res.json({ abierto: cfg.registro_marcas_abierto !== false });
  } catch (e) {
    res.json({ abierto: true });
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

    // ¿Este plan se lo regalamos por el lanzamiento? Se sabe comparando el
    // vencimiento con la fecha de la promo: quien pagó tiene otro corte. Sin
    // esto la marca ve "Escala" y no entiende que se lo dimos — y un regalo
    // que no se nota no agradece nada.
    const promo = cfg.promo_lanzamiento;
    const de_lanzamiento = Boolean(
      vigente && promo?.activa && promo.plan === clave &&
      marca.plan_vence_at?.slice(0, 10) >= promo.hasta &&
      new Date(marca.plan_vence_at) - new Date(`${promo.hasta}T23:59:59-05:00`) === 0
    );

    res.json({
      activo: cfg.planes_activos === true,
      plan: clave,
      nombre: actual?.nombre || 'Demo',
      vence_at: vigente ? marca.plan_vence_at : null,
      de_lanzamiento,
      promo_hasta: promo?.activa ? promo.hasta : null,
      fichas_vistas: vistas,
      propuestas_tope: actual?.propuestas_mes ?? null,
      propuestas_enviadas: await db.contarPropuestasDelMes(req.usuarioId),
      planes,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Triage: preseleccionar y descartar ──────────────────────────────────────

/**
 * El home editorial: destacado, selección curada y colecciones.
 *
 * Una sola llamada porque el home no se puede pintar por partes: tres
 * peticiones en cascada dejan la primera pantalla armándose a pedazos, y esta
 * es justo la pantalla que decide si una marca se queda.
 *
 * Devuelve ids de creadoras, no perfiles completos: el panel ya tiene el
 * catálogo cargado y los cruza en memoria. Mandarlos otra vez sería repetir
 * doscientos perfiles para mostrar veinte.
 */
/**
 * Guarda las seis respuestas del registro y abre la solicitud de selección.
 *
 * La solicitud nace con su vencimiento a 24 horas porque eso es lo que se le
 * acaba de prometer en pantalla. Sin el dato, la promesa es solo una frase: la
 * cola del equipo no puede ordenarse por urgencia y se incumple sin que nadie
 * lo note.
 */
router.post('/busqueda', async (req, res) => {
  try {
    const limpio = seleccion.normalizarBusqueda(req.body);
    const respuestas = { ...limpio, busca_completado_at: new Date().toISOString() };

    try {
      await db.updateMarca(req.usuarioId, respuestas);
    } catch (e) {
      // Mientras mk_057 no esté aplicada, `busca_canal` sigue siendo texto y
      // mandarle un arreglo rechaza el PATCH ENTERO: se perderían las seis
      // respuestas, no solo el canal.
      //
      // Se guardan las otras cinco y el canal queda vacío. Vacío es honesto —
      // quien arme la selección ve que falta— y "tiktok" a secas cuando marcó
      // tres no lo es. En cuanto se corra la migración deja de pasar.
      const esColumnaVieja = /busca_canal/.test(e.message)
        && /(invalid input|malformed|does not exist|22P02|42703)/.test(e.message);
      if (!esColumnaVieja) throw e;

      console.warn('[marcas/busqueda] Falta mk_057: se guarda el registro sin el canal.');
      const { busca_canal, busca_canal_otra, ...resto } = respuestas;
      await db.updateMarca(req.usuarioId, resto);
    }

    // Si ya tenía una solicitud abierta se reutiliza: responder el registro dos
    // veces no debería poner al equipo a armar dos selecciones.
    let solicitud = await db.getSeleccionDeMarca(req.usuarioId, 'solicitada')
      || await db.getSeleccionDeMarca(req.usuarioId, 'borrador');

    if (!solicitud) {
      solicitud = await db.insertSeleccion({
        marca_id: req.usuarioId,
        estado: 'solicitada',
        vence_at: new Date(Date.now() + seleccion.HORAS_PROMESA * 3600_000).toISOString(),
        creada_por: 'registro',
      });
    }

    res.json({ ok: true, vence_at: solicitud.vence_at, respuestas: limpio });
  } catch (e) {
    console.error('[marcas/busqueda]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/** Las opciones del registro, para que el formulario no las tenga escritas. */
router.get('/busqueda/opciones', (req, res) => {
  res.json({
    categorias: seleccion.CATEGORIAS,
    canales: seleccion.CANALES,
    audiencias: seleccion.AUDIENCIAS,
    ciudades: seleccion.CIUDADES,
    tamanos: seleccion.TAMANOS,
    topes: seleccion.TOPES,
  });
});

router.get('/home', async (req, res) => {
  try {
    const [destacado, seleccion, colecciones] = await Promise.all([
      db.getDestacado().catch(() => null),
      db.getSeleccionDeMarca(req.usuarioId, 'publicada').catch(() => null),
      db.getColecciones({ soloActivas: true }).catch(() => []),
    ]);

    let piezaDestacada = null;
    if (destacado) {
      const m = await db.getMuestra(destacado.muestra_id).catch(() => null);
      if (m) {
        const c = await db.getCreadoraCatalogo(m.creadora_id).catch(() => null);
        piezaDestacada = {
          titulo: destacado.titulo,
          muestra: { id: m.id, tipo: m.tipo, poster: Boolean(m.poster_path) },
          // Nunca el nombre real ni el handle: esto es lo primero que ve la
          // marca, y es exactamente donde más fácil se filtraría una identidad.
          creadora: c && {
            id: c.id, codigo: c.codigo, nombre_publico: c.nombre_publico,
            nicho: c.nicho, ciudad: c.ciudad,
          },
        };
      }
    }

    // La selección solo viaja si está PUBLICADA. Un borrador es trabajo del
    // equipo a medio hacer; que se filtre al panel de la marca sería mostrarle
    // una recomendación que nadie terminó de revisar.
    let miSeleccion = null;
    if (seleccion) {
      const items = await db.getItemsDeSeleccion(seleccion.id);
      miSeleccion = {
        publicada_at: seleccion.publicada_at,
        items: items.map(i => ({ creadora_id: i.creadora_id, razon: i.razon })),
      };
    }

    res.json({
      destacado: piezaDestacada,
      seleccion: miSeleccion,
      colecciones: colecciones.map(c => ({
        slug: c.slug, nombre: c.nombre, descripcion: c.descripcion,
        color: c.color, creadora_ids: c.creadora_ids,
      })),
    });
  } catch (e) {
    console.error('[marcas/home]', e.message);
    res.status(500).json({ error: e.message });
  }
});

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
/**
 * ¿Le quedan propuestas este mes?
 *
 * Un plan vencido vuelve a los límites del gratuito sin quitarle la cuenta: la
 * marca sigue entrando y viendo todo, solo baja su cupo de propuestas.
 */
/**
 * El plan de regalo con el que entra una marca nueva, si hay promo viva.
 *
 * Devuelve null cuando no aplica, y entonces la marca entra como siempre: sin
 * plan, o sea Explora.
 *
 * La fecha se compara al final del día para que quien se registre el 30 a las
 * once de la noche alcance a entrar. Un corte a medianoche UTC dejaría por
 * fuera a media Colombia el último día, que es justo cuando más gente entra.
 */
async function planDeLanzamiento() {
  const cfg = await db.getConfig();
  const promo = cfg.promo_lanzamiento;
  if (!promo || promo.activa !== true || !promo.plan || !promo.hasta) return null;

  const vence = new Date(`${promo.hasta}T23:59:59-05:00`);
  if (!Number.isFinite(vence.getTime()) || vence <= new Date()) return null;

  // Si la clave apunta a un plan que no existe o está apagado, no se regala
  // nada. Vale más que la marca entre en Explora a que entre con un plan roto.
  const plan = await db.getPlan(promo.plan);
  if (!plan || plan.activo === false) {
    console.warn('[promo] plan_lanzamiento apunta a un plan inexistente:', promo.plan);
    return null;
  }

  return { clave: plan.clave, nombre: plan.nombre, vence_at: vence.toISOString() };
}

async function topeDePropuestas(marca_id) {
  const cfg = await db.getConfig();
  if (cfg.planes_activos !== true) {
    return { bloqueada: false, plan: null, enviadas: 0, tope: null };
  }

  const marca = await db.getMarcaById(marca_id);
  const vigente = marca?.plan_vence_at && new Date(marca.plan_vence_at) > new Date();
  const clave = vigente ? (marca.plan || 'demo') : 'demo';
  const plan = await db.getPlan(clave);
  const tope = plan?.propuestas_mes ?? null;

  if (tope === null) return { bloqueada: false, plan: clave, enviadas: null, tope: null };

  const enviadas = await db.contarPropuestasDelMes(marca_id);
  if (enviadas >= tope) {
    return {
      bloqueada: true, plan: clave, enviadas, tope,
      mensaje: `Llegaste a las ${tope} propuestas de tu plan este mes. `
             + 'Cambia de plan para seguir proponiendo.',
    };
  }
  return { bloqueada: false, plan: clave, enviadas, tope };
}

router.post('/tratos', rateLimit({ max: 20 }), async (req, res) => {
  try {
    const { creadora_id, campana_id, brief, entregables, monto,
            fecha_entrega_esperada, producto, exclusividad,
            producto_detalle, exclusividad_detalle } = req.body;

    // Un canje es producto por contenido: no lleva monto, y por eso no puede
    // pasar por la validación que exige uno. Solo se acepta el valor exacto,
    // nunca "cualquier cosa distinta de dinero": un typo en el cuerpo no puede
    // convertir una propuesta de $800.000 en un trato sin plata.
    const tipo_pago = req.body.tipo_pago === 'canje' ? 'canje' : 'dinero';
    const esCanje = tipo_pago === 'canje';

    if (!creadora_id || (!esCanje && !monto)) {
      return res.status(400).json({ error: 'Faltan la creadora o el monto' });
    }

    // El plan limita cuántas propuestas se envían al mes. Es el único tope que
    // existe: buscar en el catálogo es libre, porque limitar la búsqueda no
    // protege nada e impide encontrar a la creadora que vale la pena.
    const limite = await topeDePropuestas(req.usuarioId);
    if (limite.bloqueada) {
      return res.status(402).json({
        error: limite.mensaje,
        muro: true,
        plan: limite.plan,
        enviadas: limite.enviadas,
        tope: limite.tope,
      });
    }

    // Si la propuesta sale de una campaña, lo que no venga en el cuerpo se
    // hereda de ella: el brief se escribe una vez y sirve para veinte
    // propuestas. El monto nunca se hereda, porque cada creadora tiene su
    // tarifa.
    // El detalle se corta aquí y no solo en el formulario: el navegador es de
    // quien lo usa, y un maxlength no es una validación.
    const recorta = (t) => t ? String(t).trim().slice(0, 160) : null;

    let base = {
      brief, entregables, fecha_entrega_esperada, producto, exclusividad,
      producto_detalle: recorta(producto_detalle),
      exclusividad_detalle: recorta(exclusividad_detalle),
    };
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
        producto_detalle: recorta(producto_detalle),
        exclusividad_detalle: recorta(exclusividad_detalle),
      };
      // Un canje no gasta del presupuesto de la campaña, así que su tope no
      // aplica: compararlo contra un monto que no existe lo dejaría pasar
      // siempre y de paso escribiría un mensaje de error sin sentido.
      if (!esCanje && campana.tope_por_creadora && Number(monto) > Number(campana.tope_por_creadora)) {
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

    // Se crea por la misma función que usa la confirmación de una campaña con
    // cupos: un solo sitio donde se congelan las comisiones y se escribe el
    // primer evento.
    const { trato, creadora } = await maquina.crearTrato({
      marca_id: req.usuarioId,
      creadora_id,
      campana_id: campana_id || null,
      brief: base.brief,
      entregables: base.entregables,
      monto: esCanje ? 0 : monto,
      tipo_pago,
      fecha_entrega_esperada: base.fecha_entrega_esperada,
      producto: base.producto,
      exclusividad: base.exclusividad,
      producto_detalle: base.producto_detalle,
      exclusividad_detalle: base.exclusividad_detalle,
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
// Lo usa el router de campañas con cupos: cada creadora invitada consume una
// propuesta, y la cuenta tiene que salir del mismo sitio que la de las
// propuestas individuales.
module.exports.topeDePropuestas = topeDePropuestas;
