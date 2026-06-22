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
const { enviarBienvenidaKit, enviarRecordatorioWhatsApp, enviarBienvenidaClub, enviarFeedbackContenido, enviarIdeasContenido, enviarReenganche, enviarEncuestaProductos, enviarConfirmacionLlegada, enviarSeguimientoProductos, enviarUGCBienvenida, enviarUGCConfirmacionRegistro } = require('./whatsapp');

// Rutas pÃºblicas â€” portal influencer, guÃ­a, auth y webhooks
const RUTAS_PUBLICAS = ['/influencer', '/guia', '/bienvenida-kit', '/api/bienvenida-kit', '/api/auth/', '/api/influencer/', '/api/webhooks/', '/api/cron/', '/api/admin/influencers/bulk-import', '/api/admin/notificaciones', '/api/admin/enviar-kits-bulk', '/preferencias', '/api/preferencias', '/webhook/wa', '/api/ugc/stats/', '/registro-ugc', '/bienvenida-ugc', '/guia-ugc', '/api/ugc/registro'];

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
    res.status(401).json({ error: 'Token invÃ¡lido o expirado' });
  }
}

const app = express();
const PORT = process.env.PORT || 3030;

app.use(cors());
app.use(express.json());
app.use(adminAuth);
app.use(express.static(path.join(__dirname, 'public')));

