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
app.use(express.static(path.join(__dirname, 'public')));

// ── STATS DASHBOARD ──────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await supabase.getStats();
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── INFLUENCERS ───────────────────────────────────────────────────
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
    const allowed = ['status', 'codigo_descuento', 'notas_equipo', 'tipo_cabello'];
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
  const { skus, kit_nombre } = req.body;
  if (!skus || !Array.isArray(skus) || skus.length === 0) {
    return res.status(400).json({ error: 'Se requiere al menos un SKU' });
  }

  try {
    const influencer = await supabase.getInfluencerById(req.params.id);
    if (!influencer) return res.status(404).json({ error: 'Influencer no encontrada' });

    // 1. Crear orden Shopify
    const kitLabel = kit_nombre || `${skus.length} producto(s)`;
    const shopifyResult = await shopify.createGiftingOrder(influencer, skus, kitLabel);

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

    // 3. Intentar Siigo (no bloquea si falla)
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

    const influencers = await supabase.getInfluencers();
    const kits = await supabase.getKits();
    const kitValor = {};
    kits.forEach(k => { kitValor[k.nombre] = k.valor_retail_cop || 0; });

    const enviadasEnPeriodo = influencers.filter(inf => {
      if (!inf.fecha_envio) return false;
      const fechaEnvio = inf.fecha_envio.split('T')[0];
      return fechaEnvio >= desde.split('T')[0] && fechaEnvio <= hasta.split('T')[0];
    });

    const costoKits = enviadasEnPeriodo.reduce((sum, inf) => sum + (kitValor[inf.kit_asignado] || 0), 0);
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
    map[key] = f.value;
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
    const telefono  = tallyVal(fields, 'teléfono', 'telefono', 'celular', 'whatsapp');
    const instagram = tallyVal(fields, 'instagram', 'usuario instagram', 'handle instagram', '@instagram', 'cuenta de instagram');
    const tiktok    = tallyVal(fields, 'tiktok', 'usuario tiktok', 'handle tiktok', '@tiktok', 'cuenta de tiktok');
    const segInsta  = parseInt(tallyVal(fields, 'seguidores instagram', 'seguidores en instagram', 'número de seguidores en instagram', 'followers instagram') || '0');
    const segTiktok = parseInt(tallyVal(fields, 'seguidores tiktok', 'seguidores en tiktok', 'número de seguidores en tiktok', 'followers tiktok') || '0');
    const ciudad       = tallyVal(fields, 'ciudad', 'city');
    const direccion    = tallyVal(fields, 'dirección de envío', 'direccion de envio', 'dirección', 'direccion', 'address');
    const tipoCabello  = tallyVal(fields, 'tipo de cabello', 'tipo cabello', 'hair type', 'cabello');

    if (!nombre || !email) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: nombre y email' });
    }

    // Verificar si ya existe
    const existe = await supabase.getInfluencerByEmail(email.toLowerCase().trim());
    if (existe) {
      return res.json({ ok: true, mensaje: 'Ya registrada', id: existe.id });
    }

    // Calcular tier según seguidores
    const { tier } = calcularTier(segInsta || segTiktok);

    // Insertar en Supabase — el admin elige y envía el kit desde el dashboard
    const influencer = await supabase.insertInfluencer({
      nombre,
      email: email.toLowerCase().trim(),
      telefono: telefono || null,
      instagram_handle: (instagram || '').replace('@', ''),
      tiktok_handle: (tiktok || '').replace('@', '') || null,
      seguidores_instagram: segInsta || null,
      seguidores_tiktok: segTiktok || null,
      ciudad: ciudad || null,
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

    await supabase.updateInfluencer(influencer.id, {
      status: 'Contenido Entregado',
      nivel_bruja: nivel,
      score_total: scoreAcumulado,
    });

    console.log(`[webhook/contenido] ${influencer.nombre} | score: ${score} | nivel: ${nivel} | acumulado: ${scoreAcumulado.toFixed(1)}`);

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
        const r = await enviarRecordatorioContenido(inf);
        resultados.push({ nombre: inf.nombre, email: inf.email, ...r });
      } catch (e) {
        resultados.push({ nombre: inf.nombre, email: inf.email, error: e.message });
      }
    }

    console.log(`[cron/seguimiento] ${resultados.length} influencers procesadas`);
    res.json({ ok: true, total: resultados.length, resultados });
  } catch (e) {
    console.error('[cron/seguimiento] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
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

// URLs de Tally (público)
app.get('/api/influencer/tally-urls', (req, res) => {
  res.json({
    contenido: config.tally_contenido_url,
    registro: config.tally_registro_url,
  });
});

// Servir frontend para cualquier ruta no-API
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\nApp Creadoras corriendo en http://localhost:${PORT}`);
  console.log('Ctrl+C para detener\n');
});
