const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const supabase = require('./supabase');
const shopify = require('./shopify');
const siigo = require('./siigo');

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
    const allowed = ['status', 'codigo_descuento', 'notas_equipo'];
    const data = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });
    await supabase.updateInfluencer(req.params.id, data);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── CONFIG PRODUCTOS ─────────────────────────────────────────────
app.get('/api/config/productos', (req, res) => {
  const productos = config.productos_disponibles || {};
  const kits = config.kits || {};
  res.json({ productos, kits });
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

// Servir frontend para cualquier ruta no-API
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\nApp Creadoras corriendo en http://localhost:${PORT}`);
  console.log('Ctrl+C para detener\n');
});