// â”€â”€ STATS DASHBOARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/stats', async (req, res) => {
  try {
    const preciosPorSku = await shopify.getPreciosPorSku();
    const stats = await supabase.getStats(preciosPorSku);
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€ INFLUENCERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ PRODUCTOS SHOPIFY (con stock real) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/config/productos', async (req, res) => {
  try {
    const productos = await shopify.getProductosConStock();
    productos.sort((a, b) => (b.stock ?? -1) - (a.stock ?? -1));
    res.json({ productos, kits: config.kits });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€ ENVIAR KIT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/influencers/:id/enviar', async (req, res) => {
  const { skus, kit_nombre, direccion_envio, ciudad, departamento, telefono, codigo_postal } = req.body;
  if (!skus || !Array.isArray(skus) || skus.length === 0) {
    return res.status(400).json({ error: 'Se requiere al menos un SKU' });
  }

  try {
    const influencer = await supabase.getInfluencerById(req.params.id);
    if (!influencer) return res.status(404).json({ error: 'Influencer no encontrada' });

    // Aplicar direcciÃ³n del modal (puede estar corregida por el admin)
    const camposDir = {};
    if (direccion_envio !== undefined) camposDir.direccion_envio = direccion_envio;
    if (ciudad !== undefined) camposDir.ciudad = ciudad;
    if (departamento !== undefined) camposDir.departamento = departamento;
    if (telefono !== undefined) camposDir.telefono = telefono;
    if (codigo_postal !== undefined) camposDir.codigo_postal = codigo_postal;

    const influencerParaOrden = { ...influencer, ...camposDir };

    // Persistir correcciones de direcciÃ³n en Supabase si cambiaron
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

    // 2b. Auto-crear cÃ³digo de descuento si no tiene uno
    if (!influencer.codigo_descuento) {
      const handle = (influencer.instagram_handle || influencer.nombre || 'CREADORA').replace(/[^a-zA-Z0-9]/g, '');
      let codigo;
      try {
        codigo = await shopify.createDiscountCode(handle);
      } catch (e) {
        console.warn('createDiscountCode fallÃ³, usando cÃ³digo local:', e.message);
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

// â”€â”€ ENVÃO MASIVO DE KITS (token protegido) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/admin/enviar-kits-bulk', async (req, res) => {
  const { token, skus, primera_preferencia, dry_run, exclude_ids = [] } = req.body;
  const IMPORT_TOKEN = process.env.IMPORT_TOKEN || 'brujeria-import-2026';
  if (token !== IMPORT_TOKEN) return res.status(403).json({ error: 'Token invÃ¡lido' });
  if (!skus || !Array.isArray(skus) || skus.length === 0) return res.status(400).json({ error: 'Se requieren SKUs' });
  if (!primera_preferencia) return res.status(400).json({ error: 'Se requiere primera_preferencia' });

  try {
    const todas = await supabase.getInfluencers();
    const filtro = primera_preferencia.toLowerCase();

    const candidatas = todas.filter(i =>
      Array.isArray(i.productos_favoritos) &&
      i.productos_favoritos.length > 0 &&
      i.productos_favoritos[0].toLowerCase().includes(filtro) &&
      !['Producto Enviado', 'Contenido Entregado', 'Calificada'].includes(i.status) &&
      !exclude_ids.includes(i.id)
    );

    const conDir = candidatas.filter(i => i.direccion_envio && i.ciudad);
    const sinDir = candidatas.filter(i => !i.direccion_envio || !i.ciudad);

    if (dry_run) {
      return res.json({
        dry_run: true,
        total_candidatas: candidatas.length,
        con_direccion: conDir.length,
        sin_direccion: sinDir.length,
        candidatas: conDir.map(i => ({
          id: i.id, nombre: i.nombre, tier: i.tier, ciudad: i.ciudad,
          primera_preferencia: i.productos_favoritos[0],
          seguidores_tiktok: i.seguidores_tiktok || 0,
          seguidores_instagram: i.seguidores_instagram || 0,
          tiktok_handle: i.tiktok_handle || null,
          instagram_handle: i.instagram_handle || null,
        })),
        saltadas: sinDir.map(i => ({ id: i.id, nombre: i.nombre, razon: 'Sin direcciÃ³n' })),
      });
    }

    const resultados = { enviados: [], saltados: sinDir.map(i => ({ nombre: i.nombre, razon: 'Sin direcciÃ³n' })), errores: [] };

    for (const inf of conDir) {
      try {
        const kitLabel = 'Kit Mascarilla';
        const shopifyResult = await shopify.createGiftingOrder(inf, skus, kitLabel);
        await supabase.updateEnvio(inf.id, { skus, shopify_order_id: shopifyResult.shopify_order_id, kit_asignado: kitLabel });

        if (!inf.codigo_descuento) {
          const handle = (inf.instagram_handle || inf.nombre || 'CREADORA').replace(/[^a-zA-Z0-9]/g, '');
          try {
            const codigo = await shopify.createDiscountCode(handle);
            await supabase.updateInfluencer(inf.id, { codigo_descuento: codigo });
          } catch (e) { /* no fatal */ }
        }

        try {
          const yaEnviado = await supabase.yaEnviadoTemplate(inf.id, 'bienvenida_club_brujeria');
          if (!yaEnviado) {
            const wa = await enviarBienvenidaKit(inf, inf.codigo_descuento);
            if (wa?.sent) await supabase.registrarNotificacion(inf.id, 'bienvenida_club_brujeria', 'kit');
          }
        } catch (e) { /* WhatsApp no bloquea */ }

        try {
          await siigo.registrarSalidaGifting(skus, inf.nombre, inf.instagram_handle || '', shopifyResult.shopify_order_id);
        } catch (e) { /* Siigo no bloquea */ }

        resultados.enviados.push({ nombre: inf.nombre, orden: shopifyResult.shopify_order_id });
        console.log(`[bulk-kits] âœ“ ${inf.nombre} â†’ orden ${shopifyResult.shopify_order_id}`);
        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        resultados.errores.push({ nombre: inf.nombre, error: e.message });
        console.error(`[bulk-kits] âœ— ${inf.nombre}: ${e.message}`);
      }
    }

    console.log(`[bulk-kits] Enviados: ${resultados.enviados.length} | Errores: ${resultados.errores.length} | Saltados: ${resultados.saltados.length}`);
    res.json({ ok: true, ...resultados });
  } catch (e) {
    console.error('[bulk-kits] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€ CALIFICAR CONTENIDO (admin) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.patch('/api/contenidos/:id/calificar', async (req, res) => {
  const { calificacion } = req.body;
  if (!calificacion || calificacion < 1 || calificacion > 5) {
    return res.status(400).json({ error: 'CalificaciÃ³n debe ser 1â€“5' });
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

    console.log(`[calificar] contenido ${req.params.id} â†’ calificacion ${calificacion} â†’ score ${nuevoScore} | influencer score total: ${scoreTotal}`);
    res.json({ ok: true, score_contenido: nuevoScore, score_total: scoreTotal, nivel });
  } catch (e) {
    console.error('[calificar] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€ CONTENIDOS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/contenidos', async (req, res) => {
  try {
    const contenidos = await supabase.getContenidos();
    res.json(contenidos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€ ROI / VENTAS SHOPIFY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/roi', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) return res.status(400).json({ error: 'ParÃ¡metros desde y hasta requeridos' });

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

// Ventas atribuidas a una influencer por cÃ³digo de descuento
app.get('/api/roi/influencer/:id', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const influencer = await supabase.getInfluencerById(req.params.id);
    if (!influencer) return res.status(404).json({ error: 'No encontrada' });
    if (!influencer.codigo_descuento) {
      return res.json({ atribuido: 0, mensaje: 'Sin cÃ³digo de descuento asignado' });
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

// â”€â”€ HELPERS TALLY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function sinTildes(str) {
  return (str || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function parseTallyFields(fields = []) {
  const map = {};
  fields.forEach(f => {
    const key = sinTildes((f.label || '').toLowerCase().trim());
    let value = f.value;
    // Resolver UUIDs de MULTIPLE_CHOICE / CHECKBOXES al texto de la opciÃ³n
    if (Array.isArray(value)) {
      if (Array.isArray(f.options) && f.options.length > 0) {
        const optMap = {};
        f.options.forEach(o => { if (o.id && o.text) optMap[o.id] = o.text; });
        const resueltos = value.map(uuid => optMap[uuid]).filter(Boolean);
        value = resueltos.length === 1 ? resueltos[0] : resueltos.join(', ') || null;
      } else {
        value = null; // Array de UUIDs sin opciones para resolver â€” ignorar
      }
    }
    map[key] = value;
  });
  return map;
}

function tallyVal(map, ...keys) {
  for (const k of keys) {
    const v = map[sinTildes(k.toLowerCase())];
    if (v != null && v !== '') return v;
  }
  return null;
}

// â”€â”€ WEBHOOK REGISTRO (Tally â†’ Supabase, sin auto-envÃ­o) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/webhooks/registro', async (req, res) => {
  try {
    const fields = parseTallyFields(req.body?.data?.fields || []);

    const nombre    = tallyVal(fields, 'nombre completo', 'nombre', 'name');
    const email     = tallyVal(fields, 'email', 'correo', 'e-mail');
    const telefono  = tallyVal(fields, 'telÃ©fono', 'telefono', 'celular', 'whatsapp', 'telÃ©fono / whatsapp', 'telefono / whatsapp');
    const instagram = tallyVal(fields, 'instagram', 'usuario instagram', 'handle instagram', '@instagram', 'cuenta de instagram', 'cuenta de instagram (sin @)');
    const tiktok    = tallyVal(fields, 'tiktok', 'usuario tiktok', 'handle tiktok', '@tiktok', 'cuenta de tiktok', 'cuenta de tiktok (sin @)');
    const segInsta  = parseInt(tallyVal(fields, 'seguidores instagram', 'seguidores en instagram', 'nÃºmero de seguidores en instagram', 'followers instagram') || '0');
    const segTiktok = parseInt(tallyVal(fields, 'seguidores tiktok', 'seguidores en tiktok', 'nÃºmero de seguidores en tiktok', 'followers tiktok') || '0');
    const ciudad       = tallyVal(fields, 'ciudad', 'city');
    const departamento = tallyVal(fields, 'departamento', 'department', 'depto');
    const direccion    = tallyVal(fields, 'direcciÃ³n de envÃ­o', 'direccion de envio', 'direcciÃ³n', 'direccion', 'address');
    const tipoCabello  = tallyVal(fields, 'tipo de cabello', 'tipo cabello', 'hair type', 'cabello');

    if (!nombre || !email) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: nombre y email' });
    }

    const tiktokClean = (tiktok || '').replace('@', '').trim() || null;
    const instaClean  = (instagram || '').replace('@', '').trim() || null;

    // Buscar influencer existente: email → TikTok → Instagram → teléfono
    let existe = await supabase.getInfluencerByEmail(email.toLowerCase().trim());
    if (!existe && tiktokClean) existe = await supabase.getInfluencerByTikTok(tiktokClean);
    if (!existe && instaClean)  existe = await supabase.getInfluencerByInstagram(instaClean);
    if (!existe && telefono)    existe = await supabase.getInfluencerByTelefono(telefono);

    if (existe) {
      const KIT_STATUSES = ["Producto Enviado", "Contenido Entregado", "Calificada"];
      const yaRecibiKit = KIT_STATUSES.includes(existe.status);

      const actualizaciones = { fuente: "tally" };
      if (!yaRecibiKit) actualizaciones.status = "Registrada";

      if (!existe.email && email)                   actualizaciones.email = email.toLowerCase().trim();
      if (!existe.nombre && nombre)                 actualizaciones.nombre = nombre;
      if (!existe.telefono && telefono)             actualizaciones.telefono = telefono;
      if (!existe.instagram_handle && instaClean)   actualizaciones.instagram_handle = instaClean;
      if (!existe.tiktok_handle && tiktokClean)     actualizaciones.tiktok_handle = tiktokClean;
      if (!existe.ciudad && ciudad)                 actualizaciones.ciudad = ciudad;
      if (!existe.departamento && departamento)     actualizaciones.departamento = departamento;
      if (!existe.direccion_envio && direccion)     actualizaciones.direccion_envio = direccion;
      if (tipoCabello)                              actualizaciones.tipo_cabello = tipoCabello;
      if (segInsta && !existe.seguidores_instagram) actualizaciones.seguidores_instagram = segInsta;
      if (segTiktok && !existe.seguidores_tiktok)   actualizaciones.seguidores_tiktok = segTiktok;

      await supabase.updateInfluencer(existe.id, actualizaciones);

      if (yaRecibiKit) {
        console.warn("[webhook/registro] DUPLICADO: " + nombre + " (" + email + ") ya tiene kit — status conservado: " + existe.status);
        return res.json({ ok: true, mensaje: "Perfil existente, ya recibio kit", id: existe.id, duplicado: true });
      }

      console.log("[webhook/registro] Vinculada: " + (existe.nombre || nombre) + " -> status Registrada");
      return res.json({ ok: true, mensaje: "Vinculada y actualizada", id: existe.id });
    }

    // Calcular tier segÃºn seguidores
    const { tier } = calcularTier(segInsta || segTiktok);

    // Insertar en Supabase â€” el admin elige y envÃ­a el kit desde el dashboard
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
      fuente: 'tally',
    });

    console.log(`[webhook/registro] Nueva influencer: ${nombre} | ${tier} | pendiente de envÃ­o por admin`);
    res.json({ ok: true, influencer_id: influencer?.id, tier });
  } catch (e) {
    console.error('[webhook/registro] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€ CONFIRMAR RECIBO DEL PAQUETE desde portal (JWT auth) â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/influencer/confirmar-recibo', authMiddleware, async (req, res) => {
  try {
    const influencer = await supabase.getInfluencerById(req.influencerId);
    if (!influencer) return res.status(404).json({ error: 'No encontrada' });
    if (influencer.fecha_confirmacion_recibo) {
      return res.json({ ok: true, ya_confirmado: true });
    }
    await supabase.updateInfluencer(influencer.id, {
      fecha_confirmacion_recibo: new Date().toISOString().split('T')[0],
      paquete_no_llego: false,
    });
    await supabase.registrarNotificacion(influencer.id, 'confirmacion_llegada_influencers', 'influencer');
    console.log(`[confirmar-recibo] ${influencer.nombre} confirmÃ³ recibo desde el portal`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€ SUBIR CONTENIDO desde portal (JWT auth) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/influencer/contenido', authMiddleware, async (req, res) => {
  try {
    const { url_contenido, plataforma, tipo_contenido, vistas, likes, guardados } = req.body;
    if (!url_contenido) return res.status(400).json({ error: 'Se requiere url_contenido' });

    const influencer = await supabase.getInfluencerById(req.influencerId);
    if (!influencer) return res.status(404).json({ error: 'Influencer no encontrada' });

    const plat = plataforma || 'Instagram';
    const seguidores = plat.toLowerCase() === 'tiktok'
      ? (influencer.seguidores_tiktok || influencer.seguidores_instagram || 1)
      : (influencer.seguidores_instagram || influencer.seguidores_tiktok || 1);

    const score = calcularScore({
      vistas: parseInt(vistas) || 0,
      likes: parseInt(likes) || 0,
      guardados: parseInt(guardados) || null,
      seguidores,
      plataforma: plat,
      tipo_contenido: tipo_contenido || 'Reel',
      calificacion_equipo: null,
    });

    await supabase.insertContenido({
      influencer_id: influencer.id,
      fecha_submision: new Date().toISOString(),
      tipo_contenido: tipo_contenido || 'Reel',
      plataforma: plat,
      url_contenido,
      vistas: parseInt(vistas) || 0,
      likes: parseInt(likes) || 0,
      guardados: parseInt(guardados) || null,
      score_contenido: score,
    });

    const todos = await supabase.getContenidos(influencer.id);
    const scoreAcumulado = todos.reduce((s, c) => s + (c.score_contenido || 0), 0);
    const nivel = calcularNivel(scoreAcumulado);

    await supabase.updateInfluencer(influencer.id, {
      status: 'Contenido Entregado',
      nivel_bruja: nivel,
      score_total: scoreAcumulado,
    });

    console.log(`[influencer/contenido] ${influencer.nombre} | score: ${score} | nivel: ${nivel}`);
    res.json({ ok: true, score, nivel, score_acumulado: scoreAcumulado });
  } catch (e) {
    console.error('[influencer/contenido] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€ WEBHOOK CONTENIDO (Tally â†’ auto-score) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    // El feedback de WhatsApp NO se envÃ­a automÃ¡ticamente aquÃ­.
    // Se envÃ­a manualmente desde el dashboard cuando el admin califica el contenido.

    res.json({ ok: true, score, nivel, score_acumulado: scoreAcumulado });
  } catch (e) {
    console.error('[webhook/contenido] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€ WEBHOOK ENCUESTA PRODUCTOS (Tally â†’ preferencias por telÃ©fono) â”€â”€
app.post('/api/webhooks/encuesta-productos', async (req, res) => {
  try {
    const fields = parseTallyFields(req.body?.data?.fields || []);

    // El campo oculto 'tel' se pre-llena vÃ­a URL: ?tel=573...
    const tel = tallyVal(fields, 'tel', 'telefono', 'telÃ©fono', 'phone');

    // Productos seleccionados (MULTIPLE_CHOICE, max 5)
    // El label exacto que pusiste en Tally
    const productosRaw = tallyVal(fields,
      'productos favoritos', 'productos', 'products',
      'Â¿cuÃ¡les son tus 5 productos favoritos de brujerÃ­a capilar?',
      'Â¿cuÃ¡les son tus 5 productos favoritos?',
    );

    if (!tel) {
      console.warn('[webhook/encuesta] Submission sin campo tel');
      return res.status(400).json({ error: 'Falta campo tel' });
    }

    // Buscar influencer por telÃ©fono (normaliza internamente)
    const inf = await supabase.getInfluencerByTelefono(tel);

    if (!inf) {
      console.warn(`[webhook/encuesta] Influencer no encontrada para tel=${tel}`);
      return res.status(404).json({ error: 'Influencer no encontrada' });
    }

    const productos = productosRaw
      ? productosRaw.split(',').map(p => p.trim()).filter(Boolean)
      : [];

    await supabase.updateInfluencer(inf.id, { productos_favoritos: productos });

    console.log(`[webhook/encuesta] ${inf.nombre} â†’ productos: ${productos.join(' | ')}`);
    res.json({ ok: true, influencer: inf.nombre, productos });
  } catch (e) {
    console.error('[webhook/encuesta] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€ PREFERENCIAS DE PRODUCTOS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const PRODUCTOS_CATALOGO = [
  'Termoprotector Capilar',
  'Mascarilla Hechizo Total',
  'Crema Para Rizos 3en1',
  'Shampoo Ultra',
  'Varita MÃ¡gica',
  'Mist - Fragancias Corporales',
];

app.get('/preferencias', (req, res) => {
  const items = PRODUCTOS_CATALOGO.map((p, i) => `
    <li data-name="${p}">
      <span class="num">${i + 1}</span>
      <span class="product-name">${p}</span>
      <span class="drag-icon">&#8942;</span>
    </li>`).join('');

  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<title>Tus preferencias â€” BrujerÃ­a Capilar</title>
<script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f0a1e;color:#f0e6ff;min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:24px 16px 48px}
.card{background:#1a1030;border:1px solid #3d2a6e;border-radius:20px;padding:32px 24px;max-width:480px;width:100%}
.logo{text-align:center;font-size:26px;font-weight:700;letter-spacing:-0.5px;margin-bottom:6px;color:#c084fc}
.logo span{color:#f0e6ff}
.sub{text-align:center;font-size:13px;color:#9970d4;margin-bottom:28px}
h1{font-size:18px;font-weight:600;text-align:center;line-height:1.4;margin-bottom:8px}
.hint{text-align:center;font-size:13px;color:#9970d4;margin-bottom:24px}
#ranking{list-style:none;display:flex;flex-direction:column;gap:10px;margin-bottom:28px}
#ranking li{background:#2a1a4e;border:1px solid #4c3080;border-radius:12px;padding:16px 18px;cursor:grab;display:flex;align-items:center;gap:14px;user-select:none;touch-action:none;transition:background .15s,border-color .15s}
#ranking li:active{cursor:grabbing}
#ranking li.sortable-ghost{background:#3d1f6e;border-color:#8b5cf6;opacity:.6}
.num{width:26px;height:26px;border-radius:50%;background:#6d28d9;color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.drag-icon{color:#6b4fa0;font-size:22px;flex-shrink:0;margin-left:auto}
.product-name{font-size:15px;font-weight:500;flex:1}
button{width:100%;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border:none;border-radius:12px;padding:16px;font-size:16px;font-weight:600;cursor:pointer;transition:opacity .2s}
button:hover{opacity:.9}
button:disabled{opacity:.5;cursor:default}
.success{display:none;text-align:center;padding:20px 0}
.success .emoji{font-size:52px;margin-bottom:16px}
.success h2{font-size:22px;font-weight:700;margin-bottom:10px;color:#c084fc}
.success p{font-size:15px;color:#9970d4;line-height:1.5}
</style>
</head>
<body>
<div class="card">
  <div class="logo">BrujerÃ­a <span>Capilar</span></div>
  <div class="sub">Programa Creadoras âœ¨</div>
  <h1>Â¿QuÃ© productos quieres recibir?</h1>
  <p class="hint">Arrastra para ordenar del que mÃ¡s al que menos quieres ðŸ‘‡</p>
  <ul id="ranking">${items}</ul>
  <button id="btn" onclick="enviar()">Enviar mis preferencias ðŸ’œ</button>
  <div class="success" id="ok">
    <div class="emoji">ðŸ”®</div>
    <h2>Â¡Gracias!</h2>
    <p>Recibimos tus preferencias.<br>Pronto te avisamos quÃ© productos incluiremos en tu kit.</p>
  </div>
</div>
<script>
const tel = new URLSearchParams(location.search).get('tel') || '';
const list = document.getElementById('ranking');
Sortable.create(list, {
  animation: 150,
  ghostClass: 'sortable-ghost',
  onEnd() {
    list.querySelectorAll('li').forEach((li, i) => {
      li.querySelector('.num').textContent = i + 1;
    });
  },
});
async function enviar() {
  const btn = document.getElementById('btn');
  btn.disabled = true;
  btn.textContent = 'Enviando...';
  const productos = [...list.querySelectorAll('li')].map(li => li.dataset.name);
  try {
    const r = await fetch('/api/preferencias', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ tel, productos }),
    });
    if (!r.ok) throw new Error(await r.text());
    list.style.display = 'none';
    btn.style.display = 'none';
    document.getElementById('ok').style.display = 'block';
  } catch(e) {
    btn.disabled = false;
    btn.textContent = 'Enviar mis preferencias ðŸ’œ';
    alert('Error al enviar. Intenta de nuevo.');
  }
}
</script>
</body>
</html>`);
});

app.post('/api/preferencias', async (req, res) => {
  try {
    const { tel, productos } = req.body;
    if (!tel || !Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ error: 'Faltan tel o productos' });
    }
    const inf = await supabase.getInfluencerByTelefono(tel);
    if (!inf) {
      console.warn(`[preferencias] Influencer no encontrada: ${tel}`);
      return res.status(404).json({ error: 'Influencer no encontrada' });
    }
    await supabase.updateInfluencer(inf.id, { productos_favoritos: productos });
    console.log(`[preferencias] ${inf.nombre} â†’ ${productos.join(' > ')}`);
    res.json({ ok: true, nombre: inf.nombre });
  } catch (e) {
    console.error('[preferencias] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€ CRON SEGUIMIENTO (Railway cron â†’ POST cada lunes) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          console.log(`[cron/seguimiento] ${inf.nombre}: ya recibiÃ³ este mensaje, skip`);
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

// â”€â”€ CRON IDEAS DE CONTENIDO (Railway cron diario â†’ 4 dÃ­as post-envÃ­o) â”€â”€â”€
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

// â”€â”€ WEBHOOK WHATSAPP ENTRANTE (botones de respuesta rÃ¡pida) â”€â”€â”€â”€â”€â”€
// GET: verificaciÃ³n de Meta
app.get('/webhook/wa', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === config.whatsapp.verify_token) {
    console.log('[webhook/wa] Webhook verificado');
    return res.status(200).send(challenge);
  }
  res.status(403).send('Forbidden');
});

// POST: mensajes y clics de botones entrantes
app.post('/webhook/wa', async (req, res) => {
  res.status(200).send('OK'); // responder inmediatamente a Meta
  try {
    const messages = req.body?.entry?.[0]?.changes?.[0]?.value?.messages;
    if (!messages?.length) return;

    for (const msg of messages) {
      const from = msg.from; // telÃ©fono en formato 57XXXXXXXXXX
      // Texto del botÃ³n pulsado (quick_reply o interactive)
      const boton = msg.button?.text || msg.interactive?.button_reply?.title;
      if (!boton) continue;

      const influencer = await supabase.getInfluencerByTelefono(from);
      if (!influencer) {
        console.warn(`[webhook/wa] TelÃ©fono no encontrado: ${from}`);
        continue;
      }

      if (boton === 'Si, me llego') {
        await supabase.updateInfluencer(influencer.id, {
          fecha_confirmacion_recibo: new Date().toISOString().split('T')[0],
          paquete_no_llego: false,
        });
        await supabase.registrarNotificacion(influencer.id, 'confirmacion_llegada_influencers', 'influencer');
        console.log(`[webhook/wa] ${influencer.nombre} confirmÃ³ recibo del paquete`);

      } else if (boton === 'No me ha llegado') {
        await supabase.updateInfluencer(influencer.id, { paquete_no_llego: true });
        console.log(`[webhook/wa] ${influencer.nombre} reportÃ³ que no le llegÃ³ el paquete â€” requiere atenciÃ³n`);
      }
    }
  } catch (e) {
    console.error('[webhook/wa] Error:', e.message);
  }
});

// â”€â”€ CRON CONFIRMACIÃ“N LLEGADA (diario â€” 5 dÃ­as post-envÃ­o) â”€â”€â”€â”€â”€â”€â”€
// EnvÃ­a template con botones para confirmar si llegÃ³ el paquete
app.post('/api/cron/confirmacion-llegada', async (req, res) => {
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  const IMPORT_TOKEN = process.env.IMPORT_TOKEN || 'brujeria-import-2026';
  const validSecret = secret === IMPORT_TOKEN || (config.tally_webhook_secret && secret === config.tally_webhook_secret);
  if (!validSecret) return res.status(401).json({ error: 'No autorizado' });
  const debug = req.query.debug === '1';
  try {
    const hoy = new Date();
    const todas = await supabase.getInfluencersConTelefono();
    const diagnostico = todas.map(i => {
      const tieneFechaEnvio = !!i.fecha_envio;
      const yaConfirmo = !!i.fecha_confirmacion_recibo;
      const dias = tieneFechaEnvio ? Math.floor((hoy - new Date(i.fecha_envio)) / (1000 * 60 * 60 * 24)) : null;
      const pasa = tieneFechaEnvio && !yaConfirmo && dias >= 5;
      return { nombre: i.nombre, status: i.status, fecha_envio: i.fecha_envio, dias, yaConfirmo, pasa };
    });
    const candidatas = todas.filter(i => {
      if (!i.fecha_envio) return false;
      if (i.fecha_confirmacion_recibo) return false;
      const dias = Math.floor((hoy - new Date(i.fecha_envio)) / (1000 * 60 * 60 * 24));
      return dias >= 5;
    });

    if (debug) return res.json({ total_con_telefono: todas.length, candidatas: candidatas.length, diagnostico });

    const force = req.query.force === '1';
    // Responder inmediato — procesar en background para no exceder timeout de Railway
    res.json({ ok: true, candidatas: candidatas.length, mensaje: 'Procesando en background' });
    setImmediate(async () => {
      let enviados = 0, skippedYaEnviado = 0, errores = 0;
      for (const inf of candidatas) {
        try {
          if (!force) {
            const yaEnviado = await supabase.yaEnviadoTemplate(inf.id, 'confirmacion_llegada_influencers');
            if (yaEnviado) { skippedYaEnviado++; continue; }
          }
          const wa = await enviarConfirmacionLlegada(inf);
          if (wa?.sent) { await supabase.registrarNotificacion(inf.id, 'confirmacion_llegada_influencers', 'cron'); enviados++; }
        } catch (e) {
          errores++;
          console.error(`[cron confirmacion-llegada] error ${inf.nombre}:`, e.message);
        }
      }
      console.log(`[cron confirmacion-llegada] done — enviados:${enviados} skipped:${skippedYaEnviado} errores:${errores}`);
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€ CRON SEGUIMIENTO PRODUCTOS (diario â€” 2 dÃ­as post-confirmaciÃ³n) â”€
// EnvÃ­a pregunta sobre productos y contenido despuÃ©s de confirmar llegada
app.post('/api/cron/seguimiento-productos', async (req, res) => {
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  const IMPORT_TOKEN = process.env.IMPORT_TOKEN || 'brujeria-import-2026';
  const validSecret = secret === IMPORT_TOKEN || (config.tally_webhook_secret && secret === config.tally_webhook_secret);
  if (!validSecret) return res.status(401).json({ error: 'No autorizado' });
  try {
    const hoy = new Date();
    const todas = await supabase.getInfluencersConTelefono();
    const candidatas = todas.filter(i => {
      if (!i.fecha_confirmacion_recibo) return false;
      if (['Contenido Entregado', 'Calificada'].includes(i.status)) return false;
      const dias = Math.floor((hoy - new Date(i.fecha_confirmacion_recibo)) / (1000 * 60 * 60 * 24));
      return dias >= 7;
    });

    const resultados = [];
    for (const inf of candidatas) {
      try {
        const yaEnviado = await supabase.yaEnviadoTemplate(inf.id, 'seguimiento_productos_brujeria');
        if (yaEnviado) continue;
        const wa = await enviarSeguimientoProductos(inf);
        if (wa?.sent) await supabase.registrarNotificacion(inf.id, 'seguimiento_productos_brujeria', 'cron');
        resultados.push({ nombre: inf.nombre, ok: true });
      } catch (e) {
        resultados.push({ nombre: inf.nombre, error: e.message });
      }
    }
    res.json({ ok: true, total: resultados.length, resultados });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€ LANDING BIENVENIDA KIT (pÃºblica â€” sin login) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/bienvenida-kit', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'bienvenida-kit.html'));
});

// Info de influencer por telÃ©fono (para mostrar nombre en landing)
app.get('/api/bienvenida-kit/info', async (req, res) => {
  try {
    const { tel } = req.query;
    if (!tel) return res.json({ nombre: '' });
    const inf = await supabase.getInfluencerByTelefono(tel);
    res.json({ nombre: inf?.nombre || '' });
  } catch (e) {
    res.json({ nombre: '' });
  }
});

// Confirmar recibo + fecha planeada de publicaciÃ³n (sin login)
app.post('/api/bienvenida-kit', async (req, res) => {
  try {
    const { tel, fecha_planeada } = req.body;
    if (!tel) return res.status(400).json({ error: 'TelÃ©fono requerido' });
    const inf = await supabase.getInfluencerByTelefono(tel);
    if (!inf) return res.status(404).json({ error: 'No encontrada en el programa' });
    await supabase.updateInfluencer(inf.id, {
      fecha_confirmacion_recibo: new Date().toISOString().split('T')[0],
      fecha_planeada_publicacion: fecha_planeada || null,
      paquete_no_llego: false,
    });
    await supabase.registrarNotificacion(inf.id, 'confirmacion_llegada_influencers', 'influencer');
    console.log(`[bienvenida-kit] ${inf.nombre} confirmÃ³ recibo | planea publicar: ${fecha_planeada}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('[bienvenida-kit]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€ GUÃA DEL PROGRAMA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/guia', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'guia.html'));
});

// â”€â”€ PORTAL INFLUENCERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// Auth: crear contraseÃ±a (primera vez)
app.post('/api/auth/set-password', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseÃ±a requeridos' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseÃ±a debe tener al menos 6 caracteres' });
  try {
    const influencer = await supabase.getInfluencerByEmail(email.toLowerCase().trim());
    if (!influencer) return res.status(404).json({ error: 'Email no registrado' });
    if (influencer.password_hash) return res.status(400).json({ error: 'Ya tienes una contraseÃ±a. Usa iniciar sesiÃ³n.' });
    const hash = await bcrypt.hash(password, 10);
    await supabase.updatePasswordHash(influencer.id, hash);
    const token = jwt.sign({ id: influencer.id, email: influencer.email }, config.jwt_secret, { expiresIn: '30d' });
    res.json({ token, nombre: influencer.nombre });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Auth: login con contraseÃ±a
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseÃ±a requeridos' });
  try {
    const influencer = await supabase.getInfluencerByEmail(email.toLowerCase().trim());
    if (!influencer) return res.status(404).json({ error: 'Email no registrado' });
    if (!influencer.password_hash) return res.status(400).json({ error: 'AÃºn no tienes contraseÃ±a. Usa "primera vez".' });
    const ok = await bcrypt.compare(password, influencer.password_hash);
    if (!ok) return res.status(401).json({ error: 'ContraseÃ±a incorrecta' });
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
      return res.json({ atribuido: 0, mensaje: 'Sin cÃ³digo de descuento asignado aÃºn' });
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

// Solicitar reenvÃ­o de producto (influencer autenticada)
app.post('/api/influencer/solicitar-producto', authMiddleware, async (req, res) => {
  const { productos, mensaje, direccion } = req.body;
  if (!productos || !Array.isArray(productos) || productos.length === 0) {
    return res.status(400).json({ error: 'Debes seleccionar al menos un producto' });
  }
  try {
    // Actualizar direcciÃ³n en perfil si cambiÃ³
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

// â”€â”€ CANDIDATAS TIKTOK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// URLs de Tally (pÃºblico)
app.get('/api/influencer/tally-urls', (req, res) => {
  res.json({
    contenido: config.tally_contenido_url,
    registro: config.tally_registro_url,
  });
});

// â”€â”€ NOTIFICACIONES MANUALES (admin â†’ WhatsApp) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.post('/api/admin/notificaciones', async (req, res) => {
  const { influencer_ids, template, status_filter, fuente_filter, token } = req.body;
  const IMPORT_TOKEN = process.env.IMPORT_TOKEN || 'brujeria-import-2026';
  if (token !== IMPORT_TOKEN) {
    return res.status(403).json({ error: 'Token invÃ¡lido' });
  }
  if (!template) return res.status(400).json({ error: 'Template requerido' });

  try {
    let influencers;
    if (influencer_ids === 'all') {
      influencers = await supabase.getInfluencersConTelefono();
      // Filtrar por status si se especifica (ej: "Registrada" para reenganche)
      if (status_filter) {
        influencers = influencers.filter(i => i.status === status_filter);
      }
      if (fuente_filter) {
        influencers = influencers.filter(i => i.fuente === fuente_filter);
      }
    } else if (Array.isArray(influencer_ids) && influencer_ids.length > 0) {
      influencers = (await Promise.all(influencer_ids.map(id => supabase.getInfluencerById(id)))).filter(Boolean);
    } else {
      return res.status(400).json({ error: 'influencer_ids debe ser "all" o un array de IDs' });
    }

    // Templates de una sola vez â€” no se reenvÃ­an
    const TEMPLATES_UNICOS = ['bienvenida_club_brujeria', 'bienvenida_kit', 'ideas_contenido_brujeria1', 'reenganche_brujeria', 'encuesta_productos_brujeria'];

    const resultados = [];
    for (const inf of influencers) {
      try {
        const templateMeta = template === 'bienvenida_kit' ? 'bienvenida_club_brujeria'
          : template === 'bienvenida_club' ? 'bienvenida_club_brujeria'
          : template === 'recordatorio' ? 'explicacion_contenido_brujeria'
          : template === 'ideas' ? 'ideas_contenido_brujeria1'
          : template === 'reenganche' ? 'reenganche_brujeria'
          : template === 'encuesta' ? 'encuesta_productos_brujeria'
          : template === 'feedback_contenido' ? 'feedback_contenido_brujeria'
          : null;

        if (!req.body.force && templateMeta && TEMPLATES_UNICOS.includes(templateMeta)) {
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
        else if (template === 'encuesta') wa = await enviarEncuestaProductos(inf);
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

    console.log(`[admin/notificaciones] Template "${template}" â†’ ${resultados.length} procesadas`);
    resultados.forEach(r => console.log(`  ${r.nombre}: ok=${r.ok}`, r.skipped ? '(skipped)' : r.resultado || r.error));
    res.json({ ok: true, total: resultados.length, resultados });
  } catch (e) {
    console.error('[admin/notificaciones] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€ IMPORTACIÃ“N MASIVA DE INFLUENCERS (token protegido, un solo uso) â”€â”€
app.post('/api/admin/influencers/bulk-import', async (req, res) => {
  const { influencers, token } = req.body;
  const IMPORT_TOKEN = process.env.IMPORT_TOKEN || 'brujeria-import-2026';
  if (token !== IMPORT_TOKEN) {
    return res.status(403).json({ error: 'Token de importaciÃ³n invÃ¡lido' });
  }
  if (!Array.isArray(influencers) || influencers.length === 0) {
    return res.status(400).json({ error: 'Se requiere un array de influencers' });
  }

  const resultados = { creadas: [], omitidas: [], errores: [] };

  for (const inf of influencers) {
    try {
      // Dedup por email, telÃ©fono o handle
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
        tiktok_handle: inf.tiktok_handle || null,
        instagram_handle: inf.instagram_handle || null,
        seguidores_tiktok: inf.tiktok_handle ? (inf.seguidores || null) : null,
        tier: inf.tier || 'Nano',
        status: 'Registrada',
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
// ── UGC — Programa de comisiones ─────────────────────────────────────────────

const UGC_TIERS = [
  { hasta: 300000,  pct: 10, nombre: 'Bruja Iniciada' },
  { hasta: 1000000, pct: 15, nombre: 'Bruja Activa'   },
  { hasta: Infinity, pct: 20, nombre: 'Gran Bruja'    },
];

function calcularTierUGC(ventasMes) {
  return UGC_TIERS.find(t => ventasMes <= t.hasta) || UGC_TIERS[UGC_TIERS.length - 1];
}

// Regalo 1 = bienvenida, luego +1 por cada $300K acumulados
function calcularRegalosGanados(ventasTotales) {
  return 1 + Math.floor(ventasTotales / 300000);
}

// Listar todas las creadoras UGC con stats del mes
app.get('/api/ugc/creadoras', async (req, res) => {
  try {
    const mesActual = new Date().toISOString().substring(0, 7);
    const creadoras = await supabase.getUGCCreadoras();
    const result = await Promise.all(creadoras.map(async c => {
      const [ventas, regalos] = await Promise.all([
        supabase.getUGCVentas(c.id),
        supabase.getUGCRegalos(c.id),
      ]);
      const ventasMes   = ventas.filter(v => v.mes === mesActual);
      const totalMes    = ventasMes.reduce((s, v) => s + parseFloat(v.total_orden || 0), 0);
      const totalAll    = ventas.reduce((s, v) => s + parseFloat(v.total_orden || 0), 0);
      const tier        = calcularTierUGC(totalMes);
      const comisionMes = ventasMes.reduce((s, v) => s + parseFloat(v.comision_valor || 0), 0);
      const ganados     = calcularRegalosGanados(totalAll);
      const enviados    = regalos.filter(r => r.estado === 'enviado').length;
      return {
        ...c,
        ventas_mes:              Math.round(totalMes),
        ventas_totales:          Math.round(totalAll),
        nivel_ugc:               tier.nombre,
        comision_pct:            tier.pct,
        comision_mes_pendiente:  Math.round(comisionMes),
        regalos_ganados:         ganados,
        regalos_enviados:        enviados,
        regalos_pendientes:      Math.max(0, ganados - enviados),
      };
    }));
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Enrollar influencer en UGC y crearle código
app.post('/api/ugc/enroll/:id', async (req, res) => {
  try {
    const inf = await supabase.getInfluencerById(req.params.id);
    if (!inf) return res.status(404).json({ error: 'Creadora no encontrada' });
    if (inf.ugc_activa) return res.status(400).json({ error: 'Ya está en el programa UGC' });

    const handle = inf.instagram_handle || inf.tiktok_handle || inf.nombre.split(' ')[0];

    // Reusar codigo_descuento existente si ya tiene, si no crear uno nuevo
    let codigo = inf.codigo_descuento || null;
    if (!codigo) {
      try   { codigo = await shopify.createUGCDiscountCode(handle); }
      catch { codigo = shopify.generateUGCDiscountCode(handle); }
    }

    await supabase.enrollUGC(inf.id, codigo);

    // Regalo de bienvenida
    await supabase.insertUGCRegalo({ influencer_id: inf.id, numero_regalo: 1, hito_ventas: 0, estado: 'pendiente' });

    res.json({ ok: true, codigo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Sync ventas Shopify para todas las creadoras UGC
app.post('/api/ugc/sync', async (req, res) => {
  try {
    const creadoras  = await supabase.getUGCCreadoras();
    const fechaDesde = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    let totalNuevas  = 0;

    for (const c of creadoras) {
      if (!c.codigo_ugc) continue;

      const ordenes = await shopify.getOrdenesParaCodigo(c.codigo_ugc, fechaDesde);

      // Calcular comisión basada en ventas del mes actual
      const mesActual    = new Date().toISOString().substring(0, 7);
      const ventasMes    = ordenes.filter(o => o.fecha.startsWith(mesActual));
      const totalMes     = ventasMes.reduce((s, o) => s + o.total, 0);
      const pctMes       = calcularTierUGC(totalMes).pct;

      for (const o of ordenes) {
        const mes = o.fecha.substring(0, 7);
        const pct = mes === mesActual ? pctMes : calcularTierUGC(
          ordenes.filter(x => x.fecha.startsWith(mes)).reduce((s, x) => s + x.total, 0)
        ).pct;
        const nueva = await supabase.insertUGCVenta({
          influencer_id:    c.id,
          shopify_order_id: o.shopify_order_id,
          order_number:     o.order_number,
          fecha:            o.fecha,
          total_orden:      o.total,
          comision_pct:     pct,
          comision_valor:   Math.round(o.total * pct / 100),
          mes,
        });
        if (nueva) totalNuevas++;
      }

      // Verificar hitos de regalos
      const ventasTotales = await supabase.getUGCVentasTotales(c.id);
      const ganados       = calcularRegalosGanados(ventasTotales);
      const existentes    = await supabase.getUGCRegalos(c.id);
      for (let n = 1; n <= ganados; n++) {
        if (!existentes.find(r => r.numero_regalo === n)) {
          await supabase.insertUGCRegalo({
            influencer_id: c.id,
            numero_regalo: n,
            hito_ventas:   n === 1 ? 0 : (n - 1) * 300000,
            estado:        'pendiente',
          });
        }
      }
    }
    res.json({ ok: true, nuevas_ventas: totalNuevas });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Stats detalladas de una creadora UGC (para el portal)
app.get('/api/ugc/stats/:id', async (req, res) => {
  try {
    const inf = await supabase.getInfluencerById(req.params.id);
    if (!inf || !inf.ugc_activa) return res.status(404).json({ error: 'No está en UGC' });

    const mesActual  = new Date().toISOString().substring(0, 7);
    const [ventas, regalos, pagos] = await Promise.all([
      supabase.getUGCVentas(req.params.id),
      supabase.getUGCRegalos(req.params.id),
      supabase.getUGCPagos(req.params.id),
    ]);
    const ventasMes   = ventas.filter(v => v.mes === mesActual);
    const totalMes    = ventasMes.reduce((s, v) => s + parseFloat(v.total_orden), 0);
    const totalAll    = ventas.reduce((s, v) => s + parseFloat(v.total_orden), 0);
    const tier        = calcularTierUGC(totalMes);
    const comisionMes = ventasMes.reduce((s, v) => s + parseFloat(v.comision_valor), 0);

    res.json({
      codigo_ugc:      inf.codigo_ugc,
      ventas_totales:  Math.round(totalAll),
      ventas_mes:      Math.round(totalMes),
      nivel_ugc:       tier.nombre,
      comision_pct:    tier.pct,
      comision_mes:    Math.round(comisionMes),
      siguiente_nivel: tier.hasta === Infinity ? null : tier.hasta - totalMes,
      regalos_ganados: calcularRegalosGanados(totalAll),
      regalos_enviados: regalos.filter(r => r.estado === 'enviado').length,
      regalos,
      pagos,
      ventas_recientes: ventas.slice(0, 10),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Registrar pago de comisión
app.post('/api/ugc/pagos', async (req, res) => {
  try {
    const { influencer_id, mes, total_ventas, total_comision, metodo_pago, notas } = req.body;
    const pago = await supabase.insertUGCPago({
      influencer_id, mes, total_ventas, total_comision,
      estado: 'pagado', fecha_pago: new Date().toISOString(),
      metodo_pago, notas,
    });
    res.json(pago);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Listar todos los regalos pendientes de enviar
app.get('/api/ugc/regalos-pendientes', async (req, res) => {
  try {
    const regalos = await supabase.getUGCRegalosAllPendientes();
    res.json(regalos);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Marcar regalo como enviado
app.post('/api/ugc/regalos/:id/enviar', async (req, res) => {
  try {
    await supabase.updateUGCRegalo(req.params.id, {
      estado: 'enviado',
      fecha_envio: new Date().toISOString(),
      notas: req.body.notas || null,
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── RUTAS PÚBLICAS UGC ────────────────────────────────────────────────────────
app.get('/registro-ugc',  (req, res) => res.sendFile(path.join(__dirname, 'public', 'registro-ugc.html')));
app.get('/bienvenida-ugc',(req, res) => res.sendFile(path.join(__dirname, 'public', 'bienvenida-ugc.html')));
app.get('/guia-ugc',      (req, res) => res.sendFile(path.join(__dirname, 'public', 'guia-ugc.html')));

// Registro de nueva creadora UGC — crea perfil, código Shopify y regalo de bienvenida
app.post('/api/ugc/registro', async (req, res) => {
  try {
    const { nombre, email, telefono, red_social, red_social_handle, ciudad, departamento, tipo_cabello, direccion_envio, password } = req.body;

    if (!nombre || !email || !telefono || !direccion_envio || !password)
      return res.status(400).json({ error: 'Todos los campos obligatorios deben completarse' });

    const emailClean = email.toLowerCase().trim();
    const plataforma = red_social || 'instagram';
    // Limpiar handle: remover @ y URLs completas (ej: https://www.instagram.com/usuario → usuario)
    let handleRaw = (red_social_handle || '').replace('@', '').trim();
    if (handleRaw.startsWith('http')) {
      const parts = handleRaw.replace(/\/$/, '').split('/');
      handleRaw = parts[parts.length - 1] || handleRaw;
    }
    const handleClean = handleRaw || null;

    // Buscar si ya existe
    let inf = await supabase.getInfluencerByEmail(emailClean);
    if (!inf && telefono)    inf = await supabase.getInfluencerByTelefono(telefono);
    if (!inf && handleClean && plataforma === 'tiktok')     inf = await supabase.getInfluencerByTikTok(handleClean);
    if (!inf && handleClean && plataforma !== 'tiktok')     inf = await supabase.getInfluencerByInstagram(handleClean);

    if (inf && inf.ugc_activa) {
      return res.json({ ok: true, codigo: inf.codigo_ugc, email: emailClean, ya_registrada: true, password: '' });
    }

    if (!inf) {
      inf = await supabase.insertInfluencer({
        nombre, email: emailClean, telefono: telefono || null,
        instagram_handle: plataforma !== 'tiktok' ? (handleClean || null) : null,
        tiktok_handle:    plataforma === 'tiktok'  ? (handleClean || null) : null,
        ciudad: ciudad || null, departamento: departamento || null,
        direccion_envio: direccion_envio || null,
        tipo_cabello: tipo_cabello || null,
        tier: 'nano', status: 'Registrada', fuente: 'ugc_registro',
      });
    } else {
      await supabase.updateInfluencer(inf.id, {
        ...(direccion_envio && { direccion_envio }),
        ...(ciudad && { ciudad }),
        ...(tipo_cabello && { tipo_cabello }),
        fuente: 'ugc_registro',
      });
    }

    // Contraseña definida por la creadora en el formulario
    const primerNombre = nombre.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
    const hash         = await bcrypt.hash(password, 10);
    await supabase.updatePasswordHash(inf.id, hash);

    // Crear código UGC en Shopify — reusar si ya tiene uno asignado
    const handle = handleClean || primerNombre;
    let codigo = inf.codigo_ugc || null;
    if (!codigo) {
      try   { codigo = await shopify.createUGCDiscountCode(handle); }
      catch { codigo = shopify.generateUGCDiscountCode(handle); }
    }

    // Enrollar en UGC + regalo de bienvenida
    await supabase.enrollUGC(inf.id, codigo);
    try { await supabase.insertUGCRegalo({ influencer_id: inf.id, numero_regalo: 1, hito_ventas: 0, estado: 'pendiente' }); } catch {}

    // WA Paso 3 — confirmación con código y link al portal (no bloquea si falla)
    if (telefono) {
      try { await enviarUGCConfirmacionRegistro(telefono, nombre, codigo); } catch (e) { console.warn('[ugc/registro] WA:', e.message); }
    }

    res.json({ ok: true, codigo, email: emailClean });
  } catch (e) {
    console.error('[ugc/registro]', e);
    res.status(500).json({ error: e.message });
  }
});

// Envío masivo WhatsApp — leads de Meta Lead Ads al programa UGC
// Body: { leads: [{nombre, telefono, ciudad}] }
app.post('/api/ugc/envio-masivo', async (req, res) => {
  const { leads = [] } = req.body;
  if (!Array.isArray(leads) || leads.length === 0)
    return res.status(400).json({ error: 'Se requiere un array de leads' });

  const resultados = [];
  for (const lead of leads) {
    const nombre   = (lead.nombre || '').split('|')[0].trim().split(' ')[0] || 'creadora';
    const telefono = lead.telefono || '';
    try {
      const r = await enviarUGCBienvenida(telefono, nombre);
      resultados.push({ nombre, telefono, ciudad: lead.ciudad, ok: true, ...r });
    } catch (e) {
      resultados.push({ nombre, telefono, ciudad: lead.ciudad, ok: false, error: e.message });
    }
    // Pausa 1s entre envíos
    await new Promise(r => setTimeout(r, 1000));
  }

  const ok     = resultados.filter(r => r.ok).length;
  const errors = resultados.filter(r => !r.ok).length;
  res.json({ total: leads.length, ok, errors, resultados });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\nApp Creadoras corriendo en http://localhost:${PORT}`);
  console.log('Ctrl+C para detener\n');
});

// â”€â”€ CRONS INTERNOS (sin dependencias externas) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Revisa cada hora si hay crons que correr segÃºn hora UTC
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
          console.log(`[cron/ideas] ${inf.nombre}: ya recibiÃ³ este mensaje, skip`);
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

  // Diario a las 15:00 UTC (10am BogotÃ¡) â€” ideas post-envÃ­o
  if (horaUTC === 15 && ultimoIdeas !== hoy) {
    ultimoIdeas = hoy;
    runCronIdeas();
  }

  // Lunes a las 14:00 UTC (9am BogotÃ¡) â€” seguimiento semanal
  if (diaUTC === 1 && horaUTC === 14 && ultimoSeguimiento !== hoy) {
    ultimoSeguimiento = hoy;
    runCronSeguimiento();
  }
}, 60 * 60 * 1000); // revisa cada hora
