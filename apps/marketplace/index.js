// Creadores.app — servidor del marketplace de creadoras.
//
// Este archivo solo cablea: middlewares, routers y estáticos. Toda la lógica
// vive en los módulos. Si empieza a crecer, es señal de que algo se está
// escribiendo en el lugar equivocado.
//
// Servicio independiente del Programa Creadoras (apps/creadoras): comparte la
// base de datos de Supabase, pero corre en su propio proceso, con su propio
// dominio y sus propios secretos.

const express = require('express');
const cors = require('cors');
const path = require('path');

const config = require('./config');
const db = require('./db');
const { adminAuth } = require('./auth');
const { terminosHTML } = require('./terminos');

const app = express();

app.use(cors());
// Las muestras se suben en base64 dentro del JSON: el límite por defecto de
// 100kb no alcanza.
app.use(express.json({ limit: '12mb' }));

// ── Rutas públicas ──────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ ok: true, servicio: 'creadores.app', entorno: config.entorno });
});

app.use('/api/landing', require('./landing'));

app.get('/terminos', async (req, res) => {
  try {
    const cfg = await db.getConfig();
    res.type('html').send(terminosHTML({
      comision_marca_pct: cfg.comision_marca_pct ?? 12,
      comision_creadora_pct: cfg.comision_creadora_pct ?? 8,
      plazo_meses: cfg.plazo_no_circunvalacion_meses ?? 12,
    }));
  } catch (e) {
    res.type('html').send(terminosHTML());
  }
});

// ── API con sesión ──────────────────────────────────────────────────────────

app.use('/api/marcas', require('./marcas'));
app.use('/api/creadoras', require('./creadoras'));
app.use('/api/catalogo', require('./catalogo'));
app.use('/media', require('./media'));

// ── Panel admin ─────────────────────────────────────────────────────────────
// Basic Auth aplicado por router, no globalmente con lista blanca: es más
// difícil dejar por accidente una ruta admin abierta.

app.use('/api/admin', adminAuth, require('./admin'));
app.get('/admin.html', adminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ── Estáticos ───────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));

// ── Manejo de errores ───────────────────────────────────────────────────────

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Ruta no encontrada' });
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  // Nunca se devuelve el stack: puede revelar rutas y estructura interna.
  res.status(err.status || 500).json({ error: err.message || 'Error interno' });
});

app.listen(config.puerto, () => {
  console.log(`Creadores.app escuchando en http://localhost:${config.puerto}`);
  console.log(`  Landing:  ${config.base_url}/`);
  console.log(`  Admin:    ${config.base_url}/admin.html`);
});

module.exports = app;
