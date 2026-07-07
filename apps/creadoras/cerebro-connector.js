// ─────────────────────────────────────────────────────────────────────────
// Mini-conector de SOLO LECTURA para El Cerebro (hub central).
// Expone GET /api/cerebro/snapshot protegido por header x-cerebro-key.
// NO modifica ningún otro comportamiento de la app.
// ─────────────────────────────────────────────────────────────────────────
const fetch = require('node-fetch');
const config = require('./config');

const BASE = (config.supabase.url || '').replace(/\/$/, '') + '/rest/v1';
const KEY = config.supabase.service_role_key;
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function q(table, params = {}) {
  const url = new URL(`${BASE}/${table}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString(), { headers: HEADERS });
  if (!r.ok) throw new Error(`supabase ${table}: ${r.status} ${await r.text()}`);
  return r.json();
}

const num = v => (v == null ? 0 : Number(v)) || 0;

module.exports = function mountCerebro(app) {
  app.get('/api/cerebro/snapshot', async (req, res) => {
    const key = process.env.CEREBRO_KEY;
    if (!key || req.get('x-cerebro-key') !== key) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    try {
      const mes = new Date().toISOString().slice(0, 7); // YYYY-MM

      const [creadoras, ventas, pagos, contenidos] = await Promise.all([
        // Solo las columnas del contrato — evita traer password_hash, documento, dirección, etc.
        q('influencers', { select: 'id,nombre,instagram_handle,tiktok_handle,tier,nivel_bruja,status', ugc_activa: 'eq.true' }),
        q('ugc_ventas', { select: 'influencer_id,total_orden,comision_valor,mes' }),
        q('ugc_pagos', { select: 'influencer_id,total_comision,estado' }),
        q('contenidos', { select: 'influencer_id,fecha_submision' }),
      ]);

      const ventasByInf = {}, comisionByInf = {}, pagadoByInf = {}, contByInf = {};
      ventas.forEach(v => {
        ventasByInf[v.influencer_id]   = (ventasByInf[v.influencer_id]   || 0) + num(v.total_orden);
        comisionByInf[v.influencer_id] = (comisionByInf[v.influencer_id] || 0) + num(v.comision_valor);
      });
      pagos.forEach(p => {
        if (p.estado === 'pagado') pagadoByInf[p.influencer_id] = (pagadoByInf[p.influencer_id] || 0) + num(p.total_comision);
      });
      contenidos.forEach(ct => {
        if ((ct.fecha_submision || '').startsWith(mes)) contByInf[ct.influencer_id] = (contByInf[ct.influencer_id] || 0) + 1;
      });

      const creators = creadoras.map(c => ({
        name: c.nombre,
        handle: c.instagram_handle || c.tiktok_handle || '',
        followers: num(c.seguidores),          // 0 si el esquema no lo guarda
        tier: c.tier || c.nivel_bruja || '',
        deliverables_month: null,              // no hay meta de entregables por mes en el esquema
        delivered: num(contByInf[c.id]),       // contenidos entregados este mes
        sales_attributed: num(ventasByInf[c.id]),
        payment_due: Math.max(0, num(comisionByInf[c.id]) - num(pagadoByInf[c.id])),
        status: c.status || '',
      }));

      res.json({ creators });
    } catch (e) {
      console.error('[cerebro] error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });
};
