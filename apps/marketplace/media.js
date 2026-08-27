// Proxy de piezas de contenido de muestra.
//
// Por qué existe: si el catálogo sirviera la URL original del CDN de Instagram
// o TikTok, esa URL llevaría identificadores que permiten llegar al perfil, y
// la identidad oculta se caería sola. Aquí el binario se descarga desde un
// bucket PRIVADO de Supabase Storage con nombre aleatorio y se hace stream al
// navegador. Nunca se devuelve ni se redirige a la URL de Storage.
//
// Encima de eso, lo que sale por aquí lleva marca de agua (ver watermark.js):
// el proxy solo esconde de dónde viene el archivo, no impide que alguien tome la
// pieza y la busque en Google Lens. La copia marcada —recortada y recomprimida—
// es lo que hace ese camino difícil. El original nunca sale por estas rutas.

const express = require('express');
const fetch = require('node-fetch');
const db = require('./db');
const config = require('./config');
const { sesionAuth, adminAuth } = require('./auth');

const router = express.Router();

const STORAGE_URL = String(config.supabase.url || '').replace(/\/$/, '') + '/storage/v1/object';

/**
 * Foto de perfil de una creadora.
 *
 * Va por el mismo proxy que las piezas: nunca se expone la URL de Storage, ni
 * siquiera para una foto de perfil.
 */
router.get('/perfil/:creadoraId', sesionAuth, async (req, res) => {
  try {
    const c = await db.getCreadoraCompleta(req.params.creadoraId);
    if (!c || !c.foto_perfil_path) return res.status(404).send('Sin foto');

    const url = `${STORAGE_URL}/${config.supabase.bucket_muestras}/${c.foto_perfil_path}`;
    const upstream = await fetch(url, {
      headers: { 'Authorization': `Bearer ${config.supabase.service_role_key}` },
    });
    if (!upstream.ok) return res.status(404).send('No disponible');

    res.setHeader('Content-Type', c.foto_perfil_mime || 'image/jpeg');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex, noimageindex');
    upstream.body.pipe(res);
  } catch (e) {
    console.error('[media/perfil]', e.message);
    res.status(500).send('Error');
  }
});

/**
 * Portada de un video.
 *
 * Va antes de /:id porque Express reparte por orden y "/algo/poster" también
 * casa con "/:id" si este se declara primero.
 *
 * Se cachea mucho más que la pieza: una portada no cambia nunca —se regenera
 * con otro nombre— así que el navegador puede quedársela sin riesgo de mostrar
 * algo viejo. Eso es justo lo que hace que el catálogo se sienta rápido al
 * volver a él.
 */
/**
 * Captura de estadísticas de una creadora.
 *
 * Solo admin: es una pantalla de su app personal, con su @usuario a la vista.
 * Dársela a una marca rompería la identidad oculta del catálogo de la forma más
 * directa posible.
 */
router.get('/captura/:creadoraId', adminAuth, async (req, res) => {
  try {
    const c = await db.getCreadoraCompleta(req.params.creadoraId);
    if (!c || !c.metricas_captura_path) return res.status(404).send('Sin captura');

    const url = `${STORAGE_URL}/${config.supabase.bucket_muestras}/${c.metricas_captura_path}`;
    const upstream = await fetch(url, {
      headers: { 'Authorization': `Bearer ${config.supabase.service_role_key}` },
    });
    if (!upstream.ok) return res.status(404).send('No disponible');

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex, noimageindex');
    upstream.body.pipe(res);
  } catch (e) {
    console.error('[media/captura]', e.message);
    res.status(500).send('Error');
  }
});

router.get('/:id/poster', sesionAuth, async (req, res) => {
  try {
    const muestra = await db.getMuestra(req.params.id);
    // La portada marcada primero: es lo que se ve en la grilla del catálogo, y
    // una portada limpia delataría igual que la pieza entera.
    const rutaPoster = muestra?.watermark_poster_path || muestra?.poster_path;
    if (!rutaPoster) return res.status(404).send('Sin portada');

    const url = `${STORAGE_URL}/${config.supabase.bucket_muestras}/${rutaPoster}`;
    const upstream = await fetch(url, {
      headers: { 'Authorization': `Bearer ${config.supabase.service_role_key}` },
    });
    if (!upstream.ok) return res.status(404).send('No disponible');

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex, noimageindex');
    upstream.body.pipe(res);
  } catch (e) {
    console.error('[media/poster]', e.message);
    res.status(500).send('Error');
  }
});

/**
 * Qué Content-Type anunciar para una pieza.
 *
 * Tiene dos trampas, y las dos terminan en un reproductor en negro:
 *
 * 1. La copia con marca de agua la reescribe ffmpeg, así que SIEMPRE sale mp4 o
 *    jpeg — el `mime` guardado describe el original, no lo que se está
 *    sirviendo.
 * 2. Los .mov de iPhone llevan video H.264, que todo navegador reproduce, pero
 *    Chrome y Firefox rechazan el tipo "video/quicktime". Anunciarlo como mp4
 *    no toca el archivo y lo hace verse en todas partes.
 */
function tipoQueSeSirve(muestra, tipoDeStorage) {
  if (muestra.watermark_path) {
    return String(muestra.mime || '').startsWith('video/') ? 'video/mp4' : 'image/jpeg';
  }
  if (muestra.mime === 'video/quicktime') return 'video/mp4';
  return muestra.mime || tipoDeStorage || 'application/octet-stream';
}

router.get('/:id', sesionAuth, async (req, res) => {
  try {
    const muestra = await db.getMuestra(req.params.id);
    if (!muestra) return res.status(404).send('No encontrada');

    // Se sirve la copia con marca de agua siempre que exista.
    //
    // El original se guarda pero no sale por ninguna ruta: queda para poder
    // regenerar la marca —subirle o bajarle intensidad, corregir un error— sin
    // pedirle a la creadora que vuelva a subir su portafolio.
    //
    // Mientras una pieza no esté marcada se sirve el original: dejar huecos
    // negros en el catálogo sería peor que el riesgo que se intenta cubrir, y
    // el script de marcado se pone al día solo.
    const ruta = muestra.watermark_path || muestra.storage_path;

    const url = `${STORAGE_URL}/${config.supabase.bucket_muestras}/${ruta}`;
    const upstream = await fetch(url, {
      headers: { 'Authorization': `Bearer ${config.supabase.service_role_key}` },
    });

    if (!upstream.ok) {
      console.error(`[media] Storage respondió ${upstream.status} para ${muestra.id}`);
      return res.status(404).send('No disponible');
    }

    res.setHeader('Content-Type',
      tipoQueSeSirve(muestra, upstream.headers.get('content-type')));
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Que no aparezca en resultados de búsqueda ni se indexe la pieza.
    res.setHeader('X-Robots-Tag', 'noindex, noimageindex');

    upstream.body.pipe(res);
  } catch (e) {
    console.error('[media]', e.message);
    res.status(500).send('Error sirviendo la pieza');
  }
});

module.exports = router;
module.exports.tipoQueSeSirve = tipoQueSeSirve;
