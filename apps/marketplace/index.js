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

  // Quien viene a recuperar su contraseña SÍ tiene cuenta, y mandarla a la
  // landing de invitación le pierde el token: aterriza en una página que no
  // sabe qué hacer con él, vuelve a pedir el enlace, y así.
  //
  // Es exactamente lo que pasó: 132 pedidos de recuperación en cuatro días y
  // uno solo usado.
  const token = req.query?.recuperar;
  const destino = token
    ? `${config.base_url}/creadora.html?recuperar=${encodeURIComponent(token)}`
    // Sin token, a la landing de invitación: quien viene del correo de
    // invitación no tiene cuenta todavía, y el login le pide un correo y una
    // clave que no existen.
    : `${config.base_url}/invitacion.html`;
  // 302 y no 301: es un arreglo temporal y un permanente se queda cacheado en
  // el navegador de la creadora aunque después lo revirtamos.
  res.redirect(302, destino);
});

app.get('/health', (req, res) => {
  res.json({ ok: true, servicio: 'creatorsmanager.com', entorno: config.entorno });
});

app.use('/api/landing', require('./landing'));

// Precios sin el .html: es la dirección que se pone en una cotización o en un
// mensaje de WhatsApp, y "creatorsmanager.com/precios" se lee mejor.
// La landing de marcas, en URL limpia. Es la que se reparte en frío, así que
// "creatorsmanager.com/marcas" tiene que poder decirse por teléfono.
app.get('/marcas', (req, res) => {
  res.sendFile(require('path').join(__dirname, 'public', 'marcas.html'));
});

app.get('/precios', (req, res) => {
  res.sendFile(require('path').join(__dirname, 'public', 'precios.html'));
});

// La política de tratamiento de datos. Va por su propia ruta y no dentro de
// los términos porque la Ley 1581 la trata como documento aparte: se acepta
// aparte y se puede consultar sin tener cuenta.
app.get('/privacidad', (req, res) => {
  const { privacidadHTML } = require('./privacidad');
  res.type('html').send(privacidadHTML({
    direccion: process.env.MK_LEGAL_DIRECCION,
    correo:    process.env.MK_LEGAL_CORREO,
    telefono:  process.env.MK_LEGAL_TELEFONO,
  }));
});

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
// Campañas con cupos. Los dos lados del mismo flujo, cada uno con su auth: la
// marca crea, invita y confirma; la creadora ve y responde.
//
// Van ANTES que los routers generales: Express reparte por prefijo y en orden,
// así que montarlos después dejaría '/api/marcas/cupos' detrás de un router
// que ya casa con su prefijo.
const { marcaAuth: soloMarca, creadoraAuth: soloCreadora } = require('./auth');
const cuposRutas = require('./campanas-cupos');
app.use('/api/marcas/cupos', soloMarca, cuposRutas.deMarca);
app.use('/api/creadoras/cupos', soloCreadora, cuposRutas.deCreadora);

// El perfil de la creadora y su media kit.
//
// Se monta en la ruta EXACTA y no en '/api/creadoras': el guard de sesión
// corre para todo lo que casa con el prefijo, así que montarlo arriba dejaría
// el registro y el login de creadoras exigiendo una sesión que todavía no
// tienen.
const mediakit = require('./mediakit');
app.use('/api/creadoras/mi-perfil', soloCreadora, mediakit.privado);
// La página pública va SIN sesión: es la que ella comparte en su bio, y pedir
// cuenta para verla la volvería inútil como carta de presentación.
app.use('/api/c', mediakit.publico);

app.use('/api/marcas', require('./marcas'));
app.use('/api/creadoras', require('./creadoras'));
app.use('/api/catalogo', require('./catalogo'));
app.use('/media', require('./media'));

// ── Panel admin ─────────────────────────────────────────────────────────────
// Basic Auth aplicado por router, no globalmente con lista blanca: es más
// difícil dejar por accidente una ruta admin abierta.

/**
 * Ejecuta los plazos que la interfaz promete: cierra propuestas sin responder
 * y —si está encendido— aprueba entregas que la marca no revisó.
 *
 * Se protege con el mismo usuario y clave del panel admin en vez de un secreto
 * aparte: es una credencial menos que rotar, y Railway puede mandarla en la
 * cabecera igual que lo hace el navegador.
 *
 * Con ?dry_run=1 dice qué haría sin tocar nada. Conviene mirarlo así la
 * primera vez, porque de aquí en adelante esto cancela tratos solo.
 */
