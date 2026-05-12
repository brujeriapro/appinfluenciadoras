const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const supabase = require('./supabase');
const shopify = require('./shopify');
const siigo = require('./siigo');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { calcularScore, calcularNivel, calcularTier } = require('./scoring');
const { enviarRecordatorioContenido } = require('./email');
const { enviarBienvenidaKit, enviarRecordatorioWhatsApp, enviarBienvenidaClub, enviarFeedbackContenido, enviarIdeasContenido, enviarReenganche } = require('./whatsapp');

// Rutas públicas — portal influencer, guía, auth y webhooks
const RUTAS_PUBLICAS = ['/influencer', '/guia', '/api/auth/', '/api/influencer/', '/api/webhooks/', '/api/cron/'];

function adminAuth(req, res, next) {
  const esPublica = RUTAS_PUBLICAS.some(r => req.path === r || req.path.startsWith(r));
  if (esPublica) return next();

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Creadoras Admin"');
    return res.status(401).send('Acceso restringido');
  }
  const credentials = Buffer.from(auth.slice(6), 'base64').toString();
  const colonIdx = credentials.indexOf(':');
  const user = credentials.slice(0, colonIdx);
  const pass = credentials.slice(colonIdx + 1);
  const expectedUser = process.env.ADMIN_USER || 'admin';
  const expectedPass = process.env.ADMIN_PASS;
  if (user === expectedUser && pass === expectedPass) {
    return next();
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Creadoras Admin"');
  return res.status(401).send('Credenciales incorrectas');
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  try {
    const payload = jwt.verify(auth.slice(7), config.jwt_secret);
    req.influencerId = payload.id;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

const app = express();
const PORT = process.env.PORT || 3030;

app.use(cors());
app.use(express.json());
app.use(adminAuth);
app.use(express.static(path.join(__dirname, 'public')));

// ── STATS DASHBOARD ──────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const preciosPorSku = await shopify.getPreciosPorSku();
    const stats = await supabase.getStats(preciosPorSku);
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── INFLUENCERS ───────────────────────────────────────────────────
app.get('/api/influencers/notificaciones-todas', async (req, res) => {
  try {
    const { influencer_ids } = req.query;
    const ids = influencer_ids ? influencer_ids.split(',') : null;
    const todas = await supabase.getInfluencers();
    const resultado = {};
    await Promise.all((ids ? todas.filter(i => ids.includes(i.id)) : todas).map(async inf => {
      const notifs = await supabase.getNotificacionesDeInfluencer(inf.id);
      resultado[inf.id] = notifs.map(n => n.template_name);
    }));
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Debe ir antes de /api/influencers/:id para que Express no lo confunda con un ID
app.get('/api/influencers/con-telefono', async (req, res) => {
  try {
    const todas = await supabase.getInfluencers();
    const conTelefono = todas.filter(i => i.telefono && String(i.telefono).trim() !== '');
    console.log(`[con-telefono] total: ${todas.length}, con telefono: ${conTelefono.length}`);
    todas.slice(0, 3).forEach(i => console.log(`  ${i.nombre}: telefono="${i.telefono}"`));
    res.json(conTelefono);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/influencers', async (req, res) => {
  try {
    const { status, tier, nivel_bruja } = req.query;
    const influencers = await supabase.getInfluencers({ status, tier, nivel_bruja });
    res.json(influencers);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/influencers/:id', async (req, res) => {
  try {
    const influencer = await supabase.getInfluencerById(req.params.id);
    if (!influencer) return res.status(404).json({ error: 'No encontrada' });
    const contenidos = await supabase.getContenidos(req.params.id);
    res.json({ ...influencer, contenidos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/influencers/:id', async (req, res) => {
  try {
    const allowed = ['status', 'codigo_descuento', 'notas_equipo', 'tipo_cabello', 'telefono', 'ciudad', 'departamento', 'direccion_envio', 'codigo_postal'];
    const data = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });
    await supabase.updateInfluencer(req.params.id, data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PRODUCTOS SHOPIFY (con stock real) ───────────────────────────
app.get('/api/config/productos', async (req, res) => {
  try {
    const productos = await shopify.getProductosConStock();
    productos.sort((a, b) => (b.stock ?? -1) - (a.stock ?? -1));
    res.json({ productos, kits: config.kits });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── ENVIAR KIT ────────────────────────────────────────────────────
app.post('/api/influencers/:id/enviar', async (req, res) => {
  const { skus, kit_nombre, direccion_envio, ciudad, departamento, telefono, codigo_postal } = req.body;
  if (!skus || !Array.isArray(skus) || skus.length === 0) {
    return res.status(400).json({ error: 'Se requiere al menos un SKU' });
  }

  try {
    const influencer = await supabase.getInfluencerById(req.params.id);
    if (!influencer) return res.status(404).json({ error: 'Influencer no encontrada' });

    // Aplicar dirección del modal (puede estar corregida por el admin)
    const camposDir = {};
    if (direccion_envio !== undefined) camposDir.direccion_envio = direccion_envio;
    if (ciudad !== undefined) camposDir.ciudad = ciudad;
    if (departamento !== undefined) camposDir.departamento = departamento;
    if (telefono !== undefined) camposDir.telefono = telefono;
    if (codigo_postal !== undefined) camposDir.codigo_postal = codigo_postal;

    const influencerParaOrden = { ...influencer, ...camposDir };

    // Persistir correcciones de dirección en Supabase si cambiaron
    const huboCambio = Object.entries(camposDir).some(([k, v]) => v && v !== influencer[k]);
    if (huboCambio) await supabase.updateInfluencer(req.params.id, camposDir);

    // 1. Crear orden Shopify
    const kitLabel = kit_nombre || `${skus.length} producto(s)`;
    const shopifyResult = await shopify.createGiftingOrder(influencerParaOrden, skus, kitLabel);

    // 2. Actualizar Supabase
    await supabase.updateEnvio(req.params.id, {
      skus,
      shopify_order_id: shopifyResult.shopify_order_id,
      kit_asignado: kit_nombre || null,
    });

    // 2b. Auto-crear código de descuento si no tiene uno
    if (!influencer.codigo_descuento) {
      const handle = (influencer.instagram_handle || influencer.nombre || 'CREADORA').replace(/[^a-zA-Z0-9]/g, '');
      let codigo;
      try {
        codigo = await shopify.createDiscountCode(handle);
      } catch (e) {
        console.warn('createDiscountCode falló, usando código local:', e.message);
        codigo = shopify.generateDiscountCode(handle);
      }
      await supabase.updateInfluencer(req.params.id, { codigo_descuento: codigo });
      shopifyResult.codigo_descuento = codigo;
    }

    // 3. WhatsApp de bienvenida (solo una vez por influencer)
    try {
      const yaEnviado = await supabase.yaEnviadoTemplate(req.params.id, 'bienvenida_club_brujeria');
      if (!yaEnviado) {
        const waResult = await enviarBienvenidaKit(influencerParaOrden, shopifyResult.codigo_descuento || influencerParaOrden.codigo_descuento);
        console.log('[enviar-kit] WhatsApp bienvenida:', waResult);
        if (waResult?.sent) await supabase.registrarNotificacion(req.params.id, 'bienvenida_club_brujeria', 'kit');
      } else {
        console.log('[enviar-kit] Bienvenida ya enviada anteriormente, skip');
      }
    } catch (e) {
      console.error('[enviar-kit] WhatsApp error (no fatal):', e.message);
    }

    // 4. Intentar Siigo (no bloquea si falla)
    let siigoResult = null;
    let siigoError = null;
    try {
      siigoResult = await siigo.registrarSalidaGifting(
        skus,
        influencer.nombre,
        influencer.instagram_handle || '',
        shopifyResult.shopify_order_id
      );
    } catch (e) {
      siigoError = e.message;
      console.error('Siigo error (no fatal):', e.message);
    }

    res.json({
      ok: true,
      shopify: shopifyResult,
      siigo: siigoResult,
      siigo_error: siigoError,
    });
  } catch (e) {
    console.error('Error en enviar kit:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── CALIFICAR CONTENIDO (admin) ───────────────────────────────────
app.patch('/api/contenidos/:id/calificar', async (req, res) => {
  const { calificacion } = req.body;
  if (!calificacion || calificacion < 1 || calificacion > 5) {
    return res.status(400).json({ error: 'Calificación debe ser 1–5' });
  }
  try {
    const contenido = await supabase.getContenidoById(req.params.id);
    if (!contenido) return res.status(404).json({ error: 'Contenido no encontrado' });

    const influencer = await supabase.getInfluencerById(contenido.influencer_id);
    const seguidores = contenido.plataforma?.toLowerCase() === 'tiktok'
      ? (influencer?.seguidores_tiktok || influencer?.seguidores_instagram || 1)
      : (influencer?.seguidores_instagram || 1);

    const nuevoScore = calcularScore({
      vistas: contenido.vistas,
      likes: contenido.likes,
      guardados: contenido.guardados,
      seguidores,
      plataforma: contenido.plataforma,
      tipo_contenido: contenido.tipo_contenido,
      calificacion_equipo: calificacion,
    });

    await supabase.updateContenido(req.params.id, {
      calificacion_equipo: calificacion,
      score_contenido: nuevoScore,
    });

    // Recalcular score total y nivel de la influencer
    const todosLosContenidos = await supabase.getContenidos(contenido.influencer_id);
    const scoreTotal = todosLosContenidos.reduce((s, c) => s + (c.score_contenido || 0), 0);
    const nivel = calcularNivel(scoreTotal);
    await supabase.updateInfluencer(contenido.influencer_id, { score_total: scoreTotal, nivel_bruja: nivel });

    console.log(`[calificar] contenido ${req.params.id} → calificacion ${calificacion} → score ${nuevoScore} | influencer score total: ${scoreTotal}`);
    res.json({ ok: true, score_contenido: nuevoScore, score_total: scoreTotal, nivel });
  } catch (e) {
    console.error('[calificar] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── CONTENIDOS ────────────────────────────────────────────────────
app.get('/api/contenidos', async (req, res) => {
  try {
    const contenidos = await supabase.getContenidos();
    res.json(contenidos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── ROI / VENTAS SHOPIFY ──────────────────────────────────────────
app.get('/api/roi', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) return res.status(400).json({ error: 'Parámetros desde y hasta requeridos' });

    const ventas = await shopify.getVentas(desde, hasta);

    const [influencers, preciosPorSku] = await Promise.all([
      supabase.getInfluencers(),
      shopify.getPreciosPorSku(),
    ]);

    const enviadasEnPeriodo = influencers.filter(inf => {
      if (!inf.fecha_envio) return false;
      const fechaEnvio = inf.fecha_envio.split('T')[0];
      return fechaEnvio >= desde.split('T')[0] && fechaEnvio <= hasta.split('T')[0];
    });

    const costoKits = enviadasEnPeriodo.reduce((sum, inf) => {
      const skus = Array.isArray(inf.skus_pedidos) ? inf.skus_pedidos : [];
      return sum + skus.reduce((s, sku) => s + (preciosPorSku[sku] || 0), 0);
    }, 0);
    const roi = costoKits > 0 ? ((ventas.totalVentas / costoKits) * 100).toFixed(1) : null;

    res.json({
      periodo: { desde, hasta },
      ventas: ventas.totalVentas,
      totalOrdenes: ventas.totalOrdenes,
      costoKits,
      influenciasEnviadas: enviadasEnPeriodo.length,
      roi: roi ? `${roi}%` : 'N/A',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Ventas atribuidas a una influencer por código de descuento
app.get('/api/roi/influencer/:id', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const influencer = await supabase.getInfluencerById(req.params.id);
    if (!influencer) return res.status(404).json({ error: 'No encontrada' });
    if (!influencer.codigo_descuento) {
      return res.json({ atribuido: 0, mensaje: 'Sin código de descuento asignado' });
    }
    const ventas = await shopify.getVentas(desde, hasta, influencer.codigo_descuento);
    res.json({
      influencer: influencer.nombre,
      codigo_descuento: influencer.codigo_descuento,
      ventasAtribuidas: ventas.totalVentas,
      ordenesAtribuidas: ventas.totalOrdenes,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── HELPERS TALLY ─────────────────────────────────────────────────
function parseTallyFields(fields = []) {
  const map = {};
  fields.forEach(f => {
    const key = (f.label || '').toLowerCase().trim();
    let value = f.value;
    // Resolver UUIDs de MULTIPLE_CHOICE / CHECKBOXES al texto de la opción
    if (Array.isArray(value)) {
      if (Array.isArray(f.options) && f.options.length > 0) {
        const optMap = {};
        f.options.forEach(o => { if (o.id && o.text) optMap[o.id] = o.text; });
        const resueltos = value.map(uuid => optMap[uuid]).filter(Boolean);
        value = resueltos.length === 1 ? resueltos[0] : resueltos.join(', ') || null;
      } else {
        value = null; // Array de UUIDs sin opciones para resolver — ignorar
      }
    }
    map[key] = value;
  });
  return map;
}

function tallyVal(map, ...keys) {
  for (const k of keys) {
    const v = map[k.toLowerCase()];
    if (v != null && v !== '') return v;
  }
  return null;
}

// ── WEBHOOK REGISTRO (Tally → Supabase, sin auto-envío) ──────────
app.post('/api/webhooks/registro', async (req, res) => {
  try {
    const fields = parseTallyFields(req.body?.data?.fields || []);

    const nombre    = tallyVal(fields, 'nombre completo', 'nombre', 'name');
    const email     = tallyVal(fields, 'email', 'correo', 'e-mail');
    const telefono  = tallyVal(fields, 'teléfono', 'telefono', 'celular', 'whatsapp', 'teléfono / whatsapp', 'telefono / whatsapp');
    const instagram = tallyVal(fields, 'instagram', 'usuario instagram', 'handle instagram', '@instagram', 'cuenta de instagram', 'cuenta de instagram (sin @)');
    const tiktok    = tallyVal(fields, 'tiktok', 'usuario tiktok', 'handle tiktok', '@tiktok', 'cuenta de tiktok', 'cuenta de tiktok (sin @)');
    const segInsta  = parseInt(tallyVal(fields, 'seguidores instagram', 'seguidores en instagram', 'número de seguidores en instagram', 'followers instagram') || '0');
    const segTiktok = parseInt(tallyVal(fields, 'seguidores tiktok', 'seguidores en tiktok', 'número de seguidores en tiktok', 'followers tiktok') || '0');
    const ciudad       = tallyVal(fields, 'ciudad', 'city');
    const departamento = tallyVal(fields, 'departamento', 'department', 'depto');
    const direccion    = tallyVal(fields, 'dirección de envío', 'direccion de envio', 'dirección', 'direccion', 'address');
    const tipoCabello  = tallyVal(fields, 'tipo de cabello', 'tipo cabello', 'hair type', 'cabello');

    if (!nombre || !email) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: nombre y email' });
    }

    const tiktokClean = (tiktok || '').replace('@', '').trim() || null;
    const instaClean  = (instagram || '').replace('@', '').trim() || null;

    // Buscar influencer existente: primero por email, luego por TikTok, luego por Instagram
    let existe = await supabase.getInfluencerByEmail(email.toLowerCase().trim());
    if (!existe && tiktokClean) existe = await supabase.getInfluencerByTikTok(tiktokClean);
    if (!existe && instaClean)  existe = await supabase.getInfluencerByInstagram(instaClean);

    if (existe) {
      const actualizaciones = { status: 'Registrada' };
      if (!existe.email && email)             actualizaciones.email = email.toLowerCase().trim();
      if (!existe.nombre && nombre)           actualizaciones.nombre = nombre;
      if (!existe.telefono && telefono)       actualizaciones.telefono = telefono;
      if (!existe.instagram_handle && instaClean)  actualizaciones.instagram_handle = instaClean;
      if (!existe.tiktok_handle && tiktokClean)    actualizaciones.tiktok_handle = tiktokClean;
      if (!existe.ciudad && ciudad)           actualizaciones.ciudad = ciudad;
      if (!existe.departamento && departamento) actualizaciones.departamento = departamento;
      if (!existe.direccion_envio && direccion) actualizaciones.direccion_envio = direccion;
      if (tipoCabello) actualizaciones.tipo_cabello = tipoCabello;
      if (segInsta && !existe.seguidores_instagram) actualizaciones.seguidores_instagram = segInsta;
      if (segTiktok && !existe.seguidores_tiktok)   actualizaciones.seguidores_tiktok = segTiktok;
      await supabase.updateInfluencer(existe.id, actualizaciones);
      console.log(`[webhook/registro] Vinculada: ${existe.nombre || nombre} → status Registrada`);
      return res.json({ ok: true, mensaje: 'Vinculada y actualizada', id: existe.id });
    }

    // Calcular tier según seguidores
    const { tier } = calcularTier(segInsta || segTiktok);

    // Insertar en Supabase — el admin elige y envía el kit desde el dashboard
    const influencer = await supabase.insertInfluencer({
      nombre,
      email: email.toLowerCase().trim(),
      telefono: telefono || null,
      instagram_handle: instaClean || null,
      tiktok_handle: tiktokClean || null,
      seguidores_instagram: segInsta || null,
      seguidores_tiktok: segTiktok || null,
      ciudad: ciudad || null,
      departamento: departamento || null,
      direccion_envio: direccion || null,
      tipo_cabello: tipoCabello || null,
      tier,
      status: 'Registrada',
    });

    console.log(`[webhook/registro] Nueva influencer: ${nombre} | ${tier} | pendiente de envío por admin`);
    res.json({ ok: true, influencer_id: influencer?.id, tier });
  } catch (e) {
    console.error('[webhook/registro] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── WEBHOOK CONTENIDO (Tally → auto-score) ───────────────────────
app.post('/api/webhooks/contenido', async (req, res) => {
  try {
    const fields = parseTallyFields(req.body?.data?.fields || []);

    const email         = tallyVal(fields, 'email', 'correo', 'e-mail');
    const urlContenido  = tallyVal(fields, 'url del contenido', 'url contenido', 'link', 'url');
    const plataforma    = tallyVal(fields, 'plataforma', 'red social', 'platform') || 'Instagram';
    const tipoContenido = tallyVal(fields, 'tipo de contenido', 'tipo', 'format', 'formato') || 'Reel';
    const vistas        = parseInt(tallyVal(fields, 'vistas', 'reproducciones', 'views', 'plays') || '0');
    const likes         = parseInt(tallyVal(fields, 'likes', 'me gusta') || '0');
    const guardados     = parseInt(tallyVal(fields, 'guardados', 'saves', 'guardados/saves') || '0') || null;

    if (!email || !urlContenido) {
      return res.status(400).json({ error: 'Faltan campos: email y url del contenido' });
    }

    const influencer = await supabase.getInfluencerByEmail(email.toLowerCase().trim());
    if (!influencer) return res.status(404).json({ error: 'Email no registrado en el programa' });

    const seguidores = plataforma.toLowerCase() === 'tiktok'
      ? (influencer.seguidores_tiktok || influencer.seguidores_instagram || 1)
      : (influencer.seguidores_instagram || 1);

    const score = calcularScore({
      vistas, likes, guardados, seguidores,
      plataforma, tipo_contenido: tipoContenido,
      calificacion_equipo: null,
    });

    // Insertar contenido
    await supabase.insertContenido({
      influencer_id: influencer.id,
      fecha_submision: new Date().toISOString(),
      tipo_contenido: tipoContenido,
      plataforma,
      url_contenido: urlContenido,
      vistas,
      likes,
      guardados: guardados || null,
      score_contenido: score,
    });

    // Actualizar nivel bruja y status
    const todosLosContenidos = await supabase.getContenidos(influencer.id);
    const scoreAcumulado = todosLosContenidos.reduce((s, c) => s + (c.score_contenido || 0), 0);
    const nivel = calcularNivel(scoreAcumulado);

    const nivelAnterior = influencer.nivel_bruja;
    await supabase.updateInfluencer(influencer.id, {
      status: 'Contenido Entregado',
      nivel_bruja: nivel,
      score_total: scoreAcumulado,
    });

    console.log(`[webhook/contenido] ${influencer.nombre} | score: ${score} | nivel: ${nivel} | acumulado: ${scoreAcumulado.toFixed(1)}`);

    // El feedback de WhatsApp NO se envía automáticamente aquí.
    // Se envía manualmente desde el dashboard cuando el admin califica el contenido.

    res.json({ ok: true, score, nivel, score_acumulado: scoreAcumulado });
  } catch (e) {
    console.error('[webhook/contenido] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── CRON SEGUIMIENTO (Railway cron → POST cada lunes) ─────────────
app.post('/api/cron/seguimiento', async (req, res) => {
  // Validar secret para que solo Railway pueda llamarlo
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (config.tally_webhook_secret && secret !== config.tally_webhook_secret) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const pendientes = await supabase.getInfluencersPendingSeguimiento();
    const resultados = [];

    for (const inf of pendientes) {
      try {
        const yaEnviado = await supabase.yaEnviadoTemplate(inf.id, 'explicacion_contenido_brujeria');
        if (yaEnviado) {
          console.log(`[cron/seguimiento] ${inf.nombre}: ya recibió este mensaje, skip`);
          continue;
        }
        const wa = await enviarRecordatorioWhatsApp(inf);
        const email = await enviarRecordatorioContenido(inf);
        if (wa?.sent) await supabase.registrarNotificacion(inf.id, 'explicacion_contenido_brujeria', 'cron');
        resultados.push({ nombre: inf.nombre, whatsapp: wa, email });
      } catch (e) {
        resultados.push({ nombre: inf.nombre, error: e.message });
      }
    }

    console.log(`[cron/seguimiento] ${resultados.length} influencers procesadas`);
    res.json({ ok: true, total: resultados.length, resultados });
  } catch (e) {
    console.error('[cron/seguimiento] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── CRON IDEAS DE CONTENIDO (Railway cron diario → 4 días post-envío) ───
app.post('/api/cron/ideas', async (req, res) => {
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (config.tally_webhook_secret && secret !== config.tally_webhook_secret) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const pendientes = await supabase.getInfluencersPendingIdeas();
    const resultados = [];

    for (const inf of pendientes) {
      try {
        const wa = await enviarIdeasContenido(inf);
        resultados.push({ nombre: inf.nombre, whatsapp: wa });
      } catch (e) {
        resultados.push({ nombre: inf.nombre, error: e.message });
      }
    }

    console.log(`[cron/ideas] ${resultados.length} influencers procesadas`);
    res.json({ ok: true, total: resultados.length, resultados });
  } catch (e) {
    console.error('[cron/ideas] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── GUÍA DEL PROGRAMA ────────────────────────────────────────────
app.get('/guia', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'guia.html'));
});

// ── PORTAL INFLUENCERS ────────────────────────────────────────────
app.get('/influencer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'influencer.html'));
});
app.get('/influencer/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'influencer.html'));
});

// Auth: verificar email
app.post('/api/auth/check-email', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  try {
    const influencer = await supabase.getInfluencerByEmail(email.toLowerCase().trim());
    if (!influencer) return res.status(404).json({ error: 'Email no registrado en el programa' });
    res.json({ exists: true, hasPassword: !!influencer.password_hash });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Auth: crear contraseña (primera vez)
app.post('/api/auth/set-password', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  try {
    const influencer = await supabase.getInfluencerByEmail(email.toLowerCase().trim());
    if (!influencer) return res.status(404).json({ error: 'Email no registrado' });
    if (influencer.password_hash) return res.status(400).json({ error: 'Ya tienes una contraseña. Usa iniciar sesión.' });
    const hash = await bcrypt.hash(password, 10);
    await supabase.updatePasswordHash(influencer.id, hash);
    const token = jwt.sign({ id: influencer.id, email: influencer.email }, config.jwt_secret, { expiresIn: '30d' });
    res.json({ token, nombre: influencer.nombre });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Auth: login con contraseña
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
  try {
    const influencer = await supabase.getInfluencerByEmail(email.toLowerCase().trim());
    if (!influencer) return res.status(404).json({ error: 'Email no registrado' });
    if (!influencer.password_hash) return res.status(400).json({ error: 'Aún no tienes contraseña. Usa "primera vez".' });
    const ok = await bcrypt.compare(password, influencer.password_hash);
    if (!ok) return res.status(401).json({ error: 'Contraseña incorrecta' });
    const token = jwt.sign({ id: influencer.id, email: influencer.email }, config.jwt_secret, { expiresIn: '30d' });
    res.json({ token, nombre: influencer.nombre });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Datos del dashboard (autenticado)
app.get('/api/influencer/me', authMiddleware, async (req, res) => {
  try {
    const influencer = await supabase.getInfluencerById(req.influencerId);
    if (!influencer) return res.status(404).json({ error: 'No encontrada' });
    const contenidos = await supabase.getContenidos(req.influencerId);
    const { password_hash, ...safe } = influencer;
    res.json({ ...safe, contenidos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Ventas atribuidas (autenticado)
app.get('/api/influencer/ventas', authMiddleware, async (req, res) => {
  try {
    const influencer = await supabase.getInfluencerById(req.influencerId);
    if (!influencer) return res.status(404).json({ error: 'No encontrada' });
    if (!influencer.codigo_descuento) {
      return res.json({ atribuido: 0, mensaje: 'Sin código de descuento asignado aún' });
    }
    const ventas = await shopify.getVentas(null, null, influencer.codigo_descuento);
    res.json({
      codigo_descuento: influencer.codigo_descuento,
      ventasAtribuidas: ventas.totalVentas,
      ordenesAtribuidas: ventas.totalOrdenes,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Solicitar reenvío de producto (influencer autenticada)
app.post('/api/influencer/solicitar-producto', authMiddleware, async (req, res) => {
  const { productos, mensaje, direccion } = req.body;
  if (!productos || !Array.isArray(productos) || productos.length === 0) {
    return res.status(400).json({ error: 'Debes seleccionar al menos un producto' });
  }
  try {
    // Actualizar dirección en perfil si cambió
    if (direccion) {
      await supabase.updateInfluencer(req.influencerId, {
        direccion_envio: direccion.direccion_envio,
        ciudad: direccion.ciudad,
        departamento: direccion.departamento,
        codigo_postal: direccion.codigo_postal,
      });
    }
    const sol = await supabase.insertSolicitudReenvio(req.influencerId, productos, mensaje, direccion);
    res.json({ ok: true, id: sol.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── CANDIDATAS TIKTOK ────────────────────────────────────────────
app.get('/api/candidatas', async (req, res) => {
  try {
    const { status, min_colombia_score, tier } = req.query;
    const candidatas = await supabase.getCandidatas({ status, min_colombia_score, tier });
    res.json(candidatas);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/candidatas/:id', async (req, res) => {
  try {
    const { status, notas_equipo } = req.body;
    await supabase.updateCandidataStatus(req.params.id, status, notas_equipo);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/candidatas/:id/aprobar', async (req, res) => {
  try {
    const influencer = await supabase.aprobarCandidataComoInfluencer(req.params.id);
    res.json({ ok: true, influencer_id: influencer.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Listar solicitudes (admin)
app.get('/api/solicitudes-reenvio', async (req, res) => {
  try {
    res.json(await supabase.getSolicitudesReenvio());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Actualizar estado solicitud (admin)
app.patch('/api/solicitudes-reenvio/:id', async (req, res) => {
  const { status, notas_admin } = req.body;
  try {
    const solicitudes = await supabase.getSolicitudesReenvio();
    const sol = solicitudes.find(s => s.id === req.params.id);
    if (!sol) return res.status(404).json({ error: 'Solicitud no encontrada' });

    await supabase.updateSolicitudReenvio(req.params.id, { status, notas_admin });

    // Al aprobar: crear orden Shopify + WhatsApp + actualizar status influencer
    if (status === 'Aprobada' && sol.status !== 'Aprobada') {
      const influencer = await supabase.getInfluencerById(sol.influencer_id);
      if (influencer) {
        // Mapear nombres de productos a SKUs
        const skus = (sol.productos || []).map(p => config.productos_disponibles[p]).filter(Boolean);

        // Crear orden Shopify $0
        let shopifyOrderId = null;
        if (skus.length > 0) {
          try {
            const direccion = {
              address1: sol.direccion_envio || influencer.direccion_envio || '',
              city: sol.ciudad || influencer.ciudad || '',
              province: sol.departamento || influencer.departamento || '',
              zip: sol.codigo_postal || influencer.codigo_postal || '',
              country: 'CO',
            };
            const orden = await shopify.crearOrdenGifting(influencer, skus, direccion);
            shopifyOrderId = orden?.id ? String(orden.id) : null;
            if (shopifyOrderId) {
              await supabase.updateSolicitudReenvio(req.params.id, { shopify_order_id: shopifyOrderId });
            }
          } catch (shopifyErr) {
            console.error('[solicitud-aprobar] Error Shopify:', shopifyErr.message);
          }
        }

        // WhatsApp
        if (influencer.telefono) {
          try {
            const { enviarReenvioAprobado } = require('./whatsapp');
            await enviarReenvioAprobado(influencer.telefono, influencer.nombre);
          } catch (waErr) {
            console.error('[solicitud-aprobar] Error WhatsApp:', waErr.message);
          }
        }

        // Actualizar status influencer
        await supabase.updateInfluencer(sol.influencer_id, { status: 'Producto Enviado', fecha_envio: new Date().toISOString().split('T')[0] });
      }
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[solicitudes-reenvio PATCH]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// URLs de Tally (público)
app.get('/api/influencer/tally-urls', (req, res) => {
  res.json({
    contenido: config.tally_contenido_url,
    registro: config.tally_registro_url,
  });
});

// ── NOTIFICACIONES MANUALES (admin → WhatsApp) ───────────────────
app.post('/api/admin/notificaciones', async (req, res) => {
  const { influencer_ids, template } = req.body;
  if (!template) return res.status(400).json({ error: 'Template requerido' });

  try {
    let influencers;
    if (influencer_ids === 'all') {
      influencers = await supabase.getInfluencersConTelefono();
    } else if (Array.isArray(influencer_ids) && influencer_ids.length > 0) {
      influencers = (await Promise.all(influencer_ids.map(id => supabase.getInfluencerById(id)))).filter(Boolean);
    } else {
      return res.status(400).json({ error: 'influencer_ids debe ser "all" o un array de IDs' });
    }

    // Templates de una sola vez — no se reenvían
    const TEMPLATES_UNICOS = ['bienvenida_club_brujeria', 'bienvenida_kit', 'ideas_contenido_brujeria1'];

    const resultados = [];
    for (const inf of influencers) {
      try {
        // Bloquear si ya fue enviado y es template único
        const templateMeta = template === 'bienvenida_kit' ? 'bienvenida_club_brujeria'
          : template === 'bienvenida_club' ? 'bienvenida_club_brujeria'
          : template === 'recordatorio' ? 'explicacion_contenido_brujeria'
          : template === 'ideas' ? 'ideas_contenido_brujeria1'
          : template === 'feedback_contenido' ? 'feedback_contenido_brujeria'
          : null;

        if (templateMeta && TEMPLATES_UNICOS.includes(templateMeta)) {
          const yaEnviado = await supabase.yaEnviadoTemplate(inf.id, templateMeta);
          if (yaEnviado) {
            resultados.push({ id: inf.id, nombre: inf.nombre, ok: false, skipped: true, razon: 'Ya enviado anteriormente' });
            continue;
          }
        }

        let wa;
        if (template === 'bienvenida_club') wa = await enviarBienvenidaClub(inf);
        else if (template === 'recordatorio') wa = await enviarRecordatorioWhatsApp(inf);
        else if (template === 'bienvenida_kit') wa = await enviarBienvenidaKit(inf, inf.codigo_descuento);
        else if (template === 'ideas') wa = await enviarIdeasContenido(inf);
        else if (template === 'reenganche') wa = await enviarReenganche(inf);
        else if (template === 'feedback_contenido') {
          const score = inf.score_total || 0;
          const nivel = inf.nivel_bruja || 'Magia Naciente';
          wa = await enviarFeedbackContenido(inf, score, nivel);
        }
        else throw new Error('Template no reconocido');

        if (wa?.sent && templateMeta) {
          await supabase.registrarNotificacion(inf.id, templateMeta, 'admin');
        }
        resultados.push({ id: inf.id, nombre: inf.nombre, ok: true, resultado: wa });
      } catch (e) {
        resultados.push({ id: inf.id, nombre: inf.nombre, ok: false, error: e.message });
      }
    }

    console.log(`[admin/notificaciones] Template "${template}" → ${resultados.length} procesadas`);
    resultados.forEach(r => console.log(`  ${r.nombre}: ok=${r.ok}`, r.skipped ? '(skipped)' : r.resultado || r.error));
    res.json({ ok: true, total: resultados.length, resultados });
  } catch (e) {
    console.error('[admin/notificaciones] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── IMPORTACIÓN MASIVA DE INFLUENCERS (admin) ───────────────────
app.post('/api/admin/influencers/bulk-import', async (req, res) => {
  const { influencers } = req.body;
  if (!Array.isArray(influencers) || influencers.length === 0) {
    return res.status(400).json({ error: 'Se requiere un array de influencers' });
  }

  const resultados = { creadas: [], omitidas: [], errores: [] };

  for (const inf of influencers) {
    try {
      // Dedup por email, teléfono o handle
      let existe = null;
      if (inf.email) existe = await supabase.getInfluencerByEmail(inf.email.toLowerCase().trim());
      if (!existe && inf.tiktok_handle) existe = await supabase.getInfluencerByTikTok(inf.tiktok_handle);
      if (!existe && inf.instagram_handle) existe = await supabase.getInfluencerByInstagram(inf.instagram_handle);

      if (existe) {
        resultados.omitidas.push({ nombre: inf.nombre, razon: `ya existe (id=${existe.id})` });
        continue;
      }

      const nueva = await supabase.insertInfluencer({
        nombre: inf.nombre,
        telefono: inf.telefono || null,
        email: inf.email || null,
        ciudad: inf.ciudad || null,
        direccion: inf.direccion || null,
        tiktok_handle: inf.tiktok_handle || null,
        instagram_handle: inf.instagram_handle || null,
        seguidores_tiktok: inf.tiktok_handle ? (inf.seguidores || null) : null,
        seguidores_instagram: inf.instagram_handle && !inf.tiktok_handle ? (inf.seguidores || null) : null,
        tier: inf.tier || 'Nano',
        status: 'Registrada',
        fuente: 'importacion_historica',
      });
      resultados.creadas.push({ nombre: inf.nombre, id: nueva?.id });
    } catch (e) {
      resultados.errores.push({ nombre: inf.nombre, error: e.message });
    }
  }

  console.log(`[bulk-import] ${resultados.creadas.length} creadas | ${resultados.omitidas.length} omitidas | ${resultados.errores.length} errores`);
  res.json({ ok: true, ...resultados });
});

// Servir frontend para cualquier ruta no-API
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\nApp Creadoras corriendo en http://localhost:${PORT}`);
  console.log('Ctrl+C para detener\n');
});

// ── CRONS INTERNOS (sin dependencias externas) ───────────────────
// Revisa cada hora si hay crons que correr según hora UTC
let ultimoIdeas = null;
let ultimoSeguimiento = null;

async function runCronIdeas() {
  console.log('[cron/ideas] Ejecutando...');
  try {
    const pendientes = await supabase.getInfluencersPendingIdeas();
    for (const inf of pendientes) {
      try {
        const yaEnviado = await supabase.yaEnviadoTemplate(inf.id, 'ideas_contenido_brujeria1');
        if (yaEnviado) {
          console.log(`[cron/ideas] ${inf.nombre}: ya recibió este mensaje, skip`);
          continue;
        }
        const wa = await enviarIdeasContenido(inf);
        console.log(`[cron/ideas] ${inf.nombre}:`, wa);
        if (wa?.sent) await supabase.registrarNotificacion(inf.id, 'ideas_contenido_brujeria1', 'cron');
      } catch (e) {
        console.error(`[cron/ideas] ${inf.nombre} error:`, e.message);
      }
    }
    console.log(`[cron/ideas] ${pendientes.length} procesadas`);
  } catch (e) {
    console.error('[cron/ideas] Error:', e.message);
  }
}

async function runCronSeguimiento() {
  console.log('[cron/seguimiento] Ejecutando...');
  try {
    const pendientes = await supabase.getInfluencersPendingSeguimiento();
    for (const inf of pendientes) {
      try {
        const wa = await enviarRecordatorioWhatsApp(inf);
        const email = await enviarRecordatorioContenido(inf);
        console.log(`[cron/seguimiento] ${inf.nombre}:`, { wa, email });
      } catch (e) {
        console.error(`[cron/seguimiento] ${inf.nombre} error:`, e.message);
      }
    }
    console.log(`[cron/seguimiento] ${pendientes.length} procesadas`);
  } catch (e) {
    console.error('[cron/seguimiento] Error:', e.message);
  }
}

setInterval(() => {
  const now = new Date();
  const hoy = now.toISOString().split('T')[0];
  const horaUTC = now.getUTCHours();
  const diaUTC = now.getUTCDay(); // 1 = lunes

  // Diario a las 15:00 UTC (10am Bogotá) — ideas post-envío
  if (horaUTC === 15 && ultimoIdeas !== hoy) {
    ultimoIdeas = hoy;
    runCronIdeas();
  }

  // Lunes a las 14:00 UTC (9am Bogotá) — seguimiento semanal
  if (diaUTC === 1 && horaUTC === 14 && ultimoSeguimiento !== hoy) {
    ultimoSeguimiento = hoy;
    runCronSeguimiento();
  }
}, 60 * 60 * 1000); // revisa cada hora
