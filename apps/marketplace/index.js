// Creators Manager — servidor del marketplace de creadoras.
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
// Las muestras se suben en base64 dentro del JSON, y base64 infla el archivo
// cerca de un 33%. El bucket acepta hasta 10 MB, así que el cuerpo tiene que
// poder llegar a ~14 MB para que un archivo en el límite no se rechace aquí
// antes de llegar a Storage.
app.use(express.json({ limit: '16mb' }));

// ── Rutas públicas ──────────────────────────────────────────────────────────

// ── Rescate de los enlaces de la primera tanda de invitaciones ─────────────
//
// Brevo reescribe los enlaces de cada correo para pasarlos por un subdominio
// nuestro y contar los clics. El 25-ago-2026 salieron 114 invitaciones y ese
// subdominio —r.mail.creatorsmanager.com— estaba presentando un certificado
// vencido del lado de Brevo: cada creadora que hacía clic veía una pantalla de
// "este sitio puede estar suplantando a...". El peor recibimiento posible.
//
// Como esos correos ya están en las bandejas y no se pueden reescribir, el
// subdominio se apunta aquí y todo lo que llegue por él se manda al registro.
// Se pierde el conteo de clics y la atribución de referidas de esa tanda —el
// código va en el path cifrado por Brevo, que no sabemos leer— pero las
// creadoras llegan a donde tenían que llegar.
//
// Cuando Brevo arregle su certificado esto se puede quitar. Mientras tanto no
// estorba: solo actúa si la petición llega por ese host.
app.use((req, res, next) => {
  const host = String(req.hostname || req.headers.host || '').toLowerCase();
  if (!host.startsWith('r.mail.')) return next();

  const destino = `${config.base_url}/creadora.html`;
  // 302 y no 301: es un arreglo temporal y un permanente se queda cacheado en
  // el navegador de la creadora aunque después lo revirtamos.
  res.redirect(302, destino);
});

app.get('/health', (req, res) => {
  res.json({ ok: true, servicio: 'creatorsmanager.com', entorno: config.entorno });
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

// El webhook de Wompi es público a propósito: la pasarela no puede
// autenticarse con nuestra sesión. Su seguridad es la firma del evento, que se
// verifica en pagos.js antes de mover nada.
app.post('/webhook/wompi', require('./pagos').manejarEvento);

app.use('/api/pagos', require('./pagos'));
app.use('/api/marcas', require('./marcas'));
app.use('/api/creadoras', require('./creadoras'));
app.use('/api/catalogo', require('./catalogo'));
app.use('/media', require('./media'));

// ── Panel admin ─────────────────────────────────────────────────────────────
// Basic Auth aplicado por router, no globalmente con lista blanca: es más
// difícil dejar por accidente una ruta admin abierta.

app.use('/api/admin', adminAuth, require('./admin'));

// admin.html se sirve sin auth a propósito: es una cáscara vacía, no contiene
// ni un dato. La puerta real está en /api/admin/*, y la página pide usuario y
// clave con su propio formulario. Así hay una sola puerta —controlada por
// nosotros— en vez de dos (el diálogo del navegador más el nuestro).

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
  console.log(`Creators Manager escuchando en http://localhost:${config.puerto}`);
  console.log(`  Landing:  ${config.base_url}/`);
  console.log(`  Admin:    ${config.base_url}/admin.html`);
});

module.exports = app;