app.post('/api/cron/plazos', adminAuth, async (req, res) => {
  try {
    const resumen = await require('./plazos').ejecutar({
      simulacro: req.query.dry_run === '1' || req.body?.dry_run === true,
    });
    console.log('[cron/plazos]', JSON.stringify(resumen));
    res.json(resumen);
  } catch (e) {
    console.error('[cron/plazos]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Concilia los pagos que quedaron pendientes contra lo que diga Wompi.
 *
 * Es la red de seguridad del cobro: si un webhook se pierde, aquí se detecta
 * que la marca ya pagó y el trato avanza igual. Sin esto, un mensaje perdido
 * significa alguien que pagó y no recibió nada, y que solo se descubre cuando
 * reclama.
 */
/**
 * Cierra las invitaciones a campañas cuyo plazo venció.
 *
 * Con ?dry_run=1 dice qué haría sin tocar nada. Conviene mirarlo así la
 * primera vez: de acá en adelante esto le cierra la puerta a creadoras sin que
 * nadie lo mire.
 */
app.post('/api/cron/cupos', adminAuth, async (req, res) => {
  try {
    const r = await require('./campanas-cupos').cerrarVencidas({
      simulacro: req.query.dry_run === '1' || req.body?.dry_run === true,
    });
    console.log('[cron/cupos]', JSON.stringify(r));
    res.json(r);
  } catch (e) {
    console.error('[cron/cupos]', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/cron/pagos', adminAuth, async (req, res) => {
  try {
    const pagos = require('./pagos');
    const r = await pagos.conciliarPendientes({
      margenMinutos: Number(req.query.margen) || undefined,
    });
    // Va en la misma ruta porque las dos cosas son el ciclo de vida del cobro y
    // el equipo las mira juntas cuando algo huele mal con los pagos.
    const planes = await pagos.avisarPlanesPorVencer();
    if (r.resueltas || r.detalle.length) console.log('[cron/pagos]', JSON.stringify(r));
    res.json({ ...r, planes });
  } catch (e) {
    console.error('[cron/pagos]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// La vitrina va aparte —colecciones, destacado y selección curada son un
// bloque con vida propia, y admin.js ya pasa de mil quinientas líneas— y va
// ANTES: Express reparte por prefijo y en orden, así que montarla después de
// '/api/admin' la deja detrás de un router que ya casa con su prefijo.
app.use('/api/admin/vitrina', adminAuth, require('./admin-vitrina'));
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

/**
 * Los plazos se ejecutan solos, sin cron externo.
 *
 * El portal le promete a la marca respuesta en 72 horas. Si eso depende de que
 * alguien configure un cron en Railway —o se acuerde de llamar una URL— la
 * promesa dura lo que dure la memoria de quien la montó. Metiéndolo dentro de
 * la app, funciona desde el momento en que se despliega y no hay nada que
 * mantener aparte.
 *
 * Correrlo de más no hace daño: `plazos.ejecutar()` es idempotente, así que dos
 * instancias de Railway pisándose una a otra no cierran nada dos veces.
 *
 * Se apaga con MK_PLAZOS_AUTO=0 (útil en local, para no tocar datos reales
 * mientras se desarrolla).
 */
function programarPlazos() {
  if (process.env.MK_PLAZOS_AUTO === '0' || process.env.NODE_ENV === 'test') return;

  // Configurables para poder probar el ciclo en segundos en vez de esperar dos
  // minutos cada vez. En producción se dejan como están.
  const CADA = Number(process.env.MK_PLAZOS_CADA_MS) || 6 * 3600_000;
  const ESPERA_INICIAL = Number(process.env.MK_PLAZOS_ESPERA_MS) || 120_000;

  const correr = async () => {
    try {
      const r = await require('./plazos').ejecutar();
      // Solo se escribe en el log si de verdad pasó algo. Una línea cada seis
      // horas diciendo "no hice nada" solo entierra lo que sí importa.
      if (r.avisadas || r.expiradas || r.aprobadas || r.errores.length) {
        console.log('[plazos]', JSON.stringify(r));
      }
    } catch (e) {
      console.error('[plazos] falló la pasada:', e.message);
    }

    // La conciliación de pagos viaja en el mismo reloj: son dos barridos
    // baratos y montar un segundo temporizador solo agrega algo más que se
    // puede quedar apagado sin que nadie lo note.
    try {
      const p = await require('./pagos').conciliarPendientes();
      if (p.resueltas || p.detalle.length) console.log('[pagos]', JSON.stringify(p));
    } catch (e) {
      console.error('[pagos] falló la conciliación:', e.message);
    }

    try {
      await require('./pagos').avisarPlanesPorVencer();
    } catch (e) {
      console.error('[planes] falló el aviso de vencimiento:', e.message);
    }

    try {
      const c = await require('./campanas-cupos').cerrarVencidas();
      if (c.vencidas || c.cupos_llenos || c.campanas) console.log('[cupos]', JSON.stringify(c));
    } catch (e) {
      console.error('[cupos] falló el cierre de vencidas:', e.message);
    }
  };

  // Sin unref(): mantener vivo el reloj es justo lo que se quiere en un
  // servidor que corre indefinidamente, y con unref el ciclo no llegaba a
  // dispararse.
  setTimeout(correr, ESPERA_INICIAL);
  setInterval(correr, CADA);
  console.log(`[plazos] revisión automática cada ${Math.round(CADA / 60000)} min`);
}

app.listen(config.puerto, () => {
  console.log(`Creators Manager escuchando en http://localhost:${config.puerto}`);
  console.log(`  Landing:  ${config.base_url}/`);
  console.log(`  Admin:    ${config.base_url}/admin.html`);
  programarPlazos();
});

module.exports = app;
