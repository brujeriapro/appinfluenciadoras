// Proxy de piezas de contenido de muestra.
//
// Por qué existe: si el catálogo sirviera la URL original del CDN de Instagram
// o TikTok, esa URL llevaría identificadores que permiten llegar al perfil, y
// la identidad oculta se caería sola. Aquí el binario se descarga desde un
// bucket PRIVADO de Supabase Storage con nombre aleatorio y se hace stream al
// navegador. Nunca se devuelve ni se redirige a la URL de Storage.
//
// En esta fase no hay marca de agua (decisión de producto). El proxy es, por
// ahora, lo único que separa "ver la pieza" de "identificar a la creadora": una
// búsqueda inversa de imagen sigue siendo posible. Cuando se agregue el
// watermark, se hace en el pipeline de subida y este archivo no cambia.

const express = require('express');
const fetch = require('node-fetch');
const db = require('./db');
const config = require('./config');
const { sesionAuth } = require('./auth');

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
router.get('/:id/poster', sesionAuth, async (req, res) => {
  try {
    const muestra = await db.getMuestra(req.params.id);
    if (!muestra || !muestra.poster_path) return res.status(404).send('Sin portada');

    const url = `${STORAGE_URL}/${config.supabase.bucket_muestras}/${muestra.poster_path}`;
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

router.get('/:id', sesionAuth, async (req, res) => {
  try {
    const muestra = await db.getMuestra(req.params.id);
    if (!muestra) return res.status(404).send('No encontrada');

    const url = `${STORAGE_URL}/${config.supabase.bucket_muestras}/${muestra.storage_path}`;
    const upstream = await fetch(url, {
      headers: { 'Authorization': `Bearer ${config.supabase.service_role_key}` },
    });

    if (!upstream.ok) {
      console.error(`[media] Storage respondió ${upstream.status} para ${muestra.id}`);
      return res.status(404).send('No disponible');
    }

    // Los .mov que salen de un iPhone llevan video H.264, que todo navegador
    // sabe reproducir — pero Chrome y Firefox rechazan el tipo
    // "video/quicktime" y muestran el reproductor en negro. Anunciarlo como
    // mp4 no cambia el archivo y lo hace verse en todas partes.
    const tipo = muestra.mime === 'video/quicktime'
      ? 'video/mp4'
      : (muestra.mime || upstream.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Type', tipo);
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
